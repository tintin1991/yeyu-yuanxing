const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
const URL = 'http://127.0.0.1:8765/index.html?v=96';

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 376, height: 770 }, deviceScaleFactor: 2 });

  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  // 跳过 onboarding 浮层
  const skip = await p.$('[data-action="ob-skip"]');
  if (skip) { await skip.click(); await p.waitForTimeout(600); }

  // 切到圈子 tab
  await p.click('.tab[data-tab="circles"]'); await p.waitForTimeout(800);

  await p.screenshot({ path: OUT + '/v076-circles-obstruct-check.png' });
  console.log('shot done');

  // 打印圈子列表第一个卡片的可见性与遮挡情况
  const info = await p.evaluate(() => {
    const list = document.querySelector('#circleList');
    const firstCard = list && list.querySelector('.row, .circ-card, [class*="card"]');
    const overlays = [...document.querySelectorAll('.overlay')].filter(o => o.classList.contains('show')).map(o => o.id);
    return {
      overlayShown: overlays,
      firstCardClass: firstCard ? firstCard.className : null,
      firstCardText: firstCard ? firstCard.textContent.slice(0, 40) : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await b.close();
})();
