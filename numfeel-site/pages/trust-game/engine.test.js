/**
 * 信任博弈 engine.js — 单元测试（Node 直接运行）
 * 运行：node pages/trust-game/engine.test.js
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

// ── 1. 投资者收益 ──
function testInvestorOutcome() {
  // 投 5，返还 6 → 10-5+6 = 11
  assertEq(engine.investorOutcome(5, 6), 11, '投5返6 → 收益11');
  // 投 0，返还 0 → 10
  assertEq(engine.investorOutcome(0, 0), 10, '投0返0 → 收益10');
  // 投 10，返还 0 → 0
  assertEq(engine.investorOutcome(10, 0), 0, '投10返0 → 收益0');
  // 投 10，返还 30 → 30
  assertEq(engine.investorOutcome(10, 30), 30, '投10返30 → 收益30');
}

// ── 2. 被委托人收益 ──
function testTrusteeOutcome() {
  // 投 5，返还 6 → 15-6 = 9
  assertEq(engine.trusteeOutcome(5, 6), 9, '投5返6 → 被委托人9');
  // 投 10，返还 0 → 30
  assertEq(engine.trusteeOutcome(10, 0), 30, '投10返0 → 被委托人30');
  // 投 10，返还 30 → 0
  assertEq(engine.trusteeOutcome(10, 30), 0, '投10返30 → 被委托人0');
}

// ── 3. 合法性校验 ──
function testValidation() {
  assertEq(engine.isValidInvest(0), true, '投资0合法');
  assertEq(engine.isValidInvest(10), true, '投资10合法');
  assertEq(engine.isValidInvest(11), false, '投资11非法');
  assertEq(engine.isValidInvest(-1), false, '投资-1非法');
  assertEq(engine.isValidReturn(5, 15), true, '返15（=3*5）合法');
  assertEq(engine.isValidReturn(5, 16), false, '返16非法');
  assertEq(engine.isValidReturn(5, -1), false, '返-1非法');
}

// ── 4. AI 返还可复现且范围合法 ──
function testAiReturn() {
  var r1 = engine.aiReturn(7);
  var r2 = engine.aiReturn(7);
  assertEq(r1, r2, 'AI 返还同投资额可复现');
  assertTrue(r1 >= 0 && r1 <= 21, 'AI 返还范围 0-21');
  assertEq(engine.aiReturn(0), 0, '投资0返还0');
  // 遍历 0-10 全部合法
  for (var i = 0; i <= 10; i++) {
    var r = engine.aiReturn(i);
    assertTrue(r >= 0 && r <= 3 * i, '投资' + i + ' 返还合法 (' + r + ')');
  }
}

// ── 5. 画像四象限 ──
function testClassify() {
  assertEq(engine.classifyProfile(0.8, 0.7).label, '高信任·高互惠', '高信任高互惠');
  assertEq(engine.classifyProfile(0.8, 0.2).label, '高信任·低互惠', '高信任低互惠');
  assertEq(engine.classifyProfile(0.2, 0.7).label, '低信任·高互惠', '低信任高互惠');
  assertEq(engine.classifyProfile(0.2, 0.2).label, '低信任·低互惠', '低信任低互惠');
  // 边界：恰好 0.5
  assertEq(engine.classifyProfile(0.5, 0.5).label, '高信任·高互惠', '边界0.5归高信任高互惠');
}

// ── 6. 比例计算 ──
function testComputeRates() {
  var r = engine.computeRates(5, 6);
  assertClose(r.investRate, 0.5, 0.001, '投资比例 0.5');
  assertClose(r.returnRate, 0.4, 0.001, '返还比例 6/15=0.4');
  var r0 = engine.computeRates(0, 0);
  assertClose(r0.investRate, 0, 0.001, '投资0比例0');
  assertClose(r0.returnRate, 0, 0.001, '投资0返还比例0（无除零）');
}

// ── 7. 论文常模 ──
function testPaperConstants() {
  assertTrue(engine.PAPER_AVG_INVEST > 5 && engine.PAPER_AVG_INVEST < 5.5, '论文平均投资 ≈5.16');
  assertTrue(engine.PAPER_AVG_RETURN > 4 && engine.PAPER_AVG_RETURN < 5, '论文平均返还 ≈4.66');
}

testInvestorOutcome();
testTrusteeOutcome();
testValidation();
testAiReturn();
testClassify();
testComputeRates();
testPaperConstants();

console.log('\n==============================');
console.log('passed: ' + passed + '  failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);
