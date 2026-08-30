/**
 * engine.test.js — YAML 地雷阵纯逻辑单元测试
 * 运行：node pages/yaml-minefield/engine.test.js
 */
'use strict';

var eng = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  ✅ ' + msg);
  } else {
    failed += 1;
    console.error('  ❌ ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + '（期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual) + '）');
}

// ── 确定性随机源（可复现） ──
function makeRng(seed) {
  var s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ════ 题库完整性 ════
console.log('\n[题库完整性]');

assert(eng.QUESTION_POOL.length >= 12, '题库至少 12 题，实际 ' + eng.QUESTION_POOL.length);

var ids = {};
var cats = {};
var poolOk = true;
eng.QUESTION_POOL.forEach(function (q) {
  if (ids[q.id]) {
    poolOk = false;
  }
  ids[q.id] = true;
  cats[q.category] = true;
  if (!q.yaml || !q.question || !q.explain) {
    poolOk = false;
  }
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    poolOk = false;
  }
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
    poolOk = false;
  }
  if (q.options[q.answer] === undefined) {
    poolOk = false;
  }
  if (q.severity < 1 || q.severity > 5) {
    poolOk = false;
  }
  if (!eng.CATEGORY_LABELS[q.category]) {
    poolOk = false;
  }
});
assert(poolOk, '每题都有唯一 id、四选项、合法答案下标、解释、严重度 1-5、合法类别');
assert(cats.spec && cats.bool && cats.number && cats.syntax && cats.type, '五类陷阱全覆盖');

// ════ pickQuestions ════
console.log('\n[pickQuestions 抽题]');

var q1 = eng.pickQuestions(eng.QUESTION_POOL, eng.QUESTIONS_PER_RUN, makeRng(42));
assertEqual(q1.length, 8, '固定随机源抽 8 题');
var idSet = {};
var dup = false;
q1.forEach(function (q) {
  if (idSet[q.id]) {
    dup = true;
  }
  idSet[q.id] = true;
});
assert(!dup, '同一局不出现重复题');

var q2 = eng.pickQuestions(eng.QUESTION_POOL, eng.QUESTIONS_PER_RUN, makeRng(42));
assertEqual(JSON.stringify(q1.map(function (q) { return q.id; })),
  JSON.stringify(q2.map(function (q) { return q.id; })), '相同种子结果可复现');

var catsCovered = {};
q1.forEach(function (q) { catsCovered[q.category] = true; });
assert(Object.keys(catsCovered).length >= 4, '一局至少覆盖 4 个类别（每类保底一道）');

var qAll = eng.pickQuestions(eng.QUESTION_POOL, 12, makeRng(7));
assertEqual(qAll.length, 12, 'count 超过保底也能全量抽满');

// ════ scoreAnswer ════
console.log('\n[scoreAnswer 计分]');

var fast = eng.scoreAnswer(true, 20, 1);
assertEqual(fast.gained, 140, '秒答首题：100 + 40 满时间分');
var mid = eng.scoreAnswer(true, 10, 1);
assertEqual(mid.gained, 120, '剩 10 秒答对：100 + 20');
var slow = eng.scoreAnswer(true, 0, 1);
assertEqual(slow.gained, 100, '压哨答对：只有基础分');
var streak2 = eng.scoreAnswer(true, 20, 2);
assertEqual(streak2.gained, 165, '连对第 2 题：140 + 25');
var streak4 = eng.scoreAnswer(true, 20, 4);
assertEqual(streak4.gained, 215, '连对第 4 题：140 + 75');
var wrong = eng.scoreAnswer(false, 15, 0);
assertEqual(wrong.gained, 0, '答错不得分');

// ════ rankTitle ════
console.log('\n[rankTitle 称号]');

assertEqual(eng.rankTitle(8, 8).title, 'YAML 判官本官', '全对 → 判官本官');
assertEqual(eng.rankTitle(6, 8).title, '资深配置工程师', '75% → 资深配置工程师');
assertEqual(eng.rankTitle(4, 8).title, '缩进幸存者', '50% → 缩进幸存者');
assertEqual(eng.rankTitle(2, 8).title, '刚被 YAML 炸过', '<50% → 刚被炸过');
assert(eng.rankTitle(8, 8).comment.length > 0, '称号带评语');

// ════ describeValue ════
console.log('\n[describeValue 值描述]');

assertEqual(eng.describeValue(false).type, 'boolean', 'false → boolean');
assertEqual(eng.describeValue(false).display, 'false', 'false → "false"');
assertEqual(eng.describeValue(750).type, 'integer', '750 → integer');
assertEqual(eng.describeValue(1.1).type, 'float', '1.1 → float');
assertEqual(eng.describeValue('no').type, 'string', '字符串 → string');
assertEqual(eng.describeValue(null).type, 'null', 'null → null');
assertEqual(eng.describeValue(null).display, 'null', 'null → "null"');

// 19 位大数在 JS 里的精度丢失必须原样暴露（与后端 BigInteger 对照）
var big = 1234567890123456789;
assertEqual(eng.describeValue(big).type, 'integer', '大数 → integer');
assertEqual(eng.describeValue(big).display, '1234567890123456800', '大数丢精度：末尾变 6800');

var d = eng.describeValue(new Date(Date.UTC(2026, 7, 29)));
assertEqual(d.type, 'date', 'Date → date');
assertEqual(d.display, '2026-08-29T00:00:00Z', '日期渲染与后端 Instant 格式一致（去 .000Z）');

assertEqual(eng.describeValue([1, 2]).type, 'object', '数组 → object');
assertEqual(eng.describeValue({ a: 1 }).type, 'object', '嵌套对象 → object');

// ════ toEntries ════
console.log('\n[toEntries 归一化]');

var mapping = eng.toEntries({ country: false, port: 8080 });
assertEqual(mapping.rootKind, 'mapping', '对象 → mapping');
assertEqual(mapping.entries.length, 2, 'mapping 两个条目');
assertEqual(mapping.entries[0].key, 'country', '保留键名');
assertEqual(mapping.entries[1].display, '8080', '值正确渲染');

var seq = eng.toEntries(['a', 'b']);
assertEqual(seq.rootKind, 'sequence', '数组 → sequence');
assertEqual(seq.entries[1].key, '1', '数组条目键为下标');

var scalar = eng.toEntries('hello');
assertEqual(scalar.rootKind, 'scalar', '标量 → scalar');
assertEqual(scalar.entries[0].key, '(root)', '标量键为 (root)');

assertEqual(eng.toEntries(null).rootKind, 'null', 'null 根 → null');
assertEqual(eng.toEntries(undefined).entries.length, 0, 'undefined 根 → 空条目');

// ════ diffEntries ════
console.log('\n[diffEntries 两台解析器对照]');

// 意见一致
var agree = eng.diffEntries(
  { ok: true, error: null, rootKind: 'mapping', entries: [{ key: 'country', type: 'boolean', display: 'false' }] },
  { ok: true, error: null, rootKind: 'mapping', values: [{ key: 'country', value: 'false', type: 'boolean' }] }
);
assertEqual(agree.verdict, 'agree', '一致判定 agree');
assertEqual(agree.clashCount, 0, '一致无冲突行');

// 值不同（y 之争：js-yaml true vs SnakeYAML "y"）
var clashValue = eng.diffEntries(
  { ok: true, error: null, rootKind: 'mapping', entries: [{ key: 'agree', type: 'boolean', display: 'true' }] },
  { ok: true, error: null, rootKind: 'mapping', values: [{ key: 'agree', value: 'y', type: 'string' }] }
);
assertEqual(clashValue.verdict, 'clash', '值+类型都不同 → clash');
assertEqual(clashValue.rows[0].same, false, '冲突行标记 same=false');

// 仅值不同、类型相同（大数精度）
var clashPrecision = eng.diffEntries(
  { ok: true, error: null, rootKind: 'mapping', entries: [{ key: 'order_id', type: 'integer', display: '1234567890123456800' }] },
  { ok: true, error: null, rootKind: 'mapping', values: [{ key: 'order_id', value: '1234567890123456789', type: 'integer' }] }
);
assertEqual(clashPrecision.verdict, 'clash', '同类型不同值 → clash（精度丢失现场）');

// 一侧报错
var frontErr = eng.diffEntries(
  { ok: false, error: 'bad indentation', rootKind: null, entries: [] },
  { ok: true, error: null, rootKind: 'mapping', values: [{ key: 'a', value: '1', type: 'integer' }] }
);
assertEqual(frontErr.verdict, 'front-error', '前端报错 → front-error');

var backErr = eng.diffEntries(
  { ok: true, error: null, rootKind: 'mapping', entries: [{ key: 'a', type: 'integer', display: '1' }] },
  { ok: false, error: 'found character that cannot start any token', rootKind: null, values: [] }
);
assertEqual(backErr.verdict, 'back-error', '后端报错 → back-error');

var bothErr = eng.diffEntries(
  { ok: false, error: 'x', rootKind: null, entries: [] },
  { ok: false, error: 'y', rootKind: null, values: [] }
);
assertEqual(bothErr.verdict, 'both-error', '两边都报错 → both-error');

// 一侧多出的键
var extraKey = eng.diffEntries(
  { ok: true, error: null, rootKind: 'mapping', entries: [{ key: 'a', type: 'integer', display: '1' }, { key: 'b', type: 'string', display: 'x' }] },
  { ok: true, error: null, rootKind: 'mapping', values: [{ key: 'a', value: '1', type: 'integer' }] }
);
assertEqual(extraKey.rows.length, 2, '前端多出的键也进对照表');
assertEqual(extraKey.rows[1].same, false, '单侧存在的键判为不一致');

// ════ categoryStats ════
console.log('\n[categoryStats 类别统计]');

var stats = eng.categoryStats([
  { category: 'number', correct: true },
  { category: 'number', correct: false },
  { category: 'bool', correct: true },
  { category: 'number', correct: true }
]);
assertEqual(stats.length, 2, '两类各一条');
var numStat = stats.filter(function (s) { return s.category === 'number'; })[0];
assertEqual(numStat.total, 3, 'number 类 3 题');
assertEqual(numStat.correct, 2, 'number 类对 2 题');
assertEqual(numStat.label, '数字陷阱', '类别带中文标签');

assertEqual(eng.categoryStats([]).length, 0, '空记录 → 空统计');

// ════ buildShareText ════
console.log('\n[buildShareText 战绩文本]');

var share = eng.buildShareText({ correct: 6, total: 8, score: 920, title: '资深配置工程师' });
assert(share.indexOf('6/8') >= 0, '含正确数');
assert(share.indexOf('920') >= 0, '含得分');
assert(share.indexOf('资深配置工程师') >= 0, '含称号');
assert(share.indexOf('numfeel.996.ninja/pages/yaml-minefield') >= 0, '含 demo 链接');

// ════ 汇总 ════
console.log('\n========================================');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed > 0 ? 1 : 0);
