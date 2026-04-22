/**
 * 费米估算挑战 — 单元测试
 * 运行: node pages/fermi-quiz/fermi-quiz.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

// ── parseNumber ──
function parseNumber(str) {
  if (!str) return null;
  str = str.replace(/\s/g, '').replace(/,/g, '').replace(/，/g, '');
  var multiplier = 1;
  if (/亿/.test(str)) { multiplier = 100000000; str = str.replace(/亿/, ''); }
  else if (/万/.test(str)) { multiplier = 10000; str = str.replace(/万/, ''); }
  else if (/[kK]$/.test(str)) { multiplier = 1000; str = str.replace(/[kK]$/, ''); }
  else if (/[mM]$/.test(str)) { multiplier = 1000000; str = str.replace(/[mM]$/, ''); }
  else if (/[bB]$/.test(str)) { multiplier = 1000000000; str = str.replace(/[bB]$/, ''); }
  var num = parseFloat(str);
  if (isNaN(num)) return null;
  return num * multiplier;
}

console.log('\n[parseNumber]');
assert(parseNumber('5万') === 50000, '5万 = 50000');
assert(parseNumber('3.5亿') === 350000000, '3.5亿 = 350000000');
assert(parseNumber('1000') === 1000, '1000 = 1000');
assert(parseNumber('10k') === 10000, '10k = 10000');
assert(parseNumber('2.5M') === 2500000, '2.5M = 2500000');
assert(parseNumber('1B') === 1000000000, '1B = 1000000000');
assert(parseNumber('1,000,000') === 1000000, '1,000,000 = 1000000 (commas stripped)');
assert(parseNumber('') === null, 'empty → null');
assert(parseNumber('abc') === null, 'abc → null');
assert(parseNumber('0') === 0, '0 = 0');

// ── formatNumber ──
function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(n % 100000000 === 0 ? 0 : 1) + ' 亿';
  if (n >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + ' 万';
  if (n >= 1000) return n.toLocaleString('zh-CN');
  return String(n);
}

console.log('\n[formatNumber]');
assert(formatNumber(350000000000).includes('亿'), '3500亿 contains 亿');
assert(formatNumber(50000).includes('万'), '5万 contains 万');
assert(formatNumber(500) === '500', '500 = 500');
assert(formatNumber(10000000).includes('万'), '1000万 contains 万');

// ── grade logic ──
function getGrade(avgOOM) {
  if (avgOOM < 0.3) return 'S';
  if (avgOOM < 0.6) return 'A';
  if (avgOOM < 1.0) return 'B';
  if (avgOOM < 1.5) return 'C';
  return 'D';
}

console.log('\n[grade logic]');
assert(getGrade(0.1) === 'S', '0.1 → S');
assert(getGrade(0.29) === 'S', '0.29 → S');
assert(getGrade(0.3) === 'A', '0.3 → A');
assert(getGrade(0.59) === 'A', '0.59 → A');
assert(getGrade(0.6) === 'B', '0.6 → B');
assert(getGrade(0.99) === 'B', '0.99 → B');
assert(getGrade(1.0) === 'C', '1.0 → C');
assert(getGrade(1.49) === 'C', '1.49 → C');
assert(getGrade(1.5) === 'D', '1.5 → D');
assert(getGrade(3.0) === 'D', '3.0 → D');

// ── error factor ──
console.log('\n[error factor]');
function errorFactor(guess, answer) {
  return guess >= answer ? guess / answer : answer / guess;
}
assert(errorFactor(100, 100) === 1, '100 vs 100 → 1x');
assert(errorFactor(1000, 100) === 10, '1000 vs 100 → 10x');
assert(errorFactor(10, 100) === 10, '10 vs 100 → 10x');
assert(Math.abs(errorFactor(50000, 50000) - 1) < 0.001, '50000 vs 50000 → 1x');

// ── OOM calculation ──
console.log('\n[OOM calculation]');
assert(Math.abs(Math.log10(1) - 0) < 0.001, 'log10(1) = 0 OOM');
assert(Math.abs(Math.log10(10) - 1) < 0.001, 'log10(10) = 1 OOM');
assert(Math.abs(Math.log10(100) - 2) < 0.001, 'log10(100) = 2 OOM');
assert(Math.abs(Math.log10(3.16) - 0.5) < 0.01, 'log10(3.16) ≈ 0.5 OOM');

// ── questions data validation ──
console.log('\n[questions data]');
// Load questions
var fs = require('fs');
var code = fs.readFileSync('pages/fermi-quiz/questions.js', 'utf8');
// Remove "use strict" so eval can define globals
code = code.replace(/"use strict";?\n?/, '');
eval(code);

assert(FERMI_QUESTIONS.length >= 10, 'at least 10 questions (got ' + FERMI_QUESTIONS.length + ')');
FERMI_QUESTIONS.forEach(function(q, i) {
  assert(q.question && q.question.length > 0, 'Q' + i + ' has question text');
  assert(q.answer > 0, 'Q' + i + ' has positive answer (' + q.answer + ')');
  assert(q.unit && q.unit.length > 0, 'Q' + i + ' has unit');
  assert(q.source && q.source.length > 10, 'Q' + i + ' has source');
  assert(q.explain && q.explain.length > 10, 'Q' + i + ' has explanation');
});

// ── 结果 ──
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) process.exit(1);
