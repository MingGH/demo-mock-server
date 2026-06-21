(function() {
  // 排行榜数据统一请求生产后端（生产 CORS 已放开，本地预览也可直连）
  var API_BASE = 'https://numfeel-api.996.ninja';
  var DEMOS_URL = '../../data/demos.json';
  var PREFIX = '../../'; // 榜单页在 pages/leaderboard/ 下，回到站点根

  var RANGE_HINTS = {
    last7Days: '最近一周涨势最猛的实验，新上线的 demo 最容易在这里冒头。',
    last30Days: '最近 30 天的综合人气，兼顾热度与稳定性。',
    allTime: '从开站至今的累计浏览量，是经过时间检验的常青实验。'
  };

  var state = {
    data: null,      // 后端返回的 {last7Days, last30Days, allTime, updatedAt}
    demoIndex: {},   // path → demo 元信息
    range: 'last7Days'
  };

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    bindTabs();
    Promise.all([loadDemos(), loadLeaderboard()])
      .then(function(results) {
        state.demoIndex = window.LeaderboardLogic.buildDemoIndex(results[0]);
        state.data = results[1];
        render();
      })
      .catch(function() {
        showError();
      });
  }

  function loadDemos() {
    return fetch(DEMOS_URL).then(function(r) { return r.json(); });
  }

  function loadLeaderboard() {
    return fetch(API_BASE + '/leaderboard')
      .then(function(r) { return r.json(); })
      .then(function(body) {
        if (body && body.status === 200 && body.data) return body.data;
        throw new Error('bad response');
      });
  }

  function bindTabs() {
    var tabs = document.getElementById('rangeTabs');
    if (!tabs) return;
    tabs.addEventListener('click', function(e) {
      var btn = e.target.closest ? e.target.closest('.range-tab') : null;
      if (!btn) return;
      var range = btn.getAttribute('data-range');
      if (!range || range === state.range) return;
      state.range = range;
      Array.prototype.forEach.call(tabs.querySelectorAll('.range-tab'), function(t) {
        t.classList.toggle('active', t === btn);
      });
      render();
    });
  }

  function render() {
    var hint = document.getElementById('rangeHint');
    if (hint) hint.textContent = RANGE_HINTS[state.range] || '';

    var board = document.getElementById('board');
    if (!board || !state.data) return;

    var entries = state.data[state.range] || [];
    var list = window.LeaderboardLogic.enrichLeaderboard(entries, state.demoIndex);

    if (list.length === 0) {
      board.innerHTML = '<div class="board-empty">' +
        '<i class="ti ti-mood-empty"></i> 暂时还没有足够的数据，过一会儿再来看看。</div>';
      updateTimestamp();
      return;
    }

    board.innerHTML = list.map(renderRow).join('');
    updateTimestamp();
  }

  function renderRow(item) {
    var medal = item.rank <= 3 ? ' rank-top rank-' + item.rank : '';
    return '\
      <a class="board-row" href="' + PREFIX + item.href + '">\
        <span class="board-rank' + medal + '">' + item.rank + '</span>\
        <span class="board-icon"><i class="ti ' + escapeAttr(item.icon) + '"></i></span>\
        <span class="board-body">\
          <span class="board-title">' + escapeHtml(item.title) + '</span>\
          <span class="board-cat">' + escapeHtml(item.catName) + '</span>\
        </span>\
        <span class="board-views">' + window.LeaderboardLogic.formatViews(item.views) + '\
          <small>次访问</small>\
        </span>\
        <i class="ti ti-chevron-right board-arrow"></i>\
      </a>';
  }

  function updateTimestamp() {
    var el = document.getElementById('boardUpdated');
    if (!el) return;
    if (state.data && state.data.updatedAt) {
      var d = new Date(state.data.updatedAt);
      el.textContent = '数据更新于 ' + formatTime(d) + '（每小时刷新一次）';
    } else {
      el.textContent = '';
    }
  }

  function formatTime(d) {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function showError() {
    var board = document.getElementById('board');
    if (board) {
      board.innerHTML = '<div class="board-empty">' +
        '<i class="ti ti-cloud-off"></i> 排行榜暂时加载失败，请稍后刷新重试。</div>';
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, '');
  }
})();
