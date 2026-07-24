/**
 * presets.test.js - 用 `node numfeel-site/pages/dsstore-lab/presets.test.js` 直接运行
 *
 * 覆盖：
 *   - 每个预设能被 buildPreset 生成 + DSStore.parse 原样读回
 *   - 还原出的文件名清单与 preset.names 一致
 *   - 危险文件标记正确（danger 必须是 names 的子集，且 isDangerous 兜底也工作）
 *   - 带 cmmt 备注的文件，备注内容能被往返还原
 */
var DSStore = require('./dsstore.js');
var Presets = require('./presets.js');

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}
function eq(a, b, msg) { assert(a === b, msg + '  (期望 ' + b + '，实际 ' + a + ')'); }

// ── 1. 预设数量足够（至少 4 个）──
assert(Presets.PRESETS.length >= 4, '预设至少有 4 个（实际 ' + Presets.PRESETS.length + '）');

// ── 2. 每个预设结构完整 ──
Presets.PRESETS.forEach(function (p) {
  assert(typeof p.id === 'string' && p.id.length > 0, '[' + p.id + '] id 非空');
  assert(typeof p.name === 'string' && p.name.length > 0, '[' + p.id + '] name 非空');
  assert(typeof p.note === 'string' && p.note.length > 0, '[' + p.id + '] note 非空');
  assert(Array.isArray(p.names) && p.names.length > 0, '[' + p.id + '] names 是非空数组');
  assert(Array.isArray(p.danger), '[' + p.id + '] danger 是数组');
});

// ── 3. 每个预设的 danger 必须是 names 的子集 ──
Presets.PRESETS.forEach(function (p) {
  p.danger.forEach(function (d) {
    assert(p.names.indexOf(d) !== -1, '[' + p.id + '] danger 项「' + d + '」在 names 中存在');
  });
});

// ── 4. 每个预设能 build + parse 往返，文件名清单一致 ──
Presets.PRESETS.forEach(function (p) {
  var bytes = Presets.buildPreset(p, DSStore);
  assert(bytes instanceof Uint8Array, '[' + p.id + '] buildPreset 返回 Uint8Array');

  var r = DSStore.parse(bytes);
  assert(r.ok, '[' + p.id + '] 解析成功：' + (r.error || ''));

  // 文件名集合一致（顺序由 build 内部排序，所以用集合比较）
  var expected = p.names.slice().sort();
  var actual = r.files.slice().sort();
  eq(actual.length, expected.length, '[' + p.id + '] 还原文件数一致');
  var allMatch = expected.every(function (n) { return actual.indexOf(n) !== -1; });
  assert(allMatch, '[' + p.id + '] 所有文件名都被还原');
});

// ── 5. 至少有一个预设给文件附了 cmmt(ustr) 备注，且备注能被往返还原 ──
(function () {
  var foundComment = false;
  Presets.PRESETS.forEach(function (p) {
    if (!p.extra) return;
    Object.keys(p.extra).forEach(function (fname) {
      p.extra[fname].forEach(function (prop) {
        if (prop.structId === 'cmmt' && prop.type === 'ustr') {
          foundComment = true;
          var r = DSStore.parse(Presets.buildPreset(p, DSStore));
          var entry = r.byName[fname];
          assert(!!entry, '[' + p.id + '] 带备注的文件「' + fname + '」被还原');
          if (entry) {
            var cmmtProp = null;
            for (var i = 0; i < entry.props.length; i++) {
              if (entry.props[i].structId === 'cmmt') { cmmtProp = entry.props[i]; break; }
            }
            assert(!!cmmtProp, '[' + p.id + '] cmmt 属性被保留');
            if (cmmtProp) {
              eq(cmmtProp.value, prop.value, '[' + p.id + '] cmmt 备注内容往返一致');
            }
          }
        }
      });
    });
  });
  assert(foundComment, '至少有一个预设附了 cmmt 备注，演示「连备注都会泄露」');
})();

// ── 6. isDangerous 兜底逻辑 ──
(function () {
  assert(Presets.isDangerous('backup.zip') === true, 'isDangerous(.zip) 兜底标红');
  assert(Presets.isDangerous('db.sql') === true, 'isDangerous(.sql) 兜底标红');
  assert(Presets.isDangerous('.env') === true, 'isDangerous(.env) 兜底标红');
  assert(Presets.isDangerous('admin') === true, 'isDangerous(admin) 关键词标红');
  assert(Presets.isDangerous('身份证正面.jpg') === true, 'isDangerous(身份证) 关键词标红');
  assert(Presets.isDangerous('README.md') === false, 'isDangerous(README.md) 不标红');
  assert(Presets.isDangerous('index.html') === false, 'isDangerous(index.html) 不标红');
  // 显式 dangerList 优先
  assert(Presets.isDangerous('foo.txt', ['foo.txt']) === true, 'isDangerous 显式 dangerList 命中');
})();

// ── 7. getPreset 取预设 ──
(function () {
  var first = Presets.PRESETS[0];
  eq(Presets.getPreset(first.id).id, first.id, 'getPreset 按 id 取到正确预设');
  eq(Presets.getPreset('not-exist'), null, 'getPreset 找不到时返回 null');
})();

// ── 8. 第一个预设作为页面默认加载目标，必须可解析 ──
(function () {
  var first = Presets.PRESETS[0];
  var r = DSStore.parse(Presets.buildPreset(first, DSStore));
  assert(r.ok && r.files.length > 0, '第一个预设（默认加载）可解析且非空');
})();

// ── 汇总 ──
console.log('\n──────────────');
console.log('通过 ' + passed + ' / ' + (passed + failed));
if (failed > 0) { console.error('存在失败用例'); process.exit(1); }
else { console.log('全部通过 ✔'); }
