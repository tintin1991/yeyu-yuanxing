/* ============================================================
   野遇 · 交互逻辑
   ============================================================ */
(function () {
  var DB = window.DB, A = window.Analytics;
  var APP_VERSION = 'v0.79';   // 单一版本源：设置页 / 引导文案统一取这里
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  };

  var S = function () { return DB.state; };
  /* v0.52：备注优先级统一在这里兜底 —— U(uid).name 返回「备注 > 昵称」，
     rawName 保留原昵称（主页回显「昵称：xxx」用）。
     放在最底层而不是逐个渲染点替换，好处是全站（列表/会话/动态/搜索/名片）
     自动一致，且搜索也能命中备注；代价是返回的是浅拷贝，禁止对 U() 结果赋值。 */
  function userStatus(uid) { var u = S().users.filter(function (x) { return x.id === uid; })[0]; return (u && u.status) || 'active'; }
  function isGone(uid) { return userStatus(uid) === 'deleted' || userStatus(uid) === 'banned'; }
  var U = function (id) {
    if (id === 'me') return S().me;
    var r = S().users.filter(function (u) { return u.id === id; });
    var base = r[0] || { id: id, name: '未知用户', avatar: '🙂', color: '#98a2b3', py: '#', city: '', tags: [] };
    var rm = (S().remarks || {})[id];
    return rm ? { id: base.id, name: rm, rawName: base.name, py: base.py, avatar: base.avatar, color: base.color,
                  gender: base.gender, age: base.age, city: base.city, dist: base.dist, online: base.online,
                  sign: base.sign, tags: base.tags, vip: base.vip, yeyuId: base.yeyuId, status: base.status || 'active' } : base;
  };

  var currentTab = 'chats';
  var curConv = null;
  var curProfile = null;
  var plazaFilter = { sort: 'rec', tag: 'all' };
  var circleCat = 'rec';       // 圈子页分类：rec(推荐)/hot(人气)/徒步/骑行/露营/攀岩/桨板/同城/fav(收藏)
  var circleTodoOpen = false;  // v0.39：圈子页待办条默认折叠（一行+红点），点击才展开明细处理
  var circleMenuOpen = false;  // v0.41：右上角「＋」下拉菜单展开状态
  var circleQuery = '';        // 圈子页搜索关键词（v0.30）
  var curCircleId = null;      // 当前打开的圈子详情 id
  var mkEditId = null;         // 正在编辑的圈子 id（null = 新建模式）
  var mkDraft = { name:'', desc:'', icon:'⛺️', province:'', city:'', customProv:'', customCity:'', visibility:'public' };
  /* v0.16 私密圈：邀请好友的勾选 / 邀请码浮层模式 */
  var cinvSelected = [];
  var ccodeMode = 'input';      // input（输码入圈）/ show（展示本圈邀请码）
  var ccodeCircleId = null;
  /* v0.17 成员管理 / 入圈审核 */
  var cmemCircleId = null, cmemTab = 'members', cmemQuery = '', curMemUid = null;
  /* 邀请码（与 data.js genCode 同字符集，供新建私密圈使用） */
  function genCircleCode() {
    var ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += ch[Math.floor(Math.random() * ch.length)];
    return s;
  }
  /* v0.27：邀请码时效/次数上限（私密圈，缺省 20 次 / 7 天） */
  var CODE_LIMIT = 20;
  var CODE_TTL = 7 * 86400000;
  function dateOnly(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isPrivate(c) { return !!c && c.visibility === 'private'; }
  /* 建圈可选地区：省 / 市两级（与 M1 地域层级口径一致） */
  var MK_PROVS = {
    '广东': ['深圳','广州','珠海','东莞'],
    '浙江': ['杭州','宁波','温州','绍兴'],
    '江苏': ['南京','苏州','无锡','常州'],
    '四川': ['成都','绵阳','乐山'],
    '湖北': ['武汉','宜昌','恩施'],
    '陕西': ['西安','宝鸡','汉中'],
    '福建': ['厦门','福州','泉州'],
    '山东': ['青岛','济南','烟台'],
    '湖南': ['长沙','张家界','株洲'],
    '云南': ['昆明','大理','丽江'],
    '北京': ['北京'],
    '上海': ['上海'],
    '重庆': ['重庆']
  };
  var MK_ICONS = ['⛺️','🏕️','🌲','⛰️','🚴','🛶','🎣','🔥','📒','🧗','🏙️','🌆'];
  var MK_COLORS = ['#12b76a','#2f9e6f','#7a5cff','#e07b39','#2f7fd1','#d94f8a','#1f9c9c','#c9822a','#4a5c8c','#c2553f'];
  var pubDraft = { imgs: [], visibility: 'public', tags: [], circles: [] };
  var ccOpen = {};   // v0.18：圈子动态评论框展开状态 { postId: true }
  var curGreetUid = null, greetChoice = 'invite', obSelected = [];
  var fbRating = 5;
  var confirmCb = null;
  var curQuote = null;         // 被引用的消息
  var curMsgAct = null;        // 正在操作的消息
  var curForwardMid = null;     // 正在转发的消息 id
  var pickerCfg = null;        // 选人面板配置（发起群聊 / 邀请 / @）
  var niceFilter = 'all';      // 靓号分类
  var curNice = null;          // 当前购买的靓号
  var curVipPlan = null;       // 当前选中的会员套餐
  var voiceSec = 0, voiceTimer = null;
  var grpEditField = null;     // 'title' | 'announce'
  var curGroupId = null;       // 当前查看的群
  var grpRemoveMode = false;   // 群信息页「移除成员」模式
  var curSheetItems = null;    // 通用底部弹层选项

  /* ==========================================================================
     v0.36 平台系统消息（System Messages）
     B 端运营/安全中心下发 → C 端「我的 → 系统消息」展示。
     分类与级别是两级正交维度：分类决定「归哪个抽屉」，级别决定「多强地告诉你」。
       urgent    ：置顶 + 红标（诈骗预警、资金风险）
       important ：置顶 + 橙标（安全提示、账户变动）
       normal    ：常规列表
     v0.53：删除「打开 App 弹一次」的强提醒弹窗——用打断式 Modal 承载安全内容是
     错误的产品手段（用户还没有上下文就想看详情，必然被一律点掉，等于没有触达）。
     同一份内容改由「我的页顶部横幅 + 系统消息置顶 + 铃铛红点」三处常量级触达，
     既不打断主流程，也不会因为一次误触就永久消失。
     ========================================================================== */
  /* v0.56：分类从 5 类收敛到 2 类。
     原来的「活动 / 交易 / 版本更新」是运营与账户类通知，和安全提醒混在同一个抽屉里，
     结果是用户养成了「系统消息 = 广告」的忽略习惯，真正要看的诈骗预警也被一起划走。
     判断标准：**这一抽屉里任何一条被漏看，会不会造成实际损失？**
     答案是「会」的才配进系统消息 —— 安全提醒（会丢钱/有风险）与平台公告（涉及规则与合规）。
     活动/交易/版本各有其自然去处（活动聚合 / 钱包账单 / 关于页），不必占用这块高优先级的地。 */
  var SYS_CATS = [
    { k: 'safety', t: '安全提醒', ico: '🛡️', color: '#f04438' },
    { k: 'notice', t: '平台公告', ico: '📢', color: '#2f7fd1' }
  ];
  var SYS_LEVEL = {
    normal:    { t: '',     cls: '' },
    important: { t: '重要', cls: 'imp' },
    urgent:    { t: '紧急', cls: 'urg' }
  };
  var SYS_FROM = { safety: '野遇安全中心', notice: '野遇官方' };
  function sysCat(k) {
    /* 未知分类回落到「平台公告」而不是第一条：安全提醒的红标/🛡️ 是强语义，
       把来路不明的消息归进去会污染它的警示性 */
    return SYS_CATS.filter(function (c) { return c.k === k; })[0] || SYS_CATS[1];
  }
  var sysCatFilter = 'all';     // 消息中心当前分类
  var curSysId = null;          // 当前打开的系统消息 id

  var SCOPES = [
    { k: 'public',  t: '公开' },
    { k: 'friends', t: '好友可见' },
    { k: 'private', t: '仅自己' }
  ];
  /* ================= v0.65 可见范围（visibility）=================
     与「是否同步到圈子」彻底解耦：visibility 只管**个人域分发**（广场 + 好友流），
     同步到哪些圈子由 moment.circles 单独表达，两者互不为条件。
     取值只有三个：
       public  公开   → 进广场，所有人可见；好友流可见
       friends 好友可见 → 不进广场；仅互友 / 关注我的人在好友流可见
       private 仅自己可见 → 不进广场、不进好友流；且不允许同步到任何圈子
     默认值 public：入口在广场，用户发起的意图就是「发到广场」；
     想收敛的用户会主动改，默认替他收敛会让新内容拿不到任何分发。
     旧的第四个值 circle 已下线——「只给圈内看」现在用 circles 字段表达，
     不再由可见范围承担。旧存档的 scope='circle' 仍按原语义兼容读取。 */
  var VISIBILITY = [
    { k: 'public',  t: '公开',     d: '进入广场，所有用户可见' },
    { k: 'friends', t: '好友可见', d: '不进广场，仅互友与关注你的人可见' },
    { k: 'private', t: '仅自己',   d: '不进广场与好友流，也不能同步到圈子' }
  ];
  var ALL_TAGS = ['露营','徒步','骑行','攀岩','桨板','路亚','摄影','咖啡','找搭子','新手'];
  var GRADS = [['g1','⛺️'],['g2','🏕️'],['g3','🚴'],['g4','🔥'],['g5','🌲'],['g6','☕️'],['g7','📒'],['g8','🧗'],['g9','🎸']];
  var EMOJIS = ['😀','😄','😁','😂','🤣','😊','😍','😘','🤔','😐','🙄','😴','🤗','😭','😅','😉','😎','🥳','😇','🙃','👍','👏','🙏','💪','🤝','🔥','⛺️','🏕️','🌲','🏔️','🚴','🛶','🎣','☕️','📷'];
  var REPLIES = ['哈哈，这个我懂','那就这么说定了？','我在想周末的安排，一起？','刚看到消息，回晚了','这个营地我去过，还不错','装备这块我可以帮你列个清单','好啊，拉个小群聊？','你坐标在哪儿，看看顺不顺路','拍张图发我看看？','这周有点忙，下周行吗','收到 ✅','找搭子比找装备难多了','我一般周六有空','要不要先加个微信详聊？'];
  var ANSWERS = ['可以啊','没问题，我来安排','我看下时间，晚点回你','应该行，等我确认','行，就这么办'];
  var LOCATIONS = [
    { n:'杭州·径山营地',   a:'余杭区径山镇，海拔 500m，有热水' },
    { n:'杭州·午潮山',     a:'强度中等，6 公里环线' },
    { n:'上海·崇明东滩',   a:'风小人少，可车停营位旁' },
    { n:'深圳·塘朗山',     a:'地铁直达，适合拉练' },
    { n:'成都·龙泉山',     a:'城市观景台，骑行友好' }
  ];
  /* ==========================================================================
     会员权益中心（v0.33 · L1 / L2 / L3 三层模型）
     取代旧的 VIP_BENEFITS + VIP_COMING 双数组（后者曾产生「精准筛选」这类
     宣称有、实际谁都能用的虚假权益）。

       L1 Subject  : En.subject()  → { tier, weight, plan, expireTs, trial }
       L2 声明表   : ENTITLEMENTS  → 每项含 pol:{ free, vip, svip }
       L3 Gate     : En.can(key)   → Decision{ allowed, left, denyMode, upsell }

     四条硬约束：
       ① 会员中心展示列表由本表自动生成，禁止在别处手写权益文案
       ② key 全局唯一（En 初始化时自检）
       ③ 每次 denied 自动埋点 entitlement_denied，用于算卡点转化漏斗
       ④ upsell.targetTier 由 policy 推导：free→vip、vip→svip，永不推荐同级
     ========================================================================== */
  var TIER_WEIGHT = { none: 0, vip: 50, svip: 100 };
  var TIER_META = {
    none: { cls: '',          txt: '',     full: '免费用户' },
    vip:  { cls: 'lv-month',  txt: 'VIP',  full: 'VIP 会员' },
    svip: { cls: 'lv-svip',   txt: 'SVIP', full: 'SVIP 超级会员' }
  };
  /* 套餐 → 等级映射。兼容老 plan id：y1 由「年度VIP」升格 SVIP，无需清洗历史数据 */
  var PLAN_TIER = { m1: 'vip', q1: 'vip', vm0: 'vip', sm1: 'svip', sm0: 'svip', sq1: 'svip', y1: 'svip', t1: 'vip' };

  /* ---- L2：能力声明表（单一真源）----
     type : B 开关 / Q 配额 / D 折扣
     pol  : { free, vip, svip }，Infinity 表示不限
     usage: 仅 Q 类必填，返回当前周期内「已用量」
     denyMode: hard 硬阻断收银台 / soft 灰显提示 / blur 模糊可见待解锁     */
  var ENTITLEMENTS = [
    { key: 'chat.greet', g: '互动沟通', i: '💬', type: 'Q', period: 'day', unit: '次',
      name: '每日主动打招呼', pol: { free: 3, vip: Infinity, svip: Infinity },
      usage: function (st) { return (st.greetLog || {})[todayKey()] || 0; },
      denyMode: 'hard',
      desc: { free: '每天 3 次', vip: '不限次数', svip: '不限次数' } },

    { key: 'expo.visitorDetail', g: '个人曝光', i: '👀', type: 'B',
      name: '谁看过我 · 完整名单', pol: { free: false, vip: true, svip: true },
      denyMode: 'blur',
      desc: { free: '仅显示模糊头像与人数', vip: '完整名单与到访时间', svip: '完整名单与到访时间' } },

    { key: 'privacy.stealth', g: '隐私与内容', i: '🕶️', type: 'B', svipOnly: true,
      name: '隐身浏览', pol: { free: false, vip: false, svip: true },
      denyMode: 'soft',
      desc: { free: '访问会留下痕迹', vip: '访问会留下痕迹', svip: '看别人主页不留任何痕迹' } },

    { key: 'group.memberCap', g: '群聊天', i: '👥', type: 'Q', period: 'total', unit: '人',
      name: '建群人数上限', pol: { free: 20, vip: 50, svip: 200 },
      usage: function (st, ctx) { return (ctx && ctx.conv) ? (ctx.conv.members || []).length : 0; },
      denyMode: 'hard',
      desc: { free: '每个群 20 人', vip: '每个群 50 人', svip: '每个群 200 人' } },

    { key: 'circle.joinCap', g: '圈子', i: '⭕', type: 'Q', period: 'total', unit: '个',
      name: '可加入圈子数', pol: { free: 5, vip: 15, svip: Infinity },
      usage: function (st) { return (st.myCircles || []).length; },
      denyMode: 'hard',
      desc: { free: '最多加入 5 个', vip: '最多加入 15 个', svip: '不限数量' } },

    { key: 'mall.niceDiscount', g: '商业化', i: '🎁', type: 'D',
      name: '靓号商城折扣', pol: { free: 1, vip: 0.8, svip: 0.7 },
      desc: { free: '原价购买', vip: '全场 8 折', svip: '全场 7 折' } },

    { key: 'identity.badge', g: '身份', i: '👑', type: 'B',
      name: '专属身份标识', pol: { free: false, vip: true, svip: true },
      desc: { free: '普通昵称', vip: 'VIP 徽章', svip: 'SVIP 金色专属徽章' } }
  ];

  /* ---- 设计已定、尚未接 UI 的能力（v0.34+ 排期）。不进会员中心展示列表。---- */
  var ENT_ROADMAP = [
    { key: 'match.whoLikedMe',    t: '谁喜欢我 · 实时名单', note: 'S2 · 第一付费点' },
    { key: 'match.crossCity',     t: '跨城 / 不限距离推荐', note: 'S2 · SVIP 独占' },
    { key: 'match.dailyCount',    t: '每日推荐人数配额',     note: 'S2' },
    { key: 'chat.freeText',       t: '自由输入开场白',       note: 'S2' },
    { key: 'chat.readReceipt',    t: '消息已读回执',         note: 'S2' },
    { key: 'expo.momentPin',      t: '动态置顶',             note: 'S2 · SVIP 独占' },
    { key: 'expo.momentBoost',    t: '动态曝光加权',         note: 'S2' },
    { key: 'group.createSlots',   t: '可创建群数量',         note: 'S2' },
    { key: 'circle.createSlots',  t: '可创建圈子数量',       note: 'S2' },
    { key: 'privacy.blockCap',    t: '黑名单额度',           note: 'S2' },
    { key: 'privacy.momentScope', t: '动态可见范围控制',     note: 'S2' },
    { key: 'privacy.reportPriority', t: '举报优先处理',      note: 'S2 · SVIP 独占' }
  ];

  /* ================= L1 + L3：运行时门控 ================= */
  var En = {
    /* L1：把「付费状态」翻译成「有效等级」。过期即时降级，无需额外清理任务。 */
    subject: function () {
      var v = S().me.vip;
      if (!v || !v.expire || v.expire <= Date.now()) {
        return { tier: 'none', weight: 0, plan: null, expireTs: 0, trial: false };
      }
      var tier = PLAN_TIER[v.plan] || 'vip';
      return {
        tier: tier, weight: TIER_WEIGHT[tier], plan: v.plan,
        expireTs: v.expire, trial: v.plan === 't1',
        days: Math.max(1, Math.ceil((v.expire - Date.now()) / 86400000))
      };
    },
    tier: function () { return En.subject().tier; },
    meta: function () { return TIER_META[En.subject().tier]; },
    ent: function (key) {
      for (var i = 0; i < ENTITLEMENTS.length; i++) if (ENTITLEMENTS[i].key === key) return ENTITLEMENTS[i];
      return null;
    },
    /* 取某 key 在当前等级下的策略值（D 类返回折扣率，B 类返回 bool，Q 类返回上限） */
    value: function (key) {
      var e = En.ent(key); if (!e) return null;
      var t = En.subject().tier;
      return e.pol[t === 'none' ? 'free' : t];
    },
    /* ④ upsell 目标等级由 policy 推导：找第一个「比当前值更优」的付费等级 */
    upsellTarget: function (key) {
      var e = En.ent(key); if (!e) return null;
      var sub = En.subject();
      var cur = e.pol[sub.tier === 'none' ? 'free' : sub.tier];
      var order = sub.tier === 'svip' ? [] : (sub.tier === 'vip' ? ['svip'] : ['vip', 'svip']);
      for (var i = 0; i < order.length; i++) {
        var cand = e.pol[order[i]];
        var better = (e.type === 'B') ? (cand === true && cur !== true)
                   : (e.type === 'D') ? (cand < cur)
                   : (cand > cur || cand === Infinity);
        if (better) return order[i];
      }
      return null;
    },
    /* L3：统一出口。所有业务代码只允许调 En.can()，禁止再写 if (isVip()) */
    can: function (key, ctx) {
      var e = En.ent(key);
      /* 未声明的能力不做限制，避免误伤（但会在自检里暴露） */
      if (!e) return { allowed: true, left: Infinity, key: key, tier: En.subject().tier, unknown: true };
      var sub = En.subject();
      var slot = sub.tier === 'none' ? 'free' : sub.tier;
      var cap = e.pol[slot];
      var used = (e.type === 'Q' && e.usage) ? e.usage(S(), ctx) : 0;
      var left = Infinity, allowed = true;
      if (e.type === 'B') { allowed = !!cap; left = cap ? Infinity : 0; }
      else if (e.type === 'Q') { left = (cap === Infinity) ? Infinity : Math.max(0, cap - used); allowed = left > 0; }
      else { allowed = true; left = Infinity; }
      var target = allowed ? null : En.upsellTarget(key);
      var d = {
        allowed: allowed, left: left, cap: cap, used: used, key: key, ent: e,
        tier: sub.tier, denyMode: e.denyMode || 'hard',
        upsell: target ? { targetTier: target, meta: TIER_META[target] } : null
      };
      /* ③ 每次拒绝都埋点，用于计算卡点转化率与「最招骂卡点」排名 */
      if (!allowed && A) A.track('entitlement_denied', { key: key, tier: sub.tier, target: target || '' });
      return d;
    },
    /* D 类便捷：算折后价（单位分或元均可，返回同单位） */
    price: function (key, n) {
      var r = En.value(key); return Math.round(n * (typeof r === 'number' ? r : 1));
    },
    /* ROADMAP 里但尚未实现的 key：can() 一律放行，但会在自检插件中列出 */
    pending: function (key) {
      for (var i = 0; i < ENT_ROADMAP.length; i++) if (ENT_ROADMAP[i].key === key) return true;
      return false;
    }
  };
  /* L3 统一付费引导出口：所有 hard 卡点共用，保证话术风格与升级等级推导一致。
     ④ 再次强调：目标等级只能来自 dec.upsell（由 policy 推导），禁止业务侧手写。 */
  function paywall(dec, opt) {
    opt = opt || {};
    var meta = dec.upsell ? dec.upsell.meta : null;
    var title = opt.title || (meta ? meta.txt + ' 特权' : '会员特权');
    var body = opt.body || ('「' + (dec.ent ? dec.ent.name : '该功能') + '」' +
      (meta ? '为 ' + meta.full + ' 特权，开通后立即生效。' : '需要升级会员后使用。'));
    var ok = opt.ok || (meta ? '开通 ' + meta.txt : '查看会员');
    confirmBox(title, body, function () { renderVip(); }, ok, opt.cancel || '知道了');
    if (A) A.track('paywall_view', { key: dec.key, target: meta ? meta.txt : '' });
  }
  /* ② 自检：key 唯一 + svipOnly 标记与 policy 一致性（开发期即崩，不留到运行时） */
  (function () {
    var seen = {};
    ENTITLEMENTS.forEach(function (e) {
      if (seen[e.key]) throw new Error('ENTITLEMENTS 重复 key: ' + e.key);
      seen[e.key] = 1;
      if (e.svipOnly && (e.pol.free || e.pol.vip || !e.pol.svip)) {
        throw new Error('ENTITLEMENTS svipOnly 与 policy 冲突: ' + e.key);
      }
    });
  })();
  var COIN_RATE = 10;          // 1 元 = 10 野遇币
  var COIN_TIERS = [           // 充值档位（coin 为到账币数，多给部分为赠送）
    { rmb: 6,   coin: 60 },
    { rmb: 30,  coin: 300 },
    { rmb: 98,  coin: 1000 },
    { rmb: 198, coin: 2100 },
    { rmb: 328, coin: 3600 },
    { rmb: 648, coin: 7280 }
  ];
  var NICE_KINDS = [
    { k:'all',   t:'全部' }, { k:'five', t:'豹子号' }, { k:'seq', t:'顺序号' },
    { k:'lucky', t:'吉利号' }, { k:'love', t:'表白号' }, { k:'birth', t:'生日号' }, { k:'short', t:'短号' }
  ];

  /* ================= 工具 ================= */
  /* v0.21：主题应用（浅色 / 深色）。状态持久化于 settings.theme，
     只切换 <html data-theme>，全部视觉差异由 CSS token 层反转完成。 */
  function applyTheme() {
    var dark = S().settings && S().settings.theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    /* 侧栏快捷按钮文案同步（设置页开关由 renderSettings 重绘） */
    var tb = $('#themeBtn');
    if (tb) tb.innerHTML = dark
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg> 浅色模式'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg> 深色模式';
  }
  function timeLabel(ts) {
    var d = new Date(ts), now = new Date(), diff = now - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    var y = new Date(now - 86400000);
    if (d.toDateString() === y.toDateString()) return '昨天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function scopeLabel(k) {
    var s = SCOPES.filter(function (x) { return x.k === k; })[0];
    return s ? s.t : '公开';
  }
  /* v0.65：取一条动态的可见范围。新数据读 visibility，旧存档回落到 scope，
     两者都不存在时按 public 处理（与历史上"没设过就是公开"一致）。 */
  function visOf(m) {
    if (!m) return 'public';
    return m.visibility || m.scope || 'public';
  }
  function visLabel(k) {
    var v = VISIBILITY.filter(function (x) { return x.k === k; })[0];
    if (v) return v.t;
    return scopeLabel(k);            // 旧值 circle 等回落旧文案
  }
  /* 仅自己可见是全局最强收敛：不允许再同步给圈子成员，否则两条规则互相打脸 */
  function visBlockCircle(k) { return k === 'private'; }
  /* ---- 群角色：owner 群主 / admin 管理员 / member 普通成员 ---- */
  function roleOf(c, uid) {
    if (!c || c.type !== 'group') return 'member';
    if (c.owner === uid) return 'owner';
    if ((c.admins || []).indexOf(uid) >= 0) return 'admin';
    return 'member';
  }
  function roleBadge(r) {
    if (r === 'owner') return '<span class="role owner">群主</span>';
    if (r === 'admin') return '<span class="role admin">管理员</span>';
    return '';
  }
  function roleText(r) { return r === 'owner' ? '群主' : (r === 'admin' ? '管理员' : '普通成员'); }
  /* 权限矩阵：群主 > 管理员 > 普通成员 */
  function canDo(c, uid, act) {
    var r = roleOf(c, uid), t = roleOf(c, 'me');
    if (act === 'edit')      return t === 'owner' || t === 'admin';          // 改群名/群公告
    if (act === 'setAdmin')  return t === 'owner' && r !== 'owner';           // 任免管理员
    if (act === 'kick')      return t === 'owner' ? r !== 'owner'            // 群主可踢除自己外所有人
                                  : (t === 'admin' ? r === 'member' : false);// 管理员只能踢普通成员
    if (act === 'transfer')  return t === 'owner' && r !== 'owner';           // 转让群主
    if (act === 'dissolve')  return t === 'owner';                            // 解散群
    if (act === 'invite')    return true;                                     // 所有人可邀请
    return false;
  }
  /* ---- VIP ---- */
  /* 兼容层：语义等价于「是否付费会员」，内部统一走 L1 resolve。
     新代码请直接用 En.can(key) 做能力判定，不要用 isVip() 做万能判断。 */
  function isVip() { return En.subject().tier !== 'none'; }
  function vipLeftDays() {
    if (!isVip()) return 0;
    return Math.ceil((S().me.vip.expire - Date.now()) / 86400000);
  }
  /* v0.19：VIP 铭牌（统一出口）
     规则：① 仅在会员有效期内显示 ② 按套餐分级（年/季/月）视觉不同 ③ 过期立即消失
     适用：好友列表、会话列表、聊天标题、好友申请、群成员、个人主页 —— 全部走 vipTag()。 */
  /* v0.33：等级压缩为 VIP / SVIP 两级。差异体现在 cs badge 与权益策略，
     不再像旧版那样「四档文案不同、权益完全相同」。t1 体验会员归 VIP 低配。 */
  function vipStateOf(u) {
    if (!u) return null;
    var v = (u.id === 'me') ? S().me.vip : u.vip;
    if (!v || !v.expire || v.expire <= Date.now()) return null;   // 无会员 / 已过期
    var tier = PLAN_TIER[v.plan] || 'vip';
    var lv = TIER_META[tier];
    var days = Math.max(1, Math.ceil((v.expire - Date.now()) / 86400000));
    return {
      vip: v, tier: tier, cls: lv.cls, days: days,
      txt: (v.plan === 't1') ? '体验会员' : lv.txt
    };
  }
  function isVipUser(u) { return !!vipStateOf(u); }
  function vipTag(u) {
    var s = vipStateOf(u);
    if (!s) return '';
    /* v0.73：皇冠 emoji 换成 ICONS.crown。
       emoji 在渐变徽章底上是彩色位图（金色块 + 平台字形差异），跟旁边的文字
       不是一个色系，缩小到 10px 更是糊成一团 —— 昵称后那排徽章看着"脏"就是这个。 */
    return '<span class="badge-vip ' + s.cls + '" title="野遇' + s.txt + ' · 剩余 ' + s.days + ' 天">' +
      svgIcon('crown', 'bi') + s.txt + '</span>';
  }
  function vipBadge() { return ''; }   // 历史函数，逻辑已统一到 vipTag(u)，保留空实现避免误调用
  function displayName(u) {
    var vip = u.id === 'me' ? isVip() : false;
    return vip ? '<span class="vip-name">' + esc(u.name) + '</span>' : esc(u.name);
  }
  /* ---- v0.71 靓号识别 / v0.72 号码改纯数字 ----
     ⚠️ 旧口径是 /^\d{4,}$/，但当时商城在售号码形如 ye_88888（带 ye_ 前缀）——
     用户花 1980 买了「至尊豹子号」，我的页却一直显示「未设置」，等于买了等于没买。
     v0.72 起号码本身就是纯数字（88888），口径不再需要跟前缀打架，但仍保留 strip：
     localStorage 里若有任何历史脏数据（ye_ 前缀），判定照样成立，不会漏认。
     两条路：
       ① 先查商城列表（最准：直接带 tag 与稀有度，至尊/稀有/好记/吉利/表白/纪念）；
       ② 不在列表但号码本身是豹子/短号/连号/对子（赠号、活动号），按特征识别。
     默认随机号 88231 两条都不命中 → 不是靓号，不会误挂标识。 */
  function isSeqNum(d) {                     // 12345 / 65432 这类连续递增或递减
    var up = true, dn = true;
    for (var i = 1; i < d.length; i++) {
      if (+d[i] !== +d[i - 1] + 1) up = false;
      if (+d[i] !== +d[i - 1] - 1) dn = false;
    }
    return (up || dn);
  }
  function niceInfo(u) {
    var n = (u && u.id === 'me') ? S().me.yeyuNum : (u && u.yeyuNum);
    if (!n) return null;
    var hit = (S().niceIds || []).filter(function (x) { return x.num === n; })[0];
    if (hit) return { num: n, tag: hit.tag || '靓号', label: hit.label || '', kind: hit.kind || '' };
    var d = String(n).replace(/^ye_/, '');
    if (!/^\d+$/.test(d)) return null;                            // 含字母的一律按普通号处理
    if (/^(\d)\1{2,}$/.test(d)) return { num: n, tag: '至尊', label: d.length + ' 连豹子号', kind: 'five' };
    if (d.length <= 4) return { num: n, tag: '稀有', label: '超级短号', kind: 'short' };
    if (d.length >= 4 && isSeqNum(d)) return { num: n, tag: '稀有', label: '顺序号', kind: 'seq' };
    if (/^(\d)\1(\d)\2$/.test(d) || /^(\d)(\d)\1\2$/.test(d)) return { num: n, tag: '好记', label: '对子号', kind: 'seq' };
    return null;
  }
  function isNice(u) { return !!niceInfo(u); }
  /* 稀有度 → 色系（金/紫/蓝/红/粉/青），保证「至尊」看起来就比「好记」贵 */
  var NICE_TONE = { '至尊': 'gold', '稀有': 'violet', '好记': 'blue', '吉利': 'red', '表白': 'pink', '纪念': 'cyan' };
  function niceTone(tag) { return NICE_TONE[tag] || 'violet'; }
  /* 号码旁的靓号标签。v0.73：商城以外一律只写「靓号」两个字 ——
     稀有度（至尊 / 稀有 / 好记 …）是商城里的选品信息，挂到身份卡上就成了自卖自夸，
     而且「靓号 · 至尊」这种写法让标签里塞了 6 个字，长昵称一行根本排不下。
     稀有度仍然体现在色系上（至尊金 / 稀有紫 / 好记蓝 …），不靠文字喊。 */
  function idTagHtml(n) {
    if (!n) return '';
    return '<span class="me-id-tag t-' + niceTone(n.tag) + '">' +
      svgIcon('num', 'bi') + '靓号</span>';
  }
  /* 昵称旁的尊贵标识：只放 VIP 铭牌。
     v0.74：把靓号徽章从这里去掉 —— 靓号是号码的属性，标识必须贴在号码旁边
     （「野遇号 88888 靓号」），昵称后再挂一个「靓号」就是同一信息重复两遍，
     而且昵称行本来就挤（长昵称 + VIP + 靓号三件套必溢出）。
     昵称旁只回答「是不是会员」，靓号在号码行自己说。 */
  function identityBadges(u) {
    if (!u) return '';
    return vipTag(u);                        // v0.19：VIP 铭牌（带等级 + 有效期校验）
  }
  function nameWithBadge(c, uid) {
    return displayName(U(uid)) + roleBadge(roleOf(c, uid));
  }

  /* v0.48 头像可能是 emoji（内置预设）也可能是图片 URL/dataURL（自定义上传），统一由这里判定 */
  function avatarInner(u) {
    var a = (u && u.avatar) || '';
    if (/^data:image\//.test(a) || /^https?:\/\//.test(a)) return '<img src="' + a + '" alt="" />';
    return a;
  }
  function avatarHtml(u, cls, online) {
    return '<div class="avatar ' + (cls || '') + '" style="background:' + u.color + '26">' +
      avatarInner(u) + (online ? '<i class="online"></i>' : '') + '</div>';
  }
  function groupAvatar(c) {
    var ms = c.members.filter(function (m) { return m !== 'me'; }).slice(0, 4);
    return '<div class="avatar-grp">' + ms.map(function (m) { return '<span>' + avatarInner(U(m)) + '</span>'; }).join('') + '</div>';
  }
  function convIcon(c) {
    if (c.type === 'group') return groupAvatar(c);
    var u = c.userId ? U(c.userId) : { avatar: '\uD83D\uDCE2', color: '#98a2b3' };
    return '<div class="avatar" style="background:' + u.color + '26">' + avatarInner(u) + '</div>';
  }
  function conv(id) {
    return S().conversations.filter(function (c) { return c.id === id; })[0];
  }
  function lastMsg(c) {
    var m = c.messages[c.messages.length - 1];
    if (!m) return { text: '暂无消息', ts: c.updatedAt, from: '' };
    return m;
  }
  /* v0.32：支持 ok/err/warn 三态。此前第二参数被丢弃，导致成功与失败视觉一致（CSS 早已备好 .toast.ok/.err） */
  function toast(msg, type) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }
  /* cb(ok) 形式可选：okText / cancelText 用于自定义按钮文案 */
  function confirmBox(title, text, cb, okText, cancelText) {
    $('#cfTitle').textContent = title; $('#cfText').textContent = text;
    var okBtn = $('#cfOk'), noBtn = $('#cfMask [data-action="close-cf"]');
    if (okBtn) okBtn.textContent = okText || '确定';
    if (noBtn) noBtn.textContent = cancelText || '取消';
    confirmCb = cb; $('#cfMask').classList.add('show');
  }
  /* viewer=true 时每张图带 open-viewer + 自己的下标（详情页用）；
     列表卡片不传，点图进详情而不是直接开查看器 —— 列表里用户的预期是"看这条"，不是"看图"。 */
  function photosHtml(imgs, viewer) {
    if (!imgs || !imgs.length) return '';
    var cls = imgs.length === 1 ? '' : (imgs.length === 2 ? 'ph-2' : 'ph-3');
    return '<div class="' + cls + '" style="margin:8px 0">' +
      imgs.map(function (i, ix) {
        return '<div class="ph ' + i.g + '"' + (viewer ? ' data-action="open-viewer" data-i="' + ix + '"' : '') + '>' + i.e + '</div>';
      }).join('') + '</div>';
  }

  /* ================= 导航 ================= */
  /* v0.58 发现页 = 关系维度二分：plaza（广场 · 推荐）/ friends（好友 · 互友 + 我关注的人）。
     关键契约：这个 Tab 的内容池按「关系」圈定，排序严格时间倒序 —— 不插推荐算法。
     用户对"好友流"的心理契约是「不想错过」，一旦在这里混入算法排序，
     用户会产生「我是不是漏看了」的焦虑，这是朋友圈类产品最不能碰的一条线。
     推荐/探索的职责全部交给「广场」，两个 Tab 各用最合适的排序策略，互不污染。 */
  var discoverTab = 'plaza';   // 发现页内部 tab：plaza（广场 · 推荐）/ friends（好友 · 互友 + 关注）
  function renderDiscover() { if (discoverTab === 'plaza') renderPlaza(); else renderFriendsFeed(); }
  function setDiscover(tab) {
    discoverTab = tab;
    $$('#discoverTabs .subtab').forEach(function (b) { b.classList.toggle('active', b.dataset.v === tab); });
    $('#dpanel-plaza').style.display = (tab === 'plaza') ? '' : 'none';
    $('#dpanel-friends').style.display = (tab === 'friends') ? '' : 'none';

    /* v0.65：发布入口归属广场，好友 Tab 不显示（顶部有明确的广场入口可切） */
    var pb = $('#btnPublishDiscover'); if (pb) pb.style.display = (tab === 'plaza') ? '' : 'none';
    renderDiscover();
    var body = $('#sc-discover .screen-body'); if (body) body.scrollTop = 0;
    A.track('discover_tab', { tab: tab });
  }
  function switchTab(name) {
    currentTab = name;
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('#sc-' + name).classList.add('active');
    $$('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    A.track('tab_' + name, {});
    if (name === 'chats') renderChats();
    if (name === 'contacts') renderContacts();
    if (name === 'discover') renderDiscover();
    if (name === 'me') renderMe();
    if (name === 'circles') renderCircles();
    var body = $('#sc-' + name + ' .screen-body'); if (body) body.scrollTop = 0;
  }
  function openOv(id) { $('#' + id).classList.add('show'); }
  function closeOv(id) { $('#' + id).classList.remove('show'); }
  function closeTop() {
    var open = $$('.overlay.show');
    if (open.length) { open[open.length - 1].classList.remove('show'); return true; }
    var m = $$('.center-mask.show');
    if (m.length) { m[m.length - 1].classList.remove('show'); return true; }
    return false;
  }

  /* ================= 消息列表 ================= */
  function renderChats() {
    var q = ($('#chatSearch').value || '').trim().toLowerCase();
    var list = S().conversations.slice().sort(function (a, b) {
      return (b.top ? 1 : 0) - (a.top ? 1 : 0) || b.updatedAt - a.updatedAt;
    });
    if (q) list = list.filter(function (c) {
      /* v0.54：富消息（图片/语音/位置/名片）text 为空，直接取 text 会让它们搜不到 */
      var lm = quoteText(lastMsg(c)) || '';
      return (c.title + ' ' + lm).toLowerCase().indexOf(q) >= 0;
    });
    var total = 0;
    var html = list.map(function (c) {
      var lm = lastMsg(c);
      var prefix = (c.type === 'group' && lm.from !== 'me' && lm.from !== 'sys') ? U(lm.from).name + '：' : '';
      total += c.unread || 0;
      var pin = c.top ? ' pinned' : '';
      var muteIco = c.muted ? '<span class="row-muted">🔕</span>' : '';
      var titlePre = c.top ? '📌 ' : '';
      /* v0.19：单聊会话给对方挂 VIP 铭牌（群聊/系统会话无会员概念） */
      var vipTagHtml = (c.type === 'single' && c.userId) ? vipTag(U(c.userId)) : '';
      return '<div class="row' + pin + '" data-action="open-chat" data-id="' + c.id + '">' +
        convIcon(c) +
        /* v0.54：这里显示最后一条消息的摘要而非原文 —— 图片/语音/位置/名片的 text 是空的，
           直接取会导致会话列表最后一条显示空白。」
           改名不改意：预览的语义就是「这条消息是什么」 */
        '<div class="row-title"><b>' + titlePre + esc(c.title) + vipTagHtml + '</b><small>' + esc(prefix + quoteText(lm)) + '</small></div>' +
        '<div class="row-side">' + muteIco + timeLabel(lm.ts || c.updatedAt) + (c.unread ? '<div style="margin-top:4px"><span class="badge">' + c.unread + '</span></div>' : '') + '</div>' +
        '<span class="row-more" data-action="conv-act" data-id="' + c.id + '" title="会话操作">⋯</span>' +
        '</div>';
    }).join('');
    $('#chatList').innerHTML = html || emptyBlock('💬', '暂无会话', '去广场对陌生人打个招呼吧', ['go-plaza', '去广场看看']);
    var b = $('#tabBadge');
    if (total > 0) { b.style.display = ''; b.textContent = total > 99 ? '99+' : total; } else { b.style.display = 'none'; }
  }
  function markAllRead() {
    S().conversations.forEach(function (c) { c.unread = 0; });
    DB.save(); renderChats();
    A.track('read_all', {});
    toast('已全部标为已读', 'ok');
  }
  /* v0.22：空状态支持主行动按钮 act = [action, 文案, dataV?]；
     调用方不传 act 时行为与旧版完全一致（向后兼容） */
  function emptyBlock(ico, t, d, act) {
    var btn = (act && act[1])
      ? '<button class="btn sm e-act" data-action="' + esc(act[0]) + '"' + (act[2] !== undefined ? ' data-v="' + esc(act[2]) + '"' : '') + '>' + esc(act[1]) + '</button>'
      : '';
    return '<div class="empty"><div class="e-ico">' + ico + '</div><p><b>' + t + '</b></p><p>' + d + '</p>' + btn + '</div>';
  }

  /* ================= v0.22 状态体系：骨架屏 / 按钮加载 / Toast 类型 ================= */
  /* 骨架屏与真实列表同构（行高/内边距一致），保证"骨架 → 内容"切换零跳动 */
  function skeletonRows(n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '<div class="sk-row"><div class="sk sk-ava"></div><div class="sk-col">' +
        '<div class="sk sk-line ' + (i % 3 === 0 ? 'w50' : (i % 3 === 1 ? 'w70' : 'w40')) + '"></div>' +
        '<div class="sk sk-line h10 ' + (i % 2 ? 'w60' : 'w80') + '"></div></div>' +
        '<div class="sk sk-line h10 w30"></div></div>';
    }
    return s;
  }
  function skeletonCards(n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '<div class="sk-card"><div class="sk-hd"><div class="sk sk-ava"></div>' +
        '<div class="sk-col"><div class="sk sk-line h14 w40"></div><div class="sk sk-line h10 w30"></div></div></div>' +
        '<div class="sk sk-line ' + (i % 2 ? 'w80' : 'w60') + '"></div>' +
        (i % 2 ? '' : '<div class="sk sk-img"></div>') + '</div>';
    }
    return s;
  }
  function skeletonMsgs(n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '<div class="sk-msg' + (i % 2 ? ' me' : '') + '"><div class="sk sk-ava sm"></div><div class="sk sk-bub"></div></div>';
    }
    return s;
  }
  /* 按钮加载态：loading（spinner+锁点击）→ 业务回调 → success（绿色反馈）→ 复位 */
  function btnLoading(btn, work, okMs) {
    if (!btn || btn.classList.contains('loading')) return;
    var old = btn.innerHTML;
    btn.classList.add('loading');
    btn.setAttribute('aria-busy', 'true');
    setTimeout(function () {
      try { work && work(); } catch (e) {}
      btn.classList.remove('loading');
      btn.removeAttribute('aria-busy');
      if (okMs) {
        btn.classList.add('success');
        setTimeout(function () { btn.classList.remove('success'); btn.innerHTML = old; }, okMs);
      } else {
        btn.innerHTML = old;
      }
    }, 520);
  }
  /* Toast 类型化：ok / err（图标由 CSS ::before 渲染，不碰 DOM 文本） */
  function toast(msg, type) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('ok', 'err');
    if (type) t.classList.add(type);
    t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  /* ================= 安全：黑名单 / 举报（v0.14） =================
     陌生人社交的合规底座。拉黑必须在「看到陌生人的每个地方」都能触发，
     且拉黑后必须真正生效（过滤内容 + 拦截收发），否则等于没做。 */
  function isBlocked(uid) { return !!uid && S().blocked.indexOf(uid) >= 0; }
  function blockedSet() { return S().blocked || []; }

  function blockUser(uid) {
    if (!uid || uid === 'me') return;
    var st = S();
    if (st.blocked.indexOf(uid) < 0) st.blocked.push(uid);
    // 顺带解除好友/关注关系，避免黑名单里还挂着好友
    st.friends = st.friends.filter(function (x) { return x !== uid; });
    st.me.following = st.me.following.filter(function (x) { return x !== uid; });
    DB.save();
    A.track('user_block', { user: uid });
    renderAll();
    toast('已拉黑 ' + U(uid).name + ' · 可在设置-黑名单解除', 'ok');
  }
  function unblockUser(uid) {
    var st = S();
    st.blocked = st.blocked.filter(function (x) { return x !== uid; });
    DB.save();
    A.track('user_unblock', { user: uid });
    renderAll(); renderBlacklist();
    toast('已解除拉黑 · ' + U(uid).name, 'ok');
  }

  function renderBlacklist() {
    var bl = blockedSet();
    $('#blacklistBody').innerHTML = bl.length
      ? '<p class="bl-tip">拉黑后：你们不会在彼此的广场与好友信息流中看到对方，TA 无法给你发消息，你也无法给 TA 发消息。</p>' +
        bl.map(function (id) {
          var u = U(id);
          return '<div class="row">' + avatarHtml(u, 'sm') +
            '<div class="row-title"><b>' + esc(u.name) + '</b><small>' + esc(u.city) + ' · 已拉黑</small></div>' +
            '<button class="btn gray sm" data-action="unblock" data-id="' + id + '">解除</button></div>';
        }).join('')
      : emptyBlock('🛡️', '黑名单是空的', '在 TA 的主页或聊天里可拉黑对方');
    openOv('ov-blacklist');
  }

  /* 举报：走确认弹窗 + 记埋点，而不是一句 toast 了事 */
  var REPORT_REASONS = ['色情低俗', '骚扰辱骂', '虚假信息/诈骗', '广告引流', '违法违规', '其他'];
  var curReport = null;
  function openReport(target, type) {
    curReport = { target: target, type: type || 'user' };
    var name = type === 'group' ? (conv(target) ? conv(target).title : '该群聊') : U(target).name;
    $('#reportBody').innerHTML =
      '<p class="rp-target">举报对象：' + esc(name) + '</p>' +
      '<div class="rp-reasons">' + REPORT_REASONS.map(function (r) {
        return '<button class="chip" data-action="report-reason" data-v="' + r + '">' + r + '</button>';
      }).join('') + '</div>' +
      '<p class="rp-note">恶意举报会被记录。平台将在 24 小时内完成审核。</p>';
    openOv('ov-report');
  }
  function submitReport(reason) {
    if (!curReport) return;
    S().reports.unshift({ id: 'r' + Date.now(), target: curReport.target, type: curReport.type, reason: reason, ts: Date.now(), status: 'pending' });
    DB.save();
    A.track('report_submit', { target: curReport.target, type: curReport.type, reason: reason });
    closeOv('ov-report');
    toast('已提交举报：' + reason + ' · 24 小时内处理', 'ok');
    var repTarget = curReport.target, repType = curReport.type;
    if (repType !== 'group') {
      confirmBox('是否同时拉黑该用户？', '拉黑后你们看不到彼此的内容，也无法互发消息。', function () {
        blockUser(repTarget);
      }, '拉黑并屏蔽', '暂不');
    }
  }

  /* v0.30：我的举报记录——把"提交即结束"升级为可追踪的处置闭环 */
  function renderReports() {
    var rs = S().reports || [];
    var stMap = {
      pending: { t: '审核中', fg: 'var(--tint-orange-fg)', bg: 'var(--tint-orange-bg)' },
      done: { t: '已处理', fg: 'var(--tint-green-fg)', bg: 'var(--tint-green-bg)' },
      reject: { t: '不成立', fg: 'var(--sub)', bg: 'var(--n-100)' }
    };
    var html = rs.length ? rs.map(function (r) {
      var m = stMap[r.status] || stMap.pending;
      var name = r.type === 'group' ? '某群聊' : U(r.target).name;
      return '<div class="rep-item">' +
        '<div class="rep-top"><b>' + esc(name) + '</b><span class="rep-st" style="color:' + m.fg + ';background:' + m.bg + '">' + m.t + '</span></div>' +
        '<div class="rep-meta">举报类型：' + esc(r.reason) + ' · ' + timeLabel(r.ts) + '</div>' +
        (r.result
          ? '<div class="rep-result">处理结果：' + esc(r.result) + '</div>'
          : '<div class="rep-result" style="color:var(--sub)">平台将在 24 小时内完成审核，请耐心等待回执</div>') +
        '</div>';
    }).join('') : emptyBlock('🛡️', '还没有举报记录', '遇到违规内容，可点击对方主页或会话的「举报」提交');
    $('#reportsBody').innerHTML = html;
    openOv('ov-reports');
  }

  /* ================= v0.57 好友首字母推导（数据驱动，取代静态 u.py）=================
     旧版直接读数据里的 u.py 静态字段 + 索引条硬编码 26 个字母，带来三个问题：
     ① 改备注 / 改昵称后，「显示的名字」变了，分组字母还是旧的（Anna 仍被塞在 L 组）
     ② 竖条永远 26 格，其中大半字母从未有好友，看起来像坏了且误触率高
     ③ 新增 / 删除好友后字母的可用性要人工维护，容易漏
     v0.57 改为：显示名 → 首字母 现算（pyLetter），索引条只渲染真实存在的分组。
     推导顺序：汉字查常用字首字母表 → 拉丁字母取自身 → 汉字查不到时回退数据里的 py
     （种子数据可信，宁可留在旧分组也不要掉进"其他"）→ 数字/emoji/符号归 #。 */
  /* 常用汉字首字母表：覆盖百家姓常见姓氏 + 昵称高频首字。
     多音字按最常用读音收录（如「重」zhòng、「曾」zēng、「乐」lè），本地够用；
     真上线应换成 pinyin-pro 之类的完整词库。 */
  var PY_CHAR = (function () {
    var t = {
      A: '阿啊哎艾爱安暗岸按奥敖傲',
      B: '八巴吧把白百柏摆班般板半帮包宝保报抱北贝备背本笨比笔必毕闭边编扁便别滨冰兵并波播伯博薄不布步部卜',
      C: '才材财采彩菜参残仓苍藏操草册层叉茶察差柴搀禅昌长常厂场超朝潮吵车撤臣尘陈晨衬称成城乘程池迟尺赤冲虫崇出初除楚处川传船串窗床吹垂春唇纯词瓷慈此次葱从丛粗促崔催存寸错',
      D: '达答打大代带待袋丹单但淡当党刀导岛倒到道得德灯登等邓低滴迪敌笛底地弟第点电店掉丁定东冬懂动都独读度渡短段断队对多夺朵躲',
      E: '鹅额恶恩儿而耳二',
      F: '发伐法帆凡烦繁反返犯泛饭范方芳防房访放飞非肥匪废沸分纷粉份丰风封疯峰锋蜂冯凤佛否夫肤服浮福府斧父付负妇富复覆',
      G: '改盖概干甘杆肝赶敢刚钢缸岗高告哥歌鸽搁格隔各给根跟更工弓公功攻供宫恭巩贡勾沟狗构购估姑谷股骨故顾固刮挂乖拐怪关观官管光广归规贵柜桂滚郭国果过',
      H: '哈孩海害含寒韩汉汗好何和河荷盒贺黑痕很狠恒横红洪虹宏猴后厚候乎呼狐胡湖虎互户花华画化话怀坏欢环还换荒慌皇黄煌灰挥回会患幻荒汇慧惠婚浑混活火伙或货获霍',
      J: '击饥圾机鸡积基激吉即急疾集几己挤给脊计记纪技际季寂济继寄加家夹佳嘉甲驾架假价坚间肩兼煎拣茧检简碱见件建剑健舰渐践鉴箭江将姜浆蒋降交郊骄胶焦蕉角脚搅叫教阶皆接揭街节杰结截姐解介界届借今斤金津仅尽紧近进晋禁京经精井景警净静镜敬九久酒旧救就居拘菊局举巨句拒具距卷决绝军均菌',
      K: '开凯慨刊堪看康抗考靠科棵颗可渴克刻客肯坑空孔恐口扣枯哭苦库裤酷快宽款狂况矿亏葵愧昆困扩括阔',
      L: '拉啦来蓝览懒烂郎朗浪劳牢老乐了雷冷梨离犁礼李里理力立丽利励历厉莉栗连莲联廉怜帘脸练恋链良凉梁粮两亮量谅聊辽了料列烈猎林临邻淋灵铃玲凌陵领令溜流留柳六龙笼隆楼漏露卢芦炉鲁陆录鹿路吕旅铝律虑率绿滤乱略轮论罗萝骡洛络骆落',
      M: '妈麻马码吗买卖麦满慢漫忙芒盲茫毛矛茅茂冒帽貌么没玫枚梅媒煤每美妹门闷蒙猛梦孟迷米密蜜苗妙灭民敏名明鸣命摸模磨摩魔末莫墨默谋某母木目牧墓慕暮穆',
      N: '拿哪那娜纳乃奶耐男南难囊恼脑闹内能尼泥拟你年念娘酿鸟尿捏宁牛扭纽农浓弄奴努怒女暖挪诺糯米',
      O: '哦欧偶呕藕',
      P: '趴爬拍排牌派攀盘判盼庞旁胖抛跑泡炮袍陪培裴盆朋棚蓬彭鹏捧碰批皮疲匹片偏篇片骗飘漂票拼贫品平评凭苹瓶坡泼婆破迫扑铺仆葡朴浦普谱瀑',
      Q: '七妻栖戚期欺齐其棋旗奇骑岐崎启起企器气弃汽恰千迁牵铅谦前钱潜浅遣欠枪墙强抢悄桥乔瞧巧壳翘切且怯侵亲秦琴勤青轻氢倾清情晴请庆穷丘邱秋求球区曲驱屈趋渠取娶去趣圈权全泉犬却确群',
      R: '然染嚷让绕惹热人仁忍认任扔仍日荣容溶融柔揉如乳辱入褥软瑞锐润若弱',
      S: '撒洒塞赛三伞散桑丧扫色森杀沙纱傻啥山杉删闪善扇伤商赏上尚少邵绍蛇舌舍设社射涉摄申伸身深神什沈审婶甚肾升生声牲绳省圣盛剩师诗狮施湿十石时识实拾食史使始驶示士世市事势是释饰试视柿适室逝收手守首寿受授售瘦书叔殊梳舒输熟暑署属鼠薯术束树竖数双爽水睡顺瞬说硕司丝私司思斯撕死四寺似饲松宋送颂搜苏俗素速塑宿酸蒜算随碎岁穗孙损笋缩所索锁',
      T: '他它她塌塔踏台抬太态泰贪谈坛谭滩痰坦叹炭探碳汤唐堂塘糖躺趟逃桃陶淘讨套特疼腾藤梯踢提题蹄体替天田甜填挑条跳贴铁厅听亭庭停挺通同铜童桶筒统痛偷头投透突图徒途涂土吐兔团推退腿吞托脱拖驼椭妥',
      W: '挖哇蛙娃瓦袜歪外弯湾丸完玩顽挽晚万碗汪王亡网往忘望危微巍为围违唯维伟委尾纬卫未位味畏胃谓喂温文闻蚊纹稳问翁窝蜗我握沃乌污巫呜屋无吴吾五午伍武侮舞雾务物误',
      X: '西吸希悉惜犀溪熙锡习席喜戏细虾瞎峡霞下夏仙先纤鲜掀闲弦贤嫌显险县现线限献乡相香湘箱详祥想享响巷项象橡削消萧硝销潇小晓孝笑效些歇蝎鞋写泄泻谢蟹心辛欣锌新信薪芯星猩行形型醒幸杏性兄凶雄熊休修朽秀绣袖锈须虚需徐许序叙续蓄宣悬旋选靴雪血穴学雪旬寻巡询循训讯迅',
      Y: '压呀鸦鸭牙芽崖雅亚咽烟淹盐严言岩沿炎研颜檐燕央秧杨扬洋阳仰养样妖腰摇遥咬药要耀椰爷也冶野业叶页夜液一衣医依仪宜姨移遗疑乙已以亿义艺忆议异益谊逸意毅因阴音银引饮隐印英樱鹰迎营盈影映硬应拥庸永勇涌用优忧幽悠尤由油游友有又右于予余鱼渔愉愚榆雨语玉育域欲御裕遇愈誉元园原圆源缘远院愿月越悦阅跃云匀允运晕韵蕴',
      Z: '杂灾栽宰载在赞暂脏遭糟早枣澡灶造噪责择泽增赠扎炸摘窄沾展占战站张章彰丈仗帐障招朝找召赵照罩折哲者这针珍真诊枕阵振镇争征挣整正政症之支汁芝枝知织脂蜘执直值职植殖止只纸指志至致智质治中忠终钟肿种众重舟周洲粥州竹烛逐主煮嘱住注助驻柱祝著筑铸抓爪专转庄装壮状撞追准捉桌卓着琢资咨姿子紫字自宗综总纵走奏揍租足族阻组祖钻嘴最罪醉尊遵昨左作坐座做'
    };
    var m = {};
    Object.keys(t).forEach(function (L) {
      /* 去掉" Xue"这类注释词，只保留纯汉字 */
      t[L].split('').forEach(function (c) { if (/[\u4e00-\u9fa5]/.test(c)) m[c] = L; });
    });
    return m;
  })();
  /* 显示名 → 索引字母：汉字查表 → 拉丁字母自身 → 汉字未命中回退种子 py → 其余归 # */
  function pyLetter(name, seed) {
    var s = String(name == null ? '' : name).trim();
    if (!s) return '#';
    var c = s.charAt(0);
    if (PY_CHAR[c]) return PY_CHAR[c];
    if (c >= 'a' && c <= 'z') return c.toUpperCase();
    if (c >= 'A' && c <= 'Z') return c;
    if (/[\u4e00-\u9fa5]/.test(c)) {
      if (seed && /^[A-Za-z]$/.test(seed)) return String(seed).toUpperCase();
      return '#';
    }
    return '#';   // 数字 / emoji / 符号 / 日文假名等
  }
  /* 用户 → 当前应归入的字母。备注名已经由 U() 兜底到 name，
     所以这里不用再判断 rawName：列表显示什么名字，就按什么名字分组。 */
  function letterOf(u) { return pyLetter(u && u.name, u && u.py); }
  /* 组内排序：同名或异常 locale 时回退到码位比较，保证顺序稳定 */
  function byDisplayName(a, b) {
    var x = String((a && a.name) || ''), y = String((b && b.name) || '');
    try { var r = x.localeCompare(y, 'zh-Hans-CN'); if (r) return r; } catch (e) { }
    return x < y ? -1 : x > y ? 1 : 0;
  }

  /* ================= 好友列表 ================= */
  function renderContacts() {
    var q = ($('#contactSearch').value || '').trim().toLowerCase();
    var st = S();
    var reqBadge = (st.requests || []).filter(function (r) { return r.dir !== 'out'; }).length
      ? '<span class="badge">' + (st.requests || []).filter(function (r) { return r.dir !== 'out'; }).length + '</span>' : '';
    var groups = {};
    var blockN = 0, cnt = 0;
    st.friends.forEach(function (id) {
      if (isBlocked(id)) { blockN++; return; }   // 拉黑的人不出现在好友列表
      var u = U(id);
      if (q && (u.name + u.py).toLowerCase().indexOf(q) < 0) return;
      var k = letterOf(u);                       // v0.57：按当前显示名实时推导
      (groups[k] = groups[k] || []).push(u); cnt++;
    });
    /* v0.57：A–Z 升序 + 非字母（#）兜底排最后，保证 ctIndex 与列表顺序完全一致 */
    var keys = ctSortKeys(Object.keys(groups));
    var html = '<div class="row" data-action="newfriends">' +
        '<div class="avatar" style="background:#ffd9d0">👋</div>' +
        '<div class="row-title"><b>新的朋友</b><small>处理好友申请</small></div>' +
        '<div class="row-side">' + reqBadge + '</div><span class="chev">›</span></div>' +
      '<div class="row" data-action="mygroups">' +
        '<div class="avatar" style="background:#d6e8ff">👥</div>' +
        '<div class="row-title"><b>群聊</b><small>' + countGroups() + ' 个群聊</small></div>' +
        '<div class="row-side"></div><span class="chev">›</span></div>' +
      /* v0.78：对齐 Flutter ContactsPage 第三个固定入口「黑名单」 */
      '<div class="row" data-action="blacklist">' +
        '<div class="avatar" style="background:#f2f4f7">🚫</div>' +
        '<div class="row-title"><b>黑名单</b><small>' + (blockN ? (blockN + ' 人') : '管理拉黑用户') + '</small></div>' +
        '<div class="row-side"></div><span class="chev">›</span></div>';

    /* v0.57：零分组有两种成因 —— 搜索没命中（给「清除搜索」），或本来就没好友（给「去添加」）。
       旧版只在「有搜索词」时空态分支，好友全删光后剩两条功能行 + "共 0 位好友"，看着像列表坏了。 */
    if (!keys.length) {
      $('#contactList').innerHTML = html + (q
        ? emptyBlock('🔍', '没有找到', '换个关键词，或清除筛选', ['clear-contact-search', '清除搜索'])
        : emptyBlock('👋', '还没有好友', '去广场找同好，或让朋友扫你的二维码', ['add-friend', '添加好友']));
      renderContactIndex([]);
      return;
    }
    keys.forEach(function (k) {
      /* v0.51：分组标题带 data-py，右侧字母索引据此定位滚动目标 */
      html += '<div class="sec-title" data-py="' + esc(k) + '">' + esc(k) + '</div>';
      /* 组内按名字排序：新加的好友落在自己字母组里的正确位置，而不是追加到组尾 */
      html += groups[k].sort(byDisplayName).map(function (u) {
        /* v0.75：右侧不再显示所在地（u.city）。
           理由：好友是按「人」找的，不是按城市筛的；城市跟签名挤在同一行右侧，
           长签名会被压出省略号，而地区在这里没有任何决策价值。
           整块 .row-side 不渲染（而不是留空 div）—— 空 div 仍会占位并让 flex 右对齐多出一段空白。 */
        return '<div class="row" data-action="open-profile" data-id="' + u.id + '">' +
          avatarHtml(u, '', u.online) +
          '<div class="row-title"><b>' + esc(u.name) + identityBadges(u) +
          (isGone(u.id) ? '<span class="tag-gone">已注销</span>' : '') +
          '</b><small>' + esc(u.sign) + '</small></div>' +
          '</div>';
      }).join('');
    });
    html += '<div class="sec-title" style="text-align:center">共 ' + cnt + ' 位好友' +
      (blockN ? ' · ' + blockN + ' 位已拉黑' : '') + '</div>';
    $('#contactList').innerHTML = html;
    renderContactIndex(keys);
  }

  /* ================= v0.57 好友字母索引（数据驱动的右侧竖条）=================
     列表按「当前显示名的首字母」分组，竖条**只渲染真实存在的分组字母**：
     没有 A 开头的好友，就不出现 A —— 不是置灰，是彻底不占位、不可点。
     v0.51 的设计取舍是「26 格常驻 + 无好友字母置灰」，理由是保住手指肌肉记忆；
     实测代价更大：半数以上格子是灰的，视觉噪音高、误触率高，且用户会反复
     点灰字母去找人却跳到别处。数据量涨起来后（几百好友）字母自然就密了，
     那时再谈肌肉记忆才有意义；好友量级下短条比长条更好用。
     顶部保留「↑」：分组之前还有「新的朋友 / 群聊」两行，需要一个回顶手势。
     空数据（没好友 / 搜索零结果）时整条隐藏，好友行也不用再让出右侧空间。 */
  var CT_TOP = '↑';
  var ctAvail = [];            // 当前列表里真实存在的分组字母（已排序）
  var ctOrder = [];            // 竖条实际渲染顺序：[↑, ...ctAvail]
  var ctBubbleTimer = null;
  function ctBody() { return $('#sc-contacts .screen-body'); }
  /* 分组字母排序：A–Z 升序，非字母（#）兜底排最后 */
  function ctSortKeys(keys) {
    var ls = [], other = [];
    (keys || []).forEach(function (k) {
      if (/^[A-Z]$/.test(k)) ls.push(k); else other.push(k);
    });
    ls.sort(); other.sort();
    return ls.concat(other);
  }
  function renderContactIndex(keys) {
    var box = $('#ctIndex'), sc = $('#sc-contacts');
    if (!box) return;
    ctAvail = ctSortKeys(keys || []);
    if (!ctAvail.length) {   // 空结果：一根字母都不渲染，也不占右侧空间
      ctOrder = []; box.innerHTML = '';
      box.classList.add('off'); box.setAttribute('hidden', 'hidden');
      if (sc) sc.classList.add('no-idx');
      return;
    }
    box.classList.remove('off'); box.removeAttribute('hidden');
    if (sc) sc.classList.remove('no-idx');
    ctOrder = [CT_TOP].concat(ctAvail);
    box.innerHTML = ctOrder.map(function (l) {
      return '<div class="ct-idx-l" data-action="ct-jump" data-v="' + esc(l) + '" role="button" tabindex="-1">' + esc(l) + '</div>';
    }).join('');
  }
  function ctBubble(l) {
    var b = $('#ctBubble'); if (!b) return;
    b.textContent = l; b.classList.add('show');
    clearTimeout(ctBubbleTimer);
    ctBubbleTimer = setTimeout(function () { b.classList.remove('show'); }, 700);
  }
  function ctHighlight(l) {
    $$('#ctIndex .ct-idx-l').forEach(function (e) { e.classList.toggle('on', e.dataset.v === l); });
  }
  /* v0.57：竖条只渲染有好友的字母，所有可点的字母都必然有落点，
     因此不再需要 v0.51 的「跳到最近可用字母」兜底（那套逻辑会让用户点了 A 却停在 D）。
     ctJump 仍可能被外部调用（App.ctJump / 手势拖拽），这里做存在性校验：
     命中不了就只反馈气泡、不滚动，绝不滚到一个不存在的位置。 */
  function ctResolve(l) {
    if (l === CT_TOP) return l;
    return ctAvail.indexOf(l) >= 0 ? l : null;
  }
  function ctJump(l) {
    ctBubble(l); ctHighlight(l);
    var body = ctBody(); if (!body) return;
    if (l === CT_TOP) { body.scrollTop = 0; A.track('contact_index_jump', { letter: 'top' }); return; }
    var target = ctResolve(l);
    if (!target) { A.track('contact_index_jump', { letter: l, hit: false }); return; }
    var el = $('#contactList .sec-title[data-py="' + target + '"]');
    if (!el) return;
    var top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    if (top < 0) top = 0;
    if (body.scrollTo) { try { body.scrollTo({ top: top, behavior: 'smooth' }); } catch (e) { body.scrollTop = top; } }
    else body.scrollTop = top;
    A.track('contact_index_jump', { letter: l, target: target });
  }
  /* 按住滑动：pointer 事件一套代码同时覆盖鼠标拖拽与触屏 */
  function ctBindIndex() {
    var box = $('#ctIndex'); if (!box || box.__ctBound) return;
    box.__ctBound = true;
    var hit = function (y) {
      var els = $$('#ctIndex .ct-idx-l');
      if (!els.length || y == null) return null;
      var r0 = els[0].getBoundingClientRect();
      var h = r0.height || 13;
      var i = Math.max(0, Math.min(els.length - 1, Math.floor((y - r0.top) / h)));
      return els[i];
    };
    var move = function (y) { var el = hit(y); if (el) ctJump(el.dataset.v); };
    var start = function (e) {
      box.classList.add('drag');
      move(e.clientY != null ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY));
      if (e.preventDefault) e.preventDefault();
    };
    box.addEventListener('pointerdown', start);
    box.addEventListener('pointermove', function (e) { if (box.classList.contains('drag')) move(e.clientY); });
    box.addEventListener('touchstart', function (e) { start(e.touches[0] || e); }, { passive: false });
    box.addEventListener('touchmove', function (e) {
      if (!box.classList.contains('drag')) return;
      move(e.touches[0] && e.touches[0].clientY);
      if (e.preventDefault) e.preventDefault();
    }, { passive: false });
    var end = function () { box.classList.remove('drag'); };
    box.addEventListener('touchend', end);
    box.addEventListener('touchcancel', end);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
  function countGroups() {
    return S().conversations.filter(function (c) {
      return c.type === 'group' && c.members.indexOf('me') >= 0;
    }).length;
  }

  /* ================= 广场 ================= */
  /* ================= 广场 · 瀑布流（v0.37） ================= */
  /* 设计依据：用户提供的双列瀑布流设计稿——左图右文、卡片高度错落、白底大圆角、留白分隔。
     这里用「最短列优先」的 JS 分配，保证真实瀑布流错落而非 CSS columns 的报纸式填充。 */
  var WF_H = [240, 300, 190, 270, 210, 260, 230, 200, 250, 280];
  function wfHash(id) { var n = 0; for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0; return n; }
  function wfEst(p) {
    var h = 104;   // 文字 + 底部作者行 + 内边距
    if (p.imgs && p.imgs.length) h += WF_H[wfHash(p.id) % WF_H.length];
    return h;
  }
  function waterfall(list) {
    var cols = [[], []], h = [0, 0];
    list.forEach(function (p) {
      var i = h[0] <= h[1] ? 0 : 1;
      cols[i].push(p); h[i] += wfEst(p) + 10;
    });
    return cols;
  }
  /* 单张瀑布流卡片（紧凑发现卡）：点卡片进详情，点作者进主页，点心形即时点赞 */
  /* 媒体高度按 id 稳定分配，形成真实错落的瀑布流（而非等高网格） */
  function wfMediaH(p) {
    var base = WF_H[wfHash(p.id) % WF_H.length];
    if (!(p.imgs && p.imgs.length) && !p.loc) return Math.round(base * 0.6); // 纯文字卡更矮
    return base;
  }
  function plazaCardHtml(p) {
    var u = U(p.userId), hasImg = p.imgs && p.imgs.length, media = '', mh = wfMediaH(p);
    if (hasImg) {
      var im = p.imgs[0];
      media = '<div class="wf-media ' + im.g + '" style="height:' + mh + 'px">' + im.e +
        (p.video ? '<span class="wf-play"><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span>' : '') +
        (p.imgs.length > 1 ? '<span class="wf-more">1/' + p.imgs.length + '</span>' : '') + '</div>';
    } else if (p.loc) {
      media = '<div class="wf-q" style="min-height:' + mh + 'px"><span class="wf-loc">' + esc((p.loc.split('·')[0] || '').trim()) + '</span><div class="wf-q-emoji">🙋</div></div>';
    } else {
      media = '<div class="wf-text" style="min-height:' + mh + 'px"><span class="wf-quote">“</span></div>';
    }
    /* v0.77 对齐 Flutter（MomentCard showTags:false）：一级页卡片只留「媒体 + 正文 + 作者」，
       话题标签（#xxx）与「共同兴趣」推荐理由都不再在瀑布流卡片上透出，交给详情页承载 */
    return '<div class="wf-card" data-action="open-plaza" data-id="' + p.id + '">' + media +
      '<div class="wf-body">' +
        '<div class="wf-tx">' + esc(p.text) + '</div>' +
        '<div class="wf-ft">' +
          '<span class="wf-author" data-action="open-profile" data-id="' + u.id + '">' +
            '<span class="avatar xs">' + avatarInner(u) + '</span><span class="wf-name">' + esc(u.name) + '</span></span>' +
          '<span class="wf-like' + (p.liked ? ' on' : '') + '" data-action="wf-like" data-id="' + p.id + '">' + (p.liked ? '❤️' : '🤍') + ' ' + p.likes + '</span>' +
        '</div>' +
      '</div></div>';
  }
  function renderPlaza() {
    var CTA = '打招呼';   /* v0.76：原为 A/B 两组文案（打招呼 / 说句你好），实验能力非业务能力，统一固定 */

    /* v0.77：排序（推荐/附近/最新）与标签筛选下线，对齐 Flutter —— 广场改为纯双列瀑布流，
       顺序固定走服务端默认推荐序，首屏不再叠 40px 筛选条。 */
    var list = S().plaza.slice().filter(function (p) { return !isBlocked(p.userId); });
    var pf = $('#plazaFilters'); if (pf) { pf.innerHTML = ''; pf.style.display = 'none'; }
    $('#plazaList').innerHTML = list.length ? (function () {
      var cols = waterfall(list);
      return '<div class="wf-wrap">' +
        '<div class="wf-col">' + cols[0].map(plazaCardHtml).join('') + '</div>' +
        '<div class="wf-col">' + cols[1].map(plazaCardHtml).join('') + '</div>' +
        '</div>';
    })() : emptyBlock('🧭', '这里还没有内容', '去发布第一条动态吧', ['publish', '去发布']);
  }

  /* ================= v0.59 统一帖子详情 =================
     广场帖（plaza）和好友动态（moment）以前是两套：广场有详情页、好友流点了只能评论。
     现在合并成同一套详情 UI，只有取数来源不同。原因：同一个帖子会从广场、好友流、
     搜索结果、我的动态四个入口进来，四套详情必然长得不一样，用户会在不同入口
     看到不同的信息密度，这是最典型的"同一个东西四个样"。

     两种内容的字段差异在这里抹平：
       · 点赞：plaza 是 {likes:number, liked:bool}；moment 是 {likes:[uid]}
       · 可见域：moment 有 visibility（public/friends/private，v0.65 起），plaza 恒为公开
     抹平后，上层 UI 只认 like 数 / liked 布尔 / 是否可看，不再判断来源。 */
  var curPost = null;        // {kind:'plaza'|'moment', id}
  var curPostReply = null;   // 正在回复的用户 id（null = 评论主楼）
  function postById(kind, id) {
    var arr = kind === 'plaza' ? S().plaza : S().moments;
    return arr.filter(function (x) { return x.id === id; })[0];
  }
  /* 点赞数 / 我是否赞过 —— 两种来源的字段差异在这一层吃掉 */
  function postLikeCount(kind, p) { return kind === 'plaza' ? (p.likes || 0) : (p.likes || []).length; }
  function postLiked(kind, p) { return kind === 'plaza' ? !!p.liked : (p.likes || []).indexOf('me') >= 0; }
  function postLikeNames(kind, p) {
    if (kind === 'plaza') return [];                 // 广场帖只暴露计数，不造假点赞人
    return (p.likes || []).filter(function (x) { return x !== 'me'; }).map(function (x) { return U(x); });
  }
  function postComments(p) { return p.comments || []; }

  function openPostDetail(kind, id) {
    curPost = { kind: kind, id: id };
    curPostReply = null;
    renderPostDetail();
    openOv('ov-post-detail');
  }
  function renderPostDetail() {
    if (!curPost) return;
    var kind = curPost.kind, p = postById(kind, curPost.id); if (!p) return;
    var u = U(p.userId), isMe = p.userId === 'me';
    var CTA = '打招呼';
    var imgs = p.imgs || [];
    /* v0.67 媒体：有图 → 顶天立地的横向轮播（原生 scroll-snap，手指左右滑即切图）；
       无图但有位置 → 位置卡；纯文字 → 引号卡（这两种要留出顶栏高度的占位）。 */
    var media = imgs.length ? pdGalleryHtml(imgs)
      : (p.loc
        ? '<div class="wf-q" style="border-radius:0"><span class="wf-loc">' + esc((p.loc.split('·')[0] || '').trim()) + '</span><div class="wf-q-emoji" style="font-size:64px">🙋</div></div>'
        : '<div class="wf-text" style="border-radius:0"><span class="wf-quote" style="font-size:64px">“</span></div>');
    var nLike = postLikeCount(kind, p), liked = postLiked(kind, p);
    /* 点赞头像墙：只在实际有名单时渲染（广场帖没有名单就不硬凑头像） */
    var names = postLikeNames(kind, p);
    var likeWall = (nLike > 0)
      ? '<div class="pd-likewall">' +
          (names.length
            ? '<div class="pd-lw-av">' + names.slice(0, 8).map(function (x) { return avatarHtml(x, 'xs'); }).join('') + '</div>'
            : '') +
          '<span>' + (names.length ? (esc(names[0].name) + (names.length > 1 ? ' 等 ' : ' ')) : '') + nLike + ' 人赞过</span>' +
        '</div>'
      : '';
    var cmList = postComments(p).map(function (c, i) {
      var cu = U(c.userId);
      var rp = c.replyTo ? '<span class="cm-rp">回复 <b>' + esc(U(c.replyTo).name) + '</b></span>' : '';
      return '<div class="pd-cm" data-action="pd-reply" data-id="' + cu.id + '" data-i="' + i + '">' +
        '<span data-action="open-profile" data-id="' + cu.id + '">' + avatarHtml(cu, 'sm') + '</span>' +
        '<div class="pd-cm-b"><div class="pd-cm-n">' + esc(cu.name) + (cu.id === p.userId ? '<span class="tag">作者</span>' : '') + '</div>' +
        '<div class="pd-cm-t">' + rp + esc(c.text) + '</div>' +
        '<div class="pd-cm-m">' + (c.ts ? timeLabel(c.ts) + ' · ' : '') + '回复</div></div></div>';
    }).join('');

    var html =
      '<div class="pd-media">' + media + '</div>' +
      '<div class="pd-body">' +
        '<div class="pd-tx">' + esc(p.text) + '</div>' +
        '<div class="pd-meta">' + (p.loc ? '📍' + esc(p.loc) + ' · ' : '') + timeLabel(p.ts) +
          (kind === 'moment' ? ' · <span class="tag ' + (visOf(p) === 'public' ? 'brand' : 'violet') + '">' + visLabel(visOf(p)) + '</span>' : '') + '</div>' +
        '<div class="pd-tags">' + (p.tags || []).map(function (t) { return '<span class="tag" data-action="sr-tag" data-v="' + esc(t) + '">#' + esc(t) + '</span>'; }).join('') + '</div>' +
        /* v0.69：作者头像/昵称/关注已上移到固定顶栏，中部不再重复一行 */
        likeWall +
        '<div class="pd-acts">' +
          '<button class="btn ' + (liked ? 'gray' : 'accent') + ' sm" data-action="post-like" data-id="' + p.id + '">' + (liked ? '❤️ 已赞 ' : '🤍 赞 ') + nLike + '</button>' +
          '<button class="btn ghost sm" data-action="pd-comment" data-id="' + p.id + '">💬 评论 ' + (postComments(p).length || '') + '</button>' +
          (isMe ? '' : '<button class="btn outline sm" data-action="greet" data-id="' + u.id + '">' + CTA + '</button>') +
        '</div>' +
        '<div class="pd-cm-title">评论 ' + postComments(p).length + '</div>' +
        (cmList ? '<div class="pd-cm-list">' + cmList + '</div>' : '<div class="pd-empty">还没有评论，来说两句</div>') +
      '</div>';
    $('#ov-post-detail .screen-body').innerHTML = html;
    pdTopbar(u, isMe);
    bindPdGallery();
    syncPdBar();
  }

  /* ---- v0.67 大图轮播 / v0.70 页码改为悬浮圆点 ----
     用原生 scroll-snap 而不是自写 touch 事件：惯性、回弹、边界吸附都由系统处理，
     手指滑动的手感与原生相册一致，自写实现在长列表里几乎必掉帧。
     每张图整屏铺满（flex:0 0 100%），滑动停止后 scroll 事件换算当前下标。 */
  function pdGalleryHtml(imgs) {
    var n = imgs.length;
    return '<div class="pd-gal">' +
      '<div class="pd-gal-track" id="pdGalTrack">' +
      imgs.map(function (im, i) {
        return '<div class="pd-gal-item" data-action="open-viewer" data-i="' + i + '">' +
          '<div class="ph ' + (im.g || 'g1') + '"><span>' + (im.e || '🖼️') + '</span></div>' +
        '</div>';
      }).join('') +
      '</div>' +
      /* v0.70 页码：底部居中的悬浮圆点，当前页高亮成长条，点一下直接跳到那张。
         只在多图时出现 —— 单图挂一个点是纯噪声。 */
      (n > 1 ? '<div class="pd-dots" id="pdDots">' +
        imgs.map(function (im, i) {
          return '<button class="pd-dot' + (i ? '' : ' on') + '" data-action="pd-go" data-i="' + i +
            '" aria-label="第 ' + (i + 1) + ' 张"></button>';
        }).join('') +
        '</div>' : '') +
      '</div>';
  }
  /* 高亮第 i 个圆点（纯视觉，不滚动） */
  function pdSetDot(i) {
    var ds = $$('#pdDots .pd-dot');
    for (var k = 0; k < ds.length; k++) {
      if (k === i) { ds[k].classList.add('on'); } else { ds[k].classList.remove('on'); }
    }
  }
  /* 点圆点跳图：主动跳转同步高亮，不等 scroll 事件 —— 平滑滚动是异步的，
     等它触发会有一帧滞后，手指快滑时还会被中间页的高亮闪一下。 */
  function pdGo(i) {
    var t = $('#pdGalTrack'); if (!t) return;
    var left = i * (t.clientWidth || 1);
    if (typeof t.scrollTo === 'function') {
      try { t.scrollTo({ left: left, behavior: 'smooth' }); } catch (e) { t.scrollLeft = left; }
    } else { t.scrollLeft = left; }
    pdSetDot(i);
  }
  function bindPdGallery() {
    var t = $('#pdGalTrack'); if (!t) return;
    if (!$$('#pdDots .pd-dot').length) return;
    t.addEventListener('scroll', function () {
      var w = t.clientWidth || 1;
      pdSetDot(Math.round(t.scrollLeft / w));
    }, { passive: true });
    pdSetDot(Math.round(t.scrollLeft / (t.clientWidth || 1)));
  }
  /* ---- v0.67 顶栏 / v0.69 改为固定栏并补作者昵称 ----
     顶栏是详情页唯一的作者入口：昵称 + 头像都能进主页，关注按钮就地换态。
     中部正文不再重复这一组（头像/昵称/关注），避免同屏出现两套一样的作者信息。 */
  function pdTopbar(u, isMe) {
    var nm = $('#pdTbName');
    if (nm) {
      nm.innerHTML = esc(u.name) + identityBadges(u) + (isMe ? '<span class="tag">我</span>' : '');
      nm.setAttribute('data-id', u.id);
    }
    var av = $('#pdTbAv');
    if (av) {
      av.innerHTML = avatarInner(u);
      av.setAttribute('data-action', 'open-profile');
      av.setAttribute('data-id', u.id);
    }
    var fb = $('#pdTbFollow');
    if (!fb) return;
    /* 自己的帖子没有「关注自己」这回事，直接隐藏 —— 留一个灰掉的按钮是无效交互 */
    if (isMe) { fb.style.display = 'none'; return; }
    var fav = isFollow(u.id);
    fb.style.display = '';
    fb.textContent = fav ? '已关注' : '关注';
    fb.className = 'pd-tb-follow' + (fav ? ' on' : '');
    fb.setAttribute('data-id', u.id);
  }
  function pdShare() {
    if (!curPost) return;
    var p = postById(curPost.kind, curPost.id); if (!p) return;
    toast('已复制动态链接，可转发给好友或圈子', 'ok');
    A.track('post_share', { kind: curPost.kind, id: p.id });
  }
  /* 底部输入条：回复态显示"回复 某人"，空内容禁用发送 */
  function syncPdBar() {
    var inp = $('#pdCmInput'); if (!inp) return;
    inp.placeholder = curPostReply ? ('回复 ' + U(curPostReply).name + '…') : '说点什么…';
    var send = $('#pdCmSend');
    if (send) send.disabled = !(inp.value || '').trim();
  }
  function pdCmInput() { syncPdBar(); }
  function pdFocus() { var i = $('#pdCmInput'); if (i) { i.focus({ preventScroll: true }); } }
  function pdReply(uid) {
    curPostReply = (curPostReply === uid) ? null : uid;
    syncPdBar(); pdFocus();
  }
  function pdSend() {
    if (!curPost) return;
    var inp = $('#pdCmInput'); if (!inp) return;
    var tx = (inp.value || '').trim(); if (!tx) return;
    var p = postById(curPost.kind, curPost.id); if (!p) return;
    p.comments = p.comments || [];
    p.comments.push({ userId: 'me', text: tx, ts: Date.now(), replyTo: curPostReply || undefined });
    inp.value = ''; curPostReply = null;
    DB.save(); renderPostDetail(); renderAll();
    toast('评论已发布', 'ok');
  }
  function togglePostLike() {
    if (!curPost) return;
    var p = postById(curPost.kind, curPost.id); if (!p) return;
    if (curPost.kind === 'plaza') {
      if (p.liked) { p.likes--; p.liked = false; } else { p.likes++; p.liked = true; A.track('plaza_like', { id: p.id }); }
    } else {
      var i = p.likes.indexOf('me');
      if (i >= 0) { p.likes.splice(i, 1); } else { p.likes.push('me'); A.track('moment_like', { id: p.id }); }
    }
    DB.save(); renderPostDetail(); renderAll();
    if ($('#ov-mymoments').classList.contains('show')) renderMyMoments();
  }

  /* ================= v0.59 图片查看器 =================
     图片为渐变占位块 + emoji（接 Flutter 时替换为真实图片资源）。
     左右切换同时支持按钮与横向滑动（pointer 事件，鼠标拖拽/触屏同一套）。 */
  var vwImgs = [], vwIdx = 0;
  function openViewer(imgs, i) {
    if (!imgs || !imgs.length) return;
    vwImgs = imgs; vwIdx = Math.max(0, Math.min(i || 0, imgs.length - 1));
    renderViewer(); openOv('ov-viewer');
  }
  function renderViewer() {
    var it = vwImgs[vwIdx]; if (!it) return;
    $('#vwNum').textContent = (vwIdx + 1) + '/' + vwImgs.length;
    $('#vwStage').innerHTML = '<div class="vw-img ' + it.g + '"><span>' + it.e + '</span></div>';
    var pv = $('#ov-viewer [data-action="viewer-prev"]'), nx = $('#ov-viewer [data-action="viewer-next"]');
    if (pv) pv.disabled = vwIdx === 0;
    if (nx) nx.disabled = vwIdx === vwImgs.length - 1;
  }
  function viewerGo(d) {
    var n = vwIdx + d;
    if (n < 0 || n >= vwImgs.length) return;
    vwIdx = n; renderViewer();
  }

  /* ================= v0.59 全局搜索 =================
     之前每个列表各有一个筛选框（好友搜好友、圈子搜圈子），跨类型找东西只能靠猜入口。
     全局搜索解决的是"我知道有那么个东西，但不知道它在哪个 Tab"——这是社交 App
     内容量上来后最高频的死角。

     设计取舍：
     ① 结果按「人 > 话题 > 圈子 > 内容」排序。找人是社交 App 的第一意图，
        内容排最后但不限量，避免"搜到 3 条就到底了"的假象。
     ② 关键词高亮只做首次命中。全文高亮在长文本里会变成斑马纹，反而难读。
     ③ 输入后先出骨架屏再出结果（260ms）。真人打字有间隔，瞬出结果会让人怀疑
        "是不是没真的搜"，而骨架屏能明确表达"正在找"。
     ④ 历史最多 10 条、可单删可清空；热搜由内容标签现算，不写死。 */
  var srQ = '', srTimer = null, srLoading = false;
  /* v0.64：每组默认折叠条数 + 展开状态。
     之前的写法是「标题写总数 20，列表只给 8 条，没有出口」——用户看到数字对不上
     会以为搜索坏了。现在超出折叠量的组一律给「查看全部 N 条」。 */
  var SR_CAP = { users: 8, circles: 5, posts: 6 };
  var srExpand = { users: false, circles: false, posts: false };
  function srHist() { return S().searchHist || []; }
  function srPush(q) {
    var st = S();
    st.searchHist = srHist().filter(function (x) { return x !== q; });
    st.searchHist.unshift(q);
    st.searchHist = st.searchHist.slice(0, 10);
    DB.save();
  }
  function srClearHist() { S().searchHist = []; DB.save(); renderSearch(); }
  function srDelHist(q) { S().searchHist = srHist().filter(function (x) { return x !== q; }); DB.save(); renderSearch(); }
  function searchOpen() {
    srQ = ''; srLoading = false;
    srExpand = { users: false, circles: false, posts: false };
    var i = $('#globalSearch'); if (i) i.value = '';
    renderSearch(); openOv('ov-search');
    setTimeout(function () { var j = $('#globalSearch'); if (j) j.focus({ preventScroll: true }); }, 80);
  }
  /* v0.64：骨架屏只在「从没词 → 有词」这一次出现。
     原来每敲一个字都要闪 260ms 骨架屏，本地搜索本就是同步的，那 260ms 是假加载；
     连续打字时画面在「骨架↔结果」之间反复跳，看起来就是在乱闪。 */
  function searchInput(v) {
    var prev = srQ;
    srQ = (v || '').trim();
    if (srTimer) clearTimeout(srTimer);
    if (!srQ) { srLoading = false; renderSearch(); return; }
    srLoading = !prev;                       // 仅首次输入给加载态
    renderSearch();
    if (srLoading) srTimer = setTimeout(function () { srLoading = false; renderSearch(); }, 260);
    else { srTimer = setTimeout(function () { renderSearch(); }, 120); }   // 连续输入：轻微防抖，不闪骨架
  }
  function srClear() {
    srQ = ''; srLoading = false;
    var i = $('#globalSearch'); if (i) { i.value = ''; i.focus({ preventScroll: true }); }
    renderSearch();
  }
  function srHit(t, q) { return (t || '').toLowerCase().indexOf(q.toLowerCase()) >= 0; }
  /* 只高亮第一次命中：全文高亮在长文本里会变成斑马纹 */
  function srMark(t, q) {
    var s = esc(t || ''); if (!q) return s;
    var eq = esc(q), i = s.toLowerCase().indexOf(eq.toLowerCase());
    if (i < 0) return s;
    return s.slice(0, i) + '<em>' + s.slice(i, i + eq.length) + '</em>' + s.slice(i + eq.length);
  }
  function srQuery(q) {
    var st = S();
    var users = st.users.filter(function (u) {
      if (isBlocked(u.id) || isGone(u.id)) return false;
      var rm = (st.remarks || {})[u.id] || '';
      return srHit(u.name + rm + u.py + (u.city || '') + (u.sign || '') + (u.tags || []).join(''), q);
    }).sort(function (a, b) {
      var af = isFriend(a.id) ? 0 : (isFollow(a.id) ? 1 : 2);
      var bf = isFriend(b.id) ? 0 : (isFollow(b.id) ? 1 : 2);
      return af - bf || a.name.localeCompare(b.name, 'zh');
    });
    var moments = st.moments.filter(function (m) {
      return !isBlocked(m.userId) && canViewMoment(m) && (srHit(m.text, q) || srHit(m.loc, q));
    }).sort(function (a, b) { return b.ts - a.ts; });
    var plaza = st.plaza.filter(function (p) {
      return !isBlocked(p.userId) && (srHit(p.text, q) || srHit(p.loc, q) || srHit((p.tags || []).join(' '), q));
    }).sort(function (a, b) { return b.likes - a.likes; });
    /* 私密圈不进搜索结果：搜得到但进不去，比搜不到更让人困惑 */
    var circles = st.circles.filter(function (c) {
      if (isPrivate(c)) return false;
      return srHit(c.name + (c.city || '') + (c.province || '') + (c.desc || '') + (c.cat || ''), q);
    });
    var tagCount = {};
    st.plaza.forEach(function (p) { (p.tags || []).forEach(function (t) { if (srHit(t, q)) tagCount[t] = (tagCount[t] || 0) + 1; }); });
    ALL_TAGS.forEach(function (t) { if (srHit(t, q) && !tagCount[t]) tagCount[t] = 0; });
    var tags = Object.keys(tagCount).map(function (t) { return { t: t, n: tagCount[t] }; })
      .sort(function (a, b) { return b.n - a.n; });
    return { users: users, moments: moments, plaza: plaza, circles: circles, tags: tags };
  }
  /* 热搜：按内容标签现算，不写死榜单（写死的内容池一变就过期）
     v0.64：右侧数字从「热度」改成「篇数」。热度是 likes 累加出来的绝对值，
     用户没有任何参照系，而且种子数据下经常出现「204 / 204 / 131 / 131」成对并列，
     一眼看上去像算错了。篇数（这个话题下有多少条内容）是可验证的真实信息。 */
  function srHot() {
    var cnt = {};
    S().plaza.forEach(function (p) { (p.tags || []).forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; }); });
    ALL_TAGS.forEach(function (t) { if (!cnt[t]) cnt[t] = 0; });
    return Object.keys(cnt).map(function (t) { return { t: t, n: cnt[t] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
  }
  function srHotHtml(withN) {
    return srHot().map(function (h, i) {
      return '<div class="sr-hot-r" data-action="sr-use" data-v="' + esc(h.t) + '">' +
        '<span class="sr-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '<span class="sr-hot-t">' + esc(h.t) + '</span>' +
        (withN && h.n ? '<span class="sr-hot-n">' + h.n + ' 篇</span>' : '') + '</div>';
    }).join('');
  }
  /* v0.64 冷启动补全：没有搜索历史时，页面只剩一个热搜榜，下半屏全空 ——
     看起来像没加载完。这里按「我加入的圈子分类/城市 + 好友与关注的人的兴趣标签」
     现算一批「猜你想搜」，把首屏填满，也让第一次使用的人有东西可点。 */
  function srGuess() {
    var st = S(), out = [];
    (st.myCircles || []).forEach(function (cid) {
      var c = st.circles.filter(function (x) { return x.id === cid; })[0];
      if (!c) return;
      if (c.cat) out.push(c.cat);
      if (c.city) out.push(c.city);
    });
    st.friends.concat(st.me.following || []).forEach(function (id) {
      var u = U(id); if (u && u.tags) out = out.concat(u.tags);
    });
    if (st.me && st.me.city) out.push(st.me.city);
    var hot = srHot().map(function (h) { return h.t; });
    var seen = {}, res = [];
    out.forEach(function (t) {
      if (!t || seen[t] || hot.indexOf(t) >= 0) return;
      seen[t] = 1; res.push(t);
    });
    return res.slice(0, 6);
  }
  function srUserRow(u, q) {
    var rel = isFriend(u.id) ? '<span class="tag brand">好友</span>' : (isFollow(u.id) ? '<span class="tag">已关注</span>' : '');
    return '<div class="row" data-action="open-profile" data-id="' + u.id + '">' +
      avatarHtml(u, 'md', u.online) +
      '<div class="row-title"><b>' + srMark(u.name, q) + identityBadges(u) + rel + '</b>' +
      '<small>' + srMark((u.city || '') + (u.sign ? ' · ' + u.sign : ''), q) + '</small></div>' +
      '<span class="chev">›</span></div>';
  }
  function srPostRow(kind, p, q) {
    var u = U(p.userId);
    var tx = esc(p.text || ''); if (tx.length > 42) tx = tx.slice(0, 42) + '…';
    /* v0.64：无图时不再用 📷 emoji 占位（和头像行放在一起显得像没做完的 demo），
       改用与全站同规格的线性图标 */
    var hasImg = !!(p.imgs && p.imgs[0]);
    return '<div class="row sr-post" data-action="sr-open-post" data-kind="' + kind + '" data-id="' + p.id + '">' +
      '<div class="sr-thumb ' + (hasImg ? p.imgs[0].g : '') + '">' + (hasImg ? p.imgs[0].e : svgIcon('post')) + '</div>' +
      '<div class="row-title"><b>' + srMark(tx, q) + '</b>' +
      '<small>' + esc(u.name) + ' · ' + timeLabel(p.ts) + (p.loc ? ' · ' + esc(p.loc) : '') + '</small></div>' +
      '<span class="chev">›</span></div>';
  }
  function renderSearch() {
    var box = $('#searchBody'); if (!box) return;
    if (!srQ) {
      var hist = srHist();
      var hot = srHot();
      var guess = srGuess();
      box.innerHTML =
        (hist.length
          ? '<div class="sec-title sr-sec-t"><span>搜索历史</span>' +
            '<button class="sr-more" data-action="sr-clearhist">清空</button></div>' +
            '<div class="sr-chips">' + hist.map(function (h) {
              return '<span class="chip" data-action="sr-use" data-v="' + esc(h) + '">' + esc(h) +
                '<i class="sr-del" data-action="sr-delhist" data-v="' + esc(h) + '">✕</i></span>';
            }).join('') + '</div>'
          : (guess.length
            /* 无历史时补「猜你想搜」，否则首屏只有榜单、下半屏全空，像没加载完 */
            ? '<div class="sec-title">猜你想搜</div><div class="sr-chips">' + guess.map(function (t) {
              return '<span class="chip" data-action="sr-use" data-v="' + esc(t) + '">' + esc(t) + '</span>';
            }).join('') + '</div>'
            : '')) +
        '<div class="sec-title">大家都在搜</div>' +
        '<div class="sr-hot">' + srHotHtml(true) + '</div>' +
        /* v0.64：榜单下面补三条热门内容。默认页只有榜单时下半屏是整片空白，
           第一次进来的人没有可点的内容；给三条真实内容，既填空也能直接进详情。 */
        srTopPosts(3);
      return;
    }
    if (srLoading) { box.innerHTML = '<div class="list">' + skeletonRows(5) + '</div>'; return; }
    var r = srQuery(srQ);
    var total = r.users.length + r.moments.length + r.plaza.length + r.circles.length + r.tags.length;
    if (!total) {
      box.innerHTML = emptyBlock('🔍', '没有找到「' + esc(srQ) + '」', '换个关键词试试，或从下面的热搜找灵感') +
        '<div class="sec-title">大家都在搜</div><div class="sr-hot">' + srHotHtml(true) + '</div>';
      return;
    }
    var html = '';
    if (r.users.length) {
      html += srSection('users', '用户', '位', r.users, function (u) { return srUserRow(u, srQ); });
    }
    if (r.tags.length) html += '<div class="sec-title">话题</div><div class="sr-chips">' +
      r.tags.slice(0, 6).map(function (t) {
        return '<span class="chip" data-action="sr-tag" data-v="' + esc(t.t) + '">#' + esc(t.t) + (t.n ? ' · ' + t.n : '') + '</span>';
      }).join('') + '</div>';
    if (r.circles.length) {
      html += srSection('circles', '圈子', '个', r.circles, function (c) {
        return '<div class="row" data-action="sr-open-circle" data-id="' + c.id + '">' +
          '<div class="avatar md" style="background:var(--n-100)">' + (c.icon || '🏕️') + '</div>' +
          '<div class="row-title"><b>' + srMark(c.name, srQ) + '</b><small>' + esc((c.city || '') + ' · ' + (c.members || 0).toLocaleString() + ' 人 · ' + (c.cat || '')) + '</small></div>' +
          '<span class="chev">›</span></div>';
      });
    }
    var posts = r.moments.concat(r.plaza);
    if (posts.length) {
      html += srSection('posts', '相关内容', '条', posts, function (p, i) {
        return srPostRow(i < r.moments.length ? 'moment' : 'plaza', p, srQ);
      });
    }
    box.innerHTML = html;
  }
  /* v0.64 分组容器：标题统一「名称 · N 单位」，超出折叠量给「查看全部 N 单位」出口。
     标题上的数字必须和列表能对上，否则用户会以为结果丢了。 */
  function srSection(key, label, unit, arr, rowFn) {
    var cap = SR_CAP[key] || 8, open = !!srExpand[key];
    var show = open ? arr : arr.slice(0, cap);
    var more = arr.length > cap
      ? '<button class="sr-more" data-action="sr-expand" data-v="' + key + '">' +
        (open ? '收起' : '查看全部 ›') + '</button>'   /* 标题上已有数量，按钮不再重复一遍 */
      : '';
    return '<div class="sec-title sr-sec-t"><span>' + label + ' · ' + arr.length + ' ' + unit + '</span>' + more + '</div>' +
      '<div class="list">' + show.map(rowFn).join('') + '</div>';
  }
  function srExpandToggle(key) { srExpand[key] = !srExpand[key]; renderSearch(); }
  /* 默认页的热门内容：按点赞排序的真实内容，复用结果行样式（点进去就是统一详情） */
  function srTopPosts(n) {
    var list = S().plaza.filter(function (p) { return !isBlocked(p.userId); })
      .sort(function (a, b) { return (b.likes || 0) - (a.likes || 0); }).slice(0, n);
    if (!list.length) return '';
    return '<div class="sec-title">热门内容</div><div class="list">' +
      list.map(function (p) { return srPostRow('plaza', p, ''); }).join('') + '</div>';
  }
  /* 点结果：搜索词进历史，再按类型分发到各自的详情入口 */
  function srOpenPost(kind, id) {
    srPush(srQ); closeOv('ov-search');
    openPostDetail(kind, id);
  }
  function srOpenProfile(uid) { srPush(srQ); closeOv('ov-search'); openProfile(uid); }
  function srOpenCircle(id) { srPush(srQ); closeOv('ov-search'); openCircleDetail(id); }
  /* 话题：关闭搜索 → 落到广场并按该标签筛选。用户点话题的预期是"看这个话题下的内容"，不是看一个词条解释。 */
  function srGoTag(t) {
    if (srQ) srPush(srQ); else srPush(t);
    closeOv('ov-search');
    switchTab('discover'); setDiscover('plaza');
    plazaFilter.tag = t; renderPlaza();
    toast('已筛选 #' + t, 'ok');
  }

  /* ================= 动态 ================= */
  /* v0.26：动态可见范围严格判定（viewer = 当前用户 me）
     friends 需是好友；circle 需我在目标圈内；private 仅作者本人；未知 scope 兜底可见 */
  function canViewMoment(m) {
    if (m.userId === 'me') return true;
    var v = visOf(m);
    if (v === 'private') return false;
    if (v === 'public') return true;
    if (v === 'friends') return S().friends.indexOf(m.userId) >= 0;
    /* 旧存档 scope='circle'：只有同圈人才在好友流看到。新数据不再产生该值 */
    if (v === 'circle') {
      var ids = m.circleIds || (m.circleId ? [m.circleId] : []);
      return ids.some(function (cid) { return S().myCircles.indexOf(cid) >= 0; });
    }
    return true;
  }
  /* ---- v0.58 关系判定：二分 feed 的取数口径 ----
     「好友」Tab = 互友 ∪ 我关注的人 ∪ 自己。
     关注是**独立于好友关系**的内容订阅：不对 TA 可见我的隐私，也不需要对方同意，
     单向成立。因此删掉好友不等于取消关注 —— 若用户明确关注过，内容继续出现，
     由用户自己决定要不要取关；反之没点过关注的人，一旦删好友就从这条流里消失。 */
  function isFollow(uid) { return (S().me.following || []).indexOf(uid) >= 0; }
  function isFriend(uid) { return S().friends.indexOf(uid) >= 0; }
  /* 这条动态的作者，是否在「好友」Tab 的内容池里（关系维度，不管可见域） */
  function inFriendPool(uid) { return uid === 'me' || isFriend(uid) || isFollow(uid); }

  /* ================= 好友Tab（发现页二分之一）=================
     内容池：互友 ∪ 我关注的人 ∪ 自己；黑名单双向过滤；再过一层可见域。
     排序：严格时间倒序。**这里不插任何推荐算法**——用户打开「好友」的预期是
     「把这段时间熟人的更新看完」，任何重排都会制造"我是不是漏看了"的焦虑。
     推荐/探索的职责在「广场」，两者不能互相污染。 */
  function renderFriendsFeed() {
    var me = S().me;
    var st = S();
    var list = st.moments.filter(function (m) {
      if (isBlocked(m.userId)) return false;          // 黑名单：双向都看不到
      if (!inFriendPool(m.userId)) return false;      // 关系维度圈定候选池
      return canViewMoment(m);                        // 可见域：作者设的公开范围优先于我的订阅
    }).sort(function (a, b) { return b.ts - a.ts; });
    /* v0.58 空态按「为什么空」分两种：
       完全没关系人 → 引导去建立关系；有关系但对方没发 → 引导自己发 / 去广场看。
       统一说一句"还没有动态"会让用户认为是产品坏了，而不是因为自己还没关注人。 */
    var hasRel = (st.friends.length + (me.following || []).length) > 0;
    var empty = hasRel
      /* v0.65：好友流是消费侧，不直接提供发布入口——统一引导回广场发布 */
      ? emptyBlock('🌤', '关注的人还没有新动态', '好友和你关注的人发动态后会出现在这里，你也可以先开个头', ['go-plaza-publish', '去广场发布'])
      : emptyBlock('👋', '还没有关注任何人', '好友和你关注的人发的动态会出现在这里', ['add-friend', '去添加好友']);
    $('#momentList').innerHTML = list.length ? list.map(momentHtml).join('') : empty;
  }
  function momentHtml(m) {
    var u = U(m.userId);
    var liked = m.likes.indexOf('me') >= 0;
    var likeNames = m.likes.filter(function (x) { return x !== 'me'; }).map(function (x) { return U(x).name; });
    if (liked) likeNames.unshift('我');
    var isMe = m.userId === 'me';
    /* v0.58：这条为什么出现在「好友」Tab —— 作者不是好友、只是我关注的人。
       必须标出来，否则用户会以为关系错了（"我什么时候加的这个人？"），
       这条标签同时也是这块 feed 的口径自解释，不需要另写引导文案。 */
    var followOnly = !isMe && !isFriend(m.userId) && isFollow(m.userId);
    var cm = m.comments.map(function (c) {
      return '<div class="cm"><b>' + esc(U(c.userId).name) + (U(c.userId).id === 'me' ? '' : '') + '</b>：' + esc(c.text) + '</div>';
    }).join('');
    return '<div class="moment">' +
      '<div data-action="open-profile" data-id="' + u.id + '">' + avatarHtml(u, 'sm') + '</div>' +
      '<div class="mr">' +
        '<div class="mn" data-action="open-profile" data-id="' + u.id + '">' + esc(u.name) + identityBadges(u) +
          (followOnly ? '<span class="tag">关注</span>' : '') + '</div>' +
        '<div class="mtx" data-action="open-moment" data-id="' + m.id + '">' + esc(m.text) + '</div>' +
        '<div data-action="open-moment" data-id="' + m.id + '">' + photosHtml(m.imgs) + '</div>' +
        (m.loc ? '<div class="mloc">📍' + esc(m.loc) + '</div>' : '') +
        '<div class="mtime"><span>' + timeLabel(m.ts) + '</span>' +
          '<span class="tag ' + (visOf(m) === 'public' ? 'brand' : 'violet') + '">' + visLabel(visOf(m)) + '</span>' +
          (isMe ? '<button class="btn gray sm" data-action="del-moment" data-id="' + m.id + '" style="padding:2px 8px;font-size:var(--fs-11)">删除</button>' : '') +
          '<span style="flex:1"></span>' +
          '<button class="' + (liked ? 'liked' : '') + '" data-action="like" data-id="' + m.id + '">' + (liked ? '❤️' : '🤍') + ' ' + (m.likes.length || '') + '</button>' +
          '<button data-action="comment" data-id="' + m.id + '">💬 评论</button>' +
        '</div>' +
        ((likeNames.length || cm) ? '<div class="lkcm">' +
            (likeNames.length ? '<div class="lk">❤️ ' + esc(likeNames.join('、')) + '</div>' : '') + cm + '</div>' : '') +
        '<div id="cmbox-' + m.id + '"></div>' +
      '</div></div>';
  }

  /* ================= 我的 ================= */
  /* ================= 圈子（v0.15 地域圈 M1：省/市两级 + 内容框架） ================= */
  /* 加入按钮：按「入圈方式 + 我的申请状态」决定（v0.17） */
  function joinBtnHtml(c, joined) {
    if (joined || c.owner === 'me') return '<button class="btn ghost sm" data-action="circle-exit" data-id="' + c.id + '">已加入</button>';
    if (isPrivate(c) || c.joinMode === 'invite') {
      /* v0.28：私密圈加入入口从「仅邀请」灰按钮改为明确的「🔑 邀请码加入」主操作，避免被误读为提示词 */
      return '<button class="btn accent sm" data-action="circle-code-join" data-id="' + c.id + '">🔑 邀请码加入</button>';
    }
    if (c.joinMode === 'approval') {
      var a = myApply(c.id);
      if (a && a.status === 'pending') {
        return '<button class="btn gray sm" data-action="circle-apply" data-id="' + c.id + '">审核中</button>';
      }
      if (a && a.status === 'rejected') {
        return '<button class="btn gray sm" data-action="circle-apply" data-id="' + c.id + '">被拒 · 重申请</button>';
      }
      return '<button class="btn accent sm" data-action="circle-apply" data-id="' + c.id + '">申请加入</button>';
    }
    return '<button class="btn accent sm" data-action="circle-join" data-id="' + c.id + '">加入</button>';
  }
  function circleHeadHtml(c, joined) {
    var col = c.color || '#12b76a';
    return '<div class="cd-hero" style="background:' + col + '1a">' +
      '<div class="cd-ico" style="background:' + col + '">' + (c.icon || '🌐') + '</div>' +
      '<div class="cd-info"><b>' + esc(c.name) +
      (isPrivate(c) ? ' <span class="lock-tip">🔒 私密</span>' : '') +
      (c.owner === 'me' ? ' <span class="role owner">圈主</span>' : '') + '</b>' +
      '<small>' + esc(c.province) + ' · ' + esc(c.city) + ' · ' + (c.members || 0) + ' 人' +
      (isPrivate(c) ? ' · 仅邀请入圈' : (c.joinMode === 'approval' ? ' · 需圈主审核' : '')) + '</small>' +
      '<p>' + esc(c.desc || '') + '</p></div>' +
      (joinBtnHtml(c, joined)) +
      '</div>';
  }
  function circlePostCard(p) {
    var u = U(p.userId);
    var cmts = p.comments || [];
    return '<div class="ccard">' +
      '<div class="ccard-hd">' + avatarHtml(u, 'sm') +
      '<div class="cc-meta"><b>' + esc(u.name) + identityBadges(u) + '</b>' +
      '<small>' + timeLabel(p.ts) + (p.loc ? ' · ' + esc(p.loc) : '') + '</small></div></div>' +
      '<div class="ccard-bd">' + esc(p.text) + photosHtml(p.imgs) +
      (p.tags && p.tags.length ? '<div class="cc-tags">' + p.tags.map(function (t) { return '<span class="ctag">#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="ccard-ft">' +
      '<button class="btn sm ' + (p.liked ? 'gray' : 'outline') + '" data-action="cpost-like" data-id="' + p.id + '">' + (p.liked ? '已赞 ' : '赞 ') + (p.likes || 0) + '</button>' +
      '<button class="btn sm outline" data-action="cpost-cmt" data-id="' + p.id + '">评论' + (cmts.length ? ' ' + cmts.length : '') + '</button>' +
      (p.userId === 'me' ? '<button class="btn sm outline" data-action="cpost-del" data-id="' + p.id + '" style="color:var(--error-fg)">删除</button>' : '') +
      '</div>' +
      (cmts.length ? '<div class="ccmt-list">' + cmts.map(function (c) {
        return '<div class="ccmt-i"><b>' + esc(U(c.userId).name) + '：</b>' + esc(c.text) + '</div>';
      }).join('') + '</div>' : '') +
      (ccOpen[p.id] ? '<div class="ccmt">' +
        '<input class="input" id="ccmt-' + p.id + '" placeholder="说点什么…" maxlength="80" />' +
        '<button class="btn accent xs" style="width:100%;margin-top:6px" data-action="cpost-send" data-id="' + p.id + '">发送</button>' +
        '</div>' : '') +
      '</div>';
  }
  /* ---------- v0.18 圈子动态：评论 / 删除 ---------- */
  function sendCircleComment(id) {
    var p = (S().circlePosts || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var el = $('#ccmt-' + id);
    var txt = el ? (el.value || '').trim() : '';
    if (!txt) return toast('说点什么吧', 'err');
    if (!p.comments) p.comments = [];
    p.comments.push({ userId: 'me', text: txt, ts: Date.now() });
    DB.save();
    ccOpen[id] = false;
    if (curCircleId) openCircleDetail(curCircleId);
    toast('评论已发布', 'ok');
    if (A && A.track) A.track('circle_comment', { circle: p.circleId });
  }
  function deleteCirclePost(id) {
    var p = (S().circlePosts || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    confirmBox('删除动态', '删除后不可恢复，圈子内其他人也将看不到', function () {
      var st = S();
      st.circlePosts = (st.circlePosts || []).filter(function (x) { return x.id !== id; });
      delete ccOpen[id];
      DB.save();
      if (curCircleId) openCircleDetail(curCircleId); else renderCircles();
      toast('动态已删除', 'ok');
    }, '删除', '取消');
  }

  /* ---------- v0.16 私密圈：入圈邀请 / 熟人邀请 / 邀请码 ---------- */
  function pendingInvites() {
    var st = S();
    return (st.circleInvites || []).filter(function (i) {
      return i.toUserId === 'me' && i.status === 'pending' &&
        (st.circles || []).some(function (c) { return c.id === i.circleId; });
    });
  }
  /* v0.39：待办归位到「我的圈子」区；默认折叠为一行 + 红点，点击展开明细处理 */
  function renderCircleInvites() {
    var box = $('#circTodo'); if (!box) return;
    var pend = pendingInvites();
    var st = S();
    var audits = myManagePending();
    var nAudit = 0;
    audits.forEach(function (p) { nAudit += p.n; });
    var nInv = pend.length;
    var total = nAudit + nInv;
    if (!total) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = 'block';
    var parts = [];
    if (nAudit) parts.push('申请 ' + nAudit);
    if (nInv) parts.push('邀请 ' + nInv);
    var html = '<div class="cmt-bar" data-action="circle-todo-toggle">' +
      '<div class="cmt-ico">🛎</div>' +
      '<div class="cmt-tx"><b>待处理</b><small>' + parts.join(' · ') + '</small></div>' +
      '<span class="cmt-cnt">' + total + '</span>' +
      '<span class="cmt-arw">' + (circleTodoOpen ? '⌄' : '›') + '</span>' +
      '</div>';
    if (circleTodoOpen) {
      html += '<div class="cmt-body">';
      audits.forEach(function (p) {
        html += '<div class="inv-card audit">' +
          '<div class="inv-ico" style="background:' + (p.circle.color || '#12b76a') + '">' + (p.circle.icon || '🌐') + '</div>' +
          '<div class="inv-info"><b>' + esc(p.circle.name) + ' · ' + p.n + ' 条待审核</b>' +
          '<small>有人申请加入，去审核</small></div>' +
          '<div class="inv-act"><button class="btn accent xs" data-action="circle-audit" data-id="' + p.circle.id + '">去审核</button></div>' +
          '</div>';
      });
      if (nInv) {
        html += '<div class="cmt-sub">🔔 入圈邀请</div>';
        pend.forEach(function (it) {
          var c = (st.circles || []).filter(function (x) { return x.id === it.circleId; })[0] || {};
          var u = U(it.fromUserId);
          html += '<div class="inv-card">' +
            '<div class="inv-ico" style="background:' + (c.color || '#12b76a') + '">' + (c.icon || '🌐') + '</div>' +
            '<div class="inv-info"><b>' + esc(u.name) + ' 邀请你加入</b>' +
            '<small>🔒 ' + esc(c.name || '') + ' · ' + esc(it.msg || '熟人介绍入圈') + '</small></div>' +
            '<div class="inv-act">' +
            '<button class="btn accent xs" data-action="cinv-accept" data-id="' + it.id + '">接受</button>' +
            '<button class="btn ghost xs" data-action="cinv-reject" data-id="' + it.id + '">拒绝</button>' +
            '</div></div>';
        });
      }
      html += '</div>';
    }
    box.innerHTML = html;
  }
  function acceptInvite(invId) {
    var st = S();
    var it = (st.circleInvites || []).filter(function (x) { return x.id === invId; })[0];
    if (!it) return;
    it.status = 'accepted';
    if (st.myCircles.indexOf(it.circleId) < 0) st.myCircles.push(it.circleId);
    DB.save(); renderCircles();
    if (A && A.track) A.track('circle_invite_accept', { circle: it.circleId });
    toast('已加入私密圈', 'ok');
    openCircleDetail(it.circleId);
  }
  function rejectInvite(invId) {
    var st = S();
    var it = (st.circleInvites || []).filter(function (x) { return x.id === invId; })[0];
    if (!it) return;
    it.status = 'rejected';
    DB.save(); renderCircles(); toast('已拒绝邀请', 'ok');
  }
  /* 邀请好友（熟人介绍）：按「谁可邀请」权限判定（v0.27） */
  function openInviteFriends() {
    var id = curCircleId;
    var c = (S().circles || []).filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    if (!canInvite(c)) return toast('你没有邀请权限，仅圈主/管理员可邀请', 'err');
    cinvSelected = [];
    renderInviteFriends();
    openOv('ov-circleinvite');
  }
  function renderInviteFriends() {
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === curCircleId; })[0];
    var friends = (st.friends || []).filter(function (uid) { return !isBlocked(uid); });
    var html = '<div class="cinv-top"><div class="cinv-ico" style="background:' + (c.color || '#12b76a') + '">' + (c.icon || '🌐') + '</div>' +
      '<div><b>' + esc(c.name) + (isPrivate(c) ? ' <span class="lock-tip">🔒 私密</span>' : '') + '</b>' +
      '<small>' + (isPrivate(c) ? '私密圈仅受邀好友可见并入圈' : '邀请好友加入圈子') + '</small></div></div>';
    if (!friends.length) {
      html += emptyBlock('🫂', '还没有好友', '先去添加好友再来邀请');
    } else {
      html += '<div class="grp-title">选择好友（可多选）</div>';
      friends.forEach(function (uid) {
        var u = U(uid);
        var on = cinvSelected.indexOf(uid) >= 0;
        var already = (st.circleInvites || []).some(function (i) {
          return i.circleId === c.id && i.toUserId === uid && i.status === 'pending';
        });
        html += '<div class="cinv-row' + (on ? ' on' : '') + '" data-action="cinv-toggle" data-id="' + uid + '">' +
          avatarHtml(u, 'sm') +
          '<div class="cinv-nm"><b>' + esc(u.name) + '</b>' +
          '<small>' + (already ? '已邀请，等待回应' : (u.sign || '')) + '</small></div>' +
          '<span class="cinv-chk">' + (on ? '✅' : '⬜️') + '</span></div>';
      });
    }
    html += '<p style="color:var(--sub);font-size:var(--fs-12);margin-top:14px;line-height:1.6">' +
      '私密圈不会出现在「全部圈子」，好友只能通过你的邀请或邀请码找到并入圈。</p>';
    $('#cinvBody').innerHTML = html;
  }
  function sendCircleInvites() {
    var st = S();
    var cid = curCircleId;
    var c = (st.circles || []).filter(function (x) { return x.id === cid; })[0];
    if (c && !canInvite(c)) return toast('你没有邀请权限', 'err');
    if (!cinvSelected.length) return toast('请先选择好友', 'err');
    var added = 0;
    cinvSelected.forEach(function (uid) {
      var dup = (st.circleInvites || []).some(function (i) {
        return i.circleId === cid && i.toUserId === uid && i.status === 'pending';
      });
      if (dup) return;
      st.circleInvites.push({
        id: 'ci-' + Date.now() + '-' + uid, circleId: cid, fromUserId: 'me',
        toUserId: uid, ts: Date.now(), status: 'pending', msg: '熟人介绍，来一起玩'
      });
      added++;
    });
    DB.save();
    closeOv('ov-circleinvite'); cinvSelected = [];
    renderCircles();
    if (A && A.track) A.track('circle_invite_send', { circle: cid, n: added });
    toast(added ? '已发送 ' + added + ' 条入圈邀请' : '这些好友已邀请过');
  }
  /* 邀请码浮层：input = 输码入圈；show = 展示本圈邀请码 */
  function openCircleCode(mode, id) {
    ccodeMode = mode || 'input';
    ccodeCircleId = id || curCircleId || null;
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === ccodeCircleId; })[0];
    $('#ccodeTitle').textContent = ccodeMode === 'show' ? '圈子邀请码' : '邀请码入圈';
    var html = '';
    if (ccodeMode === 'show' && c) {
      var limit = c.codeLimit != null ? c.codeLimit : CODE_LIMIT;
      var used = c.codeUsed || 0;
      var left = Math.max(0, limit - used);
      var expired = !!c.codeExpireAt && Date.now() >= c.codeExpireAt;
      var metaTxt = (expired ? '🔴 已过期' : '剩余 ' + left + ' 次') + (c.codeExpireAt ? ' · 有效期至 ' + dateOnly(c.codeExpireAt) : ' · 长期有效');
      var isOwner = isOwnerOf(c.id);
      html += '<div class="code-box"><div class="code-ico" style="background:' + (c.color || '#12b76a') + '">' + (c.icon || '🌐') + '</div>' +
        '<b>' + esc(c.name) + '</b><small>🔒 私密圈 · 仅邀请入圈</small>' +
        '<div class="code-num" id="ccodeNum">' + esc(c.code || '') + '</div>' +
        '<div class="code-meta' + (expired ? ' err' : '') + '">' + metaTxt + '</div>' +
        '<button class="btn accent sm" style="width:100%" data-action="ccode-copy">复制邀请码</button>' +
        (isOwner ? '<button class="btn ghost sm" style="width:100%;margin-top:8px" data-action="ccode-reset">重置邀请码</button>' : '') +
        '</div>' +
        '<p style="color:var(--sub);font-size:var(--fs-12);margin-top:12px;line-height:1.6">' +
        '把邀请码发给熟人，对方在「🔑 用邀请码入圈」处输入即可加入。<br/>' +
        '私密圈不会出现在全部圈子列表中，也不会被搜索到。</p>';
    } else {
      html += '<div class="grp-title">输入 6 位邀请码</div>' +
        '<input class="input" id="ccodeInput" maxlength="6" placeholder="例如：NS5Q0T" style="text-transform:uppercase;letter-spacing:2px" />' +
        '<button class="btn accent" style="width:100%;margin-top:12px" data-action="ccode-submit">验证并加入</button>' +
        '<p style="color:var(--sub);font-size:var(--fs-12);margin-top:14px;line-height:1.6">' +
        '私密圈不对外公开，需圈主邀请或熟人分享邀请码。</p>';
    }
    $('#ccodeBody').innerHTML = html;
    openOv('ov-circlecode');
  }
  function submitCircleCode() {
    var el = $('#ccodeInput');
    var code = (el && el.value || '').trim().toUpperCase();
    if (code.length !== 6) return toast('请输入 6 位邀请码', 'err');
    var st = S();
    var c = (st.circles || []).filter(function (x) {
      return x.visibility === 'private' && (x.code || '').toUpperCase() === code;
    })[0];
    if (!c) return toast('邀请码无效或已失效', 'err');
    if (st.myCircles.indexOf(c.id) >= 0) { closeOv('ov-circlecode'); return openCircleDetail(c.id); }
    /* v0.27：邀请码时效 / 使用次数校验（仅对首次入圈者生效，已在圈成员输码直接进入不消耗次数） */
    if (c.codeExpireAt && Date.now() >= c.codeExpireAt) return toast('邀请码已过期，请向圈主索取新邀请码', 'err');
    var limit = c.codeLimit != null ? c.codeLimit : CODE_LIMIT;
    if ((c.codeUsed || 0) >= limit) return toast('邀请码使用次数已达上限，请向圈主索取新邀请码', 'err');
    if (st.myCircles.indexOf(c.id) < 0) st.myCircles.push(c.id);
    c.codeUsed = (c.codeUsed || 0) + 1;
    DB.save();
    closeOv('ov-circlecode');
    renderCircles();
    if (A && A.track) A.track('circle_join_by_code', { circle: c.id });
    toast('邀请码验证通过，已加入「' + c.name + '」', 'ok');
    openCircleDetail(c.id);
  }
  function copyCircleCode() {
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === ccodeCircleId; })[0];
    if (!c) return;
    var txt = '【野遇】邀请你加入私密圈「' + c.name + '」，邀请码：' + c.code + '（在圈子页「🔑 用邀请码入圈」输入）';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
    } catch (e) { /* 无剪贴板权限时忽略 */ }
    toast('邀请码已复制：' + c.code, 'ok');
  }
  /* v0.27：圈主一键重置邀请码——旧码立即作废，次数清零、有效期重置 */
  function resetCircleCode() {
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === ccodeCircleId; })[0];
    if (!c) return;
    if (!isOwnerOf(c.id)) return toast('仅圈主可以重置邀请码', 'err');
    confirmBox('重置邀请码', '重置后当前邀请码立即失效，已分享出去的旧码将无法再使用。', function () {
      c.code = genCircleCode();
      c.codeUsed = 0;
      c.codeExpireAt = Date.now() + CODE_TTL;
      DB.save();
      openCircleCode('show', c.id);
      toast('邀请码已重置，旧码已作废', 'ok');
    }, '重置', '取消');
  }

  /* ---------- v0.17 成员管理 / 入圈审核 ---------- */
  /* 首次加载 / 新建圈子后补全代表成员，保证成员表不为空 */
  function ensureCircleMembers() {
    var st = S(), changed = false;
    (st.circles || []).forEach(function (c, ci) {
      if (!c.joinMode) c.joinMode = c.visibility === 'private' ? 'invite' : 'open';
      var has = (st.circleMembers || []).some(function (m) { return m.circleId === c.id; });
      if (has) return;
      var ownerId = c.owner || 'u' + ((ci % 10) + 1);
      c.owner = ownerId;
      st.circleMembers.push({ circleId: c.id, userId: ownerId, role: 'owner', joinedAt: Date.now() - (ci + 2) * 10 * 86400000, muted: false });
      for (var k = 0; k < 6; k++) {
        var uid = 'u' + (((ci * 3 + k + 1) % 10) + 1);
        if (uid === ownerId) continue;
        if (st.circleMembers.some(function (m) { return m.circleId === c.id && m.userId === uid; })) continue;
        st.circleMembers.push({ circleId: c.id, userId: uid, role: k === 0 ? 'admin' : 'member', joinedAt: Date.now() - (k + 1) * 3 * 86400000, muted: false });
      }
      changed = true;
    });
    /* 我已加入的圈子：确保 me 在成员表中 */
    (st.myCircles || []).forEach(function (cid) {
      var c = (st.circles || []).filter(function (x) { return x.id === cid; })[0];
      if (!c) return;
      if (st.circleMembers.some(function (m) { return m.circleId === cid && m.userId === 'me'; })) return;
      st.circleMembers.push({ circleId: cid, userId: 'me', role: c.owner === 'me' ? 'owner' : 'member', joinedAt: Date.now() - 6 * 86400000, muted: false });
      changed = true;
    });
    if (changed) DB.save();
  }
  function circleMembers(cid) {
    return (S().circleMembers || []).filter(function (m) { return m.circleId === cid; });
  }
  function myRole(cid) {
    var m = circleMembers(cid).filter(function (x) { return x.userId === 'me'; })[0];
    return m ? m.role : null;
  }
  function canManage(cid) {
    var r = myRole(cid);
    var c = (S().circles || []).filter(function (x) { return x.id === cid; })[0];
    return r === 'owner' || r === 'admin' || (c && c.owner === 'me');
  }
  /* v0.26：是否圈主（设管理员/转让等圈主专属动作的执行层判定） */
  function isOwnerOf(cid) {
    var c = (S().circles || []).filter(function (x) { return x.id === cid; })[0];
    return myRole(cid) === 'owner' || (c && c.owner === 'me');
  }
  /* v0.27：谁可邀请新成员——whoCanInvite: owner(仅圈主) / admin(圈主+管理员) / all(全员，缺省) */
  function canInvite(c) {
    if (!c) return false;
    var mode = c.whoCanInvite || 'all';
    if (mode === 'owner') return isOwnerOf(c.id);
    if (mode === 'admin') return canManage(c.id);
    return true;
  }
  function roleLabel(r) {
    return r === 'owner' ? '圈主' : (r === 'admin' ? '管理员' : '成员');
  }
  function myApply(cid) {
    return (S().circleApplies || []).filter(function (a) { return a.circleId === cid && a.userId === 'me'; })
      .sort(function (a, b) { return b.ts - a.ts; })[0];
  }
  function pendingApplies(cid) {
    return (S().circleApplies || []).filter(function (a) {
      return a.circleId === cid && a.status === 'pending';
    }).sort(function (a, b) { return a.ts - b.ts; });
  }
  /* 我管理的圈子里等待审核的申请数（圈子页提醒用） */
  function myManagePending() {
    var st = S(), out = [];
    (st.circles || []).forEach(function (c) {
      if (!canManage(c.id)) return;
      var n = pendingApplies(c.id).length;
      if (n) out.push({ circle: c, n: n });
    });
    return out;
  }
  function openCircleMembers(id, tab) {
    cmemCircleId = id || curCircleId;
    cmemTab = tab || 'members';
    cmemQuery = '';
    renderCircleMembers();
    openOv('ov-circlemem');
  }
  function renderCircleMembers() {
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
    if (!c) return;
    var meManage = canManage(c.id);
    var isOwner = c.owner === 'me';
    var membersHidden = !!c.membersHidden;   /* v0.24 隐私开关：关闭后仅圈主可见成员名单 */
    var pend = pendingApplies(c.id);
    $('#cmemTitle').textContent = meManage ? '成员管理' : '圈子成员';
    /* tab：非管理员只看成员 */
    var tabs = '<button class="subtab' + (cmemTab === 'members' ? ' active' : '') + '" data-action="cmem-tab" data-v="members">成员 ' + circleMembers(c.id).length + '</button>';
    if (meManage) {
      tabs += '<button class="subtab' + (cmemTab === 'apply' ? ' active' : '') + '" data-action="cmem-tab" data-v="apply">入圈审核' + (pend.length ? '（' + pend.length + '）' : '') + '</button>';
    }
    $('#cmemTabs').innerHTML = tabs;
    if (cmemTab === 'apply' && !meManage) cmemTab = 'members';

    var top = '<div class="cmem-top"><b>' + esc(c.name) + (isPrivate(c) ? ' <span class="lock-tip">🔒 私密</span>' : '') + '</b>' +
      '<small>共 ' + (c.members || 0) + ' 人 · 入圈方式：' +
      (c.joinMode === 'approval' ? '需圈主审核' : (c.joinMode === 'invite' ? '仅邀请' : '自由加入')) +
      ' · 我的身份：' + roleLabel(myRole(c.id) || '成员') + '</small></div>';
    /* v0.24：圈主专属隐私开关——一键开启/关闭「允许成员查看成员列表」 */
    if (isOwner) {
      top += '<div class="cmem-privacy" data-action="cmem-privacy">' +
        '<div class="row-title"><b>允许成员查看成员列表</b>' +
        '<small>关闭后仅圈主可见成员名单，保护成员隐私</small></div>' +
        '<div class="switch' + (membersHidden ? '' : ' on') + '"><i></i></div></div>';
      /* v0.25：圈主专属发动态权限开关——关闭后仅圈主可在圈内发布 */
      top += '<div class="cmem-privacy" data-action="cmem-postperm">' +
        '<div class="row-title"><b>允许成员发布动态</b>' +
        '<small>关闭后仅圈主可在圈内发布，圈主随时可发</small></div>' +
        '<div class="switch' + (c.allowMemberPost === false ? '' : ' on') + '"><i></i></div></div>';
      /* v0.27：圈主专属「谁可邀请」三档——仅圈主 / 圈主+管理员 / 全员 */
      var whoInv = c.whoCanInvite || 'all';
      top += '<div class="cmem-invperm">' +
        '<div class="row-title"><b>谁可以邀请新成员</b>' +
        '<small>控制成员的拉人权限，私密圈建议收紧</small></div>' +
        '<div class="seg">' +
        '<button class="seg-o' + (whoInv === 'owner' ? ' on' : '') + '" data-action="cmem-invperm" data-v="owner">仅圈主</button>' +
        '<button class="seg-o' + (whoInv === 'admin' ? ' on' : '') + '" data-action="cmem-invperm" data-v="admin">圈主+管理员</button>' +
        '<button class="seg-o' + (whoInv === 'all' ? ' on' : '') + '" data-action="cmem-invperm" data-v="all">全员</button>' +
        '</div></div>';
    }
    if (cmemTab === 'members' && !(membersHidden && !isOwner)) {
      top += '<input class="input" id="cmemSearch" placeholder="搜索成员昵称" value="' + esc(cmemQuery) + '" oninput="App.cmemSearch(this.value)" />';
    }
    $('#cmemTop').innerHTML = top;

    var html = '';
    if (cmemTab === 'members' && membersHidden && !isOwner) {
      /* v0.24：隐私关闭时，非圈主（含管理员/普通成员）看到占位提示；人数等元数据仍可见 */
      html = emptyBlock('🔒', '成员列表已隐藏', '圈主已关闭成员列表查看，仅圈主可见名单');
    } else if (cmemTab === 'members') {
      var list = circleMembers(c.id).sort(function (a, b) {
        var ord = { owner: 0, admin: 1, member: 2 };
        return (ord[a.role] - ord[b.role]) || (b.joinedAt - a.joinedAt);
      });
      var q = (cmemQuery || '').trim();
      if (q) list = list.filter(function (m) { return U(m.userId).name.indexOf(q) >= 0; });
      if (!list.length) {
        html = emptyBlock('🔍', '没有匹配的成员', '换个关键词试试');
      } else {
        html += '<div class="grp-title">成员列表（管理员可操作）</div>';
        list.forEach(function (m) {
          var u = U(m.userId);
          var isMe = m.userId === 'me';
          var opable = meManage && m.role !== 'owner' && !isMe;
          html += '<div class="mem-row">' + avatarHtml(u, 'sm') +
            '<div class="mem-nm"><b>' + esc(u.name) + (isMe ? '（我）' : '') + ' <span class="role ' + m.role + '">' + roleLabel(m.role) + '</span>' +
            (m.muted ? ' <span class="lock-tip">禁言中</span>' : '') + '</b>' +
            '<small>' + timeLabel(m.joinedAt) + ' 加入' + (isMe ? '' : ' · ' + esc(u.sign || '')) + '</small></div>' +
            (opable ? '<button class="btn ghost xs" data-action="mem-act" data-id="' + m.userId + '">管理</button>' : '') +
            '</div>';
        });
      }
    } else {
      if (!pend.length) {
        html = emptyBlock('✅', '没有待审核的申请', '有新申请会在这里出现');
      } else {
        html += '<div class="grp-title">待审核（' + pend.length + '）</div>';
        pend.forEach(function (a) {
          var u = U(a.userId);
          html += '<div class="apply-card">' + avatarHtml(u, 'sm') +
            '<div class="apply-info"><b>' + esc(u.name) + ' 申请加入</b>' +
            '<small>' + timeLabel(a.ts) + ' · ' + esc(a.msg || '（无附言）') + '</small></div>' +
            '<div class="apply-act">' +
            '<button class="btn accent xs" data-action="apply-ok" data-id="' + a.id + '">通过</button>' +
            '<button class="btn ghost xs" data-action="apply-no" data-id="' + a.id + '">拒绝</button>' +
            '</div></div>';
        });
      }
      var done = (st.circleApplies || []).filter(function (a) {
        return a.circleId === c.id && a.status !== 'pending';
      }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 8);
      if (done.length) {
        html += '<div class="grp-title" style="margin-top:14px">最近处理</div>';
        done.forEach(function (a) {
          html += '<div class="mem-row done">' + avatarHtml(U(a.userId), 'sm') +
            '<div class="mem-nm"><b>' + esc(U(a.userId).name) + '</b>' +
            '<small>' + (a.status === 'approved' ? '已通过' : '已拒绝') + ' · ' + timeLabel(a.ts) + '</small></div>' +
            '<span class="ap-st ' + a.status + '">' + (a.status === 'approved' ? '通过' : '拒绝') + '</span></div>';
        });
      }
    }
    $('#cmemBody').innerHTML = html;
  }
  function cmemSearch(v) { cmemQuery = v; renderCircleMembers(); var el = $('#cmemSearch'); if (el) { el.focus({ preventScroll: true }); el.value = v; } }
  /* v0.24：圈主一键开关「允许成员查看成员列表」——关闭后仅圈主可见名单（membersHidden） */
  function toggleCircleMembersHidden() {
    var c = (S().circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
    if (!c) return;
    if (c.owner !== 'me') return toast('仅圈主可以修改', 'err');
    c.membersHidden = !c.membersHidden;
    DB.save();
    renderCircleMembers();
    toast(c.membersHidden ? '已关闭成员列表查看，仅你可见名单' : '已允许成员查看成员列表', 'ok');
  }
  /* v0.25：圈主一键开关「允许成员发布动态」——关闭后仅圈主可发（allowMemberPost，缺省=允许） */
  function toggleCircleMemberPost() {
    var c = (S().circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
    if (!c) return;
    if (c.owner !== 'me') return toast('仅圈主可以修改', 'err');
    c.allowMemberPost = (c.allowMemberPost === false);   // 当前允许(缺省/true) → false 关闭；当前 false → true 开启
    DB.save();
    renderCircleMembers();
    toast(c.allowMemberPost === false ? '已关闭成员发动态，仅你可在圈内发布' : '已允许成员发布动态', 'ok');
  }
  /* v0.27：圈主设置「谁可邀请」三档 */
  function setCircleInvitePerm(v) {
    var c = (S().circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
    if (!c) return;
    if (c.owner !== 'me') return toast('仅圈主可以修改', 'err');
    c.whoCanInvite = v;
    DB.save();
    renderCircleMembers();
    toast(v === 'owner' ? '已设为仅圈主可邀请' : (v === 'admin' ? '已设为圈主与管理员可邀请' : '已设为全员可邀请'), 'ok');
  }
  /* 成员操作面板 */
  function openMemAct(uid) {
    curMemUid = uid;
    var cid = cmemCircleId;
    var m = circleMembers(cid).filter(function (x) { return x.userId === uid; })[0];
    if (!m) return;
    var u = U(uid);
    var isOwner = isOwnerOf(cid);
    var canMng = canManage(cid);
    var isSelf = uid === 'me';
    var targetIsOwner = m.role === 'owner';
    $('#memactTitle').textContent = '管理 ' + u.name;
    var html = '<div class="mem-row">' + avatarHtml(u, 'sm') +
      '<div class="mem-nm"><b>' + esc(u.name) + ' <span class="role ' + m.role + '">' + roleLabel(m.role) + '</span></b>' +
      '<small>' + timeLabel(m.joinedAt) + ' 加入</small></div></div>';
    html += '<div class="grp-title">操作</div>';
    /* v0.26：按权限过滤操作项——圈主：设管理员/禁言/移出/转让；管理员：禁言/移出；且不可对圈主/自己操作 */
    if (isOwner && !targetIsOwner) html += actRow(m.role === 'admin' ? '取消管理员' : '设为管理员', 'mem-admin');
    if (canMng && !targetIsOwner) html += actRow(m.muted ? '解除禁言' : '禁言（7 天）', 'mem-mute');
    if (canMng && !targetIsOwner && !isSelf) html += actRow('移出圈子', 'mem-remove', true);
    if (isOwner && !isSelf) html += actRow('转让圈主', 'mem-transfer', true);
    html += '<p style="color:var(--sub);font-size:var(--fs-12);margin-top:14px;line-height:1.6">' +
      ((!isOwner && !canMng)
        ? '你当前为普通成员，无成员管理权限。'
        : '禁言后该成员 7 天内不能在圈内发言 / 发动态；移出后可重新申请或受邀加入。') + '</p>';
    $('#memactBody').innerHTML = html;
    openOv('ov-memact');
    function actRow(t, act, danger) {
      return '<div class="act-row' + (danger ? ' danger' : '') + '" data-action="' + act + '">' + t + '</div>';
    }
  }
  function memToggleAdmin() {
    if (!isOwnerOf(cmemCircleId)) return toast('仅圈主可设置管理员', 'err');
    if (curMemUid === 'me') return toast('不能对自己操作', 'err');
    var m = circleMembers(cmemCircleId).filter(function (x) { return x.userId === curMemUid; })[0];
    if (!m || m.role === 'owner') return toast('不能对圈主操作', 'err');
    m.role = m.role === 'admin' ? 'member' : 'admin';
    DB.save(); closeOv('ov-memact'); renderCircleMembers();
    toast(m.role === 'admin' ? '已设为管理员' : '已取消管理员');
  }
  function memToggleMute() {
    if (!canManage(cmemCircleId)) return toast('仅圈主/管理员可禁言', 'err');
    var m = circleMembers(cmemCircleId).filter(function (x) { return x.userId === curMemUid; })[0];
    if (!m || m.role === 'owner') return toast('不能对圈主操作', 'err');
    m.muted = !m.muted;
    DB.save(); closeOv('ov-memact'); renderCircleMembers();
    toast(m.muted ? '已禁言 7 天' : '已解除禁言');
  }
  function memRemove() {
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
    var uid = curMemUid;
    confirmBox('移出圈子', '将「' + U(uid).name + '」移出「' + (c ? c.name : '') + '」', function () {
      if (!canManage(cmemCircleId)) return toast('仅圈主/管理员可移出成员', 'err');
      if (uid === 'me') return toast('不能移出自己', 'err');
      var tm = circleMembers(cmemCircleId).filter(function (x) { return x.userId === uid; })[0];
      if (tm && tm.role === 'owner') return toast('不能移出圈主', 'err');
      var s = S();
      s.circleMembers = (s.circleMembers || []).filter(function (m) { return !(m.circleId === cmemCircleId && m.userId === uid); });
      var cc = (s.circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
      if (cc && cc.members > 0) cc.members--;
      DB.save(); closeOv('ov-memact'); renderCircleMembers();
      toast('已移出圈子', 'ok');
    }, '移出', '取消');
  }
  function memTransfer() {
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
    var uid = curMemUid;
    confirmBox('转让圈主', '转让后你将变为普通成员，「' + U(uid).name + '」成为圈主', function () {
      if (!isOwnerOf(cmemCircleId)) return toast('仅圈主可转让', 'err');
      if (uid === 'me') return toast('不能转让给自己', 'err');
      var s = S();
      var cc = (s.circles || []).filter(function (x) { return x.id === cmemCircleId; })[0];
      if (cc) cc.owner = uid;
      (s.circleMembers || []).forEach(function (m) {
        if (m.circleId !== cmemCircleId) return;
        if (m.userId === uid) m.role = 'owner';
        else if (m.userId === 'me') m.role = 'member';
      });
      DB.save(); closeOv('ov-memact'); renderCircleMembers();
      toast('圈主已转让', 'ok');
    }, '转让', '取消');
  }
  /* 申请入圈 / 审核 */
  function openCircleApply(id) {
    var st = S();
    var c = (st.circles || []).filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var apply = myApply(id);
    /* 已在审核中：展示状态而不是重复提交 */
    if (apply && apply.status === 'pending') {
      $('#applyBody').innerHTML = '<div class="apply-card done">' +
        '<div class="apply-info"><b>审核中</b>' +
        '<small>' + timeLabel(apply.ts) + ' 提交 · 附言：' + esc(apply.msg || '（无）') + '</small></div></div>' +
        '<p style="color:var(--sub);font-size:var(--fs-12);margin-top:14px;line-height:1.6">' +
        '圈主审核通过后你会自动加入该圈，可在圈子详情查看结果。</p>';
      openOv('ov-circleapply');
      return;
    }
    $('#applyBody').innerHTML = '<div class="cmem-top"><b>' + esc(c.name) + '</b>' +
      '<small>该圈需圈主审核通过后才能加入</small></div>' +
      '<div class="grp-title">申请附言（选填，提高通过率）</div>' +
      '<textarea class="input" id="applyMsg" rows="3" maxlength="80" placeholder="例如：走过梧桐山野线，装备齐全，想跟队"></textarea>' +
      '<p style="color:var(--sub);font-size:var(--fs-12);margin-top:14px;line-height:1.6">' +
      '提交后圈主会收到审核提醒，通过后自动入圈。</p>';
    openOv('ov-circleapply');
  }
  function submitCircleApply() {
    var st = S();
    var cid = curCircleId;
    var c = (st.circles || []).filter(function (x) { return x.id === cid; })[0];
    if (!c) return;
    var el = $('#applyMsg');
    var msg = el ? (el.value || '').trim() : '';
    st.circleApplies.push({
      id: 'ca-' + Date.now(), circleId: cid, userId: 'me',
      ts: Date.now(), status: 'pending', msg: msg
    });
    DB.save();
    closeOv('ov-circleapply');
    if (A && A.track) A.track('circle_apply', { circle: cid });
    renderCircles(); openCircleDetail(cid);
    toast('申请已提交，等待圈主审核', 'ok');
  }
  function approveApply(aid) {
    var st = S();
    var a = (st.circleApplies || []).filter(function (x) { return x.id === aid; })[0];
    if (!a) return;
    a.status = 'approved'; a.handledAt = Date.now();
    if (!st.circleMembers.some(function (m) { return m.circleId === a.circleId && m.userId === a.userId; })) {
      st.circleMembers.push({ circleId: a.circleId, userId: a.userId, role: 'member', joinedAt: Date.now(), muted: false });
    }
    var c = (st.circles || []).filter(function (x) { return x.id === a.circleId; })[0];
    if (c) c.members = (c.members || 0) + 1;
    if (a.userId === 'me' && st.myCircles.indexOf(a.circleId) < 0) st.myCircles.push(a.circleId);
    DB.save(); renderCircleMembers(); renderCircles();
    if (A && A.track) A.track('circle_apply_approve', { circle: a.circleId });
    toast('已通过，' + U(a.userId).name + ' 已加入圈子', 'ok');
  }
  function rejectApply(aid) {
    var st = S();
    var a = (st.circleApplies || []).filter(function (x) { return x.id === aid; })[0];
    if (!a) return;
    confirmBox('拒绝申请', '拒绝「' + U(a.userId).name + '」的入圈申请？', function () {
      var s = S();
      var t = (s.circleApplies || []).filter(function (x) { return x.id === aid; })[0];
      if (t) { t.status = 'rejected'; t.handledAt = Date.now(); }
      DB.save(); renderCircleMembers();
      toast('已拒绝该申请', 'ok');
    }, '拒绝', '取消');
  }

  function syncCircleTabs() {
    $$('#circSide .circ-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.k === circleCat); });
  }
  /* v0.30：圈子页搜索——按名称 / 城市 / 省份 / 描述实时过滤 */
  function circleSearch(q) {
    circleQuery = (q || '').trim();
    renderCircles();
  }
  function fmtMembers(n) {
    if (n == null) return '0';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return '' + n;
  }
  function shade(hex) {
    var h = (hex || '#12b76a').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(h, 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * 0.8) + ',' + Math.round(g * 0.8) + ',' + Math.round(b * 0.8) + ')';
  }
  /* v0.50：圈子卡角标 —— 缩略图仅 52px，两个角标横向并排必然相撞（实测 NEW 宽 31.6、
     「需审核」宽 35.9，左上 -5→26.6 与右上 21.1→57 重叠 5.5px）。改为「槽位制」：
     ① 状态角标 HOT/NEW 同一语义只取一个（HOT 优先）→ 槽位 tl（左上）
     ② 「需审核」→ 槽位 br（右下），与左上对角错开，永不重叠
     ③ 最多 2 个角标，第三个不渲染（52px 缩略图放不下，宁缺毋滥） */
  function circleBadges(c) {
    var list = [];
    if (c.hot) list.push(['hot', 'HOT']);
    else if (c.isNew) list.push(['neu', 'NEW']);
    /* v0.43：需圈主审核的圈在卡片上加「需审核」角标，让「申请加入」按钮一眼可辨为故意审核、
       而非文案 bug */
    if (c.joinMode === 'approval') list.push(['audit', '需审核']);
    var slots = ['tl', 'br'];
    return list.slice(0, slots.length).map(function (b, i) {
      return '<span class="cir-badge ' + b[0] + ' ' + slots[i] + '">' + b[1] + '</span>';
    }).join('');
  }
  function renderMyCircles() {
    var st = S();
    var box = $('#circMine'); if (!box) return;
    var ids = (st.myCircles || []).slice();
    if (!ids.length) { box.innerHTML = '<div class="cm-empty">还没有加入圈子，去「推荐」逛逛吧</div>'; return; }
    box.innerHTML = ids.map(function (id) {
      var c = (st.circles || []).filter(function (x) { return x.id === id; })[0];
      if (!c) return '';
      var col = c.color || '#12b76a';
      var own = c.owner === 'me' ? '<span class="cm-own">圈主</span>' : '';
      var lock = isPrivate(c) ? '<span class="cm-lock" title="私密圈">🔒</span>' : '';
      return '<div class="cm-card" data-action="circle-open" data-id="' + c.id + '">' +
        '<div class="cm-thumb" style="background:linear-gradient(135deg,' + col + ',' + shade(col) + ')">' + (c.icon || '🌐') + own + lock + '</div>' +
        '<div class="cm-name">' + esc(c.name) + '</div></div>';
    }).join('');
  }
  function renderCircleSidebar() {
    var box = $('#circSide'); if (!box) return;
    var cats = ['rec', 'hot', '徒步', '骑行', '露营', '攀岩', '桨板', '同城', 'fav'];
    var labels = { rec: '推荐', hot: '人气', '徒步': '徒步', '骑行': '骑行', '露营': '露营', '攀岩': '攀岩', '桨板': '桨板', '同城': '同城', 'fav': '收藏' };
    box.innerHTML = cats.map(function (k) {
      return '<button class="circ-tab' + (k === circleCat ? ' active' : '') + '" data-action="circle-cat" data-k="' + k + '">' + labels[k] + '</button>';
    }).join('');
  }
  function cirCardHtml(c, joined) {
    var col = c.color || '#12b76a';
    var fav = (S().circleFavs || []).indexOf(c.id) >= 0;
    var noun = c.noun || '人';
    return '<div class="cir-card" data-action="circle-open" data-id="' + c.id + '">' +
      '<div class="cir-thumb" style="background:linear-gradient(135deg,' + col + ',' + shade(col) + ')">' +
        (c.icon || '🌐') + circleBadges(c) + '</div>' +
      '<div class="cir-body">' +
        '<div class="cir-name">' + esc(c.name) + '</div>' +
        '<div class="cir-desc">' + esc(c.desc || '') + '</div>' +
        '<div class="cir-meta">' + fmtMembers(c.members) + ' ' + esc(noun) + '在这 · ' + esc(c.city) + '</div>' +
      '</div>' +
      '<div class="cir-act">' +
        joinBtnHtml(c, joined) +
        '<button class="cir-fav' + (fav ? ' on' : '') + '" data-action="circle-fav" data-id="' + c.id + '" title="收藏">' + (fav ? '♥' : '♡') + '</button>' +
      '</div>' +
    '</div>';
  }
  function buildCircleList() {
    var st = S();
    var list = (st.circles || []).filter(function (c) { return !isPrivate(c); });
    if (circleCat === 'hot') {
      list = list.slice().sort(function (a, b) { return (b.members || 0) - (a.members || 0); });
    } else if (circleCat === 'rec') {
      list = list.slice().sort(function (a, b) {
        var w = function (x) { return (x.hot ? 2 : 0) + (x.isNew ? 1 : 0); };
        return w(b) - w(a) || (b.members || 0) - (a.members || 0);
      });
    } else if (circleCat === 'fav') {
      var favs = st.circleFavs || [];
      list = list.filter(function (c) { return favs.indexOf(c.id) >= 0; });
    } else { /* 兴趣分类（徒步/骑行/露营/攀岩/桨板） */
      list = list.filter(function (c) { return c.cat === circleCat; });
    }
    if (circleQuery) {
      var q = circleQuery.toLowerCase();
      list = list.filter(function (c) {
        return (c.name + ' ' + c.city + ' ' + c.province + ' ' + (c.desc || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    return list;
  }
  function paintCircleList() {
    var st = S();
    renderCircleInvites();
    if (circleCat === '同城') {
      var groups = {};
      (st.circles || []).filter(function (c) { return !isPrivate(c); }).forEach(function (c) { (groups[c.province] = groups[c.province] || []).push(c); });
      var html = Object.keys(groups).map(function (prov) {
        return '<div class="cgroup"><div class="cgroup-hd">' + esc(prov) + ' · 同城圈</div>' +
          groups[prov].map(function (c) { return cirCardHtml(c, st.myCircles.indexOf(c.id) >= 0); }).join('') + '</div>';
      }).join('');
      $('#circleList').innerHTML = html || emptyBlock('🌐', '暂无同城圈子', '换个分类看看');
      return;
    }
    var list = buildCircleList();
    if (!list.length) {
      $('#circleList').innerHTML = emptyBlock('🌐',
        circleQuery ? '没有匹配的圈子' : (circleCat === 'fav' ? '还没有收藏的圈子' : '该分类暂无圈子'),
        circleQuery ? '换个关键词试试' : '去「推荐」看看更多');
      return;
    }
    $('#circleList').innerHTML = list.map(function (c) { return cirCardHtml(c, st.myCircles.indexOf(c.id) >= 0); }).join('');
  }
  /* v0.41：右上角「＋」下拉菜单——收纳「创建圈子」与「用邀请码入圈」两个入口 */
  function renderCircleMenu() {
    var box = $('#circMenu'); if (!box) return;
    box.innerHTML =
      '<div class="pm" data-action="circle-create"><span class="pi">➕</span>创建圈子</div>' +
      '<div class="pm" data-action="circle-code-join"><span class="pi">🔑</span>邀请码入圈</div>';
    box.classList.toggle('show', !!circleMenuOpen);
  }
  function closeCircleMenu() {
    circleMenuOpen = false;
    var box = $('#circMenu'); if (box) box.classList.remove('show');
  }
  function toggleFav(id) {
    var st = S();
    if (!st.circleFavs) st.circleFavs = [];
    var i = st.circleFavs.indexOf(id);
    if (i >= 0) st.circleFavs.splice(i, 1); else st.circleFavs.push(id);
    DB.save();
    paintCircleList();
    toast(i >= 0 ? '已取消收藏' : '已收藏', 'ok');
  }
  function renderCircles() {
    circleMenuOpen = false;      // 重绘/离开该屏即收起下拉菜单
    renderMyCircles();
    renderCircleSidebar();
    paintCircleList();
    syncCircleTabs();
    renderCircleMenu();
  }
  function openCircleDetail(id) {
    var st = S(), c = (st.circles || []).filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    curCircleId = id;
    var joined = st.myCircles.indexOf(id) >= 0;
    var posts = (st.circlePosts || []).filter(function (p) { return p.circleId === id; })
      .sort(function (a, b) { return b.ts - a.ts; });
    $('#cdTitle').textContent = c.name;
    var ownerBar = c.owner === 'me'
      ? '<div class="cd-owner"><span>' + svgIcon('crown', 'ci') + '你创建的圈子</span>' +
        '<button class="btn ghost xs" data-action="mk-edit" data-id="' + c.id + '">编辑资料</button>' +
        '<button class="btn ghost xs" data-action="mk-dissolve" data-id="' + c.id + '" style="color:var(--error-fg)">解散</button></div>'
      : '';
    /* 成员条：熟人介绍入圈 / 查看邀请码（v0.16） */
    var memberBar = joined
      ? '<div class="cd-owner"><span>🤝 熟人介绍入圈</span>' +
        (canInvite(c) ? '<button class="btn ghost xs" data-action="circle-invite">邀请好友</button>' : '') +
        (isPrivate(c) ? '<button class="btn ghost xs" data-action="circle-code-show" data-id="' + c.id + '">邀请码</button>' : '') +
        '</div>'
      : '';
    /* 成员入口：管理员显示「管理」，普通用户显示「查看」（v0.17） */
    var memBar = '<div class="cd-membar">' +
      '<button class="btn ghost sm" data-action="circle-members" data-id="' + c.id + '">👥 成员 ' + (c.members || 0) + ' 人 · ' + (canManage(c.id) ? '管理' : '查看') + '</button>' +
      '</div>';
    /* v0.77 群绑圈：圈主 / 成员可绑定已有群聊作为内容分发渠道 */
    var bindBar = (joined || c.owner === 'me') ? renderCircleBind(c) : '';
    $('#cdHead').innerHTML = circleHeadHtml(c, joined) + ownerBar + memberBar + memBar + bindBar;
    /* v0.25：圈主可一键关闭成员发动态权限——非圈主无发布入口，feed 顶部给透明提示；圈主永远可发 */
    var canPost = c.owner === 'me' || c.allowMemberPost !== false;
    var pubBtn = $('#ov-circledetail .ov-head [data-action="circle-publish"]');
    if (pubBtn) pubBtn.style.display = canPost ? '' : 'none';
    /* 私密圈：非成员不可见内容 */
    var canSee = !isPrivate(c) || joined;
    var banTip = canPost ? '' : '<div class="cd-ban-tip">🔒 圈主已关闭成员发动态权限，仅圈主可发布</div>';
    /* v0.28：私密圈非成员视角，空状态补明确的「输入邀请码加入」按钮，与顶部入口一致，不再只有一句说明文案 */
    var feedHtml;
    if (!canSee) {
      feedHtml = '<div class="empty"><div class="e-ico">🔒</div>' +
        '<p><b>私密圈 · 内容仅成员可见</b></p>' +
        '<p>圈主邀请或熟人分享邀请码后，输入即可加入</p>' +
        '<button class="btn accent sm e-act" data-action="circle-code-join" data-id="' + c.id + '">🔑 输入邀请码加入</button>' +
        '</div>';
    } else if (posts.length) {
      feedHtml = posts.map(circlePostCard).join('');
    } else {
      feedHtml = emptyBlock('📭', '圈子还没有动态', '成为成员后发第一条吧');
    }
    $('#cdFeed').innerHTML = banTip + feedHtml;
    openOv('ov-circledetail');
  }
  function joinCircle(id) {
    var st = S();
    /* v0.33 卡点 K6：可加入圈子数按等级限流。
       校验必须置于所有写操作之前（吸取 exitCircle“先移除再报错”的教训）。 */
    if (st.myCircles.indexOf(id) < 0) {
      var jd = En.can('circle.joinCap');
      if (!jd.allowed) {
        paywall(jd, {
          title: '圈子位已满',
          body: '当前等级最多加入 ' + jd.cap + ' 个圈子（VIP 15 个 · SVIP 不限）。' +
                '退出一个不常看的圈子也能腾出位置。'
        });
        return;
      }
    }
    if (st.myCircles.indexOf(id) < 0) st.myCircles.push(id);
    /* 同步成员表（v0.17） */
    if (!st.circleMembers.some(function (m) { return m.circleId === id && m.userId === 'me'; })) {
      var cc = (st.circles || []).filter(function (x) { return x.id === id; })[0];
      st.circleMembers.push({ circleId: id, userId: 'me', role: (cc && cc.owner === 'me') ? 'owner' : 'member', joinedAt: Date.now(), muted: false });
      if (cc) cc.members = (cc.members || 0) + 1;
    }
    DB.save(); renderCircles();
    if ($('#ov-circledetail').classList.contains('show')) openCircleDetail(id);
    toast('已加入圈子', 'ok');
    if (A && A.track) A.track('circle_join', { id: id });
  }
  function exitCircle(id) {
    var c = (S().circles || []).filter(function (x) { return x.id === id; })[0];
    confirmBox('退出圈子', '退出「' + (c ? c.name : '') + '」后将不再接收其动态', function () {
      var st = S();
      /* v0.26：圈主不可退出——校验必须置于所有写操作之前，避免“先移除再报错”破坏状态 */
      var cc = (st.circles || []).filter(function (x) { return x.id === id; })[0];
      if (cc && cc.owner === 'me') return toast('你是圈主，需先转让圈主才能退出', 'err');
      st.myCircles = st.myCircles.filter(function (x) { return x !== id; });
      /* 同步成员表：圈主不可退出，普通成员移除（v0.17） */
      st.circleMembers = (st.circleMembers || []).filter(function (m) { return !(m.circleId === id && m.userId === 'me'); });
      if (cc && cc.members > 0) cc.members--;
      DB.save(); renderCircles();
      if ($('#ov-circledetail').classList.contains('show')) openCircleDetail(id);
      toast('已退出圈子', 'ok');
    }, '退出', '取消');
  }

  /* ================= 创建 / 编辑 / 解散圈子（v0.15.1） ================= */
  function openCreateCircle(id) {
    if (id) {
      var c = (S().circles || []).filter(function (x) { return x.id === id; })[0];
      if (!c) return;
      var known = !!MK_PROVS[c.province];
      mkEditId = id;
      mkDraft = {
        name: c.name || '', desc: c.desc || '', icon: c.icon || '⛺️',
        province: known ? c.province : '其他',
        city: known ? (c.city || '') : '',
        customProv: known ? '' : (c.province || ''),
        customCity: known ? '' : (c.city || ''),
        visibility: c.visibility === 'private' ? 'private' : 'public',
        joinMode: c.visibility === 'private' ? undefined : (c.joinMode || 'free')
      };
    } else {
      mkEditId = null;
      mkDraft = { name:'', desc:'', icon:'⛺️', province:'', city:'', customProv:'', customCity:'', visibility:'public', joinMode:'free' };
    }
    $('#mkTitle').textContent = mkEditId ? '编辑圈子' : '创建圈子';
    var sb = $('#ov-circlemk [data-action="mk-submit"]');
    if (sb) sb.textContent = mkEditId ? '保存' : '创建';
    renderCreateCircle();
    openOv('ov-circlemk');
  }
  function renderCreateCircle() {
    var d = mkDraft;
    var chipRow = function (arr, act, cur) {
      return '<div style="display:flex;gap:6px;flex-wrap:wrap">' + arr.map(function (v) {
        return '<button class="chip' + (cur === v ? ' on' : '') + '" data-action="' + act + '" data-v="' + esc(v) + '">' + esc(v) + '</button>';
      }).join('') + '</div>';
    };
    var provNames = Object.keys(MK_PROVS).concat(['其他']);
    var html = '';
    html += '<div class="grp-title">圈子名称</div>';
    html += '<input class="input" id="mkName" maxlength="20" placeholder="例如：深圳周末徒步" value="' + esc(d.name) + '" oninput="App.mkField(\'name\', this.value)" />';
    html += '<div class="grp-title">圈子简介</div>';
    html += '<textarea class="input" id="mkDesc" rows="2" maxlength="60" placeholder="一句话说明这个圈子玩什么" oninput="App.mkField(\'desc\', this.value)">' + esc(d.desc) + '</textarea>';
    html += '<div class="grp-title">选择地区（省 / 市两级）</div>';
    html += chipRow(provNames, 'mk-prov', d.province);
    if (d.province && d.province !== '其他') {
      html += '<div style="margin-top:8px">' + chipRow(MK_PROVS[d.province], 'mk-city', d.city) + '</div>';
    } else if (d.province === '其他') {
      html += '<div style="margin-top:8px">' +
        '<input class="input" id="mkCustomProv" placeholder="请输入省份，如：湖北" value="' + esc(d.customProv) + '" oninput="App.mkField(\'customProv\', this.value)" />' +
        '<input class="input" id="mkCustomCity" style="margin-top:8px" placeholder="请输入城市，如：武汉" value="' + esc(d.customCity) + '" oninput="App.mkField(\'customCity\', this.value)" />' +
        '</div>';
    }
    html += '<div class="grp-title">圈子图标</div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">' + MK_ICONS.map(function (i) {
      return '<button class="chip' + (d.icon === i ? ' on' : '') + '" data-action="mk-icon" data-v="' + i + '">' + i + '</button>';
    }).join('') + '</div>';
    html += '<div class="grp-title">圈子可见性</div>';
    html += '<div class="vis-opts">' +
      '<div class="vis-opt' + (d.visibility === 'public' ? ' on' : '') + '" data-action="mk-vis" data-v="public">' +
      '<b>🌐 公开圈</b><small>出现在「全部圈子」，任何人可加入</small></div>' +
      '<div class="vis-opt' + (d.visibility === 'private' ? ' on' : '') + '" data-action="mk-vis" data-v="private">' +
      '<b>🔒 私密圈</b><small>广场不可见、搜不到，仅圈主邀请或熟人邀请码入圈</small></div>' +
      '</div>';
    html += '<p style="color:var(--sub);font-size:var(--fs-12);margin-top:16px;line-height:1.6">' +
      '创建后你自动成为<b>圈主</b>' +
      (d.visibility === 'private' ? '，系统将生成<b>邀请码</b>，圈子不会出现在「全部圈子」' : '，圈子会出现在对应省市分组与「我的圈子」') +
      '。</p>';
    /* v0.43：公开圈可配置「入圈方式」——此前仅种子数据硬编码 joinMode:'approval'，
       创建流程无此入口，导致「申请加入」路径对真实用户是死的。补上后逻辑闭环。
       私密圈一律走邀请码，不显示此选项（joinBtnHtml 中 isPrivate 优先级最高）。 */
    if (d.visibility === 'public') {
      var jm = d.joinMode || 'free';
      html += '<div class="grp-title">入圈方式</div>';
      html += '<div class="vis-opts">' +
        '<div class="vis-opt' + (jm === 'free' ? ' on' : '') + '" data-action="mk-joinmode" data-v="free">' +
        '<b>🟢 自由加入</b><small>成员点击「加入」即可进圈，零门槛</small></div>' +
        '<div class="vis-opt' + (jm === 'approval' ? ' on' : '') + '" data-action="mk-joinmode" data-v="approval">' +
        '<b>🟡 需圈主审核</b><small>成员点击「申请加入」，你通过后才入圈（适合硬核/熟人局）</small></div>' +
        '</div>';
    }
    $('#mkBody').innerHTML = html;
  }
  function mkField(k, v) { mkDraft[k] = v; }
  function mkSubmit() {
    var d = mkDraft;
    var name = (d.name || '').trim();
    if (!name) return toast('请填写圈子名称', 'err');
    var prov, city;
    if (d.province === '其他') {
      prov = (d.customProv || '').trim(); city = (d.customCity || '').trim();
      if (!prov || !city) return toast('请填写省份与城市', 'err');
    } else {
      if (!d.province) return toast('请选择省份', 'err');
      if (!d.city) return toast('请选择城市', 'err');
      prov = d.province; city = d.city;
    }
    var desc = (d.desc || '').trim();
    var st = S();
    if (mkEditId) {
      var c = st.circles.filter(function (x) { return x.id === mkEditId; })[0];
      if (!c) return;
      c.name = name; c.desc = desc; c.icon = d.icon; c.province = prov; c.city = city;
      /* 公开 → 私密：补发邀请码 + 时效/次数；私密 → 公开：清掉邀请码及相关字段 */
      if (d.visibility === 'private') {
        c.visibility = 'private';
        if (!c.code) { c.code = genCircleCode(); c.codeUsed = 0; c.codeExpireAt = Date.now() + CODE_TTL; }
        if (c.codeLimit == null) c.codeLimit = CODE_LIMIT;
        delete c.joinMode;   // 私密圈走邀请码，joinMode 无意义
      } else {
        c.visibility = 'public'; delete c.code; delete c.codeLimit; delete c.codeUsed; delete c.codeExpireAt;
        c.joinMode = d.joinMode || 'free';
      }
      DB.save(); closeOv('ov-circlemk');
      renderCircles(); openCircleDetail(mkEditId); toast('圈子已更新', 'ok');
      return;
    }
    var id = 'c-mk-' + Date.now();
    var priv = d.visibility === 'private';
    st.circles.push({
      id: id, name: name, desc: desc, province: prov, city: city, type: 'region',
      icon: d.icon, color: MK_COLORS[Math.floor(Math.random() * MK_COLORS.length)],
      members: 1, owner: 'me', createdAt: Date.now(), official: false,
      visibility: priv ? 'private' : 'public',
      joinMode: priv ? undefined : (d.joinMode || 'free'),
      code: priv ? genCircleCode() : undefined,
      codeLimit: priv ? CODE_LIMIT : undefined,
      codeUsed: priv ? 0 : undefined,
      codeExpireAt: priv ? (Date.now() + CODE_TTL) : undefined
    });
    if (st.myCircles.indexOf(id) < 0) st.myCircles.push(id);
    st.circleMembers.push({ circleId: id, userId: 'me', role: 'owner', joinedAt: Date.now(), muted: false });
    DB.save();
    var newId = id;
    closeOv('ov-circlemk'); mkEditId = null;
    renderCircles();
    toast('圈子创建成功，你已成为圈主', 'ok');
    openCircleDetail(newId);
    if (A && A.track) A.track('circle_create', { province: prov, city: city });
  }
  function mkDissolve(id) {
    var c = (S().circles || []).filter(function (x) { return x.id === id; })[0];
    confirmBox('解散圈子', '解散「' + (c ? c.name : '') + '」后圈子与其动态将被移除，不可恢复', function () {
      var st = S();
      st.circles = (st.circles || []).filter(function (x) { return x.id !== id; });
      st.circlePosts = (st.circlePosts || []).filter(function (p) { return p.circleId !== id; });
      st.myCircles = (st.myCircles || []).filter(function (x) { return x !== id; });
      st.circleMembers = (st.circleMembers || []).filter(function (m) { return m.circleId !== id; });
      st.circleApplies = (st.circleApplies || []).filter(function (a) { return a.circleId !== id; });
      DB.save();
      closeOv('ov-circledetail'); curCircleId = null;
      renderCircles();
      toast('圈子已解散', 'ok');
    }, '解散', '取消');
  }

  /* ================= 平台系统消息（v0.36） =================
     数据：S().sysMsgs（B 端推送 / 种子消息），用户侧只读 + 可标记已读 / 删除
     入口：我的页顶部安全横幅 + 宫格「系统消息」+ 导航栏铃铛 + 我的 Tab 红点 */
  function sysList() {
    var st = S();
    if (!st.sysMsgs) st.sysMsgs = [];
    return st.sysMsgs;
  }
  function sysUnread() {
    return sysList().filter(function (m) { return !m.read; }).length;
  }
  function sysUnreadOf(cat) {
    return sysList().filter(function (m) { return !m.read && m.cat === cat; }).length;
  }
  function sysMsgById(id) {
    return sysList().filter(function (m) { return m.id === id; })[0] || null;
  }
  /* v0.53：列表排序单一出口（置顶 → 级别 → 未读 → 时间），列表与我的页横幅共用，
     避免两处各自排序导致"横幅说的和点进去第一条不是同一条"。
     级别优先于时间是有意为之：昨天的诈骗预警比今天的一条普通公告更该被先看。 */
  var SYS_RANK = { urgent: 3, important: 2, normal: 1 };
  function sysCmp(a, b) {
    var pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    var la = SYS_RANK[a.level] || 1, lb = SYS_RANK[b.level] || 1;
    if (la !== lb) return lb - la;
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.ts - a.ts;
  }
  /* 排序：置顶 → 级别 → 未读 → 时间倒序（与主流 IM 的「重要优先」心智一致） */
  function sysSorted(cat) {
    var arr = sysList().filter(function (m) { return !cat || cat === 'all' || m.cat === cat; });
    return arr.slice().sort(sysCmp);
  }
  /* 是否接收平台消息（安全类默认开启，用户可在设置里关） */
  function sysOn() {
    var s = S().settings;
    return !s || s.sysmsg !== false;
  }
  function sysTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /* 未读角标：我的 Tab + 导航栏铃铛（单一出口，任何状态变化后统一刷新） */
  function renderSysBadge() {
    var n = sysUnread();
    var dot = $('#sysDot');
    if (dot) dot.style.display = n ? '' : 'none';
    var mb = $('#meBadge');
    if (mb) {
      if (n) { mb.style.display = ''; mb.textContent = n > 99 ? '99+' : n; }
      else { mb.style.display = 'none'; }
    }
  }

  function sysItemHtml(m) {
    var c = sysCat(m.cat), lv = SYS_LEVEL[m.level] || SYS_LEVEL.normal;
    return '<div class="sys-item' + (m.read ? '' : ' unread') + '" data-action="sys-open" data-id="' + esc(m.id) + '">' +
      '<div class="sys-ico" style="background:' + c.color + '1f;color:' + c.color + '">' + c.ico + '</div>' +
      '<div class="sys-main">' +
        '<div class="sys-t">' +
          (m.pinned ? '<span class="sys-pin">置顶</span>' : '') +
          (lv.t ? '<span class="sys-lv ' + lv.cls + '">' + lv.t + '</span>' : '') +
          esc(m.title) +
        '</div>' +
        '<div class="sys-s">' + esc(m.summary) + '</div>' +
        '<div class="sys-m">' + esc(m.from || SYS_FROM[m.cat] || '野遇') + ' · ' + c.t + ' · ' + timeLabel(m.ts) + '</div>' +
      '</div>' +
      (m.read ? '' : '<span class="sys-dot"></span>') +
      '<span class="chev">›</span>' +
    '</div>';
  }

  /* v0.53：列表按「置顶 / 其余」分组成卡片。
     弹窗下线后，系统消息是安全内容的唯一归宿 —— 必须让它自己建立起层级：
     置顶组独立成卡（带条目数），未读加左侧强调条 + 加粗标题，读过的弱化，
     否则 6 条同质列表看着就是一片灰，用户扫一眼抓不到"哪条必须先看"。 */
  function sysGroupHtml(list) {
    var pin = list.filter(function (m) { return m.pinned; });
    var rest = list.filter(function (m) { return !m.pinned; });
    var grp = function (label, arr) {
      if (!arr.length) return '';
      return '<div class="sys-grp">' +
        '<div class="sys-grp-h"><span>' + esc(label) + '</span><span class="sys-grp-n">' + arr.length + ' 条</span></div>' +
        '<div class="sys-grp-b">' + arr.map(sysItemHtml).join('') + '</div>' +
      '</div>';
    };
    return grp('📌 置顶', pin) + grp(pin.length ? '其余消息' : '全部消息', rest);
  }

  function renderSysMsg(cat) {
    sysCatFilter = cat || sysCatFilter || 'all';    var n = sysUnread();
    var list = sysSorted(sysCatFilter);
    var tabs = [{ k: 'all', t: '全部' }].concat(SYS_CATS).map(function (c) {
      var cnt = c.k === 'all' ? n : sysUnreadOf(c.k);
      return '<button class="subtab' + (sysCatFilter === c.k ? ' active' : '') + '" data-action="sys-tab" data-v="' + c.k + '">' +
        c.t + (cnt ? '<i class="st-n">' + (cnt > 99 ? '99+' : cnt) + '</i>' : '') + '</button>';
    }).join('');
    $('#sysTabs').innerHTML = tabs;
    /* 标签栏可横滑：切换分类时把选中项滚到可见位置；默认进页看「全部」，不做位移 */
    if (sysCatFilter && sysCatFilter !== 'all') {
      try {
        var act = $('#sysTabs .subtab.active');
        if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'center', block: 'nearest' });
      } catch (e) {}
    }
    /* v0.53：未读概览条 —— 弹窗下线后的"轻提醒"替代物：给出数量与优先级，
       但不遮挡内容、不需要用户当场做决定 */
    var sumBar = n
      ? '<div class="sys-sum"><span class="sys-sum-i">🔔</span>' +
          '<div class="sys-sum-t"><b>' + (n > 99 ? '99+' : n) + ' 条未读</b>' +
          '<small>带「紧急 / 重要」标记的请优先查看</small></div></div>'
      : '';
    $('#sysBody').innerHTML = list.length
      ? sumBar + sysGroupHtml(list) +
        '<div class="sys-foot">' +
          '<div class="sys-note">平台不会通过系统消息向你索要密码、验证码或要求转账。<br/>如收到可疑内容，请点消息内「举报诈骗/违规」。</div>' +
        '</div>'
      : emptyBlock('📭', '这里还没有消息', '平台公告与安全提醒会送到这里');
    var ra = $('#sysReadAll');
    if (ra) ra.style.display = n ? '' : 'none';
    openOv('ov-sysmsg');
    A.track('sysmsg_open', { unread: n, cat: sysCatFilter });
  }

  function openSysDetail(id) {
    var m = sysMsgById(id);
    if (!m) return;
    curSysId = id;
    if (!m.read) { m.read = true; DB.save(); renderSysBadge(); }
    var c = sysCat(m.cat), lv = SYS_LEVEL[m.level] || SYS_LEVEL.normal;
    var cta = m.cta || null;
    var body = (m.body || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    $('#sysDetailBody').innerHTML =
      '<div class="sys-detail">' +
        '<div class="sd-head">' +
          '<div class="sd-ico" style="background:' + c.color + '1f;color:' + c.color + '">' + c.ico + '</div>' +
          '<div class="sd-t">' + (lv.t ? '<span class="sys-lv ' + lv.cls + '">' + lv.t + '</span>' : '') + esc(m.title) + '</div>' +
          '<div class="sd-m">' + esc(m.from || SYS_FROM[m.cat] || '野遇') + ' · ' + sysTime(m.ts) + ' · ' + c.t + '</div>' +
        '</div>' +
        '<div class="sd-body">' + (body || '<p>' + esc(m.summary) + '</p>') + '</div>' +
        '<div class="sd-tip">本消息由平台系统发送，不会回复、也不会收集你的个人信息。</div>' +
      '</div>';
    $('#sysDetailFoot').innerHTML =
      '<button class="btn ghost" data-action="sys-report">举报诈骗/违规</button>' +
      (cta
        ? '<button class="btn" data-action="' + esc(cta.a) + '"' + (cta.id ? ' data-id="' + esc(cta.id) + '"' : '') + '>' + esc(cta.t) + '</button>'
        : '<button class="btn" data-action="sys-back">知道了</button>');
    openOv('ov-sysdetail');
    A.track('sysmsg_read', { id: id, cat: m.cat, level: m.level });
  }

  function sysBack() {
    closeOv('ov-sysdetail');
    curSysId = null;
    renderSysMsg();
    renderMe();
  }
  function sysReadAll() {
    var n = sysUnread();
    if (!n) { toast('已经全部读完了', 'ok'); return; }
    sysList().forEach(function (m) { m.read = true; });
    DB.save();
    renderSysMsg(); renderMe();
    toast('已将 ' + n + ' 条消息标为已读', 'ok');
    A.track('sysmsg_read_all', { n: n });
  }
  function sysDeleteCur() {
    var m = sysMsgById(curSysId);
    if (!m) return;
    confirmBox('删除这条消息？', '删除后仅在本机移除，不影响其他用户收到的内容。', function () {
      S().sysMsgs = sysList().filter(function (x) { return x.id !== m.id; });
      DB.save();
      closeOv('ov-sysdetail'); curSysId = null;
      renderSysMsg(); renderMe();
      toast('已删除该消息', 'ok');
    }, '删除', '取消');
  }
  function sysReport() {
    toast('已记录，安全中心会在 24 小时内核实', 'ok');
    A.track('sysmsg_report', { id: curSysId });
  }
  /* ================= v0.60 图标库（内联 SVG，24×24 / stroke 1.7 统一）=================
     为什么单独抽一层：原先图标散写在 HTML 里，stroke-width 出现了 1.7 / 1.8 / 2.4 / 3 / 5
     五种线宽，同一页面里并排看就会有「粗细不一」的廉价感 —— 这是"像 demo"最典型的信号。
     这里一次性把线宽、端点、转角、viewBox 全部收口，后续新增图标只准走这张表。
     图标是 UI 语言，不是装饰：同一套线宽 = 同一个产品。 */
  var ICONS = {
    coin:  '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6v8.8M14.4 9.6c-.6-.8-1.5-1.2-2.4-1.2-1.4 0-2.4.8-2.4 1.9 0 2.6 5 1.3 5 3.9 0 1.2-1.1 2-2.6 2-.9 0-1.8-.4-2.4-1.2"/>',
    crown: '<path d="M4 16.4h16M4.6 16.4 3.4 7.2l4.4 3.4L12 4.6l4.2 6 4.4-3.4-1.2 9.2"/>',
    /* v0.73 SVIP 钻石：与 VIP 皇冠区分层级，两者都是 24 viewBox / 1.7 线宽 */
    gem:   '<path d="M6.4 8.2h11.2l2.4 4.1L12 20.2 3.6 12.3l2.8-4.1Z"/><path d="M3.6 12.3h16.8M8.6 8.2 12 12.3M15.4 8.2 12 12.3"/>',
    num:   '<path d="M9.4 6.6 7.6 17.4M16.6 6.6l-1.8 10.8M5.4 10.2h7.2M11.8 13.8h7.2"/>',
    bell:  '<path d="M12 3.6a4.8 4.8 0 0 0-4.8 4.8c0 3.6-1.2 4.6-1.2 4.6h12s-1.2-1-1.2-4.6A4.8 4.8 0 0 0 12 3.6Z"/><path d="M10.2 15a1.8 1.8 0 0 0 3.6 0"/>',
    eye:   '<path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    hi:    '<path d="M13.4 10.6 12.8 6l4.2 4M7.4 11.6V15l-2.6 2.6M12.4 8.2 6.2 14.4l-.8 3.4 3.4-.8 6.2-6.2"/>',
    post:  '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2.4"/><path d="M3.6 9.4h16.8M8 4.6v4.8"/><circle cx="12" cy="14" r="2.2"/>',
    order: '<path d="M6.4 3.6h11.2v16.8L12 17.8l-5.6 2.6V3.6Z"/><path d="M9.4 8.6h5.2M9.4 12h5.2"/>',
    group: '<circle cx="8.4" cy="8.6" r="3"/><path d="M3.2 17.4c0-2.8 2.4-4.6 5.2-4.6s5.2 1.8 5.2 4.6"/><path d="M15 6.2a3 3 0 0 1 0 5.6M16.6 13.2c1.9.5 3.2 2 3.2 4.2"/>',
    circle:'<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6c2.4 2.4 3.6 5.2 3.6 8.4s-1.2 6-3.6 8.4c-2.4-2.4-3.6-5.2-3.6-8.4S9.6 6 12 3.6Z"/><path d="M3.8 12h16.4"/>',
    qr:    '<rect x="3.6" y="3.6" width="6.4" height="6.4" rx="1.4"/><rect x="14" y="3.6" width="6.4" height="6.4" rx="1.4"/><rect x="3.6" y="14" width="6.4" height="6.4" rx="1.4"/><path d="M14 14h3v3h-3zM19.4 14v2M14 19.4h2M19.4 19.4v.6"/>',
    /* v0.61 二维码页四枚操作图标（保存 / 分享 / 复制 / 扫一扫）与隐私锁 */
    save:  '<path d="M12 3.8v10.4"/><path d="M8.2 10.2 12 14l3.8-3.8"/><path d="M4.6 15.2v3.2c0 .9.7 1.6 1.6 1.6h11.6c.9 0 1.6-.7 1.6-1.6v-3.2"/>',
    share: '<path d="M12 15.4V4.2"/><path d="M8.4 7.6 12 4l3.6 3.6"/><path d="M6 10.4v7.8c0 .9.7 1.6 1.6 1.6h8.8c.9 0 1.6-.7 1.6-1.6v-7.8"/>',
    copy:  '<rect x="9.2" y="9.2" width="10.2" height="10.2" rx="2.2"/><path d="M15 6.4V6c0-1.1-.9-2-2-2H5.8c-1.1 0-2 .9-2 2v7.4c0 1.1.9 2 2 2h.4"/>',
    scan:  '<path d="M4 8.8V6.4c0-1.2 1-2.2 2.2-2.2h2.4M20 8.8V6.4c0-1.2-1-2.2-2.2-2.2h-2.4M4 15.2v2.4c0 1.2 1 2.2 2.2 2.2h2.4M20 15.2v2.4c0 1.2-1 2.2-2.2 2.2h-2.4"/><path d="M4 12h16"/>',
    lock:  '<rect x="5" y="10.6" width="14" height="9.2" rx="2.4"/><path d="M8.4 10.6V8.2a3.6 3.6 0 0 1 7.2 0v2.4"/>'
  };
  function svgIcon(k, cls) {
    var d = ICONS[k];
    if (!d) return '';
    return '<svg class="ico ' + (cls || '') + '" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /* ================= 我的（v0.60 重排版）=================
     重排的原因：这条页面之前是「横幅 + 资产条 + 系统消息独占一组 + 权益 + 宫格 + 更多」
     共 7 个区块，其中系统消息既有一条顶部横幅、又独占一整组列表行 —— 同一条内容
     在两屏之内出现三次。用户把它当成了「又弹出来一个框」，说明重复触达已经
     反过来造成压迫感。

     v0.60 的两条决定：
     ① 删掉顶部横幅。防诈骗内容不消失，收敛到「铃铛红点 + 服务区首行未读角标 +
        系统消息内置顶」三处；其中两处在页面内常驻可见，仍然满足「必须被看见」。
     ② 区块按「身份 → 资产 → 内容 → 服务 → 系统」五级重排，同级只出现一次。
        判断标准是：每一屏只回答一个问题（我是谁 / 我有什么 / 我发过什么 /
        我能用什么 / 怎么设置），不再让同一类内容跨区块重复。 */
  function renderMe() {
    var me = S().me;
    var mine = S().moments.filter(function (m) { return m.userId === 'me'; }).length;
    var vip = isVip();
    var vipDays = vip ? vipLeftDays() : 0;
    var visN = (S().visitors || []).filter(function (v) { return !isBlocked(v.userId); }).length;
    var sysN = sysUnread();
    var myCir = (S().myCircles || []).length;
    var nice = niceInfo(me);            // v0.71：我的靓号（null = 普通随机号）

    // ===== L0 身份卡 =====
    /* 统计条：关注/粉丝/动态是「我在这的产品里留下了什么」，比装饰性元素更有信息量。
       动态数可点（有承载页）；关注/粉丝暂无独立页，因此做成纯展示，不给假的可点感。 */
    /* v0.77：关注 / 粉丝可点（对齐 Flutter 独立列表页），动态仍可点 */
    var stats =
      '<div class="me-stats">' +
        '<div class="me-st" data-action="open-following"><b>' + me.following.length + '</b><small>关注</small></div>' +
        '<div class="me-st" data-action="open-followers"><b>' + me.followers.length + '</b><small>粉丝</small></div>' +
        '<div class="me-st" data-action="mymoments"><b>' + mine + '</b><small>动态</small></div>' +
      '</div>';
    var hero =
      '<div class="me-hero">' +
        '<div class="me-head">' +
          '<div class="me-avatar" data-action="my-qr" title="我的二维码">' + avatarHtml(me, 'md') + '</div>' +
          '<div class="me-h-text">' +
            /* v0.73：昵称单独包一层 —— flex 行里裸文本节点压不下，长昵称会把后面的
               徽章挤到容器外（实测 10 字昵称 + 两枚徽章会溢出）。现在昵称自己 ellipsis，
               徽章 flex:0 0 auto 永不位移。 */
            '<div class="me-name"><span class="me-nm-txt">' + esc(me.name) + '</span>' + identityBadges(me) + '</div>' +
            /* v0.71 靓号标识：号码是靓号时，号码本身高亮 + 后面挂稀有度标签（至尊/稀有/…）。
               普通号保持朴素一行，不给假装饰。 */
            '<div class="me-sub">' + (nice
              ? '野遇号 <span class="me-id-num">' + esc(nice.num) + '</span>' + idTagHtml(nice)
              : '野遇号 ' + esc(String(me.yeyuId).replace('野遇号：', ''))) + '</div>' +
            (me.sign ? '<div class="me-sign">' + esc(me.sign) + '</div>' : '') +
          '</div>' +
          /* v0.60：二维码从宫格移出后必须在身份卡补一个可见入口 —— 只靠「点头像」是隐形交互，
             用户找不到就等于没有。
             v0.62：删掉这里并排的「编辑资料 ›」胶囊 —— 顶栏右上角已有铅笔图标，
             同一页两处入口是重复触达，身份卡右上角只留二维码这一个动作。 */
          '<button class="me-icobtn" data-action="my-qr" title="我的二维码">' + svgIcon('qr') + '</button>' +
        '</div>' +
        stats +
      '</div>';

    // ===== L1 资产条：野遇币 / VIP / 靓号（平台最核心的三项资产，一级）=====
    var coinCell =
      '<div class="mc" data-action="wallet">' +
        '<div class="mc-ico mc-coin">' + svgIcon('coin') + '</div>' +
        '<div class="mc-v">' + me.coins.toLocaleString() + '</div>' +
        '<div class="mc-l">野遇币 · 去充值 ›</div>' +
      '</div>';
    var vipCell =
      '<div class="mc" data-action="vip">' +
        '<div class="mc-ico mc-vip">' + svgIcon('crown') + '</div>' +
        '<div class="mc-v ' + (vip ? 'on' : '') + '">' + (vip ? 'VIP' : '未开通') + '</div>' +
        '<div class="mc-l">' + (vip ? ('剩 ' + vipDays + ' 天') : '会员中心 ›') + '</div>' +
      '</div>';
    var niceCell =
      '<div class="mc" data-action="niceid">' +
        '<div class="mc-ico mc-nice">' + svgIcon('num') + '</div>' +
        '<div class="mc-v ' + (nice ? 'on' : '') + '">' + (nice ? '专属' : '未设置') + '</div>' +
        '<div class="mc-l">' + (nice ? ('专属靓号 ' + esc(nice.num)) : '靓号商城 ›') + '</div>' +
      '</div>';

    // ===== L2 我的内容：我生产过的东西（宫格，二级）=====
    var grid =
      '<div class="me-grid">' +
        gridItem('post', '我的动态', 'mymoments', mine ? mine + '' : '', 'g-post') +
        gridItem('order', '我的订单', 'orders', '', 'g-order') +
        gridItem('group', '我的群聊', 'mygroups', countGroups() ? countGroups() + ' 个' : '', 'g-group') +
        gridItem('circle', '我的圈子', 'mycircles', myCir ? myCir + ' 个' : '', 'g-circle') +
      '</div>';

    // ===== L3 服务：平台能力（列表，三级）=====
    /* 系统消息放在这一组第一行：它不是「弹窗提醒」，而是和谁看过我、打招呼同级的服务入口。
       未读数用角标表达，紧急内容靠角标+标题摘要传递，不再靠整条横幅压迫。 */
    var sysRow =
      '<div class="row" data-action="sysmsg">' +
        '<div class="mb-ico mb-sys">' + svgIcon('bell') + '</div>' +
        '<div class="row-title"><b>系统消息' + (sysN ? '<span class="sys-badge">' + (sysN > 99 ? '99+' : sysN) + '</span>' : '') + '</b>' +
          '<small>' + (sysN
            ? (sysN + ' 条未读 · ' + esc((sysTopAny() || {}).title || '点击查看'))
            : (sysList().length + ' 条 · 安全提醒 / 平台公告')) + '</small></div>' +
        '<span class="chev">›</span>' +
      '</div>';
    /* v0.77：通知中心入口（对齐 Flutter 通知聚合页，与「系统消息」互补） */
    var notifyRow =
      '<div class="row" data-action="notifications">' +
        '<div class="mb-ico mb-sys">' + svgIcon('bell') + '</div>' +
        '<div class="row-title"><b>通知' + (notiUnread() ? '<span class="sys-badge">' + (notiUnread() > 99 ? '99+' : notiUnread()) + '</span>' : '') + '</b>' +
          '<small>评论 · 点赞 · 关注 · @提及 · 系统</small></div>' +
        '<span class="chev">›</span>' +
      '</div>';
    var services =
      '<div class="me-sec"><div class="me-sec-h"><span>服务</span></div>' +
        '<div class="list">' + notifyRow + sysRow +
          '<div class="row" data-action="visitors">' +
            '<div class="mb-ico mb-see">' + svgIcon('eye') + '</div>' +
            '<div class="row-title"><b>谁看过我</b><small>' + (vip ? (visN + ' 人到访过') : (visN + ' 人 · VIP 可查看')) + '</small></div>' +
            '<span class="chev">›</span>' +
          '</div>' +
          '<div class="row" data-action="vip">' +
            '<div class="mb-ico mb-hi">' + svgIcon('hi') + '</div>' +
            '<div class="row-title"><b>打招呼</b><small>' + (vip ? 'VIP 无限次' : ('今日剩 ' + greetLeft() + '/' + En.value('chat.greet') + ' 次')) + '</small></div>' +
            '<span class="chev">›</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ===== L4 更多（四级）=====
    var more =
      '<div class="me-sec"><div class="me-sec-h"><span>更多</span></div>' +
        '<div class="list">' +
          row('⚙️', '设置', '通知 · 隐私 · 推荐', 'settings') +
          /* v0.78：对齐 Flutter —— 更多区补「意见反馈」入口（触发已有的反馈弹窗） */
          row('💬', '意见反馈', '告诉我们你的建议', 'feedback') +
        '</div>' +
      '</div>';

    $('#meBody').innerHTML =
      hero +
      '<div class="me-core">' + coinCell + vipCell + niceCell + '</div>' +
      '<div class="me-sec"><div class="me-sec-h"><span>我的内容</span></div>' + grid + '</div>' +
      services + more +
      '';
    renderSysBadge();
  }
  /* 置顶或最近一条未读平台消息（我的页系统消息行的副标题用；横幅已下线，此处只取标题） */
  function sysTopAny() {
    var l = sysList();
    var un = l.filter(function (m) { return !m.read; });
    return (un.length ? un : l).slice().sort(sysCmp)[0] || null;
  }
  /* v0.60：宫格图标改走 svgIcon（统一线宽）；cls 同时决定渐变底色与角标配色 */
  function gridItem(ico, title, act, badge, cls) {
    var inner = ICONS[ico] ? svgIcon(ico) : ico;    // 传了图标名走 SVG，传字符串则当 emoji 兜底
    return '<div class="mg-item' + (act ? '" data-action="' + act + '"' : '"') + '>' +
      '<div class="mg-ico ' + (cls || '') + '">' + inner + '</div><div class="mg-t">' + title + '</div>' +
      (badge ? '<span class="mg-badge">' + badge + '</span>' : '') + '</div>';
  }
  function row(ico, title, sub, act) {
    return '<div class="row" data-action="' + act + '">' +
      '<div class="avatar sm" style="background:var(--n-100);font-size:18px">' + ico + '</div>' +
      '<div class="row-title"><b>' + title + '</b><small>' + esc(sub) + '</small></div><span class="chev">›</span></div>';
  }

  /* ================= 聊天 ================= */
  /* v0.22：会话首次打开展示 240ms 骨架屏（模拟历史消息拉取，骨架与消息同构零跳动）；
     同一会话二次打开直接出内容；定时器内二次校验 curConv，防止快速切换时串屏 */
  var chatSkelDone = {};
  function openChat(id) {
    var c = conv(id); if (!c) return;
    /* v0.52：注销/封禁的号不能进入会话 —— 与其让用户发一条永远到不了的消息，
       不如在入口就拦住并说明原因。 */
    if (c.type === 'single' && isGone(c.userId)) {
      toast(userStatus(c.userId) === 'banned' ? '该账号已被封禁，无法发送消息' : '该用户已注销，无法发送消息', 'err');
      return;
    }
    c.unread = 0; DB.save();
    curConv = id;
    curQuote = null;
    renderChatHead(c);
    renderAnnBar(c);
    $('#quoteBar').style.display = 'none';
    $('#extPanel').classList.remove('show');
    $('#emojiPanel').classList.remove('show');
    /* 恢复草稿 */
    var dft = (S().drafts || {})[c.id] || '';
    $('#chatInput').value = dft;
    toggleSendBtn();
    if (!chatSkelDone[id] && c.messages.length) {
      chatSkelDone[id] = true;
      $('#chatWrap').innerHTML = skeletonMsgs(Math.min(6, 2 + c.messages.length));
      setTimeout(function () { if (curConv === id) renderChat(); }, 240);
    } else {
      renderChat();
    }
    openOv('ov-chat');
    renderChats();
    A.track('chat_open', { conv: c.id, type: c.type });
    var w = $('#chatWrap'); w.scrollTop = w.scrollHeight;
  }
  function renderChatHead(c) {
    /* v0.19：单聊标题后挂对方 VIP 铭牌 */
    $('#chatTitle').innerHTML = esc(c.title) + ((c.type === 'single' && c.userId) ? vipTag(U(c.userId)) : '');
    $('#atBtn').style.display = (c.type === 'group' && c.members.indexOf('me') >= 0) ? '' : 'none';
    if (c.type === 'group') {
      var inIt = c.members.indexOf('me') >= 0;
      $('#chatSub').innerHTML = c.members.length + ' 位成员' + (inIt ? ' · ' + roleText(roleOf(c, 'me')) : ' · 未加入');
    } else if (c.type === 'system') $('#chatSub').textContent = '官方';
    else { var u = U(c.userId); $('#chatSub').textContent = u.online ? '在线' : '离线 · ' + u.city; }
  }
  function renderAnnBar(c) {
    var bar = $('#chatAnn');
    var show = c.type === 'group' && c.announce && c.members.indexOf('me') >= 0;
    bar.style.display = show ? '' : 'none';
    if (show) bar.innerHTML = '<span>📢</span><span class="ann-tx">' + esc(c.announce) + '</span><span class="chev">›</span>';
  }
  /* ---- 消息体：按 type 渲染不同形态 ---- */
  function bodyHtml(m, c) {
    var t = m.type || 'text';
    if (t === 'img') {
      return '<div class="bubble-img ' + (m.grad || 'g1') + '">' + (m.emoji || '🏕️') + '</div>';
    }
    if (t === 'loc') {
      return '<div class="loc-msg"><b>📍 ' + esc(m.loc) + '</b><small>' + esc(m.addr || '') + '</small>' +
        '<div class="loc-map">地图位置</div></div>';
    }
    if (t === 'card') {
      var cu = U(m.cardUid);
      /* v0.54：名片是「转述给别人看」的东西，必须显示昵称而不是我给 TA 的备注 ——
         备注可能叫「318阿宽」「前房东」，一转手就把私人标签泄露给了第三方。
         同时让整张卡片可点：收到名片的人点开即可进主页 → 陌生人可直接「添加好友」。 */
      var outerName = esc(cu.rawName || cu.name);
      return '<div class="card-msg" data-action="open-profile" data-id="' + esc(m.cardUid) + '">' + avatarHtml(cu, 'sm') +
        '<div class="ct"><b>' + outerName + '</b><small>' + esc(cu.city || '') + ' · ' + esc(cu.sign || '') + '</small></div>' +
        '<span class="tag brand">名片</span></div>';
    }
    if (t === 'voice') {
      var bars = '';
      for (var i = 0; i < 14; i++) {
        bars += '<i style="height:' + (5 + Math.abs(Math.sin(i * 1.7 + (m.dur || 3))) * 13).toFixed(0) + 'px"></i>';
      }
      return '<div class="voice-msg"><span>▶</span><span class="wave">' + bars + '</span>' +
        '<span class="dur">' + (m.dur || 3) + '″</span></div>';
    }
    return esc(m.text).replace(/@([^\s@:：,，。]{1,12})/g, function (s, n) {
      var hit = (c.members || []).some(function (id) { return U(id).name === n; });
      return hit ? '<span class="at">@' + n + '</span>' : s;
    });
  }
  function renderChat() {
    var c = conv(curConv); if (!c) return;
    var notJoined = c.type === 'group' && c.members.indexOf('me') < 0;
    var html = notJoined ? '<div class="join-bar"><span>你还不是群成员，加入后才能发言</span>' +
      '<button class="btn sm" data-action="join-group">加入群聊</button></div>' : '';
    var prev = 0;
    c.messages.forEach(function (m) {
      /* from==='sys' 兼容早期数据 */
      if (m.type === 'sys' || m.from === 'sys') {
        html += '<div class="sys-msg"><span>' + esc(m.text) + '</span></div>';
        return;
      }
      if (!prev || m.ts - prev > 600000) {
        html += '<div class="time-sep"><span>' + timeLabel(m.ts) + '</span></div>';
      }
      prev = m.ts;
      if (m.recalled) {
        var who = m.from === 'me' ? '你' : U(m.from).name;
        html += '<div class="sys-recall"><span>⛔ ' + esc(who) + '撤回了一条消息</span></div>';
        return;
      }
      var me = m.from === 'me';
      var u = me ? S().me : U(m.from);
      var who2 = (!me && c.type === 'group') ? '<div class="who">' + nameWithBadge(c, m.from) + '</div>' : '';
      var quote = '';
      if (m.quote) {
        var qn = m.quote.from === 'me' ? '我' : U(m.quote.from).name;
        quote = '<div class="quote">' + esc(qn) + '：' + esc(m.quote.text || '[图片]') + '</div>';
      }
      var state = me && m.status ? '<div class="msg-state">' +
        (m.status === 'sending' ? '发送中…' : (m.status === 'sent' ? '已发送' : '已读')) + '</div>' : '';
      html += '<div class="msg' + (me ? ' me' : '') + '">' +
        '<span data-action="open-profile" data-id="' + (me ? 'me' : m.from) + '">' + avatarHtml(u, 'sm') + '</span>' +
        '<div class="col">' + who2 + '<div class="bubble' + (m.type && m.type !== 'text' ? ' rich' : '') + '" data-id="' + m.id + '">' +
        quote + bodyHtml(m, c) + '</div>' +
        '<button class="bubble-more" data-action="msg-act" data-id="' + m.id + '" title="消息操作" aria-label="消息操作">⋯</button>' +
        state + '</div></div>';
    });
    if (!localStorage.getItem('yeyu_lp_tip') && !$('#chatTip')) {
      html = '<div class="chat-tip" id="chatTip">💡 长按消息或点 <b>⋯</b> 可操作：引用 / 复制 / 转发 / 删除' +
        '<button data-action="tip-close">知道了</button></div>' + html;
    }
    $('#chatWrap').innerHTML = html || emptyBlock('💬', '还没有消息', '发条消息，打破沉默', ['focus-input', '说点什么']);
    var w = $('#chatWrap'); w.scrollTop = w.scrollHeight;
  }
  function pushMsg(cid, from, text, opt) {
    var c = conv(cid); if (!c) return null;
    var m = { id: 'm' + Date.now() + Math.random().toString(36).slice(2, 5), from: from, text: text, ts: Date.now() };
    if (opt) for (var k in opt) m[k] = opt[k];
    c.messages.push(m);
    c.updatedAt = Date.now();
    if (curConv !== cid || !$('#ov-chat').classList.contains('show')) c.unread = (c.unread || 0) + 1;
    DB.save();
    if (curConv === cid) renderChat();
    renderChats();
    return m;
  }
  /* ---- 发送（统一入口，支持富消息） ---- */
  function send(text, opt) {
    var c = conv(curConv); if (!c) return;
    opt = opt || {};
    text = (text || '').trim();
    if (!text && !opt.type) return;
    if (c.type === 'group' && c.members.indexOf('me') < 0) return toast('请先加入群聊', 'err');
    if (c.type === 'single' && isBlocked(c.userId)) return toast('你已拉黑对方，无法发送消息', 'err');
    var msg = {
      id: 'ms' + Date.now() + Math.random().toString(36).slice(2, 4),
      from: 'me', text: text, ts: Date.now(),
      type: opt.type || 'text', status: 'sending'
    };
    for (var k in opt) if (k !== 'type') msg[k] = opt[k];
    if (curQuote) { msg.quote = { from: curQuote.from, text: curQuote.text }; }
    c.messages.push(msg);
    c.updatedAt = Date.now();
    DB.save(); renderChat(); renderChats();
    A.track('message_send', { conv: c.id, type: c.type, mtype: msg.type, quoted: !!msg.quote });
    clearQuote();
    $('#chatInput').value = '';
    saveDraft('');
    toggleSendBtn();
    $('#extPanel').classList.remove('show');
    /* 发送中 → 已发送 → 已读（单聊且有回应时） */
    setTimeout(function () {
      msg.status = 'sent'; DB.save(); if (curConv === c.id) renderChat();
      setTimeout(function () {
        if (c.type === 'single' && U(c.userId).online) { msg.status = 'read'; DB.save(); if (curConv === c.id) renderChat(); }
      }, 1200);
    }, 420);
    if (msg.type === 'text') scheduleReply(c, text, msg);
  }
  function saveDraft(v) {
    if (!curConv) return;
    S().drafts = S().drafts || {};
    if (v) S().drafts[curConv] = v; else delete S().drafts[curConv];
    DB.save();
  }
  function toggleSendBtn() {
    var has = ($('#chatInput').value || '').trim().length > 0;
    $('#sendBtn').style.display = has ? '' : 'none';
    $('#plusBtn').style.display = has ? 'none' : '';
  }
  function scheduleReply(c, userText) {
    var others = c.members.filter(function (m) { return m !== 'me'; });
    if (!others.length || c.type === 'system') return;
    var delay = 900 + Math.random() * 1400;
    setTyping(curConv === c.id, true);
    setTimeout(function () {
      /* 群聊里被 @ 的人优先回你；未 @ 则随机一位 */
      var atUid = null;
      if (c.type === 'group') {
        others.forEach(function (uid) {
          if ((userText || '').indexOf('@' + U(uid).name) >= 0) atUid = uid;
        });
      }
      var from = atUid || others[Math.floor(Math.random() * others.length)];
      var ask = /[?？吗呢]|能不能|要不要/.test(userText || '');
      var pool = ask ? ANSWERS.concat(REPLIES) : REPLIES;
      var text = (atUid ? '@我 在的，' : '') + pool[Math.floor(Math.random() * pool.length)];
      pushMsg(c.id, from, text);
      setTyping(curConv === c.id, false);
      if (c.type === 'group' && Math.random() < 0.4) {
        setTimeout(function () {
          var f2 = others.filter(function (x) { return x !== from; });
          if (!f2.length) return;
          pushMsg(c.id, f2[Math.floor(Math.random() * f2.length)], REPLIES[Math.floor(Math.random() * REPLIES.length)]);
        }, 1600 + Math.random() * 1200);
      }
    }, delay);
  }
  function setTyping(isOpen, on) {
    if (!isOpen) return;
    var c = conv(curConv); if (!c) return;
    if (on) $('#chatSub').innerHTML = '<span class="typing">对方正在输入…</span>';
    else renderChatHead(c);
  }
  function ensureSingle(uid) {
    var c = S().conversations.filter(function (x) { return x.type === 'single' && x.userId === uid; })[0];
    if (c) return c;
    /* v0.54：id 必须带随机尾。原实现用 'c'+Date.now()，同一毫秒内连续触发
       （如一次给多位好友推荐名片 → 连开多个新会话）会生成重复 id，
       conv(id) 又只取首个匹配，消息会串到别人的会话里。 */
    c = { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 5), type: 'single', userId: uid, title: U(uid).name, members: ['me', uid], unread: 0, updatedAt: Date.now(), messages: [] };
    S().conversations.push(c); DB.save();
    return c;
  }
  /* ---- 破冰话术（验证 H1 的关键变量）---- */
  function sharedTags(uid) {
    var u = U(uid);
    return (u.tags || []).filter(function (t) { return S().me.tags.indexOf(t) >= 0; });
  }
  var OPENERS = [
    { k:'invite', ico:'📅', t:'邀约型', p:0.85, make: function (u) { return '你也玩' + (u.tags[0] || '户外') + '？周末有安排吗，求带一个'; } },
    { k:'local',  ico:'📍', t:'同城型', p:0.70, make: function (u) { return '看到你也在' + u.city + '，同好握手 🤝'; } },
    { k:'shared', ico:'🤝', t:'共同兴趣型', p:0.95, make: function (u) {
        var s = sharedTags(u.id);
        return s.length ? '我们都在玩' + s.join('·') + '，聊聊？' : '你发的动态我看了，很有意思，能请教下吗？';
      } },
    { k:'custom', ico:'✍️', t:'自定义', p:0.80, make: function () { return ''; } }
  ];
  /* ---- VIP 权益①：每日打招呼限额（非 VIP 限量，VIP 无限）---- */
  /* v0.33：GREET_LIMIT 已上收至 ENTITLEMENTS['chat.greet'].pol.free，此处不再重复定义 */
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function greetUsed() { var g = S().greetLog || {}; return g[todayKey()] || 0; }
  function greetLeft() { return En.can('chat.greet').left; }
  function incGreet() {
    var st = S(); st.greetLog = st.greetLog || {};
    var k = todayKey(); st.greetLog[k] = (st.greetLog[k] || 0) + 1;
    DB.save();
  }
  function greetBlocked() {
    var dec = En.can('chat.greet');
    if (dec.allowed) return false;
    paywall(dec, {
      title: '今日打招呼次数已用完',
      body: '免费用户每天可主动打招呼 ' + dec.cap + ' 次（陌生人社交防骚扰策略）。VIP 解锁无限打招呼。'
    });
    return true;
  }

  function openGreet(uid, source) {
    if (isBlocked(uid)) return toast('你已拉黑对方，无法打招呼', 'err');
    if (greetBlocked()) return;
    curGreetUid = uid; greetChoice = 'invite';
    var u = U(uid), sh = sharedTags(uid);
    var gl = greetLeft();
    $('#greetHint').innerHTML = '打给 <b>' + esc(u.name) + '</b> · ' + esc(u.city) +
      (sh.length ? ' · <span style="color:var(--tint-orange-fg)">共同兴趣：' + esc(sh.join('、')) + '</span>' : '') +
      '<br/><span style="font-size:var(--fs-12);color:' + (isVip() ? 'var(--brand-600)' : 'var(--sub)') + '">' +
      (gl === Infinity ? '<span class="gh-vip">' + svgIcon('crown', 'ti') + 'VIP 无限打招呼</span>' : ('今日剩余 ' + gl + '/' + En.value('chat.greet') + ' 次')) + '</span>';
    $('#greetOpts').innerHTML = OPENERS.filter(function (o) { return o.k !== 'custom'; }).map(function (o) {
      return '<div class="greet-opt' + (greetChoice === o.k ? ' on' : '') + '" data-action="greet-opt" data-v="' + o.k + '">' +
        '<span class="gico">' + o.ico + '</span><div class="gt">' + esc(o.make(u)) +
        '<div class="gr">' + o.t + '</div></div></div>';
    }).join('');
    $('#greetCustom').value = '';
    $('#ov-greet').classList.add('show');
    A.track('greet_sheet_open', { user: uid, source: source || 'plaza' });
  }
  function sendGreet() {
    var uid = curGreetUid; if (!uid) return;
    var u = U(uid);
    var text = ($('#greetCustom').value || '').trim();
    var op;
    if (text) op = OPENERS.filter(function (o) { return o.k === 'custom'; })[0];
    else {
      op = OPENERS.filter(function (o) { return o.k === greetChoice; })[0];
      if (!op) return toast('先选一句开场白', 'err');
      text = op.make(u);
    }
    var c = ensureSingle(uid);
    pushMsg(c.id, 'me', text);
    c.unread = 0; incGreet(); DB.save();
    A.track('greet', { user: uid, opener: op.k, vip: isVip() });
    $('#ov-greet').classList.remove('show');
    $('#greetCustom').value = '';
    openChat(c.id);
    toast('已发送 · ' + op.t, 'ok');
    /* v0.76 移除：原「按开场白概率自动回复」。回应与否由真人决定；
       概率模拟是 H1 实验变量，不是业务能力，且会让人误以为对方真的回了。 */
  }

  /* ================= 个人主页 ================= */
  /* ---- VIP 权益②：谁看过我 ---- */
  function addVisitor(uid) {
    var st = S();
    st.visitors = (st.visitors || []).filter(function (v) { return v.userId !== uid; });
    st.visitors.unshift({ userId: uid, ts: Date.now() });
    st.visitors = st.visitors.slice(0, 50);
  }
  function renderVisitors() {
    var st = S();
    var vdEn = En.can('expo.visitorDetail');      // v0.33：改走统一能力模型
    var vip = vdEn.allowed;
    var list = (st.visitors || []).filter(function (v) { return !isBlocked(v.userId); });
    var html = vip
      ? '<p class="bl-tip">' + svgIcon('crown', 'ti') + 'VIP 特权：完整访客名单与到访时间。</p>' +
        (list.length ? list.map(function (v) {
          var u = U(v.userId);
          return '<div class="row" data-action="open-profile" data-id="' + u.id + '">' + avatarHtml(u, 'sm', u.online) +
            '<div class="row-title"><b>' + esc(u.name) + identityBadges(u) + '</b>' +
            '<small>' + esc(u.city) + ' · ' + esc(u.sign || '') + '</small></div>' +
            '<div class="row-side">' + timeLabel(v.ts) + '</div><span class="chev">›</span></div>';
        }).join('') : emptyBlock('👀', '还没有访客', '多发动态，让更多人看到你'))
      : '<div class="vst-lock">' +
          '<div class="vst-ico">' + svgIcon('crown') + '</div>' +
          '<div class="vst-t">开通 VIP 查看完整访客</div>' +
          '<div class="vst-d">近 ' + list.length + ' 人到访过你的主页。VIP 可查看是谁、以及到访时间。</div>' +
          '<div class="vst-mask">' + list.slice(0, 6).map(function (v) {
            var u = U(v.userId);
            return '<div class="vst-blur">' + avatarHtml(u, 'sm') +
              '<div class="row-title"><b>' + esc(u.name.replace(/.$/, '＊')) + '</b><small>' + esc(u.city) + '</small></div></div>';
          }).join('') + '</div>' +
          '<button class="btn accent block" data-action="vip" style="margin-top:14px">' + svgIcon('crown', 'bi') + '开通 VIP 查看</button>' +
        '</div>';
    $('#visitorBody').innerHTML = html;
    openOv('ov-visitors');
    A.track('visitors_view', { vip: vip, n: list.length });
  }

  /* v0.33：隐身浏览由「免费设置开关」升级为 SVIP 独占能力。
     存量用户（migrate 时已开启且非 SVIP）享有 30 天豁免期，到期后自然回落，
     避免硬切换带来的「剥夺感」投诉。这是 S1-3 收回策略的保守执行方式。 */
  function stealthActive() {
    var st = S();
    if (st.stealthGraceUntil && st.stealthGraceUntil > Date.now()) return true;
    return En.can('privacy.stealth').allowed;
  }
  /* 豁免期剩余天数（0 = 无豁免） */
  function stealthGrace() {
    var t = S().stealthGraceUntil || 0;
    return t > Date.now() ? Math.ceil((t - Date.now()) / 86400000) : 0;
  }
  function openProfile(uid) {
    if (uid === 'me') { switchTab('me'); return; }
    curProfile = uid;
    renderProfile(uid);
    openOv('ov-profile');
    A.track('profile_view', { user: uid, friend: S().friends.indexOf(uid) >= 0, status: userStatus(uid) });
    // 隐身浏览（SVIP 能力）开启时不留痕；注销/封禁的人也不该收到访客提醒
    if (!stealthActive() && !isBlocked(uid) && !isGone(uid)) addVisitor(uid);
  }

  /* v0.52：好友申请状态 —— 主页主按钮要能感知申请链路，
     否则用户看到的是「打招呼」，却永远走不到「新的朋友」这条真正的加友路径。 */
  function reqState(uid) {
    var rs = S().requests || [];
    if (rs.filter(function (r) { return r.userId === uid && r.dir !== 'out'; }).length) return 'incoming';
    if (rs.filter(function (r) { return r.userId === uid && r.dir === 'out'; }).length) return 'outgoing';
    return 'none';
  }
  /* v0.52 主 CTA：一个状态一个主按钮，不做多选 */
  function profPrimary(uid) {
    var st = S(), rs = reqState(uid);
    if (isBlocked(uid)) return '<button class="btn gray block" data-action="unblock" data-id="' + uid + '">已拉黑 · 解除拉黑</button>';
    if (rs === 'incoming') return '<button class="btn block" data-action="accept-req" data-id="' + uid + '">接受好友申请</button>' +
      '<button class="btn gray block" style="margin-top:8px" data-action="reject-req" data-id="' + uid + '">拒绝</button>';
    if (rs === 'outgoing') return '<button class="btn gray block" disabled>等待验证</button>';
    if (st.friends.indexOf(uid) >= 0) return '<button class="btn block" data-action="open-chat" data-id="' + ensureSingle(uid).id + '">发消息</button>';
    return '<button class="btn accent block" data-action="req-open" data-id="' + uid + '">添加好友</button>';
  }
  /* v0.52：「···」更多菜单 —— 次级与危险操作统一入口。
     危险项（拉黑/删除好友）放在最后且用 error 色，避免误触。 */
  function profMore() {
    var uid = curProfile; if (!uid) return;
    var st = S(), u = U(uid), blk = isBlocked(uid), fri = st.friends.indexOf(uid) >= 0, rm = (st.remarks || {})[uid];
    /* v0.53：不再提供「TA 的二维码」入口 —— 名片二维码属于个人凭证，
       若允许好友随手取出、转发到群里或截图流出，当事人对"谁拿着我的码去加了谁"完全失控。
       主流 IM 也一致：他人资料页看不到对方二维码，只有自己的才有。 */
    var items = [
      { ico: '✏️', t: '设置备注名', sub: rm ? '当前：' + rm : '仅自己可见', act: 'remark-open' }
    ];
    /* v0.54 推荐给朋友：把 TA 的名片发给其他好友（熟人撮合，陌生人社交里最高效的增长动作）。
       仅好友态提供 —— 给陌生人做背书推荐，本质是拿自己的信用为不认识的人担保，
       接收方也很难判断这是推荐还是骚扰。 */
    if (fri && !blk) items.push({ ico: '🤝', t: '推荐给朋友', sub: '把 TA 的名片发给其他好友', act: 'rec-open' });
    if (!blk) items.push({ ico: '⚠️', t: '举报', sub: '违规内容 24 小时内审核', act: 'report-user' });
    if (blk) items.push({ ico: '✅', t: '解除拉黑', sub: '恢复后可见彼此动态', act: 'unblock' });
    else items.push({ ico: '🚫', t: '加入黑名单', sub: '彼此不可见、不可收发消息', act: 'block', danger: true });
    if (fri) items.push({ ico: '🗑', t: '删除好友', sub: '聊天记录保留，TA 将无法再发消息', act: 'del-friend', danger: true });
    $('#profMoreBody').innerHTML = items.map(function (it) {
      return '<div class="pmf' + (it.danger ? ' danger' : '') + '" data-action="' + it.act + '" data-id="' + uid + '">' +
        '<span class="pmf-ico">' + it.ico + '</span><span class="pmf-tx">' + it.t +
        (it.sub ? '<span class="pmf-sub">' + esc(it.sub) + '</span>' : '') + '</span></div>';
    }).join('');
    openOv('ov-profmore');
    A.track('profile_more_open', { user: uid });
  }
  function renderProfile(uid) {
    var u = U(uid), st = S();
    var blk = isBlocked(uid);
    /* v0.52：注销/封禁降级 —— 占位卡 + 只留「删除好友 / 返回」，
       严禁出现可点的打招呼/关注/发消息（点了发不出去 = 坏体验） */
    if (isGone(uid)) {
      profMoreVisible(false);
      var banned = userStatus(uid) === 'banned';
      $('#profileBody').innerHTML =
        '<div class="prof-gone">' +
          '<div class="pg-av">' + (u.avatar || '🙂') + '</div>' +
          '<b>' + esc(u.rawName || u.name) + '</b>' +
          '<p>' + (banned ? '该账号因违反社区规范已被封禁。' : '该用户已注销账号。') +
          '<br>你们不再是好友关系，也无法再发送消息。</p>' +
          (st.friends.indexOf(uid) >= 0
            ? '<div class="pad" style="margin-top:18px"><button class="btn ghost block" data-action="del-friend" data-id="' + uid + '">移出好友列表</button></div>'
            : '') +
        '</div>';
      return;
    }
    var fri = st.friends.indexOf(uid) >= 0;
    /* 注销态的账号没有"更多操作"可言（不能备注、不能拉黑举报一个不存在的人），
       保留按钮只会让用户点进去发现全是无效项 */
    profMoreVisible(true);
    var mine = (blk ? [] : st.moments.filter(function (m) { return m.userId === uid && canViewMoment(m); }));
    var html =
      '<div style="background:linear-gradient(160deg,' + u.color + ',' + u.color + 'aa);padding:24px 16px 18px;color:#fff;display:flex;gap:14px;align-items:center">' +
        avatarHtml(u, 'xl') +
        '<div><div style="font-size:19px;font-weight:600">' + esc(u.name) + identityBadges(u) + (u.online ? ' <span class="tag" style="background:rgba(255,255,255,.25);color:#fff">在线</span>' : '') + '</div>' +
        (u.rawName ? '<div class="prof-raw">昵称：' + esc(u.rawName) + '</div>' : '') +
        '<div style="font-size:var(--fs-13);opacity:.92;margin-top:4px">' + esc(u.gender) + ' · ' + u.age + ' 岁 · ' + esc(u.city) + ' · ' + esc(u.dist) + '</div>' +
        '<div style="font-size:var(--fs-13);opacity:.92;margin-top:6px">' + esc(u.sign) + '</div></div></div>' +
      '<div class="pad"><div style="display:flex;gap:8px;align-items:center">' +
        '<div style="flex:1;min-width:0">' + profPrimary(uid) + '</div>' +
        (blk || fri || reqState(uid) !== 'none' ? '' :
          '<button class="btn ghost" data-action="follow" data-id="' + uid + '">关注</button>') +
      '</div></div>' +
      /* 好友态：关注是独立于「好友」关系的内容订阅，仍要可见 */
      (!blk && fri
        ? '<div class="pad" style="padding-top:0"><button class="btn ghost block ' +
            (st.me.following.indexOf(uid) >= 0 ? 'follow-on' : 'follow-off') + '" data-action="follow" data-id="' + uid + '">' +
            (st.me.following.indexOf(uid) >= 0 ? '已关注' : '关注 TA 的动态') + '</button></div>'
        : '') +
      /* 陌生人：打招呼降级为次级动作（主位是「添加好友」） */
      (!blk && !fri && reqState(uid) === 'none'
        ? '<div class="pad" style="padding-top:0"><button class="btn ghost block" data-action="greet" data-id="' + uid + '">👋 先打个招呼</button></div>'
        : '') +
      (blk ? '<div class="pad" style="padding-top:0"><div class="tag" style="background:var(--tint-red-bg);color:var(--tint-red-fg);padding:6px 10px;font-size:var(--fs-13);display:block">你已拉黑 TA：你们不会看到彼此的内容，也无法互发消息。</div></div>' : '') +
      /* v0.55：删掉「你们已是好友 · 可在「···」中…」与「共同兴趣 —— 这是你们最好的开场白」两条装饰性提示条。
         理由：①「已是好友」由主位 CTA 已直接证明（显示的是「发消息」而非「添加好友」），
           再说一遍是同义反复；且「···」是通用入口，不需要主页专门打广告。
         ②「共同兴趣」真正的价值在**打招呼选话术的那一刻**（opener 里仍在用），
           放在主页一块常驻横条上，既不促成任何操作，又挤掉了上方身份区的视觉重量。
         保留第 3013 行的拉黑提示条 —— 那条是在解释「为什么不能用」，属于功能性文案而非装饰。 */
      '<div class="pad"><div class="card"><div style="padding:12px 14px;border-bottom:1px solid var(--line)"><b>兴趣标签</b></div>' +
        '<div style="padding:10px 14px">' + (u.tags || []).map(function (t) { return '<span class="tag brand">' + t + '</span>'; }).join('') + '</div></div></div>' +
      /* v0.52：空态必须解释「为什么看不到」，而不是统一说「还没有公开动态」 */
      '<div class="sec-title">TA 的动态' + (mine.length ? '（' + mine.length + '）' : '') + '</div>' +
      (blk
        ? '<div class="empty" style="padding:26px"><p>你已拉黑 TA，无法查看其动态</p></div>'
        : (mine.length
            ? mine.map(momentHtml).join('')
            : '<div class="empty" style="padding:26px"><p>' +
              (fri ? 'TA 还没有公开动态' : 'TA 的动态仅好友可见，添加好友后即可查看') + '</p></div>'));
    $('#profileBody').innerHTML = html;
  }

  /* v0.52：注销/封禁态隐藏「···」（没有可做的次级操作） */
  function profMoreVisible(v) {
    var b = document.querySelector('#ov-profile [data-action="prof-more"]');
    if (b) b.style.display = v ? '' : 'none';
  }
  /* ---------- v0.54 推荐给朋友（发名片） ----------
     被推荐人 = 当前主页的 uid；推荐对象 = 选中的若干好友。
     只走单聊、不发群：名片进群等于替对方做了一次公开发布，
     超出"推荐人"这一角色应有的授权，且群里谁都能扫码加人，当事人无从控制。 */
  function openRecommend(uid) {
    if (!uid || uid === 'me') return;
    if (isBlocked(uid) || isGone(uid)) { toast('该账号不可被推荐', 'err'); return; }
    var targets = S().friends.filter(function (x) {
      return x !== uid && !isBlocked(x) && !isGone(x);
    });
    if (!targets.length) { toast('还没有可以推荐的好友', 'err'); return; }
    /* 必须先收起主页与「···」：两者同为 .overlay、同级 z-index，
       后面的 DOM（ov-profile）会盖在选择器上方拦截点击——实测选不中人。
       产品上也说得通：推荐是独立任务，不该让用户隔着一层半透明主页去选人。 */
    closeOv('ov-profmore');
    closeOv('ov-profile');
    openPicker({
      title: '推荐给好友', multi: true, source: targets,
      ok: function (uids) { recommendSend(uid, uids); }
    });
    A.track('profile_recommend_open', { user: uid, candidates: targets.length });
  }
  function recommendSend(uid, uids) {
    var u = U(uid), picked = (uids || []).filter(function (t) { return t && t !== uid && t !== 'me'; });
    if (!picked.length) return;
    picked.forEach(function (t) {
      pushMsg(ensureSingle(t).id, 'me', '', { type: 'card', cardUid: uid });
    });
    /* 被推荐人是陌生人时，收件人点名片能一路走到主页「添加好友」，这条链路必须通 */
    renderChats();
    A.track('profile_recommend', { user: uid, targets: picked.length });
    /* 这里 toast 是给自己看的，显示备注更符合"我推荐了谁"的心智 */
    toast('已把 ' + u.name + ' 的名片推荐给 ' + picked.length + ' 位好友', 'ok');
  }

  /* ---------- v0.52 备注名 ---------- */
  function openRemark(uid) {
    curRemarkUid = uid;
    var u = U(uid);
    $('#remarkHead').innerHTML = avatarHtml(u, 'sm') +
      '<div><b>' + esc(u.name) + '</b><small>' + (u.rawName ? '昵称：' + esc(u.rawName) : esc(u.city || '')) + '</small></div>';
    $('#remarkInput').value = (S().remarks || {})[uid] || '';
    remarkCount();
    openOv('ov-remark');
  }
  function remarkCount() {
    var v = ($('#remarkInput') && $('#remarkInput').value) || '';
    if ($('#remarkCount')) $('#remarkCount').textContent = v.length;
  }
  function saveRemark() {
    var uid = curRemarkUid; if (!uid) return;
    var v = ($('#remarkInput').value || '').trim();
    if (v.length > 20) { toast('备注最多 20 个字', 'err'); return; }
    S().remarks = S().remarks || {};
    if (v) S().remarks[uid] = v; else delete S().remarks[uid];
    DB.save(); closeOv('ov-remark');
    A.track('remark_save', { user: uid, len: v.length });
    renderAll(); if (curProfile) renderProfile(curProfile);
    toast(v ? '备注已保存' : '已清除备注', 'ok');
  }
  var curRemarkUid = null;

  /* ---------- v0.52 添加好友（附言） ---------- */
  var curReqUid = null;
  function openReqMsg(uid) {
    curReqUid = uid;
    var u = U(uid);
    $('#reqMsgHead').innerHTML = avatarHtml(u, 'sm') +
      '<div><b>' + esc(u.name) + '</b><small>' + esc(u.city || '') + ' · ' + esc(u.sign || '') + '</small></div>';
    $('#reqMsgText').value = '我是' + S().me.name + '，想加你为好友';
    if ($('#reqMsgCount')) $('#reqMsgCount').textContent = $('#reqMsgText').value.length;
    openOv('ov-reqmsg');
    $('#reqMsgText').oninput = function () { $('#reqMsgCount').textContent = this.value.length; };
    A.track('friend_req_open', { user: uid });
  }
  function sendReqMsg() {
    var uid = curReqUid; if (!uid) return;
    var st = S();
    if (st.friends.indexOf(uid) >= 0) return toast('你们已经是好友了', 'err');
    if ((st.requests || []).some(function (r) { return r.userId === uid && r.dir === 'out'; })) return toast('申请已发送，等待对方通过', 'err');
    var msg = ($('#reqMsgText').value || '').trim() || ('我是' + st.me.name + '，想加你为好友');
    st.requests.push({ userId: uid, time: Date.now(), msg: msg, dir: 'out' });
    DB.save(); closeOv('ov-reqmsg');
    A.track('friend_request', { user: uid, len: msg.length });
    renderAll(); if (curProfile) renderProfile(curProfile);
    toast('已发送好友申请，等待验证', 'ok');
  }
  /* ---------- v0.52 删除好友 ---------- */
  function deleteFriend(uid) {
    var u = U(uid);
    confirmBox('删除好友', '删除后将从好友列表移除，「' + esc(u.name) + '」无法再给你发消息。\n聊天记录会保留。',
      function () {
        var st = S();
        st.friends = st.friends.filter(function (x) { return x !== uid; });
        DB.save();
        A.track('friend_delete', { user: uid });
        renderAll(); if (curProfile) renderProfile(curProfile);
        toast('已删除好友 · ' + u.name, 'ok');
      }, '删除', '取消');
  }

  /* ================= 新的朋友 ================= */
  function renderNewFriends() {
    var rs = S().requests || [];
    var inc = rs.filter(function (r) { return r.dir !== 'out'; });   // 别人加我
    var out = rs.filter(function (r) { return r.dir === 'out'; });   // 我发出的
    var html = '';
    if (inc.length) {
      html += '<div class="sec-title">好友申请</div>';
      html += inc.map(function (r) {
        var u = U(r.userId);
        return '<div class="row" style="align-items:flex-start">' + avatarHtml(u) +
          '<div class="row-title"><b>' + esc(u.name) + identityBadges(u) + '</b><small>' + esc(r.msg) + '</small>' +
          '<small style="color:var(--sub)">' + timeLabel(r.time) + ' · ' + esc(u.city) + '</small></div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
          '<button class="btn sm" data-action="accept-req" data-id="' + r.userId + '">接受</button>' +
          '<button class="btn gray sm" data-action="reject-req" data-id="' + r.userId + '">拒绝</button></div></div>';
      }).join('');
    }
    if (out.length) {
      html += '<div class="sec-title">我发出的</div>';
      html += out.map(function (r) {
        var u = U(r.userId);
        return '<div class="row" style="align-items:flex-start">' + avatarHtml(u) +
          '<div class="row-title"><b>' + esc(u.name) + identityBadges(u) + '</b><small>' + esc(r.msg) + '</small>' +
          '<small style="color:var(--sub)">' + timeLabel(r.time) + ' · 等待验证</small></div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
          '<button class="btn gray sm" data-action="cancel-req" data-id="' + r.userId + '">撤回</button></div></div>';
      }).join('');
    }
    if (!rs.length) html = emptyBlock('📭', '暂无好友申请', '去广场主动打个招呼吧');
    $('#newFriendBody').innerHTML = html;
    openOv('ov-newfriends');
  }
  function acceptReq(uid) {
    var st = S();
    st.requests = st.requests.filter(function (r) { return r.userId !== uid; });
    if (st.friends.indexOf(uid) < 0) st.friends.push(uid);
    var c = ensureSingle(uid);
    c.messages.push({ id: 'm' + Date.now(), from: 'sys', text: '你们已成为好友，打个招呼吧 👋', ts: Date.now() });
    c.updatedAt = Date.now(); DB.save();
    A.track('friend_accept', { user: uid });
    closeOv('ov-newfriends');
    renderAll(); toast('已添加 ' + U(uid).name + ' 为好友', 'ok');
    openChat(c.id);
  }

  /* ================= 发布动态 =================
     v0.65 重写「发布」的归属与权限模型：
       1. 入口统一在广场：发布动作只有一处，内容默认进广场，不自动进任何圈子；
       2. 同步到圈子是**可选增强**，默认不勾选，且可多选；
       3. 能否同步由 canSyncCircle() 单点判定，渲染 / 勾选 / 提交三处共用同一函数，
          避免"列表能选但提交被拒"或"提交能过但列表没有"的规则漂移；
       4. 可见范围（visibility）与同步圈子解耦，只管广场 + 好友流。 */
  function canSyncCircle(c) {
    if (!c) return { ok: false, why: '圈子不存在' };
    var st = S();
    /* 圈主永远可发（圈主对自己圈子的绝对控制权，与 allowMemberPost 无关） */
    if (c.owner === 'me') {
      var mo = (st.circleMembers || []).filter(function (x) { return x.circleId === c.id && x.userId === 'me'; })[0];
      if (mo && mo.muted) return { ok: false, why: '你已在该圈被禁言，无法发言' };
      return { ok: true };
    }
    /* 非圈主：必须已加入 + 圈主开启了「允许成员发帖」 */
    if (st.myCircles.indexOf(c.id) < 0) return { ok: false, why: '加入圈子后才能同步' };
    if (c.allowMemberPost === false) return { ok: false, why: '圈主已关闭成员发动态权限' };
    var m = (st.circleMembers || []).filter(function (x) { return x.circleId === c.id && x.userId === 'me'; })[0];
    if (m && m.muted) return { ok: false, why: '你已在该圈被禁言，无法发言' };
    return { ok: true };
  }
  function circleById(cid) {
    return (S().circles || []).filter(function (x) { return x.id === cid; })[0];
  }
  /* 可同步的圈子列表：权限不通过的整条不出现（不是置灰——置灰等于告诉用户
     "有个东西你不配点"，但这里它本来就不该进入可选集） */
  function pubCircleList() {
    return (S().circles || []).filter(function (c) { return canSyncCircle(c).ok; });
  }
  function renderPubCircles() {
    var sec = $('#pubCircleSec'); if (!sec) return;
    var box = $('#pubCircles');
    var vis = pubDraft.visibility;
    var list = pubCircleList();
    /* 无可同步圈子 → 整块（含标题）不展示 */
    if (!list.length) { sec.hidden = true; sec.style.display = 'none'; box.innerHTML = ''; return; }
    sec.hidden = false; sec.style.display = '';
    var locked = visBlockCircle(vis);
    if (locked) pubDraft.circles = [];
    var html = '<div class="pub-cs' + (locked ? ' locked' : '') + '">';
    list.forEach(function (c) {
      var on = !locked && pubDraft.circles.indexOf(c.id) >= 0;
      html += '<button class="pub-c' + (on ? ' on' : '') + '" data-action="pub-circle" data-v="' + c.id + '"' +
        (locked ? ' disabled' : '') + '>' +
        '<span class="pub-c-ico" style="background:' + (c.color || '#12b76a') + '">' + (c.icon || '🌐') + '</span>' +
        '<span class="pub-c-nm">' + esc(c.name) + (isPrivate(c) ? ' 🔒' : '') + '</span>' +
        '<span class="pub-c-chk">' + (locked ? '🔒' : (on ? '✓' : '＋')) + '</span>' +
        '</button>';
    });
    html += '</div>';
    /* 私密圈同步的安全兜底：私密圈的契约是"内容不对外"，作者不能靠把可见范围
       设成公开，单方面把圈内内容推到公开广场——那是对圈主和圈友的违约。 */
    var priv = pubDraft.circles.filter(function (cid) { var c = circleById(cid); return c && isPrivate(c); });
    if (locked) {
      html += '<div class="pub-tip">🔒 仅自己可见的动态不能同步到圈子</div>';
    } else if (priv.length) {
      html += '<div class="pub-tip">🔒 已选私密圈：内容不会进入广场，仅圈内可见' +
        (pubDraft.circles.length > priv.length ? '；其余圈子按可见范围同步' : '') + '</div>';
    } else if (pubDraft.circles.length && vis === 'friends') {
      html += '<div class="pub-tip">同步后圈内成员均可看到（含非好友），好友流中仍仅好友可见</div>';
    }
    box.innerHTML = html;
  }
  function togglePubCircle(cid) {
    if (visBlockCircle(pubDraft.visibility)) return toast('仅自己可见的动态不能同步到圈子', 'err');
    if (pubDraft.circles.indexOf(cid) >= 0) {
      pubDraft.circles = pubDraft.circles.filter(function (x) { return x !== cid; });
    } else {
      var chk = canSyncCircle(circleById(cid));
      if (!chk.ok) { toast(chk.why, 'err'); renderPubCircles(); return; }
      pubDraft.circles.push(cid);
    }
    renderPubCircles();
  }
  /* 从圈子详情页进入：走同一个发布页，只是预选当前圈（用户在该圈语境下发起，
     意图明确；仍可取消勾选，不影响"广场入口默认不勾选"的默认态）。 */
  function openCirclePublish(cid) {
    if (!cid) return openPublish();
    var chk = canSyncCircle(circleById(cid));
    if (!chk.ok) return toast(chk.why, 'err');
    openPublish({ circles: [cid] });
  }
  function openPublish(opts) {
    opts = opts || {};
    /* 默认不勾选任何圈子：同步是用户主动选择，不是系统替他决定 */
    pubDraft.circles = (opts.circles || []).filter(function (cid) { return canSyncCircle(circleById(cid)).ok; });
    $('#pubImgs').innerHTML = GRADS.map(function (g, i) {
      return '<div class="ph ' + g[0] + '" data-action="pub-img" data-v="' + i + '" style="cursor:pointer;opacity:' +
        (pubDraft.imgs.indexOf(i) >= 0 ? '1' : '.45') + ';border:2px solid ' + (pubDraft.imgs.indexOf(i) >= 0 ? '#12b76a' : 'transparent') + '">' + g[1] + '</div>';
    }).join('');
    $('#pubVis').innerHTML = VISIBILITY.map(function (s) {
      return '<button class="chip' + (pubDraft.visibility === s.k ? ' on' : '') + '" data-action="pub-vis" data-v="' + s.k + '">' + s.t + '</button>';
    }).join('');
    var vd = VISIBILITY.filter(function (x) { return x.k === pubDraft.visibility; })[0];
    $('#pubVisDesc').textContent = vd ? vd.d : '';
    $('#pubTags').innerHTML = ALL_TAGS.map(function (t) {
      return '<button class="chip' + (pubDraft.tags.indexOf(t) >= 0 ? ' on' : '') + '" data-action="pub-tag" data-v="' + t + '">' + t + '</button>';
    }).join('');
    renderPubCircles();
    openOv('ov-publish');
    A.track('publish_open', {});
  }
  function pubCount() {
    var el = $('#pubLen'); if (!el) return;
    var n = ($('#pubText').value || '').length;
    el.textContent = n + ' / 200';
    el.style.color = n >= 200 ? 'var(--error-fg)' : '';
  }
  function doPublish() {
    var text = $('#pubText').value.trim();
    if (text.length > 200) return toast('正文最多 200 字', 'err');
    if (!text && !pubDraft.imgs.length) return toast('写点什么或选张图吧');
    var vis = pubDraft.visibility;
    /* 提交前逐圈复校权限：入口与列表都拦过了，这里必须再拦一次，
       防止"先选好圈子、再把可见范围改成仅自己"之类绕过路径。 */
    var targets = [], bad = '';
    (pubDraft.circles || []).forEach(function (cid) {
      var chk = canSyncCircle(circleById(cid));
      if (chk.ok) targets.push(cid); else if (!bad) bad = chk.why;
    });
    if (bad) { renderPubCircles(); return toast(bad, 'err'); }
    if (visBlockCircle(vis) && targets.length) {
      pubDraft.circles = []; renderPubCircles();
      return toast('仅自己可见的动态不能同步到圈子', 'err');
    }
    var imgs = pubDraft.imgs.map(function (i) { return { g: GRADS[i][0], e: GRADS[i][1] }; });
    var m = {
      id: 'k' + Date.now(), userId: 'me', text: text || '分享一张图',
      imgs: imgs, loc: $('#pubLoc').value.trim(),
      visibility: vis, circles: targets.slice(),
      likes: [], comments: [], ts: Date.now(), tags: pubDraft.tags.slice()
    };
    var st = S();
    /* 私密圈安全兜底：圈子的私密属性是圈主与圈友之间的契约，
       作者不能靠"公开"把自己的可见范围盖过它，故含私密圈时不进广场。 */
    var hasPriv = targets.some(function (cid) { var c = circleById(cid); return c && isPrivate(c); });
    var toPlaza = (vis === 'public') && !hasPriv;
    var toFeed = (vis === 'public' || vis === 'friends') && !hasPriv;
    if (toFeed) {
      st.moments.unshift(m);
      if (toPlaza) {
        st.plaza.unshift({ id: 'p' + Date.now(), userId: 'me', text: m.text, imgs: imgs, loc: m.loc, tags: m.tags.length ? m.tags : ['露营'], likes: 0, comments: [], ts: m.ts });
      }
    }
    var cirNames = [];
    targets.forEach(function (cid) {
      var c = circleById(cid); if (!c) return;
      cirNames.push(c.name);
      st.circlePosts.unshift({
        id: 'cp' + Date.now() + '-' + cid, circleId: cid, userId: 'me',
        text: m.text, imgs: imgs, loc: m.loc, momentId: m.id, synced: true,
        tags: m.tags.length ? m.tags.slice() : [], likes: 0, comments: [], ts: m.ts
      });
    });
    DB.save();
    pubDraft = { imgs: [], visibility: 'public', tags: [], circles: [] };
    $('#pubText').value = ''; $('#pubLoc').value = '';
    closeOv('ov-publish'); renderAll();
    /* 归属广场：能进广场就回广场，让作者立刻看到自己的内容被分发出去了 */
    if (toPlaza) {
      switchTab('discover'); setDiscover('plaza');
      toast(targets.length
        ? '已发布到广场 · 同步 ' + targets.length + ' 个圈子'
        : '已发布到广场', 'ok');
    } else if (targets.length) {
      switchTab('circles'); openCircleDetail(targets[0]);
      toast(hasPriv
        ? '已发布 · 含私密圈，仅圈内可见'
        : (targets.length > 1
          ? '已发布到 ' + targets.length + ' 个圈子：' + cirNames.join('、')
          : '已发布到「' + cirNames[0] + '」'));
    } else if (vis === 'friends') {
      switchTab('discover'); setDiscover('friends');
      toast('已发布 · 好友可见', 'ok');
    } else {
      switchTab('discover'); setDiscover('plaza'); renderMyMoments();
      toast('已发布 · 仅自己可见', 'ok');
    }
    A.track('moment_publish', { visibility: vis, imgs: imgs.length, circles: targets.length, plaza: toPlaza });
    /* v0.76 移除：原「发布后延迟随机给 1-3 个假赞」。赞来自真人，伪造互动会污染计数与列表排序。 */
  }

  /* ================= 互动 ================= */
  function likeMoment(id) {
    var m = S().moments.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    var i = m.likes.indexOf('me');
    if (i >= 0) m.likes.splice(i, 1); else { m.likes.push('me'); A.track('moment_like', { id: id }); }
    DB.save(); renderFriendsFeed(); refreshProfile();
  }
  function commentMoment(id) {
    var box = $('#cmbox-' + id); if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="cminput"><input class="input" id="cmi-' + id + '" placeholder="写下你的评论…" /><button class="btn sm" data-action="submit-cm" data-id="' + id + '">发送</button></div>';
    $('#cmi-' + id).focus({ preventScroll: true });
  }
  function submitComment(id) {
    var m = S().moments.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    var el = $('#cmi-' + id); var v = el && el.value.trim(); if (!v) return;
    m.comments.push({ userId: 'me', text: v, ts: Date.now() });
    DB.save(); A.track('moment_comment', { id: id });
    renderFriendsFeed(); refreshProfile(); toast('评论已发送', 'err');
  }
  function plazaComment(id) {
    var box = $('#pcmbox-' + id); if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="cminput"><input class="input" id="pcmi-' + id + '" placeholder="写下你的评论…" /><button class="btn sm" data-action="submit-pcm" data-id="' + id + '">发送</button></div>';
    $('#pcmi-' + id).focus({ preventScroll: true });
  }
  function submitPlazaComment(id) {
    var p = S().plaza.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var el = $('#pcmi-' + id); var v = el && el.value.trim(); if (!v) return;
    p.comments = p.comments || [];
    p.comments.push({ userId: 'me', text: v, ts: Date.now() });
    DB.save(); A.track('plaza_comment', { id: id });
    renderPlaza(); toast('评论已发送', 'err');
  }
  function refreshProfile() {
    if ($('#ov-profile').classList.contains('show') && curProfile) {
      renderProfile(curProfile);
      var b = $('#ov-profile .screen-body'); if (b) b.scrollTop = b.scrollTop;
    }
    if ($('#ov-mymoments').classList.contains('show')) renderMyMoments();
  }
  function follow(uid) {
    var f = S().me.following, i = f.indexOf(uid);
    if (i >= 0) { f.splice(i, 1); toast('已取消关注', 'ok'); }
    else { f.push(uid); toast('已关注 ' + U(uid).name, 'ok'); A.track('follow', { user: uid }); }
    DB.save(); renderPlaza(); renderFriendsFeed(); renderMe();
    if ($('#ov-profile').classList.contains('show')) renderProfile(uid);
    /* v0.67：详情页顶栏的关注按钮也是关注入口，点了必须立刻换态 */
    if ($('#ov-post-detail') && $('#ov-post-detail').classList.contains('show')) renderPostDetail();
  }

  /* ================= 首次兴趣引导（冷启动） ================= */
  function maybeOnboard() {
    if (S().onboarded) return false;
    obSelected = [];   // 引导页从零开始选，预填会让用户跳过这个动作
    renderOnboard();
    openOv('ov-onboard');
    A.track('onboard_view', {});
    return true;
  }
  function renderOnboard() {
    $('#obTags').innerHTML = ALL_TAGS.map(function (t) {
      return '<div class="ob-tag' + (obSelected.indexOf(t) >= 0 ? ' on' : '') + '" data-action="ob-tag" data-v="' + t + '">' + t + '</div>';
    }).join('');
    $('#obTip').textContent = '已选 ' + obSelected.length + ' 个 · 至少选 1 个';
    var go = $('#obGo');
    go.disabled = obSelected.length < 1;
    go.style.opacity = go.disabled ? '.5' : '1';
  }
  function finishOnboard(skip) {
    var tags = skip ? [] : obSelected.slice();
    if (tags.length) S().me.tags = tags;
    S().onboarded = true;
    if (!skip) {
      // 按兴趣自动推荐加入群聊（PRD 场景 1：冷启动空首页）
      var joined = [];
      S().conversations.forEach(function (c) {
        if (c.type !== 'group' || c.members.indexOf('me') >= 0) return;
        var hit = c.members.some(function (m) { return sharedTags(m).length; });
        if (hit) {
          c.members.push('me');
          c.messages.push({ id: 'oj' + Date.now(), from: 'sys', text: '你加入了群聊，和大家打个招呼吧', ts: Date.now() });
          c.updatedAt = Date.now();
          joined.push(c.title);
        }
      });
      // 3 位同好主动来打招呼
      [['u4', '看你刚加入，周末一起去塘朗山？'], ['u9', '同为露营党，加个好友？'], ['u7', '南京徒步搭子，要不要一起']]
        .forEach(function (g, i) {
          var c = ensureSingle(g[0]);
          c.messages.push({ id: 'ob' + i, from: g[0], text: g[1], ts: Date.now() - (3 - i) * 90000 });
          c.unread = 1;
          c.updatedAt = Date.now() - (3 - i) * 90000;
        });
      /* v0.26：兑现「完成兴趣标签送 3 天会员」承诺——发放 3 天体验会员 */
      if (!S().me.vip || S().me.vip.expire <= Date.now()) {
        S().me.vip = { plan: 't1', name: '体验会员', days: 3, start: Date.now(), expire: Date.now() + 3 * 86400000 };
      }
      DB.save();
      closeOv('ov-onboard');
      renderAll(); switchTab('discover'); setDiscover('plaza');
      A.track('onboard_complete', { tags: tags.join(','), joined: joined.length });
      toast('已按兴趣推荐内容，并加入 ' + joined.length + ' 个群', 'ok');
      setTimeout(function () { toast('有 3 位同好主动跟你打招呼了'); }, 2200);
      setTimeout(function () { toast('3 天体验会员已到账 👑', 'ok'); }, 4400);
    } else {
      DB.save();
      closeOv('ov-onboard');
      renderAll(); switchTab('chats');
      A.track('onboard_skip', {});
      toast('可随时在「我的 → 编辑资料」补充兴趣标签');
    }
  }
  function sysMsg(c, text) {
    c.messages.push({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 4), from: 'sys', type: 'sys', text: text, ts: Date.now() });
    c.updatedAt = Date.now();
  }
  function joinGroup() {
    var c = conv(curConv); if (!c || c.type !== 'group') return;
    if (c.members.indexOf('me') < 0) {
      c.members.push('me');
      sysMsg(c, '你加入了群聊，和大家打个招呼吧');
      DB.save();
      A.track('group_join', { conv: c.id });
      toast('已加入群聊', 'ok');
      /* 群主/管理员会来欢迎一句，顺带暴露角色身份 */
      var hi = [c.owner].concat(c.admins || []).filter(function (x) { return x && x !== 'me'; })[0];
      if (hi) setTimeout(function () {
        pushMsg(c.id, hi, '欢迎新伙伴！我是本群' + roleText(roleOf(c, hi)) + '，有活动会在群里通知 🏕️');
      }, 1500);
    }
    renderChatHead(c); renderAnnBar(c); renderChat(); renderChats();
  }

  /* ================= 群聊：信息页 / 成员管理 / 创建 / 解散 ================= */
  function openGroupInfo(cid) {
    var c = conv(cid || curConv); if (!c || c.type !== 'group') return;
    if (c.members.indexOf('me') < 0) return toast('加入群聊后才能查看群信息', 'err');
    curGroupId = c.id;
    grpRemoveMode = false;              // v0.32：切换群时重置移除模式，避免状态串群
    renderGroupInfo();
    openOv('ov-groupinfo');
    A.track('group_info_open', { conv: c.id, role: roleOf(c, 'me') });
  }
  function renderGroupInfo() {
    var c = conv(curGroupId); if (!c) return;
    var myRole = roleOf(c, 'me');
    /* v0.32：原写法 canDo(c,'me','kick') 把「我」既当操作者又当操作对象，
       群主时判定「能否踢自己」恒为 false —— 导致移除入口对所有人不可见。改为逐成员判定。 */
    var kickable = function (uid) { return uid !== 'me' && canDo(c, uid, 'kick'); };
    var canKick = c.members.some(kickable);
    var cells = c.members.map(function (uid) {
      var u = U(uid);
      var removable = grpRemoveMode && kickable(uid);
      var act = (uid === 'me') ? 'toast' : (removable ? 'remove-member' : 'member-act');
      return '<div class="grp-cell' + (removable ? ' removing' : '') + '" data-action="' + act + '"' +
        (uid === 'me' ? ' data-v="这是你自己"' : '') + ' data-id="' + uid + '">' +
        avatarHtml(u, 'sm') + (removable ? '<i class="rm-x">✕</i>' : '') +
        '<span class="nm">' + esc(u.name) + '</span></div>';
    }).join('');
    var html =
      '<div class="grp-grid">' + cells +
        (canDo(c, 'me', 'invite') ? '<div class="grp-cell" data-action="invite-member"><div class="avatar sm" style="background:var(--n-100)">＋</div><span class="nm">邀请</span></div>' : '') +
        (canKick ? '<div class="grp-cell" data-action="remove-mode"><div class="avatar sm" style="background:' + (grpRemoveMode ? 'var(--gold-fg,#b45309)22' : 'var(--n-100)') + '">' + (grpRemoveMode ? '✓' : '－') + '</div><span class="nm">' + (grpRemoveMode ? '完成' : '移除') + '</span></div>' : '') +
      '</div>' +
      (grpRemoveMode && canKick ? '<p style="color:var(--sub);font-size:var(--fs-12);text-align:center;margin:-4px 0 10px">已进入移除模式：点击成员头像即可移出，再次点「完成」退出</p>' : '') +
      '<div class="sec-title">我在本群的角色：<b style="color:var(--text)">' + roleText(myRole) + '</b>' +
        (myRole === 'member' ? '（仅可邀请与退群）' : (myRole === 'admin' ? '（可改群资料、移除普通成员）' : '（拥有全部权限）')) + '</div>' +
      '<div class="list">' +
        infoRow('群名称', esc(c.title), canDo(c, 'me', 'edit') ? 'edit-title' : 'toast') +
        infoRow('群公告', esc(c.announce || '未设置'), canDo(c, 'me', 'edit') ? 'edit-announce' : 'toast') +
        infoRow('查看全部成员', c.members.length + ' 人', 'all-members') +
      '</div>' +
      '<div class="sec-title">设置</div>' +
      '<div class="list">' +
        toggleRow('muted', '消息免打扰', c.muted) +
        toggleRow('top', '置顶聊天', !!c.top) +
      '</div>' +
      '<div class="sec-title">危险操作</div>' +
      '<div class="list">' +
        '<div class="row" data-action="clear-chat"><div class="row-title"><b>清空聊天记录</b><small>仅清空本机消息</small></div><span class="chev">›</span></div>' +
      '</div>' +
      '<div class="pad">' +
        (canDo(c, 'me', 'dissolve')
          ? '<div class="danger-btn" data-action="dissolve-group">解散群聊</div>'
          : '<div class="danger-btn" data-action="leave-group">退出群聊</div>') +
      '</div>' +
      '<p style="color:var(--sub);font-size:var(--fs-12);text-align:center;padding:10px 20px 20px;line-height:1.6">' +
        '权限矩阵：群主（解散 / 任免管理员 / 移除任何人）＞ 管理员（改群资料 / 移除普通成员）＞ 普通成员（邀请 / 退群）</p>';
    $('#groupInfoBody').innerHTML = html;
  }
  function infoRow(k, v, act) {
    return '<div class="info-row" data-action="' + act + '"><span class="ik">' + k + '</span>' +
      '<span class="iv">' + v + '</span><span class="chev">›</span></div>';
  }
  function toggleRow(key, title, on) {
    return '<div class="row" data-action="grp-toggle" data-v="' + key + '">' +
      '<div class="row-title"><b>' + title + '</b></div>' +
      '<div class="switch' + (on ? ' on' : '') + '"><i></i></div></div>';
  }
  function renderMembers() {
    var c = conv(curGroupId); if (!c) return;
    var q = ($('#memberSearch').value || '').trim().toLowerCase();
    var order = { owner: 0, admin: 1, member: 2 };
    var list = c.members.slice().sort(function (a, b) {
      return order[roleOf(c, a)] - order[roleOf(c, b)];
    }).filter(function (uid) {
      if (!q) return true;
      var u = U(uid);
      return (u.name + u.py).toLowerCase().indexOf(q) >= 0;
    });
    $('#membersBody').innerHTML = list.length ? list.map(function (uid) {
      var u = U(uid), r = roleOf(c, uid);
      return '<div class="row" data-action="' + (uid === 'me' ? 'toast' : 'member-act') + '" data-id="' + uid + '"' +
        (uid === 'me' ? ' data-v="这是你自己"' : '') + '>' +
        avatarHtml(u, '', u.online) +
        '<div class="row-title"><b>' + displayName(u) + roleBadge(r) + vipTag(u) + '</b>' +
        '<small>' + esc(u.city || '') + ' · ' + esc(u.sign || '') + '</small></div>' +
        '<div class="row-side" style="color:var(--sub);font-size:var(--fs-12)">' + roleText(r) + '</div></div>';
    }).join('') : emptyBlock('🔍', '没有找到成员', '换个关键词试试');
  }
  /* 单个成员的操作菜单（按权限动态列出） */
  function memberActions(uid) {
    var c = conv(curGroupId); if (!c || uid === 'me') return;
    var u = U(uid), r = roleOf(c, uid);
    var items = [
      { k: 'view',  i: '👤', t: '查看个人主页' },
      { k: 'chat',  i: '💬', t: '发消息' }
    ];
    /* v0.32：原为 canDo(c,'me',...)，误把「我」当操作对象，导致管理员/转让/移出三项永远不出现 */
    if (canDo(c, uid, 'setAdmin')) {
      items.push(r === 'admin'
        ? { k: 'unadmin', i: '➖', t: '取消管理员' }
        : { k: 'admin',   i: '🛡️', t: '设为管理员' });
    }
    if (canDo(c, uid, 'transfer')) items.push({ k: 'transfer', i: svgIcon('crown', 'ai'), t: '转让群主给 TA', warn: true });
    if (canDo(c, uid, 'kick')) items.push({ k: 'kick', i: '🚪', t: '移出群聊', danger: true });
    $('#msgActTitle').textContent = u.name + ' · ' + roleText(r);
    $('#msgActBody').innerHTML = items.map(function (it) {
      return '<div class="act-item' + (it.danger ? ' danger' : '') + '" data-action="member-do" data-v="' + it.k + '" data-id="' + uid + '">' +
        '<span class="ai">' + it.i + '</span>' + it.t + '</div>';
    }).join('');
    $('#ov-msgact').classList.add('show');
  }
  function openGroupEdit(field) {
    var c = conv(curGroupId); if (!c || !canDo(c, 'me', 'edit')) return toast('只有群主和管理员可修改');
    grpEditField = field;
    $('#grpEditTitle').textContent = field === 'title' ? '修改群名称' : '修改群公告';
    $('#grpEditInput').value = field === 'title' ? c.title : (c.announce || '');
    $('#grpEditHint').textContent = field === 'title' ? '群名会同步显示在消息列表与聊天页' : '公告会置顶显示在聊天页顶部，全员可见';
    openOv('ov-grpedit');
  }
  function doGroupEdit() {
    var c = conv(curGroupId); if (!c) return;
    var v = $('#grpEditInput').value.trim();
    if (!v) return toast('内容不能为空');
    if (grpEditField === 'title') { c.title = v; sysMsg(c, '群名称已修改为「' + v + '」'); }
    else { c.announce = v; sysMsg(c, '群公告已更新：' + v); }
    DB.save();
    closeOv('ov-grpedit');
    renderGroupInfo();
    if (curConv === c.id) { renderChatHead(c); renderAnnBar(c); renderChat(); }
    renderChats();
    toast('已保存', 'ok');
    A.track('group_edit', { field: grpEditField, role: roleOf(c, 'me') });
  }
  function leaveGroup(dissolve) {
    var c = conv(curGroupId); if (!c) return;
    if (dissolve) {
      confirmBox('解散群聊', '群聊「' + c.title + '」将永久解散，所有成员会被移出。', function () {
        S().conversations = S().conversations.filter(function (x) { return x.id !== c.id; });
        DB.save();
        closeOv('ov-groupinfo');
        if (curConv === c.id) { closeOv('ov-chat'); curConv = null; }
        renderAll(); toast('群聊已解散', 'ok');
        A.track('group_dissolve', { conv: c.id });
      });
      return;
    }
    confirmBox('退出群聊', '退出后将不再收到该群消息。', function () {
      c.members = c.members.filter(function (m) { return m !== 'me'; });
      c.admins = (c.admins || []).filter(function (m) { return m !== 'me'; });
      sysMsg(c, '你已退出群聊');
      DB.save();
      closeOv('ov-groupinfo');
      if (curConv === c.id) { renderChatHead(c); renderAnnBar(c); renderChat(); }
      renderChats(); toast('已退出群聊', 'ok');
      A.track('group_leave', { conv: c.id });
    });
  }
  /* ================= v0.32 通用选人器 =================
     此前 openCreateGroup / inviteMembers / atPicker / 发名片 四处调用 openPicker，
     但全仓库从无定义 —— 点击即抛 ReferenceError 崩溃。此处补实现，复用 index.html 的 #ov-picker。
     opts = { title, multi, min, source:[uid], ok(uids) } */
  var pickerOpts = null, pickerSel = [], pickerQuery = '', grpRemoveMode = false;
  function openPicker(opts) {
    pickerOpts = opts || {};
    pickerSel = []; pickerQuery = '';
    var ps = $('#pickerSearch'); if (ps) ps.value = '';
    renderPicker();
    openOv('ov-picker');
  }
  function renderPicker() {
    if (!pickerOpts) return;
    var el = $('#pickerSearch');
    pickerQuery = el ? (el.value || '').trim() : pickerQuery;
    var q = pickerQuery.toLowerCase();
    var list = (pickerOpts.source || []).filter(function (uid) {
      if (!q) return true;
      var u = U(uid);
      return (u.name + (u.py || '')).toLowerCase().indexOf(q) >= 0;
    });
    $('#pickerBody').innerHTML = list.length ? list.map(function (uid) {
      var u = U(uid), on = pickerSel.indexOf(uid) >= 0;
      return '<div class="row" data-action="picker-toggle" data-id="' + uid + '">' +
        avatarHtml(u, 'sm') +
        '<div class="row-title"><b>' + esc(u.name) + '</b><small>' + esc(u.city || '') + '</small></div>' +
        '<span class="pk-check' + (on ? ' on' : '') + '">' + (on ? '✓' : '') + '</span></div>';
    }).join('') : emptyBlock('🔍', '没有找到好友', '换个关键词试试');
    var h = $('#pickerTitle');
    if (h) h.textContent = (pickerOpts.title || '选择成员') +
      (pickerOpts.multi === false ? '' : (pickerSel.length ? '（已选 ' + pickerSel.length + ' 人）' : ''));
  }
  function pickerToggle(uid) {
    if (!pickerOpts) return;
    if (pickerOpts.multi === false) {
      var only = [uid]; closePicker(true);
      var cb = pickerOpts.ok; pickerOpts = null;
      if (cb) cb(only);
      return;
    }
    var i = pickerSel.indexOf(uid);
    if (i >= 0) pickerSel.splice(i, 1); else pickerSel.push(uid);
    renderPicker();
  }
  function pickerConfirm() {
    if (!pickerOpts) return;
    var min = pickerOpts.min || 0;
    if (pickerSel.length < min) return toast('请至少选择 ' + min + ' 人', 'err');
    var cb = pickerOpts.ok, sel = pickerSel.slice();
    closePicker(true); pickerOpts = null;
    if (cb) cb(sel);
  }
  function closePicker(keep) {
    closeOv('ov-picker');
    if (!keep) { pickerOpts = null; pickerSel = []; pickerQuery = ''; }
  }

  /* ---- 发起群聊 ---- */
  function openCreateGroup() {
    openPicker({
      title: '发起群聊', multi: true, min: 1,
      source: S().friends.slice(),
      ok: function (uids) {
        var members = ['me'].concat(uids);
        var c = {
          id: 'g' + Date.now(), type: 'group', title: groupDefaultName(uids),
          owner: 'me', admins: ['me'], members: members,
          announce: '', muted: false, top: false, unread: 0, updatedAt: Date.now(),
          messages: []
        };
        sysMsg(c, '你邀请 ' + uids.map(function (u) { return U(u).name; }).join('、') + ' 加入了群聊');
        S().conversations.unshift(c);
        DB.save();
        A.track('group_create', { n: uids.length });
        renderAll();
        openChat(c.id);
        toast('群聊已创建 · 你是群主', 'ok');
        setTimeout(function () {
          var u = uids[Math.floor(Math.random() * uids.length)];
          pushMsg(c.id, u, ['来了来了 👋', '这名字起得不错', '群主好！下次活动去哪？'][Math.floor(Math.random() * 3)]);
        }, 1600);
      }
    });
  }
  function groupDefaultName(uids) {
    return uids.slice(0, 2).map(function (u) { return U(u).name; }).join('、') + (uids.length > 2 ? ' 等 ' + (uids.length + 1) + ' 人' : '、我');
  }
  function inviteMembers() {
    var c = conv(curGroupId); if (!c) return;
    var pool = S().friends.filter(function (f) { return c.members.indexOf(f) < 0; });
    if (!pool.length) return toast('好友都已在本群', 'ok');
    openPicker({
      title: '邀请成员', multi: true, min: 1, source: pool,
      ok: function (uids) {
        /* v0.33 卡点 K5：建群人数上限（写操作之前校验） */
        var md = En.can('group.memberCap', { conv: c });
        if (uids.length > md.left) {
          paywall(md, {
            title: '群人数已达上限',
            body: '当前等级每个群最多 ' + md.cap + ' 人，本群已有 ' + md.used + ' 人。' +
                  'VIP 可扩至 50 人 · SVIP 可扩至 200 人。'
          });
          return;
        }
        uids.forEach(function (uid) {
          c.members.push(uid);
          sysMsg(c, U(uid).name + ' 加入了群聊');
        });
        DB.save();
        renderGroupInfo(); renderChats();
        if (curConv === c.id) { renderChatHead(c); renderChat(); }
        A.track('group_invite', { conv: c.id, n: uids.length });
        toast('已邀请 ' + uids.length + ' 人', 'ok');
      }
    });
  }
  function atPicker() {
    var c = conv(curConv); if (!c || c.type !== 'group') return;
    openPicker({
      title: '选择要提醒的人', multi: false, source: c.members.filter(function (m) { return m !== 'me'; }),
      ok: function (uids) {
        var n = U(uids[0]).name;
        var el = $('#chatInput');
        el.value = el.value.replace(/@$/, '') + '@' + n + ' ';
        el.focus({ preventScroll: true }); toggleSendBtn();
      }
    });
  }

  /* ================= v0.32 群聊信息：此前仅渲染、无任何 handler 的四个能力 ================= */
  /* 群开关（消息免打扰 / 置顶聊天） */
  function grpToggle(key) {
    var c = conv(curGroupId); if (!c) return;
    if (key === 'muted') { c.muted = !c.muted; toast(c.muted ? '已开启消息免打扰' : '已关闭消息免打扰', 'ok'); }
    else if (key === 'top') { c.top = !c.top; toast(c.top ? '已置顶聊天' : '已取消置顶', 'ok'); }
    else return;
    DB.save(); renderGroupInfo(); renderChats();
    A.track('group_toggle', { conv: c.id, key: key });
  }
  /* 移除模式开关 */
  function toggleRemoveMode() {
    var c = conv(curGroupId); if (!c) return;
    if (!c.members.some(function (m) { return m !== 'me' && canDo(c, m, 'kick'); }))
      return toast('没有移出成员的权限', 'err');
    grpRemoveMode = !grpRemoveMode;
    renderGroupInfo();
    toast(grpRemoveMode ? '已进入移除模式，点击成员头像即可移出' : '已退出移除模式', grpRemoveMode ? 'warn' : 'ok');
  }
  /* 成员操作菜单执行器（memberActions 渲染的每一项） */
  function memberDo(k, uid) {
    var c = conv(curGroupId); if (!c) return;
    if (uid === 'me') return toast('不能对自己执行该操作', 'err');
    if (k === 'view') { closeOv('ov-msgact'); return openProfile(uid); }
    if (k === 'chat') { closeOv('ov-msgact'); return openChat(ensureSingle(uid).id); }
    if (k === 'admin' || k === 'unadmin') {
      if (!canDo(c, uid, 'setAdmin')) return toast('仅群主可设置管理员', 'err');
      if (roleOf(c, uid) === 'owner') return toast('不能对群主执行该操作', 'err');
      c.admins = c.admins || [];
      var i = c.admins.indexOf(uid);
      if (k === 'admin') { if (i < 0) c.admins.push(uid); }
      else if (i >= 0) c.admins.splice(i, 1);
      sysMsg(c, U(uid).name + (k === 'admin' ? ' 已成为管理员' : ' 已被取消管理员身份'));
      DB.save(); closeOv('ov-msgact'); renderGroupInfo(); renderMembers(); renderChats();
      return toast(k === 'admin' ? '已设为管理员' : '已取消管理员', 'ok');
    }
    if (k === 'transfer') {
      if (!canDo(c, uid, 'transfer')) return toast('仅群主可转让群主身份', 'err');
      confirmBox('转让群主', '转让后「' + U(uid).name + '」将成为群主，你将自动变为普通成员，此操作不可撤销。', function () {
        c.owner = uid;
        c.admins = (c.admins || []).filter(function (x) { return x !== uid && x !== 'me'; });
        sysMsg(c, '群主已转让给 ' + U(uid).name);
        DB.save(); closeOv('ov-msgact'); renderGroupInfo(); renderMembers(); renderChats();
        toast('已转让群主给 ' + U(uid).name, 'ok');
      }, '确认转让', '取消');
      return;
    }
    if (k === 'kick') return removeMember(uid);
  }
  /* 移出群聊成员（含权限矩阵校验 + 二次确认） */
  function removeMember(uid) {
    var c = conv(curGroupId); if (!c) return;
    if (uid === 'me') return toast('不能移出自己，请通过「退出群聊」退出', 'err');
    if (!canDo(c, uid, 'kick')) return toast('没有移出成员的权限', 'err');
    var r = roleOf(c, uid);
    if (r === 'owner') return toast('不能移出群主', 'err');
    if (roleOf(c, 'me') === 'admin' && r !== 'member') return toast('管理员仅可移出普通成员', 'err');
    confirmBox('移出群聊', '「' + U(uid).name + '」将被移出「' + c.title + '」。', function () {
      c.members = c.members.filter(function (m) { return m !== uid; });
      c.admins = (c.admins || []).filter(function (m) { return m !== uid; });
      sysMsg(c, U(uid).name + ' 已被移出群聊');
      DB.save(); closeOv('ov-msgact');
      grpRemoveMode = false;
      renderGroupInfo(); renderMembers(); renderChats();
      if (curConv === c.id) { renderChatHead(c); renderChat(); }
      toast('已移出 ' + U(uid).name, 'ok');
      A.track('group_kick', { conv: c.id, target: r });
    }, '移出', '取消');
  }

  /* ================= 编辑资料 / 设置 ================= */
  function openEdit() {
    var me = S().me;
    $('#editName').value = me.name; $('#editSign').value = me.sign; $('#editCity').value = me.city;
    $('#editAvatar').innerHTML = avatarInner(me);
    renderEditTags();
    openOv('ov-edit');
  }
  function renderEditTags() {
    $('#editTags').innerHTML = ALL_TAGS.map(function (t) {
      return '<button class="chip' + (S().me.tags.indexOf(t) >= 0 ? ' on' : '') + '" data-action="edit-tag" data-v="' + t + '">' + t + '</button>';
    }).join('');
  }
  function doEdit() {
    var me = S().me;
    me.name = $('#editName').value.trim() || me.name;
    me.py = letterOf(me);      // v0.57：昵称改了，资料里的静态首字母要跟着改（否则自己永远挂在旧字母下）
    me.sign = $('#editSign').value.trim();
    me.city = $('#editCity').value.trim() || me.city;
    DB.save(); closeOv('ov-edit'); renderAll(); toast('资料已保存', 'ok');
    A.track('profile_edit', {});
  }
  /* ================= v0.22 设计规范展示页（Living Style Guide）=================
     把「颜色/字阶/间距/圆角/阴影/组件全状态/骨架屏/空错状态」做成可走查页面，
     设计与开发共用同一份事实源。色板为浅色基准值，暗色由 token 自动反转。 */
  function renderDesignSystem() {
    var sw = function (hex, name, dark) {
      return '<div class="ds-sw' + (dark ? ' dark' : '') + '" style="background:' + hex + '"><b>' + name + '</b><span>' + hex + '</span></div>';
    };
    var typeRow = function (fs, lh, label, sample) {
      return '<div class="t-row"><span style="font-size:var(' + fs + ');line-height:' + lh + '">' + sample + '</span>' +
        '<span class="t-meta">' + fs.replace('--fs-', '') + ' / ' + lh + ' · ' + label + '</span></div>';
    };
    var spBar = function (px) { return '<div class="sp-i" style="width:' + px + 'px;height:' + px + 'px"></div>'; };
    var html = ''

    /* ---- §1 色彩 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">1</span>色彩规范</h4>' +
    '<p class="ds-sub">品牌野遇绿 + 9 阶中性 + 4 组功能色。文字/图标用 <code>--brand</code>，白字实底用 <code>--brand-fill</code>（暗色下双轨分叉，保证对比度）。</p>' +
    '<div class="ds-lab">品牌色 Brand</div><div class="ds-swatches">' +
    sw('#eafaf2', 'brand-50') + sw('#a9e9ca', 'brand-200') + sw('#12b76a', 'brand', true) + sw('#0e9f5d', 'brand-600', true) + sw('#065c34', 'brand-900', true) +
    '</div><div class="ds-lab" style="margin-top:10px">中性色 Neutral（页面/卡片/分隔/文字）</div><div class="ds-swatches">' +
    sw('#ffffff', 'n-0') + sw('#f4f5f7', 'n-50') + sw('#e4e7ec', 'n-150') + sw('#98a2b3', 'n-300') + sw('#101828', 'n-900', true) +
    '</div><div class="ds-lab" style="margin-top:10px">功能色 Functional</div><div class="ds-swatches">' +
    sw('#12b76a', 'success', true) + sw('#f79009', 'warning', true) + sw('#f04438', 'error', true) + sw('#2e90fa', 'info', true) + sw('#7a5cff', 'violet', true) +
    '</div></div>'

    /* ---- §2 字阶 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">2</span>字阶规范</h4>' +
    '<p class="ds-sub">10 级字阶；移动端正文一律 14px/1.5。数字场景（时间/金额）全局等宽 <code>tabular-nums</code>。</p>' +
    '<div class="ds-type">' +
    typeRow('--fs-24', '1.25', '数字大屏 / 空状态图标旁', '野遇') +
    typeRow('--fs-20', '1.25', '页面大标题', '发现同好') +
    typeRow('--fs-17', '1.35', '弹层标题', '发起群聊') +
    typeRow('--fs-16', '1.3', '导航标题', '消息') +
    typeRow('--fs-15', '1.4', '卡片标题 / 分组标题', '南山野道小分队') +
    typeRow('--fs-14', '1.5', '正文 / 按钮 / 聊天气泡', '周末径山露营，还差一个人') +
    typeRow('--fs-13', '1.5', '辅助说明 / 评论', '到营地的第一件事是煮咖啡') +
    typeRow('--fs-12', '1.4', '次要信息 / 时间戳', '3 小时前 · 杭州') +
    typeRow('--fs-11', '1.3', '标签 / 徽章 / 提示', 'VIP · 靓号 · 圈主') +
    typeRow('--fs-10', '1.2', '底部 Tab 标签', '消息') +
    '</div></div>'

    /* ---- §3 间距 / 圆角 / 阴影 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">3</span>间距 · 圆角 · 阴影</h4>' +
    '<p class="ds-sub">间距 4 的倍数（7 档）；圆角 6 阶；阴影 4 阶（层次只靠这四档，禁散落值）。</p>' +
    '<div class="ds-lab">间距 Space</div><div class="ds-sp">' +
    spBar(4) + spBar(8) + spBar(12) + spBar(16) + spBar(20) + spBar(24) + spBar(32) +
    '<span class="t-meta">4 · 8 · 12 · 16 · 20 · 24 · 32</span></div>' +
    '<div class="ds-lab" style="margin-top:12px">圆角 Radius</div><div class="ds-r">' +
    '<div class="r-i" style="border-radius:var(--r-xs)"></div><div class="r-i" style="border-radius:var(--r-sm)"></div>' +
    '<div class="r-i" style="border-radius:var(--r-md)"></div><div class="r-i" style="border-radius:var(--r-lg)"></div>' +
    '<div class="r-i" style="border-radius:var(--r-xl)"></div><div class="r-i" style="border-radius:var(--r-full)"></div>' +
    '<span class="t-meta">6 · 8 · 12 · 16 · 20 · full</span></div>' +
    '<div class="ds-lab" style="margin-top:12px">阴影 Elevation</div><div class="ds-grid2">' +
    '<div class="ds-demo" style="box-shadow:var(--sh-1)">sh-1 卡片静态</div>' +
    '<div class="ds-demo" style="box-shadow:var(--sh-2)">sh-2 悬浮</div>' +
    '<div class="ds-demo" style="box-shadow:var(--sh-3)">sh-3 弹出</div>' +
    '<div class="ds-demo" style="box-shadow:var(--sh-4)">sh-4 模态</div>' +
    '</div></div>'

    /* ---- §4 按钮全状态 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">4</span>按钮规范</h4>' +
    '<p class="ds-sub">状态机：default → hover（浮起）→ press（回弹）→ disabled → loading（spinner+锁点击）→ success（绿色反馈）。触控高度 38px（sm 30px）。</p>' +
    '<div class="ds-lab">变体 Variants</div><div class="ds-row">' +
    '<button class="btn">主要按钮</button><button class="btn ghost">次级按钮</button>' +
    '<button class="btn outline">描边按钮</button><button class="btn danger">危险按钮</button>' +
    '<button class="btn gray">弱化按钮</button></div>' +
    '<div class="ds-lab">状态 States</div><div class="ds-row">' +
    '<button class="btn">默认</button><button class="btn" disabled>禁用</button>' +
    '<button class="btn loading">加载中</button><button class="btn success">已成功</button></div>' +
    '<div class="ds-row"><button class="btn" data-action="demo-loading">点我演示 loading → success</button>' +
    '<button class="btn ghost" data-action="demo-toast" data-v="ok">成功 Toast</button>' +
    '<button class="btn ghost" data-action="demo-toast" data-v="err">错误 Toast</button></div>' +
    '<div class="ds-lab">尺寸 Sizes</div><div class="ds-row">' +
    '<button class="btn" style="min-height:44px;padding:12px 18px">Large 44</button>' +
    '<button class="btn">Medium 38</button><button class="btn sm">Small 30</button><button class="btn xs">XSmall 26</button></div></div>'

    /* ---- §5 输入框 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">5</span>输入框规范</h4>' +
    '<p class="ds-sub">default → focus（品牌焦点环）→ error（红边+红环+字段级错误文案）→ success → disabled。占位符用 n-300，永不用于传递关键信息。</p>' +
    '<div class="ds-demo"><input class="input" placeholder="默认态：说点什么…" /></div>' +
    '<div class="ds-demo"><input class="input" style="border-color:var(--brand);box-shadow:var(--ring)" value="聚焦态：品牌色焦点环" /></div>' +
    '<div class="ds-demo"><input class="input err" value="错误态：邀请码无效" /><div class="field-err">⚠ 邀请码不存在，请向圈主确认</div></div>' +
    '<div class="ds-demo"><input class="input ok" value="成功态：野遇号可用" /><div class="hint">✓ 该靓号未被占用</div></div>' +
    '<div class="ds-demo"><input class="input" value="禁用态" disabled /><div class="hint">成为会员后解锁自定义靓号</div></div>' +
    '<div class="ds-demo" style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
    '<span style="font-size:var(--fs-14)">开关 Switch</span>' +
    '<span style="display:flex;align-items:center;gap:10px"><button class="switch" data-action="demo-switch"><i></i></button>' +
    '<button class="switch on" data-action="demo-switch"><i></i></button></span></div>' +
    '<div class="ds-demo" style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="chip on">已选中</button><button class="chip">未选中</button>' +
    '<span class="tag brand">兴趣标签</span><span class="tag accent">活动</span><span class="tag violet">圈子</span></div></div>'

    /* ---- §6 头像与身份 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">6</span>头像 · 徽章 · 身份铭牌</h4>' +
    '<p class="ds-sub">头像四级（36/44/64/80）圆角方形；在线点 12px；VIP 铭牌按套餐分级（年卡金/季卡紫/月卡蓝），过期自动消失。</p>' +
    '<div class="ds-row">' + avatarHtml({ avatar: '🌲', color: '#2f9e6f' }, '') +
    avatarHtml({ avatar: '🌲', color: '#2f9e6f' }, 'sm', true) +
    avatarHtml({ avatar: '🌲', color: '#2f9e6f' }, 'lg') +
    avatarHtml({ avatar: '🌲', color: '#2f9e6f' }, 'xl') + '</div>' +
    '<div class="ds-row"><span style="font-size:var(--fs-14)">林小野</span>' +
    '<span class="badge-vip lv-year">' + svgIcon('crown', 'bi') + '年度VIP</span>' +
    '<span class="badge-vip lv-season">' + svgIcon('crown', 'bi') + '季卡VIP</span>' +
    '<span class="badge-vip lv-month">' + svgIcon('crown', 'bi') + 'VIP</span>' +
    '<span class="badge-nice">' + svgIcon('num', 'bi') + '靓号</span>' +
    '<span class="role owner">圈主</span><span class="role admin">管理员</span><span class="badge">3</span></div></div>'

    /* ---- §7 聊天气泡 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">7</span>聊天气泡规范</h4>' +
    '<p class="ds-sub">接收方白底、发送方品牌绿；不对称圆角（尾部 4px 收窄）指向说话人；图片/语音/位置/引用混排稳定。</p>' +
    '<div class="ds-demo" style="padding:6px 0">' +
    '<div class="msg"><span>' + avatarHtml({ avatar: '🚴', color: '#e07b39' }, 'sm') + '</span>' +
    '<div class="col"><div class="bubble">周六径山露营，还差一个人 🏕️</div></div></div>' +
    '<div class="msg me"><span>' + avatarHtml({ avatar: '🌲', color: '#2f9e6f' }, 'sm') + '</span>' +
    '<div class="col"><div class="bubble">算我一个！我带天幕</div><div class="msg-state">已读</div></div></div>' +
    '<div class="time-sep"><span>昨天 21:30</span></div>' +
    '<div class="msg"><span>' + avatarHtml({ avatar: '🚴', color: '#e07b39' }, 'sm') + '</span>' +
    '<div class="col"><div class="bubble rich"><div class="bubble-img g3">🏔️</div></div></div></div>' +
    '<div class="sys-msg"><span>你已被邀请加入群聊</span></div></div></div>'

    /* ---- §8 骨架屏 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">8</span>骨架屏规范</h4>' +
    '<p class="ds-sub">骨架与真实组件同构（行高/内边距一致），切换零跳动；shimmer 1.5s 循环；尊重 reduces-motion。</p>' +
    '<div class="ds-lab">列表骨架</div><div style="border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">' + skeletonRows(2) + '</div>' +
    '<div class="ds-lab" style="margin-top:10px">信息流骨架</div>' + skeletonCards(1) +
    '<div class="ds-lab" style="margin-top:10px">聊天气泡骨架</div><div style="border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;padding:4px 0">' + skeletonMsgs(3) + '</div></div>'

    /* ---- §9 空态 / 错误态 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">9</span>空状态 · 错误状态</h4>' +
    '<p class="ds-sub">空状态三要素：插画衬底 + 主副标题 + 主行动按钮；错误态区分「整页重试」与「行内错误条」。</p>' +
    '<div class="ds-demo">' + emptyBlock('🧭', '这里还没有内容', '换个筛选条件，或去发布第一条', ['publish', '去发布']) + '</div>' +
    '<div class="ds-demo"><div class="err-block"><div class="err-ico">📡</div><b>网络开小差了</b>' +
    '<small>内容加载失败，请检查网络后重试</small><button class="btn sm" data-action="demo-toast" data-v="err">重新加载</button></div></div>' +
    '<div class="ds-demo"><div class="err-bar"><span>⚠ 有 2 条消息发送失败</span><button class="eb-act">重试</button></div></div></div>'

    /* ---- §10 组件速查 ---- */
    + '<div class="ds-sec"><h4><span class="ds-no">10</span>复用与落地约定</h4>' +
    '<p class="ds-sub">给开发的硬规则，保证迭代不走样。</p>' +
    '<div class="ds-note">' +
    '① 新组件只消费 token（<code>var(--fs-14)</code> / <code>var(--sp-4)</code> / <code>var(--r-md)</code> / <code>var(--sh-2)</code>），禁止魔法值；<br />' +
    '② 列表行统一 <code>.row</code>（64px 高、头像 44、标题 block+ellipsis、右侧 side），徽章/铭牌放标题 <code>&lt;b&gt;</code> 内部同行；<br />' +
    '③ 卡片统一 <code>.card</code>（白底 + sh-1 + 1px 发丝边），信息流卡 <code>.pcard</code>、动态卡 <code>.moment</code>；<br />' +
    '④ 交互状态必须全覆盖：hover/press/disabled/loading，弹层必须有 mask + 进出场动效；<br />' +
    '⑤ 暗色不写死颜色，只反转 <code>[data-theme="dark"]</code> 的 token 层，组件规则全复用；<br />' +
    '⑥ 动效统一 <code>--dur-1/2/3</code> + <code>--ease-out/spring</code>，并尊重 <code>prefers-reduced-motion</code>。' +
    '</div></div>';

    $('#designBody').innerHTML = html;
  }

  function renderSettings() {
    var st = S().settings;
    var bl = blockedSet().length;
    /* v0.77：设置结构对齐 Flutter —— 账号 / 隐私 / 通用 / 法律协议 / 退出登录 */
    var html = '<div class="sec-title">账号</div><div class="list">' +
      row('🛡️', '账号与安全', '手机号 · 第三方绑定 · 登录设备', 'account-security') +
      row('✏️', '编辑资料', '昵称 · 签名 · 头像 · 兴趣标签', 'edit') +
      row('🔔', '消息通知', '评论 · 点赞 · 关注 · 系统消息', 'notify-settings') +
    '</div>' +
    '<div class="sec-title">隐私</div><div class="list">' +
      '<div class="row" data-action="toggle-set" data-v="nearby">' +
        '<div class="row-title"><b>附近的人可见</b><small>关闭后不会出现在附近的人列表中</small></div>' +
        '<div class="switch' + (st.nearby ? ' on' : '') + '"><i></i></div></div>' +
      '<div class="row" data-action="toggle-set" data-v="privateMsg">' +
        '<div class="row-title"><b>允许陌生人私信</b><small>关闭后仅好友可发私信</small></div>' +
        '<div class="switch' + (st.privateMsg ? ' on' : '') + '"><i></i></div></div>' +
      row('🚫', '黑名单', bl ? (bl + ' 人已被拉黑 · 可解除') : '还没有拉黑任何人', 'blacklist') +
    '</div>' +
    '<div class="sec-title">通用</div><div class="list">' +
      '<div class="row" data-action="toggle-set" data-v="youthMode">' +
        '<div class="row-title"><b>青少年模式</b><small>开启后限制陌生人私信与不适内容</small></div>' +
        '<div class="switch' + (st.youthMode ? ' on' : '') + '"><i></i></div></div>' +
      '<div class="row" data-action="toggle-theme">' +
        '<div class="row-title"><b>深色模式</b><small>夜间浏览更护眼</small></div>' +
        '<div class="switch' + (st.theme === 'dark' ? ' on' : '') + '"><i></i></div></div>' +
      row('🎨', '设计规范', '颜色 / 字阶 / 组件全状态走查', 'design') +
      row('ℹ️', '关于野遇', '当前版本 ' + APP_VERSION, 'toast') +
    '</div>' +
    '<div class="sec-title">法律与协议</div><div class="list">' +
      '<div class="row" data-action="auth-doc" data-v="terms">' +
        '<div class="avatar sm" style="background:var(--n-100);font-size:18px">📄</div>' +
        '<div class="row-title"><b>用户协议</b><small>查看服务条款</small></div><span class="chev">›</span></div>' +
      '<div class="row" data-action="auth-doc" data-v="privacy">' +
        '<div class="avatar sm" style="background:var(--n-100);font-size:18px">🔒</div>' +
        '<div class="row-title"><b>隐私政策</b><small>查看隐私说明</small></div><span class="chev">›</span></div>' +
    '</div>' +
    '<div style="padding:16px"><button class="btn ghost block" data-action="logout" style="color:var(--danger)">退出登录</button></div>';
    $('#settingsBody').innerHTML = html;
    openOv('ov-settings');
  }

  /* ================= v0.77 通知中心 ================= */
  var notiFilter = null;
  var NOTI_TYPES = [['comment','评论'],['reply','回复'],['like','点赞'],['follow','关注'],['mention','@提及'],['friendRequest','好友申请'],['visitor','访客'],['system','系统通知']];
  function notiVisible() {
    var st = S().settings;
    return (S().notifications || []).filter(function (n) {
      if (notiFilter && n.type !== notiFilter) return false;
      if (st) {
        if ((n.type === 'comment' || n.type === 'reply') && !st.notifyComment) return false;
        if (n.type === 'like' && !st.notifyLike) return false;
        if ((n.type === 'follow' || n.type === 'friendRequest') && !st.notifyFollow) return false;
        if (n.type === 'mention' && !st.notifyMention) return false;
        if (n.type === 'system' && !st.sysmsg) return false;
      }
      return true;
    });
  }
  function notiUnread() { return notiVisible().filter(function (n) { return !n.read; }).length; }
  function renderNotifications() {
    var list = notiVisible();
    $('#notiTabs').innerHTML = '<button class="subtab' + (!notiFilter ? ' active' : '') + '" data-action="noti-tab" data-v="">全部</button>' +
      NOTI_TYPES.map(function (t) { return '<button class="subtab' + (notiFilter === t[0] ? ' active' : '') + '" data-action="noti-tab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    var ra = $('#notiReadAll'); if (ra) { ra.disabled = !notiUnread(); ra.style.opacity = notiUnread() ? '1' : '.4'; }
    $('#notiBody').innerHTML = list.length ? list.map(notiRowHtml).join('') : emptyBlock('🔔', '暂无通知', '有互动时会出现在这里');
    openOv('ov-notifications');
  }
  function notiRowHtml(n) {
    var u = n.type === 'system' ? null : U(n.actorId);
    return '<div class="row" data-action="noti-open" data-id="' + n.id + '"' + (n.read ? '' : ' style="background:var(--brand-tint)"') + '>' +
      '<div class="avatar sm" style="background:' + (u ? (u.color || '#98a2b3') : '#f79009') + '26;font-size:18px">' + (u ? esc(u.avatar || '🙂') : '📢') + '</div>' +
      '<div class="row-title"><b>' + (u ? esc(displayName(u)) : '野遇官方') + '</b><small>' + esc(n.text) + '</small></div>' +
      (n.read ? '' : '<span style="width:8px;height:8px;border-radius:50%;background:var(--danger);flex:0 0 auto"></span>') +
      '</div>';
  }
  function notiOpen(nid) {
    var n = (S().notifications || []).filter(function (x) { return x.id === nid; })[0];
    if (!n) return;
    n.read = true; DB.save();
    var rt = n.refType, rid = n.refId;
    if (rt === 'post') {
      var kind = (S().plaza || []).some(function (p) { return p.id === rid; }) ? 'plaza' : 'moment';
      openPostDetail(kind, rid);
    } else if (rt === 'user') openProfile(rid);
    else if (rt === 'friend') renderNewFriends();
    else if (rt === 'sys') openSysDetail(rid);
    else if (rt === 'circle') openCircleDetail(rid);
    else closeOv('ov-notifications');
  }

  /* ================= v0.77 通知设置 ================= */
  function renderNotifySettings() {
    var s = S().settings;
    var groups = [
      ['互动提醒', [
        ['notifyComment', '评论和回复', '有人评论你的动态或回复你的评论时'],
        ['notifyLike', '点赞', '有人赞了你的动态或评论时'],
        ['notifyFollow', '关注和好友申请', '有人关注你或发来好友申请时'],
        ['notifyMention', '@提及', '有人在动态或评论中 @ 你时']
      ]],
      ['消息提醒', [
        ['sysmsg', '系统消息', '安全提醒、平台公告等活动类通知'],
        ['privateMsg', '私信提醒', '接收陌生人的私信']
      ]]
    ];
    var rowHtml = function (r) {
      var on = !!s[r[0]];
      return '<div class="row" data-action="notify-toggle" data-v="' + r[0] + '">' +
        '<div class="row-title"><b>' + r[1] + '</b><small>' + r[2] + '</small></div>' +
        '<div class="switch' + (on ? ' on' : '') + '"><i></i></div></div>';
    };
    var html = groups.map(function (g) {
      return '<div class="sec-title">' + g[0] + '</div><div class="list">' +
        g[1].map(rowHtml).join('') + '</div>';
    }).join('');
    $('#notifySettingsBody').innerHTML = html;
    openOv('ov-notifysettings');
  }

  /* ================= v0.77 关注 / 粉丝 ================= */
  var followKind = 'following';
  function renderFollow(kind) {
    followKind = kind || 'following';
    var ids = followKind === 'following' ? (S().me.following || []) : (S().me.followers || []);
    $('#followTitle').textContent = followKind === 'following' ? '我的关注' : '我的粉丝';
    $('#followBody').innerHTML = ids.length ? ids.map(function (uid) {
      var u = U(uid);
      return '<div class="row" data-action="open-profile" data-id="' + uid + '">' +
        '<div class="avatar sm" style="background:' + (u.color || '#98a2b3') + '26;font-size:18px">' + esc(u.avatar || '🙂') + '</div>' +
        '<div class="row-title"><b>' + esc(displayName(u)) + '</b><small>' + esc(u.sign || '') + '</small></div>' +
        '<span class="chev">›</span></div>';
    }).join('') : emptyBlock('🙂', followKind === 'following' ? '还没有关注任何人' : '还没有粉丝', '关注后会在这里展示');
    openOv('ov-follow');
  }

  /* ================= v0.77 账号与安全 ================= */
  function renderAccountSecurity() {
    var a = A_();
    var me = S().me;
    var html = '<div class="sec-title">账号信息</div><div class="list">' +
      row('📱', '手机号', window.Auth.maskPhone(a.phone) || '未绑定', 'as-phone') +
      row('🪪', '实名认证', me.verified ? '已认证' : '未认证', 'as-verify') +
      row('🔒', '登录密码', '修改', 'as-pwd') +
      '</div>' +
      '<div class="sec-title">第三方账号绑定</div><div class="list">' +
      row('💬', '微信', (a.thirdBound || []).indexOf('wechat') >= 0 ? '已绑定' : '未绑定', 'as-wechat') +
      '</div>' +
      '<div class="sec-title">登录设备</div><div class="list">' +
      '<div class="row"><div class="row-title"><b>当前设备</b><small>iPhone 15 Pro · 深圳</small></div><span style="color:var(--brand);font-size:12px">在线</span></div>' +
      row('🖥️', '其他设备', '共 2 台已登录', 'as-devices') +
      '</div>' +
      '<div style="padding:20px 16px"><button class="btn ghost block" data-action="as-delete" style="color:var(--danger)">注销账号</button>' +
      '<p style="text-align:center;color:var(--sub);font-size:12px;margin-top:8px">注销后账号不可恢复，请谨慎操作</p></div>';
    $('#accountSecurityBody').innerHTML = html;
    openOv('ov-accountsecurity');
  }

  /* ================= v0.77 邀请好友进群 ================= */
  var ginvSelected = [], ginvGid = null;
  function renderGroupInvite(gid) {
    ginvGid = gid; ginvSelected = [];
    var g = (S().conversations || []).filter(function (c) { return c.id === gid; })[0];
    var inGroup = g ? (g.members || []) : [];
    var friends = (S().friends || []).filter(function (f) { return inGroup.indexOf(f) < 0; });
    $('#ginvBody').innerHTML = '<p style="color:var(--sub);font-size:12px;margin:0 0 10px">选择要邀请进群的好友（已在群的不显示）</p>' +
      (friends.length ? friends.map(function (f) {
        var u = U(f);
        return '<div class="row" data-action="ginv-toggle" data-id="' + f + '">' +
          '<div class="avatar sm" style="background:' + (u.color || '#98a2b3') + '26;font-size:18px">' + esc(u.avatar || '🙂') + '</div>' +
          '<div class="row-title"><b>' + esc(displayName(u)) + '</b><small>' + esc(u.sign || '') + '</small></div>' +
          '<span class="ck' + (ginvSelected.indexOf(f) >= 0 ? ' on' : '') + '"></span></div>';
      }).join('') : emptyBlock('👥', '没有可邀请的好友', '先添加好友再来邀请'));
    openOv('ov-groupinvite');
  }

  /* ================= v0.77 群绑圈 ================= */
  function circleBinds(cid) { return (S().circleGroupBinds || []).filter(function (b) { return b.circleId === cid; }); }
  function renderCircleBind(c) {
    var binds = circleBinds(c.id);
    var rows = binds.map(function (b) {
      return '<div class="row">' +
        '<div class="avatar sm" style="background:var(--brand-tint);font-size:18px">👥</div>' +
        '<div class="row-title"><b>' + esc(b.groupTitle) + '</b><small>圈内新帖将同步推送到该群</small></div>' +
        '<button class="btn ghost xs" data-action="circle-unbind" data-id="' + b.id + '" style="color:var(--error-fg)">解绑</button></div>';
    }).join('');
    return '<div class="cd-bind">' +
      '<div class="cd-bind-h"><span>🔗 绑定群聊</span><small>圈内容分发渠道</small></div>' +
      (rows || '<div class="row"><div class="row-title"><small>未绑定群聊，绑定后圈内新帖会推送到群</small></div></div>') +
      '<button class="btn ghost sm" style="width:100%;margin-top:6px" data-action="circle-bind" data-id="' + c.id + '">' + (binds.length ? '绑定其他群聊' : '绑定群聊') + '</button>' +
      '</div>';
  }
  function openBindSheet(cid) {
    var groups = (S().conversations || []).filter(function (c) { return c.type === 'group'; });
    var bound = circleBinds(cid).map(function (b) { return b.groupId; });
    var avail = groups.filter(function (g) { return bound.indexOf(g.id) < 0; });
    var body = avail.length ? avail.map(function (g) {
      return '<div class="row" data-action="circle-bind-do" data-cid="' + cid + '" data-gid="' + g.id + '">' +
        '<div class="avatar sm" style="background:var(--brand-tint);font-size:18px">👥</div>' +
        '<div class="row-title"><b>' + esc(g.title) + '</b><small>' + (g.members || []).length + ' 位成员</small></div>' +
        '<span class="chev">›</span></div>';
    }).join('') : emptyBlock('👥', '没有可绑定的群', '先去创建一个群聊');
    $('#ginvBody').innerHTML = '<p style="color:var(--sub);font-size:12px;margin:0 0 10px">选择要绑定的群聊</p>' + body;
    $('#ov-groupinvite .ov-head h3').textContent = '绑定群聊';
    openOv('ov-groupinvite');
  }

  /* ================= 我的动态 ================= */
  function renderMyMoments() {
    var mine = S().moments.filter(function (m) { return m.userId === 'me'; }).sort(function (a, b) { return b.ts - a.ts; });
    $('#myMomentBody').innerHTML = mine.length ? mine.map(momentHtml).join('') : emptyBlock('📷', '你还没有发布动态', '发布入口在广场，去发第一条', ['go-plaza-publish', '去广场发布']);
    openOv('ov-mymoments');
  }

  function renderAll() {
    ensureCircleMembers();
    renderChats(); renderContacts(); renderPlaza(); renderFriendsFeed(); renderMe(); renderCircles();
    /* v0.59：别处改动（点赞/关注/删帖）要同步到正开着的详情页，否则详情是旧数据 */
    if ($('#ov-post-detail').classList.contains('show')) renderPostDetail();
  }

  /* ================= 事件绑定 ================= */
  function bind() {
    /* v0.59 图片查看器：横向滑动切图（鼠标拖拽与触屏同一套 pointer 事件，
       touch-action:none 已在 CSS 里关掉页面跟着滚） */
    (function () {
      var st = $('#vwStage'); if (!st) return;
      var x0 = null;
      st.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
      st.addEventListener('pointerup', function (e) {
        if (x0 == null) return;
        var dx = e.clientX - x0; x0 = null;
        if (Math.abs(dx) < 40) return;          // 阈值：小于 40px 视为误触，不切图
        viewerGo(dx < 0 ? 1 : -1);
      });
    })();
    /* v0.48 完善资料：昵称实时校验 + 相册选图 */
    var nickEl = $('#profNick');
    if (nickEl) nickEl.addEventListener('input', onNickInput);
    var fileEl = $('#profFile');
    if (fileEl) {
      fileEl.addEventListener('change', onProfFile);
      /* 现代浏览器支持 input 的 cancel 事件：用户主动取消选图时安静返回 */
      fileEl.addEventListener('cancel', function () { A.track('avatar_pick_cancel', {}); });
    }
    bindCrop();

    /* v0.45 验证码框：输入自动前进、退格回退、满 6 位自动提交（减少一次点击） */
    var cbox = $('#codeBox');
    if (cbox) {
      cbox.addEventListener('input', function (e) {
        var inp = e.target;
        inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
        var idx = [].indexOf.call(cbox.children, inp);
        if (inp.value && idx < cbox.children.length - 1) cbox.children[idx + 1].focus({ preventScroll: true });
        if (codeValue().length === (window.AUTH_CONFIG.sms.codeLen || 6)) {
          var vb = $('#authVerifyBtn'); if (vb) { vb.blur(); vb.click(); }
        }
      });
      cbox.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !e.target.value) {
          var idx = [].indexOf.call(cbox.children, e.target);
          if (idx > 0) { cbox.children[idx - 1].focus({ preventScroll: true }); cbox.children[idx - 1].value = ''; }
        }
      });
    }
    $$('.tab').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });

    document.addEventListener('click', function (e) {
      var pm = $('#plusMenu');
      if (pm.classList.contains('show') && !e.target.closest('#plusMenu')) pm.classList.remove('show');
      /* v0.41：点空白/其它区域收起右上角「＋」菜单 */
      var cm = $('#circMenu');
      if (cm && cm.classList.contains('show') && !e.target.closest('#circMenu') && !e.target.closest('[data-action="circle-menu-toggle"]')) closeCircleMenu();
      var payEl = e.target.closest('[data-pay]');
      if (payEl) { if (window.Pay) Pay.handle(payEl.dataset.pay, payEl.dataset); return; }
      var el = e.target.closest('[data-action]');
      if (el) { handle(el.dataset.action, el.dataset, el, e); return; }
      var cl = e.target.closest('[data-close]');
      if (cl) { closeOv(cl.dataset.close); if (cl.dataset.close === 'ov-chat') curConv = null; }
    });

    $('#sendBtn').addEventListener('click', function () { send($('#chatInput').value); });
    $('#chatInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send($('#chatInput').value); }
    });
    $('#obGo').addEventListener('click', function () { if (!this.disabled) finishOnboard(false); });
    $('#greetCustom').addEventListener('input', function () {
      if (this.value.trim()) $$('#greetOpts .greet-opt').forEach(function (n) { n.classList.remove('on'); });
    });

    $('#emojiBtn').addEventListener('click', function () {
      var p = $('#emojiPanel');
      if (!p.innerHTML) {
        p.innerHTML = EMOJIS.map(function (x) { return '<button type="button">' + x + '</button>'; }).join('');
        p.addEventListener('click', function (ev) {
          if (ev.target.tagName === 'BUTTON') {
            $('#chatInput').value += ev.target.textContent;
            $('#chatInput').focus({ preventScroll: true });
          }
        });
      }
      p.classList.toggle('show');
      $('#extPanel').classList.remove('show');
    });

    $('#chatMore').addEventListener('click', openChatMore);
    $('#plusBtn').addEventListener('click', toggleExt);
    $('#voiceBtn').addEventListener('click', startVoice);
    $('#atBtn').addEventListener('click', openMention);
    $('#addFriendInput').addEventListener('input', renderAddFriend);
    /* v0.32：选人器「确定」按钮（HTML 里无 data-action，需直接绑定） */
    if ($('#pickerOk')) $('#pickerOk').addEventListener('click', pickerConfirm);
    $('#searchMsgInput').addEventListener('input', renderSearchMsg);

    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTop(); });

    $('#cfOk').addEventListener('click', function () {
      $('#cfMask').classList.remove('show');
      // 恢复默认按钮文案，避免自定义文案串到下一个弹窗
      var okB = $('#cfOk'), noB = $('#cfMask [data-action="close-cf"]');
      if (okB) okB.textContent = '确定';
      if (noB) noB.textContent = '取消';
      if (confirmCb) { var cb = confirmCb; confirmCb = null; cb(); }
    });

    window.__openOrders = renderOrders;
    window.__openWallet = renderWallet;
    bindLongPress();
    bindConvLongPress();
  }

  /* 长按会话行 → 弹出会话操作菜单（移动端手势；桌面端右键亦可触发） */
  function bindConvLongPress() {
    var list = $('#chatList'); if (!list) return;
    var LP_MS = 420, timer = null, cid = null, target = null, fired = false, sx = 0, sy = 0;
    function rowOf(e) {
      var n = e.target;
      while (n && n !== list) {
        if (n.classList && n.classList.contains('row')) return n;
        n = n.parentNode;
      }
      return null;
    }
    function clear() {
      if (timer) { clearTimeout(timer); timer = null; }
      cid = null;
      if (target) { target.classList.remove('pressing'); target = null; }
      fired = false;
    }
    function start(e, touch) {
      if (e.target.closest && e.target.closest('.row-more')) return; // 「⋯」按钮交给点击处理
      var r = rowOf(e); if (!r) return;
      target = r; cid = r.getAttribute('data-id'); fired = false;
      sx = touch ? e.touches[0].clientX : e.clientX;
      sy = touch ? e.touches[0].clientY : e.clientY;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fired = true;
        r.classList.add('pressing');
        openConvAct(cid);
      }, LP_MS);
    }
    function move(e, touch) {
      if (!timer) return;
      var x = touch ? e.touches[0].clientX : e.clientX;
      var y = touch ? e.touches[0].clientY : e.clientY;
      if (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10) clear();
    }
    list.addEventListener('touchstart', function (e) { start(e, true); }, { passive: true });
    list.addEventListener('touchmove', function (e) { move(e, true); }, { passive: true });
    list.addEventListener('touchend', clear, { passive: true });
    list.addEventListener('touchcancel', clear, { passive: true });
    list.addEventListener('mousedown', function (e) { if (e.button === 0) start(e, false); });
    list.addEventListener('mousemove', function (e) { move(e, false); });
    list.addEventListener('mouseup', clear);
    list.addEventListener('mouseleave', clear);
    list.addEventListener('contextmenu', function (e) {
      var r = rowOf(e);
      if (r) { e.preventDefault(); openConvAct(r.getAttribute('data-id')); }
    });
  }

  /* 长按气泡 → 弹出消息操作菜单（移动端手势；桌面端右键亦可触发） */
  function bindLongPress() {
    var wrap = $('#chatWrap'); if (!wrap) return;
    var LP_MS = 420, timer = null, mid = null, target = null, fired = false, sx = 0, sy = 0;
    function bubbleOf(e) {
      var n = e.target;
      while (n && n !== wrap) {
        if (n.classList && n.classList.contains('bubble')) return n;
        n = n.parentNode;
      }
      return null;
    }
    function clear() {
      if (timer) { clearTimeout(timer); timer = null; }
      mid = null;
      if (target) { target.classList.remove('pressing'); target = null; }
      fired = false;
    }
    function start(e, touch) {
      var b = bubbleOf(e); if (!b) return;
      target = b; mid = b.getAttribute('data-id'); fired = false;
      sx = touch ? e.touches[0].clientX : e.clientX;
      sy = touch ? e.touches[0].clientY : e.clientY;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fired = true;
        b.classList.add('pressing');
        openMsgAct(mid);
      }, LP_MS);
    }
    function move(e, touch) {
      if (!timer) return;
      var x = touch ? e.touches[0].clientX : e.clientX;
      var y = touch ? e.touches[0].clientY : e.clientY;
      if (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10) clear();
    }
    wrap.addEventListener('touchstart', function (e) { start(e, true); }, { passive: true });
    wrap.addEventListener('touchmove', function (e) { move(e, true); }, { passive: true });
    wrap.addEventListener('touchend', clear, { passive: true });
    wrap.addEventListener('touchcancel', clear, { passive: true });
    wrap.addEventListener('mousedown', function (e) { if (e.button === 0) start(e, false); });
    wrap.addEventListener('mousemove', function (e) { move(e, false); });
    wrap.addEventListener('mouseup', clear);
    wrap.addEventListener('mouseleave', clear);
    wrap.addEventListener('contextmenu', function (e) {
      var b = bubbleOf(e);
      if (b) { e.preventDefault(); openMsgAct(b.getAttribute('data-id')); }
    });
  }

  function handle(act, d, el, e) {
    switch (act) {
      case 'open-chat': openChat(d.id); break;
      case 'open-profile':
        /* v0.59：从搜索结果进主页，关键词要进历史（下次一点就能回到同样的结果） */
        if ($('#ov-search').classList.contains('show') && srQ) srPush(srQ);
        openProfile(d.id); break;
      case 'newfriends': renderNewFriends(); break;
      case 'mygroups': renderGroupList(); break;
      /* v0.60：我的页「我的圈子」—— 圈子页顶部已有「我的圈子」区，直接跳过去 */
      case 'mycircles': switchTab('circles'); break;
      /* ---- 圈子（v0.15） ---- */
      /* v0.39：切换分类视为离开「处理」意图，自动收起待办明细，把纵向空间还给内容 */
      case 'circle-cat': circleCat = d.k; circleTodoOpen = false; renderCircles(); break;
      /* v0.39：待办条折叠/展开切换 */
      case 'circle-todo-toggle': circleTodoOpen = !circleTodoOpen; renderCircleInvites(); break;
      case 'circle-fav': toggleFav(d.id); break;
      case 'circle-open': openCircleDetail(d.id); break;
      case 'circle-join': joinCircle(d.id); break;
      case 'circle-exit': exitCircle(d.id); break;
      case 'circle-back': closeOv('ov-circledetail'); curCircleId = null; break;
      case 'circle-menu-toggle': circleMenuOpen = !circleMenuOpen; renderCircleMenu(); break;
      /* v0.41：菜单项点击后立即收起菜单 */
      case 'circle-create': closeCircleMenu(); openCreateCircle(); break;
      /* ---- v0.16 私密圈：邀请 / 邀请码 ---- */
      case 'circle-invite': openInviteFriends(); break;
      case 'cinv-toggle': {
        var cinvUid = d.id, ci = cinvSelected.indexOf(cinvUid);
        if (ci >= 0) cinvSelected.splice(ci, 1); else cinvSelected.push(cinvUid);
        renderInviteFriends();
        break;
      }
      case 'cinv-send': sendCircleInvites(); break;
      case 'cinv-cancel': closeOv('ov-circleinvite'); cinvSelected = []; break;
      case 'cinv-accept': acceptInvite(d.id); break;
      case 'cinv-reject': rejectInvite(d.id); break;
      /* ---- v0.17 成员管理 / 入圈审核 ---- */
      case 'circle-members': openCircleMembers(d.id, 'members'); break;
      case 'circle-audit': openCircleMembers(d.id, 'apply'); break;
      case 'cmem-tab': cmemTab = d.v; renderCircleMembers(); break;
      case 'cmem-privacy': toggleCircleMembersHidden(); break;
      case 'cmem-postperm': toggleCircleMemberPost(); break;
      case 'cmem-invperm': setCircleInvitePerm(d.v); break;
      case 'cmem-cancel': closeOv('ov-circlemem'); break;
      case 'mem-act': openMemAct(d.id); break;
      case 'memact-cancel': closeOv('ov-memact'); break;
      case 'mem-admin': memToggleAdmin(); break;
      case 'mem-mute': memToggleMute(); break;
      case 'mem-remove': memRemove(); break;
      case 'mem-transfer': memTransfer(); break;
      case 'circle-apply': openCircleApply(d.id || curCircleId); break;
      case 'apply-submit': submitCircleApply(); break;
      case 'apply-cancel': closeOv('ov-circleapply'); break;
      case 'apply-ok': approveApply(d.id); break;
      case 'apply-no': rejectApply(d.id); break;
      case 'circle-code-join': closeCircleMenu(); openCircleCode('input', d.id || null); break;
      case 'circle-code-show': openCircleCode('show', d.id); break;
      case 'ccode-submit': submitCircleCode(); break;
      case 'ccode-copy': copyCircleCode(); break;
      case 'ccode-reset': resetCircleCode(); break;
      case 'ccode-cancel': closeOv('ov-circlecode'); break;
      /* ---- 创建 / 编辑 / 解散圈子 ---- */
      case 'mk-vis': mkDraft.visibility = d.v; renderCreateCircle(); break;
      case 'mk-cancel': closeOv('ov-circlemk'); mkEditId = null; break;
      case 'mk-submit': mkSubmit(); break;
      case 'mk-prov': mkDraft.province = d.v; mkDraft.city = ''; renderCreateCircle(); break;
      case 'mk-city': mkDraft.city = d.v; renderCreateCircle(); break;
      case 'mk-icon': mkDraft.icon = d.v; renderCreateCircle(); break;
      case 'mk-joinmode': mkDraft.joinMode = d.v; renderCreateCircle(); break;
      case 'mk-edit': openCreateCircle(d.id); break;
      case 'mk-dissolve': mkDissolve(d.id); break;
      /* ---- v0.18 圈子动态发布 / 评论 / 删除 ---- */
      case 'circle-publish': openCirclePublish(curCircleId); break;
      case 'pub-circle': togglePubCircle(d.v); break;
      case 'cpost-cmt': {
        ccOpen[d.id] = !ccOpen[d.id];
        if (curCircleId) openCircleDetail(curCircleId);
        break;
      }
      case 'cpost-send': sendCircleComment(d.id); break;
      case 'cpost-del': deleteCirclePost(d.id); break;
      case 'cpost-like': {
        var cp2 = (S().circlePosts || []).filter(function (x) { return x.id === d.id; })[0];
        if (!cp2) break;
        if (cp2.liked) { cp2.likes--; cp2.liked = false; } else { cp2.likes++; cp2.liked = true; }
        DB.save();
        if (curCircleId) openCircleDetail(curCircleId);
        break;
      }
      case 'mymoments': renderMyMoments(); break;
      case 'accept-req': acceptReq(d.id); break;
      case 'reject-req':
        if ((S().requests || []).some(function (r) { return r.userId === d.id && r.dir === 'out'; })) break;
        S().requests = S().requests.filter(function (r) { return r.userId !== d.id; });
        DB.save(); renderNewFriends(); renderContacts(); toast('已拒绝', 'ok');
        break;
      case 'cancel-req':
        S().requests = (S().requests || []).filter(function (r) { return !(r.userId === d.id && r.dir === 'out'); });
        DB.save(); renderNewFriends(); renderContacts(); toast('已撤回申请', 'ok');
        break;
      case 'greet': openGreet(d.id, 'plaza'); break;
      case 'greet-opt': {
        greetChoice = d.v;
        $('#greetCustom').value = '';
        $$('#greetOpts .greet-opt').forEach(function (n) { n.classList.toggle('on', n.dataset.v === d.v); });
        break;
      }
      case 'close-greet': $('#ov-greet').classList.remove('show'); break;
      case 'send-greet': sendGreet(); break;
      case 'join-group': joinGroup(); break;
      case 'ob-tag': {
        var iob = obSelected.indexOf(d.v);
        if (iob >= 0) obSelected.splice(iob, 1); else obSelected.push(d.v);
        renderOnboard();
        break;
      }
      case 'ob-skip': finishOnboard(true); break;
      case 'follow': follow(d.id); break;
      case 'like': likeMoment(d.id); break;
      case 'comment': commentMoment(d.id); break;
      case 'submit-cm': submitComment(d.id); break;
      case 'plaza-comment': plazaComment(d.id); break;
      case 'submit-pcm': submitPlazaComment(d.id); break;
      case 'del-moment':
        confirmBox('删除动态', '删除后不可恢复', function () {
          S().moments = S().moments.filter(function (m) { return m.id !== d.id; });
          DB.save(); renderAll();
          if ($('#ov-mymoments').classList.contains('show')) renderMyMoments();
          toast('已删除', 'ok');
        });
        break;
      case 'discover-tab': setDiscover(d.v); break;
      case 'plaza-like': {
        togglePostLike(); renderPlaza();
        break;
      }
      case 'post-like': togglePostLike(); break;
      /* v0.37 瀑布流 */
      case 'open-plaza': openPostDetail('plaza', d.id); break;
      case 'close-post-detail': closeOv('ov-post-detail'); break;
      /* ---- v0.59 全局搜索 ---- */
      case 'open-search': searchOpen(); break;
      case 'sr-clear': srClear(); break;
      case 'sr-use': {
        var si = $('#globalSearch'); if (si) si.value = d.v;
        searchInput(d.v); break;
      }
      case 'sr-clearhist': srClearHist(); break;
      case 'sr-delhist': srDelHist(d.v); break;
      case 'sr-tag': srGoTag(d.v); break;
      case 'sr-expand': srExpandToggle(d.v); break;
      case 'sr-open-post': srOpenPost(d.kind, d.id); break;
      case 'sr-open-circle': srOpenCircle(d.id); break;
      case 'open-moment': openPostDetail('moment', d.id); break;
      /* ---- v0.59 详情评论（回复某人 / 发送）---- */
      case 'pd-reply': pdReply(d.id); break;
      case 'pd-send': pdSend(); break;
      case 'pd-share': pdShare(); break;
      /* v0.70 点底部圆点直接切图 */
      case 'pd-go': pdGo(parseInt(d.i, 10) || 0); break;
      /* ---- v0.59 图片查看器 ---- */
      case 'open-viewer': {
        var cpv = curPost && postById(curPost.kind, curPost.id);
        openViewer(cpv && cpv.imgs, parseInt(d.i, 10) || 0);
        break;
      }
      case 'viewer-prev': viewerGo(-1); break;
      case 'viewer-next': viewerGo(1); break;
      case 'viewer-save': toast('已保存到相册', 'ok'); break;
      case 'close-viewer': closeOv('ov-viewer'); break;
      case 'wf-like': {
        var pw = S().plaza.filter(function (x) { return x.id === d.id; })[0]; if (!pw) break;
        if (pw.liked) { pw.likes--; pw.liked = false; } else { pw.likes++; pw.liked = true; A.track('plaza_like', { id: pw.id }); }
        DB.save();
        var wcard = document.querySelector('.wf-card[data-id="' + d.id + '"]');
        if (wcard) wcard.outerHTML = plazaCardHtml(pw);
        if ($('#ov-post-detail').classList.contains('show') && curPost === d.id) renderPostDetail(d.id);
        break;
      }
      /* v0.59：评论改为底部常驻输入条（不再在正文里插一个临时输入框）。
         正文里插框会把评论区顶下去，发完还要再滚回来；底部条的位置是稳定的。 */
      case 'pd-comment': curPostReply = null; syncPdBar(); pdFocus(); break;
      case 'submit-pd-cm': {
        var pd = S().plaza.filter(function (x) { return x.id === d.id; })[0]; if (!pd) return;
        var pdel = $('#pdi-' + d.id), pdv = pdel && pdel.value.trim(); if (!pdv) return;
        pd.comments = pd.comments || []; pd.comments.push({ userId: 'me', text: pdv, ts: Date.now() });
        DB.save(); A.track('plaza_comment', { id: d.id });
        renderPostDetail(d.id); renderPlaza();
        toast('评论已发送', 'ok');
        break;
      }
      case 'pf-sort': plazaFilter.sort = d.v; renderPlaza(); A.track('plaza_filter', { sort: d.v }); break;
      case 'pf-tag': plazaFilter.tag = d.v; renderPlaza(); A.track('plaza_filter', { tag: d.v }); break;
      case 'publish': openPublish(); break;
      /* v0.22 空状态主行动 */
      case 'focus-input': { var ci = $('#chatInput'); if (ci) ci.focus({ preventScroll: true }); break; }
      case 'go-plaza': switchTab('discover'); setDiscover('plaza'); break;
      /* v0.65：好友流空态的发布引导——先落到广场，再打开发布页，保持「入口在广场」单一事实 */
      case 'go-plaza-publish': switchTab('discover'); setDiscover('plaza'); openPublish(); break;
      case 'go-circles': switchTab('circles'); break;
      case 'clear-contact-search': {
        var cs = $('#contactSearch');
        if (cs) { cs.value = ''; renderContacts(); }
        break;
      }
      /* v0.52 个人主页：更多菜单 / 备注 / 添加好友 / 删除好友 */
      case 'prof-more': profMore(); break;
      case 'remark-open': closeOv('ov-profmore'); openRemark(d.id); break;
      case 'rec-open': openRecommend(d.id); break;
      case 'remark-save': saveRemark(); break;
      case 'req-open': openReqMsg(d.id); break;
      case 'req-send': sendReqMsg(); break;
      case 'del-friend': closeOv('ov-profmore'); deleteFriend(d.id); break;
      case 'report-user': closeOv('ov-profmore'); openReport(d.id, 'user'); break;
      /* v0.51 好友字母索引：点/滑到某个字母 → 列表滚到对应分组 */
      case 'ct-jump': ctJump(d.v); break;
      /* v0.22 设计规范展示页 + 演示交互 */
      case 'design': renderDesignSystem(); openOv('ov-design'); break;
      case 'demo-loading': btnLoading(el, function () {}, 1100); break;
      case 'demo-toast': toast(d.v === 'ok' ? '操作成功，已保存' : (d.v === 'err' ? '操作失败，请重试' : '这是一条普通提示'), d.v === 'plain' ? '' : d.v); break;
      case 'demo-switch': if (el) el.classList.toggle('on'); break;
      case 'do-publish': {
        /* v0.22：先做前端校验（即时错误反馈），再走 加载→完成 的按钮状态机 */
        var pt = ($('#pubText').value || '').trim();
        if (!pt && !pubDraft.imgs.length) { toast('写点什么或选张图吧', 'err'); break; }
        if (pt.length > 200) { toast('正文最多 200 字', 'err', 'err'); break; }
        if (el && !el.classList.contains('loading')) btnLoading(el, function () { doPublish(); });
        break;
      }
      case 'pub-img': {
        var i = parseInt(d.v, 10), ix = pubDraft.imgs.indexOf(i);
        if (ix >= 0) pubDraft.imgs.splice(ix, 1);
        else if (pubDraft.imgs.length < 3) pubDraft.imgs.push(i);
        else return toast('最多选 3 张', 'err');
        openPublish();
        break;
      }
      /* v0.65：可见范围切换后立刻重渲染——选「仅自己可见」要马上把已选圈子清空并锁住 */
      case 'pub-vis': pubDraft.visibility = d.v; openPublish({ circles: pubDraft.circles }); break;
      case 'pub-tag': {
        var ix2 = pubDraft.tags.indexOf(d.v);
        if (ix2 >= 0) pubDraft.tags.splice(ix2, 1); else pubDraft.tags.push(d.v);
        openPublish();
        break;
      }
      case 'edit': openEdit(); break;
      case 'do-edit': doEdit(); break;
      case 'edit-tag': {
        var t = d.v, ix3 = S().me.tags.indexOf(t);
        if (ix3 >= 0) S().me.tags.splice(ix3, 1); else S().me.tags.push(t);
        DB.save(); renderEditTags();
        break;
      }
      case 'settings': renderSettings(); break;
      /* ---- v0.36 平台系统消息 ---- */
      case 'sysmsg': renderSysMsg(); break;
      case 'sys-tab': renderSysMsg(d.v); break;
      case 'sys-open': openSysDetail(d.id); break;
      case 'sys-back': sysBack(); break;
      case 'sys-read-all': sysReadAll(); break;
      case 'sys-report': sysReport(); break;
      case 'sys-del': sysDeleteCur(); break;
      case 'toggle-theme': {
        var th = S().settings.theme === 'dark' ? 'light' : 'dark';
        S().settings.theme = th; DB.save(); applyTheme();
        /* v0.36 修复：只有正在看设置页时才重渲染。此前直接调 renderSettings()
           会连带 openOv('ov-settings')，导致从侧栏切主题时莫名弹出设置页。 */
        if ($('#ov-settings').classList.contains('show')) renderSettings();
        toast(th === 'dark' ? '已切换深色模式 🌙' : '已切换浅色模式 ☀️');
        break;
      }
      /* ---- v0.44 开屏页 ---- */
      case 'splash-skip': endSplash(); break;
      case 'replay-splash': playSplash(null, true); break;

      /* ---- v0.45 登录 / 注册 ---- */
      case 'open-auth': openAuth(); break;
      case 'open-profile': enterProfile(); break;
      case 'auth-ck': {
        var ag = A_();
        ag.agreements = ag.agreements || {};
        ag.agreements.checked = !ag.agreements.checked;
        if (ag.agreements.checked) ag.agreements.version = (window.AUTH_CONFIG.agreements || {}).version || '';
        DB.save(); renderAuthEntry();
        break;
      }
      case 'auth-doc': toast((d.v === 'terms' ? '《用户协议》' : '《隐私政策》')); break;
      case 'auth-send': {
        var ph = ($('#authPhone').value || '').trim();
        if (!window.Auth.isPhone(ph)) { showErr('#phoneErr', '请输入正确的 11 位手机号'); break; }
        if (!agreed()) { shakeAgree(); break; }
        showErr('#phoneErr', '');
        window.Auth.sendCode(ph, { agreed: true }).then(function (r) {
          if (!r.ok) { showErr('#phoneErr', r.msg); if (r.cooldown) startResend(r.cooldown); return; }
          A.track('sms_sent', { from: 'manual' });
          gotoCode(ph, r, 'manual');
        });
        break;
      }
      case 'auth-resend': {
        if (!authPhone) break;
        window.Auth.sendCode(authPhone, { agreed: true }).then(function (r) {
          if (!r.ok) { showErr('#codeErr', r.msg); if (r.cooldown) startResend(r.cooldown); return; }
          A.track('sms_resend', {});
          gotoCode(authPhone, r);
        });
        break;
      }
      case 'auth-verify': {
        var code = codeValue();
        if (code.length !== (window.AUTH_CONFIG.sms.codeLen || 6)) {
          $('#codeBox').classList.add('err'); showErr('#codeErr', '请输入 6 位验证码'); break;
        }
        $('#codeBox').classList.remove('err');
        authLoading(true, '验证中…');
        window.Auth.verify(authPhone, code).then(function (r) {
          if (!r.ok) { authLoading(false); $('#codeBox').classList.add('err'); showErr('#codeErr', r.msg); return; }
          if (authFlow === 'bind' && authThird) {
            window.Auth.oauthBind(authThird.openId, authPhone, code, 'merge').then(function (b) {
              if (!b.ok) { authLoading(false); showErr('#codeErr', b.msg); return; }
              finishLogin('me', authThird.provider, authPhone, { newUser: b.isNew, nick: authThird.nick, avatar: authThird.avatar });
            });
            return;
          }
          authLoading(false);
          /* 两种取号方式共用同一套校验与落地逻辑，只在埋点上区分来源 */
          var m = (authCodeSrc === 'oneclick') ? 'oneclick' : 'sms';
          if (r.isNew) enterProfile();
          else finishLogin('me', m, authPhone, {});
        });
        break;
      }
      case 'auth-back':
        authFlow = 'login'; authThird = null; authCodeSrc = 'manual';
        clearErrs(); stopResend();
        showPanel('ap-entry'); renderAuthEntry();
        break;
      /* 一键登录：取号只解决「号码从哪来」，不替代身份验证。
         取到号后仍需短信验证码，验通过才允许进入 —— 与手输号码走同一条验证链路。 */
      case 'auth-oneclick': {
        if (!agreed()) { shakeAgree(); break; }
        var oc = ocResult;
        if (!oc || !oc.ok) {
          /* 取号失败/无号：直接切手动态，不出现空白或不可点状态 */
          authPhoneManualForced = true; renderAuthEntry();
          toast((oc && oc.msg) || '未获取到本机号码，请手动输入');
          break;
        }
        /* 若产品采用运营商网关认证（真·免密），把 config.oneclick.requireSms 置 false 即直登，
           UI 与其余链路无需改动。 */
        if (window.AUTH_CONFIG.oneclick.requireSms === false) {
          authLoading(true, '本机号码登录中…');
          window.Auth.oneClick().then(function (r) {
            if (!r.ok) { authLoading(false); toast(r.msg); renderAuthEntry(); return; }
            finishLogin('me', 'oneclick', r.phone, {});
          });
          break;
        }
        authLoading(true, '发送验证码…');
        window.Auth.sendCode(oc.phone, { agreed: true }).then(function (r) {
          authLoading(false);
          if (!r.ok) { showErr('#aocErr', r.msg); return; }
          A.track('sms_sent', { from: 'oneclick' });
          gotoCode(oc.phone, r, 'oneclick');
        });
        break;
      }
      /* 手机号区视图切换：一键 ⇄ 手动。只改视图，不动提交逻辑与接口调用 */
      case 'auth-toggle-phone': {
        authPhoneManualForced = (d.v === 'manual');
        clearErrs(); renderAuthEntry();
        if (d.v === 'manual') { try { $('#authPhone').focus({ preventScroll: true }); } catch (e) {} }
        A.track('auth_toggle_phone', { to: d.v });
        break;
      }
      case 'auth-oauth': doOauth(d.v); break;
      /* ---- v0.48 完善资料 ---- */
      case 'prof-pick-avatar': profPickAvatar(); break;
      case 'prof-ava': {
        authAvatar = d.v;
        profAvatar = { type: 'preset', value: d.v };
        renderProfAvatar();
        break;
      }
      case 'prof-save': profSave(); break;
      case 'prof-skip': profSkip(); break;
      case 'crop-cancel': cropCancel(); break;
      case 'crop-done': cropDone(); break;
      case 'account-security': renderAccountSecurity(); break;
      /* ---- v0.77 通知中心 / 通知设置 / 关注粉丝 / 账号安全 / 邀请进群 / 群绑圈 ---- */
      case 'notifications': renderNotifications(); break;
      case 'noti-tab': notiFilter = d.v || null; renderNotifications(); break;
      case 'noti-open': notiOpen(d.id); break;
      case 'noti-read-all':
        (S().notifications || []).forEach(function (n) { n.read = true; });
        DB.save(); renderNotifications(); toast('已全部标记为已读', 'ok'); break;
      case 'notify-settings': renderNotifySettings(); break;
      case 'notify-toggle':
        S().settings[d.v] = !S().settings[d.v]; DB.save(); renderNotifySettings(); break;
      case 'open-following': renderFollow('following'); break;
      case 'open-followers': renderFollow('followers'); break;
      case 'as-phone': toast('换绑手机号（后续接入）'); break;
      case 'as-verify': toast(S().me.verified ? '已完成实名认证' : '提交实名认证（后续接入）'); break;
      case 'as-pwd': toast('修改登录密码（后续接入）'); break;
      case 'as-wechat': toast('绑定微信（后续接入）'); break;
      case 'as-devices': toast('登录设备管理（后续接入）'); break;
      case 'as-delete':
        confirmBox('注销账号', '注销后账号将永久删除，资料、动态、好友关系、会员权益与野遇币均不可恢复。确定注销？', function () {
          doLogout(false); toast('账号已注销');
        }, '注销', '取消');
        break;
      case 'ginv-toggle': {
        var gi = ginvSelected.indexOf(d.id);
        if (gi >= 0) ginvSelected.splice(gi, 1); else ginvSelected.push(d.id);
        renderGroupInvite(ginvGid); break;
      }
      case 'ginv-send':
        if (!ginvSelected.length) { toast('请先选择好友', 'err'); break; }
        toast('已向 ' + ginvSelected.length + ' 位好友发送邀请', 'ok');
        closeOv('ov-groupinvite'); ginvSelected = []; break;
      case 'ginv-cancel': closeOv('ov-groupinvite'); ginvSelected = []; break;
      case 'circle-bind': openBindSheet(d.id); break;
      case 'circle-bind-do': {
        var gb = (S().conversations || []).filter(function (c) { return c.id === d.gid; })[0];
        S().circleGroupBinds.push({ id: 'gb' + Date.now(), circleId: d.cid, groupId: d.gid, groupTitle: gb ? gb.title : '群聊', boundAt: Date.now() });
        DB.save(); closeOv('ov-groupinvite');
        if ($('#ov-circledetail').classList.contains('show')) openCircleDetail(d.cid);
        toast('已绑定群聊', 'ok'); break;
      }
      case 'circle-unbind': {
        S().circleGroupBinds = S().circleGroupBinds.filter(function (b) { return b.id !== d.id; });
        DB.save();
        if ($('#ov-circledetail').classList.contains('show')) openCircleDetail(curCircleId);
        toast('已解绑', 'ok'); break;
      }
      case 'logout':
        confirmBox('退出登录', '退出后本地内容会保留，重新登录即可恢复。', function () { doLogout(false); }, '退出', '再想想');
        break;

      case 'toggle-set':
        /* v0.33 服务端二次校验：即便绕过 UI 也开不了会员专属能力 */
        if (d.v === 'stealth' && !En.can('privacy.stealth').allowed) { renderVip(); break; }
        S().settings[d.v] = !S().settings[d.v]; DB.save(); renderSettings();
        toast(S().settings[d.v] ? '已开启' : '已关闭');
        break;
      case 'priv-set': {
        /* 会员能力开关被点击 → 引导至会员中心（upsell 等级由 policy 推导） */
        var dec = En.can(d.t);
        var tgt = dec.upsell ? dec.upsell.meta : TIER_META.svip;
        confirmBox(tgt.txt + ' 专属能力',
          '「' + (dec.ent ? dec.ent.name : '该能力') + '」为 ' + tgt.full + ' 特权，开通后立即生效。',
          function () { renderVip(); }, '查看 ' + tgt.txt, '知道了');
        A.track('entitlement_upsell_view', { key: d.t, target: tgt.txt });
        break;
      }
      case 'order-refund': {
        var orf = (S().orders || []).filter(function (o) { return o.id === d.id; })[0];
        if (!orf || orf.refund) break;
        confirmBox('申请退款？', '退款将按原支付方式退回（微信 / 支付宝 / 野遇币），预计 1-3 个工作日到账。', function () {
          orf.refund = { status: 'submitted', ts: Date.now() }; DB.save(); renderOrders(); toast('退款申请已提交', 'ok');
        });
        break;
      }
      case 'order-receipt': {
        var orec = (S().orders || []).filter(function (o) { return o.id === d.id; })[0];
        if (!orec) break;
        toast('电子凭证：' + orec.no + ' · ¥' + orec.amount + ' · 已支付', 'ok');
        break;
      }
      case 'feedback': openFeedback(); break;
      case 'close-fb': $('#fbMask').classList.remove('show'); break;
      case 'close-cf': {
        $('#cfMask').classList.remove('show'); confirmCb = null;
        var okB2 = $('#cfOk'), noB2 = $('#cfMask [data-action="close-cf"]');
        if (okB2) okB2.textContent = '确定';
        if (noB2) noB2.textContent = '取消';
        break;
      }
      case 'block': blockUser(d.id); break;
      case 'unblock': unblockUser(d.id); break;
      case 'blacklist': renderBlacklist(); break;
      case 'my-reports': renderReports(); break;
      case 'report': openReport(d.id || curConv, d.v || 'user'); break;
      case 'close-report': closeOv('ov-report'); curReport = null; break;
      case 'report-reason': submitReport(d.v); break;
      case 'visitors': renderVisitors(); break;
      case 'submit-fb': submitFeedback(); break;
      case 'conv-act': openConvAct(d.id); break;
      case 'close-convact': closeOv('ov-convact'); break;
      case 'conv-do': doConvAct(d.id, d.op); break;
      case 'new-chat': renderPlusMenu('chats'); break;
      case 'read-all': markAllRead(); break;
      case 'wallet': renderWallet(); break;
      case 'coin-recharge': doCoinRecharge(d.v); break;
      case 'vip': renderVip(); break;
      case 'niceid': renderNice(); break;
      case 'add-friend': renderAddFriend(); break;
      /* v0.54：只有自己的二维码可查看（名片二维码属个人凭证，不能被好友取出转发）。
         旧入口 user-qr 彻底下线；这里保留防御，任何残留调用都不会再渲染出他人的码。 */
      case 'my-qr': renderQr('me'); break;
      case 'user-qr': {
        if (d.id === 'me') renderQr('me');
        else toast('只能查看自己的二维码', 'err');
        break;
      }
      case 'qr-share': qrShare(); break;
      case 'qr-save': qrSave(); break;
      case 'qr-copy': qrCopyId(); break;
      case 'qr-scan': closeOv('ov-qr'); openScan(); break;
      case 'do-scan': doScan(); break;
      case 'pick-mention': pickMention(d.id); break;
      case 'pm': {
        var pa = d.v;
        if (pa === 'create-group') openCreateGroup();
        else if (pa === 'add-friend') renderAddFriend();
        else if (pa === 'scan') openScan();
        else if (pa === 'mygroups') renderGroupList();
        else if (pa === 'group-info') openGroupInfo();
        else if (pa === 'view-profile') openProfile(d.id);
        else if (pa === 'search-msg') renderSearchMsg();
        else if (pa === 'clear-chat') clearChat();
        else if (pa === 'block') {
          var bu = U(d.id);
          confirmBox('拉黑 ' + bu.name + '？', '拉黑后你们看不到彼此的内容，也无法互发消息。可在设置-黑名单解除。', function () { blockUser(d.id); }, '拉黑', '取消');
        }
        else if (pa === 'unblock') unblockUser(d.id);
        else if (pa === 'report') openReport(d.id, 'user');
        else if (pa === 'report-group') openReport(curConv, 'group');
        closePlusMenu();
        break;
      }
      case 'send-req': sendFriendReq(d.id); break;
      case 'vip-auto-toggle': {
        var va = S().me.vip; if (!va || !va.auto) break;
        va.autoRenew = !(va.autoRenew !== false); DB.save(); renderVip(); renderMe();
        toast(va.autoRenew !== false ? '已开启自动续费' : '已关闭自动续费', 'ok');
        break;
      }
      case 'vip-cancel': {
        var vc = S().me.vip; if (!vc || !vc.auto) break;
        confirmBox('关闭自动续费？', '关闭后当前会员有效期保留至 ' + fmtShort(vc.expire) + '，到期后不再自动续费。你仍可随时重新开启。', function () {
          vc.autoRenew = false; DB.save(); renderVip(); renderMe(); toast('已关闭自动续费', 'ok');
        });
        break;
      }
      case 'vip-resume': {
        var vr = S().me.vip; if (!vr || !vr.auto) break;
        vr.autoRenew = true; DB.save(); renderVip(); renderMe(); toast('已重新开启自动续费', 'ok');
        break;
      }
      case 'chat-more': openChatMore(); break;
      case 'all-members': renderMembers(); openOv('ov-members'); break;
      /* ---- v0.32 群聊信息：补全此前"能渲染、点了没反应"的全部入口 ---- */
      case 'leave-group': leaveGroup(false); break;
      case 'dissolve-group': leaveGroup(true); break;
      case 'grp-toggle': grpToggle(d.v); break;
      case 'invite-member': inviteMembers(); break;
      case 'member-act': memberActions(d.id); break;
      case 'member-do': memberDo(d.v, d.id); break;
      case 'remove-mode': toggleRemoveMode(); break;
      case 'remove-member': removeMember(d.id); break;
      case 'do-grpedit': doGroupEdit(); break;
      /* v0.32：群名称/群公告的 action 由 infoRow 间接传值，静态扫描易漏 —— 此两项此前同样无 handler */
      case 'edit-title': openGroupEdit('title'); break;
      case 'edit-announce': openGroupEdit('announce'); break;
      /* ---- v0.32 通用选人器 ---- */
      case 'close-picker': closePicker(); break;
      case 'picker-toggle': pickerToggle(d.id); break;
      case 'search-msg': renderSearchMsg(); break;
      case 'close-search-msg': closeOv('ov-searchmsg'); break;
      case 'msg-act': openMsgAct(d.id); break;
      case 'close-msgact': closeOv('ov-msgact'); break;
      case 'tip-close': { var t = $('#chatTip'); if (t) t.remove(); try { localStorage.setItem('yeyu_lp_tip', '1'); } catch (e) {} break; }
      case 'msg-do': {
        if (d.v === 'recall') doRecall(d.id);
        else if (d.v === 'quote') doQuote(d.id);
        else if (d.v === 'copy') doCopy(d.id);
        else if (d.v === 'forward') renderForward(d.id);
        else if (d.v === 'del') doDelMsg(d.id);
        break;
      }
      case 'forward-to': doForward(curForwardMid, d.id); break;
      case 'quote-close': curQuote = null; $('#quoteBar').style.display = 'none'; break;
      case 'ext-img': sendImage(); break;
      case 'ext-voice': startVoice(); break;
      case 'ext-loc': sendLocation(); break;
      case 'ext-card': pickCard(); break;
      case 'ext-ann': quickAnnounce(); break;
      case 'voice-send': sendVoice(); break;
      case 'voice-cancel': cancelVoice(); break;
      case 'nice-kind': niceFilter = d.v; renderNice(); break;
      case 'buy-nice': buyNice(d.v); break;
      case 'vip-plan': curVipPlan = d.v; renderVip(); break;
      case 'vip-pay': openVipPay(); break;
      case 'vip-upgrade': openVipUpgrade(); break;
      case 'vip-renew': {
        var rp = planOf(En.subject().plan);
        if (rp) openVipPay(rp.id);
        break;
      }
      /* v0.34：权益分组手风琴 + 规划区展开（降噪：默认收起，按需展开） */
      /* v0.34：权益分组手风琴。注意必须用「当前实际展开态」取反，
         不能直接 !vipOpenGroups[d.v] —— 初始为 undefined 时会取反成 true，
         导致默认摊开的分组第一次点击毫无反应（真实交互 bug）。 */
      case 'er-toggle': {
        var cur = vipOpenGroups[d.v];
        if (typeof cur !== 'boolean') {
          cur = ENTITLEMENTS.filter(function (e) { return e.g === d.v; }).length <= ER_COMFORT;
        }
        vipOpenGroups[d.v] = !cur;
        var keepTop = $('#vipBody').parentElement ? $('#vipBody').parentElement.scrollTop : 0;
        renderVip();
        (function () {
          var sc = $('#vipBody').parentElement;
          if (!cur && sc) sc.scrollTop = keepTop;          // 展开时保持滚动位置，避免视口跳动
        })();
        break;
      }
      case 'er-road': vipShowRoad = !vipShowRoad; renderVip(); break;
      case 'orders': renderOrders(); break;
      case 'toast': if (d.v) toast(d.v); break;
      default: break;
    }
  }

  function openFeedback() {
    var st = $('#fbStars');
    st.innerHTML = [1, 2, 3, 4, 5].map(function (n) {
      return '<span data-star="' + n + '" style="color:' + (n <= fbRating ? 'var(--gold)' : 'var(--n-200)') + '">★</span>';
    }).join('');
    if (!st._bound) {
      st._bound = true;
      st.addEventListener('click', function (ev) {
        var s = ev.target.dataset && ev.target.dataset.star;
        if (s) { fbRating = parseInt(s, 10); openFeedback(); }
      });
    }
    $('#fbMask').classList.add('show');
    A.track('feedback_open', {});
  }
  function submitFeedback() {
    var t = $('#fbText').value.trim();
    A.addFeedback(t, fbRating);
    $('#fbText').value = ''; $('#fbMask').classList.remove('show');
    toast('感谢反馈！已记录', 'ok');
  }

  /* ================= 启动 ================= */
  function clock() {
    var d = new Date();
    $('#sbTime').textContent = d.getHours() + ':' + pad(d.getMinutes());
  }
  /* ================= 右上角加号菜单（消息页 / 聊天页） ================= */
  function renderPlusMenu(ctx) {
    var items;
    if (ctx === 'chats') {
      items = [
        { i:'👥', t:'发起群聊', act:'create-group' },
        { i:'➕', t:'添加好友', act:'add-friend' },
        { i:'📷', t:'扫一扫',   act:'scan' },
        { i:'💬', t:'我的群聊', act:'mygroups' }
      ];
    } else {
      var c = conv(curConv); if (!c) { return; }
      if (c.type === 'group') {
        items = [
          { i:'ℹ️', t:'群聊信息', act:'group-info' },
          { i:'💬', t:'我的群聊', act:'mygroups' },
          { i:'🔍', t:'搜索聊天记录', act:'search-msg' },
          { i:'🧹', t:'清空聊天记录', act:'clear-chat' },
          { i:'⚠️', t:'举报群聊', act:'report-group', danger:true }
        ];
      } else {
        items = [
          { i:'👤', t:'个人资料', act:'view-profile', id:c.userId },
          { i:'🔍', t:'搜索聊天记录', act:'search-msg' },
          { i:'🧹', t:'清空聊天记录', act:'clear-chat' },
          (isBlocked(c.userId)
            ? { i:'✅', t:'解除拉黑', act:'unblock', id:c.userId }
            : { i:'🚫', t:'拉黑', act:'block', id:c.userId, danger:true }),
          { i:'⚠️', t:'举报', act:'report', id:c.userId, danger:true }
        ];
      }
    }
    $('#plusMenu').innerHTML = items.map(function (it) {
      return '<div class="pm" data-action="pm" data-v="' + it.act + '"' + (it.id ? ' data-id="' + it.id + '"' : '') + (it.danger ? ' style="color:var(--error-fg)"' : '') + '>' +
        '<span class="pi">' + it.i + '</span>' + it.t + '</div>';
    }).join('');
    $('#plusMenu').classList.add('show');
  }
  function closePlusMenu() { $('#plusMenu').classList.remove('show'); }

  function openChatMore() {
    var c = conv(curConv); if (!c) return;
    if (c.type === 'group') openGroupInfo();
    else openProfile(c.userId);
    A.track('chat_more', { type: c.type });
  }

  /* ================= 我的群聊列表 ================= */
  function renderGroupList() {
    var groups = S().conversations.filter(function (c) { return c.type === 'group'; });
    $('#groupListBody').innerHTML = groups.length ? groups.map(function (c) {
      var inIt = c.members.indexOf('me') >= 0;
      return '<div class="row" data-action="open-chat" data-id="' + c.id + '">' + groupAvatar(c) +
        '<div class="row-title"><b>' + esc(c.title) + '</b><small>' + c.members.length + ' 人' + (inIt ? '' : ' · 未加入') + '</small></div>' +
        '<span class="chev">›</span></div>';
    }).join('') : emptyBlock('💬', '还没有群聊', '点消息页 ＋ 发起一个');
    openOv('ov-grouplist');
  }

  /* ================= 添加好友 ================= */
  function renderAddFriend() {
    var st = S(), q = ($('#addFriendInput').value || '').trim().toLowerCase();
    var list = st.users.filter(function (u) {
      if (u.id === 'me') return false;
      if (st.friends.indexOf(u.id) >= 0) return false;
      if (st.requests.some(function (r) { return r.userId === u.id && r.dir !== 'out'; })) return false;
      if (!q) return true;
      return (u.name + u.py + u.city + u.yeyuId).toLowerCase().indexOf(q) >= 0;
    });
    $('#addFriendBody').innerHTML = q && !list.length
      ? emptyBlock('🔍', '未找到匹配的用户', '可尝试手机号 / 野遇号 / 昵称')
      : list.map(function (u) {
        var outReq = (st.requests || []).some(function (r) { return r.userId === u.id && r.dir === 'out'; });
        return '<div class="row">' + avatarHtml(u, '') +
          '<div class="row-title"><b>' + esc(u.name) + identityBadges(u) + '</b><small>' + esc(u.city) + ' · ' + esc(u.sign || '') + '</small></div>' +
          (outReq
            ? '<button class="btn gray sm" disabled>等待验证</button>'
            : '<button class="btn sm" data-action="send-req" data-id="' + u.id + '">添加</button>') + '</div>';
      }).join('');
    openOv('ov-addfriend');
  }
  function sendFriendReq(uid) {
    var u = U(uid), st = S();
    if ((st.requests || []).some(function (r) { return r.userId === uid && r.dir !== 'out'; })) return toast('对方已向你发起好友申请，去新的朋友处理', 'err');
    if ((st.requests || []).some(function (r) { return r.userId === uid && r.dir === 'out'; })) return toast('申请已发送，等待对方通过', 'err');
    st.requests.push({ userId: uid, time: Date.now(), msg: '我是' + st.me.name + '，想加你为好友', dir: 'out' });
    DB.save(); A.track('friend_request', { user: uid });
    closeOv('ov-addfriend'); toast('已向 ' + u.name + ' 发送好友申请', 'ok');
  }
  /* ================= 二维码 / 扫一扫 ================= */
  var curQrUid = 'me';
  var QR_ICO = { 'qr-save': 'save', 'qr-share': 'share', 'qr-copy': 'copy', 'qr-scan': 'scan' };
  function qrPayload(uid) { return 'https://yeyu.app/add/' + uid; }
  function qrCopy(t) { try { navigator.clipboard && navigator.clipboard.writeText(t); return true; } catch (e) { return false; } }
  /* v0.54：二维码只属于自己的（他人主页已无入口）。
     这里加一道硬拦，任何遗留调用都拿不到别人的码——名片码一旦可被他人取出，
     就能截图、转发进群，当事人对"谁拿着我的码加了谁"彻底失控。 */
  function renderQr(uid) {
    if (uid && uid !== 'me') { toast('只能查看自己的二维码', 'err'); return; }
    renderMyQr();
  }
  /* v0.61：名片码重做。旧版是「一张白卡 + 两个灰按钮 + 三段说明文字」，
     三处硬伤：① 按钮比卡片窄一截、宽度不对齐；② 说明里写阶段性与演示性字眼
     这种内部自述出现在产品界面上；③ 码区四周只有 10px 留白、无任何品牌识别，
     截图发出去认不出是野遇的码。这里改成：封面(品牌渐变+远山) → 头像悬浮 →
     名字/属地/可点野遇号 → 白底码区(四角定位标+中心品牌徽标) → 四枚等宽操作钮
     → 一条隐私承诺胶囊。码区仍强制白底，暗色主题下也不反转，否则手机扫不出来。 */
  function renderMyQr() {
    var u = S().me;
    var num = u.yeyuNum;
    var nice = niceInfo(u);            // v0.71：名片码上的靓号标识（与我的页同一套）
    $('#qrTitle').textContent = '我的二维码';
    $('#qrHead').innerHTML = avatarHtml(u, 'lg') +
      '<div class="nm">' + esc(u.name) + identityBadges(u) + '</div>' +
      '<div class="sub">' + esc(u.gender) + ' · ' + u.age + ' 岁 · ' + esc(u.city) + '</div>' +
      '<button class="yid' + (nice ? ' nice' : '') + '" data-action="qr-copy" title="复制野遇号">' +
        svgIcon('copy') + '野遇号 ' + esc(num) + idTagHtml(nice) + '</button>';
    var box = $('#qrBox');
    try {
      var qr = qrcode(0, 'M');
      qr.addData(qrPayload('me'));
      qr.make();
      /* 中心徽标只遮住约 3% 面积，M 级（15% 容错）余量充足，无需提到 H 级把码变密 */
      box.innerHTML = qr.createSvgTag(6, 6) +
        '<span class="qr-corner tl"></span><span class="qr-corner tr"></span>' +
        '<span class="qr-corner bl"></span><span class="qr-corner br"></span>' +
        '<span class="qr-badge">' + svgIcon('qr') + '</span>';
    } catch (err) {
      box.innerHTML = '<div style="color:var(--error-fg);font-size:var(--fs-12)">二维码生成失败</div>';
    }
    $('#qrTip').textContent = '扫一扫上面的二维码，加我为好友';
    $('#qrNote').innerHTML = svgIcon('lock') + '<span>仅本人可见 · 他人无法查看或转发我的名片码</span>';
    /* 操作钮图标在 JS 注入：图标路径只有一份（ICONS），HTML 里不重复硬编码 */
    $$('#ov-qr .qr-act').forEach(function (b) {
      var k = QR_ICO[b.dataset.action], box = b.querySelector('.qa-ico');
      if (k && box && !box.firstChild) box.innerHTML = svgIcon(k);
    });
    curQrUid = 'me';
    openOv('ov-qr');
    A.track('qr_view', { uid: 'me', me: true });
  }
  /* 口头加好友比扫码更常用：野遇号做成可点胶囊，点一下直接复制 */
  function qrCopyId() {
    var num = S().me.yeyuNum || '';
    if (!num) { toast('还没有野遇号', 'err'); return; }
    qrCopy(num);
    toast('野遇号已复制：' + num, 'ok');
    A.track('qr_copy_id', {});
  }
  function qrShare() {
    var link = qrPayload(curQrUid);
    qrCopy('野遇好友邀请：' + link);
    toast('邀请链接已复制，去粘贴给好友吧', 'ok');
    A.track('qr_share', { uid: curQrUid });
  }
  function qrSave() {
    toast('名片码已保存到相册', 'ok');
    A.track('qr_save', { uid: curQrUid });
  }
  function openScan() {
    $('#scanHint').textContent = '将对方的二维码放入框内';
    $('#scanBtn').style.display = '';
    openOv('ov-scan');
    A.track('scan_open', {});
  }
  function doScan() {
    var cands = S().users.filter(function (u) { return u.id !== 'me' && S().friends.indexOf(u.id) < 0; });
    if (!cands.length) { toast('暂时没有可扫描的陌生人', 'err'); return; }
    var u = cands[Math.floor(Math.random() * cands.length)];
    $('#scanHint').textContent = '已识别：' + u.name + ' 的二维码';
    $('#scanBtn').style.display = 'none';
    toast('识别成功：' + u.name, 'ok');
    A.track('scan_resolve', { user: u.id });
    setTimeout(function () { closeOv('ov-scan'); openProfile(u.id); }, 800);
  }

  /* ================= @ 提及 ================= */
  function openMention() {
    var c = conv(curConv); if (!c || c.type !== 'group') return;
    var members = c.members.filter(function (id) { return id !== 'me'; });
    $('#mentionBody').innerHTML = members.length ? members.map(function (id) {
      var u = U(id);
      return '<div class="mention-item" data-action="pick-mention" data-id="' + id + '">' + avatarHtml(u, 'sm') +
        '<div class="row-title"><b>' + esc(u.name) + identityBadges(u) + '</b><small>' + esc(u.city || '') + (u.role && u.role === 'owner' ? ' · 群主' : (u.role === 'admin' ? ' · 管理员' : '')) + '</small></div></div>';
    }).join('') : '<div class="empty" style="padding:20px"><p>群里还没有其他成员</p></div>';
    $('#ov-mention').classList.add('show');
    A.track('mention_open', { conv: c.id });
  }
  function pickMention(uid) {
    var u = U(uid), el = $('#chatInput');
    var tag = '@' + u.name + ' ';
    var s = el.selectionStart || el.value.length, e = el.selectionEnd || el.value.length, v = el.value;
    el.value = v.slice(0, s) + tag + v.slice(e);
    var pos = s + tag.length;
    el.setSelectionRange(pos, pos);
    closeOv('ov-mention');
    el.focus({ preventScroll: true });
    toggleSendBtn();
    A.track('mention_pick', { user: uid });
  }

  /* ================= 聊天记录搜索 ================= */
  function renderSearchMsg() {
    var c = conv(curConv); if (!c) return;
    var q = ($('#searchMsgInput').value || '').trim().toLowerCase();
    var msgs = c.messages.filter(function (m) {
      if (m.from === 'sys' || m.recalled) return false;
      if (!q) return true;
      return (quoteText(m) || '').toLowerCase().indexOf(q) >= 0;
    });
    $('#searchMsgBody').innerHTML = q && !msgs.length
      ? emptyBlock('🔍', '无匹配记录', '换个关键词试试')
      : msgs.map(function (m) {
        var who = m.from === 'me' ? '我' : U(m.from).name;
        var t = quoteText(m) || (m.type === 'img' ? '[图片]' : m.type === 'voice' ? '[语音]' : '[消息]');
        var q2 = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var hl = q ? t.replace(new RegExp('(' + q2 + ')', 'ig'), '<span style="color:var(--error-fg);background:var(--tint-amber-bg);padding:0 2px">$1</span>') : t;
        return '<div class="row" data-action="close-search-msg"><div class="row-title"><b>' + esc(who) + '</b><small>' + timeLabel(m.ts) + '</small></div>' +
          '<div style="font-size:var(--fs-13);color:var(--n-500);padding:4px 0 8px">' + hl + '</div></div>';
      }).join('');
    openOv('ov-searchmsg');
  }

  /* ================= 消息操作（撤回 / 引用 / 复制 / 删除） ================= */
  function quoteText(m) {
    if (!m) return '';
    if (m.type === 'loc') return '📍 ' + (m.loc || '');
    /* v0.54：会话列表预览同样对外展示，用昵称不用备注 */
    if (m.type === 'card') {
      var cmu = U(m.cardUid);
      return '个人名片：' + (cmu.rawName || cmu.name || '用户');
    }
    if (m.type === 'img') return '[图片]';
    if (m.type === 'voice') return '[语音]';
    return m.text || '';
  }
  function openMsgAct(mid) {
    var c = conv(curConv); if (!c) return;
    var m = c.messages.filter(function (x) { return x.id === mid; })[0];
    if (!m || m.recalled || m.from === 'sys') return;
    var tip = $('#chatTip'); if (tip) { tip.remove(); try { localStorage.setItem('yeyu_lp_tip', '1'); } catch (e) {} }
    curMsgAct = mid;
    var me = m.from === 'me';
    var items = [];
    if (me) items.push({ k:'recall', i:'↩️', t:'撤回', danger:true });
    items.push({ k:'quote', i:'❞', t:'引用' });
    items.push({ k:'copy', i:'📋', t:'复制文字' });
    items.push({ k:'forward', i:'↪️', t:'转发' });
    items.push({ k:'del', i:'🗑️', t:'删除', danger:true });
    $('#msgActTitle').textContent = me ? '我发出的消息' : (U(m.from).name + ' 的消息');
    $('#msgActBody').innerHTML = items.map(function (it) {
      return '<div class="act-item' + (it.danger ? ' danger' : '') + '" data-action="msg-do" data-v="' + it.k + '" data-id="' + mid + '">' +
        '<span class="ai">' + it.i + '</span>' + it.t + '</div>';
    }).join('');
    $('#ov-msgact').classList.remove('show');
    void $('#ov-msgact').offsetWidth;
    $('#ov-msgact').classList.add('show');
    A.track('msg_act_open', { owner: me });
  }
  function doRecall(mid) {
    var c = conv(curConv); if (!c) return;
    var m = c.messages.filter(function (x) { return x.id === mid; })[0];
    if (!m || m.from !== 'me') return;
    if (m.ts && Date.now() - m.ts > 2 * 60 * 1000) return toast('超过 2 分钟的消息无法撤回', 'err');
    m.recalled = true; m.text = '';
    DB.save(); closeOv('ov-msgact'); renderChat(); renderChats();
    A.track('msg_recall', { conv: c.id });
    toast('已撤回', 'ok');
  }
  function doQuote(mid) {
    var c = conv(curConv); if (!c) return;
    var m = c.messages.filter(function (x) { return x.id === mid; })[0];
    if (!m) return;
    curQuote = { from: m.from, text: quoteText(m) };
    $('#quoteBar').style.display = '';
    var label = (m.from === 'me' ? '我' : U(m.from).name) + '：' + quoteText(m);
    $('#quoteBar').innerHTML = '<span class="qt">' + esc(label) + '</span><button data-action="quote-close">✕</button>';
    closeOv('ov-msgact'); $('#chatInput').focus({ preventScroll: true });
    A.track('msg_quote', { conv: c.id });
  }
  function clearQuote() {
    curQuote = null;
    $('#quoteBar').style.display = 'none';
  }
  function doCopy(mid) {
    var c = conv(curConv); if (!c) return;
    var m = c.messages.filter(function (x) { return x.id === mid; })[0];
    if (!m) return;
    var t = quoteText(m);
    try { if (navigator.clipboard) navigator.clipboard.writeText(t); } catch (e) {}
    closeOv('ov-msgact'); toast('已复制文字', 'ok');
  }
  function doDelMsg(mid) {
    var c = conv(curConv); if (!c) return;
    c.messages = c.messages.filter(function (x) { return x.id !== mid; });
    DB.save(); closeOv('ov-msgact'); renderChat(); renderChats();
    A.track('msg_delete', { conv: c.id });
    toast('已删除', 'ok');
  }

  /* 会话列表长按/点「⋯」→ 弹出会话操作菜单（置顶 / 免打扰 / 已读 / 清空 / 删除） */
  function openConvAct(cid) {
    var c = conv(cid); if (!c) return;
    var isGroup = c.type === 'group';
    /* v0.78：对齐 Flutter ConvActPage —— 固定 4 项：置顶 / 免打扰 / 标记为已读 / 删除会话。
       去掉「标为未读」「清空聊天记录」，文案改为 Flutter 口径。 */
    var items = [
      { k:'top',  i: c.top ? '📌' : '📍', t: c.top ? '取消置顶' : '置顶会话' },
      { k:'mute', i: c.muted ? '🔔' : '🔕', t: c.muted ? '取消免打扰' : '消息免打扰' },
      { k:'read', i:'✅', t:'标记为已读' }
    ];
    /* 系统会话保护：不提供删除（与 doConvAct 的 sys 拦截一致） */
    if (c.type !== 'sys') items.push({ k:'del', i:'🗑️', t:'删除会话', danger:true });
    $('#convActTitle').textContent = c.title;
    $('#convActBody').innerHTML = items.map(function (it) {
      return '<div class="act-item' + (it.danger ? ' danger' : '') + '" data-action="conv-do" data-op="' + it.k + '" data-id="' + cid + '">' +
        '<span class="ai">' + it.i + '</span>' + it.t + '</div>';
    }).join('');
    $('#ov-convact').classList.remove('show');
    void $('#ov-convact').offsetWidth;
    $('#ov-convact').classList.add('show');
    A.track('conv_act_open', { conv: cid, type: c.type });
  }
  function doConvAct(cid, op) {
    var c = conv(cid); if (!c) return;
    closeOv('ov-convact');
    if (c.type === 'sys' && (op === 'clear' || op === 'del')) return toast('系统会话不可清空或删除', 'err');
    if (op === 'top') {
      c.top = !c.top; DB.save(); renderChats();
      toast(c.top ? '已置顶会话' : '已取消置顶'); A.track('conv_top', { conv: cid, on: c.top });
    } else if (op === 'mute') {
      c.muted = !c.muted; DB.save(); renderChats();
      toast(c.muted ? '已开启免打扰' : '已开启消息提醒'); A.track('conv_mute', { conv: cid, on: c.muted });
    } else if (op === 'read') {
      c.unread = 0; DB.save(); renderChats(); toast('已标为已读', 'ok'); A.track('conv_read', { conv: cid });
    } else if (op === 'unread') {
      c.unread = Math.max(1, c.unread); DB.save(); renderChats(); toast('已标为未读', 'ok'); A.track('conv_unread', { conv: cid });
    } else if (op === 'clear') {
      var label = c.type === 'group' ? '清空群聊内容' : '清空聊天记录';
      confirmBox(label, '将删除该会话内的所有消息，但保留会话本身', function () {
        c.messages = []; DB.save(); renderChats();
        if (curConv === cid) renderChat();
        toast('已清空', 'ok'); A.track('conv_clear', { conv: cid, type: c.type });
      });
    } else if (op === 'del') {
      confirmBox('删除会话', '删除后该会话将从消息列表移除', function () {
        S().conversations = S().conversations.filter(function (x) { return x.id !== cid; });
        if (curConv === cid) { curConv = null; closeOv('ov-chat'); }
        DB.save(); renderChats();
        toast('已删除会话', 'ok'); A.track('conv_delete', { conv: cid, type: c.type });
      });
    }
  }
  /* 转发：从操作菜单进入，选择目标会话后转发（复用 pushMsg，目标会话自动未读+1） */
  function renderForward(mid) {
    var c = conv(curConv); if (!c) return;
    var m = c.messages.filter(function (x) { return x.id === mid; })[0];
    if (!m) return;
    curForwardMid = mid;
    var list = S().conversations.filter(function (x) { return x.id !== curConv; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    $('#fwdBody').innerHTML = list.length ? list.map(function (x) {
      var lm = lastMsg(x);
      var prefix = (x.type === 'group' && lm.from && lm.from !== 'me' && lm.from !== 'sys') ? (U(lm.from).name + '：') : '';
      return '<div class="row" data-action="forward-to" data-id="' + x.id + '">' +
        convIcon(x) +
        '<div class="row-title"><b>' + esc(x.title) + '</b><small>' + esc(prefix + quoteText(lm)) + '</small></div>' +
        '</div>';
    }).join('') : emptyBlock('💬', '没有可转发的会话', '先去广场对陌生人打个招呼吧');
    closeOv('ov-msgact'); openOv('ov-forward');
    A.track('msg_forward_open', { conv: c.id });
  }
  function doForward(mid, cid) {
    var c = conv(curConv), tc = conv(cid); if (!c || !tc) return;
    var m = c.messages.filter(function (x) { return x.id === mid; })[0];
    if (!m) return;
    var payload = { type: m.type || 'text' };
    ['text', 'img', 'voice', 'loc', 'cardUid', 'quote'].forEach(function (k) { if (m[k] !== undefined) payload[k] = m[k]; });
    if (payload.type === 'text' && !payload.text) payload.text = quoteText(m);
    pushMsg(cid, 'me', payload.text || '', payload);
    closeOv('ov-forward');
    A.track('msg_forward', { conv: c.id, target: cid, mtype: m.type });
    toast('已转发到「' + tc.title + '」', 'ok');
  }
  function clearChat() {
    var c = conv(curConv); if (!c) return;
    confirmBox('清空聊天记录', '将删除本会话全部 ' + c.messages.length + ' 条消息（仅本机）', function () {
      c.messages = [];
      DB.save(); renderChat(); renderChats();
      A.track('chat_clear', { conv: c.id });
      toast('已清空', 'ok');
    });
  }

  /* ================= 扩展面板（图片 / 语音 / 位置 / 名片 / 群公告） ================= */
  function renderExtPanel() {
    var c = conv(curConv);
    var items = [
      { i:'🖼️', t:'图片', act:'ext-img' },
      { i:'🎙️', t:'语音', act:'ext-voice' },
      { i:'📍', t:'位置', act:'ext-loc' },
      { i:'📇', t:'名片', act:'ext-card' }
    ];
    if (c && c.type === 'group' && canDo(c, 'me', 'edit')) items.push({ i:'📢', t:'群公告', act:'ext-ann' });
    $('#extPanel').innerHTML = '<div class="ext-grid">' + items.map(function (it) {
      return '<div class="ext-item" data-action="' + it.act + '"><div class="ei">' + it.i + '</div><span>' + it.t + '</span></div>';
    }).join('') + '</div>';
  }
  function toggleExt() {
    var p = $('#extPanel');
    if (p.classList.contains('show')) { p.classList.remove('show'); }
    else { p.classList.add('show'); renderExtPanel(); $('#emojiPanel').classList.remove('show'); $('#chatInput').focus({ preventScroll: true }); }
  }
  function sendImage() {
    var g = GRADS[Math.floor(Math.random() * GRADS.length)];
    send('', { type:'img', grad: g[0], emoji: g[1] });
    $('#extPanel').classList.remove('show'); A.track('msg_img', {});
    toast('已发送图片', 'ok');
  }
  function sendLocation() {
    var loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    send('', { type:'loc', loc: loc.n, addr: loc.a });
    $('#extPanel').classList.remove('show'); A.track('msg_loc', {});
  }
  function sendCard(uid) {
    send('', { type:'card', cardUid: uid });
    $('#extPanel').classList.remove('show'); A.track('msg_card', { user: uid });
    toast('已发送 ' + U(uid).name + ' 的名片', 'ok');
  }
  function pickCard() {
    openPicker({ title:'选择名片', multi:false, source: S().friends.slice(),
      ok: function (uids) { if (uids.length) sendCard(uids[0]); } });
  }
  function quickAnnounce() { openGroupEdit('announce'); $('#extPanel').classList.remove('show'); }

  /* ================= 语音录制 ================= */
  function startVoice() {
    voiceSec = 0;
    $('#voiceTime').textContent = '0.0″';
    $('#voiceTip').textContent = '松开发送，上滑取消';
    $('#ov-voice').classList.add('show');
    if (voiceTimer) clearInterval(voiceTimer);
    voiceTimer = setInterval(function () {
      voiceSec += 0.1;
      $('#voiceTime').textContent = voiceSec.toFixed(1) + '″';
    }, 100);
  }
  function sendVoice() {
    if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
    var dur = Math.max(1, Math.round(voiceSec));
    $('#ov-voice').classList.remove('show');
    if (dur < 1) return;
    send('', { type:'voice', dur: dur });
    A.track('msg_voice', { dur: dur });
    toast('已发送语音 ' + dur + '″', 'ok');
  }
  function cancelVoice() {
    if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
    $('#ov-voice').classList.remove('show');
  }

  /* ================= 靓号商城 ================= */
  // 靓号稀有度 → 色系（金/紫/红/粉/蓝/青）
  function niceTone(tag) {
    if (tag === '至尊') return 'gold';
    if (tag === '稀有') return 'violet';
    if (tag === '吉利') return 'red';
    if (tag === '表白') return 'pink';
    if (tag === '纪念') return 'blue';
    return 'teal';
  }
  function renderNice() {
    var st = S();
    var total = st.niceIds.length;

    // ===== Hero：尊贵身份牌（深紫 + 金光晕 + 毛玻璃号牌）=====
    var hero =
      '<div class="nice-hero">' +
        '<span class="nh-glow nh-glow-a"></span><span class="nh-glow nh-glow-b"></span>' +
        '<div class="nh-in">' +
          '<div class="nh-tag">我的靓号 · EXCLUSIVE ID</div>' +
          '<div class="nh-plate"><span class="nh-num">' + esc(st.me.yeyuNum) + '</span></div>' +
          '<div class="nh-foot">' +
            (function () {
              var dc = En.value('mall.niceDiscount');
              if (dc === 1) return '<span class="nh-vip">开通 VIP 立享 8 折 · SVIP 7 折</span>';
              return '<span class="nh-vip on">' + svgIcon('crown', 'ni') + TIER_META[En.tier()].txt +
                ' 专享 ' + Math.round(dc * 10) + ' 折</span>';
            })() +
            '<span class="nh-cnt">共 ' + total + ' 款在售</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ===== 分类胶囊（带数量）=====
    var kinds = '<div class="nice-kinds">' + NICE_KINDS.map(function (k) {
      var c = k.k === 'all' ? total : st.niceIds.filter(function (n) { return n.kind === k.k; }).length;
      return '<button class="nk' + (niceFilter === k.k ? ' on' : '') + '" data-action="nice-kind" data-v="' + k.k + '">' +
        k.t + '<i>' + c + '</i></button>';
    }).join('') + '</div>';

    var grid = '<div class="nice-grid">' + renderNiceCards() + '</div>';
    var tip = '<div class="nice-tip"><span class="nt-ico">✦</span>' +
      '<span>靓号一次性买断、永久占用并展示在主页与名片。</span></div>';

    $('#niceBody').innerHTML = hero + kinds + grid + tip;
    openOv('ov-niceid');
  }
  function renderNiceCards() {
    var st = S();
    var list = st.niceIds.slice();
    if (niceFilter !== 'all') list = list.filter(function (n) { return n.kind === niceFilter; });
    return list.map(function (n) {
      var owned = n.num === st.me.yeyuNum;
      var price = En.price('mall.niceDiscount', n.price);
      var off = price !== n.price;
      return '<div class="nice-card tone-' + niceTone(n.tag) + (owned ? ' owned' : '') + '">' +
        // 号码牌（按稀有度渐变）
        '<div class="nc-plate">' +
          '<span class="nc-num">' + n.num + '</span>' +
          '<span class="nc-tag">' + n.tag + '</span>' +
        '</div>' +
        // 信息区
        '<div class="nc-body">' +
          '<div class="nc-lb">' + n.label + '</div>' +
          '<div class="nc-bt">' +
            '<div class="nc-price"><em>¥</em>' + price + (off ? '<s>¥' + n.price + '</s>' : '') + '</div>' +
            (owned ? '<span class="nc-state">使用中</span>'
                   : '<button class="nc-buy" data-action="buy-nice" data-v="' + n.id + '">购买</button>') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  function buyNice(id) {
    var n = S().niceIds.filter(function (x) { return x.id === id; })[0]; if (!n) return;
    curNice = n;
    var rmb = En.price('mall.niceDiscount', n.price);
    Pay.open({
      title: '购买靓号', subject: n.num, desc: n.label, amount: rmb,
      rows: [['类型', n.label], ['当前号', S().me.yeyuNum], ['野遇币', (rmb * COIN_RATE) + ' 币']],
      goods: 'nice', coinPrice: rmb * COIN_RATE, coinDesc: '购买靓号 ' + n.num,
      onSuccess: function () {
        S().me.yeyuNum = n.num; S().me.yeyuId = '野遇号：' + n.num;
        DB.save(); toast('已拥有靓号 ' + n.num, 'ok');
        A.track('nice_buy', { num: n.num, price: rmb, vip: isVip() });
        renderNice(); renderMe();
        if ($('#ov-wallet').classList.contains('show')) renderWallet();
        if ($('#ov-profile').classList.contains('show')) renderProfile(curProfile);
      }
    });
  }

  /* ================= 会员中心 ================= */
  function fmtShort(ts) {
    var d = new Date(ts), p = function (x) { return x < 10 ? '0' + x : '' + x; };
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  /* 取套餐定义。tier 由 PLAN_TIER 兜底推导，老数据无需标注也能正确归类 */
  function planOf(id) {
    var ps = S().vipPlans;
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }
  function tierOfPlan(p) { return (p && p.tier) ? p.tier : (PLAN_TIER[p.id] || 'vip'); }

  /* VIP → SVIP 补差报价
     剩余价值 = 当前套餐实付 ÷ 总天数 × 剩余天数；补差 = 目标价 − 剩余价值 */
  function upgradeQuote(targetPlanId) {
    var v = S().me.vip, p = planOf(targetPlanId);
    if (!p) return null;
    var sub = En.subject();
    if (sub.tier === 'svip') return null;                 // 已是最高等级
    if (sub.tier === 'none') return { credit: 0, pay: p.price, plan: p, fresh: true };
    var leftMs = Math.max(0, v.expire - Date.now());
    var curP = planOf(v.plan);
    var paid = curP ? curP.price : 0;
    var totalMs = (v.days || 30) * 86400000;
    /* 抵扣上限为目标套餐价的 50%。不做封顶会出现「¥6 买 SVIP 月卡」的倒挂：
       季卡剩余价值 ¥32 足以几乎抵消 ¥38 的月卡。 */
    var credit = Math.min(Math.round(p.price * 0.5), Math.round(paid * (leftMs / totalMs)));
    return { credit: credit, pay: Math.max(0, p.price - credit), plan: p, leftDays: sub.days };
  }

  /* ============================================================
     会员中心 v0.34 · 信息架构重构
     IA 原则：一个页面只回答一个问题 → 「我现在是谁，我该付多少钱」
     ------------------------------------------------------------
     旧版问题：8 个区块线性平铺 + 同份权益用「清单」「对比表」渲染两遍
              → 认知负荷爆表 + CTA 漂浮在中间，滚两屏就找不到行动点
     新版结构：Hero（状态）→ 权益全景（决策依据·合并去重·分组折叠）
              → 方案选择（套餐）→ 次要信息（管理/规划·默认收起）
              → 吸底 CTA（行动点永不下线）
     ============================================================ */
  var vipOpenGroups = {};      // 展开的权益分组（undefined = 走自适应默认）
  var vipShowRoad = false;     // 规划中区块展开态
  var ER_COMFORT = 4;          // 组内不超过这个条目数就直接摊开，避免"抽屉套抽屉"

  function fmtPol(e, tier) {
    var x = e.pol[tier];
    if (e.type === 'B') return x ? '✓' : '✕';
    if (e.type === 'D') return x === 1 ? '原价' : Math.round(x * 10) + ' 折';
    if (x === Infinity) return '不限';
    return x === 0 ? '✕' : x + ' ' + (e.unit || '');
  }

  function renderVip() {
    var st = S(), sub = En.subject(), v = st.me.vip, paid = sub.tier !== 'none';
    /* 默认选中：免费用户锚定「最低门槛」的 VIP 套餐（按价格取最便宜，而非数组首项），
       而不是远处的顶配年卡。理由：① 吸底 CTA 的价格必须和用户首屏能看到的卡片一致
            ② 先让用户付第一笔小钱，比一上来推 ¥198 的转化漏斗更短 */
    if (!paid && !curVipPlan) {
      var vips = st.vipPlans.filter(function (p) { return tierOfPlan(p) === 'vip'; });
      var cheap = vips.slice().sort(function (a, b) { return a.price - b.price; })[0];
      curVipPlan = cheap ? cheap.id : (st.vipPlans[0] && st.vipPlans[0].id);
    }
    var meta = TIER_META[sub.tier];
    var myKey = paid ? sub.tier : 'free';

    /* ---- ① 身份卡：只回答「我现在是谁」 ---- */
    var hero = paid
      ? '<div class="vh ' + sub.tier + '">' +
          '<div class="vh-l"><div class="vh-ico">' + (sub.tier === 'svip' ? svgIcon('gem') : svgIcon('crown')) + '</div>' +
            '<div><div class="vh-n">' + esc(v.name) + '<span class="badge-vip ' + meta.cls + '">' + meta.txt + '</span></div>' +
            '<div class="vh-s">有效期至 ' + fmtShort(v.expire) + '</div></div></div>' +
          '<div class="vh-r"><b>' + sub.days + '</b><small>剩余天数</small></div>' +
        '</div>' +
        (v.auto && v.autoRenew === false ? '<div class="vh-warn">⚠ 自动续费已关闭，到期后权益自动失效</div>' : '')
      : '<div class="vh free">' +
          '<div class="vh-l"><div class="vh-ico">' + svgIcon('crown') + '</div>' +
            '<div><div class="vh-n">你还不是会员</div>' +
            '<div class="vh-s">当前为免费版 · 打招呼 3 次/日 · 群限 20 人</div></div></div>' +
          /* 展示「待解锁项数」而不是「有几种套餐」：焦虑感驱动，且是用户真正关心的信息 */
          (function () {
            var unlockable = ENTITLEMENTS.filter(function (e) {
              return e.pol.free === false || e.pol.free === 0 || (e.type === 'D' && e.pol.free === 1);
            }).length;
            return '<div class="vh-r"><b>' + unlockable + '</b><small>项待解锁</small></div>';
          })() +
        '</div>';

    /* ---- ② 权益全景：合并「清单 + 对比表」为唯一真源，按场景分组 ----
       旧版把同一份数据渲染两遍（清单 26 卡 + 表格 26 行），占 65% 页面高度。
       现在一张表同时承担「我有什么」和「两个等级差在哪」。 */
    var order = ['互动沟通', '匹配推荐', '个人曝光', '群聊天', '圈子', '隐私与内容', '身份', '商业化'];
    var groups = {}, gKeys = [];
    ENTITLEMENTS.forEach(function (e) {
      if (!groups[e.g]) { groups[e.g] = []; gKeys.push(e.g); }
      groups[e.g].push(e);
    });
    gKeys.sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    var myName = { free: '免费版', vip: 'VIP', svip: 'SVIP' }[myKey];
    var bene = '<div class="er">' +
      '<div class="er-h"><span>权益</span><span class="' + (myKey === 'vip' ? 'on' : '') + '">VIP</span>' +
      '<span class="svip' + (myKey === 'svip' ? ' on' : '') + '">SVIP</span></div>' +
      gKeys.map(function (g) {
        var list = groups[g];
        /* 自适应折叠：组内 ≤ COMFORT 项直接摊开（当前 7 组各 1 项，折叠反而要点 7 次），
           超过才收起。这样权益增长到几十项时也不会退化成一堵墙。 */
        var open = (typeof vipOpenGroups[g] === 'boolean')
          ? vipOpenGroups[g]
          : list.length <= ER_COMFORT;
        var svipCnt = list.filter(function (e) { return e.svipOnly; }).length;
        return '<div class="er-g' + (open ? ' open' : '') + '" data-action="er-toggle" data-v="' + esc(g) + '">' +
            '<div class="er-gt"><span class="er-gi">' + (list[0] ? list[0].i : '•') + '</span>' +
              '<b>' + esc(g) + '</b>' +
              (svipCnt ? '<span class="er-tag">' + svipCnt + ' 项 SVIP 独占</span>' : '') +
              /* 组内仅 1 项时「1 项」是纯噪音，隐藏计数与箭头让层级更紧凑 */
              (list.length > 1 ? '<span class="er-cnt">' + list.length + ' 项</span>' : '') +
              '<span class="er-ar">›</span></div>' +
            '<div class="er-body">' + list.map(function (e) {
              var mine = e.pol[myKey];
              var locked = (e.type === 'B' && !mine) || (e.type !== 'B' && (mine === 0 || mine === 1 && e.type === 'D'));
              var better = (e.type === 'B') ? (!e.pol.vip && e.pol.svip)
                         : (e.type === 'D') ? (e.pol.svip < e.pol.vip)
                         : (e.pol.svip > e.pol.vip || e.pol.svip === Infinity);
              return '<div class="vc-r' + (locked ? ' lk' : '') + '">' +
                '<span class="vc-n"><b>' + esc(e.name) + (e.svipOnly ? '<i class="vp-svip">SVIP</i>' : '') + '</b>' +
                  '<small>' + esc((e.desc && e.desc[myKey]) || '') + '</small></span>' +
                '<span>' + fmtPol(e, 'vip') + '</span>' +
                '<span class="' + (better ? 'hi' : '') + '">' + fmtPol(e, 'svip') + '</span>' +
                '</div>';
            }).join('') + '</div>' +
          '</div>';
      }).join('') +
      '<div class="er-note">当前等级：<b>' + myName + '</b> · 表中为各等级上限值</div>' +
      '</div>';

    /* ---- ③ 方案选择：单列大卡 + 日折算，降低价格心理门槛 ---- */
    function planCard(p, quote) {
      var tier = tierOfPlan(p);
      var pay = quote ? quote.pay : p.price;
      var perDay = (pay / p.days);
      var perDayTxt = perDay >= 1 ? ('¥' + Math.round(perDay)) : ('¥' + perDay.toFixed(1));
      return '<div class="vp ' + tier + (curVipPlan === p.id ? ' on' : '') + '" data-action="vip-plan" data-v="' + p.id + '">' +
        '<div class="vp-chk"></div>' +
        '<div class="vp-m"><div class="vp-top"><b>' + esc(p.name) + '</b>' +
          (p.tag ? '<span class="vp-tag">' + esc(p.tag) + '</span>' : '') + '</div>' +
          '<div class="vp-d">' + p.days + ' 天 · ' + (p.auto ? '自动续费 · 可随时取消' : '一次性') +
          (quote && quote.credit > 0 ? ' · <em class="vp-cr">已抵扣剩余价值 ¥' + quote.credit + '</em>' : '') + '</div></div>' +
        '<div class="vp-p"><b>¥' + pay + '</b>' +
          (pay !== p.price ? '<s>¥' + p.price + '</s>' : (p.orig !== p.price ? '<s>¥' + p.orig + '</s>' : '')) +
          '<small>' + perDayTxt + '/天</small></div></div>';
    }

    var plans = '';
    if (sub.tier === 'vip') {
      var svipPs = st.vipPlans.filter(function (p) { return tierOfPlan(p) === 'svip'; });
      if (svipPs.length) {
        plans = '<div class="sec-t">升级 SVIP 超级会员<span class="sec-s">补差即可升级，有效期重新计算</span></div>' +
          '<div class="vp-list">' + svipPs.map(function (p) {
            return planCard(p, upgradeQuote(p.id));
          }).join('') + '</div>';
      }
    } else if (sub.tier === 'none') {
      function mkGrp(tier, title, s) {
        var ps = st.vipPlans.filter(function (p) { return tierOfPlan(p) === tier; });
        if (!ps.length) return '';
        return '<div class="sec-t">' + title + '<span class="sec-s">' + s + '</span></div>' +
          '<div class="vp-list">' + ps.map(function (p) { return planCard(p, null); }).join('') + '</div>';
      }
      plans = mkGrp('vip', 'VIP 会员', '解锁核心社交能力') +
              mkGrp('svip', 'SVIP 超级会员', '全特权 · 隐身浏览 · 最高折扣');
    }

    /* ---- ④ 次要信息：订阅管理压成一行，不再占据主视觉 ---- */
    var manage = '';
    if (paid) {
      var rows2 = '';
      if (v.auto) {
        var on = v.autoRenew !== false;
        rows2 += '<div class="row" data-action="vip-auto-toggle"><div class="row-title"><b>自动续费</b>' +
          '<small>' + (on ? '已开启 · 到期自动续费' : '已关闭 · 到期不再续费') + '</small></div>' +
          '<div class="switch' + (on ? ' on' : '') + '"><i></i></div></div>' +
          (on ? '<div class="row" data-action="vip-cancel"><div class="row-title"><b style="color:var(--error-fg)">取消订阅</b>' +
            '<small>权益保留至 ' + fmtShort(v.expire) + '</small></div><span class="chev">›</span></div>'
              : '<div class="row" data-action="vip-resume"><div class="row-title"><b>重新开启自动续费</b>' +
                '<small>权益不中断</small></div><span class="chev">›</span></div>');
      }
      rows2 += '<div class="row" data-action="orders"><div class="row-title"><b>我的订单</b><small>查看记录与申请退款</small></div><span class="chev">›</span></div>';
      manage = '<div class="sec-t">管理</div><div class="list">' + rows2 + '</div>';
    }

    /* ---- ⑤ 规划中：默认收起，不占据决策路径 ---- */
    var road = ENT_ROADMAP.length
      ? '<div class="sec-t">规划中能力<span class="sec-s">' + ENT_ROADMAP.length + ' 项 · 尚未上线</span></div>' +
        '<div class="road' + (vipShowRoad ? ' open' : '') + '" data-action="er-road">' +
          '<div class="road-h"><span>🗓 正在开发的功能</span><span class="er-ar">›</span></div>' +
          '<div class="road-b">' + ENT_ROADMAP.map(function (r) {
            return '<div class="road-i"><b>' + esc(r.t) + '</b><small>' + esc(r.note) + '</small></div>';
          }).join('') + '</div>' +
        '</div>'
      : '';

    $('#vipBody').innerHTML = hero + bene + plans + manage + road;
    renderVipFoot();
    openOv('ov-vip');
  }

  /* 吸底行动区：行动点不随滚动消失（转化率最关键的一环） */
  function renderVipFoot() {
    var foot = $('#vipFoot'); if (!foot) return;
    var st = S(), sub = En.subject();
    if (sub.tier === 'svip') {
      var p0 = planOf(sub.plan);
      foot.innerHTML = '<p class="vf-n">已是最高等级 · ' + TIER_META.svip.full + '</p>' +
        '<button class="btn block accent svip" data-action="vip-renew">续费会员</button>';
      return;
    }
    var target = planOf(curVipPlan);
    if (!target || (sub.tier === 'vip' && tierOfPlan(target) !== 'svip')) {
      var pool = st.vipPlans.filter(function (p) {
        return sub.tier === 'vip' ? tierOfPlan(p) === 'svip' : true;
      });
      target = pool.filter(function (p) { return p.rec; })[0] || pool[0];
      if (target) curVipPlan = target.id;
    }
    if (!target) { foot.innerHTML = ''; return; }
    var isUp = sub.tier === 'vip';
    var q = isUp ? upgradeQuote(target.id) : null;
    var pay = q ? q.pay : target.price;
    foot.innerHTML =
      '<div class="vf-p"><b>¥' + pay + '</b>' +
        (q && q.credit > 0 ? '<s>¥' + target.price + '</s>' : '') +
        '<span>' + esc(target.name) + ' · ' + target.days + ' 天</span></div>' +
      '<button class="btn block accent' + (tierOfPlan(target) === 'svip' ? ' svip' : '') + '" data-action="' +
        (isUp ? 'vip-upgrade' : 'vip-pay') + '">' +
        (isUp ? '升级 SVIP' : '开通 ' + TIER_META[tierOfPlan(target)].txt) + '</button>' +
      '<p class="vf-n">开通即代表同意《会员服务协议》</p>';
  }

  /* VIP → SVIP 补差升级支付 */
  function openVipUpgrade() {
    var q = upgradeQuote(curVipPlan);
    if (!q) { renderVip(); return; }
    var p = q.plan;
    if (tierOfPlan(p) !== 'svip') { openVipPay(p.id); return; }
    Pay.open({
      title: '升级 SVIP', subject: p.name, desc: '补差价升级 · 有效期重新计算 ' + p.days + ' 天',
      amount: q.pay,
      rows: [['原价', '¥' + p.price], ['抵扣剩余价值', '-¥' + q.credit], ['有效期', '自今日起 ' + p.days + ' 天']],
      goods: 'vip', coinPrice: q.pay * COIN_RATE, coinDesc: '升级 SVIP',
      onSuccess: function () {
        var st = S();
        st.me.vip = { plan: p.id, name: p.name, days: p.days, start: Date.now(),
          expire: Date.now() + p.days * 86400000, auto: !!p.auto, autoRenew: !!p.auto };
        DB.save(); toast('已升级 SVIP', 'ok');
        A.track('vip_upgrade', { plan: p.id, pay: q.pay, credit: q.credit });
        renderVip(); renderMe();
        if ($('#ov-wallet').classList.contains('show')) renderWallet();
      }
    });
  }

  function openVipPay(planId) {
    var st = S(), p = st.vipPlans.filter(function (x) { return x.id === (planId || curVipPlan); })[0];
    if (!p) return;
    var tier = tierOfPlan(p);
    Pay.open({
      title: '开通会员', subject: p.name, desc: p.days + ' 天 · ' + (p.auto ? '连续包月' : '一次性'), amount: p.price,
      rows: [['等级', TIER_META[tier].full], ['有效期', p.days + ' 天'], ['野遇币', (p.price * COIN_RATE) + ' 币']],
      goods: 'vip', coinPrice: p.price * COIN_RATE, coinDesc: '会员开通 · ' + p.name,
      onSuccess: function () {
        /* v0.26：续费叠加——旧会员未到期时，新时长顺延，不吞剩余天数 */
        var prev = (st.me.vip && st.me.vip.expire > Date.now()) ? st.me.vip.expire : Date.now();
        st.me.vip = { plan: p.id, name: p.name, tier: tier, days: p.days, start: Date.now(), expire: prev + p.days * 86400000, auto: !!p.auto, autoRenew: !!p.auto };
        DB.save(); toast(p.name + ' 已开通', 'ok');
        A.track('vip_open', { plan: p.id, tier: tier, price: p.price });
        renderVip(); renderMe();
        if ($('#ov-wallet').classList.contains('show')) renderWallet();
      }
    });
  }

  /* ================= 我的订单 ================= */
  function renderOrders() {
    var st = S();
    $('#ordersBody').innerHTML = st.orders.length ? st.orders.map(function (o) {
      var icon = o.goods === 'nice' ? svgIcon('num') : (o.goods === 'vip' ? svgIcon('crown') : svgIcon('coin'));
      var prefix = o.goods === 'nice' ? '靓号 · ' : (o.goods === 'vip' ? '会员 · ' : '充值 · ');
      var wayTxt = o.way === 'coin' ? '野遇币' : (o.way === 'wechat' ? '微信' : '支付宝');
      var opBtn, refundTxt = '';
      if (o.goods === 'coin') opBtn = '<button class="btn ghost xs" data-action="order-receipt" data-id="' + o.id + '">查看凭证</button>';
      else if (!o.refund) opBtn = '<button class="btn ghost xs" data-action="order-refund" data-id="' + o.id + '">申请退款</button>';
      else { opBtn = ''; refundTxt = '<small style="color:var(--tint-orange-fg)">退款' + (o.refund.status === 'done' ? '已退回' : '审核中') + '</small>'; }
      return '<div class="order-item"><div class="avatar sm" style="background:var(--n-100)">' + icon + '</div>' +
        '<div class="oi"><b>' + esc(prefix + o.title) + '</b>' +
        '<small>' + wayTxt + ' · ' + fmtShort(o.ts) + ' · ' + o.no + '</small></div>' +
        '<div class="op"><b>¥' + o.amount + '</b><small>' + (o.status === 'paid' ? '已支付' : '—') + '</small>' + refundTxt + '</div>' +
        (opBtn ? '<div class="op-act">' + opBtn + '</div>' : '') + '</div>';
    }).join('') : emptyBlock('🧾', '还没有订单', '去靓号商城或会员中心看看');
    openOv('ov-orders');
  }

  /* ================= 我的钱包（平台币） ================= */
  function renderWallet() {
    var st = S(), me = st.me;
    var logs = (st.coinLogs || []).slice(0, 40);
    var tiers = COIN_TIERS.map(function (t) {
      var gift = t.coin - t.rmb * COIN_RATE;
      return '<div class="coin-tier" data-action="coin-recharge" data-v="' + t.rmb + '">' +
        '<div class="ct-coin"><b>' + t.coin + '</b><span> 币</span></div>' +
        '<div class="ct-rmb">¥' + t.rmb + (gift > 0 ? '<span class="ct-gift">送 ' + gift + '</span>' : '') + '</div>' +
        '</div>';
    }).join('');
    var logHtml = logs.length ? logs.map(function (l) {
      var plus = l.type === 'recharge';
      var color = plus ? '#12b76a' : '#f04438';
      var icon = plus ? '💰' : '🛍️';
      return '<div class="coin-log">' +
        '<span class="cl-ico">' + icon + '</span>' +
        '<div class="cl-mid"><b>' + esc(l.desc || (plus ? '野遇币充值' : '消费')) + '</b>' +
        '<small>' + fmtShort(l.ts) + '</small></div>' +
        '<div class="cl-amt" style="color:' + color + '">' + (plus ? '+' : '-') + l.amount + ' 币</div></div>';
    }).join('') : emptyBlock('🪙', '还没有野遇币记录', '充值或消费后会显示在这里');

    $('#walletBody').innerHTML =
      '<div class="coin-hero">' +
        '<div class="coin-bal"><span class="cb-ico">🪙</span><b>' + me.coins + '</b><small>野遇币余额</small></div>' +
        '<div class="coin-rate">1 元 = ' + COIN_RATE + ' 野遇币 · 可用于购买 VIP / 靓号</div>' +
      '</div>' +
      '<div class="sec-title" style="padding:14px 14px 6px">充值野遇币</div>' +
      '<div class="coin-tiers">' + tiers + '</div>' +
      '<div class="list" style="margin-top:10px">' +
        row(svgIcon('crown'), '会员中心', '可用野遇币开通 VIP', 'vip') +
        row('🔢', '靓号商城', '可用野遇币购买靓号', 'niceid') +
      '</div>' +
      '<div class="sec-title" style="padding:14px 14px 6px">野遇币明细</div>' +
      '<div class="coin-logs">' + logHtml + '</div>';
    openOv('ov-wallet');
  }
  function doCoinRecharge(rmbStr) {
    var rmb = parseInt(rmbStr, 10);
    var tier = COIN_TIERS.filter(function (t) { return t.rmb === rmb; })[0];
    if (!tier) return;
    Pay.open({
      title: '充值野遇币', subject: '野遇币充值', desc: '到账 ' + tier.coin + ' 野遇币',
      amount: tier.rmb, rows: [['到账', tier.coin + ' 野遇币'], ['兑换比例', '1元=' + COIN_RATE + '币']],
      goods: 'coin_recharge', allowedWays: ['wechat', 'alipay'], coinAmount: tier.coin,
      onSuccess: function () {
        S().me.coins += tier.coin;
        S().coinLogs.unshift({ ts: Date.now(), type: 'recharge', amount: tier.coin, desc: '野遇币充值 ¥' + tier.rmb });
        DB.save(); toast('充值成功，到账 ' + tier.coin + ' 野遇币', 'ok');
        A.track('coin_recharge', { rmb: tier.rmb, coin: tier.coin });
        renderWallet(); renderMe();
      }
    });
  }

  /* ============================================================
     开屏页 Splash · 对齐 Flutter splash_page.dart「晨光山野」
     明亮晨光渐变(CSS) + 光尘/汇聚粒子/双层浅绿山影(canvas) + 绿色描边 Logo(SVG)
     + 底部流动进度条；2800ms 播完按登录态自动分流（无跳过 / 标签 / 版本号）。
     刷新 = 冷启动；?nosplash=1 或冒烟测试静默跳过；App.playSplash 可重播。
     入场后引导浮层（maybeOnboard）延到开屏结束再触发，避免两层浮层叠着出现。
     ============================================================ */
  var SPLASH_MS = 2800;
  var splTimer = null, splAfter = null, splRAF = null, splStart = 0;

  function splashDisabled() {
    /* 冒烟测试 / 深链调试：静默跳过，避免全屏遮罩干扰断言与点击 */
    return /(^|[?&])nosplash=1(&|$)/.test(location.search) || window.__SMOKE__ === true;
  }

  /* 固定随机种子（对齐 Flutter Random(20261101)）：每次启动粒子形态一致、可控 */
  function splRng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var _spr = splRng(20261101), SPL_STARS = [], SPL_PARTS = [];
  (function () {
    for (var i = 0; i < 26; i++) {
      SPL_STARS.push({
        x: _spr(), y: _spr() * 0.72, r: 0.6 + _spr() * 1.5,
        phase: _spr() * Math.PI * 2, speed: 1.5 + _spr() * 2.6, golden: _spr() > 0.5
      });
    }
    for (var j = 0; j < 30; j++) {
      var ang = _spr() * Math.PI * 2, radius = 1.35 + _spr() * 0.7;
      SPL_PARTS.push({
        sx: 0.5 + Math.cos(ang) * radius, sy: 0.5 + Math.sin(ang) * radius,
        tx: 0.5 + (_spr() - 0.5) * 0.14, ty: 0.5 + (_spr() - 0.5) * 0.14,
        delay: (j / 30) * 0.5, size: 1.2 + _spr() * 2.4,
        alpha: 0.45 + _spr() * 0.55, golden: _spr() > 0.66
      });
    }
  })();

  /* 绘制一帧：光尘 → 汇聚粒子 → 双层山影（与 Flutter CustomPainter 同构） */
  function drawSplash(t) {
    var cv = $('#splCanvas'); if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'); if (!ctx) return;   /* jsdom 无 canvas 时静默降级 */
    var w = cv.clientWidth || 375, h = cv.clientHeight || 667, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var easeOut = function (x) { return 1 - Math.pow(1 - x, 3); };
    /* 光尘：金绿交替，闪烁淡入 */
    var starFade = Math.min(1, t / 0.25);
    for (var i = 0; i < SPL_STARS.length; i++) {
      var s = SPL_STARS[i];
      var tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.speed * 2 * Math.PI + s.phase));
      ctx.globalAlpha = tw * starFade * 0.85;
      ctx.fillStyle = s.golden ? '#F2C86B' : '#86D3A8';
      ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill();
    }
    /* 汇聚粒子：从屏幕外向中心加速汇聚（1/3 金色晨光 + 2/3 品牌绿） */
    for (var j = 0; j < SPL_PARTS.length; j++) {
      var p = SPL_PARTS[j], local = (t - p.delay) / 0.5;
      if (local <= 0 || local >= 1) continue;
      var e = local * local * local;
      var x = (p.sx + (p.tx - p.sx) * e) * w, y = (p.sy + (p.ty - p.sy) * e) * h;
      var fade = local < 0.85 ? 1 : (1 - local) / 0.15;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha * fade));
      ctx.fillStyle = p.golden ? '#FFC96B' : '#2ED08A';
      ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    /* 底部双层浅绿山影：远山淡、近山略深，随动画淡入 */
    var hills = easeOut(Math.min(1, t / 0.5));
    ctx.globalAlpha = 0.9 * hills; ctx.fillStyle = '#CBE9D7';
    ctx.beginPath(); ctx.moveTo(0, h * 0.78);
    ctx.quadraticCurveTo(w * 0.16, h * 0.60, w * 0.36, h * 0.76);
    ctx.quadraticCurveTo(w * 0.52, h * 0.88, w * 0.68, h * 0.72);
    ctx.quadraticCurveTo(w * 0.86, h * 0.58, w, h * 0.72);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.95 * hills; ctx.fillStyle = '#A9D9BE';
    ctx.beginPath(); ctx.moveTo(0, h * 0.92);
    ctx.quadraticCurveTo(w * 0.22, h * 0.78, w * 0.46, h * 0.90);
    ctx.quadraticCurveTo(w * 0.62, h * 0.98, w * 0.80, h * 0.86);
    ctx.quadraticCurveTo(w * 0.92, h * 0.80, w, h * 0.86);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function splLoop(ts) {
    if (!splStart) splStart = ts;
    var t = Math.min(1, (ts - splStart) / SPLASH_MS);
    drawSplash(t);
    var el = $('#splash');
    if (t < 1 && el && el.classList.contains('show')) splRAF = window.requestAnimationFrame(splLoop);
  }

  function playSplash(after, force) {
    var el = $('#splash');
    if (!el) { if (after) after(); return; }
    if (!force && splashDisabled()) { if (after) after(); return; }
    clearTimeout(splTimer);
    if (splRAF) { window.cancelAnimationFrame(splRAF); splRAF = null; }
    if (after) splAfter = after;
    /* 先摘 class 再强制 reflow，保证「重播」时所有 keyframes 从头开始 */
    el.classList.remove('show', 'out'); void el.offsetWidth; el.classList.add('show');
    drawSplash(0);
    splStart = 0;
    if (window.requestAnimationFrame) splRAF = window.requestAnimationFrame(splLoop);
    A.track('splash_view', {});
    splTimer = setTimeout(endSplash, SPLASH_MS);
  }
  function endSplash() {
    clearTimeout(splTimer);
    if (splRAF) { window.cancelAnimationFrame(splRAF); splRAF = null; }
    var el = $('#splash');
    if (!el || !el.classList.contains('show')) return;
    el.classList.add('out');
    /* 主界面轻上浮衔接，观感上像开屏「溶解」露出内容而非硬切 */
    var vp = $('#viewport');
    if (vp) { vp.classList.remove('app-in'); void vp.offsetWidth; vp.classList.add('app-in'); }
    setTimeout(function () {
      el.classList.remove('show', 'out');
      if (vp) vp.classList.remove('app-in');
    }, 460);
    var fn = splAfter; splAfter = null;
    if (fn) fn();
  }

  /* ============================================================
     v0.45 登录 / 注册
     ------------------------------------------------------------
     流程：开屏 → 登录闸门（已登录直接进首页 / 未登录进登录页）
     登录页三面板：入口（一键登录优先）→ 验证码 → 新用户完善资料
     第三方授权后若未绑手机号，复用同一套「验证码」流程完成绑定（flow=bind），
     因此注册、登录、绑定三件事共用一条链路，不存在重复页面。
     ============================================================ */
  var authFlow = 'login';        // login（登录/注册） | bind（第三方绑定手机号）
  var authPhone = '';            // 当前正在验证的号码
  var authThird = null;          // 第三方临时身份 { provider, openId, nick, avatar }
  var authAvatar = '🧭';
  var ocResult = null;           // 一键登录预取号结果（进入登录页前已完成，失败则降级）
  var authPhoneMode = 'manual';  // 手机号区当前视图：oneclick（已取到号）| manual（手动输入）
  var authPhoneManualForced = false; // 用户主动点过「使用其他手机号」→ 锁在手动态，取号成功也不回切
  var authCodeSrc = 'manual';    // 验证码来源：oneclick | manual —— 只用于埋点归因，不影响流程
  var resendTimer = null, resendLeft = 0;
  var AVATARS = ['🧭','🥾','🚲','🧗','🏖️','🐟','📸','🔥'];

  function A_() { return S().auth; }
  function isLogged() { return !!(S().auth && S().auth.logged); }
  function agreed() { return !!(A_().agreements && A_().agreements.checked); }
  function thirdName(k) { return ({ wechat:'微信', qq:'QQ', douyin:'抖音', apple:'Apple' })[k] || k; }
  /* 登录方式归因：第三方绑定记 provider，否则按验证码来源区分一键取号 / 手输号码 */
  function authLoginMethod() {
    if (authFlow === 'bind' && authThird) return authThird.provider;
    return authCodeSrc === 'oneclick' ? 'oneclick' : 'sms';
  }

  function showErr(sel, msg) { var el = $(sel); if (el) el.textContent = msg || ''; }
  function clearErrs() { ['#phoneErr', '#aocErr', '#codeErr', '#nickErr'].forEach(function (s) { showErr(s, ''); }); }

  /* 预取号：真机上开屏阶段就开始，进登录页号码已在手；失败必须降级为短信 */
  function preOneClick() {
    return window.Auth.oneClick().then(function (r) { ocResult = r; return r; });
  }

  function openAuth() {
    clearErrs(); stopResend();
    authFlow = 'login'; authThird = null;
    authPhoneManualForced = false;   // 每次打开登录页回到默认策略：取到号就用一键视图
    authCodeSrc = 'manual';
    renderAuthEntry(); showPanel('ap-entry');
    openOv('ov-auth');
    A.track('auth_view', { flow: authFlow });
    /* 取号异步：此刻若还没结果，拿到后要回刷一次，否则用户第一眼看到的是降级态 */
    if (!ocResult) {
      preOneClick().then(function () {
        if ($('#ov-auth').classList.contains('show')) renderAuthEntry();
      });
    }
  }
  function showPanel(id) {
    ['ap-entry', 'ap-code', 'ap-profile'].forEach(function (p) {
      var el = $('#' + p); if (el) el.style.display = (p === id ? '' : 'none');
    });
  }
  /* 手机号区渲染：#ap-oc（已回填本机号）与 #ap-manual（手动输入）严格互斥，
     靠 display 切换 —— 同一时刻页面上只会存在一个输入入口。 */
  function renderAuthEntry() {
    var ck = $('#authCk'); if (ck) ck.classList.toggle('on', agreed());
    var hasOc = !!(ocResult && ocResult.ok);

    /* 视图选择优先级：
       1) 第三方绑定流程 → 强制手动态（要绑的是用户填写的号，不是本机号）
       2) 用户主动点过「使用其他手机号」→ 尊重其选择，锁在手动态
       3) 取到号 → 一键视图（回填掩码号码，隐藏输入框）
       4) 否则 → 手动态兜底（无空白、无不可用） */
    if (authFlow === 'bind') authPhoneMode = 'manual';
    else if (authPhoneManualForced) authPhoneMode = 'manual';
    else authPhoneMode = hasOc ? 'oneclick' : 'manual';

    $('#ap-oc').style.display = (authPhoneMode === 'oneclick') ? '' : 'none';
    $('#ap-manual').style.display = (authPhoneMode === 'manual') ? '' : 'none';
    /* 对齐补偿：号码卡片比输入框高，切换后下方内容会整体上跳。
       有号可切时给手动态补等高上内边距，使「错误位 + 获取验证码按钮」在两态下完全同位；
       兜底态（无一键视图可切）不补，否则顶部会出现无意义的空洞。 */
    $('#ap-manual').classList.toggle('align', hasOc);

    /* 一键视图文案 */
    var tip = $('#aocTip');
    if (hasOc) {
      $('#aocPhone').textContent = window.Auth.maskPhone(ocResult.phone);
      $('#aocTipTx').textContent = '已通过运营商获取本机号码';
      tip.classList.remove('warn');
    } else {
      $('#aocTipTx').textContent = (ocResult && ocResult.msg) || '未获取到本机号码，请手动输入';
      tip.classList.add('warn');
    }
    /* 切换入口常驻容器底部（位置恒定，切换时自身不位移）。
       取号失败时"无号可返"，直接隐藏，避免出现点了没反应的死链。 */
    var tog = $('#authPhoneToggle');
    if (tog) {
      tog.style.display = hasOc ? '' : 'none';
      var toManual = (authPhoneMode === 'oneclick');
      tog.textContent = toManual ? '其他手机号登录' : '返回一键登录';
      tog.dataset.v = toManual ? 'manual' : 'oneclick';
    }

    /* 两种视图的按钮文案保持一致（绑定态统一为「获取验证码并绑定」） */
    var label = authFlow === 'bind' ? '获取验证码并绑定' : '获取验证码';
    var sendBtn = $('#authSendBtn'); if (sendBtn) sendBtn.textContent = label;
    var ocBtn = $('#authOneClick'); if (ocBtn) ocBtn.textContent = label;

    var ph = $('#authPhone'); if (ph && !ph.value) ph.value = authPhone || '';

    var sub = $('#authThirdTip');
    if (authFlow === 'bind' && authThird) {
      if (!sub) {
        sub = document.createElement('div'); sub.id = 'authThirdTip'; sub.className = 'auth-err';
        sub.style.color = 'var(--sub)'; $('#ap-entry').insertBefore(sub, $('#ap-phone'));
      }
      sub.textContent = '已通过' + thirdName(authThird.provider) + '授权，绑定手机号后即可登录';
      sub.style.display = '';
    } else if (sub) { sub.style.display = 'none'; }
  }

  /* ---- 面板 2：验证码 ---- */
  function gotoCode(phone, r, src) {
    authPhone = phone; authCodeSrc = src || 'manual'; showPanel('ap-code');
    $('#codeTitle').textContent = authFlow === 'bind' ? '绑定手机号' : '手机号登录 / 注册';
    $('#codePhone').textContent = '+86 ' + window.Auth.maskPhone(phone);
    $('#authVerifyBtn').textContent = authFlow === 'bind' ? '绑定并登录' : '登录';
    $('#codeFoot').textContent = authFlow === 'bind'
      ? '该手机号已有账号时将自动合并' : '登录即注册，表示同意以上协议';
    var box = $('#codeBox');
    [].forEach.call(box.children, function (i) { i.value = ''; });
    box.classList.remove('err'); showErr('#codeErr', '');
    startResend((r && r.cooldown) || (window.AUTH_CONFIG.sms.resendSec || 60));
    /* 验证码回显（受 exposeCodeInDemo 控制）写在底部提示里，不用 toast —— 居中 toast 会压住「登录」主按钮 */
    if (r && r.code) $('#codeFoot').textContent = '演示验证码：' + r.code + '（生产环境不会下发）';
    setTimeout(function () { try { box.children[0].focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function startResend(sec) {
    stopResend();
    var b = $('#resendBtn'); if (!b) return;
    resendLeft = sec; b.disabled = true; b.textContent = '重新获取 ' + resendLeft + 's';
    resendTimer = setInterval(function () {
      resendLeft--; if (resendLeft <= 0) { stopResend(); return; }
      b.textContent = '重新获取 ' + resendLeft + 's';
    }, 1000);
  }
  function stopResend() {
    clearInterval(resendTimer); resendTimer = null;
    var b = $('#resendBtn'); if (!b) return;
    b.disabled = false; b.textContent = '重新获取';
  }
  function codeValue() {
    return [].map.call($('#codeBox').children, function (i) { return i.value; }).join('');
  }
  function shakeAgree() {
    var el = $('#authAgree'); if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    toast('请先勾选同意用户协议与隐私政策');
    A.track('auth_agree_block', {});
  }
  function authLoading(on, tx) {
    var el = $('#authLoading'); if (!el) return;
    if (tx) $('#alTx').textContent = tx;
    el.classList.toggle('show', !!on);
  }

  /* ---- 完成登录：签发令牌并进入应用 ---- */
  function applyToken(t) {
    var a = A_();
    a.token = t.token; a.refreshToken = t.refreshToken;
    a.expireAt = t.expireAt; a.refreshExpireAt = t.refreshExpireAt;
    DB.save();
  }
  function finishLogin(uid, method, phone, opt) {
    opt = opt || {};
    var t = window.Auth.issue('me', method, phone);
    var a = A_();
    a.logged = true; a.uid = 'me'; a.phone = phone || null; a.method = method;
    a.token = t.token; a.refreshToken = t.refreshToken;
    a.expireAt = t.expireAt; a.refreshExpireAt = t.refreshExpireAt;
    a.lastLoginAt = Date.now(); a.newUser = !!opt.newUser;
    /* v0.48 资料完善标记：只在首次注册流程写入；老用户登录保持既有值，
       因此二次登录不会被再次拦到完善资料页。 */
    if (opt.newUser) a.profileCompleted = (opt.profileCompleted !== false);
    if (opt.nick && S().me) { S().me.name = opt.nick; S().me.py = letterOf(S().me); }   // v0.57：改昵称同步首字母
    if (opt.avatar && S().me) S().me.avatar = opt.avatar;
    if (['wechat', 'qq', 'douyin', 'apple'].indexOf(method) >= 0) {
      a.thirdBound = (a.thirdBound || []).slice();
      if (a.thirdBound.indexOf(method) < 0) a.thirdBound.push(method);
    }
    DB.save();
    A.track('login_success', { method: method, newUser: !!opt.newUser });
    authLoading(false);
    /* 登录落地后把浮层复位到入口面板：否则下次打开登录页会残留在完善资料/验证码面板 */
    showPanel('ap-entry');
    closeOv('ov-auth');
    toast(opt.newUser ? '注册成功，欢迎加入野遇' : '登录成功', 'ok');
    enterApp();
  }

  /* ---- 登录闸门：开屏结束后执行 ---- */
  function authGate() {
    if (/[?&]auth=0/.test(location.search)) {
      /* 演示未登录冷启动：只清登录态，保留本地内容 */
      var a = A_();
      a.logged = false; a.token = null; a.refreshToken = null; a.uid = null;
      a.expireAt = 0; a.refreshExpireAt = 0; a.method = null;
      /* ?auth=0 等同于「新装冷启动」：协议同意状态一并重置，便于演示勾选前置校验 */
      a.agreements = { checked: false, version: '' };
      DB.save();
    }
    if (!isLogged()) { openAuth(); return; }
    window.Auth.ensure(A_()).then(function (r) {
      if (r.ok) {
        if (r.token) { applyToken(r); A.track('token_refresh', { silent: true }); }
        /* v0.48 资料未完善（上次点了「以后再说」）→ 再提示一次；已完善则直进首页 */
        if (A_().profileCompleted === false) enterProfile();
        else enterApp();
      } else {
        /* refresh_token 也过期：不能再让用户"假装在线"，强制回登录页 */
        doLogout(true, r.msg || '登录已过期，请重新登录');
      }
    });
  }
  function doLogout(silent, msg) {
    window.Auth.logout().then(function () {
      var a = A_();
      a.logged = false; a.uid = null; a.method = null;
      a.token = null; a.refreshToken = null; a.expireAt = 0; a.refreshExpireAt = 0;
      /* 只清凭据，不清内容：重新登录即可恢复，避免"退出＝丢数据"的挫败感 */
      DB.save();
      A.track('logout', {});
      closeOv('ov-settings');
      openAuth();
      if (msg) toast(msg);
      else if (!silent) toast('已退出登录');
    });
  }
  /* 进入主界面：首登引导优先，否则回消息页并弹系统消息 */
  function enterApp() {
    var ob = maybeOnboard();
    if (!ob) switchTab('chats');
  }

  /* ---- 第三方授权：四种异常各有归处，不吞错、不静默 ---- */
  function doOauth(provider) {
    if (!agreed()) { shakeAgree(); return; }
    var nm = thirdName(provider);
    authLoading(true, '正在唤起' + nm + '…');
    A.track('oauth_start', { provider: provider });
    window.Auth.oauth(provider).then(function (r) {
      if (!r.ok) {
        authLoading(false);
        A.track('oauth_fail', { provider: provider, reason: r.reason });
        if (r.reason === 'cancel') { toast(r.msg); return; }
        if (r.reason === 'not-installed') {
          confirmBox('无法唤起' + nm, r.msg + '。你也可以用手机号验证码登录。', function () {
            var el = $('#authPhone'); if (el) el.focus({ preventScroll: true });
          }, '用手机号登录', '关闭');
          return;
        }
        /* fail（网络 / 服务端异常）：给一次明确重试入口，而不是让用户自己猜下一步 */
        confirmBox(nm + '授权失败', r.msg + '。是否重试？', function () { doOauth(provider); }, '重试', '换种方式');
        return;
      }
      if (r.needMerge) {
        authLoading(false);
        A.track('oauth_need_merge', { provider: provider });
        confirmBox('该' + nm + '已绑定其它账号',
          '已绑定：' + ((r.boundTo && r.boundTo.nick) || '未命名') + '（' + window.Auth.maskPhone(r.boundTo && r.boundTo.phone) + '）。合并后资料与圈子合并到该账号，是否继续？',
          function () { finishLogin('me', provider, r.boundTo.phone, {}); }, '合并并登录', '取消');
        return;
      }
      if (r.needBind) {
        /* 合规 + 可找回：第三方首次登录必须绑手机号，否则账号无法找回、也无法做实名追溯 */
        authLoading(false);
        A.track('oauth_need_bind', { provider: provider });
        authThird = { provider: provider, openId: r.openId, nick: r.nick, avatar: r.avatar };
        authFlow = 'bind';
        showPanel('ap-entry'); renderAuthEntry();
        toast('为保护账号安全，请绑定手机号');
        return;
      }
      A.track('oauth_success', { provider: provider });
      finishLogin('me', provider, (r.boundTo && r.boundTo.phone) || A_().phone, { nick: r.nick, avatar: r.avatar });
    });
  }

  /* ---- 新用户完善资料（注册最后一步，可跳过）---- */
  /* ============================================================
     v0.48 完善资料（首次登录）
     ------------------------------------------------------------
     昵称：本地同步校验（长度/字符集）过了才发查重请求，防抖 400ms，
           慢响应不覆盖新结果（请求序号比对）。
     头像：内置预设 + 自定义（相册选图 → 格式/大小/尺寸校验 → 裁剪 → 预览）。
     保存：仅当昵称查重通过才可用；失败给明确文案且按钮变「重新保存」，可原地重试。
     ============================================================ */
  var profAvatar = { type: 'preset', value: '🧭' };  // preset(emoji) | custom(dataURL)
  var profNickState = 'idle';      // idle | checking | ok | bad
  var profSaving = false, profSaveFailed = false;
  var nickTimer = null, nickReqSeq = 0;
  var profCrop = { img: null, src: '', natW: 0, natH: 0, base: 1, z: 1, tx: 0, ty: 0, side: 0 };

  function profCfg() { return (window.AUTH_CONFIG && window.AUTH_CONFIG.profile) || {}; }

  function enterProfile() {
    if (!$('#ov-auth').classList.contains('show')) openOv('ov-auth');
    showPanel('ap-profile');
    profAvatar = { type: 'preset', value: authAvatar || '🧭' };
    profNickState = 'idle'; profSaving = false; profSaveFailed = false;
    clearTimeout(nickTimer); nickReqSeq++;
    /* 内置预设头像（生产可由服务端下发头像库，这里保持一致的数据结构） */
    $('#profPresets').innerHTML = AVATARS.map(function (e) {
      return '<span class="' + (e === profAvatar.value ? 'on' : '') + '" data-action="prof-ava" data-v="' + e + '">' + e + '</span>';
    }).join('');
    renderProfAvatar();
    var nick = $('#profNick'); if (nick) nick.value = '';
    setNickUI('idle', '');
    showErr('#profSaveErr', '');
    setSaveBtn();
  }

  function renderProfAvatar() {
    var box = $('#profAvaView');
    if (profAvatar.type === 'custom') box.innerHTML = '<img src="' + profAvatar.value + '" alt="头像预览" />';
    else box.textContent = profAvatar.value;
    $$('#profPresets span').forEach(function (sp) {
      sp.classList.toggle('on', profAvatar.type === 'preset' && sp.dataset.v === profAvatar.value);
    });
  }

  /* ------------------------- 昵称 ------------------------- */
  function setNickUI(state, msg) {
    profNickState = state;
    var f = $('#profField'), ic = $('#profNickIc'), h = $('#profHint');
    if (!f || !h) return;
    f.classList.remove('ok', 'bad'); ic.className = 'prof-ic'; ic.textContent = '';
    h.classList.remove('err', 'ok');
    if (state === 'checking') {
      ic.className = 'prof-ic loading'; h.textContent = '正在检查昵称可用性…';
    } else if (state === 'ok') {
      f.classList.add('ok'); ic.className = 'prof-ic ok'; ic.textContent = '✓';
      h.classList.add('ok'); h.textContent = msg || '该昵称可以使用';
    } else if (state === 'bad') {
      f.classList.add('bad'); ic.className = 'prof-ic bad'; ic.textContent = '!';
      h.classList.add('err'); h.textContent = msg;
    } else {
      h.textContent = '支持中英文、数字、下划线和连字符';
    }
    setSaveBtn();
  }
  function setSaveBtn() {
    var b = $('#profSaveBtn'); if (!b) return;
    b.disabled = (profNickState !== 'ok') || profSaving;
    b.classList.toggle('saving', profSaving);
    b.innerHTML = profSaving ? '<i class="ps-spin"></i>保存中…'
                             : (profSaveFailed ? '重新保存' : '保存并进入野遇');
  }
  function onNickInput() {
    var v = ($('#profNick').value || '').trim();
    clearTimeout(nickTimer); nickReqSeq++;
    profSaveFailed = false; showErr('#profSaveErr', '');
    if (!v) { setNickUI('idle', ''); return; }
    var p = profCfg(), min = p.nickMinLen || 2, max = p.nickMaxLen || 12;
    /* 本地同步校验先过一遍，格式都不对就没必要打接口 */
    if (v.length < min) { setNickUI('bad', '昵称至少 ' + min + ' 个字符'); return; }
    if (v.length > max) { setNickUI('bad', '昵称不超过 ' + max + ' 个字符'); return; }
    if (!new RegExp('^' + (p.nickPattern || '[\\u4e00-\\u9fa5A-Za-z0-9_-]+') + '$').test(v)) {
      setNickUI('bad', '仅支持中英文、数字、下划线和连字符，不能含空格或表情'); return;
    }
    setNickUI('checking', '');
    var seq = ++nickReqSeq;
    nickTimer = setTimeout(function () {
      window.Auth.checkNick(v).then(function (r) {
        if (seq !== nickReqSeq) return;    // 已有更新的输入，丢弃本次响应
        if (!r.ok || !r.available) setNickUI('bad', r.msg);
        else setNickUI('ok', r.msg);
      });
    }, p.checkDebounceMs || 400);
  }

  /* ------------------------- 头像：相册选图 ------------------------- */
  function profPickAvatar() {
    if (!window.FileReader) {
      toast('当前环境不支持读取图片，请更换浏览器或先使用内置头像');
      return;
    }
    var inp = $('#profFile'); if (!inp) return;
    inp.value = '';                        // 清空，允许连续选择同一张图
    try { inp.click(); } catch (e) { toast('无法打开相册，请稍后重试'); }
    A.track('avatar_pick_open', {});
  }
  function onProfFile(e) {
    var inp = e.target, f = inp.files && inp.files[0];
    if (!f) { A.track('avatar_pick_cancel', {}); return; }   // 取消选图：安静返回
    var a = profCfg().avatar || {};
    var maxB = (a.maxSizeMb || 10) * 1024 * 1024;
    if (a.acceptMime && a.acceptMime.length && a.acceptMime.indexOf(f.type) < 0) {
      toast('仅支持 JPG / PNG / WEBP 格式的图片');
      A.track('avatar_bad_format', { type: f.type });
      return;
    }
    if (f.size > maxB) {
      toast('图片不能超过 ' + (a.maxSizeMb || 10) + 'MB，当前 ' + (f.size / 1048576).toFixed(1) + 'MB');
      A.track('avatar_too_large', { size: f.size });
      return;
    }
    var fr = new FileReader();
    fr.onload = function () { loadCropImage(String(fr.result)); };
    fr.onerror = function () { toast('图片读取失败，请更换一张试试'); };
    fr.readAsDataURL(f);
  }
  function loadCropImage(src) {
    var img = new Image();
    img.onload = function () {
      var a = profCfg().avatar || {}, minPx = a.minPx || 80;
      if (Math.min(img.naturalWidth, img.naturalHeight) < minPx) {
        toast('图片尺寸过小（至少 ' + minPx + '×' + minPx + '），请更换一张');
        A.track('avatar_too_small', { w: img.naturalWidth, h: img.naturalHeight });
        return;
      }
      profCrop.img = img; profCrop.src = src;
      profCrop.natW = img.naturalWidth; profCrop.natH = img.naturalHeight;
      profCrop.z = 1; profCrop.tx = 0; profCrop.ty = 0;
      $('#cropImg').src = src;
      openOv('ov-crop');
      /* 浮层显示后才能量到真实尺寸，放到下一帧再布局 */
      requestAnimationFrame(layoutCrop);
    };
    img.onerror = function () { toast('图片已损坏或格式不支持，请更换一张'); };
    img.src = src;
  }

  /* ------------------------- 裁剪器 ------------------------- */
  function layoutCrop() {
    var stage = $('#cropStage'), im = $('#cropImg'), hole = $('#cropHole');
    if (!stage || !im) return;
    var S = Math.min(stage.clientWidth || 280, stage.clientHeight || 280);
    profCrop.side = Math.round(S * 0.88);          // 裁剪框边长（占舞台 88%，构图不空）
    hole.style.width = profCrop.side + 'px';
    hole.style.height = profCrop.side + 'px';
    /* 基准缩放：短边刚好铺满裁剪框，初始状态不露底 */
    profCrop.base = Math.max(profCrop.side / profCrop.natW, profCrop.side / profCrop.natH);
    im.style.width = Math.round(profCrop.natW * profCrop.base) + 'px';
    im.style.height = Math.round(profCrop.natH * profCrop.base) + 'px';
    setZoom(1);
  }
  function applyCropTransform() {
    var im = $('#cropImg'); if (!im) return;
    im.style.transform = 'translate(-50%,-50%) translate3d(' + profCrop.tx + 'px,' + profCrop.ty + 'px,0) scale(' + profCrop.z + ')';
  }
  function clampPan() {
    /* 约束：缩放后图片必须完整覆盖裁剪框，四周不能露出底色 */
    var half = profCrop.side / 2;
    var maxX = Math.max(0, (profCrop.natW * profCrop.base * profCrop.z) / 2 - half);
    var maxY = Math.max(0, (profCrop.natH * profCrop.base * profCrop.z) / 2 - half);
    profCrop.tx = Math.min(maxX, Math.max(-maxX, profCrop.tx));
    profCrop.ty = Math.min(maxY, Math.max(-maxY, profCrop.ty));
  }
  function setZoom(nz) {
    profCrop.z = Math.min(3, Math.max(1, nz));
    var z = $('#cropZoom'); if (z) z.value = String(Math.round(profCrop.z * 100));
    clampPan(); applyCropTransform();
  }
  function bindCrop() {
    var stage = $('#cropStage'); if (!stage) return;
    var pts = {}, lastDist = 0;
    function keys() { return Object.keys(pts); }
    function dist() {
      var k = keys(); if (k.length < 2) return 0;
      var a = pts[k[0]], b = pts[k[1]];
      return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }
    stage.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (keys().length === 2) lastDist = dist();
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      var prev = pts[e.pointerId];
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (keys().length === 1) { profCrop.tx += e.clientX - prev.x; profCrop.ty += e.clientY - prev.y; }
      else if (keys().length === 2) { var d = dist(); if (lastDist > 0) setZoom(profCrop.z * (d / lastDist)); lastDist = d; }
      clampPan(); applyCropTransform();
      e.preventDefault();
    });
    function up(e) { delete pts[e.pointerId]; if (keys().length < 2) lastDist = 0; }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    var z = $('#cropZoom');
    if (z) z.addEventListener('input', function () { setZoom(parseInt(z.value, 10) / 100); });
  }
  function renderCrop(px, q) {
    if (!profCrop.img) return '';
    var cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    var ctx = cv.getContext('2d');
    if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingQuality = 'high';
    var sc = profCrop.base * profCrop.z;
    var dispW = profCrop.natW * sc, dispH = profCrop.natH * sc;
    /* 舞台中心在图片坐标系中的位置 → 换算裁剪框对应的原图区域 */
    var cx = dispW / 2 - profCrop.tx, cy = dispH / 2 - profCrop.ty;
    var sw = profCrop.side / sc;
    var sx = Math.max(0, (cx - profCrop.side / 2) / sc);
    var sy = Math.max(0, (cy - profCrop.side / 2) / sc);
    ctx.drawImage(profCrop.img, sx, sy, sw, sw, 0, 0, px, px);
    return cv.toDataURL('image/jpeg', q);
  }
  function cropDone() {
    var a = profCfg().avatar || {};
    var out = a.outputPx || 320, q = a.outputQuality || 0.9, limitKb = a.compressAboveKb || 220;
    /* 输出过大就降一档重新导出：兼顾清晰度与 localStorage / 上传体积 */
    var sizes = [out, 240, 160], dataUrl = '';
    for (var i = 0; i < sizes.length; i++) {
      dataUrl = renderCrop(sizes[i], q);
      if (!dataUrl) { toast('裁剪失败，请重新选择图片'); closeOv('ov-crop'); return; }
      if (dataUrl.length / 1024 <= limitKb || i === sizes.length - 1) break;
    }
    profAvatar = { type: 'custom', value: dataUrl };
    renderProfAvatar();
    closeOv('ov-crop');
    toast('头像已更新', 'ok');
    A.track('avatar_crop_done', { px: sizes[i - 1 >= 0 ? i : 0] });
  }
  function cropCancel() { closeOv('ov-crop'); A.track('avatar_crop_cancel', {}); }

  /* ------------------------- 保存 ------------------------- */
  function profSave() {
    if (profSaving || profNickState !== 'ok') return;
    var nick = ($('#profNick').value || '').trim();
    if (!nick) { setNickUI('bad', '请填写昵称'); return; }
    profSaving = true; profSaveFailed = false;
    showErr('#profSaveErr', '');
    setSaveBtn();
    A.track('profile_save_start', { avatarType: profAvatar.type });
    window.Auth.saveProfile({
      uid: 'me', nick: nick,
      avatar: profAvatar.type === 'custom' ? profAvatar.value : null
    }).then(function (r) {
      profSaving = false;
      if (!r.ok) {
        /* 失败：文案就地显示 + 按钮变「重新保存」，用户可原地重试，不用重走流程 */
        profSaveFailed = true; setSaveBtn();
        showErr('#profSaveErr', r.msg + '，请点击下方按钮重试');
        A.track('profile_save_fail', { err: r.err });
        return;
      }
      A.track('profile_save_ok', { avatarType: profAvatar.type });
      /* 完善资料已是首登流程第二步，再叠一层「兴趣标签」引导会把首登变成三步，
         流失风险高 —— 默认保存成功即视为完成首登引导，直接落地首页。
         若产品侧坚持先选兴趣，把 config.profile.skipOnboardAfterProfile 置 false 即可。 */
      if (profCfg().skipOnboardAfterProfile !== false) S().onboarded = true;
      finishLogin('me', authLoginMethod(), authPhone, {
        newUser: true, profileCompleted: true,
        nick: nick, avatar: profAvatar.value
      });
    });
  }
  function profSkip() {
    /* 跳过后资料仍不完整：按配置决定下次登录是否再提示一次 */
    var force = profCfg().forceUntilCompleted !== false;
    A.track('profile_skip', { willAskAgain: force });
    finishLogin('me', authLoginMethod(), authPhone, { newUser: true, profileCompleted: !force });
  }


  /* ============================================================
     v0.49 预览壳自适应
     手机是固定 398×836 的等比模型；窗口高度不足时不能靠页面滚动（会被裁切、
     且演示时看不到整机），改为整机等比缩放。侧栏则相反：保持原字号，限高内滚。
     两者结合后整页高度恒 ≤ 窗口高度，上下都不会被裁。
     ============================================================ */
  var PHONE_MIN_SCALE = 0.6;
  /* v0.68：原来只按「高度」缩放。宽度一旦不够（手机浏览器、缩放过的窗口），
     398px 的机身会横向溢出，而 flex 居中溢出的那一半滚不过去 —— 用户看到的就是
     「页面只剩右半边、左边文字全被切掉」。现在宽高一起算，且 padding 从 CSS 实读，
     避免 JS 里写死 20 与 media query 里的 10 不一致。 */
  function fitStage() {
    var ph = document.querySelector('.phone');
    if (!ph) return;
    ph.style.zoom = '';                                   // 先还原，才能量到自然尺寸
    var natW = ph.offsetWidth || 398, natH = ph.offsetHeight || 836;
    var cs = window.getComputedStyle(document.body);
    var padX = (parseFloat(cs.paddingLeft) || 20) + (parseFloat(cs.paddingRight) || 20);
    var padY = (parseFloat(cs.paddingTop) || 20) + (parseFloat(cs.paddingBottom) || 20);
    var kW = (window.innerWidth - padX) / natW;
    var kH = (window.innerHeight - padY) / natH;
    var k = Math.max(PHONE_MIN_SCALE, Math.min(1, kW, kH));
    if (k < 1) ph.style.zoom = k;
    /* 极端窄屏（<240px）连 0.6 都放不下：兜底允许横向滚动，至少内容可达 */
    document.body.style.overflowX = (kW < PHONE_MIN_SCALE) ? 'auto' : '';
    resetBezelScroll();
  }
  /* v0.68 兜底：无论什么原因（focus、缩放、输入法、手指误滑）把手机屏横向滚走了，
     一律归零 —— 屏幕内容左移 1px 用户就会看到"左边被切掉一条"。 */
  function resetBezelScroll() {
    var bz = document.querySelector('.bezel');
    if (bz && bz.scrollLeft) bz.scrollLeft = 0;
    var vp = document.querySelector('.viewport');
    if (vp && vp.scrollLeft) vp.scrollLeft = 0;
  }

  function init() {
    DB.load();
    applyTheme();
    fitStage();
    window.addEventListener('resize', fitStage);
    window.addEventListener('orientationchange', fitStage);
    var bz0 = document.querySelector('.bezel');
    if (bz0) bz0.addEventListener('scroll', resetBezelScroll, { passive: true });
    bind(); clock(); setInterval(clock, 20000);
    ctBindIndex();                 /* v0.51 好友字母索引：滑动手势（一次性绑定） */
    /* v0.73：标题里的版本手写过，升到 v0.73 还挂着 v0.68 —— 浏览器标签页是别人看到的第一眼，
       版本号对不上会让人以为打开的是旧版。交给 APP_VERSION 单一源，以后不再漏改。 */
    document.title = document.title.replace(/v[\d.]+$/, APP_VERSION);
    /* v0.76 移除：原 ?nice=88888 演示参数（直接给账号挂靓号）。
       那是走查用的后门，真实业务里靓号只能经商城购买写入，保留会掩盖这条链路的缺陷。 */
    renderAll();
    A.track('app_open', { ua: navigator.userAgent.slice(0, 60) });
    /* 开屏期间并行预取号：真机也是这个时机，进登录页时号码已在手 */
    preOneClick();
    playSplash(authGate);
    window.App = {
      renderChats: renderChats, renderContacts: renderContacts,
      renderPlaza: renderPlaza,
      /* v0.58：原 renderMoments 语义变了（从"动态"改为"好友关系流"），对外名同步改为 friendsFeed */
      friendsFeed: renderFriendsFeed, renderMe: renderMe,
      renderCircles: renderCircles, mkField: mkField, circleSearch: circleSearch,
      openCircleCode: openCircleCode, submitCircleCode: submitCircleCode, resetCircleCode: resetCircleCode,
      openCircleDetail: openCircleDetail,
      openPublish: openPublish, openCirclePublish: openCirclePublish,
      /* v0.65：可见范围与圈子同步权限的判定函数对外暴露，便于测试直接校验规则本身 */
      visOf: visOf, visLabel: visLabel, canSyncCircle: canSyncCircle, pubCircleList: pubCircleList,
      openCircleMembers: openCircleMembers, renderCircleMembers: renderCircleMembers,
      renderPicker: renderPicker,                     // v0.32：#pickerSearch 的 oninput 回调
      openGroupInfo: openGroupInfo, renderGroupInfo: renderGroupInfo, renderMembers: renderMembers,
      renderInviteFriends: renderInviteFriends,
      toggleCircleMembersHidden: toggleCircleMembersHidden, toggleCircleMemberPost: toggleCircleMemberPost,
      setCircleInvitePerm: setCircleInvitePerm, canInvite: canInvite,
      doPublish: doPublish, openVipPay: openVipPay, renderVip: renderVip, renderVipFoot: renderVipFoot,
      /* v0.33 三级会员体系对外授权：供 smoke-test 做「权益-实现一致性」校验 */
      En: En, ENTITLEMENTS: ENTITLEMENTS, ENT_ROADMAP: ENT_ROADMAP,
      TIER_META: TIER_META, PLAN_TIER: PLAN_TIER,
      upgradeQuote: upgradeQuote, planOf: planOf, tierOfPlan: tierOfPlan,
      stealthActive: stealthActive, stealthGrace: stealthGrace,
      cmemSearch: cmemSearch, openCircleApply: openCircleApply,
      openInviteFriends: openInviteFriends, renderCircleInvites: renderCircleInvites,
      pubCount: pubCount, applyTheme: applyTheme,
      renderDesignSystem: renderDesignSystem,
      /* v0.44 开屏页对外授权：供 smoke-test 与右侧面板「重播」复用 */
      playSplash: playSplash, endSplash: endSplash,
      /* v0.45 登录模块对外授权：供 smoke-test 与右侧面板复用 */
      openAuth: openAuth, logout: doLogout, authGate: authGate, isLogged: isLogged,
      authState: A_, enterProfile: enterProfile,
      /* v0.48 完善资料对外授权：供 smoke-test 与右侧面板复用 */
      profSave: profSave, profPickAvatar: profPickAvatar, profState: function () {
        return { avatar: profAvatar, nickState: profNickState, saving: profSaving, failed: profSaveFailed };
      },
      /* v0.49 预览壳自适应 */
      fitStage: fitStage, resetBezelScroll: resetBezelScroll,
      /* v0.53 强提醒弹窗下线：对外授权 enterApp + 系统消息读取，
         供 smoke-test 验证「任何路径都不再唤起弹窗」 */
      enterApp: enterApp, renderSysMsg: renderSysMsg, sysList: sysList, sysSorted: sysSorted,
      /* v0.50 圈子角标：供 smoke-test 校验槽位不重叠 */
      circleBadges: circleBadges,
      /* v0.51 好友字母索引 */
      ctJump: ctJump, ctLetters: function () { return ctOrder.slice(); },
      ctAvail: function () { return ctAvail.slice(); },
      /* v0.57 首字母推导（动态索引） */
      letterOf: letterOf, pyLetter: pyLetter, ctSortKeys: ctSortKeys,
      /* v0.52 好友主页（备注 / 申请 / 删除 / 降级态） */
      profMore: profMore, openRemark: openRemark, saveRemark: saveRemark, remarkCount: remarkCount,
      openReqMsg: openReqMsg, sendReqMsg: sendReqMsg, deleteFriend: deleteFriend,
      openProfile: openProfile, renderProfile: renderProfile,
      userStatus: userStatus, isGone: isGone, reqState: reqState,
      setRemark: function (uid, v) { S().remarks = S().remarks || {}; if (v) S().remarks[uid] = v; else delete S().remarks[uid]; DB.save(); },
      skeletonRows: skeletonRows, skeletonCards: skeletonCards, skeletonMsgs: skeletonMsgs,
      /* v0.59 全局搜索 / 统一详情 / 图片查看器 */
      searchOpen: searchOpen, searchInput: searchInput, renderSearch: renderSearch,
      /* v0.71 靓号识别：供 smoke-test 直接校验判定口径（号码统一为纯数字，旧 ye_ 前缀数据也能认出） */
      niceInfo: niceInfo, isNice: isNice, idTagHtml: idTagHtml,
      srHist: srHist, srHot: srHot, srQuery: function (q) { return srQuery(q); },
      srGoTag: srGoTag, srClearHist: srClearHist,
      openPostDetail: openPostDetail, renderPostDetail: renderPostDetail,
      postById: postById, postLikeCount: postLikeCount, postLiked: postLiked,
      pdCmInput: pdCmInput, pdSend: pdSend, pdReply: pdReply,
      togglePostLike: togglePostLike,
      curPost: function () { return curPost; },
      openViewer: openViewer, viewerGo: viewerGo, viewerState: function () { return { imgs: vwImgs, idx: vwIdx }; },
      /* v0.77 通知中心 / 通知设置 / 关注粉丝 / 账号安全 / 邀请进群 / 群绑圈 */
      renderNotifications: renderNotifications, renderNotifySettings: renderNotifySettings,
      renderFollow: renderFollow, renderAccountSecurity: renderAccountSecurity,
      renderGroupInvite: renderGroupInvite, openBindSheet: openBindSheet,
      circleBinds: circleBinds, notiVisible: notiVisible, notiUnread: notiUnread
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
