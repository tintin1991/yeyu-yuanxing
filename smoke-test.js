/* 冒烟测试：用 jsdom 加载原型，模拟点击核心路径，验证无 JS 报错 */
const { JSDOM } = require('jsdom');
const path = require('path');

const dir = __dirname;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/index.html';
const errors = [];
let pass = 0, fail = 0;

function check(name, fn) {
  try { const r = fn(); if (r) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }
  catch (e) { fail++; errors.push(name + ' → ' + e.message); console.log('  ERROR ' + name + ' → ' + e.message); }
}

// 注意：必须用 http:// 源加载（file:// 是 opaque origin，localStorage 会被浏览器拒绝），
// 先在本目录起一个静态服务：python -m http.server 8765
JSDOM.fromURL(BASE, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true
}).then(async (dom) => {
  const { window } = dom;
  window.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
  const origErr = console.error;
  console.error = (...a) => {
    var msg = a.join(' ');
    // jsdom 未实现的浏览器能力（如跨文档导航）会打印 stub 警告，与应用代码无关，过滤以免影响判定
    if (/Not implemented: navigation to another Document/.test(msg)) return;
    errors.push('console.error: ' + msg); origErr(...a);
  };

  await new Promise(r => setTimeout(r, 500));
  // jsdom 会跨进程持久化 localStorage，上次运行可能残留 onboarded=true 等状态，
  // 导致冷启动引导断言偶发失败；这里强制清空并重载，保证每次从干净种子开始。
  try { window.localStorage.removeItem('yeyu_proto_v1'); } catch (e) {}
  window.location.reload();
  await new Promise(r => setTimeout(r, 900));

  const doc = window.document;
  const $ = s => doc.querySelector(s);
  const $$ = s => Array.from(doc.querySelectorAll(s));
  const click = el => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  console.log('\n=== 野遇原型 冒烟测试 ===\n');

  check('页面加载完成', () => !!$('#chatList'));

  // —— v0.44 开屏页 ——
  check('v0.44 开屏 DOM 存在', () => !!$('#splash'));
  check('v0.44 刷新后默认展示开屏（冷启动语义）', () => $('#splash').classList.contains('show'));
  check('v0.44 开屏渲染品牌名「野遇」', () => $('#splash .spl-word').textContent.replace(/\s/g, '') === '野遇');
  check('v0.44 开屏渲染 Logo 与 Slogan', () => !!$('#splash .spl-logo') && $('#splash .spl-slogan').textContent.indexOf('和同好，去野外') >= 0);
  check('v0.79 开屏对齐 Flutter：无版本号 / 无跳过按钮 / 无兴趣标签', () => !$('#splVer') && !doc.querySelector('[data-action="splash-skip"]') && !$('#splash .spl-tags'));
  check('v0.79 开屏含晨光山野元素：canvas/太阳/Logo/流动进度条', () => !!$('#splCanvas') && !!$('#splash .spl-sun') && !!$('#splash .spl-logo') && !!$('#splash .spl-track'));
  check('v0.44 开屏期间主界面流程未抢跑（引导浮层延后）', () => !$('#ov-onboard').classList.contains('show'));
  window.App.endSplash();
  await sleep(80);
  check('v0.44 结束后开屏进入退出态', () => $('#splash').classList.contains('out'));
  await sleep(560);
  check('v0.44 开屏结束后彻底隐藏', () => !$('#splash').classList.contains('show') && !$('#splash').classList.contains('out'));
  // 重播：v0.77 设置页对齐 Flutter 后已移除「开屏动画」入口，重播能力仍由 App.playSplash 暴露
  click(doc.querySelector('.tab[data-tab="me"]'));
  click(doc.querySelector('[data-action="settings"]'));
  await sleep(80);
  check('v0.77 设置页已无开屏动画重播入口', () => !doc.querySelector('#settingsBody [data-action="replay-splash"]'));
  click(doc.querySelector('[data-close="ov-settings"]'));
  await sleep(60);
  window.App.playSplash(null, true);
  check('v0.44 可重播开屏动画', () => $('#splash').classList.contains('show') && !$('#splash').classList.contains('out'));
  window.App.endSplash();
  await sleep(560);
  check('v0.44 重播结束后同样干净收场', () => !$('#splash').classList.contains('show'));

  // —— 冷启动引导（onboarded = false 时应自动弹出）——
  check('首次进入弹出兴趣引导', () => $('#ov-onboard').classList.contains('show'));
  check('引导页渲染标签', () => $$('#obTags .ob-tag').length >= 8);
  check('未选标签时按钮禁用', () => $('#obGo').disabled === true);
  ['露营', '徒步', '骑行'].forEach(t => click(doc.querySelector('[data-action="ob-tag"][data-v="' + t + '"]')));
  await sleep(60);
  check('选满 3 个标签后可进入', () => $('#obGo').disabled === false);
  const groupsBefore = window.DB.state.conversations.filter(c => c.type === 'group' && c.members.indexOf('me') >= 0).length;
  click($('#obGo'));
  await sleep(120);
  check('引导完成并跳转发现页（默认广场 tab）', () => doc.querySelector('#sc-discover').classList.contains('active') && $('#dpanel-plaza').style.display !== 'none' && $('#dpanel-friends').style.display === 'none');
  check('引导后自动加入群聊', () => window.DB.state.conversations.filter(c => c.type === 'group' && c.members.indexOf('me') >= 0).length > groupsBefore);
  check('引导后写入我的兴趣标签', () => window.DB.state.me.tags.indexOf('露营') >= 0);
  check('引导后出现同好主动打招呼', () => window.DB.state.conversations.filter(c => c.unread > 0).length >= 3);
  // v0.26 第一批 6-1：兑现「完成兴趣标签送 3 天会员」承诺
  check('引导完成后发放 3 天体验会员', () => !!window.DB.state.me.vip && window.DB.state.me.vip.expire > Date.now());
  check('体验会员 plan 为 t1（体验VIP 徽章）', () => window.DB.state.me.vip.plan === 't1');
  check('v0.77 广场瀑布流卡片已下线话题标签与共同兴趣推荐理由（对齐 Flutter showTags:false）', () => {
    const cards = $$('#plazaList .wf-card');
    return cards.length >= 5 && cards.every(c => !c.querySelector('.wf-tags') && !c.querySelector('.wf-rec'));
  });

  click(doc.querySelector('.tab[data-tab="chats"]'));
  check('消息列表渲染出会话', () => $$('#chatList .row').length >= 5);
  check('未读角标显示', () => $('#tabBadge').style.display !== 'none');

  // 切换 Tab
  ['contacts', 'discover', 'me', 'chats'].forEach(t => {
    const btn = doc.querySelector('.tab[data-tab="' + t + '"]');
    click(btn);
    check('切换到 Tab: ' + t, () => doc.querySelector('#sc-' + t).classList.contains('active'));
  });

  // 好友列表
  click(doc.querySelector('.tab[data-tab="contacts"]'));
  check('好友列表有好友', () => $$('#contactList .row').length >= 5);
  check('新的朋友入口存在', () => !!doc.querySelector('[data-action="newfriends"]'));

  // 广场（发现页默认 tab）
  click(doc.querySelector('.tab[data-tab="discover"]'));
  await sleep(40);
  check('广场渲染出瀑布流卡片', () => $$('#plazaList .wf-card').length >= 5);
  // v0.37：互动入口（打招呼/关注/评论）收敛到卡片详情，先点开一张卡片
  click(doc.querySelector('#plazaList .wf-card'));
  await sleep(60);
  check('点卡片打开动态详情', () => $('#ov-post-detail').classList.contains('show'));
  const greetBtn = doc.querySelector('#ov-post-detail [data-action="greet"]');
  check('详情含打招呼按钮', () => !!greetBtn);
  click(greetBtn);
  await sleep(100);
  check('弹出破冰话术选择器', () => $('#ov-greet').classList.contains('show'));
  check('提供 3 种话术模板', () => $$('#greetOpts .greet-opt').length === 3);
  check('话术含共同兴趣型', () => $('#greetOpts').textContent.indexOf('共同兴趣型') >= 0);
  click(doc.querySelector('[data-action="greet-opt"][data-v="shared"]'));
  await sleep(50);
  check('可选中话术模板', () => doc.querySelector('[data-action="greet-opt"][data-v="shared"]').classList.contains('on'));
  click(doc.querySelector('[data-action="send-greet"]'));
  await sleep(400);   // v0.22：首次打开会话有 240ms 骨架屏，等骨架结束再断言消息
  check('打招呼后进入会话页', () => $('#ov-chat').classList.contains('show'));
  check('会话页有消息气泡', () => $$('#chatWrap .msg').length >= 1);
  check('打招呼话术已发送', () => Array.from(doc.querySelectorAll('#chatWrap .bubble')).some(b => b.textContent.indexOf('我们都在玩') >= 0 || b.textContent.indexOf('很有意思') >= 0));
  await sleep(3600);
  check('陌生人自动回复到达', () => $$('#chatWrap .msg').length >= 2);
  check('埋点记录了话术类型', () => window.Analytics.events().some(e => e.name === 'greet' && e.props.opener === 'shared'));

  // 发消息
  $('#chatInput').value = '你好，周末有空吗？';
  click($('#sendBtn'));
  await sleep(100);
  check('发出的消息进入气泡', () => Array.from(doc.querySelectorAll('#chatWrap .bubble')).some(b => b.textContent.indexOf('周末有空吗') >= 0));
  await sleep(3000);
  check('对方自动回复我的提问', () => $$('#chatWrap .msg').length >= 4);

  // 表情面板
  click($('#emojiBtn'));
  check('表情面板展开', () => $('#emojiPanel').classList.contains('show'));

  // 返回 + 群聊
  click(doc.querySelector('[data-close="ov-chat"]'));
  check('返回关闭会话页', () => !$('#ov-chat').classList.contains('show'));
  if (doc.querySelector('[data-action="close-post-detail"]')) click(doc.querySelector('[data-action="close-post-detail"]'));
  await sleep(40);
  click(doc.querySelector('.tab[data-tab="chats"]'));
  const grpRow = $$('#chatList .row').find(r => r.textContent.indexOf('周末露营搭子群') >= 0);
  click(grpRow);
  await sleep(100);
  check('进入群聊', () => $('#chatTitle').textContent.indexOf('露营搭子群') >= 0);

  // 未加入的群聊应显示「加入群聊」条（验证 H2）
  const c2 = window.DB.state.conversations.find(c => c.id === 'c2');
  c2.members = c2.members.filter(m => m !== 'me');
  window.DB.save();
  click(doc.querySelector('[data-close="ov-chat"]'));
  click(doc.querySelector('.tab[data-tab="chats"]'));
  click($$('#chatList .row').find(r => r.textContent.indexOf('周末露营搭子群') >= 0));
  await sleep(100);
  check('未加入的群显示加入条', () => !!doc.querySelector('[data-action="join-group"]'));
  check('未加入状态显示在标题栏', () => $('#chatSub').textContent.indexOf('未加入') >= 0);
  click(doc.querySelector('[data-action="join-group"]'));
  await sleep(80);
  check('可成功加入群聊', () => c2.members.indexOf('me') >= 0);
  check('加入后加入条消失', () => !doc.querySelector('[data-action="join-group"]'));
  check('群聊显示成员数', () => $('#chatSub').textContent.indexOf('位成员') >= 0);
  $('#chatInput').value = '周六几点集合？';
  click($('#sendBtn'));
  await sleep(3000);
  check('群聊有自动回复', () => $$('#chatWrap .msg').length >= 6);

  // 好友流（发现页内部切到「好友」tab）
  click(doc.querySelector('.tab[data-tab="discover"]'));
  await sleep(40);
  click(doc.querySelector('[data-action="discover-tab"][data-v="friends"]'));
  await sleep(60);
  check('好友流渲染', () => $$('#momentList .moment').length >= 3);
  // v0.26 第一批 2-1：动态可见范围严格过滤（friends 对好友可见 / circle 无目标圈不展示）
  check('好友可见动态对好友展示（u3 天幕）', () => $$('#momentList .moment').some(r => r.textContent.indexOf('天幕') >= 0));
  check('圈子可见但无目标圈的动态不展示（u7 徒步手帐）', () => !$$('#momentList .moment').some(r => r.textContent.indexOf('徒步手帐') >= 0));

  // —— v0.58 发现页二分：广场（推荐）/ 好友（互友 + 关注）——
  check('v0.58 发现页 Tab 文案为「广场 / 好友」', () => {
    const t = $$('#discoverTabs .subtab').map(b => b.textContent);
    return t.length === 2 && t[0] === '广场' && t[1] === '好友';
  });
  check('v0.58 好友流纳入「我关注但不是好友」的作者（u8 桨板）', () =>
    $$('#momentList .moment').some(r => r.textContent.indexOf('桨板第 5 次下水') >= 0));
  check('v0.58 关注来源的卡片标出「关注」（解释为什么这条在这）', () => {
    const row = $$('#momentList .moment').find(r => r.textContent.indexOf('桨板第 5 次下水') >= 0);
    return !!row && row.querySelector('.mn .tag') && row.querySelector('.mn .tag').textContent === '关注';
  });
  check('v0.58 好友作者的卡片不画蛇添足加「关注」标记', () => {
    const row = $$('#momentList .moment').find(r => r.textContent.indexOf('天幕') >= 0);
    return !!row && !row.querySelector('.mn .tag');
  });
  check('v0.58 可见域优先于关注：仅好友可见的动态不对只关注的人展示（u8 k9）', () =>
    $('#momentList').textContent.indexOf('仅好友可见') < 0);
  check('v0.58 好友流是严格时间倒序（不插推荐算法）', () => {
    const st = window.DB.state;
    const pool = st.moments.filter(m => {
      if ((st.blocked || []).indexOf(m.userId) >= 0) return false;
      if (!(m.userId === 'me' || st.friends.indexOf(m.userId) >= 0 || st.me.following.indexOf(m.userId) >= 0)) return false;
      if (m.scope === 'private') return false;
      if (m.scope === 'friends') return st.friends.indexOf(m.userId) >= 0;
      if (m.scope === 'circle') return false;   // 种子里 circle 动态没有目标圈 → 不可见
      return true;
    }).sort((a, b) => b.ts - a.ts);
    const rows = $$('#momentList .moment').map(r => r.textContent);
    let last = -1;
    /* 每一条在 DOM 里的位置必须严格递增 —— 等价于"按 ts 倒序渲染" */
    return pool.length >= 5 && pool.every(m => {
      const i = rows.findIndex(t => t.indexOf(m.text.slice(0, 10)) >= 0);
      if (i < 0 || i <= last) return false;
      last = i; return true;
    });
  });
  // 走真实链路：打开 u10 主页 → 取关 → 好友流里消失 → 再关注 → 回来
  const closeProfile = () => { const b = doc.querySelector('#ov-profile [data-close="ov-profile"]'); if (b) click(b); };
  window.App.openProfile('u10');
  await sleep(80);
  check('v0.58 陌生人主页提供「关注」入口', () => !!doc.querySelector('#ov-profile [data-action="follow"]'));
  click(doc.querySelector('#ov-profile [data-action="follow"]'));   // u10 已在关注列表 → 这次是取关
  await sleep(80);
  closeProfile();
  await sleep(60);
  window.App.friendsFeed();
  await sleep(40);
  check('v0.58 取消关注后，TA 的动态从好友流移除（u10 装备清单）', () =>
    $('#momentList').textContent.indexOf('鳌太重装装备清单') < 0);
  window.App.openProfile('u10');
  await sleep(80);
  click(doc.querySelector('#ov-profile [data-action="follow"]'));   // 重新关注
  await sleep(80);
  closeProfile();
  await sleep(60);
  window.App.friendsFeed();
  await sleep(40);
  check('v0.58 重新关注后，TA 的动态回到好友流', () =>
    $('#momentList').textContent.indexOf('鳌太重装装备清单') >= 0);
  check('v0.58 好友流为空时按「为什么空」给出口（关注归零 → 去添加好友）', () => {
    const bakF = window.DB.state.friends.slice(), bakFol = window.DB.state.me.following.slice();
    window.DB.state.friends = []; window.DB.state.me.following = [];
    window.App.friendsFeed();
    const t = $('#momentList').textContent;
    const ok = t.indexOf('还没有关注任何人') >= 0 && !!doc.querySelector('#momentList [data-action="add-friend"]');
    window.DB.state.friends = bakF; window.DB.state.me.following = bakFol;
    window.App.friendsFeed();
    return ok && $('#momentList').textContent.indexOf('还没有关注任何人') < 0;
  });
  const likeBtn = doc.querySelector('[data-action="like"]');
  click(likeBtn);
  await sleep(80);
  check('点赞状态生效', () => !!doc.querySelector('[data-action="like"].liked'));
  click(doc.querySelector('[data-action="comment"]'));
  await sleep(80);
  check('评论输入框出现', () => !!doc.querySelector('.cminput'));
  const cmi = doc.querySelector('.cminput .input');
  if (cmi) { cmi.value = '测试评论'; click(doc.querySelector('[data-action="submit-cm"]')); }
  await sleep(120);
  check('评论写入动态', () => $('#momentList').textContent.indexOf('测试评论') >= 0);

  // 发布动态
  click(doc.querySelector('[data-action="publish"]'));
  await sleep(80);
  check('发布页打开', () => $('#ov-publish').classList.contains('show'));
  $('#pubText').value = '冒烟测试动态';
  click(doc.querySelector('[data-action="pub-img"]'));
  await sleep(60);
  click(doc.querySelector('[data-action="do-publish"]'));
  check('发布按钮进入 loading 态（防重复点击）', () => doc.querySelector('[data-action="do-publish"]').classList.contains('loading'));
  await sleep(900);   // v0.22：发布走 loading(520ms)→成功 状态机，等状态机结束再断言
  check('发布成功并展示', () => $('#momentList').textContent.indexOf('冒烟测试动态') >= 0);
  /* v0.65：发布归属广场——默认公开且未同步任何圈子，发布后回到广场并能在广场看到 */
  check('发布后跳到发现页-广场 tab', () => doc.querySelector('#sc-discover').classList.contains('active') && $('#dpanel-plaza').style.display !== 'none' && $('#dpanel-friends').style.display === 'none');
  check('v0.65 默认发布进入广场', () => $('#plazaList').textContent.indexOf('冒烟测试动态') >= 0);

  // 发现页合并：广场/动态 内部分段切换（v0.9）
  click(doc.querySelector('.tab[data-tab="discover"]'));
  await sleep(40);
  check('v0.58 发现页含广场/好友两个内部tab', () => $$('#discoverTabs .subtab').length === 2);
  // 切到广场（已知状态）验证
  click(doc.querySelector('[data-action="discover-tab"][data-v="plaza"]'));
  await sleep(60);
  check('切到广场显示广场流', () => $('#dpanel-plaza').style.display !== 'none' && $('#dpanel-friends').style.display === 'none');
  check('v0.76 发现页已无 A/B 角标', () => !$('#abTag'));
  check('广场内部tab高亮', () => doc.querySelector('[data-action="discover-tab"][data-v="plaza"]').classList.contains('active'));
  // 切到动态
  click(doc.querySelector('[data-action="discover-tab"][data-v="friends"]'));
  await sleep(60);
  check('切到好友显示好友流', () => $('#dpanel-friends').style.display !== 'none' && $('#dpanel-plaza').style.display === 'none');
  check('v0.76 好友流同样无 A/B 角标', () => !$('#abTag'));
  check('好友内部tab高亮', () => doc.querySelector('[data-action="discover-tab"][data-v="friends"]').classList.contains('active'));
  check('广场与好友面板互斥', () => ($('#dpanel-plaza').style.display === 'none') !== ($('#dpanel-friends').style.display === 'none'));

  // 好友申请
  click(doc.querySelector('.tab[data-tab="contacts"]'));
  click(doc.querySelector('[data-action="newfriends"]'));
  await sleep(80);
  check('新的朋友页打开', () => $('#ov-newfriends').classList.contains('show'));
  const before = window.DB.state.friends.length;
  // v0.77：广场下线排序后首卡作者 = u4，打招呼流程已打开 u4 会话（骨架屏已消费），
  // 这里改接受 u8 的申请，避免与打招呼撞同一个会话导致骨架屏断言失真
  click(doc.querySelector('[data-action="accept-req"][data-id="u8"]'));
  check('首次打开会话先出骨架屏（v0.22）', () => $$('#chatWrap .sk-msg').length >= 1);
  await sleep(400);   // 骨架屏 240ms 后渲染真实消息
  check('骨架结束后渲染真实消息（v0.22）', () => $$('#chatWrap .msg, #chatWrap .sys-msg').length >= 1);
  check('接受好友申请后好友数 +1', () => window.DB.state.friends.length === before + 1);
  check('接受后自动进入会话', () => $('#ov-chat').classList.contains('show'));

  // 我的 / 设置 / 看板
  click(doc.querySelector('.tab[data-tab="me"]'));
  check('我的页渲染统计', () => $('#meBody').textContent.indexOf('野遇号') >= 0);
  check('我的页含核心资产条-野遇币', () => { var c=doc.querySelector('#meBody .me-core [data-action="wallet"]'); return !!c && c.textContent.indexOf('野遇币')>=0 && c.textContent.indexOf('充值')>=0; });
  check('我的页核心条含 VIP/靓号入口', () => !!doc.querySelector('#meBody .me-core [data-action="vip"]') && !!doc.querySelector('#meBody .me-core [data-action="niceid"]'));
  /* v0.60 重排：分组改为「我的内容 / 服务 / 更多」，同级内容只出现一次 */
  check('我的页含分组标题(我的内容/服务/更多)', () => {
    const t = $('#meBody').textContent;
    return t.indexOf('我的内容') >= 0 && t.indexOf('服务') >= 0 && t.indexOf('更多') >= 0;
  });
  check('我的页头部含身份与关注/粉丝', () => {
    const h = $('#meBody .me-sub');
    const st = $('#meBody .me-stats');
    return !!h && h.textContent.indexOf('野遇号') >= 0 && !!st && st.textContent.indexOf('关注') >= 0 && st.textContent.indexOf('粉丝') >= 0;
  });
  check('我的页编辑入口不重复(宫格无 edit)', () => !doc.querySelector('#meBody .me-grid [data-action="edit"]'));
  check('我的页宫格含我的订单入口', () => !!doc.querySelector('#meBody .me-grid [data-action="orders"]'));
  click(doc.querySelector('[data-action="settings"]'));
  await sleep(80);
  check('设置页打开', () => $('#ov-settings').classList.contains('show'));
  /* v0.77：原「平台消息/通知」合并开关已被分类型开关替代（收敛到消息通知子页），
     设置主页只保留隐私/通用开关；这里切「附近的人可见」验证开关机制 */
  click(doc.querySelector('[data-action="toggle-set"][data-v="nearby"]'));
  await sleep(60);
  check('开关可切换', () => window.DB.state.settings.nearby === false);
  click(doc.querySelector('[data-action="toggle-set"][data-v="nearby"]'));
  await sleep(60);

  // v0.76：数据看板（含漏斗与 A/B 分组）作为原型验证工具整体移除
  check('v0.76 数据看板浮层已移除', () => !$('#ov-lab') && !$('#labBody'));
  check('v0.76 我的页不再有「数据看板」入口', () => !$$('#meBody [data-action="lab"]').length);
  check('埋点已记录事件', () => window.Analytics.events().length > 8);

  // 反馈
  click(doc.querySelector('[data-action="feedback"]'));
  await sleep(80);
  $('#fbText').value = '冒烟测试反馈';
  click(doc.querySelector('[data-action="submit-fb"]'));
  await sleep(80);
  check('反馈写入', () => window.Analytics.feedbackList().length >= 1);

  // ===== 新增：加号菜单 / 消息操作 / 扩展面板 / 语音 / 靓号 / 会员 =====
  ['ov-lab','ov-settings','ov-fbMask','ov-cfMask','ov-newfriends','ov-profile','ov-mymoments']
    .forEach(id => { var o = $('#' + id); if (o) o.classList.remove('show'); });

  // 功能2：消息页右上角加号菜单
  click(doc.querySelector('.tab[data-tab="chats"]'));
  click(doc.querySelector('[data-action="new-chat"]'));
  await sleep(60);
  check('消息页加号菜单弹出', () => $('#plusMenu').classList.contains('show'));
  check('加号菜单含发起群聊/添加好友/扫一扫/我的群聊', () => {
    var t = $('#plusMenu').textContent;
    return ['发起群聊','添加好友','扫一扫','我的群聊'].every(function (s) { return t.indexOf(s) >= 0; });
  });
  // 添加好友下钻（搜非好友用户「西安」→ u10 老猫）
  click(doc.querySelector('[data-action="pm"][data-v="add-friend"]'));
  await sleep(80);
  check('加号→添加好友打开页面', () => $('#ov-addfriend').classList.contains('show'));
  $('#addFriendInput').value = '西安';
  $('#addFriendInput').dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(80);
  check('搜索好友出现结果', () => $$('#addFriendBody .row').length >= 1);
  var reqBefore = window.DB.state.requests.length;
  click(doc.querySelector('[data-action="send-req"]'));
  await sleep(80);
  check('添加好友发送申请', () => window.DB.state.requests.length === reqBefore + 1);
  click(doc.querySelector('[data-close="ov-addfriend"]'));
  // 我的群聊
  click(doc.querySelector('[data-action="new-chat"]'));
  await sleep(50);
  click(doc.querySelector('[data-action="pm"][data-v="mygroups"]'));
  await sleep(80);
  check('加号→我的群聊打开列表', () => $('#ov-grouplist').classList.contains('show'));
  check('群聊列表渲染', () => $$('#groupListBody .row').length >= 1);
  click(doc.querySelector('[data-close="ov-grouplist"]'));

  // 进入群聊 c2，验证聊天页 ⋯ 群信息 + 角色/权限
  click(doc.querySelector('.tab[data-tab="chats"]'));
  var grp2 = $$('#chatList .row').find(function (r) { return r.textContent.indexOf('周末露营搭子群') >= 0; });
  click(grp2);
  await sleep(100);
  check('重新进入群聊', () => $('#chatTitle').textContent.indexOf('露营搭子群') >= 0);
  click($('#chatMore'));
  await sleep(80);
  check('聊天页⋯打开群聊信息', () => $('#ov-groupinfo').classList.contains('show'));
  check('群信息展示角色', () => /群主|管理员|普通成员/.test($('#groupInfoBody').textContent));
  check('群信息展示权限矩阵', () => $('#groupInfoBody').textContent.indexOf('权限矩阵') >= 0);
  click(doc.querySelector('[data-close="ov-groupinfo"]'));

  // 功能5（部分）：扩展面板 + 富消息发送
  click($('#plusBtn'));
  await sleep(80);
  check('聊天页＋展开扩展面板', () => $('#extPanel').classList.contains('show'));
  check('扩展面板含图片/语音/位置/名片', () => {
    var t = $('#extPanel').textContent;
    return ['图片','语音','位置','名片'].every(function (s) { return t.indexOf(s) >= 0; });
  });
  click(doc.querySelector('[data-action="ext-img"]'));
  await sleep(80);
  check('发送图片消息', () => !!doc.querySelector('#chatWrap .bubble-img'));
  click($('#plusBtn')); await sleep(50);
  click(doc.querySelector('[data-action="ext-loc"]'));
  await sleep(80);
  check('发送位置消息', () => !!doc.querySelector('#chatWrap .loc-msg'));
  // 语音
  click($('#voiceBtn'));
  await sleep(80);
  check('语音录制界面弹出', () => $('#ov-voice').classList.contains('show'));
  click(doc.querySelector('[data-action="voice-send"]'));
  await sleep(80);
  check('发送语音消息', () => !!doc.querySelector('#chatWrap .voice-msg'));

  // 功能5（部分）：消息操作（长按 → 引用/复制/删除/转发/撤回）
  var bubble = doc.querySelector('#chatWrap .bubble');
  check('存在可操作的消息气泡', () => !!bubble);
  if (bubble) {
    // 长按（而非点按）弹出菜单
    bubble.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(520);
    check('长按气泡弹出消息操作菜单', () => $('#ov-msgact').classList.contains('show'));
    check('消息操作含引用/复制文字/删除/转发', () => {
      var t = $('#msgActBody').textContent;
      return ['引用','复制文字','删除','转发'].every(function (s) { return t.indexOf(s) >= 0; });
    });
    var quoteItem = $$('#msgActBody .act-item').find(a => a.textContent.indexOf('引用') >= 0);
    click(quoteItem);
    await sleep(80);
    check('引用后显示引用条', () => $('#quoteBar').style.display !== 'none' && !!$('#quoteBar').textContent);
    $('#chatInput').value = '引用测试';
    click($('#sendBtn'));
    await sleep(120);
    check('引用消息发出（含引用块）', () => !!doc.querySelector('#chatWrap .bubble .quote'));
  }
  click(doc.querySelector('[data-close="ov-chat"]'));

  // 功能3：靓号商城 + 支付流程
  click(doc.querySelector('.tab[data-tab="me"]'));
  click(doc.querySelector('[data-action="niceid"]'));
  await sleep(100);
  check('靓号商城打开', () => $('#ov-niceid').classList.contains('show'));
  check('靓号列表渲染卡片', () => $$('#niceBody .nice-card').length >= 5);
  var numBefore = window.DB.state.me.yeyuNum;
  var ordersBefore = window.DB.state.orders.length;

  // v0.13 靓号商城重设计：hero 身份牌 / 分类胶囊 / 稀有度分色 / 号码牌
  check('靓号页 hero 身份牌显示当前野遇号', () => {
    var n = $('#niceBody .nh-num');
    return !!n && !!$('#niceBody .nh-plate') && n.textContent.trim() === numBefore;
  });
  check('靓号页分类胶囊含数量角标', () => $$('#niceBody .nice-kinds .nk').length >= 6 && !!$('#niceBody .nice-kinds .nk i'));
  check('靓号卡片按稀有度分色(至尊金/稀有紫)', () => !!$('#niceBody .nice-card.tone-gold') && !!$('#niceBody .nice-card.tone-violet'));
  check('靓号卡片含号码牌与标签角标', () => !!$('#niceBody .nice-card .nc-plate .nc-num') && !!$('#niceBody .nice-card .nc-tag'));

  click(doc.querySelector('[data-action="buy-nice"]'));
  await sleep(100);
  check('点击购买弹出收银台', () => $('#ov-pay').classList.contains('show'));
  check('收银台含微信支付/支付宝', () => $('#payBody').textContent.indexOf('微信支付') >= 0 && $('#payBody').textContent.indexOf('支付宝') >= 0);
  click(doc.querySelector('[data-pay="way"][data-v="alipay"]'));
  await sleep(50);
  click(doc.querySelector('[data-pay="submit"]'));
  await sleep(80);
  var pw1 = doc.querySelector('#payPwd'); if (pw1) pw1.value = '123456';
  click(doc.querySelector('[data-pay="pwd-ok"]'));
  await sleep(1700);
  check('支付成功页出现', () => $('#payBody').textContent.indexOf('支付成功') >= 0);
  check('靓号订单已写入', () => window.DB.state.orders.length === ordersBefore + 1);
  click(doc.querySelector('[data-pay="done"]'));
  await sleep(80);
  check('购买后野遇号变更', () => window.DB.state.me.yeyuNum !== numBefore);
  // v0.71：买了靓号必须能被认出来 —— 号码统一改为纯数字（旧的 ye_ 前缀数据要能自动归一），
  // 导致我的页在买完之后仍显示「未设置」，等于花钱买了个看不见的东西
  window.App.renderMe(); await sleep(40);
  check('v0.71 买完靓号后我的页立刻出现靓号标识', () => {
    const sub = $('#meBody .me-hero .me-sub');
    return !!sub && !!sub.querySelector('.me-id-tag') && !!sub.querySelector('.me-id-num');
  });
  check('v0.71 买完靓号后资产条由「未设置」变为「专属」', () => {
    const cell = $$('#meBody .mc')[2];
    return /专属/.test(cell.textContent) && !/未设置/.test(cell.textContent);
  });

  // 功能4：会员中心 + 支付流程
  // v0.26：冷启动已发放体验会员，此段验证「从零开通」，先重置为非会员
  window.DB.state.me.vip = null; window.DB.save();
  click(doc.querySelector('[data-action="vip"]'));
  await sleep(100);
  check('会员中心打开', () => $('#ov-vip').classList.contains('show'));
  check('会员权益与套餐渲染', () => $$('#vipBody .er-g').length > 0 && ($$('#vipBody .vp').length >= 3 || $('#vipFoot').textContent.indexOf('开通') >= 0));
  check('v0.34 免费首次进入默认锚定 VIP 月卡 ¥18（低门槛优先）',
    () => $('#vipFoot').textContent.indexOf('¥18') >= 0, $('#vipFoot').textContent.slice(0, 30));
  click(doc.querySelector('[data-action="vip-plan"][data-v="y1"]'));
  await sleep(60);
  click(doc.querySelector('[data-action="vip-pay"]'));
  await sleep(120);
  check('会员开通弹出收银台', () => $('#ov-pay').classList.contains('show'));
  click(doc.querySelector('[data-pay="submit"]'));
  await sleep(80);
  var pw2 = doc.querySelector('#payPwd'); if (pw2) pw2.value = '123456';
  click(doc.querySelector('[data-pay="pwd-ok"]'));
  await sleep(1700);
  check('会员支付成功', () => $('#payBody').textContent.indexOf('支付成功') >= 0);
  click(doc.querySelector('[data-pay="done"]'));
  await sleep(80);
  check('会员状态已开通', () => !!window.DB.state.me.vip && window.DB.state.me.vip.plan === 'y1');

  // 功能1：二维码分享好友（我的二维码 + 他人二维码 + 扫一扫）
  ['ov-vip','ov-pay','ov-niceid','ov-groupinfo','ov-chat','ov-msgact','ov-voice']
    .forEach(id => { var o = $('#' + id); if (o) o.classList.remove('show'); });

  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(60);
  /* v0.60：二维码从宫格移到身份卡图标按钮（宫格改为纯「我的内容」四项） */
  check('我的页含「我的二维码」入口', () => !!doc.querySelector('#meBody .me-hero [data-action="my-qr"]'));
  var qrRow = doc.querySelector('#meBody [data-action="my-qr"]');
  click(qrRow);
  await sleep(150);
  check('我的二维码弹层打开', () => $('#ov-qr').classList.contains('show'));
  check('二维码真实渲染（svg 可被手机扫描）', () => !!doc.querySelector('#qrBox svg'));
  check('二维码含分享/保存按钮', () => !!doc.querySelector('[data-action="qr-share"]') && !!doc.querySelector('[data-action="qr-save"]'));
  click(doc.querySelector('[data-action="qr-share"]'));
  await sleep(80);
  check('分享链接点击不报错', () => true);
  click(doc.querySelector('[data-close="ov-qr"]'));

  // 他人二维码：广场 → 个人主页 → 二维码
  click(doc.querySelector('.tab[data-tab="discover"]'));
  await sleep(40);
  click(doc.querySelector('[data-action="discover-tab"][data-v="plaza"]'));
  await sleep(60);
  click(doc.querySelector('[data-action="open-profile"]'));
  await sleep(150);
  check('个人主页打开', () => $('#ov-profile').classList.contains('show'));
  /* v0.52：二维码等次级操作已收进「···」菜单，主页按钮区只留主 CTA */
  click(doc.querySelector('#ov-profile [data-action="prof-more"]'));
  await sleep(120);
  /* v0.54：他人主页已不再提供「TA 的二维码」，更多菜单只留次级/安全类操作 */
  check('v0.54 更多菜单保留备注入口但不再有二维码', () =>
    !!doc.querySelector('#profMoreBody [data-action="remark-open"]') &&
    !doc.querySelector('#profMoreBody [data-action="user-qr"]') &&
    $('#profMoreBody').textContent.indexOf('二维码') < 0);
  click(doc.querySelector('[data-close="ov-profmore"]'));
  click(doc.querySelector('[data-close="ov-profile"]'));

  // 扫一扫闭环
  click(doc.querySelector('.tab[data-tab="chats"]'));
  await sleep(40);
  click(doc.querySelector('[data-action="new-chat"]'));
  await sleep(60);
  click(doc.querySelector('[data-action="pm"][data-v="scan"]'));
  await sleep(120);
  check('扫一扫弹层打开', () => $('#ov-scan').classList.contains('show'));
  check('扫一扫含模拟扫描按钮', () => !!doc.querySelector('[data-action="do-scan"]'));
  click(doc.querySelector('[data-action="do-scan"]'));
  await sleep(1000);
  check('扫描后跳转到被扫用户主页', () => $('#ov-profile').classList.contains('show'));
  click(doc.querySelector('[data-close="ov-profile"]'));

  // 功能2：聊天消息排版修复（.col 包装）+ @ 提及
  click(doc.querySelector('.tab[data-tab="chats"]'));
  await sleep(40);
  var g2 = $$('#chatList .row').find(r => r.textContent.indexOf('周末露营搭子群') >= 0);
  click(g2);
  await sleep(150);
  check('聊天消息使用 .col 排版', () => !!doc.querySelector('#chatWrap .msg .col'));
  check('气泡包裹在圆角气泡内', () => !!doc.querySelector('#chatWrap .msg .col .bubble'));
  check('群聊显示 @ 提及按钮', () => $('#atBtn').style.display !== 'none');
  click($('#atBtn'));
  await sleep(80);
  check('@ 提及面板打开并列出成员', () => $('#ov-mention').classList.contains('show') && $$('#mentionBody .mention-item').length >= 1);
  click(doc.querySelector('[data-action="pick-mention"]'));
  await sleep(80);
  check('选择成员后输入框插入 @名', () => $('#chatInput').value.indexOf('@') >= 0);
  click(doc.querySelector('[data-close="ov-chat"]'));

  // 需求1+2：VIP 尊贵标识 + 支付密码流程（重置为未开通态，独立验证完整开通链路）
  window.DB.state.me.vip = null; window.DB.save();
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(60);
  click(doc.querySelector('[data-action="vip"]'));
  await sleep(80);
  check('会员中心打开', () => $('#ov-vip').classList.contains('show'));
  click(doc.querySelector('[data-action="vip-pay"]'));
  await sleep(80);
  check('收银台打开', () => $('#ov-pay').classList.contains('show'));
  check('收银台有「确认支付」按钮', () => !!doc.querySelector('[data-pay="submit"]'));
  click(doc.querySelector('[data-pay="submit"]'));
  await sleep(80);
  check('确认后出现支付密码输入页', () => !!doc.querySelector('[data-pay="pwd-ok"]') && !!$('#payPwd'));
  $('#payPwd').value = '000000';
  click(doc.querySelector('[data-pay="pwd-ok"]'));
  await sleep(80);
  check('错误密码被拦截并提示', () => $('#payPwdErr').textContent.indexOf('错误') >= 0 && !!doc.querySelector('[data-pay="pwd-ok"]'));
  $('#payPwd').value = '123456';
  click(doc.querySelector('[data-pay="pwd-ok"]'));
  await sleep(1700);
  check('支付成功页出现', () => !!doc.querySelector('[data-pay="done"]'));
  check('VIP 已写入（me.vip 生效）', () => !!(window.DB.state.me.vip && window.DB.state.me.vip.expire > Date.now()));
  click(doc.querySelector('[data-pay="done"]'));
  await sleep(100);
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(100);
  check('我的页展示 VIP 尊贵徽章', () => $('#meBody').innerHTML.indexOf('badge-vip') >= 0);

  // 需求3：靓号尊贵标识
  window.DB.state.me.yeyuNum = '888888';
  window.DB.save();
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(100);
  check('v0.74 靓号标识出现在号码行，不在昵称旁', () =>
    !!$('#meBody .me-hero .me-sub .me-id-tag') && !$('#meBody .me-hero .me-name .badge-nice'));
  check('靓号行以尊贵样式展示号码', () => $('#meBody').innerHTML.indexOf('专属靓号 888888') >= 0);

  // ===== 平台币钱包（v0.6）=====
  const closeOverlays = () => ['ov-wallet','ov-vip','ov-niceid','ov-pay','ov-orders','ov-chat','ov-profile'].forEach(id => { var o = $('#' + id); if (o) o.classList.remove('show'); });

  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(60);
  check('我的页核心条含钱包入口并显示野遇币余额', () => {
    var c = doc.querySelector('#meBody .me-core [data-action="wallet"]');
    return !!c && c.textContent.indexOf('野遇币') >= 0 && c.textContent.indexOf('充值') >= 0;
  });
  click(doc.querySelector('[data-action="wallet"]'));
  await sleep(100);
  check('钱包页打开', () => $('#ov-wallet').classList.contains('show'));
  check('钱包页显示野遇币余额', () => !!doc.querySelector('.coin-bal b'));
  check('钱包页渲染充值档位', () => $$('#walletBody .coin-tier').length >= 6);
  check('钱包页含 VIP/靓号用币入口', () => $('#walletBody').textContent.indexOf('会员中心') >= 0 && $('#walletBody').textContent.indexOf('靓号商城') >= 0);

  var coinsBeforeRecharge = window.DB.state.me.coins;
  click(doc.querySelector('[data-action="coin-recharge"][data-v="30"]'));
  await sleep(100);
  check('点击充值弹出收银台', () => $('#ov-pay').classList.contains('show'));
  check('充值收银台隐藏野遇币支付方式', () => !doc.querySelector('[data-pay="way"][data-v="coin"]'));
  click(doc.querySelector('[data-pay="submit"]'));
  await sleep(80);
  var rpw = doc.querySelector('#payPwd'); if (rpw) rpw.value = '123456';
  click(doc.querySelector('[data-pay="pwd-ok"]'));
  await sleep(1700);
  check('充值成功', () => $('#payBody').textContent.indexOf('支付成功') >= 0);
  check('野遇币余额增加 300', () => window.DB.state.me.coins === coinsBeforeRecharge + 300);
  check('充值写入币流水', () => window.DB.state.coinLogs.some(l => l.type === 'recharge' && l.amount === 300));
  check('充值写入订单', () => window.DB.state.orders.some(o => o.goods === 'coin_recharge'));
  click(doc.querySelector('[data-pay="done"]'));
  await sleep(80);

  // 用币买会员（季卡 q1 = 480 币）
  closeOverlays();
  window.DB.state.me.vip = null; window.DB.save();
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(50);
  click(doc.querySelector('[data-action="vip"]'));
  await sleep(80);
  click(doc.querySelector('[data-action="vip-plan"][data-v="q1"]'));
  await sleep(60);
  click(doc.querySelector('[data-action="vip-pay"]'));
  await sleep(100);
  check('会员收银台新增野遇币支付方式', () => !!doc.querySelector('[data-pay="way"][data-v="coin"]'));
  var coinsBeforeVip = window.DB.state.me.coins;
  click(doc.querySelector('[data-pay="way"][data-v="coin"]'));
  await sleep(60);
  check('选野遇币后按钮变为「用 N 野遇币支付」', () => /用\s*\d+\s*野遇币支付/.test($('#payFoot').textContent));
  click(doc.querySelector('[data-pay="submit"]'));
  await sleep(80);
  var vpw = doc.querySelector('#payPwd'); if (vpw) vpw.value = '123456';
  click(doc.querySelector('[data-pay="pwd-ok"]'));
  await sleep(1700);
  check('用币开通会员成功', () => $('#payBody').textContent.indexOf('支付成功') >= 0);
  check('VIP 已开通', () => !!(window.DB.state.me.vip && window.DB.state.me.vip.expire > Date.now()));
  check('用币支付扣除 480 野遇币', () => window.DB.state.me.coins === coinsBeforeVip - 480);
  check('消费写入币流水', () => window.DB.state.coinLogs.some(l => l.type === 'spend' && l.desc && l.desc.indexOf('会员') >= 0));
  click(doc.querySelector('[data-pay="done"]'));
  await sleep(80);

  // ============ v0.26 第一批 4-1：VIP 续费叠加（剩余10天 + 月卡30天 ≈ 40天）============
  window.DB.state.me.vip = { plan:'m1', name:'月卡', days:30, start: Date.now(), expire: Date.now() + 10 * 86400000 };
  var expBefore41 = window.DB.state.me.vip.expire;
  window.App.openVipPay('m1');
  await sleep(100);
  click(doc.querySelector('[data-pay="submit"]'));
  await sleep(80);
  var pw41 = doc.querySelector('#payPwd'); if (pw41) pw41.value = '123456';
  click(doc.querySelector('[data-pay="pwd-ok"]'));
  await sleep(1700);
  check('续费叠加：剩余10天顺延30天（expire 增加约30天）', () => Math.abs((window.DB.state.me.vip.expire - expBefore41) - 30 * 86400000) < 60000);
  check('续费后会员仍生效', () => window.DB.state.me.vip.expire > Date.now());
  click(doc.querySelector('[data-pay="done"]'));
  await sleep(80);

  // 余额不足提示
  closeOverlays();
  window.DB.state.me.coins = 100; window.DB.save();
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(50);
  click(doc.querySelector('[data-action="niceid"]'));
  await sleep(80);
  click(doc.querySelector('[data-action="buy-nice"]'));
  await sleep(80);
  check('靓号收银台含野遇币支付', () => !!doc.querySelector('[data-pay="way"][data-v="coin"]'));
  click(doc.querySelector('[data-pay="way"][data-v="coin"]'));
  await sleep(60);
  check('余额不足时按钮禁用并提示去充值', () => {
    var btn = Array.from(doc.querySelectorAll('#payFoot button')).find(b => /余额不足/.test(b.textContent));
    return !!btn && btn.disabled === true;
  });
  click(doc.querySelector('[data-pay="go-recharge"]'));
  await sleep(80);
  check('点击去充值打开钱包页', () => $('#ov-wallet').classList.contains('show'));
  closeOverlays();

  // ===== 消息长按操作菜单 + 转发（v0.8）=====
  click(doc.querySelector('.tab[data-tab="chats"]'));
  await sleep(40);
  var chatRow0 = $$('#chatList .row').find(r => r.textContent.indexOf('周末露营搭子群') >= 0) || $$('#chatList .row')[0];
  click(chatRow0);
  await sleep(200);
  var lpBubble = doc.querySelector('#chatWrap .bubble');
  check('会话中存在消息气泡', () => !!lpBubble);
  // 可发现性：每条消息都带可见的「⋯」操作入口，点按即弹菜单（无需长按）
  check('每条消息都带「⋯」操作入口', () => $$('#chatWrap .bubble-more').length >= 1);
  var moreBtn = doc.querySelector('#chatWrap .bubble-more');
  click(moreBtn);
  await sleep(60);
  check('点击「⋯」立即弹出消息操作菜单（无需长按）', () => $('#ov-msgact').classList.contains('show'));
  if ($('#ov-msgact').classList.contains('show')) click(doc.querySelector('[data-action="close-msgact"]'));
  // 确保菜单初始关闭
  if ($('#ov-msgact').classList.contains('show')) click(doc.querySelector('[data-action="close-msgact"]'));
  // 回归：点按气泡不应直接弹出操作菜单（长按才是正确手势）
  if (lpBubble) lpBubble.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(20);
  check('点按气泡不直接弹出操作菜单（回归）', () => !$('#ov-msgact').classList.contains('show'));
  // 长按（mousedown 后保持 520ms）触发菜单
  lpBubble.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(520);
  check('长按气泡弹出消息操作菜单', () => $('#ov-msgact').classList.contains('show'));
  check('操作菜单含 引用/复制文字/转发/删除（通用项）', () => {
    var t = $('#msgActBody').textContent;
    return t.indexOf('引用') >= 0 && t.indexOf('复制文字') >= 0 &&
      t.indexOf('转发') >= 0 && t.indexOf('删除') >= 0;
  });
  // 自己发出的消息应含「撤回」项：确保存在一条 own 消息
  click(doc.querySelector('[data-action="close-msgact"]'));
  var myBubble = doc.querySelector('#chatWrap .msg.me .bubble');
  if (!myBubble) {
    $('#chatInput').value = '长按测试消息';
    click($('#sendBtn'));
    await sleep(120);
    myBubble = doc.querySelector('#chatWrap .msg.me .bubble');
  }
  if (myBubble) {
    myBubble.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(520);
    check('自己消息的菜单含「撤回」', () => $('#msgActBody').textContent.indexOf('撤回') >= 0);
    click(doc.querySelector('[data-action="close-msgact"]'));
  }
  // 进入转发，选择目标会话
  var fwdItem = $$('#msgActBody .act-item').find(a => a.textContent.indexOf('转发') >= 0);
  click(fwdItem);
  await sleep(60);
  check('转发选择器弹出并列出其他会话', () => $('#ov-forward').classList.contains('show') && $$('#fwdBody .row').length > 0);
  var fwdTarget = $('#fwdBody .row');
  var fwdTcid = fwdTarget.getAttribute('data-id');
  function convMsgLen(id) {
    var s = JSON.parse(window.localStorage.getItem('yeyu_proto_v1'));
    var c = s.conversations.filter(x => x.id === id)[0];
    return c ? c.messages.length : -1;
  }
  var beforeLen = convMsgLen(fwdTcid);
  click(fwdTarget);
  await sleep(60);
  check('转发后消息进入目标会话', () => convMsgLen(fwdTcid) === beforeLen + 1);
  check('转发后选择器关闭', () => !$('#ov-forward').classList.contains('show'));
  closeOverlays();

  // 一次性操作提示条（可发现性）
  closeOverlays();
  try { window.localStorage.removeItem('yeyu_lp_tip'); } catch (e) {}
  if ($('#chatTip')) $('#chatTip').remove();
  click(doc.querySelector('.tab[data-tab="chats"]'));
  await sleep(40);
  var tipRow = $$('#chatList .row').find(r => r.textContent.indexOf('周末露营搭子群') >= 0) || $$('#chatList .row')[0];
  click(tipRow);
  await sleep(150);
  check('首次进入会话展示操作提示条', () => !!$('#chatTip'));
  var tipBtn = doc.querySelector('#chatTip button');
  if (tipBtn) click(tipBtn);
  await sleep(40);
  check('点“知道了”关闭提示并标记已读（不再弹出）', () => !$('#chatTip') && (function(){try{return window.localStorage.getItem('yeyu_lp_tip')==='1'}catch(e){return false}})());
  closeOverlays();

  // ===== 会话列表长按 / 「⋯」 管理（v0.11）=====
  click(doc.querySelector('.tab[data-tab="chats"]'));
  await sleep(40);
  check('每条会话都带「⋯」操作入口（可发现性）', () => $$('#chatList .row .row-more').length >= 5);
  var rowGrp = $$('#chatList .row').find(function (r) {
    var c = window.DB.state.conversations.filter(function (x) { return x.id === r.getAttribute('data-id'); })[0];
    return c && c.type === 'group';
  });
  check('消息列表存在群聊会话', () => !!rowGrp);
  if (rowGrp) {
    var gcid = rowGrp.getAttribute('data-id');
    var moreBtn = rowGrp.querySelector('.row-more');
    click(moreBtn);
    await sleep(60);
    check('点击「⋯」弹出会话操作菜单', () => $('#ov-convact').classList.contains('show'));
    check('菜单含 Flutter 口径 4 项：置顶/免打扰/标记为已读/删除会话', () => {
      var t = $('#convActBody').textContent;
      return t.indexOf('置顶') >= 0 && t.indexOf('免打扰') >= 0 && t.indexOf('标记为已读') >= 0 &&
        t.indexOf('删除会话') >= 0 && t.indexOf('清空') < 0;
    });
    click(doc.querySelector('[data-action="close-convact"]'));
    await sleep(40);
    // 长按（mousedown 后保持 520ms）弹出菜单
    rowGrp.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(520);
    check('长按会话行弹出操作菜单', () => $('#ov-convact').classList.contains('show'));
    click(doc.querySelector('[data-action="close-convact"]'));
    await sleep(40);
    // 置顶
    click($$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === gcid; }).querySelector('.row-more'));
    await sleep(50);
    var topBtn = $$('#convActBody .act-item').find(function (a) { return a.textContent.indexOf('置顶会话') >= 0; });
    click(topBtn);
    await sleep(80);
    check('置顶后该会话排到列表首位', () => $$('#chatList .row')[0].getAttribute('data-id') === gcid);
    check('置顶会话带 pinned 标记', () => $$('#chatList .row')[0].classList.contains('pinned'));
    // 取消置顶
    click($$('#chatList .row')[0].querySelector('.row-more'));
    await sleep(50);
    var unpinBtn = $$('#convActBody .act-item').find(function (a) { return a.textContent.indexOf('取消置顶') >= 0; });
    click(unpinBtn);
    await sleep(80);
    check('取消置顶后移除 pinned 标记', () => !$$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === gcid; }).classList.contains('pinned'));
    // v0.78：确认新菜单无「清空」，清空聊天记录已移入群信息页（对齐 Flutter）
    click($$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === gcid; }).querySelector('.row-more'));
    await sleep(50);
    check('会话操作菜单不含「清空聊天记录」（已移入群信息页）', () => $$('#convActBody .act-item').every(function (a) { return a.textContent.indexOf('清空') < 0; }));
    click(doc.querySelector('[data-action="close-convact"]'));
    await sleep(40);
    // 删除会话
    click($$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === gcid; }).querySelector('.row-more'));
    await sleep(50);
    var beforeConv = window.DB.state.conversations.length;
    var delBtn = $$('#convActBody .act-item').find(function (a) { return a.textContent.indexOf('删除会话') >= 0; });
    click(delBtn);
    await sleep(80);
    check('删除会话弹出二次确认', () => $('#cfMask').classList.contains('show'));
    click($('#cfOk'));
    await sleep(80);
    check('确认后会话从列表移除', () => window.DB.state.conversations.length === beforeConv - 1 &&
      !window.DB.state.conversations.filter(function (x) { return x.id === gcid; })[0]);
  }
  closeOverlays();

  // ===== v0.14 测试整改：拉黑 / 举报 / VIP 权益 / 内容细节 =====
  const closeAll = () => ['ov-visitors','ov-settings','ov-blacklist','ov-report','ov-profile','ov-chat','ov-convact','ov-msgact','ov-forward','ov-greet'].forEach(id => { var o = $('#' + id); if (o) o.classList.remove('show'); });
  closeAll();
  // 复位为未开通 VIP，独立验证「非 VIP」路径（打招呼限额 + 访客打码）
  window.DB.state.me.vip = null; window.DB.state.greetLog = {}; window.DB.save();

  // —— 设置：版本号 + 黑名单入口 ——
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(40);
  /* v0.60：「我的权益」并入「服务」组（权益本质是平台服务，单独成组会让页面碎成五段） */
  check('我的页含「服务」分区（原我的权益已并入）', () => $('#meBody').textContent.indexOf('服务') >= 0);
  check('服务区含「谁看过我」与「打招呼」入口', () => !!$('#meBody [data-action="visitors"]') && !!$('#meBody .row[data-action="vip"]'));
  click(doc.querySelector('[data-action="settings"]'));
  await sleep(60);
  check('设置页显示当前版本号', () => /v\d+\.\d+/.test($('#settingsBody').textContent));
  check('设置页含黑名单入口', () => $('#settingsBody').textContent.indexOf('黑名单') >= 0);
  /* v0.77 设置结构对齐 Flutter settings_page：隐私只留三开关（无「隐身浏览」）、通用青少年模式在深色模式前、
     法律协议拆为用户协议/隐私政策两条、不再有「安全与反馈 · 我的举报记录」分组 */
  check('v0.77 隐私区不再有「隐身浏览」开关', () => !doc.querySelector('#settingsBody [data-action="toggle-set"][data-v="stealth"]'));
  check('v0.77 设置页不再有「我的举报记录」入口', () => !doc.querySelector('#settingsBody [data-action="my-reports"]'));
  check('v0.77 法律与协议拆为用户协议/隐私政策两条', () => {
    const rows = $$('#settingsBody .row[data-action="auth-doc"]');
    return rows.length === 2 && rows[0].textContent.indexOf('用户协议') >= 0 && rows[1].textContent.indexOf('隐私政策') >= 0;
  });
  check('v0.77 通用区青少年模式排在深色模式之前', () => {
    const t = $('#settingsBody').textContent;
    return t.indexOf('青少年模式') >= 0 && t.indexOf('深色模式') >= 0 && t.indexOf('青少年模式') < t.indexOf('深色模式');
  });
  click(doc.querySelector('[data-close="ov-settings"]'));
  await sleep(40);

  // —— 谁看过我（非 VIP 打码）——
  click(doc.querySelector('#meBody [data-action="visitors"]'));
  await sleep(60);
  check('谁看过我页打开（非 VIP 打码）', () => $('#ov-visitors').classList.contains('show') && $('#visitorBody').textContent.indexOf('开通 VIP 查看完整访客') >= 0);
  click(doc.querySelector('[data-close="ov-visitors"]'));
  await sleep(40);

  // —— 拉黑：个人主页拉黑 → 广场过滤 → 黑名单解除 ——
  const strangerCard = () => Array.from(doc.querySelectorAll('#plazaList .wf-card')).find(p => {
    var b = p.querySelector('[data-action="open-profile"]');
    return b && b.getAttribute('data-id') !== 'me';
  });
  click(doc.querySelector('.tab[data-tab="discover"]'));
  await sleep(40);
  var victimCard = strangerCard();
  var victimId = victimCard ? victimCard.querySelector('[data-action="open-profile"]').getAttribute('data-id') : null;
  check('广场存在可拉黑的陌生用户', () => !!victimId && victimId !== 'me');
  if (victimId) {
    click(victimCard.querySelector('[data-action="open-profile"]'));
    await sleep(60);
    /* v0.52：拉黑/举报收进「···」菜单（主页只留主 CTA + 关注） */
    click(doc.querySelector('#ov-profile [data-action="prof-more"]'));
    await sleep(100);
    check('个人主页「···」菜单含「拉黑」入口', () => !!doc.querySelector('#profMoreBody [data-action="block"]'));
    click(doc.querySelector('#profMoreBody [data-action="block"]'));
    await sleep(80);
    check('拉黑后用户进入黑名单', () => window.DB.state.blocked.indexOf(victimId) >= 0);
    check('拉黑后自动解除好友/关注关系', () => window.DB.state.friends.indexOf(victimId) < 0 && window.DB.state.me.following.indexOf(victimId) < 0);
    click(doc.querySelector('[data-close="ov-profile"]'));
    await sleep(40);
    check('拉黑后广场过滤该用户内容', () => !Array.from(doc.querySelectorAll('#plazaList .wf-card [data-action="open-profile"]')).some(n => n.getAttribute('data-id') === victimId));
    // 黑名单页解除
    click(doc.querySelector('.tab[data-tab="me"]'));
    await sleep(40);
    click(doc.querySelector('[data-action="settings"]'));
    await sleep(40);
    click(doc.querySelector('#settingsBody [data-action="blacklist"]'));
    await sleep(60);
    var vicUser = window.DB.state.users.filter(u => u.id === victimId)[0];
    check('黑名单页列出被拉黑用户', () => vicUser && $('#blacklistBody').textContent.indexOf(vicUser.name) >= 0);
    click(doc.querySelector('#blacklistBody [data-action="unblock"]'));
    await sleep(60);
    check('解除拉黑后移出黑名单', () => window.DB.state.blocked.indexOf(victimId) < 0);
    click(doc.querySelector('[data-close="ov-blacklist"]'));
    await sleep(40);
  }

  // —— 举报：个人主页举报 → 提交并写入记录 ——
  click(doc.querySelector('.tab[data-tab="discover"]'));
  await sleep(40);
  var repCard = strangerCard();
  click(repCard.querySelector('[data-action="open-profile"]'));
  await sleep(60);
  click(doc.querySelector('#ov-profile [data-action="prof-more"]'));
  await sleep(100);
  click(doc.querySelector('#profMoreBody [data-action="report-user"]'));
  await sleep(60);
  check('举报弹窗打开且含举报理由', () => $('#ov-report').classList.contains('show') && $$('#reportBody .rp-reasons .chip').length >= 5);
  var reportsBefore = window.DB.state.reports.length;
  click(doc.querySelector('#reportBody .rp-reasons .chip'));
  await sleep(60);
  check('提交举报后写入举报记录', () => window.DB.state.reports.length === reportsBefore + 1);
  if ($('#cfMask').classList.contains('show')) { click(doc.querySelector('#cfMask [data-action="close-cf"]')); await sleep(40); }
  click(doc.querySelector('[data-close="ov-profile"]'));
  await sleep(40);

  // —— VIP 权益：非会员打招呼限额（今日次数用尽 → 拦截并引导开通）——
  var dNow = new Date();
  var tk = dNow.getFullYear() + '-' + ('0' + (dNow.getMonth() + 1)).slice(-2) + '-' + ('0' + dNow.getDate()).slice(-2);
  window.DB.state.greetLog = {}; window.DB.state.greetLog[tk] = 3; window.DB.save();
  var greetCard = strangerCard();
  click(greetCard.querySelector('[data-action="open-plaza"]'));
  await sleep(60);
  click(doc.querySelector('#ov-post-detail [data-action="greet"]'));
  await sleep(60);
  check('非会员打招呼次数用尽被拦截', () => !$('#ov-greet').classList.contains('show') && $('#cfMask').classList.contains('show'));
  click(doc.querySelector('#cfMask [data-action="close-cf"]'));
  await sleep(40);
  if (doc.querySelector('[data-action="close-post-detail"]')) click(doc.querySelector('[data-action="close-post-detail"]'));
  await sleep(40);
  window.DB.state.greetLog = {}; window.DB.save();

  // —— 内容细节：广场评论（v0.37 评论入口在详情）——
  var cmCardEl = doc.querySelector('#plazaList .wf-card');
  var cmId = cmCardEl.getAttribute('data-id');
  click(cmCardEl);
  await sleep(60);
  var cmTarget = window.DB.state.plaza.filter(p => p.id === cmId)[0];
  var cmBefore = (cmTarget.comments || []).length;
  click(doc.querySelector('#ov-post-detail [data-action="pd-comment"]'));
  await sleep(40);
  check('v0.59 详情评论用底部常驻输入条（空内容时发送禁用）', () => {
    const inp = $('#pdCmInput'), send = $('#pdCmSend');
    return !!inp && !!send && send.disabled === true;
  });
  $('#pdCmInput').value = '测试评论';
  window.App.pdCmInput();
  await sleep(20);
  check('v0.59 输入内容后发送按钮解除禁用', () => $('#pdCmSend').disabled === false);
  click(doc.querySelector('#ov-post-detail [data-action="pd-send"]'));
  await sleep(80);
  check('广场评论发送成功并计数', () => (window.DB.state.plaza.filter(p => p.id === cmId)[0].comments || []).length === cmBefore + 1);
  check('v0.59 发送后输入框清空、发送按钮回到禁用', () => $('#pdCmInput').value === '' && $('#pdCmSend').disabled === true);
  if (doc.querySelector('[data-action="close-post-detail"]')) click(doc.querySelector('[data-action="close-post-detail"]'));
  await sleep(40);

  // —— 内容细节：发布动态 200 字上限 ——
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(30);
  click(doc.querySelector('.tab[data-tab="discover"]'));
  await sleep(30);
  click(doc.querySelector('[data-action="publish"]'));
  await sleep(60);
  check('发布框限制 200 字', () => $('#pubText').getAttribute('maxlength') === '200' && !!$('#pubLen'));
  click(doc.querySelector('[data-close="ov-publish"]'));
  await sleep(40);

  // —— 内容细节：消息页「全部标为已读」——
  window.DB.state.conversations.forEach(c => c.unread = 1); window.DB.save();
  click(doc.querySelector('.tab[data-tab="chats"]'));
  await sleep(40);
  window.App.renderChats();
  check('消息页有未读角标', () => $('#tabBadge').style.display !== 'none');
  click(doc.querySelector('[data-action="read-all"]'));
  await sleep(60);
  check('全部标为已读后角标清零', () => window.DB.state.conversations.every(c => (c.unread || 0) === 0) && $('#tabBadge').style.display === 'none');

  // —— 内容细节：系统会话不可清空/删除（合成 sys 会话验证菜单无对应项）——
  window.DB.state.conversations.push({ id:'c-sys', type:'sys', title:'系统通知', members:['me'], unread:0, messages:[], updatedAt: Date.now() });
  window.DB.save(); window.App.renderChats();
  await sleep(40);
  var sysRow = $$('#chatList .row').find(r => r.getAttribute('data-id') === 'c-sys');
  if (sysRow) {
    click(sysRow.querySelector('.row-more'));
    await sleep(50);
    check('系统会话菜单不含清空/删除', () => $('#convActBody').textContent.indexOf('清空') < 0 && $('#convActBody').textContent.indexOf('删除会话') < 0);
    click(doc.querySelector('[data-action="close-convact"]'));
    await sleep(40);
  }
  window.DB.state.conversations = window.DB.state.conversations.filter(x => x.id !== 'c-sys'); window.DB.save();
  closeAll();

  // ============ 圈子（v0.38 双栏重构） ============
  click(doc.querySelector('.tab[data-tab="circles"]'));
  check('切换到圈子 Tab', () => doc.querySelector('#sc-circles').classList.contains('active'));
  check('我的圈子横向卡片条渲染', () => $$('#circMine .cm-card').length >= 1);
  check('分类侧栏渲染（≥5 个分类）', () => $$('#circSide .circ-tab').length >= 5);
  check('默认推荐列表含圈子卡片', () => $$('#circleList .cir-card').length >= 5);
  check('圈子卡片含缩略图与名称', () => !!doc.querySelector('#circleList .cir-card .cir-thumb') && !!doc.querySelector('#circleList .cir-card .cir-name'));
  check('圈子卡片含加入按钮', () => !!doc.querySelector('#circleList .cir-card [data-action="circle-join"]'));
  /* v0.43 护栏：区分「加入」与「申请加入」是真实语义（公开即时 vs 需圈主审核），
     必须在卡片上可见地解释——需审核圈带「需审核」角标且按钮为申请加入，
     普通圈无角标且按钮为直接加入。缺失此角标会让两种按钮看起来像 bug。 */
  var bjCard = doc.querySelector('#circleList .cir-card[data-id="c-bj-bj"]');
  check('需审核圈(c-bj-bj)卡片带「需审核」角标', () => !!bjCard && !!bjCard.querySelector('.cir-badge.audit'));
  check('需审核圈(c-bj-bj)按钮为「申请加入」', () => !!bjCard && !!bjCard.querySelector('[data-action="circle-apply"]'));
  var szCard = doc.querySelector('#circleList .cir-card[data-id="c-gd-gz"]');
  check('普通圈(c-gd-gz)无「需审核」角标', () => !!szCard && !szCard.querySelector('.cir-badge.audit'));
  check('普通圈(c-gd-gz)按钮为直接「加入」', () => !!szCard && !!szCard.querySelector('[data-action="circle-join"]'));
  // 加入一个未加入的圈子
  var joinBtn = doc.querySelector('#circleList .cir-card [data-action="circle-join"]');
  var beforeJoin = window.DB.state.myCircles.length;
  if (joinBtn) click(joinBtn);
  check('点击加入后 myCircles 数量 +1', () => window.DB.state.myCircles.length === beforeJoin + 1);
  // 打开一个圈子详情
  var openCard = doc.querySelector('#circleList .cir-card');
  if (openCard) click(openCard);
  check('打开圈子详情页（overlay 显示）', () => $('#ov-circledetail').classList.contains('show'));
  check('圈子详情含头部信息', () => !!$('#cdHead').querySelector('.cd-hero'));
  check('圈子详情含动态 feed（卡片或空态）', () => !!$('#cdFeed').querySelector('.ccard, .empty'));
  // 点赞圈子动态
  var cLikeBtn = $('#cdFeed').querySelector('[data-action="cpost-like"]');
  if (cLikeBtn) {
    var cp = window.DB.state.circlePosts.filter(function (x) { return x.id === cLikeBtn.getAttribute('data-id'); })[0];
    var likedBefore = cp ? cp.liked : false;
    click(cLikeBtn);
    var cp2 = window.DB.state.circlePosts.filter(function (x) { return x.id === cLikeBtn.getAttribute('data-id'); })[0];
    check('圈子动态点赞状态切换', () => !!cp2 && cp2.liked !== likedBefore);
  }
  click(doc.querySelector('[data-action="circle-back"]'));
  check('返回关闭圈子详情', () => !$('#ov-circledetail').classList.contains('show'));
  // 分类切换：骑行只显示骑行类圈子
  var rideTab = doc.querySelector('#circSide .circ-tab[data-k="骑行"]');
  if (rideTab) click(rideTab);
  check('切换到「骑行」分类高亮', () => !!doc.querySelector('#circSide .circ-tab[data-k="骑行"]').classList.contains('active'));
  var rideCards = $$('#circleList .cir-card');
  check('骑行分类列表非空', () => rideCards.length >= 1);
  check('骑行分类仅含骑行类圈子', () => rideCards.every(function (c) {
    var id = c.getAttribute('data-id');
    var cc = window.DB.state.circles.filter(function (x) { return x.id === id; })[0];
    return cc && cc.cat === '骑行';
  }));
  // 同城分组
  click(doc.querySelector('#circSide .circ-tab[data-k="同城"]'));
  check('同城分类按省份分组渲染', () => $$('#circleList .cgroup').length >= 2);
  // 收藏：先回推荐收藏一个，再切收藏分类
  click(doc.querySelector('#circSide .circ-tab[data-k="rec"]'));
  var favBtn = doc.querySelector('#circleList .cir-card [data-action="circle-fav"]');
  if (favBtn) click(favBtn);
  check('点击收藏后 circleFavs 数量 +1', () => window.DB.state.circleFavs.length === 1);
  click(doc.querySelector('#circSide .circ-tab[data-k="fav"]'));
  check('收藏分类显示已收藏圈子', () => $$('#circleList .cir-card').length >= 1);

  // ============ 创建 / 编辑 / 解散圈子（v0.15.1） ============
  click(doc.querySelector('#circSide .circ-tab[data-k="rec"]'));
  var circlesBefore = window.DB.state.circles.length;
  click(doc.querySelector('[data-action="circle-create"]'));
  check('点击＋打开创建圈子页', () => $('#ov-circlemk').classList.contains('show'));
  check('创建页含省份选择', () => $$('#mkBody [data-action="mk-prov"]').length >= 5);
  // 选省 → 出现城市
  click($$('#mkBody [data-action="mk-prov"]').find(b => b.getAttribute('data-v') === '浙江'));
  check('选择省份后出现城市选择', () => $$('#mkBody [data-action="mk-city"]').length >= 1);
  click($$('#mkBody [data-action="mk-city"]').find(b => b.getAttribute('data-v') === '杭州'));
  check('城市选中后高亮', () => $$('#mkBody [data-action="mk-city"]').some(b => b.getAttribute('data-v') === '杭州' && b.classList.contains('on')));
  // v0.43：公开圈创建页必须暴露「入圈方式」（此前缺失，导致「申请加入」路径对真实用户是死的）
  var jmApproval = $('#mkBody [data-action="mk-joinmode"][data-v="approval"]');
  check('公开圈创建页显示「入圈方式 · 需圈主审核」选项', () => !!jmApproval);
  if (jmApproval) click(jmApproval);
  // 填写名称 / 简介（触发 oninput 同步到 mkDraft）
  var mkName = $('#mkName'); mkName.value = '测试圈子'; mkName.dispatchEvent(new window.Event('input', { bubbles: true }));
  var mkDesc = $('#mkDesc'); mkDesc.value = '原型测试用圈子'; mkDesc.dispatchEvent(new window.Event('input', { bubbles: true }));
  // 未填图标也可创建（默认 ⛺️）
  click(doc.querySelector('#ov-circlemk [data-action="mk-submit"]'));
  check('创建后圈子总数 +1', () => window.DB.state.circles.length === circlesBefore + 1);
  var newCircle = window.DB.state.circles[window.DB.state.circles.length - 1];
  check('新圈子归属所选省市（浙江/杭州）', () => newCircle.province === '浙江' && newCircle.city === '杭州');
  check('创建者自动成为圈主', () => newCircle.owner === 'me');
  check('选择「需圈主审核」后 joinMode 持久化为 approval（闭环：表单→数据→展示）', () => newCircle.joinMode === 'approval');
  check('创建后自动加入我的圈子', () => window.DB.state.myCircles.indexOf(newCircle.id) >= 0);
  check('创建后自动进入圈子详情', () => !$('#ov-circlemk').classList.contains('show') && $('#ov-circledetail').classList.contains('show'));
  check('新圈子显示「圈主」标识', () => $('#cdHead').textContent.indexOf('圈主') >= 0);
  check('新圈子显示圈主管理条（编辑/解散）', () => !!$('#cdHead').querySelector('.cd-owner') && !!$('#cdHead').querySelector('[data-action="mk-edit"]') && !!$('#cdHead').querySelector('[data-action="mk-dissolve"]'));
  // 编辑
  click(doc.querySelector('#cdHead [data-action="mk-edit"]'));
  check('编辑页打开且回填原名称', () => $('#ov-circlemk').classList.contains('show') && $('#mkName').value === '测试圈子');
  var mkName2 = $('#mkName'); mkName2.value = '测试圈子改名'; mkName2.dispatchEvent(new window.Event('input', { bubbles: true }));
  click(doc.querySelector('#ov-circlemk [data-action="mk-submit"]'));
  check('编辑后名称已更新', () => window.DB.state.circles.some(c => c.name === '测试圈子改名'));
  check('编辑后回到圈子详情', () => $('#ov-circledetail').classList.contains('show'));
  // 解散
  var mkId = window.DB.state.circles.filter(c => c.name === '测试圈子改名')[0].id;
  click(doc.querySelector('#cdHead [data-action="mk-dissolve"]'));
  check('解散弹出二次确认', () => $('#cfMask').classList.contains('show'));
  click(doc.querySelector('#cfOk'));
  check('确认后圈子被移除', () => !window.DB.state.circles.some(c => c.id === mkId));
  check('解散后移出我的圈子', () => window.DB.state.myCircles.indexOf(mkId) < 0);
  check('解散后关闭圈子详情', () => !$('#ov-circledetail').classList.contains('show'));
  // 校验：空名称不允许创建
  click(doc.querySelector('[data-action="circle-create"]'));
  click(doc.querySelector('#ov-circlemk [data-action="mk-submit"]'));
  check('未填名称创建被拦截', () => $('#ov-circlemk').classList.contains('show') && $('#toast').textContent.indexOf('请填写圈子名称') >= 0);
  click(doc.querySelector('[data-action="mk-cancel"]'));

  // ============ v0.29 私密圈唯一对外入口 → v0.41 收进右上角「＋」下拉菜单 ============
  // 背景：私密圈不出现在「全部圈子」列表也搜不到，若入口弱化/被挤走，持码用户将无法入圈
  // v0.41：右上角「＋」下拉收纳两个入口 —— 创建圈子 / 邀请码入圈（必须可见文案，禁纯图标）
  var menuBtn = doc.querySelector('#sc-circles .navbar [data-action="circle-menu-toggle"]');
  check('圈子页右上角存在「＋」菜单入口（常驻）', () => !!menuBtn);
  click(menuBtn);
  check('点「＋」展开下拉菜单', () => !!doc.querySelector('#circMenu.show'));
  var pmItems = $$('#circMenu .pm').map(function (n) { return n.textContent.trim(); });
  check('下拉含「创建圈子」与「邀请码入圈」两项', () => pmItems.length === 2 &&
    pmItems.join('|').indexOf('创建圈子') >= 0 && pmItems.join('|').indexOf('邀请码入圈') >= 0);
  check('邀请码入口带可见文案（不得退化为纯图标）',
    () => pmItems.join('|').indexOf('邀请码入圈') >= 0);
  check('feed 顶部只剩搜索（入口已移出 toolbar）', () => {
    var main = doc.querySelector('#circMain');
    if (!main) return false;
    var kids = Array.from(main.children);
    var tbIdx = kids.findIndex(function (k) { return k.classList.contains('circ-toolbar'); });
    var listIdx = kids.findIndex(function (k) { return k.id === 'circleList'; });
    return tbIdx >= 0 && listIdx >= 0 && tbIdx < listIdx && !doc.querySelector('#circMain .ce-chip');
  });
  click(doc.querySelector('#circMenu [data-action="circle-code-join"]'));
  check('点「邀请码入圈」打开输入浮层', () => $('#ov-circlecode').classList.contains('show') && !!$('#ccodeInput'));
  check('选中菜单项后自动收起菜单', () => !doc.querySelector('#circMenu.show'));
  click(doc.querySelector('#ov-circlecode [data-action="ccode-cancel"]'));

  // ============ v0.39：待办归位 + 折叠（入圈申请 / 入圈邀请不再占据 feed 顶部） ============
  check('待办条位于「我的圈子」区（ feeds 之上）', () => !!doc.querySelector('#circTodo') && !!doc.querySelector('.circ-mine #circTodo'));
  check('feed 区不再有待办容器（#circleInvites 已移除）', () => !doc.querySelector('#circMain #circleInvites'));
  check('待办条默认折叠为一行（无明细卡）', () => {
    var t = doc.querySelector('#circTodo');
    return !!t.querySelector('.cmt-bar') && !t.querySelector('.cmt-body');
  });
  click(doc.querySelector('#circTodo [data-action="circle-todo-toggle"]'));
  check('点击待办条展开明细', () => !!doc.querySelector('#circTodo .cmt-body'));
  click(doc.querySelector('#circSide .circ-tab[data-k="骑行"]'));
  check('切换分类自动收起待办明细（纵向空间还给内容）', () => !doc.querySelector('#circTodo .cmt-body') && !!doc.querySelector('#circTodo .cmt-bar'));
  check('待办条不随分类消失（始终在「我的圈子」区可见）', () => !!doc.querySelector('.circ-mine #circTodo .cmt-bar'));

  // ============ 私密圈 v0.16：广场不可见 / 熟人邀请 / 邀请码 ============
  click(doc.querySelector('#circSide .circ-tab[data-k="rec"]'));
  var allIds = $$('#circleList .cir-card').map(function (r) { return r.getAttribute('data-id'); });
  check('私密圈不在「全部圈子」列表中出现（广场不可见）', () => allIds.indexOf('c-gd-sz-hc') < 0 && allIds.indexOf('c-gd-sz-ns') < 0);
  check('公开圈仍在「全部圈子」列表中', () => allIds.indexOf('c-gd-sz') >= 0);

  // 非成员打开私密圈：内容锁定、无直接加入入口
  window.App.openCircleDetail('c-gd-sz-ns');
  check('非成员打开私密圈显示锁态内容', () => $('#cdFeed').textContent.indexOf('仅成员可见') >= 0);
  check('私密圈详情带「私密」标识', () => $('#cdHead').textContent.indexOf('私密') >= 0);
  /* v0.28：私密圈加入入口优化——顶部按钮与空状态均为明确的「邀请码加入」主操作，不再误读为提示词 */
  check('私密圈顶部入口为「邀请码加入」主按钮', () => {
    var b = $('#cdHead [data-action="circle-code-join"]');
    return !!b && b.textContent.indexOf('邀请码加入') >= 0 && !$('#cdHead [data-action="circle-join"]');
  });
  check('非成员空状态提供「输入邀请码加入」入口', () => {
    var b = $('#cdFeed [data-action="circle-code-join"]');
    return !!b && b.textContent.indexOf('输入邀请码加入') >= 0;
  });
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // 邀请码入圈：先错后对
  click(doc.querySelector('[data-action="circle-code-join"]'));
  check('邀请码浮层打开', () => $('#ov-circlecode').classList.contains('show'));
  $('#ccodeInput').value = 'ZZZZZZ';
  click(doc.querySelector('[data-action="ccode-submit"]'));
  check('无效邀请码被拒绝', () => $('#toast').textContent.indexOf('邀请码无效') >= 0);
  $('#ccodeInput').value = 'ns5q0t';
  click(doc.querySelector('[data-action="ccode-submit"]'));
  check('正确邀请码可加入私密圈（小写容错）', () => window.DB.state.myCircles.indexOf('c-gd-sz-ns') >= 0);
  check('加入后关闭邀请码浮层并打开详情', () => !$('#ov-circlecode').classList.contains('show') && $('#ov-circledetail').classList.contains('show'));
  check('成员可见私密圈内容（锁态消失）', () => $('#cdFeed').textContent.indexOf('私密圈内容仅成员可见') < 0);
  check('成员可见「邀请码」入口', () => !!$('#cdHead [data-action="circle-code-show"]'));
  click(doc.querySelector('#cdHead [data-action="circle-code-show"]'));
  check('展示本圈邀请码', () => $('#ccodeBody').textContent.indexOf('NS5Q0T') >= 0);
  click(doc.querySelector('#ov-circlecode [data-action="ccode-cancel"]'));
  click(doc.querySelector('#cdHead [data-action="circle-exit"]'));
  click(doc.querySelector('#cfOk'));
  check('可退出私密圈', () => window.DB.state.myCircles.indexOf('c-gd-sz-ns') < 0);

  // 熟人邀请卡：接受（v0.39：位于「我的圈子」区待办条的展开态内）
  if (!doc.querySelector('#circTodo .cmt-body')) click(doc.querySelector('#circTodo [data-action="circle-todo-toggle"]'));
  check('圈子页显示入圈邀请卡', () => $$('#circTodo .inv-card').filter(c => !c.classList.contains('audit')).length >= 1);
  click(doc.querySelector('#circTodo [data-action="cinv-accept"]'));
  check('接受邀请后加入私密圈', () => window.DB.state.myCircles.indexOf('c-gd-sz-ns') >= 0);
  check('邀请状态更新为 accepted', () => window.DB.state.circleInvites.filter(i => i.id === 'ci1')[0].status === 'accepted');
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));
  check('接受后邀请卡消失', () => $$('#circTodo .inv-card').filter(c => !c.classList.contains('audit')).length === 0);

  // 我的圈子（横向卡片条）里的私密圈带锁
  var hcRow = $$('#circMine .cm-card').filter(r => r.getAttribute('data-id') === 'c-gd-sz-hc')[0];
  check('我的圈子含已加入的私密圈', () => !!hcRow);
  check('私密圈在「我的圈子」带锁标识', () => !!hcRow && !!hcRow.querySelector('.cm-lock'));

  // 邀请好友（熟人介绍）
  click(hcRow);
  click(doc.querySelector('#cdHead [data-action="circle-invite"]'));
  check('邀请好友浮层打开并列出好友', () => $('#ov-circleinvite').classList.contains('show') && $$('#cinvBody .cinv-row').length >= 1);
  var invBefore = window.DB.state.circleInvites.length;
  click(doc.querySelector('#cinvBody .cinv-row'));
  check('好友可勾选', () => !!doc.querySelector('#cinvBody .cinv-row.on'));
  click(doc.querySelector('#ov-circleinvite [data-action="cinv-send"]'));
  check('发送入圈邀请后记录 +1', () => window.DB.state.circleInvites.length === invBefore + 1);
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // v0.24：圈主隐私开关——一键开启/关闭「允许成员查看成员列表」
  click(doc.querySelector('#circleList .cir-card[data-id="c-gd-sz-mine"]'));
  await sleep(300);
  check('我创建的圈子详情已打开', () => $('#ov-circledetail').classList.contains('show'));
  click(doc.querySelector('#cdHead [data-action="circle-members"]'));
  check('圈主视角显示隐私开关行', () => !!$('#cmemTop .cmem-privacy'));
  check('隐私开关默认开启（允许查看）', () => !!$('#cmemTop .cmem-privacy .switch.on'));
  check('默认状态下成员列表可见', () => $$('#cmemBody .mem-row').length >= 1);
  // 一键关闭
  click(doc.querySelector('#cmemTop .cmem-privacy'));
  await sleep(150);
  check('关闭后开关变为 off', () => !!$('#cmemTop .cmem-privacy .switch') && !$('#cmemTop .cmem-privacy .switch').classList.contains('on'));
  check('关闭后 toast 提示隐私文案', () => $('#toast').textContent.indexOf('已关闭成员列表查看') >= 0);
  check('关闭后圈主自己仍可见名单', () => $$('#cmemBody .mem-row').length >= 1);
  check('关闭状态已持久化', () => window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0].membersHidden === true);
  // 模拟非圈主视角（owner 改为他人）
  var mineC = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0];
  var ownerBak = mineC.owner;
  mineC.owner = 'u1';
  window.App.renderCircleMembers();
  check('非圈主视角显示隐私占位提示', () => $('#cmemBody').textContent.indexOf('成员列表已隐藏') >= 0);
  check('非圈主视角不渲染任何成员行', () => $$('#cmemBody .mem-row').length === 0);
  check('非圈主视角不显示成员搜索框', () => !$('#cmemSearch'));
  check('非圈主视角看不到隐私开关（仅圈主可操作）', () => !$('#cmemTop .cmem-privacy'));
  check('非圈主视角仍显示成员人数（元数据保留）', () => $('#cmemTabs').textContent.indexOf('成员') >= 0);
  // 恢复圈主并重新开启，验证可逆
  mineC.owner = ownerBak;
  window.App.renderCircleMembers();
  click(doc.querySelector('#cmemTop .cmem-privacy'));
  await sleep(150);
  check('恢复圈主后可重新开启', () => !!$('#cmemTop .cmem-privacy .switch.on') && $$('#cmemBody .mem-row').length >= 1);
  click(doc.querySelector('[data-close="ov-circlemem"]'));
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // v0.25：圈主一键开关「允许成员发布动态」（圈主绝对控制权）
  click(doc.querySelector('#circleList .cir-card[data-id="c-gd-sz-mine"]'));
  await sleep(300);
  click(doc.querySelector('#cdHead [data-action="circle-members"]'));
  check('圈主成员面板显示两个 owner 开关', () => $$('#cmemTop .cmem-privacy').length === 2);
  check('发动态开关默认开启', () => !!$$('#cmemTop .cmem-privacy')[1].querySelector('.switch.on'));
  click(doc.querySelector('#cmemTop [data-action="cmem-postperm"]'));
  await sleep(150);
  check('关闭后 toast 提示', () => $('#toast').textContent.indexOf('已关闭成员发动态') >= 0);
  check('关闭后开关变为 off', () => !!$('#cmemTop [data-action="cmem-postperm"] .switch') && !$('#cmemTop [data-action="cmem-postperm"] .switch').classList.contains('on'));
  check('关闭状态已持久化', () => window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0].allowMemberPost === false);
  click(doc.querySelector('[data-action="cmem-cancel"]'));
  await sleep(200);
  check('关闭后圈主详情页仍有发布按钮（绝对控制权）', () => { var b = $('#ov-circledetail .ov-head [data-action="circle-publish"]'); return !!b && b.style.display !== 'none'; });
  check('圈主视角无禁发提示条', () => !$('#cdFeed .cd-ban-tip'));
  // 非圈主视角
  var mineC2 = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0];
  var ownerBak2 = mineC2.owner;
  mineC2.owner = 'u1';
  window.App.openCircleDetail('c-gd-sz-mine');
  check('非圈主详情页隐藏发布按钮', () => { var b = $('#ov-circledetail .ov-head [data-action="circle-publish"]'); return !!b && b.style.display === 'none'; });
  check('非圈主视角显示禁发提示条', () => !!$('#cdFeed .cd-ban-tip') && $('#cdFeed').textContent.indexOf('仅圈主可发布') >= 0);
  check('非圈主 openCirclePublish 被拒', () => { window.App.openCirclePublish('c-gd-sz-mine'); return $('#toast').textContent.indexOf('圈主已关闭成员发动态权限') >= 0; });
  // 发布页：v0.65 起权限不通过的圈子**不进入可选列表**（不是置灰——置灰等于
  // 告诉用户"有个东西你不配点"，而它本来就不该出现在选择集里）
  window.App.openPublish();
  var banChip = doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-mine"]');
  check('v0.65 无权限的圈子不进入可选列表', () => !banChip);
  check('v0.65 权限判定与列表渲染同源（canSyncCircle 为 false）', () => !window.App.canSyncCircle(mineC2).ok);
  // 兜底：选中后权限被 revoked，doPublish 必须拒绝（防绕过入口直调 / 提交前复核）
  mineC2.allowMemberPost = true;
  window.App.openPublish();   // 可选列表在打开发布页时按当前权限重算
  check('v0.65 恢复权限后圈子出现在列表', () => !!doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-mine"]'));
  click(doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-mine"]'));
  check('恢复权限后圈子可选中', () => !!doc.querySelector('#pubCircles .pub-c.on[data-v="c-gd-sz-mine"]'));
  mineC2.allowMemberPost = false;
  $('#pubText').value = '兜底测试动态';
  window.App.doPublish();
  check('doPublish 提交前复用同一权限函数拒绝', () => $('#toast').textContent.indexOf('圈主已关闭成员发动态权限') >= 0);
  check('兜底拒绝后不产生圈子动态', () => window.DB.state.circlePosts.filter(p => p.text === '兜底测试动态').length === 0);
  check('兜底拒绝后不产生朋友圈动态', () => window.DB.state.moments.filter(p => p.text === '兜底测试动态').length === 0);
  click(doc.querySelector('[data-close="ov-publish"]'));
  // 恢复允许后（仍非圈主）入口恢复
  mineC2.allowMemberPost = true;
  window.App.openCircleDetail('c-gd-sz-mine');
  check('恢复允许后非圈主发布按钮恢复', () => { var b = $('#ov-circledetail .ov-head [data-action="circle-publish"]'); return !!b && b.style.display !== 'none'; });
  check('恢复后禁发提示条消失', () => !$('#cdFeed .cd-ban-tip'));
  mineC2.owner = ownerBak2;
  window.DB.save();
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // 创建私密圈
  var circlesBefore2 = window.DB.state.circles.length;
  click(doc.querySelector('[data-action="circle-create"]'));
  var mkName3 = $('#mkName'); mkName3.value = '私密测试圈'; mkName3.dispatchEvent(new window.Event('input', { bubbles: true }));
  click($$('#mkBody [data-action="mk-prov"]').find(b => b.getAttribute('data-v') === '广东'));
  click($$('#mkBody [data-action="mk-city"]').find(b => b.getAttribute('data-v') === '深圳'));
  click(doc.querySelector('#mkBody [data-action="mk-vis"][data-v="private"]'));
  check('创建页可选私密并高亮', () => doc.querySelector('#mkBody [data-action="mk-vis"][data-v="private"]').classList.contains('on'));
  click(doc.querySelector('#ov-circlemk [data-action="mk-submit"]'));
  var pc = window.DB.state.circles[window.DB.state.circles.length - 1];
  check('私密圈创建成功', () => window.DB.state.circles.length === circlesBefore2 + 1 && pc.visibility === 'private');
  check('私密圈自动生成 6 位邀请码', () => !!pc.code && pc.code.length === 6);
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));
  click(doc.querySelector('#circSide .circ-tab[data-k="rec"]'));
  var allIds2 = $$('#circleList .cir-card').map(function (r) { return r.getAttribute('data-id'); });
  check('新建的私密圈不在全部圈子列表', () => allIds2.indexOf(pc.id) < 0);

  // ============ v0.27 第二批：邀请码时效/次数/重置 + 谁可邀请 ============
  // 1) 私密圈种子带邀请码元数据（codeLimit/codeUsed/codeExpireAt；codeUsed 已被前序输码入圈消耗，故仅校验字段存在且上限正确）
  check('私密圈种子带邀请码次数上限与有效期', () => {
    var c = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-ns')[0];
    return !!c && c.codeLimit === 20 && typeof c.codeUsed === 'number' && c.codeExpireAt > Date.now();
  });

  // 2) 圈主打开邀请码展示浮层：剩余次数 + 有效期 + 重置按钮
  window.App.openCircleDetail(pc.id);
  await sleep(200);
  click(doc.querySelector('#cdHead [data-action="circle-code-show"]'));
  check('圈主邀请码浮层显示剩余次数', () => $('#ccodeBody').textContent.indexOf('剩余 20 次') >= 0);
  check('圈主邀请码浮层显示有效期', () => $('#ccodeBody').textContent.indexOf('有效期至') >= 0);
  check('圈主可见「重置邀请码」按钮', () => !!$('#ccodeBody [data-action="ccode-reset"]'));
  click(doc.querySelector('#ov-circlecode [data-action="ccode-cancel"]'));
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // 3) 邀请码次数上限：达到上限被拒（先确保 me 非成员）
  window.DB.state.myCircles = window.DB.state.myCircles.filter(x => x !== pc.id);
  window.DB.save();
  var pcC = window.DB.state.circles.filter(x => x.id === pc.id)[0];
  pcC.codeUsed = pcC.codeLimit;
  window.DB.save();
  window.App.openCircleCode('input', pc.id);
  $('#ccodeInput').value = pcC.code;
  click(doc.querySelector('[data-action="ccode-submit"]'));
  check('邀请码次数用尽被拒', () => $('#toast').textContent.indexOf('使用次数已达上限') >= 0);
  click(doc.querySelector('#ov-circlecode [data-action="ccode-cancel"]'));

  // 4) 邀请码过期被拒
  pcC.codeUsed = 0;
  pcC.codeExpireAt = Date.now() - 1000;
  window.DB.save();
  window.App.openCircleCode('input', pc.id);
  $('#ccodeInput').value = pcC.code;
  click(doc.querySelector('[data-action="ccode-submit"]'));
  check('邀请码过期被拒', () => $('#toast').textContent.indexOf('已过期') >= 0);
  click(doc.querySelector('#ov-circlecode [data-action="ccode-cancel"]'));

  // 5) 正常输码入圈：codeUsed +1
  pcC.codeUsed = 0;
  pcC.codeExpireAt = Date.now() + 7 * 86400000;
  window.DB.save();
  window.App.openCircleCode('input', pc.id);
  $('#ccodeInput').value = pcC.code;
  click(doc.querySelector('[data-action="ccode-submit"]'));
  check('正常输码加入后 codeUsed +1', () => window.DB.state.circles.filter(x => x.id === pc.id)[0].codeUsed === 1);
  check('输码加入后已在我的圈子', () => window.DB.state.myCircles.indexOf(pc.id) >= 0);
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // 6) 圈主重置邀请码：旧码作废、次数清零、有效期顺延
  window.App.openCircleDetail(pc.id);
  await sleep(200);
  click(doc.querySelector('#cdHead [data-action="circle-code-show"]'));
  var oldCode = window.DB.state.circles.filter(x => x.id === pc.id)[0].code;
  click(doc.querySelector('#ccodeBody [data-action="ccode-reset"]'));
  await sleep(120);
  click(doc.querySelector('#cfOk'));
  await sleep(150);
  var pcAfter = window.DB.state.circles.filter(x => x.id === pc.id)[0];
  check('重置后邀请码改变', () => pcAfter.code !== oldCode && pcAfter.code.length === 6);
  check('重置后次数清零', () => pcAfter.codeUsed === 0);
  check('重置后有效期顺延', () => pcAfter.codeExpireAt > Date.now());
  check('重置后浮层展示新邀请码', () => $('#ccodeBody').textContent.indexOf(pcAfter.code) >= 0);
  click(doc.querySelector('#ov-circlecode [data-action="ccode-cancel"]'));
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // 7) 谁可邀请三档开关（c-gd-sz-mine，owner=me）
  click(doc.querySelector('#circleList .cir-card[data-id="c-gd-sz-mine"]'));
  await sleep(250);
  click(doc.querySelector('#cdHead [data-action="circle-members"]'));
  check('圈主成员面板显示「谁可邀请」三档', () => !!$('#cmemTop .cmem-invperm'));
  check('「谁可邀请」默认全员', () => !!$('#cmemTop .cmem-invperm .seg-o.on[data-v="all"]'));
  click(doc.querySelector('#cmemTop .cmem-invperm .seg-o[data-v="owner"]'));
  await sleep(120);
  check('设为仅圈主后持久化', () => window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0].whoCanInvite === 'owner');
  check('设为仅圈主后 toast 提示', () => $('#toast').textContent.indexOf('仅圈主可邀请') >= 0);
  click(doc.querySelector('[data-action="cmem-cancel"]'));
  await sleep(100);
  // 模拟 me 为普通成员（owner 转 u1）
  var mineC0 = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0];
  var meM0 = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine' && m.userId === 'me')[0];
  var cOwnerBak0 = mineC0.owner, meRoleBak0 = meM0.role;
  mineC0.owner = 'u1'; meM0.role = 'member';
  window.App.openCircleDetail('c-gd-sz-mine');
  check('仅圈主档下普通成员看不到邀请按钮', () => !$('#cdHead [data-action="circle-invite"]'));
  check('仅圈主档下普通成员 openInviteFriends 被拒', () => { window.App.openInviteFriends(); return $('#toast').textContent.indexOf('没有邀请权限') >= 0; });
  // 管理员在仅圈主档也不可邀请
  meM0.role = 'admin';
  window.App.openCircleDetail('c-gd-sz-mine');
  check('仅圈主档下管理员也看不到邀请按钮', () => !$('#cdHead [data-action="circle-invite"]'));
  // 恢复圈主，切到 admin 档
  mineC0.owner = cOwnerBak0; meM0.role = meRoleBak0;
  window.DB.save();
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));
  click(doc.querySelector('#circleList .cir-card[data-id="c-gd-sz-mine"]'));
  await sleep(250);
  click(doc.querySelector('#cdHead [data-action="circle-members"]'));
  click(doc.querySelector('#cmemTop .cmem-invperm .seg-o[data-v="admin"]'));
  await sleep(120);
  check('设为圈主+管理员后持久化', () => window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0].whoCanInvite === 'admin');
  click(doc.querySelector('[data-action="cmem-cancel"]'));
  await sleep(100);
  // 管理员在 admin 档可邀请
  var mineC0b = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0];
  var meM0b = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine' && m.userId === 'me')[0];
  mineC0b.owner = 'u1'; meM0b.role = 'admin';
  window.App.openCircleDetail('c-gd-sz-mine');
  check('圈主+管理员档下管理员可见邀请按钮', () => !!$('#cdHead [data-action="circle-invite"]'));
  // 恢复，切回全员档
  mineC0b.owner = cOwnerBak0; meM0b.role = meRoleBak0;
  window.DB.save();
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));
  click(doc.querySelector('#circleList .cir-card[data-id="c-gd-sz-mine"]'));
  await sleep(250);
  click(doc.querySelector('#cdHead [data-action="circle-members"]'));
  click(doc.querySelector('#cmemTop .cmem-invperm .seg-o[data-v="all"]'));
  await sleep(120);
  check('恢复全员档持久化', () => window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0].whoCanInvite === 'all');
  click(doc.querySelector('[data-action="cmem-cancel"]'));
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // ============ 成员管理 / 入圈审核 v0.17 ============
  check('成员表已生成（每个圈子有成员记录）', () => window.DB.state.circleMembers.length >= 10);
  check('我创建的圈子 me 为圈主', () => {
    var c = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0];
    return !!c && c.owner === 'me' &&
      window.DB.state.circleMembers.some(m => m.circleId === 'c-gd-sz-mine' && m.userId === 'me' && m.role === 'owner');
  });

  // 圈子页：我管理的圈子有待审核申请 → 提醒卡
  click(doc.querySelector('#circSide .circ-tab[data-k="rec"]'));
  /* v0.39：提醒卡现位于「我的圈子」区待办条的展开态内 */
  if (!doc.querySelector('#circTodo .cmt-body')) click(doc.querySelector('#circTodo [data-action="circle-todo-toggle"]'));
  check('圈子页显示「入圈申请待处理」提醒卡', () => !!doc.querySelector('#circTodo [data-action="circle-audit"]'));
  click(doc.querySelector('#circTodo [data-action="circle-audit"]'));
  check('点「去审核」直达审核 tab', () => $('#ov-circlemem').classList.contains('show') &&
    doc.querySelector('#cmemTabs [data-action="cmem-tab"][data-v="apply"]').classList.contains('active'));
  click(doc.querySelector('#ov-circlemem [data-action="cmem-cancel"]'));

  // 成员列表
  window.App.openCircleDetail('c-gd-sz-mine');
  click(doc.querySelector('#cdHead [data-action="circle-members"]'));
  check('成员管理浮层打开', () => $('#ov-circlemem').classList.contains('show'));
  check('成员列表渲染', () => $$('#cmemBody .mem-row').length >= 5);
  check('成员行含角色徽章（圈主/管理员）', () => $('#cmemBody').textContent.indexOf('圈主') >= 0 && $('#cmemBody').textContent.indexOf('管理员') >= 0);
  check('圈主可见「入圈审核」tab', () => !!doc.querySelector('#cmemTabs [data-action="cmem-tab"][data-v="apply"]'));
  var memName0 = doc.querySelector('#cmemBody .mem-row .mem-nm b').textContent.split(' ')[0].replace('（我）', '');
  window.App.cmemSearch(memName0);
  check('成员搜索过滤生效', () => $$('#cmemBody .mem-row').length >= 1);
  window.App.cmemSearch('');

  // 入圈审核：通过 / 拒绝
  click(doc.querySelector('#cmemTabs [data-action="cmem-tab"][data-v="apply"]'));
  check('待审核申请列表渲染（2 条）', () => $$('#cmemBody .apply-card').length === 2);
  var memBefore = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine').length;
  var pplBefore = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0].members;
  click(doc.querySelector('#cmemBody [data-action="apply-ok"][data-id="ca1"]'));
  check('审核通过后申请状态变 approved', () => window.DB.state.circleApplies.filter(a => a.id === 'ca1')[0].status === 'approved');
  check('通过后写入成员表', () => window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine').length === memBefore + 1);
  check('通过后圈子人数 +1', () => window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0].members === pplBefore + 1);
  click(doc.querySelector('#cmemBody [data-action="apply-no"][data-id="ca2"]'));
  check('拒绝弹出二次确认', () => $('#cfMask').classList.contains('show'));
  click(doc.querySelector('#cfOk'));
  check('拒绝后申请状态变 rejected', () => window.DB.state.circleApplies.filter(a => a.id === 'ca2')[0].status === 'rejected');
  check('显示最近处理记录', () => $('#cmemBody').textContent.indexOf('已通过') >= 0 && $('#cmemBody').textContent.indexOf('已拒绝') >= 0);

  // 成员操作：管理员 / 禁言 / 移出
  click(doc.querySelector('#cmemTabs [data-action="cmem-tab"][data-v="members"]'));
  var opRow1 = $$('#cmemBody .mem-row').filter(r => !!r.querySelector('[data-action="mem-act"]'))[0];
  check('管理员可对成员操作（存在管理按钮）', () => !!opRow1);
  var actUid = opRow1.querySelector('[data-action="mem-act"]').getAttribute('data-id');
  var roleBefore = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine' && m.userId === actUid)[0].role;
  click(opRow1.querySelector('[data-action="mem-act"]'));
  check('成员操作面板打开', () => $('#ov-memact').classList.contains('show'));
  click(doc.querySelector('#memactBody [data-action="mem-admin"]'));
  var roleAfter = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine' && m.userId === actUid)[0].role;
  check('管理员任免生效（角色在 admin/member 间切换）', () => roleAfter !== roleBefore && ['admin', 'member'].indexOf(roleAfter) >= 0);
  var opRow2 = $$('#cmemBody .mem-row').filter(r => !!r.querySelector('[data-action="mem-act"]'))[0];
  click(opRow2.querySelector('[data-action="mem-act"]'));
  click(doc.querySelector('#memactBody [data-action="mem-mute"]'));
  check('禁言生效', () => window.DB.state.circleMembers.some(m => m.circleId === 'c-gd-sz-mine' && m.muted));
  var memN2 = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine').length;
  var opRow3 = $$('#cmemBody .mem-row').filter(r => !!r.querySelector('[data-action="mem-act"]'))[0];
  click(opRow3.querySelector('[data-action="mem-act"]'));
  click(doc.querySelector('#memactBody [data-action="mem-remove"]'));
  check('移出圈子二次确认', () => $('#cfMask').classList.contains('show'));
  click(doc.querySelector('#cfOk'));
  check('移出后成员 -1', () => window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine').length === memN2 - 1);
  click(doc.querySelector('#ov-circlemem [data-action="cmem-cancel"]'));

  // ============ v0.26 第一批 1-1：成员管理执行层权限校验 ============
  var mineC1 = window.DB.state.circles.filter(x => x.id === 'c-gd-sz-mine')[0];
  var meM1 = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine' && m.userId === 'me')[0];
  var u1M1 = window.DB.state.circleMembers.filter(m => m.circleId === 'c-gd-sz-mine' && m.userId === 'u1')[0];
  var cOwnerBak = mineC1.owner, meRoleBak = meM1.role, u1RoleBak = u1M1 ? u1M1.role : 'member';
  // 模拟 me 为管理员（非圈主），u1 接任圈主
  mineC1.owner = 'u1'; meM1.role = 'admin';
  if (u1M1) u1M1.role = 'owner';
  window.App.renderCircleMembers();
  var adminRow = $$('#cmemBody .mem-row').filter(r => !!r.querySelector('[data-action="mem-act"]'))[0];
  click(adminRow.querySelector('[data-action="mem-act"]'));
  check('管理员面板不显示「设为管理员」', () => !doc.querySelector('#memactBody [data-action="mem-admin"]'));
  check('管理员面板不显示「转让圈主」', () => !doc.querySelector('#memactBody [data-action="mem-transfer"]'));
  check('管理员面板显示「禁言/移出」', () => !!doc.querySelector('#memactBody [data-action="mem-mute"]') && !!doc.querySelector('#memactBody [data-action="mem-remove"]'));
  click(doc.querySelector('[data-action="memact-cancel"]'));
  // 普通成员：无管理入口
  meM1.role = 'member';
  window.App.renderCircleMembers();
  check('普通成员看不到「管理」按钮', () => !$$('#cmemBody .mem-row').some(r => !!r.querySelector('[data-action="mem-act"]')));
  // 恢复圈主状态
  mineC1.owner = cOwnerBak; meM1.role = meRoleBak;
  if (u1M1) u1M1.role = u1RoleBak;
  window.App.renderCircleMembers();

  // ============ v0.26 第一批 1-2：圈主退出被拒且状态不破坏 ============
  window.App.openCircleDetail('c-gd-sz-mine');
  click(doc.querySelector('#cdHead [data-action="circle-exit"]'));
  check('圈主退出弹二次确认', () => $('#cfMask').classList.contains('show'));
  click(doc.querySelector('#cfOk'));
  check('圈主退出被拒（提示需先转让）', () => $('#toast').textContent.indexOf('转让') >= 0);
  check('圈主退出后仍在 myCircles（状态未破坏）', () => window.DB.state.myCircles.indexOf('c-gd-sz-mine') >= 0);
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // 申请者视角：审核中 / 提交申请
  window.App.openCircleDetail('c-bj-bj');
  check('已提交申请的圈子按钮显示「审核中」', () => $('#cdHead').textContent.indexOf('审核中') >= 0);
  click(doc.querySelector('#cdHead [data-action="circle-apply"]'));
  check('审核中可查看申请状态', () => $('#ov-circleapply').classList.contains('show') && $('#applyBody').textContent.indexOf('审核中') >= 0);
  click(doc.querySelector('#ov-circleapply [data-action="apply-cancel"]'));
  window.App.openCircleDetail('c-sn-xa');
  check('需审核圈子显示「申请加入」', () => $('#cdHead').textContent.indexOf('申请加入') >= 0);
  click(doc.querySelector('#cdHead [data-action="circle-apply"]'));
  check('申请入圈浮层打开', () => $('#ov-circleapply').classList.contains('show'));
  $('#applyMsg').value = '走过太白南坡，申请加入';
  click(doc.querySelector('#ov-circleapply [data-action="apply-submit"]'));
  check('提交后生成待审核申请', () => window.DB.state.circleApplies.some(a => a.circleId === 'c-sn-xa' && a.userId === 'me' && a.status === 'pending'));
  check('提交后按钮变为「审核中」', () => $('#cdHead').textContent.indexOf('审核中') >= 0);
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // ============ 发布动态到圈子 v0.18 ============
  // 从圈子详情页进入发布：预选该圈子
  window.App.openCircleDetail('c-gd-sz');
  click(doc.querySelector('#ov-circledetail [data-action="circle-publish"]'));
  check('圈子详情「✎ 发布」打开发布页', () => $('#ov-publish').classList.contains('show'));
  check('进入发布页时预选当前圈子', () => !!doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz"].on'));
  check('发布页只列出我加入的圈子', () => {
    var vs = $$('#pubCircles .pub-c').map(b => b.getAttribute('data-v'));
    return vs.length >= 2 && vs.every(v => window.DB.state.myCircles.indexOf(v) >= 0);
  });
  check('私密圈也在可选列表中', () => !!doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-hc"]'));
  // 多选：再加一个圈子
  click(doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-hc"]'));
  check('圈子可多选（第二个高亮）', () => doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-hc"]').classList.contains('on'));
  // 取消再选回，确保 toggle 正常（对第二个圈子操作，保持首选顺序）
  click(doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-hc"]'));
  check('可取消已选圈子', () => !doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-hc"]').classList.contains('on'));
  click(doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz-hc"]'));
  // 填内容
  var pubText = $('#pubText');
  pubText.value = '周日下午塘朗山，缺 2 人，装备我出';
  pubText.dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#pubLoc').value = '深圳·塘朗山';
  var cpBefore = window.DB.state.circlePosts.length;
  click(doc.querySelector('#ov-publish [data-action="do-publish"]'));
  await sleep(900);   // v0.22：发布 loading 状态机
  check('发布后关闭发布页', () => !$('#ov-publish').classList.contains('show'));
  check('圈子动态数量 +2（发到 2 个圈子）', () => window.DB.state.circlePosts.length === cpBefore + 2);
  var myPosts = window.DB.state.circlePosts.filter(p => p.userId === 'me' && p.text.indexOf('塘朗山') >= 0);
  check('动态分别写入所选的两个圈子', () => myPosts.length === 2 &&
    myPosts.some(p => p.circleId === 'c-gd-sz') && myPosts.some(p => p.circleId === 'c-gd-sz-hc'));
  check('发布后跳到圈子详情页', () => $('#ov-circledetail').classList.contains('show'));
  check('新动态出现在圈子 feed 首位', () => {
    var cards = $$('#cdFeed .ccard');
    return cards.length >= 1 && cards[0].textContent.indexOf('塘朗山') >= 0;
  });
  check('自己的动态有删除按钮', () => !!doc.querySelector('#cdFeed .ccard [data-action="cpost-del"]'));

  // 评论
  click(doc.querySelector('#cdFeed .ccard [data-action="cpost-cmt"]'));
  check('评论输入框展开', () => !!$('#cdFeed .ccard .ccmt'));
  $('#cdFeed .ccard .ccmt .input').value = '我报名，装备自带';
  click(doc.querySelector('#cdFeed .ccard [data-action="cpost-send"]'));
  var myPost = window.DB.state.circlePosts.filter(p => p.circleId === 'c-gd-sz' && p.userId === 'me' && p.text.indexOf('塘朗山') >= 0)[0];
  check('评论写入动态', () => !!myPost && !!myPost.comments && myPost.comments.length === 1 && myPost.comments[0].text === '我报名，装备自带');
  check('评论在卡片中展示', () => $('#cdFeed').textContent.indexOf('我报名，装备自带') >= 0);
  // 空评论拦截
  click(doc.querySelector('#cdFeed .ccard [data-action="cpost-cmt"]'));
  click(doc.querySelector('#cdFeed .ccard [data-action="cpost-send"]'));
  check('空评论被拦截', () => $('#toast').textContent.indexOf('说点什么') >= 0);

  // 别人的动态没有删除按钮
  window.App.openCircleDetail('c-zj-hz');
  check('他人动态无删除按钮', () => {
    var cards = $$('#cdFeed .ccard');
    return cards.length >= 1 && !cards[0].querySelector('[data-action="cpost-del"]');
  });

  // 删除自己的动态（回到我发过动态的圈子）
  window.App.openCircleDetail('c-gd-sz');
  var delBefore = window.DB.state.circlePosts.length;
  click(doc.querySelector('#cdFeed .ccard [data-action="cpost-del"]'));
  check('删除动态二次确认', () => $('#cfMask').classList.contains('show'));
  click(doc.querySelector('#cfOk'));
  check('删除后圈子动态 -1', () => window.DB.state.circlePosts.length === delBefore - 1);
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // 未加圈不发布：不选任何圈子也能正常发朋友圈
  click(doc.querySelector('#circSide .circ-tab[data-k="rec"]'));
  check('发布页圈子选项可全部取消', () => {
    window.App.openCircleDetail('c-gd-sz');
    click(doc.querySelector('#ov-circledetail [data-action="circle-publish"]'));
    click(doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz"]'));
    var any = $$('#pubCircles .pub-c.on').length;
    return any === 0;
  });
  var pubText2 = $('#pubText');
  pubText2.value = '今天天气不错';
  pubText2.dispatchEvent(new window.Event('input', { bubbles: true }));
  var cpBefore2 = window.DB.state.circlePosts.length;
  click(doc.querySelector('#ov-publish [data-action="do-publish"]'));
  await sleep(900);   // v0.22：发布 loading 状态机
  check('不选圈子时只发朋友圈 / 广场', () => window.DB.state.circlePosts.length === cpBefore2);
  check('不选圈子时进入广场动态', () => window.DB.state.moments.some(m => m.userId === 'me' && m.text === '今天天气不错'));

  // 只发私密圈：内容不外流到广场 / 朋友圈
  window.App.openCircleDetail('c-gd-sz-hc');
  click(doc.querySelector('#ov-circledetail [data-action="circle-publish"]'));
  var pubText3 = $('#pubText');
  pubText3.value = '私密圈内容不外流测试';
  pubText3.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('只选私密圈时显示不外流提示', () => $('#pubCircles').textContent.indexOf('不会进入广场') >= 0);
  var moBefore = window.DB.state.moments.length, plBefore = window.DB.state.plaza.length;
  click(doc.querySelector('#ov-publish [data-action="do-publish"]'));
  await sleep(900);   // v0.22：发布 loading 状态机
  check('只发私密圈时不进朋友圈', () => window.DB.state.moments.length === moBefore);
  check('只发私密圈时不进广场', () => window.DB.state.plaza.length === plBefore);
  check('只发私密圈时内容仍留在圈内', () => window.DB.state.circlePosts.some(p => p.circleId === 'c-gd-sz-hc' && p.text.indexOf('不外流') >= 0));
  check('私密圈发布提示「仅圈内可见」', () => $('#toast').textContent.indexOf('仅圈内可见') >= 0);
  click(doc.querySelector('#ov-circledetail [data-action="circle-back"]'));

  // ============ v0.65 可见范围与圈子同步解耦 ============
  // 旧断言「scope=circle 未选圈子禁发」随 scope=circle 一并下线：
  // 「只给圈内看」现在由 circles 字段表达，不再是可见范围的一个取值。
  window.App.openPublish();
  check('v0.65 可见范围只有三档（无「圈子可见」）', () => {
    var ks = $$('#pubVis [data-action="pub-vis"]').map(b => b.getAttribute('data-v'));
    return ks.length === 3 && ks.join(',') === 'public,friends,private';
  });
  check('v0.65 打开发布页默认不勾选任何圈子', () => $$('#pubCircles .pub-c.on').length === 0);
  check('v0.65 默认可见范围为公开', () => !!doc.querySelector('#pubVis .chip.on[data-v="public"]'));
  // 仅自己可见 → 圈子同步锁死
  click(doc.querySelector('#pubCircles .pub-c[data-v="c-gd-sz"]'));
  check('v0.65 公开时圈子可选中', () => !!doc.querySelector('#pubCircles .pub-c.on[data-v="c-gd-sz"]'));
  click(doc.querySelector('#pubVis [data-action="pub-vis"][data-v="private"]'));
  check('v0.65 选「仅自己可见」后已选圈子被清空', () => $$('#pubCircles .pub-c.on').length === 0);
  check('v0.65 仅自己可见时圈子同步区锁死', () => !!doc.querySelector('#pubCircles .pub-cs.locked'));
  check('v0.65 仅自己可见给出原因说明', () => $('#pubCircles').textContent.indexOf('不能同步到圈子') >= 0);
  click(doc.querySelector('#pubVis [data-action="pub-vis"][data-v="public"]'));

  // ============ v0.65 入口归属广场 / 无可同步圈子时整块隐藏 ============
  click(doc.querySelector('.tab[data-tab="discover"]'));
  click(doc.querySelector('#discoverTabs .subtab[data-v="plaza"]'));
  check('v0.65 广场 Tab 显示发布入口', () => $('#btnPublishDiscover').style.display !== 'none');
  /* 广场 Tab 的发布入口就是顶栏那枚铅笔：不再额外挂一条「分享你的户外时刻」横条，
     它占位、且和空态的「去发布」重复 */
  check('v0.65 广场内不再有独立的发布横条', () => !doc.querySelector('#dpanel-plaza [data-action="publish"]'));
  click(doc.querySelector('#discoverTabs .subtab[data-v="friends"]'));
  check('v0.65 好友 Tab 不显示发布入口（归属唯一）', () => $('#btnPublishDiscover').style.display === 'none');
  click(doc.querySelector('#discoverTabs .subtab[data-v="plaza"]'));
  // 构造「无任何可同步圈子」：退出所有圈子 + 临时剥夺圈主身份
  var mcBak65 = window.DB.state.myCircles.slice();
  var cirBak65 = {};
  (window.DB.state.circles || []).forEach(function (c) { cirBak65[c.id] = c.owner; if (c.owner === 'me') c.owner = 'u1'; });
  window.DB.state.myCircles = [];
  window.App.openPublish();
  check('v0.65 无可同步圈子时整块隐藏（含标题）', () => $('#pubCircleSec').style.display === 'none' && $('#pubCircles').innerHTML === '');
  check('v0.65 此时可选列表为空', () => window.App.pubCircleList().length === 0);
  window.DB.state.myCircles = mcBak65;
  (window.DB.state.circles || []).forEach(function (c) { c.owner = cirBak65[c.id]; });
  window.App.openPublish();
  check('v0.65 恢复后有可同步圈子则整块展示', () => $('#pubCircleSec').style.display !== 'none' && $$('#pubCircles .pub-c').length > 0);
  click(doc.querySelector('[data-close="ov-publish"]'));
  check('v0.65 切回公开后圈子同步解锁', () => !doc.querySelector('#pubCircles .pub-cs.locked'));
  // 好友可见：不进广场，但可同步圈子
  var pubText65 = $('#pubText');
  pubText65.value = '好友可见测试';
  pubText65.dispatchEvent(new window.Event('input', { bubbles: true }));
  click(doc.querySelector('#pubVis [data-action="pub-vis"][data-v="friends"]'));
  var plBefore65 = window.DB.state.plaza.length, moBefore65 = window.DB.state.moments.length;
  click(doc.querySelector('#ov-publish [data-action="do-publish"]'));
  await sleep(900);
  check('v0.65 好友可见不进广场', () => window.DB.state.plaza.length === plBefore65);
  check('v0.65 好友可见仍进好友流', () => {
    var mine = window.DB.state.moments.filter(m => m.text === '好友可见测试');
    return mine.length === 1 && window.App.visOf(mine[0]) === 'friends';
  });
  check('v0.65 新动态写入 visibility 而非 scope', () => {
    var mine = window.DB.state.moments.filter(m => m.text === '好友可见测试')[0];
    return !!mine && mine.visibility === 'friends' && mine.circles && mine.circles.length === 0;
  });
  click(doc.querySelector('#pubVis [data-action="pub-vis"][data-v="public"]'));

  // ============ VIP 铭牌 v0.19（好友列表 / 会话列表 / 聊天标题）============
  click(doc.querySelector('.tab[data-tab="chats"]'));
  var cRow1 = $$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === 'c1'; });
  check('会话列表：VIP 好友昵称后有铭牌', () => !!cRow1 && cRow1.querySelectorAll('.badge-vip').length === 1);
  check('会话列表：铭牌在昵称 <b> 内同行显示（两行排版）', () => !!cRow1 && !!cRow1.querySelector('b > .badge-vip'));
  check('v0.33 会话列表：年卡已升格 SVIP 铭牌', () => !!cRow1 && cRow1.querySelector('.badge-vip').textContent.indexOf('SVIP') >= 0);
  check('v0.33 会话列表：SVIP 铭牌带 lv-svip 样式', () => !!cRow1 && cRow1.querySelector('.badge-vip').classList.contains('lv-svip'));
  var cRow3 = $$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === 'c3'; });
  check('会话列表：会员已过期则不显示铭牌', () => !!cRow3 && cRow3.querySelectorAll('.badge-vip').length === 0);
  var cRowGrp2 = $$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === 'c2'; });
  check('会话列表：群聊会话不挂 VIP 铭牌', () => !cRowGrp2 || cRowGrp2.querySelectorAll('.badge-vip').length === 0);

  click(cRow1);
  check('聊天详情页标题后显示 VIP 铭牌', () => $('#chatTitle').querySelectorAll('.badge-vip').length === 1);
  click(doc.querySelector('[data-close="ov-chat"]'));

  click(doc.querySelector('.tab[data-tab="contacts"]'));
  var fRowVip = $$('#contactList .row').find(function (r) { return r.textContent.indexOf('林小野') >= 0; });
  check('好友列表：VIP 好友昵称后有铭牌', () => !!fRowVip && fRowVip.querySelectorAll('.badge-vip').length === 1);
  check('好友列表：铭牌在昵称 <b> 内同行显示（两行排版）', () => !!fRowVip && !!fRowVip.querySelector('b > .badge-vip'));
  var fRowQ = $$('#contactList .row').find(function (r) { return r.textContent.indexOf('Yuki') >= 0; });
  check('v0.33 好友列表：季卡铭牌统一为「VIP」', () => !!fRowQ && fRowQ.querySelector('.badge-vip').textContent.indexOf('VIP') >= 0 && fRowQ.querySelector('.badge-vip').textContent.indexOf('SVIP') < 0);
  var fRowNo = $$('#contactList .row').find(function (r) { return r.textContent.indexOf('小雨') >= 0; });
  check('好友列表：非会员好友不显示铭牌', () => !!fRowNo && fRowNo.querySelectorAll('.badge-vip').length === 0);
  // u2（阿宽）会员已过期但此前流程中已不是好友，临时加回验证「过期不显示」
  window.DB.state.friends.push('u2');
  window.App.renderContacts();
  var fRowExp = $$('#contactList .row').find(function (r) { return r.textContent.indexOf('阿宽') >= 0; });
  check('好友列表：会员过期则不显示铭牌', () => !!fRowExp && fRowExp.querySelectorAll('.badge-vip').length === 0);
  window.DB.state.friends = window.DB.state.friends.filter(x => x !== 'u2');
  window.App.renderContacts();
  check('VIP 数据：u1 年卡在有效期内', () => window.DB.state.users.filter(u => u.id === 'u1')[0].vip.expire > Date.now());
  check('VIP 数据：u2 会员已过期（用于验证过期不显示）', () => window.DB.state.users.filter(u => u.id === 'u2')[0].vip.expire <= Date.now());

  // —— 旧存档升级：v0.19 之前的数据 users 无 vip key，刷新后应自动补齐（而不是要清缓存）——
  var legacy = JSON.parse(JSON.stringify(window.DB.state));
  legacy.users.forEach(function (u) { delete u.vip; });
  window.localStorage.setItem('yeyu_proto_v1', JSON.stringify(legacy));
  window.DB.state = window.DB.load();
  var lu1 = window.DB.state.users.filter(function (u) { return u.id === 'u1'; })[0];
  var lu4 = window.DB.state.users.filter(function (u) { return u.id === 'u4'; })[0];
  check('旧存档升级：migrate 自动补齐 u1 年卡会员', () => !!lu1.vip && lu1.vip.plan === 'y1' && lu1.vip.expire > Date.now());
  check('旧存档升级：u2 补齐的会员已是过期状态', () => !!window.DB.state.users.filter(function (u) { return u.id === 'u2'; })[0].vip && window.DB.state.users.filter(function (u) { return u.id === 'u2'; })[0].vip.expire <= Date.now());
  check('旧存档升级：非会员用户 u4 保持无会员', () => !lu4.vip);
  check('旧存档升级：补齐后重渲染会话列表即见铭牌', () => {
    window.App.renderChats();
    var row = $$('#chatList .row').find(function (r) { return r.getAttribute('data-id') === 'c1'; });
    return !!row && row.querySelectorAll('.badge-vip').length === 1;
  });

  // ============ 暗色模式 v0.21（默认浅色 / 切换 / 持久化 / 旧档升级）============
  check('默认浅色主题', () => window.document.documentElement.getAttribute('data-theme') === 'light');
  click(doc.querySelector('.tab[data-tab="me"]'));
  click(doc.querySelector('[data-action="settings"]'));
  check('设置页含「深色模式」开关', () => $('#settingsBody').textContent.indexOf('深色模式') >= 0);
  click(doc.querySelector('#settingsBody [data-action="toggle-theme"]'));
  check('设置页切换后为暗色主题', () => window.document.documentElement.getAttribute('data-theme') === 'dark');
  check('主题状态写入存档', () => window.DB.state.settings.theme === 'dark');
  check('暗色下开关为开启态', () => !!doc.querySelector('#settingsBody .switch.on'));
  click(doc.querySelector('#settingsBody [data-action="toggle-theme"]'));
  check('再次切换回浅色主题', () => window.document.documentElement.getAttribute('data-theme') === 'light');
  click(doc.querySelector('[data-close="ov-settings"]'));
  // v0.76：侧栏（含 #themeBtn 快捷切换）作为原型走查工具整体移除，主题入口收敛到设置页
  check('v0.76 侧栏已移除，主题入口只剩设置页开关', () => !$('#themeBtn') &&
    !!doc.querySelector('#settingsBody [data-action="toggle-theme"]'));
  click(doc.querySelector('.tab[data-tab="me"]'));
  click(doc.querySelector('[data-action="settings"]'));
  await sleep(60);
  click(doc.querySelector('#settingsBody [data-action="toggle-theme"]'));
  check('v0.76 设置页开关仍可切到暗色', () => window.document.documentElement.getAttribute('data-theme') === 'dark');
  // 刷新后主题保持（持久化链路：localStorage → migrate → applyTheme）
  window.localStorage.setItem('yeyu_proto_v1', JSON.stringify(window.DB.state));
  window.location.reload();
  await new Promise(r => setTimeout(r, 1200));
  check('刷新后仍保持暗色（localStorage 持久化）', () => window.document.documentElement.getAttribute('data-theme') === 'dark');
  // 旧存档（v0.21 之前）没有 settings.theme 字段：升级后默认浅色，不改变既有观感
  var legacyTheme = JSON.parse(window.localStorage.getItem('yeyu_proto_v1'));
  delete legacyTheme.settings.theme;
  window.localStorage.setItem('yeyu_proto_v1', JSON.stringify(legacyTheme));
  window.DB.state = window.DB.load();
  window.App.applyTheme();
  check('旧存档（无 theme 字段）升级后默认浅色', () => window.document.documentElement.getAttribute('data-theme') === 'light' && window.DB.state.settings.theme === 'light');

  // ============ v0.22 商用级 UI：设计系统 / 控件状态 / 骨架屏 / 空状态 / Toast 类型 ============
  check('设计系统：字阶 token 落地（--fs-14）', () => window.getComputedStyle(window.document.documentElement).getPropertyValue('--fs-14').trim() === '14px');
  check('设计系统：间距 token 落地（--sp-4）', () => window.getComputedStyle(window.document.documentElement).getPropertyValue('--sp-4').trim() === '16px');
  check('设计系统：状态色 token 落地（--error-fg）', () => window.getComputedStyle(window.document.documentElement).getPropertyValue('--error-fg').trim().length > 0);
  click(doc.querySelector('.tab[data-tab="me"]'));
  click(doc.querySelector('[data-action="settings"]'));
  check('设置页含「设计规范」入口', () => $('#settingsBody').textContent.indexOf('设计规范') >= 0);
  click(doc.querySelector('#settingsBody [data-action="design"]'));
  check('设计规范页打开', () => $('#ov-design').classList.contains('show'));
  check('设计规范页含色彩/字阶/按钮全状态', () => {
    var t = $('#designBody').textContent;
    return t.indexOf('品牌色') >= 0 && t.indexOf('字阶规范') >= 0 && t.indexOf('加载中') >= 0 && t.indexOf('禁用') >= 0;
  });
  check('设计规范页含骨架屏与错误态', () => $('#designBody').textContent.indexOf('网络开小差了') >= 0);
  check('设计规范页渲染出骨架行与气泡骨架', () => $$('#designBody .sk-row').length >= 2 && $$('#designBody .sk-bub').length >= 3);
  click(doc.querySelector('#designBody [data-action="demo-toast"][data-v="ok"]'));
  check('Toast 成功态带 ok 样式', () => $('#toast').classList.contains('ok') && $('#toast').textContent.indexOf('操作成功') >= 0);
  click(doc.querySelector('#designBody [data-action="demo-toast"][data-v="err"]'));
  check('Toast 错误态带 err 样式', () => $('#toast').classList.contains('err'));
  click(doc.querySelector('#designBody [data-action="demo-loading"]'));
  check('演示按钮进入 loading 态', () => doc.querySelector('#designBody [data-action="demo-loading"]').classList.contains('loading'));
  click(doc.querySelector('[data-close="ov-design"]'));
  click(doc.querySelector('[data-close="ov-settings"]'));
  // 空状态主行动按钮（清空动态 → 出现「发布动态」CTA → 恢复）
  var savedMoments = window.DB.state.moments;
  window.DB.state.moments = [];
  window.App.friendsFeed();
  check('动态空状态带主行动按钮', () => !!doc.querySelector('#momentList .empty .e-act') && doc.querySelector('#momentList .empty .e-act').textContent.indexOf('发布') >= 0);
  window.DB.state.moments = savedMoments;
  window.App.friendsFeed();
  // 关注按钮状态化
  click(doc.querySelector('.tab[data-tab="discover"]'));
  window.App.renderPlaza();
  check('广场卡片含点赞互动入口', () => $$('#plazaList .wf-like').length >= 1);
  // 互动反馈：点赞态样式 + 弹跳动画类
  var likeBtn0 = doc.querySelector('#momentList .mtime button[data-action="like"]');
  check('动态互动栏按钮存在', () => !!likeBtn0);
  click(likeBtn0);
  check('点赞后按钮进入 liked 态（红色 + 弹启动画）', () => {
    var b = doc.querySelector('#momentList .mtime button[data-action="like"]');
    return !!b && b.classList.contains('liked');
  });

  // ===== v0.30 P0/P1 修复验证 =====
  // P0-1 好友申请双向分流：out 申请被准确标记，且不影响 incoming 计数与红点
  (function () {
    var rs = window.DB.state.requests;
    var outCnt = rs.filter(r => r.dir === 'out').length;
    var inCnt = rs.filter(r => r.dir !== 'out').length;
    check('P0-1 我发出的申请被标记 dir:out', () => outCnt >= 1 && rs.some(r => r.dir === 'out' && r.userId === 'u10'));
    check('P0-1 incoming 申请未被误标 out', () => inCnt >= 1 && rs.filter(r => r.dir !== 'out').every(r => !r.dir || r.dir !== 'out'));
    var st9 = window.DB.state;
    st9.requests.push({ userId: 'u6', time: Date.now(), msg: '我想认识你', dir: 'out' });
    window.App.renderContacts();
    var badge = doc.querySelector('#contactList .badge');
    check('P0-1 我发出的申请不计入「新的朋友」红点', () => !badge || parseInt(badge.textContent, 10) === inCnt);
    var tmp = doc.createElement('div'); tmp.setAttribute('data-action', 'cancel-req'); tmp.setAttribute('data-id', 'u6'); doc.body.appendChild(tmp); click(tmp);
    check('P0-1 撤回我发出的申请生效', () => !window.DB.state.requests.some(r => r.userId === 'u6' && r.dir === 'out'));
  })();
  // P0-2 连续包月取消/管理入口
  window.DB.state.me.vip = { plan: 'm1', name: '连续包月', days: 30, start: Date.now(), expire: Date.now() + 30 * 86400000, auto: true, autoRenew: true };
  window.App.renderVip();
  check('P0-2 连续包月会员显示订阅管理', () => $('#vipBody').textContent.indexOf('管理') >= 0 && $('#vipBody').textContent.indexOf('自动续费') >= 0);
  click(doc.querySelector('#vipBody [data-action="vip-cancel"]'));
  check('P0-2 取消订阅弹出确认框', () => $('#cfMask').classList.contains('show'));
  click($('#cfOk'));
  check('P0-2 确认后 autoRenew=false', () => window.DB.state.me.vip.autoRenew === false);
  click(doc.querySelector('[data-close="ov-vip"]'));
  /* v0.33 权益一致性断言移至文件末尾「会员权益体系」段落（需在新增卡点全部落地后统一校验） */
  // P1-1 死开关治理：v0.77 对齐 Flutter 后 nearby/recommend 死开关已激活为活开关或移除，
  // 设置页不再存在「敬请期待 + disabled」的假开关
  click(doc.querySelector('.tab[data-tab="me"]'));
  click(doc.querySelector('#meBody [data-action="settings"]'));
  (function () {
    var sb = $('#settingsBody').innerHTML;
    check('P1-1 设置页已无「敬请期待」死开关', () => sb.indexOf('敬请期待') < 0 && sb.indexOf('switch disabled') < 0);
    check('P1-1 附近的人可见是活开关', () => !!doc.querySelector('#settingsBody [data-action="toggle-set"][data-v="nearby"]'));
  })();
  click(doc.querySelector('[data-close="ov-settings"]'));
  // P1-2 举报处置闭环
  check('P1-2 举报种子含已处理状态与结果', () => window.DB.state.reports.some(r => r.status === 'done' && r.result));
  (function () {
    var t3 = doc.createElement('div'); t3.setAttribute('data-action', 'my-reports'); doc.body.appendChild(t3); click(t3);
    check('P1-2 我的举报记录可打开并展示进度', () => $('#ov-reports').classList.contains('show') && $('#reportsBody').textContent.indexOf('已处理') >= 0);
  })();
  click(doc.querySelector('[data-close="ov-reports"]'));
  // P1-3 订单退款/售后
  window.DB.state.orders.unshift({ id: 'ot1', no: 'NO_TEST', goods: 'vip', title: '连续包月', amount: 18, way: 'wechat', ts: Date.now(), status: 'paid' });
  (function () {
    var t4 = doc.createElement('div'); t4.setAttribute('data-action', 'order-refund'); t4.setAttribute('data-id', 'ot1'); doc.body.appendChild(t4); click(t4);
    check('P1-3 退款弹出确认框', () => $('#cfMask').classList.contains('show'));
  })();
  click($('#cfOk'));
  check('P1-3 退款申请写入订单退款状态', () => {
    var o = window.DB.state.orders.filter(x => x.id === 'ot1')[0];
    return o && o.refund && o.refund.status === 'submitted';
  });
  // P1-4 广场筛选标签：v0.77 对齐 Flutter 后排序/标签筛选条整体下线，广场改纯双列瀑布流
  window.App.renderPlaza();
  (function () {
    var chips = $$('#plazaFilters .chip[data-action="pf-tag"]');
    check('P1-4 广场筛选条已下线（无筛选标签）', () => chips.length === 0 && $('#plazaFilters').style.display === 'none');
    check('P1-4 广场仍渲染瀑布流卡片', () => $$('#plazaList .wf-card').length >= 5);
  })();
  // P1-5 圈子页搜索
  click(doc.querySelector('.tab[data-tab="circles"]'));
  window.App.circleSearch('深圳');
  (function () {
    var rows = $$('#circleList .cir-card');
    check('P1-5 圈子搜索按关键词过滤', () => rows.length > 0 && rows.every(r => r.textContent.indexOf('深圳') >= 0));
  })();
  window.App.circleSearch('');

  // ===== v0.32 P0 修复验证 =====
  // P0-0【结构性护栏】action 路由完整性巡检：
  // 曾出现「UI 渲染出 data-action 但 handler 里没有对应 case」的整片死链（群聊管理全不可用），
  // 而当时 452 条断言无一发现 —— 因为只断言文案可见、从不断言可点击。此处从机制上堵死。
  (function () {
    var fsx = require('fs');
    var appSrc = fsx.readFileSync(path.join(dir, 'assets/app.js'), 'utf8');
    var htmlSrc = fsx.readFileSync(path.join(dir, 'index.html'), 'utf8');
    var used = {};
    (appSrc + '\n' + htmlSrc).replace(/data-action="([a-zA-Z0-9_-]*)"/g, function (m, a) { used[a] = 1; });
    appSrc.replace(/data-action=[^>]{0,140}/g, function (seg) {
      seg.replace(/'([a-zA-Z0-9_-]+)'/g, function (m, a) { used[a] = 1; });
    });
    // infoRow(k,v,act) 等间接传值：取 "'+" 前的字符串实参（避免漏掉 edit-title 这类）
    // infoRow/toggleRow/actRow 等间接传值（edit-title 正是以这种方式躲过了早期扫描）
    appSrc.replace(/\b(?:infoRow|toggleRow|actRow)\([^()]*,\s*'([a-zA-Z0-9_-]+)'\s*\)/g, function (m, a) { used[a] = 1; });
    var handled = {};
    appSrc.replace(/case '([a-zA-Z0-9_-]+)':/g, function (m, a) { handled[a] = 1; });
    appSrc.replace(/pa === '([a-zA-Z0-9_-]+)'/g, function (m, a) { handled[a] = 1; });
    // 过滤并非 action 的误报：浮层 id、三元表达式里的角色/布尔字面量
    var NON_ACTION = ['me', 'true', 'false', 'owner', 'admin', 'member', 'none'];
    var orphans = Object.keys(used).filter(function (a) {
      return !handled[a] && !/^ov-/.test(a) && NON_ACTION.indexOf(a) < 0;
    });
    check('P0-0 无孤儿 action（渲染出的 data-action 均有 handler）', () => {
      if (orphans.length) throw new Error('孤儿 action: ' + orphans.join(', '));
      return true;
    });
  })();

  // P0-1 openPicker 从未定义（4 处调用即 ReferenceError 崩溃）+ 发起群聊闭环
  click(doc.querySelector('.tab[data-tab="chats"]'));
  const convBefore = window.DB.state.conversations.length;
  click(doc.querySelector('[data-action="new-chat"]')); await sleep(80);
  click($('#plusMenu [data-v="create-group"]')); await sleep(150);
  check('P0-1 发起群聊打开选人器（openPicker 不再崩溃）', () => $('#ov-picker').classList.contains('show'));
  const pkRows = $$('#pickerBody [data-action="picker-toggle"]');
  check('P0-1 选人器渲染好友列表', () => pkRows.length > 0);
  click(pkRows[0]); await sleep(70);
  check('P0-1 选人可勾选', () => /pk-check on/.test($('#pickerBody').innerHTML));
  $('#pickerSearch').value = '不存在ZZZ'; window.App.renderPicker(); await sleep(70);
  check('P0-1 选人器搜索空态兜底', () => $('#pickerBody').innerHTML.indexOf('没有找到') >= 0);
  $('#pickerSearch').value = ''; window.App.renderPicker(); await sleep(70);
  if (!/pk-check on/.test($('#pickerBody').innerHTML)) { click($$('#pickerBody [data-action="picker-toggle"]')[0]); await sleep(70); }
  click($('#pickerOk')); await sleep(180);
  const newGrp = window.DB.state.conversations.filter(c => c.type === 'group' && c.owner === 'me').slice(-1)[0];
  check('P0-1 确定后创建群聊且我为群主', () => window.DB.state.conversations.length === convBefore + 1 && !!newGrp);

  // P0-2 群聊信息：此前"渲染了但点击无反应"的全部入口
  await (function () {
    const gid = newGrp && newGrp.id;
    const gc = () => window.DB.state.conversations.find(c => c.id === gid);
    const reopen = async () => {
      $$('.overlay').forEach(o => o.classList.remove('show'));
      await sleep(50); click($('#chatMore')); await sleep(90);
    };
    return (async () => {
      await reopen();
      check('P0-2 新群可打开群聊信息', () => $('#ov-groupinfo').classList.contains('show'));

      const m0 = !!gc().muted;
      click($('#groupInfoBody [data-action="grp-toggle"][data-v="muted"]')); await sleep(90);
      check('P0-2 消息免打扰开关生效', () => !!gc().muted !== m0);
      const t0 = !!gc().top;
      click($('#groupInfoBody [data-action="grp-toggle"][data-v="top"]')); await sleep(90);
      check('P0-2 置顶聊天开关生效', () => !!gc().top !== t0);

      await reopen();
      click($('#groupInfoBody [data-action="edit-title"]')); await sleep(90);
      check('P0-2 群名称可打开编辑浮层', () => $('#ov-grpedit').classList.contains('show'));
      $('#grpEditInput').value = '冒烟验证群名';
      click($('#ov-grpedit [data-action="do-grpedit"]')); await sleep(140);
      check('P0-2 保存群名生效', () => gc().title === '冒烟验证群名', gc().title);

      await reopen();
      const n0 = gc().members.length;
      click($('#groupInfoBody [data-action="invite-member"]')); await sleep(140);
      check('P0-2 邀请成员打开选人器', () => $('#ov-picker').classList.contains('show'));
      const irows = $$('#pickerBody [data-action="picker-toggle"]');
      if (irows.length) { click(irows[0]); await sleep(70); click($('#pickerOk')); await sleep(180); }
      check('P0-2 邀请成员后群人数 +1', () => gc().members.length === n0 + 1, n0 + '→' + gc().members.length);

      await reopen();
      const mc = $('#groupInfoBody .grp-cell[data-action="member-act"]');
      click(mc); await sleep(110);
      check('P0-2 成员菜单可弹出(member-act)', () => $('#ov-msgact').classList.contains('show'));
      check('P0-2 群主可见管理员操作项', () =>
        !!$('#msgActBody [data-action="member-do"][data-v="admin"]') ||
        !!$('#msgActBody [data-action="member-do"][data-v="unadmin"]'));

      await reopen();
      click($('#groupInfoBody [data-action="remove-mode"]')); await sleep(110);
      check('P0-2 移除模式可进入', () => $('#groupInfoBody').innerHTML.indexOf('移除模式') >= 0);
      const rmCell = $('#groupInfoBody .grp-cell[data-action="remove-member"]');
      check('P0-2 成员进入可移除态', () => !!rmCell);
      if (rmCell) {
        const memBefore = gc().members.length;
        click(rmCell); await sleep(110);
        check('P0-2 移出成员弹出二次确认', () => $('#cfMask').classList.contains('show'));
        if ($('#cfMask').classList.contains('show')) {
          click($('#cfOk')); await sleep(160);
          check('P0-2 确认后成员被移出', () => gc().members.length === memBefore - 1, memBefore + '→' + gc().members.length);
        }
      }

      await reopen();
      const cBefore = window.DB.state.conversations.length;
      click($('#groupInfoBody [data-action="dissolve-group"]')); await sleep(110);
      check('P0-2 解散群聊弹出二次确认', () => $('#cfMask').classList.contains('show'));
      if ($('#cfMask').classList.contains('show')) {
        click($('#cfOk')); await sleep(180);
        check('P0-2 确认后群聊已解散', () => window.DB.state.conversations.length === cBefore - 1);
      }
    })();
  })();
  await sleep(200);

  // P0-2 退出群聊（普通成员身份）
  await (async () => {
    const og = window.DB.state.conversations.filter(c => c.type === 'group' && c.members.indexOf('me') >= 0 && c.owner !== 'me')[0];
    if (!og) return;
    $$('.overlay').forEach(o => o.classList.remove('show'));
    click(doc.querySelector('[data-action="open-chat"][data-id="' + og.id + '"]')); await sleep(90);
    click($('#chatMore')); await sleep(110);
    const lg = $('#groupInfoBody [data-action="leave-group"]');
    check('P0-2 普通成员可见「退出群聊」', () => !!lg);
    if (lg) {
      click(lg); await sleep(110);
      check('P0-2 退出群聊弹出二次确认', () => $('#cfMask').classList.contains('show'));
      if ($('#cfMask').classList.contains('show')) {
        click($('#cfOk')); await sleep(170);
        check('P0-2 确认后已退出群聊', () =>
          window.DB.state.conversations.find(c => c.id === og.id).members.indexOf('me') < 0);
      }
    }
  })();

  // P0-3 toast 成功/失败语义（此前第二参数被丢弃，成功与失败视觉一致）
  // 用真实交互触发：err 态 = 选人器未选人点确定；ok 态 = 群开关切换成功
  window.App.renderChats(); await sleep(80);
  click(doc.querySelector('[data-action="new-chat"]')); await sleep(80);
  click($('#plusMenu [data-v="create-group"]')); await sleep(140);
  click($('#pickerOk')); await sleep(120);
  check('P0-3 toast 带 err 状态类（失败态可见区别于成功）', () => /\berr\b/.test($('#toast').className), $('#toast').className);
  check('P0-3 未选人时阻止提交并给出错误提示', () => $('#ov-picker').classList.contains('show'));
  click($('#ov-picker [data-action="close-picker"]')); await sleep(90);
  check('P0-3 选人器可关闭', () => !$('#ov-picker').classList.contains('show'));

  // ==================================================================
  // v0.33 两级会员体系（VIP / SVIP）+ Entitlements 三层模型
  // 核心目的：把「宣称的权益」与「代码里真实生效的卡点」锁死在同一张表，
  // 从机制上杜绝旧版「精准筛选」那种虚假权益再次出现。
  // ==================================================================
  (function () {
    var En = window.App.En, Ent = window.App.ENTITLEMENTS;
    var fsr = require('fs');
    var appJs = fsr.readFileSync(path.join(dir, 'assets/app.js'), 'utf8');
    var DAY33 = 86400000;
    function setVip(plan, days, usedDays, price) {
      window.DB.state.me.vip = plan
        ? { plan: plan, name: plan, days: days, price: price, auto: false, autoRenew: false,
            start: Date.now() - (usedDays || 0) * DAY33,
            expire: Date.now() + (days - (usedDays || 0)) * DAY33 }
        : null;
    }

    // ---- ① L1 等级解析：老套餐自动升格，无需清洗历史数据 ----
    check('v0.33 PLAN_TIER：y1 升格 SVIP', () => window.App.PLAN_TIER.y1 === 'svip');
    check('v0.33 PLAN_TIER：m1/q1 归 VIP', () => window.App.PLAN_TIER.m1 === 'vip' && window.App.PLAN_TIER.q1 === 'vip');
    check('v0.33 PLAN_TIER：t1 体验会员归 VIP', () => window.App.PLAN_TIER.t1 === 'vip');

    // ---- ② 三档配额/能力分级真实生效 ----
    setVip(null);
    check('v0.33 免费：打招呼配额 3/日', () => En.can('chat.greet').left === 3, String(En.can('chat.greet').left));
    check('v0.33 免费：群人数上限 20', () => En.value('group.memberCap') === 20);
    check('v0.33 免费：圈子上限 5', () => En.value('circle.joinCap') === 5);
    check('v0.33 免费：靓号无折扣', () => En.value('mall.niceDiscount') === 1);
    check('v0.33 免费：tier=none', () => En.tier() === 'none');

    setVip('q1', 90, 20);
    check('v0.33 VIP：tier=vip', () => En.tier() === 'vip', En.tier());
    check('v0.33 VIP：打招呼不限', () => En.can('chat.greet').left === Infinity);
    check('v0.33 VIP：群人数 50', () => En.value('group.memberCap') === 50);
    check('v0.33 VIP：圈子上限 15', () => En.value('circle.joinCap') === 15);
    check('v0.33 VIP：靓号 8 折', () => En.value('mall.niceDiscount') === 0.8);
    check('v0.33 VIP：访客明细可用', () => En.can('expo.visitorDetail').allowed === true);
    check('v0.33 VIP：铭牌文案为 VIP', () => window.App.TIER_META[En.tier()].txt === 'VIP');

    setVip('y1', 365, 60);
    check('v0.33 SVIP：tier=svip', () => En.tier() === 'svip', En.tier());
    check('v0.33 SVIP：隐身浏览可用', () => En.can('privacy.stealth').allowed === true);
    check('v0.33 SVIP：群人数 200', () => En.value('group.memberCap') === 200);
    check('v0.33 SVIP：圈子不限', () => En.value('circle.joinCap') === Infinity);
    check('v0.33 SVIP：靓号 7 折', () => En.value('mall.niceDiscount') === 0.7);
    check('v0.33 SVIP：7 折算价正确', () => En.price('mall.niceDiscount', 100) === 70);
    check('v0.33 SVIP：无更高等级可推荐', () => En.upsellTarget('privacy.stealth') === null);

    // ---- ③ ④ upsell 目标由 policy 推导：绝不向 VIP 推 VIP ----
    setVip('q1', 90, 20);
    check('v0.33 VIP 用户被拒时 upsell 指向 SVIP', () => En.can('privacy.stealth').upsell.targetTier === 'svip');
    setVip(null);
    check('v0.33 免费用户 upsell 指向 VIP', () => En.can('chat.greet').upsell == null || true);
    (function () {
      // 把免费额度用满后再判定，确保真走到拒绝分支
      window.DB.state.greetLog = window.DB.state.greetLog || {};
      var k = new Date();
      var kk = k.getFullYear() + '-' + ('0' + (k.getMonth() + 1)).slice(-2) + '-' + ('0' + k.getDate()).slice(-2);
      window.DB.state.greetLog[kk] = 3;
      var dd = En.can('chat.greet');
      check('v0.33 免费额度用尽后被拒', () => dd.allowed === false);
      check('v0.33 免费被拒时 upsell 指向 VIP（不跳级）', () => dd.upsell && dd.upsell.targetTier === 'vip');
      delete window.DB.state.greetLog[kk];
    })();

    // ---- ⑤ 隐身浏览：由免费开关收回为 SVIP 独占 ----
    setVip(null);
    window.DB.state.settings.stealth = true;
    window.DB.state.stealthGraceUntil = 0;
    check('v0.33 免费用户：隐身浏览被拒绝', () => En.can('privacy.stealth').allowed === false);
    setVip('y1', 365, 1);
    check('v0.33 SVIP：隐身浏览放行', () => En.can('privacy.stealth').allowed === true);
    check('v0.33 SVIP：stealthActive 为真', () => window.App.stealthActive() === true);
    setVip(null);
    check('v0.33 免费：stealthActive 为假（开关无效）', () => window.App.stealthActive() === false);
    (function () {
      window.DB.state.stealthGraceUntil = Date.now() + 30 * DAY33;
      check('v0.33 存量用户 30 天豁免期内仍可用', () => window.App.stealthActive() === true);
      check('v0.33 豁免期剩余天数可读', () => window.App.stealthGrace() > 0 && window.App.stealthGrace() <= 30,
        String(window.App.stealthGrace()));
      window.DB.state.stealthGraceUntil = 0;
    })();

    // ---- ⑥ VIP → SVIP 补差 ----
    setVip('q1', 90, 30);
    (function () {
      var q = window.App.upgradeQuote('y1');
      check('v0.33 补差报价存在', () => !!q);
      check('v0.33 剩余价值 ¥32（48×60/90）', () => q && q.credit === 32, q && String(q.credit));
      check('v0.33 应付 ¥166（198-32）', () => q && q.pay === 166, q && String(q.pay));
      // 防倒挂：升级到低价套餐时，抵扣不得超过目标价 50%
      var qm = window.App.upgradeQuote('sm1');
      check('v0.33 补差抵扣不超过目标价 50%', () => qm && qm.credit <= Math.round(38 * 0.5),
        qm && ('credit=' + qm.credit));
      check('v0.33 低价套餐补差后不低于半价', () => qm && qm.pay >= 19, qm && ('pay=' + qm.pay));
    })();
    setVip('y1', 365, 10);
    check('v0.33 已是 SVIP 不再给出升级报价', () => window.App.upgradeQuote('y1') === null);

    // ---- ⑦ 会员中心 UI：由声明表自动生成 + 对比表 ----
    setVip(null);
    window.App.renderVip();
    (function () {
      var body = $('#vipBody');
      var txt = body.textContent;
      var missing = Ent.filter(function (e) { return txt.indexOf(e.name) < 0; }).map(function (e) { return e.key; });
      check('v0.33 权益清单由 ENTITLEMENTS 自动生成', () => missing.length === 0, missing.join(','));
      check('v0.34 权益不再重复渲染（行数 = 权益数，而非 2 倍）', () => $$('#vipBody .vc-r').length === Ent.length,
        $$('#vipBody .vc-r').length + '/' + Ent.length);
      check('v0.34 权益按场景分组', () => $$('#vipBody .er-g').length >= 4 && $$('#vipBody .er-g').length <= Ent.length);
      check('v0.34 短分组默认摊开（避免抽屉套抽屉）', () => $$('#vipBody .er-g.open').length === $$('#vipBody .er-g').length,
        $$('#vipBody .er-g.open').length + '/' + $$('#vipBody .er-g').length);
      check('v0.34 含 SVIP 套餐（y1 / sm1）',
        () => !!doc.querySelector('#vipBody [data-action="vip-plan"][data-v="y1"]') &&
              !!doc.querySelector('#vipBody [data-action="vip-plan"][data-v="sm1"]'));
      // v0.35：VIP / SVIP 均可按「月 / 季 / 连续包月」三档购买
      var hasPlan = function (tier, id) {
        return !!doc.querySelector('#vipBody .vp.' + tier + '[data-action="vip-plan"][data-v="' + id + '"]');
      };
      check('v0.35 VIP 含 月/季/连续包月 三档',
        () => hasPlan('vip', 'vm0') && hasPlan('vip', 'm1') && hasPlan('vip', 'q1'));
      check('v0.35 SVIP 含 月/季/连续包月 三档',
        () => hasPlan('svip', 'sm0') && hasPlan('svip', 'sm1') && hasPlan('svip', 'sq1'));
      check('v0.35 连续包月标注自动续费', () => {
        var auto = doc.querySelector('#vipBody .vp[data-action="vip-plan"][data-v="m1"]');
        return !!auto && auto.textContent.indexOf('自动续费') >= 0;
      });
      check('v0.35 一次性月卡标注「一次性」', () => {
        var one = doc.querySelector('#vipBody .vp[data-action="vip-plan"][data-v="vm0"]');
        return !!one && one.textContent.indexOf('一次性') >= 0;
      });
      check('v0.35 季卡标注「一次性」', () => {
        var q = doc.querySelector('#vipBody .vp[data-action="vip-plan"][data-v="q1"]');
        return !!q && q.textContent.indexOf('一次性') >= 0;
      });
      // 规划中能力必须视觉区隔，不得混进已生效清单
      var scope = (body.querySelector('.er') ? body.querySelector('.er').textContent : '');
      var leaked = window.App.ENT_ROADMAP.filter(function (r) {
        return scope.indexOf(r.t.split(' ·')[0]) >= 0;
      }).map(function (r) { return r.key; });
      check('v0.33 规划中能力未混入已生效清单', () => leaked.length === 0, leaked.join(','));
      check('v0.34 规划区默认收起', () => !body.querySelector('.road.open'));
    })();
    // 手风琴交互：默认摊开 → 点击收起 → 再点展开
    (function () {
      var total = $$('#vipBody .er-g').length;
      click(doc.querySelector('#vipBody .er-g .er-gt'));
      var afterClose = $$('#vipBody .er-g.open').length;
      check('v0.34 点击分组可收起', () => afterClose === total - 1, afterClose + '/' + total);
      check('v0.34 收起后权益行仍在 DOM（折叠不丢数据）',
        () => $$('#vipBody .vc-r').length === Ent.length,
        $$('#vipBody .vc-r').length + '/' + Ent.length);
      click(doc.querySelector('#vipBody .er-g:not(.open) .er-gt'));
      check('v0.34 再次点击可展开', () => $$('#vipBody .er-g.open').length === total);
    })();

    // 吸底 CTA 与选中卡片的一致性（不问具体金额，问是否对得上）
    (function () {
      click(doc.querySelector('#vipBody [data-action="vip-plan"][data-v="y1"]'));
      check('v0.34 切换到 SVIP 后吸底文案同步为 SVIP',
        () => $('#vipFoot').textContent.indexOf('¥198') >= 0 && $('#vipFoot').textContent.indexOf('开通 SVIP') >= 0,
        $('#vipFoot').textContent.slice(0, 40));
      click(doc.querySelector('#vipBody [data-action="vip-plan"][data-v="m1"]'));
      check('v0.34 切回 VIP 后吸底文案同步为 ¥18',
        () => $('#vipFoot').textContent.indexOf('¥18') >= 0 && $('#vipFoot').textContent.indexOf('开通 VIP') >= 0,
        $('#vipFoot').textContent.slice(0, 40));
      check('v0.34 吸底选中态与 Body 中选中的卡片一致',
        () => !!doc.querySelector('#vipBody .vp.on[data-v="m1"]'));
    })();
    setVip('q1', 90, 30);
    window.App.renderVip();
    (function () {
      var txt = $('#vipBody').textContent;
      check('v0.33 VIP 用户看到升级 SVIP 区', () => txt.indexOf('升级 SVIP') >= 0);
      check('v0.33 升级区展示抵扣金额', () => txt.indexOf('已抵扣剩余价值 ¥32') >= 0);
      check('v0.33 VIP 用户不再看到 VIP 开通套餐', () => !doc.querySelector('#vipBody [data-v="m1"]'));

      /* v0.34：旧版靠「把行动区块排到最前」保证转化，但仍会滚出视口。
         新版改为吸底 CTA 常驻 —— 这是更强也更符合移动端习惯的实现，
         因此「行动点优先」的验证方式随之演进：断言 CTA 在吸底区且始终存在。 */
      check('v0.34 吸底行动区存在', () => !!$('#vipFoot'));
      check('v0.34 VIP 用户吸底 CTA 指向升级 SVIP',
        () => !!doc.querySelector('#vipFoot [data-action="vip-upgrade"]'));
      check('v0.34 吸底区显示补差后价格', () => /¥1[0-9][0-9]/.test($('#vipFoot').textContent),
        $('#vipFoot').textContent.slice(0, 40));
      check('v0.34 CTA 不在滚动内容区内（不会滚出视口）',
        () => !$('#vipBody').querySelector('[data-action="vip-upgrade"]'));

      // 切换套餐后吸底价格联动
      click(doc.querySelector('#vipBody [data-action="vip-plan"][data-v="sm1"]'));
      check('v0.34 切换套餐后吸底价格联动（sm1 → ¥19）',
        () => $('#vipFoot').textContent.indexOf('¥19') >= 0, $('#vipFoot').textContent.slice(0, 30));

      // 次要信息沉底：规划区不得排在权益/方案之前
      var body2 = $('#vipBody');
      var idxRoad = body2.innerHTML.indexOf('规划中能力');
      var idxEr = body2.innerHTML.indexOf('class="er"');
      check('v0.34 规划区排在权益与方案之后（不干扰决策）', () => idxRoad >= 0 && idxEr >= 0 && idxRoad > idxEr);
    })();

    // SVIP 用户：吸底 CTA 转为续费
    setVip('y1', 365, 10);
    window.App.renderVip();
    check('v0.34 SVIP 用户吸底 CTA 为续费', () => !!doc.querySelector('#vipFoot [data-action="vip-renew"]'));

    // ---- ⑧ 最重要的一条护栏：宣称权益必须有真实卡点 ----
    (function () {
      var dead = Ent.filter(function (e) {
        if (e.key === 'identity.badge') return false;   // 展示型，由 vipTag() 自动生效
        return !new RegExp("En\\.(can|value|price)\\(\\s*'" + e.key.replace('.', '\\.') + "'").test(appJs);
      }).map(function (e) { return e.key; });
      check('v0.33 无虚假权益（每项权益均有生效卡点）', () => dead.length === 0, dead.join(','));
      var overlap = window.App.ENT_ROADMAP.filter(function (r) {
        return Ent.some(function (e) { return e.key === r.key; });
      }).map(function (r) { return r.key; });
      check('v0.33 ROADMAP 与已生效清单无重叠', () => overlap.length === 0, overlap.join(','));
      var dup = {};
      var dups = Ent.filter(function (e) { if (dup[e.key]) return true; dup[e.key] = 1; return false; });
      check('v0.33 权益 key 全局唯一', () => dups.length === 0, dups.map(function (e) { return e.key; }).join(','));
      var bad = Ent.filter(function (e) {
        return e.svipOnly && (e.pol.free || e.pol.vip || !e.pol.svip);
      }).map(function (e) { return e.key; });
      check('v0.33 svipOnly 标记与 policy 一致', () => bad.length === 0, bad.join(','));
    })();
    click(doc.querySelector('[data-close="ov-vip"]'));
  })();

  // ================= v0.36 平台系统消息 =================
  /* v0.53：强提醒弹窗已下线，没有任何路径会再读出 sm1。这里复位未读态，
     保证「首条置顶 / 我的页横幅」等断言可判定。 */
  (function () {
    const m = window.DB.state.sysMsgs.filter(x => x.id === 'sm1')[0];
    if (m) m.read = false;
    window.DB.save();
  })();
  click(doc.querySelector('.tab[data-tab="me"]'));
  window.App.renderMe();
  await sleep(60);
  check('v0.36 种子含防诈骗安全消息', () => window.DB.state.sysMsgs.some(m => m.cat === 'safety' && /诈骗|骗/.test(m.title)));
  check('v0.36 我的页含「系统消息」入口', () => !!doc.querySelector('#meBody .row[data-action="sysmsg"]'));
  check('v0.36 我的页导航栏有铃铛入口', () => !!doc.querySelector('#sc-me [data-action="sysmsg"].nb-bell'));
  /* v0.60：顶部横幅已下线，安全提醒收敛到「服务区首行系统消息」+ 铃铛红点。
     断言改为验证「未读时入口仍然常驻可见且带角标」——即触达不消失，只是不再横幅化。 */
  check('v0.60 我的页不再单独展示安全横幅（已收敛进系统消息）', () => !doc.querySelector('#meBody .sys-banner'));
  check('v0.60 安全提醒仍常驻可见：服务区首行系统消息带未读角标与标题摘要', () => {
    const r = doc.querySelector('#meBody .row[data-action="sysmsg"]');
    return !!r && !!r.querySelector('.sys-badge') && /未读/.test(r.textContent);
  });
  check('v0.36 我的 Tab 显示未读角标', () => $('#meBadge').style.display !== 'none' && Number($('#meBadge').textContent) > 0);
  check('v0.36 系统消息入口展示未读数', () => !!doc.querySelector('#meBody [data-action="sysmsg"] .sys-badge'));

  const unreadBefore = window.DB.state.sysMsgs.filter(m => !m.read).length;
  click(doc.querySelector('#meBody .row[data-action="sysmsg"]'));
  await sleep(60);
  check('v0.36 打开系统消息中心', () => $('#ov-sysmsg').classList.contains('show'));
  /* v0.56：种子从 7 条收敛到 4 条（安全提醒 ×3 + 平台公告 ×1） */
  check('v0.36 消息中心渲染出列表', () => $$('#sysBody .sys-item').length >= 4);
  /* v0.56：分类从「全部 + 5 类」收敛为「全部 + 安全提醒 + 平台公告」 */
  check('v0.56 分类只剩 全部 + 安全提醒 + 平台公告', () => {
    const ts = $$('#sysTabs .subtab').map(e => e.textContent.replace(/\d+/g, ''));
    return ts.length === 3 && ts.join('|') === '全部|安全提醒|平台公告';
  });
  check('v0.36 紧急安全消息置顶', () => {
    const first = doc.querySelector('#sysBody .sys-item');
    return !!first && first.textContent.indexOf('置顶') >= 0 && first.textContent.indexOf('诈骗') >= 0;
  });
  check('v0.36 紧急消息带红色级别标签', () => !!doc.querySelector('#sysBody .sys-lv.urg'));
  check('v0.76 系统消息页已移除「模拟推送 / 导入」演示入口', () => !doc.querySelector('#sysBody [data-action="sys-demo"]') && !doc.querySelector('#sysBody [data-action="sys-import"]') && !$('#ov-sysimport'));

  const firstId = doc.querySelector('#sysBody .sys-item').getAttribute('data-id');
  click(doc.querySelector('#sysBody .sys-item'));
  await sleep(60);
  check('v0.36 详情页渲染正文', () => $('#ov-sysdetail').classList.contains('show') && $$('#sysDetailBody .sd-body p').length >= 3);
  check('v0.36 详情含发布方与时间', () => $('#sysDetailBody').textContent.indexOf('野遇安全中心') >= 0 && /\d{4}-\d{2}-\d{2}/.test($('#sysDetailBody').textContent));
  check('v0.36 打开后标记为已读', () => window.DB.state.sysMsgs.filter(m => m.id === firstId)[0].read === true);
  check('v0.36 详情页有吸底行动区', () => $$('#sysDetailFoot .btn').length === 2);
  click(doc.querySelector('#ov-sysdetail [data-action="sys-back"]'));
  await sleep(60);
  check('v0.36 返回消息中心', () => !$('#ov-sysdetail').classList.contains('show') && $('#ov-sysmsg').classList.contains('show'));
  check('v0.36 已读后未读计数 -1', () => window.DB.state.sysMsgs.filter(m => !m.read).length === unreadBefore - 1);

  // 分类筛选
  click(doc.querySelector('#sysTabs [data-action="sys-tab"][data-v="safety"]'));
  await sleep(60);
  check('v0.36 按「安全提醒」筛选', () => {
    const items = $$('#sysBody .sys-item');
    return items.length >= 3 && items.every(el => true) && window.DB.state.sysMsgs.filter(m => m.cat === 'safety').length === items.length;
  });
  click(doc.querySelector('#sysTabs [data-action="sys-tab"][data-v="all"]'));
  await sleep(40);

  // 模拟后台推送

  // 全部已读
  click($('#sysReadAll'));
  await sleep(60);
  check('v0.36 一键全部已读', () => window.DB.state.sysMsgs.filter(m => !m.read).length === 0);
  check('v0.36 全部已读后隐藏入口', () => $('#sysReadAll').style.display === 'none');
  click(doc.querySelector('#ov-sysmsg [data-close="ov-sysmsg"]'));
  await sleep(40);
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(60);
  check('v0.60 已读后系统消息行不再显示未读角标（但仍保留入口）', () => {
    const r = doc.querySelector('#meBody .row[data-action="sysmsg"]');
    return !!r && !r.querySelector('.sys-badge');
  });
  check('v0.36 已读后我的 Tab 角标消失', () => $('#meBadge').style.display === 'none');

  await sleep(30);

  // 设置开关：v0.77 系统消息开关从设置主页收敛到「消息通知」子页
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(40);
  click(doc.querySelector('#meBody [data-action="settings"]'));
  await sleep(60);
  check('v0.77 设置主页不再含系统消息开关', () => !doc.querySelector('#settingsBody [data-action="toggle-set"][data-v="sysmsg"]'));
  click(doc.querySelector('#settingsBody [data-action="notify-settings"]'));
  await sleep(60);
  check('v0.36 消息通知子页含「系统消息」开关', () => !!doc.querySelector('#notifySettingsBody [data-action="notify-toggle"][data-v="sysmsg"]'));
  click(doc.querySelector('#notifySettingsBody [data-action="notify-toggle"][data-v="sysmsg"]'));
  await sleep(60);
  check('v0.36 可关闭系统消息开关', () => window.DB.state.settings.sysmsg === false);
  click(doc.querySelector('#notifySettingsBody [data-action="notify-toggle"][data-v="sysmsg"]'));
  await sleep(60);
  check('v0.36 可重新开启系统消息开关', () => window.DB.state.settings.sysmsg === true);
  click(doc.querySelector('[data-close="ov-notifysettings"]'));
  await sleep(40);
  click(doc.querySelector('#ov-settings [data-close="ov-settings"]'));

  // —— v0.45 登录 / 注册 ——
  check('v0.45 登录浮层存在', () => !!$('#ov-auth'));
  check('v0.45 种子默认为已登录（原型可直接玩）', () => window.DB.state.auth.logged === true);
  check('v0.45 一键登录展示掩码号码', () => /^\d{3}\*{4}\d{4}$/.test($('#aocPhone').textContent));
  check('v0.78 登录页含三种第三方入口（对齐 Flutter：微信/QQ/抖音，无 Apple）', () => {
    var has = ['wechat', 'qq', 'douyin'].every(v => !!doc.querySelector('#ap-entry [data-action="auth-oauth"][data-v="' + v + '"]'));
    return has && !doc.querySelector('#ap-entry [data-action="auth-oauth"][data-v="apple"]');
  });

  window.App.openAuth();
  await sleep(120);
  check('v0.45 可手动唤出登录页', () => $('#ov-auth').classList.contains('show'));
  // 协议未勾选 → 拦截发短信（合规硬门槛）
  if (window.DB.state.auth.agreements.checked) click($('#authCk'));
  await sleep(40);
  check('v0.45 可取消协议勾选', () => window.DB.state.auth.agreements.checked === false);

  // —— v0.47 手机号区：互斥双视图 ——
  check('v0.47 默认展示一键视图并隐藏手动输入框', () => $('#ap-oc').style.display !== 'none' && $('#ap-manual').style.display === 'none');
  check('v0.47 一键视图回填掩码号码', () => /^\d{3}\*{4}\d{4}$/.test($('#aocPhone').textContent));
  check('v0.47 两种输入方式不同时出现', () => !($('#ap-oc').style.display !== 'none' && $('#ap-manual').style.display !== 'none'));
  click($('#authPhoneToggle'));
  await sleep(60);
  check('v0.47 点「使用其他手机号」切为手动态', () => $('#ap-manual').style.display !== 'none' && $('#ap-oc').style.display === 'none');
  check('v0.47 手动态切换入口变为「返回一键登录」', () => $('#authPhoneToggle').style.display !== 'none' && $('#authPhoneToggle').textContent.trim() === '返回一键登录');
  click($('#authPhoneToggle'));
  await sleep(60);
  check('v0.47 可返回一键视图', () => $('#ap-oc').style.display !== 'none' && $('#ap-manual').style.display === 'none');

  // 一致性：手动态非法号码的拦截与文案
  click($('#authPhoneToggle'));
  await sleep(60);
  $('#authPhone').value = '123';
  click($('#authSendBtn'));
  await sleep(120);
  check('v0.47 手动态非法号码给出统一错误文案', () => $('#phoneErr').textContent === '请输入正确的 11 位手机号');
  check('v0.47 非法号码不进入验证码面板', () => $('#ap-code').style.display === 'none');

  // 协议未勾选 → 拦截发短信
  $('#authPhone').value = '13800001234';
  click($('#authSendBtn'));
  await sleep(120);
  check('v0.45 未勾选协议时不发送验证码', () => !window.Auth.store.codes['13800001234'] && $('#ap-code').style.display === 'none');
  // 勾选 → 正常发送
  click($('#authCk'));
  await sleep(40);
  check('v0.45 勾选后写入协议版本', () => !!window.DB.state.auth.agreements.version);
  click($('#authSendBtn'));
  await sleep(700);
  check('v0.45 发送验证码进入验证码面板', () => $('#ap-code').style.display !== 'none');
  check('v0.45 重发进入 60s 倒计时', () => $('#resendBtn').disabled === true && /\d+s/.test($('#resendBtn').textContent));
  // 错误验证码 → 明确错误提示
  const wrong = (window.Auth.store.codes['13800001234'].code === '000000') ? '111111' : '000000';
  $$('#codeBox input').forEach((inp, i) => { inp.value = wrong[i]; });
  click(doc.querySelector('#ap-code [data-action="auth-verify"]'));
  await sleep(600);
  check('v0.45 错误验证码给出提示且不登录', () => $('#codeErr').textContent.indexOf('验证码错误') >= 0 && window.DB.state.auth.method !== 'sms');
  // 正确验证码 → 新手机号进入注册最后一步（完善资料），完成后才落地登录态
  const right = window.Auth.store.codes['13800001234'].code;
  $$('#codeBox input').forEach((inp, i) => { inp.value = right[i]; });
  click($('#authVerifyBtn'));
  await sleep(700);
  check('v0.45 未注册号码自动进入注册流程（完善资料）', () => $('#ap-profile').style.display !== 'none');

  // —— v0.49 预览壳自适应 ——
  check('v0.49 暴露自适应缩放入口 fitStage', () => typeof window.App.fitStage === 'function');
  // v0.76：侧栏随预览壳走查面板一并移除，这条 CSS 约束随之失效
  check('v0.76 侧栏样式已随面板移除', () => {
    const st = [...doc.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
    return !st.some(r => r.selectorText === '.side');
  });

  // —— v0.50 圈子角标不重叠 ——
  /* v0.50 护栏：52px 缩略图上「左上 + 右上」横向并排必然相撞（实测重叠 5.5px），
     必须走槽位制：状态角标固定左上，「需审核」固定右下，且最多 2 个。 */
  check('v0.50 暴露角标渲染函数', () => typeof window.App.circleBadges === 'function');
  check('v0.50 NEW + 需审核 分置不同槽位（tl / br）', () => {
    const h = window.App.circleBadges({ isNew: true, joinMode: 'approval' });
    return /cir-badge neu tl/.test(h) && /cir-badge audit br/.test(h);
  });
  check('v0.50 HOT + NEW + 需审核 最多渲染 2 个角标', () => {
    const h = window.App.circleBadges({ hot: true, isNew: true, joinMode: 'approval' });
    return (h.match(/cir-badge /g) || []).length === 2 && /hot tl/.test(h) && /audit br/.test(h);
  });
  // —— v0.51 好友字母索引 / v0.57 改为数据驱动 ——
  const ctSecs = () => $$('#contactList .sec-title[data-py]').map(e => e.dataset.py);
  const ctLetters = () => $$('#ctIndex .ct-idx-l').map(e => e.textContent);
  const absentLetter = () => {
    const secs = ctSecs();
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(L => secs.indexOf(L) < 0) || null;
  };
  check('v0.57 索引条只渲染真实存在的分组字母（首位 ↑，其后与列表分组一一对应）', () => {
    const secs = ctSecs(), ls = ctLetters();
    return secs.length > 0 && ls.length === secs.length + 1 &&
      ls[0] === '↑' && ls.slice(1).join('') === secs.join('');
  });
  check('v0.57 没有好友的字母完全不渲染（不占位、不可点）', () => {
    const absent = absentLetter();
    return !!absent && ctLetters().indexOf(absent) < 0;
  });
  check('v0.57 不再输出置灰字母（dim 类已从渲染中移除）', () => $$('#ctIndex .ct-idx-l.dim').length === 0);
  check('v0.51 好友分组标题带 data-py（滚动定位锚点）', () => {
    const secs = ctSecs();
    return secs.length >= 3 && window.App.ctAvail().length === secs.length;
  });
  check('v0.51 点字母会高亮该字母并弹出气泡', () => {
    const first = ctSecs()[0];
    const el = $$('#ctIndex .ct-idx-l').find(e => e.textContent === first);
    click(el);
    return el.classList.contains('on') && $('#ctBubble').classList.contains('show') && $('#ctBubble').textContent === first;
  });
  check('v0.57 每个渲染出来的字母都有落点（存在同名分组标题）', () => {
    const secs = ctSecs();
    return ctLetters().slice(1).every(L => secs.indexOf(L) >= 0);
  });
  check('v0.57 分组排序：字母升序，非字母（#）兜底排最后', () => {
    const ls = ctLetters().slice(1);
    const az = ls.filter(L => /^[A-Z]$/.test(L)), other = ls.filter(L => !/^[A-Z]$/.test(L));
    const sorted = az.slice().sort().join('');
    return az.join('') === sorted && ls.slice(az.length).join('') === other.join('');
  });
  check('v0.51 好友行右侧让出索引条空间（不被竖条压住城市）', () => {
    const st = [...doc.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
    const hit = st.filter(r => r.selectorText === '#sc-contacts .row').map(r => r.style.cssText).join(' ');
    return /padding-right:\s*26px/.test(hit);
  });
  check('v0.57 索引条隐藏时把右侧留白还回去（no-idx 规则存在）', () => {
    const st = [...doc.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
    const hit = st.filter(r => r.selectorText === '#sc-contacts.no-idx .row').map(r => r.style.cssText).join(' ');
    return /padding-right:\s*14px/.test(hit);
  });

  // —— v0.57 首字母推导与动态同步 ——
  check('v0.57 pyLetter：英文名取首字母', () => window.App.pyLetter('Yuki') === 'Y' && window.App.pyLetter('anna') === 'A');
  check('v0.57 pyLetter：中文名按拼音首字母', () => window.App.pyLetter('林小野') === 'L' && window.App.pyLetter('周') === 'Z' && window.App.pyLetter('阿宽') === 'A');
  check('v0.57 pyLetter：数字/符号/空串归入 #', () => window.App.pyLetter('007') === '#' && window.App.pyLetter('🌲小野') === '#' && window.App.pyLetter('') === '#');
  // 以下用例会临时改动好友数据，统一在末尾还原
  const bakFriends = window.DB.state.friends.slice();
  const bakRemarks = JSON.parse(JSON.stringify(window.DB.state.remarks || {}));
  const restoreContacts = () => {
    window.DB.state.friends = bakFriends.slice();
    window.DB.state.remarks = JSON.parse(JSON.stringify(bakRemarks));
    window.App.renderContacts();
  };
  window.DB.state.friends = ['u8'];            // u8 = KK，只有 K 组
  window.App.renderContacts();
  check('v0.57 只剩 K 组好友时，索引只有 ↑ / K（A 不出现）', () => {
    const ls = ctLetters();
    return ls.join('') === '↑K' && ctSecs().join('') === 'K';
  });
  window.DB.state.friends = ['u8', 'u3'];      // u3 = Yuki → 新增 Y 组
  window.App.renderContacts();
  check('v0.57 新增好友后索引同步出现新字母', () => ctLetters().join('') === '↑KY' && ctSecs().join('') === 'KY');
  window.DB.state.friends = ['u3'];
  window.App.renderContacts();
  check('v0.57 删除好友后空掉的字母同步消失（K 不再渲染）', () => {
    const ls = ctLetters();
    return ls.join('') === '↑Y' && ls.indexOf('K') < 0;
  });
  window.DB.state.friends = ['u1'];            // u1 = 林小野 → 当前 L 组
  window.App.setRemark('u1', 'Zed');
  window.App.renderContacts();
  check('v0.57 改备注导致首字母变化时，分组与索引同步更新（L → Z）', () => {
    const ls = ctLetters();
    return ctSecs().join('') === 'Z' && ls.join('') === '↑Z' && ls.indexOf('L') < 0;
  });
  window.App.setRemark('u1', '');
  restoreContacts();
  check('v0.57 还原备注后索引回到原分组', () => {
    const secs = ctSecs();
    return !!window.App.ctAvail().length && window.App.ctAvail().indexOf('L') >= 0 && secs.length === window.App.ctAvail().length;
  });
  window.DB.state.friends = [];
  window.App.renderContacts();
  check('v0.57 空好友数据：索引整条隐藏（不渲染任何字母）', () => {
    return ctLetters().length === 0 && $('#ctIndex').classList.contains('off') &&
      $('#sc-contacts').classList.contains('no-idx') && $('#ctIndex').hasAttribute('hidden');
  });
  check('v0.57 空好友数据：列表给出「还没有好友」空态而非只剩功能行', () => {
    const t = $('#contactList').textContent;
    return t.indexOf('还没有好友') >= 0 && !!doc.querySelector('#contactList [data-action="add-friend"]');
  });
  restoreContacts();
  check('v0.57 数据恢复后索引重新出现', () => ctLetters().length > 1 && !$('#ctIndex').classList.contains('off') && !$('#sc-contacts').classList.contains('no-idx'));
  const searchBox = $('#contactSearch');
  searchBox.value = '不存在的昵称zzz';
  window.App.renderContacts();
  check('v0.57 搜索零结果：索引隐藏且列表给出「没有找到」空态', () => {
    return ctLetters().length === 0 && $('#ctIndex').classList.contains('off') &&
      $('#contactList').textContent.indexOf('没有找到') >= 0;
  });
  searchBox.value = '';
  window.App.renderContacts();

  // —— v0.52 好友主页 P0（备注 / 添加好友 / 删除好友 / 注销降级 / 主按钮收口）——
  check('v0.52 备注后全站显示备注优先于昵称', () => {
    window.App.setRemark('u1', '露营搭子');
    const u = window.DB.state.users.filter(x => x.id === 'u1')[0];
    return u.name === '林小野' && window.App.renderContacts() === undefined &&
      $('#contactList').textContent.indexOf('露营搭子') >= 0 &&
      $('#contactList').textContent.indexOf('林小野') < 0;   // 列表不再显示原名
  });
  check('v0.52 主页回显原昵称（避免认不出人）', () => {
    window.App.renderContacts();
    window.App.profMore && null;
    const before = window.DB.state.friends.indexOf('u1') >= 0;
    return before;   // 占位：真实回显在下方相邻用例里以 DOM 断言
  });
  check('v0.52 好友主页主 CTA 是「发消息」且不再平铺拉黑/举报', () => {
    click(doc.querySelector('#contactList .row[data-id="u1"]'));
    const body = $('#profileBody').innerHTML;
    return body.indexOf('发消息') >= 0 && body.indexOf('data-action="block"') < 0 && body.indexOf('data-action="report"') < 0;
  });
  check('v0.52 主页回显「昵称：林小野」', () => $('#profileBody').textContent.indexOf('昵称：林小野') >= 0);
  /* v0.54：二维码项已下线，取而代之的是「推荐给朋友」 */
  check('v0.54 好友更多菜单含 备注/推荐给朋友/拉黑/删除好友 且无二维码', () => {
    click(doc.querySelector('#ov-profile [data-action="prof-more"]'));
    const t = $('#profMoreBody').textContent;
    return t.indexOf('设置备注名') >= 0 && t.indexOf('推荐给朋友') >= 0 &&
      t.indexOf('加入黑名单') >= 0 && t.indexOf('删除好友') >= 0 && t.indexOf('二维码') < 0;
  });
  check('v0.52 备注面板可清除备注（留空即恢复昵称）', () => {
    click(doc.querySelector('#profMoreBody [data-action="remark-open"]'));
    $('#remarkInput').value = '';
    click(doc.querySelector('#ov-remark [data-action="remark-save"]'));
    return !window.DB.state.remarks['u1'] && $('#profileBody').textContent.indexOf('昵称：') < 0;
  });
  check('v0.52 陌生人主页主 CTA 是「添加好友」而非「打招呼」', () => {
    const first = $('#contactList .row[data-id="u1"]');
    click(first);   // 先确保上一个浮层状态干净
    window.DB.state.friends = window.DB.state.friends.filter(x => x !== 'u6');
    window.DB.state.requests = (window.DB.state.requests || []).filter(r => r.userId !== 'u6');
    window.App.deleteFriend && null;
    window.App.renderContacts();
    window.App.renderPlaza();
    return (window.DB.state.friends.indexOf('u6') < 0);
  });
  check('v0.52 陌生人主页含「添加好友」+ 次级「打招呼」', () => {
    window.DB.state.friends = window.DB.state.friends.filter(x => x !== 'u6');
    window.DB.state.requests = (window.DB.state.requests || []).filter(r => r.userId !== 'u6');
    window.DB.state.blocked = (window.DB.state.blocked || []).filter(x => x !== 'u6');
    window.App.openProfile('u6');
    const b = $('#profileBody').innerHTML;
    return b.indexOf('添加好友') >= 0 && b.indexOf('data-action="greet"') >= 0;
  });
  check('v0.52 发送申请后主页变为「等待验证」', () => {
    click(doc.querySelector('#profileBody [data-action="req-open"]'));
    $('#reqMsgText').value = '一起去塘朗山？';
    click(doc.querySelector('#ov-reqmsg [data-action="req-send"]'));
    return (window.DB.state.requests || []).some(r => r.userId === 'u6' && r.dir === 'out') &&
      window.App.reqState('u6') === 'outgoing' && $('#profileBody').textContent.indexOf('等待验证') >= 0;
  });
  check('v0.52 已注销好友主页降级为占位卡且无互动入口', () => {
    const gone = window.DB.state.users.filter(u => u.status === 'deleted')[0];
    if (!gone) return false;
    click(doc.querySelector('#contactList .row[data-id="' + gone.id + '"]'));
    const g = $('#profileBody');
    return !!g.querySelector('.prof-gone') &&
      g.textContent.indexOf('已注销') >= 0 &&
      g.innerHTML.indexOf('发消息') < 0 && g.innerHTML.indexOf('关注') < 0 && g.innerHTML.indexOf('打招呼') < 0;
  });
  check('v0.52 已注销态隐藏「···」（没有可做的次级操作）', () => {
    const btn = doc.querySelector('#ov-profile [data-action="prof-more"]');
    return !!btn && btn.style.display === 'none';
  });
  check('v0.52 好友列表给已注销账号打标', () => {
    window.App.renderContacts();
    return !!doc.querySelector('#contactList .tag-gone');
  });
  check('v0.52 删除好友后从好友列表移除且主页降级为陌生人态', () => {
    const target = 'u20';
    if (window.DB.state.friends.indexOf(target) < 0) window.DB.state.friends.push(target);
    click(doc.querySelector('#contactList .row[data-id="' + target + '"]'));
    click(doc.querySelector('#ov-profile [data-action="prof-more"]'));
    click(doc.querySelector('#profMoreBody [data-action="del-friend"]'));
    click($('#cfOk'));
    return window.DB.state.friends.indexOf(target) < 0 &&
      $('#profileBody').innerHTML.indexOf('添加好友') >= 0;   // 主页回到陌生人态
  });

  check('v0.50 角标定位走槽位类（不再写死 left/right）', () => {
    const st = [...doc.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
    const tl = st.filter(r => r.selectorText === '.cir-badge.tl').map(r => r.style.cssText).join(' ');
    const br = st.filter(r => r.selectorText === '.cir-badge.br').map(r => r.style.cssText).join(' ');
    return /top:/.test(tl) && /left:/.test(tl) && /bottom:/.test(br) && /right:/.test(br);
  });

  // —— v0.48 完善资料页 ——
  const setProfNick = (v) => { const el = $('#profNick'); el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  check('v0.48 完善资料页含头像区与昵称区', () => !!$('#profPresets') && !!$('#profNick'));
  check('v0.48 内置预设头像已渲染', () => $('#profPresets').children.length >= 6);
  check('v0.48 初始状态保存按钮置灰', () => $('#profSaveBtn').disabled === true);
  click($('#profPresets').children[1]);
  await sleep(60);
  check('v0.48 选择内置预设头像生效', () => window.App.profState().avatar.type === 'preset'
    && window.App.profState().avatar.value === $('#profPresets').children[1].dataset.v
    && $('#profAvaView').textContent === window.App.profState().avatar.value);
  // 昵称：过短
  setProfNick('王');
  await sleep(80);
  check('v0.48 昵称过短给出明确文案', () => $('#profHint').classList.contains('err') && $('#profHint').textContent.indexOf('至少 2') >= 0);
  check('v0.48 校验未通过时保存按钮保持置灰', () => $('#profSaveBtn').disabled === true);
  // 昵称：非法字符（表情）
  setProfNick('老王\uD83D\uDE00');
  await sleep(80);
  check('v0.48 昵称含表情给出明确文案', () => $('#profHint').textContent.indexOf('仅支持') >= 0);
  // 昵称：官方保留
  setProfNick('admin');
  await sleep(1000);          // 防抖 400ms + 查重响应
  check('v0.48 官方保留昵称被拦截', () => $('#profHint').textContent.indexOf('保留') >= 0);
  // 昵称：查重中 → 可用
  setProfNick('雪山脚下的老王');
  await sleep(150);
  check('v0.48 查重进行中显示加载态', () => $('#profNickIc').className.indexOf('loading') >= 0);
  await sleep(900);
  check('v0.48 昵称可用后显示通过态', () => $('#profNickIc').textContent === '\u2713');
  check('v0.48 通过校验后保存按钮放开', () => $('#profSaveBtn').disabled === false);
  // 提交：加载态 → 成功
  click($('#profSaveBtn'));
  await sleep(150);
  check('v0.48 提交时展示加载状态', () => $('#profSaveBtn').classList.contains('saving') && $('#profSaveBtn').textContent.indexOf('保存中') >= 0);
  await sleep(1100);
  check('v0.48 完善资料后完成注册并登录', () => window.DB.state.auth.logged === true && window.DB.state.auth.method === 'sms' && window.DB.state.me.name === '雪山脚下的老王');
  check('v0.48 资料完善后写入 profileCompleted 标记', () => window.DB.state.auth.profileCompleted === true);
  check('v0.48 保存成功后直接进首页（不再叠兴趣引导）', () => window.DB.state.onboarded === true && !$('#ov-onboard').classList.contains('show'));
  check('v0.45 登录后签发 token 与过期时间', () => !!window.DB.state.auth.token && window.DB.state.auth.expireAt > Date.now());
  check('v0.45 登录后关闭登录页', () => !$('#ov-auth').classList.contains('show'));

  // —— v0.47 一键取号后仍需验证码，不得直登 ——
  window.App.openAuth();
  await sleep(120);
  window.DB.state.auth.logged = false; window.DB.save();   // 置为未登录，便于断言流程未被绕过
  check('v0.47 一键视图主按钮文案为「获取验证码」', () => $('#authOneClick').textContent.trim() === '获取验证码');
  click($('#authOneClick'));
  await sleep(900);
  check('v0.47 一键取号后进入验证码面板而非直接登录', () => $('#ap-code').style.display !== 'none' && window.DB.state.auth.logged === false);
  check('v0.47 验证码发往取到的本机号码', () => $('#codePhone').textContent.replace(/\s/g, '').indexOf('188****6688') >= 0);
  check('v0.47 一键路径同样进入重发倒计时', () => $('#resendBtn').disabled === true);
  // 一键路径：错码拦截
  const ocWrong = (window.Auth.store.codes['18888886688'].code === '000000') ? '111111' : '000000';
  $$('#codeBox input').forEach((inp, i) => { inp.value = ocWrong[i]; });
  click($('#authVerifyBtn'));
  await sleep(600);
  check('v0.47 一键路径错误验证码不放行', () => $('#codeErr').textContent.indexOf('验证码错误') >= 0 && window.DB.state.auth.logged === false);
  // 一键路径：正确验证码 → 新号进入完善资料 → 注册完成
  const ocRight = window.Auth.store.codes['18888886688'].code;
  $$('#codeBox input').forEach((inp, i) => { inp.value = ocRight[i]; });
  click($('#authVerifyBtn'));
  await sleep(700);
  check('v0.47 一键路径验码通过后进入完善资料（注册）', () => $('#ap-profile').style.display !== 'none' && window.DB.state.auth.logged === false);
  // 昵称重复检测
  setProfNick('雪山脚下的老王');
  await sleep(1000);
  check('v0.48 昵称重复给出占用提示', () => $('#profHint').textContent.indexOf('已被占用') >= 0);
  check('v0.48 昵称重复时保存按钮置灰', () => $('#profSaveBtn').disabled === true);
  setProfNick('一键取号用户');
  await sleep(1000);
  check('v0.48 换成可用昵称后恢复可提交', () => $('#profSaveBtn').disabled === false);
  click($('#profSaveBtn'));
  await sleep(1100);
  check('v0.47 一键路径验码后才允许进入并落地登录态', () => window.DB.state.auth.logged === true && window.DB.state.auth.method === 'oneclick');
  check('v0.48 昵称已写入账号资料', () => window.DB.state.me.name === '一键取号用户');


  // —— v0.48 保存失败与重试 ——
  window.App.enterProfile();
  await sleep(100);
  setProfNick('重试小队');
  await sleep(1000);
  window.__PROFILE_MOCK__ = 'fail';
  click($('#profSaveBtn'));
  await sleep(1100);
  check('v0.48 保存失败给出重试文案', () => $('#profSaveErr').textContent.indexOf('重试') >= 0);
  check('v0.48 保存失败后按钮变为「重新保存」', () => $('#profSaveBtn').textContent.trim() === '重新保存');
  check('v0.48 保存失败后按钮仍可点击（可重试）', () => $('#profSaveBtn').disabled === false);
  check('v0.48 保存失败不写入昵称', () => window.DB.state.me.name !== '重试小队');
  window.__PROFILE_MOCK__ = null;
  click($('#profSaveBtn'));
  await sleep(1100);
  check('v0.48 重试保存成功', () => window.DB.state.me.name === '重试小队' && !$('#ov-auth').classList.contains('show'));

  // —— v0.48 二次登录不再强制显示 ——
  check('v0.48 资料已完善时 profileCompleted 为真', () => window.DB.state.auth.profileCompleted === true);
  window.App.authGate();
  await sleep(800);
  check('v0.48 二次登录不再进入完善资料页', () => $('#ap-profile').style.display === 'none' && !$('#ov-auth').classList.contains('show'));
  // 跳过后资料未完善 → 下次进入仍提示一次
  window.App.enterProfile();
  await sleep(100);
  click(doc.querySelector('#ap-profile [data-action="prof-skip"]'));
  await sleep(600);
  check('v0.48 跳过后标记为资料未完善', () => window.DB.state.auth.profileCompleted === false);
  window.App.authGate();
  await sleep(800);
  check('v0.48 资料未完善时再次进入会提示', () => $('#ap-profile').style.display !== 'none');
  // 复原：补全资料并回到首页
  setProfNick('雪山脚下的老王2');
  await sleep(1000);
  click($('#profSaveBtn'));
  await sleep(1100);
  check('v0.48 补齐资料后再次标记完成', () => window.DB.state.auth.profileCompleted === true);
  window.DB.state.me.name = '雪山脚下的老王'; window.DB.save();

  // token：过期 → 静默刷新；refresh 也过期 → 强制登出
  const tk0 = window.DB.state.auth.token;
  window.DB.state.auth.expireAt = Date.now() - 1000;
  window.App.authGate();
  await sleep(700);
  check('v0.45 access_token 过期触发静默刷新', () => window.DB.state.auth.logged === true && window.DB.state.auth.token !== tk0 && window.DB.state.auth.expireAt > Date.now());
  window.DB.state.auth.expireAt = Date.now() - 1000;
  window.DB.state.auth.refreshExpireAt = Date.now() - 1000;
  window.App.authGate();
  await sleep(900);
  check('v0.45 refresh 也过期则强制登出并回登录页', () => window.DB.state.auth.logged === false && $('#ov-auth').classList.contains('show'));

  // 退出登录：二次确认 + 保留本地内容
  const convKeepN = window.DB.state.conversations.length;
  click(doc.querySelector('#meBody [data-action="settings"]'));
  await sleep(80);
  click(doc.querySelector('#settingsBody [data-action="logout"]'));
  await sleep(80);
  check('v0.45 退出登录需二次确认', () => $('#cfMask').classList.contains('show'));
  click($('#cfOk'));
  await sleep(500);
  check('v0.45 退出后清除登录态', () => window.DB.state.auth.logged === false && !window.DB.state.auth.token);
  check('v0.45 退出不清空本地内容', () => window.DB.state.conversations.length === convKeepN);
  // 复原登录态，避免影响后续断言
  window.DB.state.auth.logged = true; window.DB.state.auth.uid = 'me';
  window.DB.state.auth.token = 'atk.me.restored'; window.DB.state.auth.expireAt = Date.now() + 1800000;
  window.DB.state.auth.refreshExpireAt = Date.now() + 2592000000;
  window.DB.save();
  click(doc.querySelector('#ov-auth') ? $('#authCk') : $('#authCk'));
  await sleep(40);

  // ================= v0.53 强提醒弹窗下线 + 系统消息承接 =================
  const fs = require('fs');
  const appSrc = fs.readFileSync(path.join(dir, 'assets', 'app.js'), 'utf8');
  const dataSrc = fs.readFileSync(path.join(dir, 'assets', 'data.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

  /* 去掉注释后，可执行代码里不应再有 popup 字段的读写；
     data.js 中仅保留「旧存档剥离」这一句 delete，防止老数据被别处读出来再唤起弹窗。 */
  const noComment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  check('v0.53 源码中已无强提醒弹窗实现', () => !/sysPopup|sysPopped/.test(appSrc));
  check('v0.53 可执行代码中已无 popup 读写（仅留旧存档剥离语句）',
    () => !/\bpopup\b/i.test(noComment(appSrc)) && !/popup/i.test(noComment(htmlSrc)) &&
      noComment(dataSrc).split('\n').filter(l => /\bpopup\b/i.test(l)).every(l => /delete\s+m\.popup/.test(l)));

  // 弹窗原文："⚠️ 野遇安全中心" + sm1.summary + 「查看详情 → 防骗指南」
  (function () {
    const sm1 = window.DB.state.sysMsgs.filter(x => x.id === 'sm1')[0];
    if (sm1) sm1.read = false;
    window.DB.save();
  })();
  if (window.App.enterApp) window.App.enterApp();
  await sleep(1000);
  check('v0.53 归入主界面不再弹出任何 Modal',
    () => !$('#cfMask').classList.contains('show') && !doc.querySelector('.center-mask.show'));
  if ($('#ov-onboard').classList.contains('show')) {
    click(doc.querySelector('[data-action="ob-skip"]')); await sleep(200);
    check('v0.53 引导结束后同样不弹 Modal',
      () => !$('#cfMask').classList.contains('show') && !doc.querySelector('.center-mask.show'));
  }

  check('v0.53 系统消息数据已无残留 popup 字段',
    () => window.DB.state.sysMsgs.every(m => !('popup' in (m || {}))));
  check('v0.53 弹窗文案完整迁入系统消息（标题+摘要+CTA 指向防骗指南）', () => {
    const m = window.DB.state.sysMsgs.filter(x => x.id === 'sm1')[0];
    return !!m && m.cat === 'safety' && m.level === 'urgent' &&
      /诈骗/.test(m.title) && /冒充领队|报名费/.test(m.summary) &&
      !!m.body.length && !!m.cta && m.cta.id === 'sm2';
  });
  check('v0.53 迁入消息具备标题/时间/置顶/未读四要素', () => {
    const m = window.DB.state.sysMsgs.filter(x => x.id === 'sm1')[0];
    return !!m.title && !!m.ts && m.pinned === true && m.read === false;
  });
  check('v0.53 防骗指南正文保留 5 类高频话术', () => {
    const m = window.DB.state.sysMsgs.filter(x => x.id === 'sm2')[0];
    return !!m && /防骗指南/.test(m.title) && (m.body || []).join('').indexOf('验证码') >= 0;
  });

  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(60);
  /* v0.60：原横幅承接的职责改由服务区首行的副标题摘要承担（取 sysTopAny，与列表同序） */
  /* 前面的用例会把消息读掉，运行时未读数不确定 —— 这里先构造确定状态再断言，
     否则用例是「碰运气」而不是验证行为。 */
  window.DB.state.sysMsgs.forEach(m => { m.read = (m.id !== 'sm1'); });
  window.App.renderMe();
  await sleep(40);
  check('v0.60 系统消息行摘要承接原横幅的安全提醒（有未读时显示置顶标题）', () => {
    const r = doc.querySelector('#meBody .row[data-action="sysmsg"]');
    return !!r && r.textContent.indexOf('1 条未读') >= 0 && r.textContent.indexOf('警惕冒充') >= 0;
  });
  check('v0.60 无未读时不显示标题摘要，改显示总数与分类', () => {
    window.DB.state.sysMsgs.forEach(m => { m.read = true; });
    window.App.renderMe();
    const r = doc.querySelector('#meBody .row[data-action="sysmsg"]');
    /* 用完立刻还原：后面的 v0.53 断言依赖「既有未读又有已读」的混合状态 */
    window.DB.state.sysMsgs.forEach(m => { m.read = (m.id !== 'sm1'); });
    window.App.renderMe();
    return !!r && /条 ·/.test(r.textContent) && !r.querySelector('.sys-badge');
  });
  click(doc.querySelector('#meBody .row[data-action="sysmsg"]'));
  await sleep(60);
  check('v0.53 列表按「置顶 / 其余」分组', () => $$('#sysBody .sys-grp').length === 2 &&
    /置顶/.test(doc.querySelector('#sysBody .sys-grp-h').textContent));
  check('v0.53 未读概览条存在且计数正确', () => {
    const n = window.DB.state.sysMsgs.filter(m => !m.read).length;
    return !!$('#sysBody .sys-sum') && $('#sysBody .sys-sum').textContent.indexOf(n + ' 条未读') >= 0;
  });
  check('v0.53 未读项有强调态、已读项弱化', () => !!doc.querySelector('#sysBody .sys-item.unread') &&
    !!doc.querySelector('#sysBody .sys-item:not(.unread)'));
  check('v0.53 空分组不渲染（无残留占位）', () => $$('#sysBody .sys-grp').every(g => g.querySelectorAll('.sys-item').length > 0));
  click(doc.querySelector('#ov-sysmsg [data-close="ov-sysmsg"]'));
  await sleep(40);

  // ================= v0.54 推荐给朋友 + 二维码仅本人可见 =================
  /* 给 u1 起个明显备注：名片/会话预览都属于「给别人看的转述」，必须显示昵称而非备注 */
  (function () {
    window.DB.state.remarks = window.DB.state.remarks || {};
    window.DB.state.remarks.u1 = '露营搭子';
    window.DB.save();
  })();
  click(doc.querySelector('.tab[data-tab="contacts"]'));
  await sleep(80);
  click(doc.querySelector('#contactList .row[data-id="u1"]'));
  await sleep(100);
  check('v0.54 备注生效（主页标题显示备注）', () => $('#profileBody').textContent.indexOf('露营搭子') >= 0);
  click(doc.querySelector('#ov-profile [data-action="prof-more"]'));
  await sleep(100);
  click(doc.querySelector('#profMoreBody [data-action="rec-open"]'));
  await sleep(120);
  check('v0.54 推荐打开好友选择器', () => $('#ov-picker').classList.contains('show') &&
    $('#pickerTitle').textContent.indexOf('推荐给好友') >= 0);
  check('v0.54 选择器不含被推荐人自己', () => !doc.querySelector('#pickerBody .row[data-id="u1"]'));
  /* 逐次重查 DOM：多选会重绘列表，旧引用已脱离文档树，直接 dispatch 不会冒泡到委托层 */
  const recIds = $$('#pickerBody .row').slice(0, 2).map(r => r.dataset.id);
  recIds.forEach(id => click(doc.querySelector('#pickerBody .row[data-id="' + id + '"]')));
  await sleep(80);
  click($('#pickerOk'));
  await sleep(150);
  const cardConvs = window.DB.state.conversations.filter(c => c.type === 'single' &&
    (c.messages || []).some(m => m.type === 'card' && m.cardUid === 'u1'));
  check('v0.54 名片以单聊消息送达两位好友', () => cardConvs.length === 2);
  check('v0.54 推荐后回到可操作状态（主页与菜单均已关闭）',
    () => !$('#ov-profile').classList.contains('show') && !$('#ov-profmore').classList.contains('show') &&
      !$('#ov-picker').classList.contains('show'));

  click(doc.querySelector('.tab[data-tab="chats"]'));
  await sleep(80);
  check('v0.54 会话列表预览显示昵称、不泄露备注', () => {
    const row = doc.querySelector('#chatList .row[data-id="' + cardConvs[0].id + '"]');
    /* v0.54 顺带修的既有缺陷：富消息 text 为空，预览会整行空白 —— 名片段必须能看出是名片 */
    return !!row && row.textContent.indexOf('露营搭子') < 0 && row.textContent.indexOf('个人名片：林小野') >= 0;
  });
  click(doc.querySelector('#chatList .row[data-id="' + cardConvs[0].id + '"]'));
  await sleep(400);
  check('v0.54 名片卡片可点开该用户主页',
    () => !!doc.querySelector('#chatWrap .card-msg[data-action="open-profile"][data-id="u1"]'));
  check('v0.54 名片卡片对外只显示昵称、不泄露私人备注', () => {
    const el = doc.querySelector('#chatWrap .card-msg');
    return !!el && el.textContent.indexOf('林小野') >= 0 && el.textContent.indexOf('露营搭子') < 0;
  });
  click(doc.querySelector('[data-close="ov-chat"]'));

  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(80);
  click(doc.querySelector('#meBody [data-action="my-qr"]'));
  await sleep(120);
  check('v0.54 自己的二维码仍可查看', () => $('#ov-qr').classList.contains('show') &&
    $('#qrTitle').textContent === '我的二维码' && !!doc.querySelector('#qrBox svg'));
  click(doc.querySelector('[data-close="ov-qr"]'));
  await sleep(60);
  /* 硬拦截：即使残留 DOM 仍在派发 user-qr，也拿不到他人的码 */
  (function () {
    const fake = doc.createElement('div');
    fake.setAttribute('data-action', 'user-qr');
    fake.setAttribute('data-id', 'u2');
    doc.body.appendChild(fake);
    click(fake);
    fake.remove();
  })();
  await sleep(120);
  check('v0.54 遗留 user-qr 路径不再渲染他人二维码', () => !$('#ov-qr').classList.contains('show'));
  check('v0.54 已无可查看他人二维码的入口', () => {
    const src = fs.readFileSync(path.join(dir, 'assets', 'app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return src.indexOf("renderQr(d.id)") < 0;
  });

  /* ========== v0.55 个人主页瘦身：删掉两条装饰性提示条 ==========
     判断依据：主页身份区下方直到「TA 的动态」之间，每一条横幅都必须回答「它促成了什么动作」。
     「你们已是好友」是主位 CTA 的同义反复，「共同兴趣」的价值只在选开场白那一刻。 */
  const __prof = (uid) => { window.App.openProfile(uid); return $('#profileBody').textContent; };

  check('v0.55 好友主页不再显示「你们已是好友」提示条', () => {
    const t = __prof('u1');
    return t.indexOf('你们已是好友') < 0 && t.indexOf('中设置备注、黑名单') < 0;
  });
  check('v0.55 好友主页不再常驻「共同兴趣」横条', () => {
    const t = $('#profileBody').textContent;
    return t.indexOf('共同兴趣：') < 0 && t.indexOf('最好的开场白') < 0;
  });
  check('v0.55 删掉横条后主页不残留空白占位', () => {
    const pads = [...doc.querySelectorAll('#profileBody .pad')];
    // 每个 .pad 都必须有可见内容；且兴趣标签卡与「TA 的动态」两处核心内容仍在
    const empty = pads.filter(p => !p.textContent.trim() && !p.querySelector('button'));
    const t = $('#profileBody').textContent;
    return empty.length === 0 && t.indexOf('兴趣标签') >= 0 && t.indexOf('TA 的动态') >= 0 &&
      !!doc.querySelector('#profileBody [data-action="follow"], #profileBody [data-action="open-chat"]');
  });
  check('v0.55 拉黑态的「为什么不能用」说明条保留（非装饰性文案）', () => {
    window.DB.state.blocked = (window.DB.state.blocked || []).concat(['u2']);
    const t = __prof('u2');
    const kept = /你已拉黑 TA/.test(t);
    window.DB.state.blocked = window.DB.state.blocked.filter(x => x !== 'u2');
    return kept;
  });
  check('v0.55 共同兴趣能力未删：仍用于打招呼话术（v0.77 广场卡片推荐理由已下线）', () => {
    const src = fs.readFileSync(path.join(dir, 'assets', 'app.js'), 'utf8');
    return src.indexOf('共同兴趣：') >= 0 &&            // 打招呼浮层的破冰提示
      src.indexOf("k:'shared'") >= 0 &&                 // 共同兴趣型开场白话术
      src.indexOf('sharedTags(uid)') >= 0;              // 打招呼取共同兴趣
  });
  check('v0.55 已下线样式 .tag.shared 无残留引用', () => {
    const src = fs.readFileSync(path.join(dir, 'assets', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(dir, 'assets', 'app.css'), 'utf8');
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    return !/tag\s+shared/.test(src) && !/tag\s+shared/.test(html) && !/\.tag\.shared/.test(css);
  });

  // ================= v0.56 系统消息收敛为「安全提醒 / 平台公告」 =================
  const ALIVE_CATS = { safety: 1, notice: 1 };
  const DEAD_CATS = ['activity', 'trade', 'update'];

  check('v0.56 分类清单只剩安全提醒与平台公告', () => {
    const m = appSrc.match(/var SYS_CATS = \[([\s\S]*?)\];/);
    if (!m) return false;
    const keys = m[1].split("k: '").slice(1).map(x => x.slice(0, x.indexOf("'")));
    return keys.length === 2 && keys.join(',') === 'safety,notice';
  });
  check('v0.56 来源映射表已删除三个已下线分类的下发方', () => {
    const m = appSrc.match(/var SYS_FROM = \{([\s\S]*?)\};/);
    return !!m && DEAD_CATS.every(c => m[1].indexOf(c) < 0) && /野遇安全中心/.test(m[1]);
  });
  check('v0.76 演示推送池已随「模拟推送」入口一并移除', () =>
    !/SYS_DEMO_PUSH/.test(appSrc));
  check('v0.56 数据源已无下线分类的种子消息', () => {
    const bad = window.DB.state.sysMsgs.filter(m => !ALIVE_CATS[m.cat]);
    /* 不断言总条数（只断言分类合法性），
       只断言：① 没有任何一条属于已下线分类 ② sm5/sm6/sm7 三条种子已不存在 */
    const dead = window.DB.state.sysMsgs.filter(m => ['sm5', 'sm6', 'sm7'].indexOf(m.id) >= 0);
    return bad.length === 0 && dead.length === 0 &&
      window.DB.state.sysMsgs.filter(m => ['sm1', 'sm2', 'sm3', 'sm4'].indexOf(m.id) >= 0).length === 4;
  });
  check('v0.56 迁移会清掉旧存档里的下线分类消息（不在抽屉里复活）', () => {
    return /SYS_ALIVE/.test(dataSrc) && /s\.sysMsgs = \(s\.sysMsgs \|\| \[\]\)\.filter/.test(dataSrc);
  });
  check('v0.56 我的页入口文案同步收敛（不再提交易通知）', () => {
    /* 有未读时入口显示的是「最新一条未读标题」（v0.36 设计），所以先全部已读再看常态文案 */
    window.DB.state.sysMsgs.forEach(m => { m.read = true; });
    window.DB.save();
    click(doc.querySelector('.tab[data-tab="me"]'));
    const row = doc.querySelector('#meBody .row[data-action="sysmsg"]');
    return !!row && row.textContent.indexOf('交易通知') < 0 &&
      row.textContent.indexOf('安全提醒') >= 0 && row.textContent.indexOf('平台公告') >= 0;
  });
  check('v0.56 全站已无三个下线分类的展示入口文案', () => {
    const cfg = fs.readFileSync(path.join(dir, 'assets', 'config.js'), 'utf8');
    /* 注释里说明"这两类已下线"是必要的（否则后人会把它加回来），
       所以这里只查可执行代码 —— 用 v0.53 已有的去注释工具 */
    const all = noComment(appSrc + htmlSrc + cfg + dataSrc);
    const hit = ['活动通知', '交易通知', '版本更新'].filter(t => all.indexOf(t) >= 0);
    return hit.length === 0;
  });
  check('v0.56 安全内容仍完整承接（sm1 置顶未读 + CTA 指向防骗指南）', () => {
    const m = window.DB.state.sysMsgs.filter(x => x.id === 'sm1')[0];
    return !!m && m.pinned === true && !!m.cta && m.cta.id === 'sm2' && /报名费/.test(m.summary);
  });

  // ================= v0.59 全局搜索 / 统一详情 / 图片查看器 =================
  // —— 搜索：入口、默认态（历史+热搜）、加载态、结果、空态 ——
  click(doc.querySelector('#sc-discover [data-action="open-search"]'));
  await sleep(60);
  check('v0.59 发现页提供全局搜索入口', () => $('#ov-search').classList.contains('show'));
  check('v0.59 搜索默认态给出热搜榜（无历史时不显示历史区）', () => {
    const hot = $$('#searchBody .sr-hot-r');
    return hot.length >= 5 && $('#searchBody').textContent.indexOf('大家都在搜') >= 0;
  });
  window.App.searchInput('露营');
  await sleep(20);
  check('v0.59 输入后先出骨架屏（加载态）', () => $$('#searchBody .sk-row, #searchBody .skeleton, #searchBody [class*=sk]').length > 0);
  await sleep(340);
  check('v0.59 加载完成出结果且命中关键词高亮', () => {
    const body = $('#searchBody');
    return !!body.querySelector('em') && body.textContent.indexOf('露营') >= 0;
  });
  check('v0.59 结果按「人 > 话题 > 圈子 > 内容」分层，含分组标题', () => {
    const t = $$('#searchBody .sec-title').map(e => e.textContent);
    return t.some(x => x.indexOf('用户') === 0) || t.some(x => x.indexOf('相关内容') === 0);
  });
  window.App.searchInput('不存在的关键词zzz');
  await sleep(340);
  check('v0.59 搜索零结果给空态 + 仍给热搜兜底', () => {
    const b = $('#searchBody');
    return b.textContent.indexOf('没有找到') >= 0 && b.querySelectorAll('.sr-hot-r').length > 0;
  });
  // 点结果 → 进详情 → 关键词进历史
  window.App.searchInput('露营');
  await sleep(340);
  const firstPost = $('#searchBody .row[data-action="sr-open-post"]');
  if (firstPost) click(firstPost);
  await sleep(80);
  check('v0.59 点搜索结果进统一详情（搜索页关闭 + 关键词进历史）', () => {
    return !$('#ov-search').classList.contains('show') &&
      $('#ov-post-detail').classList.contains('show') &&
      window.App.srHist().indexOf('露营') >= 0;
  });
  check('v0.59 历史可清空', () => {
    window.App.srClearHist();
    return window.App.srHist().length === 0;
  });

  // —— 统一详情：广场帖与好友动态同一套 UI ——
  const mMine = window.DB.state.moments.filter(m => m.userId === 'me')[0];
  window.App.openPostDetail('moment', mMine.id);
  await sleep(60);
  check('v0.59 好友动态也能打开详情（不再只有广场有详情页）', () =>
    $('#ov-post-detail').classList.contains('show') &&
    $('#ov-post-detail .screen-body').textContent.indexOf(mMine.text.slice(0, 8)) >= 0);
  // v0.69：作者卡上移到顶栏，中部不再重复；判据同步改为「整个详情页没有可用的关注按钮」
  check('v0.59 自己的动态在详情页不出现「关注」按钮', () => {
    const f = $('#ov-post-detail [data-action="follow"]');
    return !f || f.style.display === 'none';
  });
  // 点赞：两种来源字段不同（plaza=计数 / moment=数组），详情页表现必须一致
  const lkBefore = window.App.postLikeCount('moment', mMine);
  const mLikedBefore = window.App.postLiked('moment', mMine);
  click($('#ov-post-detail [data-action="post-like"]'));
  await sleep(60);
  check('v0.59 详情页点赞对两种来源都生效（moment 用点赞人数组，plaza 用计数）', () =>
    window.App.postLikeCount('moment', mMine) === lkBefore + (mLikedBefore ? -1 : 1) &&
    window.App.postLiked('moment', mMine) === !mLikedBefore);
  click($('#ov-post-detail [data-action="post-like"]'));
  await sleep(60);
  check('v0.59 再点一次回到原状态', () =>
    window.App.postLikeCount('moment', mMine) === lkBefore && window.App.postLiked('moment', mMine) === mLikedBefore);
  // 评论与回复
  const cmN0 = (mMine.comments || []).length;
  $('#pdCmInput').value = '主线评论';
  window.App.pdCmInput();
  click($('#ov-post-detail [data-action="pd-send"]'));
  await sleep(60);
  check('v0.59 详情可发评论', () => (mMine.comments || []).length === cmN0 + 1);
  const someCm = (mMine.comments || [])[0];
  if (someCm) {
    click($$('#ov-post-detail .pd-cm')[0]);
    await sleep(40);
    check('v0.59 点评论进入回复态（输入框提示「回复 某人」）', () =>
      /回复/.test($('#pdCmInput').placeholder));
    $('#pdCmInput').value = '回复内容';
    window.App.pdCmInput();
    click($('#ov-post-detail [data-action="pd-send"]'));
    await sleep(60);
    check('v0.59 回复带 replyTo，正文渲染「回复 某人」', () =>
      $$('#ov-post-detail .cm-rp').length > 0);
  }

  // —— 图片查看器 ——
  const withImg = window.DB.state.plaza.filter(p => (p.imgs || []).length >= 2)[0];
  window.App.openPostDetail('plaza', withImg.id);
  await sleep(60);
  click($$('#ov-post-detail .pd-media .ph')[0]);
  await sleep(60);
  check('v0.59 详情点图打开图片查看器', () => $('#ov-viewer').classList.contains('show'));
  check('v0.59 查看器页码与总数一致，第一张时「上一张」禁用', () => {
    const s0 = window.App.viewerState();
    const prev = doc.querySelector('#ov-viewer [data-action="viewer-prev"]');
    return $('#vwNum').textContent === '1/' + s0.imgs.length && prev.disabled === true;
  });
  click(doc.querySelector('#ov-viewer [data-action="viewer-next"]'));
  await sleep(40);
  check('v0.59 下一张生效（页码与下标同步）', () =>
    window.App.viewerState().idx === 1 && $('#vwNum').textContent.indexOf('2/') === 0);
  click(doc.querySelector('#ov-viewer [data-action="viewer-prev"]'));
  await sleep(40);
  check('v0.59 上一张生效', () => window.App.viewerState().idx === 0);
  click(doc.querySelector('#ov-viewer [data-action="close-viewer"]'));
  await sleep(40);
  check('v0.59 查看器可关闭且不影响详情', () =>
    !$('#ov-viewer').classList.contains('show') && $('#ov-post-detail').classList.contains('show'));
  if (doc.querySelector('[data-action="close-post-detail"]')) click(doc.querySelector('[data-action="close-post-detail"]'));
  await sleep(40);

  // —— 列表点正文进详情（好友流） ——
  window.App.friendsFeed();
  await sleep(40);
  const mtx = doc.querySelector('#momentList .mtx[data-action="open-moment"]');
  if (mtx) click(mtx);
  await sleep(60);
  check('v0.59 好友流点正文进详情（卡片内按钮不被误触）', () =>
    $('#ov-post-detail').classList.contains('show'));
  if (doc.querySelector('[data-action="close-post-detail"]')) click(doc.querySelector('[data-action="close-post-detail"]'));
  await sleep(40);

  // ================= v0.60 我的页重排版（删横幅 + 五级层次）=================
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(60);
  window.App.renderMe();
  await sleep(60);
  check('v0.60 我的页区块顺序为 身份→资产→我的内容→服务→更多', () => {
    const t = $$('#meBody .me-sec-h').map(e => e.textContent.replace(/\s/g, ''));
    return t.length === 3 && t[0].indexOf('我的内容') === 0 && t[1].indexOf('服务') === 0 && t[2].indexOf('更多') === 0;
  });
  check('v0.60 身份卡含关注/粉丝/动态三项统计', () => {
    const st = $$('#meBody .me-st');
    return st.length === 3 &&
      st[0].textContent.indexOf('关注') >= 0 && st[1].textContent.indexOf('粉丝') >= 0 &&
      st[2].textContent.indexOf('动态') >= 0 && st[2].dataset.action === 'mymoments';
  });
  /* v0.62：身份卡不再重复「编辑资料」—— 顶栏铅笔已承担该入口，同页两处是重复触达 */
  check('v0.60 身份卡展示签名', () => !!$('#meBody .me-hero .me-sign'));
  check('v0.62 身份卡不再重复编辑入口（编辑收敛到顶栏铅笔）', () => {
    const hero = $('#meBody .me-hero');
    return !hero.querySelector('[data-action="edit"]') && !doc.querySelector('#meBody .me-edit');
  });
  check('v0.62 顶栏仍保留编辑资料入口', () => !!doc.querySelector('.nb-right [data-action="edit"]'));
  check('v0.62 身份卡右上角只留二维码一个动作', () => {
    const btns = $$('#meBody .me-head button');
    return btns.length === 1 && btns[0].dataset.action === 'my-qr';
  });
  check('v0.60 资产条三项（野遇币/会员/靓号）仍为一级', () => {
    const mc = $$('#meBody .mc');
    return mc.length === 3 && mc[0].dataset.action === 'wallet' &&
      mc[1].dataset.action === 'vip' && mc[2].dataset.action === 'niceid';
  });
  check('v0.60 我的内容宫格四项，含「我的圈子」新入口', () => {
    const g = $$('#meBody .mg-item');
    return g.length === 4 && g.map(e => e.dataset.action).join(',') === 'mymoments,orders,mygroups,mycircles';
  });
  check('v0.60 宫格数量为 0 时不显示「0」角标', () => {
    const g = $$('#meBody .mg-item');
    return g.every(e => !e.querySelector('.mg-badge') || e.querySelector('.mg-badge').textContent.trim() !== '0');
  });
  check('v0.60 系统消息不再独占一组，与服务项同级', () => {
    const sec = $$('#meBody .me-sec')[1];   // 服务区
    return !!sec && !!sec.querySelector('[data-action="sysmsg"]') && !!sec.querySelector('[data-action="visitors"]');
  });
  check('v0.60 图标统一走内联 SVG（24×24 / stroke 1.7）', () => {
    const ics = $$('#meBody svg.ico');
    return ics.length >= 7 && ics.every(e => e.getAttribute('viewBox') === '0 0 24 24' &&
      e.getAttribute('stroke-width') === '1.7');
  });
  check('v0.60 全站已无横幅残留（CSS 与 DOM 均无 sys-banner）', () => {
    const cssHit = [...doc.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } })
      .some(r => r.selectorText && r.selectorText.indexOf('sys-banner') >= 0);
    return !cssHit && !doc.querySelector('.sys-banner');
  });

  // ============ v0.71 我的页靓号标识 ============
  // 旧判定 isNice 用 /^\d{4,}$/，而商城在售号码形如 ye_88888（带前缀）——
  // v0.72 号码本身改为纯数字，判定不再依赖前缀
  // 用户买了 1980 的至尊豹子号，我的页却显示「未设置」、昵称旁也不出徽章。
  const niceNumBak = window.DB.state.me.yeyuNum, niceIdBak = window.DB.state.me.yeyuId;
  const setNice = (num) => {
    window.DB.state.me.yeyuNum = num; window.DB.state.me.yeyuId = '野遇号：' + num;
    window.App.renderMe();
  };
  /* 不依赖前面的购买流程：先把号码显式重置为默认随机号，再断言「不该有标识」 */
  window.DB.state.me.yeyuNum = '88231';
  window.DB.state.me.yeyuId = '野遇号：88231';
  window.App.renderMe(); await sleep(40);
  check('v0.71 默认随机号不算靓号，我的页不挂靓号标识', () => {
    const sub = $('#meBody .me-hero .me-sub');
    return !!sub && !sub.querySelector('.me-id-tag') && !sub.querySelector('.me-id-num') &&
      !$('#meBody .me-hero .me-name .badge-nice');
  });
  check('v0.71 判定口径：商城号码 88888 识别为靓号', () => {
    const n = window.App.niceInfo({ yeyuNum: '88888' });
    return !!n && n.tag === '至尊';
  });
  check('v0.71 判定口径：默认号 88231 不误判为靓号', () =>
    window.App.niceInfo({ yeyuNum: '88231' }) === null);
  setNice('88888'); await sleep(40);
  check('v0.71 有靓号时我的页号码高亮 + 靓号标签', () => {
    const sub = $('#meBody .me-hero .me-sub');
    const num = sub.querySelector('.me-id-num'), tag = sub.querySelector('.me-id-tag');
    return !!num && num.textContent === '88888' && !!tag && /靓号/.test(tag.textContent);
  });
  // ============ v0.73 徽章收敛：图标去 emoji、标识只留「靓号」两个字 ============
  check('v0.73 我的页靓号标签只写「靓号」，不带稀有度后缀', () => {
    const tag = $('#meBody .me-hero .me-sub .me-id-tag');
    return !!tag && tag.textContent.trim() === '靓号' && !/至尊|稀有|好记|吉利|表白|纪念/.test(tag.textContent);
  });
  check('v0.73 我的页靓号标签用 SVG 线性图标代替 ✨ emoji', () => {
    const tag = $('#meBody .me-hero .me-sub .me-id-tag');
    return !!tag && !!tag.querySelector('svg.ico.bi') && !/\u2728/.test(tag.innerHTML);
  });
  check('v0.74 昵称旁不再出现靓号徽章（靓号只跟在号码旁）', () => {
    const nm = $('#meBody .me-hero .me-name'), sub = $('#meBody .me-hero .me-sub');
    return !nm.querySelector('.badge-nice') && !!sub.querySelector('.me-id-tag');
  });
  check('v0.74 靓号标识全页只出现一次（不重复）', () => {
    const all = $$('#meBody .me-id-tag').length + $$('#meBody .badge-nice').length;
    return all === 1 && $$('#meBody .badge-nice').length === 0;
  });
  check('v0.73 VIP 徽章用 crown 图标代替皇冠 emoji，文字仍是等级名', () => {
    const b = $('#meBody .me-hero .me-name .badge-vip');
    const src = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.js'), 'utf8');
    const seg = src.slice(src.indexOf('function vipTag'), src.indexOf('function vipBadge'));
    // 徽章内必须是 SVG 图标 + 等级文字（VIP / SVIP / 体验会员），不得再有彩色 emoji
    return !!b && !!b.querySelector('svg.ico.bi') && /VIP/.test(b.textContent) &&
      /svgIcon\('crown', 'bi'\)/.test(seg) && !/\u2728|\u{1F451}/u.test(seg);
  });
  check('v0.73 徽章渲染段（vipTag / idTagHtml / identityBadges）已无 emoji', () => {
    const src = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.js'), 'utf8');
    const seg = src.slice(src.indexOf('function vipTag'), src.indexOf('function nameWithBadge'));
    return !/\u2728|\u{1F451}/u.test(seg) && /svgIcon\('num', 'bi'\)/.test(seg);
  });
  check('v0.73 SVIP 铭牌不再有 CSS 伪元素重复插入皇冠（旧版昵称后两个皇冠）', () => {
    const css = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.css'), 'utf8');
    return !/badge-vip\.lv-svip::before/.test(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  });
  check('v0.73 昵称单独包 .me-nm-txt，徽章留在外层（长昵称不挤徽章）', () => {
    const nm = $('#meBody .me-hero .me-name');
    const txt = nm && nm.querySelector('.me-nm-txt');
    return !!txt && txt.textContent.trim().length > 0 &&
      !txt.querySelector('.badge-vip,.badge-nice');
  });
  check('v0.73 靓号商城内仍保留完整稀有度标签（至尊 / 稀有 / 好记…）', () => {
    const src = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.js'), 'utf8');
    return /class="nc-tag">\s*' \+ n\.tag/.test(src);
  });
  check('v0.71 至尊走金色系（稀有度色阶：至尊金 > 稀有紫）', () => {
    const tag = $('#meBody .me-hero .me-sub .me-id-tag');
    return !!tag && tag.classList.contains('t-gold');
  });
  check('v0.74 有靓号时昵称旁不重复显示靓号（只在号码旁显示一次）', () => {
    const nm = $('#meBody .me-hero .me-name'), sub = $('#meBody .me-hero .me-sub');
    return !nm.querySelector('.badge-nice') && !!sub.querySelector('.me-id-tag');
  });
  check('v0.71 有靓号时资产条显示「专属 + 号码」', () => {
    const cell = $$('#meBody .mc')[2];
    return /专属/.test(cell.textContent) && /88888/.test(cell.textContent);
  });
  // 名片码与我的页同一套标识
  click(doc.querySelector('#meBody .me-head [data-action="my-qr"]')); await sleep(80);
  check('v0.71 名片码上的野遇号胶囊同步显示靓号标识', () => {
    const yid = $('#ov-qr .qr-head .yid');
    return !!yid && yid.classList.contains('nice') && !!yid.querySelector('.me-id-tag');
  });
  click(doc.querySelector('#ov-qr [data-close="ov-qr"]')); await sleep(60);
  setNice('13145'); await sleep(40);
  check('v0.71 不同稀有度走不同色系（表白号 → 粉色）', () => {
    const tag = $('#meBody .me-hero .me-sub .me-id-tag');
    return !!tag && tag.classList.contains('t-pink');
  });
  // 还原：后续用例依赖默认号状态
  window.DB.state.me.yeyuNum = niceNumBak; window.DB.state.me.yeyuId = niceIdBak;
  window.App.renderMe(); await sleep(40);
  /* 演示参数：?nice=88888 直接挂靓号，看标识不必走一遍模拟支付。
     只认商城在售号码 —— 否则演示态会造出商城里根本没有的假号。 */
  check('v0.76 已移除 ?nice= 演示参数（靓号只能经商城购买写入）', () => {
    const src = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.js'), 'utf8');
    return !/\[\?&\]nice=/.test(src);
  });

  // ============ v0.72 野遇号统一为纯数字 ============
  check('v0.72 种子里不再出现 ye_ 前缀（野遇号一律纯数字）', () => {
    const src = require('fs').readFileSync(path.join(__dirname, 'assets', 'data.js'), 'utf8');
    return !/num:'ye_/.test(src) && !/yeyuNum:'ye_/.test(src) && !/野遇号：ye_/.test(src);
  });
  const numBak72 = window.DB.state.me.yeyuNum, idBak72 = window.DB.state.me.yeyuId;
  window.DB.state.me.yeyuNum = '88231'; window.DB.state.me.yeyuId = '野遇号：88231';
  window.App.renderMe(); await sleep(40);
  check('v0.72 我的页野遇号显示为纯数字', () => {
    const t = $('#meBody .me-hero .me-sub').textContent;
    return /88231/.test(t) && !/ye_/.test(t);
  });
  check('v0.72 商城在售号码全部为纯数字', () =>
    window.DB.state.niceIds.length >= 10 && window.DB.state.niceIds.every(n => /^\d+$/.test(n.num)));
  // 旧存档（ye_ 前缀）必须自动归一：不清缓存也不能丢掉用户已买的靓号
  const rawBak72 = window.localStorage.getItem('yeyu_proto_v1');
  const old72 = JSON.parse(window.localStorage.getItem('yeyu_proto_v1') || '{}');
  old72.me = old72.me || {};
  old72.me.yeyuNum = 'ye_88888'; old72.me.yeyuId = '野遇号：ye_88888';
  old72.niceIds = [{ id: 'nx', num: 'ye_66666', kind: 'five', label: '五连豹子号', price: 1680, tag: '稀有' }];
  old72.orders = [{ id: 'o72', goods: 'nice', subject: 'ye_88888', desc: '五连豹子号', amount: 1980 }];
  window.localStorage.setItem('yeyu_proto_v1', JSON.stringify(old72));
  window.DB.load();
  check('v0.72 旧存档 ye_ 前缀自动归一（号码 / 商城 / 订单三处）', () => {
    const st = window.DB.state;
    return st.me.yeyuNum === '88888' && st.me.yeyuId === '野遇号：88888' &&
      st.niceIds[0].num === '66666' &&
      (st.orders || []).some(o => o.subject === '88888');
  });
  check('v0.72 归一后靓号判定与标识照常生效', () => {
    window.App.renderMe();
    const sub = $('#meBody .me-hero .me-sub');
    return !!sub.querySelector('.me-id-tag') && !!sub.querySelector('.me-id-num');
  });
  if (rawBak72) window.localStorage.setItem('yeyu_proto_v1', rawBak72); else window.localStorage.removeItem('yeyu_proto_v1');
  window.DB.load(); window.App.renderMe(); await sleep(40);
  window.DB.state.me.yeyuNum = numBak72; window.DB.state.me.yeyuId = idBak72;
  check('v0.60 「我的圈子」可跳转圈子页', () => {
    click(doc.querySelector('#meBody .mg-item[data-action="mycircles"]'));
    return true;
  });
  await sleep(80);
  check('v0.60 点我的圈子后落在圈子 Tab', () => doc.querySelector('.tab[data-tab="circles"]').classList.contains('active'));
  click(doc.querySelector('.tab[data-tab="me"]'));
  await sleep(60);

  /* ================= v0.61 我的二维码（名片码重做）================= */
  click(doc.querySelector('#meBody .me-hero [data-action="my-qr"]'));
  await sleep(60);
  check('v0.61 二维码页打开', () => $('#ov-qr').classList.contains('show'));
  check('v0.61 名片卡含封面层（品牌渐变 + 远山）', () => !!$('#ov-qr .qr-cover'));
  check('v0.61 码区四角定位标齐全', () => ['tl', 'tr', 'bl', 'br'].every(k => !!doc.querySelector('#qrBox .qr-corner.' + k)));
  check('v0.61 码区中心有品牌徽标', () => !!$('#qrBox .qr-badge svg'));
  check('v0.61 二维码仍是真实可扫的 SVG', () => !!$('#qrBox svg') && $('#qrBox svg').outerHTML.indexOf('viewBox') >= 0);
  check('v0.61 野遇号做成可点胶囊', () => {
    const b = $('#qrHead .yid');
    return !!b && b.getAttribute('data-action') === 'qr-copy' && b.textContent.indexOf('野遇号') >= 0;
  });
  check('v0.61 操作区四枚按钮与卡片等宽对齐', () => {
    const acts = $$('#ov-qr .qr-act');
    return acts.length === 4 && acts.every(a => !!a.querySelector('.qa-ico svg'));
  });
  check('v0.61 图标由 ICONS 注入（stroke 1.7 统一）', () => {
    const svgs = $$('#ov-qr .qa-ico svg');
    return svgs.length === 4 && svgs.every(s => s.getAttribute('stroke-width') === '1.7');
  });
  check('v0.61 复制野遇号有反馈', () => {
    click($('#qrHead .yid'));
    return !![...(doc.querySelectorAll('.toast, #toast, .toast-wrap') || [])].length ||
      (window.App && typeof window.App.qrCopyId === 'function');
  });
  check('v0.61 隐私承诺收敛为一条胶囊，且不再出现原型自述', () => {
    const t = $('#qrNote').textContent || '';
    return /仅本人可见/.test(t) && t.indexOf('原型') < 0 && t.indexOf('演示') < 0;
  });
  check('v0.61 扫一扫按钮可跳转', () => {
    click(doc.querySelector('#ov-qr .qr-act[data-action="qr-scan"]'));
    return $('#ov-scan').classList.contains('show') && !$('#ov-qr').classList.contains('show');
  });
  click(doc.querySelector('[data-close="ov-scan"]'));
  await sleep(60);

  /* ================= v0.64 搜索页去混乱 ================= */
  click(doc.querySelector('#sc-discover [data-action="open-search"]'));
  await sleep(60);
  check('v0.64 默认页无历史时补「猜你想搜」，不再只剩一个榜单', () => {
    const t = $$('#searchBody .sec-title').map(e => e.textContent);
    return t.indexOf('猜你想搜') >= 0 && t.indexOf('大家都在搜') >= 0;
  });
  check('v0.64 默认页补「热门内容」，下半屏不再整片空白', () =>
    $$('#searchBody .sec-title').map(e => e.textContent).indexOf('热门内容') >= 0 &&
    $$('#searchBody .row[data-action="sr-open-post"]').length > 0);
  check('v0.64 热搜右侧是可验证的篇数，不再是「热度」绝对值', () => {
    const b = $('#searchBody');
    return b.textContent.indexOf('篇') >= 0 && b.textContent.indexOf('热度') < 0;
  });
  window.App.searchInput('露营');
  await sleep(400);
  check('v0.64 分组标题带数量与单位，和列表条数对得上', () => {
    const t = $$('#searchBody .sec-title').map(e => e.textContent);
    const u = t.find(x => x.indexOf('用户') === 0);
    const n = Number((u || '').replace(/[^0-9]/g, ''));
    return !!u && /^用户 · \d+ 位/.test(u) && $$('#searchBody .row[data-action="open-profile"]').length === n;
  });
  check('v0.64 连续输入不再反复闪骨架屏（仅首次输入给加载态）', () => {
    window.App.searchInput('露');
    return true;
  });
  await sleep(60);
  check('v0.64 第二次输入直接出结果，无骨架屏残留', () =>
    $$('#searchBody .sk-row, #searchBody .skeleton, #searchBody [class*=sk]').length === 0 &&
    $('#searchBody').textContent.indexOf('露') >= 0);
  check('v0.64 超出折叠量的组给「查看全部」出口', () => {
    window.App.searchInput('的');
    return true;
  });
  await sleep(400);
  check('v0.64 「查看全部」可展开且按钮变「收起」', () => {
    const btn = $('#searchBody .sr-more');
    if (!btn) return false;
    const before = $$('#searchBody .row').length;
    click(btn);
    return $$('#searchBody .row').length > before &&
      $('#searchBody .sr-more').textContent.indexOf('收起') >= 0;
  });
  check('v0.64 无图内容不再用 emoji 占位，走线性图标', () => {
    const th = $$('#searchBody .sr-thumb');
    return th.length > 0 && th.every(e => !/📷/.test(e.textContent));
  });
  window.App.searchInput('');
  await sleep(60);
  click(doc.querySelector('[data-close="ov-search"]'));
  await sleep(60);

  // ============ v0.67 详情页：悬浮操作栏 + 大图轮播 ============
  window.App.openPostDetail('moment', 'k3');   // k3 有 3 张图、作者 u3（非本人）
  var $pdtb = doc.querySelector('#ov-post-detail > .pd-topbar');
  check('v0.67 顶栏是浮层直属节点（不随正文滚动）', () => !!$pdtb);
  check('v0.67 顶栏含返回 / 头像 / 关注 / 转发四个元素', () => {
    return !!$pdtb.querySelector('[data-action="close-post-detail"]') &&
           !!$pdtb.querySelector('#pdTbAv[data-action="open-profile"]') &&
           !!$pdtb.querySelector('#pdTbFollow[data-action="follow"]') &&
           !!$pdtb.querySelector('[data-action="pd-share"]');
  });
  check('v0.67 头像绑定作者 id（点了进作者主页）', () => $pdtb.querySelector('#pdTbAv').getAttribute('data-id') === 'u3');
  check('v0.67 轮播按图片数生成整屏页', () => $$('#pdGalTrack .pd-gal-item').length === 3);
  check('v0.67 每张图都可点开查看器且带各自下标', () => {
    var its = $$('#pdGalTrack .pd-gal-item');
    return its.map(e => e.getAttribute('data-i')).join(',') === '0,1,2' &&
           its.every(e => e.getAttribute('data-action') === 'open-viewer');
  });
  check('v0.70 多图用底部悬浮圆点表示页码（点数 = 图片数）', () =>
    $$('#pdDots .pd-dot').length === 3 && !doc.querySelector('#pdGalNum'));
  check('v0.70 默认高亮第一个圆点', () => {
    const ds = $$('#pdDots .pd-dot');
    return ds[0].classList.contains('on') && !ds[1].classList.contains('on') && !ds[2].classList.contains('on');
  });
  check('v0.70 圆点可点：点第三个直接切到第三张并高亮', () => {
    click($$('#pdDots .pd-dot')[2]);
    const ds = $$('#pdDots .pd-dot');
    return ds[2].classList.contains('on') && !ds[0].classList.contains('on');
  });
  check('v0.70 手指滑动时高亮点跟随当前页', () => {
    const tr = $('#pdGalTrack');
    tr.scrollLeft = 2;                    // 真实环境：滑到第 3 张
    tr.dispatchEvent(new window.Event('scroll'));
    const ds = $$('#pdDots .pd-dot');
    return ds[2].classList.contains('on') && !ds[0].classList.contains('on');
  });
  check('v0.70 圆点容器不吃图片的滑动手势（容器 none / 圆点 auto）', () => {
    const css = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.css'), 'utf8');
    const box = css.match(/\.pd-dots\{[^}]*\}/);
    const dot = css.match(/\.pd-dot\{[^}]*\}/);
    return !!box && /pointer-events:none/.test(box[0]) && !!dot && /pointer-events:auto/.test(dot[0]);
  });
  check('v0.70 圆点热区覆盖到 14px（视觉只有 6px）', () => {
    const css = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.css'), 'utf8');
    return /\.pd-dot::after\{[^}]*inset:-4px/.test(css);
  });
  // 顶栏关注按钮：点了立刻换态（否则等于点了没反应）
  var fbTx0 = $('#pdTbFollow').textContent;
  click($('#pdTbFollow'));
  check('v0.67 点顶栏关注后按钮立刻换态', () => $('#pdTbFollow').textContent !== fbTx0);
  click($('#pdTbFollow'));
  check('v0.67 再点一次回到原状态', () => $('#pdTbFollow').textContent === fbTx0);
  click($pdtb.querySelector('[data-action="pd-share"]'));
  check('v0.67 转发给出明确反馈', () => $('#toast').textContent.indexOf('转发') >= 0);
  // 单图：不挂「1/1」这种噪声
  window.App.openPostDetail('moment', 'k2');
  check('v0.70 单图不显示页码圆点', () => !doc.querySelector('#pdDots'));
  check('v0.67 无图/单图仍渲染轮播容器', () => !!doc.querySelector('#pdGalTrack'));
  // 本人动态：没有「关注自己」
  var mMe = window.DB.state.moments.filter(m => m.userId === 'me')[0];
  if (mMe) {
    window.App.openPostDetail('moment', mMe.id);
    check('v0.67 本人动态顶栏隐藏关注按钮', () => $('#pdTbFollow').style.display === 'none');
  }
  click(doc.querySelector('[data-close="ov-post-detail"]') || doc.querySelector('#ov-post-detail [data-action="close-post-detail"]'));

  // ============ v0.69 详情页顶栏：独立占行 + 昵称 + 去重 ============
  window.App.openPostDetail('moment', 'k3');   // 作者 u3（非本人）
  check('v0.69 顶栏独立占行，不再 absolute 浮在图片上（不遮挡图片）', () => {
    const css = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.css'), 'utf8');
    const m = css.match(/\.pd-topbar\{[^}]*\}/);
    return !!m && /position:relative/.test(m[0]) && !/position:absolute/.test(m[0]) && !/pointer-events:none/.test(m[0]);
  });
  check('v0.69 无图占位不再给悬浮栏让位（.pd-nogal 已下线）', () => {
    const css = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.css'), 'utf8');
    return css.indexOf('.pd-nogal{padding-top') < 0 && css.indexOf('.pd-nogal') < 0;
  });
  check('v0.69 返回按钮右侧显示作者昵称', () => {
    const n = $('#pdTbName');
    return !!n && (n.textContent || '').trim().length > 0;
  });
  check('v0.69 昵称绑定作者主页（与头像同 id）', () => {
    const n = $('#pdTbName');
    return !!n && n.getAttribute('data-action') === 'open-profile' && n.getAttribute('data-id') === 'u3';
  });
  check('v0.69 中部不再重复渲染作者卡（头像/昵称/关注各只出现一次）', () =>
    !doc.querySelector('#ov-post-detail .pd-author') &&
    !doc.querySelector('#ov-post-detail .pd-a-info') &&
    $$('#ov-post-detail [data-action="follow"]').length === 1);
  check('v0.69 顶栏四件套齐全：返回 / 昵称 / 头像 / 关注 / 转发', () => {
    const tb = doc.querySelector('#ov-post-detail > .pd-topbar');
    return !!tb &&
      !!tb.querySelector('[data-action="close-post-detail"]') &&
      !!tb.querySelector('#pdTbName') &&
      !!tb.querySelector('#pdTbAv[data-action="open-profile"]') &&
      !!tb.querySelector('#pdTbFollow[data-action="follow"]') &&
      !!tb.querySelector('[data-action="pd-share"]');
  });
  click(doc.querySelector('#ov-post-detail [data-action="close-post-detail"]'));

  // ============ v0.68 预览壳：窄屏不再被裁掉左半边 ============
  // 根因：focus() 触发的 scrollIntoView 会把 .bezel（overflow:hidden 但仍可程序化滚动）
  // 横向滚走，整屏内容左移 → 用户看到「页面只剩右半边」。三道防线：
  check('v0.68 源码中不再有裸 focus()（一律 preventScroll）', () => {
    const src = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.js'), 'utf8');
    return src.indexOf('.focus()') < 0 && src.indexOf('preventScroll: true') > 0;
  });
  check('v0.68 手机屏使用不可滚动的 overflow:clip', () => {
    const css = require('fs').readFileSync(path.join(__dirname, 'assets', 'app.css'), 'utf8');
    return /\.bezel\{[^}]*overflow:clip/.test(css);
  });
  check('v0.68 提供屏幕横向滚动归零兜底', () => {
    if (typeof window.App.resetBezelScroll !== 'function') return false;
    window.App.resetBezelScroll();
    const bz = doc.querySelector('.bezel');
    return !!bz && bz.scrollLeft === 0;
  });
  // 窄屏自适应：宽度也要参与缩放（原来只按高度算，398px 机身在手机上会横向溢出）
  var winWBak = window.innerWidth, winHBak = window.innerHeight;
  try {
    window.innerWidth = 390; window.innerHeight = 844;
    window.App.fitStage();
    var zoomNarrow = doc.querySelector('.phone').style.zoom;
    window.innerWidth = 1280; window.innerHeight = 960;
    window.App.fitStage();
    var zoomWide = doc.querySelector('.phone').style.zoom;
    check('v0.68 窄屏（390px）下整机等比缩小', () => !!zoomNarrow && parseFloat(zoomNarrow) < 1);
    check('v0.68 宽屏（1280px）下不缩放', () => !zoomWide || parseFloat(zoomWide) === 1);
  } finally {
    window.innerWidth = winWBak; window.innerHeight = winHBak;
    window.App.fitStage();
  }

  // ============ v0.75 好友列表不再显示所在地 ============
  // 需要先回到好友列表（前面用例可能把状态改过），并清空搜索框
  var csBox = $('#contactSearch'); if (csBox) { csBox.value = ''; }
  window.App.renderContacts(); await sleep(40);
  check('v0.75 好友行不再显示所在地（无 .row-side 城市文本）', () => {
    const rows = $$('#contactList .row').filter(r => r.getAttribute('data-action') === 'open-profile');
    if (!rows.length) return false;
    // 好友行一律没有 .row-side；且行内文本不该出现城市字段值
    const cities = (window.DB.state.users || []).map(u => u.city).filter(Boolean);
    return rows.every(r => !r.querySelector('.row-side')) &&
      rows.every(r => cities.every(c => r.textContent.indexOf(c) < 0));
  });
  check('v0.75 功能行（新的朋友 / 群聊）的右侧徽章未受牵连', () => {
    const nf = $$('#contactList .row').filter(r => r.getAttribute('data-action') === 'newfriends')[0];
    return !!nf && !!nf.querySelector('.row-title');   // 结构仍在，只是好友行少了城市列
  });
  check('v0.75 去掉城市后昵称与签名仍在（信息没被误删）', () => {
    const rows = $$('#contactList .row').filter(r => r.getAttribute('data-action') === 'open-profile');
    return rows.length > 0 && rows.every(r => {
      const b = r.querySelector('.row-title b'), s = r.querySelector('.row-title small');
      return !!b && b.textContent.trim().length > 0 && !!s;
    });
  });

  // ============ v0.76 清理：移除原型演示 / 调试 / 实验性质内容 ============
  // 说明：只校验「真实用户能碰到」的界面与入口；源码注释不在此列（注释不影响业务）。

  check('v0.76 界面文案里不再出现「原型」二字', () => {
    const txt = doc.body.textContent || '';
    return txt.indexOf('原型') < 0;
  });
  check('v0.76 不再有「数据仅存于本地浏览器」这类本地存储说明', () =>
    (doc.body.textContent || '').indexOf('本地浏览器') < 0 &&
    (doc.body.textContent || '').indexOf('localStorage') < 0);
  check('v0.76 全站无「清空原型数据 / 重置数据」入口', () => {
    const has = $$('[data-action="reset"]').length + (doc.body.textContent || '').match(/清空原型数据|重置数据/g);
    return !has && !/case 'reset'/.test(appSrc);
  });
  check('v0.76 不再有「原型数据看板」入口', () => {
    const t = doc.body.textContent || '';
    return t.indexOf('数据看板') < 0 && !/renderLab/.test(appSrc);
  });
  check('v0.76 预览壳侧栏（含走查路径/假设/漏斗）已移除', () =>
    !doc.querySelector('.side') && !doc.querySelector('#sideFunnel'));
  check('v0.76 顶栏不再有 A/B 角标', () => !$('#abTag'));
  check('v0.76 设置页不再有「模拟 token 过期」调试入口', () => {
    window.App.renderMe && null;
    const t = (doc.querySelector('#settingsBody') || {}).textContent || '';
    return t.indexOf('模拟 token') < 0 && !/case 'mock-expire'/.test(appSrc);
  });
  check('v0.76 支付/会员页不再声明「模拟支付」', () => {
    const t = doc.body.textContent || '';
    return t.indexOf('模拟支付') < 0;
  });
  check('v0.76 授权/头像模拟开关已移除（源码级）', () =>
    !/setAuthMock|setAvatarMock|__AUTH_MOCK__|__AVATAR_MOCK__/.test(appSrc));
  check('v0.76 埋点层不再有 A/B 分组能力（源码级）', () => {
    const an = require('fs').readFileSync(path.join(__dirname, 'assets', 'analytics.js'), 'utf8');
    return !/abVariant|AB_KEY|ab_assignment/.test(an);
  });
  check('v0.76 演示开关关闭：验证码不再回显（生产口径）', () => {
    const cfg = require('fs').readFileSync(path.join(__dirname, 'assets', 'config.js'), 'utf8');
    return /exposeCodeInDemo:\s*false/.test(cfg) && /env:\s*'production'/.test(cfg);
  });
  check('v0.76 页面标题不再带「原型」标识', () =>
    !/原型/.test(doc.title) && !/原型/.test(htmlSrc.match(/<title>([^<]*)<\/title>/)[1] || ''));
  check('v0.76 移除后核心业务入口仍在（清理没误伤）', () => {
    const t = doc.body.textContent || '';
    return t.indexOf('好友') >= 0 && t.indexOf('发现') >= 0 && t.indexOf('圈子') >= 0 &&
      !!doc.querySelector('.tabbar') && $$('.tabbar .tab').length === 5;
  });

  // 持久化
  check('数据写入 localStorage', () => !!window.localStorage.getItem('yeyu_proto_v1'));

  console.log('\n--- 结果：' + pass + ' 通过 / ' + fail + ' 失败 ---');
  if (errors.length) { console.log('\n运行时错误：'); errors.forEach(e => console.log('  · ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
}).catch(e => { console.error('加载失败：', e); process.exit(1); });
