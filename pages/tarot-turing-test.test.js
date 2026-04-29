const {
  ROLE_TYPES,
  SLOT_LABELS,
  SPREADS,
  createSession,
  evaluateSelections,
  getSlotByRole,
  normalizeStats
} = require('./tarot-turing-test/engine.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + message);
  } else {
    failed++;
    console.error('  ✗ ' + message);
  }
}

console.log('\n塔罗图灵测试 - 核心逻辑测试\n');

console.log('--- 基础数据 ---');
assert(Array.isArray(SPREADS) && SPREADS.length >= 5, '至少有 5 组牌阵');
assert(SLOT_LABELS.join(',') === 'A,B,C', '固定使用 A/B/C 三个槽位');
assert(Object.keys(ROLE_TYPES).length === 3, '三种身份类型齐全');

console.log('--- 会话生成 ---');
const session1 = createSession('seed-fixed-1');
const session2 = createSession('seed-fixed-1');
assert(session1.spread.id === session2.spread.id, '相同 seed 生成相同牌阵');
assert(JSON.stringify(session1.slotRoleMap) === JSON.stringify(session2.slotRoleMap), '相同 seed 身份映射一致');
assert(session1.slots.length === 3, '每次生成三位塔罗师');

const roles = session1.slots.map(function (item) { return item.role; }).sort().join(',');
assert(roles === 'ai,human,template', '三种身份各出现一次');
assert(session1.slots.every(function (item) {
  return Array.isArray(item.reading) && item.reading.length >= 4;
}), '每位塔罗师都有多段解读');

console.log('--- 结果判定 ---');
const aiSlot = getSlotByRole(session1, ROLE_TYPES.AI);
const humanSlot = getSlotByRole(session1, ROLE_TYPES.HUMAN);
const templateSlot = getSlotByRole(session1, ROLE_TYPES.TEMPLATE);

const result1 = evaluateSelections(session1, aiSlot, aiSlot);
assert(result1.bestWasAi === true, '选择 AI 槽位时 bestWasAi 为真');
assert(result1.guessedAiCorrect === true, '猜中 AI 时 guessedAiCorrect 为真');

const result2 = evaluateSelections(session1, humanSlot, templateSlot);
assert(result2.bestWasHuman === true, '选择真人风格槽位时 bestWasHuman 为真');
assert(result2.guessedAiCorrect === false, '猜错 AI 时 guessedAiCorrect 为假');
assert(result2.actualAiSlot === aiSlot, '能返回真实 AI 槽位');

console.log('--- 统计归一化 ---');
const stats = normalizeStats({
  totalSessions: 10,
  guessAiAccuracyPct: 33.3,
  bestRoleCounts: { template: 2, human: 3, ai: 5 },
  guessedAiRoleCounts: { template: 4, human: 1, ai: 5 }
});

assert(stats.bestRoleRates.ai === 50, '被选最准比例能正确换算');
assert(stats.guessedAiRoleRates.template === 40, '被猜成 AI 比例能正确换算');
assert(stats.mostTrustedRole === ROLE_TYPES.AI, '能找出最受信任身份');
assert(stats.mostSuspectedAsAiRole === ROLE_TYPES.AI, '能找出最常被怀疑的身份');

console.log('--- 空统计 ---');
const emptyStats = normalizeStats({});
assert(emptyStats.totalSessions === 0, '空统计总数为 0');
assert(emptyStats.bestRoleRates.template === 0, '空统计比例默认为 0');

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败\n');
process.exit(failed > 0 ? 1 : 0);
