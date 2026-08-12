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
  assertEq(r.loss, 50, 'C 堆第 1 张损失 50');
  assertEq(r.net, 0, 'C 堆第 1 张净收益 0');
  assertEq(r.money, 2000, '起始资金 2000 不变');
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

// ── 7. 固定规则可复现：同一堆同一手损失相同 ──
function testDeterministic() {
  var g1 = engine.createGame();
  var g2 = engine.createGame();
  for (var i = 0; i < 12; i++) {
    var r1 = g1.drawCard('B');
    var r2 = g2.drawCard('B');
    assertEq(r1.loss, r2.loss, 'B 堆第 ' + (i + 1) + ' 手损失可复现');
  }
}

// ── 8. 边界：资金为正且未满 100 手不结束；A 堆损失序列正确 ──
function testMoneyZeroNotBankrupt() {
  var g = engine.createGame();
  // A 堆前 2 手：+100，第 2 手无损失（周期 [150,0,300,0,...]）
  var r1 = g.drawCard('A');
  var r2 = g.drawCard('A');
  assertEq(r1.loss, 150, 'A 堆第 1 手损失 150');
  assertEq(r2.loss, 0, 'A 堆第 2 手无损失');
  assertEq(r2.money, 2000 + 100 + 100 - 150, 'A 堆抽 2 手后资金=2050');
  assertEq(g.getState().over, false, '资金为正且未满 100 手不结束');
}

// ── 9. 抽牌已结束仍调用应抛错 ──
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

// ── 10. 非法牌堆抛错 ──
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

testDeckExpectation();
testDrawResult();
testGameEndsAfter100();
testBankrupt();
testNetScore();
testBlockScores();
testDeterministic();
testMoneyZeroNotBankrupt();
testDrawAfterOverThrows();
testInvalidDeckThrows();

console.log('\n==============================');
console.log('passed: ' + passed + '  failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);
