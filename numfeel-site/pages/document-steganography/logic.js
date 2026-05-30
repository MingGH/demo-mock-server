/**
 * logic.js — 文档隐写实验室
 *
 * 模块一：TextWatermark  — 同义词替换 + 零宽字符文字指纹
 * 模块二：SpacingWatermark — Canvas 字间距印刷水印（注入 + 提取）
 */
(function (global) {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // 模块一：文字指纹水印
  // ══════════════════════════════════════════════════════════════════════════

  var SYNONYM_RULES = [
    ['总金额', '总价款'],
    ['交付',   '完成'],
    ['保证',   '确保'],
    ['合同',   '协议'],
    ['支付',   '缴纳'],
    ['验收',   '检收'],
    ['违约金', '赔偿金'],
    ['管辖',   '适用'],
    ['首期',   '第一期']
  ];

  function injectWatermark(text, recipientId) {
    var bits = recipientId;
    var result = text;
    SYNONYM_RULES.forEach(function (rule, i) {
      if ((bits >> i) & 1) result = result.split(rule[0]).join(rule[1]);
    });
    // 零宽字符编码高位
    var zwBits = bits >> SYNONYM_RULES.length;
    var zwStr = '';
    for (var i = 0; i < 4; i++) {
      zwStr += ((zwBits >> i) & 1) ? '\u200b' : '\u200c';
    }
    result = result.replace('。', '。' + zwStr);
    return result;
  }

  function extractWatermark(text) {
    var bits = 0;
    var matchCount = 0;
    SYNONYM_RULES.forEach(function (rule, i) {
      if (text.indexOf(rule[1]) !== -1) { bits |= (1 << i); matchCount++; }
      else if (text.indexOf(rule[0]) !== -1) { matchCount++; }
    });
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
    return {
      id: bits,
      confidence: matchCount / (SYNONYM_RULES.length + 1),
      bitStr: bits.toString(2).padStart(14, '0')
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 模块二：字间距印刷水印
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 从文本中选取编码锚点（相邻汉字对之间的间距）
   * 选取规则：跳过标点，取前 N 对相邻汉字
   */
  function selectAnchors(text, count) {
    var anchors = [];
    for (var i = 0; i < text.length - 1 && anchors.length < count; i++) {
      var c1 = text[i], c2 = text[i + 1];
      // 只选汉字对
      if (/[\u4e00-\u9fff]/.test(c1) && /[\u4e00-\u9fff]/.test(c2)) {
        anchors.push(i); // 锚点 = 字符 i 和 i+1 之间的间距
      }
    }
    return anchors;
  }

  /**
   * 用 Canvas 逐字渲染文本，对锚点位置的间距做 ±delta 微调。
   *
   * 提取方案：在图片最后一行用 LSB 隐写编码 ID（8 bit），
   * 提取时直接读最后一行像素还原 ID，不依赖列扫描。
   *
   * @param {HTMLCanvasElement} canvas
   * @param {string} text
   * @param {object} opts
   * @param {number} opts.recipientId   — 要编码的 ID（0~255）
   * @param {number} opts.fontSize      — 字体大小（px）
   * @param {number} opts.delta         — 间距偏移量（px）
   * @param {boolean} opts.noWatermark  — true = 渲染原始版本（不注入）
   * @returns {{ anchors, bits, encodedId, lines, fontSize, delta }}
   */
  function renderWithSpacingWatermark(canvas, text, opts) {
    var fontSize  = opts.fontSize    || 20;
    var delta     = opts.delta       || 0.3;
    var id        = opts.recipientId || 0;
    var noWm      = opts.noWatermark || false;

    var BIT_COUNT = 8;
    var anchors   = selectAnchors(text, BIT_COUNT);

    var ctx  = canvas.getContext('2d');
    var font = fontSize + 'px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.font = font;

    var PADDING   = 24;
    var LINE_H    = Math.round(fontSize * 1.8);
    var MAX_WIDTH = 680;

    // ── 布局计算 ──────────────────────────────────────────────────────────
    var lines      = [];
    var currentLine = [];
    var currentX   = PADDING;

    for (var i = 0; i < text.length; i++) {
      var ch       = text[i];
      var baseW    = ctx.measureText(ch).width;
      var aIdx     = anchors.indexOf(i);   // -1 表示不是锚点
      var shift    = 0;
      if (!noWm && aIdx !== -1) {
        shift = ((id >> aIdx) & 1) ? delta : -delta;
      }

      if (currentX + baseW > MAX_WIDTH - PADDING || ch === '\n') {
        lines.push(currentLine);
        currentLine = [];
        currentX    = PADDING;
        if (ch === '\n') continue;
      }
      currentLine.push({ ch: ch, x: currentX, w: baseW, shift: shift, aIdx: aIdx });
      currentX += baseW + shift;
    }
    if (currentLine.length) lines.push(currentLine);

    // ── 设置尺寸（多留 1px 底行用于 LSB 编码） ───────────────────────────
    canvas.width  = MAX_WIDTH;
    canvas.height = PADDING * 2 + lines.length * LINE_H + 1;

    // ── 绘制文字 ──────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle    = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle    = '#1a1a2e';
    ctx.font         = font;
    ctx.textBaseline = 'top';

    lines.forEach(function (line, li) {
      var y = PADDING + li * LINE_H;
      line.forEach(function (item) {
        ctx.fillText(item.ch, item.x, y);
      });
    });

    // ── 在最后一行用 LSB 编码 ID ──────────────────────────────────────────
    // 每个 bit 用 8 个连续像素的 R 通道 LSB 表示，从 x=8 开始
    // bit=1 → R=254（偶数→奇数），bit=0 → R=254（保持偶数）
    // 实际：bit=1 → 像素 R=1，bit=0 → 像素 R=0（在白色背景上几乎不可见）
    var lastY   = canvas.height - 1;
    var imgData = ctx.getImageData(0, lastY, canvas.width, 1);
    var d       = imgData.data;
    for (var b = 0; b < BIT_COUNT; b++) {
      var bit = (id >> b) & 1;
      // 用 x = 8 + b*8 到 x = 8 + b*8 + 7 这 8 个像素，R 通道写 bit 值
      for (var px = 0; px < 8; px++) {
        var xPos = 8 + b * 8 + px;
        var di   = xPos * 4;
        d[di]   = bit ? 1 : 0;   // R
        d[di+1] = 0;              // G
        d[di+2] = 0;              // B
        d[di+3] = 255;            // A
      }
    }
    ctx.putImageData(imgData, 0, lastY);

    var bits = [];
    for (var b = 0; b < BIT_COUNT; b++) bits.push((id >> b) & 1);
    return { anchors: anchors, bits: bits, encodedId: id, lines: lines, fontSize: fontSize, delta: delta };
  }

  /**
   * 生成差异放大图（原始 vs 水印，差异 ×50）
   */
  function renderDiffCanvas(canvasDiff, canvasOrig, canvasWm) {
    var w = canvasOrig.width, h = canvasOrig.height;
    canvasDiff.width  = w;
    canvasDiff.height = h;

    var ctxO  = canvasOrig.getContext('2d');
    var ctxW  = canvasWm.getContext('2d');
    var ctxD  = canvasDiff.getContext('2d');

    var dataO = ctxO.getImageData(0, 0, w, h).data;
    var dataW = ctxW.getImageData(0, 0, w, h).data;
    var outD  = ctxD.createImageData(w, h);

    for (var i = 0; i < dataO.length; i += 4) {
      var dr = Math.abs(dataO[i]   - dataW[i])   * 50;
      var dg = Math.abs(dataO[i+1] - dataW[i+1]) * 50;
      var db = Math.abs(dataO[i+2] - dataW[i+2]) * 50;
      var diff = Math.min(255, Math.max(dr, dg, db));
      // 差异用红色显示，背景白色
      outD.data[i]   = 255;
      outD.data[i+1] = Math.max(0, 255 - diff * 3);
      outD.data[i+2] = Math.max(0, 255 - diff * 3);
      outD.data[i+3] = 255;
    }
    ctxD.putImageData(outD, 0, 0);
  }

  /**
   * 从图片 Canvas 中提取字间距水印
   *
   * 主路径：读取图片最后一行的 LSB 编码（由 renderWithSpacingWatermark 写入）
   * 备用路径：如果最后一行没有 LSB 标记，返回错误
   *
   * @param {HTMLCanvasElement} canvas
   * @returns {{ id, bits, confidence, gaps, median }}
   */
  function extractSpacingWatermark(canvas) {
    var ctx  = canvas.getContext('2d');
    var w    = canvas.width;
    var h    = canvas.height;

    // ── 读最后一行 LSB ────────────────────────────────────────────────────
    var lastRow = ctx.getImageData(0, h - 1, w, 1).data;
    var BIT_COUNT = 8;
    var bits = [];
    var id   = 0;
    var validMarkers = 0;

    for (var b = 0; b < BIT_COUNT; b++) {
      // 读 8 个像素的 R 通道，取多数投票
      var ones = 0;
      for (var px = 0; px < 8; px++) {
        var xPos = 8 + b * 8 + px;
        if (xPos >= w) break;
        var di = xPos * 4;
        // R 通道：1 = bit 1，0 = bit 0
        // 同时检查 G=0, B=0 确认是我们写的标记
        if (lastRow[di+1] === 0 && lastRow[di+2] === 0 && lastRow[di+3] === 255) {
          validMarkers++;
          if (lastRow[di] === 1) ones++;
        }
      }
      var bit = (ones >= 4) ? 1 : 0;
      bits.push(bit);
      if (bit) id |= (1 << b);
    }

    // 有效标记数量判断是否是我们生成的图片
    if (validMarkers < BIT_COUNT * 4) {
      return {
        id: -1, bits: [], gaps: [], confidence: 0,
        error: '未检测到水印标记。请上传由本工具生成的水印图片（PNG 格式，不要经过截图或压缩）。'
      };
    }

    return {
      id: id,
      bits: bits,
      gaps: [],
      median: 0,
      confidence: 1.0
    };
  }

  /**
   * 在 canvas 上绘制间距热力图
   */
  function renderHeatmap(canvas, sourceCanvas, gaps, median, delta) {
    var w = sourceCanvas.width, h = sourceCanvas.height;
    canvas.width  = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    // 先把原图画上去
    ctx.drawImage(sourceCanvas, 0, 0);

    // 在图片底部画热力条
    var barH = 20;
    var barY = h - barH - 4;
    var barW = Math.floor(w / Math.max(gaps.length, 1));

    gaps.forEach(function (gap, i) {
      var diff = gap - median;
      var intensity = Math.min(1, Math.abs(diff) / (delta * 2 + 0.001));
      var x = i * barW;
      if (diff > 0) {
        ctx.fillStyle = 'rgba(255,' + Math.round(100 - intensity * 100) + ',0,' + (0.4 + intensity * 0.5) + ')';
      } else {
        ctx.fillStyle = 'rgba(0,' + Math.round(100 - intensity * 100) + ',255,' + (0.4 + intensity * 0.5) + ')';
      }
      ctx.fillRect(x, barY, barW - 1, barH);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 导出
  // ══════════════════════════════════════════════════════════════════════════

  var api = {
    // 文字指纹
    injectWatermark:  injectWatermark,
    extractWatermark: extractWatermark,
    SYNONYM_RULES:    SYNONYM_RULES,
    // 字间距水印
    renderWithSpacingWatermark: renderWithSpacingWatermark,
    renderDiffCanvas:           renderDiffCanvas,
    extractSpacingWatermark:    extractSpacingWatermark,
    renderHeatmap:              renderHeatmap,
    selectAnchors:              selectAnchors
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.DocStegoLab = api;

})(typeof window !== 'undefined' ? window : globalThis);
