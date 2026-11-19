const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';

(async () => {
  const b = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  });
  const p = await b.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
  await p.goto('http://127.0.0.1:8765/index.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const skip = await p.$('[data-action="ob-skip"]'); if (skip) { await skip.click(); await p.waitForTimeout(400); }
  await p.click('.tab[data-tab="me"]'); await p.waitForTimeout(500);

  // 1) 默认随机号：不该有任何靓号标识
  await p.evaluate(() => { window.DB.state.me.yeyuNum = '88231'; window.DB.state.me.yeyuId = '野遇号：88231'; window.App.renderMe(); });
  await p.waitForTimeout(300);
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v071-me-plain.png' });

  // 2) 至尊豹子号（金）
  await p.evaluate(() => { window.DB.state.me.yeyuNum = '88888'; window.DB.state.me.yeyuId = '野遇号：88888'; window.App.renderMe(); });
  await p.waitForTimeout(300);
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v071-me-gold.png' });
  await (await p.$('.bezel')).screenshot({ path: OUT + '/v071-me-full.png' });

  // 3) 表白号（粉）
  await p.evaluate(() => { window.DB.state.me.yeyuNum = '13145'; window.DB.state.me.yeyuId = '野遇号：13145'; window.App.renderMe(); });
  await p.waitForTimeout(300);
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v071-me-pink.png' });

  // 4) 名片码同步 + 暗色
  await p.click('#meBody .me-head [data-action="my-qr"]'); await p.waitForTimeout(600);
  await (await p.$('#ov-qr .qr-card')).screenshot({ path: OUT + '/v071-qr-nice.png' });
  await p.click('#ov-qr [data-close="ov-qr"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await p.waitForTimeout(300);
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v071-me-dark.png' });

  // 5) 靓号商城：卡片号码应为纯数字
  await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
  await p.click('[data-action="niceid"]'); await p.waitForTimeout(700);
  await (await p.$('#ov-niceid')).screenshot({ path: OUT + '/v072-niceshop.png' });
  console.log('商城号码:', await p.evaluate(() => window.DB.state.niceIds.slice(0, 5).map(n => n.num).join(',')));
  console.log('卡片首号:', await p.$eval('#niceBody .nice-card .nc-num', e => e.textContent.trim()));
  await p.click('#ov-niceid [data-close="ov-niceid"]'); await p.waitForTimeout(300);

  const geo = await p.evaluate(() => {
    const sub = document.querySelector('#meBody .me-hero .me-sub');
    const tag = sub.querySelector('.me-id-tag'), num = sub.querySelector('.me-id-num');
    const r = sub.getBoundingClientRect(), tr = tag.getBoundingClientRect();
    return {
      subH: Math.round(r.height),
      tagW: Math.round(tr.width),
      tagOverflow: Math.round(tr.right - r.right),
      tagText: tag.textContent, numText: num.textContent
    };
  });
  console.log('几何:', JSON.stringify(geo));
  await b.close();
})();
