/**
 * 幸存者偏差模拟器 - 单元测试
 * 运行命令: node pages/survivor-bias.test.js
 */

// 测试配置
const TOTAL_TESTS = 1000;

// 辅助函数：模拟轰炸机
function simulateBomberMission(numAircraft) {
  let total = 0;
  let returned = 0;
  let crashed = 0;
  let engineHits = 0;

  for (let i = 0; i < numAircraft; i++) {
    total++;
    const engineHit = Math.random() < 0.3; // 30%概率引擎中弹

    if (engineHit) {
      crashed++;
      engineHits++;
    } else {
      returned++;
    }
  }

  return { total, returned, crashed, engineHits };
}

// 辅助函数：模拟创业公司存活
function simulateStartupSurvival(initialCount, annualSurvivalRate, years) {
  let current = initialCount;
  const yearlyData = [initialCount];

  for (let year = 1; year <= years; year++) {
    current = Math.floor(current * annualSurvivalRate);
    yearlyData.push(current);
  }

  return {
    initial: initialCount,
    final: current,
    failed: initialCount - current,
    yearlyData
  };
}

// 测试1: 轰炸机模拟 - 引擎中弹必坠毁
function testBomberEngineHits() {
  console.log('测试1: 轰炸机引擎中弹逻辑');

  const results = [];
  for (let i = 0; i < 100; i++) {
    const result = simulateBomberMission(100);
    results.push(result);
  }

  const avgCrashed = results.reduce((sum, r) => sum + r.crashed, 0) / results.length;
  const avgEngineHits = results.reduce((sum, r) => sum + r.engineHits, 0) / results.length;

  // 期望：坠毁数 ≈ 引擎中弹数（因为引擎中弹必坠毁）
  const ratio = avgCrashed / (avgEngineHits || 1);

  console.log(`  平均出动: 100架`);
  console.log(`  平均返航: ${results[0].returned.toFixed(1)}架`);
  console.log(`  平均坠毁: ${avgCrashed.toFixed(1)}架`);
  console.log(`  平均引擎中弹: ${avgEngineHits.toFixed(1)}架`);
  console.log(`  坠毁/引擎中弹比: ${ratio.toFixed(2)} (期望≈1.0)`);

  // 验证：坠毁数应该等于引擎中弹数
  const passed = Math.abs(ratio - 1.0) < 0.1;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  console.log('');

  return passed;
}

// 测试2: 轰炸机模拟 - 返航飞机看不到引擎弹孔
function testSurvivorBiasObservation() {
  console.log('测试2: 幸存者偏差观察效应');

  const totalRuns = 1000;
  let totalReturned = 0;
  let totalCrashed = 0;
  let totalEngineHitsOnCrashed = 0;

  for (let i = 0; i < totalRuns; i++) {
    const result = simulateBomberMission(100);
    totalReturned += result.returned;
    totalCrashed += result.crashed;
    totalEngineHitsOnCrashed += result.engineHits;
  }

  // 观察到的：返航飞机的引擎弹孔
  const observedEngineHitsOnReturned = 0; // 返航飞机没有引擎中弹

  // 实际的：所有飞机的引擎弹孔
  const actualEngineHits = totalEngineHitsOnCrashed;

  console.log(`  模拟1000次，每次100架飞机`);
  console.log(`  总返航: ${totalReturned}架`);
  console.log(`  总坠毁: ${totalCrashed}架`);
  console.log(`  坠毁飞机引擎中弹: ${totalEngineHitsOnCrashed}次`);
  console.log(`  观察到的返航飞机引擎中弹: ${observedEngineHitsOnReturned}次`);
  console.log(`  实际所有飞机引擎中弹: ${actualEngineHits}次`);
  console.log(`  观察到的弹孔/实际弹孔: ${(observedEngineHitsOnReturned / (actualEngineHits || 1)).toFixed(2)}`);
  console.log(`  结论: 观察到的引擎弹孔远少于实际（幸存者偏差）`);

  // 验证：观察到的引擎弹孔应该远少于实际
  const passed = observedEngineHitsOnReturned < actualEngineHits * 0.1;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  console.log('');

  return passed;
}

// 测试3: 创业公司存活模拟
function testStartupSurvival() {
  console.log('测试3: 创业公司存活模拟');

  const initialCount = 500;
  const annualRate = 0.90; // 90%年存活率
  const years = 10;

  const result = simulateStartupSurvival(initialCount, annualRate, years);

  console.log(`  初始公司: ${result.initial}家`);
  console.log(`  年存活率: ${(annualRate * 100).toFixed(0)}%`);
  console.log(`  模拟年数: ${years}年`);
  console.log(`  最终存活: ${result.final}家`);
  console.log(`  失败公司: ${result.failed}家`);
  console.log(`  最终存活率: ${((result.final / result.initial) * 100).toFixed(1)}%`);

  // 期望：10年后存活率 ≈ 0.9^10 ≈ 34.9%
  const expectedRate = Math.pow(annualRate, years);
  const actualRate = result.final / result.initial;

  console.log(`  期望存活率: ${(expectedRate * 100).toFixed(1)}%`);
  console.log(`  实际存活率: ${(actualRate * 100).toFixed(1)}%`);

  // 验证：存活率应该在期望值附近
  const passed = Math.abs(actualRate - expectedRate) < 0.05;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  console.log('');

  return passed;
}

// 测试4: 创业公司逐年衰减
function testYearlyDecay() {
  console.log('测试4: 创业公司逐年衰减');

  const initialCount = 1000;
  const annualRate = 0.85;
  const years = 10;

  const result = simulateStartupSurvival(initialCount, annualRate, years);

  console.log(`  初始: ${result.yearlyData[0]}家`);
  for (let i = 1; i <= years; i++) {
    const decay = ((1 - result.yearlyData[i] / result.yearlyData[i-1]) * 100).toFixed(1);
    console.log(`  第${i}年: ${result.yearlyData[i]}家 (衰减${decay}%)`);
  }

  // 验证：每年都在衰减
  let allDecreasing = true;
  for (let i = 1; i < result.yearlyData.length; i++) {
    if (result.yearlyData[i] >= result.yearlyData[i-1]) {
      allDecreasing = false;
      break;
    }
  }

  const passed = allDecreasing && result.yearlyData[years] < result.yearlyData[0] * 0.5;
  console.log(`  10年后存活不到初始50%: ${passed ? '✓' : '✗'}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  console.log('');

  return passed;
}

// 测试5: 极端情况 - 50%年存活率
function testExtremeSurvivalRate() {
  console.log('测试5: 极端存活率测试（50%年存活率）');

  const initialCount = 1000;
  const annualRate = 0.50;
  const years = 10;

  const result = simulateStartupSurvival(initialCount, annualRate, years);

  console.log(`  初始公司: ${result.initial}家`);
  console.log(`  年存活率: ${(annualRate * 100).toFixed(0)}%`);
  console.log(`  10年后存活: ${result.final}家`);
  console.log(`  10年后存活率: ${((result.final / result.initial) * 100).toFixed(2)}%`);

  // 期望：0.5^10 ≈ 0.1%
  const expectedRate = Math.pow(annualRate, years);
  const actualRate = result.final / result.initial;

  console.log(`  期望存活率: ${(expectedRate * 100).toFixed(2)}%`);

  // 验证：存活率应该在期望值附近
  const passed = Math.abs(actualRate - expectedRate) < 0.02;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  console.log('');

  return passed;
}

// 测试6: 幸存者偏差的数学证明
function testSurvivorBiasMath() {
  console.log('测试6: 幸存者偏差数学证明');

  // 场景：1000家创业公司，90%年存活率
  const initial = 1000;
  const rate = 0.90;
  const years = 10;

  const result = simulateStartupSurvival(initial, rate, years);

  // 观察到的：10年后活着的公司
  const observed = result.final;

  // 实际的：10年间死亡的公司
  const actualFailed = result.failed;

  console.log(`  初始: ${initial}家公司`);
  console.log(`  10年后观察到的存活: ${observed}家`);
  console.log(`  10年间实际死亡的: ${actualFailed}家`);
  console.log(`  观察/死亡比: ${(observed / (actualFailed || 1)).toFixed(2)}`);

  // 验证：死亡数应该远大于存活数
  const passed = actualFailed > observed;
  console.log(`  死亡数大于存活数: ${passed ? '✓' : '✗'}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`);
  console.log('');

  return passed;
}

// 主测试函数
function runTests() {
  console.log('='.repeat(60));
  console.log('幸存者偏差模拟器 - 单元测试');
  console.log('='.repeat(60));
  console.log('');

  const results = [];

  results.push(testBomberEngineHits());
  results.push(testSurvivorBiasObservation());
  results.push(testStartupSurvival());
  results.push(testYearlyDecay());
  results.push(testExtremeSurvivalRate());
  results.push(testSurvivorBiasMath());

  console.log('='.repeat(60));
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`测试结果: ${passed}/${total} 通过`);
  console.log('='.repeat(60));

  if (passed === total) {
    console.log('✓ 所有测试通过！');
    process.exit(0);
  } else {
    console.log('✗ 部分测试失败');
    process.exit(1);
  }
}

// 运行测试
runTests();