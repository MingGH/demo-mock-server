// ========== JPEG2000 真实编解码（OpenJPEG / WebAssembly） ==========
// 本文件封装了 OpenJPEG（经 Emscripten 编译的 WASM 构建，@cornerstonejs/codec-openjpeg）。
// 它是真实的 JPEG2000 编码器/解码器：9/7 小波 + EBCOT 熵编码（有损）与 5/3 小波（无损），
// 与浏览器里常见的 jpeg-js / canvas 方案不同，这里输出/读取的是真实的 J2K 码流。
//
// 浏览器加载方式（index.html）：
//   <script src="https://cdn.jsdelivr.net/npm/@cornerstonejs/codec-openjpeg@1.3.2/dist/openjpegwasm.js"></script>
//   该脚本暴露全局工厂函数 window.OpenJPEGWASM。
//
// 注意：embind 返回的是 WASM 内存上的 TypedArray 视图，必须直接对它 .set() 写入数据，
// 不能用 new Uint8Array(view).set()（那会写到副本上）。

var NF_J2K_CDN = 'https://cdn.jsdelivr.net/npm/@cornerstonejs/codec-openjpeg@1.3.2/dist/';
var NF_J2K_SCRIPT = NF_J2K_CDN + 'openjpegwasm.js';
var NF_J2K_WASM = NF_J2K_CDN + 'openjpegwasm.wasm';

var _codecPromise = null;

/**
 * 加载 OpenJPEG 编解码器（幂等，返回 Promise<lib>）
 * @returns {Promise<Object>}
 */
function loadOpenJpeg() {
  if (_codecPromise) return _codecPromise;
  _codecPromise = new Promise(function (resolve, reject) {
    try {
      if (!window.OpenJPEGWASM) {
        reject(new Error('OpenJPEGWASM 未加载'));
        return;
      }
      var libPromise = window.OpenJPEGWASM({
        locateFile: function (path) { return NF_J2K_WASM; }
      });
      libPromise.then(resolve, reject);
    } catch (e) { reject(e); }
  });
  return _codecPromise;
}

/**
 * 加载编解码器脚本标签（供页面在点击"重试"时重新注入；正常情况 index.html 已内联 script）
 * @returns {Promise<void>}
 */
function ensureOpenJpegScript() {
  return new Promise(function (resolve, reject) {
    if (window.OpenJPEGWASM) { resolve(); return; }
    var s = document.createElement('script');
    s.src = NF_J2K_SCRIPT;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('无法从 CDN 加载 OpenJPEG 脚本')); };
    document.head.appendChild(s);
  });
}

/**
 * 用真实 JPEG2000 编码器把灰度图压成 J2K 码流（有损，9/7 小波 + EBCOT）
 * @param {Object} lib OpenJPEG 模块
 * @param {Uint8Array|Uint8ClampedArray} gray 灰度像素 0-255
 * @param {number} w
 * @param {number} h
 * @param {number} decompositions 小波分解层数
 * @param {number} rate 目标压缩比（原始字节数 / 输出字节数）
 * @returns {{bytes: Uint8Array, ms: number}} 真实 J2K 码流
 */
function encodeJ2K(lib, gray, w, h, decompositions, rate) {
  var t0 = performance.now();
  var enc = new lib.J2KEncoder();
  enc.getDecodedBuffer({ width: w, height: h, componentCount: 1, bitsPerSample: 8, isSigned: false }).set(gray);
  enc.setDecompositions(decompositions);
  enc.setQuality(false, 1);
  enc.setCompressionRatio(0, rate);
  enc.setProgressionOrder(0); // LRCP
  enc.encode();
  var eb = enc.getEncodedBuffer();
  var out = new Uint8Array(eb.byteLength);
  out.set(new Uint8Array(eb));
  return { bytes: out, ms: performance.now() - t0 };
}

/**
 * 编码为包含多个质量层的单一码流（用于真实的渐进式解码演示）
 * rates 从高到低（越靠前层，需要的码流越少、画质越低）
 * @returns {{bytes: Uint8Array, layers: number, ms: number}}
 */
function encodeJ2KLayers(lib, gray, w, h, decompositions, rates) {
  var t0 = performance.now();
  var n = rates.length;
  var enc = new lib.J2KEncoder();
  enc.getDecodedBuffer({ width: w, height: h, componentCount: 1, bitsPerSample: 8, isSigned: false }).set(gray);
  enc.setDecompositions(decompositions);
  enc.setQuality(false, n);
  for (var i = 0; i < n; i++) enc.setCompressionRatio(i, rates[i]);
  enc.setProgressionOrder(0); // LRCP：层优先，码流前段即可解码低层
  enc.encode();
  var eb = enc.getEncodedBuffer();
  var out = new Uint8Array(eb.byteLength);
  out.set(new Uint8Array(eb));
  return { bytes: out, layers: n, ms: performance.now() - t0 };
}

/**
 * 用真实 JPEG2000 解码器解码 J2K 码流为灰度图
 * @param {Object} lib
 * @param {Uint8Array} bytes 真实码流
 * @param {number} [layer] 只解码到第 layer 个质量层（渐进）
 * @returns {{gray: Uint8Array, w:number, h:number, ms:number}}
 */
function decodeJ2K(lib, bytes, layer) {
  var t0 = performance.now();
  var dec = new lib.J2KDecoder();
  dec.getEncodedBuffer(bytes.byteLength).set(bytes);
  if (layer !== undefined && layer > 0) {
    dec.decodeSubResolution(0, layer);
  } else {
    dec.decode();
  }
  var db = dec.getDecodedBuffer();
  var out = new Uint8Array(db.byteLength);
  out.set(new Uint8Array(db));
  var frame = dec.getFrameInfo();
  var w = frame.width, h = frame.height;
  if (!w || !h) { w = 0; h = 0; }
  return { gray: out, w: w, h: h, ms: performance.now() - t0 };
}

function _u32be(n) {
  var b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}
function _box4(type) {
  var t = new Uint8Array(4);
  t[0] = type.charCodeAt(0); t[1] = type.charCodeAt(1); t[2] = type.charCodeAt(2); t[3] = type.charCodeAt(3);
  return t;
}
function _box(type, payload) {
  var len = 8 + payload.length;
  var out = new Uint8Array(len);
  out.set(_u32be(len), 0);
  out.set(_box4(type), 4);
  out.set(payload, 8);
  return out;
}
function _concat(parts) {
  var n = 0, i;
  for (i = 0; i < parts.length; i++) n += parts[i].length;
  var o = new Uint8Array(n), off = 0;
  for (i = 0; i < parts.length; i++) { o.set(parts[i], off); off += parts[i].length; }
  return o;
}

/**
 * 把 J2K 裸码流包装成标准的 .jp2 容器文件（带 JP2 签名/文件类型/图像头/颜色说明），
 * 便于浏览器直接打开或作为附件下载。
 * @param {Uint8Array} codestream 真实 J2K 码流
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array}
 */
function wrapJP2(codestream, w, h) {
  var sig = new Uint8Array([0, 0, 0, 12, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a]);
  var ftypP = _concat([
    _box4('jp2 '), new Uint8Array([0, 0, 0, 0]), _box4('jp2 ')
  ]);
  var ihdrP = new Uint8Array(14);
  new DataView(ihdrP.buffer).setUint32(0, h, false);
  new DataView(ihdrP.buffer).setUint32(4, w, false);
  new DataView(ihdrP.buffer).setUint16(8, 1, false); // 组件数 1（灰度）
  ihdrP[10] = 8;  // 位深
  ihdrP[11] = 7;  // 压缩类型（小波）
  ihdrP[12] = 0;  // 未知颜色
  ihdrP[13] = 0;  // IPR
  // colr 盒：method=1(枚举) prec=0 approx=0 + enumCS(4字节)=18(灰度)，载荷共 7 字节
  var colrP = _concat([
    new Uint8Array([1, 0, 0]),
    new Uint8Array([0, 0, 0, 18])
  ]);
  return _concat([
    sig,
    _box('ftyp', ftypP),
    _box('jp2h', _concat([_box('ihdr', ihdrP), _box('colr', colrP)])),
    _box('jp2c', codestream)
  ]);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NF_J2K_CDN: NF_J2K_CDN,
    NF_J2K_SCRIPT: NF_J2K_SCRIPT,
    NF_J2K_WASM: NF_J2K_WASM,
    loadOpenJpeg: loadOpenJpeg,
    ensureOpenJpegScript: ensureOpenJpegScript,
    encodeJ2K: encodeJ2K,
    encodeJ2KLayers: encodeJ2KLayers,
    decodeJ2K: decodeJ2K,
    wrapJP2: wrapJP2
  };
}
