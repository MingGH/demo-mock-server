/**
 * 显著实验室页面交互。
 * 只负责读取控件、调用 engine.js、渲染结果，不把统计逻辑写进 DOM 层。
 */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const REDUCED = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const state = {
    chart: null,
    last: null,
    runSeed: Math.floor(Math.random() * 1e9)
  };

  const thresholdLinePlugin = {
    id: 'thresholdLine',
    afterDraw: function (chart, args, options) {
      const value = options.value;
      if (!Number.isFinite(value)) return;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const index = Math.floor(value);
      const fraction = value - index;
      const left = xScale.getPixelForValue(index);
      const right = xScale.getPixelForValue(Math.min(index + 1, xScale.max));
      const x = left + (right - left) * fraction;
      const ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yScale.top);
      ctx.lineTo(x, yScale.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };

  const presets = {
    once: { tests: 1, sample: 1000, baseRate: 10, alpha: 0.05, peeking: false, correction: false },
    twenty: { tests: 20, sample: 1000, baseRate: 10, alpha: 0.05, peeking: false, correction: false },
    peek: { tests: 20, sample: 1000, baseRate: 10, alpha: 0.05, peeking: true, correction: false },
    bonferroni: { tests: 20, sample: 1000, baseRate: 10, alpha: 0.05, peeking: false, correction: true }
  };

  function readConfig() {
    return {
      tests: Number($('testsRange').value),
      sample: Number($('sampleRange').value),
      baseRate: Number($('baseRateRange').value) / 100,
      alpha: Number($('alphaSelect').value),
      peeking: $('peekToggle').checked,
      correction: $('correctionToggle').checked
    };
  }

  function setControls(config) {
    $('testsRange').value = config.tests;
    $('sampleRange').value = config.sample;
    $('baseRateRange').value = Math.round(config.baseRate * 100);
    $('alphaSelect').value = String(config.alpha);
    $('peekToggle').checked = config.peeking;
    $('correctionToggle').checked = config.correction;
    updateOutputs();
  }

  function updateOutputs() {
    const config = readConfig();
    $('testsOut').textContent = config.tests;
    $('sampleOut').textContent = config.sample.toLocaleString('en-US');
    $('baseRateOut').textContent = Math.round(config.baseRate * 100) + '%';
    $('trueRateHint').textContent = Math.round(config.baseRate * 100) + '%';
  }

  function markPreset(name) {
    document.querySelectorAll('.preset').forEach(function (button) {
      button.classList.toggle('active', button.dataset.preset === name);
    });
  }

  function run() {
    const config = readConfig();
    state.runSeed = (state.runSeed * 1664525 + 1013904223) >>> 0;
    const result = runExperiment({
      tests: config.tests,
      n: config.sample,
      p: config.baseRate,
      alpha: config.alpha,
      correction: config.correction,
      peeking: config.peeking,
      chunks: 10,
      seed: state.runSeed
    });
    state.last = { config: config, result: result };
    renderHero(config, result);
    renderChart(result);
    renderReport(config, result);
    renderTakeaway(config, result);

    if (window.NFTrack) {
      window.NFTrack.track('run', {
        tests: config.tests,
        sample: config.sample,
        alpha: config.alpha,
        peeking: config.peeking,
        correction: config.correction,
        falsePositives: result.falsePositives
      });
    }
  }

  function renderHero(config, result) {
    const rawRate = expectedAtLeastOne(config.tests, config.alpha);
    let rate = rawRate;
    let label = config.tests + ' 次独立测试，至少出现一次 p < ' + config.alpha + ' 的概率';

    if (config.correction) {
      rate = config.alpha;
      label = 'Bonferroni 校正后，整体假阳性率被控制在 ' + (config.alpha * 100).toFixed(0) + '% 左右';
    } else if (config.peeking) {
      rate = rawRate;
      label = '边测边看会让假阳性率进一步膨胀，实际高于 ' + (rawRate * 100).toFixed(1) + '%';
    }

    $('heroRate').textContent = config.peeking && !config.correction
      ? '> ' + (rate * 100).toFixed(1) + '%'
      : (rate * 100).toFixed(1) + '%';
    $('heroRateLabel').textContent = label;
    $('sigCount').textContent = result.falsePositives;
    $('minP').textContent = formatP(result.minP);
    $('thresholdLabel').textContent = result.threshold.toFixed(4);
  }

  function renderChart(result) {
    if (!window.Chart) return;

    const binCount = 100;
    const bins = new Array(binCount).fill(0);
    result.results.forEach(function (item) {
      const index = Math.min(binCount - 1, Math.floor(item.p / (1 / binCount)));
      bins[index]++;
    });

    const labels = bins.map(function (_, index) {
      const from = (index / binCount).toFixed(2);
      const to = ((index + 1) / binCount).toFixed(2);
      return from + '–' + to;
    });
    const significantBins = Math.floor(result.threshold / (1 / binCount));
    const colors = bins.map(function (_, index) {
      return index < significantBins ? 'rgba(255, 107, 107, 0.82)' : 'rgba(144, 202, 249, 0.5)';
    });

    if (state.chart) {
      state.chart.data.labels = labels;
      state.chart.data.datasets[0].data = bins;
      state.chart.data.datasets[0].backgroundColor = colors;
      state.chart.options.plugins.thresholdLine.value = result.threshold * binCount;
      state.chart.update();
      return;
    }

    state.chart = new Chart($('pChart').getContext('2d'), {
      type: 'bar',
      plugins: [thresholdLinePlugin],
      data: {
        labels: labels,
        datasets: [{
          data: bins,
          backgroundColor: colors,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: REDUCED ? false : { duration: 350 },
        plugins: {
          thresholdLine: { value: result.threshold * binCount },
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return 'p 值 ' + items[0].label; },
              label: function (item) { return item.parsed.y + ' 次实验'; }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#8b93a7', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.07)' },
            ticks: { color: '#8b93a7', precision: 0, font: { size: 10 } }
          }
        }
      }
    });
  }

  function renderReport(config, result) {
    const list = $('reportList');
    const significant = result.results
      .filter(function (item) { return item.significant; })
      .sort(function (a, b) { return a.p - b.p; });

    if (!significant.length) {
      $('reportSummary').textContent = '这次没有撞上显著结果。把实验次数调到 20，再跑几次——你迟早会看到一个。';
      list.innerHTML = '<div class="report-empty">没有「显著」结果。这其实才是真实情况：两组按钮完全一样。</div>';
      return;
    }

    $('reportSummary').textContent = '你发现了 ' + significant.length + ' 个「显著提升」，但它们全部来自同一个真实转化率。';
    const shown = significant.slice(0, 6);
    list.innerHTML = shown.map(function (item) {
      const hasLift = item.rateB > 0;
      const lift = hasLift ? (item.diff / item.rateB) * 100 : 0;
      const liftText = hasLift
        ? (lift >= 0 ? '+' : '') + lift.toFixed(1) + '%'
        : 'B 组 0%，相对提升无法计算';
      const liftClass = hasLift && lift < 0 ? ' negative' : '';
      return '<div class="report-item">' +
        '<div class="report-top"><span class="report-idx">实验 #' + item.index + ' · 假阳性</span>' +
        '<span class="report-p">p = ' + formatP(item.p) + ' ' + pStars(item.p) + '</span></div>' +
        '<div class="report-line">A 组 <strong>' + (item.rateA * 100).toFixed(1) + '%</strong> vs B 组 ' +
        (item.rateB * 100).toFixed(1) + '%</div>' +
        '<div class="report-lift' + liftClass + '">观测提升 ' + liftText +
        '，样本量 ' + item.n.toLocaleString('en-US') + '</div>' +
        '</div>';
    }).join('');

    if (significant.length > shown.length) {
      list.innerHTML += '<div class="report-empty">还有 ' + (significant.length - shown.length) + ' 个「显著」结果，就不一一列了。</div>';
    }
  }

  function renderTakeaway(config, result) {
    const element = $('takeaway');
    if (result.falsePositives > 0) {
      element.innerHTML = '你刚刚「发现」了 <strong>' + result.falsePositives + ' 个显著提升</strong>。' +
        '但它们全部来自同一个 ' + Math.round(config.baseRate * 100) + '% 的真实转化率——没有一个是真效果。' +
        '如果只看周报，你可能会立刻上线这个按钮。';
      return;
    }
    element.innerHTML = '这次没撞上。把实验次数调到 <strong>20</strong>，再跑几次——' +
      '随机波动迟早会替你制造出一个「显著」结果。';
  }

  function copySummary() {
    if (!state.last) return;
    const config = state.last.config;
    const result = state.last.result;
    const text = '显著实验室：' + config.tests + ' 次测试，每组 ' + config.sample +
      ' 人，真实转化率 ' + Math.round(config.baseRate * 100) + '%，α=' + config.alpha +
      '，' + (config.correction ? '已做 Bonferroni 校正' : '未校正') +
      '，' + (config.peeking ? '边测边看' : '固定样本量') +
      '。发现 ' + result.falsePositives + ' 个「显著」结果，最小 p=' + formatP(result.minP) +
      '。真实差异：0。';

    const done = function () {
      $('copyStatus').textContent = '已复制';
      setTimeout(function () { $('copyStatus').textContent = ''; }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      if (document.execCommand('copy')) {
        done();
      } else {
        $('copyStatus').textContent = '复制失败，请手动选择';
      }
    } catch (error) {
      $('copyStatus').textContent = '复制失败，请手动选择';
    }
    document.body.removeChild(area);
  }

  function bindEvents() {
    $('presetRow').addEventListener('click', function (event) {
      const button = event.target.closest('.preset');
      if (!button) return;
      const config = presets[button.dataset.preset];
      if (!config) return;
      setControls(config);
      markPreset(button.dataset.preset);
      run();
    });

    ['testsRange', 'sampleRange', 'baseRateRange', 'alphaSelect', 'peekToggle', 'correctionToggle']
      .forEach(function (id) {
        const element = $(id);
        element.addEventListener('input', updateOutputs);
        element.addEventListener('change', function () {
          markPreset('');
          updateOutputs();
          run();
        });
      });

    $('runBtn').addEventListener('click', run);
    $('copyBtn').addEventListener('click', copySummary);
  }

  function init() {
    bindEvents();
    updateOutputs();
    if (window.NFTrack) {
      window.NFTrack.trackOnce('session_start', { mode: 'p-hacking' });
    }
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
