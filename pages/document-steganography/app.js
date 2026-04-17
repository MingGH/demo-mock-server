const labApi = window.DocumentSteganographyLab;

const state = {
  forensicMode: false,
  presetId: labApi.PRESETS[0].id,
  config: labApi.createInitialConfig()
};

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyPreset(presetId) {
  const preset = labApi.getPresetById(presetId);
  if (!preset) return;
  state.presetId = preset.id;
  state.config = preset.config;
  render();
}

function syncForm() {
  const cfg = state.config;
  $('exportFormat').value = cfg.exportFormat;
  $('fileName').value = cfg.fileName;
  $('title').value = cfg.title;
  $('clientName').value = cfg.clientName;
  $('author').value = cfg.author;
  $('lastEditor').value = cfg.lastEditor;
  $('machineName').value = cfg.machineName;
  $('createdAt').value = cfg.createdAt;
  $('modifiedAt').value = cfg.modifiedAt;

  $('metadataEnabled').checked = cfg.metadata.enabled;
  $('whiteTextEnabled').checked = cfg.whiteTextLayer.enabled;
  $('whiteTextContent').value = cfg.whiteTextLayer.content;
  $('trackChangesEnabled').checked = cfg.trackChanges.enabled;
  $('trackChangesCount').value = cfg.trackChanges.count;
  $('trackChangesSample').value = cfg.trackChanges.sample;
  $('commentsEnabled').checked = cfg.comments.enabled;
  $('commentsCount').value = cfg.comments.count;
  $('commentsSample').value = cfg.comments.sample;
  $('pdfLayerEnabled').checked = cfg.pdfLayer.enabled;
  $('pdfLayerName').value = cfg.pdfLayer.name;
  $('pdfLayerContent').value = cfg.pdfLayer.content;
}

function renderPresetCards() {
  $('presetList').innerHTML = labApi.PRESETS.map(function(preset) {
    const active = preset.id === state.presetId ? 'active' : '';
    return (
      '<button class="preset-card ' + active + '" data-preset-id="' + escapeHtml(preset.id) + '">' +
        '<span class="preset-name">' + escapeHtml(preset.name) + '</span>' +
        '<span class="preset-summary">' + escapeHtml(preset.summary) + '</span>' +
      '</button>'
    );
  }).join('');
}

function renderPreview() {
  const cfg = state.config;
  const paragraphs = (cfg.visibleParagraphs && cfg.visibleParagraphs.length ? cfg.visibleParagraphs : labApi.BASE_PARAGRAPHS).map(function(text) {
    return '<p>' + escapeHtml(text) + '</p>';
  }).join('');

  $('previewDoc').innerHTML =
    '<div class="doc-topline">' +
      '<span>' + escapeHtml(cfg.fileName) + '</span>' +
      '<span>' + escapeHtml(cfg.exportFormat.toUpperCase()) + '</span>' +
    '</div>' +
    '<h2>' + escapeHtml(cfg.title) + '</h2>' +
    '<div class="doc-meta-line">收件方：' + escapeHtml(cfg.clientName || '未填写') + '</div>' +
    '<div class="doc-paragraphs">' + paragraphs + '</div>' +
    renderOverlayBlocks();
}

function renderOverlayBlocks() {
  const cfg = state.config;
  const blocks = [];
  const modeClass = state.forensicMode ? ' forensic-visible' : '';

  if (cfg.whiteTextLayer.enabled && cfg.whiteTextLayer.content.trim()) {
    blocks.push(
      '<div class="overlay-block white-text' + modeClass + '">' +
        '<div class="overlay-label">白色文字层</div>' +
        '<div class="overlay-body">' + escapeHtml(cfg.whiteTextLayer.content) + '</div>' +
      '</div>'
    );
  }

  if (cfg.exportFormat === 'pdf' && cfg.pdfLayer.enabled) {
    blocks.push(
      '<div class="overlay-block hidden-layer' + modeClass + '">' +
        '<div class="overlay-label">隐藏 PDF 图层：' + escapeHtml(cfg.pdfLayer.name || '未命名图层') + '</div>' +
        '<div class="overlay-body">' + escapeHtml(cfg.pdfLayer.content) + '</div>' +
      '</div>'
    );
  }

  if (!blocks.length) {
    blocks.push(
      '<div class="overlay-clean">当前预览层没有额外隐藏内容。</div>'
    );
  }

  return '<div class="overlay-stack">' + blocks.join('') + '</div>';
}

function renderMetadata() {
  const cfg = state.config;
  const visible = state.forensicMode ? 'metadata-visible' : '';
  $('metadataPanel').className = 'metadata-panel ' + visible;
  $('metadataPanel').innerHTML =
    '<div class="metadata-row"><span>作者</span><strong>' + escapeHtml(cfg.author || '已清空') + '</strong></div>' +
    '<div class="metadata-row"><span>最后保存者</span><strong>' + escapeHtml(cfg.lastEditor || '已清空') + '</strong></div>' +
    '<div class="metadata-row"><span>机器名</span><strong>' + escapeHtml(cfg.machineName || '已清空') + '</strong></div>' +
    '<div class="metadata-row"><span>创建时间</span><strong>' + escapeHtml(cfg.createdAt || '已清空') + '</strong></div>' +
    '<div class="metadata-row"><span>修改时间</span><strong>' + escapeHtml(cfg.modifiedAt || '已清空') + '</strong></div>';
}

function renderFindings() {
  const summary = labApi.buildSummary(state.config);
  const findings = summary.findings;
  const counts = findings.length;

  setText('riskScore', String(summary.score));
  setText('riskLevel', summary.level);
  setText('findingCount', String(counts));
  setText('modeLabel', state.forensicMode ? '取证视角' : '客户视角');

  $('riskMeterFill').style.width = summary.score + '%';
  $('riskMeterFill').className = 'meter-fill meter-' + summary.level;

  $('findingsList').innerHTML = findings.length
    ? findings.map(function(item) {
        return (
          '<div class="finding-item">' +
            '<div class="finding-head">' +
              '<span class="finding-title">' + escapeHtml(item.title) + '</span>' +
              '<span class="finding-severity severity-' + item.severity + '">' + escapeHtml(item.severity === 'high' ? '高' : '中') + '</span>' +
            '</div>' +
            '<div class="finding-detail">' + escapeHtml(item.detail) + '</div>' +
            '<div class="finding-exposure">' + escapeHtml(item.exposure) + '</div>' +
          '</div>'
        );
      }).join('')
    : '<div class="empty-state">当前模拟件没有发现额外泄露项，仍建议发送前再做一次人工复查。</div>';

  $('checklist').innerHTML = summary.checklist.map(function(item) {
    return '<li>' + escapeHtml(item) + '</li>';
  }).join('');
}

function renderPresetStats() {
  const stats = labApi.getPresetStats();
  setText('presetTotal', String(stats.total));
  setText('presetMetadata', String(stats.metadata));
  setText('presetWhiteText', String(stats.whiteText));
  setText('presetReviewTrail', String(stats.reviewTrail));
  setText('presetPdfLayer', String(stats.pdfLayer));
}

function renderSwitches() {
  $('forensicToggle').textContent = state.forensicMode ? '切回客户视角' : '切到取证视角';
}

function render() {
  renderPresetCards();
  syncForm();
  renderPreview();
  renderMetadata();
  renderFindings();
  renderPresetStats();
  renderSwitches();
}

function updateStateFromForm() {
  const cfg = state.config;
  cfg.exportFormat = $('exportFormat').value;
  cfg.fileName = $('fileName').value.trim();
  cfg.title = $('title').value.trim();
  cfg.clientName = $('clientName').value.trim();
  cfg.author = $('author').value.trim();
  cfg.lastEditor = $('lastEditor').value.trim();
  cfg.machineName = $('machineName').value.trim();
  cfg.createdAt = $('createdAt').value.trim();
  cfg.modifiedAt = $('modifiedAt').value.trim();

  cfg.metadata.enabled = $('metadataEnabled').checked;
  cfg.whiteTextLayer.enabled = $('whiteTextEnabled').checked;
  cfg.whiteTextLayer.content = $('whiteTextContent').value.trim();
  cfg.trackChanges.enabled = $('trackChangesEnabled').checked;
  cfg.trackChanges.count = Number($('trackChangesCount').value || 0);
  cfg.trackChanges.sample = $('trackChangesSample').value.trim();
  cfg.comments.enabled = $('commentsEnabled').checked;
  cfg.comments.count = Number($('commentsCount').value || 0);
  cfg.comments.sample = $('commentsSample').value.trim();
  cfg.pdfLayer.enabled = $('pdfLayerEnabled').checked;
  cfg.pdfLayer.name = $('pdfLayerName').value.trim();
  cfg.pdfLayer.content = $('pdfLayerContent').value.trim();

  render();
}

function bindEvents() {
  $('presetList').addEventListener('click', function(event) {
    const button = event.target.closest('[data-preset-id]');
    if (!button) return;
    applyPreset(button.getAttribute('data-preset-id'));
  });

  $('controlsForm').addEventListener('input', updateStateFromForm);
  $('controlsForm').addEventListener('change', updateStateFromForm);

  $('forensicToggle').addEventListener('click', function() {
    state.forensicMode = !state.forensicMode;
    render();
  });

  $('sanitizeBtn').addEventListener('click', function() {
    state.config = labApi.sanitizeConfig(state.config);
    render();
  });

  $('resetBtn').addEventListener('click', function() {
    applyPreset(state.presetId);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  render();
});
