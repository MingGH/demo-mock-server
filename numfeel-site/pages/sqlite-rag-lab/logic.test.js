/**
 * 一个文件的 AI 大脑 · SQLite RAG 实验室 - 单元测试
 * 用 node 直接运行：node pages/sqlite-rag-lab/logic.test.js
 */

const {
  charTokens, buildHighlight, rrfExplain, describeResultRanks, gradePicks, nextScore,
  shuffleWithSeed, formatMs, formatBytes, uniqueIds, QUESTION_SUGGESTIONS,
} = require('./logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
    failed++;
  }
}

function approx(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

// ========== charTokens ==========
console.log('\n📐 charTokens');
assert(JSON.stringify(charTokens('向量检索')) === JSON.stringify(['向', '量', '检', '索']), '中文按单字切分');
assert(JSON.stringify(charTokens('SQLite3 事务')) === JSON.stringify(['sqlite3', '事', '务']), '拉丁词保留整体并小写');
assert(JSON.stringify(charTokens('混合，答案！')) === JSON.stringify(['混', '合', '答', '案']), '标点剔除');
assert(charTokens('   ').length === 0, '空白输入返回空');
assert(charTokens(null).length === 0, 'null 输入返回空');

// ========== buildHighlight ==========
console.log('\n📐 buildHighlight');
(() => {
  const parts = buildHighlight('SQLite 的历史记录存在本地文件里', 'SQLite 存在哪里');
  assert(parts.some(p => p.hit && p.text === 'SQLite'), '命中词单独成段');
  assert(parts.some(p => !p.hit), '普通文本保留');
  const empty = buildHighlight('', '问题');
  assert(JSON.stringify(empty) === JSON.stringify([{ text: '', hit: false }]), '空内容容错');
})();

// ========== rrfExplain ==========
console.log('\n📐 rrfExplain');
(() => {
  const { scores, order } = rrfExplain([[11, 12], [21, 11]]);
  assert(approx(scores.get(11), 1 / 61 + 1 / 62, 1e-9), '双通道第1名+第2名 = 1/61+1/62');
  assert(approx(scores.get(12), 1 / 62, 1e-9), '关键词第2名贡献 1/62');
  assert(approx(scores.get(21), 1 / 61, 1e-9), '向量第1名贡献 1/61');
  assert(order[0] === 11, '双通道命中者排第一');
  assert(order[1] === 21 || order[1] === 12, '并列第二');
})();

// ========== describeResultRanks ==========
console.log('\ndescribeResultRanks');
(() => {
  const results = [
    { chunkId: 11, title: 'same title', rrf: 0.03 },
    { chunkId: 12, title: 'same title', rrf: 0.016 },
    { chunkId: 21, rrf: 0.015 },
  ];
  const channels = {
    fts: [{ chunkId: 11 }, { chunkId: 12 }],
    vec: [{ chunkId: 21 }, { chunkId: 11 }],
  };
  const before = JSON.stringify({ results, channels });
  const ranked = describeResultRanks(results, channels);
  assertEq(ranked.map(r => [r.ftsRank, r.vecRank]), [[1, 2], [2, null], [null, 1]],
    'Map ranks by chunk ID, not document title');
  assertEq(ranked.map(r => r.chunkId), [11, 12, 21], 'Keep server fused order');
  assertEq(ranked.map(r => r.rrf), [0.03, 0.016, 0.015], 'Keep server scores');
  assertEq(JSON.stringify({ results, channels }), before, 'Do not mutate API data');
  assert(ranked[0] !== results[0], 'Return a new result object');
  assertEq(describeResultRanks([], channels), [], 'Empty results');
  assertEq(describeResultRanks(results).map(r => r.ftsRank), [null, null, null],
    'Missing channels remain unranked');
  assertEq(describeResultRanks(results, { fts: [] }).map(r => r.vecRank), [null, null, null],
    'Empty or missing channel has no rank');
})();

// ========== gradePicks ==========
console.log('\n📐 gradePicks');
(() => {
  const all = gradePicks([1, 2, 3], [1, 2, 3]);
  assert(all.hit === 3 && all.perfect, '全中');
  const some = gradePicks([1, 9], [1, 2, 3]);
  assert(some.hit === 1 && !some.perfect, '部分命中只记命中数');
  const none = gradePicks([8, 9, 10], [1, 2, 3]);
  assert(none.hit === 0, '全错记 0');
  assert(typeof all.message === 'string' && all.message.includes('全中'), '全中文案');
})();

// ========== nextScore ==========
console.log('\n📐 nextScore');
(() => {
  let s = { score: 0, streak: 0, best: 0 };
  s = nextScore(s, { hit: 3, perfect: true });
  assert(s.score === 45, '全中得 30+15=45');
  assert(s.streak === 1, '连胜 +1');
  s = nextScore(s, { hit: 1, perfect: false });
  assert(s.score === 55, '再 +10');
  assert(s.streak === 0, '未全中连胜清零');
  assert(s.best === 1, '史高保持为 1');
})();

// ========== shuffleWithSeed ==========
console.log('\n📐 shuffleWithSeed');
(() => {
  const cards = [1, 2, 3, 4, 5, 6];
  const a = shuffleWithSeed(cards, 42);
  const b = shuffleWithSeed(cards, 42);
  assert(JSON.stringify(a) === JSON.stringify(b), '同一种子洗牌结果一致');
  const sorted = [...shuffleWithSeed(cards, 7)].sort((x, y) => x - y);
  assert(JSON.stringify(sorted) === JSON.stringify(cards), '洗牌不丢牌');
  assert(JSON.stringify(cards) === JSON.stringify([1, 2, 3, 4, 5, 6]), '不修改原数组');
})();

// ========== formatMs / formatBytes ==========
console.log('\n📐 formatMs / formatBytes');
assert(formatMs(0.5) === '500µs', '亚毫秒转微秒');
assert(formatMs(3.456) === '3.46ms', '毫秒保留两位');
assert(formatMs(42.7) === '43ms', '10ms 以上取整');
assert(formatMs(undefined) === '0µs', '非法输入按 0');
assert(formatBytes(512) === '512 B', '字节');
assert(formatBytes(2048) === '2.0 KB', 'KB');
assert(formatBytes(1.5 * 1024 * 1024) === '1.50 MB', 'MB');

// ========== uniqueIds / QUESTION_SUGGESTIONS ==========
console.log('\n📐 other');
assert(JSON.stringify(uniqueIds([1, 2, 2, 3])) === JSON.stringify([1, 2, 3]), '去重保序');

console.log('\n========================================');
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
