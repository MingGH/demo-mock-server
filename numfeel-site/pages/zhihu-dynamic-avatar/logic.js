/**
 * 知乎动态头像注入器 —— 纯逻辑层
 * 不依赖 DOM，可在 Node 中直接测试。
 */

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 字节数组 → base64 文本（纯 JS 实现，浏览器 / Node 通用）
 * @param {Uint8Array|ArrayBuffer} data 原始字节
 * @returns {string} base64 文本
 */
function bufferToBase64(data) {
  var u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  var out = '';
  var i = 0;
  for (; i + 2 < u8.length; i += 3) {
    var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] +
           B64_CHARS[(n >> 6) & 63] + B64_CHARS[n & 63];
  }
  var rem = u8.length % 3;
  if (rem === 1) {
    var n1 = u8[u8.length - 1] << 16;
    out += B64_CHARS[(n1 >> 18) & 63] + B64_CHARS[(n1 >> 12) & 63] + '==';
  } else if (rem === 2) {
    var n2 = (u8[u8.length - 2] << 16) | (u8[u8.length - 1] << 8);
    out += B64_CHARS[(n2 >> 18) & 63] + B64_CHARS[(n2 >> 12) & 63] +
           B64_CHARS[(n2 >> 6) & 63] + '=';
  }
  return out;
}

/**
 * base64 文本 → 字节数组（依赖环境自带的 atob）
 * @param {string} b64 base64 文本（可带 data: 前缀）
 * @returns {Uint8Array} 原始字节
 */
function base64ToBytes(b64) {
  var clean = b64.indexOf(',') >= 0 ? b64.split(',').pop() : b64;
  var bin = atob(clean);
  var u8 = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/**
 * 计算 n 字节编码成 base64 后的字符数
 * @param {number} byteLength 原始字节数
 * @returns {number} base64 字符数
 */
function base64Length(byteLength) {
  return 4 * Math.ceil(byteLength / 3);
}

/**
 * 人性化文件大小
 * @param {number} n 字节数
 * @returns {string} 如「832 B」「46.5 KB」「2.1 MB」
 */
function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * 文件大小分桶（埋点用，不记录精确值）
 * @param {number} bytes 字节数
 * @returns {string} 桶名
 */
function sizeBucket(bytes) {
  if (bytes < 200 * 1024) return '<200k';
  if (bytes < 500 * 1024) return '200-500k';
  if (bytes < 1024 * 1024) return '500k-1m';
  if (bytes < 2 * 1024 * 1024) return '1-2m';
  return '>2m';
}

/**
 * file.type 为空时按扩展名兜底猜 MIME
 * @param {string} name 文件名
 * @returns {string} MIME，猜不到返回空串
 */
function guessMime(name) {
  var ext = (name.split('.').pop() || '').toLowerCase();
  var map = { webp: 'image/webp', gif: 'image/gif', png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  return map[ext] || '';
}

/**
 * 从文件头检测是不是动图
 * @param {Uint8Array} u8 文件前若干字节
 * @param {string} mime MIME 类型
 * @returns {boolean} 是否带动画
 */
function detectAnimation(u8, mime) {
  function ascii(start, len) {
    var s = '';
    for (var i = start; i < start + len && i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
  function hasMarker(mark, from, to) {
    var end = Math.min(u8.length - mark.length, to);
    for (var i = from; i <= end; i++) {
      var hit = true;
      for (var j = 0; j < mark.length; j++) {
        if (u8[i + j] !== mark.charCodeAt(j)) { hit = false; break; }
      }
      if (hit) return true;
    }
    return false;
  }
  if (mime === 'image/gif') return ascii(0, 3) === 'GIF';
  if (mime === 'image/webp') {
    // RIFF....WEBP，动图带 ANIM 块，一般出现在前 64 字节内
    return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP' && hasMarker('ANIM', 12, 128);
  }
  if (mime === 'image/png' || mime === 'image/apng') {
    // APNG 带 acTL 块，必在 IDAT 之前
    return hasMarker('acTL', 8, 4096);
  }
  return false;
}

/**
 * 校验用户选的文件适不适合做动态头像
 * @param {{size:number, type:string}} file 文件信息
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 */
function validateAvatarFile(file) {
  var errors = [];
  var warnings = [];
  var type = file.type || '';
  var size = file.size || 0;

  if (size === 0) errors.push('文件是空的，换一张试试');

  if (type === 'image/webp') {
    // 最推荐的格式
  } else if (type === 'image/gif') {
    warnings.push('gif 体积通常偏大，建议转成 webp 再注入');
  } else if (type === 'image/png' || type === 'image/apng') {
    errors.push('PNG 会被知乎管线重绘成静态图，请改用 webp 或 gif');
  } else if (type.indexOf('image/') === 0) {
    errors.push('这个格式不会动，请用动态 webp 或 gif');
  } else {
    errors.push('不是图片文件，请用动态 webp 或 gif');
  }

  if (size > 5 * 1024 * 1024) {
    if (type === 'image/gif') {
      // gif 还有转换减体积的补救路径，降级为警告
      warnings.push('超过 5MB，先点「转成 webp」减体积，否则知乎可能拒收');
    } else {
      errors.push('文件超过 5MB，脚本会太长，知乎也可能拒收');
    }
  } else if (size > 1024 * 1024) {
    warnings.push('超过 1MB，注入脚本会很长，建议先压缩');
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/**
 * 生成粘贴到知乎控制台的注入脚本
 * 原理：知乎保存头像时走 canvas.toBlob 截第一帧，
 * 这里把 toBlob 的返回值偷换成完整动图的 Blob。
 * @param {{base64:string, mime:string}} opts 动图的 base64 与 MIME
 * @returns {string} 可直接粘贴执行的 JS 源码
 */
function buildInjectionScript(opts) {
  var dataUrl = 'data:' + opts.mime + ';base64,' + opts.base64;
  return [
    '(function () {',
    "  'use strict';",
    "  var RAW = '" + dataUrl + "';",
    '  function base64ToBlob(dataUrl) {',
    "    var parts = dataUrl.split(';base64,');",
    "    var contentType = parts[0].split(':')[1];",
    '    var raw = window.atob(parts[1]);',
    '    var arr = new Uint8Array(raw.length);',
    '    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);',
    '    return new Blob([arr], { type: contentType });',
    '  }',
    '  var myBlob = base64ToBlob(RAW);',
    '  if (!window.__origToBlob) {',
    '    window.__origToBlob = HTMLCanvasElement.prototype.toBlob;',
    '    window.__origToDataURL = HTMLCanvasElement.prototype.toDataURL;',
    '  }',
    '  HTMLCanvasElement.prototype.toBlob = function (callback) {',
    "    console.log('[动态头像] toBlob 已拦截，换成你的动图（' + myBlob.size + ' 字节）');",
    '    callback(myBlob);',
    '  };',
    '  HTMLCanvasElement.prototype.toDataURL = function () {',
    '    return RAW;',
    '  };',
    '  window.__restoreAvatarUpload = function () {',
    '    if (window.__origToBlob) {',
    '      HTMLCanvasElement.prototype.toBlob = window.__origToBlob;',
    '      HTMLCanvasElement.prototype.toDataURL = window.__origToDataURL;',
    '    }',
    "    console.log('[动态头像] 已还原原生上传');",
    '  };',
    "  console.log('[动态头像] 注入成功！去正常换头像，随便传一张图，保存时会被换成你的动图');",
    "  console.log('[动态头像] 刷新页面自动失效；手动还原执行 __restoreAvatarUpload()');",
    '})();',
    ''
  ].join('\n');
}

/**
 * 判断模拟上传的结果是不是原动图（按大小 + 类型粗判）
 * @param {{size:number, type:string}} a 上传结果
 * @param {{size:number, type:string}} b 原文件
 * @returns {boolean}
 */
function blobsLikelyEqual(a, b) {
  return !!a && !!b && a.size === b.size && a.type === b.type;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    bufferToBase64: bufferToBase64,
    base64ToBytes: base64ToBytes,
    base64Length: base64Length,
    formatBytes: formatBytes,
    sizeBucket: sizeBucket,
    guessMime: guessMime,
    detectAnimation: detectAnimation,
    validateAvatarFile: validateAvatarFile,
    buildInjectionScript: buildInjectionScript,
    blobsLikelyEqual: blobsLikelyEqual
  };
}
