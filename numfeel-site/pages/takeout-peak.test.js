/**
 * takeout-peak-logic.js 单元测试
 * 运行方式：node pages/takeout-peak.test.js
 */

const TakeoutPeakLogic = require('./takeout-peak-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ~${b})`);
}

// 页面默认参数
const DEFAULT_RIDERS = 85;
const DEFAULT_DELIVERY = 25;

// ========== 工具函数 ==========
console.log('\n[gaussian]');
assertClose(TakeoutPeakLogic.gaussian(0, 0, 1), 1, 0.001, 'gaussian(0,0,1) = 1');
assert(TakeoutPeakLogic.gaussian(3, 0, 1) < 0.02, 'gaussian(3,0,1) 接近 0');
assertClose(TakeoutPeakLogic.gaussian(12, 12, 0.6), 1, 0.001, 'gaussian 中心值 = 1');
assert(TakeoutPeakLogic.gaussian(11, 12, 0.4) < TakeoutPeakLogic.gaussian(11.5, 12, 0.4), '离中心越近值越大');

console.log('\n[factorial]');
assert(TakeoutPeakLogic.factorial(0) === 1, '0! = 1');
assert(TakeoutPeakLogic.factorial(1) === 1, '1! = 1');
assert(TakeoutPeakLogic.factorial(5) === 120, '5! = 120');
assert(TakeoutPeakLogic.factorial(10) === 3628800, '10! = 3628800');

console.log('\n[formatHour]');
assert(TakeoutPeakLogic.formatHour(11.75) === '11:45', '11.75 → 11:45');
assert(TakeoutPeakLogic.formatHour(12.0) === '12:00', '12.0 → 12:00');
assert(TakeoutPeakLogic.formatHour(0) === '00:00', '0 → 00:00');
assert(TakeoutPeakLogic.formatHour(23.5) === '23:30', '23.5 → 23:30');

// ========== 到达率曲线 ==========
console.log('\n[generateDailyArrivalRate]');
const rates = TakeoutPeakLogic.generateDailyArrivalRate();
assert(rates.length === 24 * 60, '返回 1440 个值（每分钟一个）');
assert(rates.every(r => r >= 0.02), '所有到达率 >= 0.02');

// 午高峰应该是全天最高
const noonRate = rates[12 * 60 + 10]; // 12:10 是峰值
const midnightRate = rates[3 * 60]; // 03:00
assert(noonRate > midnightRate * 10, `午高峰(${noonRate.toFixed(2)})远高于凌晨(${midnightRate.toFixed(2)})`);

// 晚高峰也应该很高
const dinnerRate = rates[18 * 60 + 10]; // 18:10
assert(dinnerRate > midnightRate * 10, `晚高峰(${dinnerRate.toFixed(2)})远高于凌晨`);
assert(noonRate > dinnerRate, `午高峰(${noonRate.toFixed(2)}) > 晚高峰(${dinnerRate.toFixed(2)})`);

// 关键：到达率在 11:45 → 12:00 → 12:10 应该递增（爬坡阶段）
const rate1145 = rates[11 * 60 + 45];
const rate1200 = rates[12 * 60];
const rate1210 = rates[12 * 60 + 10];
assert(rate1145 < rate1200, `11:45(${rate1145.toFixed(2)}) < 12:00(${rate1200.toFixed(2)}) 正在爬坡`);
assert(rate1200 < rate1210, `12:00(${rate1200.toFixed(2)}) < 12:10(${rate1210.toFixed(2)}) 还没到峰值`);

// 12:10 之后应该开始下降
const rate1230 = rates[12 * 60 + 30];
assert(rate1210 > rate1230, `12:10(${rate1210.toFixed(2)}) > 12:30(${rate1230.toFixed(2)}) 峰值后下降`);

// ========== getAverageRate ==========
console.log('\n[getAverageRate]');
const avgNoon = TakeoutPeakLogic.getAverageRate(rates, 11.5, 12.5);
const avgAfternoon = TakeoutPeakLogic.getAverageRate(rates, 14.5, 15.5);
assert(avgNoon > avgAfternoon, `午高峰均值(${avgNoon.toFixed(2)}) > 下午(${avgAfternoon.toFixed(2)})`);
assert(TakeoutPeakLogic.getAverageRate(rates, 10, 10) === 0, '空区间返回 0');

// ========== Erlang C ==========
console.log('\n[erlangC]');
const pC1 = TakeoutPeakLogic.erlangC(2, 3);
assert(pC1 >= 0 && pC1 <= 1, `Erlang C 概率在 [0,1] 范围内 (${pC1.toFixed(4)})`);
const pC2 = TakeoutPeakLogic.erlangC(2.9, 3);
assert(pC2 > pC1, '负载越高，排队概率越大');
const pCOverload = TakeoutPeakLogic.erlangC(4, 3);
assert(pCOverload === 1, '过载时排队概率 = 1');
// 低负载时排队概率应该很低
const pCLow = TakeoutPeakLogic.erlangC(0.5, 3);
assert(pCLow < 0.05, `低负载排队概率很低 (${pCLow.toFixed(4)})`);

// ========== M/M/c 模型 ==========
console.log('\n[mmcMetrics]');
const m1 = TakeoutPeakLogic.mmcMetrics(2, 1, 3);
assert(m1.utilization > 0 && m1.utilization < 1, `利用率合理 (${m1.utilization.toFixed(3)})`);
assert(m1.waitTime >= 0, `等待时间非负 (${m1.waitTime.toFixed(3)})`);
assert(m1.queueLength >= 0, `队列长度非负 (${m1.queueLength.toFixed(3)})`);
// 过载
const mOverload = TakeoutPeakLogic.mmcMetrics(10, 1, 3);
assert(mOverload.waitTime === Infinity, '过载时等待时间无穷');
assert(mOverload.utilization === 1, '过载时利用率 = 1');
// 低负载
const mLow = TakeoutPeakLogic.mmcMetrics(0.5, 1, 5);
assert(mLow.waitTime < 0.1, `低负载等待时间很短 (${mLow.waitTime.toFixed(4)})`);
assert(mLow.utilization < 0.2, `低负载利用率低 (${mLow.utilization.toFixed(3)})`);

// 非线性爆炸验证：利用率从 80% 到 95%，等待时间应暴涨
const mu = 1 / DEFAULT_DELIVERY;
const lambda80 = 0.80 * DEFAULT_RIDERS * mu;
const lambda95 = 0.95 * DEFAULT_RIDERS * mu;
const m80 = TakeoutPeakLogic.mmcMetrics(lambda80, mu, DEFAULT_RIDERS);
const m95 = TakeoutPeakLogic.mmcMetrics(lambda95, mu, DEFAULT_RIDERS);
const waitRatio = m95.waitTime / m80.waitTime;
assert(waitRatio > 3, `利用率80%→95%，等待时间暴涨 ${waitRatio.toFixed(1)} 倍（应>3倍）`);

// ========== simulateOrderWait（使用页面默认参数） ==========
console.log('\n[simulateOrderWait - 默认参数]');
const order1145 = TakeoutPeakLogic.simulateOrderWait(11.75, DEFAULT_RIDERS, DEFAULT_DELIVERY);
const order1200 = TakeoutPeakLogic.simulateOrderWait(12.0, DEFAULT_RIDERS, DEFAULT_DELIVERY);
const order1000 = TakeoutPeakLogic.simulateOrderWait(10.0, DEFAULT_RIDERS, DEFAULT_DELIVERY);

assert(order1145.totalTime > 0, `11:45 总时间为正 (${order1145.totalTime.toFixed(1)}分)`);
assert(order1200.totalTime > 0, `12:00 总时间为正 (${order1200.totalTime.toFixed(1)}分)`);
assert(order1145.prepTime > 0, '出餐时间为正');
assert(order1145.deliveryTime > 0, '配送时间为正');
assert(order1145.utilization >= 0 && order1145.utilization <= 1, '利用率在合理范围');

// 核心结论验证：12:00 比 11:45 慢很多
assert(order1200.totalTime > order1145.totalTime, `12:00(${order1200.totalTime.toFixed(1)}) > 11:45(${order1145.totalTime.toFixed(1)})`);
const diff1145vs1200 = order1200.totalTime - order1145.totalTime;
assert(diff1145vs1200 > 10, `11:45 vs 12:00 差距 ${diff1145vs1200.toFixed(1)} 分钟（应>10分钟）`);

// 非高峰 vs 高峰差距更大
assert(order1200.totalTime > order1000.totalTime, `12:00(${order1200.totalTime.toFixed(1)}) > 10:00(${order1000.totalTime.toFixed(1)})`);
const diffPeakVsOff = order1200.totalTime - order1000.totalTime;
assert(diffPeakVsOff > 20, `高峰 vs 非高峰差距 ${diffPeakVsOff.toFixed(1)} 分钟（应>20分钟）`);

// 出餐时间在高峰期应该更长（非线性放大）
assert(order1200.prepTime > order1145.prepTime, `12:00出餐(${order1200.prepTime.toFixed(1)}) > 11:45出餐(${order1145.prepTime.toFixed(1)})`);
assert(order1200.prepTime > order1000.prepTime * 1.5, `高峰出餐时间应远大于非高峰（${order1200.prepTime.toFixed(1)} vs ${order1000.prepTime.toFixed(1)}）`);

// 配送时间高峰期也应该更长
assert(order1200.deliveryTime > order1000.deliveryTime, `高峰配送(${order1200.deliveryTime.toFixed(1)}) > 非高峰配送(${order1000.deliveryTime.toFixed(1)})`);

// 总时间应该在合理范围（不应该超过120分钟或低于15分钟）
assert(order1200.totalTime < 120, `高峰总时间合理 (<120分, got ${order1200.totalTime.toFixed(1)})`);
assert(order1000.totalTime > 15, `非高峰总时间合理 (>15分, got ${order1000.totalTime.toFixed(1)})`);

// ========== generateDailyCurve（使用页面默认参数） ==========
console.log('\n[generateDailyCurve - 默认参数]');
const curve = TakeoutPeakLogic.generateDailyCurve(DEFAULT_RIDERS, DEFAULT_DELIVERY, 15);
assert(curve.length === Math.ceil(24 * 60 / 15), `返回 ${Math.ceil(24*60/15)} 个数据点`);
assert(curve[0].hour === 0, '从 0:00 开始');
assert(curve.every(p => p.totalTime > 0), '所有时间点总时间为正');
assert(curve.every(p => p.utilization >= 0 && p.utilization <= 1), '利用率在 [0,1]');

// 午高峰 vs 上午
const noonCurvePoints = curve.filter(p => p.hour >= 11.5 && p.hour <= 12.5);
const mornCurvePoints = curve.filter(p => p.hour >= 9 && p.hour <= 10);
const noonAvgTotal = noonCurvePoints.reduce((s, p) => s + p.totalTime, 0) / noonCurvePoints.length;
const mornAvgTotal = mornCurvePoints.reduce((s, p) => s + p.totalTime, 0) / mornCurvePoints.length;
assert(noonAvgTotal > mornAvgTotal * 1.5, `午高峰(${noonAvgTotal.toFixed(1)}) 远大于上午(${mornAvgTotal.toFixed(1)})`);

// 曲线中应该有明显的峰值
const peakPoint = curve.reduce((max, p) => p.totalTime > max.totalTime ? p : max, curve[0]);
const valleyPoint = curve.filter(p => p.hour >= 7 && p.hour <= 22)
  .reduce((min, p) => p.totalTime < min.totalTime ? p : min, curve[0]);
assert(peakPoint.totalTime > valleyPoint.totalTime * 2, `峰值(${peakPoint.totalTime.toFixed(1)}) > 谷值(${valleyPoint.totalTime.toFixed(1)})的2倍`);

// ========== compareOrderTimes（核心结论验证） ==========
console.log('\n[compareOrderTimes - 核心结论]');
const cmp1 = TakeoutPeakLogic.compareOrderTimes(11.75, 12.0, DEFAULT_RIDERS, DEFAULT_DELIVERY);
assert(cmp1.timeSaved > 10, `11:45 vs 12:00 节省 ${cmp1.timeSaved.toFixed(1)} 分钟（应>10）`);
assert(cmp1.percentFaster > 10, `快了 ${cmp1.percentFaster.toFixed(1)}%（应>10%）`);
assert(cmp1.order1.totalTime < cmp1.order2.totalTime, '11:45 比 12:00 更快');

// 11:30 vs 12:00 差距应该更大
const cmp2 = TakeoutPeakLogic.compareOrderTimes(11.5, 12.0, DEFAULT_RIDERS, DEFAULT_DELIVERY);
assert(cmp2.timeSaved > cmp1.timeSaved, `11:30 vs 12:00(${cmp2.timeSaved.toFixed(1)}) 差距 > 11:45 vs 12:00(${cmp1.timeSaved.toFixed(1)})`);

// 非高峰时段对比差距应该很小
const cmpOff = TakeoutPeakLogic.compareOrderTimes(9.0, 9.25, DEFAULT_RIDERS, DEFAULT_DELIVERY);
assert(cmpOff.timeSaved < 5, `非高峰 9:00 vs 9:15 差距很小 (${cmpOff.timeSaved.toFixed(1)}分)`);

// ========== monteCarloWait（使用页面默认参数） ==========
console.log('\n[monteCarloWait - 默认参数]');
const mcPeak = TakeoutPeakLogic.monteCarloWait(12.0, DEFAULT_RIDERS, DEFAULT_DELIVERY, 2000);
assert(mcPeak.times.length === 2000, '返回 2000 个样本');
assert(mcPeak.avg > 0, `平均等待时间为正 (${mcPeak.avg.toFixed(1)})`);
assert(mcPeak.median > 0, `中位数为正 (${mcPeak.median.toFixed(1)})`);
assert(mcPeak.p90 > mcPeak.median, `P90(${mcPeak.p90.toFixed(1)}) > 中位数(${mcPeak.median.toFixed(1)})`);
assert(mcPeak.min < mcPeak.avg, 'min < avg');
assert(mcPeak.max > mcPeak.avg, 'max > avg');
assert(mcPeak.stdDev > 0, '标准差为正');
// 已排序
let sorted = true;
for (let i = 1; i < mcPeak.times.length; i++) {
  if (mcPeak.times[i] < mcPeak.times[i-1]) { sorted = false; break; }
}
assert(sorted, '蒙特卡洛结果已排序');

// 高峰期平均等待应该在合理范围（30-120分钟）
assert(mcPeak.avg > 30 && mcPeak.avg < 120, `高峰期平均等待合理 (${mcPeak.avg.toFixed(1)}分)`);

// 非高峰蒙特卡洛应该明显更短
const mcOff = TakeoutPeakLogic.monteCarloWait(10.0, DEFAULT_RIDERS, DEFAULT_DELIVERY, 1000);
assert(mcOff.avg < mcPeak.avg, `非高峰平均(${mcOff.avg.toFixed(1)}) < 高峰平均(${mcPeak.avg.toFixed(1)})`);

// P90 和中位数的差距体现了方差（高峰期方差应该更大）
const peakSpread = mcPeak.p90 - mcPeak.median;
const offSpread = mcOff.p90 - mcOff.median;
assert(peakSpread > offSpread, `高峰期方差(${peakSpread.toFixed(1)}) > 非高峰方差(${offSpread.toFixed(1)})`);

// ========== findBestOrderTimes（使用页面默认参数） ==========
console.log('\n[findBestOrderTimes - 默认参数]');
const best = TakeoutPeakLogic.findBestOrderTimes(DEFAULT_RIDERS, DEFAULT_DELIVERY);
assert(best.length === 10, '返回 10 个推荐时段');
assert(best[0].totalTime <= best[9].totalTime, '按总时间升序排列');
assert(best.every(b => b.hour >= 7 && b.hour <= 22), '推荐时段在 7:00-22:00');
assert(best.every(b => b.label.includes(':')), '时间标签格式正确');
// 最佳时段不应该在午高峰
assert(best[0].hour < 11.5 || best[0].hour > 13, `最佳时段(${best[0].label})不在午高峰`);
// 最佳时段的等待时间应该远小于高峰
assert(best[0].totalTime < order1200.totalTime * 0.7, `最佳时段(${best[0].totalTime.toFixed(1)}) 远小于高峰(${order1200.totalTime.toFixed(1)})`);

// ========== 出餐时间非线性放大验证 ==========
console.log('\n[出餐时间非线性放大]');
// 利用率低时出餐接近基础值（8分钟），利用率高时应该远大于基础值
const lowUtilOrder = TakeoutPeakLogic.simulateOrderWait(10.0, DEFAULT_RIDERS, DEFAULT_DELIVERY);
const highUtilOrder = TakeoutPeakLogic.simulateOrderWait(12.17, DEFAULT_RIDERS, DEFAULT_DELIVERY); // 峰值时刻
assert(lowUtilOrder.prepTime < 15, `低利用率出餐时间合理 (${lowUtilOrder.prepTime.toFixed(1)}分)`);
assert(highUtilOrder.prepTime > 20, `高利用率出餐时间明显增长 (${highUtilOrder.prepTime.toFixed(1)}分)`);
const prepRatio = highUtilOrder.prepTime / lowUtilOrder.prepTime;
assert(prepRatio > 2, `出餐时间放大 ${prepRatio.toFixed(1)} 倍（应>2倍，体现非线性）`);

// ========== 晚高峰验证 ==========
console.log('\n[晚高峰验证]');
const orderDinner = TakeoutPeakLogic.simulateOrderWait(18.17, DEFAULT_RIDERS, DEFAULT_DELIVERY);
const orderPreDinner = TakeoutPeakLogic.simulateOrderWait(17.25, DEFAULT_RIDERS, DEFAULT_DELIVERY);
assert(orderDinner.totalTime > orderPreDinner.totalTime, `晚高峰(${orderDinner.totalTime.toFixed(1)}) > 晚高峰前(${orderPreDinner.totalTime.toFixed(1)})`);
const dinnerDiff = orderDinner.totalTime - orderPreDinner.totalTime;
assert(dinnerDiff > 5, `晚高峰提前下单也能省 ${dinnerDiff.toFixed(1)} 分钟`);

// --- 汇总 ---
console.log(`\n${'='.repeat(40)}`);
console.log(`测试结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
