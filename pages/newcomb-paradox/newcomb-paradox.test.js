var { describe, test } = require('node:test');
var assert = require('node:assert/strict');
var {
  calcOneBoxProbability,
  makePrediction,
  calcPayoff,
  runSimulation,
  calcExpectedValueCurve,
  findCrossoverAccuracy,
  getPayoffMatrix,
  formatMoney,
  getCumulativeData
} = require('./engine.js');

// ── calcOneBoxProbability ───────────────────────────────

describe('calcOneBoxProbability', function() {
  test('null 信号返回 0.5', function() {
    assert.strictEqual(calcOneBoxProbability(null, 0.5), 0.5);
  });

  test('默认信号返回 [0.3, 0.7] 范围内', function() {
    var p = calcOneBoxProbability({ sliderValue: 50, reactionMs: 2000, colorChoice: 0 }, 0.5);
    assert.ok(p >= 0.3 && p <= 0.7, '概率应在 [0.3, 0.7]，实际 ' + p);
  });

  test('极端保守信号 → 偏高概率', function() {
    var p = calcOneBoxProbability({ sliderValue: 0, reactionMs: 10000, colorChoice: 0 }, 0.8);
    assert.ok(p >= 0.5, '保守信号应产生较高一箱概率，实际 ' + p);
  });

  test('极端冒险信号 → 偏低概率', function() {
    var p = calcOneBoxProbability({ sliderValue: 100, reactionMs: 200, colorChoice: 1 }, 0.2);
    assert.ok(p <= 0.5, '冒险信号应产生较低一箱概率，实际 ' + p);
  });

  test('结果始终在 [0.3, 0.7] 范围内', function() {
    var combos = [
      { sliderValue: 0, reactionMs: 0, colorChoice: 0 },
      { sliderValue: 100, reactionMs: 100, colorChoice: 1 },
      { sliderValue: 50, reactionMs: 5000, colorChoice: 0 },
      { sliderValue: 0, reactionMs: 10000, colorChoice: 0 }
    ];
    for (var i = 0; i < combos.length; i++) {
      var p = calcOneBoxProbability(combos[i], 0.5);
      assert.ok(p >= 0.3 && p <= 0.7, '组合 ' + i + ' 概率 ' + p + ' 超出范围');
    }
  });

  test('globalOneBoxRate 影响结果', function() {
    var signals = { sliderValue: 50, reactionMs: 2000, colorChoice: 0 };
    var pLow = calcOneBoxProbability(signals, 0.2);
    var pHigh = calcOneBoxProbability(signals, 0.8);
    assert.ok(pHigh > pLow, '高全站一箱率应产生更高概率');
  });
});

// ── makePrediction ──────────────────────────────────────

describe('makePrediction', function() {
  test('返回 one 或 two', function() {
    for (var i = 0; i < 100; i++) {
      var result = makePrediction(0.5);
      assert.ok(result === 'one' || result === 'two', '应返回 one 或 two，实际 ' + result);
    }
  });

  test('概率 1.0 总是返回 one', function() {
    for (var i = 0; i < 50; i++) {
      assert.strictEqual(makePrediction(1.0), 'one');
    }
  });

  test('概率 0.0 总是返回 two', function() {
    for (var i = 0; i < 50; i++) {
      assert.strictEqual(makePrediction(0.0), 'two');
    }
  });
});

// ── calcPayoff ──────────────────────────────────────────

describe('calcPayoff', function() {
  test('预测一箱 + 选一箱 → 100万', function() {
    var p = calcPayoff('one', 'one', 1000, 1000000);
    assert.strictEqual(p.boxA, 0);
    assert.strictEqual(p.boxB, 1000000);
    assert.strictEqual(p.total, 1000000);
  });

  test('预测一箱 + 选两箱 → 100.1万', function() {
    var p = calcPayoff('one', 'two', 1000, 1000000);
    assert.strictEqual(p.boxA, 1000);
    assert.strictEqual(p.boxB, 1000000);
    assert.strictEqual(p.total, 1001000);
  });

  test('预测两箱 + 选一箱 → 0', function() {
    var p = calcPayoff('two', 'one', 1000, 1000000);
    assert.strictEqual(p.boxA, 0);
    assert.strictEqual(p.boxB, 0);
    assert.strictEqual(p.total, 0);
  });

  test('预测两箱 + 选两箱 → 1000', function() {
    var p = calcPayoff('two', 'two', 1000, 1000000);
    assert.strictEqual(p.boxA, 1000);
    assert.strictEqual(p.boxB, 0);
    assert.strictEqual(p.total, 1000);
  });

  test('自定义金额', function() {
    var p = calcPayoff('one', 'one', 500, 500000);
    assert.strictEqual(p.total, 500000);
  });

  test('默认金额', function() {
    var p = calcPayoff('one', 'two');
    assert.strictEqual(p.total, 1001000);
  });
});

// ── runSimulation ───────────────────────────────────────

describe('runSimulation', function() {
  test('返回正确结构', function() {
    var result = runSimulation({ rounds: 100, accuracy: 0.9 });
    assert.strictEqual(result.rounds, 100);
    assert.strictEqual(result.accuracy, 0.9);
    assert.ok(typeof result.oneBox.totalEarnings === 'number');
    assert.ok(typeof result.oneBox.avgEarnings === 'number');
    assert.strictEqual(result.oneBox.results.length, 100);
    assert.ok(typeof result.twoBox.totalEarnings === 'number');
    assert.strictEqual(result.twoBox.results.length, 100);
  });

  test('高准确率下一箱策略平均收益更高', function() {
    var result = runSimulation({ rounds: 50000, accuracy: 0.99 });
    assert.ok(
      result.oneBox.avgEarnings > result.twoBox.avgEarnings,
      '99% 准确率下一箱应优于两箱: 一箱=' + result.oneBox.avgEarnings + ' 两箱=' + result.twoBox.avgEarnings
    );
  });

  test('50% 准确率下两策略收益接近（差值 < 5%）', function() {
    var result = runSimulation({ rounds: 50000, accuracy: 0.5 });
    var avg = (result.oneBox.avgEarnings + result.twoBox.avgEarnings) / 2;
    var diff = Math.abs(result.oneBox.avgEarnings - result.twoBox.avgEarnings);
    assert.ok(
      diff / avg < 0.05,
      '50% 准确率下两策略应接近: 一箱=' + result.oneBox.avgEarnings + ' 两箱=' + result.twoBox.avgEarnings + ' 差值比=' + (diff / avg).toFixed(4)
    );
  });

  test('每轮收益只有四种可能值', function() {
    var result = runSimulation({ rounds: 1000, accuracy: 0.8 });
    var validValues = [0, 1000, 1000000, 1001000];
    for (var i = 0; i < result.oneBox.results.length; i++) {
      assert.ok(
        validValues.indexOf(result.oneBox.results[i]) >= 0,
        '一箱结果 ' + result.oneBox.results[i] + ' 不在有效值中'
      );
    }
    for (var i = 0; i < result.twoBox.results.length; i++) {
      assert.ok(
        validValues.indexOf(result.twoBox.results[i]) >= 0,
        '两箱结果 ' + result.twoBox.results[i] + ' 不在有效值中'
      );
    }
  });
});

// ── calcExpectedValueCurve ──────────────────────────────

describe('calcExpectedValueCurve', function() {
  test('返回 51 个数据点 (50%~100%)', function() {
    var curve = calcExpectedValueCurve(1000, 1000000);
    assert.strictEqual(curve.length, 51);
    assert.strictEqual(curve[0].accuracyPct, 50);
    assert.strictEqual(curve[50].accuracyPct, 100);
  });

  test('50% 准确率时两箱 EV > 一箱 EV', function() {
    var curve = calcExpectedValueCurve(1000, 1000000);
    var p50 = curve[0];
    assert.ok(p50.twoBoxEV > p50.oneBoxEV, '50% 时两箱应更高');
  });

  test('100% 准确率时一箱 EV > 两箱 EV', function() {
    var curve = calcExpectedValueCurve(1000, 1000000);
    var p100 = curve[50];
    assert.strictEqual(p100.oneBoxEV, 1000000);
    assert.strictEqual(p100.twoBoxEV, 1000);
    assert.ok(p100.oneBoxEV > p100.twoBoxEV);
  });

  test('一箱 EV 单调递增', function() {
    var curve = calcExpectedValueCurve(1000, 1000000);
    for (var i = 1; i < curve.length; i++) {
      assert.ok(curve[i].oneBoxEV >= curve[i - 1].oneBoxEV, '一箱 EV 应单调递增');
    }
  });

  test('两箱 EV 单调递减', function() {
    var curve = calcExpectedValueCurve(1000, 1000000);
    for (var i = 1; i < curve.length; i++) {
      assert.ok(curve[i].twoBoxEV <= curve[i - 1].twoBoxEV, '两箱 EV 应单调递减');
    }
  });
});

// ── findCrossoverAccuracy ───────────────────────────────

describe('findCrossoverAccuracy', function() {
  test('默认参数交叉点约 50.05%', function() {
    var c = findCrossoverAccuracy(1000, 1000000);
    assert.ok(c > 0.5 && c < 0.51, '交叉点应约 50.05%，实际 ' + c);
  });

  test('A=0 时交叉点恰好 50%', function() {
    var c = findCrossoverAccuracy(0, 1000000);
    assert.strictEqual(c, 0.5);
  });

  test('A=B 时交叉点 100%', function() {
    var c = findCrossoverAccuracy(1000, 1000);
    assert.strictEqual(c, 1);
  });

  test('交叉点公式正确: (A+B)/(2B)', function() {
    var a = 5000;
    var b = 500000;
    var expected = (a + b) / (2 * b);
    assert.strictEqual(findCrossoverAccuracy(a, b), expected);
  });
});

// ── getPayoffMatrix ─────────────────────────────────────

describe('getPayoffMatrix', function() {
  test('四种组合金额正确', function() {
    var m = getPayoffMatrix(1000, 1000000);
    assert.strictEqual(m.oneOne.total, 1000000);
    assert.strictEqual(m.oneTow.total, 1001000);
    assert.strictEqual(m.twoOne.total, 0);
    assert.strictEqual(m.twoTwo.total, 1000);
  });

  test('自定义金额', function() {
    var m = getPayoffMatrix(500, 500000);
    assert.strictEqual(m.oneOne.total, 500000);
    assert.strictEqual(m.oneTow.total, 500500);
    assert.strictEqual(m.twoOne.total, 0);
    assert.strictEqual(m.twoTwo.total, 500);
  });
});

// ── formatMoney ─────────────────────────────────────────

describe('formatMoney', function() {
  test('小于 1 万直接显示', function() {
    assert.strictEqual(formatMoney(1000), '1,000');
  });

  test('整万显示', function() {
    assert.strictEqual(formatMoney(1000000), '100 万');
  });

  test('非整万显示一位小数', function() {
    assert.strictEqual(formatMoney(1001000), '100.1 万');
  });

  test('0 显示为 0', function() {
    assert.strictEqual(formatMoney(0), '0');
  });
});

// ── getCumulativeData ───────────────────────────────────

describe('getCumulativeData', function() {
  test('累计值正确', function() {
    var data = getCumulativeData([100, 200, 300], 1);
    assert.strictEqual(data.length, 3);
    assert.strictEqual(data[0].cumulative, 100);
    assert.strictEqual(data[1].cumulative, 300);
    assert.strictEqual(data[2].cumulative, 600);
  });

  test('采样率生效', function() {
    var results = [];
    for (var i = 0; i < 100; i++) results.push(1000);
    var data = getCumulativeData(results, 10);
    assert.ok(data.length <= 12, '采样后数据点应减少，实际 ' + data.length);
    assert.strictEqual(data[data.length - 1].cumulative, 100000);
  });

  test('空数组返回空', function() {
    var data = getCumulativeData([]);
    assert.strictEqual(data.length, 0);
  });

  test('最后一个点始终包含', function() {
    var results = [1, 2, 3, 4, 5];
    var data = getCumulativeData(results, 3);
    assert.strictEqual(data[data.length - 1].cumulative, 15);
    assert.strictEqual(data[data.length - 1].round, 5);
  });
});
