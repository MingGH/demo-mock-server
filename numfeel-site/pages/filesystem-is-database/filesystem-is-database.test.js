/**
 * filesystem-is-database.test.js · 核心逻辑测试
 * 运行：node numfeel-site/pages/filesystem-is-database/filesystem-is-database.test.js
 */

var L = require('./logic.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
}

function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { console.log('✅ ' + msg + ' (actual=' + actual + ')'); passed++; }
  else { console.error('❌ ' + msg + ' expected=' + expected + ' actual=' + actual); failed++; }
}

// ─────────────────────────────────────────────────────────
// 1. B 树 insert / search 基础正确性
// ─────────────────────────────────────────────────────────
console.log('\n── 1. B 树 insert / search ──');

var bt = L.createBTree(4);
var keys = ['/etc/hosts', '/etc/fstab', '/home/user/todo.md',
  '/home/user/docs/notes.txt', '/home/user/docs/resume.pdf',
  '/home/user/photos/2023/old.jpg', '/home/user/photos/2024/a.jpg',
  '/home/user/photos/2024/b.jpg', '/home/user/photos/2024/c.png'];
keys.forEach(function (k) { bt.insert(k); });

assert(bt.size() === keys.length, '插入 ' + keys.length + ' 个 key 后 size 正确');
keys.forEach(function (k) {
  assert(bt.search(k).found === true, '能找到已插入的 ' + k);
});

assert(bt.search('/not/exist').found === false, '不存在的路径返回 found=false');
assert(bt.search('/home/user/photos/2024/a.jp').found === false, '前缀近似但不存在返回 false');

// 重复插入不增加 size
bt.insert('/etc/hosts');
assert(bt.size() === keys.length, '重复插入同一 key 不增加 size');

// ─────────────────────────────────────────────────────────
// 2. B 树比较次数 ≈ O(log n)，远小于线性扫描 O(n)
// ─────────────────────────────────────────────────────────
console.log('\n── 2. 有索引 vs 无索引 比较次数 ──');

var big = L.createBTree(4);
var N = 1000;
var allKeys = [];
for (var i = 0; i < N; i++) {
  var k = '/data/item/' + i + '.dat';
  allKeys.push(k);
  big.insert(k);
}
assert(big.size() === N, '大批量插入 size = ' + N);

// 查最后一个（最坏情况之一）
var target = '/data/item/' + (N - 1) + '.dat';
var indexed = big.search(target);
var linear = L.linearScanCost(allKeys, target);

assert(indexed.found === true && linear.found === true, '两种方式都找到了目标');
assert(indexed.comparisons < linear.comparisons,
  '有索引比较次数(' + indexed.comparisons + ') < 无索引(' + linear.comparisons + ')');
assert(indexed.comparisons <= 60,
  'B 树比较次数对 1000 条应在 ~log 量级（实际 ' + indexed.comparisons + '，阈值 60）');
assert(linear.comparisons === N,
  '线性扫描找最后一个比较 ' + linear.comparisons + ' 次 = N');

// log 量级验证：N 翻倍，B 树比较次数只增加常数
var big2 = L.createBTree(4);
for (var j = 0; j < N * 2; j++) big2.insert('/d/' + j);
var indexed2 = big2.search('/d/' + (N * 2 - 1));
assert(indexed2.comparisons < indexed.comparisons + 8,
  'N 翻倍后 B 树比较次数仅小幅增长(' + indexed2.comparisons + ' vs ' + indexed.comparisons + ')');

// search 轨迹长度 = 树高
assert(indexed.trace.length === big.height(),
  '查找轨迹层数 = 树高(' + big.height() + ')');
assert(indexed.trace[indexed.trace.length - 1].matched === true,
  '最后一层轨迹标记 matched=true');
assert(indexed.found === true && indexed.trace.length >= 1,
  '找到时轨迹至少 1 层');

// ─────────────────────────────────────────────────────────
// 3. 路径解析 resolvePath
// ─────────────────────────────────────────────────────────
console.log('\n── 3. resolvePath 路径解析 ──');

var tree = L.PRESET_TREE;
var r1 = L.resolvePath(tree, '/home/user/photos/2024/a.jpg');
assert(r1.found === true, '能解析深层文件 /home/user/photos/2024/a.jpg');
assert(r1.node && r1.node.name === 'a.jpg', '定位到的节点 name = a.jpg');
assert(r1.node.type === 'file', '定位到的节点 type = file');
assert(r1.parts.length === 5, 'parts 拆成 5 段');

var r2 = L.resolvePath(tree, '/etc/hosts');
assert(r2.found === true && r2.node.type === 'file', '解析 /etc/hosts 成功');

var r3 = L.resolvePath(tree, '/home/user/docs');
assert(r3.found === true && r3.node.type === 'dir', '解析到目录节点');

var r4 = L.resolvePath(tree, '/home/nope/missing');
assert(r4.found === false, '路径中段不存在返回 found=false');

var r5 = L.resolvePath(tree, '/etc/hosts/extra');
assert(r5.found === false, '把文件当目录继续解析返回 found=false');

// 尾部斜杠 / 多余斜杠容错
var r6 = L.resolvePath(tree, '/etc//hosts/');
assert(r6.found === true, '多余斜杠也能正确解析');

// ─────────────────────────────────────────────────────────
// 4. inode 表生成
// ─────────────────────────────────────────────────────────
console.log('\n── 4. buildInodeTable ──');

var table = L.buildInodeTable(tree);
assert(table.length >= 9, '预设树拍平后至少 9 条 inode 记录（实际 ' + table.length + '）');
assert(table[0].inode === 1, '首条 inode 编号从 1 开始');
assert(table[table.length - 1].inode === table.length, 'inode 编号连续递增');
var aRow = table.filter(function (r) { return r.name === 'a.jpg'; })[0];
assert(aRow && aRow.path === '/home/user/photos/2024/a.jpg', 'a.jpg 的完整路径正确');
assert(aRow.size === 2048000, 'a.jpg 的 size 保留');

// ─────────────────────────────────────────────────────────
// 5. 成本模型 estimateCosts 单调性与相对大小
// ─────────────────────────────────────────────────────────
console.log('\n── 5. 成本模型 estimateCosts ──');

// 单文件开销远大于单条 DB 开销（这正是 SQLite competes with fopen 的核心）
var perFile = 0.5;   // ms
var perRow = 0.005;  // ms
var c100 = L.estimateCosts(100, perFile, perRow);
var c1000 = L.estimateCosts(1000, perFile, perRow);
var c5000 = L.estimateCosts(5000, perFile, perRow);

assert(c100.fsWrite > c100.dbWrite, 'N=100 文件写 > 数据库写');
assert(c1000.fsWrite > c1000.dbWrite, 'N=1000 文件写 > 数据库写');
assert(c5000.fsWrite > c5000.dbWrite, 'N=5000 文件写 > 数据库写');

// 单调性：N 越大，两种方式耗时都越大
assert(c1000.fsWrite > c100.fsWrite, '文件写耗时随 N 单调递增');
assert(c5000.fsWrite > c1000.fsWrite, '文件写耗时随 N 单调递增(5000>1000)');
assert(c1000.dbWrite > c100.dbWrite, '数据库写耗时随 N 单调递增');

// 文件方式随 N 线性增长（斜率 = perFile）
assertClose((c1000.fsWrite - c100.fsWrite) / (1000 - 100), perFile, 1e-9,
  '文件写斜率 = 单文件固定开销');

// 数据库写 = dbOpenCost + N * perRow（默认 open 开销 5ms）
assertClose(c1000.dbWrite, 5 + 1000 * perRow, 1e-9, '数据库写 = open 一次 + N * 单条开销');

// 倍率随 N 增大趋近 perFile/perRow（open 开销被摊平）
assert(c1000.ratio > c100.ratio, 'N 越大，数据库相对越快（倍率上升）');
assert(c5000.ratio >= c1000.ratio, 'N=5000 倍率 >= N=1000');

// 降级时不能用 0 或负数当参数搞出 NaN
var c0 = L.estimateCosts(0, perFile, perRow);
assert(!isNaN(c0.fsWrite) && !isNaN(c0.dbWrite), 'N=0 不产生 NaN');

// ─────────────────────────────────────────────────────────
// 6. 格式化
// ─────────────────────────────────────────────────────────
console.log('\n── 6. 格式化 ──');

assert(L.formatMs(0.5) === '0.500 ms', 'formatMs 0.5 三位小数');
assert(L.formatMs(5.5) === '5.50 ms', 'formatMs 5.5 两位小数');
assert(L.formatMs(256) === '256.0 ms', 'formatMs 256 一位小数');
assert(L.formatMs(1500) === '1.50 s', 'formatMs 1500 转秒');
assert(L.formatRatio(3.6) === '4x', 'formatRatio 取整 3.6 -> 4x');
assert(L.formatRatio(0.8) === '0.80x', 'formatRatio <1 保留两位');

// ─────────────────────────────────────────────────────────
// 7. 预设数据完整性
// ─────────────────────────────────────────────────────────
console.log('\n── 7. 预设数据 ──');

assert(L.SAMPLE_N_PRESETS.indexOf(100) !== -1 && L.SAMPLE_N_PRESETS.indexOf(5000) !== -1,
  'N 预设含 100 和 5000');
assert(L.SPECTRUM_SYSTEMS.length >= 5, '光谱上至少 5 个真实系统');
L.SPECTRUM_SYSTEMS.forEach(function (s) {
  assert(s.pos >= 0 && s.pos <= 100 && s.name && s.desc,
    '系统 ' + s.name + ' 位置在 [0,100] 且说明齐全');
});
// 光谱按 pos 升序
var sorted = L.SPECTRUM_SYSTEMS.slice().sort(function (a, b) { return a.pos - b.pos; });
assert(JSON.stringify(sorted) === JSON.stringify(L.SPECTRUM_SYSTEMS),
  '光谱系统按 pos 升序排列');

// ─────────────────────────────────────────────────────────
// 结尾
// ─────────────────────────────────────────────────────────
console.log('\n────────────────────────────');
console.log('通过 ' + passed + ' 个，失败 ' + failed + ' 个');
console.log('────────────────────────────');

if (failed > 0) process.exit(1);
