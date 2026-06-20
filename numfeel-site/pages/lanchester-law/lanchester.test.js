/*
 * lanchester.test.js — 纯 node 单元测试
 * 运行：node pages/lanchester-law/lanchester.test.js
 */
var L = require('./lanchester.js');

var passed = 0;
var failed = 0;

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL: ' + msg);
  }
}

function approx(a, b, tol) {
  return Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
}

// ── 平方律预测 ────────────────────────────────────────────
(function testPredictSquare() {
  // 经典 5v4：25-16=9 → 赢家剩 sqrt(9)=3
  var r = L.predictSquare(5, 4);
  ok(r.winner === 'A', '5v4 平方律应 A 胜，实际 ' + r.winner);
  ok(approx(r.survivors, 3), '5v4 赢家应剩 3，实际 ' + r.survivors);

  // 5v5 平局
  var d = L.predictSquare(5, 5);
  ok(d.winner === 'draw', '5v5 应平局，实际 ' + d.winner);

  // 5v3：25-9=16 → 剩 4
  var r2 = L.predictSquare(5, 3);
  ok(approx(r2.survivors, 4), '5v3 赢家应剩 4，实际 ' + r2.survivors);

  // gank 5v2：25-4=21 → sqrt≈4.58
  var r3 = L.predictSquare(5, 2);
  ok(approx(r3.survivors, Math.sqrt(21)), '5v2 赢家应剩 sqrt(21)');

  // 人少的一方必输（B 多）
  var r4 = L.predictSquare(4, 5);
  ok(r4.winner === 'B', '4v5 应 B 胜');
})();

// ── 线性律预测：是大众的「线性直觉」，5v4 只剩 1 ──────────
(function testPredictLinear() {
  var r = L.predictLinear(5, 4);
  ok(r.winner === 'A', '5v4 线性律 A 胜');
  ok(approx(r.survivors, 1), '5v4 线性律赢家剩 1，实际 ' + r.survivors);

  // 对比：平方律剩 3，线性律剩 1，平方律放大了优势
  var sq = L.predictSquare(5, 4).survivors;
  var ln = L.predictLinear(5, 4).survivors;
  ok(sq > ln, '同样 5v4，平方律幸存(' + sq + ') 应大于线性律(' + ln + ')');
})();

// ── 守恒量符号：决定胜负 ──────────────────────────────────
(function testConservation() {
  ok(L.predictSquare(5, 4).k > 0, '5v4 守恒量 k 应为正(A 胜)');
  ok(L.predictSquare(4, 5).k < 0, '4v5 守恒量 k 应为负(B 胜)');
  ok(L.predictSquare(5, 5).k === 0, '5v5 守恒量 k 应为 0');
})();

// ── 单兵强度不同：质量能弥补数量 ──────────────────────────
(function testStrength() {
  // B 人少但每个更强：4 个 sB=2 vs 5 个 sA=1 → sB*b²=32 > sA*a²=25 → B 胜
  var r = L.predictSquare(5, 4, 1, 2);
  ok(r.winner === 'B', '5(弱) vs 4(强2倍) 应 B 胜，实际 ' + r.winner);
})();

// ── 逐 tick 模拟（pure 模式）应逼近平方律解析解 ──────────
(function testSimulatePure() {
  var res = L.runBattle({ a: 5, b: 4, hp: 100, dpsA: 20, dpsB: 20, dt: 0.02, mode: 'pure' });
  ok(res.winner === 'A', 'pure 5v4 模拟应 A 胜，实际 ' + res.winner);
  ok(res.survivorsB === 0, 'pure 5v4 模拟 B 应团灭，实际剩 ' + res.survivorsB);
  ok(res.survivorsA === 3, 'pure 5v4 模拟 A 应剩 3（对应 sqrt(9)），实际剩 ' + res.survivorsA);

  // 5v5 pure：完全对称，应几乎同归于尽（最多各剩 0~1）
  var even = L.runBattle({ a: 5, b: 5, hp: 100, dpsA: 20, dpsB: 20, dt: 0.02, mode: 'pure' });
  ok(even.survivorsA <= 1 && even.survivorsB <= 1, '5v5 pure 应惨烈，双方残存 ≤1');
})();

// ── 人多必胜（pure 模式遍历）────────────────────────────
(function testBiggerWins() {
  for (var b = 1; b <= 6; b++) {
    var res = L.runBattle({ a: 7, b: b, hp: 80, dpsA: 15, dpsB: 15, dt: 0.02, mode: 'pure' });
    ok(res.winner === 'A', '7v' + b + ' pure A 应胜，实际 ' + res.winner);
    // 幸存应接近 sqrt(49 - b²)
    var expect = Math.round(Math.sqrt(49 - b * b));
    ok(Math.abs(res.survivorsA - expect) <= 1, '7v' + b + ' 幸存应约 ' + expect + '，实际 ' + res.survivorsA);
  }
})();

// ── 模拟结果与解析预测一致性 ──────────────────────────────
(function testSimMatchesPrediction() {
  var combos = [[6, 4], [8, 3], [5, 2], [7, 5]];
  for (var i = 0; i < combos.length; i++) {
    var a = combos[i][0], b = combos[i][1];
    var pred = L.predictSquare(a, b);
    var sim = L.runBattle({ a: a, b: b, hp: 100, dpsA: 20, dpsB: 20, dt: 0.02, mode: 'pure' });
    ok(sim.winner === pred.winner, a + 'v' + b + ' 模拟胜者应与预测一致');
    ok(Math.abs(sim.survivorsA - pred.survivors) <= 1,
      a + 'v' + b + ' 模拟幸存(' + sim.survivorsA + ') 应接近预测(' + pred.survivors.toFixed(2) + ')');
  }
})();

// ── random 模式：可复现 + 大优势下仍大概率获胜 ──────────
(function testRandom() {
  var r1 = L.runBattle({ a: 5, b: 4, hp: 100, dpsA: 20, dpsB: 20, dt: 0.02, mode: 'random', seed: 123 });
  var r2 = L.runBattle({ a: 5, b: 4, hp: 100, dpsA: 20, dpsB: 20, dt: 0.02, mode: 'random', seed: 123 });
  ok(r1.winner === r2.winner && r1.survivorsA === r2.survivorsA, 'random 同 seed 应可复现');

  var mc = L.monteCarlo({ a: 5, b: 4, hp: 100, dpsA: 20, dpsB: 20, dt: 0.02 }, 200);
  ok(mc.aWins + mc.bWins + mc.draws === 200, '蒙特卡洛场次应守恒');
  ok(mc.aWins > mc.bWins, '5v4 即使有随机，A 仍应大概率获胜（A:' + mc.aWins + ' B:' + mc.bWins + ')');
})();

// ── 汇总 ──────────────────────────────────────────────────
console.log('\n兰彻斯特平方律测试：' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) {
  process.exit(1);
}
