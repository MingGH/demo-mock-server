/**
 * document-steganography.test.js
 * 运行方式：node pages/document-steganography/document-steganography.test.js
 */
'use strict';

// mock fetch（Node.js 没有）
global.fetch = function () { return Promise.resolve({ json: function () { return Promise.resolve({}); } }); };

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
  try {
    var r = fn();
    if (r && typeof r.then === 'function') return r.catch(function (e) { console.error('  ✗ 异步失败：' + e.message); failed++; });
  } catch (e) { console.error('  ✗ 抛出异常：' + e.message); failed++; }
}

// ── randomToken ──────────────────────────────────────────────────────────────

test('randomToken 生成 24 位字母数字', function () {
  var t = lab.randomToken();
  assert(typeof t === 'string', '返回字符串');
  assert(t.length === 24, '长度为 24');
  assert(/^[a-z0-9]+$/.test(t), '只含小写字母和数字');
});

test('randomToken 每次不同', function () {
  var tokens = new Set();
  for (var i = 0; i < 20; i++) tokens.add(lab.randomToken());
  assert(tokens.size >= 18, '20 次生成至少 18 个不同值');
});

// ── generateTrackingPdf ──────────────────────────────────────────────────────

test('generateTrackingPdf 返回字符串', function () {
  var pdf = lab.generateTrackingPdf({ title: '测试文档', recipient: '张总', token: 'abc123' });
  assert(typeof pdf === 'string', '返回字符串');
  assert(pdf.startsWith('%PDF'), '以 %PDF 开头');
  assert(pdf.includes('%%EOF'), '包含 %%EOF');
});

test('generateTrackingPdf 包含追踪 URL', function () {
  var token = 'testtoken123456789012';
  var pdf = lab.generateTrackingPdf({ title: 'T', recipient: 'R', token: token });
  assert(pdf.includes(token), 'PDF 内容包含 token');
  assert(pdf.includes('/doc-track/pixel'), '包含追踪路径');
});

test('generateTrackingPdf 包含 OpenAction', function () {
  var pdf = lab.generateTrackingPdf({ title: 'T', recipient: 'R', token: 'tok' });
  assert(pdf.includes('/OpenAction'), '包含 OpenAction');
  assert(pdf.includes('/URI'), '包含 URI action');
});

test('generateTrackingPdf 包含 xref 和 trailer', function () {
  var pdf = lab.generateTrackingPdf({ title: 'T', recipient: 'R', token: 'tok' });
  assert(pdf.includes('xref'), '包含 xref');
  assert(pdf.includes('trailer'), '包含 trailer');
  assert(pdf.includes('startxref'), '包含 startxref');
});

// ── injectWatermark ──────────────────────────────────────────────────────────

var sampleText = '本次合作项目总金额为人民币三百二十万元整，交付周期为十二个月，分三个阶段验收。甲方需在合同签署后五个工作日内支付首期款项。乙方保证按时交付。';

test('injectWatermark id=0 与原文相同（或仅有零宽字符差异）', function () {
  var result = lab.injectWatermark(sampleText, 0);
  // id=0 时所有 bit 为 0，同义词不替换，但可能有零宽字符
  var stripped = result.replace(/[\u200b\u200c]/g, '');
  assert(stripped === sampleText, 'id=0 去除零宽字符后与原文相同');
});

test('injectWatermark id=1 替换第一个同义词', function () {
  var result = lab.injectWatermark(sampleText, 1);
  // bit 0 = 1，替换「总金额」→「总价款」
  assert(result.includes('总价款') || result !== sampleText, 'id=1 产生了差异');
});

test('injectWatermark 不同 id 产生不同文本', function () {
  var r0 = lab.injectWatermark(sampleText, 0);
  var r1 = lab.injectWatermark(sampleText, 1);
  var r2 = lab.injectWatermark(sampleText, 2);
  var r3 = lab.injectWatermark(sampleText, 3);
  assert(r0 !== r1 || r1 !== r2, '不同 id 产生不同文本');
  assert(r2 !== r3, 'id=2 和 id=3 不同');
});

test('injectWatermark 保留原文主要内容', function () {
  var result = lab.injectWatermark(sampleText, 7);
  // 去除零宽字符后，长度应该接近原文
  var stripped = result.replace(/[\u200b\u200c]/g, '');
  assert(Math.abs(stripped.length - sampleText.length) < 20, '长度差异在 20 字以内');
});

// ── extractWatermark ─────────────────────────────────────────────────────────

test('extractWatermark 从注入文本中还原 id', function () {
  for (var id = 0; id < 8; id++) {
    var watermarked = lab.injectWatermark(sampleText, id);
    var result = lab.extractWatermark(watermarked);
    assert(result.id === id, 'id=' + id + ' 可以还原');
  }
});

test('extractWatermark 返回 confidence 和 bitStr', function () {
  var watermarked = lab.injectWatermark(sampleText, 5);
  var result = lab.extractWatermark(watermarked);
  assert(typeof result.confidence === 'number', 'confidence 是数字');
  assert(result.confidence >= 0 && result.confidence <= 1, 'confidence 在 0-1 之间');
  assert(typeof result.bitStr === 'string', 'bitStr 是字符串');
});

test('extractWatermark 对原始文本返回 id=0', function () {
  var result = lab.extractWatermark(sampleText);
  assert(result.id === 0, '原始文本 id=0');
});

// ── 汇总 ─────────────────────────────────────────────────────────────────────

setTimeout(function () {
  console.log('\n─────────────────────────────');
  console.log('通过：' + passed + '  失败：' + failed);
  if (failed > 0) process.exit(1);
}, 200);
