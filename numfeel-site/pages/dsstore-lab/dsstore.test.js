/**
 * dsstore.test.js — 用 `node pages/dsstore-lab/dsstore.test.js` 直接运行
 *
 * 覆盖：
 *   - build → parse 往返一致（文件名、属性、值）
 *   - 头部魔数正确
 *   - 非法输入的健壮性
 *   - 各数据类型（blob / long / ustr / bool / type）编解码
 *   - buildFromNames 便捷方法
 *   - 内部工具函数
 */
var DSStore = require('./dsstore.js');

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}
function eq(a, b, msg) { assert(a === b, msg + '  (期望 ' + b + '，实际 ' + a + ')'); }

// ── 1. 基本往返：文件名清单 ──
(function () {
  var names = ['backup.zip', 'database.sql', 'index.html', '.env', 'admin'];
  var bytes = DSStore.buildFromNames(names);
  assert(bytes instanceof Uint8Array, '构造返回 Uint8Array');

  var r = DSStore.parse(bytes);
  assert(r.ok, '解析成功: ' + (r.error || ''));
  eq(r.files.length, names.length, '还原出的文件数一致');

  var sortedInput = names.slice().sort(function (a, b) {
    return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
  });
  var allMatch = sortedInput.every(function (n) { return r.files.indexOf(n) !== -1; });
  assert(allMatch, '每个文件名都被还原');
})();

// ── 2. 头部魔数 ──
(function () {
  var bytes = DSStore.buildFromNames(['a.txt']);
  var dv = new DataView(bytes.buffer);
  eq(dv.getUint32(0), 0x00000001, '魔数1 = 0x00000001');
  eq(dv.getUint32(4), 0x42756431, "魔数2 = 'Bud1'");
})();

// ── 3. 中文 / Unicode 文件名（UTF-16 往返）──
(function () {
  var names = ['财务报表.xlsx', '身份证照片.png', '密码.txt'];
  var r = DSStore.parse(DSStore.buildFromNames(names));
  assert(r.ok, '中文文件名解析成功');
  var ok = names.every(function (n) { return r.files.indexOf(n) !== -1; });
  assert(ok, '中文文件名 UTF-16 往返正确');
})();

// ── 4. 各数据类型编解码 ──
(function () {
  var blob = new Uint8Array([1, 2, 3, 4, 250]);
  var entries = [
    { name: 'f_blob', structId: 'Iloc', type: 'blob', value: blob },
    { name: 'f_long', structId: 'vSrn', type: 'long', value: 1234567 },
    { name: 'f_bool', structId: 'ICVO', type: 'bool', value: true },
    { name: 'f_type', structId: 'vstl', type: 'type', value: 'icnv' },
    { name: 'f_ustr', structId: 'cmmt', type: 'ustr', value: '这是备注' }
  ];
  var r = DSStore.parse(DSStore.build(entries));
  assert(r.ok, '多类型解析成功');

  eq(r.byName['f_long'].props[0].value, 1234567, 'long 值往返');
  eq(r.byName['f_bool'].props[0].value, true, 'bool 值往返');
  eq(r.byName['f_type'].props[0].value, 'icnv', 'type(fourcc) 值往返');
  eq(r.byName['f_ustr'].props[0].value, '这是备注', 'ustr 值往返');

  var b = r.byName['f_blob'].props[0].value;
  assert(b instanceof Uint8Array && b.length === 5 && b[4] === 250, 'blob 字节往返');
})();

// ── 5. 同名多属性归并 ──
(function () {
  var entries = [
    { name: 'report.pdf', structId: 'Iloc', type: 'blob', value: new Uint8Array(16) },
    { name: 'report.pdf', structId: 'cmmt', type: 'ustr', value: '机密' },
    { name: 'report.pdf', structId: 'vSrn', type: 'long', value: 1 }
  ];
  var r = DSStore.parse(DSStore.build(entries));
  eq(r.files.length, 1, '同名文件归并为 1 个');
  eq(r.byName['report.pdf'].props.length, 3, '同名文件保留 3 条属性');
  eq(r.recordCount, 3, '记录总数为 3');
})();

// ── 6. describeStruct ──
(function () {
  eq(DSStore.describeStruct('Iloc').label, '图标位置', 'Iloc 描述正确');
  eq(DSStore.describeStruct('cmmt').label, 'Spotlight 注释', 'cmmt 描述正确');
  assert(DSStore.describeStruct('ZZZZ').label === 'ZZZZ', '未知结构回退为原码');
})();

// ── 7. 非法输入健壮性 ──
(function () {
  var r1 = DSStore.parse(new Uint8Array([1, 2, 3]));
  assert(!r1.ok && r1.error, '过短输入返回错误而非崩溃');

  var bad = new Uint8Array(40); // 全 0，魔数不符
  var r2 = DSStore.parse(bad);
  assert(!r2.ok && /魔数/.test(r2.error), '错误魔数被识别');

  var r3 = DSStore.parse('not a buffer');
  assert(!r3.ok, '非二进制输入返回错误');
})();

// ── 8. 空目录 ──
(function () {
  var r = DSStore.parse(DSStore.buildFromNames([]));
  assert(r.ok, '空清单可解析');
  eq(r.files.length, 0, '空清单文件数为 0');
})();

// ── 9. 较大目录（多文件仍在单叶节点内）──
(function () {
  var names = [];
  for (var i = 0; i < 30; i++) names.push('file_' + i + '.dat');
  var r = DSStore.parse(DSStore.buildFromNames(names));
  assert(r.ok, '30 个文件解析成功');
  eq(r.files.length, 30, '30 个文件全部还原');
})();

// ── 10. 内部工具 ──
(function () {
  var it = DSStore._internal;
  eq(it.nextPow2(20), 32, 'nextPow2(20)=32');
  eq(it.nextPow2(4096), 4096, 'nextPow2(4096)=4096');
  eq(it.log2(4096), 12, 'log2(4096)=12');
  eq(it.align32(33), 64, 'align32(33)=64');
})();

// ── 汇总 ──
console.log('\n──────────────');
console.log('通过 ' + passed + ' / ' + (passed + failed));
if (failed > 0) { console.error('存在失败用例'); process.exit(1); }
else { console.log('全部通过 ✔'); }
