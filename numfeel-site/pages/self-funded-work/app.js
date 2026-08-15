/* self-funded-work 交互层
 * 从 window.SFW_DATA 读取数据，渲染纸感手绘图表，并用 GSAP 做滚动节奏。
 * 只读数据、只写 canvas，不干预正文结构。
 */
(function () {
  'use strict';

  var DATA = window.SFW_DATA;
  if (!DATA) return;

  var IS_MOBILE = window.innerWidth <= 480;

  var INK = '#17130f';
  var RED = '#a51c30';
  var MUTED = '#6c6557';
  var PAPER = '#f6f2e8';
  var GRID = 'rgba(23,19,15,0.08)';
  var SERIF = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", Georgia, serif';

  /* 确定性伪随机：让手绘抖动每次渲染都一致，不闪 */
  function seededRand(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  /* 纸感手绘插件：在每根柱子的取值端，画一条轻微抖动的墨线 */
  var roughBars = {
    id: 'roughBars',
    afterDatasetsDraw: function (chart) {
      var meta = chart.getDatasetMeta(0);
      if (!meta || meta.type !== 'bar' || !meta.data) return;
      var horizontal = chart.config.options.indexAxis === 'y';
      var ctx = chart.ctx;
      ctx.save();
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      meta.data.forEach(function (bar, i) {
        var ds = chart.data.datasets[0];
        var color = ds.backgroundColor;
        if (Array.isArray(color)) color = color[i % color.length];
        ctx.strokeStyle = color || INK;
        var x = bar.x, y = bar.y, w = bar.width, h = bar.height;
        var amp, steps = 5, s, px, py;
        ctx.beginPath();
        if (horizontal) {
          amp = Math.max(1.2, h * 0.06);
          for (s = 0; s <= steps; s++) {
            px = x + (seededRand(i * 13 + s) - 0.5) * amp;
            py = y - h / 2 + (h * s / steps);
            if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
        } else {
          amp = Math.max(1.2, w * 0.06);
          for (s = 0; s <= steps; s++) {
            px = x - w / 2 + (w * s / steps);
            py = y + (seededRand(i * 13 + s) - 0.5) * amp;
            if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      });
      ctx.restore();
    }
  };

  /* 构造柱状图配置 */
  function makeChart(id, labels, values, opt) {
    var el = document.getElementById(id);
    if (!el) return null;
    var horizontal = !!opt.horizontal;
    var highlight = opt.highlight || [];
    var colors = values.map(function (v, i) {
      return highlight.indexOf(i) !== -1 ? RED : INK;
    });

    var valueAxis = horizontal ? 'x' : 'y';
    var catAxis = horizontal ? 'y' : 'x';

    var scales = {};
    scales[valueAxis] = {
      grid: { color: GRID, borderDash: [3, 4], drawBorder: false },
      border: { display: false },
      ticks: {
        color: MUTED,
        font: { family: SERIF, size: IS_MOBILE ? 10.5 : 12 },
        callback: function (val) {
          if (opt.axisSuffix === '%') return val + '%';
          if (opt.axisSuffix === 'money') return '¥' + val;
          return val;
        }
      }
    };
    if (opt.max != null) scales[valueAxis].max = opt.max;
    if (opt.min != null) scales[valueAxis].min = opt.min;

    scales[catAxis] = {
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: INK,
        font: { family: SERIF, size: IS_MOBILE ? 11 : 13, weight: '600' },
        maxRotation: 0,
        autoSkip: true
      }
    };

    return new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
          barThickness: horizontal ? 20 : undefined,
          maxBarThickness: horizontal ? 24 : (IS_MOBILE ? 34 : 48),
          categoryPercentage: horizontal ? 0.72 : 0.62,
          barPercentage: horizontal ? 0.9 : 0.82
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        animation: { duration: 1000, easing: 'easeOutQuart' },
        layout: { padding: { top: 6 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: PAPER,
            titleColor: INK,
            bodyColor: INK,
            titleFont: { family: SERIF, weight: '700' },
            bodyFont: { family: SERIF },
            borderColor: INK,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function (c) {
                var v = c.parsed[horizontal ? 'x' : 'y'];
                if (opt.suffix === '%') return ' ' + v + '%';
                if (opt.suffix === 'money') return ' ¥' + v + ' / 月';
                return ' ' + v;
              }
            }
          }
        }
      },
      plugins: [roughBars]
    });
  }

  /* 懒加载渲染：滚到才画，入场动画才可见 */
  function initCharts() {
    if (!window.Chart) return;
    var defs = [
      { id: 'billChart', key: 'bill', opt: { suffix: 'money', axisSuffix: 'money' } },
      { id: 'epochaiChart', key: 'epochai', opt: { horizontal: true, suffix: '%', axisSuffix: '%', max: 100, highlight: [0] } },
      { id: 'nandaChart', key: 'nanda', opt: { suffix: '%', axisSuffix: '%', max: 100, highlight: [0] } },
      { id: 'stackChart', key: 'stack', opt: { suffix: '%', axisSuffix: '%', max: 100, highlight: [1] } }
    ];

    function build(def) {
      var d = DATA[def.key];
      if (!d) return;
      var labels = (IS_MOBILE && d.shortLabels) ? d.shortLabels : d.labels;
      makeChart(def.id, labels, d.values, def.opt);
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var def = entry.target.__chartDef;
            if (def) build(def);
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.25 });
      defs.forEach(function (def) {
        var el = document.getElementById(def.id);
        if (el) { el.__chartDef = def; io.observe(el); }
      });
    } else {
      defs.forEach(build);
    }
  }

  /* 滚动节奏：报纸式淡入，不弹跳 */
  function animate() {
    if (!window.gsap) return;

    gsap.from('.masthead', { autoAlpha: 0, y: -12, duration: 0.7, ease: 'power2.out' });
    gsap.from('.headline-block > *', { autoAlpha: 0, y: 22, duration: 0.9, ease: 'power3.out', stagger: 0.1, delay: 0.15 });

    if (!window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('.reveal').forEach(function (el) {
      gsap.fromTo(el, { autoAlpha: 0, y: 28 }, {
        autoAlpha: 1, y: 0, duration: 0.85, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { initCharts(); animate(); });
    } else {
      initCharts();
      animate();
    }
  }

  init();
})();
