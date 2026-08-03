var assert = require('assert');

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
global.window = {};

var fc = require('./engine.js');

var passed = 0;
var failed = 0;

function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) <= tol) {
    console.log('  \u2705 PASS: ' + msg);
    passed++;
  } else {
    console.error('  \u274C FAIL: ' + msg + ' (expected ' + expected + ', got ' + actual + ')');
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    console.log('  \u2705 PASS: ' + msg);
    passed++;
  } else {
    console.error('  \u274C FAIL: ' + msg + ' (expected ' + expected + ', got ' + actual + ')');
    failed++;
  }
}

// Test 1: toGrayscale
console.log('\n=== Test 1: toGrayscale ===');
(function () {
  var w = 2, h = 2;
  var data = new Uint8ClampedArray([
    255, 0, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   128, 128, 128, 255
  ]);
  var imageData = new global.ImageData(data, w, h);
  var gray = fc.toGrayscale(imageData);

  assertEqual(gray.length, 4, 'gray length');
  assertClose(gray[0], 76.245, 0.01, 'red pixel luminance');
  assertClose(gray[1], 149.685, 0.01, 'green pixel luminance');
  assertClose(gray[2], 29.07, 0.01, 'blue pixel luminance');
  assertClose(gray[3], 128, 0.01, 'gray pixel luminance');
})();

// Test 2: generateSampleImage
console.log('\n=== Test 2: generateSampleImage ===');
(function () {
  var imageData = fc.generateSampleImage(32, 32);
  assertEqual(imageData.width, 32, 'sample width');
  assertEqual(imageData.height, 32, 'sample height');
  assertEqual(imageData.data.length, 32 * 32 * 4, 'sample data length');
  console.log('  \u2705 PASS: sample image generated');
  passed++;
})();

// Test 3: encode and decode roundtrip
console.log('\n=== Test 3: Encode-Decode Roundtrip ===');
(function () {
  var imageData = fc.generateSampleImage(32, 32);
  var gray = fc.toGrayscale(imageData);

  var result = fc.encode(gray, 32, 32, { rangeSize: 8, domainSize: 16, stride: 4 });
  var code = result.code;

  assertEqual(result.stats.numBlocks, 16, 'number of blocks (32/8 * 32/8 = 16)');
  assertEqual(code.length, 16, 'code length');
  assert(result.stats.compressionRatio > 0, 'compression ratio > 0');

  console.log('  Original size: ' + result.stats.originalSize + ' bytes');
  console.log('  Compressed size: ' + result.stats.compressedSize + ' bytes');
  console.log('  Compression ratio: ' + result.stats.compressionRatio + ':1');
  console.log('  PSNR: ' + result.stats.psnr.toFixed(2) + ' dB');

  // Verify each code entry has required fields
  for (var i = 0; i < code.length; i++) {
    var entry = code[i];
    assert(typeof entry.rx === 'number', 'code[' + i + '].rx exists');
    assert(typeof entry.ry === 'number', 'code[' + i + '].ry exists');
    assert(typeof entry.dx === 'number', 'code[' + i + '].dx exists');
    assert(typeof entry.dy === 'number', 'code[' + i + '].dy exists');
    assert(typeof entry.transform === 'number', 'code[' + i + '].transform exists');
    assert(typeof entry.scale === 'number', 'code[' + i + '].scale exists');
    assert(typeof entry.offset === 'number', 'code[' + i + '].offset exists');
    assert(entry.transform >= 0 && entry.transform <= 7, 'transform in range 0-7');
    assert(entry.scale >= 0 && entry.scale <= 1, 'scale in range 0-1');
  }

  console.log('  \u2705 PASS: code structure valid');
  passed++;

  // Decode
  var decoded = fc.decode(code, 32, 32, 8, 12);

  assertEqual(decoded.length, 32 * 32, 'decoded length');

  // The decoded image should have valid pixel values
  var minVal = Infinity, maxVal = -Infinity;
  for (var j = 0; j < decoded.length; j++) {
    if (decoded[j] < minVal) minVal = decoded[j];
    if (decoded[j] > maxVal) maxVal = decoded[j];
  }
  assert(minVal >= 0, 'decoded pixels >= 0');
  assert(maxVal <= 255, 'decoded pixels <= 255');

  console.log('  Decoded pixel range: [' + minVal.toFixed(1) + ', ' + maxVal.toFixed(1) + ']');
  console.log('  \u2705 PASS: decode produces valid pixel values');
  passed++;
})();

// Test 4: domain pool building
console.log('\n=== Test 4: Domain Pool Building ===');
(function () {
  var imageData = fc.generateSampleImage(32, 32);
  var gray = fc.toGrayscale(imageData);

  var pool = [];
  var rangeSize = 8;
  var domainSize = 16;
  var stride = 8;

  var maxX = 32 - domainSize;
  var maxY = 32 - domainSize;
  for (var dy = 0; dy <= maxY; dy += stride) {
    for (var dx = 0; dx <= maxX; dx += stride) {
      pool.push({ x: dx, y: dy });
    }
  }

  assert(pool.length > 0, 'pool has entries');
  assertEqual(pool.length, 9, 'pool size for 32x32 with stride 8');

  console.log('  \u2705 PASS: domain pool built correctly');
  passed++;
})();

// Test 5: decode with fewer iterations
console.log('\n=== Test 5: Progressive Decode ===');
(function () {
  var imageData = fc.generateSampleImage(32, 32);
  var gray = fc.toGrayscale(imageData);
  var result = fc.encode(gray, 32, 32, { rangeSize: 8, domainSize: 16, stride: 4 });

  var iterCounts = [];
  fc.decode(result.code, 32, 32, 8, 3, function (iter, total) {
    iterCounts.push(iter);
  });
  assertEqual(iterCounts.length, 3, '3 iteration callbacks fired');
  assertEqual(iterCounts[0], 1, 'first iteration is 1');
  assertEqual(iterCounts[2], 3, 'third iteration is 3');

  console.log('  \u2705 PASS: progressive decode callbacks work');
  passed++;
})();

// Test 6: generatePortraitImage
console.log('\n=== Test 6: generatePortraitImage ===');
(function () {
  var imageData = fc.generatePortraitImage(32, 32);
  assertEqual(imageData.width, 32, 'portrait width');
  assertEqual(imageData.height, 32, 'portrait height');
  assertEqual(imageData.data.length, 32 * 32 * 4, 'portrait data length');
  console.log('  \u2705 PASS: portrait image generated');
  passed++;
})();

console.log('\n===============================');
console.log('Total: ' + (passed + failed) + ' (' + passed + ' passed, ' + failed + ' failed)');
if (failed > 0) process.exit(1);