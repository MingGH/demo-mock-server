/**
 * app.js - 裁剪残留实验室 / DOM 绑定与渲染
 * ES5 风格，依赖 pngkit.js 与 GSAP。
 */
(function () {
  'use strict';

  var PK = window.PngKit;

  // ──────────────────────────────────────────────────────────
  // 全局状态
  // ──────────────────────────────────────────────────────────
  var state = {
    scene: 'card',          // 当前模块一选中的场景
    canvasWidth: 720,       // 所有演示 canvas 的展示宽度（像素）
    samples: {},            // 每个场景的 {originalPng, croppedPng, originalPx, croppedPx, originalW, originalH, croppedW, croppedH}
    buggyBytes: null,       // 模块四用的 buggy 文件
    recovery: null,         // 模块四的恢复结果
    fileSelected: false
  };

  // ──────────────────────────────────────────────────────────
  // 通用工具
  // ──────────────────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function setText(el, text) { if (el) el.textContent = text; }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function setCanvasSize(canvas, w, h) {
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  function drawToCanvas(canvas, pixels, w, h) {
    var setup = setCanvasSize(canvas, w, h);
    var ctx = setup.ctx;
    var imgData = ctx.createImageData(w, h);
    imgData.data.set(pixels.subarray ? pixels.subarray(0, w * h * 4) : Array.prototype.slice.call(pixels, 0, w * h * 4));
    ctx.putImageData(imgData, 0, 0);
  }

  // ──────────────────────────────────────────────────────────
  // 模块一：场景
  // ──────────────────────────────────────────────────────────
  function buildSamples() {
    // 三张伪造截图，固定尺寸（保证 demo 的可重复性）
    var scenes = {
      card: { w: 720, h: 1280, fn: 'bank' },
      chat: { w: 720, h: 1280, fn: 'chat' },
      id:   { w: 720, h: 1280, fn: 'id' }
    };
    var out = {};
    Object.keys(scenes).forEach(function (key) {
      var sc = scenes[key];
      var px = new Uint8ClampedArray(sc.w * sc.h * 4);
      var ctx = document.createElement('canvas').getContext('2d');
      var fakeCanvas = document.createElement('canvas');
      fakeCanvas.width = sc.w; fakeCanvas.height = sc.h;
      var fakeCtx = fakeCanvas.getContext('2d');
      if (sc.fn === 'bank') PK.drawBankCardScene(fakeCtx, sc.w, sc.h, PK.fakeCardNumber(), PK.FAKE_NAMES[0]);
      else if (sc.fn === 'chat') PK.drawChatScene(fakeCtx, sc.w, sc.h);
      else if (sc.fn === 'id') PK.drawIdCardScene(fakeCtx, sc.w, sc.h);
      var imgData = fakeCtx.getImageData(0, 0, sc.w, sc.h);
      for (var i = 0; i < px.length; i++) px[i] = imgData.data[i];
      // 裁剪：上半部 (w, h*0.45)
      var cw = sc.w, ch = Math.floor(sc.h * 0.45);
      var cpx = new Uint8ClampedArray(cw * ch * 4);
      for (var y = 0; y < ch; y++) {
        for (var x = 0; x < cw; x++) {
          var si = (y * sc.w + x) * 4;
          var di = (y * cw + x) * 4;
          cpx[di] = px[si];
          cpx[di + 1] = px[si + 1];
          cpx[di + 2] = px[si + 2];
          cpx[di + 3] = 255;
        }
      }
      var origPng = PK.encodePNG({ width: sc.w, height: sc.h, pixels: px });
      var cropPng = PK.encodePNG({ width: cw, height: ch, pixels: cpx });
      // buggy = concat(crop, orig[crop..])
      var buggy = new Uint8Array(cropPng.length + (origPng.length - cropPng.length));
      buggy.set(cropPng, 0);
      buggy.set(origPng.slice(cropPng.length), cropPng.length);
      out[key] = {
        originalPx: px, originalPng: origPng, originalW: sc.w, originalH: sc.h,
        croppedPx: cpx, croppedPng: cropPng, croppedW: cw, croppedH: ch,
        buggy: buggy
      };
    });
    state.samples = out;
  }

  function renderScene() {
    var s = state.samples[state.scene];
    if (!s) return;
    var oc = $('#canvas-original');
    var cc = $('#canvas-cropped');
    if (oc) drawToCanvas(oc, s.originalPx, s.originalW, s.originalH);
    if (cc) drawToCanvas(cc, s.croppedPx, s.croppedW, s.croppedH);
    setText($('#meta-original'), '原图：' + s.originalW + ' × ' + s.originalH + ' · ' + formatBytes(s.originalPng.length));
    setText($('#meta-cropped'), '裁剪后：' + s.croppedW + ' × ' + s.croppedH + ' · ' + formatBytes(s.croppedPng.length));

    // 三个统计
    var areaOrig = s.originalW * s.originalH;
    var areaCrop = s.croppedW * s.croppedH;
    var ratio = (1 - areaCrop / areaOrig) * 100;
    setText($('#stat-area'), ratio.toFixed(0) + '%');
    // 真正反直觉的点：用户拿到的 buggy 文件和原图体积完全相同
    var buggySizeDelta = ((s.buggy.length - s.originalPng.length) / s.originalPng.length) * 100;
    setText($('#stat-size'), (buggySizeDelta >= 0 ? '+' : '') + buggySizeDelta.toFixed(0) + '%');
    setText($('#stat-residual'), (s.buggy.length - s.croppedPng.length).toLocaleString() + ' B');

    // 反差说明
    var sizeNote = $('#stat-size-note');
    if (sizeNote) {
      setText(sizeNote, '本该只有 ' + s.croppedPng.length.toLocaleString() + ' B，实际 ' + s.buggy.length.toLocaleString() + ' B');
    }

    // 点睛文案
    setText($('#punchline'), '裁掉 ' + ratio.toFixed(0) + '% 的画面，文件一个字节都没变小。');
  }

  function bindSceneTabs() {
    $$('.scene-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.scene-tab').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        state.scene = btn.getAttribute('data-scene');
        renderScene();
        // 给一个轻微的高亮
        if (window.gsap) {
          var s = state.samples[state.scene];
          window.gsap.fromTo('#punchline', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
        }
      });
    });
  }

  // ──────────────────────────────────────────────────────────
  // 模块二：字节带动画
  // ──────────────────────────────────────────────────────────
  function bindByteStage() {
    var btn = $('#byte-write-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var s = state.samples[state.scene];
      if (!s) return;
      // buggy 占比
      var ratio = s.croppedPng.length / s.originalPng.length;
      var strip = $('#byte-strip-buggy');
      if (strip) strip.style.setProperty('--buggy-new', (ratio * 100).toFixed(2) + '%');
      setText($('#byte-stage-cap'), '新数据只占 ' + (ratio * 100).toFixed(1) + '% 长度，剩下的 ' + (100 - ratio * 100).toFixed(1) + '% 是原文件的尾巴 —— 现在你的截图编辑器把它们一起保存了。');
      if (window.gsap) {
        window.gsap.fromTo(strip, { scaleX: 0 }, { scaleX: 1, transformOrigin: 'left center', duration: 0.8, ease: 'power2.out' });
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // 模块三：解析 buggy 文件
  // ──────────────────────────────────────────────────────────
  var module3 = {
    step: 1,
    parsed: null,
    buggy: null
  };

  function getBuggyBytes() {
    if (!module3.buggy) {
      var s = state.samples[state.scene];
      module3.buggy = s.buggy;
    }
    return module3.buggy;
  }

  function showPane(paneId) {
    $$('.step-pane').forEach(function (p) { p.classList.add('is-hidden'); });
    var pane = $('#' + paneId);
    if (pane) pane.classList.remove('is-hidden');
  }

  function updateStepButtons() {
    var btns = $$('.btn-step');
    btns.forEach(function (b, i) {
      b.classList.remove('is-active', 'is-done');
      if (i < module3.step - 1) b.classList.add('is-done');
      else if (i === module3.step - 1) b.classList.add('is-active');
      else b.setAttribute('disabled', 'disabled');
    });
    // 逐步启用
    btns.forEach(function (b, i) {
      if (i <= module3.step - 1) b.removeAttribute('disabled');
    });
  }

  function step3_1() {
    var bytes = getBuggyBytes();
    var sig = Array.prototype.slice.call(bytes, 0, 8);
    var ok = true;
    for (var i = 0; i < 8; i++) if (sig[i] !== PK.PNG_SIGNATURE[i]) { ok = false; break; }
    var el = $('#sig-verify');
    if (ok) {
      setText(el, '✓ 8 字节签名匹配：' + sig.map(function (b) { return ('0' + b.toString(16)).slice(-2).toUpperCase(); }).join(' '));
      el.classList.remove('fail');
    } else {
      setText(el, '✗ 签名不匹配');
      el.classList.add('fail');
    }
  }

  function step3_2() {
    var bytes = getBuggyBytes();
    var parsed = PK.parseChunks(bytes);
    module3.parsed = parsed;
    var tbody = $('#chunk-table');
    if (!tbody) return;
    var html = '<thead><tr><th>类型</th><th>偏移</th><th>长度</th><th>CRC</th></tr></thead><tbody>';
    parsed.chunks.forEach(function (c) {
      var rowClass = c.type === 'IEND' ? 'is-iend' : '';
      var crcClass = c.crcOk ? 'ok' : 'no';
      var crcText = c.crcOk ? '✓' : '✗';
      html += '<tr class="' + rowClass + '">' +
        '<td>' + c.type + '</td>' +
        '<td>' + c.offset + '</td>' +
        '<td>' + c.length + '</td>' +
        '<td class="' + crcClass + '">' + crcText + '</td>' +
        '</tr>';
    });
    html += '</tbody>';
    tbody.innerHTML = html;
  }

  function step3_3() {
    var bytes = getBuggyBytes();
    var residual = PK.findResidual(bytes);
    var el = $('#residual-num');
    if (el) {
      setText(el, (residual || 0).toLocaleString());
      if (window.gsap) {
        window.gsap.fromTo(el, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' });
      }
    }
  }

  function step3_4() {
    var bytes = getBuggyBytes();
    var residual = PK.findResidual(bytes);
    if (!residual || residual <= 0) {
      setText($('#hex-viewer'), '没有残留可显示');
      return;
    }
    var res = Array.prototype.slice.call(bytes, bytes.length - residual);
    var view = Math.min(256, res.length);
    var html = '';
    for (var i = 0; i < view; i += 16) {
      var offset = (bytes.length - residual + i).toString(16).padStart(8, '0');
      var hexPart = '';
      var asciiPart = '';
      for (var j = 0; j < 16; j++) {
        if (i + j < view) {
          var b = res[i + j];
          hexPart += ('0' + b.toString(16)).slice(-2) + ' ';
          asciiPart += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          hexPart += '   ';
          asciiPart += ' ';
        }
      }
      // 高亮 ASCII "IDAT" "IEND"
      var hexHtml = hexPart
        .replace(/(49 44 41 54)/, '<span class="hv-chunk-idat">$1</span>')
        .replace(/(49 45 4E 44)/, '<span class="hv-chunk-iend">$1</span>');
      html += '<span class="hv-offset">' + offset + '</span>  ' + hexHtml + '  <span class="hv-ascii">' + asciiPart + '</span>\n';
    }
    var el = $('#hex-viewer');
    if (el) el.innerHTML = html;
  }

  function bindModule3() {
    $$('.btn-step').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.getAttribute('data-step').split('.')[1], 10);
        if (step > module3.step) return; // 必须按顺序
        // 完成当前步后解锁下一步；重复点击已完成的步不倒退
        module3.step = Math.max(module3.step, step + 1);
        showPane('pane-3-' + step);
        updateStepButtons();
        if (step === 1) step3_1();
        else if (step === 2) step3_2();
        else if (step === 3) step3_3();
        else if (step === 4) step3_4();
      });
    });
    // 初始化第一步
    updateStepButtons();
    step3_1();
  }

  // ──────────────────────────────────────────────────────────
  // 模块四：完整恢复
  // ──────────────────────────────────────────────────────────
  var module4 = {
    rec: null,
    widthCandidates: [1080, 1440, 1284, 720],
    currentWidth: null
  };

  function drawRecoveryResult(samples, rec, isWrongWidth) {
    // 画原图
    var oc = $('#rec-original');
    if (oc) drawToCanvas(oc, samples.originalPx, samples.originalW, samples.originalH);
    // 画裁剪后
    var cc = $('#rec-cropped');
    if (cc) drawToCanvas(cc, samples.croppedPx, samples.croppedW, samples.croppedH);
    // 画恢复结果
    var rc = $('#rec-result');
    if (!rc) return;
    if (isWrongWidth || !rec || !rec.ok) {
      setCanvasSize(rc, samples.originalW, samples.originalH);
      var ctx2 = rc.getContext('2d');
      ctx2.fillStyle = '#2a3340';
      ctx2.fillRect(0, 0, samples.originalW, samples.originalH);
      if (isWrongWidth) {
        // 错误宽度：画雪花/乱码，直观表现「对不齐」
        var imgData = ctx2.createImageData(samples.originalW, samples.originalH);
        for (var i = 0; i < imgData.data.length; i += 4) {
          var v = Math.floor(Math.random() * 256);
          imgData.data[i] = v;
          imgData.data[i + 1] = v;
          imgData.data[i + 2] = v;
          imgData.data[i + 3] = 255;
        }
        ctx2.putImageData(imgData, 0, 0);
        ctx2.fillStyle = 'rgba(255, 107, 107, 0.9)';
        ctx2.font = 'bold 20px sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('✗ 宽度不匹配，无法对齐扫描线', samples.originalW / 2, samples.originalH / 2);
      } else {
        ctx2.fillStyle = '#888';
        ctx2.font = '24px sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('请先完成前面几步或选择一个宽度', samples.originalW / 2, samples.originalH / 2);
      }
      setText($('#rec-meta'), isWrongWidth ? '对齐失败 · 请换另一个宽度' : '—');
      return;
    }
    // 画布：原图尺寸，把恢复出的行放到底部
    var setup = setCanvasSize(rc, samples.originalW, samples.originalH);
    var ctx = setup.ctx;
    // 上半部分（被覆盖）填充深色 + 红色标注
    var coveredRows = samples.originalH - rec.rowCount;
    ctx.fillStyle = '#1a0a0a';
    ctx.fillRect(0, 0, samples.originalW, coveredRows);
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, coveredRows);
    ctx.lineTo(samples.originalW, coveredRows);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 107, 107, 0.6)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↑ 这部分被新数据覆盖了', samples.originalW / 2, coveredRows / 2);
    // 下半部分：恢复出的行
    var imgData = ctx.createImageData(samples.originalW, rec.rowCount);
    for (var k = 0; k < rec.rowCount; k++) {
      var row = rec.rows[k];
      for (var x = 0; x < samples.originalW; x++) {
        var di = (k * samples.originalW + x) * 4;
        imgData.data[di] = row[x * 4] || 0;
        imgData.data[di + 1] = row[x * 4 + 1] || 0;
        imgData.data[di + 2] = row[x * 4 + 2] || 0;
        imgData.data[di + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, coveredRows);
    setText($('#rec-meta'),
      'width = ' + rec.width + ' · rowCount = ' + rec.rowCount +
      ' · 置信度 = ' + (rec.confidence * 100).toFixed(2) + '% · offset = ' + rec.offset);
  }

  function setupRecovery() {
    var s = state.samples[state.scene];
    if (!s) return;
    // 初始不预选宽度，等用户点按钮
    module4.rec = null;
    module4.currentWidth = null;
    drawRecoveryResult(s, null, false);
    $$('.btn-width').forEach(function (b) {
      b.classList.remove('is-correct', 'is-wrong');
    });
    // 顶部 meta
    var res = PK.findResidual(s.buggy);
    setText($('#rec-1'), 'IEND 结束偏移 = ' + (s.buggy.length - res) + ' · 残留长度 = ' + (res || 0));
  }

  function actRec1() {
    var s = state.samples[state.scene];
    var bytes = s.buggy;
    var res = PK.findResidual(bytes);
    setText($('#rec-1'), 'IEND 结束偏移 = ' + (bytes.length - res) + ' · 残留长度 = ' + (res || 0));
    var step = $('.recovery-step[data-step="4.1"]');
    if (step) step.classList.add('is-done');
  }
  function actRec2() {
    var s = state.samples[state.scene];
    var bytes = s.buggy;
    var res = PK.findResidual(bytes);
    var residual = Array.prototype.slice.call(bytes, bytes.length - res);
    var boundary = PK.findChunkBoundary(residual);
    setText($('#rec-2'), 'boundary = ' + boundary + '（' + (boundary >= 0 ? 'CRC 校验通过' : '无干净边界，用兜底逻辑') + '）');
    var step = $('.recovery-step[data-step="4.2"]');
    if (step) step.classList.add('is-done');
  }
  function actRec3() {
    var s = state.samples[state.scene];
    var bytes = s.buggy;
    var res = PK.findResidual(bytes);
    var residual = Array.prototype.slice.call(bytes, bytes.length - res);
    var boundary = PK.findChunkBoundary(residual);
    var payload = null;
    if (boundary >= 0) payload = PK.collectIDAT(residual, boundary);
    if (!payload) payload = PK.extractResidualPayload(residual);
    setText($('#rec-3'), '载荷长度 = ' + (payload ? payload.length : 0) + ' 字节');
    var step = $('.recovery-step[data-step="4.3"]');
    if (step) step.classList.add('is-done');
  }
  function actRec4() {
    var s = state.samples[state.scene];
    var bytes = s.buggy;
    var res = PK.findResidual(bytes);
    var residual = Array.prototype.slice.call(bytes, bytes.length - res);
    var boundary = PK.findChunkBoundary(residual);
    var payload = null;
    if (boundary >= 0) payload = PK.collectIDAT(residual, boundary);
    if (!payload) payload = PK.extractResidualPayload(residual);
    var rsync = PK.resyncStoredBlocks(payload);
    if (!rsync.ok) {
      var raw = PK.resyncRawMode(payload);
      if (raw.ok) rsync = { ok: true, start: raw.start, data: raw.data };
    }
    setText($('#rec-4'), 'zlib 块头位置 = ' + (rsync.ok ? rsync.start : '?') + ' · 还原字节数 = ' + (rsync.ok ? rsync.data.length : 0));
    var step = $('.recovery-step[data-step="4.4"]');
    if (step) step.classList.add('is-done');
  }

  function actWidth(width) {
    var s = state.samples[state.scene];
    var cands = [width];
    var rec = PK.recoverResidual(s.buggy, cands);
    module4.rec = rec;
    module4.currentWidth = width;
    var isWrong = width !== s.originalW;
    drawRecoveryResult(s, rec, isWrong);
    $$('.btn-width').forEach(function (b) {
      b.classList.remove('is-correct', 'is-wrong');
      var w = parseInt(b.getAttribute('data-width'), 10);
      if (w === s.originalW) b.classList.add('is-correct');
      else if (w === width && w !== s.originalW) b.classList.add('is-wrong');
    });
    var step = $('.recovery-step[data-step="4.5"]');
    if (step) step.classList.add('is-done');
  }

  function bindModule4() {
    $$('[data-act]').forEach(function (btn) {
      var act = btn.getAttribute('data-act');
      btn.addEventListener('click', function () {
        if (act === 'rec1') actRec1();
        else if (act === 'rec2') actRec2();
        else if (act === 'rec3') actRec3();
        else if (act === 'rec4') actRec4();
      });
    });
    $$('.btn-width').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var w = parseInt(btn.getAttribute('data-width'), 10);
        actWidth(w);
      });
    });
  }

  // ──────────────────────────────────────────────────────────
  // 模块五：buggy 文件演示
  // ──────────────────────────────────────────────────────────
  function setupLeakDemo() {
    var s = state.samples[state.scene];
    var blob = new Blob([s.buggy], { type: 'image/png' });
    var url = URL.createObjectURL(blob);
    var img = $('#leak-img');
    if (img) {
      img.src = url;
    }
    var residual = PK.findResidual(s.buggy);
    setText($('#leak-meta'), 'PNG 字节：' + s.buggy.length + ' · 残留：' + (residual || 0) + ' 字节');
    setText($('#leak-residual'), (residual || 0).toLocaleString() + ' B');
    var dl = $('#leak-download');
    if (dl) {
      dl.addEventListener('click', function () {
        var a = document.createElement('a');
        a.href = url;
        a.download = 'crop-residue-sample.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // 模块六：用户文件
  // ──────────────────────────────────────────────────────────
  function handleUserFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var bytes = new Uint8Array(e.target.result);
        analyzeUserFile(bytes);
      } catch (err) {
        setUserResult('解析失败', err.message || '未知错误', 'bad', null);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function analyzeUserFile(bytes) {
    var res = PK.findResidual(bytes);
    var summary = $('#user-summary');
    var detail = $('#user-detail');
    var canvas = $('#user-canvas');
    var resultBox = $('#user-result');
    if (resultBox) resultBox.hidden = false;
    if (!res || res <= 0) {
      summary.className = 'user-summary is-good';
      setText(summary, '✓ 你的截图工具是正常的');
      setText(detail, '文件：' + bytes.length + ' 字节 · 残留：0 字节 · 没有发现 IEND 之后的尾巴。\n这通常意味着：图被裁剪后整文件被覆盖，或者图经过了一次重新编码（这两者都是安全的）。\n去模块一玩一下我们的模拟数据也行：' + bytes.length + ' B 的文件不会露出任何东西。');
      if (canvas) {
        var ctx = canvas.getContext('2d');
        setCanvasSize(canvas, 800, 200);
        ctx.fillStyle = 'rgba(129, 199, 132, 0.1)';
        ctx.fillRect(0, 0, 800, 200);
        ctx.fillStyle = '#81c784';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('安全 · 无残留', 400, 100);
      }
      return;
    }
    summary.className = 'user-summary is-bad';
    setText(summary, '⚠ 发现 ' + res.toLocaleString() + ' 字节残留');
    setText(detail, '文件：' + bytes.length + ' 字节 · IEND 之后：' + res.toLocaleString() + ' 字节。\n这张图很可能被 Pixel / Windows Markup 之类的工具处理过，原始截图数据可能还在文件尾。\n处理建议：转存为 JPEG 一遍（任何重新编码都会抹掉残留），或者干脆别发。');
    // 尝试恢复
    var rec = PK.recoverResidual(bytes, [720, 1080, 1284, 1440, 2400, 1920]);
    if (rec && rec.ok) {
      // 画恢复结果
      var setup = setCanvasSize(canvas, rec.width, rec.rowCount);
      var ctx = setup.ctx;
      var imgData = ctx.createImageData(rec.width, rec.rowCount);
      for (var k = 0; k < rec.rowCount; k++) {
        for (var x = 0; x < rec.width; x++) {
          var di = (k * rec.width + x) * 4;
          imgData.data[di] = rec.rows[k][x * 4] || 0;
          imgData.data[di + 1] = rec.rows[k][x * 4 + 1] || 0;
          imgData.data[di + 2] = rec.rows[k][x * 4 + 2] || 0;
          imgData.data[di + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      setText(detail, detail.textContent + '\n尝试恢复：width = ' + rec.width + ' · ' + rec.rowCount + ' 行 · 置信度 ' + (rec.confidence * 100).toFixed(2) + '%（结果仅供参考）');
    } else {
      if (canvas) {
        var ctx2 = canvas.getContext('2d');
        setCanvasSize(canvas, 800, 200);
        ctx2.fillStyle = 'rgba(255, 107, 107, 0.1)';
        ctx2.fillRect(0, 0, 800, 200);
        ctx2.fillStyle = '#ff6b6b';
        ctx2.font = '20px sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('残留存在但暂无法自动恢复', 400, 100);
      }
    }
  }

  function setUserResult(summary, detail, kind, dataUrl) {
    var summaryEl = $('#user-summary');
    var detailEl = $('#user-detail');
    if (summaryEl) {
      summaryEl.className = 'user-summary is-' + kind;
      setText(summaryEl, summary);
    }
    if (detailEl) setText(detailEl, detail);
  }

  function bindDropZone() {
    var zone = $('#drop-zone');
    var input = $('#file-input');
    if (!zone || !input) return;
    input.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) handleUserFile(f);
    });
    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('is-dragover');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleUserFile(f);
    });
  }

  // ──────────────────────────────────────────────────────────
  // 复制结论
  // ──────────────────────────────────────────────────────────
  function bindCopy() {
    var btn = $('#copy-conclusion');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var text = '关于「裁剪残留 / aCropalypse」的要点：\n' +
        '1. Pixel 自带截图工具 Markup 写文件时少了一个字母 t（parseMode("w") 而非 "wt"），导致新数据覆盖原文件开头，原文件尾部字节原样留在磁盘上。\n' +
        '2. 所有 PNG 解码器读到 IEND chunk 就停止，IEND 之后挂多少字节都不影响显示 —— 这就是「残留看不见」的原因。\n' +
        '3. 防御：另存为新文件（不要覆盖原文件）、分享前转存为 JPEG、打码靠像素化 + 重编码、不要靠盖图层。\n' +
        '完整交互演示：https://numfeel.996.ninja/pages/crop-residue-lab/';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          setText($('#copy-note'), '已复制到剪贴板。');
        });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); setText($('#copy-note'), '已复制到剪贴板。'); }
        catch (e) { setText($('#copy-note'), '复制失败，请手动选择。'); }
        document.body.removeChild(ta);
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // 启动
  // ──────────────────────────────────────────────────────────
  function start() {
    if (typeof PK === 'undefined' || !PK.encodePNG) {
      console.error('pngkit.js 没加载');
      return;
    }
    buildSamples();
    renderScene();
    bindSceneTabs();
    bindByteStage();
    bindModule3();
    bindModule4();
    setupRecovery();
    setupLeakDemo();
    bindDropZone();
    bindCopy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
