/**
 * gps-time 核心算法单元测试
 * 运行方式：node pages/gps-time/engine.test.js
 */

const {
  SPEED_OF_LIGHT,
  solveLinearSystem,
  pseudorange,
  dist2d,
  solvePosition,
  clockErrorToRange,
  errorToRealWorld,
  ntpOffset,
  ntpDelay,
  clockFilter,
  measureQuantization,
  wallTimeMs,
  formatRange,
  formatTime
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}
function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) <= tol) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg} — expected ${expected} ± ${tol}, got ${actual}`); }
}
function assertEq(actual, expected, msg) {
  if (actual === expected) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg} — expected ${expected}, got ${actual}`); }
}

// ── solveLinearSystem ──
console.log('\nsolveLinearSystem:');
assertClose(solveLinearSystem([[2, 1], [1, 3]], [3, 5])[0], 0.8, 1e-9, '2x2 解 x=0.8');
assertClose(solveLinearSystem([[2, 1], [1, 3]], [3, 5])[1], 1.4, 1e-9, '2x2 解 y=1.4');
assertEq(solveLinearSystem([[1, 1], [2, 2]], [1, 2]), null, '奇异矩阵返回 null');

// ── pseudorange / dist2d ──
console.log('\npseudorange / dist2d:');
assertEq(dist2d({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, '3-4-5 距离');
// 100ns 钟差（接收机慢）→ 伪距 = 距离 + c×1e-7
assertClose(pseudorange(5, 1e-7), 5 + SPEED_OF_LIGHT * 1e-7, 1e-6, '伪距 = 距离 + c·b');

// ── solvePosition ──
console.log('\nsolvePosition:');

// 构造一个真实接收机与三/四颗卫星（平面坐标，米），反算伪距，验证能解回真值。
const truth = { x: 200, y: -150 };   // 米，平面
const clockBias = 1e-4;                // 100µs（接收机偏慢）= 29.98 km 等效距离
const satellites3 = [
  { x: 13_000, y: 0 },
  { x: -11_000, y: 7_000 },
  { x: 4_000, y: -14_000 }
];
const satellites4 = satellites3.concat([{ x: -6_000, y: -11_000 }]);

// 由真实伪距解算（不知道钟差，3 星，b 当未知数）
function prs(sats, p) {
  return sats.map(s => pseudorange(dist2d(p, s), clockBias));
}

const exact3 = solvePosition(satellites3, prs(satellites3, truth));
assertClose(exact3.x, truth.x, 1, '3 星解: x');
assertClose(exact3.y, truth.y, 1, '3 星解: y');
assertClose(exact3.clockBiasSeconds, clockBias, 1e-6, '3 星解: 钟差');

// 固定 b=0（忽略钟差这个未知数，只用 2 星）而伪距里其实带着 30km 的钟差 → 位置被强行摊偏 ~30km
// 用 4 星 + assumeClockKnown=true 是超定最小二乘，数值鲁棒，稳定演示「漏掉钟差就全错」。
const assumeKnown = solvePosition(satellites4, prs(satellites4, truth), { assumeClockKnown: true });
const errKnown = Math.hypot(assumeKnown.x - truth.x, assumeKnown.y - truth.y);
assert(errKnown > 1e4, `忽略钟差时位置应严重偏差（误差 ${errKnown.toFixed(0)} m > 10 km）`);

// 卫星数不足返回 null
assertEq(solvePosition(satellites3.slice(0, 2), prs(satellites3.slice(0, 2), truth)), null, '2 星 + 未知钟差（默认）返回 null');
assertEq(solvePosition(satellites3.slice(0, 1), [1], { assumeClockKnown: true }), null, '卫星不足返回 null');

// ── clockErrorToRange ──
console.log('\nclockErrorToRange:');
assertClose(clockErrorToRange(1e-9), 0.299792458, 1e-6, '1ns ≈ 30cm');
assertClose(clockErrorToRange(1e-6), 299.792458, 1e-6, '1µs ≈ 300m');
assertClose(clockErrorToRange(1e-3), 299792.458, 1e-6, '1ms ≈ 300km');
// 10m 定位 ≈ 33ns
assertClose(clockErrorToRange(1e-9) * 33.4, 10, 0.2, '33ns ≈ 10m');

// ── errorToRealWorld ──
console.log('\nerrorToRealWorld:');
assertEq(errorToRealWorld(3e-8).label.includes('10米'), true, '30ns 落在 10 米定位锚点');
assertEq(errorToRealWorld(1e-6).label.includes('电网'), true, '1µs 落在电网失稳档');
assertEq(errorToRealWorld(1e-3).label.includes('高频交易'), true, '1ms 落在高频交易档');
assertClose(errorToRealWorld(1e-6).meters, 299.792458, 1e-6, '返回带 meters 字段');

// ── ntpOffset / ntpDelay ──
console.log('\nntpOffset / ntpDelay:');
// 零偏移样本：t1=0, t2=5, t3=6, t4=11（往返 10ms，服务端处理 1ms，无真实偏移）
assertClose(ntpOffset(0, 5, 6, 11), 0, 1e-9, '零偏移: offset=((5-0)+(6-11))/2=0');
assertClose(ntpDelay(0, 5, 6, 11), 10, 1e-9, 'delay=(11-0)-(6-5)=10');
// 偏移 5ms：客户端段整体多走 5ms。t1=0,t2=5,t3=6,t4=16（相对上式 t4 后移 5ms）
assertClose(ntpOffset(0, 5, 6, 16), -2.5, 1e-9, '偏移样本: offset=((5-0)+(6-16))/2=-2.5');

// ── clockFilter ──
console.log('\nclockFilter:');
const samples = [
  { t1: 0, t2: 40.0, t3: 40.5, t4: 80.0 },  // delay=(80)-(0.5)=79.5
  { t1: 0, t2: 45.0, t3: 45.2, t4: 50.0 },  // delay=(50)-(0.2)=49.8 （最优）
  { t1: 0, t2: 46.0, t3: 46.1, t4: 60.0 }   // delay=(60)-(0.1)=59.9
];
const filtered = clockFilter(samples);
assertEq(filtered.chosenIndex, 1, 'clock filter 选中 delay 最小的样本');
assertClose(filtered.delayMillis, 49.8, 1e-9, '被选中样本的 delay');
// 样本1 offset = ((45.0-0)+(45.2-50.0))/2 = (45-4.8)/2 = 20.1
assertClose(filtered.offsetMillis, (45.0 + (45.2 - 50.0)) / 2, 1e-9, '被选中样本的 offset');
assertClose(filtered.uncertaintyMillis, 49.8 / 2, 1e-9, '不确定度 = delay/2');
assertEq(clockFilter([]).chosenIndex, -1, '空样本返回占位');

// ── measureQuantization ──
console.log('\nmeasureQuantization:');
assertClose(measureQuantization([10.000, 10.001, 10.002, 10.003]), 0.001, 1e-12, '1ms 台阶');
assertClose(measureQuantization([0, 0.1, 0.2, 0.3, 0.4]), 0.1, 1e-12, '0.1ms 台阶');
assertEq(measureQuantization([1, 1, 1, 1]), 0, '全相同无台阶返回 0');
assertEq(measureQuantization([1]), 0, '单样本返回 0');

// ── wallTimeMs ──
console.log('\nwallTimeMs:');
assertClose(wallTimeMs(1000, 250.5), 1250.5, 1e-12, 'timeOrigin + now');

// ── 格式化 ──
console.log('\nformatRange / formatTime:');
assertEq(formatRange(0.3), '30.0 cm', '0.3m → cm');
assertEq(formatRange(299.8), '299.8 m', '数百米 → m');
assertEq(formatRange(5000), '5.0 km', '5km → km');
assertEq(formatTime(1e-9), '1.0 ns', '秒 → ns');
assertEq(formatTime(1e-4), '100.0 µs', '秒 → µs');

// ── 汇总 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);