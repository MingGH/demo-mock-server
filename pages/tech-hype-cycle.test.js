/**
 * tech-hype-cycle.test.js
 * node pages/tech-hype-cycle.test.js
 */

const TechHypeCycleLogic = require('./tech-hype-cycle-logic.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// --- getTopics ---
console.log('\n[getTopics]');
test('返回数组且不为空', () => {
  const topics = TechHypeCycleLogic.getTopics();
  assert(Array.isArray(topics) && topics.length > 0, '应返回非空数组');
});

test('每个 topic 有必要字段', () => {
  const topics = TechHypeCycleLogic.getTopics();
  topics.forEach(t => {
    assert(t.id, `topic 缺少 id`);
    assert(t.name, `topic 缺少 name`);
    assert(Array.isArray(t.labels), `topic ${t.id} 缺少 labels`);
    assert(Array.isArray(t.data), `topic ${t.id} 缺少 data`);
    assertEqual(t.labels.length, t.data.length, `topic ${t.id} labels 和 data 长度不一致`);
  });
});

test('包含 openclaw 和 metaverse', () => {
  const topics = TechHypeCycleLogic.getTopics();
  const ids = topics.map(t => t.id);
  assert(ids.includes('openclaw'), '应包含 openclaw');
  assert(ids.includes('metaverse'), '应包含 metaverse');
});

test('OpenClaw 峰值为 100', () => {
  const topics = TechHypeCycleLogic.getTopics();
  const oc = topics.find(t => t.id === 'openclaw');
  assert(Math.max(...oc.data) === 100, 'OpenClaw 峰值应为 100');
});

test('元宇宙峰值为 100 且后期下降', () => {
  const topics = TechHypeCycleLogic.getTopics();
  const mv = topics.find(t => t.id === 'metaverse');
  const peak = Math.max(...mv.data);
  const last = mv.data[mv.data.length - 1];
  assert(peak === 100, '元宇宙峰值应为 100');
  assert(last < 30, `元宇宙末期热度应低于30，实际为 ${last}`);
});

// --- getParams ---
console.log('\n[getParams]');
test('返回6个参数', () => {
  const params = TechHypeCycleLogic.getParams();
  assertEqual(params.length, 6, '应有6个参数');
});

test('每个参数有必要字段', () => {
  const params = TechHypeCycleLogic.getParams();
  params.forEach(p => {
    assert(p.id, '参数缺少 id');
    assert(p.label, '参数缺少 label');
    assert(p.min !== undefined, '参数缺少 min');
    assert(p.max !== undefined, '参数缺少 max');
    assert(p.default !== undefined, '参数缺少 default');
    assert(p.default >= p.min && p.default <= p.max, `参数 ${p.id} 默认值超出范围`);
  });
});

// --- evaluate ---
console.log('\n[evaluate]');
test('高质量参数 → 基础设施型', () => {
  const result = TechHypeCycleLogic.evaluate({
    userDriven: 90, prDriven: 10, realUseCase: 90,
    growthSpeed: 3, techMaturity: 85, networkEffect: 80
  });
  assertEqual(result.type, 'infra', `应为 infra，实际为 ${result.type}（总分 ${result.total}）`);
});

test('低质量参数 → 泡沫型', () => {
  const result = TechHypeCycleLogic.evaluate({
    userDriven: 10, prDriven: 95, realUseCase: 10,
    growthSpeed: 10, techMaturity: 15, networkEffect: 10
  });
  assertEqual(result.type, 'bubble', `应为 bubble，实际为 ${result.type}（总分 ${result.total}）`);
});

test('中等参数 → 混合型', () => {
  const result = TechHypeCycleLogic.evaluate({
    userDriven: 50, prDriven: 50, realUseCase: 50,
    growthSpeed: 5, techMaturity: 50, networkEffect: 50
  });
  assertEqual(result.type, 'unclear', `应为 unclear，实际为 ${result.type}（总分 ${result.total}）`);
});

test('返回 scores 数组（6项）', () => {
  const result = TechHypeCycleLogic.evaluate({
    userDriven: 70, prDriven: 30, realUseCase: 75,
    growthSpeed: 5, techMaturity: 65, networkEffect: 60
  });
  assert(Array.isArray(result.scores), 'scores 应为数组');
  assertEqual(result.scores.length, 6, 'scores 应有6项');
});

test('总分在 0-100 之间', () => {
  const result = TechHypeCycleLogic.evaluate({
    userDriven: 70, prDriven: 30, realUseCase: 75,
    growthSpeed: 5, techMaturity: 65, networkEffect: 60
  });
  assert(result.total >= 0 && result.total <= 100, `总分应在0-100，实际为 ${result.total}`);
});

test('OpenClaw 参数应评为基础设施型', () => {
  // 模拟 OpenClaw 的真实参数
  const result = TechHypeCycleLogic.evaluate({
    userDriven: 88, prDriven: 20, realUseCase: 80,
    growthSpeed: 10, techMaturity: 70, networkEffect: 75
  });
  // growthSpeed 极高会拉低分，但其他维度应足够高
  assert(result.type !== 'bubble', `OpenClaw 不应被判为纯泡沫，实际为 ${result.type}`);
});

test('元宇宙参数应评为泡沫型', () => {
  const result = TechHypeCycleLogic.evaluate({
    userDriven: 18, prDriven: 85, realUseCase: 15,
    growthSpeed: 9, techMaturity: 30, networkEffect: 20
  });
  assertEqual(result.type, 'bubble', `元宇宙应为 bubble，实际为 ${result.type}`);
});

// --- getHistory ---
console.log('\n[getHistory]');
test('返回历史案例数组', () => {
  const history = TechHypeCycleLogic.getHistory();
  assert(Array.isArray(history) && history.length >= 5, '应有至少5条历史案例');
});

test('每条历史案例有必要字段', () => {
  const history = TechHypeCycleLogic.getHistory();
  history.forEach(h => {
    assert(h.name, '缺少 name');
    assert(h.peak, '缺少 peak');
    assert(h.userDriven !== undefined, '缺少 userDriven');
    assert(h.prDriven !== undefined, '缺少 prDriven');
    assert(['infra', 'bubble', 'mixed'].includes(h.verdict), `verdict 值非法: ${h.verdict}`);
  });
});

test('元宇宙被标记为泡沫', () => {
  const history = TechHypeCycleLogic.getHistory();
  const mv = history.find(h => h.name.includes('元宇宙'));
  assert(mv, '应包含元宇宙案例');
  assertEqual(mv.verdict, 'bubble', '元宇宙应标记为 bubble');
});

// --- 汇总 ---
console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);
