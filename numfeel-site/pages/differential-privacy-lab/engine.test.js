const {
  SCENARIOS,
  createSeededRandom,
  laplaceNoise,
  generateDataset,
  mean,
  countAbove,
  percentile,
  runQuery,
  privateRelease,
  simulateReleases,
  estimateAttackConfidence,
  buildHistogram,
  summarizeExperiment,
  privacyLevel
} = require('./engine.js');

let passed = 0;
let failed = 0;

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
  assert(Math.abs(actual - expected) <= tolerance, message + ' (actual=' + actual + ', expected=' + expected + ')');
}

console.log('\n=== 数据生成 ===');

(function testDatasetSizeAndTarget() {
  const income = generateDataset('income');
  assert(income.length === SCENARIOS.income.sampleSize, '收入数据集长度正确');
  assert(income.every(v => v >= SCENARIOS.income.min && v <= SCENARIOS.income.max), '收入数据在边界内');
})();

(function testSeededRandomStable() {
  const rng1 = createSeededRandom(42);
  const rng2 = createSeededRandom(42);
  assertClose(rng1(), rng2(), 0, '同 seed 随机数可复现');
})();

console.log('\n=== 查询函数 ===');

(function testMeanCountPercentile() {
  const values = [1, 2, 3, 4, 100];
  assertClose(mean(values), 22, 0, 'mean 正确');
  assert(countAbove(values, 4) === 2, 'countAbove 正确');
  assertClose(percentile(values, 0.5), 3, 0, '中位数正确');
  assertClose(percentile(values, 0.9), 61.6, 0.0001, '分位数插值正确');
})();

(function testRunQuery() {
  const scenario = SCENARIOS.app;
  const values = [10, 50, 400, 800];
  assertClose(runQuery(values, scenario, 'mean'), 315, 0, '平均值查询正确');
  assert(runQuery(values, scenario, 'countAbove') === 2, '阈值人数查询正确');
})();

console.log('\n=== 差分隐私噪声 ===');

(function testLaplaceNoiseDeterministic() {
  const rng = createSeededRandom(7);
  const a = laplaceNoise(10, rng);
  const rngAgain = createSeededRandom(7);
  const b = laplaceNoise(10, rngAgain);
  assertClose(a, b, 0, 'Laplace 噪声可用固定随机数复现');
})();

(function testPrivateReleaseScale() {
  const release = privateRelease(100, 5, 0.5, createSeededRandom(1));
  assertClose(release.scale, 10, 0, '噪声规模 = 敏感度 / ε');
})();

(function testSimulateReleasesLength() {
  const releases = simulateReleases(100, 2, 1, 333, 99);
  assert(releases.length === 333, '模拟发布次数正确');
})();

console.log('\n=== 攻击模型 ===');

(function testAttackConfidenceFallsWithLowerEpsilon() {
  const highPrivacy = estimateAttackConfidence(100, 130, 20, 0.2, 1000, 8);
  const lowPrivacy = estimateAttackConfidence(100, 130, 20, 10, 1000, 8);
  assert(highPrivacy < lowPrivacy, 'ε 越小攻击成功率越低');
  assert(lowPrivacy > 0.9, 'ε 很大时攻击者几乎能确认差异');
})();

(function testSummarizeExperiment() {
  const summary = summarizeExperiment('income', 'mean', 1, 500);
  assert(summary.withTarget.length === summary.withoutTarget.length + 1, '包含目标用户的数据多 1 条');
  assert(summary.delta > 0, '收入场景张三会拉高平均值');
  assert(summary.release.scale > 0, '发布噪声规模为正');
  assert(summary.simulatedReleases.length === 500, 'summary 包含模拟发布序列');
})();

(function testSummarizeSeedChangesRelease() {
  const a = summarizeExperiment('income', 'mean', 1, 200, 0);
  const b = summarizeExperiment('income', 'mean', 1, 200, 1);
  assert(a.release.value !== b.release.value, '不同 seed 会得到不同发布值');
  assert(a.simulatedReleases[0] !== b.simulatedReleases[0], '不同 seed 会得到不同模拟序列');
  assert(a.withoutValue === b.withoutValue, 'seed 不影响精确统计');
})();

(function testSummarizeConfidenceReactsToSeed() {
  const seeds = [0, 1, 2, 3, 4];
  const values = seeds.map(function(s) {
    return summarizeExperiment('income', 'mean', 1, 400, s).confidence;
  });
  var distinct = false;
  for (var i = 1; i < values.length; i++) {
    if (values[i] !== values[0]) { distinct = true; break; }
  }
  assert(distinct, '不同 seed 至少会产生不同的攻击成功率');
})();

console.log('\n=== 工具函数 ===');

(function testHistogram() {
  const hist = buildHistogram([0, 1, 2, 9, 10], 0, 10, 5);
  assert(hist.reduce((a, b) => a + b, 0) === 5, '直方图计数守恒');
})();

(function testPrivacyLevel() {
  assert(privacyLevel(0.2).label === '隐私很强', '低 ε 对应强隐私文案');
  assert(privacyLevel(8).label === '隐私较弱', '高 ε 对应弱隐私文案');
})();

console.log('\n=== 结果 ===');
console.log('通过: ' + passed + ', 失败: ' + failed);
process.exit(failed > 0 ? 1 : 0);
