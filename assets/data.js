/* ============================================================
   野遇 · 数据层
   全部数据存 localStorage（key: yeyu_proto_v1）
   无后端 / 无网络依赖 / 刷新不丢 / 可一键重置
   ============================================================ */
(function () {
  var KEY = 'yeyu_proto_v1';
  var VERSION = 2;                 // v2：群角色 / 靓号 / VIP / 订单 / 草稿 / 富消息
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;

  /* 圈邀请码：6 位大写字母+数字（v0.16 私密圈） */
  function genCode() {
    var ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += ch[Math.floor(Math.random() * ch.length)];
    return s;
  }

  /* v0.19：种子会员映射。seed() 与 migrate() 共用同一份，
     保证"全新安装"和"旧存档升级"看到的 VIP 铭牌完全一致。
     v0.33：y1 已由「年卡VIP」升格为 SVIP，name 同步改为 SVIP 套餐名。 */
  var VIP_SEED = {
    u1: { plan:'y1', name:'SVIP 年卡', days:365, used:60 },
    u2: { plan:'m1', name:'VIP 月卡',  days:30,  used:60 },   // used > days → 已过期，用于验证过期不显示
    u3: { plan:'q1', name:'VIP 季卡',  days:90,  used:20 },
    u5: { plan:'m1', name:'VIP 月卡',  days:30,  used:8  },
    u8: { plan:'y1', name:'SVIP 年卡', days:365, used:10 }
  };
  /* 生成 vip 对象；无种子的用户返回 undefined（= 非会员，序列化后无该 key，与旧存档同构） */
  function vipFromSeed(id) {
    var sv = VIP_SEED[id];
    if (!sv) return undefined;
    return {
      plan: sv.plan, name: sv.name, days: sv.days,
      start: Date.now() - sv.used * DAY,
      expire: Date.now() + (sv.days - sv.used) * DAY
    };
  }

  /* 老版本缓存缺字段（如群没有 owner），直接重建种子数据，避免 undefined 报错 */
  function migrate(s) {
    if (!s || s.version !== VERSION) return null;
    if (!s.niceIds || !s.vipPlans || !s.orders || !s.drafts) return null;
    /* v0.6 新字段：平台币余额 + 币流水，旧数据自动补全，不丢历史 */
    if (!s.coinLogs) s.coinLogs = [];
    if (s.me && s.me.coins == null) s.me.coins = 1000;
    /* v0.14 新字段：黑名单 / 举报记录 / 访客 / 打招呼日限额 */
    if (!s.blocked) s.blocked = [];
    if (!s.reports) s.reports = [];
    if (!s.visitors) s.visitors = [];
    if (!s.greetLog) s.greetLog = {};
    /* v0.15 新字段：地域圈子 / 圈子动态 / 我加入的圈子；旧数据无此结构则重建种子 */
    if (!s.circles) return null;
    if (!s.circlePosts) return null;
    if (!s.myCircles) return null;
    /* v0.16 新字段：圈子可见性 / 邀请码 / 入圈邀请 */
    if (!s.circleInvites) s.circleInvites = [];
    (s.circles || []).forEach(function (c) {
      if (!c.visibility) c.visibility = 'public';
      /* v0.17：入圈方式 invite（私密圈）/ approval（需审核）/ open（自由加入） */
      if (!c.joinMode) c.joinMode = c.visibility === 'private' ? 'invite' : 'open';
      if (c.visibility === 'private' && !c.code) c.code = genCode();
      /* v0.27：邀请码时效/次数默认值（旧存档补齐，20 次 / 7 天） */
      if (c.visibility === 'private') {
        if (c.codeLimit == null) c.codeLimit = 20;
        if (c.codeUsed == null) c.codeUsed = 0;
        if (!c.codeExpireAt) c.codeExpireAt = Date.now() + 7 * DAY;
      }
    });
    /* v0.17 新字段：圈子成员 / 入圈申请 */
    if (!s.circleMembers) s.circleMembers = [];
    if (!s.circleApplies) s.circleApplies = [];
    /* v0.52 新字段：备注名 / 用户状态（注销或封禁）
       旧存档缺这两个 key 时补齐为空，不清缓存也能用新功能。 */
    if (!s.remarks) s.remarks = {};
    (s.users || []).forEach(function (u) { if (!u.status) u.status = 'active'; });
    /* v0.53：强提醒弹窗下线。旧存档里 sysMsgs 仍带 popup 字段，这里彻底剥离，
       杜绝任何残留数据在别处被读出来再唤起弹窗。 */
    (s.sysMsgs || []).forEach(function (m) { if (m) delete m.popup; });
    /* v0.56：系统消息收敛为「安全提醒 / 平台公告」两类。旧存档里已下线的
       活动 / 交易 / 版本更新三类消息一并清除 —— 不能靠 sysCat() 的回落把这类内容
       静默归到「平台公告」里混着展示，那只会在抽屉里复活不该存在的分类。 */
    var SYS_ALIVE = { safety: 1, notice: 1 };
    s.sysMsgs = (s.sysMsgs || []).filter(function (m) { return m && SYS_ALIVE[m.cat]; });
    /* v0.33：隐身浏览由「设置开关」升级为 SVIP 独占能力。
       存量已开启的免费 / VIP 用户给 30 天豁免期，避免体感「被剥夺」引发投诉。 */
    if (s.stealthGraceUntil == null) {
      s.stealthGraceUntil = (s.settings && s.settings.stealth) ? (Date.now() + 30 * DAY) : 0;
    }
    /* v0.19 新字段：用户会员信息（VIP 铭牌）
       旧存档的 users 没有 vip key（老版本压根没有会员字段），若不补齐，
       只有清缓存才能看到 VIP 铭牌。这里按种子映射给"缺 key 的用户"补上，
       已有值（含 null = 非会员）一律不覆盖，尊重用户真实状态。 */
    (s.users || []).forEach(function (u) {
      if (u.vip !== undefined) return;      // 已有值（含 null = 非会员）不覆盖，尊重真实状态
      var v = vipFromSeed(u.id);            // 无种子的用户保持非会员（不建 key，与旧存档同构）
      if (v) u.vip = v;
    });
    /* v0.72 野遇号改为纯数字（原 ye_88888 这类「字母+数字」）。
       这里是原地归一化，不是重建种子：旧存档里已买的靓号、订单记录一条都不丢，
       用户不清缓存也能直接看到新格式。幂等 —— 已经是纯数字的再跑一次不变。 */
    (function () {
      function strip(n) { return String(n == null ? '' : n).replace(/^ye_/, ''); }
      if (s.me && s.me.yeyuNum) {
        s.me.yeyuNum = strip(s.me.yeyuNum);
        s.me.yeyuId = '野遇号：' + s.me.yeyuNum;
      }
      (s.niceIds || []).forEach(function (x) { if (x && x.num) x.num = strip(x.num); });
      (s.orders || []).forEach(function (o) { if (o && o.subject) o.subject = strip(o.subject); });
      (s.users || []).forEach(function (u) {
        if (!u || !u.yeyuNum) return;
        u.yeyuNum = strip(u.yeyuNum);
        u.yeyuId = '野遇号：' + u.yeyuNum;
      });
    })();
    /* v0.45 新字段：登录态。旧存档一律视为「已登录」，避免升级后老用户被登录墙挡住 */
    if (!s.auth) s.auth = seedAuth(true);
    /* v0.48 新字段：资料完善标记。旧存档视为已完善，避免升级后被完善资料页拦一次 */
    if (s.auth && s.auth.profileCompleted === undefined) s.auth.profileCompleted = true;
    /* v0.21 新字段：外观主题（light / dark）。旧存档缺省按浅色，不改变既有观感 */
    if (s.settings && !s.settings.theme) s.settings.theme = 'light';
    /* v0.36 新字段：平台系统消息 + 接收开关。
       旧存档无 sysMsgs 时注入种子消息（含防诈骗提醒），保证升级后立即可见；
       settings.sysmsg 缺省 true —— 安全类提醒默认开启，用户可主动关闭。 */
    if (!s.sysMsgs) s.sysMsgs = seedSysMsgs();
    if (s.settings && s.settings.sysmsg == null) s.settings.sysmsg = true;
    /* v0.37 瀑布流广场：给两条内容打上视频标记（教程 / 长线 vlog），并补齐一条纯文字社交帖（p9）。
       旧存档已存在的帖不丢，仅增量注入，保证升级后用户立即看到瀑布流的多种卡片形态。 */
    (s.plaza || []).forEach(function (p) {
      if (p.id === 'p4' || p.id === 'p5') p.video = true;
    });
    if (s.plaza && !s.plaza.some(function (p) { return p.id === 'p9'; })) {
      s.plaza.push({ id:'p9', userId:'u3', text:'一个人爬山久了，也想有个能一起看日出的人。有同感的举个手🙋', imgs:[], loc:'', tags:['找搭子','社交'], likes:77, comments:[{userId:'u9',text:'蹲一个，我也想',ts:Date.now()-(40*MIN)}], ts: Date.now()-(3*HOUR) });
    }
    /* v0.77 新字段：通知中心 / 群绑圈 / 分类型通知开关。旧存档原地补齐，不清缓存不丢数据。 */
    if (!s.notifications) s.notifications = [];
    if (!s.circleGroupBinds) s.circleGroupBinds = [];
    if (s.settings) {
      if (s.settings.notifyComment == null) s.settings.notifyComment = true;
      if (s.settings.notifyLike == null) s.settings.notifyLike = true;
      if (s.settings.notifyFollow == null) s.settings.notifyFollow = true;
      if (s.settings.notifyMention == null) s.settings.notifyMention = true;
      if (s.settings.privateMsg == null) s.settings.privateMsg = true;
      if (s.settings.youthMode == null) s.settings.youthMode = false;
    }
    return s;
  }

  /* v0.45 登录态种子
     logged=true 时签发一份有效 token；demoAccelerate 开启时有效期被压缩，便于演示刷新链路。 */
  function seedAuth(logged) {
    var acc = 1800, ref = 2592000;
    if (window.AUTH_CONFIG && window.AUTH_CONFIG.token && window.AUTH_CONFIG.token.demoAccelerate) { acc = 20; ref = 60; }
    return {
      logged: !!logged,
      uid: logged ? 'me' : null,
      phone: logged ? '18888886688' : null,
      method: logged ? 'preset' : null,          // oneclick | sms | wechat | qq | douyin | apple | preset
      token: logged ? 'atk.me.seed.' + Date.now() : null,
      refreshToken: logged ? 'rtk.me.seed.' + Date.now() : null,
      expireAt: logged ? Date.now() + acc * 1000 : 0,
      refreshExpireAt: logged ? Date.now() + ref * 1000 : 0,
      lastLoginAt: logged ? Date.now() : 0,
      agreements: { checked: logged, version: (window.AUTH_CONFIG && window.AUTH_CONFIG.agreements.version) || '2026-10-29' },
      thirdBound: logged ? ['wechat'] : [],       // 已绑定的第三方（用于「账号与安全」展示与合并提示）
      newUser: false,
      /* v0.48 资料是否已完善：预置演示账号视为已完善，二次登录不再拦完善资料页 */
      profileCompleted: logged ? true : false
    };
  }

  function seed() {
    var now = Date.now();
    var ago = function (ms) { return now - ms; };

  /* v0.36：平台系统消息（安全中心 / 运营下发，用户侧只读）
     字段契约与 B 端「消息推送」模块一致：
       id / cat / level / title / summary / body[] / from / ts
       read   是否已读（用户侧状态）
       pinned 是否置顶（紧急安全提醒默认置顶）
       cta    { t 文案, a 跳转 action, id 目标 } —— 没有 CTA 时缺省「知道了」
     v0.53：移除 popup（打开 App 弹一次）字段。同一份安全内容改由
     「我的页顶部横幅 + 系统消息置顶 + 铃铛红点」三处常量级触达。 */
  function seedSysMsgs() {
    var now = Date.now();
    var ag = function (ms) { return now - ms; };
    return [
      {
        id: 'sm1', cat: 'safety', level: 'urgent', read: false, pinned: true,
        from: '野遇安全中心',
        title: '警惕冒充「领队」收取报名费的诈骗',
        summary: '近期有账号冒充领队私信收取「报名费 / 装备押金」，野遇不会在任何场景下代收款项。',
        ts: ag(2 * HOUR),
        body: [
          '近期我们收到多起举报：有人冒充户外领队，在广场和圈子里以「占位费」「装备押金」「车费 AA 预付」为由，诱导用户微信或支付宝转账后失联。',
          '请记住三条铁律：',
          '① 野遇平台不提供、也不参与任何代收代付，所有线下费用请当面结清；',
          '② 任何要求「先转账再进群 / 先付款才发定位」的，一律视为诈骗；',
          '③ 遇到索要验证码、银行卡号、实时位置的行为，立即拉黑并举报。',
          '如果不确定对方身份，可以先在群里 @ 其他成员交叉确认，或点对方头像查看实名认证与信用标识。被骗请第一时间报警并联系平台安全中心，我们会配合留存聊天证据。'
        ],
        cta: { t: '查看完整防骗指南', a: 'sys-open', id: 'sm2' }
      },
      {
        id: 'sm2', cat: 'safety', level: 'important', read: false,
        from: '野遇安全中心', title: '防骗指南：这 5 种「约伴」话术要警惕',
        summary: '陌生人的热情有时带着目的，识别高频话术比事后维权更有效。',
        ts: ag(26 * HOUR),
        body: [
          '我们把近半年的举报做了归类，以下 5 句话出现频率最高：',
          '1）「先付 50 定金我帮你留位，来了再退」——钱一转，人就消失；',
          '2）「加我微信发你营地定位」——把你导流到平台外，脱离风控保护；',
          '3）「我是老领队，带过几百人」——要求看真实轨迹与历史活动记录；',
          '4）「投资装备能返利 / 代购装备更便宜」——陌生人社交里没有投资理财；',
          '5）「发个验证码帮我验证一下」——平台客服永远不会向你索要验证码。',
          '看到以上任一话术，请点右上角 ⋯ 举报。我们会在 24 小时内处理并反馈结果，涉及违法的将同步移交公安机关。'
        ]
      },
      {
        id: 'sm3', cat: 'safety', level: 'important', read: false,
        from: '野遇安全中心', title: '安全提醒：不要在约伴前透露住址与行程',
        summary: '首次线下见面请选公共场所，行程只分享给可信好友，别公开实时定位。',
        ts: ag(6 * HOUR),
        body: [
          '和陌生人第一次见面，请把这四件事做好：',
          '· 地点选在地铁口、营地服务中心等公共场所，不要约在偏僻野线入口；',
          '· 出发前把活动信息、同行人主页链接发给一位好友，开启行程共享；',
          '· 动态发布建议延迟到活动结束后，避免暴露「家里没人」；',
          '· 感到不安时，可以随时在聊天页点 ⋯ → 一键求助，我们会通知你的紧急联系人。'
        ]
      },
      {
        id: 'sm4', cat: 'notice', level: 'normal', read: false,
        from: '野遇官方', title: '社区公约更新：线下约伴，安全第一',
        summary: '新增「活动发起实名认证」「人数上限报备」两项要求，2026-11-01 起生效。',
        ts: ag(2 * DAY),
        body: [
          '为了让约伴更安心，我们对社区公约做了两处更新：',
          '① 发布超过 10 人的线下活动，发起人需完成实名认证；',
          '② 涉及野线、水域、夜间等中高风险活动，需在动态中标注风险等级与装备要求。',
          '未标注的活动将不会被推荐到广场。完整公约可在「我的 → 设置 → 用户协议」查看。'
        ]
      },
    ];
  }

  /* v0.19：用户会员信息，与 migrate() 共用 VIP_SEED 映射（见文件顶部） */
  var users = [
      { id:'u1', name:'林小野', py:'L', avatar:'🌲', color:'#2f9e6f', gender:'女', age:26, city:'杭州', dist:'2.3km', online:true,  sign:'周末不露营，周一人崩溃', tags:['露营','徒步','摄影'], vip: vipFromSeed('u1') },
      { id:'u2', name:'阿宽',   py:'A', avatar:'🚴', color:'#e07b39', gender:'男', age:31, city:'成都', dist:'6.1km', online:true,  sign:'318 已在路上，缺个搭子', tags:['骑行','长途','装备党'], vip: vipFromSeed('u2') },
      { id:'u3', name:'Yuki',   py:'Y', avatar:'⛺️', color:'#7a5cff', gender:'女', age:24, city:'上海', dist:'1.8km', online:false, sign:'把城市留在身后', tags:['露营','摄影','咖啡'], vip: vipFromSeed('u3') },
      { id:'u4', name:'老周',   py:'L', avatar:'🧗', color:'#2f7fd1', gender:'男', age:35, city:'深圳', dist:'0.9km', online:true,  sign:'每周一山，风雨无阻', tags:['攀岩','徒步'] },
      { id:'u5', name:'桃子',   py:'T', avatar:'🏕️', color:'#d94f8a', gender:'女', age:27, city:'北京', dist:'3.4km', online:false, sign:'到营地的第一件事是煮咖啡', tags:['露营','咖啡'], vip: vipFromSeed('u5') },
      { id:'u6', name:'大鹏',   py:'D', avatar:'🎣', color:'#1f9c9c', gender:'男', age:29, city:'广州', dist:'4.7km', online:true,  sign:'路亚空军司令部', tags:['路亚','徒步'] },
      { id:'u7', name:'小雨',   py:'X', avatar:'🌄', color:'#c2553f', gender:'女', age:23, city:'南京', dist:'5.5km', online:false, sign:'用手帐记录每一座山', tags:['徒步','手帐'] },
      { id:'u8', name:'KK',     py:'K', avatar:'🛶', color:'#3f8f4f', gender:'男', age:33, city:'重庆', dist:'2.0km', online:true,  sign:'桨板 / 骑行 双修', tags:['桨板','骑行'], vip: vipFromSeed('u8') },
      { id:'u9', name:'阿黎',   py:'A', avatar:'🔥', color:'#c9822a', gender:'女', age:28, city:'长沙', dist:'7.2km', online:true,  sign:'篝火晚会不会缺席', tags:['露营','飞盘'] },
      { id:'u10',name:'老猫',   py:'L', avatar:'🏔️', color:'#4a5b8c', gender:'男', age:38, city:'西安', dist:'8.9km', online:false, sign:'重装穿越，慢即是快', tags:['重装','徒步'] },
      /* v0.51：好友列表原本只有 5 人（可滚动距离 116px），右侧字母索引几乎看不出效果。
         补 10 位好友把首字母铺开到 A/B/C/G/H/J/L/M/N/Q/S/T/W/X/Y，
         列表长度足以滚动，才能真实演示「按住滑动定位」。仅新增用户，未改动既有字段。 */
      { id:'u11',name:'白鹿',   py:'B', avatar:'🦌', color:'#8a6bd1', gender:'女', age:25, city:'苏州', dist:'3.1km', online:true,  sign:'在林子里走得越慢，看见的越多', tags:['徒步','观鸟'] },
      { id:'u12',name:'陈川',   py:'C', avatar:'🏞️', color:'#2f7fd1', gender:'男', age:32, city:'宁波', dist:'5.4km', online:false, sign:'周末溯溪，缺个会看线的', tags:['溯溪','徒步'] },
      { id:'u13',name:'高远',   py:'G', avatar:'🪁', color:'#1f9c9c', gender:'男', age:27, city:'合肥', dist:'6.8km', online:true,  sign:'风大的日子都在山上', tags:['徒步','风筝'] },
      { id:'u14',name:'何舟',   py:'H', avatar:'🧊', color:'#3f8f4f', gender:'男', age:34, city:'无锡', dist:'4.2km', online:false, sign:'冬天也要下水的人', tags:['桨板','冬泳'] },
      { id:'u15',name:'江野',   py:'J', avatar:'🌊', color:'#2f9e6f', gender:'女', age:26, city:'厦门', dist:'7.5km', online:true,  sign:'海岸线是我的通勤路线', tags:['桨板','摄影'] },
      { id:'u16',name:'苗苗',   py:'M', avatar:'🍀', color:'#d94f8a', gender:'女', age:22, city:'昆明', dist:'9.1km', online:true,  sign:'装备越轻，走越远', tags:['徒步','轻量化'] },
      { id:'u17',name:'宁远',   py:'N', avatar:'🌌', color:'#4a5b8c', gender:'男', age:30, city:'贵阳', dist:'8.3km', online:false, sign:'星空营地常年在线', tags:['露营','天文'] },
      { id:'u18',name:'祁峰',   py:'Q', avatar:'🪨', color:'#c2553f', gender:'男', age:36, city:'兰州', dist:'9.7km', online:true,  sign:'每年进一次高原', tags:['重装','高原'] },
      { id:'u19',name:'苏叶',   py:'S', avatar:'🎒', color:'#c9822a', gender:'女', age:24, city:'福州', dist:'5.9km', online:true,  sign:'城市周边也能野', tags:['露营','骑行'] },
      { id:'u20',name:'温言',   py:'W', avatar:'🪵', color:'#7a5cff', gender:'女', age:28, city:'青岛', dist:'6.6km', online:false, sign:'把柴火劈好，天就黑了', tags:['露营','手作'] },
      /* v0.52：演示「已注销」降级态。注销的号会留在好友列表里（微信同款），
         但主页必须降级为占位卡：不可发消息、不可打招呼、不可关注、不记访客。 */
      { id:'u21',name:'柯基',   py:'K', avatar:'🐕', color:'#98a2b3', gender:'男', age:0, city:'', dist:'', online:false, sign:'', tags:[], status:'deleted' }
    ];

    return {
      /* ---- v0.45 登录态 ----
         默认给一份「预置账号」的登录态：应用需能直接进主界面，不该被登录墙挡住。
         演示未登录冷启动：URL 加 ?auth=0，或设置页「退出登录」。 */
      auth: seedAuth(true),
      me: {
        id:'me', name:'我', py:'W', avatar:'🧭', color:'#07c160',
        yeyuId:'野遇号：88231', yeyuNum:'88231', gender:'男', age:29, city:'杭州',
        sign:'刚入坑露营，求带', tags:['露营','徒步','新手'],
        following:['u4','u8','u10'], followers:['u1','u3','u9','u7'],
        vip: null,                   // { plan, name, days, start, expire } —— null 表示非会员
        coins: 1000                  // 平台币（野遇币）余额，1 元 = 10 币；新用户赠送 1000 体验
      },
      /* ---- 靓号商城 ---- */
      niceIds: [
        { id:'n1',  num:'88888', kind:'five',  label:'五连豹子号', price:1980, tag:'至尊' },
        { id:'n2',  num:'66666', kind:'five',  label:'五连豹子号', price:1680, tag:'稀有' },
        { id:'n3',  num:'77777', kind:'five',  label:'五连豹子号', price:1880, tag:'稀有' },
        { id:'n4',  num:'12345', kind:'seq',   label:'五连顺序号', price:980,  tag:'稀有' },
        { id:'n5',  num:'1010',  kind:'seq',   label:'ABAB 对称号', price:288,  tag:'好记' },
        { id:'n6',  num:'16888', kind:'lucky', label:'一路发发发', price:1280, tag:'吉利' },
        { id:'n7',  num:'8818',  kind:'lucky', label:'发发要发',   price:468,  tag:'吉利' },
        { id:'n8',  num:'66688', kind:'lucky', label:'六六八八',   price:888,  tag:'吉利' },
        { id:'n9',  num:'52013', kind:'love',  label:'我爱你一生', price:520,  tag:'表白' },
        { id:'n10', num:'13145', kind:'love',  label:'一生一世我', price:520,  tag:'表白' },
        { id:'n11', num:'3399',  kind:'love',  label:'长长久久',   price:366,  tag:'表白' },
        { id:'n12', num:'202609',kind:'birth', label:'生日号·2026',price:388,  tag:'纪念' },
        { id:'n13', num:'00001', kind:'short', label:'超级短号',   price:2980, tag:'至尊' },
        { id:'n14', num:'888',   kind:'short', label:'三连短号',   price:1580, tag:'稀有' },
        { id:'n15', num:'10001', kind:'short', label:'五位数短号', price:680,  tag:'好记' },
        { id:'n16', num:'1122',  kind:'seq',   label:'AABB 对子号',price:328,  tag:'好记' }
      ],
      /* ---- VIP 套餐 ---- */
      /* v0.33：两级会员体系。tier 决定等级（vip / svip），old plan id 保持兼容：
         m1、q1 → VIP；y1 → SVIP（老用户数据无需清洗即可升格）；sm1 为新增 SVIP 月卡 */
      vipPlans: [
        { id:'vm0', name:'VIP 月卡',   tier:'vip',  price:30,  orig:30,  days:30,  tag:'' },
        { id:'m1',  name:'连续包月',   tier:'vip',  price:18,  orig:25,  days:30,  tag:'首月立减 ¥7',     auto:true },
        { id:'q1',  name:'VIP 季卡',   tier:'vip',  price:48,  orig:75,  days:90,  tag:'省 ¥27' },
        { id:'sm0', name:'SVIP 月卡',  tier:'svip', price:68,  orig:68,  days:30,  tag:'' },
        { id:'sm1', name:'连续包月',   tier:'svip', price:38,  orig:58,  days:30,  tag:'全特权 · 首月立减 ¥20', auto:true },
        { id:'sq1', name:'SVIP 季卡',  tier:'svip', price:108, orig:168, days:90,  tag:'省 ¥60' },
        { id:'y1',  name:'SVIP 年卡',  tier:'svip', price:198, orig:300, days:365, tag:'最划算 · 省 ¥102', rec:true }
      ],
      orders: [],      // 支付订单（靓号 + VIP + 平台币充值 共用）
      coinLogs: [],    // 平台币流水：{ ts, type:'recharge'|'spend', amount, desc }
      drafts: {},      // 会话草稿：convId -> 文本
      users: users,
      /* v0.51：好友数 5 → 15，首字母铺开以支撑右侧 A–Z 索引（详见 users 注释）
         v0.52：u21 为「已注销」演示账号，用于验证主页降级态 */
      friends: ['u1','u2','u3','u5','u7','u11','u12','u13','u14','u15','u16','u17','u18','u19','u20','u21'],
      /* v0.52 备注名：uid -> 备注。展示优先级 备注 > 昵称（由 U() 统一兜底） */
      remarks: {},
      requests: [
        { userId:'u4',  time: ago(20*MIN),  msg:'看你也在杭州，周末一起爬午潮山？' },
        { userId:'u8',  time: ago(3*HOUR),  msg:'同好，加个好友聊聊桨板' },
        { userId:'u9',  time: ago(1*DAY),   msg:'你那条篝火动态我看到了，好会拍！' }
      ],
      conversations: [
        { id:'c0', type:'system', title:'野遇小助手', members:['me'], unread:0, updatedAt: ago(2*DAY),
          messages:[
            { id:'m01', from:'sys', text:'欢迎加入野遇 · 户外兴趣社区', ts: ago(2*DAY) },
            { id:'m02', from:'sys', text:'完成兴趣标签可获得 3 天会员体验', ts: ago(2*DAY) }
          ] },
        { id:'c1', type:'single', userId:'u1', title:'林小野', members:['me','u1'], unread:2, updatedAt: ago(3*MIN),
          messages:[
            { id:'m11', from:'u1', text:'周六径山露营还差一个人，来吗？', ts: ago(28*MIN) },
            { id:'m12', from:'me', text:'几点集合？我装备还不齐', ts: ago(20*MIN) },
            { id:'m13', from:'u1', text:'早上 7 点地铁口，帐篷我多带一顶', ts: ago(5*MIN) },
            { id:'m14', from:'u1', text:'记得带防潮垫，山上潮', ts: ago(3*MIN) }
          ] },
        /* 群聊 1：我未加入（保留「加入群聊」验证入口）；u1 群主，u5 管理员 */
        { id:'c2', type:'group', title:'周末露营搭子群', owner:'u1', admins:['u1','u5'],
          members:['u1','u2','u3','u5'], unread:5, updatedAt: ago(11*MIN),
          announce:'周六径山营地，早 7:00 地铁口集合，别迟到', muted:false, top:false,
          messages:[
            { id:'m22', from:'u2', text:'这周末天气看着不错啊', ts: ago(40*MIN) },
            { id:'m23', from:'u3', text:'我这边可以开车带两个人', ts: ago(35*MIN) },
            { id:'m24', from:'u5', text:'咖啡豆我包了，手冲装备也带', ts: ago(25*MIN) },
            { id:'m25', from:'u1', text:'地点定了，径山营地，周六早 7 点', ts: ago(11*MIN) }
          ] },
        { id:'c3', type:'single', userId:'u2', title:'阿宽', members:['me','u2'], unread:0, updatedAt: ago(2*HOUR),
          messages:[
            { id:'m31', from:'me', text:'318 什么时候出发？', ts: ago(3*HOUR) },
            { id:'m32', from:'u2', text:'下个月初，现在在拉人', ts: ago(2*HOUR) }
          ] },
        /* 群聊 2：我未加入；u8 群主 */
        { id:'c4', type:'group', title:'城市骑行·周末约骑', owner:'u8', admins:['u8'],
          members:['u2','u8'], unread:0, updatedAt: ago(1*DAY),
          announce:'周六滨江绿道 30km，均速 22，新手友好', muted:false, top:false,
          messages:[
            { id:'m41', from:'u8', text:'周六滨江绿道 30km，节奏休闲', ts: ago(1*DAY) },
            { id:'m43', from:'u2', text:'均速 22，新手友好，欢迎加入', ts: ago(1*DAY) }
          ] },
        /* 群聊 3：我是普通成员（u4 群主）—— 用于体验「成员视角」权限 */
        { id:'c6', type:'group', title:'杭州周末徒步小队', owner:'u4', admins:['u4','u7'],
          members:['me','u4','u7','u10'], unread:0, updatedAt: ago(50*MIN),
          announce:'每周一山，周三晚 8 点在群里接龙报名', muted:false, top:false,
          messages:[
            { id:'m61', from:'sys', text:'你加入了群聊', ts: ago(4*DAY) },
            { id:'m62', from:'u4', text:'本周六午潮山，强度中等，6 公里', ts: ago(2*HOUR) },
            { id:'m63', from:'u7', text:'报名 +1，我带手帐本盖章 📒', ts: ago(90*MIN) },
            { id:'m64', from:'u10', text:'新人也能走，我殿后', ts: ago(50*MIN) }
          ] },
        /* 群聊 4：我是群主 —— 用于体验「群主视角」权限（设管理员/踢人/解散） */
        { id:'c7', type:'group', title:'我的露营小队', owner:'me', admins:['me','u1'],
          members:['me','u1','u3','u9'], unread:1, updatedAt: ago(18*MIN),
          announce:'自己人的小群，随时约营地', muted:false, top:true,
          messages:[
            { id:'m71', from:'sys', text:'你创建了该群聊', ts: ago(6*DAY) },
            { id:'m72', from:'u1', text:'群主，下次去哪儿？', ts: ago(2*HOUR) },
            { id:'m73', from:'u9', text:'篝火装备我这边齐全 🔥', ts: ago(40*MIN) },
            { id:'m74', from:'u3', text:'崇明那个营地我订到位了', ts: ago(18*MIN) }
          ] },
        { id:'c5', type:'single', userId:'u3', title:'Yuki', members:['me','u3'], unread:1, updatedAt: ago(5*HOUR),
          messages:[
            { id:'m51', from:'u3', text:'你上次发的营地照片，用的什么相机？', ts: ago(5*HOUR) }
          ] }
      ],
      moments: [
        { id:'k1', userId:'u1', text:'径山营地实拍，周六的天气应该稳了。还有两个位置，想来的私我 ⛺️', imgs:[{g:'g1',e:'⛺️'},{g:'g5',e:'🌲'}], loc:'杭州·径山', scope:'public', likes:['u2','u3','u5'], ts: ago(45*MIN),
          comments:[ { userId:'u2', text:'报名报名', ts: ago(30*MIN) }, { userId:'u5', text:'我带咖啡 ☕️', ts: ago(12*MIN) } ] },
        { id:'k2', userId:'u2', text:'成都到康定，第一天 180km。屁股已经不是自己的了。', imgs:[{g:'g3',e:'🚴'}], loc:'G318·康定', scope:'public', likes:['u1','u8'], ts: ago(4*HOUR),
          comments:[ { userId:'u8', text:'硬核', ts: ago(3*HOUR) } ] },
        { id:'k3', userId:'u3', text:'第一次自己搭天幕，虽然歪但很满意。新手友好教程我整理在评论区了。', imgs:[{g:'g2',e:'🏕️'},{g:'g6',e:'🌅'},{g:'g4',e:'🔥'}], loc:'上海·崇明', scope:'friends', likes:['u1','u5','u7'], ts: ago(9*HOUR),
          comments:[ { userId:'u7', text:'手帐党狂喜，求教程！', ts: ago(8*HOUR) }, { userId:'u1', text:'搭得比我第一次好多了', ts: ago(7*HOUR) } ] },
        { id:'k4', userId:'u5', text:'海拔 1200 米的一杯手冲，值回票价。', imgs:[{g:'g6',e:'☕️'}], loc:'北京·雾灵山', scope:'public', likes:['u1','u3'], ts: ago(1*DAY), comments:[] },
        { id:'k5', userId:'u7', text:'本周徒步手帐更新完毕，四个山头盖章打卡 ✅', imgs:[{g:'g7',e:'📒'}], loc:'南京·紫金山', scope:'circle', likes:['u1'], ts: ago(2*DAY), comments:[] },
        /* v0.58 二分 feed 种子：u4 / u8 / u10 是「我关注但不是好友」的人。
           前三条 issuer 公开可见 → 应出现在「好友」Tab；最后一条 u8 设为 friends 可见 → 我不该看到。
           这条对照是「可见域与关注解耦」硬规则的验收样本：关注不等于好友，
           作者选了「仅好友可见」的内容，不能因为我关注了 TA 就放行。 */
        { id:'k6', userId:'u8', text:'桨板第 5 次下水，终于能站在板上调头了。要点是脚踝放松、别看水面。', imgs:[{g:'g11',e:'🛶'}], loc:'重庆·嘉陵江', scope:'public', likes:['u4'], ts: ago(70*MIN), comments:[] },
        { id:'k7', userId:'u10', text:'鳌太重装装备清单 v2：这次把炉头换成了酒精炉，轻了 180g。', imgs:[{g:'g12',e:'🏔️'}], loc:'陕西·鳌山', scope:'public', likes:['u7'], ts: ago(3*HOUR), comments:[] },
        { id:'k8', userId:'u4', text:'塘朗山这条新线踩完了，岩点密、适合练指力，周末有一起的吗。', imgs:[{g:'g8',e:'🧗'}], loc:'深圳·塘朗山', scope:'public', likes:['u9'], ts: ago(5*HOUR), comments:[] },
        { id:'k9', userId:'u8', text:'（仅好友可见）水下这段翻船三次，狼狈样就不给你们看了。', imgs:[{g:'g11',e:'🛶'}], loc:'重庆·嘉陵江', scope:'friends', likes:[], ts: ago(40*MIN), comments:[] }
      ],
      plaza: [
        { id:'p1', userId:'u4',  text:'周日上午塘朗山拉练，强度中等，缺 2 人。装备我备齐了。', imgs:[{g:'g8',e:'🧗'}], loc:'深圳·塘朗山', tags:['攀岩','找搭子'], likes:32, comments:[{userId:'u9',text:'几点集合？我住南山',ts:ago(6*MIN)}], ts: ago(8*MIN) },
        { id:'p2', userId:'u9',  text:'露营的第一百个夜晚。篝火、吉他、和一群刚认识的人。', imgs:[{g:'g4',e:'🔥'},{g:'g9',e:'🎸'}], loc:'长沙·月亮岛', tags:['露营','篝火'], likes:88, comments:[{userId:'u3',text:'氛围感拉满',ts:ago(20*MIN)},{userId:'u8',text:'下次带我一个',ts:ago(12*MIN)}], ts: ago(35*MIN) },
        { id:'p3', userId:'u6',  text:'今天又空军了，但风景不错，算了下次再说。', imgs:[{g:'g10',e:'🎣'}], loc:'广州·流溪河', tags:['路亚'], likes:15, comments:[], ts: ago(1*HOUR) },
        { id:'p4', userId:'u8',  text:'桨板初体验教程：1 小时从站不起来到能划两公里。', imgs:[{g:'g11',e:'🛶'}], loc:'重庆·嘉陵江', tags:['桨板','教程'], likes:64, comments:[{userId:'u4',text:'教程很实用，已收藏',ts:ago(50*MIN)}], ts: ago(2*HOUR), video:true },
        { id:'p5', userId:'u10', text:'重装鳌太，第五天。装备清单我整理好了，评论区自取。', imgs:[{g:'g12',e:'🏔️'}], loc:'陕西·鳌山', tags:['重装','徒步'], likes:120, comments:[{userId:'u7',text:'求清单！',ts:ago(1*HOUR)},{userId:'u2',text:'国庆有人组队吗',ts:ago(40*MIN)}], ts: ago(5*HOUR), video:true },
        { id:'p6', userId:'u3',  text:'崇明岛这个营地，人少、风小、有热水。强推。', imgs:[{g:'g2',e:'🏕️'}], loc:'上海·崇明', tags:['露营','营地推荐'], likes:41, comments:[], ts: ago(7*HOUR) },
        { id:'p7', userId:'u7',  text:'有没有南京的徒步搭子？周末想走紫金山后山野道。', imgs:[], loc:'南京·紫金山', tags:['徒步','找搭子'], likes:9, comments:[{userId:'u6',text:'栖霞的？',ts:ago(9*HOUR)}], ts: ago(11*HOUR) },
        { id:'p8', userId:'u2',  text:'318 骑行第 3 天，海拔 4200。高反有点顶但值得。', imgs:[{g:'g3',e:'🚴'}], loc:'G318·折多山', tags:['骑行','长途'], likes:203, comments:[{userId:'u10',text:'注意安全，别硬顶',ts:ago(1*DAY)},{userId:'u9',text:'折多山那段确实虐',ts:ago(20*HOUR)}], ts: ago(1*DAY) },
        { id:'p9', userId:'u3',  text:'一个人爬山久了，也想有个能一起看日出的人。有同感的举个手🙋', imgs:[], loc:'', tags:['找搭子','社交'], likes:77, comments:[{userId:'u9',text:'蹲一个，我也想',ts:ago(40*MIN)}], ts: ago(3*HOUR) }
      ],
      /* ---- 地域圈子（v0.15 新增：省/市两级，约伴/变现见 M2） ---- */
      circles: [
        { id:'c-gd-sz', name:'深圳户外圈', province:'广东', city:'深圳', type:'region', icon:'🏙️', color:'#2f9e6f', members:1280, desc:'每周一山，周末约伴，新手友好', cat:'徒步', noun:'驴友', hot:true },
        { id:'c-gd-gz', name:'广州周边游', province:'广东', city:'广州', type:'region', icon:'🌆', color:'#1f9c9c', members:642,  desc:'路亚、徒步、短途露营', cat:'露营', noun:'玩友' },
        { id:'c-zj-hz', name:'杭州周末徒步', province:'浙江', city:'杭州', type:'region', icon:'🌲', color:'#3f8f4f', members:953,  desc:'径山、午潮山，约伴走起', cat:'徒步', noun:'驴友' },
        { id:'c-bj-bj', name:'北京登山队', province:'北京', city:'北京', type:'region', icon:'⛰️', color:'#c2553f', members:2104, desc:'雾灵山、海坨，强度可选', joinMode:'approval', cat:'徒步', noun:'驴友', hot:true },
        { id:'c-sh-sh', name:'上海露营党', province:'上海', city:'上海', type:'region', icon:'⛺️', color:'#7a5cff', members:1587, desc:'崇明、滴水湖，精致露营', cat:'露营', noun:'营友', hot:true },
        { id:'c-sc-cd', name:'成都骑行团', province:'四川', city:'成都', type:'region', icon:'🚴', color:'#e07b39', members:1320, desc:'318 拉练、城市绿道', cat:'骑行', noun:'骑友', hot:true },
        { id:'c-sn-xa', name:'西安重装穿越', province:'陕西', city:'西安', type:'region', icon:'🏔️', color:'#4a5b8c', members:720,  desc:'鳌太、太白，硬核老炮', joinMode:'approval', cat:'徒步', noun:'驴友' },
        { id:'c-js-nj', name:'南京徒步手帐', province:'江苏', city:'南京', type:'region', icon:'📒', color:'#d94f8a', members:488,  desc:'紫金山野道，边走边记', cat:'徒步', noun:'驴友' },
        { id:'c-cq-cq', name:'重庆桨板', province:'重庆', city:'重庆', type:'region', icon:'🛶', color:'#3f8f4f', members:560,  desc:'嘉陵江、长江，亲水运动', cat:'桨板', noun:'板友' },
        { id:'c-hn-cs', name:'长沙篝火营', province:'湖南', city:'长沙', type:'region', icon:'🔥', color:'#c9822a', members:812,  desc:'月亮岛、周末篝火', cat:'露营', noun:'营友' },
        /* v0.16 私密圈：广场/全部圈子不可见，仅圈主邀请或熟人邀请码入圈 */
        { id:'c-gd-sz-hc', name:'深圳硬核老炮', province:'广东', city:'深圳', type:'region', icon:'🧗', color:'#4a5c8c', members:86, desc:'只走野线，强度 B+ 起，圈主审核', cat:'攀岩', noun:'岩友', visibility:'private', code:'HC8K2P', owner:'u4', codeLimit:20, codeUsed:0, codeExpireAt: Date.now() + 7 * DAY },
        { id:'c-gd-sz-ns', name:'南山野道小分队', province:'广东', city:'深圳', type:'region', icon:'🌒', color:'#5c4a8c', members:24, desc:'熟人局，夜爬塘朗，不对外公开', cat:'徒步', noun:'驴友', visibility:'private', code:'NS5Q0T', owner:'u4', codeLimit:20, codeUsed:0, codeExpireAt: Date.now() + 7 * DAY },
        /* 我创建的圈子（v0.17：用于演示圈主视角的成员管理 / 入圈审核） */
        { id:'c-gd-sz-mine', name:'塘朗山周爬小队', province:'广东', city:'深圳', type:'region', icon:'🥾', color:'#2f9e6f', members:42, desc:'每周日早八北坡集合，熟人优先，需审核', visibility:'public', joinMode:'approval', owner:'me', cat:'徒步', noun:'驴友', isNew:true }
      ],
      /* ---- 圈子成员（v0.17：role = owner / admin / member；首次加载由 app 端补全代表成员） ---- */
      circleMembers: [],
      /* ---- 入圈申请（v0.17：status = pending / approved / rejected） ---- */
      circleApplies: [
        { id:'ca1', circleId:'c-gd-sz-mine', userId:'u7', ts: ago(3*HOUR), status:'pending', msg:'在深圳出差一个月，走过紫金山野道，想跟队爬一次' },
        { id:'ca2', circleId:'c-gd-sz-mine', userId:'u2', ts: ago(5*HOUR), status:'pending', msg:'骑行党转徒步，装备齐全，求收留' },
        { id:'ca3', circleId:'c-bj-bj', userId:'me', ts: ago(20*HOUR), status:'pending', msg:'走过太白南坡，重装装备齐全，申请加入' }
      ],
      /* 入圈邀请（v0.16）：圈主/成员邀请熟人，被邀请者可接受或拒绝 */
      circleInvites: [
        { id:'ci1', circleId:'c-gd-sz-ns', fromUserId:'u4', toUserId:'me', ts: ago(2*HOUR), status:'pending', msg:'周六夜爬塘朗，一起来？' }
      ],
      /* ---- 圈子动态（feed，复用广场/动态视觉） ---- */
      circlePosts: [
        { id:'cp1', circleId:'c-gd-sz', userId:'u4', text:'周日上午塘朗山拉练，强度中等，缺 2 人。装备我备齐了，新手也欢迎。', imgs:[{g:'g8',e:'🧗'}], loc:'深圳·塘朗山', tags:['徒步','找搭子'], likes:12, ts: ago(8*MIN) },
        { id:'cp2', circleId:'c-gd-sz', userId:'u4', text:'本周打卡完成！连续 12 周每周一山，风雨无阻 💪', imgs:[], loc:'深圳·梧桐山', tags:['打卡'], likes:34, ts: ago(2*HOUR) },
        { id:'cp3', circleId:'c-zj-hz', userId:'u1', text:'周六径山营地实拍，天气稳了，还有两个位置私我 ⛺️', imgs:[{g:'g1',e:'⛺️'},{g:'g5',e:'🌲'}], loc:'杭州·径山', tags:['露营','找搭子'], likes:21, ts: ago(45*MIN) },
        { id:'cp4', circleId:'c-sh-sh', userId:'u3', text:'第一次自己搭天幕，虽然歪但很满意。新手教程我整理在评论区。', imgs:[{g:'g2',e:'🏕️'},{g:'g6',e:'🌅'}], loc:'上海·崇明', tags:['露营','教程'], likes:56, ts: ago(9*HOUR) },
        { id:'cp5', circleId:'c-sc-cd', userId:'u2', text:'成都到康定第一天 180km，屁股已经不是自己的了 🚴', imgs:[{g:'g3',e:'🚴'}], loc:'G318·折多山', tags:['骑行','长途'], likes:88, ts: ago(4*HOUR) },
        { id:'cp6', circleId:'c-hn-cs', userId:'u9', text:'露营的第一百个夜晚。篝火、吉他、和一群刚认识的人。', imgs:[{g:'g4',e:'🔥'},{g:'g9',e:'🎸'}], loc:'长沙·月亮岛', tags:['露营','篝火'], likes:102, ts: ago(35*MIN) },
        { id:'cp7', circleId:'c-sn-xa', userId:'u10', text:'重装鳌太第五天，装备清单评论区自取，新手别硬上。', imgs:[{g:'g12',e:'🏔️'}], loc:'陕西·鳌山', tags:['重装','徒步'], likes:140, ts: ago(5*HOUR) },
        { id:'cp8', circleId:'c-gd-sz-hc', userId:'u4', text:'本周野线：塘朗山北坡→梅林后山，全程 18km，只收 6 人，熟手来。', imgs:[], loc:'深圳·塘朗山', tags:['野线','硬核'], likes:9, ts: ago(30*MIN) }
      ],
      myCircles: ['c-gd-sz','c-gd-sz-hc','c-gd-sz-mine'],   // 含私密圈 + 我创建的圈子，便于演示成员管理与审核
      circleFavs: [],            // v0.38：圈子收藏（侧栏「收藏」分类数据源）
      /* v0.77：设置对齐 Flutter —— 新增分类型通知开关（通知中心按此过滤）、私信开关、青少年模式 */
      settings: { notify:true, stealth:false, nearby:true, recommend:true, theme:'light', sysmsg:true,
                  notifyComment:true, notifyLike:true, notifyFollow:true, notifyMention:true, privateMsg:true, youthMode:false },
      blocked: [],        // 黑名单 userId 列表（拉黑后：广场/动态/好友列表过滤 + 禁止收发消息）
      reports: [          // 举报记录：{ id, target, type:'user'|'group', reason, ts, status:'pending'|'done'|'reject', result }
        { id:'r-seed', target:'u6', type:'user', reason:'骚扰辱骂', ts: ago(2*DAY), status:'done', result:'已对对方进行禁言 3 天处理，感谢你的反馈' }
      ],
      visitors: [         // 谁看过我：{ userId, ts }（非 VIP 打码）
        { userId:'u4',  ts: ago(28*MIN) },
        { userId:'u9',  ts: ago(2*HOUR) },
        { userId:'u6',  ts: ago(6*HOUR) },
        { userId:'u2',  ts: ago(22*HOUR) },
        { userId:'u10', ts: ago(2*DAY)  }
      ],
      greetLog: {},       // 打招呼日限额：{ 'YYYY-MM-DD': count }
      /* v0.77 通知中心（对齐 Flutter AppNotify）：聚合「别人对我的互动」。
         type: comment/reply/like/follow/mention/friendRequest/visitor/system；
         refType/refId 决定点击跳转目标。 */
      notifications: [
        { id:'n1', type:'comment',    actorId:'u1', text:'评论了你：周六径山还差一个人，来吗？', refType:'post', refId:'k1', ts: ago(8*MIN),  read:false },
        { id:'n2', type:'like',       actorId:'u3', text:'赞了你的动态', refType:'post', refId:'k2', ts: ago(26*MIN), read:false },
        { id:'n3', type:'follow',     actorId:'u2', text:'关注了你', refType:'user', refId:'u2', ts: ago(1*HOUR), read:false },
        { id:'n4', type:'mention',    actorId:'u7', text:'在评论中 @ 了你：求教程！', refType:'post', refId:'k3', ts: ago(2*HOUR), read:true },
        { id:'n5', type:'friendRequest', actorId:'u4', text:'请求添加你为好友', refType:'friend', refId:'', ts: ago(3*HOUR), read:false },
        { id:'n6', type:'reply',      actorId:'u5', text:'回复了你：我带咖啡 ☕️', refType:'post', refId:'k1', ts: ago(5*HOUR), read:true },
        { id:'n7', type:'visitor',    actorId:'u9', text:'访问了你的主页', refType:'user', refId:'u9', ts: ago(6*HOUR), read:true },
        { id:'n8', type:'system',     actorId:'sys', text:'社区公约更新：线下约伴，安全第一', refType:'sys', refId:'sm4', ts: ago(2*DAY), read:false }
      ],
      /* v0.77 群绑圈（对齐 Flutter CircleGroupBind）：圈子反向绑定已有群聊，作为内容分发渠道 */
      circleGroupBinds: [
        { id:'gb1', circleId:'c-gd-sz-mine', groupId:'c7', groupTitle:'我的露营小队', boundAt: ago(2*DAY) }
      ],
      /* v0.36 平台系统消息：安全提醒 / 公告 / 活动 / 交易 / 版本（用户侧只读） */
      sysMsgs: seedSysMsgs(),
      onboarded: false,   // 是否完成首次兴趣标签引导（冷启动）
      version: VERSION
    };
  }

  var DB = {
    KEY: KEY,
    state: null,
    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) {
          var s = migrate(JSON.parse(raw));
          if (s) { this.state = s; return this.state; }
        }
      } catch (e) { console.warn('读取本地数据失败，使用种子数据', e); }
      this.state = seed();
      this.save();
      return this.state;
    },
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); }
      catch (e) { console.warn('保存失败', e); }
    },
    reset: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      this.state = seed();
      this.save();
    }
  };

  window.DB = DB;
})();
