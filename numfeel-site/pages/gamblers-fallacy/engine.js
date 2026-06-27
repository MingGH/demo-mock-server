/**
 * engine.js — 赌徒错觉模拟器核心算法
 * 纯函数，不依赖 DOM，可在 Node.js 中直接 require 测试
 */

/**
 * 模拟单个赌徒的 n 局结果
 * 每局押当前资金的一半：赢则资金×winMul，输则×loseMul，各50%概率
 *
 * @param {number} initial - 初始资金
 * @param {number} rounds - 总局数
 * @param {number} winMul - 赢时乘数，默认 1.5
 * @param {number} loseMul - 输时乘数，默认 0.5
 * @param {function} rng - 随机数生成器，返回 [0,1)，默认 Math.random
 * @returns {{history: number[], wins: number, losses: number, finalCapital: number}}
 */
function simulateOne(initial, rounds, winMul, loseMul, rng) {
  var rand = rng || Math.random;
  winMul = winMul !== undefined ? winMul : 1.5;
  loseMul = loseMul !== undefined ? loseMul : 0.5;

  var capital = initial;
  var history = [capital];
  var wins = 0;
  var losses = 0;

  for (var i = 0; i < rounds; i++) {
    if (rand() < 0.5) {
      capital *= winMul;
      wins++;
    } else {
      capital *= loseMul;
      losses++;
    }
    history.push(capital);
  }

  return {
    history: history,
    wins: wins,
    losses: losses,
    finalCapital: capital
  };
}

/**
 * 模拟一群赌徒的最终资金分布
 *
 * @param {number} size - 人数
 * @param {number} rounds - 每人局数
 * @param {number} winMul - 赢时乘数
 * @param {number} loseMul - 输时乘数
 * @param {function} rng - 随机数生成器
 * @returns {{results: number[], sorted: number[], mean: number, median: number, geoMean: number, lost: number, gained: number, even: number, size: number, rounds: number}}
 */
function simulatePopulation(size, rounds, winMul, loseMul, rng) {
  var rand = rng || Math.random;
  winMul = winMul !== undefined ? winMul : 1.5;
  loseMul = loseMul !== undefined ? loseMul : 0.5;

  var results = [];
  for (var i = 0; i < size; i++) {
    var capital = 1;
    for (var j = 0; j < rounds; j++) {
      if (rand() < 0.5) {
        capital *= winMul;
      } else {
        capital *= loseMul;
      }
    }
    results.push(capital);
  }

  var sorted = results.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  var median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  var sum = 0;
  var logSum = 0;
  for (var k = 0; k < results.length; k++) {
    sum += results[k];
    if (results[k] > 0) {
      logSum += Math.log(results[k]);
    }
  }
  var mean = sum / size;
  var geoMean = Math.exp(logSum / size);

  var lost = 0, gained = 0, even = 0;
  for (var m = 0; m < results.length; m++) {
    if (results[m] < 0.99) lost++;
    else if (results[m] > 1.01) gained++;
    else even++;
  }

  return {
    results: results,
    sorted: sorted,
    mean: mean,
    median: median,
    geoMean: geoMean,
    lost: lost,
    gained: gained,
    even: even,
    size: size,
    rounds: rounds
  };
}

/**
 * 构建对数间隔的直方图
 * @param {number[]} results - 资金结果数组
 * @param {number} numBuckets - 桶数量，默认 30
 * @returns {{buckets: Array, maxCount: number}}
 */
function buildHistogram(results, numBuckets) {
  numBuckets = numBuckets || 30;

  var sorted = results.slice().sort(function (a, b) { return a - b; });
  var realMin = sorted[0];
  var realMax = sorted[sorted.length - 1];

  // 对数间隔，避免大部分数据挤在前几个桶
  var safeMin = Math.max(realMin, 0.00001);
  var safeMax = Math.max(realMax, 0.00002);
  var logMin = Math.log(safeMin);
  var logMax = Math.log(safeMax);
  var logStep = (logMax - logMin) / numBuckets;

  var buckets = [];
  var maxCount = 0;

  for (var i = 0; i < numBuckets; i++) {
    var bucketMin = Math.exp(logMin + i * logStep);
    var bucketMax = Math.exp(logMin + (i + 1) * logStep);
    var count = 0;
    for (var j = 0; j < results.length; j++) {
      if (i === numBuckets - 1) {
        if (results[j] >= bucketMin && results[j] <= bucketMax) count++;
      } else {
        if (results[j] >= bucketMin && results[j] < bucketMax) count++;
      }
    }
    if (count > maxCount) maxCount = count;
    buckets.push({
      min: bucketMin,
      max: bucketMax,
      count: count,
      label: bucketMin < 0.01 ? bucketMin.toFixed(4) : bucketMin < 1 ? bucketMin.toFixed(3) : bucketMin.toFixed(2)
    });
  }

  return { buckets: buckets, maxCount: maxCount, total: results.length };
}

/**
 * 计算理论值
 * @param {number} rounds - 局数
 * @param {number} winMul - 赢时乘数
 * @param {number} loseMul - 输时乘数
 * @returns {{arithPerRound: number, arithTotal: number, geoPerRound: number, geoTotal: number}}
 */
function computeTheoretical(rounds, winMul, loseMul) {
  var p = 0.5;
  var arithPerRound = p * winMul + (1 - p) * loseMul;
  var arithTotal = Math.pow(arithPerRound, rounds);
  var geoPerRound = Math.pow(winMul, p) * Math.pow(loseMul, 1 - p);
  var geoTotal = Math.pow(geoPerRound, rounds);

  return {
    arithPerRound: arithPerRound,
    arithTotal: arithTotal,
    geoPerRound: geoPerRound,
    geoTotal: geoTotal
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulateOne: simulateOne,
    simulatePopulation: simulatePopulation,
    buildHistogram: buildHistogram,
    computeTheoretical: computeTheoretical
  };
}
