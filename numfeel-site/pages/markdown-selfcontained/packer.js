/*
 * packer.js — 三种「带图 Markdown 分发」方案的核心算法
 *   A. .md + assets 文件夹打包成 ZIP（store 模式，图片已压缩不再二次压缩）
 *   B. base64 内嵌进单个 .md 文件
 *   C. 自包含单文件 HTML（图片转 data URI 内嵌）
 *
 * 纯逻辑、无 DOM 依赖，浏览器与 node 通用，供 demo 与单元测试共享。
 * 所有字节数均为真实计算结果（真实 PNG、真实 base64、真实 ZIP 字节流）。
 */
(function (global) {
  'use strict';

  // ── 编码工具：浏览器/node 通用 ──────────────────────────────
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }

  function utf8Len(str) {
    return utf8Bytes(str).length;
  }

  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // 标准 base64 编码后的字符数（含 padding），对任意 n 字节精确成立
  function base64Len(nBytes) {
    return Math.ceil(nBytes / 3) * 4;
  }

  // ── CRC32（ZIP 校验需要）──────────────────────────────────
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── ZIP（store 模式）：生成真实可解压的 .zip 字节流 ──────────
  // files: [{ name: string, data: Uint8Array }]
  function buildStoreZip(files) {
    var parts = [];
    var central = [];
    var offset = 0;

    function u16(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]); }
    function u32(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }
    function concat(arrs) {
      var len = arrs.reduce(function (s, a) { return s + a.length; }, 0);
      var out = new Uint8Array(len);
      var p = 0;
      arrs.forEach(function (a) { out.set(a, p); p += a.length; });
      return out;
    }

    files.forEach(function (f) {
      var nameBytes = utf8Bytes(f.name);
      var crc = crc32(f.data);
      var size = f.data.length;

      var local = concat([
        u32(0x04034b50),       // local file header signature
        u16(20),               // version needed
        u16(0),                // flags
        u16(0),                // compression = store
        u16(0), u16(0),        // mod time / date
        u32(crc),
        u32(size),             // compressed size
        u32(size),             // uncompressed size
        u16(nameBytes.length),
        u16(0),                // extra len
        nameBytes,
        f.data
      ]);
      parts.push(local);

      var cd = concat([
        u32(0x02014b50),       // central dir header signature
        u16(20), u16(20),
        u16(0), u16(0),
        u16(0), u16(0),
        u32(crc),
        u32(size), u32(size),
        u16(nameBytes.length),
        u16(0), u16(0),
        u16(0), u16(0),
        u32(0),
        u32(offset),
        nameBytes
      ]);
      central.push(cd);
      offset += local.length;
    });

    var centralBytes = concat(central);
    var end = concat([
      u32(0x06054b50),
      u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(centralBytes.length),
      u32(offset),
      u16(0)
    ]);

    return concat([concat(parts), centralBytes, end]);
  }

  // ── 极简 Markdown -> HTML 渲染器（覆盖样例用到的语法）────────
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inlineFmt(text) {
    text = escapeHtml(text);
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    return text;
  }

  // imgResolver(name) -> src 字符串（自包含时返回 data URI，否则返回原名）
  function renderMarkdown(md, imgResolver) {
    var lines = md.split('\n');
    var html = '';
    var inList = false;
    function closeList() { if (inList) { html += '</ul>'; inList = false; } }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
      if (img) {
        closeList();
        var src = imgResolver ? imgResolver(img[2]) : img[2];
        html += '<p><img alt="' + escapeHtml(img[1]) + '" src="' + src + '"></p>';
        continue;
      }
      var cb = line.match(/^- \[([ x])\] (.*)$/);
      if (cb) {
        if (!inList) { html += '<ul class="task">'; inList = true; }
        html += '<li>' + (cb[1] === 'x' ? '\u2611 ' : '\u2610 ') + inlineFmt(cb[2]) + '</li>';
        continue;
      }
      if (line.match(/^- /)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inlineFmt(line.slice(2)) + '</li>';
        continue;
      }
      closeList();
      if (line.indexOf('### ') === 0) { html += '<h3>' + inlineFmt(line.slice(4)) + '</h3>'; continue; }
      if (line.indexOf('## ') === 0) { html += '<h2>' + inlineFmt(line.slice(3)) + '</h2>'; continue; }
      if (line.indexOf('# ') === 0) { html += '<h1>' + inlineFmt(line.slice(2)) + '</h1>'; continue; }
      if (line.trim() === '') { continue; }
      html += '<p>' + inlineFmt(line) + '</p>';
    }
    closeList();
    return html;
  }

  function dataUri(image) {
    var b64 = image.b64 || (typeof Buffer !== 'undefined'
      ? Buffer.from(image.data).toString('base64') : null);
    return 'data:' + image.mime + ';base64,' + b64;
  }

  function imageBytes(image) {
    if (typeof image.bytes === 'number') return image.bytes;
    if (image.b64) return b64ToBytes(image.b64).length;
    if (image.data) return image.data.length;
    return 0;
  }

  // ── 方案 B：base64 内嵌的单个 .md 文件 ─────────────────────
  function buildBase64Markdown(sample) {
    var md = sample.markdown;
    sample.images.forEach(function (im) {
      var re = new RegExp('\\]\\(' + im.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\)', 'g');
      md = md.replace(re, '](' + dataUri(im) + ')');
    });
    return md;
  }

  // ── 方案 C：自包含单文件 HTML ──────────────────────────────
  var SELF_HTML_CSS =
    'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;' +
    'margin:0 auto;padding:24px;line-height:1.7;color:#222}' +
    'img{max-width:100%;border-radius:8px;border:1px solid #ddd}' +
    'h1,h2,h3{line-height:1.3}code{background:#f3f3f3;padding:2px 6px;border-radius:4px}' +
    'ul.task{list-style:none;padding-left:0}ul.task li{margin:4px 0}';

  function buildSelfContainedHtml(sample) {
    var byName = {};
    sample.images.forEach(function (im) { byName[im.name] = im; });
    var body = renderMarkdown(sample.markdown, function (name) {
      return byName[name] ? dataUri(byName[name]) : name;
    });
    return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n' +
      '<title>' + escapeHtml(sample.title || 'document') + '</title>\n' +
      '<style>' + SELF_HTML_CSS + '</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
  }

  // ── 汇总报告：三种方案的真实字节数 + 定性属性 ────────────────
  function computeReport(sample) {
    var mdBytes = utf8Len(sample.markdown);
    var rawImageBytes = sample.images.reduce(function (s, im) { return s + imageBytes(im); }, 0);
    var nImages = sample.images.length;

    // A. ZIP（store）
    var zipFiles = [{ name: sample.mdName || 'document.md', data: utf8Bytes(sample.markdown) }];
    sample.images.forEach(function (im) {
      zipFiles.push({ name: 'assets/' + im.name, data: b64ToBytes(im.b64) });
    });
    var zipBytes = buildStoreZip(zipFiles).length;

    // B. base64 内嵌 markdown
    var b64md = buildBase64Markdown(sample);
    var b64mdBytes = utf8Len(b64md);

    // C. 自包含 HTML
    var selfHtml = buildSelfContainedHtml(sample);
    var selfHtmlBytes = utf8Len(selfHtml);

    return {
      mdBytes: mdBytes,
      rawImageBytes: rawImageBytes,
      nImages: nImages,
      strategies: {
        zip: {
          key: 'zip', label: '.md + assets 打 ZIP', bytes: zipBytes,
          singleFile: true, viewableRaw: false, offline: true, openOnDblClick: false,
          textDiff: true, grepable: true, editableText: true
        },
        base64md: {
          key: 'base64md', label: 'base64 内嵌 .md', bytes: b64mdBytes,
          singleFile: true, viewableRaw: false, offline: true, openOnDblClick: false,
          textDiff: false, grepable: false, editableText: false
        },
        selfHtml: {
          key: 'selfHtml', label: '自包含 HTML', bytes: selfHtmlBytes,
          singleFile: true, viewableRaw: false, offline: true, openOnDblClick: true,
          textDiff: false, grepable: false, editableText: false
        }
      }
    };
  }

  var api = {
    utf8Bytes: utf8Bytes,
    utf8Len: utf8Len,
    b64ToBytes: b64ToBytes,
    base64Len: base64Len,
    crc32: crc32,
    buildStoreZip: buildStoreZip,
    renderMarkdown: renderMarkdown,
    buildBase64Markdown: buildBase64Markdown,
    buildSelfContainedHtml: buildSelfContainedHtml,
    computeReport: computeReport,
    dataUri: dataUri,
    imageBytes: imageBytes
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { global.Packer = api; }
})(typeof window !== 'undefined' ? window : this);
