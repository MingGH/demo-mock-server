/**
 * 2026 美加墨世界杯夺冠概率模拟器 — 核心算法
 * 数据来源：
 *   - FIFA 排名: FIFA Men's World Ranking (2025年11月/2026年3月)
 *   - 分组: Wikipedia 2026 FIFA World Cup seeding
 *   - 历史夺冠: FIFA World Cup 官方记录
 *
 * 方法: 蒙特卡洛模拟 + Elo 风格胜率模型
 */

// === 48 队完整数据 ===
const TEAMS = [
  // Group A
  { name: '墨西哥', nameEn: 'Mexico', group: 'A', fifaRank: 15, titles: 0, confederation: 'CONCACAF' },
  { name: '南非', nameEn: 'South Africa', group: 'A', fifaRank: 61, titles: 0, confederation: 'CAF' },
  { name: '韩国', nameEn: 'South Korea', group: 'A', fifaRank: 22, titles: 0, confederation: 'AFC' },
  { name: '捷克', nameEn: 'Czech Republic', group: 'A', fifaRank: 44, titles: 0, confederation: 'UEFA' },
  // Group B
  { name: '加拿大', nameEn: 'Canada', group: 'B', fifaRank: 27, titles: 0, confederation: 'CONCACAF' },
  { name: '波黑', nameEn: 'Bosnia & Herzegovina', group: 'B', fifaRank: 71, titles: 0, confederation: 'UEFA' },
  { name: '卡塔尔', nameEn: 'Qatar', group: 'B', fifaRank: 51, titles: 0, confederation: 'AFC' },
  { name: '瑞士', nameEn: 'Switzerland', group: 'B', fifaRank: 17, titles: 0, confederation: 'UEFA' },
  // Group C
  { name: '巴西', nameEn: 'Brazil', group: 'C', fifaRank: 5, titles: 5, confederation: 'CONMEBOL' },
  { name: '摩洛哥', nameEn: 'Morocco', group: 'C', fifaRank: 11, titles: 0, confederation: 'CAF' },
  { name: '海地', nameEn: 'Haiti', group: 'C', fifaRank: 84, titles: 0, confederation: 'CONCACAF' },
  { name: '苏格兰', nameEn: 'Scotland', group: 'C', fifaRank: 36, titles: 0, confederation: 'UEFA' },
  // Group D
  { name: '美国', nameEn: 'United States', group: 'D', fifaRank: 14, titles: 0, confederation: 'CONCACAF' },
  { name: '巴拉圭', nameEn: 'Paraguay', group: 'D', fifaRank: 39, titles: 0, confederation: 'CONMEBOL' },
  { name: '澳大利亚', nameEn: 'Australia', group: 'D', fifaRank: 26, titles: 0, confederation: 'AFC' },
  { name: '土耳其', nameEn: 'Turkey', group: 'D', fifaRank: 25, titles: 0, confederation: 'UEFA' },
  // Group E
  { name: '德国', nameEn: 'Germany', group: 'E', fifaRank: 9, titles: 4, confederation: 'UEFA' },
  { name: '库拉索', nameEn: 'Curaçao', group: 'E', fifaRank: 82, titles: 0, confederation: 'CONCACAF' },
  { name: '科特迪瓦', nameEn: 'Ivory Coast', group: 'E', fifaRank: 42, titles: 0, confederation: 'CAF' },
  { name: '厄瓜多尔', nameEn: 'Ecuador', group: 'E', fifaRank: 23, titles: 0, confederation: 'CONMEBOL' },
  // Group F
  { name: '荷兰', nameEn: 'Netherlands', group: 'F', fifaRank: 7, titles: 0, confederation: 'UEFA' },
  { name: '日本', nameEn: 'Japan', group: 'F', fifaRank: 18, titles: 0, confederation: 'AFC' },
  { name: '瑞典', nameEn: 'Sweden', group: 'F', fifaRank: 43, titles: 0, confederation: 'UEFA' },
  { name: '突尼斯', nameEn: 'Tunisia', group: 'F', fifaRank: 40, titles: 0, confederation: 'CAF' },
  // Group G
  { name: '比利时', nameEn: 'Belgium', group: 'G', fifaRank: 8, titles: 0, confederation: 'UEFA' },
  { name: '埃及', nameEn: 'Egypt', group: 'G', fifaRank: 34, titles: 0, confederation: 'CAF' },
  { name: '伊朗', nameEn: 'Iran', group: 'G', fifaRank: 20, titles: 0, confederation: 'AFC' },
  { name: '新西兰', nameEn: 'New Zealand', group: 'G', fifaRank: 86, titles: 0, confederation: 'OFC' },
  // Group H
  { name: '西班牙', nameEn: 'Spain', group: 'H', fifaRank: 1, titles: 1, confederation: 'UEFA' },
  { name: '佛得角', nameEn: 'Cape Verde', group: 'H', fifaRank: 68, titles: 0, confederation: 'CAF' },
  { name: '沙特阿拉伯', nameEn: 'Saudi Arabia', group: 'H', fifaRank: 60, titles: 0, confederation: 'AFC' },
  { name: '乌拉圭', nameEn: 'Uruguay', group: 'H', fifaRank: 16, titles: 2, confederation: 'CONMEBOL' },
  // Group I
  { name: '法国', nameEn: 'France', group: 'I', fifaRank: 3, titles: 2, confederation: 'UEFA' },
  { name: '塞内加尔', nameEn: 'Senegal', group: 'I', fifaRank: 19, titles: 0, confederation: 'CAF' },
  { name: '伊拉克', nameEn: 'Iraq', group: 'I', fifaRank: 58, titles: 0, confederation: 'AFC' },
  { name: '挪威', nameEn: 'Norway', group: 'I', fifaRank: 29, titles: 0, confederation: 'UEFA' },
  // Group J
  { name: '阿根廷', nameEn: 'Argentina', group: 'J', fifaRank: 2, titles: 3, confederation: 'CONMEBOL' },
  { name: '阿尔及利亚', nameEn: 'Algeria', group: 'J', fifaRank: 35, titles: 0, confederation: 'CAF' },
  { name: '奥地利', nameEn: 'Austria', group: 'J', fifaRank: 24, titles: 0, confederation: 'UEFA' },
  { name: '约旦', nameEn: 'Jordan', group: 'J', fifaRank: 66, titles: 0, confederation: 'AFC' },
  // Group K
  { name: '葡萄牙', nameEn: 'Portugal', group: 'K', fifaRank: 6, titles: 0, confederation: 'UEFA' },
  { name: '刚果民主共和国', nameEn: 'DR Congo', group: 'K', fifaRank: 56, titles: 0, confederation: 'CAF' },
  { name: '乌兹别克斯坦', nameEn: 'Uzbekistan', group: 'K', fifaRank: 50, titles: 0, confederation: 'AFC' },
  { name: '哥伦比亚', nameEn: 'Colombia', group: 'K', fifaRank: 13, titles: 0, confederation: 'CONMEBOL' },
  // Group L
  { name: '英格兰', nameEn: 'England', group: 'L', fifaRank: 4, titles: 1, confederation: 'UEFA' },
  { name: '克罗地亚', nameEn: 'Croatia', group: 'L', fifaRank: 10, titles: 0, confederation: 'UEFA' },
  { name: '加纳', nameEn: 'Ghana', group: 'L', fifaRank: 72, titles: 0, confederation: 'CAF' },
  { name: '巴拿马', nameEn: 'Panama', group: 'L', fifaRank: 30, titles: 0, confederation: 'CONCACAF' },
];

// === Elo 风格实力分 (基于 FIFA 排名转换) ===
// 排名越高 → 实力分越高，使用对数映射
function rankToStrength(rank) {
  return 2000 - 12 * Math.log(rank) * Math.LOG10E * 100;
  // rank 1 → ~2000, rank 86 → ~1768
}

// 更简洁的映射: 排名1→2000, 排名100→1500
function rankToElo(rank) {
  return 2100 - 5.5 * rank;
}

// === 单场比赛胜率 (基于 Elo 差值) ===
// upsetFactor: 爆冷系数 0~1, 越高弱队越容易赢
function winProbability(eloA, eloB, upsetFactor) {
  const diff = eloA - eloB;
  // 标准 Elo 公式, 但用 upsetFactor 缩小差距
  const effectiveDiff = diff * (1 - upsetFactor * 0.7);
  return 1 / (1 + Math.pow(10, -effectiveDiff / 400));
}

// === 模拟单场比赛 ===
// 返回 { winner, loser } 或小组赛返回 { teamA, teamB, scoreA, scoreB }
function simulateMatch(teamA, teamB, upsetFactor) {
  const eloA = rankToElo(teamA.fifaRank);
  const eloB = rankToElo(teamB.fifaRank);
  const pA = winProbability(eloA, eloB, upsetFactor);
  // 小组赛有平局可能
  return Math.random() < pA ? teamA : teamB;
}

// 小组赛: 返回 { winner: 3分, draw: 各1分, loser: 0分 }
function simulateGroupMatch(teamA, teamB, upsetFactor) {
  const eloA = rankToElo(teamA.fifaRank);
  const eloB = rankToElo(teamB.fifaRank);
  const pA = winProbability(eloA, eloB, upsetFactor);
  // 平局概率约 25%，根据实力差距调整
  const drawProb = 0.25 - 0.05 * Math.abs(pA - 0.5);
  const r = Math.random();
  if (r < pA * (1 - drawProb)) return { a: 3, b: 0 };
  if (r < pA * (1 - drawProb) + drawProb) return { a: 1, b: 1 };
  return { a: 0, b: 3 };
}

// === 模拟小组赛 ===
function simulateGroup(groupTeams, upsetFactor) {
  const points = {};
  const goalDiff = {}; // 简化的净胜球用随机模拟
  groupTeams.forEach(t => { points[t.nameEn] = 0; goalDiff[t.nameEn] = 0; });

  // 4队循环赛: 6场比赛
  for (let i = 0; i < groupTeams.length; i++) {
    for (let j = i + 1; j < groupTeams.length; j++) {
      const result = simulateGroupMatch(groupTeams[i], groupTeams[j], upsetFactor);
      points[groupTeams[i].nameEn] += result.a;
      points[groupTeams[j].nameEn] += result.b;
      // 简化净胜球
      goalDiff[groupTeams[i].nameEn] += (result.a - result.b);
      goalDiff[groupTeams[j].nameEn] += (result.b - result.a);
    }
  }

  // 排序: 积分 > 净胜球 > FIFA排名
  const sorted = [...groupTeams].sort((a, b) => {
    if (points[b.nameEn] !== points[a.nameEn]) return points[b.nameEn] - points[a.nameEn];
    if (goalDiff[b.nameEn] !== goalDiff[a.nameEn]) return goalDiff[b.nameEn] - goalDiff[a.nameEn];
    return a.fifaRank - b.fifaRank;
  });

  // 2026 新赛制: 每组前2名 + 8个最佳第3名出线 (共32队进淘汰赛)
  return { first: sorted[0], second: sorted[1], third: sorted[2], fourth: sorted[3],
           thirdPoints: points[sorted[2].nameEn], thirdGD: goalDiff[sorted[2].nameEn] };
}

// === 模拟完整世界杯 ===
function simulateWorldCup(upsetFactor) {
  // 1. 小组赛
  const groups = {};
  TEAMS.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });

  const groupResults = {};
  const thirds = [];
  Object.keys(groups).sort().forEach(g => {
    groupResults[g] = simulateGroup(groups[g], upsetFactor);
    thirds.push({
      team: groupResults[g].third,
      points: groupResults[g].thirdPoints,
      gd: groupResults[g].thirdGD,
      group: g
    });
  });

  // 选出8个最佳第3名
  thirds.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return a.team.fifaRank - b.team.fifaRank;
  });
  const qualifiedThirds = thirds.slice(0, 8).map(t => t.team);

  // 2. 32强淘汰赛
  // 简化对阵: 1A vs 3rd, 2A vs 2B, 1B vs 3rd, ... 等
  // 实际对阵较复杂，这里用简化版
  const r32 = [];
  const groupKeys = Object.keys(groupResults).sort();
  // 每组第1名 vs 最佳第3名 (12场)
  // 每组第2名 vs 另一组第2名 (交叉, 4场)
  // 简化: 把32队分成上下半区随机配对
  const allQualified = [];
  groupKeys.forEach(g => {
    allQualified.push(groupResults[g].first);
    allQualified.push(groupResults[g].second);
  });
  qualifiedThirds.forEach(t => allQualified.push(t));

  // 简化淘汰赛: 按种子排列后配对
  allQualified.sort((a, b) => a.fifaRank - b.fifaRank);

  // 32强 → 16强 → 8强 → 4强 → 决赛
  let currentRound = [...allQualified];

  while (currentRound.length > 1) {
    const nextRound = [];
    for (let i = 0; i < currentRound.length; i += 2) {
      if (i + 1 < currentRound.length) {
        nextRound.push(simulateMatch(currentRound[i], currentRound[i + 1], upsetFactor));
      } else {
        nextRound.push(currentRound[i]); // 轮空
      }
    }
    currentRound = nextRound;
  }

  return currentRound[0]; // 冠军
}

// === 蒙特卡洛模拟 N 次世界杯 ===
function monteCarloSimulation(trials, upsetFactor) {
  const winCount = {};
  TEAMS.forEach(t => { winCount[t.nameEn] = 0; });

  for (let i = 0; i < trials; i++) {
    const champion = simulateWorldCup(upsetFactor);
    winCount[champion.nameEn]++;
  }

  // 转换为概率并排序
  const results = TEAMS.map(t => ({
    name: t.name,
    nameEn: t.nameEn,
    group: t.group,
    fifaRank: t.fifaRank,
    titles: t.titles,
    probability: Math.round((winCount[t.nameEn] / trials) * 10000) / 100
  })).sort((a, b) => b.probability - a.probability);

  return results;
}

// === 小组出线概率模拟 ===
function groupQualifySimulation(trials, upsetFactor) {
  const qualifyCount = {};
  TEAMS.forEach(t => { qualifyCount[t.nameEn] = 0; });

  const groups = {};
  TEAMS.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });

  for (let i = 0; i < trials; i++) {
    const thirds = [];
    Object.keys(groups).sort().forEach(g => {
      const result = simulateGroup(groups[g], upsetFactor);
      qualifyCount[result.first.nameEn]++;
      qualifyCount[result.second.nameEn]++;
      thirds.push({
        team: result.third,
        points: result.thirdPoints,
        gd: result.thirdGD
      });
    });
    thirds.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return a.team.fifaRank - b.team.fifaRank;
    });
    thirds.slice(0, 8).forEach(t => { qualifyCount[t.team.nameEn]++; });
  }

  return TEAMS.map(t => ({
    name: t.name,
    nameEn: t.nameEn,
    group: t.group,
    fifaRank: t.fifaRank,
    qualifyRate: Math.round((qualifyCount[t.nameEn] / trials) * 10000) / 100
  }));
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TEAMS, rankToElo, winProbability, simulateGroupMatch,
    simulateGroup, simulateWorldCup, monteCarloSimulation,
    groupQualifySimulation
  };
}
