/**
 * engine.js — REST vs GraphQL 对比实验的核心逻辑
 * 纯函数，不操作 DOM，可在浏览器和 Node.js 中运行。
 *
 * 导出函数：
 *   CLAUSES(常量)          — 完整 REST 套餐的字段清单（含每个字段的典型字节权重）
 *   REST_CORE_FIELDS(常量) — 页面实际用到的瘦身字段
 *   summarizeFields(selectedEncoding)     — 根据页面勾选的字段，计算套餐返回/实际用/浪费的字段数
 *   estimateOverfetch(fullBytes, coreBytes) — 计算 over-fetch 的浪费百分比与字节估算
 *   predictGraphqlDbCalls(limit, withAuthor, withReviews, reviewsPerBook) — 预测 GraphQL 嵌套查询的 DB 次数
 *   accumulateMeans(times)  — 缓存竞速：对一组耗时数组求均值
 */

(function () {
  'use strict';

  /**
   * REST 完整套餐返回的全部字段及其典型字节权重（用于估算 over-fetch）。
   * 重量字段 = 大字段，这是"通用 DTO 直接返回"导致的浪费来源。
   */
  var CLAUSES = [
    { key: 'id', label: 'id', heavy: false },
    { key: 'title', label: '书名', heavy: false },
    { key: 'author', label: '作者', heavy: false },
    { key: 'rating', label: '评分', heavy: false },
    { key: 'price', label: '价格', heavy: false },
    { key: 'isbn', label: 'ISBN', heavy: false },
    { key: 'category', label: '分类', heavy: false },
    { key: 'pages', label: '页数', heavy: false },
    { key: 'stock', label: '库存', heavy: false },
    { key: 'publishedYear', label: '出版年份', heavy: false },
    { key: 'description', label: '简介（长文本）', heavy: true }
  ];

  /**
   * 页面真正渲染用到的核心字段（即瘦身版 REST / GraphQL 勾选的字段）。
   * 可视为"一个商品列表卡片只需要这些"。
   */
  var REST_CORE_FIELDS = ['id', 'title', 'author', 'rating', 'price'];

  /**
   * 根据页面勾选的编码方式汇总字段使用情况。
   * @param {boolean} selectDescription 是否勾选"简介"这种重量字段（决定 standard 还是 full 查询）
   * @returns {{core:number, full:number, wasted:number, wastePct:number}}
   *   core   页面实际需要的核心字段数
   *   full   REST 完整套餐返回的字段总数
   *   wasted 完整套餐里页面用不到的多余字段数
   *   wastePct 浪费字段占总返回字段的比例（0~1）
   */
  function summarizeFields(selectDescription) {
    var core = REST_CORE_FIELDS.length + (selectDescription ? 1 : 0);
    var requested = selectDescription ? 6 : 5; // 页面实际请求到的字段
    var full = CLAUSES.length; // 完整套餐恒返回全部字段
    var wasted = Math.max(0, full - requested);
    return {
      core: core,
      full: full,
      wasted: wasted,
      wastePct: wasted / full
    };
  }

  /**
   * 估算 over-fetch 的字节浪费。
   * @param {number} fullBytes 完整 REST 响应实际字节数（后端返回）
   * @param {number} coreBytes 瘦身 REST / GraphQL 响应实际字节数
   * @returns {{wastedBytes:number, wastePct:number, savedPct:number}}
   */
  function estimateOverfetch(fullBytes, coreBytes) {
    var wastedBytes = Math.max(0, fullBytes - coreBytes);
    var base = Math.max(fullBytes, 1);
    return {
      wastedBytes: wastedBytes,
      wastePct: wastedBytes / base,
      savedPct: coreBytes > 0 ? Math.min(1, (fullBytes - coreBytes) / fullBytes) : 0
    };
  }

  /**
   * 预测一次 GraphQL 嵌套查询会触发的 DB 查询次数（N+1 模型）。
   * 响应式实现：标量 = 1 次；+author = 每书 1 次作者；+reviews = 每书 1 次书评。
   * @param {number} limit 查询 limit
   * @param {boolean} withAuthor 是否请求 author
   * @param {boolean} withReviews 是否请求 reviews
   * @param {number} [reviewsPerBook=2] 预计每本书平均书评条数（用于 rows 估算）
   * @returns {{dbCalls:number, rowsLoaded:number}}
   *   dbCalls    SQL 执行总数 = 1 + (withAuthor?limit:0) + (withReviews?limit:0)
   *   rowsLoaded 预计加载行数 = limit + (withAuthor?limit:0) + (withReviews?limit*reviewsPerBook:0)
   */
  function predictGraphqlDbCalls(limit, withAuthor, withReviews, reviewsPerBook) {
    reviewsPerBook = reviewsPerBook == null ? 2 : reviewsPerBook;
    var n = Math.max(0, Math.floor(limit));
    var dbCalls = 1 + (withAuthor ? n : 0) + (withReviews ? n : 0);
    var rowsLoaded = n
      + (withAuthor ? n : 0)
      + (withReviews ? n * reviewsPerBook : 0);
    return { dbCalls: dbCalls, rowsLoaded: rowsLoaded };
  }

  /**
   * 缓存竞速：对多组耗时（毫秒）数组逐组求均值。
   * @param {Array<Array<number>>} series 每组包含多次请求的耗时
   * @returns {Array<number>} 每组均值
   */
  function accumulateMeans(series) {
    return series.map(function (times) {
      if (!times || times.length === 0) return 0;
      var sum = 0;
      for (var i = 0; i < times.length; i++) sum += times[i];
      return sum / times.length;
    });
  }

  // -- 导出 --
  var exports = {
    CLAUSES: CLAUSES,
    REST_CORE_FIELDS: REST_CORE_FIELDS,
    summarizeFields: summarizeFields,
    estimateOverfetch: estimateOverfetch,
    predictGraphqlDbCalls: predictGraphqlDbCalls,
    accumulateMeans: accumulateMeans
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.RestVsGraphqlEngine = exports;
  }
})();