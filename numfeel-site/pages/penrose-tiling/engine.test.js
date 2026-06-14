/**
 * Penrose Tiling Engine 单元测试
 * 运行: node pages/penrose-tiling/engine.test.js
 */
var engine = require('./engine.js');

var passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

function assertApprox(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) < tol;
  if (ok) { passed++; console.log('  ✓ ' + msg + ' (' + actual.toFixed(4) + ')'); }
  else { failed++; console.error('  ✗ ' + msg + ' (got ' + actual + ', want ≈' + expected + ')'); }
}

console.log('\n[基础]');
assertApprox(engine.goldenRatio, 1.618, 0.001, 'φ');

console.log('\n[初始化]');
var sun = engine.createSun(0, 0, 100);
assert(sun.length === 10, 'Sun = 10 三角形');
assert(sun.every(function(t){ return t.type === 'tR' || t.type === 'tL'; }), '全是 Thin');

console.log('\n[膨胀]');
var sub1 = engine.inflateOnce(sun);
// 10 个 Thin → 每个产出 2 个 = 20
assert(sub1.length === 20, '10 Thin → 20 (got ' + sub1.length + ')');

var sub2 = engine.inflateOnce(sub1);
// 20个中: Thin→2, Thick→3
var thin1 = sub1.filter(function(t){ return engine.isThin(t); }).length;
var thick1 = sub1.filter(function(t){ return engine.isThick(t); }).length;
var expected2 = thin1 * 2 + thick1 * 3;
assert(sub2.length === expected2, '第2层: ' + expected2 + ' (got ' + sub2.length + ')');

console.log('\n[多层]');
var sub5 = engine.subdivide(sun, 5);
assert(sub5.length > 500, '5层 > 500 (got ' + sub5.length + ')');

console.log('\n[胖/瘦比 → φ]');
var thick5 = sub5.filter(function(t){ return engine.isThick(t); }).length;
var thin5 = sub5.filter(function(t){ return engine.isThin(t); }).length;
assertApprox(thick5 / thin5, engine.goldenRatio, 0.1, '5层 thick/thin ≈ φ');

var sub7 = engine.subdivide(sun, 7);
var thick7 = sub7.filter(function(t){ return engine.isThick(t); }).length;
var thin7 = sub7.filter(function(t){ return engine.isThin(t); }).length;
assertApprox(thick7 / thin7, engine.goldenRatio, 0.02, '7层 thick/thin ≈ φ');

console.log('\n[顶点有效]');
var valid = sub5.every(function(t) {
  return isFinite(t.v1[0]) && isFinite(t.v1[1]) &&
         isFinite(t.v2[0]) && isFinite(t.v2[1]) &&
         isFinite(t.v3[0]) && isFinite(t.v3[1]);
});
assert(valid, '所有顶点有效');

console.log('\n[面积守恒]');
function area(t) {
  var ax = t.v2[0]-t.v1[0], ay = t.v2[1]-t.v1[1];
  var bx = t.v3[0]-t.v1[0], by = t.v3[1]-t.v1[1];
  return Math.abs(ax*by - ay*bx) / 2;
}
var a0 = sun.reduce(function(s,t){ return s + area(t); }, 0);
var a5 = sub5.reduce(function(s,t){ return s + area(t); }, 0);
assertApprox(a5, a0, a0 * 0.01, '面积守恒');

console.log('\n' + '─'.repeat(40));
console.log('通过: ' + passed + ', 失败: ' + failed);
if (failed > 0) process.exit(1);
