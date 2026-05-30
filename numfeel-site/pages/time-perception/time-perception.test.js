/**
 * 时间感知扭曲实验室 — 单元测试
 * 运行命令: node pages/time-perception/time-perception.test.js
 */

var {
  TRIALS,
  TOTAL_ROUNDS,
  computeDistortion,
  computeAbsDistortion,
  computeWeberScore,
  computeTotalScore,
  getBiasDirection,
  getGrade,
  getExpectedDistortionRange
} = require('./engine.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2714 ' + name);
  } catch (e) {
    failed++;
    console.log('  \u2718 ' + name + ' — ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertClose(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error((msg || '') + ' expected ' + b + ' got ' + a + ' (tol=' + tol + ')');
}

// ====== 测试入口 ======
console.log('时间感知扭曲实验室 — 引擎测试\n');

console.log('实验定义:');
test('TRIALS 数组长度为 8', function () {
  assert(TRIALS.length === 8, '应为8轮, 实际' + TRIALS.length);
});

test('TOTAL_ROUNDS 等于 TRIALS.length', function () {
  assert(TOTAL_ROUNDS === TRIALS.length);
});

test('8 轮分布在 3 个阶段', function () {
  var phases = {};
  for (var i = 0; i < TRIALS.length; i++) {
    phases[TRIALS[i].phase] = (phases[TRIALS[i].phase] || 0) + 1;
  }
  assert(phases.blank === 3, 'blank应有3轮');
  assert(phases.load === 3, 'load应有3轮');
  assert(phases.emotion === 2, 'emotion应有2轮');
});

test('实际时长在合理范围内', function () {
  for (var i = 0; i < TRIALS.length; i++) {
    var s = TRIALS[i].actualSec;
    assert(s >= 10 && s <= 90, 'actualSec超出[10,90]范围: ' + s);
  }
});

console.log('\n计算函数:');

test('computeDistortion — 精确估计返回 0', function () {
  assertClose(computeDistortion(30000, 30000), 0, 0.001);
});

test('computeDistortion — 高估返回正值', function () {
  assertClose(computeDistortion(33000, 30000), 0.1, 0.001);
});

test('computeDistortion — 低估返回负值', function () {
  assertClose(computeDistortion(27000, 30000), -0.1, 0.001);
});

test('computeAbsDistortion — 总是正值', function () {
  assert(computeAbsDistortion(27000, 30000) > 0);
  assert(computeAbsDistortion(33000, 30000) > 0);
});

test('computeWeberScore — 完全一致返回接近0', function () {
  var trials = [
    { estimatedMs: 30000, actualMs: 30000 },
    { estimatedMs: 30000, actualMs: 30000 },
    { estimatedMs: 30000, actualMs: 30000 }
  ];
  var w = computeWeberScore(trials);
  assert(w < 0.001, '韦伯分数应为0, 实际: ' + w);
});

test('computeWeberScore — 有偏差时大于0', function () {
  var trials = [
    { estimatedMs: 27000, actualMs: 30000 },
    { estimatedMs: 33000, actualMs: 30000 },
    { estimatedMs: 30000, actualMs: 30000 }
  ];
  var w = computeWeberScore(trials);
  assert(w > 0.05, '韦伯分数应>0.05, 实际: ' + w);
});

test('computeTotalScore — 完美估计得满分', function () {
  var trials = TRIALS.map(function (t) {
    return { estimatedMs: t.actualSec * 1000, actualMs: t.actualSec * 1000, phase: t.phase };
  });
  var score = computeTotalScore(trials);
  assert(score >= 90, '完美估计应≥90分, 实际: ' + score);
});

test('computeTotalScore — 大幅偏差得低分', function () {
  var trials = TRIALS.map(function (t) {
    return { estimatedMs: t.actualSec * 1000 * 2, actualMs: t.actualSec * 1000, phase: t.phase };
  });
  var score = computeTotalScore(trials);
  assert(score < 40, '2倍偏差应<40分, 实际: ' + score);
});

test('getBiasDirection — 纯高估返回 overestimator', function () {
  var trials = [
    { estimatedMs: 35000, actualMs: 30000 },
    { estimatedMs: 36000, actualMs: 30000 }
  ];
  assert(getBiasDirection(trials) === 'overestimator');
});

test('getBiasDirection — 纯低估返回 underestimator', function () {
  var trials = [
    { estimatedMs: 25000, actualMs: 30000 },
    { estimatedMs: 24000, actualMs: 30000 }
  ];
  assert(getBiasDirection(trials) === 'underestimator');
});

test('getBiasDirection — 均衡返回 balanced', function () {
  var trials = [
    { estimatedMs: 31000, actualMs: 30000 },
    { estimatedMs: 29000, actualMs: 30000 }
  ];
  assert(getBiasDirection(trials) === 'balanced');
});

test('getGrade — 分数映射正确', function () {
  assert(getGrade(90) === '\u65f6\u95f4\u5927\u5e08');
  assert(getGrade(75) === '\u826f\u597d\u65f6\u611f');
  assert(getGrade(55) === '\u7565\u6709\u504f\u5dee');
  assert(getGrade(35) === '\u65f6\u611f\u6a21\u7cca');
  assert(getGrade(15) === '\u65f6\u611f\u5d29\u574f');
});

test('getExpectedDistortionRange — 所有条件都有合法范围', function () {
  for (var i = 0; i < TRIALS.length; i++) {
    var t = TRIALS[i];
    var range = getExpectedDistortionRange(t.phase, t.condition);
    assert(range.min < range.max, t.label + ' 范围无效');
    assert(range.min >= -1 && range.max <= 1, t.label + ' 范围超出[-1,1]');
  }
});

console.log('\n\u603b\u8ba1: ' + passed + ' \u901a\u8fc7, ' + failed + ' \u5931\u8d25\n');
if (failed > 0) process.exit(1);
