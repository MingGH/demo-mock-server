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

// 小本金 + 长 horizon -> 破产几乎必然。
// 注意：这里的死因是「庄家优势在 5 万手上的累积」，不是桌限本身。
// 桌限的真实作用见第 17 组受控对照。
var rngWithLimit = engine.mulberry32(456);
var withLimitBatch = engine.simulateMartingaleBatch(300, {
  bankroll: 3000,
  baseBet: 1,
  tableLimit: 1000,
  edge: 1 / 37,
  rounds: 50000
}, rngWithLimit);
console.log('  本金3000 + 桌限1000, 50000手, 300次: 破产率=' + withLimitBatch.ruinRate.toFixed(4));
assert(
  withLimitBatch.ruinRate > 0.9,
  '小本金跑满 5 万手时破产率 > 90%（死因是优势累积，不是桌限） (actual=' + withLimitBatch.ruinRate.toFixed(4) + ')'
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

/* ── 11. llnStats ── */
console.log('\n[11] llnStats 统计量');
{
  var st = engine.llnStats(0.01, 10000, 1);
  assertApprox(st.expectedLoss, 100, 1e-9, 'edge=1%, n=10000 -> 期望亏损 = 100');
  assertApprox(st.stdDev, 100, 1e-9, 'edge=1%, n=10000 -> 标准差 = 100');
  assertApprox(st.snr, 1, 1e-9, '信噪比 = 期望/标准差 = 1');
  assertApprox(st.profitProb, engine.playerProfitProbability(0.01, 10000, 1), 1e-12, 'profitProb 与单独调用一致');
  // 期望按 n 线性增长，标准差按 sqrt(n) 增长
  var s1 = engine.llnStats(0.01, 100, 1);
  var s2 = engine.llnStats(0.01, 10000, 1);
  assertApprox(s2.expectedLoss / s1.expectedLoss, 100, 1e-9, 'n 放大 100 倍 -> 期望亏损放大 100 倍');
  assertApprox(s2.stdDev / s1.stdDev, 10, 1e-9, 'n 放大 100 倍 -> 标准差只放大 10 倍');
}

/* ── 12. profitProbabilityCurve ── */
console.log('\n[12] profitProbabilityCurve 曲线数据');
{
  var curve = engine.profitProbabilityCurve(0.01, 1, 50);
  assert(curve.length === 50, '返回指定的采样点数 (' + curve.length + ')');
  assert(curve[0].n >= 10 && curve[curve.length - 1].n <= 1000000, '横轴范围落在 10 ~ 1,000,000');
  var monotone = true;
  for (var ci = 1; ci < curve.length; ci++) {
    if (curve[ci].prob > curve[ci - 1].prob + 1e-12) { monotone = false; break; }
    if (curve[ci].n < curve[ci - 1].n) { monotone = false; break; }
  }
  assert(monotone, 'n 单调递增且盈利概率单调递减');
  assertApprox(curve[0].prob, engine.playerProfitProbability(0.01, curve[0].n, 1), 1e-12, '曲线点与解析函数一致');
}

/* ── 13. simulateProfitDistribution ── */
console.log('\n[13] simulateProfitDistribution 收益分布');
{
  // 小 n 走逐手模拟路径
  var d1 = engine.simulateProfitDistribution(0.01, 100, 4000, engine.mulberry32(2024));
  assert(d1.results.length === 4000, '返回指定样本数 (' + d1.results.length + ')');
  assertApprox(d1.mean, -1, 0.6, 'n=100, edge=1% -> 样本均值 ≈ -1');
  assertApprox(d1.std, 10, 1.0, 'n=100 -> 样本标准差 ≈ sqrt(100) = 10');
  var binTotal = d1.bins.reduce(function (s, b) { return s + b.count; }, 0);
  assert(binTotal === 4000, '直方图分桶计数之和等于样本数 (' + binTotal + ')');

  // 大 n 走正态近似路径
  var d2 = engine.simulateProfitDistribution(0.01, 1000000, 4000, engine.mulberry32(2025));
  assertApprox(d2.mean, -10000, 400, 'n=1e6, edge=1% -> 样本均值 ≈ -10000');
  assertApprox(d2.std, 1000, 100, 'n=1e6 -> 样本标准差 ≈ sqrt(1e6) = 1000');

  // 同一个 edge 下，n 越大分布越窄（相对于期望）
  assert(Math.abs(d2.mean) / d2.std > Math.abs(d1.mean) / d1.std,
    'n 越大 -> 期望/标准差 之比越大（庄家那一端）');

  // 种子可重复
  var d3 = engine.simulateProfitDistribution(0.01, 100, 500, engine.mulberry32(7));
  var d4 = engine.simulateProfitDistribution(0.01, 100, 500, engine.mulberry32(7));
  assert(JSON.stringify(d3.results) === JSON.stringify(d4.results), '同一种子两次分布模拟完全一致');
}

/* ── 14. 未吸收样本：W ≪ B 区间（UI 实际使用的区间） ── */
console.log('\n[14] 未吸收样本不得冒充存活（W ≪ B）');
{
  // 21点 edge=0.5%、玩家 10000、庄家 1 亿：解析解破产概率 ≈ 1，
  // 但走到吸收要几百万手。旧实现会把撞上限的样本当成「没破产」，报出 0% 破产。
  var analytic = engine.gamblerRuinProbability(10000, 100000000, 0.005);
  assert(analytic > 0.999, '解析解：破产概率 > 99.9% (actual=' + analytic.toFixed(6) + ')');

  var r = engine.simulateGamblers(20, 10000, 100000000, 0.005, engine.mulberry32(11), {
    maxRounds: 20000, keepTrajectories: 2
  });
  assert(r.unabsorbedCount === 20, '20 个样本全部未定局 (unabsorbed=' + r.unabsorbedCount + ')');
  assert(r.truncated === true, 'truncated 标记为 true');
  assert(r.ruinRateAmongAbsorbed === null, '无已定局样本时不给出破产占比（不再谎报 0%）');
  assert(r.ceilingCount === 0, '没有人打穿庄家');

  // 反过来：小盘且预算充足时应当全部定局
  var r2 = engine.simulateGamblers(200, 20, 20, 1 / 37, engine.mulberry32(12), { maxRounds: 100000 });
  assert(r2.unabsorbedCount === 0, '小盘充足预算下全部定局 (unabsorbed=' + r2.unabsorbedCount + ')');
  assertApprox(r2.ruinRateAmongAbsorbed, r2.ruinRate, 1e-12, '全部定局时两种破产率口径一致');
}

/* ── 15. 轨迹抽稀必须带出步长 ── */
console.log('\n[15] 轨迹抽稀带 stride');
{
  var r = engine.simulateGamblers(1, 500, 500, 1 / 37, engine.mulberry32(3), { keepTrajectories: 1 });
  var t = r.trajectories[0];
  assert(t && Array.isArray(t.points), '轨迹以 {points, stride} 形式返回');
  assert(typeof t.stride === 'number' && t.stride >= 1, 'stride 是 >= 1 的数字 (stride=' + t.stride + ')');
  assert(t.points.length <= 201, '采样点数被压到 200 上下 (' + t.points.length + ')');
  // 采样点数 × 步长 应当覆盖真实手数
  assert(t.points.length * t.stride >= t.rounds, '采样点数 × stride 覆盖真实手数 (' +
    t.points.length + '×' + t.stride + ' >= ' + t.rounds + ')');
}

/* ── 16. 负 edge（玩家有优势）不得返回 NaN ── */
console.log('\n[16] 负 edge 数值稳定性');
{
  // Don Johnson 把庄家优势谈成负数就是这个情形
  var cases = [
    [100, 100, -0.02],
    [1000, 100000, -0.0025],
    [10000, 100000000, -0.01]
  ];
  var allFinite = true;
  var allInRange = true;
  for (var i = 0; i < cases.length; i++) {
    var v = engine.gamblerRuinProbability(cases[i][0], cases[i][1], cases[i][2]);
    if (!isFinite(v)) allFinite = false;
    if (!(v >= 0 && v <= 1)) allInRange = false;
  }
  assert(allFinite, '负 edge 下全部返回有限值（不再是 NaN）');
  assert(allInRange, '负 edge 下结果落在 [0, 1]');

  // 玩家有优势时，破产概率必须低于公平游戏
  var fair = engine.gamblerRuinProbability(100, 100, 0);
  var favorable = engine.gamblerRuinProbability(100, 100, -0.02);
  var unfavorable = engine.gamblerRuinProbability(100, 100, 0.02);
  assert(favorable < fair && fair < unfavorable,
    '破产概率随 edge 单调：玩家优势 ' + favorable.toFixed(4) +
    ' < 公平 ' + fair.toFixed(4) + ' < 庄家优势 ' + unfavorable.toFixed(4));
}

/* ── 17. 模块四受控对照：只切桌限 ── */
console.log('\n[17] 倍投受控对照（同本金/同手数/同种子，只切桌限）');
{
  var MG = { bankroll: 100000, baseBet: 10, edge: 1 / 37, rounds: 5000, profitTarget: 500 };
  function mgRun(tableLimit) {
    var p = Object.assign({}, MG, { tableLimit: tableLimit });
    return engine.simulateMartingaleBatch(400, p, engine.mulberry32(7));
  }
  var noLimit = mgRun(Infinity);
  var limited = mgRun(2000);
  console.log('  无桌限  : 达成率 ' + (noLimit.targetRate * 100).toFixed(1) + '%，平均流水 ' +
    noLimit.avgWagered.toFixed(0) + '，平均盈亏 ' + noLimit.avgProfit.toFixed(0));
  console.log('  桌限2000: 达成率 ' + (limited.targetRate * 100).toFixed(1) + '%，平均流水 ' +
    limited.avgWagered.toFixed(0) + '，平均盈亏 ' + limited.avgProfit.toFixed(0));

  // 倍投的诱惑：小额目标的达成率很高
  assert(noLimit.targetRate > 0.95, '无桌限时达成 +500 目标的比例 > 95% (actual=' +
    (noLimit.targetRate * 100).toFixed(1) + '%)');
  // 代价藏在尾部：最差一场远大于目标额
  assert(noLimit.worstProfit < -10 * MG.profitTarget,
    '最差一场亏损超过目标额的 10 倍 (worst=' + noLimit.worstProfit.toFixed(0) + ')');
  // 平均下来依然是亏
  assert(noLimit.avgProfit < 0, '无桌限时平均盈亏仍为负 (' + noLimit.avgProfit.toFixed(0) + ')');
  assert(limited.avgProfit < 0, '有桌限时平均盈亏为负 (' + limited.avgProfit.toFixed(0) + ')');

  // 桌限的真实作用：给巨亏封顶，同时把总流水顶上去
  assert(limited.worstProfit > noLimit.worstProfit,
    '桌限给最差一场封了顶 (' + limited.worstProfit.toFixed(0) + ' > ' + noLimit.worstProfit.toFixed(0) + ')');
  assert(limited.avgWagered > 2 * noLimit.avgWagered,
    '桌限让达成同一目标的总流水放大 2 倍以上 (' +
    (limited.avgWagered / noLimit.avgWagered).toFixed(1) + ' 倍)');
  assert(limited.avgProfit < noLimit.avgProfit,
    '流水更大 -> 平均亏得更多 (' + limited.avgProfit.toFixed(0) + ' < ' + noLimit.avgProfit.toFixed(0) + ')');

  // maxBet 必须服从桌限
  var maxOverLimit = limited.results.filter(function (r) { return r.maxBet > 2000; }).length;
  assert(maxOverLimit === 0, '没有任何一场的下注超过桌限');
}

/* ── 18. 不变量：期望亏损 = 庄家优势 × 总流水 ── */
console.log('\n[18] 不变量：期望亏损 = 庄家优势 × 总流水');
{
  // 用有界下注的场景做检验，避免罕见巨亏拖慢收敛
  var p = { bankroll: 1000000, baseBet: 10, tableLimit: 100, edge: 1 / 37, rounds: 3000 };
  var b = engine.simulateMartingaleBatch(3000, p, engine.mulberry32(99));
  var rel = Math.abs(b.avgProfit - b.theoreticalLoss) / Math.abs(b.theoreticalLoss);
  console.log('  平均流水 ' + b.avgWagered.toFixed(0) + '，实测均亏 ' + b.avgProfit.toFixed(0) +
    '，理论均亏 ' + b.theoreticalLoss.toFixed(0) + '，相对偏差 ' + (rel * 100).toFixed(1) + '%');
  assert(rel < 0.15, '实测平均盈亏与「-edge × 总流水」相对偏差 < 15% (' + (rel * 100).toFixed(1) + '%)');
  assert(b.avgWagered > 0, '总流水被正确累计');
  assertApprox(b.theoreticalLoss, -p.edge * b.avgWagered, 1e-9, 'theoreticalLoss 就是 -edge × 平均流水');
}

/* ── 19. balancedOdds 反解平衡赔率 ── */
console.log('\n[19] balancedOdds 按押注额反解平衡赔率');
{
  var s = engine.balancedOdds(30000, 10000, 0.05);
  // 两边赔付必须相等
  var payoutA = 30000 * s.oddsA;
  var payoutB = 10000 * s.oddsB;
  assertApprox(payoutA, payoutB, 1e-9, '两侧赔付相等 (' + payoutA.toFixed(2) + ' vs ' + payoutB.toFixed(2) + ')');
  assertApprox(payoutA, 40000 * 0.95, 1e-9, '赔付 = 总池 × (1 - vig)');
  assert(s.oddsA < s.oddsB, '押注多的一侧赔率更低 (' + s.oddsA.toFixed(3) + ' < ' + s.oddsB.toFixed(3) + ')');

  // 反解出的赔率喂回 bookmakerPayout，应当得到平衡账本
  var pay = engine.bookmakerPayout(30000, 10000, s.oddsA, s.oddsB);
  assertApprox(pay.netA, pay.netB, 1e-9, '喂回 bookmakerPayout 后两种结果收益相等');
  assert(pay.netA > 0, '两种结果庄家都赚 (' + pay.netA.toFixed(2) + ')');
  assertApprox(pay.netA, 40000 * 0.05, 1e-9, '庄家净收益 = 总池 × vig');
  assert(pay.exposure === 'balanced', '标记为 balanced');

  // 押注额相等时退化成对称赔率
  var sym = engine.balancedOdds(10000, 10000, 0.05);
  assertApprox(sym.oddsA, sym.oddsB, 1e-12, '两侧押注相等时赔率对称');
  assertApprox(sym.oddsA, 1.9, 1e-12, '10000/10000 且留 5% -> 赔率 1.90');

  // 边界
  assert(engine.balancedOdds(0, 10000, 0.05) === null, '一侧没有押注时返回 null');
}

/* ── 20. bookmakerPayout 抽水率数值 ── */
console.log('\n[20] bookmakerPayout 抽水率数值');
{
  var r19 = engine.bookmakerPayout(1000, 1000, 1.9, 1.9);
  assertApprox(r19.vig, 2 / 1.9 - 1, 1e-12, '赔率 1.9/1.9 -> overround = 2/1.9 - 1');
  assertApprox(r19.vig, 0.0526316, 1e-6, '数值上 ≈ 5.26%');
  assertApprox(r19.totalPool, 2000, 1e-12, '总池 = 2000');

  // 公平赔率（2.0/2.0）时抽水为 0，庄家不赚不亏
  var rFair = engine.bookmakerPayout(1000, 1000, 2.0, 2.0);
  assertApprox(rFair.vig, 0, 1e-12, '赔率 2.0/2.0 -> 抽水 = 0');
  assertApprox(rFair.netA, 0, 1e-12, '抽水为 0 时庄家净收益 = 0');
}

/* ── 最终统计 ── */
console.log('\n========================================');
console.log('  \u901a\u8fc7: ' + passed + ' / \u5931\u8d25: ' + failed);
console.log('========================================');
if (failed > 0) {
  process.exit(1);
}
