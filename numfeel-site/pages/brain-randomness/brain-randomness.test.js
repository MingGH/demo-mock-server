/**
 * 大脑随机性检测 — 单元测试
 * 用 node pages/brain-randomness/brain-randomness.test.js 直接运行
 */

const {
  frequencyTest, runsTest, adjacencyAnalysis,
  autocorrelationTest, pokerTest,
  calculateRandomnessScore, generateTrueRandom, getAgeCurveData
} = require('./brain-randomness-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

function approxEqual(a, b, tolerance = 0.05) {
  if (b === 0) return Math.abs(a) <= tolerance;
  return Math.abs(a - b) / Math.max(1, Math.abs(b)) <= tolerance;
}

// 构造一个长度为 n 的循环 1-9 序列
function cyclicSeq(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push((i % 9) + 1);
  return arr;
}

// ========== frequencyTest ==========
console.log('\n📊 frequencyTest');

(function () {
  const uniform = cyclicSeq(45); // 1-9 各出现 5 次，很均匀
  const r1 = frequencyTest(uniform);
  assert(r1.isRandom === true, `均匀循环序列应通过卡方检验 (p=${r1.pValue})`);
  assert(r1.pValue > 0.05, '均匀序列 p 值 > 0.05');

  const allSame = new Array(40).fill(5);
  const r2 = frequencyTest(allSame);
  assert(r2.isRandom === false, '全相同序列应不通过卡方检验');
  assert(r2.pValue <= 0.05, '全相同序列 p 值 <= 0.05');

  // 真随机大概率通过
  let passCount = 0;
  for (let i = 0; i < 30; i++) {
    if (frequencyTest(generateTrueRandom(40, 1, 9)).isRandom) passCount++;
  }
  assert(passCount >= 24, `30 次真随机卡方检验通过 ${passCount} 次 (期望 >=24)`);

  const r3 = frequencyTest(generateTrueRandom(40, 1, 9));
  assert(Array.isArray(r3.observed) && r3.observed.length === 9, 'observed 数组长度为 9');
  const sumObs = r3.observed.reduce((s, v) => s + v, 0);
  assert(sumObs === 40, 'observed 之和等于序列长度 40');
  assert(r3.chiSquare >= 0, 'chiSquare >= 0');

  // 边界
  const empty = frequencyTest([]);
  assert(empty.isRandom === true && empty.pValue === 1, '空序列返回默认值不报错');
  const short = frequencyTest([1, 2, 3]);
  assert(short.isRandom === true, '长度<10 序列返回默认值不报错');
})();

// ========== runsTest ==========
console.log('\n📊 runsTest');

(function () {
  const alternating = [];
  for (let i = 0; i < 40; i++) alternating.push(i % 2 === 0 ? 1 : 2); // 1,2,1,2,...
  const r1 = runsTest(alternating);
  assert(approxEqual(r1.alternationRate, 1.0, 0.01), `完全交替序列 alternationRate≈1.0 (得 ${r1.alternationRate})`);
  assert(r1.isRandom === false, '完全交替序列 |z| 应超 1.96，不通过');

  const allSame = new Array(40).fill(5);
  const r2 = runsTest(allSame);
  assert(approxEqual(r2.alternationRate, 0, 0.01), `完全重复序列 alternationRate≈0 (得 ${r2.alternationRate})`);
  assert(r2.isRandom === false, '完全重复序列不通过');

  // 真随机交替率接近 8/9
  let sumRate = 0;
  for (let i = 0; i < 30; i++) sumRate += runsTest(generateTrueRandom(40, 1, 9)).alternationRate;
  const avgRate = sumRate / 30;
  assert(approxEqual(avgRate, 8 / 9, 0.1), `真随机平均交替率≈0.889 (得 ${avgRate.toFixed(3)})`);

  // 过度交替应不通过
  const overAlt = [];
  for (let i = 0; i < 40; i++) overAlt.push((i % 9) + 1); // 永不相邻相同
  assert(runsTest(overAlt).isRandom === false, '过度交替 (rate=1.0) 应 isRandom=false');

  const r3 = runsTest(generateTrueRandom(40, 1, 9));
  assert(Number.isFinite(r3.zScore), 'zScore 为有限数值');

  // 边界
  const short = runsTest([5]);
  assert(short.isRandom === true, '长度<2 序列返回默认值不报错');
  assert(runsTest([]).alternationRate === 0, '空序列不报错');
})();

// ========== adjacencyAnalysis ==========
console.log('\n📊 adjacencyAnalysis');

(function () {
  // 相邻差恒为 1 的序列（1-9 间来回走，避免 9→1 的大跳）
  const step1 = [];
  let cur = 1, dir = 1;
  for (let i = 0; i < 40; i++) {
    step1.push(cur);
    if (cur >= 9) dir = -1;
    else if (cur <= 1) dir = 1;
    cur += dir;
  }
  const r1 = adjacencyAnalysis(step1);
  assert(approxEqual(r1.avgGap, 1, 0.01), `相邻差恒为1 → avgGap=1 (得 ${r1.avgGap})`);

  const hi = [];
  for (let i = 0; i < 40; i++) hi.push(i % 2 === 0 ? 1 : 9); // 1,9,1,9,...
  const r2 = adjacencyAnalysis(hi);
  assert(approxEqual(r2.avgGap, 8, 0.01), `1,9 交替 avgGap=8 (得 ${r2.avgGap})`);

  const allSame = new Array(40).fill(5);
  const r3 = adjacencyAnalysis(allSame);
  assert(r3.maxStreak === 40, `全相同 maxStreak=40 (得 ${r3.maxStreak})`);
  assert(approxEqual(r3.repetitionRate, 1.0, 0.01), `全相同 repetitionRate=1.0 (得 ${r3.repetitionRate})`);

  // 真随机
  let sumGap = 0, sumRep = 0;
  for (let i = 0; i < 30; i++) {
    const a = adjacencyAnalysis(generateTrueRandom(40, 1, 9));
    sumGap += a.avgGap; sumRep += a.repetitionRate;
  }
  const avgGap = sumGap / 30, avgRep = sumRep / 30;
  assert(approxEqual(avgGap, 80 / 27, 0.25), `真随机 avgGap≈2.96 (得 ${avgGap.toFixed(2)})`);
  assert(approxEqual(avgRep, 1 / 9, 0.06), `真随机 repetitionRate≈0.111 (得 ${avgRep.toFixed(3)})`);

  // 边界
  assert(adjacencyAnalysis([]).maxStreak === 0, '空序列不报错');
  assert(adjacencyAnalysis([7]).maxStreak === 1, '单元素不报错');
})();

// ========== autocorrelationTest ==========
console.log('\n📊 autocorrelationTest');

(function () {
  // 周期 3 序列
  const period3 = [];
  for (let i = 0; i < 40; i++) period3.push((i % 3) + 1); // 1,2,3,1,2,3,...
  const r1 = autocorrelationTest(period3, 10);
  assert(r1.hasPattern === true, '周期 3 序列应 hasPattern=true');
  assert(r1.autocorrelations.length === 10, 'autocorrelations 数组长度 = maxLag');
  // lag 3 处应有高自相关
  assert(r1.autocorrelations[2] > 0.8, `lag=3 自相关高 (得 ${r1.autocorrelations[2]})`);

  // 真随机大概率无显著周期（多重比较下允许少量误报）
  let falsePositive = 0;
  for (let i = 0; i < 10; i++) {
    if (autocorrelationTest(generateTrueRandom(40, 1, 9), 10).hasPattern) falsePositive++;
  }
  assert(falsePositive <= 3, `10 次真随机 hasPattern 误报 ${falsePositive} 次 (期望 <=3)`);

  // 所有自相关值在 [-1,1]
  const r2 = autocorrelationTest(generateTrueRandom(40, 1, 9), 10);
  assert(r2.autocorrelations.every(v => v >= -1 && v <= 1), '所有自相关值在 [-1,1]');

  // 边界：序列长度 < maxLag+5 不报错
  const short = autocorrelationTest([1, 2, 3], 10);
  assert(short.autocorrelations.length === 10, '短序列返回 maxLag 长度数组不报错');
  assert(autocorrelationTest([]).hasPattern === false, '空序列不报错');
})();

// ========== pokerTest ==========
console.log('\n📊 pokerTest');

(function () {
  // 极端规律：1,1,1,2,2,2,3,3,3,... 每组三个相同
  const extreme = [];
  for (let i = 0; i < 40; i++) extreme.push(Math.floor(i / 3) % 9 + 1); // 1,1,1,2,2,2,...,9,9,9,1,1,1,...
  const r1 = pokerTest(extreme);
  assert(r1.isRandom === false, `极端规律(1,1,1,2,2,2,...)扑克检验不通过 (p=${r1.pValue})`);

  // 真随机大概率通过
  let passCount = 0;
  for (let i = 0; i < 30; i++) {
    if (pokerTest(generateTrueRandom(40, 1, 9)).isRandom) passCount++;
  }
  assert(passCount >= 20, `30 次真随机扑克检验通过 ${passCount} 次 (期望 >=20)`);

  // patterns 值之和 = 组数
  const seq = generateTrueRandom(40, 1, 9);
  const r2 = pokerTest(seq, 3);
  const numGroups = Math.floor(seq.length / 3);
  const sumPatterns = Array.from(r2.patterns.values()).reduce((s, v) => s + v, 0);
  assert(sumPatterns === numGroups, `patterns 值之和=${sumPatterns} 等于组数 ${numGroups}`);

  // 边界
  assert(pokerTest([]).isRandom === true, '空序列扑克检验不报错');
  assert(pokerTest([1, 2]).isRandom === true, '不足一组的序列不报错');
})();

// ========== calculateRandomnessScore ==========
console.log('\n📊 calculateRandomnessScore');

(function () {
  // 真随机序列大部分情况得分 > 70（用 5 次均值衡量，避免单次波动）
  let randomScores = [];
  for (let i = 0; i < 5; i++) randomScores.push(calculateRandomnessScore(generateTrueRandom(40, 1, 9)).score);
  const avgRandom = randomScores.reduce((a, b) => a + b, 0) / randomScores.length;
  assert(avgRandom > 70, `5 次真随机平均得分 ${avgRandom.toFixed(1)} > 70`);
  assert(randomScores.filter(s => s > 60).length >= 4, `5 次中至少 4 次 > 60`);

  // 完全规律序列 [1,2,3,...循环] 得分应 < 40
  const cyclic = cyclicSeq(40);
  const cyclicScore = calculateRandomnessScore(cyclic).score;
  assert(cyclicScore < 40, `完全循环序列得分 ${cyclicScore} < 40`);

  // 完全重复 [5,5,5,...] 得分应 < 20
  const repScore = calculateRandomnessScore(new Array(40).fill(5)).score;
  assert(repScore < 20, `完全重复序列得分 ${repScore} < 20`);

  // 典型人类序列（过度交替）得分应在 50-80 之间
  const typicalHuman = [1, 5, 1, 2, 9, 2, 9, 4, 7, 1, 2, 8, 6, 5, 1, 5, 3, 7, 3, 8, 3, 6, 2, 3, 7, 1, 3, 4, 1, 6, 3, 5, 1, 4, 4, 9, 7, 9, 3, 9];
  const humanResult = calculateRandomnessScore(typicalHuman);
  assert(humanResult.score >= 50 && humanResult.score <= 80, `典型人类序列得分 ${humanResult.score} 在 50-80 之间`);

  // 基本属性
  const r = calculateRandomnessScore(generateTrueRandom(40, 1, 9));
  assert(r.score >= 0 && r.score <= 100, 'score 在 0-100 范围');
  assert(['S', 'A', 'B', 'C', 'D'].includes(r.grade), `grade 是 S/A/B/C/D 之一 (得 ${r.grade})`);
  assert(r.ageEquivalent >= 4 && r.ageEquivalent <= 91, `ageEquivalent 在 4-91 (得 ${r.ageEquivalent})`);

  // details 包含各检验结果
  assert(r.details.frequency && r.details.runs && r.details.adjacency &&
         r.details.autocorrelation && r.details.poker, 'details 包含各检验结果');
  assert(r.details.penalties && typeof r.details.summary === 'string', 'details 包含扣分明细与人话解释');

  // 短序列给出明确低分/提示
  const short = calculateRandomnessScore([1, 2, 3, 4]);
  assert(short.score <= 10, '短序列给出明确低分');
  assert(short.details && (short.details.note || short.details.summary), '短序列给出提示');
})();

// ========== generateTrueRandom ==========
console.log('\n📊 generateTrueRandom');

(function () {
  const seq = generateTrueRandom(40, 1, 9);
  assert(seq.length === 40, '生成长度 40');
  assert(seq.every(v => v >= 1 && v <= 9), '所有值在 [1,9] 范围');

  const seq2 = generateTrueRandom(20, 3, 7);
  assert(seq2.length === 20, '生成长度 20');
  assert(seq2.every(v => v >= 3 && v <= 7), '所有值在 [3,7] 范围');

  // 多次生成不完全相同
  const a = generateTrueRandom(40, 1, 9);
  const b = generateTrueRandom(40, 1, 9);
  assert(!a.every((v, i) => v === b[i]), '两次生成不完全相同');

  assert(generateTrueRandom(0, 1, 9).length === 0, 'length=0 返回空数组');
  assert(Array.isArray(generateTrueRandom(-5, 1, 9)) && generateTrueRandom(-5, 1, 9).length === 0, '负长度返回空数组');
})();

// ========== getAgeCurveData ==========
console.log('\n📊 getAgeCurveData');

(function () {
  const curve = getAgeCurveData();
  assert(curve.ages.length === curve.scores.length, `ages 与 scores 长度相同 (${curve.ages.length})`);
  assert(curve.ages[0] <= 4 && curve.ages[curve.ages.length - 1] >= 91, 'ages 覆盖 4-91 范围');

  // 25 岁附近为峰值
  const peakIdx = curve.scores.indexOf(Math.max(...curve.scores));
  const peakAge = curve.ages[peakIdx];
  assert(peakAge >= 22 && peakAge <= 26, `峰值年龄≈25 (得 ${peakAge} 岁，分数 ${curve.scores[peakIdx]})`);

  // 所有 scores 在 0-100
  assert(curve.scores.every(s => s >= 0 && s <= 100), '所有 scores 在 0-100');

  // 单调性：25 岁前大致递增，25 岁后大致递减
  const idx25 = curve.ages.indexOf(25);
  let incOK = true, decOK = true;
  for (let i = 1; i <= idx25; i++) if (curve.scores[i] < curve.scores[i - 1] - 1) { incOK = false; break; }
  for (let i = idx25 + 1; i < curve.scores.length; i++) if (curve.scores[i] > curve.scores[i - 1] + 1) { decOK = false; break; }
  assert(incOK, '25 岁前曲线大致递增');
  assert(decOK, '25 岁后曲线大致递减');
})();

// ========== 边界与鲁棒性 ==========
console.log('\n📊 边界条件');

(function () {
  // 所有函数对空数组不报错
  let ok = true;
  try {
    frequencyTest([]);
    runsTest([]);
    adjacencyAnalysis([]);
    autocorrelationTest([]);
    pokerTest([]);
    calculateRandomnessScore([]);
  } catch (e) { ok = false; }
  assert(ok, '所有函数对空数组不报错');

  // 所有函数对长度1的数组不报错
  ok = true;
  try {
    frequencyTest([5]);
    runsTest([5]);
    adjacencyAnalysis([5]);
    autocorrelationTest([5]);
    pokerTest([5]);
    calculateRandomnessScore([5]);
  } catch (e) { ok = false; }
  assert(ok, '所有函数对长度1的数组不报错');

  // 非法输入（含0、含10以上）有合理处理
  const dirty = [0, 1, 10, 5, 2, 9, 3, 7, 4, 6, 8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2];
  let dirtyOk = true;
  let freqDirty, scoreDirty;
  try {
    freqDirty = frequencyTest(dirty);
    scoreDirty = calculateRandomnessScore(dirty);
  } catch (e) { dirtyOk = false; }
  assert(dirtyOk, '含非法值的序列不报错');
  if (freqDirty) {
    const sumObs = freqDirty.observed.reduce((s, v) => s + v, 0);
    assert(sumObs <= dirty.length, '非法值被忽略，observed 之和 <= 序列长度');
  }
  if (scoreDirty) assert(scoreDirty.score >= 0 && scoreDirty.score <= 100, '非法输入得分仍在 0-100');

  // calculateRandomnessScore 对长度 < 10 给出明确的低分或提示
  const short = calculateRandomnessScore([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert(short.score <= 10, `长度<10 序列明确低分 (得 ${short.score})`);
  assert(short.details && (short.details.note || short.details.summary), '长度<10 序列给出提示');
})();

// ========== 统计稳定性（跑100次看概率） ==========
console.log('\n📊 统计稳定性');

(function () {
  // 100 个真随机序列，calculateRandomnessScore > 60 的比例应 > 70%
  let scorePass = 0;
  for (let i = 0; i < 100; i++) {
    if (calculateRandomnessScore(generateTrueRandom(40, 1, 9)).score > 60) scorePass++;
  }
  assert(scorePass > 70, `100 次真随机得分>60 的比例 ${scorePass}% > 70%`);

  // 100 个真随机序列，frequencyTest.isRandom 的比例应 > 80%
  let freqPass = 0;
  for (let i = 0; i < 100; i++) {
    if (frequencyTest(generateTrueRandom(40, 1, 9)).isRandom) freqPass++;
  }
  assert(freqPass > 80, `100 次真随机频率检验通过率 ${freqPass}% > 80%`);

  // 验证检验本身不会"误杀"真随机
  let allTestsPass = 0;
  for (let i = 0; i < 100; i++) {
    const s = generateTrueRandom(40, 1, 9);
    if (frequencyTest(s).isRandom && pokerTest(s).isRandom) allTestsPass++;
  }
  assert(allTestsPass > 70, `100 次真随机频率+扑克双通过率 ${allTestsPass}% > 70%`);
})();

// === 总结 ===
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
