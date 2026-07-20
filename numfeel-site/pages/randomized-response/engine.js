/**
 * 随机化回答技术（Randomized Response Technique）核心引擎。
 * 纯函数实现，不操作 DOM，兼容浏览器 <script> 与 Node require。
 *
 * 默认规则：一枚六面骰子
 *   - 掷出 1：强制回答"是"
 *   - 掷出 2：强制回答"否"
 *   - 掷出 3～6：如实回答
 *   - 如实回答概率 t = 4/6 = 2/3
 *   - 强制"是"概率 a = 1/6，强制"否"概率 b = 1/6
 */

'use strict';

/**
 * 默认如实回答概率（六面骰子规则下 3～6 共 4 面）。
 */
var DEFAULT_TRUTH_PROBABILITY = 2 / 3;

/**
 * 预设虚构场景。所有比例均为模拟参数，不代表现实调查结论。
 */
var SCENARIOS = {
  cheating: {
    id: 'cheating',
    seed: 9961,
    label: '考试作弊',
    icon: 'ti-school',
    prevalence: 0.30,
    question: '过去一年，你是否在考试中作弊过？'
  },
  expense: {
    id: 'expense',
    seed: 9962,
    label: '报销夹带私人消费',
    icon: 'ti-receipt',
    prevalence: 0.12,
    question: '过去一年，你是否在报销中夹带过私人消费？'
  },
  redLight: {
    id: 'redLight',
    seed: 9963,
    label: '闯红灯',
    icon: 'ti-traffic-lights',
    prevalence: 0.45,
    question: '过去一年，你是否闯过红灯？'
  }
};

/**
 * 创建可复现的线性同余随机数生成器。
 * @param {number} seed 非负整数种子。
 * @returns {function(): number} 返回 [0, 1) 区间的随机数函数。
 */
function createSeededRandom(seed) {
  var state = (seed >>> 0) || 1;
  return function() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * 将数值限制在 [min, max] 区间。
 * @param {number} value 输入值。
 * @param {number} min 下界。
 * @param {number} max 上界。
 * @returns {number} 裁剪后的值。
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 根据如实回答概率 t 计算对称强制回答概率 f = (1 - t) / 2。
 * 该值同时是强制"是"和强制"否"的概率。
 * @param {number} truthProbability 如实回答概率 t。
 * @returns {number} 强制回答概率 f。
 */
function getForcedProbability(truthProbability) {
  return (1 - truthProbability) / 2;
}

/**
 * 计算最终回答"是"的理论概率 θ = t × π + (1 - t) / 2。
 * @param {number} prevalence 总体中敏感事实为真的比例 π。
 * @param {number} truthProbability 如实回答概率 t。
 * @returns {number} 理论回答"是"的概率 θ。
 */
function responseYesProbability(prevalence, truthProbability) {
  return truthProbability * prevalence + (1 - truthProbability) / 2;
}

/**
 * 掷一枚六面骰子，返回 1～6。
 * @param {function(): number} [random] 可选的随机数函数。
 * @returns {number} 骰子点数 1～6。
 */
function rollDie(random) {
  var rng = random || Math.random;
  return Math.floor(rng() * 6) + 1;
}

/**
 * 根据骰子点数和真实情况，按默认规则推导回答。
 * @param {number} dieValue 骰子点数 1～6。
 * @param {boolean} hasTrait 是否具有敏感事实。
 * @returns {{response: string, mechanism: string}} 回答与机制。
 */
function responseFromDie(dieValue, hasTrait) {
  if (dieValue === 1) return { response: 'yes', mechanism: 'forced-yes' };
  if (dieValue === 2) return { response: 'no', mechanism: 'forced-no' };
  return { response: hasTrait ? 'yes' : 'no', mechanism: 'truthful' };
}

/**
 * 根据真实情况和如实回答概率生成一次随机化回答。
 * 使用连续随机数：先以 (1-t)/2 概率强制"是"，再以 (1-t)/2 强制"否"，否则如实回答。
 * @param {boolean} hasTrait 是否具有敏感事实。
 * @param {number} truthProbability 如实回答概率 t。
 * @param {function(): number} [random] 可选的随机数函数。
 * @param {number} [nonCompliance=0] 不遵守规则的比例（拥有敏感事实者中直接撒谎的比例）。
 * @returns {{response: string, mechanism: string, truth: boolean}} 回答、机制标记与真实情况。
 */
function generateRandomizedResponse(hasTrait, truthProbability, random, nonCompliance) {
  var rng = random || Math.random;
  var nc = nonCompliance || 0;
  if (nc > 0 && hasTrait && rng() < nc) {
    return { response: 'no', mechanism: 'non-compliant', truth: hasTrait };
  }
  var forced = getForcedProbability(truthProbability);
  var roll = rng();
  if (roll < forced) {
    return { response: 'yes', mechanism: 'forced-yes', truth: hasTrait };
  }
  if (roll < forced * 2) {
    return { response: 'no', mechanism: 'forced-no', truth: hasTrait };
  }
  return { response: hasTrait ? 'yes' : 'no', mechanism: 'truthful', truth: hasTrait };
}

/**
 * 模拟一批随机化回答。
 * @param {{prevalence: number, truthProbability: number, sampleSize: number, nonCompliance?: number}} config 配置。
 * @param {function(): number} [random] 可选的随机数函数。
 * @returns {{responses: string[], yesCount: number, noCount: number, sampleSize: number, internal: object}} 调查者可见数据与内部真值分离结构。
 */
function simulateBatch(config, random) {
  var rng = random || Math.random;
  var n = config.sampleSize;
  var responses = [];
  var yesCount = 0;
  var trueYesCount = 0;
  var forcedYesCount = 0;
  var forcedNoCount = 0;
  var truthfulCount = 0;
  var nonCompliantCount = 0;
  var nc = config.nonCompliance || 0;
  for (var i = 0; i < n; i++) {
    var hasTrait = rng() < config.prevalence;
    if (hasTrait) trueYesCount++;
    var r = generateRandomizedResponse(hasTrait, config.truthProbability, rng, nc);
    responses.push(r.response);
    if (r.response === 'yes') yesCount++;
    if (r.mechanism === 'forced-yes') forcedYesCount++;
    else if (r.mechanism === 'forced-no') forcedNoCount++;
    else if (r.mechanism === 'truthful') truthfulCount++;
    else nonCompliantCount++;
  }
  return {
    responses: responses,
    yesCount: yesCount,
    noCount: n - yesCount,
    sampleSize: n,
    internal: {
      trueYesCount: trueYesCount,
      trueNoCount: n - trueYesCount,
      forcedYesCount: forcedYesCount,
      forcedNoCount: forcedNoCount,
      truthfulCount: truthfulCount,
      nonCompliantCount: nonCompliantCount
    }
  };
}

/**
 * 从样本"是"的比例反推敏感事实为真的比例 π̂ = [r - (1-t)/2] / t。
 * 原始估计可能超出 [0,1]，同时返回裁剪值。
 * @param {number} yesCount 回答"是"的人数。
 * @param {number} sampleSize 样本量。
 * @param {number} truthProbability 如实回答概率 t。
 * @returns {{estimate: number, clipped: number, valid: boolean}} 原始估计、裁剪估计与有效性标记。
 */
function estimatePrevalence(yesCount, sampleSize, truthProbability) {
  if (sampleSize <= 0 || truthProbability <= 0 || truthProbability >= 1) {
    return { estimate: NaN, clipped: NaN, valid: false };
  }
  var r = yesCount / sampleSize;
  var forced = getForcedProbability(truthProbability);
  var estimate = (r - forced) / truthProbability;
  return { estimate: estimate, clipped: clamp(estimate, 0, 1), valid: true };
}

/**
 * 计算估计值的标准误 SE(π̂) ≈ sqrt[r(1-r) / (n × t²)]。
 * @param {number} yesCount 回答"是"的人数。
 * @param {number} sampleSize 样本量。
 * @param {number} truthProbability 如实回答概率 t。
 * @returns {number} 标准误。
 */
function estimateStandardError(yesCount, sampleSize, truthProbability) {
  if (sampleSize <= 0 || truthProbability <= 0 || truthProbability >= 1) {
    return NaN;
  }
  var r = yesCount / sampleSize;
  return Math.sqrt(r * (1 - r) / (sampleSize * truthProbability * truthProbability));
}

/**
 * 根据置信水平返回正态分布 z 值。
 * @param {number} confidenceLevel 置信水平，如 0.95。
 * @returns {number} z 值。
 */
function zScore(confidenceLevel) {
  var table = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
  var key = Number(confidenceLevel);
  if (table[key] !== undefined) return table[key];
  return 1.96;
}

/**
 * 计算置信区间。常规样本使用 π̂ ± z × SE；当原始估计越过 [0,1] 时，
 * 改用边界处模型概率计算标准误，并以约束估计 0 或 1 为中心，避免极端样本显示虚假的零宽区间。
 * 未裁剪区间与显示区间同时保留。
 * @param {number} yesCount 回答"是"的人数。
 * @param {number} sampleSize 样本量。
 * @param {number} truthProbability 如实回答概率 t。
 * @param {number} [confidenceLevel=0.95] 置信水平。
 * @returns {{estimate: number, clippedEstimate: number, standardError: number, margin: number, rawLower: number, rawUpper: number, lower: number, upper: number, confidenceLevel: number, boundaryAdjusted: boolean, valid: boolean}} CI 结构。
 */
function confidenceInterval(yesCount, sampleSize, truthProbability, confidenceLevel) {
  var level = confidenceLevel === undefined ? 0.95 : confidenceLevel;
  var est = estimatePrevalence(yesCount, sampleSize, truthProbability);
  if (!est.valid) {
    return {
      estimate: NaN, clippedEstimate: NaN, standardError: NaN, margin: NaN,
      rawLower: NaN, rawUpper: NaN, lower: NaN, upper: NaN,
      confidenceLevel: level, boundaryAdjusted: false, valid: false
    };
  }

  var boundaryAdjusted = est.estimate !== est.clipped;
  var se;
  if (boundaryAdjusted) {
    var modelRate = responseYesProbability(est.clipped, truthProbability);
    se = Math.sqrt(modelRate * (1 - modelRate) /
      (sampleSize * truthProbability * truthProbability));
  } else {
    se = estimateStandardError(yesCount, sampleSize, truthProbability);
  }

  var margin = zScore(level) * se;
  var center = boundaryAdjusted ? est.clipped : est.estimate;
  var rawLower = center - margin;
  var rawUpper = center + margin;
  return {
    estimate: est.estimate,
    clippedEstimate: est.clipped,
    standardError: se,
    margin: margin,
    rawLower: rawLower,
    rawUpper: rawUpper,
    lower: clamp(rawLower, 0, 1),
    upper: clamp(rawUpper, 0, 1),
    confidenceLevel: level,
    boundaryAdjusted: boundaryAdjusted,
    valid: true
  };
}

/**
 * 计算对称随机化回答机制的本地隐私强度指标 ε = ln[(1+t)/(1-t)]。
 * t 越高，回答越准确、隐私越弱；t 越低，隐私越强、估计波动越大。
 * @param {number} truthProbability 如实回答概率 t。
 * @returns {number} ε 值；t >= 1 时返回 Infinity。
 */
function localPrivacyEpsilon(truthProbability) {
  if (truthProbability <= 0) return 0;
  if (truthProbability >= 1) return Infinity;
  return Math.log((1 + truthProbability) / (1 - truthProbability));
}

/**
 * 计算 π≈50% 附近同等标准误所需样本量相对直接调查的近似倍率 1/t²。
 * 该近似仅在 π≈50% 附近粗略成立，不作为所有情况下的精确结论。
 * @param {number} truthProbability 如实回答概率 t。
 * @returns {number} 样本倍率。
 */
function sampleSizeMultiplier(truthProbability) {
  if (truthProbability <= 0) return Infinity;
  return 1 / (truthProbability * truthProbability);
}

/**
 * 模拟直接调查（无随机化保护），拥有敏感事实者以 concealProbability 概率撒谎。
 * @param {{prevalence: number, sampleSize: number, concealProbability: number}} config 配置。
 * @param {function(): number} [random] 可选的随机数函数。
 * @returns {{yesCount: number, noCount: number, sampleSize: number, observedRate: number, trueYesCount: number, valid: boolean}} 直接调查结果。
 */
function simulateDirectSurvey(config, random) {
  var rng = random || Math.random;
  var n = config.sampleSize;
  var conceal = clamp(config.concealProbability, 0, 1);
  if (n <= 0) {
    return { yesCount: 0, noCount: 0, sampleSize: 0, observedRate: NaN, trueYesCount: 0, valid: false };
  }
  var yesCount = 0;
  var trueYesCount = 0;
  for (var i = 0; i < n; i++) {
    var hasTrait = rng() < config.prevalence;
    if (hasTrait) trueYesCount++;
    var response;
    if (hasTrait) {
      response = rng() < conceal ? 'no' : 'yes';
    } else {
      response = 'no';
    }
    if (response === 'yes') yesCount++;
  }
  return {
    yesCount: yesCount,
    noCount: n - yesCount,
    sampleSize: n,
    observedRate: yesCount / n,
    trueYesCount: trueYesCount,
    valid: true
  };
}

/**
 * 使用固定 seed 运行完整模拟（RRT + 直接调查），便于测试和文章引用可复现结果。
 * @param {{scenario?: string, prevalence?: number, truthProbability?: number, sampleSize?: number, concealProbability?: number, nonCompliance?: number}} config 配置。
 * @param {number} seed 随机种子。
 * @returns {object} 包含 RRT 结果、直接调查结果与估计的完整摘要。
 */
function summarizeSimulation(config, seed) {
  var scenario = config.scenario ? SCENARIOS[config.scenario] : null;
  var prevalence = config.prevalence !== undefined ? config.prevalence : (scenario ? scenario.prevalence : 0.3);
  var truthProbability = config.truthProbability !== undefined ? config.truthProbability : DEFAULT_TRUTH_PROBABILITY;
  var sampleSize = config.sampleSize !== undefined ? config.sampleSize : 1000;
  var concealProbability = config.concealProbability !== undefined ? config.concealProbability : 0.5;
  var nonCompliance = config.nonCompliance || 0;

  var rrtRng = createSeededRandom(seed || 1);
  var rrtBatch = simulateBatch({
    prevalence: prevalence,
    truthProbability: truthProbability,
    sampleSize: sampleSize,
    nonCompliance: nonCompliance
  }, rrtRng);

  var directRng = createSeededRandom((seed || 1) + 1);
  var directResult = simulateDirectSurvey({
    prevalence: prevalence,
    sampleSize: sampleSize,
    concealProbability: concealProbability
  }, directRng);

  var ci = confidenceInterval(rrtBatch.yesCount, sampleSize, truthProbability);
  var theta = responseYesProbability(prevalence, truthProbability);
  var epsilon = localPrivacyEpsilon(truthProbability);

  return {
    scenario: scenario,
    config: {
      prevalence: prevalence,
      truthProbability: truthProbability,
      sampleSize: sampleSize,
      concealProbability: concealProbability,
      nonCompliance: nonCompliance,
      seed: seed
    },
    rrt: rrtBatch,
    direct: directResult,
    estimate: ci,
    theoreticalTheta: theta,
    epsilon: epsilon,
    forcedProbability: getForcedProbability(truthProbability),
    sampleSizeMultiplier: sampleSizeMultiplier(truthProbability)
  };
}

var ENGINE_EXPORTS = {
  DEFAULT_TRUTH_PROBABILITY: DEFAULT_TRUTH_PROBABILITY,
  SCENARIOS: SCENARIOS,
  createSeededRandom: createSeededRandom,
  clamp: clamp,
  getForcedProbability: getForcedProbability,
  responseYesProbability: responseYesProbability,
  rollDie: rollDie,
  responseFromDie: responseFromDie,
  generateRandomizedResponse: generateRandomizedResponse,
  simulateBatch: simulateBatch,
  estimatePrevalence: estimatePrevalence,
  estimateStandardError: estimateStandardError,
  zScore: zScore,
  confidenceInterval: confidenceInterval,
  localPrivacyEpsilon: localPrivacyEpsilon,
  sampleSizeMultiplier: sampleSizeMultiplier,
  simulateDirectSurvey: simulateDirectSurvey,
  summarizeSimulation: summarizeSimulation
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ENGINE_EXPORTS;
} else if (typeof window !== 'undefined') {
  window.engine = ENGINE_EXPORTS;
}
