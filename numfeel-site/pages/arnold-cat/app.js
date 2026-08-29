// ========== Arnold 猫变换 交互控制 ==========

// ── 状态 ──
let squareData = null;     // 方形 RGBA 像素（Uint8ClampedArray）
let size = 0;              // 方形边长 N
let forwardMap = null;
let inverseMap = null;
let period = 0;            // 周期 T
let curN = 0;              // 当前揉碎次数（主区）
let curBuffer = null;      // 当前显示的像素
let animId = null;         // 动画句柄

// ── DOM ──
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const canvasArea = document.getElementById('canvasArea');
const originalCanvas = document.getElementById('originalCanvas');
const scrambleCanvas = document.getElementById('scrambleCanvas');
const scrambleLabel = document.getElementById('scrambleLabel');
const scrambleSlider = document.getElementById('scrambleSlider');
const periodSlider = document.getElementById('periodSlider');
const scrambleVal = document.getElementById('scrambleVal');
const periodVal = document.getElementById('periodVal');
const restoredBox = document.getElementById('restoredBox');

// ── 初始化 ──
function init() {
  setupUpload();
  setupPresets();
  setupControls();
  loadPreset('sample-parrot.jpg');
}

// ── 预设 ──
function setupPresets() {
  document.getElementById('presetList').addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-card');
    if (!btn) return;
    document.querySelectorAll('.preset-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    nfTrack('upload', { source: 'preset', name: btn.dataset.name });
    loadPreset(btn.dataset.src);
  });
}

function loadPreset(src) {
  loadImage(src);
}

// ── 上传处理 ──
function setupUpload() {
  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
}

function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  nfTrack('upload', { source: 'file' });
  const reader = new FileReader();
  reader.onload = (e) => loadImage(e.target.result);
  reader.readAsDataURL(file);
}

// ── 加载图片 ──
function loadImage(src) {
  stopAnimation();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // 缩放到最大 512（置乱迭代更快，周期也更短）
    const maxDim = 512;
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0, w, h);
    const imageData = tempCtx.getImageData(0, 0, w, h);

    // 填充为方形
    const padded = Arnold.padToSquare(imageData.data, w, h);
    size = padded.size;
    squareData = padded.data;

    // 绘制方形原图
    originalCanvas.width = size;
    originalCanvas.height = size;
    const oCtx = originalCanvas.getContext('2d');
    oCtx.putImageData(new ImageData(new Uint8ClampedArray(squareData), size, size), 0, 0);

    // 置乱画布
    scrambleCanvas.width = size;
    scrambleCanvas.height = size;

    // 建立映射与周期（异步计算，避免阻塞首帧）
    forwardMap = Arnold.buildForwardMap(size);
    inverseMap = Arnold.buildInverseMap(size);
    curN = 0;
    curBuffer = new Uint8ClampedArray(squareData);
    period = 0;
    scrambleSlider.value = 0;
    scrambleSlider.max = 1;
    scrambleVal.textContent = '0';
    periodVal.textContent = '计算中…';
    periodSlider.value = 0;
    periodSlider.max = 1;
    restoredBox.style.display = 'none';
    scrambleLabel.textContent = '揉碎 0 次';
    renderScramble();

    document.getElementById('statSize').textContent = size + '×' + size;
    document.getElementById('statPeriod').textContent = '计算中…';
    document.getElementById('statN').textContent = '0';
    document.getElementById('statLeft').textContent = '—';

    uploadArea.style.display = 'none';
    canvasArea.style.display = 'block';

    setTimeout(() => {
      const t0 = performance.now();
      period = Arnold.findPeriod(size);
      const elapsed = performance.now() - t0;
      scrambleSlider.max = period;
      periodSlider.max = period;
      periodSlider.value = period;
      scrambleVal.textContent = '0';
      periodVal.textContent = period;
      document.getElementById('statPeriod').textContent = period;
      document.getElementById('statLeft').textContent = period;
      document.getElementById('statTime').textContent = Math.round(elapsed) + 'ms';
    }, 30);
  };
  img.src = src;
}

// ── 置乱渲染（增量：从当前状态正向/逆向迭代到目标 n）──
function setN(n) {
  if (!curBuffer || n === curN) return;
  const t0 = performance.now();
  if (n > curN) {
    curBuffer = Arnold.applyMapTimes(curBuffer, forwardMap, n - curN, size);
  } else {
    curBuffer = Arnold.applyMapTimes(curBuffer, inverseMap, curN - n, size);
  }
  curN = n;
  renderScramble();
  document.getElementById('statTime').textContent = Math.round(performance.now() - t0) + 'ms';
}

function renderScramble() {
  const ctx = scrambleCanvas.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(curBuffer), size, size), 0, 0);
  scrambleLabel.textContent = '揉碎 ' + curN + ' 次';
  scrambleVal.textContent = curN;
  document.getElementById('statN').textContent = curN;
  document.getElementById('statLeft').textContent = Math.max(0, period - curN);

  if (period > 0 && curN > 0 && curN % period === 0) {
    restoredBox.style.display = 'flex';
  } else {
    restoredBox.style.display = 'none';
  }
}

// ── 控制绑定 ──
function setupControls() {
  // 揉碎次数滑条
  scrambleSlider.addEventListener('input', () => {
    const n = parseInt(scrambleSlider.value);
    scrambleVal.textContent = n;
    setN(n);
  });
  scrambleSlider.addEventListener('change', () => {
    nfTrack('scramble_change', { n: parseInt(scrambleSlider.value), period: period });
  });

  // 播放
  document.getElementById('playBtn').addEventListener('click', startAnimation);
  document.getElementById('pauseBtn').addEventListener('click', pauseAnimation);

  // 一键还原（动画式快速逆迭代）
  document.getElementById('restoreBtn').addEventListener('click', restoreAnimation);

  // 下载
  document.getElementById('downloadBtn').addEventListener('click', () => {
    nfTrack('download', { n: curN });
    const link = document.createElement('a');
    link.download = `arnold_scrambled_${curN}.png`;
    link.href = scrambleCanvas.toDataURL('image/png');
    link.click();
  });

  // 换一张
  document.getElementById('reuploadBtn').addEventListener('click', () => {
    fileInput.click();
  });

  // 动画区控制
  document.getElementById('animPlayBtn').addEventListener('click', resumeAnimation);
  document.getElementById('animPauseBtn').addEventListener('click', pauseAnimation);
  document.getElementById('animRestoreBtn').addEventListener('click', () => {
    resetAnimState();
  });
}

// ── 主区一键还原动画 ──
function restoreAnimation() {
  if (!curBuffer || curN === 0) return;
  nfTrack('restore', { fromN: curN });
  stopAnimation();
  document.getElementById('playBtn').style.display = 'none';
  const step = () => {
    if (curN <= 0) {
      document.getElementById('playBtn').style.display = '';
      return;
    }
    const back = Math.min(curN, 4);
    curBuffer = Arnold.applyMapTimes(curBuffer, inverseMap, back, size);
    curN -= back;
    scrambleSlider.value = curN;
    renderScramble();
    animId = requestAnimationFrame(step);
  };
  animId = requestAnimationFrame(step);
}

// ── 揉碎动画（独立画布，从 0 跑到 T，看完整轮回）──
let animPaused = false;
let animBuffer = null;
let animN = 0;
let animRunning = false;

function startAnimation() {
  if (!squareData || animRunning) return;
  nfTrack('animate_start', {});

  const animSection = document.getElementById('animSection');
  animSection.style.display = 'block';
  animSection.scrollIntoView({ behavior: 'smooth' });

  resetAnimState();
  animRunning = true;
  document.getElementById('animPlayBtn').style.display = 'none';
  document.getElementById('animPauseBtn').style.display = '';
  runAnimFrame();
}

function resetAnimState() {
  animN = 0;
  animPaused = false;
  if (squareData) {
    animBuffer = new Uint8ClampedArray(squareData);
  }
  const animCanvas = document.getElementById('animCanvas');
  if (animCanvas) {
    animCanvas.width = size;
    animCanvas.height = size;
    renderAnimCanvas();
  }
  updateAnimProgress();
}

function runAnimFrame() {
  if (animPaused || !animBuffer || !period) return;

  const speedSlider = document.getElementById('animSpeedSlider');
  const speeds = [1, 4, 16];
  const speed = speeds[parseInt(speedSlider.value) - 1];
  const speedNames = ['慢', '中', '快'];
  document.getElementById('animSpeedVal').textContent = speedNames[parseInt(speedSlider.value) - 1];

  animBuffer = Arnold.applyMapTimes(animBuffer, forwardMap, speed, size);
  animN += speed;
  if (animN >= period) {
    animN = period;
    renderAnimCanvas();
    updateAnimProgress();
    animRunning = false;
    document.getElementById('animPlayBtn').style.display = '';
    document.getElementById('animPauseBtn').style.display = 'none';
    return;
  }
  renderAnimCanvas();
  updateAnimProgress();
  animId = requestAnimationFrame(runAnimFrame);
}

function renderAnimCanvas() {
  const animCanvas = document.getElementById('animCanvas');
  const ctx = animCanvas.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(animBuffer), size, size), 0, 0);
}

function updateAnimProgress() {
  document.getElementById('animProgress').style.width = (animN / period * 100) + '%';
}

function pauseAnimation() {
  animPaused = true;
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

function resumeAnimation() {
  if (!animRunning) {
    startAnimation();
    return;
  }
  animPaused = false;
  if (!animId) runAnimFrame();
}

function stopAnimation() {
  pauseAnimation();
  animRunning = false;
  document.getElementById('animPlayBtn').style.display = '';
  document.getElementById('animPauseBtn').style.display = 'none';
}

// ── 行为埋点（NFTrack，见 components/track.js）──
// 事件：session_start / upload / scramble_change / animate_start / restore / download / session_end
function nfTrack(name, props, opts) {
  try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
}
(function () {
  try { if (window.NFTrack) window.NFTrack.trackOnce('session_start', {}); } catch (e) {}
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });
})();

// ── 启动 ──
init();