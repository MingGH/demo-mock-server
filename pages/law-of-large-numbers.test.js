/**
 * 大数定律核心算法单元测试
 * 运行方式: node pages/law-of-large-numbers.test.js
 */

const {
  flipCoin,
  simulateFlips,
  simulateMultiplePaths,
  getFreqDistAtStep,
  calcOutlierRate,
  buildHistogram,
  theoreticalStd
} = require('./law-of-large-numbers.js');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.error('  ✗', name);
    console.error('   ', e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(msg || `Expected ${a} ≈ ${b} (tol=${tol})`);
}

console.log('\n=== flipCoin ===');
test('返回 0 或 1', () => {
  for (let i = 0; i < 100; i++) {
    const r = flipCoin();
    assert(r === 0 || r === 1, `Expected 0 or 1, got ${r}`);
  }
});
test('p=1 时始终返回 1', () => {
  for (let i = 0; i < 20; i++) assert(flipCoin(1) === 1);
});
test('p=0 时始终返回 0', () => {
  for (let i = 0; i < 20; i++) assert(flipCoin(0) === 0);
});
test('大量模拟时频率接近 p', () => {
  let heads = 0;
  for (let i = 0; i < 10000; i++) heads += flipCoin(0.5);
  assertClose(heads / 10000, 0.5, 0.03, `频率 ${heads/10000} 偏离 0.5 过多`);
});

console.log('\n=== simulateFlips ===');
test('返回长度为 n 的数组', () => {
  const r = simulateFlips(100);
  assert(r.length === 100, `Expected 100, got ${r.length}`);
});
test('所有值在 [0,1] 之间', () => {
  const r = simulateFlips(200);
  r.forEach(v => assert(v >= 0 && v <= 1, `Value ${v} out of range`));
});
test('最后一个值是累计频率（单调性不保证，但范围正确）', () => {
  const r = simulateFlips(1000);
  assertClose(r[999], 0.5, 0.1, `最终频率 ${r[999]} 偏离 0.5 过多`);
});
test('n=1 时返回 0 或 1', () => {
  const r = simulateFlips(1);
  assert(r[0] === 0 || r[0] === 1);
});

console.log('\n=== simulateMultiplePaths ===');
test('返回正确数量的路径', () => {
  const paths = simulateMultiplePaths(5, 100);
  assert(paths.length === 5, `Expected 5 paths, got ${paths.length}`);
});
test('每条路径长度正确', () => {
  const paths = simulateMultiplePaths(3, 50);
  paths.forEach(p => assert(p.length === 50, `Path length ${p.length} != 50`));
});

console.log('\n=== getFreqDistAtStep ===');
test('mean 接近 0.5', () => {
  const paths = simulateMultiplePaths(2000, 100);
  const dist = getFreqDistAtStep(paths, 100);
  assertClose(dist.mean, 0.5, 0.02, `Mean ${dist.mean} too far from 0.5`);
});
test('std 接近理论值', () => {
  const n = 100;
  const paths = simulateMultiplePaths(3000, n);
  const dist = getFreqDistAtStep(paths, n);
  const theory = theoreticalStd(n);
  assertClose(dist.std, theory, 0.01, `Std ${dist.std} vs theory ${theory}`);
});
test('min <= mean <= max', () => {
  const paths = simulateMultiplePaths(100, 50);
  const dist = getFreqDistAtStep(paths, 50);
  assert(dist.min <= dist.mean && dist.mean <= dist.max);
});

console.log('\n=== calcOutlierRate ===');
test('小样本偏差率高', () => {
  const paths = simulateMultiplePaths(2000, 10);
  const rate = calcOutlierRate(paths, 10, 0.5, 0.1);
  assert(rate > 20, `Expected >20% outliers for n=10, got ${rate}%`);
});
test('大样本偏差率低', () => {
  const paths = simulateMultiplePaths(2000, 1000);
  const rate = calcOutlierRate(paths, 1000, 0.5, 0.1);
  assert(rate < 1, `Expected <1% outliers for n=1000, got ${rate}%`);
});

console.log('\n=== buildHistogram ===');
test('返回正确 bins 数量', () => {
  const values = Array.from({length: 100}, () => Math.random());
  const hist = buildHistogram(values, 20);
  assert(hist.counts.length === 20);
  assert(hist.labels.length === 20);
});
test('counts 总和等于输入数量', () => {
  const values = Array.from({length: 500}, () => Math.random());
  const hist = buildHistogram(values, 20);
  const total = hist.counts.reduce((s, v) => s + v, 0);
  assert(total === 500, `Total ${total} != 500`);
});

console.log('\n=== theoreticalStd ===');
test('n=100, p=0.5 时 std=0.05', () => {
  assertClose(theoreticalStd(100, 0.5), 0.05, 0.0001);
});
test('n=400 时 std=0.025', () => {
  assertClose(theoreticalStd(400, 0.5), 0.025, 0.0001);
});
test('样本量翻4倍，std 减半', () => {
  const s1 = theoreticalStd(100);
  const s2 = theoreticalStd(400);
  assertClose(s1 / s2, 2, 0.001, `Ratio ${s1/s2} should be 2`);
});

console.log('\n=== 大数定律收敛验证 ===');
test('10000次模拟，频率收敛到 0.5 ± 0.01', () => {
  const freq = simulateFlips(10000);
  assertClose(freq[9999], 0.5, 0.01, `Final freq ${freq[9999]}`);
});
test('小样本(n=10)标准差 > 大样本(n=1000)标准差', () => {
  const p10 = simulateMultiplePaths(1000, 10);
  const p1000 = simulateMultiplePaths(1000, 1000);
  const std10 = getFreqDistAtStep(p10, 10).std;
  const std1000 = getFreqDistAtStep(p1000, 1000).std;
  assert(std10 > std1000 * 5, `std10=${std10} should be >> std1000=${std1000}`);
});

console.log('\n' + '='.repeat(40));
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
