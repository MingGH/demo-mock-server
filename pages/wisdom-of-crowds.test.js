/**
 * 群体智慧 — 单元测试
 * 用 node pages/wisdom-of-crowds.test.js 直接运行
 */

const {
  calcMean, calcMedian, calcStdDev, calcError, calcErrorPercent,
  generateGuesses, analyzeWisdom, simulateConvergence,
  simulateCascade, diversityTheorem
} = require('./wisdom-of-crowds-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

function approxEqual(a, b, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}

// === calcMean ===
console.log('\n📊 calcMean');
assert(calcMean([1, 2, 3, 4, 5]) === 3, '均值 [1,2,3,4,5] = 3');
assert(calcMean([10]) === 10, '单元素均值');
assert(calcMean([]) === 0, '空数组均值 = 0');
assert(calcMean([100, 200]) === 150, '均值 [100,200] = 150');

// === calcMedian ===
console.log('\n📊 calcMedian');
assert(calcMedian([1, 2, 3, 4, 5]) === 3, '奇数个中位数 = 3');
assert(calcMedian([1, 2, 3, 4]) === 2.5, '偶数个中位数 = 2.5');
assert(calcMedian([5, 1, 3]) === 3, '无序数组中位数 = 3');
assert(calcMedian([]) === 0, '空数组中位数 = 0');
assert(calcMedian([42]) === 42, '单元素中位数');

// === calcStdDev ===
console.log('\n📊 calcStdDev');
assert(calcStdDev([]) === 0, '空数组标准差 = 0');
assert(calcStdDev([5]) === 0, '单元素标准差 = 0');
assert(approxEqual(calcStdDev([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.01), '标准差计算正确');

// === calcError / calcErrorPercent ===
console.log('\n📊 calcError / calcErrorPercent');
assert(calcError(105, 100) === 5, '绝对误差 |105-100| = 5');
assert(calcError(95, 100) === 5, '绝对误差 |95-100| = 5');
assert(calcErrorPercent(110, 100) === 10, '百分比误差 110 vs 100 = 10%');
assert(calcErrorPercent(100, 100) === 0, '零误差');
assert(calcErrorPercent(0, 0) === 0, '0 vs 0 = 0%');

// === generateGuesses ===
console.log('\n📊 generateGuesses');
const guesses100 = generateGuesses(1000, 100);
assert(guesses100.length === 100, '生成100个猜测');
assert(guesses100.every(g => g >= 0), '所有猜测非负');
assert(guesses100.every(g => Number.isInteger(g)), '所有猜测为整数');

const guessesMean = calcMean(guesses100);
// 100个猜测的均值应该在真实值的±30%以内（大概率）
assert(guessesMean > 700 && guessesMean < 1300, `100个猜测均值(${Math.round(guessesMean)})在合理范围`);

// === analyzeWisdom ===
console.log('\n📊 analyzeWisdom');
const analysis = analyzeWisdom([900, 1000, 1100, 950, 1050], 1000);
assert(analysis.mean === 1000, '均值计算正确');
assert(analysis.median === 1000, '中位数计算正确');
assert(analysis.meanError === 0, '均值误差为0');
assert(analysis.beatPercent >= 0 && analysis.beatPercent <= 100, 'beatPercent在合理范围');

// 大样本测试：群体均值应该比平均个体误差小
const bigGuesses = generateGuesses(500, 1000);
const bigAnalysis = analyzeWisdom(bigGuesses, 500);
assert(bigAnalysis.meanError < bigAnalysis.avgIndividualError,
  `群体均值误差(${bigAnalysis.meanError}%) < 平均个体误差(${bigAnalysis.avgIndividualError}%)`);
assert(bigAnalysis.beatPercent > 40,
  `群体均值打败了${bigAnalysis.beatPercent}%的个体（应>40%）`);

// === simulateConvergence ===
console.log('\n📊 simulateConvergence');
const conv = simulateConvergence(1000, 500);
assert(conv.guesses.length === 500, '生成500个猜测');
assert(conv.steps.length > 5, '有足够多的检查点');
assert(conv.steps[0].n === 1, '第一个检查点是n=1');
assert(conv.steps[conv.steps.length - 1].n === 500, '最后一个检查点是n=500');

// 收敛性：后面的误差应该比前面小（大概率）
const earlyError = conv.steps.find(s => s.n === 5)?.meanError || 999;
const lateError = conv.steps.find(s => s.n === 500)?.meanError || 999;
assert(lateError < earlyError + 10,
  `500人误差(${lateError}%) 应小于 5人误差(${earlyError}%)`);

// === simulateCascade ===
console.log('\n📊 simulateCascade');
const cascade = simulateCascade(1000, 200, 0.6);
assert(cascade.independent.length === 200, '独立猜测200个');
assert(cascade.cascaded.length === 200, '级联猜测200个');
assert(cascade.independentResult.stdDev > 0, '独立猜测有方差');
// 级联猜测的方差应该更小（因为趋同）
assert(cascade.cascadedResult.stdDev < cascade.independentResult.stdDev,
  `级联方差(${cascade.cascadedResult.stdDev}) < 独立方差(${cascade.independentResult.stdDev})`);

// === diversityTheorem ===
console.log('\n📊 diversityTheorem');
const dt = diversityTheorem([800, 900, 1000, 1100, 1200], 1000);
assert(dt.avgIndividualError > 0, '平均个体误差 > 0');
assert(dt.diversity > 0, '多样性 > 0');
// 验证定理：群体误差 ≈ 平均个体误差 - 多样性
assert(Math.abs(dt.crowdError - dt.check) < 2,
  `多样性预测定理验证: ${dt.crowdError} ≈ ${dt.avgIndividualError} - ${dt.diversity} = ${dt.check}`);

// 大样本验证
const dtBig = diversityTheorem(generateGuesses(500, 1000), 500);
assert(Math.abs(dtBig.crowdError - dtBig.check) < 2,
  `大样本多样性定理验证: ${dtBig.crowdError} ≈ ${dtBig.check}`);

// === 总结 ===
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
