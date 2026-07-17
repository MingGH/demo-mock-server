/**
 * 高智商矩阵推理测试 - 单元测试
 * 运行命令: node pages/iq-matrix-test/iq-matrix-test.test.js
 */

var L = require('./iq-matrix-test-logic.js');
var fs = require('fs');
var vm = require('vm');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  ✅ ' + msg);
    passed++;
  } else {
    console.log('  ❌ ' + msg);
    failed++;
  }
}

function assertApprox(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + ' (实际=' + actual + ', 期望=' + expected + ')');
}

function cellKey(cell) {
  return L.ATTR_KEYS.map(function (k) { return cell[k]; }).join('|');
}

var rng = L.mulberry32(12345);

// ========== 1. 题目生成 ==========
console.log('\n🧩 1. 题目生成');

[1, 2, 3].forEach(function (level) {
  var q = L.generateQuestion(level, rng);
  assert(q.grid.length === 3, 'Level' + level + ' 网格为 3 行');
  assert(q.grid[0].length === 3, 'Level' + level + ' 网格为 3 列');
  assert(q.options.length === 6, 'Level' + level + ' 选项数为 6');
  // 正确答案在选项中
  var hasAnswer = q.options.some(function (o) { return cellKey(o) === cellKey(q.answer); });
  assert(hasAnswer, 'Level' + level + ' 选项包含正确答案');
  // 规则数等于难度
  assert(q.rules.length === level, 'Level' + level + ' 规则数为 ' + level);
  assert(!!q.explanation, 'Level' + level + ' 有规则解释');
});

// ========== 2. 规则应用正确性 ==========
console.log('\n📐 2. 规则应用正确性');

// arithmetic 规则：第三列应满足 startIdx + 2*step
for (var t = 0; t < 50; t++) {
  var q2 = L.generateQuestion(1, rng);
  var rule = q2.rules[0];
  var domain = L.DOMAINS[rule.attr];
  if (rule.type === 'arithmetic') {
    for (var r = 0; r < 3; r++) {
      var i0 = domain.indexOf(q2.grid[r][0][rule.attr]);
      var i2 = domain.indexOf(q2.grid[r][2][rule.attr]);
      var expected = (i0 + 2 * rule.step) % domain.length;
      assert(i2 === expected, 'arithmetic 规则行内推导一致（行' + r + '）');
    }
  } else {
    // combine：第三列索引 = 前两列索引之和取模
    for (var r2 = 0; r2 < 3; r2++) {
      var x0 = domain.indexOf(q2.grid[r2][0][rule.attr]);
      var x1 = domain.indexOf(q2.grid[r2][1][rule.attr]);
      var x2 = domain.indexOf(q2.grid[r2][2][rule.attr]);
      assert(x2 === ((x0 + x1) % domain.length), 'combine 规则第三列=前两列模加（行' + r2 + '）');
    }
  }
}

// 答案等于 grid[2][2]
var qAns = L.generateQuestion(2, rng);
assert(cellKey(qAns.answer) === cellKey(qAns.grid[2][2]), '答案严格等于右下角格子');

// ========== 3. 难度递进 ==========
console.log('\n📈 3. 难度递进');

var set = L.generateTestSet(rng);
assert(set.length === 9, '测试集共 9 题');
[1, 2, 3].forEach(function (lvl) {
  var slice = set.slice((lvl - 1) * 3, lvl * 3);
  var ok = slice.every(function (q) { return q.level === lvl && q.rules.length === lvl; });
  assert(ok, 'Level' + lvl + ' 的 3 题均使用 ' + lvl + ' 条规则');
});

// ========== 4. 选项唯一性 ==========
console.log('\n🎲 4. 选项唯一性');

for (var u = 0; u < 100; u++) {
  var qu = L.generateQuestion(1 + (u % 3), rng);
  var keys = qu.options.map(cellKey);
  var uniq = new Set(keys);
  assert(uniq.size === 6, '第' + u + '题 6 个选项互不重复');
}

// ========== 5. N-back 序列 ==========
console.log('\n🧠 5. N-back 序列');

var nb = L.generateNBackSequence(2, 22, rng);
assert(nb.positions.length === 22, '2-back 序列长度=22');
assert(nb.n === 2, 'n=2');

// match 标记正确性
var matchCount = 0;
for (var i = nb.n; i < nb.positions.length; i++) {
  var realMatch = nb.positions[i] === nb.positions[i - nb.n];
  assert(realMatch === nb.matches[i], '2-back 第' + i + '位 match 标记与实际一致');
  if (nb.matches[i]) matchCount++;
}
var ratio = matchCount / (nb.positions.length - nb.n);
assert(ratio > 0.15 && ratio < 0.5, '2-back match 比例约 30%（实际=' + ratio.toFixed(2) + '）');

// 不超过连续 2 次 match
var maxConsec = 0, cur = 0;
for (var j = 0; j < nb.matches.length; j++) {
  if (nb.matches[j]) { cur++; maxConsec = Math.max(maxConsec, cur); }
  else cur = 0;
}
assert(maxConsec <= 2, '2-back 连续 match 不超过 2 次（最大=' + maxConsec + '）');

var nb3 = L.generateNBackSequence(3, 23, rng);
assert(nb3.positions.length === 23, '3-back 序列长度=23');
assert(nb3.n === 3, 'n=3');

// 多次平均比例稳定在 ~30%
var totalRatio = 0, trials = 30;
for (var k = 0; k < trials; k++) {
  var nbs = L.generateNBackSequence(2, 22, rng);
  var mc = 0;
  for (var m = nbs.n; m < nbs.positions.length; m++) if (nbs.matches[m]) mc++;
  totalRatio += mc / (nbs.positions.length - nbs.n);
}
var avgRatio = totalRatio / trials;
assertApprox(avgRatio, 0.30, 0.08, '30 次 2-back 平均 match 比例 ≈ 30%');

// ========== 6. N-back 评分 ==========
console.log('\n🏆 6. N-back 评分');

// 全对的情形（matches 与 positions 严格一致）
var nbPerfect = { positions: [1, 2, 1, 3, 1, 4], matches: [false, false, true, false, true, false], n: 2 };
var respPerfect = [false, false, true, false, true, false];
var sc = L.scoreNBack(nbPerfect, respPerfect);
assert(sc.hit === 2 && sc.miss === 0 && sc.fa === 0 && sc.cr === 2, '全对：2 hit / 2 cr');
assertApprox(sc.accuracy, 1.0, 0.001, '全对正确率=100%');

// 漏答必须进入分母并计错
var respOmitted = [false, false, true, null, true, false];
var scOmitted = L.scoreNBack(nbPerfect, respOmitted);
assert(scOmitted.omissions === 1 && scOmitted.total === 4, '漏答计入总题数');
assertApprox(scOmitted.accuracy, 0.75, 0.001, '一次漏答后正确率=75%');

// 漏掉 match + 对 non-match 误报
var respBad = [false, false, false, true, true, false];
var scBad = L.scoreNBack(nbPerfect, respBad);
assert(scBad.hit === 1 && scBad.miss === 1 && scBad.fa === 1 && scBad.cr === 1, '错误分类统计正确');

// ========== 7. 常模 & 正态分布 ==========
console.log('\n📊 7. 常模与正态分布');

// PDF 在均值处最大
var peak = L.normalPDF(0.5, 0.5, 0.15);
var off = L.normalPDF(0.65, 0.5, 0.15);
assert(peak > off, 'PDF 在均值处最大');
assertApprox(peak, 1 / (0.15 * Math.sqrt(2 * Math.PI)), 1e-6, 'PDF(μ) = 1/(σ√2π)');

// 对称性
assertApprox(L.normalPDF(0.35, 0.5, 0.15), L.normalPDF(0.65, 0.5, 0.15), 1e-9, 'PDF 关于均值对称');

// CDF 边界
assertApprox(L.normalCDF(0.5, 0.5, 0.15), 0.5, 1e-6, 'CDF(μ)=0.5');
assert(L.normalCDF(0, 0.5, 0.15) < 0.001, 'CDF 远小于均值趋近 0');
assert(L.normalCDF(1, 0.5, 0.15) > 0.999, 'CDF 远大于均值趋近 1');

// 常模结构
assert(L.NORMS.matrixReasoning.highIQ.mean === 0.78, '高智商矩阵正确率均值=0.78');
assert(L.NORMS.matrixReasoning.general.sd === 0.15, '一般人群矩阵正确率标准差=0.15');
assert(L.NORMS.workingMemory.highIQ.mean === 0.82, '高智商工作记忆均值=0.82');

// 百分位
assertApprox(L.percentileRank(0.5, 0.5, 0.15), 0.5, 1e-6, '中位值得 50 百分位');
assert(L.percentileRank(0.78, 0.5, 0.15) > 0.95, '78% 正确率在一般人群中 >95 百分位');

// ========== 8. 得分计算 ==========
console.log('\n🧮 8. 得分计算');

var results = [
  { correct: true, reactionTime: 8000 },
  { correct: true, reactionTime: 12000 },
  { correct: false, reactionTime: 30000 },
  { correct: true, reactionTime: 10000 }
];
var ms = L.computeMatrixScore(results);
assertApprox(ms.accuracy, 0.75, 1e-9, '矩阵正确率=75%');
assertApprox(ms.avgRT, 15000, 1e-9, '全部题目平均反应时间=15000ms');
assertApprox(ms.avgCorrectRT, 10000, 1e-9, '只统计答对题的平均反应时间=10000ms');
assert(ms.correct === 3 && ms.total === 4, '3/4 正确');

var noCorrect = L.computeMatrixScore([{ correct: false, reactionTime: 100 }]);
assert(noCorrect.avgCorrectRT === 30000, '全错时答对题反应按30秒下限计，不能靠盲猜获速度分');

var overall = L.computeOverallScore(ms, 0.82);
assert(overall.score >= 0 && overall.score <= 100, '综合分在0~100之间');
assert(overall.components.effectiveSpeed <= overall.components.speed, '速度有效分受矩阵正确率约束');
var guessed = L.computeOverallScore(noCorrect, 0);
assert(guessed.score === 0, '快速盲猜且工作记忆全错时综合分为0');

var perf = L.summarizePerformance(ms, 0.82);
assert(perf.matrixPercentile > 0.9, '75% 正确率在一般人群中百分位很高');
assert(perf.wmPercentile > 0.9, '82% N-back 在一般人群中百分位很高');
assert(perf.overall > 0 && perf.overall < 1, '综合百分位在 0~1 之间');

// ========== 9. SVG 渲染 ==========
console.log('\n🎨 9. SVG 渲染');

var svg = L.renderCellSVG({ shape: 'circle', fill: 'solid', rotation: 0, size: 'medium', position: 'center', count: 1 });
assert(svg.indexOf('<svg') === 0, '返回以 <svg 开头');
assert(svg.indexOf('</svg>') > 0, '包含闭合标签');
assert(svg.indexOf('circle') > 0, '渲染出 circle 形状');

var svgHalf = L.renderCellSVG({ shape: 'square', fill: 'half', rotation: 90, size: 'large', position: 'center', count: 2 });
assert(svgHalf.indexOf('rect') > 0, '半填充渲染出矩形遮罩');

// ========== 10. 可复现性 ==========
console.log('\n🔁 10. 固定种子可复现');

var r1 = L.mulberry32(999);
var r2 = L.mulberry32(999);
var q1 = L.generateQuestion(2, r1);
var q2 = L.generateQuestion(2, r2);
assert(cellKey(q1.answer) === cellKey(q2.answer), '同种子生成相同答案');
assert(q1.explanation === q2.explanation, '同种子生成相同解释');

// ========== 11. 浏览器导出完整性 ==========
console.log('\n🌐 11. 浏览器导出完整性');
var browserContext = {};
vm.createContext(browserContext);
vm.runInContext(fs.readFileSync(require.resolve('./iq-matrix-test-logic.js'), 'utf8'), browserContext);
assert(typeof browserContext.IQMatrixLogic.computeOverallScore === 'function', '浏览器全局导出 computeOverallScore');
assert(typeof browserContext.IQMatrixLogic.generateTestSet === 'function', '浏览器全局导出 generateTestSet');

// ── 汇总 ────────────────────────────────────────────────
console.log('\n────────────────────────────────');
console.log('通过: ' + passed + ' / 失败: ' + failed);
console.log('────────────────────────────────');
if (failed > 0) {
  console.error('❌ 存在失败用例');
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}
