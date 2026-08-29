/**
 * engine.test.js — 运行：node pages/rest-vs-graphql/engine.test.js
 * 覆盖：字段使用汇总、over-fetch 字节估算、GraphQL N+1 成本预测、缓存均值聚合。
 */
'use strict';

var eng = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) <= tol) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg + ' (got ' + a + ', want ~' + b + ')');
  }
}

// ── summarizeFields ──
(function () {
  var s = eng.summarizeFields(false); // 不勾简介
  assert(s.core === 5, '核心字段数=5，未勾简介 actual=' + s.core);
  assert(s.full === 11, '完整套餐字段数=11 actual=' + s.full);
  assert(s.wasted === 6, '未勾简介时浪费 6 个字段 actual=' + s.wasted);
  assertClose(s.wastePct, 6 / 11, 0.0001, 'wastePct=6/11');

  var s2 = eng.summarizeFields(true); // 勾简介
  assert(s2.wasted === 5, '勾简介时浪费 5 个字段 actual=' + s2.wasted);
})();

// ── estimateOverfetch ──
(function () {
  var r = eng.estimateOverfetch(1000, 400);
  assert(r.wastedBytes === 600, 'over-fetch 字节 = 600 actual=' + r.wastedBytes);
  assertClose(r.wastePct, 0.6, 0.0001, 'wastePct = 60%');
  assertClose(r.savedPct, 0.6, 0.0001, '轻量响应省 60%');

  var r2 = eng.estimateOverfetch(0, 0);
  assert(r2.wastedBytes === 0 && r2.wastePct === 0, '零字节输入不崩溃');
})();

// ── predictGraphqlDbCalls ──
(function () {
  var scalar = eng.predictGraphqlDbCalls(10, false, false);
  assert(scalar.dbCalls === 1, '只请求标量：1 次 SQL actual=' + scalar.dbCalls);
  assert(scalar.rowsLoaded === 10, '标量加载 10 行 actual=' + scalar.rowsLoaded);

  var author = eng.predictGraphqlDbCalls(10, true, false);
  assert(author.dbCalls === 11, '+author：1+10=11 次 SQL actual=' + author.dbCalls);
  assert(author.rowsLoaded === 20, '+author 加载 20 行 actual=' + author.rowsLoaded);

  var deep = eng.predictGraphqlDbCalls(10, true, true, 2);
  assert(deep.dbCalls === 21, '+author+reviews：1+10+10=21 次 SQL actual=' + deep.dbCalls);
  assert(deep.rowsLoaded === 40, '+author+reviews 加载 40 行 actual=' + deep.rowsLoaded);

  var zero = eng.predictGraphqlDbCalls(0, true, true, 2);
  assert(zero.dbCalls === 1, 'limit=0 时仅 1 次 SQL actual=' + zero.dbCalls);
})();

// ── accumulateMeans ──
(function () {
  var means = eng.accumulateMeans([[10, 20, 30], [2, 4, 6]]);
  assertClose(means[0], 20, 0.0001, '第一组均值 20');
  assertClose(means[1], 4, 0.0001, '第二组均值 4');

  var empty = eng.accumulateMeans([[],[1,2,3]]);
  assert(empty[0] === 0, '空序列均值为 0');
})();

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);