(function() {
  // ── 状态 ──────────────────────────────────────────────
  var state = {
    signals: { sliderValue: 50, colorChoice: -1, reactionMs: 0 },
    scanStep: 0,          // 0=slider, 1=color, 2=reaction
    reactionState: 'idle', // idle → waiting → ready → done / too-early
    reactionTimer: null,
    reactionStart: 0,
    prediction: null,      // 'one' | 'two'
    choice: null,          // 'one' | 'two'
    payoff: null,
    globalOneBoxRate: 0.5
  };

  var API_BASE = 'https://numfeel-api.996.ninja';

  // ── 工具 ──────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function showPhase(name) {
    var all = document.querySelectorAll('.phase');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    var el = $('phase-' + name);
    if (el) el.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Phase 1: 开始 ────────────────────────────────────
  window.startGame = function() {
    state.scanStep = 0;
    state.signals = { sliderValue: 50, colorChoice: -1, reactionMs: 0 };
    state.prediction = null;
    state.choice = null;
    state.payoff = null;
    showPhase('scan');
    showScanTask(0);
    loadGlobalStats();
  };

  // ── Phase 2: 行为分析 ────────────────────────────────
  function showScanTask(step) {
    $('task1').style.display = step === 0 ? 'block' : 'none';
    $('task2').style.display = step === 1 ? 'block' : 'none';
    $('task3').style.display = step === 2 ? 'block' : 'none';

    var pct = ((step + 1) / 3 * 100).toFixed(0);
    $('scanBarFill').style.width = (step / 3 * 100) + '%';
    $('scanStatus').textContent = '任务 ' + (step + 1) + ' / 3';

    var btn = $('scanNextBtn');
    if (step === 0) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-arrow-right"></i> 下一步';
    } else if (step === 1) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-arrow-right"></i> 下一步';
    } else if (step === 2) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-arrow-right"></i> 生成预测';
      startReactionTest();
    }
  }

  window.nextScanTask = function() {
    if (state.scanStep === 0) {
      state.signals.sliderValue = parseInt($('scanSlider').value);
      state.scanStep = 1;
      showScanTask(1);
    } else if (state.scanStep === 1) {
      state.scanStep = 2;
      showScanTask(2);
    } else if (state.scanStep === 2) {
      finishScan();
    }
  };

  // 颜色选择
  window.selectColor = function(el) {
    var btns = document.querySelectorAll('.color-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
    el.classList.add('selected');
    state.signals.colorChoice = parseInt(el.dataset.color);
    $('scanNextBtn').disabled = false;
  };

  // 反应速度测试
  function startReactionTest() {
    var area = $('reactionArea');
    state.reactionState = 'waiting';
    area.className = 'reaction-area waiting';
    area.textContent = '等待变绿...';

    var delay = 1500 + Math.random() * 3000;
    state.reactionTimer = setTimeout(function() {
      if (state.reactionState !== 'waiting') return;
      state.reactionState = 'ready';
      state.reactionStart = Date.now();
      area.className = 'reaction-area ready';
      area.textContent = '点击！';
    }, delay);
  }

  window.handleReaction = function() {
    var area = $('reactionArea');
    if (state.reactionState === 'waiting') {
      clearTimeout(state.reactionTimer);
      state.reactionState = 'idle';
      area.className = 'reaction-area too-early';
      area.textContent = '太早了！等变绿再点';
      setTimeout(function() { startReactionTest(); }, 1200);
      return;
    }
    if (state.reactionState === 'ready') {
      var ms = Date.now() - state.reactionStart;
      state.signals.reactionMs = ms;
      state.reactionState = 'done';
      area.className = 'reaction-area done';
      area.textContent = ms + ' ms';
      $('scanNextBtn').disabled = false;
    }
  };

  function finishScan() {
    $('scanBarFill').style.width = '100%';
    $('scanStatus').textContent = '分析完成，正在生成预测...';
    $('scanNextBtn').disabled = true;

    // 计算预测
    var prob = calcOneBoxProbability(state.signals, state.globalOneBoxRate);
    state.prediction = makePrediction(prob);

    setTimeout(function() {
      showPhase('choice');
    }, 1200);
  }

  // ── Phase 3: 选择 ────────────────────────────────────
  window.selectChoice = function(choice) {
    state.choice = choice;
    $('choiceOne').classList.toggle('selected', choice === 'one');
    $('choiceTwo').classList.toggle('selected', choice === 'two');
    $('choiceConfirmBtn').disabled = false;
  };

  window.confirmChoice = function() {
    if (!state.choice) return;
    state.payoff = calcPayoff(state.prediction, state.choice, 1000, 1000000);
    recordChoice();
    showReveal();
  };

  // ── Phase 4: 揭晓 ────────────────────────────────────
  function showReveal() {
    showPhase('reveal');

    var predLabel = state.prediction === 'one' ? '你只拿 B' : '你两个都拿';
    var choiceLabel = state.choice === 'one' ? '只拿 B' : 'A + B 都拿';
    var hit = (state.prediction === 'one' && state.choice === 'one') ||
              (state.prediction === 'two' && state.choice === 'two');

    var amountClass = state.payoff.total >= 1000000 ? 'win' :
                      state.payoff.total >= 1000 ? 'medium' : 'lose';

    var comment = '';
    if (state.choice === 'one' && state.payoff.total === 1000000) {
      comment = '你信任了预测者，预测者也没辜负你。一箱派的经典胜利。';
    } else if (state.choice === 'one' && state.payoff.total === 0) {
      comment = '你信任了预测者，但它猜错了。你两手空空。这就是一箱派的风险。';
    } else if (state.choice === 'two' && state.payoff.total === 1001000) {
      comment = '你拿了两箱，预测者猜错了，你赢了 100.1 万。两箱派的梦想场景——但这种情况极其罕见。';
    } else {
      comment = '你拿了两箱，预测者也猜到了。你只拿到 1000 元。两箱派的典型结局。';
    }

    $('revealHero').innerHTML =
      '<div class="reveal-prediction">预测者的预测：<span>' + predLabel + '</span>' +
        (hit ? ' <i class="ti ti-check" style="color:#4ade80"></i> 命中' : ' <i class="ti ti-x" style="color:#f87171"></i> 未命中') +
      '</div>' +
      '<div style="font-size:0.9rem;color:#a0a0a0;margin-bottom:8px">你的选择：' + choiceLabel + '</div>' +
      '<div class="reveal-result">' +
        '<div class="reveal-amount ' + amountClass + '">¥' + formatMoney(state.payoff.total) + '</div>' +
        '<div class="reveal-breakdown">' +
          '箱子 A：¥' + formatMoney(state.payoff.boxA) +
          ' + 箱子 B：¥' + formatMoney(state.payoff.boxB) +
        '</div>' +
      '</div>' +
      '<div class="reveal-comment">' + comment + '</div>';

    loadGlobalStats();
  }

  // ── Phase 5: 模拟器 ──────────────────────────────────
  window.showSimulator = function() {
    showPhase('simulator');
  };

  window.updateSimLabel = function() {
    $('simAccuracyLabel').textContent = $('simAccuracy').value + '%';
    $('simRoundsLabel').textContent = parseInt($('simRounds').value).toLocaleString() + ' 轮';
  };

  var evChartInstance = null;
  var cumChartInstance = null;

  window.runSim = function() {
    var accuracy = parseInt($('simAccuracy').value) / 100;
    var rounds = parseInt($('simRounds').value);

    var result = runSimulation({
      rounds: rounds,
      accuracy: accuracy,
      boxA: 1000,
      boxB: 1000000
    });

    $('simResults').style.display = 'block';
    $('simOneBoxAvg').textContent = '¥' + formatMoney(result.oneBox.avgEarnings);
    $('simTwoBoxAvg').textContent = '¥' + formatMoney(result.twoBox.avgEarnings);

    var crossover = findCrossoverAccuracy(1000, 1000000);
    $('crossoverNote').innerHTML =
      '当准确率 > <strong>' + (crossover * 100).toFixed(2) + '%</strong> 时，一箱策略的期望值开始超过两箱策略。' +
      '当前准确率 <strong>' + (accuracy * 100).toFixed(1) + '%</strong>，' +
      (accuracy > crossover
        ? '一箱策略平均多赚 <strong style="color:#4ade80">¥' + formatMoney(result.oneBox.avgEarnings - result.twoBox.avgEarnings) + '</strong>。'
        : '两箱策略平均多赚 <strong style="color:#f87171">¥' + formatMoney(result.twoBox.avgEarnings - result.oneBox.avgEarnings) + '</strong>。');

    renderCharts(result, accuracy);
  };

  function renderCharts(simResult, accuracy) {
    if (typeof window.loadChartJS !== 'function') return;

    window.loadChartJS().then(function() {
      // 期望值曲线
      var evData = calcExpectedValueCurve(1000, 1000000);
      var evLabels = evData.map(function(d) { return d.accuracyPct + '%'; });
      var evOne = evData.map(function(d) { return d.oneBoxEV; });
      var evTwo = evData.map(function(d) { return d.twoBoxEV; });

      if (evChartInstance) evChartInstance.destroy();
      evChartInstance = new Chart($('evChart').getContext('2d'), {
        type: 'line',
        data: {
          labels: evLabels,
          datasets: [
            {
              label: '一箱策略',
              data: evOne,
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74,222,128,0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: '两箱策略',
              data: evTwo,
              borderColor: '#f87171',
              backgroundColor: 'rgba(248,113,113,0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#a0a0a0' } },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  return ctx.dataset.label + ': ¥' + formatMoney(ctx.raw);
                }
              }
            },
            annotation: {
              annotations: {
                crossoverLine: {
                  type: 'line',
                  xMin: Math.round(findCrossoverAccuracy(1000, 1000000) * 100) - 50,
                  xMax: Math.round(findCrossoverAccuracy(1000, 1000000) * 100) - 50,
                  borderColor: '#ffd700',
                  borderWidth: 2,
                  borderDash: [6, 4],
                  label: {
                    display: true,
                    content: '交叉点',
                    color: '#ffd700',
                    position: 'start'
                  }
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#a0a0a0',
                maxTicksLimit: 11,
                callback: function(val, idx) { return evLabels[idx]; }
              },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: '预测者准确率', color: '#a0a0a0' }
            },
            y: {
              ticks: {
                color: '#a0a0a0',
                callback: function(v) { return '¥' + formatMoney(v); }
              },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: '期望收益', color: '#a0a0a0' }
            }
          }
        }
      });

      // 累计收益曲线
      var oneData = getCumulativeData(simResult.oneBox.results);
      var twoData = getCumulativeData(simResult.twoBox.results);
      var cumLabels = oneData.map(function(d) { return d.round; });

      if (cumChartInstance) cumChartInstance.destroy();
      cumChartInstance = new Chart($('cumChart').getContext('2d'), {
        type: 'line',
        data: {
          labels: cumLabels,
          datasets: [
            {
              label: '一箱策略累计',
              data: oneData.map(function(d) { return d.cumulative; }),
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74,222,128,0.05)',
              fill: true,
              tension: 0.1,
              pointRadius: 0,
              borderWidth: 2
            },
            {
              label: '两箱策略累计',
              data: twoData.map(function(d) { return d.cumulative; }),
              borderColor: '#f87171',
              backgroundColor: 'rgba(248,113,113,0.05)',
              fill: true,
              tension: 0.1,
              pointRadius: 0,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#a0a0a0' } },
            tooltip: {
              callbacks: {
                title: function(items) { return '第 ' + items[0].label + ' 轮'; },
                label: function(ctx) {
                  return ctx.dataset.label + ': ¥' + formatMoney(ctx.raw);
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#a0a0a0',
                maxTicksLimit: 10,
                callback: function(val) { return val.toLocaleString(); }
              },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: '轮数', color: '#a0a0a0' }
            },
            y: {
              ticks: {
                color: '#a0a0a0',
                callback: function(v) { return '¥' + formatMoney(v); }
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        }
      });
    }).catch(function() {});
  }

  // ── Phase 6: 决策论 ──────────────────────────────────
  window.showTheory = function() {
    showPhase('theory');
  };

  window.switchTheory = function(tab) {
    var tabs = document.querySelectorAll('.theory-tab');
    var contents = document.querySelectorAll('.theory-content');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    for (var i = 0; i < contents.length; i++) contents[i].classList.remove('active');

    var names = ['edt', 'cdt', 'matrix'];
    var idx = names.indexOf(tab);
    if (idx >= 0) {
      tabs[idx].classList.add('active');
      $('theory-' + tab).classList.add('active');
    }
  };

  // ── 重置 ──────────────────────────────────────────────
  window.resetGame = function() {
    state.scanStep = 0;
    state.signals = { sliderValue: 50, colorChoice: -1, reactionMs: 0 };
    state.prediction = null;
    state.choice = null;
    state.payoff = null;
    $('choiceOne').classList.remove('selected');
    $('choiceTwo').classList.remove('selected');
    $('choiceConfirmBtn').disabled = true;
    $('simResults').style.display = 'none';
    showPhase('intro');
  };

  // ── 全站统计 ──────────────────────────────────────────
  function loadGlobalStats() {
    fetch(API_BASE + '/newcomb/stats')
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res.status !== 200 || !res.data) return;
        var d = res.data;

        if (d.total > 0) {
          state.globalOneBoxRate = d.oneBox / d.total;
        }

        $('statPlayers').textContent = d.total || '—';
        $('statOneBox').textContent = d.oneBox || '—';
        $('statTwoBox').textContent = d.twoBox || '—';

        if (d.total > 0) {
          $('statOneBoxPct').textContent = d.oneBoxPct + '%';
          $('statTwoBoxPct').textContent = d.twoBoxPct + '%';
          $('statAccuracy').textContent = d.hitRate + '%';
        }
      })
      .catch(function() {});
  }

  function recordChoice() {
    var hit = (state.prediction === 'one' && state.choice === 'one') ||
              (state.prediction === 'two' && state.choice === 'two');
    try {
      fetch(API_BASE + '/newcomb/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          choice: state.choice,
          prediction: state.prediction,
          hit: hit,
          payoff: state.payoff.total
        })
      }).then(function(r) { return r.json(); })
        .then(function(res) {
          if (res.status === 200 && res.data) {
            var d = res.data;
            $('statPlayers').textContent = d.total || '—';
            $('statOneBox').textContent = d.oneBox || '—';
            $('statTwoBox').textContent = d.twoBox || '—';
            if (d.total > 0) {
              $('statOneBoxPct').textContent = d.oneBoxPct + '%';
              $('statTwoBoxPct').textContent = d.twoBoxPct + '%';
              $('statAccuracy').textContent = d.hitRate + '%';
            }
          }
        }).catch(function() {});
    } catch (e) {}
  }

  // ── 初始化 ────────────────────────────────────────────
  function init() {
    loadGlobalStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
