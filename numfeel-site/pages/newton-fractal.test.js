// 测试文件：牛顿分形核心算法
// 用法：node numfeel-site/pages/newton-fractal.test.js
const {
  cmul, cdiv, cpow,
  newtonStep, newtonStepN, newtonStepCustom,
  getRoots, newtonIterate, newtonIterateFast,
  computeNewtonFractal, computeNewtonFractalCustom,
  getColor, getViewportInfo,
  COLOR_PALETTES, CUSTOM_ROOTS, CUSTOM_F, CUSTOM_FP,
  NEWTON_PRESETS, SINGLE_POINT_PRESETS,
} = require('./newton-fractal/engine.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}
function assertClose(actual, expected, tol, msg) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; console.log(`  ✅ ${msg} (=${actual})`); }
  else { failed++; console.error(`  ❌ ${msg}: expected ${expected}, got ${actual}`); }
}

console.log('\n🧪 牛顿分形 - 核心算法测试\n');

// ── 复数辅助运算 ──
console.log('--- 复数基础运算 ---');
const mul = cmul(1, 1, 1, 1); // (1+i)*(1+i) = 2i
assertClose(mul.r, 0, 1e-10, 'cmul (1+i)².r = 0');
assertClose(mul.i, 2, 1e-10, 'cmul (1+i)².i = 2');

const div = cdiv(1, 0, 1, 1); // 1/(1+i) = (1-i)/2
assertClose(div.r, 0.5, 1e-10, 'cdiv 1/(1+i).r = 0.5');
assertClose(div.i, -0.5, 1e-10, 'cdiv 1/(1+i).i = -0.5');

const pow3 = cpow(2, 0, 3); // 2³ = 8
assertClose(pow3.r, 8, 1e-10, 'cpow 2³ = 8');
assertClose(pow3.i, 0, 1e-10, 'cpow 2³.i = 0');

const powI = cpow(0, 1, 3); // i³ = -i
assertClose(powI.r, 0, 1e-10, 'cpow i³.r = 0');
assertClose(powI.i, -1, 1e-10, 'cpow i³.i = -1');

// ── getRoots ──
console.log('--- getRoots ---');

// z³-1 的三个根：1, e^(2πi/3), e^(4πi/3)
const roots3 = getRoots(3);
assert(roots3.length === 3, `z³-1 返回 3 个根 (got ${roots3.length})`);
assertClose(roots3[0].r, 1, 1e-10, 'z³-1 第一个根实部 = 1');
assertClose(roots3[0].i, 0, 1e-10, 'z³-1 第一个根虚部 = 0');
assertClose(roots3[1].r, -0.5, 1e-10, 'z³-1 第二个根实部 = -0.5');
assertClose(roots3[1].i, Math.sqrt(3) / 2, 1e-10, 'z³-1 第二个根虚部 = √3/2');
assertClose(roots3[2].r, -0.5, 1e-10, 'z³-1 第三个根实部 = -0.5');
assertClose(roots3[2].i, -Math.sqrt(3) / 2, 1e-10, 'z³-1 第三个根虚部 = -√3/2');

// 验证所有根都满足 |z| = 1
roots3.forEach((r, i) => {
  const mod = Math.sqrt(r.r * r.r + r.i * r.i);
  assertClose(mod, 1, 1e-10, `z³-1 根 ${i} 模长 = 1`);
});

// z⁴-1 应返回四个根
const roots4 = getRoots(4);
assert(roots4.length === 4, `z⁴-1 返回 4 个根 (got ${roots4.length})`);
assertClose(roots4[0].r, 1, 1e-10, 'z⁴-1 第一个根 = 1');
assertClose(roots4[1].i, 1, 1e-10, 'z⁴-1 第二个根 = i');
assertClose(roots4[2].r, -1, 1e-10, 'z⁴-1 第三个根 = -1');
assertClose(roots4[3].i, -1, 1e-10, 'z⁴-1 第四个根 = -i');

// z⁵-1 应返回五个根
const roots5 = getRoots(5);
assert(roots5.length === 5, `z⁵-1 返回 5 个根 (got ${roots5.length})`);

// ── newtonStep 单步正确性 ──
console.log('--- newtonStep (z³-1) ---');

// z=(2,0)：z³=8, z²=4
// 公式：(2z³+1)/(3z²) = (17)/(12) = 17/12
const step1 = newtonStep(2, 0);
assertClose(step1.zr, 17 / 12, 1e-10, 'newtonStep(2,0).zr = 17/12');
assertClose(step1.zi, 0, 1e-10, 'newtonStep(2,0).zi = 0');

// z=(0,0)：z²=0, z³=0, 分母=0，应返回原点（奇异点保护）
const step0 = newtonStep(0, 0);
assertClose(step0.zr, 0, 1e-10, 'newtonStep(0,0) 奇异点保护 zr=0');
assertClose(step0.zi, 0, 1e-10, 'newtonStep(0,0) 奇异点保护 zi=0');

// z=(1,0)：已在根上，应稳定
const stepRoot = newtonStep(1, 0);
assertClose(stepRoot.zr, 1, 1e-10, 'newtonStep(1,0) 在根上稳定');
assertClose(stepRoot.zi, 0, 1e-10, 'newtonStep(1,0).zi = 0');

// 复数点 z=(0.5, 0.5)
// z² = (0.5+0.5i)² = 0 + 0.5i
// z³ = z²·z = (0+0.5i)(0.5+0.5i) = -0.25 + 0.25i
// num = 2z³+1 = 0.5 + 0.5i
// den = 3z² = 0 + 1.5i
// num/den = (0.5+0.5i)/(1.5i) = (0.5+0.5i)·(-2i/3) = (1/3) - (1/3)i  ... 让我重算
// (0.5+0.5i)/(1.5i) = (0.5+0.5i) * (1/(1.5i)) = (0.5+0.5i) * (-i/1.5)
// = (0.5+0.5i) * (-2i/3)
// = -i/3 + (-i)(0.5i)/1.5 = -i/3 + 0.5/1.5 = 1/3 - i/3
const stepC = newtonStep(0.5, 0.5);
assertClose(stepC.zr, 1 / 3, 1e-10, 'newtonStep(0.5,0.5).zr = 1/3');
assertClose(stepC.zi, -1 / 3, 1e-10, 'newtonStep(0.5,0.5).zi = -1/3');

// ── newtonStepN 通用性 ──
console.log('--- newtonStepN ---');

// n=3 应与 newtonStep 完全一致
const stepN3 = newtonStepN(2, 0, 3);
assertClose(stepN3.zr, 17 / 12, 1e-10, 'newtonStepN(2,0,3) 与 newtonStep 一致');
assertClose(stepN3.zi, 0, 1e-10, 'newtonStepN(2,0,3).zi = 0');

// n=4 手算 z=(2,0): z³=8, z⁴=16
// 公式：((n-1)z^n + 1) / (n z^(n-1)) = (3*16+1)/(4*8) = 49/32
const stepN4 = newtonStepN(2, 0, 4);
assertClose(stepN4.zr, 49 / 32, 1e-10, 'newtonStepN(2,0,4).zr = 49/32');
assertClose(stepN4.zi, 0, 1e-10, 'newtonStepN(2,0,4).zi = 0');

// n=5 手算 z=(2,0): z⁴=16, z⁵=32
// (4*32+1)/(5*16) = 129/80
const stepN5 = newtonStepN(2, 0, 5);
assertClose(stepN5.zr, 129 / 80, 1e-10, 'newtonStepN(2,0,5).zr = 129/80');
assertClose(stepN5.zi, 0, 1e-10, 'newtonStepN(2,0,5).zi = 0');

// ── newtonStepCustom ──
console.log('--- newtonStepCustom (z³-2z+2) ---');

// z=(1,0): f(1)=1-2+2=1, f'(1)=3-2=1, z_new = 1 - 1/1 = 0
const stepCust1 = newtonStepCustom(1, 0, CUSTOM_F, CUSTOM_FP);
assertClose(stepCust1.zr, 0, 1e-10, 'newtonStepCustom(1,0) z³-2z+2 = 0');
assertClose(stepCust1.zi, 0, 1e-10, 'newtonStepCustom(1,0).zi = 0');

// 验证 CUSTOM_ROOTS 确实是方程的根
CUSTOM_ROOTS.forEach((root, i) => {
  const fz = CUSTOM_F(root.r, root.i);
  assertClose(fz.r, 0, 1e-6, `CUSTOM_ROOTS[${i}] f(z).r ≈ 0`);
  assertClose(fz.i, 0, 1e-6, `CUSTOM_ROOTS[${i}] f(z).i ≈ 0`);
});

// ── newtonIterate 收敛性 ──
console.log('--- newtonIterate ---');

// 从根附近开始 (1.01, 0)，应快速收敛到第一个根
const conv1 = newtonIterate(1.01, 0, 3, 100, 1e-6);
assert(conv1.rootIndex === 0, `(1.01,0) 收敛到根 0`);
assert(conv1.iterations < 5, `(1.01,0) 迭代次数 < 5 (got ${conv1.iterations})`);

// 从 (-0.5, √3/2 + 0.01) 开始，应收敛到第二个根
const r2 = getRoots(3)[1];
const conv2 = newtonIterate(r2.r + 0.01, r2.i + 0.01, 3, 100, 1e-6);
assert(conv2.rootIndex === 1, `第二根附近收敛到根 1`);

// 从远离边界的点开始，应收敛到某个根
const conv3 = newtonIterate(1.5, 0.5, 3, 100, 1e-6);
assert(conv3.rootIndex >= 0 && conv3.rootIndex < 3, `(1.5,0.5) 收敛到合法根 ${conv3.rootIndex}`);
assert(conv3.iterations < 30, `(1.5,0.5) 收敛合理快 (got ${conv3.iterations})`);

// trajectory 长度 = iterations + 1
assert(conv1.trajectory.length === conv1.iterations + 1,
  `trajectory 长度 = iterations+1: ${conv1.trajectory.length} vs ${conv1.iterations + 1}`);
assert(conv3.trajectory.length === conv3.iterations + 1,
  `trajectory 长度 = iterations+1: ${conv3.trajectory.length} vs ${conv3.iterations + 1}`);

// trajectory 起点应等于输入
assertClose(conv1.trajectory[0].zr, 1.01, 1e-10, 'trajectory[0].zr = 输入起点');
assertClose(conv1.trajectory[0].zi, 0, 1e-10, 'trajectory[0].zi = 输入起点');

// 起点即在根上，应 0 次迭代收敛
const convAtRoot = newtonIterate(1, 0, 3, 100, 1e-6);
assert(convAtRoot.rootIndex === 0 && convAtRoot.iterations === 0,
  `起点在根上立即收敛 (iter=${convAtRoot.iterations})`);
assert(convAtRoot.trajectory.length === 1, `起点在根上 trajectory 长度=1`);

// ── 对称性测试 ──
console.log('--- 对称性：z³-1 的 120° 旋转对称 ---');
// z³-1 有 120° 旋转对称：把起点旋转 120°，收敛的根也对应旋转
// 旋转 120° = 乘以 e^(2πi/3) = (-0.5, √3/2)
const angle = (2 * Math.PI) / 3;
const cosA = Math.cos(angle), sinA = Math.sin(angle);
const startZr = 0.7, startZi = 0.2;

// 旋转 120°：(zr + zi·i) * (cosA + sinA·i)
const rotZr = startZr * cosA - startZi * sinA;
const rotZi = startZr * sinA + startZi * cosA;

const convOrig = newtonIterate(startZr, startZi, 3, 100, 1e-6);
const convRot = newtonIterate(rotZr, rotZi, 3, 100, 1e-6);

// 旋转后的 rootIndex 应等于 (原 rootIndex + 1) % 3
if (convOrig.rootIndex >= 0 && convRot.rootIndex >= 0) {
  const expectedRot = (convOrig.rootIndex + 1) % 3;
  assert(convRot.rootIndex === expectedRot,
    `120° 旋转: 根 ${convOrig.rootIndex} -> 根 ${convRot.rootIndex} (期望 ${expectedRot})`);
  assert(convRot.iterations === convOrig.iterations,
    `120° 旋转: 迭代次数一致 (${convOrig.iterations} vs ${convRot.iterations})`);
} else {
  assert(false, '对称性测试中两个点都应收敛');
}

// 旋转 240°：(rootIndex + 2) % 3
const angle2 = (4 * Math.PI) / 3;
const cosA2 = Math.cos(angle2), sinA2 = Math.sin(angle2);
const rot2Zr = startZr * cosA2 - startZi * sinA2;
const rot2Zi = startZr * sinA2 + startZi * cosA2;
const convRot2 = newtonIterate(rot2Zr, rot2Zi, 3, 100, 1e-6);
if (convOrig.rootIndex >= 0 && convRot2.rootIndex >= 0) {
  const expectedRot2 = (convOrig.rootIndex + 2) % 3;
  assert(convRot2.rootIndex === expectedRot2,
    `240° 旋转: 根 ${convOrig.rootIndex} -> 根 ${convRot2.rootIndex} (期望 ${expectedRot2})`);
}

// ── n=4,5 的收敛 ──
console.log('--- n=4,5 收敛 ---');
// n=4 从 (1.5, 0) 应收敛到 (1,0) 即根 0
const conv4 = newtonIterate(1.5, 0, 4, 100, 1e-6);
assert(conv4.rootIndex === 0, `n=4 (1.5,0) 收敛到根 0 (got ${conv4.rootIndex})`);
assert(conv4.iterations < 15, `n=4 (1.5,0) 迭代 < 15 (got ${conv4.iterations})`);

// n=5 从 (1.5, 0) 应收敛到 (1,0) 即根 0
const conv5 = newtonIterate(1.5, 0, 5, 100, 1e-6);
assert(conv5.rootIndex === 0, `n=5 (1.5,0) 收敛到根 0 (got ${conv5.rootIndex})`);

// n=4 旋转 90°: 根 index + 1
const angle4 = Math.PI / 2;
const rot4Zr = 1.5 * Math.cos(angle4) - 0.1 * Math.sin(angle4);
const rot4Zi = 1.5 * Math.sin(angle4) + 0.1 * Math.cos(angle4);
const conv4Rot = newtonIterate(rot4Zr, rot4Zi, 4, 100, 1e-6);
if (conv4.rootIndex >= 0 && conv4Rot.rootIndex >= 0) {
  const expRot4 = (conv4.rootIndex + 1) % 4;
  assert(conv4Rot.rootIndex === expRot4,
    `n=4 90° 旋转: 根 ${conv4.rootIndex} -> 根 ${conv4Rot.rootIndex} (期望 ${expRot4})`);
}

// ── computeNewtonFractal 输出格式 ──
console.log('--- computeNewtonFractal ---');

const result = computeNewtonFractal(50, 50, 0, 0, 1, 3, 100);
assert(result.rootIndices.length === 2500, `rootIndices 长度 = 2500 (got ${result.rootIndices.length})`);
assert(result.iterCounts.length === 2500, `iterCounts 长度 = 2500 (got ${result.iterCounts.length})`);
assert(result.rootIndices instanceof Int8Array, 'rootIndices 是 Int8Array');
assert(result.iterCounts instanceof Float32Array, 'iterCounts 是 Float32Array');

// 所有 rootIndices 在 [0, n-1] 或 -1 范围内
let validRoots = true;
let hasConverged = false;
let hasUnconverged = false;
for (let i = 0; i < result.rootIndices.length; i++) {
  const v = result.rootIndices[i];
  if (v < -1 || v > 2) { validRoots = false; break; }
  if (v >= 0) hasConverged = true;
  if (v === -1) hasUnconverged = true;
}
assert(validRoots, 'rootIndices 值都在 [-1, 2] 范围');
assert(hasConverged, '50×50 渲染包含收敛点');
// 全景下大部分点应收敛
const convergedCount = Array.from(result.rootIndices).filter(v => v >= 0).length;
assert(convergedCount / result.rootIndices.length > 0.9,
  `全景下 >90% 像素收敛 (实际 ${((convergedCount / result.rootIndices.length) * 100).toFixed(1)}%)`);

// ── getColor 输出合法性 ──
console.log('--- getColor ---');

// 未收敛点：黑色
const black = getColor(-1, 50, 100, 3, 'classic');
assert(black.r === 0 && black.g === 0 && black.b === 0, '未收敛点为黑色');

// 各根的合法颜色
for (let r = 0; r < 5; r++) {
  const c = getColor(r, 10, 100, 5, 'classic');
  assert(c.r >= 0 && c.r <= 255, `根 ${r} R 合法: ${c.r}`);
  assert(c.g >= 0 && c.g <= 255, `根 ${r} G 合法: ${c.g}`);
  assert(c.b >= 0 && c.b <= 255, `根 ${r} B 合法: ${c.b}`);
  assert(c.r + c.g + c.b > 0, `根 ${r} 颜色非黑`);
}

// 不同根应有不同颜色
const c0 = getColor(0, 10, 100, 3, 'classic');
const c1 = getColor(1, 10, 100, 3, 'classic');
const c2 = getColor(2, 10, 100, 3, 'classic');
assert(c0.r !== c1.r || c0.g !== c1.g || c0.b !== c1.b, '根 0 与根 1 颜色不同');
assert(c0.r !== c2.r || c0.g !== c2.g || c0.b !== c2.b, '根 0 与根 2 颜色不同');
assert(c1.r !== c2.r || c1.g !== c2.g || c1.b !== c2.b, '根 1 与根 2 颜色不同');

// 亮度编码：迭代越多颜色越暗
const bright = getColor(0, 2, 100, 3, 'classic');   // 2 步收敛，亮
const dark = getColor(0, 90, 100, 3, 'classic');    // 90 步收敛，暗
const brightSum = bright.r + bright.g + bright.b;
const darkSum = dark.r + dark.g + dark.b;
assert(brightSum > darkSum, `亮度编码: 快收敛(${brightSum}) > 慢收敛(${darkSum})`);

// 不同配色方案
['classic', 'heat', 'ice', 'neon'].forEach(scheme => {
  const c = getColor(0, 10, 100, 3, scheme);
  assert(c.r >= 0 && c.r <= 255, `${scheme} R 合法`);
  assert(c.g >= 0 && c.g <= 255, `${scheme} G 合法`);
  assert(c.b >= 0 && c.b <= 255, `${scheme} B 合法`);
});

// 未知 scheme 应回退到 classic
const fallback = getColor(0, 10, 100, 3, 'unknown-scheme');
const classicC = getColor(0, 10, 100, 3, 'classic');
assert(fallback.r === classicC.r && fallback.g === classicC.g && fallback.b === classicC.b,
  '未知 scheme 回退到 classic');

// ── 边界行为：maxIter=1 时大部分点未收敛 ──
console.log('--- 边界行为 ---');

const tiny = computeNewtonFractal(30, 30, 0, 0, 1, 3, 1);
let unconvergedCount = 0;
for (let i = 0; i < tiny.rootIndices.length; i++) {
  if (tiny.rootIndices[i] === -1) unconvergedCount++;
}
const unconvRatio = unconvergedCount / tiny.rootIndices.length;
assert(unconvRatio > 0.5,
  `maxIter=1 时 >50% 像素未收敛 (实际 ${((unconvRatio) * 100).toFixed(1)}%)`);

// maxIter=1 时所有收敛点的 iterCounts 都应是 1
let allIterOne = true;
for (let i = 0; i < tiny.iterCounts.length; i++) {
  if (tiny.rootIndices[i] >= 0 && tiny.iterCounts[i] !== 1) { allIterOne = false; break; }
}
assert(allIterOne, 'maxIter=1 时收敛点 iterCounts 全为 1');

// ── computeNewtonFractalCustom（z³-2z+2）──
console.log('--- computeNewtonFractalCustom ---');

const stepFnCustom = function (zr, zi) {
  return newtonStepCustom(zr, zi, CUSTOM_F, CUSTOM_FP);
};
const resultCustom = computeNewtonFractalCustom(30, 30, 0, 0, 1, stepFnCustom, CUSTOM_ROOTS, 100);
assert(resultCustom.rootIndices.length === 900, `自定义方程渲染长度 = 900`);
assert(resultCustom.rootIndices instanceof Int8Array, '自定义 rootIndices 是 Int8Array');

let customConverged = 0;
for (let i = 0; i < resultCustom.rootIndices.length; i++) {
  if (resultCustom.rootIndices[i] >= 0) customConverged++;
}
assert(customConverged > 0, `自定义方程有收敛点`);

// ── getViewportInfo ──
console.log('--- getViewportInfo ---');

const vp = getViewportInfo(400, 400, 0, 0, 1);
assertClose(vp.realMin, -2, 1e-10, '默认视口 realMin = -2');
assertClose(vp.realMax, 2, 1e-10, '默认视口 realMax = 2');
assertClose(vp.imagMin, -2, 1e-10, '默认视口 imagMin = -2');
assertClose(vp.imagMax, 2, 1e-10, '默认视口 imagMax = 2');
assert(vp.pixelSize > 0, `pixelSize > 0: ${vp.pixelSize}`);

// 放大后像素尺寸应减小
const vpZoom = getViewportInfo(400, 400, 0, 0, 10);
assert(vpZoom.pixelSize < vp.pixelSize, '放大后像素尺寸更小');

// ── 预设数据 ──
console.log('--- 预设数据 ---');

assert(Array.isArray(NEWTON_PRESETS) && NEWTON_PRESETS.length >= 3,
  `NEWTON_PRESETS 数量 >= 3 (got ${NEWTON_PRESETS.length})`);
NEWTON_PRESETS.forEach((p, i) => {
  assert(typeof p.name === 'string' && p.name.length > 0, `预设 ${i} 有名称: ${p.name}`);
  assert(typeof p.x === 'number' && typeof p.y === 'number', `预设 ${i} 坐标合法`);
  assert(p.zoom >= 1, `预设 ${i} zoom >= 1: ${p.zoom}`);
  assert(p.n >= 2, `预设 ${i} n >= 2: ${p.n}`);
});

assert(Array.isArray(SINGLE_POINT_PRESETS) && SINGLE_POINT_PRESETS.length >= 3,
  `SINGLE_POINT_PRESETS 数量 >= 3 (got ${SINGLE_POINT_PRESETS.length})`);
SINGLE_POINT_PRESETS.forEach((p, i) => {
  assert(typeof p.name === 'string', `单点预设 ${i} 有名称`);
  assert(typeof p.zr === 'number' && typeof p.zi === 'number', `单点预设 ${i} 坐标合法`);
});

// ── 性能基准 ──
console.log('--- 性能基准 ---');

const startT = Date.now();
computeNewtonFractal(100, 100, 0, 0, 1, 3, 100);
const elapsedT = Date.now() - startT;
assert(elapsedT < 5000, `100×100 @ 100 iter < 5s: ${elapsedT}ms`);
console.log(`  ℹ️  100×100 @ 100 iter 耗时: ${elapsedT}ms`);

// n=5 的性能
const startT5 = Date.now();
computeNewtonFractal(80, 80, 0, 0, 1, 5, 100);
const elapsedT5 = Date.now() - startT5;
assert(elapsedT5 < 5000, `80×80 @ n=5 @ 100 iter < 5s: ${elapsedT5}ms`);
console.log(`  ℹ️  80×80 @ n=5 @ 100 iter 耗时: ${elapsedT5}ms`);

// ── 结果汇总 ──
console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
