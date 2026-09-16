/**
 * rpc-chain engine.js 纯逻辑测试 — node 直接运行，无测试框架依赖。
 * 运行：node pages/rpc-chain/engine.test.js
 */
(function () {
  'use strict';

  var E = require('./engine.js');

  var passed = 0;
  var failed = 0;

  function assert(cond, msg) {
    if (cond) { passed++; console.log('✅ ' + msg); }
    else { failed++; console.error('❌ ' + msg); }
  }

  function assertEqual(actual, expected, msg) {
    if (actual === expected) { passed++; console.log('✅ ' + msg); }
    else { failed++; console.error('❌ ' + msg + ' | 期望: ' + expected + ' 实际: ' + actual); }
  }

  function assertClose(actual, expected, tol, msg) {
    if (Math.abs(actual - expected) <= tol) { passed++; console.log('✅ ' + msg); }
    else { failed++; console.error('❌ ' + msg + ' | 期望: ' + expected + ' 实际: ' + actual); }
  }

  // 夹具：一份与后端 /demo/rpc-chain 真实响应同构的报告
  var REPORT = {
    hops: 3,
    delayMs: 0,
    totalMillis: 24.0,
    avgHopMillis: 4.84,
    overheadMillis: 23.913,
    hopTimings: [
      { hop: 1, millis: 8.83, upstreamUs: 44 },
      { hop: 2, millis: 3.49, upstreamUs: 22 },
      { hop: 3, millis: 2.20, upstreamUs: 21 }
    ],
    methodCallBaseline: { iterations: 1000000, avgNanos: 0.9 }
  };

  // ── 单跳开销拆解 ──

  assertClose(E.hopOverheadMs({ millis: 3.0, upstreamUs: 44 }), 2.956, 1e-9,
    'hopOverheadMs = 端到端 − 下游自报业务时间');
  assertClose(E.hopOverheadMs({ millis: 0.02, upstreamUs: 44 }), 0, 1e-9,
    'hopOverheadMs 不会为负（下游自报超过端到端时钳到 0）');

  // ── 汇总 ──

  var s = E.summarize(REPORT);
  assertEqual(s.hops, 3, 'summarize 保留跳数');
  assertEqual(s.delayMs, 0, 'summarize 保留注入延迟');
  assertClose(s.avgHopMs, 4.84, 1e-9, 'avgHopMs = 每跳端到端均值');
  assertClose(s.upstreamMs, 0.087, 1e-9, 'upstreamMs = 下游自报业务时间合计（µs → ms）');
  assertClose(s.avgHopOverheadMs, 4.811, 1e-9, 'avgHopOverheadMs = 每跳 RPC 机制开销均值');
  assertClose(s.baselineMs, 9e-7, 1e-15, 'baselineMs 由纳秒换算到毫秒');
  assertEqual(s.iterations, 1000000, 'summarize 保留基线采样次数');
  assertClose(s.overheadMs, 23.913, 1e-9, 'overheadMs = 总耗时 − 业务时间');
  assertClose(s.upstreamPct, 0.3625, 1e-9, 'upstreamPct = 业务时间占总耗时百分比');

  // 数量级：4.811 ms ÷ 9e-7 ms ≈ 5.3e6 → 6 个数量级
  assertClose(s.ratio, 5345555.555555556, 1, 'ratio = RPC 机制开销 ÷ 方法调用');
  assertEqual(s.orders, 6, 'orders 取到 6 个数量级');

  // 链路对链路：纯机制开销（扣业务） vs N 次方法调用合计
  assertClose(s.baselineChainMs, 2.7e-6, 1e-15, 'baselineChainMs = 单次基线 × 跳数');
  assertClose(s.taxRatio, 23.913 / 2.7e-6, 1, 'taxRatio = 链路机制开销 ÷ N 次方法调用合计');
  assertEqual(s.taxOrders, 6, 'taxOrders 6 个数量级');
  assertClose(s.overheadMs, 23.913, 1e-9, 'overheadMs 已扣除全部业务时间');

  // 边界：单跳报告
  var single = E.summarize({
    hops: 1, delayMs: 0, totalMillis: 2.0,
    hopTimings: [{ hop: 1, millis: 2.0, upstreamUs: 20 }],
    methodCallBaseline: { iterations: 1000000, avgNanos: 1 }
  });
  assertClose(single.avgHopMs, 2.0, 1e-9, '单跳报告 avgHopMs 正确');
  assertClose(single.upstreamPct, 1.0, 1e-9, '单跳报告 upstreamPct 正确');

  // 边界：总耗时为 0 时不产生 NaN
  var zero = E.summarize({
    hops: 0, delayMs: 0, totalMillis: 0,
    hopTimings: [],
    methodCallBaseline: { iterations: 1000000, avgNanos: 1 }
  });
  assertEqual(zero.avgHopMs, 0, '空链路 avgHopMs 为 0');
  assertEqual(zero.upstreamPct, 0, '空链路 upstreamPct 为 0（不产生 NaN）');

  // ── 数量级计算 ──

  assertEqual(E.countOrders(1e6), 6, 'countOrders 一百万 → 6');
  assertEqual(E.countOrders(4.2e6), 6, 'countOrders 非整幂取下界');
  assertEqual(E.countOrders(1), 0, 'countOrders 1 → 0');
  assertEqual(E.countOrders(0.5), -1, 'countOrders 小于 1 为负');
  assertEqual(E.countOrders(0), 0, 'countOrders 0 → 0（不产生 -Infinity）');
  assertEqual(E.countOrders(-5), 0, 'countOrders 负数 → 0');

  // ── 格式化 ──

  assertEqual(E.formatMs(0), '0 ms', 'formatMs 零值');
  assertEqual(E.formatMs(0.0004), '<0.001 ms', 'formatMs 亚微秒');
  assertEqual(E.formatMs(0.5), '0.50 ms', 'formatMs 亚毫秒');
  assertEqual(E.formatMs(84.07), '84.1 ms', 'formatMs 毫秒');
  assertEqual(E.formatMs(2345), '2.35 s', 'formatMs 秒');

  assertEqual(E.formatNanos(0.9), '0.900 ns', 'formatNanos 亚纳秒');
  assertEqual(E.formatNanos(150), '150 ns', 'formatNanos 纳秒整数');
  assert(E.formatNanos(12345).indexOf(',') > 0, 'formatNanos 大数带千分位');

  assertEqual(E.formatMicros(44), '44 µs', 'formatMicros 微秒');
  assertEqual(E.formatMicros(2.2), '2.2 µs', 'formatMicros 小数微秒');
  assertEqual(E.formatMicros(1500), '1.50 ms', 'formatMicros 跨到毫秒');

  assertEqual(E.formatRatio(5345555), '×5,345,555', 'formatRatio 大倍率带千分位');
  assertEqual(E.formatRatio(4.2), '×4.2', 'formatRatio 小倍率保留一位');
  assertEqual(E.formatRatio(0), '—', 'formatRatio 零倍率');

  // ── 图表数据 ──

  var main = E.methodVsRpcChart(s);
  assertEqual(main.labels.length, 2, '主图两根柱');
  assertEqual(main.values.length, 2, '主图两个数值');
  assertClose(main.values[0], 23.913, 1e-9, '主图第一根是链路纯机制开销（已扣业务时间）');
  assertClose(main.values[1], 2.7e-6, 1e-15, '主图第二根是 N 次方法调用合计');
  assert(main.values.every(function (v) { return v > 0; }), '主图数值均为正（对数轴要求）');
  assertEqual(main.colors.length, 2, '主图颜色齐全');
  assert(main.values[0] > main.values[1] * 1e6, '链路机制开销远高于方法调用合计（数量级落差）');

  // 关键性质：注入业务时间不改变左柱——两边工作量必须都归零才可比
  var zeroDelay = E.summarize({
    hops: 2, delayMs: 0, totalMillis: 6.9,
    hopTimings: [
      { hop: 1, millis: 3.5, upstreamUs: 45 },
      { hop: 2, millis: 3.4, upstreamUs: 40 }
    ],
    methodCallBaseline: { iterations: 1000000, avgNanos: 200 }
  });
  var injected = E.summarize({
    hops: 2, delayMs: 100, totalMillis: 206.9,
    hopTimings: [
      { hop: 1, millis: 103.5, upstreamUs: 100050 },
      { hop: 2, millis: 103.4, upstreamUs: 100040 }
    ],
    methodCallBaseline: { iterations: 1000000, avgNanos: 200 }
  });
  var zeroChart = E.methodVsRpcChart(zeroDelay);
  var injectedChart = E.methodVsRpcChart(injected);
  assertClose(injectedChart.values[0], zeroChart.values[0], 0.15,
    '注入 100ms 业务时间后左柱（机制开销）基本不变');
  assertClose(injectedChart.values[0], 6.81, 0.02,
    '左柱 = 总耗时 206.9 − 业务时间 200.09');
  assert(injected.totalMillis > zeroDelay.totalMillis * 20,
    '注入后链路总耗时暴涨（业务时间确实生效，只是不计入左柱）');

  // 紧凑标签（移动端窄屏）
  var compactMain = E.methodVsRpcChart(s, true);
  assertEqual(compactMain.labels.length, 2, 'compact 主图两根柱');
  assert(compactMain.labels.every(function (l) { return l.indexOf('\n') === -1; }),
    'compact 标签单行');
  assertEqual(compactMain.labels[0], 'N 跳 RPC 机制开销', 'compact 标签文案');
  assertClose(compactMain.values[0], main.values[0], 1e-15, 'compact 数值与常规一致');
  var defaultMain = E.methodVsRpcChart(s);
  assert(defaultMain.labels[0].indexOf('\n') !== -1, '常规标签含换行的两行文案');

  var per = E.perHopChart(REPORT);
  assertEqual(per.labels.length, 3, '次图逐跳标签数 = 跳数');
  assertEqual(per.labels[0], '第 1 跳', '次图标签文案');
  assertClose(per.values[0], 8.83, 1e-9, '次图取每跳端到端耗时');
  assert(per.values.every(function (v) { return v > 0; }), '次图数值均为正（对数轴要求）');

  // ── 常量 ──

  assertEqual(E.API_BASE, 'https://numfeel-api.996.ninja', 'API_BASE 是生产地址');
  assertEqual(E.MAX_HOPS, 20, 'MAX_HOPS 与后端一致');
  assertEqual(E.MAX_DELAY_MS, 500, 'MAX_DELAY_MS 与后端一致');

  // ── 汇总 ──

  console.log('\n通过 ' + passed + ' 个，失败 ' + failed + ' 个');
  if (failed > 0) process.exit(1);
})();
