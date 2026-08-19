// ========== JPEG2000 演示引擎 单元测试 ==========
// 运行: node pages/jpeg2000/engine.test.js
// 说明：真实 JPEG2000 编解码由 codec.js（OpenJPEG/WASM）负责，不在 Node 单测范围；
// 这里测试纯逻辑工具与教学可视化的 Haar 小波。

const {
  haar1d, ihaar1d, dwt2d, extractBand,
  psnr, toGrayscale, bytesToHuman, searchQualityForSize
} = require('./engine.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}
function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ~${b})`);
}

// ── 测试 1: Haar 1D 正逆变换往返 ──
console.log('\n[Haar 1D 往返]');
{
  const arr = new Float32Array([100, 120, 200, 220, 50, 50]);
  const t = haar1d(arr);
  assertClose(t[0], 110, 1e-4, '低频1 = (100+120)/2');
  assertClose(t[1], 210, 1e-4, '低频2 = (200+220)/2');
  assertClose(t[3], -10, 1e-4, '高频1 = (100-120)/2');
  assertClose(t[5], 0, 1e-4, '高频3 = (50-50)/2');
}

// ── 测试 2: Haar 1D 奇数长度 ──
console.log('\n[Haar 1D 奇数长度]');
{
  const arr = new Float32Array([10, 20, 30, 40, 99]);
  const t = haar1d(arr);
  assertClose(t[4], 99, 1e-4, '奇数长度末尾原样保留');
}

// ── 测试 3: 2D DWT 子带提取 ──
console.log('\n[2D DWT / 子带提取]');
{
  const w = 8, h = 8;
  const gray = new Float32Array(w * h).fill(128);
  const coeff = dwt2d(gray, w, h);
  const ll = extractBand(coeff, w, h, 0);
  const lh = extractBand(coeff, w, h, 1);
  const hl = extractBand(coeff, w, h, 2);
  const hh = extractBand(coeff, w, h, 3);
  assert(ll.w === 4 && ll.h === 4, 'LL 4×4');
  assert(lh.w === 4 && lh.h === 4, 'LH 4×4');
  assert(hl.w === 4 && hl.h === 4, 'HL 4×4');
  assert(hh.w === 4 && hh.h === 4, 'HH 4×4');
  assertClose(ll.data[0], 128, 1e-3, '平坦图 LL = 128');
  let hfZero = true;
  for (let i = 0; i < hh.data.length; i++) if (Math.abs(hh.data[i]) > 1e-3) { hfZero = false; break; }
  assert(hfZero, '平坦图 HH 高频≈0');
}

// ── 测试 3b: 含边缘图 → 高频非零（能量分布正确） ──
console.log('\n[2D DWT 边缘检测]');
{
  const w = 8, h = 8;
  const gray = new Float32Array(w * h);
  // 奇偶列交替明暗：每个 Haar 对内都有 0/255 反差，水平细节 LH 应产生显著系数
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) gray[j * w + i] = (i % 2 === 0) ? 0 : 255;
  const coeff = dwt2d(gray, w, h);
  const lh = extractBand(coeff, w, h, 1); // 水平细节（垂直边缘）
  let maxAbs = 0;
  for (let i = 0; i < lh.data.length; i++) maxAbs = Math.max(maxAbs, Math.abs(lh.data[i]));
  assert(maxAbs > 50, `垂直条纹在 LH 子带产生显著系数 (max=${maxAbs.toFixed(1)})`);
}

// ── 测试 4: PSNR ──
console.log('\n[PSNR]');
{
  const a = new Float32Array(100).fill(128);
  const b = new Float32Array(100).fill(128);
  assert(psnr(a, b) === Infinity, '完全一致 → PSNR=Infinity');
  const c = new Float32Array(100).fill(0);
  assert(psnr(a, c) === 10 * Math.log10(255 * 255 / (128 * 128)), '全 0 vs 全128 → 固定值');
}

// ── 测试 5: bytesToHuman ──
console.log('\n[bytesToHuman]');
{
  assert(bytesToHuman(0) === '0 B', '0 B');
  assert(bytesToHuman(512) === '512 B', '512 B');
  assert(bytesToHuman(2048) === '2.0 KB', '2.0 KB');
  assert(bytesToHuman(3 * 1024 * 1024) === '3.00 MB', '3.00 MB');
  assert(bytesToHuman(-1) === '—', '负值 → —');
}

// ── 测试 6: searchQualityForSize 单调体积匹配 ──
console.log('\n[searchQualityForSize]');
(async () => {
  try {
    // 模拟 JPEG：质量 q 越大体积越大（线性），目标 = 中点
    const fn = async (q) => Math.round(100 + q * 1000);
    const r = await searchQualityForSize(fn, 600, { tolerance: 0.05, iterations: 8 });
    assert(Math.abs(r.size - 600) / 600 <= 0.06, `匹配目标体积 600 (±6%)，实际 ${r.size}`);
    // 目标比最小质量还小 → 取最小质量
    const r2 = await searchQualityForSize(fn, 50, { tolerance: 0.05, iterations: 8 });
    assert(r2.quality === 0.02, '目标过小 → 钳制到最小质量');
    // 目标比最大质量还大 → 取最大质量
    const r3 = await searchQualityForSize(fn, 5000, { tolerance: 0.05, iterations: 8 });
    assert(r3.quality === 0.99, '目标过大 → 钳制到最大质量');
  } finally {
    finish();
  }
})();

// ── 测试 7: toGrayscale ──
console.log('\n[toGrayscale]');
{
  const w = 2, h = 1;
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const gray = toGrayscale({ data, width: w, height: h });
  assertClose(gray[0], 0.299 * 255, 1e-3, '纯红灰度 = 0.299*255');
  assertClose(gray[1], 0.587 * 255, 1e-3, '纯绿灰度 = 0.587*255');
}

// ── 结果 ──
function finish() {
  console.log(`\n${'='.repeat(40)}`);
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  if (failed > 0) process.exit(1);
}
