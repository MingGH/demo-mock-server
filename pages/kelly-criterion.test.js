/**
 * 凯利公式计算器 - 单元测试
 * 运行方式: node pages/kelly-criterion.test.js
 * 
 * 凯利公式: f* = p - q/b = p - (1-p)/b
 * 其中:
 *   f* = 最优下注比例
 *   p = 获胜概率
 *   q = 失败概率 = 1 - p
 *   b = 赔率（赢了赚多少倍）
 * 
 * 本测试验证:
 * 1. 凯利公式计算正确性
 * 2. 模拟逻辑正确性
 * 3. 长期收益与理论预期一致
 * 4. 超过凯利值会导致更差的结果
 */

// ============ 核心算法（从页面提取） ============

const KellySimulator = {
  // 计算凯利最优比例
  calcKelly: function(p, b) {
    const kelly = p - (1 - p) / b;
    return Math.max(0, kelly);
  },

  // 计算期望值
  calcExpectedValue: function(p, b) {
    // 期望值 = p * b - (1-p) * 1 = p*b - 1 + p = p*(b+1) - 1
    return p * b - (1 - p);
  },

  // 计算几何增长率（对数期望）
  calcGeometricGrowth: function(p, b, f) {
    // G = p * ln(1 + f*b) + (1-p) * ln(1 - f)
    if (f <= 0) return 0;
    if (f >= 1) return -Infinity;
    return p * Math.log(1 + f * b) + (1 - p) * Math.log(1 - f);
  },

  // 单次模拟：玩 n 局，返回最终资金
  simulate: function(initial, p, b, betPct, rounds) {
    let money = initial;
    let wins = 0;
    
    for (let i = 0; i < rounds; i++) {
      if (money < 1) break; // 破产
      
      const bet = money * betPct;
      if (Math.random() < p) {
        money += bet * b;
        wins++;
      } else {
        money -= bet;
      }
    }
    
    return { money, wins, rounds };
  },

  // 批量模拟：多个玩家
  simulateMultiple: function(initial, p, b, betPct, rounds, players) {
    const results = [];
    for (let i = 0; i < players; i++) {
      results.push(this.simulate(initial, p, b, betPct, rounds).money);
    }
    return results;
  },

  // 计算统计量
  calcStats: function(results) {
    const n = results.length;
    const sorted = [...results].sort((a, b) => a - b);
    const mean = results.reduce((a, b) => a + b, 0) / n;
    const median = sorted[Math.floor(n / 2)];
    const bankrupt = results.filter(m => m < 1).length;
    const min = sorted[0];
    const max = sorted[n - 1];
    
    return { mean, median, bankrupt, min, max };
  },

  // 使用固定随机序列模拟（用于对比不同策略）
  simulateWithSequence: function(initial, b, betPct, winSequence) {
    let money = initial;
    
    for (const win of winSequence) {
      if (money < 1) break;
      const bet = money * betPct;
      money = win ? money + bet * b : money - bet;
    }
    
    return money;
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
  const relError = expected !== 0 ? diff / Math.abs(expected) : diff;
  if (relError <= tolerance || diff < 0.0001) {
    testsPassed++;
    console.log(`✅ PASS: ${message} (actual: ${actual.toFixed(6)}, expected: ${expected.toFixed(6)})`);
  } else {
    testsFailed++;
    console.log(`❌ FAIL: ${message} (actual: ${actual.toFixed(6)}, expected: ${expected.toFixed(6)}, error: ${(relError * 100).toFixed(2)}%)`);
  }
}

console.log('\n🎯 凯利公式计算器 - 单元测试\n');
console.log('='.repeat(60));

// ============ 测试用例 ============

console.log('\n📐 测试1: 凯利公式计算');
console.log('-'.repeat(40));

// 题目条件：51%胜率，1倍赔率
const kelly51 = KellySimulator.calcKelly(0.51, 1);
assertApprox(kelly51, 0.02, 0.001, '51%胜率、1倍赔率，凯利值应为 2%');

// 50%胜率，1倍赔率（公平游戏）
const kelly50 = KellySimulator.calcKelly(0.50, 1);
assertApprox(kelly50, 0, 0.001, '50%胜率、1倍赔率，凯利值应为 0%');

// 60%胜率，1倍赔率
const kelly60 = KellySimulator.calcKelly(0.60, 1);
assertApprox(kelly60, 0.20, 0.001, '60%胜率、1倍赔率，凯利值应为 20%');

// 40%胜率，2倍赔率
const kelly40_2 = KellySimulator.calcKelly(0.40, 2);
assertApprox(kelly40_2, 0.10, 0.001, '40%胜率、2倍赔率，凯利值应为 10%');

// 负期望值情况
const kellyNeg = KellySimulator.calcKelly(0.30, 1);
assertApprox(kellyNeg, 0, 0.001, '30%胜率、1倍赔率，凯利值应为 0（不下注）');

console.log('\n📊 测试2: 期望值计算');
console.log('-'.repeat(40));

// 51%胜率，1倍赔率
const ev51 = KellySimulator.calcExpectedValue(0.51, 1);
assertApprox(ev51, 0.02, 0.001, '51%胜率、1倍赔率，期望值应为 +2%');

// 50%胜率，1倍赔率
const ev50 = KellySimulator.calcExpectedValue(0.50, 1);
assertApprox(ev50, 0, 0.001, '50%胜率、1倍赔率，期望值应为 0');

// 49%胜率，1倍赔率
const ev49 = KellySimulator.calcExpectedValue(0.49, 1);
assertApprox(ev49, -0.02, 0.001, '49%胜率、1倍赔率，期望值应为 -2%');

console.log('\n📈 测试3: 几何增长率（凯利值最大化）');
console.log('-'.repeat(40));

// 验证凯利值确实最大化几何增长率
const p = 0.51, b = 1;
const kellyOpt = KellySimulator.calcKelly(p, b);

const gKelly = KellySimulator.calcGeometricGrowth(p, b, kellyOpt);
const gHalf = KellySimulator.calcGeometricGrowth(p, b, kellyOpt / 2);
const gDouble = KellySimulator.calcGeometricGrowth(p, b, kellyOpt * 2);

assert(gKelly > gHalf, '凯利值的几何增长率应大于半凯利');
assert(gKelly > gDouble, '凯利值的几何增长率应大于双倍凯利');

// 验证超过凯利值2倍时，几何增长率为负
const g3x = KellySimulator.calcGeometricGrowth(p, b, kellyOpt * 3);
assert(g3x < gKelly, '3倍凯利值的几何增长率应小于凯利值');

console.log('\n🎲 测试4: 模拟基本正确性');
console.log('-'.repeat(40));

// 测试模拟结果的基本约束
const simResult = KellySimulator.simulate(10000, 0.51, 1, 0.02, 100);
assert(simResult.money >= 0, '资金应 >= 0');
assert(simResult.wins >= 0 && simResult.wins <= 100, '胜场数应在 [0, 100] 范围内');

// 测试破产情况
const bankruptResult = KellySimulator.simulate(100, 0.51, 1, 0.99, 10);
// 99%下注比例，很可能破产

console.log('\n🔬 测试5: 固定序列对比（验证策略差异）');
console.log('-'.repeat(40));

// 生成一个固定的输赢序列
const fixedSequence = [];
for (let i = 0; i < 1000; i++) {
  fixedSequence.push(Math.random() < 0.51);
}

// 用相同序列测试不同策略
const result2pct = KellySimulator.simulateWithSequence(10000, 1, 0.02, fixedSequence);
const result1pct = KellySimulator.simulateWithSequence(10000, 1, 0.01, fixedSequence);
const result5pct = KellySimulator.simulateWithSequence(10000, 1, 0.05, fixedSequence);
const result10pct = KellySimulator.simulateWithSequence(10000, 1, 0.10, fixedSequence);

console.log(`  1%策略最终资金: ${result1pct.toFixed(0)}`);
console.log(`  2%策略最终资金: ${result2pct.toFixed(0)}`);
console.log(`  5%策略最终资金: ${result5pct.toFixed(0)}`);
console.log(`  10%策略最终资金: ${result10pct.toFixed(0)}`);

// 注意：单次序列不能保证凯利最优，但可以验证逻辑正确
assert(result2pct > 0, '2%策略应该存活');

console.log('\n📊 测试6: 大数定律验证（批量模拟）');
console.log('-'.repeat(40));

// 批量模拟验证
const PLAYERS = 500;
const ROUNDS = 500;

const results2 = KellySimulator.simulateMultiple(10000, 0.51, 1, 0.02, ROUNDS, PLAYERS);
const results10 = KellySimulator.simulateMultiple(10000, 0.51, 1, 0.10, ROUNDS, PLAYERS);

const stats2 = KellySimulator.calcStats(results2);
const stats10 = KellySimulator.calcStats(results10);

console.log(`  2%策略: 中位数=${stats2.median.toFixed(0)}, 破产=${stats2.bankrupt}`);
console.log(`  10%策略: 中位数=${stats10.median.toFixed(0)}, 破产=${stats10.bankrupt}`);

// 2%策略应该很少破产
assert(stats2.bankrupt < PLAYERS * 0.05, '2%策略破产率应低于5%');

// 10%策略破产率应该更高
assert(stats10.bankrupt >= stats2.bankrupt, '10%策略破产率应不低于2%策略');

console.log('\n🎯 测试7: 中位数增长验证');
console.log('-'.repeat(40));

// 凯利策略的中位数应该增长
// 理论上，1000局后中位数增长因子约为 exp(G * 1000)
// G(2%) ≈ 0.51 * ln(1.02) + 0.49 * ln(0.98) ≈ 0.0002
// 所以1000局后中位数约为 10000 * exp(0.2) ≈ 12214

const LONG_ROUNDS = 1000;
const longResults2 = KellySimulator.simulateMultiple(10000, 0.51, 1, 0.02, LONG_ROUNDS, 300);
const longStats2 = KellySimulator.calcStats(longResults2);

// 中位数应该增长（允许较大误差因为是随机模拟）
assert(longStats2.median > 10000, '2%策略1000局后中位数应增长');

console.log(`  2%策略${LONG_ROUNDS}局后中位数: ${longStats2.median.toFixed(0)}`);

console.log('\n🔢 测试8: 边界情况');
console.log('-'.repeat(40));

// 0%下注
const result0 = KellySimulator.simulate(10000, 0.51, 1, 0, 100);
assertApprox(result0.money, 10000, 0.001, '0%下注，资金应不变');

// 100%胜率
const kelly100 = KellySimulator.calcKelly(1.0, 1);
assertApprox(kelly100, 1.0, 0.001, '100%胜率，凯利值应为100%');

// 0%胜率
const kelly0 = KellySimulator.calcKelly(0, 1);
assertApprox(kelly0, 0, 0.001, '0%胜率，凯利值应为0%');

console.log('\n✨ 测试9: 特殊赔率验证');
console.log('-'.repeat(40));

// 2倍赔率，50%胜率
const kelly50_2 = KellySimulator.calcKelly(0.50, 2);
assertApprox(kelly50_2, 0.25, 0.001, '50%胜率、2倍赔率，凯利值应为25%');

// 3倍赔率，40%胜率
const kelly40_3 = KellySimulator.calcKelly(0.40, 3);
// f* = 0.4 - 0.6/3 = 0.4 - 0.2 = 0.2
assertApprox(kelly40_3, 0.20, 0.001, '40%胜率、3倍赔率，凯利值应为20%');

// 0.5倍赔率，70%胜率
const kelly70_05 = KellySimulator.calcKelly(0.70, 0.5);
// f* = 0.7 - 0.3/0.5 = 0.7 - 0.6 = 0.1
assertApprox(kelly70_05, 0.10, 0.001, '70%胜率、0.5倍赔率，凯利值应为10%');

console.log('\n🧮 测试10: 公式推导验证');
console.log('-'.repeat(40));

// 验证凯利公式的两种等价形式
// f* = p - q/b = p - (1-p)/b = (p*b - q) / b = (p*b - 1 + p) / b = (p*(b+1) - 1) / b
const p2 = 0.55, b2 = 1.5;
const form1 = p2 - (1 - p2) / b2;
const form2 = (p2 * (b2 + 1) - 1) / b2;
const form3 = (p2 * b2 - (1 - p2)) / b2;

assertApprox(form1, form2, 0.0001, '凯利公式两种形式应等价');
assertApprox(form1, form3, 0.0001, '凯利公式三种形式应等价');

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
