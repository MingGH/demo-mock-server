// 沙堆悖论 — 核心算法测试
var logic = require('./sorites-paradox/logic.js');

var sandHeightPercent = logic.sandHeightPercent;
var sandWidthPercent = logic.sandWidthPercent;
var findBoundary = logic.findBoundary;
var boundaryStats = logic.boundaryStats;
var bucketize = logic.bucketize;
var lerpColor = logic.lerpColor;
var colorName = logic.colorName;
var SAND_CONFIG = logic.SAND_CONFIG;
var BALD_CONFIG = logic.BALD_CONFIG;

var passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log('  \u2705 ' + msg); }
  else { failed++; console.error('  \u274c ' + msg); }
}

console.log('\n\ud83e\uddea 沙堆悖论 - 核心算法测试\n');

// ── sandHeightPercent ──
console.log('--- sandHeightPercent ---');
assert(sandHeightPercent(10000, 10000) === 100, '满沙 = 100%');
assert(sandHeightPercent(0, 10000) === 0, '0粒 = 0%');
assert(sandHeightPercent(5000, 10000) > 80, '5000粒 > 80%（对数缩放）: ' + sandHeightPercent(5000, 10000));
assert(sandHeightPercent(100, 10000) > 0, '100粒 > 0%');
assert(sandHeightPercent(100, 10000) < sandHeightPercent(1000, 10000), '100粒 < 1000粒');
assert(sandHeightPercent(-1, 10000) === 0, '负数 = 0%');
assert(sandHeightPercent(5, 0) === 0, 'maxGrains=0 返回 0');

// ── sandWidthPercent ──
console.log('--- sandWidthPercent ---');
assert(sandWidthPercent(10000, 10000) === 100, '满沙宽度 = 100%');
assert(sandWidthPercent(0, 10000) === 0, '0粒宽度 = 0');
assert(sandWidthPercent(5000, 10000) >= 30, '5000粒宽度 >= 30%');

// ── findBoundary ──
console.log('--- findBoundary ---');

// 清晰边界：前5个是堆，后5个不是
var clearVotes = [
  { grains: 10000, isHeap: true },
  { grains: 8000, isHeap: true },
  { grains: 6000, isHeap: true },
  { grains: 4000, isHeap: true },
  { grains: 2000, isHeap: true },
  { grains: 1000, isHeap: false },
  { grains: 500, isHeap: false },
  { grains: 100, isHeap: false }
];
var clearResult = findBoundary(clearVotes);
assert(clearResult.boundary === 1500, '清晰边界 = 1500: ' + clearResult.boundary);
assert(clearResult.sharpness === 'sharp', '清晰度 = sharp: ' + clearResult.sharpness);

// 模糊边界：有来回
var fuzzyVotes = [
  { grains: 10000, isHeap: true },
  { grains: 8000, isHeap: true },
  { grains: 6000, isHeap: false },
  { grains: 4000, isHeap: true },
  { grains: 2000, isHeap: false },
  { grains: 1000, isHeap: true },
  { grains: 500, isHeap: false },
  { grains: 100, isHeap: false }
];
var fuzzyResult = findBoundary(fuzzyVotes);
assert(fuzzyResult.sharpness === 'fuzzy', '模糊边界 sharpness = fuzzy: ' + fuzzyResult.sharpness);

// 全部选"是"
var allYes = [
  { grains: 10000, isHeap: true },
  { grains: 5000, isHeap: true },
  { grains: 0, isHeap: true }
];
var allYesResult = findBoundary(allYes);
assert(allYesResult.sharpness === 'extreme-yes', '全选是 = extreme-yes');

// 全部选"否"
var allNo = [
  { grains: 10000, isHeap: false },
  { grains: 5000, isHeap: false }
];
var allNoResult = findBoundary(allNo);
assert(allNoResult.sharpness === 'extreme-no', '全选否 = extreme-no');

// 空数组
var emptyResult = findBoundary([]);
assert(emptyResult.boundary === -1, '空数组 boundary = -1');

// null
var nullResult = findBoundary(null);
assert(nullResult.boundary === -1, 'null boundary = -1');

// ── boundaryStats ──
console.log('--- boundaryStats ---');
var stats = boundaryStats([100, 200, 300, 400, 500]);
assert(stats.mean === 300, '均值 = 300: ' + stats.mean);
assert(stats.median === 300, '中位数 = 300: ' + stats.median);
assert(stats.min === 100, '最小值 = 100');
assert(stats.max === 500, '最大值 = 500');
assert(stats.std > 0, '标准差 > 0: ' + stats.std);

var singleStats = boundaryStats([42]);
assert(singleStats.mean === 42, '单元素均值 = 42');
assert(singleStats.median === 42, '单元素中位数 = 42');
assert(singleStats.std === 0, '单元素标准差 = 0');

var emptyStats = boundaryStats([]);
assert(emptyStats.mean === 0, '空数组均值 = 0');

// 偶数个元素的中位数
var evenStats = boundaryStats([10, 20, 30, 40]);
assert(evenStats.median === 25, '偶数中位数 = 25: ' + evenStats.median);

// ── bucketize ──
console.log('--- bucketize ---');
var buckets = bucketize([500, 1500, 2500, 3500, 4500], 5, 5000);
assert(buckets.length === 5, '5个桶');
assert(buckets[0].count === 1, '第一个桶有1个: ' + buckets[0].count);
assert(buckets[1].count === 1, '第二个桶有1个');

var emptyBuckets = bucketize([], 5, 5000);
assert(emptyBuckets.every(function(b) { return b.count === 0; }), '空数据全部为0');

// 边界值
var edgeBuckets = bucketize([0, 10000], 10, 10000);
assert(edgeBuckets[0].count === 1, '0 在第一个桶');
assert(edgeBuckets[9].count === 1, '10000 在最后一个桶');

// ── lerpColor ──
console.log('--- lerpColor ---');
var c0 = lerpColor(0, [0, 0, 255], [0, 255, 0]);
assert(c0[0] === 0 && c0[1] === 0 && c0[2] === 255, 't=0 返回起始颜色');

var c1 = lerpColor(1, [0, 0, 255], [0, 255, 0]);
assert(c1[0] === 0 && c1[1] === 255 && c1[2] === 0, 't=1 返回结束颜色');

var cMid = lerpColor(0.5, [0, 0, 255], [0, 255, 0]);
assert(cMid[1] === 128, 't=0.5 中间值: G=' + cMid[1]);

// 越界处理
var cOver = lerpColor(2, [0, 0, 0], [255, 255, 255]);
assert(cOver[0] === 255, 't>1 clamp 到 1');

var cUnder = lerpColor(-1, [0, 0, 0], [255, 255, 255]);
assert(cUnder[0] === 0, 't<0 clamp 到 0');

// ── colorName ──
console.log('--- colorName ---');
assert(colorName(0) === '蓝色', 't=0 是蓝色');
assert(colorName(0.1) === '蓝色', 't=0.1 是蓝色');
assert(colorName(0.3) === '蓝绿色', 't=0.3 是蓝绿色');
assert(colorName(0.5) === '青色', 't=0.5 是青色');
assert(colorName(0.7) === '绿青色', 't=0.7 是绿青色');
assert(colorName(0.9) === '绿色', 't=0.9 是绿色');

// ── 配置完整性 ──
console.log('--- 配置完整性 ---');
assert(SAND_CONFIG.steps.length === SAND_CONFIG.totalSteps, '沙堆步数一致: ' + SAND_CONFIG.steps.length);
assert(SAND_CONFIG.steps[0] === SAND_CONFIG.startGrains, '沙堆起始值正确');
assert(SAND_CONFIG.steps[SAND_CONFIG.totalSteps - 1] === 0, '沙堆最后一步为0');

assert(BALD_CONFIG.steps.length === BALD_CONFIG.totalSteps, '秃头步数一致: ' + BALD_CONFIG.steps.length);
assert(BALD_CONFIG.steps[0] === BALD_CONFIG.startHairs, '秃头起始值正确');
assert(BALD_CONFIG.steps[BALD_CONFIG.totalSteps - 1] === 0, '秃头最后一步为0');

// 步骤递减
var sandDecreasing = SAND_CONFIG.steps.every(function(v, i, arr) {
  return i === 0 || v <= arr[i - 1];
});
assert(sandDecreasing, '沙堆步骤递减');

var baldDecreasing = BALD_CONFIG.steps.every(function(v, i, arr) {
  return i === 0 || v <= arr[i - 1];
});
assert(baldDecreasing, '秃头步骤递减');

console.log('\n\ud83d\udcca 结果: ' + passed + ' 通过, ' + failed + ' 失败\n');
process.exit(failed > 0 ? 1 : 0);
