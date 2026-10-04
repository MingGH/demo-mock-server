/**
 * UUID 碰撞实验 — 纯逻辑层。
 * 负责：生日问题公式、数据库行数展示、接口调用与结果格式化。
 */
(function (exports) {
  'use strict';

  var DEFAULT_API_BASE = 'https://numfeel-api.996.ninja';
  var API_BASE = (typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('api')) || DEFAULT_API_BASE;
  var TARGET_ROW_COUNT = 100000000;
  var TRIM_THRESHOLD = 1000000;
  var APPEND_COUNTS = [1000, 10000, 100000];

  /**
   * 计算 n 个随机样本能组成的两两比较数。
   * @param {number} n 样本数
   * @returns {number} n(n-1)/2
   */
  function expectedPairs(n) {
    return n < 2 ? 0 : n * (n - 1) / 2;
  }

  /**
   * 计算 n 个 122 位随机 UUID 至少出现一次冲突的概率。
   * @param {number} n 样本数
   * @returns {number} 冲突概率
   */
  function collisionProbability(n) {
    if (n < 2) return 0;
    var pairs = expectedPairs(n);
    var randomBits = 122;
    var spaceSize = Math.pow(2, randomBits);
    var lambda = pairs / spaceSize;
    return lambda < 1e-12 ? lambda : 1 - Math.exp(-lambda);
  }

  /**
   * 把整数格式化为带千分位的文本。
   * @param {number} value 数值
   * @returns {string} 格式化结果
   */
  function formatInteger(value) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  /**
   * 把百分比格式化为固定两位小数。
   * @param {number} value 百分比
   * @returns {string} 格式化结果
   */
  function formatPercent(value) {
    return Number(value || 0).toFixed(2) + '%';
  }

  /**
   * 把概率格式化为科学计数法，方便展示极小数。
   * @param {number} value 概率
   * @returns {string} 如 9.41 × 10⁻²²
   */
  function formatProbability(value) {
    if (!value || value <= 0) return '0';
    var exponent = Math.floor(Math.log10(value));
    var mantissa = value / Math.pow(10, exponent);
    var superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    var expText = String(exponent).split('').map(function (ch) {
      return ch === '-' ? '⁻' : superscripts[Number(ch)];
    }).join('');
    return mantissa.toFixed(2) + ' × 10' + expText;
  }

  /**
   * 把毫秒格式化为人类友好的耗时。
   * @param {number} ms 毫秒
   * @returns {string} 耗时文本
   */
  function formatDuration(ms) {
    var value = Number(ms || 0);
    if (value < 1) return value.toFixed(2) + ' ms';
    if (value < 1000) return Math.round(value) + ' ms';
    return (value / 1000).toFixed(2) + ' s';
  }

  /**
   * 计算实际插入速度；重复被主键拒绝的行不计入写入量。
   * @param {number} insertedCount 真正写入的新 UUID 数
   * @param {number} elapsedMs 耗时毫秒
   * @returns {number} 每秒插入行数
   */
  function insertSpeedPerSecond(insertedCount, elapsedMs) {
    var count = Number(insertedCount || 0);
    var elapsed = Number(elapsedMs || 0);
    return elapsed > 0 ? count * 1000 / elapsed : 0;
  }

  /**
   * 把行数换算成 16 字节原始负载的容量。
   * @param {number} rowCount 行数
   * @returns {string} 如 1.49 GiB
   */
  function rawBytes(rowCount) {
    var bytes = Number(rowCount || 0) * 16;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MiB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
  }

  /**
   * 校验并规范化用户输入的 UUIDv4。
   * @param {string} value 用户输入
   * @returns {string|null} 小写规范形式；非法时返回 null
   */
  function normalizeUuidInput(value) {
    var raw = String(value || '').trim().toLowerCase();
    if (/^[0-9a-f]{32}$/.test(raw)) {
      raw = raw.replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/, '$1-$2-$3-$4-$5');
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw) ? raw : null;
  }

  /**
   * 调后端查询状态。
   * @returns {Promise<object>} status.data
   */
  function fetchStatus() {
    return fetch(API_BASE + '/uuid-collision/status').then(parseJson);
  }

  /**
   * 查询某个 UUID 是否已在当前实验表中。
   * @param {string} value UUIDv4 输入
   * @returns {Promise<object>} lookup.data
   */
  function lookupUuid(value) {
    return fetch(API_BASE + '/uuid-collision/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: value })
    }).then(parseJson);
  }

  /**
   * 调后端追加一批 UUID。
   * @param {number} count 1000 / 10000 / 100000
   * @returns {Promise<object>} append.data
   */
  function appendUuids(count) {
    return fetch(API_BASE + '/uuid-collision/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: count })
    }).then(parseJson);
  }

  /**
   * 解析统一 API 响应。
   * @param {Response} response fetch 响应
   * @returns {Promise<object>} data 字段
   */
  function parseJson(response) {
    if (response.status === 429) {
      throw new Error('操作太频繁，一分钟后再试。');
    }
    return response.json().then(function (json) {
      if (response.status !== 200 || json.status !== 200) {
        throw new Error(json.message || ('HTTP ' + response.status));
      }
      return json.data;
    });
  }

  exports.API_BASE = API_BASE;
  exports.DEFAULT_API_BASE = DEFAULT_API_BASE;
  exports.TARGET_ROW_COUNT = TARGET_ROW_COUNT;
  exports.TRIM_THRESHOLD = TRIM_THRESHOLD;
  exports.APPEND_COUNTS = APPEND_COUNTS;
  exports.expectedPairs = expectedPairs;
  exports.collisionProbability = collisionProbability;
  exports.formatInteger = formatInteger;
  exports.formatPercent = formatPercent;
  exports.formatProbability = formatProbability;
  exports.formatDuration = formatDuration;
  exports.rawBytes = rawBytes;
  exports.insertSpeedPerSecond = insertSpeedPerSecond;
  exports.fetchStatus = fetchStatus;
  exports.normalizeUuidInput = normalizeUuidInput;
  exports.lookupUuid = lookupUuid;
  exports.appendUuids = appendUuids;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
})(typeof window === 'undefined' ? {} : (window.UuidLab = {}));
