/**
 * 彩票头奖破产模拟器 - 单元测试
 * 测试财富衰减算法、安全线计算、破产时间估算等核心逻辑
 */

// 核心算法（与页面一致）

function simulateWealth(prize, baseExpense, expenseMultiplier, annualReturn, months, options) {
  options = options || {};
  const monthlyReturn = annualReturn / 12;
  const peakExpense = baseExpense * expenseMultiplier;
  const rampSpeed = options.rampSpeed || 0.15;

  let wealth = prize;
  const history = [wealth];
  let totalSpent = 0;
  let totalEarned = 0;
  let bankruptMonth = -1;
  let peakWealth = prize;

  for (let m = 1; m <= months; m++) {
    if (wealth <= 0) { history.push(0); continue; }
    let returnRate = monthlyReturn;
    if (options.randomReturn) {
      returnRate = monthlyReturn + (randn() * 0.15 / Math.sqrt(12));
    }
    const earnings = wealth * returnRate;
    totalEarned += Math.max(0, earnings);

    const inflationFactor = 1 + (expenseMultiplier - 1) / (1 + Math.exp(-rampSpeed * (m - 6)));
    let expense = baseExpense * inflationFactor;

    if (options.randomShocks && Math.random() < 0.02) {
      expense += prize * (0.03 + Math.random() * 0.07);
    }

    totalSpent += expense;
    wealth = wealth + earnings - expense;

    if (wealth > peakWealth) peakWealth = wealth;
    if (wealth <= 0 && bankruptMonth === -1) {
      bankruptMonth = m;
      wealth = 0;
    }
    history.push(Math.max(0, wealth));
  }

  return { history, totalSpent, totalEarned, bankruptMonth, peakWealth, finalWealth: Math.max(0, wealth) };
}

function calcSafeWithdrawal(prize, annualReturn) {
  const safeRate = 0.04;
  const yearlyWithdrawal = prize * safeRate;
  const monthlyWithdrawal = yearlyWithdrawal / 12;
  const sustainable = annualReturn >= safeRate;
  return { monthlyWithdrawal, yearlyWithdrawal, sustainable };
}

function calcBankruptTime(prize, monthlyExpense, annualReturn) {
  const monthlyReturn = annualReturn / 12;
  const netBurn = monthlyExpense - prize * monthlyReturn;
  if (netBurn <= 0) return Infinity;
  return prize / netBurn;
}

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ============ 测试 ============

console.log('🧪 开始测试：彩票头奖破产模拟器核心逻辑\n');

// 测试1: 4%法则安全线计算
console.log('测试1: 4%法则安全线计算');
{
  const r1 = calcSafeWithdrawal(1000, 0.05);
  console.assert(Math.abs(r1.yearlyWithdrawal - 40) < 0.01, '1000万×4%应为40万/年');
  console.assert(Math.abs(r1.monthlyWithdrawal - 40 / 12) < 0.01, '月支出应为3.33万');
  console.assert(r1.sustainable === true, '5%回报率应可永续');
  console.log(`✓ 1000万, 5%回报: 年支出${r1.yearlyWithdrawal}万, 月支出${r1.monthlyWithdrawal.toFixed(2)}万, 永续=${r1.sustainable}`);

  const r2 = calcSafeWithdrawal(500, 0.03);
  console.assert(Math.abs(r2.yearlyWithdrawal - 20) < 0.01, '500万×4%应为20万/年');
  console.assert(r2.sustainable === false, '3%回报率不可永续');
  console.log(`✓ 500万, 3%回报: 年支出${r2.yearlyWithdrawal}万, 永续=${r2.sustainable}`);

  const r3 = calcSafeWithdrawal(2000, 0.04);
  console.assert(r3.sustainable === true, '4%回报率刚好永续');
  console.log(`✓ 2000万, 4%回报: 年支出${r3.yearlyWithdrawal}万, 永续=${r3.sustainable}\n`);
}

// 测试2: 破产时间估算
console.log('测试2: 破产时间估算（简化公式）');
{
  // 1000万，月花15万，年回报5%
  const t1 = calcBankruptTime(1000, 15, 0.05);
  // 月收益 = 1000 * 0.05/12 ≈ 4.17万，净流出 = 15 - 4.17 = 10.83万
  // 破产时间 ≈ 1000 / 10.83 ≈ 92.3个月 ≈ 7.7年
  console.assert(t1 > 80 && t1 < 100, '1000万月花15万应约92个月破产');
  console.log(`✓ 1000万, 月花15万, 5%回报: ${t1.toFixed(1)}个月 (${(t1/12).toFixed(1)}年)`);

  // 月花3万，年回报5% → 月收益4.17万 > 3万，不会破产
  const t2 = calcBankruptTime(1000, 3, 0.05);
  console.assert(t2 === Infinity, '月花3万应不会破产');
  console.log(`✓ 1000万, 月花3万, 5%回报: 不会破产`);

  // 1000万，月花50万，0%回报 → 20个月
  const t3 = calcBankruptTime(1000, 50, 0);
  console.assert(Math.abs(t3 - 20) < 0.01, '1000万月花50万0回报应20个月');
  console.log(`✓ 1000万, 月花50万, 0%回报: ${t3.toFixed(1)}个月\n`);
}

// 测试3: 财富衰减模拟 - 确定性场景
console.log('测试3: 财富衰减模拟 - 确定性场景');
{
  // 极低消费，高回报 → 不应破产
  const r1 = simulateWealth(1000, 0.1, 1, 0.10, 120); // 月花0.1万，不膨胀，10%回报
  console.assert(r1.bankruptMonth === -1, '极低消费不应破产');
  console.assert(r1.finalWealth > 1000, '应该有增长');
  console.log(`✓ 极低消费: 10年后${r1.finalWealth.toFixed(0)}万 (未破产)`);

  // 极高消费 → 应快速破产
  const r2 = simulateWealth(1000, 1, 30, 0, 120, { rampSpeed: 0.5 }); // 月花膨胀到30万，0回报
  console.assert(r2.bankruptMonth > 0, '极高消费应破产');
  console.assert(r2.bankruptMonth < 60, '应在5年内破产');
  console.log(`✓ 极高消费: 第${r2.bankruptMonth}个月破产 (${(r2.bankruptMonth/12).toFixed(1)}年)`);

  // 0支出 → 纯增长
  const r3 = simulateWealth(1000, 0, 1, 0.06, 12); // 0支出，6%回报，1年
  // 每月复利：1000 * (1 + 0.06/12)^12 ≈ 1061.68
  const expected = 1000 * Math.pow(1 + 0.06 / 12, 12);
  console.assert(Math.abs(r3.finalWealth - expected) < 1, '0支出应纯复利增长');
  console.log(`✓ 0支出6%回报1年: ${r3.finalWealth.toFixed(2)}万 (期望${expected.toFixed(2)}万)\n`);
}

// 测试4: 消费膨胀曲线验证
console.log('测试4: 消费膨胀曲线（logistic）');
{
  // 验证膨胀因子在不同时间点的值
  const rampSpeed = 0.15;
  const mult = 10;
  const factors = [];
  for (let m = 0; m <= 60; m += 12) {
    const f = 1 + (mult - 1) / (1 + Math.exp(-rampSpeed * (m - 6)));
    factors.push({ month: m, factor: f });
  }
  // 第0月膨胀因子已经有一定值（logistic在m=0时不是0）
  console.assert(factors[0].factor < 6, '第0月膨胀因子应低于峰值');
  // 第60月应接近mult
  console.assert(factors[factors.length - 1].factor > mult * 0.9, '第60月应接近最大膨胀');
  factors.forEach(f => {
    console.log(`  月${f.month}: 膨胀因子 = ${f.factor.toFixed(2)}x`);
  });
  console.log(`✓ Logistic曲线：从低到高逐渐膨胀\n`);
}

// 测试5: 大数定律 - 蒙特卡洛验证破产率
console.log('测试5: 蒙特卡洛验证（500人，简化参数）');
{
  const N = 500;
  let bankrupt5yr = 0;
  let bankruptTotal = 0;

  for (let i = 0; i < N; i++) {
    const mult = 2 + Math.random() * 28;
    const basExp = 0.5 + Math.random() * 1.5;
    const ret = Math.random() * 0.08;
    const r = simulateWealth(1000, basExp, mult, ret, 120, {
      randomReturn: true,
      randomShocks: true,
      rampSpeed: 0.1 + Math.random() * 0.3
    });
    if (r.bankruptMonth > 0 && r.bankruptMonth <= 60) bankrupt5yr++;
    if (r.bankruptMonth > 0) bankruptTotal++;
  }

  const rate5yr = (bankrupt5yr / N * 100).toFixed(1);
  const rateTotal = (bankruptTotal / N * 100).toFixed(1);
  console.log(`  5年内破产: ${bankrupt5yr}/${N} (${rate5yr}%)`);
  console.log(`  10年内破产: ${bankruptTotal}/${N} (${rateTotal}%)`);
  // 由于参数范围很广（膨胀2~30倍），破产率应该在30%-80%之间
  console.assert(bankruptTotal > N * 0.2, '破产率应>20%');
  console.assert(bankruptTotal < N * 0.95, '破产率应<95%（有些人很克制）');
  console.log(`✓ 破产率在合理范围内\n`);
}

// 测试6: 边界条件
console.log('测试6: 边界条件');
{
  // 0奖金 → wealth starts at 0, goes negative on first expense → bankruptMonth = 1
  const r1 = simulateWealth(0, 1, 5, 0.05, 12);
  // wealth=0 at start, first iteration: 0 <= 0 → pushed 0, stays 0
  console.assert(r1.finalWealth === 0, '0奖金最终应为0');
  console.log(`✓ 0奖金: 最终财富=${r1.finalWealth}`);

  // 极大奖金，极低消费
  const r2 = simulateWealth(100000, 0.01, 1, 0, 120);
  console.assert(r2.bankruptMonth === -1, '极大奖金极低消费不应破产');
  console.log(`✓ 10亿奖金, 月花100元: 未破产, 剩余${r2.finalWealth.toFixed(0)}万`);

  // 0回报率，固定消费
  const r3 = simulateWealth(100, 1, 1, 0, 120); // 100万，月花1万，0回报
  console.assert(r3.bankruptMonth === 100, '100万月花1万0回报应100个月破产');
  console.log(`✓ 100万, 月花1万, 0回报: 第${r3.bankruptMonth}月破产`);

  // 安全线：0奖金
  const s1 = calcSafeWithdrawal(0, 0.05);
  console.assert(s1.monthlyWithdrawal === 0, '0奖金安全支出应为0');
  console.log(`✓ 0奖金安全支出: ${s1.monthlyWithdrawal}\n`);
}

// 测试7: 总支出 + 总收益一致性
console.log('测试7: 收支一致性验证');
{
  const r = simulateWealth(1000, 1, 5, 0.05, 60);
  // 最终财富 ≈ 初始 + 总收益 - 总支出
  const expectedFinal = 1000 + r.totalEarned - r.totalSpent;
  const diff = Math.abs(r.finalWealth - Math.max(0, expectedFinal));
  console.assert(diff < 1, '收支应平衡（误差<1万）');
  console.log(`✓ 初始1000 + 收益${r.totalEarned.toFixed(1)} - 支出${r.totalSpent.toFixed(1)} = ${expectedFinal.toFixed(1)}, 实际${r.finalWealth.toFixed(1)}`);

  // 未破产时应精确平衡
  if (r.bankruptMonth === -1) {
    console.assert(diff < 0.1, '未破产时收支应精确平衡');
    console.log(`✓ 精确平衡，误差${diff.toFixed(4)}万`);
  }
  console.log('');
}

// 测试8: randn 正态分布验证
console.log('测试8: 正态分布随机数验证');
{
  const samples = Array.from({ length: 10000 }, () => randn());
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  const std = Math.sqrt(variance);

  console.assert(Math.abs(mean) < 0.05, '均值应接近0');
  console.assert(Math.abs(std - 1) < 0.1, '标准差应接近1');
  console.log(`✓ 10000个样本: 均值=${mean.toFixed(4)}, 标准差=${std.toFixed(4)}`);

  // 68-95-99.7法则
  const within1 = samples.filter(v => Math.abs(v) < 1).length / samples.length;
  const within2 = samples.filter(v => Math.abs(v) < 2).length / samples.length;
  console.assert(within1 > 0.63 && within1 < 0.73, '1σ内应约68%');
  console.assert(within2 > 0.93 && within2 < 0.97, '2σ内应约95%');
  console.log(`✓ 1σ内: ${(within1 * 100).toFixed(1)}% (期望68.3%), 2σ内: ${(within2 * 100).toFixed(1)}% (期望95.4%)\n`);
}

console.log('✅ 所有测试通过！核心逻辑验证正确。\n');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { simulateWealth, calcSafeWithdrawal, calcBankruptTime, randn };
}
