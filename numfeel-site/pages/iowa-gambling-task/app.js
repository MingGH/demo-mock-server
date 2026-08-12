/**
 * 爱荷华赌博任务 - 主交互逻辑
 * 依赖：engine.js（纯逻辑）、Chart.js、GSAP、components/header.js
 */

/* 全局状态 */
var game = null;
var learnChart = null;
var compareChart = null;
var moneyChart = null;
var moneySeries = [2000]; // 实时资金曲线：从起始资金开始，每抽一手追加
var picking = false;

/* 后端 */
var API_BASE = 'https://numfeel-api.996.ninja';

/* 论文数据（Bechara & Damasio 1994 典型结果）：
 * 健康受试者约 40-60 手后净分数转正；脑损伤患者持续为负。
 * 图中展示的是实验结束时各组平均净分数（约数，用于教学对比）。 */
var PAPER_DATA = {
  healthy: 42,
  lesioned: -18,
  healthyLabel: '论文·健康受试者',
  lesionedLabel: '论文·前额叶损伤患者'
};

// ========== 行为埋点（NFTrack，见 components/track.js） ==========
// 事件清单：
//   session_start (trackOnce) 页面加载
//   card_pick     每次选牌，回答「玩家抽了哪副牌」
//   game_finish   一局结束，回答「玩家最终净分数」
//   session_end   (force) 真正离页 pagehide，reason=leave
// 埋点不影响功能：NFTrack 不存在时静默跳过。
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

// ── 初始化：直接开玩，无首屏 ──
function init() {
  game = window.createGame ? window.createGame() : createGame();
  initCardback();
  initLearnChart();
  initMoneyChart();
  updateStatus();
  fetchLeaderboard();
}

// ── 卡背选择（持久化到 localStorage） ──
var CARDBACK_KEY = 'igt-cardback-v1';
function initCardback() {
  var table = document.getElementById('deckTable');
  if (!table || typeof table.setAttribute !== 'function' || typeof document.querySelectorAll !== 'function') {
    return; // 测试桩等无完整 DOM 环境静默跳过
  }
  var saved = 1;
  try {
    var v = parseInt(localStorage.getItem(CARDBACK_KEY), 10);
    if (v >= 1 && v <= 9) saved = v;
  } catch (e) { /* 静默 */ }
  applyCardback(saved);
  var opts = document.querySelectorAll('.cardback-opt');
  for (var i = 0; i < opts.length; i++) {
    opts[i].addEventListener('click', (function (opt) {
      return function () {
        var n = parseInt(opt.getAttribute('data-cb'), 10);
        applyCardback(n);
        try { localStorage.setItem(CARDBACK_KEY, String(n)); } catch (e) { /* 静默 */ }
      };
    })(opts[i]));
  }
}
function applyCardback(n) {
  var table = document.getElementById('deckTable');
  if (table) {
    table.setAttribute('data-cardback', String(n));
  }
  var opts = document.querySelectorAll('.cardback-opt');
  for (var i = 0; i < opts.length; i++) {
    var active = parseInt(opts[i].getAttribute('data-cb'), 10) === n;
    if (active) {
      opts[i].classList.add('active');
    } else {
      opts[i].classList.remove('active');
    }
  }
}

function getGame() {
  if (!game) {
    game = window.createGame ? window.createGame() : createGame();
  }
  return game;
}

// ── 选牌 ──
var faceUpDeck = null; // 当前正面展示结果的牌堆

function handlePick(deck) {
  if (picking) return;
  var g = getGame();
  if (g.getState().over) return;

  picking = true;
  var cardEl = document.getElementById('deck' + deck);
  if (!cardEl) {
    picking = false;
    return;
  }
  cardEl.classList.add('picked');

  // 上一个正面牌堆翻回去
  if (faceUpDeck && faceUpDeck !== deck) {
    flipBack(document.getElementById('deck' + faceUpDeck));
  }

  // 同一牌堆连点：牌已正面，直接刷新结果，不再等待翻牌动画
  if (faceUpDeck === deck) {
    try {
      var r = g.drawCard(deck);
      moneySeries.push(r.money);
      showLastPick(r, cardEl);
      updateStatus();
      animateMoney(r);
      if (r.over) {
        setTimeout(finishGame, 600);
      }
    } finally {
      cardEl.classList.remove('picked');
      picking = false;
    }
    return;
  }

  flipToFront(cardEl, function () {
    try {
      faceUpDeck = deck;
      var r = g.drawCard(deck);
      moneySeries.push(r.money);
      showLastPick(r, cardEl);
      updateStatus();
      animateMoney(r);
      if (r.over) {
        setTimeout(finishGame, 600);
      }
    } finally {
      cardEl.classList.remove('picked');
      picking = false;
    }
  });
}

// ── 翻到正面（GSAP，降级为即时回调） ──
function flipToFront(cardEl, done) {
  var inner = cardEl.querySelector('.deck-inner');
  if (window.gsap && typeof window.gsap.to === 'function' && inner) {
    gsap.to(inner, {
      rotateY: 90,
      duration: 0.1,
      ease: 'power1.in',
      onComplete: function () {
        gsap.to(inner, {
          rotateY: 180,
          duration: 0.12,
          ease: 'power1.out',
          onComplete: done
        });
      }
    });
  } else {
    done();
  }
}

// ── 翻回背面 ──
function flipBack(cardEl) {
  var inner = cardEl.querySelector('.deck-inner');
  if (window.gsap && typeof window.gsap.to === 'function' && inner) {
    gsap.to(inner, {
      rotateY: 0,
      duration: 0.15,
      ease: 'power1.out'
    });
  }
}

// ── 把本次结果渲染到卡片正面 ──
function showLastPick(r, cardEl) {
  cardEl = cardEl || document.getElementById('deck' + r.deck);
  var resultBox = cardEl.querySelector('.pick-result');
  if (!resultBox) return;
  var gainHtml = '<span class="gain">+' + r.gain + '</span>';
  var lossHtml = r.loss > 0
    ? '<span class="loss">-' + r.loss + '</span>'
    : '<span class="no-loss">无损失</span>';
  var netHtml = r.net >= 0
    ? '<span class="gain">+' + r.net + '</span>'
    : '<span class="loss">' + r.net + '</span>';
  resultBox.innerHTML =
    '<div class="pick-deck">牌堆 ' + r.deck + '</div>' +
    '<div class="pick-line"><span class="pick-tag">收益</span>' + gainHtml + '</div>' +
    '<div class="pick-line"><span class="pick-tag">损失</span>' + lossHtml + '</div>' +
    '<div class="pick-net-line"><span class="pick-tag">净变化</span>' + netHtml + '</div>';
}

// ── 资金跳动动画 ──
function animateMoney(r) {
  var display = document.getElementById('moneyDisplay');
  display.textContent = '$' + r.money.toLocaleString();
  display.classList.remove('money-pop');
  void display.offsetWidth;
  display.classList.add('money-pop');
  if (window.gsap) {
    gsap.fromTo(display, { scale: 1.15 }, { scale: 1, duration: 0.35, ease: 'power2.out' });
  }
}

// ── 状态栏与进度 ──
function updateStatus() {
  var s = getGame().getState();
  document.getElementById('moneyDisplay').textContent = '$' + s.money.toLocaleString();
  document.getElementById('progressDisplay').textContent = s.trial + ' / ' + s.totalRounds;
  document.getElementById('progressFill').style.width = (s.trial / s.totalRounds * 100) + '%';
  updateDeckStats();
  updateLearnChart();
  updateMoneyChart();
}

// ── 每堆选牌次数（只显示次数，隐藏累计净收益避免泄露牌堆好坏） ──
function updateDeckStats() {
  var s = getGame().getState();
  ['A', 'B', 'C', 'D'].forEach(function (deck) {
    var col = document.getElementById('deck' + deck).parentElement;
    if (!col) return;
    var picksEl = col.querySelector('.deck-picks');
    if (!picksEl) return;
    var count = s.deckCounts[deck];
    picksEl.textContent = count + ' 次';
  });
}

// ── 学习曲线（Chart.js） ──
function initLearnChart() {
  var ctx = document.getElementById('learnChart');
  if (!ctx) return;
  learnChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '每 20 手净分数',
        data: [],
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.15)',
        fill: true,
        tension: 0.25,
        pointRadius: 4,
        pointBackgroundColor: '#ffd700'
      }, {
        label: '零线',
        data: [],
        borderColor: 'rgba(144,202,249,0.4)',
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#aaa' } }
      },
      scales: {
        x: {
          title: { display: true, text: '手数区间', color: '#888' },
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          title: { display: true, text: '净分数', color: '#888' },
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        }
      }
    }
  });
}

function updateLearnChart() {
  if (!learnChart) return;
  var s = getGame().getState();
  var blocks = s.blockScores;
  var labels = [];
  for (var i = 0; i < blocks.length; i++) {
    labels.push((i * 20 + 1) + '-' + ((i + 1) * 20));
  }
  learnChart.data.labels = labels;
  learnChart.data.datasets[0].data = blocks;
  learnChart.data.datasets[1].data = blocks.map(function () { return 0; });
  learnChart.update();
}

// ── 实时资金曲线（开局即可见，每抽一手追加一个点） ──
function initMoneyChart() {
  var ctx = document.getElementById('moneyChart');
  if (!ctx) return;
  moneyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '资金',
        data: [],
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.12)',
        fill: true,
        tension: 0.25,
        pointRadius: 2,
        pointBackgroundColor: '#ffd700'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#aaa' } }
      },
      scales: {
        x: {
          title: { display: true, text: '手数', color: '#888' },
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          title: { display: true, text: '资金', color: '#888' },
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        }
      }
    }
  });
  moneySeries = [getGame().getState().startMoney || 2000];
}

function updateMoneyChart() {
  if (!moneyChart) return;
  var labels = [];
  for (var i = 0; i < moneySeries.length; i++) {
    labels.push(i);
  }
  moneyChart.data.labels = labels;
  moneyChart.data.datasets[0].data = moneySeries.slice();
  moneyChart.update('none');
}

// ── 游戏结束 ──
function finishGame() {
  var s = getGame().getState();
  nfTrack('game_finish', { netScore: s.netScore, bankrupt: s.bankrupt ? 1 : 0 });

  // 结果判定
  var grade, gradeColor;
  if (s.bankrupt) {
    grade = '破产了';
    gradeColor = '#ff6b6b';
  } else if (s.netScore >= 40) {
    grade = '优秀：直觉识破了陷阱';
    gradeColor = '#81c784';
  } else if (s.netScore >= 20) {
    grade = '良好：中后期开始转向好堆';
    gradeColor = '#81c784';
  } else if (s.netScore >= 0) {
    grade = '一般：略好于乱抽';
    gradeColor = '#ffd700';
  } else {
    grade = '被纸面高收益诱惑了';
    gradeColor = '#ff6b6b';
  }

  var banner = document.getElementById('resultBanner');
  banner.innerHTML = '<span style="color:' + gradeColor + '">' + grade + '</span> —— 健康受试者平均能拿到 ' +
    '<strong>+42</strong> 的净分数（满分 100），前额叶损伤患者平均 <strong>-18</strong>。';

  document.getElementById('finalMoney').textContent = '$' + s.money.toLocaleString();
  document.getElementById('finalNetScore').textContent = s.netScore;
  var goodRate = Math.round((s.deckCounts.C + s.deckCounts.D) / s.trial * 100);
  document.getElementById('goodDeckRate').textContent = goodRate + '%';
  document.getElementById('resultGrade').textContent = grade;
  document.getElementById('resultGrade').style.color = gradeColor;

  document.getElementById('resultSection').style.display = 'block';

  // 游戏结束才展示学习曲线（测试中隐藏，避免泄露牌堆好坏）
  var learnSection = document.getElementById('learnSection');
  if (learnSection) {
    learnSection.style.display = 'block';
    if (learnChart) {
      setTimeout(function () { learnChart.resize(); }, 50);
    }
  }

  renderCompareChart(s);
  submitResult(s);
  fetchLeaderboard();

  document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 对比图：你 vs 全站 vs 论文 ──
function renderCompareChart(s) {
  var ctx = document.getElementById('compareChart');
  if (!ctx) return;
  var labels = ['你', PAPER_DATA.healthyLabel, PAPER_DATA.lesionedLabel];
  var values = [s.netScore, PAPER_DATA.healthy, PAPER_DATA.lesioned];
  var colors = ['#ffd700', '#81c784', '#ff6b6b'];
  var note = '论文数据参考 Bechara &amp; Damasio (1994)：健康受试者在任务中后期学会避开坏堆（A/B），净分数显著为正；前额叶损伤患者无法学会，持续抽坏堆。';

  if (window.__IOWA_STATS__ && window.__IOWA_STATS__.totalSessions > 0) {
    labels.splice(1, 0, '全站均值（' + window.__IOWA_STATS__.totalSessions + ' 局）');
    values.splice(1, 0, window.__IOWA_STATS__.avgNetScore);
    colors.splice(1, 0, '#90caf9');
    note = '全站均值来自本页玩家提交的结果。' + note;
  }
  document.getElementById('compareNote').innerHTML = note;

  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '净分数',
        data: values,
        backgroundColor: colors,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          title: { display: true, text: '净分数', color: '#888' },
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        x: {
          ticks: { color: '#aaa' },
          grid: { display: false }
        }
      }
    }
  });
}

// ── 后端提交 ──
function submitResult(s) {
  var sessionId = getSessionId();
  var payload = {
    sessionId: sessionId,
    totalRounds: s.trial,
    finalMoney: s.money,
    netScore: s.netScore,
    bankrupt: s.bankrupt,
    deckPicks: JSON.stringify([s.deckCounts.A, s.deckCounts.B, s.deckCounts.C, s.deckCounts.D]),
    blockScores: JSON.stringify(s.blockScores)
  };
  fetch(API_BASE + '/iowa-gambling/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.status === 200) {
        fetchStats();
        fetchLeaderboard();
      }
    })
    .catch(function () { /* 网络失败静默，不影响页面 */ });
}

// ── 拉取净分数排行榜 ──
function fetchLeaderboard() {
  fetch(API_BASE + '/iowa-gambling/leaderboard?limit=10')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.status === 200 && data.data) {
        renderLeaderboard(data.data);
      }
    })
    .catch(function () { /* 静默 */ });
}

function renderLeaderboard(lb) {
  var box = document.getElementById('leaderboardBox');
  if (!box) return;
  var leaders = lb.leaders || [];
  var total = lb.total || 0;
  var totalEl = document.getElementById('lbTotalText');
  if (totalEl) {
    totalEl.textContent = '共 ' + total + ' 位上榜';
  }
  if (!leaders.length) {
    box.innerHTML = '<div class="leaderboard-empty">还没有人上榜，快来当第一。</div>';
    return;
  }
  var html = '<div class="lb-row lb-head"><span>名次</span><span>用户名</span><span>净分数</span><span>最终资金</span><span>手数</span></div>';
  for (var i = 0; i < leaders.length; i++) {
    var e = leaders[i];
    var medal = e.rank === 1 ? '<i class="ti ti-medal gold"></i>'
      : e.rank === 2 ? '<i class="ti ti-medal silver"></i>'
        : e.rank === 3 ? '<i class="ti ti-medal bronze"></i>'
          : '<span class="lb-rank">' + e.rank + '</span>';
    html += '<div class="lb-row">' +
      '<span class="lb-rank-cell">' + medal + '</span>' +
      '<span class="lb-name">' + escapeHtml(e.username) + '</span>' +
      '<span class="lb-score">' + (e.netScore >= 0 ? '+' : '') + e.netScore + '</span>' +
      '<span>$' + e.finalMoney.toLocaleString() + '</span>' +
      '<span>' + e.totalRounds + '</span>' +
      '</div>';
  }
  box.innerHTML = html;
}

// ── 排行榜提交（防刷榜：PoW 工作量证明 + Turnstile 人机验证） ──
var TURNSTILE_SITE_KEY = '0x4AAAAAADsMioJW-WyC3Fwm';
var turnstileId = null;

function showLeaderboardSubmit() {
  var g = getGame();
  var s = g.getState();
  if (s.trial === 0) {
    var statusEl = document.getElementById('lbSubmitStatus');
    if (statusEl) {
      statusEl.textContent = '还没开始玩，至少抽一张再提交';
      statusEl.className = 'lb-status error';
    }
    var modal = document.getElementById('lbModal');
    if (modal) modal.style.display = 'flex';
    return;
  }
  document.getElementById('lbPreviewNet').textContent = (s.netScore >= 0 ? '+' : '') + s.netScore;
  document.getElementById('lbPreviewMoney').textContent = '$' + s.money.toLocaleString();
  document.getElementById('lbPreviewRounds').textContent = s.trial;
  var statusEl = document.getElementById('lbSubmitStatus');
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'lb-status'; }
  var input = document.getElementById('lbUsername');
  if (input) input.focus();
  renderTurnstile();
  document.getElementById('lbModal').style.display = 'flex';
}

function closeLeaderboardSubmit() {
  var modal = document.getElementById('lbModal');
  if (modal) modal.style.display = 'none';
  resetTurnstile();
}

var turnstileReady = false; // Turnstile 是否已完成人机验证

function renderTurnstile() {
  var container = document.getElementById('turnstileWidget');
  if (!container) return;
  resetTurnstile();
  turnstileReady = false;
  var statusEl = document.getElementById('lbSubmitStatus');
  // api.js 尚未加载完成（async defer）：延迟重试渲染，而不是静默跳过
  if (typeof turnstile === 'undefined') {
    container.innerHTML = '';
    if (statusEl) {
      statusEl.textContent = '正在加载人机验证组件…';
      statusEl.className = 'lb-status loading';
    }
    setTimeout(function () {
      var modal = document.getElementById('lbModal');
      if (modal && modal.style.display === 'flex') {
        renderTurnstile();
      }
    }, 1500);
    return;
  }
  container.innerHTML = '';
  try {
    turnstileId = turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      action: 'iowa-gambling-submit',
      theme: 'auto',
      callback: function () {
        turnstileReady = true;
        if (statusEl) {
          statusEl.textContent = '人机验证通过，可以提交了';
          statusEl.className = 'lb-status success';
        }
      },
      'expired-callback': function () {
        turnstileReady = false;
        if (statusEl) {
          statusEl.textContent = '验证已过期，请重新勾选';
          statusEl.className = 'lb-status error';
        }
      },
      'error-callback': function () {
        turnstileReady = false;
        if (statusEl) {
          statusEl.textContent = '人机验证加载失败，请刷新页面重试';
          statusEl.className = 'lb-status error';
        }
      }
    });
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = '人机验证加载失败，请刷新页面重试';
      statusEl.className = 'lb-status error';
    }
  }
}

function resetTurnstile() {
  if (turnstileId !== null && typeof turnstile !== 'undefined') {
    try { turnstile.reset(turnstileId); } catch (e) { /* 静默 */ }
    turnstileId = null;
  }
  turnstileReady = false;
}

function getTurnstileToken() {
  if (typeof turnstile === 'undefined' || turnstileId === null) return null;
  try {
    return turnstile.getResponse(turnstileId) || null;
  } catch (e) {
    return null;
  }
}

async function sha256(message) {
  var msgBuffer = new TextEncoder().encode(message);
  var hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function buildChallengePayload(challengeId, username, netScore, finalMoney, totalRounds, deckPicks) {
  return challengeId + '|' + username + '|' + netScore + '|' + finalMoney
    + '|' + totalRounds + '|' + deckPicks;
}

async function computePoW(payload, difficulty) {
  difficulty = difficulty || 4;
  var zeroPrefix = new Array(difficulty + 1).join('0');
  var nonce = 0;
  while (true) {
    var hash = await sha256(payload + nonce);
    if (hash.substring(0, difficulty) === zeroPrefix) {
      return { hash: hash, nonce: String(nonce) };
    }
    nonce++;
    if (nonce % 1000 === 0) {
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
  }
}

async function submitToLeaderboard() {
  var usernameInput = document.getElementById('lbUsername');
  var statusEl = document.getElementById('lbSubmitStatus');
  var submitBtn = document.getElementById('lbSubmitConfirm');
  var username = usernameInput ? usernameInput.value.trim() : '';
  if (!username) {
    statusEl.textContent = '请输入用户名';
    statusEl.className = 'lb-status error';
    return;
  }
  if (username.length > 50) {
    statusEl.textContent = '用户名最多 50 个字符';
    statusEl.className = 'lb-status error';
    return;
  }
  var s = getGame().getState();
  if (s.trial === 0) {
    statusEl.textContent = '还没开始玩，至少抽一张再提交';
    statusEl.className = 'lb-status error';
    return;
  }
  var deckPicks = JSON.stringify([s.deckCounts.A, s.deckCounts.B, s.deckCounts.C, s.deckCounts.D]);

  // 人机验证必须已完成，否则后端会拒绝（cfTurnstileToken is required）
  var turnstileToken = getTurnstileToken();
  if (!turnstileToken) {
    statusEl.textContent = turnstileReady
      ? '人机验证已过期，请重新勾选后再提交'
      : '请先完成人机验证（点验证框勾选），再点击提交';
    statusEl.className = 'lb-status error';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = '正在申请挑战…';
  statusEl.className = 'lb-status loading';

  try {
    var challengeRes = await fetch(API_BASE + '/iowa-gambling/leaderboard/challenge');
    var challengeJson = await challengeRes.json();
    if (challengeJson.status !== 200 || !challengeJson.data) {
      statusEl.textContent = challengeJson.message || '获取挑战失败';
      statusEl.className = 'lb-status error';
      return;
    }
    var challenge = challengeJson.data;
    var payload = buildChallengePayload(
      challenge.challengeId, username, s.netScore, s.money, s.trial, deckPicks);
    statusEl.textContent = '正在计算工作量证明…';
    var pow = await computePoW(payload, challenge.difficulty || 4);
    statusEl.textContent = '正在提交…';

    var body = {
      username: username,
      netScore: s.netScore,
      finalMoney: s.money,
      bankrupt: s.bankrupt,
      totalRounds: s.trial,
      deckPicks: deckPicks,
      challengeId: challenge.challengeId,
      powHash: pow.hash,
      powNonce: pow.nonce,
      cfTurnstileToken: turnstileToken
    };

    var res = await fetch(API_BASE + '/iowa-gambling/leaderboard/submit-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var json = await res.json();
    if (json.status === 200 && json.data) {
      var msg = '提交成功！你的最佳成绩排第 ' + json.data.rank + ' 名（共 ' + json.data.total + ' 人）';
      statusEl.textContent = msg;
      statusEl.className = 'lb-status success';
      nfTrack('leaderboard_submit', {
        netScore: s.netScore,
        finalMoney: s.money,
        rounds: s.trial
      });
      fetchLeaderboard();
      setTimeout(closeLeaderboardSubmit, 2500);
    } else {
      statusEl.textContent = json.message || '提交失败';
      statusEl.className = 'lb-status error';
    }
  } catch (e) {
    statusEl.textContent = '网络错误，请重试';
    statusEl.className = 'lb-status error';
  } finally {
    submitBtn.disabled = false;
  }
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── 拉取全站统计 ──
function fetchStats() {
  fetch(API_BASE + '/iowa-gambling/stats')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.status === 200) {
        window.__IOWA_STATS__ = data.data;
        var s = getGame().getState();
        if (document.getElementById('resultSection').style.display === 'block') {
          renderCompareChart(s);
        }
      }
    })
    .catch(function () { /* 静默 */ });
}

function getSessionId() {
  try {
    if (!window.sessionStorage) return 'unknown';
    var key = 'igt-session';
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
function restartGame() {
  game = window.createGame ? window.createGame() : createGame();
  picking = false;
  faceUpDeck = null;
  moneySeries = [game.getState().startMoney || 2000];
  document.getElementById('resultSection').style.display = 'none';
  var learnSection = document.getElementById('learnSection');
  if (learnSection) {
    learnSection.style.display = 'none';
  }
  // 清空所有卡片正面并翻回背面
  ['A', 'B', 'C', 'D'].forEach(function (deck) {
    var el = document.getElementById('deck' + deck);
    var resultBox = el && el.querySelector('.pick-result');
    if (resultBox) {
      resultBox.innerHTML = '';
    }
    if (el) {
      flipBack(el);
    }
  });
  if (window.__IOWA_STATS__) {
    delete window.__IOWA_STATS__;
  }
  updateStatus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  nfTrack('game_restart', {});
}

// ── 暴露给 HTML onclick ──
window.handlePick = handlePick;
window.restartGame = restartGame;
window.showLeaderboardSubmit = showLeaderboardSubmit;
window.closeLeaderboardSubmit = closeLeaderboardSubmit;
window.submitToLeaderboard = submitToLeaderboard;

// ── 测试钩子（仅用于无浏览器冒烟测试，生产环境无副作用） ──
window.__igt = {
  getGame: getGame,
  drawCardAndTick: function (deck) {
    var r = getGame().drawCard(deck);
    showLastPick(r);
    updateStatus();
    animateMoney(r);
    if (r.over) {
      finishGame();
    }
    return r;
  },
  restartGame: restartGame
};

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 页面加载后异步拉一次全站统计（预热，供结果页对比）
setTimeout(fetchStats, 1500);
