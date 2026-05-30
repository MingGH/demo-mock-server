/**
 * 辛普森悖论引擎 — 核心算法
 *
 * 基于 UC Berkeley 1973 年秋季研究生招生数据
 * 数据来源：Bickel, P.J., Hammel, E.A., & O'Connell, J.W. (1975).
 *           "Sex Bias in Graduate Admissions: Data from Berkeley."
 *           Science, 187(4175), 398–404.
 *
 * 原始数据中有 85 个系，论文选取了申请人数最多的 6 个系（A–F）进行分析。
 * 本演示使用论文中公开的这 6 个系的数据。
 */

// ── 真实历史数据（6 个系） ──
var DEPARTMENTS = [
  { id: 'A', maleApply: 825, maleAdmit: 512, femaleApply: 108, femaleAdmit: 89 },
  { id: 'B', maleApply: 560, maleAdmit: 353, femaleApply: 25,  femaleAdmit: 17 },
  { id: 'C', maleApply: 325, maleAdmit: 120, femaleApply: 593, femaleAdmit: 202 },
  { id: 'D', maleApply: 417, maleAdmit: 138, femaleApply: 375, femaleAdmit: 131 },
  { id: 'E', maleApply: 191, maleAdmit: 53,  femaleApply: 393, femaleAdmit: 94 },
  { id: 'F', maleApply: 373, maleAdmit: 22,  femaleApply: 341, femaleAdmit: 24 },
];

/**
 * 计算单个系的录取率
 */
function deptRate(dept) {
  var mRate = dept.maleAdmit / dept.maleApply;
  var fRate = dept.femaleAdmit / dept.femaleApply;
  return {
    id: dept.id,
    maleRate: mRate,
    femaleRate: fRate,
    diff: fRate - mRate,                       // 正数 = 女生更高
    maleApply: dept.maleApply,
    femaleApply: dept.femaleApply,
    maleAdmit: dept.maleAdmit,
    femaleAdmit: dept.femaleAdmit,
  };
}

/**
 * 计算所有系的逐系录取率
 */
function allDeptRates() {
  return DEPARTMENTS.map(deptRate);
}

/**
 * 计算整体录取率（汇总）
 */
function overallRates() {
  var totalMaleApply = 0, totalMaleAdmit = 0;
  var totalFemaleApply = 0, totalFemaleAdmit = 0;
  DEPARTMENTS.forEach(function (d) {
    totalMaleApply += d.maleApply;
    totalMaleAdmit += d.maleAdmit;
    totalFemaleApply += d.femaleApply;
    totalFemaleAdmit += d.femaleAdmit;
  });
  return {
    maleRate: totalMaleAdmit / totalMaleApply,
    femaleRate: totalFemaleAdmit / totalFemaleApply,
    maleApply: totalMaleApply,
    femaleApply: totalFemaleApply,
    maleAdmit: totalMaleAdmit,
    femaleAdmit: totalFemaleAdmit,
  };
}

/**
 * 统计女生录取率 >= 男生的系数
 */
function countFemaleAdvantage() {
  var rates = allDeptRates();
  var count = 0;
  rates.forEach(function (r) {
    if (r.diff >= 0) count++;
  });
  return { advantage: count, total: rates.length };
}

/**
 * 模拟「如果女生的申请分布和男生一样」会怎样
 * 即：保持各系录取率不变，但让女生的申请人数按男生的比例分配
 */
function simulateEqualDistribution() {
  var overall = overallRates();
  var totalFemale = overall.femaleApply;
  var totalMale = overall.maleApply;

  // 男生在各系的申请比例
  var maleDist = DEPARTMENTS.map(function (d) {
    return d.maleApply / totalMale;
  });

  // 各系对女生的录取率（保持不变）
  var femaleRates = DEPARTMENTS.map(function (d) {
    return d.femaleAdmit / d.femaleApply;
  });

  // 如果女生按男生的比例分配
  var simAdmit = 0;
  maleDist.forEach(function (ratio, i) {
    var simApply = Math.round(totalFemale * ratio);
    simAdmit += Math.round(simApply * femaleRates[i]);
  });

  return {
    originalRate: overall.femaleRate,
    simulatedRate: simAdmit / totalFemale,
    originalAdmit: overall.femaleAdmit,
    simulatedAdmit: simAdmit,
    totalApply: totalFemale,
  };
}

/**
 * 生成自定义数据的辛普森悖论检测
 * @param {Array} depts - [{id, maleApply, maleAdmit, femaleApply, femaleAdmit}]
 * @returns {object} 分析结果
 */
function analyzeCustomData(depts) {
  if (!depts || depts.length === 0) return null;

  var totalMA = 0, totalMAdm = 0, totalFA = 0, totalFAdm = 0;
  var deptResults = [];
  var femaleWins = 0;

  depts.forEach(function (d) {
    var mr = d.maleApply > 0 ? d.maleAdmit / d.maleApply : 0;
    var fr = d.femaleApply > 0 ? d.femaleAdmit / d.femaleApply : 0;
    if (fr >= mr) femaleWins++;
    totalMA += d.maleApply;
    totalMAdm += d.maleAdmit;
    totalFA += d.femaleApply;
    totalFAdm += d.femaleAdmit;
    deptResults.push({ id: d.id, maleRate: mr, femaleRate: fr, diff: fr - mr });
  });

  var overallMR = totalMA > 0 ? totalMAdm / totalMA : 0;
  var overallFR = totalFA > 0 ? totalFAdm / totalFA : 0;

  var isParadox = (overallFR < overallMR && femaleWins > depts.length / 2) ||
                  (overallFR > overallMR && femaleWins < depts.length / 2);

  return {
    deptResults: deptResults,
    overallMaleRate: overallMR,
    overallFemaleRate: overallFR,
    femaleWins: femaleWins,
    isParadox: isParadox,
  };
}

/**
 * 蒙特卡洛模拟：随机生成申请分布，看悖论出现的频率
 * @param {number} trials - 模拟次数
 * @param {number} numDepts - 系数
 * @returns {object} { paradoxCount, trials, rate }
 */
function monteCarloParadox(trials, numDepts) {
  var n = trials || 1000;
  var nd = numDepts || 6;
  var paradoxCount = 0;

  for (var t = 0; t < n; t++) {
    var depts = [];
    for (var i = 0; i < nd; i++) {
      // 随机录取率 10%~90%
      var baseRate = 0.1 + Math.random() * 0.8;
      // 男女录取率接近（±5%）
      var mRate = Math.max(0.01, Math.min(0.99, baseRate + (Math.random() - 0.5) * 0.1));
      var fRate = Math.max(0.01, Math.min(0.99, baseRate + (Math.random() - 0.5) * 0.1));
      // 申请人数：制造不均匀分布（关键！）
      var mApply = Math.floor(50 + Math.random() * 500);
      var fApply = Math.floor(50 + Math.random() * 500);
      // 让高录取率的系男生申请多，低录取率的系女生申请多（模拟真实偏好）
      if (baseRate > 0.5) {
        mApply = Math.floor(mApply * 1.8);
      } else {
        fApply = Math.floor(fApply * 1.8);
      }
      depts.push({
        id: String.fromCharCode(65 + i),
        maleApply: mApply,
        maleAdmit: Math.round(mApply * mRate),
        femaleApply: fApply,
        femaleAdmit: Math.round(fApply * fRate),
      });
    }
    var result = analyzeCustomData(depts);
    if (result && result.isParadox) paradoxCount++;
  }

  return { paradoxCount: paradoxCount, trials: n, rate: paradoxCount / n };
}

// ── 导出 ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEPARTMENTS: DEPARTMENTS,
    deptRate: deptRate,
    allDeptRates: allDeptRates,
    overallRates: overallRates,
    countFemaleAdvantage: countFemaleAdvantage,
    simulateEqualDistribution: simulateEqualDistribution,
    analyzeCustomData: analyzeCustomData,
    monteCarloParadox: monteCarloParadox,
  };
}
