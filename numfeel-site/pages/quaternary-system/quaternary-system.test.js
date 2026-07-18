/**
 * 四进制去哪了 - 单元测试
 * 运行命令: node pages/quaternary-system/quaternary-system.test.js
 */

var L = require('./quaternary-system-logic.js');
var fs = require('fs');
var vm = require('vm');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  ✅ ' + msg);
    passed++;
  } else {
    console.log('  ❌ ' + msg);
    failed++;
  }
}

function stringify(v) {
  if (typeof v === 'bigint') return v.toString() + 'n';
  return JSON.stringify(v);
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + ' (实际=' + stringify(actual) + ', 期望=' + stringify(expected) + ')');
}

// ========== 1. 输入解析与转换 ==========
console.log('\n🔢 1. 输入解析与转换');

var parseCases = [
  { input: '0',         expected: 0n },
  { input: '1',         expected: 1n },
  { input: '42',        expected: 42n },
  { input: '255',       expected: 255n },
  { input: '2026',      expected: 2026n },
  { input: '18446744073709551615', expected: 18446744073709551615n }
];

parseCases.forEach(function (c) {
  var result = L.parseDecimalInput(c.input);
  assert(result.ok === true, '解析 "' + c.input + '" 成功');
  assert(result.value === c.expected, '解析 "' + c.input + '" = ' + c.expected);
});

// toBase 验证
assertEqual(L.toBase(0n, 2), '0', '0 的二进制 = 0');
assertEqual(L.toBase(0n, 4), '0', '0 的四进制 = 0');
assertEqual(L.toBase(0n, 16), '0', '0 的十六进制 = 0');
assertEqual(L.toBase(1n, 2), '1', '1 的二进制 = 1');
assertEqual(L.toBase(42n, 2), '101010', '42 的二进制 = 101010');
assertEqual(L.toBase(42n, 16), '2A', '42 的十六进制 = 2A（大写）');

// ========== 2. 2026 精确转换 ==========
console.log('\n🎯 2. 2026 精确转换');

var v2026 = 2026n;
assertEqual(L.toBase(v2026, 2), '11111101010', '2026 二进制 = 11111101010');
assertEqual(L.toBase(v2026, 4), '133222', '2026 四进制 = 133222');
assertEqual(L.toBase(v2026, 8), '3752', '2026 八进制 = 3752');
assertEqual(L.toBase(v2026, 16), '7EA', '2026 十六进制 = 7EA（大写）');

var rep2026 = L.buildRepresentations(v2026);
assertEqual(rep2026.binary.value, '11111101010', 'buildRepresentations 二进制');
assertEqual(rep2026.quaternary.value, '133222', 'buildRepresentations 四进制');
assertEqual(rep2026.octal.value, '3752', 'buildRepresentations 八进制');
assertEqual(rep2026.hexadecimal.value, '7EA', 'buildRepresentations 十六进制');
assertEqual(rep2026.binary.length, 11, '2026 二进制长度 = 11');
assertEqual(rep2026.quaternary.length, 6, '2026 四进制长度 = 6');
assertEqual(rep2026.octal.length, 4, '2026 八进制长度 = 4');
assertEqual(rep2026.hexadecimal.length, 3, '2026 十六进制长度 = 3');

// ========== 3. 255 转换 ==========
console.log('\n🔴 3. 255 转换');

var v255 = 255n;
assertEqual(L.toBase(v255, 4), '3333', '255 四进制 = 3333');
assertEqual(L.toBase(v255, 8), '377', '255 八进制 = 377');
assertEqual(L.toBase(v255, 16), 'FF', '255 十六进制 = FF（大写）');
assertEqual(L.toBase(v255, 2), '11111111', '255 二进制 = 11111111');

// ========== 4. 分组方向与补零 ==========
console.log('\n✂️ 4. 分组方向与补零');

// 2026 二进制 11111101010，2 位分组
var g2 = L.groupBinary('11111101010', 2);
assertEqual(g2.paddedBinary, '011111101010', '2 位分组补零后 = 011111101010');
assertEqual(g2.paddingAdded, 1, '2 位分组补零数 = 1');
assertEqual(g2.groups.length, 6, '2 位分组共 6 组');
assertEqual(g2.groups.join('|'), '01|11|11|10|10|10', '2 位分组结果顺序正确');

var d2 = L.binaryGroupsToDigits(g2.groups, 2);
assertEqual(d2.map(function (d) { return d.digit; }).join(''), '133222', '2 位分组->四进制 = 133222');

// 补零不改变数值：011111101010 == 11111101010 == 2026
assertEqual(BigInt('0b011111101010'), 2026n, '补零后二进制数值不变 = 2026');

// 3 位分组
var g3 = L.groupBinary('11111101010', 3);
assertEqual(g3.paddedBinary, '011111101010', '3 位分组补零后 = 011111101010');
assertEqual(g3.groups.join('|'), '011|111|101|010', '3 位分组结果顺序正确');
var d3 = L.binaryGroupsToDigits(g3.groups, 3);
assertEqual(d3.map(function (d) { return d.digit; }).join(''), '3752', '3 位分组->八进制 = 3752');

// 4 位分组
var g4 = L.groupBinary('11111101010', 4);
assertEqual(g4.paddedBinary, '011111101010', '4 位分组补零后 = 011111101010');
assertEqual(g4.groups.join('|'), '0111|1110|1010', '4 位分组结果顺序正确');
var d4 = L.binaryGroupsToDigits(g4.groups, 4);
assertEqual(d4.map(function (d) { return d.digit; }).join(''), '7EA', '4 位分组->十六进制 = 7EA');

// 255 分组（8 位，不需要补零）
var g255_2 = L.groupBinary('11111111', 2);
assertEqual(g255_2.paddingAdded, 0, '255 二进制 8 位，2 位分组无需补零');
assertEqual(g255_2.groups.join('|'), '11|11|11|11', '255 的 2 位分组 = 11|11|11|11');

// ========== 5. 0 的分组 ==========
console.log('\n0️⃣ 5. 0 的分组不返回空数组');

var g0_2 = L.groupBinary('0', 2);
assert(g0_2.groups.length >= 1, '0 的 2 位分组返回非空数组');
assertEqual(g0_2.groups[0], '00', '0 的 2 位分组第一组 = 00');

var g0_3 = L.groupBinary('0', 3);
assert(g0_3.groups.length >= 1, '0 的 3 位分组返回非空数组');
assertEqual(g0_3.groups[0], '000', '0 的 3 位分组第一组 = 000');

var g0_4 = L.groupBinary('0', 4);
assert(g0_4.groups.length >= 1, '0 的 4 位分组返回非空数组');
assertEqual(g0_4.groups[0], '0000', '0 的 4 位分组第一组 = 0000');

// ========== 6. 非法输入被拒绝 ==========
console.log('\n🚫 6. 非法输入被拒绝');

var invalidCases = ['', '   ', '1.5', '-1', 'abc', '12e3', '1E5', '0x10', '12 34',
  '18446744073709551616', '+5', '1,000', '1\n2'];
invalidCases.forEach(function (input) {
  var result = L.parseDecimalInput(input);
  assert(result.ok === false, '拒绝输入 "' + input.replace(/\n/g, '\\n').replace(/ /g, '·') + '"');
});

// 科学计数法
assert(L.parseDecimalInput('1e10').ok === false, '拒绝科学计数法 1e10');
assert(L.parseDecimalInput('1E10').ok === false, '拒绝科学计数法 1E10');

// ========== 7. 位数公式 ==========
console.log('\n📊 7. 位数公式');

// 32 bit 必须是 32/16/11/8
assertEqual(L.digitsForBitWidth(32, 2), 32, '32 bit 二进制 = 32 位');
assertEqual(L.digitsForBitWidth(32, 4), 16, '32 bit 四进制 = 16 位');
assertEqual(L.digitsForBitWidth(32, 8), 11, '32 bit 八进制 = 11 位');
assertEqual(L.digitsForBitWidth(32, 16), 8, '32 bit 十六进制 = 8 位');

// 8 bit
assertEqual(L.digitsForBitWidth(8, 2), 8, '8 bit 二进制 = 8 位');
assertEqual(L.digitsForBitWidth(8, 4), 4, '8 bit 四进制 = 4 位');
assertEqual(L.digitsForBitWidth(8, 8), 3, '8 bit 八进制 = 3 位');
assertEqual(L.digitsForBitWidth(8, 16), 2, '8 bit 十六进制 = 2 位');

// 16 bit
assertEqual(L.digitsForBitWidth(16, 2), 16, '16 bit 二进制 = 16 位');
assertEqual(L.digitsForBitWidth(16, 4), 8, '16 bit 四进制 = 8 位');
assertEqual(L.digitsForBitWidth(16, 8), 6, '16 bit 八进制 = 6 位');
assertEqual(L.digitsForBitWidth(16, 16), 4, '16 bit 十六进制 = 4 位');

// 64 bit
assertEqual(L.digitsForBitWidth(64, 2), 64, '64 bit 二进制 = 64 位');
assertEqual(L.digitsForBitWidth(64, 4), 32, '64 bit 四进制 = 32 位');
assertEqual(L.digitsForBitWidth(64, 8), 22, '64 bit 八进制 = 22 位');
assertEqual(L.digitsForBitWidth(64, 16), 16, '64 bit 十六进制 = 16 位');

// ========== 8. 分享文案 ==========
console.log('\n📤 8. 分享文案');

var shareText = L.buildShareText(v2026, rep2026, 'https://numfeel.996.ninja/pages/quaternary-system/');
assert(shareText.indexOf('undefined') === -1, '分享文案不含 undefined');
assert(shareText.indexOf('[object Object]') === -1, '分享文案不含 [object Object]');
assert(shareText.indexOf('2026') !== -1, '分享文案包含十进制输入 2026');
assert(shareText.indexOf('11111101010') !== -1, '分享文案包含二进制结果');
assert(shareText.indexOf('133222') !== -1, '分享文案包含四进制结果');
assert(shareText.indexOf('7EA') !== -1, '分享文案包含十六进制结果');
assert(shareText.indexOf('https://numfeel.996.ninja/pages/quaternary-system/') !== -1, '分享文案包含链接');
assert(shareText.indexOf('知乎') === -1, '分享文案不含「知乎」字样');
assert(shareText.indexOf('AI 生成') === -1, '分享文案不含「AI 生成」字样');
assert(shareText.indexOf('草稿') === -1, '分享文案不含「草稿」字样');

// 0 的分享文案也不含 undefined
var share0 = L.buildShareText(0n, L.buildRepresentations(0n), 'https://numfeel.996.ninja/pages/quaternary-system/');
assert(share0.indexOf('undefined') === -1, '0 的分享文案不含 undefined');
assert(share0.indexOf('[object Object]') === -1, '0 的分享文案不含 [object Object]');

// ========== 9. 浏览器全局导出 ==========
console.log('\n🌐 9. 浏览器全局导出可用');

var browserContext = {};
vm.createContext(browserContext);
vm.runInContext(fs.readFileSync(require.resolve('./quaternary-system-logic.js'), 'utf8'), browserContext);
assert(typeof browserContext.QuaternaryLogic !== 'undefined', '浏览器全局导出 QuaternaryLogic 存在');
assert(typeof browserContext.QuaternaryLogic.toBase === 'function', '浏览器全局导出 toBase 函数');
assert(typeof browserContext.QuaternaryLogic.groupBinary === 'function', '浏览器全局导出 groupBinary 函数');
assert(typeof browserContext.QuaternaryLogic.buildRepresentations === 'function', '浏览器全局导出 buildRepresentations 函数');
assertEqual(browserContext.QuaternaryLogic.toBase(2026n, 4), '133222', '浏览器环境下 2026 四进制 = 133222');

// ========== 10. 位权展开 ==========
console.log('\n📐 10. 位权展开');

var expansion = L.getPositionalExpansion(2026n, 4);
assertEqual(expansion.length, 6, '2026 四进制位权展开共 6 位');
assertEqual(expansion[0].digit, '1', '最高位数字 = 1');
assertEqual(expansion[0].position, 5, '最高位位置 = 5');
// 1 * 4^5 = 1024
assertEqual(expansion[0].contribution, 1024n, '最高位贡献 = 1024');
// 各位贡献之和应等于原数
var sum = 0n;
expansion.forEach(function (e) { sum += e.contribution; });
assertEqual(sum, 2026n, '位权展开贡献之和 = 2026');

// ── 汇总 ────────────────────────────────────────────────
console.log('\n────────────────────────────────');
console.log('通过: ' + passed + ' / 失败: ' + failed);
console.log('────────────────────────────────');
if (failed > 0) {
  console.error('❌ 存在失败用例');
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}
