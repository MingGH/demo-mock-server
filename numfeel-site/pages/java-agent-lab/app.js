/**
 * java-agent-lab 交互逻辑：轮询 agent 事件流、渲染线程泳道时间轴与事件明细。
 * DOM 无关的计算都在 engine.js，本文件只做绑定与渲染。
 */
(function () {
  'use strict';

  // 生产后端基址；本地联调可用 ?api=http://localhost:18080 覆盖
  var qs = new URLSearchParams(location.search);
  var API_BASE = qs.get('api') || 'https://numfeel-api.996.ninja';

  var PAGE = 500;            // agent 单页事件上限
  var MAX_TABLE_ROWS = 200;  // 明细表最多渲染条数
  var POLL_MS = 2000;        // 增量轮询间隔
  var STATS_MS = 15000;      // 统计刷新间隔
  var WINDOW_MS = 60000;     // 时间轴窗口

  var cursor = 0;
  var events = [];
  var paused = false;
  var polling = false;

  var el = {
    types: document.getElementById('mTypes'),
    collected: document.getElementById('mCollected'),
    filtered: document.getElementById('mFiltered'),
    dropped: document.getElementById('mDropped'),
    btnCall: document.getElementById('btnCall'),
    btnPause: document.getElementById('btnPause'),
    btnClear: document.getElementById('btnClear'),
    hint: document.getElementById('hint'),
    laneWrap: document.getElementById('laneWrap'),
    laneEmpty: document.getElementById('laneEmpty'),
    rows: document.getElementById('eventRows'),
    errorBox: document.getElementById('errorBox')
  };

  /**
   * 安全上报埋点（NFTrack 由 header.js 全局注入，未加载时静默跳过）。
   *
   * @param {string} event 事件名
   * @param {Object} props 附加属性（仅 number/boolean/短字符串）
   */
  function track(event, props) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(event, props || {});
      }
    } catch (e) { /* 埋点失败不影响页面 */ }
  }

  /**
   * 展示错误提示框。
   *
   * @param {string} msg 文案
   */
  function showError(msg) {
    el.errorBox.textContent = msg;
    el.errorBox.style.display = msg ? 'block' : 'none';
  }

  /**
   * 拉取一次统计并渲染。
   */
  function refreshStats() {
    fetch(API_BASE + '/agent/stats')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json || json.status !== 200 || !json.data) return;
        el.types.textContent = json.data.instrumentedTypes;
        el.collected.textContent = formatCount(json.data.collected);
        el.filtered.textContent = formatCount(json.data.filtered);
        el.dropped.textContent = formatCount(json.data.dropped);
      })
      .catch(function () { showError('拿不到 agent 统计：后端可能没挂 -javaagent 启动。'); });
  }

  /**
   * 大数缩写：9867902 → 9.87M。
   *
   * @param {number} n 数字
   * @returns {string} 缩写文本
   */
  function formatCount(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  /**
   * 增量拉取事件（自动最多追 3 页，防止首屏追赶过慢）。
   *
   * @returns {Promise<void>} 拉取完成
   */
  function pullEvents() {
    var pages = 0;
    function step() {
      return fetch(API_BASE + '/agent/events?afterSeq=' + cursor)
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (!json || json.status !== 200 || !json.data) return;
          if (json.data.events && json.data.events.length) {
            events = events.concat(json.data.events);
            if (events.length > 4000) events = events.slice(-4000);
          }
          cursor = json.data.cursor || cursor;
          render();
          pages++;
          if (json.data.events && json.data.events.length >= PAGE && pages < 3) return step();
        });
    }
    return step().catch(function () { /* 网络抖动静默，下轮再试 */ });
  }

  /**
   * 渲染时间轴与明细表。
   */
  function render() {
    renderLanes();
    renderTable();
  }

  /**
   * 渲染线程泳道。
   */
  function renderLanes() {
    var layout = window.AgentLab.timelineLayout(events, Date.now(), WINDOW_MS);
    if (!layout.count) {
      if (!el.laneEmpty.parentNode) {
        var hint = document.createElement('div');
        hint.className = 'empty-hint';
        hint.id = 'laneEmpty';
        hint.textContent = '时间轴还没有数据——agent 刚记下的调用会自动出现在这里。';
        el.laneWrap.appendChild(hint);
      }
      return;
    }
    if (el.laneEmpty.parentNode) el.laneEmpty.parentNode.removeChild(el.laneEmpty);

    var frag = document.createDocumentFragment();
    layout.lanes.forEach(function (lane) {
      var row = document.createElement('div');
      row.className = 'lane';
      var name = document.createElement('div');
      name.className = 'lane-name';
      name.textContent = lane.thread;
      var trackDiv = document.createElement('div');
      trackDiv.className = 'track';
      var color = window.AgentLab.pickLaneColor(lane.thread);
      lane.spans.forEach(function (s) {
        var bar = document.createElement('div');
        bar.className = 'span' + (s.event.error ? ' err' : '');
        bar.style.left = s.left + '%';
        bar.style.width = s.width + '%';
        bar.style.background = color;
        bar.title = window.AgentLab.methodLabel(s.event.type, s.event.method)
          + ' · ' + window.AgentLab.formatDuration(s.event.durationMicros)
          + (s.event.error ? ' · 抛异常' : '');
        trackDiv.appendChild(bar);
      });
      row.appendChild(name);
      row.appendChild(trackDiv);
      frag.appendChild(row);
    });
    el.laneWrap.innerHTML = '';
    el.laneWrap.appendChild(frag);
  }

  /**
   * 渲染事件明细表（最新在上，最多 MAX_TABLE_ROWS 条）。
   */
  function renderTable() {
    if (!events.length) return;
    var frag = document.createDocumentFragment();
    var slice = events.slice(-MAX_TABLE_ROWS).reverse();
    slice.forEach(function (e) {
      var tr = document.createElement('tr');
      if (e.error) tr.className = 'err-row';
      tr.innerHTML = '<td class="mono">' + formatTime(e.epochMs) + '</td>'
        + '<td class="mono" style="padding-left:' + (10 + e.depth * 14) + 'px">'
        + escapeHtml(window.AgentLab.methodLabel(e.type, e.method)) + '</td>'
        + '<td class="dur">' + window.AgentLab.formatDuration(e.durationMicros) + '</td>'
        + '<td><span class="thread-badge" style="color:' + window.AgentLab.pickLaneColor(e.threadName) + '">'
        + escapeHtml(e.threadName) + '</span></td>'
        + '<td>' + e.depth + '</td>';
      frag.appendChild(tr);
    });
    el.rows.innerHTML = '';
    el.rows.appendChild(frag);
  }

  /**
   * 墙钟格式化为 HH:MM:SS。
   *
   * @param {number} epochMs 毫秒时间戳
   * @returns {string} 本地时间文本
   */
  function formatTime(epochMs) {
    var d = new Date(epochMs);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /**
   * HTML 转义，防方法名/线程名注入。
   *
   * @param {string} s 原始文本
   * @returns {string} 安全文本
   */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * 「发一次真实请求」：依次调几个真实接口（失败静默），
   * 几秒后 agent 的事件流里就能看到这次调用的服务端脚印。
   */
  function fireRequests() {
    el.hint.textContent = '已发出请求，2 秒后看时间轴……';
    var urls = ['/jvm-memory', '/agent/stats', '/events/summary?demo=java-agent-lab'];
    urls.forEach(function (u) {
      fetch(API_BASE + u).catch(function () { });
    });
    track('fire', { targets: urls.length });
    setTimeout(function () { el.hint.textContent = '提示：点「发一次真实请求」，几秒后下面的时间轴上就会出现这次调用在服务端留下的脚印。'; }, 4000);
  }

  el.btnCall.addEventListener('click', fireRequests);
  el.btnClear.addEventListener('click', function () {
    events = [];
    render();
  });
  el.btnPause.addEventListener('click', function () {
    paused = !paused;
    el.btnPause.innerHTML = paused
      ? '<i class="ti ti-player-play"></i> 继续采集'
      : '<i class="ti ti-player-pause"></i> 暂停采集';
  });

  window.addEventListener('pagehide', function () {
    track('session_end', { events: Math.min(events.length, 9999) });
  });

  // 启动：先追齐存量事件页，再进入常规轮询
  trackOnceSessionStart();
  refreshStats();
  pullEvents().then(function () { render(); });
  setInterval(function () { if (!paused) pullEvents(); }, POLL_MS);
  setInterval(refreshStats, STATS_MS);

  /**
   * 会话启动埋点（整个会话只记一次）。
   */
  function trackOnceSessionStart() {
    try {
      if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
        window.NFTrack.trackOnce('session_start', { mode: 'agent-lab' });
      }
    } catch (e) { /* 静默 */ }
  }
})();
