const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.json({ limit: '50mb' }));

let watermarkPngCache = null;

async function getWatermarkPng(browser) {
  if (watermarkPngCache) return watermarkPngCache;

  const page = await browser.newPage();
  await page.setViewport({ width: 884, height: 718 });

  const html = `<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; }
body { background: transparent; width: 884px; height: 718px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
canvas { display:block; }
</style>
</head>
<body>
<canvas id="c" width="884" height="718"></canvas>
<script>
async function draw() {
  await document.fonts.ready;
  // جرب تحمل خط Cairo
  try {
    await document.fonts.load('900 150px Cairo');
    await document.fonts.load('400 150px "Noto Naskh Arabic"');
  } catch(e) {}
  
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  
  // ارسم النص
  ctx.save();
  ctx.font = '900 150px Cairo, "Noto Naskh Arabic", Arial, sans-serif';
  ctx.fillStyle = '#d2d2d2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // نفس الـ transform من الـ SVG الأصلي
  ctx.setTransform(1.001, 0.003, -0.003, 0.895, -72.825 + 442, 236.134);
  ctx.fillText('لگيت', 0, 0);
  ctx.restore();
  
  document.title = 'done';
}
draw();
</script>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
  
  // انتظر حتى يخلص الرسم
  await page.waitForFunction(() => document.title === 'done', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  const png = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: 884, height: 718 },
    omitBackground: true
  });

  await page.close();
  watermarkPngCache = 'data:image/png;base64,' + png.toString('base64');
  return watermarkPngCache;
}

async function renderPage(browser, url) {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

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

  const watermarkPng = await getWatermarkPng(browser);

  await page.evaluate((wmPng) => {
    const original = window.exportPost;
    window.exportPost = async function() {

      const productImg = document.querySelector('#product-zone img');
      const productSrc = productImg ? productImg.src : null;

      // أصلح الـ ✓
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

      if (productImg) productImg.style.visibility = 'hidden';
      const result = await original.call(this);
      if (productImg) productImg.style.visibility = '';

      document.getElementById('fix-before')?.remove();
      document.querySelectorAll('.check-svg').forEach(s => s.remove());

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = 2400;
      finalCanvas.height = 2400;
      const ctx = finalCanvas.getContext('2d');

      // 1. ارسم الـ base
      await new Promise(resolve => {
        const base = new Image();
        base.onload = () => { ctx.drawImage(base, 0, 0); resolve(); };
        base.onerror = resolve;
        base.src = result;
      });

      // 2. ارسم صورة المنتج
      if (productSrc) {
        await new Promise(resolve => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const s = 4;
            const zoneSize = 400 * s;
            const cx = 300 * s;
            const cy = 300 * s;
            const zoneX = cx - zoneSize / 2;
            const zoneY = cy - zoneSize / 2;
            const ratio = Math.min(zoneSize / img.naturalWidth, zoneSize / img.naturalHeight);
            const dw = img.naturalWidth * ratio;
            const dh = img.naturalHeight * ratio;
            const dx = zoneX + (zoneSize - dw) / 2;
            const dy = zoneY + (zoneSize - dh) / 2;
            ctx.drawImage(img, dx, dy, dw, dh);
            resolve();
          };
          img.onerror = resolve;
          img.src = productSrc;
        });
      }

      // 3. ارسم الواترمارك
      if (wmPng) {
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
          wm.src = wmPng;
        });
      }

      return finalCanvas.toDataURL('image/png');
    };
  }, watermarkPng);

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
