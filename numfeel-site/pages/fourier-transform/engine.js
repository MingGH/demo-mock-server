// ========== 傅里叶变换核心算法（可独立测试） ==========

/**
 * 生成方波的傅里叶级数系数
 * 方波 = (4/π) × Σ sin((2k-1)x) / (2k-1), k=1,2,3...
 */
function squareWaveCoeffs(n) {
  const coeffs = [];
  for (let k = 1; k <= n; k++) {
    const harmonic = 2 * k - 1;
    coeffs.push({ freq: harmonic, amp: 4 / (Math.PI * harmonic), phase: 0 });
  }
  return coeffs;
}

/**
 * 生成锯齿波的傅里叶级数系数
 * 锯齿波 = (2/π) × Σ (-1)^(k+1) × sin(kx) / k, k=1,2,3...
 */
function sawtoothWaveCoeffs(n) {
  const coeffs = [];
  for (let k = 1; k <= n; k++) {
    const sign = Math.pow(-1, k + 1);
    coeffs.push({ freq: k, amp: 2 * sign / (Math.PI * k), phase: 0 });
  }
  return coeffs;
}

/**
 * 生成三角波的傅里叶级数系数
 * 三角波 = (8/π²) × Σ (-1)^k × sin((2k+1)x) / (2k+1)², k=0,1,2...
 */
function triangleWaveCoeffs(n) {
  const coeffs = [];
  for (let k = 0; k < n; k++) {
    const harmonic = 2 * k + 1;
    const sign = Math.pow(-1, k);
    coeffs.push({ freq: harmonic, amp: 8 * sign / (Math.PI * Math.PI * harmonic * harmonic), phase: 0 });
  }
  return coeffs;
}

/**
 * 根据傅里叶系数在 x 处求和
 */
function fourierSum(coeffs, x) {
  let sum = 0;
  for (const c of coeffs) {
    sum += c.amp * Math.sin(c.freq * x + c.phase);
  }
  return sum;
}

/**
 * 生成目标波形的精确值（用于对比）
 */
function targetWaveValue(type, x) {
  // 归一化到 [-π, π]
  const t = ((x % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  switch (type) {
    case 'square':
      return t >= 0 ? 1 : -1;
    case 'sawtooth':
      return t / Math.PI;
    case 'triangle':
      return 2 * Math.abs(t) / Math.PI - 1;
    default:
      return 0;
  }
}

/**
 * 计算均方误差
 */
function computeRMSE(coeffs, type, samples) {
  let sumSq = 0;
  const step = 2 * Math.PI / samples;
  for (let i = 0; i < samples; i++) {
    const x = -Math.PI + i * step;
    const approx = fourierSum(coeffs, x);
    const target = targetWaveValue(type, x);
    sumSq += (approx - target) ** 2;
  }
  return Math.sqrt(sumSq / samples);
}

/**
 * 离散余弦变换 (DCT-II) — 用于图片压缩演示
 * 对 8×8 块执行
 */
function dct2d(block) {
  const N = 8;
  const result = Array.from({ length: N }, () => new Float64Array(N));

  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      const cu = u === 0 ? 1 / Math.SQRT2 : 1;
      const cv = v === 0 ? 1 / Math.SQRT2 : 1;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += block[x][y] *
            Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
            Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
      }
      result[u][v] = 0.25 * cu * cv * sum;
    }
  }
  return result;
}

/**
 * 逆离散余弦变换 (IDCT-II)
 */
function idct2d(dctBlock) {
  const N = 8;
  const result = Array.from({ length: N }, () => new Float64Array(N));

  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
          const cu = u === 0 ? 1 / Math.SQRT2 : 1;
          const cv = v === 0 ? 1 / Math.SQRT2 : 1;
          sum += cu * cv * dctBlock[u][v] *
            Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
            Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
      }
      result[x][y] = 0.25 * sum;
    }
  }
  return result;
}

/**
 * JPEG 标准量化矩阵（亮度通道）
 * 来源：ITU-T T.81 (1992), Table K.1
 */
const JPEG_QUANT_MATRIX = [
  [16, 11, 10, 16, 24, 40, 51, 61],
  [12, 12, 14, 19, 26, 58, 60, 55],
  [14, 13, 16, 24, 40, 57, 69, 56],
  [14, 17, 22, 29, 51, 87, 80, 62],
  [18, 22, 37, 56, 68, 109, 103, 77],
  [24, 35, 55, 64, 81, 104, 113, 92],
  [49, 64, 78, 87, 103, 121, 120, 101],
  [72, 92, 95, 98, 112, 100, 103, 99]
];

/**
 * 根据质量因子计算实际量化矩阵
 * quality: 1-100
 */
function getQuantMatrix(quality) {
  let scale;
  if (quality < 50) {
    scale = 5000 / quality;
  } else {
    scale = 200 - quality * 2;
  }
  const matrix = Array.from({ length: 8 }, () => new Float64Array(8));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      matrix[i][j] = Math.max(1, Math.floor((JPEG_QUANT_MATRIX[i][j] * scale + 50) / 100));
    }
  }
  return matrix;
}

/**
 * 对 DCT 系数进行量化
 */
function quantize(dctBlock, quantMatrix) {
  const N = 8;
  const result = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      result[i][j] = Math.round(dctBlock[i][j] / quantMatrix[i][j]);
    }
  }
  return result;
}

/**
 * 反量化
 */
function dequantize(quantBlock, quantMatrix) {
  const N = 8;
  const result = Array.from({ length: N }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      result[i][j] = quantBlock[i][j] * quantMatrix[i][j];
    }
  }
  return result;
}

/**
 * 统计量化后非零系数数量
 */
function countNonZero(quantBlock) {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (quantBlock[i][j] !== 0) count++;
    }
  }
  return count;
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    squareWaveCoeffs, sawtoothWaveCoeffs, triangleWaveCoeffs,
    fourierSum, targetWaveValue, computeRMSE,
    dct2d, idct2d, getQuantMatrix, quantize, dequantize, countNonZero,
    JPEG_QUANT_MATRIX
  };
}
