/**
 * JNI 收费站 - UI 交互层
 * 游戏规则：让 C++ 版集合的总耗时至少快到 Java 的 2 倍。
 * 三个旋钮：C++ 纯计算速度、每次过境的过路费、批量大小。
 */
(function () {
  'use strict';

  const L = window.JniBoundaryLogic;

  // ===== 游戏常量 =====
  const TARGET = 2;                 // 目标：2 倍加速
  const MAX_BATCH = 100000;
  const PRESETS = {
    get:  { javaOpNs: 5,    cppSpeedup: 3, boundaryNs: 80 },
    zlib: { javaOpNs: 2000, cppSpeedup: 5, boundaryNs: 80 },
    jit:  { javaOpNs: 3,    cppSpeedup: 1, boundaryNs: 80 }
  };

  // ===== 状态 =====
  const state = {
    javaOpNs: PRESETS.get.javaOpNs,
    cppSpeedup: PRESETS.get.cppSpeedup,
    boundaryNs: PRESETS.get.boundaryNs,
    batchN: 1,
    prevBatch: 1
  };

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const els = {
    speedSlider: $('speed-slider'), speedValue: $('speed-value'),
    tollSlider: $('toll-slider'), tollValue: $('toll-value'),
    batchSlider: $('batch-slider'), batchValue: $('batch-value'),
    java: $('stat-java'), native: $('stat-native'),
    speedup: $('stat-speedup'), toll: $('stat-toll'),
    ticker: $('marginal-ticker'), percall: $('percall-ticker'),
    verdict: $('verdict'),
    progressFill: $('progress-fill'), progressLabel: $('progress-label'),
    progress: $('target-progress'),
    chart: $('chart'),
    presetRow: $('preset-row'),
    gotoCross: $('goto-cross'),
    batchX10: $('batch-x10'), batchDiv10: $('batch-div10'),
    reset: $('reset')
  };

  // ===== 工具 =====
  function fmtNs(ns) {
    if (ns < 1000) return (Math.round(ns * 10) / 10) + ' ns';
    if (ns < 1e6) return (Math.round(ns / 100) / 10) + ' µs';
    return (Math.round(ns / 1e4) / 100) + ' ms';
  }

  function fmtCount(n) {
    if (n >= 10000) return (n / 10000) + ' 万次';
    return n.toLocaleString('zh-CN') + ' 次';
  }

  function fmtRatio(s) {
    if (s >= 1) return s.toFixed(2) + 'x';
    return s.toFixed(2) + 'x（慢 ' + (1 / s).toFixed(1) + ' 倍）';
  }

  function batchToSlider(n) {
    return Math.round(20 * Math.log10(n));
  }

  function sliderToBatch(v) {
    return Math.max(1, Math.min(MAX_BATCH, Math.round(Math.pow(10, v / 20))));
  }

  function nativeOp() {
    return L.nativeOpNs(state.javaOpNs, state.cppSpeedup);
  }

  function setBatch(n) {
    const clamped = Math.max(1, Math.min(MAX_BATCH, Math.round(n)));
    state.prevBatch = state.batchN;
    state.batchN = clamped;
  }

  // ===== 判词 =====
  function verdictText() {
    const j = state.javaOpNs, b = state.boundaryNs, v = nativeOp();
    const N = state.batchN;

    // 死局：JIT 把 Java 编成机器码，C++ 没有纯计算优势
    if (v >= j) {
      return {
        cls: 'warn',
        text: '🧱 死局，先想清楚再动手。JIT 已经把这段 Java 内联编译成机器指令，' +
          'C++ 的纯计算没有优势（v ≥ j），每一笔过路费都是纯亏。' +
          '这种情况正确的做法是让 JVM 上 intrinsic，或者把活攒成大块再过境——而不是逐次调用。'
      };
    }

    const cross = L.crossoverBatch(j, v, b);
    const ceiling = j / v;
    const s = L.speedup(L.javaTotal(N, j), L.nativeBatchTotal(N, v, b));

    if (s >= TARGET) {
      const share = Math.round(L.boundaryShare(N, v, b, 'batch') * 100);
      return {
        cls: 'success',
        text: '🎉 达标！C++ 攒批方案快 ' + s.toFixed(2) + ' 倍，过路费只占 ' + share + '%。' +
          '交叉点在 ' + fmtCount(Math.ceil(cross)) + '——批量过了这道坎，' +
          'C++ 的速度优势才挣回过路费。天花板是 ' + ceiling.toFixed(1) + 'x，别指望一路涨到天上去。'
      };
    }

    // 天花板够不着目标：j/2 <= v
    if (ceiling < TARGET - 1e-9 || Math.abs(ceiling - TARGET) < 1e-9) {
      const exact = Math.abs(ceiling - TARGET) < 1e-9;
      return {
        cls: 'warn',
        text: exact
          ? '🧱 撞墙了，而且是最刁钻的一种。C++ 速度优势的极限天花板是 j/v = ' + ceiling.toFixed(2) +
            'x，恰好压在 ' + TARGET + 'x 的目标线上——批量拉到无穷大、过路费摊到零，' +
            '也只能无限逼近，永远踩不到。把 C++ 的纯计算优势再拉高一点，或者把目标降下来。'
          : '🧱 撞墙了。就算批量拉到无穷大、过路费摊到零，C++ 的天花板也只有 ' + ceiling.toFixed(2) +
            'x，够不着 ' + TARGET + 'x。这条路焊死了——先把 C++ 的纯计算优势拉上去。'
      };
    }

    if (s > 1) {
      const need = Math.ceil(b / (j / TARGET - v));
      return {
        cls: '',
        text: '曲线开始反转了（当前 ' + s.toFixed(2) + 'x），但离 ' + TARGET +
          'x 的目标还差一口气。把批量提到 ' + fmtCount(need) + ' 以上就能压线——' +
          '注意天花板 ' + ceiling.toFixed(1) + 'x，收益会越来越难挤。'
      };
    }

    return {
      cls: 'warn',
      text: '🧱 过路费还没挣回来。批量 ' + fmtCount(N) + '，C++ 每次操作除了干活还要交 ' + b +
        'ns 过路费，总账反而慢 ' + (1 / s).toFixed(1) + ' 倍。交叉点在 ' +
        fmtCount(Math.ceil(cross)) + '：把批量提上去，或者把「跳到交叉点」按下去。'
    };
  }

  // ===== 图表 =====
  let chart = null;

  function buildChart() {
    const j = state.javaOpNs, v = nativeOp(), b = state.boundaryNs;
    const curve = L.amortizedCurve(j, v, b, MAX_BATCH);
    const cross = L.crossoverBatch(j, v, b);
    const javaData = curve.batchSizes.map(n => ({ x: n, y: j }));
    const nativeData = curve.batchSizes.map((n, i) => ({ x: n, y: curve.nativePerOp[i] }));
    const crossData = cross ? [{ x: Math.max(1, cross), y: j }] : [];

    const cfg = {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Java（JIT，无过路费）',
            data: javaData,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,0.08)',
            fill: false,
            pointRadius: 0,
            borderWidth: 2.5,
            tension: 0
          },
          {
            label: 'C++ 攒批过境（含过路费）',
            data: nativeData,
            borderColor: '#e4e4e4',
            pointRadius: 0,
            borderWidth: 2.5,
            tension: 0.15
          },
          {
            label: cross ? '交叉点 N* = ' + Math.ceil(cross).toLocaleString('zh-CN') : '',
            data: crossData,
            borderColor: 'transparent',
            pointStyle: 'rectRot',
            pointRadius: 8,
            pointBackgroundColor: '#f87171',
            pointBorderColor: '#fca5a5',
            showLine: false
          },
          {
            label: '当前批量',
            data: [{ x: state.batchN, y: L.amortizedPerOp(L.nativeBatchTotal(state.batchN, v, b), state.batchN) }],
            borderColor: 'transparent',
            pointStyle: 'circle',
            pointRadius: 6,
            pointBackgroundColor: '#5eead4',
            showLine: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: 'rgba(255,255,255,0.6)', font: { size: 11 }, boxWidth: 14,
              filter: (item) => item.text !== ''
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => '批量 ' + items[0].parsed.x.toLocaleString('zh-CN') + ' 次',
              label: (item) => ' ' + item.dataset.label.split('（')[0] + '：' + fmtNs(item.parsed.y) + '/次操作'
            }
          }
        },
        scales: {
          x: {
            type: 'logarithmic',
            min: 1,
            max: MAX_BATCH,
            title: { display: true, text: '批量大小（一次过境带多少次操作）', color: 'rgba(255,255,255,0.45)', font: { size: 11 } },
            ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, maxTicksLimit: 6, maxRotation: 0 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            type: 'logarithmic',
            title: { display: true, text: '均摊到每次操作的耗时', color: 'rgba(255,255,255,0.45)', font: { size: 11 } },
            ticks: {
              color: 'rgba(255,255,255,0.45)', font: { size: 10 },
              callback: (val) => fmtNs(Number(val))
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    };

    if (chart) {
      chart.data = cfg.data;
      chart.options.scales = cfg.options.scales;
      chart.update('none');
    } else {
      chart = new Chart(els.chart.getContext('2d'), cfg);
    }
  }

  // ===== 渲染 =====
  function render() {
    const j = state.javaOpNs, v = nativeOp(), b = state.boundaryNs, N = state.batchN;

    const javaTotalNs = L.javaTotal(N, j);
    const nativeTotalNs = L.nativeBatchTotal(N, v, b);
    const s = L.speedup(javaTotalNs, nativeTotalNs);
    const share = L.boundaryShare(N, v, b, 'batch');
    const cross = L.crossoverBatch(j, v, b);

    els.speedValue.textContent = state.cppSpeedup.toFixed(1) + ' 倍';
    els.tollValue.textContent = b + ' ns';
    els.batchValue.textContent = fmtCount(N);
    els.java.textContent = fmtNs(javaTotalNs);
    els.native.textContent = fmtNs(nativeTotalNs);
    els.speedup.textContent = fmtRatio(s);
    els.speedup.parentElement.classList.toggle('green', s >= TARGET);
    els.toll.textContent = Math.round(share * 100) + '%';

    // 边际播报：从上一次批量到当前批量
    if (N > state.prevBatch && state.prevBatch >= 1) {
      const gain = L.marginalGain(j, v, b, state.prevBatch, N);
      if (gain > 1e-9) {
        els.ticker.textContent = '最新一步（批量 ' + fmtCount(state.prevBatch) + ' → ' + fmtCount(N) +
          '）：每次操作只省 ' + fmtNs(gain) + '——批量越大，这条路越挤不出油水。';
      } else {
        els.ticker.textContent = '最新一步（批量 ' + fmtCount(state.prevBatch) + ' → ' + fmtCount(N) +
          '）：均摊耗时几乎不动了，天花板 ' + (j / v).toFixed(1) + 'x 在顶着。';
      }
    } else {
      els.ticker.textContent = '批量 +1 只能摊薄过路费，Java 那条线一动不动。把批量拉大，看白线俯冲。';
    }
    state.prevBatch = N;

    // 单次过境对照
    if (v >= j) {
      els.percall.textContent = '单次过境模式（每次操作都交 ' + b + 'ns）：C++ 纯计算没有优势，这个模式不用比了。';
    } else {
      const pcTotal = L.nativePerCallTotal(N, v, b);
      const pcShare = Math.round(L.boundaryShare(N, v, b, 'perCall') * 100);
      const pcS = L.speedup(javaTotalNs, pcTotal);
      els.percall.textContent = '对照：单次过境模式（每次操作都交 ' + b + 'ns 过路费）总耗时 ' +
        fmtNs(pcTotal) + '，其中过路费占 ' + pcShare + '%，加速 ' + fmtRatio(pcS) + '。' +
        '把 ' + b + 'ns 的收费站搬到每次操作前面，就是这个下场。';
    }

    // 目标进度
    const progress = Math.min(100, (s / TARGET) * 100);
    els.progressFill.style.width = progress + '%';
    els.progressLabel.textContent = '目标进度 ' + Math.round(progress) + '%';
    els.progress.setAttribute('aria-valuenow', Math.round(progress));

    // 判词
    const vd = verdictText();
    els.verdict.textContent = vd.text;
    els.verdict.className = ('verdict ' + vd.cls).trim();

    // 交叉点按钮
    els.gotoCross.disabled = !cross;

    // 滑块同步
    if (document.activeElement !== els.batchSlider) {
      els.batchSlider.value = batchToSlider(N);
    }

    buildChart();
  }

  // ===== 事件 =====
  function clearPresets() {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  }

  els.speedSlider.addEventListener('input', () => {
    state.cppSpeedup = Number(els.speedSlider.value) / 10;
    clearPresets();
    render();
  });

  els.tollSlider.addEventListener('input', () => {
    state.boundaryNs = Number(els.tollSlider.value);
    clearPresets();
    render();
  });

  els.batchSlider.addEventListener('input', () => {
    setBatch(sliderToBatch(Number(els.batchSlider.value)));
    render();
  });

  els.presetRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const p = PRESETS[btn.dataset.preset];
    state.javaOpNs = p.javaOpNs;
    state.cppSpeedup = p.cppSpeedup;
    state.boundaryNs = p.boundaryNs;
    setBatch(1);
    els.speedSlider.value = Math.round(p.cppSpeedup * 10);
    els.tollSlider.value = p.boundaryNs;
    els.batchSlider.value = batchToSlider(1);
    clearPresets();
    btn.classList.add('active');
    render();
  });

  els.batchX10.addEventListener('click', () => {
    setBatch(state.batchN * 10);
    render();
  });

  els.batchDiv10.addEventListener('click', () => {
    setBatch(Math.floor(state.batchN / 10) || 1);
    render();
  });

  els.gotoCross.addEventListener('click', () => {
    const cross = L.crossoverBatch(state.javaOpNs, nativeOp(), state.boundaryNs);
    if (cross === null) return;
    setBatch(Math.ceil(cross) + 1);
    render();
  });

  els.reset.addEventListener('click', () => {
    const p = PRESETS.get;
    state.javaOpNs = p.javaOpNs;
    state.cppSpeedup = p.cppSpeedup;
    state.boundaryNs = p.boundaryNs;
    setBatch(1);
    els.speedSlider.value = Math.round(p.cppSpeedup * 10);
    els.tollSlider.value = p.boundaryNs;
    els.batchSlider.value = batchToSlider(1);
    clearPresets();
    document.querySelector('[data-preset="get"]').classList.add('active');
    render();
  });

  // ===== 启动 =====
  render();
})();
