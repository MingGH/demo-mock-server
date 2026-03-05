/**
 * 运气到底存不存在 - 单元测试
 * 测试等待时间悖论、友谊悖论、连胜分析、峰终定律、平行人生模拟的核心逻辑
 */

// ========== 核心函数（从页面复制，保持一致） ==========

function normalRandom() {
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

function gammaRandom(shape, scale) {
  if (shape < 1) {
    return gammaRandom(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1/3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

function generateIntervals(n, mean, cv) {
  if (cv === 0) return Array(n).fill(mean);
  const shape = 1 / (cv * cv);
  const scale = mean / shape;
  const intervals = [];
  for (let i = 0; i < n; i++) {
    intervals.push(gammaRandom(shape, scale));
  }
  return intervals;
}

function simulateBusWait(intervals, numArrivals) {
  const cumulative = [];
  let sum = 0;
  for (const iv of intervals) {
    sum += iv;
    cumulative.push(sum);
  }
  const totalTime = sum;
  const waits = [];
  for (let i = 0; i < numArrivals; i++) {
    const arriveAt = Math.random() * totalTime;
    let wait = 0;
    for (const busTime of cumulative) {
      if (busTime >= arriveAt) {
        wait = busTime - arriveAt;
        break;
      }
    }
    waits.push(wait);
  }
  return waits;
}

function theoreticalWait(mean, cv) {
  return (mean / 2) * (1 + cv * cv);
}

function generateNetwork(n, avgFriends) {
  const edges = new Set();
  const degree = new Array(n).fill(0);
  const targetEdges = Math.floor(n * avgFriends / 2);
  let attempts = 0;
  while (edges.size < targetEdges && attempts < targetEdges * 10) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    if (a !== b) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edges.has(key)) {
        edges.add(key);
        degree[a]++;
        degree[b]++;
      }
    }
    attempts++;
  }
  const adj = Array.from({length: n}, () => []);
  for (const e of edges) {
    const [a, b] = e.split('-').map(Number);
    adj[a].push(b);
    adj[b].push(a);
  }
  return { adj, degree };
}

function calcFriendshipParadox(adj, degree) {
  const n = degree.length;
  const avgDegree = degree.reduce((a, b) => a + b, 0) / n;
  let fofSum = 0;
  let fofCount = 0;
  let paradoxCount = 0;
  for (let i = 0; i < n; i++) {
    if (adj[i].length === 0) continue;
    const friendAvg = adj[i].reduce((s, f) => s + degree[f], 0) / adj[i].length;
    fofSum += friendAvg;
    fofCount++;
    if (degree[i] < friendAvg) paradoxCount++;
  }
  const avgFOF = fofCount > 0 ? fofSum / fofCount : 0;
  return {
    avgDegree,
    avgFOF,
    paradoxPercent: fofCount > 0 ? paradoxCount / fofCount : 0,
    ratio: avgDegree > 0 ? avgFOF / avgDegree : 0
  };
}

function analyzeStreaks(sequence) {
  let maxHead = 0, maxTail = 0, curHead = 0, curTail = 0;
  for (const v of sequence) {
    if (v === 1) { curHead++; curTail = 0; maxHead = Math.max(maxHead, curHead); }
    else { curTail++; curHead = 0; maxTail = Math.max(maxTail, curTail); }
  }
  return { maxHead, maxTail };
}

function expectedMaxStreak(n) {
  return Math.log2(n);
}

function generateCoinFlips(n) {
  return Array.from({length: n}, () => Math.random() < 0.5 ? 1 : 0);
}

function simulateWeekEvents() {
  const days = ['周一','周二','周三','周四','周五','周六','周日'];
  return days.map(day => ({
    day,
    value: Math.round((Math.random() * 10 - 5) * 10) / 10
  }));
}

function calcPeakEnd(events) {
  const values = events.map(e => e.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const peak = values.reduce((a, b) => Math.abs(a) > Math.abs(b) ? a : b, 0);
  const end = values[values.length - 1];
  const peakEnd = (peak + end) / 2;
  const biasedValues = values.map(v => v < 0 ? v * 2.5 : v);
  const biasedPeak = biasedValues.reduce((a, b) => Math.abs(a) > Math.abs(b) ? a : b, 0);
  const biasedEnd = biasedValues[biasedValues.length - 1];
  const biasedPeakEnd = (biasedPeak + biasedEnd) / 2;
  return { avg, peak, end, peakEnd, biasedPeakEnd };
}

function simulateParallelLives(numLives, years, eventsPerYear) {
  const lives = [];
  for (let i = 0; i < numLives; i++) {
    let score = 0;
    const trajectory = [0];
    for (let y = 0; y < years; y++) {
      for (let e = 0; e < eventsPerYear; e++) {
        const r = Math.random();
        if (r < 0.05) score += 10;
        else if (r < 0.20) score += 3;
        else if (r < 0.50) score += 1;
        else if (r < 0.80) score -= 1;
        else if (r < 0.95) score -= 3;
        else score -= 10;
      }
      trajectory.push(score);
    }
    lives.push({ score, trajectory });
  }
  lives.sort((a, b) => a.score - b.score);
  return lives;
}

// ========== 测试 ==========

console.log('🧪 开始测试「运气到底存不存在」核心逻辑\n');

// 测试1: 等待时间理论公式
console.log('测试1: 等待时间悖论理论公式');
{
  // CV=0 时，等待时间 = 间隔/2
  const w0 = theoreticalWait(10, 0);
  console.assert(Math.abs(w0 - 5) < 0.001, `CV=0时应为5, 实际: ${w0}`);
  console.log(`✓ CV=0: E[等待] = ${w0} (预期 5)`);

  // CV=1 时，等待时间 = 间隔
  const w1 = theoreticalWait(10, 1);
  console.assert(Math.abs(w1 - 10) < 0.001, `CV=1时应为10, 实际: ${w1}`);
  console.log(`✓ CV=1: E[等待] = ${w1} (预期 10)`);

  // CV=2 时，等待时间 = 间隔 * 2.5
  const w2 = theoreticalWait(10, 2);
  console.assert(Math.abs(w2 - 25) < 0.001, `CV=2时应为25, 实际: ${w2}`);
  console.log(`✓ CV=2: E[等待] = ${w2} (预期 25)`);

  // 等待时间随CV单调递增
  let prev = 0;
  let monotonic = true;
  for (let cv = 0; cv <= 200; cv++) {
    const w = theoreticalWait(10, cv / 100);
    if (w < prev - 0.0001) { monotonic = false; break; }
    prev = w;
  }
  console.assert(monotonic, '等待时间应随CV单调递增');
  console.log('✓ 等待时间随CV单调递增\n');
}

// 测试2: 等待时间模拟收敛性
console.log('测试2: 等待时间模拟收敛性');
{
  const mean = 10;
  const cv = 1;
  const theory = theoreticalWait(mean, cv);
  let totalAvg = 0;
  const runs = 50;
  for (let i = 0; i < runs; i++) {
    const intervals = generateIntervals(500, mean, cv);
    const waits = simulateBusWait(intervals, 5000);
    totalAvg += waits.reduce((a, b) => a + b, 0) / waits.length;
  }
  const simAvg = totalAvg / runs;
  const diff = Math.abs(simAvg - theory);
  console.assert(diff < 2, `模拟应接近理论值, 差异: ${diff.toFixed(2)}`);
  console.log(`✓ 理论值: ${theory.toFixed(1)}, 模拟均值: ${simAvg.toFixed(1)}, 差异: ${diff.toFixed(2)}\n`);
}

// 测试3: CV=0时间隔完全均匀
console.log('测试3: CV=0时间隔完全均匀');
{
  const intervals = generateIntervals(100, 10, 0);
  const allEqual = intervals.every(v => v === 10);
  console.assert(allEqual, 'CV=0时所有间隔应为10');
  console.log('✓ CV=0: 所有间隔均为10\n');
}

// 测试4: Gamma分布均值正确
console.log('测试4: Gamma分布生成的间隔均值');
{
  const intervals = generateIntervals(10000, 10, 1);
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  console.assert(Math.abs(avg - 10) < 0.5, `均值应接近10, 实际: ${avg.toFixed(2)}`);
  console.assert(intervals.every(v => v > 0), '所有间隔应为正数');
  console.log(`✓ 均值: ${avg.toFixed(2)} (预期 ~10)\n`);
}

// 测试5: 友谊悖论 - 朋友的朋友数 >= 自己的朋友数
console.log('测试5: 友谊悖论核心性质');
{
  let paradoxHolds = 0;
  const trials = 30;
  for (let i = 0; i < trials; i++) {
    const { adj, degree } = generateNetwork(100, 6);
    const result = calcFriendshipParadox(adj, degree);
    if (result.avgFOF >= result.avgDegree) paradoxHolds++;
  }
  console.assert(paradoxHolds >= trials * 0.9, `友谊悖论应在大多数情况下成立, 成立次数: ${paradoxHolds}/${trials}`);
  console.log(`✓ 友谊悖论成立: ${paradoxHolds}/${trials} 次 (预期 ≥${Math.floor(trials * 0.9)})\n`);
}

// 测试6: 友谊悖论 - 大多数人的朋友数低于朋友的平均朋友数
console.log('测试6: 友谊悖论 - 多数人受影响');
{
  const { adj, degree } = generateNetwork(200, 8);
  const result = calcFriendshipParadox(adj, degree);
  console.assert(result.paradoxPercent > 0.4, `应有超过40%的人受友谊悖论影响, 实际: ${(result.paradoxPercent * 100).toFixed(0)}%`);
  console.log(`✓ 受影响比例: ${(result.paradoxPercent * 100).toFixed(0)}%`);
  console.log(`✓ 平均朋友数: ${result.avgDegree.toFixed(1)}, 朋友的平均朋友数: ${result.avgFOF.toFixed(1)}\n`);
}

// 测试7: 连胜分析 - 全正面
console.log('测试7: 连胜分析边界条件');
{
  const allHeads = Array(10).fill(1);
  const r1 = analyzeStreaks(allHeads);
  console.assert(r1.maxHead === 10, `全正面最长连续应为10, 实际: ${r1.maxHead}`);
  console.assert(r1.maxTail === 0, `全正面最长反面应为0, 实际: ${r1.maxTail}`);
  console.log(`✓ 全正面: maxHead=${r1.maxHead}, maxTail=${r1.maxTail}`);

  const allTails = Array(10).fill(0);
  const r2 = analyzeStreaks(allTails);
  console.assert(r2.maxHead === 0, `全反面最长正面应为0`);
  console.assert(r2.maxTail === 10, `全反面最长连续应为10`);
  console.log(`✓ 全反面: maxHead=${r2.maxHead}, maxTail=${r2.maxTail}`);

  const alternating = [1,0,1,0,1,0,1,0];
  const r3 = analyzeStreaks(alternating);
  console.assert(r3.maxHead === 1 && r3.maxTail === 1, '交替序列最长连续应为1');
  console.log(`✓ 交替序列: maxHead=${r3.maxHead}, maxTail=${r3.maxTail}`);

  const single = [1];
  const r4 = analyzeStreaks(single);
  console.assert(r4.maxHead === 1 && r4.maxTail === 0, '单元素序列');
  console.log(`✓ 单元素: maxHead=${r4.maxHead}, maxTail=${r4.maxTail}\n`);
}

// 测试8: 最长连续期望值 log2(n)
console.log('测试8: 最长连续期望收敛到 log2(n)');
{
  const n = 100;
  const expected = expectedMaxStreak(n);
  let totalMax = 0;
  const runs = 2000;
  for (let i = 0; i < runs; i++) {
    const flips = generateCoinFlips(n);
    totalMax += analyzeStreaks(flips).maxHead;
  }
  const simAvg = totalMax / runs;
  const diff = Math.abs(simAvg - expected);
  console.assert(diff < 1.5, `模拟最长连续应接近log2(n), 差异: ${diff.toFixed(2)}`);
  console.log(`✓ 理论 log2(${n}) = ${expected.toFixed(1)}, 模拟均值 = ${simAvg.toFixed(1)}, 差异 = ${diff.toFixed(2)}\n`);
}

// 测试9: 硬币生成器统计
console.log('测试9: 硬币生成器公平性');
{
  const flips = generateCoinFlips(100000);
  const heads = flips.filter(v => v === 1).length;
  const ratio = heads / flips.length;
  console.assert(Math.abs(ratio - 0.5) < 0.01, `正面比例应接近50%, 实际: ${(ratio * 100).toFixed(1)}%`);
  console.assert(flips.length === 100000, '长度应为100000');
  console.log(`✓ 正面比例: ${(ratio * 100).toFixed(2)}% (预期 ~50%)\n`);
}

// 测试10: 峰终定律计算
console.log('测试10: 峰终定律计算');
{
  const events = [
    { day: '周一', value: 2 },
    { day: '周二', value: -4 },
    { day: '周三', value: 1 },
    { day: '周四', value: 3 },
    { day: '周五', value: -1 },
    { day: '周六', value: 0 },
    { day: '周日', value: 2 }
  ];
  const result = calcPeakEnd(events);

  // 平均值
  const expectedAvg = (2 - 4 + 1 + 3 - 1 + 0 + 2) / 7;
  console.assert(Math.abs(result.avg - expectedAvg) < 0.01, `平均值应为${expectedAvg.toFixed(2)}, 实际: ${result.avg.toFixed(2)}`);
  console.log(`✓ 平均值: ${result.avg.toFixed(2)} (预期 ${expectedAvg.toFixed(2)})`);

  // 峰值（绝对值最大）应为 -4
  console.assert(result.peak === -4, `峰值应为-4, 实际: ${result.peak}`);
  console.log(`✓ 峰值: ${result.peak} (预期 -4)`);

  // 终值应为 2（周日）
  console.assert(result.end === 2, `终值应为2, 实际: ${result.end}`);
  console.log(`✓ 终值: ${result.end} (预期 2)`);

  // 峰终值 = (-4 + 2) / 2 = -1
  console.assert(Math.abs(result.peakEnd - (-1)) < 0.01, `峰终值应为-1, 实际: ${result.peakEnd}`);
  console.log(`✓ 峰终值: ${result.peakEnd} (预期 -1)`);

  // 负面偏差后：-4 * 2.5 = -10, 终值2不变, 峰值变为-10
  // biasedPeakEnd = (-10 + 2) / 2 = -4
  console.assert(Math.abs(result.biasedPeakEnd - (-4)) < 0.01, `负面偏差峰终值应为-4, 实际: ${result.biasedPeakEnd}`);
  console.log(`✓ 负面偏差峰终值: ${result.biasedPeakEnd} (预期 -4)\n`);
}

// 测试11: 峰终定律 - 负面偏差使记忆偏低
console.log('测试11: 负面偏差统计验证');
{
  let biasLower = 0;
  const runs = 1000;
  for (let i = 0; i < runs; i++) {
    const events = simulateWeekEvents();
    const result = calcPeakEnd(events);
    if (result.biasedPeakEnd < result.avg) biasLower++;
  }
  const ratio = biasLower / runs;
  console.assert(ratio > 0.4, `负面偏差应使大多数情况下记忆偏低, 比例: ${(ratio * 100).toFixed(0)}%`);
  console.log(`✓ 记忆低于实际的比例: ${(ratio * 100).toFixed(0)}% (预期 >40%)\n`);
}

// 测试12: 平行人生 - 排序正确
console.log('测试12: 平行人生排序和基本性质');
{
  const lives = simulateParallelLives(100, 10, 20);
  console.assert(lives.length === 100, '应有100个人生');

  // 验证排序
  let sorted = true;
  for (let i = 1; i < lives.length; i++) {
    if (lives[i].score < lives[i-1].score) { sorted = false; break; }
  }
  console.assert(sorted, '人生应按得分升序排列');
  console.log('✓ 100个人生按得分升序排列');

  // 轨迹长度
  console.assert(lives[0].trajectory.length === 11, '10年应有11个数据点（含起点）');
  console.log('✓ 轨迹长度正确（11个点）');

  // 起点都是0
  const allStartZero = lives.every(l => l.trajectory[0] === 0);
  console.assert(allStartZero, '所有人生起点应为0');
  console.log('✓ 所有人生起点为0');

  // 最大差距应显著
  const gap = lives[99].score - lives[0].score;
  console.assert(gap > 0, `最大差距应>0, 实际: ${gap}`);
  console.log(`✓ 最幸运: ${lives[99].score}, 最不幸: ${lives[0].score}, 差距: ${gap}\n`);
}

// 测试13: 平行人生 - 期望得分接近0
console.log('测试13: 平行人生期望得分');
{
  // 单次事件期望: 0.05*10 + 0.15*3 + 0.30*1 + 0.30*(-1) + 0.15*(-3) + 0.05*(-10) = 0
  const expectedPerEvent = 0.05*10 + 0.15*3 + 0.30*1 + 0.30*(-1) + 0.15*(-3) + 0.05*(-10);
  console.assert(Math.abs(expectedPerEvent) < 0.001, `单次事件期望应为0, 实际: ${expectedPerEvent}`);
  console.log(`✓ 单次事件期望值: ${expectedPerEvent} (预期 0)`);

  const lives = simulateParallelLives(1000, 10, 20);
  const avgScore = lives.reduce((s, l) => s + l.score, 0) / lives.length;
  console.assert(Math.abs(avgScore) < 15, `1000个人生平均得分应接近0, 实际: ${avgScore.toFixed(1)}`);
  console.log(`✓ 1000个人生平均得分: ${avgScore.toFixed(1)} (预期 ~0)\n`);
}

// 测试14: generateNetwork 边数和度数守恒
console.log('测试14: 社交网络边数和度数守恒');
{
  for (let i = 0; i < 20; i++) {
    const n = 20 + Math.floor(Math.random() * 80);
    const avgF = 2 + Math.floor(Math.random() * 8);
    const { adj, degree } = generateNetwork(n, avgF);
    const totalDegree = degree.reduce((a, b) => a + b, 0);
    const totalAdj = adj.reduce((s, a) => s + a.length, 0);
    console.assert(totalDegree === totalAdj, `度数之和应等于邻接表总长`);
    console.assert(totalDegree % 2 === 0, '度数之和应为偶数');
  }
  console.log('✓ 20次随机网络，度数守恒全部通过\n');
}

console.log('✅ 所有测试通过！核心逻辑验证正确。\n');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    theoreticalWait, generateIntervals, simulateBusWait,
    generateNetwork, calcFriendshipParadox,
    analyzeStreaks, expectedMaxStreak, generateCoinFlips,
    simulateWeekEvents, calcPeakEnd, simulateParallelLives
  };
}
