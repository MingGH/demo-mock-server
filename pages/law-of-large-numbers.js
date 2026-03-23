/**
 * 大数定律核心算法
 * Law of Large Numbers — Core Logic
 *
 * 模拟抛硬币，展示频率如何随样本量增大而收敛到真实概率
 */

// === 单次抛硬币 ===
// p: 正面概率（默认0.5）
function flipCoin(p = 0.5) {
  return Math.random() < p ? 1 : 0;
}

// === 模拟 n 次抛硬币，返回每一步的正面频率 ===
function simulateFlips(n, p = 0.5) {
  const freqHistory = [];
  let heads = 0;
  for (let i = 1; i <= n; i++) {
    heads += flipCoin(p);
    freqHistory.push(heads / i);
  }
  return freqHistory;
}

// === 模拟多条路径（用于展示小样本的离散程度）===
function simulateMultiplePaths(numPaths, n, p = 0.5) {
  const paths = [];
  for (let t = 0; t < numPaths; t++) {
    paths.push(simulateFlips(n, p));
  }
  return paths;
}

// === 计算在第 n 步时，所有路径的频率分布 ===
// 返回 { mean, std, min, max, values }
function getFreqDistAtStep(paths, step) {
  const values = paths.map(p => p[step - 1]);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return {
    mean: Math.round(mean * 10000) / 10000,
    std: Math.round(Math.sqrt(variance) * 10000) / 10000,
    min: Math.min(...values),
    max: Math.max(...values),
    values
  };
}

// === 计算偏差超过阈值的路径比例 ===
// threshold: 偏差阈值，如 0.1 表示频率偏离 50% 超过 10%
function calcOutlierRate(paths, step, trueProp, threshold) {
  const values = paths.map(p => p[step - 1]);
  const outliers = values.filter(v => Math.abs(v - trueProp) > threshold);
  return Math.round(outliers.length / values.length * 10000) / 100;
}

// === 生成直方图数据（频率分布）===
function buildHistogram(values, bins = 20) {
  const min = 0, max = 1;
  const binSize = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binSize), bins - 1);
    counts[idx]++;
  }
  const labels = [];
  for (let i = 0; i < bins; i++) {
    labels.push(((min + i * binSize + binSize / 2) * 100).toFixed(0) + '%');
  }
  return { labels, counts, binSize };
}

// === 理论标准差（中心极限定理）===
// σ = sqrt(p*(1-p)/n)
function theoreticalStd(n, p = 0.5) {
  return Math.sqrt(p * (1 - p) / n);
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    flipCoin,
    simulateFlips,
    simulateMultiplePaths,
    getFreqDistAtStep,
    calcOutlierRate,
    buildHistogram,
    theoreticalStd
  };
}
