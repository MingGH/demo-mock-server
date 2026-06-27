/**
 * app.js — 赌徒错觉模拟器 UI 层
 * 依赖：engine.js（浏览器通过 <script> 引入）、Chart.js（通过 loadChartJS 加载）
 *
 * 全局挂载到 window.GamblersFallacy，方便事件绑定。
 */
(function () {
  'use strict';

  var currentMode = 'original'; // 'original' | 'modified'
  var currentTab = 'population'; // 'population' | 'solo'
  var popChart = null;
  var soloChart = null;
  var soloState = { capital: 100, round: 0, wins: 0, losses: 0, history: [100], streak: 0, streakType: null };
  var MAX_SOLO_ROUNDS = 50;

  // ── DOM 引用 ──
  var els = {};

  function cacheDom() {
    els.hero = document.getElementById('gf-hero');
    els.ctaBtn = document.getElementById('gf-cta-btn');
    els.results = document.getElementById('gf-results');

    els.popTab = document.getElementById('gf-tab-pop');
    els.soloTab = document.getElementById('gf-tab-solo');
    els.popPanel = document.getElementById('gf-panel-pop');
    els.soloPanel = document.getElementById('gf-panel-solo');

    els.modeBtnOrig = document.getElementById('gf-mode-orig');
    els.modeBtnMod = document.getElementById('gf-mode-mod');

    els.roundsSlider = document.getElementById('gf-rounds-slider');
    els.roundsVal = document.getElementById('gf-rounds-val');
    els.runBtn = document.getElementById('gf-run-btn');

    els.statMean = document.getElementById('gf-stat-mean');
    els.statMedian = document.getElementById('gf-stat-median');
    els.statGeo = document.getElementById('gf-stat-geo');
    els.statLost = document.getElementById('gf-stat-lost');
    els.insightBar = document.getElementById('gf-insight-bar');

    els.moreToggle = document.getElementById('gf-more-toggle');
    els.moreContent = document.getElementById('gf-more-content');

    els.soloCapital = document.getElementById('gf-solo-capital');
    els.soloRound = document.getElementById('gf-solo-round');
    els.soloStreak = document.getElementById('gf-solo-streak');
    els.soloResult = document.getElementById('gf-solo-result');
    els.soloComment = document.getElementById('gf-solo-comment');
    els.betBtn = document.getElementById('gf-bet-btn');
    els.resetSoloBtn = document.getElementById('gf-reset-solo');
    els.soloWinMul = document.getElementById('gf-solo-winmul');
  }

  // ── 随机幽默评论 ──
  var soloComments = {
    winStreak: [
      '连赢了，但别膨胀。',
      '运气好而已，别以为自己是赌神。',
      '下一把可能就还回去了。'
    ],
    loseStreak: [
      '正常。大部分人都是这个剧本。',
      '别慌，算术期望还在你这边。',
      '连续输 ≠ 下一局一定赢，记住。'
    ],
    bigWin: [
      '这把运气不错。',
      '暴富的感觉，但再来几次可能就没了。'
    ],
    bigLose: [
      '这一下挺疼。',
      '资金缩水很真实。'
    ],
    neutral: [
      '输输赢赢，输输输赢…大概就是这个节奏。',
      '单个赌局公平，赌多了就不一定了。'
    ]
  };

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getSoloComment(isWin, streak, streakType) {
    if (streak >= 3 && streakType === 'win') return pickRandom(soloComments.winStreak);
    if (streak >= 3 && streakType === 'lose') return pickRandom(soloComments.loseStreak);
    if (isWin) return pickRandom(soloComments.bigWin);
    return pickRandom(soloComments.bigLose);
  }

  // ── 初始化 ──
  function init() {
    cacheDom();
    bindEvents();

    // 默认跑一次，让首次进入的用户点 CTA 后马上看到结果
    // 但首次不自动跑；CTA 按钮触发时再跑
  }

  function bindEvents() {
    els.ctaBtn.addEventListener('click', onCtaClick);
    els.runBtn.addEventListener('click', runPopulation);
    els.betBtn.addEventListener('click', onSoloBet);
    els.resetSoloBtn.addEventListener('click', resetSolo);

    els.popTab.addEventListener('click', function () { switchTab('population'); });
    els.soloTab.addEventListener('click', function () { switchTab('solo'); });

    els.modeBtnOrig.addEventListener('click', function () { switchMode('original'); });
    els.modeBtnMod.addEventListener('click', function () { switchMode('modified'); });

    els.roundsSlider.addEventListener('input', function () {
      els.roundsVal.textContent = els.roundsSlider.value;
    });

    els.moreToggle.addEventListener('click', function () {
      var open = els.moreContent.classList.toggle('open');
      els.moreToggle.querySelector('span').textContent = open ? '收起' : '了解更多';
    });
  }

  // ── CTA 点击：首屏过渡到结果 ──
  function onCtaClick() {
    els.hero.classList.add('faded');
    setTimeout(function () {
      els.hero.style.display = 'none';
      els.results.classList.add('visible');
      runPopulation();
    }, 500);
  }

  // ── 模式切换 ──
  function switchMode(mode) {
    currentMode = mode;
    els.modeBtnOrig.classList.toggle('active', mode === 'original');
    els.modeBtnMod.classList.toggle('active', mode === 'modified');
    runPopulation();
  }

  function getMultipliers() {
    if (currentMode === 'original') {
      return { win: 1.5, lose: 0.5, label: '×1.5 / ×0.5' };
    }
    return { win: 2.0, lose: 0.5, label: '×2 / ×0.5' };
  }

  // ── Tab 切换 ──
  function switchTab(tab) {
    currentTab = tab;
    els.popTab.classList.toggle('active', tab === 'population');
    els.soloTab.classList.toggle('active', tab === 'solo');
    els.popPanel.classList.toggle('active', tab === 'population');
    els.soloPanel.classList.toggle('active', tab === 'solo');
  }

  // ── 群体模拟 ──
  function runPopulation() {
    if (typeof simulatePopulation === 'undefined') {
      els.insightBar.textContent = '引擎未加载，请刷新页面重试。';
      return;
    }

    var rounds = parseInt(els.roundsSlider.value, 10);
    var mul = getMultipliers();
    var pop = simulatePopulation(5000, rounds, mul.win, mul.lose);

    // 更新统计数字
    els.statMean.textContent = pop.mean.toFixed(2);
    els.statMedian.textContent = pop.median.toPrecision(3);
    els.statGeo.textContent = pop.geoMean.toPrecision(3);
    els.statLost.textContent = Math.round((pop.lost / pop.size) * 100) + '%';

    // 洞察条
    var insightText = currentMode === 'original'
      ? '算术均值≈1（公平），但' + Math.round((pop.lost / pop.size) * 100) + '%的人亏了。少数暴富者拉高了均值。'
      : '算术均值>1（有利庄家），几何均值≈1。赢的人赢很多，输的人只输一点。';
    els.insightBar.textContent = insightText;

    // 画直方图
    drawHistogram(pop);
  }

  function drawHistogram(pop) {
    if (typeof buildHistogram === 'undefined') return;

    var hist = buildHistogram(pop.results, 35);
    var labels = [];
    var data = [];
    for (var i = 0; i < hist.buckets.length; i++) {
      if (hist.buckets[i].count > 0 || i < 5 || i > hist.buckets.length - 5) {
        labels.push(hist.buckets[i].label);
        data.push(hist.buckets[i].count);
      }
    }

    if (typeof loadChartJS === 'function') {
      loadChartJS().then(function () {
        renderPopChart(labels, data, pop);
      });
    } else if (typeof Chart !== 'undefined') {
      renderPopChart(labels, data, pop);
    }
  }

  function renderPopChart(labels, data, pop) {
    var ctx = document.getElementById('gf-pop-chart');
    if (!ctx) return;
    if (popChart) popChart.destroy();

    var mul = getMultipliers();
    var meanLine = pop.mean;
    var medianLine = pop.median;

    popChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '人数',
          data: data,
          backgroundColor: function (context) {
            var val = parseFloat(labels[context.dataIndex]);
            if (isNaN(val)) return 'rgba(201, 107, 51, 0.5)';
            if (val < 0.99) return 'rgba(224, 85, 85, 0.5)';
            if (val > 1.01) return 'rgba(136, 149, 74, 0.5)';
            return 'rgba(242, 228, 207, 0.25)';
          },
          borderColor: 'rgba(242, 228, 207, 0.08)',
          borderWidth: 1,
          borderRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.raw + ' 人';
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: '最终资金（对数尺度）',
              color: 'rgba(242, 228, 207, 0.4)',
              font: { size: 11 }
            },
            ticks: {
              color: 'rgba(242, 228, 207, 0.35)',
              font: { size: 9 },
              maxTicksLimit: 12,
              autoSkip: true
            },
            grid: { color: 'rgba(242, 228, 207, 0.04)' }
          },
          y: {
            title: {
              display: true,
              text: '人数',
              color: 'rgba(242, 228, 207, 0.4)',
              font: { size: 11 }
            },
            ticks: {
              color: 'rgba(242, 228, 207, 0.35)',
              font: { size: 10 }
            },
            grid: { color: 'rgba(242, 228, 207, 0.04)' }
          }
        }
      }
    });
  }

  // ── 单人模式 ──
  function getSoloWinMul() {
    var val = parseFloat(els.soloWinMul.value);
    if (isNaN(val) || val < 0.6) return 0.6;
    if (val > 10) return 10;
    return val;
  }

  function onSoloBet() {
    if (soloState.round >= MAX_SOLO_ROUNDS) return;

    var winMul = getSoloWinMul();
    var loseMul = 0.5;
    var isWin = Math.random() < 0.5;

    if (isWin) {
      soloState.capital *= winMul;
      soloState.wins++;
      if (soloState.streakType === 'win') {
        soloState.streak++;
      } else {
        soloState.streak = 1;
        soloState.streakType = 'win';
      }
    } else {
      soloState.capital *= loseMul;
      soloState.losses++;
      if (soloState.streakType === 'lose') {
        soloState.streak++;
      } else {
        soloState.streak = 1;
        soloState.streakType = 'lose';
      }
    }

    soloState.round++;
    soloState.history.push(soloState.capital);

    updateSoloUI(isWin);

    if (soloState.round >= MAX_SOLO_ROUNDS) {
      els.betBtn.disabled = true;
      els.betBtn.textContent = '已满' + MAX_SOLO_ROUNDS + '局';
      els.soloComment.textContent = '50局结束。翻到上面看看1000人的数据？';
    }
  }

  function updateSoloUI(isWin) {
    var showDollar = soloState.capital > 0.01 ? soloState.capital.toFixed(2) : soloState.capital.toFixed(6);

    // 资金数字跳动
    els.soloCapital.textContent = showDollar;
    els.soloCapital.style.transform = 'scale(1.15)';
    setTimeout(function () { els.soloCapital.style.transform = 'scale(1)'; }, 150);

    els.soloRound.textContent = '第 ' + soloState.round + ' 局 | 赢' + soloState.wins + ' 输' + soloState.losses;

    // 连胜/连败提示
    if (soloState.streak >= 3 && soloState.streakType === 'win') {
      els.soloStreak.textContent = '连胜 ' + soloState.streak + ' 局';
      els.soloStreak.style.color = '#88954a';
    } else if (soloState.streak >= 3 && soloState.streakType === 'lose') {
      els.soloStreak.textContent = '连输 ' + soloState.streak + ' 局';
      els.soloStreak.style.color = '#e05555';
    } else {
      els.soloStreak.textContent = '';
      els.soloStreak.style.color = '';
    }

    // 结果标签动画
    els.soloResult.textContent = isWin ? '赢！×' + getSoloWinMul() : '输…×0.5';
    els.soloResult.className = 'gf-solo-result ' + (isWin ? 'win' : 'lose') + ' show';
    setTimeout(function () { els.soloResult.classList.remove('show'); }, 2000);

    // 评论
    els.soloComment.textContent = getSoloComment(isWin, soloState.streak, soloState.streakType);

    // 更新走势图
    drawSoloChart();
  }

  function resetSolo() {
    soloState = { capital: 100, round: 0, wins: 0, losses: 0, history: [100], streak: 0, streakType: null };
    els.soloCapital.textContent = '100';
    els.soloCapital.style.transform = 'scale(1)';
    els.soloRound.textContent = '准备开始';
    els.soloStreak.textContent = '';
    els.soloResult.className = 'gf-solo-result';
    els.soloResult.textContent = '';
    els.soloComment.textContent = '';
    els.betBtn.disabled = false;
    els.betBtn.textContent = '下注';
    if (soloChart) { soloChart.destroy(); soloChart = null; }
  }

  function drawSoloChart() {
    if (typeof loadChartJS === 'function') {
      loadChartJS().then(function () {
        renderSoloChart();
      });
    } else if (typeof Chart !== 'undefined') {
      renderSoloChart();
    }
  }

  function renderSoloChart() {
    var ctx = document.getElementById('gf-solo-chart');
    if (!ctx) return;
    if (soloChart) soloChart.destroy();

    var labels = [];
    for (var i = 0; i < soloState.history.length; i++) {
      labels.push(i);
    }

    soloChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '资金',
          data: soloState.history,
          borderColor: '#c96b33',
          backgroundColor: 'rgba(201, 107, 51, 0.1)',
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2
        }, {
          label: '起点 (100)',
          data: Array(soloState.history.length).fill(100),
          borderColor: 'rgba(242, 228, 207, 0.15)',
          borderDash: [6, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: 'rgba(242, 228, 207, 0.6)',
              font: { size: 11 },
              usePointStyle: true,
              boxWidth: 8
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '局数', color: 'rgba(242, 228, 207, 0.4)', font: { size: 11 } },
            ticks: { color: 'rgba(242, 228, 207, 0.35)', font: { size: 10 } },
            grid: { color: 'rgba(242, 228, 207, 0.04)' }
          },
          y: {
            title: { display: true, text: '资金', color: 'rgba(242, 228, 207, 0.4)', font: { size: 11 } },
            ticks: { color: 'rgba(242, 228, 207, 0.35)', font: { size: 10 } },
            grid: { color: 'rgba(242, 228, 207, 0.04)' }
          }
        }
      }
    });
  }

  // ── 启动 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
