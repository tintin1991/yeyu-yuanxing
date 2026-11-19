const { chromium } = require('playwright-core');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
const URL = 'http://127.0.0.1:8765/index.html?v=' + Date.now();

(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 3 });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const skip = await p.$('[data-action="ob-skip"]'); if (skip) { await skip.click(); await p.waitForTimeout(500); }

  // 造一条 5 图的动态，验证轮播与页码
  await p.evaluate(() => {
    const m = { id: 'k670', userId: 'u3', text: '鳌太五日重装实拍，五天里天气只给了我们两个晴天。装备清单我放评论区了。',
      imgs: [{g:'g1',e:'⛺️'},{g:'g3',e:'🚴'},{g:'g6',e:'🌅'},{g:'g12',e:'🏔️'},{g:'g11',e:'🛶'}],
      loc: '陕西·鳌山', visibility: 'public', circles: [], likes: ['u1','u5'], comments: [], ts: Date.now() - 3600e3, tags: ['徒步'] };
    window.DB.state.moments.unshift(m);
    window.App.openPostDetail('moment', 'k670');
  });
  await p.waitForTimeout(600);
  await (await p.$('#ov-post-detail')).screenshot({ path: OUT + '/v070-detail-1.png' });

  const info = await p.evaluate(() => {
    const ov = document.querySelector('#ov-post-detail').getBoundingClientRect();
    const gal = document.querySelector('.pd-gal').getBoundingClientRect();
    const tb = document.querySelector('.pd-topbar').getBoundingClientRect();
    const btn = document.querySelector('.pd-topbar .pd-tb-btn').getBoundingClientRect();
    const tr = document.querySelector('#pdGalTrack');
    // 顶栏按钮中心点上命中测试：确认浮在图片之上、可点
    const hit = document.elementFromPoint(btn.x + btn.width / 2, btn.y + btn.height / 2);
    return {
      ovH: Math.round(ov.height), galH: Math.round(gal.height),
      galRatio: +(gal.height / ov.height).toFixed(2),
      tbH: Math.round(tb.height), btnW: Math.round(btn.width), btnH: Math.round(btn.height),
      hitInsideTopbar: !!(hit && hit.closest('.pd-topbar')),
      hitTag: hit ? hit.tagName + '.' + hit.className : null,
      scrollable: tr.scrollWidth > tr.clientWidth + 4,
      pages: tr.children.length,
      dotN: document.querySelectorAll('#pdDots .pd-dot').length,
      dotOn: Array.prototype.findIndex.call(document.querySelectorAll('#pdDots .pd-dot'), e => e.classList.contains('on')),
      dotsBox: (() => { const r = document.querySelector('#pdDots').getBoundingClientRect(); const g = document.querySelector('.pd-gal').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), cxOff: Math.round((r.x + r.width / 2) - (g.x + g.width / 2)), bottomGap: Math.round(g.bottom - r.bottom) }; })(),
      dotsHit: (() => { const r = document.querySelector('#pdDots').getBoundingClientRect(); const el = document.elementFromPoint(r.x + 4, r.y + r.height / 2); return el ? el.tagName + '.' + el.className : null; })(),
      galTopVsTb: Math.round(gal.y - tb.y - tb.height),   // 图片顶部必须在顶栏下方（>=0 才不遮挡）
      tbName: (document.querySelector('#pdTbName').textContent || '').trim(),
      hasAuthorCard: !!document.querySelector('.pd-author')
    };
  });
  console.log('几何:', JSON.stringify(info));

  // 滑到第 3 张
  await p.evaluate(() => {
    const tr = document.querySelector('#pdGalTrack');
    tr.scrollTo({ left: tr.clientWidth * 2, behavior: 'smooth' });
  });
  await p.waitForTimeout(800);
  console.log('滑动后高亮点下标:', await p.evaluate(() => Array.prototype.findIndex.call(document.querySelectorAll('#pdDots .pd-dot'), e => e.classList.contains('on'))));
  await (await p.$('#ov-post-detail')).screenshot({ path: OUT + '/v070-detail-3.png' });

  // 点第 2 个圆点：应直接跳到第 2 张
  await p.click('#pdDots .pd-dot:nth-child(2)');
  await p.waitForTimeout(700);
  console.log('点第2个圆点后:', await p.evaluate(() => {
    const tr = document.querySelector('#pdGalTrack');
    return { idx: Math.round(tr.scrollLeft / tr.clientWidth), on: Array.prototype.findIndex.call(document.querySelectorAll('#pdDots .pd-dot'), e => e.classList.contains('on')) };
  }));
  await (await p.$('#ov-post-detail')).screenshot({ path: OUT + '/v070-detail-dot.png' });

  // 滚到正文：顶栏应固定不动
  await p.evaluate(() => { document.querySelector('#ov-post-detail .screen-body').scrollTop = 420; });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const tb = document.querySelector('.pd-topbar').getBoundingClientRect();
    const ov = document.querySelector('#ov-post-detail').getBoundingClientRect();
    return { topOffset: Math.round(tb.y - ov.y) };
  });
  console.log('正文滚动后顶栏相对浮层顶部偏移:', JSON.stringify(after));
  await (await p.$('#ov-post-detail')).screenshot({ path: OUT + '/v070-detail-scroll.png' });

  // 暗色
  await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); window.App.renderPostDetail(); });
  await p.waitForTimeout(500);
  await (await p.$('#ov-post-detail')).screenshot({ path: OUT + '/v070-detail-dark.png' });

  await b.close();
})();
