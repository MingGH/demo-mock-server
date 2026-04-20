/**
 * 斯特鲁普效应 — 单元测试
 * 运行命令: node pages/stroop-effect/engine.test.js
 */

const {
  COLORS, generateTrial, generateTrialSequence, isCorrect,
  computeStats, getStroopGrade, shuffleArray, median,
} = require('./engine.js');

// ===== 测试用例 =====

function test1_colorsDefinition() {
  console.log('测试1: 颜色定义完整性');
  let passed = true;

  if (COLORS.length < 4) { console.log('  颜色数量不足'); passed = false; }

  for (const c of COLORS) {
    if (!c.name || !c.css) { console.log(`  颜色缺少 name 或 css: ${JSON.stringify(c)}`); passed = false; }
    if (!c.css.startsWith('#')) { console.log(`  颜色 css 格式错误: ${c.css}`); passed = false; }
  }

  const names = COLORS.map(c => c.name);
  const unique = new Set(names);
  if (unique.size !== names.length) { console.log('  颜色名称有重复'); passed = false; }

  console.log(`  ${COLORS.length} 种颜色: ${names.join(', ')}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test2_generateCongruentTrial() {
  console.log('测试2: 生成一致题目');
  let passed = true;

  for (let i = 0; i < 50; i++) {
    const t = generateTrial('congruent');
    if (t.text !== t.textColorName) {
      console.log(`  一致题目但 text(${t.text}) !== textColorName(${t.textColorName})`);
      passed = false;
      break;
    }
    if (t.correctAnswer !== t.textColorName) {
      console.log(`  correctAnswer 应等于 textColorName`);
      passed = false;
      break;
    }
  }

  console.log(`  生成 50 道一致题目，全部 text === textColorName`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test3_generateIncongruentTrial() {
  console.log('测试3: 生成不一致题目');
  let passed = true;

  for (let i = 0; i < 50; i++) {
    const t = generateTrial('incongruent');
    if (t.text === t.textColorName) {
      console.log(`  不一致题目但 text(${t.text}) === textColorName(${t.textColorName})`);
      passed = false;
      break;
    }
  }

  console.log(`  生成 50 道不一致题目，全部 text !== textColorName`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test4_generateTrialSequence() {
  console.log('测试4: 生成题目序列');
  let passed = true;

  const seq = generateTrialSequence(10, 10);
  if (seq.length !== 20) { console.log(`  序列长度应为 20，实际 ${seq.length}`); passed = false; }

  const congruent = seq.filter(t => t.text === t.textColorName).length;
  const incongruent = seq.filter(t => t.text !== t.textColorName).length;
  if (congruent !== 10) { console.log(`  一致题应为 10，实际 ${congruent}`); passed = false; }
  if (incongruent !== 10) { console.log(`  不一致题应为 10，实际 ${incongruent}`); passed = false; }

  console.log(`  序列: ${seq.length} 题, 一致 ${congruent}, 不一致 ${incongruent}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test5_isCorrect() {
  console.log('测试5: 判断正确性');
  let passed = true;

  const trial = { text: '红', textColor: '#2196F3', textColorName: '蓝', correctAnswer: '蓝' };
  if (!isCorrect(trial, '蓝')) { console.log('  回答蓝应正确'); passed = false; }
  if (isCorrect(trial, '红')) { console.log('  回答红应错误'); passed = false; }
  if (isCorrect(trial, '绿')) { console.log('  回答绿应错误'); passed = false; }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test6_computeStats() {
  console.log('测试6: 统计计算');
  let passed = true;

  const results = [
    { correct: true, rt: 400, type: 'congruent' },
    { correct: true, rt: 500, type: 'congruent' },
    { correct: true, rt: 600, type: 'incongruent' },
    { correct: true, rt: 700, type: 'incongruent' },
    { correct: false, rt: 300, type: 'incongruent' },
  ];

  const stats = computeStats(results);

  if (stats.total !== 5) { console.log(`  total 应为 5，实际 ${stats.total}`); passed = false; }
  if (stats.correctCount !== 4) { console.log(`  correctCount 应为 4，实际 ${stats.correctCount}`); passed = false; }
  if (Math.abs(stats.accuracy - 0.8) > 0.001) { console.log(`  accuracy 应为 0.8，实际 ${stats.accuracy}`); passed = false; }

  // 平均 RT 只算正确的: (400+500+600+700)/4 = 550
  if (Math.abs(stats.avgRT - 550) > 0.001) { console.log(`  avgRT 应为 550，实际 ${stats.avgRT}`); passed = false; }

  // 一致: (400+500)/2 = 450
  if (Math.abs(stats.congruent.avgRT - 450) > 0.001) { console.log(`  congruent avgRT 应为 450，实际 ${stats.congruent.avgRT}`); passed = false; }

  // 不一致（正确的）: (600+700)/2 = 650
  if (Math.abs(stats.incongruent.avgRT - 650) > 0.001) { console.log(`  incongruent avgRT 应为 650，实际 ${stats.incongruent.avgRT}`); passed = false; }

  // 斯特鲁普效应: 650 - 450 = 200
  if (Math.abs(stats.stroopEffect - 200) > 0.001) { console.log(`  stroopEffect 应为 200，实际 ${stats.stroopEffect}`); passed = false; }

  console.log(`  total=${stats.total}, correct=${stats.correctCount}, accuracy=${stats.accuracy}`);
  console.log(`  congruent RT=${stats.congruent.avgRT}ms, incongruent RT=${stats.incongruent.avgRT}ms`);
  console.log(`  stroopEffect=${stats.stroopEffect}ms`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test7_computeStatsEmpty() {
  console.log('测试7: 空结果统计');
  let passed = true;

  const stats = computeStats([]);
  if (stats.total !== 0) { console.log(`  total 应为 0`); passed = false; }
  if (stats.avgRT !== 0) { console.log(`  avgRT 应为 0`); passed = false; }
  if (stats.stroopEffect !== 0) { console.log(`  stroopEffect 应为 0`); passed = false; }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test8_getStroopGrade() {
  console.log('测试8: 评级系统');
  let passed = true;

  const cases = [
    { effect: 30, expected: '认知忍者' },
    { effect: 80, expected: '冷静选手' },
    { effect: 150, expected: '正常水平' },
    { effect: 280, expected: '容易被带偏' },
    { effect: 400, expected: '文字奴隶' },
  ];

  for (const c of cases) {
    const grade = getStroopGrade(c.effect);
    if (grade.grade !== c.expected) {
      console.log(`  effect=${c.effect}ms: 期望「${c.expected}」，实际「${grade.grade}」`);
      passed = false;
    } else {
      console.log(`  ${c.effect}ms → ${grade.grade} ✓`);
    }
  }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test9_shuffleArray() {
  console.log('测试9: 数组洗牌');
  let passed = true;

  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const shuffled = shuffleArray(arr);

  // 长度不变
  if (shuffled.length !== arr.length) { console.log('  长度变了'); passed = false; }

  // 元素不变
  const sortedOrig = arr.slice().sort((a, b) => a - b);
  const sortedShuf = shuffled.slice().sort((a, b) => a - b);
  if (JSON.stringify(sortedOrig) !== JSON.stringify(sortedShuf)) {
    console.log('  元素变了'); passed = false;
  }

  // 原数组未被修改
  if (JSON.stringify(arr) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) {
    console.log('  原数组被修改了'); passed = false;
  }

  // 多次洗牌至少有一次顺序不同（概率极高）
  let allSame = true;
  for (let i = 0; i < 10; i++) {
    const s = shuffleArray(arr);
    if (JSON.stringify(s) !== JSON.stringify(arr)) { allSame = false; break; }
  }
  if (allSame) { console.log('  10 次洗牌全部相同，可能有问题'); passed = false; }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test10_median() {
  console.log('测试10: 中位数计算');
  let passed = true;

  if (median([1, 2, 3]) !== 2) { console.log('  [1,2,3] 中位数应为 2'); passed = false; }
  if (median([1, 2, 3, 4]) !== 2.5) { console.log('  [1,2,3,4] 中位数应为 2.5'); passed = false; }
  if (median([5]) !== 5) { console.log('  [5] 中位数应为 5'); passed = false; }
  if (median([]) !== 0) { console.log('  [] 中位数应为 0'); passed = false; }
  if (median([3, 1, 2]) !== 2) { console.log('  [3,1,2] 中位数应为 2（需排序）'); passed = false; }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

// ===== 运行所有测试 =====
function runTests() {
  console.log('='.repeat(60));
  console.log('斯特鲁普效应 — 单元测试');
  console.log('='.repeat(60) + '\n');

  const results = [
    test1_colorsDefinition(),
    test2_generateCongruentTrial(),
    test3_generateIncongruentTrial(),
    test4_generateTrialSequence(),
    test5_isCorrect(),
    test6_computeStats(),
    test7_computeStatsEmpty(),
    test8_getStroopGrade(),
    test9_shuffleArray(),
    test10_median(),
  ];

  console.log('='.repeat(60));
  const passed = results.filter(r => r).length;
  console.log(`测试结果: ${passed}/${results.length} 通过`);
  console.log('='.repeat(60));

  if (passed === results.length) {
    console.log('✓ 所有测试通过！');
    process.exit(0);
  } else {
    console.log('✗ 部分测试失败');
    process.exit(1);
  }
}

runTests();
