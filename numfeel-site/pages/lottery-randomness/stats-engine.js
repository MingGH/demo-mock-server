/**
 * stats-engine.js — 双色球随机性统计检验引擎
 *
 * 纯函数实现，不依赖 DOM。支持浏览器 <script> 与 Node.js require 双模式。
 * 运行测试：node pages/lottery-randomness/stats-engine.test.js
 */
(function (global) {
  'use strict';

  // ── 基础数学：组合数、erf、正态 CDF ──────────────────────────

  /** 计算组合数 C(n, k)。 */
  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var res = 1;
    for (var i = 0; i < k; i++) {
      res = res * (n - i) / (i + 1);
    }
    return Math.round(res);
  }

  /** Abramowitz & Stegun 7.1.26 erf 近似（最大误差 ~1.5e-7）。 */
  function erf(x) {
    if (x < 0) return -erf(-x);
    var t = 1 / (1 + 0.3275911 * x);
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
    var poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
    return 1 - poly * Math.exp(-x * x);
  }

  /** 标准正态分布 CDF Φ(z)。 */
  function normalCdf(z) {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
  }

  /** 标准正态右尾分位数：给定上侧概率 α，返回 z。 */
  var Z_TABLE = {
    0.10: 1.2816, 0.05: 1.6449, 0.025: 1.9600, 0.01: 2.3263, 0.005: 2.5758
  };
  function zQuantile(alpha) {
    return Z_TABLE[alpha] != null ? Z_TABLE[alpha] : 1.6449;
  }

  // ── 卡方检验 ─────────────────────────────────────────

  /**
   * 卡方拟合优度检验。observed、expected 为等长数组。
   * @returns {chiSquare, df, criticalValue, pApprox, isRandom}
   */
  function chiSquareTest(observed, expected) {
    var chi = 0;
    var df = 0;
    for (var i = 0; i < observed.length; i++) {
      var e = expected[i];
      if (e != null && e > 0) {
        chi += Math.pow(observed[i] - e, 2) / e;
        df++;
      }
    }
    df = Math.max(df - 1, 1);

    // Wilson-Hilferty 近似临界值：χ²_α ≈ df * (1 - 2/(9df) + z_α * sqrt(2/(9df)))^3
    var zA = zQuantile(0.05);
    var term = 1 - 2 / (9 * df) + zA * Math.sqrt(2 / (9 * df));
    var cv = df * Math.pow(term, 3);

    // 近似 p 值
    var pApprox = chiSquarePValue(chi, df);

    return {
      chiSquare: chi,
      df: df,
      criticalValue: cv,
      pApprox: pApprox,
      isRandom: chi <= cv
    };
  }

  /** 卡方分布右尾 p 值近似（Wilson-Hilferty 反向）。 */
  function chiSquarePValue(chi, df) {
    if (df <= 0 || chi <= 0) return 1;
    var z = (Math.pow(chi / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
    return Math.max(0, Math.min(1, 1 - normalCdf(z)));
  }

  // ── 频率统计 ──────────────────────────────────────────

  /** 统计 33 个红球号码各自出现次数，返回 {ballNumber: count}。 */
  function countRedFrequencies(data) {
    var counts = {};
    for (var i = 1; i <= 33; i++) counts[i] = 0;
    for (var i = 0; i < data.length; i++) {
      var red = data[i].red;
      for (var k = 0; k < red.length; k++) {
        counts[red[k]] = (counts[red[k]] || 0) + 1;
      }
    }
    return counts;
  }

  /** 统计 16 个蓝球号码各自出现次数。 */
  function countBlueFrequencies(data) {
    var counts = {};
    for (var i = 1; i <= 16; i++) counts[i] = 0;
    for (var i = 0; i < data.length; i++) {
      var b = data[i].blue;
      counts[b] = (counts[b] || 0) + 1;
    }
    return counts;
  }

  // ── 卡方检验便捷封装 ──────────────────────────────────

  /** 对红球频率做卡方检验，返回 chiSquareTest 结果 + observed/expected。 */
  function redChiSquare(data) {
    var counts = countRedFrequencies(data);
    var observed = [];
    var expected = [];
    var total = 0;
    for (var i = 1; i <= 33; i++) total += counts[i];
    var per = total / 33;
    for (var j = 1; j <= 33; j++) {
      observed.push(counts[j]);
      expected.push(per);
    }
    var r = chiSquareTest(observed, expected);
    r.observed = observed;
    r.expected = expected;
    r.total = total;
    return r;
  }

  /** 对蓝球频率做卡方检验。 */
  function blueChiSquare(data) {
    var counts = countBlueFrequencies(data);
    var observed = [];
    var expected = [];
    var total = 0;
    for (var i = 1; i <= 16; i++) total += counts[i];
    var per = total / 16;
    for (var j = 1; j <= 16; j++) {
      observed.push(counts[j]);
      expected.push(per);
    }
    var r = chiSquareTest(observed, expected);
    r.observed = observed;
    r.expected = expected;
    r.total = total;
    return r;
  }

  // ── 游程检验 ──────────────────────────────────────────

  /** 对 0/1 序列做游程检验（Wald-Wolfowitz）。 */
  function runsTest(seq) {
    var n1 = 0, n0 = 0;
    var runs = 0;
    if (seq.length > 0) runs = 1;
    for (var i = 0; i < seq.length; i++) {
      if (seq[i] === 1) n1++;
      else n0++;
      if (i > 0 && seq[i] !== seq[i - 1]) runs++;
    }
    var n = n1 + n0;
    if (n < 2) {
      return { runs: runs, expectedRuns: runs, z: 0, isRandom: true, n1: n1, n0: n0, sigma: 0 };
    }
    var mu = 2 * n1 * n0 / n + 1;
    var num = 2 * n1 * n0 * (2 * n1 * n0 - n);
    var den = n * n * (n - 1);
    var sigma2 = den > 0 ? num / den : 0;
    var sigma = Math.sqrt(Math.max(sigma2, 0));
    var z;
    if (sigma === 0) {
      // 全 0 或全 1 退化情形：不可计算 Z，定性为「无趋势信息」
      z = 0;
    } else {
      z = (runs - mu) / sigma;
    }
    return {
      runs: runs,
      expectedRuns: mu,
      z: z,
      sigma: sigma,
      isRandom: Math.abs(z) <= 1.96,
      n1: n1,
      n0: n0
    };
  }

  /** 生成某号码的「出现/未出现」0/1 时序序列。type: 'red' | 'blue'。 */
  function generateBinarySequence(data, ballNumber, type) {
    var seq = [];
    for (var i = 0; i < data.length; i++) {
      if (type === 'blue') {
        seq.push(data[i].blue === ballNumber ? 1 : 0);
      } else {
        var red = data[i].red;
        var has = false;
        for (var k = 0; k < red.length; k++) {
          if (red[k] === ballNumber) { has = true; break; }
        }
        seq.push(has ? 1 : 0);
      }
    }
    return seq;
  }

  /** 对全部 33 个红球号码批量做游程检验，汇总通过/拒绝数量。 */
  function runsTestBatch(data) {
    var results = [];
    var pass = 0;
    var fail = 0;
    for (var b = 1; b <= 33; b++) {
      var seq = generateBinarySequence(data, b, 'red');
      var r = runsTest(seq);
      r.ball = b;
      results.push(r);
      if (r.isRandom) pass++; else fail++;
    }
    return { results: results, pass: pass, fail: fail, total: 33 };
  }

  // ── 相邻期重叠分析 ───────────────────────────────────

  /** 超几何分布 PMF：P(k) = C(6,k)*C(27,6-k) / C(33,6)。 */
  function hyperPmf(k) {
    return comb(6, k) * comb(27, 6 - k) / comb(33, 6);
  }

  /** 相邻两期红球交集大小分布 + 理论值。 */
  function adjacentOverlap(data) {
    var counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (var i = 1; i < data.length; i++) {
      var a = data[i - 1].red;
      var b = data[i].red;
      var inter = 0;
      for (var x = 0; x < a.length; x++) {
        for (var y = 0; y < b.length; y++) {
          if (a[x] === b[y]) { inter++; break; }
        }
      }
      counts[inter] = (counts[inter] || 0) + 1;
    }
    var totalPairs = data.length - 1;
    var expected = {};
    var observed = [];
    var expArr = [];
    for (var k = 0; k <= 6; k++) {
      expected[k] = hyperPmf(k) * totalPairs;
      observed.push(counts[k]);
      expArr.push(expected[k]);
    }
    var chi = chiSquareTest(observed, expArr);
    return {
      overlapCounts: counts,
      expected: expected,
      total: totalPairs,
      chiSquare: chi
    };
  }

  // ── 间隔期数分析 ──────────────────────────────────────

  /** 计算某号码的相邻出现间隔分布。 */
  function gapAnalysis(data, ballNumber) {
    var lastIdx = -1;
    var gaps = [];
    var firstAppearance = -1;
    for (var i = 0; i < data.length; i++) {
      var red = data[i].red;
      var has = false;
      for (var k = 0; k < red.length; k++) {
        if (red[k] === ballNumber) { has = true; break; }
      }
      if (has) {
        if (firstAppearance === -1) firstAppearance = i;
        if (lastIdx >= 0) gaps.push(i - lastIdx);
        lastIdx = i;
      }
    }
    var total = 0;
    for (var g = 0; g < gaps.length; g++) total += gaps[g];
    var meanGap = gaps.length > 0 ? total / gaps.length : 0;
    var theoreticalMean = 33 / 6;
    // distribution: 按间隔分组（0~max 中各组计数 + 理论几何分布频次）
    var distribution = {};
    var maxGap = 0;
    for (var gg = 0; gg < gaps.length; gg++) {
      var v = gaps[gg];
      distribution[v] = (distribution[v] || 0) + 1;
      if (v > maxGap) maxGap = v;
    }
    var p = 6 / 33;
    var theoreticalDist = {};
    for (var d = 1; d <= maxGap; d++) {
      theoreticalDist[d] = (1 - p) * Math.pow(p, d - 1) * gaps.length;
    }
    return {
      gaps: gaps,
      count: gaps.length,
      meanGap: meanGap,
      theoreticalMean: theoreticalMean,
      distribution: distribution,
      theoretical: theoreticalDist,
      maxGap: maxGap
    };
  }

  // ── 尾数分析 ──────────────────────────────────────────

  /** 1~33 的尾数（% 10）分布卡方检验。 */
  function lastDigitAnalysis(data) {
    var digitCounts = {};
    for (var d = 0; d < 10; d++) digitCounts[d] = 0;
    var total = 0;
    for (var i = 0; i < data.length; i++) {
      var red = data[i].red;
      for (var k = 0; k < red.length; k++) {
        var ld = red[k] % 10;
        digitCounts[ld]++;
        total++;
      }
    }
    // 尾数在 1~33 池中的真实可用号码数：
    //   尾数 1/2/3 各 4 个（如 1,11,21,31）；其他尾数各 3 个
    var poolByDigit = [3, 4, 4, 4, 3, 3, 3, 3, 3, 3];
    // 两种期望：
    //   ① naive：彩民迷信的「尾数均衡」，期望 = total/10
    //   ② weighted：随机模型真实期望 = total * poolByDigit[d] / 33
    var observed = [];
    var expectedNaive = [];
    var expectedWeighted = [];
    for (var d2 = 0; d2 < 10; d2++) {
      observed.push(digitCounts[d2]);
      expectedNaive.push(total / 10);
      expectedWeighted.push(total * poolByDigit[d2] / 33);
    }
    var rNaive = chiSquareTest(observed, expectedNaive);
    var rWeighted = chiSquareTest(observed, expectedWeighted);
    return {
      digitCounts: digitCounts,
      observed: observed,
      expectedNaive: expectedNaive,
      expectedWeighted: expectedWeighted,
      poolByDigit: poolByDigit,
      total: total,
      chiSquareNaive: rNaive.chiSquare,
      criticalValueNaive: rNaive.criticalValue,
      pApproxNaive: rNaive.pApprox,
      isRandomNaive: rNaive.isRandom,
      chiSquareWeighted: rWeighted.chiSquare,
      criticalValueWeighted: rWeighted.criticalValue,
      pApproxWeighted: rWeighted.pApprox,
      isRandomWeighted: rWeighted.isRandom,
      // 兼容旧字段
      chiSquare: rWeighted.chiSquare,
      criticalValue: rWeighted.criticalValue,
      pApprox: rWeighted.pApprox,
      isRandom: rWeighted.isRandom,
      expected: expectedWeighted
    };
  }

  // ── 综合报告 ──────────────────────────────────────────

  /** 一次性跑全部检验，返回综合结果对象。 */
  function fullReport(data) {
    var red = redChiSquare(data);
    var blue = blueChiSquare(data);
    var runs = runsTestBatch(data);
    var overlap = adjacentOverlap(data);
    var lastDigit = lastDigitAnalysis(data);
    // 间隔分析只挑代表号（取红球频率中位）
    var gap = gapAnalysis(data, 17); // 17 是中间偏中
    return {
      red: red,
      blue: blue,
      runs: runs,
      overlap: overlap,
      lastDigit: lastDigit,
      gap: gap,
      allPass: red.isRandom && blue.isRandom && runs.fail === 0 && overlap.chiSquare.isRandom && lastDigit.isRandom
    };
  }

  // ── 导出 ────────────────────────────────────────────

  var api = {
    comb: comb,
    erf: erf,
    normalCdf: normalCdf,
    chiSquareTest: chiSquareTest,
    chiSquarePValue: chiSquarePValue,
    countRedFrequencies: countRedFrequencies,
    countBlueFrequencies: countBlueFrequencies,
    redChiSquare: redChiSquare,
    blueChiSquare: blueChiSquare,
    runsTest: runsTest,
    generateBinarySequence: generateBinarySequence,
    runsTestBatch: runsTestBatch,
    hyperPmf: hyperPmf,
    adjacentOverlap: adjacentOverlap,
    gapAnalysis: gapAnalysis,
    lastDigitAnalysis: lastDigitAnalysis,
    fullReport: fullReport
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.LotteryStats = api;
  }
})(typeof window !== 'undefined' ? window : this);