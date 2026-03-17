/**
 * 注意力挑战 — 单元测试
 * 用 node pages/attention-challenge.test.js 直接运行
 */

const {
  calcMean, calcMedian, calcStdDev,
  fitExponentialDecay, predictDecay,
  calcAttentionScore, getAttentionLevel,
  analyzeDecay, generateComparisonData,
  generateTargetPosition, generateDelay
} = require('./attention-challenge-logic.js');

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

function approxEqual(a, b, tol = 0.05) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

// === calcMean ===
console.log('\n📊 calcMean');
assert(calcMean([1, 2, 3, 4, 5]) === 3, '均值 [1,2,3,4,5] = 3');
assert(calcMean([]) === 0, '空数组均值 = 0');
assert(calcMean([100]) === 100, '单元素均值');

// === calcMedian ===
console.log('\n📊 calcMedian');
assert(calcMedian([1, 2, 3, 4, 5]) === 3, '奇数个中位数 = 3');
assert(calcMedian([1, 2, 3, 4]) === 2.5, '偶数个中位数 = 2.5');
assert(calcMedian([]) === 0, '空数组中位数 = 0');

// === calcStdDev ===
console.log('\n📊 calcStdDev');
assert(calcStdDev([]) === 0, '空数组标准差 = 0');
assert(calcStdDev([5]) === 0, '单元素标准差 = 0');
assert(approxEqual(calcStdDev([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.02), '标准差计算正确');

// === fitExponentialDecay ===
console.log('\n📊 fitExponentialDecay');
// 完美指数衰减数据
const perfectDecay = [];
for (let i = 0; i < 20; i++) {
  perfectDecay.push(100 * Math.exp(-0.1 * i) + 300);
}
const fit = fitExponentialDecay(perfectDecay);
assert(fit.r2 > 0.95, `完美衰减数据 R² = ${fit.r2} > 0.95`);
assert(approxEqual(fit.a, 100, 0.15), `拟合 a ≈ 100, 实际 ${fit.a.toFixed(1)}`);
assert(approxEqual(fit.b, 0.1, 0.2), `拟合 b ≈ 0.1, 实际 ${fit.b.toFixed(3)}`);

// 少量数据
const shortFit = fitExponentialDecay([500, 400]);
assert(shortFit.c !== undefined, '2个数据点也能返回结果');

const emptyFit = fitExponentialDecay([]);
assert(emptyFit.a === 0 && emptyFit.b === 0, '空数组返回零参数');

// === predictDecay ===
console.log('\n📊 predictDecay');
const params = { a: 100, b: 0.1, c: 300 };
assert(approxEqual(predictDecay(params, 0), 400, 0.01), 't=0 预测值 ≈ 400');
assert(predictDecay(params, 100) < 310, 't=100 预测值接近渐近线300');

// === calcAttentionScore ===
console.log('\n📊 calcAttentionScore');
// 完美表现：快速反应，全部命中
const perfectScore = calcAttentionScore([250, 260, 240, 255, 245], 5, 0);
assert(perfectScore >= 80, `完美表现得分 ${perfectScore} >= 80`);

// 差表现：慢反应，多次失误
const poorScore = calcAttentionScore([700, 750, 800, 680, 720], 3, 2);
assert(poorScore < 50, `差表现得分 ${poorScore} < 50`);

// 空数据
assert(calcAttentionScore([], 0, 0) === 0, '空数据得分 = 0');

// 分数范围
assert(perfectScore >= 0 && perfectScore <= 100, '分数在0-100范围');
assert(poorScore >= 0 && poorScore <= 100, '分数在0-100范围');

// === getAttentionLevel ===
console.log('\n📊 getAttentionLevel');
assert(getAttentionLevel(95).level === '超强专注', '95分 = 超强专注');
assert(getAttentionLevel(80).level === '高度专注', '80分 = 高度专注');
assert(getAttentionLevel(65).level === '正常水平', '65分 = 正常水平');
assert(getAttentionLevel(45).level === '轻度分散', '45分 = 轻度分散');
assert(getAttentionLevel(20).level === '严重分散', '20分 = 严重分散');
assert(getAttentionLevel(90).color === '#4ade80', '超强专注颜色正确');

// === analyzeDecay ===
console.log('\n📊 analyzeDecay');
const sampleTimes = [300, 310, 320, 350, 360, 370, 400, 410, 420, 450, 460, 470, 500, 510, 520];
const windows = analyzeDecay(sampleTimes, 5);
assert(windows.length === 3, `15个数据分5个一组 = 3个窗口, 实际 ${windows.length}`);
assert(windows[0].avgRT < windows[2].avgRT, '后期窗口反应时间更长（注意力衰减）');
assert(windows[0].startRound === 1, '第一个窗口从第1轮开始');

const emptyWindows = analyzeDecay([], 5);
assert(emptyWindows.length === 0, '空数据返回空窗口');

// === generateComparisonData ===
console.log('\n📊 generateComparisonData');
const comp = generateComparisonData();
assert(comp.before.length === 30, '刷视频前30个数据点');
assert(comp.after.length === 30, '刷视频后30个数据点');
assert(calcMean(comp.before) < calcMean(comp.after), '刷视频后平均反应时间更长');
assert(comp.before.every(t => t > 0), '所有反应时间为正');
assert(comp.after.every(t => t > 0), '所有反应时间为正');

// === generateTargetPosition ===
console.log('\n📊 generateTargetPosition');
const pos = generateTargetPosition(400, 600, 50);
assert(pos.x >= 50 && pos.x <= 350, `x坐标在有效范围: ${pos.x}`);
assert(pos.y >= 50 && pos.y <= 550, `y坐标在有效范围: ${pos.y}`);
// 多次生成检查随机性
const positions = new Set();
for (let i = 0; i < 20; i++) {
  const p = generateTargetPosition(400, 600, 50);
  positions.add(`${p.x},${p.y}`);
}
assert(positions.size > 10, `20次生成有${positions.size}个不同位置（随机性）`);

// === generateDelay ===
console.log('\n📊 generateDelay');
for (let i = 0; i < 50; i++) {
  const d = generateDelay(500, 2000);
  assert(d >= 500 && d <= 2000, `延迟 ${d} 在 [500, 2000] 范围`);
}

// === 总结 ===
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
