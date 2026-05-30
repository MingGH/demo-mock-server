/**
 * 纽科姆悖论 — 核心引擎
 * 包含预测算法、蒙特卡洛模拟、期望值计算等纯逻辑
 */

// ── 预测器：基于行为信号的加权随机 ──────────────────────
// 收集用户在"分析阶段"的微交互数据，生成一个 0~1 的"一箱倾向分"
// 再结合全站历史比例做贝叶斯修正

/**
 * 根据行为信号计算用户选一箱的概率
 * @param {Object} signals - 用户行为信号
 * @param {number} signals.sliderValue   - 滑块停留值 0~100
 * @param {number} signals.reactionMs    - 点击反应时间(ms)
 * @param {number} signals.colorChoice   - 颜色选择 0=冷色 1=暖色
 * @param {number} globalOneBoxRate      - 全站一箱比例 (0~1)
 * @returns {number} 预测用户选一箱的概率 (0~1)
 */
function calcOneBoxProbability(signals, globalOneBoxRate) {
  if (!signals) return 0.5;
  var gRate = typeof globalOneBoxRate === 'number' ? globalOneBoxRate : 0.5;

  // 各信号的一箱倾向权重
  // 滑块偏低 → 保守 → 更可能一箱
  var sliderScore = 1 - (signals.sliderValue || 50) / 100;

  // 反应慢 → 深思熟虑 → 更可能一箱（经验假设）
  var rt = signals.reactionMs || 2000;
  var rtScore = Math.min(rt / 5000, 1);

  // 冷色 → 理性 → 更可能一箱
  var colorScore = signals.colorChoice === 0 ? 0.6 : 0.4;

  // 加权平均
  var raw = sliderScore * 0.35 + rtScore * 0.25 + colorScore * 0.15 + gRate * 0.25;

  // 限制在 [0.3, 0.7]，避免太极端
  return Math.max(0.3, Math.min(0.7, raw));
}

/**
 * 预测器做出预测
 * @param {number} oneBoxProb - 预测用户选一箱的概率
 * @returns {string} 'one' 或 'two'
 */
function makePrediction(oneBoxProb) {
  return Math.random() < oneBoxProb ? 'one' : 'two';
}

/**
 * 根据预测和用户选择计算收益
 * @param {string} prediction - 预测器的预测 'one' | 'two'
 * @param {string} choice     - 用户的选择 'one' | 'two'
 * @param {number} boxAValue  - 箱子A的金额（默认1000）
 * @param {number} boxBValue  - 箱子B的金额（默认1000000）
 * @returns {Object} { boxA, boxB, total }
 */
function calcPayoff(prediction, choice, boxAValue, boxBValue) {
  var a = typeof boxAValue === 'number' ? boxAValue : 1000;
  var b = typeof boxBValue === 'number' ? boxBValue : 1000000;

  // 箱子B的内容取决于预测
  var boxBContent = prediction === 'one' ? b : 0;

  if (choice === 'one') {
    return { boxA: 0, boxB: boxBContent, total: boxBContent };
  }
  return { boxA: a, boxB: boxBContent, total: a + boxBContent };
}

// ── 蒙特卡洛模拟 ────────────────────────────────────────

/**
 * 运行蒙特卡洛模拟
 * @param {Object} params
 * @param {number} params.rounds       - 模拟轮数
 * @param {number} params.accuracy     - 预测者准确率 (0~1)
 * @param {number} params.boxA         - 箱子A金额
 * @param {number} params.boxB         - 箱子B金额
 * @returns {Object} 模拟结果
 */
function runSimulation(params) {
  var rounds = params.rounds || 10000;
  var accuracy = typeof params.accuracy === 'number' ? params.accuracy : 0.9;
  var boxA = params.boxA || 1000;
  var boxB = params.boxB || 1000000;

  var oneBoxTotal = 0;
  var twoBoxTotal = 0;
  var oneBoxResults = [];
  var twoBoxResults = [];

  for (var i = 0; i < rounds; i++) {
    // 一箱策略
    var predCorrectOne = Math.random() < accuracy;
    var predOne = predCorrectOne ? 'one' : 'two';
    var payoffOne = calcPayoff(predOne, 'one', boxA, boxB);
    oneBoxTotal += payoffOne.total;
    oneBoxResults.push(payoffOne.total);

    // 两箱策略
    var predCorrectTwo = Math.random() < accuracy;
    var predTwo = predCorrectTwo ? 'two' : 'one';
    var payoffTwo = calcPayoff(predTwo, 'two', boxA, boxB);
    twoBoxTotal += payoffTwo.total;
    twoBoxResults.push(payoffTwo.total);
  }

  return {
    rounds: rounds,
    accuracy: accuracy,
    oneBox: {
      totalEarnings: oneBoxTotal,
      avgEarnings: Math.round(oneBoxTotal / rounds),
      results: oneBoxResults
    },
    twoBox: {
      totalEarnings: twoBoxTotal,
      avgEarnings: Math.round(twoBoxTotal / rounds),
      results: twoBoxResults
    }
  };
}

/**
 * 计算不同准确率下的期望值（用于绘制曲线）
 * @param {number} boxA - 箱子A金额
 * @param {number} boxB - 箱子B金额
 * @returns {Array} [{accuracy, oneBoxEV, twoBoxEV}, ...]
 */
function calcExpectedValueCurve(boxA, boxB) {
  var a = boxA || 1000;
  var b = boxB || 1000000;
  var points = [];

  for (var pct = 50; pct <= 100; pct++) {
    var p = pct / 100;
    // 一箱策略期望值：p * B + (1-p) * 0
    var oneBoxEV = p * b;
    // 两箱策略期望值：p * (A + 0) + (1-p) * (A + B)
    var twoBoxEV = p * a + (1 - p) * (a + b);
    points.push({
      accuracy: p,
      accuracyPct: pct,
      oneBoxEV: Math.round(oneBoxEV),
      twoBoxEV: Math.round(twoBoxEV)
    });
  }
  return points;
}

/**
 * 找到一箱策略开始优于两箱策略的临界准确率
 * @param {number} boxA
 * @param {number} boxB
 * @returns {number} 临界准确率 (0~1)
 */
function findCrossoverAccuracy(boxA, boxB) {
  var a = typeof boxA === 'number' ? boxA : 1000;
  var b = typeof boxB === 'number' ? boxB : 1000000;
  // 一箱EV = p * B
  // 两箱EV = A + (1-p) * B = A + B - p*B
  // 交叉点：p*B = A + B - p*B → 2pB = A + B → p = (A+B)/(2B)
  return (a + b) / (2 * b);
}

// ── 支配策略矩阵 ────────────────────────────────────────

/**
 * 生成收益矩阵
 * @param {number} boxA
 * @param {number} boxB
 * @returns {Object} 2x2 矩阵
 */
function getPayoffMatrix(boxA, boxB) {
  var a = boxA || 1000;
  var b = boxB || 1000000;
  return {
    // [预测选一箱][实际选一箱]
    oneOne: { boxA: 0, boxB: b, total: b },
    // [预测选一箱][实际选两箱]
    oneTow: { boxA: a, boxB: b, total: a + b },
    // [预测选两箱][实际选一箱]
    twoOne: { boxA: 0, boxB: 0, total: 0 },
    // [预测选两箱][实际选两箱]
    twoTwo: { boxA: a, boxB: 0, total: a }
  };
}

/**
 * 格式化金额显示
 * @param {number} amount
 * @returns {string}
 */
function formatMoney(amount) {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1) + ' 万';
  }
  return amount.toLocaleString();
}

/**
 * 生成累计收益数据（用于折线图）
 * @param {Array} results - 每轮收益数组
 * @param {number} sampleRate - 采样率（每隔多少轮取一个点）
 * @returns {Array} [{round, cumulative}, ...]
 */
function getCumulativeData(results, sampleRate) {
  var rate = sampleRate || Math.max(1, Math.floor(results.length / 200));
  var data = [];
  var sum = 0;
  for (var i = 0; i < results.length; i++) {
    sum += results[i];
    if (i % rate === 0 || i === results.length - 1) {
      data.push({ round: i + 1, cumulative: sum });
    }
  }
  return data;
}

// ── 导出 ─────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcOneBoxProbability: calcOneBoxProbability,
    makePrediction: makePrediction,
    calcPayoff: calcPayoff,
    runSimulation: runSimulation,
    calcExpectedValueCurve: calcExpectedValueCurve,
    findCrossoverAccuracy: findCrossoverAccuracy,
    getPayoffMatrix: getPayoffMatrix,
    formatMoney: formatMoney,
    getCumulativeData: getCumulativeData
  };
}
