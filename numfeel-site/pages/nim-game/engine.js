// ========== 尼姆游戏核心算法（可独立测试） ==========

/**
 * 计算所有堆的 XOR（尼姆和）
 * @param {number[]} piles - 各堆石子数
 * @returns {number} 尼姆和
 */
function nimSum(piles) {
  return piles.reduce((xor, p) => xor ^ p, 0);
}

/**
 * 判断当前局面是否为必胜态（对当前行动方）
 * 尼姆和 ≠ 0 时当前玩家有必胜策略
 * @param {number[]} piles
 * @returns {boolean}
 */
function isWinningPosition(piles) {
  return nimSum(piles) !== 0;
}

/**
 * AI 最优策略：找到一步使尼姆和变为 0 的走法
 * @param {number[]} piles
 * @returns {{ pile: number, take: number } | null} 最优走法，null 表示无必胜走法
 */
function findOptimalMove(piles) {
  const xor = nimSum(piles);
  if (xor === 0) return null; // 当前是必败态，无最优走法

  for (let i = 0; i < piles.length; i++) {
    const target = piles[i] ^ xor;
    if (target < piles[i]) {
      return { pile: i, take: piles[i] - target };
    }
  }
  return null;
}

/**
 * AI 随机走法（用于简单模式或必败态时）
 * @param {number[]} piles
 * @returns {{ pile: number, take: number }}
 */
function findRandomMove(piles) {
  const nonEmpty = [];
  for (let i = 0; i < piles.length; i++) {
    if (piles[i] > 0) nonEmpty.push(i);
  }
  if (nonEmpty.length === 0) return null;
  const pile = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
  const take = Math.floor(Math.random() * piles[pile]) + 1;
  return { pile, take };
}

/**
 * AI 决策：根据难度选择策略
 * @param {number[]} piles
 * @param {string} difficulty - 'easy' | 'normal' | 'hard'
 * @returns {{ pile: number, take: number }}
 */
function aiMove(piles, difficulty) {
  const optimal = findOptimalMove(piles);

  if (difficulty === 'easy') {
    // 简单模式：30% 概率走最优，70% 随机
    if (optimal && Math.random() < 0.3) return optimal;
    return findRandomMove(piles);
  }

  if (difficulty === 'normal') {
    // 普通模式：70% 概率走最优
    if (optimal && Math.random() < 0.7) return optimal;
    return findRandomMove(piles);
  }

  // 困难模式：100% 最优策略
  if (optimal) return optimal;
  return findRandomMove(piles); // 必败态时随机走
}

/**
 * 将数字转为二进制字符串（补齐到指定位数）
 * @param {number} n
 * @param {number} bits - 最少位数
 * @returns {string}
 */
function toBinary(n, bits) {
  const b = n.toString(2);
  return b.padStart(bits || 1, '0');
}

/**
 * 计算需要的二进制位数（取所有堆中最大值的位数）
 * @param {number[]} piles
 * @returns {number}
 */
function maxBits(piles) {
  const max = Math.max(...piles);
  if (max === 0) return 1;
  return Math.floor(Math.log2(max)) + 1;
}

/**
 * 生成初始堆配置
 * @param {string} preset - 'classic' | 'random' | 'simple'
 * @returns {number[]}
 */
function generatePiles(preset) {
  if (preset === 'classic') return [3, 5, 7];
  if (preset === 'simple') return [1, 2, 3];
  // random: 3~4 堆，每堆 2~9
  const count = 3 + Math.floor(Math.random() * 2);
  const piles = [];
  for (let i = 0; i < count; i++) {
    piles.push(2 + Math.floor(Math.random() * 8));
  }
  return piles;
}

/**
 * 判断游戏是否结束（所有堆为空）
 * @param {number[]} piles
 * @returns {boolean}
 */
function isGameOver(piles) {
  return piles.every(p => p === 0);
}

/**
 * 统计剩余石子总数
 * @param {number[]} piles
 * @returns {number}
 */
function totalStones(piles) {
  return piles.reduce((s, p) => s + p, 0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    nimSum, isWinningPosition, findOptimalMove, findRandomMove,
    aiMove, toBinary, maxBits, generatePiles, isGameOver, totalStones
  };
}
