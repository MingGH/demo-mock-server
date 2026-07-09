/**
 * SQLite vs Grep 对决引擎 — 可独立测试的纯逻辑层。
 * 负责 API 调用、数据格式化、倍率计算等。
 */
(function (exports) {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';

  // ── API 调用 ──

  function fetchStatus() {
    return fetch(API_BASE + '/grep-vs-sqlite/status').then(parseJson);
  }

  function fetchSearch(keyword) {
    return postJson('/grep-vs-sqlite/search', { keyword: keyword });
  }

  function fetchInsert(content, sender) {
    return postJson('/grep-vs-sqlite/insert', { content: content, sender: sender });
  }

  function fetchComplexQuery(type, recentDays) {
    return postJson('/grep-vs-sqlite/complex-query', { type: type, recentDays: recentDays });
  }

  function fetchDelete(keyword) {
    return postJson('/grep-vs-sqlite/delete', { keyword: keyword });
  }

  function fetchReinit(count) {
    return postJson('/grep-vs-sqlite/reinit', { count: count });
  }

  function postJson(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(parseJson);
  }

  function parseJson(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().then(function (json) {
      if (json.status !== 200) throw new Error(json.message || 'API error');
      return json.data;
    });
  }

  // ── 数据格式化 ──

  /** 将毫秒格式化为带单位的字符串 */
  function formatTime(ms) {
    if (ms < 0.01) return '<0.01 ms';
    if (ms < 1) return ms.toFixed(2) + ' ms';
    if (ms < 100) return ms.toFixed(1) + ' ms';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  /** 将字节数格式化为人类可读字符串 */
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /** 计算倍率：slower / faster */
  function calcSpeedRatio(fileTimeMs, sqliteTimeMs) {
    if (sqliteTimeMs <= 0 || fileTimeMs <= 0) return 1;
    var ratio = fileTimeMs / sqliteTimeMs;
    if (ratio < 1) ratio = 1 / ratio;
    return Math.round(ratio * 10) / 10;
  }

  /** 判断谁赢了 */
  function getWinner(fileTimeMs, sqliteTimeMs) {
    if (fileTimeMs < sqliteTimeMs) return 'file';
    if (sqliteTimeMs < fileTimeMs) return 'sqlite';
    return 'tie';
  }

  /** 生成竞速条宽度百分比 */
  function calcRaceWidths(fileTimeMs, sqliteTimeMs) {
    var maxTime = Math.max(fileTimeMs, sqliteTimeMs, 0.01);
    return {
      fileWidth: Math.max(5, (fileTimeMs / maxTime) * 100),
      sqliteWidth: Math.max(5, (sqliteTimeMs / maxTime) * 100)
    };
  }

  // ── 预设数据 ──

  var SEARCH_PRESETS = ['火锅', '快递', '加班', '键盘', '代码', '爬山', '截止'];
  var INSERT_PRESETS = [
    { content: '周末约不约火锅？新开了一家很好吃', sender: '小明' },
    { content: '明天的需求评审改到下午三点了', sender: '产品经理' },
    { content: '猫粮快用完了，下班顺路买一袋', sender: '室友' },
    { content: '这个接口的返回值格式有问题，麻烦看下', sender: '后端同事' }
  ];
  var COMPLEX_PRESETS = [
    { type: 'image', days: 7, label: '最近7天的图片' },
    { type: 'text', days: 30, label: '最近30天的文字' },
    { type: 'video', days: 90, label: '最近90天的视频' },
    { type: 'file', days: 180, label: '最近半年的文件' }
  ];
  var DELETE_PRESETS = ['快递', '加班', '截止'];

  // ── 导出 ──

  exports.GrepVsSqliteEngine = {
    // API
    fetchStatus: fetchStatus,
    fetchSearch: fetchSearch,
    fetchInsert: fetchInsert,
    fetchComplexQuery: fetchComplexQuery,
    fetchDelete: fetchDelete,
    fetchReinit: fetchReinit,
    // Formatters
    formatTime: formatTime,
    formatBytes: formatBytes,
    calcSpeedRatio: calcSpeedRatio,
    getWinner: getWinner,
    calcRaceWidths: calcRaceWidths,
    // Presets
    SEARCH_PRESETS: SEARCH_PRESETS,
    INSERT_PRESETS: INSERT_PRESETS,
    COMPLEX_PRESETS: COMPLEX_PRESETS,
    DELETE_PRESETS: DELETE_PRESETS,
    // Config
    API_BASE: API_BASE
  };

})(typeof module !== 'undefined' && module.exports ? module.exports : window);
