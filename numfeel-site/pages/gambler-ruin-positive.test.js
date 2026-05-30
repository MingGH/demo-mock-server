// 赌徒破产问题（正期望）单元测试
// 运行方式：node pages/gambler-ruin-positive.test.js

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    failed++;
  }
}

function assertClose(desc, actual, expected, tol = 1e-6) {
  const ok = Math.abs(actual - expected) < tol;
  if (ok) {
    console.log(`  ✓ ${desc} (${actual.toExponential(4)})`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}: got ${actual}, expected ${expected} ±${tol}`);
    failed++;
  }
}

// ─── 核心函数 ────────────────────────────────────────────────
function calcRuin(p, N) {
  const q = 1 - p;
  if (Math.abs(p - 0.5) < 1e-9) return 1;
  const r = q / p;
  return Math.exp(N * Math.log(r));
}

function calcExpSteps(p, N) {
  const q = 1 - p;
  if (Math.abs(p - 0.5) < 1e-9) return Infinity;
  return N / (p - q);
}

// ─── 测试套件 ────────────────────────────────────────────────
console.log('\n=== 破产概率公式测试 ===');

// 公平赌博：破产概率 = 1
assertClose('公平赌博 p=0.5 破产概率=1', calcRuin(0.5, 100), 1, 1e-9);

// p=0.6, N=1: 破产概率 = q/p = 0.4/0.6 = 2/3
assertClose('p=0.6 N=1 破产概率=2/3', calcRuin(0.6, 1), 2/3, 1e-9);

// p=0.6, N=2: 破产概率 = (0.4/0.6)^2
assertClose('p=0.6 N=2 破产概率=(2/3)^2', calcRuin(0.6, 2), (2/3)**2, 1e-9);

// p=0.501, N=5000: 极小概率
const ruin501_5000 = calcRuin(0.501, 5000);
assert('p=0.501 N=5000 破产概率 < 1e-8', ruin501_5000 < 1e-8);
assert('p=0.501 N=5000 破产概率 > 0', ruin501_5000 > 0);

// p=0.55, N=100
const ruin55_100 = calcRuin(0.55, 100);
assert('p=0.55 N=100 破产概率 < 0.01', ruin55_100 < 0.01);
assert('p=0.55 N=100 破产概率 > 0', ruin55_100 > 0);

// 胜率越高，破产概率越低
assert('p=0.6 N=100 < p=0.51 N=100', calcRuin(0.6, 100) < calcRuin(0.51, 100));

// 本金越多，破产概率越低
assert('p=0.55 N=200 < p=0.55 N=100', calcRuin(0.55, 200) < calcRuin(0.55, 100));

console.log('\n=== 期望步数公式测试 ===');

// p=0.6, N=100: E = 100/(0.6-0.4) = 500
assertClose('p=0.6 N=100 期望步数=500', calcExpSteps(0.6, 100), 500, 1e-6);

// p=0.501, N=5000: E = 5000/(0.002) = 2,500,000
assertClose('p=0.501 N=5000 期望步数=2500000', calcExpSteps(0.501, 5000), 2500000, 1);

// p=0.5: 无穷大
assert('公平赌博期望步数=Infinity', calcExpSteps(0.5, 100) === Infinity);

// 本金越多，期望步数越多（线性）
assert('N=200 期望步数 = 2 × N=100', Math.abs(calcExpSteps(0.6, 200) / calcExpSteps(0.6, 100) - 2) < 1e-9);

console.log('\n=== 蒙特卡洛验证（小规模）===');

// 用 p=0.6, N=5 做蒙特卡洛，理论破产概率 = (0.4/0.6)^5 ≈ 0.1317
function monteCarlo(p, N, maxSteps, trials) {
  let ruined = 0;
  for (let t = 0; t < trials; t++) {
    let cap = N;
    for (let i = 0; i < maxSteps; i++) {
      cap += Math.random() < p ? 1 : -1;
      if (cap <= 0) { ruined++; break; }
    }
  }
  return ruined / trials;
}

const theory = calcRuin(0.6, 5);
const mc = monteCarlo(0.6, 5, 100000, 10000);
const relErr = Math.abs(mc - theory) / theory;
console.log(`  理论破产概率: ${theory.toFixed(6)}, 蒙特卡洛: ${mc.toFixed(6)}, 相对误差: ${(relErr*100).toFixed(1)}%`);
assert('蒙特卡洛相对误差 < 10%', relErr < 0.10);

// p=0.55, N=10
const theory2 = calcRuin(0.55, 10);
const mc2 = monteCarlo(0.55, 10, 100000, 10000);
const relErr2 = Math.abs(mc2 - theory2) / theory2;
console.log(`  理论破产概率: ${theory2.toFixed(6)}, 蒙特卡洛: ${mc2.toFixed(6)}, 相对误差: ${(relErr2*100).toFixed(1)}%`);
assert('p=0.55 N=10 蒙特卡洛相对误差 < 10%', relErr2 < 0.10);

console.log('\n=== 边界条件 ===');
assert('p=1 N=任意 破产概率=0', calcRuin(1, 100) === 0);
assert('p=0.999 N=1 破产概率极小', calcRuin(0.999, 1) < 0.01);
assert('p=0.501 N=1 破产概率接近0.998', Math.abs(calcRuin(0.501, 1) - 0.499/0.501) < 1e-9);

// ─── 汇总 ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`通过: ${passed}  失败: ${failed}`);
if (failed === 0) {
  console.log('全部测试通过 ✓');
  process.exit(0);
} else {
  console.error(`${failed} 个测试失败`);
  process.exit(1);
}
