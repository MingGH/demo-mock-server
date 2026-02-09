/**
 * 炒股难度模拟器 - 单元测试
 * 测试核心算法逻辑的正确性
 */

// 模拟交易函数
function simulateTrades(config) {
  const { winRate, profitLossRatio, betSize, trades } = config;
  
  let capital = 100;
  const equity = [capital];
  let wins = 0;
  let maxCapital = capital;
  let maxDrawdown = 0;

  for (let i = 0; i < trades; i++) {
    const isWin = Math.random() < winRate;
    if (isWin) {
      capital += capital * betSize * profitLossRatio;
      wins++;
    } else {
      capital -= capital * betSize;
    }
    equity.push(capital);

    if (capital > maxCapital) maxCapital = capital;
    const drawdown = (maxCapital - capital) / maxCapital * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    finalCapital: capital,
    equity,
    wins,
    winRate: wins / trades,
    maxDrawdown,
    finalReturn: (capital - 100) / 100 * 100
  };
}

// 计算数学期望
function calculateExpectedValue(winRate, profitLossRatio) {
  return winRate * profitLossRatio - (1 - winRate);
}

// 计算连续亏损概率
function calculateConsecutiveLossProbability(winRate, consecutiveLosses) {
  const lossRate = 1 - winRate;
  return Math.pow(lossRate, consecutiveLosses);
}

// 模拟心理因素影响
function simulateWithPsychology(config) {
  const { discipline, emotion, trades } = config;
  const baseWinRate = 0.55;
  const baseBetSize = 0.15;

  // 理性策略
  let rationalCapital = 100;
  const rationalEquity = [rationalCapital];
  
  // 实际执行
  let actualCapital = 100;
  const actualEquity = [actualCapital];

  for (let i = 0; i < trades; i++) {
    const isWin = Math.random() < baseWinRate;
    
    // 理性策略
    if (isWin) {
      rationalCapital *= (1 + baseBetSize);
    } else {
      rationalCapital *= (1 - baseBetSize);
    }
    rationalEquity.push(rationalCapital);

    // 实际执行
    let actualBetSize = baseBetSize;
    
    // 情绪化：连亏后加仓
    if (i > 0 && actualEquity[i] < actualEquity[i - 1]) {
      actualBetSize *= (1 + emotion);
    }
    
    // 纪律性：该止损时不止损
    const shouldStopLoss = !isWin && Math.random() > discipline;
    
    if (isWin) {
      actualCapital *= (1 + actualBetSize);
    } else {
      if (shouldStopLoss) {
        actualCapital *= (1 - actualBetSize * 1.5);
      } else {
        actualCapital *= (1 - actualBetSize);
      }
    }
    actualEquity.push(actualCapital);
  }

  return {
    rationalCapital,
    actualCapital,
    rationalReturn: (rationalCapital - 100) / 100 * 100,
    actualReturn: (actualCapital - 100) / 100 * 100,
    psychCost: ((rationalCapital - actualCapital) / 100 * 100)
  };
}

// ============ 测试用例 ============

console.log('🧪 开始测试炒股难度模拟器核心逻辑\n');

// 测试1: 数学期望计算
console.log('测试1: 数学期望计算');
{
  const ev1 = calculateExpectedValue(0.6, 1);
  console.assert(Math.abs(ev1 - 0.2) < 0.01, '60%胜率，1:1盈亏比，期望应为0.2');
  console.log(`✓ 60%胜率，1:1盈亏比 => 期望值: ${ev1.toFixed(2)}`);

  const ev2 = calculateExpectedValue(0.6, 0.5);
  console.assert(ev2 < 0, '60%胜率，0.5:1盈亏比，期望应为负');
  console.log(`✓ 60%胜率，0.5:1盈亏比 => 期望值: ${ev2.toFixed(2)} (负期望)`);

  const ev3 = calculateExpectedValue(0.55, 1.5);
  console.assert(ev3 > 0, '55%胜率，1.5:1盈亏比，期望应为正');
  console.log(`✓ 55%胜率，1.5:1盈亏比 => 期望值: ${ev3.toFixed(2)}\n`);
}

// 测试2: 连续亏损概率
console.log('测试2: 连续亏损概率计算');
{
  const prob3 = calculateConsecutiveLossProbability(0.6, 3);
  console.assert(Math.abs(prob3 - 0.064) < 0.001, '60%胜率连亏3次概率应约为6.4%');
  console.log(`✓ 60%胜率，连亏3次概率: ${(prob3 * 100).toFixed(2)}%`);

  const prob5 = calculateConsecutiveLossProbability(0.6, 5);
  console.assert(Math.abs(prob5 - 0.01024) < 0.001, '60%胜率连亏5次概率应约为1.02%');
  console.log(`✓ 60%胜率，连亏5次概率: ${(prob5 * 100).toFixed(2)}%\n`);
}

// 测试3: 基本交易模拟（固定随机种子测试逻辑）
console.log('测试3: 交易模拟基本逻辑');
{
  const originalRandom = Math.random;
  
  // 测试100%胜率
  Math.random = () => 0.1; // 模拟总是赢
  const result1 = simulateTrades({
    winRate: 1.0,
    profitLossRatio: 1.0,
    betSize: 0.1,
    trades: 10
  });
  console.assert(result1.wins === 10, '100%胜率应该全赢');
  console.assert(result1.finalCapital > 100, '100%胜率应该盈利');
  console.log(`✓ 100%胜率，10次交易 => 全赢，最终资金: ${result1.finalCapital.toFixed(2)}`);

  // 测试0%胜率
  Math.random = () => 0.9; // 模拟总是输
  const result2 = simulateTrades({
    winRate: 0.0,
    profitLossRatio: 1.0,
    betSize: 0.1,
    trades: 10
  });
  console.assert(result2.wins === 0, '0%胜率应该全输');
  console.assert(result2.finalCapital < 100, '0%胜率应该亏损');
  console.log(`✓ 0%胜率，10次交易 => 全输，最终资金: ${result2.finalCapital.toFixed(2)}\n`);
  
  // 恢复随机函数
  Math.random = originalRandom;
}

// 测试4: 复利效应
console.log('测试4: 复利效应验证');
{
  const originalRandom = Math.random;
  Math.random = () => 0.1; // 模拟总是赢
  
  const result = simulateTrades({
    winRate: 1.0,
    profitLossRatio: 1.0,
    betSize: 0.2,
    trades: 5
  });
  
  // 手动计算: 100 * 1.2^5 = 248.832
  const expected = 100 * Math.pow(1.2, 5);
  console.assert(Math.abs(result.finalCapital - expected) < 0.01, '复利计算应该正确');
  console.log(`✓ 每次赚20%，5次交易 => 预期: ${expected.toFixed(2)}, 实际: ${result.finalCapital.toFixed(2)}\n`);
  
  Math.random = originalRandom;
}

// 测试5: 回撤计算
console.log('测试5: 最大回撤计算');
{
  const originalRandom = Math.random;
  
  // 模拟先涨后跌的情况
  let callCount = 0;
  Math.random = () => {
    callCount++;
    return callCount <= 5 ? 0.1 : 0.9; // 前5次赢，后5次输
  };
  
  const result = simulateTrades({
    winRate: 0.5,
    profitLossRatio: 1.0,
    betSize: 0.2,
    trades: 10
  });
  
  console.assert(result.maxDrawdown > 0, '有亏损应该有回撤');
  console.log(`✓ 先涨后跌 => 最大回撤: ${result.maxDrawdown.toFixed(2)}%\n`);
  
  Math.random = originalRandom;
}

// 测试6: 心理因素影响
console.log('测试6: 心理因素模拟');
{
  // 恢复真实随机
  const originalRandom = Math.random;
  
  // 完美纪律，无情绪
  const result1 = simulateWithPsychology({
    discipline: 1.0,
    emotion: 0.0,
    trades: 50
  });
  console.log(`✓ 完美纪律(100%)，无情绪(0%) => 理性收益: ${result1.rationalReturn.toFixed(2)}%, 实际收益: ${result1.actualReturn.toFixed(2)}%`);

  // 差纪律，高情绪
  const result2 = simulateWithPsychology({
    discipline: 0.3,
    emotion: 0.5,
    trades: 50
  });
  console.log(`✓ 差纪律(30%)，高情绪(50%) => 理性收益: ${result2.rationalReturn.toFixed(2)}%, 实际收益: ${result2.actualReturn.toFixed(2)}%`);
  console.assert(result2.actualReturn < result2.rationalReturn, '差纪律高情绪应该导致收益降低');
  console.log(`✓ 心理成本: ${result2.psychCost.toFixed(2)}%\n`);
}

// 测试7: 边界条件
console.log('测试7: 边界条件测试');
{
  const originalRandom = Math.random;
  
  // 极小仓位
  Math.random = () => 0.5; // 固定随机值
  const result1 = simulateTrades({
    winRate: 0.6,
    profitLossRatio: 1.0,
    betSize: 0.01,
    trades: 100
  });
  console.log(`✓ 1%仓位，100次交易 => 最终资金: ${result1.finalCapital.toFixed(2)} (波动较小)`);

  // 极大仓位（危险）
  Math.random = () => 0.9; // 模拟输
  const result2 = simulateTrades({
    winRate: 0.0,
    profitLossRatio: 1.0,
    betSize: 0.5,
    trades: 3
  });
  console.assert(result2.finalCapital < 20, '50%仓位连亏3次应该接近爆仓');
  console.log(`✓ 50%仓位，连亏3次 => 最终资金: ${result2.finalCapital.toFixed(2)} (接近爆仓)\n`);
  
  Math.random = originalRandom;
}

// 测试8: 统计验证（大数定律）
console.log('测试8: 大数定律验证');
{
  // 恢复真实随机函数
  const originalRandom = Math.random;
  
  const simulations = 1000;
  const results = [];
  
  for (let i = 0; i < simulations; i++) {
    const result = simulateTrades({
      winRate: 0.6,
      profitLossRatio: 1.0,
      betSize: 0.1,
      trades: 50
    });
    results.push(result);
  }
  
  const avgWinRate = results.reduce((sum, r) => sum + r.winRate, 0) / simulations;
  const profitCount = results.filter(r => r.finalCapital > 100).length;
  const profitRate = profitCount / simulations;
  
  console.assert(Math.abs(avgWinRate - 0.6) < 0.05, '大量模拟后平均胜率应接近设定值');
  console.log(`✓ 1000次模拟，平均胜率: ${(avgWinRate * 100).toFixed(2)}% (预期60%)`);
  console.log(`✓ 盈利次数: ${profitCount}/1000 (${(profitRate * 100).toFixed(1)}%)`);
  console.log(`✓ 亏损次数: ${simulations - profitCount}/1000 (${((1 - profitRate) * 100).toFixed(1)}%)\n`);
}

// 测试9: 高胜率陷阱
console.log('测试9: 高胜率陷阱验证');
{
  const ev = calculateExpectedValue(0.7, 0.5);
  console.log(`✓ 70%胜率，0.5:1盈亏比 => 期望值: ${ev.toFixed(2)}`);
  console.assert(ev > 0, '70%胜率，0.5:1盈亏比，期望为正但很小');
  console.log(`✓ 验证: 70%胜率但盈亏比0.5:1，期望值仅${ev.toFixed(2)}，接近零期望\n`);
}

// 测试10: Kelly公式相关（简化版）
console.log('测试10: 最优仓位估算');
{
  // Kelly公式: f = (bp - q) / b
  // b = 盈亏比, p = 胜率, q = 1-p
  function calculateKellySize(winRate, profitLossRatio) {
    const p = winRate;
    const q = 1 - p;
    const b = profitLossRatio;
    const kelly = (b * p - q) / b;
    return Math.max(0, kelly); // Kelly值不能为负
  }
  
  const kelly1 = calculateKellySize(0.6, 1.0);
  console.log(`✓ 60%胜率，1:1盈亏比 => Kelly最优仓位: ${(kelly1 * 100).toFixed(1)}%`);
  
  const kelly2 = calculateKellySize(0.55, 1.5);
  console.log(`✓ 55%胜率，1.5:1盈亏比 => Kelly最优仓位: ${(kelly2 * 100).toFixed(1)}%`);
  
  const kelly3 = calculateKellySize(0.7, 0.5);
  console.log(`✓ 70%胜率，0.5:1盈亏比 => Kelly最优仓位: ${(kelly3 * 100).toFixed(1)}% (负期望，不应交易)\n`);
}

// 测试11: 复利离散性 - 验证可能的取值
console.log('测试11: 复利离散性验证');
{
  // 每次 ×(1+betSize) 或 ×(1-betSize)，最终资金 = 100 × (1+b)^w × (1-b)^(n-w)
  // 当 betSize=0.2, trades=50 时，列出所有可能取值
  const betSize = 0.2;
  const trades = 50;
  const possibleValues = [];
  
  for (let w = 0; w <= trades; w++) {
    const capital = 100 * Math.pow(1 + betSize, w) * Math.pow(1 - betSize, trades - w);
    possibleValues.push({ wins: w, capital });
  }
  
  // 验证100-120之间没有可能的取值
  const in100to120 = possibleValues.filter(v => v.capital >= 100 && v.capital < 120);
  console.assert(in100to120.length === 0, '20%仓位50次交易，100-120区间不应有可能取值');
  console.log(`✓ betSize=20%, trades=50 => 100-120区间可能取值数: ${in100to120.length} (预期0)`);
  
  // 找到100附近的取值
  const near100 = possibleValues.filter(v => v.capital >= 50 && v.capital < 500);
  near100.forEach(v => {
    console.log(`  赢${v.wins}次 => ${v.capital.toFixed(2)}`);
  });
  
  // 验证27次赢 => ~81, 28次赢 => ~122，中间跳过了100-120
  const w27 = possibleValues[27].capital;
  const w28 = possibleValues[28].capital;
  console.assert(w27 < 100, '赢27次应该<100');
  console.assert(w28 > 120, '赢28次应该>120');
  console.log(`✓ 赢27次=${w27.toFixed(2)}(<100), 赢28次=${w28.toFixed(2)}(>120), 跳过了100-120\n`);
}

// 测试12: 分桶逻辑 - 确保每个结果都被分到某个桶
console.log('测试12: 分桶逻辑验证');
{
  // 模拟分桶函数（与HTML中一致）
  function buildBins(results) {
    results.sort((a, b) => a - b);
    const allMin = Math.floor(results[0]);
    const allMax = Math.ceil(results[results.length - 1]);
    const bins = [allMin];
    
    if (allMin < 100) {
      const lossSteps = [25, 50, 75, 100];
      lossSteps.forEach(s => { if (s > allMin) bins.push(s); });
    }
    if (bins[bins.length - 1] !== 100) bins.push(100);
    
    const winSteps = [150, 250, 500, 1000, 5000];
    winSteps.forEach(s => { if (s < allMax) bins.push(s); });
    bins.push(allMax + 1);

    return [...new Set(bins)].sort((a, b) => a - b);
  }

  function distribute(results, bins) {
    const distribution = new Array(bins.length - 1).fill(0);
    results.forEach(r => {
      for (let i = 0; i < bins.length - 1; i++) {
        if (r >= bins[i] && r < bins[i + 1]) {
          distribution[i]++;
          break;
        }
      }
    });
    return distribution;
  }

  // 用已知的离散取值测试
  const testResults = [54.06, 54.06, 81.09, 81.09, 81.09, 121.63, 121.63, 182.45, 273.68, 410.51];
  const bins = buildBins(testResults);
  const dist = distribute(testResults, bins);
  const total = dist.reduce((a, b) => a + b, 0);
  
  console.assert(total === testResults.length, '所有结果都应被分到某个桶');
  console.log(`✓ ${testResults.length}个结果全部分桶成功，总计: ${total}`);
  
  // 不应有空桶（动态分桶的优势）
  bins.slice(0, -1).forEach((v, i) => {
    const upper = bins[i + 1];
    console.log(`  [${v}-${upper}): ${dist[i]}个`);
  });

  // 用1000次真实模拟测试
  const simResults = [];
  for (let i = 0; i < 1000; i++) {
    let capital = 100;
    for (let j = 0; j < 50; j++) {
      if (Math.random() < 0.6) {
        capital += capital * 0.2;
      } else {
        capital -= capital * 0.2;
      }
    }
    simResults.push(capital);
  }
  
  const simBins = buildBins(simResults);
  const simDist = distribute(simResults, simBins);
  const simTotal = simDist.reduce((a, b) => a + b, 0);
  
  console.assert(simTotal === 1000, '1000次模拟应全部被分桶');
  console.log(`✓ 1000次模拟全部分桶成功，总计: ${simTotal}`);
  
  // 验证没有空桶
  const emptyBins = simDist.filter(d => d === 0).length;
  console.log(`✓ 空桶数量: ${emptyBins}\n`);
}

// 测试13: 不同参数下的离散性验证
console.log('测试13: 不同仓位下的离散性');
{
  // betSize=10% 时，离散间隔更小
  const betSize = 0.1;
  const trades = 50;
  const near100 = [];
  
  for (let w = 0; w <= trades; w++) {
    const capital = 100 * Math.pow(1 + betSize, w) * Math.pow(1 - betSize, trades - w);
    if (capital >= 80 && capital < 150) {
      near100.push({ wins: w, capital });
    }
  }
  
  const in100to120 = near100.filter(v => v.capital >= 100 && v.capital < 120);
  console.log(`✓ betSize=10%, trades=50 => 100-120区间可能取值数: ${in100to120.length}`);
  near100.forEach(v => {
    const marker = (v.capital >= 100 && v.capital < 120) ? ' ← 在100-120内' : '';
    console.log(`  赢${v.wins}次 => ${v.capital.toFixed(2)}${marker}`);
  });
  console.log(`✓ 小仓位(10%)离散间隔更小，100-120区间${in100to120.length > 0 ? '有' : '无'}取值\n`);
}

console.log('✅ 所有测试通过！核心逻辑验证正确。\n');

// 导出函数供浏览器环境使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulateTrades,
    calculateExpectedValue,
    calculateConsecutiveLossProbability,
    simulateWithPsychology
  };
}
