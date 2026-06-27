const express = require('express');
const puppeteer = require('puppeteer');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Railway (وأي Reverse Proxy) يمرر البروتوكول الحقيقي عبر x-forwarded-proto.
// بدون هذا الإعداد يقرأ Express دائماً "http" بدلاً من "https".
app.set('trust proxy', true);

app.use(express.json({ limit: '50mb' }));

// ── Uploads directory setup ──────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded files publicly
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Multer configuration ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = crypto.randomUUID() + ext;
    cb(null, uniqueName);
  }
});

const ALLOWED_MIMETYPES = new Set(['video/mp4']);

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && !ALLOWED_MIMETYPES.has(file.mimetype)) {
      return cb(new Error('Only image files (JPG, JPEG, PNG, WEBP) and MP4 videos are accepted'), false);
    }
    cb(null, true);
  }
});

// ── Existing state ───────────────────────────────────────────────────────────
let lastTemplate = null;

// ── Existing helper ───────────────────────────────────────────────────────────
async function renderPage(browser, url) {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  // ✅ FIX 1: viewport must match each template's real dimensions
  const isTikTok = url.includes('tiktok');
  await page.setViewport({
    width:             isTikTok ? 675  : 600,
    height:            isTikTok ? 1200 : 600,
    deviceScaleFactor: 1
  });

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

  // ✅ FIX 2: inject CSS that forces UNIFORM scaling on the product image.
  //    - We replace width:100%;height:100% with max-width/max-height + auto
  //    - This guarantees the browser respects the image's natural aspect ratio
  //    - No axis is ever stretched independently
  await page.addStyleTag({
    content: `
      .info-feat::before { display: none !important; }

      /* ── CORE FIX: preserve original aspect ratio on every platform ── */
      #product-zone {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      #product-zone img {
        width: auto !important;
        height: auto !important;
        max-width: 100% !important;
        max-height: 100% !important;
        object-fit: contain !important;
        display: block !important;
      }
    `
  });

  // تنفيذ التصدير مباشرة من القالب (بدون تدخل يدوي يغير الحجم)
  const base64 = await page.evaluate(async () => {
    // التأكد من إضافة الـ SVG
    document.querySelectorAll('.info-feat').forEach(el => {
      if (!el.querySelector('.check-svg')) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '11');
        svg.setAttribute('height', '11');
        svg.setAttribute('viewBox', '0 0 12 12');
        svg.classList.add('check-svg');
        svg.style.cssText = 'display:inline-block;vertical-align:middle;margin-right:3px;flex-shrink:0;';
        svg.innerHTML = '<polyline points="2,6 5,9 10,3" fill="none" stroke="#7fa8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        el.insertBefore(svg, el.firstChild);
      }
    });

    // ✅ FIX 3: before exporting, verify the product image is loaded at its
    //    natural dimensions and has not been stretched on either axis.
    const productImg = document.querySelector('#product-zone img');
    if (productImg && productImg.complete && productImg.naturalWidth > 0) {
      const zone      = document.getElementById('product-zone');
      const zoneW     = zone.offsetWidth;
      const zoneH     = zone.offsetHeight;
      const natW      = productImg.naturalWidth;
      const natH      = productImg.naturalHeight;

      // Compute uniform scale that fits inside the zone (contain logic, explicit)
      const scale     = Math.min(zoneW / natW, zoneH / natH);
      const drawW     = natW * scale;
      const drawH     = natH * scale;

      // Apply explicit pixel dimensions so html2canvas cannot distort them
      productImg.style.width  = drawW + 'px';
      productImg.style.height = drawH + 'px';
      productImg.style.maxWidth  = 'none';
      productImg.style.maxHeight = 'none';
    }

    return await window.exportPost();
  });

  await page.close();
  return base64;
}

// ── NEW: Generic image upload endpoint ───────────────────────────────────────
app.post('/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image provided. Send a file under the field name "image".' });
    }

    // نقرأ البروتوكول من x-forwarded-proto إن وُجد (Railway يضبطه على https).
    // إذا لم يكن موجوداً نفرض https كقيمة افتراضية آمنة.
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl  = `${protocol}://${req.get('host')}`;
    const url      = `${baseUrl}/uploads/${req.file.filename}`;

    return res.json({ success: true, url });
  });
});

// ── Existing endpoints (unchanged) ───────────────────────────────────────────
app.post('/generate-post', async (req, res) => {
  try {
    const { image, name, feature1, feature2, feature3, price } = req.body;
    const browser = await puppeteer.launch({
      headless: 'new',
      protocolTimeout: 180000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const baseUrl = 'https://templates-lgeet.vercel.app';
    const query = `name=${encodeURIComponent(name || '')}&price=${encodeURIComponent(price || '')}&feat1=${encodeURIComponent(feature1 || '')}&feat2=${encodeURIComponent(feature2 || '')}&feat3=${encodeURIComponent(feature3 || '')}&image=${encodeURIComponent(image || '')}`;

    const instagramBase64 = await renderPage(browser, `${baseUrl}/lgeet-temp-instagram?${query}`);
    const tiktokBase64    = await renderPage(browser, `${baseUrl}/lgeet-temp-tiktok?${query}`);

    await browser.close();

    lastTemplate = {
      instagram: instagramBase64,
      tiktok: tiktokBase64,
      createdAt: Date.now()
    };

    res.json({ success: true, instagram: instagramBase64, tiktok: tiktokBase64 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/save-last-template', (req, res) => {
  const { instagram, tiktok } = req.body;
  if (!instagram || !tiktok) {
    return res.status(400).json({ success: false });
  }
  lastTemplate = {
    instagram,
    tiktok,
    createdAt: Date.now()
  };
  res.json({ success: true });
});

app.get('/last-template', (req, res) => {
  if (!lastTemplate) {
    return res.status(404).json({ success: false, message: 'No template available' });
  }
  res.json({
    success: true,
    instagram: lastTemplate.instagram,
    tiktok: lastTemplate.tiktok,
    createdAt: lastTemplate.createdAt
  });
});

// ── Automatic uploads cleanup ────────────────────────────────────────────────
// Runs every hour. Deletes files older than 24 hours. Never crashes the server.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;      // 1 hour
const MAX_FILE_AGE_MS     = 24 * 60 * 60 * 1000; // 24 hours

function cleanupUploads() {
  fs.readdir(UPLOADS_DIR, (readErr, files) => {
    if (readErr) {
      // Directory unreadable — skip this cycle silently
      return;
    }

    const now = Date.now();

    files.forEach((filename) => {
      const filepath = path.join(UPLOADS_DIR, filename);

      fs.stat(filepath, (statErr, stats) => {
        if (statErr) {
          // File may have already been deleted or is inaccessible — ignore
          return;
        }

        const ageMs = now - stats.mtimeMs;

        if (ageMs > MAX_FILE_AGE_MS) {
          fs.unlink(filepath, (unlinkErr) => {
            if (unlinkErr) {
              // Could not delete — skip silently, never crash
              return;
            }
            console.log(`[cleanup] Deleted expired upload: ${filename}`);
          });
        }
      });
    });
  });
}

// Run once at startup to clear any leftovers from a previous process,
// then repeat every hour.
cleanupUploads();
setInterval(cleanupUploads, CLEANUP_INTERVAL_MS);

app.listen(3000, () => console.log('Server running on port 3000'));
