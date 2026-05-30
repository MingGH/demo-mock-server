/**
 * 宇宙收割者假说 v2 — 单元测试
 * 运行命令: node pages/cosmic-reaper/engine.test.js
 */

const {
  STRATEGIES,
  EVENTS,
  DEFAULT_CONFIG,
  createCivilization,
  getExposure,
  pickEvent,
  applyEventChoice,
  advanceTurn,
  simulate,
  monteCarloSimulate,
  computeScore,
  mulberry32,
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// ── 测试1: 策略常量 ──
console.log('\n测试1: 策略常量');
assert(Object.keys(STRATEGIES).length === 4, '4种策略');
assert(STRATEGIES.aggressive.techGain === 15, 'aggressive techGain=15');
assert(STRATEGIES.stealth.stealthAdd === 12, 'stealth stealthAdd=12');
assert(STRATEGIES.dormant.signalAdd === -12, 'dormant signalAdd=-12');

// ── 测试2: 事件库 ──
console.log('\n测试2: 事件库');
assert(EVENTS.length >= 10, `事件数量≥10 (实际${EVENTS.length})`);
const ids = EVENTS.map(e => e.id);
const uniqueIds = new Set(ids);
assert(uniqueIds.size === ids.length, '事件ID无重复');
EVENTS.forEach(e => {
  assert(e.choices.length >= 2, `事件「${e.id}」至少2个选项`);
  e.choices.forEach(c => {
    assert(c.effects && typeof c.effects.tech === 'number', `事件「${e.id}」选项有effects.tech`);
  });
});

// ── 测试3: 默认配置 v2 ──
console.log('\n测试3: 默认配置 v3');
assert(DEFAULT_CONFIG.threshold === 80, 'threshold=80');
assert(DEFAULT_CONFIG.escapeTech === 200, 'escapeTech=200');
assert(DEFAULT_CONFIG.maxTurns === 30, 'maxTurns=30');
assert(DEFAULT_CONFIG.reaperScanInterval === 3, 'reaperScanInterval=3');
assert(DEFAULT_CONFIG.eventChance === 0.4, 'eventChance=0.4');
assert(DEFAULT_CONFIG.scanDuration === 6, 'scanDuration=6');

// ── 测试4: 创建文明 ──
console.log('\n测试4: 创建文明');
const civ0 = createCivilization();
assert(civ0.tech === 10, '初始tech=10');
assert(civ0.signal === 5, '初始signal=5');
assert(civ0.stealth === 8, '初始stealth=8');
assert(civ0.turn === 0, 'turn=0');
assert(civ0.alive === true, 'alive');
assert(civ0.escaped === false, 'not escaped');
assert(Array.isArray(civ0.usedEvents), 'usedEvents是数组');
assert(civ0.usedEvents.length === 0, 'usedEvents初始为空');

// ── 测试5: 暴露度 ──
console.log('\n测试5: 暴露度');
assert(getExposure({ signal: 80, stealth: 30 }) === 50, '80-30=50');
assert(getExposure({ signal: 10, stealth: 50 }) === 0, '负值归零');
assert(getExposure({ signal: 0, stealth: 0 }) === 0, '0-0=0');

// ── 测试6: PRNG ──
console.log('\n测试6: PRNG');
const r1 = mulberry32(42);
const r2 = mulberry32(42);
let match = true;
for (let i = 0; i < 50; i++) { if (r1() !== r2()) { match = false; break; } }
assert(match, '确定性');
const r3 = mulberry32(999);
let inRange = true;
for (let i = 0; i < 500; i++) { const v = r3(); if (v < 0 || v >= 1) { inRange = false; break; } }
assert(inRange, '范围[0,1)');

// ── 测试7: 回合推进（无事件） ──
console.log('\n测试7: 回合推进（无事件）');
const rng7 = mulberry32(77);
let civ7 = createCivilization();
civ7 = advanceTurn(civ7, 'aggressive', rng7);
assert(civ7.turn === 1, 'turn=1');
assert(civ7.tech > 10, 'tech增长');
assert(civ7.signal > 5, 'signal增长');
assert(civ7.history.length === 2, 'history+1');
assert(civ7.history[1].event === null, '无事件时event=null');

// ── 测试8: 回合推进（带事件） ──
console.log('\n测试8: 回合推进（带事件）');
const rng8 = mulberry32(88);
let civ8 = createCivilization();
civ8 = advanceTurn(civ8, 'balanced', rng8, 0); // 选第一个选项
assert(civ8.turn === 1, 'turn=1');
// 事件应该被记录
assert(civ8.history[1].event !== null, '有事件记录');
assert(civ8.usedEvents.length === 1, 'usedEvents记录了一个');

// ── 测试9: 事件不重复 ──
console.log('\n测试9: 事件不重复');
const rng9 = mulberry32(123);
let civ9 = createCivilization();
const seenEvents = new Set();
for (let i = 0; i < EVENTS.length; i++) {
  const evt = pickEvent(civ9, rng9);
  if (!evt) break;
  assert(!seenEvents.has(evt.id), `事件「${evt.id}」未重复`);
  seenEvents.add(evt.id);
  civ9 = { ...civ9, usedEvents: [...civ9.usedEvents, evt.id] };
}
// 用完所有事件后应返回null
const noMore = pickEvent(civ9, rng9);
assert(noMore === null, '事件用完后返回null');

// ── 测试10: applyEventChoice 成功率 ──
console.log('\n测试10: 事件成功率');
const choiceWithRate = { label: 'test', effects: { tech: 50, signal: 35, stealth: -10 }, successRate: 0.3 };
let successes = 0;
const rng10 = mulberry32(42);
for (let i = 0; i < 100; i++) {
  const result = applyEventChoice({}, choiceWithRate, rng10);
  if (result.success) successes++;
}
assert(successes > 0 && successes < 100, `成功率约30% (实际${successes}%)`);
assert(successes < 50, '成功次数应明显低于50');

// ── 测试11: 收割者扫描间隔=3 ──
console.log('\n测试11: 扫描间隔=3');
let civS = createCivilization();
const rngS = mulberry32(5);
for (let i = 0; i < 3; i++) {
  civS = advanceTurn(civS, 'dormant', rngS);
}
assert(civS.history[1].scanned === false, '第1回合不扫描');
assert(civS.history[2].scanned === false, '第2回合不扫描');
assert(civS.history[3].scanned === true, '第3回合扫描');

// ── 测试12: 收割触发 ──
console.log('\n测试12: 收割触发');
let civR = createCivilization({ threshold: 10, reaperScanInterval: 1 });
const rngR = mulberry32(1);
for (let i = 0; i < 10 && civR.alive; i++) {
  civR = advanceTurn(civR, 'aggressive', rngR);
}
assert(!civR.alive, '低阈值被收割');

// ── 测试13: 逃逸 ──
console.log('\n测试13: 逃逸');
let civE = createCivilization({ threshold: 9999, escapeTech: 40 });
const rngE = mulberry32(3);
for (let i = 0; i < 10 && !civE.escaped; i++) {
  civE = advanceTurn(civE, 'aggressive', rngE);
}
assert(civE.escaped, '高阈值低目标逃逸');

// ── 测试14: 超时 ──
console.log('\n测试14: 超时');
let civT = createCivilization({ threshold: 9999, maxTurns: 3, escapeTech: 9999 });
const rngT = mulberry32(7);
for (let i = 0; i < 5; i++) { civT = advanceTurn(civT, 'dormant', rngT); }
assert(!civT.alive, '超时消亡');
assert(civT.turn === 3, 'turn=3');

// ── 测试15: simulate ──
console.log('\n测试15: simulate');
const sim1 = simulate(['aggressive'], { threshold: 9999, escapeTech: 40 }, 42);
assert(sim1.escaped, 'simulate逃逸');
const sim2 = simulate(['aggressive'], { threshold: 5, reaperScanInterval: 1 }, 42);
assert(!sim2.alive, 'simulate被收割');

// ── 测试16: 蒙特卡洛 ──
console.log('\n测试16: 蒙特卡洛');
const mc = monteCarloSimulate(['balanced'], DEFAULT_CONFIG, 100);
assert(mc.escaped + mc.reaped + mc.timeout === 100, '三种结局之和=100');
assert(mc.escapeRate >= 0 && mc.escapeRate <= 100, 'escapeRate范围');
assert(mc.avgTurns > 0, 'avgTurns>0');

// ── 测试17: 计分 ──
console.log('\n测试17: 计分');
const s1 = computeScore({ escaped: true, alive: true, turn: 8, config: DEFAULT_CONFIG });
assert(s1 >= 80 && s1 <= 100, `逃逸得分80-100 (got ${s1})`);
const s2 = computeScore({ escaped: false, alive: false, turn: 15, config: DEFAULT_CONFIG });
assert(s2 >= 0 && s2 <= 40, `被收割得分0-40 (got ${s2})`);
const sFast = computeScore({ escaped: true, alive: true, turn: 5, config: DEFAULT_CONFIG });
const sSlow = computeScore({ escaped: true, alive: true, turn: 25, config: DEFAULT_CONFIG });
assert(sFast >= sSlow, '快逃逸分更高');

// ── 测试18: 策略差异 ──
console.log('\n测试18: 策略差异');
const mcA = monteCarloSimulate(['aggressive'], DEFAULT_CONFIG, 200);
const mcS = monteCarloSimulate(['stealth'], DEFAULT_CONFIG, 200);
const mcD = monteCarloSimulate(['dormant'], DEFAULT_CONFIG, 200);
// aggressive应该被收割率最高（信号增长快）
assert(mcA.reapRate > mcS.reapRate, `aggressive被收割率(${mcA.reapRate})>stealth(${mcS.reapRate})`);
// stealth/dormant应该主要是超时（科技增长太慢）
assert(mcA.avgTurns < mcS.avgTurns, `aggressive存活短(${mcA.avgTurns})<stealth(${mcS.avgTurns})`);

// ── 测试19: 事件效果叠加 ──
console.log('\n测试19: 事件效果叠加');
// 用一个大正面事件，验证tech增长超过纯策略
let civEv = createCivilization({ threshold: 9999 });
const rngEv = mulberry32(42);
const civNoEvent = advanceTurn(createCivilization({ threshold: 9999 }), 'dormant', mulberry32(42));
const civWithEvent = advanceTurn(civEv, 'dormant', rngEv, 0); // 触发事件+选第一个选项
// 有事件的tech应该不同于无事件（可能更高或更低取决于事件）
assert(civWithEvent.tech !== civNoEvent.tech || civWithEvent.signal !== civNoEvent.signal,
  '事件选择影响了结果');

// ── 汇总 ──
console.log('\n' + '='.repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('✓ 所有测试通过！');
  process.exit(0);
} else {
  console.log('✗ 部分测试失败');
  process.exit(1);
}
