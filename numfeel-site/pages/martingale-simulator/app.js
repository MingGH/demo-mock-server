// ========== 全局状态 ==========
var state = null;
var moneyChart = null;
var mcChart = null;
var compareChart = null;
var sensitivityChart = null;
var isAutoPlaying = false;
var autoStop = false;

// ========== 游戏控制 ==========

function getSettings() {
  var playerMoney = parseInt(document.getElementById('playerMoney').value) || 10000;
  var dealerMoney = parseInt(document.getElementById('dealerMoney').value) || 100000;
  var baseBet = parseInt(document.getElementById('baseBet').value) || 10;
  var tableLimit = parseInt(document.getElementById('tableLimit').value) || 5000;
  var winRate = parseFloat(document.getElementById('winRate').value) || 0.486;
  var strategy = document.getElementById('strategy').value;

  if (playerMoney < 1) playerMoney = 1;
  if (dealerMoney < 1) dealerMoney = 1;
  if (baseBet < 1) baseBet = 1;
  if (tableLimit < 1) tableLimit = 1;

  return {
    playerMoney: playerMoney,
    dealerMoney: dealerMoney,
    baseBet: baseBet,
    tableLimit: tableLimit,
    winRate: winRate,
    strategy: strategy
  };
}

function startGame() {
  var params = getSettings();
  state = createInitialState(params);

  document.getElementById('setupPanel').style.display = 'none';
  document.querySelectorAll('.game-area').forEach(function(el) {
    el.classList.add('active');
  });

  updateUI();
  updateChart();
  renderHistory();
}

function doBet() {
  if (!state || isAutoPlaying) return;
  if (state.playerMoney <= 0 || state.playerMoney < state.currentBet) {
    showGameOver('player_bankrupt');
    return;
  }

  var result = playRound(state);
  state = result.state;

  var btn = document.getElementById('betBtn');
  btn.disabled = true;

  // 动画
  var resultEl = document.getElementById('resultDisplay');
  resultEl.style.display = 'flex';
  var resultText = document.getElementById('resultText');
  var resultDetail = document.getElementById('resultDetail');

  if (result.won) {
    resultText.textContent = '赢了！+' + formatMoney(result.payout);
    resultText.className = 'result-text win';
    resultDetail.textContent = '下注 ' + formatMoney(state.history[state.history.length - 1].bet) + '，拿回 ' + formatMoney(result.payout);
    resultEl.className = 'result-display win';
    gsap.fromTo(resultEl, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
  } else {
    resultText.textContent = '输了 -' + formatMoney(state.history[state.history.length - 1].bet);
    resultText.className = 'result-text lose';
    resultDetail.textContent = '下注 ' + formatMoney(state.history[state.history.length - 1].bet) + '，资金减少';
    resultEl.className = 'result-display lose';
    gsap.fromTo(resultEl, { x: -5, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: 'power2.out' });
  }

  updateUI();
  renderHistory();
  updateChart();

  btn.disabled = false;

  if (result.status !== 'ok') {
    setTimeout(function() { showGameOver(result.status); }, 400);
  }
}

function autoPlayRounds(n) {
  if (!state || isAutoPlaying) return;
  var btn = document.getElementById('betBtn');
  btn.disabled = true;
  isAutoPlaying = true;
  autoStop = false;

  var count = 0;
  var maxIter = n;

  function step() {
    if (autoStop || count >= maxIter) {
      isAutoPlaying = false;
      btn.disabled = false;
      return;
    }
    if (!state || state.playerMoney <= 0 || state.playerMoney < state.currentBet) {
      isAutoPlaying = false;
      btn.disabled = false;
      showGameOver('player_bankrupt');
      return;
    }

    var result = playRound(state);
    state = result.state;
    count++;

    updateUI();
    renderHistory();
    updateChart();

    if (result.status !== 'ok') {
      isAutoPlaying = false;
      btn.disabled = false;
      setTimeout(function() { showGameOver(result.status); }, 300);
      return;
    }

    setTimeout(step, 30);
  }

  step();
}

function resetGame() {
  autoStop = true;
  isAutoPlaying = false;
  state = null;

  document.getElementById('setupPanel').style.display = 'block';
  document.querySelectorAll('.game-area').forEach(function(el) {
    el.classList.remove('active');
  });
  document.getElementById('resultDisplay').style.display = 'none';
  document.getElementById('betBtn').disabled = false;

  if (moneyChart) { moneyChart.destroy(); moneyChart = null; }
  if (mcChart) { mcChart.destroy(); mcChart = null; }
  if (compareChart) { compareChart.destroy(); compareChart = null; }
  if (sensitivityChart) { sensitivityChart.destroy(); sensitivityChart = null; }
}

// ========== UI 更新 ==========

function updateUI() {
  if (!state) return;

  // 资金条
  var total = state.playerMoney + state.dealerMoney;
  var playerPct = total > 0 ? (state.playerMoney / total * 100) : 50;
  var dealerPct = total > 0 ? (state.dealerMoney / total * 100) : 50;

  gsap.to('#playerBar', { width: Math.max(playerPct, 1) + '%', duration: 0.4, ease: 'power2.out' });
  gsap.to('#dealerBar', { width: Math.max(dealerPct, 1) + '%', duration: 0.4, ease: 'power2.out' });

  document.getElementById('playerMoneyText').textContent = formatMoney(state.playerMoney);
  document.getElementById('dealerMoneyText').textContent = formatMoney(state.dealerMoney);
  document.getElementById('currentBetDisplay').textContent = formatMoney(state.currentBet);
  document.getElementById('roundDisplay').textContent = '第 ' + state.totalRounds + ' 局';
  document.getElementById('winCount').textContent = state.wins;
  document.getElementById('loseCount').textContent = state.losses;
  document.getElementById('consecutiveLosses').textContent = state.consecutiveLosses;

  // 警告
  var warningEl = document.getElementById('betWarning');
  var warningText = document.getElementById('betWarningText');
  if (state.currentBet > state.playerMoney * 0.3) {
    warningEl.classList.add('show');
    warningText.textContent = '当前下注占本金的 ' + (state.currentBet / state.playerMoney * 100).toFixed(0) + '%';
  } else if (state.currentBet > state.tableLimit * 0.8) {
    warningEl.classList.add('show');
    warningText.textContent = '已接近赌桌限红（' + formatMoney(state.tableLimit) + '）';
  } else {
    warningEl.classList.remove('show');
  }

  // 更新设置面板显示当前值
  document.getElementById('playerMoney').value = state.playerMoney;
  document.getElementById('dealerMoney').value = state.dealerMoney;
}

function renderHistory() {
  var container = document.getElementById('historyList');
  if (!state || state.history.length === 0) {
    container.innerHTML = '<div class="empty-state">还没开始，点「下注」试试</div>';
    return;
  }

  var items = state.history.slice(-50).reverse().map(function(h) {
    var cls = h.won ? 'win' : 'lose';
    var tag = h.won ? '赢' : '输';
    return '<div class="history-item ' + cls + '">' +
      '<span><span class="round-num">#' + h.round + '</span> <span class="result-tag ' + cls + '">' + tag + '</span></span>' +
      '<span class="bet-amount">' + formatMoney(h.bet) + '</span>' +
      '<span style="color:rgba(255,255,255,0.3);font-size:0.75rem;">' + formatMoney(h.playerAfter) + '</span>' +
      '</div>';
  }).join('');

  container.innerHTML = items;
}

function updateChart() {
  if (!state || state.history.length < 2) return;

  var ctx = document.getElementById('moneyChart');
  if (!ctx) {
    var chartBox = document.createElement('div');
    chartBox.className = 'chart-box';
    var canvas = document.createElement('canvas');
    canvas.id = 'moneyChart';
    chartBox.appendChild(canvas);
    document.getElementById('gamePanel').appendChild(chartBox);
    ctx = canvas;
  }

  if (!ctx) return;
  var cctx = ctx.getContext ? ctx.getContext('2d') : null;
  if (!cctx) return;

  if (moneyChart) moneyChart.destroy();

  var labels = state.history.map(function(h) { return h.round; });
  var playerData = state.history.map(function(h) { return h.playerAfter; });
  var dealerData = state.history.map(function(h) { return h.dealerAfter; });

  moneyChart = new Chart(cctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '玩家',
          data: playerData,
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255, 215, 0, 0.05)',
          fill: true,
          tension: 0.2,
          pointRadius: labels.length > 40 ? 0 : 2,
          borderWidth: 2
        },
        {
          label: '庄家',
          data: dealerData,
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255, 107, 107, 0.05)',
          fill: true,
          tension: 0.2,
          pointRadius: labels.length > 40 ? 0 : 2,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '局数', color: 'rgba(255,255,255,0.3)' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: 'rgba(255,255,255,0.3)' }
        },
        y: {
          title: { display: true, text: '金额', color: 'rgba(255,255,255,0.3)' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: 'rgba(255,255,255,0.3)', callback: function(v) { return formatMoney(v); } }
        }
      }
    }
  });
}

// ========== 模拟 ==========

function runMonteCarlo() {
  var params = getSettings();
  var sim = runSimulation({
    playerMoney: params.playerMoney,
    dealerMoney: params.dealerMoney,
    baseBet: params.baseBet,
    tableLimit: params.tableLimit,
    winRate: params.winRate,
    numPlayers: 1000,
    maxRounds: 500,
    strategy: params.strategy
  });

  document.getElementById('mcBankruptRate').textContent = formatPercent(sim.bankruptRate);
  document.getElementById('mcBeatDealer').textContent = formatPercent(sim.beatDealerRate);
  document.getElementById('mcAvg').textContent = formatMoney(sim.avgFinalMoney);
  document.getElementById('mcMedian').textContent = formatMoney(sim.medianFinalMoney);
  document.getElementById('monteResults').style.display = 'block';

  drawMCChart(sim.results, params.playerMoney);
  gsap.fromTo('#monteResults', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
}

function drawMCChart(results, initialMoney) {
  var ctx = document.getElementById('mcChart').getContext('2d');
  if (mcChart) mcChart.destroy();

  var buckets = {
    '破产': 0,
    '惨淡': 0,
    '亏损': 0,
    '保本': 0,
    '盈利': 0,
    '暴富': 0
  };

  results.forEach(function(r) {
    var ratio = r.finalPlayer / initialMoney;
    if (r.finalPlayer <= 0) buckets['破产']++;
    else if (ratio < 0.1) buckets['惨淡']++;
    else if (ratio < 0.8) buckets['亏损']++;
    else if (ratio < 1.2) buckets['保本']++;
    else if (ratio < 5) buckets['盈利']++;
    else buckets['暴富']++;
  });

  mcChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        data: Object.values(buckets),
        backgroundColor: ['#ff4444', '#ff7777', '#ffd700', '#90EE90', '#4ade80', '#22c55e']
      }]
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

function runComparison() {
  var params = getSettings();
  var comparison = runStrategyComparison({
    playerMoney: params.playerMoney,
    dealerMoney: params.dealerMoney,
    baseBet: params.baseBet,
    tableLimit: params.tableLimit,
    winRate: params.winRate,
    numPlayers: 500,
    maxRounds: 500
  });

  var tbody = document.getElementById('compareBody');
  var labels = [];
  var bankruptData = [];
  var beatData = [];

  tbody.innerHTML = comparison.map(function(c) {
    labels.push(c.strategy);
    bankruptData.push(c.bankruptRate * 100);
    beatData.push(c.beatDealerRate * 100);
    var nameMap = { martingale: '马丁格尔', fixed: '固定下注', kelly: '凯利公式' };
    return '<tr>' +
      '<td class="strategy-name ' + c.strategy + '">' + (nameMap[c.strategy] || c.strategy) + '</td>' +
      '<td style="color:' + (c.bankruptRate > 0.5 ? '#ff6b6b' : '#81c784') + '">' + formatPercent(c.bankruptRate) + '</td>' +
      '<td style="color:' + (c.beatDealerRate > 0.1 ? '#81c784' : 'rgba(255,255,255,0.5)') + '">' + formatPercent(c.beatDealerRate) + '</td>' +
      '<td>' + formatMoney(c.avgFinalMoney) + '</td>' +
      '<td>' + formatMoney(c.medianFinalMoney) + '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('compareResults').style.display = 'block';

  var ctx = document.getElementById('compareChart').getContext('2d');
  if (compareChart) compareChart.destroy();

  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['马丁格尔', '固定下注', '凯利公式'],
      datasets: [
        {
          label: '破产率 %',
          data: bankruptData,
          backgroundColor: '#ff6b6b',
          borderRadius: 4
        },
        {
          label: '逼死庄家 %',
          data: beatData,
          backgroundColor: '#81c784',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)' } },
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
      }
    }
  });

  gsap.fromTo('#compareResults', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
}

function runSensitivity() {
  var params = getSettings();
  var data = runSensitivityAnalysis({
    playerMoney: params.playerMoney,
    dealerMoney: params.dealerMoney,
    tableLimit: params.tableLimit,
    winRate: params.winRate,
    numPlayers: 300,
    maxRounds: 300,
    betValues: [1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  });

  document.getElementById('sensitivityResults').style.display = 'block';

  var ctx = document.getElementById('sensitivityChart').getContext('2d');
  if (sensitivityChart) sensitivityChart.destroy();

  sensitivityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(function(d) { return '¥' + d.bet; }),
      datasets: [
        {
          label: '破产率',
          data: data.map(function(d) { return d.bankruptRate * 100; }),
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          borderWidth: 2
        },
        {
          label: '逼死庄家率',
          data: data.map(function(d) { return d.beatDealerRate * 100; }),
          borderColor: '#81c784',
          backgroundColor: 'rgba(129, 199, 132, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } } }
      },
      scales: {
        x: {
          title: { display: true, text: '初始下注', color: 'rgba(255,255,255,0.3)' },
          grid: { display: false },
          ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 } }
        },
        y: {
          title: { display: true, text: '比率 %', color: 'rgba(255,255,255,0.3)' },
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: 'rgba(255,255,255,0.3)' }
        }
      }
    }
  });

  gsap.fromTo('#sensitivityResults', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
}

// ========== Tab 切换 ==========

function switchSimTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('onclick').indexOf("'" + name + "'") >= 0);
  });
  document.querySelectorAll('.tab-content').forEach(function(el) {
    el.classList.remove('active');
  });
  document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
}

// ========== Game Over ==========

function showGameOver(status) {
  var modal = document.getElementById('gameOverModal');
  var icon = document.getElementById('modalIcon');
  var title = document.getElementById('modalTitle');
  var msg = document.getElementById('modalMsg');

  if (status === 'dealer_bankrupt') {
    icon.innerHTML = '<i class="ti ti-trophy"></i>';
    icon.className = 'modal-icon win';
    title.textContent = '你赢了！庄家没钱了！';
    title.className = 'modal-title win';
    msg.textContent = '你的钱比庄家多，马丁格尔帮你把庄家逼空了。但在真实赌场里，庄家的钱永远比你多。';
  } else if (status === 'table_limit') {
    icon.innerHTML = '<i class="ti ti-ban"></i>';
    icon.className = 'modal-icon bankrupt';
    title.textContent = '触达限红';
    title.className = 'modal-title bankrupt';
    msg.textContent = '下注额超过了赌桌限红，翻倍策略失效。之前亏的钱全变成实亏。';
  } else {
    icon.innerHTML = '<i class="ti ti-skull"></i>';
    icon.className = 'modal-icon bankrupt';
    title.textContent = '破产';
    title.className = 'modal-title bankrupt';
    msg.textContent = '钱不够下注了。马丁格尔的结局——大多数人都会走到这一步。';
  }

  document.getElementById('modalFinalMoney').textContent = formatMoney(state ? state.playerMoney : 0);
  document.getElementById('modalTotalRounds').textContent = (state ? state.totalRounds : 0) + ' 局';
  document.getElementById('modalMaxLose').textContent = state ? calcMaxConsecutiveLosses(state.history) + ' 次' : '-';

  modal.classList.add('show');
  gsap.fromTo('.modal-box', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
}

function closeModal() {
  document.getElementById('gameOverModal').classList.remove('show');
}

// ========== 输入验证 ==========

document.querySelectorAll('input[type="number"]').forEach(function(input) {
  input.addEventListener('input', function() {
    var val = parseInt(this.value);
    if (isNaN(val) || val < 0) this.value = 0;
  });
  input.addEventListener('blur', function() {
    var val = parseInt(this.value);
    var min = parseInt(this.getAttribute('min')) || 1;
    if (isNaN(val) || val < min) this.value = min;
  });
});

// ========== 初始化 ==========

// 更新连输表格
function updateLossTable() {
  var baseBet = parseInt(document.getElementById('baseBet').value) || 10;
  var tableLimit = parseInt(document.getElementById('tableLimit').value) || 5000;
  var el = document.getElementById('lossTable');
  var lines = [];
  [1, 2, 3, 5, 10, 15].forEach(function(n) {
    var bet = baseBet * Math.pow(2, n);
    var total = baseBet * (Math.pow(2, n + 1) - 1);
    var limitHit = bet > tableLimit ? ' <i class="ti ti-alert-triangle"></i> 超限红' : '';
    lines.push('连输 ' + n + ' 次 → 下注 ' + formatMoney(bet) + '（累计亏 ' + formatMoney(total) + '）' + limitHit);
  });
  el.innerHTML = lines.join('<br>');
}

document.getElementById('baseBet').addEventListener('input', updateLossTable);
document.getElementById('tableLimit').addEventListener('input', updateLossTable);
updateLossTable();