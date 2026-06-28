/**
 * HTTP 文本 vs 二进制传输 — engine.js 单元测试
 * 运行：node pages/http-binary-vs-text/engine.test.js
 */

var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message + ' (期望: ' + JSON.stringify(expected) + ', 实际: ' + JSON.stringify(actual) + ')');
  }
}

// ── formatHex ──
console.log('\n=== formatHex ===');

(function testFormatHexBasic() {
  var bytes = [0x48, 0x65, 0x6c, 0x6c, 0x6f]; // "Hello"
  var result = engine.formatHex(bytes, 16);
  // 验证基本结构：以offset开头、包含hex和ascii部分
  assert(result.indexOf('00000000:') === 0, 'hex dump 以 offset 开头');
  assert(result.indexOf('48 65 6c 6c 6f') > 0, '包含正确的hex值');
  assert(result.indexOf('|Hello') > 0, '包含ASCII表示');
})();

(function testFormatHexMultiLine() {
  var bytes = [];
  for (var i = 0; i < 20; i++) { bytes.push(i + 32); }
  var result = engine.formatHex(bytes, 8);
  var lines = result.split('\n');
  assertEqual(lines.length, 3, '20字节按8字节分行应为3行');
})();

(function testFormatHexEmptyArray() {
  var result = engine.formatHex([], 16);
  assertEqual(result, '', '空数组返回空字符串');
})();

(function testFormatHexSingleByte() {
  var result = engine.formatHex([0x00], 16);
  assert(result.indexOf('00000000:') === 0, '0x00: 以 offset 开头');
  // "00" hex值出现在offset之后的位置
  assert(result.indexOf('00', 10) > 0, '0x00: 包含hex值00');
  assert(result.indexOf('.') > 0, '0x00: 不可打印字符显示为点');
})();

(function testFormatHexHighByte() {
  var result = engine.formatHex([0xff], 16);
  assert(result.indexOf('ff') > 0, '0xFF: 包含hex值');
})();

// ── formatBytes ──
console.log('\n=== formatBytes ===');

(function testFormatBytesB() {
  assertEqual(engine.formatBytes(0), '0 B', '0 字节');
  assertEqual(engine.formatBytes(500), '500 B', '500 字节');
  assertEqual(engine.formatBytes(1023), '1023 B', '1023 字节');
})();

(function testFormatBytesKB() {
  assertEqual(engine.formatBytes(1024), '1.0 KB', '1024 字节 = 1.0 KB');
  assertEqual(engine.formatBytes(1536), '1.5 KB', '1536 字节 = 1.5 KB');
  assertEqual(engine.formatBytes(1048575), '1024.0 KB', '接近1MB');
})();

(function testFormatBytesMB() {
  assertEqual(engine.formatBytes(1048576), '1.00 MB', '1048576 字节 = 1.00 MB');
  assertEqual(engine.formatBytes(2097152), '2.00 MB', '2097152 字节 = 2.00 MB');
})();

// ── getByteLength ──
console.log('\n=== getByteLength ===');

(function testGetByteLengthASCII() {
  var len = engine.getByteLength('hello');
  assertEqual(len, 5, 'ASCII 5字符 = 5字节');
})();

(function testGetByteLengthChinese() {
  var len = engine.getByteLength('你好');
  // UTF-8 中每个中文字符3字节
  assertEqual(len, 6, '中文"你好" = 6字节（UTF-8）');
})();

(function testGetByteLengthEmpty() {
  assertEqual(engine.getByteLength(''), 0, '空字符串 = 0字节');
})();

(function testGetByteLengthEmoji() {
  var len = engine.getByteLength('🚀');
  assert(len === 4, '🚀 emoji = 4字节（UTF-8）');
})();

// ── benchmark ──
console.log('\n=== benchmark ===');

(function testBenchmarkReturnsObject() {
  var result = engine.benchmark(function () { var x = 0; for (var i = 0; i < 1000; i++) { x += i; } }, 5);
  assert(typeof result.avg === 'number', 'benchmark 返回 avg 数字');
  assert(typeof result.min === 'number', 'benchmark 返回 min 数字');
  assert(typeof result.max === 'number', 'benchmark 返回 max 数字');
  assert(result.min <= result.avg && result.avg <= result.max, 'min <= avg <= max');
})();

(function testBenchmarkRunsCorrectCount() {
  var callCount = 0;
  engine.benchmark(function () { callCount++; }, 7);
  assertEqual(callCount, 7, 'benchmark 执行了指定次数');
})();

// ── gzipSize ──
console.log('\n=== gzipSize ===');

(function testGzipSizePakoNotAvailable() {
  // Node.js 环境通常没有 pako 全局变量，应返回 0
  var result = engine.gzipSize('hello');
  assert(result === 0, 'pako 不可用时返回 0');
})();

(function testGzipSizeNullInput() {
  var result = engine.gzipSize(null);
  assert(result === 0, 'null 输入返回 0');
})();

// ── 结果汇总 ──
console.log('\n========================================');
console.log('  通过: ' + passed + '  失败: ' + failed);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
