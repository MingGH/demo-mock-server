/**
 * 跨界收费站 - 逻辑单测
 * 用本机真实测量值（noop 19.2ns / java 0.63ns / percall 31.5ns / batch 0.049ns）做锚点。
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
  assert(Math.abs(actual - expected) <= tol, (msg || '') + ' expected ~' + expected + ', got ' + actual);
}

// 本机 2026-10-01 实测锚点
const MEASURED = { toll: 19.2, java: 0.63, percall: 31.5, batch: 0.049 };

console.log('== speedup ==');

t('单次过境 vs Java：0.63/31.5 → 慢 50 倍', () => {
  assertClose(L.speedup(MEASURED.java, MEASURED.percall), 0.02, 0.001);
});

t('攒批 vs Java：0.63/0.049 → 快约 12.9 倍', () => {
  assertClose(L.speedup(MEASURED.java, MEASURED.batch), 12.857, 0.01);
});

console.log('== crossoverBatch（实测值版）==');

t('实测锚点：19.2 / (0.63 - 0.049) ≈ 33.04 次（上整 34）', () => {
  const c = L.crossoverBatch(MEASURED.java, MEASURED.batch, MEASURED.toll);
  assertClose(c, 33.04, 0.01);
});

t('C++ 不比 JIT 后的 Java 快：返回 null', () => {
  assert(L.crossoverBatch(0.5, 0.5, 20) === null);
  assert(L.crossoverBatch(0.5, 0.6, 20) === null);
});

t('非法输入抛异常', () => {
  let threw = false;
  try { L.crossoverBatch(0, 1, 1); } catch (e) { threw = true; }
  assert(threw);
  threw = false;
  try { L.crossoverBatch(1, 1, -1); } catch (e) { threw = true; }
  assert(threw);
});

console.log('== measuredCurve（由实测值推导）==');

t('N=1 时 C++ 均摊 = b + v = 19.25ns，与实测单次过境同量级', () => {
  const c = L.measuredCurve(MEASURED.java, MEASURED.batch, MEASURED.toll, 1000000);
  assertClose(c.nativePerOp[0], MEASURED.toll + MEASURED.batch, 1e-9);
  assertClose(c.javaPerOp[0], MEASURED.java, 1e-9);
});

t('大批量时 C++ 均摊趋近实测 v=0.049，Java 线恒定', () => {
  const c = L.measuredCurve(MEASURED.java, MEASURED.batch, MEASURED.toll, 1000000);
  const last = c.nativePerOp[c.nativePerOp.length - 1];
  assert(last < MEASURED.batch * 1.01, 'last=' + last);
  assert(c.javaPerOp.every(v => v === MEASURED.java), 'java flat');
});

t('曲线单调不升', () => {
  const c = L.measuredCurve(MEASURED.java, MEASURED.batch, MEASURED.toll, 1000000);
  for (let i = 1; i < c.nativePerOp.length; i++) {
    assert(c.nativePerOp[i] <= c.nativePerOp[i - 1], 'monotonic at i=' + i);
  }
});

console.log('== verdict（真实数据状态机）==');

t('数据不全：引导用户先跑', () => {
  const v = L.verdict({});
  assert(v.text.includes('开始实测'));
});

t('教科书结局：单次撞墙 + 攒批反转，判词点名两者', () => {
  const r = {
    toll: MEASURED.toll,
    java: { perOpNs: MEASURED.java },
    percall: { perOpNs: MEASURED.percall },
    batch: { perOpNs: MEASURED.batch }
  };
  const v = L.verdict(r);
  assert(v.cls === 'success', v.cls);
  assert(v.text.includes('慢 50.0 倍'), v.text);
  assert(v.text.includes('攒批过境快 12.9 倍'), v.text);
  assert(v.text.includes('34'), v.text);
});

t('粗活结局：单次也赢（zlib 型负载）', () => {
  const r = {
    toll: MEASURED.toll,
    java: { perOpNs: 2000 },
    percall: { perOpNs: 480 },
    batch: { perOpNs: 400 }
  };
  const v = L.verdict(r);
  assert(v.cls === 'success', v.cls);
  assert(v.text.includes('单次过境也快'), v.text);
});

t('JIT 死局结局：C++ 纯计算没有优势', () => {
  const r = {
    toll: MEASURED.toll,
    java: { perOpNs: 0.5 },
    percall: { perOpNs: 20 },
    batch: { perOpNs: 0.6 }
  };
  const v = L.verdict(r);
  assert(v.cls === 'warn', v.cls);
  assert(v.text.includes('赢不了'), v.text);
});

console.log('== fmt ==');

t('fmtNs 三段自适应', () => {
  assert(L.fmtNs(0.049) === '0.05 ns', L.fmtNs(0.049));
  assert(L.fmtNs(31.517) === '31.5 ns', L.fmtNs(31.517));
  assert(L.fmtNs(19199.5) === '19.2 µs', L.fmtNs(19199.5));
  assert(L.fmtNs(3244666) === '3.24 ms', L.fmtNs(3244666));
});

t('fmtCount 千分位', () => {
  assert(L.fmtCount(1000000) === '1,000,000');
});

console.log('');
console.log('passed=' + passed + ' failed=' + failed);
if (failed > 0) process.exit(1);
