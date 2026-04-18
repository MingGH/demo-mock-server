/**
 * anchoring-effect.test.js — 锚定效应核心逻辑测试
 * 运行：node pages/anchoring-effect/anchoring-effect.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  QUESTIONS,
  generateAnchor,
  pickQuestions,
  calcAnchoringIndex,
  calcAverageAI,
  calcErrorPercent,
  getAIRating
} = require('./questions.js');

// ── 题库完整性 ──

describe('题库', function () {

  test('至少有 10 道题', function () {
    assert.ok(QUESTIONS.length >= 10, `题库只有 ${QUESTIONS.length} 道题`);
  });

  test('每道题都有必要字段', function () {
    const requiredFields = ['id', 'text', 'unit', 'answer', 'min', 'max', 'source', 'category'];
    QUESTIONS.forEach(q => {
      requiredFields.forEach(field => {
        assert.ok(q[field] !== undefined && q[field] !== null,
          `题目 ${q.id} 缺少字段 ${field}`);
      });
    });
  });

  test('answer 在 min/max 范围内', function () {
    QUESTIONS.forEach(q => {
      assert.ok(q.answer >= q.min && q.answer <= q.max,
        `题目 ${q.id}: answer=${q.answer} 不在 [${q.min}, ${q.max}] 范围内`);
    });
  });

  test('id 不重复', function () {
    const ids = QUESTIONS.map(q => q.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, '存在重复 id');
  });
});

// ── 锚点生成 ──

describe('generateAnchor', function () {

  test('低锚应小于真实值', function () {
    for (let i = 0; i < 50; i++) {
      const anchor = generateAnchor(1000, 'low');
      assert.ok(anchor < 1000, `低锚 ${anchor} 不小于 1000`);
      assert.ok(anchor >= 200, `低锚 ${anchor} 低于预期下限 200`);
    }
  });

  test('高锚应大于真实值', function () {
    for (let i = 0; i < 50; i++) {
      const anchor = generateAnchor(1000, 'high');
      assert.ok(anchor > 1000, `高锚 ${anchor} 不大于 1000`);
      assert.ok(anchor <= 3000, `高锚 ${anchor} 超过预期上限 3000`);
    }
  });

  test('锚点应为整数', function () {
    for (let i = 0; i < 20; i++) {
      const low = generateAnchor(8849, 'low');
      const high = generateAnchor(8849, 'high');
      assert.ok(Number.isInteger(low), `低锚 ${low} 不是整数`);
      assert.ok(Number.isInteger(high), `高锚 ${high} 不是整数`);
    }
  });
});

// ── 抽题 ──

describe('pickQuestions', function () {

  test('返回指定数量的题目', function () {
    const picked = pickQuestions(5);
    assert.equal(picked.length, 5);
  });

  test('不超过题库总量', function () {
    const picked = pickQuestions(100);
    assert.equal(picked.length, QUESTIONS.length);
  });

  test('每道题都有 anchor 和 anchorType', function () {
    const picked = pickQuestions(10);
    picked.forEach(q => {
      assert.ok(typeof q.anchor === 'number', `题目 ${q.id} 缺少 anchor`);
      assert.ok(q.anchorType === 'high' || q.anchorType === 'low',
        `题目 ${q.id} anchorType 无效: ${q.anchorType}`);
    });
  });

  test('高低锚分配大致均匀（100次采样）', function () {
    let highCount = 0;
    let lowCount = 0;
    for (let i = 0; i < 100; i++) {
      const picked = pickQuestions(10);
      picked.forEach(q => {
        if (q.anchorType === 'high') highCount++;
        else lowCount++;
      });
    }
    // 1000 次中，高低各应在 350-650 之间
    assert.ok(highCount > 300 && highCount < 700,
      `高锚分配不均匀: ${highCount}/1000`);
  });
});

// ── 锚定系数计算 ──

describe('calcAnchoringIndex', function () {

  test('用户回答等于真实值时，AI = 0', function () {
    const ai = calcAnchoringIndex(100, 100, 200);
    assert.equal(ai, 0);
  });

  test('用户回答等于锚点时，AI = 1', function () {
    const ai = calcAnchoringIndex(200, 100, 200);
    assert.equal(ai, 1);
  });

  test('用户回答在真实值和锚点之间，0 < AI < 1', function () {
    const ai = calcAnchoringIndex(150, 100, 200);
    assert.equal(ai, 0.5);
  });

  test('用户回答偏离锚点方向，AI < 0', function () {
    // 锚点在高处(200)，用户回答比真实值还低(50)
    const ai = calcAnchoringIndex(50, 100, 200);
    assert.equal(ai, -0.5);
  });

  test('过度锚定，AI > 1', function () {
    // 锚点200，真实值100，用户回答250（超过锚点）
    const ai = calcAnchoringIndex(250, 100, 200);
    assert.equal(ai, 1.5);
  });

  test('锚点等于真实值时返回 0', function () {
    const ai = calcAnchoringIndex(150, 100, 100);
    assert.equal(ai, 0);
  });
});

// ── 平均锚定系数 ──

describe('calcAverageAI', function () {

  test('空数组返回 0', function () {
    assert.equal(calcAverageAI([]), 0);
  });

  test('正确计算平均值', function () {
    const results = [
      { userAnswer: 150, trueAnswer: 100, anchor: 200 }, // AI = 0.5
      { userAnswer: 100, trueAnswer: 100, anchor: 200 }, // AI = 0
    ];
    const avg = calcAverageAI(results);
    assert.ok(Math.abs(avg - 0.25) < 0.001, `期望 0.25，得到 ${avg}`);
  });
});

// ── 误差百分比 ──

describe('calcErrorPercent', function () {

  test('完全正确时误差为 0', function () {
    assert.equal(calcErrorPercent(100, 100), 0);
  });

  test('高估 50% 时误差为 +50', function () {
    assert.equal(calcErrorPercent(150, 100), 50);
  });

  test('低估 50% 时误差为 -50', function () {
    assert.equal(calcErrorPercent(50, 100), -50);
  });

  test('真实值为 0 时返回 0', function () {
    assert.equal(calcErrorPercent(50, 0), 0);
  });
});

// ── 评级 ──

describe('getAIRating', function () {

  test('AI ≈ 0 应为免疫', function () {
    assert.equal(getAIRating(0.05).level, 'immune');
  });

  test('AI ≈ 0.2 应为轻度', function () {
    assert.equal(getAIRating(0.2).level, 'resistant');
  });

  test('AI ≈ 0.4 应为中度', function () {
    assert.equal(getAIRating(0.4).level, 'moderate');
  });

  test('AI ≈ 0.7 应为强', function () {
    assert.equal(getAIRating(0.7).level, 'strong');
  });

  test('AI ≈ 1.0 应为极强', function () {
    assert.equal(getAIRating(1.0).level, 'extreme');
  });

  test('负值取绝对值评级', function () {
    assert.equal(getAIRating(-0.05).level, 'immune');
    assert.equal(getAIRating(-0.9).level, 'extreme');
  });

  test('返回对象包含必要字段', function () {
    const rating = getAIRating(0.5);
    assert.ok(rating.level);
    assert.ok(rating.label);
    assert.ok(rating.color);
    assert.ok(rating.desc);
  });
});

console.log('所有测试通过 ✓');
