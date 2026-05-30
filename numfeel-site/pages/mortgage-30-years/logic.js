/**
 * 30年房贷计算核心逻辑（可独立测试）
 */

/**
 * 等额本息月供计算
 * @param {number} principal - 贷款本金（万元）
 * @param {number} annualRate - 年利率（如 3.5 表示 3.5%）
 * @param {number} years - 贷款年限
 * @returns {{monthly: number, totalPayment: number, totalInterest: number, interestRatio: number}}
 */
function calcEqualPayment(principal, annualRate, years) {
  var P = principal * 10000; // 转为元
  var r = annualRate / 100 / 12; // 月利率
  var n = years * 12; // 总期数

  if (r === 0) {
    return {
      monthly: Math.round(P / n),
      totalPayment: P,
      totalInterest: 0,
      interestRatio: 0
    };
  }

  var monthly = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  var totalPayment = monthly * n;
  var totalInterest = totalPayment - P;

  return {
    monthly: Math.round(monthly),
    totalPayment: Math.round(totalPayment),
    totalInterest: Math.round(totalInterest),
    interestRatio: parseFloat((totalInterest / P * 100).toFixed(1))
  };
}

/**
 * 等额本金月供计算（返回每月明细）
 * @param {number} principal - 贷款本金（万元）
 * @param {number} annualRate - 年利率（如 3.5 表示 3.5%）
 * @param {number} years - 贷款年限
 * @returns {{firstMonthly: number, lastMonthly: number, totalPayment: number, totalInterest: number, interestRatio: number}}
 */
function calcEqualPrincipal(principal, annualRate, years) {
  var P = principal * 10000;
  var r = annualRate / 100 / 12;
  var n = years * 12;

  var monthlyPrincipal = P / n;
  var totalInterest = 0;

  for (var i = 0; i < n; i++) {
    var remaining = P - monthlyPrincipal * i;
    totalInterest += remaining * r;
  }

  var firstMonthly = monthlyPrincipal + P * r;
  var lastMonthly = monthlyPrincipal + monthlyPrincipal * r;
  var totalPayment = P + totalInterest;

  return {
    firstMonthly: Math.round(firstMonthly),
    lastMonthly: Math.round(lastMonthly),
    totalPayment: Math.round(totalPayment),
    totalInterest: Math.round(totalInterest),
    interestRatio: parseFloat((totalInterest / P * 100).toFixed(1))
  };
}

/**
 * 生成还款时间线数据（等额本息，按年汇总）
 * @param {number} principal - 贷款本金（万元）
 * @param {number} annualRate - 年利率
 * @param {number} years - 贷款年限
 * @returns {Array<{year: number, principalPaid: number, interestPaid: number, remaining: number, cumulativeInterest: number}>}
 */
function generateTimeline(principal, annualRate, years) {
  var P = principal * 10000;
  var r = annualRate / 100 / 12;
  var n = years * 12;

  if (r === 0) {
    var timeline = [];
    for (var y = 1; y <= years; y++) {
      timeline.push({
        year: y,
        principalPaid: Math.round(P / years),
        interestPaid: 0,
        remaining: Math.round(P - P / years * y),
        cumulativeInterest: 0
      });
    }
    return timeline;
  }

  var monthly = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  var remaining = P;
  var cumulativeInterest = 0;
  var timeline = [];

  for (var y = 1; y <= years; y++) {
    var yearPrincipal = 0;
    var yearInterest = 0;

    for (var m = 0; m < 12; m++) {
      var monthInterest = remaining * r;
      var monthPrincipal = monthly - monthInterest;
      yearPrincipal += monthPrincipal;
      yearInterest += monthInterest;
      remaining -= monthPrincipal;
    }

    cumulativeInterest += yearInterest;
    timeline.push({
      year: y,
      principalPaid: Math.round(yearPrincipal),
      interestPaid: Math.round(yearInterest),
      remaining: Math.round(Math.max(0, remaining)),
      cumulativeInterest: Math.round(cumulativeInterest)
    });
  }

  return timeline;
}

/**
 * 计算提前还款节省的利息
 * @param {number} principal - 贷款本金（万元）
 * @param {number} annualRate - 年利率
 * @param {number} totalYears - 原始贷款年限
 * @param {number} prepayYear - 第几年提前还款
 * @param {number} prepayAmount - 提前还款金额（万元）
 * @param {string} mode - 'shorten' 缩短年限 | 'reduce' 减少月供
 * @returns {{savedInterest: number, newMonthly: number, newTotalYears: number, newTotalPayment: number}}
 */
function calcPrepayment(principal, annualRate, totalYears, prepayYear, prepayAmount, mode) {
  var P = principal * 10000;
  var prepay = prepayAmount * 10000;
  var r = annualRate / 100 / 12;
  var n = totalYears * 12;

  var monthly = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);

  // 计算提前还款时的剩余本金
  var remaining = P;
  var paidMonths = prepayYear * 12;
  var paidInterest = 0;

  for (var i = 0; i < paidMonths; i++) {
    var monthInterest = remaining * r;
    var monthPrincipal = monthly - monthInterest;
    paidInterest += monthInterest;
    remaining -= monthPrincipal;
  }

  // 提前还款后的剩余本金
  var newRemaining = remaining - prepay;
  if (newRemaining <= 0) {
    var originalTotal = monthly * n;
    var alreadyPaid = monthly * paidMonths;
    return {
      savedInterest: Math.round(originalTotal - alreadyPaid - remaining),
      newMonthly: 0,
      newTotalYears: prepayYear,
      newTotalPayment: Math.round(alreadyPaid + remaining)
    };
  }

  var remainingMonths = n - paidMonths;
  var originalRemainingInterest = monthly * remainingMonths - remaining;

  if (mode === 'shorten') {
    // 月供不变，缩短年限
    var newN = Math.ceil(Math.log(monthly / (monthly - newRemaining * r)) / Math.log(1 + r));
    var newTotalPayment = monthly * paidMonths + monthly * newN + prepay;
    var newRemainingInterest = monthly * newN - newRemaining;
    var savedInterest = originalRemainingInterest - newRemainingInterest;

    return {
      savedInterest: Math.round(savedInterest),
      newMonthly: Math.round(monthly),
      newTotalYears: parseFloat((prepayYear + newN / 12).toFixed(1)),
      newTotalPayment: Math.round(newTotalPayment)
    };
  } else {
    // 年限不变，减少月供
    var newMonthly = newRemaining * r * Math.pow(1 + r, remainingMonths) / (Math.pow(1 + r, remainingMonths) - 1);
    var newRemainingInterest = newMonthly * remainingMonths - newRemaining;
    var savedInterest = originalRemainingInterest - newRemainingInterest;
    var newTotalPayment = monthly * paidMonths + newMonthly * remainingMonths + prepay;

    return {
      savedInterest: Math.round(savedInterest),
      newMonthly: Math.round(newMonthly),
      newTotalYears: totalYears,
      newTotalPayment: Math.round(newTotalPayment)
    };
  }
}

/**
 * 计算不同年限的对比数据
 * @param {number} principal - 贷款本金（万元）
 * @param {number} annualRate - 年利率
 * @returns {Array<{years: number, monthly: number, totalInterest: number, interestRatio: number}>}
 */
function compareYears(principal, annualRate) {
  var yearsList = [5, 10, 15, 20, 25, 30];
  return yearsList.map(function(y) {
    var result = calcEqualPayment(principal, annualRate, y);
    return {
      years: y,
      monthly: result.monthly,
      totalInterest: result.totalInterest,
      interestRatio: result.interestRatio
    };
  });
}

/**
 * 计算30年里的人生事件对照
 * @param {number} startAge - 贷款起始年龄
 * @returns {Array<{year: number, age: number, event: string}>}
 */
function lifeEvents(startAge) {
  var events = [];
  var milestones = [
    { offset: 0, text: '签下贷款合同' },
    { offset: 1, text: '第一年：还在适应月供压力' },
    { offset: 3, text: '第三年：可能结婚/生孩子' },
    { offset: 5, text: '第五年：孩子上幼儿园' },
    { offset: 6, text: '第六年：刚还完总利息的10%' },
    { offset: 10, text: '第十年：孩子上小学四年级' },
    { offset: 12, text: '第十二年：本金才还了约1/3' },
    { offset: 15, text: '第十五年：贷款过半，孩子中考' },
    { offset: 18, text: '第十八年：孩子高考' },
    { offset: 20, text: '第二十年：孩子大学毕业' },
    { offset: 22, text: '第二十二年：孩子可能也要买房了' },
    { offset: 25, text: '第二十五年：开始考虑退休' },
    { offset: 30, text: '第三十年：终于还完了' }
  ];

  milestones.forEach(function(m) {
    events.push({
      year: m.offset,
      age: startAge + m.offset,
      event: m.text
    });
  });

  return events;
}

/**
 * 计算月供占收入比例的压力指数
 * @param {number} monthly - 月供（元）
 * @param {number} income - 月收入（元）
 * @returns {{ratio: number, level: string, desc: string}}
 */
function pressureIndex(monthly, income) {
  var ratio = parseFloat((monthly / income * 100).toFixed(1));
  var level, desc;

  if (ratio <= 30) {
    level = '舒适';
    desc = '月供占收入30%以下，生活质量基本不受影响';
  } else if (ratio <= 50) {
    level = '紧张';
    desc = '月供占收入30%-50%，需要控制其他开支';
  } else if (ratio <= 70) {
    level = '高压';
    desc = '月供占收入50%-70%，生活质量明显下降，抗风险能力弱';
  } else {
    level = '危险';
    desc = '月供占收入70%以上，任何收入波动都可能断供';
  }

  return { ratio: ratio, level: level, desc: desc };
}

/**
 * 通货膨胀对月供实际购买力的影响
 * @param {number} monthly - 当前月供（元）
 * @param {number} inflationRate - 年通胀率（如 3 表示 3%）
 * @param {number} years - 年限
 * @returns {Array<{year: number, nominalMonthly: number, realMonthly: number}>}
 */
function inflationImpact(monthly, inflationRate, years) {
  var rate = inflationRate / 100;
  var result = [];
  for (var y = 0; y <= years; y += 5) {
    result.push({
      year: y,
      nominalMonthly: monthly,
      realMonthly: Math.round(monthly / Math.pow(1 + rate, y))
    });
  }
  return result;
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcEqualPayment: calcEqualPayment,
    calcEqualPrincipal: calcEqualPrincipal,
    generateTimeline: generateTimeline,
    calcPrepayment: calcPrepayment,
    compareYears: compareYears,
    lifeEvents: lifeEvents,
    pressureIndex: pressureIndex,
    inflationImpact: inflationImpact
  };
}
