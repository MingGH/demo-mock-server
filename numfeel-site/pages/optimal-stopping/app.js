// ========== 全局状态 ==========
var game = {
  candidates: [],
  n: 12,
  currentIdx: 0,
  optimalR: 0,
  phase: 'observe', // observe | choose
  bestSoFar: -Infinity,
  chosen: null,
  chosenIdx: -1,
  history: [] // { score, status: 'skipped'|'chosen'|'unseen' }
};

var simChart = null;
var scanChart = null;

// ========== Tab 切换 ==========
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', ['game', 'sim', 'scan'][i] === name);
  });
  document.querySelectorAll('.tab-content').forEach(function(el) {
    el.classList.remove('active');
  });
  document.getElementById('tab-' + name).classList.add('active');
}

// ========== 游戏模式 ==========
function startGame() {
  game.n = parseInt(document.getElementById('gameN').value);
  game.candidates = generateCandidates(game.n);
  game.currentIdx = 0;
  game.optimalR = theoreticalOptimalR(game.n);
  game.phase = 'observe';
  game.bestSoFar = -Infinity;
  game.chosen = null;
  game.chosenIdx = -1;
  game.history = [];

  document.getElementById('gameSetup').style.display = 'none';
  document.getElementById('gamePlay').style.display = '';
  document.getElementById('gameResult').style.display = 'none';
  document.getElementById('totalN').textContent = game.n;

  showCandidate();
}

function showCandidate() {
  var idx = game.currentIdx;
  var score = game.candidates[idx];
  var n = game.n;

  // 计算在已见过的人中的排名
  var seen = game.candidates.slice(0, idx + 1);
  var sorted = seen.slice().sort(function(a, b) { return b - a; });
  var rankAmongSeen = sorted.indexOf(score) + 1;

  // 更新 UI
  document.getElementById('currentIdx').textContent = idx + 1;
  document.getElementById('candidateNum').textContent = '候选人 #' + (idx + 1);
  document.getElementById('candidateDisplay').textContent = score;
  document.getElementById('candidateRank').innerHTML =
    '在已见过的 <strong>' + seen.length + '</strong> 人中排第 <strong>' + rankAmongSeen + '</strong>';

  // 进度条
  var pct = ((idx + 1) / n * 100).toFixed(1);
  var bar = document.getElementById('gameProgress');
  bar.style.width = pct + '%';

  // 阶段判断
  if (idx < game.optimalR) {
    game.phase = 'observe';
    bar.className = 'progress-fill observe';
    document.getElementById('phaseBadge').textContent = '观察期（' + (idx + 1) + '/' + game.optimalR + '）';
    document.getElementById('phaseBadge').className = 'phase-badge phase-observe';
    document.getElementById('btnSkip').style.display = '';
    document.getElementById('btnChoose').style.display = 'none';
    document.getElementById('strategyHint').innerHTML =
      '37%法则建议：前 <strong>' + game.optimalR + '</strong> 位只观察不选。' +
      '你正在看第 ' + (idx + 1) + ' 位，目前最高分 <strong>' + Math.max.apply(null, seen) + '</strong>。继续观察。';
  } else {
    game.phase = 'choose';
    bar.className = 'progress-fill choose';
    document.getElementById('phaseBadge').textContent = '选择期';
    document.getElementById('phaseBadge').className = 'phase-badge phase-choose';
    document.getElementById('btnSkip').style.display = '';
    document.getElementById('btnChoose').style.display = '';

    var shouldChoose = score > game.bestSoFar;
    if (shouldChoose) {
      document.getElementById('strategyHint').innerHTML =
        '37%法则建议：<strong style="color:#81c784;">选 TA！</strong>评分 ' + score +
        ' 超过了观察期最高分 ' + game.bestSoFar + '。';
    } else {
      document.getElementById('strategyHint').innerHTML =
        '37%法则建议：<strong>跳过</strong>。评分 ' + score +
        ' 没超过观察期最高分 ' + game.bestSoFar + '，继续等。';
    }

    // 最后一个人必须选
    if (idx === n - 1) {
      document.getElementById('btnSkip').style.display = 'none';
      document.getElementById('strategyHint').innerHTML =
        '最后一位了，必须选 TA。';
    }
  }

  // 更新 bestSoFar（观察期内的最高分）
  if (idx < game.optimalR && score > game.bestSoFar) {
    game.bestSoFar = score;
  }

  // 动画
  var card = document.getElementById('candidateCard');
  card.style.animation = 'none';
  card.offsetHeight; // reflow
  card.style.animation = 'slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

  updateHistoryStrip();
}

function skipCandidate() {
  game.history.push({ score: game.candidates[game.currentIdx], status: 'skipped' });
  game.currentIdx++;

  if (game.currentIdx >= game.n) {
    // 全部跳过，被迫选最后一个
    game.chosenIdx = game.n - 1;
    game.chosen = game.candidates[game.n - 1];
    game.history[game.history.length - 1].status = 'chosen';
    showResult();
    return;
  }

  showCandidate();
}

function chooseCandidate() {
  game.chosenIdx = game.currentIdx;
  game.chosen = game.candidates[game.currentIdx];
  game.history.push({ score: game.chosen, status: 'chosen' });

  // 标记剩余未见的
  for (var i = game.currentIdx + 1; i < game.n; i++) {
    game.history.push({ score: game.candidates[i], status: 'unseen' });
  }

  showResult();
}

function showResult() {
  document.getElementById('gamePlay').style.display = 'none';
  document.getElementById('gameResult').style.display = '';

  var best = Math.max.apply(null, game.candidates);
  var bestIdx = game.candidates.indexOf(best);

  // 37%法则会选谁
  var optResult = optimalStoppingStrategy(game.candidates, game.optimalR);

  // 你选的排名
  var sortedAll = game.candidates.slice().sort(function(a, b) { return b - a; });
  var yourRank = sortedAll.indexOf(game.chosen) + 1;
  var optRank = sortedAll.indexOf(optResult.chosen) + 1;

  var isBest = game.chosen === best;

  // Banner
  var banner = document.getElementById('resultBanner');
  if (isBest) {
    banner.className = 'result-banner win';
    document.getElementById('resultEmoji').textContent = '🎉';
    document.getElementById('resultTitle').textContent = '选到了最佳候选人！';
    document.getElementById('resultDesc').textContent =
      '你选的评分 ' + game.chosen + ' 就是全场最高分。';
  } else {
    banner.className = 'result-banner lose';
    document.getElementById('resultEmoji').textContent = yourRank <= 3 ? '😏' : '😅';
    document.getElementById('resultTitle').textContent =
      yourRank <= 3 ? '差一点点' : '错过了最佳';
    document.getElementById('resultDesc').textContent =
      '你选的评分 ' + game.chosen + '，排第 ' + yourRank + '/' + game.n +
      '。最佳是 ' + best + '（第 ' + (bestIdx + 1) + ' 位出场）。';
  }

  // 对比卡片
  document.getElementById('resYouScore').textContent = game.chosen;
  document.getElementById('resYouRank').textContent = '第 ' + yourRank + '/' + game.n + ' 名';
  document.getElementById('resOptScore').textContent = optResult.chosen;
  document.getElementById('resOptRank').textContent =
    '第 ' + optRank + '/' + game.n + ' 名' + (optResult.isBest ? ' ✓' : '');
  document.getElementById('resBestScore').textContent = best;
  document.getElementById('resBestRank').textContent = '第 ' + (bestIdx + 1) + ' 位出场';

  // 完整历史条
  var strip = document.getElementById('resultStrip');
  strip.innerHTML = '';
  for (var i = 0; i < game.n; i++) {
    var s = game.candidates[i];
    var status = i < game.history.length ? game.history[i].status : 'unseen';
    var dot = document.createElement('span');
    dot.className = 'history-dot ' + status;
    if (s === best) dot.className += ' best';
    dot.textContent = s;
    dot.title = '候选人 #' + (i + 1) + '：评分 ' + s +
      (status === 'chosen' ? '（你选的）' : status === 'skipped' ? '（跳过）' : '（未见）');
    strip.appendChild(dot);
  }

  document.getElementById('gameSetup').style.display = '';
}

function updateHistoryStrip() {
  var strip = document.getElementById('historyStrip');
  strip.innerHTML = '';
  for (var i = 0; i < game.history.length; i++) {
    var dot = document.createElement('span');
    dot.className = 'history-dot ' + game.history[i].status;
    dot.textContent = game.history[i].score;
    strip.appendChild(dot);
  }
  // 当前位置指示
  var cur = document.createElement('span');
  cur.className = 'history-dot';
  cur.style.background = 'rgba(255,215,0,0.3)';
  cur.style.color = '#ffd700';
  cur.style.border = '2px dashed #ffd700';
  cur.textContent = '?';
  strip.appendChild(cur);
}

// ========== 蒙特卡洛模拟 ==========
function runSim() {
  var n = parseInt(document.getElementById('simN').value);
  var count = parseInt(document.getElementById('simCount').value);

  if (n < 3 || n > 200) { alert('候选人数量请在 3~200 之间'); return; }

  document.getElementById('simBtn').disabled = true;
  document.getElementById('simBtn').innerHTML = '<i class="ti ti-loader"></i> 模拟中…';

  setTimeout(function() {
    var result = runSimulation(n, count);

    // 统计卡片
    document.getElementById('simStats').style.display = '';
    document.getElementById('simStats').innerHTML =
      '<div class="stat-card"><div class="val">' + (result.optimal * 100).toFixed(1) + '%</div><div class="lbl">37%法则</div></div>' +
      '<div class="stat-card"><div class="val">' + (result.random * 100).toFixed(1) + '%</div><div class="lbl">随机选</div></div>' +
      '<div class="stat-card"><div class="val">' + (result.first * 100).toFixed(1) + '%</div><div class="lbl">选第一个</div></div>' +
      '<div class="stat-card"><div class="val">' + (result.last * 100).toFixed(1) + '%</div><div class="lbl">选最后一个</div></div>';

    // 图表
    if (simChart) { simChart.destroy(); simChart = null; }
    var ctx = document.getElementById('simChart').getContext('2d');
    simChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['37%法则\n(跳过' + result.optimalR + '人)', '随机选', '选第一个', '选最后一个'],
        datasets: [{
          data: [result.optimal * 100, result.random * 100, result.first * 100, result.last * 100],
          backgroundColor: [
            'rgba(255,215,0,0.7)',
            'rgba(33,150,243,0.5)',
            'rgba(156,39,176,0.5)',
            'rgba(255,152,0,0.5)'
          ],
          borderColor: ['#ffd700', '#2196f3', '#9c27b0', '#ff9800'],
          borderWidth: 2,
          borderRadius: 8,
          barPercentage: 0.6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.raw.toFixed(1) + '% 选到最佳'; }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#c0c0c0', font: { size: 12 } }, grid: { display: false } },
          y: {
            ticks: { color: '#888', callback: function(v) { return v + '%'; } },
            grid: { color: 'rgba(255,255,255,0.05)' },
            min: 0
          }
        }
      }
    });

    // 洞察
    var theoryRate = theoreticalSuccessRate(n, result.optimalR);
    document.getElementById('simInsight').style.display = '';
    document.getElementById('simInsightText').innerHTML =
      n + ' 个候选人，模拟 ' + count.toLocaleString() + ' 次。' +
      '37%法则（跳过前 ' + result.optimalR + ' 人）的成功率为 <strong>' + (result.optimal * 100).toFixed(1) + '%</strong>，' +
      '理论值为 ' + (theoryRate * 100).toFixed(1) + '%。' +
      '随机选的成功率只有 ' + (result.random * 100).toFixed(1) + '%（理论值 ' + (100 / n).toFixed(1) + '%）。' +
      '<br>37%法则的成功率是随机选的 <strong>' + (result.optimal / result.random).toFixed(1) + ' 倍</strong>。';

    document.getElementById('simBtn').disabled = false;
    document.getElementById('simBtn').innerHTML = '<i class="ti ti-player-play"></i> 重新模拟';
  }, 50);
}

// ========== 参数扫描 ==========
function runScan() {
  var n = parseInt(document.getElementById('scanN').value);
  var count = parseInt(document.getElementById('scanCount').value);

  if (n < 5 || n > 200) { alert('候选人数量请在 5~200 之间'); return; }

  document.getElementById('scanBtn').disabled = true;
  document.getElementById('scanBtn').innerHTML = '<i class="ti ti-loader"></i> 扫描中…';

  setTimeout(function() {
    var result = scanSkipRatios(n, count);

    // 理论曲线
    var theoryRates = result.ratios.map(function(pct) {
      var r = Math.round(n * pct / 100);
      return theoreticalSuccessRate(n, r) * 100;
    });

    if (scanChart) { scanChart.destroy(); scanChart = null; }
    var ctx = document.getElementById('scanChart').getContext('2d');
    scanChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: result.ratios.map(function(r) { return r + '%'; }),
        datasets: [
          {
            label: '模拟成功率',
            data: result.rates.map(function(r) { return r * 100; }),
            borderColor: '#ffd700', backgroundColor: 'rgba(255,215,0,0.08)',
            fill: true, pointRadius: 2, tension: 0.3, borderWidth: 2.5
          },
          {
            label: '理论成功率',
            data: theoryRates,
            borderColor: '#81c784', backgroundColor: 'transparent',
            fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2,
            borderDash: [6, 3]
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c0c0c0', font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw.toFixed(1) + '%'; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '跳过比例', color: '#888' },
            ticks: { color: '#888', maxTicksLimit: 11 },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: '选到最佳的概率', color: '#888' },
            ticks: { color: '#888', callback: function(v) { return v + '%'; } },
            grid: { color: 'rgba(255,255,255,0.05)' },
            min: 0
          }
        }
      }
    });

    document.getElementById('scanInsight').style.display = '';
    document.getElementById('scanInsightText').innerHTML =
      '模拟峰值在跳过 <strong>' + result.bestRatio + '%</strong> 时，成功率 <strong>' +
      (result.bestRate * 100).toFixed(1) + '%</strong>。' +
      '理论最优跳过比例为 1/e ≈ 36.8%。' +
      '<br>曲线两端都很低：跳过太少（标准不够），跳过太多（好的都错过了）。37% 附近是甜蜜点。';

    document.getElementById('scanBtn').disabled = false;
    document.getElementById('scanBtn').innerHTML = '<i class="ti ti-player-play"></i> 重新扫描';
  }, 50);
}
