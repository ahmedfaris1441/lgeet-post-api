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

  // حقن التعديل البصري (تكبير 5% لتيك توك فقط)
  await page.addStyleTag({
    content: `
      .info-feat::before { display: none !important; }
      ${url.includes('tiktok') ? `
        #product-zone img {
          transform: scale(1.05) !important;
          transform-origin: center center !important;
        }
      ` : ''}
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

    // استدعاء دالة التصدير الأصلية في القالب
    return await window.exportPost();
  });

  await page.close();
  return base64;
}

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
    const tiktokBase64 = await renderPage(browser, `${baseUrl}/lgeet-temp-tiktok?${query}`);

    await browser.close();
    res.json({ success: true, instagram: instagramBase64, tiktok: tiktokBase64 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
