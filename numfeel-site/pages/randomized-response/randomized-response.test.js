var engine = require('./engine.js');

var createSeededRandom = engine.createSeededRandom;
var clamp = engine.clamp;
var getForcedProbability = engine.getForcedProbability;
var responseYesProbability = engine.responseYesProbability;
var rollDie = engine.rollDie;
var responseFromDie = engine.responseFromDie;
var generateRandomizedResponse = engine.generateRandomizedResponse;
var simulateBatch = engine.simulateBatch;
var estimatePrevalence = engine.estimatePrevalence;
var estimateStandardError = engine.estimateStandardError;
var confidenceInterval = engine.confidenceInterval;
var localPrivacyEpsilon = engine.localPrivacyEpsilon;
var sampleSizeMultiplier = engine.sampleSizeMultiplier;
var simulateDirectSurvey = engine.simulateDirectSurvey;
var summarizeSimulation = engine.summarizeSimulation;
var SCENARIOS = engine.SCENARIOS;
var DEFAULT_TRUTH_PROBABILITY = engine.DEFAULT_TRUTH_PROBABILITY;

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + message);
  } else {
    failed++;
    console.error('  ✗ ' + message);
  }
}

function assertClose(actual, expected, tolerance, message) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    message + ' (actual=' + actual + ', expected=' + expected + ', tol=' + tolerance + ')'
  );
}

console.log('\n=== 1. 固定 seed 随机数可复现 ===');

(function testSeededRandom() {
  var rng1 = createSeededRandom(42);
  var rng2 = createSeededRandom(42);
  var seq1 = [];
  var seq2 = [];
  for (var i = 0; i < 100; i++) {
    seq1.push(rng1());
    seq2.push(rng2());
  }
  var same = true;
  for (var j = 0; j < seq1.length; j++) {
    if (seq1[j] !== seq2[j]) { same = false; break; }
  }
  assert(same, '同 seed 产生完全相同的随机序列');
  var rng3 = createSeededRandom(99);
  assert(rng1() !== rng3() || rng1() !== rng3(), '不同 seed 产生不同序列');
})();

console.log('\n=== 2. 默认骰子规则下的理论概率 ===');

(function testDefaultDieProbabilities() {
  var t = DEFAULT_TRUTH_PROBABILITY;
  assertClose(t, 2 / 3, 0, '默认 t = 2/3');
  var pYesGivenTrait = responseYesProbability(1, t);
  var pYesGivenNoTrait = responseYesProbability(0, t);
  assertClose(pYesGivenTrait, 5 / 6, 1e-10, '有敏感事实者回答"是"的理论概率 = 5/6');
  assertClose(pYesGivenNoTrait, 1 / 6, 1e-10, '无敏感事实者回答"是"的理论概率 = 1/6');
})();

console.log('\n=== 3. θ = tπ + (1-t)/2 计算正确 ===');

(function testThetaFormula() {
  assertClose(responseYesProbability(0.3, 0.5), 0.5 * 0.3 + 0.25, 1e-10, 't=0.5, π=0.3 时 θ 计算正确');
  assertClose(responseYesProbability(0.8, 0.7), 0.7 * 0.8 + 0.15, 1e-10, 't=0.7, π=0.8 时 θ 计算正确');
  assertClose(responseYesProbability(0, 0.5), 0.25, 1e-10, 'π=0 时 θ = (1-t)/2');
  assertClose(responseYesProbability(1, 0.5), 0.75, 1e-10, 'π=1 时 θ = t + (1-t)/2');
})();

console.log('\n=== 4. 给定理论观察比例能反推原始 π ===');

(function testInverseEstimation() {
  var t = 2 / 3;
  var pi = 0.3;
  var theta = responseYesProbability(pi, t);
  var est = estimatePrevalence(Math.round(theta * 10000), 10000, t);
  assertClose(est.estimate, pi, 0.001, '从理论 θ 反推 π 正确');
  var pi2 = 0.45;
  var theta2 = responseYesProbability(pi2, t);
  var est2 = estimatePrevalence(Math.round(theta2 * 10000), 10000, t);
  assertClose(est2.estimate, pi2, 0.001, '从理论 θ 反推 π=0.45 正确');
})();

console.log('\n=== 5. t=2/3, π=0.3 时理论"是"比例 = 11/30 ===');

(function testKnownTheta() {
  var theta = responseYesProbability(0.3, 2 / 3);
  assertClose(theta, 11 / 30, 1e-10, 't=2/3, π=0.3 时 θ = 11/30 ≈ 0.3666667');
  assertClose(theta, 0.3666667, 1e-6, 'θ ≈ 0.3666667');
})();

console.log('\n=== 6. ε(t=2/3) = ln(5) ===');

(function testEpsilon() {
  var eps = localPrivacyEpsilon(2 / 3);
  assertClose(eps, Math.log(5), 1e-10, 't=2/3 时 ε = ln(5)');
  assertClose(eps, 1.6094379, 1e-6, 'ε ≈ 1.609');
  assert(localPrivacyEpsilon(0.5) < eps, 't 减小时 ε 减小（隐私增强）');
  assert(localPrivacyEpsilon(0.9) > eps, 't 增大时 ε 增大（隐私减弱）');
})();

console.log('\n=== 7. 样本量增加时标准误下降 ===');

(function testSEDdecreasesWithN() {
  var t = 2 / 3;
  var se100 = estimateStandardError(37, 100, t);
  var se1000 = estimateStandardError(370, 1000, t);
  var se10000 = estimateStandardError(3700, 10000, t);
  assert(se100 > se1000, 'n=1000 的 SE 小于 n=100');
  assert(se1000 > se10000, 'n=10000 的 SE 小于 n=1000');
})();

console.log('\n=== 8. t 下降时隐私增强、估计误差通常增大 ===');

(function testPrivacyPrecisionTradeoff() {
  var pi = 0.3;
  var n = 1000;
  var tHigh = 0.8;
  var tLow = 0.4;
  assert(localPrivacyEpsilon(tLow) < localPrivacyEpsilon(tHigh), 't 低时 ε 更小（隐私更强）');
  var thetaHigh = responseYesProbability(pi, tHigh);
  var thetaLow = responseYesProbability(pi, tLow);
  var seHigh = estimateStandardError(Math.round(thetaHigh * n), n, tHigh);
  var seLow = estimateStandardError(Math.round(thetaLow * n), n, tLow);
  assert(seLow > seHigh, 't 低时同样样本量下 SE 通常更大');
  assert(sampleSizeMultiplier(tLow) > sampleSizeMultiplier(tHigh), 't 低时样本倍率更大');
})();

console.log('\n=== 9. CI 裁剪到 [0,1]，原始估计保留 ===');

(function testCIClipping() {
  var t = 2 / 3;
  var ci = confidenceInterval(0, 50, t);
  assert(ci.estimate <= 0, '小样本全答"否"时原始估计 ≤ 0');
  assert(ci.clippedEstimate === 0, '裁剪估计为 0');
  assert(ci.lower === 0 && ci.upper > 0, '边界调整后 CI 从 0 向上保留不确定性');
  assert(ci.rawLower < 0, '未裁剪下界保留（<0）');
  assert(ci.boundaryAdjusted, '越界估计启用边界标准误调整');

  var ci2 = confidenceInterval(50, 50, t);
  assert(ci2.estimate >= 1, '小样本全答"是"时原始估计 ≥ 1');
  assert(ci2.clippedEstimate === 1, '裁剪估计为 1');
  assert(ci2.lower < 1 && ci2.upper === 1, '边界调整后 CI 向 1 以下保留不确定性');
  assert(ci2.rawUpper > 1, '未裁剪上界保留（>1）');
  assert(ci2.boundaryAdjusted, '上边界越界估计启用标准误调整');

  var ci3 = confidenceInterval(370, 1000, t);
  assert(ci3.lower >= 0 && ci3.upper <= 1, '正常情况 CI 在 [0,1] 内');
  assert(ci3.estimate === ci3.clippedEstimate, '正常情况原始估计 = 裁剪估计');
})();

console.log('\n=== 10. 固定 seed 的批量模拟结果完全一致 ===');

(function testBatchReproducibility() {
  var config = { prevalence: 0.3, truthProbability: 2 / 3, sampleSize: 500 };
  var batch1 = simulateBatch(config, createSeededRandom(123));
  var batch2 = simulateBatch(config, createSeededRandom(123));
  assert(batch1.yesCount === batch2.yesCount, '同 seed 批量模拟 yesCount 一致');
  assert(batch1.internal.trueYesCount === batch2.internal.trueYesCount, '同 seed 内部 trueYesCount 一致');
  var sameResponses = true;
  for (var i = 0; i < batch1.responses.length; i++) {
    if (batch1.responses[i] !== batch2.responses[i]) { sameResponses = false; break; }
  }
  assert(sameResponses, '同 seed 回答序列完全一致');

  var batch3 = simulateBatch(config, createSeededRandom(456));
  assert(batch1.yesCount !== batch3.yesCount || batch1.responses[0] !== batch3.responses[0], '不同 seed 产生不同结果');
})();

console.log('\n=== 11. 大样本模拟估计值接近设定真值 ===');

(function testLargeSampleConvergence() {
  var summary = summarizeSimulation({
    prevalence: 0.3,
    truthProbability: 2 / 3,
    sampleSize: 10000
  }, 9961);
  assertClose(summary.estimate.estimate, 0.3, 0.05, 'n=10000 时 RRT 估计接近 π=0.3');
  assert(summary.estimate.lower < 0.3 && summary.estimate.upper > 0.3, '真值落在 95% CI 内');

  var summary2 = summarizeSimulation({
    prevalence: 0.12,
    truthProbability: 2 / 3,
    sampleSize: 10000
  }, 9962);
  assertClose(summary2.estimate.estimate, 0.12, 0.05, 'n=10000 时 RRT 估计接近 π=0.12');

  var summary3 = summarizeSimulation({
    prevalence: 0.45,
    truthProbability: 2 / 3,
    sampleSize: 10000
  }, 9963);
  assertClose(summary3.estimate.estimate, 0.45, 0.05, 'n=10000 时 RRT 估计接近 π=0.45');
})();

console.log('\n=== 12. 直接调查隐瞒概率增加时估计系统性下降 ===');

(function testDirectSurveyConcealment() {
  var rng1 = createSeededRandom(100);
  var direct0 = simulateDirectSurvey({ prevalence: 0.3, sampleSize: 5000, concealProbability: 0 }, rng1);
  var rng2 = createSeededRandom(100);
  var direct3 = simulateDirectSurvey({ prevalence: 0.3, sampleSize: 5000, concealProbability: 0.3 }, rng2);
  var rng4 = createSeededRandom(100);
  var direct8 = simulateDirectSurvey({ prevalence: 0.3, sampleSize: 5000, concealProbability: 0.8 }, rng4);

  assertClose(direct0.observedRate, 0.3, 0.02, '隐瞒=0 时直接调查估计 ≈ 真值');
  assert(direct3.observedRate < direct0.observedRate, '隐瞒=0.3 时估计下降');
  assert(direct8.observedRate < direct3.observedRate, '隐瞒=0.8 时估计进一步下降');
  assertClose(direct8.observedRate, 0.3 * 0.2, 0.03, '隐瞒=0.8 时估计 ≈ π×(1-隐瞒)');
})();

console.log('\n=== 13. 边界和非法参数处理 ===');

(function testInvalidParameters() {
  var est0 = estimatePrevalence(10, 0, 2 / 3);
  assert(!est0.valid, 'n=0 时 estimatePrevalence 返回 invalid');

  var est1 = estimatePrevalence(10, 100, 0);
  assert(!est1.valid, 't=0 时 estimatePrevalence 返回 invalid');

  var est2 = estimatePrevalence(10, 100, 1);
  assert(!est2.valid, 't=1 时 estimatePrevalence 返回 invalid');

  var se0 = estimateStandardError(10, 0, 2 / 3);
  assert(isNaN(se0), 'n=0 时 SE 为 NaN');

  var ci0 = confidenceInterval(10, 0, 2 / 3);
  assert(!ci0.valid, 'n=0 时 CI 返回 invalid');

  var eps0 = localPrivacyEpsilon(0);
  assert(eps0 === 0, 't=0 时 ε=0');
  var eps1 = localPrivacyEpsilon(1);
  assert(eps1 === Infinity, 't=1 时 ε=Infinity');

  var mult0 = sampleSizeMultiplier(0);
  assert(mult0 === Infinity, 't=0 时样本倍率 = Infinity');

  var clampResult = clamp(5, 0, 1);
  assert(clampResult === 1, 'clamp(5, 0, 1) = 1');
  var clampResult2 = clamp(-3, 0, 1);
  assert(clampResult2 === 0, 'clamp(-3, 0, 1) = 0');

  var direct0 = simulateDirectSurvey({ prevalence: 0.3, sampleSize: 0, concealProbability: 0.5 });
  assert(!direct0.valid, 'n=0 时直接调查返回 invalid');
})();

console.log('\n=== 补充：骰子规则与机制验证 ===');

(function testDieMechanism() {
  var r1 = responseFromDie(1, true);
  assert(r1.response === 'yes' && r1.mechanism === 'forced-yes', '骰子=1 强制"是"');
  var r2 = responseFromDie(2, false);
  assert(r2.response === 'no' && r2.mechanism === 'forced-no', '骰子=2 强制"否"');
  var r3 = responseFromDie(3, true);
  assert(r3.response === 'yes' && r3.mechanism === 'truthful', '骰子=3 且有事实 -> 如实"是"');
  var r6 = responseFromDie(6, false);
  assert(r6.response === 'no' && r6.mechanism === 'truthful', '骰子=6 且无事实 -> 如实"否"');

  var die = rollDie(createSeededRandom(1));
  assert(die >= 1 && die <= 6, '骰子点数在 1～6 范围内');
})();

(function testMonteCarloYesRate() {
  var t = 2 / 3;
  var rng = createSeededRandom(7777);
  var yesTrait = 0;
  var yesNoTrait = 0;
  var nTrait = 0;
  var nNoTrait = 0;
  for (var i = 0; i < 30000; i++) {
    if (i % 2 === 0) {
      nTrait++;
      if (generateRandomizedResponse(true, t, rng).response === 'yes') yesTrait++;
    } else {
      nNoTrait++;
      if (generateRandomizedResponse(false, t, rng).response === 'yes') yesNoTrait++;
    }
  }
  assertClose(yesTrait / nTrait, 5 / 6, 0.02, '蒙特卡洛：有事实者回答"是"率 ≈ 5/6');
  assertClose(yesNoTrait / nNoTrait, 1 / 6, 0.02, '蒙特卡洛：无事实者回答"是"率 ≈ 1/6');
})();

(function testSummarizeSimulationStructure() {
  var summary = summarizeSimulation({ scenario: 'cheating', sampleSize: 1000 }, 9961);
  assert(summary.scenario.id === 'cheating', 'summarizeSimulation 使用场景 cheating');
  assert(summary.rrt.sampleSize === 1000, 'RRT 样本量 = 1000');
  assert(summary.direct.sampleSize === 1000, '直接调查样本量 = 1000');
  assert(summary.rrt.yesCount !== summary.direct.yesCount, 'RRT 与直接调查结果不同');
  assert(summary.estimate.valid, '估计有效');
  assert(summary.theoreticalTheta > 0, '理论 θ > 0');
  assert(summary.epsilon > 0, 'ε > 0');
  assert(summary.forcedProbability > 0, '强制概率 > 0');
  assert(summary.sampleSizeMultiplier > 0, '样本倍率 > 0');
})();

console.log('\n=== 结果 ===');
console.log('通过: ' + passed + ', 失败: ' + failed);
process.exit(failed > 0 ? 1 : 0);
