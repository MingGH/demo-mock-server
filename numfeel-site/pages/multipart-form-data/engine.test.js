/**
 * multipart/form-data — engine.js 单元测试
 * 运行：node pages/multipart-form-data/engine.test.js
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

function assertContains(haystack, needle, message) {
  if (haystack.indexOf(needle) >= 0) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message + ' (未找到: ' + needle + ')');
  }
}

// ── utf8ByteLength ──
console.log('\n=== utf8ByteLength ===');
assertEqual(engine.utf8ByteLength('hello'), 5, 'ASCII 5 字节');
assertEqual(engine.utf8ByteLength('你好'), 6, '中文 6 字节');
assertEqual(engine.utf8ByteLength(''), 0, '空串 0 字节');

// ── encodeRawBody ──
console.log('\n=== encodeRawBody ===');
(function () {
  var raw = engine.encodeRawBody('abc');
  assertEqual(raw.contentType, 'application/octet-stream', '裸 body 是 octet-stream');
  assertEqual(raw.bytes, 3, '裸 body 字节数');
})();

// ── encodeMultipart 结构 ──
console.log('\n=== encodeMultipart ===');
(function () {
  var out = engine.encodeMultipart(
    [{ name: 'note', value: 'hi' }],
    [{ name: 'file', filename: 'a.txt', contentType: 'text/plain', value: 'CONTENT' }],
    'bB'
  );
  assertEqual(out.boundary, 'bB', '使用自定义 boundary');
  assertEqual(out.partCount, 2, 'part 数量 = 文件 + 字段');
  assertContains(out.text, '--bB\r\n', '以 boundary 开头');
  assertContains(out.text, 'Content-Disposition: form-data; name="note"', '字段头带 name');
  assertContains(out.text, 'Content-Disposition: form-data; name="file"; filename="a.txt"', '文件头带 name+filename');
  assertContains(out.text, 'Content-Type: text/plain', '文件 part 带 Content-Type');
  assertContains(out.text, '--bB--\r\n', '以闭合 boundary 结尾');
  assertEqual(out.contentType, 'multipart/form-data; boundary=bB', 'contentType 携带 boundary');
})();

// ── decodeMultipart 往返 ──
console.log('\n=== decodeMultipart 往返 ===');
(function () {
  var fields = [{ name: 'note', value: '加油' }, { name: 'num', value: '42' }];
  var files = [
    { name: 'fileA', filename: 'a.txt', contentType: 'text/plain', value: 'HELLO' },
    { name: 'fileB', filename: 'b.bin', contentType: 'application/octet-stream', value: '\u0000\u0001' }
  ];
  var packed = engine.encodeMultipart(fields, files, 'xx');
  var decoded = engine.decodeMultipart(packed.text, 'xx');

  assertEqual(decoded.fields.length, 2, '解出 2 个字段');
  assertEqual(decoded.files.length, 2, '解出 2 个文件');
  assertEqual(decoded.fields[0].value, '加油', '字段内容无损');
  assertEqual(decoded.fields[1].value, '42', '字段内容无损');
  assertEqual(decoded.files[0].filename, 'a.txt', '文件名无损');
  assertEqual(decoded.files[0].value, 'HELLO', '文件内容无损');
  assertEqual(decoded.files[0].contentType, 'text/plain', 'Content-Type 无损');
  assertEqual(decoded.files[1].filename, 'b.bin', '第二个文件名无损');
  assertEqual(decoded.files[1].value, '\u0000\u0001', '二进制文件内容无损');
})();

// ── 单文件 + 单字段 ──
console.log('\n=== decode 单文件单字段 ===');
(function () {
  var packed = engine.encodeMultipart([{ name: 'n', value: 'v' }], [], 'single');
  var decoded = engine.decodeMultipart(packed.text, 'single');
  assertEqual(decoded.fields.length, 1, '无文件时只解出字段');
  assertEqual(decoded.fields[0].name, 'n', '字段名');
  assertEqual(decoded.files.length, 0, '无文件');
})();

// ── parseContentDisposition ──
console.log('\n=== parseContentDisposition ===');
(function () {
  var p = engine.parseContentDisposition('Content-Disposition: form-data; name="file"; filename="a.txt"');
  assertEqual(p.type, 'form-data', 'type 为 form-data');
  assertEqual(p.name, 'file', 'name 解析');
  assertEqual(p.filename, 'a.txt', 'filename 解析（去引号）');
  var q = engine.parseContentDisposition('Content-Disposition: form-data; name="note"');
  assertEqual(q.filename, undefined, '普通字段无 filename');
})();

// ── boundaryOf ──
console.log('\n=== boundaryOf ===');
assertEqual(engine.boundaryOf('multipart/form-data; boundary=abc'), 'abc', '从 Content-Type 取 boundary');
assertEqual(engine.boundaryOf('application/json'), null, '非 multipart 返回 null');
assertEqual(engine.boundaryOf(null), null, '空串返回 null');

// ── tokenize ──
console.log('\n=== tokenize ===');
(function () {
  var packed = engine.encodeMultipart([{ name: 'n', value: 'v' }], [], 'tk');
  var tokens = engine.tokenize(packed.text, 'tk');
  var kinds = tokens.map(function (t) { return t.kind; });
  assert(kinds.indexOf('boundary') >= 0, '包含 boundary token');
  assert(kinds.indexOf('header') >= 0, '包含 header token');
  assert(kinds.indexOf('payload') >= 0, '包含 payload token');
  var hasClose = tokens.some(function (t) { return t.kind === 'boundary' && t.text === '--tk--'; });
  assert(hasClose, '包含闭合 boundary token --tk--');
})();

// ── formatBytes ──
console.log('\n=== formatBytes ===');
assertEqual(engine.formatBytes(500), '500 B', '500 B');
assertEqual(engine.formatBytes(1024), '1.0 KB', '1 KB');
assertEqual(engine.formatBytes(1048576), '1.00 MB', '1 MB');

console.log('\n========================================');
console.log('  通过: ' + passed + '  失败: ' + failed);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);