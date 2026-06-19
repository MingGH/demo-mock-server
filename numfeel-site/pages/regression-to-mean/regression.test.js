/**
 * 回归均值核心算法测试
 * 运行：node pages/regression-to-mean/regression.test.js
 */
const {
  randn, generateAbilities, simulateExam,
  regressionDemo, average, correlationCoeff,
  stddev, assessStudent
} = require('./regression.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function approxEqual(a, b, tol = 0.15) {
  return Math.abs(a - b) / (Math.abs(b) || 1) < tol;
}

// ── randn ──
console.log('randn:');
{
  const samples = Array.from({ length: 10000 }, randn);
  const mean = average(samples);
  const variance = average(samples.map(x => x * x)) - mean * mean;
  assert(Math.abs(mean) < 0.05, `均值接近0 (got ${mean.toFixed(4)})`);
  assert(Math.abs(variance - 1) < 0.1, `方差接近1 (got ${variance.toFixed(4)})`);
}

// ── generateAbilities ──
console.log('generateAbilities:');
{
  const ab = generateAbilities(5000, 500, 80);
  assert(ab.length === 5000, '返回正确数量');
  const m = average(ab);
  assert(approxEqual(m, 500, 0.05), `均值接近500 (got ${m.toFixed(1)})`);
}

// ── simulateExam ──
console.log('simulateExam:');
{
  const ab = generateAbilities(2000, 600, 0); // 所有人水平相同
  const scores = simulateExam(ab, 50);
  const m = average(scores);
  assert(approxEqual(m, 600, 0.05), `纯噪声时均值仍接近真实水平 (got ${m.toFixed(1)})`);
  // 标准差应接近 noiseSd
  const sd = Math.sqrt(average(scores.map(s => (s - m) ** 2)));
  assert(approxEqual(sd, 50, 0.2), `标准差接近noiseSd (got ${sd.toFixed(1)})`);
}

// ── regressionDemo 核心验证 ──
console.log('regressionDemo:');
{
  const result = regressionDemo({ n: 5000, noiseSd: 50, topPercent: 10 });

  // 前10%第一次考试均值应远高于总体
  assert(result.top.exam1Avg > result.overallAvg + 50,
    `前10%第一次均分远高于总体 (top=${result.top.exam1Avg.toFixed(0)}, all=${result.overallAvg.toFixed(0)})`);

  // 关键断言：前10%第二次考试均值应低于第一次（回归均值）
  assert(result.top.change < 0,
    `前10%第二次回落 (change=${result.top.change.toFixed(1)})`);

  // 关键断言：后10%第二次考试均值应高于第一次（回归均值）
  assert(result.bottom.change > 0,
    `后10%第二次回升 (change=${result.bottom.change.toFixed(1)})`);

  // 前10%的真实水平均值应介于第一次成绩和总体之间
  assert(result.top.abilityAvg < result.top.exam1Avg,
    `真实水平 < 第一次成绩 (ability=${result.top.abilityAvg.toFixed(0)}, exam1=${result.top.exam1Avg.toFixed(0)})`);
  assert(result.top.abilityAvg > result.overallAvg,
    `真实水平 > 总体均值 (ability=${result.top.abilityAvg.toFixed(0)}, all=${result.overallAvg.toFixed(0)})`);

  // 散点图数据
  assert(result.scatter.length > 0 && result.scatter.length <= 200,
    `散点图数据合理 (${result.scatter.length} points)`);
}

// ── correlationCoeff ──
console.log('correlationCoeff:');
{
  const xs = [1, 2, 3, 4, 5];
  const ys = [1, 2, 3, 4, 5];
  assert(approxEqual(correlationCoeff(xs, ys), 1, 0.01), '完美正相关 r≈1');

  const ys2 = [5, 4, 3, 2, 1];
  assert(approxEqual(correlationCoeff(xs, ys2), -1, 0.01), '完美负相关 r≈-1');

  // 考试1和考试2的相关性应为正（共同水平），但<1（有噪声）
  const ab = generateAbilities(3000, 500, 80);
  const e1 = simulateExam(ab, 40);
  const e2 = simulateExam(ab, 40);
  const r = correlationCoeff(e1, e2);
  assert(r > 0.5 && r < 0.95, `两次考试相关系数合理 (r=${r.toFixed(3)})`);
}

// ── 噪声越大回归越明显 ──
console.log('噪声影响:');
{
  const r1 = regressionDemo({ n: 3000, noiseSd: 20, topPercent: 10 });
  const r2 = regressionDemo({ n: 3000, noiseSd: 80, topPercent: 10 });
  // 噪声大时，回落幅度更大（绝对值更大）
  assert(Math.abs(r2.top.change) > Math.abs(r1.top.change),
    `高噪声回归幅度更大 (low=${r1.top.change.toFixed(1)}, high=${r2.top.change.toFixed(1)})`);
}

// ── stddev ──
console.log('stddev:');
{
  assert(stddev([5, 5, 5]) === 0, '全相同标准差为0');
  assert(approxEqual(stddev([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.05), `已知样本标准差 (got ${stddev([2,4,4,4,5,5,7,9]).toFixed(3)})`);
  assert(stddev([100]) === 0, '单个值标准差为0');
}

// ── assessStudent ──
console.log('assessStudent:');
{
  // 稳定600，考540 → 真考砸（偏离远超2个标准差）
  const a1 = assessStudent([590, 605, 600, 595, 610], 540);
  assert(a1.level === 'bombed', `稳定600考540判定真考砸 (got ${a1.level}, z=${a1.z.toFixed(2)})`);
  assert(approxEqual(a1.mean, 600, 0.02), `均值约600 (got ${a1.mean.toFixed(1)})`);
  assert(a1.gain > 0, `复读期望提分为正 (got ${a1.gain.toFixed(1)})`);
  assert(approxEqual(a1.expectedRetake, a1.mean, 0.001), '复读期望=平时均值');

  // 波动大的学生，考540不算极端
  const a2 = assessStudent([560, 640, 580, 620, 540], 540);
  assert(a2.level === 'normal' || a2.level === 'edge', `波动大时540不算真考砸 (got ${a2.level}, z=${a2.z.toFixed(2)})`);

  // 超常发挥
  const a3 = assessStudent([500, 510, 505, 495], 580);
  assert(a3.level === 'super', `远超平时判定超常发挥 (got ${a3.level}, z=${a3.z.toFixed(2)})`);

  // z 符号正确
  assert(a1.z < 0, '考砸 z 为负');
  assert(a3.z > 0, '超常 z 为正');
}

console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
