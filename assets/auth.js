/* ============================================================
   野遇 · 认证服务层（v0.45）
   ------------------------------------------------------------
   「假后端」：所有真实网络请求在这里收敛为同一套 Promise 接口，
   接入真后端时只需把 each 方法体换成 fetch(AUTH_CONFIG.api...)，UI 层零改动。
   真实实现要点已写在每个方法的注释里（尤其：验证码绝不可由客户端校验）。
   ============================================================ */
(function () {
  var C = window.AUTH_CONFIG || {};
  var now = function () { return Date.now(); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var rid = function () { return Math.random().toString(36).slice(2, 10); };

  /* 模拟服务端存储（真实环境全在服务端，客户端不该持有） */
  var store = {
    codes: {},        // phone -> { code, expireAt, cooldownUntil, tries, sentAt, today }
    users: {},        // phone -> { uid, nick, avatar, createdAt }   已注册号码
    oauth: {},        // 'provider:openId' -> { uid, phone }         第三方绑定关系
    nicks: {}         // 小写昵称 -> true                            已占用昵称（模拟服务端唯一索引）
  };

  function cfg() { return C; }
  function isPhone(p) { return /^1[3-9]\d{9}$/.test(String(p || '').trim()); }
  function maskPhone(p) { p = String(p || ''); return p.length === 11 ? p.slice(0, 3) + '****' + p.slice(7) : p; }
  function mockOf(kind) {
    /* 演示开关优先级：右侧面板下拉 > URL 参数 > config 默认值 */
    var q = new URLSearchParams(location.search);
    return q.get(kind === 'oneclick' ? 'oneclick' : 'oauth') || null;
  }
  function issue(uid, method, phone) {
    var acc = cfg().token.accessTtlSec, ref = cfg().token.refreshTtlSec;
    if (cfg().token.demoAccelerate) { acc = 20; ref = 60; }   // 演示：20s 过期，便于观察刷新链路
    return {
      uid: uid, method: method, phone: phone,
      token: 'atk.' + uid + '.' + now() + '.' + rid(),
      refreshToken: 'rtk.' + uid + '.' + now() + '.' + rid(),
      expireAt: now() + acc * 1000,
      refreshExpireAt: now() + ref * 1000
    };
  }

  var Auth = {
    /* ---------- 工具 ---------- */
    isPhone: isPhone,
    maskPhone: maskPhone,
    cfg: cfg,
    store: store,

    /* ---------- 一键登录（运营商号码认证）----------
       真实链路：SDK 预取号（需蜂窝网络）→ 拿 accessToken → 服务端用 token 换手机号。
       失败必须降级到短信，不能让用户卡住。 */
    oneClick: function () {
      var m = mockOf('oneclick') || (cfg().oneclick && cfg().oneclick.debugMock) || 'success';
      var carriers = { cmcc: '中国移动', cucc: '中国联通', ctcc: '中国电信' };
      return wait(700).then(function () {
        if (m === 'success') {
          return { ok: true, phone: '18888886688', carrier: carriers.cmcc, carrierKey: 'cmcc', token: 'oc.' + rid() };
        }
        var err = {
          'no-sim':      { code: 'NO_SIM',      msg: '未检测到 SIM 卡，请使用短信验证码登录' },
          'no-network':  { code: 'NO_CELLULAR', msg: '请开启移动数据（Wi-Fi 下无法取号）' },
          'timeout':     { code: 'TIMEOUT',     msg: '取号超时，已切换为短信验证码登录' },
          'user-switch': { code: 'USER_SWITCH', msg: '已切换为短信验证码登录' }
        }[m] || { code: 'UNKNOWN', msg: '取号失败，请使用短信验证码登录' };
        return { ok: false, err: err.code, msg: err.msg };
      });
    },

    /* ---------- 短信验证码 ----------
       真实实现：客户端只发「手机号 + 场景 + 人机校验凭据」，服务端做频率/风控/黑名单后再下发。 */
    sendCode: function (phone, opt) {
      opt = opt || {};
      if (cfg().agreements.requireCheckedBeforeSms && !opt.agreed) {
        return Promise.resolve({ ok: false, err: 'AGREE_REQUIRED', msg: '请先阅读并同意用户协议与隐私政策' });
      }
      if (!isPhone(phone)) return Promise.resolve({ ok: false, err: 'BAD_PHONE', msg: '手机号格式不正确' });
      var s = cfg().sms, rec = store.codes[phone];
      if (rec && rec.cooldownUntil > now()) {
        var left = Math.ceil((rec.cooldownUntil - now()) / 1000);
        return Promise.resolve({ ok: false, err: 'COOLDOWN', msg: '发送过于频繁，请 ' + left + ' 秒后再试', cooldown: left });
      }
      return wait(600).then(function () {
        var code = String(Math.floor(100000 + Math.random() * 900000));
        store.codes[phone] = {
          code: code, tries: 0, sentAt: now(),
          expireAt: now() + 5 * 60 * 1000,
          cooldownUntil: now() + s.resendSec * 1000
        };
        /* ⚠️ 验证码回显受 exposeCodeInDemo 控制；生产环境必须为 false */
        return { ok: true, cooldown: s.resendSec, code: s.exposeCodeInDemo ? code : null };
      });
    },

    /* ---------- 校验验证码（登录 / 注册同一入口）---------- */
    verify: function (phone, code) {
      var rec = store.codes[phone];
      if (!rec) return Promise.resolve({ ok: false, err: 'NO_CODE', msg: '请先获取验证码' });
      if (now() > rec.expireAt) return Promise.resolve({ ok: false, err: 'EXPIRED', msg: '验证码已过期，请重新获取' });
      if (rec.tries >= (cfg().sms.maxTry || 5)) return Promise.resolve({ ok: false, err: 'LOCKED', msg: '错误次数过多，请重新获取验证码' });
      if (String(code).length !== (cfg().sms.codeLen || 6)) return Promise.resolve({ ok: false, err: 'BAD_LEN', msg: '请输入 6 位验证码' });
      return wait(500).then(function () {
        if (String(code) !== rec.code) {
          rec.tries++;
          return { ok: false, err: 'WRONG_CODE', msg: '验证码错误，还可尝试 ' + Math.max(0, (cfg().sms.maxTry || 5) - rec.tries) + ' 次' };
        }
        delete store.codes[phone];
        var exist = store.users[phone];
        var uid = exist ? exist.uid : ('u_' + rid());
        store.users[phone] = exist || { uid: uid, phone: phone, createdAt: now() };
        return { ok: true, isNew: !exist, uid: uid, ticket: 'tk.' + rid() };
      });
    },

    /* ---------- 第三方授权 ----------
       真实链路：调起 SDK → 拿到 code/openId → 回传服务端换 session。
       返回 reason 用于区分异常：cancel / not-installed / fail / already-bound。 */
    oauth: function (provider) {
      var m = mockOf('oauth') || ((cfg().oauth[provider] || {}).debugMock) || 'success';
      var meta = { wechat: { n: '微信', a: '💬' }, qq: { n: 'QQ', a: '🐧' }, douyin: { n: '抖音', a: '🎵' }, apple: { n: 'Apple', a: '' } }[provider] || { n: provider, a: '🔗' };
      return wait(800).then(function () {
        if (m === 'cancel')        return { ok: false, reason: 'cancel',        msg: '你取消了授权，可换用手机号登录' };
        if (m === 'not-installed') return { ok: false, reason: 'not-installed', msg: '未检测到' + meta.n + '客户端，请安装后重试或用手机号登录' };
        if (m === 'fail')          return { ok: false, reason: 'fail',          msg: meta.n + '授权失败（网络异常），请重试' };
        var openId = provider + '_' + rid();
        if (m === 'already-bound') {
          /* 该第三方已绑到另一个账号 —— 走"合并/切换"而不是静默再建一个号 */
          return { ok: true, needMerge: true, provider: provider, openId: 'bound_' + rid(),
                   nick: '户外老张', avatar: '🧗', boundTo: { uid: 'u_other', phone: '13900001111', nick: '户外老张' } };
        }
        var key = provider + ':' + openId, b = store.oauth[key];
        /* 首次授权：不带手机号，必须引导绑定（合规：账号需可追溯 + 便于找回） */
        return { ok: true, needBind: !b, provider: provider, openId: openId,
                 nick: b ? (store.users[b.phone] || {}).nick || (meta.n + '用户') : (meta.n + '用户'),
                 avatar: meta.a || '🙂', boundTo: b ? { uid: b.uid, phone: b.phone } : null };
      });
    },

    /* ---------- 第三方绑定手机号 ---------- */
    oauthBind: function (openId, phone, code, mode) {
      return Auth.verify(phone, code).then(function (r) {
        if (!r.ok) return r;
        var exist = store.users[phone];
        if (mode === 'merge' && exist) {
          /* 合并策略：以「手机号为主键」，第三方身份挂到该手机号下；用户资料取并集、去重由服务端完成 */
        }
        store.oauth[openId.split('_')[0] + ':' + openId] = { uid: r.uid, phone: phone };
        return { ok: true, uid: r.uid, isNew: r.isNew };
      });
    },

    /* ---------- 昵称查重（v0.48）----------
       客户端只做即时提示，服务端必须重复校验这套规则，不能信任前端。
       返回 available=false 时带上具体原因，前端据此给出可读的错误文案。 */
    checkNick: function (nick) {
      var p = cfg().profile || {};
      var n = String(nick || '').trim();
      var min = p.nickMinLen || 2, max = p.nickMaxLen || 12;
      if (!n) return Promise.resolve({ ok: false, available: false, err: 'EMPTY', msg: '请填写昵称' });
      if (n.length < min) return Promise.resolve({ ok: false, available: false, err: 'TOO_SHORT', msg: '昵称至少 ' + min + ' 个字符' });
      if (n.length > max) return Promise.resolve({ ok: false, available: false, err: 'TOO_LONG', msg: '昵称不超过 ' + max + ' 个字符' });
      if (!new RegExp('^' + (p.nickPattern || '[\\u4e00-\\u9fa5A-Za-z0-9_-]+') + '$').test(n)) {
        return Promise.resolve({ ok: false, available: false, err: 'BAD_CHAR', msg: '仅支持中英文、数字、下划线和连字符' });
      }
      var low = n.toLowerCase();
      var reserved = (p.reservedNicks || []).map(function (x) { return String(x).toLowerCase(); });
      if (reserved.indexOf(low) >= 0) {
        return Promise.resolve({ ok: false, available: false, err: 'RESERVED', msg: '该昵称为官方保留，请换一个' });
      }
      /* 敏感词属服务端职责；这里演示"命中后给明确文案"这一段 */
      return wait(450).then(function () {
        if (store.nicks[low]) return { ok: true, available: false, err: 'TAKEN', msg: '该昵称已被占用，换一个试试' };
        return { ok: true, available: true, msg: '该昵称可以使用' };
      });
    },

    /* ---------- 保存资料（v0.48）----------
       真实实现：头像先直传对象存储拿 URL，再把 { nick, avatarUrl } 提交给服务端；
       不要把 base64 存进业务库。这里直接存 dataURL，便于即时预览。 */
    saveProfile: function (payload) {
      payload = payload || {};
      var m = window.__PROFILE_MOCK__ || (cfg().profile && cfg().profile.debugSaveMock) || 'success';
      return wait(800).then(function () {
        if (m === 'fail') return { ok: false, err: 'NETWORK', msg: '保存失败（网络异常）' };
        var nick = String(payload.nick || '').trim();
        if (nick) store.nicks[nick.toLowerCase()] = true;
        return { ok: true, uid: payload.uid || 'me', nick: nick, avatar: payload.avatar || null, updatedAt: now() };
      });
    },

    /* ---------- 令牌 ---------- */
    issue: issue,
    refresh: function (auth) {
      if (!auth || !auth.refreshToken) return Promise.resolve({ ok: false, reason: 'NO_REFRESH', msg: '登录已失效，请重新登录' });
      return wait(400).then(function () {
        if (now() > (auth.refreshExpireAt || 0)) {
          return { ok: false, reason: 'REFRESH_EXPIRED', msg: '登录已过期，请重新登录' };
        }
        var t = issue(auth.uid, auth.method, auth.phone);
        return { ok: true, token: t.token, refreshToken: t.refreshToken, expireAt: t.expireAt, refreshExpireAt: t.refreshExpireAt };
      });
    },
    /* 进入应用前调用：未过期→放行；临期→静默刷新；refresh 也过期→强制登出 */
    ensure: function (auth) {
      if (!auth || !auth.logged) return Promise.resolve({ ok: false, reason: 'NOT_LOGIN' });
      if (auth.expireAt && now() < auth.expireAt - (cfg().token.refreshAheadSec || 0) * 1000) {
        return Promise.resolve({ ok: true, fresh: false });
      }
      return Auth.refresh(auth).then(function (r) { return r; });
    },
    logout: function () {
      /* 真实实现：调用 /auth/logout 让服务端吊销 refresh_token，并清理本地凭据 */
      return wait(200).then(function () { return { ok: true }; });
    }
  };

  window.Auth = Auth;
})();
