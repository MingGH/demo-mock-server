const L = require('./ai-tools-value-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  ✓ ' + message);
    passed++;
  } else {
    console.error('  ✗ ' + message);
    failed++;
  }
}

function assertClose(a, b, tol, message) {
  assert(Math.abs(a - b) <= tol, message + ' (got ' + a + ', expected ~' + b + ')');
}

function makeRng(seed) {
  let x = seed || 123456789;
  return function () {
    x = (1103515245 * x + 12345) % 2147483648;
    return x / 2147483648;
  };
}

console.log('\n[normalizeParams]');
const p1 = L.normalizeParams({
  tasksPerMonth: -2,
  hourlyValue: 88,
  toolCost: 140,
  draftMinutes: 300,
  draftSavePct: 120,
  researchSavePct: -3,
  polishSavePct: 50,
  verifyMinutes: -10
});
assert(p1.tasksPerMonth === 0, '负任务数会被修正为0');
assert(p1.draftMinutes === 180, '基准耗时上限为180分钟');
assert(p1.draftSavePct === 95, '节省比例上限95%');
assert(p1.researchSavePct === 0, '节省比例下限0%');
assert(p1.verifyMinutes === 0, '核验分钟数下限0');

console.log('\n[calcPerTaskMinutes]');
const perTask = L.calcPerTaskMinutes({
  draftMinutes: 30, researchMinutes: 30, polishMinutes: 30,
  draftSavePct: 50, researchSavePct: 50, polishSavePct: 50, verifyMinutes: 15
});
assertClose(perTask.manualPerTask, 90, 0.001, '手工每任务耗时正确');
assertClose(perTask.aiPerTask, 60, 0.001, 'AI每任务耗时正确');
assertClose(perTask.savedPerTask, 30, 0.001, '每任务节省耗时正确');

console.log('\n[calculateROI]');
const roi1 = L.calculateROI({
  tasksPerMonth: 30,
  hourlyValue: 60,
  toolCost: 120,
  draftMinutes: 30, researchMinutes: 20, polishMinutes: 10,
  draftSavePct: 50, researchSavePct: 50, polishSavePct: 50,
  verifyMinutes: 10
});
assert(roi1.savedHours > 0, '节省时长大于0');
assert(roi1.monthlyTimeValue > 0, '时间价值大于0');
assert(roi1.netGain > 0, '净收益为正');
assert(roi1.positive === true, 'positive 标记正确');
assert(roi1.roi > 0, 'ROI 为正');

const roi2 = L.calculateROI({
  tasksPerMonth: 5,
  hourlyValue: 30,
  toolCost: 200,
  draftMinutes: 20, researchMinutes: 15, polishMinutes: 15,
  draftSavePct: 10, researchSavePct: 10, polishSavePct: 10,
  verifyMinutes: 20
});
assert(roi2.netGain < 0, '低任务+高月费时净收益为负');

console.log('\n[breakEvenTasks]');
const be1 = L.breakEvenTasks({
  hourlyValue: 100,
  toolCost: 100,
  draftMinutes: 30, researchMinutes: 30, polishMinutes: 0,
  draftSavePct: 50, researchSavePct: 50, polishSavePct: 0,
  verifyMinutes: 0
});
assertClose(be1, 2, 0.05, '盈亏平衡任务量计算正确');

const be2 = L.breakEvenTasks({
  hourlyValue: 100,
  toolCost: 100,
  draftMinutes: 10, researchMinutes: 10, polishMinutes: 10,
  draftSavePct: 0, researchSavePct: 0, polishSavePct: 0,
  verifyMinutes: 30
});
assert(be2 === Infinity, '无节省时盈亏平衡不可达');

console.log('\n[classifyResult]');
assert(L.classifyResult({ roi: 1.2 }).level === 'excellent', '高ROI分级正确');
assert(L.classifyResult({ roi: 0.5 }).level === 'good', '中高ROI分级正确');
assert(L.classifyResult({ roi: 0.05 }).level === 'neutral', '低正ROI分级正确');
assert(L.classifyResult({ roi: -0.1 }).level === 'bad', '负ROI分级正确');

console.log('\n[simulateROIInterval]');
const sim = L.simulateROIInterval({
  tasksPerMonth: 30,
  hourlyValue: 80,
  toolCost: 100,
  draftMinutes: 35, researchMinutes: 25, polishMinutes: 20,
  draftSavePct: 45, researchSavePct: 35, polishSavePct: 25,
  verifyMinutes: 10
}, 800, makeRng(42));
assert(sim.p10ROI <= sim.p50ROI && sim.p50ROI <= sim.p90ROI, 'ROI分位顺序正确');
assert(sim.p10NetGain <= sim.p50NetGain && sim.p50NetGain <= sim.p90NetGain, '净收益分位顺序正确');
assert(sim.positiveRate >= 0 && sim.positiveRate <= 1, '盈利概率在[0,1]');

console.log('\n[generateTaskCurve]');
const curve = L.generateTaskCurve({
  tasksPerMonth: 20,
  hourlyValue: 100,
  toolCost: 100,
  draftMinutes: 30, researchMinutes: 30, polishMinutes: 30,
  draftSavePct: 40, researchSavePct: 40, polishSavePct: 40,
  verifyMinutes: 10
}, 40);
assert(curve.length > 5, '曲线点数量正确');
assert(curve[0].tasks === 0, '曲线从0任务开始');
assert(curve[curve.length - 1].tasks === 40, '曲线到指定任务上限');
assert(curve[0].netGain <= curve[curve.length - 1].netGain, '任务增加时净收益整体上升');

console.log('\n' + '='.repeat(36));
console.log('测试结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exit(1);
