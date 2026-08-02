/**
 * engine.test.js - Seam Carving 核心逻辑单元测试
 * 运行：node numfeel-site/pages/seam-carving/engine.test.js
 *
 * 覆盖：
 *   1. 能量图计算
 *   2. 垂直接缝查找（DP）
 *   3. 水平接缝查找
 *   4. 垂直接缝移除
 *   5. 水平接缝移除
 *   6. 单条接缝雕刻
 *   7. 随机事实
 *   8. 边界情况（1x1, 1xn, nx1）
 */

var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✅ ' + msg);
  } else {
    failed++;
    console.error('  ❌ ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + ' (期望 ' + expected + ', 实际 ' + actual + ')');
}

function makeTestData(w, h, r, g, b, a) {
  r = r || 128; g = g || 128; b = b || 128; a = a || 255;
  var data = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

function makeCheckerData(w, h) {
  var data = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var val = (x + y) % 2 === 0 ? 255 : 0;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
}

function makeGradientData(w, h) {
  var data = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      data[idx] = Math.round(x / w * 255);
      data[idx + 1] = Math.round(y / h * 255);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  return data;
}

function makeEdgeData(w, h) {
  var data = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var cx = Math.floor(w / 2), cy = Math.floor(h / 2);
      var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      var val = Math.round(Math.sin(dist * 0.8) * 127 + 128);
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return data;
}

function makeLeftRightData(w, h) {
  var data = new Uint8ClampedArray(w * h * 4);
  var half = Math.floor(w / 2);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      if (x < half) {
        data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255;
      } else {
        data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0;
      }
      data[idx + 3] = 255;
    }
  }
  return data;
}

// ────────────────────────────────────────────
console.log('\n⚡ 能量图计算');

(function () {
  var data = makeTestData(4, 4, 128, 128, 128);
  var energy = engine.computeEnergy(data, 4, 4);
  assertEqual(energy.length, 16, '能量图大小 = 像素数');
  var allZero = true;
  for (var i = 0; i < energy.length; i++) {
    if (energy[i] !== 0) { allZero = false; break; }
  }
  assert(allZero, '纯色图像能量图为 0');
})();

(function () {
  var data = makeLeftRightData(4, 4);
  var energy = engine.computeEnergy(data, 4, 4);
  var hasEnergy = false;
  for (var i = 0; i < energy.length; i++) {
    if (energy[i] > 0) { hasEnergy = true; break; }
  }
  assert(hasEnergy, '左右分界图像能量图有非零值');
})();

(function () {
  var data = makeLeftRightData(10, 10);
  var energy = engine.computeEnergy(data, 10, 10);
  var lrEnergy = 0;
  for (var y = 0; y < 10; y++) {
    lrEnergy += energy[y * 10 + 4];
  }
  assert(lrEnergy > 0, '左右分界处能量高');
})();

// ────────────────────────────────────────────
console.log('\n🔍 垂直接缝查找');

(function () {
  var data = makeLeftRightData(10, 10);
  var energy = engine.computeEnergy(data, 10, 10);
  var seam = engine.findVerticalSeam(energy, 10, 10);
  assertEqual(seam.length, 10, '垂直接缝有 height 个元素');
  var valid = true;
  for (var i = 0; i < seam.length; i++) {
    if (seam[i] < 0 || seam[i] >= 10) { valid = false; break; }
  }
  assert(valid, '接缝坐标在有效范围内');

  var adjacent = true;
  for (var i = 1; i < seam.length; i++) {
    if (Math.abs(seam[i] - seam[i - 1]) > 1) { adjacent = false; break; }
  }
  assert(adjacent, '相邻行接缝坐标差不超过 1');
})();

(function () {
  var data = makeTestData(5, 5, 128, 128, 128);
  var energy = engine.computeEnergy(data, 5, 5);
  var seam = engine.findVerticalSeam(energy, 5, 5);
  assertEqual(seam.length, 5, '纯色图也能找到接缝');
})();

(function () {
  var data = makeEdgeData(12, 12);
  var energy = engine.computeEnergy(data, 12, 12);
  var seam = engine.findVerticalSeam(energy, 12, 12);
  var allSame = true;
  for (var i = 1; i < seam.length; i++) {
    if (seam[i] !== seam[0]) { allSame = false; break; }
  }
  assert(!allSame, '梯度图接缝不会全在同一列');
})();

// ────────────────────────────────────────────
console.log('\n➡️ 水平接缝查找');

(function () {
  var data = makeLeftRightData(10, 10);
  var energy = engine.computeEnergy(data, 10, 10);
  var seam = engine.findHorizontalSeam(energy, 10, 10);
  assertEqual(seam.length, 10, '水平接缝有 width 个元素');
  var valid = true;
  for (var i = 0; i < seam.length; i++) {
    if (seam[i] < 0 || seam[i] >= 10) { valid = false; break; }
  }
  assert(valid, '水平接缝坐标在有效范围内');
})();

// ────────────────────────────────────────────
console.log('\n✂️ 垂直接缝移除');

(function () {
  var data = makeTestData(5, 5, 128, 128, 128);
  var energy = engine.computeEnergy(data, 5, 5);
  var seam = engine.findVerticalSeam(energy, 5, 5);
  var result = engine.removeVerticalSeam(data, 5, 5, seam);
  assertEqual(result.width, 4, '移除后宽度减 1');
  assertEqual(result.height, 5, '移除后高度不变');
  assertEqual(result.data.length, 4 * 5 * 4, '像素数据大小正确');
})();

(function () {
  var data = makeCheckerData(6, 6);
  var energy = engine.computeEnergy(data, 6, 6);
  var seam = engine.findVerticalSeam(energy, 6, 6);
  var result = engine.removeVerticalSeam(data, 6, 6, seam);
  assertEqual(result.width, 5, '棋盘格移除后宽度减 1');
  assertEqual(result.height, 6, '棋盘格移除后高度不变');
  var seamX = seam[0];
  var expectedFirstR = seamX === 0 ? data[4] : data[0];
  assertEqual(result.data[0], expectedFirstR, '移除后第一个像素正确');
})();

(function () {
  var data = makeTestData(2, 2, 100, 150, 200);
  var energy = engine.computeEnergy(data, 2, 2);
  var seam = engine.findVerticalSeam(energy, 2, 2);
  var result = engine.removeVerticalSeam(data, 2, 2, seam);
  assertEqual(result.width, 1, '2x2 移除后宽度为 1');
  assertEqual(result.height, 2, '2x2 移除后高度不变');
})();

// ────────────────────────────────────────────
console.log('\n✂️ 水平接缝移除');

(function () {
  var data = makeTestData(5, 5, 128, 128, 128);
  var energy = engine.computeEnergy(data, 5, 5);
  var seam = engine.findHorizontalSeam(energy, 5, 5);
  var result = engine.removeHorizontalSeam(data, 5, 5, seam);
  assertEqual(result.width, 5, '水平移除后宽度不变');
  assertEqual(result.height, 4, '水平移除后高度减 1');
  assertEqual(result.data.length, 5 * 4 * 4, '像素数据大小正确');
})();

// ────────────────────────────────────────────
console.log('\n🪡 单条接缝雕刻');

(function () {
  var data = makeCheckerData(8, 8);
  var result = engine.carveOneSeam(data, 8, 8, 'vertical');
  assertEqual(result.width, 7, '单次雕刻宽度减 1');
  assertEqual(result.height, 8, '单次雕刻高度不变');
  assert(result.seam.length === 8, '返回的接缝长度正确');
  assert(result.energy.length === 64, '返回的能量图大小正确');
})();

(function () {
  var data = makeCheckerData(8, 8);
  var result = engine.carveOneSeam(data, 8, 8, 'horizontal');
  assertEqual(result.width, 8, '水平单次雕刻宽度不变');
  assertEqual(result.height, 7, '水平单次雕刻高度减 1');
})();

(function () {
  var data = makeTestData(20, 20, 128, 128, 128);
  var r1 = engine.carveOneSeam(data, 20, 20, 'vertical');
  var r2 = engine.carveOneSeam(r1.data, r1.width, r1.height, 'vertical');
  assertEqual(r2.width, 18, '两次雕刻后宽度减 2');
  assertEqual(r2.height, 20, '高度不变');
})();

// ────────────────────────────────────────────
console.log('\n🎲 随机事实');

(function () {
  var fact = engine.getRandomFact();
  assert(typeof fact === 'string' && fact.length > 0, '返回非空字符串');
  var facts = [];
  for (var i = 0; i < 50; i++) {
    facts.push(engine.getRandomFact());
  }
  var hasVariety = false;
  for (var i = 1; i < facts.length; i++) {
    if (facts[i] !== facts[0]) { hasVariety = true; break; }
  }
  assert(hasVariety, '多次调用返回不同事实');
})();

// ────────────────────────────────────────────
console.log('\n⚠️ 边界情况');

(function () {
  var data = makeTestData(1, 1, 128, 128, 128);
  var energy = engine.computeEnergy(data, 1, 1);
  assertEqual(energy.length, 1, '1x1 图像能量图大小正确');
  assertEqual(energy[0], 0, '1x1 纯色能量为 0');
})();

(function () {
  var data = makeTestData(1, 10, 128, 128, 128);
  var energy = engine.computeEnergy(data, 1, 10);
  var seam = engine.findVerticalSeam(energy, 1, 10);
  assertEqual(seam.length, 10, '1xn 图像垂直接缝长度正确');
  var allZero = true;
  for (var i = 0; i < seam.length; i++) {
    if (seam[i] !== 0) { allZero = false; break; }
  }
  assert(allZero, '1xn 图像接缝全在 x=0');
})();

(function () {
  var data = makeTestData(10, 1, 128, 128, 128);
  var energy = engine.computeEnergy(data, 10, 1);
  var seam = engine.findHorizontalSeam(energy, 10, 1);
  assertEqual(seam.length, 10, 'nx1 图像水平接缝长度正确');
})();

// ────────────────────────────────────────────
console.log('\n====================');
console.log('总计: ' + (passed + failed) + ' 测试');
console.log('通过: ' + passed);
console.log('失败: ' + failed);
if (failed > 0) process.exit(1);