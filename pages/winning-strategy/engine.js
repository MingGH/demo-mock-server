// ========== 必胜策略游戏核心算法（可独立测试） ==========

// ── 巴什博弈（Bash Game）──────────────────────────────────
// 规则：一堆 n 个石子，两人轮流取，每次取 1~m 个，取走最后一个的人赢
// 必胜条件：n % (m+1) !== 0 时先手必胜

function bashIsFirstWin(n, m) {
  return n % (m + 1) !== 0;
}

function bashOptimalTake(n, m) {
  var remainder = n % (m + 1);
  if (remainder === 0) return 0;
  return remainder;
}

function bashAiMove(n, m, difficulty) {
  var optimal = bashOptimalTake(n, m);
  var actualMax = Math.min(m, n);

  if (difficulty === 'hard') {
    return optimal > 0 ? optimal : (1 + Math.floor(Math.random() * actualMax));
  }
  if (difficulty === 'normal') {
    if (optimal > 0 && Math.random() < 0.6) return optimal;
    return 1 + Math.floor(Math.random() * actualMax);
  }
  return 1 + Math.floor(Math.random() * actualMax);
}


// ── 威佐夫博弈（Wythoff's Game）──────────────────────────
// 规则：两堆棋子(a,b)，轮流操作：
//   1) 从任意一堆取任意个（至少1个）
//   2) 从两堆同时取相同数量
//   取光全部棋子的人赢
// 冷局面：(⌊k·φ⌋, ⌊k·φ²⌋)，φ = (1+√5)/2

var PHI = (1 + Math.sqrt(5)) / 2;

function wythoffIsCold(a, b) {
  var small = Math.min(a, b);
  var big = Math.max(a, b);
  var diff = big - small;
  var expected = Math.floor(diff * PHI);
  return small === expected;
}

function wythoffColdPositions(count) {
  var positions = [];
  for (var k = 0; k < count; k++) {
    var a = Math.floor(k * PHI);
    var b = Math.floor(k * PHI * PHI);
    positions.push([a, b]);
  }
  return positions;
}

function wythoffFindOptimal(a, b) {
  if (wythoffIsCold(a, b)) return null;

  for (var newA = 0; newA < a; newA++) {
    if (wythoffIsCold(newA, b)) {
      return { type: 'takeA', toA: newA, toB: b };
    }
  }
  for (var newB = 0; newB < b; newB++) {
    if (wythoffIsCold(a, newB)) {
      return { type: 'takeB', toA: a, toB: newB };
    }
  }
  for (var k = 1; k <= Math.min(a, b); k++) {
    if (wythoffIsCold(a - k, b - k)) {
      return { type: 'takeBoth', toA: a - k, toB: b - k };
    }
  }
  return null;
}

function wythoffAiMove(a, b, difficulty) {
  var optimal = wythoffFindOptimal(a, b);

  if (difficulty === 'hard' && optimal) {
    return optimal;
  }
  if (difficulty === 'normal' && optimal && Math.random() < 0.6) {
    return optimal;
  }

  // 随机走法
  var moves = [];
  for (var i = 1; i <= a; i++) moves.push({ type: 'takeA', toA: a - i, toB: b });
  for (var j = 1; j <= b; j++) moves.push({ type: 'takeB', toA: a, toB: b - j });
  for (var k = 1; k <= Math.min(a, b); k++) moves.push({ type: 'takeBoth', toA: a - k, toB: b - k });
  return moves[Math.floor(Math.random() * moves.length)];
}


// ── 硬币翻转游戏（Coin Turning Game / Mock Turtles）────────
// 规则：一排 n 枚硬币，初始部分正面(H)部分反面(T)
//   每次操作：选一枚正面朝上的硬币翻成反面，
//   同时可以选择翻转它左边任意一枚硬币（正变反或反变正）
//   最后一个翻完所有正面的人赢
// 本质：每枚正面硬币的位置就是一个 Nim 堆，Grundy值=位置索引
// 必胜条件：所有正面硬币位置的 XOR ≠ 0

function coinNimValue(coins) {
  // coins: boolean[], true=正面(H), false=反面(T)
  // 每个正面硬币的 Grundy 值 = 其位置索引（0-based）
  var xor = 0;
  for (var i = 0; i < coins.length; i++) {
    if (coins[i]) xor ^= i;
  }
  return xor;
}

function coinIsFirstWin(coins) {
  return coinNimValue(coins) !== 0;
}

/**
 * 找硬币翻转的最优走法
 * @param {boolean[]} coins
 * @returns {{ flip: number, alsoFlip: number|null } | null}
 *   flip: 必须翻的那枚正面硬币（翻为反面）
 *   alsoFlip: 同时翻转的左边硬币索引（null 表示不额外翻）
 */
function coinFindOptimal(coins) {
  var xor = coinNimValue(coins);
  if (xor === 0) return null;

  // 尝试每个正面硬币
  for (var i = 0; i < coins.length; i++) {
    if (!coins[i]) continue; // 跳过反面

    // 只翻这一枚（相当于移除 Nim 堆 i）
    var newXor = xor ^ i; // 移除 i
    if (newXor === 0) {
      return { flip: i, alsoFlip: null };
    }

    // 同时翻左边某枚（索引 j < i）
    for (var j = 0; j < i; j++) {
      var afterXor;
      if (coins[j]) {
        // j 是正面 → 翻为反面 = 移除堆 j
        afterXor = xor ^ i ^ j;
      } else {
        // j 是反面 → 翻为正面 = 添加堆 j
        afterXor = xor ^ i ^ j;
      }
      if (afterXor === 0) {
        return { flip: i, alsoFlip: j };
      }
    }
  }
  return null;
}

function coinAiMove(coins, difficulty) {
  var optimal = coinFindOptimal(coins);

  if (difficulty === 'hard' && optimal) return optimal;
  if (difficulty === 'normal' && optimal && Math.random() < 0.6) return optimal;

  // 随机走法：随机选一枚正面翻
  var heads = [];
  for (var i = 0; i < coins.length; i++) {
    if (coins[i]) heads.push(i);
  }
  if (heads.length === 0) return null;

  var flip = heads[Math.floor(Math.random() * heads.length)];
  // 50% 概率额外翻左边一枚
  var alsoFlip = null;
  if (flip > 0 && Math.random() < 0.5) {
    alsoFlip = Math.floor(Math.random() * flip);
  }
  return { flip: flip, alsoFlip: alsoFlip };
}

/**
 * 生成随机初始硬币局面（保证至少有 2 个正面）
 * @param {number} n - 硬币总数
 * @returns {boolean[]}
 */
function coinGenerateInitial(n) {
  var coins = [];
  for (var i = 0; i < n; i++) {
    coins.push(Math.random() < 0.45);
  }
  // 确保至少 2 个正面
  var headCount = coins.filter(function(c) { return c; }).length;
  while (headCount < 2) {
    var idx = Math.floor(Math.random() * n);
    if (!coins[idx]) { coins[idx] = true; headCount++; }
  }
  return coins;
}


// ── 导出（Node.js 测试用） ────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    bashIsFirstWin: bashIsFirstWin,
    bashOptimalTake: bashOptimalTake,
    bashAiMove: bashAiMove,
    wythoffIsCold: wythoffIsCold,
    wythoffColdPositions: wythoffColdPositions,
    wythoffFindOptimal: wythoffFindOptimal,
    wythoffAiMove: wythoffAiMove,
    coinNimValue: coinNimValue,
    coinIsFirstWin: coinIsFirstWin,
    coinFindOptimal: coinFindOptimal,
    coinAiMove: coinAiMove,
    coinGenerateInitial: coinGenerateInitial,
    PHI: PHI
  };
}
