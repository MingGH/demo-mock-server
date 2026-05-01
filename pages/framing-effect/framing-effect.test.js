var { describe, test } = require('node:test');
var assert = require('node:assert/strict');
var {
  SCENARIOS,
  pickQuestions,
  calcFramingIndex,
  getFramingRating,
  getScenarioById,
  shuffleArray
} = require('./questions.js');

describe('题库完整性', function () {
  test('至少 10 道题', function () {
    assert.ok(SCENARIOS.length >= 10, '题库应有至少 10 道题，实际 ' + SCENARIOS.length);
  });

  test('每道题有 id/title/context/positive/negative/source/category', function () {
    for (var i = 0; i < SCENARIOS.length; i++) {
      var s = SCENARIOS[i];
      assert.ok(typeof s.id === 'number', '题目 ' + i + ' 缺少 id');
      assert.ok(typeof s.title === 'string' && s.title.length > 0, '题目 ' + i + ' 缺少 title');
      assert.ok(typeof s.context === 'string' && s.context.length > 0, '题目 ' + i + ' 缺少 context');
      assert.ok(s.positive && typeof s.positive.optionA === 'string', '题目 ' + i + ' 缺少 positive.optionA');
      assert.ok(s.positive && typeof s.positive.optionB === 'string', '题目 ' + i + ' 缺少 positive.optionB');
      assert.ok(s.negative && typeof s.negative.optionA === 'string', '题目 ' + i + ' 缺少 negative.optionA');
      assert.ok(s.negative && typeof s.negative.optionB === 'string', '题目 ' + i + ' 缺少 negative.optionB');
      assert.ok(typeof s.source === 'string' && s.source.length > 0, '题目 ' + i + ' 缺少 source');
      assert.ok(typeof s.category === 'string' && s.category.length > 0, '题目 ' + i + ' 缺少 category');
    }
  });

  test('id 不重复', function () {
    var ids = {};
    for (var i = 0; i < SCENARIOS.length; i++) {
      var id = SCENARIOS[i].id;
      assert.ok(!ids[id], 'id ' + id + ' 重复');
      ids[id] = true;
    }
  });

  test('每道题的正面和负面版本选项数量一致', function () {
    for (var i = 0; i < SCENARIOS.length; i++) {
      var s = SCENARIOS[i];
      assert.ok(typeof s.positive.optionA === 'string', '题目 ' + s.id + ' positive.optionA 应为字符串');
      assert.ok(typeof s.positive.optionB === 'string', '题目 ' + s.id + ' positive.optionB 应为字符串');
      assert.ok(typeof s.negative.optionA === 'string', '题目 ' + s.id + ' negative.optionA 应为字符串');
      assert.ok(typeof s.negative.optionB === 'string', '题目 ' + s.id + ' negative.optionB 应为字符串');
    }
  });
});

describe('pickQuestions', function () {
  test('返回正确数量', function () {
    var questions = pickQuestions(6);
    assert.strictEqual(questions.length, 6);
  });

  test('默认 10 道', function () {
    var questions = pickQuestions();
    assert.strictEqual(questions.length, 10);
  });

  test('不能超过题库总数', function () {
    var questions = pickQuestions(SCENARIOS.length);
    assert.strictEqual(questions.length, SCENARIOS.length);
  });

  test('正面/负面框架各占一半', function () {
    var questions = pickQuestions(10);
    var posCount = 0;
    var negCount = 0;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].frame === 'positive') posCount++;
      else negCount++;
    }
    assert.strictEqual(posCount, 5, '正面框架应为 5，实际 ' + posCount);
    assert.strictEqual(negCount, 5, '负面框架应为 5，实际 ' + negCount);
  });

  test('偶数正面/负面大致平衡', function () {
    var questions = pickQuestions(6);
    var posCount = 0;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].frame === 'positive') posCount++;
    }
    assert.strictEqual(posCount, 3);
  });

  test('每道题有 frame 和 displayOptions', function () {
    var questions = pickQuestions(10);
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      assert.ok(q.frame === 'positive' || q.frame === 'negative', 'frame 应为 positive 或 negative');
      assert.ok(typeof q.optionA === 'string', 'optionA 应为字符串');
      assert.ok(typeof q.optionB === 'string', 'optionB 应为字符串');
    }
  });
});

describe('calcFramingIndex', function () {
  test('空数组返回 index = 0', function () {
    var result = calcFramingIndex([]);
    assert.strictEqual(result.framingIndex, 0);
    assert.strictEqual(result.positiveARate, 0);
    assert.strictEqual(result.negativeARate, 0);
  });

  test('全部正面选A、全部负面选B → index = 1.0', function () {
    var answers = [
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'negative', choice: 'B' },
      { frame: 'negative', choice: 'B' },
      { frame: 'negative', choice: 'B' },
      { frame: 'negative', choice: 'B' },
      { frame: 'negative', choice: 'B' }
    ];
    var result = calcFramingIndex(answers);
    assert.strictEqual(result.positiveARate, 1);
    assert.strictEqual(result.negativeARate, 0);
    assert.strictEqual(result.framingIndex, 1);
  });

  test('全部正面选B、全部负面选A → index = 1.0', function () {
    var answers = [
      { frame: 'positive', choice: 'B' },
      { frame: 'positive', choice: 'B' },
      { frame: 'positive', choice: 'B' },
      { frame: 'positive', choice: 'B' },
      { frame: 'positive', choice: 'B' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' }
    ];
    var result = calcFramingIndex(answers);
    assert.strictEqual(result.framingIndex, 1);
  });

  test('所有框架下选择一致 → index = 0', function () {
    var answers = [
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' }
    ];
    var result = calcFramingIndex(answers);
    assert.strictEqual(result.framingIndex, 0);
  });

  test('部分一致 → index 在 0 到 1 之间', function () {
    var answers = [
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'B' },
      { frame: 'positive', choice: 'B' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'B' },
      { frame: 'negative', choice: 'B' },
      { frame: 'negative', choice: 'B' }
    ];
    var result = calcFramingIndex(answers);
    assert.ok(result.positiveARate === 0.6, 'positiveARate 应为 0.6, 实际 ' + result.positiveARate);
    assert.ok(result.negativeARate === 0.4, 'negativeARate 应为 0.4, 实际 ' + result.negativeARate);
    assert.ok(result.framingIndex === 0.2, 'framingIndex 应为 0.2, 实际 ' + result.framingIndex);
    assert.strictEqual(result.positiveCount, 5);
    assert.strictEqual(result.negativeCount, 5);
  });

  test('计数正确', function () {
    var answers = [
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'A' },
      { frame: 'positive', choice: 'B' },
      { frame: 'negative', choice: 'A' },
      { frame: 'negative', choice: 'B' },
      { frame: 'negative', choice: 'B' }
    ];
    var result = calcFramingIndex(answers);
    assert.strictEqual(result.positiveCount, 3);
    assert.strictEqual(result.negativeCount, 3);
    assert.strictEqual(result.positiveA, 2);
    assert.strictEqual(result.negativeA, 1);
  });

  test('null 输入返回 index = 0', function () {
    var result = calcFramingIndex(null);
    assert.strictEqual(result.framingIndex, 0);
  });
});

describe('getFramingRating', function () {
  test('覆盖所有区间', function () {
    assert.strictEqual(getFramingRating(0).level, 'rational');
    assert.strictEqual(getFramingRating(0.05).level, 'rational');
    assert.strictEqual(getFramingRating(0.1).level, 'rational');
    assert.strictEqual(getFramingRating(0.15).level, 'mild');
    assert.strictEqual(getFramingRating(0.3).level, 'mild');
    assert.strictEqual(getFramingRating(0.35).level, 'moderate');
    assert.strictEqual(getFramingRating(0.5).level, 'moderate');
    assert.strictEqual(getFramingRating(0.55).level, 'strong');
    assert.strictEqual(getFramingRating(0.7).level, 'strong');
    assert.strictEqual(getFramingRating(0.75).level, 'extreme');
    assert.strictEqual(getFramingRating(1.0).level, 'extreme');
  });

  test('返回对象包含 level/label/color/desc', function () {
    var rating = getFramingRating(0.2);
    assert.ok(typeof rating.level === 'string', '缺少 level');
    assert.ok(typeof rating.label === 'string', '缺少 label');
    assert.ok(typeof rating.color === 'string', '缺少 color');
    assert.ok(typeof rating.desc === 'string', '缺少 desc');
  });
});

describe('getScenarioById', function () {
  test('能找到存在的题目', function () {
    var s = getScenarioById(1);
    assert.ok(s !== null, '应找到 id=1 的题目');
    assert.strictEqual(s.title, '亚洲疾病问题');
  });

  test('不存在的 id 返回 null', function () {
    assert.strictEqual(getScenarioById(999), null);
  });
});

describe('shuffleArray', function () {
  test('不改变原数组长度', function () {
    var arr = [1, 2, 3, 4, 5];
    var result = shuffleArray(arr);
    assert.strictEqual(result.length, arr.length);
  });

  test('包含所有原元素', function () {
    var arr = [1, 2, 3, 4, 5];
    var result = shuffleArray(arr);
    result.sort(function(a, b) { return a - b; });
    assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
  });

  test('不修改原数组', function () {
    var arr = [1, 2, 3, 4, 5];
    var copy = arr.slice();
    shuffleArray(arr);
    assert.deepStrictEqual(arr, copy);
  });
});
