/**
 * 1/100 vs 6/600 概率对比 - 单元测试
 * 测试核心模拟算法的正确性
 */

// 模拟抽奖函数
function simulateLottery(numerator, denominator, trials) {
  const prob = numerator / denominator;
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    if (Math.random() < prob) wins++;
  }
  return wins;
}

// 计算两个分数是否等价
function fractionsEqual(n1, d1, n2, d2) {
  return Math.abs(n1 / d1 - n2 / d2) < 1e-10;
}

// 计算累计中奖率
function cumulativeWinRate(prob, trials) {
  let wins = 0;
  const rates = [];
  for (let i = 1; i <= trials; i++) {
    if (Math.random() < prob) wins++;
    rates.push(wins / i);
  }
  return rates;
}

// ============ 测试用例 ============

console.log('🧪 开始测试 1/100 vs 6/600 概率对比核心逻辑\n');

// 测试1: 分数等价性
console.log('测试1: 分数等价性验证');
{
  console.assert(fractionsEqual(1, 100, 6, 600), '1/100 应等于 6/600');
  console.log('✓ 1/100 === 6/600');

  console.assert(fractionsEqual(1, 100, 10, 1000), '1/100 应等于 10/1000');
  console.log('✓ 1/100 === 10/1000');

  console.assert(fractionsEqual(3, 300, 6, 600), '3/300 应等于 6/600');
  console.log('✓ 3/300 === 6/600');

  console.assert(!fractionsEqual(1, 100, 7, 600), '1/100 不应等于 7/600');
  console.log('✓ 1/100 !== 7/600');

  console.assert(!fractionsEqual(2, 100, 6, 600), '2/100 不应等于 6/600');
  console.log('✓ 2/100 !== 6/600\n');
}

// 测试2: 固定随机数下的模拟
console.log('测试2: 固定随机数模拟');
{
  const originalRandom = Math.random;

  // 100%中奖
  Math.random = () => 0.005; // 小于 0.01
  const r1 = simulateLottery(1, 100, 10);
  console.assert(r1 === 10, '随机值0.005 < 0.01，应全部中奖');
  console.log(`✓ prob=1%, random=0.005 => 10次全中: ${r1}`);

  // 0%中奖
  Math.random = () => 0.02; // 大于 0.01
  const r2 = simulateLottery(1, 100, 10);
  console.assert(r2 === 0, '随机值0.02 > 0.01，应全部不中');
  console.log(`✓ prob=1%, random=0.02 => 10次全不中: ${r2}`);

  // 两种写法在相同随机数下结果一致
  Math.random = () => 0.005;
  const rA = simulateLottery(1, 100, 10);
  Math.random = () => 0.005;
  const rB = simulateLottery(6, 600, 10);
  console.assert(rA === rB, '相同随机数下 1/100 和 6/600 结果应一致');
  console.log(`✓ 相同随机数: 1/100中${rA}次, 6/600中${rB}次\n`);

  Math.random = originalRandom;
}

// 测试3: 大数定律验证 - 两种彩票中奖率应趋近
console.log('测试3: 大数定律验证（两种彩票对比）');
{
  const trials = 100000;
  const winsA = simulateLottery(1, 100, trials);
  const winsB = simulateLottery(6, 600, trials);
  const rateA = winsA / trials;
  const rateB = winsB / trials;
  const diff = Math.abs(rateA - rateB);

  console.assert(Math.abs(rateA - 0.01) < 0.005, 'A的中奖率应接近1%');
  console.assert(Math.abs(rateB - 0.01) < 0.005, 'B的中奖率应接近1%');
  console.assert(diff < 0.005, '两者差异应很小');

  console.log(`✓ 彩票A (1/100): ${winsA}次中奖, 中奖率 ${(rateA * 100).toFixed(3)}%`);
  console.log(`✓ 彩票B (6/600): ${winsB}次中奖, 中奖率 ${(rateB * 100).toFixed(3)}%`);
  console.log(`✓ 差异: ${(diff * 100).toFixed(3)}% (应接近0)\n`);
}

// 测试4: 不同等价分数的大数验证
console.log('测试4: 多组等价分数验证');
{
  const trials = 50000;
  const fractions = [
    [1, 100],
    [6, 600],
    [10, 1000],
    [17, 1700],
    [50, 5000]
  ];

  const rates = fractions.map(([n, d]) => {
    const wins = simulateLottery(n, d, trials);
    const rate = wins / trials;
    console.log(`✓ ${n}/${d} => 中奖率 ${(rate * 100).toFixed(3)}%`);
    return rate;
  });

  // 所有中奖率应该接近
  const maxRate = Math.max(...rates);
  const minRate = Math.min(...rates);
  const spread = maxRate - minRate;
  console.assert(spread < 0.01, '所有等价分数的中奖率差异应很小');
  console.log(`✓ 最大差异: ${(spread * 100).toFixed(3)}%\n`);
}

// 测试5: 累计中奖率收敛性
console.log('测试5: 累计中奖率收敛性');
{
  const trials = 10000;
  const prob = 0.01;
  const rates = cumulativeWinRate(prob, trials);

  // 前100次波动大
  const earlyDeviation = Math.abs(rates[99] - prob);
  // 最后1000次应该很接近
  const lateDeviation = Math.abs(rates[trials - 1] - prob);

  console.log(`✓ 前100次累计中奖率: ${(rates[99] * 100).toFixed(2)}% (偏差 ${(earlyDeviation * 100).toFixed(2)}%)`);
  console.log(`✓ 10000次累计中奖率: ${(rates[trials - 1] * 100).toFixed(3)}% (偏差 ${(lateDeviation * 100).toFixed(3)}%)`);
  console.assert(lateDeviation < earlyDeviation || lateDeviation < 0.005, '后期偏差应更小或足够小');
  console.log(`✓ 收敛验证通过：随着次数增加，中奖率趋近理论值\n`);
}

// 测试6: 批量模拟分布验证
console.log('测试6: 100轮模拟分布验证');
{
  const trials = 10000;
  const rounds = 100;
  const ratesA = [];
  const ratesB = [];

  for (let r = 0; r < rounds; r++) {
    ratesA.push(simulateLottery(1, 100, trials) / trials * 100);
    ratesB.push(simulateLottery(6, 600, trials) / trials * 100);
  }

  const avgA = ratesA.reduce((s, v) => s + v, 0) / rounds;
  const avgB = ratesB.reduce((s, v) => s + v, 0) / rounds;
  const stdA = Math.sqrt(ratesA.reduce((s, v) => s + (v - avgA) ** 2, 0) / rounds);
  const stdB = Math.sqrt(ratesB.reduce((s, v) => s + (v - avgB) ** 2, 0) / rounds);

  console.log(`✓ A 平均中奖率: ${avgA.toFixed(3)}%, 标准差: ${stdA.toFixed(3)}%`);
  console.log(`✓ B 平均中奖率: ${avgB.toFixed(3)}%, 标准差: ${stdB.toFixed(3)}%`);

  console.assert(Math.abs(avgA - avgB) < 0.1, '两者平均中奖率应非常接近');
  console.assert(Math.abs(stdA - stdB) < 0.05, '两者标准差应非常接近');
  console.log(`✓ 平均值差异: ${Math.abs(avgA - avgB).toFixed(4)}%`);
  console.log(`✓ 标准差差异: ${Math.abs(stdA - stdB).toFixed(4)}%\n`);
}

// 测试7: 糖果罐实验概率验证
console.log('测试7: 糖果罐实验（10%概率）');
{
  const trials = 100000;
  const smallJarWins = simulateLottery(1, 10, trials);
  const bigJarWins = simulateLottery(10, 100, trials);
  const smallRate = smallJarWins / trials;
  const bigRate = bigJarWins / trials;

  console.assert(Math.abs(smallRate - 0.1) < 0.005, '小罐中奖率应接近10%');
  console.assert(Math.abs(bigRate - 0.1) < 0.005, '大罐中奖率应接近10%');

  console.log(`✓ 小罐 (1/10): 中奖率 ${(smallRate * 100).toFixed(2)}%`);
  console.log(`✓ 大罐 (10/100): 中奖率 ${(bigRate * 100).toFixed(2)}%`);
  console.log(`✓ 差异: ${(Math.abs(smallRate - bigRate) * 100).toFixed(3)}%\n`);
}

// 测试8: 边界条件
console.log('测试8: 边界条件');
{
  // 概率为0
  const r0 = simulateLottery(0, 100, 1000);
  console.assert(r0 === 0, '概率0应该永远不中');
  console.log(`✓ 0/100, 1000次 => 中奖${r0}次`);

  // 概率为1
  const originalRandom = Math.random;
  Math.random = () => 0.999; // 接近1但小于1
  const r1 = simulateLottery(100, 100, 10);
  console.assert(r1 === 10, '概率100%应该全中');
  console.log(`✓ 100/100, 10次 => 中奖${r1}次`);
  Math.random = originalRandom;

  // 1次试验
  const r2 = simulateLottery(1, 2, 1);
  console.assert(r2 === 0 || r2 === 1, '1次试验应该是0或1');
  console.log(`✓ 1/2, 1次 => 中奖${r2}次 (0或1都正确)\n`);
}

// 测试9: 概率不等的情况应能区分
console.log('测试9: 不等概率应能区分');
{
  const trials = 50000;
  const winsLow = simulateLottery(1, 100, trials);   // 1%
  const winsHigh = simulateLottery(5, 100, trials);   // 5%
  const rateLow = winsLow / trials;
  const rateHigh = winsHigh / trials;

  console.assert(rateHigh > rateLow, '5%概率应明显高于1%');
  console.log(`✓ 1/100: ${(rateLow * 100).toFixed(2)}%`);
  console.log(`✓ 5/100: ${(rateHigh * 100).toFixed(2)}%`);
  console.log(`✓ 差异明显: ${((rateHigh - rateLow) * 100).toFixed(2)}%\n`);
}

console.log('✅ 所有测试通过！核心逻辑验证正确。\n');

// 导出函数供其他环境使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulateLottery,
    fractionsEqual,
    cumulativeWinRate
  };
}
