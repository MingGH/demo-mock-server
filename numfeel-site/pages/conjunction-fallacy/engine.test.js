/**
 * 合取谬误 — 单元测试
 * 运行命令: node pages/conjunction-fallacy/engine.test.js
 */

const {
  QUESTIONS,
  PAPER_CONJUNCTION_RATE,
  isCorrect,
  computeResult,
  getVerdict,
  buildReview
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

// ── 测试 1: 题库完整性 ──────────────────────────────────────────────
console.log('\n测试1: 题库完整性');
assert(QUESTIONS.length === 10, '题库恰好 10 题，实际 ' + QUESTIONS.length);

{
  const ids = new Set(QUESTIONS.map(q => q.id));
  assert(ids.size === 10, '10 个题目 id 不重复');
  for (let i = 1; i <= 10; i++) {
    assert(ids.has(i), '包含题目 id=' + i);
  }
}

for (const q of QUESTIONS) {
  assert(q.scenario && q.scenario.length > 10, `题${q.id} 有完整场景描述`);
  assert(q.options.length === 2, `题${q.id} 恰好 2 个选项`);
  assert(q.explanation && q.explanation.length > 10, `题${q.id} 有解释文案`);
  const keys = new Set(q.options.map(o => o.key));
  assert(keys.size === 2, `题${q.id} 选项 key 不重复`);
  const singleCount = q.options.filter(o => o.isSingle).length;
  assert(singleCount === 1, `题${q.id} 恰好一个单项（正确答案）`);
  const A = q.options.find(o => o.key === 'A');
  assert(A && A.isSingle, `题${q.id} 的 A 选项是单项（保持后端 0=单项 约定）`);
}

// ── 测试 2: isCorrect 判定逻辑 ──────────────────────────────────────
console.log('\n测试2: isCorrect 判定');
for (const q of QUESTIONS) {
  assert(isCorrect(q.id, 'A') === true, `题${q.id} 选 A 正确`);
  assert(isCorrect(q.id, 'B') === false, `题${q.id} 选 B 错误（合取项）`);
}
assert(isCorrect(0, 'A') === false, '越界题号返回 false');
assert(isCorrect(11, 'A') === false, '越界题号返回 false');
assert(isCorrect(1, 'C') === false, '非法选项返回 false');
assert(isCorrect(1, '') === false, '空选项返回 false');

// ── 测试 3: computeResult 聚合 ──────────────────────────────────────
console.log('\n测试3: computeResult 聚合');
{
  const allSingle = new Array(10).fill('A');
  const r = computeResult(allSingle);
  assert(r.total === 10, 'total = 10');
  assert(r.correct === 10, '全选 A 得 10 分');
  assert(r.choices.every(v => v === true), '逐题对错全 true');
}
{
  const allConjunction = new Array(10).fill('B');
  const r = computeResult(allConjunction);
  assert(r.correct === 0, '全选 B 得 0 分');
  assert(r.choices.every(v => v === false), '逐题对错全 false');
}
{
  const mixed = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];
  const r = computeResult(mixed);
  assert(r.correct === 5, 'A/B 交替得 5 分');
  assert(r.choices[0] === true && r.choices[1] === false, '逐题对错正确');
}
{
  const empty = computeResult([]);
  assert(empty.total === 10 && empty.correct === 0, '空作答按 0 分处理');
  const short = computeResult(['A', 'B']);
  assert(short.total === 10 && short.correct === 1, '长度不足时缺失题按答错处理');
}

// ── 测试 4: getVerdict 画像文案 ─────────────────────────────────────
console.log('\n测试4: getVerdict 画像');
{
  const v0 = getVerdict(0);
  const v10 = getVerdict(10);
  assert(v0.title.length > 0 && v0.text.length > 10, '0 分有画像文案');
  assert(v10.title.length > 0 && v10.text.length > 10, '10 分有画像文案');
  const v2 = getVerdict(2);
  const v5 = getVerdict(5);
  const v8 = getVerdict(8);
  assert(v2.title !== v5.title && v5.title !== v8.title, '不同分数段画像标题不同');
  assert(getVerdict(1).title !== v2.title, '1 分与 2 分不同段（1 分≤1 档）');
  assert(getVerdict(4).title === v2.title, '4 分与 2 分同段（≤4 档）');
  assert(getVerdict(7).title === v5.title, '7 分与 5 分同段（≤7 档）');
  assert(getVerdict(8).title === v10.title, '8 分与 10 分同段（>7 档）');
  assert(getVerdict(-1).title === v0.title, '负分按 0 处理');
  assert(getVerdict(99).title === v10.title, '超界按 10 处理');
}

// ── 测试 5: 论文常模常量 ────────────────────────────────────────────
console.log('\n测试5: 论文常模常量');
assert(PAPER_CONJUNCTION_RATE === 85, '论文常模为 85%');

// ── 测试 6: buildReview 逐题回顾 ────────────────────────────────────
console.log('\n测试6: buildReview 逐题回顾');
{
  const allSingle = new Array(10).fill('A');
  const review = buildReview(allSingle);
  assert(review.length === 10, '回顾恰好 10 条');
  assert(review.every(r => r.correct === true), '全选 A 逐题都判对');
  assert(review[0].id === 1 && review[9].id === 10, '题号从 1 到 10');
  assert(review[0].choice === 'A' && review[0].choiceText.length > 0, '记录用户所选与文本');
  assert(review[0].correctKey === 'A' && review[0].correctText.length > 0, '正确答案 key 与文本');
  assert(review[0].explanation.length > 10, '每题带解释');
}
{
  const allConjunction = new Array(10).fill('B');
  const review = buildReview(allConjunction);
  assert(review.every(r => r.correct === false), '全选 B 逐题都判错');
  assert(review[0].correctKey === 'A', '错误题仍给出正确答案 key');
}
{
  const mixed = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];
  const review = buildReview(mixed);
  assert(review[0].correct === true && review[1].correct === false, '交替作答逐题对错正确');
}
{
  const short = buildReview(['A', 'B']);
  assert(short.length === 10, '长度不足时仍生成 10 条回顾');
  assert(short[2].correct === false && short[2].choice === '', '缺失题按答错、无选择处理');
}

// ── 汇总 ────────────────────────────────────────────────────────────
console.log(`\n${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
