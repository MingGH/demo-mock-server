/**
 * engine.js - ECB 企鹅图演示核心逻辑
 *
 * 包含：AES-ECB / AES-CBC 加解密、PKCS7 填充、分块、重复块检测、像素↔字节转换
 *
 * 浏览器端使用 CryptoJS（CDN 引入，支持 ECB 模式）
 * Node 测试环境使用 Node 内置 crypto 模块
 *
 * AES 块大小固定 16 字节。图片用 RGBA（4 字节/像素），4 像素 = 1 个 AES 块。
 * 图片宽度归一化为 4 的倍数，保证总字节数是 16 的倍数，无需额外填充。
 */
(function () {
  'use strict';

  var BLOCK_SIZE = 16;
  var AES_KEY_SIZE = 16; // AES-128

  // ── 环境检测 ──
  var nodeCrypto = null;
  if (typeof module !== 'undefined' && module.exports) {
    nodeCrypto = require('crypto');
  }

  // ── CryptoJS WordArray 转换（仅浏览器端使用）──
  function bytesToWordArray(bytes) {
    var words = [];
    for (var i = 0; i < bytes.length; i++) {
      words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
    }
    if (typeof CryptoJS === 'undefined') return null;
    return CryptoJS.lib.WordArray.create(words, bytes.length);
  }

  function wordArrayToBytes(wa) {
    var bytes = new Uint8Array(wa.sigBytes);
    for (var i = 0; i < wa.sigBytes; i++) {
      bytes[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return bytes;
  }

  // ── PKCS7 填充 ──

  /**
   * PKCS7 填充
   * @param {Uint8Array} data - 原始数据
   * @returns {Uint8Array} 填充后的数据（长度为 16 的倍数）
   */
  function pkcs7Pad(data) {
    var padLen = BLOCK_SIZE - (data.length % BLOCK_SIZE);
    if (padLen === 0) padLen = BLOCK_SIZE;
    var result = new Uint8Array(data.length + padLen);
    result.set(data);
    for (var i = data.length; i < result.length; i++) {
      result[i] = padLen;
    }
    return result;
  }

  /**
   * PKCS7 去填充
   * @param {Uint8Array} data - 带填充的数据
   * @returns {Uint8Array} 去填充后的数据
   */
  function pkcs7Unpad(data) {
    if (data.length === 0) return data;
    var padLen = data[data.length - 1];
    if (padLen < 1 || padLen > BLOCK_SIZE || padLen > data.length) return data;
    // 验证填充
    for (var i = data.length - padLen; i < data.length; i++) {
      if (data[i] !== padLen) return data;
    }
    return data.slice(0, data.length - padLen);
  }

  // ── 分块操作 ──

  /**
   * 将字节数组按 16 字节切分为块数组
   * @param {Uint8Array} data - 数据（长度应为 16 的倍数）
   * @returns {Uint8Array[]} 块数组
   */
  function splitBlocks(data) {
    var count = Math.floor(data.length / BLOCK_SIZE);
    var blocks = [];
    for (var i = 0; i < count; i++) {
      blocks.push(data.slice(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE));
    }
    return blocks;
  }

  /**
   * 将块数组合并为字节数组
   * @param {Uint8Array[]} blocks - 块数组
   * @returns {Uint8Array} 合并后的字节数组
   */
  function joinBlocks(blocks) {
    var total = blocks.length * BLOCK_SIZE;
    var result = new Uint8Array(total);
    for (var i = 0; i < blocks.length; i++) {
      result.set(blocks[i], i * BLOCK_SIZE);
    }
    return result;
  }

  // ── 重复块检测 ──

  /**
   * 检测数据中的重复 16 字节块
   * @param {Uint8Array} data - 数据
   * @returns {{ groups: Object, duplicateCount: number, totalBlocks: number, uniqueBlocks: number, duplicateIndices: number[] }}
   *   groups: { hexHash: { count: number, firstIndex: number, indices: number[] } }
   */
  function detectDuplicateBlocks(data) {
    var totalBlocks = Math.floor(data.length / BLOCK_SIZE);
    var groups = {};
    var duplicateIndices = [];

    for (var i = 0; i < totalBlocks; i++) {
      var offset = i * BLOCK_SIZE;
      // 用块内容生成 hash key（hex 字符串）
      var hex = '';
      for (var j = 0; j < BLOCK_SIZE; j++) {
        hex += (data[offset + j] < 16 ? '0' : '') + data[offset + j].toString(16);
      }
      if (!groups[hex]) {
        groups[hex] = { count: 0, firstIndex: i, indices: [] };
      }
      groups[hex].count++;
      groups[hex].indices.push(i);
      if (groups[hex].count > 1) {
        duplicateIndices.push(i);
      }
    }

    var uniqueBlocks = 0;
    var duplicateCount = 0;
    var key;
    for (key in groups) {
      if (groups.hasOwnProperty(key)) {
        uniqueBlocks++;
        if (groups[key].count > 1) {
          duplicateCount += groups[key].count;
        }
      }
    }

    return {
      groups: groups,
      duplicateCount: duplicateCount,
      totalBlocks: totalBlocks,
      uniqueBlocks: uniqueBlocks,
      duplicateIndices: duplicateIndices
    };
  }

  // ── 像素 ↔ 字节转换 ──

  /**
   * 将 ImageData（RGBA）转换为字节（直接取 data 字段）
   * @param {{ data: Uint8Array|Uint8ClampedArray, width: number, height: number }} imageData
   * @returns {Uint8Array}
   */
  function imageDataToBytes(imageData) {
    return new Uint8Array(imageData.data);
  }

  /**
   * 将字节转换为 ImageData 兼容对象（RGBA）
   * @param {Uint8Array} bytes - 字节数据
   * @param {number} width - 图像宽度（像素）
   * @param {number} height - 图像高度（像素）
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function bytesToImageData(bytes, width, height) {
    var expected = width * height * 4;
    var data = new Uint8ClampedArray(expected);
    // 如果字节数不够，剩余部分用 0 填充；如果超出，截断
    var copyLen = Math.min(bytes.length, expected);
    for (var i = 0; i < copyLen; i++) {
      data[i] = bytes[i];
    }
    return { data: data, width: width, height: height };
  }

  /**
   * 将宽度归一化为 4 的倍数（保证 RGBA 行字节数是 16 的倍数）
   * @param {number} width
   * @returns {number}
   */
  function normalizeWidth(width) {
    return Math.max(4, Math.floor(width / 4) * 4);
  }

  /**
   * 将块索引转换为像素坐标区域（用于可视化高亮）
   * 每个块 = 4 个 RGBA 像素 = 4 个水平像素
   * @param {number} blockIndex - 块索引
   * @param {number} width - 图像宽度（像素）
   * @returns {{ x: number, y: number, w: number, h: number }} 像素坐标
   */
  function blockToPixelRect(blockIndex, width) {
    var pixelsPerBlock = BLOCK_SIZE / 4; // 4 像素/块
    var blocksPerRow = width / pixelsPerBlock;
    var row = Math.floor(blockIndex / blocksPerRow);
    var col = blockIndex % blocksPerRow;
    return {
      x: col * pixelsPerBlock,
      y: row,
      w: pixelsPerBlock,
      h: 1
    };
  }

  // ── 色彩量化（减少颜色数，增强 ECB 效果）──

  /**
   * 对 ImageData 进行色彩量化（每通道减少到 levels 级）
   * @param {{ data: Uint8Array|Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number} levels - 每通道量化级数（2 = 每通道 2 级 = 8 色）
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function quantizeColors(imageData, levels) {
    var data = new Uint8ClampedArray(imageData.data);
    var scale = 255 / (levels - 1);
    for (var i = 0; i < data.length; i += 4) {
      data[i] = Math.round(Math.round(data[i] / scale) * scale);
      data[i + 1] = Math.round(Math.round(data[i + 1] / scale) * scale);
      data[i + 2] = Math.round(Math.round(data[i + 2] / scale) * scale);
      // Alpha 保持不变
    }
    return { data: data, width: imageData.width, height: imageData.height };
  }

  // ── AES 密钥 ──

  /**
   * 生成随机 AES-128 密钥
   * @returns {Uint8Array} 16 字节密钥
   */
  function generateAesKey() {
    if (nodeCrypto) {
      return new Uint8Array(nodeCrypto.randomBytes(AES_KEY_SIZE));
    }
    return crypto.getRandomValues(new Uint8Array(AES_KEY_SIZE));
  }

  /**
   * 生成随机 IV（CBC 模式用）
   * @returns {Uint8Array} 16 字节 IV
   */
  function generateIV() {
    if (nodeCrypto) {
      return new Uint8Array(nodeCrypto.randomBytes(BLOCK_SIZE));
    }
    return crypto.getRandomValues(new Uint8Array(BLOCK_SIZE));
  }

  // ── AES-ECB 加解密 ──

  /**
   * AES-ECB 加密（每块独立加密，相同明文块 -> 相同密文块）
   * @param {Uint8Array} rawKey - 16 字节密钥
   * @param {Uint8Array} data - 明文数据（长度需为 16 的倍数）
   * @returns {Uint8Array} 密文
   */
  function encryptECB(rawKey, data) {
    if (data.length % BLOCK_SIZE !== 0) {
      throw new Error('ECB 加密要求数据长度是 16 的倍数，当前: ' + data.length);
    }

    if (nodeCrypto) {
      var key = Buffer.from(rawKey);
      var cipher = nodeCrypto.createCipheriv('aes-' + (key.length * 8) + '-ecb', key, null);
      cipher.setAutoPadding(false);
      return new Uint8Array(Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]));
    }

    // 浏览器端：CryptoJS
    var keyWA = bytesToWordArray(rawKey);
    var dataWA = bytesToWordArray(data);
    var encrypted = CryptoJS.AES.encrypt(dataWA, keyWA, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding
    });
    return wordArrayToBytes(encrypted.ciphertext);
  }

  /**
   * AES-ECB 解密
   * @param {Uint8Array} rawKey - 16 字节密钥
   * @param {Uint8Array} data - 密文数据
   * @returns {Uint8Array} 明文
   */
  function decryptECB(rawKey, data) {
    if (data.length % BLOCK_SIZE !== 0) {
      throw new Error('ECB 解密要求数据长度是 16 的倍数，当前: ' + data.length);
    }

    if (nodeCrypto) {
      var key = Buffer.from(rawKey);
      var decipher = nodeCrypto.createDecipheriv('aes-' + (key.length * 8) + '-ecb', key, null);
      decipher.setAutoPadding(false);
      return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]));
    }

    var keyWA = bytesToWordArray(rawKey);
    var dataWA = bytesToWordArray(data);
    var decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext: dataWA }),
      keyWA,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding
      }
    );
    return wordArrayToBytes(decrypted);
  }

  // ── AES-CBC 加解密 ──

  /**
   * AES-CBC 加密（块间链接，相同明文块 -> 不同密文块）
   * @param {Uint8Array} rawKey - 16 字节密钥
   * @param {Uint8Array} data - 明文数据
   * @param {Uint8Array} iv - 16 字节初始化向量
   * @returns {Uint8Array} 密文
   */
  function encryptCBC(rawKey, data, iv) {
    if (data.length % BLOCK_SIZE !== 0) {
      throw new Error('CBC 加密要求数据长度是 16 的倍数，当前: ' + data.length);
    }

    if (nodeCrypto) {
      var key = Buffer.from(rawKey);
      var cipher = nodeCrypto.createCipheriv('aes-' + (key.length * 8) + '-cbc', key, Buffer.from(iv));
      cipher.setAutoPadding(false);
      return new Uint8Array(Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]));
    }

    var keyWA = bytesToWordArray(rawKey);
    var ivWA = bytesToWordArray(iv);
    var dataWA = bytesToWordArray(data);
    var encrypted = CryptoJS.AES.encrypt(dataWA, keyWA, {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding,
      iv: ivWA
    });
    return wordArrayToBytes(encrypted.ciphertext);
  }

  /**
   * AES-CBC 解密
   * @param {Uint8Array} rawKey - 16 字节密钥
   * @param {Uint8Array} data - 密文数据
   * @param {Uint8Array} iv - 16 字节初始化向量
   * @returns {Uint8Array} 明文
   */
  function decryptCBC(rawKey, data, iv) {
    if (data.length % BLOCK_SIZE !== 0) {
      throw new Error('CBC 解密要求数据长度是 16 的倍数，当前: ' + data.length);
    }

    if (nodeCrypto) {
      var key = Buffer.from(rawKey);
      var decipher = nodeCrypto.createDecipheriv('aes-' + (key.length * 8) + '-cbc', key, Buffer.from(iv));
      decipher.setAutoPadding(false);
      return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]));
    }

    var keyWA = bytesToWordArray(rawKey);
    var ivWA = bytesToWordArray(iv);
    var dataWA = bytesToWordArray(data);
    var decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext: dataWA }),
      keyWA,
      {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.NoPadding,
        iv: ivWA
      }
    );
    return wordArrayToBytes(decrypted);
  }

  // ── 辅助：Uint8Array 转十六进制字符串 ──
  function toHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return hex;
  }

  // ── 导出 ──
  var api = {
    BLOCK_SIZE: BLOCK_SIZE,
    AES_KEY_SIZE: AES_KEY_SIZE,
    pkcs7Pad: pkcs7Pad,
    pkcs7Unpad: pkcs7Unpad,
    splitBlocks: splitBlocks,
    joinBlocks: joinBlocks,
    detectDuplicateBlocks: detectDuplicateBlocks,
    imageDataToBytes: imageDataToBytes,
    bytesToImageData: bytesToImageData,
    normalizeWidth: normalizeWidth,
    blockToPixelRect: blockToPixelRect,
    quantizeColors: quantizeColors,
    generateAesKey: generateAesKey,
    generateIV: generateIV,
    encryptECB: encryptECB,
    decryptECB: decryptECB,
    encryptCBC: encryptCBC,
    decryptCBC: decryptCBC,
    toHex: toHex
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ECBEngine = api;
  }
})();
