// ========== Collatz 猜想核心算法（可独立测试） ==========

/**
 * 计算单个数的 Collatz 序列
 * @param {number} n 起始正整数
 * @returns {number[]} 完整序列（含起始值和终止值1）
 */
function collatzSequence(n) {
  if (n < 1 || !Number.isInteger(n)) return [];
  const seq = [n];
  let current = n;
  const MAX_STEPS = 100000;
  while (current !== 1 && seq.length < MAX_STEPS) {
    if (current % 2 === 0) {
      current = current / 2;
    } else {
      current = current * 3 + 1;
    }
    seq.push(current);
  }
  return seq;
}

/**
 * 计算到达1所需的步数（stopping time）
 * @param {number} n 起始正整数
 * @returns {number} 步数
 */
function collatzSteps(n) {
  if (n < 1 || !Number.isInteger(n)) return 0;
  let steps = 0;
  let current = n;
  while (current !== 1 && steps < 100000) {
    if (current % 2 === 0) {
      current = current / 2;
    } else {
      current = current * 3 + 1;
    }
    steps++;
  }
  return steps;
}

/**
 * 计算序列中的最大值（最高飞行高度）
 * @param {number} n 起始正整数
 * @returns {number} 序列最大值
 */
function collatzMax(n) {
  const seq = collatzSequence(n);
  return Math.max(...seq);
}

/**
 * 批量计算 1~maxN 每个数的步数
 * @param {number} maxN 上界
 * @returns {{n: number, steps: number}[]}
 */
function batchSteps(maxN) {
  const results = [];
  for (let i = 1; i <= maxN; i++) {
    results.push({ n: i, steps: collatzSteps(i) });
  }
  return results;
}

/**
 * 找到 1~maxN 中步数最多的数
 * @param {number} maxN 上界
 * @returns {{n: number, steps: number}}
 */
function findLongest(maxN) {
  let best = { n: 1, steps: 0 };
  for (let i = 2; i <= maxN; i++) {
    const s = collatzSteps(i);
    if (s > best.steps) {
      best = { n: i, steps: s };
    }
  }
  return best;
}

/**
 * 找到 1~maxN 中飞行高度最高的数
 * @param {number} maxN 上界
 * @returns {{n: number, max: number}}
 */
function findHighest(maxN) {
  let best = { n: 1, max: 1 };
  for (let i = 2; i <= maxN; i++) {
    const m = collatzMax(i);
    if (m > best.max) {
      best = { n: i, max: m };
    }
  }
  return best;
}

/**
 * 统计 1~maxN 中步数的频率分布
 * @param {number} maxN 上界
 * @returns {Map<number, number>} steps → count
 */
function stepsDistribution(maxN) {
  const dist = new Map();
  for (let i = 1; i <= maxN; i++) {
    const s = collatzSteps(i);
    dist.set(s, (dist.get(s) || 0) + 1);
  }
  return dist;
}

/**
 * 格式化大数字为易读字符串
 */
function formatNumber(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + '万亿';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n.toLocaleString();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    collatzSequence,
    collatzSteps,
    collatzMax,
    batchSteps,
    findLongest,
    findHighest,
    stepsDistribution,
    formatNumber
  };
}
