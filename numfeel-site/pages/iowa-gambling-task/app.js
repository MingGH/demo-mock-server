/**
 * 爱荷华赌博任务 - 主交互逻辑
 * 依赖：engine.js（纯逻辑）、Chart.js、GSAP、components/header.js
 */

/* 全局状态 */
var game = null;
var learnChart = null;
var compareChart = null;
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
  updateStatus();
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
  cardEl.classList.add('picked');

  // 上一个正面牌堆翻回去
  if (faceUpDeck && faceUpDeck !== deck) {
    flipBack(document.getElementById('deck' + faceUpDeck));
  }

  // 同一牌堆连点：牌已正面，直接刷新结果，不再等待翻牌动画
  if (faceUpDeck === deck) {
    var r = g.drawCard(deck);
    showLastPick(r, cardEl);
    updateStatus();
    animateMoney(r);
    cardEl.classList.remove('picked');
    picking = false;
    if (r.over) {
      setTimeout(finishGame, 600);
    }
    return;
  }

  flipToFront(cardEl, function () {
    faceUpDeck = deck;
    var r = g.drawCard(deck);
    showLastPick(r, cardEl);
    updateStatus();
    animateMoney(r);
    cardEl.classList.remove('picked');
    picking = false;
    if (r.over) {
      setTimeout(finishGame, 600);
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
      }
    })
    .catch(function () { /* 网络失败静默，不影响页面 */ });
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
