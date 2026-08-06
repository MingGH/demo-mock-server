/**
 * 分形压缩引擎单元测试
 * 运行：node engine.test.js
 *
 * 注意：这里刻意不给 engine.js 提供 global.window，
 * 以此验证引擎在无浏览器环境下不会崩。
 */

global.ImageData = function (data, width, height) {
  this.data = data || new Uint8ClampedArray(width * height * 4);
  this.width = width;
  this.height = height;
};
global.document = {
  createElement: function () {
    return {
      width: 0, height: 0,
      getContext: function () {
        return {
          createImageData: function (w, h) {
            return new global.ImageData(new Uint8ClampedArray(w * h * 4), w, h);
          },
          putImageData: function () {}
        };
      }
    };
  }
};

var fc = require('./engine.js');

var passed = 0;
var failed = 0;

function check(condition, msg) {
  if (condition) {
    console.log('  \u2705 PASS: ' + msg);
    passed++;
  } else {
    console.error('  \u274C FAIL: ' + msg);
    failed++;
  }
}

function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  check(ok, msg + (ok ? '' : ' (expected ' + expected + ', got ' + actual + ')'));
}

function assertEqual(actual, expected, msg) {
  var ok = actual === expected;
  check(ok, msg + (ok ? '' : ' (expected ' + expected + ', got ' + actual + ')'));
}

function psnrOf(a, b) {
  var mse = 0;
  for (var i = 0; i < a.length; i++) {
    var d = a[i] - b[i];
    mse += d * d;
  }
  mse /= a.length;
  return mse > 0 ? 10 * Math.log10(255 * 255 / mse) : Infinity;
}

function grayOf(w, h) {
  return fc.toGrayscale(fc.generateSampleImage(w, h));
}

// ---------------------------------------------------------------------------
console.log('\n=== Test 1: toGrayscale ===');
(function () {
  var data = new Uint8ClampedArray([
    255, 0, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   128, 128, 128, 255
  ]);
  var gray = fc.toGrayscale(new global.ImageData(data, 2, 2));

  assertEqual(gray.length, 4, 'gray length');
  assertClose(gray[0], 76.245, 0.01, 'red pixel luminance');
  assertClose(gray[1], 149.685, 0.01, 'green pixel luminance');
  assertClose(gray[2], 29.07, 0.01, 'blue pixel luminance');
  assertClose(gray[3], 128, 0.01, 'gray pixel luminance');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 2: 无 window 环境下可正常加载 ===');
(function () {
  check(typeof global.window === 'undefined', 'engine.js 未依赖 window 即可 require');
  check(typeof fc.encode === 'function' && typeof fc.decode === 'function', '导出 encode / decode');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 3: applyTransform 是 8 种互不相同的等距变换 ===');
(function () {
  // 2x2 且四值互异时，D4 的 8 个元素给出 8 个不同排列，足以区分全部变换
  var block = new Float32Array([1, 2, 3, 4]);
  var seen = {};
  var allPermutations = true;

  for (var t = 0; t < fc.TRANSFORM_COUNT; t++) {
    var out = fc.applyTransform(block, 2, t);
    var key = Array.prototype.join.call(out, ',');
    seen[key] = true;
    // 等距变换只搬动像素，不改变像素集合
    var sorted = Array.prototype.slice.call(out).sort().join(',');
    if (sorted !== '1,2,3,4') allPermutations = false;
  }

  assertEqual(fc.TRANSFORM_COUNT, 8, '变换数量为 8');
  assertEqual(Object.keys(seen).length, 8, '8 种变换结果互不相同');
  check(allPermutations, '每种变换都是像素的重排（不新增/丢失灰度值）');

  var identity = fc.applyTransform(block, 2, 0);
  assertEqual(Array.prototype.join.call(identity, ','), '1,2,3,4', 'transform 0 是恒等变换');

  // 旋转 180 度做两次应回到原样
  var twice = fc.applyTransform(fc.applyTransform(block, 2, 2), 2, 2);
  assertEqual(Array.prototype.join.call(twice, ','), '1,2,3,4', 'rot180 自逆');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 4: gridSize 用 ceil 覆盖边缘 ===');
(function () {
  assertEqual(fc.gridSize(128, 128, 8).cols, 16, '128/8 = 16 列');
  assertEqual(fc.gridSize(128, 128, 12).cols, 11, '128/12 向上取整为 11 列（floor 会漏掉右边 8 像素）');
  assertEqual(fc.gridSize(100, 70, 8).rows, 9, '70/8 向上取整为 9 行');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 5: 分形码完整覆盖画布（回归：曾经出现黑边）===');
(function () {
  // 128 不能被 12 整除，是最早暴露黑边的那组参数
  var cases = [
    { w: 128, h: 128, rs: 4 },
    { w: 128, h: 128, rs: 8 },
    { w: 128, h: 128, rs: 12 },
    { w: 128, h: 128, rs: 16 },
    { w: 100, h: 70, rs: 8 }
  ];

  cases.forEach(function (c) {
    var gray = grayOf(c.w, c.h);
    var result = fc.encode(gray, c.w, c.h, { rangeSize: c.rs, stride: 4 });
    var cov = fc.coverage(result.code, c.w, c.h, c.rs);
    assertClose(cov, 1, 1e-9, c.w + 'x' + c.h + ' rangeSize=' + c.rs + ' 覆盖率为 100%');
  });
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 6: 解码结果没有未被写入的像素 ===');
(function () {
  var w = 128, h = 128, rs = 12;
  var gray = grayOf(w, h);
  var result = fc.encode(gray, w, h, { rangeSize: rs, stride: 4 });
  var decoded = fc.decode(result.code, w, h, rs, 12);

  // 未覆盖区域会停在初始化的 0，统计恰好为 0 的像素数
  var zeros = 0;
  for (var i = 0; i < decoded.length; i++) {
    if (decoded[i] === 0) zeros++;
  }
  // 原图本身就有纯黑像素的话允许少量为 0，但不该出现成片的 1984 像素黑边
  check(zeros < 50, '不存在成片未写入的黑边（zeros=' + zeros + '）');

  var real = psnrOf(gray, decoded);
  console.log('  rangeSize=12 真实解码 PSNR: ' + real.toFixed(2) + ' dB');
  check(real > 20, 'rangeSize=12 真实 PSNR > 20 dB（修复前只有 14.7）');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 7: domainSize 默认联动 rangeSize ===');
(function () {
  var w = 64, h = 64;
  var gray = grayOf(w, h);
  var explicit = fc.encode(gray, w, h, { rangeSize: 4, domainSize: 8, stride: 4 });
  var implicit = fc.encode(gray, w, h, { rangeSize: 4, stride: 4 });

  assertEqual(implicit.stats.domainPoolSize, explicit.stats.domainPoolSize, '不传 domainSize 时默认取 rangeSize*2');
  assertClose(implicit.stats.psnr, explicit.stats.psnr, 1e-9, '默认值与显式传值编码结果一致');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 8: 按位记账 estimateCompressedBytes ===');
(function () {
  var b = fc.estimateCompressedBytes(1, 841);
  assertEqual(b.indexBits, 10, '841 个域块需要 10 bit 索引');
  assertEqual(b.bitsPerBlock, 10 + 3 + 5 + 7, '每块 = 索引 + 变换3 + 缩放5 + 偏移7');
  assertEqual(b.totalBytes, 4, '单块向上取整为 4 字节');

  var many = fc.estimateCompressedBytes(256, 841);
  assertEqual(many.totalBits, 25 * 256, '256 块的总位数');
  assertEqual(many.totalBytes, 800, '256 块的总字节数');

  var degenerate = fc.estimateCompressedBytes(4, 1);
  assertEqual(degenerate.indexBits, 0, '池里只有 1 个域块时索引不占位');

  // 压缩比应该落在分形压缩的合理量级，而不是「每块固定 12 字节」拍出来的数
  var gray = grayOf(128, 128);
  var result = fc.encode(gray, 128, 128, { rangeSize: 8, stride: 4 });
  var ratio = parseFloat(result.stats.compressionRatio);
  console.log('  128x128 rangeSize=8 压缩比: ' + ratio + ':1，每块 ' + result.stats.bitsPerBlock + ' bit');
  check(ratio > 10 && ratio < 40, '压缩比在 10:1 ~ 40:1 之间（' + ratio + ':1）');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 9: 编解码往返质量 ===');
(function () {
  var w = 64, h = 64;
  var gray = grayOf(w, h);
  var result = fc.encode(gray, w, h, { rangeSize: 8, stride: 4 });

  assertEqual(result.stats.numBlocks, 64, '64x64 按 8x8 切出 64 块');
  check(result.stats.compressionRatio > 0, '压缩比 > 0');

  var ok = true;
  for (var i = 0; i < result.code.length; i++) {
    var e = result.code[i];
    if (typeof e.rx !== 'number' || typeof e.ry !== 'number') ok = false;
    if (typeof e.dx !== 'number' || typeof e.dy !== 'number') ok = false;
    if (!(e.transform >= 0 && e.transform <= 7)) ok = false;
    if (!isFinite(e.scale) || !isFinite(e.offset)) ok = false;
    if (!isFinite(e.mse)) ok = false;
  }
  check(ok, '每条分形码字段齐全且 mse 有限');

  var decoded = fc.decode(result.code, w, h, 8, 20);
  assertEqual(decoded.length, w * h, '解码长度正确');

  var minVal = Infinity, maxVal = -Infinity;
  for (var j = 0; j < decoded.length; j++) {
    if (decoded[j] < minVal) minVal = decoded[j];
    if (decoded[j] > maxVal) maxVal = decoded[j];
  }
  check(minVal >= 0 && maxVal <= 255, '解码像素落在 [0,255]');

  var real = psnrOf(gray, decoded);
  console.log('  往返 PSNR: ' + real.toFixed(2) + ' dB（拼贴 PSNR: ' + result.stats.psnr.toFixed(2) + ' dB）');
  // 64x64 只切出 64 块，本身就很粗糙；这条阈值用来兜住「编码器彻底跑偏」，
  // 编码器坏掉时 PSNR 会掉到 13 dB 以下
  check(real > 18, '往返 PSNR > 18 dB');
  // 拼贴定理只保证 d(x, F(x))，真实误差必然不优于它
  check(result.stats.psnr >= real - 0.01, '拼贴 PSNR 不低于真实解码 PSNR（符合拼贴定理方向）');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 9b: 拼贴图 F(原图) 的误差等于编码报告的拼贴 PSNR ===');
(function () {
  // 页面在编码后把 F(原图) 画出来当作"编码结果"，
  // 它的误差必须正好是统计条里那个拼贴 PSNR，否则图和数字对不上
  var w = 64, h = 64;
  var gray = grayOf(w, h);
  var result = fc.encode(gray, w, h, { rangeSize: 8, stride: 4 });

  var collage = fc.decodeOneIteration(gray, result.code, w, h, 8);
  var collagePSNR = psnrOf(gray, collage);

  console.log('  encode 报告：' + result.stats.psnr.toFixed(3) + ' dB，F(原图) 实测：' + collagePSNR.toFixed(3) + ' dB');
  // 差异只来自 decode 端对 [0,255] 的截断
  assertClose(collagePSNR, result.stats.psnr, 0.05, '两者一致（容差 0.05 dB）');

  var fixedPoint = fc.decode(result.code, w, h, 8, 20);
  check(psnrOf(gray, fixedPoint) < collagePSNR,
    '不动点比拼贴图更差（用户看到的是不动点，编码优化的是拼贴图）');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 10: 收缩性（|scale| < 1）===');
(function () {
  var gray = grayOf(64, 64);
  var result = fc.encode(gray, 64, 64, { rangeSize: 8, stride: 4 });
  var violations = 0;
  for (var i = 0; i < result.code.length; i++) {
    if (Math.abs(result.code[i].scale) >= 1) violations++;
  }
  assertEqual(violations, 0, '所有 |scale| < 1，迭代不会发散');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 11: 不动点与初始图像无关（噪音起点的理论依据）===');
(function () {
  var w = 64, h = 64;
  var gray = grayOf(w, h);
  var result = fc.encode(gray, w, h, { rangeSize: 8, stride: 4 });

  var noiseA = fc.createNoiseImage(w, h, fc.createSeededRandom(1));
  var noiseB = fc.createNoiseImage(w, h, fc.createSeededRandom(999));
  var flatGray = new Float32Array(w * h).fill(128);

  var fromA = fc.decode(result.code, w, h, 8, 30, null, noiseA);
  var fromB = fc.decode(result.code, w, h, 8, 30, null, noiseB);
  var fromGray = fc.decode(result.code, w, h, 8, 30, null, flatGray);

  var startDiff = psnrOf(noiseA, noiseB);
  console.log('  两个初始噪音之间 PSNR: ' + startDiff.toFixed(2) + ' dB（起点完全不同）');
  check(startDiff < 15, '两个初始噪音差异很大');

  var agreeAB = psnrOf(fromA, fromB);
  var agreeAGray = psnrOf(fromA, fromGray);
  console.log('  噪音A vs 噪音B 收敛结果: ' + agreeAB.toFixed(2) + ' dB');
  console.log('  噪音A vs 纯灰 收敛结果: ' + agreeAGray.toFixed(2) + ' dB');
  check(agreeAB > 60, '不同噪音起点收敛到同一不动点');
  check(agreeAGray > 60, '噪音起点与纯灰起点收敛到同一不动点');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 12: 随机源与初值注入 ===');
(function () {
  var a = fc.createNoiseImage(16, 16, fc.createSeededRandom(42));
  var b = fc.createNoiseImage(16, 16, fc.createSeededRandom(42));
  var c = fc.createNoiseImage(16, 16, fc.createSeededRandom(43));

  assertEqual(a.join(','), b.join(','), '同种子生成同一噪音（可复现）');
  check(a.join(',') !== c.join(','), '不同种子生成不同噪音');

  var inRange = true;
  for (var i = 0; i < a.length; i++) {
    if (a[i] < 0 || a[i] > 255) inRange = false;
  }
  check(inRange, '噪音像素落在 [0,255]');

  // 传入 initial 时不应被内部修改
  var initial = fc.createNoiseImage(32, 32, fc.createSeededRandom(7));
  var snapshot = initial.join(',');
  var gray = grayOf(32, 32);
  var result = fc.encode(gray, 32, 32, { rangeSize: 8, stride: 4 });
  fc.decode(result.code, 32, 32, 8, 3, null, initial);
  assertEqual(initial.join(','), snapshot, 'decode 不篡改调用方传入的初始数组');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 13: 逐步解码回调 ===');
(function () {
  var gray = grayOf(32, 32);
  var result = fc.encode(gray, 32, 32, { rangeSize: 8, stride: 4 });

  var iters = [];
  var totals = [];
  var snapshotLens = [];
  fc.decode(result.code, 32, 32, 8, 3, function (iter, total, snapshot) {
    iters.push(iter);
    totals.push(total);
    snapshotLens.push(snapshot.length);
  });

  assertEqual(iters.join(','), '1,2,3', '回调依次报告第 1/2/3 次迭代');
  assertEqual(totals[0], 3, '回调携带总迭代数');
  assertEqual(snapshotLens[0], 32 * 32, '回调携带完整快照');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 14: 逐次迭代单调收敛 ===');
(function () {
  var w = 64, h = 64;
  var gray = grayOf(w, h);
  var result = fc.encode(gray, w, h, { rangeSize: 8, stride: 4 });

  var series = [];
  fc.decode(result.code, w, h, 8, 12, function (iter, total, snapshot) {
    series.push(psnrOf(gray, snapshot));
  }, fc.createNoiseImage(w, h, fc.createSeededRandom(2026)));

  console.log('  各次迭代 PSNR: ' + series.map(function (v) { return v.toFixed(1); }).join(' '));
  // 前几次迭代 PSNR 快速上升，之后可能略微回落再稳定：
  // 迭代收敛到的是不动点，而不动点本身比中途某一帧略差，这正是拼贴误差与真实误差的差距
  check(series[2] > series[0], '第 3 次迭代优于第 1 次');
  check(series[11] > series[2], '第 12 次迭代优于第 3 次');
  check(Math.abs(series[11] - series[10]) < 1, '末尾两次迭代差距 < 1 dB，已收敛');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 15: 域块池为空时的退化处理 ===');
(function () {
  // 图比域块还小，池必然为空，此时必须退化为常量近似而不是产生 Infinity
  var gray = grayOf(8, 8);
  var result = fc.encode(gray, 8, 8, { rangeSize: 8, stride: 4 });

  assertEqual(result.stats.domainPoolSize, 0, '8x8 图在 rangeSize=8 时域块池为空');
  check(isFinite(result.stats.avgMSE), 'avgMSE 有限（不是 Infinity）');
  check(isFinite(result.stats.psnr), 'psnr 有限（不是 NaN/Infinity）');
  assertEqual(result.code[0].scale, 0, '退化码的 scale 为 0（常量块）');
  check(result.code[0].offset >= 0 && result.code[0].offset <= 255, '退化码的 offset 是块均值');

  var decoded = fc.decode(result.code, 8, 8, 8, 5);
  var flat = true;
  for (var i = 1; i < decoded.length; i++) {
    if (Math.abs(decoded[i] - decoded[0]) > 1e-6) flat = false;
  }
  check(flat, '退化码解码出常量块');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 16: buildDomainPool 公开接口 ===');
(function () {
  var gray = grayOf(32, 32);
  var pool = fc.buildDomainPool(gray, 32, 32, 8, 16, 8);
  assertEqual(pool.length, 9, '32x32 / domainSize=16 / stride=8 得到 3x3=9 个域块');
  check(pool[0].data instanceof Float32Array, '域块自带下采样后的数据');
  assertEqual(pool[0].data.length, 64, '域块数据已下采样到 rangeSize^2');

  var defaulted = fc.buildDomainPool(gray, 32, 32, 8);
  assertEqual(defaulted.length, fc.buildDomainPool(gray, 32, 32, 8, 16, 4).length,
    '省略 domainSize/stride 时使用默认值 rangeSize*2 与 4');
})();

// ---------------------------------------------------------------------------
console.log('\n=== Test 17: 示例图生成 ===');
(function () {
  var sample = fc.generateSampleImage(32, 32);
  assertEqual(sample.width, 32, 'sample width');
  assertEqual(sample.height, 32, 'sample height');
  assertEqual(sample.data.length, 32 * 32 * 4, 'sample data length');

  var portrait = fc.generatePortraitImage(32, 32);
  assertEqual(portrait.width, 32, 'portrait width');
  assertEqual(portrait.height, 32, 'portrait height');
  assertEqual(portrait.data.length, 32 * 32 * 4, 'portrait data length');

  var g = fc.toGrayscale(portrait);
  var min = Infinity, max = -Infinity;
  for (var i = 0; i < g.length; i++) {
    if (g[i] < min) min = g[i];
    if (g[i] > max) max = g[i];
  }
  check(max - min > 20, '示例图有足够的灰度变化（不是一块死板）');
})();

console.log('\n===============================');
console.log('Total: ' + (passed + failed) + ' (' + passed + ' passed, ' + failed + ' failed)');
if (failed > 0) process.exit(1);
