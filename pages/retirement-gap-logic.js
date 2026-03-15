/**
 * retirement-gap-logic.js
 * 养老金缺口计算器 — 核心算法
 * 蒙特卡洛模拟：你的钱能撑到几岁？
 */

(function(exports) {
  'use strict';

  /**
   * 高斯随机数（Box-Muller）
   */
  function gaussianRandom(mean, std) {
    if (std === 0) return mean;
    var u1 = Math.random(), u2 = Math.random();
    while (u1 === 0) u1 = Math.random(); // avoid log(0)
    var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }

  /**
   * 单次模拟：给定参数，模拟到钱花完的年龄
   * @param {Object} params
   *   - currentAge: 当前年龄
   *   - retireAge: 退休年龄
   *   - lifeExpectancy: 预期寿命（用于封顶）
   *   - currentSavings: 当前储蓄（元）
   *   - monthlySaving: 退休前每月储蓄（元）
   *   - monthlyExpense: 退休后每月支出（元，当前价格）
   *   - annualReturn: 年化投资回报率（如 0.05）
   *   - returnStd: 回报率标准差（如 0.12）
   *   - inflationRate: 年通胀率（如 0.03）
   *   - inflationStd: 通胀标准差（如 0.01）
   *   - pensionMonthly: 每月养老金/社保收入（元，退休时价格）
   *   - emergencyRate: 每年发生大额意外支出的概率（如 0.05）
   *   - emergencyAmount: 意外支出金额（元）
   * @returns {Object} { depletionAge, peakWealth, wealthAtRetire, wealthPath }
   */
  function simulateOnce(params) {
    var age = params.currentAge;
    var retireAge = params.retireAge;
    var maxAge = params.lifeExpectancy || 100;
    var wealth = params.currentSavings || 0;
    var monthlySaving = params.monthlySaving || 0;
    var monthlyExpense = params.monthlyExpense || 3000;
    var annualReturn = params.annualReturn != null ? params.annualReturn : 0.05;
    var returnStd = params.returnStd != null ? params.returnStd : 0.12;
    var inflationRate = params.inflationRate != null ? params.inflationRate : 0.03;
    var inflationStd = params.inflationStd != null ? params.inflationStd : 0.01;
    var pensionMonthly = params.pensionMonthly || 0;
    var emergencyRate = params.emergencyRate != null ? params.emergencyRate : 0.05;
    var emergencyAmount = params.emergencyAmount != null ? params.emergencyAmount : 50000;
    var lumpSumAge = params.lumpSumAge || 0;
    var lumpSumAmount = params.lumpSumAmount || 0;

    var peakWealth = wealth;
    var wealthAtRetire = 0;
    var wealthPath = [{ age: age, wealth: wealth }];
    var cumulativeInflation = 1;

    for (var y = age; y < maxAge; y++) {
      var yearReturn = gaussianRandom(annualReturn, returnStd);
      var yearInflation = Math.max(0, gaussianRandom(inflationRate, inflationStd));
      cumulativeInflation *= (1 + yearInflation);

      if (y < retireAge) {
        // 积累阶段：每月存钱 + 投资回报
        wealth += monthlySaving * 12;
        wealth *= (1 + yearReturn);
      } else {
        // 退休阶段：投资回报 - 支出 + 养老金
        wealth *= (1 + yearReturn);
        var realExpense = monthlyExpense * 12 * cumulativeInflation;
        var realPension = pensionMonthly * 12 * cumulativeInflation;
        wealth -= (realExpense - realPension);
      }

      // 意外支出
      if (Math.random() < emergencyRate) {
        wealth -= emergencyAmount * cumulativeInflation;
      }

      // 一次性大额支出（如帮子女买房）
      if (lumpSumAge > 0 && y + 1 === lumpSumAge) {
        wealth -= lumpSumAmount * cumulativeInflation;
      }

      if (y === retireAge) {
        wealthAtRetire = Math.max(0, wealth);
      }

      if (wealth > peakWealth) peakWealth = wealth;

      if (wealth <= 0) {
        wealthPath.push({ age: y + 1, wealth: 0 });
        return {
          depletionAge: y + 1,
          peakWealth: peakWealth,
          wealthAtRetire: wealthAtRetire,
          wealthPath: wealthPath
        };
      }

      wealthPath.push({ age: y + 1, wealth: wealth });
    }

    return {
      depletionAge: maxAge,
      peakWealth: peakWealth,
      wealthAtRetire: wealthAtRetire,
      wealthPath: wealthPath
    };
  }

  /**
   * 蒙特卡洛模拟
   * @param {Object} params - 同 simulateOnce
   * @param {number} trials - 模拟次数
   * @returns {Object}
   */
  function monteCarloRetirement(params, trials) {
    trials = trials || 5000;
    var ages = [];
    var wealthAtRetireArr = [];
    var peakArr = [];
    var samplePaths = [];
    var sampleInterval = Math.max(1, Math.floor(trials / 20));

    for (var i = 0; i < trials; i++) {
      var result = simulateOnce(params);
      ages.push(result.depletionAge);
      wealthAtRetireArr.push(result.wealthAtRetire);
      peakArr.push(result.peakWealth);
      if (i % sampleInterval === 0 && samplePaths.length < 20) {
        samplePaths.push(result.wealthPath);
      }
    }

    ages.sort(function(a, b) { return a - b; });
    wealthAtRetireArr.sort(function(a, b) { return a - b; });

    var sum = 0;
    for (var j = 0; j < ages.length; j++) sum += ages[j];
    var avgAge = sum / ages.length;

    var maxAge = params.lifeExpectancy || 100;
    var survivedCount = 0;
    for (var k = 0; k < ages.length; k++) {
      if (ages[k] >= maxAge) survivedCount++;
    }

    var p10 = ages[Math.floor(trials * 0.1)];
    var p25 = ages[Math.floor(trials * 0.25)];
    var p50 = ages[Math.floor(trials * 0.5)];
    var p75 = ages[Math.floor(trials * 0.75)];
    var p90 = ages[Math.floor(trials * 0.9)];

    // 分布直方图数据
    var minAge = params.retireAge;
    var buckets = {};
    for (var b = minAge; b <= maxAge; b++) {
      buckets[b] = 0;
    }
    for (var m = 0; m < ages.length; m++) {
      var a = Math.min(ages[m], maxAge);
      buckets[a] = (buckets[a] || 0) + 1;
    }

    var wealthRetireSum = 0;
    for (var w = 0; w < wealthAtRetireArr.length; w++) wealthRetireSum += wealthAtRetireArr[w];

    return {
      ages: ages,
      avgDepletionAge: avgAge,
      medianDepletionAge: p50,
      p10: p10,
      p25: p25,
      p75: p75,
      p90: p90,
      survivalRate: survivedCount / trials,
      survivalPercent: (survivedCount / trials * 100),
      avgWealthAtRetire: wealthRetireSum / trials,
      buckets: buckets,
      samplePaths: samplePaths,
      trials: trials
    };
  }

  /**
   * 确定性计算（不含随机波动）：简单估算钱能撑到几岁
   */
  function deterministicEstimate(params) {
    var age = params.currentAge;
    var retireAge = params.retireAge;
    var maxAge = params.lifeExpectancy || 100;
    var wealth = params.currentSavings || 0;
    var monthlySaving = params.monthlySaving || 0;
    var monthlyExpense = params.monthlyExpense || 3000;
    var annualReturn = params.annualReturn || 0.05;
    var inflationRate = params.inflationRate || 0.03;
    var pensionMonthly = params.pensionMonthly || 0;

    var wealthAtRetire = 0;
    var cumulativeInflation = 1;
    var path = [{ age: age, wealth: wealth }];

    for (var y = age; y < maxAge; y++) {
      cumulativeInflation *= (1 + inflationRate);
      if (y < retireAge) {
        wealth += monthlySaving * 12;
        wealth *= (1 + annualReturn);
      } else {
        wealth *= (1 + annualReturn);
        var realExpense = monthlyExpense * 12 * cumulativeInflation;
        var realPension = pensionMonthly * 12 * cumulativeInflation;
        wealth -= (realExpense - realPension);
      }
      if (y === retireAge) wealthAtRetire = Math.max(0, wealth);
      if (wealth <= 0) {
        path.push({ age: y + 1, wealth: 0 });
        return { depletionAge: y + 1, wealthAtRetire: wealthAtRetire, path: path };
      }
      path.push({ age: y + 1, wealth: wealth });
    }
    return { depletionAge: maxAge, wealthAtRetire: wealthAtRetire, path: path };
  }

  /**
   * 计算需要多少储蓄才能撑到目标年龄
   */
  function requiredSavings(params, targetAge) {
    var retireAge = params.retireAge;
    var monthlyExpense = params.monthlyExpense || 3000;
    var annualReturn = params.annualReturn || 0.05;
    var inflationRate = params.inflationRate || 0.03;
    var pensionMonthly = params.pensionMonthly || 0;

    var years = targetAge - retireAge;
    if (years <= 0) return 0;

    var realReturn = (1 + annualReturn) / (1 + inflationRate) - 1;
    var annualGap = (monthlyExpense - pensionMonthly) * 12;
    if (annualGap <= 0) return 0;

    if (Math.abs(realReturn) < 0.001) {
      return annualGap * years;
    }

    // PV of annuity: gap * (1 - (1+r)^-n) / r
    var pv = annualGap * (1 - Math.pow(1 + realReturn, -years)) / realReturn;
    return Math.max(0, pv);
  }

  /**
   * 敏感性分析：改变一个参数看对结果的影响
   */
  function sensitivityAnalysis(baseParams, trials) {
    trials = trials || 1000;
    var base = monteCarloRetirement(baseParams, trials);

    var scenarios = [
      { name: '多存 ¥1000/月', key: 'monthlySaving', delta: 1000 },
      { name: '少花 ¥1000/月', key: 'monthlyExpense', delta: -1000 },
      { name: '延迟退休 5 年', key: 'retireAge', delta: 5 },
      { name: '回报率 +2%', key: 'annualReturn', delta: 0.02 },
      { name: '通胀率 +1%', key: 'inflationRate', delta: 0.01 },
      { name: '养老金 +¥2000/月', key: 'pensionMonthly', delta: 2000 }
    ];

    var results = [];
    for (var i = 0; i < scenarios.length; i++) {
      var s = scenarios[i];
      var modified = {};
      for (var k in baseParams) modified[k] = baseParams[k];
      modified[s.key] = (modified[s.key] || 0) + s.delta;
      var mc = monteCarloRetirement(modified, trials);
      results.push({
        name: s.name,
        avgAge: mc.avgDepletionAge,
        survivalRate: mc.survivalRate,
        delta: mc.avgDepletionAge - base.avgDepletionAge,
        deltaSurvival: mc.survivalRate - base.survivalRate
      });
    }

    return {
      base: { avgAge: base.avgDepletionAge, survivalRate: base.survivalRate },
      scenarios: results
    };
  }

  // ========== 导出 ==========
  exports.gaussianRandom = gaussianRandom;
  exports.simulateOnce = simulateOnce;
  exports.monteCarloRetirement = monteCarloRetirement;
  exports.deterministicEstimate = deterministicEstimate;
  exports.requiredSavings = requiredSavings;
  exports.sensitivityAnalysis = sensitivityAnalysis;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.RetirementGapLogic = {}));
