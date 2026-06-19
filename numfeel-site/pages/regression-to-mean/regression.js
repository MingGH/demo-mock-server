/**
 * 回归均值核心算法模块
 * 模拟考试成绩 = 真实水平 + 随机波动
 */

// Box-Muller 正态分布随机数
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * 生成一批学生的真实水平
 * @param {number} n - 学生数
 * @param {number} mean - 平均水平
 * @param {number} sd - 水平标准差
 * @returns {number[]}
 */
function generateAbilities(n, mean = 500, sd = 80) {
  const abilities = [];
  for (let i = 0; i < n; i++) {
    abilities.push(mean + sd * randn());
  }
  return abilities;
}

/**
 * 模拟一次考试：成绩 = 真实水平 + 噪声
 * @param {number[]} abilities - 真实水平数组
 * @param {number} noiseSd - 考试波动标准差
 * @returns {number[]}
 */
function simulateExam(abilities, noiseSd = 40, maxScore = Infinity) {
  return abilities.map(a => {
    const raw = a + noiseSd * randn();
    return maxScore === Infinity ? raw : Math.min(maxScore, Math.max(0, raw));
  });
}

/**
 * 回归均值演示：
 * 1. 生成学生真实水平
 * 2. 模拟第一次考试
 * 3. 筛选极端表现者（前/后 top%）
 * 4. 模拟第二次考试
 * 5. 比较前后变化
 *
 * @param {object} opts
 * @returns {object} 结果数据
 */
function regressionDemo(opts = {}) {
  const {
    n = 1000,
    meanAbility = 500,
    abilitySd = 80,
    noiseSd = 40,
    topPercent = 10,
    maxScore = Infinity
  } = opts;

  const abilities = generateAbilities(n, meanAbility, abilitySd);
  const exam1 = simulateExam(abilities, noiseSd, maxScore);
  const exam2 = simulateExam(abilities, noiseSd, maxScore);

  // 按第一次成绩排序索引
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => exam1[b] - exam1[a]);

  const topCount = Math.floor(n * topPercent / 100);
  const bottomCount = topCount;

  // 前 top%
  const topIndices = indices.slice(0, topCount);
  const bottomIndices = indices.slice(n - bottomCount);

  const topExam1Avg = average(topIndices.map(i => exam1[i]));
  const topExam2Avg = average(topIndices.map(i => exam2[i]));
  const topAbilityAvg = average(topIndices.map(i => abilities[i]));

  const bottomExam1Avg = average(bottomIndices.map(i => exam1[i]));
  const bottomExam2Avg = average(bottomIndices.map(i => exam2[i]));
  const bottomAbilityAvg = average(bottomIndices.map(i => abilities[i]));

  const overallAvg = average(exam1);

  return {
    n,
    topPercent,
    noiseSd,
    overallAvg,
    top: {
      count: topCount,
      exam1Avg: topExam1Avg,
      exam2Avg: topExam2Avg,
      abilityAvg: topAbilityAvg,
      change: topExam2Avg - topExam1Avg
    },
    bottom: {
      count: bottomCount,
      exam1Avg: bottomExam1Avg,
      exam2Avg: bottomExam2Avg,
      abilityAvg: bottomAbilityAvg,
      change: bottomExam2Avg - bottomExam1Avg
    },
    // 散点图数据（采样200个点避免DOM过重）
    scatter: sampleScatter(exam1, exam2, abilities, 200)
  };
}

function sampleScatter(exam1, exam2, abilities, sampleSize) {
  const n = exam1.length;
  const step = Math.max(1, Math.floor(n / sampleSize));
  const points = [];
  for (let i = 0; i < n; i += step) {
    points.push({ x: exam1[i], y: exam2[i], ability: abilities[i] });
  }
  return points;
}

function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * 样本标准差（n-1）
 */
function stddev(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const m = average(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * 考砸自测：根据平时大考成绩 + 这次高考分，判断是真考砸还是正常波动
 * @param {number[]} pastScores - 平时大考成绩（至少2个）
 * @param {number} examScore - 这次高考分
 * @returns {object}
 */
function assessStudent(pastScores, examScore) {
  const mean = average(pastScores);
  const sd = stddev(pastScores);
  const z = sd === 0 ? 0 : (examScore - mean) / sd;

  let level, title, advice;
  if (z <= -2) {
    level = 'bombed';
    title = '你是真考砸了';
    advice = `这次比你平时均值低了 ${Math.abs(z).toFixed(1)} 个标准差，属于极端失常事件。回归均值的力量很强——复读再考，期望回到 ${mean.toFixed(0)} 分附近。`;
  } else if (z <= -1) {
    level = 'edge';
    title = '有点失常，但在边缘';
    advice = `这次比平时低了 ${Math.abs(z).toFixed(1)} 个标准差，算偏低但没到极端。复读有一定回归空间，期望回到 ${mean.toFixed(0)} 分左右，但别指望奇迹。`;
  } else if (z < 1) {
    level = 'normal';
    title = '这其实接近你的正常水平';
    advice = `这次只偏离了 ${z.toFixed(1)} 个标准差，落在你的正常波动范围内。${mean.toFixed(0)} 分可能就是你的真实实力，复读的"回归红利"不大，提分得靠真本事。`;
  } else {
    level = 'super';
    title = '这次其实是超常发挥';
    advice = `这次比平时还高了 ${z.toFixed(1)} 个标准差。如果复读，反而要小心回归均值往下拉——见好就收可能更明智。`;
  }

  return {
    mean, sd, z, level, title, advice,
    examScore,
    expectedRetake: mean,
    gain: mean - examScore
  };
}


function correlationCoeff(xs, ys) {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = average(xs);
  const my = average(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

// Node.js exports for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    randn, generateAbilities, simulateExam,
    regressionDemo, average, stddev, assessStudent, correlationCoeff, sampleScatter
  };
}
