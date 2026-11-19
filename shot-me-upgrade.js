const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
const URL = 'http://127.0.0.1:8765/index.html?v=95';

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
  const skip = async () => { const s = await p.$('[data-action="ob-skip"]'); if (s) { await s.click(); await p.waitForTimeout(500); } };

  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  await skip();
  await p.click('.tab[data-tab="me"]'); await p.waitForTimeout(600);

  // 浅色 - 整屏 + 身份卡特写
  await (await p.$('.phone')).screenshot({ path: OUT + '/v076-me-upgrade-full.png' });
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v076-me-upgrade-hero.png' });

  // 暗色
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await p.waitForTimeout(500);
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v076-me-upgrade-dark.png' });

  await b.close();
})();
