/**
 * 布隆过滤器单元测试
 * 运行：node pages/bloom-filter/bloom.test.js
 */

const { BloomFilter, theoreticalFPR, optimalK, requiredBits, randomString } = require('./bloom.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (actual: ${actual.toFixed(4)}, expected: ${expected.toFixed(4)}, diff: ${diff.toFixed(4)})`);
}

console.log('\n=== BloomFilter 基本功能 ===');

(function testBasicInsertAndQuery() {
  const bf = new BloomFilter(10000, 7);
  bf.add('hello');
  bf.add('world');

  assert(bf.mightContain('hello') === true, '已插入元素应返回 true');
  assert(bf.mightContain('world') === true, '已插入元素应返回 true');
  assert(bf.count === 2, '计数应为 2');
})();

(function testNoFalseNegatives() {
  const bf = new BloomFilter(100000, 7);
  const items = [];
  for (let i = 0; i < 1000; i++) {
    const item = 'item_' + randomString(10);
    items.push(item);
    bf.add(item);
  }

  let falseNegatives = 0;
  for (const item of items) {
    if (!bf.mightContain(item)) falseNegatives++;
  }
  assert(falseNegatives === 0, '零漏报：已插入元素必须返回 true');
})();

console.log('\n=== 误判率验证 ===');

(function testFalsePositiveRate() {
  const n = 5000;
  const m = 50000;
  const k = 7;
  const bf = new BloomFilter(m, k);

  for (let i = 0; i < n; i++) {
    bf.add('insert_' + i);
  }

  let fp = 0;
  const testCount = 10000;
  for (let i = 0; i < testCount; i++) {
    if (bf.mightContain('never_inserted_' + randomString(12) + '_' + i)) {
      fp++;
    }
  }

  const actualRate = fp / testCount;
  const expectedRate = theoreticalFPR(n, m, k);

  console.log(`    实际误判率: ${(actualRate * 100).toFixed(2)}%`);
  console.log(`    理论误判率: ${(expectedRate * 100).toFixed(2)}%`);

  // 允许实际值在理论值的 3 倍范围内（随机波动）
  assert(actualRate < expectedRate * 3, `实际误判率应在理论值合理范围内`);
})();

console.log('\n=== 数学公式验证 ===');

(function testTheoreticalFPR() {
  // n=1000, m=10000, k=7 → 约 0.82%
  const fpr = theoreticalFPR(1000, 10000, 7);
  assertApprox(fpr, 0.0082, 0.001, 'n=1000,m=10000,k=7 误判率约 0.82%');
})();

(function testOptimalK() {
  // m/n = 10, 最优 k = 10 * ln2 ≈ 7
  const k = optimalK(10000, 1000);
  assert(k === 7, `最优 k: m/n=10 时应为 7 (实际: ${k})`);

  // m/n = 14.4 (0.1% FPR), 最优 k ≈ 10
  const k2 = optimalK(14400, 1000);
  assert(k2 === 10, `最优 k: m/n=14.4 时应为 10 (实际: ${k2})`);
})();

(function testRequiredBits() {
  // 1 亿元素，0.1% 误判率，约 14.4 bits/element
  const bits = requiredBits(100000000, 0.001);
  const bitsPerElement = bits / 100000000;
  assertApprox(bitsPerElement, 14.4, 0.1, '0.1% FPR 每元素约需 14.4 bits');
})();

console.log('\n=== 填充率验证 ===');

(function testFillRate() {
  const bf = new BloomFilter(10000, 7);
  assert(bf.getFillRate() === 0, '空过滤器填充率应为 0');

  for (let i = 0; i < 500; i++) {
    bf.add('fill_' + i);
  }
  const rate = bf.getFillRate();
  assert(rate > 0 && rate < 1, `插入后填充率应在 0-1 之间 (实际: ${rate.toFixed(3)})`);
})();

(function testReset() {
  const bf = new BloomFilter(1000, 5);
  bf.add('test');
  bf.reset();
  assert(bf.getFillRate() === 0, 'reset 后填充率应为 0');
  assert(bf.count === 0, 'reset 后计数应为 0');
  assert(bf.mightContain('test') === false, 'reset 后不应包含已插入元素');
})();

console.log('\n=== 结果 ===');
console.log(`通过: ${passed}, 失败: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
