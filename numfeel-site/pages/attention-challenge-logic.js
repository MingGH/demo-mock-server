/**
 * 注意力挑战 — 核心算法
 * Attention Challenge — Core Logic
 */

// === 统计工具 ===
function calcMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function calcMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcStdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = calcMean(arr);
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// === 指数衰减拟合 ===
// 模型: y = a * exp(-b * t) + c
// 用最小二乘法拟合反应时间随轮次的变化
function fitExponentialDecay(times) {
  if (times.length < 3) return { a: 0, b: 0, c: calcMean(times), r2: 0 };

  // 简化拟合：假设 c = min(times)，然后对 ln(y - c) 做线性回归
  const c = Math.min(...times) * 0.95; // 略低于最小值作为渐近线
  const n = times.length;
  const xs = [];
  const ys = [];

  for (let i = 0; i < n; i++) {
    const diff = times[i] - c;
    if (diff > 0) {
      xs.push(i);
      ys.push(Math.log(diff));
    }
  }

  if (xs.length < 2) return { a: times[0] - c, b: 0, c, r2: 0 };

  // 线性回归 ln(y-c) = ln(a) - b*t
  const xMean = calcMean(xs);
  const yMean = calcMean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  const a = Math.exp(intercept);
  const b = -slope;

  // 计算 R²
  const predicted = times.map((_, i) => a * Math.exp(-b * i) + c);
  const meanY = calcMean(times);
  const ssRes = times.reduce((s, y, i) => s + (y - predicted[i]) ** 2, 0);
  const ssTot = times.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { a, b, c, r2: Math.round(r2 * 1000) / 1000 };
}

// 用拟合参数预测第 t 轮的反应时间
function predictDecay(params, t) {
  return params.a * Math.exp(-params.b * t) + params.c;
}

// === 注意力评分 ===
// 综合反应时间、准确率、稳定性给出 0-100 分
function calcAttentionScore(reactionTimes, hits, misses) {
  if (reactionTimes.length === 0) return 0;

  const totalTrials = hits + misses;
  const accuracy = totalTrials === 0 ? 0 : hits / totalTrials;
  const avgRT = calcMean(reactionTimes);
  const stability = reactionTimes.length < 2 ? 1 : 1 / (1 + calcStdDev(reactionTimes) / avgRT);

  // 反应时间分数：200ms=100分，800ms=0分
  const rtScore = Math.max(0, Math.min(100, (800 - avgRT) / 6));
  // 准确率分数
  const accScore = accuracy * 100;
  // 稳定性分数
  const stabScore = stability * 100;

  // 加权：反应时间40%，准确率35%，稳定性25%
  const score = rtScore * 0.4 + accScore * 0.35 + stabScore * 0.25;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// === 注意力等级 ===
function getAttentionLevel(score) {
  if (score >= 90) return { level: '超强专注', emoji: '🧠', color: '#4ade80', desc: '你的注意力超越95%的人' };
  if (score >= 75) return { level: '高度专注', emoji: '🎯', color: '#60a5fa', desc: '注意力水平优秀' };
  if (score >= 60) return { level: '正常水平', emoji: '👍', color: '#fbbf24', desc: '注意力处于平均水平' };
  if (score >= 40) return { level: '轻度分散', emoji: '😐', color: '#fb923c', desc: '注意力有些不集中' };
  return { level: '严重分散', emoji: '😵', color: '#f87171', desc: '建议放下手机休息一下' };
}

// === 衰减分析 ===
// 将反应时间按时间窗口分组，分析注意力随时间的变化
function analyzeDecay(reactionTimes, windowSize) {
  if (!windowSize) windowSize = Math.max(3, Math.floor(reactionTimes.length / 5));
  const windows = [];
  for (let i = 0; i < reactionTimes.length; i += windowSize) {
    const slice = reactionTimes.slice(i, i + windowSize);
    if (slice.length >= 2) {
      windows.push({
        startRound: i + 1,
        endRound: i + slice.length,
        avgRT: Math.round(calcMean(slice)),
        stdDev: Math.round(calcStdDev(slice))
      });
    }
  }
  return windows;
}

// === 模拟数据：刷短视频前后对比 ===
function generateComparisonData() {
  // "刷短视频前"：反应时间较稳定，均值约350ms
  const before = [];
  for (let i = 0; i < 30; i++) {
    before.push(Math.round(320 + Math.random() * 80 + i * 1.5));
  }

  // "刷短视频30分钟后"：反应时间更高且波动更大，衰减更快
  const after = [];
  for (let i = 0; i < 30; i++) {
    after.push(Math.round(380 + Math.random() * 120 + i * 3.5));
  }

  return { before, after };
}

// === 生成随机目标位置 ===
function generateTargetPosition(areaWidth, areaHeight, targetSize) {
  const padding = targetSize;
  const x = padding + Math.random() * (areaWidth - 2 * padding);
  const y = padding + Math.random() * (areaHeight - 2 * padding);
  return { x: Math.round(x), y: Math.round(y) };
}

// === 生成随机出现延迟 ===
function generateDelay(minDelay, maxDelay) {
  return Math.round(minDelay + Math.random() * (maxDelay - minDelay));
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcMean, calcMedian, calcStdDev,
    fitExponentialDecay, predictDecay,
    calcAttentionScore, getAttentionLevel,
    analyzeDecay, generateComparisonData,
    generateTargetPosition, generateDelay
  };
}
