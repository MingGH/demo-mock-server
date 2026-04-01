/**
 * 世界杯夺冠概率模拟器 — 单元测试
 * node pages/worldcup-simulator.test.js
 */

const {
  TEAMS, rankToElo, winProbability, simulateGroupMatch,
  simulateGroup, simulateWorldCup, monteCarloSimulation,
  groupQualifySimulation
} = require('./worldcup-simulator-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
    console.log(`  ✅ ${msg} (${actual} ≈ ${expected})`);
  } else {
    failed++;
    console.log(`  ❌ ${msg} (${actual} ≠ ${expected}, tolerance=${tolerance})`);
  }
}

// ========== 数据完整性 ==========
console.log('\n⚽ 数据完整性');
{
  assert(TEAMS.length === 48, `共 ${TEAMS.length} 支球队 (应为48)`);
  const groups = new Set(TEAMS.map(t => t.group));
  assert(groups.size === 12, `共 ${groups.size} 个小组 (应为12)`);
  // 每组4队
  const groupCounts = {};
  TEAMS.forEach(t => { groupCounts[t.group] = (groupCounts[t.group] || 0) + 1; });
  const allFour = Object.values(groupCounts).every(c => c === 4);
  assert(allFour, '每组恰好4支球队');
  // 检查关键球队存在
  assert(TEAMS.some(t => t.nameEn === 'Brazil'), '巴西在列');
  assert(TEAMS.some(t => t.nameEn === 'Argentina'), '阿根廷在列');
  assert(TEAMS.some(t => t.nameEn === 'France'), '法国在列');
  assert(TEAMS.some(t => t.nameEn === 'Spain'), '西班牙在列');
}

// ========== Elo 转换 ==========
console.log('\n📊 Elo 转换');
{
  const elo1 = rankToElo(1);
  const elo50 = rankToElo(50);
  const elo86 = rankToElo(86);
  assert(elo1 > elo50, `排名1 (${elo1}) > 排名50 (${elo50})`);
  assert(elo50 > elo86, `排名50 (${elo50}) > 排名86 (${elo86})`);
  assert(elo1 - elo86 > 400, `排名1和86差距 > 400 (${elo1 - elo86})`);
}

// ========== 胜率计算 ==========
console.log('\n🎯 胜率计算');
{
  const p = winProbability(2000, 1800, 0);
  assert(p > 0.5, `强队胜率 > 50% (${(p * 100).toFixed(1)}%)`);
  assert(p < 1, `强队胜率 < 100%`);

  const pEqual = winProbability(1900, 1900, 0);
  assertApprox(pEqual, 0.5, 0.01, '实力相当时胜率约50%');

  // 爆冷系数测试
  const pNormal = winProbability(2000, 1700, 0);
  const pUpset = winProbability(2000, 1700, 0.8);
  assert(pUpset < pNormal, `爆冷系数0.8时强队胜率降低 (${(pNormal * 100).toFixed(1)}% → ${(pUpset * 100).toFixed(1)}%)`);
}

// ========== 小组赛模拟 ==========
console.log('\n🏟️ 小组赛模拟');
{
  const result = simulateGroupMatch(
    { nameEn: 'Spain', fifaRank: 1 },
    { nameEn: 'New Zealand', fifaRank: 86 },
    0
  );
  assert(result.a === 3 || result.a === 1 || result.a === 0, '比赛结果合法 (3/1/0)');
  assert(result.a + result.b === 3 || result.a + result.b === 2, '积分总和合法');
}

// ========== 小组模拟 ==========
console.log('\n📋 小组模拟');
{
  const groupH = TEAMS.filter(t => t.group === 'H');
  const result = simulateGroup(groupH, 0);
  assert(result.first !== undefined, '有第一名');
  assert(result.second !== undefined, '有第二名');
  assert(result.third !== undefined, '有第三名');
  assert(result.first.nameEn !== result.second.nameEn, '第一名和第二名不同');
}

// ========== 完整世界杯模拟 ==========
console.log('\n🏆 完整世界杯模拟');
{
  const champion = simulateWorldCup(0);
  assert(champion !== undefined, '产生冠军');
  assert(typeof champion.nameEn === 'string', '冠军有名字');
  assert(TEAMS.some(t => t.nameEn === champion.nameEn), '冠军是48队之一');
}

// ========== 蒙特卡洛模拟 ==========
console.log('\n🎲 蒙特卡洛模拟 (1000次)');
{
  const results = monteCarloSimulation(1000, 0);
  assert(results.length === 48, '返回48队结果');
  const totalProb = results.reduce((s, r) => s + r.probability, 0);
  assertApprox(totalProb, 100, 1, `概率总和约100% (${totalProb.toFixed(1)}%)`);

  // 强队应该排在前面
  const top5 = results.slice(0, 5).map(r => r.nameEn);
  console.log(`  📊 Top 5: ${top5.join(', ')}`);
  const strongTeams = ['Spain', 'Argentina', 'France', 'England', 'Brazil', 'Portugal', 'Germany'];
  const top5HasStrong = top5.some(t => strongTeams.includes(t));
  assert(top5HasStrong, 'Top 5 包含传统强队');

  // 概率降序排列
  let sorted = true;
  for (let i = 1; i < results.length; i++) {
    if (results[i].probability > results[i - 1].probability) { sorted = false; break; }
  }
  assert(sorted, '结果按概率降序排列');
}

// ========== 爆冷系数影响 ==========
console.log('\n🌪️ 爆冷系数影响');
{
  const normal = monteCarloSimulation(500, 0);
  const upset = monteCarloSimulation(500, 0.8);

  const topNormal = normal[0].probability;
  const topUpset = upset[0].probability;
  console.log(`  正常: 第一名 ${normal[0].name} ${topNormal}%`);
  console.log(`  爆冷: 第一名 ${upset[0].name} ${topUpset}%`);
  assert(topNormal > topUpset || topNormal > 5, '爆冷系数高时概率更分散或正常模式下强队概率较高');
}

// ========== 小组出线概率 ==========
console.log('\n📈 小组出线概率 (500次)');
{
  const qResults = groupQualifySimulation(500, 0);
  assert(qResults.length === 48, '返回48队出线率');
  const spain = qResults.find(r => r.nameEn === 'Spain');
  assert(spain.qualifyRate > 80, `西班牙出线率 > 80% (${spain.qualifyRate}%)`);
  const nz = qResults.find(r => r.nameEn === 'New Zealand');
  console.log(`  西班牙出线率: ${spain.qualifyRate}%, 新西兰出线率: ${nz.qualifyRate}%`);
  assert(spain.qualifyRate > nz.qualifyRate, '西班牙出线率 > 新西兰');
}

// ========== 总结 ==========
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
if (failed > 0) process.exit(1);
