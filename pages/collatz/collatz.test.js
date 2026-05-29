/**
 * Collatz 猜想核心算法单元测试
 * 运行方式：node pages/collatz/collatz.test.js
 */

const {
  collatzSequence,
  collatzSteps,
  collatzMax,
  batchSteps,
  findLongest,
  findHighest,
  stepsDistribution,
  formatNumber
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEq(actual, expected, msg) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg} — expected: ${expected}, got: ${actual}`);
  }
}

function assertArrayEq(actual, expected, msg) {
  const eq = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  if (eq) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
    console.error(`    expected: [${expected.join(',')}]`);
    console.error(`    got:      [${actual.join(',')}]`);
  }
}

// ── collatzSequence ──
console.log('\ncollatzSequence:');

assertArrayEq(collatzSequence(1), [1], 'n=1 返回 [1]');
assertArrayEq(collatzSequence(2), [2, 1], 'n=2 返回 [2, 1]');
assertArrayEq(collatzSequence(3), [3, 10, 5, 16, 8, 4, 2, 1], 'n=3 经典序列');
assertArrayEq(collatzSequence(4), [4, 2, 1], 'n=4 返回 [4, 2, 1]');
assertArrayEq(collatzSequence(6), [6, 3, 10, 5, 16, 8, 4, 2, 1], 'n=6 的序列');

// 边界情况
assertArrayEq(collatzSequence(0), [], 'n=0 无效输入返回空数组');
assertArrayEq(collatzSequence(-5), [], '负数返回空数组');
assertArrayEq(collatzSequence(1.5), [], '非整数返回空数组');

// ── collatzSteps ──
console.log('\ncollatzSteps:');

assertEq(collatzSteps(1), 0, 'n=1 步数为0');
assertEq(collatzSteps(2), 1, 'n=2 步数为1');
assertEq(collatzSteps(3), 7, 'n=3 步数为7');
assertEq(collatzSteps(4), 2, 'n=4 步数为2');
assertEq(collatzSteps(7), 16, 'n=7 步数为16');
assertEq(collatzSteps(27), 111, 'n=27 步数为111（经典难缠数字）');
assertEq(collatzSteps(97), 118, 'n=97 步数为118');
assertEq(collatzSteps(0), 0, 'n=0 无效输入返回0');

// ── collatzMax ──
console.log('\ncollatzMax:');

assertEq(collatzMax(1), 1, 'n=1 最大值为1');
assertEq(collatzMax(3), 16, 'n=3 最大值为16');
assertEq(collatzMax(27), 9232, 'n=27 最大值为9232');
assertEq(collatzMax(7), 52, 'n=7 最大值为52');

// ── batchSteps ──
console.log('\nbatchSteps:');

const batch5 = batchSteps(5);
assertEq(batch5.length, 5, 'batchSteps(5) 返回5个结果');
assertEq(batch5[0].n, 1, '第一个元素 n=1');
assertEq(batch5[0].steps, 0, '第一个元素 steps=0');
assertEq(batch5[2].n, 3, '第三个元素 n=3');
assertEq(batch5[2].steps, 7, '第三个元素 steps=7');

// ── findLongest ──
console.log('\nfindLongest:');

const longest100 = findLongest(100);
assertEq(longest100.n, 97, '1~100中最难缠的是97');
assertEq(longest100.steps, 118, '97需要118步');

const longest10 = findLongest(10);
assertEq(longest10.n, 9, '1~10中最难缠的是9');
assertEq(longest10.steps, 19, '9需要19步');

// ── findHighest ──
console.log('\nfindHighest:');

const highest100 = findHighest(100);
// 27 和 77 都到达 9232，但 27 先出现所以 findHighest 返回 27
assertEq(highest100.n, 27, '1~100中飞最高的是27');
assertEq(highest100.max, 9232, '27的最高飞行高度为9232');

// ── stepsDistribution ──
console.log('\nstepsDistribution:');

const dist10 = stepsDistribution(10);
assert(dist10 instanceof Map, '返回 Map 类型');
assertEq(dist10.get(0), 1, '步数0只有 n=1');
assertEq(dist10.get(1), 1, '步数1: 只有 n=2');

// 检查所有 count 的总和为10
let total = 0;
for (const [, count] of dist10) total += count;
assertEq(total, 10, '1~10 分布总和为10');

// ── formatNumber ──
console.log('\nformatNumber:');

assertEq(formatNumber(999), '999', '小于1万的数字原样展示');
assertEq(formatNumber(15000), '1.5万', '万级数字');
assertEq(formatNumber(230000000), '2.3亿', '亿级数字');
assertEq(formatNumber(5000000000000), '5.0万亿', '万亿级数字');

// ── 验证 Collatz 猜想对小范围的正确性 ──
console.log('\nCollatz 猜想验证 (1~1000):');

let allReach1 = true;
for (let i = 1; i <= 1000; i++) {
  const seq = collatzSequence(i);
  if (seq[seq.length - 1] !== 1) {
    allReach1 = false;
    console.error(`  ✗ n=${i} 没有到达1，末尾值: ${seq[seq.length - 1]}`);
    break;
  }
}
assert(allReach1, '1~1000 所有数都能到达1');

// ── 一些数论性质验证 ──
console.log('\n数论性质:');

// 2的幂次步数 = log2(n)
assertEq(collatzSteps(8), 3, '2^3=8 步数为3');
assertEq(collatzSteps(16), 4, '2^4=16 步数为4');
assertEq(collatzSteps(32), 5, '2^5=32 步数为5');
assertEq(collatzSteps(1024), 10, '2^10=1024 步数为10');

// ── 结果汇总 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
