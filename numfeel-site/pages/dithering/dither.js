// ========== 抖动算法核心引擎 ==========

/**
 * 将彩色图像数据转为灰度数组
 * @param {ImageData} imageData
 * @returns {Float32Array} 灰度值数组 (0-255)
 */
function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // ITU-R BT.601 加权
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/**
 * Floyd-Steinberg 抖动
 *         * 7/16
 *   3/16 5/16 1/16
 */
function floydSteinberg(gray, width, height, threshold) {
  const pixels = new Float32Array(gray);
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldVal = pixels[idx];
      const newVal = oldVal > threshold ? 255 : 0;
      output[idx] = newVal;
      const err = oldVal - newVal;

      if (x + 1 < width) pixels[idx + 1] += err * 7 / 16;
      if (y + 1 < height) {
        if (x - 1 >= 0) pixels[(y + 1) * width + (x - 1)] += err * 3 / 16;
        pixels[(y + 1) * width + x] += err * 5 / 16;
        if (x + 1 < width) pixels[(y + 1) * width + (x + 1)] += err * 1 / 16;
      }
    }
  }
  return output;
}

/**
 * Atkinson 抖动 (Macintosh 经典风格)
 * 只扩散 6/8 的误差，产生更高对比度、更"干净"的效果
 *       * 1/8 1/8
 * 1/8 1/8 1/8
 *     1/8
 */
function atkinson(gray, width, height, threshold) {
  const pixels = new Float32Array(gray);
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldVal = pixels[idx];
      const newVal = oldVal > threshold ? 255 : 0;
      output[idx] = newVal;
      const err = (oldVal - newVal) / 8;

      if (x + 1 < width) pixels[idx + 1] += err;
      if (x + 2 < width) pixels[idx + 2] += err;
      if (y + 1 < height) {
        if (x - 1 >= 0) pixels[(y + 1) * width + (x - 1)] += err;
        pixels[(y + 1) * width + x] += err;
        if (x + 1 < width) pixels[(y + 1) * width + (x + 1)] += err;
      }
      if (y + 2 < height) {
        pixels[(y + 2) * width + x] += err;
      }
    }
  }
  return output;
}

/**
 * Sierra Lite 抖动
 *     * 2/4
 * 1/4 1/4
 */
function sierraLite(gray, width, height, threshold) {
  const pixels = new Float32Array(gray);
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldVal = pixels[idx];
      const newVal = oldVal > threshold ? 255 : 0;
      output[idx] = newVal;
      const err = oldVal - newVal;

      if (x + 1 < width) pixels[idx + 1] += err * 2 / 4;
      if (y + 1 < height) {
        if (x - 1 >= 0) pixels[(y + 1) * width + (x - 1)] += err * 1 / 4;
        pixels[(y + 1) * width + x] += err * 1 / 4;
      }
    }
  }
  return output;
}

/**
 * Bayer 8×8 有序抖动 (Ordered Dithering)
 */
function orderedDither(gray, width, height, threshold) {
  const output = new Uint8Array(width * height);

  // Bayer 8×8 矩阵 (归一化到 0-63)
  const bayer8 = [
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const bayerVal = bayer8[(y % 8) * 8 + (x % 8)];
      const adjustedThreshold = (bayerVal / 64) * 255;
      output[idx] = gray[idx] > adjustedThreshold ? 255 : 0;
    }
  }
  return output;
}

/**
 * 随机抖动 (Random Dithering)
 */
function randomDither(gray, width, height, threshold) {
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const randomThreshold = Math.random() * 255;
      output[idx] = gray[idx] > randomThreshold ? 255 : 0;
    }
  }
  return output;
}

/**
 * 纯阈值（无抖动）
 */
function thresholdDither(gray, width, height, threshold) {
  const output = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    output[i] = gray[i] > threshold ? 255 : 0;
  }
  return output;
}

/**
 * 调度函数
 */
function applyDither(gray, width, height, algorithm, threshold) {
  switch (algorithm) {
    case 'floyd-steinberg': return floydSteinberg(gray, width, height, threshold);
    case 'atkinson': return atkinson(gray, width, height, threshold);
    case 'sierra': return sierraLite(gray, width, height, threshold);
    case 'ordered': return orderedDither(gray, width, height, threshold);
    case 'random': return randomDither(gray, width, height, threshold);
    case 'threshold': return thresholdDither(gray, width, height, threshold);
    default: return floydSteinberg(gray, width, height, threshold);
  }
}

/**
 * 将二值数组渲染到 canvas
 */
function renderToCanvas(output, width, height, canvas) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < output.length; i++) {
    const v = output[i];
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * 将灰度数组渲染到 canvas
 */
function renderGrayscaleToCanvas(gray, width, height, canvas) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < gray.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(gray[i])));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toGrayscale, floydSteinberg, atkinson, sierraLite,
    orderedDither, randomDither, thresholdDither, applyDither
  };
}
