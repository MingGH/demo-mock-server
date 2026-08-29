// ========== Arnold 猫变换 交互控制 ==========

// ── 状态 ──
let squareData = null;     // 方形 RGBA 像素（Uint8ClampedArray）
let size = 0;              // 方形边长 N
let forwardMap = null;
let inverseMap = null;
let forwardPowers = null;  // 倍增幂表：forwardMap^(2^k)
let inversePowers = null;
let period = 0;            // 周期 T
let curN = 0;              // 当前揉碎次数（主区）
let curBuffer = null;      // 当前显示的像素
let animId = null;         // 动画句柄
let playing = false;       // 播放到复原进行中
let restoring = false;     // 一键还原动画进行中（防重入）

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
  loadPreset('images/sample-girl.webp');
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
  if (!file.type.startsWith('image/')) {
    showLoadError('不支持的图片格式，请用 JPG / PNG / WebP');
    return;
  }
  nfTrack('upload', { source: 'file' });
  const reader = new FileReader();
  reader.onload = (e) => loadImage(e.target.result);
  reader.readAsDataURL(file);
}

// ── 错误提示 ──
let errorToastTimer = null;
function showLoadError(msg) {
  const toast = document.getElementById('errorToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  if (errorToastTimer) clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ── 加载图片 ──
function loadImage(src) {
  stopAnimation();
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onerror = () => {
    showLoadError('图片加载失败，请重试或换一张');
  };
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
    forwardPowers = null;
    inversePowers = null;
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
      if (period < 0) {
        period = 0;
        periodVal.textContent = '计算失败';
        document.getElementById('statPeriod').textContent = '—';
        return;
      }
      // 幂表覆盖到 2×周期即可（还原路径最多走一个周期）
      forwardPowers = Arnold.buildMapPowers(forwardMap, size, period * 2);
      inversePowers = Arnold.buildMapPowers(inverseMap, size, period * 2);
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
    curBuffer = Arnold.applyMapTimesPow(forwardPowers, curBuffer, n - curN, size);
  } else {
    curBuffer = Arnold.applyMapTimesPow(inversePowers, curBuffer, curN - n, size);
  }
  curN = n;
  renderScramble();
  document.getElementById('statTime').textContent = Math.round(performance.now() - t0) + 'ms';
}

function renderScramble() {
  const ctx = scrambleCanvas.getContext('2d');
  ctx.putImageData(new ImageData(curBuffer, size, size), 0, 0);
  scrambleLabel.textContent = curN > 0 && period > 0 && curN % period === 0
    ? '揉碎 ' + curN + ' 次（= 周期 T，原图复原）'
    : '揉碎 ' + curN + ' 次';
  scrambleVal.textContent = curN;
  document.getElementById('statN').textContent = curN;
  document.getElementById('statLeft').textContent = Math.max(0, period - curN);

  const atPeriod = period > 0 && curN > 0 && curN % period === 0;
  restoredBox.style.display = atPeriod ? 'flex' : 'none';

  // 接近复原时给一句提示，让"384 次复原"不再神秘
  const left = period > 0 ? period - curN : -1;
  const hint = document.getElementById('recoveryHint');
  if (period > 0 && left > 0 && left <= 16) {
    document.getElementById('recoveryLeft').textContent = left;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

// ── 控制绑定 ──
const PLAY_SPEEDS = [1, 4, 16];
const SPEED_NAMES = ['慢', '中', '快'];
let playSpeed = 4;

function setupControls() {
  // 揉碎次数滑条
  scrambleSlider.addEventListener('input', () => {
    const n = parseInt(scrambleSlider.value);
    scrambleVal.textContent = n;
    // 用户手动接管时暂停播放，避免两路争抢
    if (playing) pausePlayback();
    if (restoring) return;
    setN(n);
  });
  scrambleSlider.addEventListener('change', () => {
    nfTrack('scramble_change', { n: parseInt(scrambleSlider.value), period: period });
  });

  // 播放速度
  const speedSlider = document.getElementById('playSpeedSlider');
  speedSlider.addEventListener('input', () => {
    playSpeed = PLAY_SPEEDS[parseInt(speedSlider.value) - 1];
    document.getElementById('playSpeedVal').textContent = SPEED_NAMES[parseInt(speedSlider.value) - 1];
  });

  // 播放到复原（直接在右侧画布上迭代）
  document.getElementById('playBtn').addEventListener('click', startPlayback);
  document.getElementById('pauseBtn').addEventListener('click', pausePlayback);

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
}

// ── 播放到复原：主区画布 + 滑条同步前进，到 T 自动停 ──
function startPlayback() {
  if (!curBuffer || !period || playing || restoring) return;
  nfTrack('animate_start', {});
  playing = true;
  document.getElementById('playBtn').style.display = 'none';
  document.getElementById('pauseBtn').style.display = '';
  playbackFrame();
}

function playbackFrame() {
  if (!playing || !curBuffer || !period) return;
  const step = Math.min(playSpeed, period - curN);
  if (step <= 0) {
    finishPlayback();
    return;
  }
  curBuffer = Arnold.applyMapTimesPow(forwardPowers, curBuffer, step, size);
  curN += step;
  scrambleSlider.value = curN;
  renderScramble();
  if (curN >= period) {
    finishPlayback();
    return;
  }
  animId = requestAnimationFrame(playbackFrame);
}

function finishPlayback() {
  playing = false;
  document.getElementById('playBtn').style.display = '';
  document.getElementById('pauseBtn').style.display = 'none';
  nfTrack('animate_end', { n: curN, period: period });
}

function pausePlayback() {
  if (!playing) return;
  playing = false;
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  document.getElementById('playBtn').style.display = '';
  document.getElementById('pauseBtn').style.display = 'none';
}

// ── 一键还原动画 ──
function restoreAnimation() {
  if (!curBuffer || curN === 0 || restoring || playing) return;
  nfTrack('restore', { fromN: curN });
  restoring = true;
  document.getElementById('playBtn').style.display = 'none';
  const step = () => {
    if (curN <= 0) {
      restoring = false;
      document.getElementById('playBtn').style.display = '';
      return;
    }
    const back = Math.min(curN, 4);
    curBuffer = Arnold.applyMapTimesPow(inversePowers, curBuffer, back, size);
    curN -= back;
    scrambleSlider.value = curN;
    renderScramble();
    animId = requestAnimationFrame(step);
  };
  animId = requestAnimationFrame(step);
}

// ── 停止所有动画（换图时调用）──
function stopAnimation() {
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  playing = false;
  restoring = false;
  document.getElementById('playBtn').style.display = '';
  document.getElementById('pauseBtn').style.display = 'none';
}

// ── 行为埋点（NFTrack，见 components/track.js）──
// 事件：session_start / upload / scramble_change / animate_start / animate_end / restore / download / session_end
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