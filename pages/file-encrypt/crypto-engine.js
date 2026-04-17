/**
 * crypto-engine.js — 浏览器端文件加密/解密核心逻辑（支持 GB 级大文件）
 *
 * 算法：AES-256-GCM（分块加密，每块独立 IV + AuthTag）
 * 密钥派生：PBKDF2 (SHA-256, 100000 iterations)
 *
 * 文件格式 v2：
 *   [Magic 4B "ENC2"] [Salt 16B] [ChunkSize 4B (uint32 BE)]
 *   [Chunk0: IV 12B + Ciphertext + AuthTag 16B]
 *   [Chunk1: IV 12B + Ciphertext + AuthTag 16B]
 *   ...
 *
 * 每个 chunk 独立加密，内存占用 ≈ CHUNK_SIZE × 2
 * 默认 CHUNK_SIZE = 16MB，可处理任意大小文件
 */
(function () {
  'use strict';

  var MAGIC = new Uint8Array([0x45, 0x4E, 0x43, 0x32]); // "ENC2"
  var MAGIC_V1_ABSENT = true; // v1 没有 magic，用于兼容检测
  var SALT_LENGTH = 16;
  var IV_LENGTH = 12;
  var AUTH_TAG_LENGTH = 16;
  var PBKDF2_ITERATIONS = 100000;
  var KEY_LENGTH = 256; // bits
  var CHUNK_SIZE = 16 * 1024 * 1024; // 16MB per chunk
  var HEADER_SIZE = 4 + SALT_LENGTH + 4; // magic + salt + chunkSize

  /**
   * 从密码和 salt 派生 AES-256 密钥
   */
  async function deriveKey(password, salt) {
    var encoder = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 为每个 chunk 生成唯一 IV
   * 基于 base IV + chunk index，避免 IV 重用
   */
  function deriveChunkIV(chunkIndex) {
    var iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    return iv;
  }

  /**
   * 分块加密文件（流式，支持 GB 级）
   * @param {File} file - File 对象（不是 ArrayBuffer）
   * @param {string} password
   * @param {function} onProgress - (pct 0~1, msg, speed)
   * @returns {Promise<Blob>} 加密后的 Blob
   */
  async function encryptFile(file, password, onProgress) {
    var totalSize = file.size;
    var totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;

    if (onProgress) onProgress(0.05, '生成随机盐值…', '');

    var salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

    if (onProgress) onProgress(0.1, '派生加密密钥（PBKDF2 × 100,000）…', '');

    var key = await deriveKey(password, salt);

    if (onProgress) onProgress(0.15, '开始分块加密…', '');

    // 构建 header
    var header = new Uint8Array(HEADER_SIZE);
    header.set(MAGIC, 0);
    header.set(salt, 4);
    // 写入 chunkSize (uint32 big-endian)
    var csView = new DataView(header.buffer, 4 + SALT_LENGTH, 4);
    csView.setUint32(0, CHUNK_SIZE, false);

    var parts = [header];
    var processedBytes = 0;
    var startTime = Date.now();

    for (var i = 0; i < totalChunks; i++) {
      var offset = i * CHUNK_SIZE;
      var end = Math.min(offset + CHUNK_SIZE, totalSize);
      var chunkBlob = file.slice(offset, end);
      var chunkData = await chunkBlob.arrayBuffer();

      var iv = deriveChunkIV(i);

      var encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        chunkData
      );

      // 每个 chunk: [IV 12B] [ciphertext + authTag]
      var chunkOut = new Uint8Array(IV_LENGTH + encrypted.byteLength);
      chunkOut.set(iv, 0);
      chunkOut.set(new Uint8Array(encrypted), IV_LENGTH);
      parts.push(chunkOut);

      processedBytes = end;
      var pct = 0.15 + 0.83 * (processedBytes / totalSize);
      var elapsed = (Date.now() - startTime) / 1000;
      var speed = elapsed > 0 ? processedBytes / elapsed : 0;
      var remaining = speed > 0 ? (totalSize - processedBytes) / speed : 0;

      if (onProgress) {
        onProgress(
          pct,
          '加密中… 块 ' + (i + 1) + '/' + totalChunks,
          formatSpeed(speed) + (remaining > 0 ? '  剩余 ' + formatTime(remaining) : '')
        );
      }
    }

    if (onProgress) onProgress(0.98, '打包输出…', '');

    var blob = new Blob(parts, { type: 'application/octet-stream' });

    if (onProgress) {
      var totalElapsed = (Date.now() - startTime) / 1000;
      onProgress(1.0, '完成', '总耗时 ' + formatTime(totalElapsed) + '  平均 ' + formatSpeed(totalSize / totalElapsed));
    }

    return blob;
  }

  /**
   * 检测文件格式版本
   */
  function detectVersion(headerBytes) {
    if (headerBytes.length >= 4 &&
        headerBytes[0] === 0x45 && headerBytes[1] === 0x4E &&
        headerBytes[2] === 0x43 && headerBytes[3] === 0x32) {
      return 2;
    }
    return 1; // v1: [Salt 16B] [IV 12B] [Ciphertext + AuthTag]
  }

  /**
   * 分块解密文件（流式，支持 GB 级）
   * @param {File} file - File 对象
   * @param {string} password
   * @param {function} onProgress
   * @returns {Promise<Blob>}
   */
  async function decryptFile(file, password, onProgress) {
    var totalSize = file.size;

    if (totalSize < HEADER_SIZE) {
      // 可能是 v1 格式，尝试 v1 解密
      return decryptFileV1(file, password, onProgress);
    }

    // 读取头部判断版本
    var headerBlob = file.slice(0, HEADER_SIZE);
    var headerBuf = new Uint8Array(await headerBlob.arrayBuffer());
    var version = detectVersion(headerBuf);

    if (version === 1) {
      return decryptFileV1(file, password, onProgress);
    }

    // v2 分块解密
    var salt = headerBuf.slice(4, 4 + SALT_LENGTH);
    var csView = new DataView(headerBuf.buffer, 4 + SALT_LENGTH, 4);
    var chunkSize = csView.getUint32(0, false);

    if (onProgress) onProgress(0.1, '派生解密密钥（PBKDF2 × 100,000）…', '');

    var key = await deriveKey(password, salt);

    if (onProgress) onProgress(0.15, '开始分块解密…', '');

    var dataStart = HEADER_SIZE;
    var dataSize = totalSize - dataStart;
    // 每个加密 chunk 的大小 = IV + chunkSize + AuthTag
    var encChunkSize = IV_LENGTH + chunkSize + AUTH_TAG_LENGTH;
    // 最后一个 chunk 可能更小
    var parts = [];
    var offset = dataStart;
    var chunkIndex = 0;
    var processedBytes = 0;
    var startTime = Date.now();
    var totalDataSize = totalSize - dataStart;

    try {
      while (offset < totalSize) {
        var remaining = totalSize - offset;
        // 读取一个 chunk（可能是最后一个，比 encChunkSize 小）
        var readSize = Math.min(remaining, encChunkSize);
        var chunkBlob = file.slice(offset, offset + readSize);
        var chunkBuf = new Uint8Array(await chunkBlob.arrayBuffer());

        if (chunkBuf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
          // 太小，不是有效 chunk（除非是空文件的 chunk）
          if (chunkBuf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
            throw new Error('文件格式损坏：chunk ' + chunkIndex + ' 太小');
          }
        }

        var iv = chunkBuf.slice(0, IV_LENGTH);
        var ciphertext = chunkBuf.slice(IV_LENGTH);

        var decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv },
          key,
          ciphertext
        );

        parts.push(new Uint8Array(decrypted));

        offset += readSize;
        processedBytes += readSize;
        chunkIndex++;

        var pct = 0.15 + 0.83 * (processedBytes / totalDataSize);
        var elapsed = (Date.now() - startTime) / 1000;
        var speed = elapsed > 0 ? processedBytes / elapsed : 0;
        var eta = speed > 0 ? (totalDataSize - processedBytes) / speed : 0;

        if (onProgress) {
          onProgress(
            pct,
            '解密中… 块 ' + chunkIndex,
            formatSpeed(speed) + (eta > 0 ? '  剩余 ' + formatTime(eta) : '')
          );
        }
      }
    } catch (e) {
      if (e.message && e.message.indexOf('文件格式') !== -1) throw e;
      throw new Error('解密失败：密码错误或文件已损坏');
    }

    if (onProgress) {
      var totalElapsed = (Date.now() - startTime) / 1000;
      onProgress(1.0, '完成', '总耗时 ' + formatTime(totalElapsed));
    }

    return new Blob(parts, { type: 'application/octet-stream' });
  }

  /**
   * v1 格式解密（兼容旧文件）
   * 文件格式：[Salt 16B] [IV 12B] [Ciphertext + AuthTag]
   */
  async function decryptFileV1(file, password, onProgress) {
    var totalSize = file.size;
    var minSize = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;

    if (totalSize < minSize) {
      throw new Error('文件太小，不是有效的加密文件');
    }

    if (onProgress) onProgress(0.1, '检测到 v1 格式，读取文件…', '');

    var data = new Uint8Array(await file.arrayBuffer());
    var salt = data.slice(0, SALT_LENGTH);
    var iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    var ciphertext = data.slice(SALT_LENGTH + IV_LENGTH);

    if (onProgress) onProgress(0.3, '派生解密密钥…', '');

    var key = await deriveKey(password, salt);

    if (onProgress) onProgress(0.5, '解密中…', '');

    try {
      var decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );

      if (onProgress) onProgress(1.0, '完成', '');
      return new Blob([decrypted], { type: 'application/octet-stream' });
    } catch (e) {
      throw new Error('解密失败：密码错误或文件已损坏');
    }
  }

  /**
   * 评估密码强度
   */
  function evaluatePassword(password) {
    if (!password) {
      return { score: 0, level: 'none', text: '', crackTime: '' };
    }

    var length = password.length;
    var hasLower = /[a-z]/.test(password);
    var hasUpper = /[A-Z]/.test(password);
    var hasDigit = /\d/.test(password);
    var hasSpecial = /[^a-zA-Z0-9]/.test(password);

    var charsetSize = 0;
    if (hasLower) charsetSize += 26;
    if (hasUpper) charsetSize += 26;
    if (hasDigit) charsetSize += 10;
    if (hasSpecial) charsetSize += 33;
    if (charsetSize === 0) charsetSize = 26;

    var entropy = length * Math.log2(charsetSize);
    var secondsToCrack = Math.pow(2, entropy) / 1e9;

    var crackTime;
    if (secondsToCrack < 1) crackTime = '不到 1 秒';
    else if (secondsToCrack < 60) crackTime = Math.round(secondsToCrack) + ' 秒';
    else if (secondsToCrack < 3600) crackTime = Math.round(secondsToCrack / 60) + ' 分钟';
    else if (secondsToCrack < 86400) crackTime = Math.round(secondsToCrack / 3600) + ' 小时';
    else if (secondsToCrack < 86400 * 365) crackTime = Math.round(secondsToCrack / 86400) + ' 天';
    else if (secondsToCrack < 86400 * 365 * 1e6) crackTime = Math.round(secondsToCrack / (86400 * 365)) + ' 年';
    else if (secondsToCrack < 86400 * 365 * 1e9) crackTime = (secondsToCrack / (86400 * 365 * 1e6)).toFixed(1) + ' 百万年';
    else crackTime = '宇宙热寂也破不完';

    var score, level, text;
    if (entropy < 28) {
      score = 15; level = 'weak'; text = '很弱';
    } else if (entropy < 36) {
      score = 30; level = 'weak'; text = '弱';
    } else if (entropy < 50) {
      score = 50; level = 'medium'; text = '一般';
    } else if (entropy < 70) {
      score = 75; level = 'strong'; text = '强';
    } else {
      score = 100; level = 'very-strong'; text = '非常强';
    }

    return { score: score, level: level, text: text, crackTime: crackTime, entropy: Math.round(entropy) };
  }

  /**
   * 格式化文件大小
   */
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  /**
   * 格式化速度
   */
  function formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) return Math.round(bytesPerSec) + ' B/s';
    if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    if (bytesPerSec < 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
    return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(2) + ' GB/s';
  }

  /**
   * 格式化时间
   */
  function formatTime(seconds) {
    if (seconds < 1) return '不到 1 秒';
    if (seconds < 60) return Math.round(seconds) + ' 秒';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' 分 ' + Math.round(seconds % 60) + ' 秒';
    return Math.floor(seconds / 3600) + ' 小时 ' + Math.round((seconds % 3600) / 60) + ' 分';
  }

  // 导出
  window.CryptoEngine = {
    encryptFile: encryptFile,
    decryptFile: decryptFile,
    evaluatePassword: evaluatePassword,
    formatSize: formatSize,
    formatSpeed: formatSpeed,
    formatTime: formatTime,
    SALT_LENGTH: SALT_LENGTH,
    IV_LENGTH: IV_LENGTH,
    AUTH_TAG_LENGTH: AUTH_TAG_LENGTH,
    PBKDF2_ITERATIONS: PBKDF2_ITERATIONS,
    CHUNK_SIZE: CHUNK_SIZE,
    HEADER_SIZE: HEADER_SIZE
  };

})();
