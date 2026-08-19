/**
 * engine.js — 「为什么传文件要用 multipart/form-data」核心逻辑
 * 纯函数，不操作 DOM，可在浏览器和 Node.js 中运行。
 *
 * 想回答的知乎问题：为什么传文件要用 multipart/form-data，而不是直接把整个文件塞进 body？
 * 答案指向一个事实——multipart 是一种「打包协议」：
 *   在单条 body 里，用 boundary 把文件、文件名、Content-Type、普通表单字段打包成一个个 part，
 *   服务端照边界一个个解开。而裸 body（application/octet-stream）只是一个没有结构的纯字节流，
 *   既带不了元数据，也没法在同一请求里放多个文件 + 字段。
 *
 * 导出函数：
 *   encodeMultipart(fields, files, boundary)
 *        — 把一个或多个文件 + 普通字段打包成 multipart/form-data 线格式（返回文本与字节数）
 *   encodeRawBody(data)       — 直接把一块数据当作 application/octet-stream 裸 body
 *   decodeMultipart(text, boundary)
 *        — 按 boundary 把打包结果解回 { fields, files }（无损往返验证）
 *   parseContentDisposition(header)
 *        — 解析 "form-data; name=xx; filename=yy" 这类头
 *   boundaryOf(contentType)   — 从请求头 Content-Type 里取出 boundary
 *   utf8ByteLength(str)       — UTF-8 字节长度
 *   formatBytes(n)            — 人类可读字节数
 *   tokenize(body, boundary)  — 把打包后的 body 拆成高亮 token（boundary / 头 / 负载 / 结束符）
 */

(function () {
  'use strict';

  /** 默认 boundary（仅当调用方未提供时使用）。 */
  var DEFAULT_BOUNDARY = '----NumfeelBoundary7MA4YWxkTrZu0gW';

  /**
   * 获取字符串的 UTF-8 字节长度（浏览器 Blob 优先，Node 用 Buffer）。
   * @param {string} str
   * @returns {number}
   */
  function utf8ByteLength(str) {
    if (typeof Blob !== 'undefined') return new Blob([str]).size;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(str, 'utf8');
    return unescape(encodeURIComponent(str)).length;
  }

  /**
   * 把字符串编码为 UTF-8 字节数组。
   * @param {string} str
   * @returns {Uint8Array}
   */
  function toUtf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    var bin = unescape(encodeURIComponent(str));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * 判断一个 part 是否为文件。
   * @param {Object} part 形如 { name, filename?, value } —— filename 存在即为文件
   * @returns {boolean}
   */
  function isFile(part) {
    return part && typeof part.filename === 'string' && part.filename.length > 0;
  }

  /**
   * 把「多个文件 + 多个普通字段」打包成 multipart/form-data 的线格式文本。
   * @param {Array<Object>} fields 普通字段 [{ name, value }]
   * @param {Array<Object>} files  文件 [{ name, filename, contentType, value }]
   * @param {string} [boundary] 自定义 boundary（不传则用默认值）
   * @returns {{ text: string, bytes: number, boundary: string, partCount: number, contentType: string }}
   *          text 为可直接展示的打包结果；bytes 为它的 UTF-8 字节数。
   */
  function encodeMultipart(fields, files, boundary) {
    var b = boundary || DEFAULT_BOUNDARY;
    var parts = [];

    (fields || []).forEach(function (f) {
      parts.push('--' + b + '\r\n');
      parts.push('Content-Disposition: form-data; name="' + f.name + '"\r\n');
      parts.push('\r\n');
      parts.push(f.value + '\r\n');
    });

    (files || []).forEach(function (file) {
      parts.push('--' + b + '\r\n');
      parts.push('Content-Disposition: form-data; name="' + file.name
        + '"; filename="' + file.filename + '"\r\n');
      parts.push('Content-Type: ' + (file.contentType || 'application/octet-stream') + '\r\n');
      parts.push('\r\n');
      parts.push(file.value + '\r\n');
    });

    // 结尾闭环：--boundary--
    parts.push('--' + b + '--\r\n');

    var text = parts.join('');
    return {
      text: text,
      bytes: utf8ByteLength(text),
      boundary: b,
      partCount: (fields || []).length + (files || []).length,
      contentType: 'multipart/form-data; boundary=' + b
    };
  }

  /**
   * 直接把一块原始数据当作 application/octet-stream 裸 body。
   * 它没有任何结构：没有文件名、没有 Content-Type、没有字段边界。
   * @param {string} data
   * @returns {{ text: string, bytes: number, contentType: string }}
   */
  function encodeRawBody(data) {
    return { text: data, bytes: utf8ByteLength(data), contentType: 'application/octet-stream' };
  }

  /**
   * 按 boundary 把打包结果解回结构，验证「编码→解码」无损。
   * @param {string} body  encodeMultipart 产出的 text
   * @param {string} [boundary]
   * @returns {{ fields: Array, files: Array }}
   */
  function decodeMultipart(body, boundary) {
    var b = boundary || DEFAULT_BOUNDARY;
    // 每个 part 块：--boundary\r\n <头> \r\n\r\n <负载> \r\n --boundary(/-)  ...
    var re = new RegExp(
      '--' + b + '\\r\\n([\\s\\S]*?)\\r\\n\\r\\n([\\s\\S]*?)\\r\\n(?=--' + b + '|--' + b + '--(?:\\r\\n|$))',
      'g'
    );
    var fields = [];
    var files = [];
    var m;
    while ((m = re.exec(body)) !== null) {
      var headerText = m[1];
      var payload = m[2];
      var contentType = null;
      var disposition = {};
      headerText.split('\r\n').forEach(function (line) {
        if (/^Content-Type:/i.test(line)) {
          contentType = line.replace(/^Content-Type:\s*/i, '').trim();
        } else if (/^Content-Disposition:/i.test(line)) {
          disposition = parseContentDisposition(line);
        }
      });
      if (typeof disposition.filename === 'string' && disposition.filename.length > 0) {
        files.push({ name: disposition.name, filename: disposition.filename, contentType: contentType, value: payload });
      } else {
        fields.push({ name: disposition.name, value: payload });
      }
    }
    return { fields: fields, files: files };
  }

  /**
   * 解析一行 Content-Disposition 头。
   * @param {string} header 如 'Content-Disposition: form-data; name="note"; filename="a.txt"'
   * @returns {{ type: string, name: string, filename?: string }}
   */
  function parseContentDisposition(header) {
    var value = header.replace(/^Content-Disposition:\s*/i, '').trim();
    var segments = value.split(';').map(function (s) { return s.trim(); });
    var out = { type: segments[0] || '' };
    for (var i = 1; i < segments.length; i++) {
      var kv = segments[i];
      var eq = kv.indexOf('=');
      if (eq < 0) continue;
      var key = kv.substring(0, eq).trim();
      var val = kv.substring(eq + 1).trim().replace(/^"|"$/g, '');
      out[key] = val;
    }
    return out;
  }

  /**
   * 从请求的 Content-Type 头里取出 boundary。
   * @param {string} contentType 如 'multipart/form-data; boundary=----abc'
   * @returns {string|null}
   */
  function boundaryOf(contentType) {
    if (!contentType) return null;
    var m = contentType.match(/boundary=([^;]+)/i);
    return m ? m[1].trim() : null;
  }

  /**
   * 把打包后的 body 按行拆成高亮 token，供前端逐类上色。
   * @param {string} body
   * @param {string} [boundary]
   * @returns {Array<{kind: string, text: string}>}
   *          kind: 'boundary' | 'header' | 'payload' | 'blank'
   */
  function tokenize(body, boundary) {
    var b = boundary || DEFAULT_BOUNDARY;
    var bFull = '--' + b;
    var bClose = '--' + b + '--';
    var lines = body.replace(/\r\n/g, '\n').split('\n');
    var tokens = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line === bClose || line === bFull) {
        tokens.push({ kind: 'boundary', text: line });
      } else if (line.length === 0) {
        tokens.push({ kind: 'blank', text: '' });
      } else if (/^(Content-Disposition:|Content-Type:)/i.test(line)) {
        tokens.push({ kind: 'header', text: line });
      } else {
        tokens.push({ kind: 'payload', text: line });
      }
    }
    return tokens;
  }

  /**
   * 把字节数格式化为人类可读字符串。
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  var exports = {
    DEFAULT_BOUNDARY: DEFAULT_BOUNDARY,
    encodeMultipart: encodeMultipart,
    encodeRawBody: encodeRawBody,
    decodeMultipart: decodeMultipart,
    parseContentDisposition: parseContentDisposition,
    boundaryOf: boundaryOf,
    tokenize: tokenize,
    utf8ByteLength: utf8ByteLength,
    toUtf8Bytes: toUtf8Bytes,
    formatBytes: formatBytes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.MultipartEngine = exports;
  }
})();