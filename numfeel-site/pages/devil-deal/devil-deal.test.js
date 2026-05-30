/**
 * 恶魔交易诊断 — 单元测试
 * 运行: node pages/devil-deal/devil-deal.test.js
 */

// 模拟浏览器环境中的全局变量
global.DIMENSIONS = undefined;
global.QUESTIONS = undefined;
global.DEAL_RESULTS = undefined;

// 加载模块
var qModule = require('./questions.js');
global.DIMENSIONS = qModule.DIMENSIONS;
global.QUESTIONS = qModule.QUESTIONS;
global.DEAL_RESULTS = qModule.DEAL_RESULTS;

var engine = require('./engine.js');
var calcRawScores = engine.calcRawScores;
var calcPercentages = engine.calcPercentages;
var findTopDimension = engine.findTopDimension;
var findSecondDimension = engine.findSecondDimension;
var getExpectedDistribution = engine.getExpectedDistribution;

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✅ ' + msg);
  } else {
    failed++;
    console.error('  ❌ ' + msg);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  var diff = Math.abs(actual - expected);
  assert(diff <= tolerance, msg + ' (actual=' + actual + ', expected=' + expected + ', tol=' + tolerance + ')');
}

// ===== 数据完整性 =====
console.log('\n📋 数据完整性测试');

assert(DIMENSIONS.length === 6, '应有 6 个维度');
assert(QUESTIONS.length === 10, '应有 10 道题');

var dimIds = DIMENSIONS.map(function(d) { return d.id; });
assert(dimIds.indexOf('power') !== -1, '包含 power 维度');
assert(dimIds.indexOf('love') !== -1, '包含 love 维度');
assert(dimIds.indexOf('money') !== -1, '包含 money 维度');
assert(dimIds.indexOf('revenge') !== -1, '包含 revenge 维度');
assert(dimIds.indexOf('recognition') !== -1, '包含 recognition 维度');
assert(dimIds.indexOf('knowledge') !== -1, '包含 knowledge 维度');

// 每道题都有 4 个选项
QUESTIONS.forEach(function(q, i) {
  assert(q.opts.length === 4, '第 ' + (i + 1) + ' 题有 4 个选项');
  assert(typeof q.text === 'string' && q.text.length > 0, '第 ' + (i + 1) + ' 题有题目文本');
  assert(typeof q.tag === 'string' && q.tag.length > 0, '第 ' + (i + 1) + ' 题有标签');
});

// 每个选项的 scores 只包含合法维度
QUESTIONS.forEach(function(q, i) {
  q.opts.forEach(function(opt, j) {
    if (opt.scores) {
      Object.keys(opt.scores).forEach(function(dim) {
        assert(dimIds.indexOf(dim) !== -1, '第 ' + (i + 1) + ' 题选项 ' + (j + 1) + ' 的维度 "' + dim + '" 合法');
      });
    }
  });
});

// 每个维度都有结果描述
DIMENSIONS.forEach(function(d) {
  assert(DEAL_RESULTS[d.id] !== undefined, '维度 "' + d.id + '" 有结果描述');
  assert(typeof DEAL_RESULTS[d.id].title === 'string', '维度 "' + d.id + '" 有标题');
  assert(typeof DEAL_RESULTS[d.id].psychology === 'string', '维度 "' + d.id + '" 有心理学解读');
  assert(typeof DEAL_RESULTS[d.id].source === 'string', '维度 "' + d.id + '" 有参考来源');
});

// ===== 计算引擎 =====
console.log('\n🧮 计算引擎测试');

// 全部未答 → 所有维度 0 分
var emptyAnswers = [null, null, null, null, null, null, null, null, null, null];
var emptyScores = calcRawScores(QUESTIONS, emptyAnswers);
DIMENSIONS.forEach(function(d) {
  assert(emptyScores[d.id] === 0, '未答题时 ' + d.id + ' = 0');
});

// 全选第一个选项 → 分数应大于 0
var allFirstAnswers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var firstScores = calcRawScores(QUESTIONS, allFirstAnswers);
var totalFirst = 0;
DIMENSIONS.forEach(function(d) { totalFirst += firstScores[d.id]; });
assert(totalFirst > 0, '全选第一个选项时总分 > 0 (实际: ' + totalFirst + ')');

// 全选第二个选项 → 分数应大于 0
var allSecondAnswers = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
var secondScores = calcRawScores(QUESTIONS, allSecondAnswers);
var totalSecond = 0;
DIMENSIONS.forEach(function(d) { totalSecond += secondScores[d.id]; });
assert(totalSecond > 0, '全选第二个选项时总分 > 0 (实际: ' + totalSecond + ')');

// 百分比在 0~1 之间
var pcts = calcPercentages(firstScores, QUESTIONS);
DIMENSIONS.forEach(function(d) {
  assert(pcts[d.id] >= 0 && pcts[d.id] <= 1, d.id + ' 百分比在 [0,1] 范围内 (实际: ' + pcts[d.id].toFixed(3) + ')');
});

// findTopDimension 返回合法维度
var topDim = findTopDimension(firstScores);
assert(dimIds.indexOf(topDim) !== -1, 'findTopDimension 返回合法维度: ' + topDim);

// findSecondDimension 返回合法维度且与 top 不同（除非所有分数相同）
var secondDim = findSecondDimension(firstScores);
assert(dimIds.indexOf(secondDim) !== -1, 'findSecondDimension 返回合法维度: ' + secondDim);

// ===== 特定场景测试 =====
console.log('\n🎯 特定场景测试');

// 构造一个明确偏向 love 的答案（选择所有 love 得分最高的选项）
var loveAnswers = [];
QUESTIONS.forEach(function(q) {
  var bestIdx = 0;
  var bestLove = 0;
  q.opts.forEach(function(opt, i) {
    var loveScore = (opt.scores && opt.scores.love) || 0;
    if (loveScore > bestLove) {
      bestLove = loveScore;
      bestIdx = i;
    }
  });
  loveAnswers.push(bestIdx);
});
var loveScores = calcRawScores(QUESTIONS, loveAnswers);
var loveTop = findTopDimension(loveScores);
assert(loveTop === 'love', '选择所有 love 最高选项时，主维度应为 love (实际: ' + loveTop + ')');

// 构造一个明确偏向 power 的答案
var powerAnswers = [];
QUESTIONS.forEach(function(q) {
  var bestIdx = 0;
  var bestPower = 0;
  q.opts.forEach(function(opt, i) {
    var powerScore = (opt.scores && opt.scores.power) || 0;
    if (powerScore > bestPower) {
      bestPower = powerScore;
      bestIdx = i;
    }
  });
  powerAnswers.push(bestIdx);
});
var powerScores = calcRawScores(QUESTIONS, powerAnswers);
var powerTop = findTopDimension(powerScores);
assert(powerTop === 'power', '选择所有 power 最高选项时，主维度应为 power (实际: ' + powerTop + ')');

// 构造一个明确偏向 money 的答案
var moneyAnswers = [];
QUESTIONS.forEach(function(q) {
  var bestIdx = 0;
  var bestMoney = 0;
  q.opts.forEach(function(opt, i) {
    var moneyScore = (opt.scores && opt.scores.money) || 0;
    if (moneyScore > bestMoney) {
      bestMoney = moneyScore;
      bestIdx = i;
    }
  });
  moneyAnswers.push(bestIdx);
});
var moneyScores = calcRawScores(QUESTIONS, moneyAnswers);
var moneyTop = findTopDimension(moneyScores);
assert(moneyTop === 'money', '选择所有 money 最高选项时，主维度应为 money (实际: ' + moneyTop + ')');

// ===== 分布数据 =====
console.log('\n📊 分布数据测试');

var dist = getExpectedDistribution();
var distTotal = 0;
DIMENSIONS.forEach(function(d) {
  assert(typeof dist[d.id] === 'number' && dist[d.id] > 0, d.id + ' 分布值 > 0');
  distTotal += dist[d.id];
});
assert(distTotal === 100, '分布总和应为 100 (实际: ' + distTotal + ')');

// ===== 结果 =====
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) {
  console.log('❌ 有测试失败！');
  process.exit(1);
} else {
  console.log('✅ 全部通过！');
}
