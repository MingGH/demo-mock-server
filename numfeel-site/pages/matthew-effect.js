/**
 * 马太效应 / 累积优势模拟
 * 优先连接模型（Preferential Attachment）+ 幂律分布
 */

/**
 * 模拟一批内容在社交网络中的传播
 * @param {Object} opts
 * @param {number} opts.contentCount   - 内容数量
 * @param {number} opts.totalLikes     - 总点赞数（用户注意力总量）
 * @param {number} opts.initialBoost   - 头部内容的初始点赞优势（0 = 完全公平）
 * @param {number} opts.alpha          - 优先连接强度 0~1（0=随机, 1=纯马太）
 * @param {number} opts.rounds         - 分配轮数
 * @returns {{ likes: number[], gini: number, top20pct: number }}
 */
function simulateMatthewEffect({ contentCount = 100, totalLikes = 10000, initialBoost = 0, alpha = 0.8, rounds = 100 } = {}) {
  // 初始化：每条内容基础点赞 = 1，头部内容额外加 initialBoost
  const likes = new Array(contentCount).fill(1);
  if (initialBoost > 0) {
    // 只给第一条内容加初始优势
    likes[0] += initialBoost;
  }

  const likesPerRound = Math.floor(totalLikes / rounds);

  for (let r = 0; r < rounds; r++) {
    const total = likes.reduce((a, b) => a + b, 0);
    // 每轮分配 likesPerRound 个点赞
    for (let i = 0; i < likesPerRound; i++) {
      // 优先连接：以 alpha 概率按现有点赞比例选择，以 (1-alpha) 概率随机选择
      let idx;
      if (Math.random() < alpha) {
        // 按比例选择（富者愈富）
        let rand = Math.random() * total;
        let cumSum = 0;
        idx = contentCount - 1;
        for (let j = 0; j < contentCount; j++) {
          cumSum += likes[j];
          if (rand < cumSum) { idx = j; break; }
        }
      } else {
        // 随机选择
        idx = Math.floor(Math.random() * contentCount);
      }
      likes[idx]++;
    }
  }

  return {
    likes: likes.slice().sort((a, b) => b - a),
    gini: calcGini(likes),
    top20pct: calcTop20(likes),
  };
}

/**
 * 对比两条质量相同的内容，只有初始点赞不同
 * @param {number} boostA  - 内容A的初始额外点赞
 * @param {number} boostB  - 内容B的初始额外点赞
 * @param {number} alpha   - 马太强度
 * @param {number} rounds  - 轮数
 * @returns {{ historyA: number[], historyB: number[], finalA: number, finalB: number }}
 */
function simulateTwoContents({ boostA = 10, boostB = 0, alpha = 0.8, rounds = 200 } = {}) {
  let likesA = 1 + boostA;
  let likesB = 1 + boostB;
  const historyA = [likesA];
  const historyB = [likesB];

  for (let r = 0; r < rounds; r++) {
    const total = likesA + likesB;
    // 每轮新增 10 个点赞
    for (let i = 0; i < 10; i++) {
      if (Math.random() < alpha) {
        if (Math.random() < likesA / total) likesA++;
        else likesB++;
      } else {
        if (Math.random() < 0.5) likesA++;
        else likesB++;
      }
    }
    historyA.push(likesA);
    historyB.push(likesB);
  }

  return { historyA, historyB, finalA: likesA, finalB: likesB };
}

/**
 * 多次模拟取平均，得到稳定的对比曲线
 */
function simulateTwoContentsAvg({ boostA = 10, boostB = 0, alpha = 0.8, rounds = 200, trials = 200 } = {}) {
  const sumA = new Array(rounds + 1).fill(0);
  const sumB = new Array(rounds + 1).fill(0);

  for (let t = 0; t < trials; t++) {
    const { historyA, historyB } = simulateTwoContents({ boostA, boostB, alpha, rounds });
    for (let i = 0; i <= rounds; i++) {
      sumA[i] += historyA[i];
      sumB[i] += historyB[i];
    }
  }

  return {
    avgA: sumA.map(v => +(v / trials).toFixed(1)),
    avgB: sumB.map(v => +(v / trials).toFixed(1)),
    finalRatio: +(sumA[rounds] / sumB[rounds]).toFixed(1),
  };
}

/**
 * 计算基尼系数（衡量不平等程度，0=完全平等，1=极度不平等）
 */
function calcGini(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let sumOfAbsDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfAbsDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return +(sumOfAbsDiff / (2 * n * total)).toFixed(3);
}

/**
 * 计算前20%内容占总点赞的比例（二八定律验证）
 */
function calcTop20(arr) {
  const sorted = arr.slice().sort((a, b) => b - a);
  const top20count = Math.max(1, Math.floor(sorted.length * 0.2));
  const top20sum = sorted.slice(0, top20count).reduce((a, b) => a + b, 0);
  const total = sorted.reduce((a, b) => a + b, 0);
  return +((top20sum / total * 100).toFixed(1));
}

/**
 * 生成幂律分布的理论曲线（用于对比）
 * P(k) ∝ k^(-gamma)
 */
function powerLawTheory(maxK, gamma = 2.0, points = 50) {
  const result = [];
  for (let i = 1; i <= points; i++) {
    const k = Math.round(1 + (maxK - 1) * (i - 1) / (points - 1));
    result.push({ k, p: Math.pow(k, -gamma) });
  }
  // 归一化
  const sum = result.reduce((a, b) => a + b.p, 0);
  return result.map(r => ({ k: r.k, p: +(r.p / sum).toFixed(6) }));
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { simulateMatthewEffect, simulateTwoContents, simulateTwoContentsAvg, calcGini, calcTop20, powerLawTheory };
}
