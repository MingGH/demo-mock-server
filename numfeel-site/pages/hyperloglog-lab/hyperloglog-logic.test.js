'use strict';
const assert = require('assert');
const L = require('./hyperloglog-logic.js');

let passed = 0;
function t(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

// 1. 默认结构：16384 桶 × 6bit = 12KB
t('默认 16384 桶，内存 12KB', () => {
  const h = L.createHll();
  assert.strictEqual(h.m, 16384);
  assert.strictEqual(L.hllMemoryBytes(h), 12288);
});

// 2. 空结构估计为 0
t('空结构估计 0', () => {
  assert.strictEqual(L.hllEstimate(L.createHll()), 0);
});

// 3. 重复元素不感知：同一 ID 灌 1 万遍，非零桶数不变、估计不变
t('重复灌 1 万遍，寄存器纹丝不动', () => {
  const h = L.createHll();
  L.hllAdd(h, 'visitor_42');
  const est1 = L.hllEstimate(h);
  const snap = Array.from(h.registers);
  for (let i = 0; i < 10000; i++) L.hllAdd(h, 'visitor_42');
  assert.strictEqual(L.hllNonZeroCount(h), 1);
  assert.deepStrictEqual(Array.from(h.registers), snap);
  assert.strictEqual(L.hllEstimate(h), est1);
});

// 4. 精度：1 千 / 1 万 / 5 万不同元素，估计误差 < 10%（理论标准差 0.81%）
t('不同规模估计误差 < 10%', () => {
  for (const n of [1000, 10000, 50000]) {
    const h = L.createHll();
    for (let i = 0; i < n; i++) L.hllAdd(h, 'u' + i);
    const est = L.hllEstimate(h);
    const err = Math.abs(est - n) / n;
    assert.ok(err < 0.10, 'n=' + n + ' 估计 ' + est + ' 误差 ' + (err * 100).toFixed(2) + '%');
  }
});

// 5. 寄存器单调不降
t('寄存器只增不减', () => {
  const h = L.createHll();
  for (let i = 0; i < 20000; i++) L.hllAdd(h, 'a' + i);
  const snap = Array.from(h.registers);
  for (let i = 0; i < 20000; i++) L.hllAdd(h, 'b' + i);
  const snap2 = Array.from(h.registers);
  for (let i = 0; i < snap.length; i++) {
    assert.ok(snap2[i] >= snap[i]);
  }
});

// 6. 合并：两份 2 万基数的分片，合并后估计接近 4 万（PFMERGE 不放大误差）
t('两分片合并估计接近总和', () => {
  const a = L.createHll();
  const b = L.createHll();
  for (let i = 0; i < 20000; i++) L.hllAdd(a, 'x' + i);
  for (let i = 0; i < 20000; i++) L.hllAdd(b, 'y' + i);
  const m = L.hllMerge(a, b);
  const est = L.hllEstimate(m);
  assert.ok(Math.abs(est - 40000) / 40000 < 0.10, '合并估计 ' + est);
});

// 7. 非法输入抛异常
t('null / 对象 / NaN 抛 TypeError', () => {
  const h = L.createHll();
  assert.throws(() => L.hllAdd(h, null), TypeError);
  assert.throws(() => L.hllAdd(h, undefined), TypeError);
  assert.throws(() => L.hllAdd(h, { id: 1 }), TypeError);
  assert.throws(() => L.hllAdd(h, NaN), TypeError);
});

// 8. p 参数校验
t('非法 p 抛 RangeError', () => {
  assert.throws(() => L.createHll(3), RangeError);
  assert.throws(() => L.createHll(17), RangeError);
  assert.throws(() => L.createHll(1.5), RangeError);
});

// 9. 内存模型精确值
t('内存模型：HashSet 72B/条、位图 1bit/ID', () => {
  assert.strictEqual(L.hashSetBytes(100000000), 7200000000);
  assert.strictEqual(L.bitmapBytes(99999999), 12500000);
  assert.strictEqual(L.bitmapBytes(0), 1);
  assert.strictEqual(L.budgetBytes(), 67108864);
  assert.strictEqual(L.hashSetCapacity(), Math.floor(67108864 / 72));
});

// 10. 抛硬币：确定 RNG 下精确断言
t('抛硬币统计（固定序列）', () => {
  const alwaysTails = () => 0.9;
  const s1 = L.coinFlipStats(100, alwaysTails);
  assert.strictEqual(s1.longestRun, 0);
  assert.strictEqual(s1.estimate, 1);
  let i = 0;
  const pattern = [0.1, 0.9, 0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1, 0.9];
  const s2 = L.coinFlipStats(10, () => pattern[i++]);
  assert.strictEqual(s2.longestRun, 4);
  assert.strictEqual(s2.estimate, 16);
});

// 11. 抛硬币：10 万次的最长连击应落在对数附近（10~30 之间）
t('10 万次抛掷最长连击在对数量级', () => {
  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };
  const s = L.coinFlipStats(100000, rng);
  assert.ok(s.longestRun >= 10 && s.longestRun <= 30, '最长连击 ' + s.longestRun);
  assert.strictEqual(s.flips, 100000);
});

// 12. rho 边界
t('rho：全 0 剩余位取理论最大值', () => {
  assert.strictEqual(L.rhoOf(0x00003fff, 14), 19); // 低 14 位是桶号，剩余全 0
  assert.strictEqual(L.rhoOf(0x80000000, 14), 1);  // 剩余位最高位是 1
  assert.strictEqual(L.rhoOf(0xffffffff, 14), 1);
});

console.log('\n全部 ' + passed + ' 组测试通过');
