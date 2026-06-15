// 傅里叶变换核心算法测试
// 运行: node pages/fourier-transform/fourier-transform.test.js

const {
  squareWaveCoeffs, sawtoothWaveCoeffs, triangleWaveCoeffs,
  fourierSum, targetWaveValue, computeRMSE,
  dct2d, idct2d, getQuantMatrix, quantize, dequantize, countNonZero,
  JPEG_QUANT_MATRIX
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${msg} (got ${actual.toFixed(6)}, expected ${expected.toFixed(6)}, tol ${tolerance})`);
}

// ── 波形系数测试 ──
console.log('\n=== 方波傅里叶系数 ===');
{
  const c = squareWaveCoeffs(3);
  assert(c.length === 3, '方波 3 项应有 3 个系数');
  assertApprox(c[0].freq, 1, 0, '第 1 个频率 = 1');
  assertApprox(c[0].amp, 4 / Math.PI, 0.0001, '第 1 项振幅 = 4/π');
  assertApprox(c[1].freq, 3, 0, '第 2 个频率 = 3');
  assertApprox(c[1].amp, 4 / (3 * Math.PI), 0.0001, '第 2 项振幅 = 4/(3π)');
  assertApprox(c[2].freq, 5, 0, '第 3 个频率 = 5');
}

console.log('\n=== 锯齿波傅里叶系数 ===');
{
  const c = sawtoothWaveCoeffs(4);
  assert(c.length === 4, '锯齿波 4 项应有 4 个系数');
  assertApprox(c[0].amp, 2 / Math.PI, 0.0001, '第 1 项振幅 = 2/π');
  assertApprox(c[1].amp, -2 / (2 * Math.PI), 0.0001, '第 2 项振幅 = -1/π');
}

console.log('\n=== 三角波傅里叶系数 ===');
{
  const c = triangleWaveCoeffs(2);
  assert(c.length === 2, '三角波 2 项应有 2 个系数');
  assertApprox(c[0].freq, 1, 0, '第 1 个频率 = 1');
  assertApprox(c[0].amp, 8 / (Math.PI * Math.PI), 0.0001, '第 1 项振幅 = 8/π²');
}

// ── 傅里叶求和测试 ──
console.log('\n=== 傅里叶求和 ===');
{
  const coeffs = [{ freq: 1, amp: 1, phase: 0 }];
  assertApprox(fourierSum(coeffs, Math.PI / 2), 1, 0.0001, 'sin(π/2) = 1');
  assertApprox(fourierSum(coeffs, 0), 0, 0.0001, 'sin(0) = 0');
  assertApprox(fourierSum(coeffs, Math.PI), 0, 0.0001, 'sin(π) ≈ 0');
}

// ── 目标波形值测试 ──
console.log('\n=== 目标波形值 ===');
{
  assertApprox(targetWaveValue('square', 0.5), 1, 0.0001, '方波 x>0 = 1');
  assertApprox(targetWaveValue('square', -0.5), -1, 0.0001, '方波 x<0 = -1');
  assertApprox(targetWaveValue('sawtooth', 0), 0, 0.0001, '锯齿波 x=0 → 0');
  assertApprox(targetWaveValue('triangle', 0), -1, 0.0001, '三角波 x=0 → -1');
  assertApprox(targetWaveValue('triangle', Math.PI), 1, 0.01, '三角波 x=π → 1');
}

// ── RMSE 收敛性测试 ──
console.log('\n=== RMSE 收敛性 ===');
{
  const rmse5 = computeRMSE(squareWaveCoeffs(5), 'square', 1000);
  const rmse20 = computeRMSE(squareWaveCoeffs(20), 'square', 1000);
  const rmse50 = computeRMSE(squareWaveCoeffs(50), 'square', 1000);
  assert(rmse5 > rmse20, `RMSE(5项)=${rmse5.toFixed(4)} > RMSE(20项)=${rmse20.toFixed(4)}`);
  assert(rmse20 > rmse50, `RMSE(20项)=${rmse20.toFixed(4)} > RMSE(50项)=${rmse50.toFixed(4)}`);
  assert(rmse50 < 0.1, `50 项后 RMSE < 0.1 (got ${rmse50.toFixed(4)})`);
}

// ── DCT/IDCT 可逆性测试 ──
console.log('\n=== DCT/IDCT 可逆性 ===');
{
  // 构造测试块
  const block = Array.from({ length: 8 }, (_, i) =>
    Float64Array.from({ length: 8 }, (_, j) => Math.sin(i * 0.5) * Math.cos(j * 0.3) * 100)
  );
  const dctBlock = dct2d(block);
  const restored = idct2d(dctBlock);

  let maxErr = 0;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      maxErr = Math.max(maxErr, Math.abs(block[i][j] - restored[i][j]));
    }
  }
  assert(maxErr < 0.01, `DCT→IDCT 最大误差 ${maxErr.toFixed(6)} < 0.01`);
}

// ── 量化矩阵测试 ──
console.log('\n=== 量化矩阵 ===');
{
  const q50 = getQuantMatrix(50);
  // quality=50 时量化矩阵应等于标准矩阵
  assert(q50[0][0] === 16, 'quality=50 → [0][0]=16 (标准值)');
  assert(q50[7][7] === 99, 'quality=50 → [7][7]=99 (标准值)');

  const q1 = getQuantMatrix(1);
  assert(q1[0][0] > q50[0][0], 'quality=1 的量化步长 > quality=50');

  const q100 = getQuantMatrix(100);
  assert(q100[0][0] === 1, 'quality=100 → 所有量化步长 = 1 (无损)');
}

// ── 量化/反量化测试 ──
console.log('\n=== 量化与非零系数统计 ===');
{
  const block = Array.from({ length: 8 }, () => new Float64Array(8));
  block[0][0] = 1000; // DC 分量
  block[0][1] = 50;   // 低频
  block[7][7] = 2;    // 高频（小值）

  const qm = getQuantMatrix(50);
  const qBlock = quantize(block, qm);

  // 高频小值应被量化为 0
  assert(qBlock[7][7] === 0, '高频小系数被量化为 0');
  assert(qBlock[0][0] !== 0, 'DC 分量不为 0');

  const nz = countNonZero(qBlock);
  assert(nz >= 1 && nz <= 64, `非零系数数量 ${nz} 在合理范围`);
}

// ── JPEG 量化矩阵格式 ──
console.log('\n=== JPEG 量化矩阵格式 ===');
{
  assert(JPEG_QUANT_MATRIX.length === 8, '量化矩阵 8 行');
  assert(JPEG_QUANT_MATRIX[0].length === 8, '量化矩阵 8 列');
  assert(JPEG_QUANT_MATRIX[0][0] === 16, '左上角（DC）= 16');
  assert(JPEG_QUANT_MATRIX[7][7] === 99, '右下角（最高频）= 99');
}

// ── 总结 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 项, 通过: ${passed}, 失败: ${failed}`);
if (failed > 0) process.exit(1);
else console.log('全部通过 ✓');
