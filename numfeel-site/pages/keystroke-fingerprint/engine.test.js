/**
 * 键盘输入节奏识别 engine.js — 单元测试（Node 直接运行）
 * 运行：node pages/keystroke-fingerprint/engine.test.js
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

// ── 1. 特征提取：基本场景 ──
function testExtractBasic() {
  var events = [
    { key: 't', down: 1000, up: 1080 },
    { key: 'h', down: 1120, up: 1200 },
    { key: 'e', down: 1240, up: 1320 }
  ];
  var f = engine.extractFeatures(events);
  assertEq(JSON.stringify(f.holdTimes), '[80,80,80]', '按压时长 [80,80,80]');
  assertEq(JSON.stringify(f.intervals), '[40,40]', '键间间隔 [40,40]');
  assertEq(f.totalMs, 320, '总耗时 320ms');
  assertEq(f.validKeys, 3, '有效按键 3 个');
}

// ── 2. 特征提取：非法事件被跳过 ──
function testExtractInvalid() {
  var events = [
    { key: 't', down: 1000, up: 1080 },
    { key: 'x', down: 2000, up: 1000 },   // down > up，非法
    { key: null },                          // 缺字段
    { key: 'e', down: 1120, up: 1200 }
  ];
  var f = engine.extractFeatures(events);
  assertEq(f.validKeys, 2, '只统计 2 个合法事件');
  assertEq(JSON.stringify(f.holdTimes), '[80,80]', '按压时长只含合法项');
}

// ── 3. 距离计算：完全相同 → 0 ──
function testDistanceIdentical() {
  var f1 = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1080 },
    { key: 'b', down: 1120, up: 1200 }
  ]);
  var f2 = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1080 },
    { key: 'b', down: 1120, up: 1200 }
  ]);
  assertEq(engine.computeDistance(f1, f2), 0, '相同特征距离 = 0');
}

// ── 4. 距离计算：差异越大距离越大 ──
function testDistanceMonotonic() {
  var base = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1080 },
    { key: 'b', down: 1120, up: 1200 }
  ]);
  var slightly = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1090 },
    { key: 'b', down: 1130, up: 1210 }
  ]);
  var veryDiff = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1800 },
    { key: 'b', down: 3000, up: 4200 }
  ]);
  var d1 = engine.computeDistance(base, slightly);
  var d2 = engine.computeDistance(base, veryDiff);
  assertTrue(d2 > d1, '差异更大时距离更大 (' + d1 + ' vs ' + d2 + ')');
  assertTrue(d2 > 3, '极端差异距离显著 (' + d2 + ')');
}

// ── 5. 距离计算：对称性 ──
function testDistanceSymmetric() {
  var f1 = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1080 },
    { key: 'b', down: 1120, up: 1200 }
  ]);
  var f2 = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1150 },
    { key: 'b', down: 1200, up: 1300 }
  ]);
  assertEq(engine.computeDistance(f1, f2), engine.computeDistance(f2, f1), '距离对称');
}

// ── 6. 距离计算：空特征 → Infinity ──
function testDistanceEmpty() {
  assertEq(engine.computeDistance(null, null), Infinity, 'null 输入距离 = Infinity');
  assertEq(engine.computeDistance({ holdTimes: [] }, { holdTimes: [] }), Infinity, '空数组距离 = Infinity');
}

// ── 7. 稳定性判定 ──
function testJudgeStability() {
  var f1 = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1080 },
    { key: 'b', down: 1120, up: 1200 }
  ]);
  var f2 = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1080 },
    { key: 'b', down: 1120, up: 1200 }
  ]);
  var r = engine.judgeStability(f1, f2);
  assertTrue(r.stable, '相同特征判定为稳定');
  assertEq(r.grade, '优秀', '相同特征评级优秀');

  var f3 = engine.extractFeatures([
    { key: 'a', down: 1000, up: 1800 },
    { key: 'b', down: 3000, up: 4200 }
  ]);
  var r2 = engine.judgeStability(f1, f3);
  assertTrue(!r2.stable, '差异巨大判定为不稳定');
  assertEq(r2.grade, '不稳定', '差异巨大评级不稳定');
}

// ── 8. 文本哈希确定性 ──
function testHashText() {
  var h1 = engine.hashText('the quick brown fox');
  var h2 = engine.hashText('the quick brown fox');
  var h3 = engine.hashText('the quick brown fox jumps');
  assertEq(h1, h2, '相同文本哈希一致');
  assertTrue(h1 !== h3, '不同文本哈希不同');
  assertEq(h1.length, 16, '哈希长度 16');
}

// ── 9. 目标文本是全 26 字母 ──
function testTargetText() {
  var letters = new Set(engine.TARGET_TEXT.replace(/\s/g, '').split(''));
  assertEq(letters.size, 26, '目标文本覆盖全部 26 个字母');
  assertEq(engine.TARGET_TEXT, 'the quick brown fox jumps over the lazy dog', '目标文本正确');
}

testExtractBasic();
testExtractInvalid();
testDistanceIdentical();
testDistanceMonotonic();
testDistanceSymmetric();
testDistanceEmpty();
testJudgeStability();
testHashText();
testTargetText();

console.log('\n==============================');
console.log('passed: ' + passed + '  failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);
