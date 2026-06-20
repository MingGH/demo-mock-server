/*
 * 单元测试：带图 Markdown 三种分发方案的字节计算与 ZIP 生成
 * 运行: node pages/markdown-selfcontained/markdown-selfcontained.test.js
 */
var P = require('./packer.js');
var SAMPLE = require('./samples.js').SAMPLE;

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  \u2713 ' + msg); }
  else { failed++; console.error('  \u2717 ' + msg); }
}
function eq(a, b, msg) { assert(a === b, msg + ' (got ' + a + ', expected ' + b + ')'); }

console.log('\n[base64 长度公式]');
eq(P.base64Len(3), 4, '3 字节 -> 4 字符');
eq(P.base64Len(1), 4, '1 字节 -> 4 字符（含 padding）');
eq(P.base64Len(88451), 117936, 'arch.png 88451 字节 -> 117936 字符');
// base64 对二进制的固定开销约 +33%
var ov = P.base64Len(274279) / 274279;
assert(ov > 1.33 && ov < 1.34, 'base64 开销约 +33% (' + ((ov - 1) * 100).toFixed(1) + '%)');

console.log('\n[CRC32 已知向量]');
// "123456789" 的 CRC32 标准值 0xCBF43926
eq(P.crc32(P.utf8Bytes('123456789')), 0xCBF43926, 'CRC32("123456789") = 0xCBF43926');

console.log('\n[样例数据完整性]');
assert(SAMPLE.images.length === 3, '样例含 3 张图');
SAMPLE.images.forEach(function (im) {
  assert(im.b64 && im.b64.length > 0, im.name + ' 有 base64 数据');
  assert(SAMPLE.markdown.indexOf('(' + im.name + ')') !== -1, 'markdown 引用了 ' + im.name);
});

console.log('\n[ZIP 生成正确性]');
var zip = P.buildStoreZip([{ name: 'a.txt', data: P.utf8Bytes('hello') }]);
eq(zip[0], 0x50, 'ZIP 以 PK 开头 (0x50)');
eq(zip[1], 0x4b, 'ZIP 第二字节 0x4b');
assert(zip.length > 5, 'ZIP 比原始数据大（含头部）');

console.log('\n[三方案字节计算]');
var r = P.computeReport(SAMPLE);
var s = r.strategies;
console.log('    原始图片合计: ' + r.rawImageBytes + ' 字节');
console.log('    markdown 正文: ' + r.mdBytes + ' 字节');
console.log('    A. ZIP        : ' + s.zip.bytes + ' 字节');
console.log('    B. base64-md  : ' + s.base64md.bytes + ' 字节');
console.log('    C. 自包含 HTML: ' + s.selfHtml.bytes + ' 字节');

assert(s.zip.bytes < s.base64md.bytes, 'ZIP 体积 < base64-md（无 base64 膨胀）');
assert(s.zip.bytes < s.selfHtml.bytes, 'ZIP 体积 < 自包含 HTML');
// base64 膨胀让单文件方案比 ZIP 大约 1.33x
var ratio = s.base64md.bytes / s.zip.bytes;
assert(ratio > 1.3 && ratio < 1.4, 'base64-md 约为 ZIP 的 1.33x (' + ratio.toFixed(2) + 'x)');

console.log('\n[自包含 HTML 内容正确]');
var html = P.buildSelfContainedHtml(SAMPLE);
assert(html.indexOf('<!DOCTYPE html>') === 0, '以 DOCTYPE 开头');
assert(html.indexOf('data:image/png;base64,') !== -1, '图片已转 data URI 内嵌');
assert(html.indexOf('assets/') === -1, '不再引用外部 assets 路径');
eq((html.match(/data:image\/png;base64,/g) || []).length, 3, '3 张图全部内嵌');

console.log('\n[base64 内嵌 markdown 正确]');
var bmd = P.buildBase64Markdown(SAMPLE);
assert(bmd.indexOf('](data:image/png;base64,') !== -1, '图片引用替换为 data URI');
assert(bmd.indexOf('](arch.png)') === -1, '原始相对路径已被替换');

console.log('\n[定性属性符合论点]');
assert(s.zip.textDiff === true && s.base64md.textDiff === false, 'ZIP 保留可 diff，base64-md 丢失');
assert(s.selfHtml.openOnDblClick === true, '自包含 HTML 双击即看');
assert(s.zip.openOnDblClick === false, 'ZIP 需先解压');

console.log('\n' + '-'.repeat(42));
console.log('总计: ' + (passed + failed) + ' / 通过: ' + passed + (failed ? ' / 失败: ' + failed : ''));
if (failed > 0) process.exit(1);
console.log('全部通过 \u2713');
