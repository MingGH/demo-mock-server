/**
 * JNI 边界收费站 - 逻辑单测
 * 用可手算的参数反推公式，再检查边界非法输入。
 */
const L = require('./jni-boundary-logic.js');

let passed = 0;
let failed = 0;

function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL - ' + name + ': ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertClose(actual, expected, relTol, msg) {
  const tol = Math.max(Math.abs(expected), 1) * relTol;
  assert(Math.abs(actual - expected) <= tol,
    (msg || '') + ' expected ~' + expected + ', got ' + actual);
}

function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  assert(threw, 'should throw: ' + (msg || ''));
}

console.log('== nativeOpNs ==');

t('3 倍速：5ns / 3 = 1.667ns', () => {
  assertClose(L.nativeOpNs(5, 3), 5 / 3, 1e-9);
});

t('1 倍速：等于 Java 本身', () => {
  assertClose(L.nativeOpNs(5, 1), 5, 1e-9);
});

console.log('== javaTotal ==');

t('批量不影响 Java：100 万次 × 5ns = 5ms', () => {
  assertClose(L.javaTotal(1000000, 5), 5e6, 1e-9);
  assertClose(L.javaTotal(1, 5), 5, 1e-9);
});

console.log('== nativePerCallTotal ==');

t('每次都过境：N=1 时 2+80=82ns', () => {
  assertClose(L.nativePerCallTotal(1, 2, 80), 82, 1e-9);
});

t('线性增长：N=1000 → 82000ns', () => {
  assertClose(L.nativePerCallTotal(1000, 2, 80), 82000, 1e-9);
});

console.log('== nativeBatchTotal ==');

t('攒批过境：80 + 100×2 = 280ns', () => {
  assertClose(L.nativeBatchTotal(100, 2, 80), 280, 1e-9);
});

t('批量趋大：过路费占比趋近 0', () => {
  const share = L.boundaryShare(1000000, 2, 80, 'batch');
  assert(share < 0.001, 'share=' + share);
});

console.log('== crossoverBatch：核心反直觉点 ==');

t('教科书值：80 / (5 - 5/3) = 24 次开始反超', () => {
  assertClose(L.crossoverBatch(5, 5 / 3, 80), 24, 1e-9);
});

t('N=23 还没反超，N=25 已反超', () => {
  const j = 5, v = 5 / 3, b = 80;
  assert(L.javaTotal(23, j) <= L.nativeBatchTotal(23, v, b), '23 should still lose');
  assert(L.javaTotal(25, j) > L.nativeBatchTotal(25, v, b), '25 should win');
});

t('C++ 不比 JIT 后的 Java 快：永远反超不了，返回 null', () => {
  assert(L.crossoverBatch(3, 3, 80) === null, 'equal speedup');
  assert(L.crossoverBatch(3, 4, 80) === null, 'native slower');
});

t('过路费越高，交叉点越靠右', () => {
  const c1 = L.crossoverBatch(5, 2, 80);
  const c2 = L.crossoverBatch(5, 2, 200);
  assert(c2 > c1, 'higher toll pushes crossover right');
});

console.log('== speedup ==');

t('达标案例：N=100，j=5，v=5/3，b=80 → 约 2.03 倍', () => {
  const s = L.speedup(L.javaTotal(100, 5), L.nativeBatchTotal(100, 5 / 3, 80));
  assertClose(s, 2.027, 0.01);
});

t('撞墙案例：N=1 单次过境 → 5/(80+5/3) ≈ 0.061 倍（慢 16 倍）', () => {
  const s = L.speedup(L.javaTotal(1, 5), L.nativePerCallTotal(1, 5 / 3, 80));
  assertClose(s, 5 / (80 + 5 / 3), 1e-9);
  assert(s < 0.1, 'single-call should lose badly');
});

console.log('== boundaryShare ==');

t('单次过境 N=1：过路费占 80/82 ≈ 97.6%', () => {
  assertClose(L.boundaryShare(1, 2, 80, 'perCall'), 80 / 82, 1e-9);
});

t('批量过境 N=100：过路费占 80/280 ≈ 28.6%', () => {
  assertClose(L.boundaryShare(100, 2, 80, 'batch'), 80 / 280, 1e-9);
});

console.log('== marginalGain ==');

t('批量越大，边际收益越小：1→2 涨 40ns，9999→10000 只涨不到 0.01ns', () => {
  const g1 = L.marginalGain(5, 2, 80, 1, 2);
  const g2 = L.marginalGain(5, 2, 80, 9999, 10000);
  assertClose(g1, 40, 1e-9);
  assert(g2 < 0.01, 'g2=' + g2);
});

console.log('== amortizedCurve ==');

t('曲线首点 N=1：Java 5 / C++ 82，末点趋近 C++ 纯计算耗时', () => {
  const c = L.amortizedCurve(5, 2, 80, 100000);
  assertClose(c.javaPerOp[0], 5, 1e-9);
  assertClose(c.nativePerOp[0], 82, 1e-9);
  const last = c.nativePerOp[c.nativePerOp.length - 1];
  assert(last < 2.01 && last > 2, 'last=' + last);
  assert(c.javaPerOp.every(v => v === 5), 'java line flat');
});

t('曲线单调不升：批量越大均摊越低', () => {
  const c = L.amortizedCurve(5, 2, 80, 100000);
  for (let i = 1; i < c.nativePerOp.length; i++) {
    assert(c.nativePerOp[i] <= c.nativePerOp[i - 1], 'monotonic at i=' + i);
  }
});

console.log('== 非法输入 ==');

t('批量 0 / 负数 / 非整数都要抛异常', () => {
  assertThrows(() => L.javaTotal(0, 5));
  assertThrows(() => L.javaTotal(-10, 5));
  assertThrows(() => L.javaTotal(1.5, 5));
});

t('耗时必须 > 0，速度必须 >= 1', () => {
  assertThrows(() => L.nativeOpNs(0, 3));
  assertThrows(() => L.nativeOpNs(-1, 3));
  assertThrows(() => L.nativeOpNs(5, 0.5));
  assertThrows(() => L.nativeBatchTotal(10, 2, 0));
});

t('mode 非法值抛异常', () => {
  assertThrows(() => L.boundaryShare(10, 2, 80, 'nonsense'));
});

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed > 0) process.exit(1);
