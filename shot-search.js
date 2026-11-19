const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://127.0.0.1:8765/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const skip = await page.$('[data-action="ob-skip"]');
  if (skip) { await skip.click(); await page.waitForTimeout(400); }
  await page.click('.tab[data-tab="discover"]');
  await page.waitForTimeout(400);
  await page.click('#sc-discover [data-action="open-search"]');
  await page.waitForTimeout(700);
  await (await page.$('#ov-search')).screenshot({ path: OUT + '/v064-s-default.png' });
  console.log('titles-default:', JSON.stringify(await page.$$eval('#searchBody .sec-title', e => e.map(x => x.textContent))));

  await page.fill('#globalSearch', '露营');
  await page.waitForTimeout(700);
  await (await page.$('#ov-search')).screenshot({ path: OUT + '/v064-s-result.png' });
  console.log('titles-result:', JSON.stringify(await page.$$eval('#searchBody .sec-title', e => e.map(x => x.textContent))));

  const more = await page.$('#searchBody .sr-more');
  if (more) {
    await more.click(); await page.waitForTimeout(400);
    await (await page.$('#ov-search')).screenshot({ path: OUT + '/v064-s-expanded.png' });
    console.log('rows after expand:', (await page.$$('#searchBody .row')).length);
  }

  await page.fill('#globalSearch', 'zzzz');
  await page.waitForTimeout(700);
  await (await page.$('#ov-search')).screenshot({ path: OUT + '/v064-s-empty.png' });
  console.log('ok');
  await browser.close();
})();
