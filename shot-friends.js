const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
  await page.goto('http://127.0.0.1:8765/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const skip = await page.$('[data-action="ob-skip"]');
  if (skip) { await skip.click(); await page.waitForTimeout(400); }
  await page.click('.tab[data-tab="discover"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="discover-tab"][data-v="friends"]');
  await page.waitForTimeout(600);
  await (await page.$('.bezel')).screenshot({ path: OUT + '/v063-friends.png' });
  console.log('ok');
  await browser.close();
})();
