/**
 * ecb-penguin.test.js - ECB 企鹅图核心逻辑单元测试
 * 运行：node numfeel-site/pages/ecb-penguin/ecb-penguin.test.js
 *
 * 覆盖：
 *   1. PKCS7 填充/去填充
 *   2. 分块/合并
 *   3. 重复块检测
 *   4. ECB：相同明文块 → 相同密文块
 *   5. CBC：相同明文块 → 不同密文块
 *   6. ECB/CBC 加解密可逆
 *   7. 像素↔字节转换
 *   8. 色彩量化
 *   9. blockToPixelRect 坐标映射
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
  var ok = actual === expected;
  if (!ok && typeof actual === 'number' && typeof expected === 'number') {
    ok = Math.abs(actual - expected) < 1e-9;
  }
  assert(ok, msg + ' (期望 ' + expected + ', 实际 ' + actual + ')');
}

function assertBytesEqual(actual, expected, msg) {
  if (actual.length !== expected.length) {
    assert(false, msg + ' (长度不匹配: 期望 ' + expected.length + ', 实际 ' + actual.length + ')');
    return;
  }
  for (var i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      assert(false, msg + ' (第 ' + i + ' 字节不匹配: 期望 ' + expected[i] + ', 实际 ' + actual[i] + ')');
      return;
    }
  }
  assert(true, msg);
}

// ── 测试数据 ──
var TEST_KEY = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
                               0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10]);
var ZERO_IV = new Uint8Array(16);

// ────────────────────────────────────────────
console.log('\n📦 PKCS7 填充');

(function () {
  // 填充后长度是 16 的倍数
  var data = new Uint8Array([1, 2, 3, 4, 5]);
  var padded = engine.pkcs7Pad(data);
  assertEqual(padded.length % 16, 0, '填充后长度是 16 的倍数');
  assertEqual(padded.length, 16, '5 字节填充到 16 字节');
  assertEqual(padded[5], 11, '填充值 = 11 (16-5)');
  assertEqual(padded[15], 11, '最后一个填充值 = 11');
})();

(function () {
  // 正好 16 字节 → 填充到 32 字节
  var data = new Uint8Array(16);
  for (var i = 0; i < 16; i++) data[i] = i;
  var padded = engine.pkcs7Pad(data);
  assertEqual(padded.length, 32, '16 字节填充到 32 字节');
  assertEqual(padded[16], 16, '填充值 = 16');
  var unpadded = engine.pkcs7Unpad(padded);
  assertEqual(unpadded.length, 16, '去填充恢复 16 字节');
})();

(function () {
  // 去 padding 恢复原始数据
  var data = new Uint8Array([0xaa, 0xbb, 0xcc]);
  var padded = engine.pkcs7Pad(data);
  var unpadded = engine.pkcs7Unpad(padded);
  assertEqual(unpadded.length, 3, '去填充恢复 3 字节');
  assertBytesEqual(unpadded, data, '去填充数据一致');
})();

// ────────────────────────────────────────────
console.log('\n📦 分块 / 合并');

(function () {
  var data = new Uint8Array(48);
  for (var i = 0; i < 48; i++) data[i] = i;
  var blocks = engine.splitBlocks(data);
  assertEqual(blocks.length, 3, '48 字节 → 3 块');
  assertEqual(blocks[0].length, 16, '每块 16 字节');
  assertEqual(blocks[0][0], 0, '块0首字节 = 0');
  assertEqual(blocks[1][0], 16, '块1首字节 = 16');
  assertEqual(blocks[2][0], 32, '块2首字节 = 32');

  var joined = engine.joinBlocks(blocks);
  assertBytesEqual(joined, data, '合并后与原始一致');
})();

// ────────────────────────────────────────────
console.log('\n📦 重复块检测');

(function () {
  // 构造 4 块数据：A A B C（块0和块1相同）
  var data = new Uint8Array(64);
  for (var i = 0; i < 16; i++) {
    data[i] = i;        // 块0: A
    data[i + 16] = i;   // 块1: A (与块0相同)
    data[i + 32] = i + 100; // 块2: B
    data[i + 48] = i + 200; // 块3: C
  }
  var result = engine.detectDuplicateBlocks(data);
  assertEqual(result.totalBlocks, 4, '总块数 = 4');
  assertEqual(result.uniqueBlocks, 3, '唯一块数 = 3');
  assertEqual(result.duplicateCount, 2, '重复块数 = 2 (块0+块1)');
  assertEqual(result.duplicateIndices.length, 1, '重复索引列表长度 = 1');
  assertEqual(result.duplicateIndices[0], 1, '块1 是重复块');
})();

(function () {
  // 全部相同
  var data = new Uint8Array(48);
  for (var i = 0; i < 48; i++) data[i] = 42;
  var result = engine.detectDuplicateBlocks(data);
  assertEqual(result.totalBlocks, 3, '全同: 总块数 = 3');
  assertEqual(result.uniqueBlocks, 1, '全同: 唯一块数 = 1');
  assertEqual(result.duplicateCount, 3, '全同: 重复块数 = 3');
})();

(function () {
  // 全部不同
  var data = new Uint8Array(48);
  for (var i = 0; i < 48; i++) data[i] = i;
  var result = engine.detectDuplicateBlocks(data);
  assertEqual(result.uniqueBlocks, 3, '全异: 唯一块数 = 3');
  assertEqual(result.duplicateCount, 0, '全异: 重复块数 = 0');
})();

// ────────────────────────────────────────────
console.log('\n📦 ECB: 相同明文块 → 相同密文块');

(function () {
  // 构造 4 块：A B A C（块0 = 块2）
  var data = new Uint8Array(64);
  for (var i = 0; i < 16; i++) {
    data[i] = i;          // 块0: A
    data[i + 16] = i + 50; // 块1: B
    data[i + 32] = i;      // 块2: A (同块0)
    data[i + 48] = i + 80; // 块3: C
  }

  var encrypted = engine.encryptECB(TEST_KEY, data);

  // 块0 和 块2 的密文应该完全相同
  var block0Enc = encrypted.slice(0, 16);
  var block2Enc = encrypted.slice(32, 48);
  assertBytesEqual(block0Enc, block2Enc, 'ECB: 相同明文块(块0/块2) → 相同密文块');

  // 块0 和 块1 的密文应该不同
  var block1Enc = encrypted.slice(16, 32);
  var diff = false;
  for (var i = 0; i < 16; i++) {
    if (block0Enc[i] !== block1Enc[i]) { diff = true; break; }
  }
  assert(diff, 'ECB: 不同明文块(块0/块1) → 不同密文块');
})();

// ────────────────────────────────────────────
console.log('\n📦 CBC: 相同明文块 → 不同密文块');

(function () {
  // 同样的数据：A B A C
  var data = new Uint8Array(64);
  for (var i = 0; i < 16; i++) {
    data[i] = i;
    data[i + 16] = i + 50;
    data[i + 32] = i;
    data[i + 48] = i + 80;
  }

  var encrypted = engine.encryptCBC(TEST_KEY, data, ZERO_IV);

  // CBC: 块0 和 块2 的密文应该不同（因为块间链接）
  var block0Enc = encrypted.slice(0, 16);
  var block2Enc = encrypted.slice(32, 48);
  var diff = false;
  for (var i = 0; i < 16; i++) {
    if (block0Enc[i] !== block2Enc[i]) { diff = true; break; }
  }
  assert(diff, 'CBC: 相同明文块(块0/块2) → 不同密文块');
})();

// ────────────────────────────────────────────
console.log('\n📦 ECB/CBC 加解密可逆');

(function () {
  var data = new Uint8Array(64);
  for (var i = 0; i < 64; i++) data[i] = (i * 7 + 13) & 0xff;

  // ECB 可逆
  var encECB = engine.encryptECB(TEST_KEY, data);
  var decECB = engine.decryptECB(TEST_KEY, encECB);
  assertBytesEqual(decECB, data, 'ECB 加解密可逆');

  // CBC 可逆
  var iv = engine.generateIV();
  var encCBC = engine.encryptCBC(TEST_KEY, data, iv);
  var decCBC = engine.decryptCBC(TEST_KEY, encCBC, iv);
  assertBytesEqual(decCBC, data, 'CBC 加解密可逆');
})();

// ────────────────────────────────────────────
console.log('\n📦 ECB 密文与 CBC 密文不同');

(function () {
  var data = new Uint8Array(16);
  for (var i = 0; i < 16; i++) data[i] = i;

  var encECB = engine.encryptECB(TEST_KEY, data);
  var encCBC = engine.encryptCBC(TEST_KEY, data, ZERO_IV);

  // 即使 IV=0，CBC 的第一个块 = ECB 的第一个块（因为 C0 = E(P0 XOR 0) = E(P0)）
  // 但只有单块时它们相同！多块时不同。
  // 这里验证单块 CBC(IV=0) = ECB
  assertBytesEqual(encECB.slice(0, 16), encCBC.slice(0, 16), '单块 CBC(IV=0) = ECB (数学等价)');
})();

// ────────────────────────────────────────────
console.log('\n📦 像素 ↔ 字节转换');

(function () {
  var imageData = {
    data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
    width: 4,
    height: 1
  };
  var bytes = engine.imageDataToBytes(imageData);
  assertEqual(bytes.length, 16, '4 像素 RGBA = 16 字节');
  assertEqual(bytes[0], 255, '首字节 = 255 (R)');
  assertEqual(bytes[3], 255, '第4字节 = 255 (A)');

  var restored = engine.bytesToImageData(bytes, 4, 1);
  assertEqual(restored.width, 4, '恢复宽度 = 4');
  assertEqual(restored.height, 1, '恢复高度 = 1');
  assertEqual(restored.data[0], 255, '恢复首字节 = 255');
})();

// ────────────────────────────────────────────
console.log('\n📦 色彩量化');

(function () {
  var imageData = {
    data: new Uint8ClampedArray([10, 20, 30, 255, 200, 210, 220, 255]),
    width: 2,
    height: 1
  };
  var quantized = engine.quantizeColors(imageData, 2);
  // 2 级量化: 0-127 → 0, 128-255 → 255
  assertEqual(quantized.data[0], 0, '量化: R=10 → 0');
  assertEqual(quantized.data[1], 0, '量化: G=20 → 0');
  assertEqual(quantized.data[4], 255, '量化: R=200 → 255');
  assertEqual(quantized.data[5], 255, '量化: G=210 → 255');
  assertEqual(quantized.data[7], 255, '量化: Alpha 保持 255');
})();

// ────────────────────────────────────────────
console.log('\n📦 blockToPixelRect 坐标映射');

(function () {
  // 宽度 8 像素 → 每行 2 块（每块 4 像素）
  var rect0 = engine.blockToPixelRect(0, 8);
  assertEqual(rect0.x, 0, '块0: x=0');
  assertEqual(rect0.y, 0, '块0: y=0');
  assertEqual(rect0.w, 4, '块0: w=4');

  var rect1 = engine.blockToPixelRect(1, 8);
  assertEqual(rect1.x, 4, '块1: x=4');
  assertEqual(rect1.y, 0, '块1: y=0');

  var rect2 = engine.blockToPixelRect(2, 8);
  assertEqual(rect2.x, 0, '块2: x=0');
  assertEqual(rect2.y, 1, '块2: y=1');
})();

// ────────────────────────────────────────────
console.log('\n📦 ECB 企鹅效果验证（模拟图像数据）');

(function () {
  // 模拟一个 8x2 像素的 "图像"：左半部分全红，右半部分全蓝
  // 这样大量重复块
  var width = 8;
  var height = 2;
  var pixelData = new Uint8Array(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var idx = (y * width + x) * 4;
      if (x < 4) {
        // 红色像素
        pixelData[idx] = 255;
        pixelData[idx + 1] = 0;
        pixelData[idx + 2] = 0;
        pixelData[idx + 3] = 255;
      } else {
        // 蓝色像素
        pixelData[idx] = 0;
        pixelData[idx + 1] = 0;
        pixelData[idx + 2] = 255;
        pixelData[idx + 3] = 255;
      }
    }
  }

  // 检测原始数据中的重复块
  var dupResult = engine.detectDuplicateBlocks(pixelData);
  // 8x2 = 16 像素 = 4 块。前两块相同（红），后两块相同（蓝）
  assertEqual(dupResult.totalBlocks, 4, '模拟图像: 4 块');
  assertEqual(dupResult.uniqueBlocks, 2, '模拟图像: 2 种唯一块（红/蓝）');
  assertEqual(dupResult.duplicateCount, 4, '模拟图像: 4 块都是重复的');

  // ECB 加密后，重复块依然重复
  var encECB = engine.encryptECB(TEST_KEY, pixelData);
  var encDup = engine.detectDuplicateBlocks(encECB);
  assertEqual(encDup.uniqueBlocks, 2, 'ECB 加密后: 仍然只有 2 种唯一块');
  assertEqual(encDup.duplicateCount, 4, 'ECB 加密后: 4 块仍重复');

  // CBC 加密后，重复块被打破
  var iv = engine.generateIV();
  var encCBC = engine.encryptCBC(TEST_KEY, pixelData, iv);
  var cbcDup = engine.detectDuplicateBlocks(encCBC);
  assertEqual(cbcDup.uniqueBlocks, 4, 'CBC 加密后: 4 块全部唯一');
  assertEqual(cbcDup.duplicateCount, 0, 'CBC 加密后: 无重复块');
})();

// ────────────────────────────────────────────
console.log('\n📦 normalizeWidth');

(function () {
  assertEqual(engine.normalizeWidth(1), 4, 'normalizeWidth(1) = 4 (最小宽度)');
  assertEqual(engine.normalizeWidth(3), 4, 'normalizeWidth(3) = 4 (最小宽度)');
  assertEqual(engine.normalizeWidth(5), 4, 'normalizeWidth(5) = 4');
  assertEqual(engine.normalizeWidth(8), 8, 'normalizeWidth(8) = 8');
  assertEqual(engine.normalizeWidth(100), 100, 'normalizeWidth(100) = 100');
  assertEqual(engine.normalizeWidth(102), 100, 'normalizeWidth(102) = 100');
})();

// ────────────────────────────────────────────
console.log('\n📦 toHex');

(function () {
  var bytes = new Uint8Array([0, 15, 16, 255]);
  assertEqual(engine.toHex(bytes), '000f10ff', 'toHex 正确');
})();

// ────────────────────────────────────────────
console.log('\n========================================');
console.log('  通过: ' + passed + '  失败: ' + failed);
console.log('========================================');
if (failed > 0) {
  process.exit(1);
}
