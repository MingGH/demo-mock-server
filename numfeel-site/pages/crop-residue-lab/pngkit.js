/**
 * pngkit.js - 裁剪残留实验室的核心算法
 *
 * 纯逻辑模块，不依赖 DOM，可被 Node 直接 require 测试。
 *
 * 实现：
 *   1. CRC32 / adler32 校验和
 *   2. 极简 PNG 编码器（用 zlib 存储块写 IDAT，RGB 8-bit，filter=0）
 *   3. PNG chunk 解析
 *   4. aCropalypse 风格残留检测 / 边界定位 / zlib 存储块重同步 / 扫描线对齐
 *   5. 内置三个伪造场景样本（银行卡 / 聊天 / 身份证），全部用 canvas 2D 程序化生成
 *
 * 已知简化（页面上要诚实标注）：
 *   - IDAT 用 zlib「未压缩存储块」BTYPE=00，让「从任意字节处接着解」确定可算。
 *   - 真实漏洞恢复要做 DEFLATE 比特级重同步 + Huffman 树重建。
 *   - 简化版让 5 步算法可读、可点、可测，机制与真实漏洞同构。
 */

// ────────────────────────────────────────────────────────────
// 0. 常量
// ────────────────────────────────────────────────────────────

/** PNG 文件签名 */
var PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/** IEND chunk 字节序列（长度 12） */
var IEND_BYTES = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];

/** IEND 的 chunk type ASCII */
var IEND_TYPE = 'IEND';

/** IHDR / IDAT 类型 */
var IHDR_TYPE = 'IHDR';
var IDAT_TYPE = 'IDAT';

/** zlib 头（deflate, no compression hint） */
var ZLIB_HEADER = [0x78, 0x01];

/** 单个 IDAT chunk 的最大载荷（8 KB，与真实文件分块策略接近） */
var IDAT_CHUNK_SIZE = 8192;

// ────────────────────────────────────────────────────────────
// 1. CRC32（PNG / zlib 多项式 0xEDB88320，反射表）
// ────────────────────────────────────────────────────────────

/** 预计算 CRC32 表（256 项） */
var CRC_TABLE = (function () {
  var t = new Array(256);
  for (var i = 0; i < 256; i++) {
    var c = i;
    for (var j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[i] = c >>> 0;
  }
  return t;
})();

/**
 * 计算 CRC32（多边形 0xEDB88320，初始 0xFFFFFFFF，结果异或 0xFFFFFFFF）
 * @param {Uint8Array|number[]|string} data 字节数组或 ASCII 字符串
 * @returns {number} 无符号 32 位整数
 */
function crc32(data) {
  var bytes;
  if (typeof data === 'string') {
    bytes = [];
    for (var i = 0; i < data.length; i++) bytes.push(data.charCodeAt(i) & 0xFF);
  } else {
    bytes = data;
  }
  var c = 0xFFFFFFFF;
  for (var k = 0; k < bytes.length; k++) {
    c = CRC_TABLE[(c ^ bytes[k]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ────────────────────────────────────────────────────────────
// 2. adler32（zlib 流末尾的 4 字节校验）
// ────────────────────────────────────────────────────────────

/** MOD 65521 的最大公约数（largest prime smaller than 65536） */
var ADLER_MOD = 65521;

/**
 * 计算 adler32
 * @param {Uint8Array|number[]} data
 * @returns {number} 无符号 32 位整数
 */
function adler32(data) {
  var a = 1, b = 0;
  for (var i = 0; i < data.length; i++) {
    a = (a + (data[i] & 0xFF)) % ADLER_MOD;
    b = (b + a) % ADLER_MOD;
  }
  return ((b << 16) | a) >>> 0;
}

// ────────────────────────────────────────────────────────────
// 3. 字节工具
// ────────────────────────────────────────────────────────────

/** 大端写 32 位无符号整数到数组的指定偏移 */
function writeUInt32BE(arr, offset, value) {
  arr[offset] = (value >>> 24) & 0xFF;
  arr[offset + 1] = (value >>> 16) & 0xFF;
  arr[offset + 2] = (value >>> 8) & 0xFF;
  arr[offset + 3] = value & 0xFF;
}

/** 大端读 32 位无符号整数 */
function readUInt32BE(arr, offset) {
  return (((arr[offset] & 0xFF) << 24) |
         ((arr[offset + 1] & 0xFF) << 16) |
         ((arr[offset + 2] & 0xFF) << 8) |
         (arr[offset + 3] & 0xFF)) >>> 0;
}

/** 小端读 16 位无符号整数 */
function readUInt16LE(arr, offset) {
  return (arr[offset] & 0xFF) | ((arr[offset + 1] & 0xFF) << 8);
}

/** 把 number[] 转 Uint8Array */
function toUint8Array(arr) {
  if (arr instanceof Uint8Array) return arr;
  return new Uint8Array(arr);
}

/** 比较两个字节数组是否逐字节相等 */
function bytesEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────
// 4. PNG chunk 构造
// ────────────────────────────────────────────────────────────

/**
 * 构造一个 PNG chunk（含长度+类型+数据+CRC32）
 * @param {string} type 4 字节 ASCII
 * @param {number[]|Uint8Array} data 载荷
 * @returns {number[]}
 */
function makeChunk(type, data) {
  var len = data.length;
  var out = new Array(12 + len);
  writeUInt32BE(out, 0, len);
  for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i) & 0xFF;
  for (var j = 0; j < len; j++) out[8 + j] = data[j] & 0xFF;
  var crc = crc32(type + bytesToAsciiString(data));
  writeUInt32BE(out, 8 + len, crc);
  return out;
}

/** 简单把 number[] 转成 ASCII 字符串（用于 CRC32(type+data) 拼接） */
function bytesToAsciiString(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xFF);
  return s;
}

// ────────────────────────────────────────────────────────────
// 5. zlib 存储块编码
// ────────────────────────────────────────────────────────────

/**
 * 用 zlib 存储块（BTYPE=00，未压缩）压缩一段字节
 * @param {Uint8Array|number[]} raw 原始数据
 * @returns {number[]} 完整 zlib 流（头+块+adler32）
 */
function zlibStoredEncode(raw) {
  var out = ZLIB_HEADER.slice();
  var pos = 0;
  var isFinal = false;
  while (pos < raw.length) {
    var remaining = raw.length - pos;
    var blockLen = Math.min(65535, remaining);
    if (pos + blockLen >= raw.length) isFinal = true;
    out.push(isFinal ? 0x01 : 0x00);
    out.push(blockLen & 0xFF);
    out.push((blockLen >>> 8) & 0xFF);
    out.push((~blockLen) & 0xFF);
    out.push(((~blockLen) >>> 8) & 0xFF);
    for (var k = 0; k < blockLen; k++) out.push(raw[pos + k] & 0xFF);
    pos += blockLen;
  }
  var ad = adler32(raw);
  out.push((ad >>> 24) & 0xFF);
  out.push((ad >>> 16) & 0xFF);
  out.push((ad >>> 8) & 0xFF);
  out.push(ad & 0xFF);
  return out;
}

// ────────────────────────────────────────────────────────────
// 6. PNG 编码器
// ────────────────────────────────────────────────────────────

/**
 * 把 RGBA 像素数组编码为合法 PNG 字节
 * 颜色类型 2（RGB，无 alpha），位深 8，每行 filter 字节固定 0x00
 * @param {Object} img {width, height, pixels: Uint8ClampedArray|RGBA[]}
 * @returns {Uint8Array}
 */
function encodePNG(img) {
  var w = img.width, h = img.height, px = img.pixels;
  var stride = 1 + w * 3; // 1 字节 filter + 3 字节 RGB / 像素
  var raw = new Array(h * stride);
  for (var y = 0; y < h; y++) {
    raw[y * stride] = 0x00; // filter: None
    for (var x = 0; x < w; x++) {
      var si = (y * w + x) * 4; // RGBA 输入
      var di = y * stride + 1 + x * 3;
      raw[di] = px[si] & 0xFF;
      raw[di + 1] = px[si + 1] & 0xFF;
      raw[di + 2] = px[si + 2] & 0xFF;
    }
  }
  var compressed = zlibStoredEncode(raw);

  // IHDR 数据
  var ihdr = new Array(13);
  writeUInt32BE(ihdr, 0, w);
  writeUInt32BE(ihdr, 4, h);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // 拼装完整 PNG
  // 8 (签名) + 12+13 (IHDR) + Σ(12 + chunkSize) (IDAT) + 12 (IEND)
  var idatCount = Math.ceil(compressed.length / IDAT_CHUNK_SIZE);
  var total = 8 + 25 + 12 * idatCount + compressed.length + 12;

  var out = new Array(total);
  var p = 0;
  for (var s = 0; s < 8; s++) out[p++] = PNG_SIGNATURE[s];
  var ihdrChunk = makeChunk(IHDR_TYPE, ihdr);
  for (var k = 0; k < ihdrChunk.length; k++) out[p++] = ihdrChunk[k];

  // 切分 IDAT
  var off = 0;
  while (off < compressed.length) {
    var take = Math.min(IDAT_CHUNK_SIZE, compressed.length - off);
    var slice = new Array(take);
    for (var t = 0; t < take; t++) slice[t] = compressed[off + t];
    var idatChunk = makeChunk(IDAT_TYPE, slice);
    for (var m = 0; m < idatChunk.length; m++) out[p++] = idatChunk[m];
    off += take;
  }

  // IEND
  var iendChunk = makeChunk(IEND_TYPE, []);
  for (var n = 0; n < iendChunk.length; n++) out[p++] = iendChunk[n];

  return toUint8Array(out);
}

// ────────────────────────────────────────────────────────────
// 7. PNG chunk 解析
// ────────────────────────────────────────────────────────────

/**
 * 解析 PNG 字节，列出所有 chunk
 * @param {Uint8Array|number[]} bytes
 * @returns {{ok: boolean, error?: string, chunks?: Array, signatureValid?: boolean, totalLength?: number}}
 */
function parseChunks(bytes) {
  if (!bytes || bytes.length < 8) {
    return { ok: false, error: '文件太短，连签名都凑不齐' };
  }
  for (var i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      return { ok: false, error: 'PNG 签名不匹配，这不是一张 PNG' };
    }
  }
  var chunks = [];
  var p = 8;
  while (p < bytes.length) {
    if (p + 8 > bytes.length) {
      chunks.push({ offset: p, type: 'TRUNC', length: 0, dataStart: p, crcOk: false, truncated: true });
      break;
    }
    var len = readUInt32BE(bytes, p);
    var typeStr = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    var dataStart = p + 8;
    var dataEnd = dataStart + len;
    var crcOffset = dataEnd;
    var crcFromFile = (crcOffset + 4 <= bytes.length) ? readUInt32BE(bytes, crcOffset) : 0;
    var crcOk = false;
    if (crcOffset + 4 <= bytes.length) {
      // 校验 CRC：type + data
      var s = typeStr;
      for (var d = 0; d < len && dataStart + d < bytes.length; d++) {
        s += String.fromCharCode(bytes[dataStart + d] & 0xFF);
      }
      crcOk = (crc32(s) === crcFromFile);
    }
    var entry = {
      offset: p,
      type: typeStr,
      length: len,
      dataStart: dataStart,
      dataEnd: dataEnd,
      crcOffset: crcOffset,
      crcFromFile: crcFromFile,
      crcOk: crcOk
    };
    if (dataEnd > bytes.length) {
      entry.truncated = true;
    }
    chunks.push(entry);
    if (typeStr === IEND_TYPE) break;
    p = dataEnd + 4; // 跳到下一个 chunk
    if (p <= chunks[chunks.length - 1].offset) {
      // 防止无限循环
      break;
    }
  }
  return {
    ok: true,
    signatureValid: true,
    chunks: chunks,
    totalLength: bytes.length
  };
}

// ────────────────────────────────────────────────────────────
// 8. 残留检测与恢复（5 步算法）
// ────────────────────────────────────────────────────────────

/**
 * 步骤 1：找 IEND 的结束偏移，残留 = bytes.slice(iendEnd)
 * @param {Uint8Array|number[]} bytes
 * @returns {number|null} 残留长度；找不到 IEND 返回 null
 */
function findResidual(bytes) {
  if (!bytes || bytes.length < 12) return null;
  var parsed = parseChunks(bytes);
  if (!parsed.ok || !parsed.chunks) return null;
  for (var i = 0; i < parsed.chunks.length; i++) {
    var c = parsed.chunks[i];
    if (c.type === IEND_TYPE) {
      var iendEnd = c.crcOffset + 4;
      return bytes.length - iendEnd;
    }
  }
  return null;
}

/**
 * 步骤 2：顺序扫描 ASCII "IDAT"（49 44 41 54），找到 CRC 校验通过的 chunk 起点
 * @param {Uint8Array|number[]} residual
 * @returns {number} 候选 chunk 起点偏移；找不到返回 -1
 */
function findChunkBoundary(residual) {
  if (!residual || residual.length < 12) return -1;
  var target = [0x49, 0x44, 0x41, 0x54];
  for (var p = 0; p + 4 <= residual.length; p++) {
    if (residual[p] === target[0] && residual[p + 1] === target[1] &&
        residual[p + 2] === target[2] && residual[p + 3] === target[3]) {
      // 候选 chunk 起点 = p - 4
      var start = p - 4;
      if (start < 0) continue;
      if (start + 8 > residual.length) continue;
      var len = readUInt32BE(residual, start);
      var need = 12 + len;
      if (start + need > residual.length) continue; // 长度越界
      // 校验 CRC
      var s = 'IDAT';
      for (var k = 0; k < len; k++) s += String.fromCharCode(residual[start + 8 + k] & 0xFF);
      var crcGot = readUInt32BE(residual, start + 8 + len);
      if (crc32(s) === crcGot) {
        return start;
      }
    }
  }
  return -1;
}

/**
 * 步骤 3：从边界起正常遍历 chunk，收集 IDAT 载荷直到 IEND
 * @param {Uint8Array|number[]} residual
 * @param {number} boundary
 * @returns {number[]|null} 拼起来的 IDAT 载荷；找不到 IEND 返回 null
 */
function collectIDAT(residual, boundary) {
  if (boundary < 0) return null;
  if (boundary + 8 > residual.length) return null;
  var out = [];
  var p = boundary;
  var foundIend = false;
  while (p + 8 <= residual.length) {
    var len = readUInt32BE(residual, p);
    var typeStr = String.fromCharCode(residual[p + 4], residual[p + 5], residual[p + 6], residual[p + 7]);
    var dataStart = p + 8;
    var dataEnd = dataStart + len;
    if (dataEnd + 4 > residual.length) break;
    if (typeStr === IDAT_TYPE) {
      for (var k = 0; k < len; k++) out.push(residual[dataStart + k] & 0xFF);
    } else if (typeStr === IEND_TYPE) {
      foundIend = true;
      break;
    }
    p = dataEnd + 4;
  }
  if (!foundIend) return null;
  return out;
}

/**
 * 兜底：若残留里没有 IDAT chunk 头（仅 IDAT 数据尾 + IDAT CRC + IEND），
 * 剥掉尾部的 IEND（12 字节）和它之前的 4 字节（假定为 IDAT CRC），
 * 剩下的字节直接作为 zlib 载荷处理。
 * @param {number[]} residual
 * @returns {number[]|null}
 */
function extractResidualPayload(residual) {
  if (!residual || residual.length < 16) return null;
  // 检查尾部 12 字节是否为 IEND
  var iendOk = true;
  for (var i = 0; i < 8; i++) {
    if (residual[residual.length - 12 + i] !== IEND_BYTES[i]) { iendOk = false; break; }
  }
  if (!iendOk) return null;
  // 剥掉 IEND + 前 4 字节（IDAT CRC 候选）
  return residual.slice(0, residual.length - 16);
}

/**
 * 步骤 4：从被切断的 zlib 存储块流中重同步，逐字节扫，第一个合法块头开始
 * 合法块头：byte 满足 (b & 0x06) === 0（即 BTYPE=00，存储），
 *           随后 LEN/NLEN 满足 NLEN === (~LEN & 0xFFFF)，且 LEN 不越界
 * @param {number[]} payload IDAT 拼起来的字节
 * @returns {{ok: boolean, start?: number, data?: number[], reason?: string}}
 */
function resyncStoredBlocks(payload) {
  if (!payload || payload.length < 5) {
    return { ok: false, reason: '载荷太短，连一个块头都凑不齐' };
  }
  for (var p = 0; p + 5 <= payload.length; p++) {
    var b = payload[p];
    if ((b & 0x06) !== 0) continue; // 不是 stored 类型
    var len = payload[p + 1] | (payload[p + 2] << 8);
    var nlen = payload[p + 3] | (payload[p + 4] << 8);
    if ((~len & 0xFFFF) !== nlen) continue;
    if (len < 0 || len > 65535) continue;
    if (p + 5 + len > payload.length) {
      // 最后一个块可能因为 adler32 而短
      // 这里保守处理：len 必须能放下
      if (p + 5 + len > payload.length + 4) continue;
    }
    // 找到第一个合法块头，从这里开始顺序解
    var out = [];
    var cursor = p;
    var sawFinal = false;
    while (cursor + 5 <= payload.length) {
      var b2 = payload[cursor];
      if ((b2 & 0x06) !== 0) break;
      var L = payload[cursor + 1] | (payload[cursor + 2] << 8);
      var NL = payload[cursor + 3] | (payload[cursor + 4] << 8);
      if ((~L & 0xFFFF) !== NL) break;
      if (cursor + 5 + L > payload.length) break;
      for (var k = 0; k < L; k++) out.push(payload[cursor + 5 + k] & 0xFF);
      cursor += 5 + L;
      if (b2 & 0x01) { sawFinal = true; break; }
    }
    if (out.length === 0) continue;
    return { ok: true, start: p, data: out, sawFinal: sawFinal };
  }
  return { ok: false, reason: '扫完整个载荷都没找到合法的存储块头' };
}

/**
 * 兜底：把整个 payload 直接当作「去掉了 zlib 头/CRC 的裸扫描线字节」做对齐
 * 用于原图只有一个超大 IDAT chunk、残留里没有可重同步的存储块头的情况
 * @param {number[]} payload
 * @returns {{ok: boolean, data: number[]}}
 */
function resyncRawMode(payload) {
  if (!payload || payload.length === 0) return { ok: false, data: [] };
  // 跳过开头的 0x78 0x01（zlib 头）如果存在
  var start = 0;
  if (payload.length >= 2 && payload[0] === 0x78 && payload[1] === 0x01) {
    start = 2;
  }
  // 去掉尾部可能的 adler32（4 字节）：粗略判断，末尾若干字节不为零就当作 adler32 略掉
  var end = payload.length;
  if (end - start > 4) {
    var last4 = payload.slice(end - 4, end);
    var allZero = true;
    for (var i = 0; i < 4; i++) if (last4[i] !== 0) { allZero = false; break; }
    if (!allZero) end -= 4;
  }
  return { ok: true, data: payload.slice(start, end), start: start };
}

/**
 * 步骤 5：在若干候选宽度中，找出能最好对齐扫描线的 (width, offset)
 * stride = 1 + width * 3；offset ∈ [0, stride)
 * 衡量：rawTail[offset + k * stride] === 0 的比例（filter 字节应为 0）
 * @param {number[]} rawTail 扫描线字节流
 * @param {number[]} widthCandidates
 * @returns {{ok: boolean, width?: number, offset?: number, confidence?: number, rowCount?: number}}
 */
function alignRows(rawTail, widthCandidates) {
  if (!rawTail || rawTail.length < 4 || !widthCandidates || widthCandidates.length === 0) {
    return { ok: false };
  }
  var best = { confidence: -1, width: 0, offset: 0, rowCount: 0 };
  for (var i = 0; i < widthCandidates.length; i++) {
    var w = widthCandidates[i];
    var stride = 1 + w * 3;
    if (stride <= 0) continue;
    for (var off = 0; off < stride; off++) {
      if (off >= rawTail.length) break;
      var hits = 0, total = 0;
      for (var k = 0; k + off + stride <= rawTail.length; k += stride) {
        total++;
        if (rawTail[off + k] === 0) hits++;
      }
      if (total === 0) continue;
      var conf = hits / total;
      if (conf > best.confidence) {
        best = { confidence: conf, width: w, offset: off, rowCount: total, stride: stride };
      }
    }
  }
  if (best.confidence < 0) return { ok: false };
  return {
    ok: true,
    width: best.width,
    offset: best.offset,
    confidence: best.confidence,
    rowCount: best.rowCount,
    stride: best.stride
  };
}

// ────────────────────────────────────────────────────────────
// 9. 一站式恢复（封装 5 步）
// ────────────────────────────────────────────────────────────

/**
 * 给定 buggy PNG 字节，尝试恢复出原图下半部分的行
 * @param {Uint8Array|number[]} bytes buggy 文件
 * @param {number[]} widthCandidates 候选宽度
 * @returns {Object} {ok, rows, width, height, offset, confidence, rowCount, steps}
 */
function recoverResidual(bytes, widthCandidates) {
  var steps = {};
  var residualLen = findResidual(bytes);
  steps.residualLength = residualLen;
  if (residualLen === null || residualLen <= 0) {
    return { ok: false, reason: '没有残留或文件损坏', steps: steps };
  }
  var residual = Array.prototype.slice.call(bytes, bytes.length - residualLen);
  steps.boundary = findChunkBoundary(residual);
  var payload = null;
  if (steps.boundary >= 0) {
    payload = collectIDAT(residual, steps.boundary);
  }
  if (!payload) {
    // 兜底：残留里没有完整 IDAT chunk，剥掉尾部 IEND + 4 字节当 IDAT 载荷
    payload = extractResidualPayload(residual);
    steps.extractedFallback = true;
  }
  if (!payload) {
    return { ok: false, reason: 'IDAT 链路不完整', steps: steps };
  }
  steps.payloadLength = payload.length;
  var resync = resyncStoredBlocks(payload);
  steps.resync = resync;
  if (!resync.ok) {
    // 兜底：单 IDAT chunk 的情况，残留里没有块头；当成裸扫描线字节
    var rawMode = resyncRawMode(payload);
    if (rawMode.ok && rawMode.data.length > 0) {
      resync = { ok: true, start: rawMode.start, data: rawMode.data, sawFinal: true, rawMode: true };
      steps.resync = resync;
    } else {
      return { ok: false, reason: resync.reason || 'zlib 重同步失败', steps: steps };
    }
  }
  steps.rawTailLength = resync.data.length;
  var align = alignRows(resync.data, widthCandidates);
  steps.align = align;
  if (!align.ok) {
    return { ok: false, reason: '找不到任何能对齐的宽度', steps: steps };
  }
  // 抽出每行 RGB
  var rows = [];
  for (var k = 0; k < align.rowCount; k++) {
    var rowStart = align.offset + k * align.stride + 1; // 跳过 filter 字节
    var row = new Uint8ClampedArray(align.width * 4);
    for (var x = 0; x < align.width; x++) {
      row[x * 4] = resync.data[rowStart + x * 3] || 0;
      row[x * 4 + 1] = resync.data[rowStart + x * 3 + 1] || 0;
      row[x * 4 + 2] = resync.data[rowStart + x * 3 + 2] || 0;
      row[x * 4 + 3] = 255;
    }
    rows.push(row);
  }
  return {
    ok: true,
    rows: rows,
    width: align.width,
    rowCount: align.rowCount,
    confidence: align.confidence,
    offset: align.offset,
    steps: steps
  };
}

// ────────────────────────────────────────────────────────────
// 10. 内置伪造样本（canvas 2D 现画；不在 Node 环境执行）
// ────────────────────────────────────────────────────────────

/** 抽出一个伪造姓名（公开虚构值） */
var FAKE_NAMES = ['张小默', '李知一', '王语辰', '陈默然', '林舒言', '苏砚之'];

/** 抽出一组随机虚构卡号（保留四位分组格式） */
function fakeCardNumber() {
  return '6222 ' +
    String(1000 + Math.floor(Math.random() * 9000)) + ' ' +
    String(1000 + Math.floor(Math.random() * 9000)) + ' ' +
    String(1000 + Math.floor(Math.random() * 9000));
}

/** 抽出一组虚构身份证号（18 位，最后一位 X 概率极低） */
function fakeIdNumber() {
  var area = '110108';
  var birth = '1995' + String(1 + Math.floor(Math.random() * 9)).padStart(2, '0') + String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  var seq = String(100 + Math.floor(Math.random() * 900));
  var base = area + birth + seq;
  // 简单校验位（GB 11643-1999）
  var w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var c = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  var sum = 0;
  for (var i = 0; i < 17; i++) sum += parseInt(base.charAt(i), 10) * w[i];
  return base + c[sum % 11];
}

/**
 * 画一张银行卡账单截图
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {string} cardNumber
 * @param {string} name
 */
function drawBankCardScene(ctx, W, H, cardNumber, name) {
  // 背景：移动银行 App 风格
  var grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a3d62');
  grad.addColorStop(1, '#06283d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 顶部状态栏
  ctx.fillStyle = '#1e5fa3';
  ctx.fillRect(0, 0, W, 80);
  ctx.fillStyle = '#fff';
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('我的银行卡', 40, 55);
  ctx.textAlign = 'right';
  ctx.fillText('●●●', W - 40, 55);

  // 银行卡主体（蓝紫渐变）
  var cardX = 40, cardY = 130, cardW = W - 80, cardH = 280;
  var cg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  cg.addColorStop(0, '#5b6fed');
  cg.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = cg;
  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fill();

  // 芯片
  ctx.fillStyle = '#fbbf24';
  roundRect(ctx, cardX + 40, cardY + 80, 80, 60, 8);
  ctx.fill();

  // 卡号
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(cardNumber, cardX + 40, cardY + 220);

  // 持卡人
  ctx.font = '28px sans-serif';
  ctx.fillText(name, cardX + 40, cardY + 260);

  // 余额区域
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, 40, 460, W - 80, 220, 16);
  ctx.fill();
  ctx.fillStyle = '#9ca3af';
  ctx.font = '26px sans-serif';
  ctx.fillText('账户余额 (CNY)', 70, 510);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('¥ 132,485.77', 70, 580);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '24px sans-serif';
  ctx.fillText('最近交易 →', 70, 640);

  // 下方交易列表（6 条，伪造）
  var txY = 740;
  ctx.fillStyle = '#1e5fa3';
  ctx.fillRect(0, txY, W, 60);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('最近交易', 40, txY + 40);

  var txns = [
    { d: '03-18', t: '星巴克 · 国贸店', a: '-38.00' },
    { d: '03-18', t: '美团外卖', a: '-46.50' },
    { d: '03-17', t: '转账 · 收到', a: '+5,000.00' },
    { d: '03-17', t: '京东商城', a: '-289.00' },
    { d: '03-16', t: '工资入账', a: '+12,000.00' },
    { d: '03-16', t: '滴滴出行', a: '-32.40' },
    { d: '03-15', t: '房租', a: '-4,500.00' }
  ];
  ctx.font = '26px sans-serif';
  for (var i = 0; i < txns.length; i++) {
    var yi = txY + 110 + i * 88;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(40, yi - 40, W - 80, 78);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '24px sans-serif';
    ctx.fillText(txns[i].d, 60, yi);
    ctx.fillStyle = '#fff';
    ctx.font = '28px sans-serif';
    ctx.fillText(txns[i].t, 170, yi);
    ctx.textAlign = 'right';
    ctx.fillStyle = txns[i].a.indexOf('-') === 0 ? '#ff6b6b' : '#81c784';
    ctx.fillText(txns[i].a, W - 60, yi);
    ctx.textAlign = 'left';
  }
}

/**
 * 画一张聊天记录截图
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 */
function drawChatScene(ctx, W, H) {
  // 背景：浅灰
  ctx.fillStyle = '#ededed';
  ctx.fillRect(0, 0, W, H);

  // 顶部
  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(0, 0, W, 90);
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(W, 90);
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('王总监', W / 2, 58);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#576b95';
  ctx.font = '26px sans-serif';
  ctx.fillText('< 返回', 30, 58);

  // 时间分隔
  ctx.fillStyle = '#b2b2b2';
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('今天 14:23', W / 2, 140);

  // 对话气泡
  var by = 180;
  // 对方（左边）
  drawBubble(ctx, 30, by, 720, 100, '#fff', 'left', '总监，方便发一下这个月工资卡号吗？');
  by += 140;
  // 自己（右边）
  drawBubble(ctx, W - 30 - 540, by, 540, 100, '#95ec69', 'right', '好的 6222 1234 5678 9012');
  by += 140;
  // 对方
  drawBubble(ctx, 30, by, 760, 100, '#fff', 'left', '收到，已经给你打款。');
  by += 140;
  // 自己
  drawBubble(ctx, W - 30 - 700, by, 700, 100, '#95ec69', 'right', '另外身份证我也附一张 110108 19950315 1234');
  by += 140;
  // 对方
  drawBubble(ctx, 30, by, 680, 100, '#fff', 'left', '信息已收到，财务那边处理了。');
  by += 140;
  // 自己
  drawBubble(ctx, W - 30 - 600, by, 600, 100, '#95ec69', 'right', '那麻烦您看一下');
  by += 140;
  // 对方
  drawBubble(ctx, 30, by, 820, 130, '#fff', 'left', '好的，已经到账，' + String(12000 + Math.floor(Math.random() * 200)) + ' 元请查收。');
  by += 170;
  // 自己
  drawBubble(ctx, W - 30 - 700, by, 700, 100, '#95ec69', 'right', '收到，谢谢总监！');
  by += 140;

  // 输入栏
  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(0, H - 110, W, 110);
  ctx.strokeStyle = '#d0d0d0';
  ctx.beginPath();
  ctx.moveTo(0, H - 110);
  ctx.lineTo(W, H - 110);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  roundRect(ctx, 30, H - 90, W - 200, 70, 8);
  ctx.fill();
  ctx.strokeStyle = '#d0d0d0';
  ctx.stroke();
  ctx.fillStyle = '#b2b2b2';
  ctx.font = '26px sans-serif';
  ctx.fillText('说点什么…', 60, H - 45);
  // 表情按钮
  ctx.fillStyle = '#576b95';
  ctx.font = '32px sans-serif';
  ctx.fillText('☺', W - 90, H - 45);
}

/**
 * 画一个聊天气泡
 * @param {string} align 'left' 对方 / 'right' 自己
 */
function drawBubble(ctx, x, y, w, h, fill, align, text) {
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  if (align === 'right') {
    // 自己的小三角
    ctx.beginPath();
    ctx.moveTo(x + w, y + h - 30);
    ctx.lineTo(x + w + 20, y + h - 20);
    ctx.lineTo(x + w, y + h - 10);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y + h - 30);
    ctx.lineTo(x - 20, y + h - 20);
    ctx.lineTo(x, y + h - 10);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.fillStyle = '#000';
  ctx.font = '30px sans-serif';
  // 自动换行
  var words = text.split('');
  var line = '';
  var ly = y + 50;
  var lx = align === 'right' ? x + 24 : x + 24;
  var maxW = w - 48;
  for (var i = 0; i < words.length; i++) {
    var test = line + words[i];
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      ctx.fillText(line, lx, ly);
      line = words[i];
      ly += 38;
    } else {
      line = test;
    }
  }
  if (line.length > 0) ctx.fillText(line, lx, ly);
}

/**
 * 画一张身份证（正面）
 */
function drawIdCardScene(ctx, W, H) {
  // 渐变背景
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a3a6e');
  g.addColorStop(1, '#0a1a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 身份证卡（白底圆角）
  var cx = 60, cy = 200, cw = W - 120, ch = H - 360;
  roundRect(ctx, cx, cy, cw, ch, 20);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // 顶部国徽 + 标题
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(cx + 110, cy + 90, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText('★', cx + 92, cy + 105);
  ctx.fillStyle = '#c0392b';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('中华人民共和国', cx + 190, cy + 80);
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('居民身份证', cx + 190, cy + 120);

  // 头像框
  ctx.fillStyle = '#ecf0f1';
  roundRect(ctx, cx + 40, cy + 180, 240, 320, 12);
  ctx.fill();
  // 假头像
  drawAvatar(ctx, cx + 40, cy + 180, 240, 320);

  // 右侧字段
  var fx = cx + 320;
  var fields = [
    { l: '姓名', v: '张小默' },
    { l: '性别', v: '男' },
    { l: '民族', v: '汉' },
    { l: '出生', v: '1995 年 03 月 15 日' },
    { l: '住址', v: '北京市朝阳区某某街道 12 号院 5 号楼 808 室' },
    { l: '公民身份号码', v: fakeIdNumber() }
  ];
  ctx.font = '26px sans-serif';
  for (var i = 0; i < fields.length; i++) {
    var fy = cy + 200 + i * 60;
    ctx.fillStyle = '#7f8c8d';
    ctx.fillText(fields[i].l, fx, fy);
    ctx.fillStyle = '#000';
    ctx.font = i === 5 ? 'bold 28px monospace' : '28px sans-serif';
    ctx.fillText(fields[i].v, fx, fy + 38);
    ctx.font = '26px sans-serif';
  }

  // 底部签发机关 / 有效期限
  ctx.fillStyle = '#7f8c8d';
  ctx.font = '22px sans-serif';
  ctx.fillText('签发机关：北京市公安局朝阳分局', cx + 60, cy + ch - 80);
  ctx.fillText('有效期限：2015.03.15 - 2035.03.15', cx + 60, cy + ch - 40);

  // 底部水印
  ctx.fillStyle = '#c0392b';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('仅供演示 · 内容为虚构数据', W / 2, H - 80);
  ctx.textAlign = 'left';
}

/** 假头像（极简剪影） */
function drawAvatar(ctx, x, y, w, h) {
  // 背景色
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(x, y, w, h);
  // 头
  ctx.fillStyle = '#bdc3c7';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.32, 60, 0, Math.PI * 2);
  ctx.fill();
  // 肩
  ctx.fillStyle = '#95a5a6';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.85, 130, 0, Math.PI, true);
  ctx.fill();
}

/** roundRect 兼容（部分老浏览器没有） */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ────────────────────────────────────────────────────────────
// 11. 工具：把字符串原样填进字符串（兼容低版本）
// ────────────────────────────────────────────────────────────
if (typeof String.prototype.padStart !== 'function') {
  String.prototype.padStart = function (target, pad) {
    var s = this;
    while (s.length < target) s = pad + s;
    return s;
  };
}

// ────────────────────────────────────────────────────────────
// 12. 导出
// ────────────────────────────────────────────────────────────
var PngKitAPI = {
  PNG_SIGNATURE: PNG_SIGNATURE,
  IEND_BYTES: IEND_BYTES,
  IDAT_CHUNK_SIZE: IDAT_CHUNK_SIZE,
  crc32: crc32,
  adler32: adler32,
  encodePNG: encodePNG,
  parseChunks: parseChunks,
  findResidual: findResidual,
  findChunkBoundary: findChunkBoundary,
  collectIDAT: collectIDAT,
    resyncStoredBlocks: resyncStoredBlocks,
    resyncRawMode: resyncRawMode,
    alignRows: alignRows,
    recoverResidual: recoverResidual,
    extractResidualPayload: extractResidualPayload,
  // 样本
  FAKE_NAMES: FAKE_NAMES,
  fakeCardNumber: fakeCardNumber,
  fakeIdNumber: fakeIdNumber,
  drawBankCardScene: drawBankCardScene,
  drawChatScene: drawChatScene,
  drawIdCardScene: drawIdCardScene,
  // 工具
  toUint8Array: toUint8Array,
  bytesEqual: bytesEqual,
  readUInt32BE: readUInt32BE,
  writeUInt32BE: writeUInt32BE
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PngKitAPI;
}
if (typeof window !== 'undefined') {
  window.PngKit = PngKitAPI;
}
