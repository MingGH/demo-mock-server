// ── 压缩极限 Demo 单元测试（node pages/compression-limit/engine.test.js）──
var path = require('path');
var CE = require(path.join(__dirname, 'engine.js'));

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + '（实际 ' + actual + '，期望 ' + expected + ' ± ' + tol + '）');
}

function strBytes(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}

// ── 熵 ──

(function () {
  var constant = [];
  for (var i = 0; i < 1000; i++) constant.push(65);
  assert(CE.entropyBitsPerByte(constant) === 0, '全是同一个字节时熵为 0');

  var all = [];
  for (var j = 0; j < 256; j++) { all.push(j); all.push(j); }
  assertClose(CE.entropyBitsPerByte(all), 8, 1e-9, '256 种字节均匀出现时熵恰为 8');

  var rnd = CE.mulberry32Bytes(65536, 12345);
  var h = CE.entropyBitsPerByte(rnd);
  assert(h > 7.5 && h <= 8, '伪随机 64KB 字节熵接近 8（实际 ' + h.toFixed(3) + '）');

  var text = strBytes('the quick brown fox jumps over the lazy dog. ');
  var corpus = [];
  for (var k = 0; k < 500; k++) {
    for (var m = 0; m < text.length; m++) corpus.push(text[m]);
  }
  var ht = CE.entropyBitsPerByte(corpus);
  assert(ht > 3.5 && ht < 5.5, '自然语言样本熵在 3.5~5.5 之间（实际 ' + ht.toFixed(3) + '）');

  assert(CE.entropyBitsPerByte([]) === 0, '空输入熵为 0');
})();

// ── 格式化 ──

assert(CE.formatInt(9216) === '9,216', 'formatInt 千分位');
assert(CE.formatInt(0) === '0', 'formatInt 零');
assert(CE.formatBytes(999) === '999 B', 'formatBytes 字节级');
assert(CE.formatBytes(65536) === '64.0 KB', 'formatBytes KB');
assert(CE.formatBytes(205095) === '200.3 KB', 'formatBytes KB 进位');
assert(CE.formatBytes(1048576) === '1.00 MB', 'formatBytes MB');

// ── 百分比 ──

assertClose(CE.pctChange(9216, 3984), -56.77, 0.05, 'pctChange 压缩为负');
assertClose(CE.pctChange(3984, 4005), 0.53, 0.05, 'pctChange 小幅膨胀');
assert(CE.pctChange(0, 10) === 0, 'pctChange 零除保护');
assert(CE.formatPct(-56.77) === '-56.8%', 'formatPct 一位小数');
assert(CE.formatPct(0.53) === '+0.53%', 'formatPct 小于 1 用两位小数');
assert(CE.formatPct(0) === '0.0%', 'formatPct 零');

// ── hexdump ──

(function () {
  var pngHead = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  var lines = CE.hexdumpLines(pngHead, 1);
  assert(lines.length === 1, 'hexdump 行数正确');
  assert(lines[0].indexOf('89 50 4e 47 0d 0a 1a 0a') !== -1, 'hexdump 十六进制列正确');
  assert(lines[0].indexOf('PNG') !== -1, 'hexdump ASCII 列包含 PNG');
  assert(lines[0].indexOf('00000000') === 0, 'hexdump 偏移从 00000000 开始');

  var padded = CE.hexdumpLines([0x41], 1)[0];
  assert(padded.indexOf('41') !== -1 && padded.replace(/41/g, '').indexOf('4') === -1, 'hexdump 不足 16 字节补空位');
})();

// ── 连续膨胀判定 ──

assert(CE.consecutiveGrowthRounds([{ size: 100 }, { size: 50 }, { size: 52 }, { size: 54 }]) === 2, '连续膨胀计数：尾部 2 轮');
assert(CE.consecutiveGrowthRounds([{ size: 100 }, { size: 50 }]) === 0, '持续变小时膨胀计数为 0');
assert(CE.consecutiveGrowthRounds([{ size: 100 }]) === 0, '只有原始文件时膨胀计数为 0');

// ── 鸽笼原理 ──

(function () {
  var st = CE.pigeonholeStats(2, 1);
  assert(st.inputCount === 65536, '2 字节文件空间 = 65,536');
  assert(st.slotCount === 256, '1 字节文件空间 = 256');
  assert(st.minCollisions === 65280, '至少 65,280 个文件发生碰撞');

  var big = CE.pigeonholeStats(4096, 1);
  assert(big.inputCount === null && big.slotCount === null, '超出浮点安全范围返回 null');
  assert(big.inputBits === 32768, 'inputBits = 8 x 字节数');
})();

// ── 2^N 展示 ──

assert(CE.pow2Label(16) === '65,536', 'pow2Label 小指数给数字');
assert(CE.pow2Label(8) === '256', 'pow2Label 2^8');
assert(CE.pow2Label(80) === '2^80', 'pow2Label 大指数给 2^N');
assert(CE.pow2Label(73728) === '2^73,728', 'pow2Label 巨大指数千分位');

// ── 确定性随机 ──

(function () {
  var a = CE.mulberry32Bytes(100, 42);
  var b = CE.mulberry32Bytes(100, 42);
  var same = true;
  for (var i = 0; i < 100; i++) { if (a[i] !== b[i]) { same = false; break; } }
  assert(same, '同种子生成相同序列');

  var c = CE.mulberry32Bytes(100, 43);
  var diff = a[0] !== c[0] || a[1] !== c[1];
  assert(diff, '不同种子生成不同序列');

  var ok = true;
  for (var j = 0; j < a.length; j++) { if (a[j] < 0 || a[j] > 255) { ok = false; break; } }
  assert(ok, '输出均为合法字节（0~255）');

  assert(CE.mulberry32Bytes(10, 0).length === 10, '零种子不产生全零死锁');
})();

// ── 常量 ──

assert(CE.GZIP_OVERHEAD_BYTES === 18, 'gzip 固定开销 = 18 字节（10 头 + 8 尾）');

// ── 汇总 ──

console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
if (failed > 0) process.exit(1);
