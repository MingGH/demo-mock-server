/**
 * engine.test.js — 拼多多砍一刀模拟器单元测试
 * 运行：node numfeel-site/pages/pdd-cut/engine.test.js
 */
var e = require('./engine.js');

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.error('  ❌ ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= (tol || 1e-6);
  if (ok) { passed++; console.log('  ✅ ' + msg + ' (actual=' + actual + ')'); }
  else { failed++; console.error('  ❌ ' + msg + ' (expected=' + expected + ', actual=' + actual + ')'); }
}

// ============================================================
console.log('\n=== cutOnce 三段式衰减 ===');

(function () {
  // 前段：progress=0.3, weight=5, rand=0.5 → factor = 0.15 + 0.35*0.5 = 0.325
  var v = e.cutOnce(100, 5, 0.3, 0.5);
  assertClose(v, 32.5, 1e-9, '前段 rand=0.5 时砍 32.5 元');
})();

(function () {
  // 减速带：progress=0.7, weight=5, rand=1 → factor = 0.07
  var v = e.cutOnce(100, 5, 0.7, 1);
  assertClose(v, 7, 1e-9, '减速带 rand=1 时砍 7 元');
})();

(function () {
  // 芝诺段：progress=0.95, weight=5, rand=0.5 → factor ≈ 0.0006
  var v = e.cutOnce(100, 5, 0.95, 0.5);
  assert(v < 0.1, '芝诺段：单刀 < 0.1 元');
  assert(v > 0, '芝诺段：仍然 > 0');
})();

(function () {
  // 权重影响：老用户权重是新用户的 0.06 倍
  var newV = e.cutOnce(100, 5, 0.3, 0.5);
  var oldV = e.cutOnce(100, 0.3, 0.3, 0.5);
  assertClose(oldV, newV * 0.06, 1e-9, '权重线性缩放：老用户 = 新用户 × 0.06');
})();

(function () {
  var v = e.cutOnce(0, 5, 0.3, 0.5);
  assert(v === 0, '边界：remain=0 返回 0');
  var v2 = e.cutOnce(-10, 5, 0.3, 0.5);
  assert(v2 === 0, '边界：remain<0 返回 0');
})();

// ============================================================
console.log('\n=== simulateRun 全新用户场景 ===');

(function () {
  var friends = [];
  for (var i = 0; i < 20; i++) friends.push({ type: 'new' });
  var r = e.simulateRun({ target: 100, friends: friends, seed: 42 });
  assert(r.cuts.length <= 20, '20 个新用户：刀数 <= 20');
  assert(r.remain >= 0, '剩余非负');
  assert(r.remain < 100, '剩余 < 起始金额（至少砍了一点）');
  assert(r.progress > 0 && r.progress <= 1, '进度在 (0,1]');
})();

(function () {
  // 可复现：同 seed 同 friends 得到同结果
  var friends = [];
  for (var i = 0; i < 30; i++) friends.push({ type: 'new' });
  var a = e.simulateRun({ target: 100, friends: friends, seed: 12345 });
  var b = e.simulateRun({ target: 100, friends: friends, seed: 12345 });
  assertClose(a.remain, b.remain, 1e-12, '同 seed → 相同剩余');
  assert(a.cuts.length === b.cuts.length, '同 seed → 相同刀数');
})();

// ============================================================
console.log('\n=== simulateRun 芝诺收敛 ===');

(function () {
  // 大量帮砍（全新用户 1000 个），验证芝诺收敛
  var friends = [];
  for (var i = 0; i < 1000; i++) friends.push({ type: 'new' });
  var r = e.simulateRun({ target: 100, friends: friends, seed: 7 });
  // 前 100 刀应该到 90%+
  var cut100 = r.cuts[Math.min(99, r.cuts.length - 1)];
  assert(cut100.progress > 0.9, '前 100 刀应该到 90%+');
  // 后段单刀衰减极慢
  var late = r.cuts[r.cuts.length - 1];
  assert(late.amount < 0.01, '后段单刀 < 0.01 元');
})();

// ============================================================
console.log('\n=== simulateBotAttack 破产阈值 ===');

(function () {
  // 目标 2000 元手机，CAC 200 元，1000 个黑产号
  var r = e.simulateBotAttack(2000, 1000, 200, 20240101);
  assert(r.safe === true, '1000 个黑产：平台安全（totalCut < CAC）');
  assert(r.totalCut < 200, '总砍价 < 200 元');
  assert(r.remain > 1800, '剩余 > 1800');
})();

(function () {
  // 一万个黑产：还是砍不动
  var r = e.simulateBotAttack(2000, 10000, 200, 42);
  assert(r.safe === true, '10000 个黑产：仍然砍不到 CAC');
})();

// ============================================================
console.log('\n=== buildDecayCurve 曲线单调递减 ===');

(function () {
  var curve = e.buildDecayCurve(100, [{ type: 'new', count: 50 }], 3);
  assert(curve.length >= 2, '曲线至少含起点和一刀');
  assertClose(curve[0], 100, 1e-9, '起点 = 目标金额');
  var ok = true;
  for (var i = 1; i < curve.length; i++) {
    if (curve[i] > curve[i - 1] + 1e-9) { ok = false; break; }
  }
  assert(ok, '剩余金额单调不增（砍的钱不会补回来）');
})();

// ============================================================
console.log('\n=== 权重表和边界 ===');

(function () {
  assert(e.WEIGHTS['new'] === 5, '新用户权重 = 5');
  assert(e.WEIGHTS['bot'] === 0.0001, '黑产权重 = 0.0001');
  assert(e.WEIGHTS['new'] / e.WEIGHTS['bot'] === 50000, '新用户 = 黑产 × 50000');
})();

(function () {
  var r = e.simulateRun({ target: 100, friends: [], seed: 1 });
  assert(r.success === false, '空好友：不成功');
  assertClose(r.remain, 100, 1e-9, '空好友：剩余 = 目标');
  assert(r.cuts.length === 0, '空好友：0 刀');
})();

(function () {
  var r = e.simulateRun({ target: 0, friends: [{ type: 'new' }], seed: 1 });
  assert(r.success === true, 'target=0：立即成功');
})();

// ============================================================
console.log('\n=== 结果 ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
