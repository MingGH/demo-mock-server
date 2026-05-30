/**
 * Benford's Law Logic - Unit Tests
 * 用 node 直接运行: node pages/benfords-law.test.js
 */

const {
  theoreticalDistribution, extractFirstDigits, chiSquareTest,
  generateBenfordData, generateUniformData, generateFakeData,
  generateFibonacci, generatePowersOf2, generateFactorials,
  computeMAD, madVerdict
} = require('./benfords-law-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

function approx(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

// ========== theoreticalDistribution ==========
console.log('\n📐 theoreticalDistribution');

const theory = theoreticalDistribution();
assert(Object.keys(theory).length === 9, '返回9个数字的概率');
assert(approx(theory[1], 0.30103, 0.0001), 'P(1) ≈ 30.1%');
assert(approx(theory[2], 0.17609, 0.0001), 'P(2) ≈ 17.6%');
assert(approx(theory[9], 0.04576, 0.0001), 'P(9) ≈ 4.6%');

// 所有概率之和 = 1
const totalProb = Object.values(theory).reduce((s, v) => s + v, 0);
assert(approx(totalProb, 1.0, 0.0001), '概率之和 = 1');

// 单调递减
let decreasing = true;
for (let d = 2; d <= 9; d++) {
  if (theory[d] >= theory[d - 1]) { decreasing = false; break; }
}
assert(decreasing, '概率从1到9单调递减');

// ========== extractFirstDigits ==========
console.log('\n🔢 extractFirstDigits');

const testNums = [123, 234, 345, 156, 189, 112, 167, 198, 901, 812];
const result = extractFirstDigits(testNums);
assert(result.total === 10, '10个有效数字');
assert(result.counts[1] === 6, '以1开头的有6个');
assert(result.counts[9] === 1, '以9开头的有1个');
assert(approx(result.freq[1], 0.6, 0.001), '1的频率=0.6');

// 忽略0和小数
const withZeros = [0, 0.5, 0.99, 123, 456];
const r2 = extractFirstDigits(withZeros);
assert(r2.total === 2, '忽略0和小于1的数');

// 负数取绝对值
const withNeg = [-123, -456, 789];
const r3 = extractFirstDigits(withNeg);
assert(r3.total === 3, '负数取绝对值后提取');
assert(r3.counts[1] === 1, '-123 首位为1');

// ========== chiSquareTest ==========
console.log('\n📊 chiSquareTest');

// 完美符合本福特的数据
const perfectCounts = {};
const n = 10000;
for (let d = 1; d <= 9; d++) {
  perfectCounts[d] = Math.round(theory[d] * n);
}
const perfectTest = chiSquareTest(perfectCounts, n);
assert(perfectTest.chiSquare < 1, '完美本福特数据卡方值很小');
assert(perfectTest.isConform === true, '完美数据判定为符合');

// 均匀分布的数据（不符合）
const uniformCounts = {};
for (let d = 1; d <= 9; d++) {
  uniformCounts[d] = Math.round(n / 9);
}
const uniformTest = chiSquareTest(uniformCounts, n);
assert(uniformTest.chiSquare > 15.507, '均匀分布卡方值大于临界值');
assert(uniformTest.isConform === false, '均匀分布判定为不符合');

// ========== generateBenfordData ==========
console.log('\n🎲 generateBenfordData');

const benfordData = generateBenfordData(5000);
assert(benfordData.length === 5000, '生成5000个数据');
assert(benfordData.every(v => v >= 1), '所有值 >= 1');

// 大数定律：应该符合本福特
const bResult = extractFirstDigits(benfordData);
const bTest = chiSquareTest(bResult.counts, bResult.total);
assert(bTest.isConform === true, '生成的本福特数据通过检验');

// ========== generateUniformData ==========
console.log('\n🎯 generateUniformData');

const uniData = generateUniformData(5000, 999);
assert(uniData.length === 5000, '生成5000个均匀数据');
assert(uniData.every(v => v >= 1 && v <= 999), '值在范围内');

// ========== generateFakeData ==========
console.log('\n🕵️ generateFakeData');

const fakeData = generateFakeData(5000);
assert(fakeData.length === 5000, '生成5000个伪造数据');
const fResult = extractFirstDigits(fakeData);
const fTest = chiSquareTest(fResult.counts, fResult.total);
assert(fTest.isConform === false, '伪造数据不通过检验');

// ========== generateFibonacci ==========
console.log('\n🌀 generateFibonacci');

const fib = generateFibonacci(10);
assert(fib.length === 10, '生成10个斐波那契数');
assert(fib[0] === 1 && fib[1] === 1, '前两项为1');
assert(fib[9] === 55, '第10项为55');

// 大量斐波那契应符合本福特
const fibLarge = generateFibonacci(500);
const fibResult = extractFirstDigits(fibLarge);
const fibTest = chiSquareTest(fibResult.counts, fibResult.total);
assert(fibTest.isConform === true, '斐波那契数列符合本福特定律');

// ========== generatePowersOf2 ==========
console.log('\n⚡ generatePowersOf2');

const pow2 = generatePowersOf2(5);
assert(pow2[0] === 1, '2^0 = 1');
assert(pow2[1] === 2, '2^1 = 2');
assert(pow2[4] === 16, '2^4 = 16');

// ========== generateFactorials ==========
console.log('\n🔢 generateFactorials');

const facts = generateFactorials(6);
assert(facts[0] === 1, '0! = 1');
assert(facts[1] === 1, '1! = 1');
assert(facts[5] === 120, '5! = 120');

// ========== computeMAD ==========
console.log('\n📏 computeMAD');

// 完美本福特 MAD ≈ 0
const perfectFreq = {};
for (let d = 1; d <= 9; d++) perfectFreq[d] = theory[d];
const perfectMAD = computeMAD(perfectFreq);
assert(approx(perfectMAD, 0, 0.0001), '完美本福特 MAD ≈ 0');

// 均匀分布 MAD 应该较大
const uniformFreq = {};
for (let d = 1; d <= 9; d++) uniformFreq[d] = 1 / 9;
const uniformMAD = computeMAD(uniformFreq);
assert(uniformMAD > 0.015, '均匀分布 MAD > 0.015');

// ========== madVerdict ==========
console.log('\n🏷️ madVerdict');

assert(madVerdict(0.003) === '紧密符合', 'MAD=0.003 → 紧密符合');
assert(madVerdict(0.008) === '可接受', 'MAD=0.008 → 可接受');
assert(madVerdict(0.013) === '边缘符合', 'MAD=0.013 → 边缘符合');
assert(madVerdict(0.020) === '不符合', 'MAD=0.020 → 不符合');

// ========== 结果 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
