/**
 * app.js — 文档隐写实验室 UI 层
 */
(function () {
  'use strict';

  var lab = window.DocStegoLab;
  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Tab 切换 ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById('tab-' + tab);
      if (panel) panel.classList.add('active');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Tab 1：文字指纹水印
  // ══════════════════════════════════════════════════════════════════════════

  var recipients = [
    { name: '张总（竞争对手A）', id: 0 },
    { name: '李总（合作方B）',   id: 1 },
    { name: '王总（投资人C）',   id: 2 }
  ];

  function renderRecipientList() {
    var container = $('recipientList');
    container.innerHTML = recipients.map(function (r, i) {
      return '<div class="recipient-row" data-idx="' + i + '">' +
        '<span class="recipient-num">' + (i + 1) + '</span>' +
        '<input class="recipient-input" type="text" value="' + escHtml(r.name) + '" data-idx="' + i + '">' +
        '<button class="btn-icon btn-danger" data-remove="' + i + '" title="删除"><i class="ti ti-x"></i></button>' +
      '</div>';
    }).join('');
    container.querySelectorAll('.recipient-input').forEach(function (input) {
      input.addEventListener('input', function () {
        recipients[parseInt(input.getAttribute('data-idx'))].name = input.value;
      });
    });
    container.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        recipients.splice(parseInt(btn.getAttribute('data-remove')), 1);
        recipients.forEach(function (r, i) { r.id = i; });
        renderRecipientList();
      });
    });
  }

  $('addRecipient').addEventListener('click', function () {
    recipients.push({ name: '新收件方 ' + (recipients.length + 1), id: recipients.length });
    renderRecipientList();
  });

  $('generateWmBtn').addEventListener('click', function () {
    var text = $('wmInput').value.trim();
    if (!text) { alert('请输入原始文本'); return; }
    if (!recipients.length) { alert('请至少添加一个收件方'); return; }

    var result = $('wmResult');
    result.style.display = 'block';

    var html = '<div class="wm-result-title"><i class="ti ti-check"></i>已生成 ' + recipients.length + ' 份专属版本</div>' +
      '<div class="wm-versions">' +
      recipients.map(function (r) {
        var wm = lab.injectWatermark(text, r.id);
        var ex = lab.extractWatermark(wm);
        var diffWords = [];
        lab.SYNONYM_RULES.forEach(function (rule) {
          if (wm.indexOf(rule[1]) !== -1 && text.indexOf(rule[0]) !== -1) {
            diffWords.push(rule[0] + ' → ' + rule[1]);
          }
        });
        if (/[\u200b\u200c]/.test(wm)) diffWords.push('零宽字符（不可见）');
        return '<div class="wm-version">' +
          '<div class="wm-version-header">' +
            '<span class="wm-recipient">' + escHtml(r.name) + '</span>' +
            '<span class="wm-id">指纹 ID: <code>' + ex.id + '</code></span>' +
            '<button class="btn-copy" data-wm="' + escHtml(wm) + '">复制</button>' +
          '</div>' +
          '<div class="wm-diff">' +
            (diffWords.length
              ? '<span class="diff-label">替换点：</span>' + diffWords.map(function (d) { return '<span class="diff-word">' + escHtml(d) + '</span>'; }).join('')
              : '<span class="diff-same">与原文相同（ID=0）</span>') +
          '</div>' +
        '</div>';
      }).join('') +
      '</div>';

    result.innerHTML = html;
    result.querySelectorAll('.btn-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(btn.getAttribute('data-wm')).then(function () {
          btn.textContent = '已复制';
          setTimeout(function () { btn.textContent = '复制'; }, 1500);
        });
      });
    });
  });

  $('detectWmBtn').addEventListener('click', function () {
    var text = $('wmDetectInput').value.trim();
    if (!text) { alert('请粘贴疑似泄露文本'); return; }
    var result = lab.extractWatermark(text);
    var matched = recipients.find(function (r) { return r.id === result.id; });
    var conf = Math.round(result.confidence * 100);
    var dr = $('detectResult');
    dr.style.display = 'block';
    if (matched && conf > 30) {
      dr.innerHTML = '<div class="detect-match">' +
        '<div class="detect-icon"><i class="ti ti-user-search"></i></div>' +
        '<div class="detect-info">' +
          '<div class="detect-name">疑似来源：<strong>' + escHtml(matched.name) + '</strong></div>' +
          '<div class="detect-id">指纹 ID: <code>' + result.id + '</code>（二进制: ' + result.bitStr + '）</div>' +
          '<div class="detect-conf">置信度：' + conf + '%</div>' +
        '</div></div>';
    } else {
      dr.innerHTML = '<div class="detect-unknown">' +
        '<i class="ti ti-question-mark"></i>' +
        '<div><strong>未找到匹配收件方</strong>' +
        '<p>提取到 ID: ' + result.id + '，不在当前列表中，或文本已被大幅改写。</p></div></div>';
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Tab 2：字间距印刷水印
  // ══════════════════════════════════════════════════════════════════════════

  var lastWatermarkedCanvas = null;
  var lastSpacingMeta = null;

  // 滑块实时显示
  $('spDelta').addEventListener('input', function () {
    $('spDeltaVal').textContent = parseFloat($('spDelta').value).toFixed(1) + 'px';
  });

  $('spGenerateBtn').addEventListener('click', function () {
    var text      = $('spInput').value.trim();
    var id        = parseInt($('spRecipientId').value) || 0;
    var fontSize  = parseInt($('spFontSize').value) || 20;
    var delta     = parseFloat($('spDelta').value) || 0.3;

    if (!text) { alert('请输入文本'); return; }
    id = Math.max(0, Math.min(255, id));

    var canvasOrig = $('canvasOriginal');
    var canvasWm   = $('canvasWatermarked');
    var canvasDiff = $('canvasDiff');

    // 渲染原始版本
    lab.renderWithSpacingWatermark(canvasOrig, text, {
      recipientId: id, fontSize: fontSize, delta: delta, noWatermark: true
    });

    // 渲染水印版本
    var meta = lab.renderWithSpacingWatermark(canvasWm, text, {
      recipientId: id, fontSize: fontSize, delta: delta, noWatermark: false
    });

    // 差异图
    lab.renderDiffCanvas(canvasDiff, canvasOrig, canvasWm);

    lastWatermarkedCanvas = canvasWm;
    lastSpacingMeta = meta;

    // 显示区域
    $('canvasCompare').style.display = 'grid';
    $('spDownloadBtn').style.display = 'flex';

    // 元数据
    var bitsStr = meta.bits.map(function (b) { return b; }).join(' ');
    $('spMeta').style.display = 'block';
    $('spMeta').innerHTML =
      '<div class="meta-row"><span>编码 ID</span><strong>' + id + '</strong></div>' +
      '<div class="meta-row"><span>二进制</span><strong>' + id.toString(2).padStart(8, '0') + '</strong></div>' +
      '<div class="meta-row"><span>锚点数量</span><strong>' + meta.anchors.length + ' 个</strong></div>' +
      '<div class="meta-row"><span>偏移量 δ</span><strong>±' + delta + 'px</strong></div>' +
      '<div class="meta-row"><span>bit 序列</span><strong>' + bitsStr + '</strong></div>';
  });

  $('spDownloadBtn').addEventListener('click', function () {
    if (!lastWatermarkedCanvas) return;
    var id = parseInt($('spRecipientId').value) || 0;
    var a = document.createElement('a');
    a.download = '水印文档-ID' + id + '.png';
    a.href = lastWatermarkedCanvas.toDataURL('image/png');
    a.click();
  });

  // ── 上传提取 ──────────────────────────────────────────────────────────────

  var spUploadZone = $('spUploadZone');

  spUploadZone.addEventListener('click', function () {
    $('spFileInput').click();
  });

  spUploadZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    spUploadZone.classList.add('drag-over');
  });
  spUploadZone.addEventListener('dragleave', function () {
    spUploadZone.classList.remove('drag-over');
  });
  spUploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    spUploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleSpFile(e.dataTransfer.files[0]);
  });

  $('spFileInput').addEventListener('change', function (e) {
    if (e.target.files[0]) handleSpFile(e.target.files[0]);
  });

  function handleSpFile(file) {
    var fontSize = parseInt($('spFontSize').value) || 20;
    var delta    = parseFloat($('spDelta').value) || 0.3;

    spUploadZone.innerHTML =
      '<i class="ti ti-loader-2 upload-icon spin"></i>' +
      '<div class="upload-text">分析中…</div>' +
      '<div class="upload-sub">' + escHtml(file.name) + '</div>';

    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        // 把图片画到临时 canvas
        var tmpCanvas = document.createElement('canvas');
        tmpCanvas.width  = img.width;
        tmpCanvas.height = img.height;
        tmpCanvas.getContext('2d').drawImage(img, 0, 0);

        var result = lab.extractSpacingWatermark(tmpCanvas, fontSize, delta);

        // 恢复上传区
        spUploadZone.innerHTML =
          '<i class="ti ti-photo-check upload-icon"></i>' +
          '<div class="upload-text">' + escHtml(file.name) + '</div>' +
          '<div class="upload-sub">点击重新选择</div>' +
          '<input type="file" id="spFileInput" accept="image/*" style="display:none">';
        document.getElementById('spFileInput').addEventListener('change', function (ev) {
          if (ev.target.files[0]) handleSpFile(ev.target.files[0]);
        });

        renderExtractResult(result, tmpCanvas, delta);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderExtractResult(result, sourceCanvas, delta) {
    var er = $('spExtractResult');
    er.style.display = 'block';

    if (result.error || result.id === -1) {
      er.innerHTML = '<div class="detect-unknown">' +
        '<i class="ti ti-alert-triangle"></i>' +
        '<div><strong>提取失败</strong><p>' + escHtml(result.error || '无法识别字符边界') + '</p></div>' +
        '</div>';
      return;
    }

    var conf = Math.round(result.confidence * 100);
    var confClass = conf >= 70 ? 'conf-high' : conf >= 40 ? 'conf-mid' : 'conf-low';

    er.innerHTML =
      '<div class="extract-result-card">' +
        '<div class="extract-id">' +
          '<span class="extract-id-label">提取到的 ID</span>' +
          '<span class="extract-id-value">' + result.id + '</span>' +
          '<span class="extract-id-bin">' + result.id.toString(2).padStart(8, '0') + '</span>' +
        '</div>' +
        '<div class="extract-conf ' + confClass + '">' +
          '<div class="conf-bar"><div class="conf-fill" style="width:' + conf + '%"></div></div>' +
          '<span>置信度 ' + conf + '%</span>' +
        '</div>' +
        '<div class="extract-bits">' +
          result.bits.map(function (b, i) {
            return '<span class="bit-cell bit-' + b + '">' + b + '</span>';
          }).join('') +
        '</div>' +
        '<div class="extract-gaps">' +
          '<span class="gaps-label">检测到 ' + result.gaps.length + ' 个字符间距，基准 ' + (result.median || 0).toFixed(1) + 'px</span>' +
        '</div>' +
      '</div>';

    // 热力图
    var heatmap = $('canvasHeatmap');
    lab.renderHeatmap(heatmap, sourceCanvas, result.gaps, result.median || 0, delta);
    $('magnifierWrap').style.display = 'block';
  }

  // ── 初始化 ────────────────────────────────────────────────────────────────
  renderRecipientList();

})();
