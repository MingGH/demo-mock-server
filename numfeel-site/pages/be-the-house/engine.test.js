/**
 * engine.test.js - 当一次庄家：单元测试
 * 运行：node engine.test.js
 * 无测试框架依赖，自行实现 assert
 */

var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  \u2705 ' + msg);
  } else {
    failed++;
    console.error('  \u274c ' + msg);
  }
}

function assertApprox(actual, expected, tol, msg) {
  var diff = Math.abs(actual - expected);
  assert(diff < tol, msg + ' (actual=' + actual.toFixed(6) + ', expected=' + expected.toFixed(6) + ', diff=' + diff.toFixed(6) + ')');
}

console.log('\n========================================');
console.log('  当一次庄家 engine.js 单元测试');
console.log('========================================\n');

/* ── 1. houseEdge ── */
console.log('[1] houseEdge 庄家优势查表');
assertApprox(engine.houseEdge('european-roulette'), 1 / 37, 1e-10, '欧式轮盘 = 1/37');
assertApprox(engine.houseEdge('american-roulette'), 2 / 38, 1e-10, '美式轮盘 = 2/38');
assertApprox(engine.houseEdge('baccarat-banker'), 0.0106, 1e-10, '百家乐押庄 = 1.06%');
assertApprox(engine.houseEdge('baccarat-tie'), 0.144, 1e-10, '百家乐押和 = 14.4%');

/* ── 2. 标准正态 CDF 精度 ── */
console.log('\n[2] normalCDF 标准正态 CDF 精度');
assertApprox(engine.normalCDF(0), 0.5, 1e-4, '\u03a6(0) = 0.5');
assertApprox(engine.normalCDF(-1), 0.1587, 1e-3, '\u03a6(-1) \u2248 0.1587');
assertApprox(engine.normalCDF(1), 0.8413, 1e-3, '\u03a6(1) \u2248 0.8413');
assertApprox(engine.normalCDF(1.96), 0.9750, 1e-3, '\u03a6(1.96) \u2248 0.9750');
assertApprox(engine.normalCDF(-1.96), 0.0250, 1e-3, '\u03a6(-1.96) \u2248 0.0250');

/* ── 3. playerProfitProbability(0.01, n) ── */
console.log('\n[3] playerProfitProbability 玩家盈利概率（edge=1%）');
assertApprox(engine.playerProfitProbability(0.01, 100), 0.460, 0.005, 'n=100 \u2248 46.0%');
assertApprox(engine.playerProfitProbability(0.01, 1000), 0.376, 0.005, 'n=1000 \u2248 37.6%');
assertApprox(engine.playerProfitProbability(0.01, 10000), 0.159, 0.005, 'n=10000 \u2248 15.9%');
assertApprox(engine.playerProfitProbability(0.01, 1000000), 0.0, 0.001, 'n=1000000 \u2248 0');

/* ── 4. edge=0 时恒等于 0.5 ── */
console.log('\n[4] edge=0 时 playerProfitProbability 恒等于 0.5');
assertApprox(engine.playerProfitProbability(0, 1), 0.5, 1e-10, 'n=1');
assertApprox(engine.playerProfitProbability(0, 100), 0.5, 1e-10, 'n=100');
assertApprox(engine.playerProfitProbability(0, 1000000), 0.5, 1e-10, 'n=1000000');

/* ── 5. 单调性 ── */
console.log('\n[5] 单调性');
assert(
  engine.playerProfitProbability(0.01, 100) > engine.playerProfitProbability(0.01, 1000),
  'n 越大 -> 盈利概率越低 (100 vs 1000)'
);
assert(
  engine.playerProfitProbability(0.01, 1000) > engine.playerProfitProbability(0.01, 10000),
  'n 越大 -> 盈利概率越低 (1000 vs 10000)'
);
assert(
  engine.playerProfitProbability(0.01, 1000) > engine.playerProfitProbability(0.02, 1000),
  'edge 越大 -> 盈利概率越低 (1% vs 2%)'
);
assert(
  engine.playerProfitProbability(0.02, 1000) > engine.playerProfitProbability(0.05, 1000),
  'edge 越大 -> 盈利概率越低 (2% vs 5%)'
);

/* ── 6. 破产概率解析解 ── */
console.log('\n[6] gamblerRuinProbability 破产概率');
assertApprox(engine.gamblerRuinProbability(100, 100, 0), 0.5, 1e-10, 'p=0.5 双方资金相等 = 0.5');
assert(
  engine.gamblerRuinProbability(100, 100000, 0) > 0.99,
  '玩家100 / 庄家100000 公平游戏破产概率 > 0.99 (actual=' + engine.gamblerRuinProbability(100, 100000, 0).toFixed(6) + ')'
);
assert(
  engine.gamblerRuinProbability(100, 100000, 0) < 1.0,
  '破产概率 < 1.0（不会溢出）'
);

/* ── 7. 蒙特卡洛 vs 解析解（固定种子） ── */
console.log('\n[7] 蒙特卡洛 vs 解析解交叉验证');
var mcEdge = 1 / 37; // 欧式轮盘
var mcW = 20, mcB = 20;
var analyticalRuin = engine.gamblerRuinProbability(mcW, mcB, mcEdge);
console.log('  解析解: ' + analyticalRuin.toFixed(4));
var mcRng = engine.mulberry32(42);
var mcResult = engine.simulateGamblers(5000, mcW, mcB, mcEdge, mcRng);
console.log('  蒙特卡洛(5000次): ' + mcResult.ruinRate.toFixed(4));
assert(
  Math.abs(mcResult.ruinRate - analyticalRuin) < 0.03,
  '蒙特卡洛结果在解析解 \u00b13% 内 (diff=' + Math.abs(mcResult.ruinRate - analyticalRuin).toFixed(4) + ')'
);

/* ── 8. simulateMartingale ── */
console.log('\n[8] simulateMartingale 倍投模拟');

// 无桌限 + 本金极大 -> 破产率很低
var rngNoLimit = engine.mulberry32(123);
var noLimitBatch = engine.simulateMartingaleBatch(500, {
  bankroll: 1000000,
  baseBet: 1,
  tableLimit: Infinity,
  edge: 1 / 37,
  rounds: 2000
}, rngNoLimit);
console.log('  无桌限 + 本金100万, 2000手, 500次: 破产率=' + noLimitBatch.ruinRate.toFixed(4));
assert(
  noLimitBatch.ruinRate < 0.05,
  '无桌限且本金极大时破产率 < 5% (actual=' + noLimitBatch.ruinRate.toFixed(4) + ')'
);

// 桌限 = 1000 + baseBet = 1 -> 破产率 > 0.9
var rngWithLimit = engine.mulberry32(456);
var withLimitBatch = engine.simulateMartingaleBatch(300, {
  bankroll: 3000,
  baseBet: 1,
  tableLimit: 1000,
  edge: 1 / 37,
  rounds: 50000
}, rngWithLimit);
console.log('  桌限1000 + 本金3000, 50000手, 300次: 破产率=' + withLimitBatch.ruinRate.toFixed(4));
assert(
  withLimitBatch.ruinRate > 0.9,
  '桌限=1000 且 baseBet=1 时破产率 > 90% (actual=' + withLimitBatch.ruinRate.toFixed(4) + ')'
);

// 单次模拟验证结构
var singleRng = engine.mulberry32(789);
var singleResult = engine.simulateMartingale({
  bankroll: 5000,
  baseBet: 1,
  tableLimit: 1000,
  edge: 1 / 37,
  rounds: 500
}, singleRng);
assert(
  singleResult.trajectory.length > 1,
  '单次模拟返回轨迹 (length=' + singleResult.trajectory.length + ')'
);
assert(
  typeof singleResult.bankrupt === 'boolean',
  '返回 bankrupt 布尔值'
);
assert(
  Array.isArray(singleResult.truncatedRounds),
  '返回 truncatedRounds 数组'
);
assert(
  singleResult.maxBet <= 1000,
  'maxBet 不超过桌限 (actual=' + singleResult.maxBet + ')'
);

/* ── 9. bookmakerPayout 平衡账本 ── */
console.log('\n[9] bookmakerPayout 平衡账本');

// 平衡：两侧押注相等
var balanced = engine.bookmakerPayout(1000, 1000, 1.9, 1.9);
assert(
  Math.abs(balanced.netA - balanced.netB) < 1e-9,
  '平衡账本：两种结果庄家收益之差 < 1e-9 (diff=' + Math.abs(balanced.netA - balanced.netB) + ')'
);
assert(
  balanced.netA > 0 && balanced.netB > 0,
  '平衡账本：两种结果庄家收益均为正 (netA=' + balanced.netA.toFixed(2) + ', netB=' + balanced.netB.toFixed(2) + ')'
);
assert(
  balanced.exposure === 'balanced',
  '平衡账本标记为 balanced'
);

// 严重失衡：存在一侧收益为负
var imbalanced = engine.bookmakerPayout(10000, 100, 1.9, 1.9);
assert(
  imbalanced.netA < 0 || imbalanced.netB < 0,
  '严重失衡：存在一侧收益为负 (netA=' + imbalanced.netA.toFixed(2) + ', netB=' + imbalanced.netB.toFixed(2) + ')'
);
assert(
  imbalanced.exposure === 'imbalance',
  '失衡账本标记为 imbalance'
);

// 莱斯特城情景：极端长尾赔率
var leicester = engine.bookmakerPayout(100, 100000, 5001, 1.01);
assert(
  leicester.netA < 0,
  '莱斯特城情景（A队5000:1）：A赢时庄家巨亏 (netA=' + leicester.netA.toFixed(2) + ')'
);

/* ── 10. 种子可重复性 ── */
console.log('\n[10] 种子可重复性');
var rng1 = engine.mulberry32(42);
var rng2 = engine.mulberry32(42);
var sim1 = engine.simulateGamblers(100, 50, 50, 0.027, rng1);
var sim2 = engine.simulateGamblers(100, 50, 50, 0.027, rng2);
assert(
  sim1.ruinCount === sim2.ruinCount,
  '同一种子两次模拟破产数一致 (' + sim1.ruinCount + ' vs ' + sim2.ruinCount + ')'
);
assert(
  JSON.stringify(sim1.trajectories) === JSON.stringify(sim2.trajectories),
  '同一种子两次模拟轨迹完全一致'
);

// Martingale 种子可重复性
var rngM1 = engine.mulberry32(999);
var rngM2 = engine.mulberry32(999);
var m1 = engine.simulateMartingale({ bankroll: 5000, baseBet: 1, tableLimit: 1000, edge: 0.027, rounds: 500 }, rngM1);
var m2 = engine.simulateMartingale({ bankroll: 5000, baseBet: 1, tableLimit: 1000, edge: 0.027, rounds: 500 }, rngM2);
assert(
  JSON.stringify(m1.trajectory) === JSON.stringify(m2.trajectory),
  '同一种子两次 Martingale 模拟轨迹完全一致'
);

/* ── 最终统计 ── */
console.log('\n========================================');
console.log('  \u901a\u8fc7: ' + passed + ' / \u5931\u8d25: ' + failed);
console.log('========================================');
if (failed > 0) {
  process.exit(1);
}
