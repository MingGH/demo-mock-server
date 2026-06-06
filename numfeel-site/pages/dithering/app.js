// ========== Floyd-Steinberg 抖动 交互控制 ==========

// ── 状态 ──
let currentImage = null;    // 原始 Image 对象
let grayData = null;        // Float32Array 灰度数据
let imgWidth = 0;
let imgHeight = 0;
let currentAlgo = 'floyd-steinberg';
let threshold = 128;
let animationId = null;

// ── DOM ──
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const canvasArea = document.getElementById('canvasArea');
const originalCanvas = document.getElementById('originalCanvas');
const ditherCanvas = document.getElementById('ditherCanvas');
const resultLabel = document.getElementById('resultLabel');
const zoomCompare = document.getElementById('zoomCompare');
const zoomOriginal = document.getElementById('zoomOriginal');
const zoomDither = document.getElementById('zoomDither');

// ── 初始化 ──
function init() {
  setupUpload();
  setupControls();
  loadDefaultImage();
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
  const reader = new FileReader();
  reader.onload = (e) => loadImage(e.target.result);
  reader.readAsDataURL(file);
}

function loadImage(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    currentImage = img;
    // 计算目标尺寸：确保 canvas 像素数 >= 显示物理像素数
    // 这样浏览器缩小渲染时自动混合像素，抖动效果才自然
    const containerWidth = canvasArea.getBoundingClientRect().width / 2 - 16;
    const dpr = window.devicePixelRatio || 1;
    const targetDisplayPx = Math.round(containerWidth * dpr);
    const maxDim = Math.max(targetDisplayPx, 800);
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    imgWidth = w;
    imgHeight = h;

    // 绘制原图并提取灰度
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0, w, h);
    const imageData = tempCtx.getImageData(0, 0, w, h);
    grayData = toGrayscale(imageData);

    // 显示灰度原图
    renderGrayscaleToCanvas(grayData, w, h, originalCanvas);

    // 显示画布区域
    uploadArea.style.display = 'none';
    canvasArea.style.display = 'block';
    zoomCompare.style.display = 'block';

    // 执行抖动
    processDither();
  };
  img.src = src;
}

// ── 加载默认示例图 ──
function loadDefaultImage() {
  loadImage('sample.jpg');
}

// ── 抖动处理 ──
function processDither() {
  if (!grayData) return;

  const t0 = performance.now();
  const output = applyDither(grayData, imgWidth, imgHeight, currentAlgo, threshold);
  const elapsed = performance.now() - t0;

  renderToCanvas(output, imgWidth, imgHeight, ditherCanvas);

  // 更新标签
  const algoNames = {
    'floyd-steinberg': 'Floyd-Steinberg 抖动',
    'atkinson': 'Atkinson 抖动',
    'sierra': 'Sierra Lite 抖动',
    'ordered': '有序抖动 (Bayer 8×8)',
    'random': '随机抖动',
    'threshold': '纯阈值（无抖动）'
  };
  resultLabel.textContent = algoNames[currentAlgo] || currentAlgo;

  // 统计
  let blackCount = 0;
  for (let i = 0; i < output.length; i++) {
    if (output[i] === 0) blackCount++;
  }
  const total = output.length;
  document.getElementById('statSize').textContent = `${imgWidth}×${imgHeight}`;
  document.getElementById('statBlack').textContent = ((blackCount / total) * 100).toFixed(1) + '%';
  document.getElementById('statWhite').textContent = (((total - blackCount) / total) * 100).toFixed(1) + '%';
  document.getElementById('statTime').textContent = elapsed < 1 ? '<1ms' : Math.round(elapsed) + 'ms';
}

// ── 局部放大 ──
function setupZoom() {
  ditherCanvas.addEventListener('click', showZoom);
  originalCanvas.addEventListener('click', showZoom);
}

function showZoom(e) {
  const rect = e.target.getBoundingClientRect();
  const scaleX = imgWidth / rect.width;
  const scaleY = imgHeight / rect.height;
  const cx = Math.round((e.clientX - rect.left) * scaleX);
  const cy = Math.round((e.clientY - rect.top) * scaleY);

  const cropSize = 50; // 原图中 50×50 区域
  const x0 = Math.max(0, Math.min(imgWidth - cropSize, cx - cropSize / 2));
  const y0 = Math.max(0, Math.min(imgHeight - cropSize, cy - cropSize / 2));

  // 放大原图区域
  const zoomScale = 4;
  zoomOriginal.width = cropSize * zoomScale;
  zoomOriginal.height = cropSize * zoomScale;
  const zCtx1 = zoomOriginal.getContext('2d');
  zCtx1.imageSmoothingEnabled = false;
  zCtx1.drawImage(originalCanvas, x0, y0, cropSize, cropSize, 0, 0, cropSize * zoomScale, cropSize * zoomScale);

  // 放大抖动区域
  zoomDither.width = cropSize * zoomScale;
  zoomDither.height = cropSize * zoomScale;
  const zCtx2 = zoomDither.getContext('2d');
  zCtx2.imageSmoothingEnabled = false;
  zCtx2.drawImage(ditherCanvas, x0, y0, cropSize, cropSize, 0, 0, cropSize * zoomScale, cropSize * zoomScale);
}

// ── 控制绑定 ──
function setupControls() {
  // 算法选择
  document.getElementById('algoOptions').addEventListener('click', (e) => {
    const btn = e.target.closest('.algo-btn');
    if (!btn) return;
    currentAlgo = btn.dataset.algo;
    document.querySelectorAll('.algo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    processDither();
  });

  // 阈值滑块
  const thresholdSlider = document.getElementById('thresholdSlider');
  thresholdSlider.oninput = () => {
    threshold = parseInt(thresholdSlider.value);
    document.getElementById('thresholdVal').textContent = threshold;
  };
  thresholdSlider.onchange = () => processDither();

  // 换图
  document.getElementById('reuploadBtn').addEventListener('click', () => {
    fileInput.click();
  });

  // 下载
  document.getElementById('downloadBtn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `dithered_${currentAlgo}.png`;
    link.href = ditherCanvas.toDataURL('image/png');
    link.click();
  });

  // 动画按钮
  document.getElementById('animateBtn').addEventListener('click', startAnimation);

  // 动画控制
  document.getElementById('animPlayBtn').addEventListener('click', resumeAnimation);
  document.getElementById('animPauseBtn').addEventListener('click', pauseAnimation);

  // 局部放大
  setupZoom();
}

// ── 逐像素动画 ──
let animPaused = false;
let animPixelIndex = 0;
let animPixels = null;
let animOutput = null;

function startAnimation() {
  if (!grayData) return;

  const animSection = document.getElementById('animSection');
  animSection.style.display = 'block';
  animSection.scrollIntoView({ behavior: 'smooth' });

  // 缩小图片用于动画（太大会很慢）
  const maxAnimDim = 200;
  let aw = imgWidth;
  let ah = imgHeight;
  if (aw > maxAnimDim || ah > maxAnimDim) {
    const scale = maxAnimDim / Math.max(aw, ah);
    aw = Math.round(aw * scale);
    ah = Math.round(ah * scale);
  }

  // 重新采样灰度数据
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = aw;
  tempCanvas.height = ah;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(currentImage, 0, 0, aw, ah);
  const imageData = tempCtx.getImageData(0, 0, aw, ah);
  animPixels = new Float32Array(toGrayscale(imageData));
  animOutput = new Uint8Array(aw * ah).fill(128); // 灰色初始

  const animCanvas = document.getElementById('animCanvas');
  animCanvas.width = aw;
  animCanvas.height = ah;

  animPixelIndex = 0;
  animPaused = false;
  runAnimationFrame(aw, ah);
}

function runAnimationFrame(w, h) {
  if (animPaused) return;

  const speedSlider = document.getElementById('animSpeedSlider');
  const speeds = [10, 50, 200]; // 每帧处理像素数
  const speed = speeds[parseInt(speedSlider.value) - 1];
  const speedNames = ['慢', '中', '快'];
  document.getElementById('animSpeedVal').textContent = speedNames[parseInt(speedSlider.value) - 1];

  const total = w * h;
  const end = Math.min(animPixelIndex + speed, total);

  for (let i = animPixelIndex; i < end; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const idx = y * w + x;
    const oldVal = animPixels[idx];
    const newVal = oldVal > threshold ? 255 : 0;
    animOutput[idx] = newVal;
    const err = oldVal - newVal;

    if (x + 1 < w) animPixels[idx + 1] += err * 7 / 16;
    if (y + 1 < h) {
      if (x - 1 >= 0) animPixels[(y + 1) * w + (x - 1)] += err * 3 / 16;
      animPixels[(y + 1) * w + x] += err * 5 / 16;
      if (x + 1 < w) animPixels[(y + 1) * w + (x + 1)] += err * 1 / 16;
    }
  }

  animPixelIndex = end;

  // 渲染当前状态
  const animCanvas = document.getElementById('animCanvas');
  const ctx = animCanvas.getContext('2d');
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  for (let i = 0; i < total; i++) {
    const v = i < animPixelIndex ? animOutput[i] : Math.round(Math.max(0, Math.min(255, animPixels[i])));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  // 进度
  document.getElementById('animProgress').style.width = (animPixelIndex / total * 100) + '%';

  if (animPixelIndex < total) {
    animationId = requestAnimationFrame(() => runAnimationFrame(w, h));
  }
}

function pauseAnimation() {
  animPaused = true;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function resumeAnimation() {
  if (!animPixels) return;
  animPaused = false;
  const animCanvas = document.getElementById('animCanvas');
  runAnimationFrame(animCanvas.width, animCanvas.height);
}

// ── 启动 ──
init();
