/**
 * 擦边流量账本（719 期视频腾讯云内容安全打分与流量演化）单元测试
 * 运行：node pages/borderline-traffic-lab/borderline-traffic-lab.test.js
 */
'use strict';

var dataMod = require('./data.js');
var engine = require('./engine.js');

var VIDEOS = dataMod.VIDEOS_AUDIT_DATA;

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}

function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; console.log('✅ ' + msg + ' (实际=' + actual.toFixed(4) + ')'); }
  else { failed++; console.error('❌ ' + msg + ' 期望≈' + expected + ' 实际=' + actual + ' 容差=' + tol); }
}

console.log('\n=== 1. 数据集完整性校验 ===');
assert(Array.isArray(VIDEOS) && VIDEOS.length === 719, '全量数据集包含 719 期视频');
assert(VIDEOS[0].seq === 1 && VIDEOS[718].seq === 719, '视频按时间序号 1..719 严格升序排列');

var allStats = engine.computeSubsetStats(VIDEOS);
assert(allStats.publicCount === 643, '有公开播放量的视频为 643 期');
assert(allStats.memberCount === 76, '会员专享不显示播放量的视频为 76 期');
assertClose(allStats.totalViews / 1e8, 6.7474, 0.01, '累计播放量约 6.75 亿次');
assert(allStats.blockCount === 331 && allStats.reviewCount === 103 && allStats.passCount === 285,
  '腾讯云审核结论 Pass=285 / Review=103 / Block=331');
assert(allStats.blockCount + allStats.reviewCount + allStats.passCount === 719, '审核结论三分类合计 719 期');

console.log('\n=== 2. 综合分计算与整数区间切片唯一性 ===');
assertClose(engine.calcCompositeScore(99, 98), 98.6, 1e-6, '0.6*99 + 0.4*98 = 98.6');
assertClose(engine.calcCompositeScore(11, 4), 8.2, 1e-6, '0.6*11 + 0.4*4 = 8.2');
assert(engine.matchScoreBucket(19.6, 0, 19), '19.6 分应落在 0-19 档');
assert(engine.matchScoreBucket(20.0, 20, 49), '20.0 分应落在 20-49 档');
assert(engine.matchScoreBucket(49.9, 20, 49), '49.9 分应落在 20-49 档');
assert(engine.matchScoreBucket(50.0, 50, 79), '50.0 分应落在 50-79 档');
assert(engine.matchScoreBucket(80.0, 80, 100), '80.0 分应落在 80-100 档');
assert(engine.matchScoreBucket(100.0, 80, 100), '100.0 分应落在 80-100 档');

console.log('\n=== 3. 四档位切片总数与滑块计数严格一致 ===');
var tiers = engine.computeScoreTiers(VIDEOS);
assert(tiers.length === 4, '分为 4 个擦边分档位');
assert(tiers[0].stats.totalCount === 92, '0-19分档位共 92 期（含会员）');
assert(tiers[1].stats.totalCount === 115, '20-49分档位共 115 期（含会员）');
assert(tiers[2].stats.totalCount === 359, '50-79分档位共 359 期（含会员）');
assert(tiers[3].stats.totalCount === 153, '80-100分档位共 153 期（含会员）');
assert(tiers[0].stats.totalCount + tiers[1].stats.totalCount + tiers[2].stats.totalCount + tiers[3].stats.totalCount === 719,
  '四档位切片总数 92+115+359+153 严格等于 719，不重不漏');

// 滑块过滤计数与档位计数同源一致
[0, 1, 2, 3].forEach(function (i) {
  var t = tiers[i];
  var sliderMatched = engine.filterAndSortVideos(VIDEOS, { minScore: t.min, maxScore: t.max });
  assert(sliderMatched.length === t.stats.totalCount,
    '滑块区间 [' + t.min + ',' + t.max + '] 命中 ' + sliderMatched.length + ' 期，与档位统计 ' + t.stats.totalCount + ' 期一致');
});

console.log('\n=== 4. 同曲三次重录轨迹与反噬验证 ===');
var controls = engine.getSameSongControls(VIDEOS);
assert(controls.length === 4, '包含 4 组同曲对照实验');
assertClose(controls[0].multiplier, 5.7, 0.1, '《红莲华》二版破圈倍率 5.7×');
assertClose(controls[0].thirdVsSecondPct, -69.6, 0.1, '《红莲华》三版继续加码后播放量下跌 69.6%');
assertClose(controls[1].multiplier, 22.6, 0.1, '《トリカゴ》跨期重录倍率 22.6×');
assertClose(controls[1].thirdVsSecondPct, -78.1, 0.1, '《トリカゴ》三版高叉泳装后播放量下跌 78.1%');
assertClose(controls[2].thirdVsSecondPct, -92.4, 0.1, 'EVA 四版 94.6 分重度擦边后播放量暴跌 92.4%');
assert(controls[2].late.score < controls[2].extra.score, 'EVA 最高播放版本(701万)的综合分低于暴跌版本');
assert(controls[2].late.v > controls[2].extra.v, 'EVA 最高播放版本(701万)确实是全组最高');

console.log('\n=== 5. 辛普森悖论：全样本汇总 vs 阶段内拆解 ===');
var verdicts = engine.computeVerdictStats(VIDEOS);
assertClose(verdicts.Pass.medianViews / 10000, 39.0, 0.1, '全样本 Pass 中位播放 39.0 万');
assertClose(verdicts.Block.medianViews / 10000, 66.5, 0.1, '全样本 Block 中位播放 66.5 万');
assertClose(verdicts.medianBoostRatio, 66.5 / 39.0, 0.01, '全样本表观溢价 ≈ 1.705 (+70.5%)');

var phases = engine.computeCareerPhases(VIDEOS);
assert(phases.length === 4, '分为 4 个生涯发展阶段');
assertClose(phases[1].passMedianViews / 10000, 132.0, 0.1, '爆发期 Pass 中位 132.0 万');
assertClose(phases[1].blockMedianViews / 10000, 132.0, 0.1, '爆发期 Block 中位 132.0 万');
assertClose(phases[1].blockVsPassDiffPct, 0, 0.1, '爆发期 Block vs Pass 差距为 0%');
assertClose(phases[2].blockVsPassDiffPct, 3.5, 0.2, '加码期 Block vs Pass 差距仅 +3.5%');
assert(phases[3].blockVsPassDiffPct < 0, '疲劳期 Block 中位播放反而低于 Pass（倒挂负值）: ' + phases[3].blockVsPassDiffPct.toFixed(1) + '%');
assert(phases[3].blockVsPassDiffPct > -6, '疲劳期倒挂幅度约 -3.9% 而非极端值');

var stratified = engine.computeStratifiedVerdictPremium(VIDEOS);
assertClose(stratified.pooledPct, 70.5, 0.5, '分层校正入口的全样本表观溢价仍为 +70.5%');
assertClose(stratified.stratifiedPct, -10.1, 0.3, '按阶段样本量分层加权后的真实溢价约为 -10.1%（辛普森悖论）');
assert(stratified.stratifiedPct < 0, '分层加权溢价方向与全样本表观溢价相反');

console.log('\n=== 6. 四阶段演化与尺度加码（Porn 均分递增） ===');
assertClose(phases[0].stats.medianViews / 10000, 21.0, 0.1, '阶段1(1~214期) 中位播放 21.0 万');
assertClose(phases[1].stats.medianViews / 10000, 130.0, 0.1, '阶段2(215~288期) 中位播放 130.0 万');
assertClose(phases[1].stats.blockRate, 55 / 74, 0.01, '阶段2 Block 率飙升至 74.3%');
for (var pIdx = 1; pIdx < phases.length; pIdx++) {
  assert(phases[pIdx].stats.avgPorn > phases[pIdx - 1].stats.avgPorn,
    '阶段 ' + (pIdx + 1) + ' 腾讯 Porn 均分高于前一阶段 (' + phases[pIdx].stats.avgPorn.toFixed(1) + ' > ' + phases[pIdx - 1].stats.avgPorn.toFixed(1) + ')');
}
assertClose(phases[3].stats.memberRate, 44 / 169, 0.005, '阶段4 会员专享视频占比达 26.0%');
assert(phases[0].stats.corrScoreLogViews < 0, '常服期内综合分与 log(播放) 相关系数为负值（反向）');
assert(Math.abs(allStats.corrScoreLogViews) < 0.35, '全样本综合分与 log(播放) 相关系数较弱（R² 较低）');

console.log('\n=== 7. 订阅整数关口与涨粉效率 ===');
var ms = engine.getSubscriberMilestones();
assert(ms.beforeVideos === 215 && ms.afterVideos === 73, '前 215 期涨 40 万粉 vs 后 73 期涨 110 万粉');
assertClose(ms.speedMultiplier, (110 / 73) / (40 / 215), 0.05, '转型后单期涨粉效率约为转型前的 8.1 倍');

console.log('\n=== 8. 品类拆分与筛选导出功能 ===');
var cats = engine.computeCategoryBreakdown(VIDEOS);
var showCat = cats.filter(function (c) { return c.id === 'show'; })[0];
assert(showCat && showCat.stats.totalCount === 26, '纯身体展示(Show)共 26 期');
assertClose(showCat.stats.memberRate, 21 / 26, 0.005, '纯身体展示(Show)会员专享率高达 80.8%');

var filtered = engine.filterAndSortVideos(VIDEOS, { minScore: 95, sug: 'Block', sortBy: 'views-desc' });
assert(filtered.length > 10 && filtered[0].score >= 95 && filtered[0].sug === 'Block', '多条件筛选与按播放量降序排序正常');

var csvText = engine.toCsvString(VIDEOS.slice(0, 5));
assert(csvText.split('\n').length === 6, 'CSV 导出包含表头与 5 行数据');

console.log('\n——————————');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) {
  console.error('⚠️ 存在失败用例');
  process.exit(1);
} else {
  console.log('🎉 全部通过');
}
