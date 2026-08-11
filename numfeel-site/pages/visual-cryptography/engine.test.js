// ========== 视觉密码学引擎 单元测试 ==========
// 运行: node pages/visual-cryptography/engine.test.js

var VC = require('./engine.js');
var toGrayscale = VC.toGrayscale;
var floydSteinberg = VC.floydSteinberg;
var binarize = VC.binarize;
var splitShares = VC.splitShares;
var overlayShares = VC.overlayShares;
var overlayPartial = VC.overlayPartial;
var blackRatio = VC.blackRatio;

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + msg);
  } else {
    failed++;
    console.log('  \u2717 ' + msg);
  }
}

function assertApprox(a, b, tolerance, msg) {
  assert(Math.abs(a - b) <= tolerance, msg + ' (got ' + a + ', expected ~' + b + ')');
}

// ── 测试 1: toGrayscale 正确转换 ──
console.log('\n[toGrayscale]');
(function () {
  var imageData = {
    data: new Uint8ClampedArray([
      255, 0, 0, 255,   // 红色 -> 0.299*255 = 76.245
      0, 255, 0, 255,   // 绿色 -> 0.587*255 = 149.685
      0, 0, 255, 255,   // 蓝色 -> 0.114*255 = 29.07
      255, 255, 255, 255 // 白色 -> 255
    ]),
    width: 2,
    height: 2
  };
  var gray = toGrayscale(imageData);
  assertApprox(gray[0], 76.245, 0.5, '红色 -> ~76');
  assertApprox(gray[1], 149.685, 0.5, '绿色 -> ~150');
  assertApprox(gray[2], 29.07, 0.5, '蓝色 -> ~29');
  assertApprox(gray[3], 255, 0.5, '白色 -> 255');
})();

// ── 测试 2: floydSteinberg 纯黑/纯白不变 ──
console.log('\n[floydSteinberg 边界]');
(function () {
  var black = new Float32Array(25).fill(0);
  var white = new Float32Array(25).fill(255);
  var outB = floydSteinberg(black, 5, 5, 128);
  var outW = floydSteinberg(white, 5, 5, 128);

  var allBlack = true, allWhite = true;
  for (var i = 0; i < 25; i++) {
    if (outB[i] !== 0) allBlack = false;
    if (outW[i] !== 255) allWhite = false;
  }
  assert(allBlack, '纯黑输入 -> 全黑输出');
  assert(allWhite, '纯白输入 -> 全白输出');
})();

// ── 测试 3: floydSteinberg 输出只有 0 和 255 ──
console.log('\n[floydSteinberg 二值输出]');
(function () {
  var gray = new Float32Array(100);
  for (var i = 0; i < 100; i++) gray[i] = Math.random() * 255;
  var out = floydSteinberg(gray, 10, 10, 128);
  var allBinary = true;
  for (var i = 0; i < out.length; i++) {
    if (out[i] !== 0 && out[i] !== 255) { allBinary = false; break; }
  }
  assert(allBinary, '随机输入 -> 输出全为 0 或 255');
})();

// ── 测试 4: floydSteinberg 误差守恒 ──
console.log('\n[floydSteinberg 误差守恒]');
(function () {
  var size = 100;
  var gray = new Float32Array(size * size).fill(128);
  var out = floydSteinberg(gray, size, size, 128);
  var ratio = blackRatio(out);
  assertApprox(ratio, 0.5, 0.05, '128 灰度 -> 约 50% 黑色');
})();

// ── 测试 5: splitShares 输出尺寸正确 ──
console.log('\n[splitShares 尺寸]');
(function () {
  var binary = new Uint8Array(4 * 4);
  for (var i = 0; i < 16; i++) binary[i] = i % 2 === 0 ? 0 : 255;
  var result = splitShares(binary, 4, 4);
  assert(result.width === 8, '宽度翻倍: 4 -> 8');
  assert(result.height === 8, '高度翻倍: 4 -> 8（保持长宽比）');
  assert(result.share1.length === 64, 'share1 长度 = 8*8 = 64');
  assert(result.share2.length === 64, 'share2 长度 = 8*8 = 64');
})();

// ── 测试 6: splitShares 输出只有 0 和 255 ──
console.log('\n[splitShares 二值输出]');
(function () {
  var binary = new Uint8Array(50 * 50);
  for (var i = 0; i < binary.length; i++) binary[i] = Math.random() < 0.5 ? 0 : 255;
  var result = splitShares(binary, 50, 50);
  var allBinary = true;
  for (var i = 0; i < result.share1.length; i++) {
    if (result.share1[i] !== 0 && result.share1[i] !== 255) { allBinary = false; break; }
  }
  for (var i = 0; i < result.share2.length; i++) {
    if (result.share2[i] !== 0 && result.share2[i] !== 255) { allBinary = false; break; }
  }
  assert(allBinary, '两张 share 均只含 0 和 255');
})();

// ── 测试 7: 单张 share 看起来像随机噪声（约 50% 黑） ──
console.log('\n[splitShares 单张随机性]');
(function () {
  var size = 100;
  var binary = new Uint8Array(size * size);
  for (var i = 0; i < binary.length; i++) binary[i] = Math.random() < 0.5 ? 0 : 255;
  var result = splitShares(binary, size, size);
  var r1 = blackRatio(result.share1);
  var r2 = blackRatio(result.share2);
  assertApprox(r1, 0.5, 0.08, 'share1 黑色占比 ~50%');
  assertApprox(r2, 0.5, 0.08, 'share2 黑色占比 ~50%');
})();

// ── 测试 8: 单张 share 不泄露原图信息（全黑和全白区域的 share 统计相同） ──
console.log('\n[splitShares 安全性]');
(function () {
  var size = 200;
  var allBlack = new Uint8Array(size * size).fill(0);
  var allWhite = new Uint8Array(size * size).fill(255);
  var resBlack = splitShares(allBlack, size, size);
  var resWhite = splitShares(allWhite, size, size);
  var rBlack1 = blackRatio(resBlack.share1);
  var rWhite1 = blackRatio(resWhite.share1);
  assertApprox(rBlack1, 0.5, 0.06, '全黑图 share1 ~50%');
  assertApprox(rWhite1, 0.5, 0.06, '全白图 share1 ~50%');
  assert(
    Math.abs(rBlack1 - rWhite1) < 0.1,
    '全黑 vs 全白 share1 黑色占比无显著差异（安全性）'
  );
})();

// ── 测试 9: overlayShares 完全叠加还原原图 ──
console.log('\n[overlayShares 还原]');
(function () {
  var size = 50;
  var binary = new Uint8Array(size * size);
  for (var i = 0; i < binary.length; i++) binary[i] = Math.random() < 0.5 ? 0 : 255;
  var result = splitShares(binary, size, size);
  var overlaid = overlayShares(result.share1, result.share2, result.width, result.height);

  // 还原后的图是 2x2 放大的，每 2×2 子像素对应 1 个原图像素
  // 白像素 -> 模式相同 -> 2 黑 2 白 (50% 灰)
  // 黑像素 -> 模式互补 -> 4 子像素全黑 (100% 黑)
  var correct = true;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var idx = y * result.width * 2 + x * 2;
      var block = [
        overlaid[idx], overlaid[idx + 1],
        overlaid[idx + result.width], overlaid[idx + result.width + 1]
      ];
      var blackCount = 0;
      for (var k = 0; k < 4; k++) if (block[k] === 0) blackCount++;
      if (binary[y * size + x] === 0) {
        if (blackCount !== 4) { correct = false; break; }
      } else {
        if (blackCount !== 2) { correct = false; break; }
      }
    }
    if (!correct) break;
  }
  assert(correct, '叠加后每个像素 2×2 块正确还原（黑=4黑, 白=2黑2白）');
})();

// ── 测试 10: overlayShares 叠加后黑色区域比白色区域更黑 ──
console.log('\n[overlayShares 对比度]');
(function () {
  var size = 100;
  // 上半黑下半白
  var binary = new Uint8Array(size * size);
  for (var i = 0; i < binary.length; i++) {
    binary[i] = i < size * size / 2 ? 0 : 255;
  }
  var result = splitShares(binary, size, size);
  var overlaid = overlayShares(result.share1, result.share2, result.width, result.height);

  // 统计上半部分（黑）和下半部分（白）的黑色占比
  var blackAreaBlack = 0, whiteAreaBlack = 0;
  var halfLen = overlaid.length / 2;
  for (var i = 0; i < halfLen; i++) {
    if (overlaid[i] === 0) blackAreaBlack++;
  }
  for (var i = halfLen; i < overlaid.length; i++) {
    if (overlaid[i] === 0) whiteAreaBlack++;
  }
  var blackRatio1 = blackAreaBlack / halfLen;
  var whiteRatio1 = whiteAreaBlack / halfLen;
  assert(blackRatio1 === 1.0, '黑色区域叠加后 100% 黑');
  assertApprox(whiteRatio1, 0.5, 0.06, '白色区域叠加后 ~50% 黑（灰）');
  assert(blackRatio1 > whiteRatio1, '黑色区域比白色区域更黑（有对比度）');
})();

// ── 测试 11: overlayPartial 偏移为 0 时等于完全叠加 ──
console.log('\n[overlayPartial 零偏移]');
(function () {
  var size = 30;
  var binary = new Uint8Array(size * size);
  for (var i = 0; i < binary.length; i++) binary[i] = Math.random() < 0.5 ? 0 : 255;
  var result = splitShares(binary, size, size);
  var full = overlayShares(result.share1, result.share2, result.width, result.height);
  var partial = overlayPartial(result.share1, result.share2, result.width, result.height, 0, 0);

  var identical = true;
  for (var i = 0; i < full.length; i++) {
    if (full[i] !== partial[i]) { identical = false; break; }
  }
  assert(identical, '偏移 (0,0) 时 overlayPartial === overlayShares');
})();

// ── 测试 12: overlayPartial 大偏移时只显示 share1 ──
console.log('\n[overlayPartial 大偏移]');
(function () {
  var w = 40, h = 30;
  var s1 = new Uint8Array(w * h);
  var s2 = new Uint8Array(w * h);
  for (var i = 0; i < s1.length; i++) {
    s1[i] = i % 2 === 0 ? 0 : 255;
    s2[i] = i % 3 === 0 ? 0 : 255;
  }
  // 偏移超出范围，无重叠
  var partial = overlayPartial(s1, s2, w, h, w + 10, h + 10);
  var identical = true;
  for (var i = 0; i < s1.length; i++) {
    if (partial[i] !== s1[i]) { identical = false; break; }
  }
  assert(identical, '偏移超出范围时结果 === share1');
})();

// ── 测试 13: overlayPartial 部分偏移时重叠区域正确 ──
console.log('\n[overlayPartial 部分偏移]');
(function () {
  var w = 4, h = 4;
  // share1: 全白
  var s1 = new Uint8Array(w * h).fill(255);
  // share2: 全黑
  var s2 = new Uint8Array(w * h).fill(0);
  // 偏移 (1, 0)：第二列开始重叠
  var partial = overlayPartial(s1, s2, w, h, 1, 0);

  // 第 0 列不重叠，应保持 share1 (全白)
  var col0White = true;
  for (var y = 0; y < h; y++) {
    if (partial[y * w + 0] !== 255) { col0White = false; break; }
  }
  assert(col0White, '非重叠区域保持 share1 (白)');

  // 第 1-3 列重叠，应为 OR(255, 0) = 0 (黑)
  var col1Black = true;
  for (var y = 0; y < h; y++) {
    for (var x = 1; x < w; x++) {
      if (partial[y * w + x] !== 0) { col1Black = false; break; }
    }
  }
  assert(col1Black, '重叠区域 OR(白,黑) = 黑');
})();

// ── 结果 ──
console.log('\n' + '='.repeat(40));
console.log('结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) process.exit(1);
