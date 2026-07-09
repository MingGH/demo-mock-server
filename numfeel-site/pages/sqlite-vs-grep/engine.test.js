/**
 * SQLite vs Grep 引擎单元测试
 * 运行：node pages/sqlite-vs-grep/engine.test.js
 */

// 加载引擎模块
var E = require('./engine.js').GrepVsSqliteEngine;

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg + ' (expected: ' + expected + ', got: ' + actual + ')');
  }
}

function assertIncludes(str, sub, msg) {
  if (str.indexOf(sub) !== -1) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg + ' (expected "' + str + '" to include "' + sub + '")');
  }
}

// ── formatTime ──
console.log('\nformatTime:');
assertEqual(E.formatTime(0.005), '<0.01 ms', 'very small value');
assertEqual(E.formatTime(0.12), '0.12 ms', 'sub-millisecond');
assertEqual(E.formatTime(0.5), '0.50 ms', 'half millisecond');
assertEqual(E.formatTime(5.3), '5.3 ms', 'normal millisecond');
assertEqual(E.formatTime(82.51), '82.5 ms', 'tens of ms');
assertEqual(E.formatTime(150), '150 ms', 'hundreds of ms');
assertEqual(E.formatTime(1500), '1.50 s', 'seconds');
assertEqual(E.formatTime(12345), '12.35 s', 'many seconds');

// ── formatBytes ──
console.log('\nformatBytes:');
assertEqual(E.formatBytes(512), '512 B', 'bytes');
assertEqual(E.formatBytes(1024), '1.0 KB', 'exactly 1 KB');
assertEqual(E.formatBytes(1536), '1.5 KB', '1.5 KB');
assertEqual(E.formatBytes(1048576), '1.0 MB', 'exactly 1 MB');
assertEqual(E.formatBytes(15728640), '15.0 MB', '15 MB');

// ── calcSpeedRatio ──
console.log('\ncalcSpeedRatio:');
assertEqual(E.calcSpeedRatio(100, 10), 10, '100 vs 10 = 10x');
assertEqual(E.calcSpeedRatio(10, 100), 10, '10 vs 100 = 10x (absolute)');
assertEqual(E.calcSpeedRatio(50, 50), 1, 'equal = 1x');
assertEqual(E.calcSpeedRatio(0, 10), 1, 'zero file time = 1x');
assertEqual(E.calcSpeedRatio(10, 0), 1, 'zero sqlite time = 1x');
assertEqual(E.calcSpeedRatio(82.5, 3.2), 25.8, '82.5 vs 3.2');

// ── getWinner ──
console.log('\ngetWinner:');
assertEqual(E.getWinner(100, 10), 'sqlite', 'sqlite wins when faster');
assertEqual(E.getWinner(10, 100), 'file', 'file wins when faster');
assertEqual(E.getWinner(50, 50), 'tie', 'tie when equal');

// ── calcRaceWidths ──
console.log('\ncalcRaceWidths:');
var widths = E.calcRaceWidths(100, 50);
assertEqual(widths.fileWidth, 100, 'file is max = 100%');
assertEqual(widths.sqliteWidth, 50, 'sqlite is half = 50%');

var widths2 = E.calcRaceWidths(10, 100);
assertEqual(widths2.fileWidth, 10, 'file is 10% of max');
assertEqual(widths2.sqliteWidth, 100, 'sqlite is max = 100%');

var widths3 = E.calcRaceWidths(0.001, 0.001);
assert(widths3.fileWidth >= 5, 'equal tiny values: file bar at least 5%');
assert(widths3.sqliteWidth >= 5, 'equal tiny values: sqlite bar at least 5%');
assertEqual(widths3.fileWidth, widths3.sqliteWidth, 'equal values produce equal widths');

// Edge case: minimum 5%
var widths4 = E.calcRaceWidths(100, 1);
assert(widths4.sqliteWidth >= 5, 'minimum bar width is 5%');

// ── Presets exist ──
console.log('\nPresets:');
assert(Array.isArray(E.SEARCH_PRESETS), 'SEARCH_PRESETS is array');
assert(E.SEARCH_PRESETS.length > 0, 'SEARCH_PRESETS has items');
assert(Array.isArray(E.INSERT_PRESETS), 'INSERT_PRESETS is array');
assert(E.INSERT_PRESETS.length > 0, 'INSERT_PRESETS has items');
assert(E.INSERT_PRESETS[0].content && E.INSERT_PRESETS[0].sender, 'INSERT_PRESETS have content and sender');
assert(Array.isArray(E.COMPLEX_PRESETS), 'COMPLEX_PRESETS is array');
assert(E.COMPLEX_PRESETS[0].type && E.COMPLEX_PRESETS[0].days, 'COMPLEX_PRESETS have type and days');
assert(Array.isArray(E.DELETE_PRESETS), 'DELETE_PRESETS is array');
assert(E.DELETE_PRESETS.length > 0, 'DELETE_PRESETS has items');

// ── API_BASE ──
console.log('\nConfig:');
assertEqual(E.API_BASE, 'https://numfeel-api.996.ninja', 'API_BASE is production URL');

// ── API functions exist ──
console.log('\nAPI functions:');
assert(typeof E.fetchStatus === 'function', 'fetchStatus exists');
assert(typeof E.fetchSearch === 'function', 'fetchSearch exists');
assert(typeof E.fetchInsert === 'function', 'fetchInsert exists');
assert(typeof E.fetchComplexQuery === 'function', 'fetchComplexQuery exists');
assert(typeof E.fetchDelete === 'function', 'fetchDelete exists');
assert(typeof E.fetchReinit === 'function', 'fetchReinit exists');

// ── Summary ──
console.log('\n' + '═'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(40));

if (failed > 0) process.exit(1);
