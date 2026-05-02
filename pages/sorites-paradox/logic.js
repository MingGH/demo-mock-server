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
 * @param {number} grains - 当前沙粒数
 * @param {number} maxGrains - 最大沙粒数
 * @returns {number} 0-100 的高度百分比
 */
function sandHeightPercent(grains, maxGrains) {
  if (grains <= 0) return 0;
  if (maxGrains <= 0) return 0;
  // 使用对数缩放让变化更直观
  return Math.round(Math.log(grains + 1) / Math.log(maxGrains + 1) * 100);
}

/**
 * 计算沙堆宽度百分比
 * @param {number} grains
 * @param {number} maxGrains
 * @returns {number} 30-100 的宽度百分比
 */
function sandWidthPercent(grains, maxGrains) {
  if (grains <= 0) return 0;
  var ratio = sandHeightPercent(grains, maxGrains) / 100;
  return Math.round(30 + ratio * 70);
}

/**
 * 计算用户的「模糊边界」
 * 找到用户从"是堆"变成"不是堆"的转折点
 * @param {Array<{grains: number, isHeap: boolean}>} votes - 用户投票记录
 * @returns {{boundary: number, sharpness: string}} 边界值和清晰度
 */
function findBoundary(votes) {
  if (!votes || votes.length === 0) return { boundary: -1, sharpness: 'unknown' };

  // 找到最后一个"是堆"和第一个"不是堆"
  var lastYes = -1;
  var firstNo = -1;

  for (var i = 0; i < votes.length; i++) {
    if (votes[i].isHeap) lastYes = votes[i].grains;
    if (!votes[i].isHeap && firstNo === -1) firstNo = votes[i].grains;
  }

  // 如果全部选"是"或全部选"否"
  if (lastYes === -1) return { boundary: votes[0].grains, sharpness: 'extreme-no' };
  if (firstNo === -1) return { boundary: 0, sharpness: 'extreme-yes' };

  // 边界 = 最后一个"是"和第一个"不是"的中间值
  var boundary = Math.round((lastYes + firstNo) / 2);

  // 计算清晰度：看用户是否有来回切换
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
 * @param {number[]} boundaries - 边界值数组
 * @returns {{mean: number, median: number, std: number, min: number, max: number}}
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
 * 将边界值分桶，用于直方图
 * @param {number[]} boundaries
 * @param {number} bucketCount
 * @param {number} maxVal
 * @returns {Array<{label: string, count: number, from: number, to: number}>}
 */
function bucketize(boundaries, bucketCount, maxVal) {
  bucketCount = bucketCount || 10;
  maxVal = maxVal || 10000;
  var bucketSize = maxVal / bucketCount;
  var buckets = [];
  for (var i = 0; i < bucketCount; i++) {
    var from = Math.round(i * bucketSize);
    var to = Math.round((i + 1) * bucketSize);
    buckets.push({
      label: from + '-' + to,
      count: 0,
      from: from,
      to: to
    });
  }
  for (var j = 0; j < boundaries.length; j++) {
    var val = boundaries[j];
    var idx = Math.min(Math.floor(val / bucketSize), bucketCount - 1);
    if (idx >= 0 && idx < bucketCount) buckets[idx].count++;
  }
  return buckets;
}

/**
 * 生成颜色渐变中某个位置的 RGB
 * @param {number} t - 0~1 之间的位置
 * @param {number[]} colorA - 起始颜色 [r,g,b]
 * @param {number[]} colorB - 结束颜色 [r,g,b]
 * @returns {number[]} [r,g,b]
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
 * 判断颜色名称（用于颜色渐变实验）
 * @param {number} t - 0~1
 * @returns {string} 颜色名称
 */
function colorName(t) {
  if (t < 0.2) return '蓝色';
  if (t < 0.4) return '蓝绿色';
  if (t < 0.6) return '青色';
  if (t < 0.8) return '绿青色';
  return '绿色';
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAND_CONFIG: SAND_CONFIG,
    BALD_CONFIG: BALD_CONFIG,
    sandHeightPercent: sandHeightPercent,
    sandWidthPercent: sandWidthPercent,
    findBoundary: findBoundary,
    boundaryStats: boundaryStats,
    bucketize: bucketize,
    lerpColor: lerpColor,
    colorName: colorName
  };
}
