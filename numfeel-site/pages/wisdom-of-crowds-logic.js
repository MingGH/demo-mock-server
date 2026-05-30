/**
 * 群体智慧核心算法
 * Wisdom of Crowds — Core Logic
 */

// === 统计工具 ===
function calcMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function calcMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcStdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = calcMean(arr);
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function calcError(estimate, truth) {
  return Math.abs(estimate - truth);
}

function calcErrorPercent(estimate, truth) {
  if (truth === 0) return estimate === 0 ? 0 : Infinity;
  return (Math.abs(estimate - truth) / Math.abs(truth)) * 100;
}

// === 模拟群体猜测 ===
// 生成一组围绕真实值的猜测，带有偏差和噪声
function generateGuesses(trueValue, count, opts = {}) {
  const {
    biasRange = 0.4,     // 个体偏差范围 (±40%)
    noiseStdDev = 0.25,  // 噪声标准差 (25%)
    outlierRate = 0.05,   // 离群值比例
    outlierMultiplier = 3 // 离群值偏差倍数
  } = opts;

  const guesses = [];
  for (let i = 0; i < count; i++) {
    let bias = (Math.random() * 2 - 1) * biasRange;
    let noise = gaussianRandom() * noiseStdDev;

    // 离群值
    if (Math.random() < outlierRate) {
      bias *= outlierMultiplier;
      noise *= outlierMultiplier;
    }

    const guess = trueValue * (1 + bias + noise);
    guesses.push(Math.max(0, Math.round(guess)));
  }
  return guesses;
}

// Box-Muller 正态分布随机数
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// === 群体智慧 vs 个体分析 ===
function analyzeWisdom(guesses, trueValue) {
  const mean = calcMean(guesses);
  const median = calcMedian(guesses);
  const stdDev = calcStdDev(guesses);

  const meanError = calcErrorPercent(mean, trueValue);
  const medianError = calcErrorPercent(median, trueValue);

  // 每个个体的误差
  const individualErrors = guesses.map(g => calcErrorPercent(g, trueValue));
  const avgIndividualError = calcMean(individualErrors);

  // 群体均值打败了多少比例的个体
  const beatCount = individualErrors.filter(e => e > meanError).length;
  const beatPercent = (beatCount / guesses.length) * 100;

  return {
    mean: Math.round(mean),
    median: Math.round(median),
    stdDev: Math.round(stdDev),
    meanError: Math.round(meanError * 100) / 100,
    medianError: Math.round(medianError * 100) / 100,
    avgIndividualError: Math.round(avgIndividualError * 100) / 100,
    beatPercent: Math.round(beatPercent * 100) / 100,
    individualErrors
  };
}

// === 渐进收敛模拟 ===
// 随着人数增加，群体均值如何逐步逼近真实值
function simulateConvergence(trueValue, maxCount, opts = {}) {
  const guesses = generateGuesses(trueValue, maxCount, opts);
  const steps = [];
  const checkpoints = [];

  // 生成检查点：1,2,3,...,10,20,30,...,100,200,...
  for (let i = 1; i <= Math.min(10, maxCount); i++) checkpoints.push(i);
  for (let i = 20; i <= Math.min(100, maxCount); i += 10) checkpoints.push(i);
  for (let i = 200; i <= Math.min(1000, maxCount); i += 100) checkpoints.push(i);
  for (let i = 2000; i <= maxCount; i += 1000) checkpoints.push(i);
  if (!checkpoints.includes(maxCount)) checkpoints.push(maxCount);

  for (const n of checkpoints) {
    const subset = guesses.slice(0, n);
    const mean = calcMean(subset);
    const median = calcMedian(subset);
    steps.push({
      n,
      mean: Math.round(mean),
      median: Math.round(median),
      meanError: Math.round(calcErrorPercent(mean, trueValue) * 100) / 100,
      medianError: Math.round(calcErrorPercent(median, trueValue) * 100) / 100
    });
  }

  return { guesses, steps };
}

// === 信息级联模拟 ===
// 当人们能看到前人的猜测时，群体智慧会失效
function simulateCascade(trueValue, count, cascadeStrength = 0.5) {
  const independent = [];
  const cascaded = [];
  let runningMean = 0;

  for (let i = 0; i < count; i++) {
    // 独立猜测
    const bias = (Math.random() * 2 - 1) * 0.4;
    const noise = gaussianRandom() * 0.25;
    const indGuess = Math.max(0, Math.round(trueValue * (1 + bias + noise)));
    independent.push(indGuess);

    // 级联猜测：受前人均值影响
    let casGuess;
    if (i === 0) {
      casGuess = indGuess;
    } else {
      const anchor = runningMean;
      casGuess = Math.max(0, Math.round(
        indGuess * (1 - cascadeStrength) + anchor * cascadeStrength
      ));
    }
    cascaded.push(casGuess);
    runningMean = calcMean(cascaded);
  }

  return {
    independent,
    cascaded,
    independentResult: analyzeWisdom(independent, trueValue),
    cascadedResult: analyzeWisdom(cascaded, trueValue)
  };
}

// === 多样性 vs 准确性 ===
// 展示多样性预测定理：群体误差 = 平均个体误差 - 多样性
function diversityTheorem(guesses, trueValue) {
  const mean = calcMean(guesses);
  const crowdError = (mean - trueValue) ** 2;
  const avgIndividualError = calcMean(guesses.map(g => (g - trueValue) ** 2));
  const diversity = calcMean(guesses.map(g => (g - mean) ** 2));

  return {
    crowdError: Math.round(crowdError),
    avgIndividualError: Math.round(avgIndividualError),
    diversity: Math.round(diversity),
    // 验证：crowdError ≈ avgIndividualError - diversity
    check: Math.round(avgIndividualError - diversity)
  };
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcMean, calcMedian, calcStdDev, calcError, calcErrorPercent,
    generateGuesses, gaussianRandom, analyzeWisdom,
    simulateConvergence, simulateCascade, diversityTheorem
  };
}
