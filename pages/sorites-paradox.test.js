// 沙堆悖论 — 核心算法测试
var logic = require('./sorites-paradox/logic.js');

var sandHeightPercent = logic.sandHeightPercent;
var sandWidthPercent = logic.sandWidthPercent;
var findBoundary = logic.findBoundary;
var findBoundaryFromConfidence = logic.findBoundaryFromConfidence;
var boundaryStats = logic.boundaryStats;
var bucketize = logic.bucketize;
var lerpColor = logic.lerpColor;
var colorName = logic.colorName;
var generateBaseImage = logic.generateBaseImage;
var perturbImage = logic.perturbImage;
var imageDiffPercent = logic.imageDiffPercent;
var mulberry32 = logic.mulberry32;
var classifyUser = logic.classifyUser;
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
assert(sandHeightPercent(5000, 10000) > 80, '5000粒 > 80%: ' + sandHeightPercent(5000, 10000));
assert(sandHeightPercent(100, 10000) < sandHeightPercent(1000, 10000), '100粒 < 1000粒');
assert(sandHeightPercent(-1, 10000) === 0, '负数 = 0%');
assert(sandHeightPercent(5, 0) === 0, 'maxGrains=0 返回 0');

// ── sandWidthPercent ──
console.log('--- sandWidthPercent ---');
assert(sandWidthPercent(10000, 10000) === 100, '满沙宽度 = 100%');
assert(sandWidthPercent(0, 10000) === 0, '0粒宽度 = 0');

// ── findBoundaryFromConfidence ──
console.log('--- findBoundaryFromConfidence ---');

var confVotes1 = [
  { grains: 10000, confidence: 95 },
  { grains: 5000, confidence: 80 },
  { grains: 1000, confidence: 60 },
  { grains: 500, confidence: 30 },
  { grains: 100, confidence: 10 }
];
var confResult1 = findBoundaryFromConfidence(confVotes1);
assert(confResult1.boundary === 750, '信心边界 = 750: ' + confResult1.boundary);
assert(confResult1.dropPoint === 3, 'dropPoint = 3: ' + confResult1.dropPoint);

// 断崖式下降
var cliffVotes = [
  { grains: 10000, confidence: 95 },
  { grains: 5000, confidence: 90 },
  { grains: 1000, confidence: 20 },
  { grains: 500, confidence: 5 }
];
var cliffResult = findBoundaryFromConfidence(cliffVotes);
assert(cliffResult.sharpness === 'cliff', '断崖 sharpness = cliff: ' + cliffResult.sharpness);

// 缓慢下降
var gradualVotes = [
  { grains: 10000, confidence: 90 },
  { grains: 8000, confidence: 80 },
  { grains: 6000, confidence: 70 },
  { grains: 4000, confidence: 55 },
  { grains: 2000, confidence: 40 },
  { grains: 1000, confidence: 30 }
];
var gradualResult = findBoundaryFromConfidence(gradualVotes);
assert(gradualResult.sharpness === 'gradual', '缓慢 sharpness = gradual: ' + gradualResult.sharpness);

// 全部 >= 50
var allHighVotes = [
  { grains: 10000, confidence: 95 },
  { grains: 100, confidence: 60 }
];
var allHighResult = findBoundaryFromConfidence(allHighVotes);
assert(allHighResult.sharpness === 'extreme-yes', '全高 = extreme-yes');
assert(allHighResult.boundary === 0, '全高 boundary = 0');

// 第一个就 < 50
var allLowVotes = [
  { grains: 10000, confidence: 30 },
  { grains: 5000, confidence: 10 }
];
var allLowResult = findBoundaryFromConfidence(allLowVotes);
assert(allLowResult.sharpness === 'extreme-no', '全低 = extreme-no');
assert(allLowResult.boundary === 10000, '全低 boundary = 10000');

// 空数组
assert(findBoundaryFromConfidence([]).boundary === -1, '空数组 boundary = -1');
assert(findBoundaryFromConfidence(null).boundary === -1, 'null boundary = -1');

// ── findBoundary (兼容旧版) ──
console.log('--- findBoundary ---');
var clearVotes = [
  { grains: 10000, isHeap: true },
  { grains: 2000, isHeap: true },
  { grains: 1000, isHeap: false },
  { grains: 100, isHeap: false }
];
assert(findBoundary(clearVotes).boundary === 1500, '旧版边界 = 1500');
assert(findBoundary(clearVotes).sharpness === 'sharp', '旧版 sharp');

// ── boundaryStats ──
console.log('--- boundaryStats ---');
var stats = boundaryStats([100, 200, 300, 400, 500]);
assert(stats.mean === 300, '均值 = 300');
assert(stats.median === 300, '中位数 = 300');
assert(stats.std > 0, '标准差 > 0');
assert(boundaryStats([]).mean === 0, '空数组均值 = 0');
assert(boundaryStats([10, 20, 30, 40]).median === 25, '偶数中位数 = 25');

// ── bucketize ──
console.log('--- bucketize ---');
var buckets = bucketize([500, 1500, 2500], 5, 5000);
assert(buckets.length === 5, '5个桶');
assert(buckets[0].count === 1, '第一个桶有1个');

// ── lerpColor ──
console.log('--- lerpColor ---');
var c0 = lerpColor(0, [0, 0, 255], [0, 255, 0]);
assert(c0[2] === 255, 't=0 蓝色');
var c1 = lerpColor(1, [0, 0, 255], [0, 255, 0]);
assert(c1[1] === 255, 't=1 绿色');
assert(lerpColor(2, [0, 0, 0], [255, 255, 255])[0] === 255, 't>1 clamp');

// ── colorName ──
console.log('--- colorName ---');
assert(colorName(0) === '蓝色', 't=0 蓝色');
assert(colorName(0.5) === '青色', 't=0.5 青色');
assert(colorName(0.9) === '绿色', 't=0.9 绿色');

// ── mulberry32 ──
console.log('--- mulberry32 ---');
var rng1 = mulberry32(42);
var rng2 = mulberry32(42);
assert(rng1() === rng2(), '相同种子产生相同序列');
var val = rng1();
assert(val >= 0 && val < 1, '值在 [0,1) 范围内: ' + val);

// ── generateBaseImage ──
console.log('--- generateBaseImage ---');
var img1 = generateBaseImage(8, 42);
assert(img1.length === 8 * 8 * 4, '8x8 图像数据长度正确: ' + img1.length);
assert(img1[3] === 255, 'alpha = 255');
// 确定性
var img1b = generateBaseImage(8, 42);
assert(img1[0] === img1b[0] && img1[1] === img1b[1], '相同种子生成相同图像');
// 不同种子不同
var img2 = generateBaseImage(8, 99);
var different = false;
for (var i = 0; i < img1.length; i++) { if (img1[i] !== img2[i]) { different = true; break; } }
assert(different, '不同种子生成不同图像');

// ── perturbImage ──
console.log('--- perturbImage ---');
var base = generateBaseImage(16, 42);
var perturbed = perturbImage(base, 16, 10, 50, 99);
assert(perturbed.length === base.length, '扰动后长度不变');
var hasDiff = false;
for (var j = 0; j < base.length; j++) { if (base[j] !== perturbed[j]) { hasDiff = true; break; } }
assert(hasDiff, '扰动后有差异');
// 0 扰动 = 无差异
var noPerturb = perturbImage(base, 16, 0, 50, 99);
var noDiff = true;
for (var k = 0; k < base.length; k++) { if (base[k] !== noPerturb[k]) { noDiff = false; break; } }
assert(noDiff, '0 扰动无差异');

// ── imageDiffPercent ──
console.log('--- imageDiffPercent ---');
assert(imageDiffPercent(base, base, 16) === 0, '相同图像差异 = 0%');
var heavyPerturb = perturbImage(base, 16, 256, 255, 99);
var diff = imageDiffPercent(base, heavyPerturb, 16);
assert(diff > 0, '大量扰动差异 > 0%: ' + diff);
assert(diff <= 100, '差异 <= 100%');

// ── classifyUser ──
console.log('--- classifyUser ---');
var tolerant = classifyUser(8000, 80, 1);
assert(tolerant.type === '模糊容忍者', '高容忍: ' + tolerant.type);
var precise = classifyUser(500, 20, 5);
assert(precise.type === '精确主义者' || precise.type === '二值逻辑人', '低容忍: ' + precise.type);
var mid = classifyUser(3000, 50, 3);
assert(mid.type !== undefined, '中间值有类型: ' + mid.type);

// ── 配置完整性 ──
console.log('--- 配置完整性 ---');
assert(SAND_CONFIG.steps.length === SAND_CONFIG.totalSteps, '沙堆步数一致');
assert(SAND_CONFIG.steps[0] === SAND_CONFIG.startGrains, '沙堆起始值正确');
assert(SAND_CONFIG.steps[SAND_CONFIG.totalSteps - 1] === 0, '沙堆最后一步为0');
var sandDecreasing = SAND_CONFIG.steps.every(function(v, i, arr) {
  return i === 0 || v <= arr[i - 1];
});
assert(sandDecreasing, '沙堆步骤递减');

console.log('\n\ud83d\udcca 结果: ' + passed + ' 通过, ' + failed + ' 失败\n');
process.exit(failed > 0 ? 1 : 0);
