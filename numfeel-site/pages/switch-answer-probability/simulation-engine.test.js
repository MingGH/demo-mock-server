/**
 * simulation-engine.test.js — 排除选项后改答案 · 核心逻辑测试
 * 运行：node numfeel-site/pages/switch-answer-probability/simulation-engine.test.js
 */

var S = require('./simulation-engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
}

function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { console.log('✅ ' + msg + ' (actual=' + actual.toFixed(6) + ')'); passed++; }
  else { console.error('❌ ' + msg + ' expected=' + expected + ' actual=' + actual); failed++; }
}

function assertThrows(fn, msg) {
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (threw) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg + ' (未抛异常)'); failed++; }
}

// ─────────────────────────────────────────────────────────
// 1. simulateOneRound 基础测试
// ─────────────────────────────────────────────────────────
console.log('\n── 1. simulateOneRound 基础测试 ──');

(function () {
  var r = S.simulateOneRound(4, 2);
  var required = ['correctAnswer', 'initialChoice', 'eliminated', 'remainingOption', 'switchWins', 'stayWins'];
  assert(required.every(function (k) { return k in r; }), '返回对象包含所有必需字段');

  assert(r.correctAnswer >= 0 && r.correctAnswer <= 3, 'correctAnswer 在 [0,3] 范围内');
  assert(r.initialChoice >= 0 && r.initialChoice <= 3, 'initialChoice 在 [0,3] 范围内');
  assert(r.eliminated.length === 2, 'eliminated 数组长度 = eliminateCount(2)');
  assert(r.eliminated.indexOf(r.correctAnswer) === -1, '被排除的选项不包含 correctAnswer');
  assert(r.eliminated.indexOf(r.initialChoice) === -1, '被排除的选项不包含 initialChoice（即使它是错的）');
  assert(r.remainingOption !== r.initialChoice, 'remainingOption 不等于 initialChoice');
  assert(r.eliminated.indexOf(r.remainingOption) === -1, 'remainingOption 不在 eliminated 中');
  // 互斥：只剩两个选项时恰有一个对，switchWins XOR stayWins 恒为 true
  assert(r.switchWins !== r.stayWins, 'switchWins 与 stayWins 互斥（K=N-2 时恒一个对一个错）');
})();

// 多轮验证不变量（覆盖 initialChoice==correctAnswer 的情形）
(function () {
  var ok = true;
  for (var i = 0; i < 2000; i++) {
    var r = S.simulateOneRound(4, 2);
    if (r.eliminated.indexOf(r.correctAnswer) !== -1) { ok = false; break; }
    if (r.eliminated.indexOf(r.initialChoice) !== -1) { ok = false; break; }
    if (r.remainingOption === r.initialChoice) { ok = false; break; }
    if (r.eliminated.indexOf(r.remainingOption) !== -1) { ok = false; break; }
    if (r.switchWins === r.stayWins) { ok = false; break; }
  }
  assert(ok, '2000 轮 4选2 全部满足不变量');
})();

// ─────────────────────────────────────────────────────────
// 2. simulateBatch 统计测试
// ─────────────────────────────────────────────────────────
console.log('\n── 2. simulateBatch 统计测试 ──');

(function () {
  var stay = S.simulateBatch(10000, 'stay', 4, 2);
  assert(stay.total === 10000, 'stay total = 10000');
  assertClose(stay.rate, 0.25, 0.05, "stay 10000 轮正确率 ~0.25");

  var sw = S.simulateBatch(10000, 'switch', 4, 2);
  assertClose(sw.rate, 0.75, 0.05, "switch 10000 轮正确率 ~0.75");

  var rnd = S.simulateBatch(10000, 'random', 4, 2);
  assertClose(rnd.rate, 0.50, 0.05, "random 10000 轮正确率 ~0.50");
})();

// ─────────────────────────────────────────────────────────
// 3. theoreticalRate 精确计算
// ─────────────────────────────────────────────────────────
console.log('\n── 3. theoreticalRate 精确计算 ──');

assertClose(S.theoreticalRate('stay', 4, 2), 0.25, 1e-9, "(stay, N=4, K=2) = 0.25");
assertClose(S.theoreticalRate('switch', 4, 2), 0.75, 1e-9, "(switch, N=4, K=2) = 0.75");
assertClose(S.theoreticalRate('random', 4, 2), 0.5, 1e-9, "(random, N=4, K=2) = 0.5");
assertClose(S.theoreticalRate('stay', 3, 1), 1 / 3, 1e-9, "(stay, N=3, K=1) = 1/3（蒙提霍尔）");
assertClose(S.theoreticalRate('switch', 3, 1), 2 / 3, 1e-9, "(switch, N=3, K=1) = 2/3（经典蒙提霍尔）");
assertClose(S.theoreticalRate('switch', 5, 3), 0.8, 1e-9, "(switch, N=5, K=3) = 0.8 (K=N-2 退化)");

// K < N-2 的非退化情形：(N-1)/(N(N-1-K))
assertClose(S.theoreticalRate('switch', 6, 2), 5 / (6 * 3), 1e-9, "(switch, N=6, K=2) = 5/18");
assertClose(S.theoreticalRate('stay', 6, 2), 1 / 6, 1e-9, "(stay, N=6, K=2) = 1/6");

// ─────────────────────────────────────────────────────────
// 4. validateParams 边界测试
// ─────────────────────────────────────────────────────────
console.log('\n── 4. validateParams 边界测试 ──');

assert(S.validateParams(4, 2).valid === true, '(4,2) valid');
assert(S.validateParams(3, 1).valid === true, '(3,1) valid（最小蒙提霍尔）');
assert(S.validateParams(6, 3).valid === true, '(6,3) valid（K=N-2 边界）');
assert(S.validateParams(4, 3).valid === false, '(4,3) invalid（K > N-2，等于直接给答案）');
assert(S.validateParams(2, 0).valid === false, '(2,0) invalid（无信息增益）');
assert(S.validateParams(1, 0).valid === false, '(1,0) invalid（N 太小）');
assert(S.validateParams(4, 0).valid === false, '(4,0) invalid（K 必须 >=1）');
assert(S.validateParams(4, -1).valid === false, '(4,-1) invalid（K 负数）');

// 非法参数调用 simulateOneRound 应抛异常
assertThrows(function () { S.simulateOneRound(4, 3); }, 'simulateOneRound(4,3) 抛异常');
assertThrows(function () { S.simulateOneRound(1, 0); }, 'simulateOneRound(1,0) 抛异常');

// ─────────────────────────────────────────────────────────
// 汇总
// ─────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────');
console.log('通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) {
  process.exit(1);
}
