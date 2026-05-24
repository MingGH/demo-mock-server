/**
 * Penney's Game 核心引擎
 * 计算任意两个三位硬币序列对战的精确胜率
 * 基于 Conway's Leading Number Algorithm 和马尔可夫链分析
 */

(function(exports) {
  'use strict';

  // 所有 8 种三位序列
  var ALL_SEQUENCES = ['HHH','HHT','HTH','HTT','THH','THT','TTH','TTT'];

  /**
   * Conway 领先数算法
   * 计算序列 a 相对于 b 的 Conway leading number
   * 用于快速计算两序列对战胜率
   */
  function conwayNumber(a, b) {
    var n = a.length;
    var result = 0;
    for (var k = 0; k < n; k++) {
      // 检查 a 的后 (n-k) 个字符是否等于 b 的前 (n-k) 个字符
      var suffix = a.slice(k);
      var prefix = b.slice(0, n - k);
      if (suffix === prefix) {
        // 二进制权重：2^(n-k)
        result += Math.pow(2, n - k);
      }
    }
    return result;
  }

  /**
   * 精确计算 B 对 A 的胜率（马尔可夫链 + 高斯消元）
   * 状态：(已匹配A的前缀长度, 已匹配B的前缀长度)
   */
  function winProbability(seqA, seqB) {
    if (seqA === seqB) return 0.5;
    var n = seqA.length; // 3

    // KMP 失配跳转：序列 seq 已匹配前 matched 位，来了字符 c，新匹配长度
    function nextMatch(seq, matched, c) {
      var attempt = seq.slice(0, matched) + c;
      for (var len = Math.min(matched + 1, n); len >= 0; len--) {
        if (attempt.slice(attempt.length - len) === seq.slice(0, len)) {
          return len;
        }
      }
      return 0;
    }

    // 枚举所有非终止状态 (i, j), 0 <= i < n, 0 <= j < n
    // 状态编号: id = i * n + j
    var numStates = n * n; // 9 for n=3
    // 建立线性方程组: prob[s] = 0.5 * prob[next_H(s)] + 0.5 * prob[next_T(s)]
    // 如果 next 是终止态 (i==n → prob=0, j==n → prob=1)

    // 方程: prob[s] - 0.5*prob[next_H] - 0.5*prob[next_T] = constant
    // 矩阵 A * x = b
    var A = [];
    var b = [];
    for (var s = 0; s < numStates; s++) {
      A[s] = new Array(numStates).fill(0);
      b[s] = 0;
    }

    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var s = i * n + j;
        A[s][s] = 1;

        // 抛 H
        var niH = nextMatch(seqA, i, 'H');
        var njH = nextMatch(seqB, j, 'H');
        if (niH === n) {
          // A wins, contribute 0
        } else if (njH === n) {
          // B wins, contribute 0.5 * 1
          b[s] += 0.5;
        } else {
          A[s][niH * n + njH] -= 0.5;
        }

        // 抛 T
        var niT = nextMatch(seqA, i, 'T');
        var njT = nextMatch(seqB, j, 'T');
        if (niT === n) {
          // A wins, contribute 0
        } else if (njT === n) {
          // B wins, contribute 0.5 * 1
          b[s] += 0.5;
        } else {
          A[s][niT * n + njT] -= 0.5;
        }
      }
    }

    // 高斯消元
    var x = gaussianElimination(A, b);
    return x[0]; // 状态 (0,0) 时 B 的胜率
  }

  /**
   * 高斯消元解线性方程组 Ax = b
   */
  function gaussianElimination(A, b) {
    var n = A.length;
    // 前向消元
    for (var col = 0; col < n; col++) {
      // 选主元
      var maxRow = col;
      var maxVal = Math.abs(A[col][col]);
      for (var row = col + 1; row < n; row++) {
        if (Math.abs(A[row][col]) > maxVal) {
          maxVal = Math.abs(A[row][col]);
          maxRow = row;
        }
      }
      // 交换行
      if (maxRow !== col) {
        var tmp = A[col]; A[col] = A[maxRow]; A[maxRow] = tmp;
        var tmpB = b[col]; b[col] = b[maxRow]; b[maxRow] = tmpB;
      }
      // 消元
      for (var row = col + 1; row < n; row++) {
        var factor = A[row][col] / A[col][col];
        for (var k = col; k < n; k++) {
          A[row][k] -= factor * A[col][k];
        }
        b[row] -= factor * b[col];
      }
    }
    // 回代
    var x = new Array(n);
    for (var i = n - 1; i >= 0; i--) {
      var sum = b[i];
      for (var j = i + 1; j < n; j++) {
        sum -= A[i][j] * x[j];
      }
      x[i] = sum / A[i][i];
    }
    return x;
  }

  /**
   * 给定甲的选择，计算乙的最优对策
   * 规则：取甲第二位的反面 + 甲的前两位
   * 例：甲选 HHT → 乙选 THH（H的反面T + HH）
   * 例：甲选 HTH → 乙选 HHT（T的反面H + HT）
   */
  function optimalCounter(seqA) {
    var flip = seqA[1] === 'H' ? 'T' : 'H';
    return flip + seqA[0] + seqA[1];
  }

  /**
   * 计算完整的 8x8 胜率矩阵
   * matrix[i][j] = 序列 i 对序列 j 的胜率
   */
  function buildWinMatrix() {
    var n = ALL_SEQUENCES.length;
    var matrix = [];
    for (var i = 0; i < n; i++) {
      matrix[i] = [];
      for (var j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 0.5;
        } else {
          matrix[i][j] = winProbability(ALL_SEQUENCES[j], ALL_SEQUENCES[i]);
        }
      }
    }
    return matrix;
  }

  /**
   * 蒙特卡洛模拟一局 Penney's Game
   * 返回胜者序列 ('A' 或 'B') 和硬币序列
   */
  function simulateOneGame(seqA, seqB) {
    var coins = [];
    var maxFlips = 1000; // 安全上限

    for (var i = 0; i < maxFlips; i++) {
      coins.push(Math.random() < 0.5 ? 'H' : 'T');

      if (coins.length >= 3) {
        var last3 = coins.slice(-3).join('');
        if (last3 === seqA) return { winner: 'A', coins: coins };
        if (last3 === seqB) return { winner: 'B', coins: coins };
      }
    }
    // 极端情况下超时
    return { winner: Math.random() < 0.5 ? 'A' : 'B', coins: coins };
  }

  /**
   * 蒙特卡洛模拟 N 局，返回统计结果
   */
  function simulate(seqA, seqB, n) {
    var winsA = 0;
    var winsB = 0;
    var totalFlips = 0;
    var flipCounts = [];

    for (var i = 0; i < n; i++) {
      var result = simulateOneGame(seqA, seqB);
      if (result.winner === 'A') winsA++;
      else winsB++;
      totalFlips += result.coins.length;
      flipCounts.push(result.coins.length);
    }

    return {
      winsA: winsA,
      winsB: winsB,
      winRateA: winsA / n,
      winRateB: winsB / n,
      avgFlips: totalFlips / n,
      flipCounts: flipCounts
    };
  }

  /**
   * 找出所有非传递性关系（A 优于 B，B 优于 C，但 C 优于或持平 A）
   * 在三位序列中，严格 >50% 的环不存在（很多对局恰好 50%），
   * 但"后手对每个序列都有克制"这一结构本身就是非传递性的体现。
   * 此函数返回"优势链"（允许 >=50%）示例
   */
  function findDominanceChains() {
    var chains = [];
    var seqs = ALL_SEQUENCES;
    // 找出最具代表性的优势链
    // THH > HHT > TTH > ... 
    for (var i = 0; i < seqs.length; i++) {
      for (var j = 0; j < seqs.length; j++) {
        if (i === j) continue;
        var pIJ = winProbability(seqs[j], seqs[i]); // P(i beats j)
        if (pIJ <= 0.5) continue;
        for (var k = 0; k < seqs.length; k++) {
          if (k === i || k === j) continue;
          var pJK = winProbability(seqs[k], seqs[j]); // P(j beats k)
          var pKI = winProbability(seqs[i], seqs[k]); // P(k beats i)
          // 找"近似环"：前两个 >50%，第三个 >=50%
          if (pJK > 0.5 && pKI >= 0.5) {
            chains.push({
              a: seqs[i], b: seqs[j], c: seqs[k],
              pAB: pIJ, pBC: pJK, pCA: pKI
            });
          }
        }
      }
    }
    return chains;
  }

  /**
   * 格式化序列为中文显示
   */
  function formatSeq(seq) {
    return seq.split('').map(function(c) {
      return c === 'H' ? '正' : '反';
    }).join('');
  }

  /**
   * 格式化概率为百分比
   */
  function formatPct(p) {
    return (p * 100).toFixed(1) + '%';
  }

  // 导出
  exports.PenneyEngine = {
    ALL_SEQUENCES: ALL_SEQUENCES,
    conwayNumber: conwayNumber,
    winProbability: winProbability,
    optimalCounter: optimalCounter,
    buildWinMatrix: buildWinMatrix,
    simulateOneGame: simulateOneGame,
    simulate: simulate,
    findDominanceChains: findDominanceChains,
    formatSeq: formatSeq,
    formatPct: formatPct
  };

})(typeof module !== 'undefined' ? module.exports : window);
