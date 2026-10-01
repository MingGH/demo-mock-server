/**
 * Amdahl's Law - Core Logic
 * 阿姆达尔定律核心计算：加速比、天花板、边际收益
 */

const AmdahlLogic = (function () {

  function assertSerial(serialFraction) {
    if (typeof serialFraction !== 'number' || Number.isNaN(serialFraction) || serialFraction < 0 || serialFraction > 1) {
      throw new Error('串行比例必须在 [0, 1] 之间');
    }
  }

  function assertCores(cores) {
    if (!Number.isInteger(cores) || cores < 1) {
      throw new Error('核心数必须是 >= 1 的整数');
    }
  }

  /**
   * 阿姆达尔定律：S(n) = 1 / (s + (1 - s) / n)
   * @param {number} serialFraction - 串行比例 s，取值 [0, 1]
   * @param {number} cores - 核心数 n，整数 >= 1
   * @returns {number} 加速比
   */
  function amdahlSpeedup(serialFraction, cores) {
    assertSerial(serialFraction);
    assertCores(cores);
    return 1 / (serialFraction + (1 - serialFraction) / cores);
  }

  /**
   * 加速比天花板（核数无穷大）：1 / s
   * @param {number} serialFraction
   * @returns {number} s=0 时返回 Infinity
   */
  function ceilingSpeedup(serialFraction) {
    assertSerial(serialFraction);
    if (serialFraction === 0) return Infinity;
    return 1 / serialFraction;
  }

  /**
   * n 个核心跑 baseMinutes 的任务，实际耗时（分钟）
   */
  function timeMinutes(serialFraction, cores, baseMinutes) {
    if (typeof baseMinutes !== 'number' || baseMinutes <= 0) {
      throw new Error('基础耗时必须 > 0');
    }
    return baseMinutes / amdahlSpeedup(serialFraction, cores);
  }

  /**
   * 核心利用率 = 实际加速比 / 核心数
   */
  function efficiency(serialFraction, cores) {
    return amdahlSpeedup(serialFraction, cores) / cores;
  }

  /**
   * 第 n 颗核带来的加速比增量（从 n-1 核到 n 核）
   * n = 1 时没有"上一颗"，返回 0
   */
  function marginalGain(serialFraction, cores) {
    assertCores(cores);
    if (cores === 1) return 0;
    return amdahlSpeedup(serialFraction, cores) - amdahlSpeedup(serialFraction, cores - 1);
  }

  /**
   * 第 n 颗核在 baseMinutes 任务上省下的分钟数
   */
  function marginalTimeSavedMinutes(serialFraction, cores, baseMinutes) {
    assertCores(cores);
    if (cores === 1) return 0;
    const tPrev = timeMinutes(serialFraction, cores - 1, baseMinutes);
    const tCurr = timeMinutes(serialFraction, cores, baseMinutes);
    return tPrev - tCurr;
  }

  /**
   * 给定核心数，达到 targetSpeedup 允许的最大串行比例
   * 推导：S = 1/(s + (1-s)/n) >= target
   *   => s <= (1/target - 1/n) / (1 - 1/n)
   * @returns {number} 最大串行比例（0 到 1 之间）
   */
  function serialFractionForCores(cores, targetSpeedup) {
    assertCores(cores);
    if (typeof targetSpeedup !== 'number' || targetSpeedup <= 1) {
      throw new Error('目标加速比必须 > 1');
    }
    const invN = 1 / cores;
    const invT = 1 / targetSpeedup;
    if (invT <= invN) {
      // 目标比 n 核的线性加速还高：只有串行比例为 0 才可能
      return 0;
    }
    return (invT - invN) / (1 - invN);
  }

  /**
   * 给定串行比例，达到 targetSpeedup 需要的最少核心数
   * 推导：n >= (1 - s) / (1/target - s)，要求天花板 > target
   * @returns {number|null} 最少核心数，或 null（不可达）
   */
  function minCoresForSpeedup(serialFraction, targetSpeedup) {
    assertSerial(serialFraction);
    if (typeof targetSpeedup !== 'number' || targetSpeedup <= 1) {
      throw new Error('目标加速比必须 > 1');
    }
    const ceiling = ceilingSpeedup(serialFraction);
    if (ceiling <= targetSpeedup) return null;
    const need = (1 - serialFraction) / (1 / targetSpeedup - serialFraction);
    return Math.ceil(need);
  }

  /**
   * 生成 1..maxCores 的加速比曲线
   * @returns {{ cores: number[], speedup: number[], ceiling: number }}
   */
  function speedupCurve(serialFraction, maxCores) {
    assertSerial(serialFraction);
    assertCores(maxCores);
    const cores = [];
    const speedup = [];
    for (let n = 1; n <= maxCores; n++) {
      cores.push(n);
      speedup.push(amdahlSpeedup(serialFraction, n));
    }
    return { cores, speedup, ceiling: ceilingSpeedup(serialFraction) };
  }

  return {
    amdahlSpeedup,
    ceilingSpeedup,
    timeMinutes,
    efficiency,
    marginalGain,
    marginalTimeSavedMinutes,
    serialFractionForCores,
    minCoresForSpeedup,
    speedupCurve
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AmdahlLogic;
}

if (typeof window !== 'undefined') {
  window.AmdahlLogic = AmdahlLogic;
}
