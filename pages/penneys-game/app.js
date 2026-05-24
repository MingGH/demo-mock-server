/**
 * Penney's Game - 交互逻辑
 */
(function() {
  'use strict';

  var PE = window.PenneyEngine;

  // ── 游戏状态 ──
  var state = {
    playerSeq: '',
    aiSeq: '',
    phase: 1,           // 1=选序列, 2=对战中
    coins: [],          // 当前局硬币序列
    roundOver: false,
    autoInterval: null,
    // 多局统计
    totalGames: 0,
    playerWins: 0,
    aiWins: 0
  };

  // ── 初始化 ──
  window.addEventListener('DOMContentLoaded', function() {
    renderMatrix();
    renderCycles();
  });

  // ── 序列选择 ──
  window.addCoin = function(c) {
    if (state.playerSeq.length >= 3) return;
    state.playerSeq += c;
    renderSelection();
  };

  window.clearSelection = function() {
    state.playerSeq = '';
    renderSelection();
  };

  window.quickSelect = function(seq) {
    state.playerSeq = seq;
    renderSelection();
    confirmSelection();
  };

  window.confirmSelection = function() {
    if (state.playerSeq.length !== 3) return;
    startBattle();
  };

  function renderSelection() {
    var container = document.getElementById('playerSeq');
    var html = '';
    for (var i = 0; i < 3; i++) {
      if (i < state.playerSeq.length) {
        var c = state.playerSeq[i];
        var cls = c === 'H' ? 'head' : 'tail';
        var txt = c === 'H' ? '正' : '反';
        html += '<div class="seq-coin ' + cls + '">' + txt + '</div>';
      } else {
        html += '<div class="seq-coin empty"></div>';
      }
    }
    container.innerHTML = html;
    document.getElementById('confirmBtn').disabled = state.playerSeq.length !== 3;
  }

  // ── 开始对战 ──
  function startBattle() {
    state.aiSeq = PE.optimalCounter(state.playerSeq);
    state.phase = 2;
    state.coins = [];
    state.roundOver = false;

    // 更新步骤指示器
    document.getElementById('step1').classList.remove('active');
    document.getElementById('step2').classList.add('active');

    // 隐藏选择界面，显示对战界面
    document.getElementById('phase1').style.display = 'none';
    document.getElementById('phase2').style.display = 'block';

    // 计算胜率
    var aiWinProb = PE.winProbability(state.playerSeq, state.aiSeq);

    // 显示 AI 回应
    var aiDisplay = document.getElementById('aiSeqDisplay');
    aiDisplay.innerHTML = state.aiSeq.split('').map(function(c) {
      var cls = c === 'H' ? 'head' : 'tail';
      var txt = c === 'H' ? '正' : '反';
      return '<div class="seq-coin ' + cls + '">' + txt + '</div>';
    }).join('');

    document.getElementById('aiWinRate').textContent = '胜率 ' + PE.formatPct(aiWinProb);
    document.getElementById('aiExplain').textContent =
      '你选了 ' + PE.formatSeq(state.playerSeq) + '，我选 ' + PE.formatSeq(state.aiSeq) +
      '。我的前两位「' + PE.formatSeq(state.aiSeq.slice(0,2)) + '」会拦截你序列的形成。';

    // 更新比分面板
    document.getElementById('sbPlayerSeq').textContent = PE.formatSeq(state.playerSeq);
    document.getElementById('sbAiSeq').textContent = PE.formatSeq(state.aiSeq);

    // 清空硬币流
    document.getElementById('coinStream').innerHTML = '';
    document.getElementById('roundResult').style.display = 'none';
    document.getElementById('roundResult').innerHTML = '';

    // 按钮状态
    toggleFlipButtons(true);
    document.getElementById('newRoundBtn').style.display = 'none';

    // 延迟后切换到第三步
    setTimeout(function() {
      document.getElementById('step2').classList.remove('active');
      document.getElementById('step3').classList.add('active');
    }, 1500);
  }

  // ── 抛硬币 ──
  window.flipOne = function() {
    if (state.roundOver) return;
    var coin = Math.random() < 0.5 ? 'H' : 'T';
    state.coins.push(coin);
    renderCoin(coin, state.coins.length - 1);
    checkWin();
  };

  window.flipAuto = function() {
    if (state.autoInterval) {
      clearInterval(state.autoInterval);
      state.autoInterval = null;
      document.getElementById('flipAutoBtn').innerHTML = '<i class="ti ti-player-play"></i> 自动抛';
      return;
    }
    document.getElementById('flipAutoBtn').innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
    state.autoInterval = setInterval(function() {
      if (state.roundOver) {
        clearInterval(state.autoInterval);
        state.autoInterval = null;
        document.getElementById('flipAutoBtn').innerHTML = '<i class="ti ti-player-play"></i> 自动抛';
        return;
      }
      flipOne();
    }, 300);
  };

  window.flipFast = function() {
    if (state.roundOver) return;
    if (state.autoInterval) {
      clearInterval(state.autoInterval);
      state.autoInterval = null;
    }
    // 一次性跑完
    var maxFlips = 1000;
    while (!state.roundOver && state.coins.length < maxFlips) {
      var coin = Math.random() < 0.5 ? 'H' : 'T';
      state.coins.push(coin);
      if (state.coins.length >= 3) {
        var last3 = state.coins.slice(-3).join('');
        if (last3 === state.playerSeq || last3 === state.aiSeq) {
          break;
        }
      }
    }
    // 渲染全部硬币
    renderAllCoins();
    checkWin();
  };

  function renderCoin(coin, index) {
    var stream = document.getElementById('coinStream');
    var cls = coin === 'H' ? 'head' : 'tail';
    var txt = coin === 'H' ? '正' : '反';
    var el = document.createElement('div');
    el.className = 'mini-coin ' + cls;
    el.textContent = txt;
    el.dataset.index = index;
    stream.appendChild(el);
    // 自动滚动到底部
    stream.scrollTop = stream.scrollHeight;
  }

  function renderAllCoins() {
    var stream = document.getElementById('coinStream');
    stream.innerHTML = '';
    state.coins.forEach(function(coin, i) {
      var cls = coin === 'H' ? 'head' : 'tail';
      var txt = coin === 'H' ? '正' : '反';
      var el = document.createElement('div');
      el.className = 'mini-coin ' + cls;
      el.textContent = txt;
      el.dataset.index = i;
      stream.appendChild(el);
    });
    stream.scrollTop = stream.scrollHeight;
  }

  function checkWin() {
    if (state.coins.length < 3) return;
    var last3 = state.coins.slice(-3).join('');
    var winner = null;

    if (last3 === state.playerSeq) winner = 'player';
    else if (last3 === state.aiSeq) winner = 'ai';

    if (!winner) return;

    state.roundOver = true;
    if (state.autoInterval) {
      clearInterval(state.autoInterval);
      state.autoInterval = null;
      document.getElementById('flipAutoBtn').innerHTML = '<i class="ti ti-player-play"></i> 自动抛';
    }

    // 高亮最后三个硬币
    var stream = document.getElementById('coinStream');
    var allCoins = stream.querySelectorAll('.mini-coin');
    var total = allCoins.length;
    for (var i = total - 3; i < total; i++) {
      if (allCoins[i]) {
        allCoins[i].classList.add(winner === 'player' ? 'highlight-a' : 'highlight-b');
      }
    }

    // 更新统计
    state.totalGames++;
    if (winner === 'player') state.playerWins++;
    else state.aiWins++;

    document.getElementById('scorePlayer').textContent = state.playerWins;
    document.getElementById('scoreAi').textContent = state.aiWins;

    // 显示结果
    var resultDiv = document.getElementById('roundResult');
    var cls = winner === 'player' ? 'win' : 'lose';
    var title = winner === 'player' ? '你赢了！' : 'AI 赢了';
    var desc = '第 ' + state.coins.length + ' 次抛硬币后，序列「' +
      PE.formatSeq(last3) + '」出现。';
    resultDiv.innerHTML = '<div class="game-result ' + cls + '"><h3>' + title + '</h3><p>' + desc + '</p></div>';
    resultDiv.style.display = 'block';

    // 按钮状态
    toggleFlipButtons(false);
    document.getElementById('newRoundBtn').style.display = 'inline-flex';

    // 更新多局统计面板
    updateMultiStats();
  }

  window.newRound = function() {
    state.coins = [];
    state.roundOver = false;
    document.getElementById('coinStream').innerHTML = '';
    document.getElementById('roundResult').style.display = 'none';
    document.getElementById('roundResult').innerHTML = '';
    toggleFlipButtons(true);
    document.getElementById('newRoundBtn').style.display = 'none';
  };

  function toggleFlipButtons(enabled) {
    document.getElementById('flipOneBtn').disabled = !enabled;
    document.getElementById('flipAutoBtn').disabled = !enabled;
    document.getElementById('flipFastBtn').disabled = !enabled;
  }

  function updateMultiStats() {
    var panel = document.getElementById('multiStats');
    panel.style.display = 'block';
    document.getElementById('statTotal').textContent = state.totalGames;
    document.getElementById('statPlayerWin').textContent = state.playerWins;
    document.getElementById('statAiWin').textContent = state.aiWins;
    var rate = state.totalGames > 0 ? (state.playerWins / state.totalGames * 100).toFixed(1) + '%' : '0%';
    document.getElementById('statPlayerRate').textContent = rate;

    // 如果打了 5 局以上，给出洞察
    if (state.totalGames >= 5) {
      var insight = document.getElementById('statsInsight');
      insight.style.display = 'block';
      var theoreticalRate = PE.winProbability(state.aiSeq, state.playerSeq);
      var actualRate = state.playerWins / state.totalGames;
      insight.innerHTML = '<h3><i class="ti ti-bulb"></i> 统计洞察</h3><p>理论上你的胜率是 ' +
        PE.formatPct(theoreticalRate) + '，实际打了 ' + state.totalGames + ' 局后你的胜率是 ' +
        PE.formatPct(actualRate) + '。' +
        (state.totalGames < 30 ? '样本还太少，多打几局看看收敛趋势。' : '已接近理论值，后手优势确实存在。') + '</p>';
    }
  }

  // ── 蒙特卡洛模拟 ──
  window.runSimulation = function() {
    var seqA = document.getElementById('simSeqA').value;
    var seqB = document.getElementById('simSeqB').value;
    if (seqA === seqB) {
      alert('两个序列不能相同');
      return;
    }

    var result = PE.simulate(seqA, seqB, 10000);
    var theoretical = PE.winProbability(seqA, seqB);

    var panel = document.getElementById('simResult');
    panel.style.display = 'block';

    document.getElementById('simStats').innerHTML =
      '<div class="stat-card"><div class="val">' + PE.formatPct(result.winRateA) + '</div><div class="label">甲 ' + PE.formatSeq(seqA) + ' 胜率（模拟）</div></div>' +
      '<div class="stat-card"><div class="val">' + PE.formatPct(result.winRateB) + '</div><div class="label">乙 ' + PE.formatSeq(seqB) + ' 胜率（模拟）</div></div>' +
      '<div class="stat-card"><div class="val">' + PE.formatPct(theoretical) + '</div><div class="label">乙理论胜率（Conway）</div></div>' +
      '<div class="stat-card"><div class="val">' + result.avgFlips.toFixed(1) + '</div><div class="label">平均抛硬币次数</div></div>';

    // 绘制直方图
    renderSimChart(result.flipCounts);
  };

  window.useOptimalB = function() {
    var seqA = document.getElementById('simSeqA').value;
    var optimal = PE.optimalCounter(seqA);
    document.getElementById('simSeqB').value = optimal;
  };

  function renderSimChart(flipCounts) {
    var canvas = document.getElementById('simChart');
    var ctx = canvas.getContext('2d');

    // 销毁旧图表
    if (window._simChart) window._simChart.destroy();

    // 构建直方图数据
    var maxFlip = Math.min(Math.max.apply(null, flipCounts), 30);
    var bins = [];
    var labels = [];
    for (var i = 3; i <= maxFlip; i++) {
      labels.push(i);
      bins.push(0);
    }
    flipCounts.forEach(function(f) {
      var idx = Math.min(f, maxFlip) - 3;
      if (idx >= 0 && idx < bins.length) bins[idx]++;
    });

    window.loadChartJS().then(function() {
      window._simChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: '局数',
            data: bins,
            backgroundColor: 'rgba(255,215,0,0.6)',
            borderColor: 'rgba(255,215,0,0.9)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: '每局抛硬币次数分布',
              color: '#a0a0a0',
              font: { size: 13 }
            }
          },
          scales: {
            x: { title: { display: true, text: '抛硬币次数', color: '#888' }, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { title: { display: true, text: '局数', color: '#888' }, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    });
  }

  // ── 胜率矩阵 ──
  function renderMatrix() {
    var seqs = PE.ALL_SEQUENCES;
    var matrix = PE.buildWinMatrix();

    // 找出每列的最优对策（最大值所在行）
    var optimalRow = [];
    for (var j = 0; j < seqs.length; j++) {
      var maxVal = 0;
      var maxIdx = -1;
      for (var i = 0; i < seqs.length; i++) {
        if (i === j) continue;
        if (matrix[i][j] > maxVal) {
          maxVal = matrix[i][j];
          maxIdx = i;
        }
      }
      optimalRow.push(maxIdx);
    }

    var html = '<table class="matrix-table"><thead><tr><th>乙＼甲</th>';
    seqs.forEach(function(s) { html += '<th>' + PE.formatSeq(s) + '</th>'; });
    html += '</tr></thead><tbody>';

    for (var i = 0; i < seqs.length; i++) {
      html += '<tr><th>' + PE.formatSeq(seqs[i]) + '</th>';
      for (var j = 0; j < seqs.length; j++) {
        var val = matrix[i][j];
        var cls = '';
        if (i === j) cls = 'self';
        else if (val >= 0.65) cls = 'win-high';
        else if (val > 0.5) cls = 'win-mid';
        else cls = 'win-low';
        if (optimalRow[j] === i) cls += ' optimal';
        html += '<td class="' + cls + '">' + (i === j ? '—' : PE.formatPct(val)) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('matrixWrap').innerHTML = html;
  }

  // ── 非传递性环 ──
  function renderCycles() {
    // 展示"克制链"：每个序列都有克星
    // THH beats HHH (87.5%), HHH 的最优对策是 THH
    // HHT beats HTH (66.7%), HTH 的最优对策是 HHT
    // 用最优对策关系展示"后手永远有优势"
    var examples = [
      { seq: 'HHH', counter: 'THH', rate: 0.875 },
      { seq: 'HHT', counter: 'THH', rate: 0.75 },
      { seq: 'HTH', counter: 'HHT', rate: 0.667 },
      { seq: 'HTT', counter: 'HHT', rate: 0.667 },
      { seq: 'THH', counter: 'TTH', rate: 0.667 },
      { seq: 'THT', counter: 'TTH', rate: 0.667 },
      { seq: 'TTH', counter: 'HTT', rate: 0.75 },
      { seq: 'TTT', counter: 'HTT', rate: 0.875 }
    ];

    var html = '<div style="overflow-x:auto;"><table class="matrix-table" style="min-width:auto;">';
    html += '<thead><tr><th>先手选</th><th>后手最优对策</th><th>后手胜率</th></tr></thead><tbody>';
    examples.forEach(function(ex) {
      var rateClass = ex.rate >= 0.75 ? 'win-high' : 'win-mid';
      html += '<tr><td>' + PE.formatSeq(ex.seq) + '</td><td style="color:#ff6b81;font-weight:700;">' +
        PE.formatSeq(ex.counter) + '</td><td class="' + rateClass + '">' + PE.formatPct(ex.rate) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="cycle-display" style="margin-top:20px;">';
    html += '<div class="cycle-node">正正正</div>';
    html += '<div class="cycle-arrow">被克</div>';
    html += '<div class="cycle-node" style="border-color:#ff6b81;color:#ff6b81;">反正正</div>';
    html += '<div class="cycle-arrow">被克</div>';
    html += '<div class="cycle-node">反反正</div>';
    html += '<div class="cycle-arrow">被克</div>';
    html += '<div class="cycle-node" style="border-color:#ff6b81;color:#ff6b81;">正反反</div>';
    html += '<div class="cycle-arrow">被克</div>';
    html += '<div class="cycle-node">…</div>';
    html += '</div>';

    html += '<p style="color:#a0a0a0;font-size:0.85rem;text-align:center;margin-top:12px;">无论先手选什么，后手总有一个序列能以至少 2/3 的胜率碾压。没有"最强序列"。</p>';
    document.getElementById('cycleDemo').innerHTML = html;
  }

})();
