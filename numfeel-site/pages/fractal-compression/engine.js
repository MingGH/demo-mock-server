(function () {
  'use strict';

  var FractalCompression = {};

  var DEFAULT_RANGE_SIZE = 8;
  var DEFAULT_DOMAIN_SIZE = 16;
  var DEFAULT_STRIDE = 4;
  var DEFAULT_ITERATIONS = 12;
  var TRANSFORM_COUNT = 8;

  /**
   * 将 RGBA ImageData 转为灰度 Float32Array
   */
  FractalCompression.toGrayscale = function (imageData) {
    var data = imageData.data;
    var len = imageData.width * imageData.height;
    var gray = new Float32Array(len);
    for (var i = 0; i < len; i++) {
      var r = data[i * 4];
      var g = data[i * 4 + 1];
      var b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return gray;
  };

  /**
   * 将 Float32Array 灰度数据转回 RGBA ImageData
   */
  FractalCompression.grayscaleToImageData = function (gray, w, h) {
    var data = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < gray.length; i++) {
      var v = Math.max(0, Math.min(255, Math.round(gray[i])));
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    return new ImageData(data, w, h);
  };

  /**
   * 对正方形块应用旋转变换
   * @param {Float32Array} block - 长度为 size*size 的数组
   * @param {number} size - 块边长
   * @param {number} transform - 0-7
   * @returns {Float32Array}
   */
  function applyTransform(block, size, transform) {
    var out = new Float32Array(size * size);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var srcIdx;
        switch (transform) {
          case 0: srcIdx = y * size + x; break;            // identity
          case 1: srcIdx = (size - 1 - x) * size + y; break; // rotate 90 CW
          case 2: srcIdx = (size - 1 - y) * size + (size - 1 - x); break; // rotate 180
          case 3: srcIdx = x * size + (size - 1 - y); break; // rotate 270 CW
          case 4: srcIdx = y * size + (size - 1 - x); break; // flip horizontal
          case 5: srcIdx = (size - 1 - y) * size + x; break; // flip vertical
          case 6: srcIdx = x * size + y; break;            // transpose
          case 7: srcIdx = (size - 1 - x) * size + (size - 1 - y); break; // anti-transpose
          default: srcIdx = y * size + x;
        }
        out[y * size + x] = block[srcIdx];
      }
    }
    return out;
  }

  /**
   * 从灰度图像中提取一个矩形块
   */
  function extractBlock(gray, w, h, x, y, blockSize) {
    var block = new Float32Array(blockSize * blockSize);
    for (var by = 0; by < blockSize; by++) {
      for (var bx = 0; bx < blockSize; bx++) {
        var px = Math.min(x + bx, w - 1);
        var py = Math.min(y + by, h - 1);
        block[by * blockSize + bx] = gray[py * w + px];
      }
    }
    return block;
  }

  /**
   * 双线性插值下采样块
   */
  function downsampleBlock(gray, w, h, x, y, largeSize, smallSize) {
    var scale = largeSize / smallSize;
    var block = new Float32Array(smallSize * smallSize);
    for (var sy = 0; sy < smallSize; sy++) {
      for (var sx = 0; sx < smallSize; sx++) {
        var px = x + sx * scale;
        var py = y + sy * scale;
        var ix = Math.floor(px);
        var iy = Math.floor(py);
        var fx = px - ix;
        var fy = py - iy;
        ix = Math.min(ix, w - 2);
        iy = Math.min(iy, h - 2);
        var v00 = gray[iy * w + ix];
        var v10 = gray[iy * w + ix + 1];
        var v01 = gray[(iy + 1) * w + ix];
        var v11 = gray[(iy + 1) * w + ix + 1];
        var v = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
        block[sy * smallSize + sx] = v;
      }
    }
    return block;
  }

  /**
   * 构建域块池
   */
  function buildDomainPool(gray, w, h, rangeSize, domainSize, stride) {
    var pool = [];
    var maxX = w - domainSize;
    var maxY = h - domainSize;
    for (var dy = 0; dy <= maxY; dy += stride) {
      for (var dx = 0; dx <= maxX; dx += stride) {
        var block = downsampleBlock(gray, w, h, dx, dy, domainSize, rangeSize);
        pool.push({ x: dx, y: dy, data: block });
      }
    }
    return pool;
  }

  /**
   * 计算最优亮度和偏移
   */
  function fitBlock(rangeBlock, domainBlock, size) {
    var N = size * size;
    var sumR = 0, sumD = 0, sumRD = 0, sumDD = 0;
    for (var i = 0; i < N; i++) {
      sumR += rangeBlock[i];
      sumD += domainBlock[i];
      sumRD += rangeBlock[i] * domainBlock[i];
      sumDD += domainBlock[i] * domainBlock[i];
    }
    var meanR = sumR / N;
    var meanD = sumD / N;
    var varD = sumDD / N - meanD * meanD;
    var covRD = sumRD / N - meanR * meanD;

    var scale = 0;
    if (varD > 0.0001) {
      scale = covRD / varD;
    }
    scale = Math.max(0, Math.min(1, scale));
    var offset = meanR - scale * meanD;

    var mse = 0;
    for (var j = 0; j < N; j++) {
      var diff = rangeBlock[j] - (scale * domainBlock[j] + offset);
      mse += diff * diff;
    }
    mse /= N;

    return { scale: scale, offset: offset, mse: mse };
  }

  /**
   * 为单个范围块找最佳匹配域块
   */
  function matchBlock(rangeBlock, domainPool, rangeSize) {
    var best = { domainIdx: -1, transform: 0, scale: 0, offset: 0, mse: Infinity };
    if (!domainPool || domainPool.length === 0) {
      return best;
    }
    for (var i = 0; i < domainPool.length; i++) {
      for (var t = 0; t < TRANSFORM_COUNT; t++) {
        var transformed = applyTransform(domainPool[i].data, rangeSize, t);
        var result = fitBlock(rangeBlock, transformed, rangeSize);
        if (result.mse < best.mse) {
          best.domainIdx = i;
          best.transform = t;
          best.scale = result.scale;
          best.offset = result.offset;
          best.mse = result.mse;
        }
      }
    }
    return best;
  }

  /**
   * 编码：将灰度图像压缩为分形码
   * @param {Float32Array} gray - 灰度数据
   * @param {number} w - 宽度
   * @param {number} h - 高度
   * @param {object} options
   * @param {function} onProgress - 回调 (progress: 0-1)
   * @returns {object} { code: Array, stats: object }
   */
  FractalCompression.encode = function (gray, w, h, options, onProgress) {
    options = options || {};
    var rangeSize = options.rangeSize || DEFAULT_RANGE_SIZE;
    var domainSize = options.domainSize || DEFAULT_DOMAIN_SIZE;
    var stride = options.stride || DEFAULT_STRIDE;

    var cols = Math.floor(w / rangeSize);
    var rows = Math.floor(h / rangeSize);
    var totalBlocks = cols * rows;

    var domainPool = buildDomainPool(gray, w, h, rangeSize, domainSize, stride);

    var code = [];
    var totalMSE = 0;
    var blockIdx = 0;

    for (var ry = 0; ry < rows; ry++) {
      for (var rx = 0; rx < cols; rx++) {
        var px = rx * rangeSize;
        var py = ry * rangeSize;
        var rangeBlock = extractBlock(gray, w, h, px, py, rangeSize);

        var best = matchBlock(rangeBlock, domainPool, rangeSize);

        if (best.domainIdx < 0) {
          var mean = 0;
          for (var m = 0; m < rangeBlock.length; m++) mean += rangeBlock[m];
          mean /= rangeBlock.length;
          code.push({
            rx: rx, ry: ry,
            dx: px, dy: py,
            transform: 0,
            scale: 0,
            offset: mean
          });
        } else {
          code.push({
            rx: rx, ry: ry,
            dx: domainPool[best.domainIdx].x,
            dy: domainPool[best.domainIdx].y,
            transform: best.transform,
            scale: best.scale,
            offset: best.offset
          });
        }

        totalMSE += best.mse;
        blockIdx++;

        if (onProgress) {
          onProgress(blockIdx / totalBlocks);
        }
      }
    }

    var avgMSE = totalBlocks > 0 ? totalMSE / totalBlocks : 0;
    var psnr = avgMSE > 0 ? 10 * Math.log10(255 * 255 / avgMSE) : Infinity;

    var originalBytes = w * h;
    var compressedBytes = code.length * 12;

    return {
      code: code,
      stats: {
        numBlocks: code.length,
        rangeSize: rangeSize,
        domainPoolSize: domainPool.length,
        avgMSE: avgMSE,
        psnr: psnr,
        originalSize: originalBytes,
        compressedSize: compressedBytes,
        compressionRatio: compressedBytes > 0 ? (originalBytes / compressedBytes).toFixed(1) : '0',
        imageWidth: w,
        imageHeight: h
      }
    };
  };

  /**
   * 解码：从分形码重建图像
   * @param {Array} code - 分形码
   * @param {number} w - 输出宽度
   * @param {number} h - 输出高度
   * @param {number} rangeSize - 范围块大小
   * @param {number} iterations - 迭代次数
   * @param {function} onIteration - 每次迭代后回调
   * @returns {Float32Array} 解码后的灰度数据
   */
  FractalCompression.decode = function (code, w, h, rangeSize, iterations, onIteration) {
    var current = new Float32Array(w * h);
    for (var i = 0; i < current.length; i++) {
      current[i] = Math.random() * 255;
    }

    var cols = Math.floor(w / rangeSize);
    var rows = Math.floor(h / rangeSize);

    var codeMap = {};
    for (var c = 0; c < code.length; c++) {
      var key = code[c].ry + '_' + code[c].rx;
      codeMap[key] = code[c];
    }

    for (var iter = 0; iter < iterations; iter++) {
      var next = new Float32Array(w * h);

      for (var ry = 0; ry < rows; ry++) {
        for (var rx = 0; rx < cols; rx++) {
          var key2 = ry + '_' + rx;
          var entry = codeMap[key2];
          if (!entry) continue;

          var domainBlock = extractBlock(current, w, h, entry.dx, entry.dy, rangeSize);
          var transformed = applyTransform(domainBlock, rangeSize, entry.transform);

          var px = rx * rangeSize;
          var py = ry * rangeSize;
          for (var by = 0; by < rangeSize; by++) {
            for (var bx = 0; bx < rangeSize; bx++) {
              var val = transformed[by * rangeSize + bx] * entry.scale + entry.offset;
              next[(py + by) * w + (px + bx)] = Math.max(0, Math.min(255, val));
            }
          }
        }
      }

      current = next;

      if (onIteration) {
        onIteration(iter + 1, iterations, new Float32Array(current));
      }
    }

    return current;
  };

  /**
   * 生成默认示例图（几何图案）
   */
  FractalCompression.generateSampleImage = function (w, h) {
    var data = new Uint8ClampedArray(w * h * 4);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var nx = x / w;
        var ny = y / h;
        var v = 0;

        var cx = 0.5, cy = 0.5;
        var dist = Math.sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy)) * 2;
        v = Math.sin(dist * 12) * 0.5 + 0.5;

        var inner = Math.sqrt((nx - 0.3) * (nx - 0.3) + (ny - 0.3) * (ny - 0.3)) * 4;
        v = v * 0.6 + (Math.sin(inner * 8) * 0.5 + 0.5) * 0.4;

        var stripe = Math.sin(x * 0.3) * 0.5 + 0.5;
        v = v * 0.7 + stripe * 0.3;

        var val = Math.round(v * 255);
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    return new ImageData(data, w, h);
  };

  /**
   * 生成人像示例图
   */
  FractalCompression.generatePortraitImage = function (w, h) {
    var data = new Uint8ClampedArray(w * h * 4);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var nx = x / w;
        var ny = y / h;

        var face = 0;
        var dx = nx - 0.5;
        var dy = ny - 0.5;
        var dist = Math.sqrt(dx * dx + dy * dy * 1.3);
        if (dist < 0.4) {
          face = 1 - dist / 0.4;
        }

        var eyeL = Math.sqrt((nx - 0.38) * (nx - 0.38) + (ny - 0.38) * (ny - 0.38));
        var eyeR = Math.sqrt((nx - 0.62) * (nx - 0.62) + (ny - 0.38) * (ny - 0.38));
        if (eyeL < 0.06 || eyeR < 0.06) {
          face = 0.05;
        }

        var mouth = Math.abs(nx - 0.5) < 0.15 && Math.abs(ny - 0.6) < 0.03;
        if (mouth) face = 0.1;

        var hair = ny < 0.25 && (nx < 0.2 || nx > 0.8);
        if (hair) face = 0.0;

        var bg = Math.sin(nx * 15) * 0.5 + 0.5;
        var bg2 = Math.cos(ny * 12) * 0.5 + 0.5;
        var bgVal = (bg * 0.3 + bg2 * 0.3 + 0.4) * 200;

        var val = face * 220 + (1 - face) * bgVal;
        val = Math.max(0, Math.min(255, Math.round(val)));

        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    return new ImageData(data, w, h);
  };

  /**
   * 构建域块池（公开接口）
   */
  FractalCompression.buildDomainPool = function (gray, w, h, rangeSize, domainSize, stride) {
    return buildDomainPool(gray, w, h, rangeSize, domainSize, stride);
  };

  /**
   * 编码单个范围块（公开接口，用于分块编码）
   */
  FractalCompression.encodeBlock = function (gray, w, h, rx, ry, rangeSize, domainPool) {
    var px = rx * rangeSize;
    var py = ry * rangeSize;
    var rangeBlock = extractBlock(gray, w, h, px, py, rangeSize);
    var best = matchBlock(rangeBlock, domainPool, rangeSize);
    if (best.domainIdx < 0) {
      var mean = 0;
      for (var i = 0; i < rangeBlock.length; i++) mean += rangeBlock[i];
      mean /= rangeBlock.length;
      return {
        rx: rx, ry: ry,
        dx: px, dy: py,
        transform: 0,
        scale: 0,
        offset: mean,
        mse: 0
      };
    }
    return {
      rx: rx, ry: ry,
      dx: domainPool[best.domainIdx].x,
      dy: domainPool[best.domainIdx].y,
      transform: best.transform,
      scale: best.scale,
      offset: best.offset,
      mse: best.mse
    };
  };

  /**
   * 解码一次迭代
   * @param {Float32Array} current - 当前图像数据
   * @param {Array} code - 分形码
   * @param {number} w - 输出宽度
   * @param {number} h - 输出高度
   * @param {number} rangeSize - 范围块大小
   * @returns {Float32Array} 下一次迭代的图像数据
   */
  FractalCompression.decodeOneIteration = function (current, code, w, h, rangeSize) {
    var next = new Float32Array(w * h);
    var cols = Math.floor(w / rangeSize);
    var rows = Math.floor(h / rangeSize);

    var codeMap = {};
    for (var c = 0; c < code.length; c++) {
      var key = code[c].ry + '_' + code[c].rx;
      codeMap[key] = code[c];
    }

    for (var ry = 0; ry < rows; ry++) {
      for (var rx = 0; rx < cols; rx++) {
        var key2 = ry + '_' + rx;
        var entry = codeMap[key2];
        if (!entry) continue;

        var domainBlock = extractBlock(current, w, h, entry.dx, entry.dy, rangeSize);
        var transformed = applyTransform(domainBlock, rangeSize, entry.transform);

        var px = rx * rangeSize;
        var py = ry * rangeSize;
        for (var by = 0; by < rangeSize; by++) {
          for (var bx = 0; bx < rangeSize; bx++) {
            var val = transformed[by * rangeSize + bx] * entry.scale + entry.offset;
            next[(py + by) * w + (px + bx)] = Math.max(0, Math.min(255, val));
          }
        }
      }
    }

    return next;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FractalCompression;
  }

  window.FractalCompression = FractalCompression;
})();