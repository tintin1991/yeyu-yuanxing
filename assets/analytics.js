/* ============================================================
   野遇 · 行为埋点 & 用户反馈
   v0.76：去掉「原型」定位与 A/B 分组（原型的验证工具，非业务能力）。
   埋点本身是真实需求 —— app.js 里 130 处 track 调用即埋点清单，
   接 Flutter 时整体替换为 firebase_analytics / 神策 / GrowingIO 等 SDK。
   这里的 localStorage 实现只是单机占位，flutter 阶段不要照搬。
   ============================================================ */
(function () {
  var EVENTS_KEY = 'yeyu_events';
  var FEEDBACK_KEY = 'yeyu_feedback';

  function read(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---- 埋点 ---- */
  function track(name, props) {
    var events = read(EVENTS_KEY, []);
    events.push({ name: name, props: props || {}, ts: Date.now() });
    if (events.length > 2000) events = events.slice(-2000); // 防止无限膨胀
    write(EVENTS_KEY, events);
    if (window.renderSidebar) window.renderSidebar();
  }

  function count(name) {
    return read(EVENTS_KEY, []).filter(function (e) { return e.name === name; }).length;
  }

  function summary() {
    var events = read(EVENTS_KEY, []);
    var map = {};
    events.forEach(function (e) { map[e.name] = (map[e.name] || 0) + 1; });
    return Object.keys(map).map(function (k) { return { name: k, n: map[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  function funnel() {
    /* keys 为该步骤的事件名集合（兼容历史 key，如 v0.9 起广场合并为「发现」页，
       事件名由 tab_plaza 变为 tab_discover，两者需合并统计，否则漏斗第二层恒为 0） */
    var steps = [
      { key: 'app_open',       label: '打开应用',   keys: ['app_open'] },
      { key: 'tab_discover',   label: '浏览发现页', keys: ['tab_discover', 'tab_plaza', 'tab_moments'] },
      { key: 'greet',          label: '发起打招呼', keys: ['greet'] },
      { key: 'chat_open',      label: '进入会话',   keys: ['chat_open'] },
      { key: 'message_send',   label: '发出消息',   keys: ['message_send'] },
      { key: 'moment_publish', label: '发布动态',   keys: ['moment_publish'] }
    ];
    var base = count('app_open') || 1;
    return steps.map(function (s) {
      var n = (s.keys || [s.key]).reduce(function (acc, k) { return acc + count(k); }, 0);
      return { key: s.key, label: s.label, n: n, pct: Math.min(100, Math.round(n / base * 100)) };
    });
  }

  /* ---- 反馈 ---- */
  function addFeedback(text, rating) {
    var list = read(FEEDBACK_KEY, []);
    list.unshift({ text: text, rating: rating, ts: Date.now() });
    write(FEEDBACK_KEY, list);
    track('feedback_submit', { rating: rating });
  }
  function feedbackList() { return read(FEEDBACK_KEY, []); }

  window.Analytics = {
    track: track, count: count, summary: summary, funnel: funnel,
    addFeedback: addFeedback, feedbackList: feedbackList,
    events: function () { return read(EVENTS_KEY, []); }
  };
})();
