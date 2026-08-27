'use strict';

var LZW = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + '（期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual) + '）');
}

// ── 工具函数 ──

assertEqual(LZW.utf8Length('a'), 1, 'utf8Length: ASCII 1 字节');
assertEqual(LZW.utf8Length('中'), 3, 'utf8Length: 中文 3 字节');
assertEqual(LZW.utf8Length('😀'), 4, 'utf8Length: emoji 4 字节');
assertEqual(LZW.utf8Length('a中😀'), 8, 'utf8Length: 混合 1+3+4=8 字节');

assertEqual(LZW.toSymbols('😀a').length, 2, 'toSymbols: 代理对拆成 1 个符号');
assertEqual(LZW.toSymbols('😀a')[0], '😀', 'toSymbols: 代理对符号内容正确');

assertEqual(LZW.codeWidth(1), 1, 'codeWidth: 1 条也用 1 位');
assertEqual(LZW.codeWidth(2), 1, 'codeWidth: 2 条 1 位');
assertEqual(LZW.codeWidth(3), 2, 'codeWidth: 3 条 2 位');
assertEqual(LZW.codeWidth(8), 3, 'codeWidth: 8 条 3 位');
assertEqual(LZW.codeWidth(9), 4, 'codeWidth: 9 条 4 位');
assertEqual(LZW.codeWidth(16), 4, 'codeWidth: 16 条 4 位（2 的幂不能多算 1 位）');
assertEqual(LZW.codeWidth(17), 5, 'codeWidth: 17 条 5 位');
assertEqual(LZW.codeWidth(32), 5, 'codeWidth: 32 条 5 位');
assertEqual(LZW.codeWidth(256), 8, 'codeWidth: 256 条 8 位');
assertEqual(LZW.codeWidth(4096), 12, 'codeWidth: 4096 条 12 位');

// ── 编解码往返（无损的核心保证） ──

var ROUNDTRIP_CASES = [
  ['你好，你好，你好', '中文重复短语'],
  ['ABABABAB', '经典 ABA 模式'],
  ['ABABABA', 'KwKwK 特殊分支输入'],
  ['aaaaa', '全同字符'],
  ['a', '单字符'],
  ['所谓伊人，在水一方。所谓伊人，在水一方。溯洄从之，道阻且长；溯洄从之，道阻且长。', '默认示例文本'],
  ['1234567890 1234567890 1234567890', '数字与空格重复'],
  ['😀😀😀😀😀', 'emoji 重复'],
  ['To be or not to be, that is the question.', '英文经典句'],
  ['', '空输入']
];

ROUNDTRIP_CASES.forEach(function (tc) {
  var text = tc[0];
  var name = tc[1];
  var symbols = LZW.toSymbols(text);
  var enc = LZW.encode(symbols);
  var dec = LZW.decode(enc.alphabet, enc.codes);
  assertEqual(dec.text, text, '往返无损: ' + name);
  assertEqual(enc.symbolCount, symbols.length, '往返无损: ' + name + ' 符号数统计');
  assertEqual(dec.symbols.length, symbols.length, '往返无损: ' + name + ' 解码符号数与输入一致');
});

// ── 字典一致性（编码器/解码器重建同一个字典的保证） ──

(function () {
  var enc = LZW.encode(LZW.toSymbols('ABABABAB'));
  assertEqual(enc.alphabet.join(''), 'AB', 'ABABABAB 字母表 = A,B');
  assertEqual(enc.codes.join(','), '0,1,2,4,1', 'ABABABAB 编号流 = 0,1,2,4,1（ABA 已被字典收录）');
  assertEqual(enc.initialDictSize, 2, 'ABABABAB 起手字典 2 条');
  assertEqual(enc.finalDictSize, 6, 'ABABABAB 学完 6 条');
  assertEqual(enc.steps.length, enc.codes.length, '每一步对应一个输出编号');
  for (var i = 0; i < enc.steps.length; i++) {
    var st = enc.steps[i];
    if (st.flush) continue;
    assertEqual(st.newCode, enc.initialDictSize + i, '第 ' + i + ' 步新词条编号连续');
    var expectedKey = st.matched.concat([st.symbol]).join('');
    assertEqual(st.newKey.join(''), expectedKey, '第 ' + i + ' 步新词条 = 命中词 + 新符号');
  }
})();

// KwKwK：解码器必须在词条刚入字典时就能用（ABABABA → 0,1,2,4）
(function () {
  var enc = LZW.encode(LZW.toSymbols('ABABABA'));
  assertEqual(enc.codes.join(','), '0,1,2,4', 'ABABABA 编号流 = 0,1,2,4（最后一个 4 就是刚学的词条）');
  var dec = LZW.decode(enc.alphabet, enc.codes);
  assertEqual(dec.text, 'ABABABA', 'KwKwK 特殊分支解码正确');
})();

// ── 压缩比：重复数据缩水，随机数据几乎不动 ──

(function () {
  var text = '';
  for (var i = 0; i < 40; i++) text += '草原上的风';
  var enc = LZW.encode(LZW.toSymbols(text));
  assert(enc.totalBytes < enc.symbolCount, '重复文本压缩后小于原始（' + enc.totalBytes + ' < ' + enc.symbolCount + '）');
  var dec = LZW.decode(enc.alphabet, enc.codes);
  assertEqual(dec.text, text, '重复文本往返无损');
})();

(function () {
  // 伪随机字节（Park-Miller 取高位，低 8 位的 LCG 有周期，不是真随机）
  var seed = 12345;
  var buf = [];
  for (var i = 0; i < 1024; i++) {
    seed = (seed * 48271) % 2147483647;
    buf.push(String(Math.floor(seed / 2147483647 * 256)));
  }
  var enc = LZW.encode(buf);
  var round = LZW.decode(enc.alphabet, enc.codes);
  assertEqual(round.symbols.length, buf.length, '噪声解码符号数一致');
  assert(round.text === buf.join(''), '噪声往返无损');
  assert(enc.totalBytes >= enc.symbolCount, '随机数据压不动（' + enc.totalBytes + ' ≥ ' + enc.symbolCount + '，鸽巢原理）');
})();

// ── 匹配区间与读头位置 ──

(function () {
  var enc = LZW.encode(LZW.toSymbols('ABABABAB'));
  var last = enc.steps[enc.steps.length - 1];
  assertEqual(last.matchedEnd, 8, '收尾步覆盖到末尾');
  for (var i = 0; i < enc.steps.length; i++) {
    var st = enc.steps[i];
    assert(st.matchedStart >= 0 && st.matchedEnd <= 8, '第 ' + i + ' 步区间合法');
    assert(st.matchedEnd >= st.matchedStart, '第 ' + i + ' 步区间不反转');
    assertEqual(st.matchedEnd - st.matchedStart, st.matched.length, '第 ' + i + ' 步区间长度 = 命中词长度');
  }
})();

// ── 损坏编号必须报错 ──

(function () {
  var enc = LZW.encode(LZW.toSymbols('ABC'));
  var bad = enc.codes.slice();
  bad[1] = 999;
  var threw = false;
  try {
    LZW.decode(enc.alphabet, bad);
  } catch (e) {
    threw = true;
  }
  assert(threw, '非法编号解码抛错');
})();

// ── 数字符号（像素/字节模式，调色板式字母表） ──

(function () {
  var pixels = [];
  for (var i = 0; i < 200; i++) pixels.push(String(i % 16));
  var enc = LZW.encode(pixels, { byteAlphabet: true });
  var dec = LZW.decode(enc.alphabet, enc.codes);
  assertEqual(dec.text, pixels.join(''), '像素级符号往返无损');
  assertEqual(enc.alphabetBytes, 16, '调色板式字母表：16 级色板 = 16 字节');
  assert(enc.totalBytes < 200, '像素流有明显压缩（' + enc.totalBytes + ' < 200）');
})();

// ── 多字符符号（如 "126" "64"）不能发生边界歧义 ──

(function () {
  var symbols = ['126', '0', '0', '0', '64', '0', '64', '128', '0', '0', '64', '0', '0'];
  var enc = LZW.encode(symbols);
  var dec = LZW.decode(enc.alphabet, enc.codes);
  assertEqual(dec.text, symbols.join(''), '多字符符号往返无损（符号边界无歧义）');
})();

console.log('\n共 ' + (passed + failed) + ' 项断言：通过 ' + passed + '，失败 ' + failed);
process.exit(failed > 0 ? 1 : 0);
