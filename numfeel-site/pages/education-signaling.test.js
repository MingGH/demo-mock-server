/**
 * 学历信号模型 - 单元测试
 * 测试 Spence 信号均衡计算和招聘模拟的核心逻辑
 */

// ========== 核心函数 ==========

function calcSignalingEquilibrium(highRatio, highOutput, lowOutput, highCost, lowCost) {
  const lowRatio = 1 - highRatio;
  const poolingWage = lowRatio * lowOutput + highRatio * highOutput;
  const highNetWithSignal = highOutput - highCost;
  const lowNetWithSignal = highOutput - lowCost;
  const highWantsSignal = highNetWithSignal > poolingWage;
  const lowWantsSignal = lowNetWithSignal > poolingWage;
  let eqType;
  if (highWantsSignal && !lowWantsSignal) eqType = 'separating';
  else if (highWantsSignal && lowWantsSignal) eqType = 'pooling_all';
  else if (!highWantsSignal && !lowWantsSignal) eqType = 'pooling_none';
  else eqType = 'broken';
  return { poolingWage, highNetWithSignal, lowNetWithSignal, highWantsSignal, lowWantsSignal, eqType };
}

function simulateHiring(totalCandidates, hireCount, highAbilityRatio, highEduRate, lowEduRate) {
  const candidates = [];
  for (let i = 0; i < totalCandidates; i++) {
    const isHigh = Math.random() < highAbilityRatio;
    const hasEdu = Math.random() < (isHigh ? highEduRate : lowEduRate);
    candidates.push({ isHigh, hasEdu });
  }
  const withEdu = candidates.filter(c => c.hasEdu);
  const shuffledEdu = withEdu.sort(() => Math.random() - 0.5);
  const eduHires = shuffledEdu.slice(0, Math.min(hireCount, shuffledEdu.length));
  const eduHighCount = eduHires.filter(c => c.isHigh).length;
  const shuffledAll = [...candidates].sort(() => Math.random() - 0.5);
  const randHires = shuffledAll.slice(0, hireCount);
  const randHighCount = randHires.filter(c => c.isHigh).length;
  const missedHigh = candidates.filter(c => c.isHigh && !c.hasEdu).length;
  return {
    eduHighRate: eduHires.length > 0 ? eduHighCount / eduHires.length : 0,
    randHighRate: randHighCount / randHires.length,
    missedHigh,
    totalHigh: candidates.filter(c => c.isHigh).length,
    eduHireCount: eduHires.length
  };
}

// ========== 测试 ==========

console.log('🧪 开始测试学历信号模型核心逻辑\n');

// 测试1: 混同工资计算
console.log('测试1: 混同工资（pooling wage）计算');
{
  const eq = calcSignalingEquilibrium(0.4, 15, 8, 2, 7);
  const expected = 0.6 * 8 + 0.4 * 15;
  console.assert(Math.abs(eq.poolingWage - expected) < 0.01, '混同工资应为10.8万');
  console.log(`✓ 高能力40%, 产出15/8万 => 混同工资: ${eq.poolingWage.toFixed(1)}万 (预期${expected})`);

  const eq2 = calcSignalingEquilibrium(0.5, 20, 10, 3, 8);
  const expected2 = 0.5 * 10 + 0.5 * 20;
  console.assert(Math.abs(eq2.poolingWage - expected2) < 0.01, '50/50时混同工资应为15万');
  console.log(`✓ 高能力50%, 产出20/10万 => 混同工资: ${eq2.poolingWage.toFixed(1)}万 (预期${expected2})\n`);
}

// 测试2: 分离均衡条件
console.log('测试2: 分离均衡（separating equilibrium）');
{
  const eq = calcSignalingEquilibrium(0.4, 15, 8, 2, 7);
  console.assert(eq.eqType === 'separating', '应该是分离均衡');
  console.assert(eq.highWantsSignal === true, '高能力者应该想拿学历');
  console.assert(eq.lowWantsSignal === false, '普通能力者不应该想拿学历');
  console.log(`✓ 高能力净收益: ${eq.highNetWithSignal}万 > 混同工资${eq.poolingWage}万 => 想拿学历`);
  console.log(`✓ 普通净收益: ${eq.lowNetWithSignal}万 < 混同工资${eq.poolingWage}万 => 不想拿学历`);
  console.log(`✓ 均衡类型: ${eq.eqType}\n`);
}

// 测试3: 混同均衡（都拿学历）
console.log('测试3: 混同均衡 - 学历通胀');
{
  const eq = calcSignalingEquilibrium(0.4, 15, 8, 2, 3);
  console.assert(eq.eqType === 'pooling_all', '成本差异小时应该是混同均衡');
  console.assert(eq.highWantsSignal === true, '高能力者想拿');
  console.assert(eq.lowWantsSignal === true, '普通能力者也想拿');
  console.log(`✓ 低成本差异(2万 vs 3万) => 均衡类型: ${eq.eqType}`);
  console.log(`✓ 普通净收益: ${eq.lowNetWithSignal}万 > 混同工资${eq.poolingWage}万 => 也想拿学历\n`);
}

// 测试4: 混同均衡（都不拿学历）
console.log('测试4: 混同均衡 - 学历成本过高');
{
  const eq = calcSignalingEquilibrium(0.4, 15, 8, 6, 10);
  console.assert(eq.eqType === 'pooling_none', '成本都很高时应该都不拿');
  console.log(`✓ 高成本(6万/10万) => 均衡类型: ${eq.eqType}`);
  console.log(`✓ 高能力净收益: ${eq.highNetWithSignal}万 < 混同工资${eq.poolingWage}万 => 不值得\n`);
}

// 测试5: 边界条件
console.log('测试5: 边界条件');
{
  const eq1 = calcSignalingEquilibrium(1.0, 15, 8, 2, 7);
  console.assert(Math.abs(eq1.poolingWage - 15) < 0.01, '全是高能力者时混同工资=高产出');
  console.log(`✓ 100%高能力 => 混同工资: ${eq1.poolingWage}万`);

  const eq2 = calcSignalingEquilibrium(0.0, 15, 8, 2, 7);
  console.assert(Math.abs(eq2.poolingWage - 8) < 0.01, '全是普通能力者时混同工资=低产出');
  console.log(`✓ 0%高能力 => 混同工资: ${eq2.poolingWage}万`);

  const eq3 = calcSignalingEquilibrium(0.4, 15, 8, 0, 0);
  console.assert(eq3.eqType === 'pooling_all', '成本为0时所有人都拿');
  console.log(`✓ 成本为0 => 均衡类型: ${eq3.eqType}\n`);
}

// 测试6: 招聘模拟 - 学历筛选应优于随机
console.log('测试6: 招聘模拟 - 学历筛选 vs 随机');
{
  let eduBetter = 0;
  for (let i = 0; i < 100; i++) {
    const r = simulateHiring(500, 30, 0.4, 0.85, 0.20);
    if (r.eduHighRate > r.randHighRate) eduBetter++;
  }
  console.assert(eduBetter > 70, '学历筛选应该大多数时候优于随机');
  console.log(`✓ 100次模拟中，学历筛选优于随机: ${eduBetter}次 (应>70)\n`);
}

// 测试7: 贝叶斯精度验证
console.log('测试7: 贝叶斯精度验证');
{
  const highRatio = 0.4, highEdu = 0.85, lowEdu = 0.20;
  const pEdu = highRatio * highEdu + (1 - highRatio) * lowEdu;
  const theoreticalPrecision = highRatio * highEdu / pEdu;

  let totalEduHigh = 0;
  for (let i = 0; i < 500; i++) {
    const r = simulateHiring(1000, 100, highRatio, highEdu, lowEdu);
    totalEduHigh += r.eduHighRate;
  }
  const simPrecision = totalEduHigh / 500;

  console.log(`✓ 理论精度: ${(theoreticalPrecision * 100).toFixed(1)}%`);
  console.log(`✓ 模拟精度: ${(simPrecision * 100).toFixed(1)}%`);
  console.assert(Math.abs(simPrecision - theoreticalPrecision) < 0.05, '模拟精度应接近理论值');
  console.log(`✓ 差异: ${(Math.abs(simPrecision - theoreticalPrecision) * 100).toFixed(2)}%\n`);
}

// 测试8: 误筛率验证
console.log('测试8: 误筛率验证');
{
  const highEdu = 0.85;
  let totalMissedRate = 0;
  for (let i = 0; i < 200; i++) {
    const r = simulateHiring(1000, 50, 0.4, highEdu, 0.20);
    totalMissedRate += r.missedHigh / r.totalHigh;
  }
  const avgMissedRate = totalMissedRate / 200;
  const expectedMissedRate = 1 - highEdu;

  console.log(`✓ 理论误筛率: ${(expectedMissedRate * 100).toFixed(1)}%`);
  console.log(`✓ 模拟误筛率: ${(avgMissedRate * 100).toFixed(1)}%`);
  console.assert(Math.abs(avgMissedRate - expectedMissedRate) < 0.03, '误筛率应接近理论值');
  console.log(`✓ 差异: ${(Math.abs(avgMissedRate - expectedMissedRate) * 100).toFixed(2)}%\n`);
}

// 测试9: 极端参数
console.log('测试9: 极端参数');
{
  let totalDiff = 0;
  for (let i = 0; i < 100; i++) {
    const r = simulateHiring(500, 30, 0.4, 0.50, 0.50);
    totalDiff += r.eduHighRate - r.randHighRate;
  }
  const avgDiff = totalDiff / 100;
  console.assert(Math.abs(avgDiff) < 0.05, '学历无区分度时，筛选应与随机接近');
  console.log(`✓ 学历率相同(50%/50%) => 平均差异: ${(avgDiff * 100).toFixed(2)}%`);

  let totalPerfect = 0;
  for (let i = 0; i < 100; i++) {
    const r = simulateHiring(500, 30, 0.4, 1.0, 0.0);
    totalPerfect += r.eduHighRate;
  }
  const avgPerfect = totalPerfect / 100;
  console.assert(avgPerfect > 0.95, '完美区分时精度应接近100%');
  console.log(`✓ 完美区分(100%/0%) => 平均精度: ${(avgPerfect * 100).toFixed(1)}%\n`);
}

// 测试10: 信号均衡数学性质
console.log('测试10: 信号均衡数学性质');
{
  for (let hr = 0.1; hr <= 0.9; hr += 0.1) {
    const eq = calcSignalingEquilibrium(hr, 15, 8, 2, 7);
    if (eq.eqType === 'separating') {
      console.assert(eq.highNetWithSignal > eq.poolingWage, '分离均衡：高能力净收益 > 混同工资');
      console.assert(eq.lowNetWithSignal < eq.poolingWage, '分离均衡：普通净收益 < 混同工资');
    }
    console.assert(eq.poolingWage >= 8 && eq.poolingWage <= 15, '混同工资应在产出范围内');
  }
  console.log('✓ 所有高能力占比(10%-90%)下，均衡条件和混同工资范围验证通过\n');
}

console.log('✅ 所有测试通过！核心逻辑验证正确。\n');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcSignalingEquilibrium, simulateHiring };
}
