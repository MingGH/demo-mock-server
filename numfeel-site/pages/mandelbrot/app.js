// ========== 曼德勃罗集交互控制 ==========

// ── 状态 ──
let centerX = -0.5;
let centerY = 0;
let zoom = 1;
let maxIter = 200;
let colorScheme = 'default';
let isRendering = false;
let renderStartTime = 0;

// ── DOM ──
const canvas = document.getElementById('mandelbrotCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');

const juliaCanvas = document.getElementById('juliaCanvas');
const juliaCtx = juliaCanvas.getContext('2d');

// ── 初始化 ──
function init() {
  setupCanvas();
  setupPresets();
  setupControls();
  render();
  renderJulia(-0.5, 0);
}

function setupCanvas() {
  const rect = container.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  // Julia 画布
  const juliaWrap = juliaCanvas.parentElement;
  const jRect = juliaWrap.getBoundingClientRect();
  juliaCanvas.width = Math.floor(jRect.width * dpr);
  juliaCanvas.height = Math.floor(jRect.height * dpr);
}

// ── 预设按钮 ──
function setupPresets() {
  const grid = document.getElementById('presetGrid');
  grid.innerHTML = '';
  PRESETS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (i === 0 ? ' active' : '');
    btn.textContent = p.name;
    btn.title = p.desc;
    btn.onclick = () => {
      centerX = p.x;
      centerY = p.y;
      zoom = p.zoom;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    };
    grid.appendChild(btn);
  });
}

// ── 控制绑定 ──
function setupControls() {
  // 迭代滑块
  const iterSlider = document.getElementById('iterSlider');
  iterSlider.oninput = () => {
    maxIter = parseInt(iterSlider.value);
    document.getElementById('iterVal').textContent = maxIter;
  };
  iterSlider.onchange = () => render();

  // 配色方案
  document.getElementById('colorOptions').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    colorScheme = btn.dataset.scheme;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });

  // 重置
  document.getElementById('resetBtn').onclick = () => {
    centerX = -0.5; centerY = 0; zoom = 1;
    maxIter = 200;
    document.getElementById('iterSlider').value = 200;
    document.getElementById('iterVal').textContent = 200;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.preset-btn').classList.add('active');
    render();
  };

  // 下载
  document.getElementById('downloadBtn').onclick = downloadImage;

  // 高清渲染
  document.getElementById('highResBtn').onclick = renderHighRes;

  // ── 桌面端事件 ──
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('contextmenu', onCanvasRightClick);
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  canvas.addEventListener('mousemove', onCanvasMouseMove);

  // ── 触摸事件（手机端） ──
  setupTouchEvents();

  // 窗口 resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setupCanvas();
      render();
    }, 200);
  });
}

// ── 触摸手势处理 ──
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

function setupTouchEvents() {
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
}

function onTouchStart(e) {
  e.preventDefault();
  touchState.moved = false;

  if (e.touches.length === 2) {
    // 双指 pinch 缩放
    touchState.isPinching = true;
    touchState.isPanning = false;
    touchState.pinchStartDist = getTouchDist(e.touches);
    touchState.pinchStartZoom = zoom;
  } else if (e.touches.length === 1) {
    // 单指：准备拖拽
    touchState.isPanning = true;
    touchState.isPinching = false;
    touchState.panStartX = e.touches[0].clientX;
    touchState.panStartY = e.touches[0].clientY;
    touchState.panCenterX = centerX;
    touchState.panCenterY = centerY;
  }
}

function onTouchMove(e) {
  e.preventDefault();
  touchState.moved = true;

  if (touchState.isPinching && e.touches.length === 2) {
    const dist = getTouchDist(e.touches);
    const factor = dist / touchState.pinchStartDist;
    zoom = Math.max(0.5, touchState.pinchStartZoom * factor);
    clearPresetActive();
    render();
  } else if (touchState.isPanning && e.touches.length === 1) {
    // 单指拖拽平移
    const dx = e.touches[0].clientX - touchState.panStartX;
    const dy = e.touches[0].clientY - touchState.panStartY;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const scale = 4.0 / (canvas.width * zoom);

    centerX = touchState.panCenterX - dx * dpr * scale;
    centerY = touchState.panCenterY - dy * dpr * scale;
    clearPresetActive();
    render();
  }
}

function onTouchEnd(e) {
  e.preventDefault();

  if (e.touches.length < 2) touchState.isPinching = false;

  if (e.touches.length === 0) {
    // 单指点击（没有移动过）→ 双击检测
    if (!touchState.moved) {
      const now = Date.now();
      if (now - touchState.lastTap < 300) {
        // 双击放大
        const touch = e.changedTouches[0];
        const pos = touchToComplex(touch);
        centerX = pos.cx;
        centerY = pos.cy;
        zoom *= 3;
        clearPresetActive();
        render();
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

function touchToComplex(touch) {
  const rect = canvas.getBoundingClientRect();
  const px = (touch.clientX - rect.left) / rect.width * canvas.width;
  const py = (touch.clientY - rect.top) / rect.height * canvas.height;
  const scale = 4.0 / (canvas.width * zoom);
  return {
    cx: centerX + (px - canvas.width / 2) * scale,
    cy: centerY + (py - canvas.height / 2) * scale
  };
}

// ── 桌面端画布事件 ──
function onCanvasClick(e) {
  // 忽略触摸设备的 click 事件（由 touch 事件处理）
  if ('ontouchstart' in window) return;
  e.preventDefault();
  const pos = canvasToComplex(e);
  centerX = pos.cx;
  centerY = pos.cy;
  zoom *= 3;
  clearPresetActive();
  render();
}

function onCanvasRightClick(e) {
  e.preventDefault();
  const pos = canvasToComplex(e);
  centerX = pos.cx;
  centerY = pos.cy;
  zoom = Math.max(0.5, zoom / 3);
  clearPresetActive();
  render();
}

function onCanvasWheel(e) {
  e.preventDefault();
  const pos = canvasToComplex(e);
  const factor = e.deltaY < 0 ? 1.5 : 1 / 1.5;
  centerX += (pos.cx - centerX) * (1 - 1 / factor);
  centerY += (pos.cy - centerY) * (1 - 1 / factor);
  zoom *= factor;
  zoom = Math.max(0.5, zoom);
  clearPresetActive();
  render();
}

function onCanvasMouseMove(e) {
  const pos = canvasToComplex(e);
  renderJulia(pos.cx, pos.cy);
  document.getElementById('juliaCoord').textContent =
    `c = ${pos.cx.toFixed(6)} ${pos.cy >= 0 ? '+' : '-'} ${Math.abs(pos.cy).toFixed(6)}i`;
}

function canvasToComplex(e) {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width * canvas.width;
  const py = (e.clientY - rect.top) / rect.height * canvas.height;
  const scale = 4.0 / (canvas.width * zoom);
  return {
    cx: centerX + (px - canvas.width / 2) * scale,
    cy: centerY + (py - canvas.height / 2) * scale
  };
}

function clearPresetActive() {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
}

// ── 渲染曼德勃罗集 ──
let renderGeneration = 0; // 用于取消上一次渲染

function render() {
  // 取消正在进行的渲染
  renderGeneration++;
  const thisGen = renderGeneration;
  isRendering = true;
  renderStartTime = performance.now();

  // 根据缩放级别自动调整迭代次数（确保高倍缩放时细节充足）
  const autoIter = Math.max(maxIter, Math.floor(200 + 80 * Math.log2(Math.max(1, zoom))));
  const effectiveIter = autoIter;

  updateInfo();
  const progressBar = document.getElementById('progressBar');
  progressBar.style.width = '0%';

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  let inSet = 0;
  let boundaryCount = 0;

  // 分块渲染避免阻塞 UI
  const CHUNK_ROWS = 20;
  let currentRow = 0;

  function renderChunk() {
    // 如果有更新的渲染请求，中止当前
    if (thisGen !== renderGeneration) return;

    const endRow = Math.min(currentRow + CHUNK_ROWS, h);
    const scale = 4.0 / (w * zoom);

    for (let py = currentRow; py < endRow; py++) {
      const cy = centerY + (py - h / 2) * scale;
      for (let px = 0; px < w; px++) {
        const cx = centerX + (px - w / 2) * scale;
        const iter = mandelbrotEscape(cx, cy, effectiveIter);
        const idx = (py * w + px) * 4;

        if (iter >= effectiveIter) {
          data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
          inSet++;
        } else {
          const color = getColor(iter, effectiveIter);
          data[idx] = color.r; data[idx + 1] = color.g; data[idx + 2] = color.b; data[idx + 3] = 255;
          if (iter > effectiveIter * 0.1) boundaryCount++;
        }
      }
    }

    currentRow = endRow;
    progressBar.style.width = (currentRow / h * 100) + '%';

    if (currentRow < h) {
      requestAnimationFrame(renderChunk);
    } else {
      ctx.putImageData(imageData, 0, 0);
      isRendering = false;
      progressBar.style.width = '100%';
      setTimeout(() => { progressBar.style.width = '0%'; }, 500);

      const elapsed = performance.now() - renderStartTime;
      updateStats(elapsed, w * h, inSet, boundaryCount);
    }
  }

  requestAnimationFrame(renderChunk);
}

// ── 渲染 Julia 集 ──
let juliaTimeout = null;
function renderJulia(cx, cy) {
  if (juliaTimeout) cancelAnimationFrame(juliaTimeout);
  juliaTimeout = requestAnimationFrame(() => {
    const w = juliaCanvas.width;
    const h = juliaCanvas.height;
    const imageData = juliaCtx.createImageData(w, h);
    const data = imageData.data;
    const jMaxIter = Math.min(maxIter, 300);
    const jZoom = 0.8;
    const scale = 4.0 / (Math.min(w, h) * jZoom);

    for (let py = 0; py < h; py++) {
      const zy0 = (py - h / 2) * scale;
      for (let px = 0; px < w; px++) {
        const zx0 = (px - w / 2) * scale;
        const iter = juliaEscape(zx0, zy0, cx, cy, jMaxIter);
        const idx = (py * w + px) * 4;
        if (iter >= jMaxIter) {
          data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
        } else {
          const color = getColor(iter, jMaxIter);
          data[idx] = color.r; data[idx + 1] = color.g; data[idx + 2] = color.b; data[idx + 3] = 255;
        }
      }
    }
    juliaCtx.putImageData(imageData, 0, 0);
  });
}

function juliaEscape(zx, zy, cx, cy, maxIter) {
  let zx2 = zx * zx, zy2 = zy * zy;
  let iter = 0;
  while (zx2 + zy2 <= 4 && iter < maxIter) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    zx2 = zx * zx;
    zy2 = zy * zy;
    iter++;
  }
  if (iter === maxIter) return maxIter;
  const modulus = Math.sqrt(zx2 + zy2);
  return iter + 1 - Math.log(Math.log(modulus)) / Math.log(2);
}

// ── 配色选择 ──
function getColor(iter, max) {
  switch (colorScheme) {
    case 'fire': return iterToColorFire(iter, max);
    case 'ice': return iterToColorIce(iter, max);
    case 'rainbow': return iterToColorRainbow(iter, max);
    default: return iterToColor(iter, max);
  }
}

// ── UI 更新 ──
function updateInfo() {
  const sign = centerY >= 0 ? '+' : '-';
  document.getElementById('infoCenter').textContent =
    `${centerX.toFixed(8)} ${sign} ${Math.abs(centerY).toFixed(8)}i`;
  document.getElementById('infoZoom').textContent = formatZoom(zoom);
  document.getElementById('infoIter').textContent = maxIter;
  // 同步手机端缩放显示
  const mzl = document.getElementById('mobileZoomLevel');
  if (mzl) mzl.textContent = formatZoom(zoom);
}

function updateStats(elapsed, totalPixels, inSet, boundary) {
  document.getElementById('statTime').textContent = elapsed < 1000
    ? Math.round(elapsed) + 'ms'
    : (elapsed / 1000).toFixed(1) + 's';
  document.getElementById('statPixels').textContent = formatNumber(totalPixels);
  document.getElementById('statInSet').textContent = ((inSet / totalPixels) * 100).toFixed(1) + '%';
  document.getElementById('statBoundary').textContent = ((boundary / totalPixels) * 100).toFixed(1) + '%';
}

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

// ── 下载图片 ──
function downloadImage() {
  const link = document.createElement('a');
  link.download = `mandelbrot_${centerX.toFixed(4)}_${centerY.toFixed(4)}_${zoom.toFixed(0)}x.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── 高清渲染（2x 当前分辨率） ──
function renderHighRes() {
  if (isRendering) return;
  const btn = document.getElementById('highResBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 渲染中…';

  const effectiveIter = Math.max(maxIter, Math.floor(200 + 80 * Math.log2(Math.max(1, zoom))));

  // 创建一个 off-screen 高清画布
  const scale = 2;
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const offCtx = offscreen.getContext('2d');
  const imageData = offCtx.createImageData(w, h);
  const data = imageData.data;
  const pxScale = 4.0 / (w * zoom);

  // 用 setTimeout 分块避免冻结
  let row = 0;
  const CHUNK = 10;

  function chunk() {
    const end = Math.min(row + CHUNK, h);
    for (let py = row; py < end; py++) {
      const cy = centerY + (py - h / 2) * pxScale;
      for (let px = 0; px < w; px++) {
        const cx = centerX + (px - w / 2) * pxScale;
        const iter = mandelbrotEscape(cx, cy, effectiveIter);
        const idx = (py * w + px) * 4;
        if (iter >= effectiveIter) {
          data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
        } else {
          const color = getColor(iter, effectiveIter);
          data[idx] = color.r; data[idx + 1] = color.g; data[idx + 2] = color.b; data[idx + 3] = 255;
        }
      }
    }
    row = end;
    if (row < h) {
      setTimeout(chunk, 0);
    } else {
      offCtx.putImageData(imageData, 0, 0);
      const link = document.createElement('a');
      link.download = `mandelbrot_hires_${w}x${h}.png`;
      link.href = offscreen.toDataURL('image/png');
      link.click();
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-photo"></i> 高清渲染';
    }
  }
  chunk();
}

// ── 手机端缩放按钮 ──
function setupMobileZoom() {
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      zoom *= 2.5;
      clearPresetActive();
      render();
      updateMobileZoomLevel();
    };
  }
  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      zoom = Math.max(0.5, zoom / 2.5);
      clearPresetActive();
      render();
      updateMobileZoomLevel();
    };
  }
}

function updateMobileZoomLevel() {
  const el = document.getElementById('mobileZoomLevel');
  if (el) el.textContent = formatZoom(zoom);
}

// ── 启动 ──
init();
setupMobileZoom();
