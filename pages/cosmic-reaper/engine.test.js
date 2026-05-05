/**
 * 宇宙收割者假说 — 单元测试
 * 运行命令: node pages/cosmic-reaper/engine.test.js
 */

const {
  STRATEGIES,
  DEFAULT_CONFIG,
  createCivilization,
  getExposure,
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

function assertApprox(a, b, tolerance, msg) {
  assert(Math.abs(a - b) <= tolerance, `${msg} (got ${a}, expected ~${b})`);
}

// ── 测试1: 策略常量 ──
console.log('\n测试1: 策略常量定义');
assert(Object.keys(STRATEGIES).length === 4, '应有4种策略');
assert(STRATEGIES.aggressive.techGain === 12, 'aggressive techGain=12');
assert(STRATEGIES.stealth.stealthGain === 15, 'stealth stealthGain=15');
assert(STRATEGIES.dormant.signalGain === 1, 'dormant signalGain=1');
assert(STRATEGIES.balanced.techGain === 8, 'balanced techGain=8');

// ── 测试2: 默认配置 ──
console.log('\n测试2: 默认配置');
assert(DEFAULT_CONFIG.threshold === 100, 'threshold=100');
assert(DEFAULT_CONFIG.escapeTech === 200, 'escapeTech=200');
assert(DEFAULT_CONFIG.maxTurns === 50, 'maxTurns=50');
assert(DEFAULT_CONFIG.reaperScanInterval === 3, 'reaperScanInterval=3');

// ── 测试3: 创建文明 ──
console.log('\n测试3: 创建文明');
const civ0 = createCivilization();
assert(civ0.tech === 10, '初始tech=10');
assert(civ0.signal === 5, '初始signal=5');
assert(civ0.stealth === 5, '初始stealth=5');
assert(civ0.turn === 0, '初始turn=0');
assert(civ0.alive === true, '初始alive=true');
assert(civ0.escaped === false, '初始escaped=false');
assert(civ0.history.length === 1, '初始history有1条记录');

// ── 测试4: 自定义配置 ──
console.log('\n测试4: 自定义配置');
const civCustom = createCivilization({ threshold: 50, maxTurns: 20 });
assert(civCustom.config.threshold === 50, '自定义threshold=50');
assert(civCustom.config.maxTurns === 20, '自定义maxTurns=20');
assert(civCustom.config.escapeTech === 200, '未覆盖的escapeTech保持默认');

// ── 测试5: 暴露度计算 ──
console.log('\n测试5: 暴露度计算');
assert(getExposure({ signal: 50, stealth: 30 }) === 20, 'signal>stealth时暴露度=差值');
assert(getExposure({ signal: 10, stealth: 30 }) === 0, 'signal<stealth时暴露度=0');
assert(getExposure({ signal: 30, stealth: 30 }) === 0, '相等时暴露度=0');

// ── 测试6: PRNG确定性 ──
console.log('\n测试6: PRNG确定性');
const rng1 = mulberry32(42);
const rng2 = mulberry32(42);
let prngsMatch = true;
for (let i = 0; i < 100; i++) {
  if (rng1() !== rng2()) { prngsMatch = false; break; }
}
assert(prngsMatch, '相同种子产生相同序列');

const rng3 = mulberry32(123);
let allInRange = true;
for (let i = 0; i < 1000; i++) {
  const v = rng3();
  if (v < 0 || v >= 1) { allInRange = false; break; }
}
assert(allInRange, 'PRNG输出在[0,1)范围内');

// ── 测试7: 回合推进 ──
console.log('\n测试7: 回合推进');
const rngFixed = mulberry32(99);
let civ1 = createCivilization();
civ1 = advanceTurn(civ1, 'aggressive', rngFixed);
assert(civ1.turn === 1, '推进后turn=1');
assert(civ1.tech > 10, 'aggressive策略tech应增长');
assert(civ1.signal > 5, 'aggressive策略signal应增长');
assert(civ1.history.length === 2, 'history增加一条');
assert(civ1.history[1].strategy === 'aggressive', '记录策略');

// ── 测试8: 收割者扫描时机 ──
console.log('\n测试8: 收割者扫描时机');
let civScan = createCivilization();
const rngScan = mulberry32(7);
civScan = advanceTurn(civScan, 'dormant', rngScan); // turn 1
assert(civScan.history[1].scanned === false, '第1回合不扫描');
civScan = advanceTurn(civScan, 'dormant', rngScan); // turn 2
assert(civScan.history[2].scanned === false, '第2回合不扫描');
civScan = advanceTurn(civScan, 'dormant', rngScan); // turn 3
assert(civScan.history[3].scanned === true, '第3回合扫描');

// ── 测试9: 收割触发 ──
console.log('\n测试9: 收割触发');
// 设置一个低阈值，让aggressive策略快速触发
let civReap = createCivilization({ threshold: 10, reaperScanInterval: 1 });
const rngReap = mulberry32(1);
// 多次aggressive应该很快超过阈值
for (let i = 0; i < 10 && civReap.alive; i++) {
  civReap = advanceTurn(civReap, 'aggressive', rngReap);
}
assert(!civReap.alive, '低阈值+aggressive应被收割');
assert(!civReap.escaped, '被收割时escaped=false');

// ── 测试10: 逃逸成功 ──
console.log('\n测试10: 逃逸成功');
// 高阈值 + aggressive 应该能逃逸
let civEscape = createCivilization({ threshold: 9999, escapeTech: 50 });
const rngEscape = mulberry32(5);
for (let i = 0; i < 20 && !civEscape.escaped; i++) {
  civEscape = advanceTurn(civEscape, 'aggressive', rngEscape);
}
assert(civEscape.escaped, '高阈值+低逃逸目标应能逃逸');
assert(civEscape.alive, '逃逸时alive=true');

// ── 测试11: 超时消亡 ──
console.log('\n测试11: 超时消亡');
let civTimeout = createCivilization({ threshold: 9999, maxTurns: 5, escapeTech: 9999 });
const rngTimeout = mulberry32(3);
for (let i = 0; i < 10; i++) {
  civTimeout = advanceTurn(civTimeout, 'dormant', rngTimeout);
}
assert(!civTimeout.alive, '超过maxTurns应消亡');
assert(civTimeout.turn === 5, '应在第5回合停止');

// ── 测试12: 死亡后不可继续 ──
console.log('\n测试12: 死亡后不可继续');
let civDead = createCivilization({ threshold: 9999, maxTurns: 3, escapeTech: 9999 });
const rngDead = mulberry32(11);
for (let i = 0; i < 5; i++) {
  civDead = advanceTurn(civDead, 'balanced', rngDead);
}
assert(civDead.turn === 3, '死亡后turn不再增加');

// ── 测试13: simulate函数 ──
console.log('\n测试13: simulate函数');
const simResult = simulate(['aggressive'], { threshold: 9999, escapeTech: 50 }, 42);
assert(simResult.escaped === true, 'simulate: 高阈值低目标应逃逸');
assert(simResult.history.length > 1, 'simulate: history有记录');

const simReap = simulate(['aggressive'], { threshold: 5, reaperScanInterval: 1 }, 42);
assert(!simReap.alive, 'simulate: 低阈值应被收割');

// ── 测试14: 蒙特卡洛模拟 ──
console.log('\n测试14: 蒙特卡洛模拟');
const mcResult = monteCarloSimulate(['balanced'], DEFAULT_CONFIG, 100);
assert(mcResult.escaped + mcResult.reaped + mcResult.timeout === 100, 'MC: 三种结局之和=总次数');
assert(mcResult.escapeRate >= 0 && mcResult.escapeRate <= 100, 'MC: escapeRate在0-100之间');
assert(mcResult.avgTurns > 0, 'MC: avgTurns>0');

// ── 测试15: 计分 ──
console.log('\n测试15: 计分');
const scoreEscaped = computeScore({ escaped: true, alive: true, turn: 10, config: DEFAULT_CONFIG });
assert(scoreEscaped >= 80 && scoreEscaped <= 100, `逃逸得分应在80-100之间 (got ${scoreEscaped})`);

const scoreReaped = computeScore({ escaped: false, alive: false, turn: 25, config: DEFAULT_CONFIG });
assert(scoreReaped >= 0 && scoreReaped <= 40, `被收割得分应在0-40之间 (got ${scoreReaped})`);

const scoreFast = computeScore({ escaped: true, alive: true, turn: 5, config: DEFAULT_CONFIG });
const scoreSlow = computeScore({ escaped: true, alive: true, turn: 40, config: DEFAULT_CONFIG });
assert(scoreFast >= scoreSlow, '更快逃逸得分应更高');

// ── 测试16: 策略差异性 ──
console.log('\n测试16: 策略差异性');
const mcAggressive = monteCarloSimulate(['aggressive'], DEFAULT_CONFIG, 200);
const mcStealth = monteCarloSimulate(['stealth'], DEFAULT_CONFIG, 200);
const mcDormant = monteCarloSimulate(['dormant'], DEFAULT_CONFIG, 200);
// aggressive应该被收割率最高
assert(mcAggressive.reapRate > mcStealth.reapRate, 'aggressive被收割率应高于stealth');
// dormant应该超时率最高（科技增长太慢）
assert(mcDormant.avgTurns >= mcAggressive.avgTurns, 'dormant平均存活应不低于aggressive');

// ── 测试17: 信号衰减 ──
console.log('\n测试17: 信号衰减');
let civDecay = createCivilization({ decayRate: 0.5 }); // 50%衰减率
const rngDecay = mulberry32(77);
civDecay = advanceTurn(civDecay, 'dormant', rngDecay);
// dormant: signalGain=1, 初始signal=5, 加上噪声后乘以0.5
// 信号应该比不衰减时低很多
assert(civDecay.signal < 10, '高衰减率应抑制信号增长');

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
