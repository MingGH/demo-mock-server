/* 知乎动态头像注入器 —— DOM 与交互层 */
(function () {
  'use strict';

  // 页面加载时的原生 toBlob，左侧对比卡始终用它，不受注入影响
  var PRISTINE_TO_BLOB = HTMLCanvasElement.prototype.toBlob;

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    sampleBtn: $('sampleBtn'),
    filePanel: $('filePanel'),
    previewImg: $('previewImg'),
    animBadge: $('animBadge'),
    fileName: $('fileName'),
    fileMime: $('fileMime'),
    fileSize: $('fileSize'),
    fileDim: $('fileDim'),
    msgList: $('msgList'),
    convertBtn: $('convertBtn'),
    convertStatus: $('convertStatus'),
    scriptSize: $('scriptSize'),
    scriptCode: $('scriptCode'),
    copyBtn: $('copyBtn'),
    downloadBtn: $('downloadBtn'),
    mockNormalBtn: $('mockNormalBtn'),
    injectBtn: $('injectBtn'),
    mockInjectedBtn: $('mockInjectedBtn'),
    injectStatus: $('injectStatus'),
    normalResult: $('normalResult'),
    injectedResult: $('injectedResult'),
    normalVerdict: $('normalVerdict'),
    injectedVerdict: $('injectedVerdict'),
    restoreBtn: $('restoreBtn')
  };

  /** 当前动图状态 */
  var current = null;   // { name, mime, bytes, base64, objectURL, animated }
  var scriptText = '';  // 当前生成的注入脚本
  var injected = false; // 本页是否已注入

  function track(name, props) {
    try {
      if (window.NFTrack && window.NFTrack.track) window.NFTrack.track(name, props || {});
    } catch (e) { /* 埋点绝不影响功能 */ }
  }
  function trackOnce(name, props) {
    try {
      if (window.NFTrack && window.NFTrack.trackOnce) window.NFTrack.trackOnce(name, props || {});
    } catch (e) { /* 埋点绝不影响功能 */ }
  }

  trackOnce('session_start');

  // ── 文件载入 ────────────────────────────────────────────

  function revokeOld() {
    if (current && current.objectURL) URL.revokeObjectURL(current.objectURL);
  }

  /** 如果已注入，换了新图就先还原，避免旧 Blob 继续挡路 */
  function resetInjectionIfNeeded() {
    if (injected) doRestore();
  }

  /**
   * 统一入口：拿到字节后走完校验、预览、生成脚本全流程
   * @param {string} name 文件名
   * @param {string} mime MIME
   * @param {Uint8Array} bytes 文件字节
   */
  function loadBytes(name, mime, bytes) {
    var check = validateAvatarFile({ size: bytes.length, type: mime });
    renderMessages(check);
    if (!check.ok) {
      track('file_rejected', { mime: mime || 'unknown' });
      return;
    }

    resetInjectionIfNeeded();
    revokeOld();

    var animated = detectAnimation(bytes, mime);
    current = {
      name: name,
      mime: mime,
      bytes: bytes,
      base64: bufferToBase64(bytes),
      objectURL: URL.createObjectURL(new Blob([bytes], { type: mime })),
      animated: animated
    };

    renderFilePanel();
    buildScript();

    track('file_loaded', {
      ext: (name.split('.').pop() || '').toLowerCase().slice(0, 8),
      size: sizeBucket(bytes.length),
      animated: animated
    });
  }

  function renderMessages(check) {
    var html = '';
    check.errors.forEach(function (m) {
      html += '<div class="msg msg-error"><i class="ti ti-circle-x"></i> ' + m + '</div>';
    });
    check.warnings.forEach(function (m) {
      html += '<div class="msg msg-warn"><i class="ti ti-alert-triangle"></i> ' + m + '</div>';
    });
    els.msgList.innerHTML = html;
    if (!check.ok) {
      els.filePanel.style.display = 'none';
      els.convertBtn.style.display = 'none';
      els.convertStatus.textContent = '';
    }
  }

  function renderFilePanel() {
    els.filePanel.style.display = '';
    els.previewImg.src = current.objectURL;
    els.fileName.textContent = current.name;
    els.fileMime.textContent = current.mime;
    els.fileSize.textContent = formatBytes(current.bytes.length);

    els.previewImg.onload = function () {
      els.fileDim.textContent = this.naturalWidth + ' × ' + this.naturalHeight;
    };

    if (current.animated) {
      els.animBadge.textContent = '已检测到动画帧';
      els.animBadge.className = 'anim-badge ok';
    } else {
      els.animBadge.textContent = '没检测到动画，上传也不会动';
      els.animBadge.className = 'anim-badge still';
    }

    els.convertBtn.style.display = current.mime === 'image/gif' ? '' : 'none';
    els.convertStatus.textContent = '';
  }

  // ── 脚本生成与导出 ───────────────────────────────────────

  function buildScript() {
    scriptText = buildInjectionScript({ base64: current.base64, mime: current.mime });
    // 超大脚本的完整文本会让页面渲染卡死，预览截断即可，复制/下载仍用全文
    if (scriptText.length > 2000 * 1024) {
      els.scriptCode.textContent = scriptText.slice(0, 2000) +
        '\n\n……（预览已截断，全文共 ' + formatBytes(scriptText.length) + '，复制 / 下载不受影响）';
    } else {
      els.scriptCode.textContent = scriptText;
    }
    els.scriptSize.textContent =
      '脚本长度 ' + formatBytes(scriptText.length) + '（动图 ' + formatBytes(current.bytes.length) + '）';
    els.copyBtn.disabled = false;
    els.downloadBtn.disabled = false;
    els.mockNormalBtn.disabled = false;
    els.injectBtn.disabled = false;
  }

  els.copyBtn.addEventListener('click', function () {
    function done() {
      els.copyBtn.innerHTML = '<i class="ti ti-check"></i> 已复制';
      setTimeout(function () {
        els.copyBtn.innerHTML = '<i class="ti ti-copy"></i> 复制脚本';
      }, 1600);
      track('script_copied', { size: sizeBucket(current.bytes.length) });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(scriptText).then(done, function () { fallbackCopy(done); });
    } else {
      fallbackCopy(done);
    }
  });

  function fallbackCopy(done) {
    var ta = document.createElement('textarea');
    ta.value = scriptText;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* 复制失败也只能手动 */ }
    document.body.removeChild(ta);
  }

  els.downloadBtn.addEventListener('click', function () {
    var blob = new Blob([scriptText], { type: 'text/javascript' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zhihu-avatar-inject.js';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    track('script_downloaded');
  });

  // ── 选图入口 ────────────────────────────────────────────

  els.dropzone.addEventListener('click', function () { els.fileInput.click(); });

  els.dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    els.dropzone.classList.add('dragover');
  });
  els.dropzone.addEventListener('dragleave', function () {
    els.dropzone.classList.remove('dragover');
  });
  els.dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    els.dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  els.fileInput.addEventListener('change', function () {
    if (this.files && this.files[0]) handleFile(this.files[0]);
    this.value = '';
  });

  function handleFile(file) {
    var mime = file.type || guessMime(file.name);
    var reader = new FileReader();
    reader.onload = function () {
      loadBytes(file.name, mime, new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  }

  els.sampleBtn.addEventListener('click', function () {
    if (!window.SAMPLE_WEBP || !window.SAMPLE_WEBP.base64) {
      els.convertStatus.textContent = '样例数据没加载到，请自己传一张图';
      return;
    }
    var bytes = base64ToBytes(window.SAMPLE_WEBP.base64);
    loadBytes(window.SAMPLE_WEBP.name, window.SAMPLE_WEBP.mime, bytes);
    track('sample_loaded');
  });

  // ── gif → webp 转换（ffmpeg.wasm 懒加载）────────────────

  var ffmpegLoading = null;

  function loadScriptTag(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureFfmpeg() {
    if (ffmpegLoading) return ffmpegLoading;
    ffmpegLoading = loadScriptTag('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js')
      .then(function () {
        var ffmpeg = window.FFmpeg.createFFmpeg({
          log: false,
          corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        ffmpeg.setProgress(function (p) {
          var pct = Math.max(0, Math.min(100, Math.round((p.ratio || 0) * 100)));
          els.convertStatus.textContent = '转换中 ' + pct + '%';
        });
        return ffmpeg.load().then(function () { return ffmpeg; });
      });
    return ffmpegLoading;
  }

  els.convertBtn.addEventListener('click', function () {
    if (!current || current.mime !== 'image/gif') return;
    var before = current.bytes.length;
    els.convertBtn.disabled = true;
    els.convertStatus.textContent = '首次使用要加载转换组件（约 20MB）…';

    ensureFfmpeg().then(function (ffmpeg) {
      els.convertStatus.textContent = '转换中…';
      return window.FFmpeg.fetchFile(new Blob([current.bytes], { type: current.mime }))
        .then(function (data) {
          ffmpeg.FS('writeFile', 'input.gif', data);
          return ffmpeg.run(
            '-i', 'input.gif',
            '-c:v', 'libwebp',
            '-loop', '0',
            '-q:v', '75',
            '-vf', 'scale=w=min(480\\,iw):h=-2',
            'output.webp'
          );
        })
        .then(function () {
          var out = ffmpeg.FS('readFile', 'output.webp');
          try { ffmpeg.FS('unlink', 'input.gif'); ffmpeg.FS('unlink', 'output.webp'); } catch (e) {}
          return out;
        });
    }).then(function (out) {
      var after = out.length;
      loadBytes(current.name.replace(/\.gif$/i, '') + '.webp', 'image/webp', out);
      els.convertStatus.textContent =
        '转换完成：' + formatBytes(before) + ' → ' + formatBytes(after);
      track('convert_webp', { ok: true, from: sizeBucket(before), to: sizeBucket(after) });
    }).catch(function (err) {
      var detail = err && err.message ? '：' + err.message : '';
      els.convertStatus.textContent = '转换组件加载失败' + detail + '。可直接注入 gif，或换个在线工具转 webp。';
      track('convert_webp', { ok: false });
    }).finally(function () {
      els.convertBtn.disabled = false;
    });
  });

  // ── 本页模拟实验室 ───────────────────────────────────────

  /**
   * 模拟知乎「保存头像」：把动图当前帧画上 canvas，再 toBlob 取结果
   * @param {Function} toBlobFn 用哪个 toBlob（原生 or 当前可能被劫持的）
   * @param {HTMLElement} resultBox 结果容器
   * @param {HTMLElement} verdictBox 结论容器
   * @param {boolean} viaInjection 是否走注入路径（仅用于埋点与文案）
   */
  function mockSave(toBlobFn, resultBox, verdictBox, viaInjection) {
    var img = els.previewImg;
    var canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 240;
    canvas.height = img.naturalHeight || 240;
    canvas.getContext('2d').drawImage(img, 0, 0);

    toBlobFn.call(canvas, function (blob) {
      var url = URL.createObjectURL(blob);
      resultBox.innerHTML = '';
      var out = document.createElement('img');
      out.src = url;
      out.alt = '上传结果';
      resultBox.appendChild(out);

      var meta = { size: blob.size, type: blob.type };
      var same = blobsLikelyEqual(meta, { size: current.bytes.length, type: current.mime });
      if (same) {
        verdictBox.innerHTML = '<span class="v-ok"><i class="ti ti-circle-check"></i> 拿到的是完整动图，和原文件一致（' +
          formatBytes(blob.size) + '）</span>';
      } else {
        verdictBox.innerHTML = '<span class="v-bad"><i class="ti ti-scissors"></i> 只拿到一帧静态截图（' +
          blob.type + '，' + formatBytes(blob.size) + '）</span>';
      }
      track('mock_upload', { injected: viaInjection, animated: same });
    }, 'image/png');
  }

  els.mockNormalBtn.addEventListener('click', function () {
    if (!current) return;
    mockSave(PRISTINE_TO_BLOB, els.normalResult, els.normalVerdict, false);
  });

  els.injectBtn.addEventListener('click', function () {
    if (!scriptText) return;
    try {
      new Function(scriptText)();
      injected = true;
      els.injectStatus.innerHTML = '注入状态：<span class="status-on">已注入</span>';
      els.mockInjectedBtn.disabled = false;
      els.restoreBtn.disabled = false;
      track('inject_local');
    } catch (e) {
      els.injectStatus.textContent = '注入失败：' + e.message;
    }
  });

  els.mockInjectedBtn.addEventListener('click', function () {
    if (!current || !injected) return;
    mockSave(HTMLCanvasElement.prototype.toBlob, els.injectedResult, els.injectedVerdict, true);
  });

  function doRestore() {
    if (typeof window.__restoreAvatarUpload === 'function') {
      window.__restoreAvatarUpload();
    }
    injected = false;
    els.injectStatus.textContent = '注入状态：未注入';
    els.mockInjectedBtn.disabled = true;
    els.restoreBtn.disabled = true;
  }

  els.restoreBtn.addEventListener('click', function () {
    doRestore();
    track('restore_local');
  });
})();
