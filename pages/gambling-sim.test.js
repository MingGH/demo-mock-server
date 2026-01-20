/**
 * 赌博模拟器核心逻辑单元测试
 * 运行: node pages/gambling-sim.test.js
 */

// ========== 核心逻辑 ==========

/**
 * 模拟单次赌博
 * @param {number} currentMoney - 当前资金
 * @param {number} bet - 押注金额
 * @param {number} rake - 抽水比例 (0-1)
 * @param {boolean} win - 是否赢
 * @returns {number} 赌博后的资金
 */
function simulateBet(currentMoney, bet, rake, win) {
  if (currentMoney < bet) {
    return currentMoney; // 钱不够，不能赌
  }
  
  if (win) {
    return currentMoney + bet * (1 - rake);
  } else {
    return currentMoney - bet;
  }
}

/**
 * 计算单次赌博的期望值
 */
function calculateExpectedValue(bet, rake, winProb = 0.5) {
  const winAmount = bet * (1 - rake);
  const loseAmount = bet;
  return winProb * winAmount - (1 - winProb) * loseAmount;
}

/**
 * 模拟多轮赌博
 */
function simulateMultipleRounds(initialMoney, bet, rake, rounds, randomFn = () => Math.random() < 0.5) {
  let money = initialMoney;
  const history = [money];
  let roundsPlayed = 0;
  
  for (let i = 0; i < rounds; i++) {
    if (money < bet) break;
    
    const win = randomFn();
    money = simulateBet(money, bet, rake, win);
    history.push(money);
    roundsPlayed++;
  }
  
  return { finalMoney: money, roundsPlayed, history };
}

// ========== 测试框架 ==========

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failCount++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${e.message}`);
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual, expected, tolerance = 0.01, message = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message} Expected ~${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(message || 'Expected true');
  }
}

// ========== 测试用例 ==========

console.log('\n========== 单次赌博逻辑 ==========\n');

test('赢了应该获得 bet*(1-rake)', () => {
  const result = simulateBet(1000, 100, 0.05, true);
  assertEqual(result, 1095, '1000 + 100*0.95 = 1095');
});

test('输了应该失去 bet', () => {
  const result = simulateBet(1000, 100, 0.05, false);
  assertEqual(result, 900, '1000 - 100 = 900');
});

test('钱不够时不能赌', () => {
  const result = simulateBet(50, 100, 0.05, true);
  assertEqual(result, 50, '钱不够，应该保持不变');
});

test('0%抽水时赢了应该获得全额', () => {
  const result = simulateBet(1000, 100, 0, true);
  assertEqual(result, 1100, '无抽水时 1000 + 100 = 1100');
});

test('10%抽水时赢了应该获得90%', () => {
  const result = simulateBet(1000, 100, 0.1, true);
  assertEqual(result, 1090, '10%抽水时 1000 + 90 = 1090');
});

console.log('\n========== 期望值计算 ==========\n');

test('5%抽水时期望值应该是负的', () => {
  const ev = calculateExpectedValue(100, 0.05, 0.5);
  assertApprox(ev, -2.5, 0.01, '期望值应该是 -2.5');
});

test('0%抽水时期望值应该是0', () => {
  const ev = calculateExpectedValue(100, 0, 0.5);
  assertApprox(ev, 0, 0.01, '公平游戏期望值应该是 0');
});

test('10%抽水时期望值应该是-5', () => {
  const ev = calculateExpectedValue(100, 0.1, 0.5);
  assertApprox(ev, -5, 0.01, '期望值应该是 -5');
});

test('期望值公式验证：EV = 0.5*win - 0.5*lose', () => {
  const ev = calculateExpectedValue(100, 0.05, 0.5);
  const manual = 0.5 * 95 - 0.5 * 100;
  assertApprox(ev, manual, 0.01);
});

console.log('\n========== 多轮模拟 ==========\n');

test('全赢时资金应该持续增长', () => {
  const result = simulateMultipleRounds(1000, 100, 0.05, 10, () => true);
  assertEqual(result.roundsPlayed, 10, '应该玩满10轮');
  assertTrue(result.finalMoney > 1000, '全赢时资金应该增长');
  assertEqual(result.finalMoney, 1950, '1000 + 10*95 = 1950');
});

test('全输时应该破产', () => {
  const result = simulateMultipleRounds(1000, 100, 0.05, 20, () => false);
  assertEqual(result.roundsPlayed, 10, '1000/100=10轮后破产');
  assertEqual(result.finalMoney, 0, '应该输光');
});

test('破产后不能继续赌', () => {
  const result = simulateMultipleRounds(100, 100, 0.05, 10, () => false);
  assertEqual(result.roundsPlayed, 1, '只能玩1轮');
  assertEqual(result.finalMoney, 0, '输光了');
});

test('历史记录长度正确', () => {
  const result = simulateMultipleRounds(1000, 100, 0, 5, () => true);
  assertEqual(result.history.length, 6, '初始+5轮=6个记录');
  assertEqual(result.history[0], 1000, '初始资金');
  assertEqual(result.history[5], 1500, '最终资金');
});

console.log('\n========== 大数定律验证 ==========\n');

test('大量模拟后平均收益应该接近期望值', () => {
  const trials = 10000;
  let totalProfit = 0;
  
  for (let i = 0; i < trials; i++) {
    const result = simulateMultipleRounds(10000, 100, 0.05, 1, () => Math.random() < 0.5);
    totalProfit += result.finalMoney - 10000;
  }
  
  const avgProfit = totalProfit / trials;
  const expectedEV = -2.5;
  
  assertApprox(avgProfit, expectedEV, 1, `平均收益 ${avgProfit.toFixed(2)} 应该接近 ${expectedEV}`);
});

test('长期赌博破产率应该很高', () => {
  const trials = 1000;
  let bankruptCount = 0;
  
  for (let i = 0; i < trials; i++) {
    const result = simulateMultipleRounds(1000, 100, 0.05, 1000);
    if (result.finalMoney < 100) bankruptCount++;
  }
  
  const bankruptRate = bankruptCount / trials;
  assertTrue(bankruptRate > 0.8, `破产率 ${(bankruptRate*100).toFixed(1)}% 应该大于 80%`);
});

console.log('\n========== 边界条件 ==========\n');

test('押注金额等于本金时赢', () => {
  const result = simulateBet(100, 100, 0.05, true);
  assertEqual(result, 195, '100 + 95 = 195');
});

test('押注金额等于本金时输', () => {
  const result = simulateBet(100, 100, 0.05, false);
  assertEqual(result, 0, '100 - 100 = 0');
});

test('极高抽水(50%)时期望值', () => {
  const ev = calculateExpectedValue(100, 0.5, 0.5);
  assertApprox(ev, -25, 0.01, '50%抽水时期望值是 -25');
});

test('资金为0时不能赌', () => {
  const result = simulateBet(0, 100, 0.05, true);
  assertEqual(result, 0, '没钱不能赌');
});

test('负资金时不能赌', () => {
  const result = simulateBet(-100, 100, 0.05, true);
  assertEqual(result, -100, '负资金不能赌');
});

test('资金少于押注但大于0时不能赌', () => {
  const result = simulateBet(50, 100, 0.05, true);
  assertEqual(result, 50, '50元不够押100元');
});

console.log('\n========== 浮点数精度测试 ==========\n');

test('多次赢后资金计算精度', () => {
  let money = 1000;
  for (let i = 0; i < 100; i++) {
    money = simulateBet(money, 100, 0.05, true);
  }
  // 1000 + 100 * 95 = 10500
  assertEqual(money, 10500, '100次全赢后应该是10500');
});

test('赢输交替后资金计算', () => {
  let money = 1000;
  // 赢一次: 1000 + 95 = 1095
  money = simulateBet(money, 100, 0.05, true);
  assertEqual(money, 1095);
  // 输一次: 1095 - 100 = 995
  money = simulateBet(money, 100, 0.05, false);
  assertEqual(money, 995);
  // 净亏损 5 元，符合期望
});

console.log('\n========== 抽水模型验证 ==========\n');

test('抽水应该从赢家收取而非输家', () => {
  // 赢家获得: bet * (1 - rake) = 95
  // 输家失去: bet = 100
  // 庄家获得: 100 - 95 = 5 (抽水)
  const winResult = simulateBet(1000, 100, 0.05, true);
  const loseResult = simulateBet(1000, 100, 0.05, false);
  
  const winnerGain = winResult - 1000; // 95
  const loserLoss = 1000 - loseResult; // 100
  const houseProfit = loserLoss - winnerGain; // 5
  
  assertEqual(houseProfit, 5, '庄家每局抽5元');
});

test('零和博弈验证（无抽水时）', () => {
  const winResult = simulateBet(1000, 100, 0, true);
  const loseResult = simulateBet(1000, 100, 0, false);
  
  const winnerGain = winResult - 1000; // 100
  const loserLoss = 1000 - loseResult; // 100
  
  assertEqual(winnerGain, loserLoss, '无抽水时赢家所得=输家所失');
});

// ========== 总结 ==========

console.log('\n========== 测试结果 ==========\n');
console.log(`通过: ${passCount}`);
console.log(`失败: ${failCount}`);
console.log(`总计: ${passCount + failCount}`);

if (failCount === 0) {
  console.log('\n🎉 全部测试通过！\n');
  process.exit(0);
} else {
  console.log('\n⚠️ 有测试失败！\n');
  process.exit(1);
}
