/* 视觉验证脚本：系统 Chrome 无头截图，浅色 + 暗色双主题关键页面 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const OUT = 'D:/WorkBuddy/output/social-app-prototype/shots';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text()); });

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const skip = await page.$('[data-action="ob-skip"]');
  if (skip) { await skip.click(); await page.waitForTimeout(500); }

  const shot = async (name) => {
    const el = await page.$('.bezel');
    await el.screenshot({ path: OUT + '/' + name + '.png' });
    console.log('shot:', name);
  };
  const clickTab = async (t) => { await page.click('.tab[data-tab="' + t + '"]'); await page.waitForTimeout(350); };

  /* ---------- 浅色 ---------- */
  await shot('01-light-chats');
  await clickTab('discover');
  await shot('02-light-plaza');
  await page.click('[data-action="discover-tab"][data-v="moments"]');
  await page.waitForTimeout(350);
  await shot('03-light-moments');
  await clickTab('chats');
  await page.click('#chatList .row[data-id="c1"]');
  await page.waitForTimeout(500);
  await shot('04-light-chat');
  await page.click('[data-close="ov-chat"]');
  await clickTab('discover');
  await page.click('[data-action="discover-tab"][data-v="plaza"]');
  await page.waitForTimeout(350);
  await page.click('#plazaList .pcard .pcard-hd');
  await page.waitForTimeout(450);
  await shot('05-light-profile');
  await page.click('[data-close="ov-profile"]');
  await page.waitForTimeout(300);
  await clickTab('me');
  await shot('06-light-me');
  await page.click('[data-action="settings"]');
  await page.waitForTimeout(350);
  await shot('07-light-settings');
  /* v0.22：设计规范页（Living Style Guide）浅色三连拍：顶部 / 控件状态 / 状态体系 */
  await page.click('#settingsBody [data-action="design"]');
  await page.waitForTimeout(400);
  await shot('15-light-design-top');
  await page.evaluate(() => { const b = document.querySelector('#designBody .screen-body, #ov-design .screen-body'); if (b) b.scrollTop = 1400; });
  await page.waitForTimeout(300);
  await shot('16-light-design-controls');
  await page.evaluate(() => { const b = document.querySelector('#ov-design .screen-body'); if (b) b.scrollTop = 3400; });
  await page.waitForTimeout(300);
  await shot('17-light-design-states');
  await page.click('[data-close="ov-design"]');
  await page.click('[data-close="ov-settings"]');
  await page.waitForTimeout(300);

  /* v0.23：圈子「我的圈子」浅色——👑 我创建的 / 已加入 归属徽标 */
  await clickTab('circles');
  await page.click('[data-action="circle-tab"][data-v="mine"]');
  await page.waitForTimeout(400);
  await shot('20-light-circles-mine');
  /* v0.24：圈主隐私开关——成员管理面板（浅色，圈主视角）+ 隐藏态（浅色，非圈主视角） */
  await page.click('#circleList .crow[data-id="c-gd-sz-mine"]');
  await page.waitForTimeout(400);
  await page.click('#cdHead [data-action="circle-members"]');
  await page.waitForTimeout(400);
  await shot('22-light-members-privacy');
  /* 圈主正规路径一键关闭，再模拟非圈主视角 */
  await page.click('#cmemTop .cmem-privacy');
  await page.waitForTimeout(350);
  const hiddenProbeL = await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'u1';
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'member' }) : m);
    window.App.renderCircleMembers();
    return { hidden: !!c.membersHidden, owner: c.owner, hasSwitch: !!document.querySelector('#cmemTop .cmem-privacy'), body: document.querySelector('#cmemBody').textContent.slice(0, 20) };
  });
  console.log('hidden-probe-light:', JSON.stringify(hiddenProbeL));
  await page.waitForTimeout(300);
  await shot('23-light-members-hidden');
  await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'me'; c.membersHidden = false;
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'owner' }) : m);
    window.DB.save();
  });
  await page.click('[data-action="cmem-cancel"]');
  await page.click('#ov-circledetail [data-action="circle-back"]');
  await page.waitForTimeout(300);
  /* v0.25：圈主关闭成员发动态——详情页禁发态（浅色，非圈主视角）+ 发布页禁发 chip（浅色） */
  await page.click('#circleList .crow[data-id="c-gd-sz-mine"]');
  await page.waitForTimeout(400);
  await page.click('#cdHead [data-action="circle-members"]');
  await page.waitForTimeout(400);
  await page.click('#cmemTop [data-action="cmem-postperm"]');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'u1';
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'member' }) : m);
    window.App.renderCircleMembers();
  });
  await page.click('[data-action="cmem-cancel"]');
  await page.waitForTimeout(1500);   /* 等操作 toast 淡出（1600ms），避免截图残留矛盾文案 */
  /* 详情页 header/操作条/发布按钮由 openCircleDetail 生成，改身份后必须重渲染才会反映 */
  await page.evaluate(() => window.App.openCircleDetail('c-gd-sz-mine'));
  await page.waitForTimeout(350);
  const banProbeL = await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    const btn = document.querySelector('#ov-circledetail .ov-head [data-action="circle-publish"]');
    return { owner: c.owner, allowMemberPost: c.allowMemberPost, pubBtnHidden: btn ? btn.style.display === 'none' : null, tip: !!document.querySelector('.cd-ban-tip') };
  });
  console.log('ban-probe-L:', JSON.stringify(banProbeL));
  await shot('26-light-detail-ban');
  await page.click('#ov-circledetail [data-action="circle-back"]');
  await page.waitForTimeout(300);
  await clickTab('discover');   /* 发布按钮在「发现」navbar，需先切回该 tab 才可见 */
  await page.click('.nb-right [data-action="publish"]');
  await page.waitForTimeout(450);
  /* 发布页内容较长，圈子选择在底部——先滚到该区域，否则「禁发」chip 会被视口截在下方 */
  await page.evaluate(() => { const el = document.querySelector('#pubCircles'); if (el) el.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(300);
  await shot('27-light-pub-ban');
  await page.click('[data-close="ov-publish"]');
  await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'me'; c.allowMemberPost = true;
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'owner' }) : m);
    window.DB.save();
  });
  await page.waitForTimeout(200);
  await clickTab('me');

  /* ---------- 切暗色 ---------- */
  await page.click('#themeBtn');
  await page.waitForTimeout(600);
  await shot('08-dark-settings');
  await page.click('[data-close="ov-settings"]');
  await clickTab('chats');
  await shot('09-dark-chats');
  await page.click('#chatList .row[data-id="c1"]');
  await page.waitForTimeout(500);
  await shot('10-dark-chat');
  await page.click('[data-close="ov-chat"]');
  await clickTab('discover');
  await shot('11-dark-plaza');
  await page.click('[data-action="discover-tab"][data-v="moments"]');
  await page.waitForTimeout(350);
  await shot('12-dark-moments');
  await clickTab('me');
  await shot('13-dark-me');
  await clickTab('contacts');
  await shot('14-dark-contacts');
  /* v0.23：圈子「我的圈子」暗色——👑 我创建的 / 已加入 归属徽标 */
  await clickTab('circles');
  await page.click('[data-action="circle-tab"][data-v="mine"]');
  await page.waitForTimeout(400);
  await shot('21-dark-circles-mine');
  /* v0.24：圈主隐私开关——成员管理面板（暗色，圈主视角）+ 隐藏态（暗色，非圈主视角） */
  await page.click('#circleList .crow[data-id="c-gd-sz-mine"]');
  await page.waitForTimeout(400);
  await page.click('#cdHead [data-action="circle-members"]');
  await page.waitForTimeout(400);
  await shot('24-dark-members-privacy');
  /* 圈主正规路径一键关闭，再模拟非圈主视角 */
  await page.click('#cmemTop .cmem-privacy');
  await page.waitForTimeout(350);
  const hiddenProbeD = await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'u1';
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'member' }) : m);
    window.App.renderCircleMembers();
    return { hidden: !!c.membersHidden, owner: c.owner, hasSwitch: !!document.querySelector('#cmemTop .cmem-privacy'), body: document.querySelector('#cmemBody').textContent.slice(0, 20) };
  });
  console.log('hidden-probe-dark:', JSON.stringify(hiddenProbeD));
  await page.waitForTimeout(300);
  await shot('25-dark-members-hidden');
  await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'me'; c.membersHidden = false;
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'owner' }) : m);
    window.DB.save();
  });
  await page.click('[data-action="cmem-cancel"]');
  await page.click('#ov-circledetail [data-action="circle-back"]');
  await page.waitForTimeout(300);
  /* v0.25：圈主关闭成员发动态——详情页禁发态（暗色，非圈主视角）+ 发布页禁发 chip（暗色） */
  await page.click('#circleList .crow[data-id="c-gd-sz-mine"]');
  await page.waitForTimeout(400);
  await page.click('#cdHead [data-action="circle-members"]');
  await page.waitForTimeout(400);
  await page.click('#cmemTop [data-action="cmem-postperm"]');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'u1';
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'member' }) : m);
    window.App.renderCircleMembers();
  });
  await page.click('[data-action="cmem-cancel"]');
  await page.waitForTimeout(1500);   /* 等操作 toast 淡出（1600ms），避免截图残留矛盾文案 */
  /* 同浅色段：重渲染详情页以反映身份/权限变化 */
  await page.evaluate(() => window.App.openCircleDetail('c-gd-sz-mine'));
  await page.waitForTimeout(350);
  const banProbeD = await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    const btn = document.querySelector('#ov-circledetail .ov-head [data-action="circle-publish"]');
    return { owner: c.owner, allowMemberPost: c.allowMemberPost, pubBtnHidden: btn ? btn.style.display === 'none' : null, tip: !!document.querySelector('.cd-ban-tip') };
  });
  console.log('ban-probe-D:', JSON.stringify(banProbeD));
  await shot('28-dark-detail-ban');
  await page.click('#ov-circledetail [data-action="circle-back"]');
  await page.waitForTimeout(300);
  await clickTab('discover');   /* 同上：发布按钮在「发现」navbar */
  await page.click('.nb-right [data-action="publish"]');
  await page.waitForTimeout(450);
  /* 同浅色段：滚到圈子选择区再拍 */
  await page.evaluate(() => { const el = document.querySelector('#pubCircles'); if (el) el.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(300);
  await shot('29-dark-pub-ban');
  await page.click('[data-close="ov-publish"]');
  await page.evaluate(() => {
    const c = window.DB.state.circles.find(x => x.id === 'c-gd-sz-mine');
    c.owner = 'me'; c.allowMemberPost = true;
    window.DB.state.circleMembers = window.DB.state.circleMembers.map(m =>
      (m.circleId === 'c-gd-sz-mine' && m.userId === 'me') ? Object.assign({}, m, { role: 'owner' }) : m);
    window.DB.save();
  });
  await page.waitForTimeout(200);
  await clickTab('me');
  /* v0.22：设计规范页暗色 */
  await clickTab('me');
  await page.click('[data-action="settings"]');
  await page.click('#settingsBody [data-action="design"]');
  await page.waitForTimeout(400);
  await shot('18-dark-design-top');
  await page.evaluate(() => { const b = document.querySelector('#ov-design .screen-body'); if (b) b.scrollTop = 1400; });
  await page.waitForTimeout(300);
  await shot('19-dark-design-controls');
  await page.click('[data-close="ov-design"]');
  await page.click('[data-close="ov-settings"]');
  await page.waitForTimeout(300);

  /* 暗色下 CSS 变量落地校验 */
  const probe = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      bg: cs.getPropertyValue('--bg').trim(),
      card: cs.getPropertyValue('--n-0').trim(),
      text: cs.getPropertyValue('--text').trim(),
      sub: cs.getPropertyValue('--sub').trim(),
      line: cs.getPropertyValue('--line').trim(),
      brand: cs.getPropertyValue('--brand').trim(),
      fs14: cs.getPropertyValue('--fs-14').trim(),
      sp4: cs.getPropertyValue('--sp-4').trim(),
      skBase: cs.getPropertyValue('--sk-base').trim()
    };
  });
  console.log('dark tokens:', JSON.stringify(probe));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
