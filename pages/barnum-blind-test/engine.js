const BARNUM_STATEMENTS = [
  "你外表看起来自信，但内心有时会自我怀疑",
  "你有时候会反思自己做的决定是否真的正确",
  "你渴望生活有所改变，但同时又害怕失去稳定",
  "你觉得别人并不完全了解真实的你",
  "你在某些方面有尚未被充分发掘的潜力",
  "你对自己要求比较严格，有时会因此感到压力",
  "你虽然社交圈不小，但真正能深入交流的人有限",
  "你在不同场合会表现出不同的性格特质",
  "你对未来有一些想法，但不太确定能否实现",
  "你偶尔会为一些小事感到困扰，事后又觉得没必要",
  "你内心深处渴望被他人认可和赞赏",
  "你有时候喜欢独处，但偶尔也会感到孤单",
  "你在做重要决定前会反复权衡利弊",
  "你有一些不愿轻易示人的想法或感受",
  "你整体上对自己的生活还算满意，但总觉得还能更好",
];

const GROUPS = {
  TAROT: 'tarot',
  RANDOM: 'random',
};

const GROUP_LABELS = {
  tarot: 'AI 塔罗分析',
  random: '随机生成文字',
};

/**
 * 使用 Seeded PRNG (mulberry32) 保证可复现的随机分组
 * 基于用户 session seed，确保同一用户不会跳组
 */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

var _sessionSeed = null;

/**
 * 生成用户会话种子
 * 优先使用 localStorage 中的持久化 seed，否则生成新 seed 并存储
 */
function getOrCreateSessionSeed() {
  let seed = null;
  try {
    seed = localStorage.getItem('barnum_session_seed');
  } catch (e) { /* localStorage unavailable */ }
  if (seed) return seed;
  if (_sessionSeed) return _sessionSeed;
  seed = String(Date.now()) + '_' + String(Math.random()).slice(2, 10);
  _sessionSeed = seed;
  try {
    localStorage.setItem('barnum_session_seed', seed);
  } catch (e) { /* localStorage unavailable */ }
  return seed;
}

/**
 * 根据 session seed 分配组别
 * @returns {'tarot'|'random'}
 */
function assignGroup() {
  const seed = getOrCreateSessionSeed();
  const rng = mulberry32(seedFromString(seed));
  return rng() < 0.5 ? GROUPS.TAROT : GROUPS.RANDOM;
}

/**
 * 获取指定数量的巴纳姆语句（随机顺序）
 * @param {number} count - 需要的语句数量（默认全部）
 * @returns {Array<{index: number, text: string}>}
 */
function getStatements(count) {
  const n = count || BARNUM_STATEMENTS.length;
  const indices = Array.from({ length: BARNUM_STATEMENTS.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, Math.min(n, BARNUM_STATEMENTS.length)).map(i => ({
    index: i,
    text: BARNUM_STATEMENTS[i],
  }));
}

/**
 * 计算单次测试的统计数据
 * @param {Array<{statementIndex: number, rating: number}>} ratings
 * @returns {{ total: number, avgRating: number, distribution: number[] }}
 */
function computeStats(ratings) {
  const total = ratings.length;
  if (total === 0) return { total: 0, avgRating: 0, distribution: [0, 0, 0, 0, 0] };
  const sum = ratings.reduce((s, r) => s + r.rating, 0);
  const distribution = [0, 0, 0, 0, 0];
  ratings.forEach(r => {
    if (r.rating >= 1 && r.rating <= 5) {
      distribution[r.rating - 1]++;
    }
  });
  return {
    total,
    avgRating: Math.round((sum / total) * 100) / 100,
    distribution,
  };
}

/**
 * 合并两组统计数据
 * @param {Object} groupAStats
 * @param {Object} groupBStats
 * @returns {{ tarotAvg: number, randomAvg: number, diff: number, diffPercent: number, tarotCount: number, randomCount: number }}
 */
function compareGroups(tarotStats, randomStats) {
  const tarotAvg = tarotStats.avgRating || 0;
  const randomAvg = randomStats.avgRating || 0;
  const diff = Math.round((tarotAvg - randomAvg) * 100) / 100;
  const diffPercent = randomAvg > 0 ? Math.round((diff / randomAvg) * 100) : 0;
  return {
    tarotAvg,
    randomAvg,
    diff,
    diffPercent,
    tarotCount: tarotStats.total || 0,
    randomCount: randomStats.total || 0,
  };
}

/**
 * 重置会话种子（仅用于测试）
 */
function resetSessionSeed() {
  _sessionSeed = null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
  };
}
