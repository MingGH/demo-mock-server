/**
 * AI Scaling Law (幂律缩放定律) 核心逻辑
 * 可独立用 node 运行测试
 */

const ScalingLawLogic = {

  /**
   * 幂律函数：y = a * x^b
   * 用于模拟 Loss ~ (Compute)^(-alpha)
   */
  powerLaw(x, a, b) {
    return a * Math.pow(x, b);
  },

  /**
   * 对数坐标下的线性关系：log(y) = log(a) + b * log(x)
   */
  logLinear(logX, logA, b) {
    return logA + b * logX;
  },

  /**
   * 生成 Chinchilla 缩放定律数据点
   * Loss(N, D) ≈ E + A/N^alpha + B/D^beta
   * 简化版：固定 D，只看参数量 N 对 Loss 的影响
   * @param {number} nMin - 最小参数量（亿）
   * @param {number} nMax - 最大参数量（亿）
   * @param {number} points - 数据点数量
   */
  generateScalingCurve(nMin = 0.1, nMax = 1000, points = 50) {
    // Chinchilla 论文近似参数
    const E = 1.69;   // 不可约损失（熵下界）
    const A = 406.4;
    const alpha = 0.34;
    const B = 410.7;
    const beta = 0.28;
    // 假设 D = 20 * N（Chinchilla 最优比例）
    const result = [];
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const N = nMin * Math.pow(nMax / nMin, t); // 对数均匀采样
      const D = 20 * N; // Chinchilla 最优
      const loss = E + A / Math.pow(N, alpha) + B / Math.pow(D, beta);
      result.push({ N: +N.toFixed(4), loss: +loss.toFixed(4) });
    }
    return result;
  },

  /**
   * 生成"算力 vs 性能"的幂律曲线
   * 模拟 OpenAI Scaling Laws 论文中的 Loss ~ C^(-0.05)
   * @param {number} cMin - 最小算力（PetaFLOP/s-day）
   * @param {number} cMax - 最大算力
   * @param {number} points
   */
  generateComputeCurve(cMin = 1e-3, cMax = 1e6, points = 60) {
    const result = [];
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const C = cMin * Math.pow(cMax / cMin, t);
      // 近似：loss = 3.1 * C^(-0.05)
      const loss = 3.1 * Math.pow(C, -0.05);
      result.push({ C: +C.toFixed(6), loss: +loss.toFixed(4) });
    }
    return result;
  },

  /**
   * 计算"翻倍收益递减"：参数量每翻一倍，Loss 下降多少
   * @param {number} alpha - 幂律指数（通常 0.3~0.4）
   * @param {number} doublings - 翻倍次数
   */
  computeDoublingGains(alpha = 0.34, doublings = 10) {
    const result = [];
    let N = 1;
    let prevLoss = null;
    for (let i = 0; i <= doublings; i++) {
      // 简化：loss ∝ N^(-alpha)
      const loss = Math.pow(N, -alpha);
      const drop = prevLoss !== null ? prevLoss - loss : null;
      const dropPct = prevLoss !== null ? ((drop / prevLoss) * 100) : null;
      result.push({
        doubling: i,
        N: N,
        loss: +loss.toFixed(4),
        drop: drop !== null ? +drop.toFixed(4) : null,
        dropPct: dropPct !== null ? +dropPct.toFixed(1) : null
      });
      prevLoss = loss;
      N *= 2;
    }
    return result;
  },

  /**
   * 模拟"涌现能力"（Emergent Abilities）
   * 某些能力在参数量达到阈值前几乎为0，之后突然跃升
   * @param {number} threshold - 涌现阈值（亿参数）
   * @param {number} steepness - 跃升陡峭程度
   */
  generateEmergentCurve(threshold = 50, steepness = 0.15, points = 80) {
    const result = [];
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const N = 0.1 * Math.pow(1000 / 0.1, t); // 0.1亿 ~ 1000亿
      // sigmoid 函数模拟涌现
      const x = (Math.log10(N) - Math.log10(threshold)) * steepness * 50;
      const ability = 1 / (1 + Math.exp(-x));
      // 加一点噪声
      const noise = (Math.random() - 0.5) * 0.04;
      result.push({ N: +N.toFixed(3), ability: +Math.max(0, Math.min(1, ability + noise)).toFixed(3) });
    }
    return result;
  },

  /**
   * 对比不同模型的"效率前沿"
   * 相同算力下，不同架构/训练策略的性能差异
   */
  generateEfficiencyFrontier() {
    // 模拟几个代表性模型的 (算力, 性能) 数据点
    // 性能用 benchmark 分数表示（0-100）
    return [
      { name: 'GPT-3 (2020)', compute: 3.14e23, score: 71, params: 175, era: 'pre-chinchilla' },
      { name: 'Gopher (2021)', compute: 5.76e23, score: 74, params: 280, era: 'pre-chinchilla' },
      { name: 'PaLM (2022)', compute: 2.5e24, score: 78, params: 540, era: 'pre-chinchilla' },
      { name: 'Chinchilla (2022)', compute: 5.76e23, score: 80, params: 70, era: 'chinchilla' },
      { name: 'LLaMA-2 (2023)', compute: 1.8e24, score: 82, params: 70, era: 'efficient' },
      { name: 'Mistral (2023)', compute: 6e23, score: 81, params: 7, era: 'efficient' },
      { name: 'DeepSeek-V2 (2024)', compute: 1.2e24, score: 85, params: 236, era: 'moe' },
      { name: 'DeepSeek-R1 (2025)', compute: 5.6e21, score: 87, params: 671, era: 'moe' },
      { name: 'GPT-4 (2023)', compute: 2.1e25, score: 90, params: 1800, era: 'frontier' },
      { name: 'Claude 3.5 (2024)', compute: 1.5e25, score: 91, params: 500, era: 'frontier' },
    ];
  },

  /**
   * 计算幂律拟合（最小二乘法，对数空间）
   * @param {Array} points - [{x, y}]
   * @returns {{a, b, r2}} - y = a * x^b，以及 R²
   */
  fitPowerLaw(points) {
    const n = points.length;
    if (n < 2) return null;
    const logX = points.map(p => Math.log10(p.x));
    const logY = points.map(p => Math.log10(p.y));
    const meanX = logX.reduce((s, v) => s + v, 0) / n;
    const meanY = logY.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (logX[i] - meanX) * (logY[i] - meanY);
      den += (logX[i] - meanX) ** 2;
    }
    const b = den !== 0 ? num / den : 0;
    const logA = meanY - b * meanX;
    const a = Math.pow(10, logA);
    // R²
    const yPred = logX.map(lx => logA + b * lx);
    const ssTot = logY.reduce((s, v) => s + (v - meanY) ** 2, 0);
    const ssRes = logY.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
    return { a: +a.toFixed(4), b: +b.toFixed(4), r2: +r2.toFixed(4) };
  },

  /**
   * 预测：给定当前模型性能，下一代需要多少倍算力才能提升 X 分
   * @param {number} currentScore - 当前分数（0-100）
   * @param {number} targetScore - 目标分数
   * @param {number} alpha - 幂律指数
   */
  predictComputeNeeded(currentScore, targetScore, alpha = 0.05) {
    // score ∝ C^alpha => C2/C1 = (score2/score1)^(1/alpha)
    // 用 loss 反推：loss = 100 - score（简化）
    const loss1 = 100 - currentScore;
    const loss2 = 100 - targetScore;
    if (loss2 <= 0) return Infinity;
    const ratio = Math.pow(loss1 / loss2, 1 / alpha);
    return +ratio.toFixed(2);
  }
};

// Node.js 环境下导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScalingLawLogic;
}
