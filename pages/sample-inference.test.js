// 测试文件：引用拆分后的模块
const { gaussianRandom, generateSamples, sampleMean, sampleStd, gaussianPDF, scoreGuess, SCENARIOS } = (() => {
  const engine = require('./sample-inference/engine.js');
  const scenarios = require('./sample-inference/scenarios.js');
  return { ...engine, ...scenarios };
})();

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n🧪 统计侦探 - 核心算法测试\n');

console.log('--- gaussianRandom ---');
const s1k = generateSamples(100, 15, 10000);
assert(Math.abs(sampleMean(s1k) - 100) < 1, `均值接近100: ${sampleMean(s1k).toFixed(2)}`);
assert(Math.abs(sampleStd(s1k) - 15) < 1, `标准差接近15: ${sampleStd(s1k).toFixed(2)}`);

console.log('--- generateSamples ---');
assert(generateSamples(0, 1, 5).length === 5, '生成5个样本');
assert(generateSamples(0, 1, 100).length === 100, '生成100个样本');

console.log('--- sampleMean ---');
assert(sampleMean([1, 2, 3, 4, 5]) === 3, '均值 [1,2,3,4,5] = 3');
assert(sampleMean([10]) === 10, '单元素均值 = 10');
assert(Math.abs(sampleMean([2.5, 3.5]) - 3) < 0.001, '均值 [2.5, 3.5] = 3');

console.log('--- sampleStd ---');
assert(sampleStd([5, 5, 5]) === 0, '常数序列标准差 = 0');
const stdTest = sampleStd([2, 4, 4, 4, 5, 5, 7, 9]);
assert(Math.abs(stdTest - 2.138) < 0.01, `标准差 [2,4,4,4,5,5,7,9] ≈ 2.138: ${stdTest.toFixed(3)}`);

console.log('--- gaussianPDF ---');
const peak = gaussianPDF(0, 0, 1);
assert(Math.abs(peak - 0.3989) < 0.001, `标准正态峰值 ≈ 0.3989: ${peak.toFixed(4)}`);
assert(gaussianPDF(0, 0, 1) > gaussianPDF(1, 0, 1), '峰值处PDF最大');
assert(gaussianPDF(1, 0, 1) > gaussianPDF(2, 0, 1), '越远离均值PDF越小');
assert(Math.abs(gaussianPDF(-1.5, 0, 1) - gaussianPDF(1.5, 0, 1)) < 1e-10, 'PDF关于均值对称');

console.log('--- scoreGuess ---');
assert(scoreGuess(100, 15, 100, 15) === 100, '完美猜测得100分');
const ok = scoreGuess(110, 15, 100, 15);
assert(ok > 50 && ok < 100, `偏差1个标准差得分合理: ${ok}`);
assert(scoreGuess(200, 50, 100, 15) < 30, '严重偏差得分很低');
assert(scoreGuess(100, 15, 100, 15) > scoreGuess(115, 15, 100, 15), '更准的猜测得分更高');

console.log('--- 大样本收敛 ---');
const big = generateSamples(50, 10, 50000);
assert(Math.abs(sampleMean(big) - 50) < 0.5, `50000样本均值收敛: ${sampleMean(big).toFixed(2)}`);
assert(Math.abs(sampleStd(big) - 10) < 0.5, `50000样本标准差收敛: ${sampleStd(big).toFixed(2)}`);

console.log('--- 小样本波动 ---');
const smallMeans = Array.from({ length: 1000 }, () => sampleMean(generateSamples(100, 20, 3)));
const smallStd = sampleStd(smallMeans);
assert(smallStd > 8, `3个样本的均值波动较大: ${smallStd.toFixed(2)}`);

console.log('--- SCENARIOS 数据完整性 ---');
assert(Array.isArray(SCENARIOS) && SCENARIOS.length === 6, `共6个场景: ${SCENARIOS.length}`);
SCENARIOS.forEach((s, i) => {
  assert(s.mean > 0 && s.std > 0, `场景${i + 1} "${s.title}" mean/std 合法`);
  assert(s.sliderMin < s.mean && s.mean < s.sliderMax, `场景${i + 1} mean 在滑块范围内`);
});

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
