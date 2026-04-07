// true-self-test.test.js — 核心算法单元测试
// 运行: node pages/true-self-test.test.js

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.error('  ❌ ' + msg); }
}

// ===== 复制核心数据结构 =====
const DIMENSIONS = [
  { id:'emotional' }, { id:'decision' }, { id:'values' }, { id:'boundary' }, { id:'identity' }
];

// 模拟题库结构：每维度4题，每题4选项(score 1-4)
function buildQuestions() {
  const qs = [];
  DIMENSIONS.forEach(d => {
    for (let i = 0; i < 4; i++) {
      qs.push({ dim: d.id, opts: [
        { score: 1 }, { score: 2 }, { score: 3 }, { score: 4 }
      ]});
    }
  });
  return qs;
}

const QUESTIONS = buildQuestions();

// ===== 复制核心算法 =====
function calcScores(answers) {
  const dimScores = {};
  DIMENSIONS.forEach(d => { dimScores[d.id] = { total: 0, count: 0 }; });
  QUESTIONS.forEach((q, i) => {
    if (answers[i] !== null) {
      dimScores[q.dim].total += q.opts[answers[i]].score;
      dimScores[q.dim].count++;
    }
  });
  const result = {};
  DIMENSIONS.forEach(d => {
    const s = dimScores[d.id];
    result[d.id] = s.count > 0 ? Math.round((s.total / (s.count * 4)) * 100) : 0;
  });
  return result;
}

function overallScore(dimPcts) {
  const vals = Object.values(dimPcts);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ===== 测试 =====
console.log('\n🧪 calcScores 测试');

// 全选最低分(index 0, score=1)
const allMin = new Array(20).fill(0);
const minResult = calcScores(allMin);
assert(minResult.emotional === 25, '全选最低分 → 每维度25%');
assert(minResult.decision === 25, '决策维度也是25%');
assert(overallScore(minResult) === 25, '总分25%');

// 全选最高分(index 3, score=4)
const allMax = new Array(20).fill(3);
const maxResult = calcScores(allMax);
assert(maxResult.emotional === 100, '全选最高分 → 每维度100%');
assert(overallScore(maxResult) === 100, '总分100%');

// 全选第二项(index 1, score=2) → 50%
const allTwo = new Array(20).fill(1);
const twoResult = calcScores(allTwo);
assert(twoResult.emotional === 50, '全选score=2 → 50%');
assert(overallScore(twoResult) === 50, '总分50%');

// 全选第三项(index 2, score=3) → 75%
const allThree = new Array(20).fill(2);
const threeResult = calcScores(allThree);
assert(threeResult.values === 75, '全选score=3 → 75%');
assert(overallScore(threeResult) === 75, '总分75%');

console.log('\n🧪 混合分数测试');

// 前4题(emotional)选最高，其余选最低
const mixed = new Array(20).fill(0);
mixed[0] = 3; mixed[1] = 3; mixed[2] = 3; mixed[3] = 3;
const mixedResult = calcScores(mixed);
assert(mixedResult.emotional === 100, '情绪维度全高 → 100%');
assert(mixedResult.decision === 25, '决策维度全低 → 25%');
assert(overallScore(mixedResult) === 40, '混合总分 = (100+25+25+25+25)/5 = 40%');

console.log('\n🧪 未答题处理');

const partial = new Array(20).fill(null);
partial[0] = 3; partial[1] = 3; // 只答了emotional的前2题
const partialResult = calcScores(partial);
assert(partialResult.emotional === 100, '部分作答：已答题维度正确计算');
assert(partialResult.decision === 0, '未答题维度 → 0%');

console.log('\n🧪 边界情况');

const empty = new Array(20).fill(null);
const emptyResult = calcScores(empty);
assert(overallScore(emptyResult) === 0, '全部未答 → 0%');

console.log('\n🧪 维度数量验证');
assert(DIMENSIONS.length === 5, '共5个维度');
assert(QUESTIONS.length === 20, '共20道题');
DIMENSIONS.forEach(d => {
  const count = QUESTIONS.filter(q => q.dim === d.id).length;
  assert(count === 4, d.id + ' 维度有4道题');
});

console.log('\n🧪 分数范围验证');
// 随机测试100次，确保分数在0-100之间
for (let t = 0; t < 100; t++) {
  const randAnswers = Array.from({length: 20}, () => Math.floor(Math.random() * 4));
  const r = calcScores(randAnswers);
  const s = overallScore(r);
  if (s < 0 || s > 100) {
    assert(false, '随机测试分数越界: ' + s);
    break;
  }
  Object.values(r).forEach(v => {
    if (v < 25 || v > 100) {
      assert(false, '维度分数越界: ' + v);
    }
  });
}
assert(true, '100次随机测试分数均在有效范围内');

// ===== 汇总 =====
console.log('\n' + '='.repeat(40));
console.log('✅ 通过: ' + passed + '  ❌ 失败: ' + failed);
if (failed > 0) process.exit(1);
console.log('全部通过!\n');
