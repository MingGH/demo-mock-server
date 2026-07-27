/**
 * 平方根倒数速算法核心算法单元测试
 * 运行方式：node pages/fast-inverse-sqrt/fast-inverse-sqrt.test.js
 */

var engine = require('./engine.js');
var floatToInt = engine.floatToInt;
var intToFloat = engine.intToFloat;
var padBinary = engine.padBinary;
var floatToIEEE754 = engine.floatToIEEE754;
var fastInverseSqrtBitOnly = engine.fastInverseSqrtBitOnly;
var newtonStep = engine.newtonStep;
var fastInverseSqrt = engine.fastInverseSqrt;
var exactInverseSqrt = engine.exactInverseSqrt;
var relativeError = engine.relativeError;
var errorLevel = engine.errorLevel;
var decomposeSteps = engine.decomposeSteps;
var batchAccuracy = engine.batchAccuracy;
var evaluateConstant = engine.evaluateConstant;
var scanConstants = engine.scanConstants;
var formatHex = engine.formatHex;
var formatBinaryGrouped = engine.formatBinaryGrouped;
var formatValue = engine.formatValue;
var MAGIC_CONSTANT = engine.MAGIC_CONSTANT;

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + msg);
  } else {
    failed++;
    console.error('  \u2717 ' + msg);
  }
}

function assertEq(actual, expected, msg) {
  if (actual === expected) {
    passed++;
    console.log('  \u2713 ' + msg);
  } else {
    failed++;
    console.error('  \u2717 ' + msg + ' - expected: ' + expected + ', got: ' + actual);
  }
}

function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) <= tol) {
    passed++;
    console.log('  \u2713 ' + msg);
  } else {
    failed++;
    console.error('  \u2717 ' + msg + ' - expected ~' + expected + ' (±' + tol + '), got: ' + actual);
  }
}

// ── floatToInt / intToFloat 位级重解释 ──
console.log('\nfloatToInt / intToFloat:');

// 2.0 的 IEEE 754 表示是 0x40000000
assertEq(floatToInt(2.0), 0x40000000, 'floatToInt(2.0) = 0x40000000');
assertEq(floatToInt(1.0), 0x3f800000, 'floatToInt(1.0) = 0x3f800000');
assertEq(floatToInt(0.5), 0x3f000000, 'floatToInt(0.5) = 0x3f000000');
assertEq(floatToInt(0.0), 0x00000000, 'floatToInt(0.0) = 0x00000000');

// 反向转换
assertClose(intToFloat(0x40000000), 2.0, 1e-7, 'intToFloat(0x40000000) = 2.0');
assertClose(intToFloat(0x3f800000), 1.0, 1e-7, 'intToFloat(0x3f800000) = 1.0');
assertClose(intToFloat(0x3f000000), 0.5, 1e-7, 'intToFloat(0x3f000000) = 0.5');

// 往返转换
assertClose(intToFloat(floatToInt(3.14)), 3.14, 1e-4, 'float→int→float 往返 3.14');
assertClose(intToFloat(floatToInt(0.001)), 0.001, 1e-6, 'float→int→float 往返 0.001');

// ── padBinary ──
console.log('\npadBinary:');

assertEq(padBinary(0).length, 32, 'padBinary(0) 长度为 32');
assertEq(padBinary(0), '00000000000000000000000000000000', 'padBinary(0) 全零');
assertEq(padBinary(0x40000000), '01000000000000000000000000000000', 'padBinary(0x40000000)');
assertEq(padBinary(1), '00000000000000000000000000000001', 'padBinary(1)');
assertEq(padBinary(0xFFFFFFFF), '11111111111111111111111111111111', 'padBinary(0xFFFFFFFF) 全一');

// ── floatToIEEE754 ──
console.log('\nfloatToIEEE754:');

var ieee2 = floatToIEEE754(2.0);
assertEq(ieee2.sign, 0, '2.0 符号位 = 0（正数）');
assertEq(ieee2.exponent, 128, '2.0 指数 = 128 (偏移127+1)');
assertEq(ieee2.mantissa, 0, '2.0 尾数 = 0');
assertEq(ieee2.hex, '0x40000000', '2.0 十六进制 = 0x40000000');

var ieee1 = floatToIEEE754(1.0);
assertEq(ieee1.sign, 0, '1.0 符号位 = 0');
assertEq(ieee1.exponent, 127, '1.0 指数 = 127 (偏移127+0)');
assertEq(ieee1.mantissa, 0, '1.0 尾数 = 0');

var ieeeHalf = floatToIEEE754(0.5);
assertEq(ieeeHalf.exponent, 126, '0.5 指数 = 126 (偏移127-1)');
assertEq(ieeeHalf.mantissa, 0, '0.5 尾数 = 0');

// ── fastInverseSqrtBitOnly（仅位运算）──
console.log('\nfastInverseSqrtBitOnly:');

// 1/√2 ≈ 0.7071，位运算近似应该接近
var bitOnly2 = fastInverseSqrtBitOnly(2.0);
assertClose(bitOnly2, 0.70710678, 0.05, 'fastInverseSqrtBitOnly(2) ≈ 0.7071 (±0.05)');

// 1/√1 = 1.0
var bitOnly1 = fastInverseSqrtBitOnly(1.0);
assertClose(bitOnly1, 1.0, 0.05, 'fastInverseSqrtBitOnly(1) ≈ 1.0 (±0.05)');

// 1/√0.25 = 2.0
var bitOnly025 = fastInverseSqrtBitOnly(0.25);
assertClose(bitOnly025, 2.0, 0.1, 'fastInverseSqrtBitOnly(0.25) ≈ 2.0 (±0.1)');

// 1/√100 = 0.1
var bitOnly100 = fastInverseSqrtBitOnly(100.0);
assertClose(bitOnly100, 0.1, 0.01, 'fastInverseSqrtBitOnly(100) ≈ 0.1 (±0.01)');

// ── newtonStep ──
console.log('\nnewtonStep:');

// 牛顿迭代应该让近似值更精确
var y0 = fastInverseSqrtBitOnly(2.0);
var y1 = newtonStep(2.0, y0);
var exact2 = exactInverseSqrt(2.0);
assert(relativeError(y1, exact2) < relativeError(y0, exact2), '牛顿迭代后误差减小 (x=2)');

var y0b = fastInverseSqrtBitOnly(100.0);
var y1b = newtonStep(100.0, y0b);
var exact100 = exactInverseSqrt(100.0);
assert(relativeError(y1b, exact100) < relativeError(y0b, exact100), '牛顿迭代后误差减小 (x=100)');

// ── fastInverseSqrt（完整算法）──
console.log('\nfastInverseSqrt:');

// 默认1次牛顿迭代，误差应 < 0.2%
var result2 = fastInverseSqrt(2.0);
assertClose(result2, 0.70710678, 0.002, 'fastInverseSqrt(2) 误差 < 0.2%');

var result1 = fastInverseSqrt(1.0);
assertClose(result1, 1.0, 0.002, 'fastInverseSqrt(1) ≈ 1.0');

var result100 = fastInverseSqrt(100.0);
assertClose(result100, 0.1, 0.0002, 'fastInverseSqrt(100) ≈ 0.1');

var result001 = fastInverseSqrt(0.01);
assertClose(result001, 10.0, 0.02, 'fastInverseSqrt(0.01) ≈ 10.0');

// 0次迭代 = 仅位运算
var result0iter = fastInverseSqrt(2.0, 0);
assertClose(result0iter, fastInverseSqrtBitOnly(2.0), 1e-7, '0次迭代 = 仅位运算');

// 2次迭代更精确
var result2iter = fastInverseSqrt(2.0, 2);
assert(relativeError(result2iter, exact2) < relativeError(result2, exact2), '2次迭代比1次更精确');

// ── relativeError ──
console.log('\nrelativeError:');

assertClose(relativeError(1.0, 1.0), 0, 1e-10, '完全匹配误差为0');
assertClose(relativeError(1.01, 1.0), 1.0, 1e-10, '1%偏差 → 1.0%');
assertClose(relativeError(0.99, 1.0), 1.0, 1e-10, '1%偏差 → 1.0%（绝对值）');
assertEq(relativeError(1.0, 0), 0, '除以0返回0');

// ── errorLevel ──
console.log('\nerrorLevel:');

assertEq(errorLevel(0.001), 'perfect', '0.001% → perfect');
assertEq(errorLevel(0.009), 'perfect', '0.009% → perfect');
assertEq(errorLevel(0.05), 'excellent', '0.05% → excellent');
assertEq(errorLevel(0.5), 'good', '0.5% → good');
assertEq(errorLevel(2.0), 'poor', '2.0% → poor');

// ── decomposeSteps ──
console.log('\ndecomposeSteps:');

var steps = decomposeSteps(2.0);
assertEq(steps.length, 6, '分解为6步');
assertEq(steps[0].step, 0, '第0步 step=0');
assertEq(steps[5].step, 5, '第5步 step=5');
assertClose(steps[0].floatVal, 2.0, 1e-7, '第0步浮点值 = 2.0');
assertEq(steps[1].intVal, 0x40000000, '第1步整数值 = 0x40000000');
assertClose(steps[4].floatVal, fastInverseSqrtBitOnly(2.0), 1e-7, '第4步 = 位运算结果');
assertClose(steps[5].floatVal, fastInverseSqrt(2.0), 1e-7, '第5步 = 牛顿迭代结果');

// 检查每步都有必要字段
var hasAllFields = steps.every(function(s) {
  return s.title && s.binary && s.hex && s.description && s.intVal !== undefined;
});
assert(hasAllFields, '每步都包含 title/binary/hex/description/intVal');

// ── batchAccuracy ──
console.log('\nbatchAccuracy:');

var batch = batchAccuracy(0.1, 100, 50, 1);
assertEq(batch.length, 50, '50个采样点');
assert(batch.every(function(b) { return b.error >= 0; }), '所有误差非负');
assert(batch.every(function(b) { return b.approx > 0 && b.exact > 0; }), '所有值为正');

// 1次牛顿迭代的误差应普遍小于0次
var batch0 = batchAccuracy(0.1, 100, 50, 0);
var batch1 = batchAccuracy(0.1, 100, 50, 1);
var avgErr0 = batch0.reduce(function(s, b) { return s + b.error; }, 0) / 50;
var avgErr1 = batch1.reduce(function(s, b) { return s + b.error; }, 0) / 50;
assert(avgErr1 < avgErr0, '1次牛顿迭代平均误差 < 0次迭代');

// ── evaluateConstant ──
console.log('\nevaluateConstant:');

var evalResult = evaluateConstant(MAGIC_CONSTANT, 100);
assert(evalResult.maxError > 0, '最大误差 > 0');
assert(evalResult.avgError > 0, '平均误差 > 0');
assert(evalResult.maxError >= evalResult.avgError, '最大误差 >= 平均误差');
assertEq(evalResult.samples.length, 100, '100个采样点');

// 魔法常数的误差应该很小（1次牛顿后）
assert(evalResult.maxError < 0.2, '魔法常数最大误差 < 0.2%');

// 一个很差的常数应该误差更大
var badResult = evaluateConstant(0x00000000, 100);
assert(badResult.maxError > evalResult.maxError, '常数0的误差 > 魔法常数');

// ── scanConstants ──
console.log('\nscanConstants:');

var scan = scanConstants(MAGIC_CONSTANT, 64);
assertEq(scan.length, 33, '扫描范围 -64~+64 步长4 → 33个点');
assert(scan.every(function(s) { return s.maxError > 0; }), '所有点误差 > 0');
assert(scan.every(function(s) { return s.constant === MAGIC_CONSTANT + s.offset; }), 'constant = center + offset');

// 魔法常数附近应该是最优区域
var magicIdx = scan.findIndex(function(s) { return s.offset === 0; });
var magicErr = scan[magicIdx].maxError;
var nearbyBetter = scan.filter(function(s) { return s.maxError < magicErr; });
// 0x5f3759df 不是数学上的最优解，但非常接近最优，更优的常数不超过一半
assert(nearbyBetter.length < scan.length / 2, '0x5f3759df 优于附近至少一半的常数');

// ── formatHex ──
console.log('\nformatHex:');

assertEq(formatHex(0x5f3759df), '0x5f3759df', 'formatHex(魔法常数)');
assertEq(formatHex(0x40000000), '0x40000000', 'formatHex(0x40000000)');
assertEq(formatHex(0), '0x0', 'formatHex(0)');

// ── formatBinaryGrouped ──
console.log('\nformatBinaryGrouped:');

var grouped = formatBinaryGrouped(0x40000000);
var parts = grouped.split(' ');
assertEq(parts.length, 3, '分3段：符号位/指数/尾数');
assertEq(parts[0], '0', '2.0 符号位 = 0');
assertEq(parts[1], '10000000', '2.0 指数 = 10000000 (128)');
assertEq(parts[2], '00000000000000000000000', '2.0 尾数全零');

// ── formatValue ──
console.log('\nformatValue:');

assertEq(formatValue(1.234567), '1.234567', '常规数字保留6位');
assertEq(formatValue(0.707107), '0.707107', '1/√2 近似值');
assert(formatValue(0.00001).indexOf('e') !== -1, '极小数用科学计数法');
assert(formatValue(10000000).indexOf('e') !== -1, '极大数用科学计数法');

// ── 综合验证：Quake III 经典案例 ──
console.log('\nQuake III 经典案例验证:');

// 经典值 x=2 (1/√2 ≈ 0.7071067811865476)
var quakeResult = fastInverseSqrt(2.0);
var quakeExact = exactInverseSqrt(2.0);
var quakeErr = relativeError(quakeResult, quakeExact);
assert(quakeErr < 0.05, 'x=2 速算误差 < 0.05%');
console.log('    x=2: 速算=' + quakeResult.toFixed(8) + ' 精确=' + quakeExact.toFixed(8) + ' 误差=' + quakeErr.toFixed(4) + '%');

// 经典值 x=0.15625 (常用于光照计算)
var lightResult = fastInverseSqrt(0.15625);
var lightExact = exactInverseSqrt(0.15625);
var lightErr = relativeError(lightResult, lightExact);
assert(lightErr < 0.2, 'x=0.15625 速算误差 < 0.2%');
console.log('    x=0.15625: 速算=' + lightResult.toFixed(8) + ' 精确=' + lightExact.toFixed(8) + ' 误差=' + lightErr.toFixed(4) + '%');

// ── 结果汇总 ──
console.log('\n' + '='.repeat(40));
console.log('结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exit(1);
