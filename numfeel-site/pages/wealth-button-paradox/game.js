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
let turnstileId = null;  // Turnstile 组件实例 ID
const FEE = 5;
const TURNSTILE_SITE_KEY = '0x4AAAAAADsMioJW-WyC3Fwm';
const CHINESE_LARGE_UNITS = ['', '万', '亿', '万亿', '京', '垓', '秭', '穰', '沟', '涧', '正', '载', '极', '恒河沙', '阿僧祇', '那由他', '不可思议', '无量', '大数'];
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
function getChineseLargeUnit(groupIndex) {
  if (groupIndex <= 0) return '';
  const maxIndex = CHINESE_LARGE_UNITS.length - 1;
  if (groupIndex <= maxIndex) return CHINESE_LARGE_UNITS[groupIndex];
  const whole = Math.floor(groupIndex / maxIndex);
  const rest = groupIndex % maxIndex;
  return (rest > 0 ? CHINESE_LARGE_UNITS[rest] : '') + CHINESE_LARGE_UNITS[maxIndex].repeat(whole);
}

function formatLargeChineseNumber(abs, digits) {
  const groupIndex = Math.floor(Math.log10(abs) / 4);
  const scaled = abs / Math.pow(10, groupIndex * 4);
  let fractionDigits = digits === undefined ? 2 : digits;
  if (scaled >= 1000) fractionDigits = 0;
  else if (scaled >= 100) fractionDigits = Math.min(fractionDigits, 1);
  return {
    text: scaled.toFixed(fractionDigits) + getChineseLargeUnit(groupIndex),
    exponent: groupIndex * 4
  };
}

function formatPowerHint(num) {
  const abs = Math.abs(num);
  if (!Number.isFinite(abs) || abs < 1e4) return '';
  return `约 10 的 ${Math.floor(Math.log10(abs))} 次方量级`;
}

function toSuperscript(n) {
  const map = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻','+':'⁺' };
  return String(n).split('').map(c => map[c] || c).join('');
}

function formatScientific(abs, digits) {
  if (abs === 0) return '0';
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / Math.pow(10, exp);
  return mantissa.toFixed(digits) + ' × 10' + toSuperscript(exp);
}

function formatMoney(num) {
  if (!Number.isFinite(num)) return num < 0 ? '-\u00a5∞' : '\u00a5∞';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs === 0) return sign + '\u00a50.00';
  if (abs >= 1e4 || abs < 0.01) return sign + '\u00a5' + formatScientific(abs, 2);
  if (abs >= 1) return sign + '\u00a5' + abs.toFixed(2);
  return sign + '\u00a5' + abs.toFixed(4);
}

function formatMoneyHint(num) {
  const powerHint = formatPowerHint(num);
  return powerHint ? `${formatMoney(num)} · ${powerHint}` : formatMoney(num);
}
function updateDisplay() {
  const wealthEl = document.getElementById('currentWealth');
  wealthEl.textContent = formatMoney(wealth);
  wealthEl.className = 'hud-value';
  if (wealth < initialWealth * 0.1) wealthEl.classList.add('danger');
  else if (wealth < initialWealth) wealthEl.classList.add('warning');
  const returnRate = ((wealth / initialWealth - 1) * 100);
  const returnEl = document.getElementById('totalReturn');
  returnEl.textContent = formatReturnRate(returnRate);
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
let hasRecordedPlayer = false;
let hasRecordedBankrupt = false;
let hasRecordedBillionaire = false;
let currentDisplayValues = { players: 0, bankrupt: 0, billionaire: 0 };

function incrStat(field) {
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/wealth-button/incr?field=${field}`);
  } else {
    fetch(`${API_BASE}/wealth-button/incr?field=${field}`, { method: 'POST', keepalive: true }).catch(() => {});
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
  fetch(`${API_BASE}/wealth-button/stats`)
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
function recordPlayer() { if (!hasRecordedPlayer) { hasRecordedPlayer = true; incrStat('players'); } }
function recordBankrupt() { if (!hasRecordedBankrupt) { hasRecordedBankrupt = true; incrStat('bankrupt'); loadGlobalStats(); } }
function recordBillionaire() { if (!hasRecordedBillionaire && wealth >= 1e8) { hasRecordedBillionaire = true; incrStat('billionaire'); loadGlobalStats(); } }

// ========== 排行榜 ==========
let leaderboardData = null;

function getRoundHistoryString() {
  return roundHistory.slice().reverse().map(h => h.win ? 'W' : 'L').join('');
}

function formatReturnRate(value, digits) {
  const fixedDigits = digits === undefined ? 2 : digits;
  if (!Number.isFinite(value)) return value < 0 ? '-∞%' : '+∞%';
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1e4) return sign + formatScientific(abs, fixedDigits) + '%';
  return sign + abs.toFixed(fixedDigits) + '%';
}

function formatReturnRateHint(value, digits) {
  const powerHint = formatPowerHint(value);
  return powerHint ? `${formatReturnRate(value, digits)} · ${powerHint}` : formatReturnRate(value, digits);
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildChallengePayload(challengeId, username, startWealth, historyString) {
  return `${challengeId}|${username}|${startWealth}|${historyString}`;
}

async function computePoW(payload, difficulty) {
  difficulty = difficulty || 4;
  let nonce = 0;
  while (true) {
    const nonceStr = nonce.toString();
    const hash = await sha256(payload + nonceStr);
    if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
      return { hash, nonce: nonceStr };
    }
    nonce++;
    if (nonce % 1000 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
}

function showLeaderboardSubmitModal() {
  document.getElementById('lbSubmitModal').classList.add('show');
  const previewWealth = document.getElementById('lbPreviewWealth');
  const previewReturn = document.getElementById('lbPreviewReturn');
  const previewPresses = document.getElementById('lbPreviewPresses');
  if (previewWealth) previewWealth.textContent = formatMoney(wealth);
  if (previewReturn) previewReturn.textContent = formatReturnRate((wealth / initialWealth - 1) * 100);
  if (previewPresses) previewPresses.textContent = pressCount;
  const statusEl = document.getElementById('lbSubmitStatus');
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'lb-status'; }
  const input = document.getElementById('lbUsername');
  if (input) input.focus();
  // 渲染 Turnstile 组件
  renderTurnstile();
}

function closeLeaderboardModal() {
  document.getElementById('lbSubmitModal').classList.remove('show');
  resetTurnstile();
}

// ========== Turnstile 人机验证 ==========

function renderTurnstile() {
  const container = document.getElementById('turnstileWidget');
  if (!container || typeof turnstile === 'undefined') return;
  resetTurnstile();
  turnstileId = turnstile.render(container, {
    sitekey: TURNSTILE_SITE_KEY,
    action: 'wealth-button-submit',
    theme: 'auto'
  });
}

function resetTurnstile() {
  if (turnstileId !== null && typeof turnstile !== 'undefined') {
    turnstile.reset(turnstileId);
    turnstileId = null;
  }
}

function getTurnstileToken() {
  if (typeof turnstile === 'undefined') return null;
  const response = turnstile.getResponse(turnstileId);
  return response || null;
}

async function submitToLeaderboard() {
  const usernameInput = document.getElementById('lbUsername');
  const statusEl = document.getElementById('lbSubmitStatus');
  const submitBtn = document.getElementById('lbSubmitBtn');
  const username = usernameInput.value.trim();
  const historyString = getRoundHistoryString();

  if (!username) {
    statusEl.textContent = '请输入用户名';
    statusEl.className = 'lb-status error';
    return;
  }
  if (username.length > 50) {
    statusEl.textContent = '用户名最多50个字符';
    statusEl.className = 'lb-status error';
    return;
  }
  if (pressCount === 0) {
    statusEl.textContent = '还没开始玩，至少按一次再提交';
    statusEl.className = 'lb-status error';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = '正在申请挑战...';
  statusEl.className = 'lb-status loading';

  try {
    const challengeRes = await fetch(`${API_BASE}/wealth-button/leaderboard/challenge`);
    const challengeJson = await challengeRes.json();
    if (challengeJson.status !== 200 || !challengeJson.data) {
      statusEl.textContent = challengeJson.message || '获取挑战失败';
      statusEl.className = 'lb-status error';
      return;
    }

    const challenge = challengeJson.data;
    const payload = buildChallengePayload(challenge.challengeId, username, initialWealth, historyString);
    statusEl.textContent = '正在计算工作量证明...';
    const { hash, nonce } = await computePoW(payload, challenge.difficulty || 4);
    statusEl.textContent = '正在提交...';

    const body = {
      username,
      initialWealth,
      roundHistory: historyString,
      challengeId: challenge.challengeId,
      powHash: hash,
      powNonce: nonce,
      cfTurnstileToken: getTurnstileToken() || ''
    };

    const res = await fetch(`${API_BASE}/wealth-button/leaderboard/submit-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();

    if (json.status === 200 && json.data) {
      const { wealthRank, returnRank, total } = json.data;
      let msg = '提交成功!';
      if (wealthRank <= 10) msg += ` 资产榜第${wealthRank}名`;
      if (returnRank <= 10) msg += ` 收益率榜第${returnRank}名`;
      if (wealthRank > 10 && returnRank > 10) msg += ` 共${total}人参与`;
      statusEl.textContent = msg;
      statusEl.className = 'lb-status success';
      loadLeaderboard();
      setTimeout(closeLeaderboardModal, 2500);
    } else {
      if (res.status === 429 || json.status === 429) {
        statusEl.textContent = '提交太频繁了，请稍后再试';
      } else {
        statusEl.textContent = json.message || '提交失败';
      }
      statusEl.className = 'lb-status error';
    }
  } catch (e) {
    statusEl.textContent = '网络错误，请重试';
    statusEl.className = 'lb-status error';
  } finally {
    submitBtn.disabled = false;
  }
}

function loadLeaderboard() {
  fetch(`${API_BASE}/wealth-button/leaderboard?limit=10`)
    .then(r => r.json())
    .then(json => {
      if (json.status === 200 && json.data) {
        leaderboardData = json.data;
        renderLeaderboard();
      }
    })
    .catch(() => {});
}

function renderLeaderboard() {
  if (!leaderboardData) return;
  renderLeaderboardTable('lbWealthBody', leaderboardData.byWealth, 'wealth');
  renderLeaderboardTable('lbReturnBody', leaderboardData.byReturn, 'return');
  const totalEl = document.getElementById('lbTotal');
  if (totalEl) totalEl.textContent = leaderboardData.total;
}

function renderLeaderboardTable(tbodyId, items, type) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:rgba(255,255,255,0.3);padding:20px;">暂无数据</td></tr>';
    return;
  }
  tbody.innerHTML = items.map((item, index) => {
    const rankIcons = ['<i class="ti ti-trophy" style="color:#ffd700"></i>','<i class="ti ti-trophy" style="color:#c0c0c0"></i>','<i class="ti ti-trophy" style="color:#cd7f32"></i>'];
    const rankIcon = item.rank <= 3 ? rankIcons[item.rank - 1] : `#${item.rank}`;
    const mainVal = type === 'wealth' ? formatMoney(item.finalWealth) : formatReturnRate(item.returnRate);
    const subVal = type === 'wealth' ? formatReturnRate(item.returnRate, 1) : formatMoney(item.finalWealth);
    const mainHint = type === 'wealth' ? formatMoneyHint(item.finalWealth) : formatReturnRateHint(item.returnRate);
    const subHint = type === 'wealth' ? formatReturnRateHint(item.returnRate, 1) : formatMoneyHint(item.finalWealth);
    const loseCountValue = item.pressCount - item.winCount;
    return `<tr>
      <td class="lb-rank">${rankIcon}</td>
      <td class="lb-name">${escapeHtml(item.username)}</td>
      <td class="lb-main" title="${escapeAttr(mainHint)}">${mainVal}</td>
      <td class="lb-sub" title="${escapeAttr(subHint)}">${subVal}</td>
      <td class="lb-detail">
        <div>${item.pressCount}次 / 胜${item.winCount} 负${loseCountValue}</div>
        <button class="lb-detail-btn" onclick="showLeaderboardReplay('${type}', ${index})">查看过程</button>
      </td>
    </tr>`;
  }).join('');
}

function replayStoredGame(startWealth, historyString) {
  let wealthValue = startWealth;
  let winCounter = 0;
  const rounds = [];
  for (let i = 0; i < historyString.length; i++) {
    const roundChar = historyString.charAt(i);
    const before = wealthValue;
    const win = roundChar === 'W';
    if (win) winCounter++;
    wealthValue = win ? wealthValue * 9 : wealthValue * 0.1;
    wealthValue -= FEE;
    if (wealthValue < 0) wealthValue = 0;
    rounds.push({ round: i + 1, win, before, after: wealthValue });
  }
  return {
    rounds,
    finalWealth: wealthValue,
    pressCount: historyString.length,
    winCount: winCounter,
    loseCount: historyString.length - winCounter,
    returnRate: (wealthValue / startWealth - 1) * 100
  };
}

function showLeaderboardReplay(type, index) {
  if (!leaderboardData) return;
  const items = type === 'return' ? leaderboardData.byReturn : leaderboardData.byWealth;
  const item = items && items[index];
  if (!item) return;

  const replay = replayStoredGame(item.initialWealth, item.roundHistory || '');
  document.getElementById('lbReplayUser').textContent = item.username;
  const finalWealthEl = document.getElementById('lbReplayFinalWealth');
  finalWealthEl.textContent = formatMoney(item.finalWealth);
  finalWealthEl.title = formatMoneyHint(item.finalWealth);
  const replayReturnEl = document.getElementById('lbReplayReturn');
  replayReturnEl.textContent = formatReturnRate(item.returnRate);
  replayReturnEl.title = formatReturnRateHint(item.returnRate);
  document.getElementById('lbReplayMeta').textContent = `${item.pressCount}次 / ${item.winCount}胜${item.pressCount - item.winCount}负`;
  const magnitudeEl = document.getElementById('lbReplayMagnitude');
  const magnitudeHints = [];
  const wealthPowerHint = formatPowerHint(item.finalWealth);
  const returnPowerHint = formatPowerHint(item.returnRate);
  if (wealthPowerHint) magnitudeHints.push(`资产${wealthPowerHint}`);
  if (returnPowerHint) magnitudeHints.push(`收益率${returnPowerHint}`);
  magnitudeEl.textContent = magnitudeHints.length > 0 ? magnitudeHints.join('，') : '当前结果还没到需要额外标注量级的程度';

  const seqEl = document.getElementById('lbReplaySequence');
  seqEl.innerHTML = replay.rounds.map(function(entry) {
    return `<span class="lb-replay-chip ${entry.win ? 'win' : 'lose'}">${entry.win ? 'x9' : 'x0.1'}</span>`;
  }).join('');

  const historyEl = document.getElementById('lbReplayHistory');
  historyEl.innerHTML = replay.rounds.map(function(entry) {
    return `<div class="lb-replay-row ${entry.win ? 'win' : 'lose'}">
      <span>#${entry.round} ${entry.win ? 'x9' : 'x0.1'}</span>
      <span>${formatMoney(entry.before)} → ${formatMoney(entry.after)}</span>
    </div>`;
  }).join('');

  document.getElementById('lbReplayModal').classList.add('show');
}

function closeReplayModal() {
  document.getElementById('lbReplayModal').classList.remove('show');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function switchLeaderboardTab(tab) {
  document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
  const target = document.querySelector(`.lb-tab[data-tab="${tab}"]`);
  if (target) target.classList.add('active');
  document.getElementById('lbWealthTable').style.display = tab === 'wealth' ? '' : 'none';
  document.getElementById('lbReturnTable').style.display = tab === 'return' ? '' : 'none';
}

// ========== Game Over ==========
function showGameOver() {
  document.getElementById('finalWealth').textContent = formatMoney(wealth);
  document.getElementById('finalReturn').textContent = formatReturnRate((wealth / initialWealth - 1) * 100);
  document.getElementById('finalPresses').textContent = pressCount;
  document.getElementById('finalFees').textContent = formatMoney(pressCount * FEE);
  document.getElementById('gameOverModal').classList.add('show');
}
function closeModal() { document.getElementById('gameOverModal').classList.remove('show'); }
function closeModalAndReset() { closeModal(); resetGame(); }
function shareResult() {
  const text = `50%财富按钮 | 按了${pressCount}次，最终资产${formatMoney(wealth)}，收益率${formatReturnRate((wealth / initialWealth - 1) * 100, 1)}。\nhttps://numfeel.996.ninja/pages/wealth-button-paradox/`;
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
// ========== 按钮皮肤 ==========
const SKINS = [
  { id: 'default',   name: '原始红',     url: '../../images/wealth-button/btn-texture.jpg',     glow: 'rgba(255,50,50,0.4)',   ring: 'rgba(255,60,60,0.3)' },
  { id: 'cyberpunk', name: '赛博朋克',   url: '../../images/wealth-button/skins/cyberpunk.jpg', glow: 'rgba(255,0,200,0.45)',  ring: 'rgba(0,200,255,0.4)' },
  { id: 'genshin',   name: '原神·火元素', url: '../../images/wealth-button/skins/genshin.jpg',   glow: 'rgba(255,140,40,0.5)',  ring: 'rgba(255,200,80,0.4)' },
  { id: 'diablo',    name: '暗黑破坏神', url: '../../images/wealth-button/skins/diablo.jpg',    glow: 'rgba(200,30,30,0.55)',  ring: 'rgba(255,80,40,0.45)' },
  { id: 'minecraft', name: 'MC·TNT',     url: '../../images/wealth-button/skins/minecraft.jpg', glow: 'rgba(255,80,80,0.45)',  ring: 'rgba(200,200,200,0.35)' },
  { id: 'overwatch', name: '守望先锋',   url: '../../images/wealth-button/skins/overwatch.jpg', glow: 'rgba(255,150,40,0.5)',  ring: 'rgba(255,180,80,0.4)' },
  { id: 'mario',     name: '马里奥蘑菇', url: '../../images/wealth-button/skins/mario.jpg',     glow: 'rgba(255,80,80,0.45)',  ring: 'rgba(255,255,255,0.45)' }
];
let currentSkinId = 'default';

function initSkinPicker() {
  const list = document.getElementById('skinList');
  if (!list) return;
  const saved = (function() {
    try { return localStorage.getItem('wealthBtnSkin'); } catch (e) { return null; }
  })();
  if (saved && SKINS.some(s => s.id === saved)) currentSkinId = saved;
  list.innerHTML = SKINS.map(s =>
    `<div class="skin-item ${s.id === currentSkinId ? 'active' : ''}" data-skin="${s.id}" onclick="selectSkin('${s.id}')" title="${s.name}">
      <div class="skin-thumb" style="background-image:url('${s.url}')"></div>
      <div class="skin-name">${s.name}</div>
    </div>`
  ).join('');
  applySkin(currentSkinId);
}

function selectSkin(id) {
  if (!SKINS.some(s => s.id === id)) return;
  currentSkinId = id;
  try { localStorage.setItem('wealthBtnSkin', id); } catch (e) {}
  document.querySelectorAll('.skin-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-skin') === id);
  });
  applySkin(id);
}

function applySkin(id) {
  const skin = SKINS.find(s => s.id === id) || SKINS[0];
  const btn = document.getElementById('pressBtn');
  if (!btn) return;
  btn.style.backgroundImage = `url('${skin.url}')`;
  btn.style.backgroundSize = 'cover';
  btn.style.backgroundPosition = 'center';
  btn.style.boxShadow =
    `0 0 50px ${skin.glow},` +
    ' 0 8px 30px rgba(0,0,0,0.6),' +
    ' inset 0 -6px 20px rgba(0,0,0,0.3),' +
    ' inset 0 6px 15px rgba(255,255,255,0.12)';
  document.querySelectorAll('.btn-ring').forEach(r => {
    r.style.borderColor = skin.ring;
  });
}

// ========== Init ==========
initSkinPicker();
updateDisplay();
loadGlobalStats();
loadLeaderboard();
initParticles();
setInterval(loadGlobalStats, 3000);
