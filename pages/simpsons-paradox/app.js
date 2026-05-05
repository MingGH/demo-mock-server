/**
 * 辛普森悖论 — 交互逻辑
 */
(function () {
  'use strict';

  var phases = ['phase-intro', 'phase-reveal', 'phase-why', 'phase-monte-carlo'];
  var mcChartInstance = null;

  // ── 阶段切换 ──
  window.goToPhase = function (id) {
    phases.forEach(function (p) {
      var el = document.getElementById(p);
      if (el) el.classList.remove('active');
    });
    var target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // 按需渲染
    if (id === 'phase-intro') renderIntro();
    if (id === 'phase-reveal') renderReveal();
    if (id === 'phase-why') renderWhy();
  };

  // ── Step 0: 引入 ──
  function renderIntro() {
    var o = overallRates();
    document.getElementById('introMaleRate').textContent = (o.maleRate * 100).toFixed(1) + '%';
    document.getElementById('introFemaleRate').textContent = (o.femaleRate * 100).toFixed(1) + '%';
    document.getElementById('introGap').textContent = ((o.maleRate - o.femaleRate) * 100).toFixed(1);
  }

  // ── Step 1: 分系揭示 ──
  function renderReveal() {
    var rates = allDeptRates();
    var tbody = document.getElementById('deptTableBody');
    tbody.innerHTML = '';

    rates.forEach(function (r) {
      var femaleWin = r.diff >= 0;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td style="font-weight:700; color:#ffd700;">' + r.id + '</td>' +
        '<td>' + r.maleApply + '</td>' +
        '<td class="rate-male">' + (r.maleRate * 100).toFixed(1) + '%</td>' +
        '<td>' + r.femaleApply + '</td>' +
        '<td class="rate-female' + (femaleWin ? ' winner' : '') + '">' + (r.femaleRate * 100).toFixed(1) + '%</td>' +
        '<td style="color:' + (femaleWin ? '#f472b6' : '#60a5fa') + ';">' +
          (femaleWin ? '女生' : '男生') + '</td>';
      tbody.appendChild(tr);
    });

    var adv = countFemaleAdvantage();
    var o = overallRates();
    var gap = ((o.maleRate - o.femaleRate) * 100).toFixed(1);
    document.getElementById('femaleWinCount').textContent = adv.advantage;
    document.getElementById('overallGap').textContent = gap;
    document.getElementById('paradoxText').textContent =
      '6 个系中 ' + adv.advantage + ' 个女生录取率更高，但整体女生低 ' + gap + ' 个百分点 — 辛普森悖论';
  }

  // ── Step 2: 原因 + 可视化 ──
  function renderWhy() {
    renderDistChart();
    renderBarChart();
    renderCounterfactual();
  }

  function renderDistChart() {
    var wrap = document.getElementById('distChart');
    wrap.innerHTML = '';
    var o = overallRates();

    DEPARTMENTS.forEach(function (d) {
      var mPct = (d.maleApply / o.maleApply * 100);
      var fPct = (d.femaleApply / o.femaleApply * 100);
      var total = mPct + fPct;

      var row = document.createElement('div');
      row.className = 'dist-row';
      row.innerHTML =
        '<div class="dist-label">' + d.id + '</div>' +
        '<div class="dist-bar-wrap">' +
          '<div class="dist-seg male" style="width:' + (mPct / total * 100) + '%;">' +
            (mPct >= 5 ? mPct.toFixed(0) + '%' : '') +
          '</div>' +
          '<div class="dist-seg female" style="width:' + (fPct / total * 100) + '%;">' +
            (fPct >= 5 ? fPct.toFixed(0) + '%' : '') +
          '</div>' +
        '</div>' +
        '<div style="width:80px; font-size:0.75rem; color:#64748b; text-align:right;">' +
          '录取率 ' + ((deptRate(d).maleRate * 100 + deptRate(d).femaleRate * 100) / 2).toFixed(0) + '%' +
        '</div>';
      wrap.appendChild(row);
    });

    // 图例
    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex; gap:16px; justify-content:center; margin-top:8px; font-size:0.8rem;';
    legend.innerHTML =
      '<span style="color:#60a5fa;">■ 男生申请占比</span>' +
      '<span style="color:#f472b6;">■ 女生申请占比</span>';
    wrap.appendChild(legend);
  }

  function renderBarChart() {
    var wrap = document.getElementById('barChart');
    wrap.innerHTML = '';
    var rates = allDeptRates();

    rates.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<div class="bar-label">' + r.id + '</div>' +
        '<div class="bar-group">' +
          '<div class="bar-track">' +
            '<div class="bar-fill male" style="width:' + (r.maleRate * 100) + '%;">' +
              (r.maleRate * 100).toFixed(1) + '%' +
            '</div>' +
          '</div>' +
          '<div class="bar-track">' +
            '<div class="bar-fill female" style="width:' + (r.femaleRate * 100) + '%;">' +
              (r.femaleRate * 100).toFixed(1) + '%' +
            '</div>' +
          '</div>' +
          '<div class="bar-meta">' +
            '<span style="color:#60a5fa;">男 ' + r.maleApply + '人申请</span>' +
            '<span style="color:#f472b6;">女 ' + r.femaleApply + '人申请</span>' +
          '</div>' +
        '</div>';
      wrap.appendChild(row);
    });

    // 图例
    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex; gap:16px; justify-content:center; margin-top:8px; font-size:0.8rem;';
    legend.innerHTML =
      '<span style="color:#60a5fa;">■ 男生录取率</span>' +
      '<span style="color:#f472b6;">■ 女生录取率</span>';
    wrap.appendChild(legend);
  }

  function renderCounterfactual() {
    var sim = simulateEqualDistribution();
    document.getElementById('simOriginal').textContent = (sim.originalRate * 100).toFixed(1) + '%';
    document.getElementById('simCounterfactual').textContent = (sim.simulatedRate * 100).toFixed(1) + '%';
  }

  // ── Step 3: 蒙特卡洛 ──
  var trialSlider = document.getElementById('trialSlider');
  var trialLabel = document.getElementById('trialLabel');
  if (trialSlider) {
    trialSlider.addEventListener('input', function () {
      trialLabel.textContent = this.value;
    });
  }

  window.runMonteCarlo = function () {
    var btn = document.getElementById('runSimBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i> 模拟中...';

    var trials = parseInt(trialSlider.value) || 1000;

    setTimeout(function () {
      var result = monteCarloParadox(trials, 6);

      document.getElementById('simResult').style.display = 'block';
      document.getElementById('mcRate').textContent = (result.rate * 100).toFixed(1) + '%';
      document.getElementById('mcLabel').textContent =
        result.trials + ' 次模拟中，' + result.paradoxCount + ' 次出现辛普森悖论';

      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-player-play"></i> 再跑一次';

      renderMCChart(result);
    }, 50);
  };

  function renderMCChart(result) {
    var wrap = document.getElementById('mcChartWrap');
    wrap.style.display = 'block';

    if (typeof loadChartJS === 'function') {
      loadChartJS().then(function () {
        drawMCChart(result);
      });
    }
  }

  function drawMCChart(result) {
    var ctx = document.getElementById('mcChart').getContext('2d');
    if (mcChartInstance) mcChartInstance.destroy();

    // 跑多批次获取分布
    var rates = [];
    for (var i = 0; i < 20; i++) {
      var r = monteCarloParadox(Math.floor(result.trials / 20), 6);
      rates.push(r.rate * 100);
    }

    mcChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rates.map(function (_, i) { return '批次' + (i + 1); }),
        datasets: [{
          label: '悖论出现率 (%)',
          data: rates,
          backgroundColor: rates.map(function (r) {
            return r > 50 ? 'rgba(255,215,0,0.6)' : 'rgba(255,215,0,0.3)';
          }),
          borderColor: 'rgba(255,215,0,0.8)',
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#94a3b8' } },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#64748b', callback: function (v) { return v + '%'; } },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          x: {
            ticks: { color: '#64748b', maxRotation: 45 },
            grid: { display: false },
          }
        }
      }
    });
  }

  // ── 初始化 ──
  renderIntro();

})();
