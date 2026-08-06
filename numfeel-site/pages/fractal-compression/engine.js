(function () {
  'use strict';

  var FractalCompression = {};

  var DEFAULT_RANGE_SIZE = 8;
  var DEFAULT_STRIDE = 4;
  var DEFAULT_ITERATIONS = 16;
  var TRANSFORM_COUNT = 8;

  // 每个分形码除域块索引外还要存：变换 3 bit（8 种等距变换）、
  // scale 5 bit（32 级量化）、offset 7 bit（0-255 量化到 128 级）
  var BITS_TRANSFORM = 3;
  var BITS_SCALE = 5;
  var BITS_OFFSET = 7;

  FractalCompression.DEFAULT_ITERATIONS = DEFAULT_ITERATIONS;
  FractalCompression.BITS_TRANSFORM = BITS_TRANSFORM;
  FractalCompression.BITS_SCALE = BITS_SCALE;
  FractalCompression.BITS_OFFSET = BITS_OFFSET;

  /**
   * 按位估算分形码体积：域块索引用 ceil(log2(池大小)) bit，
   * 加上变换/scale/offset 的量化位数。比"每块固定 12 字节"更接近真实编码开销。
   * @param {number} numBlocks - 范围块数量
   * @param {number} domainPoolSize - 域块池大小
   * @returns {object} { bitsPerBlock, totalBits, totalBytes, indexBits }
   */
  FractalCompression.estimateCompressedBytes = function (numBlocks, domainPoolSize) {
    var indexBits = domainPoolSize > 1 ? Math.ceil(Math.log2(domainPoolSize)) : 0;
    var bitsPerBlock = indexBits + BITS_TRANSFORM + BITS_SCALE + BITS_OFFSET;
    var totalBits = bitsPerBlock * numBlocks;
    return {
      indexBits: indexBits,
      bitsPerBlock: bitsPerBlock,
      totalBits: totalBits,
      totalBytes: Math.ceil(totalBits / 8)
    };
  };

  /**
   * 范围块网格尺寸：用 ceil 保证图像边缘也被覆盖，
   * 否则宽高不能被 rangeSize 整除时右侧/底部会留下永不被写入的黑边。
   */
  FractalCompression.gridSize = function (w, h, rangeSize) {
    return {
      cols: Math.ceil(w / rangeSize),
      rows: Math.ceil(h / rangeSize)
    };
  };

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
    // 收缩映射：|scale| < 1 才能保证 Banach 不动点收敛。
    // 严格小于 1 留出安全余量，避免量化/边界效应让有效 |s| 略微超 1 引起迭代发散。
    var MAX_SCALE = 0.95;
    if (scale > MAX_SCALE) scale = MAX_SCALE;
    else if (scale < -MAX_SCALE) scale = -MAX_SCALE;
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
   * 域块池为空时的退化方案：用块均值做常量近似。
   * mse 取块方差（常量近似的真实误差），不能留 Infinity 否则整体统计被污染。
   */
  function constantFallback(rangeBlock) {
    var n = rangeBlock.length;
    var sum = 0, sumSq = 0;
    for (var i = 0; i < n; i++) {
      sum += rangeBlock[i];
      sumSq += rangeBlock[i] * rangeBlock[i];
    }
    var mean = sum / n;
    var variance = Math.max(0, sumSq / n - mean * mean);
    return { offset: mean, mse: variance };
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
    // 域块必须是范围块的 2 倍：解码端也按 2 倍取块再下采样，两边必须对称
    var domainSize = options.domainSize || rangeSize * 2;
    var stride = options.stride || DEFAULT_STRIDE;

    var grid = FractalCompression.gridSize(w, h, rangeSize);
    var cols = grid.cols;
    var rows = grid.rows;
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
          var fallback = constantFallback(rangeBlock);
          code.push({
            rx: rx, ry: ry,
            dx: 0, dy: 0,
            transform: 0,
            scale: 0,
            offset: fallback.offset,
            mse: fallback.mse
          });
          totalMSE += fallback.mse;
        } else {
          code.push({
            rx: rx, ry: ry,
            dx: domainPool[best.domainIdx].x,
            dy: domainPool[best.domainIdx].y,
            transform: best.transform,
            scale: best.scale,
            offset: best.offset,
            mse: best.mse
          });
          totalMSE += best.mse;
        }

        blockIdx++;

        if (onProgress) {
          onProgress(blockIdx / totalBlocks);
        }
      }
    }

    var avgMSE = totalBlocks > 0 ? totalMSE / totalBlocks : 0;
    var psnr = avgMSE > 0 ? 10 * Math.log10(255 * 255 / avgMSE) : Infinity;

    var originalBytes = w * h;
    var budget = FractalCompression.estimateCompressedBytes(code.length, domainPool.length);
    var compressedBytes = budget.totalBytes;

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
        bitsPerBlock: budget.bitsPerBlock,
        indexBits: budget.indexBits,
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
  FractalCompression.decode = function (code, w, h, rangeSize, iterations, onIteration, initial) {
    // PIFS 的不动点与初始图像无关，所以从纯随机噪音开始——这正是分形解码
    // 最反直觉也最值得演示的性质：一堆雪花点会迭代成原图。
    var current = initial instanceof Float32Array
      ? new Float32Array(initial)
      : FractalCompression.createNoiseImage(w, h);

    for (var iter = 0; iter < iterations; iter++) {
      current = FractalCompression.decodeOneIteration(current, code, w, h, rangeSize);

      if (onIteration) {
        onIteration(iter + 1, iterations, new Float32Array(current));
      }
    }

    return current;
  };

  /**
   * 生成随机噪音初始图像
   * @param {number} w
   * @param {number} h
   * @param {function} [rng] - 可选随机源，便于测试复现
   */
  FractalCompression.createNoiseImage = function (w, h, rng) {
    var rand = typeof rng === 'function' ? rng : Math.random;
    var out = new Float32Array(w * h);
    for (var i = 0; i < out.length; i++) {
      out[i] = rand() * 255;
    }
    return out;
  };

  /**
   * 确定性伪随机源（mulberry32），测试里替代 Math.random 以便复现
   */
  FractalCompression.createSeededRandom = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
   * 块变换（公开接口）：8 种等距变换是最容易写错又最难从画面上看出来的部分，
   * 暴露出来单独测试。
   */
  FractalCompression.applyTransform = function (block, size, transform) {
    return applyTransform(block, size, transform);
  };

  FractalCompression.TRANSFORM_COUNT = TRANSFORM_COUNT;

  /**
   * 构建域块池（公开接口）
   */
  FractalCompression.buildDomainPool = function (gray, w, h, rangeSize, domainSize, stride) {
    return buildDomainPool(
      gray, w, h, rangeSize,
      domainSize || rangeSize * 2,
      stride || DEFAULT_STRIDE
    );
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
      var fallback = constantFallback(rangeBlock);
      return {
        rx: rx, ry: ry,
        dx: 0, dy: 0,
        transform: 0,
        scale: 0,
        offset: fallback.offset,
        mse: fallback.mse
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
   * 单次解码迭代：按 PIFS 收缩映射算子 F(current) -> next
   * 关键：解码时也必须先提取 2*rangeSize 域块并下采样，与编码端一致
   */
  FractalCompression.decodeOneIteration = function (current, code, w, h, rangeSize) {
    var next = new Float32Array(w * h);
    var domainSize = rangeSize * 2;

    // 直接遍历分形码而不是遍历网格：码里已经带了 rx/ry，
    // 避免网格推算方式与编码端不一致时漏写块（漏写块会留下黑格）
    for (var c = 0; c < code.length; c++) {
      var entry = code[c];
      var domainBlock = downsampleBlock(current, w, h, entry.dx, entry.dy, domainSize, rangeSize);
      var transformed = applyTransform(domainBlock, rangeSize, entry.transform);

      var px = entry.rx * rangeSize;
      var py = entry.ry * rangeSize;
      // 边缘块可能超出画布（网格按 ceil 取），写入时裁掉越界部分
      var maxBy = Math.min(rangeSize, h - py);
      var maxBx = Math.min(rangeSize, w - px);
      for (var by = 0; by < maxBy; by++) {
        for (var bx = 0; bx < maxBx; bx++) {
          var val = transformed[by * rangeSize + bx] * entry.scale + entry.offset;
          next[(py + by) * w + (px + bx)] = Math.max(0, Math.min(255, val));
        }
      }
    }

    return next;
  };

  /**
   * 统计分形码对画布的覆盖率，用于验证不会留下未写入的黑边
   * @returns {number} 0-1
   */
  FractalCompression.coverage = function (code, w, h, rangeSize) {
    var mask = new Uint8Array(w * h);
    for (var c = 0; c < code.length; c++) {
      var px = code[c].rx * rangeSize;
      var py = code[c].ry * rangeSize;
      var maxBy = Math.min(rangeSize, h - py);
      var maxBx = Math.min(rangeSize, w - px);
      for (var by = 0; by < maxBy; by++) {
        for (var bx = 0; bx < maxBx; bx++) {
          mask[(py + by) * w + (px + bx)] = 1;
        }
      }
    }
    var covered = 0;
    for (var i = 0; i < mask.length; i++) covered += mask[i];
    return covered / mask.length;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FractalCompression;
  }

  if (typeof window !== 'undefined') {
    window.FractalCompression = FractalCompression;
  }
})();