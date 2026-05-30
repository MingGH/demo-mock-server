const L = require('./predict-100ms-logic.js');

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

function assertClose(actual, expected, tol, message) {
  assert(Math.abs(actual - expected) <= tol, message + ` (got ${actual}, expected ~${expected})`);
}

function fixedRng(value) {
  return function () {
    return value;
  };
}

console.log('\n[normalizeConfig]');
const n = L.normalizeConfig({
  predictionMs: 2,
  reactionMs: 10,
  motorMs: -6,
  jitterMs: 999,
  rounds: 1.8
});
assert(n.predictionMs === 20, '预测窗口下限生效');
assert(n.reactionMs === 50, '反应延迟下限生效');
assert(n.motorMs === 0, '执行延迟下限生效');
assert(n.jitterMs === 200, '波动上限生效');
assert(n.rounds === 1, '轮数会取整');

console.log('\n[minReactionNeeded]');
assertClose(L.minReactionNeeded(100, 35, 0), 65, 0.0001, '100ms 窗口下反应上限计算正确');
assertClose(L.minReactionNeeded(100, 35, 15), 50, 0.0001, '带安全边际时上限更低');

console.log('\n[runTrial]');
const t1 = L.runTrial({ predictionMs: 100, reactionMs: 220, motorMs: 35, jitterMs: 0 }, fixedRng(0.5));
assertClose(t1.totalDelay, 255, 0.0001, '无波动时总延迟可精确计算');
assert(t1.success === false, '普通人参数在100ms窗口下失败');

const t2 = L.runTrial({ predictionMs: 100, reactionMs: 70, motorMs: 20, jitterMs: 0 }, fixedRng(0.5));
assert(t2.success === true, '极快反应在100ms窗口下可成功');

console.log('\n[runBatch]');
const b1 = L.runBatch({ predictionMs: 100, reactionMs: 220, motorMs: 35, jitterMs: 0, rounds: 10 }, fixedRng(0.5));
assert(b1.successCount === 0, '普通人批量模拟成功次数为0');
assertClose(b1.avgDelay, 255, 0.0001, '平均总延迟正确');

const b2 = L.runBatch({ predictionMs: 250, reactionMs: 210, motorMs: 20, jitterMs: 0, rounds: 10 }, fixedRng(0.5));
assert(b2.successCount === 10, '窗口放大后全部成功');
assertClose(b2.successRate, 1, 0.0001, '窗口放大后成功率为100%');

console.log('\n[estimateSuccessRate]');
const e1 = L.estimateSuccessRate({ predictionMs: 100, reactionMs: 220, motorMs: 35, jitterMs: 20 });
assertClose(e1, 0, 0.0001, '理论成功率可判定为0');

const e2 = L.estimateSuccessRate({ predictionMs: 100, reactionMs: 70, motorMs: 20, jitterMs: 10 });
assertClose(e2, 1, 0.0001, '理论成功率可判定为1');

const e3 = L.estimateSuccessRate({ predictionMs: 100, reactionMs: 80, motorMs: 20, jitterMs: 10 });
assert(e3 > 0 && e3 < 1, '理论成功率可以处于0到1之间');

console.log('\n[classify]');
assert(L.classify({ successRate: 0 }).level === 'impossible', '0成功率分类正确');
assert(L.classify({ successRate: 0.05 }).level === 'rare', '低成功率分类正确');
assert(L.classify({ successRate: 0.3 }).level === 'hard', '中等成功率分类正确');
assert(L.classify({ successRate: 0.6 }).level === 'possible', '高成功率分类正确');

console.log('\n[summarizeReactionTest]');
const s1 = L.summarizeReactionTest([210, 190, 230, 205, 195], 100);
assertClose(s1.averageMs, 206, 0.0001, '反应测试平均值正确');
assert(s1.bestMs === 190, '反应测试最快值正确');
assert(s1.worstMs === 230, '反应测试最慢值正确');
assertClose(s1.slowerByMs, 106, 0.0001, '慢于100ms的差值正确');
assertClose(s1.hit100msRate, 0, 0.0001, '命中100ms比例正确');

const s2 = L.summarizeReactionTest([90, 95, 98, 120], 100);
assertClose(s2.hit100msRate, 0.75, 0.0001, '部分命中100ms比例正确');

const s3 = L.summarizeReactionTest([], 100);
assert(s3.count === 0, '空输入统计数量为0');

console.log('\n' + '='.repeat(36));
console.log('测试结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exit(1);
