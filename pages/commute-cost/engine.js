// ========== 通勤时间成本 核心算法（可独立测试） ==========

/**
 * 计算通勤总时间
 * @param {number} oneWayMin - 单程通勤时间（分钟）
 * @param {number} daysPerWeek - 每周通勤天数
 * @param {number} weeksPerYear - 每年工作周数（扣除假期）
 * @param {number} careerYears - 职业生涯年数
 * @returns {{ dailyHours, yearlyHours, yearlyDays, lifetimeHours, lifetimeDays, lifetimeYears }}
 */
function calcCommuteTime(oneWayMin, daysPerWeek, weeksPerYear, careerYears) {
  var roundTripMin = oneWayMin * 2;
  var dailyHours = roundTripMin / 60;
  var yearlyDays = daysPerWeek * weeksPerYear;
  var yearlyHours = dailyHours * yearlyDays;
  var lifetimeHours = yearlyHours * careerYears;
  var lifetimeDays = lifetimeHours / 24;
  var lifetimeYears = lifetimeDays / 365;

  return {
    dailyHours: round2(dailyHours),
    yearlyHours: round2(yearlyHours),
    yearlyDays: round2(yearlyHours / 24),
    lifetimeHours: round2(lifetimeHours),
    lifetimeDays: round2(lifetimeDays),
    lifetimeYears: round2(lifetimeYears)
  };
}

/**
 * 时间等价物换算
 * @param {number} hours - 总小时数
 * @returns {{ movies, books, marathons, languages, sleepDays, flights }}
 */
function timeEquivalents(hours) {
  return {
    movies: Math.floor(hours / 2),           // 一部电影约 2 小时
    books: Math.floor(hours / 6),             // 读完一本书约 6 小时
    marathons: Math.floor(hours / 4.5),       // 跑一次全马约 4.5 小时（业余）
    languages: round2(hours / 600),           // 学一门语言到 B1 约 600 小时（FSI 数据）
    sleepDays: Math.floor(hours / 8),         // 8 小时 = 一天好觉
    flights: round2(hours / 12)               // 北京飞纽约约 12 小时
  };
}

/**
 * 通勤时间差异对比
 * @param {number} currentMin - 当前单程分钟
 * @param {number} savedMin - 节省的单程分钟
 * @param {number} daysPerWeek
 * @param {number} weeksPerYear
 * @param {number} careerYears
 * @returns {{ savedYearlyHours, savedLifetimeHours, savedLifetimeDays, equivalents }}
 */
function calcTimeSaved(currentMin, savedMin, daysPerWeek, weeksPerYear, careerYears) {
  var current = calcCommuteTime(currentMin, daysPerWeek, weeksPerYear, careerYears);
  var reduced = calcCommuteTime(currentMin - savedMin, daysPerWeek, weeksPerYear, careerYears);
  var savedYearlyHours = round2(current.yearlyHours - reduced.yearlyHours);
  var savedLifetimeHours = round2(current.lifetimeHours - reduced.lifetimeHours);
  var savedLifetimeDays = round2(savedLifetimeHours / 24);

  return {
    savedYearlyHours: savedYearlyHours,
    savedLifetimeHours: savedLifetimeHours,
    savedLifetimeDays: savedLifetimeDays,
    equivalents: timeEquivalents(savedLifetimeHours)
  };
}

/**
 * 通勤的金钱成本（机会成本）
 * @param {number} hours - 总通勤小时数
 * @param {number} hourlyWage - 时薪（元）
 * @returns {number} 机会成本（元）
 */
function calcMoneyCost(hours, hourlyWage) {
  return round2(hours * hourlyWage);
}

/**
 * 城市通勤数据（来源标注在文章中）
 */
var CITY_DATA = [
  { city: '北京', oneWay: 47, source: '中国城市通勤监测报告' },
  { city: '上海', oneWay: 42, source: '中国城市通勤监测报告' },
  { city: '广州', oneWay: 38, source: '中国城市通勤监测报告' },
  { city: '深圳', oneWay: 36, source: '中国城市通勤监测报告' },
  { city: '成都', oneWay: 35, source: '中国城市通勤监测报告' },
  { city: '重庆', oneWay: 38, source: '中国城市通勤监测报告' },
  { city: '杭州', oneWay: 34, source: '中国城市通勤监测报告' },
  { city: '武汉', oneWay: 36, source: '中国城市通勤监测报告' },
  { city: '东京', oneWay: 50, source: 'NHK 生活时间调查' },
  { city: '纽约', oneWay: 43, source: 'U.S. Census Bureau ACS' },
  { city: '伦敦', oneWay: 41, source: 'ONS UK Commuting Data' },
  { city: '首尔', oneWay: 46, source: 'Statistics Korea' }
];

/**
 * 生成不同通勤时长的对比数据（用于图表）
 * @param {number} daysPerWeek
 * @param {number} weeksPerYear
 * @param {number} careerYears
 * @returns {Array<{ minutes, lifetimeYears, lifetimeHours }>}
 */
function generateComparisonData(daysPerWeek, weeksPerYear, careerYears) {
  var result = [];
  for (var m = 10; m <= 90; m += 5) {
    var data = calcCommuteTime(m, daysPerWeek, weeksPerYear, careerYears);
    result.push({
      minutes: m,
      lifetimeYears: data.lifetimeYears,
      lifetimeHours: data.lifetimeHours
    });
  }
  return result;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcCommuteTime: calcCommuteTime,
    timeEquivalents: timeEquivalents,
    calcTimeSaved: calcTimeSaved,
    calcMoneyCost: calcMoneyCost,
    generateComparisonData: generateComparisonData,
    CITY_DATA: CITY_DATA,
    round2: round2
  };
}
