/**
 * qr-core.test.js — 二维码结构与预算结算的单元测试
 * 运行：node pages/qr-logo/qr-core.test.js
 */
var core = require('./qr-core.js');

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
  assert(actual === expected, msg + '（期望 ' + expected + '，实际 ' + actual + '）');
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol,
    msg + '（期望 ' + expected + '±' + tol + '，实际 ' + actual + '）');
}

console.log('\n═══════════════════════════════════════');
console.log('  二维码结构 / 预算结算 测试');
console.log('═══════════════════════════════════════');

/* ── 版本换算 ── */
console.log('\n【版本换算】');
assertEqual(core.versionOf(21), 1, 'v1 是 21×21');
assertEqual(core.versionOf(177), 40, 'v40 是 177×177');
assertEqual(core.versionOf(49), 8, 'v8 是 49×49');

/* ── 校正图形坐标 ── */
console.log('\n【校正图形坐标】');
assertEqual(core.alignPositions(1).length, 0, 'v1 没有校正图形');
assertEqual(core.alignPositions(2).join(','), '6,18', 'v2 是 6/18');
assertEqual(core.alignPositions(7).join(','), '6,22,38', 'v7 是 6/22/38');
assertEqual(core.alignPositions(32).join(','), '6,34,60,86,112,138', 'v32 走 26 的特例');
assertEqual(core.alignPositions(40).join(','), '6,30,58,86,114,142,170', 'v40 是 6/30/.../170');

/* ── 功能图形地图 ── */
console.log('\n【功能图形地图】');
var s1 = core.structure(21);
var fnCount = 0;
for (var i = 0; i < s1.fn.length; i++) fnCount += s1.fn[i];
assertEqual(fnCount, 233, 'v1 有 233 个功能图形模块');
assertEqual(441 - fnCount, 208, 'v1 剩 208 个数据模块（= 26 码字 × 8）');
assertEqual(s1.apList.length, 0, 'v1 的校正图形列表为空');

var s2 = core.structure(25);
assertEqual(s2.apList.length, 1, 'v2 有 1 个校正图形');
assertEqual(s2.apList[0].r + ',' + s2.apList[0].c, '18,18', 'v2 的校正图形在右下角');

var s7 = core.structure(45);
assertEqual(s7.apList.length, 6, 'v7 有 6 个校正图形');
var centerAp = s7.apList.filter(function (a) { return a.r === 22 && a.c === 22; });
assertEqual(centerAp.length, 1, 'v7 的校正图形正好落在几何中心 (22,22)');

var s40 = core.structure(177);
assertEqual(s40.apList.length, 46, 'v40 有 46 个校正图形');

/* ── 走位：码字总数必须和标准一致 ── */
console.log('\n【走位与码字划分】');
var cwOk = 0;
for (var v = 1; v <= 40; v++) {
  var size = v * 4 + 17;
  var st = core.structure(size);
  var walk = core.placement(size, st.fn);
  if (walk.totalCodewords === core.SPEC_TOTAL_CODEWORDS[v - 1]) cwOk++;
  else console.error('    v' + v + ' 码字数不符：' + walk.totalCodewords + ' vs ' + core.SPEC_TOTAL_CODEWORDS[v - 1]);
}
assertEqual(cwOk, 40, '40 个版本的数据码字数全部对上标准表');

/* ── 走位：每个数据模块恰好分配一次 ── */
console.log('\n【走位完整性】');
[1, 2, 7, 40].forEach(function (ver) {
  var sz = ver * 4 + 17;
  var stc = core.structure(sz);
  var wk = core.placement(sz, stc.fn);
  var seen = new Set();
  var min = Infinity;
  var max = -1;
  for (var k = 0; k < wk.order.length; k++) {
    if (wk.order[k] < 0) continue;
    seen.add(wk.order[k]);
    if (wk.order[k] < min) min = wk.order[k];
    if (wk.order[k] > max) max = wk.order[k];
  }
  assertEqual(seen.size, wk.dataModules, 'v' + ver + ' 每个数据模块只被分配一次');
  assertEqual(min, 0, 'v' + ver + ' 比特序号从 0 开始');
  assertEqual(max, wk.dataModules - 1, 'v' + ver + ' 比特序号连续到最后一个');
});

/* ── 覆盖结算 ── */
console.log('\n【覆盖结算】');
var cov0 = core.coverage(21, 0, s1, 'rect');
assertEqual(cov0.covered, 0, '0% 时不覆盖任何模块');

var covAll = core.coverage(21, 100, s1, 'rect');
assertEqual(covAll.covered, 441, '100% 时覆盖全部 441 个模块');
assertEqual(covAll.fnModules, 233, '100% 时压住全部 233 个功能图形模块');

var tiny = 100 / 21; // 边长正好 1 个模块
var cov1 = core.coverage(21, tiny, s1, 'rect');
assertEqual(cov1.covered, 1, '边长 1 个模块时只覆盖正中心那 1 个模块');

var covMid = core.coverage(21, 40, s1, 'rect');
assert(covMid.fnModules > 0, 'v1 取 40% 时会压到功能图形（时序/格式信息）');
assertEqual(covMid.apHit.length, 0, 'v1 没有校正图形，不可能压到');

var covCircle = core.coverage(21, 60, s1, 'circle');
var covRect = core.coverage(21, 60, s1, 'rect');
assert(covCircle.covered < covRect.covered, '同样边长，圆形覆盖的面积更小');

var mono = [10, 20, 30, 40].map(function (p) { return core.coverage(33, p, core.structure(33), 'rect').covered; });
assert(mono[0] < mono[1] && mono[1] < mono[2] && mono[2] < mono[3], '覆盖模块数随 Logo 尺寸单调增加');

/* ── 压到校正图形 ── */
console.log('\n【压到校正图形】');
var s7cov = core.coverage(45, 30, s7, 'rect');
assertEqual(s7cov.apHit.length, 1, 'v8/v7 取 30% 正好压住中心那个校正图形');
assertEqual(s7.apList[s7cov.apHit[0]].r, 22, '被压住的是 (22,22)');

/* ── 实测翻转 ── */
console.log('\n【实测翻转】');
var st21 = core.structure(21);
var wk21 = core.placement(21, st21.fn);
var dark = new Uint8Array(441);
dark[10 * 21 + 10] = 1; // 只把正中心（数据区）点亮

var allWhite = function () { return 255; };
var flips1 = core.measureFlips(21, dark, st21, wk21.order, wk21.totalCodewords, allWhite);
assertEqual(flips1.flips, 1, '中心那一格从黑变白，算 1 次翻转');
assertEqual(flips1.cwDamaged, 1, '它落在 1 个码字里');
assertEqual(flips1.fnFlips, 0, '数据区翻转不算功能图形损坏');

var dark2 = new Uint8Array(441);
dark2[0] = 1; // 左上角定位图形
var flips2 = core.measureFlips(21, dark2, st21, wk21.order, wk21.totalCodewords, allWhite);
assertEqual(flips2.flips, 1, '定位图形被翻也算翻转');
assertEqual(flips2.fnFlips, 1, '并且计入「致命功能图形」');
assertEqual(flips2.cwDamaged, 0, '功能图形不属于任何码字');

// 采样和原图完全一致 → 零翻转
var same = function (r, c) { return dark[r * 21 + c] ? 0 : 255; };
var flips3 = core.measureFlips(21, dark, st21, wk21.order, wk21.totalCodewords, same);
assertEqual(flips3.flips, 0, '渲染结果和矩阵一致时零翻转');
assertEqual(flips3.cwDamaged, 0, '零翻转时没有码字受损');

/* ── 名义预算 ── */
console.log('\n【名义预算】');
var bH = core.budgetUsed('H', 30, 100);
assertClose(bH.ratio, 1, 1e-9, 'H 级 100 个码字里坏 30 个，正好用满名义预算');
assertClose(bH.damagedRatio, 0.3, 1e-9, '受损占比 30%');

var bL = core.budgetUsed('L', 7, 100);
assertClose(bL.ratio, 1, 1e-9, 'L 级 100 个码字里坏 7 个，正好用满');

var bOver = core.budgetUsed('M', 30, 100);
assertClose(bOver.ratio, 2, 1e-9, 'M 级坏 30% 是名义预算的两倍');

var bZero = core.budgetUsed('Q', 0, 0);
assertEqual(bZero.ratio, 0, '除零时安全返回 0');

assertClose(core.NOMINAL.L, 0.07, 1e-9, 'L 名义 7%');
assertClose(core.NOMINAL.H, 0.30, 1e-9, 'H 名义 30%');

/* ── hitsModule 与 coverage 一致 ── */
console.log('\n【几何一致性】');
var mismatch = 0;
for (var r = 0; r < 45; r++) {
  for (var c = 0; c < 45; c++) {
    var byCover = core.coverage(45, 30, s7, 'rect').cover[r * 45 + c];
    var byHit = core.hitsModule(45, 30, 'rect', r, c) ? 1 : 0;
    if (byCover !== byHit) mismatch++;
  }
}
assertEqual(mismatch, 0, 'hitsModule 和 coverage 对每个模块的判断一致');

console.log('\n═══════════════════════════════════════');
console.log('  通过 ' + passed + ' 项，失败 ' + failed + ' 项');
console.log('═══════════════════════════════════════\n');

if (failed > 0) process.exitCode = 1;
