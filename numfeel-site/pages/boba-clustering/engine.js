/**
 * 奶茶店扎堆：霍特林线性城市模型
 * Hotelling's Linear City Model - Core Logic
 *
 * 街道归一化为 [0, 1]，消费者均匀分布。
 * 每个消费者走到最近的店；相邻店铺以中点划分市场。
 *
 * 核心结论：
 *   - 2 家店的社会最优（最小化平均走路距离）是 [1/4, 3/4]
 *   - 2 家店的纳什均衡是 [1/2, 1/2]：都挤到正中间
 *   - 3 家及以上不存在纯策略纳什均衡（d'Aspremont et al., 1979）
 *
 * 参考：Hotelling, H. (1929). Stability in Competition. Economic Journal, 39(153), 41-57.
 */

'use strict';

/**
 * 计算每家店的市场份额。相邻店铺以中点划分；同位置店铺平分其共同占有的区间。
 * @param {number[]} positions - 店铺位置数组（0~1），顺序任意
 * @returns {number[]} 按输入顺序返回每家店的市场份额（0~1），总和为 1
 */
function marketShares(positions) {
  var n = positions.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  // 带原始索引排序
  var indexed = [];
  for (var i = 0; i < n; i++) indexed.push({ p: positions[i], i: i });
  indexed.sort(function (a, b) {
    if (a.p !== b.p) return a.p - b.p;
    return a.i - b.i;
  });
  var sorted = indexed.map(function (o) { return o.p; });

  var shares = new Array(n).fill(0);
  var k = 0;
  while (k < n) {
    // 找同位置组 [k, g)
    var g = k;
    while (g < n && sorted[g] === sorted[k]) g++;
    // 组左边界：与前一个不同位置的店的中点，或 0
    var lb = (k === 0) ? 0 : (sorted[k - 1] + sorted[k]) / 2;
    // 组右边界：与后一个不同位置的店的中点，或 1
    var rb = (g === n) ? 1 : (sorted[g - 1] + sorted[g]) / 2;
    var share = (rb - lb) / (g - k);
    for (var j = k; j < g; j++) shares[indexed[j].i] = share;
    k = g;
  }
  return shares;
}

/**
 * 计算消费者平均走路距离（社会成本）。用中点采样的数值积分近似。
 * @param {number[]} positions - 店铺位置数组
 * @param {number} [samples=2000] - 采样点数
 * @returns {number} 平均走路距离（0~0.5）
 */
function avgCustomerDistance(positions, samples) {
  samples = samples || 2000;
  if (positions.length === 0) return 0.5;
  var sorted = positions.slice().sort(function (a, b) { return a - b; });
  var total = 0;
  for (var s = 0; s < samples; s++) {
    var x = (s + 0.5) / samples;
    // 二分找最近店，n 小时直接遍历即可
    var minD = Infinity;
    for (var j = 0; j < sorted.length; j++) {
      var d = Math.abs(x - sorted[j]);
      if (d < minD) minD = d;
    }
    total += minD;
  }
  return total / samples;
}

/**
 * 给定其他店位置，计算店 i 的最优响应位置（使自身市场份额最大）。
 * 在 [0,1] 上密集搜索；最优响应通常是紧贴最近的邻居，这正是扎堆的来源。
 * @param {number[]} positions - 所有店当前位置
 * @param {number} i - 目标店索引
 * @returns {number} 最优位置（0~1）
 */
function bestResponse(positions, i) {
  var others = [];
  for (var idx = 0; idx < positions.length; idx++) {
    if (idx !== i) others.push(positions[idx]);
  }
  var numSteps = 500;
  var bestPos = positions[i];
  var bestShare = -1;

  function tryPos(p) {
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    var all = others.slice();
    all.push(p);
    var shares = marketShares(all);
    var share = shares[shares.length - 1]; // p 排在末尾
    if (share > bestShare + 1e-12) {
      bestShare = share;
      bestPos = p;
    }
  }

  // 网格搜索（用 s/numSteps 避免浮点累积）
  for (var s = 0; s <= numSteps; s++) {
    tryPos(s / numSteps);
  }
  // 紧贴每个竞争对手的候选位置（Hotelling 最优响应的本质）
  var eps = 0.005;
  for (var j = 0; j < others.length; j++) {
    tryPos(others[j] - eps);
    tryPos(others[j] + eps);
  }
  return bestPos;
}

/**
 * n 家店的社会最优位置（最小化平均走路距离）。
 * 解析解：均匀分布在各区段中点，位置 = (2k+1)/(2n)。
 * @param {number} n - 店铺数
 * @returns {number[]} 位置数组（升序）
 */
function socialOptimum(n) {
  if (n <= 0) return [];
  var positions = [];
  for (var k = 0; k < n; k++) positions.push((2 * k + 1) / (2 * n));
  return positions;
}

/**
 * 2 家店的纳什均衡位置（解析解）：都到正中间。
 * @returns {number[]} [0.5, 0.5]
 */
function nashEquilibrium2() {
  return [0.5, 0.5];
}

/**
 * 可复现的伪随机初始位置（LCG）。
 * @param {number} n - 店铺数
 * @param {number} [seed=42] - 随机种子
 * @returns {number[]} 位置数组
 */
function randomPositions(n, seed) {
  var s = seed || 42;
  var rand = function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  var arr = [];
  for (var i = 0; i < n; i++) arr.push(rand());
  return arr;
}

/**
 * 模拟博弈收敛过程：每轮所有店同时向各自最优响应移动（带学习率平滑）。
 * 2 家会收敛到 [0.5, 0.5]；3 家会持续追逐不收敛。
 * @param {number} n - 店铺数
 * @param {number} [rounds=40] - 迭代轮数
 * @param {number[]} [initialPositions] - 初始位置（默认随机）
 * @param {number} [lr=0.6] - 学习率（移动步长系数）
 * @returns {{history: number[][], converged: boolean, convergenceRound: number, finalPositions: number[]}}
 */
function simulateConvergence(n, rounds, initialPositions, lr) {
  rounds = rounds || 40;
  lr = lr === undefined ? 0.6 : lr;
  var positions = initialPositions ? initialPositions.slice() : randomPositions(n, 42);
  var history = [positions.slice()];
  var converged = false;
  var convRound = -1;

  for (var r = 0; r < rounds; r++) {
    var maxDelta = 0;
    if (n <= 2) {
      // 2 家：同时更新 + 学习率（平滑收敛到 [0.5, 0.5]）
      var newPositions = [];
      for (var i = 0; i < n; i++) {
        var br = bestResponse(positions, i);
        var np = positions[i] + lr * (br - positions[i]);
        if (np < 0) np = 0;
        if (np > 1) np = 1;
        newPositions.push(np);
        var delta = Math.abs(br - positions[i]);
        if (delta > maxDelta) maxDelta = delta;
      }
      positions = newPositions;
    } else {
      // 3 家及以上：顺序全步更新（展示追逐动态，无纯策略均衡）
      for (var i = 0; i < n; i++) {
        var br = bestResponse(positions, i);
        var delta = Math.abs(br - positions[i]);
        if (delta > maxDelta) maxDelta = delta;
        positions[i] = br;
      }
    }
    history.push(positions.slice());
    if (maxDelta < 0.002 && !converged) {
      // 验证是否真的是 Nash 均衡（3 家以上不应通过）
      var curShares = marketShares(positions);
      var isNash = true;
      for (var i = 0; i < n; i++) {
        var br = bestResponse(positions, i);
        var trial = positions.slice();
        trial[i] = br;
        if (marketShares(trial)[i] > curShares[i] + 0.001) {
          isNash = false;
          break;
        }
      }
      if (isNash) {
        converged = true;
        convRound = r + 1;
      }
    }
  }
  return { history: history, converged: converged, convergenceRound: convRound, finalPositions: positions };
}

/**
 * 线性城市模型是否存在纯策略纳什均衡。
 * 解析结论：1 家或 2 家存在；3 家及以上不存在（d'Aspremont et al., 1979）。
 * @param {number} n - 店铺数
 * @returns {boolean}
 */
function hasPureNashEquilibrium(n) {
  return n === 1 || n === 2;
}

/**
 * 对比「扎堆（纳什均衡）」与「分散（社会最优）」两种策略。
 * 3 家及以上无纯均衡，纳什侧用「全部挤到中间」展示扎堆极端情形。
 * @param {number} n - 店铺数
 * @returns {{nash: {positions, shares, avgDistance}, social: {positions, shares, avgDistance}, welfareLoss: number, hasPureEquilibrium: boolean}}
 */
function compareStrategies(n) {
  var social = socialOptimum(n);
  var socialShares = marketShares(social);
  var socialDist = avgCustomerDistance(social, 4000);

  var nashPositions;
  if (n === 2) {
    nashPositions = nashEquilibrium2();
  } else {
    nashPositions = [];
    for (var i = 0; i < n; i++) nashPositions.push(0.5);
  }
  var nashShares = marketShares(nashPositions);
  var nashDist = avgCustomerDistance(nashPositions, 4000);

  return {
    nash: { positions: nashPositions, shares: nashShares, avgDistance: nashDist },
    social: { positions: social, shares: socialShares, avgDistance: socialDist },
    welfareLoss: nashDist / socialDist,
    hasPureEquilibrium: hasPureNashEquilibrium(n)
  };
}

/**
 * 计算给定位置下市场份额的标准差，用于衡量"扎堆"导致的市场分配不均。
 * 完全分散时标准差较小；扎堆时若分到不同区位标准差也可能小。
 * 这里返回最大份额，用于直观展示"中间店吃掉大半市场"的现象。
 * @param {number[]} positions
 * @returns {{max: number, min: number, shares: number[]}}
 */
function shareInequality(positions) {
  var shares = marketShares(positions);
  var max = -Infinity, min = Infinity;
  for (var i = 0; i < shares.length; i++) {
    if (shares[i] > max) max = shares[i];
    if (shares[i] < min) min = shares[i];
  }
  return { max: max, min: min, shares: shares };
}

// Node.js 导出（兼容浏览器 <script> 与 Node 测试）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    marketShares: marketShares,
    avgCustomerDistance: avgCustomerDistance,
    bestResponse: bestResponse,
    socialOptimum: socialOptimum,
    nashEquilibrium2: nashEquilibrium2,
    randomPositions: randomPositions,
    simulateConvergence: simulateConvergence,
    hasPureNashEquilibrium: hasPureNashEquilibrium,
    compareStrategies: compareStrategies,
    shareInequality: shareInequality
  };
}
