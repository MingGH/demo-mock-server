/**
 * app.js — UI 交互层
 */
(function () {
  'use strict';

  var lab = window.DocStegoLab;
  var selectedScenarioId = lab.SCENARIOS[0].id;

  function $(id) { return document.getElementById(id); }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── 场景列表 ────────────────────────────────────────────────────────────────

  function renderScenarios() {
    var list = $('scenarioList');
    list.innerHTML = lab.SCENARIOS.map(function (s) {
      var active = s.id === selectedScenarioId ? ' active' : '';
      var badgeClass = s.badgeLevel === 'high' ? 'badge-high' : 'badge-medium';
      return '<button class="scenario-btn' + active + '" data-id="' + escHtml(s.id) + '">' +
        '<div class="scenario-top">' +
          '<span class="scenario-name">' + escHtml(s.name) + '</span>' +
          '<span class="scenario-badge ' + badgeClass + '">' + escHtml(s.badge) + '</span>' +
        '</div>' +
        '<div class="scenario-summary">' + escHtml(s.summary) + '</div>' +
        '<div class="scenario-risks">' +
          s.risks.map(function (r) { return '<span class="risk-tag">' + escHtml(r) + '</span>'; }).join('') +
        '</div>' +
      '</button>';
    }).join('');
  }

  function renderSelectedInfo() {
    var s = lab.SCENARIOS.find(function (x) { return x.id === selectedScenarioId; });
    if (!s) return;
    var info = $('selectedInfo');
    var meta = s.meta;
    var content = s.content;

    var rows = [
      ['文件名', content.fileName],
      ['作者', meta.creator],
      ['最后保存者', meta.lastModifiedBy],
      ['机器名', meta.machineName],
      ['修订记录', content.revisions.length + ' 处'],
      ['批注', content.comments.length + ' 条'],
      ['白色文字', content.whiteText ? '有' : '无']
    ];

    info.innerHTML = '<div class="info-table">' +
      rows.map(function (r) {
        return '<div class="info-row"><span class="info-label">' + escHtml(r[0]) + '</span>' +
          '<span class="info-value">' + escHtml(r[1]) + '</span></div>';
      }).join('') +
    '</div>';
  }

  // ─── 生成下载 ────────────────────────────────────────────────────────────────

  function handleGenerate() {
    var btn = $('generateBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i>生成中…';

    lab.generateDocx(selectedScenarioId).then(function (result) {
      var blob = new Blob([result.buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-check"></i>已下载，换个场景试试';
      setTimeout(function () {
        btn.innerHTML = '<i class="ti ti-download"></i>生成并下载 .docx';
      }, 3000);
    }).catch(function (err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-download"></i>生成并下载 .docx';
      alert('生成失败：' + err.message);
    });
  }

  // ─── 上传扫描 ────────────────────────────────────────────────────────────────

  function renderScanResult(result) {
    var container = $('scanResult');
    container.style.display = 'block';

    if (result.clean) {
      container.innerHTML =
        '<div class="scan-clean">' +
          '<i class="ti ti-circle-check"></i>' +
          '<div>' +
            '<strong>没有发现明显风险</strong>' +
            '<p>未检测到元数据、修订记录、批注或白色文字。发送前仍建议人工复查一遍。</p>' +
          '</div>' +
        '</div>';
      return;
    }

    var severityOrder = { high: 0, medium: 1, low: 2 };
    var sorted = result.findings.slice().sort(function (a, b) {
      return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9);
    });

    var html = '<div class="scan-summary">' +
      '<span class="scan-count">' + sorted.length + ' 项风险</span>' +
      '<span class="scan-hint">点击每项查看详情</span>' +
    '</div>';

    sorted.forEach(function (f, idx) {
      var sevClass = f.severity === 'high' ? 'sev-high' : 'sev-medium';
      var sevLabel = f.severity === 'high' ? '高' : '中';
      var detailId = 'fd-' + idx;

      html += '<div class="finding-card">' +
        '<div class="finding-header" data-target="' + detailId + '">' +
          '<div class="finding-left">' +
            '<span class="finding-sev ' + sevClass + '">' + sevLabel + '</span>' +
            '<span class="finding-title">' + escHtml(f.title) + '</span>' +
          '</div>' +
          '<i class="ti ti-chevron-down finding-chevron"></i>' +
        '</div>' +
        '<div class="finding-detail" id="' + detailId + '" style="display:none">' +
          renderFindingDetail(f) +
          '<div class="finding-tip"><i class="ti ti-tool"></i>' + escHtml(f.tip) + '</div>' +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;

    // 展开/收起
    container.querySelectorAll('.finding-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var targetId = header.getAttribute('data-target');
        var detail = document.getElementById(targetId);
        var chevron = header.querySelector('.finding-chevron');
        if (detail.style.display === 'none') {
          detail.style.display = 'block';
          chevron.classList.add('rotated');
        } else {
          detail.style.display = 'none';
          chevron.classList.remove('rotated');
        }
      });
    });
  }

  function renderFindingDetail(f) {
    if (f.type === 'metadata') {
      return '<table class="meta-table">' +
        f.fields.map(function (field) {
          return '<tr><td class="meta-key">' + escHtml(field.label) + '</td>' +
            '<td class="meta-val">' + escHtml(field.value) + '</td></tr>';
        }).join('') +
      '</table>';
    }

    if (f.type === 'revisions') {
      if (!f.samples || !f.samples.length) return '<p class="detail-empty">无法提取具体内容。</p>';
      return '<div class="sample-list">' +
        f.samples.map(function (s) {
          var cls = s.type === '删除' ? 'sample-del' : 'sample-ins';
          return '<div class="sample-item ' + cls + '">' +
            '<span class="sample-type">' + escHtml(s.type) + '</span>' +
            (s.author ? '<span class="sample-author">' + escHtml(s.author) + '</span>' : '') +
            '<span class="sample-text">' + escHtml(s.text) + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    if (f.type === 'comments') {
      return '<div class="sample-list">' +
        f.samples.map(function (s) {
          return '<div class="sample-item sample-comment">' +
            (s.author ? '<span class="sample-author">' + escHtml(s.author) + '</span>' : '') +
            '<span class="sample-text">' + escHtml(s.text) + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    if (f.type === 'whiteText') {
      if (!f.samples || !f.samples.length) return '<p class="detail-empty">检测到白色文字，但无法提取文本内容。</p>';
      return '<div class="sample-list">' +
        f.samples.map(function (s) {
          return '<div class="sample-item sample-white">' +
            '<span class="sample-text">' + escHtml(s) + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    return '';
  }

  function handleFile(file) {
    if (!file || !file.name.endsWith('.docx')) {
      alert('请上传 .docx 格式的文件');
      return;
    }

    var zone = $('uploadZone');
    zone.innerHTML = '<i class="ti ti-loader-2 upload-icon spin"></i>' +
      '<div class="upload-text">正在解析 ' + escHtml(file.name) + '…</div>' +
      '<div class="upload-sub">文件不会离开你的设备</div>';

    var reader = new FileReader();
    reader.onload = function (e) {
      lab.scanDocx(e.target.result).then(function (result) {
        zone.innerHTML = '<i class="ti ti-file-check upload-icon"></i>' +
          '<div class="upload-text">' + escHtml(file.name) + '</div>' +
          '<div class="upload-sub">点击重新选择文件</div>' +
          '<input type="file" id="fileInput" accept=".docx" style="display:none">';
        bindUploadInput();
        renderScanResult(result);
      }).catch(function (err) {
        zone.innerHTML = '<i class="ti ti-file-x upload-icon"></i>' +
          '<div class="upload-text">解析失败</div>' +
          '<div class="upload-sub">' + escHtml(err.message) + '</div>' +
          '<input type="file" id="fileInput" accept=".docx" style="display:none">';
        bindUploadInput();
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function bindUploadInput() {
    var input = $('fileInput');
    if (input) {
      input.addEventListener('change', function (e) {
        if (e.target.files[0]) handleFile(e.target.files[0]);
      });
    }
  }

  // ─── 事件绑定 ────────────────────────────────────────────────────────────────

  function bindEvents() {
    // 场景选择
    $('scenarioList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-id]');
      if (!btn) return;
      selectedScenarioId = btn.getAttribute('data-id');
      renderScenarios();
      renderSelectedInfo();
    });

    // 生成下载
    $('generateBtn').addEventListener('click', handleGenerate);

    // 上传区域点击
    var zone = $('uploadZone');
    zone.addEventListener('click', function () {
      var input = $('fileInput');
      if (input) input.click();
    });

    // 拖拽
    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      var file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    bindUploadInput();
  }

  // ─── 初始化 ──────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    renderScenarios();
    renderSelectedInfo();
    bindEvents();
  });

})();
