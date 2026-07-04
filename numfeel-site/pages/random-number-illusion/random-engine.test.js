/**
 * random-engine.test.js — 随机数错觉单元测试
 * 运行: cd numfeel-site && node pages/random-number-illusion/random-engine.test.js
 */
var engine = require('./random-engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  \u2705 ' + msg); }
  else { failed++; console.error('  \u274C ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= (tol || 0.001);
  if (ok) { passed++; console.log('  \u2705 ' + msg + ' (actual=' + actual + ')'); }
  else { failed++; console.error('  \u274C ' + msg + ' (expected=' + expected + ', actual=' + actual + ')'); }
}

function seededRng(seed) {
  return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return (seed >>> 0) / 4294967296; };
}

// ============================================================
console.log('\n=== generate5DigitNumbers ===');

(function () {
  var nums = engine.generate5DigitNumbers(1000);
  assert(nums.length === 1000, '1000 numbers: correct count');
  for (var i = 0; i < nums.length; i++) {
    assert(nums[i].length === 5, 'index ' + i + ': 5 chars long');
    assert(/^\d{5}$/.test(nums[i]), 'index ' + i + ': all digits');
    var val = parseInt(nums[i], 10);
    assert(val >= 0 && val <= 99999, 'index ' + i + ': value in 00000-99999 range');
  }
})();

(function () {
  var rng = seededRng(42);
  var a = engine.generate5DigitNumbers(50, rng);
  var rng2 = seededRng(42);
  var b = engine.generate5DigitNumbers(50, rng2);
  var same = true;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) { same = false; break; }
  }
  assert(same, 'seeded: same seed = same sequence');
})();

(function () {
  assert(engine.generate5DigitNumbers(0).length === 0, '0 count: empty array');
})();

// ============================================================
console.log('\n=== classifyPattern ===');

(function () {
  assert(engine.classifyPattern('11111') === 'all-same', '11111 -> all-same');
  assert(engine.classifyPattern('22222') === 'all-same', '22222 -> all-same');
  assert(engine.classifyPattern('99999') === 'all-same', '99999 -> all-same');
  assert(engine.classifyPattern('00000') === 'all-same', '00000 -> all-same');
  assert(engine.classifyPattern('77777') === 'all-same', '77777 -> all-same');
})();

(function () {
  assert(engine.classifyPattern('12345') === 'sequential', '12345 -> sequential');
  assert(engine.classifyPattern('54321') === 'sequential', '54321 -> sequential');
  assert(engine.classifyPattern('23456') === 'sequential', '23456 -> sequential');
  assert(engine.classifyPattern('98765') === 'sequential', '98765 -> sequential');
  assert(engine.classifyPattern('01234') === 'sequential', '01234 -> sequential');
})();

(function () {
  assert(engine.classifyPattern('12321') === 'palindrome', '12321 -> palindrome');
  assert(engine.classifyPattern('45654') === 'palindrome', '45654 -> palindrome');
  assert(engine.classifyPattern('89098') === 'palindrome', '89098 -> palindrome');
})();

(function () {
  assert(engine.classifyPattern('10101') === 'repeating-pattern', '10101 -> repeating-pattern');
  assert(engine.classifyPattern('12121') === 'repeating-pattern', '12121 -> repeating-pattern');
  assert(engine.classifyPattern('90909') === 'repeating-pattern', '90909 -> repeating-pattern');
})();

(function () {
  assert(engine.classifyPattern('83947') === 'none', '83947 -> none');
  assert(engine.classifyPattern('54176') === 'none', '54176 -> none');
  assert(engine.classifyPattern('27361') === 'none', '27361 -> none');
  assert(engine.classifyPattern('69254') === 'none', '69254 -> none');
})();

// 优先级校验：11111 同时是回文/重复模式，应归类为 all-same
(function () {
  assert(engine.classifyPattern('11111') === 'all-same', '11111 precedence: all-same wins');
  // 10101 同时是回文，应归类为 repeating-pattern
  assert(engine.classifyPattern('10101') === 'repeating-pattern', '10101 precedence: repeating-pattern wins');
})();

// ============================================================
console.log('\n=== countPatterns ===');

(function () {
  var nums = ['11111', '12345', '54321', '12321', '10101', '83947', '54176'];
  var counts = engine.countPatterns(nums);
  assert(counts['all-same'] === 1, 'counts: all-same = 1');
  assert(counts['sequential'] === 2, 'counts: sequential = 2');
  assert(counts['palindrome'] === 1, 'counts: palindrome = 1');
  assert(counts['repeating-pattern'] === 1, 'counts: repeating-pattern = 1');
  assert(counts['none'] === 2, 'counts: none = 2');
  var total = counts['all-same'] + counts['sequential'] + counts['palindrome'] +
    counts['repeating-pattern'] + counts['none'];
  assert(total === nums.length, 'sum of all patterns = input length (' + nums.length + ')');
})();

(function () {
  var rng = seededRng(7);
  var nums = engine.generate5DigitNumbers(5000, rng);
  var counts = engine.countPatterns(nums);
  var total = counts['all-same'] + counts['sequential'] + counts['palindrome'] +
    counts['repeating-pattern'] + counts['none'];
  assert(total === 5000, '5000 random: sum = 5000');
  assert(counts['none'] > 4500, '5000 random: most are none (>4500)');
})();

(function () {
  var counts = engine.countPatterns([]);
  var total = counts['all-same'] + counts['sequential'] + counts['palindrome'] +
    counts['repeating-pattern'] + counts['none'];
  assert(total === 0, 'empty input: sum = 0');
})();

// ============================================================
console.log('\n=== calculateProbability ===');

(function () {
  assertClose(engine.calculateProbability('11111'), 1 / 100000, 0, '11111 prob = 1/100000');
  assertClose(engine.calculateProbability('54176'), 1 / 100000, 0, '54176 prob = 1/100000');
  assertClose(engine.calculateProbability('12345'), 1 / 100000, 0, '12345 prob = 1/100000');
  assertClose(engine.calculateProbability('00000'), 1 / 100000, 0, '00000 prob = 1/100000');
  assertClose(engine.calculateProbability('83947'), 1 / 100000, 0, '83947 prob = 1/100000');
})();

(function () {
  var p1 = engine.calculateProbability('11111');
  var p2 = engine.calculateProbability('54176');
  assert(p1 === p2, '11111 and 54176 have identical probability');
  assert(p1 === 0.00001, 'probability = 0.00001');
})();

// ============================================================
console.log('\n=== Result ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
