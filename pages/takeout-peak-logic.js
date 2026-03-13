/**
 * Takeout Peak Hour Analysis - Core Logic
 * 外卖高峰期分析核心算法
 * 基于 M/M/c 排队模型 + 时段订单密度模拟
 */

const TakeoutPeakLogic = (function () {

  /**
   * 生成一天中每个时段的订单到达率（人/分钟）
   * 模拟真实外卖平台的订单分布：午高峰 11:00-13:00，晚高峰 17:00-19:00
   * @returns {number[]} 24*60 个值，每分钟的到达率
   */
  function generateDailyArrivalRate() {
    const rates = new Array(24 * 60).fill(0);
    for (let m = 0; m < 24 * 60; m++) {
      const hour = m / 60;
      // 基础订单率
      let rate = 0.5;
      // 午高峰：以 12:00 为中心的高斯分布
      rate += 18 * gaussian(hour, 12.0, 0.6);
      // 晚高峰：以 18:00 为中心的高斯分布
      rate += 14 * gaussian(hour, 18.0, 0.7);
      // 下午茶小高峰
      rate += 4 * gaussian(hour, 15.0, 0.8);
      // 夜宵
      rate += 5 * gaussian(hour, 21.5, 1.0);
      // 早餐
      rate += 3 * gaussian(hour, 8.0, 0.6);
      rates[m] = Math.max(0.1, rate);
    }
    return rates;
  }

  /**
   * 获取指定时段的平均到达率
   * @param {number[]} rates - 每分钟到达率数组
   * @param {number} hourStart - 起始小时（如 11.75 表示 11:45）
   * @param {number} hourEnd - 结束小时
   * @returns {number} 平均到达率（订单/分钟）
   */
  function getAverageRate(rates, hourStart, hourEnd) {
    const startMin = Math.floor(hourStart * 60);
    const endMin = Math.floor(hourEnd * 60);
    let sum = 0;
    let count = 0;
    for (let m = startMin; m < endMin && m < rates.length; m++) {
      sum += rates[m];
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * M/M/c 排队模型：计算平均等待时间
   * @param {number} lambda - 到达率（订单/分钟）
   * @param {number} mu - 单个骑手服务率（订单/分钟）
   * @param {number} c - 骑手数量
   * @returns {{ waitTime: number, utilization: number, queueLength: number, systemLength: number }}
   */
  function mmcMetrics(lambda, mu, c) {
    const rho = lambda / (c * mu);
    if (rho >= 1) {
      return { waitTime: Infinity, utilization: 1, queueLength: Infinity, systemLength: Infinity };
    }

    // Erlang C 公式计算排队概率
    const a = lambda / mu; // 总负载
    const pC = erlangC(a, c);

    const Wq = pC / (c * mu * (1 - rho)); // 平均排队等待时间
    const Lq = lambda * Wq;
    const W = Wq + 1 / mu;
    const L = lambda * W;

    return {
      waitTime: Wq,
      utilization: rho,
      queueLength: Lq,
      systemLength: L
    };
  }

  /**
   * Erlang C 公式：计算到达顾客需要排队的概率
   */
  function erlangC(a, c) {
    // P(排队) = (a^c / c!) * (1/(1 - a/c)) / (sum_{k=0}^{c-1} a^k/k! + a^c/c! * 1/(1-a/c))
    const rho = a / c;
    if (rho >= 1) return 1;

    let sumTerms = 0;
    for (let k = 0; k < c; k++) {
      sumTerms += Math.pow(a, k) / factorial(k);
    }
    const lastTerm = Math.pow(a, c) / factorial(c) * (1 / (1 - rho));
    return lastTerm / (sumTerms + lastTerm);
  }

  /**
   * 模拟在某个时刻下单的完整等待时间
   * @param {number} orderHour - 下单时刻（小时，如 11.75 = 11:45）
   * @param {number} numRiders - 骑手数量
   * @param {number} avgDeliveryMin - 平均配送时间（分钟）
   * @returns {{ waitTime: number, prepTime: number, deliveryTime: number, totalTime: number, utilization: number }}
   */
  function simulateOrderWait(orderHour, numRiders, avgDeliveryMin) {
    const rates = generateDailyArrivalRate();
    const minute = Math.floor(orderHour * 60);
    const lambda = rates[Math.min(minute, rates.length - 1)];
    const mu = 1 / avgDeliveryMin; // 骑手服务率

    const metrics = mmcMetrics(lambda, mu, numRiders);

    // 商家出餐时间：高峰期更长
    const basePrepTime = 10; // 基础出餐10分钟
    const peakFactor = Math.min(2.5, 1 + metrics.utilization * 1.5);
    const prepTime = basePrepTime * peakFactor;

    // 配送时间：高峰期路上更堵
    const baseDelivery = avgDeliveryMin;
    const trafficFactor = 1 + metrics.utilization * 0.3;
    const deliveryTime = baseDelivery * trafficFactor;

    // 排队等待骑手时间
    const waitTime = metrics.waitTime;

    return {
      waitTime: isFinite(waitTime) ? waitTime : 60,
      prepTime,
      deliveryTime,
      totalTime: (isFinite(waitTime) ? waitTime : 60) + prepTime + deliveryTime,
      utilization: metrics.utilization,
      lambda,
      queueLength: isFinite(metrics.queueLength) ? metrics.queueLength : 999
    };
  }

  /**
   * 生成全天每个时刻的预计等待时间曲线
   * @param {number} numRiders - 骑手数量
   * @param {number} avgDeliveryMin - 平均配送时间
   * @param {number} resolution - 时间分辨率（分钟）
   * @returns {Array<{ hour: number, totalTime: number, waitTime: number, prepTime: number, deliveryTime: number, utilization: number, lambda: number }>}
   */
  function generateDailyCurve(numRiders, avgDeliveryMin, resolution) {
    const rates = generateDailyArrivalRate();
    const mu = 1 / avgDeliveryMin;
    const results = [];

    for (let m = 0; m < 24 * 60; m += resolution) {
      const hour = m / 60;
      const lambda = rates[m];
      const metrics = mmcMetrics(lambda, mu, numRiders);

      const basePrepTime = 10;
      const peakFactor = Math.min(2.5, 1 + metrics.utilization * 1.5);
      const prepTime = basePrepTime * peakFactor;

      const trafficFactor = 1 + metrics.utilization * 0.3;
      const deliveryTime = avgDeliveryMin * trafficFactor;

      const waitTime = isFinite(metrics.waitTime) ? metrics.waitTime : 60;

      results.push({
        hour,
        totalTime: waitTime + prepTime + deliveryTime,
        waitTime,
        prepTime,
        deliveryTime,
        utilization: Math.min(metrics.utilization, 1),
        lambda
      });
    }

    return results;
  }

  /**
   * 对比两个下单时刻的等待差异
   * @param {number} hour1 - 第一个下单时刻
   * @param {number} hour2 - 第二个下单时刻
   * @param {number} numRiders
   * @param {number} avgDeliveryMin
   * @returns {{ order1: object, order2: object, timeSaved: number, percentFaster: number }}
   */
  function compareOrderTimes(hour1, hour2, numRiders, avgDeliveryMin) {
    const order1 = simulateOrderWait(hour1, numRiders, avgDeliveryMin);
    const order2 = simulateOrderWait(hour2, numRiders, avgDeliveryMin);
    const timeSaved = order2.totalTime - order1.totalTime;
    const percentFaster = order2.totalTime > 0 ? (timeSaved / order2.totalTime * 100) : 0;

    return { order1, order2, timeSaved, percentFaster };
  }

  /**
   * 蒙特卡洛模拟：在某时刻下单N次，统计等待时间分布
   * @param {number} orderHour
   * @param {number} numRiders
   * @param {number} avgDeliveryMin
   * @param {number} trials
   * @returns {{ times: number[], avg: number, median: number, p90: number, min: number, max: number, stdDev: number }}
   */
  function monteCarloWait(orderHour, numRiders, avgDeliveryMin, trials) {
    const rates = generateDailyArrivalRate();
    const minute = Math.floor(orderHour * 60);
    const lambda = rates[Math.min(minute, rates.length - 1)];
    const mu = 1 / avgDeliveryMin;
    const metrics = mmcMetrics(lambda, mu, numRiders);

    const times = [];
    for (let i = 0; i < trials; i++) {
      // 出餐时间：指数分布
      const basePrepTime = 10;
      const peakFactor = Math.min(2.5, 1 + metrics.utilization * 1.5);
      const prepTime = exponentialRandom(basePrepTime * peakFactor);

      // 等待骑手时间：指数分布
      const meanWait = isFinite(metrics.waitTime) ? metrics.waitTime : 60;
      const waitTime = exponentialRandom(Math.max(0.5, meanWait));

      // 配送时间
      const trafficFactor = 1 + metrics.utilization * 0.3;
      const deliveryTime = exponentialRandom(avgDeliveryMin * trafficFactor);

      times.push(prepTime + waitTime + deliveryTime);
    }

    times.sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / trials;
    const variance = times.reduce((acc, v) => acc + (v - avg) ** 2, 0) / trials;

    return {
      times,
      avg,
      median: times[Math.floor(trials / 2)],
      p90: times[Math.floor(trials * 0.9)],
      min: times[0],
      max: times[trials - 1],
      stdDev: Math.sqrt(variance)
    };
  }

  /**
   * 找出一天中最佳下单时段（总等待最短的时段）
   * @param {number} numRiders
   * @param {number} avgDeliveryMin
   * @returns {Array<{ hour: number, label: string, totalTime: number }>} 按总时间排序的推荐时段
   */
  function findBestOrderTimes(numRiders, avgDeliveryMin) {
    const curve = generateDailyCurve(numRiders, avgDeliveryMin, 15);
    // 只看用餐相关时段 7:00-22:00
    const mealTimes = curve.filter(p => p.hour >= 7 && p.hour <= 22);
    mealTimes.sort((a, b) => a.totalTime - b.totalTime);

    return mealTimes.slice(0, 10).map(p => ({
      hour: p.hour,
      label: formatHour(p.hour),
      totalTime: p.totalTime,
      utilization: p.utilization
    }));
  }

  // ========== 工具函数 ==========

  function gaussian(x, mean, sigma) {
    return Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2));
  }

  function factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }

  function exponentialRandom(mean) {
    return -mean * Math.log(1 - Math.random());
  }

  function formatHour(h) {
    const hours = Math.floor(h);
    const mins = Math.round((h - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  // 导出
  const exports = {
    generateDailyArrivalRate,
    getAverageRate,
    mmcMetrics,
    erlangC,
    simulateOrderWait,
    generateDailyCurve,
    compareOrderTimes,
    monteCarloWait,
    findBestOrderTimes,
    gaussian,
    factorial,
    exponentialRandom,
    formatHour
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  return exports;
})();
