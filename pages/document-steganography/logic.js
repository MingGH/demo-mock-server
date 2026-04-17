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
   * 用 Canvas 逐字渲染文本，对锚点位置的间距做 ±delta 微调
   *
   * @param {HTMLCanvasElement} canvas
   * @param {string} text
   * @param {object} opts
   * @param {number} opts.recipientId   — 要编码的 ID（0~255）
   * @param {number} opts.fontSize      — 字体大小（px）
   * @param {number} opts.delta         — 间距偏移量（px）
   * @param {boolean} opts.noWatermark  — true = 渲染原始版本（不注入）
   * @returns {{ anchors: number[], bits: number[], encodedId: number }}
   */
  function renderWithSpacingWatermark(canvas, text, opts) {
    var fontSize  = opts.fontSize  || 20;
    var delta     = opts.delta     || 0.3;
    var id        = opts.recipientId || 0;
    var noWm      = opts.noWatermark || false;

    var BIT_COUNT = 8; // 编码 8 bit = 0~255
    var anchors   = selectAnchors(text, BIT_COUNT);
    var anchorSet = {};
    anchors.forEach(function (a) { anchorSet[a] = true; });

    var ctx = canvas.getContext('2d');
    var font = fontSize + 'px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.font = font;

    var PADDING   = 24;
    var LINE_H    = Math.round(fontSize * 1.8);
    var MAX_WIDTH = 680;

    // ── 第一遍：计算布局（换行） ──────────────────────────────────────────
    var lines = [];
    var currentLine = [];
    var currentX    = PADDING;

    for (var i = 0; i < text.length; i++) {
      var ch    = text[i];
      var baseW = ctx.measureText(ch).width;
      var bit   = (anchors.indexOf(i) !== -1) ? ((id >> anchors.indexOf(i)) & 1) : -1;
      var shift = 0;
      if (!noWm && bit !== -1) shift = (bit === 1) ? delta : -delta;

      if (currentX + baseW > MAX_WIDTH - PADDING || ch === '\n') {
        lines.push(currentLine);
        currentLine = [];
        currentX    = PADDING;
        if (ch === '\n') continue;
      }
      currentLine.push({ ch: ch, x: currentX, w: baseW, shift: shift, anchorIdx: anchors.indexOf(i) });
      currentX += baseW + shift;
    }
    if (currentLine.length) lines.push(currentLine);

    // ── 设置 canvas 尺寸 ──────────────────────────────────────────────────
    canvas.width  = MAX_WIDTH;
    canvas.height = PADDING * 2 + lines.length * LINE_H;

    // ── 第二遍：绘制 ──────────────────────────────────────────────────────
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a2e';
    ctx.font      = font;
    ctx.textBaseline = 'top';

    lines.forEach(function (line, li) {
      var y = PADDING + li * LINE_H;
      line.forEach(function (item) {
        ctx.fillText(item.ch, item.x, y);
      });
    });

    // 返回元数据供提取使用
    var bits = [];
    for (var b = 0; b < BIT_COUNT; b++) {
      bits.push((id >> b) & 1);
    }
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
   * 原理：列扫描找字符边界 → 计算间距 → 与基准比较 → 还原 bit
   *
   * @param {HTMLCanvasElement} canvas  — 待分析图片
   * @param {number} fontSize           — 渲染时使用的字体大小（用于估算基准间距）
   * @param {number} delta              — 渲染时使用的偏移量
   * @returns {{ id: number, bits: number[], gaps: number[], confidence: number }}
   */
  function extractSpacingWatermark(canvas, fontSize, delta) {
    fontSize = fontSize || 20;
    delta    = delta    || 0.3;

    var ctx  = canvas.getContext('2d');
    var w    = canvas.width;
    var h    = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;

    // ── 列扫描：找每列是否有墨迹（非白像素） ────────────────────────────
    var colHasInk = new Array(w).fill(false);
    for (var x = 0; x < w; x++) {
      for (var y = 0; y < h; y++) {
        var idx = (y * w + x) * 4;
        // 非白色（R<240 或 G<240 或 B<240）
        if (data[idx] < 240 || data[idx+1] < 240 || data[idx+2] < 240) {
          colHasInk[x] = true;
          break;
        }
      }
    }

    // ── 找字符块的左右边界 ───────────────────────────────────────────────
    var charBounds = []; // [{left, right}]
    var inChar = false;
    var charStart = 0;
    var MIN_CHAR_W = Math.round(fontSize * 0.4);
    var MAX_GAP    = Math.round(fontSize * 0.8); // 行内间距不超过这个就算同一行

    for (var x = 0; x < w; x++) {
      if (!inChar && colHasInk[x]) {
        inChar    = true;
        charStart = x;
      } else if (inChar && !colHasInk[x]) {
        // 检查是否是短暂空白（间距）还是真正的字符结束
        var gapEnd = x;
        while (gapEnd < w && !colHasInk[gapEnd] && gapEnd - x < MAX_GAP) gapEnd++;
        if (gapEnd < w && colHasInk[gapEnd] && gapEnd - x < MAX_GAP) {
          // 短暂空白，继续
          x = gapEnd - 1;
        } else {
          // 字符结束
          if (x - charStart >= MIN_CHAR_W) {
            charBounds.push({ left: charStart, right: x - 1 });
          }
          inChar = false;
        }
      }
    }
    if (inChar) charBounds.push({ left: charStart, right: w - 1 });

    // ── 计算相邻字符间距 ─────────────────────────────────────────────────
    var gaps = [];
    for (var i = 0; i < charBounds.length - 1; i++) {
      gaps.push(charBounds[i+1].left - charBounds[i].right - 1);
    }

    if (gaps.length < 4) {
      return { id: -1, bits: [], gaps: gaps, confidence: 0, error: '字符边界识别不足，请确保图片清晰且字体足够大' };
    }

    // ── 估算基准间距（取中位数） ─────────────────────────────────────────
    var sorted = gaps.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];

    // ── 还原 bit ─────────────────────────────────────────────────────────
    // bit=1 → 间距 > 基准（正偏移）
    // bit=0 → 间距 < 基准（负偏移）
    var BIT_COUNT = 8;
    var bits = [];
    var id   = 0;
    var threshold = delta * 0.3; // 判决阈值

    for (var b = 0; b < BIT_COUNT && b < gaps.length; b++) {
      var bit = (gaps[b] - median > threshold) ? 1 : 0;
      bits.push(bit);
      if (bit) id |= (1 << b);
    }

    // 置信度：判决间距与阈值的距离越大越可信
    var margins = bits.map(function (bit, b) {
      return Math.abs(gaps[b] - median) / (delta + 0.001);
    });
    var avgMargin = margins.reduce(function (s, v) { return s + v; }, 0) / margins.length;
    var confidence = Math.min(1, avgMargin);

    return { id: id, bits: bits, gaps: gaps, median: median, confidence: confidence };
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
