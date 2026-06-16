const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.json());

app.post('/generate-post', async (req, res) => {
  const { template, image, name, features, price } = req.body;
  try {
    const url = `https://templates-lgeet.vercel.app/${template}?name=${encodeURIComponent(name)}&image=${encodeURIComponent(image)}&feat1=${encodeURIComponent(features)}&price=${price}`;
    
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ],
      headless: 'new'
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));
    const base64 = await page.evaluate(() => window.exportPost());
    await browser.close();
    res.json({ success: true, image: base64 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
