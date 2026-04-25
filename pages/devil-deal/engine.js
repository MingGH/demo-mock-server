/**
 * 恶魔交易诊断 — 计算引擎
 * 纯逻辑，不依赖 DOM，可独立测试
 */

/**
 * 计算各维度得分
 * @param {Array} questions - QUESTIONS 数组
 * @param {Array} answers   - 用户选择的选项索引数组，null 表示未答
 * @returns {Object} { power: 12, love: 5, ... } 原始分
 */
function calcRawScores(questions, answers) {
  var scores = {};
  // 初始化所有维度为 0
  DIMENSIONS.forEach(function(d) { scores[d.id] = 0; });

  questions.forEach(function(q, i) {
    if (answers[i] === null || answers[i] === undefined) return;
    var opt = q.opts[answers[i]];
    if (!opt || !opt.scores) return;
    Object.keys(opt.scores).forEach(function(dim) {
      if (scores[dim] !== undefined) {
        scores[dim] += opt.scores[dim];
      }
    });
  });
  return scores;
}

/**
 * 将原始分转为百分比（相对于该维度理论最高分）
 * @param {Object} rawScores - { power: 12, ... }
 * @param {Array} questions  - QUESTIONS 数组
 * @returns {Object} { power: 0.75, love: 0.33, ... } 0~1
 */
function calcPercentages(rawScores, questions) {
  // 计算每个维度的理论最高分：每题中该维度的最高可得分之和
  var maxScores = {};
  DIMENSIONS.forEach(function(d) { maxScores[d.id] = 0; });

  questions.forEach(function(q) {
    // 对每道题，找出每个维度在所有选项中的最高分
    var qMax = {};
    DIMENSIONS.forEach(function(d) { qMax[d.id] = 0; });
    q.opts.forEach(function(opt) {
      if (!opt.scores) return;
      Object.keys(opt.scores).forEach(function(dim) {
        if (qMax[dim] !== undefined && opt.scores[dim] > qMax[dim]) {
          qMax[dim] = opt.scores[dim];
        }
      });
    });
    DIMENSIONS.forEach(function(d) { maxScores[d.id] += qMax[d.id]; });
  });

  var pcts = {};
  DIMENSIONS.forEach(function(d) {
    pcts[d.id] = maxScores[d.id] > 0 ? rawScores[d.id] / maxScores[d.id] : 0;
  });
  return pcts;
}

/**
 * 找出得分最高的维度（主维度）
 * @param {Object} rawScores
 * @returns {string} 维度 id
 */
function findTopDimension(rawScores) {
  var topId = DIMENSIONS[0].id;
  var topVal = rawScores[topId] || 0;
  DIMENSIONS.forEach(function(d) {
    if ((rawScores[d.id] || 0) > topVal) {
      topVal = rawScores[d.id];
      topId = d.id;
    }
  });
  return topId;
}

/**
 * 找出得分第二高的维度（副维度）
 * @param {Object} rawScores
 * @returns {string} 维度 id
 */
function findSecondDimension(rawScores) {
  var sorted = DIMENSIONS.slice().sort(function(a, b) {
    return (rawScores[b.id] || 0) - (rawScores[a.id] || 0);
  });
  return sorted.length > 1 ? sorted[1].id : sorted[0].id;
}

/**
 * 生成模拟分布数据（基于题目设计的预期分布）
 * 这不是真实用户数据，而是基于选项设计的理论预期
 * @returns {Object} { power: 18, love: 22, money: 25, revenge: 10, recognition: 15, knowledge: 10 }
 */
function getExpectedDistribution() {
  return {
    power: 18,
    love: 22,
    money: 25,
    revenge: 8,
    recognition: 17,
    knowledge: 10
  };
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcRawScores: calcRawScores,
    calcPercentages: calcPercentages,
    findTopDimension: findTopDimension,
    findSecondDimension: findSecondDimension,
    getExpectedDistribution: getExpectedDistribution
  };
}
