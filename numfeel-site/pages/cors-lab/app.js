// ========== 跨域请求限制实验室：交互层 ==========

var API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8080/cors-lab'
  : 'https://numfeel-api.996.ninja/cors-lab';

var MODE_LABEL = {
  'deny': 'deny（默认拒绝）',
  'allow': 'allow（*）',
  'allow-credentials': 'allow-credentials'
};

var currentMode = 'deny';

// ========== 初始化 ==========
function init() {
  bindModeButtons();
  document.getElementById('refreshMeBtn').addEventListener('click', function () { doFetchMe({ target: 'meResult', classEl: 'classLine' }); });
  document.getElementById('fetchMeBtn').addEventListener('click', function () { doFetchMe({ target: 'meResult', classEl: 'classLine' }); });
  document.getElementById('fetchPreflightBtn').addEventListener('click', doPreflight);
  document.getElementById('transferBtn').addEventListener('click', doTransfer);
  document.getElementById('refreshTransfersBtn').addEventListener('click', refreshTransfers);
  document.getElementById('resetBtn').addEventListener('click', resetAccount);
  document.getElementById('credToggle').addEventListener('change', updateClassLine);
  document.getElementById('copyConclusionBtn').addEventListener('click', copyConclusion);

  syncPolicy();
}

function bindModeButtons() {
  var cards = document.querySelectorAll('.mode-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].addEventListener('click', function () {
      setMode(this.getAttribute('data-mode'));
    });
  }
}

// ========== 策略 ==========
function syncPolicy() {
  fetch(API + '/policy').then(function (r) { return r.json(); }).then(function (res) {
    if (res.status === 200 && res.data) {
      applyMode(res.data.mode);
    }
  }).catch(function () {
    showHeaders();
  });
}

function setMode(mode) {
  fetch(API + '/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: mode })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res.status === 200 && res.data && res.data.success) {
      applyMode(res.data.mode);
    } else {
      flashNote('meNote', '切换失败：' + (res.data && res.data.message ? res.data.message : '未知'), 'error');
    }
  }).catch(function (err) {
    flashNote('meNote', '网络错误：' + err.message, 'error');
  });
}

function applyMode(mode) {
  currentMode = mode;
  var cards = document.querySelectorAll('.mode-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.toggle('active', cards[i].getAttribute('data-mode') === mode);
  }
  document.getElementById('curMode').textContent = MODE_LABEL[mode] || mode;
  showHeaders();
  updateClassLine();
}

function showHeaders() {
  var h = serverHeaders(currentMode, location.origin);
  var txt;
  if (Object.keys(h).length === 0) {
    txt = '（无 CORS 头）';
  } else {
    txt = Object.keys(h).map(function (k) { return k + ': ' + h[k]; }).join('\n');
  }
  document.getElementById('curHeaders').textContent = txt;
}

function updateClassLine() {
  var withCreds = document.getElementById('credToggle').checked;
  var cls = classifyRequest({ method: 'GET', headers: {} });
  var pred = browserBlocksReading(currentMode, withCreds);
  var line = '分类：' + (cls.needsPreflight ? '需要预检' : '简单请求，不预检') + ' ｜ 预测：' + (pred.blocked ? '读取被拦' : '可读取') + ' —— ' + pred.reason;
  document.getElementById('classLine').textContent = line;
}

// ========== 读取余额 / 核心 fetch ==========
function doFetchMe(opts) {
  var withCreds = document.getElementById('credToggle').checked;
  var fetchOpts = { method: 'GET' };
  if (withCreds) fetchOpts.credentials = 'include';

  var cls = classifyRequest({ method: 'GET', headers: {} });
  var pred = browserBlocksReading(currentMode, withCreds);
  renderClass('classLine', cls, pred, withCreds);
  renderPending(opts.target, '请求已发出，等响应…');

  fetch(API + '/me', fetchOpts).then(function (r) {
    return r.json().then(function (body) {
      return { ok: true, status: r.status, body: body, respType: r.type };
    });
  }).then(function (res) {
    onMeSuccess(opts.target, res);
  }).catch(function (err) {
    onMeBlocked(opts.target, err, pred);
  });
}

function onMeSuccess(target, res) {
  var data = res.body && res.body.data;
  var bal = data ? data.balance : null;
  if (bal != null) {
    document.getElementById('balanceValue').textContent = formatMoney(bal);
  }
  renderResult(target, 'ok', 'HTTP ' + res.status + ' · 响应已交给 JS',
    '浏览器放行了读取。余额：' + (bal != null ? formatMoney(bal) : '—') + '。' +
    '响应 type = ' + res.respType + '。去 Network 看这条 /cors-lab/me 的响应头，能找到 Access-Control-Allow-Origin。');
}

function onMeBlocked(target, err, pred) {
  renderResult(target, 'error', 'fetch 抛错：' + (err.message || 'Failed to fetch'),
    pred.reason + ' —— 可去 Network 看，那条 /cors-lab/me 的状态码大概率是 200，响应体也明明白白在。浏览器拦的是「把响应交给 JS」，拦不了「请求发出」。');
  flashNote('meNote', '读不到响应——这正是 CORS 在做的事。把策略切成 allow 再点一次对比。', 'warn');
}

// ========== 预检实验 ==========
function doPreflight() {
  var fetchOpts = { method: 'GET', headers: { 'X-Demo': '1' } };
  var cls = classifyRequest({ method: 'GET', headers: { 'X-Demo': '1' } });
  var pred = browserBlocksReading(currentMode, false);
  renderClass('preflightClass', cls, pred, false);
  renderPending('preflightResult', '已发出。先看 Network 有没有一条 OPTIONS /cors-lab/me…');

  fetch(API + '/me', fetchOpts).then(function (r) {
    return r.json().then(function (body) { return { ok: true, status: r.status, body: body }; });
  }).then(function (res) {
    var data = res.body && res.body.data;
    var bal = data ? data.balance : null;
    if (bal != null) document.getElementById('balanceValue').textContent = formatMoney(bal);
    renderResult('preflightResult', 'ok', 'HTTP ' + res.status + ' · 预检通过，读取成功',
      'OPTIONS 预检放行，真正的请求随后发出并读到响应。余额：' + (bal != null ? formatMoney(bal) : '—') + '。');
  }).catch(function (err) {
    renderResult('preflightResult', 'error', 'fetch 抛错：' + (err.message || 'Failed to fetch'),
      '预检被拒（deny 下 OPTIONS 返回 403），浏览器根本没发真正的请求。去 Network 看，只有一条 OPTIONS，状态 403，没有后续 GET。');
  });
}

// ========== 转账 / CSRF ==========
function doTransfer() {
  renderPending('transferResult', '正在发起转账（form-urlencoded，简单请求）…');
  fetch(API + '/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'amount=10000'
  }).then(function (r) {
    return r.json().then(function (body) { return { ok: true, status: r.status, body: body }; });
  }).then(function (res) {
    var d = res.body && res.body.data;
    if (d && d.executed) {
      renderResult('transferResult', 'ok', 'HTTP ' + res.status + ' · 转账完成，余额 ' + formatMoney(d.balanceAfter),
        'fetch 成功读到响应。余额扣到 ' + formatMoney(d.balanceAfter) + '。注意：如果刚才策略是 deny，这一步会走下面的「抛错」分支，但服务器其实已经扣款了——去查流水验证。');
      document.getElementById('balanceValue').textContent = formatMoney(d.balanceAfter);
    } else {
      renderResult('transferResult', 'warn', 'HTTP ' + res.status + ' · 转账未执行', (d && d.message) || '未知原因');
    }
  }).catch(function (err) {
    renderResult('transferResult', 'error', 'fetch 抛错：' + (err.message || 'Failed to fetch'),
      'JS 这边看到的是失败。可这是 form-urlencoded 简单请求，浏览器照发不误，服务器照扣不误。把策略切成 allow 再查流水，你会看到这笔「失败」的转账赫然在列。');
  });
  setTimeout(refreshTransfers, 600);
}

function refreshTransfers() {
  fetch(API + '/transfers').then(function (r) { return r.json(); }).then(function (res) {
    if (res.status !== 200 || !res.data) return;
    renderTransferLog(res.data.transfers || []);
  }).catch(function () {});
}

function renderTransferLog(list) {
  var box = document.getElementById('transferLog');
  if (!list.length) {
    box.innerHTML = '<div class="log-empty">暂无转账流水</div>';
    return;
  }
  var html = '<div class="log-head"><span>转账号</span><span>金额</span><span>扣后余额</span><span>时间</span></div>';
  for (var i = list.length - 1; i >= 0; i--) {
    var t = list[i];
    html += '<div class="log-row">' +
      '<span>' + escapeHtml(t.transferId) + '</span>' +
      '<span class="amt">' + formatMoney(t.amount) + '</span>' +
      '<span>' + formatMoney(t.balanceAfter) + '</span>' +
      '<span class="t">' + formatTime(t.at) + '</span>' +
      '</div>';
  }
  box.innerHTML = html;
}

// ========== 重置 ==========
function resetAccount() {
  fetch(API + '/reset', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (res) {
    if (res.status === 200 && res.data) {
      applyMode(res.data.mode);
      document.getElementById('balanceValue').textContent = formatMoney(res.data.balance);
      flashNote('meNote', '账户已重置：余额回到 ' + formatMoney(res.data.balance) + '，策略回到 deny，流水清空。', 'ok');
      refreshTransfers();
    }
  }).catch(function (err) {
    flashNote('meNote', '重置失败：' + err.message, 'error');
  });
}

// ========== 渲染辅助 ==========
function renderClass(elId, cls, pred, withCreds) {
  var line = '分类：' + (cls.needsPreflight ? '需要预检（' + cls.reasons.join('；') + '）' : '简单请求，不预检') +
    ' ｜ 当前策略：' + MODE_LABEL[currentMode] +
    (withCreds ? ' ｜ 带凭据' : '') +
    ' ｜ 预测：' + (pred.blocked ? '读取被拦' : '可读取');
  document.getElementById(elId).textContent = line;
}

function renderPending(target, msg) {
  var el = document.getElementById(target);
  el.className = 'result-panel pending';
  el.innerHTML = '<div class="rp-status"><i class="ti ti-loader"></i> ' + escapeHtml(msg) + '</div>';
}

function renderResult(target, type, status, body) {
  var el = document.getElementById(target);
  el.className = 'result-panel ' + type;
  el.innerHTML = '<div class="rp-status">' + escapeHtml(status) + '</div><div class="rp-body">' + escapeHtml(body) + '</div>';
}

function flashNote(elId, msg, type) {
  var el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'account-note ' + (type || '');
}

function formatMoney(cents) {
  return '¥' + (cents / 100).toFixed(2);
}

function formatTime(ts) {
  var d = new Date(ts);
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyConclusion() {
  var text = document.getElementById('conclusionText').textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById('copyConclusionBtn');
      var old = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
      setTimeout(function () { btn.innerHTML = old; }, 1500);
    });
  }
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
