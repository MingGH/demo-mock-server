// ========== 频繁交易摩擦绞杀 - DOM 绑定与交互 ==========
// 依赖：trading-engine.js（全局 E 对象）、Chart.js
var E = (typeof module !== 'undefined' && module.exports) ? require('./trading-engine.js') : window;
var hasChart = typeof Chart !== 'undefined';

// ─── 工具 ───────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
function fmt(v, d) { d = d == null ? 2 : d; return Number(v).toFixed(d); }
function fmtMoney(v) {
  if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 1 : 2) + ' 万';
  return Math.round(v).toLocaleString();
}
function fmtPrincipal(v) {
  if (v >= 10000) return (v / 10000) + ' 万';
  return v.toLocaleString();
}
function fmtMonths(m) {
  if (m % 12 === 0) return (m / 12) + ' 年';
  return m + ' 个月';
}
// mulberry32 种子随机源（用于模块一平滑、可复现的对照曲线）
function seededRng(seed) {
  var a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 预生成均匀随机数组，供模块一黄金/绿色曲线共用，保证滑动时平滑对照
var UNIFORMS = (function() {
  var rng = seededRng(20240704);
  var arr = new Array(20000);
  for (var i = 0; i < arr.length; i++) arr[i] = rng();
  return arr;
})();
function downsample(arr, maxPoints) {
  if (arr.length <= maxPoints) return arr;
  var step = (arr.length - 1) / (maxPoints - 1);
  var out = new Array(maxPoints);
  for (var i = 0; i < maxPoints; i++) out[i] = arr[Math.round(i * step)];
  return out;
}
// 数字平滑过渡（countUp）
function countUp(el, to, opts) {
  opts = opts || {};
  if (!el) return;
  var dur = opts.duration || 320;
  var from = parseFloat(el.dataset.cur);
  if (!isFinite(from)) from = parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, '')) || 0;
  var fmtFn = opts.fmt || function(v) { return v.toFixed(opts.decimals == null ? 1 : opts.decimals); };
  var start = performance.now();
  function step(now) {
    var t = Math.min(1, (now - start) / dur);
    var eased = 1 - Math.pow(1 - t, 3);
    var v = from + (to - from) * eased;
    el.textContent = fmtFn(v);
    if (t < 1) requestAnimationFrame(step);
    else { el.dataset.cur = to; el.textContent = fmtFn(to); }
  }
  requestAnimationFrame(step);
}

// ════════════════════════════════════════════════════════
// 模块一：摩擦绞杀计算器
// ════════════════════════════════════════════════════════
var M1 = {
  chart: null,
  rafPending: false,
  sliders: ['principal', 'cost', 'freq', 'std', 'win', 'time']
};

function readM1Params() {
  var p = {
    principal: +$('principalInput').value,
    costPct: +$('costInput').value,        // 0.01..1 （百分比）
    monthly: +$('freqInput').value,
    stdPct: +$('stdInput').value,          // 0.5..5
    winPct: +$('winInput').value,          // 30..70
    months: +$('timeInput').value          // 3..60
  };
  p.cost = p.costPct / 100;
  p.std = p.stdPct / 100;
  p.win = p.winPct / 100;
  p.trades = Math.max(1, Math.round(p.monthly * p.months));
  p.tradesPerYear = Math.round(p.monthly * 12);
  return p;
}

function updateM1SliderLabels(p) {
  $('principalVal').textContent = fmtPrincipal(p.principal);
  $('costVal').textContent = fmt(p.costPct, 2) + '%';
  $('freqVal').textContent = p.monthly + ' 次';
  $('stdVal').textContent = fmt(p.stdPct, 1) + '%';
  $('winVal').textContent = p.winPct + '%';
  $('timeVal').textContent = fmtMonths(p.months);
}

function buildM1Curves(p) {
  // 黄金：含手续费的真实路径；绿色：无手续费的平行宇宙（共用 UNIFORMS）
  var gold = E.simulateTrading({
    principal: p.principal, costPerTrade: p.cost, winRate: p.win,
    gainRate: p.std, lossRate: p.std, trades: p.trades, uniforms: UNIFORMS
  });
  var green = E.simulateTrading({
    principal: p.principal, costPerTrade: 0, winRate: p.win,
    gainRate: p.std, lossRate: p.std, trades: p.trades, uniforms: UNIFORMS
  });
  var red = E.pureFeeErosion(p.principal, p.cost, p.trades);
  return { gold: gold.balances, green: green.balances, red: red };
}

function rebuildM1() {
  var p = readM1Params();
  updateM1SliderLabels(p);
  var curves = buildM1Curves(p);
  var maxPts = 280;
  var gold = downsample(curves.gold, maxPts);
  var green = downsample(curves.green, maxPts);
  var red = downsample(curves.red, maxPts);
  // X 标签：交易序号
  var labels = new Array(gold.length);
  var step = (p.trades - 1) / (gold.length - 1);
  for (var i = 0; i < gold.length; i++) labels[i] = Math.round(i * step);

  if (M1.chart) {
    M1.chart.data.labels = labels;
    M1.chart.data.datasets[0].data = gold;
    M1.chart.data.datasets[1].data = green;
    M1.chart.data.datasets[2].data = red;
    M1.chart.update('none');
  }

  // 顶部大字：手续费累计吃掉百分比（基于纯手续费侵蚀）
  var feeEaten = 1 - curves.red[curves.red.length - 1] / p.principal;
  $('feeEatenPct').textContent = fmt(feeEaten * 100, 1) + '%';

  // 三组统计
  var annualFee = E.annualFeeConsumption(p.cost, p.tradesPerYear);
  var breakReturn = E.breakEvenAnnualReturn(p.cost, p.tradesPerYear);
  var breakWin = E.breakEvenWinRate(p.cost, p.std, p.std);
  $('statAnnualFee').textContent = fmt(annualFee * 100, 1) + '%';
  $('statBreakEvenReturn').textContent = fmt(breakReturn * 100, 1) + '%';
  $('statBreakEvenWin').textContent = fmt(breakWin * 100, 1) + '%';
}

function scheduleM1() {
  if (M1.rafPending) return;
  M1.rafPending = true;
  requestAnimationFrame(function() { M1.rafPending = false; rebuildM1(); });
}

function initM1Chart() {
  if (!hasChart) return;
  var ctx = $('mainChart').getContext('2d');
  M1.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: '实际资金（含手续费）', data: [], borderColor: '#ffd700', backgroundColor: 'rgba(255,215,0,0.10)', borderWidth: 2, pointRadius: 0, tension: 0.25, fill: true },
        { label: '无手续费', data: [], borderColor: '#81c784', backgroundColor: 'transparent', borderWidth: 1.8, borderDash: [6, 4], pointRadius: 0, tension: 0.25 },
        { label: '纯手续费侵蚀', data: [], borderColor: '#ff6b6b', backgroundColor: 'transparent', borderWidth: 1.8, borderDash: [6, 4], pointRadius: 0, tension: 0.25 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,52,96,0.95)', titleColor: '#ffd700', bodyColor: '#e8e8e8',
          callbacks: { title: function(items) { return '第 ' + items[0].label + ' 次交易'; }, label: function(ctx) { return ctx.dataset.label + '：' + fmtMoney(ctx.parsed.y); } }
        }
      },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: '交易次数', color: '#888' } },
        y: { beginAtZero: true, ticks: { color: '#888', callback: function(v) { return fmtMoney(v); } }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: '账户余额', color: '#888' } }
      }
    }
  });
}

// ─── 预设场景 ────────────────────────────────────────
var PRESETS = {
  buddha:   { principal: 100000, cost: 0.10, freq: 2,   std: 2, win: 50, time: 12 },
  retail:   { principal: 100000, cost: 0.10, freq: 13,  std: 2, win: 50, time: 12 },
  intraday: { principal: 100000, cost: 0.12, freq: 60,  std: 2, win: 50, time: 12 },
  futures:  { principal: 100000, cost: 0.05, freq: 200, std: 2, win: 50, time: 12 }
};

function fillPresetFees() {
  Object.keys(PRESETS).forEach(function(key) {
    var pr = PRESETS[key];
    var c = pr.cost / 100;
    var n = pr.freq * pr.time;
    var fee = E.annualFeeConsumption(c, n) * 100;
    var card = document.querySelector('.preset-card[data-preset="' + key + '"]');
    if (card) {
      var span = card.querySelector('[data-fee]');
      if (span) span.textContent = fmt(fee, 1) + '%';
    }
  });
}

function animateToPreset(key) {
  var target = PRESETS[key];
  var ids = { principal: 'principalInput', cost: 'costInput', freq: 'freqInput', std: 'stdInput', win: 'winInput', time: 'timeInput' };
  var start = {};
  Object.keys(ids).forEach(function(k) { start[k] = +$(ids[k]).value; });
  var dur = 480;
  var t0 = performance.now();
  function step(now) {
    var t = Math.min(1, (now - t0) / dur);
    var eased = 1 - Math.pow(1 - t, 3);
    Object.keys(ids).forEach(function(k) {
      var v = start[k] + (target[k] - start[k]) * eased;
      $(ids[k]).value = v;
    });
    rebuildM1();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ════════════════════════════════════════════════════════
// 模块二：N 次交易复利绞杀动画
// ════════════════════════════════════════════════════════
var M2 = {
  cost: 0.001,
  trades: 0,
  principal: 100,        // 用百分比表示
  speed: 1,
  autoTimer: null,
  chart: null,
  alertedHalf: false
};

function m2Remaining() {
  return 100 * Math.pow(1 - M2.cost, M2.trades);
}
function m2WaterClass(pct) {
  if (pct > 80) return '';
  if (pct > 50) return 'warn';
  if (pct > 20) return 'danger';
  return 'critical';
}
function updateM2View() {
  var remain = m2Remaining();
  var fill = $('waterFill');
  fill.style.height = remain + '%';
  fill.className = 'water-fill ' + m2WaterClass(remain);
  $('tradeCount').textContent = M2.trades;
  $('remainPct').textContent = fmt(remain, 1) + '%';
  $('formulaText').textContent = '剩余本金 = 100% × (1 − ' + (M2.cost * 100).toFixed(2) + '%)^' + M2.trades + ' = ' + fmt(remain, 1) + '%';

  // 50% 提示
  if (remain <= 50 && !M2.alertedHalf) {
    M2.alertedHalf = true;
    var ab = $('alertBox');
    ab.style.display = 'flex';
    $('alertText').textContent = '交易了 ' + M2.trades + ' 次，手续费已经吃掉了一半本金';
  }

  // 曲线追加点
  if (M2.chart) {
    M2.chart.data.labels.push(M2.trades);
    M2.chart.data.datasets[0].data.push(remain);
    // 限制点数避免过长
    if (M2.chart.data.labels.length > 800) {
      M2.chart.data.labels.shift();
      M2.chart.data.datasets[0].data.shift();
    }
    M2.chart.update('none');
  }
}
function tradeOnce() {
  M2.trades++;
  updateM2View();
}
function startAuto() {
  if (M2.autoTimer) { stopAuto(); return; }
  var interval = 200 / M2.speed;
  M2.autoTimer = setInterval(tradeOnce, interval);
  $('autoBtn').innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
}
function stopAuto() {
  if (M2.autoTimer) { clearInterval(M2.autoTimer); M2.autoTimer = null; }
  $('autoBtn').innerHTML = '<i class="ti ti-player-play"></i> 自动连续交易';
}
function resetM2() {
  stopAuto();
  M2.trades = 0;
  M2.alertedHalf = false;
  $('alertBox').style.display = 'none';
  if (M2.chart) {
    M2.chart.data.labels = [0];
    M2.chart.data.datasets[0].data = [100];
    M2.chart.update('none');
  }
  updateM2View();
}
function setM2Cost(c) {
  M2.cost = c;
  resetM2();
}
function initM2Chart() {
  if (!hasChart) return;
  var ctx = $('erosionChart').getContext('2d');
  M2.chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [0], datasets: [{ label: '剩余本金%', data: [100], borderColor: '#ffd700', backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 2, pointRadius: 0, tension: 0.2, fill: true }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,52,96,0.95)', titleColor: '#ffd700', bodyColor: '#e8e8e8', callbacks: { title: function(it) { return '第 ' + it[0].label + ' 次'; }, label: function(ctx) { return '剩余 ' + fmt(ctx.parsed.y, 1) + '%'; } } } },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 6 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { type: 'logarithmic', min: 0.1, max: 100, ticks: { color: '#888', callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ════════════════════════════════════════════════════════
// 模块三：策略对决擂台
// ════════════════════════════════════════════════════════
var M3 = {
  charts: { A: null, B: null, C: null },
  mcChart: null,
  racing: false,
  strategies: {
    A: { name: '低频', monthly: 2, color: '#81c784' },
    B: { name: '中频', monthly: 22, color: '#ffb74d' },
    C: { name: '高频', monthly: 60, color: '#ff6b6b' }
  },
  common: { principal: 100000, winRate: 0.52, gainRate: 0.015, lossRate: 0.015, cost: 0.001, months: 12 }
};

// 把按交易序号的余额序列重采样到 0..52 周时间轴
function resampleToWeeks(balances, tradesPerYear) {
  var weeks = 53;
  var out = new Array(weeks);
  for (var w = 0; w < weeks; w++) {
    var tradesAtWeek = Math.round(tradesPerYear * w / 52);
    if (tradesAtWeek >= balances.length) tradesAtWeek = balances.length - 1;
    out[w] = balances[tradesAtWeek];
  }
  return out;
}
function weekLabels() {
  var arr = new Array(53);
  for (var i = 0; i < 53; i++) arr[i] = i;
  return arr;
}
function makeRaceChart(canvasId, color) {
  if (!hasChart) return null;
  var ctx = $(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: { labels: weekLabels(), datasets: [{ data: [], borderColor: color, backgroundColor: 'rgba(0,0,0,0)', borderWidth: 2.2, pointRadius: 0, tension: 0.3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15,52,96,0.95)', titleColor: '#ffd700', bodyColor: '#e8e8e8', callbacks: { title: function(it) { return '第 ' + it[0].label + ' 周'; }, label: function(ctx) { return fmtMoney(ctx.parsed.y); } } } },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 4 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { beginAtZero: true, ticks: { color: '#888', callback: function(v) { return fmtMoney(v); } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}
function initM3Charts() {
  M3.charts.A = makeRaceChart('trackA', M3.strategies.A.color);
  M3.charts.B = makeRaceChart('trackB', M3.strategies.B.color);
  M3.charts.C = makeRaceChart('trackC', M3.strategies.C.color);
}

// 跑一局：返回三条赛道按周的余额序列
function runOneRace() {
  var c = M3.common;
  var out = {};
  ['A', 'B', 'C'].forEach(function(key) {
    var s = M3.strategies[key];
    var tradesPerYear = s.monthly * 12;
    var totalTrades = Math.round(tradesPerYear * c.months / 12);
    var sim = E.simulateTrading({
      principal: c.principal, costPerTrade: c.cost, winRate: c.winRate,
      gainRate: c.gainRate, lossRate: c.lossRate, trades: totalTrades
    });
    out[key] = { weekly: resampleToWeeks(sim.balances, tradesPerYear), final: sim.finalBalance, trades: totalTrades };
  });
  return out;
}

function playRace(result, doneCb) {
  M3.racing = true;
  var totalWeeks = 53;
  var duration = 2200;
  var t0 = performance.now();
  function step(now) {
    var t = Math.min(1, (now - t0) / duration);
    var upto = Math.floor(t * (totalWeeks - 1)) + 1;
    ['A', 'B', 'C'].forEach(function(key) {
      var ch = M3.charts[key];
      if (!ch) return;
      var slice = result[key].weekly.slice(0, upto);
      ch.data.datasets[0].data = slice;
      ch.update('none');
    });
    // 实时余额
    $('balA').textContent = fmtMoney(result.A.weekly[Math.min(upto - 1, 52)]);
    $('balB').textContent = fmtMoney(result.B.weekly[Math.min(upto - 1, 52)]);
    $('balC').textContent = fmtMoney(result.C.weekly[Math.min(upto - 1, 52)]);
    if (t < 1) requestAnimationFrame(step);
    else { M3.racing = false; if (doneCb) doneCb(); }
  }
  requestAnimationFrame(step);
}

function showRaceConclusion(result) {
  var box = $('raceConclusion');
  box.style.display = 'flex';
  var a = result.A.final, b = result.B.final, c = result.C.final;
  var text = '同样的 52% 胜率，低频剩 ' + fmtMoney(a) + '，中频剩 ' + fmtMoney(b) + '，高频剩 ' + fmtMoney(c) + '。唯一变量是频率。';
  $('conclusionText').textContent = text;
}

function raceStart() {
  if (M3.racing) return;
  $('raceConclusion').style.display = 'none';
  $('mcSection').style.display = 'none';
  var result = runOneRace();
  playRace(result, function() { showRaceConclusion(result); });
}

function raceRerun() { raceStart(); }

function race100() {
  if (M3.racing) return;
  $('raceConclusion').style.display = 'none';
  var c = M3.common;
  var stats = {};
  ['A', 'B', 'C'].forEach(function(key) {
    var s = M3.strategies[key];
    var tradesPerYear = s.monthly * 12;
    var totalTrades = Math.round(tradesPerYear * c.months / 12);
    var mc = E.monteCarloSimulation({
      principal: c.principal, costPerTrade: c.cost, winRate: c.winRate,
      gainRate: c.gainRate, lossRate: c.lossRate, trades: totalTrades
    }, 100);
    stats[key] = { results: mc.results, mean: mc.mean, median: mc.median };
    // 显示均值作为余额
    $(key === 'A' ? 'balA' : key === 'B' ? 'balB' : 'balC').textContent = '均值 ' + fmtMoney(mc.mean);
  });
  // 用均值的单条路径填充图表（示意）
  var one = runOneRace();
  ['A', 'B', 'C'].forEach(function(key) {
    var ch = M3.charts[key];
    if (ch) {
      ch.data.datasets[0].data = one[key].weekly;
      ch.update('none');
    }
  });
  drawHistogram(stats);
  $('mcSection').style.display = 'block';
  $('raceConclusion').style.display = 'flex';
  $('conclusionText').textContent = '跑 100 次后：低频均值 ' + fmtMoney(stats.A.mean) + '，中频 ' + fmtMoney(stats.B.mean) + '，高频 ' + fmtMoney(stats.C.mean) + '。运气被平均掉，频率的差距是数学必然。';
}

function drawHistogram(stats) {
  if (!hasChart) return;
  // 把三组 final balances 分桶
  var allResults = stats.A.results.concat(stats.B.results).concat(stats.C.results);
  var min = Math.min.apply(null, allResults);
  var max = Math.max.apply(null, allResults);
  if (min === max) max = min + 1;
  var binCount = 18;
  var binWidth = (max - min) / binCount;
  function histArr(results) {
    var counts = new Array(binCount);
    for (var k = 0; k < binCount; k++) counts[k] = 0;
    for (var i = 0; i < results.length; i++) {
      var idx = Math.floor((results[i] - min) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
    return counts;
  }
  var labels = new Array(binCount);
  for (var j = 0; j < binCount; j++) labels[j] = fmtMoney(min + binWidth * (j + 0.5));

  if (M3.mcChart) M3.mcChart.destroy();
  var ctx = $('mcChart').getContext('2d');
  M3.mcChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: '低频·每月2次', data: histArr(stats.A.results), backgroundColor: 'rgba(129,199,132,0.7)', borderColor: '#81c784', borderWidth: 1 },
        { label: '中频·每周5次', data: histArr(stats.B.results), backgroundColor: 'rgba(255,183,77,0.7)', borderColor: '#ffb74d', borderWidth: 1 },
        { label: '高频·每天3次', data: histArr(stats.C.results), backgroundColor: 'rgba(255,107,107,0.7)', borderColor: '#ff6b6b', borderWidth: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: true, labels: { color: '#c8c8d0' } }, tooltip: { backgroundColor: 'rgba(15,52,96,0.95)', titleColor: '#ffd700', bodyColor: '#e8e8e8' } },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: '最终余额', color: '#888' } },
        y: { beginAtZero: true, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: '次数（共100次）', color: '#888' } }
      }
    }
  });
  $('mcNote').textContent = '分布越靠右越赚钱。低频集中在右侧，高频堆积在左侧——频率越高，分布整体左移。';
}

// ════════════════════════════════════════════════════════
// 初始化
// ════════════════════════════════════════════════════════
function boot() {
  fillPresetFees();
  initM1Chart();
  rebuildM1();

  initM2Chart();
  updateM2View();

  initM3Charts();

  // 模块一滑块
  M1.sliders.forEach(function(name) {
    var el = $(name + 'Input');
    on(el, 'input', scheduleM1);
  });

  // 预设卡片
  document.querySelectorAll('.preset-card').forEach(function(card) {
    on(card, 'click', function() {
      document.querySelectorAll('.preset-card').forEach(function(c) { c.classList.remove('active'); });
      card.classList.add('active');
      animateToPreset(card.dataset.preset);
    });
  });

  // 模块二
  on($('tradeOnceBtn'), 'click', tradeOnce);
  on($('autoBtn'), 'click', startAuto);
  on($('resetM2Btn'), 'click', resetM2);
  document.querySelectorAll('.speed-btn').forEach(function(btn) {
    on(btn, 'click', function() {
      document.querySelectorAll('.speed-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      M2.speed = +btn.dataset.speed;
      if (M2.autoTimer) { stopAuto(); startAuto(); }
    });
  });
  document.querySelectorAll('.fee-btn').forEach(function(btn) {
    on(btn, 'click', function() {
      document.querySelectorAll('.fee-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      setM2Cost(+btn.dataset.cost);
    });
  });

  // 模块三
  on($('raceStartBtn'), 'click', raceStart);
  on($('raceRerunBtn'), 'click', raceRerun);
  on($('race100Btn'), 'click', race100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
