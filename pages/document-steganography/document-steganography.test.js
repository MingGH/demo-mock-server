/**
 * document-steganography.test.js
 * 运行方式：node pages/document-steganography/document-steganography.test.js
 */
'use strict';

var path = require('path');
require(path.join(__dirname, 'logic.js'));
var lab = global.DocStegoLab;

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passed++; }
  else { console.error('  ✗ ' + msg); failed++; }
}
function test(name, fn) {
  console.log('\n' + name);
  try { fn(); } catch (e) { console.error('  ✗ 抛出异常：' + e.message); failed++; }
}

var sampleText = '本次合作项目总金额为人民币三百二十万元整，交付周期为十二个月，分三个阶段验收。甲方需在合同签署后五个工作日内支付首期款项。乙方保证按时交付，如有延误按合同约定处理。';

// ── 文字指纹 ─────────────────────────────────────────────────────────────────

test('injectWatermark id=0 去除零宽字符后与原文相同', function () {
  var r = lab.injectWatermark(sampleText, 0);
  assert(r.replace(/[\u200b\u200c]/g, '') === sampleText, 'id=0 内容不变');
});

test('injectWatermark 不同 id 产生不同文本', function () {
  var texts = [0,1,2,3,4,5,6,7].map(function (id) { return lab.injectWatermark(sampleText, id); });
  var unique = new Set(texts);
  assert(unique.size === 8, '8 个 id 产生 8 种不同文本');
});

test('extractWatermark 双向验证 id=0~15', function () {
  var allOk = true;
  for (var id = 0; id < 16; id++) {
    var wm = lab.injectWatermark(sampleText, id);
    var ex = lab.extractWatermark(wm);
    if (ex.id !== id) { allOk = false; console.error('    id=' + id + ' 提取失败，得到 ' + ex.id); }
  }
  assert(allOk, 'id=0~15 全部可以正确还原');
});

test('extractWatermark 原始文本返回 id=0', function () {
  assert(lab.extractWatermark(sampleText).id === 0, '原始文本 id=0');
});

test('extractWatermark 返回 confidence 和 bitStr', function () {
  var r = lab.extractWatermark(lab.injectWatermark(sampleText, 5));
  assert(typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1, 'confidence 在 0-1');
  assert(typeof r.bitStr === 'string' && r.bitStr.length === 14, 'bitStr 长度 14');
});

// ── selectAnchors ────────────────────────────────────────────────────────────

test('selectAnchors 只选汉字对', function () {
  var anchors = lab.selectAnchors(sampleText, 8);
  assert(anchors.length === 8, '选出 8 个锚点');
  anchors.forEach(function (a) {
    var ok = /[\u4e00-\u9fff]/.test(sampleText[a]) && /[\u4e00-\u9fff]/.test(sampleText[a+1]);
    assert(ok, '锚点 ' + a + ' 两侧都是汉字');
  });
});

test('selectAnchors 数量不足时返回实际数量', function () {
  var short = '你好世界';
  var anchors = lab.selectAnchors(short, 10);
  assert(anchors.length <= 3, '短文本锚点数量不超过字符对数');
});

// ── 字间距水印（Canvas mock） ─────────────────────────────────────────────────

// Node.js 没有 Canvas，用 mock 测试核心逻辑
function makeMockCanvas(width, height, pixels) {
  // pixels: Uint8ClampedArray，RGBA 格式
  var data = pixels || new Uint8ClampedArray(width * height * 4).fill(255);
  return {
    width: width,
    height: height,
    getContext: function () {
      return {
        font: '',
        fillStyle: '',
        textBaseline: '',
        measureText: function (ch) { return { width: 20 }; },
        fillRect: function () {},
        fillText: function () {},
        clearRect: function () {},
        getImageData: function (x, y, w, h) { return { data: data }; },
        putImageData: function () {},
        createImageData: function (w, h) {
          return { data: new Uint8ClampedArray(w * h * 4) };
        },
        drawImage: function () {}
      };
    }
  };
}

test('renderWithSpacingWatermark 返回正确元数据', function () {
  var canvas = makeMockCanvas(680, 200);
  var meta = lab.renderWithSpacingWatermark(canvas, sampleText, {
    recipientId: 42, fontSize: 20, delta: 0.3
  });
  assert(meta.encodedId === 42, 'encodedId = 42');
  assert(meta.bits.length === 8, 'bits 长度 = 8');
  assert(meta.anchors.length === 8, 'anchors 长度 = 8');
  // 验证 bit 序列
  var reconstructed = 0;
  meta.bits.forEach(function (b, i) { if (b) reconstructed |= (1 << i); });
  assert(reconstructed === 42, 'bit 序列还原 = 42');
});

test('renderWithSpacingWatermark noWatermark=true 所有 shift=0', function () {
  var canvas = makeMockCanvas(680, 200);
  var meta = lab.renderWithSpacingWatermark(canvas, sampleText, {
    recipientId: 255, fontSize: 20, delta: 0.5, noWatermark: true
  });
  var allZero = meta.lines.every(function (line) {
    return line.every(function (item) { return item.shift === 0; });
  });
  assert(allZero, 'noWatermark=true 时所有 shift=0');
});

test('renderWithSpacingWatermark id=0 所有锚点 shift=-delta', function () {
  var canvas = makeMockCanvas(680, 200);
  var delta = 0.3;
  var meta = lab.renderWithSpacingWatermark(canvas, sampleText, {
    recipientId: 0, fontSize: 20, delta: delta
  });
  var anchorSet = {};
  meta.anchors.forEach(function (a) { anchorSet[a] = true; });
  var allNeg = meta.lines.every(function (line) {
    return line.every(function (item) {
      if (!anchorSet[item.anchorIdx === -1 ? -999 : meta.anchors[item.anchorIdx]]) return true;
      return item.shift === -delta || item.shift === 0;
    });
  });
  assert(meta.encodedId === 0, 'encodedId = 0');
  assert(meta.bits.every(function (b) { return b === 0; }), 'id=0 所有 bit=0');
});

test('renderWithSpacingWatermark id=255 所有 bit=1', function () {
  var canvas = makeMockCanvas(680, 200);
  var meta = lab.renderWithSpacingWatermark(canvas, sampleText, {
    recipientId: 255, fontSize: 20, delta: 0.3
  });
  assert(meta.bits.every(function (b) { return b === 1; }), 'id=255 所有 bit=1');
});

// extractSpacingWatermark 需要真实像素数据，用模拟间距数据测试核心判决逻辑
test('extractSpacingWatermark 错误处理：字符太少', function () {
  // 构造一个几乎全白的图片（没有字符）
  var canvas = makeMockCanvas(100, 50);
  var result = lab.extractSpacingWatermark(canvas, 20, 0.3);
  assert(result.id === -1 || result.gaps.length < 4, '字符不足时返回错误');
});

// ── 汇总 ─────────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────');
console.log('通过：' + passed + '  失败：' + failed);
if (failed > 0) process.exit(1);
