function createSeededRandom(seed) {
  var state = seed >>> 0;
  return function() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, digits) {
  var factor = Math.pow(10, digits || 0);
  return Math.round(value * factor) / factor;
}

function laplaceNoise(scale, random) {
  var rng = random || Math.random;
  var u = rng() - 0.5;
  if (u === 0) return 0;
  var direction = u < 0 ? -1 : 1;
  return -scale * direction * Math.log(1 - 2 * Math.abs(u));
}

var SCENARIOS = {
  income: {
    id: 'income',
    seed: 9961,
    label: '收入统计',
    unit: '元',
    sampleSize: 1000,
    targetName: '张三',
    targetValue: 990000,
    threshold: 300000,
    min: 30000,
    max: 1000000,
    sensitivityMean: 970,
    sensitivityCount: 1,
    sensitivityP90: 16000,
    generator: function(rng) {
      var base = 70000 + rng() * 90000;
      var bonus = Math.pow(rng(), 5) * 260000;
      return Math.round(base + bonus);
    }
  },
  health: {
    id: 'health',
    seed: 9962,
    label: '医疗指标',
    unit: 'mg/dL',
    sampleSize: 1000,
    targetName: '张三',
    targetValue: 260,
    threshold: 180,
    min: 70,
    max: 300,
    sensitivityMean: 0.23,
    sensitivityCount: 1,
    sensitivityP90: 6,
    generator: function(rng) {
      var value = 92 + rng() * 35 + (rng() < 0.12 ? rng() * 75 : 0);
      return Math.round(value);
    }
  },
  app: {
    id: 'app',
    seed: 9963,
    label: 'App 使用时长',
    unit: '分钟',
    sampleSize: 1000,
    targetName: '张三',
    targetValue: 780,
    threshold: 360,
    min: 0,
    max: 900,
    sensitivityMean: 0.9,
    sensitivityCount: 1,
    sensitivityP90: 18,
    generator: function(rng) {
      var light = rng() * 90;
      var heavy = rng() < 0.25 ? rng() * 260 : 0;
      return Math.round(light + heavy + 20);
    }
  }
};

function generateDataset(scenarioId) {
  var scenario = SCENARIOS[scenarioId] || SCENARIOS.income;
  var rng = createSeededRandom(scenario.seed);
  var values = [];
  for (var i = 0; i < scenario.sampleSize; i++) {
    values.push(clamp(scenario.generator(rng), scenario.min, scenario.max));
  }
  return values;
}

function mean(values) {
  if (!values.length) return 0;
  var sum = 0;
  for (var i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function countAbove(values, threshold) {
  var count = 0;
  for (var i = 0; i < values.length; i++) {
    if (values[i] >= threshold) count++;
  }
  return count;
}

function percentile(values, p) {
  if (!values.length) return 0;
  var sorted = values.slice().sort(function(a, b) { return a - b; });
  var idx = (sorted.length - 1) * p;
  var low = Math.floor(idx);
  var high = Math.ceil(idx);
  if (low === high) return sorted[low];
  return sorted[low] * (high - idx) + sorted[high] * (idx - low);
}

function getQuerySensitivity(scenario, queryType) {
  if (queryType === 'countAbove') return scenario.sensitivityCount;
  if (queryType === 'p90') return scenario.sensitivityP90;
  return scenario.sensitivityMean;
}

function runQuery(values, scenario, queryType) {
  if (queryType === 'countAbove') return countAbove(values, scenario.threshold);
  if (queryType === 'p90') return percentile(values, 0.9);
  return mean(values);
}

function privateRelease(trueValue, sensitivity, epsilon, random) {
  var safeEpsilon = Math.max(0.0001, epsilon);
  var scale = sensitivity / safeEpsilon;
  return {
    value: trueValue + laplaceNoise(scale, random),
    scale: scale
  };
}

function simulateReleases(trueValue, sensitivity, epsilon, trials, seed) {
  var rng = createSeededRandom(seed || 1234);
  var result = [];
  for (var i = 0; i < trials; i++) {
    result.push(privateRelease(trueValue, sensitivity, epsilon, rng).value);
  }
  return result;
}

function estimateAttackConfidence(withoutValue, withValue, sensitivity, epsilon, trials, seed) {
  var rng = createSeededRandom(seed || 4321);
  var scale = sensitivity / Math.max(0.0001, epsilon);
  var midpoint = (withoutValue + withValue) / 2;
  var correct = 0;
  for (var i = 0; i < trials; i++) {
    var released = withValue + laplaceNoise(scale, rng);
    if (released >= midpoint) correct++;
  }
  return correct / trials;
}

function buildHistogram(values, min, max, bins) {
  var result = [];
  var width = (max - min) / bins;
  for (var i = 0; i < bins; i++) result.push(0);
  for (var j = 0; j < values.length; j++) {
    var idx = Math.floor((values[j] - min) / width);
    idx = clamp(idx, 0, bins - 1);
    result[idx]++;
  }
  return result;
}

function summarizeExperiment(scenarioId, queryType, epsilon, trials, seedOffset) {
  var seedBase = seedOffset || 0;
  var scenario = SCENARIOS[scenarioId] || SCENARIOS.income;
  var withoutTarget = generateDataset(scenarioId);
  var withTarget = withoutTarget.concat([scenario.targetValue]);
  var withoutValue = runQuery(withoutTarget, scenario, queryType);
  var withValue = runQuery(withTarget, scenario, queryType);
  var sensitivity = getQuerySensitivity(scenario, queryType);
  var release = privateRelease(withValue, sensitivity, epsilon, createSeededRandom(7788 + seedBase));
  var confidence = estimateAttackConfidence(withoutValue, withValue, sensitivity, epsilon, trials, 8899 + seedBase);
  return {
    scenario: scenario,
    withoutTarget: withoutTarget,
    withTarget: withTarget,
    withoutValue: withoutValue,
    withValue: withValue,
    delta: withValue - withoutValue,
    sensitivity: sensitivity,
    release: release,
    confidence: confidence,
    simulatedReleases: simulateReleases(withValue, sensitivity, epsilon, trials, 9900 + seedBase)
  };
}

function privacyLevel(epsilon) {
  if (epsilon <= 0.5) {
    return { label: '隐私很强', text: '攻击结果接近瞎猜，但统计误差会很明显。' };
  }
  if (epsilon <= 2) {
    return { label: '折中状态', text: '多数统计仍有参考价值，单个人的影响被部分掩盖。' };
  }
  if (epsilon <= 5) {
    return { label: '偏向准确', text: '结果更接近真实值，但攻击者也获得了更多线索。' };
  }
  return { label: '隐私较弱', text: '噪声很小，适合低风险统计，不适合敏感个体。' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCENARIOS: SCENARIOS,
    createSeededRandom: createSeededRandom,
    clamp: clamp,
    roundTo: roundTo,
    laplaceNoise: laplaceNoise,
    generateDataset: generateDataset,
    mean: mean,
    countAbove: countAbove,
    percentile: percentile,
    getQuerySensitivity: getQuerySensitivity,
    runQuery: runQuery,
    privateRelease: privateRelease,
    simulateReleases: simulateReleases,
    estimateAttackConfidence: estimateAttackConfidence,
    buildHistogram: buildHistogram,
    summarizeExperiment: summarizeExperiment,
    privacyLevel: privacyLevel
  };
}
