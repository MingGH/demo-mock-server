/**
 * 育碧帝国陨落 - 交互逻辑
 * 负责DOM绑定、图表渲染、动画
 */

(function () {
  'use strict';

  // ── 渲染时间线 ──
  function renderTimeline() {
    var container = document.getElementById('timeline');
    if (!container) return;
    var html = '';
    for (var i = 0; i < TIMELINE.length; i++) {
      var item = TIMELINE[i];
      html += '<div class="timeline-item ' + item.type + '" data-index="' + i + '">'
        + '<div class="timeline-date">' + item.date + '</div>'
        + '<div class="timeline-title">' + item.title + '</div>'
        + '<div class="timeline-desc">' + item.desc + '</div>'
        + '</div>';
    }
    container.innerHTML = html;

    // 点击展开/收起
    var items = container.querySelectorAll('.timeline-item');
    items.forEach(function (el) {
      el.addEventListener('click', function () {
        el.classList.toggle('expanded');
      });
    });
  }

  // ── 渲染作死四连击 ──
  function renderFatalBlows() {
    var container = document.getElementById('fatalBlows');
    if (!container) return;
    var html = '';
    for (var i = 0; i < FATAL_BLOWS.length; i++) {
      var blow = FATAL_BLOWS[i];
      html += '<div class="fatal-blow" data-index="' + i + '">'
        + '<div class="fatal-blow-header">'
        + '<div class="fatal-blow-title">' + blow.title + '</div>'
        + '<div class="fatal-blow-metric">'
        + '<div class="val">' + blow.metric + '</div>'
        + '<div class="lbl">' + blow.metricLabel + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="fatal-blow-detail">' + blow.detail + '</div>'
        + '</div>';
    }
    container.innerHTML = html;

    // 点击展开详情
    var blows = container.querySelectorAll('.fatal-blow');
    blows.forEach(function (el) {
      el.addEventListener('click', function () {
        el.classList.toggle('expanded');
      });
    });
  }

  // ── 渲染对比表格 ──
  function renderCompareTable() {
    var body = document.getElementById('compareBody');
    if (!body) return;
    var html = '';
    for (var i = 0; i < FINANCIAL_COMPARE.length; i++) {
      var row = FINANCIAL_COMPARE[i];
      var decline = calcDeclinePercent(row.peak, row.now);
      var isNegative = row.now < 0;

      // 格式化数字
      var peakDisplay, nowDisplay;
      if (row.unit === '亿欧元') {
        peakDisplay = row.peak + '';
        nowDisplay = isNegative ? row.now.toFixed(2) : row.now + '';
      } else if (row.unit === '人') {
        peakDisplay = row.peak.toLocaleString();
        nowDisplay = row.now.toLocaleString();
      } else {
        peakDisplay = row.peak + '';
        nowDisplay = row.now + '';
      }
      peakDisplay += ' ' + row.unit;
      nowDisplay += ' ' + row.unit;

      html += '<tr>'
        + '<td>' + row.metric + '</td>'
        + '<td class="num peak">' + peakDisplay + '</td>'
        + '<td class="num now">' + nowDisplay
        + '<span class="delta">▼ ' + decline + '%</span>'
        + '</td>'
        + '</tr>';
    }
    body.innerHTML = html;
  }

  // ── 市值变化图表 ──
  var marketCapChart = null;

  function getFilteredData(period) {
    var data = MARKET_CAP;
    if (period === 'decline') {
      data = MARKET_CAP.filter(function (d) { return d.date >= '2021.01'; });
    } else if (period === 'crash') {
      data = MARKET_CAP.filter(function (d) { return d.date >= '2024.09'; });
    }
    return data;
  }

  function renderMarketCapChart(period) {
    period = period || 'all';
    var canvas = document.getElementById('marketCapChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var data = getFilteredData(period);

    var labels = data.map(function (d) { return d.date; });
    var values = data.map(function (d) { return d.value; });

    if (marketCapChart) {
      marketCapChart.destroy();
    }

    // 渐变填充
    var gradient = ctx.createLinearGradient(0, 0, 0, 360);
    gradient.addColorStop(0, 'rgba(192, 57, 43, 0.15)');
    gradient.addColorStop(1, 'rgba(192, 57, 43, 0.0)');

    marketCapChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '市值（亿欧元）',
          data: values,
          borderColor: '#c0392b',
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: data.map(function (d) {
            if (d.date === '2018.07' || d.date === '2021.01') return '#2e7d32';
            return '#c0392b';
          }),
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a1a',
            titleFont: { family: 'Helvetica Neue, Arial, sans-serif', size: 13, weight: 'bold' },
            bodyFont: { family: 'Helvetica Neue, Arial, sans-serif', size: 12 },
            padding: 12,
            displayColors: false,
            callbacks: {
              afterLabel: function (ctx) {
                var idx = ctx.dataIndex;
                var d = data[idx];
                return d.event;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#eee', drawBorder: false },
            ticks: { font: { family: 'Helvetica Neue, Arial, sans-serif', size: 11 }, color: '#888' }
          },
          y: {
            grid: { color: '#eee', drawBorder: false },
            ticks: {
              font: { family: 'Helvetica Neue, Arial, sans-serif', size: 11 },
              color: '#888',
              callback: function (v) { return v + '亿'; }
            },
            beginAtZero: true
          }
        },
        onClick: function (evt, elements) {
          if (elements.length > 0) {
            var idx = elements[0].index;
            var d = data[idx];
            var highlight = document.getElementById('declineHighlight');
            if (highlight) {
              highlight.innerHTML = '<strong>' + d.date + '</strong> · 市值 ' + d.value + ' 亿欧元<br>' + d.event;
            }
          }
        }
      }
    });
  }

  // ── 成本对比图表 ──
  function renderCostChart() {
    var canvas = document.getElementById('costChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: COST_COMPARISON.map(function (d) { return d.name; }),
        datasets: [{
          data: COST_COMPARISON.map(function (d) { return d.cost; }),
          backgroundColor: COST_COMPARISON.map(function (d) {
            return d.name === '《碧海黑帆》' ? '#c0392b' : '#b8860b';
          }),
          borderRadius: 0,
          barThickness: 'flex',
          maxBarThickness: 60
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a1a',
            titleFont: { family: 'Helvetica Neue, Arial, sans-serif', size: 13 },
            bodyFont: { family: 'Helvetica Neue, Arial, sans-serif', size: 12 },
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function (ctx) {
                return '成本：' + ctx.parsed.x + ' 亿美元';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#eee', drawBorder: false },
            ticks: {
              font: { family: 'Helvetica Neue, Arial, sans-serif', size: 11 },
              color: '#888',
              callback: function (v) { return v + '亿'; }
            },
            beginAtZero: true
          },
          y: {
            grid: { display: false, drawBorder: false },
            ticks: { font: { family: 'Helvetica Neue, Arial, sans-serif', size: 12 }, color: '#333' }
          }
        }
      }
    });
  }

  // ── 时段切换按钮 ──
  function bindPeriodButtons() {
    var btns = document.querySelectorAll('#periodBtns .btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderMarketCapChart(btn.dataset.period);
      });
    });
  }

  // ── GSAP 滚动动画 ──
  function initAnimations() {
    if (typeof gsap === 'undefined') return;

    // 大数字计数动画
    gsap.from('.big-stat .number', {
      opacity: 0,
      y: 20,
      duration: 0.8,
      stagger: 0.15,
      ease: 'power2.out'
    });

    // 章节标题滑入
    gsap.utils.toArray('.section-title').forEach(function (title) {
      gsap.from(title, {
        opacity: 0,
        y: 30,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: title,
          start: 'top 85%'
        }
      });
    });

    // 时间线项目逐个出现
    gsap.from('.timeline-item', {
      opacity: 0,
      x: -20,
      duration: 0.4,
      stagger: 0.08,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#timeline',
        start: 'top 80%'
      }
    });

    // 作死四连击
    gsap.from('.fatal-blow', {
      opacity: 0,
      y: 20,
      duration: 0.5,
      stagger: 0.12,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#fatalBlows',
        start: 'top 80%'
      }
    });

    // 沉没成本条动画
    gsap.fromTo('#sunkBarSunk', { width: '0%' }, {
      width: '75%',
      duration: 1.2,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#sunkBar',
        start: 'top 85%'
      }
    });
    gsap.fromTo('#sunkBarActive', { width: '0%' }, {
      width: '25%',
      duration: 1.2,
      ease: 'power2.out',
      delay: 0.3,
      scrollTrigger: {
        trigger: '#sunkBar',
        start: 'top 85%'
      }
    });
  }

  // ── 初始化 ──
  function init() {
    renderTimeline();
    renderFatalBlows();
    renderCompareTable();
    renderMarketCapChart('all');
    renderCostChart();
    bindPeriodButtons();

    // 延迟初始化动画，确保GSAP和ScrollTrigger已加载
    if (typeof gsap !== 'undefined') {
      // 注册ScrollTrigger（内联方式，避免额外CDN依赖）
      if (typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
      }
      initAnimations();
    }
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
