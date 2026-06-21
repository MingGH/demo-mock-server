// ========== 全局状态 ==========
let wealth = 100000;
let initialWealth = 100000;
let pressCount = 0;
let winCount = 0;
let loseCount = 0;
let roundHistory = [];
let wealthHistory = [100000];
let chart = null;
let distChart = null;
const FEE = 5;

// ========== 量子随机数 ==========
const API_BASE = 'https://numfeel-api.996.ninja';
let useQuantum = false;
let quantumPool = [];
let quantumFetching = false;
let quantumSource = 'pseudo';

function toggleRngSource() {
  useQuantum = !useQuantum;
  const track = document.getElementById('rngToggle');
  const pseudoLabel = document.getElementById('pseudoLabel');
  const quantumLabel = document.getElementById('quantumLabel');
  if (useQuantum) {
    track.classList.add('on');
    pseudoLabel.classList.remove('active');
    quantumLabel.classList.add('active');
    updateRngStatus('loading', '正在连接量子源...');
    fetchQuantumNumbers();
    fetchQuantumAvailable();
  } else {
    track.classList.remove('on');
    pseudoLabel.classList.add('active');
    quantumLabel.classList.remove('active');
    quantumPool = [];
    updateRngStatus('pseudo', '伪随机 (Math.random)');
  }
}

function updateRngStatus(state, text) {
  const dot = document.getElementById('rngDot');
  const label = document.getElementById('rngStatusText');
  dot.className = 'rng-dot';
  if (state === 'quantum') { dot.classList.add('active'); quantumSource = 'quantum'; }
  else if (state === 'loading') { dot.classList.add('loading'); quantumSource = 'loading'; }
  else if (state === 'fallback') { dot.classList.add('fallback'); quantumSource = 'pseudo'; }
  else { quantumSource = 'pseudo'; }
  label.textContent = text;
}

function fetchQuantumNumbers() {
  if (quantumFetching) return;
  quantumFetching = true;
  fetch(`${API_BASE}/quantum/numbers?count=100&min=0&max=999999`)
    .then(r => r.json())
    .then(json => {
      quantumFetching = false;
      if (json.status === 200 && json.data) {
        quantumPool = quantumPool.concat(json.data.map(n => n / 1000000));
        const source = json.source === 'quantum' ? 'quantum' : 'fallback';
        if (source === 'quantum') {
          updateRngStatus('quantum', '量子真随机 · 已就绪');
        } else {
          updateRngStatus('fallback', '量子源不可用，已切换伪随机');
        }
      } else {
        updateRngStatus('fallback', '获取失败，已切换伪随机');
      }
    })
    .catch(() => {
      quantumFetching = false;
      updateRngStatus('fallback', '网络错误，已切换伪随机');
    });
}

function fetchQuantumAvailable() {
  fetch(`${API_BASE}/quantum/available`)
    .then(r => r.json())
    .then(avail => {
      if (typeof avail === 'number' && avail > 0) {
        let label;
        if (avail >= 1000000) label = (avail / 1000000).toFixed(1) + 'M';
        else if (avail >= 1000) label = Math.floor(avail / 1000) + 'K';
        else label = String(avail);
        if (useQuantum && quantumSource === 'quantum') {
          updateRngStatus('quantum', `量子真随机 · 池 ${label}`);
        }
      }
    })
    .catch(() => {});
}

function getRandomValue() {
  if (useQuantum && quantumPool.length > 0) {
    const val = quantumPool.shift();
    if (quantumPool.length < 20 && !quantumFetching) {
      fetchQuantumNumbers();
    }
    return val;
  }
  if (useQuantum && quantumPool.length === 0) {
    if (!quantumFetching) fetchQuantumNumbers();
    updateRngStatus('fallback', '量子数耗尽，正在补充...');
  }
  return Math.random();
}

// ========== 游戏逻辑 ==========
function pressButton() {
  const btn = document.getElementById('pressBtn');
  if (btn.disabled) return;

  if (pressCount === 0) recordPlayer();

  const before = wealth;
  const rand = getRandomValue();
  const win = rand < 0.5;

  wealth = win ? wealth * 9 : wealth * 0.1;
  wealth -= FEE;
  if (wealth < 0) wealth = 0;

  pressCount++;
  if (win) winCount++; else loseCount++;

  roundHistory.unshift({ round: pressCount, win, before, after: wealth });
  wealthHistory.push(wealth);

  flashScreen(win);
  if (!win) shakeScreen();

  updateDisplay();
  renderHistory();

  if (wealth >= 1e8) recordBillionaire();

  if (wealth < 1) {
    btn.disabled = true;
    btn.textContent = '破产';
    recordBankrupt();
    setTimeout(showGameOver, 600);
  }
}

function batchPress(n) {
  for (let i = 0; i < n; i++) {
    if (wealth < 1) break;
    pressButton();
  }
}

function flashScreen(win) {
  const el = document.getElementById('flashOverlay');
  el.className = 'flash-overlay ' + (win ? 'win' : 'lose') + ' show';
  setTimeout(() => el.classList.remove('show'), 200);
}

function shakeScreen() {
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 400);
}

function resetGame() {
  initialWealth = parseInt(document.getElementById('initialWealth').value) || 100000;
  wealth = initialWealth;
  pressCount = 0;
  winCount = 0;
  loseCount = 0;
  roundHistory = [];
  wealthHistory = [initialWealth];

  const btn = document.getElementById('pressBtn');
  btn.disabled = false;
  btn.textContent = '按下';

  updateDisplay();
  renderHistory();
}

// ========== 显示 ==========
function formatMoney(num) {
  if (num >= 1e12) return '\u00a5' + (num/1e12).toFixed(2) + '万亿';
  if (num >= 1e8) return '\u00a5' + (num/1e8).toFixed(2) + '亿';
  if (num >= 1e4) return '\u00a5' + (num/1e4).toFixed(2) + '万';
  if (num >= 1) return '\u00a5' + num.toFixed(2);
  if (num >= 0.01) return '\u00a5' + num.toFixed(4);
  return '\u00a5' + num.toExponential(2);
}

function updateDisplay() {
  const wealthEl = document.getElementById('currentWealth');
  wealthEl.textContent = formatMoney(wealth);
  wealthEl.className = 'hud-value';
  if (wealth < initialWealth * 0.1) wealthEl.classList.add('danger');
  else if (wealth < initialWealth) wealthEl.classList.add('warning');

  const returnRate = ((wealth / initialWealth - 1) * 100);
  const returnEl = document.getElementById('totalReturn');
  returnEl.textContent = (returnRate >= 0 ? '+' : '') + returnRate.toFixed(2) + '%';
  returnEl.className = 'hud-value ' + (returnRate >= 0 ? 'safe' : 'danger');

  document.getElementById('pressCount').textContent = pressCount;
  document.getElementById('winCount').textContent = winCount;
  document.getElementById('loseCount').textContent = loseCount;
  document.getElementById('winRate').textContent = pressCount > 0
    ? (winCount / pressCount * 100).toFixed(1) + '%' : '-';

  updateChart();
}

function renderHistory() {
  const container = document.getElementById('historyList');
  if (roundHistory.length === 0) {
    container.innerHTML = '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; text-align: center; padding: 20px;">还没按过，按一下试试</div>';
    return;
  }
  container.innerHTML = roundHistory.slice(0, 25).map(h =>
    `<div class="history-item ${h.win ? 'win' : 'lose'}">
      <span>#${h.round} <span class="history-tag ${h.win ? 'win' : 'lose'}">${h.win ? 'x9' : 'x0.1'}</span> <span style="color:#666;font-size:0.75rem;">(-5手续费)</span></span>
      <span style="color: rgba(255,255,255,0.5); font-size: 0.8rem;">${formatMoney(h.before)} → ${formatMoney(h.after)}</span>
    </div>`
  ).join('');
}

function updateChart() {
  const ctx = document.getElementById('wealthChart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: wealthHistory.map((_, i) => i),
      datasets: [{
        label: '资产',
        data: wealthHistory,
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255, 215, 0, 0.05)',
        fill: true,
        tension: 0.15,
        pointRadius: wealthHistory.length > 40 ? 0 : 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: '按下次数', color: 'rgba(255,255,255,0.4)' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: 'rgba(255,255,255,0.3)' }
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: '资产（对数）', color: 'rgba(255,255,255,0.4)' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: 'rgba(255,255,255,0.3)', callback: v => formatMoney(v) }
        }
      }
    }
  });
}

// ========== 蒙特卡洛 ==========
function runBatchSimulation() {
  const btn = document.getElementById('batchBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2"></i> 模拟中...';

  setTimeout(() => {
    const people = 1000, presses = 100, initial = 100000;
    const results = [];
    for (let i = 0; i < people; i++) {
      let w = initial;
      for (let j = 0; j < presses; j++) {
        w *= Math.random() < 0.5 ? 9 : 0.1;
      }
      results.push(w);
    }
    results.sort((a, b) => a - b);

    const bankruptCount = results.filter(w => w < 1).length;
    const profitCount = results.filter(w => w > initial).length;
    const median = results[Math.floor(people / 2)];
    const avg = results.reduce((a, b) => a + b, 0) / people;

    document.getElementById('simBankruptRate').textContent = (bankruptCount / people * 100).toFixed(1) + '%';
    document.getElementById('simProfitRate').textContent = (profitCount / people * 100).toFixed(1) + '%';
    document.getElementById('simMedian').textContent = formatMoney(median);
    document.getElementById('simAvg').textContent = formatMoney(avg);
    document.getElementById('simResults').classList.add('show');
    drawDistribution(results);

    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-player-play"></i> 再跑一轮';
  }, 80);
}

function drawDistribution(results) {
  const ctx = document.getElementById('distributionChart').getContext('2d');
  if (distChart) distChart.destroy();
  const buckets = { '破产(<1)': 0, '惨淡(1-1k)': 0, '亏损(1k-10w)': 0, '保本(10w-100w)': 0, '小赚(100w-1kw)': 0, '大赚(>1kw)': 0 };
  results.forEach(w => {
    if (w < 1) buckets['破产(<1)']++;
    else if (w < 1000) buckets['惨淡(1-1k)']++;
    else if (w < 100000) buckets['亏损(1k-10w)']++;
    else if (w < 1000000) buckets['保本(10w-100w)']++;
    else if (w < 10000000) buckets['小赚(100w-1kw)']++;
    else buckets['大赚(>1kw)']++;
  });
  distChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{ data: Object.values(buckets), backgroundColor: ['#ff4444','#ff7777','#ffd700','#90EE90','#4ade80','#22c55e'] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
      }
    }
  });
}

// ========== 全球统计 ==========
const STATS_KEYS = { players: 'wealth-btn-players', bankrupt: 'wealth-btn-bankrupt', billionaire: 'wealth-btn-billionaire' };
let hasRecordedPlayer = false;
let hasRecordedBankrupt = false;
let hasRecordedBillionaire = false;
let currentDisplayValues = { players: 0, bankrupt: 0, billionaire: 0 };

function incrStat(key) {
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/stats?action=incr&key=${key}`);
  } else {
    fetch(`${API_BASE}/stats?action=incr&key=${key}`, { method: 'POST', keepalive: true }).catch(() => {});
  }
}

function animateNumber(el, from, to, dur) {
  dur = dur || 600;
  if (from === to) return;
  const start = performance.now();
  const diff = to - from;
  function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const ease = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = formatNumber(Math.round(from + diff * ease));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function formatNumber(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

function loadGlobalStats() {
  fetch(`${API_BASE}/stats?action=getAll`)
    .then(r => r.json())
    .then(json => {
      if (json.status === 200 && json.data) {
        const { players, bankrupt, billionaire } = json.data;
        animateNumber(document.getElementById('globalPlayers'), currentDisplayValues.players, players);
        animateNumber(document.getElementById('globalBankrupt'), currentDisplayValues.bankrupt, bankrupt);
        animateNumber(document.getElementById('globalBillionaire'), currentDisplayValues.billionaire, billionaire);
        currentDisplayValues = { players, bankrupt, billionaire };
        if (players > 0) {
          document.getElementById('globalBankruptRate').textContent = '占比 ' + (bankrupt / players * 100).toFixed(1) + '%';
          document.getElementById('billionaireRate').textContent = '占比 ' + (billionaire / players * 100).toFixed(2) + '%';
        }
      }
    })
    .catch(() => {});
}

function recordPlayer() { if (!hasRecordedPlayer) { hasRecordedPlayer = true; incrStat(STATS_KEYS.players); } }
function recordBankrupt() { if (!hasRecordedBankrupt) { hasRecordedBankrupt = true; incrStat(STATS_KEYS.bankrupt); loadGlobalStats(); } }
function recordBillionaire() { if (!hasRecordedBillionaire && wealth >= 1e8) { hasRecordedBillionaire = true; incrStat(STATS_KEYS.billionaire); loadGlobalStats(); } }

// ========== Game Over ==========
function showGameOver() {
  document.getElementById('finalWealth').textContent = formatMoney(wealth);
  document.getElementById('finalReturn').textContent = ((wealth / initialWealth - 1) * 100).toFixed(2) + '%';
  document.getElementById('finalPresses').textContent = pressCount;
  document.getElementById('finalFees').textContent = formatMoney(pressCount * FEE);
  document.getElementById('gameOverModal').classList.add('show');
}
function closeModal() { document.getElementById('gameOverModal').classList.remove('show'); }
function closeModalAndReset() { closeModal(); resetGame(); }
function shareResult() {
  const text = `50%财富按钮 | 按了${pressCount}次，最终资产${formatMoney(wealth)}，收益率${((wealth/initialWealth-1)*100).toFixed(1)}%。\nhttps://numfeel.996.ninja/pages/wealth-button-paradox/`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => alert('已复制到剪贴板'));
  }
}

// ========== 背景粒子 ==========
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  const COUNT = 50;

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.25 + 0.08
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 200, 255, ${p.alpha})`;
      ctx.fill();
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0, 200, 255, ${0.05 * (1 - dist / 120)})`;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ========== Init ==========
updateDisplay();
loadGlobalStats();
initParticles();
setInterval(loadGlobalStats, 3000);
