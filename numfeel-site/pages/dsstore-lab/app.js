/**
 * app.js - .DS_Store 解剖器的 DOM 绑定与渲染
 *
 * 只负责事件、渲染、动画；纯逻辑调用 DSStore（解析/构造）与 DSStorePresets（场景数据）。
 * 打开页面即自动加载第一个预设并解析，不需要用户先操作。
 */
(function () {
  'use strict';

  var currentBytes = null;     // 当前正在解剖的 .DS_Store 字节
  var currentResult = null;    // 最近一次 DSStore.parse 的结果
  var currentPresetId = null;  // 当前激活的预设 id（上传真实文件时为 null）
  var scanTimeline = null;     // 当前终端扫描的 GSAP timeline，用于重叠时清理

  // ── DOM 引用 ──
  var $ = function (sel) { return document.querySelector(sel); };
  var presetGrid = $('#presetGrid');
  var uploadZone = $('#uploadZone');
  var fileInput = $('#fileInput');
  var leakCountEl = $('#leakCount');
  var anatomySourceEl = $('#anatomySource');
  var hexPreviewEl = $('#hexPreview');
  var fileListEl = $('#fileList');
  var copyBtn = $('#copyBtn');
  var scanBtn = $('#scanBtn');
  var scanResetBtn = $('#scanResetBtn');
  var terminalOutput = $('#terminalOutput');
  var terminalCount = $('#terminalCount');
  var heroCta = $('#heroCta');

  // ─────────────────────────────────────────────────────────
  // 启动
  // ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    renderPresetCards();
    bindUpload();
    bindCopy();
    bindScan();
    bindHeroCta();

    // 零门槛启动：自动加载第一个预设
    var first = DSStorePresets.PRESETS[0];
    if (first) {
      loadPreset(first);
    }
  }

  // ─────────────────────────────────────────────────────────
  // 预设卡片
  // ─────────────────────────────────────────────────────────
  /**
   * 渲染预设场景卡片
   */
  function renderPresetCards() {
    presetGrid.innerHTML = '';
    DSStorePresets.PRESETS.forEach(function (p) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'preset-card';
      card.dataset.id = p.id;
      card.innerHTML =
        '<div class="preset-name"><i class="ti ti-folder"></i> ' + escapeHtml(p.name) + '</div>' +
        '<div class="preset-note">' + escapeHtml(p.note) + '</div>' +
        '<div class="preset-meta">' +
          '<span><i class="ti ti-files"></i> ' + p.names.length + ' 个文件</span>' +
          '<span class="danger-count"><i class="ti ti-alert-triangle"></i> ' + p.danger.length + ' 个危险</span>' +
        '</div>';
      card.addEventListener('click', function () { loadPreset(p); });
      presetGrid.appendChild(card);
    });
  }

  /**
   * 切换激活的预设卡片高亮
   * @param {string} id
   */
  function setActivePreset(id) {
    currentPresetId = id;
    var cards = presetGrid.querySelectorAll('.preset-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.id === id) {
        cards[i].classList.add('active');
      } else {
        cards[i].classList.remove('active');
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 加载预设 / 上传文件 -> 解析 -> 渲染
  // ─────────────────────────────────────────────────────────
  /**
   * 加载一个预设：生成字节并解析
   * @param {Object} preset
   */
  function loadPreset(preset) {
    setActivePreset(preset.id);
    var bytes = DSStorePresets.buildPreset(preset, DSStore);
    var result = DSStore.parse(bytes);
    if (!result.ok) {
      showError('预设解析失败：' + (result.error || '未知错误'));
      return;
    }
    currentBytes = bytes;
    currentResult = result;
    renderAnatomy(result, preset.name + '（预设场景）');
    resetTerminal();
  }

  /**
   * 处理用户上传的真实 .DS_Store 文件
   * @param {File} file
   */
  function handleUploadedFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var result = DSStore.parse(e.target.result);
      if (!result.ok) {
        showError('这不是一份有效的 .DS_Store：' + (result.error || '未知错误'));
        return;
      }
      // 上传真实文件时，取消预设高亮，危险判断走兜底
      setActivePreset(null);
      currentBytes = new Uint8Array(e.target.result);
      currentResult = result;
      renderAnatomy(result, file.name + '（你上传的文件）');
      resetTerminal();
    };
    reader.onerror = function () {
      showError('读取文件失败，请重试。');
    };
    reader.readAsArrayBuffer(file);
  }

  // ─────────────────────────────────────────────────────────
  // 解剖结果渲染
  // ─────────────────────────────────────────────────────────
  /**
   * 渲染解剖结果：大号数字 + 十六进制预览 + 文件名清单（GSAP stagger）
   * @param {Object} result DSStore.parse 的返回值
   * @param {string} sourceLabel 来源说明
   */
  function renderAnatomy(result, sourceLabel) {
    // 顶部大号数字
    anatomySourceEl.textContent = sourceLabel;
    animateNumber(leakCountEl, result.files.length);

    // 十六进制预览
    hexPreviewEl.innerHTML = renderHex(currentBytes, 14);

    // 文件清单
    fileListEl.innerHTML = '';
    var preset = currentPresetId ? DSStorePresets.getPreset(currentPresetId) : null;
    var dangerList = preset ? preset.danger : [];

    var cards = result.files.map(function (name) {
      var isDanger = DSStorePresets.isDangerous(name, dangerList);
      var entry = result.byName[name] || { props: [] };
      var card = document.createElement('div');
      card.className = 'file-card' + (isDanger ? ' danger' : '');
      card.innerHTML =
        '<div class="file-name">' + escapeHtml(name) + '</div>' +
        renderProps(entry.props);
      fileListEl.appendChild(card);
      return card;
    });

    // GSAP 逐条 stagger 揭示
    if (typeof gsap !== 'undefined' && cards.length > 0) {
      gsap.fromTo(cards,
        { opacity: 0, y: 14, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.05, ease: 'power2.out', clearProps: 'transform' }
      );
    }
  }

  /**
   * 把一个文件的属性列表渲染成 chip
   * @param {Array<{structId:string,type:string,value:*}>} props
   * @returns {string}
   */
  function renderProps(props) {
    if (!props || props.length === 0) return '<div class="file-props"><span class="prop-chip"><i class="ti ti-help"></i> 无属性</span></div>';
    var html = '<div class="file-props">';
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var info = DSStore.describeStruct(p.structId);
      var isComment = p.structId === 'cmmt' && p.type === 'ustr' && typeof p.value === 'string';
      var cls = isComment ? 'prop-chip prop-comment' : 'prop-chip';
      html += '<span class="' + cls + '" title="' + escapeAttr(info.desc) + '">' +
        '<i class="ti ' + escapeAttr(info.icon) + '"></i>' +
        '<span class="prop-label">' + escapeHtml(info.label) + '</span>' +
        (isComment ? '<span class="prop-value">「' + escapeHtml(p.value) + '」</span>' : '') +
        '</span>';
    }
    html += '</div>';
    return html;
  }

  /**
   * 把字节渲染成 hex dump HTML，高亮开头魔数 Bud1
   * @param {Uint8Array} bytes
   * @param {number} maxLines 最多渲染多少行（每行 16 字节）
   * @returns {string}
   */
  function renderHex(bytes, maxLines) {
    if (!bytes || bytes.length === 0) return '<span class="hex-ascii">(空)</span>';
    var totalLines = Math.min(maxLines || 14, Math.ceil(bytes.length / 16));
    var lines = [];
    for (var row = 0; row < totalLines; row++) {
      var offset = row * 16;
      var hexParts = [];
      var asciiParts = [];
      for (var col = 0; col < 16; col++) {
        var idx = offset + col;
        if (idx >= bytes.length) {
          hexParts.push('  ');
          asciiParts.push(' ');
          continue;
        }
        var b = bytes[idx];
        hexParts.push((b < 16 ? '0' : '') + b.toString(16));
        asciiParts.push((b >= 32 && b < 127) ? String.fromCharCode(b) : '.');
      }
      // 高亮魔数 Bud1（偏移 4..7）
      var hexLine = hexParts.join(' ');
      if (offset === 0) {
        // 把前 4 个字节(魔数1) 与 4..7(魔数2=Bud1) 包裹高亮
        hexLine =
          '<span class="hex-magic">' + hexParts.slice(0, 8).join(' ') + '</span> ' +
          hexParts.slice(8).join(' ');
      }
      lines.push(
        '<span class="hex-offset">' + pad(offset.toString(16), 8) + '</span>  ' +
        hexLine +
        '  <span class="hex-ascii">|' + asciiParts.join('') + '|</span>'
      );
    }
    if (bytes.length > totalLines * 16) {
      lines.push('<span class="hex-offset">... (' + bytes.length + ' 字节，仅显示前 ' + (totalLines * 16) + ' 字节)</span>');
    }
    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────
  // 复制泄露清单
  // ─────────────────────────────────────────────────────────
  function bindCopy() {
    copyBtn.addEventListener('click', function () {
      if (!currentResult || !currentResult.files || currentResult.files.length === 0) {
        showToast('当前没有可复制的清单');
        return;
      }
      var text = '# .DS_Store 解剖器 - 还原出的文件名清单\n' +
        '# 来源：' + anatomySourceEl.textContent + '\n' +
        '# 共 ' + currentResult.files.length + ' 个文件\n' +
        '────────\n' +
        currentResult.files.join('\n');
      copyToClipboard(text, function (ok) {
        showToast(ok ? '已复制 ' + currentResult.files.length + ' 个文件名到剪贴板' : '复制失败，请手动选取');
      });
    });
  }

  // ─────────────────────────────────────────────────────────
  // 泄露现场：终端扫描
  // ─────────────────────────────────────────────────────────
  function bindScan() {
    scanBtn.addEventListener('click', startScan);
    scanResetBtn.addEventListener('click', function () {
      resetTerminal();
      scanBtn.disabled = false;
      scanResetBtn.disabled = true;
    });
  }

  /**
   * 开始扫描：GSAP 逐行打字机式列出文件
   */
  function startScan() {
    if (!currentResult || !currentResult.files || currentResult.files.length === 0) {
      showError('先在上方喂一个 .DS_Store 进来吧');
      return;
    }
    if (scanTimeline) { scanTimeline.kill(); }

    scanBtn.disabled = true;
    scanResetBtn.disabled = true;
    terminalOutput.innerHTML = '';

    var preset = currentPresetId ? DSStorePresets.getPreset(currentPresetId) : null;
    var dangerList = preset ? preset.danger : [];
    var files = currentResult.files;
    terminalCount.textContent = files.length;

    // 造好所有行，先全部隐藏，再 stagger 揭示
    var lineEls = [];
    files.forEach(function (name) {
      var isDanger = DSStorePresets.isDangerous(name, dangerList);
      var line = document.createElement('div');
      line.className = 'terminal-out-line' + (isDanger ? ' danger' : ' safe');
      line.innerHTML =
        '<span class="t-prefix">[+]</span>' +
        '<span class="t-file">' + escapeHtml(name) + '</span>' +
        '<span class="t-hint">' + (isDanger ? '-> 可尝试访问' : '-> 普通文件') + '</span>';
      terminalOutput.appendChild(line);
      lineEls.push(line);
    });

    if (typeof gsap === 'undefined') {
      // 没有 GSAP 时退化为直接显示
      lineEls.forEach(function (el) { el.style.opacity = 1; });
      scanResetBtn.disabled = false;
      return;
    }

    scanTimeline = gsap.timeline({
      onComplete: function () { scanResetBtn.disabled = false; }
    });
    scanTimeline.to(lineEls, {
      opacity: 1,
      duration: 0.18,
      stagger: 0.12,
      ease: 'power1.out'
    });
    // 终端自动滚到底
    var body = $('#terminalBody');
    scanTimeline.eventCallback('onUpdate', function () {
      body.scrollTop = body.scrollHeight;
    });
  }

  /**
   * 重置终端输出
   */
  function resetTerminal() {
    if (scanTimeline) { scanTimeline.kill(); scanTimeline = null; }
    terminalOutput.innerHTML = '';
    if (currentResult && currentResult.files) {
      terminalCount.textContent = currentResult.files.length;
    } else {
      terminalCount.textContent = '0';
    }
    scanBtn.disabled = false;
    scanResetBtn.disabled = true;
  }

  // ─────────────────────────────────────────────────────────
  // 上传区
  // ─────────────────────────────────────────────────────────
  function bindUpload() {
    uploadZone.addEventListener('click', function () { fileInput.click(); });
    uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', function () {
      uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) handleUploadedFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files.length > 0) handleUploadedFile(fileInput.files[0]);
      fileInput.value = ''; // 允许再次选同一文件
    });
  }

  // ─────────────────────────────────────────────────────────
  // Hero CTA
  // ─────────────────────────────────────────────────────────
  function bindHeroCta() {
    heroCta.addEventListener('click', function () {
      var feed = $('#feed');
      if (feed && typeof feed.scrollIntoView === 'function') {
        feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // 工具函数
  // ─────────────────────────────────────────────────────────
  /**
   * 数字滚动动画
   * @param {HTMLElement} el
   * @param {number} target
   */
  function animateNumber(el, target) {
    var from = parseInt(el.textContent, 10) || 0;
    if (typeof gsap === 'undefined') { el.textContent = target; return; }
    var obj = { v: from };
    gsap.to(obj, {
      v: target,
      duration: 0.7,
      ease: 'power2.out',
      onUpdate: function () { el.textContent = Math.round(obj.v); }
    });
  }

  /**
   * 显示错误提示（短暂）
   * @param {string} msg
   */
  function showError(msg) {
    var box = document.createElement('div');
    box.className = 'error-box';
    box.innerHTML = '<i class="ti ti-alert-circle"></i> ' + escapeHtml(msg);
    var feed = $('#feed');
    feed.parentNode.insertBefore(box, feed.nextSibling);
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(box, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3 });
    }
    setTimeout(function () {
      if (typeof gsap !== 'undefined') {
        gsap.to(box, { opacity: 0, y: -8, duration: 0.3, onComplete: function () { box.remove(); } });
      } else {
        box.remove();
      }
    }, 3500);
  }

  /**
   * 显示 toast
   * @param {string} msg
   */
  function showToast(msg) {
    var toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<i class="ti ti-check"></i> ' + escapeHtml(msg);
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 2000);
  }

  /**
   * 复制文本到剪贴板（带 fallback）
   * @param {string} text
   * @param {function(boolean)} cb
   */
  function copyToClipboard(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); }).catch(function () { cb(false); });
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      cb(ok);
    } catch (e) { cb(false); }
  }

  /** HTML 转义 */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /** 属性转义 */
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }
  /** 左侧补 0 */
  function pad(s, len) {
    while (s.length < len) s = '0' + s;
    return s;
  }
})();
