// ========== 游戏体积膨胀分析 - 页面交互逻辑 ==========

// ── 状态 ──
var timelineChart = null;
var breakdownChart = null;
var comparisonChart = null;
var chartsInitialized = false;

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', function() {
  renderFactorCards();
  renderBreakdownLegend();
  initScrollAnimations();
  initComparisonBars();
  initCountUp();
  initCharts();
});

// ════════════════════════════════════════
// 滚动触发动画（GSAP ScrollTrigger）
// ════════════════════════════════════════
function initScrollAnimations() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  // 通用 fade-up / fade-in 元素
  document.querySelectorAll('[data-reveal]').forEach(function(el) {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: function() { el.classList.add('is-visible'); },
      onLeaveBack: function() { el.classList.remove('is-visible'); }
    });
  });

  // 因素卡片逐个淡入
  document.querySelectorAll('.factor-card').forEach(function(card, i) {
    ScrollTrigger.create({
      trigger: card,
      start: 'top 90%',
      onEnter: function() {
        gsap.to(card, { opacity: 1, y: 0, duration: 0.6, delay: i * 0.1, ease: 'power2.out' });
      }
    });
  });
}

// ════════════════════════════════════════
// 代码 vs 资产对比条动画
// ════════════════════════════════════════
function initComparisonBars() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    // 降级：直接显示
    document.querySelectorAll('.compare-bar').forEach(function(bar) {
      bar.classList.add('is-visible');
      var fill = bar.querySelector('.compare-fill');
      if (fill) fill.style.width = fill.getAttribute('data-width') + '%';
    });
    return;
  }

  document.querySelectorAll('.compare-bar').forEach(function(bar, i) {
    ScrollTrigger.create({
      trigger: bar,
      start: 'top 85%',
      onEnter: function() {
        bar.classList.add('is-visible');
        var fill = bar.querySelector('.compare-fill');
        if (fill) {
          var w = parseFloat(fill.getAttribute('data-width'));
          // 代码条最小可见宽度
          var minWidth = w < 5 ? 3 : w;
          gsap.to(fill, { width: minWidth + '%', duration: 1.5, delay: i * 0.2, ease: 'power2.out' });
        }
      },
      onLeaveBack: function() {
        bar.classList.remove('is-visible');
        var fill = bar.querySelector('.compare-fill');
        if (fill) gsap.to(fill, { width: 0, duration: 0.3 });
      }
    });
  });
}

// ════════════════════════════════════════
// 数字递增动画
// ════════════════════════════════════════
function initCountUp() {
  var el = document.getElementById('ratio-number');
  if (!el) return;

  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    var obj = { val: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: function() {
        gsap.to(obj, {
          val: 0.18,
          duration: 2,
          ease: 'power2.out',
          onUpdate: function() {
            el.textContent = obj.val.toFixed(2);
          }
        });
      }
    });
  } else {
    el.textContent = '0.18';
  }
}

// ════════════════════════════════════════
// 渲染膨胀因素卡片
// ════════════════════════════════════════
function renderFactorCards() {
  var grid = document.getElementById('factorsGrid');
  if (!grid || typeof GROWTH_FACTORS === 'undefined') return;

  GROWTH_FACTORS.forEach(function(f) {
    var card = document.createElement('div');
    card.className = 'factor-card';
    card.innerHTML =
      '<div class="factor-icon"><i class="ti ' + f.icon + '"></i></div>' +
      '<div class="factor-body">' +
        '<div class="factor-title">' + f.title + '</div>' +
        '<div class="factor-desc">' + f.description + '</div>' +
      '</div>' +
      '<div class="factor-stat">' +
        '<div class="val">' + f.stat + '</div>' +
        '<div class="lbl">' + f.statLabel + '</div>' +
      '</div>';
    grid.appendChild(card);
  });
}

// ════════════════════════════════════════
// 渲染内容拆解图例
// ════════════════════════════════════════
function renderBreakdownLegend() {
  var wrap = document.getElementById('breakdownLegend');
  if (!wrap || typeof CONTENT_BREAKDOWN === 'undefined') return;

  CONTENT_BREAKDOWN.forEach(function(item) {
    var el = document.createElement('div');
    el.className = 'legend-item';
    el.innerHTML =
      '<div class="legend-dot" style="background:' + item.color + '"></div>' +
      '<span>' + item.category + ' · ' + item.percentage + '%</span>';
    wrap.appendChild(el);
  });
}

// ════════════════════════════════════════
// 图表初始化
// ════════════════════════════════════════
function initCharts() {
  if (typeof Chart === 'undefined') return;

  // 使用 IntersectionObserver 或 ScrollTrigger 延迟初始化
  if (typeof ScrollTrigger !== 'undefined' && typeof gsap !== 'undefined') {
    var sections = ['#timeline-section', '#breakdown-section', '#comparison-section'];
    sections.forEach(function(sel, i) {
      var el = document.querySelector(sel);
      if (el) {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 80%',
          once: true,
          onEnter: function() {
            if (i === 0) renderTimelineChart();
            if (i === 1) renderBreakdownChart();
            if (i === 2) renderComparisonChart();
          }
        });
      }
    });
  } else {
    // 降级：直接渲染
    renderTimelineChart();
    renderBreakdownChart();
    renderComparisonChart();
  }
}

// ── 时间线图表 ──
function renderTimelineChart() {
  var ctx = document.getElementById('timelineChart');
  if (!ctx || typeof TF2_TIMELINE === 'undefined') return;

  timelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: TF2_TIMELINE.map(function(d) { return d.year; }),
      datasets: [{
        label: '安装体积 (GB)',
        data: TF2_TIMELINE.map(function(d) { return d.sizeGB; }),
        borderColor: '#c8392c',
        backgroundColor: function(ctx) {
          var chart = ctx.chart;
          var area = chart.chartArea;
          if (!area) return 'rgba(200,57,44,0.1)';
          var grad = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          grad.addColorStop(0, 'rgba(200,57,44,0.35)');
          grad.addColorStop(1, 'rgba(200,57,44,0.02)');
          return grad;
        },
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: '#c8392c',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18,18,18,0.95)',
          titleColor: '#c8392c',
          bodyColor: '#e8e3db',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: function(items) {
              var idx = items[0].dataIndex;
              return TF2_TIMELINE[idx].year + ' 年';
            },
            label: function(item) {
              var idx = item.dataIndex;
              var d = TF2_TIMELINE[idx];
              return [d.sizeGB + ' GB', d.event];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#888', font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#888',
            font: { size: 11 },
            callback: function(v) { return v + ' GB'; }
          }
        }
      }
    }
  });
}

// ── 内容拆解图表（环形图） ──
function renderBreakdownChart() {
  var ctx = document.getElementById('breakdownChart');
  if (!ctx || typeof CONTENT_BREAKDOWN === 'undefined') return;

  breakdownChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: CONTENT_BREAKDOWN.map(function(d) { return d.category; }),
      datasets: [{
        data: CONTENT_BREAKDOWN.map(function(d) { return d.sizeGB; }),
        backgroundColor: CONTENT_BREAKDOWN.map(function(d) { return d.color; }),
        borderColor: 'rgba(18,18,18,0.8)',
        borderWidth: 2,
        hoverOffset: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18,18,18,0.95)',
          titleColor: '#c8392c',
          bodyColor: '#e8e3db',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(item) {
              var d = CONTENT_BREAKDOWN[item.dataIndex];
              return [d.category + ': ' + d.sizeGB + ' GB', d.description];
            }
          }
        }
      }
    }
  });
}

// ── 游戏对比图表（水平柱状图） ──
function renderComparisonChart() {
  var ctx = document.getElementById('gameComparisonChart');
  if (!ctx || typeof GAME_COMPARISON === 'undefined') return;

  // 按体积排序
  var sorted = GAME_COMPARISON.slice().sort(function(a, b) {
    return a.sizeGB - b.sizeGB;
  });

  comparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(function(d) { return d.name + ' (' + d.year + ')'; }),
      datasets: [{
        label: '安装体积 (GB)',
        data: sorted.map(function(d) { return d.sizeGB; }),
        backgroundColor: sorted.map(function(d) { return d.color; }),
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18,18,18,0.95)',
          titleColor: '#c8392c',
          bodyColor: '#e8e3db',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(item) {
              var d = sorted[item.dataIndex];
              return d.sizeGB + ' GB';
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#888',
            font: { size: 10 },
            callback: function(v) {
              if (v >= 1) return v + ' GB';
              return v;
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#aaa', font: { size: 11 } }
        }
      }
    }
  });
}
