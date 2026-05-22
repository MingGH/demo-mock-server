/**
 * HTML vs Markdown 对比实验室 - 核心逻辑
 */
(function() {
  var currentScenario = 0;
  var viewMode = 'rendered'; // 'rendered' | 'source'

  function init() {
    renderTabs();
    switchScenario(0);
  }

  function renderTabs() {
    var container = document.getElementById('scenarioTabs');
    container.innerHTML = SCENARIOS.map(function(s, i) {
      return '<button class="scenario-tab' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">' + s.title + '</button>';
    }).join('');
    container.addEventListener('click', function(e) {
      var btn = e.target.closest('.scenario-tab');
      if (!btn) return;
      switchScenario(parseInt(btn.dataset.idx));
    });
  }

  function switchScenario(idx) {
    currentScenario = idx;
    var s = SCENARIOS[idx];

    // Update tabs
    document.querySelectorAll('.scenario-tab').forEach(function(tab, i) {
      tab.classList.toggle('active', i === idx);
    });

    // Update description
    document.getElementById('scenarioDesc').textContent = s.desc;
    document.getElementById('scenarioSource').textContent = s.source;

    // Render panels
    renderPanels(s);
    renderStats(s);
    updateViewMode();
  }

  function renderPanels(s) {
    // Markdown rendered
    var mdBody = document.getElementById('mdRendered');
    mdBody.innerHTML = renderMarkdown(s.markdown);

    // HTML rendered
    var htmlBody = document.getElementById('htmlRendered');
    htmlBody.innerHTML = s.html;

    // Source code
    document.getElementById('mdSource').textContent = s.markdown;
    document.getElementById('htmlSource').textContent = s.html;
  }

  function renderStats(s) {
    var m = s.metrics;
    var density_md = (m.markdownInfoItems / m.markdownChars * 1000).toFixed(1);
    var density_html = (m.htmlInfoItems / m.htmlChars * 1000).toFixed(1);
    // 视觉信息密度: info items per rendered area (标准化)
    var visualDensity_md = m.markdownInfoItems;
    var visualDensity_html = m.htmlInfoItems;
    var maxInfo = Math.max(visualDensity_md, visualDensity_html);

    // Stats cards
    document.getElementById('statMdChars').textContent = m.markdownChars;
    document.getElementById('statHtmlChars').textContent = m.htmlChars;
    document.getElementById('statMdInfo').textContent = m.markdownInfoItems;
    document.getElementById('statHtmlInfo').textContent = m.htmlInfoItems;
    document.getElementById('statRatio').textContent = (m.htmlChars / m.markdownChars).toFixed(1) + 'x';
    document.getElementById('statInfoGain').textContent = '+' + Math.round((m.htmlInfoItems / m.markdownInfoItems - 1) * 100) + '%';

    // Density bars
    var mdBarEl = document.getElementById('mdDensityBar');
    var htmlBarEl = document.getElementById('htmlDensityBar');
    var mdWidth = (visualDensity_md / maxInfo * 100);
    var htmlWidth = (visualDensity_html / maxInfo * 100);
    mdBarEl.style.width = mdWidth + '%';
    mdBarEl.textContent = visualDensity_md + ' 项';
    htmlBarEl.style.width = htmlWidth + '%';
    htmlBarEl.textContent = visualDensity_html + ' 项';

    // Extra features
    var featuresEl = document.getElementById('extraFeatures');
    featuresEl.innerHTML = m.htmlExtraFeatures.map(function(f) {
      return '<span class="feature-tag">' + f + '</span>';
    }).join('');

    // Token cost comparison
    var tokenMd = Math.round(m.markdownChars / 3.5);
    var tokenHtml = Math.round(m.htmlChars / 3.5);
    document.getElementById('tokenMd').textContent = tokenMd;
    document.getElementById('tokenHtml').textContent = tokenHtml;
    document.getElementById('tokenRatio').textContent = (tokenHtml / tokenMd).toFixed(1) + 'x';
  }

  function updateViewMode() {
    var showRendered = viewMode === 'rendered';

    document.getElementById('mdRendered').style.display = showRendered ? 'block' : 'none';
    document.getElementById('htmlRendered').style.display = showRendered ? 'block' : 'none';
    document.getElementById('mdSource').classList.toggle('visible', !showRendered);
    document.getElementById('htmlSource').classList.toggle('visible', !showRendered);

    document.querySelectorAll('.toggle-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.mode === viewMode);
    });
  }

  // 简单 Markdown -> HTML 渲染器（仅覆盖演示中用到的语法）
  function renderMarkdown(md) {
    var lines = md.split('\n');
    var html = '';
    var inCode = false;
    var inTable = false;
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Code block
      if (line.startsWith('```')) {
        if (inCode) {
          html += '</code></pre>';
          inCode = false;
        } else {
          inCode = true;
          html += '<pre><code>';
        }
        continue;
      }
      if (inCode) {
        html += escapeHtml(line) + '\n';
        continue;
      }

      // Table
      if (line.startsWith('|')) {
        if (line.match(/^\|[\s-|]+$/)) continue; // separator row
        var cells = line.split('|').filter(function(c) { return c.trim(); });
        if (!inTable) {
          inTable = true;
          html += '<table><thead><tr>' + cells.map(function(c) { return '<th>' + inlineFormat(c.trim()) + '</th>'; }).join('') + '</tr></thead><tbody>';
        } else {
          html += '<tr>' + cells.map(function(c) { return '<td>' + inlineFormat(c.trim()) + '</td>'; }).join('') + '</tr>';
        }
        continue;
      } else if (inTable) {
        html += '</tbody></table>';
        inTable = false;
      }

      // List
      if (line.match(/^- /)) {
        if (!inList) { inList = true; html += '<ul>'; }
        html += '<li>' + inlineFormat(line.slice(2)) + '</li>';
        continue;
      } else if (inList) {
        html += '</ul>';
        inList = false;
      }

      // Checkbox list
      if (line.match(/^- \[[ x]\] /)) {
        var checked = line.charAt(3) === 'x';
        html += '<li>' + (checked ? '☑ ' : '☐ ') + inlineFormat(line.slice(6)) + '</li>';
        continue;
      }

      // Headings
      if (line.startsWith('### ')) { html += '<h3>' + inlineFormat(line.slice(4)) + '</h3>'; continue; }
      if (line.startsWith('## ')) { html += '<h2>' + inlineFormat(line.slice(3)) + '</h2>'; continue; }

      // HR
      if (line === '---') { html += '<hr>'; continue; }

      // Empty line
      if (line.trim() === '') { continue; }

      // Paragraph
      html += '<p>' + inlineFormat(line) + '</p>';
    }

    if (inTable) html += '</tbody></table>';
    if (inList) html += '</ul>';
    if (inCode) html += '</code></pre>';

    return html;
  }

  function inlineFormat(text) {
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    return text;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 视图切换
  window.setViewMode = function(mode) {
    viewMode = mode;
    updateViewMode();
  };

  // 汇总表格数据
  function renderSummaryTable() {
    var tbody = document.getElementById('summaryBody');
    tbody.innerHTML = SCENARIOS.map(function(s) {
      var m = s.metrics;
      var ratio = (m.htmlChars / m.markdownChars).toFixed(1);
      var infoGain = Math.round((m.htmlInfoItems / m.markdownInfoItems - 1) * 100);
      return '<tr><td>' + s.title + '</td><td>' + m.markdownChars + '</td><td>' + m.htmlChars + '</td><td>' + ratio + 'x</td><td>' + m.markdownInfoItems + '</td><td>' + m.htmlInfoItems + '</td><td>+' + infoGain + '%</td></tr>';
    }).join('');
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); renderSummaryTable(); });
  } else {
    init();
    renderSummaryTable();
  }
})();
