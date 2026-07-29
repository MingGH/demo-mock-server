/**
 * 育碧帝国陨落 - 单元测试
 * 运行：node pages/ubisoft-decline/engine.test.js
 */

// 加载引擎模块
var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('✅ ' + msg);
    passed++;
  } else {
    console.error('❌ ' + msg);
    failed++;
  }
}

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

console.log('=== 育碧帝国陨落 引擎测试 ===\n');

// ── 数据完整性测试 ──
console.log('--- 数据完整性 ---');

assert(engine.MARKET_CAP.length === 9, '市值数据应有9个时间点，实际: ' + engine.MARKET_CAP.length);
assert(engine.TIMELINE.length === 9, '时间线应有9个事件，实际: ' + engine.TIMELINE.length);
assert(engine.COST_COMPARISON.length === 4, '成本对比应有4个项目，实际: ' + engine.COST_COMPARISON.length);
assert(engine.FINANCIAL_COMPARE.length === 5, '财务对比应有5个指标，实际: ' + engine.FINANCIAL_COMPARE.length);
assert(engine.FATAL_BLOWS.length === 4, '作死四连击应有4项，实际: ' + engine.FATAL_BLOWS.length);
assert(engine.HEADCOUNT.length === 5, '员工数据应有5个时间点，实际: ' + engine.HEADCOUNT.length);

// 验证市值数据按时间降序排列（值递减）
var isDeclining = true;
for (var i = 1; i < engine.MARKET_CAP.length; i++) {
  if (engine.MARKET_CAP[i].value > engine.MARKET_CAP[i - 1].value) {
    // 2021年峰值允许比2018年略低（这里100 < 108是正确的）
    // 但从2021之后应该一直下降
    if (engine.MARKET_CAP[i].date > '2021.01') {
      isDeclining = false;
      break;
    }
  }
}
assert(isDeclining, '2021年后市值应持续下降');

// 验证碧海黑帆成本最大
var maxCost = 0;
var maxCostName = '';
for (var j = 0; j < engine.COST_COMPARISON.length; j++) {
  if (engine.COST_COMPARISON[j].cost > maxCost) {
    maxCost = engine.COST_COMPARISON[j].cost;
    maxCostName = engine.COST_COMPARISON[j].name;
  }
}
assert(maxCostName === '《碧海黑帆》', '碧海黑帆成本应为最高，实际最高: ' + maxCostName);

// ── calcDeclinePercent 测试 ──
console.log('\n--- calcDeclinePercent ---');

assertClose(engine.calcDeclinePercent(100, 5), 95.0, 0.1, '100→5 跌幅应为95%');
assertClose(engine.calcDeclinePercent(108, 5.6), 94.8, 0.1, '108→5.6 跌幅应约94.8%');
assertClose(engine.calcDeclinePercent(100, 100), 0, 0.01, '100→100 跌幅应为0%');
assertClose(engine.calcDeclinePercent(100, 0), 100, 0.01, '100→0 跌幅应为100%');
assert(engine.calcDeclinePercent(0, 50) === 0, '峰值为0时应返回0');
assert(engine.calcDeclinePercent(-10, 5) === 0, '负峰值应返回0');

// ── calcCostMultiple 测试 ──
console.log('\n--- calcCostMultiple ---');

assertClose(engine.calcCostMultiple(7.5, 0.4), 18.75, 0.1, '碧海黑帆/黑神话 应约18.75倍');
assertClose(engine.calcCostMultiple(7.5, 4.0), 1.875, 0.01, '碧海黑帆/星鸣特攻 应约1.875倍');
assert(engine.calcCostMultiple(7.5, 0) === 0, '除以0应返回0');
assertClose(engine.calcCostMultiple(7.5, 7.5), 1.0, 0.01, '相同成本应为1倍');

// ── calcRevenuePerEmployee 测试 ──
console.log('\n--- calcRevenuePerEmployee ---');

// 育碧2026财年营收约14亿欧元≈15亿美元，16590人
assertClose(engine.calcRevenuePerEmployee(1500000000, 16590), 90416, 1, '15亿美元/16590人 应约90416美元');
// 测试 9.6万美元/人 的场景（约18.9亿美元营收，约20000人）
assertClose(engine.calcRevenuePerEmployee(1898200000, 18982), 100000, 1, '18.98亿/18982人 应约10万');
assert(engine.calcRevenuePerEmployee(1000000, 0) === 0, '员工数为0应返回0');

// ── formatLargeNumber 测试 ──
console.log('\n--- formatLargeNumber ---');

assert(engine.formatLargeNumber(100000000) === '1.0亿', '1亿应格式化为1.0亿');
assert(engine.formatLargeNumber(20000) === '2.0万', '2万应格式化为2.0万');
assert(engine.formatLargeNumber(500) === '500', '500应保持原样');
assert(engine.formatLargeNumber(-1300000000) === '-13.0亿', '-13亿应格式化为-13.0亿');

// ── findBiggestDecline 测试 ──
console.log('\n--- findBiggestDecline ---');

var biggest = engine.findBiggestDecline(engine.MARKET_CAP);
assert(biggest !== null, '应找到最大跌幅区间');
assert(biggest.declinePercent > 0, '最大跌幅应大于0');
console.log('   最大跌幅区间: ' + biggest.from.date + ' → ' + biggest.to.date + ' (' + biggest.declinePercent + '%)');

// 测试空数组
assert(engine.findBiggestDecline([]) === null, '空数组应返回null');
assert(engine.findBiggestDecline([{ value: 100 }]) === null, '单元素数组应返回null');

// 验证最大跌幅区间（2024.09→2025.03 应该是较大跌幅之一）
var testData = [
  { date: '2024.09', value: 18 },
  { date: '2025.03', value: 14 },
  { date: '2025.12', value: 9.3 }
];
var testBiggest = engine.findBiggestDecline(testData);
assertClose(testBiggest.declinePercent, 33.7, 0.5, '18→9.3的区间跌幅应约33.7%');

// ── countCanceledProjects 测试 ──
console.log('\n--- countCanceledProjects ---');

assert(engine.countCanceledProjects() === 13, '取消项目总数应为13（7+6）');

// ── 研发支出数据验证 ──
console.log('\n--- 研发支出数据 ---');

assert(engine.RD_SPENDING.total === 18.55, '研发总支出应为18.55亿欧元');
assert(engine.RD_SPENDING.sunk === 13.9, '沉没成本应为13.9亿欧元');
assert(engine.RD_SPENDING.sunkPercent === 75, '沉没成本占比应为75%');
assertClose(engine.RD_SPENDING.sunk / engine.RD_SPENDING.total * 100, 75.0, 1, '沉没成本占比计算验证');

// ── 时间线数据验证 ──
console.log('\n--- 时间线数据 ---');

var hasPeak = false;
var hasBad = false;
for (var k = 0; k < engine.TIMELINE.length; k++) {
  if (engine.TIMELINE[k].type === 'peak') hasPeak = true;
  if (engine.TIMELINE[k].type === 'bad') hasBad = true;
}
assert(hasPeak, '时间线应包含peak类型事件');
assert(hasBad, '时间线应包含bad类型事件');

// 验证时间线按时间排序
var isChronological = true;
for (var m = 1; m < engine.TIMELINE.length; m++) {
  if (engine.TIMELINE[m].date < engine.TIMELINE[m - 1].date) {
    isChronological = false;
    break;
  }
}
assert(isChronological, '时间线应按时间正序排列');

// ── 结果统计 ──
console.log('\n=== 测试结果 ===');
console.log('通过: ' + passed + ' / 失败: ' + failed);
if (failed > 0) {
  console.error('\n❌ 有 ' + failed + ' 个测试失败！');
  process.exit(1);
} else {
  console.log('\n✅ 全部通过！');
}
