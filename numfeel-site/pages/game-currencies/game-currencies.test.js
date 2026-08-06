// 测试文件：游戏多货币经济系统核心算法
const { presetConfig, buildConfig, simulate, clamp } = require('./engine.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n🧪 游戏多货币经济系统 - 核心算法测试\n');

console.log('--- presetConfig ---');
assert(presetConfig('single').currencies.length === 1, '预设 single 只有 1 种货币');
assert(presetConfig('two').currencies.length === 2, '预设 two 有 2 种货币');
assert(presetConfig('three').currencies.length === 3, '预设 three 有 3 种货币');

console.log('--- buildConfig ---');
assert(buildConfig({ currencyCount: 1, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 }).currencies.length === 1, '1 种货币');
assert(buildConfig({ currencyCount: 2, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 }).currencies.length === 2, '2 种货币');
assert(buildConfig({ currencyCount: 3, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 }).currencies.length === 3, '3 种货币');

console.log('--- 确定性（可复现） ---');
const a1 = simulate(presetConfig('two'));
const a2 = simulate(presetConfig('two'));
assert(a1.metrics.health === a2.metrics.health, '两次模拟结果一致');
assert(a1.series.inflation.length === a1.series.retention.length, '序列长度一致');

console.log('--- 序列长度 ---');
const sSingle = simulate(presetConfig('single'));
assert(sSingle.series.inflation.length === 200, '200 ticks 的序列');
assert(sSingle.metrics.health >= 0 && sSingle.metrics.health <= 100, '健康分在 0~100');

console.log('--- 预设一致性：presetConfig 与 buildConfig 等价 ---');
const eqCurrencies = (a, b) => a.length === b.length && a.every((c, i) =>
  c.type === b[i].type && c.earn === b[i].earn && (c.payShare || 0) === (b[i].payShare || 0));
assert(eqCurrencies(presetConfig('single').currencies, buildConfig({ currencyCount: 1, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 }).currencies), 'single: preset 与 buildConfig 一致');
assert(eqCurrencies(presetConfig('two').currencies, buildConfig({ currencyCount: 2, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 }).currencies), 'two: preset 与 buildConfig 一致');
assert(eqCurrencies(presetConfig('three').currencies, buildConfig({ currencyCount: 3, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 }).currencies), 'three: preset 与 buildConfig 一致');

console.log('--- 核心论点：单货币崩，多货币健康 ---');
const single = simulate(presetConfig('single'));
const two = simulate(presetConfig('two'));
const three = simulate(presetConfig('three'));
assert(single.metrics.health < 30, `单货币崩盘（健康分 ${single.metrics.health} < 30）`);
assert(two.metrics.health >= 50, `双货币健康（健康分 ${two.metrics.health} >= 50）`);
assert(three.metrics.health >= 50, `三货币健康（健康分 ${three.metrics.health} >= 50）`);
assert(single.metrics.health < two.metrics.health / 2, '单货币健康分不足双货币一半（相对断言）');
assert(three.metrics.health >= two.metrics.health, '三货币 >= 双货币');

console.log('--- 通胀：单货币最高 ---');
assert(single.metrics.inflation > 0.9, `单货币通胀极高（${single.metrics.inflation.toFixed(3)} > 0.9）`);
assert(single.metrics.inflation > two.metrics.inflation * 1.5, '单货币通胀 > 双货币（相对断言）');
assert(two.metrics.inflation > three.metrics.inflation, '双货币通胀 > 三货币');

console.log('--- 留存：单货币最低 ---');
assert(single.metrics.retention < two.metrics.retention, '双货币留存 > 单货币');

console.log('--- 氪金占比 ---');
assert(single.metrics.hasHard === false && single.metrics.monetization === 0, '单货币无氪金路径（占比 0）');
assert(two.metrics.hasHard === true && two.metrics.monetization > 0, '双货币有氪金路径');

console.log('--- 报告原因条数 ---');
assert(single.reasons.length >= 2, '单货币有原因说明');
assert(two.reasons.length >= 2, '双货币有原因说明');
assert(three.reasons.length >= 3, '三货币有原因说明（含玩法绑定）');

console.log('--- clamp ---');
assert(clamp(150, 0, 100) === 100, 'clamp 上界');
assert(clamp(-5, 0, 100) === 0, 'clamp 下界');
assert(clamp(50, 0, 100) === 50, 'clamp 中间值');

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);