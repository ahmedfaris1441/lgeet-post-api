const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.json({ limit: '50mb' }));

async function renderPage(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

  // نجبر الخطوط تتحمل عن طريق render نص invisible
  await page.evaluate(async () => {
    // إنشاء element مخفي يستخدم كل أوزان الخط
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;font-family:Cairo,sans-serif;';
    el.innerHTML = `
      <span style="font-weight:400">✓ test</span>
      <span style="font-weight:600">✓ test</span>
      <span style="font-weight:700">✓ test</span>
      <span style="font-weight:900">✓ test</span>
    `;
    document.body.appendChild(el);

    // انتظر الخطوط
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 16px Cairo'),
      document.fonts.load('600 16px Cairo'),
      document.fonts.load('700 16px Cairo'),
      document.fonts.load('900 16px Cairo'),
      document.fonts.load('400 16px Noto Naskh Arabic'),
      document.fonts.load('700 16px Noto Naskh Arabic'),
    ]);

    document.body.removeChild(el);
  });

  // انتظر الصور
  await page.evaluate(() => new Promise((resolve) => {
    const imgs = document.querySelectorAll('img');
    if (imgs.length === 0) return resolve();
    let loaded = 0;
    imgs.forEach(img => {
      if (img.complete) { loaded++; if (loaded === imgs.length) resolve(); }
      else { img.onload = img.onerror = () => { loaded++; if (loaded === imgs.length) resolve(); }; }
    });
  }));

  // انتظر إضافي
  await new Promise(r => setTimeout(r, 5000));

  const base64 = await page.evaluate(() => window.exportPost());
  await page.close();
  return base64;
}

app.post('/generate-post', async (req, res) => {
  try {
    const { image, name, feature1, feature2, feature3, price } = req.body;

    console.log('REQUEST BODY:', { image, name, price, feature1, feature2, feature3 });

    const browser = await puppeteer.launch({
      headless: 'new',
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

    const instagramBase64 = await renderPage(browser, `${baseUrl}/lgeet-temp-instagram.html?${query}`);
    const tiktokBase64 = await renderPage(browser, `${baseUrl}/lgeet-temp-tiktok.html?${query}`);

    await browser.close();

    res.json({ success: true, instagram: instagramBase64, tiktok: tiktokBase64 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
