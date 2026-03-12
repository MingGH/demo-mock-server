/**
 * Queue Theory & Waiting Psychology - Core Logic
 * 排队论与等待心理学核心算法
 */

const QueueTheoryLogic = (function () {

  // ========== M/M/1 排队模型 ==========

  /**
   * M/M/1 队列稳态指标
   * @param {number} lambda - 到达率（人/分钟）
   * @param {number} mu - 服务率（人/分钟）
   * @returns {{ rho, Lq, Wq, L, W }} 利用率、队长、等待时间等
   */
  function mm1Metrics(lambda, mu) {
    if (lambda >= mu) return { rho: 1, Lq: Infinity, Wq: Infinity, L: Infinity, W: Infinity };
    const rho = lambda / mu;
    const Lq = (rho * rho) / (1 - rho);       // 平均排队人数（不含正在服务的）
    const Wq = Lq / lambda;                     // 平均排队等待时间
    const L = rho / (1 - rho);                  // 系统中平均人数
    const W = 1 / (mu - lambda);                // 系统中平均逗留时间
    return { rho, Lq, Wq, L, W };
  }

  // ========== 多队列 vs 单队列（蛇形队列）==========

  /**
   * 模拟多队列场景（超市模式：每条队独立）
   * @param {number} numQueues - 队列数
   * @param {number} numCustomers - 顾客总数
   * @param {number} avgServiceTime - 平均服务时间（秒）
   * @returns {{ waitTimes: number[], avgWait: number, maxWait: number, minWait: number }}
   */
  function simulateMultiQueue(numQueues, numCustomers, avgServiceTime) {
    // 每条队列的完成时间
    const queueFinishTime = new Array(numQueues).fill(0);
    const waitTimes = [];

    for (let i = 0; i < numCustomers; i++) {
      // 顾客选最短的队
      let minIdx = 0;
      for (let q = 1; q < numQueues; q++) {
        if (queueFinishTime[q] < queueFinishTime[minIdx]) minIdx = q;
      }
      const arrivalTime = i * 2; // 每2秒来一个人
      const waitStart = Math.max(queueFinishTime[minIdx], arrivalTime);
      const serviceTime = exponentialRandom(avgServiceTime);
      queueFinishTime[minIdx] = waitStart + serviceTime;
      waitTimes.push(waitStart - arrivalTime);
    }

    return computeWaitStats(waitTimes);
  }

  /**
   * 模拟单队列场景（蛇形排队：一条队多个窗口）
   */
  function simulateSingleQueue(numServers, numCustomers, avgServiceTime) {
    const serverFinishTime = new Array(numServers).fill(0);
    const waitTimes = [];

    for (let i = 0; i < numCustomers; i++) {
      const arrivalTime = i * 2;
      // 找最早空闲的窗口
      let minIdx = 0;
      for (let s = 1; s < numServers; s++) {
        if (serverFinishTime[s] < serverFinishTime[minIdx]) minIdx = s;
      }
      const waitStart = Math.max(serverFinishTime[minIdx], arrivalTime);
      const serviceTime = exponentialRandom(avgServiceTime);
      serverFinishTime[minIdx] = waitStart + serviceTime;
      waitTimes.push(waitStart - arrivalTime);
    }

    return computeWaitStats(waitTimes);
  }

  // ========== 换队悖论模拟 ==========

  /**
   * 模拟换队 vs 不换队
   * @param {number} trials - 模拟次数
   * @param {number} numQueues - 队列数
   * @param {number} queueLen - 每条队初始长度
   * @returns {{ stayWins, switchWins, ties, stayAvg, switchAvg }}
   */
  function simulateSwitchParadox(trials, numQueues, queueLen) {
    let stayWins = 0, switchWins = 0, ties = 0;
    let stayTotal = 0, switchTotal = 0;

    for (let t = 0; t < trials; t++) {
      // 生成每条队列的总服务时间
      const queueTimes = [];
      for (let q = 0; q < numQueues; q++) {
        let total = 0;
        for (let p = 0; p < queueLen; p++) {
          total += exponentialRandom(30); // 平均30秒/人
        }
        queueTimes.push(total);
      }

      // 随机选一条队
      const myQueue = Math.floor(Math.random() * numQueues);
      const stayTime = queueTimes[myQueue];

      // 换到看起来最短的队（排除自己的队，随机选一条）
      const otherQueues = [];
      for (let q = 0; q < numQueues; q++) {
        if (q !== myQueue) otherQueues.push(q);
      }
      // 换队时已经等了一段时间（假设等了总时间的30%后决定换）
      const waitedFraction = 0.3;
      const alreadyWaited = stayTime * waitedFraction;

      // 换到随机一条其他队列（因为你无法准确判断哪条更快）
      const switchTo = otherQueues[Math.floor(Math.random() * otherQueues.length)];
      const switchTime = alreadyWaited + queueTimes[switchTo]; // 已等时间 + 新队列全部时间

      stayTotal += stayTime;
      switchTotal += switchTime;

      if (stayTime < switchTime) stayWins++;
      else if (switchTime < stayTime) switchWins++;
      else ties++;
    }

    return {
      stayWins, switchWins, ties,
      stayAvg: stayTotal / trials,
      switchAvg: switchTotal / trials,
      stayWinRate: stayWins / trials,
      switchWinRate: switchWins / trials
    };
  }

  // ========== "你的队总是最慢"的概率解释 ==========

  /**
   * 模拟 N 条队列，计算"你在最快队列"的概率
   * @param {number} trials - 模拟次数
   * @param {number} numQueues - 队列数
   * @returns {{ fastestProb, slowestProb, middleProb }}
   */
  function simulateQueueLuck(trials, numQueues) {
    let fastest = 0, slowest = 0;

    for (let t = 0; t < trials; t++) {
      const times = [];
      for (let q = 0; q < numQueues; q++) {
        let total = 0;
        const len = 3 + Math.floor(Math.random() * 5); // 3~7人
        for (let p = 0; p < len; p++) {
          total += exponentialRandom(30);
        }
        times.push(total);
      }

      const myQueue = Math.floor(Math.random() * numQueues);
      const myTime = times[myQueue];
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      if (myTime <= minTime) fastest++;
      if (myTime >= maxTime) slowest++;
    }

    return {
      fastestProb: fastest / trials,
      slowestProb: slowest / trials,
      notFastestProb: 1 - fastest / trials
    };
  }

  // ========== 等待心理学：感知时间 vs 实际时间 ==========

  /**
   * 计算感知等待时间（基于心理学研究）
   * 无聊时感觉时间变长，有事做时感觉变短
   * @param {number} actualMinutes - 实际等待分钟数
   * @param {object} factors - 心理因素
   * @returns {number} 感知等待分钟数
   */
  function perceivedWaitTime(actualMinutes, factors) {
    let multiplier = 1.0;

    // 不确定性：不知道要等多久 → 感觉更长（+40%）
    if (factors.uncertain) multiplier += 0.4;
    // 无聊：没事做 → 感觉更长（+30%）
    if (factors.bored) multiplier += 0.3;
    // 不公平感：有人插队 → 感觉更长（+50%）
    if (factors.unfair) multiplier += 0.5;
    // 焦虑：赶时间 → 感觉更长（+35%）
    if (factors.anxious) multiplier += 0.35;
    // 有进度提示 → 感觉更短（-20%）
    if (factors.progressBar) multiplier -= 0.2;
    // 有娱乐 → 感觉更短（-25%）
    if (factors.entertainment) multiplier -= 0.25;
    // 已开始服务（如餐厅先上菜单）→ 感觉更短（-15%）
    if (factors.preService) multiplier -= 0.15;

    return actualMinutes * Math.max(0.3, multiplier);
  }

  // ========== 利特尔法则 ==========

  /**
   * Little's Law: L = λ × W
   * @param {number} lambda - 到达率
   * @param {number} W - 平均逗留时间
   * @returns {number} L - 系统中平均人数
   */
  function littlesLaw(lambda, W) {
    return lambda * W;
  }

  // ========== 工具函数 ==========

  function exponentialRandom(mean) {
    return -mean * Math.log(1 - Math.random());
  }

  function computeWaitStats(waitTimes) {
    const sorted = [...waitTimes].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    const max = sorted[sorted.length - 1];
    const min = sorted[0];
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const variance = sorted.reduce((acc, v) => acc + (v - avg) ** 2, 0) / sorted.length;
    const stdDev = Math.sqrt(variance);

    return { waitTimes: sorted, avgWait: avg, maxWait: max, minWait: min, median, p90, p95, stdDev };
  }

  // 导出
  const exports = {
    mm1Metrics,
    simulateMultiQueue,
    simulateSingleQueue,
    simulateSwitchParadox,
    simulateQueueLuck,
    perceivedWaitTime,
    littlesLaw,
    exponentialRandom,
    computeWaitStats
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  return exports;
})();
