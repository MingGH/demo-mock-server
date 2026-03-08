/**
 * Coupon Collector's Problem - Core Logic
 * 优惠券收集问题核心算法
 */

const CouponCollectorLogic = (function() {

  /**
   * 理论期望：集齐 n 种需要的抽取次数
   * E[T] = n * H(n)，其中 H(n) = 1 + 1/2 + 1/3 + ... + 1/n（调和级数）
   */
  function expectedDraws(n) {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      sum += 1 / i;
    }
    return n * sum;
  }

  /**
   * 每个阶段的期望抽取次数
   * 已有 k 种时，抽到新种类的概率 = (n-k)/n，期望 = n/(n-k)
   */
  function stageExpected(n) {
    const stages = [];
    for (let k = 0; k < n; k++) {
      stages.push({
        owned: k,
        probability: (n - k) / n,
        expected: n / (n - k)
      });
    }
    return stages;
  }

  /**
   * 单次模拟：集齐 n 种需要多少次
   * 返回 { totalDraws, history }
   * history[i] = 第 i 次抽取后拥有的种类数
   */
  function simulateOnce(n) {
    const collected = new Set();
    const history = [0];
    let draws = 0;

    while (collected.size < n) {
      const item = Math.floor(Math.random() * n);
      collected.add(item);
      draws++;
      history.push(collected.size);
    }

    return { totalDraws: draws, history };
  }

  /**
   * 批量模拟：跑 trials 次，返回每次的抽取次数数组
   */
  function simulateBatch(n, trials) {
    const results = [];
    for (let t = 0; t < trials; t++) {
      const collected = new Set();
      let draws = 0;
      while (collected.size < n) {
        collected.add(Math.floor(Math.random() * n));
        draws++;
      }
      results.push(draws);
    }
    return results;
  }

  /**
   * 计算分布统计
   */
  function computeStats(results) {
    const sorted = [...results].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    // 标准差
    const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sorted.length;
    const stdDev = Math.sqrt(variance);

    // 百分位
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { mean, median, min, max, stdDev, p90, p95, p99 };
  }

  /**
   * 生成频率分布（用于直方图）
   */
  function buildHistogram(results, bucketCount) {
    const min = Math.min(...results);
    const max = Math.max(...results);
    const range = max - min || 1;
    const bucketSize = Math.ceil(range / bucketCount);

    const buckets = [];
    for (let i = 0; i < bucketCount; i++) {
      const lo = min + i * bucketSize;
      const hi = lo + bucketSize;
      buckets.push({ lo, hi, count: 0 });
    }

    for (const v of results) {
      let idx = Math.floor((v - min) / bucketSize);
      if (idx >= bucketCount) idx = bucketCount - 1;
      buckets[idx].count++;
    }

    return buckets;
  }

  // 导出
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { expectedDraws, stageExpected, simulateOnce, simulateBatch, computeStats, buildHistogram };
  }

  return { expectedDraws, stageExpected, simulateOnce, simulateBatch, computeStats, buildHistogram };
})();
