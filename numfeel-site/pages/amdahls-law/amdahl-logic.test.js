/**
 * Amdahl Logic - Unit Tests
 * 用 node 直接运行: node pages/amdahls-law/amdahl-logic.test.js
 */

const {
  amdahlSpeedup, ceilingSpeedup, timeMinutes, efficiency,
  marginalGain, marginalTimeSavedMinutes,
  serialFractionForCores, minCoresForSpeedup, speedupCurve
} = require('./amdahl-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

function assertThrows(fn, msg) {
  try {
    fn();
    assert(false, msg + '（没有抛异常）');
  } catch (e) {
    assert(true, msg);
  }
}

// ========== amdahlSpeedup ==========
console.log('\n📐 amdahlSpeedup');

// 25% 串行 + 64 核：1/(0.25 + 0.75/64) ≈ 3.821
const s64 = amdahlSpeedup(0.25, 64);
assert(approx(s64, 3.8209, 0.001), '25% 串行 64 核 ≈ 3.82x，不到 4x');

assert(amdahlSpeedup(0.25, 1) === 1, '1 核时加速比恒为 1');
assert(amdahlSpeedup(0, 1024) === 1024, '完全并行时加速比 = 核数');
assert(amdahlSpeedup(1, 64) === 1, '完全串行时加核无用');

assert(approx(amdahlSpeedup(0.25, 2), 1.6, 0.001), '25% 串行 2 核 = 1.6x');
assert(approx(amdahlSpeedup(0.25, 4), 2.2857, 0.001), '25% 串行 4 核 ≈ 2.29x');

// ========== ceilingSpeedup ==========
console.log('\n🧱 ceilingSpeedup');
assert(ceilingSpeedup(0.25) === 4, '25% 串行天花板 = 4x');
assert(ceilingSpeedup(0.4) === 2.5, '40% 串行天花板 = 2.5x');
assert(ceilingSpeedup(0.1) === 10, '10% 串行天花板 = 10x');
assert(ceilingSpeedup(0) === Infinity, '零串行天花板无穷大');

// 64 核再怎么堆也追不上天花板
assert(amdahlSpeedup(0.25, 64) < ceilingSpeedup(0.25), '64 核加速比低于天花板');
assert(amdahlSpeedup(0.25, 1000000) < 4, '一百万核也严格小于 4x');

// ========== timeMinutes ==========
console.log('\n⏱️ timeMinutes');
assert(approx(timeMinutes(0.25, 1, 100), 100, 0.001), '1 核 100 分钟还是 100 分钟');
assert(approx(timeMinutes(0.25, 64, 100), 26.172, 0.01), '25% 串行 64 核 ≈ 26.2 分钟');
assertThrows(() => timeMinutes(0.25, 64, 0), 'baseMinutes=0 抛异常');
assertThrows(() => timeMinutes(0.25, 64, -5), 'baseMinutes<0 抛异常');

// ========== efficiency ==========
console.log('\n📊 efficiency');
assert(approx(efficiency(0.25, 1), 1, 0.001), '1 核利用率 100%');
assert(approx(efficiency(0.25, 64), 0.0597, 0.001), '25% 串行 64 核利用率 ≈ 6%');
assert(approx(efficiency(0.25, 4), 0.5714, 0.001), '25% 串行 4 核利用率 ≈ 57%');

// ========== marginalGain / marginalTimeSavedMinutes ==========
console.log('\n🎲 marginalGain');
assert(marginalGain(0.25, 1) === 0, '第 1 颗核没有边际增益');
const g63 = marginalGain(0.25, 63);
const g64 = marginalGain(0.25, 64);
assert(g64 > 0, '第 64 颗核仍有正增益');
assert(g64 < g63, '第 64 颗核增益小于第 63 颗（递减）');
assert(approx(g64, 0.0028, 0.0005), `第 64 颗核只带来约 0.003x（实际 ${g64.toFixed(5)}）`);

const saved = marginalTimeSavedMinutes(0.25, 64, 100);
assert(saved > 0 && saved < 0.05, `第 64 颗核只省不到 3 秒（${(saved * 60).toFixed(2)} 秒）`);
assert(approx(marginalTimeSavedMinutes(0.25, 2, 100), 100 - 100 / 1.6, 0.001), '第 2 颗核省 37.5 分钟');

// ========== serialFractionForCores ==========
console.log('\n🎚️ serialFractionForCores');
const sMax64 = serialFractionForCores(64, 4);
assert(approx(sMax64, 0.2381, 0.001), '64 核达标 4x 允许串行 ≈ 23.8%');
// 反向验证：用这个串行比例 + 64 核，刚好达到 4x
assert(approx(amdahlSpeedup(sMax64, 64), 4, 0.001), '边界串行比例 + 64 核恰好 4x');

const sMax2 = serialFractionForCores(2, 1.5);
assert(approx(amdahlSpeedup(sMax2, 2), 1.5, 0.001), '2 核达标 1.5x 的边界比例反推成立');

assertThrows(() => serialFractionForCores(64, 1), '目标 1x 抛异常');
assertThrows(() => serialFractionForCores(64, 0.5), '目标 <1 抛异常');

// ========== minCoresForSpeedup ==========
console.log('\n🔍 minCoresForSpeedup');
assert(minCoresForSpeedup(0.15, 4) === 9, '15% 串行达标 4x 需 9 核');
assert(minCoresForSpeedup(0.24, 4) === 76, '24% 串行达标 4x 需 76 核');
assert(minCoresForSpeedup(0.25, 4) === null, '25% 串行天花板恰为 4x，有限核不可达');
assert(minCoresForSpeedup(0.4, 4) === null, '40% 串行不可能达标 4x');
assert(minCoresForSpeedup(0.1, 4) === 6, '10% 串行达标 4x 需 6 核');

// 验证 minCores 确实达标、而 n-1 不达标
const nMin = minCoresForSpeedup(0.24, 4);
assert(amdahlSpeedup(0.24, nMin) >= 4, '最少核数确实达标');
assert(amdahlSpeedup(0.24, nMin - 1) < 4, '少一颗核就不达标');

assertThrows(() => minCoresForSpeedup(-0.1, 4), '串行比例 <0 抛异常');
assertThrows(() => minCoresForSpeedup(1.1, 4), '串行比例 >1 抛异常');
assertThrows(() => amdahlSpeedup(0.25, 0), '核数 0 抛异常');
assertThrows(() => amdahlSpeedup(0.25, 2.5), '非整数核数抛异常');

// ========== speedupCurve ==========
console.log('\n📈 speedupCurve');
const curve = speedupCurve(0.25, 128);
assert(curve.cores.length === 128 && curve.speedup.length === 128, '曲线点数正确');
assert(curve.speedup.every((v, i) => i === 0 || v >= curve.speedup[i - 1]), '曲线单调不减');
assert(curve.speedup[0] === 1, '起点 = 1');
assert(curve.speedup[127] < curve.ceiling, '曲线终点低于天花板');
assert(curve.ceiling === 4, '天花板字段正确');

// ========== 总结 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed}  失败: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
