// ========== JPEG2000 交互控制 ==========

let currentImage = null;
let grayData = null;
let imgWidth = 0, imgHeight = 0;
let quantStep = 30;
let levels = 2;
let animId = null;
let animTimer = null;

const $ = (id) => document.getElementById(id);

const uploadArea = $('uploadArea');
const fileInput = $('fileInput');
const canvasArea = $('canvasArea');
const bandSection = $('bandSection');
const animSection = $('animSection');
const zoomCompare = $('zoomCompare');

function init() {
  setupUpload();
  setupControls();
  loadDefaultImage();
}

// ── 上传 ──
function setupUpload() {
  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
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

function loadDefaultImage() {
  nfTrack('upload', { source: 'default' });
  loadImage('sample.jpg');
}

function loadImage(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    currentImage = img;
    const containerWidth = canvasArea.getBoundingClientRect().width / 3 - 16;
    const dpr = window.devicePixelRatio || 1;
    const targetDisplayPx = Math.round(containerWidth * dpr);
    const maxDim = Math.max(targetDisplayPx, 640);
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    // 对齐到 16 的倍数：保证多级小波分解（最多 4 层，需要逐层除 2）过程中
    // 每一层的宽高始终为偶数，避免中间层出现奇数尺寸导致子带退化
    const ALIGN = 16;
    w = Math.ceil(w / ALIGN) * ALIGN;
    h = Math.ceil(h / ALIGN) * ALIGN;
    imgWidth = w; imgHeight = h;

    const temp = document.createElement('canvas');
    temp.width = w; temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.drawImage(img, 0, 0, w, h);
    const imageData = tctx.getImageData(0, 0, w, h);
    grayData = toGrayscale(imageData);

    renderGrayscale(grayData, w, h, $('originalCanvas'));
    uploadArea.style.display = 'none';
    canvasArea.style.display = 'block';
    zoomCompare.style.display = 'block';
    bandSection.style.display = 'block';

    processAll();
    renderBands();
  };
  img.src = src;
}

// ── 处理 ──
function processAll() {
  if (!grayData) return;
  const t0 = performance.now();

  const j2k = jpeg2000Compress(grayData, imgWidth, imgHeight, levels, quantStep);
  const jpeg = jpegBlockArtifact(grayData, imgWidth, imgHeight, 8);
  const jpegPsnr = psnr(grayData, jpeg);

  renderGrayscale(j2k.recon, imgWidth, imgHeight, $('j2kCanvas'));
  renderGrayscale(jpeg, imgWidth, imgHeight, $('jpegCanvas'));

  const elapsed = performance.now() - t0;

  // 指标
  const fmtPsnr = (v) => (v === Infinity ? '∞' : v.toFixed(1));
  $('mJ2kPsnr').textContent = fmtPsnr(j2k.psnr);
  $('mJ2kRatio').textContent = j2k.compressionRatio.toFixed(0) + 'x';
  $('mJpegPsnr').textContent = fmtPsnr(jpegPsnr);
  $('mJpegBlock').textContent = '8×8';

  $('statSize').textContent = `${imgWidth}×${imgHeight}`;
  $('statTime').textContent = elapsed < 1 ? '<1ms' : Math.round(elapsed) + 'ms';
  $('statWinner').textContent = (j2k.psnr >= jpegPsnr ? 'JPEG2000' : 'JPEG');
  $('statWinner').style.color = (j2k.psnr >= jpegPsnr) ? '#81c784' : '#ff6b6b';
}

function renderBands() {
  if (!grayData) return;
  const coeff = dwt2d(grayData, imgWidth, imgHeight);
  const names = ['bandLL', 'bandLH', 'bandHL', 'bandHH'];
  for (let b = 0; b < 4; b++) {
    const band = extractBand(coeff, imgWidth, imgHeight, b);
    const canvas = $(names[b]);
    renderBandValue(band.data, band.w, band.h, canvas);
  }
}

// ── 渲染工具 ──
function renderGrayscale(gray, w, h, canvas) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(w, h);
  const d = imageData.data;
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(gray[i])));
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

// 子带可视化：把系数归一化映射到灰度，高频需拉伸才能看见
function renderBandValue(coeff, w, h, canvas) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(w, h);
  const d = imageData.data;
  let maxAbs = 1;
  for (let i = 0; i < coeff.length; i++) maxAbs = Math.max(maxAbs, Math.abs(coeff[i]));
  for (let i = 0; i < coeff.length; i++) {
    const v = Math.round(128 + (coeff[i] / maxAbs) * 127);
    const c = Math.max(0, Math.min(255, v));
    d[i * 4] = c; d[i * 4 + 1] = c; d[i * 4 + 2] = c; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

// ── 局部放大 ──
function setupZoom() {
  $('j2kCanvas').addEventListener('click', (e) => showZoom(e, $('j2kCanvas'), $('zoomJ2k')));
  $('jpegCanvas').addEventListener('click', (e) => showZoom(e, $('jpegCanvas'), $('zoomJpeg')));
}
function showZoom(e, source, target) {
  const rect = source.getBoundingClientRect();
  const scaleX = imgWidth / rect.width;
  const scaleY = imgHeight / rect.height;
  const cx = Math.round((e.clientX - rect.left) * scaleX);
  const cy = Math.round((e.clientY - rect.top) * scaleY);
  const cropSize = 50;
  const x0 = Math.max(0, Math.min(imgWidth - cropSize, cx - cropSize / 2));
  const y0 = Math.max(0, Math.min(imgHeight - cropSize, cy - cropSize / 2));
  const zoomScale = 4;
  target.width = cropSize * zoomScale;
  target.height = cropSize * zoomScale;
  const zctx = target.getContext('2d');
  zctx.imageSmoothingEnabled = false;
  zctx.drawImage(source, x0, y0, cropSize, cropSize, 0, 0, cropSize * zoomScale, cropSize * zoomScale);
}

// ── 控制绑定 ──
function setupControls() {
  const quantSlider = $('quantSlider');
  quantSlider.oninput = () => { quantStep = parseInt(quantSlider.value); $('quantVal').textContent = quantStep; };
  quantSlider.onchange = () => { nfTrack('quant_change', { step: parseInt(quantSlider.value) }); processAll(); renderBands(); };

  const levelsSlider = $('levelsSlider');
  levelsSlider.oninput = () => { levels = parseInt(levelsSlider.value); $('levelsVal').textContent = levels; };
  levelsSlider.onchange = () => { nfTrack('levels_change', { levels: parseInt(levelsSlider.value) }); processAll(); renderBands(); };

  $('reuploadBtn').addEventListener('click', () => fileInput.click());
  $('downloadBtn').addEventListener('click', () => {
    nfTrack('download', {});
    const link = document.createElement('a');
    link.download = 'jpeg2000_result.png';
    link.href = $('j2kCanvas').toDataURL('image/png');
    link.click();
  });

  $('animateBtn').addEventListener('click', startAnimation);
  $('animPlayBtn').addEventListener('click', resumeAnimation);
  $('animPauseBtn').addEventListener('click', pauseAnimation);
  $('animProgressSlider').addEventListener('input', onProgressScrub);

  setupZoom();
}

// ── 渐进重建动画 ──
let animPaused = false;
let animLevel = 0;      // 0..3 层
let animMaxLevel = 3;

function startAnimation() {
  if (!grayData) return;
  nfTrack('animate_start', {});
  animSection.style.display = 'block';
  animSection.scrollIntoView({ behavior: 'smooth' });
  animPaused = false;
  animLevel = 0;
  animMaxLevel = 3;
  $('animProgressSlider').value = 0;
  $('animProgressVal').textContent = '0';
  renderAnimLevel();
}

function renderAnimLevel() {
  const progress = animLevel / animMaxLevel * 100;
  const lvl = animLevel;
  const res = progressiveLevel(grayData, imgWidth, imgHeight, lvl);
  renderGrayscale(res.data, res.w, res.h, $('animCanvas'));
  $('animProgress').style.width = progress + '%';
  $('animProgressVal').textContent = Math.round(progress);
  $('animProgressSlider').value = progress;
}

function runAnimStep() {
  if (animPaused) return;
  if (animLevel >= animMaxLevel) { animPaused = true; return; }
  animLevel++;
  renderAnimLevel();
  animTimer = setTimeout(runAnimStep, 700);
}

function resumeAnimation() {
  if (!currentImage) return;
  animPaused = false;
  if (animLevel >= animMaxLevel) { animLevel = 0; }
  if (animTimer) clearTimeout(animTimer);
  runAnimStep();
}

function pauseAnimation() {
  animPaused = true;
  if (animTimer) { clearTimeout(animTimer); animTimer = null; }
}

function onProgressScrub() {
  const p = parseInt($('animProgressSlider').value);
  animLevel = Math.round(p / 100 * animMaxLevel);
  animPaused = true;
  if (animTimer) { clearTimeout(animTimer); animTimer = null; }
  renderAnimLevel();
}

// ── 埋点 ──
function nfTrack(name, props, opts) {
  try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
}
(function () {
  try { if (window.NFTrack) window.NFTrack.trackOnce('session_start', {}); } catch (e) {}
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });
})();

init();
