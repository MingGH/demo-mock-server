/**
 * Benford's Law - Core Logic
 * 本福特定律核心算法
 */

const BenfordsLawLogic = (function() {

  /**
   * 本福特定律理论概率：首位数字 d 出现的概率 = log10(1 + 1/d)
   */
  function theoreticalDistribution() {
    const dist = {};
    for (let d = 1; d <= 9; d++) {
      dist[d] = Math.log10(1 + 1 / d);
    }
    return dist;
  }

  /**
   * 从数字数组中提取首位数字分布
   * 忽略 0 和负数取绝对值
   */
  function extractFirstDigits(numbers) {
    const counts = {};
    for (let d = 1; d <= 9; d++) counts[d] = 0;
    let total = 0;

    for (const num of numbers) {
      const abs = Math.abs(num);
      if (abs < 1) continue; // 忽略 0 和小于 1 的数
      const firstDigit = parseInt(String(abs).charAt(0));
      if (firstDigit >= 1 && firstDigit <= 9) {
        counts[firstDigit]++;
        total++;
      }
    }

    const freq = {};
    for (let d = 1; d <= 9; d++) {
      freq[d] = total > 0 ? counts[d] / total : 0;
    }

    return { counts, freq, total };
  }

  /**
   * 卡方检验：检测实际分布与本福特分布的偏离程度
   * 返回 { chiSquare, pValue, isConform }
   */
  function chiSquareTest(counts, total) {
    const theory = theoreticalDistribution();
    let chiSq = 0;

    for (let d = 1; d <= 9; d++) {
      const expected = theory[d] * total;
      if (expected > 0) {
        chiSq += Math.pow(counts[d] - expected, 2) / expected;
      }
    }

    // 自由度 = 8 (9个类别 - 1)
    // 临界值: α=0.05 → 15.507, α=0.01 → 20.090
    const df = 8;
    const pValue = 1 - chiSquareCDF(chiSq, df);
    const isConform = chiSq < 15.507; // α=0.05

    return { chiSquare: chiSq, pValue, isConform, df };
  }

  /**
   * 卡方分布 CDF 近似（用正态近似，df >= 8 时足够准确）
   */
  function chiSquareCDF(x, df) {
    // Wilson-Hilferty 近似
    const z = Math.pow(x / df, 1/3) - (1 - 2 / (9 * df));
    const denom = Math.sqrt(2 / (9 * df));
    const zScore = z / denom;
    return normalCDF(zScore);
  }

  function normalCDF(z) {
    // Abramowitz & Stegun 近似
    if (z < -8) return 0;
    if (z > 8) return 1;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  /**
   * 生成符合本福特定律的数据集
   * 方法：生成 10^U 其中 U ~ Uniform(0, maxExp)
   */
  function generateBenfordData(count, maxExp) {
    maxExp = maxExp || 6;
    const data = [];
    for (let i = 0; i < count; i++) {
      const u = Math.random() * maxExp;
      data.push(Math.floor(Math.pow(10, u)));
    }
    return data;
  }

  /**
   * 生成均匀分布的数据集（用于对比）
   */
  function generateUniformData(count, max) {
    max = max || 999;
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push(Math.floor(Math.random() * max) + 1);
    }
    return data;
  }

  /**
   * 生成伪造数据（人为编造的数字，首位趋于均匀）
   */
  function generateFakeData(count) {
    const data = [];
    for (let i = 0; i < count; i++) {
      // 人为编造：首位均匀 1-9，后面随机
      const first = Math.floor(Math.random() * 9) + 1;
      const rest = Math.floor(Math.random() * 100);
      data.push(parseInt('' + first + (rest < 10 ? '0' : '') + rest));
    }
    return data;
  }

  /**
   * 生成斐波那契数列前 n 项
   */
  function generateFibonacci(n) {
    const fib = [1, 1];
    for (let i = 2; i < n; i++) {
      fib.push(fib[i-1] + fib[i-2]);
    }
    return fib;
  }

  /**
   * 生成 2 的幂次前 n 项
   */
  function generatePowersOf2(n) {
    const data = [];
    let val = 1;
    for (let i = 0; i < n; i++) {
      data.push(val);
      val *= 2;
    }
    return data;
  }

  /**
   * 生成阶乘前 n 项
   */
  function generateFactorials(n) {
    const data = [1];
    for (let i = 1; i < n; i++) {
      data.push(data[i-1] * i);
    }
    return data;
  }

  /**
   * 计算 MAD (Mean Absolute Deviation) — 另一种符合度指标
   * MAD < 0.006: 紧密符合
   * MAD 0.006-0.012: 可接受
   * MAD 0.012-0.015: 边缘
   * MAD > 0.015: 不符合
   */
  function computeMAD(freq) {
    const theory = theoreticalDistribution();
    let sum = 0;
    for (let d = 1; d <= 9; d++) {
      sum += Math.abs(freq[d] - theory[d]);
    }
    return sum / 9;
  }

  function madVerdict(mad) {
    if (mad < 0.006) return '紧密符合';
    if (mad < 0.012) return '可接受';
    if (mad < 0.015) return '边缘符合';
    return '不符合';
  }

  // 导出
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      theoreticalDistribution, extractFirstDigits, chiSquareTest,
      generateBenfordData, generateUniformData, generateFakeData,
      generateFibonacci, generatePowersOf2, generateFactorials,
      computeMAD, madVerdict
    };
  }

  return {
    theoreticalDistribution, extractFirstDigits, chiSquareTest,
    generateBenfordData, generateUniformData, generateFakeData,
    generateFibonacci, generatePowersOf2, generateFactorials,
    computeMAD, madVerdict
  };
})();
