// ========== JPEG2000 演示核心引擎 ==========
// 说明：JPEG2000 真正用的是 9/7 或 5/3 小波 + EBCOT 熵编码，过于复杂。
// 这里用 Haar 小波做「教学等价物」：保留 JPEG2000 的灵魂——DWT 子带分解、
// 量化、多分辨率渐进重建——但代码简单到能在浏览器里实时跑、能被单测覆盖。
// 目标不是实现标准，而是让人「看见」DWT 为什么没有 JPEG 的方块效应。

/**
 * 将彩色 ImageData 转为灰度 Float32Array
 * @param {Object} imageData { data, width, height }
 * @returns {Float32Array} 0-255
 */
function toGrayscale(imageData) {
  var data = imageData.data;
  var w = imageData.width;
  var h = imageData.height;
  var gray = new Float32Array(w * h);
  for (var i = 0; i < w * h; i++) {
    var r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/**
 * 一维 Haar 小波变换（就地），把数组拆成低频在前、高频在后
 * @param {Float32Array} arr
 * @returns {Float32Array} 变换后的数组（长度不变）
 */
function haar1d(arr) {
  var n = arr.length;
  var out = new Float32Array(n);
  var half = Math.floor(n / 2);
  for (var i = 0; i < half; i++) {
    var a = arr[i * 2], b = arr[i * 2 + 1];
    out[i] = (a + b) / 2;        // 低频：平均
    out[i + half] = (a - b) / 2; // 高频：差异
  }
  // 若长度为奇数，最后一个原样放到末尾（不参与分解）
  if (n % 2 === 1) out[n - 1] = arr[n - 1];
  return out;
}

/**
 * 一维逆 Haar 小波变换
 * @param {Float32Array} arr
 * @returns {Float32Array}
 */
function ihaar1d(arr) {
  var n = arr.length;
  var out = new Float32Array(n);
  var half = Math.floor(n / 2);
  for (var i = 0; i < half; i++) {
    var low = arr[i], high = arr[i + half];
    out[i * 2] = low + high;
    out[i * 2 + 1] = low - high;
  }
  if (n % 2 === 1) out[n - 1] = arr[n - 1];
  return out;
}

/**
 * 二维单层 Haar 小波分解：先对行做 1D，再对列做 1D
 * 结果为一个与输入同尺寸的数组，布局：
 *   [0,0] = LL(左上)  [0,宽/2] = LH(右上)
 *   [高/2,0] = HL(左下) [高/2,宽/2] = HH(右下)
 * @param {Float32Array} gray 行优先
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array} 子带重排后的系数
 */
function dwt2d(gray, w, h) {
  var i, j, k;
  // 先按行变换
  var rows = new Float32Array(w * h);
  for (j = 0; j < h; j++) {
    var row = new Float32Array(w);
    for (i = 0; i < w; i++) row[i] = gray[j * w + i];
    var rowT = haar1d(row);
    for (i = 0; i < w; i++) rows[j * w + i] = rowT[i];
  }
  // 再按列变换（注意宽高可能是奇数，需按各子带实际尺寸处理）
  var cols = new Float32Array(w * h);
  var hh = Math.floor(h / 2);
  var wh = Math.floor(w / 2);
  for (i = 0; i < w; i++) {
    var col = new Float32Array(h);
    for (j = 0; j < h; j++) col[j] = rows[j * w + i];
    var colT = haar1d(col);
    for (j = 0; j < h; j++) cols[j * w + i] = colT[j];
  }
  // 重排为 2x2 子带布局（使子带各自连续，便于可视化与量化）
  var out = new Float32Array(w * h);
  for (j = 0; j < h; j++) {
    for (i = 0; i < w; i++) {
      var srcX, srcY;
      if (i < wh) srcX = i; else srcX = i - wh;
      if (j < hh) srcY = j; else srcY = j - hh;
      var band;
      if (j < hh && i < wh) band = 0;      // LL
      else if (j < hh && i >= wh) band = 1; // LH
      else if (j >= hh && i < wh) band = 2; // HL
      else band = 3;                        // HH
      // 目标位置：band 决定左上角偏移
      var dx = (band === 1 || band === 3) ? wh : 0;
      var dy = (band === 2 || band === 3) ? hh : 0;
      out[(dy + srcY) * w + (dx + srcX)] = cols[j * w + i];
    }
  }
  return out;
}

/**
 * 二维单层逆 Haar 小波变换
 * @param {Float32Array} coeff 与 dwt2d 同布局
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array}
 */
function idwt2d(coeff, w, h) {
  var i, j;
  var hh = Math.floor(h / 2);
  var wh = Math.floor(w / 2);
  // 先从 2x2 布局还原为「行变换后、列未变」的 cols 布局
  var cols = new Float32Array(w * h);
  for (j = 0; j < h; j++) {
    for (i = 0; i < w; i++) {
      var srcX = (i < wh) ? i : i - wh;
      var srcY = (j < hh) ? j : j - hh;
      var band;
      if (j < hh && i < wh) band = 0;
      else if (j < hh && i >= wh) band = 1;
      else if (j >= hh && i < wh) band = 2;
      else band = 3;
      var dx = (band === 1 || band === 3) ? wh : 0;
      var dy = (band === 2 || band === 3) ? hh : 0;
      cols[j * w + i] = coeff[(dy + srcY) * w + (dx + srcX)];
    }
  }
  // 逆列变换
  var rows = new Float32Array(w * h);
  for (i = 0; i < w; i++) {
    var col = new Float32Array(h);
    for (j = 0; j < h; j++) col[j] = cols[j * w + i];
    var colI = ihaar1d(col);
    for (j = 0; j < h; j++) rows[j * w + i] = colI[j];
  }
  // 逆行变换
  var out = new Float32Array(w * h);
  for (j = 0; j < h; j++) {
    var row = new Float32Array(w);
    for (i = 0; i < w; i++) row[i] = rows[j * w + i];
    var rowI = ihaar1d(row);
    for (i = 0; i < w; i++) out[j * w + i] = rowI[i];
  }
  return out;
}

/**
 * 提取某个子带（用于可视化），返回该子带的矩形数据
 * @param {Float32Array} coeff
 * @param {number} w
 * @param {number} h
 * @param {number} band 0=LL 1=LH 2=HL 3=HH
 * @returns {{data:Float32Array, w:number, h:number, offsetX:number, offsetY:number}}
 */
function extractBand(coeff, w, h, band) {
  var wh = Math.floor(w / 2);
  var hh = Math.floor(h / 2);
  var bw = (band === 1 || band === 3) ? (w - wh) : wh;
  var bh = (band === 2 || band === 3) ? (h - hh) : hh;
  var dx = (band === 1 || band === 3) ? wh : 0;
  var dy = (band === 2 || band === 3) ? hh : 0;
  var data = new Float32Array(bw * bh);
  for (var j = 0; j < bh; j++) {
    for (var i = 0; i < bw; i++) {
      data[j * bw + i] = coeff[(dy + j) * w + (dx + i)];
    }
  }
  return { data: data, w: bw, h: bh, offsetX: dx, offsetY: dy };
}

/**
 * 计算 PSNR（峰值信噪比）
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} dB，无穷大时返回 Infinity
 */
function psnr(a, b) {
  var n = a.length;
  var mse = 0;
  for (var i = 0; i < n; i++) {
    var d = a[i] - b[i];
    mse += d * d;
  }
  mse /= n;
  if (mse === 0) return Infinity;
  return 10 * Math.log10(255 * 255 / mse);
}

/**
 * 估计压缩后的字节数：统计小波系数量化后非零个数 × 每系数若干字节
 * 这里用「非零系数占比」作为体积的度量（熵编码前），便于对比压缩比
 * @param {Float32Array} coeff
 * @param {number} quantStep
 * @returns {number} 估计字节数（按 1 系数 = 1 字节粗估，足够演示比例关系）
 */
function estimateBytes(coeff, quantStep) {
  var nonzero = 0;
  for (var i = 0; i < coeff.length; i++) {
    if (Math.round(coeff[i] / quantStep) !== 0) nonzero++;
  }
  return nonzero; // 非零系数个数，比例上与真实体积成正比
}

/**
 * 对子带系数做均匀量化 + 反量化（有损核心）
 * @param {Float32Array} coeff
 * @param {number} step
 * @returns {Float32Array}
 */
function quantize(coeff, step) {
  var out = new Float32Array(coeff.length);
  for (var i = 0; i < coeff.length; i++) {
    out[i] = Math.round(coeff[i] / step) * step;
  }
  return out;
}

/**
 * 多级二维 DWT：对 LL 子带递归分解 levels 次，得到 JPEG2000 式金字塔
 * 布局：每一级都把当前 LL 再切成 LL/LH/HL/HH，最深 LL 位于左上角
 * 为保证每级宽高均为偶数，levels 会被钳制到 w、h 都能被 2^levels 整除的最大值
 * @param {Float32Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} levels
 * @returns {Float32Array} 金字塔布局的系数
 */
function maxSafeLevels(w, h, levels) {
  var n = 0;
  var tw = w, th = h;
  while (n < levels && tw % 2 === 0 && th % 2 === 0 && tw >= 2 && th >= 2) {
    tw = tw / 2; th = th / 2; n++;
  }
  return n;
}

function dwt2dLevels(gray, w, h, levels) {
  var out = dwt2d(gray, w, h);
  var n = maxSafeLevels(w, h, levels);
  var cw = w / 2, ch = h / 2;
  var lvl = 1;
  while (lvl < n) {
    // 取出当前左上角 LL 区域（cw×ch）
    var ll = new Float32Array(cw * ch);
    for (var j = 0; j < ch; j++) {
      for (var i = 0; i < cw; i++) {
        ll[j * cw + i] = out[j * w + i];
      }
    }
    var sub = dwt2d(ll, cw, ch);
    // 写回左上角 cw×ch 区域
    for (var j2 = 0; j2 < ch; j2++) {
      for (var i2 = 0; i2 < cw; i2++) {
        out[j2 * w + i2] = sub[j2 * cw + i2];
      }
    }
    cw = cw / 2; ch = ch / 2;
    lvl++;
  }
  return out;
}

/**
 * 多级逆 DWT：从最深 LL 逐级向上重建
 * @param {Float32Array} coeff 金字塔布局
 * @param {number} w
 * @param {number} h
 * @param {number} levels
 * @returns {Float32Array}
 */
function idwt2dLevels(coeff, w, h, levels) {
  // 用与正向一致的方式推导实际可分解深度，避免小图/超深 levels 产生越界
  var nLevels = maxSafeLevels(w, h, levels);
  var lw = w, lh = h;
  for (var k = 0; k < nLevels; k++) { lw = lw / 2; lh = lh / 2; }
  if (lw < 1) lw = 1;
  if (lh < 1) lh = 1;
  // current = 当前已重建的低频块（从最深层 LL 开始）
  var current = new Float32Array(lw * lh);
  for (var j0 = 0; j0 < lh; j0++) {
    for (var i0 = 0; i0 < lw; i0++) {
      current[j0 * lw + i0] = coeff[j0 * w + i0];
    }
  }
  var cw = lw, ch = lh;
  var lvl = nLevels - 1;
  for (; lvl >= 0; lvl--) {
    var nw = cw * 2, nh = ch * 2;
    var block = new Float32Array(nw * nh);
    for (var j = 0; j < ch; j++) {
      for (var i = 0; i < cw; i++) {
        block[j * nw + i] = current[j * cw + i];
        block[j * nw + (cw + i)] = coeff[j * w + (cw + i)];
        block[(ch + j) * nw + i] = coeff[(ch + j) * w + i];
        block[(ch + j) * nw + (cw + i)] = coeff[(ch + j) * w + (cw + i)];
      }
    }
    var rec = idwt2d(block, nw, nh);
    current = rec;
    cw = nw; ch = nh;
  }
  return current;
}

/**
 * JPEG2000 风格压缩（教学版：多级 DWT + 量化高频子带，保留最深层 LL）
 * 量化时跳过最深层 LL，只量化其它所有子带——层数越多，保留的无损区域越小、压缩越狠
 * @param {Float32Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} levels 分解层数
 * @param {number} quantStep 量化步长（越大越狠）
 * @returns {{recon:Float32Array, psnr:number, estBytes:number, compressionRatio:number}}
 */
function jpeg2000Compress(gray, w, h, levels, quantStep) {
  var nLevels = maxSafeLevels(w, h, levels);
  var coeff = dwt2dLevels(gray, w, h, nLevels);
  var n = w * h;
  var totalBytes = n; // 无损基线：每像素 1 字节
  // 最深层 LL 的尺寸（不量化它）
  var lw = w, lh = h;
  for (var k = 0; k < nLevels; k++) { lw = lw / 2; lh = lh / 2; }
  // 量化除最深层 LL 外的所有系数
  var quantized = new Float32Array(n);
  var estBytes = 0;
  for (var j = 0; j < h; j++) {
    for (var i = 0; i < w; i++) {
      var idx = j * w + i;
      var isLL = (j < lh && i < lw);
      var v = coeff[idx];
      if (!isLL) v = Math.round(v / quantStep) * quantStep;
      quantized[idx] = v;
      if (v !== 0) estBytes++;
    }
  }
  var recon = idwt2dLevels(quantized, w, h, nLevels);
  return {
    recon: recon,
    psnr: psnr(gray, recon),
    estBytes: estBytes,
    compressionRatio: totalBytes / Math.max(1, estBytes)
  };
}

/**
 * 模拟 JPEG 的「分块 DCT」伪影：把图像切成 8×8 块，每块独立平均化
 * 这不是真 DCT，但能产生与 JPEG 同款「方块效应」，用于和 JPEG2000 对比
 * @param {Float32Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} blockSize
 * @returns {Float32Array}
 */
function jpegBlockArtifact(gray, w, h, blockSize) {
  var out = new Float32Array(w * h);
  for (var by = 0; by < h; by += blockSize) {
    for (var bx = 0; bx < w; bx += blockSize) {
      var sum = 0, cnt = 0;
      for (var yy = by; yy < Math.min(by + blockSize, h); yy++) {
        for (var xx = bx; xx < Math.min(bx + blockSize, w); xx++) {
          sum += gray[yy * w + xx]; cnt++;
        }
      }
      var avg = sum / cnt;
      for (var y2 = by; y2 < Math.min(by + blockSize, h); y2++) {
        for (var x2 = bx; x2 < Math.min(bx + blockSize, w); x2++) {
          out[y2 * w + x2] = avg;
        }
      }
    }
  }
  return out;
}

/**
 * 多分辨率渐进重建：只用 LL 子带就能得到一张缩小图
 * 逐层添加细节 → 越来越清晰（JPEG2000 渐进式/多分辨率特性）
 * @param {Float32Array} gray
 * @param {number} w
 * @param {number} h
 * @param {number} level 0=全分辨率，1=半分辨率，2=1/4 分辨率
 * @returns {{data:Float32Array, w:number, h:number}} 该分辨率的图像
 */
function progressiveLevel(gray, w, h, level) {
  var coeff = dwt2d(gray, w, h);
  // 迭代地把低频放回左上角，其余子带清零
  var current = coeff;
  var cw = w, ch = h;
  // 最多分解到 2×2，避免小图/奇数尺寸下子带退化到 0×0
  var maxLevel = 0;
  var tw = w, th = h;
  while (tw >= 2 && th >= 2) { tw = Math.floor(tw / 2); th = Math.floor(th / 2); maxLevel++; }
  var n = Math.min(level, maxLevel);
  for (var l = 0; l < n; l++) {
    // 取出当前 LL（左上 wh × hh）
    var wh = Math.floor(cw / 2), hh = Math.floor(ch / 2);
    var newLL = new Float32Array(wh * hh);
    for (var j = 0; j < hh; j++) {
      for (var i = 0; i < wh; i++) {
        newLL[j * wh + i] = current[j * cw + i];
      }
    }
    // 把 newLL 当作「完整图像」再分解一层（此时它就是上一层的 LL）
    current = dwt2d(newLL, wh, hh);
    cw = wh; ch = hh;
  }
  // 重建：把当前 LL 反变换回该分辨率尺寸
  var recon = idwt2d(current, cw, ch);
  return { data: recon, w: cw, h: ch };
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toGrayscale: toGrayscale,
    haar1d: haar1d,
    ihaar1d: ihaar1d,
    dwt2d: dwt2d,
    idwt2d: idwt2d,
    dwt2dLevels: dwt2dLevels,
    idwt2dLevels: idwt2dLevels,
    maxSafeLevels: maxSafeLevels,
    extractBand: extractBand,
    psnr: psnr,
    estimateBytes: estimateBytes,
    quantize: quantize,
    jpeg2000Compress: jpeg2000Compress,
    jpegBlockArtifact: jpegBlockArtifact,
    progressiveLevel: progressiveLevel
  };
}
