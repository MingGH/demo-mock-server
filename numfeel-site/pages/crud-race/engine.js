/**
 * 增删改查引擎大赛 — 可独立测试的纯逻辑层。
 * 负责：seed 数据生成（与后端 CrudRaceService 同公式）、模块一的「文本文件数据库」
 * 引擎、模块二的后端 API 调用、结果格式化与倍率计算。
 */
(function (exports) {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';

  // ── seed 数据生成（与后端 keyOf/valueOf 同公式，保证「同一份数据」） ──

  /**
   * 生成第 i 条记录的 key：k + 7 位序号（如 k0000042）。
   * @param {number} i 序号
   * @returns {string} key
   */
  function keyOf(i) {
    return 'k' + String(i).padStart(7, '0');
  }

  /**
   * 确定性生成第 i 条记录的 value：模拟订单串（约 33 字节），同 i 结果恒定。
   * 与后端 Java 公式等价：h = (i * 2654435761) & 0xFFFFFFFF。
   * @param {number} i 序号
   * @returns {string} value
   */
  function valueOf(i) {
    var h = (i * 2654435761) >>> 0;
    return 'user-' + String((h >>> 18) % 10000).padStart(4, '0') +
      '|item-' + String((h >>> 7) % 100000).padStart(5, '0') +
      '|amt-' + String(h % 1000).padStart(3, '0') + '|paid';
  }

  // ── 模块一：文本文件数据库（纯逻辑，DOM 由 app.js 负责） ──

  /**
   * 创建一个「文本文件数据库」引擎：数据是 key|value 行，模拟真实文件的行为——
   * 查询 = 逐行扫描（记录扫描行数）；插入 = 追加一行；
   * 更新/删除 = 读全文件 → 改一行 → 全量写回（记录写回行数 = 写放大）。
   * @returns {object} 引擎实例
   */
  function createTextFileEngine() {
    var lines = [];
    var writtenLines = 0; // 累计写回的行数（写放大的直观度量）

    function findIndex(key) {
      for (var i = 0; i < lines.length; i++) {
        var sep = lines[i].indexOf('|');
        if (lines[i].substring(0, sep) === key) return i;
      }
      return -1;
    }

    return {
      /**
       * 载入 n 行 seed 数据（相当于重新生成 data.txt）。
       * @param {number} n 行数
       */
      loadSeed: function (n) {
        lines = [];
        writtenLines = 0;
        for (var i = 0; i < n; i++) lines.push(keyOf(i) + '|' + valueOf(i));
      },

      /** 当前全部行（副本）。 */
      getAll: function () { return lines.slice(); },

      /** 当前行数。 */
      size: function () { return lines.length; },

      /** 文件字节数（每行字符数 + 换行符）。 */
      bytes: function () {
        var total = 0;
        for (var i = 0; i < lines.length; i++) total += lines[i].length + 1;
        return total;
      },

      /** 累计写回行数（写放大度量）。 */
      writtenCount: function () { return writtenLines; },

      /**
       * 查询：逐行扫描，返回命中行下标（-1 为未命中）与实际扫描行数。
       * @param {string} key
       * @returns {{found: boolean, value: string|null, scanned: number}}
       */
      get: function (key) {
        for (var i = 0; i < lines.length; i++) {
          var sep = lines[i].indexOf('|');
          if (lines[i].substring(0, sep) === key) {
            return { found: true, value: lines[i].substring(sep + 1), scanned: i + 1 };
          }
        }
        return { found: false, value: null, scanned: lines.length };
      },

      /**
       * 插入：文件末尾追加一行。
       * @param {string} key
       * @param {string} value
       */
      insert: function (key, value) {
        lines.push(key + '|' + value);
        writtenLines += 1;
      },

      /**
       * 更新：读全文件定位 → 重写整个文件（写放大：N 行重写）。
       * @param {string} key
       * @param {string} value
       * @returns {boolean} 是否命中
       */
      update: function (key, value) {
        var idx = findIndex(key);
        if (idx === -1) return false;
        lines[idx] = key + '|' + value;
        writtenLines += lines.length; // 整个文件重写
        return true;
      },

      /**
       * 删除：读全文件定位 → 移除一行 → 重写整个文件。
       * @param {string} key
       * @returns {boolean} 是否命中
       */
      remove: function (key) {
        var idx = findIndex(key);
        if (idx === -1) return false;
        lines.splice(idx, 1);
        writtenLines += lines.length; // 剩余行全部重写
        return true;
      }
    };
  }

  // ── 模块二：后端 API ──

  /**
   * 查询各引擎可用性。
   * @returns {Promise<object>} { text:{available}, mysql:{available}, caffeine:{available} }
   */
  function fetchStatus() {
    return fetch(API_BASE + '/crud-race/status').then(parseJson);
  }

  /**
   * 在指定引擎上跑一轮基准。
   * @param {string} engine text / mysql / caffeine
   * @param {number} count 数据行数
   * @param {string} op get / update / insert / delete
   * @param {number} ops 操作次数
   * @returns {Promise<object>} RunResult
   */
  function postRun(engine, count, op, ops) {
    return postJson('/crud-race/run', { engine: engine, count: count, op: op, ops: ops });
  }

  function postJson(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(parseJson);
  }

  function parseJson(res) {
    if (res.status === 429) throw new Error('请求太频繁，稍等一分钟再跑');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().then(function (json) {
      if (json.status !== 200) throw new Error(json.message || 'API error');
      return json.data;
    });
  }

  // ── 格式化与统计 ──

  /**
   * 把毫秒格式化为人类友好的字符串（自动换算到微秒/秒）。
   * @param {number} ms
   * @returns {string}
   */
  function formatMs(ms) {
    if (ms < 0.001) return '<0.001 ms';
    if (ms < 0.01) return ms.toFixed(3) + ' ms';
    if (ms < 1) return ms.toFixed(2) + ' ms';
    if (ms < 100) return ms.toFixed(1) + ' ms';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  /**
   * 把字节数格式化为 KB/MB。
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  /**
   * 倍率文字：a 相对 b 快多少倍。
   * @param {number} a 分母（基准，通常是文本引擎）
   * @param {number} b 分子（通常是其他引擎）
   * @returns {string} 如 "×120" 或 "—"（无基准或为 0 时）
   */
  function ratioText(base, other) {
    if (!base || !other || base <= 0) return '—';
    var r = base / other;
    if (r < 1) return '×' + r.toFixed(2);
    if (r < 10) return '×' + r.toFixed(1);
    return '×' + Math.round(r).toLocaleString();
  }

  /**
   * 把数字格式化为带千分位的 QPS。
   * @param {number} qps
   * @returns {string}
   */
  function formatQps(qps) {
    if (qps >= 1000) return Math.round(qps).toLocaleString() + ' /s';
    if (qps >= 10) return qps.toFixed(1) + ' /s';
    return qps.toFixed(2) + ' /s';
  }

  /**
   * 引擎展示元数据（名称、本质一句话、颜色）。
   * 与后端/前端实现的引擎一一对应；IndexedDB 在浏览器跑，单独标注。
   */
  var ENGINE_META = {
    text: {
      name: '文本文件',
      where: '服务器上',
      what: '一个 .txt 文件，查询 = 全量扫描',
      color: '#ff6b6b'
    },
    mysql: {
      name: 'MySQL',
      where: '远程数据库',
      what: 'B+ 树索引，每次操作跨一次网络',
      color: '#90caf9'
    },
    caffeine: {
      name: 'Caffeine 缓存',
      where: '服务器内存',
      what: '进程内哈希表',
      color: '#81c784'
    },
    indexeddb: {
      name: 'IndexedDB',
      where: '你的浏览器',
      what: '浏览器内置数据库，本地磁盘',
      color: '#ce93d8'
    }
  };

  // ── 导出 ──

  exports.API_BASE = API_BASE;
  exports.keyOf = keyOf;
  exports.valueOf = valueOf;
  exports.createTextFileEngine = createTextFileEngine;
  exports.fetchStatus = fetchStatus;
  exports.postRun = postRun;
  exports.formatMs = formatMs;
  exports.formatBytes = formatBytes;
  exports.ratioText = ratioText;
  exports.formatQps = formatQps;
  exports.ENGINE_META = ENGINE_META;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.CR = window.CR || {}));
