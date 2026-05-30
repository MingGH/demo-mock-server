// A+B=90, A÷B=17 各种解法的核心算法测试
// 运行: node pages/ab-equation-overkill.test.js

const TRUE_A = 85, TRUE_B = 5;
const EPS = 1e-6;
let passed = 0, failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name} ${detail}`);
    failed++;
  }
}

// ── 牛顿迭代法 ──
function newtonSolve() {
  let B = 50;
  for (let i = 0; i < 50; i++) {
    const f = 18 * B - 90;
    if (Math.abs(f) < 1e-12) break;
    B -= f / 18;
  }
  return { A: 17 * B, B };
}

// ── 二分法 ──
function bisectSolve() {
  let lo = 0.001, hi = 89;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (18 * mid - 90 < 0) lo = mid; else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  const B = (lo + hi) / 2;
  return { A: 17 * B, B };
}

// ── 梯度下降 ──
function gradientSolve() {
  let A = 1, B = 1;
  const lr = 0.001;
  for (let i = 0; i < 10000; i++) {
    const c1 = A + B - 90, c2 = A - 17 * B;
    A -= lr * (2 * c1 + 2 * c2);
    B -= lr * (2 * c1 - 34 * c2);
    if (Math.abs(c1) < 1e-10 && Math.abs(c2) < 1e-10) break;
  }
  return { A, B };
}

// ── 线性代数（精确） ──
function matrixSolve() {
  // [1,1;1,-17] * [A;B] = [90;0]
  // det = -17 - 1 = -18
  const det = -18;
  const A = (90 * (-17) - 0 * 1) / det;
  const B = (1 * 0 - 1 * 90) / det;
  return { A, B };
}

// ── 运行测试 ──
console.log('\n=== A+B=90, A÷B=17 解法测试 ===\n');

console.log('牛顿迭代法:');
const r1 = newtonSolve();
assert('A ≈ 85', Math.abs(r1.A - TRUE_A) < EPS, `got ${r1.A}`);
assert('B ≈ 5',  Math.abs(r1.B - TRUE_B) < EPS, `got ${r1.B}`);
assert('A+B=90', Math.abs(r1.A + r1.B - 90) < EPS);
assert('A/B=17', Math.abs(r1.A / r1.B - 17) < EPS);

console.log('\n二分法:');
const r2 = bisectSolve();
assert('A ≈ 85', Math.abs(r2.A - TRUE_A) < EPS, `got ${r2.A}`);
assert('B ≈ 5',  Math.abs(r2.B - TRUE_B) < EPS, `got ${r2.B}`);

console.log('\n梯度下降:');
const r3 = gradientSolve();
assert('A ≈ 85', Math.abs(r3.A - TRUE_A) < 1e-4, `got ${r3.A}`);
assert('B ≈ 5',  Math.abs(r3.B - TRUE_B) < 1e-4, `got ${r3.B}`);

console.log('\n线性代数（矩阵法）:');
const r4 = matrixSolve();
assert('A = 85 精确', r4.A === TRUE_A, `got ${r4.A}`);
assert('B = 5 精确',  r4.B === TRUE_B, `got ${r4.B}`);

console.log('\n约束验证:');
assert('A ≠ 0', TRUE_A !== 0);
assert('B ≠ 0', TRUE_B !== 0);
assert('A + B = 90', TRUE_A + TRUE_B === 90);
assert('A / B = 17', TRUE_A / TRUE_B === 17);

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
