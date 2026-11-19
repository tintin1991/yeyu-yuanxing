const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
  await p.goto('http://127.0.0.1:8765/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const skip = await p.$('[data-action="ob-skip"]'); if (skip) { await skip.click(); await p.waitForTimeout(500); }
  await p.click('.tab[data-tab="discover"]'); await p.waitForTimeout(500);
  await (await p.$('#sc-discover')).screenshot({ path: OUT + '/v065-plaza.png' });

  // 打开发布页（默认态）
  await p.click('#sc-discover .nb-right [data-action="publish"]'); await p.waitForTimeout(600);
  await (await p.$('#ov-publish')).screenshot({ path: OUT + '/v065-pub-default.png' });

  // 勾选一个圈子 + 选仅自己可见
  const c1 = await p.$('#pubCircles .pub-c');
  if (c1) { await c1.click(); await p.waitForTimeout(300); }
  await (await p.$('#ov-publish')).screenshot({ path: OUT + '/v065-pub-picked.png' });
  await p.click('#pubVis [data-action="pub-vis"][data-v="private"]'); await p.waitForTimeout(400);
  await (await p.$('#ov-publish')).screenshot({ path: OUT + '/v065-pub-private.png' });

  // 好友 Tab：应无发布入口
  await p.click('[data-close="ov-publish"]'); await p.waitForTimeout(400);
  await p.click('#discoverTabs .subtab[data-v="friends"]'); await p.waitForTimeout(500);
  await (await p.$('#sc-discover')).screenshot({ path: OUT + '/v065-friends.png' });
  await b.close();
  console.log('shots ok');
})();
