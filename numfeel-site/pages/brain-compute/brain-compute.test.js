/**
 * brain-compute.test.js — "人脑算力" demo 核心逻辑测试
 * 运行：node pages/brain-compute/brain-compute.test.js
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  MATH_ROUNDS,
  computeAnswer,
  checkMathAnswer,
  formatSeconds,
  ANTICIPATORY_MS,
  summarizeReaction,
  reactionToHz,
  buildGrid,
  isHit,
  landingX,
  predictionError,
  scoreLanding,
  BRAIN,
  FRONTIER,
  efficiency,
  efficiencyRatio,
  formatBig,
  orderOfMagnitude,
  computeScore,
  scoreBreakdown,
  gradeOf,
} = require('./logic.js');

// ── 心算题 ──
describe('心算题', function () {
  test('固定 3 题，前两题 easy，第三题 hard', function () {
    assert.equal(MATH_ROUNDS.length, 3);
    assert.equal(MATH_ROUNDS[0].hard, false);
    assert.equal(MATH_ROUNDS[1].hard, false);
    assert.equal(MATH_ROUNDS[2].hard, true);
  });
  test('computeAnswer 覆盖 + - ×', function () {
    assert.equal(computeAnswer(7, 8, '×'), 56);
    assert.equal(computeAnswer(38, 47, '+'), 85);
    assert.equal(computeAnswer(4832, 7691, '×'), 37162912);
    assert.equal(computeAnswer(10, 3, '-'), 7);
  });
  test('不支持的运算符抛错', function () {
    assert.throws(() => computeAnswer(1, 2, '/'));
  });
  test('checkMathAnswer 容忍空格与逗号', function () {
    assert.equal(checkMathAnswer('56', 56), true);
    assert.equal(checkMathAnswer(' 56 ', 56), true);
    assert.equal(checkMathAnswer('37,162,912', 37162912), true);
    assert.equal(checkMathAnswer('57', 56), false);
    assert.equal(checkMathAnswer('', 56), false);
    assert.equal(checkMathAnswer(null, 56), false);
  });
  test('formatSeconds 保留两位', function () {
    assert.equal(formatSeconds(1234), '1.23 秒');
    assert.equal(formatSeconds(500), '0.50 秒');
  });
});

// ── 反应时间 ──
describe('反应时间', function () {
  test('剔除抢跳（低于阈值）', function () {
    const r = summarizeReaction([50, 250, 300]);
    assert.equal(r.anticipatory, 1);
    assert.equal(r.valid.length, 2);
    assert.equal(r.avg, 275);
    assert.equal(r.best, 250);
  });
  test('全部抢跳时返回 0', function () {
    const r = summarizeReaction([10, 20]);
    assert.equal(r.valid.length, 0);
    assert.equal(r.avg, 0);
    assert.equal(r.hz, 0);
  });
  test('阈值边界值计入有效', function () {
    const r = summarizeReaction([ANTICIPATORY_MS, 200]);
    assert.equal(r.valid.length, 2);
  });
  test('reactionToHz 正确换算', function () {
    assert.equal(reactionToHz(1000), 1);
    assert.equal(reactionToHz(250), 4);
    assert.equal(reactionToHz(0), 0);
  });
});

// ── 找猫网格 ──
describe('找猫网格', function () {
  test('尺寸与目标数量正确', function () {
    const g = buildGrid(4, 5, () => 0.5);
    assert.equal(g.cells.length, 20);
    assert.equal(g.cells.filter((c) => c === 'cat').length, 1);
    assert.equal(g.cells.filter((c) => c === 'dog').length, 19);
  });
  test('注入 rng 可确定目标位置', function () {
    const g = buildGrid(3, 3, () => 0); // 目标在 index 0
    assert.equal(g.targetIndex, 0);
    assert.equal(g.cells[0], 'cat');
  });
  test('rng 接近 1 时目标不越界', function () {
    const g = buildGrid(3, 3, () => 0.999999);
    assert.ok(g.targetIndex >= 0 && g.targetIndex < 9);
    assert.equal(g.cells[g.targetIndex], 'cat');
  });
  test('非法尺寸抛错', function () {
    assert.throws(() => buildGrid(0, 5));
  });
  test('isHit 判定', function () {
    assert.equal(isHit(3, 3), true);
    assert.equal(isHit(2, 3), false);
  });
});

// ── 抛物线落点 ──
describe('抛物线落点', function () {
  test('对称抛射落点符合解析解', function () {
    // 从地面 (0,0) 以 vx=10, vy=-10 抛出，g=10，落回 y=0
    // 飞行时间 t = -2*vy/g = 2s，落点 x = 10*2 = 20
    const x = landingX(0, 0, 10, -10, 10, 0);
    assert.ok(Math.abs(x - 20) < 1e-9, `期望 20，得到 ${x}`);
  });
  test('从高处水平抛出', function () {
    // (0,0) 高处，groundY=100 在下方，vx=5, vy=0, g=10
    // 100 = 0.5*10*t^2 -> t=sqrt(20)=4.472, x=5*4.472≈22.36
    const x = landingX(0, 0, 5, 0, 10, 100);
    assert.ok(Math.abs(x - 22.36) < 0.01, `得到 ${x}`);
  });
  test('g<=0 抛错', function () {
    assert.throws(() => landingX(0, 0, 5, 0, 0, 100));
  });
  test('predictionError 取绝对值', function () {
    assert.equal(predictionError(120, 100), 20);
    assert.equal(predictionError(80, 100), 20);
  });
  test('scoreLanding 满分/零分/评级', function () {
    assert.deepEqual(scoreLanding(0, 100), { score: 100, rating: 'perfect' });
    assert.equal(scoreLanding(100, 100).score, 0);
    assert.equal(scoreLanding(200, 100).score, 0); // 不为负
    assert.equal(scoreLanding(5, 100).rating, 'perfect');
    assert.equal(scoreLanding(20, 100).rating, 'great');
    assert.equal(scoreLanding(50, 100).rating, 'ok');
    assert.equal(scoreLanding(80, 100).rating, 'miss');
  });
});

// ── 能效比 ──
describe('能效比', function () {
  test('efficiency = flops/watts', function () {
    assert.equal(efficiency(1000, 10), 100);
    assert.throws(() => efficiency(1000, 0));
  });
  test('人脑能效约为超算的百万倍量级', function () {
    const ratio = efficiencyRatio(BRAIN, FRONTIER);
    // 5e16 / 5.2e10 ≈ 9.5e5
    assert.ok(ratio > 1e5 && ratio < 1e7, `倍数 ${ratio} 不在预期量级`);
    assert.equal(orderOfMagnitude(ratio), 6);
  });
  test('formatBig 中文单位', function () {
    assert.equal(formatBig(8.6e10), '860 亿');
    assert.equal(formatBig(1e14), '100 万亿');
    assert.equal(formatBig(0), '0');
  });
  test('orderOfMagnitude', function () {
    assert.equal(orderOfMagnitude(1000), 3);
    assert.equal(orderOfMagnitude(1e6), 6);
    assert.equal(orderOfMagnitude(0), 0);
  });
});

// ── 综合评分 ──
describe('综合评分 computeScore', function () {
  test('三项接近最优接近满分 300', function () {
    const s = computeScore(150, 400, 100);
    assert.equal(s, 300);
  });
  test('三项达到最差记 0 分', function () {
    const s = computeScore(450, 3000, 0);
    assert.equal(s, 0);
  });
  test('超过最优上限不溢出（仍封顶各 100）', function () {
    const s = computeScore(80, 200, 100);
    assert.equal(s, 300);
  });
  test('低于最差下限不为负', function () {
    const s = computeScore(9999, 99999, -50);
    assert.equal(s, 0);
  });
  test('中间值单调：更快反应得分更高', function () {
    const slow = computeScore(400, 1500, 50);
    const fast = computeScore(200, 1500, 50);
    assert.ok(fast > slow, `fast=${fast} 应大于 slow=${slow}`);
  });
  test('分项合计等于总分', function () {
    const bd = scoreBreakdown(300, 1500, 60);
    const total = computeScore(300, 1500, 60);
    assert.equal(bd.reaction + bd.cat + bd.ball, total);
  });
});

describe('评级 gradeOf', function () {
  test('各档边界', function () {
    assert.equal(gradeOf(300).level, 'reflex');
    assert.equal(gradeOf(260).level, 'reflex');
    assert.equal(gradeOf(259).level, 'sharp');
    assert.equal(gradeOf(200).level, 'sharp');
    assert.equal(gradeOf(140).level, 'trained');
    assert.equal(gradeOf(80).level, 'human');
    assert.equal(gradeOf(79).level, 'rookie');
    assert.equal(gradeOf(0).level, 'rookie');
  });
  test('返回含 label', function () {
    assert.ok(gradeOf(150).label);
  });
});

console.log('所有测试通过 ✓');
