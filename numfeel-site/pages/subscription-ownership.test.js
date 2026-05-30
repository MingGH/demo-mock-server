const SOL = require('./subscription-ownership-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  ✓ ' + message);
    passed++;
  } else {
    console.error('  ✗ ' + message);
    failed++;
  }
}

function assertClose(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, message + ' (got ' + actual + ', expected ~' + expected + ')');
}

console.log('\n[PRESET_SERVICES]');
assert(SOL.PRESET_SERVICES.length >= 10, '预设服务数量足够');
assert(SOL.PRESET_SERVICES.every(function (service) {
  return service.id && service.name && service.monthlyPrice > 0 && service.icon && service.category;
}), '所有预设服务字段完整');

console.log('\n[CATEGORIES]');
assert(Object.keys(SOL.CATEGORIES).length >= 5, '分类数量足够');
assert(SOL.CATEGORIES.storage === '存储', '存储分类命名正确');

console.log('\n[cloneService]');
const cloned = SOL.cloneService('icloud-200');
assert(cloned && cloned.name === 'iCloud 200GB', '可以克隆指定服务');
cloned.dependency = 1;
assert(SOL.cloneService('icloud-200').dependency === 4, '克隆对象不会污染原始预设');
assert(SOL.cloneService('not-exist') === null, '未知服务返回 null');

console.log('\n[annualCost & breakEvenMonths]');
assert(SOL.annualCost({ monthlyPrice: 25 }) === 300, '月费 25 的年费为 300');
assert(SOL.breakEvenMonths({ monthlyPrice: 21, buyoutPrice: 499 }) === 24, 'iCloud 买断回本约 24 个月');
assert(SOL.breakEvenMonths({ monthlyPrice: 140, buyoutPrice: null }) === null, '无买断方案返回 null');

console.log('\n[ownershipComponents]');
const cheapOwned = SOL.ownershipComponents({
  buyoutPrice: 499,
  portability: 4,
  shutdownRisk: 1,
  lockIn: 2,
  priceRisk: 2,
  dependency: 2
});
const pureSubscription = SOL.ownershipComponents({
  buyoutPrice: null,
  portability: 2,
  shutdownRisk: 3,
  lockIn: 4,
  priceRisk: 4,
  dependency: 4
});
assert(cheapOwned.total > pureSubscription.total, '存在买断替代且可迁移的服务拥有感更高');
assert(cheapOwned.control > pureSubscription.control, '有买断替代时控制权更高');

console.log('\n[analyzePortfolio]');
const portfolio = [
  SOL.cloneService('qq-music'),
  SOL.cloneService('icloud-200'),
  SOL.cloneService('chatgpt-plus'),
  SOL.cloneService('wps-vip')
];
portfolio[0].dependency = 3;
portfolio[1].dependency = 5;
portfolio[2].dependency = 4;
portfolio[3].dependency = 3;
const analysis = SOL.analyzePortfolio(portfolio, 5);
assertClose(analysis.totalMonthly, 191, 0.01, '组合月费统计正确');
assertClose(analysis.totalAnnual, 2292, 0.01, '组合年费统计正确');
assertClose(analysis.totalHorizon, 11460, 0.01, '5 年总花费统计正确');
assertClose(analysis.totalBuyout, 1358, 0.01, '可买断替代总价统计正确');
assertClose(analysis.comparableSubscriptionCost, 3060, 0.01, '可买断项目 5 年订阅成本正确');
assert(analysis.ownershipScore >= 0 && analysis.ownershipScore <= 100, '组合得分位于 0-100');
assert(analysis.breakEvenList.length === 3, '可买断项目数量正确');
assert(analysis.breakEvenList[0].breakEvenMonths <= analysis.breakEvenList[1].breakEvenMonths, '回本列表按月份升序排序');

console.log('\n[costCurve]');
const curve = SOL.costCurve(portfolio, 3);
assert(curve.labels.length === 3, '成本曲线长度正确');
assertClose(curve.subscription[0], analysis.totalAnnual, 0.01, '第一年总订阅成本等于年费');
assertClose(curve.comparableBuyout[2], analysis.totalBuyout, 0.01, '可买断替代曲线为一次性成本');
assert(curve.subscription[2] > curve.subscription[1], '订阅曲线随时间上升');

console.log('\n[cancelAllScenario]');
const cancelShock = SOL.cancelAllScenario(portfolio);
assert(cancelShock.serviceCount === 4, '停订冲击服务数正确');
assert(cancelShock.severeCount >= 1, '至少存在高冲击项');
assert(cancelShock.lossScore > 0, '断供冲击分为正');
assert(cancelShock.impacts[0].dependency >= cancelShock.impacts[cancelShock.impacts.length - 1].dependency, '断供列表按依赖度排序');

console.log('\n[priceShockScenario]');
const priceShock = SOL.priceShockScenario(portfolio, 0.2);
assert(priceShock.extraMonthly > 0, '涨价后月新增金额为正');
assertClose(priceShock.extraAnnual, priceShock.extraMonthly * 12, 0.2, '年新增约等于月新增乘 12');
assert(priceShock.hardestHit && priceShock.hardestHit.monthlyIncrease >= priceShock.details[1].monthlyIncrease, '最受冲击项排序正确');

console.log('\n[contentShockScenario]');
const contentShock = SOL.contentShockScenario(portfolio, 0.3);
assert(contentShock.affectedCount >= 1, '内容下架会命中内容型订阅');
assert(contentShock.monthlyValueLoss > 0, '内容缩水价值损失为正');

console.log('\n[scoreLabel]');
assert(SOL.scoreLabel(85) === '很强', '85 分标签正确');
assert(SOL.scoreLabel(65) === '还行', '65 分标签正确');
assert(SOL.scoreLabel(45) === '偏弱', '45 分标签正确');
assert(SOL.scoreLabel(20) === '很低', '20 分标签正确');

console.log('\n' + '='.repeat(40));
console.log('测试结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exit(1);
