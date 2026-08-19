// ========== JPEG2000 演示 · 纯逻辑工具 ==========
// 本文件只放与 DOM / 编解码器无关的纯函数，便于 Node 单测。
// 真实的 JPEG2000 编解码见 codec.js（OpenJPEG/WASM）；
// 这里的 Haar 小波仅用于"子带结构"教学可视化（真实 JPEG2000 用 9/7 或 5/3 小波，
// 子带分解的结构一致）。

/**
 * 将彩色 ImageData 转为灰度 Float32Array
 * @param {Object} imageData { data, width, height }
 * @returns {Float32Array} 0-255
 */
function toGrayscale(imageData) {
  var data = imageData.data;
  var w = imageData.width;
  var h = imageData.height;
  var gray = new Float32Array(w * h);
  for (var i = 0; i < w * h; i++) {
    var r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/**
 * PSNR（峰值信噪比）
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} dB，完全一致时返回 Infinity
 */
function psnr(a, b) {
  var n = a.length;
  var mse = 0;
  for (var i = 0; i < n; i++) {
    var d = a[i] - b[i];
    mse += d * d;
  }
  mse /= n;
  if (mse === 0) return Infinity;
  return 10 * Math.log10(255 * 255 / mse);
}

/**
 * 字节数 → 人类可读字符串（"12.4 KB"）
 * @param {number} n
 * @returns {string}
 */
function bytesToHuman(n) {
  if (!isFinite(n) || n < 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * 二分搜索：找到使 sizeFn(quality) 接近 target 的质量参数。
 * 假设 sizeFn 随 quality 单调不减（如 JPEG 质量越高体积越大）。
 * @param {Function} sizeFn quality -> number|Promise<number>
 * @param {number} target 目标体积
 * @param {Object} [opts] { min=0.02, max=0.99, tolerance=0.05, iterations=8 }
 * @returns {Promise<{quality:number, size:number}>}
 */
async function searchQualityForSize(sizeFn, target, opts) {
  var o = opts || {};
  var min = o.min !== undefined ? o.min : 0.02;
  var max = o.max !== undefined ? o.max : 0.99;
  var tolerance = o.tolerance !== undefined ? o.tolerance : 0.05;
  var iterations = o.iterations || 8;
  var lo = min, hi = max, bestQ = min, bestSize = 0;
  for (var it = 0; it < iterations; it++) {
    var mid = (lo + hi) / 2;
    var s = await Promise.resolve(sizeFn(mid));
    bestQ = mid; bestSize = s;
    if (s < target) { lo = mid; } else { hi = mid; }
    if (Math.abs(s - target) / Math.max(1, target) <= tolerance) break;
  }
  // 边界探测：如果 0.02 仍比目标大，取最小质量
  var sMin = await Promise.resolve(sizeFn(min));
  var sMax = await Promise.resolve(sizeFn(max));
  if (sMin >= target) return { quality: min, size: sMin };
  if (sMax <= target) return { quality: max, size: sMax };
  return { quality: bestQ, size: bestSize };
}

// ========== 教学可视化：Haar 小波（仅子带结构示意） ==========

/**
 * 一维 Haar 小波变换（就地复制），低频在前、高频在后
 * @param {Float32Array} arr
 * @returns {Float32Array}
 */
function haar1d(arr) {
  var n = arr.length;
  var out = new Float32Array(n);
  var half = Math.floor(n / 2);
  for (var i = 0; i < half; i++) {
    var a = arr[i * 2], b = arr[i * 2 + 1];
    out[i] = (a + b) / 2;
    out[i + half] = (a - b) / 2;
  }
  if (n % 2 === 1) out[n - 1] = arr[n - 1];
  return out;
}

/**
 * 一维逆 Haar 小波变换
 * @param {Float32Array} arr
 * @returns {Float32Array}
 */
function ihaar1d(arr) {
  var n = arr.length;
  var out = new Float32Array(n);
  var half = Math.floor(n / 2);
  for (var i = 0; i < half; i++) {
    var low = arr[i], high = arr[i + half];
    out[i * 2] = low + high;
    out[i * 2 + 1] = low - high;
  }
  if (n % 2 === 1) out[n - 1] = arr[n - 1];
  return out;
}

/**
 * 二维单层 Haar 小波分解（先行后列），输出 2×2 子带布局
 * @param {Float32Array} gray
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array}
 */
function dwt2d(gray, w, h) {
  var i, j;
  var rows = new Float32Array(w * h);
  for (j = 0; j < h; j++) {
    var row = new Float32Array(w);
    for (i = 0; i < w; i++) row[i] = gray[j * w + i];
    var rowT = haar1d(row);
    for (i = 0; i < w; i++) rows[j * w + i] = rowT[i];
  }
  var cols = new Float32Array(w * h);
  var hh = Math.floor(h / 2);
  var wh = Math.floor(w / 2);
  for (i = 0; i < w; i++) {
    var col = new Float32Array(h);
    for (j = 0; j < h; j++) col[j] = rows[j * w + i];
    var colT = haar1d(col);
    for (j = 0; j < h; j++) cols[j * w + i] = colT[j];
  }
  var out = new Float32Array(w * h);
  for (j = 0; j < h; j++) {
    for (i = 0; i < w; i++) {
      var srcX, srcY, band;
      if (i < wh) srcX = i; else srcX = i - wh;
      if (j < hh) srcY = j; else srcY = j - hh;
      if (j < hh && i < wh) band = 0;
      else if (j < hh && i >= wh) band = 1;
      else if (j >= hh && i < wh) band = 2;
      else band = 3;
      var dx = (band === 1 || band === 3) ? wh : 0;
      var dy = (band === 2 || band === 3) ? hh : 0;
      out[(dy + srcY) * w + (dx + srcX)] = cols[j * w + i];
    }
  }
  return out;
}

/**
 * 提取某个子带（用于可视化）
 * @param {Float32Array} coeff
 * @param {number} w
 * @param {number} h
 * @param {number} band 0=LL 1=LH 2=HL 3=HH
 * @returns {{data:Float32Array, w:number, h:number, offsetX:number, offsetY:number}}
 */
function extractBand(coeff, w, h, band) {
  var wh = Math.floor(w / 2);
  var hh = Math.floor(h / 2);
  var bw = (band === 1 || band === 3) ? (w - wh) : wh;
  var bh = (band === 2 || band === 3) ? (h - hh) : hh;
  var dx = (band === 1 || band === 3) ? wh : 0;
  var dy = (band === 2 || band === 3) ? hh : 0;
  var data = new Float32Array(bw * bh);
  for (var j = 0; j < bh; j++) {
    for (var i = 0; i < bw; i++) {
      data[j * bw + i] = coeff[(dy + j) * w + (dx + i)];
    }
  }
  return { data: data, w: bw, h: bh, offsetX: dx, offsetY: dy };
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toGrayscale: toGrayscale,
    psnr: psnr,
    bytesToHuman: bytesToHuman,
    searchQualityForSize: searchQualityForSize,
    haar1d: haar1d,
    ihaar1d: ihaar1d,
    dwt2d: dwt2d,
    extractBand: extractBand
  };
}
