/**
 * Penrose Tiling - 交互逻辑
 */
(function () {
  'use strict';

  var engine = window.PenroseEngine;
  var canvas = document.getElementById('penroseCanvas');
  var ctx = canvas.getContext('2d');

  // ── 状态 ──
  var state = {
    triangles: [],
    depth: 0,
    preset: 'sun',
    scheme: 'classic',
    strokeWidth: 1,
    showEdges: true,
    showArcs: false,
    // 画布变换
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    // 动画
    autoTimer: null,
    targetDepth: 6,
    interval: 1500
  };

  // ── 配色方案 ──
  var COLOR_SCHEMES = {
    classic: { kite: '#ff6b6b', dart: '#ffd700', stroke: '#2a2a4e', bg: '#0d1117' },
    ocean:   { kite: '#00b4d8', dart: '#90e0ef', stroke: '#023e8a', bg: '#0d1117' },
    forest:  { kite: '#81c784', dart: '#c8e6c9', stroke: '#1b5e20', bg: '#0d1117' },
    sunset:  { kite: '#ff8a65', dart: '#ffcc02', stroke: '#4e342e', bg: '#0d1117' },
    cosmic:  { kite: '#ce93d8', dart: '#e1bee7', stroke: '#4a148c', bg: '#0d1117' },
    mono:    { kite: '#e0e0e0', dart: '#757575', stroke: '#212121', bg: '#0d1117' },
    neon:    { kite: '#39ff14', dart: '#ff073a', stroke: '#0a0a0a', bg: '#050505' },
    pastel:  { kite: '#ffc3a0', dart: '#a0d2db', stroke: '#3d3d3d', bg: '#1a1a2e' },
    aurora:  { kite: '#00ffc8', dart: '#7b2ff7', stroke: '#0d1b2a', bg: '#0d1117' },
    ember:   { kite: '#ff4500', dart: '#ff8c00', stroke: '#1a0500', bg: '#0a0a0a' }
  };

  // ── 初始化 ──
  function init() {
    resizeCanvas();
    loadPreset('sun', 0);
    bindEvents();
    drawComparison();
  }

  function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = (window.innerWidth < 640 ? 360 : 520) * dpr;
    canvas.style.height = (window.innerWidth < 640 ? 360 : 520) + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function loadPreset(preset, depth) {
    state.preset = preset;
    var cx = canvas.width / (2 * (window.devicePixelRatio || 1));
    var cy = canvas.height / (2 * (window.devicePixelRatio || 1));
    var radius = Math.min(cx, cy) * 0.7;

    var base;
    if (preset === 'sun' || preset === 'sun5' || preset === 'sun7') {
      base = engine.createSun(0, 0, radius);
    } else {
      base = engine.createRhombus(0, 0, radius * 1.5);
    }

    var targetDepth = depth;
    if (preset === 'sun5' || preset === 'star5') targetDepth = 5;
    if (preset === 'sun7') targetDepth = 7;

    state.triangles = engine.subdivide(base, targetDepth);
    state.depth = targetDepth;

    // 重置视图
    state.offsetX = cx;
    state.offsetY = cy;
    state.scale = 1;

    updateStats();
    render();
  }

  // ── 渲染 ──
  function render() {
    var w = canvas.width / (window.devicePixelRatio || 1);
    var h = canvas.height / (window.devicePixelRatio || 1);
    var colors = COLOR_SCHEMES[state.scheme];

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.scale, state.scale);

    // 先填充所有三角形
    for (var i = 0; i < state.triangles.length; i++) {
      var t = state.triangles[i];
      ctx.beginPath();
      ctx.moveTo(t.v1[0], t.v1[1]);
      ctx.lineTo(t.v2[0], t.v2[1]);
      ctx.lineTo(t.v3[0], t.v3[1]);
      ctx.closePath();
      ctx.fillStyle = engine.isThick(t) ? colors.kite : colors.dart;
      ctx.fill();
    }

    // 再画外边（只画 v1→v2 和 v1→v3，不画 v2→v3 底边）
    if (state.showEdges) {
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = state.strokeWidth / state.scale;
      ctx.lineCap = 'round';
      for (var j = 0; j < state.triangles.length; j++) {
        var t2 = state.triangles[j];
        ctx.beginPath();
        ctx.moveTo(t2.v2[0], t2.v2[1]);
        ctx.lineTo(t2.v1[0], t2.v1[1]);
        ctx.lineTo(t2.v3[0], t2.v3[1]);
        ctx.stroke();
      }
    }

    // 弧线标记
    if (state.showArcs) {
      for (var k = 0; k < state.triangles.length; k++) {
        drawArc(state.triangles[k]);
      }
    }

    ctx.restore();
  }

  function drawArc(t) {
    // 在 v1 顶角处画小弧线
    var r = dist(t.v1, t.v2) * 0.25;
    var a1 = Math.atan2(t.v2[1] - t.v1[1], t.v2[0] - t.v1[0]);
    var a2 = Math.atan2(t.v3[1] - t.v1[1], t.v3[0] - t.v1[0]);
    var diff = a2 - a1;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    ctx.beginPath();
    if (diff > 0) {
      ctx.arc(t.v1[0], t.v1[1], r, a1, a2);
    } else {
      ctx.arc(t.v1[0], t.v1[1], r, a2, a1);
    }
    ctx.strokeStyle = engine.isThick(t) ? 'rgba(255,100,100,0.6)' : 'rgba(100,150,255,0.6)';
    ctx.lineWidth = 1.5 / state.scale;
    ctx.stroke();
  }

  function dist(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── 统计 ──
  function updateStats() {
    var total = state.triangles.length;
    var thick = 0, thin = 0;
    for (var i = 0; i < total; i++) {
      if (engine.isThick(state.triangles[i])) thick++;
      else thin++;
    }
    var ratio = thin > 0 ? (thick / thin).toFixed(3) : '∞';

    setText('statTotal', total);
    setText('statKite', thick);
    setText('statDart', thin);
    setText('statRatio', ratio);
    setText('statDepth', state.depth);
    setText('lblDepth', state.depth);
    setText('lblCount', total);
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── 事件绑定 ──
  function bindEvents() {
    // 细分按钮
    document.getElementById('btnSubdivide').addEventListener('click', function () {
      state.triangles = engine.subdivideOnce(state.triangles);
      state.depth++;
      updateStats();
      render();
    });

    // 重置
    document.getElementById('btnReset').addEventListener('click', function () {
      stopAutoPlay();
      loadPreset(state.preset, 0);
    });

    // 适应画布
    document.getElementById('btnFitView').addEventListener('click', function () {
      var w = canvas.width / (window.devicePixelRatio || 1);
      var h = canvas.height / (window.devicePixelRatio || 1);
      state.offsetX = w / 2;
      state.offsetY = h / 2;
      state.scale = 1;
      render();
    });

    // 导出PNG
    document.getElementById('btnExport').addEventListener('click', function () {
      var link = document.createElement('a');
      link.download = 'penrose-tiling-depth-' + state.depth + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    // 预设卡片
    document.querySelectorAll('.preset-card').forEach(function (card) {
      card.addEventListener('click', function () {
        document.querySelectorAll('.preset-card').forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        stopAutoPlay();
        loadPreset(card.dataset.preset, 0);
      });
    });

    // 配色
    document.querySelectorAll('.swatch').forEach(function (swatch) {
      swatch.addEventListener('click', function () {
        document.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('active'); });
        swatch.classList.add('active');
        state.scheme = swatch.dataset.scheme;
        render();
        drawComparison();
      });
    });

    // 描边
    var sliderStroke = document.getElementById('sliderStroke');
    sliderStroke.addEventListener('input', function () {
      state.strokeWidth = parseFloat(this.value);
      setText('lblStroke', this.value);
      render();
    });

    // 显示边线
    document.getElementById('chkShowEdges').addEventListener('change', function () {
      state.showEdges = this.checked;
      render();
    });

    // 显示弧线
    document.getElementById('chkShowArcs').addEventListener('change', function () {
      state.showArcs = this.checked;
      render();
    });

    // 自动播放
    document.getElementById('btnAutoPlay').addEventListener('click', startAutoPlay);
    document.getElementById('btnAutoStop').addEventListener('click', stopAutoPlay);

    var sliderInterval = document.getElementById('sliderInterval');
    sliderInterval.addEventListener('input', function () {
      state.interval = parseFloat(this.value) * 1000;
      setText('lblInterval', this.value);
    });

    var sliderTarget = document.getElementById('sliderTarget');
    sliderTarget.addEventListener('input', function () {
      state.targetDepth = parseInt(this.value);
      setText('lblTarget', this.value);
    });

    // 拖拽平移
    bindDrag();

    // 窗口大小变化
    window.addEventListener('resize', function () {
      resizeCanvas();
      render();
      drawComparison();
    });
  }

  // ── 拖拽与缩放 ──
  function bindDrag() {
    var dragging = false;
    var lastX = 0, lastY = 0;

    canvas.addEventListener('mousedown', function (e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      state.offsetX += e.clientX - lastX;
      state.offsetY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      render();
    });
    window.addEventListener('mouseup', function () { dragging = false; });

    // 滚轮缩放
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = e.deltaY > 0 ? 0.9 : 1.1;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;

      state.offsetX = mx - (mx - state.offsetX) * factor;
      state.offsetY = my - (my - state.offsetY) * factor;
      state.scale *= factor;
      render();
    }, { passive: false });

    // 触摸
    var lastDist = 0;
    var lastTouchX = 0, lastTouchY = 0;

    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        dragging = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        dragging = false;
        lastDist = getTouchDist(e.touches);
      }
    });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (e.touches.length === 1 && dragging) {
        state.offsetX += e.touches[0].clientX - lastTouchX;
        state.offsetY += e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        render();
      } else if (e.touches.length === 2) {
        var d = getTouchDist(e.touches);
        var factor = d / lastDist;
        state.scale *= factor;
        lastDist = d;
        render();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function () { dragging = false; });
  }

  function getTouchDist(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── 自动播放 ──
  function startAutoPlay() {
    stopAutoPlay();
    // 从当前预设重置开始
    loadPreset(state.preset, 0);
    state.autoTimer = setInterval(function () {
      if (state.depth >= state.targetDepth) {
        stopAutoPlay();
        return;
      }
      state.triangles = engine.subdivideOnce(state.triangles);
      state.depth++;
      updateStats();
      render();
    }, state.interval);
  }

  function stopAutoPlay() {
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
  }

  // ── 对比画布 ──
  function drawComparison() {
    drawPeriodicTiling();
    drawAperiodicTiling();
  }

  function drawPeriodicTiling() {
    var c = document.getElementById('periodicCanvas');
    if (!c) return;
    var rect = c.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = 200 * dpr;
    c.style.height = '200px';
    var ctx2 = c.getContext('2d');
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);

    var w = rect.width, h = 200;
    var colors = COLOR_SCHEMES[state.scheme];
    ctx2.fillStyle = colors.bg;
    ctx2.fillRect(0, 0, w, h);

    // 画正菱形周期铺砖
    var size = 24;
    var cos60 = Math.cos(Math.PI / 3);
    var sin60 = Math.sin(Math.PI / 3);

    for (var row = -2; row < h / (size * sin60) + 2; row++) {
      for (var col = -2; col < w / size + 2; col++) {
        var x = col * size + (row % 2) * size * 0.5;
        var y = row * size * sin60;

        // 菱形 1
        ctx2.beginPath();
        ctx2.moveTo(x, y);
        ctx2.lineTo(x + size * cos60, y + size * sin60);
        ctx2.lineTo(x + size, y);
        ctx2.lineTo(x + size * (1 - cos60), y - size * sin60);
        ctx2.closePath();
        ctx2.fillStyle = (row + col) % 2 === 0 ? colors.kite : colors.dart;
        ctx2.fill();
        ctx2.strokeStyle = colors.stroke;
        ctx2.lineWidth = 0.5;
        ctx2.stroke();
      }
    }
  }

  function drawAperiodicTiling() {
    var c = document.getElementById('aperiodioCanvas');
    if (!c) return;
    var rect = c.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = 200 * dpr;
    c.style.height = '200px';
    var ctx2 = c.getContext('2d');
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);

    var w = rect.width, h = 200;
    var colors = COLOR_SCHEMES[state.scheme];
    ctx2.fillStyle = colors.bg;
    ctx2.fillRect(0, 0, w, h);

    // 生成一个小型 Penrose 铺砖
    var radius = Math.min(w, h) * 0.45;
    var base = engine.createSun(0, 0, radius);
    var tris = engine.subdivide(base, 4);

    ctx2.save();
    ctx2.translate(w / 2, h / 2);
    var s = 0.9;
    ctx2.scale(s, s);

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      ctx2.beginPath();
      ctx2.moveTo(t.v1[0], t.v1[1]);
      ctx2.lineTo(t.v2[0], t.v2[1]);
      ctx2.lineTo(t.v3[0], t.v3[1]);
      ctx2.closePath();
      ctx2.fillStyle = engine.isThick(t) ? colors.kite : colors.dart;
      ctx2.fill();
    }
    // 外边
    ctx2.strokeStyle = colors.stroke;
    ctx2.lineWidth = 0.5 / s;
    for (var j = 0; j < tris.length; j++) {
      var t2 = tris[j];
      ctx2.beginPath();
      ctx2.moveTo(t2.v2[0], t2.v2[1]);
      ctx2.lineTo(t2.v1[0], t2.v1[1]);
      ctx2.lineTo(t2.v3[0], t2.v3[1]);
      ctx2.stroke();
    }
    ctx2.restore();
  }

  // ── 启动 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
