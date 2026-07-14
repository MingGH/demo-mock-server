/**
 * rs-core.test.js - 里德-所罗门核心算法单元测试
 * 运行：node pages/reed-solomon/rs-core.test.js
 */
var RS = require('./rs-core.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('  ✅ ' + msg);
    passed++;
  } else {
    console.error('  ❌ ' + msg);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + ' (期望 ' + expected + ', 实际 ' + actual + ')');
}

function assertDeepEqual(actual, expected, msg) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, msg + (ok ? '' : ' (期望 ' + JSON.stringify(expected) + ', 实际 ' + JSON.stringify(actual) + ')'));
}

console.log('\n═══════════════════════════════════════');
console.log('  里德-所罗门核心算法测试');
console.log('═══════════════════════════════════════\n');

// ── 1. GF(256) 乘法/逆元 ──
console.log('【1】GF(256) 运算正确性');

// 0 * 任意 = 0
assertEqual(RS.gfMul(0, 5), 0, 'gfMul(0, 5) = 0');
assertEqual(RS.gfMul(5, 0), 0, 'gfMul(5, 0) = 0');

// 1 * a = a
assertEqual(RS.gfMul(1, 123), 123, 'gfMul(1, 123) = 123');

// a * a^(-1) = 1
var a = 42;
assertEqual(RS.gfMul(a, RS.gfInv(a)), 1, 'gfMul(42, gfInv(42)) = 1');
a = 200;
assertEqual(RS.gfMul(a, RS.gfInv(a)), 1, 'gfMul(200, gfInv(200)) = 1');

// 交换律
assertEqual(RS.gfMul(3, 7), RS.gfMul(7, 3), 'gfMul 交换律 3*7 = 7*3');

// 幂运算
assertEqual(RS.gfPow(2, 0), 1, 'gfPow(2, 0) = 1');
assertEqual(RS.gfPow(3, 1), 3, 'gfPow(3, 1) = 3');

// 除法
assertEqual(RS.gfDiv(6, 2), RS.gfMul(6, RS.gfInv(2)), 'gfDiv(6,2) = gfMul(6, gfInv(2))');

// 已知向量：3 * 7 在 GF(256) with 0x11B 下的结果
// 3 = x+1, 7 = x^2+x+1, (x+1)(x^2+x+1) = x^3+1 = 9
assertEqual(RS.gfMul(3, 7), 9, 'gfMul(3, 7) = 9');

// 0x57 * 0x83 = 0xC1 (AES spec 已知值)
assertEqual(RS.gfMul(0x57, 0x83), 0xC1, 'gfMul(0x57, 0x83) = 0xC1 (AES)');

// 加法就是异或
assertEqual(RS.gfAdd(0x57, 0x83), 0xD4, 'gfAdd(0x57, 0x83) = 0xD4');

// ── 2. 编码后无损坏 -> 解码还原 ──
console.log('\n【2】编码后无损坏 -> 解码还原原始数据');

var data = [10, 20, 30, 40, 50];
var nParity = 4;
var codeword = RS.rsEncode(data, nParity);
assertEqual(codeword.length, data.length + nParity, '码字长度 = 数据 + 校验');

// 无擦除恢复
var result = RS.rsEraseDecode(codeword, [], nParity);
assert(result.success, '无擦除 -> 恢复成功');
assertDeepEqual(result.recovered, codeword, '恢复结果 = 原始码字');

// 数据部分与原始一致
assertDeepEqual(result.recovered.slice(0, data.length), data, '数据部分 = 原始数据');

// ── 3. 擦除 <= 校验数 -> 完整恢复 ──
console.log('\n【3】擦除 <= 校验数 -> 能完整恢复');

var data2 = [1, 2, 3, 4, 5, 6, 7, 8];
var nParity2 = 5;
var cw2 = RS.rsEncode(data2, nParity2);

// 擦除 3 个（< 5）
var erasures3 = [1, 4, 7];
var damaged3 = cw2.slice();
damaged3[1] = null;
damaged3[4] = null;
damaged3[7] = null;
var res3 = RS.rsEraseDecode(damaged3, erasures3, nParity2);
assert(res3.success, '擦除 3 个（< 5）-> 恢复成功');
assertDeepEqual(res3.recovered, cw2, '恢复码字 = 原始码字');

// 擦除 4 个（< 5）
var erasures4 = [0, 2, 5, 9];
var damaged4 = cw2.slice();
for (var i4 = 0; i4 < erasures4.length; i4++) damaged4[erasures4[i4]] = null;
var res4 = RS.rsEraseDecode(damaged4, erasures4, nParity2);
assert(res4.success, '擦除 4 个（< 5）-> 恢复成功');
assertDeepEqual(res4.recovered, cw2, '恢复码字 = 原始码字');

// ── 4. 擦除 > 校验数 -> 无法恢复 ──
console.log('\n【4】擦除 > 校验数 -> 明确返回无法恢复');

var erasures6 = [0, 1, 2, 3, 4, 5];
var damaged6 = cw2.slice();
for (var i6 = 0; i6 < erasures6.length; i6++) damaged6[erasures6[i6]] = null;
var res6 = RS.rsEraseDecode(damaged6, erasures6, nParity2);
assert(!res6.success, '擦除 6 个（> 5）-> 恢复失败');
assert(res6.recovered === null, '返回 recovered = null');

// ── 5. 边界：擦除数恰好等于上限 ──
console.log('\n【5】边界：擦除数恰好等于上限 -> 仍成功');

var erasures5 = [0, 1, 2, 3, 4];
var damaged5 = cw2.slice();
for (var i5 = 0; i5 < erasures5.length; i5++) damaged5[erasures5[i5]] = null;
var res5 = RS.rsEraseDecode(damaged5, erasures5, nParity2);
assert(res5.success, '擦除 5 个（= 5）-> 恢复成功');
assertDeepEqual(res5.recovered, cw2, '恢复码字 = 原始码字');

// ── 6. 文本编解码端到端 ──
console.log('\n【6】文本 <-> 符号数组转换');

var text = 'Hello 世界';
var symbols = RS.textToSymbols(text);
var back = RS.symbolsToText(symbols);
assertEqual(back, text, '文本转换往返一致');

// 文本编码 -> RS 编码 -> 损坏 -> 恢复 -> 还原文本
var textData = RS.textToSymbols('RS码真牛');
var textCw = RS.rsEncode(textData, 4);
var textDamaged = textCw.slice();
textDamaged[0] = null;
textDamaged[3] = null;
var textRes = RS.rsEraseDecode(textDamaged, [0, 3], 4);
assert(textRes.success, '文本数据损坏恢复成功');
var restoredText = RS.symbolsToText(textRes.recovered.slice(0, textData.length));
assertEqual(restoredText, 'RS码真牛', '恢复后的文本 = 原始文本');

// ── 7. 多项式运算 ──
console.log('\n【7】多项式运算');

// g(x) = (x+1)(x+α) = x^2 + (1+α)x + α
var g2 = RS.genGeneratorPoly(2);
assertEqual(g2.length, 3, '2 校验的生成多项式长度 = 3');
// g(1) 应该 = 0，因为 g(x) 有 (x-1) 因子
var evalAt1 = RS.polyEval(g2, 1);
assertEqual(evalAt1, 0, 'g(α^0) = g(1) = 0');

// ── 8. 阈值模型 ──
console.log('\n【8】阈值实验模型');

assertEqual(RS.recoveryRate(0.3, 0.2), 1.0, '冗余 30% 损坏 20% -> 成功');
assertEqual(RS.recoveryRate(0.3, 0.3), 1.0, '冗余 30% 损坏 30% -> 成功（边界相等，与擦除恢复口径一致）');
assertEqual(RS.recoveryRate(0.3, 0.32), 0.0, '冗余 30% 损坏 32% -> 失败（越过阈值）');
assertEqual(RS.recoveryRate(0.3, 0.5), 0.0, '冗余 30% 损坏 50% -> 失败');

var curve = RS.thresholdCurve(0.25, 10);
assertEqual(curve.labels.length, 11, '曲线采样 11 个点');
assertEqual(curve.data[0], 1.0, '损坏 0% -> 100% 成功');
assertEqual(curve.data[10], 0.0, '损坏 100% -> 0% 成功');

// ── 结果统计 ──
console.log('\n═══════════════════════════════════════');
console.log('  通过: ' + passed + ' / 失败: ' + failed);
console.log('═══════════════════════════════════════');
if (failed > 0) {
  process.exit(1);
}
