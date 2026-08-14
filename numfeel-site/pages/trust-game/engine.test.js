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
  // 投 5000，返还 6000 → 10000-5000+6000 = 11000
  assertEq(engine.investorOutcome(5000, 6000), 11000, '投5000返6000 → 收益11000');
  // 投 0，返还 0 → 10000
  assertEq(engine.investorOutcome(0, 0), 10000, '投0返0 → 收益10000');
  // 投 10000，返还 0 → 0
  assertEq(engine.investorOutcome(10000, 0), 0, '投10000返0 → 收益0');
  // 投 10000，返还 30000 → 30000
  assertEq(engine.investorOutcome(10000, 30000), 30000, '投10000返30000 → 收益30000');
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
  assertEq(engine.isValidInvest(10000), true, '投资10000合法');
  assertEq(engine.isValidInvest(10001), false, '投资10001非法');
  assertEq(engine.isValidInvest(-1), false, '投资-1非法');
  assertEq(engine.isValidReturn(5000, 15000), true, '返15000（=3*5000）合法');
  assertEq(engine.isValidReturn(5000, 15001), false, '返15001非法');
  assertEq(engine.isValidReturn(5000, -1), false, '返-1非法');
}

// ── 4. AI 返还：复刻论文参数（可复现、均值≈30%、含极端档） ──
function testAiReturn() {
  var r1 = engine.aiReturn(7000);
  var r2 = engine.aiReturn(7000);
  assertEq(r1, r2, 'AI 返还同投资额可复现');
  assertEq(engine.aiReturn(0), 0, '投资0返还0');
  var hasBankrupt = false;   // 血本无归（返还 0）
  var hasFullReturn = false; // 全还（返还 3 倍投资）
  var rateSum = 0;
  var rateCount = 0;
  // 遍历 0-10000：范围合法 + 平均返还率对齐论文 30%
  for (var i = 100; i <= 10000; i += 100) {
    var r = engine.aiReturn(i);
    assertTrue(r >= 0 && r <= 3 * i, '投资' + i + ' 返还合法 (' + r + ')');
    if (r === 0) hasBankrupt = true;
    if (r === 3 * i) hasFullReturn = true;
    rateSum += r / (3 * i);
    rateCount++;
  }
  assertTrue(hasBankrupt, '存在血本无归（返还0）的投资档');
  assertTrue(hasFullReturn, '存在全还（返还3倍）的投资档');
  var avgRate = rateSum / rateCount;
  assertTrue(avgRate > 0.25 && avgRate < 0.35, '平均返还率≈30% (实际 ' + avgRate.toFixed(3) + ')');
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
  var r = engine.computeRates(5000, 6000);
  assertClose(r.investRate, 0.5, 0.001, '投资比例 0.5');
  assertClose(r.returnRate, 0.4, 0.001, '返还比例 6000/15000=0.4');
  var r0 = engine.computeRates(0, 0);
  assertClose(r0.investRate, 0, 0.001, '投资0比例0');
  assertClose(r0.returnRate, 0, 0.001, '投资0返还比例0（无除零）');
}

// ── 7. 论文常模 ──
function testPaperConstants() {
  assertTrue(engine.PAPER_AVG_INVEST > 5000 && engine.PAPER_AVG_INVEST < 5500, '论文平均投资 ≈5160');
  assertTrue(engine.PAPER_AVG_RETURN > 4000 && engine.PAPER_AVG_RETURN < 5000, '论文平均返还 ≈4660');
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
