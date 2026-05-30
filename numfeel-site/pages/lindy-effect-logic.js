/**
 * lindy-effect-logic.js
 * 林迪效应核心算法
 * 存在越久，预期剩余寿命越长
 */

(function(exports) {
  'use strict';

  /**
   * 帕累托分布 CDF: P(X <= x) = 1 - (x_m / x)^alpha, x >= x_m
   * 帕累托分布的条件期望（林迪效应的数学基础）：
   * 给定 X > t（已存活 t 年），E[X - t | X > t] = t / (alpha - 1)  (alpha > 1)
   */

  /**
   * 计算林迪预测的期望剩余寿命
   * @param {number} age - 已存在时间（年）
   * @param {number} alpha - 帕累托分布的形状参数（越小尾巴越重）
   * @returns {number} 预期剩余寿命
   */
  function lindyExpectedRemaining(age, alpha) {
    if (age <= 0) return 0;
    if (alpha <= 1) return Infinity;
    return age / (alpha - 1);
  }

  /**
   * 计算林迪预测的中位剩余寿命
   * P(X > t + r | X > t) = 0.5 => r = t * (2^(1/alpha) - 1)
   * @param {number} age - 已存在时间
   * @param {number} alpha - 帕累托形状参数
   * @returns {number} 中位剩余寿命
   */
  function lindyMedianRemaining(age, alpha) {
    if (age <= 0) return 0;
    if (alpha <= 0) return Infinity;
    return age * (Math.pow(2, 1 / alpha) - 1);
  }

  /**
   * 条件生存概率：已存活 age 年后，再活 extra 年的概率
   * P(X > age + extra | X > age) = (age / (age + extra))^alpha
   * @param {number} age - 已存在时间
   * @param {number} extra - 额外存活时间
   * @param {number} alpha - 帕累托形状参数
   * @returns {number} 概率 [0, 1]
   */
  function survivalProbability(age, extra, alpha) {
    if (age <= 0 || extra < 0) return 0;
    if (extra === 0) return 1;
    return Math.pow(age / (age + extra), alpha);
  }

  /**
   * 生成生存曲线数据
   * @param {number} age - 已存在时间
   * @param {number} alpha - 帕累托形状参数
   * @param {number} maxExtra - 最大额外时间
   * @param {number} steps - 数据点数
   * @returns {Array<{year: number, probability: number}>}
   */
  function survivalCurve(age, alpha, maxExtra, steps) {
    steps = steps || 100;
    maxExtra = maxExtra || age * 5;
    var data = [];
    for (var i = 0; i <= steps; i++) {
      var extra = (maxExtra / steps) * i;
      data.push({
        year: Math.round(extra * 100) / 100,
        probability: survivalProbability(age, extra, alpha)
      });
    }
    return data;
  }

  /**
   * 蒙特卡洛模拟：从帕累托分布中采样，条件于已存活 age 年
   * 使用逆变换采样：X = x_m / U^(1/alpha)，其中 U ~ Uniform(0,1)
   * 条件采样：只保留 X > age 的样本
   * @param {number} age - 已存在时间
   * @param {number} alpha - 帕累托形状参数
   * @param {number} trials - 模拟次数
   * @returns {Object} { samples, mean, median, p25, p75, p90, histogram }
   */
  function monteCarloLindy(age, alpha, trials) {
    trials = trials || 10000;
    var xm = 1; // 最小值参数，不影响条件分布的形状
    var remaining = [];

    // 条件采样：直接从条件分布采样
    // 如果 X ~ Pareto(xm, alpha) 且 X > age，
    // 则 X | X > age ~ Pareto(age, alpha)（帕累托分布的无记忆性变体）
    // 所以 X = age / U^(1/alpha)，剩余寿命 = X - age
    for (var i = 0; i < trials; i++) {
      var u = Math.random();
      while (u === 0) u = Math.random();
      var x = age / Math.pow(u, 1 / alpha);
      remaining.push(x - age);
    }

    remaining.sort(function(a, b) { return a - b; });

    var sum = 0;
    for (var j = 0; j < remaining.length; j++) sum += remaining[j];
    var mean = sum / remaining.length;
    var median = remaining[Math.floor(remaining.length * 0.5)];
    var p25 = remaining[Math.floor(remaining.length * 0.25)];
    var p75 = remaining[Math.floor(remaining.length * 0.75)];
    var p90 = remaining[Math.floor(remaining.length * 0.9)];

    // 构建直方图
    var maxVal = remaining[Math.floor(remaining.length * 0.95)]; // 截断到95%
    var bins = 30;
    var binWidth = maxVal / bins;
    var counts = new Array(bins).fill(0);
    var labels = [];
    for (var b = 0; b < bins; b++) {
      labels.push(Math.round(binWidth * (b + 0.5) * 10) / 10);
      for (var k = 0; k < remaining.length; k++) {
        if (remaining[k] >= b * binWidth && remaining[k] < (b + 1) * binWidth) {
          counts[b]++;
        }
      }
    }

    return {
      samples: remaining,
      mean: mean,
      median: median,
      p25: p25,
      p75: p75,
      p90: p90,
      histogram: { labels: labels, counts: counts, binWidth: binWidth }
    };
  }

  /**
   * 对比实验：新事物 vs 老事物的预期剩余寿命
   * @param {Array<{name: string, age: number}>} items
   * @param {number} alpha
   * @returns {Array<{name: string, age: number, expectedRemaining: number, medianRemaining: number, totalExpected: number}>}
   */
  function compareItems(items, alpha) {
    var results = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var er = lindyExpectedRemaining(item.age, alpha);
      var mr = lindyMedianRemaining(item.age, alpha);
      results.push({
        name: item.name,
        age: item.age,
        expectedRemaining: er,
        medianRemaining: mr,
        totalExpected: item.age + er
      });
    }
    return results;
  }

  /**
   * 预设案例数据
   */
  var PRESETS = {
    books: [
      { name: '《论语》', age: 2500 },
      { name: '《红楼梦》', age: 260 },
      { name: '《三体》', age: 18 },
      { name: '某网络爽文', age: 1 }
    ],
    restaurants: [
      { name: '百年老店', age: 100 },
      { name: '20年老馆子', age: 20 },
      { name: '网红餐厅', age: 2 },
      { name: '新开的店', age: 0.5 }
    ],
    tech: [
      { name: 'Unix (1969)', age: 57 },
      { name: 'Python (1991)', age: 35 },
      { name: 'React (2013)', age: 13 },
      { name: '某新框架', age: 1 }
    ],
    companies: [
      { name: '同仁堂 (1669)', age: 357 },
      { name: '可口可乐 (1886)', age: 140 },
      { name: '苹果 (1976)', age: 50 },
      { name: '某AI创业公司', age: 2 }
    ]
  };

  /**
   * 计算不同 alpha 下的敏感性
   * @param {number} age
   * @param {Array<number>} alphas
   * @returns {Array<{alpha: number, expected: number, median: number}>}
   */
  function alphaSensitivity(age, alphas) {
    var results = [];
    for (var i = 0; i < alphas.length; i++) {
      results.push({
        alpha: alphas[i],
        expected: lindyExpectedRemaining(age, alphas[i]),
        median: lindyMedianRemaining(age, alphas[i])
      });
    }
    return results;
  }

  // ========== 导出 ==========
  exports.lindyExpectedRemaining = lindyExpectedRemaining;
  exports.lindyMedianRemaining = lindyMedianRemaining;
  exports.survivalProbability = survivalProbability;
  exports.survivalCurve = survivalCurve;
  exports.monteCarloLindy = monteCarloLindy;
  exports.compareItems = compareItems;
  exports.alphaSensitivity = alphaSensitivity;
  exports.PRESETS = PRESETS;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.LindyEffectLogic = {}));
