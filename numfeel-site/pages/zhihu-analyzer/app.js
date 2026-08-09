/**
 * 知乎创作数据报 — 应用主逻辑
 * 加载态（印刷中）· 数据渲染 · Chart.js 编辑风图表 · GSAP 滚动叙事
 */
(function () {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';
  var E = ZhihuEngine;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;

  var rawData = null;
  var cacheInfo = null;
  var currentSecret = null;
  var chartInstances = [];
  var wordFilter = loadWordFilter();

  // 编辑部配色（替代 engine 里的深色科技配色，仅用于展示层）
  var TYPE_COLOR = {
    article: '#16130f',
    answer: '#c8102e',
    zvideo: '#8a6d3b',
    pin: '#6f6a5e',
    question: '#b0793a'
  };
  var TYPE_LABEL = {
    article: '文章', answer: '回答', zvideo: '视频', pin: '想法', question: '问题'
  };

  var $ = function (id) { return document.getElementById(id); };

  var frontSection = $('frontSection');
  var loadingSection = $('loadingSection');
  var errorSection = $('errorSection');
  var report = $('report');
  var secretInput = $('secretInput');
  var analyzeBtn = $('analyzeBtn');

  // ====== 初始化 ======
  gsap.registerPlugin(ScrollTrigger);
  setMastDate();

  analyzeBtn.addEventListener('click', startAnalysis);
  $('retryBtn').addEventListener('click', resetToInput);
  secretInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startAnalysis();
  });
  initWordFilterUI();

  function setMastDate() {
    var now = new Date();
    $('mastDate').textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
  }

  function showOnly(el) {
    [frontSection, loadingSection, errorSection, report].forEach(function (s) {
      s.hidden = (s !== el);
    });
    if (el === report) {
      // report 需要滚动动画，先显示再触发
      window.scrollTo(0, 0);
    }
  }

  function resetToInput() {
    showOnly(frontSection);
    analyzeBtn.disabled = false;
    secretInput.value = '';
    destroyCharts();
    var badge = $('cacheBadge');
    if (badge) { badge.hidden = true; badge.classList.remove('refreshing'); }
    cacheInfo = null;
  }

  function destroyCharts() {
    hideHistDetail();
    for (var i = 0; i < chartInstances.length; i++) {
      if (chartInstances[i]) chartInstances[i].destroy();
    }
    chartInstances = [];
  }

  // ====== 开始分析（含印刷中加载态） ======
  function startAnalysis() {
    var secret = secretInput.value.trim();
    if (!secret) {
      $('errorText').textContent = '先贴一个 Access Secret，我们才好开印。';
      showOnly(errorSection);
      return;
    }
    runAnalysis(secret, false);
  }

  // 强制跳过缓存、重新拉取知乎数据
  function forceRefresh() {
    if (!currentSecret) return;
    var btn = $('forceRefreshBtn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('spinning');
    }
    runAnalysis(currentSecret, true);
  }

  function runAnalysis(secret, force) {
    currentSecret = secret;
    showOnly(loadingSection);
    analyzeBtn.disabled = true;
    runPrintingStages();

    var url = API_BASE + '/zhihu/analyze' + (force ? '?force=true' : '');
    fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secret,
        'Content-Type': 'application/json'
      }
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || body.status !== 200) {
            throw new Error(body.message || '这期没印出来');
          }
          return body;
        });
      })
      .then(function (body) {
        rawData = body.data;
        cacheInfo = body.cache || null;
        if (!rawData.items || rawData.items.length === 0) {
          throw new Error('没找到你的公开创作，换个账号试试？');
        }
        $('printingStep').textContent = '排版完成，正在出报…';
        setTimeout(function () {
          showOnly(report);
          analyzeBtn.disabled = false;
          renderAll();
        }, 350);
      })
      .catch(function (err) {
        $('errorText').textContent = err.message || '网络开小差了，重试一下。';
        showOnly(errorSection);
        analyzeBtn.disabled = false;
        // 强制刷新失败时重绘徽标，恢复「强制刷新」按钮
        if (cacheInfo) renderCacheBadge();
      });
  }

  // 印刷进度：分阶段提示 + 进度条 + 骨架动画
  function runPrintingStages() {
    var steps = [
      '接通知乎开放平台…', '正在拉取你的创作…', '数点赞、算评论…', '分词，生成词云…', '排版成报纸…'
    ];
    var fill = $('printingFill');
    var stepEl = $('printingStep');
    gsap.fromTo(fill, { width: '0%' }, { width: '100%', duration: 4.5, ease: 'power1.inOut' });
    var i = 0;
    stepEl.textContent = steps[0];
    var timer = setInterval(function () {
      i++;
      if (i < steps.length) {
        stepEl.textContent = steps[i];
      } else {
        clearInterval(timer);
      }
    }, 900);
    // 骨架透视淡入
    gsap.from('.paper-skeleton .sk', { opacity: 0, y: 8, stagger: 0.06, duration: 0.5, ease: 'power2.out' });
  }

  // ====== 渲染全部 ======
  function renderAll() {
    // 强制刷新等场景会二次进入：先清掉旧图表，避免 Canvas 被占用
    destroyCharts();
    var items = rawData.items;
    var stats = E.computeStats(items);

    renderHead(stats);
    renderNumbers(stats);
    renderInsight(stats);
    renderType(rawData);
    renderTimeline(items);
    renderRhythm(items);
    renderHistograms(items);
    renderWordCloud(rawData.wordCloud);
    renderYearly(rawData.yearlyStats);
    renderTop(rawData);
    renderClock(items);
    renderTrend(items);
    renderFollow(rawData.followStats);
    renderCollection(rawData.collectionStats);
    renderCacheBadge();
    bindCopy(items, stats);
    initReveals();
  }

  // ====== 关注画像 ======
  function renderFollow(followStats) {
    var section = $('followSection');
    if (!section) return;
    if (!followStats || !followStats.top || followStats.top.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    var total = followStats.total || followStats.top.length;
    $('followDeck').textContent =
      '你一共关注了 ' + E.formatNumber(total) + ' 人。按粉丝数排队，下面这几位是你关注列表里最「大牌」的。';
    var grid = $('followGrid');
    grid.innerHTML = '';
    followStats.top.forEach(function (u) {
      var card = document.createElement('a');
      card.className = 'follow-card';
      card.href = u.url || ('https://www.zhihu.com/people/' + u.urlToken);
      card.target = '_blank';
      card.rel = 'noopener';
      var img = u.avatarUrl
        ? '<img class="follow-avatar" src="' + u.avatarUrl + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'">'
        : '<span class="follow-avatar follow-avatar-ph">' + escapeHtml((u.fullname || '知')[0]) + '</span>';
      card.innerHTML =
        img +
        '<div class="follow-body">' +
          '<div class="follow-name">' + escapeHtml(u.fullname || u.urlToken || '知友') + '</div>' +
          '<div class="follow-headline">' + escapeHtml(u.headline || '') + '</div>' +
          '<div class="follow-meta">' + E.formatNumber(u.followerCount) + ' 粉丝</div>' +
        '</div>';
      grid.appendChild(card);
    });
  }

  // ====== 收藏画像 ======
  // 书脊色板：只从报纸色里取，绝不用彩虹色
  var SPINE_COLORS = ['#8f1d2c', '#2f4a3c', '#2e425b', '#7a5c2e', '#2b2823', '#6b3f2b'];

  function clampNum(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function formatAgo(ts) {
    var diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
    return E.formatDateTime(ts);
  }

  function renderCollection(collectionStats) {
    var section = $('collectionSection');
    if (!section) return;
    var favlists = (collectionStats && collectionStats.favlists) || [];
    var recent = (collectionStats && collectionStats.recent) || [];
    if (favlists.length === 0 && recent.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    var pubFavs = favlists.filter(function (f) { return f.isPublic; });
    var privFavs = favlists.filter(function (f) { return !f.isPublic; });
    var pubColor = {};
    pubFavs.forEach(function (f, i) { pubColor[f.title] = SPINE_COLORS[i % SPINE_COLORS.length]; });

    // —— 书架：公开收藏夹立成书脊 ——
    var stand = $('bsStand');
    stand.innerHTML = '';
    if (pubFavs.length) {
      pubFavs.forEach(function (f) {
        var title = f.title || '未命名收藏夹';
        // 书脊厚度跟着名字长短走，像真书柜
        var width = clampNum(24 + title.length * 2.4, 28, 64);
        var el = document.createElement(f.urlToken ? 'a' : 'div');
        el.className = 'book-spine';
        el.style.width = width + 'px';
        el.style.background = pubColor[f.title];
        el.innerHTML = '<span class="spine-text">' + escapeHtml(title) + '</span>';
        if (f.urlToken) {
          el.href = 'https://www.zhihu.com/collection/' + f.urlToken;
          el.target = '_blank';
          el.rel = 'noopener';
        }
        stand.appendChild(el);
      });
    } else {
      stand.innerHTML = '<div class="empty-note">没有公开收藏夹，书架先空着。</div>';
    }

    // —— 私密收藏夹：横躺顶层，带锁 ——
    var privLayer = $('privateShelfLayer');
    privLayer.hidden = privFavs.length === 0;
    privLayer.innerHTML = '';
    privFavs.forEach(function (f) {
      var lying = document.createElement('div');
      lying.className = 'book-lying';
      lying.title = '私密收藏夹 · 分享页面不展示';
      lying.innerHTML =
        '<span class="iconify" data-icon="ph:lock-simple"></span>' +
        '<span class="bl-title">' + escapeHtml(f.title || '未命名收藏夹') + '</span>';
      privLayer.appendChild(lying);
    });
    if (window.iconify) window.iconify.scan(privLayer);

    // —— 精致列表：只收公开收藏夹里的内容 ——
    var listEl = $('collectionList');
    listEl.innerHTML = '';
    // 老接口没返回 favlistTitles 时退化为全量展示，避免整段空白
    var hasFavlistTags = recent.some(function (c) {
      return c.favlistTitles && c.favlistTitles.length;
    });
    var visible = hasFavlistTags
      ? recent.filter(function (c) {
          return (c.favlistTitles || []).some(function (t) { return pubColor[t]; });
        })
      : recent;

    visible.forEach(function (c, i) {
      var row = document.createElement('div');
      row.className = 'collect-item';
      var tag = TYPE_LABEL[c.contentType] || c.contentType || '';
      var inFav = (c.favlistTitles || []).filter(function (t) { return pubColor[t]; });
      var favName = inFav[0] || '';
      var favColor = pubColor[favName] || '';
      row.innerHTML =
        '<span class="ci-index">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="ci-main">' +
          '<div class="ci-title">' + escapeHtml(c.title || '(无标题)') + '</div>' +
          '<div class="ci-meta">' +
            (favName
              ? '<span class="ci-fav" style="border-color:' + favColor + ';color:' + favColor + '">' +
                '<i style="background:' + favColor + '"></i>' + escapeHtml(favName) + '</span>'
              : '') +
            (c.authorName ? '<span class="ci-author">' + escapeHtml(c.authorName) + '</span>' : '') +
            (tag ? '<span class="ci-type">' + tag + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="ci-side">' +
          '<span class="ci-time">' + formatAgo(c.favTime) + ' 收藏</span>' +
          '<span class="ci-like">' + E.formatNumber(c.likeCount) + ' 赞</span>' +
        '</div>';
      if (c.url) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function () { window.open(c.url, '_blank'); });
      }
      listEl.appendChild(row);
    });
    if (visible.length === 0) {
      listEl.innerHTML = '<div class="empty-note">公开收藏夹里还没内容，去给好文点个收藏吧。</div>';
    }

    // 书架超宽时打上标记，显示右侧渐隐遮罩
    var scrollEl = section.querySelector('.bs-scroll');
    var shelfEl = section.querySelector('.bookshelf');
    if (scrollEl && shelfEl) {
      if (scrollEl.scrollWidth > scrollEl.clientWidth + 8) {
        shelfEl.setAttribute('data-more', '');
      } else {
        shelfEl.removeAttribute('data-more');
      }
    }
  }

  // ====== 缓存提示 ======
  function renderCacheBadge() {
    var badge = $('cacheBadge');
    if (!badge) return;
    if (!cacheInfo) { badge.hidden = true; return; }
    if (cacheInfo.cached) {
      // 命中缓存：常驻徽标（带「强制刷新」入口）
      badge.hidden = false;
      badge.classList.remove('refreshing');
      paintCacheBadge(badge, cacheInfo);
      if (window.iconify) window.iconify.scan(badge);
      var btn = $('forceRefreshBtn');
      if (btn) btn.addEventListener('click', forceRefresh);
      // 30 秒更新一次「剩 X 分钟」文案，不重新拉数据
      if (badge._tick) clearInterval(badge._tick);
      badge._tick = setInterval(function () {
        if (badge.hidden) { clearInterval(badge._tick); return; }
        paintCacheBadge(badge, cacheInfo);
        if (window.iconify) window.iconify.scan(badge);
      }, 30000);
    } else {
      // 首次抓取：做成 toast，自动关闭，不留常驻 UI
      badge.hidden = true;
      if (badge._tick) clearInterval(badge._tick);
      showCacheToast();
    }
  }

  // 首次抓取提示：浮层 toast，5 秒自动淡出，可手动关闭
  function showCacheToast() {
    var old = document.getElementById('cacheToast');
    if (old) old.remove();
    var toast = document.createElement('div');
    toast.id = 'cacheToast';
    toast.className = 'cache-toast';
    toast.innerHTML =
      '<span class="iconify" data-icon="ph:check-circle"></span>' +
      '<span class="ct-text">刚刚抓取 · 15 分钟内不会再拉</span>' +
      '<button class="ct-close" id="ctCloseBtn" type="button" aria-label="关闭">' +
        '<span class="iconify" data-icon="ph:x"></span>' +
      '</button>';
    document.body.appendChild(toast);
    if (window.iconify) window.iconify.scan(toast);

    var closed = false;
    function dismiss() {
      if (closed) return;
      closed = true;
      gsap.to(toast, {
        opacity: 0, y: 10, duration: 0.4, ease: 'power2.in',
        onComplete: function () { toast.remove(); }
      });
    }
    var closeBtn = document.getElementById('ctCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', dismiss);

    gsap.fromTo(toast, { opacity: 0, y: 14, xPercent: -50 }, { opacity: 1, y: 0, xPercent: -50, duration: 0.5, ease: 'power2.out' });
    setTimeout(dismiss, 5000);
  }

  function paintCacheBadge(badge, info) {
    var now = Math.floor(Date.now() / 1000);
    var age = Math.max(0, now - info.cachedAt);
    var remaining = Math.max(0, info.expiresAt - now);
    var ttlMin = Math.round(info.ttlSeconds / 60);
    if (info.cached) {
      badge.className = 'cache-badge cached';
      badge.innerHTML =
        '<span class="iconify" data-icon="ph:database"></span>' +
        '<span class="cb-text">缓存于 ' + formatAge(age) + '前 · 还剩 ' + formatAge(remaining) + '自动刷新</span>' +
        '<button class="cb-btn" id="forceRefreshBtn" type="button">' +
          '<span class="iconify" data-icon="ph:arrow-clockwise"></span> 强制刷新' +
        '</button>';
    } else {
      badge.className = 'cache-badge fresh';
      badge.innerHTML =
        '<span class="iconify" data-icon="ph:check-circle"></span>' +
        '<span class="cb-text">刚刚抓取 · ' + ttlMin + ' 分钟内不会再拉</span>' +
        '<button class="cb-btn" id="forceRefreshBtn" type="button">' +
          '<span class="iconify" data-icon="ph:arrow-clockwise"></span> 立即拉新' +
        '</button>';
    }
  }

  function formatAge(secs) {
    if (secs < 60) return secs + ' 秒';
    if (secs < 3600) return Math.round(secs / 60) + ' 分钟';
    return Math.round(secs / 3600) + ' 小时';
  }

  // ====== 头版 ======
  function renderHead(stats) {
    $('rhTotal').textContent = E.formatNumber(stats.total);
    $('rhDeck').innerHTML =
      '从 <span class="serif-bold">' + E.formatDate(stats.firstCreated) + '</span> 到 <span class="serif-bold">' +
      E.formatDate(stats.lastCreated) + '</span>，一共 <span class="serif-bold">' + E.formatNumber(stats.total) +
      '</span> 篇内容、<span class="serif-bold">' + E.formatNumber(stats.totalLikes) + '</span> 次点赞。我们把它排成头版。';
  }

  // ====== 关键数字（GSAP 数字滚动） ======
  function renderNumbers(stats) {
    var map = {
      total: stats.total,
      likes: stats.totalLikes,
      comments: stats.totalComments,
      favorites: stats.totalFavorites,
      days: stats.span,
      avg: stats.avgLikes
    };
    var rows = document.querySelectorAll('.num-row');
    rows.forEach(function (row) {
      var label = row.querySelector('.num-label').getAttribute('data-count-for');
      if (!label) { row.querySelector('.num-val').textContent = '—'; return; }
      var target = map[label] || 0;
      var valEl = row.querySelector('.num-val');
      valEl.textContent = '0';
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 1.8, ease: 'power3.out',
        onUpdate: function () { valEl.textContent = E.formatNumber(Math.round(obj.v)); }
      });
    });
  }

  // ====== 编辑手记引语（一句话洞察） ======
  function renderInsight(stats) {
    var mainType = '';
    var max = 0;
    var keys = Object.keys(stats.byType);
    for (var i = 0; i < keys.length; i++) {
      if (stats.byType[keys[i]] > max) { max = stats.byType[keys[i]]; mainType = keys[i]; }
    }
    var pct = stats.total > 0 ? Math.round(max / stats.total * 100) : 0;
    var txt = '你把自己活成了《' + (TYPE_LABEL[mainType] || mainType) + '》——' + pct + '% 的内容，都在这里。';
    $('insightText').textContent = txt;
  }

  // ====== 内容结构 ======
  function renderType(data) {
    var byType = data.byType;
    var keys = Object.keys(byType);
    var ctx = $('typeDonutChart').getContext('2d');
    var chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: keys.map(function (k) { return TYPE_LABEL[k] || k; }),
        datasets: [{
          label: '篇数',
          data: keys.map(function (k) { return byType[k]; }),
          backgroundColor: keys.map(function (k) { return TYPE_COLOR[k] || '#3a342c'; }),
          borderColor: '#faf9f3',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#6f6a5e', padding: 14, font: { family: 'Albert Sans, sans-serif', size: 12 } } },
          tooltip: { backgroundColor: '#16130f', titleFont: { family: 'Albert Sans, sans-serif' } }
        }
      }
    });
    chartInstances.push(chart);

    // 各类型「篇数 / 篇均赞」双信息（柱状 = 篇数，与圆环同维度，避免误读）
    var totals = {};
    var likes = {};
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      totals[it.contentType] = (totals[it.contentType] || 0) + 1;
      likes[it.contentType] = (likes[it.contentType] || 0) + it.likeCount;
    }
    var maxCount = 0;
    keys.forEach(function (k) { if (totals[k] > maxCount) maxCount = totals[k]; });
    var bars = $('efficiencyBars');
    bars.innerHTML = '';
    keys.forEach(function (k) {
      var c = totals[k] || 0;
      var avg = c > 0 ? Math.round(likes[k] / c) : 0;
      var pct = maxCount > 0 ? (c / maxCount) : 0;
      var row = document.createElement('div');
      row.className = 'eff-row';
      row.innerHTML =
        '<div class="eff-head">' +
          '<span class="eff-label">' + (TYPE_LABEL[k] || k) + '</span>' +
          '<span class="eff-count">' + c + ' 篇</span>' +
        '</div>' +
        '<div class="eff-track"><div class="eff-fill" style="background:' + (TYPE_COLOR[k] || '#3a342c') +
        ';width:' + pct * 100 + '%;"></div></div>' +
        '<span class="eff-val">篇均 ' + E.formatNumber(avg) + ' 赞</span>';
      bars.appendChild(row);
    });
    gsap.from('.eff-fill', { scaleX: 0, transformOrigin: 'left', duration: 1.1, ease: 'power3.out', stagger: 0.08 });
  }

  // ====== 时间轴 ======
  function renderTimeline(items) {
    var dots = $('timelineDots');
    var axis = $('timelineAxis');
    dots.innerHTML = '';
    axis.innerHTML = '';

    // 图例
    var legend = $('timelineLegend');
    legend.innerHTML = '';
    ['article', 'answer', 'zvideo', 'pin', 'question'].forEach(function (k) {
      var s = document.createElement('span');
      s.className = 'tl-legend-item';
      s.innerHTML = '<span class="tl-dot" style="background:' + (TYPE_COLOR[k] || '#3a342c') + '"></span>' + (TYPE_LABEL[k] || k);
      legend.appendChild(s);
    });

    if (!items.length) return;
    var sorted = items.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
    var minTs = sorted[0].createdAt;
    var maxTs = sorted[sorted.length - 1].createdAt;
    var range = (maxTs - minTs) || 1;
    // 根据密度自适应：每点 1.4px（密集时）~2.4px（稀疏时），但不超过视口宽度的 1.2 倍
    var pxPerItem = sorted.length > 600 ? 1.2 : sorted.length > 300 ? 1.6 : 2.2;
    var idealWidth = sorted.length * pxPerItem + 40;
    var maxWidth = Math.max(760, Math.min(idealWidth, Math.min(window.innerWidth * 1.15, 1600)));
    var containerWidth = Math.max(760, maxWidth);
    dots.style.width = containerWidth + 'px';
    axis.style.width = containerWidth + 'px';

    var dotSize = Math.max(4, Math.min(12, 480 / Math.sqrt(sorted.length)));
    var lastLabelX = -Infinity;

    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i];
      var x = ((item.createdAt - minTs) / range) * (containerWidth - 40) + 20;
      var engagement = item.likeCount + item.commentCount * 2 + item.favoriteCount * 3;
      var y = 40 + Math.abs(Math.sin(i * 0.6)) * 150;
      var size = dotSize + Math.min(dotSize * 2, engagement / 120);

      var dot = document.createElement('div');
      dot.className = 'timeline-dot';
      dot.style.left = x + 'px';
      dot.style.top = y + 'px';
      dot.style.width = size + 'px';
      dot.style.height = size + 'px';
      dot.style.background = TYPE_COLOR[item.contentType] || '#3a342c';
      dot.dataset.index = i;

      dot.addEventListener('mouseenter', function () { showTooltip(this, sorted[parseInt(this.dataset.index)]); });
      dot.addEventListener('mouseleave', hideTooltip);
      dot.addEventListener('click', function () {
        var it = sorted[parseInt(this.dataset.index)];
        if (it.url) window.open(it.url, '_blank');
      });
      dots.appendChild(dot);

      var d = new Date(item.createdAt * 1000);
      var year = d.getFullYear();
      var prev = i > 0 ? new Date(sorted[i - 1].createdAt * 1000).getFullYear() : null;
      if (i === 0 || prev !== year) {
        // 年份标签间距过近时省略，避免重叠
        var minLabelGap = 56;
        var canShow = i === 0 || (x - lastLabelX) >= minLabelGap;
        if (canShow) {
          var label = document.createElement('span');
          label.className = 'timeline-axis-label';
          label.style.left = x + 'px';
          label.textContent = year;
          axis.appendChild(label);
          lastLabelX = x;
        }
      }
    }

    // 随滚动“自己铺开”
    gsap.fromTo('#timelineDots .timeline-dot',
      { scale: 0, opacity: 0 },
      {
        scale: 1, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: '#timelineStage', start: 'top 85%', end: 'bottom 35%', scrub: 0.6 }
      });
  }

  function showTooltip(dotEl, item) {
    var tt = $('timelineTooltip');
    if (!tt) return;
    $('ttType').textContent = TYPE_LABEL[item.contentType] || item.contentType;
    $('ttTitle').textContent = item.title;
    $('ttStats').textContent = '赞 ' + E.formatNumber(item.likeCount) + ' · 评 ' + E.formatNumber(item.commentCount) + ' · 藏 ' + E.formatNumber(item.favoriteCount);
    $('ttDate').textContent = E.formatDateTime(item.createdAt);
    // 先显示出来再测真实尺寸，再贴到 dot 旁边
    tt.style.display = 'block';
    tt.style.left = '0px';
    tt.style.top = '0px';
    tt.className = 'timeline-tooltip';
    var tw = tt.offsetWidth;
    var th = tt.offsetHeight;
    var rect = dotEl.getBoundingClientRect();
    var gap = 10;
    // 默认：tooltip 放在 dot 正上方，水平居中对齐
    var x = rect.left + rect.width / 2 - tw / 2;
    var y = rect.top - th - gap;
    var dir = 'up';
    // 右侧出界 → 翻到 dot 左侧
    if (x + tw > window.innerWidth - 8) {
      x = rect.left - tw - gap;
      dir = 'right';
    }
    // 左侧也出界 → 翻回右侧
    if (x < 8) {
      x = rect.right + gap;
      dir = 'left';
    }
    // 垂直方向：上方放不下就放下方
    if (y < 8) {
      y = rect.bottom + gap;
      if (dir === 'up') dir = 'down';
      else if (dir === 'right') dir = 'right';
      else if (dir === 'left') dir = 'left';
    }
    if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
    // 兜底 clamp
    if (x < 8) x = 8;
    if (x + tw > window.innerWidth - 8) x = window.innerWidth - tw - 8;
    // 给 tooltip 加方向 class，三角形指向 dot
    if (dir === 'down') tt.classList.add('below');
    else if (dir === 'left') tt.classList.add('right');
    else if (dir === 'right') tt.classList.add('left');
    // 调整三角形水平位置：让它指向 dot 中心
    var dotCenterX = rect.left + rect.width / 2;
    var tipCenterX = x + tw / 2;
    var offsetX = dotCenterX - tipCenterX;
    var maxOffset = tw / 2 - 14;
    if (offsetX > maxOffset) offsetX = maxOffset;
    if (offsetX < -maxOffset) offsetX = -maxOffset;
    tt.style.setProperty('--tt-arrow-x', offsetX + 'px');
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }
  function hideTooltip() {
    var tt = $('timelineTooltip');
    if (tt) tt.style.display = 'none';
  }

  // ====== 发布节奏（年×月热力 + 年度趋势） ======
  function renderRhythm(items) {
    var monthly = E.aggregateByMonth(items);
    var map = {};
    monthly.labels.forEach(function (k, i) { map[k] = monthly.data[i]; });
    var years = [];
    monthly.labels.forEach(function (k) {
      var y = k.slice(0, 4);
      if (years.indexOf(y) === -1) years.push(y);
    });

    var heat = $('rhythmHeat');
    heat.innerHTML = '';
    // 表头：月份
    var head = document.createElement('div');
    head.className = 'heat-grid';
    for (var m = 0; m < 12; m++) {
      var hc = document.createElement('div');
      hc.className = 'heat-lbl';
      hc.textContent = (m + 1) + '月';
      head.appendChild(hc);
    }
    heat.appendChild(head);

    var maxCount = 1;
    monthly.data.forEach(function (v) { if (v > maxCount) maxCount = v; });

    years.forEach(function (yr) {
      var row = document.createElement('div');
      row.className = 'heat-grid';
      for (var mm = 1; mm <= 12; mm++) {
        var key = yr + '-' + String(mm).padStart(2, '0');
        var c = map[key] || 0;
        var cell = document.createElement('div');
        cell.className = 'heat-cell';
        cell.title = key + '：' + c + ' 篇';
        var alpha = c / maxCount;
        cell.style.background = c === 0 ? '#f3f0e6' : 'rgba(200,16,46,' + (0.15 + alpha * 0.85) + ')';
        cell.style.borderColor = c === 0 ? '#e2ddcf' : 'rgba(200,16,46,0.4)';
        row.appendChild(cell);
      }
      heat.appendChild(row);
      // 年份标注嵌在行首左侧
      var cap = document.createElement('div');
      cap.className = 'heat-lbl';
      cap.style.textAlign = 'left';
      cap.textContent = yr;
      heat.appendChild(cap);
    });

    // 年度趋势
    var byYear = E.computeStats(items).byYear;
    var yk = Object.keys(byYear).sort();
    var ctx = $('yearlyTrendChart').getContext('2d');
    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: yk,
        datasets: [{
          label: '发布数',
          data: yk.map(function (k) { return byYear[k]; }),
          backgroundColor: 'rgba(200,16,46,0.75)',
          borderColor: '#c8102e',
          borderWidth: 1
        }]
      },
      options: chartOptions('每年发布数', true)
    });
    chartInstances.push(chart);
  }

  // ====== 互动分布直方图 ======
  function renderHistograms(items) {
    renderHistogram('likesHistogram', items, function (i) { return i.likeCount; }, '获赞分布', '#c8102e', '获赞');
    renderHistogram('commentsHistogram', items, function (i) { return i.commentCount; }, '评论分布', '#16130f', '评论');
    renderHistogram('favoritesHistogram', items, function (i) { return i.favoriteCount; }, '收藏分布', '#8a6d3b', '收藏');
  }

  function renderHistogram(canvasId, items, valueFn, title, color, unit) {
    // 保留 value → item 的映射，便于点击柱子时展开具体文章
    var pairs = [];
    for (var i = 0; i < items.length; i++) {
      var v = valueFn(items[i]);
      if (v > 0) pairs.push({ item: items[i], value: v });
    }
    var values = pairs.map(function (p) { return p.value; });
    var hist = E.histogram(values, 12);
    // 把每桶的值反查回文章（同值多篇按出现顺序）；存 {item, value} 便于展开时显示具体值
    var valueToItems = {};
    for (var k = 0; k < pairs.length; k++) {
      (valueToItems[pairs[k].value] = valueToItems[pairs[k].value] || []).push(pairs[k]);
    }
    var bucketItems = (hist.buckets || []).map(function (vals) {
      var list = [];
      // 同一数值只反查一次，避免篇数按出现次数膨胀
      var seenVal = {};
      for (var m = 0; m < vals.length; m++) {
        if (seenVal[vals[m]]) continue;
        seenVal[vals[m]] = true;
        list = list.concat(valueToItems[vals[m]] || []);
      }
      return list;
    });

    var ctx = document.getElementById(canvasId).getContext('2d');
    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hist.labels,
        datasets: [{
          label: '篇数',
          data: hist.data,
          backgroundColor: 'rgba(200,16,46,0.55)',
          borderColor: color,
          borderWidth: 1
        }]
      },
      options: histogramChartOptions(title, unit, bucketItems)
    });
    chartInstances.push(chart);
  }

  // 直方图专用配置：X 轴带「互动量」标题，标注对数桶；点击柱子展开桶内具体文章
  function histogramChartOptions(title, unit, bucketItems) {
    var self = {
      responsive: true,
      maintainAspectRatio: false,
      onClick: function (event, elements, chart) {
        var el = elements && elements[0];
        if (!el || !bucketItems) return;
        showHistDetail(chart, el.index, unit, bucketItems);
      },
      plugins: {
        // 单数据集，图例冗余，关掉省顶部空间
        legend: { display: false },
        title: title ? {
          display: true,
          text: title,
          color: '#3a342c',
          font: { family: 'Albert Sans, sans-serif', size: 13, weight: '600' },
          padding: { bottom: 6 }
        } : undefined,
        tooltip: {
          backgroundColor: '#16130f',
          titleFont: { family: 'Albert Sans, sans-serif' },
          callbacks: {
            title: function (items) { return items[0].label; },
            label: function (ctx) { return ctx.parsed.y + ' 篇'; }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: { color: '#6f6a5e', precision: 0 },
          title: { display: true, text: '篇数', color: '#6f6a5e', font: { family: 'Noto Serif SC, serif', size: 11 } }
        },
        x: {
          grid: { display: false },
          // 桶标签横排，节省垂直空间，给柱子留足高度
          ticks: { color: '#6f6a5e', maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { family: 'Noto Serif SC, serif', size: 11 } },
          title: { display: true, text: '互动量（这一桶 = 落在这个数量级的内容数）', color: '#3a342c', font: { family: 'Noto Serif SC, serif', size: 11 }, padding: { top: 8 } }
        }
      }
    };
    return self;
  }

  // 点击柱子：在图表旁展开这个桶里的具体文章
  function showHistDetail(chart, barIndex, unit, bucketItems) {
    var entries = bucketItems[barIndex] || [];
    var label = chart.data.labels[barIndex];
    hideHistDetail();
    var pop = document.createElement('div');
    pop.id = 'histPopover';
    pop.className = 'hist-popover';
    // 按互动值降序，最多展示 8 篇
    entries = entries.slice().sort(function (a, b) { return b.value - a.value; });
    var head = entries.length + ' 篇落在「' + label + '」区间';
    var listHtml = '';
    var shown = entries.slice(0, 8);
    for (var i = 0; i < shown.length; i++) {
      var e = shown[i];
      var it = e.item;
      var titleText = it.title || '(无标题)';
      var link = it.url ? '<a class="hp-link" href="' + it.url + '" target="_blank" rel="noopener">打开</a>' : '';
      listHtml +=
        '<div class="hp-row">' +
          '<div class="hp-main">' +
            '<div class="hp-title">' + escapeHtml(titleText) + '</div>' +
            '<div class="hp-meta">' + E.formatDate(it.createdAt) + ' · ' + (TYPE_LABEL[it.contentType] || it.contentType) + ' · ' + E.formatNumber(e.value) + ' ' + unit + '</div>' +
          '</div>' +
          link +
        '</div>';
    }
    if (entries.length > 8) {
      listHtml += '<div class="hp-more">还有 ' + (entries.length - 8) + ' 篇，点击柱外区域关闭。</div>';
    }
    pop.innerHTML =
      '<div class="hp-head">' +
        '<span class="hp-label">' + escapeHtml(label) + '</span>' +
        '<span class="hp-count">' + head + '</span>' +
        '<button class="hp-close" id="histPopoverClose" type="button" aria-label="关闭"><span class="iconify" data-icon="ph:x"></span></button>' +
      '</div>' +
      '<div class="hp-list">' + listHtml + '</div>';
    document.body.appendChild(pop);
    if (window.iconify) window.iconify.scan(pop);

    var closeBtn = document.getElementById('histPopoverClose');
    if (closeBtn) closeBtn.addEventListener('click', hideHistDetail);
    // 点击弹层外部关闭
    setTimeout(function () {
      document.addEventListener('click', onHistDocClick, false);
    }, 0);

    // 定位到图表右侧；放不下则放左侧
    var canvas = chart.canvas;
    var rect = canvas.getBoundingClientRect();
    pop.style.visibility = 'hidden';
    pop.style.display = 'block';
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    pop.style.visibility = '';
    var x = rect.right + 14;
    if (x + pw > window.innerWidth - 8) x = rect.left - pw - 14;
    if (x < 8) x = 8;
    var y = rect.top;
    if (y + ph > window.innerHeight - 8) y = Math.max(8, window.innerHeight - ph - 8);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    // 简单淡入
    if (window.gsap) gsap.fromTo(pop, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
  }

  function onHistDocClick(e) {
    var pop = document.getElementById('histPopover');
    if (!pop) { document.removeEventListener('click', onHistDocClick, false); return; }
    if (pop.contains(e.target)) return;
    hideHistDetail();
  }

  function hideHistDetail() {
    document.removeEventListener('click', onHistDocClick, false);
    var pop = document.getElementById('histPopover');
    if (pop) pop.remove();
  }

  // ====== 词云 ======
  function renderWordCloud(wordCloudData) {
    if (!wordCloudData || !wordCloudData.length) return;
    var filtered = applyWordFilter(wordCloudData);
    if (!filtered.length) {
      var canvas = $('wordCloudCanvas');
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#6f6a5e';
      ctx.font = '16px "Noto Serif SC", "Songti SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText('所有词都被过滤了，去「过滤词」面板里删几个。', canvas.width / 2, canvas.height / 2);
      return;
    }
    var canvas = $('wordCloudCanvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var maxCount = filtered[0].count;
    var minCount = filtered[filtered.length - 1].count;
    var range = (maxCount - minCount) || 1;
    var colors = ['#16130f', '#c8102e', '#8a6d3b', '#6f6a5e', '#b0793a', '#3a342c'];
    var placed = [];
    var cx = W / 2, cy = H / 2;

    for (var i = 0; i < filtered.length; i++) {
      var entry = filtered[i];
      var ratio = (entry.count - minCount) / range;
      var fontSize = 14 + ratio * 46;
      var color = colors[i % colors.length];
      ctx.font = '700 ' + fontSize + 'px "Noto Serif SC","Songti SC",serif';
      ctx.fillStyle = color;
      var tw = ctx.measureText(entry.word).width;
      var th = fontSize;
      var angle = (i * 0.618033988749895) * Math.PI * 2;
      var found = false, x = 0, y = 0;
      for (var r = 0; r < Math.max(W, H); r += 3) {
        for (var a = 0; a < 8; a++) {
          var ta = angle + a * Math.PI / 4;
          x = cx + Math.cos(ta) * r - tw / 2;
          y = cy + Math.sin(ta) * r + th / 3;
          if (x > 10 && x + tw < W - 10 && y > th && y < H - 10 && !overlap(x, y, tw, th, placed)) {
            found = true; break;
          }
        }
        if (found) break;
      }
      if (found) {
        ctx.fillText(entry.word, x, y + th);
        placed.push({ x: x, y: y, w: tw, h: th });
      }
    }
  }
  function overlap(x, y, w, h, placed) {
    var p = 4;
    for (var i = 0; i < placed.length; i++) {
      var b = placed[i];
      if (x + w + p > b.x && x - p < b.x + b.w && y + h + p > b.y && y - p < b.y + b.h) return true;
    }
    return false;
  }

  // ====== 年度成绩单 ======
  function renderYearly(yearlyStats) {
    if (!yearlyStats || !yearlyStats.length) return;
    var tbody = $('yearlyTableBody');
    tbody.innerHTML = '';
    yearlyStats.forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="' + (s.year === bestYear(yearlyStats) ? 'yt-highlight' : '') + '">' + s.year + '</td>' +
        '<td>' + s.count + '</td>' +
        '<td>' + E.formatNumber(s.likes) + '</td>' +
        '<td>' + E.formatNumber(s.comments) + '</td>' +
        '<td>' + E.formatNumber(s.favorites) + '</td>' +
        '<td>' + (s.count > 0 ? Math.round(s.likes / s.count) : 0) + '</td>';
      tbody.appendChild(tr);
    });

    var ctx = $('yearlyBarChart').getContext('2d');
    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: yearlyStats.map(function (s) { return String(s.year); }),
        datasets: [
          { label: '篇数', data: yearlyStats.map(function (s) { return s.count; }), backgroundColor: 'rgba(200,16,46,0.85)', borderColor: '#c8102e', borderWidth: 1, yAxisID: 'yCount' },
          { label: '获赞', data: yearlyStats.map(function (s) { return s.likes; }), backgroundColor: 'rgba(22,19,15,0.7)', borderColor: '#16130f', borderWidth: 1, yAxisID: 'yLikes' }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { color: '#6f6a5e', font: { family: 'Albert Sans, sans-serif', size: 12 }, boxWidth: 14, boxHeight: 8 } },
          title: { display: true, text: '每年篇数 vs 获赞', color: '#3a342c', font: { family: 'Albert Sans, sans-serif', size: 13 } },
          tooltip: { backgroundColor: '#16130f', titleFont: { family: 'Albert Sans, sans-serif' } }
        },
        scales: {
          yCount: { type: 'linear', position: 'left', beginAtZero: true, grid: { color: 'rgba(200,16,46,0.08)' }, ticks: { color: '#c8102e' }, title: { display: true, text: '篇数', color: '#c8102e', font: { family: 'Albert Sans, sans-serif', size: 11 } } },
          yLikes: { type: 'linear', position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: '#16130f', callback: function (v) { return E.formatNumber(v); } }, title: { display: true, text: '获赞', color: '#16130f', font: { family: 'Albert Sans, sans-serif', size: 11 } } },
          x: { grid: { display: false }, ticks: { color: '#6f6a5e' } }
        }
      }
    });
    chartInstances.push(chart);
  }
  function bestYear(yearly) {
    var by = yearly[0], i;
    for (i = 1; i < yearly.length; i++) if (yearly[i].count > by.count) by = yearly[i];
    return by.year;
  }

  // ====== 代表作 Top ======
  function renderTop(data) {
    renderTopItems(data.topLiked, 'likes');
    var tabs = document.querySelectorAll('.top-tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var type = t.dataset.tab;
        if (type === 'likes') renderTopItems(data.topLiked, 'likes');
        if (type === 'comments') renderTopItems(data.topCommented, 'comments');
        if (type === 'favorites') renderTopItems(data.topFavorited, 'favorites');
      });
    });
  }
  function renderTopItems(topItems, sortBy) {
    var list = $('topList');
    list.innerHTML = '';
    var count = Math.min(topItems.length, 5);
    for (var i = 0; i < count; i++) {
      var item = topItems[i];
      var rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
      var div = document.createElement('div');
      div.className = 'top-item';
      div.innerHTML =
        '<div class="top-rank ' + rankCls + '">' + (i + 1) + '</div>' +
        '<div class="top-item-body">' +
          '<div class="top-item-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="top-item-meta">' + (TYPE_LABEL[item.contentType] || item.contentType) + ' · ' + E.formatDate(item.createdAt) + '</div>' +
        '</div>' +
        '<div class="top-item-stats"><span>赞 ' + E.formatNumber(item.likeCount) + '</span><span>评 ' + E.formatNumber(item.commentCount) + '</span><span>藏 ' + E.formatNumber(item.favoriteCount) + '</span></div>' +
        (item.url ? '<a class="top-item-link iconify" data-icon="ph:arrow-up-right" href="' + item.url + '" target="_blank" rel="noopener"></a>' : '');
      div.addEventListener('click', function () { if (item.url) window.open(item.url, '_blank'); });
      list.appendChild(div);
    }
  }

  // ====== 发布时钟 ======
  function renderClock(items) {
    var hours = E.aggregateByHour(items);
    var weekdays = E.aggregateByWeekday(items);
    var dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    var c1 = new Chart($('hourRadarChart').getContext('2d'), {
      type: 'radar',
      data: {
        labels: ['0时', '2时', '4时', '6时', '8时', '10时', '12时', '14时', '16时', '18时', '20时', '22时'],
        datasets: [{
          label: '篇数',
          data: [hours[0], hours[2], hours[4], hours[6], hours[8], hours[10], hours[12], hours[14], hours[16], hours[18], hours[20], hours[22]],
          backgroundColor: 'rgba(200,16,46,0.18)',
          borderColor: '#c8102e',
          pointBackgroundColor: '#c8102e',
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, title: { display: true, text: '什么钟点发文', color: '#3a342c', font: { family: 'Albert Sans, sans-serif', size: 13 } } },
        scales: { r: { ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' }, pointLabels: { color: '#6f6a5e', font: { family: 'Albert Sans, sans-serif' } } } }
      }
    });
    chartInstances.push(c1);

    var c2 = new Chart($('weekdayChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{ label: '篇数', data: weekdays, backgroundColor: 'rgba(22,19,15,0.75)', borderColor: '#16130f', borderWidth: 1 }]
      },
      options: chartOptions('星期几发文', true)
    });
    chartInstances.push(c2);
  }

  // ====== 互动趋势 ======
  function renderTrend(items) {
    var sorted = items.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
    var labels = sorted.map(function (it) { return E.formatDate(it.createdAt); });
    var engagement = sorted.map(function (it) { return it.likeCount + it.commentCount * 2 + it.favoriteCount * 3; });
    var step = Math.max(1, Math.floor(labels.length / 18));
    var displayLabels = labels.map(function (l, i) { return i % step === 0 ? l : ''; });
    // 移动平均窗口：内容越多窗口越大（最少 5，最多 20）
    var winSize = Math.max(5, Math.min(20, Math.floor(sorted.length / 30)));
    var ma = E.movingAverage(engagement, winSize);

    // 把每点按时间长度用渐变色（早期=浅灰，新近=红）
    var total = engagement.length;
    var chart = new Chart($('trendChart').getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '单篇互动',
            data: engagement,
            borderColor: 'rgba(0,0,0,0)',
            backgroundColor: 'transparent',
            pointBackgroundColor: function (ctx) {
              var idx = ctx.dataIndex || 0;
              var t = total > 1 ? idx / (total - 1) : 0;
              // 早期浅灰到新近深红
              var r = Math.round(120 + t * 80);
              var g = Math.round(120 - t * 104);
              var b = Math.round(120 - t * 90);
              return 'rgb(' + r + ',' + g + ',' + b + ')';
            },
            pointBorderColor: 'transparent',
            pointRadius: 3.2,
            pointHoverRadius: 8,
            showLine: false,
            tension: 0
          },
          {
            label: '移动平均（近 ' + winSize + ' 篇）',
            data: ma,
            borderColor: '#c8102e',
            backgroundColor: 'rgba(200,16,46,0.06)',
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: 'origin',
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true, position: 'top', align: 'end',
            labels: { color: '#6f6a5e', font: { family: 'Albert Sans, sans-serif', size: 12 }, boxWidth: 14, boxHeight: 8 }
          },
          tooltip: {
            backgroundColor: '#16130f',
            titleFont: { family: 'Albert Sans, sans-serif' },
            bodyFont: { family: 'Albert Sans, sans-serif' },
            callbacks: {
              title: function (items) { return items[0].label; },
              label: function (item) {
                if (item.datasetIndex === 0) return '本篇互动 ' + E.formatNumber(item.raw);
                return '移动平均 ' + E.formatNumber(item.raw);
              }
            }
          }
        },
        scales: {
          y: {
            // 不强制从 0：爆款峰值可能上万，从 0 起会把移动平均线压扁贴底
            beginAtZero: false,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { color: '#6f6a5e', callback: function (v) { return E.formatNumber(v); } },
            title: { display: true, text: '互动评分（赞 + 2×评 + 3×藏）', color: '#3a342c', font: { family: 'Albert Sans, sans-serif', size: 11 } }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: '#6f6a5e',
              maxTicksLimit: 10,
              autoSkip: true,
              callback: function (val, idx) { return displayLabels[idx] || ''; }
            }
          }
        }
      }
    });
    chartInstances.push(chart);
  }

  // ====== 复制摘要 ======
  function bindCopy(items, stats) {
    $('copySummaryBtn').addEventListener('click', function () {
      var text = E.generateSummary(items, stats);
      var fb = $('copyFeedback');
      navigator.clipboard.writeText(text).then(function () {
        fb.textContent = '已进剪报柜';
        setTimeout(function () { fb.textContent = ''; }, 2000);
      }).catch(function () { fb.textContent = '复制失败，手动选一下'; });
    });
  }

  // ====== GSAP 滚动叙事 ======
  function initReveals() {
    // 头版
    gsap.from('#reportHead .kicker, #reportHead .headline, #reportHead .deck, #reportHead .byline', {
      opacity: 0, y: 26, duration: 0.9, ease: 'power3.out', stagger: 0.12
    });

    // 各版块逐块浮现
    var blocks = document.querySelectorAll('#report .article-block, #report .lede, #report .closing');
    blocks.forEach(function (b) {
      gsap.fromTo(b, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: b, start: 'top 88%', toggleActions: 'play none none none' }
      });
    });

    // 关键数字行间隔浮现
    gsap.from('.num-row', { opacity: 0, x: -24, duration: 0.7, ease: 'power3.out', stagger: 0.08 });

    // 书架：书脊一根根插上书架板
    gsap.from('#bsStand .book-spine', {
      opacity: 0, y: -48, duration: 0.7, ease: 'power3.out', stagger: 0.07,
      scrollTrigger: { trigger: '#bsStand', start: 'top 92%', toggleActions: 'play none none none' }
    });

    ScrollTrigger.refresh();
  }

  // ====== Chart 通用配置（编辑部风格） ======
  function chartOptions(title, showTicks) {
    return {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#6f6a5e', font: { family: 'Albert Sans, sans-serif', size: 12 } } },
        title: title ? { display: true, text: title, color: '#3a342c', font: { family: 'Albert Sans, sans-serif', size: 13 } } : undefined
      },
      scales: YX(showTicks)
    };
  }
  function YX(showTicks) {
    return {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: showTicks ? { color: '#6f6a5e' } : { display: false }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#6f6a5e', maxRotation: 45 }
      }
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ====== 词云过滤（前端可编辑的停用词表） ======
  var FILTER_STORAGE_KEY = 'zhihu-word-filter-v1';
  var FILTER_URL_PARAM = 'filter';

  // 加载顺序：URL 参数 > localStorage。URL 用于分享带过滤词的链接
  function loadWordFilter() {
    var fromUrl = filterFromUrl();
    if (fromUrl !== null) return fromUrl;
    try {
      var raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (w) { return typeof w === 'string' && w.length > 0; }) : [];
    } catch (e) {
      return [];
    }
  }

  // 从 ?filter=词1,词2 读取（中文已 URL 编码）
  function filterFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get(FILTER_URL_PARAM);
      if (!raw) return null;
      return raw.split(',').map(function (w) { return w.trim(); }).filter(function (w) { return w.length > 0; });
    } catch (e) {
      return null;
    }
  }

  function saveWordFilter(list) {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // localStorage 满了或禁用，忽略
    }
    // 同步到 URL 参数，方便分享带过滤词的链接
    try {
      var url = new URL(window.location.href);
      if (list.length) url.searchParams.set(FILTER_URL_PARAM, list.join(','));
      else url.searchParams.delete(FILTER_URL_PARAM);
      window.history.replaceState(null, '', url.toString());
    } catch (e) {
      // 不支持 history API 时忽略
    }
  }

  function applyWordFilter(wordCloudData) {
    if (!wordFilter || wordFilter.length === 0) return wordCloudData;
    var blocked = {};
    for (var i = 0; i < wordFilter.length; i++) {
      blocked[wordFilter[i]] = true;
    }
    return wordCloudData.filter(function (entry) {
      return !blocked[entry.word] && !blocked[entry.word.toLowerCase()];
    });
  }

  // 把用户粘贴的文本拆成词条（支持换行、逗号、空格、中英文逗号）
  function parseFilterText(text) {
    if (!text) return [];
    return text.split(/[\n\r,，\s;；]+/).map(function (w) { return w.trim(); }).filter(function (w) { return w.length > 0; });
  }

  function dedupeFilterList(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var w = (list[i] || '').trim();
      if (!w) continue;
      var key = w.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(w);
    }
    return out;
  }

  function initWordFilterUI() {
    var btn = $('cloudFilterBtn');
    var panel = $('cloudFilterPanel');
    var input = $('filterInput');
    var saveBtn = $('filterSaveBtn');
    var clearBtn = $('filterClearBtn');
    var seedBtn = $('filterSeedBtn');
    var status = $('filterStatus');
    var pill = $('filterCount');
    if (!btn) return;

    function refreshPill() {
      var n = wordFilter.length;
      if (n > 0) {
        pill.textContent = n;
        pill.hidden = false;
      } else {
        pill.hidden = true;
      }
    }

    refreshPill();
    if (wordFilter.length) {
      input.value = wordFilter.join('\n');
    }

    btn.addEventListener('click', function () {
      var open = !panel.hidden;
      panel.hidden = open;
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    saveBtn.addEventListener('click', function () {
      var list = dedupeFilterList(parseFilterText(input.value));
      wordFilter = list;
      saveWordFilter(list);
      refreshPill();
      status.textContent = '已存 ' + list.length + ' 个 · 词云已重画';
      if (rawData) renderWordCloud(rawData.wordCloud);
      if (window.gsap) gsap.fromTo(status, { opacity: 0.4 }, { opacity: 1, duration: 0.4 });
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      wordFilter = [];
      saveWordFilter([]);
      refreshPill();
      status.textContent = '已清空 · 词云已重画';
      if (rawData) renderWordCloud(rawData.wordCloud);
    });

    // "投喂默认噪声词"：把当前词云里长度 ≤ 2 的高频词（且不在白名单）一键加入
    seedBtn.addEventListener('click', function () {
      if (!rawData || !rawData.wordCloud) {
        status.textContent = '没有可用的词云数据';
        return;
      }
      // 不再误伤有意义的短词：1 字直接不放（绝大多数是助词），2 字按"明显噪声"特征筛
      // 噪声特征：纯数字 / 纯标点 / 全大写英文长度 ≤ 3 / 命中常见 URL 协议
      var NOISE_RE = /^[0-9]+$|^[\p{P}\p{S}]+$|^(https?|www|com|cn|net|org|io|github|html|php|jsp|asp)$/iu;
      var seedWords = [];
      rawData.wordCloud.forEach(function (entry) {
        if (entry.word.length === 1) return; // 一律不放
        if (entry.word.length === 2 && NOISE_RE.test(entry.word)) seedWords.push(entry.word);
      });
      // 拼到现有列表，去重
      var merged = dedupeFilterList(wordFilter.concat(seedWords));
      wordFilter = merged;
      saveWordFilter(merged);
      input.value = merged.join('\n');
      refreshPill();
      status.textContent = '投喂 ' + seedWords.length + ' 个 · 词云已重画';
      if (rawData) renderWordCloud(rawData.wordCloud);
    });
  }
})();