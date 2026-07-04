/**
 * simulation-engine.js — 排除选项后改答案的概率模拟引擎（纯函数，不依赖 DOM）
 *
 * 蒙提霍尔问题的 N 选 1 + 排除 K 个变体：
 *   - 初始随机选 1 个 → P(对) = 1/N
 *   - 可靠排除 K 个错误选项（不排除已选的）→ 概率集中到剩余选项
 *   - 换选正确率 = (N-1) / (N × (N-1-K))，当 K=N-2 时退化为 (N-1)/N
 *
 * 所有正确率以 0~1 的小数表示。
 */
(function (global) {
  'use strict';

  /**
   * 验证参数合法性
   * 规则：N>=2 且 1<=K<=N-2（至少排除 1 个，且留出至少 1 个非己选项给换选）
   * @param {number} totalOptions 选项总数 N
   * @param {number} eliminateCount 排除数量 K
   * @returns {{ valid: boolean, error?: string }}
   */
  function validateParams(totalOptions, eliminateCount) {
    var N = Math.floor(totalOptions);
    var K = Math.floor(eliminateCount);
    if (!isFinite(N) || N < 2) {
      return { valid: false, error: '选项总数至少为 2' };
    }
    if (!isFinite(K) || K < 1) {
      return { valid: false, error: '排除数量至少为 1，否则没有信息增益' };
    }
    if (K > N - 2) {
      return { valid: false, error: '排除数量不能超过 N-2（必须留至少一个非己选项可换）' };
    }
    return { valid: true };
  }

  /**
   * 从数组中随机取出 n 个不重复元素
   * @param {number[]} arr
   * @param {number} n
   * @returns {number[]}
   */
  function sample(arr, n) {
    var pool = arr.slice();
    var result = [];
    for (var i = 0; i < n && pool.length > 0; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }

  /**
   * 模拟一轮答题
   * @param {number} totalOptions 选项总数（默认 4）
   * @param {number} eliminateCount 排除数量（默认 2）
   * @returns {{ correctAnswer: number, initialChoice: number, eliminated: number[], remainingOption: number, switchWins: boolean, stayWins: boolean }}
   */
  function simulateOneRound(totalOptions, eliminateCount) {
    var N = totalOptions || 4;
    var K = eliminateCount == null ? 2 : eliminateCount;
    var check = validateParams(N, K);
    if (!check.valid) {
      throw new Error(check.error);
    }

    // 所有选项下标 0..N-1
    var options = [];
    for (var i = 0; i < N; i++) options.push(i);

    // 随机设定正确答案 & 初始随机选择（两者独立）
    var correctAnswer = Math.floor(Math.random() * N);
    var initialChoice = Math.floor(Math.random() * N);

    // 可排除的池子：不是已选的、且不是正确答案的（可靠排除不会误伤正确答案）
    var eliminatable = options.filter(function (o) {
      return o !== initialChoice && o !== correctAnswer;
    });
    var eliminated = sample(eliminatable, K).sort(function (a, b) { return a - b; });

    // 剩余可换选项：不是已选的、且未被排除的
    var candidates = options.filter(function (o) {
      return o !== initialChoice && eliminated.indexOf(o) === -1;
    });
    // 若只剩一个，就是它；若剩多个，随机挑一个作为换选目标
    var remainingOption = candidates.length === 1
      ? candidates[0]
      : candidates[Math.floor(Math.random() * candidates.length)];

    var stayWins = initialChoice === correctAnswer;
    var switchWins = remainingOption === correctAnswer;

    return {
      correctAnswer: correctAnswer,
      initialChoice: initialChoice,
      eliminated: eliminated,
      remainingOption: remainingOption,
      switchWins: switchWins,
      stayWins: stayWins
    };
  }

  /**
   * 批量模拟
   * @param {number} rounds 模拟轮数
   * @param {string} strategy 'stay' | 'switch' | 'random'
   * @param {number} totalOptions 选项总数（默认 4）
   * @param {number} eliminateCount 排除数量（默认 2）
   * @returns {{ wins: number, total: number, rate: number }}
   */
  function simulateBatch(rounds, strategy, totalOptions, eliminateCount) {
    var N = totalOptions || 4;
    var K = eliminateCount == null ? 2 : eliminateCount;
    var wins = 0;
    for (var i = 0; i < rounds; i++) {
      var r = simulateOneRound(N, K);
      var useSwitch;
      if (strategy === 'switch') {
        useSwitch = true;
      } else if (strategy === 'stay') {
        useSwitch = false;
      } else {
        // random：50/50 在 stay / switch 之间选
        useSwitch = Math.random() < 0.5;
      }
      if (useSwitch ? r.switchWins : r.stayWins) wins++;
    }
    var rate = rounds > 0 ? wins / rounds : 0;
    return { wins: wins, total: rounds, rate: rate };
  }

  /**
   * 计算理论正确率
   *   stay    = 1/N
   *   switch  = (N-1) / (N × (N-1-K))
   *   random  = (stay + switch) / 2
   * @param {string} strategy 'stay' | 'switch' | 'random'
   * @param {number} totalOptions 选项总数（默认 4）
   * @param {number} eliminateCount 排除数量（默认 2）
   * @returns {number} 正确率（0~1）
   */
  function theoreticalRate(strategy, totalOptions, eliminateCount) {
    var N = totalOptions || 4;
    var K = eliminateCount == null ? 2 : eliminateCount;
    var stay = 1 / N;
    var remaining = N - 1 - K; // 换选时可挑的候选数
    var sw = remaining > 0 ? (N - 1) / (N * remaining) : 0;
    if (strategy === 'stay') return stay;
    if (strategy === 'switch') return sw;
    // random
    return (stay + sw) / 2;
  }

  var api = {
    validateParams: validateParams,
    simulateOneRound: simulateOneRound,
    simulateBatch: simulateBatch,
    theoreticalRate: theoreticalRate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SwitchAnswerSim = api;
  }
})(typeof window !== 'undefined' ? window : this);
