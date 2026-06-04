// ehp-affix 核心算法单元测试
// 运行：node pages/ehp-affix.test.js

const {
  calcEHP, ehpGainFromHP, ehpGainFromDR, ehpGainPct,
  optimalAllocation, generateComparisonData, crossoverDR
} = require('./ehp-affix/engine.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

function approxEq(a, b, tol) {
  return Math.abs(a - b) < (tol || 0.01);
}

// ── calcEHP ──
console.log('calcEHP:');

assert(calcEHP(10000, 0) === 10000, 'DR=0 → EHP=HP');
assert(approxEq(calcEHP(10000, 0.5), 20000), 'DR=50% → EHP=20000');
assert(approxEq(calcEHP(10000, 0.8), 50000), 'DR=80% → EHP=50000');
assert(calcEHP(10000, 1) === Infinity, 'DR=100% → Infinity');
assert(calcEHP(10000, -0.1) === 10000, 'DR<0 clamped to 0');

console.log('  ✓ calcEHP done');

// ── ehpGainFromHP ──
console.log('ehpGainFromHP:');

// 生命+5%，DR=0 → EHP 增量 = 500
assert(approxEq(ehpGainFromHP(10000, 0, 0.05), 500), 'HP+5% at DR=0');
// 生命+5%，DR=50% → EHP 增量 = 1000
assert(approxEq(ehpGainFromHP(10000, 0.5, 0.05), 1000), 'HP+5% at DR=50%');

console.log('  ✓ ehpGainFromHP done');

// ── ehpGainFromDR ──
console.log('ehpGainFromDR:');

// 免伤+5%（0→5%），HP=10000 → EHP from 10000 to 10000/0.95 ≈ 10526.3
assert(approxEq(ehpGainFromDR(10000, 0, 0.05), 526.3, 1), 'DR+5% at DR=0');
// 免伤+5%（80%→85%），HP=10000 → EHP from 50000 to 10000/0.15 ≈ 66666.7
assert(approxEq(ehpGainFromDR(10000, 0.8, 0.05), 16666.7, 1), 'DR+5% at DR=80%');

console.log('  ✓ ehpGainFromDR done');

// ── ehpGainPct ──
console.log('ehpGainPct:');

assert(approxEq(ehpGainPct(10000, 10500), 0.05), '10000→10500 = 5%');
assert(ehpGainPct(0, 100) === 0, 'base=0 → 0');

console.log('  ✓ ehpGainPct done');

// ── crossoverDR ──
console.log('crossoverDR:');

// 对称 5%/5% 情况: 临界点 DR = 1 - 0.05*1.05/0.05 = 1 - 1.05 = -0.05 → clamp 0
// 不对 — 重新算：x = drFlat*(1+hpPct)/hpPct = 0.05*1.05/0.05 = 1.05, DR = 1-1.05 = -0.05 → 0
// 这意味着在幅度相同时，临界点理论上是负的——即免伤+5%绝对值 vs 生命+5%乘法...
// 但等等，让我们重新看公式。
// 生命+5% EHP增益率 = (1+p)-1 = p = 5%（常数）
// 免伤+5% EHP增益率 = 1/(1-D-d) / (1/(1-D)) - 1 = (1-D)/(1-D-d) - 1 = d/(1-D-d)
// 交叉点: p = d/(1-D-d) → p(1-D-d)=d → p - pD - pd = d → p - pD = d + pd = d(1+p)
// D = (p - d(1+p))/p = 1 - d(1+p)/p
// 当 d=p=0.05: D = 1 - 0.05*1.05/0.05 = 1-1.05 = -0.05 → 0
// 但这跟直觉不符……问题出在：5%生命=乘法5%，5%免伤=绝对值5个百分点。
// 在 DR=0 时: 生命+5%增益5%, 免伤+5%增益=0.05/(1-0-0.05)=5.26% > 5%
// 所以免伤+5%（绝对值）始终 >= 生命+5%（乘法）当两个幅度相同。
// 交叉点是虚的（负值），免伤永远赢。这是对的。
const cross = crossoverDR(0.05, 0.05);
assert(cross === 0, '对称5%/5%临界点 clamp=0（免伤始终更优）');

// 非对称情况: 生命+10%，免伤+5%
// D = 1 - 0.05*1.1/0.1 = 1 - 0.55 = 0.45
const cross2 = crossoverDR(0.10, 0.05);
assert(approxEq(cross2, 0.45), '生命+10% vs 免伤+5% 临界点=45%');

console.log('  ✓ crossoverDR done');

// ── optimalAllocation ──
console.log('optimalAllocation:');

// DR=0, 4 slots, 5%/5% → 由于免伤始终更优，应全给免伤
const alloc1 = optimalAllocation(10000, 0, 4, 0.05, 0.05);
assert(alloc1.drPoints === 4, 'DR=0 全给免伤（免伤绝对值加成始终更优）');

// DR=85%, 4 slots → 免伤空间只到 99%，可能有上限约束
const alloc2 = optimalAllocation(10000, 0.85, 4, 0.05, 0.05);
// 85% + 4*5% = 105% → 会撞 99% 上限，所以不能全给免伤
assert(alloc2.hpPoints >= 1, 'DR=85% 有免伤上限，会分配部分给HP');

console.log('  ✓ optimalAllocation done');

// ── generateComparisonData ──
console.log('generateComparisonData:');

const cmpData = generateComparisonData(10000, 0.9, 0.1, 0.05, 0.05);
assert(cmpData.labels.length === 10, '0~90% step=10% → 10个点');
assert(cmpData.hpGains.length === 10, 'hpGains长度一致');
assert(cmpData.drGains.length === 10, 'drGains长度一致');
// 生命增益率始终=5%
assert(approxEq(cmpData.hpGains[0], 0.05), 'HP增益率恒定5%');
assert(approxEq(cmpData.hpGains[5], 0.05), 'HP增益率恒定5% (mid)');
// 免伤增益率递增
assert(cmpData.drGains[9] > cmpData.drGains[0], '免伤增益率递增');

console.log('  ✓ generateComparisonData done');

// ── 总结 ──
console.log(`\n结果：${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
