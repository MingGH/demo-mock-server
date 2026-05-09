/**
 * 30年房贷 — 核心逻辑单元测试
 * 运行：node pages/mortgage-30-years/logic.test.js
 */

var logic = require('./logic.js');
var passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

function approx(a, b, tolerance) {
  tolerance = tolerance || 0.01;
  return Math.abs(a - b) / Math.max(Math.abs(b), 1) < tolerance;
}

// ── calcEqualPayment ──
console.log('\n[calcEqualPayment]');

(function() {
  // 100万，30年，3.5%
  var r = logic.calcEqualPayment(100, 3.5, 30);
  assert(r.monthly > 4000 && r.monthly < 5000, '100万30年3.5%月供在4000-5000之间: ' + r.monthly);
  assert(r.totalInterest > 0, '总利息大于0: ' + r.totalInterest);
  assert(r.interestRatio > 50, '利息占本金比例超过50%: ' + r.interestRatio + '%');
  assert(r.totalPayment === r.totalInterest + 100 * 10000, '总还款 = 本金 + 利息');
})();

(function() {
  // 0利率
  var r = logic.calcEqualPayment(100, 0, 30);
  assert(r.totalInterest === 0, '0利率总利息为0');
  assert(r.monthly === Math.round(1000000 / 360), '0利率月供 = 本金/期数');
})();

(function() {
  // 短期高利率
  var r = logic.calcEqualPayment(50, 5, 5);
  assert(r.monthly > 9000, '50万5年5%月供应较高: ' + r.monthly);
  assert(r.interestRatio < 15, '5年利息占比应较低: ' + r.interestRatio + '%');
})();

// ── calcEqualPrincipal ──
console.log('\n[calcEqualPrincipal]');

(function() {
  var r = logic.calcEqualPrincipal(100, 3.5, 30);
  assert(r.firstMonthly > r.lastMonthly, '等额本金首月 > 末月');
  assert(r.totalInterest < logic.calcEqualPayment(100, 3.5, 30).totalInterest, '等额本金总利息 < 等额本息');
})();

// ── generateTimeline ──
console.log('\n[generateTimeline]');

(function() {
  var tl = logic.generateTimeline(100, 3.5, 30);
  assert(tl.length === 30, '30年时间线有30条记录');
  assert(tl[0].interestPaid > tl[0].principalPaid, '第一年利息 > 本金');
  assert(tl[29].remaining <= 1, '最后一年剩余本金接近0: ' + tl[29].remaining);

  // 前几年利息占比高
  var firstYearInterestRatio = tl[0].interestPaid / (tl[0].interestPaid + tl[0].principalPaid);
  assert(firstYearInterestRatio > 0.6, '第一年利息占比超过60%: ' + (firstYearInterestRatio * 100).toFixed(1) + '%');
})();

// ── compareYears ──
console.log('\n[compareYears]');

(function() {
  var data = logic.compareYears(100, 3.5);
  assert(data.length === 6, '对比6种年限');
  assert(data[0].monthly > data[5].monthly, '5年月供 > 30年月供');
  assert(data[0].totalInterest < data[5].totalInterest, '5年总利息 < 30年总利息');
})();

// ── lifeEvents ──
console.log('\n[lifeEvents]');

(function() {
  var events = logic.lifeEvents(28);
  assert(events.length > 10, '人生事件数量 > 10');
  assert(events[0].age === 28, '起始年龄正确');
  assert(events[events.length - 1].year === 30, '最后一个事件在第30年');
})();

// ── pressureIndex ──
console.log('\n[pressureIndex]');

(function() {
  var p1 = logic.pressureIndex(3000, 15000);
  assert(p1.level === '舒适', '3000/15000 = 20% 应为舒适: ' + p1.level);

  var p2 = logic.pressureIndex(6000, 15000);
  assert(p2.level === '紧张', '6000/15000 = 40% 应为紧张: ' + p2.level);

  var p3 = logic.pressureIndex(9000, 15000);
  assert(p3.level === '高压', '9000/15000 = 60% 应为高压: ' + p3.level);

  var p4 = logic.pressureIndex(12000, 15000);
  assert(p4.level === '危险', '12000/15000 = 80% 应为危险: ' + p4.level);
})();

// ── inflationImpact ──
console.log('\n[inflationImpact]');

(function() {
  var data = logic.inflationImpact(5000, 3, 30);
  assert(data.length > 0, '有通胀数据');
  assert(data[0].realMonthly === 5000, '第0年实际月供等于名义月供');
  assert(data[data.length - 1].realMonthly < 5000, '30年后实际购买力下降');
  // 3%通胀30年后购买力约为原来的 1/(1.03^30) ≈ 0.412
  var expected = Math.round(5000 / Math.pow(1.03, 30));
  assert(Math.abs(data[data.length - 1].realMonthly - expected) < 10, '30年后实际值接近理论值: ' + data[data.length - 1].realMonthly + ' vs ' + expected);
})();

// ── calcPrepayment ──
console.log('\n[calcPrepayment]');

(function() {
  var r = logic.calcPrepayment(100, 3.5, 30, 5, 20, 'shorten');
  assert(r.savedInterest > 0, '提前还款节省利息 > 0: ' + r.savedInterest);
  assert(r.newTotalYears < 30, '缩短年限模式下新年限 < 30: ' + r.newTotalYears);
})();

(function() {
  var r = logic.calcPrepayment(100, 3.5, 30, 5, 20, 'reduce');
  assert(r.savedInterest > 0, '减少月供模式节省利息 > 0: ' + r.savedInterest);
  assert(r.newMonthly < logic.calcEqualPayment(100, 3.5, 30).monthly, '新月供 < 原月供');
  assert(r.newTotalYears === 30, '减少月供模式年限不变');
})();

// ── 总结 ──
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) process.exit(1);
else console.log('全部通过 ✓');
