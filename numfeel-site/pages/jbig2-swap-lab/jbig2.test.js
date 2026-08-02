/**
 * jbig2.test.js - JBIG2 引擎单元测试
 * 运行：node pages/jbig2-swap-lab/jbig2.test.js
 */
var zlib = require('zlib');
var JBIG2 = require('./jbig2.js');

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
  assert(Math.abs(actual - expected) <= tol, msg + '（期望 ' + expected + ' ±' + tol + '，实际 ' + actual + '）');
}

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function deflateFn(buf) {
  return zlib.deflateRawSync(Buffer.from(buf));
}

// 辅助：画一个简单数字形状到画布上
function drawDigit(digit, w, h) {
  var bmp = JBIG2.createBitmap(w, h);
  var ctx = {
    fillRect: function (x, y, rw, rh) {
      for (var yy = y; yy < y + rh; yy++) {
        for (var xx = x; xx < x + rw; xx++) {
          JBIG2.setPixel(bmp, xx, yy, 1);
        }
      }
    }
  };
  var pad = 1;
  var mw = w - pad * 2;
  var mh = h - pad * 2;
  var x0 = pad, y0 = pad;
  var x1 = x0 + mw - 1;
  var y1 = y0 + mh - 1;
  var xm = Math.floor((x0 + x1) / 2);
  var ym = Math.floor((y0 + y1) / 2);

  // 简化 5×7 段式笔画
  function top() { ctx.fillRect(x0, y0, mw, 1); }
  function upperLeft() { ctx.fillRect(x0, y0, 1, Math.ceil(mh / 2)); }
  function upperRight() { ctx.fillRect(x1, y0, 1, Math.ceil(mh / 2)); }
  function middle() { ctx.fillRect(x0, ym, mw, 1); }
  function lowerLeft() { ctx.fillRect(x0, ym, 1, Math.floor(mh / 2)); }
  function lowerRight() { ctx.fillRect(x1, ym, 1, Math.floor(mh / 2)); }
  function bottom() { ctx.fillRect(x0, y1, mw, 1); }

  switch (digit) {
    case '0': top(); upperLeft(); upperRight(); lowerLeft(); lowerRight(); bottom(); break;
    case '1': upperRight(); lowerRight(); break;
    case '2': top(); upperRight(); middle(); lowerLeft(); bottom(); break;
    case '3': top(); upperRight(); middle(); lowerRight(); bottom(); break;
    case '4': upperLeft(); upperRight(); middle(); lowerRight(); break;
    case '5': top(); upperLeft(); middle(); lowerRight(); bottom(); break;
    case '6': top(); upperLeft(); middle(); lowerLeft(); lowerRight(); bottom(); break;
    case '7': top(); upperRight(); lowerRight(); break;
    case '8': top(); upperLeft(); upperRight(); middle(); lowerLeft(); lowerRight(); bottom(); break;
    case '9': top(); upperLeft(); upperRight(); middle(); lowerRight(); bottom(); break;
    case '.': ctx.fillRect(xm, y1, 1, 1); break;
  }
  return bmp;
}

function makeInstancesFromString(str, charW, charH, gap) {
  var instances = [];
  var x = gap;
  for (var i = 0; i < str.length; i++) {
    var bmp = drawDigit(str[i], charW, charH);
    instances.push({
      x: x, y: gap, w: charW, h: charH,
      bitmap: bmp,
      label: str[i]
    });
    x += charW + gap;
  }
  return instances;
}

function makePageBitmap(instances, pageW, pageH) {
  var bmp = JBIG2.createBitmap(pageW, pageH);
  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    for (var y = 0; y < inst.h; y++) {
      for (var x = 0; x < inst.w; x++) {
        if (JBIG2.getPixel(inst.bitmap, x, y)) {
          JBIG2.setPixel(bmp, inst.x + x, inst.y + y, 1);
        }
      }
    }
  }
  return bmp;
}

console.log('\n═══════════════════════════════════════');
console.log('  JBIG2 模板匹配引擎测试');
console.log('═══════════════════════════════════════\n');

// ── 1. binarize ──
console.log('【1】binarize 阈值二值化');
var gray = new Uint8Array([0, 50, 128, 200, 255]);
var b1 = JBIG2.binarize(gray, 5, 1, 128);
assertEqual(b1.data[0], 0, '0 < 128 -> 0');
assertEqual(b1.data[1], 0, '50 < 128 -> 0');
assertEqual(b1.data[2], 1, '128 >= 128 -> 1');
assertEqual(b1.data[3], 1, '200 >= 128 -> 1');
assertEqual(b1.data[4], 1, '255 >= 128 -> 1');

// ── 2. segment 固定 fixture ──
console.log('\n【2】segment 在固定位图上切出预期数量与 bbox');
var fixture = JBIG2.createBitmap(20, 10);
// 画两个不连通的方块：一个在 (2,2) 3×3，一个在 (12,4) 4×2
for (var y = 2; y < 5; y++) for (var x = 2; x < 5; x++) JBIG2.setPixel(fixture, x, y, 1);
for (var y2 = 4; y2 < 6; y2++) for (var x2 = 12; x2 < 16; x2++) JBIG2.setPixel(fixture, x2, y2, 1);
var segs = JBIG2.segment(fixture, { mode: 'char' });
assertEqual(segs.length, 2, '两个连通域');
var s0 = segs[0];
var s1 = segs[1];
assertEqual(s0.w, 3, '第一个宽度 3');
assertEqual(s0.h, 3, '第一个高度 3');
assertEqual(s0.x, 2, '第一个 x 2');
assertEqual(s0.y, 2, '第一个 y 2');
assertEqual(s1.w, 4, '第二个宽度 4');
assertEqual(s1.h, 2, '第二个高度 2');
assertEqual(s1.x, 12, '第二个 x 12');
assertEqual(s1.y, 4, '第二个 y 4');

// ── 3. symbolDistance 基本性质 ──
console.log('\n【3】symbolDistance 自距离为 0、对称、值域 0~1');
var a = drawDigit('6', 7, 11);
var b = drawDigit('8', 7, 11);
assertClose(JBIG2.symbolDistance(a, a), 0, 1e-9, '自距离 = 0');
assertClose(JBIG2.symbolDistance(a, b), JBIG2.symbolDistance(b, a), 1e-9, '对称');
var dist6_8 = JBIG2.symbolDistance(a, b);
assert(dist6_8 > 0 && dist6_8 <= 1, '6/8 距离在 (0,1]');

// ── 4. 激进度 = 0 时无损 ──
console.log('\n【4】激进度 0 时字典大小 = 唯一位图数，且 reconstruct 逐像素一致');
var insts = makeInstancesFromString('12345', 7, 11, 2);
var page = makePageBitmap(insts, 60, 20);
var enc0 = JBIG2.encode(insts, { aggressiveness: 0 });
assertEqual(enc0.dictionary.length, 5, '5 个不同字符 -> 5 个模板');
var recon0 = JBIG2.reconstruct(enc0, { w: page.w, h: page.h });
assert(arraysEqual(page.data, recon0.data), '激进度 0 重建与原图逐像素一致');

// ── 5. 激进度单调升 → 字典大小与 jbig2Bytes 单调不增 ──
console.log('\n【5】激进度单调升 → 字典大小、jbig2Bytes 单调不增');
var calc = JBIG2.createSizeCalculator(deflateFn);
var prevDict = Infinity;
var prevBytes = Infinity;
var prevAgg = -1;
for (var agg = 0; agg <= 100; agg += 10) {
  var enc = JBIG2.encode(insts, { aggressiveness: agg / 100 });
  var bytes = calc.jbig2Bytes(enc);
  assert(enc.dictionary.length <= prevDict, '字典大小在激进度 ' + agg + '% 处不增（' + enc.dictionary.length + ' <= ' + prevDict + '）');
  assert(bytes <= prevBytes + 1, 'jbig2Bytes 在激进度 ' + agg + '% 处不增（' + bytes + ' <= ' + prevBytes + '+1）');
  prevDict = enc.dictionary.length;
  prevBytes = bytes;
}

// ── 6. diffSemantics 构造 6/8 替换 ──
console.log('\n【6】构造相似 6/8，跨过阈值后产生 substitution');
var six = { x: 0, y: 0, w: 7, h: 11, bitmap: drawDigit('6', 7, 11), label: '6' };
var eight = { x: 10, y: 0, w: 7, h: 11, bitmap: drawDigit('8', 7, 11), label: '8' };
var d68 = JBIG2.symbolDistance(six.bitmap, eight.bitmap);
console.log('    6/8 symbolDistance = ' + d68.toFixed(3));
var pair = [six, eight];
var encLow = JBIG2.encode(pair, { aggressiveness: 0 });
var diffLow = JBIG2.diffSemantics(pair, encLow);
assertEqual(diffLow.errorCount, 0, '激进度 0 无替换');
// 找一个能触发合并的激进度
var encHigh = JBIG2.encode(pair, { aggressiveness: Math.min(1, (d68 + 0.05) / JBIG2.AGGRESSIVENESS_MAX_DISTANCE) });
var diffHigh = JBIG2.diffSemantics(pair, encHigh);
assert(diffHigh.errorCount >= 1, '高激进度下出现语义替换');
var highTokens = diffHigh.decodedText.split(' ');
assert(highTokens.length === 2, 'decodedText 保留全部实例（2 个 token）');
var tokensValid = highTokens.every(function (t) { return t === '6' || t === '8'; });
assert(tokensValid, 'decodedText 的 token 全部来自 6/8（实际 ' + diffHigh.decodedText + '）');

// ── 7. refine=true 时 errorCount === 0 且体积更大 ──
console.log('\n【7】refine=true 错误归零、体积回升');
var encNoRef = JBIG2.encode(pair, { aggressiveness: 1 });
var encRef = JBIG2.encode(pair, { aggressiveness: 1, refine: true });
var diffNoRef = JBIG2.diffSemantics(pair, encNoRef);
var diffRef = JBIG2.diffSemantics(pair, encRef);
assert(diffNoRef.errorCount >= diffRef.errorCount, '无 refine 错误数 >= 有 refine');
assertEqual(diffRef.errorCount, 0, 'refine=true 时 errorCount = 0');
var bytesNoRef = calc.jbig2Bytes(encNoRef);
var bytesRef = calc.jbig2Bytes(encRef);
assert(bytesRef > bytesNoRef, 'refine 体积 > 无 refine（' + bytesRef + ' > ' + bytesNoRef + '）');

// ── 8. block 模式整串替换 ──
console.log('\n【8】block 模式整串数字被当成一个符号，错误表现为整串替换');
var blockInsts = [
  { x: 0, y: 0, w: 25, h: 11, bitmap: makePageBitmap(makeInstancesFromString('14.13', 7, 11, 2), 25, 11), label: '14.13' },
  { x: 30, y: 0, w: 25, h: 11, bitmap: makePageBitmap(makeInstancesFromString('21.11', 7, 11, 2), 25, 11), label: '21.11' }
];
var encBlock = JBIG2.encode(blockInsts, { aggressiveness: 1 });
var diffBlock = JBIG2.diffSemantics(blockInsts, encBlock);
if (diffBlock.errorCount > 0) {
  assert(diffBlock.substitutions[0].from.length > 1, 'block 替换是整串数字');
  assert(diffBlock.substitutions[0].to.length > 1, 'block 被替换成整串');
}

// ── 9. simulateScan 固定种子可复现 ──
console.log('\n【9】固定种子的 simulateScan 输出可复现');
var srcBmp = drawDigit('8', 21, 33);
var scan1 = JBIG2.simulateScan(srcBmp, { dpiScale: 0.75, blur: 0.02, noise: 0.08, seed: 12345 });
var scan2 = JBIG2.simulateScan(srcBmp, { dpiScale: 0.75, blur: 0.02, noise: 0.08, seed: 12345 });
assert(arraysEqual(scan1.data, scan2.data), '同种子扫描结果逐字节相同');

// ── 10. 边界：空页、单符号、全白、全黑 ──
console.log('\n【10】边界情况不崩溃');
var emptyBmp = JBIG2.createBitmap(10, 10);
var emptySegs = JBIG2.segment(emptyBmp, { mode: 'char' });
assertEqual(emptySegs.length, 0, '空页切分为 0 个');
var singleInst = [{ x: 2, y: 2, w: 5, h: 7, bitmap: drawDigit('1', 5, 7), label: '1' }];
var encSingle = JBIG2.encode(singleInst, { aggressiveness: 1 });
assertEqual(encSingle.dictionary.length, 1, '单符号字典大小 1');
var reconSingle = JBIG2.reconstruct(encSingle, { w: 12, h: 12 });
assert(reconSingle.data.some(function (v) { return v === 1; }), '单符号重建有前景');
var allWhite = JBIG2.createBitmap(8, 8);
var allBlack = JBIG2.createBitmap(8, 8);
for (var ii = 0; ii < allBlack.data.length; ii++) allBlack.data[ii] = 1;
assertEqual(JBIG2.segment(allWhite, { mode: 'char' }).length, 0, '全白 0 个');
assertEqual(JBIG2.segment(allBlack, { mode: 'char' }).length, 1, '全黑 1 个连通域');

// ── 11. createSizeCalculator 基础数值检查 ──
console.log('\n【11】体积计算：rawBits 与 genericRegionBytes 合理');
var simpleBmp = drawDigit('3', 10, 14);
assertEqual(calc.rawBits(simpleBmp), 140, 'rawBits = w*h');
var genBytes = calc.genericRegionBytes(simpleBmp);
assert(genBytes > 0 && genBytes < 200, 'genericRegionBytes 在合理范围');
var enc3 = JBIG2.encode(makeInstancesFromString('333', 10, 14, 2), { aggressiveness: 1 });
var jb3 = calc.jbig2Bytes(enc3);
assert(jb3 > 0 && jb3 < genBytes * 3, '高激进度下 JBIG2 体积显著小于 3 份通用区域');

// ── 12. pixelDiff ──
console.log('\n【12】pixelDiff 输出合理');
var sameDiff = JBIG2.pixelDiff(simpleBmp, simpleBmp);
assertEqual(sameDiff.changed, 0, '相同位图 changed = 0');
var diff68 = JBIG2.pixelDiff(drawDigit('6', 7, 11), drawDigit('8', 7, 11));
assert(diff68.changed > 0 && diff68.foreground > 0, '6/8 有变化');
assert(diff68.ratio > 0 && diff68.ratio <= 1, 'ratio 在 (0,1]');

// ── 结果统计 ──
console.log('\n═══════════════════════════════════════');
console.log('  通过: ' + passed + ' / 失败: ' + failed);
console.log('═══════════════════════════════════════');
if (failed > 0) {
  process.exit(1);
}
