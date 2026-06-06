// ========== Floyd-Steinberg 抖动算法 单元测试 ==========
// 运行: node pages/dithering/dither.test.js

const {
  floydSteinberg, atkinson, sierraLite,
  orderedDither, randomDither, thresholdDither, applyDither
} = require('./dither.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function assertApprox(a, b, tolerance, msg) {
  assert(Math.abs(a - b) <= tolerance, `${msg} (got ${a}, expected ~${b})`);
}

// ── 测试 1: 纯阈值 ──
console.log('\n[纯阈值]');
{
  const gray = new Float32Array([0, 64, 128, 192, 255]);
  const out = thresholdDither(gray, 5, 1, 128);
  assert(out[0] === 0, '0 → 黑');
  assert(out[1] === 0, '64 → 黑');
  assert(out[2] === 0, '128 → 黑 (等于阈值不超过)');
  assert(out[3] === 255, '192 → 白');
  assert(out[4] === 255, '255 → 白');
}

// ── 测试 2: 阈值参数生效 ──
console.log('\n[阈值参数]');
{
  const gray = new Float32Array([100, 100, 100, 100]);
  const out1 = thresholdDither(gray, 4, 1, 50);
  const out2 = thresholdDither(gray, 4, 1, 150);
  assert(out1[0] === 255, '阈值50，值100 → 白');
  assert(out2[0] === 0, '阈值150，值100 → 黑');
}

// ── 测试 3: Floyd-Steinberg 误差守恒 ──
console.log('\n[Floyd-Steinberg 误差守恒]');
{
  // 全128灰度，抖动后黑白像素各约50%
  const size = 100;
  const gray = new Float32Array(size * size).fill(128);
  const out = floydSteinberg(gray, size, size, 128);
  let blackCount = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0) blackCount++;
  }
  const ratio = blackCount / out.length;
  // 128/255 ≈ 50% 应该是黑色的
  assertApprox(ratio, 0.5, 0.05, '128灰度 → 约50%黑色');
}

// ── 测试 4: Floyd-Steinberg 纯黑/纯白不变 ──
console.log('\n[Floyd-Steinberg 边界]');
{
  const black = new Float32Array(25).fill(0);
  const white = new Float32Array(25).fill(255);
  const outB = floydSteinberg(black, 5, 5, 128);
  const outW = floydSteinberg(white, 5, 5, 128);

  let allBlack = true, allWhite = true;
  for (let i = 0; i < 25; i++) {
    if (outB[i] !== 0) allBlack = false;
    if (outW[i] !== 255) allWhite = false;
  }
  assert(allBlack, '纯黑输入 → 全黑输出');
  assert(allWhite, '纯白输入 → 全白输出');
}

// ── 测试 5: Floyd-Steinberg 输出只有 0 和 255 ──
console.log('\n[Floyd-Steinberg 二值输出]');
{
  const gray = new Float32Array(100);
  for (let i = 0; i < 100; i++) gray[i] = Math.random() * 255;
  const out = floydSteinberg(gray, 10, 10, 128);
  let allBinary = true;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== 0 && out[i] !== 255) { allBinary = false; break; }
  }
  assert(allBinary, '随机输入 → 输出全为0或255');
}

// ── 测试 6: Atkinson 误差守恒（只扩散 6/8，允许亮度偏移） ──
console.log('\n[Atkinson]');
{
  const size = 100;
  const gray = new Float32Array(size * size).fill(128);
  const out = atkinson(gray, size, size, 128);
  let blackCount = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0) blackCount++;
  }
  const ratio = blackCount / out.length;
  // Atkinson 只扩散75%误差，黑色比例会偏高（更暗）
  assert(ratio > 0.4 && ratio < 0.7, `Atkinson 128灰度黑色比例合理: ${(ratio*100).toFixed(1)}%`);
}

// ── 测试 7: Sierra Lite 输出二值 ──
console.log('\n[Sierra Lite]');
{
  const gray = new Float32Array(64);
  for (let i = 0; i < 64; i++) gray[i] = i * 4;
  const out = sierraLite(gray, 8, 8, 128);
  let allBinary = true;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== 0 && out[i] !== 255) { allBinary = false; break; }
  }
  assert(allBinary, '渐变输入 → 输出全为0或255');
}

// ── 测试 8: 有序抖动确定性 ──
console.log('\n[有序抖动]');
{
  const gray = new Float32Array(64).fill(128);
  const out1 = orderedDither(gray, 8, 8, 128);
  const out2 = orderedDither(gray, 8, 8, 128);
  let identical = true;
  for (let i = 0; i < out1.length; i++) {
    if (out1[i] !== out2[i]) { identical = false; break; }
  }
  assert(identical, '相同输入 → 相同输出（确定性）');
}

// ── 测试 9: 随机抖动非确定性 ──
console.log('\n[随机抖动]');
{
  const gray = new Float32Array(400).fill(128);
  const out1 = randomDither(gray, 20, 20, 128);
  const out2 = randomDither(gray, 20, 20, 128);
  let diff = 0;
  for (let i = 0; i < out1.length; i++) {
    if (out1[i] !== out2[i]) diff++;
  }
  assert(diff > 0, `两次随机抖动结果不同（差异${diff}个像素）`);
}

// ── 测试 10: applyDither 调度 ──
console.log('\n[applyDither 调度]');
{
  const gray = new Float32Array(16).fill(200);
  const out = applyDither(gray, 4, 4, 'threshold', 128);
  let allWhite = true;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== 255) { allWhite = false; break; }
  }
  assert(allWhite, 'applyDither("threshold") 正确调度');
}

// ── 测试 11: 渐变图保持整体亮度 ──
console.log('\n[渐变亮度守恒]');
{
  const w = 50, h = 50;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (i / (w * h)) * 255;
  const avgInput = gray.reduce((a, b) => a + b, 0) / gray.length;

  const out = floydSteinberg(gray, w, h, 128);
  const avgOutput = Array.from(out).reduce((a, b) => a + b, 0) / out.length;

  assertApprox(avgOutput, avgInput, 10, `渐变亮度守恒: 输入${avgInput.toFixed(0)} ≈ 输出${avgOutput.toFixed(0)}`);
}

// ── 结果 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
