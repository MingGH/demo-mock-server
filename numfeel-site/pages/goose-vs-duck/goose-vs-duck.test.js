/**
 * 鹅腿 vs 鸭腿 — 核心逻辑单元测试
 * 运行：node pages/goose-vs-duck/goose-vs-duck.test.js
 */

const { QUIZ_DATA, GRADE_RULES } = require('./data.js');
const { shuffleArray } = require('./app.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEq(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

// ═════════════════════════════════════════════
console.log('QUIZ_DATA 数据完整性');
// ═════════════════════════════════════════════

assert(QUIZ_DATA.length === 10, '共10道题');

QUIZ_DATA.forEach((q, i) => {
  assert(q.id === i + 1, `题${i + 1} id正确`);
  assert(['goose', 'duck'].includes(q.answer), `题${i + 1} 答案合法`);
  assert(q.image && q.image.length > 0, `题${i + 1} 有图片`);
  assert(q.hint && q.hint.length > 0, `题${i + 1} 有提示`);
  assert(q.explanation && q.explanation.length > 0, `题${i + 1} 有解释`);
});

// 检查鹅腿和鸭腿数量
const gooseCount = QUIZ_DATA.filter(q => q.answer === 'goose').length;
const duckCount = QUIZ_DATA.filter(q => q.answer === 'duck').length;
assertEq(gooseCount, 3, '鹅腿题目数量为3');
assertEq(duckCount, 7, '鸭腿题目数量为7');
assert(gooseCount + duckCount === 10, '鹅+鸭=10');

// ═════════════════════════════════════════════
console.log('\nGRADE_RULES 评级逻辑');
// ═════════════════════════════════════════════

assert(GRADE_RULES.length === 5, '共5个等级');

// 验证等级覆盖所有分数
for (let score = 0; score <= 10; score++) {
  const grade = GRADE_RULES.find(r => score >= r.min);
  assert(grade !== undefined, `分数${score}能找到对应等级: ${grade ? grade.grade : '无'}`);
}

// 满分等级
const topGrade = GRADE_RULES.find(r => 10 >= r.min);
assertEq(topGrade.grade, '火眼金睛', '满分评级正确');

// 0分等级
const bottomGrade = GRADE_RULES.find(r => 0 >= r.min);
assertEq(bottomGrade.grade, '鹅腿阿姨的理想客户', '0分评级正确');

// ═════════════════════════════════════════════
console.log('\nshuffleArray 洗牌函数');
// ═════════════════════════════════════════════

// 不改变长度
const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const shuffled = shuffleArray([...arr]);
assertEq(shuffled.length, 10, '洗牌后长度不变');

// 包含所有元素
const sorted = [...shuffled].sort((a, b) => a - b);
assert(JSON.stringify(sorted) === JSON.stringify(arr), '洗牌后包含所有原始元素');

// 多次洗牌不总是同一顺序（概率极低会失败，但10!很大）
let allSame = true;
for (let i = 0; i < 5; i++) {
  const s = shuffleArray([...arr]);
  if (JSON.stringify(s) !== JSON.stringify(arr)) {
    allSame = false;
    break;
  }
}
assert(!allSame, '多次洗牌结果不完全相同（随机性）');

// ═════════════════════════════════════════════
console.log('\n────────────────────────────────────');
console.log(`结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
