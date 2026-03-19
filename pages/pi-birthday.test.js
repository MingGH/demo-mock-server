/**
 * π 里藏着你的生日 — 单元测试
 * 用 node pages/pi-birthday.test.js 直接运行
 */

const {
  PI_FIRST_1000,
  searchInPi,
  birthdayToSequences,
  probabilityOfFinding,
  expectedDigitsNeeded,
  generateSearchStats,
  monkeyTypingTime,
  formatTime,
  formatNumber,
} = require('./pi-birthday-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

function approxEqual(a, b, tolerance = 0.05) {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}

// === PI_FIRST_1000 ===
console.log('\n📊 PI_FIRST_1000 常量检查');
assert(PI_FIRST_1000.length === 1000, `π 前1000位长度正确 (got ${PI_FIRST_1000.length})`);
assert(PI_FIRST_1000.startsWith('1415926535'), 'π 开头正确 (3.1415926535...)');
assert(/^\d+$/.test(PI_FIRST_1000), 'π 只包含数字');

// === searchInPi ===
console.log('\n📊 searchInPi');
// π = 3.14159265358979323846...
// 小数位: 1415926535...
assert(searchInPi(PI_FIRST_1000, '1415') === 1, '搜索 "1415" 应在第1位');
// π 小数位: 1(1) 4(2) 1(3) 5(4) 9(5) 2(6) 6(7) 5(8) 3(9) 5(10)
assert(searchInPi(PI_FIRST_1000, '2653') === 6, '搜索 "2653" 应在第6位');
assert(searchInPi(PI_FIRST_1000, '9') === 5, '搜索 "9" 应在第5位');
assert(searchInPi(PI_FIRST_1000, '') === -1, '空字符串返回 -1');
assert(searchInPi(PI_FIRST_1000, 'abc') === -1, '非数字返回 -1');
assert(searchInPi('', '123') === -1, '空 π 返回 -1');
assert(searchInPi(PI_FIRST_1000, '999999') > 0, '"999999" 在前1000位中能找到');

// === birthdayToSequences ===
console.log('\n📊 birthdayToSequences');
const seqs = birthdayToSequences(3, 14, 1990);
assert(seqs.length === 8, '生成8种格式');
const formats = seqs.map(s => s.format);
assert(formats.includes('MMDD'), '包含 MMDD 格式');
assert(formats.includes('YYYYMMDD'), '包含 YYYYMMDD 格式');
const mmdd = seqs.find(s => s.format === 'MMDD');
assert(mmdd.sequence === '0314', 'MMDD: 3月14日 → 0314');
const yyyymmdd = seqs.find(s => s.format === 'YYYYMMDD');
assert(yyyymmdd.sequence === '19900314', 'YYYYMMDD: 1990年3月14日 → 19900314');
const ddmm = seqs.find(s => s.format === 'DDMM');
assert(ddmm.sequence === '1403', 'DDMM: 14日3月 → 1403');
const yymmdd = seqs.find(s => s.format === 'YYMMDD');
assert(yymmdd.sequence === '900314', 'YYMMDD: 90年3月14日 → 900314');

// 边界情况：1月1日
const seqs2 = birthdayToSequences(1, 1, 2000);
const mmdd2 = seqs2.find(s => s.format === 'MMDD');
assert(mmdd2.sequence === '0101', 'MMDD: 1月1日 → 0101');
const md2 = seqs2.find(s => s.format === 'MD');
assert(md2.sequence === '11', 'MD: 1月1日 → 11');

// === probabilityOfFinding ===
console.log('\n📊 probabilityOfFinding');
// 在100万位中找4位数：P ≈ 1 - (1-10^-4)^999997 ≈ 1 - e^(-100) ≈ 1
assert(probabilityOfFinding(1000000, 4) > 0.99, '100万位找4位数概率 > 99%');
// 在1000位中找4位数：P ≈ 1 - (1-0.0001)^997 ≈ 0.095
const p1000_4 = probabilityOfFinding(1000, 4);
assert(p1000_4 > 0.05 && p1000_4 < 0.15, `1000位找4位数概率在合理范围 (got ${p1000_4.toFixed(4)})`);
// 在10位中找4位数：P 很小
assert(probabilityOfFinding(10, 4) < 0.001, '10位找4位数概率极小');
// 边界
assert(probabilityOfFinding(0, 4) === 0, 'n=0 返回 0');
assert(probabilityOfFinding(100, 0) === 0, 'k=0 返回 0');
assert(probabilityOfFinding(3, 5) === 0, 'n < k 返回 0');

// === expectedDigitsNeeded ===
console.log('\n📊 expectedDigitsNeeded');
assert(expectedDigitsNeeded(4) === 10000, '4位序列期望需要10000位');
assert(expectedDigitsNeeded(6) === 1000000, '6位序列期望需要100万位');
assert(expectedDigitsNeeded(8) === 100000000, '8位序列期望需要1亿位');

// === generateSearchStats ===
console.log('\n📊 generateSearchStats');
const stats1 = generateSearchStats(500, 4);
assert(stats1.position === 500, '位置正确');
assert(stats1.expected === 10000, '期望值正确');
assert(stats1.ratio === 0.05, '比率正确');
assert(stats1.luck === '极其幸运', '500/10000 = 极其幸运');
assert(stats1.percentile >= 0 && stats1.percentile <= 100, '百分位在合理范围');

const stats2 = generateSearchStats(15000, 4);
assert(stats2.luck === '正常水平', '15000/10000 = 正常水平');

const stats3 = generateSearchStats(80000, 4);
assert(stats3.luck === '相当靠后', '80000/10000 = 相当靠后');

// === monkeyTypingTime ===
console.log('\n📊 monkeyTypingTime');
const monkey4 = monkeyTypingTime(4, 5);
assert(monkey4.combinations === 10000, '4位数有10000种组合');
assert(monkey4.seconds === 2000, '10000/5 = 2000秒');
assert(typeof monkey4.formatted === 'string', '格式化时间是字符串');

const monkey8 = monkeyTypingTime(8, 5);
assert(monkey8.combinations === 100000000, '8位数有1亿种组合');
assert(monkey8.years > 0, '8位数需要若干年');

// === formatTime ===
console.log('\n📊 formatTime');
assert(formatTime(30) === '30 秒', '30秒');
assert(formatTime(120).includes('分钟'), '120秒 → 分钟');
assert(formatTime(7200).includes('小时'), '7200秒 → 小时');
assert(formatTime(100000).includes('天'), '100000秒 → 天');
assert(formatTime(1e8).includes('年'), '1亿秒 → 年');

// === formatNumber ===
console.log('\n📊 formatNumber');
assert(formatNumber(100000000) === '1.0亿', '1亿');
assert(formatNumber(10000000000000) === '10.0万亿', '10万亿');
assert(formatNumber(50000) === '5.0万', '5万');
assert(formatNumber(999) === '999', '999');

// === 总结 ===
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
