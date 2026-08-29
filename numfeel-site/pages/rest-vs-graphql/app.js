/**
 * app.js — REST vs GraphQL 对比实验 UI 层
 * 依赖：engine.js（window.RestVsGraphqlEngine）
 * 生产 API 基址：https://numfeel-api.996.ninja
 */
(function () {
  'use strict';

  // 生产基址 https://numfeel-api.996.ninja；本地验证时切 localhost:8080，部署前改回
  var API = 'https://numfeel-api.996.ninja';
  var REST_FULL = API + '/api/rest-vs-graphql/catalog/full?limit=5';
  var REST_LIGHT = API + '/api/rest-vs-graphql/catalog/light?limit=5';
  var GQL_ENDPOINT = API + '/graphql';

  var eng = window.RestVsGraphqlEngine;

  var els = {};

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    els.fieldPicker = $('field-picker');
    els.ckDescription = $('ck-description');
    els.phoneList = $('phone-list');
    els.vsRestJson = $('vs-rest-json');
    els.vsLightJson = $('vs-light-json');
    els.vsGqlJson = $('vs-gql-json');
    els.vsRestSize = $('vs-rest-size');
    els.vsLightSize = $('vs-light-size');
    els.vsGqlSize = $('vs-gql-size');
    els.vsRestWaste = $('vs-rest-waste');
    els.vsLightWaste = $('vs-light-waste');
    els.vsGqlWaste = $('vs-gql-waste');
    els.exp1Insight = $('exp1-insight');
    els.btnBench = $('btn-bench');
    els.benchStatus = $('bench-status');
    els.bFirstRest = $('b-first-rest');
    els.bFirstLight = $('b-first-light');
    els.bFirstGql = $('b-first-gql');
    els.bAvgRest = $('b-avg-rest');
    els.bAvgLight = $('b-avg-light');
    els.bAvgGql = $('b-avg-gql');
    els.bTotalRest = $('b-total-rest');
    els.bTotalLight = $('b-total-light');
    els.bTotalGql = $('b-total-gql');
    els.exp2Insight = $('exp2-insight');
    els.gqlLimit = $('gql-limit');
    els.gqlLimitVal = $('gql-limit-val');
    els.gqlAuthor = $('gql-author');
    els.gqlReviews = $('gql-reviews');
    els.btnGqlRun = $('btn-gql-run');
    els.costDbCalls = $('cost-dbcalls');
    els.costRows = $('cost-rows');
    els.costMs = $('cost-ms');
    els.predText = $('pred-text');
    els.exp3Insight = $('exp3-insight');
  }

  // ── 通用请求 ──

  function timedFetch(url, options) {
    var start = performance.now();
    return fetch(url, options)
      .then(function (resp) {
        var elapsed = Math.round((performance.now() - start) * 10) / 10;
        return resp.json().then(function (json) {
          return { json: json, ms: elapsed, status: resp.status };
        });
      });
  }

  function apiOk(r) {
    return r && r.json && r.json.status === 200;
  }

  // ── 字节计算 ──

  function byteLen(s) {
    if (typeof Blob !== 'undefined') return new Blob([s]).size;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(s, 'utf8');
    return unescape(encodeURIComponent(s)).length;
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  // ── 实验一：取数对决 ──

  function gqlQuery(withDescription) {
    var fields = 'id title author { name } rating price';
    if (withDescription) fields += ' description';
    return '{ books(limit: 5) { books { ' + fields + ' } meta { dbCalls rowsLoaded elapsedMs } } }';
  }

  function renderPhone(items, withDescription) {
    if (!items || !items.length) { els.phoneList.innerHTML = '暂无数据'; return; }
    var html = items.slice(0, 5).map(function (b) {
      var authorName = (b.author && typeof b.author === 'object') ? b.author.name : b.author;
      var desc = withDescription && b.description
        ? '<div class="phone-desc">' + b.description + '</div>' : '';
      return '<div class="phone-item">' +
        '<span class="phone-title">' + b.title + '</span>' +
        '<span class="phone-author">' + (authorName || '') + '</span>' +
        '<span class="phone-rating">★ ' + b.rating + '</span>' +
        '<span class="phone-price">¥' + b.price + '</span>' + desc +
        '</div>';
    }).join('');
    els.phoneList.innerHTML = html;
  }

  /** 格式化渲染响应 JSON：每字段一行 + 2 空格缩进，
   *  字段高亮（used 绿 / waste 灰红删除线），缺字段单独标红提示。 */
  function renderVsJson(el, items, coreKeys) {
    if (!items || !items.length) { el.textContent = '（空）'; return; }
    var first = items[0];
    var keys = Object.keys(first);
    var parts = [];
    keys.forEach(function (k, i) {
      var used = coreKeys.indexOf(k) >= 0;
      var cls = used ? 'used' : 'waste';
      var raw = JSON.stringify(first[k]);
      if (raw && raw.length > 80) raw = raw.slice(0, 80) + '…';
      var comma = i < keys.length - 1 ? ',' : '';
      parts.push('  <span class="' + cls + '">"' + k + '": ' + raw + comma + '</span>');
    });
    var missing = coreKeys.filter(function (k) { return keys.indexOf(k) < 0; });
    if (missing.length) {
      parts.push('  <span class="missing">…缺 ' + missing.join('、') + '</span>');
    }
    el.innerHTML = '{\n' + parts.join('\n') + '\n}';
  }

  function runExp1() {
    var withDesc = els.ckDescription.checked;
    var coreKeys = eng.REST_CORE_FIELDS.concat(withDesc ? ['description'] : []);

    els.vsRestJson.textContent = '请求中...';
    els.vsLightJson.textContent = '请求中...';
    els.vsGqlJson.textContent = '请求中...';

    return Promise.all([
      timedFetch(REST_FULL).then(function (r) {
        var items = apiOk(r) ? r.json.data.items : [];
        renderVsJson(els.vsRestJson, items, coreKeys);
        els.vsRestSize.textContent = fmtBytes(byteLen(JSON.stringify(r.json)));
        els.vsRestWaste.textContent = apiOk(r) && items.length ? fmtBytes(byteLen(JSON.stringify(items))) : '-';
        renderPhone(items, withDesc);
        return r;
      }),
      timedFetch(REST_LIGHT).then(function (r) {
        var items = apiOk(r) ? r.json.data.items : [];
        renderVsJson(els.vsLightJson, items, coreKeys);
        els.vsLightSize.textContent = fmtBytes(byteLen(JSON.stringify(r.json)));
        els.vsLightWaste.textContent = apiOk(r) && items.length ? fmtBytes(byteLen(JSON.stringify(items))) : '-';
        return r;
      }),
      timedFetch(GQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gqlQuery(withDesc) })
      }).then(function (r) {
        var items = r.json && r.json.data ? r.json.data.books.books : [];
        renderVsJson(els.vsGqlJson, items, coreKeys);
        els.vsGqlSize.textContent = fmtBytes(byteLen(JSON.stringify(r.json)));
        els.vsGqlWaste.textContent = items.length ? fmtBytes(byteLen(JSON.stringify(items))) : '-';
        return r;
      })
    ]).then(function (results) {
      var full = results[0], light = results[1], gql = results[2];
      var fb = byteLen(JSON.stringify(full.json));
      var cb = byteLen(JSON.stringify(light.json));
      var ov = eng.estimateOverfetch(fb, cb);
      var fields = eng.summarizeFields(withDesc);

      els.exp1Insight.innerHTML = withDesc
        ? '页面想要<b>简介</b>了。瘦身版套餐里没有，当场掉链子；GraphQL 随手自选，响应依旧精准。<br>' +
          'REST 想加字段得重新发版，GraphQL 想加就加——这就是「套餐 vs 自选」。'
        : '完整套餐塞了 <b>' + fields.full + '</b> 个字段，页面只用 <b>' + fields.core + '</b> 个，' +
          '浪费 <b style="color:#ff6b6b">' + fields.wasted + ' 个（' + Math.round(fields.wastePct * 100) + '%）</b>。' +
          '瘦身版把冗余砍到 <b style="color:#81c784">' + fmtBytes(ov.wastedBytes) + '</b>——' +
          'over-fetch 源于设计偷懒，认真设计接口同样能避免。';

      // 更新手机列表为真实数据
      return full;
    });
  }

  // ── 实验二：缓存竞速 ──

  /**
   * 串行请求同 URL N 次并记录每次耗时。
   * 首次用 cache:'reload' 强制走网络（拿到真实服务端耗时），
   * 后续用默认模式——若响应带 Cache-Control 就会被浏览器 HTTP 缓存命中。
   * @param {string} url
   * @param {number} times
   * @returns {Promise<number[]>} 每次耗时（ms）
   */
  function restSeries(url, times) {
    var results = [];
    var chain = timedFetch(url, { cache: 'reload' }).then(function (r) { results.push(r.ms); });
    for (var i = 1; i < times; i++) {
      chain = chain.then(function () {
        return timedFetch(url).then(function (r) { results.push(r.ms); });
      });
    }
    return chain.then(function () { return results; });
  }

  /** 串行发 N 次 GraphQL POST（POST 不可缓存，天然全价）。 */
  function gqlSeries(times) {
    var results = [];
    var chain = Promise.resolve();
    for (var i = 0; i < times; i++) {
      chain = chain.then(function () {
        return timedFetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: gqlQuery(false) })
        }).then(function (r) { results.push(r.ms); });
      });
    }
    return chain.then(function () { return results; });
  }

  function sum(arr) {
    return arr.reduce(function (a, b) { return a + b; }, 0);
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return sum(arr) / arr.length;
  }

  function runBench() {
    els.btnBench.disabled = true;
    els.benchStatus.textContent = '跑 10 次中...';
    var runs = 10;

    var targets = [
      { url: REST_FULL, first: els.bFirstRest, avg: els.bAvgRest, total: els.bTotalRest },
      { url: REST_LIGHT, first: els.bFirstLight, avg: els.bAvgLight, total: els.bTotalLight }
    ];

    var restPlans = targets.map(function (t) {
      return restSeries(t.url, runs).then(function (times) {
        return { times: times, target: t };
      });
    });
    var gqlPlan = gqlSeries(runs).then(function (times) {
      return { times: times };
    });

    Promise.all(restPlans.concat(gqlPlan)).then(function (all) {
      var rests = all.slice(0, 2);
      var gql = all[2];

      rests.forEach(function (r) {
        var times = r.times;
        r.target.first.textContent = times[0] + ' ms';
        r.target.avg.textContent = mean(times.slice(1)).toFixed(1) + ' ms';
        r.target.total.textContent = sum(times).toFixed(1) + ' ms';
      });
      var gqlTimes = gql.times;
      els.bFirstGql.textContent = gqlTimes[0] + ' ms';
      els.bAvgGql.textContent = mean(gqlTimes.slice(1)).toFixed(1) + ' ms';
      els.bTotalGql.textContent = sum(gqlTimes).toFixed(1) + ' ms';

      var gqlTotal = sum(gqlTimes);
      var restTotal = sum(rests[0].times);
      els.exp2Insight.innerHTML = 'GraphQL 10 次全价累计 <b style="color:#ff6b6b">' + gqlTotal.toFixed(1) + ' ms</b>；' +
        'REST 第 1 次走网络后，第 2 次起命中浏览器缓存（<code>Cache-Control: max-age=60</code>），' +
        '平均 ' + mean(rests[0].times.slice(1)).toFixed(1) + ' ms，累计 ' + restTotal.toFixed(1) + ' ms。<br>' +
        '<b>GET 吃的是 HTTP 三十年缓存红利，POST 天生享受不到。</b>';

      els.btnBench.disabled = false;
      els.benchStatus.textContent = '';
    }).catch(function () {
      els.benchStatus.textContent = '请求失败，请检查网络/后端';
      els.btnBench.disabled = false;
    });
  }

  // ── 实验三：成本爆炸 ──

  function updateGqlLimitVal() {
    els.gqlLimitVal.textContent = els.gqlLimit.value;
    updatePred();
  }

  function updatePred() {
    var n = parseInt(els.gqlLimit.value, 10);
    var p = eng.predictGraphqlDbCalls(n, els.gqlAuthor.checked, els.gqlReviews.checked, 2);
    els.predText.textContent = 'limit=' + n +
      (els.gqlAuthor.checked ? ' + author' : '') +
      (els.gqlReviews.checked ? ' + reviews' : '') +
      ' → 预计 ' + p.dbCalls + ' 次 SQL，加载 ' + p.rowsLoaded + ' 行';
  }

  function runExp3() {
    var n = parseInt(els.gqlLimit.value, 10);
    var author = els.gqlAuthor.checked;
    var reviews = els.gqlReviews.checked;
    var sel = 'title price';
    if (author) sel += ' author { name }';
    if (reviews) sel += ' reviews { rating }';
    var query = '{ books(limit: ' + n + ') { books { ' + sel + ' } meta { dbCalls rowsLoaded elapsedMs } } }';

    els.btnGqlRun.disabled = true;
    els.costDbCalls.textContent = '...';

    timedFetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query })
    }).then(function (r) {
      els.btnGqlRun.disabled = false;
      if (!r.json || !r.json.data) {
        els.costDbCalls.textContent = 'ERR';
        els.exp3Insight.innerHTML = '请求失败：' + (r.json && r.json.errors ? JSON.stringify(r.json.errors[0].message) : '未知错误');
        return;
      }
      var meta = r.json.data.books.meta;
      els.costDbCalls.textContent = meta.dbCalls;
      els.costRows.textContent = meta.rowsLoaded;
      els.costMs.textContent = meta.elapsedMs;

      var pred = eng.predictGraphqlDbCalls(n, author, reviews, 2);
      var nesting = (author ? ' +author 每书 1 次' : '') + (author && reviews ? '，' : '') + (reviews ? ' +reviews 再每书 1 次' : '');
      els.exp3Insight.innerHTML = '真实执行了 <b style="color:#ff6b6b">' + meta.dbCalls + '</b> 次 SQL：标量 1 次' + nesting +
        '——N+1 就是这么爆的。REST 恒为 1 次。<br>' +
        '理论预测 ' + pred.dbCalls + ' 次，' + (meta.dbCalls === pred.dbCalls ? '命中。' : '因书评条数浮动略有偏差。') +
        '公开 API 扛不住无上界成本，只能上深度限制 / 复杂度评分 / 持久化查询。';
    }).catch(function () {
      els.btnGqlRun.disabled = false;
      els.costDbCalls.textContent = 'ERR';
    });
  }

  // ── 四步导览：滚动时高亮当前实验 ──

  function setupGuide() {
    var steps = document.querySelectorAll('.guide-step');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var target = e.target.id;
          steps.forEach(function (s) {
            s.classList.toggle('active', s.getAttribute('data-target') === target);
          });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['exp-1', 'exp-2', 'exp-3', 'balance'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  // ── 绑定事件 ──

  function bind() {
    els.ckDescription.addEventListener('change', function () { runExp1(); });
    els.btnBench.addEventListener('click', runBench);
    els.gqlLimit.addEventListener('input', updateGqlLimitVal);
    els.btnGqlRun.addEventListener('click', runExp3);
    els.gqlAuthor.addEventListener('change', updatePred);
    els.gqlReviews.addEventListener('change', updatePred);
  }

  function init() {
    cacheDom();
    bind();
    updateGqlLimitVal();
    setupGuide();
    runExp1();
    runExp3();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();