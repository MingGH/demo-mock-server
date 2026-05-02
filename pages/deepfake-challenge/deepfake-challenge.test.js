var { describe, test } = require('node:test');
var assert = require('node:assert/strict');
var {
  IMAGES,
  pickTrials,
  calcSDT,
  getSDTRating,
  zScore,
  shuffleArr,
  REFERENCE_DATA
} = require('./data.js');

describe('图片库完整性', function() {
  test('至少 12 张图片', function() {
    assert.ok(IMAGES.length >= 12, '图片库应有至少 12 张，实际 ' + IMAGES.length);
  });

  test('真假各半', function() {
    var realCount = 0;
    var fakeCount = 0;
    for (var i = 0; i < IMAGES.length; i++) {
      if (IMAGES[i].isReal) realCount++;
      else fakeCount++;
    }
    assert.strictEqual(realCount, fakeCount, '真假图片数量应相等');
  });

  test('每张图片有 id/src/isReal/desc', function() {
    for (var i = 0; i < IMAGES.length; i++) {
      var img = IMAGES[i];
      assert.ok(typeof img.id === 'string' && img.id.length > 0, '图片 ' + i + ' 缺少 id');
      assert.ok(typeof img.src === 'string' && img.src.length > 0, '图片 ' + i + ' 缺少 src');
      assert.ok(typeof img.isReal === 'boolean', '图片 ' + i + ' 缺少 isReal');
      assert.ok(typeof img.desc === 'string', '图片 ' + i + ' 缺少 desc');
    }
  });

  test('id 不重复', function() {
    var ids = {};
    for (var i = 0; i < IMAGES.length; i++) {
      assert.ok(!ids[IMAGES[i].id], 'id ' + IMAGES[i].id + ' 重复');
      ids[IMAGES[i].id] = true;
    }
  });
});

describe('pickTrials', function() {
  test('默认返回 12 张', function() {
    var trials = pickTrials();
    assert.strictEqual(trials.length, 12);
  });

  test('返回指定数量', function() {
    var trials = pickTrials(6);
    assert.strictEqual(trials.length, 6);
  });

  test('真假各半', function() {
    var trials = pickTrials(12);
    var realCount = 0;
    for (var i = 0; i < trials.length; i++) {
      if (trials[i].isReal) realCount++;
    }
    assert.strictEqual(realCount, 6, '12 张中应有 6 张真人');
  });

  test('偶数时真假各半', function() {
    var trials = pickTrials(8);
    var realCount = 0;
    for (var i = 0; i < trials.length; i++) {
      if (trials[i].isReal) realCount++;
    }
    assert.strictEqual(realCount, 4);
  });

  test('包含所有必要字段', function() {
    var trials = pickTrials(6);
    for (var i = 0; i < trials.length; i++) {
      assert.ok(trials[i].id, '缺少 id');
      assert.ok(trials[i].src, '缺少 src');
      assert.ok(typeof trials[i].isReal === 'boolean', '缺少 isReal');
    }
  });
});

describe('calcSDT', function() {
  test('空数组返回零值', function() {
    var result = calcSDT([]);
    assert.strictEqual(result.accuracy, 0);
    assert.strictEqual(result.dPrime, 0);
  });

  test('null 输入返回零值', function() {
    var result = calcSDT(null);
    assert.strictEqual(result.accuracy, 0);
  });

  test('全部正确 → 高 d\'', function() {
    var answers = [
      { isReal: true,  userSaidReal: true },
      { isReal: true,  userSaidReal: true },
      { isReal: true,  userSaidReal: true },
      { isReal: false, userSaidReal: false },
      { isReal: false, userSaidReal: false },
      { isReal: false, userSaidReal: false }
    ];
    var result = calcSDT(answers);
    assert.strictEqual(result.accuracy, 1);
    assert.strictEqual(result.hit, 3);
    assert.strictEqual(result.cr, 3);
    assert.strictEqual(result.miss, 0);
    assert.strictEqual(result.fa, 0);
    assert.ok(result.dPrime > 2, 'd\' 应大于 2，实际 ' + result.dPrime);
  });

  test('全部错误 → 负 d\'', function() {
    var answers = [
      { isReal: true,  userSaidReal: false },
      { isReal: true,  userSaidReal: false },
      { isReal: true,  userSaidReal: false },
      { isReal: false, userSaidReal: true },
      { isReal: false, userSaidReal: true },
      { isReal: false, userSaidReal: true }
    ];
    var result = calcSDT(answers);
    assert.strictEqual(result.accuracy, 0);
    assert.ok(result.dPrime < -2, 'd\' 应小于 -2，实际 ' + result.dPrime);
  });

  test('随机猜测 → d\' 接近 0', function() {
    // 一半对一半错，均匀分布
    var answers = [
      { isReal: true,  userSaidReal: true },
      { isReal: true,  userSaidReal: false },
      { isReal: true,  userSaidReal: true },
      { isReal: true,  userSaidReal: false },
      { isReal: false, userSaidReal: true },
      { isReal: false, userSaidReal: false },
      { isReal: false, userSaidReal: true },
      { isReal: false, userSaidReal: false }
    ];
    var result = calcSDT(answers);
    assert.ok(Math.abs(result.dPrime) < 1, 'd\' 应接近 0，实际 ' + result.dPrime);
  });

  test('四格表计数正确', function() {
    var answers = [
      { isReal: true,  userSaidReal: true },   // hit
      { isReal: true,  userSaidReal: false },  // miss
      { isReal: false, userSaidReal: true },   // fa
      { isReal: false, userSaidReal: false },  // cr
      { isReal: true,  userSaidReal: true },   // hit
      { isReal: false, userSaidReal: false }   // cr
    ];
    var result = calcSDT(answers);
    assert.strictEqual(result.hit, 2);
    assert.strictEqual(result.miss, 1);
    assert.strictEqual(result.fa, 1);
    assert.strictEqual(result.cr, 2);
    assert.strictEqual(result.total, 6);
  });

  test('全部说真人 → 高虚报率', function() {
    var answers = [
      { isReal: true,  userSaidReal: true },
      { isReal: true,  userSaidReal: true },
      { isReal: true,  userSaidReal: true },
      { isReal: false, userSaidReal: true },
      { isReal: false, userSaidReal: true },
      { isReal: false, userSaidReal: true }
    ];
    var result = calcSDT(answers);
    assert.strictEqual(result.hit, 3);
    assert.strictEqual(result.fa, 3);
    assert.strictEqual(result.miss, 0);
    assert.strictEqual(result.cr, 0);
    // d' 应接近 0（有辨别力但全猜一边）
    assert.ok(Math.abs(result.dPrime) < 0.5, '全猜真人 d\' 应接近 0');
    // criterion 应为负（宽松偏好）
    assert.ok(result.criterion < 0, 'criterion 应为负');
  });
});

describe('getSDTRating', function() {
  test('覆盖所有区间', function() {
    assert.strictEqual(getSDTRating(3).level, 'expert');
    assert.strictEqual(getSDTRating(2.5).level, 'expert');
    assert.strictEqual(getSDTRating(2).level, 'good');
    assert.strictEqual(getSDTRating(1.5).level, 'good');
    assert.strictEqual(getSDTRating(1).level, 'average');
    assert.strictEqual(getSDTRating(0.5).level, 'average');
    assert.strictEqual(getSDTRating(0.2).level, 'poor');
    assert.strictEqual(getSDTRating(0).level, 'poor');
    assert.strictEqual(getSDTRating(-0.5).level, 'inverted');
    assert.strictEqual(getSDTRating(-1).level, 'inverted');
  });

  test('返回对象包含 level/label/color/desc', function() {
    var rating = getSDTRating(1.0);
    assert.ok(typeof rating.level === 'string');
    assert.ok(typeof rating.label === 'string');
    assert.ok(typeof rating.color === 'string');
    assert.ok(typeof rating.desc === 'string');
  });
});

describe('zScore', function() {
  test('p=0.5 → z≈0', function() {
    assert.ok(Math.abs(zScore(0.5)) < 0.01, 'z(0.5) 应接近 0，实际 ' + zScore(0.5));
  });

  test('p=0.8413 → z≈1', function() {
    var z = zScore(0.8413);
    assert.ok(Math.abs(z - 1) < 0.05, 'z(0.8413) 应接近 1，实际 ' + z);
  });

  test('p=0.1587 → z≈-1', function() {
    var z = zScore(0.1587);
    assert.ok(Math.abs(z + 1) < 0.05, 'z(0.1587) 应接近 -1，实际 ' + z);
  });

  test('p=0.975 → z≈1.96', function() {
    var z = zScore(0.975);
    assert.ok(Math.abs(z - 1.96) < 0.05, 'z(0.975) 应接近 1.96，实际 ' + z);
  });

  test('极端值不崩溃', function() {
    assert.strictEqual(zScore(0), -4);
    assert.strictEqual(zScore(1), 4);
    assert.ok(isFinite(zScore(0.001)));
    assert.ok(isFinite(zScore(0.999)));
  });
});

describe('shuffleArr', function() {
  test('不改变长度', function() {
    var arr = [1, 2, 3, 4, 5];
    assert.strictEqual(shuffleArr(arr).length, 5);
  });

  test('包含所有原元素', function() {
    var arr = [1, 2, 3, 4, 5];
    var result = shuffleArr(arr).sort(function(a, b) { return a - b; });
    assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
  });

  test('不修改原数组', function() {
    var arr = [1, 2, 3];
    var copy = arr.slice();
    shuffleArr(arr);
    assert.deepStrictEqual(arr, copy);
  });
});

describe('REFERENCE_DATA', function() {
  test('包含所有参考数据', function() {
    assert.ok(typeof REFERENCE_DATA.humanAccuracy === 'number');
    assert.ok(typeof REFERENCE_DATA.humanAccuracySource === 'string');
    assert.ok(typeof REFERENCE_DATA.aiLabAccuracy === 'number');
    assert.ok(typeof REFERENCE_DATA.aiRealWorldAccuracy === 'number');
    assert.ok(typeof REFERENCE_DATA.fraudIncidents === 'number');
    assert.ok(typeof REFERENCE_DATA.financialLoss === 'number');
  });

  test('数值在合理范围', function() {
    assert.ok(REFERENCE_DATA.humanAccuracy > 0 && REFERENCE_DATA.humanAccuracy < 1);
    assert.ok(REFERENCE_DATA.aiLabAccuracy > 0.5);
    assert.ok(REFERENCE_DATA.aiRealWorldAccuracy > 0 && REFERENCE_DATA.aiRealWorldAccuracy < 1);
  });
});
