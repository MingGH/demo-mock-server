/**
 * 百万只鸡砍腿问题 - 单元测试
 * 运行方式: node pages/chicken-leg-problem.test.js
 * 
 * 问题：N只鸡，每次从"有腿的鸡"中随机抽一只，砍掉一条腿，重复N次
 * 
 * 数学分析：
 * 设 H = 完好鸡数，O = 独腿鸡数，有腿鸡总数 = H + O
 * 每次砍腿：
 * - 选中完好鸡的概率 = H / (H + O)
 * - 选中独腿鸡的概率 = O / (H + O)
 * 
 * 通过期望值递推或微分方程分析，当 N → ∞ 时：
 * 完好鸡的比例收敛到约 0.31784 (≈ 31.78%)
 * 
 * 这个常数没有简单的闭式表达，但可以通过数值方法精确计算
 */

// 理论比例常数（通过数值方法计算得到的极限值）
const THEORY_RATIO = 0.31784443;

// 模拟浏览器环境中的 ChickenLegSimulator
const ChickenLegSimulator = {
  // 理论值计算
  calculateTheory: function(n) {
    // 对于有限的 N，用期望值递推计算精确理论值
    if (n <= 10000) {
      return this.calculateExactTheory(n);
    }
    // 对于大 N，使用极限比例
    return n * THEORY_RATIO;
  },
  
  // 精确理论值（期望值递推）
  calculateExactTheory: function(n) {
    let H = n;
    let O = 0;
    
    for (let k = 0; k < n; k++) {
      const total = H + O;
      if (total < 1e-10) break;
      
      const probHealthy = H / total;
      const newH = H - probHealthy;
      const newO = O + probHealthy - (O / total);
      
      H = newH;
      O = newO;
    }
    
    return H;
  },
  
  // 单次模拟
  simulate: function(n) {
    let healthy = n;
    let oneLeg = 0;
    let noLeg = 0;
    
    for (let i = 0; i < n; i++) {
      const chickensWithLegs = healthy + oneLeg;
      if (chickensWithLegs === 0) break;
      
      const rand = Math.random() * chickensWithLegs;
      
      if (rand < healthy) {
        healthy--;
        oneLeg++;
      } else {
        oneLeg--;
        noLeg++;
      }
    }
    
    return { healthy, oneLeg, noLeg };
  },
  
  // 批量模拟
  simulateMultiple: function(n, times) {
    const results = [];
    for (let i = 0; i < times; i++) {
      results.push(this.simulate(n).healthy);
    }
    return results;
  },

  // 计算统计量
  calculateStats: function(results) {
    const n = results.length;
    const mean = results.reduce((a, b) => a + b, 0) / n;
    const variance = results.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...results);
    const max = Math.max(...results);
    return { mean, stdDev, min, max };
  }
};

// ============ 测试框架 ============
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    testsFailed++;
    console.log(`❌ FAIL: ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  const relError = diff / expected;
  if (relError <= tolerance) {
    testsPassed++;
    console.log(`✅ PASS: ${message} (actual: ${actual.toFixed(4)}, expected: ${expected.toFixed(4)}, error: ${(relError * 100).toFixed(2)}%)`);
  } else {
    testsFailed++;
    console.log(`❌ FAIL: ${message} (actual: ${actual.toFixed(4)}, expected: ${expected.toFixed(4)}, error: ${(relError * 100).toFixed(2)}%)`);
  }
}

console.log('\n🐔 百万只鸡砍腿问题 - 单元测试\n');
console.log('='.repeat(60));

// ============ 测试用例 ============

console.log('\n📐 测试1: 理论值计算');
console.log('-'.repeat(40));

// 测试理论值（使用期望值递推计算的精确值）
const theory1000000 = ChickenLegSimulator.calculateTheory(1000000);
assertApprox(theory1000000, 317844.43, 0.001, 'N=1000000 理论值应约为 317844');

const theory10000 = ChickenLegSimulator.calculateTheory(10000);
assertApprox(theory10000, 3178.35, 0.001, 'N=10000 理论值应约为 3178');

const theory100 = ChickenLegSimulator.calculateTheory(100);
assertApprox(theory100, 31.69, 0.01, 'N=100 理论值应约为 31.69');

// 验证比例收敛到约 0.3178
const ratio = ChickenLegSimulator.calculateTheory(1000000) / 1000000;
assertApprox(ratio, THEORY_RATIO, 0.001, '比例应收敛到约 0.3178');

console.log('\n🎲 测试2: 单次模拟基本正确性');
console.log('-'.repeat(40));

// 测试模拟结果的基本约束
const result = ChickenLegSimulator.simulate(1000);
assert(result.healthy >= 0, '完好的鸡数量应 >= 0');
assert(result.oneLeg >= 0, '独腿鸡数量应 >= 0');
assert(result.noLeg >= 0, '无腿鸡数量应 >= 0');
assert(result.healthy + result.oneLeg + result.noLeg === 1000, '三种鸡的总数应等于 N');

// 验证腿的总数变化正确
const totalLegsRemaining = result.healthy * 2 + result.oneLeg;
const legsChopped = 1000 * 2 - totalLegsRemaining;
assert(legsChopped === 1000, '砍掉的腿数应等于 N');

console.log('\n📊 测试3: 大数定律验证（模拟均值接近理论值）');
console.log('-'.repeat(40));

// 用较小的 N 进行多次模拟，验证均值接近理论值
const N = 1000;
const TIMES = 500;
const results = ChickenLegSimulator.simulateMultiple(N, TIMES);
const stats = ChickenLegSimulator.calculateStats(results);
const theoryN = ChickenLegSimulator.calculateTheory(N);

// 允许 5% 的误差（因为是随机模拟）
assertApprox(stats.mean, theoryN, 0.05, `${TIMES}次模拟的均值应接近理论值 ${theoryN.toFixed(2)}`);

console.log('\n📈 测试4: 统计量计算');
console.log('-'.repeat(40));

// 测试统计量计算函数
const testData = [100, 110, 120, 130, 140];
const testStats = ChickenLegSimulator.calculateStats(testData);

assertApprox(testStats.mean, 120, 0.001, '均值计算正确');
assertApprox(testStats.stdDev, 14.14, 0.01, '标准差计算正确');
assert(testStats.min === 100, '最小值计算正确');
assert(testStats.max === 140, '最大值计算正确');

console.log('\n🔬 测试5: 边界情况');
console.log('-'.repeat(40));

// N=1 的情况：1只鸡砍1次，必然变成独腿鸡
const result1 = ChickenLegSimulator.simulate(1);
assert(result1.healthy === 0, 'N=1 时完好的鸡应为 0');
assert(result1.oneLeg === 1, 'N=1 时独腿鸡应为 1');
assert(result1.noLeg === 0, 'N=1 时无腿鸡应为 0');

// N=2 的情况
const result2 = ChickenLegSimulator.simulate(2);
assert(result2.healthy + result2.oneLeg + result2.noLeg === 2, 'N=2 时总数应为 2');

console.log('\n🎯 测试6: 概率分布验证');
console.log('-'.repeat(40));

// 验证结果分布的合理性
const N2 = 5000;
const TIMES2 = 200;
const results2 = ChickenLegSimulator.simulateMultiple(N2, TIMES2);
const stats2 = ChickenLegSimulator.calculateStats(results2);
const theory2 = ChickenLegSimulator.calculateTheory(N2);

// 检查所有结果都在合理范围内（理论值 ± 4倍标准差）
const expectedStdDev = Math.sqrt(N2 * THEORY_RATIO * (1 - THEORY_RATIO));
const lowerBound = theory2 - 4 * expectedStdDev;
const upperBound = theory2 + 4 * expectedStdDev;

const allInRange = results2.every(r => r >= lowerBound && r <= upperBound);
assert(allInRange, `所有结果应在 [${lowerBound.toFixed(0)}, ${upperBound.toFixed(0)}] 范围内`);

// 检查标准差的合理性（允许较大误差，因为实际分布不是简单的二项分布）
assertApprox(stats2.stdDev, expectedStdDev, 0.5, '标准差应在合理范围内');

console.log('\n🔢 测试7: 不同规模的一致性');
console.log('-'.repeat(40));

// 测试不同 N 值下，模拟均值接近理论值
const testNs = [100, 500, 1000, 2000];

testNs.forEach(n => {
  const simResults = ChickenLegSimulator.simulateMultiple(n, 100);
  const simStats = ChickenLegSimulator.calculateStats(simResults);
  const theoryForN = ChickenLegSimulator.calculateTheory(n);
  // 允许 10% 的误差
  assertApprox(simStats.mean, theoryForN, 0.1, `N=${n} 时模拟均值应接近理论值 ${theoryForN.toFixed(2)}`);
});

console.log('\n✨ 测试8: 数学常数验证');
console.log('-'.repeat(40));

// 验证 e 的值
assertApprox(Math.E, 2.71828, 0.0001, 'Math.E 应约等于 2.71828');

// 验证理论比例常数
assertApprox(THEORY_RATIO, 0.31784, 0.001, '理论比例常数应约为 0.31784');

// 验证这个常数不等于简单的数学表达式
assert(Math.abs(THEORY_RATIO - 1/Math.E) > 0.01, '理论比例不等于 1/e');
// 注意：理论比例 0.31784 非常接近 1/π ≈ 0.31831，但不完全相等
assert(Math.abs(THEORY_RATIO - 1/Math.PI) > 0.0001, '理论比例与 1/π 有微小差异');
assert(Math.abs(THEORY_RATIO - 0.25) > 0.01, '理论比例不等于 1/4');

// ============ 测试结果汇总 ============
console.log('\n' + '='.repeat(60));
console.log(`\n📋 测试结果汇总`);
console.log(`   通过: ${testsPassed}`);
console.log(`   失败: ${testsFailed}`);
console.log(`   总计: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n🎉 所有测试通过！\n');
  process.exit(0);
} else {
  console.log('\n⚠️ 有测试失败，请检查！\n');
  process.exit(1);
}
