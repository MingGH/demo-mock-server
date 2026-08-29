// ========== Arnold 猫变换 单元测试 ==========
const arnold = require('./arnold.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, `${msg}（实际 ${actual}，期望 ${expected}±${tol}）`);
}

// ── 测试 1：前向 + 逆向 = 恒等（任意尺寸）──
function testForwardInverseRestores() {
  for (const size of [3, 5, 8, 16, 31, 64]) {
    const fwd = arnold.buildForwardMap(size);
    const inv = arnold.buildInverseMap(size);
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 11 + 7) % 256;
    const scrambled = arnold.applyMap(rgba, fwd, size);
    const restored = arnold.applyMap(scrambled, inv, size);
    let same = true;
    for (let i = 0; i < rgba.length; i++) {
      if (restored[i] !== rgba[i]) { same = false; break; }
    }
    assert(same, `size=${size}：forward 后 inverse 还原到原位`);
  }
}

// ── 测试 2：周期恢复——迭代 findPeriod 次后原图复原 ──
function testPeriodRestores() {
  const size = 16;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 7 + 3) % 256; // 确定性伪随机像素
  const period = arnold.findPeriod(size);
  const scrambled = arnold.applyMapTimes(rgba, arnold.buildForwardMap(size), period, size);
  let same = true;
  for (let i = 0; i < rgba.length; i++) {
    if (scrambled[i] !== rgba[i]) { same = false; break; }
  }
  assert(same, `size=16：迭代周期 ${period} 次后像素与原图完全一致`);
}

// ── 测试 3：周期公式——对 2 的幂 N=2^k（k≥3），T = 3·2^(k-2) ──
function testPeriodFormula() {
  for (let k = 3; k <= 9; k++) {
    const size = Math.pow(2, k);
    const period = arnold.findPeriod(size);
    const expected = 3 * Math.pow(2, k - 2);
    assertClose(period, expected, 0, `N=${size}：周期 ${period} = 3·2^(k-2) = ${expected}`);
  }
}

// ── 测试 4：周期为正且迭代不过半程不会复原 ──
function testNotRestoredBeforePeriod() {
  const size = 32;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 13 + 5) % 256;
  const period = arnold.findPeriod(size);
  const half = arnold.applyMapTimes(rgba, arnold.buildForwardMap(size), Math.floor(period / 2), size);
  let differs = false;
  for (let i = 0; i < rgba.length; i++) {
    if (half[i] !== rgba[i]) { differs = true; break; }
  }
  assert(differs, `size=32：迭代半周期 ${Math.floor(period / 2)} 次不会提前复原`);
}

// ── 测试 5：padToSquare 居中填充 ──
function testPadToSquare() {
  // 4×3 图 → 4×4 方形，居中，上下各补一行黑
  const w = 4, h = 3;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = 255; // 全白
  const res = arnold.padToSquare(rgba, w, h);
  assert(res.size === 4, '4×3 图填充后为 4×4');
  assert(res.offsetX === 0 && res.offsetY === 0, `居中偏移 (${res.offsetX}, ${res.offsetY})`);
  // 原图区域应为白色，底部一行应为黑色（默认 0，4×3 居中后补丁在底部）
  const bottomRowBlack = res.data[(res.size - 1) * 4 * res.size] === 0 && res.data[(res.size - 1) * 4 * res.size + 1] === 0;
  assert(bottomRowBlack, '填充的底部补丁为黑色');
  const origWhite = res.data[1 * 4 * res.size + 0] === 255 && res.data[1 * 4 * res.size + 1] === 255;
  assert(origWhite, '原图区域保持白色');
}

// ── 测试 6：置乱不丢像素（多集守恒）──
function testPixelConservation() {
  const size = 9;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 31) % 256;
  const scrambled = arnold.applyMapTimes(rgba, arnold.buildForwardMap(size), 7, size);
  const sorted = (arr) => Array.prototype.slice.call(arr).sort((a, b) => a - b).join(',');
  assert(sorted(rgba) === sorted(scrambled), 'size=9：置乱 7 次后像素多集完全守恒');
}

// ── 运行 ──
testForwardInverseRestores();
testPeriodRestores();
testPeriodFormula();
testNotRestoredBeforePeriod();
testPadToSquare();
testPixelConservation();

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);