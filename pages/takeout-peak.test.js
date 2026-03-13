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

// --- gaussian ---
console.log('\n[gaussian]');
assertClose(TakeoutPeakLogic.gaussian(0, 0, 1), 1, 0.001, 'gaussian(0,0,1) = 1');
assert(TakeoutPeakLogic.gaussian(3, 0, 1) < 0.02, 'gaussian(3,0,1) 接近 0');
assertClose(TakeoutPeakLogic.gaussian(12, 12, 0.6), 1, 0.001, 'gaussian 中心值 = 1');

// --- factorial ---
console.log('\n[factorial]');
assert(TakeoutPeakLogic.factorial(0) === 1, '0! = 1');
assert(TakeoutPeakLogic.factorial(1) === 1, '1! = 1');
assert(TakeoutPeakLogic.factorial(5) === 120, '5! = 120');
assert(TakeoutPeakLogic.factorial(10) === 3628800, '10! = 3628800');

// --- formatHour ---
console.log('\n[formatHour]');
assert(TakeoutPeakLogic.formatHour(11.75) === '11:45', '11.75 → 11:45');
assert(TakeoutPeakLogic.formatHour(12.0) === '12:00', '12.0 → 12:00');
assert(TakeoutPeakLogic.formatHour(0) === '00:00', '0 → 00:00');
assert(TakeoutPeakLogic.formatHour(23.5) === '23:30', '23.5 → 23:30');

// --- generateDailyArrivalRate ---
console.log('\n[generateDailyArrivalRate]');
const rates = TakeoutPeakLogic.generateDailyArrivalRate();
assert(rates.length === 24 * 60, '返回 1440 个值（每分钟一个）');
assert(rates.every(r => r >= 0.1), '所有到达率 >= 0.1');
// 午高峰应该是全天最高
const noonRate = rates[12 * 60]; // 12:00
const midnightRate = rates[3 * 60]; // 03:00
assert(noonRate > midnightRate * 5, `午高峰(${noonRate.toFixed(1)})远高于凌晨(${midnightRate.toFixed(1)})`);
// 晚高峰也应该很高
const dinnerRate = rates[18 * 60]; // 18:00
assert(dinnerRate > midnightRate * 3, `晚高峰(${dinnerRate.toFixed(1)})远高于凌晨`);

// --- getAverageRate ---
console.log('\n[getAverageRate]');
const avgNoon = TakeoutPeakLogic.getAverageRate(rates, 11.5, 12.5);
const avgAfternoon = TakeoutPeakLogic.getAverageRate(rates, 14.5, 15.5);
assert(avgNoon > avgAfternoon, `午高峰均值(${avgNoon.toFixed(1)}) > 下午(${avgAfternoon.toFixed(1)})`);
assert(TakeoutPeakLogic.getAverageRate(rates, 10, 10) === 0, '空区间返回 0');

// --- erlangC ---
console.log('\n[erlangC]');
const pC1 = TakeoutPeakLogic.erlangC(2, 3);
assert(pC1 >= 0 && pC1 <= 1, `Erlang C 概率在 [0,1] 范围内 (${pC1.toFixed(4)})`);
const pC2 = TakeoutPeakLogic.erlangC(2.9, 3);
assert(pC2 > pC1, '负载越高，排队概率越大');
const pCOverload = TakeoutPeakLogic.erlangC(4, 3);
assert(pCOverload === 1, '过载时排队概率 = 1');

// --- mmcMetrics ---
console.log('\n[mmcMetrics]');
const m1 = TakeoutPeakLogic.mmcMetrics(2, 1, 3);
assert(m1.utilization > 0 && m1.utilization < 1, `利用率合理 (${m1.utilization.toFixed(3)})`);
assert(m1.waitTime >= 0, `等待时间非负 (${m1.waitTime.toFixed(3)})`);
assert(m1.queueLength >= 0, `队列长度非负 (${m1.queueLength.toFixed(3)})`);
// 过载情况
const mOverload = TakeoutPeakLogic.mmcMetrics(10, 1, 3);
assert(mOverload.waitTime === Infinity, '过载时等待时间无穷');
assert(mOverload.utilization === 1, '过载时利用率 = 1');
// 低负载
const mLow = TakeoutPeakLogic.mmcMetrics(0.5, 1, 5);
assert(mLow.waitTime < 0.1, `低负载等待时间很短 (${mLow.waitTime.toFixed(4)})`);
assert(mLow.utilization < 0.2, `低负载利用率低 (${mLow.utilization.toFixed(3)})`);

// --- simulateOrderWait ---
console.log('\n[simulateOrderWait]');
const earlyOrder = TakeoutPeakLogic.simulateOrderWait(11.5, 500, 25);
const peakOrder = TakeoutPeakLogic.simulateOrderWait(12.0, 500, 25);
assert(earlyOrder.totalTime > 0, `11:30 下单总时间为正 (${earlyOrder.totalTime.toFixed(1)}分钟)`);
assert(peakOrder.totalTime > 0, `12:00 下单总时间为正 (${peakOrder.totalTime.toFixed(1)}分钟)`);
assert(peakOrder.totalTime > earlyOrder.totalTime, `12:00(${peakOrder.totalTime.toFixed(1)}) 比 11:30(${earlyOrder.totalTime.toFixed(1)}) 等更久`);
assert(earlyOrder.prepTime > 0, '出餐时间为正');
assert(earlyOrder.deliveryTime > 0, '配送时间为正');

// --- generateDailyCurve ---
console.log('\n[generateDailyCurve]');
const curve = TakeoutPeakLogic.generateDailyCurve(50, 25, 15);
assert(curve.length === Math.ceil(24 * 60 / 15), `返回 ${Math.ceil(24*60/15)} 个数据点`);
assert(curve[0].hour === 0, '从 0:00 开始');
assert(curve.every(p => p.totalTime > 0), '所有时间点总时间为正');
assert(curve.every(p => p.utilization >= 0 && p.utilization <= 1), '利用率在 [0,1]');
// 找午高峰
const noonPoints = curve.filter(p => p.hour >= 11.5 && p.hour <= 12.5);
const earlyPoints = curve.filter(p => p.hour >= 9 && p.hour <= 10);
const noonAvgTotal = noonPoints.reduce((s, p) => s + p.totalTime, 0) / noonPoints.length;
const earlyAvgTotal = earlyPoints.reduce((s, p) => s + p.totalTime, 0) / earlyPoints.length;
assert(noonAvgTotal > earlyAvgTotal, `午高峰等待(${noonAvgTotal.toFixed(1)}) > 上午(${earlyAvgTotal.toFixed(1)})`);

// --- compareOrderTimes ---
console.log('\n[compareOrderTimes]');
const cmp = TakeoutPeakLogic.compareOrderTimes(11.5, 12.0, 500, 25);
assert(cmp.timeSaved > 0, `提前30分钟下单节省 ${cmp.timeSaved.toFixed(1)} 分钟`);
assert(cmp.percentFaster > 0, `快了 ${cmp.percentFaster.toFixed(1)}%`);
assert(cmp.order1.totalTime < cmp.order2.totalTime, '11:30 比 12:00 更快');

// --- monteCarloWait ---
console.log('\n[monteCarloWait]');
const mc = TakeoutPeakLogic.monteCarloWait(12.0, 50, 25, 1000);
assert(mc.times.length === 1000, '返回 1000 个样本');
assert(mc.avg > 0, `平均等待时间为正 (${mc.avg.toFixed(1)})`);
assert(mc.median > 0, `中位数为正 (${mc.median.toFixed(1)})`);
assert(mc.p90 > mc.median, `P90(${mc.p90.toFixed(1)}) > 中位数(${mc.median.toFixed(1)})`);
assert(mc.min < mc.avg, 'min < avg');
assert(mc.max > mc.avg, 'max > avg');
assert(mc.stdDev > 0, '标准差为正');
// 已排序
for (let i = 1; i < mc.times.length; i++) {
  if (mc.times[i] < mc.times[i-1]) {
    assert(false, '蒙特卡洛结果应已排序');
    break;
  }
}

// --- findBestOrderTimes ---
console.log('\n[findBestOrderTimes]');
const best = TakeoutPeakLogic.findBestOrderTimes(50, 25);
assert(best.length === 10, '返回 10 个推荐时段');
assert(best[0].totalTime <= best[9].totalTime, '按总时间升序排列');
assert(best.every(b => b.hour >= 7 && b.hour <= 22), '推荐时段在 7:00-22:00');
assert(best.every(b => b.label.includes(':')), '时间标签格式正确');
// 最佳时段不应该在正午高峰
assert(best[0].hour < 11.5 || best[0].hour > 13, `最佳时段(${best[0].label})不在午高峰`);

// --- 汇总 ---
console.log(`\n${'='.repeat(40)}`);
console.log(`测试结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
