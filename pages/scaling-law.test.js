/**
 * scaling-law-logic.js 单元测试
 * 运行方式：node pages/scaling-law.test.js
 */

const ScalingLawLogic = require('./scaling-law-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ~${b})`);
}

// --- powerLaw ---
console.log('\n[powerLaw]');
assertClose(ScalingLawLogic.powerLaw(2, 1, 2), 4, 0.001, '1 * 2^2 = 4');
assertClose(ScalingLawLogic.powerLaw(10, 3.1, -0.05), 3.1 * Math.pow(10, -0.05), 0.001, '3.1 * 10^-0.05');
assertClose(ScalingLawLogic.powerLaw(1, 5, 0.34), 5, 0.001, '5 * 1^0.34 = 5');

// --- generateScalingCurve ---
console.log('\n[generateScalingCurve]');
const curve = ScalingLawLogic.generateScalingCurve(0.1, 1000, 50);
assert(curve.length === 50, '返回50个点');
assert(curve[0].N < curve[49].N, '参数量递增');
assert(curve[0].loss > curve[49].loss, 'Loss 随参数量增大而减小');
assert(curve[0].loss > 1.69, 'Loss 大于不可约损失 E=1.69');
assert(curve[49].loss > 1.69, '最大模型 Loss 仍大于 E');

// --- generateComputeCurve ---
console.log('\n[generateComputeCurve]');
const compCurve = ScalingLawLogic.generateComputeCurve(1e-3, 1e6, 60);
assert(compCurve.length === 60, '返回60个点');
assert(compCurve[0].loss > compCurve[59].loss, '算力越大 Loss 越小');
assert(compCurve[0].C < compCurve[59].C, '算力递增');

// --- computeDoublingGains ---
console.log('\n[computeDoublingGains]');
const gains = ScalingLawLogic.computeDoublingGains(0.34, 10);
assert(gains.length === 11, '返回11个点（0~10次翻倍）');
assert(gains[0].drop === null, '第0次无下降量');
assert(gains[1].drop > 0, '第1次翻倍有正收益');
// 收益递减：每次翻倍的绝对下降量应该越来越小
const drops = gains.slice(1).map(g => g.drop);
let isDecreasing = true;
for (let i = 1; i < drops.length; i++) {
  if (drops[i] > drops[i - 1]) { isDecreasing = false; break; }
}
assert(isDecreasing, '翻倍收益递减（绝对值）');
// 百分比下降应该大致相同（幂律特性）
const pcts = gains.slice(1).map(g => g.dropPct);
const pctMean = pcts.reduce((s, v) => s + v, 0) / pcts.length;
const pctStd = Math.sqrt(pcts.reduce((s, v) => s + (v - pctMean) ** 2, 0) / pcts.length);
assert(pctStd < 5, `百分比下降相对稳定（std=${pctStd.toFixed(2)}）`);

// --- generateEmergentCurve ---
console.log('\n[generateEmergentCurve]');
const emergent = ScalingLawLogic.generateEmergentCurve(50, 0.15, 80);
assert(emergent.length === 80, '返回80个点');
assert(emergent[0].ability < 0.1, '小模型能力接近0');
assert(emergent[79].ability > 0.9, '大模型能力接近1');
// 找到涌现点附近（50亿参数）
const nearThreshold = emergent.filter(p => p.N >= 40 && p.N <= 80);
assert(nearThreshold.length > 0, '阈值附近有数据点');

// --- generateEfficiencyFrontier ---
console.log('\n[generateEfficiencyFrontier]');
const frontier = ScalingLawLogic.generateEfficiencyFrontier();
assert(frontier.length >= 8, '至少8个模型数据点');
assert(frontier.every(m => m.compute > 0), '所有模型算力为正');
assert(frontier.every(m => m.score > 0 && m.score <= 100), '分数在0-100范围内');
const deepseek = frontier.find(m => m.name.includes('DeepSeek-R1'));
assert(deepseek !== undefined, '包含 DeepSeek-R1 数据');
assert(deepseek.compute < 1e23, 'DeepSeek-R1 算力远低于 GPT-4');

// --- fitPowerLaw ---
console.log('\n[fitPowerLaw]');
// 构造完美幂律数据：y = 2 * x^0.5
const perfectPoints = [1, 4, 9, 16, 25, 100].map(x => ({ x, y: 2 * Math.sqrt(x) }));
const fit = ScalingLawLogic.fitPowerLaw(perfectPoints);
assertClose(fit.a, 2, 0.01, 'a ≈ 2');
assertClose(fit.b, 0.5, 0.01, 'b ≈ 0.5');
assertClose(fit.r2, 1, 0.001, 'R² ≈ 1（完美拟合）');

// 测试噪声数据
const noisyPoints = [1, 2, 4, 8, 16, 32].map(x => ({
  x, y: 3 * Math.pow(x, -0.3) * (1 + (Math.random() - 0.5) * 0.1)
}));
const noisyFit = ScalingLawLogic.fitPowerLaw(noisyPoints);
assert(noisyFit.b < 0, '负幂律指数（递减关系）');
assert(noisyFit.r2 > 0.9, `噪声数据 R² 仍较高（${noisyFit.r2}）`);

// --- predictComputeNeeded ---
console.log('\n[predictComputeNeeded]');
const ratio = ScalingLawLogic.predictComputeNeeded(80, 85, 0.05);
assert(ratio > 1, '提升性能需要更多算力');
assert(ratio < 1e10, '算力倍数在合理范围内');
const bigJump = ScalingLawLogic.predictComputeNeeded(80, 95, 0.05);
assert(bigJump > ratio, '更大的性能提升需要更多算力');
const inf = ScalingLawLogic.predictComputeNeeded(80, 100, 0.05);
assert(inf === Infinity, '达到满分需要无限算力');

// --- 汇总 ---
console.log(`\n${'='.repeat(40)}`);
console.log(`测试结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
