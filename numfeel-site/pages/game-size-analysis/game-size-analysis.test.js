/**
 * 游戏体积膨胀分析 - 单元测试
 * 运行：node pages/game-size-analysis/game-size-analysis.test.js
 */

// 加载引擎模块
var engine = require('./engine.js');

var passed = 0;
var failed = 0;

// 断言：条件为真则通过
function assert(condition, msg) {
  if (condition) {
    console.log('✅ ' + msg);
    passed++;
  } else {
    console.error('❌ ' + msg);
    failed++;
  }
}

// 断言：浮点数近似相等
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    console.log('✅ ' + msg + ' (实际: ' + actual + ', 期望: ' + expected + ')');
    passed++;
  } else {
    console.error('❌ ' + msg + ' (实际: ' + actual + ', 期望: ' + expected + ', 容差: ' + tol + ')');
    failed++;
  }
}

console.log('=== 游戏体积膨胀分析 引擎测试 ===\n');

// ── 数据完整性测试 ──
console.log('--- 数据完整性 ---');

assert(engine.TF2_CODE_STATS.tf2GameCodeMB === 53, 'TF2 游戏专属代码应为 53MB');
assert(engine.TF2_CODE_STATS.gameInstallMB === 29000, 'TF2 安装包大小应为 29000MB');
assert(engine.TF2_CODE_STATS.totalLines === 2233657, '全部代码行数应为 2233657');
assert(engine.TF2_CODE_STATS.tf2Lines === 533158, 'TF2 专属代码行数应为 533158');
assert(engine.TF2_CODE_STATS.totalSourceMB === 481, 'Source SDK 全部源码应为 481MB');
assert(engine.TF2_CODE_STATS.gitSizeMB === 113, '.git 目录大小应为 113MB');
assert(engine.TF2_CODE_STATS.materialSystemLines === 50014, '材质系统代码行数应为 50014');

assert(engine.TF2_TIMELINE.length === 8, '时间线应有 8 个时间点，实际: ' + engine.TF2_TIMELINE.length);
assert(engine.CONTENT_BREAKDOWN.length === 7, '内容拆解应有 7 项，实际: ' + engine.CONTENT_BREAKDOWN.length);
assert(engine.GAME_COMPARISON.length === 13, '游戏对比应有 13 项，实际: ' + engine.GAME_COMPARISON.length);
assert(engine.GROWTH_FACTORS.length === 5, '膨胀因素应有 5 项，实际: ' + engine.GROWTH_FACTORS.length);

// 验证时间线按年份升序排列
var isChronological = true;
for (var i = 1; i < engine.TF2_TIMELINE.length; i++) {
  if (engine.TF2_TIMELINE[i].year < engine.TF2_TIMELINE[i - 1].year) {
    isChronological = false;
    break;
  }
}
assert(isChronological, '时间线应按年份升序排列');

// 验证时间线首尾年份与体积
assert(engine.TF2_TIMELINE[0].year === 2007, '时间线首项年份应为 2007');
assert(engine.TF2_TIMELINE[0].sizeGB === 5, '时间线首发体积应为 5GB');
assert(engine.TF2_TIMELINE[engine.TF2_TIMELINE.length - 1].year === 2025, '时间线末项年份应为 2025');
assert(engine.TF2_TIMELINE[engine.TF2_TIMELINE.length - 1].sizeGB === 29, '时间线当前体积应为 29GB');

// 验证时间线每项含必要字段
var timelineFieldsOk = true;
for (var t = 0; t < engine.TF2_TIMELINE.length; t++) {
  var item = engine.TF2_TIMELINE[t];
  if (typeof item.year !== 'number' || typeof item.sizeGB !== 'number' || typeof item.event !== 'string') {
    timelineFieldsOk = false;
    break;
  }
}
assert(timelineFieldsOk, '时间线每项应含 year/sizeGB/event 字段');

// 验证内容拆解百分比总和为 100
var pctSum = 0;
for (var p = 0; p < engine.CONTENT_BREAKDOWN.length; p++) {
  pctSum += engine.CONTENT_BREAKDOWN[p].percentage;
}
assert(pctSum === 100, '内容拆解百分比总和应为 100，实际: ' + pctSum);

// 验证内容拆解最大项为贴图纹理
var maxBreakdown = 0;
var maxBreakdownCat = '';
for (var b = 0; b < engine.CONTENT_BREAKDOWN.length; b++) {
  if (engine.CONTENT_BREAKDOWN[b].sizeGB > maxBreakdown) {
    maxBreakdown = engine.CONTENT_BREAKDOWN[b].sizeGB;
    maxBreakdownCat = engine.CONTENT_BREAKDOWN[b].category;
  }
}
assert(maxBreakdownCat === '贴图纹理', '内容拆解最大项应为贴图纹理，实际: ' + maxBreakdownCat);

// 验证膨胀因素每项含必要字段
var factorFieldsOk = true;
for (var f = 0; f < engine.GROWTH_FACTORS.length; f++) {
  var fac = engine.GROWTH_FACTORS[f];
  if (typeof fac.id !== 'string' || typeof fac.title !== 'string' ||
      typeof fac.stat !== 'string' || typeof fac.statLabel !== 'string') {
    factorFieldsOk = false;
    break;
  }
}
assert(factorFieldsOk, '膨胀因素每项应含 id/title/stat/statLabel 字段');

// ── getCodePercentage 测试 ──
console.log('\n--- getCodePercentage ---');

assertClose(engine.getCodePercentage(), (53 / 29000) * 100, 1e-9, 'TF2 代码占安装包百分比应为 (53/29000)*100');
assertClose(engine.getCodePercentage(), 0.1827586, 1e-4, 'TF2 代码百分比应约 0.1828%');
assert(engine.getCodePercentage() > 0, 'TF2 代码百分比应大于 0');
assert(engine.getCodePercentage() < 1, 'TF2 代码百分比应小于 1%');

// ── getTotalCodePercentage 测试 ──
console.log('\n--- getTotalCodePercentage ---');

assertClose(engine.getTotalCodePercentage(), (481 / 29000) * 100, 1e-9, '全部源码占安装包百分比应为 (481/29000)*100');
assertClose(engine.getTotalCodePercentage(), 1.6586206, 1e-4, '全部源码百分比应约 1.6586%');
assert(engine.getTotalCodePercentage() > engine.getCodePercentage(), '全部源码百分比应大于 TF2 代码百分比');

// ── getGrowthMultiplier 测试 ──
console.log('\n--- getGrowthMultiplier ---');

assertClose(engine.getGrowthMultiplier(), 29 / 5, 1e-9, '体积膨胀倍数应为 29/5');
assertClose(engine.getGrowthMultiplier(), 5.8, 1e-9, '体积膨胀倍数应为 5.8');
assert(engine.getGrowthMultiplier() > 1, '膨胀倍数应大于 1');

// ── validateBreakdown 测试 ──
console.log('\n--- validateBreakdown ---');

assert(engine.validateBreakdown() === true, '内容拆解总和应在 28-30GB 范围内');

// 手动核算总和
var sizeSum = 0;
for (var s = 0; s < engine.CONTENT_BREAKDOWN.length; s++) {
  sizeSum += engine.CONTENT_BREAKDOWN[s].sizeGB;
}
assertClose(sizeSum, 29, 1e-9, '内容拆解体积总和应为 29GB');
assert(sizeSum >= 28 && sizeSum <= 30, '体积总和应在合理区间 [28, 30] 内');

// ── getLargestGame 测试 ──
console.log('\n--- getLargestGame ---');

// 全范围：最大应为使命召唤 MW（175GB, 2019）
var largestAll = engine.getLargestGame(1993, 2025);
assert(largestAll !== null, '全范围应能找到最大游戏');
assert(largestAll.name === '使命召唤 MW', '全范围最大游戏应为使命召唤 MW，实际: ' + largestAll.name);
assertClose(largestAll.sizeGB, 175, 1e-9, '全范围最大游戏体积应为 175GB');

// 早期游戏范围：DOOM(0.012) 与 Quake III(0.5)，最大为 Quake III
var largestEarly = engine.getLargestGame(1993, 1999);
assert(largestEarly !== null, '1993-1999 范围应能找到最大游戏');
assert(largestEarly.name === 'Quake III Arena', '1993-1999 最大游戏应为 Quake III Arena，实际: ' + largestEarly.name);
assertClose(largestEarly.sizeGB, 0.5, 1e-9, 'Quake III Arena 体积应为 0.5GB');

// 2007-2010 范围：仅有 TF2 首发为 5GB
var largestTf2 = engine.getLargestGame(2007, 2010);
assert(largestTf2 !== null, '2007-2010 范围应能找到最大游戏');
assert(largestTf2.name === 'TF2（首发）', '2007-2010 最大游戏应为 TF2（首发），实际: ' + largestTf2.name);
assertClose(largestTf2.sizeGB, 5, 1e-9, 'TF2（首发）体积应为 5GB');

// 2020-2025 范围：赛博朋克(70)、博德之门3(150)、黑神话(130)、TF2当前(29)，最大为博德之门 3
var largestRecent = engine.getLargestGame(2020, 2025);
assert(largestRecent !== null, '2020-2025 范围应能找到最大游戏');
assert(largestRecent.name === '博德之门 3', '2020-2025 最大游戏应为博德之门 3，实际: ' + largestRecent.name);
assertClose(largestRecent.sizeGB, 150, 1e-9, '博德之门 3 体积应为 150GB');

// 无游戏匹配的范围应返回 null
assert(engine.getLargestGame(1990, 1992) === null, '无游戏匹配的范围应返回 null');
assert(engine.getLargestGame(2100, 2200) === null, '未来年份范围应返回 null');

// 边界年份包含测试：2019 单年应返回使命召唤 MW
var singleYear = engine.getLargestGame(2019, 2019);
assert(singleYear !== null && singleYear.name === '使命召唤 MW', '2019 单年应返回使命召唤 MW');

// ── formatSize 测试 ──
console.log('\n--- formatSize ---');

assert(engine.formatSize(29) === '29 GB', '29GB 应格式化为 29 GB，实际: ' + engine.formatSize(29));
assert(engine.formatSize(65) === '65 GB', '65GB 应格式化为 65 GB，实际: ' + engine.formatSize(65));
assert(engine.formatSize(150) === '150 GB', '150GB 应格式化为 150 GB，实际: ' + engine.formatSize(150));
assert(engine.formatSize(10.2) === '10 GB', '10.2GB 应格式化为 10 GB（四舍五入），实际: ' + engine.formatSize(10.2));
assert(engine.formatSize(5) === '5.0 GB', '5GB 应格式化为 5.0 GB（保留一位小数），实际: ' + engine.formatSize(5));
assert(engine.formatSize(2.5) === '2.5 GB', '2.5GB 应格式化为 2.5 GB，实际: ' + engine.formatSize(2.5));
assert(engine.formatSize(0.5) === '512 MB', '0.5GB 应格式化为 512 MB，实际: ' + engine.formatSize(0.5));
assert(engine.formatSize(0.012) === '12 MB', '0.012GB 应格式化为 12 MB，实际: ' + engine.formatSize(0.012));
assert(engine.formatSize(0.0005) === '524 KB', '0.0005GB 应格式化为 524 KB，实际: ' + engine.formatSize(0.0005));

// ── formatPercentage 测试 ──
console.log('\n--- formatPercentage ---');

assert(engine.formatPercentage(0.1827586) === '0.18%', '0.1827586 默认两位小数应为 0.18%，实际: ' + engine.formatPercentage(0.1827586));
assert(engine.formatPercentage(0.1827586, 4) === '0.1828%', '0.1827586 四位小数应为 0.1828%，实际: ' + engine.formatPercentage(0.1827586, 4));
assert(engine.formatPercentage(1.6586206) === '1.66%', '1.6586206 应为 1.66%，实际: ' + engine.formatPercentage(1.6586206));
assert(engine.formatPercentage(100) === '100.00%', '100 默认应为 100.00%，实际: ' + engine.formatPercentage(100));
assert(engine.formatPercentage(0, 0) === '0%', '0 零位小数应为 0%，实际: ' + engine.formatPercentage(0, 0));
assert(engine.formatPercentage(33.3333, 1) === '33.3%', '33.3333 一位小数应为 33.3%，实际: ' + engine.formatPercentage(33.3333, 1));

// ── formatNumber 测试 ──
console.log('\n--- formatNumber ---');

assert(engine.formatNumber(2233657) === '2,233,657', '2233657 应格式化为 2,233,657，实际: ' + engine.formatNumber(2233657));
assert(engine.formatNumber(533158) === '533,158', '533158 应格式化为 533,158，实际: ' + engine.formatNumber(533158));
assert(engine.formatNumber(1000) === '1,000', '1000 应格式化为 1,000，实际: ' + engine.formatNumber(1000));
assert(engine.formatNumber(500) === '500', '500 应保持原样，实际: ' + engine.formatNumber(500));
assert(engine.formatNumber(0) === '0', '0 应保持原样，实际: ' + engine.formatNumber(0));

// ── calculateMultiplier 测试 ──
console.log('\n--- calculateMultiplier ---');

assertClose(engine.calculateMultiplier(29, 5), 5.8, 1e-9, '29/5 应为 5.8');
assertClose(engine.calculateMultiplier(100, 50), 2, 1e-9, '100/50 应为 2');
assertClose(engine.calculateMultiplier(175, 5), 35, 1e-9, '175/5 应为 35');
assert(engine.calculateMultiplier(100, 0) === 0, '除以 0 应返回 0');
assertClose(engine.calculateMultiplier(50, 100), 0.5, 1e-9, '50/100 应为 0.5');
assertClose(engine.calculateMultiplier(10, 10), 1, 1e-9, '10/10 应为 1');

// ── 结果统计 ──
console.log('\n=== 测试结果 ===');
console.log('通过: ' + passed + ' / 失败: ' + failed);
if (failed > 0) {
  console.error('\n❌ 有 ' + failed + ' 个测试失败！');
  process.exit(1);
} else {
  console.log('\n✅ 全部通过！');
}
