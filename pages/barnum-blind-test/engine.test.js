/**
 * 巴纳姆效应盲测器 — 单元测试
 * 运行命令: node pages/barnum-blind-test/engine.test.js
 */

const {
  BARNUM_STATEMENTS,
  GROUPS,
  GROUP_LABELS,
  assignGroup,
  getStatements,
  computeStats,
  compareGroups,
  mulberry32,
  seedFromString,
  getOrCreateSessionSeed,
  resetSessionSeed,
} = require('./engine.js');

function test1_statementsDefined() {
  console.log('测试1: 巴纳姆语句定义完整性');
  let passed = true;

  if (BARNUM_STATEMENTS.length < 10) {
    console.log('  语句数量不足，至少需要10条');
    passed = false;
  }

  const unique = new Set(BARNUM_STATEMENTS);
  if (unique.size !== BARNUM_STATEMENTS.length) {
    console.log('  存在重复语句');
    passed = false;
  }

  for (let i = 0; i < BARNUM_STATEMENTS.length; i++) {
    const s = BARNUM_STATEMENTS[i];
    if (!s || s.length < 10) {
      console.log(`  语句[${i}]太短或为空: "${s}"`);
      passed = false;
    }
  }

  console.log(`  ${BARNUM_STATEMENTS.length} 条语句，全部唯一`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test2_groupConstants() {
  console.log('测试2: 分组常量');
  let passed = true;

  if (GROUPS.TAROT !== 'tarot') { console.log('  TAROT 值不对'); passed = false; }
  if (GROUPS.RANDOM !== 'random') { console.log('  RANDOM 值不对'); passed = false; }
  if (!GROUP_LABELS.tarot || !GROUP_LABELS.random) {
    console.log('  GROUP_LABELS 缺少标签');
    passed = false;
  }

  console.log(`  TAROT=${GROUPS.TAROT}, RANDOM=${GROUPS.RANDOM}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test3_mulberry32Deterministic() {
  console.log('测试3: PRNG 确定性');
  let passed = true;

  const rng1 = mulberry32(42);
  const rng2 = mulberry32(42);

  const seq1 = [];
  const seq2 = [];
  for (let i = 0; i < 100; i++) {
    seq1.push(rng1());
    seq2.push(rng2());
  }

  for (let i = 0; i < 100; i++) {
    if (seq1[i] !== seq2[i]) {
      console.log(`  第${i}个值不相等: ${seq1[i]} vs ${seq2[i]}`);
      passed = false;
      break;
    }
  }

  console.log(`  相同种子(42)生成100个数完全一致`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test4_mulberry32Range() {
  console.log('测试4: PRNG 输出范围');
  let passed = true;

  const rng = mulberry32(12345);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    if (v < 0 || v >= 1) {
      console.log(`  值超出[0,1)范围: ${v}`);
      passed = false;
      break;
    }
  }

  console.log(`  1000 个值全部在 [0, 1) 范围内`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test5_seedFromString() {
  console.log('测试5: 字符串转种子');
  let passed = true;

  const s1 = seedFromString('abc');
  const s2 = seedFromString('abc');
  const s3 = seedFromString('def');

  if (s1 !== s2) { console.log('  相同字符串应产生相同种子'); passed = false; }
  if (s1 === s3) { console.log('  不同字符串产生相同种子（概率极低）'); passed = false; }
  if (typeof s1 !== 'number') { console.log('  返回值应为 number 类型'); passed = false; }

  console.log(`  "abc"→${s1}, "abc"→${s2}, "def"→${s3}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test6_getOrCreateSessionSeed() {
  console.log('测试6: Session seed 生成与持久化');
  let passed = true;

  const seed1 = getOrCreateSessionSeed();
  const seed2 = getOrCreateSessionSeed();

  if (seed1 !== seed2) {
    console.log('  连续两次调用应返回相同 seed');
    passed = false;
  }
  if (!seed1 || seed1.length < 10) {
    console.log('  seed 格式不正确');
    passed = false;
  }

  console.log(`  seed: ${seed1}, 一致性: ${seed1 === seed2 ? '✓' : '✗'}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test7_assignGroupDeterministic() {
  console.log('测试7: 分组确定性（同一session seed）');
  let passed = true;

  const seed = 'test_session_12345';
  try { localStorage.setItem('barnum_session_seed', seed); } catch (e) { /* jsdom */ }

  const results = [];
  for (let i = 0; i < 10; i++) {
    results.push(assignGroup());
  }

  const allSame = results.every(r => r === results[0]);
  if (!allSame) {
    console.log('  同一 session 下多次调用应返回相同分组');
    passed = false;
  }

  console.log(`  分组结果: ${results.join(', ')}, 一致: ${allSame}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test8_assignGroupDistribution() {
  console.log('测试8: 分组均衡性（大样本）');
  let passed = true;

  resetSessionSeed();

  let tarotCount = 0;
  let randomCount = 0;
  const iterations = 1000;

  for (let i = 0; i < iterations; i++) {
    const seed = 'batch_test_' + i;
    try { localStorage.setItem('barnum_session_seed', seed); } catch (e) { /* jsdom */ }
    resetSessionSeed();
    const group = assignGroup();
    if (group === GROUPS.TAROT) tarotCount++;
    else if (group === GROUPS.RANDOM) randomCount++;
  }

  const tarotPct = tarotCount / iterations;
  if (tarotPct < 0.4 || tarotPct > 0.6) {
    console.log(`  塔罗组比例=${(tarotPct*100).toFixed(1)}%，偏离50%较多`);
    passed = false;
  }

  console.log(`  1000 次: 塔罗=${tarotCount}(${(tarotPct*100).toFixed(1)}%), 随机=${randomCount}(${((1-tarotPct)*100).toFixed(1)}%)`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test9_getStatementsCount() {
  console.log('测试9: 获取指定数量语句');
  let passed = true;

  const s3 = getStatements(3);
  if (s3.length !== 3) { console.log(`  请求3条应返回3条，实际${s3.length}`); passed = false; }

  const s5 = getStatements(5);
  if (s5.length !== 5) { console.log(`  请求5条应返回5条，实际${s5.length}`); passed = false; }

  const sAll = getStatements();
  if (sAll.length !== BARNUM_STATEMENTS.length) {
    console.log(`  默认应返回全部${BARNUM_STATEMENTS.length}条，实际${sAll.length}`);
    passed = false;
  }

  const sTooMany = getStatements(100);
  if (sTooMany.length !== BARNUM_STATEMENTS.length) {
    console.log(`  请求100条不应超过总语句数`);
    passed = false;
  }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test10_getStatementsUniqueness() {
  console.log('测试10: 语句去重与索引正确');
  let passed = true;

  const s = getStatements(7);
  if (s.length !== 7) { console.log(`  应返回7条`); passed = false; }

  const indices = s.map(x => x.index);
  const uniqueIndices = new Set(indices);
  if (uniqueIndices.size !== indices.length) {
    console.log('  返回的语句索引有重复');
    passed = false;
  }

  for (const item of s) {
    if (item.index < 0 || item.index >= BARNUM_STATEMENTS.length) {
      console.log(`  索引${item.index}越界`);
      passed = false;
    }
    if (item.text !== BARNUM_STATEMENTS[item.index]) {
      console.log(`  索引${item.index}的文字不匹配`);
      passed = false;
    }
  }

  console.log(`  7条语句全部不重复，索引正确映射到原文`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test11_computeStats() {
  console.log('测试11: 统计计算');
  let passed = true;

  const ratings = [
    { statementIndex: 0, rating: 4 },
    { statementIndex: 1, rating: 5 },
    { statementIndex: 2, rating: 3 },
    { statementIndex: 3, rating: 4 },
    { statementIndex: 4, rating: 5 },
  ];

  const stats = computeStats(ratings);

  if (stats.total !== 5) { console.log(`  total 应为5，实际${stats.total}`); passed = false; }
  if (Math.abs(stats.avgRating - 4.2) > 0.01) {
    console.log(`  avgRating 应为4.2，实际${stats.avgRating}`);
    passed = false;
  }
  if (stats.distribution[0] !== 0) { console.log(`  1分应为0，实际${stats.distribution[0]}`); passed = false; }
  if (stats.distribution[2] !== 1) { console.log(`  3分应为1，实际${stats.distribution[2]}`); passed = false; }
  if (stats.distribution[3] !== 2) { console.log(`  4分应为2，实际${stats.distribution[3]}`); passed = false; }
  if (stats.distribution[4] !== 2) { console.log(`  5分应为2，实际${stats.distribution[4]}`); passed = false; }

  console.log(`  total=${stats.total}, avg=${stats.avgRating}, dist=${JSON.stringify(stats.distribution)}`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test12_computeStatsEmpty() {
  console.log('测试12: 空数据统计');
  let passed = true;

  const stats = computeStats([]);
  if (stats.total !== 0) { console.log(`  total 应为0`); passed = false; }
  if (stats.avgRating !== 0) { console.log(`  avgRating 应为0`); passed = false; }
  if (stats.distribution.some(d => d !== 0)) {
    console.log('  distribution 应全为0');
    passed = false;
  }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test13_computeStatsSingle() {
  console.log('测试13: 单条数据统计');
  let passed = true;

  const stats = computeStats([{ statementIndex: 0, rating: 3 }]);
  if (stats.total !== 1) { console.log(`  total 应为1`); passed = false; }
  if (stats.avgRating !== 3.0) { console.log(`  avgRating 应为3`); passed = false; }
  if (stats.distribution[2] !== 1) { console.log(`  3分应为1`); passed = false; }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test14_compareGroups() {
  console.log('测试14: 两组对比');
  let passed = true;

  const tarotStats = { total: 10, avgRating: 4.2, distribution: [0, 0, 2, 4, 4] };
  const randomStats = { total: 10, avgRating: 3.5, distribution: [0, 1, 4, 3, 2] };

  const result = compareGroups(tarotStats, randomStats);

  if (result.tarotAvg !== 4.2) { console.log(`  tarotAvg 应为4.2`); passed = false; }
  if (result.randomAvg !== 3.5) { console.log(`  randomAvg 应为3.5`); passed = false; }
  if (result.diff !== 0.7) { console.log(`  diff 应为0.7，实际${result.diff}`); passed = false; }
  if (result.diffPercent !== 20) { console.log(`  diffPercent 应为20，实际${result.diffPercent}`); passed = false; }
  if (result.tarotCount !== 10) { console.log(`  tarotCount 应为10`); passed = false; }
  if (result.randomCount !== 10) { console.log(`  randomCount 应为10`); passed = false; }

  console.log(`  tarotAvg=${result.tarotAvg}, randomAvg=${result.randomAvg}, diff=${result.diff}, diff%=${result.diffPercent}%`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test15_compareGroupsEqual() {
  console.log('测试15: 两组评分相等');
  let passed = true;

  const tarotStats = { total: 5, avgRating: 3.8, distribution: [0, 1, 1, 1, 2] };
  const randomStats = { total: 5, avgRating: 3.8, distribution: [0, 1, 1, 1, 2] };

  const result = compareGroups(tarotStats, randomStats);

  if (result.diff !== 0) { console.log(`  diff 应为0`); passed = false; }
  if (result.diffPercent !== 0) { console.log(`  diffPercent 应为0`); passed = false; }

  console.log(`  diff=${result.diff}, diff%=${result.diffPercent}%`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test16_compareGroupsEmpty() {
  console.log('测试16: 空数据对比');
  let passed = true;

  const result = compareGroups({ total: 0, avgRating: 0, distribution: [0, 0, 0, 0, 0] },
                                { total: 0, avgRating: 0, distribution: [0, 0, 0, 0, 0] });

  if (result.diff !== 0) { console.log(`  diff 应为0`); passed = false; }
  if (result.diffPercent !== 0) { console.log(`  diffPercent 应为0`); passed = false; }
  if (result.tarotCount !== 0) { console.log(`  tarotCount 应为0`); passed = false; }
  if (result.randomCount !== 0) { console.log(`  randomCount 应为0`); passed = false; }

  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test17_statementsTemplateMatch() {
  console.log('测试17: 语句符合巴纳姆特征（通用性检测）');
  let passed = true;

  const genericPronouns = ['你', '有时', '偶尔', '内心', '觉得', '可能', '不太', '有些'];

  let genericCount = 0;
  for (const s of BARNUM_STATEMENTS) {
    if (genericPronouns.some(p => s.includes(p))) {
      genericCount++;
    }
  }

  if (genericCount < BARNUM_STATEMENTS.length * 0.8) {
    console.log(`  只有${genericCount}/${BARNUM_STATEMENTS.length}条包含通用模糊词`);
    passed = false;
  }

  console.log(`  ${genericCount}/${BARNUM_STATEMENTS.length} 条包含通用模糊词（巴纳姆特征）`);
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function runTests() {
  console.log('='.repeat(60));
  console.log('巴纳姆效应盲测器 — 单元测试');
  console.log('='.repeat(60) + '\n');

  const results = [
    test1_statementsDefined(),
    test2_groupConstants(),
    test3_mulberry32Deterministic(),
    test4_mulberry32Range(),
    test5_seedFromString(),
    test6_getOrCreateSessionSeed(),
    test7_assignGroupDeterministic(),
    test8_assignGroupDistribution(),
    test9_getStatementsCount(),
    test10_getStatementsUniqueness(),
    test11_computeStats(),
    test12_computeStatsEmpty(),
    test13_computeStatsSingle(),
    test14_compareGroups(),
    test15_compareGroupsEqual(),
    test16_compareGroupsEmpty(),
    test17_statementsTemplateMatch(),
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
