// ===== 秒杀模拟引擎 =====
// 纯计算逻辑，无 DOM 操作，方便单独测试

const Engine = {
  /**
   * 生成高斯分布随机数 (Box-Muller)
   */
  gaussianRandom(mean, std) {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z * std + mean;
  },

  /**
   * 生成 N 名用户的网络延迟（ms）
   * 使用高斯分布，均值 150ms，标准差 60ms，限制在 20~800ms
   */
  generateLatencies(n, mean, std, min, max) {
    const latencies = [];
    for (let i = 0; i < n; i++) {
      let lat = this.gaussianRandom(mean, std);
      lat = Math.max(min, Math.min(max, lat));
      latencies.push(Math.round(lat * 10) / 10);
    }
    return latencies;
  },

  /**
   * 运行一次秒杀模拟
   * @param {number} n - 总参与人数
   * @param {number} m - 库存数量
   * @param {number} mean - 延迟均值
   * @param {number} std - 延迟标准差
   * @returns {object} 模拟结果
   */
  simulate(n, m, mean, std, min, max) {
    const latencies = this.generateLatencies(n, mean, std, min, max);
    // 你的位置：随机插入
    const userIndex = Math.floor(Math.random() * n);
    const userLatency = latencies[userIndex];

    // 按延迟排序（小的先到达）
    const sorted = latencies.map((l, i) => ({ latency: l, idx: i }))
      .sort((a, b) => a.latency - b.latency);

    // 前 M 名获胜
    const winners = new Set();
    for (let i = 0; i < Math.min(m, n); i++) {
      winners.add(sorted[i].idx);
    }

    const userWon = winners.has(userIndex);
    // 找到用户的排名（1-based）
    const userRank = sorted.findIndex(x => x.idx === userIndex) + 1;
    // 最后一名获胜者的延迟
    const cutoffLatency = m <= n ? sorted[m - 1].latency : sorted[sorted.length - 1].latency;
    // 用户与最后一名的差距（负数=比最后一名快，但可能在 M 名之后）
    const latencyGap = Math.round((userLatency - cutoffLatency) * 10) / 10;

    // 所有获胜者的延迟
    const winnerLatencies = [];
    for (let i = 0; i < Math.min(m, n); i++) {
      winnerLatencies.push(sorted[i].latency);
    }

    return {
      participants: n,
      stock: m,
      userIndex,
      userLatency,
      userRank,
      userWon,
      cutoffLatency,
      latencyGap,
      allLatencies: latencies,
      sortedIndices: sorted.map(x => x.idx),
      winnerLatencies,
      winners
    };
  },

  /**
   * 批量模拟，返回统计
   * @param {number} n - 总参与人数
   * @param {number} m - 库存
   * @param {number} runs - 模拟次数
   */
  batchSimulate(n, m, mean, std, min, max, runs) {
    let wins = 0;
    const latencies = [];
    const positions = [];
    for (let i = 0; i < runs; i++) {
      const r = this.simulate(n, m, mean, std, min, max);
      if (r.userWon) wins++;
      latencies.push(r.userLatency);
      positions.push(r.userRank);
    }
    return {
      totalRuns: runs,
      wins,
      winRate: Math.round((wins / runs) * 1000) / 10,
      avgLatency: Math.round(latencies.reduce((a, b) => a + b, 0) / runs * 10) / 10,
      avgPosition: Math.round(positions.reduce((a, b) => a + b, 0) / runs * 10) / 10
    };
  }
};

// 用于 Node.js 测试
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
}
