'use strict';

const L = require('./logic.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}

// ── bufferToBase64 已知样例 ──────────────────────────────
function strToBytes(s) {
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
assert(L.bufferToBase64(strToBytes('Man')) === 'TWFu', 'base64: Man → TWFu');
assert(L.bufferToBase64(strToBytes('M')) === 'TQ==', 'base64: M → TQ==（补两位）');
assert(L.bufferToBase64(strToBytes('Ma')) === 'TWE=', 'base64: Ma → TWE=（补一位）');
assert(L.bufferToBase64(new Uint8Array(0)) === '', 'base64: 空输入 → 空串');

// ── base64 往返一致性 ────────────────────────────────────
const rand = new Uint8Array(10240);
for (let i = 0; i < rand.length; i++) rand[i] = (i * 37 + 11) & 0xff;
const round = L.base64ToBytes(L.bufferToBase64(rand));
assert(round.length === rand.length && round.every((v, i) => v === rand[i]),
  'base64: 10KB 随机数据往返一致');

// ── base64ToBytes 支持 data: 前缀 ───────────────────────
const withPrefix = L.base64ToBytes('data:image/webp;base64,TWFu');
assert(withPrefix.length === 3 && withPrefix[0] === 77, 'base64ToBytes: 兼容 data: 前缀');

// ── base64Length ─────────────────────────────────────────
assert(L.base64Length(3) === 4 && L.base64Length(4) === 8 && L.base64Length(0) === 0,
  'base64Length: 3→4 / 4→8 / 0→0');

// ── formatBytes ──────────────────────────────────────────
assert(L.formatBytes(832) === '832 B', 'formatBytes: 字节');
assert(L.formatBytes(47616) === '46.5 KB', 'formatBytes: KB');
assert(L.formatBytes(2202009) === '2.10 MB', 'formatBytes: MB');

// ── sizeBucket ───────────────────────────────────────────
assert(L.sizeBucket(100 * 1024) === '<200k', 'sizeBucket: <200k');
assert(L.sizeBucket(300 * 1024) === '200-500k', 'sizeBucket: 200-500k');
assert(L.sizeBucket(800 * 1024) === '500k-1m', 'sizeBucket: 500k-1m');
assert(L.sizeBucket(1500 * 1024) === '1-2m', 'sizeBucket: 1-2m');
assert(L.sizeBucket(3 * 1024 * 1024) === '>2m', 'sizeBucket: >2m');

// ── guessMime ────────────────────────────────────────────
assert(L.guessMime('a.webp') === 'image/webp', 'guessMime: webp');
assert(L.guessMime('B.GIF') === 'image/gif', 'guessMime: 大小写不敏感');
assert(L.guessMime('x.bin') === '', 'guessMime: 猜不到返回空串');

// ── detectAnimation ──────────────────────────────────────
function makeBytes(head, body) {
  const u8 = new Uint8Array(head.length + (body || 0));
  for (let i = 0; i < head.length; i++) u8[i] = head.charCodeAt(i);
  return u8;
}
assert(L.detectAnimation(makeBytes('GIF89a'), 'image/gif') === true, 'detect: gif 视为动图');
assert(L.detectAnimation(makeBytes('RIFF\x00\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x10ANIM'),
  'image/webp') === true, 'detect: 带 ANIM 块的 webp 是动图');
assert(L.detectAnimation(makeBytes('RIFF\x00\x00\x00\x00WEBPVP8 '), 'image/webp') === false,
  'detect: 无 ANIM 块的 webp 是静态图');
assert(L.detectAnimation(makeBytes('\x89PNG\r\n\x1a\nxxxxacTL', 64), 'image/png') === true,
  'detect: 带 acTL 的 png 是 APNG');
assert(L.detectAnimation(makeBytes('\x89PNG\r\n\x1a\nxxxxIDAT', 64), 'image/png') === false,
  'detect: 普通 png 是静态图');

// ── validateAvatarFile ───────────────────────────────────
let r = L.validateAvatarFile({ size: 300 * 1024, type: 'image/webp' });
assert(r.ok && r.warnings.length === 0, 'validate: 小体积 webp 直接通过');

r = L.validateAvatarFile({ size: 300 * 1024, type: 'image/gif' });
assert(r.ok && r.warnings.length === 1, 'validate: gif 通过但提示转 webp');

r = L.validateAvatarFile({ size: 100 * 1024, type: 'image/png' });
assert(!r.ok && r.errors.length === 1, 'validate: png 被拒绝');

r = L.validateAvatarFile({ size: 100 * 1024, type: 'image/jpeg' });
assert(!r.ok, 'validate: jpeg 被拒绝');

r = L.validateAvatarFile({ size: 0, type: 'image/webp' });
assert(!r.ok, 'validate: 空文件被拒绝');

r = L.validateAvatarFile({ size: 6 * 1024 * 1024, type: 'image/webp' });
assert(!r.ok, 'validate: 超 5MB webp 被拒绝');

r = L.validateAvatarFile({ size: 6 * 1024 * 1024, type: 'image/gif' });
assert(r.ok && r.warnings.some(w => w.includes('5MB')), 'validate: 超 5MB gif 降级为警告');

r = L.validateAvatarFile({ size: 1500 * 1024, type: 'image/webp' });
assert(r.ok && r.warnings.some(w => w.includes('1MB')), 'validate: 超 1MB 给警告');

// ── buildInjectionScript ─────────────────────────────────
const fakeB64 = L.bufferToBase64(strToBytes('fake-webp-bytes'));
const script = L.buildInjectionScript({ base64: fakeB64, mime: 'image/webp' });
assert(script.includes(fakeB64), 'script: 内嵌 base64');
assert(script.includes('data:image/webp;base64,'), 'script: 内嵌 dataURL 头');
assert(script.includes('HTMLCanvasElement.prototype.toBlob'), 'script: 劫持 toBlob');
assert(script.includes('__restoreAvatarUpload'), 'script: 提供还原函数');

// 语法合法（只编译不执行）
let syntaxOk = true;
try { new Function(script); } catch (e) { syntaxOk = false; }
assert(syntaxOk, 'script: 语法合法');

// 在 mock 环境里真跑一遍，验证行为
const g = globalThis;
g.window = g; // 脚本里的 window.atob / window.__origToBlob
const savedBlob = g.Blob;
const savedAtob = g.atob;
const blobs = [];
g.Blob = class FakeBlob {
  constructor(parts, opts) {
    this.parts = parts;
    this.type = (opts && opts.type) || '';
    this.size = parts.reduce((s, p) => s + p.length, 0);
    blobs.push(this);
  }
};
if (!g.atob) g.atob = s => Buffer.from(s, 'base64').toString('binary');

const calls = [];
g.HTMLCanvasElement = function () {};
g.HTMLCanvasElement.prototype.toBlob = function (cb) { calls.push('orig'); };
g.HTMLCanvasElement.prototype.toDataURL = function () { return 'orig-data-url'; };

new Function(script)();
assert(typeof g.window.__restoreAvatarUpload === 'function', 'script: 执行后挂了还原函数');
assert(calls.length === 0, 'script: 注入本身不触发 toBlob');

let got = null;
g.HTMLCanvasElement.prototype.toBlob(function (b) { got = b; });
assert(got && got.size === strToBytes('fake-webp-bytes').length && got.type === 'image/webp',
  'script: toBlob 被换成动图 Blob');
assert(g.HTMLCanvasElement.prototype.toDataURL().startsWith('data:image/webp;base64,'),
  'script: toDataURL 同步被换');

g.window.__restoreAvatarUpload();
g.HTMLCanvasElement.prototype.toBlob(function () {});
assert(calls.length === 1 && calls[0] === 'orig', 'script: 还原后走回原生 toBlob');

delete g.HTMLCanvasElement;
delete g.window.__origToBlob;
delete g.window.__origToDataURL;
delete g.window.__restoreAvatarUpload;
if (savedBlob) g.Blob = savedBlob;
if (savedAtob) g.atob = savedAtob;

// ── blobsLikelyEqual ─────────────────────────────────────
assert(L.blobsLikelyEqual({ size: 10, type: 'image/webp' }, { size: 10, type: 'image/webp' }) === true,
  'equal: 大小类型一致 → true');
assert(L.blobsLikelyEqual({ size: 10, type: 'image/webp' }, { size: 11, type: 'image/webp' }) === false,
  'equal: 大小不同 → false');
assert(L.blobsLikelyEqual(null, { size: 10, type: 'x' }) === false, 'equal: null → false');

console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
process.exit(failed ? 1 : 0);
