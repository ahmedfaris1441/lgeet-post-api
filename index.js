const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

app.use(express.json({ limit: '50mb' }));

app.post('/generate-post', async (req, res) => {
  try {

    const {
      image,
      name,
      feature1,
      feature2,
      feature3,
      price
    } = req.body;

    console.log('========================');
    console.log('REQUEST BODY');
    console.log({
      image,
      name,
      price,
      feature1,
      feature2,
      feature3
    });
    console.log('========================');

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

    const query =
      `name=${encodeURIComponent(name || '')}` +
      `&price=${encodeURIComponent(price || '')}` +
      `&feat1=${encodeURIComponent(feature1 || '')}` +
      `&feat2=${encodeURIComponent(feature2 || '')}` +
      `&feat3=${encodeURIComponent(feature3 || '')}` +
      `&image=${encodeURIComponent(image || '')}`;

    console.log('INSTAGRAM URL:');
    console.log(`${baseUrl}/lgeet-temp-instagram.html?${query}`);

    console.log('TIKTOK URL:');
    console.log(`${baseUrl}/lgeet-temp-tiktok.html?${query}`);

    // Instagram
    const igPage = await browser.newPage();

    await igPage.goto(
      `${baseUrl}/lgeet-temp-instagram.html?${query}`,
      {
        waitUntil: 'networkidle0',
        timeout: 60000
      }
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    const instagramBase64 = await igPage.evaluate(() => {
      return window.exportPost();
    });

    await igPage.close();

    // TikTok
    const ttPage = await browser.newPage();

    await ttPage.goto(
      `${baseUrl}/lgeet-temp-tiktok.html?${query}`,
      {
        waitUntil: 'networkidle0',
        timeout: 60000
      }
    );

    await new Promise(resolve => setTimeout(resolve, 2000));

    const tiktokBase64 = await ttPage.evaluate(() => {
      return window.exportPost();
    });

    await ttPage.close();

    await browser.close();

    res.json({
      success: true,
      instagram: instagramBase64,
      tiktok: tiktokBase64
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });

  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
