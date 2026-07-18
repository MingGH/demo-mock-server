// ========== 牛顿分形交互控制 ==========
// 依赖：engine.js（算法）、GSAP（动画）、Chart.js（按需加载）

(function () {
'use strict';

// ── 全局状态 ──
const state = {
  // 模块2：全局染色
  centerX: 0,
  centerY: 0,
  zoom: 1,
  equation: '3',        // '3' | '4' | '5' | 'custom'
  colorScheme: 'classic',
  maxIter: 100,
  renderGeneration: 0,
  isRendering: false,
  renderStartTime: 0,

  // 模块4：敏感性实验
  sensitivityChart: null,
  sensitivityEq: '3',   // 敏感性实验固定用 z³-1
};

// 模块4 chart 实例引用（便于 destroy）
let sensitivityChartInstance = null;

// 方程元信息：根数 + 显示名 + 视口默认中心
const EQ_META = {
  '3':      { roots: 3, label: 'z³ - 1',         center: [0, 0] },
  '4':      { roots: 4, label: 'z⁴ - 1',         center: [0, 0] },
  '5':      { roots: 5, label: 'z⁵ - 1',         center: [0, 0] },
  'custom': { roots: 3, label: 'z³ - 2z + 2',    center: [-0.3, 0] },
};

// 各根的中文显示名（用于收敛根标注）
const ROOT_NAMES = ['根 ①', '根 ②', '根 ③', '根 ④', '根 ⑤'];

// ============================================================
// 工具函数
// ============================================================

function formatZoom(z) {
  if (z >= 1e6) return (z / 1e6).toFixed(1) + 'M×';
  if (z >= 1e3) return (z / 1e3).toFixed(1) + 'K×';
  return z.toFixed(1) + '×';
}

function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toString();
}

function formatComplex(zr, zi, digits) {
  digits = digits || 4;
  const sign = zi >= 0 ? '+' : '-';
  return zr.toFixed(digits) + ' ' + sign + ' ' + Math.abs(zi).toFixed(digits) + 'i';
}

// 限制 DPR：移动端 cap 在 1.5x（性能优先），桌面端 cap 在 2x
function capDPR() {
  const dpr = window.devicePixelRatio || 1;
  const isMobile = window.innerWidth <= 680 || ('ontouchstart' in window);
  return Math.min(dpr, isMobile ? 1.5 : 2);
}

// 取得方程对应的 stepFn 和 roots
function getEquationRunner(eq) {
  if (eq === 'custom') {
    return {
      stepFn: function (zr, zi) { return newtonStepCustom(zr, zi, CUSTOM_F, CUSTOM_FP); },
      roots: CUSTOM_ROOTS,
    };
  }
  const n = parseInt(eq, 10);
  return {
    stepFn: function (zr, zi) { return newtonStepN(zr, zi, n); },
    roots: getRoots(n),
  };
}

// ============================================================
// Hero "开始探索" 按钮
// ============================================================
function initHero() {
  const btn = document.getElementById('startBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    const target = document.getElementById('tracker');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// ============================================================
// 模块 1：单点追踪
// ============================================================
const tracker = {
  canvas: null,
  ctx: null,
  viewMin: -2,
  viewMax: 2,
  currentZr: null,
  currentZi: null,
  animation: null,    // GSAP tween 对象
};

function initTracker() {
  tracker.canvas = document.getElementById('trackerCanvas');
  tracker.ctx = tracker.canvas.getContext('2d');
  setupTrackerCanvas();
  setupTrackerPresets();
  setupTrackerClick();
  drawTrackerBackground();

  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      setupTrackerCanvas();
      drawTrackerBackground();
      if (tracker.currentZr !== null) {
        redrawTrackerTrajectory();
      }
    }, 200);
  });
}

function setupTrackerCanvas() {
  const rect = tracker.canvas.parentElement.getBoundingClientRect();
  const dpr = capDPR();
  const size = Math.floor(rect.width * dpr);
  tracker.canvas.width = size;
  tracker.canvas.height = size;
}

// 像素坐标 -> 复数坐标（数学习惯：y 向上为虚部正）
function trackerPixelToComplex(px, py) {
  const w = tracker.canvas.width;
  const range = tracker.viewMax - tracker.viewMin;
  const scale = range / w;
  return {
    zr: tracker.viewMin + px * scale,
    zi: tracker.viewMax - py * scale,
  };
}

// 复数坐标 -> 像素坐标
function trackerComplexToPixel(zr, zi) {
  const w = tracker.canvas.width;
  const range = tracker.viewMax - tracker.viewMin;
  const scale = w / range;
  return {
    px: (zr - tracker.viewMin) * scale,
    py: (tracker.viewMax - zi) * scale,
  };
}

// 绘制背景：坐标轴 + 三个根
function drawTrackerBackground() {
  const ctx = tracker.ctx;
  const w = tracker.canvas.width;
  const range = tracker.viewMax - tracker.viewMin;

  // 深色背景
  ctx.fillStyle = '#0a0a1e';
  ctx.fillRect(0, 0, w, w);

  // 细网格
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const gridCount = 8;
  for (let i = 1; i < gridCount; i++) {
    const p = (i / gridCount) * w;
    ctx.beginPath();
    ctx.moveTo(p, 0); ctx.lineTo(p, w);
    ctx.moveTo(0, p); ctx.lineTo(w, p);
    ctx.stroke();
  }

  // 坐标轴
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.5;
  // 实部轴（y = 0，即虚部 = 0）
  const yAxis = trackerComplexToPixel(0, 0);
  ctx.beginPath();
  ctx.moveTo(0, yAxis.py); ctx.lineTo(w, yAxis.py);
  ctx.moveTo(yAxis.px, 0); ctx.lineTo(yAxis.px, w);
  ctx.stroke();

  // 三个根（z³=1）
  const roots = getRoots(3);
  const rootColors = ['#ffd700', '#90caf9', '#ce93d8'];
  roots.forEach(function (root, i) {
    const pos = trackerComplexToPixel(root.r, root.i);
    // 外发光
    ctx.beginPath();
    ctx.arc(pos.px, pos.py, 14, 0, Math.PI * 2);
    ctx.fillStyle = rootColors[i] + '33';
    ctx.fill();
    // 实心点
    ctx.beginPath();
    ctx.arc(pos.px, pos.py, 7, 0, Math.PI * 2);
    ctx.fillStyle = rootColors[i];
    ctx.fill();
    // 白色描边
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    // 标签
    ctx.fillStyle = rootColors[i];
    ctx.font = (12 * capDPR()) + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(ROOT_NAMES[i], pos.px + 12, pos.py - 8);
  });
}

// 绘制轨迹（不带动画，全量）
function drawTrackerTrajectory(trajectory, rootIndex) {
  if (!trajectory || trajectory.length === 0) return;
  const ctx = tracker.ctx;
  drawTrackerBackground();

  const color = rootIndex >= 0
    ? ['#ffd700', '#90caf9', '#ce93d8', '#81c784', '#ff6b6b'][rootIndex]
    : '#ff6b6b';

  // 连接线
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < trajectory.length; i++) {
    const p = trackerComplexToPixel(trajectory[i].zr, trajectory[i].zi);
    if (i === 0) ctx.moveTo(p.px, p.py);
    else ctx.lineTo(p.px, p.py);
  }
  ctx.stroke();

  // 每个点
  for (let i = 0; i < trajectory.length; i++) {
    const p = trackerComplexToPixel(trajectory[i].zr, trajectory[i].zi);
    const isStart = i === 0;
    const isEnd = i === trajectory.length - 1;
    ctx.beginPath();
    ctx.arc(p.px, p.py, isStart || isEnd ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isStart ? '#ffffff' : (isEnd ? color : color);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 步骤编号
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = (10 * capDPR()) + 'px monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < trajectory.length; i++) {
    const p = trackerComplexToPixel(trajectory[i].zr, trajectory[i].zi);
    ctx.fillText(i, p.px + 8, p.py - 6);
  }
}

function redrawTrackerTrajectory() {
  // 重新跑一次得到 trajectory（state 已经没有保存）
  if (tracker.currentZr === null) return;
  const result = newtonIterate(tracker.currentZr, tracker.currentZi, 3, 100, 1e-6);
  drawTrackerTrajectory(result.trajectory, result.rootIndex);
  updateTrackerSummary(tracker.currentZr, tracker.currentZi, result);
}

function setupTrackerPresets() {
  const grid = document.getElementById('trackerPresets');
  grid.innerHTML = '';
  SINGLE_POINT_PRESETS.forEach(function (p, i) {
    const btn = document.createElement('button');
    btn.className = 'tracker-preset-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="preset-name">' + p.name + '</span>' +
                    '<span class="preset-desc">' + p.desc + '</span>';
    btn.onclick = function () {
      document.querySelectorAll('.tracker-preset-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      runSinglePoint(p.zr, p.zi);
    };
    grid.appendChild(btn);
  });
}

function setupTrackerClick() {
  tracker.canvas.addEventListener('click', function (e) {
    const rect = tracker.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * tracker.canvas.width;
    const py = (e.clientY - rect.top) / rect.height * tracker.canvas.height;
    const c = trackerPixelToComplex(px, py);
    document.querySelectorAll('.tracker-preset-btn').forEach(function (b) { b.classList.remove('active'); });
    runSinglePoint(c.zr, c.zi);
  });
}

function runSinglePoint(zr, zi) {
  // 隐藏"点击画布选起点"提示
  const hint = document.getElementById('trackerHint');
  if (hint) hint.classList.add('hidden');

  tracker.currentZr = zr;
  tracker.currentZi = zi;

  // 取消上一次动画
  if (tracker.animation) tracker.animation.kill();

  const result = newtonIterate(zr, zi, 3, 100, 1e-6);
  updateTrackerSummary(zr, zi, result);

  // GSAP 逐步绘制轨迹
  const trajectory = result.trajectory;
  const total = trajectory.length;
  const proxy = { step: 0 };

  drawTrackerBackground();

  tracker.animation = gsap.to(proxy, {
    step: total - 1,
    duration: Math.min(0.05 * total + 0.5, 3),
    ease: 'power1.inOut',
    onUpdate: function () {
      const upto = Math.floor(proxy.step) + 1;
      const partial = trajectory.slice(0, Math.min(upto + 1, total));
      drawTrackerTrajectory(partial, result.rootIndex);
    },
    onComplete: function () {
      drawTrackerTrajectory(trajectory, result.rootIndex);
    },
  });
}

function updateTrackerSummary(zr, zi, result) {
  document.getElementById('trackerStart').textContent = formatComplex(zr, zi, 3);
  document.getElementById('trackerIter').textContent = result.iterations;

  const rootChip = document.getElementById('trackerRootChip');
  const rootEl = document.getElementById('trackerRoot');
  rootChip.classList.remove('root-0', 'root-1', 'root-2', 'root-3', 'root-4', 'fail');
  if (result.rootIndex >= 0) {
    rootEl.textContent = ROOT_NAMES[result.rootIndex];
    rootChip.classList.add('root-' + result.rootIndex);
  } else {
    rootEl.textContent = '未收敛';
    rootChip.classList.add('fail');
  }

  // 数据表
  const tbody = document.getElementById('trackerTableBody');
  tbody.innerHTML = '';
  const roots = getRoots(3);
  for (let i = 0; i < result.trajectory.length; i++) {
    const tr = document.createElement('tr');
    const z = result.trajectory[i];
    let distStr = '-';
    if (result.rootIndex >= 0) {
      const root = roots[result.rootIndex];
      const d = Math.sqrt((z.zr - root.r) ** 2 + (z.zi - root.i) ** 2);
      distStr = d < 1e-4 ? d.toExponential(2) : d.toFixed(6);
    }
    tr.innerHTML = '<td class="idx">' + i + '</td>' +
                   '<td>' + z.zr.toFixed(5) + ', ' + z.zi.toFixed(5) + '</td>' +
                   '<td class="dist">' + distStr + '</td>';
    tbody.appendChild(tr);
  }
}

// ============================================================
// 模块 2：全局染色
// ============================================================
const fractal = {
  canvas: null,
  ctx: null,
};

function initFractal() {
  fractal.canvas = document.getElementById('fractalCanvas');
  fractal.ctx = fractal.canvas.getContext('2d');
  setupFractalCanvas();
  setupFractalControls();
  setupFractalInteraction();
  setupMobileZoom();
  renderFractal();

  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      setupFractalCanvas();
      renderFractal();
    }, 200);
  });
}

function setupFractalCanvas() {
  const rect = fractal.canvas.parentElement.getBoundingClientRect();
  const dpr = capDPR();
  // Cap canvas pixels to avoid rendering too many on mobile
  const maxDim = window.innerWidth <= 680 ? 600 : 2200;
  fractal.canvas.width = Math.min(Math.floor(rect.width * dpr), maxDim);
  fractal.canvas.height = Math.min(Math.floor(rect.height * dpr), maxDim);
}

function setupFractalControls() {
  // 方程切换
  document.getElementById('equationGrid').addEventListener('click', function (e) {
    const btn = e.target.closest('.equation-btn');
    if (!btn) return;
    document.querySelectorAll('.equation-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    state.equation = btn.dataset.eq;
    // 切换方程时重置视口到该方程的默认中心
    const meta = EQ_META[state.equation];
    state.centerX = meta.center[0];
    state.centerY = meta.center[1];
    state.zoom = 1;
    clearPresetActive();
    renderFractal();
  });

  // 配色
  document.getElementById('colorOptions').addEventListener('click', function (e) {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    document.querySelectorAll('.color-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    state.colorScheme = btn.dataset.scheme;
    renderFractal();
  });

  // 迭代滑块
  const iterSlider = document.getElementById('iterSlider');
  iterSlider.oninput = function () {
    state.maxIter = parseInt(iterSlider.value, 10);
    document.getElementById('iterVal').textContent = state.maxIter;
  };
  iterSlider.onchange = function () { renderFractal(); };

  // 重置
  document.getElementById('resetBtn').onclick = function () {
    const meta = EQ_META[state.equation];
    state.centerX = meta.center[0];
    state.centerY = meta.center[1];
    state.zoom = 1;
    state.maxIter = 100;
    iterSlider.value = 100;
    document.getElementById('iterVal').textContent = 100;
    clearPresetActive();
    document.querySelector('.preset-btn[data-preset="0"]')?.classList.add('active');
    renderFractal();
  };

  // 下载
  document.getElementById('downloadBtn').onclick = downloadFractalImage;
}

function setupFractalInteraction() {
  fractal.canvas.addEventListener('click', onFractalClick);
  fractal.canvas.addEventListener('contextmenu', onFractalRightClick);
  fractal.canvas.addEventListener('wheel', onFractalWheel, { passive: false });
  setupFractalTouch();
}

function clearPresetActive() {
  document.querySelectorAll('#boundaryPresets .preset-btn').forEach(function (b) { b.classList.remove('active'); });
}

function onFractalClick(e) {
  if ('ontouchstart' in window) return;
  e.preventDefault();
  const pos = fractalCanvasToComplex(e);
  state.centerX = pos.cx;
  state.centerY = pos.cy;
  state.zoom *= 2.5;
  clearPresetActive();
  renderFractal();
}

function onFractalRightClick(e) {
  e.preventDefault();
  const pos = fractalCanvasToComplex(e);
  state.centerX = pos.cx;
  state.centerY = pos.cy;
  state.zoom = Math.max(0.5, state.zoom / 2.5);
  clearPresetActive();
  renderFractal();
}

function onFractalWheel(e) {
  e.preventDefault();
  const pos = fractalCanvasToComplex(e);
  const factor = e.deltaY < 0 ? 1.4 : 1 / 1.4;
  state.centerX += (pos.cx - state.centerX) * (1 - 1 / factor);
  state.centerY += (pos.cy - state.centerY) * (1 - 1 / factor);
  state.zoom *= factor;
  state.zoom = Math.max(0.5, state.zoom);
  clearPresetActive();
  renderFractal();
}

function fractalCanvasToComplex(e) {
  const rect = fractal.canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width * fractal.canvas.width;
  const py = (e.clientY - rect.top) / rect.height * fractal.canvas.height;
  return complexFromPixel(px, py);
}

function complexFromPixel(px, py) {
  const w = fractal.canvas.width;
  const h = fractal.canvas.height;
  const scale = 4.0 / (Math.min(w, h) * state.zoom);
  return {
    cx: state.centerX + (px - w / 2) * scale,
    cy: state.centerY + (py - h / 2) * scale,
  };
}

// 触摸手势
const touchState = {
  lastTap: 0,
  pinchStartDist: 0,
  pinchStartZoom: 0,
  isPinching: false,
  panStartX: 0,
  panStartY: 0,
  panCenterX: 0,
  panCenterY: 0,
  isPanning: false,
  moved: false,
};

function setupFractalTouch() {
  fractal.canvas.addEventListener('touchstart', onFractalTouchStart, { passive: false });
  fractal.canvas.addEventListener('touchmove', onFractalTouchMove, { passive: false });
  fractal.canvas.addEventListener('touchend', onFractalTouchEnd, { passive: false });
}

function onFractalTouchStart(e) {
  e.preventDefault();
  touchState.moved = false;
  if (e.touches.length === 2) {
    touchState.isPinching = true;
    touchState.isPanning = false;
    touchState.pinchStartDist = getTouchDist(e.touches);
    touchState.pinchStartZoom = state.zoom;
  } else if (e.touches.length === 1) {
    touchState.isPanning = true;
    touchState.isPinching = false;
    touchState.panStartX = e.touches[0].clientX;
    touchState.panStartY = e.touches[0].clientY;
    touchState.panCenterX = state.centerX;
    touchState.panCenterY = state.centerY;
  }
}

function onFractalTouchMove(e) {
  e.preventDefault();
  touchState.moved = true;
  if (touchState.isPinching && e.touches.length === 2) {
    const dist = getTouchDist(e.touches);
    const factor = dist / touchState.pinchStartDist;
    state.zoom = Math.max(0.5, touchState.pinchStartZoom * factor);
    clearPresetActive();
    throttledRender();
  } else if (touchState.isPanning && e.touches.length === 1) {
    const dx = e.touches[0].clientX - touchState.panStartX;
    const dy = e.touches[0].clientY - touchState.panStartY;
    const rect = fractal.canvas.getBoundingClientRect();
    const dpr = fractal.canvas.width / rect.width;
    const scale = 4.0 / (Math.min(fractal.canvas.width, fractal.canvas.height) * state.zoom);
    state.centerX = touchState.panCenterX - dx * dpr * scale;
    state.centerY = touchState.panCenterY - dy * dpr * scale;
    clearPresetActive();
    throttledRender();
  }
}

function onFractalTouchEnd(e) {
  e.preventDefault();
  if (e.touches.length < 2) touchState.isPinching = false;
  if (e.touches.length === 0) {
    if (!touchState.moved) {
      const now = Date.now();
      if (now - touchState.lastTap < 300) {
        const touch = e.changedTouches[0];
        const pos = fractalTouchToComplex(touch);
        state.centerX = pos.cx;
        state.centerY = pos.cy;
        state.zoom *= 2.5;
        clearPresetActive();
        renderFractal();
        touchState.lastTap = 0;
      } else {
        touchState.lastTap = now;
      }
    }
    touchState.isPanning = false;
  }
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function fractalTouchToComplex(touch) {
  const rect = fractal.canvas.getBoundingClientRect();
  const px = (touch.clientX - rect.left) / rect.width * fractal.canvas.width;
  const py = (touch.clientY - rect.top) / rect.height * fractal.canvas.height;
  return complexFromPixel(px, py);
}

// 触摸移动时节流渲染（避免每帧都渲染导致卡顿）
let _throttleRaf = null;
function throttledRender() {
  if (_throttleRaf) return;
  _throttleRaf = requestAnimationFrame(function () {
    _throttleRaf = null;
    renderFractal();
  });
}

// 分块渲染主入口
function renderFractal() {
  state.renderGeneration++;
  const thisGen = state.renderGeneration;
  state.isRendering = true;
  state.renderStartTime = performance.now();

  updateFractalInfo();
  const progressBar = document.getElementById('progressBar');
  progressBar.style.width = '0%';

  const w = fractal.canvas.width;
  const h = fractal.canvas.height;
  const imageData = fractal.ctx.createImageData(w, h);
  const data = imageData.data;

  // 根据缩放级别自动调整迭代次数
  const autoIter = Math.max(state.maxIter, Math.floor(100 + 60 * Math.log2(Math.max(1, state.zoom))));
  const effectiveIter = Math.min(autoIter, 500);

  const runner = getEquationRunner(state.equation);
  const roots = runner.roots;
  const stepFn = runner.stepFn;
  const tolerance = 1e-6;
  const scale = 4.0 / (Math.min(w, h) * state.zoom);
  const halfW = w / 2;
  const halfH = h / 2;

  // 统计
  let converged = 0;
  let unconverged = 0;
  let totalIter = 0;
  const rootCounts = new Array(roots.length).fill(0);

  // 移动端用更小的 chunk，让 UI 更流畅（每帧渲染更少行）
  const isMobile = window.innerWidth <= 680 || ('ontouchstart' in window);
  const CHUNK_ROWS = isMobile ? 8 : 16;
  let currentRow = 0;

  function renderChunk() {
    if (thisGen !== state.renderGeneration) return;

    const endRow = Math.min(currentRow + CHUNK_ROWS, h);
    for (let py = currentRow; py < endRow; py++) {
      const cy = state.centerY + (py - halfH) * scale;
      for (let px = 0; px < w; px++) {
        const cx = state.centerX + (px - halfW) * scale;
        const result = newtonIterateFast(cx, cy, stepFn, roots, effectiveIter, tolerance);
        const idx = (py * w + px) * 4;
        const color = getColor(result.rootIndex, result.iterations, effectiveIter, roots.length, state.colorScheme);
        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 255;

        if (result.rootIndex >= 0) {
          converged++;
          rootCounts[result.rootIndex]++;
          totalIter += result.iterations;
        } else {
          unconverged++;
        }
      }
    }

    currentRow = endRow;
    progressBar.style.width = (currentRow / h * 100) + '%';

    if (currentRow < h) {
      requestAnimationFrame(renderChunk);
    } else {
      fractal.ctx.putImageData(imageData, 0, 0);
      state.isRendering = false;
      progressBar.style.width = '100%';
      setTimeout(function () { progressBar.style.width = '0%'; }, 500);

      const elapsed = performance.now() - state.renderStartTime;
      const totalPixels = w * h;
      updateFractalStats(elapsed, totalPixels, converged, unconverged, totalIter, rootCounts);
    }
  }

  requestAnimationFrame(renderChunk);
}

function updateFractalInfo() {
  const sign = state.centerY >= 0 ? '+' : '-';
  document.getElementById('infoCenter').textContent =
    state.centerX.toFixed(6) + ' ' + sign + ' ' + Math.abs(state.centerY).toFixed(6) + 'i';
  document.getElementById('infoZoom').textContent = formatZoom(state.zoom);
  document.getElementById('infoEq').textContent = EQ_META[state.equation].label;
  document.getElementById('infoIter').textContent = state.maxIter;
  const mzl = document.getElementById('mobileZoomLevel');
  if (mzl) mzl.textContent = formatZoom(state.zoom);
}

function updateFractalStats(elapsed, totalPixels, converged, unconverged, totalIter, rootCounts) {
  document.getElementById('statTime').textContent = elapsed < 1000
    ? Math.round(elapsed) + 'ms'
    : (elapsed / 1000).toFixed(1) + 's';
  document.getElementById('statPixels').textContent = formatNumber(totalPixels);
  document.getElementById('statConverged').textContent =
    ((converged / totalPixels) * 100).toFixed(1) + '%';
  document.getElementById('statAvgIter').textContent =
    converged > 0 ? (totalIter / converged).toFixed(1) : '-';

  // 各根占比
  const shareEl = document.getElementById('rootShare');
  shareEl.innerHTML = '';
  rootCounts.forEach(function (count, i) {
    if (count === 0) return;
    const pct = (count / totalPixels * 100).toFixed(1);
    const item = document.createElement('span');
    item.className = 'share-item root-' + i;
    item.textContent = ROOT_NAMES[i] + ': ' + pct + '%';
    shareEl.appendChild(item);
  });
  if (unconverged > 0) {
    const pct = (unconverged / totalPixels * 100).toFixed(1);
    const item = document.createElement('span');
    item.className = 'share-item';
    item.style.background = 'rgba(255,107,107,0.15)';
    item.style.color = '#ff6b6b';
    item.textContent = '未收敛: ' + pct + '%';
    shareEl.appendChild(item);
  }
}

function downloadFractalImage() {
  const link = document.createElement('a');
  link.download = 'newton-fractal_' + EQ_META[state.equation].label.replace(/\s/g, '') +
                  '_' + state.zoom.toFixed(0) + 'x.png';
  link.href = fractal.canvas.toDataURL('image/png');
  link.click();
}

function setupMobileZoom() {
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  if (zoomInBtn) {
    zoomInBtn.onclick = function () {
      state.zoom *= 2;
      clearPresetActive();
      renderFractal();
    };
  }
  if (zoomOutBtn) {
    zoomOutBtn.onclick = function () {
      state.zoom = Math.max(0.5, state.zoom / 2);
      clearPresetActive();
      renderFractal();
    };
  }
}

// ============================================================
// 模块 3：放大边界预设
// ============================================================
function initBoundaryPresets() {
  const grid = document.getElementById('boundaryPresets');
  grid.innerHTML = '';
  NEWTON_PRESETS.forEach(function (p, i) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (i === 0 ? ' active' : '');
    btn.type = 'button';
    btn.dataset.preset = i;
    btn.innerHTML = '<div style="font-weight:600;">' + p.name + '</div>' +
                    '<div style="font-size:0.7rem; color:#888; margin-top:2px;">' + p.desc + '</div>';
    btn.onclick = function () {
      document.querySelectorAll('#boundaryPresets .preset-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      // 切换方程到预设的 n（预设都是 z^n-1 的边界点）
      if (p.n) {
        const targetEq = String(p.n);
        if (state.equation !== targetEq) {
          state.equation = targetEq;
          document.querySelectorAll('.equation-btn').forEach(function (b) { b.classList.remove('active'); });
          document.querySelector('.equation-btn[data-eq="' + targetEq + '"]')?.classList.add('active');
        }
      }

      // GSAP 动画缩放
      animateToViewport(p.x, p.y, p.zoom);

      // 滚动到全局染色画布
      const target = document.getElementById('global');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    grid.appendChild(btn);
  });
}

function animateToViewport(targetX, targetY, targetZoom) {
  const proxy = {
    x: state.centerX,
    y: state.centerY,
    z: state.zoom,
  };
  gsap.to(proxy, {
    x: targetX,
    y: targetY,
    z: targetZoom,
    duration: 1.2,
    ease: 'power2.inOut',
    onUpdate: function () {
      state.centerX = proxy.x;
      state.centerY = proxy.y;
      state.zoom = proxy.z;
      renderFractal();
    },
    onComplete: function () {
      renderFractal();
    },
  });
}

// ============================================================
// 模块 4：敏感性实验
// ============================================================
const sensitivity = {
  canvas: null,
  ctx: null,
  viewMin: -2,
  viewMax: 2,
  bgImageData: null,    // 缓存的背景渲染（低分辨率）
  pointA: null,
  pointB: null,
  animation: null,
};

function initSensitivity() {
  sensitivity.canvas = document.getElementById('sensitivityCanvas');
  sensitivity.ctx = sensitivity.canvas.getContext('2d');
  setupSensitivityCanvas();
  setupSensitivityClick();
  drawSensitivityBackground();

  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      setupSensitivityCanvas();
      drawSensitivityBackground();
      if (sensitivity.pointA) redrawSensitivity();
    }, 200);
  });
}

function setupSensitivityCanvas() {
  const rect = sensitivity.canvas.parentElement.getBoundingClientRect();
  const dpr = capDPR();
  const size = Math.floor(rect.width * dpr);
  sensitivity.canvas.width = size;
  sensitivity.canvas.height = size;
}

function sensitivityPixelToComplex(px, py) {
  const w = sensitivity.canvas.width;
  const range = sensitivity.viewMax - sensitivity.viewMin;
  const scale = range / w;
  return {
    zr: sensitivity.viewMin + px * scale,
    zi: sensitivity.viewMax - py * scale,
  };
}

function sensitivityComplexToPixel(zr, zi) {
  const w = sensitivity.canvas.width;
  const range = sensitivity.viewMax - sensitivity.viewMin;
  const scale = w / range;
  return {
    px: (zr - sensitivity.viewMin) * scale,
    py: (sensitivity.viewMax - zi) * scale,
  };
}

// 绘制背景：低分辨率全局染色作为指引
function drawSensitivityBackground() {
  const ctx = sensitivity.ctx;
  const w = sensitivity.canvas.width;
  const h = sensitivity.canvas.height;

  // 低分辨率渲染（缩放到 100×100 后放大）
  const lowRes = 100;
  const runner = getEquationRunner(sensitivity.sensitivityEq);
  const roots = runner.roots;
  const stepFn = runner.stepFn;
  const tolerance = 1e-6;
  const maxIter = 60;
  const scale = 4.0 / lowRes;
  const half = lowRes / 2;

  const offCanvas = document.createElement('canvas');
  offCanvas.width = lowRes;
  offCanvas.height = lowRes;
  const offCtx = offCanvas.getContext('2d');
  const imgData = offCtx.createImageData(lowRes, lowRes);
  const data = imgData.data;

  for (let py = 0; py < lowRes; py++) {
    const cy = (py - half) * scale;
    for (let px = 0; px < lowRes; px++) {
      const cx = (px - half) * scale;
      const result = newtonIterateFast(cx, cy, stepFn, roots, maxIter, tolerance);
      const color = getColor(result.rootIndex, result.iterations, maxIter, roots.length, 'classic');
      const idx = (py * lowRes + px) * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 120; // 半透明
    }
  }
  offCtx.putImageData(imgData, 0, 0);

  ctx.fillStyle = '#0a0a1e';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(offCanvas, 0, 0, w, h);

  // 标记三个根
  const rootColors = ['#ffd700', '#90caf9', '#ce93d8'];
  roots.forEach(function (root, i) {
    const pos = sensitivityComplexToPixel(root.r, root.i);
    ctx.beginPath();
    ctx.arc(pos.px, pos.py, 5, 0, Math.PI * 2);
    ctx.fillStyle = rootColors[i % rootColors.length];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function setupSensitivityClick() {
  sensitivity.canvas.addEventListener('click', function (e) {
    const rect = sensitivity.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * sensitivity.canvas.width;
    const py = (e.clientY - rect.top) / rect.height * sensitivity.canvas.height;
    const c = sensitivityPixelToComplex(px, py);
    runSensitivityExperiment(c.zr, c.zi);
  });
}

function runSensitivityExperiment(zrA, ziA) {
  const hint = document.getElementById('sensitivityHint');
  if (hint) hint.classList.add('hidden');

  // B 距 A 0.001，沿实部正方向偏移
  const zrB = zrA + 0.001;
  const ziB = ziA;

  sensitivity.pointA = { zr: zrA, zi: ziA };
  sensitivity.pointB = { zr: zrB, zi: ziB };

  const maxIter = 60;
  const tolerance = 1e-6;
  const resultA = newtonIterate(zrA, ziA, 3, maxIter, tolerance);
  const resultB = newtonIterate(zrB, ziB, 3, maxIter, tolerance);

  // 更新信息面板
  document.getElementById('pointA').textContent = formatComplex(zrA, ziA, 4);
  document.getElementById('pointB').textContent = formatComplex(zrB, ziB, 4);
  document.getElementById('rootA').textContent = resultA.rootIndex >= 0 ? ROOT_NAMES[resultA.rootIndex] : '未收敛';
  document.getElementById('rootB').textContent = resultB.rootIndex >= 0 ? ROOT_NAMES[resultB.rootIndex] : '未收敛';

  // 结论
  const conclusion = document.getElementById('sensitivityConclusion');
  if (resultA.rootIndex !== resultB.rootIndex && resultA.rootIndex >= 0 && resultB.rootIndex >= 0) {
    conclusion.innerHTML = '<i class="ti ti-alert-triangle"></i> 初始距离 0.001，最终收敛到不同的根--这就是边界处的混沌。点 A 走向 ' +
      ROOT_NAMES[resultA.rootIndex] + '，点 B 走向 ' + ROOT_NAMES[resultB.rootIndex] + '。';
  } else if (resultA.rootIndex === resultB.rootIndex && resultA.rootIndex >= 0) {
    conclusion.innerHTML = '<i class="ti ti-info-circle"></i> 两个点都收敛到了 ' + ROOT_NAMES[resultA.rootIndex] +
      '--你点到的位置离边界比较远，命运还稳定。试试在三种颜色交界处点击。';
  } else {
    conclusion.innerHTML = '<i class="ti ti-info-circle"></i> 至少一个点未在 ' + maxIter +
      ' 步内收敛--可能落在混沌深处。换一个位置再试。';
  }

  // 绘制双轨动画
  if (sensitivity.animation) sensitivity.animation.kill();

  drawSensitivityBackground();
  animateDualTrajectory(resultA.trajectory, resultB.trajectory, resultA.rootIndex, resultB.rootIndex);

  // 更新 chart
  updateSensitivityChart(resultA.trajectory, resultB.trajectory);
}

function animateDualTrajectory(trajA, trajB, rootA, rootB) {
  const total = Math.max(trajA.length, trajB.length);
  const proxy = { step: 0 };

  sensitivity.animation = gsap.to(proxy, {
    step: total - 1,
    duration: Math.min(0.04 * total + 0.6, 3),
    ease: 'power1.inOut',
    onUpdate: function () {
      const upto = Math.floor(proxy.step) + 1;
      const partialA = trajA.slice(0, Math.min(upto + 1, trajA.length));
      const partialB = trajB.slice(0, Math.min(upto + 1, trajB.length));
      drawDualTrajectory(partialA, partialB, rootA, rootB);
    },
    onComplete: function () {
      drawDualTrajectory(trajA, trajB, rootA, rootB);
    },
  });
}

function drawDualTrajectory(trajA, trajB, rootA, rootB) {
  drawSensitivityBackground();
  const ctx = sensitivity.ctx;

  const colorA = '#ffd700';
  const colorB = '#90caf9';

  // A 轨迹
  if (trajA.length > 0) {
    ctx.strokeStyle = colorA;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < trajA.length; i++) {
      const p = sensitivityComplexToPixel(trajA[i].zr, trajA[i].zi);
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    }
    ctx.stroke();
    trajA.forEach(function (z, i) {
      const p = sensitivityComplexToPixel(z.zr, z.zi);
      ctx.beginPath();
      ctx.arc(p.px, p.py, i === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = colorA;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // B 轨迹
  if (trajB.length > 0) {
    ctx.strokeStyle = colorB;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < trajB.length; i++) {
      const p = sensitivityComplexToPixel(trajB[i].zr, trajB[i].zi);
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    trajB.forEach(function (z, i) {
      const p = sensitivityComplexToPixel(z.zr, z.zi);
      ctx.beginPath();
      ctx.arc(p.px, p.py, i === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = colorB;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // 在 A 起点标注 "A" 和 "B"
  if (trajA.length > 0) {
    const pA = sensitivityComplexToPixel(trajA[0].zr, trajA[0].zi);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (12 * capDPR()) + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('A', pA.px + 8, pA.py - 6);
  }
  if (trajB.length > 0) {
    const pB = sensitivityComplexToPixel(trajB[0].zr, trajB[0].zi);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (12 * capDPR()) + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('B', pB.px + 8, pB.py - 6);
  }
}

function redrawSensitivity() {
  if (!sensitivity.pointA) return;
  // 重跑实验以重绘
  runSensitivityExperiment(sensitivity.pointA.zr, sensitivity.pointA.zi);
}

function updateSensitivityChart(trajA, trajB) {
  loadChartJS().then(function () {
    const ctx = document.getElementById('sensitivityChart').getContext('2d');
    // 计算每步距离
    const labels = [];
    const distances = [];
    const n = Math.max(trajA.length, trajB.length);
    for (let i = 0; i < n; i++) {
      labels.push(i);
      const a = trajA[Math.min(i, trajA.length - 1)];
      const b = trajB[Math.min(i, trajB.length - 1)];
      const d = Math.sqrt((a.zr - b.zr) ** 2 + (a.zi - b.zi) ** 2);
      // 对数刻度保护：距离为 0 时用极小值替代，避免 Chart.js 报错
      distances.push(d > 0 ? d : 1e-10);
    }

    if (sensitivityChartInstance) sensitivityChartInstance.destroy();
    sensitivityChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '|zₙ(A) - zₙ(B)|',
          data: distances,
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.15)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c0c0c0', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: function (items) { return '迭代步 ' + items[0].label; },
              label: function (item) { return '距离 = ' + item.parsed.y.toFixed(6); },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: '迭代步 n', color: '#888', font: { size: 10 } },
            ticks: { color: '#666', font: { size: 10 }, maxTicksLimit: 8 },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            title: { display: true, text: '|zₙ(A) - zₙ(B)|', color: '#888', font: { size: 10 } },
            ticks: { color: '#666', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' },
            type: 'logarithmic',
          },
        },
      },
    });
  });
}

// ============================================================
// 初始化
// ============================================================
function init() {
  initHero();
  initTracker();
  initFractal();
  initBoundaryPresets();
  initSensitivity();

  // 默认跑一个单点追踪预设，让用户一进来就看到效果
  const defaultPreset = SINGLE_POINT_PRESETS[0];
  if (defaultPreset) {
    setTimeout(function () {
      runSinglePoint(defaultPreset.zr, defaultPreset.zi);
      document.querySelectorAll('.tracker-preset-btn')[0]?.classList.add('active');
    }, 300);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
