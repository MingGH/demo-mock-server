/**
 * Penney's Game 单元测试
 * 运行: node pages/penneys-game/penneys-game.test.js
 */

var PE = require('./engine.js').PenneyEngine;

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + message);
  } else {
    failed++;
    console.log('  ✗ ' + message);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  var diff = Math.abs(actual - expected);
  assert(diff <= tolerance, message + ' (actual=' + actual.toFixed(4) + ', expected=' + expected.toFixed(4) + ', tol=' + tolerance + ')');
}

console.log('\n=== Penney\'s Game 引擎测试 ===\n');

// ── Conway Number 测试 ──
console.log('Conway Number:');
// 自身重叠：HHH 自身完全重叠
var cHHH = PE.conwayNumber('HHH', 'HHH');
assert(cHHH === 14, 'conwayNumber(HHH, HHH) = 14 (got ' + cHHH + ')');

// HHT 对自身
var cHHT = PE.conwayNumber('HHT', 'HHT');
assert(cHHT === 8, 'conwayNumber(HHT, HHT) = 8 (got ' + cHHT + ')');

// 交叉：HHT 对 THH
var cHTTH = PE.conwayNumber('HHT', 'THH');
assert(cHTTH === 2, 'conwayNumber(HHT, THH) = 2 (got ' + cHTTH + ')');

// ── 胜率测试 ──
console.log('\n胜率计算:');

// 经典对局：THH vs HHT，THH 应该赢 (概率 3/4)
var p1 = PE.winProbability('HHT', 'THH');
assertApprox(p1, 0.75, 0.001, 'THH 对 HHT 胜率 = 75%');

// HHH vs THH
var p2 = PE.winProbability('HHH', 'THH');
assertApprox(p2, 0.875, 0.001, 'THH 对 HHH 胜率 = 87.5%');

// TTT vs HTT
var p3 = PE.winProbability('TTT', 'HTT');
assertApprox(p3, 0.875, 0.001, 'HTT 对 TTT 胜率 = 87.5%');

// 对称性测试：P(A beats B) + P(B beats A) = 1
var pAB = PE.winProbability('HTH', 'THH');
var pBA = PE.winProbability('THH', 'HTH');
assertApprox(pAB + pBA, 1.0, 0.001, '胜率互补: P(A>B) + P(B>A) = 1');

// ── 最优对策测试 ──
console.log('\n最优对策:');

// 最优对策公式：B̅AB（甲第二位的反面 + 甲的前两位）
assert(PE.optimalCounter('HHH') === 'THH', 'HHH → THH');
assert(PE.optimalCounter('HHT') === 'THH', 'HHT → THH');
assert(PE.optimalCounter('HTH') === 'HHT', 'HTH → HHT');
assert(PE.optimalCounter('HTT') === 'HHT', 'HTT → HHT');
assert(PE.optimalCounter('THH') === 'TTH', 'THH → TTH');
assert(PE.optimalCounter('THT') === 'TTH', 'THT → TTH');
assert(PE.optimalCounter('TTH') === 'HTT', 'TTH → HTT');
assert(PE.optimalCounter('TTT') === 'HTT', 'TTT → HTT');

// 验证最优对策的胜率都 >= 60%
console.log('\n最优对策胜率验证:');
PE.ALL_SEQUENCES.forEach(function(seq) {
  var counter = PE.optimalCounter(seq);
  var winRate = PE.winProbability(seq, counter);
  assert(winRate >= 0.6, counter + ' 对 ' + seq + ' 胜率 ' + PE.formatPct(winRate) + ' >= 60%');
});

// ── 蒙特卡洛模拟验证 ──
console.log('\n蒙特卡洛模拟:');

var simResult = PE.simulate('HHT', 'THH', 10000);
assertApprox(simResult.winRateB, 0.75, 0.04, '模拟 THH vs HHT ≈ 75% (n=10000)');
assert(simResult.avgFlips > 3 && simResult.avgFlips < 20, '平均抛硬币次数合理 (got ' + simResult.avgFlips.toFixed(1) + ')');

var simResult2 = PE.simulate('HHH', 'THH', 10000);
assertApprox(simResult2.winRateB, 0.875, 0.04, '模拟 THH vs HHH ≈ 87.5% (n=10000)');

// ── 非传递性验证 ──
console.log('\n优势链:');

// 三位序列中不存在严格的 A>B>C>A 环（因为很多对局恰好 50%），
// 但后手对每个先手选择都有优势（>= 2/3）——这就是"非传递性"的体现
var chains = PE.findDominanceChains();
assert(chains.length > 0, '存在优势链 (找到 ' + chains.length + ' 个)');

// 验证核心性质：没有任何序列能同时打败其他所有序列
var seqs = PE.ALL_SEQUENCES;
var hasUnbeatable = false;
for (var i = 0; i < seqs.length; i++) {
  var beatsAll = true;
  for (var j = 0; j < seqs.length; j++) {
    if (i === j) continue;
    var p = PE.winProbability(seqs[j], seqs[i]);
    if (p <= 0.5) { beatsAll = false; break; }
  }
  if (beatsAll) hasUnbeatable = true;
}
assert(!hasUnbeatable, '没有"无敌序列"——非传递性成立');

// ── 胜率矩阵验证 ──
console.log('\n胜率矩阵:');
var matrix = PE.buildWinMatrix();
assert(matrix.length === 8, '矩阵为 8x8');
assert(matrix[0][0] === 0.5, '对角线为 0.5');

// 验证后手总有 >= 60% 胜率的对策
PE.ALL_SEQUENCES.forEach(function(seq, j) {
  var maxRate = 0;
  for (var i = 0; i < 8; i++) {
    if (i !== j && matrix[i][j] > maxRate) maxRate = matrix[i][j];
  }
  assert(maxRate >= 0.6, '对 ' + seq + ' 存在 >= 60% 的克制序列 (最高 ' + PE.formatPct(maxRate) + ')');
});

// ── 格式化 ──
console.log('\n格式化:');
assert(PE.formatSeq('HHT') === '正正反', 'formatSeq(HHT) = 正正反');
assert(PE.formatSeq('TTH') === '反反正', 'formatSeq(TTH) = 反反正');
assert(PE.formatPct(0.75) === '75.0%', 'formatPct(0.75) = 75.0%');

// ── simulateOneGame 基本验证 ──
console.log('\n单局模拟:');
var game = PE.simulateOneGame('HHT', 'THH');
assert(game.winner === 'A' || game.winner === 'B', '返回有效胜者');
assert(game.coins.length >= 3, '至少抛3次硬币');
var lastThree = game.coins.slice(-3).join('');
assert(lastThree === 'HHT' || lastThree === 'THH', '最后三个硬币匹配某个序列');

// ── 结果汇总 ──
console.log('\n' + '='.repeat(40));
console.log('总计: ' + (passed + failed) + ' 测试, ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) {
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}
