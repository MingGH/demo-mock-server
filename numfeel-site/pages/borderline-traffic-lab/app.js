/**
 * 擦边流量账本：719期视频的 IMS 打分实测 — 页面交互与图表渲染逻辑
 */
(function () {
  'use strict';

  var VIDEOS = window.VIDEOS_AUDIT_DATA || [];
  var E = window.BorderlineTrafficEngine;

  var R2_PUBLIC_DOMAIN = 'https://img.996.ninja';
  var R2_COVER_PREFIX = 'pan-piano-covers';

  /**
   * 获取封面 URL（全部 719 张封面已统一打薄码并上传至自建 R2 CDN，防止侵权并保证国内用户直连秒开）
   * @param {string} vid - YouTube 视频 ID
   * @returns {string} 封面完整 URL
   */
  function getCoverUrl(vid) {
    return R2_PUBLIC_DOMAIN + '/' + R2_COVER_PREFIX + '/' + vid + '.jpg';
  }

  function track(eventName, props) {
    if (window.NFTrack && typeof window.NFTrack.track === 'function') {
      window.NFTrack.track(eventName, props || {});
    }
  }

  function formatWan(num) {
    if (num === null || num === undefined || isNaN(num)) return '未公开';
    return (num / 10000).toFixed(1) + ' 万';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 初始化全量数据统计
  var allStats = E.computeSubsetStats(VIDEOS);
  var tiers = E.computeScoreTiers(VIDEOS);
  var verdicts = E.computeVerdictStats(VIDEOS);
  var phases = E.computeCareerPhases(VIDEOS);
  var baselineTier0 = tiers[0].stats;

  // 全局状态
  var state = {
    tunerMin: 0,
    tunerMax: 100,
    tunerSug: 'all',
    activeSongIdx: 0,
    activePhaseId: 'all',
    ledgerCat: 'all',
    ledgerVerdict: 'all',
    ledgerMember: 'all',
    ledgerSort: 'score-desc',
    ledgerQuery: '',
    ledgerMinSeq: 1,
    ledgerMaxSeq: VIDEOS.length,
    blurBlock: true,
    page: 1,
    pageSize: 20
  };

  // ── 0. 初始化 KPI、预设按钮期数与下拉框真实计数 ──
  function initStaticCountsAndKpis() {
    var tierRatio = tiers[0].stats.medianViews > 0
      ? (tiers[3].stats.medianViews / tiers[0].stats.medianViews).toFixed(1)
      : '2.4';
    document.getElementById('kpiTierHigh').textContent = formatWan(tiers[3].stats.medianViews);
    document.getElementById('kpiTierHighSub').textContent =
      '常服弹琴（0–19分）仅 ' + formatWan(tiers[0].stats.medianViews) + '（' + tierRatio + '×）';

    document.getElementById('kpiBlockPremium').textContent = '+' + ((verdicts.medianBoostRatio - 1) * 100).toFixed(1) + '%';
    document.getElementById('kpiBlockPremiumSub').textContent =
      'Block 中位 ' + formatWan(verdicts.Block.medianViews) + ' vs Pass 合规 ' + formatWan(verdicts.Pass.medianViews);

    var msData = E.getSubscriberMilestones();
    document.getElementById('kpiGrowthMult').textContent = msData.speedMultiplier.toFixed(1) + '×';
    document.getElementById('kpiGrowthMultSub').textContent = '前 215 期涨 40 万粉 vs 后 73 期涨 110 万粉';

    var showCat = E.computeCategoryBreakdown(VIDEOS).filter(function (c) { return c.id === 'show'; })[0];
    document.getElementById('kpiShowMemRate').textContent = (showCat.stats.memberRate * 100).toFixed(1) + '%';
    document.getElementById('kpiShowMemRateSub').textContent =
      '近 169 期整体会员专享占比达 ' + (phases[3].stats.memberRate * 100).toFixed(1) + '%';

    // 预设按钮期数动态回填（与整数滑块闭区间 100% 同源）
    document.getElementById('btnPresetAll').textContent = '全部视频 (' + allStats.totalCount + ')';
    document.getElementById('btnPresetTier0').textContent = tiers[0].shortLabel + '弹琴 (' + tiers[0].stats.totalCount + ')';
    document.getElementById('btnPresetTier1').textContent = tiers[1].shortLabel + '穿搭 (' + tiers[1].stats.totalCount + ')';
    document.getElementById('btnPresetTier2').textContent = tiers[2].shortLabel + '擦边 (' + tiers[2].stats.totalCount + ')';
    document.getElementById('btnPresetTier3').textContent = tiers[3].shortLabel + '擦边 (' + tiers[3].stats.totalCount + ')';
    document.getElementById('btnPresetPass').textContent = '仅 Pass 合规 (' + verdicts.Pass.totalCount + ')';
    document.getElementById('btnPresetBlock').textContent = '仅 Block 违规拦截 (' + verdicts.Block.totalCount + ')';

    // 下拉框真实计数
    var selVerdict = document.getElementById('selVerdict');
    selVerdict.options[0].textContent = '全部审核结论 (' + allStats.totalCount + ')';
    selVerdict.options[1].textContent = 'Block 违规拦截 (' + verdicts.Block.totalCount + ')';
    selVerdict.options[2].textContent = 'Review 人工复审 (' + verdicts.Review.totalCount + ')';
    selVerdict.options[3].textContent = 'Pass 合规放行 (' + verdicts.Pass.totalCount + ')';

    var selMember = document.getElementById('selMember');
    selMember.options[0].textContent = '全部公开状态 (' + allStats.totalCount + ')';
    selMember.options[1].textContent = '仅公开播放量 (' + allStats.publicCount + ')';
    selMember.options[2].textContent = '仅付费会员专享 (' + allStats.memberCount + ')';
  }

  // ── 1. 流量标价调音台 ──
  function updateTuner() {
    var subset = E.filterAndSortVideos(VIDEOS, {
      minScore: state.tunerMin,
      maxScore: state.tunerMax,
      sug: state.tunerSug
    });
    var st = E.computeSubsetStats(subset);

    document.getElementById('lblMinScore').textContent = state.tunerMin + ' 分';
    document.getElementById('lblMaxScore').textContent = state.tunerMax + ' 分';

    document.getElementById('tmCount').textContent = st.totalCount + ' 期';
    document.getElementById('tmPubSub').textContent = '公开 ' + st.publicCount + ' / 会员 ' + st.memberCount;

    document.getElementById('tmMedian').textContent = st.publicCount > 0 ? formatWan(st.medianViews) : '—';
    var medMult = (st.publicCount > 0 && baselineTier0.medianViews > 0)
      ? (st.medianViews / baselineTier0.medianViews).toFixed(2) + '× 常服基准'
      : '常服基准 29.0 万';
    document.getElementById('tmMedianDiff').textContent = medMult;

    document.getElementById('tmMean').textContent = st.publicCount > 0 ? formatWan(st.meanViews) : '—';
    var meanMult = (st.publicCount > 0 && baselineTier0.meanViews > 0)
      ? (st.meanViews / baselineTier0.meanViews).toFixed(2) + '× 常服基准'
      : '常服基准 58.7 万';
    document.getElementById('tmMeanDiff').textContent = meanMult;

    document.getElementById('tmHitRate').textContent = st.publicCount > 0 ? (st.hit100wRate * 100).toFixed(1) + '%' : '—';
    document.getElementById('tmHitDiff').textContent = '破百万 ' + st.hit100wCount + ' 期 / ' + st.publicCount;

    document.getElementById('tmBlockRate').textContent = st.totalCount > 0 ? (st.blockRate * 100).toFixed(1) + '%' : '—';
    document.getElementById('tmScoreAvg').textContent = '综合均分 ' + st.avgScore.toFixed(1) + ' 分';
  }

  function bindTunerEvents() {
    var rngMin = document.getElementById('rngMinScore');
    var rngMax = document.getElementById('rngMaxScore');
    var presetBtns = document.querySelectorAll('[data-preset]');

    function clearPresetActive() {
      presetBtns.forEach(function (b) { b.classList.remove('active'); });
    }

    rngMin.addEventListener('input', function () {
      var v = Number(rngMin.value);
      if (v > state.tunerMax) {
        state.tunerMax = v;
        rngMax.value = v;
      }
      state.tunerMin = v;
      state.tunerSug = 'all';
      clearPresetActive();
      updateTuner();
    });

    rngMax.addEventListener('input', function () {
      var v = Number(rngMax.value);
      if (v < state.tunerMin) {
        state.tunerMin = v;
        rngMin.value = v;
      }
      state.tunerMax = v;
      state.tunerSug = 'all';
      clearPresetActive();
      updateTuner();
    });

    presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearPresetActive();
        btn.classList.add('active');
        var p = btn.getAttribute('data-preset');
        state.tunerSug = 'all';
        if (p === 'all') { state.tunerMin = 0; state.tunerMax = 100; }
        else if (p === 'tier0') { state.tunerMin = 0; state.tunerMax = 19; }
        else if (p === 'tier1') { state.tunerMin = 20; state.tunerMax = 49; }
        else if (p === 'tier2') { state.tunerMin = 50; state.tunerMax = 79; }
        else if (p === 'tier3') { state.tunerMin = 80; state.tunerMax = 100; }
        else if (p === 'pass') { state.tunerMin = 0; state.tunerMax = 100; state.tunerSug = 'Pass'; }
        else if (p === 'block') { state.tunerMin = 0; state.tunerMax = 100; state.tunerSug = 'Block'; }

        rngMin.value = state.tunerMin;
        rngMax.value = state.tunerMax;
        updateTuner();
        track('select_preset', { preset: p });
      });
    });
  }

  // ── 2. 同曲同人对照实验台 ──
  var songControls = E.getSameSongControls(VIDEOS);

  function renderSongControl() {
    var tabsEl = document.getElementById('songTabs');
    tabsEl.innerHTML = songControls.map(function (g, idx) {
      var activeCls = idx === state.activeSongIdx ? ' active' : '';
      return '<button class="song-tab' + activeCls + '" data-song-idx="' + idx + '">' +
        '<div class="st-title">' + escapeHtml(g.song) + '</div>' +
        '<span class="st-mult"><i class="ti ti-flame"></i> ' + escapeHtml(g.tabBadge) + '</span>' +
      '</button>';
    }).join('');

    tabsEl.querySelectorAll('.song-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeSongIdx = Number(btn.getAttribute('data-song-idx'));
        renderSongControl();
        track('switch_song_control', { song: songControls[state.activeSongIdx].id });
      });
    });

    var cur = songControls[state.activeSongIdx];
    var items = [
      { rec: cur.early, note: cur.earlyNote, tag: cur.earlyTag, isHighlight: false },
      { rec: cur.late, note: cur.lateNote, tag: cur.lateTag, isHighlight: true },
      { rec: cur.extra, note: cur.extraNote, tag: cur.extraTag, isHighlight: false }
    ].filter(function (x) { return x.rec !== null; });

    var stageEl = document.getElementById('abStage');
    stageEl.innerHTML = items.map(function (item) {
      var r = item.rec;
      var hlCls = item.isHighlight ? ' highlight' : '';
      return '<div class="ab-card' + hlCls + '">' +
        '<a class="ab-thumb" href="https://www.youtube.com/watch?v=' + r.id + '" target="_blank" rel="noopener">' +
          '<img src="' + getCoverUrl(r.id) + '" alt="' + escapeHtml(r.t) + '" loading="lazy" onerror="this.style.opacity=0.15">' +
          '<span class="ab-badge-top">' + escapeHtml(item.tag) + '</span>' +
          '<span class="ab-badge-verdict verdict-pill verdict-' + r.sug + '">' + r.sug + '</span>' +
        '</a>' +
        '<div class="ab-body">' +
          '<div class="ab-note">' + escapeHtml(item.note) + '</div>' +
          '<div class="ab-meta">发布于 ' + escapeHtml(r.p) + ' · 时长 ' + escapeHtml(r.d) + ' · 综合分 <strong>' + r.score.toFixed(1) + '</strong></div>' +
          '<div class="score-bars">' +
            '<div class="s-bar-row">' +
              '<span class="s-bar-lbl">IMS Sexy</span>' +
              '<div class="s-bar-track"><div class="s-bar-fill" style="width:' + r.sexy + '%;background:#ffb74d;"></div></div>' +
              '<span class="s-bar-val" style="color:#ffb74d;">' + r.sexy + '</span>' +
            '</div>' +
            '<div class="s-bar-row">' +
              '<span class="s-bar-lbl">IMS Porn</span>' +
              '<div class="s-bar-track"><div class="s-bar-fill" style="width:' + r.porn + '%;background:#ff6b6b;"></div></div>' +
              '<span class="s-bar-val" style="color:#ff6b6b;">' + r.porn + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="ab-views-box">' +
            '<span style="font-size:0.8rem;color:#94a3b8;">YouTube 播放量</span>' +
            '<span class="ab-views-num"><i class="ti ti-player-play"></i> ' + escapeHtml(r.vd) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    document.getElementById('songInsight').innerHTML =
      '<strong>同曲对照结论：</strong>' + escapeHtml(cur.summary);
  }

  // ── 3. 第 215 期转型拐点与四阶段演化 ──
  function renderTurningPoint() {
    var msData = E.getSubscriberMilestones();
    var msEl = document.getElementById('milestoneList');
    var barColors = ['#81c784', '#ffb74d', '#ff6b6b', '#ff6b6b'];

    msEl.innerHTML = msData.milestones.map(function (m, idx) {
      var widthPct = Math.max(8, Math.round((m.videosUsed / 215) * 100));
      return '<div class="ms-row">' +
        '<div class="ms-stage">' + escapeHtml(m.stage) + '<span>' + escapeHtml(m.mode) + '（第 ' + m.startSeq + '→' + m.endSeq + ' 期）</span></div>' +
        '<div class="ms-bar-wrap">' +
          '<div class="ms-bar" style="width:' + widthPct + '%;background:' + barColors[idx] + ';">耗时 ' + m.videosUsed + ' 期视频</div>' +
        '</div>' +
        '<div class="ms-meta">单期平均涨粉 <strong style="color:#ffd700;">' + m.gainPerVideoWan.toFixed(2) + ' 万</strong></div>' +
      '</div>';
    }).join('');

    var pGrid = document.getElementById('phaseGrid');
    pGrid.innerHTML = phases.map(function (p) {
      var st = p.stats;
      var activeCls = state.activePhaseId === p.id ? ' active' : '';
      return '<div class="phase-card' + activeCls + '" data-phase-id="' + p.id + '" data-min-seq="' + p.minSeq + '" data-max-seq="' + p.maxSeq + '">' +
        '<div class="ph-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="ph-range">' + escapeHtml(p.rangeLabel) + '</div>' +
        '<div class="phase-stat-row"><span>IMS Sexy 均分</span><span style="color:#ffb74d;">' + st.avgSexy.toFixed(1) + ' 分</span></div>' +
        '<div class="phase-stat-row"><span>IMS Porn 均分</span><span style="color:#ff6b6b;">' + st.avgPorn.toFixed(1) + ' 分</span></div>' +
        '<div class="phase-stat-row"><span>Porn(色情)标签率</span><span style="color:#ff6b6b;">' + (st.pornLabelRate * 100).toFixed(1) + '%</span></div>' +
        '<div class="phase-stat-row"><span>公开视频中位播放</span><span style="color:#ffd700;">' + formatWan(st.medianViews) + '</span></div>' +
        '<div class="phase-stat-row"><span>付费会员视频占比</span><span style="color:#ce93d8;">' + (st.memberRate * 100).toFixed(1) + '%</span></div>' +
      '</div>';
    }).join('');

    pGrid.querySelectorAll('.phase-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var pid = card.getAttribute('data-phase-id');
        if (state.activePhaseId === pid) {
          state.activePhaseId = 'all';
          state.ledgerMinSeq = 1;
          state.ledgerMaxSeq = VIDEOS.length;
        } else {
          state.activePhaseId = pid;
          state.ledgerMinSeq = Number(card.getAttribute('data-min-seq'));
          state.ledgerMaxSeq = Number(card.getAttribute('data-max-seq'));
        }
        state.page = 1;
        renderTurningPoint();
        renderLedger();
        track('filter_phase', { phase: state.activePhaseId });
      });
    });
  }

  // ── 4. 品类拆分与 719 期全量检索账本 ──
  function renderCategoryCards() {
    var cats = E.computeCategoryBreakdown(VIDEOS);
    var catGrid = document.getElementById('catGrid');
    catGrid.innerHTML = cats.map(function (c) {
      var st = c.stats;
      var activeCls = state.ledgerCat === c.id ? ' active' : '';
      return '<div class="cat-card' + activeCls + '" data-cat-id="' + c.id + '">' +
        '<div class="cc-title">' + escapeHtml(c.name) + ' · ' + st.totalCount + ' 期</div>' +
        '<div class="cc-desc">' + escapeHtml(c.desc) + '</div>' +
        '<div class="cc-stats">' +
          '<span>综合均分 <strong>' + st.avgScore.toFixed(1) + '</strong></span>' +
          '<span style="color:#ce93d8;">锁会员 ' + (st.memberRate * 100).toFixed(1) + '%</span>' +
        '</div>' +
      '</div>';
    }).join('');

    catGrid.querySelectorAll('.cat-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var cid = card.getAttribute('data-cat-id');
        state.ledgerCat = state.ledgerCat === cid ? 'all' : cid;
        state.page = 1;
        renderCategoryCards();
        renderLedger();
        track('filter_category', { cat: state.ledgerCat });
      });
    });
  }

  function renderLedger() {
    var list = E.filterAndSortVideos(VIDEOS, {
      sug: state.ledgerVerdict,
      cat: state.ledgerCat,
      memberMode: state.ledgerMember,
      minSeq: state.ledgerMinSeq,
      maxSeq: state.ledgerMaxSeq,
      query: state.ledgerQuery,
      sortBy: state.ledgerSort
    });

    var total = list.length;
    var totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;

    var startIdx = (state.page - 1) * state.pageSize;
    var pageItems = list.slice(startIdx, startIdx + state.pageSize);

    var gridEl = document.getElementById('videoGrid');
    if (pageItems.length === 0) {
      gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">没有符合当前筛选条件的视频，请尝试放宽筛选条件。</div>';
    } else {
      gridEl.innerHTML = pageItems.map(function (v) {
        var scoreCls = v.score >= 80 ? 'score-high' : (v.score >= 50 ? 'score-mid' : 'score-low');
        var shouldBlur = state.blurBlock && v.sug === 'Block';
        var blurCls = shouldBlur ? ' blurred' : '';
        var memBadge = v.m === 1 ? '<span class="v-mem">会员专享</span>' : '';
        var viewsCls = v.m === 1 ? 'v-views is-mem' : 'v-views';
        var viewsText = v.m === 1 ? '会员专享' : ('播放 ' + v.vd);

        return '<div class="v-card">' +
          '<a class="v-thumb' + blurCls + '" href="https://www.youtube.com/watch?v=' + v.id + '" target="_blank" rel="noopener">' +
            '<img src="' + getCoverUrl(v.id) + '" alt="' + escapeHtml(v.t) + '" loading="lazy" onerror="this.style.opacity=0.15">' +
            '<span class="v-seq">第 ' + v.seq + ' 期</span>' +
            '<span class="v-verdict verdict-pill verdict-' + v.sug + '">' + v.sug + '</span>' +
            memBadge +
            '<span class="v-dur">' + escapeHtml(v.d) + '</span>' +
          '</a>' +
          '<div class="v-body">' +
            '<a class="v-title" href="https://www.youtube.com/watch?v=' + v.id + '" target="_blank" rel="noopener" title="' + escapeHtml(v.t) + '">' + escapeHtml(v.t) + '</a>' +
            '<div class="v-scores">' +
              '<span class="v-chip ' + scoreCls + '">综合 ' + v.score.toFixed(1) + '</span>' +
              '<span class="v-chip">Sexy ' + v.sexy + '</span>' +
              '<span class="v-chip">Porn ' + v.porn + '</span>' +
              (v.nn > 0 ? '<span class="v-chip">NudeNet ' + v.nn.toFixed(0) + '</span>' : '') +
            '</div>' +
            '<div class="v-foot">' +
              '<span class="' + viewsCls + '">' + escapeHtml(viewsText) + '</span>' +
              '<span>' + escapeHtml(v.p) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    var endNum = Math.min(total, startIdx + pageItems.length);
    var rangeNote = (state.ledgerMinSeq > 1 || state.ledgerMaxSeq < VIDEOS.length)
      ? '（已筛选第 ' + state.ledgerMinSeq + '–' + state.ledgerMaxSeq + ' 期）'
      : '';
    document.getElementById('pageInfo').textContent =
      '显示 ' + (total > 0 ? (startIdx + 1) : 0) + '–' + endNum + ' / 共 ' + total + ' 期' + rangeNote + '（第 ' + state.page + '/' + totalPages + ' 页）';

    document.getElementById('btnPrevPage').disabled = state.page <= 1;
    document.getElementById('btnNextPage').disabled = state.page >= totalPages;
  }

  function bindLedgerEvents() {
    document.getElementById('inpSearch').addEventListener('input', function (e) {
      state.ledgerQuery = e.target.value;
      state.page = 1;
      renderLedger();
    });
    document.getElementById('selVerdict').addEventListener('change', function (e) {
      state.ledgerVerdict = e.target.value;
      state.page = 1;
      renderLedger();
    });
    document.getElementById('selMember').addEventListener('change', function (e) {
      state.ledgerMember = e.target.value;
      state.page = 1;
      renderLedger();
    });
    document.getElementById('selSort').addEventListener('change', function (e) {
      state.ledgerSort = e.target.value;
      state.page = 1;
      renderLedger();
    });
    document.getElementById('chkBlur').addEventListener('change', function (e) {
      state.blurBlock = e.target.checked;
      renderLedger();
    });
    document.getElementById('btnPrevPage').addEventListener('click', function () {
      if (state.page > 1) { state.page--; renderLedger(); }
    });
    document.getElementById('btnNextPage').addEventListener('click', function () {
      state.page++;
      renderLedger();
    });
  }

  // ── 5. Chart.js 四张核心图表渲染（全部双轴对齐，无单位混用） ──
  function initCharts() {
    // Chart 1: 四档综合擦边分 vs 播放量阶梯（左轴万，右轴破百万率%）
    var ctxTier = document.getElementById('tierChart').getContext('2d');
    new window.Chart(ctxTier, {
      type: 'bar',
      data: {
        labels: tiers.map(function (t) { return t.shortLabel; }),
        datasets: [
          {
            label: '播放量中位数（万）',
            data: tiers.map(function (t) { return +(t.stats.medianViews / 10000).toFixed(1); }),
            backgroundColor: ['rgba(129,199,132,0.75)', 'rgba(144,202,249,0.75)', 'rgba(255,183,77,0.75)', 'rgba(255,107,107,0.82)'],
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: '平均播放量（万）',
            data: tiers.map(function (t) { return +(t.stats.meanViews / 10000).toFixed(1); }),
            backgroundColor: 'rgba(255, 215, 0, 0.32)',
            borderColor: '#ffd700',
            borderWidth: 1.5,
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: '破百万播放比例（%）',
            data: tiers.map(function (t) { return +(t.stats.hit100wRate * 100).toFixed(1); }),
            borderColor: '#81c784',
            backgroundColor: 'rgba(129,199,132,0.2)',
            borderWidth: 2,
            type: 'line',
            tension: 0.25,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: {
            position: 'left',
            ticks: { color: '#ffd700', callback: function (v) { return v + '万'; } },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y1: {
            position: 'right',
            min: 0,
            max: 50,
            ticks: { color: '#81c784', callback: function (v) { return v + '%'; } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    // Chart 2: Pass / Review / Block 流量对比（双轴：左轴万，右轴破百万率%）
    var ctxVerdict = document.getElementById('verdictChart').getContext('2d');
    var vList = [verdicts.Pass, verdicts.Review, verdicts.Block];
    new window.Chart(ctxVerdict, {
      type: 'bar',
      data: {
        labels: [
          'Pass 合规 (' + verdicts.Pass.totalCount + '期)',
          'Review 复审 (' + verdicts.Review.totalCount + '期)',
          'Block 拦截 (' + verdicts.Block.totalCount + '期)'
        ],
        datasets: [
          {
            label: '公开视频中位播放（万）',
            data: vList.map(function (x) { return +(x.medianViews / 10000).toFixed(1); }),
            backgroundColor: ['rgba(129,199,132,0.8)', 'rgba(255,183,77,0.8)', 'rgba(255,107,107,0.85)'],
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: '破百万播放比例（%）',
            data: vList.map(function (x) { return +(x.hit100wRate * 100).toFixed(1); }),
            borderColor: '#90caf9',
            backgroundColor: 'rgba(144,202,249,0.25)',
            borderWidth: 2.5,
            type: 'line',
            tension: 0.2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: {
            position: 'left',
            ticks: { color: '#ffd700', callback: function (v) { return v + '万'; } },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y1: {
            position: 'right',
            min: 0,
            max: 50,
            ticks: { color: '#90caf9', callback: function (v) { return v + '%'; } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    // Chart 3: 四阶段双轴（Porn 均分与会员占比上升 vs 中位播放回落）
    var ctxPhase = document.getElementById('phaseChart').getContext('2d');
    new window.Chart(ctxPhase, {
      type: 'bar',
      data: {
        labels: phases.map(function (p) { return p.chartLabel; }),
        datasets: [
          {
            type: 'line',
            label: 'IMS Porn（色情分）均值',
            data: phases.map(function (p) { return +p.stats.avgPorn.toFixed(1); }),
            borderColor: '#ff6b6b',
            backgroundColor: '#ff6b6b',
            borderWidth: 3,
            tension: 0.25,
            yAxisID: 'y1'
          },
          {
            type: 'line',
            label: '付费会员视频占比（%）',
            data: phases.map(function (p) { return +(p.stats.memberRate * 100).toFixed(1); }),
            borderColor: '#ce93d8',
            backgroundColor: '#ce93d8',
            borderDash: [5, 4],
            borderWidth: 2.5,
            tension: 0.25,
            yAxisID: 'y1'
          },
          {
            type: 'bar',
            label: '公开视频中位播放（万）',
            data: phases.map(function (p) { return +(p.stats.medianViews / 10000).toFixed(1); }),
            backgroundColor: 'rgba(255, 215, 0, 0.55)',
            borderRadius: 6,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#cbd5e1', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: {
            position: 'left',
            ticks: { color: '#ffd700', callback: function (v) { return v + '万'; } },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y1: {
            position: 'right',
            min: 0,
            max: 100,
            ticks: { color: '#ff6b6b', callback: function (v) { return v + ' 分/%'; } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    // Chart 4: 按每 30 期分箱的时间序列趋势
    var windowBins = [];
    var step = 30;
    for (var i = 0; i < VIDEOS.length; i += step) {
      var chunk = VIDEOS.slice(i, i + step);
      var st = E.computeSubsetStats(chunk);
      windowBins.push({
        label: '#' + chunk[0].seq + '~' + chunk[chunk.length - 1].seq,
        medViewsWan: +(st.medianViews / 10000).toFixed(1),
        avgScore: +st.avgScore.toFixed(1)
      });
    }
    var ctxTime = document.getElementById('timelineChart').getContext('2d');
    new window.Chart(ctxTime, {
      type: 'line',
      data: {
        labels: windowBins.map(function (b) { return b.label; }),
        datasets: [
          {
            label: '分箱中位播放（万）',
            data: windowBins.map(function (b) { return b.medViewsWan; }),
            borderColor: '#ffd700',
            backgroundColor: 'rgba(255,215,0,0.12)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            yAxisID: 'y'
          },
          {
            label: '分箱综合擦边分均值',
            data: windowBins.map(function (b) { return b.avgScore; }),
            borderColor: '#ff6b6b',
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', autoSkip: true, maxTicksLimit: 8, maxRotation: 0, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: {
            position: 'left',
            ticks: { color: '#ffd700', callback: function (v) { return v + '万'; } },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y1: {
            position: 'right',
            min: 0,
            max: 100,
            ticks: { color: '#ff6b6b', callback: function (v) { return v + '分'; } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  // ── 6. 复制报告与下载 CSV ──
  function buildReportText() {
    var tierRatio = tiers[0].stats.medianViews > 0 ? (tiers[3].stats.medianViews / tiers[0].stats.medianViews).toFixed(1) : '2.4';
    var songC = songControls[0];
    var songT = songControls[1];
    var msData = E.getSubscriberMilestones();
    var showCat = E.computeCategoryBreakdown(VIDEOS).filter(function (c) { return c.id === 'show'; })[0];

    return [
      '【擦边流量账本：Pan Piano ' + VIDEOS.length + ' 期视频 IMS 实测摘要】',
      '1. 阶梯溢价：0-19分（常服弹琴）中位播放 ' + formatWan(tiers[0].stats.medianViews) + ' → 80-100分（重度擦边）中位播放 ' + formatWan(tiers[3].stats.medianViews) + '（' + tierRatio + '倍），破百万比例从 ' + (tiers[0].stats.hit100wRate * 100).toFixed(1) + '% 升至 ' + (tiers[3].stats.hit100wRate * 100).toFixed(1) + '%。',
      '2. 审核对比：IMS 判定违规拦截（Block，全量 ' + verdicts.Block.totalCount + ' 期 / 公开 ' + verdicts.Block.publicCount + ' 期）中位播放达 ' + formatWan(verdicts.Block.medianViews) + '，比合规放行（Pass，全量 ' + verdicts.Pass.totalCount + ' 期 / 公开 ' + verdicts.Pass.publicCount + ' 期，' + formatWan(verdicts.Pass.medianViews) + '）高出 ' + ((verdicts.medianBoostRatio - 1) * 100).toFixed(1) + '%。',
      '3. 同曲对照：《红莲华》常服版 ' + songC.early.vd + ' → 低领重录版 ' + songC.late.vd + '（' + songC.multiplier + '倍），第三次继续拉高尺度至 93.4 分后回落至 ' + songC.extra.vd + '；《トリカゴ》常服版 ' + songT.early.vd + ' → 敞怀风衣版 ' + songT.late.vd + '（' + songT.multiplier + '倍），第三次高叉泳装版回落至 ' + songT.extra.vd + '。',
      '4. 转型拐点：前 ' + msData.beforeVideos + ' 期常服弹琴耗时三年半攒下 ' + msData.beforeGainWan + ' 万粉；第 215 期后将 IMS Sexy 均分拉到 ' + phases[1].stats.avgSexy.toFixed(1) + ' 分，仅用 ' + msData.afterVideos + ' 期视频就狂涨 ' + msData.afterGainWan + ' 万粉（单期涨粉效率 ' + msData.speedMultiplier.toFixed(1) + '×）。',
      '5. 审美疲劳与付费转化：近 ' + phases[3].stats.totalCount + ' 期 IMS Porn 均分升至 ' + phases[3].stats.avgPorn.toFixed(1) + ' 分（命中色情标签率 ' + (phases[3].stats.pornLabelRate * 100).toFixed(1) + '%），公开视频中位播放回落至 ' + formatWan(phases[3].stats.medianViews) + '，付费会员专享占比升至 ' + (phases[3].stats.memberRate * 100).toFixed(1) + '%（纯身体展示类达 ' + (showCat.stats.memberRate * 100).toFixed(1) + '%）。'
    ].join('\n');
  }

  function bindTopActions() {
    var btnCopy = document.getElementById('btnCopyReport');
    btnCopy.addEventListener('click', function () {
      var text = buildReportText();
      var done = function () {
        btnCopy.innerHTML = '<i class="ti ti-check"></i> 已复制到剪贴板';
        setTimeout(function () {
          btnCopy.innerHTML = '<i class="ti ti-copy"></i> 复制实验结论摘要';
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          btnCopy.innerHTML = '<i class="ti ti-alert-circle"></i> 复制失败，请手动选摘要';
          setTimeout(function () {
            btnCopy.innerHTML = '<i class="ti ti-copy"></i> 复制实验结论摘要';
          }, 2500);
        });
      } else {
        btnCopy.innerHTML = '<i class="ti ti-alert-circle"></i> 浏览器不支持剪贴板';
      }
      track('copy_report');
    });

    var btnDl = document.getElementById('btnDownloadCsv');
    btnDl.addEventListener('click', function () {
      var csv = '\uFEFF' + E.toCsvString(VIDEOS);
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'pan_piano_' + VIDEOS.length + '_tencent_audit.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      track('download_csv');
    });
  }

  // ── 启动入口 ──
  function boot() {
    if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
      window.NFTrack.trackOnce('session_start', { totalVideos: VIDEOS.length });
    }
    initStaticCountsAndKpis();
    bindTopActions();
    bindTunerEvents();
    updateTuner();
    renderSongControl();
    renderTurningPoint();
    renderCategoryCards();
    bindLedgerEvents();
    renderLedger();

    function showChartFallback() {
      document.querySelectorAll('.chart-wrap').forEach(function (el) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:0.85rem;">图表库加载失败，请刷新页面重试</div>';
      });
    }

    if (typeof window.loadChartJS === 'function') {
      window.loadChartJS().then(initCharts).catch(showChartFallback);
    } else if (window.Chart) {
      initCharts();
    } else {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = initCharts;
      s.onerror = showChartFallback;
      document.head.appendChild(s);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
