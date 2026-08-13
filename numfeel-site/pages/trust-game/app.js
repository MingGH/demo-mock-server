/**
 * 信任博弈 - 主交互逻辑
 * 依赖：engine.js（纯逻辑）、Chart.js、components/header.js
 */

var API_BASE = 'https://numfeel-api.996.ninja';
var invest = 5;           // Stage 1 投资额
var investReturned = 0;   // Stage 1 AI 伙伴返还额
var returnAmount = 0;     // Stage 2 用户作为被委托人的返还额
var investConfirmed = false;
var returnConfirmed = false;
var distChart = null;
var compareChart = null;

// ========== 行为埋点（NFTrack） ==========
//   session_start (trackOnce)
//   invest_done   确认投资（低频）
//   return_done   确认返还（低频）
//   game_finish   两阶段完成
//   session_end   (force) pagehide
if (typeof window !== 'undefined') {
  window.NF_TRACK_UMAMI_MIRROR = ['game_finish', 'session_end'];
}
function nfTrack(name, props, opts) {
  try {
    if (window.NFTrack && typeof window.NFTrack.track === 'function') {
      window.NFTrack.track(name, props, opts);
    }
  } catch (e) {}
}
function nfTrackOnce(name, props) {
  try {
    if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
      window.NFTrack.trackOnce(name, props);
    }
  } catch (e) {}
}
function registerTrackLeaveHandler() {
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });
}
nfTrackOnce('session_start', {});
registerTrackLeaveHandler();

// ── 初始化 ──
function init() {
  onInvestChange();
}

// ── 投资滑块 ──
function onInvestChange() {
  invest = parseInt(document.getElementById('investSlider').value, 10);
  document.getElementById('investValue').textContent = '¥' + invest;
  document.getElementById('investHint').textContent = '对方将收到 ¥' + (invest * MULTIPLIER);
}

function confirmInvest() {
  if (investConfirmed) return;
  investConfirmed = true;
  nfTrack('invest_done', { invest: invest });

  // AI 伙伴返还
  investReturned = aiReturn(invest);
  var investorGain = investorOutcome(invest, investReturned);

  var resultEl = document.getElementById('investResult');
  resultEl.innerHTML =
    '你投资 <strong>¥' + invest + '</strong>，伙伴收到 <strong>¥' + (invest * MULTIPLIER) +
    '</strong>，返还了你 <strong>¥' + investReturned + '</strong>。<br>你最终剩 <strong>¥' +
    investorGain + '</strong>（' + (investorGain >= 10 ? '赚了' : '亏了') + '）。';
  document.getElementById('investResultSection').style.display = 'block';
  document.getElementById('investResultSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // 进入 Stage 2
  var received = invest * MULTIPLIER;
  document.getElementById('receivedAmount').textContent = '¥' + invest;
  document.getElementById('receivedTripled').textContent = '¥' + received;
  document.getElementById('returnSlider').max = received;
  document.getElementById('returnSlider').value = Math.round(received / 2);
  document.getElementById('trusteeSection').style.display = 'block';
  onReturnChange();
  document.getElementById('trusteeSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── 返还滑块 ──
function onReturnChange() {
  var received = invest * MULTIPLIER;
  returnAmount = parseInt(document.getElementById('returnSlider').value, 10);
  document.getElementById('returnValue').textContent = '¥' + returnAmount;
  document.getElementById('returnHint').textContent = '你保留 ¥' + (received - returnAmount);
}

function confirmReturn() {
  if (returnConfirmed) return;
  returnConfirmed = true;
  nfTrack('return_done', { returned: returnAmount });

  var investorGain = investorOutcome(invest, investReturned);
  var trusteeGain = trusteeOutcome(invest, returnAmount);
  var totalEarned = investorGain + trusteeGain;

  document.getElementById('trusteeSection').style.display = 'none';

  // 画像
  var rates = computeRates(invest, returnAmount);
  var profile = classifyProfile(rates.investRate, rates.returnRate);
  document.getElementById('profileLabel').textContent = profile.label;
  document.getElementById('profileDesc').textContent = profile.description;
  document.getElementById('resInvestRate').textContent = Math.round(rates.investRate * 100) + '%';
  document.getElementById('resReturnRate').textContent = Math.round(rates.returnRate * 100) + '%';

  nfTrack('game_finish', { invest: invest, returned: returnAmount });

  document.getElementById('resultSection').style.display = 'block';
  document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 提交成功后再拉统计，确保本次记录计入全站均值（submit 后端会失效 stats 缓存）
  submitResult(totalEarned, fetchStats);
}

// ── 提交 ──
function submitResult(totalEarned, done) {
  var payload = {
    sessionId: getSessionId(),
    investAmount: invest,
    returnAmount: returnAmount,
    totalEarned: totalEarned,
    roleOrder: 0
  };
  fetch(API_BASE + '/trust-game/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (r) {
      if (r.status === 429) {
        showThrottleHint();
        return;
      }
      return r.json();
    })
    .then(function () {
      if (typeof done === 'function') done();
    })
    .catch(function () {
      if (typeof done === 'function') done();
    });
}

function showThrottleHint() {
  var el = document.getElementById('throttleHint');
  if (!el) return;
  el.style.display = 'block';
  setTimeout(function () {
    el.style.display = 'none';
  }, 3000);
}

function fetchStats() {
  fetch(API_BASE + '/trust-game/stats')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.status === 200) {
        renderStats(data.data);
      }
    })
    .catch(function () { /* 静默 */ });
}

function renderStats(stats) {
  renderDistChart(stats);
  renderCompareChart(stats);
  document.getElementById('compareNote').innerHTML =
    stats.totalSessions > 0
      ? '全站共 ' + stats.totalSessions + ' 局：平均投资 ¥' + stats.avgInvest + '，平均返还 ¥' + stats.avgReturn + '。'
      : '暂无全站数据，先成为第一个玩家吧。';
}

function renderDistChart(stats) {
  var ctx = document.getElementById('distChart');
  if (!ctx || !stats.investDistribution || stats.investDistribution.length === 0) return;
  if (distChart) distChart.destroy();
  var labels = [];
  for (var i = 0; i < stats.investDistribution.length; i++) labels.push('¥' + i);
  distChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '人数',
        data: stats.investDistribution,
        backgroundColor: 'rgba(255,215,0,0.6)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888' }, grid: { display: false } },
        y: { ticks: { color: '#888', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.06)' } }
      }
    }
  });
}

function renderCompareChart(stats) {
  var ctx = document.getElementById('compareChart');
  if (!ctx) return;
  if (compareChart) compareChart.destroy();
  var you = invest;
  var siteAvg = stats.totalSessions > 0 ? stats.avgInvest : 0;
  var paper = PAPER_AVG_INVEST;
  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['你', '全站均值', '论文均值'],
      datasets: [{
        label: '投资额',
        data: [you, siteAvg, paper],
        backgroundColor: ['#ffd700', '#90caf9', '#81c784'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 10, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        x: { ticks: { color: '#aaa' }, grid: { display: false } }
      }
    }
  });
}

function getSessionId() {
  try {
    if (!window.sessionStorage) return 'unknown';
    var key = 'trust-game-session';
    var id = window.sessionStorage.getItem(key);
    if (!id) {
      id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      window.sessionStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return 'unknown';
  }
}

// ── 重开 ──
function restartDemo() {
  invest = 5;
  investReturned = 0;
  returnAmount = 0;
  investConfirmed = false;
  returnConfirmed = false;
  document.getElementById('investResultSection').style.display = 'none';
  document.getElementById('trusteeSection').style.display = 'none';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('investSlider').value = 5;
  document.getElementById('returnSlider').value = 0;
  onInvestChange();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  nfTrack('demo_restart', {});
}

// ── 暴露 ──
window.onInvestChange = onInvestChange;
window.confirmInvest = confirmInvest;
window.onReturnChange = onReturnChange;
window.confirmReturn = confirmReturn;
window.restartDemo = restartDemo;

// ── 测试钩子 ──
window.__tg = {
  getInvest: function () { return invest; },
  getReturnAmount: function () { return returnAmount; },
  confirmInvest: confirmInvest,
  confirmReturn: confirmReturn,
  isInvestConfirmed: function () { return investConfirmed; },
  isReturnConfirmed: function () { return returnConfirmed; }
};

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
