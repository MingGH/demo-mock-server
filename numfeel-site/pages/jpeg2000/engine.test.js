// ========== JPEG2000 演示引擎 单元测试 ==========
// 运行: node pages/jpeg2000/engine.test.js

const {
  haar1d, ihaar1d, dwt2d, idwt2d, dwt2dLevels, idwt2dLevels, maxSafeLevels,
  extractBand,
  psnr, quantize, estimateBytes, jpeg2000Compress,
  jpegBlockArtifact, progressiveLevel, toGrayscale
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
  const back = ihaar1d(t);
  let ok = true;
  for (let i = 0; i < arr.length; i++) if (Math.abs(back[i] - arr[i]) > 1e-4) { ok = false; break; }
  assert(ok, '偶长度数组正逆往返无损');
  // 检验低频=前两个平均, 高频=差值/2
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
  const back = ihaar1d(t);
  assertClose(back[4], 99, 1e-4, '奇数长度末尾原样保留');
  let ok = true;
  for (let i = 0; i < 4; i++) if (Math.abs(back[i] - arr[i]) > 1e-4) { ok = false; break; }
  assert(ok, '前 4 个元素往返无损');
}

// ── 测试 3: 2D DWT 往返 ──
console.log('\n[2D DWT 往返]');
{
  const w = 8, h = 8;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (i * 37) % 256;
  const coeff = dwt2d(gray, w, h);
  const back = idwt2d(coeff, w, h);
  let ok = true;
  for (let i = 0; i < w * h; i++) if (Math.abs(back[i] - gray[i]) > 1e-3) { ok = false; break; }
  assert(ok, '任意数据 2D 往返无损');
}

// ── 测试 4: 子带提取尺寸 ──
console.log('\n[子带提取]');
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
  // 平坦图 → LL=128, 其余高频≈0
  assertClose(ll.data[0], 128, 1e-3, '平坦图 LL = 128');
  let hfZero = true;
  for (let i = 0; i < hh.data.length; i++) if (Math.abs(hh.data[i]) > 1e-3) { hfZero = false; break; }
  assert(hfZero, '平坦图 HH 高频≈0');
}

// ── 测试 5: PSNR ──
console.log('\n[PSNR]');
{
  const a = new Float32Array(100).fill(128);
  const b = new Float32Array(100).fill(128);
  assert(psnr(a, b) === Infinity, '完全一致 → PSNR=Infinity');
  const c = new Float32Array(100).fill(0);
  assert(psnr(a, c) === 10 * Math.log10(255 * 255 / (128 * 128)), '全 0 vs 全128 → 固定值');
}

// ── 测试 6: 量化 / 估计字节 ──
console.log('\n[量化与字节估计]');
{
  const coeff = new Float32Array([0.1, 5, 200, -100, 1, 2]);
  const bytesSmall = estimateBytes(coeff, 100);
  const bytesBig = estimateBytes(coeff, 1000);
  assert(bytesBig <= bytesSmall, '量化步长越大 → 非零系数越少');
  const q = quantize(coeff, 100);
  assert(q[2] === 200, '200/100=2 → 200');
  assert(q[1] === 0, '5/100=0.05 → 0');
}

// ── 测试 7: JPEG2000 压缩质量单调 ──
console.log('\n[JPEG2000 压缩]');
{
  const w = 16, h = 16;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (i * 13) % 256;
  const low = jpeg2000Compress(gray, w, h, 2, 1);    // 温和
  const high = jpeg2000Compress(gray, w, h, 2, 200); // 狠
  assert(high.psnr <= low.psnr, '量化越狠 → PSNR 越低');
  assert(high.compressionRatio >= low.compressionRatio, '量化越狠 → 压缩比越高');
  // 温和量化 PSNR 应很高
  assert(low.psnr > 30, `温和量化 PSNR>30dB (got ${low.psnr.toFixed(1)})`);
}

// ── 测试 7b: 多级 DWT 往返 ──
console.log('\n[多级 DWT 往返]');
{
  const w = 16, h = 16;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (i * 29) % 256;
  for (const levels of [1, 2, 3]) {
    const c = dwt2dLevels(gray, w, h, levels);
    const back = idwt2dLevels(c, w, h, levels);
    let ok = true;
    for (let i = 0; i < w * h; i++) if (Math.abs(back[i] - gray[i]) > 1e-3) { ok = false; break; }
    assert(ok, `levels=${levels} 多级 DWT 往返无损`);
  }
}

// ── 测试 7c: 层数越多压缩比越高（保留的无损区越小） ──
console.log('\n[层数影响压缩比]');
{
  const w = 16, h = 16;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (i * 7) % 256;
  const c1 = jpeg2000Compress(gray, w, h, 1, 50);
  const c3 = jpeg2000Compress(gray, w, h, 3, 50);
  assert(c3.compressionRatio >= c1.compressionRatio, '层数多 → 压缩比不更低');
}

// ── 测试 7d: 任意尺寸多级 DWT 不崩（层数自动钳制） ──
console.log('\n[任意尺寸钳制]');
{
  // 奇数 / 非 2 的幂尺寸，即使请求很多层也不应产生 NaN 或 0×0
  for (const [w, h] of [[800,600],[100,80],[18,10],[17,9],[6,4],[3,5]]) {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (i * 29) % 256;
    const c = dwt2dLevels(gray, w, h, 5);
    const back = idwt2dLevels(c, w, h, 5);
    let nan = false, bad = false;
    for (let i = 0; i < w * h; i++) {
      if (isNaN(back[i])) nan = true;
      if (Math.abs(back[i] - gray[i]) > 1e-3) bad = true;
    }
    // 保证最深层 LL 尺寸 ≥1 且不产生 NaN
    assert(!nan, `${w}x${h} 多层分解不产生 NaN`);
    const ms = maxSafeLevels(w, h, 5);
    assert(ms >= 0 && ms <= 5 && !isNaN(ms), `${w}x${h} maxSafeLevels=${ms} 有效`);
  }
}

// ── 测试 8: JPEG 块伪影 ──
console.log('\n[JPEG 块伪影]');
{
  const w = 16, h = 16;
  const gray = new Float32Array(w * h).fill(100);
  for (let i = 0; i < w; i++) gray[i] = 200; // 顶行亮
  const blocked = jpegBlockArtifact(gray, w, h, 8);
  // 第一个 8×8 块包含顶行的 200，平均后比原 100 高
  assert(blocked[0] > 100, '含亮边的块被平均后变亮');
  // 块内部完全一致（块效应）
  let uniform = true;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    if (blocked[j * w + i] !== blocked[0]) { uniform = false; break; }
  }
  assert(uniform, '同一 8×8 块内像素值完全一致（方块伪影）');
}

// ── 测试 9: 渐进多分辨率 ──
console.log('\n[渐进多分辨率]');
{
  const w = 16, h = 16;
  const gray = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) gray[j * w + i] = (i / w) * 255;
  const full = progressiveLevel(gray, w, h, 0);
  const half = progressiveLevel(gray, w, h, 1);
  const quarter = progressiveLevel(gray, w, h, 2);
  assert(full.w === 16 && full.h === 16, 'level0 全分辨率 16×16');
  assert(half.w === 8 && half.h === 8, 'level1 半分辨率 8×8');
  assert(quarter.w === 4 && quarter.h === 4, 'level2 1/4 分辨率 4×4');
  // 水平渐变：quarter 左上应暗、右下应亮
  assert(quarter.data[0] < quarter.data[quarter.data.length - 1], '1/4 图左暗右亮（保留低频结构）');
}

// ── 测试 10: toGrayscale ──
console.log('\n[toGrayscale]');
{
  const w = 2, h = 1;
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const gray = toGrayscale({ data, width: w, height: h });
  assertClose(gray[0], 0.299 * 255, 1e-3, '纯红灰度 = 0.299*255');
  assertClose(gray[1], 0.587 * 255, 1e-3, '纯绿灰度 = 0.587*255');
}

// ── 结果 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
