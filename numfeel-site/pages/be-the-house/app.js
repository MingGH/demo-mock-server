/**
 * app.js - 当一次庄家：视图层
 * 负责：DOM 绑定、Chart.js 渲染、GSAP 动画、事件处理
 * 所有数学逻辑都来自 engine.js，本文件不重新实现任何公式
 */

(function () {
  'use strict';

  // ============================================================
  // 全局状态
  // ============================================================
  var state = {
    currentEdge: 1 / 37,         // 当前选中的庄家优势（默认欧式轮盘 2.70%）
    currentEdgeId: 'european-roulette',
    currentN: 1000,              // 模块二手数
    curveChart: null,
    distN100Chart: null,
    distN1MChart: null,
    grChart: null,
    mgChart: null,
    grStep: 0,                   // 模块三：0=未跑, 1/100/10000
    grRunning: false,            // 模块三：分块模拟进行中
    mgNoLimit: null,             // 模块四：第 1 步（无桌限）的结果，供第 2/3 步复用
    mgLimited: null
  };

  // ============================================================
  // 工具函数
  // ============================================================
  function el(id) { return document.getElementById(id); }
  function fmtPct(x, digits) {
    if (digits === undefined) digits = 2;
    return (x * 100).toFixed(digits) + '%';
  }
  function fmtNum(x, digits) {
    if (digits === undefined) digits = 1;
    if (Math.abs(x) >= 1000) return x.toFixed(0);
    if (Math.abs(x) >= 10) return x.toFixed(1);
    return x.toFixed(digits);
  }
  function fmtMoney(x) {
    var n = Math.round(x);
    return '$' + n.toLocaleString('en-US');
  }
  function fmtSigned(n) {
    if (n > 0) return '+$' + Math.round(n).toLocaleString('en-US');
    if (n < 0) return '−$' + Math.abs(Math.round(n)).toLocaleString('en-US');
    return '$0';
  }
  function setText(id, text) { var n = el(id); if (n) n.textContent = text; }
  function showToast(msg) {
    var t = el('bh-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // ============================================================
  // 模块一：庄家优势对照卡
  // ============================================================
  function renderEdgeGrid() {
    var grid = el('bh-edge-grid');
    if (!grid) return;
    var edges = window.bhEngine.edgeTable();
    grid.innerHTML = '';
    edges.forEach(function (e) {
      var card = document.createElement('div');
      card.className = 'bh-edge-card' + (e.id === state.currentEdgeId ? ' active' : '');
      card.dataset.edgeId = e.id;
      card.innerHTML =
        '<div class="bh-edge-name">' + e.name + '</div>' +
        '<div class="bh-edge-pct">' + (e.edge * 100).toFixed(2) + '%</div>' +
        '<div class="bh-edge-calc">计算: ' + e.calc + '</div>';
      card.addEventListener('click', function () {
        state.currentEdge = e.edge;
        state.currentEdgeId = e.id;
        // 更新 UI
        document.querySelectorAll('.bh-edge-card').forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        // 同步到模块二
        el('bh-edge-slider').value = (e.edge * 100).toFixed(2);
        el('bh-edge-slider-val').textContent = (e.edge * 100).toFixed(2) + '%';
        setText('bh-current-edge', (e.edge * 100).toFixed(2) + '%');
        refreshLLN();
        // 同步到模块三
        var grEdge = el('bh-gr-edge');
        if (grEdge) grEdge.textContent = (e.edge * 100).toFixed(2) + '%';
        refreshGRStats();
        // GSAP 提示
        if (window.gsap) {
          gsap.fromTo(card, { scale: 1 }, { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1 });
        }
      });
      grid.appendChild(card);
    });
  }

  // ============================================================
  // 模块二：大数定律曲线
  // ============================================================
  function renderCurveChart() {
    var canvas = el('bh-curve-chart');
    if (!canvas || !window.Chart) return;
    if (state.curveChart) state.curveChart.destroy();

    var edge = state.currentEdge;
    var curve = window.bhEngine.profitProbabilityCurve(edge, 1, 80);
    var labels = curve.map(function (p) { return p.n; });
    var data = curve.map(function (p) { return p.prob * 100; });

    // 锚点数据（edge=1% 时 4 个手数）
    var anchorNs = [100, 1000, 10000, 1000000];
    var anchorProbs = anchorNs.map(function (n) {
      return window.bhEngine.playerProfitProbability(0.01, n, 1) * 100;
    });

    state.curveChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '玩家盈利概率（当前 edge）',
            data: data,
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.12)',
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2
          },
          {
            label: 'edge=1% 锚点',
            data: anchorNs.map(function (n, i) { return { x: n, y: anchorProbs[i] }; }),
            borderColor: '#a855f7',
            backgroundColor: '#a855f7',
            showLine: false,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: 'rectRot',
            parsing: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: 'rgba(255,255,255,0.7)', font: { size: 12 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,30,0.95)',
            titleColor: '#fbbf24',
            bodyColor: '#f1ecdf',
            callbacks: {
              title: function (items) { return 'n = ' + Number(items[0].label).toLocaleString(); },
              label: function (ctx) { return ctx.dataset.label + '：' + ctx.parsed.y.toFixed(2) + '%'; }
            }
          }
        },
        scales: {
          x: {
            type: 'logarithmic',
            min: 10,
            max: 1000000,
            title: { display: true, text: '手数 n（对数刻度）', color: 'rgba(255,255,255,0.5)' },
            ticks: {
              color: 'rgba(255,255,255,0.5)',
              callback: function (v) {
                var allowed = [10, 100, 1000, 10000, 100000, 1000000];
                if (allowed.indexOf(v) >= 0) return v.toLocaleString();
                return null;
              }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: '玩家盈利概率', color: 'rgba(255,255,255,0.5)' },
            ticks: { color: 'rgba(255,255,255,0.5)', callback: function (v) { return v + '%'; } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  function refreshLLN() {
    var edge = state.currentEdge;
    var n = state.currentN;
    var s = window.bhEngine.llnStats(edge, n, 1);
    setText('bh-stat-profit-prob', fmtPct(s.profitProb, 1));
    setText('bh-stat-exp-loss', fmtNum(s.expectedLoss, 1));
    setText('bh-stat-stdev', fmtNum(s.stdDev, 1));
    setText('bh-current-edge', (edge * 100).toFixed(2) + '%');
    // 更新 chart
    var curve = window.bhEngine.profitProbabilityCurve(edge, 1, 80);
    if (state.curveChart) {
      state.curveChart.data.datasets[0].data = curve.map(function (p) { return p.prob * 100; });
      state.curveChart.data.datasets[0].label = '玩家盈利概率（edge=' + (edge * 100).toFixed(2) + '%）';
      state.curveChart.update('none');
    }
  }

  function initLLNDistChart(canvasId, simData) {
    var canvas = el(canvasId);
    if (!canvas) return null;
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: simData.bins.map(function (b) { return b.label; }),
        datasets: [{
          label: '样本数',
          data: simData.bins.map(function (b) { return b.count; }),
          backgroundColor: 'rgba(96, 165, 250, 0.7)',
          borderColor: '#60a5fa',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(20,20,30,0.95)',
            titleColor: '#60a5fa',
            callbacks: {
              title: function (items) { return '收益区间 ≈ ' + items[0].label; },
              label: function (ctx) { return ctx.parsed.y + ' 人'; }
            }
          }
        },
        scales: {
          x: { ticks: { color: 'rgba(255,255,255,0.4)', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  function runLLNDistribution() {
    var edge = state.currentEdge;
    var rng = window.bhEngine.mulberry32(Date.now() & 0xFFFFFFFF);
    // n=100 样本
    var sim100 = window.bhEngine.simulateProfitDistribution(edge, 100, 5000, rng);
    // n=1,000,000 样本（用正态近似）
    var sim1m = window.bhEngine.simulateProfitDistribution(edge, 1000000, 5000, rng);
    if (state.distN100Chart) state.distN100Chart.destroy();
    if (state.distN1MChart) state.distN1MChart.destroy();
    state.distN100Chart = initLLNDistChart('bh-dist-n100', sim100);
    state.distN1MChart = initLLNDistChart('bh-dist-n1m', sim1m);
  }

  // ============================================================
  // 模块三：赌徒破产
  // ============================================================
  function refreshGRStats() {
    var player = Number(el('bh-gr-player').value);
    var house = Number(el('bh-gr-house').value);
    var p = window.bhEngine.gamblerRuinProbability(player, house, state.currentEdge);
    setText('bh-gr-analytical', fmtPct(p, 2));
    setText('bh-gr-edge', (state.currentEdge * 100).toFixed(2) + '%');
  }

  function renderGRChart(latestResult) {
    var wrap = el('bh-gr-chart-wrap');
    var canvas = el('bh-gr-chart');
    if (!canvas || !window.Chart) return;
    wrap.style.display = 'block';
    if (state.grChart) state.grChart.destroy();

    // 画一条代表性轨迹 + 期望路径 / ±2σ 带。
    // 轨迹是抽稀过的，第 i 个采样点对应第 i*stride 手，标签和统计量都要按真实手数走。
    var player = Number(el('bh-gr-player').value);
    var entry = (latestResult.trajectories || [])[0];
    if (!entry) { wrap.style.display = 'none'; return; }
    var traj = entry.points || [];
    var stride = entry.stride || 1;
    var roundAt = function (i) { return i * stride; };
    var labels = traj.map(function (_, i) { return roundAt(i); });
    var expLine = traj.map(function (_, i) { return player - state.currentEdge * roundAt(i); });
    var sigmaAt = function (i) { return window.bhEngine.llnStats(state.currentEdge, roundAt(i), 1).stdDev; };
    var upper = traj.map(function (_, i) { return expLine[i] + 2 * sigmaAt(i); });
    var lower = traj.map(function (_, i) { return Math.max(0, expLine[i] - 2 * sigmaAt(i)); });

    state.grChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '玩家资金轨迹（最近 1 人）',
            data: traj,
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.05)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.05,
            fill: false
          },
          {
            label: '期望路径',
            data: expLine,
            borderColor: '#60a5fa',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
          },
          {
            label: '±2σ 范围',
            data: upper,
            borderColor: 'rgba(168, 85, 247, 0.5)',
            borderWidth: 1,
            pointRadius: 0,
            backgroundColor: 'rgba(168, 85, 247, 0.08)',
            fill: '+1'
          },
          {
            label: '_lower',
            data: lower,
            borderColor: 'rgba(168, 85, 247, 0.5)',
            borderWidth: 1,
            pointRadius: 0,
            backgroundColor: 'rgba(168, 85, 247, 0.08)',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(20,20,30,0.95)',
            callbacks: { title: function (items) { return '第 ' + items[0].label + ' 手'; } }
          }
        },
        scales: {
          x: { title: { display: true, text: '手数', color: 'rgba(255,255,255,0.5)' }, ticks: { color: 'rgba(255,255,255,0.4)', maxTicksLimit: 6 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { title: { display: true, text: '玩家资金', color: 'rgba(255,255,255,0.5)' }, ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // 分块跑，避免大批量模拟把主线程锁死
  function runGRStep(count) {
    if (state.grRunning) return;
    var player = Number(el('bh-gr-player').value);
    var house = Number(el('bh-gr-house').value);
    var edge = state.currentEdge;
    var rng = window.bhEngine.mulberry32(42 + count + Date.now() % 1000);

    // 手数预算：既要够走到吸收，又不能把主线程占死。
    // 下行漂移下走到破产的期望手数约为 玩家本金 / 庄家优势，取 4 倍留余量；
    // 再用总步数封顶，庄家资金极大 / 优势极小时宁可如实报「未定局」。
    var stepBudget = 60000000;
    var needed = Math.ceil(4 * player / Math.max(edge, 1e-6));
    var maxRounds = Math.min(
      Math.max(2000, Math.floor(stepBudget / Math.max(1, count))),
      Math.max(2000, needed)
    );
    var chunk = count <= 100 ? count : Math.max(25, Math.floor(count / 40));

    var agg = { ruinCount: 0, ceilingCount: 0, unabsorbedCount: 0, totalRounds: 0, done: 0, trajectories: [] };
    var stepResult = el('bh-gr-step-result');
    if (stepResult) stepResult.style.display = 'block';
    state.grRunning = true;

    document.querySelectorAll('#bh-gr-steps .bh-step-btn').forEach(function (b) { b.classList.remove('active'); });
    var activeBtn = document.querySelector('#bh-gr-steps .bh-step-btn[data-step="' + count + '"]');
    if (activeBtn) activeBtn.classList.add('active');

    function renderProgress() {
      if (!stepResult) return;
      stepResult.innerHTML =
        '<div style="color:rgba(255,255,255,0.6);font-size:13px;">' +
        '<i class="ti ti-loader-2"></i> 正在模拟 ' + agg.done.toLocaleString() + ' / ' + count.toLocaleString() + ' 名赌徒…' +
        '</div>';
    }

    function renderFinal() {
      var absorbed = agg.ruinCount + agg.ceilingCount;
      var mcText = absorbed > 0
        ? fmtPct(agg.ruinCount / absorbed, 2) + '（' + agg.ruinCount + '/' + absorbed + ' 已定局）'
        : '本轮无人定局';
      setText('bh-gr-mc', mcText);

      var rows =
        '<div class="bh-stats">' +
        '  <div class="bh-stat"><div class="bh-stat-label">破产</div><div class="bh-stat-value red">' + agg.ruinCount.toLocaleString() + ' / ' + count.toLocaleString() + '</div></div>' +
        '  <div class="bh-stat"><div class="bh-stat-label">打穿庄家</div><div class="bh-stat-value green">' + agg.ceilingCount.toLocaleString() + '</div></div>' +
        '  <div class="bh-stat"><div class="bh-stat-label">平均手数</div><div class="bh-stat-value blue">' + Math.round(agg.totalRounds / count).toLocaleString() + '</div></div>' +
        '</div>';

      if (agg.unabsorbedCount > 0) {
        rows +=
          '<div class="bh-insight blue" style="margin-top:12px;">' +
          '<i class="ti ti-info-circle"></i> 有 <b>' + agg.unabsorbedCount.toLocaleString() + '</b> 名赌徒在 ' +
          maxRounds.toLocaleString() + ' 手预算内既没输光也没打穿庄家，属于未定局，没有计入上面的破产占比。' +
          '庄家资金越大、优势越小，走到定局需要的手数就越多——这本身就是双方时间尺度的差距。' +
          '</div>';
      }
      if (stepResult) stepResult.innerHTML = rows;

      renderGRChart({ trajectories: agg.trajectories });
      if (window.gsap) {
        gsap.from('#bh-gr-step-result .bh-stat-value', { scale: 0.7, opacity: 0.4, duration: 0.4, stagger: 0.05, ease: 'back.out(2)' });
      }
      state.grRunning = false;
    }

    function step() {
      var n = Math.min(chunk, count - agg.done);
      var part = window.bhEngine.simulateGamblers(n, player, house, edge, rng, {
        maxRounds: maxRounds,
        keepTrajectories: agg.trajectories.length < 5 ? 5 - agg.trajectories.length : 0
      });
      agg.ruinCount += part.ruinCount;
      agg.ceilingCount += part.ceilingCount;
      agg.unabsorbedCount += part.unabsorbedCount;
      agg.totalRounds += part.avgRounds * n;
      agg.done += n;
      for (var t = 0; t < part.trajectories.length && agg.trajectories.length < 5; t++) {
        agg.trajectories.push(part.trajectories[t]);
      }
      if (agg.done < count) {
        renderProgress();
        setTimeout(step, 0);
      } else {
        renderFinal();
      }
    }

    renderProgress();
    setTimeout(step, 0);
  }

  // ============================================================
  // 模块四：倍投（马丁格尔）两步对比
  // ============================================================
  // 三步共用的固定参数：只有 tableLimit 会变，种子也固定，
  // 这样第 1 步和第 3 步是严格的受控对照（同一串随机数）。
  var MG_BASE = { bankroll: 100000, baseBet: 10, profitTarget: 500, rounds: 5000 };
  var MG_SEED = 7;
  var MG_COUNT = 400;
  var MG_LIMIT = 2000;

  function runMartingaleBatch(tableLimit) {
    return window.bhEngine.simulateMartingaleBatch(MG_COUNT, {
      bankroll: MG_BASE.bankroll,
      baseBet: MG_BASE.baseBet,
      tableLimit: tableLimit,
      edge: state.currentEdge,
      rounds: MG_BASE.rounds,
      profitTarget: MG_BASE.profitTarget
    }, window.bhEngine.mulberry32(MG_SEED));
  }

  function flashStep(step, good) {
    var stepEl = el('bh-mg-step' + step);
    if (!stepEl) return;
    var cls = good ? 'flash-good' : 'flash-bad';
    stepEl.classList.remove('flash-good', 'flash-bad');
    stepEl.classList.add(cls);
    setTimeout(function () { stepEl.classList.remove(cls); }, 1500);
  }

  // 第 1 步：无桌限，只看达成率——先让人觉得这是必胜法
  function runMartingaleStep1() {
    var batch = runMartingaleBatch(Infinity);
    state.mgNoLimit = batch;
    var res = el('bh-mg-result1');
    res.className = 'bh-martingale-step-result green';
    res.innerHTML =
      '达成 +' + MG_BASE.profitTarget + ' 目标：<b style="color:#4ade80">' + fmtPct(batch.targetRate, 1) + '</b>' +
      '（' + batch.targetCount + ' / ' + MG_COUNT + ' 场）' +
      '<br><span style="font-size:11px;color:rgba(255,255,255,0.5);">几乎每一场都赚到了钱。看起来确实像必胜法。</span>';
    flashStep(1, true);
    drawMartingaleChart(batch, 1);
    el('bh-mg-result2').textContent = '现在点第 2 步';
    return batch;
  }

  // 第 2 步：同一批场次，换个角度看代价
  function runMartingaleStep2() {
    var batch = state.mgNoLimit || runMartingaleStep1();
    var res = el('bh-mg-result2');
    res.className = 'bh-martingale-step-result red';
    res.innerHTML =
      '最差一场：<b style="color:#f87171">' + fmtSigned(batch.worstProfit) + '</b>' +
      '<br>400 场平均：<b style="color:#f87171">' + fmtSigned(batch.avgProfit) + '</b>' +
      '<br><span style="font-size:11px;color:rgba(255,255,255,0.5);">高胜率是用「频繁小赢换罕见巨亏」买来的。平均下来仍然是亏。</span>';
    flashStep(2, false);
    el('bh-mg-result3').textContent = '现在点第 3 步';
  }

  // 第 3 步：只加一条桌限，其余全不变
  function runMartingaleStep3() {
    var noLimit = state.mgNoLimit || runMartingaleStep1();
    var batch = runMartingaleBatch(MG_LIMIT);
    state.mgLimited = batch;

    var wageredRatio = noLimit.avgWagered > 0 ? (batch.avgWagered / noLimit.avgWagered) : 1;
    var res = el('bh-mg-result3');
    res.className = 'bh-martingale-step-result red';
    res.innerHTML =
      '达成率 ' + fmtPct(batch.targetRate, 1) + '，最差一场 ' + fmtSigned(batch.worstProfit) +
      '<br>平均总流水：<b style="color:#fbbf24">' + fmtMoney(batch.avgWagered) + '</b>' +
      '（无桌限时 ' + fmtMoney(noLimit.avgWagered) + '，<b style="color:#f87171">' + wageredRatio.toFixed(1) + ' 倍</b>）' +
      '<br>平均盈亏：<b style="color:#f87171">' + fmtSigned(batch.avgProfit) + '</b>' +
      '<br><span style="font-size:11px;color:rgba(255,255,255,0.5);">巨亏被桌限封了顶，代价是你要押上几倍的钱才能达成同一个目标。</span>';
    flashStep(3, false);
    drawMartingaleChart(batch, 3);

    // 桌限截断的那一格
    var info = el('bh-mg-truncated-info');
    var firstTrunc = null;
    for (var i = 0; i < batch.results.length; i++) {
      if (batch.results[i].truncatedRounds.length > 0) { firstTrunc = batch.results[i]; break; }
    }
    if (firstTrunc) {
      var desired = firstTrunc.betSequence[firstTrunc.truncatedRounds[0]];
      info.style.display = 'block';
      info.innerHTML =
        '<i class="ti ti-alert-triangle"></i> 恢复链断裂的那一格：第 ' + (desired.round + 1) +
        ' 手你想下注 <b style="color:#fbbf24">' + fmtMoney(desired.desiredBet) + '</b>，桌限只让下 <b style="color:#f87171">' +
        fmtMoney(desired.actualBet) + '</b>。这一手之后，之前的连亏再也追不回来了。';
      if (window.gsap) gsap.from(info, { scale: 0.95, opacity: 0, duration: 0.5 });
    }

    // 不变量：期望亏损 = 庄家优势 × 总流水
    var inv = el('bh-mg-invariant');
    inv.style.display = 'block';
    inv.innerHTML =
      '<i class="ti ti-equal"></i> 对一下账：庄家优势 ' + fmtPct(state.currentEdge, 2) +
      ' × 平均流水 ' + fmtMoney(batch.avgWagered) + ' = <b style="color:#fbbf24">' +
      fmtSigned(batch.theoreticalLoss) + '</b>，实测平均盈亏 <b style="color:#fbbf24">' +
      fmtSigned(batch.avgProfit) + '</b>。倍投改的是亏损的分布形状，改不了这一行乘法。';
    if (window.gsap) gsap.from(inv, { y: 8, opacity: 0, duration: 0.45 });
  }

  function drawMartingaleChart(batch, step) {
    var wrap = el('bh-mg-chart-wrap');
    var canvas = el('bh-mg-chart');
    if (!canvas) return;
    if (state.mgChart) state.mgChart.destroy();
    wrap.style.display = 'block';

    // 画 3 条代表性轨迹
    var samples = batch.results.slice(0, Math.min(5, batch.results.length));
    var palette = ['#fbbf24', '#60a5fa', '#4ade80', '#a855f7', '#f87171'];
    var maxLen = 0;
    samples.forEach(function (s) { if (s.trajectory.length > maxLen) maxLen = s.trajectory.length; });
    var labels = [];
    for (var i = 0; i < maxLen; i++) labels.push(i);

    var datasets = samples.map(function (s, idx) {
      return {
        label: '玩家' + (idx + 1) + (s.bankrupt ? '（破产）' : '（存活）'),
        data: s.trajectory,
        borderColor: palette[idx],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1
      };
    });
    // 加一条 0 资金参考线
    datasets.push({
      label: '破产线（资金 = 0）',
      data: labels.map(function () { return 0; }),
      borderColor: 'rgba(248, 113, 113, 0.6)',
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0
    });

    state.mgChart = new Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } },
          tooltip: { backgroundColor: 'rgba(20,20,30,0.95)' }
        },
        scales: {
          x: { title: { display: true, text: '手数', color: 'rgba(255,255,255,0.5)' }, ticks: { color: 'rgba(255,255,255,0.4)', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { title: { display: true, text: '资金', color: 'rgba(255,255,255,0.5)' }, ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // ============================================================
  // 模块五：平衡账本
  // ============================================================
  function refreshBookie() {
    var amountA = Number(el('bh-bk-amountA').value) || 0;
    var amountB = Number(el('bh-bk-amountB').value) || 0;
    var oddsA = Number(el('bh-bk-oddsA').value) || 1.9;
    var oddsB = Number(el('bh-bk-oddsB').value) || 1.9;
    var r = window.bhEngine.bookmakerPayout(amountA, amountB, oddsA, oddsB);
    setText('bh-bk-netA', fmtSigned(r.netA));
    setText('bh-bk-netB', fmtSigned(r.netB));
    setText('bh-bk-vig', fmtPct(r.vig, 2));
    setText('bh-bk-pool', fmtMoney(r.totalPool));

    // 颜色编码
    var aEl = el('bh-bk-netA');
    var bEl = el('bh-bk-netB');
    aEl.className = 'bh-stat-value ' + (r.netA >= 0 ? 'gold' : 'red');
    bEl.className = 'bh-stat-value ' + (r.netB >= 0 ? 'gold' : 'red');

    var insight = el('bh-bk-insight');
    if (r.exposure === 'balanced') {
      insight.className = 'bh-insight';
      insight.innerHTML = '<i class="ti ti-check"></i> 账本平衡：两种结果下庄家收益几乎相等且均为正——<b>收益与比赛结果无关</b>。';
    } else if (r.exposure === 'imbalance') {
      insight.className = 'bh-insight red';
      insight.innerHTML = '<i class="ti ti-alert-triangle"></i> 严重失衡：这时候庄家在参赌，而它并不想参赌。';
    } else {
      insight.className = 'bh-insight gold';
      insight.innerHTML = '<i class="ti ti-info-circle"></i> 轻微倾斜：账本还过得去，但庄家已经承担了单边风险。';
    }
  }

  // 按两侧押注额反解平衡赔率——庄家开盘的实际动作
  function rebalanceBookie() {
    var amountA = Number(el('bh-bk-amountA').value) || 0;
    var amountB = Number(el('bh-bk-amountB').value) || 0;
    var solved = window.bhEngine.balancedOdds(amountA, amountB, 0.05);
    if (!solved) {
      showToast('两侧都要有押注额才能平账');
      return;
    }
    el('bh-bk-oddsA').value = solved.oddsA.toFixed(2);
    el('bh-bk-oddsB').value = solved.oddsB.toFixed(2);
    refreshBookie();
    var insight = el('bh-bk-insight');
    insight.className = 'bh-insight gold';
    insight.innerHTML =
      '<i class="ti ti-scale-outline"></i> 赔率已按押注额反解：A 侧 <b>' + solved.oddsA.toFixed(2) +
      '</b>、B 侧 <b>' + solved.oddsB.toFixed(2) + '</b>，两边赔付都是 ' + fmtMoney(solved.payout) +
      '。押注多的一侧赔率被压低，押注少的一侧被抬高——庄家没有预测任何结果，它只是在给钱流定价。';
    if (window.gsap) gsap.from(insight, { y: 8, opacity: 0, duration: 0.4 });
  }

  function applyBookiePreset(preset) {
    var inputs = {
      bh_bk_amountA: el('bh-bk-amountA'),
      bh_bk_amountB: el('bh-bk-amountB'),
      bh_bk_oddsA: el('bh-bk-oddsA'),
      bh_bk_oddsB: el('bh-bk-oddsB')
    };
    switch (preset) {
      case 'balanced':
        inputs.bh_bk_amountA.value = 10000;
        inputs.bh_bk_amountB.value = 10000;
        inputs.bh_bk_oddsA.value = 1.9;
        inputs.bh_bk_oddsB.value = 1.9;
        break;
      case 'tilted':
        inputs.bh_bk_amountA.value = 100000;
        inputs.bh_bk_amountB.value = 1000;
        inputs.bh_bk_oddsA.value = 1.2;
        inputs.bh_bk_oddsB.value = 5.0;
        break;
      case 'leicester':
        inputs.bh_bk_amountA.value = 100;
        inputs.bh_bk_amountB.value = 100000;
        inputs.bh_bk_oddsA.value = 5001;
        inputs.bh_bk_oddsB.value = 1.01;
        break;
      case 'reset':
        inputs.bh_bk_amountA.value = 10000;
        inputs.bh_bk_amountB.value = 10000;
        inputs.bh_bk_oddsA.value = 1.9;
        inputs.bh_bk_oddsB.value = 1.9;
        break;
    }
    refreshBookie();
  }

  // ============================================================
  // 模块六：真实案例
  // ============================================================
  var CASES = [
    {
      icon: 'ti-trophy',
      tag: 'tag-fun', tagText: '谈判桌上赢的',
      title: 'Don Johnson，2011',
      summary: '6 个月赢走约 1510 万美元：Tropicana ≈ 600 万、Borgata ≈ 500 万、Caesars ≈ 400 万。',
      detail: '没出千也没算牌。他谈下了一套定制条款：单手上限 10 万美元、庄家 soft 17 必须停牌、允许再分对 A，以及最致命的一条——单次损失超过 50 万美元返还 20%。组合起来把庄家优势压到约 0.25%，叠加输损返还后期望值翻到玩家一侧。赌场的反制手段是停止提供这些条件、限制他入场。'
    },
    {
      icon: 'ti-brain',
      tag: 'tag-medium', tagText: '信息优势',
      title: 'Edward Thorp，1962',
      summary: '《Beat the Dealer》证明 21 点可被算牌打成正期望。',
      detail: '一个数学教授用第一代计算机证明玩家能在 21 点中追踪大小牌比例并把期望值扳到正。赌场应对同样在规则层：多牌靴、连续洗牌机、请人离场。规则补丁一上线，期望值又回去了。'
    },
    {
      icon: 'ti-flame',
      tag: 'tag-medium', tagText: '方差的两面',
      title: 'Archie Karas，1992-1995',
      summary: '1992 年 12 月带 50 美元到拉斯维加斯，借 1 万美元本金，到 1995 年初滚到 4000 多万美元（The Run）。',
      detail: '后来全部输回。据报道其中一晚输掉 1100 万美元，两周内又输掉 2000 万。他赢是因为方差给他送了一个世纪连胜；他输，是因为方差也必然会收回去。'
    },
    {
      icon: 'ti-soccer',
      tag: 'tag-fun', tagText: '定价失误',
      title: '莱斯特城，2015-16 赛季',
      summary: '5000:1 赔率夺英超冠军。英国三大博彩公司合计赔付约 770 万英镑。',
      detail: 'Coral 估算全行业损失约 2000 万英镑。这个赔率本来就不是概率估计，是吸引投注刻意放大的营销赔率，真实水平大概 1000:1 到 2000:1。当它真的发生时，账本从「卖噱头」变成「卖命」。'
    },
    {
      icon: 'ti-building-bank',
      tag: 'tag-easy', tagText: '这才是主流死法',
      title: 'Revel Casino Hotel，大西洋城',
      summary: '造价 24 亿美元，2012 年 4 月开业，2014 年 9 月关闭，从未实现盈利。',
      detail: '死因是建设期资金断流、成本超支、位置偏僻、定位在当地并不存在的超高端市场、宾州等邻州开放赌场分流客源。两年内破产两次，后来以约 8200 万美元贱卖。光是 2014 年大西洋城就关了四家赌场——垮掉的是债务、成本、竞争和合规，不是赌客。'
    }
  ];

  function renderCases() {
    var grid = el('bh-cases');
    if (!grid) return;
    grid.innerHTML = '';
    CASES.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'bh-case';
      card.innerHTML =
        '<div class="bh-case-header">' +
        '  <div class="bh-case-icon"><i class="ti ' + c.icon + '"></i></div>' +
        '  <div style="flex:1;">' +
        '    <div class="bh-case-title">' + c.title + '</div>' +
        '    <span class="bh-case-tag ' + c.tag + '">' + c.tagText + '</span>' +
        '  </div>' +
        '</div>' +
        '<div class="bh-case-summary">' + c.summary + '</div>' +
        '<div class="bh-case-detail">' + c.detail + '</div>';
      card.addEventListener('click', function () {
        card.classList.toggle('expanded');
        if (window.gsap && card.classList.contains('expanded')) {
          gsap.from(card.querySelector('.bh-case-detail'), { opacity: 0, y: -8, duration: 0.35 });
        }
      });
      grid.appendChild(card);
    });
  }

  // ============================================================
  // 复制结论
  // ============================================================
  function bindCopy() {
    var btn = el('bh-copy-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var text =
        '【当一次庄家：它为什么不怕你赢】\n' +
        '概率对你和赌场完全一样。不一样的是你们各自站在大数定律曲线的哪一端。\n' +
        '2.7% 的庄家优势 → 100 手时玩家盈利概率 46.0%，1000 手时 37.6%，10000 手时 15.9%，100 万手时 ≈ 0。\n' +
        '倍投能做到 98% 的场次都小赚，代价是罕见的一场巨亏；桌限给那笔巨亏封顶，同时把总流水顶上去。\n' +
        '期望亏损 = 庄家优势 × 总流水，这一行乘法谁也改不了。平衡账本下，庄家收益与比赛结果无关。\n' +
        '庄家只怕两件事：有人把期望值扳到正，以及自己的生意算错了账。运气不在其中。\n' +
        '— 数字直觉 / https://numfeel.996.ninja/pages/be-the-house/';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast('已复制结论到剪贴板');
        }).catch(function () {
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }
    });
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('已复制结论到剪贴板'); }
    catch (e) { showToast('复制失败，请手动选中'); }
    document.body.removeChild(ta);
  }

  // ============================================================
  // 事件绑定
  // ============================================================
  function bindEvents() {
    // 模块二
    var edgeSlider = el('bh-edge-slider');
    var nSlider = el('bh-n-slider');
    if (edgeSlider) {
      edgeSlider.addEventListener('input', function () {
        state.currentEdge = Number(edgeSlider.value) / 100;
        el('bh-edge-slider-val').textContent = state.currentEdge.toFixed(2) + '%';
        // 同步模块一卡片：找最接近的
        syncEdgeCardFromSlider();
        setText('bh-current-edge', state.currentEdge.toFixed(2) + '%');
        // 同步模块三 edge 显示
        setText('bh-gr-edge', state.currentEdge.toFixed(2) + '%');
        refreshLLN();
        refreshGRStats();
      });
    }
    if (nSlider) {
      nSlider.addEventListener('input', function () {
        state.currentN = Number(nSlider.value);
        el('bh-n-slider-val').textContent = state.currentN.toLocaleString();
        refreshLLN();
      });
    }
    var llnBtn = el('bh-lln-run-btn');
    if (llnBtn) llnBtn.addEventListener('click', runLLNDistribution);

    // 模块三
    var grPlayer = el('bh-gr-player');
    var grHouse = el('bh-gr-house');
    if (grPlayer) {
      grPlayer.addEventListener('input', function () {
        el('bh-gr-player-val').textContent = grPlayer.value;
        refreshGRStats();
      });
    }
    if (grHouse) {
      grHouse.addEventListener('input', function () {
        var v = Number(grHouse.value);
        el('bh-gr-house-val').textContent = v.toLocaleString();
        refreshGRStats();
      });
    }
    var grSteps = el('bh-gr-steps');
    if (grSteps) {
      grSteps.querySelectorAll('.bh-step-btn[data-step]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var count = Number(btn.dataset.step);
          runGRStep(count);
        });
      });
      var resetBtn = el('bh-gr-reset');
      if (resetBtn) resetBtn.addEventListener('click', function () {
        setText('bh-gr-mc', '—');
        var sr = el('bh-gr-step-result'); if (sr) sr.style.display = 'none';
        var wrap = el('bh-gr-chart-wrap'); if (wrap) wrap.style.display = 'none';
        grSteps.querySelectorAll('.bh-step-btn').forEach(function (b) { b.classList.remove('active'); });
      });
    }

    // 模块四
    var mgBtn1 = el('bh-mg-btn1');
    var mgBtn2 = el('bh-mg-btn2');
    var mgBtn3 = el('bh-mg-btn3');
    if (mgBtn1) mgBtn1.addEventListener('click', runMartingaleStep1);
    if (mgBtn2) mgBtn2.addEventListener('click', runMartingaleStep2);
    if (mgBtn3) mgBtn3.addEventListener('click', runMartingaleStep3);

    // 模块五
    ['bh-bk-amountA', 'bh-bk-amountB', 'bh-bk-oddsA', 'bh-bk-oddsB'].forEach(function (id) {
      var input = el(id);
      if (input) input.addEventListener('input', refreshBookie);
    });
    document.querySelectorAll('[data-bk-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () { applyBookiePreset(btn.dataset.bkPreset); });
    });
    var rebalanceBtn = el('bh-bk-rebalance');
    if (rebalanceBtn) rebalanceBtn.addEventListener('click', rebalanceBookie);
  }

  function syncEdgeCardFromSlider() {
    // 找到最接近的卡片
    var best = null;
    var bestDiff = Infinity;
    document.querySelectorAll('.bh-edge-card').forEach(function (c) {
      var e = window.bhEngine.houseEdge(c.dataset.edgeId);
      var d = Math.abs(e - state.currentEdge);
      if (d < bestDiff) { bestDiff = d; best = c; }
    });
    if (best) {
      state.currentEdgeId = best.dataset.edgeId;
      document.querySelectorAll('.bh-edge-card').forEach(function (c) { c.classList.remove('active'); });
      best.classList.add('active');
    }
  }

  // ============================================================
  // 启动
  // ============================================================
  function init() {
    // engine.js 自己挂 window.bhEngine，这里只做存在性检查
    if (!window.bhEngine) {
      console.error('engine.js 未加载：window.bhEngine 不存在');
      return;
    }

    if (!window.Chart) {
      console.error('Chart.js 未加载');
      return;
    }

    renderEdgeGrid();
    renderCurveChart();
    refreshLLN();
    refreshGRStats();
    runLLNDistribution();
    renderCases();
    refreshBookie();
    bindEvents();
    bindCopy();

    // GSAP 入场动画
    if (window.gsap) {
      gsap.from('.bh-module', { y: 20, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out', delay: 0.1 });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
