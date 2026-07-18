/**
 * Canvas vs HTML/CSS 能力对决 - 前端交互逻辑
 * 依赖 canvas-vs-html-logic.js 提供的纯数据/计算函数
 */
(function () {
  'use strict';

  var L = window.CanvasVsHtmlLogic;
  if (!L) { console.error('CanvasVsHtmlLogic not loaded'); return; }

  // ── DOM 引用 ────────────────────────────────────────────
  var heroStats = document.getElementById('heroStats');
  var catTabs = document.getElementById('catTabs');
  var featureGrid = document.getElementById('featureGrid');
  var codeCompare = document.getElementById('codeCompare');
  var codeTaskDesc = document.getElementById('codeTaskDesc');
  var perfSlider = document.getElementById('perfSlider');
  var perfValue = document.getElementById('perfValue');
  var perfChart = document.getElementById('perfChart');
  var crossoverNote = document.getElementById('crossoverNote');
  var crossoverValue = document.getElementById('crossoverValue');
  var strengthGrid = document.getElementById('strengthGrid');
  var scoreSummary = document.getElementById('scoreSummary');
  var verdictBox = document.getElementById('verdictBox');
  var copyBtn = document.getElementById('copyBtn');
  var testList = document.getElementById('testList');
  var canvasDemoCanvas = document.getElementById('canvasDemoCanvas');
  var htmlDemoBtn = document.getElementById('htmlDemoBtn');

  // ── Hero 统计 ───────────────────────────────────────────
  function renderHeroStats() {
    var scores = L.computeFeatureScores();
    var complexity = L.getCodeComplexity();
    var crossover = L.findCrossoverPoint();

    heroStats.innerHTML =
      '<div class="stat-item"><span class="stat-value v-gold">' + scores.htmlScore + '%</span><span class="stat-label">HTML/CSS 特性得分</span></div>' +
      '<div class="stat-item"><span class="stat-value v-red">' + scores.canvasScore + '%</span><span class="stat-label">Canvas 特性得分</span></div>' +
      '<div class="stat-item"><span class="stat-value v-blue">' + complexity.ratio + 'x</span><span class="stat-label">Canvas 代码膨胀率</span></div>' +
      '<div class="stat-item"><span class="stat-value v-green">~' + crossover + '</span><span class="stat-label">性能交叉点(元素数)</span></div>';

    crossoverValue.textContent = '~' + crossover;
  }

  // ── Canvas Demo 按钮绘制 ────────────────────────────────
  var canvasBtn = { x: 20, y: 18, w: 160, h: 44, r: 8, hovered: false };

  function drawCanvasButton() {
    var ctx = canvasDemoCanvas.getContext('2d');
    ctx.clearRect(0, 0, 200, 80);
    
    // 圆角矩形
    ctx.beginPath();
    ctx.moveTo(canvasBtn.x + canvasBtn.r, canvasBtn.y);
    ctx.arcTo(canvasBtn.x + canvasBtn.w, canvasBtn.y, canvasBtn.x + canvasBtn.w, canvasBtn.y + canvasBtn.h, canvasBtn.r);
    ctx.arcTo(canvasBtn.x + canvasBtn.w, canvasBtn.y + canvasBtn.h, canvasBtn.x, canvasBtn.y + canvasBtn.h, canvasBtn.r);
    ctx.arcTo(canvasBtn.x, canvasBtn.y + canvasBtn.h, canvasBtn.x, canvasBtn.y, canvasBtn.r);
    ctx.arcTo(canvasBtn.x, canvasBtn.y, canvasBtn.x + canvasBtn.w, canvasBtn.y, canvasBtn.r);
    ctx.closePath();

    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = canvasBtn.hovered ? '#357abd' : '#4a90d9';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'white';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Click me', canvasBtn.x + canvasBtn.w / 2, canvasBtn.y + canvasBtn.h / 2);
  }

  function isInsideCanvasBtn(mx, my) {
    return mx >= canvasBtn.x && mx <= canvasBtn.x + canvasBtn.w &&
           my >= canvasBtn.y && my <= canvasBtn.y + canvasBtn.h;
  }

  canvasDemoCanvas.addEventListener('mousemove', function (e) {
    var rect = canvasDemoCanvas.getBoundingClientRect();
    var wasHovered = canvasBtn.hovered;
    canvasBtn.hovered = isInsideCanvasBtn(e.clientX - rect.left, e.clientY - rect.top);
    if (wasHovered !== canvasBtn.hovered) drawCanvasButton();
  });

  canvasDemoCanvas.addEventListener('mouseleave', function () {
    canvasBtn.hovered = false;
    drawCanvasButton();
  });

  canvasDemoCanvas.addEventListener('click', function (e) {
    var rect = canvasDemoCanvas.getBoundingClientRect();
    if (isInsideCanvasBtn(e.clientX - rect.left, e.clientY - rect.top)) {
      alert('Canvas 按钮被点击了！（但注意：Tab 键无法聚焦到这里）');
    }
  });

  drawCanvasButton();

  // HTML 按钮点击反馈
  htmlDemoBtn.addEventListener('click', function () {
    htmlDemoBtn.textContent = 'Clicked!';
    htmlDemoBtn.style.background = '#27ae60';
    setTimeout(function () {
      htmlDemoBtn.textContent = 'Click me';
      htmlDemoBtn.style.background = '';
    }, 800);
  });

  // ── 实验清单 ────────────────────────────────────────────
  var experiments = [
    { text: '用 Tab 键尝试聚焦按钮', htmlResult: '有焦点环', canvasResult: '无响应' },
    { text: '右键 → 检查/审查元素', htmlResult: '直接定位到 <button>', canvasResult: '只能看到 <canvas>' },
    { text: '浏览器 Ctrl+F 搜索 "Click"', htmlResult: '高亮匹配', canvasResult: '找不到' },
    { text: '用鼠标选中按钮文字', htmlResult: '可选中', canvasResult: '无法选中' },
    { text: '开启屏幕阅读器听一下', htmlResult: '读出「按钮：Click me」', canvasResult: '完全静默' }
  ];

  function renderTestList() {
    testList.innerHTML = experiments.map(function (exp) {
      return '<div class="test-item">' +
        '<span class="test-icon"><i class="ti ti-flask-2"></i></span>' +
        '<span class="test-text">' + exp.text + '</span>' +
        '<span class="test-result result-pass">HTML: ' + exp.htmlResult + '</span>' +
        '<span class="test-result result-fail">Canvas: ' + exp.canvasResult + '</span>' +
        '</div>';
    }).join('');
  }

  // ── 分类 Tab ────────────────────────────────────────────
  var currentCategory = 'all';

  function renderCatTabs() {
    var html = '<button class="cat-tab active" data-cat="all">全部</button>';
    L.getCategoryIds().forEach(function (id) {
      var cat = L.CATEGORIES[id];
      html += '<button class="cat-tab" data-cat="' + id + '"><i class="' + cat.icon + '"></i> ' + cat.name + '</button>';
    });
    catTabs.innerHTML = html;

    catTabs.addEventListener('click', function (e) {
      var tab = e.target.closest('.cat-tab');
      if (!tab) return;
      currentCategory = tab.dataset.cat;
      catTabs.querySelectorAll('.cat-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      renderFeatures();
    });
  }

  function supportLabel(level) {
    var labels = { native: '原生支持', partial: '部分支持', manual: '需手写', none: '无法实现' };
    return labels[level] || level;
  }

  function renderFeatures() {
    var features = currentCategory === 'all' ? L.FEATURES : L.getFeaturesByCategory(currentCategory);
    featureGrid.innerHTML = features.map(function (f) {
      return '<div class="feature-row">' +
        '<div><div class="feature-name">' + f.name + '</div><div class="feature-verdict">' + f.verdict + '</div></div>' +
        '<span class="support-badge support-' + f.htmlSupport + '">' + supportLabel(f.htmlSupport) + '</span>' +
        '<span class="support-badge support-' + f.canvasSupport + '">' + supportLabel(f.canvasSupport) + '</span>' +
        '</div>';
    }).join('');
  }

  // ── 代码对比 ────────────────────────────────────────────
  function renderCodeCompare() {
    var c = L.CODE_COMPARISON;
    codeTaskDesc.textContent = '任务：' + c.task;
    codeCompare.innerHTML =
      '<div class="code-panel"><div class="code-panel-header"><span class="code-panel-title">HTML + CSS</span><span class="code-panel-lines lines-html">' + c.html.lines + ' 行</span></div><pre>' + escapeHtml(c.html.code) + '</pre></div>' +
      '<div class="code-panel"><div class="code-panel-header"><span class="code-panel-title">Canvas JS</span><span class="code-panel-lines lines-canvas">' + c.canvas.lines + ' 行</span></div><pre>' + escapeHtml(c.canvas.code) + '</pre></div>';
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── 性能图表 ────────────────────────────────────────────
  var chartInstance = null;

  function renderPerfChart() {
    if (typeof Chart === 'undefined') {
      // Chart.js 还没加载，等待
      if (window.loadChartJS) {
        window.loadChartJS().then(renderPerfChart);
      }
      return;
    }

    var series = L.generatePerformanceSeries(L.DEFAULT_COUNTS);
    var labels = series.map(function (p) { return p.elementCount >= 1000 ? (p.elementCount / 1000) + 'k' : p.elementCount; });
    var domData = series.map(function (p) { return p.dom; });
    var canvasData = series.map(function (p) { return p.canvas; });

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(perfChart.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'DOM (HTML/CSS)',
            data: domData,
            borderColor: '#81c784',
            backgroundColor: 'rgba(129, 199, 132, 0.1)',
            tension: 0.3,
            fill: true
          },
          {
            label: 'Canvas',
            data: canvasData,
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#ccc' } },
          tooltip: {
            callbacks: {
              label: function (ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y + ' fps'; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '渲染元素数量', color: '#888' },
            ticks: { color: '#888' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: 'fps (帧/秒)', color: '#888' },
            ticks: { color: '#888' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            min: 0,
            max: 65
          }
        }
      }
    });
  }

  // 滑块控制
  function updatePerfSlider() {
    var count = parseInt(perfSlider.value, 10);
    var perf = L.simulatePerformance(count);
    perfValue.textContent = count >= 1000 ? (count / 1000).toFixed(1) + 'k 个' : count + ' 个';
    
    var crossover = L.findCrossoverPoint();
    if (perf.crossover) {
      crossoverNote.innerHTML = '<b>当前 ' + count + ' 个元素：</b>Canvas (' + perf.canvas + ' fps) > DOM (' + perf.dom + ' fps)。' +
        '超过约 <b>' + crossover + '</b> 个同质元素后，Canvas 批量渲染优势显现。';
    } else {
      crossoverNote.innerHTML = '<b>当前 ' + count + ' 个元素：</b>DOM (' + perf.dom + ' fps) > Canvas (' + perf.canvas + ' fps)。' +
        '日常 UI 元素量远低于交叉点 <b>' + crossover + '</b>，HTML/CSS 性能更优。';
    }
  }

  perfSlider.addEventListener('input', updatePerfSlider);

  // ── Canvas 擅长场景 ─────────────────────────────────────
  function renderStrengths() {
    strengthGrid.innerHTML = L.CANVAS_STRENGTHS.map(function (s) {
      return '<div class="strength-card">' +
        '<div class="strength-name"><i class="ti ti-check"></i> ' + s.name + '</div>' +
        '<div class="strength-reason">' + s.reason + '</div>' +
        '<div class="strength-typical">典型场景：' + s.typical + '</div>' +
        '</div>';
    }).join('');
  }

  // ── 结论区 ──────────────────────────────────────────────
  function renderVerdict() {
    var verdict = L.generateVerdict();
    var scores = verdict.scores;

    scoreSummary.innerHTML =
      '<div class="score-card score-card-html"><div class="score-title">HTML/CSS UI 特性得分</div><div class="score-number v-green">' + scores.htmlScore + '%</div><div class="score-sub">' + scores.htmlTotal + ' / ' + scores.maxTotal + ' 分</div></div>' +
      '<div class="score-card score-card-canvas"><div class="score-title">Canvas UI 特性得分</div><div class="score-number v-red">' + scores.canvasScore + '%</div><div class="score-sub">' + scores.canvasTotal + ' / ' + scores.maxTotal + ' 分</div></div>';

    verdictBox.innerHTML =
      '<div class="verdict-title">Canvas 能替代 HTML/CSS 吗？</div>' +
      '<div class="verdict-text">' + verdict.summary + '<br><br><b>建议：</b>' + verdict.recommendation + '</div>';
  }

  // ── 复制 ───────────────────────────────────────────────
  copyBtn.addEventListener('click', function () {
    var verdict = L.generateVerdict();
    var text = 'Canvas vs HTML/CSS 能力对决结论：\n\n' +
      verdict.summary + '\n\n' +
      '建议：' + verdict.recommendation + '\n\n' +
      '详细演示：https://numfeel.996.ninja/pages/canvas-vs-html/';
    navigator.clipboard.writeText(text).then(function () {
      copyBtn.innerHTML = '<i class="ti ti-check"></i> 已复制';
      setTimeout(function () { copyBtn.innerHTML = '<i class="ti ti-copy"></i> 复制结论'; }, 2000);
    });
  });

  // ── 初始化 ──────────────────────────────────────────────
  renderHeroStats();
  renderTestList();
  renderCatTabs();
  renderFeatures();
  renderCodeCompare();
  renderStrengths();
  renderVerdict();
  updatePerfSlider();

  // Chart.js 异步加载后绘制图表
  function initChart() {
    if (window.loadChartJS) {
      window.loadChartJS().then(renderPerfChart);
    } else {
      // header.js 可能还没执行完，轮询等待
      var attempts = 0;
      var timer = setInterval(function () {
        attempts++;
        if (window.loadChartJS) {
          clearInterval(timer);
          window.loadChartJS().then(renderPerfChart);
        } else if (attempts > 50) {
          clearInterval(timer);
          // 兜底：自己加载 Chart.js
          var s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
          s.onload = renderPerfChart;
          document.head.appendChild(s);
        }
      }, 100);
    }
  }
  initChart();

})();
