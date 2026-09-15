/**
 * RPC 链路计时器 — 可独立测试的纯逻辑层。
 * 负责：调用后端 /demo/rpc-chain、把返回的逐跳真实耗时拆成「业务时间 / RPC 机制开销」、
 * 与同 JVM 方法调用基线做数量级对比、以及结果格式化。
 *
 * 重要约束：本文件不做任何计时。所有耗时都由服务端测量后随响应返回，
 * 前端只负责换算和呈现——浏览器到机房的公网抖动会把每跳毫秒级差异整个淹掉。
 */
(function (exports) {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';

  /** 后端允许的跳数范围（与 RpcChainService.MAX_HOPS 一致）。 */
  var MAX_HOPS = 20;

  /** 后端允许的单跳注入延迟上限（与 RpcChainService.MAX_DELAY_MS 一致）。 */
  var MAX_DELAY_MS = 500;

  // ── 后端 API ──

  /**
   * 跑一条 N 跳的 RPC 链路并取回计时报告。
   * @param {number} hops 跳数 1~20
   * @param {number} delayMs 每跳注入的模拟业务耗时 0~500
   * @returns {Promise<object>} RpcChainReport
   */
  function fetchChain(hops, delayMs) {
    var url = API_BASE + '/demo/rpc-chain?hops=' + encodeURIComponent(hops) +
      '&delayMs=' + encodeURIComponent(delayMs);
    return fetch(url).then(parseJson);
  }

  function parseJson(res) {
    if (res.status === 429) throw new Error('请求太频繁，歇一分钟再跑');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().then(function (json) {
      if (json.status !== 200) throw new Error(json.message || 'API error');
      return json.data;
    });
  }

  // ── 耗时拆解 ──

  /**
   * 单跳里属于「RPC 机制」的那部分毫秒数 = 本跳端到端 − 下游自报业务耗时。
   * 即网络往返 + 双向序列化 + 框架调度，不含被注入的模拟业务时间。
   * @param {object} hop HopTiming
   * @returns {number} 毫秒
   */
  function hopOverheadMs(hop) {
    return Math.max(0, hop.millis - hop.upstreamUs / 1000);
  }

  /**
   * 把一份链路报告拆成可展示的指标。
   * baselineMs 把方法调用基线从纳秒换算到毫秒，以便和 RPC 跳放在同一坐标上比较。
   * @param {object} report RpcChainReport
   * @returns {object} 汇总指标
   */
  function summarize(report) {
    var hops = report.hopTimings || [];
    var avgHopMs = hops.length
      ? hops.reduce(function (s, h) { return s + h.millis; }, 0) / hops.length
      : 0;
    var upstreamMs = hops.reduce(function (s, h) { return s + h.upstreamUs; }, 0) / 1000;
    var avgHopOverheadMs = hops.length
      ? hops.reduce(function (s, h) { return s + hopOverheadMs(h); }, 0) / hops.length
      : 0;
    var baselineMs = report.methodCallBaseline.avgNanos / 1e6;
    var ratio = baselineMs > 0 ? avgHopOverheadMs / baselineMs : 0;
    return {
      hops: report.hops,
      delayMs: report.delayMs,
      totalMillis: report.totalMillis,
      avgHopMs: avgHopMs,
      avgHopOverheadMs: avgHopOverheadMs,
      upstreamMs: upstreamMs,
      overheadMs: Math.max(0, report.totalMillis - upstreamMs),
      baselineMs: baselineMs,
      iterations: report.methodCallBaseline.iterations,
      ratio: ratio,
      orders: countOrders(ratio),
      upstreamPct: report.totalMillis > 0 ? upstreamMs / report.totalMillis * 100 : 0
    };
  }

  /**
   * 两个耗时的数量级差（ratio 是几倍就是 10 的几次方）。
   * @param {number} ratio 倍率，须为正数
   * @returns {number} 数量级（向下取整），非正输入返回 0
   */
  function countOrders(ratio) {
    if (!(ratio > 0)) return 0;
    return Math.floor(Math.log10(ratio));
  }

  // ── 格式化 ──

  /**
   * 毫秒格式化（自动跨到微秒/秒）。
   * @param {number} ms
   * @returns {string}
   */
  function formatMs(ms) {
    if (!(ms > 0)) return '0 ms';
    if (ms < 0.001) return '<0.001 ms';
    if (ms < 0.01) return ms.toFixed(3) + ' ms';
    if (ms < 1) return ms.toFixed(2) + ' ms';
    if (ms < 100) return ms.toFixed(1) + ' ms';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  /**
   * 纳秒格式化（千分位整数）。
   * @param {number} ns
   * @returns {string}
   */
  function formatNanos(ns) {
    if (ns >= 100) return Math.round(ns).toLocaleString() + ' ns';
    if (ns >= 1) return ns.toFixed(1) + ' ns';
    return ns.toFixed(3) + ' ns';
  }

  /**
   * 微秒格式化（自动跨到毫秒）。
   * @param {number} us
   * @returns {string}
   */
  function formatMicros(us) {
    if (us >= 1000) return (us / 1000).toFixed(2) + ' ms';
    if (us >= 10) return Math.round(us) + ' µs';
    return us.toFixed(1) + ' µs';
  }

  /**
   * 倍率文字。
   * @param {number} ratio
   * @returns {string} 如 "×4,000,000"
   */
  function formatRatio(ratio) {
    if (!(ratio > 0)) return '—';
    if (ratio < 10) return '×' + ratio.toFixed(1);
    return '×' + Math.round(ratio).toLocaleString();
  }

  // ── 图表数据 ──

  /**
   * 主图数据：跨进程一跳的机制开销 vs 同 JVM 一次方法调用。
   * 取对数轴，两者的数量级差距是这张图要表达的结论。
   * @param {object} s summarize() 的结果
   * @param {boolean} compact 紧凑标签（移动端窄屏用，单行短文案）
   * @returns {object} { labels, values, colors }
   */
  function methodVsRpcChart(s, compact) {
    return {
      labels: compact
        ? ['RPC 一跳', '方法调用']
        : ['跨进程 RPC 一跳\n（扣除业务时间）', '同 JVM 方法调用\n（1 次）'],
      values: [Math.max(s.avgHopOverheadMs, 1e-9), Math.max(s.baselineMs, 1e-9)],
      colors: ['#ff6b6b', '#81c784']
    };
  }

  /**
   * 次图数据：逐跳端到端耗时。
   * @param {object} report RpcChainReport
   * @returns {object} { labels, values, colors }
   */
  function perHopChart(report) {
    var hops = report.hopTimings || [];
    return {
      labels: hops.map(function (h) { return '第 ' + h.hop + ' 跳'; }),
      values: hops.map(function (h) { return Math.max(h.millis, 1e-9); }),
      colors: hops.map(function () { return '#90caf9'; })
    };
  }

  // ── 导出 ──

  exports.API_BASE = API_BASE;
  exports.MAX_HOPS = MAX_HOPS;
  exports.MAX_DELAY_MS = MAX_DELAY_MS;
  exports.fetchChain = fetchChain;
  exports.hopOverheadMs = hopOverheadMs;
  exports.summarize = summarize;
  exports.countOrders = countOrders;
  exports.formatMs = formatMs;
  exports.formatNanos = formatNanos;
  exports.formatMicros = formatMicros;
  exports.formatRatio = formatRatio;
  exports.methodVsRpcChart = methodVsRpcChart;
  exports.perHopChart = perHopChart;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.RPC = window.RPC || {}));
