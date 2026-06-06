// 测试文件：曼德勃罗集核心算法
const {
  mandelbrotEscape, iterToColor, iterToColorFire, iterToColorIce, iterToColorRainbow,
  hslToRgb, computeRegion, estimateInterest, getViewportInfo, PRESETS
} = require('./mandelbrot/engine.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n🧪 曼德勃罗集 - 核心算法测试\n');

// ── mandelbrotEscape ──
console.log('--- mandelbrotEscape ---');

// 原点 (0,0) 属于集合内部（z 始终为 0）
assert(mandelbrotEscape(0, 0, 1000) === 1000, '原点 (0,0) 在集合内部');

// (-1, 0) 也在集合内部（振荡于 0 和 -1 之间）
assert(mandelbrotEscape(-1, 0, 1000) === 1000, '(-1, 0) 在集合内部');

// (-2, 0) 是集合边界点（周期 2 不动点）
assert(mandelbrotEscape(-2, 0, 1000) === 1000, '(-2, 0) 在集合边界');

// (1, 0) 明显在集合外部
const escapeAt1 = mandelbrotEscape(1, 0, 1000);
assert(escapeAt1 < 1000, `(1, 0) 逃逸: iter=${escapeAt1.toFixed(1)}`);
assert(escapeAt1 < 10, '(1, 0) 快速逃逸');

// (2, 0) 立即逃逸
const escapeAt2 = mandelbrotEscape(2, 0, 1000);
assert(escapeAt2 < 5, `(2, 0) 立即逃逸: iter=${escapeAt2.toFixed(1)}`);

// (0.3, 0.5) 在集合内部（主心形区域内）
assert(mandelbrotEscape(0.3, 0.5, 1000) === 1000, '(0.3, 0.5) 在集合内部');

// (0.5, 0.5) 在集合外部
const escapeHalf = mandelbrotEscape(0.5, 0.5, 1000);
assert(escapeHalf < 1000, `(0.5, 0.5) 逃逸: iter=${escapeHalf.toFixed(1)}`);

// 对称性：(a, b) 和 (a, -b) 的迭代次数相同
const iter1 = mandelbrotEscape(-0.7, 0.3, 500);
const iter2 = mandelbrotEscape(-0.7, -0.3, 500);
assert(Math.abs(iter1 - iter2) < 0.001, `对称性: iter(-0.7,0.3)=${iter1.toFixed(2)} == iter(-0.7,-0.3)=${iter2.toFixed(2)}`);

// 平滑迭代值应大于整数迭代
const smoothVal = mandelbrotEscape(0.5, 0.5, 200);
assert(smoothVal > 0 && smoothVal % 1 !== 0, `平滑迭代返回非整数: ${smoothVal.toFixed(4)}`);

// ── iterToColor ──
console.log('--- iterToColor ---');

// 集合内部应返回黑色
const black = iterToColor(200, 200);
assert(black.r === 0 && black.g === 0 && black.b === 0, '集合内部为黑色');

// 逃逸点应返回非黑色
const color1 = iterToColor(10, 200);
assert(color1.r + color1.g + color1.b > 0, '逃逸点有颜色');

// 不同迭代次数应有不同颜色
const colorA = iterToColor(20, 200);
const colorB = iterToColor(100, 200);
assert(
  colorA.r !== colorB.r || colorA.g !== colorB.g || colorA.b !== colorB.b,
  '不同迭代有不同颜色'
);

// RGB 值在合法范围
const colorC = iterToColor(50, 200);
assert(colorC.r >= 0 && colorC.r <= 255, `R 值合法: ${colorC.r}`);
assert(colorC.g >= 0 && colorC.g <= 255, `G 值合法: ${colorC.g}`);
assert(colorC.b >= 0 && colorC.b <= 255, `B 值合法: ${colorC.b}`);

// ── 其他配色方案 ──
console.log('--- 配色方案 ---');

const fire = iterToColorFire(50, 200);
assert(fire.r >= 0 && fire.r <= 255, `Fire R: ${fire.r}`);
assert(iterToColorFire(200, 200).r === 0, 'Fire 内部为黑色');

const ice = iterToColorIce(50, 200);
assert(ice.r >= 0 && ice.r <= 255, `Ice R: ${ice.r}`);
assert(iterToColorIce(200, 200).r === 0, 'Ice 内部为黑色');

const rainbow = iterToColorRainbow(50, 200);
assert(rainbow.r >= 0 && rainbow.r <= 255, `Rainbow R: ${rainbow.r}`);
assert(iterToColorRainbow(200, 200).r === 0, 'Rainbow 内部为黑色');

// ── hslToRgb ──
console.log('--- hslToRgb ---');

const red = hslToRgb(0, 1, 0.5);
assert(red.r === 255 && red.g === 0 && red.b === 0, `纯红: (${red.r},${red.g},${red.b})`);

const white = hslToRgb(0, 0, 1);
assert(white.r === 255 && white.g === 255 && white.b === 255, '白色');

const black2 = hslToRgb(0, 0, 0);
assert(black2.r === 0 && black2.g === 0 && black2.b === 0, '黑色');

// ── computeRegion ──
console.log('--- computeRegion ---');

const region = computeRegion(10, 10, -0.5, 0, 1, 100);
assert(region.length === 100, `计算区域大小: ${region.length}`);
assert(region instanceof Float64Array, '返回 Float64Array');

// 区域中应有集合内部点和外部点
let hasInside = false, hasOutside = false;
for (let i = 0; i < region.length; i++) {
  if (region[i] >= 100) hasInside = true;
  if (region[i] < 100) hasOutside = true;
}
assert(hasInside, '区域包含集合内部点');
assert(hasOutside, '区域包含集合外部点');

// ── estimateInterest ──
console.log('--- estimateInterest ---');

const allInside = new Float64Array(100).fill(200);
assert(estimateInterest(allInside, 200) === 0, '全内部兴趣度为0');

const allFastEscape = new Float64Array(100).fill(1);
assert(estimateInterest(allFastEscape, 200) === 0, '全快速逃逸兴趣度为0');

const mixed = new Float64Array([50, 100, 150, 200, 1]);
assert(estimateInterest(mixed, 200) === 0.6, `混合兴趣度: ${estimateInterest(mixed, 200)}`);

// ── getViewportInfo ──
console.log('--- getViewportInfo ---');

const vp = getViewportInfo(800, 600, -0.5, 0, 1);
assert(vp.realMin < -0.5 && vp.realMax > -0.5, `实部范围包含中心: [${vp.realMin.toFixed(2)}, ${vp.realMax.toFixed(2)}]`);
assert(vp.imagMin < 0 && vp.imagMax > 0, '虚部范围包含中心');
assert(vp.pixelSize > 0, `像素尺寸: ${vp.pixelSize}`);

// 放大后像素尺寸应减小
const vp2 = getViewportInfo(800, 600, -0.5, 0, 10);
assert(vp2.pixelSize < vp.pixelSize, '放大后像素尺寸更小');

// ── PRESETS ──
console.log('--- PRESETS ---');

assert(Array.isArray(PRESETS) && PRESETS.length >= 5, `预设数量: ${PRESETS.length}`);
PRESETS.forEach((p, i) => {
  assert(typeof p.name === 'string' && p.name.length > 0, `预设${i} 有名称: ${p.name}`);
  assert(typeof p.x === 'number' && typeof p.y === 'number', `预设${i} 坐标合法`);
  assert(p.zoom >= 1, `预设${i} 缩放 >= 1: ${p.zoom}`);
});

// 第一个预设应是全貌
assert(PRESETS[0].x === -0.5 && PRESETS[0].y === 0 && PRESETS[0].zoom === 1, '第一个预设是全貌');

// ── 性能基准 ──
console.log('--- 性能基准 ---');
const start = Date.now();
computeRegion(100, 100, -0.5, 0, 1, 200);
const elapsed = Date.now() - start;
assert(elapsed < 5000, `100×100 渲染 <5s: ${elapsed}ms`);
console.log(`  ℹ️  100×100 @ 200 iter 耗时: ${elapsed}ms`);

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
