/**
 * 大脑随机性检测 — 核心算法模块
 * Brain Randomness — Core Logic
 *
 * 纯函数模块，不涉及 DOM。通过 CommonJS 导出供 Node 测试使用。
 * 所有统计检验针对 1-9 的整数序列。
 */

// ========== 统计工具函数（模块内部使用，不导出） ==========

/**
 * 计算数组均值
 */
function mean(arr) {
  if (!arr.length) return 0;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

/**
 * 计算数组方差（总体方差，除以 n）
 */
function variance(arr) {
  if (!arr.length) return 0;
  var m = mean(arr);
  var s = 0;
  for (var i = 0; i < arr.length; i++) {
    var d = arr[i] - m;
    s += d * d;
  }
  return s / arr.length;
}

/**
 * 标准正态累积分布函数（Abramowitz and Stegun 近似）
 * 最大误差 < 7.5e-8
 */
function normalCDF(z) {
  var a1 = 0.254829592;
  var a2 = -0.284496736;
  var a3 = 1.421413741;
  var a4 = -1.453152027;
  var a5 = 1.061405429;
  var p = 0.3275911;

  var sign = z < 0 ? -1 : 1;
  var x = Math.abs(z) / Math.sqrt(2);
  var t = 1 / (1 + p * x);
  var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * 卡方分布累积分布函数（Wilson-Hilferty 近似）
 * 输入统计量 x 与自由度 df，返回 P(X <= x)
 */
function chiSquareCDF(x, df) {
  if (df <= 0) return 0;
  if (x <= 0) return 0;
  // Wilson-Hilferty 变换：将卡方转为近似标准正态
  var h = 2 / (9 * df);
  var z = (Math.pow(x / df, 1 / 3) - (1 - h)) / Math.sqrt(h);
  return normalCDF(z);
}

/**
 * 由卡方统计量求上尾 p 值：p = P(X > x) = 1 - CDF
 */
function chiSquarePValue(x, df) {
  var p = 1 - chiSquareCDF(x, df);
  // 防止浮点误差导致 p 为负或 > 1
  if (p < 0) p = 0;
  if (p > 1) p = 1;
  return p;
}

/**
 * 把 p 值保留 4 位小数
 */
function roundP(p) {
  return Math.round(p * 10000) / 10000;
}

// ========== 生成真随机对照序列 ==========

/**
 * 生成真随机对照序列（用于可视化对比）
 * 用 Math.random() 生成均匀分布的整数序列。
 * @param {number} length
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
function generateTrueRandom(length, min, max) {
  if (length <= 0) return [];
  var range = max - min + 1;
  var arr = [];
  for (var i = 0; i < length; i++) {
    arr.push(Math.floor(Math.random() * range) + min);
  }
  return arr;
}

// ========== 年龄-随机力曲线 ==========

/**
 * 年龄-随机力曲线数据（基于 Zenil et al. 2017 论文的近似拟合）
 * 曲线形状：
 *   - 4-25 岁上升
 *   - 25 岁峰值（score ≈ 85）
 *   - 25-60 岁缓慢下降
 *   - 60 岁后加速下降
 * 用分段混合函数拟合，返回 ages[] 与 scores[]。
 * @returns {{ ages: number[], scores: number[] }}
 */
function getAgeCurveData() {
  var ages = [];
  var scores = [];
  for (var a = 4; a <= 91; a++) {
    ages.push(a);
    var s;
    if (a <= 25) {
      // 上升段：4岁≈40 → 25岁≈85，用 0.8 次幂让早期增长稍快
      var t = (a - 4) / 21; // 0..1
      s = 40 + 45 * Math.pow(t, 0.8);
    } else {
      // 下降段：25岁=85，越往后加速下降，用 1.8 次幂
      var d = a - 25;
      s = 85 - 0.0324 * Math.pow(d, 1.8);
    }
    if (s < 0) s = 0;
    if (s > 100) s = 100;
    scores.push(Math.round(s));
  }
  return { ages: ages, scores: scores };
}

// ========== 频率均匀性检验 ==========

/**
 * 频率均匀性检验 — 卡方拟合优度检验
 * 对 1-9 的数字序列检验各数字出现频率是否均匀。
 * - 期望频率 = seq.length / 9
 * - 卡方统计量 = Σ (observed - expected)² / expected
 * - 自由度 = 8
 * - isRandom: p > 0.05
 * @param {number[]} seq - 用户输入的数字序列（1-9）
 * @returns {{ chiSquare: number, pValue: number, expected: number[], observed: number[], isRandom: boolean }}
 */
function frequencyTest(seq) {
  // 边界处理：序列太短不报错，返回默认值
  if (!seq || seq.length < 10) {
    var emptyObserved = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    return {
      chiSquare: 0,
      pValue: 1,
      expected: emptyObserved.slice(),
      observed: emptyObserved.slice(),
      isRandom: true
    };
  }

  // 统计 1-9 各数字出现次数（非法值忽略）
  var observed = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // 索引 0..8 对应数字 1..9
  var valid = 0;
  for (var i = 0; i < seq.length; i++) {
    var v = seq[i];
    if (v >= 1 && v <= 9) {
      observed[v - 1]++;
      valid++;
    }
  }

  var expectedCount = valid / 9;
  var expected = [];
  for (var k = 0; k < 9; k++) expected.push(expectedCount);

  var chiSquare = 0;
  if (expectedCount > 0) {
    for (var j = 0; j < 9; j++) {
      var diff = observed[j] - expectedCount;
      chiSquare += (diff * diff) / expectedCount;
    }
  }

  var pValue = roundP(chiSquarePValue(chiSquare, 8));
  return {
    chiSquare: Math.round(chiSquare * 10000) / 10000,
    pValue: pValue,
    expected: expected,
    observed: observed,
    isRandom: pValue > 0.05
  };
}

// ========== 游程检验 ==========

/**
 * 游程检验（Runs Test）— 检测序列中连续相同/交替的模式是否符合随机预期
 * - 交替次数 = 相邻两个数不同的次数
 * - alternationRate = 交替次数 / (seq.length - 1)
 * - 真随机期望交替率：8/9 ≈ 0.889
 * - z 分数与 p 值基于正态近似
 * - isRandom: |z| < 1.96
 * @param {number[]} seq
 * @returns {{ runs: number, expectedRuns: number, zScore: number, pValue: number, isRandom: boolean, alternationRate: number }}
 */
function runsTest(seq) {
  var n = seq ? seq.length : 0;
  // 边界处理
  if (n < 2) {
    return {
      runs: n > 0 ? 1 : 0,
      expectedRuns: 0,
      zScore: 0,
      pValue: 1,
      isRandom: true,
      alternationRate: 0
    };
  }

  // 统计相邻不同的次数（交替次数）
  var alternations = 0;
  for (var i = 1; i < n; i++) {
    if (seq[i] !== seq[i - 1]) alternations++;
  }
  var alternationRate = alternations / (n - 1);

  // 游程数 = 交替段数 = 交替次数 + 1
  var runs = alternations + 1;

  // 对 1-9 均匀分布，相邻不同的概率 p = 8/9
  var p = 8 / 9;
  var expectedRuns = 1 + (n - 1) * p;

  // 正态近似：交替率 ~ N(p, p(1-p)/(n-1))
  var denom = Math.sqrt((p * (1 - p)) / (n - 1));
  var zScore = denom > 0 ? (alternationRate - p) / denom : 0;
  if (!isFinite(zScore)) zScore = 0;

  var pValue = roundP(2 * (1 - normalCDF(Math.abs(zScore))));
  return {
    runs: runs,
    expectedRuns: Math.round(expectedRuns * 100) / 100,
    zScore: Math.round(zScore * 10000) / 10000,
    pValue: pValue,
    isRandom: Math.abs(zScore) < 1.96,
    alternationRate: Math.round(alternationRate * 10000) / 10000
  };
}

// ========== 相邻差分析 ==========

/**
 * 相邻差分析 — 检测是否过度避免重复/过度交替
 * - avgGap: 相邻两数绝对差的平均值
 * - expectedAvgGap: 对 1-9 均匀分布，随机选两个数的期望绝对差 = 80/27 ≈ 2.963
 * - repetitionRate: 相邻两数相同的比例（期望 = 1/9 ≈ 0.111）
 * - maxStreak: 最长连续相同数字
 * @param {number[]} seq
 * @returns {{ avgGap: number, expectedAvgGap: number, repetitionRate: number, maxStreak: number }}
 */
function adjacencyAnalysis(seq) {
  var n = seq ? seq.length : 0;
  var EXPECTED_AVG_GAP = 80 / 27; // ≈ 2.963
  var EXPECTED_REPETITION = 1 / 9; // ≈ 0.111

  if (n < 2) {
    return {
      avgGap: 0,
      expectedAvgGap: EXPECTED_AVG_GAP,
      repetitionRate: 0,
      maxStreak: n > 0 ? 1 : 0
    };
  }

  var gapSum = 0;
  var sameCount = 0;
  var maxStreak = 1;
  var currentStreak = 1;

  for (var i = 1; i < n; i++) {
    var diff = Math.abs(seq[i] - seq[i - 1]);
    gapSum += diff;
    if (seq[i] === seq[i - 1]) {
      sameCount++;
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  var avgGap = gapSum / (n - 1);
  var repetitionRate = sameCount / (n - 1);

  return {
    avgGap: Math.round(avgGap * 10000) / 10000,
    expectedAvgGap: Math.round(EXPECTED_AVG_GAP * 10000) / 10000,
    repetitionRate: Math.round(repetitionRate * 10000) / 10000,
    maxStreak: maxStreak
  };
}

// ========== 自相关分析 ==========

/**
 * 自相关分析 — 检测序列是否有隐藏周期性
 * - 计算 lag 1 到 lag maxLag 的自相关系数
 * - r(k) = Cov(x_t, x_{t+k}) / Var(x_t)
 * - hasPattern: 如果任何 |r(k)| > 2/√n 则认为有显著周期性
 * @param {number[]} seq
 * @param {number} maxLag - 最大滞后阶数，默认 10
 * @returns {{ autocorrelations: number[], hasPattern: boolean }}
 */
function autocorrelationTest(seq, maxLag) {
  var n = seq ? seq.length : 0;
  if (maxLag === undefined || maxLag === null) maxLag = 10;
  if (maxLag < 1) maxLag = 1;

  // 边界处理：序列太短不足以计算有意义的自相关
  if (n < 5) {
    var empty = [];
    for (var e = 0; e < maxLag; e++) empty.push(0);
    return { autocorrelations: empty, hasPattern: false };
  }

  // 限制 maxLag 不超过 n-1
  var usableLag = Math.min(maxLag, n - 1);
  var m = mean(seq);
  var v = variance(seq);

  var autocorrelations = [];
  // 单 lag 显著性阈值用 2/√n；但为降低多重比较的误报，
  // 判定"有周期"需要：至少 2 个 lag 超过 2/√n，或单个 lag 超过更严格的 3/√n
  var threshold = 2 / Math.sqrt(n);
  var strictThreshold = 3 / Math.sqrt(n);
  var exceedCount = 0;
  var hasPattern = false;
  var maxAbs = 0;

  // 方差为 0（常数序列）= 最强周期性
  if (v === 0 && n >= 5) {
    hasPattern = true;
  }

  for (var k = 1; k <= maxLag; k++) {
    var r = 0;
    if (k > usableLag || v === 0) {
      r = 0;
    } else {
      var covSum = 0;
      var pairs = n - k;
      for (var i = 0; i < pairs; i++) {
        covSum += (seq[i] - m) * (seq[i + k] - m);
      }
      // 用整体方差归一（除以 n * Var），保持与 Cov/Var 定义一致
      r = covSum / (n * v);
    }
    if (!isFinite(r)) r = 0;
    if (r > 1) r = 1;
    if (r < -1) r = -1;
    autocorrelations.push(Math.round(r * 10000) / 10000);
    if (Math.abs(r) > maxAbs) maxAbs = Math.abs(r);
    if (Math.abs(r) > threshold) exceedCount++;
    if (Math.abs(r) > strictThreshold) hasPattern = true;
  }
  // 多个 lag 同时超过阈值也判为有周期
  if (exceedCount >= 2) hasPattern = true;

  return { autocorrelations: autocorrelations, hasPattern: hasPattern };
}

// ========== 扑克检验 ==========

/**
 * 扑克检验（Poker Test）— 将序列分组后检查模式多样性
 * - 将序列分为长度为 groupSize 的非重叠组
 * - 统计每组的"不同值个数"：3个不同 / 有一对 / 三个相同
 * - 与理论概率比较，做卡方检验（自由度 = 类别数 - 1）
 * 对 1-9 范围，groupSize=3:
 *   P(三个不同) = 9×8×7 / 9³ ≈ 0.6914
 *   P(有一对)   = 9×8×3 / 9³  ≈ 0.2963
 *   P(三个相同) = 9 / 9³       ≈ 0.0123
 * @param {number[]} seq
 * @param {number} groupSize - 分组长度，默认 3
 * @returns {{ patterns: Map<string, number>, chiSquare: number, pValue: number, isRandom: boolean }}
 */
function pokerTest(seq, groupSize) {
  if (groupSize === undefined || groupSize === null) groupSize = 3;
  if (groupSize < 2) groupSize = 2;

  var n = seq ? seq.length : 0;
  var numGroups = Math.floor(n / groupSize);

  // 边界处理
  if (numGroups < 1) {
    return {
      patterns: new Map(),
      chiSquare: 0,
      pValue: 1,
      isRandom: true
    };
  }

  // 理论概率（仅对 groupSize=3 精确给出；其它分组用经验近似）
  var theory;
  if (groupSize === 3) {
    var total9 = 9 * 9 * 9; // 729
    theory = {
      allDifferent: (9 * 8 * 7) / total9, // 504/729 ≈ 0.6914
      onePair: (9 * 8 * 3) / total9,       // 216/729 ≈ 0.2963
      allSame: 9 / total9                   // 9/729 ≈ 0.0123
    };
  } else {
    // 通用近似：组内不同值个数的分布用生日问题近似
    theory = computeGenericPokerTheory(groupSize);
  }

  var counts = { allDifferent: 0, onePair: 0, allSame: 0 };
  // 仅 groupSize=3 用三类；其它分组也归并到这三类语义（全不同/有重复/全相同）
  for (var g = 0; g < numGroups; g++) {
    var group = seq.slice(g * groupSize, g * groupSize + groupSize);
    var uniq = {};
    for (var x = 0; x < group.length; x++) uniq[group[x]] = true;
    var distinct = Object.keys(uniq).length;
    if (distinct === group.length) {
      counts.allDifferent++;
    } else if (distinct === 1) {
      counts.allSame++;
    } else {
      counts.onePair++;
    }
  }

  // 卡方检验
  var chiSquare = 0;
  var categories = ['allDifferent', 'onePair', 'allSame'];
  for (var c = 0; c < categories.length; c++) {
    var key = categories[c];
    var exp = theory[key] * numGroups;
    if (exp > 0) {
      var d = counts[key] - exp;
      chiSquare += (d * d) / exp;
    }
  }

  var df = categories.length - 1; // 2
  var pValue = roundP(chiSquarePValue(chiSquare, df));

  var patterns = new Map();
  patterns.set('allDifferent', counts.allDifferent);
  patterns.set('onePair', counts.onePair);
  patterns.set('allSame', counts.allSame);

  return {
    patterns: patterns,
    chiSquare: Math.round(chiSquare * 10000) / 10000,
    pValue: pValue,
    isRandom: pValue > 0.05
  };
}

/**
 * 通用分组理论概率近似（groupSize ≠ 3 时使用）
 * 归并到三类：全不同 / 有重复（含一对）/ 全相同
 */
function computeGenericPokerTheory(groupSize) {
  var m = 9; // 数字范围 1-9
  // 全相同概率：m / m^groupSize
  var allSame = m / Math.pow(m, groupSize);
  // 全不同概率：m * (m-1) * ... * (m - groupSize + 1) / m^groupSize
  var allDifferent = 1;
  for (var i = 0; i < groupSize; i++) allDifferent *= (m - i) / m;
  // 有重复（中间情况）
  var onePair = 1 - allSame - allDifferent;
  if (onePair < 0) onePair = 0;
  return { allDifferent: allDifferent, onePair: onePair, allSame: allSame };
}

// ========== 综合评分 ==========

/**
 * 综合评分 — 综合以上指标给出 0-100 的大脑随机力得分
 *
 * 扣分项：
 *   频率偏差（0-25） + 交替率偏差（0-25） + 自相关（0-20）
 *   + 重复回避（0-15） + 扑克检验（0-15）
 *
 * 等级：S(90-100) / A(75-89) / B(55-74) / C(35-54) / D(0-34)
 * ageEquivalent：基于 Zenil 2017 曲线近似，用平滑函数映射
 * @param {number[]} seq
 * @returns {{ score: number, grade: string, details: object, ageEquivalent: number }}
 */
function calculateRandomnessScore(seq) {
  var n = seq ? seq.length : 0;

  // 序列太短：给出明确的低分与提示
  if (n < 10) {
    return {
      score: 0,
      grade: 'D',
      details: {
        note: '序列太短（不足10个），无法可靠分析，请至少输入 10 个数字',
        length: n
      },
      ageEquivalent: 85
    };
  }

  // 调用各检验
  var freq = frequencyTest(seq);
  var runs = runsTest(seq);
  var adj = adjacencyAnalysis(seq);
  var auto = autocorrelationTest(seq, 10);
  var poker = pokerTest(seq, 3);

  // 卡方 95% 临界值与期望值
  var CHI95_DF8 = 15.507;  // df=8
  var CHI_EXP_DF8 = 8;     // df=8 的卡方期望值
  var CHI95_DF2 = 5.991;   // df=2
  var CHI_EXP_DF2 = 2;     // df=2 的卡方期望值
  var EXPECTED_ALT = 8 / 9;       // 0.889
  var EXPECTED_ALT_SD = 1 / 9;    // 0.111
  var EXPECTED_REP = 1 / 9;       // 0.111

  // 1) 频率偏差扣分（0-25）：按超出期望值的程度线性放大
  //    卡方在期望值(8)以下视为正常波动不扣分，达到 95% 临界值扣满
  var freqExcess = Math.max(0, freq.chiSquare - CHI_EXP_DF8);
  var frequencyPenalty = Math.min(25, (freqExcess / (CHI95_DF8 - CHI_EXP_DF8)) * 25);

  // 2) 交替率偏差扣分（0-25）：允许 ±0.03 的统计噪声，超出部分线性放大
  var altDev = Math.abs(runs.alternationRate - EXPECTED_ALT);
  var altExcess = Math.max(0, altDev - 0.03);
  var alternationPenalty = Math.min(25, (altExcess / 0.10) * 25);

  // 3) 自相关扣分（0-20）：按最大自相关绝对值渐增，常数序列直接扣满
  var maxAuto = 0;
  for (var i = 0; i < auto.autocorrelations.length; i++) {
    var a = Math.abs(auto.autocorrelations[i]);
    if (a > maxAuto) maxAuto = a;
  }
  var autoPenalty;
  if (auto.hasPattern) {
    // 有显著周期：按 maxAuto 渐增，但至少 10 分
    autoPenalty = Math.max(10, Math.min(20, maxAuto * 25));
  } else {
    autoPenalty = Math.min(20, maxAuto * 25);
  }

  // 4) 重复回避扣分（0-15）：重复率显著低于期望说明过度回避
  //    同时对过度重复（远高于期望）也适当扣分
  var repetitionPenalty = 0;
  if (adj.repetitionRate < EXPECTED_REP / 2) {
    repetitionPenalty = 15;
  } else if (adj.repetitionRate > EXPECTED_REP * 3) {
    repetitionPenalty = Math.min(15, (adj.repetitionRate - EXPECTED_REP * 3) * 60);
  }

  // 5) 扑克检验扣分（0-15）：按超出期望值的程度线性放大
  var pokerExcess = Math.max(0, poker.chiSquare - CHI_EXP_DF2);
  var pokerPenalty = Math.min(15, (pokerExcess / (CHI95_DF2 - CHI_EXP_DF2)) * 15);

  var totalPenalty = frequencyPenalty + alternationPenalty + autoPenalty +
                     repetitionPenalty + pokerPenalty;
  var score = Math.max(0, Math.round(100 - totalPenalty));

  // 等级
  var grade;
  if (score >= 90) grade = 'S';
  else if (score >= 75) grade = 'A';
  else if (score >= 55) grade = 'B';
  else if (score >= 35) grade = 'C';
  else grade = 'D';

  // 等效年龄：平滑映射，峰值约 25 岁
  var ageEquivalent = Math.round(25 + 60 * Math.pow(1 - score / 100, 1.5));
  if (ageEquivalent < 4) ageEquivalent = 4;
  if (ageEquivalent > 91) ageEquivalent = 91;

  // 生成人话解释
  var issues = [];
  if (!runs.isRandom && runs.alternationRate > EXPECTED_ALT + 0.05) {
    issues.push('你切换得太频繁了，连续出现同一数字时你本能地回避');
  } else if (!runs.isRandom && runs.alternationRate < EXPECTED_ALT - 0.05) {
    issues.push('你重复得太多了，真随机会更频繁地切换');
  }
  if (repetitionPenalty > 0) {
    issues.push('你过度回避重复，真随机里相邻相同其实很常见');
  }
  if (!freq.isRandom) {
    issues.push('某些数字出现得明显偏多或偏少');
  }
  if (auto.hasPattern) {
    issues.push('序列里有隐藏的周期性，像在循环');
  }
  if (!poker.isRandom) {
    issues.push('三连分组里模式太单一');
  }
  var summary = issues.length ? issues.join('；') + '。' : '没有明显偏差，接近真随机。';

  var details = {
    frequency: freq,
    runs: runs,
    adjacency: adj,
    autocorrelation: auto,
    poker: poker,
    penalties: {
      frequency: Math.round(frequencyPenalty * 10) / 10,
      alternation: Math.round(alternationPenalty * 10) / 10,
      autocorrelation: Math.round(autoPenalty * 10) / 10,
      repetition: Math.round(repetitionPenalty * 10) / 10,
      poker: Math.round(pokerPenalty * 10) / 10
    },
    summary: summary,
    length: n
  };

  return {
    score: score,
    grade: grade,
    details: details,
    ageEquivalent: ageEquivalent
  };
}

// ========== CommonJS 导出（供 Node 测试用） ==========
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    frequencyTest: frequencyTest,
    runsTest: runsTest,
    adjacencyAnalysis: adjacencyAnalysis,
    autocorrelationTest: autocorrelationTest,
    pokerTest: pokerTest,
    calculateRandomnessScore: calculateRandomnessScore,
    generateTrueRandom: generateTrueRandom,
    getAgeCurveData: getAgeCurveData
  };
}
