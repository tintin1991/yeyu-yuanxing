const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
const URL = 'http://127.0.0.1:8765/index.html?v=94';

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
  const skip = async () => { const s = await p.$('[data-action="ob-skip"]'); if (s) { await s.click(); await p.waitForTimeout(500); } };

  // 1) 我的页：普通号 + VIP
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  await skip();
  await p.click('.tab[data-tab="me"]'); await p.waitForTimeout(600);
  console.log('默认:', JSON.stringify(await p.evaluate(() => ({
    name: document.querySelector('#meBody .me-name').textContent.trim(),
    idLine: document.querySelector('#meBody .me-sub').textContent.trim(),
    crowns: document.querySelectorAll('#meBody .me-name .badge-vip svg.ico').length
  }))));
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v073-me-plain.png' });

  // 2) 我的页：至尊靓号 + 超长昵称（测挤压）
  await p.evaluate(() => {
    window.DB.state.me.yeyuNum = '88888'; window.DB.state.me.yeyuId = '野遇号：88888';
    window.DB.state.me.name = '复合地基撒防雷接地撒发射点';
    window.App.renderMe();
  });
  await p.waitForTimeout(300);
  console.log('长昵称+靓号:', JSON.stringify(await p.evaluate(() => {
    const nm = document.querySelector('#meBody .me-name');
    const hero = document.querySelector('#meBody .me-hero').getBoundingClientRect();
    const badges = [...nm.querySelectorAll('.badge-vip,.badge-nice')].map(e => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), over: Math.round(r.right - hero.right) };
    });
    const txt = nm.querySelector('.me-nm-txt');
    return {
      badges,
      txtClipped: txt.scrollWidth > txt.clientWidth,
      rowH: Math.round(nm.getBoundingClientRect().height),
      tag: document.querySelector('#meBody .me-sub .me-id-tag').textContent.trim()
    };
  })));
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v073-me-long.png' });

  // 3) 名片码
  await p.click('#meBody .me-head [data-action="my-qr"]'); await p.waitForTimeout(700);
  await (await p.$('#ov-qr .qr-card')).screenshot({ path: OUT + '/v073-qr.png' });
  await p.click('#ov-qr [data-close="ov-qr"]'); await p.waitForTimeout(300);

  // 4) 靓号商城：稀有度标签仍在
  await p.click('#meBody .mc[data-action="niceid"]'); await p.waitForTimeout(700);
  console.log('商城标签:', await p.evaluate(() => [...document.querySelectorAll('#niceBody .nc-tag')].slice(0, 6).map(e => e.textContent).join(',')));
  await (await p.$('#ov-niceid')).screenshot({ path: OUT + '/v073-niceshop.png' });
  await p.click('#ov-niceid [data-close="ov-niceid"]'); await p.waitForTimeout(300);

  // 5) 好友列表：昵称后徽章
  await p.click('.tab[data-tab="contacts"]'); await p.waitForTimeout(600);
  console.log('好友页徽章:', JSON.stringify(await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#contactList .row')].slice(0, 6);
    return rows.map(r => {
      const b = r.querySelector('.badge-vip,.badge-nice');
      return b ? { t: b.textContent.trim(), svg: !!b.querySelector('svg.ico'), w: Math.round(b.getBoundingClientRect().width) } : null;
    }).filter(Boolean);
  })));
  await (await p.$('#contactList')).screenshot({ path: OUT + '/v073-contacts.png' });

  // 6) 暗色
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await p.click('.tab[data-tab="me"]'); await p.waitForTimeout(500);
  await (await p.$('#meBody .me-hero')).screenshot({ path: OUT + '/v073-me-dark.png' });
  await b.close();
})();
