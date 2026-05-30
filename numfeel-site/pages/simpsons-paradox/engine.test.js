/**
 * 辛普森悖论引擎 — 单元测试
 * 运行：node pages/simpsons-paradox/engine.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  DEPARTMENTS,
  deptRate,
  allDeptRates,
  overallRates,
  countFemaleAdvantage,
  simulateEqualDistribution,
  analyzeCustomData,
  monteCarloParadox,
} = require('./engine.js');

// ── 数据完整性 ──

describe('DEPARTMENTS 数据', function () {

  test('有 6 个系', function () {
    assert.equal(DEPARTMENTS.length, 6);
  });

  test('系 ID 为 A–F', function () {
    const ids = DEPARTMENTS.map(d => d.id);
    assert.deepEqual(ids, ['A', 'B', 'C', 'D', 'E', 'F']);
  });

  test('所有字段为正整数', function () {
    DEPARTMENTS.forEach(d => {
      ['maleApply', 'maleAdmit', 'femaleApply', 'femaleAdmit'].forEach(key => {
        assert.ok(Number.isInteger(d[key]) && d[key] > 0,
          `系 ${d.id} 的 ${key} 应为正整数，实际为 ${d[key]}`);
      });
    });
  });

  test('录取人数不超过申请人数', function () {
    DEPARTMENTS.forEach(d => {
      assert.ok(d.maleAdmit <= d.maleApply,
        `系 ${d.id}: 男生录取 ${d.maleAdmit} > 申请 ${d.maleApply}`);
      assert.ok(d.femaleAdmit <= d.femaleApply,
        `系 ${d.id}: 女生录取 ${d.femaleAdmit} > 申请 ${d.femaleApply}`);
    });
  });

  test('总男生申请约 2691（论文数据）', function () {
    const total = DEPARTMENTS.reduce((s, d) => s + d.maleApply, 0);
    assert.equal(total, 2691);
  });

  test('总女生申请约 1835（论文数据）', function () {
    const total = DEPARTMENTS.reduce((s, d) => s + d.femaleApply, 0);
    assert.equal(total, 1835);
  });
});

// ── deptRate ──

describe('deptRate', function () {

  test('系 A 男生录取率约 62%', function () {
    const r = deptRate(DEPARTMENTS[0]);
    assert.ok(Math.abs(r.maleRate - 512 / 825) < 0.001);
  });

  test('系 A 女生录取率约 82%', function () {
    const r = deptRate(DEPARTMENTS[0]);
    assert.ok(Math.abs(r.femaleRate - 89 / 108) < 0.001);
  });

  test('diff 正数表示女生更高', function () {
    const r = deptRate(DEPARTMENTS[0]);
    assert.ok(r.diff > 0, '系 A 女生录取率应高于男生');
  });
});

// ── overallRates ──

describe('overallRates', function () {

  test('男生整体录取率约 44%', function () {
    const o = overallRates();
    assert.ok(o.maleRate > 0.43 && o.maleRate < 0.46,
      `男生录取率 ${o.maleRate} 不在预期范围`);
  });

  test('女生整体录取率约 35%', function () {
    const o = overallRates();
    assert.ok(o.femaleRate > 0.30 && o.femaleRate < 0.36,
      `女生录取率 ${o.femaleRate} 不在预期范围`);
  });

  test('男生整体录取率高于女生（悖论的表象）', function () {
    const o = overallRates();
    assert.ok(o.maleRate > o.femaleRate);
  });

  test('差距约 14 个百分点（6 个最大系的子集）', function () {
    const o = overallRates();
    const gap = (o.maleRate - o.femaleRate) * 100;
    assert.ok(gap > 12 && gap < 16, `差距 ${gap.toFixed(1)} 不在预期范围`);
  });
});

// ── countFemaleAdvantage ──

describe('countFemaleAdvantage', function () {

  test('至少 4 个系女生录取率更高', function () {
    const adv = countFemaleAdvantage();
    assert.ok(adv.advantage >= 4,
      `只有 ${adv.advantage} 个系女生更高，预期至少 4 个`);
  });

  test('total 为 6', function () {
    const adv = countFemaleAdvantage();
    assert.equal(adv.total, 6);
  });
});

// ── simulateEqualDistribution ──

describe('simulateEqualDistribution', function () {

  test('模拟录取率高于实际录取率', function () {
    const sim = simulateEqualDistribution();
    assert.ok(sim.simulatedRate > sim.originalRate,
      `模拟 ${sim.simulatedRate} 应高于实际 ${sim.originalRate}`);
  });

  test('模拟录取率超过男生整体录取率', function () {
    const sim = simulateEqualDistribution();
    const o = overallRates();
    // 按男生分布申请后，女生录取率应超过男生（因为各系女生录取率本就更高）
    assert.ok(sim.simulatedRate > o.maleRate,
      `模拟 ${sim.simulatedRate} 应超过男生 ${o.maleRate}`);
  });
});

// ── analyzeCustomData ──

describe('analyzeCustomData', function () {

  test('空数组返回 null', function () {
    assert.equal(analyzeCustomData([]), null);
    assert.equal(analyzeCustomData(null), null);
  });

  test('单系数据正确计算', function () {
    const result = analyzeCustomData([
      { id: 'X', maleApply: 100, maleAdmit: 50, femaleApply: 100, femaleAdmit: 60 }
    ]);
    assert.ok(Math.abs(result.overallMaleRate - 0.5) < 0.001);
    assert.ok(Math.abs(result.overallFemaleRate - 0.6) < 0.001);
    assert.equal(result.femaleWins, 1);
  });

  test('检测经典辛普森悖论', function () {
    // 构造一个简单的辛普森悖论
    const result = analyzeCustomData([
      { id: 'Easy', maleApply: 800, maleAdmit: 480, femaleApply: 100, femaleAdmit: 65 },
      { id: 'Hard', maleApply: 200, maleAdmit: 20, femaleApply: 900, femaleAdmit: 99 },
    ]);
    // 女生在两个系都更高
    assert.equal(result.femaleWins, 2);
    // 但整体男生更高
    assert.ok(result.overallMaleRate > result.overallFemaleRate,
      '整体男生应更高');
    assert.ok(result.isParadox, '应检测到悖论');
  });
});

// ── monteCarloParadox ──

describe('monteCarloParadox', function () {

  test('返回正确结构', function () {
    const r = monteCarloParadox(10, 4);
    assert.ok('paradoxCount' in r);
    assert.ok('trials' in r);
    assert.ok('rate' in r);
    assert.equal(r.trials, 10);
  });

  test('悖论出现率在合理范围（0%–100%）', function () {
    const r = monteCarloParadox(100, 6);
    assert.ok(r.rate >= 0 && r.rate <= 1,
      `出现率 ${r.rate} 不在 [0, 1] 范围`);
  });

  test('paradoxCount 不超过 trials', function () {
    const r = monteCarloParadox(50, 6);
    assert.ok(r.paradoxCount <= r.trials);
  });

  test('大量模拟时悖论出现率 > 0', function () {
    const r = monteCarloParadox(500, 6);
    assert.ok(r.paradoxCount > 0,
      '500 次模拟中应至少出现一次悖论');
  });
});
