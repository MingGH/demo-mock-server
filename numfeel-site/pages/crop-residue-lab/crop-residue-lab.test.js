/**
 * crop-residue-lab.test.js - 裁剪残留实验室单元测试
 * 运行：node numfeel-site/pages/crop-residue-lab/crop-residue-lab.test.js
 */
var PNG = require('./pngkit.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passed++; }
  else { console.error('  ✗ ' + msg); failed++; }
}
function assertEqual(a, b, msg) {
  assert(a === b, msg + '（期望 ' + b + '，实际 ' + a + '）');
}
function assertDeepEqual(a, b, msg) {
  var ok = JSON.stringify(a) === JSON.stringify(b);
  assert(ok, msg + (ok ? '' : '（期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + '）'));
}
function assertBytes(a, b, msg) {
  if (!a || !b) { assert(false, msg + '（空数组）'); return; }
  var min = Math.min(a.length, b.length);
  var same = a.length === b.length;
  for (var i = 0; i < min && same; i++) if (a[i] !== b[i]) same = false;
  if (same) { assert(true, msg); }
  else {
    var diffIdx = -1;
    for (var k = 0; k < min; k++) if (a[k] !== b[k]) { diffIdx = k; break; }
    console.error('    第一个不同字节位置: ' + diffIdx + ' (a=' + a[diffIdx] + ', b=' + b[diffIdx] + ')');
    assert(false, msg);
  }
}

console.log('\n═══════════════════════════════════════');
console.log('  裁剪残留实验室核心算法测试');
console.log('═══════════════════════════════════════\n');

// ──────────────────────────────────────────────────────────
// 1. CRC32
// ──────────────────────────────────────────────────────────
console.log('【1】CRC32');
assertEqual(PNG.crc32('IEND'), 0xAE426082, 'crc32("IEND") === 0xAE426082');
// 已知向量：CRC32("123456789") = 0xCBF43926
assertEqual(PNG.crc32('123456789'), 0xCBF43926, 'crc32("123456789") === 0xCBF43926');
// 稳定性
var a = PNG.crc32([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
var b = PNG.crc32([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assertEqual(a, b, '同输入产生同 CRC');
// 不同输入应不同
var c1 = PNG.crc32('hello');
var c2 = PNG.crc32('world');
assert(c1 !== c2, '不同输入产生不同 CRC');

// ──────────────────────────────────────────────────────────
// 2. adler32
// ──────────────────────────────────────────────────────────
console.log('\n【2】adler32');
// adler32("") = 1
assertEqual(PNG.adler32([]), 1, 'adler32("") === 1');
// adler32("a") = 0x00620062 (RFC 1950)
assertEqual(PNG.adler32([0x61]), 0x00620062, 'adler32("a") === 0x00620062');
// adler32("abc") = 0x024D0127
assertEqual(PNG.adler32([0x61, 0x62, 0x63]), 0x024D0127, 'adler32("abc") === 0x024D0127');
// adler32("123456789") = 0x091E01DE
assertEqual(PNG.adler32([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]), 0x091E01DE, 'adler32("123456789") === 0x091E01DE');

// ──────────────────────────────────────────────────────────
// 3. encodePNG + parseChunks 往返
// ──────────────────────────────────────────────────────────
console.log('\n【3】PNG 编码 / 解析 往返');
// 造一张 8x6 的纯色测试图
var W = 8, H = 6;
var px = new Uint8ClampedArray(W * H * 4);
for (var y = 0; y < H; y++) {
  for (var x = 0; x < W; x++) {
    var idx = (y * W + x) * 4;
    px[idx] = (x * 32) & 0xFF;
    px[idx + 1] = (y * 42) & 0xFF;
    px[idx + 2] = ((x + y) * 17) & 0xFF;
    px[idx + 3] = 255;
  }
}
var png = PNG.encodePNG({ width: W, height: H, pixels: px });
// 签名
var sig = Array.prototype.slice.call(png, 0, 8);
assertBytes(sig, PNG.PNG_SIGNATURE, 'PNG 签名 8 字节正确');
// 解析
var parsed = PNG.parseChunks(png);
assert(parsed.ok, 'parseChunks 成功');
assertEqual(parsed.signatureValid, true, 'signatureValid === true');
// IHDR
var ihdrChunk = parsed.chunks[0];
assertEqual(ihdrChunk.type, 'IHDR', '首 chunk 是 IHDR');
assertEqual(ihdrChunk.length, 13, 'IHDR 长度 = 13');
assertEqual(PNG.readUInt32BE(png, ihdrChunk.dataStart), W, 'IHDR.width = 8');
assertEqual(PNG.readUInt32BE(png, ihdrChunk.dataStart + 4), H, 'IHDR.height = 6');
assertEqual(png[ihdrChunk.dataStart + 8], 8, 'IHDR.bit depth = 8');
assertEqual(png[ihdrChunk.dataStart + 9], 2, 'IHDR.color type = 2 (RGB)');
assertEqual(ihdrChunk.crcOk, true, 'IHDR CRC 校验通过');
// 链中至少一个 IDAT
var idatCount = 0;
for (var i = 0; i < parsed.chunks.length; i++) if (parsed.chunks[i].type === 'IDAT') idatCount++;
assert(idatCount > 0, '至少有一个 IDAT chunk（实际 ' + idatCount + '）');
// 末 chunk 是 IEND
assertEqual(parsed.chunks[parsed.chunks.length - 1].type, 'IEND', '末 chunk 是 IEND');
// 全部 chunk CRC 通过
var allCrcOk = true;
for (var k = 0; k < parsed.chunks.length; k++) {
  if (!parsed.chunks[k].crcOk && !parsed.chunks[k].truncated) { allCrcOk = false; break; }
}
assert(allCrcOk, '所有 chunk 的 CRC 都通过');

// ──────────────────────────────────────────────────────────
// 4. 干净 PNG 的 findResidual 应返回 0
// ──────────────────────────────────────────────────────────
console.log('\n【4】干净 PNG 残留 = 0');
var resid = PNG.findResidual(png);
assertEqual(resid, 0, '干净 PNG findResidual = 0');
// 极短文件
var tiny = PNG.encodePNG({ width: 4, height: 4, pixels: new Uint8ClampedArray(4 * 4 * 4).fill(200) });
assertEqual(PNG.findResidual(tiny), 0, '4x4 干净 PNG findResidual = 0');

// ──────────────────────────────────────────────────────────
// 5. 复现漏洞写入：buggy = concat(cropped, original.slice(cropped.length))
// ──────────────────────────────────────────────────────────
console.log('\n【5】复现 aCropalypse 写入 bug');
// 模拟：先有一张 480x320 的原图（伪造）
var OW = 480, OH = 320;
var originalPx = new Uint8ClampedArray(OW * OH * 4);
for (var yy = 0; yy < OH; yy++) {
  for (var xx = 0; xx < OW; xx++) {
    var idxx = (yy * OW + xx) * 4;
    originalPx[idxx] = (xx * 255 / OW) & 0xFF;
    originalPx[idxx + 1] = (yy * 255 / OH) & 0xFF;
    originalPx[idxx + 2] = ((xx + yy) * 10) & 0xFF;
    originalPx[idxx + 3] = 255;
  }
}
// 在下半部分画一个明显的红色"卡号"区域
for (var yy = Math.floor(OH * 0.6); yy < OH; yy++) {
  for (var xx = 20; xx < OW - 20; xx++) {
    var idxx = (yy * OW + xx) * 4;
    originalPx[idxx] = 255;
    originalPx[idxx + 1] = 80;
    originalPx[idxx + 2] = 80;
  }
}
var originalPng = PNG.encodePNG({ width: OW, height: OH, pixels: originalPx });
// 裁剪后 240x120
var CW = 240, CH = 120;
var croppedPx = new Uint8ClampedArray(CW * CH * 4);
for (var yy = 0; yy < CH; yy++) {
  for (var xx = 0; xx < CW; xx++) {
    var idxx = (yy * CW + xx) * 4;
    croppedPx[idxx] = 200;
    croppedPx[idxx + 1] = 200;
    croppedPx[idxx + 2] = 255;
  }
}
var croppedPng = PNG.encodePNG({ width: CW, height: CH, pixels: croppedPx });
// buggy = concat(cropped, original.slice(cropped.length))
var buggy = new Uint8Array(croppedPng.length + (originalPng.length - croppedPng.length));
buggy.set(croppedPng, 0);
buggy.set(originalPng.slice(croppedPng.length), croppedPng.length);
var expectedResidual = originalPng.length - croppedPng.length;
var actualResidual = PNG.findResidual(buggy);
assertEqual(actualResidual, expectedResidual, 'findResidual 长度精确等于 original.length - cropped.length（' + expectedResidual + ' 字节）');

// ──────────────────────────────────────────────────────────
// 6. findChunkBoundary 找到 IDAT 起点 + CRC 校验
// ──────────────────────────────────────────────────────────
console.log('\n【6】findChunkBoundary');
var residual = Array.prototype.slice.call(buggy, buggy.length - actualResidual);
var boundary = PNG.findChunkBoundary(residual);
assert(boundary >= 0, 'findChunkBoundary 找到了合法边界（偏移 ' + boundary + '）');
// 输入垃圾应返回 -1
assertEqual(PNG.findChunkBoundary([1, 2, 3, 4, 5]), -1, '垃圾输入 findChunkBoundary 返回 -1');
assertEqual(PNG.findChunkBoundary([0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0]), -1, '太短的 IDAT 字符串返回 -1');
// 空数据
assertEqual(PNG.findChunkBoundary([]), -1, '空数据 findChunkBoundary = -1');

// ──────────────────────────────────────────────────────────
// 7. collectIDAT 拼出载荷
// ──────────────────────────────────────────────────────────
console.log('\n【7】collectIDAT');
var payload = PNG.collectIDAT(residual, boundary);
assert(payload !== null, 'collectIDAT 成功（载荷长度 ' + (payload && payload.length) + '）');
assert(payload && payload.length > 0, '载荷非空');

// ──────────────────────────────────────────────────────────
// 8. resyncStoredBlocks 从切断流恢复字节
// ──────────────────────────────────────────────────────────
console.log('\n【8】resyncStoredBlocks');
var resync = PNG.resyncStoredBlocks(payload);
assert(resync.ok, 'resyncStoredBlocks 成功（start=' + (resync && resync.start) + '，恢复 ' + (resync && resync.data && resync.data.length) + ' 字节）');
// 对比：恢复出的数据应与原图从某行起往下的扫描线字节流的尾段吻合
// 验证：恢复出的数据应当能找到 stride 对齐（filter=0 占主导）
var align = PNG.alignRows(resync.data, [OW, CW, 1440, 1080, 1284, 720]);
assert(align.ok, 'alignRows 成功（width=' + align.width + '，offset=' + align.offset + '，confidence=' + align.confidence.toFixed(4) + '）');
assertEqual(align.width, OW, 'alignRows 选出了正确的原图宽度 ' + OW);
assert(align.confidence > 0.99, '正确宽度置信度 > 0.99（实际 ' + align.confidence.toFixed(4) + '）');

// ──────────────────────────────────────────────────────────
// 9. alignRows 错误宽度置信度明显更低
// ──────────────────────────────────────────────────────────
console.log('\n【9】alignRows 候选宽度对比');
// 对每个错误宽度，单独跑一遍 alignRows
var candidates = [720, 1080, 1284, 1440, OW, CW];
var bestWrong = 0;
for (var ci = 0; ci < candidates.length; ci++) {
  var c = candidates[ci];
  if (c === OW) continue;
  var a = PNG.alignRows(resync.data, [c]);
  if (a.ok) {
    console.log('    候选宽度 ' + c + '：confidence=' + a.confidence.toFixed(4) + '（rows=' + a.rowCount + '）');
    if (a.confidence > bestWrong) bestWrong = a.confidence;
  }
}
assert(bestWrong < 0.99, '错误宽度最大置信度 (' + bestWrong.toFixed(4) + ') 远低于正确宽度（>0.99）');

// ──────────────────────────────────────────────────────────
// 10. 端到端：原图 → 裁剪 → buggy → 恢复，逐像素比对
// ──────────────────────────────────────────────────────────
console.log('\n【10】端到端恢复：恢复出的行与原图对应行完全一致');
var full = PNG.recoverResidual(buggy, [OW, CW, 1080, 1440, 1284, 720]);
assert(full.ok, 'recoverResidual 成功（恢复 ' + full.rowCount + ' 行，width=' + full.width + '）');
assertEqual(full.width, OW, '恢复出的 width = 原图 width');
// 取原图下半部分做对比
// 原图 stride = 1 + OW*3，rowCount 行从原图底部往上数
// buggy 的 start 偏移 = croppedPng.length，原始文件中第几行被切到 croppedPng.length 处？
// 由于 PNG 编码开销是确定的，可以直接算：在原始 IDAT 流中，buggy 截断点处对应的是原图第几行
// 这里简化校验：把每行恢复结果与原图底部往上对应行做 RGB 字节比较
// 因为 buggy 截断点可能不正好对齐扫描线边界，需要用 align.offset 调整
// 简单起见：直接比较 rawTail 在原 IDAT 数据中对应的行索引
// 这里采用另一种方式：直接把 resync.data 按 stride=1+OW*3 拆分，逐行与原图扫描线比对
// 由于 buggy 截断点的精确字节位置由 croppedPng.length 决定，可能与 offset=0 不一致
// 我们已经知道 align.offset 是 align 选出的最佳起点；用它来切分 resync.data
var stride = 1 + OW * 3;
var tailRows = [];
for (var ki = 0; ki < full.rowCount; ki++) {
  var rs = full.offset + ki * stride + 1;
  if (rs + stride - 1 > resync.data.length) break;
  var row = new Uint8ClampedArray(OW * 4);
  for (var xi = 0; xi < OW; xi++) {
    row[xi * 4] = resync.data[rs + xi * 3] || 0;
    row[xi * 4 + 1] = resync.data[rs + xi * 3 + 1] || 0;
    row[xi * 4 + 2] = resync.data[rs + xi * 3 + 2] || 0;
    row[xi * 4 + 3] = 255;
  }
  tailRows.push(row);
}
// 由于 buggy 截断点恰好 = croppedPng.length，这个长度在原 PNG 中对应
// 的位置就是原图从底部算起的某行索引。
// 计算 buggy 截断点（即 croppedPng.length）在原图压缩流中的字节位置：
// 截断点 = croppedPng.length
// 它在 originalPng 字节流中的位置 = croppedPng.length（因为 buggy = cropped + original.slice(cropped.length)）
// 我们要算：originalPng[croppedPng.length..] 对应的原图扫描线起始行
// 但原图 PNG 的前面（signature+IHDR+部分IDAT）也会被切掉。
// 重新编码原图后，输出是确定的；我们用相同的 encoder 再编一次原图，然后找 croppedPng.length 这个偏移
// 在原始 IDAT 流中的对应行。
// 简化做法：把 tailRows 与原图最末 rowCount 行的 RGB 直接比对。
var matchCount = 0;
var totalCompare = 0;
// 计算 tailRows 应与原图底部多少行一致
// 我们直接比对：原图最后 rowCount 行 vs tailRows
var origLastRows = [];
for (var oy = 0; oy < full.rowCount; oy++) {
  var rowData = new Uint8ClampedArray(OW * 4);
  for (var ox = 0; ox < OW; ox++) {
    var si = (oy * OW + ox) * 4;
    rowData[ox * 4] = originalPx[si];
    rowData[ox * 4 + 1] = originalPx[si + 1];
    rowData[ox * 4 + 2] = originalPx[si + 2];
    rowData[ox * 4 + 3] = 255;
  }
  origLastRows.push(rowData);
}
// 重新从原图导出原始扫描线字节流（与编码器用的 raw 数据一致）
var origStride = 1 + OW * 3;
var origRaw = new Array(OH * origStride);
for (var ooy = 0; ooy < OH; ooy++) {
  origRaw[ooy * origStride] = 0; // filter byte
  for (var oox = 0; oox < OW; oox++) {
    var osi = (ooy * OW + oox) * 4;
    var odi = ooy * origStride + 1 + oox * 3;
    origRaw[odi] = originalPx[osi];
    origRaw[odi + 1] = originalPx[osi + 1];
    origRaw[odi + 2] = originalPx[osi + 2];
  }
}
// 恢复出的 resync.data[full.offset..] 应是 origRaw 某后缀
// 找到这个后缀的起点：在 origRaw 中找连续 match
var tailStart = -1;
var matchLen = Math.min(full.rowCount * origStride, origRaw.length, resync.data.length - full.offset);
if (matchLen > 0) {
  for (var sstart = 0; sstart <= origRaw.length - matchLen; sstart++) {
    var sm = true;
    for (var smi = 0; smi < matchLen; smi++) {
      if (origRaw[sstart + smi] !== resync.data[full.offset + smi]) { sm = false; break; }
    }
    if (sm) { tailStart = sstart; break; }
  }
}
assert(tailStart >= 0, '恢复出的 rawTail 在原图 raw 数据中找到匹配起点（offset=' + tailStart + '）');
// 进一步：从该起点起，逐字节对比（覆盖整个 rowCount 区域）
var allMatch = true;
if (tailStart >= 0) {
  var compareLen = Math.min(full.rowCount * origStride, origRaw.length - tailStart, resync.data.length - full.offset);
  for (var cmi = 0; cmi < compareLen; cmi++) {
    if (origRaw[tailStart + cmi] !== resync.data[full.offset + cmi]) { allMatch = false; break; }
  }
}
assert(allMatch, '恢复出的 rawTail 与原图对应行 RGB 流逐字节一致');
assert(full.rowCount >= 5, '恢复出行数 >= 5（实际 ' + full.rowCount + '）');

// ──────────────────────────────────────────────────────────
// 11. 边界：残留字节数不足一个 chunk 时优雅返回
// ──────────────────────────────────────────────────────────
console.log('\n【11】边界场景');
// 造一个 4x4 的超小 PNG，cropped 几乎覆盖原图，残留极少
var tinyOrig = PNG.encodePNG({ width: 4, height: 4, pixels: new Uint8ClampedArray(4 * 4 * 4).fill(100) });
var tinyCropped = PNG.encodePNG({ width: 3, height: 3, pixels: new Uint8ClampedArray(3 * 3 * 4).fill(50) });
var tinyBuggy = new Uint8Array(tinyCropped.length + Math.max(0, tinyOrig.length - tinyCropped.length));
tinyBuggy.set(tinyCropped, 0);
tinyBuggy.set(tinyOrig.slice(tinyCropped.length), tinyCropped.length);
// 不抛异常即可
var tinyRec = null;
try { tinyRec = PNG.recoverResidual(tinyBuggy, [4, 3, 8]); } catch (e) { /* ignore */ }
assert(tinyRec !== null, '极小 buggy 恢复不抛异常（ok=' + (tinyRec && tinyRec.ok) + '）');
// 超短字节
var shortResid = PNG.findResidual(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
assertEqual(shortResid, null, '太短的 PNG findResidual = null');
// 空
assertEqual(PNG.findResidual(new Uint8Array(0)), null, '空字节 findResidual = null');

// ──────────────────────────────────────────────────────────
// 12. 随机原始 PNG 的 buggy 恢复鲁棒性
// ──────────────────────────────────────────────────────────
console.log('\n【12】随机图像鲁棒性');
function randImage(w, h) {
  var p = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < p.length; i += 4) {
    p[i] = (Math.random() * 256) | 0;
    p[i + 1] = (Math.random() * 256) | 0;
    p[i + 2] = (Math.random() * 256) | 0;
    p[i + 3] = 255;
  }
  return p;
}
var robustnessOk = true;
for (var ri = 0; ri < 8; ri++) {
  var rw = [60, 72, 96, 100, 120, 144, 180, 200][ri];
  var rh = [40, 48, 60, 80, 90, 100, 120, 150][ri];
  var cw2 = Math.max(8, Math.floor(rw * (0.3 + Math.random() * 0.3)));
  var ch2 = Math.max(8, Math.floor(rh * (0.2 + Math.random() * 0.2)));
  var orig = PNG.encodePNG({ width: rw, height: rh, pixels: randImage(rw, rh) });
  var crop = PNG.encodePNG({ width: cw2, height: ch2, pixels: randImage(cw2, ch2) });
  var bug = new Uint8Array(crop.length + (orig.length - crop.length));
  bug.set(crop, 0);
  bug.set(orig.slice(crop.length), crop.length);
  var rec = PNG.recoverResidual(bug, [rw, cw2, 96, 128, 160]);
  if (!rec.ok || rec.width !== rw) {
    console.error('    失败案例: ' + rw + 'x' + rh + ' -> ' + cw2 + 'x' + ch2);
    robustnessOk = false;
    break;
  }
}
assert(robustnessOk, '随机 8 组（不同尺寸）buggy 全部正确恢复（width 命中）');

// ──────────────────────────────────────────────────────────
// 13. 页面主场景 720×1280 端到端验证
// ──────────────────────────────────────────────────────────
console.log('\n【13】页面主场景 720×1280 端到端');
var sceneW = 720, sceneH = 1280;
var scenePx = randImage(sceneW, sceneH);
var sceneOrig = PNG.encodePNG({ width: sceneW, height: sceneH, pixels: scenePx });
var cropSceneH = Math.floor(sceneH * 0.45);
var cropScenePx = new Uint8ClampedArray(sceneW * cropSceneH * 4);
for (var cy = 0; cy < cropSceneH; cy++) {
  for (var cx = 0; cx < sceneW; cx++) {
    var si = (cy * sceneW + cx) * 4;
    var di = (cy * sceneW + cx) * 4;
    cropScenePx[di] = scenePx[si];
    cropScenePx[di + 1] = scenePx[si + 1];
    cropScenePx[di + 2] = scenePx[si + 2];
    cropScenePx[di + 3] = 255;
  }
}
var sceneCrop = PNG.encodePNG({ width: sceneW, height: cropSceneH, pixels: cropScenePx });
var sceneBuggy = new Uint8Array(sceneCrop.length + (sceneOrig.length - sceneCrop.length));
sceneBuggy.set(sceneCrop, 0);
sceneBuggy.set(sceneOrig.slice(sceneCrop.length), sceneCrop.length);
assertEqual(sceneOrig.length, 2770402, '720×1280 原图体积 = 2,770,402 B');
assertEqual(sceneCrop.length, 1246706, '720×576 裁剪图体积 = 1,246,706 B');
assertEqual(sceneBuggy.length, sceneOrig.length, 'buggy 文件与原图体积完全相等');
var sceneRec = PNG.recoverResidual(sceneBuggy, [720, 1080, 1284, 1440]);
assert(sceneRec.ok, '720×1280 场景恢复成功');
assertEqual(sceneRec.width, 720, '720×1280 场景恢复宽度命中 720');
assert(sceneRec.rowCount >= 10, '720×1280 场景恢复行数 >= 10（实际 ' + sceneRec.rowCount + '）');

// ── 总结 ──
console.log('\n═══════════════════════════════════════');
console.log('  通过：' + passed + '  失败：' + failed);
console.log('═══════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
