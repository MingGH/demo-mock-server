/**
 * pi-as-random-source.test.js — "π 能当随机源吗？" demo 核心逻辑测试
 * 运行：node pages/pi-as-random-source/pi-as-random-source.test.js
 *
 * 用一段只含 0~9 的确定性字符串当"假 π"，避免依赖 data/pi-1m.js 的大文件。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');

// 固定测试位串：第 1~20 位 = 01234567890123456789（每位 0~9 周期 10）
const PIS = '01234567890123456789';

// ── 切片取数 ──
describe('takePiSlice', function () {
  test('从第 1 位取 5 位', function () {
    assert.deepEqual(E.takePiSlice(PIS, 1, 5), [0, 1, 2, 3, 4]);
  });
  test('从第 3 位取 4 位', function () {
    assert.deepEqual(E.takePiSlice(PIS, 3, 4), [2, 3, 4, 5]);
  });
  test('同一参数永远返回同一段（决定性 / 可复现）', function () {
    assert.deepEqual(E.takePiSlice(PIS, 6, 5), E.takePiSlice(PIS, 6, 5));
  });
  test('超出可用位数时截断到末尾', function () {
    assert.deepEqual(E.takePiSlice(PIS, 18, 5), [7, 8, 9]);
  });
  test('start 超界抛错', function () {
    assert.throws(() => E.takePiSlice(PIS, 21, 1));
  });
  test('非法参数抛错', function () {
    assert.throws(() => E.takePiSlice(PIS, 0, 1));
    assert.throws(() => E.takePiSlice(PIS, 1, 0));
    assert.throws(() => E.takePiSlice('', 1, 1));
  });
});

// ── 频次统计与卡方 ──
describe('digitHistogram / chiSquare', function () {
  test('histogram 统计 0~9 频次', function () {
    const h = E.digitHistogram([0, 1, 1, 9, 9, 9]);
    assert.equal(h[0], 1);
    assert.equal(h[1], 2);
    assert.equal(h[9], 3);
    assert.equal(h.length, 10);
  });
  test('非数字字符被忽略', function () {
    const h = E.digitHistogram([0, 1, 99, -1]);
    assert.equal(h[0], 1);
    assert.equal(h[1], 1);
  });
  test('均匀分布卡方接近 0', function () {
    assert.ok(E.chiSquare([100, 100, 100, 100]) < 0.001);
  });
  test('偏斜分布卡方偏大', function () {
    assert.ok(E.chiSquare([400, 0, 0, 0]) > 1000);
  });
  test('空数组卡方为 0', function () {
    assert.equal(E.chiSquare([]), 0);
  });
});

// ── 成本估算 ──
describe('neededDigits / costSeverity', function () {
  test('需要计算到第 start+length 位', function () {
    assert.equal(E.neededDigits(100, 50), 150);
  });
  test('非法参数抛错', function () {
    assert.throws(() => E.neededDigits(0, 1));
    assert.throws(() => E.neededDigits(1, 0));
  });
  test('costSeverity 边界', function () {
    assert.equal(E.costSeverity(100), 0);
    assert.equal(E.costSeverity(1e8), 1);
    assert.ok(E.costSeverity(1e3) > 0 && E.costSeverity(1e3) < 1);
    assert.ok(E.costSeverity(1e6) < E.costSeverity(1e8));
  });
});

// ── 格式化 ──
describe('formatBig / joinDigits / chiSummary', function () {
  test('formatBig 万/亿', function () {
    assert.equal(E.formatBig(999), '999');
    assert.equal(E.formatBig(1200000), '120 万');
    assert.equal(E.formatBig(2e9), '20 亿');
  });
  test('joinDigits 拼串', function () {
    assert.equal(E.joinDigits([1, 4, 1, 5]), '1415');
  });
  test('chiSummary 分级', function () {
    assert.equal(E.chiSummary(2).cls, 'green');
    assert.equal(E.chiSummary(50).cls, 'red');
  });
});

console.log('所有测试通过 ✓');