const CompoundLogic = require('./compound-power-logic');
const assert = require('assert');

console.log('开始测试复利计算逻辑...');

/**
 * 测试用例 1: 单利 vs 复利
 * 验证：10万本金，10%利率，30年
 * 单利应为 40万
 * 复利应为 174.49万 (Math.floor后为 1744940)
 */
try {
  const principal = 100000;
  const rate = 0.1;
  const years = 30;
  
  const result = CompoundLogic.calculateSimpleVsCompound(principal, rate, years);
  
  const finalSimple = result.simpleData[years];
  const finalCompound = result.compoundData[years];
  
  // 单利：100000 * (1 + 0.1 * 30) = 100000 * 4 = 400000
  assert.strictEqual(finalSimple, 400000, '单利计算错误');
  
  // 复利：100000 * (1.1)^30 ≈ 1744940.22...
  assert.strictEqual(finalCompound, 1744940, '复利计算错误');
  
  console.log('✅ 单利 vs 复利测试通过');
} catch (e) {
  console.error('❌ 单利 vs 复利测试失败:', e.message);
  process.exit(1);
}

/**
 * 测试用例 2: 早投 vs 晚投
 * 验证：年投5万，8%利率
 * A: 早投10年 (20-30岁)，投入50万，之后不投
 * B: 晚投30年 (30-60岁)，投入150万
 * 
 * 验证60岁时(即第40年)的金额
 */
try {
  const annualAmount = 50000;
  const rate = 0.08;
  const gapYears = 10;
  const totalYears = 40;
  
  const result = CompoundLogic.calculateEarlyVsLate(annualAmount, rate, gapYears, totalYears);
  
  const finalA = result.earlyData[totalYears];
  const finalB = result.lateData[totalYears];
  
  const investedA = result.investedA;
  const investedB = result.investedB;
  
  // 验证本金投入
  assert.strictEqual(investedA, 500000, 'A本金计算错误'); // 50000 * 10
  assert.strictEqual(investedB, 1500000, 'B本金计算错误'); // 50000 * 30
  
  // 验证最终金额 (允许微小误差，因为我们使用了Math.floor)
  // A: 10年积累后是 50000 * ((1.08^10 - 1)/0.08) * 1.08 ≈ 782274
  //    然后复利滚30年: 782274 * 1.08^30 ≈ 782274 * 10.062 ≈ 7871630
  
  console.log(`A最终金额: ${finalA}`);
  console.log(`B最终金额: ${finalB}`);
  
  // A 应为 787万左右
  assert.ok(finalA > 7800000 && finalA < 7950000, 'A最终金额偏离预期');
  
  // B: 30年积累 (30-60岁)，每年存5万，年化8%
  // 50000 * ((1.08^30 - 1)/0.08) * 1.08 ≈ 6117293
  assert.ok(finalB > 6100000 && finalB < 6200000, 'B最终金额偏离预期');
  assert.ok(finalA > finalB, '早投A应该比晚投B钱多');
  
  console.log('✅ 早投 vs 晚投测试通过');
} catch (e) {
  console.error('❌ 早投 vs 晚投测试失败:', e.message);
  process.exit(1);
}

console.log('🎉 所有测试通过！');
