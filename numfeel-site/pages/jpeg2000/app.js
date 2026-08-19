// ========== JPEG2000 交互控制（真实 OpenJPEG 编解码） ==========

let codecLib = null;
let codecReady = false;
let currentImage = null;
let grayF32 = null;   // Float32Array 0-255（可视化 / PSNR）
let grayU8 = null;    // Uint8Array 0-255（编解码输入）
let imgWidth = 0, imgHeight = 0;
let targetRatio = 12;
let decompositions = 3;

let resJ2k = null;    // { bytes, size, recon, psnr }
let resJpeg = null;   // { quality, size, recon, psnr }
let progBytes = null;
let progLayers = 6;
let animLayer = 1;
let animPaused = false;
let animTimer = null;

let zoomCx = -1, zoomCy = -1;
let processToken = 0;      // 防陈旧异步结果覆盖
let progKey = null;        // 渐进码流缓存 key（图+分解层数，与压缩比无关）

const $ = (id) => document.getElementById(id);

const uploadArea = $('uploadArea');
const fileInput = $('fileInput');
const codecLoader = $('codecLoader');
const canvasArea = $('canvasArea');
const bandSection = $('bandSection');
const animSection = $('animSection');
const zoomCompare = $('zoomCompare');

function init() {
  setupUpload();
  setupControls();
  setupZoom();
  bootCodec();
}

function bootCodec() {
  showLoader('正在加载真实 JPEG2000 编解码器（OpenJPEG · WebAssembly）…');
  loadOpenJpeg().then((lib) => {
    codecLib = lib;
    codecReady = true;
    hideLoader();
    loadDefaultImage();
  }).catch((err) => {
    showLoader('编解码器加载失败：' + (err && err.message ? err.message : err));
    $('codecRetryBtn').style.display = 'inline-flex';
  });
  $('codecRetryBtn').addEventListener('click', () => {
    $('codecRetryBtn').style.display = 'none';
    showLoader('正在重新加载编解码器…');
    _codecPromise = null;
    ensureOpenJpegScript().then(bootCodec, (e) => showLoader('编解码器加载失败：' + e.message));
  });
}

function showLoader(text) { codecLoader.style.display = 'block'; $('codecLoaderText').textContent = text; }
function hideLoader() { codecLoader.style.display = 'none'; }

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
    // 手机端用小一点的处理分辨率，降低 WASM 编码与 JPEG 搜索耗时
    const isMobile = window.innerWidth < 680;
    const maxDim = isMobile ? 600 : 760;
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    w = Math.ceil(w / 16) * 16;
    h = Math.ceil(h / 16) * 16;
    imgWidth = w; imgHeight = h;

    const temp = document.createElement('canvas');
    temp.width = w; temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.drawImage(img, 0, 0, w, h);
    const imageData = tctx.getImageData(0, 0, w, h);
    grayF32 = toGrayscale(imageData);
    grayU8 = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) grayU8[i] = Math.round(grayF32[i]);

    renderGrayscale(grayF32, w, h, $('originalCanvas'));
    uploadArea.style.display = 'none';
    canvasArea.style.display = 'block';
    bandSection.style.display = 'block';
    animSection.style.display = 'block';
    zoomCompare.style.display = 'none';

    processAll();
  };
  img.src = src;
}

// ── 真实处理 ──
function setBusy(busy) {
  $('ratioSlider').disabled = busy;
  $('decompSlider').disabled = busy;
  $('reverseBtn').disabled = busy;
  $('reuploadBtn').disabled = busy;
  if (busy) $('statTime').textContent = '处理中…';
}

async function processAll() {
  if (!grayU8 || !codecReady) return;
  const token = ++processToken;
  setBusy(true);
  try {
    const t0 = performance.now();
    const rawBytes = imgWidth * imgHeight;

    // JPEG2000：真实编码（rate=目标压缩比；对简单图像率控会触底，实际体积可能更小）
    const enc = encodeJ2K(codecLib, grayU8, imgWidth, imgHeight, decompositions, targetRatio);
    const dec = decodeJ2K(codecLib, enc.bytes);
    const reconJ2k = f32FromU8(dec.gray);
    resJ2k = { bytes: enc.bytes, size: enc.bytes.byteLength, recon: reconJ2k, psnr: psnr(grayF32, reconJ2k) };

    // JPEG：真实编码，二分质量使体积精确匹配 JPEG2000 的实际体积（保证同体积对比）
    const jpeg = await encodeJpegToSize(grayU8, imgWidth, imgHeight, resJ2k.size);
    if (token !== processToken) return; // 已被更新的请求取代
    resJpeg = { quality: jpeg.quality, size: jpeg.size, recon: jpeg.gray, psnr: psnr(grayF32, jpeg.gray) };

    renderGrayscale(grayF32, imgWidth, imgHeight, $('originalCanvas'));
    renderGrayscale(resJ2k.recon, imgWidth, imgHeight, $('j2kCanvas'));
    renderGrayscale(resJpeg.recon, imgWidth, imgHeight, $('jpegCanvas'));
    updateMetrics(performance.now() - t0);
    renderBands();

    // 真实多质量层码流（渐进演示；OpenJPEG 要求 rates 严格递减：最前层 = 最压缩 = 先被解码）
    // 只依赖图与分解层数，压缩比变化时复用缓存，避免每次拖滑杆都重编
    const key = imgWidth + 'x' + imgHeight + '-d' + decompositions;
    if (key !== progKey) {
      const layersEnc = encodeJ2KLayers(codecLib, grayU8, imgWidth, imgHeight, decompositions, [64, 32, 16, 8, 4, 2]);
      if (token !== processToken) return;
      progBytes = layersEnc.bytes;
      progLayers = layersEnc.layers;
      progKey = key;
    }
    $('animLayerTotal').textContent = progLayers;
    $('animLayerSlider').max = progLayers;
    animLayer = 1;
    renderProgressive();

    if (zoomCompare.style.display !== 'none') renderZoom();
    hideReverseResult();
  } finally {
    if (token === processToken) setBusy(false);
  }
}

function updateMetrics(elapsed) {
  const fmtPsnr = (v) => (v === Infinity ? '∞' : v.toFixed(1));
  const rawBytes = imgWidth * imgHeight;
  const j2kRatio = (rawBytes / resJ2k.size).toFixed(1) + 'x';
  const jpegRatio = (rawBytes / resJpeg.size).toFixed(1) + 'x';

  $('mJ2kPsnr').textContent = fmtPsnr(resJ2k.psnr);
  $('mJ2kSize').textContent = bytesToHuman(resJ2k.size) + ' · ' + j2kRatio;
  $('mJpegPsnr').textContent = fmtPsnr(resJpeg.psnr);
  $('mJpegSize').textContent = bytesToHuman(resJpeg.size) + ' · ' + jpegRatio;

  $('statSize').textContent = `${imgWidth}×${imgHeight}`;
  $('statTime').textContent = elapsed < 1 ? '<1ms' : Math.round(elapsed) + 'ms';

  const actualRatio = (rawBytes / resJ2k.size).toFixed(1);
  const j2kWins = resJ2k.psnr >= resJpeg.psnr;
  $('statWinner').textContent = j2kWins ? 'JPEG2000' : 'JPEG';
  $('statWinner').style.color = j2kWins ? '#81c784' : '#ff6b6b';
  $('winnerLine').textContent =
    `同体积（实际约 ${actualRatio}:1）下，PSNR 更高：${j2kWins ? 'JPEG2000' : 'JPEG'} ` +
    `（JPEG2000 ${fmtPsnr(resJ2k.psnr)} dB vs JPEG ${fmtPsnr(resJpeg.psnr)} dB）`;
  $('winnerLine').style.color = j2kWins ? '#81c784' : '#ff6b6b';
}

function renderBands() {
  if (!grayF32) return;
  const coeff = dwt2d(grayF32, imgWidth, imgHeight);
  const names = ['bandLL', 'bandLH', 'bandHL', 'bandHH'];
  for (let b = 0; b < 4; b++) {
    const band = extractBand(coeff, imgWidth, imgHeight, b);
    renderBandValue(band.data, band.w, band.h, $(names[b]));
  }
}

// ── JPEG 真实编码（浏览器原生） ──
function jpegEncode(gray, w, h, q) {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(w, h);
    const d = id.data;
    for (let i = 0; i < w * h; i++) {
      const v = gray[i];
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    c.toBlob((blob) => {
      if (!blob) { resolve({ size: 0, gray: new Float32Array(w * h) }); return; }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        const ctx2 = c2.getContext('2d');
        ctx2.drawImage(img, 0, 0, w, h);
        const out = toGrayscale(ctx2.getImageData(0, 0, w, h));
        URL.revokeObjectURL(url);
        resolve({ size: blob.size, gray: out });
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ size: blob.size, gray: new Float32Array(w * h) }); };
      img.src = url;
    }, 'image/jpeg', q);
  });
}

async function encodeJpegToSize(gray, w, h, targetSize) {
  const r = await searchQualityForSize(
    (q) => jpegEncode(gray, w, h, q).then((x) => x.size),
    targetSize,
    { tolerance: 0.08, iterations: 7 }
  );
  const full = await jpegEncode(gray, w, h, r.quality);
  return { quality: r.quality, size: full.size, gray: full.gray };
}

// ── 渲染工具 ──
function f32FromU8(u8) {
  const out = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) out[i] = u8[i];
  return out;
}

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

// ── 点击一处 → 三图同区域放大对比 ──
function setupZoom() {
  ['originalCanvas', 'j2kCanvas', 'jpegCanvas'].forEach((id) => {
    $(id).addEventListener('click', (e) => showZoomFrom(e, id));
  });
  $('zoomCloseBtn').addEventListener('click', () => {
    zoomCompare.style.display = 'none';
    clearMarkers();
  });
}

function showZoomFrom(e, canvasId) {
  const canvas = $(canvasId);
  const rect = canvas.getBoundingClientRect();
  const sx = imgWidth / rect.width, sy = imgHeight / rect.height;
  const cx = Math.max(0, Math.min(imgWidth - 1, Math.round((e.clientX - rect.left) * sx)));
  const cy = Math.max(0, Math.min(imgHeight - 1, Math.round((e.clientY - rect.top) * sy)));
  zoomCx = cx; zoomCy = cy;
  renderZoom();
  showMarker(canvasId, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  zoomCompare.style.display = 'block';
  $('zoomCoord').textContent = `对比区域中心：(x ${cx}, y ${cy})`;
  nfTrack('zoom_compare', { x: cx, y: cy });
}

function renderZoom() {
  if (zoomCx < 0) return;
  const crop = Math.min(64, imgWidth, imgHeight);
  const x0 = Math.max(0, Math.min(imgWidth - crop, zoomCx - crop / 2));
  const y0 = Math.max(0, Math.min(imgHeight - crop, zoomCy - crop / 2));
  renderCropNearest(grayF32, imgWidth, imgHeight, x0, y0, crop, 4, $('zoomOriginal'));
  renderCropNearest(resJ2k.recon, imgWidth, imgHeight, x0, y0, crop, 4, $('zoomJ2k'));
  renderCropNearest(resJpeg.recon, imgWidth, imgHeight, x0, y0, crop, 4, $('zoomJpeg'));
}

function renderCropNearest(gray, w, h, x0, y0, crop, scale, canvas) {
  canvas.width = crop * scale; canvas.height = crop * scale;
  const ctx = canvas.getContext('2d');
  const id = ctx.createImageData(crop * scale, crop * scale);
  const d = id.data;
  const rowStride = crop * scale;
  for (let y = 0; y < rowStride; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < rowStride; x++) {
      const sx = Math.floor(x / scale);
      const v = Math.max(0, Math.min(255, Math.round(gray[(y0 + sy) * w + (x0 + sx)])));
      const o = (y * rowStride + x) * 4;
      d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
}

const MARKER_MAP = {
  originalCanvas: 'markerOriginal',
  j2kCanvas: 'markerJ2k',
  jpegCanvas: 'markerJpeg'
};

function showMarker(canvasId, fracX, fracY) {
  clearMarkers();
  const marker = $(MARKER_MAP[canvasId]);
  const crop = Math.min(64, imgWidth, imgHeight);
  const x0 = Math.max(0, Math.min(imgWidth - crop, zoomCx - crop / 2));
  const y0 = Math.max(0, Math.min(imgHeight - crop, zoomCy - crop / 2));
  marker.style.left = (x0 / imgWidth * 100) + '%';
  marker.style.top = (y0 / imgHeight * 100) + '%';
  marker.style.width = (crop / imgWidth * 100) + '%';
  marker.style.height = (crop / imgHeight * 100) + '%';
  marker.hidden = false;
}

function clearMarkers() {
  ['markerOriginal', 'markerJ2k', 'markerJpeg'].forEach((id) => { $(id).hidden = true; });
}

// ── 控制绑定 ──
function setupControls() {
  const ratioSlider = $('ratioSlider');
  ratioSlider.oninput = () => { targetRatio = parseInt(ratioSlider.value); $('ratioVal').textContent = targetRatio + ':1'; };
  ratioSlider.onchange = () => { nfTrack('ratio_change', { ratio: parseInt(ratioSlider.value) }); processAll(); };

  const decompSlider = $('decompSlider');
  decompSlider.oninput = () => { decompositions = parseInt(decompSlider.value); $('decompVal').textContent = decompositions; };
  decompSlider.onchange = () => { nfTrack('decomp_change', { decomp: parseInt(decompSlider.value) }); processAll(); };

  $('reuploadBtn').addEventListener('click', () => fileInput.click());
  $('downloadBtn').addEventListener('click', () => {
    if (!resJ2k) return;
    nfTrack('download', { type: 'jp2', size: resJ2k.size });
    const jp2 = wrapJP2(resJ2k.bytes, imgWidth, imgHeight);
    const blob = new Blob([jp2], { type: 'image/jp2' });
    const link = document.createElement('a');
    link.download = 'jpeg2000_demo.jp2';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  });

  $('animPlayBtn').addEventListener('click', resumeAnimation);
  $('animPauseBtn').addEventListener('click', pauseAnimation);
  $('animLayerSlider').addEventListener('input', onLayerScrub);

  $('reverseBtn').addEventListener('click', reverseCheck);
}

// ── 真实渐进式解码 ──
function renderProgressive() {
  if (!progBytes || !codecReady) return;
  const layer = Math.max(1, Math.min(progLayers, animLayer));
  const dec = decodeJ2K(codecLib, progBytes, layer);
  const recon = f32FromU8(dec.gray);
  renderGrayscale(recon, imgWidth, imgHeight, $('animCanvas'));
  const p = psnr(grayF32, recon);
  $('animPsnr').textContent = (p === Infinity ? '∞' : p.toFixed(1)) + ' dB';
  $('animLayerVal').textContent = layer;
  $('animProgress').style.width = (layer / progLayers * 100) + '%';
  $('animLayerSlider').value = layer;
}

function resumeAnimation() {
  if (!progBytes) return;
  nfTrack('progressive_play', {});
  animPaused = false;
  if (animLayer >= progLayers) animLayer = 1;
  if (animTimer) clearTimeout(animTimer);
  runAnimStep();
}

function runAnimStep() {
  if (animPaused) return;
  if (animLayer >= progLayers) { animPaused = true; return; }
  animLayer++;
  renderProgressive();
  animTimer = setTimeout(runAnimStep, 650);
}

function pauseAnimation() {
  animPaused = true;
  if (animTimer) { clearTimeout(animTimer); animTimer = null; }
}

function onLayerScrub() {
  animPaused = true;
  if (animTimer) { clearTimeout(animTimer); animTimer = null; }
  animLayer = parseInt($('animLayerSlider').value);
  renderProgressive();
  nfTrack('progressive_scrub', { layer: animLayer });
}

// ── 反向验证：同画质（PSNR）比体积 ──
async function reverseCheck() {
  if (!resJpeg || !codecReady || !grayU8) return;
  setBusy(true);
  try {
    nfTrack('reverse_check', { targetPsnr: resJpeg.psnr });
    const targetPsnr = resJpeg.psnr;
    const rawBytes = imgWidth * imgHeight;
    let lo = 2, hi = rawBytes, best = null;
    for (let it = 0; it < 9; it++) {
      const mid = (lo + hi) / 2;
      const enc = encodeJ2K(codecLib, grayU8, imgWidth, imgHeight, decompositions, mid);
      const dec = decodeJ2K(codecLib, enc.bytes);
      const p = psnr(grayF32, f32FromU8(dec.gray));
      best = { rate: mid, psnr: p, size: enc.bytes.byteLength };
      if (p > targetPsnr) lo = mid; else hi = mid;
      if (Math.abs(p - targetPsnr) <= 0.3) break;
    }
    const pct = (best.size / resJpeg.size * 100);
    $('reverseResult').style.display = 'block';
    $('reverseResultText').innerHTML =
      `JPEG2000 达到与 JPEG 相同画质（PSNR ≈ <b>${targetPsnr.toFixed(1)} dB</b>）只需要 <b>${bytesToHuman(best.size)}</b>，` +
      `而 JPEG 用了 <b>${bytesToHuman(resJpeg.size)}</b>——约为 JPEG 的 <b class="hl">${pct.toFixed(0)}%</b> 体积` +
      (pct < 80 ? '。同画质下省下了一大半体积。' : '。');
  } finally {
    setBusy(false);
  }
}

function hideReverseResult() {
  $('reverseResult').style.display = 'none';
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
