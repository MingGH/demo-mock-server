/**
 * logic.js — 文档隐写实验室
 *
 * 1. generateTrackingPdf(opts)  — 生成带追踪像素的 PDF（纯文本 PDF 格式）
 * 2. WatermarkEngine            — 文字指纹水印：注入 / 提取
 */
(function (global) {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';

  // ─── 工具 ────────────────────────────────────────────────────────────────────

  function randomToken() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < 24; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  // ─── PDF 生成 ────────────────────────────────────────────────────────────────
  // 手写最小化 PDF，不依赖任何库
  // 包含：文档信息（作者、创建时间）、正文文字、1×1 追踪像素图片

  function pdfEscape(str) {
    return String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  /**
   * 生成追踪 PDF 的字节内容
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.recipient
   * @param {string} opts.token
   * @param {string} opts.trackUrl  — 追踪像素 URL
   * @returns {string} PDF 文本内容
   */
  function generateTrackingPdf(opts) {
    var title = opts.title || '合作方案';
    var recipient = opts.recipient || '收件方';
    var token = opts.token || randomToken();
    var trackUrl = opts.trackUrl || (API_BASE + '/doc-track/pixel?id=' + token);

    var now = new Date();
    var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';

    // PDF 使用 UTF-16BE BOM + 内容，中文需要特殊处理
    // 为简化，正文用 Latin-1 可表示的内容 + 单独的中文用 Unicode escape
    // 实际上最简单的方式：用 PDFDocEncoding 写 ASCII，中文另行处理
    // 这里采用：正文全部转为 Unicode code points，用 \uXXXX 写入 PDF 字符串

    function toPdfUnicode(str) {
      // PDF Unicode 字符串：BOM + UTF-16BE
      var result = '\xFE\xFF'; // BOM
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        result += String.fromCharCode((code >> 8) & 0xFF, code & 0xFF);
      }
      return result;
    }

    function pdfUnicodeStr(str) {
      return '(' + pdfEscape(toPdfUnicode(str)) + ')';
    }

    // 构建 PDF 对象
    var objects = [];
    var offsets = [];

    function addObj(id, content) {
      objects[id] = content;
    }

    // Object 1: Catalog
    addObj(1, '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

    // Object 2: Pages
    addObj(2, '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');

    // Object 3: Page
    // 页面包含内容流（4）和图片资源（5）
    addObj(3,
      '3 0 obj\n' +
      '<< /Type /Page /Parent 2 0 R\n' +
      '   /MediaBox [0 0 595 842]\n' +
      '   /Contents 4 0 R\n' +
      '   /Resources << /Font << /F1 6 0 R >> /XObject << /Img1 5 0 R >> >>\n' +
      '>>\nendobj'
    );

    // Object 4: 内容流
    // 用 PDF 操作符绘制文字，并在页面某处放置追踪图片（1×1，放在页面右上角不显眼处）
    var lines = [
      title,
      '',
      '收件方：' + recipient,
      '日期：' + dateStr,
      '',
      '本文件为保密文件，仅供指定收件方查阅。',
      '未经授权，请勿转发或复制。',
      '',
      '如有疑问，请联系发件方。'
    ];

    // 构建内容流：先画文字，再放追踪图片
    var streamLines = ['BT', '/F1 14 Tf'];
    var y = 750;
    lines.forEach(function (line, i) {
      if (i === 0) {
        streamLines.push('/F1 18 Tf');
      } else if (i === 1) {
        streamLines.push('/F1 12 Tf');
      }
      streamLines.push('50 ' + y + ' Td');
      // 用 Unicode 字符串
      streamLines.push(pdfUnicodeStr(line) + ' Tj');
      streamLines.push('-50 -' + (i === 0 ? 30 : 20) + ' Td');
      y -= (i === 0 ? 30 : 20);
    });
    streamLines.push('ET');

    // 放追踪图片：1×1 像素，放在页面右上角（590, 838），几乎不可见
    streamLines.push('q');
    streamLines.push('1 0 0 1 590 838 cm');
    streamLines.push('1 1 Do');  // 注意：这里用 /Img1，但 Do 操作符需要 /Img1
    streamLines.push('Q');

    // 修正：Do 操作符需要 /Name Do
    // 重新构建
    streamLines = ['BT', '/F1 18 Tf'];
    y = 750;
    lines.forEach(function (line, i) {
      if (i === 1) streamLines.push('/F1 12 Tf');
      streamLines.push('50 ' + y + ' Td');
      streamLines.push(pdfUnicodeStr(line) + ' Tj');
      var dy = (i === 0) ? 30 : 20;
      streamLines.push('-50 -' + dy + ' Td');
      y -= dy;
    });
    streamLines.push('ET');
    // 追踪图片（1×1，右上角）
    streamLines.push('q 1 0 0 1 590 838 cm /Img1 Do Q');

    var streamContent = streamLines.join('\n');
    addObj(4,
      '4 0 obj\n' +
      '<< /Length ' + streamContent.length + ' >>\n' +
      'stream\n' +
      streamContent + '\n' +
      'endstream\nendobj'
    );

    // Object 5: 追踪像素图片（外部 URL 引用）
    // PDF 支持通过 /URI action 或 /F (file) 引用外部资源
    // 更可靠的方式：用 /Subtype /Image + /URL（部分阅读器支持）
    // 最广泛支持的方式：嵌入一个 1×1 PNG，同时在 /AA（Additional Actions）里触发 URI
    // 实际上最可靠的追踪方式是：在 /OpenAction 里触发一个 /URI action
    // 这样文件一打开就会请求 URL

    // Object 5: 1×1 白色 PNG（内嵌，作为页面装饰）
    var png1x1 = '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82';
    // 用十六进制流更可靠
    var pngHex = '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
                 '53de0000000c4944415478' + '9c63f80f000000010100051' + '8d84e000000000049454e44ae426082';

    addObj(5,
      '5 0 obj\n' +
      '<< /Type /XObject /Subtype /Image\n' +
      '   /Width 1 /Height 1\n' +
      '   /ColorSpace /DeviceRGB /BitsPerComponent 8\n' +
      '   /Filter /ASCIIHexDecode\n' +
      '   /Length ' + pngHex.length + '\n' +
      '>>\n' +
      'stream\n' +
      pngHex + '\n' +
      'endstream\nendobj'
    );

    // Object 6: 字体（使用内置 Helvetica，不支持中文，但我们用 Unicode 字符串）
    addObj(6,
      '6 0 obj\n' +
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica\n' +
      '   /Encoding /WinAnsiEncoding\n' +
      '>>\nendobj'
    );

    // Object 7: 文档信息
    addObj(7,
      '7 0 obj\n' +
      '<< /Title ' + pdfUnicodeStr(title) + '\n' +
      '   /Author ' + pdfUnicodeStr('文档隐写实验室') + '\n' +
      '   /CreationDate (D:' + now.getFullYear() +
        pad(now.getMonth() + 1) + pad(now.getDate()) +
        pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '+08\'00\')\n' +
      '>>\nendobj'
    );

    // Object 8: OpenAction — 文件打开时触发 URI 请求（追踪核心）
    addObj(8,
      '8 0 obj\n' +
      '<< /Type /Action /S /URI /URI (' + pdfEscape(trackUrl) + ') >>\n' +
      'endobj'
    );

    // 更新 Catalog，加入 OpenAction 和 Info
    objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction 8 0 R >>\nendobj';

    // 构建 PDF 文件
    var pdf = '%PDF-1.4\n';
    pdf += '%\xe2\xe3\xcf\xd3\n'; // 二进制标记

    var objOrder = [1, 2, 3, 4, 5, 6, 7, 8];
    var xrefOffsets = {};

    objOrder.forEach(function (id) {
      xrefOffsets[id] = pdf.length;
      pdf += objects[id] + '\n';
    });

    // xref 表
    var xrefOffset = pdf.length;
    pdf += 'xref\n';
    pdf += '0 9\n';
    pdf += '0000000000 65535 f \n';
    objOrder.forEach(function (id) {
      pdf += pad10(xrefOffsets[id]) + ' 00000 n \n';
    });

    // trailer
    pdf += 'trailer\n';
    pdf += '<< /Size 9 /Root 1 0 R /Info 7 0 R >>\n';
    pdf += 'startxref\n';
    pdf += xrefOffset + '\n';
    pdf += '%%EOF';

    return pdf;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function pad10(n) { return ('0000000000' + n).slice(-10); }

  // ─── 文字指纹水印引擎 ────────────────────────────────────────────────────────

  // 同义词替换规则：[原词, 替换词]
  // 每对是一个 bit：原词=0，替换词=1
  var SYNONYM_RULES = [
    ['总金额', '总价款'],
    ['交付', '完成'],
    ['保证', '确保'],
    ['合同', '协议'],
    ['支付', '缴纳'],
    ['验收', '检收'],
    ['违约金', '赔偿金'],
    ['管辖', '适用'],
    ['首期', '第一期'],
    ['百分之', '百分之']  // 占位，实际用标点变体
  ];

  // 标点变体规则（额外的 bit 来源）
  var PUNCT_RULES = [
    ['，', '\uff0c'],   // 全角逗号的两种写法（实际上一样，用零宽空格区分）
    ['。', '。\u200b'] // 句号后加零宽空格
  ];

  /**
   * 注入水印
   * @param {string} text 原始文本
   * @param {number} recipientId 收件方 ID（0-based）
   * @returns {string} 注入水印后的文本
   */
  function injectWatermark(text, recipientId) {
    var bits = recipientId;
    var result = text;

    // 同义词替换
    SYNONYM_RULES.forEach(function (rule, i) {
      var bit = (bits >> i) & 1;
      if (bit === 1) {
        result = result.split(rule[0]).join(rule[1]);
      }
    });

    // 零宽字符编码（在特定位置插入零宽空格来编码额外 bit）
    // 在第一个句号后插入零宽字符序列
    var zwBits = (bits >> SYNONYM_RULES.length);
    var zwStr = '';
    for (var i = 0; i < 4; i++) {
      zwStr += ((zwBits >> i) & 1) ? '\u200b' : '\u200c'; // 零宽空格 vs 零宽非连接符
    }
    result = result.replace('。', '。' + zwStr);

    return result;
  }

  /**
   * 提取水印，返回 recipientId
   * @param {string} text 疑似泄露文本
   * @returns {{id: number, confidence: number, bits: string}}
   */
  function extractWatermark(text) {
    var bits = 0;
    var matchCount = 0;

    // 同义词检测
    SYNONYM_RULES.forEach(function (rule, i) {
      if (text.indexOf(rule[1]) !== -1) {
        bits |= (1 << i);
        matchCount++;
      } else if (text.indexOf(rule[0]) !== -1) {
        matchCount++;
      }
    });

    // 零宽字符检测
    var zwBits = 0;
    var zwMatch = text.match(/。([\u200b\u200c]{1,4})/);
    if (zwMatch) {
      var zwStr = zwMatch[1];
      for (var i = 0; i < zwStr.length; i++) {
        if (zwStr[i] === '\u200b') zwBits |= (1 << i);
      }
      bits |= (zwBits << SYNONYM_RULES.length);
      matchCount++;
    }

    var confidence = matchCount / (SYNONYM_RULES.length + 1);
    var bitStr = bits.toString(2).padStart(14, '0');

    return { id: bits, confidence: confidence, bitStr: bitStr };
  }

  /**
   * 获取追踪事件
   * @param {string} token
   * @returns {Promise}
   */
  function fetchEvents(token) {
    return fetch(API_BASE + '/doc-track/events?id=' + encodeURIComponent(token))
      .then(function (r) { return r.json(); });
  }

  // ─── 导出 ────────────────────────────────────────────────────────────────────

  var api = {
    randomToken: randomToken,
    generateTrackingPdf: generateTrackingPdf,
    injectWatermark: injectWatermark,
    extractWatermark: extractWatermark,
    fetchEvents: fetchEvents,
    API_BASE: API_BASE
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.DocStegoLab = api;

})(typeof window !== 'undefined' ? window : globalThis);
