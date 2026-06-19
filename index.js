const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.json({ limit: '50mb' }));

async function renderPage(browser, url) {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

  // انتظر الخطوط والصور
  await page.evaluate(() => new Promise((resolve) => {
    const timeout = setTimeout(resolve, 10000);
    Promise.all([
      document.fonts.ready,
      new Promise(r => {
        const imgs = document.querySelectorAll('img');
        if (imgs.length === 0) return r();
        let loaded = 0;
        const done = () => { loaded++; if (loaded === imgs.length) r(); };
        imgs.forEach(img => {
          if (img.complete && img.naturalWidth > 0) done();
          else { img.onload = done; img.onerror = done; }
        });
      })
    ]).then(() => { clearTimeout(timeout); resolve(); }).catch(resolve);
  }));

  await page.evaluate(() => {
    const original = window.exportPost;
    window.exportPost = async function() {

      // 1. حول صورة المنتج لـ base64 محلي عشان html2canvas يشوفها
      const productImg = document.querySelector('#product-zone img');
      if (productImg && productImg.src && !productImg.src.startsWith('data:')) {
        await new Promise((resolve) => {
          const c = document.createElement('canvas');
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            try { productImg.src = c.toDataURL('image/png'); } catch(e){}
            resolve();
          };
          img.onerror = resolve;
          img.src = productImg.src + (productImg.src.includes('?') ? '&' : '?') + 't=' + Date.now();
        });
        // انتظر إضافي للصورة تتحدث
        await new Promise(r => setTimeout(r, 500));
      }

      // 2. أصلح الـ ✓
      const styleEl = document.createElement('style');
      styleEl.id = 'fix-before';
      styleEl.textContent = '.info-feat::before { display: none !important; }';
      document.head.appendChild(styleEl);

      document.querySelectorAll('.info-feat').forEach(el => {
        if (el.querySelector('.check-svg')) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '11');
        svg.setAttribute('height', '11');
        svg.setAttribute('viewBox', '0 0 12 12');
        svg.classList.add('check-svg');
        svg.style.cssText = 'display:inline-block;vertical-align:middle;margin-right:3px;flex-shrink:0;';
        svg.innerHTML = '<polyline points="2,6 5,9 10,3" fill="none" stroke="#7fa8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        el.insertBefore(svg, el.firstChild);
      });

      // 3. احفظ الواترمارك src قبل ما exportPost يخفيه
      const wmEl = document.getElementById('watermark-img');
      const wmSrc = wmEl ? wmEl.src : null;

      // 4. شغّل الـ exportPost الأصلي
      const result = await original.call(this);

      // تنظيف
      document.getElementById('fix-before')?.remove();
      document.querySelectorAll('.check-svg').forEach(s => s.remove());

      // 5. أضيف الواترمارك يدوياً على الـ canvas النهائي
      if (wmSrc && result) {
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = 2400;
        finalCanvas.height = 2400;
        const ctx = finalCanvas.getContext('2d');

        // ارسم الصورة الأصلية
        await new Promise(resolve => {
          const base = new Image();
          base.onload = () => { ctx.drawImage(base, 0, 0); resolve(); };
          base.onerror = resolve;
          base.src = result;
        });

        // ارسم الواترمارك
        await new Promise(resolve => {
          const wm = new Image();
          wm.onload = () => {
            const s = 4;
            ctx.save();
            ctx.globalAlpha = 0.07;
            ctx.drawImage(wm, (300-202)*s, (300-128.5)*s, 540*s, 439*s);
            ctx.restore();
            resolve();
          };
          wm.onerror = resolve;
          wm.src = wmSrc;
        });

        return finalCanvas.toDataURL('image/png');
      }

      return result;
    };
  });

  await new Promise(r => setTimeout(r, 3000));

  const base64 = await page.evaluate(() => window.exportPost(), { timeout: 90000 });
  await page.close();
  return base64;
}

app.post('/generate-post', async (req, res) => {
  try {
    const { image, name, feature1, feature2, feature3, price } = req.body;
    console.log('REQUEST BODY:', { image, name, price, feature1, feature2, feature3 });

    const browser = await puppeteer.launch({
      headless: 'new',
      protocolTimeout: 180000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const baseUrl = 'https://templates-lgeet.vercel.app';
    const query =
      `name=${encodeURIComponent(name || '')}` +
      `&price=${encodeURIComponent(price || '')}` +
      `&feat1=${encodeURIComponent(feature1 || '')}` +
      `&feat2=${encodeURIComponent(feature2 || '')}` +
      `&feat3=${encodeURIComponent(feature3 || '')}` +
      `&image=${encodeURIComponent(image || '')}`;

    const instagramBase64 = await renderPage(browser, `${baseUrl}/lgeet-temp-instagram?${query}`);
    const tiktokBase64 = await renderPage(browser, `${baseUrl}/lgeet-temp-tiktok?${query}`);

    await browser.close();
    res.json({ success: true, instagram: instagramBase64, tiktok: tiktokBase64 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
