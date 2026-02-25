/**
 * 反直觉概率论 II - 单元测试
 * 测试五个概率悖论的核心算法
 * 运行: node pages/counter-intuitive-probability-2.test.js
 */

// ============ 核心算法 ============

// 非传递骰子：计算左骰赢右骰的理论概率
function diceWinProb(left, right) {
  let wins = 0, total = 0;
  for (const l of left) {
    for (const r of right) {
      total++;
      if (l > r) wins++;
    }
  }
  return wins / total;
}

// 男孩女孩悖论：理论概率
function boyGirlTheory(condition) {
  // 枚举所有可能: BB, BG, GB, GG 各概率1/4
  const combos = [['B','B'], ['B','G'], ['G','B'], ['G','G']];
  let valid = 0, bothBoys = 0;
  for (const [c1, c2] of combos) {
    let match = false;
    if (condition === 'elder' && c1 === 'B') match = true;
    if (condition === 'atleast' && (c1 === 'B' || c2 === 'B')) match = true;
    if (match) {
      valid++;
      if (c1 === 'B' && c2 === 'B') bothBoys++;
    }
  }
  return bothBoys / valid;
}

// 假阳性：贝叶斯计算阳性预测值
function bayesPPV(prevalence, sensitivity, specificity) {
  const truePos = prevalence * sensitivity;
  const falsePos = (1 - prevalence) * (1 - specificity);
  return truePos / (truePos + falsePos);
}

// 集齐优惠券：理论期望
function couponExpected(n) {
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += 1 / i;
  return n * sum;
}

// 集齐优惠券：单次模拟
function couponSimOnce(n) {
  const collected = new Set();
  let bought = 0;
  while (collected.size < n) {
    collected.add(Math.floor(Math.random() * n));
    bought++;
  }
  return bought;
}

// 睡美人：模拟多次实验，返回正面醒来占比
function sleepingBeautySim(experiments) {
  let wakeups = 0, headsWake = 0;
  for (let i = 0; i < experiments; i++) {
    if (Math.random() < 0.5) {
      wakeups += 1;
      headsWake += 1;
    } else {
      wakeups += 2;
    }
  }
  return headsWake / wakeups;
}

// ============ 测试 ============

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { console.log('  ✓ ' + msg); passed++; }
  else { console.log('  ✗ ' + msg); failed++; }
}

console.log('🧪 反直觉概率论 II - 单元测试\n');

// 测试1: 非传递骰子理论概率
console.log('测试1: 非传递骰子理论概率');
{
  const A = [2, 2, 4, 4, 9, 9];
  const B = [1, 1, 6, 6, 8, 8];
  const C = [3, 3, 5, 5, 7, 7];

  const pAB = diceWinProb(A, B);
  const pBC = diceWinProb(B, C);
  const pCA = diceWinProb(C, A);

  assert(Math.abs(pAB - 5/9) < 0.001, `A赢B概率 = ${pAB.toFixed(4)} ≈ 5/9 = ${(5/9).toFixed(4)}`);
  assert(Math.abs(pBC - 5/9) < 0.001, `B赢C概率 = ${pBC.toFixed(4)} ≈ 5/9 = ${(5/9).toFixed(4)}`);
  assert(Math.abs(pCA - 5/9) < 0.001, `C赢A概率 = ${pCA.toFixed(4)} ≈ 5/9 = ${(5/9).toFixed(4)}`);

  // 验证非传递性
  assert(pAB > 0.5 && pBC > 0.5 && pCA > 0.5, '非传递性成立: A>B, B>C, C>A 同时成立');
  console.log('');
}

// 测试2: 非传递骰子蒙特卡洛验证
console.log('测试2: 非传递骰子蒙特卡洛验证');
{
  const A = [2, 2, 4, 4, 9, 9];
  const B = [1, 1, 6, 6, 8, 8];
  const trials = 100000;
  let aWins = 0;
  for (let i = 0; i < trials; i++) {
    const a = A[Math.floor(Math.random() * 6)];
    const b = B[Math.floor(Math.random() * 6)];
    if (a > b) aWins++;
  }
  const simRate = aWins / trials;
  assert(Math.abs(simRate - 5/9) < 0.02, `模拟A赢B概率 = ${(simRate*100).toFixed(1)}% ≈ ${(5/9*100).toFixed(1)}%`);
  console.log('');
}

// 测试3: 男孩女孩悖论理论值
console.log('测试3: 男孩女孩悖论理论值');
{
  const elderProb = boyGirlTheory('elder');
  const atleastProb = boyGirlTheory('atleast');

  assert(Math.abs(elderProb - 0.5) < 0.001, `老大是男孩 → 双男概率 = ${elderProb} = 1/2`);
  assert(Math.abs(atleastProb - 1/3) < 0.001, `至少一个男孩 → 双男概率 = ${atleastProb.toFixed(4)} = 1/3`);
  console.log('');
}

// 测试4: 男孩女孩蒙特卡洛验证
console.log('测试4: 男孩女孩蒙特卡洛验证');
{
  const trials = 100000;
  let elderTotal = 0, elderBoth = 0;
  let atleastTotal = 0, atleastBoth = 0;

  for (let i = 0; i < trials; i++) {
    const c1 = Math.random() < 0.5 ? 'B' : 'G';
    const c2 = Math.random() < 0.5 ? 'B' : 'G';
    if (c1 === 'B') {
      elderTotal++;
      if (c2 === 'B') elderBoth++;
    }
    if (c1 === 'B' || c2 === 'B') {
      atleastTotal++;
      if (c1 === 'B' && c2 === 'B') atleastBoth++;
    }
  }

  const elderRate = elderBoth / elderTotal;
  const atleastRate = atleastBoth / atleastTotal;
  assert(Math.abs(elderRate - 0.5) < 0.02, `模拟"老大男孩"双男率 = ${(elderRate*100).toFixed(1)}% ≈ 50%`);
  assert(Math.abs(atleastRate - 1/3) < 0.02, `模拟"至少一个男孩"双男率 = ${(atleastRate*100).toFixed(1)}% ≈ 33.3%`);
  console.log('');
}

// 测试5: 假阳性贝叶斯计算
console.log('测试5: 假阳性贝叶斯计算');
{
  // 经典案例: 1%发病率, 99%灵敏度, 99%特异度
  const ppv1 = bayesPPV(0.01, 0.99, 0.99);
  assert(Math.abs(ppv1 - 0.5) < 0.01, `1%发病率,99%准确率 → PPV = ${(ppv1*100).toFixed(1)}% ≈ 50%`);

  // 高发病率
  const ppv2 = bayesPPV(0.1, 0.99, 0.99);
  assert(ppv2 > 0.9, `10%发病率,99%准确率 → PPV = ${(ppv2*100).toFixed(1)}% > 90%`);

  // 低特异度
  const ppv3 = bayesPPV(0.01, 0.99, 0.90);
  assert(ppv3 < 0.1, `1%发病率,90%特异度 → PPV = ${(ppv3*100).toFixed(1)}% < 10%`);

  // 极端: 50%发病率
  const ppv4 = bayesPPV(0.5, 0.99, 0.99);
  assert(Math.abs(ppv4 - 0.99) < 0.01, `50%发病率 → PPV = ${(ppv4*100).toFixed(1)}% ≈ 99%`);
  console.log('');
}

// 测试6: 假阳性蒙特卡洛验证
console.log('测试6: 假阳性蒙特卡洛验证');
{
  const prevalence = 0.01, sensitivity = 0.99, specificity = 0.99;
  const trials = 200000;
  let truePos = 0, falsePos = 0;

  for (let i = 0; i < trials; i++) {
    const sick = Math.random() < prevalence;
    if (sick && Math.random() < sensitivity) truePos++;
    if (!sick && Math.random() > specificity) falsePos++;
  }

  const simPPV = truePos / (truePos + falsePos);
  assert(Math.abs(simPPV - 0.5) < 0.05, `模拟PPV = ${(simPPV*100).toFixed(1)}% ≈ 50%`);
  console.log('');
}

// 测试7: 集齐优惠券理论期望
console.log('测试7: 集齐优惠券理论期望');
{
  assert(Math.abs(couponExpected(1) - 1) < 0.001, `1种卡片期望 = ${couponExpected(1).toFixed(2)} = 1`);
  assert(Math.abs(couponExpected(2) - 3) < 0.001, `2种卡片期望 = ${couponExpected(2).toFixed(2)} = 3`);
  assert(Math.abs(couponExpected(5) - 11.4167) < 0.01, `5种卡片期望 = ${couponExpected(5).toFixed(2)} ≈ 11.42`);
  assert(Math.abs(couponExpected(10) - 29.2897) < 0.01, `10种卡片期望 = ${couponExpected(10).toFixed(2)} ≈ 29.29`);
  console.log('');
}

// 测试8: 集齐优惠券蒙特卡洛验证
console.log('测试8: 集齐优惠券蒙特卡洛验证');
{
  const n = 5;
  const rounds = 50000;
  let totalBought = 0;
  for (let r = 0; r < rounds; r++) {
    totalBought += couponSimOnce(n);
  }
  const simAvg = totalBought / rounds;
  const theory = couponExpected(n);
  assert(Math.abs(simAvg - theory) < 0.5, `模拟5种卡片平均 = ${simAvg.toFixed(2)} ≈ 理论 ${theory.toFixed(2)}`);
  console.log('');
}

// 测试9: 睡美人问题模拟
console.log('测试9: 睡美人问题模拟');
{
  const ratio = sleepingBeautySim(100000);
  assert(Math.abs(ratio - 1/3) < 0.02, `正面醒来占比 = ${(ratio*100).toFixed(1)}% ≈ 33.3% (1/3派)`);
  console.log('');
}

// 测试10: 边界条件
console.log('测试10: 边界条件');
{
  // 骰子全相同
  const same = diceWinProb([5,5,5,5,5,5], [5,5,5,5,5,5]);
  assert(same === 0, `相同骰子胜率 = ${same} (平局不算赢)`);

  // 一方完全碾压
  const crush = diceWinProb([10,10,10,10,10,10], [1,1,1,1,1,1]);
  assert(crush === 1, `[10,10,...] vs [1,1,...] 胜率 = ${crush}`);

  // 集齐1种
  const one = couponSimOnce(1);
  assert(one === 1, `1种卡片只需买 ${one} 包`);

  // PPV边界
  const ppv0 = bayesPPV(0, 0.99, 0.99);
  assert(ppv0 === 0 || isNaN(ppv0), `发病率0 → PPV = ${ppv0}`);

  const ppv1 = bayesPPV(1, 0.99, 0.99);
  assert(ppv1 === 1, `发病率100% → PPV = ${ppv1}`);
  console.log('');
}

// 汇总
console.log('═'.repeat(40));
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
if (failed === 0) {
  console.log('🎉 所有测试通过！');
} else {
  console.log('⚠️ 有测试失败，请检查。');
  process.exit(1);
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { diceWinProb, boyGirlTheory, bayesPPV, couponExpected, couponSimOnce, sleepingBeautySim };
}
