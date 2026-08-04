/**
 * Opus 5 提示词泄漏 - DOM 渲染与交互
 * 依赖：engine.js, translations.js, Chart.js, GSAP
 */
(function () {
  'use strict';

  // ════════════ 工具 ════════════
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ════════════ 第一屏：背景图 + hero ════════════
  // 背景图已在 HTML+CSS 中静态配置，无需渲染

  // ════════════ 第二屏：演化图 ════════════
  function renderEvolutionChart() {
    var ctx = document.getElementById('evolutionChart');
    if (!ctx || typeof Chart === 'undefined') return;

    var labels = E.VERSIONS.map(function (v) {
      return v.name.replace('Claude ', '');
    });
    var data = E.VERSIONS.map(function (v) {
      return Math.round(v.bytes / 1024);
    });
    var colors = E.VERSIONS.map(function (v) {
      return v.isCurrent ? '#8b1a1a' : '#111111';
    });

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'KB',
          data: data,
          backgroundColor: colors,
          borderColor: '#111',
          borderWidth: 1.5,
          borderRadius: 0,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111',
            titleColor: '#f3ede1',
            bodyColor: '#f3ede1',
            titleFont: { family: 'Charter, serif', weight: 'bold' },
            bodyFont: { family: 'Helvetica Neue, sans-serif' },
            padding: 10,
            cornerRadius: 0,
            callbacks: {
              afterLabel: function (ctx) {
                var v = E.VERSIONS[ctx.dataIndex];
                return v.lines + ' 行 · ' + v.date + ' · ' + v.tag;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#2b2b2b',
              font: { family: 'Charter, serif', size: 12 },
              callback: function (v) { return v + ' KB'; }
            },
            grid: { color: 'rgba(17,17,17,0.1)' },
            border: { color: '#111', width: 1.5 }
          },
          x: {
            ticks: {
              color: '#2b2b2b',
              font: { family: 'Charter, serif', size: 12 },
              maxRotation: 30, minRotation: 30
            },
            grid: { display: false },
            border: { color: '#111', width: 1.5 }
          }
        }
      }
    });
  }

  // ════════════ 第二屏：分屏对比 ════════════
  function renderSplitDiff() {
    var list47 = document.getElementById('diffList47');
    var list5 = document.getElementById('diffList5');
    var currentFilter = 'all';

    function buildRows() {
      list47.innerHTML = '';
      list5.innerHTML = '';
      E.MODULE_DIFF.forEach(function (m) {
        var in47 = m.v47 === true || m.v47 === 'stub';
        var in5 = m.v5 === true || m.v5 === 'full';

        // 过滤
        if (currentFilter === 'new' && !m.isNew) return;
        if (currentFilter === 'changed' && !m.isNew && !m.isHighlight && in47 === in5) return;

        // 左列 4.7
        if (in47) {
          var cls47 = 'diff-row';
          if (m.v47 === 'stub') cls47 += ' row-stub';
          if (!in5) cls47 += ' row-removed';
          var row47 = el('div', cls47);
          row47.innerHTML = '<i class="ti ti-check"></i> ' + m.zh +
            (m.v47 === 'stub' ? ' <span class="row-tag">3行占位</span>' : '');
          list47.appendChild(row47);
        } else {
          list47.appendChild(el('div', 'diff-row row-empty', '<i class="ti ti-minus"></i> —'));
        }

        // 右列 5
        if (in5) {
          var cls5 = 'diff-row';
          if (m.isNew) cls5 += ' row-new';
          if (m.isHighlight) cls5 += ' row-highlight';
          var row5 = el('div', cls5);
          var badge = '';
          if (m.isNew) badge = ' <span class="row-tag tag-new">新增</span>';
          if (m.isHighlight) badge = ' <span class="row-tag tag-hl">大升级</span>';
          row5.innerHTML = '<i class="ti ti-check"></i> ' + m.zh + badge +
            (m.note ? '<div class="row-note">' + m.note + '</div>' : '');
          list5.appendChild(row5);
        } else {
          list5.appendChild(el('div', 'diff-row row-empty', '<i class="ti ti-minus"></i> —'));
        }
      });
    }

    buildRows();

    // 过滤按钮
    document.querySelectorAll('.diff-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.diff-filter').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        nfTrack('filter_change', { filter: currentFilter });
        buildRows();
      });
    });

    // 增量标注
    var share = E.getMemoryShareOfGrowth();
    document.getElementById('growthCallout').innerHTML =
      '<i class="ti ti-arrow-wave-right-up"></i> ' +
      '4.7 → 5 增量 <b>+53 KB</b>，其中记忆系统从 <b>3 行</b>占位扩展为 <b>800 行</b>操作系统，' +
      '占增量的绝大部分。<b>fable_safeguards_routing</b>、<b>appropriate_boundaries_re_memory</b>、' +
      '<b>mcp_app_suggestions</b>、<b>thinking_behavior</b> 为全新模块。';
  }

  // ════════════ 第三屏：亮点卡片 ════════════
  function renderHighlights() {
    var grid = document.getElementById('highlightGrid');
    E.HIGHLIGHTS.forEach(function (h) {
      var card = el('div', 'hl-card');
      card.dataset.id = h.id;
      var newBadge = h.isNew ? '<span class="hl-new">5 新增</span>' : '';
      card.innerHTML =
        '<div class="hl-card-head">' +
          '<i class="ti ' + h.icon + '"></i>' +
          '<div class="hl-card-titles">' +
            '<div class="hl-card-title">' + h.title + newBadge + '</div>' +
            '<div class="hl-card-sub">' + h.sub + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="hl-card-body">' +
          '<div class="hl-en">' + h.en + '</div>' +
          '<div class="hl-zh">' + h.zh + '</div>' +
          '<div class="hl-roast"><i class="ti ti-message-2-share"></i> ' + h.roast + '</div>' +
          '<div class="hl-meta">原文：' + h.file + ' ' + h.line + '</div>' +
        '</div>';
      // 点击展开/收起
      card.querySelector('.hl-card-head').addEventListener('click', function () {
        card.classList.toggle('expanded');
        nfTrack('card_expand', { id: h.id, expanded: card.classList.contains('expanded') ? 1 : 0 });
      });
      grid.appendChild(card);
    });
  }

  // ════════════ 第四屏：记忆系统 ════════════
  function renderMemoryTree() {
    var tree = document.getElementById('memoryTree');
    E.MEMORY_TREE.forEach(function (n) {
      var node = el('div', 'mem-node');
      node.innerHTML =
        '<div class="mem-node-head">' +
          '<i class="ti ' + n.icon + '"></i>' +
          '<code>' + n.path + '</code>' +
          '<span class="mem-zh">' + n.zh + '</span>' +
        '</div>' +
        '<div class="mem-desc">' + n.desc + '</div>';
      tree.appendChild(node);
    });
  }

  function renderPrivacyTiers() {
    var wrap = document.getElementById('privacyTiers');
    E.PRIVACY_TIERS.forEach(function (t) {
      var tier = el('div', 'privacy-tier');
      tier.style.borderColor = t.color;
      var items = t.items.map(function (i) {
        return '<li><i class="ti ti-xbox-x" style="color:' + t.color + '"></i> ' + i + '</li>';
      }).join('');
      tier.innerHTML =
        '<div class="pt-head">' +
          '<i class="ti ' + t.icon + '" style="color:' + t.color + '"></i>' +
          '<span class="pt-title" style="color:' + t.color + '">' + t.title + '</span>' +
        '</div>' +
        '<ul class="pt-items">' + items + '</ul>' +
        '<div class="pt-rule">' + t.rule + '</div>';
      wrap.appendChild(tier);
    });
  }

  function renderParadox() {
    var h = E.getHighlightById('not-your-friend');
    if (h) {
      document.getElementById('paradoxQuote').innerHTML =
        '<i class="ti ti-quote"></i> ' + h.en + '<br><br><span class="pq-zh">' + h.zh + '</span>';
    }
  }

  // ════════════ 第五屏：中英对照 ════════════
  function renderBilingual() {
    var wrap = document.getElementById('bilingualList');
    if (typeof OPUS5_TRANSLATIONS === 'undefined') {
      wrap.innerHTML = '<div class="bi-empty">翻译文件未加载，请检查 translations.js</div>';
      return;
    }
    wrap.innerHTML = '';
    var keys = Object.keys(OPUS5_TRANSLATIONS);
    keys.forEach(function (key) {
      var s = OPUS5_TRANSLATIONS[key];
      if (!s || !s.zh) return;
      var item = el('div', 'bi-item');
      item.innerHTML =
        '<div class="bi-head" data-key="' + key + '">' +
          '<i class="ti ti-chevron-right"></i> ' +
          '<span class="bi-title">' + s.title + '</span>' +
          '<span class="bi-key">' + key + '</span>' +
        '</div>' +
        '<div class="bi-body">' +
          '<div class="bi-col bi-en"><div class="bi-label">EN</div>' + s.en + '</div>' +
          '<div class="bi-col bi-zh"><div class="bi-label">中文</div>' + s.zh + '</div>' +
        '</div>';
      item.querySelector('.bi-head').addEventListener('click', function () {
        item.classList.toggle('open');
        var icon = item.querySelector('.bi-head i');
        icon.className = item.classList.contains('open') ? 'ti ti-chevron-down' : 'ti ti-chevron-right';
      });
      wrap.appendChild(item);
    });
    if (wrap.children.length === 0) {
      wrap.innerHTML = '<div class="bi-empty">无翻译数据</div>';
    }
  }

  // ════════════ GSAP 动画 ════════════
  function initAnimations() {
    if (typeof gsap === 'undefined') {
      // GSAP 未加载：CSS 已默认 opacity:1，直接展示
      return;
    }
    gsap.registerPlugin(ScrollTrigger);

    // 首屏元素用 CSS 简单淡入（避免 GSAP 初始渲染竞态）
    // 后续滚到可视区再触发 GSAP 动画
    gsap.utils.toArray('[data-reveal]').forEach(function (e) {
      gsap.from(e, {
        opacity: 0,
        y: 30,
        duration: 0.8,
        delay: 0.1,
        immediateRender: false,
        scrollTrigger: { trigger: e, start: 'top 85%' }
      });
    });

    // 报纸版式缓慢上滚视差
    gsap.to('.newspaper', {
      y: -150,
      ease: 'none',
      scrollTrigger: { trigger: '#wall', start: 'top top', end: 'bottom top', scrub: true }
    });

    // 亮点卡片依次入场
    gsap.utils.toArray('.hl-card').forEach(function (card, i) {
      gsap.from(card, {
        opacity: 0,
        y: 40,
        duration: 0.5,
        delay: i * 0.08,
        scrollTrigger: { trigger: card, start: 'top 90%' }
      });
    });
  }

  // ════════════ 阅读进度条 ════════════
  function initProgressBar() {
    var bar = document.getElementById('readProgress');
    if (!bar) return;
    window.addEventListener('scroll', function () {
      var h = document.documentElement;
      var pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      bar.style.width = pct + '%';
    });
  }

  // ════════════ 行为埋点（NFTrack，见 components/track.js）════════════
  // 事件：session_start / filter_change / card_expand / session_end
  function nfTrack(name, props, opts) {
    try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
  }
  (function () {
    try { if (window.NFTrack) window.NFTrack.trackOnce('session_start', {}); } catch (e) {}
    window.addEventListener('pagehide', function () {
      nfTrack('session_end', { reason: 'leave' }, { force: true });
    });
  })();

  // ════════════ 初始化 ════════════
  document.addEventListener('DOMContentLoaded', function () {
    renderEvolutionChart();
    renderSplitDiff();
    renderHighlights();
    renderMemoryTree();
    renderPrivacyTiers();
    renderParadox();
    renderBilingual();
    initProgressBar();
    initAnimations();
  });
})();
