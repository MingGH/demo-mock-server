// ========== 必胜策略游戏 单元测试 ==========
// 运行：node pages/winning-strategy/winning-strategy.test.js

const {
  bashIsFirstWin, bashOptimalTake, bashAiMove,
  wythoffIsCold, wythoffColdPositions, wythoffFindOptimal, wythoffAiMove,
  coinNimValue, coinIsFirstWin, coinFindOptimal, coinAiMove, coinGenerateInitial,
  PHI
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

function assertEq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg + ' — expected ' + expected + ', got ' + actual); }
}

function assertDeepEq(actual, expected, msg) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg + ' — expected ' + b + ', got ' + a); }
}

// ── 巴什博弈测试 ──────────────────────────────────────────
console.log('\n=== 巴什博弈 ===');

assertEq(bashIsFirstWin(21, 3), true, '21石子取1-3：先手必胜');
assertEq(bashIsFirstWin(20, 3), false, '20石子取1-3：先手必败');
assertEq(bashIsFirstWin(16, 3), false, '16石子取1-3：先手必败');
assertEq(bashIsFirstWin(1, 3), true, '1石子：先手必胜');
assertEq(bashIsFirstWin(4, 3), false, '4石子取1-3：先手必败');
assertEq(bashIsFirstWin(5, 3), true, '5石子取1-3：先手必胜');
assertEq(bashIsFirstWin(10, 4), false, '10石子取1-4：先手必败');
assertEq(bashIsFirstWin(13, 4), true, '13石子取1-4：先手必胜');

assertEq(bashOptimalTake(21, 3), 1, '21%4=1，取1');
assertEq(bashOptimalTake(20, 3), 0, '20%4=0，必败态');
assertEq(bashOptimalTake(7, 3), 3, '7%4=3，取3');
assertEq(bashOptimalTake(9, 3), 1, '9%4=1，取1');
assertEq(bashOptimalTake(13, 4), 3, '13%5=3，取3');

// AI 走法范围
for (var i = 0; i < 20; i++) {
  var move = bashAiMove(10, 3, 'easy');
  assert(move >= 1 && move <= 3, 'AI easy 走法范围 1-3');
}
// 困难 AI 必胜态走最优
var optCount = 0;
for (var i = 0; i < 50; i++) {
  if (bashAiMove(9, 3, 'hard') === 1) optCount++;
}
assertEq(optCount, 50, '困难AI n=9 m=3 100%取1');


// ── 威佐夫博弈测试 ──────────────────────────────────────────
console.log('\n=== 威佐夫博弈 ===');

assertEq(wythoffIsCold(0, 0), true, '(0,0) 冷');
assertEq(wythoffIsCold(1, 2), true, '(1,2) 冷');
assertEq(wythoffIsCold(2, 1), true, '(2,1) 冷（对称）');
assertEq(wythoffIsCold(3, 5), true, '(3,5) 冷');
assertEq(wythoffIsCold(4, 7), true, '(4,7) 冷');
assertEq(wythoffIsCold(6, 10), true, '(6,10) 冷');
assertEq(wythoffIsCold(8, 13), true, '(8,13) 冷');
assertEq(wythoffIsCold(1, 1), false, '(1,1) 热');
assertEq(wythoffIsCold(2, 3), false, '(2,3) 热');
assertEq(wythoffIsCold(5, 7), false, '(5,7) 热');

var cold = wythoffColdPositions(6);
assertDeepEq(cold[0], [0, 0], '第0个冷局面');
assertDeepEq(cold[1], [1, 2], '第1个冷局面');
assertDeepEq(cold[2], [3, 5], '第2个冷局面');
assertDeepEq(cold[3], [4, 7], '第3个冷局面');
assertDeepEq(cold[4], [6, 10], '第4个冷局面');
assertDeepEq(cold[5], [8, 13], '第5个冷局面');

// 最优走法验证
var opt1 = wythoffFindOptimal(3, 3);
assert(opt1 !== null, '(3,3) 有最优');
assert(wythoffIsCold(opt1.toA, opt1.toB), '(3,3) 最优走到冷局面');

assertEq(wythoffFindOptimal(1, 2), null, '(1,2) 冷局面无最优');

var opt2 = wythoffFindOptimal(7, 10);
assert(opt2 !== null, '(7,10) 有最优');
assert(wythoffIsCold(opt2.toA, opt2.toB), '(7,10) 最优走到冷局面');

// AI 走法有效性
for (var i = 0; i < 20; i++) {
  var m = wythoffAiMove(5, 8, 'easy');
  assert(m.toA >= 0 && m.toB >= 0, 'AI结果非负');
  assert(m.toA <= 5 && m.toB <= 8, 'AI不超原值');
  assert(m.toA < 5 || m.toB < 8, 'AI必须操作');
}


// ── 硬币翻转游戏测试 ──────────────────────────────────────
console.log('\n=== 硬币翻转游戏 ===');

// coinNimValue: XOR of positions of heads
assertEq(coinNimValue([true, false, false]), 0, '[H,T,T] XOR=0');
assertEq(coinNimValue([false, true, false]), 1, '[T,H,T] XOR=1');
assertEq(coinNimValue([true, true, false]), 1, '[H,H,T] XOR=0^1=1');
assertEq(coinNimValue([true, false, true]), 2, '[H,T,H] XOR=0^2=2');
assertEq(coinNimValue([false, true, true]), 3, '[T,H,H] XOR=1^2=3');
// 0^1^2 = 3
assertEq(coinNimValue([true, true, true, false]), 3, '[H,H,H,T] XOR=0^1^2=3');

// coinIsFirstWin
assertEq(coinIsFirstWin([true, false, false]), false, '[H,T,T] pos=0, XOR=0, 先手必败');
assertEq(coinIsFirstWin([false, true, false]), true, '[T,H,T] pos=1, XOR=1, 先手必胜');
assertEq(coinIsFirstWin([true, false, true]), true, '[H,T,H] XOR=2, 先手必胜');
// (0,0) 是冷局面的等价：只有位置0有正面 → XOR=0 → 先手必败
assertEq(coinIsFirstWin([true, false, false, false]), false, '只有#0正面 → XOR=0 先手必败');

// coinFindOptimal
var opt3 = coinFindOptimal([false, true, false]);
assert(opt3 !== null, '[T,H,T] 有最优走法');
assertEq(opt3.flip, 1, '必须翻位置1');
// 翻完后应全反面或 XOR=0
var testCoins1 = [false, true, false].slice();
testCoins1[opt3.flip] = false;
if (opt3.alsoFlip !== null && opt3.alsoFlip !== undefined) testCoins1[opt3.alsoFlip] = !testCoins1[opt3.alsoFlip];
assertEq(coinNimValue(testCoins1), 0, '最优走法后 XOR=0');

var opt4 = coinFindOptimal([true, false, true]);
assert(opt4 !== null, '[H,T,H] 有最优走法');
var testCoins2 = [true, false, true].slice();
testCoins2[opt4.flip] = false;
if (opt4.alsoFlip !== null && opt4.alsoFlip !== undefined) testCoins2[opt4.alsoFlip] = !testCoins2[opt4.alsoFlip];
assertEq(coinNimValue(testCoins2), 0, '[H,T,H] 最优后 XOR=0');

// 先手必败态无最优走法
assertEq(coinFindOptimal([true, false, false]), null, '[H,T,T] XOR=0 无最优');

// coinGenerateInitial 至少2个正面
for (var i = 0; i < 20; i++) {
  var c = coinGenerateInitial(8);
  var heads = c.filter(function(x) { return x; }).length;
  assert(heads >= 2, 'generateInitial 至少2正面');
  assertEq(c.length, 8, 'generateInitial 长度=8');
}

// coinAiMove 有效性
for (var i = 0; i < 20; i++) {
  var coins = coinGenerateInitial(8);
  var m = coinAiMove(coins, 'easy');
  if (m) {
    assert(m.flip >= 0 && m.flip < 8, 'AI flip 范围');
    assert(coins[m.flip] === true, 'AI 只翻正面');
    if (m.alsoFlip !== null && m.alsoFlip !== undefined) {
      assert(m.alsoFlip >= 0 && m.alsoFlip < m.flip, 'alsoFlip < flip');
    }
  }
}

// 困难 AI 在必胜局面应走最优
var winCoins = [false, true, true, false, false]; // pos 1,2, XOR=1^2=3≠0 必胜
for (var i = 0; i < 30; i++) {
  var m = coinAiMove(winCoins, 'hard');
  var after = winCoins.slice();
  after[m.flip] = false;
  if (m.alsoFlip !== null && m.alsoFlip !== undefined) after[m.alsoFlip] = !after[m.alsoFlip];
  assertEq(coinNimValue(after), 0, '困难AI必胜局面走后XOR=0');
}


// ── 结果汇总 ──────────────────────────────────────────────
console.log('\n' + '='.repeat(40));
console.log('结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) { process.exit(1); }
else { console.log('✓ 全部通过！'); }
