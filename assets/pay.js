/* ============================================================
   野遇 · 模拟收银台（微信支付 / 支付宝）
   靓号商城与会员中心共用同一套支付链路：
     确认订单 → 选支付方式 → 唤起支付 → 成功 / 失败 → 生成订单
   全部为本地模拟，不产生任何真实交易
   ============================================================ */
(function () {
  var WAYS = [
    { k: 'wechat', name: '微信支付', mark: '微', color: '#07c160', sub: '零手续费，推荐使用' },
    { k: 'alipay', name: '支付宝',   mark: '支', color: '#1677ff', sub: '支持花呗分期' },
    { k: 'coin',   name: '野遇币',   mark: '币', color: '#ff8f1f', sub: '平台币余额支付' }
  ];

  var cur = null;          // 当前订单配置
  var step = 'form';       // form | processing | success | fail
  var way = 'wechat';
  var failMode = false;    // 支付失败态（由真实支付结果决定，不再由界面开关触发）
  var timer = null;
  var A = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yuan(n) { return '¥' + (Math.round(n * 100) / 100).toFixed(2); }
  function orderNo() {
    var d = new Date(), p = function (x) { return x < 10 ? '0' + x : '' + x; };
    return 'Y' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
      Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  function openOv(id) { $('#' + id).classList.add('show'); }
  function closeOv(id) { $('#' + id).classList.remove('show'); }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var w = WAYS.filter(function (x) { return x.k === way; })[0];
    var html = '';

    if (step === 'processing') {
      html = '<div class="pay-center">' +
        '<div class="pay-spinner"><i style="border-color:' + w.color + ';border-top-color:transparent"></i></div>' +
        '<div class="pay-big">正在唤起' + w.name + '…</div>' +
        '<div class="pay-sub">请在' + (w.k === 'wechat' ? '微信' : '支付宝') + '中完成支付</div>' +
        '</div>';
      $('#payBody').innerHTML = html;
      $('#payFoot').innerHTML = '<button class="btn ghost block" data-pay="cancel">取消支付</button>';
      return;
    }

    if (step === 'success') {
      var amountHtml = (way === 'coin')
        ? '<div class="pay-amount" style="color:#ff8f1f">' + (cur.coinPrice || 0) + ' 野遇币</div>'
        : '<div class="pay-amount">' + yuan(cur.amount) + '</div>';
      html = '<div class="pay-center">' +
        '<div class="pay-ok" style="background:' + w.color + '">✓</div>' +
        '<div class="pay-big" style="color:#07c160">支付成功</div>' +
        amountHtml +
        '<div class="pay-rows">' +
          row('商品', cur.subject) +
          row('支付方式', w.name) +
          (way === 'coin' ? row('消耗野遇币', (cur.coinPrice || 0) + ' 币') : '') +
          row('订单号', cur.order.no) +
          row('支付时间', fmtTime(cur.order.ts)) +
        '</div>' +
        (cur.note ? '<div class="pay-note">' + esc(cur.note) + '</div>' : '') +
        '</div>';
      $('#payBody').innerHTML = html;
      $('#payFoot').innerHTML =
        '<button class="btn block" data-pay="done">完成</button>' +
        '<button class="btn ghost block" data-pay="orders" style="margin-top:8px">查看我的订单</button>';
      return;
    }

    if (step === 'fail') {
      html = '<div class="pay-center">' +
        '<div class="pay-ok" style="background:var(--danger)">✕</div>' +
        '<div class="pay-big" style="color:#e34d4d">支付失败</div>' +
        '<div class="pay-sub">' + esc(cur.errMsg || '支付被取消或余额不足') + '</div>' +
        '<div class="pay-rows">' + row('商品', cur.subject) + row('金额', yuan(cur.amount)) + '</div>' +
        '</div>';
      $('#payBody').innerHTML = html;
      $('#payFoot').innerHTML =
        '<button class="btn block" data-pay="retry">重新支付</button>' +
        '<button class="btn ghost block" data-pay="switch" style="margin-top:8px">更换支付方式</button>';
      return;
    }

    if (step === 'pwd') {
      html = '<div class="pay-center">' +
        '<div class="pay-sub">请输入支付密码以完成付款</div>' +
        '<div class="pay-amount">' + yuan(cur.amount) + '</div>' +
        '<input class="pay-pwd-input" id="payPwd" type="password" maxlength="6" inputmode="numeric" placeholder="••••••" autocomplete="off"/>' +
        '<div class="pay-pwd-err" id="payPwdErr"></div>' +
        '<button class="btn block" data-pay="pwd-ok">确认支付</button>' +
        '<button class="btn ghost block" data-pay="pwd-fp" style="margin-top:8px">🫆 指纹 / 面容支付</button>' +
        '<button class="btn ghost block" data-pay="back" style="margin-top:8px">返回</button>' +
      '</div>';
      $('#payBody').innerHTML = html;
      $('#payFoot').innerHTML = '';
      setTimeout(function () { var el = $('#payPwd'); if (el) el.focus(); }, 50);
      return;
    }

    /* ---- step: form 收银台 ---- */
    var ways = WAYS.filter(function (x) {
      return !cur.allowedWays || cur.allowedWays.indexOf(x.k) >= 0;
    });
    function coinBalance() { return (window.DB && window.DB.state) ? window.DB.state.me.coins : 0; }
    var waysHtml = ways.map(function (x) {
      var sub = x.sub;
      if (x.k === 'coin') sub = '余额 ' + coinBalance() + ' 野遇币 · 1元=10币';
      return '<div class="pay-way' + (way === x.k ? ' on' : '') + '" data-pay="way" data-v="' + x.k + '">' +
        '<span class="pay-mark" style="background:' + x.color + '">' + x.mark + '</span>' +
        '<div class="pay-way-t"><b>' + x.name + '</b><small>' + sub + '</small></div>' +
        '<span class="pay-radio' + (way === x.k ? ' on' : '') + '"></span></div>';
    }).join('');
    var showFail = !cur.allowedWays || cur.allowedWays.indexOf('coin') >= 0;

    html =
      '<div class="pay-hero">' +
        '<div class="pay-sub">' + esc(cur.title) + '</div>' +
        '<div class="pay-amount">' + yuan(cur.amount) + '</div>' +
      '</div>' +
      '<div class="pay-rows">' +
        row('商品', cur.subject) +
        (cur.desc ? row('说明', cur.desc) : '') +
        (cur.rows || []).map(function (r) { return row(r[0], r[1]); }).join('') +
        (way === 'coin' && cur.coinPrice ? row('消耗野遇币', cur.coinPrice + ' 币') : '') +
      '</div>' +
      '<div class="sec-title">支付方式</div>' +
      '<div class="pay-ways">' + waysHtml + '</div>' +
      '<p class="pay-tip">支付由微信 / 支付宝 / 野遇币余额完成，不跳转任何外部 App。</p>';

    $('#payBody').innerHTML = html;

    var footHtml;
    if (way === 'coin') {
      var bal = coinBalance(), need = cur.coinPrice || 0;
      if (bal >= need) {
        footHtml = '<button class="btn block accent" data-pay="submit">用 ' + need + ' 野遇币支付</button>' +
          '<p class="pay-tip">当前余额 ' + bal + ' 野遇币，支付后剩余 ' + (bal - need) + '</p>';
      } else {
        footHtml = '<button class="btn block" disabled style="opacity:.5;cursor:not-allowed">野遇币余额不足</button>' +
          '<button class="btn ghost block" data-pay="go-recharge" style="margin-top:8px">去充值野遇币</button>' +
          '<p class="pay-tip">还差 ' + (need - bal) + ' 野遇币，去钱包充值即可</p>';
      }
    } else {
      footHtml = '<button class="btn block" data-pay="submit">确认支付 ' + yuan(cur.amount) + '</button>';
    }
    $('#payFoot').innerHTML = footHtml;
  }
  function row(k, v) {
    return '<div class="pay-row"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';
  }
  function fmtTime(ts) {
    var d = new Date(ts), p = function (x) { return x < 10 ? '0' + x : '' + x; };
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------------- 流程 ---------------- */
  function doPwdOk() {
    var inp = $('#payPwd'); var v = inp ? inp.value.trim() : '';
    var err = $('#payPwdErr');
    if (v.length < 6) { if (err) err.textContent = '请输入 6 位支付密码'; return; }
    if (v !== '123456') { if (err) err.textContent = '支付密码错误，请重试'; if (inp) inp.value = ''; return; }
    doPay();
  }
  function doPay() {
    step = 'processing'; render();
    if (A) A.track('pay_submit', { goods: cur.goods, amount: cur.amount, way: way });
    clearTimeout(timer);
    timer = setTimeout(function () {
      /* ---- 平台币支付分支：扣减余额、记流水、生成 way=coin 订单 ---- */
      if (way === 'coin') {
        var stC = window.DB.state;
        if (stC.me.coins < (cur.coinPrice || 0)) {
          step = 'fail';
          cur.errMsg = '野遇币余额不足，请先充值';
          if (A) A.track('pay_fail', { goods: cur.goods, way: 'coin' });
          render();
          return;
        }
        stC.me.coins -= cur.coinPrice;
        stC.coinLogs.unshift({ ts: Date.now(), type: 'spend', amount: cur.coinPrice, desc: cur.coinDesc || cur.subject });
        var orderC = {
          id: 'o' + Date.now(), no: orderNo(), goods: cur.goods,
          title: cur.subject, amount: cur.amount, way: 'coin', coinAmount: cur.coinPrice,
          ts: Date.now(), status: 'paid'
        };
        stC.orders.unshift(orderC);
        cur.order = orderC;
        step = 'success';
        if (A) A.track('pay_success', { goods: cur.goods, amount: cur.amount, way: 'coin', coins: cur.coinPrice });
        if (cur.onSuccess) { try { cur.onSuccess(orderC); } catch (e) { console.warn('支付回调异常', e); } }
        window.DB.save();
        render();
        return;
      }
      if (failMode) {
        step = 'fail';
        cur.errMsg = way === 'wechat' ? '微信支付已取消' : '支付宝账户余额不足';
        if (A) A.track('pay_fail', { goods: cur.goods, way: way });
        render();
        return;
      }
      var order = {
        id: 'o' + Date.now(), no: orderNo(), goods: cur.goods,
        title: cur.subject, amount: cur.amount, way: way, ts: Date.now(), status: 'paid'
      };
      var st = window.DB.state;
      st.orders.unshift(order);
      cur.order = order;
      step = 'success';
      if (A) A.track('pay_success', { goods: cur.goods, amount: cur.amount, way: way });
      if (cur.onSuccess) { try { cur.onSuccess(order); } catch (e) { console.warn('支付回调异常', e); } }
      window.DB.save();
      render();
    }, 1400);
  }

  /* ---------------- 对外 API ---------------- */
  var Pay = {
    WAYS: WAYS,
    /* opts: { title, subject, desc, amount, rows:[], goods, note, onSuccess,
              allowedWays:[k], coinPrice, coinDesc } */
    open: function (opts) {
      A = window.Analytics;
      cur = opts || {};
      cur.amount = Number(cur.amount) || 0;
      cur.allowedWays = opts.allowedWays || null;     // 限制可选支付方式（如充值仅微信/支付宝）
      cur.coinPrice = Number(opts.coinPrice) || 0;    // 平台币价（币数）
      cur.coinDesc = opts.coinDesc || '';            // 平台币消费说明
      step = 'form';
      if (cur.preferWay) way = cur.preferWay;
      else if (cur.allowedWays && cur.allowedWays.indexOf(way) < 0) way = cur.allowedWays[0];
      $('#payTitle').textContent = cur.title || '收银台';
      openOv('ov-pay');
      render();
    },
    /* 事件由 app.js 统一委派转发 */
    handle: function (act, d) {
      if (!cur) return;
      switch (act) {
        case 'way': way = d.v; render(); break;
        case 'submit': step = 'pwd'; render(); break;
        case 'pwd-ok': doPwdOk(); break;
        case 'pwd-fp': doPay(); break;
        case 'back': step = 'form'; render(); break;
        case 'cancel':
          clearTimeout(timer); closeOv('ov-pay');
          if (A) A.track('pay_cancel', { goods: cur.goods, step: 'processing' });
          break;
        case 'go-recharge':
          clearTimeout(timer); closeOv('ov-pay');
          if (window.__openWallet) window.__openWallet();
          break;
        case 'retry': step = 'form'; render(); break;
        case 'switch': step = 'form'; way = (way === 'wechat' ? 'alipay' : 'wechat'); render(); break;
        case 'done':
          closeOv('ov-pay');
          if (cur.onDone) { var f = cur.onDone; cur.onDone = null; f(cur.order); }
          break;
        case 'orders':
          closeOv('ov-pay');
          if (window.__openOrders) window.__openOrders();
          break;
        default: break;
      }
    },
    close: function () { closeOv('ov-pay'); clearTimeout(timer); },
    isOpen: function () { return !!$('#ov-pay') && $('#ov-pay').classList.contains('show'); }
  };

  window.Pay = Pay;
})();
