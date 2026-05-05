/**
 * 沙堆悖论 — 核心逻辑（可独立测试）
 */

// ── 沙堆实验配置 ──
var SAND_CONFIG = {
  startGrains: 10000,
  steps: [10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1500,
          1000, 800, 600, 400, 300, 200, 150, 100, 75, 50,
          30, 20, 15, 10, 7, 5, 3, 2, 1, 0],
  totalSteps: 30
};

// ── 秃头实验配置 ──
var BALD_CONFIG = {
  startHairs: 100000,
  steps: [100000, 90000, 80000, 70000, 60000, 50000, 40000, 30000, 20000, 15000,
          10000, 8000, 6000, 4000, 3000, 2000, 1500, 1000, 500, 200,
          100, 50, 20, 10, 5, 3, 1, 0],
  totalSteps: 28
};

/**
 * 计算沙堆高度百分比（用于可视化）
 */
function sandHeightPercent(grains, maxGrains) {
  if (grains <= 0) return 0;
  if (maxGrains <= 0) return 0;
  return Math.round(Math.log(grains + 1) / Math.log(maxGrains + 1) * 100);
}

/**
 * 计算沙堆宽度百分比
 */
function sandWidthPercent(grains, maxGrains) {
  if (grains <= 0) return 0;
  var ratio = sandHeightPercent(grains, maxGrains) / 100;
  return Math.round(30 + ratio * 70);
}

/**
 * 从信心值数组中找到模糊边界
 * @param {Array<{grains: number, confidence: number}>} votes
 * @returns {{boundary: number, sharpness: string, dropPoint: number}}
 */
function findBoundaryFromConfidence(votes) {
  if (!votes || votes.length === 0) return { boundary: -1, sharpness: 'unknown', dropPoint: -1 };

  // 找到信心值首次低于 50 的位置
  var dropPoint = -1;
  for (var i = 0; i < votes.length; i++) {
    if (votes[i].confidence < 50) {
      dropPoint = i;
      break;
    }
  }

  // 全部 >= 50
  if (dropPoint === -1) return { boundary: 0, sharpness: 'extreme-yes', dropPoint: votes.length };
  // 第一个就 < 50
  if (dropPoint === 0) return { boundary: votes[0].grains, sharpness: 'extreme-no', dropPoint: 0 };

  var before = votes[dropPoint - 1];
  var after = votes[dropPoint];
  var boundary = Math.round((before.grains + after.grains) / 2);

  // 计算陡峭度：看信心值下降的速度
  var maxDrop = 0;
  for (var j = 1; j < votes.length; j++) {
    var drop = votes[j - 1].confidence - votes[j].confidence;
    if (drop > maxDrop) maxDrop = drop;
  }

  var sharpness;
  if (maxDrop >= 60) sharpness = 'cliff';      // 断崖式下降
  else if (maxDrop >= 30) sharpness = 'sharp';  // 较陡
  else sharpness = 'gradual';                    // 缓慢下降

  return { boundary: boundary, sharpness: sharpness, dropPoint: dropPoint };
}

/**
 * 兼容旧版二值投票的边界查找
 */
function findBoundary(votes) {
  if (!votes || votes.length === 0) return { boundary: -1, sharpness: 'unknown' };

  var lastYes = -1;
  var firstNo = -1;

  for (var i = 0; i < votes.length; i++) {
    if (votes[i].isHeap) lastYes = votes[i].grains;
    if (!votes[i].isHeap && firstNo === -1) firstNo = votes[i].grains;
  }

  if (lastYes === -1) return { boundary: votes[0].grains, sharpness: 'extreme-no' };
  if (firstNo === -1) return { boundary: 0, sharpness: 'extreme-yes' };

  var boundary = Math.round((lastYes + firstNo) / 2);

  var switches = 0;
  for (var j = 1; j < votes.length; j++) {
    if (votes[j].isHeap !== votes[j - 1].isHeap) switches++;
  }

  var sharpness;
  if (switches <= 1) sharpness = 'sharp';
  else if (switches <= 3) sharpness = 'moderate';
  else sharpness = 'fuzzy';

  return { boundary: boundary, sharpness: sharpness };
}

/**
 * 计算一组边界值的统计信息
 */
function boundaryStats(boundaries) {
  if (!boundaries || boundaries.length === 0) {
    return { mean: 0, median: 0, std: 0, min: 0, max: 0 };
  }

  var sorted = boundaries.slice().sort(function(a, b) { return a - b; });
  var n = sorted.length;
  var sum = 0;
  for (var i = 0; i < n; i++) sum += sorted[i];
  var mean = sum / n;

  var median;
  if (n % 2 === 0) median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  else median = sorted[Math.floor(n / 2)];

  var sqSum = 0;
  for (var j = 0; j < n; j++) sqSum += (sorted[j] - mean) * (sorted[j] - mean);
  var std = Math.sqrt(sqSum / n);

  return {
    mean: Math.round(mean),
    median: Math.round(median),
    std: Math.round(std),
    min: sorted[0],
    max: sorted[n - 1]
  };
}

/**
 * 将边界值分桶
 */
function bucketize(boundaries, bucketCount, maxVal) {
  bucketCount = bucketCount || 10;
  maxVal = maxVal || 10000;
  var bucketSize = maxVal / bucketCount;
  var buckets = [];
  for (var i = 0; i < bucketCount; i++) {
    var from = Math.round(i * bucketSize);
    var to = Math.round((i + 1) * bucketSize);
    buckets.push({ label: from + '-' + to, count: 0, from: from, to: to });
  }
  for (var j = 0; j < boundaries.length; j++) {
    var val = boundaries[j];
    var idx = Math.min(Math.floor(val / bucketSize), bucketCount - 1);
    if (idx >= 0 && idx < bucketCount) buckets[idx].count++;
  }
  return buckets;
}

/**
 * 颜色插值
 */
function lerpColor(t, colorA, colorB) {
  t = Math.max(0, Math.min(1, t));
  return [
    Math.round(colorA[0] + (colorB[0] - colorA[0]) * t),
    Math.round(colorA[1] + (colorB[1] - colorA[1]) * t),
    Math.round(colorA[2] + (colorB[2] - colorA[2]) * t)
  ];
}

/**
 * 颜色名称
 */
function colorName(t) {
  if (t < 0.2) return '蓝色';
  if (t < 0.4) return '蓝绿色';
  if (t < 0.6) return '青色';
  if (t < 0.8) return '绿青色';
  return '绿色';
}

/**
 * 生成像素扰动图像数据
 * @param {number} size - 图像尺寸
 * @param {number} seed - 随机种子
 * @returns {Uint8ClampedArray} RGBA 像素数据
 */
function generateBaseImage(size, seed) {
  var data = new Uint8ClampedArray(size * size * 4);
  var rng = mulberry32(seed);
  // 生成一个简单的渐变+噪声图案
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var idx = (y * size + x) * 4;
      var cx = x / size, cy = y / size;
      // 径向渐变 + 噪声
      var dist = Math.sqrt((cx - 0.5) * (cx - 0.5) + (cy - 0.5) * (cy - 0.5));
      var base = Math.max(0, 1 - dist * 2);
      var noise = (rng() - 0.5) * 0.1;
      var r = Math.round(Math.min(255, Math.max(0, (base + noise) * 80 + 60)));
      var g = Math.round(Math.min(255, Math.max(0, (base + noise) * 140 + 80)));
      var b = Math.round(Math.min(255, Math.max(0, (base + noise) * 200 + 40)));
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return data;
}

/**
 * 对图像数据施加像素扰动
 * @param {Uint8ClampedArray} original
 * @param {number} size
 * @param {number} perturbCount - 扰动像素数
 * @param {number} perturbAmount - 扰动强度 (0-255)
 * @param {number} seed
 * @returns {Uint8ClampedArray}
 */
function perturbImage(original, size, perturbCount, perturbAmount, seed) {
  var data = new Uint8ClampedArray(original);
  var rng = mulberry32(seed);
  for (var i = 0; i < perturbCount; i++) {
    var px = Math.floor(rng() * size * size);
    var idx = px * 4;
    for (var c = 0; c < 3; c++) {
      var delta = Math.round((rng() - 0.5) * 2 * perturbAmount);
      data[idx + c] = Math.min(255, Math.max(0, data[idx + c] + delta));
    }
  }
  return data;
}

/**
 * 计算两个图像的像素差异百分比（高精度）
 */
function imageDiffPercent(a, b, size) {
  var totalDiff = 0;
  var maxDiff = size * size * 3 * 255;
  for (var i = 0; i < size * size * 4; i += 4) {
    totalDiff += Math.abs(a[i] - b[i]);
    totalDiff += Math.abs(a[i + 1] - b[i + 1]);
    totalDiff += Math.abs(a[i + 2] - b[i + 2]);
  }
  // 返回原始比值，不做四舍五入，让调用方决定精度
  return totalDiff / maxDiff * 100;
}

/**
 * 简单的确定性伪随机数生成器 (Mulberry32)
 */
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * 根据三个实验结果判断用户类型
 */
function classifyUser(sandBoundary, colorBoundary, pixelScore) {
  // sandBoundary: 0-10000, colorBoundary: 0-100, pixelScore: 0-5 (正确数)
  var sandNorm = sandBoundary / 10000; // 越高 = 越宽容
  var colorNorm = colorBoundary / 100;
  var pixelNorm = pixelScore / 5;

  // 综合模糊容忍度
  var tolerance = (sandNorm * 0.4 + colorNorm * 0.3 + (1 - pixelNorm) * 0.3);

  if (tolerance > 0.65) return { type: '模糊容忍者', emoji: '🌊', desc: '你对边界很宽容，觉得世界本来就没有非黑即白。适合当产品经理。' };
  if (tolerance > 0.45) return { type: '实用主义者', emoji: '⚖️', desc: '你会根据场景灵活调整标准。大多数人都在这个区间。' };
  if (tolerance > 0.25) return { type: '精确主义者', emoji: '🎯', desc: '你喜欢清晰的分界线，对模糊性容忍度较低。适合当程序员。' };
  return { type: '二值逻辑人', emoji: '🔲', desc: '你的世界非黑即白，边界清晰果断。适合当法官。' };
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAND_CONFIG: SAND_CONFIG,
    BALD_CONFIG: BALD_CONFIG,
    sandHeightPercent: sandHeightPercent,
    sandWidthPercent: sandWidthPercent,
    findBoundary: findBoundary,
    findBoundaryFromConfidence: findBoundaryFromConfidence,
    boundaryStats: boundaryStats,
    bucketize: bucketize,
    lerpColor: lerpColor,
    colorName: colorName,
    generateBaseImage: generateBaseImage,
    perturbImage: perturbImage,
    imageDiffPercent: imageDiffPercent,
    mulberry32: mulberry32,
    classifyUser: classifyUser
  };
}
