/**
 * Diffie-Hellman engine.js — 单元测试（Node 直接运行）
 * 运行：node pages/diffie-hellman/engine.test.js
 */
var assert = require('assert');
var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assertEq(actual, expected, msg) {
  try {
    assert.strictEqual(actual, expected, msg);
    passed++;
    console.log('✅ ' + msg);
  } catch (e) {
    failed++;
    console.error('❌ ' + msg + ' — expected=' + expected + ' actual=' + actual);
  }
}

function assertTrue(cond, msg) {
  try {
    assert.ok(cond, msg);
    passed++;
    console.log('✅ ' + msg);
  } catch (e) {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertClose(actual, expected, tol, msg) {
  try {
    assert.ok(Math.abs(actual - expected) <= tol, msg + ' (actual=' + actual + ')');
    passed++;
    console.log('✅ ' + msg);
  } catch (e) {
    failed++;
    console.error('❌ ' + msg + ' — expected≈' + expected + ' actual=' + actual);
  }
}

// ── 1. modPow 手算验证 ──
function testModPow() {
  // 5^3 mod 23 = 125 mod 23 = 125 - 115 = 10
  assertEq(engine.modPow(5, 3, 23), 10, '5^3 mod 23 = 10');
  // 2^10 mod 1000 = 1024 mod 1000 = 24
  assertEq(engine.modPow(2, 10, 1000), 24, '2^10 mod 1000 = 24');
  // 3^0 mod 7 = 1
  assertEq(engine.modPow(3, 0, 7), 1, '3^0 mod 7 = 1');
  // base > mod：13^2 mod 5 = 169 mod 5 = 4
  assertEq(engine.modPow(13, 2, 5), 4, '13^2 mod 5 = 4');
  // mod = 1 时任何结果都为 0
  assertEq(engine.modPow(123456, 789, 1), 0, 'mod=1 时结果为 0');
  // 大指数快速幂不溢出（结果正确）
  assertEq(engine.modPow(2, 50, 1000000), 842624, '2^50 mod 1000000 = 842624');
}

// ── 2. modPow 边界 ──
function testModPowEdge() {
  var threw = false;
  try { engine.modPow(2, 1, 0); } catch (e) { threw = true; }
  assertTrue(threw, 'mod=0 抛错');
  threw = false;
  try { engine.modPow(2, -1, 7); } catch (e) { threw = true; }
  assertTrue(threw, '负指数抛错');
}

// ── 3. DH 交换：双方共享密钥一致且 Eve 无法得到 ──
function testDhExchange() {
  var r = engine.dhExchange(23, 5, 6, 15);
  assertEq(r.A, 8, 'g=5,a=6,p=23 → A=8');
  assertEq(r.B, 19, 'g=5,b=15,p=23 → B=19');
  assertEq(r.sharedAlice, 2, '共享密钥 Alice=2');
  assertEq(r.sharedBob, 2, '共享密钥 Bob=2');
  assertEq(r.shared, 2, 'shared 字段=2');
  assertEq(r.eveSees.p, 23, 'Eve 看到 p');
  assertEq(r.eveSees.g, 5, 'Eve 看到 g');
  assertEq(r.eveSees.A, 8, 'Eve 看到 A');
  assertEq(r.eveSees.B, 19, 'Eve 看到 B');
  // Eve 的可见集合不包含 6/15/2（秘密数与密钥）
  var visible = [r.eveSees.p, r.eveSees.g, r.eveSees.A, r.eveSees.B];
  assertTrue(visible.indexOf(6) === -1, 'Eve 看不到 Alice 的秘密数 a=6');
  assertTrue(visible.indexOf(15) === -1, 'Eve 看不到 Bob 的秘密数 b=15');
  assertTrue(visible.indexOf(2) === -1, 'Eve 看不到共享密钥 2');
}

// ── 4. DH 随机秘密数：任何参数下共享一致 ──
function testDhSharedAlwaysEqual() {
  var p = 97, g = 5;
  for (var a = 1; a <= 30; a++) {
    for (var b = 1; b <= 30; b++) {
      var r = engine.dhExchange(p, g, a, b);
      if (r.sharedAlice !== r.sharedBob) {
        assertEq(r.sharedAlice, r.sharedBob, 'a=' + a + ' b=' + b + ' 共享密钥一致');
        return;
      }
    }
  }
  passed++;
  console.log('✅ 30×30 组合共享密钥全部一致');
}

// ── 5. isPrime ──
function testIsPrime() {
  assertEq(engine.isPrime(2), true, '2 是素数');
  assertEq(engine.isPrime(23), true, '23 是素数');
  assertEq(engine.isPrime(97), true, '97 是素数');
  assertEq(engine.isPrime(1), false, '1 不是素数');
  assertEq(engine.isPrime(0), false, '0 不是素数');
  assertEq(engine.isPrime(21), false, '21 不是素数');
  assertEq(engine.isPrime(100), false, '100 不是素数');
}

// ── 6. 颜色混合 ──
function testMixColor() {
  var m = engine.mixColor({ r: 100, g: 100, b: 100 }, { r: 200, g: 200, b: 200 });
  assertEq(m.r, 150, '混合取平均 r');
  assertEq(m.g, 150, '混合取平均 g');
  assertEq(m.b, 150, '混合取平均 b');
  // 最终共享色 = 三色一次平均，双方天然一致（与顺序无关）
  var shared1 = engine.mixColor3(engine.BASE_COLOR, engine.SECRET_COLORS.red, engine.SECRET_COLORS.green);
  var shared2 = engine.mixColor3(engine.BASE_COLOR, engine.SECRET_COLORS.green, engine.SECRET_COLORS.red);
  assertEq(shared1.r, shared2.r, '共享色与混合顺序无关 r');
  assertEq(shared1.g, shared2.g, '共享色与混合顺序无关 g');
  assertEq(shared1.b, shared2.b, '共享色与混合顺序无关 b');
  // 共享色 = 基准色三分位处（(255+220+40)/3≈171.7 → 172）
  assertEq(shared1.r, 172, '三色平均 r=172');
}

// ── 7. 题库结构合法 ──
function testQuizStructure() {
  assertEq(engine.QUIZ.length, 5, '题库共 5 题');
  engine.QUIZ.forEach(function (q, i) {
    assertTrue(q.question && q.question.length > 0, '第 ' + (i + 1) + ' 题有题干');
    assertTrue(q.options.length >= 2, '第 ' + (i + 1) + ' 题至少 2 个选项');
    assertTrue(q.answer >= 0 && q.answer < q.options.length, '第 ' + (i + 1) + ' 题答案下标合法');
    assertTrue(q.explain && q.explain.length > 0, '第 ' + (i + 1) + ' 题有解析');
  });
}

// ── 8. 判分 ──
function testGradeQuiz() {
  var allCorrect = engine.gradeQuiz([1, 0, 0, 0, 1]);
  assertEq(allCorrect.correctCount, 5, '全对得 5 分');
  assertEq(allCorrect.total, 5, '总分 5');
  assertEq(JSON.stringify(allCorrect.perQuestion), '[1,1,1,1,1]', '每题对错 [1,1,1,1,1]');

  var none = engine.gradeQuiz([0, 1, 1, 1, 0]);
  assertEq(none.correctCount, 0, '全错得 0 分');
  assertEq(JSON.stringify(none.perQuestion), '[0,0,0,0,0]', '每题对错 [0,0,0,0,0]');

  var mixed = engine.gradeQuiz([0, 0, 0, 0, 1]);
  assertEq(mixed.correctCount, 4, '只错第1题（Q1答案=1，Q2/3/4答案=0，Q5答案=1）');
}

// ── 9. 判分边界 ──
function testGradeQuizEdge() {
  var threw = false;
  try { engine.gradeQuiz([1, 0]); } catch (e) { threw = true; }
  assertTrue(threw, '答案数量不符抛错');
  threw = false;
  try { engine.gradeQuiz(null); } catch (e) { threw = true; }
  assertTrue(threw, 'null 答案抛错');
}

// ── 10. 随机猜测期望 ──
function testRandomGuess() {
  var exp = engine.randomGuessExpectation(5);
  // 选项数 2/3/3/3/2 → 0.5+0.333+0.333+0.333+0.5 = 2.0
  assertClose(exp, 2.0, 0.01, '随机猜 5 题期望 ≈2.0');
}

testModPow();
testModPowEdge();
testDhExchange();
testDhSharedAlwaysEqual();
testIsPrime();
testMixColor();
testQuizStructure();
testGradeQuiz();
testGradeQuizEdge();
testRandomGuess();

console.log('\n==============================');
console.log('passed: ' + passed + '  failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);
