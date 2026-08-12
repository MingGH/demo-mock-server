/**
 * 爱荷华赌博任务 engine.js — 单元测试（Node 直接运行）
 * 运行：node pages/iowa-gambling-task/engine.test.js
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

// ── 1. 每堆每 10 张的净收益符合期望 ──
function testDeckExpectation() {
  ['A', 'B', 'C', 'D'].forEach(function (deck) {
    var g = engine.createGame();
    for (var i = 0; i < 10; i++) {
      g.drawCard(deck);
    }
    var state = g.getState();
    var net = state.deckNet[deck];
    assertEq(net, engine.DECK_NET_PER_TEN[deck], '牌堆 ' + deck + ' 每 10 张净收益=' + engine.DECK_NET_PER_TEN[deck]);
  });
}

// ── 2. 抽牌返回值字段完整 ──
function testDrawResult() {
  var g = engine.createGame();
  var r = g.drawCard('C');
  assertEq(r.gain, 50, 'C 堆每张收益 50');
  assertTrue(r.loss >= 0, 'C 堆损失为非负');
  assertEq(r.net, 50 - r.loss, '净收益 = 收益 - 损失');
  assertEq(r.money, 2000 + r.net, '资金按净收益累加');
  assertEq(r.trial, 1, '第 1 手');
  assertEq(r.over, false, '未结束');
}

// ── 3. 100 手后游戏结束 ──
function testGameEndsAfter100() {
  var g = engine.createGame();
  for (var i = 0; i < 100; i++) {
    var r = g.drawCard(i % 2 === 0 ? 'C' : 'D');
    if (r.over) break;
  }
  assertTrue(g.getState().over, '100 手后游戏结束');
  assertEq(g.getState().trial, 100, '正好 100 手');
}

// ── 4. 破产判定：一直抽坏堆 A ──
function testBankrupt() {
  var g = engine.createGame();
  var bankrupt = false;
  for (var i = 0; i < 100; i++) {
    var r = g.drawCard('A');
    if (r.over) { bankrupt = r.bankrupt; break; }
  }
  assertTrue(bankrupt, '持续抽 A 堆会破产');
  assertTrue(g.getState().trial < 100, '破产时未满 100 手');
}

// ── 5. 净分数计算：只抽 C/D 应为正 ──
function testNetScore() {
  var g = engine.createGame();
  for (var i = 0; i < 40; i++) {
    g.drawCard(i % 2 === 0 ? 'C' : 'D');
  }
  assertEq(g.netScore(), 40, '全抽好堆时净分数=手数');
}

// ── 6. 分块净分数 ──
function testBlockScores() {
  var g = engine.createGame();
  // 前 20 手全抽 A（-1/手），后 20 手全抽 C（+1/手）
  for (var i = 0; i < 20; i++) g.drawCard('A');
  for (var i = 0; i < 20; i++) g.drawCard('C');
  var blocks = g.blockScores();
  assertEq(blocks.length, 2, '40 手分成 2 块');
  assertEq(blocks[0], -20, '第一块全 A = -20');
  assertEq(blocks[1], 20, '第二块全 C = +20');
}

// ── 7. 洗牌随机：每局损失顺序不同，但 10 张总损失不变 ──
function testShuffleRandomness() {
  // 两次不同随机源的 10 手损失序列应大概率不同
  var r1 = makeRand(1);
  var r2 = makeRand(2);
  var losses1 = [], losses2 = [];
  var g1 = engine.createGame({ random: r1 });
  var g2 = engine.createGame({ random: r2 });
  for (var i = 0; i < 10; i++) {
    losses1.push(g1.drawCard('A').loss);
    losses2.push(g2.drawCard('A').loss);
  }
  var different = false;
  for (var j = 0; j < 10; j++) {
    if (losses1[j] !== losses2[j]) { different = true; break; }
  }
  assertTrue(different, '不同随机源下损失顺序不同（洗牌生效）');
  assertEq(sum(losses1), sum(losses2), '10 张总损失不变（期望一致）');
}

// ── 8. 同随机源可复现 ──
function testDeterministic() {
  var g1 = engine.createGame({ random: makeRand(42) });
  var g2 = engine.createGame({ random: makeRand(42) });
  for (var i = 0; i < 12; i++) {
    var r1 = g1.drawCard('B');
    var r2 = g2.drawCard('B');
    assertEq(r1.loss, r2.loss, '同随机源下 B 堆第 ' + (i + 1) + ' 手损失可复现');
  }
}

// ── 9. 边界：资金为正且未满 100 手不结束 ──
function testMoneyZeroNotBankrupt() {
  var g = engine.createGame({ random: makeRand(7) });
  // A 堆前 2 手：+100/张，损失从洗牌序列取
  var r1 = g.drawCard('A');
  var r2 = g.drawCard('A');
  assertEq(r2.money, 2000 + (100 - r1.loss) + (100 - r2.loss), 'A 堆抽 2 手后资金正确累加');
  assertTrue(r2.money > 0, '仅抽 2 手资金为正');
  assertEq(g.getState().over, false, '资金为正且未满 100 手不结束');
}

// ── 10. 抽牌已结束仍调用应抛错 ──
function testDrawAfterOverThrows() {
  var g = engine.createGame();
  for (var i = 0; i < 100; i++) g.drawCard(i % 2 === 0 ? 'C' : 'D');
  var threw = false;
  try {
    g.drawCard('A');
  } catch (e) {
    threw = true;
  }
  assertTrue(threw, '游戏结束后抽牌抛错');
}

// ── 11. 非法牌堆抛错 ──
function testInvalidDeckThrows() {
  var g = engine.createGame();
  var threw = false;
  try {
    g.drawCard('E');
  } catch (e) {
    threw = true;
  }
  assertTrue(threw, '非法牌堆抛错');
}

// ── 工具：确定性随机源（简单 LCG） ──
function makeRand(seed) {
  var s = seed;
  return function () {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function sum(arr) {
  return arr.reduce(function (a, b) { return a + b; }, 0);
}

testDeckExpectation();
testDrawResult();
testGameEndsAfter100();
testBankrupt();
testNetScore();
testBlockScores();
testShuffleRandomness();
testDeterministic();
testMoneyZeroNotBankrupt();
testDrawAfterOverThrows();
testInvalidDeckThrows();

console.log('\n==============================');
console.log('passed: ' + passed + '  failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);
