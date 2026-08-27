(function () {
  'use strict';

  // ── 常量 ──────────────────────────────────────────────────────────────
  var IMG_SIZE = 64;            // 图片统一缩到 64×64
  var LEVELS = 16;              // 16 级灰度（调色板大小）
  var ANIM_SPEEDS = [8, 20, 60]; // 步/秒：慢 / 中 / 快
  var NOISE_SIZES = [256, 1024, 4096];
  var NOISE_PREVIEW_BYTES = 200;
  var CELL_WINDOW = 90;         // 读头动画：输入一次渲染的符号窗口
  var DICT_ROWS_CAP = 600;      // 字典表渲染上限（超过后头尾保留）
  var CHIPS_CAP = 1200;         // 编号流渲染上限

  var PRESETS = {
    poem: '所谓伊人，在水一方。所谓伊人，在水一方。溯洄从之，道阻且长；溯洄从之，道阻且长。',
    tongue: '扁担长，板凳宽，板凳没有扁担长，扁担没有板凳宽。扁担偏说板凳没有扁担宽，板凳偏说扁担没有板凳长。',
    prose: '压缩并不是什么魔法。它只是发现了一件事：大部分文件里，重复的东西比想象中多得多。同一个词、同一句话、同一片颜色，总是反复出现。LZW 把这些重复记进一张字典，下次再遇到，只说一个编号就够了。'
  };
  var TYPE_LABELS = { text: '文本', image: '图片', noise: '随机噪声' };

  // ── 状态 ──────────────────────────────────────────────────────────────
  var DOM = {};
  var state = {
    type: 'text',
    imageLevels: null,   // 图片：16 级灰度符号数组
    imageGray: null,     // 图片：8 位灰度（用于画原图）
    noiseBytes: [],      // 噪声：字节值符号数组
    noiseHex: '',
    inputSymbols: [],    // 当前压缩的输入符号（动画渲染用）
    result: null,        // encode() 输出
    meta: null,          // { origBytes, inputText }
    animStep: 0,
    animPlaying: false,
    animTimer: null
  };

  // ── 埋点 ──────────────────────────────────────────────────────────────
  // 事件设计（从「要回答什么问题」倒推）：
  // - session_start: 打开页面，漏斗起点
  // - upload:        选图 {source: file|default}，回答「多少人用自己的图、多少用默认图」
  // - input_type:    压缩时记录 {type: text|image|noise}，回答「三种输入哪种被玩得最多」
  // - animate_start: 第一次点播放 {stepCount}，回答「多少人看了过程动画」
  // - download:      下载压缩结果，回答「多少人想要这份产物」
  // - session_hidden: 切后台（不等于离开，见 AGENTS.md 的通用坑）
  // - session_end:   pagehide 真实离页 {reason, stage}，回答「在哪一步流失」
  // 漏斗：session_start → input_type → (animate_start | download) → session_end
  // 只镜像低频收尾事件到 umami；input_type / animate_start 这类过程事件一律不镜像。
  window.NF_TRACK_UMAMI_MIRROR = ['session_end'];

  var trackSessionActive = false;
  var trackStage = 'landing';
  var trackAnimateLogged = false;

  /** 安全调用 NFTrack；SDK 未加载、被拦截或抛错都不应影响页面。 */
  function nfTrack(name, props, opts) {
    try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
  }

  function trackSessionStart() {
    if (trackSessionActive) return;
    trackSessionActive = true;
    nfTrack('session_start', {});
  }

  function trackSessionEnd(reason) {
    if (!trackSessionActive) return;
    trackSessionActive = false;
    nfTrack('session_end', { reason: reason, stage: trackStage }, { force: true });
  }

  function trackSessionHidden() {
    if (!trackSessionActive) return;
    nfTrack('session_hidden', { reason: 'hidden', stage: trackStage }, { force: true });
  }

  function registerTrackLeaveHandler() {
    // 切后台 / 锁屏都会触发 hidden，不能当作会话结束；真实离页用 pagehide 兜底
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') trackSessionHidden();
    });
    window.addEventListener('pagehide', function () { trackSessionEnd('leave'); });
  }

  // ── 工具 ──────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    DOM.typeTabs = $('typeTabs');
    DOM.panelText = $('panelText');
    DOM.panelImage = $('panelImage');
    DOM.panelNoise = $('panelNoise');
    DOM.textInput = $('textInput');
    DOM.imageUploadZone = $('imageUploadZone');
    DOM.imageFile = $('imageFile');
    DOM.imagePreview = $('imagePreview');
    DOM.previewOriginalCanvas = $('previewOriginalCanvas');
    DOM.previewQuantCanvas = $('previewQuantCanvas');
    DOM.noiseSizeSlider = $('noiseSizeSlider');
    DOM.noiseSizeVal = $('noiseSizeVal');
    DOM.noisePreview = $('noisePreview');
    DOM.compressBtn = $('compressBtn');
    DOM.statsRow = $('statsRow');
    DOM.statOrigBytes = $('statOrigBytes');
    DOM.statCompBytes = $('statCompBytes');
    DOM.statRatio = $('statRatio');
    DOM.statDict = $('statDict');
    DOM.statTime = $('statTime');
    DOM.sizeBreakdown = $('sizeBreakdown');
    DOM.verifySection = $('verifySection');
    DOM.losslessBadge = $('losslessBadge');
    DOM.losslessBadgeText = $('losslessBadgeText');
    DOM.verifyText = $('verifyText');
    DOM.verifyImage = $('verifyImage');
    DOM.verifyNoise = $('verifyNoise');
    DOM.origTextDisplay = $('origTextDisplay');
    DOM.decodedTextDisplay = $('decodedTextDisplay');
    DOM.verifyOrigCanvas = $('verifyOrigCanvas');
    DOM.verifyDecodedCanvas = $('verifyDecodedCanvas');
    DOM.verifyPixelDiff = $('verifyPixelDiff');
    DOM.origNoiseDisplay = $('origNoiseDisplay');
    DOM.decodedNoiseDisplay = $('decodedNoiseDisplay');
    DOM.downloadBtn = $('downloadBtn');
    DOM.copyBtn = $('copyBtn');
    DOM.animSection = $('animSection');
    DOM.pigeonSection = $('pigeonSection');
    DOM.animPlayBtn = $('animPlayBtn');
    DOM.animRestartBtn = $('animRestartBtn');
    DOM.animSpeedSlider = $('animSpeedSlider');
    DOM.animSpeedVal = $('animSpeedVal');
    DOM.animProgressSlider = $('animProgressSlider');
    DOM.stepCounter = $('stepCounter');
    DOM.stepDescCode = $('stepDescCode');
    DOM.stepDescText = $('stepDescText');
    DOM.animInput = $('animInput');
    DOM.dictTable = $('dictTable');
    DOM.codeChips = $('codeChips');
  }

  // ── 输入类型切换 ──────────────────────────────────────────────────────
  function switchType(type) {
    state.type = type;
    stopAnim();
    var tabs = DOM.typeTabs.querySelectorAll('.type-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].className = tabs[i].getAttribute('data-type') === type
        ? 'type-tab active' : 'type-tab';
    }
    DOM.panelText.style.display = type === 'text' ? '' : 'none';
    DOM.panelImage.style.display = type === 'image' ? '' : 'none';
    DOM.panelNoise.style.display = type === 'noise' ? '' : 'none';
    if (type === 'image' && !state.imageLevels) {
      loadDefaultImage(); // 零门槛：切到图片就有现成的示例
    }
    if (type === 'noise' && state.noiseBytes.length === 0) {
      generateNoise();
    }
    hideResult();
  }

  function hideResult() {
    DOM.statsRow.style.display = 'none';
    DOM.sizeBreakdown.style.display = 'none';
    DOM.verifySection.style.display = 'none';
    DOM.animSection.style.display = 'none';
    DOM.pigeonSection.style.display = 'none';
    state.result = null;
    state.meta = null;
  }

  // ── 文本 ──────────────────────────────────────────────────────────────
  function applyTextPreset(name) {
    DOM.textInput.value = PRESETS[name] || '';
  }

  // ── 图片 ──────────────────────────────────────────────────────────────
  function drawDefaultSample(ctx) {
    var s = IMG_SIZE;
    var d = ctx.createImageData(s, s);
    for (var y = 0; y < s; y++) {
      for (var x = 0; x < s; x++) {
        var v;
        if (x < s / 2 && y < s / 2) {
          v = 128;                                    // 左上：整块纯灰（长重复）
        } else if (x >= s / 2 && y < s / 2) {
          v = Math.round(x / s * 255);                // 右上：横向渐变
        } else if (x < s / 2 && y >= s / 2) {
          v = (Math.floor(y / 4) % 2) ? 255 : 0;      // 左下：横条纹（强重复）
        } else {
          v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 255 : 0; // 右下：棋盘（难压）
        }
        var p = (y * s + x) * 4;
        d.data[p] = v; d.data[p + 1] = v; d.data[p + 2] = v; d.data[p + 3] = 255;
      }
    }
    ctx.putImageData(d, 0, 0);
  }

  /** 把 Image 转成 64×64 8 位灰度 + 16 级灰度符号流 */
  function processImage(img) {
    var canvas = document.createElement('canvas');
    canvas.width = IMG_SIZE;
    canvas.height = IMG_SIZE;
    var ctx = canvas.getContext('2d');
    var scale = Math.max(IMG_SIZE / img.naturalWidth, IMG_SIZE / img.naturalHeight);
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    ctx.drawImage(img, (IMG_SIZE - dw) / 2, (IMG_SIZE - dh) / 2, dw, dh);
    var data = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;
    var gray = new Uint8Array(IMG_SIZE * IMG_SIZE);
    var levels = [];
    for (var i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
      var g = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
      gray[i] = g;
      levels.push(String(Math.floor(g * LEVELS / 256)));
    }
    state.imageGray = gray;
    state.imageLevels = levels;
    drawGrayTo(DOM.previewOriginalCanvas, gray, IMG_SIZE, IMG_SIZE);
    drawLevelsTo(DOM.previewQuantCanvas, levels, IMG_SIZE, IMG_SIZE);
    DOM.imagePreview.style.display = '';
  }

  function loadDefaultImage() {
    var canvas = document.createElement('canvas');
    canvas.width = IMG_SIZE;
    canvas.height = IMG_SIZE;
    var ctx = canvas.getContext('2d');
    drawDefaultSample(ctx);
    var img = new Image();
    img.onload = function () {
      processImage(img);
      nfTrack('upload', { source: 'default' });
    };
    img.onerror = function () { flashHint(); };
    img.src = canvas.toDataURL();
  }

  function loadImageFile(file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      processImage(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      flashHint();
    };
    img.src = url;
    nfTrack('upload', { source: 'file' });
  }

  function drawGrayTo(canvas, gray, w, h) {
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var d = ctx.createImageData(w, h);
    for (var i = 0; i < gray.length; i++) {
      d.data[i * 4] = gray[i];
      d.data[i * 4 + 1] = gray[i];
      d.data[i * 4 + 2] = gray[i];
      d.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
  }

  function drawLevelsTo(canvas, levels, w, h) {
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var d = ctx.createImageData(w, h);
    for (var i = 0; i < levels.length; i++) {
      var v = Math.round(parseInt(levels[i], 10) * 255 / (LEVELS - 1));
      d.data[i * 4] = v;
      d.data[i * 4 + 1] = v;
      d.data[i * 4 + 2] = v;
      d.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
  }

  // ── 噪声 ──────────────────────────────────────────────────────────────
  function generateNoise() {
    var size = NOISE_SIZES[parseInt(DOM.noiseSizeSlider.value, 10)];
    var arr = new Uint8Array(size);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    var bytes = [];
    for (var j = 0; j < size; j++) bytes.push(String(arr[j]));
    state.noiseBytes = bytes;
    var preview = [];
    for (var k = 0; k < Math.min(size, NOISE_PREVIEW_BYTES); k++) {
      preview.push(('0' + arr[k].toString(16)).slice(-2).toUpperCase());
    }
    state.noiseHex = preview.join(' ') + (size > NOISE_PREVIEW_BYTES ? '  …' : '');
    DOM.noisePreview.textContent = state.noiseHex;
    DOM.noiseSizeVal.textContent = size + ' B';
  }

  // ── 压缩主流程 ────────────────────────────────────────────────────────
  function compress() {
    stopAnim();
    var type = state.type;
    var symbols = null;
    var origBytes = 0;
    var inputText = '';

    if (type === 'text') {
      var t = DOM.textInput.value;
      if (!t) { flashHint(); return; }
      inputText = t;
      symbols = LZW.toSymbols(t);
      origBytes = LZW.utf8Length(t);
    } else if (type === 'image') {
      if (!state.imageLevels) { flashHint(); return; }
      symbols = state.imageLevels;
      origBytes = symbols.length; // 8 位灰度像素，每像素 1 字节
    } else {
      if (state.noiseBytes.length === 0) generateNoise();
      symbols = state.noiseBytes;
      origBytes = symbols.length;
    }

    var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    var res = LZW.encode(symbols, { byteAlphabet: type !== 'text' });
    var ms = Math.max(1, Math.round(((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0));

    state.result = res;
    state.meta = { origBytes: origBytes, inputText: inputText, type: type };
    state.inputSymbols = symbols;

    DOM.statOrigBytes.textContent = formatBytes(origBytes);
    DOM.statCompBytes.textContent = formatBytes(res.totalBytes);
    var ratio = origBytes / res.totalBytes;
    DOM.statRatio.textContent = ratio.toFixed(2) + '×';
    DOM.statDict.textContent = res.initialDictSize + ' → ' + res.finalDictSize;
    DOM.statTime.textContent = ms + ' ms';
    DOM.statsRow.style.display = '';

    var breakdown = '压缩后 = <b>' + formatBytes(res.alphabetBytes) + '</b> 字母表（起手字典，'
      + res.initialDictSize + ' 项）+ <b>' + formatBytes(res.codeBytes) + '</b> 编号流（'
      + res.codes.length + ' 个编号 × 每编号 ' + res.codeWidth + ' bit 定长打包）';
    if (type !== 'text') breakdown += '。字母表按 GIF 调色板方式记账：每项 1 字节';
    DOM.sizeBreakdown.innerHTML = breakdown;
    DOM.sizeBreakdown.style.display = '';

    // 无损验证
    renderVerify();

    // 动画区
    state.animStep = 0;
    DOM.animProgressSlider.max = String(Math.max(1, res.steps.length - 1));
    DOM.animProgressSlider.value = '0';
    DOM.animSection.style.display = '';
    renderAnim();

    // 鸽巢原理提示只在噪声时出现
    DOM.pigeonSection.style.display = type === 'noise' ? '' : 'none';

    trackStage = 'compressed';
    nfTrack('input_type', { type: type });
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    return (n / 1024).toFixed(2) + ' KB';
  }

  function flashHint() {
    DOM.compressBtn.style.animation = 'none';
    // 触发重排后恢复，让按钮抖一下
    void DOM.compressBtn.offsetWidth;
    DOM.compressBtn.style.animation = 'shake 0.4s';
    DOM.compressBtn.style.boxShadow = '0 0 0 2px rgba(255,107,107,0.5)';
    setTimeout(function () {
      DOM.compressBtn.style.boxShadow = '';
    }, 500);
  }

  // ── 无损验证 ──────────────────────────────────────────────────────────
  function renderVerify() {
    var res = state.result;
    var meta = state.meta;
    var ok = false;
    var dec = null;
    try {
      dec = LZW.decode(res.alphabet, res.codes);
      ok = true;
    } catch (e) {
      ok = false;
    }

    DOM.verifySection.style.display = '';
    DOM.verifyText.style.display = 'none';
    DOM.verifyImage.style.display = 'none';
    DOM.verifyNoise.style.display = 'none';

    if (meta.type === 'text') {
      DOM.verifyText.style.display = '';
      DOM.origTextDisplay.textContent = meta.inputText;
      DOM.decodedTextDisplay.textContent = dec ? dec.text : '(解码失败)';
      if (ok) ok = dec.text === meta.inputText;
    } else if (meta.type === 'image') {
      DOM.verifyImage.style.display = '';
      drawGrayTo(DOM.verifyOrigCanvas, state.imageGray, IMG_SIZE, IMG_SIZE);
      if (ok) {
        drawLevelsTo(DOM.verifyDecodedCanvas, dec.symbols, IMG_SIZE, IMG_SIZE);
        ok = arraysEqual(state.imageLevels, dec.symbols);
      }
      DOM.verifyPixelDiff.textContent = ok
        ? (IMG_SIZE * IMG_SIZE) + ' 个像素全部一致（16 级灰逐级对比）'
        : '像素对比不一致！';
    } else {
      DOM.verifyNoise.style.display = '';
      DOM.origNoiseDisplay.textContent = state.noiseHex;
      if (ok) {
        var hex = [];
        var bytes = [];
        for (var i = 0; i < dec.symbols.length; i++) bytes.push(parseInt(dec.symbols[i], 10));
        for (var j = 0; j < Math.min(bytes.length, NOISE_PREVIEW_BYTES); j++) {
          hex.push(('0' + bytes[j].toString(16)).slice(-2).toUpperCase());
        }
        DOM.decodedNoiseDisplay.textContent = hex.join(' ')
          + (bytes.length > NOISE_PREVIEW_BYTES ? '  …' : '');
        ok = arraysEqual(state.noiseBytes, dec.symbols);
      } else {
        DOM.decodedNoiseDisplay.textContent = '(解码失败)';
      }
    }

    DOM.losslessBadge.className = ok ? 'lossless-badge' : 'lossless-badge fail';
    DOM.losslessBadgeText.textContent = ok
      ? '逐字节一致，无损成立'
      : '解压结果与原文不一致！';
    if (ok) trackStage = 'verified';
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // ── 动画 ──────────────────────────────────────────────────────────────
  function renderAnim() {
    var res = state.result;
    var steps = res.steps;
    var idx = Math.max(0, Math.min(state.animStep, steps.length - 1));
    var st = steps[idx];

    DOM.stepCounter.textContent = (idx + 1) + ' / ' + steps.length;
    DOM.animProgressSlider.value = String(idx);

    // 读头：窗口化渲染
    var start = Math.max(0, st.pos - CELL_WINDOW * 2 / 3);
    var end = Math.min(res.symbolCount, st.pos + CELL_WINDOW / 3);
    var html = [];
    if (start > 0) html.push('<span class="sym-ellipsis">… ' + start + ' 个符号 …</span>');
    for (var i = start; i < end; i++) {
      var cls = ['sym-cell'];
      if (i < st.pos) cls.push('consumed');
      if (i >= st.matchedStart && i < st.matchedEnd) cls.push('matched');
      if (!st.flush && i === st.pos) cls.push('learned');
      if (i === st.pos) cls.push('readhead');
      html.push('<span class="' + cls.join(' ') + '">' + escapeHtml(state.inputSymbols[i]) + '</span>');
    }
    if (end < res.symbolCount) html.push('<span class="sym-ellipsis">… ' + (res.symbolCount - end) + ' 个符号 …</span>');
    DOM.animInput.innerHTML = html.join('');

    // 字典表：字母表行 + 已学词条行
    var rows = [];
    for (var a = 0; a < res.alphabet.length; a++) {
      rows.push({ code: a, key: res.alphabet[a], kind: 'alphabet' });
    }
    for (var s = 0; s < idx; s++) {
      var step = steps[s];
      if (!step.flush) rows.push({ code: step.newCode, key: step.newKey.join(''), kind: 'learned', learnedAt: s });
    }
    var matchedKey = st.matched.join('');
    var dictHtml = ['<tr><th>编号</th><th>词条</th></tr>'];
    var shown = 0;
    var totalRows = rows.length;
    var skipStart = totalRows > DICT_ROWS_CAP ? 80 : -1;
    var skipEnd = totalRows > DICT_ROWS_CAP ? totalRows - (DICT_ROWS_CAP - 80) : totalRows;
    for (var r = 0; r < totalRows; r++) {
      if (skipStart >= 0 && r >= skipStart && r < skipEnd) {
        if (r === skipStart) dictHtml.push('<tr><td colspan="2" style="color:#555;">… 中间省略 '
          + (skipEnd - skipStart) + ' 行 …</td></tr>');
        continue;
      }
      var row = rows[r];
      var cls = row.kind === 'alphabet' ? 'alphabet-row' : 'learned-row';
      if (row.kind === 'learned' && row.key === matchedKey && row.code === st.emitted) {
        cls = 'matched-row';
      }
      dictHtml.push('<tr class="' + cls + '"><td>' + row.code + '</td><td>' + escapeHtml(row.key) + '</td></tr>');
      shown++;
    }
    DOM.dictTable.innerHTML = dictHtml.join('');
    // 匹配行滚动可见
    var matchedEl = DOM.dictTable.querySelector('.matched-row');
    if (matchedEl && matchedEl.scrollIntoView) {
      matchedEl.scrollIntoView({ block: 'nearest' });
    }

    // 编号流
    var chipHtml = [];
    var chips = res.codes.slice(0, idx + 1);
    var chipStart = chips.length > CHIPS_CAP ? chips.length - CHIPS_CAP : 0;
    if (chipStart > 0) chipHtml.push('<span class="sym-ellipsis">… 前 ' + chipStart + ' 个省略 …</span>');
    for (var c = chipStart; c < chips.length; c++) {
      var chipCls = c === chips.length - 1 ? 'code-chip latest' : 'code-chip';
      chipHtml.push('<span class="' + chipCls + '">' + chips[c] + '</span>');
    }
    DOM.codeChips.innerHTML = chipHtml.join('');

    // 步骤描述
    if (st.flush) {
      DOM.stepDescCode.textContent = '#' + st.emitted;
      DOM.stepDescText.textContent = '读完了！最后把「' + st.matched.join('')
        + '」报成编号 ' + st.emitted + '，编码结束。';
    } else {
      DOM.stepDescCode.textContent = '#' + st.emitted;
      DOM.stepDescText.textContent = '读到「' + escapeHtml(st.symbol)
        + '」，字典里最长匹配是「' + escapeHtml(st.matched.join(''))
        + '」→ 报编号 ' + st.emitted + '；把「' + escapeHtml(st.newKey.join(''))
        + '」学进字典 → 编号 ' + st.newCode;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function animTick() {
    if (!state.animPlaying) return;
    var steps = state.result.steps;
    if (state.animStep >= steps.length - 1) {
      stopAnim();
      return;
    }
    state.animStep++;
    renderAnim();
    var speedIdx = parseInt(DOM.animSpeedSlider.value, 10) - 1;
    state.animTimer = setTimeout(animTick, 1000 / ANIM_SPEEDS[speedIdx]);
  }

  function startAnim() {
    if (state.animPlaying) return;
    if (!state.result) return;
    if (!trackAnimateLogged) {
      trackAnimateLogged = true;
      nfTrack('animate_start', { stepCount: state.result.steps.length });
    }
    if (state.animStep >= state.result.steps.length - 1) state.animStep = 0;
    state.animPlaying = true;
    DOM.animPlayBtn.innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
    trackStage = 'animated';
    animTick();
  }

  function stopAnim() {
    state.animPlaying = false;
    if (state.animTimer) { clearTimeout(state.animTimer); state.animTimer = null; }
    DOM.animPlayBtn.innerHTML = '<i class="ti ti-player-play"></i> 播放';
  }

  function restartAnim() {
    stopAnim();
    if (!state.result) return;
    state.animStep = 0;
    renderAnim();
  }

  // ── 下载 / 复制 ───────────────────────────────────────────────────────
  function buildResultText() {
    var res = state.result;
    var meta = state.meta;
    var ratio = (meta.origBytes / res.totalBytes).toFixed(2);
    var lines = [];
    lines.push('# LZW 压缩结果（演示格式；真实文件把编号按位打包成二进制）');
    lines.push('# 输入类型: ' + TYPE_LABELS[meta.type]);
    lines.push('# 原始大小: ' + meta.origBytes + ' B');
    lines.push('# 压缩后: ' + res.totalBytes + ' B（字母表 ' + res.alphabetBytes
      + ' B + 编号流 ' + res.codeBytes + ' B，每编号 ' + res.codeWidth + ' bit）');
    lines.push('# 压缩比: ' + ratio + '×');
    lines.push('# 字母表（起手字典，' + res.alphabet.length + ' 项）:');
    lines.push(meta.type === 'text' ? res.alphabet.join('') : res.alphabet.join(' '));
    lines.push('# 编号流（' + res.codes.length + ' 个）:');
    lines.push(res.codes.join(' '));
    return lines.join('\n');
  }

  function downloadResult() {
    if (!state.result) return;
    var text = buildResultText();
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'lzw-result.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    nfTrack('download', {});
  }

  function copyResult() {
    if (!state.result) return;
    var text = buildResultText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        copyFeedback();
      }, function () { legacyCopy(text); });
    } else {
      legacyCopy(text);
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); copyFeedback(); } catch (e) {}
    document.body.removeChild(ta);
  }

  function copyFeedback() {
    var old = DOM.copyBtn.innerHTML;
    DOM.copyBtn.innerHTML = '<i class="ti ti-check"></i> 已复制';
    setTimeout(function () { DOM.copyBtn.innerHTML = old; }, 1200);
  }

  // ── 事件绑定 ──────────────────────────────────────────────────────────
  function bindEvents() {
    DOM.typeTabs.addEventListener('click', function (e) {
      var tab = e.target.closest ? e.target.closest('.type-tab') : null;
      if (tab) switchType(tab.getAttribute('data-type'));
    });

    var presetBtns = document.querySelectorAll('.text-preset');
    for (var i = 0; i < presetBtns.length; i++) {
      presetBtns[i].addEventListener('click', function () {
        applyTextPreset(this.getAttribute('data-text'));
      });
    }

    DOM.imageUploadZone.addEventListener('click', function () {
      DOM.imageFile.click();
    });
    DOM.imageUploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      DOM.imageUploadZone.classList.add('dragover');
    });
    DOM.imageUploadZone.addEventListener('dragleave', function () {
      DOM.imageUploadZone.classList.remove('dragover');
    });
    DOM.imageUploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      DOM.imageUploadZone.classList.remove('dragover');
      var f = e.dataTransfer.files[0];
      if (f && f.type.indexOf('image/') === 0) loadImageFile(f);
    });
    DOM.imageFile.addEventListener('change', function () {
      if (this.files && this.files[0]) loadImageFile(this.files[0]);
    });
    $('useDefaultImageBtn').addEventListener('click', loadDefaultImage);

    DOM.noiseSizeSlider.addEventListener('input', generateNoise);
    $('regenerateNoiseBtn').addEventListener('click', generateNoise);

    DOM.compressBtn.addEventListener('click', compress);

    DOM.downloadBtn.addEventListener('click', downloadResult);
    DOM.copyBtn.addEventListener('click', copyResult);

    DOM.animPlayBtn.addEventListener('click', function () {
      if (state.animPlaying) stopAnim();
      else startAnim();
    });
    DOM.animRestartBtn.addEventListener('click', restartAnim);
    DOM.animSpeedSlider.addEventListener('input', function () {
      var labels = ['慢', '中', '快'];
      DOM.animSpeedVal.textContent = labels[parseInt(this.value, 10) - 1];
    });
    DOM.animProgressSlider.addEventListener('input', function () {
      stopAnim();
      state.animStep = parseInt(this.value, 10);
      renderAnim();
    });
  }

  // ── 启动 ──────────────────────────────────────────────────────────────
  function init() {
    cacheDom();
    bindEvents();
    applyTextPreset('poem');
    registerTrackLeaveHandler();
    trackSessionStart();
    trackStage = 'input';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
