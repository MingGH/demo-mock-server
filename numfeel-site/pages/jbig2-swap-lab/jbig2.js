/**
 * jbig2.js - JBIG2 模板匹配替换事故 / 纯逻辑引擎
 *
 * 纯算法模块，零 DOM 依赖，可被 Node 直接 require 测试。
 * 实现一个简化但可复现的 JBIG2 PM&S（pattern matching and substitution）
 * 与 SPM（soft pattern matching）编码流程，用于演示相似字符块被错误归并、
 * 导致扫描件中数字被静默替换的现象。
 */

// ────────────────────────────────────────────────────────────
// 0. 常量与工具
// ────────────────────────────────────────────────────────────

/** 激进度 0~1 映射到失配率上限的缩放因子（最大允许失配率） */
var AGGRESSIVENESS_MAX_DISTANCE = 0.45;

/**
 * 创建空二值位图
 * @param {number} w
 * @param {number} h
 * @returns {{w:number,h:number,data:Uint8Array}}
 */
function createBitmap(w, h) {
  return { w: w, h: h, data: new Uint8Array(w * h) };
}

/**
 * 复制位图
 * @param {{w:number,h:number,data:Uint8Array}} bmp
 * @returns {{w:number,h:number,data:Uint8Array}}
 */
function copyBitmap(bmp) {
  var c = createBitmap(bmp.w, bmp.h);
  for (var i = 0; i < bmp.data.length; i++) c.data[i] = bmp.data[i];
  return c;
}

/**
 * 读取位图像素（越界返回 0）
 * @param {{w:number,h:number,data:Uint8Array}} bmp
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function getPixel(bmp, x, y) {
  if (x < 0 || y < 0 || x >= bmp.w || y >= bmp.h) return 0;
  return bmp.data[y * bmp.w + x];
}

/**
 * 设置位图像素
 * @param {{w:number,h:number,data:Uint8Array}} bmp
 * @param {number} x
 * @param {number} y
 * @param {number} v
 */
function setPixel(bmp, x, y, v) {
  if (x < 0 || y < 0 || x >= bmp.w || y >= bmp.h) return;
  bmp.data[y * bmp.w + x] = v ? 1 : 0;
}

/**
 * 统计前景像素数
 * @param {{w:number,h:number,data:Uint8Array}} bmp
 * @returns {number}
 */
function countForeground(bmp) {
  var n = 0;
  for (var i = 0; i < bmp.data.length; i++) if (bmp.data[i]) n++;
  return n;
}

/**
 * 线性同余确定性伪随机数生成器（LCG）
 * @param {number} seed
 * @returns {function():number} 返回 [0,1) 的函数
 */
function createLcg(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 标准正态分布抽样（Box-Muller）
 * @param {function():number} rng
 * @returns {number}
 */
function randNormal(rng) {
  var u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * 将 0/1 位图数据打包成紧凑字节（MSB 在前）
 * @param {{w:number,h:number,data:Uint8Array}} bmp
 * @returns {Uint8Array}
 */
function packBits(bmp) {
  var byteLen = Math.ceil(bmp.w * bmp.h / 8);
  var out = new Uint8Array(byteLen);
  for (var i = 0; i < bmp.w * bmp.h; i++) {
    if (bmp.data[i]) out[i >> 3] |= 1 << (7 - (i & 7));
  }
  return out;
}

/**
 * 将紧凑字节解包成 0/1 位图数据
 * @param {Uint8Array} packed
 * @param {number} totalBits
 * @returns {Uint8Array}
 */
function unpackBits(packed, totalBits) {
  var out = new Uint8Array(totalBits);
  for (var i = 0; i < totalBits; i++) {
    var byteIdx = i >> 3;
    var bitIdx = 7 - (i & 7);
    if (byteIdx < packed.length) out[i] = (packed[byteIdx] >> bitIdx) & 1;
  }
  return out;
}

/**
 * 拼接多个 Uint8Array
 * @param {Uint8Array[]} parts
 * @returns {Uint8Array}
 */
function concatArrays(parts) {
  var total = 0;
  for (var i = 0; i < parts.length; i++) total += parts[i].length;
  var out = new Uint8Array(total);
  var off = 0;
  for (var j = 0; j < parts.length; j++) {
    out.set(parts[j], off);
    off += parts[j].length;
  }
  return out;
}

/**
 * 16 位无符号整数写入大端
 * @param {number} v
 * @returns {Uint8Array}
 */
function u16be(v) {
  var a = new Uint8Array(2);
  a[0] = (v >>> 8) & 0xFF;
  a[1] = v & 0xFF;
  return a;
}

// ────────────────────────────────────────────────────────────
// 1. 二值化
// ────────────────────────────────────────────────────────────

/**
 * 灰度数组 → 二值位图
 * @param {Uint8Array|number[]} gray 长度 = w*h，值域任意；≥ threshold 为前景
 * @param {number} w
 * @param {number} h
 * @param {number} threshold
 * @returns {{w:number,h:number,data:Uint8Array}}
 */
function binarize(gray, w, h, threshold) {
  var bmp = createBitmap(w, h);
  var len = w * h;
  for (var i = 0; i < len; i++) {
    bmp.data[i] = (gray[i] >= threshold) ? 1 : 0;
  }
  return bmp;
}

// ────────────────────────────────────────────────────────────
// 2. 扫描退化模拟
// ────────────────────────────────────────────────────────────

/**
 * 对位图做轻微高斯模糊（3x3 核，sigma≈0.85）
 * 输入输出均为 0~1 浮点数组
 * @param {Float32Array} src
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array}
 */
function gaussianBlur3(src, w, h) {
  var tmp = new Float32Array(w * h);
  var out = new Float32Array(w * h);
  var kernel = [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625];
  var kx = [-1, 0, 1, -1, 0, 1, -1, 0, 1];
  var ky = [-1, -1, -1, 0, 0, 0, 1, 1, 1];

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var sum = 0;
      for (var k = 0; k < 9; k++) {
        var xx = x + kx[k];
        var yy = y + ky[k];
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) {
          sum += src[yy * w + xx] * kernel[k];
        }
      }
      tmp[y * w + x] = sum;
    }
  }

  // 第二次卷积让结果更平滑
  for (var y2 = 0; y2 < h; y2++) {
    for (var x2 = 0; x2 < w; x2++) {
      var sum2 = 0;
      for (var k2 = 0; k2 < 9; k2++) {
        var xx2 = x2 + kx[k2];
        var yy2 = y2 + ky[k2];
        if (xx2 >= 0 && xx2 < w && yy2 >= 0 && yy2 < h) {
          sum2 += tmp[yy2 * w + xx2] * kernel[k2];
        }
      }
      out[y2 * w + x2] = sum2;
    }
  }
  return out;
}

/**
 * 扫描退化模拟：降采样 + 高斯模糊 + 高斯噪声 + 二值化。
 * 种子固定可复现（自带 LCG）。
 * @param {{w:number,h:number,data:Uint8Array}} bitmap
 * @param {object} opts
 * @param {number} [opts.dpiScale=1]
 * @param {number} [opts.blur=0]
 * @param {number} [opts.noise=0]
 * @param {number} [opts.seed=1]
 * @param {number} [opts.threshold=0.5]
 * @returns {{w:number,h:number,data:Uint8Array}}
 */
function simulateScan(bitmap, opts) {
  opts = opts || {};
  var dpiScale = (typeof opts.dpiScale === 'number') ? opts.dpiScale : 1;
  var blur = (typeof opts.blur === 'number') ? opts.blur : 0;
  var noise = (typeof opts.noise === 'number') ? opts.noise : 0;
  var seed = (typeof opts.seed === 'number') ? opts.seed : 1;
  var threshold = (typeof opts.threshold === 'number') ? opts.threshold : 0.5;

  var rng = createLcg(seed);

  // 1. 先转成浮点 0/1
  var srcW = bitmap.w;
  var srcH = bitmap.h;
  var src = new Float32Array(srcW * srcH);
  for (var i = 0; i < srcW * srcH; i++) src[i] = bitmap.data[i] ? 1 : 0;

  // 2. 降采样
  var curW = srcW;
  var curH = srcH;
  var cur = src;
  if (dpiScale > 0 && dpiScale !== 1) {
    var dstW = Math.max(1, Math.round(srcW * dpiScale));
    var dstH = Math.max(1, Math.round(srcH * dpiScale));
    var dst = new Float32Array(dstW * dstH);
    for (var dy = 0; dy < dstH; dy++) {
      for (var dx = 0; dx < dstW; dx++) {
        var y0 = Math.floor(dy * srcH / dstH);
        var y1 = Math.floor((dy + 1) * srcH / dstH);
        var x0 = Math.floor(dx * srcW / dstW);
        var x1 = Math.floor((dx + 1) * srcW / dstW);
        var sum = 0, cnt = 0;
        for (var sy = y0; sy < y1; sy++) {
          for (var sx = x0; sx < x1; sx++) {
            sum += src[sy * srcW + sx];
            cnt++;
          }
        }
        dst[dy * dstW + dx] = cnt > 0 ? (sum / cnt) : 0;
      }
    }
    curW = dstW;
    curH = dstH;
    cur = dst;
  }

  // 3. 高斯模糊（仅当 blur > 0）
  if (blur > 0) {
    cur = gaussianBlur3(cur, curW, curH);
  }

  // 4. 高斯噪声 + 二值化
  var out = createBitmap(curW, curH);
  for (var y = 0; y < curH; y++) {
    for (var x = 0; x < curW; x++) {
      var v = cur[y * curW + x];
      if (noise > 0) v += randNormal(rng) * noise;
      setPixel(out, x, y, v >= threshold ? 1 : 0);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// 3. 连通域切分
// ────────────────────────────────────────────────────────────

/**
 * 8-连通域标记（two-pass）
 * @param {{w:number,h:number,data:Uint8Array}} bmp
 * @returns {number[]} 每个像素对应的区域编号，0 表示背景
 */
function labelComponents(bmp) {
  var w = bmp.w;
  var h = bmp.h;
  var labels = new Int32Array(w * h);
  var parent = [0];
  var nextLabel = 1;

  function find(a) {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  }
  function union(a, b) {
    var ra = find(a);
    var rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  // 第一遍
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (!getPixel(bmp, x, y)) continue;
      var neighbors = [];
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = x + dx;
          var ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            var nl = labels[ny * w + nx];
            if (nl > 0) neighbors.push(nl);
          }
        }
      }
      if (neighbors.length === 0) {
        labels[y * w + x] = nextLabel;
        parent.push(nextLabel);
        nextLabel++;
      } else {
        var minL = neighbors[0];
        for (var i = 1; i < neighbors.length; i++) if (neighbors[i] < minL) minL = neighbors[i];
        labels[y * w + x] = minL;
        for (var j = 0; j < neighbors.length; j++) union(minL, neighbors[j]);
      }
    }
  }

  // 第二遍：归并等价类
  for (var k = 0; k < labels.length; k++) {
    if (labels[k] > 0) labels[k] = find(labels[k]);
  }
  return labels;
}

/**
 * 连通域切分。
 * mode: 'char'（单字符）| 'block'（相邻间距 < gap 的连通域合并为一个数字块）
 * @param {{w:number,h:number,data:Uint8Array}} bmp
 * @param {object} opts
 * @param {string} [opts.mode='char']
 * @param {number} [opts.gap=4]
 * @returns {Array<{x:number,y:number,w:number,h:number,bitmap:{w:number,h:number,data:Uint8Array},label:string}>}
 */
function segment(bmp, opts) {
  opts = opts || {};
  var mode = opts.mode || 'char';
  var gap = (typeof opts.gap === 'number') ? opts.gap : 4;

  if (bmp.w * bmp.h === 0) return [];

  var labels = labelComponents(bmp);
  var w = bmp.w;
  var h = bmp.h;

  // 收集每个标签的 bbox 和像素
  var bboxes = {};
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var lab = labels[y * w + x];
      if (!lab) continue;
      if (!bboxes[lab]) {
        bboxes[lab] = { minX: x, maxX: x, minY: y, maxY: y, pixels: [] };
      }
      var b = bboxes[lab];
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
      b.pixels.push({ x: x, y: y });
    }
  }

  var chars = [];
  var keys = Object.keys(bboxes);
  for (var i = 0; i < keys.length; i++) {
    var b = bboxes[keys[i]];
    var cw = b.maxX - b.minX + 1;
    var ch = b.maxY - b.minY + 1;
    var cb = createBitmap(cw, ch);
    for (var p = 0; p < b.pixels.length; p++) {
      var px = b.pixels[p].x - b.minX;
      var py = b.pixels[p].y - b.minY;
      setPixel(cb, px, py, 1);
    }
    chars.push({ x: b.minX, y: b.minY, w: cw, h: ch, bitmap: cb });
  }

  // 按阅读顺序：先按行（y 中心），再按 x
  chars.sort(function (a, b) {
    var ay = a.y + a.h / 2;
    var by = b.y + b.h / 2;
    if (Math.abs(ay - by) > Math.min(a.h, b.h) / 2) return ay - by;
    return a.x - b.x;
  });

  if (mode === 'char') {
    return chars.map(function (c, idx) {
      return {
        x: c.x, y: c.y, w: c.w, h: c.h,
        bitmap: c.bitmap,
        label: String.fromCharCode(0x30 + (idx % 10)) // 默认占位，调用方应覆盖
      };
    });
  }

  // block 模式：水平合并同一行内相邻字符（要求 y 范围重叠，避免跨行误并）
  var blocks = [];
  if (chars.length === 0) return blocks;

  var current = { chars: [chars[0]] };
  for (var j = 1; j < chars.length; j++) {
    var prev = current.chars[current.chars.length - 1];
    var cur = chars[j];
    var space = cur.x - (prev.x + prev.w);
    var yOverlap = prev.y < cur.y + cur.h && cur.y < prev.y + prev.h;
    if (space <= gap && yOverlap) {
      current.chars.push(cur);
    } else {
      blocks.push(current);
      current = { chars: [cur] };
    }
  }
  blocks.push(current);

  return blocks.map(function (blk, idx) {
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    for (var c = 0; c < blk.chars.length; c++) {
      var ch = blk.chars[c];
      if (ch.x < minX) minX = ch.x;
      if (ch.x + ch.w > maxX) maxX = ch.x + ch.w;
      if (ch.y < minY) minY = ch.y;
      if (ch.y + ch.h > maxY) maxY = ch.y + ch.h;
    }
    var bw = maxX - minX;
    var bh = maxY - minY;
    var bb = createBitmap(bw, bh);
    for (var c2 = 0; c2 < blk.chars.length; c2++) {
      var ch2 = blk.chars[c2];
      for (var yy = 0; yy < ch2.h; yy++) {
        for (var xx = 0; xx < ch2.w; xx++) {
          if (getPixel(ch2.bitmap, xx, yy)) {
            setPixel(bb, ch2.x - minX + xx, ch2.y - minY + yy, 1);
          }
        }
      }
    }
    return {
      x: minX, y: minY, w: bw, h: bh,
      bitmap: bb,
      label: String.fromCharCode(0x30 + (idx % 10)) // 默认占位
    };
  });
}

// ────────────────────────────────────────────────────────────
// 4. 符号距离与字典
// ────────────────────────────────────────────────────────────

/**
 * 两个符号位图的失配率：尺寸对齐后 XOR 计数 / 前景像素并集。返回 0~1
 * @param {{w:number,h:number,data:Uint8Array}} a
 * @param {{w:number,h:number,data:Uint8Array}} b
 * @returns {number}
 */
function symbolDistance(a, b) {
  var w = Math.max(a.w, b.w);
  var h = Math.max(a.h, b.h);
  var xor = 0;
  var union = 0;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var pa = getPixel(a, x, y);
      var pb = getPixel(b, x, y);
      if (pa || pb) union++;
      if (pa !== pb) xor++;
    }
  }
  if (union === 0) return 0;
  return xor / union;
}

/**
 * PM&S 字典构建。aggressiveness 0~1，越高越容易合并（内部换算成失配率上限）
 * @param {Array<{x:number,y:number,w:number,h:number,bitmap:{w:number,h:number,data:Uint8Array},label:string}>} instances
 * @param {number} aggressiveness
 * @returns {{dictionary:Array<{bitmap:{w:number,h:number,data:Uint8Array},repIndex:number}>, assignments:number[], refinements:null}}
 */
function buildSymbolDictionary(instances, aggressiveness) {
  var threshold = (aggressiveness || 0) * AGGRESSIVENESS_MAX_DISTANCE;
  var dictionary = [];
  var assignments = [];

  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    var bestIdx = -1;
    var bestDist = Infinity;
    for (var d = 0; d < dictionary.length; d++) {
      var dist = symbolDistance(inst.bitmap, dictionary[d].bitmap);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = d;
      }
    }
    if (bestIdx >= 0 && bestDist <= threshold) {
      assignments.push(bestIdx);
    } else {
      dictionary.push({ bitmap: copyBitmap(inst.bitmap), repIndex: i });
      assignments.push(dictionary.length - 1);
    }
  }

  return { dictionary: dictionary, assignments: assignments, refinements: null };
}

// ────────────────────────────────────────────────────────────
// 5. 编码与重建
// ────────────────────────────────────────────────────────────

/**
 * 计算 refinement 位图（实例与模板的逐像素差分，可还原原始实例）
 * @param {{w:number,h:number,data:Uint8Array}} inst
 * @param {{w:number,h:number,data:Uint8Array}} tmpl
 * @returns {{w:number,h:number,data:Uint8Array}}
 */
function computeRefinement(inst, tmpl) {
  var w = Math.max(inst.w, tmpl.w);
  var h = Math.max(inst.h, tmpl.h);
  var out = createBitmap(w, h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var pi = getPixel(inst, x, y);
      var pt = getPixel(tmpl, x, y);
      setPixel(out, x, y, pi ^ pt);
    }
  }
  return out;
}

/**
 * SPM 开关：refine=true 时为每个实例存差分，替换错误应归零
 * @param {Array<{x:number,y:number,w:number,h:number,bitmap:{w:number,h:number,data:Uint8Array},label:string}>} instances
 * @param {object} opts
 * @param {number} [opts.aggressiveness=0]
 * @param {boolean} [opts.refine=false]
 * @returns {{dictionary:Array<{bitmap:{w:number,h:number,data:Uint8Array},repIndex:number}>, assignments:number[], refinements:Array<{w:number,h:number,data:Uint8Array}>|null, instances:Array}}
 */
function encode(instances, opts) {
  opts = opts || {};
  var aggressiveness = (typeof opts.aggressiveness === 'number') ? opts.aggressiveness : 0;
  var refine = !!opts.refine;

  var dict = buildSymbolDictionary(instances, aggressiveness);
  var out = {
    dictionary: dict.dictionary,
    assignments: dict.assignments,
    refinements: null,
    instances: instances
  };

  if (refine) {
    out.refinements = [];
    for (var i = 0; i < instances.length; i++) {
      var tmpl = dict.dictionary[dict.assignments[i]].bitmap;
      out.refinements.push(computeRefinement(instances[i].bitmap, tmpl));
    }
  }

  return out;
}

/**
 * 从字典 + 实例位置重建页面位图（解码端）
 * @param {{dictionary:Array<{bitmap:{w:number,h:number,data:Uint8Array},repIndex:number}>, assignments:number[], refinements:Array|null, instances:Array<{x:number,y:number,w:number,h:number,bitmap:{w:number,h:number,data:Uint8Array},label:string}>}} encoded
 * @param {{w:number,h:number}} pageSize
 * @returns {{w:number,h:number,data:Uint8Array}}
 */
function reconstruct(encoded, pageSize) {
  var out = createBitmap(pageSize.w, pageSize.h);
  var dict = encoded.dictionary;
  var assignments = encoded.assignments;
  var instances = encoded.instances;
  var refinements = encoded.refinements;

  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    var tmpl = dict[assignments[i]].bitmap;
    var ref = refinements ? refinements[i] : null;
    for (var y = 0; y < inst.h; y++) {
      for (var x = 0; x < inst.w; x++) {
        var px = inst.x + x;
        var py = inst.y + y;
        if (px < 0 || py < 0 || px >= pageSize.w || py >= pageSize.h) continue;
        var t = getPixel(tmpl, x, y);
        if (ref) t ^= getPixel(ref, x, y);
        if (t) setPixel(out, px, py, 1);
      }
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// 6. 体积计算
// ────────────────────────────────────────────────────────────

/**
 * 序列化字典位图流：每项 = 2B宽 + 2B高 + packed bits
 * @param {Array<{bitmap:{w:number,h:number,data:Uint8Array}}>} dictionary
 * @returns {Uint8Array}
 */
function serializeDictionaryStream(dictionary) {
  var parts = [];
  for (var i = 0; i < dictionary.length; i++) {
    var bmp = dictionary[i].bitmap;
    parts.push(u16be(bmp.w));
    parts.push(u16be(bmp.h));
    parts.push(packBits(bmp));
  }
  return concatArrays(parts);
}

/**
 * 序列化文本区流：每个实例 = 2B字典索引 + 2Bx + 2By
 * @param {Array<{x:number,y:number}>} instances
 * @param {number[]} assignments
 * @returns {Uint8Array}
 */
function serializeTextRegionStream(instances, assignments) {
  var parts = [];
  for (var i = 0; i < instances.length; i++) {
    parts.push(u16be(assignments[i]));
    parts.push(u16be(instances[i].x));
    parts.push(u16be(instances[i].y));
  }
  return concatArrays(parts);
}

/**
 * 序列化 refinement 流。
 * 真实 JBIG2 中 refinement 使用上下文建模编码，体积与差分复杂度成正比；
 * 这里用「行游程」模拟：每项 = 1B 有差异的行数，随后每行 y, x0, x1。
 * 差异像素稀疏时，行游程 + deflate 比整幅位图紧凑得多，贴近真实的开销量级。
 * @param {Array<{w:number,h:number,data:Uint8Array}>} refinements
 * @returns {Uint8Array}
 */
function serializeRefinementStream(refinements) {
  var parts = [];
  for (var i = 0; i < refinements.length; i++) {
    var r = refinements[i];
    var runs = [];
    for (var yy = 0; yy < r.h; yy++) {
      var x0 = -1;
      var x1 = -1;
      for (var xx = 0; xx < r.w; xx++) {
        if (getPixel(r, xx, yy)) {
          if (x0 < 0) x0 = xx;
          x1 = xx;
        }
      }
      if (x0 >= 0) runs.push(yy, x0, x1);
    }
    if (runs.length === 0) {
      parts.push(new Uint8Array([0]));
      continue;
    }
    var item = new Uint8Array(1 + runs.length);
    item[0] = runs.length / 3;
    for (var p = 0; p < runs.length; p++) item[1 + p] = runs[p];
    parts.push(item);
  }
  return concatArrays(parts);
}

/**
 * 体积计算：deflate 函数注入，Node 用 zlib.deflateRawSync，浏览器用 pako.deflateRaw
 * @param {function(Uint8Array):Uint8Array} deflateFn
 * @returns {{rawBits:function, genericRegionBytes:function, jbig2Bytes:function, ratio:function}}
 */
function createSizeCalculator(deflateFn) {
  return {
    /**
     * 原始未压缩位图比特数
     * @param {{w:number,h:number,data:Uint8Array}} bmp
     * @returns {number}
     */
    rawBits: function (bmp) {
      return bmp.w * bmp.h;
    },

    /**
     * 把位图当作通用区域编码（直接 deflate packed bits）的字节数
     * @param {{w:number,h:number,data:Uint8Array}} bmp
     * @returns {number}
     */
    genericRegionBytes: function (bmp) {
      return deflateFn(packBits(bmp)).length;
    },

    /**
     * JBIG2 编码后总字节数（字典流 + 文本区流 + 可选 refinement 流）
     * @param {{dictionary:Array, assignments:number[], refinements:Array|null, instances:Array}} encoded
     * @returns {number}
     */
    jbig2Bytes: function (encoded) {
      var dictBytes = deflateFn(serializeDictionaryStream(encoded.dictionary)).length;
      var textBytes = deflateFn(serializeTextRegionStream(encoded.instances, encoded.assignments)).length;
      var total = dictBytes + textBytes;
      if (encoded.refinements) {
        total += deflateFn(serializeRefinementStream(encoded.refinements)).length;
      }
      return total;
    },

    /**
     * JBIG2 字节数 / 通用区域字节数
     * @param {{w:number,h:number,data:Uint8Array}} bmp
     * @param {{dictionary:Array, assignments:number[], refinements:Array|null, instances:Array}} encoded
     * @returns {number}
     */
    ratio: function (bmp, encoded) {
      var g = this.genericRegionBytes(bmp);
      if (g === 0) return 1;
      return this.jbig2Bytes(encoded) / g;
    }
  };
}

// ────────────────────────────────────────────────────────────
// 7. 语义与像素比对
// ────────────────────────────────────────────────────────────

/**
 * 语义比对：用每个实例的真值 label 与其所属模板代表实例的 label 对比
 * @param {Array<{x:number,y:number,w:number,h:number,bitmap:{w:number,h:number,data:Uint8Array},label:string}>} instances
 * @param {{dictionary:Array<{repIndex:number}>, assignments:number[], refinements:Array|null}} encoded
 * @returns {{substitutions:Array<{index:number,from:string,to:string,x:number,y:number,w:number,h:number}>, decodedText:string, errorCount:number}}
 */
function diffSemantics(instances, encoded) {
  var subs = [];
  var decodedTextParts = [];
  // SPM refinement：每个实例额外存了与模板的差分，解码时逐像素还原，不产生替换错误
  var spm = !!(encoded.refinements && encoded.refinements.length);
  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    if (spm) {
      decodedTextParts.push(inst.label);
      continue;
    }
    var dictIdx = encoded.assignments[i];
    var repIdx = encoded.dictionary[dictIdx].repIndex;
    var from = inst.label;
    var to = instances[repIdx].label;
    if (from !== to) {
      subs.push({
        index: i,
        from: from,
        to: to,
        x: inst.x,
        y: inst.y,
        w: inst.w,
        h: inst.h
      });
    }
    decodedTextParts.push(to);
  }
  return {
    substitutions: subs,
    decodedText: decodedTextParts.join(' '),
    errorCount: subs.length
  };
}

/**
 * 像素层面比对
 * @param {{w:number,h:number,data:Uint8Array}} a
 * @param {{w:number,h:number,data:Uint8Array}} b
 * @returns {{changed:number, foreground:number, ratio:number}}
 */
function pixelDiff(a, b) {
  var w = Math.max(a.w, b.w);
  var h = Math.max(a.h, b.h);
  var changed = 0;
  var foreground = 0;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var pa = getPixel(a, x, y);
      var pb = getPixel(b, x, y);
      if (pa || pb) foreground++;
      if (pa !== pb) changed++;
    }
  }
  return {
    changed: changed,
    foreground: foreground,
    ratio: foreground > 0 ? changed / foreground : 0
  };
}

// ────────────────────────────────────────────────────────────
// 导出
// ────────────────────────────────────────────────────────────

var api = {
  binarize: binarize,
  simulateScan: simulateScan,
  segment: segment,
  symbolDistance: symbolDistance,
  buildSymbolDictionary: buildSymbolDictionary,
  encode: encode,
  reconstruct: reconstruct,
  createSizeCalculator: createSizeCalculator,
  diffSemantics: diffSemantics,
  pixelDiff: pixelDiff,
  // 内部工具也暴露，方便测试与调试
  createBitmap: createBitmap,
  copyBitmap: copyBitmap,
  getPixel: getPixel,
  setPixel: setPixel,
  packBits: packBits,
  unpackBits: unpackBits,
  countForeground: countForeground,
  createLcg: createLcg,
  AGGRESSIVENESS_MAX_DISTANCE: AGGRESSIVENESS_MAX_DISTANCE
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.JBIG2 = api;
}
