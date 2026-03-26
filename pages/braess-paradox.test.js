/**
 * 布雷斯悖论 — 单元测试
 * node pages/braess-paradox.test.js
 */

const {
  edgeDelay, getAllPaths, pathDelay, computeEdgeCars,
  solveNashEquilibrium, solveSocialOptimum,
  compareBraess, simulateCarRange, simulateInvolution,
  DEFAULT_NETWORK
} = require('./braess-paradox-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
    console.log(`  ✅ ${msg} (${actual} ≈ ${expected})`);
  } else {
    failed++;
    console.log(`  ❌ ${msg} (${actual} ≠ ${expected}, tolerance=${tolerance})`);
  }
}

// ========== 边延迟计算 ==========
console.log('\n📐 边延迟计算');
{
  const linear = { type: 'linear', param: 1/100 };
  const fixed = { type: 'fixed', param: 45 };

  assertApprox(edgeDelay(linear, 2000), 20, 0.01, '线性边: 2000辆 → 20分钟');
  assertApprox(edgeDelay(linear, 4000), 40, 0.01, '线性边: 4000辆 → 40分钟');
  assertApprox(edgeDelay(fixed, 1000), 45, 0.01, '固定边: 始终45分钟');
  assertApprox(edgeDelay(fixed, 0), 45, 0.01, '固定边: 0辆也是45分钟');
}

// ========== 路径枚举 ==========
console.log('\n🛤️ 路径枚举');
{
  const noShortcut = getAllPaths(false);
  assert(noShortcut.length === 2, '无捷径: 2条路径');

  const withShortcut = getAllPaths(true);
  assert(withShortcut.length === 3, '有捷径: 3条路径');
  assert(withShortcut[2].id === 'S-A-B-E', '第3条路径是 S-A-B-E');
}

// ========== 无捷径的纳什均衡 ==========
console.log('\n⚖️ 无捷径的纳什均衡');
{
  const network = {
    totalCars: 4000,
    edges: {
      'S-A': { type: 'linear', param: 1/100 },
      'S-B': { type: 'fixed', param: 45 },
      'A-E': { type: 'fixed', param: 45 },
      'B-E': { type: 'linear', param: 1/100 },
      'A-B': { type: 'fixed', param: 0, enabled: false }
    }
  };

  const result = solveNashEquilibrium(network);

  // 对称博弈，应该大致均分
  const flowSAE = result.pathFlows['S-A-E'];
  const flowSBE = result.pathFlows['S-B-E'];
  assertApprox(flowSAE, 2000, 100, `S-A-E 流量 ≈ 2000 (实际 ${flowSAE})`);
  assertApprox(flowSBE, 2000, 100, `S-B-E 流量 ≈ 2000 (实际 ${flowSBE})`);

  // 平均延迟应该约 65 分钟 (20 + 45 = 65)
  assertApprox(result.avgDelay, 65, 2, `平均延迟 ≈ 65 分钟 (实际 ${result.avgDelay.toFixed(1)})`);
}

// ========== 有捷径的纳什均衡 ==========
console.log('\n🔗 有捷径的纳什均衡');
{
  const network = {
    totalCars: 4000,
    edges: {
      'S-A': { type: 'linear', param: 1/100 },
      'S-B': { type: 'fixed', param: 45 },
      'A-E': { type: 'fixed', param: 45 },
      'B-E': { type: 'linear', param: 1/100 },
      'A-B': { type: 'fixed', param: 0, enabled: true }
    }
  };

  const result = solveNashEquilibrium(network);

  // 大部分车应该走捷径 S-A-B-E
  const flowShortcut = result.pathFlows['S-A-B-E'] || 0;
  assert(flowShortcut > 1000, `捷径流量 > 1000 (实际 ${flowShortcut})`);

  // 平均延迟应该 > 65 分钟（悖论效应）
  assert(result.avgDelay > 65, `有捷径平均延迟 > 65 (实际 ${result.avgDelay.toFixed(1)})`);
}

// ========== 布雷斯悖论核心验证 ==========
console.log('\n🎯 布雷斯悖论核心验证');
{
  const result = compareBraess(4000);

  // 加了捷径后延迟应该更高
  assert(result.paradoxDelta > 0, `悖论效应 > 0: 加捷径后延迟增加 ${result.paradoxDelta.toFixed(1)} 分钟`);
  assert(result.without.avgDelay < result.with.avgDelay,
    `无捷径 (${result.without.avgDelay.toFixed(1)}) < 有捷径 (${result.with.avgDelay.toFixed(1)})`);

  // 理论值: 无捷径 ≈ 65, 有捷径 ≈ 80
  assertApprox(result.without.avgDelay, 65, 3, '无捷径延迟 ≈ 65');
  assert(result.with.avgDelay > 70, `有捷径延迟 > 70 (实际 ${result.with.avgDelay.toFixed(1)})`);
}

// ========== 不同车辆数模拟 ==========
console.log('\n📊 不同车辆数模拟');
{
  const range = simulateCarRange(2000, 6000, 2000);
  assert(range.carCounts.length === 3, `生成 3 个数据点`);
  assert(range.withoutDelays.length === 3, '延迟数组长度正确');
  // 车辆少时捷径有帮助，车辆多时出现悖论
  assert(range.deltas[0] < 0, `2000辆时捷径有帮助 (delta=${range.deltas[0]})`);
  assert(range.deltas[1] > 0, `4000辆时出现悖论 (delta=${range.deltas[1]})`);
  assert(range.deltas[2] > range.deltas[1], `6000辆时悖论更严重 (delta=${range.deltas[2]})`);
}

// ========== 社会最优解 ==========
console.log('\n🏛️ 社会最优解');
{
  const result = compareBraess(4000);

  // 社会最优应该 <= 纳什均衡
  assert(result.optWithout.avgDelay <= result.without.avgDelay + 0.1,
    `无捷径: 社会最优 (${result.optWithout.avgDelay.toFixed(1)}) <= 纳什 (${result.without.avgDelay.toFixed(1)})`);
}

// ========== 内卷模型 ==========
console.log('\n💼 内卷模型');
{
  const result = simulateInvolution(100, 50);
  assert(result.history.length === 50, '50轮历史记录');
  assert(result.history[0].overtimeRate <= 15, '初始加班率 ≈ 10%');

  // 最终应该收敛到高加班率
  const finalRate = result.finalState.overtimeRate;
  assert(finalRate > 50, `最终加班率 > 50% (实际 ${finalRate}%)`);

  // 最终平均收益应该低于初始（所有人不加班时）
  const initialAvg = result.history[0].avgPayoff;
  const allNoOvertime = 100; // baseSalary
  assert(result.finalState.avgPayoff < allNoOvertime,
    `均衡收益 (${result.finalState.avgPayoff}) < 无人加班收益 (${allNoOvertime})`);
}

// ========== 总结 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
if (failed > 0) process.exit(1);
