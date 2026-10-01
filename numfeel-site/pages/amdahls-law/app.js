/**
 * 买核大亨 - UI 交互层
 * 游戏规则：把 100 分钟的报表压进 25 分钟（4x）。
 * 两个手段：买核（¥1万/核/年）和优化代码（串行 -1%/次）。
 */
(function () {
  'use strict';

  const L = window.AmdahlLogic;

  // ===== 游戏常量 =====
  const BASE_MINUTES = 100;
  const TARGET_SPEEDUP = 4;
  const COST_PER_CORE_WAN = 1;      // 每颗核 ¥1 万/年
  const CHART_MAX_CORES = 128;
  const CORES_MAX = 1024;

  // ===== 状态 =====
  const state = {
    serial: 0.25,   // 串行比例
    cores: 1
  };

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const els = {
    serialSlider: $('serial-slider'),
    serialValue: $('serial-value'),
    coresSlider: $('cores-slider'),
    coresValue: $('cores-value'),
    speedup: $('stat-speedup'),
    time: $('stat-time'),
    eff: $('stat-eff'),
    cost: $('stat-cost'),
    ticker: $('marginal-ticker'),
    verdict: $('verdict'),
    progressFill: $('progress-fill'),
    progressLabel: $('progress-label'),
    progress: $('target-progress'),
    chart: $('chart'),
    presetRow: $('preset-row')
  };

  // ===== 工具 =====
  function fmtMinutes(m) {
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const min = Math.round(m % 60);
      return `${h} 小时 ${min} 分`;
    }
    return `${m.toFixed(1)} 分钟`;
  }

  function fmtSeconds(minutes) {
    const sec = minutes * 60;
    if (sec >= 90) return `${(sec / 60).toFixed(1)} 分钟`;
    return `${sec.toFixed(1)} 秒`;
  }

  function coresToSlider(n) {
    // 对数映射：slider 0..100 → 2^0 .. 2^10
    const v = Math.round(10 * Math.log2(n));
    return Math.max(0, Math.min(100, v));
  }

  function sliderToCores(v) {
    return Math.max(1, Math.min(CORES_MAX, Math.round(Math.pow(2, v / 10))));
  }

  // ===== 图表 =====
  let chart = null;

  function buildChart() {
    const curve = L.speedupCurve(state.serial, CHART_MAX_CORES);
    const highlight = curve.cores.map(n => (n === state.cores ? 6 : 0));

    const datasets = [{
      label: '实际加速比',
      data: curve.speedup,
      borderColor: '#2dd4bf',
      backgroundColor: 'rgba(45,212,191,0.08)',
      fill: true,
      tension: 0.3,
      pointRadius: highlight,
      pointBackgroundColor: '#5eead4',
      borderWidth: 2.5
    }, {
      label: `老板的目标 ${TARGET_SPEEDUP}x`,
      data: curve.cores.map(() => TARGET_SPEEDUP),
      borderColor: '#f87171',
      borderDash: [6, 6],
      pointRadius: 0,
      borderWidth: 1.5,
      fill: false
    }];

    if (Number.isFinite(curve.ceiling)) {
      datasets.push({
        label: `天花板 ${curve.ceiling.toFixed(1)}x`,
        data: curve.cores.map(() => curve.ceiling),
        borderColor: '#fbbf24',
        borderDash: [3, 5],
        pointRadius: 0,
        borderWidth: 1.5,
        fill: false
      });
    }

    const cfg = {
      type: 'line',
      data: {
        labels: curve.cores,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 }, boxWidth: 14 }
          },
          tooltip: {
            filter: (item) => item.datasetIndex === 0,
            callbacks: {
              title: (items) => `${items[0].label} 核`,
              label: (item) => ` 加速 ${Number(item.parsed.y).toFixed(2)}x`
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '核心数', color: 'rgba(255,255,255,0.45)', font: { size: 11 } },
            ticks: {
              color: 'rgba(255,255,255,0.45)',
              maxTicksLimit: 7,
              font: { size: 10 }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: '加速比（倍）', color: 'rgba(255,255,255,0.45)', font: { size: 11 } },
            ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    };

    if (chart) {
      chart.data = cfg.data;
      chart.update('none');
    } else {
      chart = new Chart(els.chart.getContext('2d'), cfg);
    }
  }

  // ===== 判词 =====
  function verdictText(speedup, ceiling) {
    const serialPct = (state.serial * 100).toFixed(0);
    const cost = (state.cores - 1) * COST_PER_CORE_WAN;

    if (speedup >= TARGET_SPEEDUP) {
      const eff = L.efficiency(state.serial, state.cores);
      let msg = `🎉 达标！总耗时 ${fmtMinutes(L.timeMinutes(state.serial, state.cores, BASE_MINUTES))}，` +
        `花了 ¥${cost} 万/年`;
      if (state.cores > 1 && eff < 0.5) {
        msg += `。不过 ${Math.round(eff * 100)}% 的利用率意味着大部分核在陪你喝茶，财务那边迟早来找你聊聊。`;
      } else {
        msg += `。这钱花得值——利用率 ${Math.round(eff * 100)}%，都怪串行比例压得够低。`;
      }
      return { text: msg, cls: 'success' };
    }

    if (ceiling <= TARGET_SPEEDUP) {
      const exact = Math.abs(ceiling - TARGET_SPEEDUP) < 1e-9;
      return {
        text: exact
          ? `🧱 撞墙了，而且是最刁钻的一种。串行 ${serialPct}%，天花板恰好压在 ${TARGET_SPEEDUP}x——` +
            `核数拉到无穷大也只能无限逼近，永远踩不到。买核这条路焊死了，去点「优化代码」。`
          : `🧱 撞墙了。串行 ${serialPct}%，天花板就是 ${ceiling.toFixed(1)}x。` +
            `核数拉到宇宙热寂也够不着 ${TARGET_SPEEDUP}x。买核这条路焊死了——去点「优化代码」。`,
        cls: 'warn'
      };
    }

    const minCores = L.minCoresForSpeedup(state.serial, TARGET_SPEEDUP);
    if (minCores !== null) {
      const gap = TARGET_SPEEDUP - speedup;
      return {
        text: `有戏，但还没到。理论上加到 ${minCores} 核就能压线达标（还差 ${gap.toFixed(2)}x）。` +
          `也可以反着来：优化代码把串行压到 ` +
          `${(L.serialFractionForCores(state.cores, TARGET_SPEEDUP) * 100).toFixed(1)}% 以下，这批核就不用换了。`,
        cls: ''
      };
    }
    return { text: '继续。', cls: '' };
  }

  // ===== 渲染 =====
  function render() {
    const speedup = L.amdahlSpeedup(state.serial, state.cores);
    const ceiling = L.ceilingSpeedup(state.serial);
    const time = L.timeMinutes(state.serial, state.cores, BASE_MINUTES);
    const eff = L.efficiency(state.serial, state.cores);
    const cost = (state.cores - 1) * COST_PER_CORE_WAN;

    els.serialValue.textContent = `${Math.round(state.serial * 100)}%`;
    els.coresValue.textContent = state.cores >= 1024 ? '1024 核（封顶）' : `${state.cores} 核`;
    els.speedup.textContent = `${speedup.toFixed(2)}x`;
    els.time.textContent = fmtMinutes(time);
    els.eff.textContent = `${Math.round(eff * 100)}%`;
    els.cost.textContent = `¥${cost} 万`;

    // 边际收益播报
    if (state.cores > 1) {
      const saved = L.marginalTimeSavedMinutes(state.serial, state.cores, BASE_MINUTES);
      els.ticker.textContent =
        `最新一颗核（第 ${state.cores} 颗）：+${L.marginalGain(state.serial, state.cores).toFixed(3)}x 加速，` +
        `每次任务只省 ${fmtSeconds(saved)}——¥${COST_PER_CORE_WAN} 万/年，` +
        `自己算算这笔账。`;
    } else {
      els.ticker.textContent = `每一颗核按 ¥${COST_PER_CORE_WAN} 万/年计费。基线：1 核跑 ${BASE_MINUTES} 分钟。`;
    }

    // 目标进度
    const progress = Math.min(100, (speedup / TARGET_SPEEDUP) * 100);
    els.progressFill.style.width = `${progress}%`;
    els.progressLabel.textContent = `目标进度 ${Math.round(progress)}%`;
    els.progress.setAttribute('aria-valuenow', Math.round(progress));

    // 判词
    const v = verdictText(speedup, ceiling);
    els.verdict.textContent = v.text;
    els.verdict.className = `verdict ${v.cls}`.trim();

    // 滑块同步（按核数反向映射，避免拖动时抖动）
    if (document.activeElement !== els.coresSlider) {
      els.coresSlider.value = coresToSlider(state.cores);
    }

    buildChart();
  }

  // ===== 事件 =====
  els.serialSlider.addEventListener('input', () => {
    state.serial = Number(els.serialSlider.value) / 100;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    render();
  });

  els.coresSlider.addEventListener('input', () => {
    state.cores = sliderToCores(Number(els.coresSlider.value));
    render();
  });

  els.presetRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    state.serial = Number(btn.dataset.serial) / 100;
    els.serialSlider.value = Math.round(state.serial * 100);
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });

  $('buy-1').addEventListener('click', () => {
    state.cores = Math.min(CORES_MAX, state.cores + 1);
    render();
  });
  $('buy-10').addEventListener('click', () => {
    state.cores = Math.min(CORES_MAX, state.cores + 10);
    render();
  });
  $('sell-10').addEventListener('click', () => {
    state.cores = Math.max(1, state.cores - 10);
    render();
  });
  $('refactor').addEventListener('click', () => {
    state.serial = Math.max(0, state.serial - 0.01);
    els.serialSlider.value = Math.round(state.serial * 100);
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    render();
  });
  $('reset').addEventListener('click', () => {
    state.serial = 0.25;
    state.cores = 1;
    els.serialSlider.value = 25;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.serial === '25'));
    render();
  });

  // ===== 启动 =====
  render();
})();
