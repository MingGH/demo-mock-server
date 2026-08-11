// ========== 视觉密码学核心引擎 ==========
// Naor & Shamir (1994) (2,2) 视觉秘密分享方案
// 核心思想：将一张二值图拆成两张噪声图，叠加后还原原图

/**
 * 将彩色图像数据转为灰度数组
 * @param {Object} imageData - { data: Uint8ClampedArray, width: number, height: number }
 * @returns {Float32Array} 灰度值数组 (0-255)
 */
function toGrayscale(imageData) {
  var data = imageData.data;
  var width = imageData.width;
  var height = imageData.height;
  var gray = new Float32Array(width * height);
  for (var i = 0; i < width * height; i++) {
    var r = data[i * 4];
    var g = data[i * 4 + 1];
    var b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/**
 * Floyd-Steinberg 抖动，将灰度图转为二值图
 * @param {Float32Array} gray - 灰度值数组
 * @param {number} width
 * @param {number} height
 * @param {number} threshold - 阈值 (0-255)
 * @returns {Uint8Array} 二值数组 (0=黑, 255=白)
 */
function floydSteinberg(gray, width, height, threshold) {
  var pixels = new Float32Array(gray);
  var output = new Uint8Array(width * height);

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var idx = y * width + x;
      var oldVal = pixels[idx];
      var newVal = oldVal > threshold ? 255 : 0;
      output[idx] = newVal;
      var err = oldVal - newVal;

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
 * 将图像数据一步转为二值图（灰度 + Floyd-Steinberg 抖动）
 * @param {Object} imageData - Canvas ImageData
 * @param {number} threshold - 二值化阈值
 * @returns {Object} { data: Uint8Array, width: number, height: number }
 */
function binarize(imageData, threshold) {
  var gray = toGrayscale(imageData);
  var binary = floydSteinberg(gray, imageData.width, imageData.height, threshold);
  return { data: binary, width: imageData.width, height: imageData.height };
}

/**
 * (2,2) 视觉密码学拆分：将二值图拆成两张 share
 * 每个像素扩展为 2×2 子像素块，输出宽高均翻倍，保持原图长宽比
 *
 * 原理：
 * - 白像素（255）：两张 share 用相同模式 -> 叠加后 50% 灰
 * - 黑像素（0）：两张 share 用互补模式 -> 叠加后 100% 黑
 *
 * @param {Uint8Array} binaryData - 二值图数据 (0=黑, 255=白)
 * @param {number} width
 * @param {number} height
 * @returns {Object} { share1: Uint8Array, share2: Uint8Array, width: number, height: number }
 */
function splitShares(binaryData, width, height) {
  var expW = width * 2;
  var expH = height * 2;
  var share1 = new Uint8Array(expW * expH);
  var share2 = new Uint8Array(expW * expH);

  // 两个 2×2 模式（0=黑, 255=白），按行优先排列：
  // patternA = [0 255; 255 0]（对角黑）
  // patternB = [255 0; 0 255]（对角白，与 A 互补）
  var patternA = [0, 255, 255, 0];
  var patternB = [255, 0, 0, 255];

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var isBlack = binaryData[y * width + x] === 0;
      var rand = Math.random() < 0.5;
      var p1 = rand ? patternA : patternB;
      var p2 = rand ? patternB : patternA;
      if (!isBlack) p2 = p1; // 白像素：两张 share 相同模式

      var baseIdx = (y * 2) * expW + (x * 2);
      for (var k = 0; k < 4; k++) {
        var subIdx = baseIdx + (k % 2) + ((k / 2) | 0) * expW;
        share1[subIdx] = p1[k];
        share2[subIdx] = p2[k];
      }
    }
  }

  return { share1: share1, share2: share2, width: expW, height: expH };
}

/**
 * 叠加两张 share（OR 运算），还原二值图
 * @param {Uint8Array} share1
 * @param {Uint8Array} share2
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} 叠加结果 (0=黑, 255=白)
 */
function overlayShares(share1, share2, width, height) {
  var result = new Uint8Array(width * height);
  for (var i = 0; i < width * height; i++) {
    result[i] = (share1[i] === 0 || share2[i] === 0) ? 0 : 255;
  }
  return result;
}

/**
 * 计算部分叠加（用于拖拽时的实时预览）
 * share2 偏移 (offsetX, offsetY) 叠在 share1 上方
 * 非重叠区域只显示 share1，重叠区域显示 OR 结果
 * @param {Uint8Array} share1 - 底层 share
 * @param {Uint8Array} share2 - 上层 share
 * @param {number} width - share 宽度
 * @param {number} height - share 高度
 * @param {number} offsetX - share2 相对于 share1 的 x 偏移（像素）
 * @param {number} offsetY - share2 相对于 share1 的 y 偏移（像素）
 * @returns {Uint8Array} 叠加结果，尺寸与 share1 相同
 */
function overlayPartial(share1, share2, width, height, offsetX, offsetY) {
  var result = new Uint8Array(width * height);
  for (var i = 0; i < width * height; i++) {
    result[i] = share1[i];
  }
  for (var y = 0; y < height; y++) {
    var s2y = y - offsetY;
    if (s2y < 0 || s2y >= height) continue;
    for (var x = 0; x < width; x++) {
      var s2x = x - offsetX;
      if (s2x < 0 || s2x >= width) continue;
      var s1Idx = y * width + x;
      var s2Idx = s2y * width + s2x;
      result[s1Idx] = (share1[s1Idx] === 0 || share2[s2Idx] === 0) ? 0 : 255;
    }
  }
  return result;
}

/**
 * 统计二值图中黑色像素占比
 * @param {Uint8Array} data - 二值数据
 * @returns {number} 黑色像素占比 (0-1)
 */
function blackRatio(data) {
  var black = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i] === 0) black++;
  }
  return black / data.length;
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toGrayscale: toGrayscale,
    floydSteinberg: floydSteinberg,
    binarize: binarize,
    splitShares: splitShares,
    overlayShares: overlayShares,
    overlayPartial: overlayPartial,
    blackRatio: blackRatio
  };
}
