/**
 * engine.js — HTTP 文本 vs 二进制传输对比的核心逻辑
 * 纯函数，不操作 DOM，可在浏览器和 Node.js 中运行。
 *
 * 导出函数：
 *   formatHex(bytes)       — 将字节数组格式化为 hexdump 样式的字符串
 *   formatBytes(n)         — 将字节数格式化为人类可读字符串
 *   getByteLength(str)     — 获取 UTF-8 字符串的字节长度
 *   gzipSize(data)         — 对字符串或 Uint8Array 做真实 gzip 压缩，返回压缩后字节数
 *   benchmark(fn, runs)    — 多次执行函数并返回平均耗时(ms)
 */

(function () {
  'use strict';

  /**
   * 将一个 Uint8Array（或普通数组）格式化为类似 hexdump -C 的十六进制视图。
   * @param {Uint8Array|Array<number>} bytes
   * @param {number} [bytesPerLine=16] 每行显示的字节数
   * @returns {string} 多行格式化的 HEX 字符串
   */
  function formatHex(bytes, bytesPerLine) {
    bytesPerLine = bytesPerLine || 16;
    var len = bytes.length;
    var lines = [];
    for (var offset = 0; offset < len; offset += bytesPerLine) {
      var hexPart = '';
      var asciiPart = '';
      for (var i = 0; i < bytesPerLine; i++) {
        var idx = offset + i;
        if (idx < len) {
          var b = bytes[idx];
          hexPart += (b < 16 ? '0' : '') + b.toString(16) + ' ';
          asciiPart += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          hexPart += '   ';
          asciiPart += ' ';
        }
      }
      var offsetStr = ('00000000' + offset.toString(16)).slice(-8);
      lines.push(offsetStr + ': ' + hexPart + ' |' + asciiPart + '|');
    }
    return lines.join('\n');
  }

  /**
   * 将字节数格式化为人类可读的字符串（B / KB / MB）。
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * 获取字符串的 UTF-8 字节长度。
   * @param {string} str
   * @returns {number}
   */
  function getByteLength(str) {
    // 使用 Blob 计算，浏览器兼容；Node 下也可用 Buffer
    if (typeof Blob !== 'undefined') {
      return new Blob([str]).size;
    }
    // Node.js fallback
    if (typeof Buffer !== 'undefined') {
      return Buffer.byteLength(str, 'utf8');
    }
    // 最差方案的近似
    return unescape(encodeURIComponent(str)).length;
  }

  /**
   * 多次执行一个函数并返回平均耗时（毫秒）。
   * @param {function} fn
   * @param {number} [runs=10]
   * @returns {{ avg: number, min: number, max: number }}
   */
  function benchmark(fn, runs) {
    runs = runs || 10;
    var times = [];
    for (var i = 0; i < runs; i++) {
      var start = performance ? performance.now() : Date.now();
      fn();
      var end = performance ? performance.now() : Date.now();
      times.push(end - start);
    }
    var sum = 0;
    var min = times[0];
    var max = times[0];
    for (var j = 0; j < times.length; j++) {
      sum += times[j];
      if (times[j] < min) min = times[j];
      if (times[j] > max) max = times[j];
    }
    return { avg: sum / times.length, min: min, max: max };
  }

  /**
   * 对字符串或 Uint8Array 做真实 gzip 压缩，返回压缩后的字节数。
   * 依赖全局 pako 库（通过 CDN <script> 加载）。
   * @param {string|Uint8Array} data
   * @returns {number|null} 压缩后字节数，pako 不可用时返回 null
   */
  function gzipSize(data) {
    if (typeof pako === 'undefined') return 0;
    if (data == null || (typeof data === 'string' && data.length === 0)) return 0;
    var input;
    if (typeof data === 'string') {
      var utf8 = unescape(encodeURIComponent(data));
      input = new Uint8Array(utf8.length);
      for (var i = 0; i < utf8.length; i++) {
        input[i] = utf8.charCodeAt(i);
      }
    } else if (data.length != null) {
      input = data;
    } else {
      return 0;
    }
    try {
      var compressed = pako.gzip(input);
      return compressed ? compressed.length : 0;
    } catch (e) {
      return 0;
    }
  }

  // -- 导出 --
  var exports = {
    formatHex: formatHex,
    formatBytes: formatBytes,
    getByteLength: getByteLength,
    gzipSize: gzipSize,
    benchmark: benchmark
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.HttpBinaryEngine = exports;
  }
})();
