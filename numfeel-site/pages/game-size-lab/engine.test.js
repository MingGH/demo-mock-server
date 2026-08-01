/**
 * 游戏包体实验室 — 单元测试
 * 运行：node pages/game-size-lab/engine.test.js
 */

var e = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('✅ ' + msg);
    passed++;
  } else {
    console.error('❌ ' + msg);
    failed++;
  }
}

function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    console.log('✅ ' + msg + ' (实际: ' + actual + ')');
    passed++;
  } else {
    console.error('❌ ' + msg + ' (实际: ' + actual + ', 期望: ' + expected + ' ±' + tol + ')');
    failed++;
  }
}

console.log('=== 游戏包体实验室 引擎测试 ===\n');

// ══════════════════════════════════════════
// 一、实测数据自洽性
// ══════════════════════════════════════════
console.log('--- SDK 实测数据 ---');

var F = e.SDK_FACTS;

assertClose(
  F.sourceTextBytes + F.binaryBytes + F.otherBytes,
  F.repoTotalBytes, 1,
  '源码 + 二进制 + 其他 应精确等于仓库总量'
);

assertClose(F.repoTotalBytes / e.MIB, 464.6, 0.2, '仓库总量应为 464.6 MiB');
assertClose(F.sourceTextBytes / e.MIB, 69.3, 0.1, '源码文本应为 69.3 MiB');
assertClose(F.binaryBytes / e.MIB, 339.6, 0.1, '预编译二进制应为 339.6 MiB');

// 核心论点：二进制占比远超源码
var binPct = F.binaryBytes / F.repoTotalBytes * 100;
var srcPct = F.sourceTextBytes / F.repoTotalBytes * 100;
assertClose(binPct, 73.1, 0.2, '预编译二进制占比应为 73.1%');
assertClose(srcPct, 14.9, 0.2, '源码文本占比应为 14.9%');
assert(binPct > srcPct * 4, '二进制占比应超过源码的 4 倍（这是本页核心反差）');

// TF2 代码
assertClose(F.tf2CodeBytes / e.MIB, 15.56, 0.01, 'TF2 游戏代码应为 15.56 MiB');
assertClose(F.tf2CodeGzipBytes / e.MIB, 3.29, 0.01, 'TF2 代码 gzip 后应为 3.29 MiB');
assert(F.tf2CodeGzipBytes < F.tf2CodeBytes, 'gzip 后必须比原文本小');
assertClose(F.tf2CodeBytes / F.tf2CodeGzipBytes, 4.73, 0.05, '源码 gzip 压缩比应约 4.7:1');

// 行数
assert(F.tf2CodeLines === 533158, 'TF2 代码行数应为 533,158');
assert(F.totalCodeLines === 2233657, '全仓库代码行数应为 2,233,657');
assert(F.tf2CodeLines < F.totalCodeLines, 'TF2 行数必须小于全仓库行数');

// 引擎目录的真相
assert(F.engineDirFileCount === 1, 'src/engine 应只有 1 个文件');
assert(F.engineDirBytes === 3134, 'src/engine 应为 3134 字节');
assert(F.engineDirBytes < F.tf2CodeBytes / 1000, 'src/engine 比 TF2 代码小三个数量级以上');

// ══════════════════════════════════════════
// 二、目录树
// ══════════════════════════════════════════
console.log('\n--- 目录树 ---');

assert(e.SDK_TREE.length >= 8, '目录树应至少有 8 个顶层节点，实际: ' + e.SDK_TREE.length);

var treeSum = 0;
for (var i = 0; i < e.SDK_TREE.length; i++) {
  treeSum += e.SDK_TREE[i].bytes;
  assert(e.SDK_TREE[i].bytes > 0, '节点「' + e.SDK_TREE[i].name + '」体积应大于 0');
  assert(
    ['src', 'bin', 'other'].indexOf(e.SDK_TREE[i].kind) !== -1,
    '节点「' + e.SDK_TREE[i].name + '」kind 应合法'
  );
}
// 顶层节点未覆盖仓库根目录零散文件，允许略小于总量
assert(
  treeSum <= F.repoTotalBytes && treeSum > F.repoTotalBytes * 0.95,
  '目录树合计应覆盖仓库 95% 以上且不超过总量（实际覆盖 ' + (treeSum / F.repoTotalBytes * 100).toFixed(1) + '%）'
);

// 子节点合计不应超过父节点
for (var t = 0; t < e.SDK_TREE.length; t++) {
  var node = e.SDK_TREE[t];
  if (node.children && node.children.length) {
    var childSum = 0;
    for (var c = 0; c < node.children.length; c++) childSum += node.children[c].bytes;
    assert(childSum <= node.bytes * 1.001, '「' + node.name + '」子节点合计不应超过父节点');
  }
}

// 最大的顶层节点必须是二进制类
var biggest = e.SDK_TREE[0];
for (var b = 1; b < e.SDK_TREE.length; b++) {
  if (e.SDK_TREE[b].bytes > biggest.bytes) biggest = e.SDK_TREE[b];
}
assert(biggest.kind === 'bin', '仓库最大的目录应是二进制类，实际: ' + biggest.name);

// ══════════════════════════════════════════
// 三、贴图体积公式
// ══════════════════════════════════════════
console.log('\n--- 贴图体积 ---');

// 4096 × 4096 × 4 字节 = 64 MiB，这是死算的
assert(
  e.singleTextureBytes(4096, 'raw', false) === 4096 * 4096 * 4,
  '4K 未压缩贴图应为 4096×4096×4 = 67,108,864 字节'
);
assertClose(e.singleTextureBytes(4096, 'raw', false) / e.MIB, 64, 0.001, '4K 未压缩贴图应正好 64 MiB');
assertClose(e.singleTextureBytes(4096, 'bc7', false) / e.MIB, 16, 0.001, '4K BC7 贴图应为 16 MiB');
assertClose(e.singleTextureBytes(4096, 'bc1', false) / e.MIB, 8, 0.001, '4K BC1 贴图应为 8 MiB');

// mipmap 系数
assertClose(
  e.singleTextureBytes(1024, 'bc7', true) / e.singleTextureBytes(1024, 'bc7', false),
  4 / 3, 0.0001,
  'mipmap 开启应使体积变为 4/3 倍'
);

// 分辨率翻倍 → 体积四倍
assertClose(
  e.singleTextureBytes(2048, 'bc7', false) / e.singleTextureBytes(1024, 'bc7', false),
  4, 0.0001,
  '边长翻倍体积应变 4 倍'
);

// 通道数线性叠加
assertClose(
  e.materialBytes(2048, 6, 'bc7', true),
  e.singleTextureBytes(2048, 'bc7', true) * 6, 1,
  '6 通道材质应为单张的 6 倍'
);

// 一套 2K/6通道/BC7/mipmap 材质 = 32 MiB
assertClose(e.materialBytes(2048, 6, 'bc7', true) / e.MIB, 32, 0.01, '2K 六通道材质应为 32 MiB');

// 未知格式回退
assert(e.getTextureFormat('nope').id === 'bc7', '未知格式应回退到 bc7');

// 核心金句：一张 4K 未压缩贴图 = 4.1 份 TF2 全部游戏代码
assertClose(
  e.codeEquivalents(e.singleTextureBytes(4096, 'raw', false), false),
  4.11, 0.02,
  '一张 4K 未压缩贴图应等于约 4.1 份 TF2 游戏代码'
);
// 按 gzip 后的代码算，是 19.5 份
assertClose(
  e.codeEquivalents(e.singleTextureBytes(4096, 'raw', false), true),
  19.47, 0.05,
  '按 gzip 代码换算应为约 19.5 份'
);

// ══════════════════════════════════════════
// 四、音频体积公式
// ══════════════════════════════════════════
console.log('\n--- 音频体积 ---');

// 1 语言 × 60 分钟 × 128kbps = 3600s × 16000 B/s
assert(
  e.audioTotalBytes(1, 60, 'lossy') === 3600 * 16000,
  '1 小时 128kbps 应为 57,600,000 字节'
);
assertClose(e.audioTotalBytes(1, 60, 'lossy') / e.MIB, 54.93, 0.01, '1 小时 128kbps 应约 54.9 MiB');

// 语言数线性
assertClose(
  e.audioTotalBytes(10, 60, 'lossy') / e.audioTotalBytes(1, 60, 'lossy'),
  10, 0.0001,
  '10 种语言应为 1 种的 10 倍'
);

// 无损相对有损
assertClose(
  e.audioTotalBytes(1, 60, 'lossless') / e.audioTotalBytes(1, 60, 'lossy'),
  1411 / 128, 0.001,
  '无损应为有损的 11.02 倍'
);

assert(e.getAudioBitrate('nope').id === 'lossy', '未知码率应回退到 lossy');
assert(e.audioTotalBytes(0, 60, 'lossy') === 0, '0 种语言应为 0 字节');

// ══════════════════════════════════════════
// 五、地图与模型
// ══════════════════════════════════════════
console.log('\n--- 地图与模型 ---');

assert(e.mapTotalBytes(100, 30) === 100 * 30 * e.MIB, '100 张 30MiB 地图应为 3000 MiB');
assert(e.mapTotalBytes(0, 300) === 0, '0 张地图应为 0');
assertClose(e.modelTotalBytes(3400, 4) / e.MIB, 3400 * 200 / 1024, 0.01, '2K 档 3400 个模型应为 664 MiB');
assert(e.modelTotalBytes(1000, 0) < e.modelTotalBytes(1000, 6), '高精度档模型应比低精度档大');

// clampIndex 边界
assert(e.clampIndex(-5, e.RESOLUTIONS) === 0, '负索引应夹到 0');
assert(e.clampIndex(999, e.RESOLUTIONS) === e.RESOLUTIONS.length - 1, '超界索引应夹到末位');
assert(e.clampIndex(NaN, e.RESOLUTIONS) === 0, 'NaN 索引应夹到 0');

// ══════════════════════════════════════════
// 六、包体组装
// ══════════════════════════════════════════
console.log('\n--- 包体组装 ---');

var tf2 = e.buildPackage(e.getPreset('tf2').config);

// 分项之和应等于总量
assertClose(
  tf2.texture + tf2.audio + tf2.maps + tf2.models + tf2.code,
  tf2.total, 1,
  '各分项之和应等于总量'
);

// breakdown 百分比之和应为 100
var pctSum = 0;
for (var p = 0; p < tf2.breakdown.length; p++) pctSum += tf2.breakdown[p].percent;
assertClose(pctSum, 100, 0.001, 'breakdown 百分比之和应为 100%');

// 贴图必须是最大项
var maxItem = tf2.breakdown[0];
for (var m = 1; m < tf2.breakdown.length; m++) {
  if (tf2.breakdown[m].bytes > maxItem.bytes) maxItem = tf2.breakdown[m];
}
assert(maxItem.id === 'texture', 'TF2 配置下贴图应是最大项，实际: ' + maxItem.id);

// 代码必须是最小项
var minItem = tf2.breakdown[0];
for (var n = 1; n < tf2.breakdown.length; n++) {
  if (tf2.breakdown[n].bytes < minItem.bytes) minItem = tf2.breakdown[n];
}
assert(minItem.id === 'code', 'TF2 配置下代码应是最小项，实际: ' + minItem.id);

// 重复打包系数不应放大代码（可执行文件只有一份）
var cfgDup = JSON.parse(JSON.stringify(e.getPreset('tf2').config));
cfgDup.dupFactor = 2;
var doubled = e.buildPackage(cfgDup);
assert(doubled.code === tf2.code, '重复打包系数不应改变代码体积');
assertClose(doubled.assets / tf2.assets, 2, 0.0001, '重复打包系数 2 应使资产翻倍');

// dupFactor 非法值应退化为 1
var cfgBadDup = JSON.parse(JSON.stringify(e.getPreset('tf2').config));
cfgBadDup.dupFactor = 0;
assertClose(e.buildPackage(cfgBadDup).assets, tf2.assets, 1, 'dupFactor 为 0 应退化为 1');

// ══════════════════════════════════════════
// 七、预设校准：输出必须贴近真实公开体积
// ══════════════════════════════════════════
console.log('\n--- 预设校准 ---');

var expectations = [
  { id: 'doom', targetGiB: 0.012, tolFactor: 2.0, label: 'DOOM 约 12 MB' },
  { id: 'tf2', targetGiB: 15, tolFactor: 1.5, label: 'TF2 约 15 GB' },
  { id: 'aaa', targetGiB: 130, tolFactor: 1.2, label: '现代 3A 约 130 GB' },
  { id: 'bloat', targetGiB: 175, tolFactor: 1.2, label: '全家桶约 175 GB' }
];

for (var x = 0; x < expectations.length; x++) {
  var exp = expectations[x];
  var preset = e.getPreset(exp.id);
  assert(preset !== null, '预设「' + exp.id + '」应存在');
  var built = e.buildPackage(preset.config);
  var gib = built.total / e.GIB;
  var ratio = gib / exp.targetGiB;
  assert(
    ratio >= 1 / exp.tolFactor && ratio <= exp.tolFactor,
    exp.label + ' → 模型算出 ' + e.formatBytes(built.total) +
    '（比值 ' + ratio.toFixed(2) + '，容许 ' + (1 / exp.tolFactor).toFixed(2) + '~' + exp.tolFactor + '）'
  );
}

// 预设应按体积单调递增
var prevTotal = 0;
for (var q = 0; q < e.PRESETS.length; q++) {
  var tot = e.buildPackage(e.PRESETS[q].config).total;
  assert(tot > prevTotal, '预设「' + e.PRESETS[q].name + '」应比前一个大');
  prevTotal = tot;
}

// 代码占比的时代塌缩：1993 年代码还算个角色，现代 3A 里已经约等于零
var doomPkg = e.buildPackage(e.getPreset('doom').config);
var aaaPkg = e.buildPackage(e.getPreset('aaa').config);

assert(
  doomPkg.codePercent > 1,
  'DOOM 年代代码占比应超过 1%（当年代码是包体的真实成分），实际 ' + e.formatPercent(doomPkg.codePercent)
);
assert(
  aaaPkg.codePercent < 0.2,
  '现代 3A 代码占比应低于 0.2%，实际 ' + e.formatPercent(aaaPkg.codePercent)
);
assert(
  doomPkg.codePercent / aaaPkg.codePercent > 50,
  '代码占比从 DOOM 到现代 3A 应塌缩 50 倍以上，实际 ' +
    (doomPkg.codePercent / aaaPkg.codePercent).toFixed(0) + ' 倍'
);

// 2007 年之后（含 TF2）代码占比都应低于 1%
var modernIds = ['tf2', 'aaa', 'bloat'];
for (var r = 0; r < modernIds.length; r++) {
  var pkg = e.buildPackage(e.getPreset(modernIds[r]).config);
  assert(
    pkg.codePercent < 1,
    '预设「' + e.getPreset(modernIds[r]).name + '」代码占比应低于 1%，实际 ' + e.formatPercent(pkg.codePercent)
  );
}

// 把代码拉到极限也翻不了盘：现代 3A 配置下代码拉到 500MB 仍不足 1%
var cfgFatCode = JSON.parse(JSON.stringify(e.getPreset('aaa').config));
cfgFatCode.codeMiB = 500;
var fatCode = e.buildPackage(cfgFatCode);
assert(
  fatCode.codePercent < 1,
  '代码拉到 500 MB，在 3A 配置下占比仍应低于 1%，实际 ' + e.formatPercent(fatCode.codePercent)
);

assert(e.getPreset('nope') === null, '不存在的预设应返回 null');

// ══════════════════════════════════════════
// 八、真实游戏对照
// ══════════════════════════════════════════
console.log('\n--- 真实游戏对照 ---');

assert(e.REAL_GAMES.length >= 8, '对照列表应至少 8 款游戏');
for (var g = 0; g < e.REAL_GAMES.length; g++) {
  assert(e.REAL_GAMES[g].gib > 0, e.REAL_GAMES[g].name + ' 体积应大于 0');
  assert(!!e.REAL_GAMES[g].source, e.REAL_GAMES[g].name + ' 必须标注数据来源');
}

var closeDoom = e.findClosestGame(0.012 * e.GIB);
assert(closeDoom.name === 'DOOM', '12 MB 应匹配到 DOOM，实际: ' + closeDoom.name);
assertClose(closeDoom.ratio, 1, 0.01, 'DOOM 精确匹配时比值应为 1');

var closeWukong = e.findClosestGame(130 * e.GIB);
assert(closeWukong.name === '黑神话：悟空', '130 GB 应匹配到黑神话，实际: ' + closeWukong.name);

var closeTF2 = e.findClosestGame(15 * e.GIB);
assert(closeTF2.name === 'Team Fortress 2', '15 GB 应匹配到 TF2，实际: ' + closeTF2.name);

// 极小体积不应崩
var tiny = e.findClosestGame(0);
assert(tiny !== null && !!tiny.name, '0 字节输入不应崩溃');

// ══════════════════════════════════════════
// 九、换算与格式化
// ══════════════════════════════════════════
console.log('\n--- 换算与格式化 ---');

assertClose(e.magnification(175 * e.GIB, F.tf2CodeBytes), 11516, 5, '175 GB ÷ 15.56 MB 应约 11,516 倍');
assertClose(e.heroMagnification(), 11516, 5, 'heroMagnification 应约 11,516 倍');
assert(e.magnification(100, 0) === 0, '除数为 0 应返回 0');

assert(e.formatBytes(0) === '0 B', '0 应格式化为 0 B');
assert(e.formatBytes(512) === '512 B', '512 字节应保持 B');
assert(e.formatBytes(2048) === '2.0 KB', '2048 字节应为 2.0 KB');
assert(e.formatBytes(3447002) === '3.29 MB', 'gzip 代码应格式化为 3.29 MB');
assert(e.formatBytes(16312863) === '15.56 MB', 'TF2 代码应格式化为 15.56 MB');
assert(e.formatBytes(175 * e.GIB) === '175.0 GB', '175 GiB 应格式化为 175.0 GB');
assert(e.formatBytes(-5) === '0 B', '负数应返回 0 B');
assert(e.formatBytes(NaN) === '0 B', 'NaN 应返回 0 B');

assert(e.formatMultiple(11516) === '11,516', '倍率应带千分位');
assert(e.formatMultiple(4.11) === '4.1', '小倍率应保留一位小数');
assert(e.formatMultiple(1) === '1', '倍率 1 应显示为 1 而不是 1.0');
assert(e.formatMultiple(3) === '3', '整数倍率不应带小数尾巴');
assert(e.formatMultiple(-1) === '0', '负倍率应返回 0');

assert(e.formatPercent(0.0087) === '0.00870%', '极小百分比不应塌缩成 0');
assert(e.formatPercent(12.34) === '12.3%', '大百分比应保留一位');
assert(e.formatPercent(0) === '0%', '0 应返回 0%');
assert(e.formatPercent(1.5) === '1.50%', '1.5% 应保留两位');

assert(e.formatNumber(2233657) === '2,233,657', '行数应带千分位');

// ══════════════════════════════════════════
// 九点五、缩放条带布局
// ══════════════════════════════════════════
console.log('\n--- 缩放条带 ---');

var zoomSegs = [
  { id: 'a', label: '甲', bytes: 900, color: '#111' },
  { id: 'b', label: '乙', bytes: 99, color: '#222' },
  { id: 'code', label: '代码', bytes: 1, color: '#ffd700' }
];

// 1 倍：三段全在，宽度按字节占比
var z1 = e.zoomSegments(zoomSegs, 1);
assert(z1.length === 3, '1 倍时应有 3 段可见，实际 ' + z1.length);
assertClose(z1[0].widthPercent, 90, 0.001, '1 倍时甲应占 90%');
assertClose(z1[2].widthPercent, 0.1, 0.001, '1 倍时代码应占 0.1%');

// 任意倍率下宽度之和都应为 100%
var mults = [1, 2, 10, 100, 1000, 11519];
for (var zi = 0; zi < mults.length; zi++) {
  var segs = e.zoomSegments(zoomSegs, mults[zi]);
  var sum = 0;
  for (var sj = 0; sj < segs.length; sj++) sum += segs[sj].widthPercent;
  assertClose(sum, 100, 0.001, mults[zi] + ' 倍时宽度之和应为 100%');
}

// 放大 1000 倍（总量 1000 → 可见 1 字节）时只剩代码，且铺满
var z1000 = e.zoomSegments(zoomSegs, 1000);
assert(z1000.length === 1, '1000 倍时应只剩代码一段，实际 ' + z1000.length);
assert(z1000[0].id === 'code', '1000 倍时剩下的应是代码段');
assertClose(z1000[0].widthPercent, 100, 0.001, '1000 倍时代码应铺满 100%');

// 代码宽度占比应随倍率单调递增
var prevW = 0;
for (var zk = 0; zk < mults.length; zk++) {
  var ss = e.zoomSegments(zoomSegs, mults[zk]);
  var codeW = 0;
  for (var sm = 0; sm < ss.length; sm++) if (ss[sm].id === 'code') codeW = ss[sm].widthPercent;
  assert(codeW >= prevW, mults[zk] + ' 倍时代码宽度不应回退（' + codeW.toFixed(3) + '%）');
  prevW = codeW;
}

// 代码宽度应与倍率成正比（放大 10 倍，宽度也 10 倍）
assertClose(
  e.zoomSegments(zoomSegs, 100)[e.zoomSegments(zoomSegs, 100).length - 1].widthPercent /
    e.zoomSegments(zoomSegs, 10)[e.zoomSegments(zoomSegs, 10).length - 1].widthPercent,
  10, 0.001,
  '代码宽度应与倍率成正比'
);

// 边界
assert(e.zoomSegments([], 5).length === 0, '空分段应返回空数组');
assert(e.zoomSegments(null, 5).length === 0, 'null 应返回空数组');
assert(e.zoomSegments(zoomSegs, 0).length === 3, '倍率 0 应按 1 处理');
assert(e.zoomSegments(zoomSegs, -3).length === 3, '负倍率应按 1 处理');
assert(e.zoomSegments([{ id: 'x', label: 'x', bytes: 0, color: '#000' }], 2).length === 0, '总量为 0 应返回空数组');

// 用真实 3A 包体跑一遍，代码在 1 倍时应小到几乎看不见
var realPkg = e.buildPackage(e.getPreset('aaa').config);
var realSegs = e.zoomSegments(realPkg.breakdown, 1);
var realCodeW = realSegs[realSegs.length - 1].widthPercent;
assert(realCodeW < 0.1, '3A 包体在 1 倍下代码宽度应小于 0.1%，实际 ' + realCodeW.toFixed(4) + '%');

// 浮点容限：页面第一幕的条带是「175 GiB 里放一个实测代码段」，
// 各段字节数由浮点相加得出，放大到底时不应因为几个 ulp 的误差多出幽灵段
var heroTotal = 175 * e.GIB;
var heroCode = e.SDK_FACTS.tf2CodeBytes;
var heroRest = heroTotal - heroCode;
var heroSegs = [
  { id: 't', label: '贴图', color: '#1', bytes: heroRest * 0.7 },
  { id: 'm', label: '地图', color: '#2', bytes: heroRest * 0.1 },
  { id: 'a', label: '音频', color: '#3', bytes: heroRest * 0.15 },
  { id: 'd', label: '模型', color: '#4', bytes: heroRest * 0.05 },
  { id: 'code', label: '代码', color: '#ffd700', bytes: heroCode }
];
var heroMax = e.magnification(heroTotal, heroCode);
var atMax = e.zoomSegments(heroSegs, heroMax);
assert(
  atMax.length === 1 && atMax[0].id === 'code',
  '放大到底时应只剩代码一段，不能有浮点幽灵段（实际 ' + atMax.length + ' 段）'
);
assertClose(atMax[0].widthPercent, 100, 0.001, '放大到底时代码应铺满 100%');

// zoomCaption 覆盖全区间且不返回空串
var zoomPoints = [1, 5, 50, 500, 3000, 8000, 11516, 99999];
for (var z = 0; z < zoomPoints.length; z++) {
  var cap = e.zoomCaption(zoomPoints[z]);
  assert(typeof cap === 'string' && cap.length > 0, '倍率 ' + zoomPoints[z] + ' 应有解说文案');
}
assert(
  e.zoomCaption(1) !== e.zoomCaption(11516),
  '起点与终点的解说文案应不同'
);

// ══════════════════════════════════════════
// 结果
// ══════════════════════════════════════════
console.log('\n=== 测试结果 ===');
console.log('通过: ' + passed + ' / 失败: ' + failed);

if (failed > 0) {
  console.error('\n❌ 有 ' + failed + ' 个测试失败！');
  process.exit(1);
} else {
  console.log('\n✅ 全部通过！');
}
