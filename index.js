const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

app.post('/generate-post', async (req, res) => {

  const {
    image,
    name,
    feature1,
    feature2,
    feature3,
    price
  } = req.body;

  try {

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const baseUrl = 'https://templates-lgeet.vercel.app';

    const params =
      `name=${encodeURIComponent(name)}` +
      `&image=${encodeURIComponent(image)}` +
      `&price=${encodeURIComponent(price)}` +
      `&feat1=${encodeURIComponent(feature1 || '')}` +
      `&feat2=${encodeURIComponent(feature2 || '')}` +
      `&feat3=${encodeURIComponent(feature3 || '')}`;

    // Instagram
    const igPage = await browser.newPage();

    await igPage.goto(
      `${baseUrl}/lgeet-temp-instagram.html?${params}`,
      {
        waitUntil: 'networkidle0',
        timeout: 60000
      }
    );

    await new Promise(r => setTimeout(r, 2000));

    const instagramBase64 =
      await igPage.evaluate(() => window.exportPost());

    await igPage.close();

    // TikTok
    const ttPage = await browser.newPage();

    await ttPage.goto(
      `${baseUrl}/lgeet-temp-tiktok.html?${params}`,
      {
        waitUntil: 'networkidle0',
        timeout: 60000
      }
    );

    await new Promise(r => setTimeout(r, 2000));

    const tiktokBase64 =
      await ttPage.evaluate(() => window.exportPost());

    await ttPage.close();

    await browser.close();

    res.json({
      success: true,
      instagram: instagramBase64,
      tiktok: tiktokBase64
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
