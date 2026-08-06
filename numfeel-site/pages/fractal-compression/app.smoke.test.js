/**
 * app.js 端到端冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / Canvas / Image 桩驱动真实的 app.js，走完
 * 「点首屏大按钮 → 装载预设图 → 编码 → 逐帧解码 → 画拼贴」全流程，
 * 验证页面接线没断、统计数字真的被填上、解码 PSNR 是真值而不是拼贴值。
 *
 * 另外单独验证 GSAP CDN 拉不到时页面仍然可用（步骤切换不依赖动画库）。
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var DIR = __dirname;
var passed = 0;
var failed = 0;

function check(condition, msg) {
  if (condition) {
    console.log('  \u2705 PASS: ' + msg);
    passed++;
  } else {
    console.error('  \u274C FAIL: ' + msg);
    failed++;
  }
}

function ImageDataStub(data, width, height) {
  this.data = data || new Uint8ClampedArray(width * height * 4);
  this.width = width;
  this.height = height;
}

// --- 最小 Canvas 2D 桩 -----------------------------------------------------
function makeContext2D(canvas) {
  return {
    canvas: canvas,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1,
    _calls: { strokeRect: 0, arc: 0, stroke: 0, fill: 0, putImageData: 0, fillText: 0 },
    _strokeColors: [],
    fillRect: function () {},
    strokeRect: function () {
      this._calls.strokeRect++;
      this._strokeColors.push(this.strokeStyle);
    },
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    arc: function () { this._calls.arc++; },
    stroke: function () { this._calls.stroke++; },
    fill: function () { this._calls.fill++; },
    fillText: function () { this._calls.fillText++; },
    putImageData: function (imageData) {
      this._calls.putImageData++;
      canvas._lastImageData = imageData;
    },
    createImageData: function (w, h) {
      return new ImageDataStub(new Uint8ClampedArray(w * h * 4), w, h);
    },
    // drawImage 把桩 Image 的图案按目标尺寸重采样进画布
    drawImage: function (img, dx, dy, dw, dh) {
      var out = new Uint8ClampedArray(dw * dh * 4);
      for (var y = 0; y < dh; y++) {
        for (var x = 0; x < dw; x++) {
          var sx = Math.floor(x * img.width / dw);
          var sy = Math.floor(y * img.height / dh);
          var si = (sy * img.width + sx) * 4;
          var di = (y * dw + x) * 4;
          out[di] = img._pixels[si];
          out[di + 1] = img._pixels[si + 1];
          out[di + 2] = img._pixels[si + 2];
          out[di + 3] = 255;
        }
      }
      canvas._buffer = out;
    },
    getImageData: function (x, y, w, h) {
      return new ImageDataStub(canvas._buffer || new Uint8ClampedArray(w * h * 4), w, h);
    }
  };
}

function makeElement(id, tag) {
  return {
    id: id,
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    textContent: '',
    disabled: false,
    value: '',
    width: 0,
    height: 0,
    dataset: {},
    _listeners: {},
    _ctx: null,
    _attrs: {},
    classList: {
      _set: {},
      add: function (c) { this._set[c] = true; },
      remove: function (c) { delete this._set[c]; },
      contains: function (c) { return !!this._set[c]; }
    },
    addEventListener: function (type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeAttribute: function (k) { delete this._attrs[k]; },
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getAttribute: function (k) { return this._attrs.hasOwnProperty(k) ? this._attrs[k] : null; },
    _scrolledIntoView: 0,
    scrollIntoView: function () { this._scrolledIntoView++; },
    querySelector: function () { return null; },
    click: function () { this._fire('click'); },
    _fire: function (type, evt) {
      var self = this;
      (this._listeners[type] || []).forEach(function (fn) {
        fn(evt || { target: self, preventDefault: function () {} });
      });
    },
    getContext: function () {
      if (!this._ctx) this._ctx = makeContext2D(this);
      return this._ctx;
    }
  };
}

// 桩 Image：造一张有明显结构的彩色图，同步触发 onload
function makeImageStub() {
  return function ImageStub() {
    this.width = 256;
    this.height = 256;
    this.crossOrigin = '';
    this.onload = null;
    this.onerror = null;
    var self = this;
    Object.defineProperty(this, 'src', {
      set: function (v) {
        self._src = v;
        self._pixels = new Uint8ClampedArray(self.width * self.height * 4);
        for (var y = 0; y < self.height; y++) {
          for (var x = 0; x < self.width; x++) {
            var i = (y * self.width + x) * 4;
            // 渐变 + 圆 + 条纹，既有平滑区也有重复纹理
            var r = Math.sqrt(Math.pow(x - 128, 2) + Math.pow(y - 110, 2));
            var v = 40 + (x + y) * 0.35;
            if (r < 70) v = 200 - r * 0.9;
            if ((x % 16) < 3 && y > 190) v = 230;
            self._pixels[i] = v;
            self._pixels[i + 1] = v * 0.92;
            self._pixels[i + 2] = v * 0.8;
            self._pixels[i + 3] = 255;
          }
        }
        if (self.onload) self.onload();
      },
      get: function () { return self._src; }
    });
  };
}

/**
 * 建一个隔离的"页面"：真实的 engine.js + app.js 跑在 vm 沙箱里
 * @param {object} opts - { withGsap: boolean } 是否提供 GSAP（模拟 CDN 可用 / 不可用）
 */
function createPage(opts) {
  opts = opts || {};

  // 从 index.html 真实的标签里建元素，连 value 属性一起带上，
  // 否则滑块初值会是空字符串，测不出页面真实的默认档位
  var html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  var elements = {};
  var m, re = /<(\w+)([^>]*?)\/?>/g;
  while ((m = re.exec(html))) {
    var tag = m[1];
    var attrs = m[2];
    var idMatch = /\bid="([^"]+)"/.exec(attrs);
    if (!idMatch) continue;
    var el = makeElement(idMatch[1], tag);
    var valueMatch = /\bvalue="([^"]*)"/.exec(attrs);
    if (valueMatch) el.value = valueMatch[1];
    var styleMatch = /\bstyle="([^"]*)"/.exec(attrs);
    if (styleMatch && /display\s*:\s*none/.test(styleMatch[1])) el.style.display = 'none';
    elements[idMatch[1]] = el;
  }

  var presetGrid = makeElement('presetGrid');
  var aiPresets = makeElement('aiPresets');

  // 预设卡片走的是事件委托，需要一个能被 closest('.preset-card') 命中的假卡片
  function makePresetCard(name) {
    var card = makeElement('_preset_' + name);
    card._attrs['data-preset'] = name;
    card.closest = function (sel) { return sel === '.preset-card' ? card : null; };
    return card;
  }
  presetGrid.clickPreset = function (name) {
    presetGrid._fire('click', { target: makePresetCard(name), preventDefault: function () {} });
  };

  var documentStub = {
    getElementById: function (id) {
      if (!elements[id]) elements[id] = makeElement(id);
      return elements[id];
    },
    querySelector: function (sel) {
      if (sel === '.preset-grid') return presetGrid;
      if (sel === '.ai-presets') return aiPresets;
      return null;
    },
    createElement: function (tag) { return makeElement('_tmp_' + tag, tag); },
    addEventListener: function () {}
  };

  // setTimeout 换成可排空的队列，让异步编码/解码在测试里跑完
  var timerQueue = [];
  var loadHandlers = [];

  var sandbox = {
    document: documentStub,
    Image: makeImageStub(),
    ImageData: ImageDataStub,
    FileReader: function () {},
    Float32Array: Float32Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Uint8Array: Uint8Array,
    Math: Math,
    Date: Date,
    console: console,
    Promise: Promise,
    Object: Object,
    Array: Array,
    JSON: JSON,
    isFinite: isFinite,
    parseInt: parseInt,
    parseFloat: parseFloat,
    setTimeout: function (fn, delay) {
      timerQueue.push({ fn: fn, delay: delay || 0 });
      return timerQueue.length;
    },
    addEventListener: function (type, fn) {
      if (type === 'load') loadHandlers.push(fn);
    },
    scrollTo: function () {}
  };

  if (opts.withGsap) {
    sandbox.gsap = {
      fromTo: function () { return null; },
      to: function () { return null; },
      set: function () { return null; }
    };
  }

  // 浏览器里 window 就是全局对象，engine.js 挂在 window 上的符号可以裸名访问；
  // 让 window 指回 sandbox 自身才能复现同样的作用域行为
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  var context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'engine.js'), 'utf8'), context, { filename: 'engine.js' });
  vm.runInContext(fs.readFileSync(path.join(DIR, 'app.js'), 'utf8'), context, { filename: 'app.js' });

  // 排空定时器；每步之间让出一次微任务队列，Promise.then 才有机会执行
  async function drain(maxSteps) {
    var steps = 0;
    var limit = maxSteps || 500000;
    while (timerQueue.length > 0) {
      if (++steps > limit) throw new Error('定时器排空超出上限，可能有无限轮询');
      timerQueue.shift().fn();
      await null;
    }
    await null;
    return steps;
  }

  return {
    sandbox: sandbox,
    el: function (id) { return documentStub.getElementById(id); },
    clickPreset: function (name) { presetGrid.clickPreset(name); },
    fireLoad: function () { loadHandlers.forEach(function (fn) { fn(); }); },
    loadHandlerCount: function () { return loadHandlers.length; },
    drain: drain
  };
}

// ===========================================================================
async function main() {
  var page = createPage({ withGsap: true });
  var el = page.el;

  console.log('\n=== Smoke 1: 页面初始化 ===');
  check(page.loadHandlerCount() === 1, 'app.js 注册了 window load 回调');
  check(typeof page.sandbox.FractalCompression === 'object',
    'engine.js 通过 window 暴露 FractalCompression，app.js 可裸名访问');

  page.fireLoad();
  await page.drain();

  check(el('decodeBtnLabel').textContent.indexOf('16') >= 0,
    '解码按钮文字由常量填充：「' + el('decodeBtnLabel').textContent + '」');
  check(el('decodeIterLabel').textContent === '迭代 0 / 16',
    '迭代标签由常量填充：「' + el('decodeIterLabel').textContent + '」');
  check(el('rangeSizeVal').textContent === '8\u00D78',
    '块大小标签初始为 8×8（滑块 value=1 映射到 8）');
  check(el('strideVal').textContent === '中', '搜索精度标签初始为「中」');
  check(el('bitIndex').textContent !== '' && el('bitIndex').textContent !== '—',
    '每块位数预告已填充：域块索引 ' + el('bitIndex').textContent + ' bit');

  // -------------------------------------------------------------------------
  console.log('\n=== Smoke 2: 滑块只产出 4 / 8 / 16 ===');
  var seen = [];
  ['0', '1', '2'].forEach(function (v) {
    el('rangeSizeSlider').value = v;
    el('rangeSizeSlider')._fire('input');
    seen.push(el('rangeSizeVal').textContent);
  });
  check(seen.join(' ') === '4\u00D74 8\u00D78 16\u00D716',
    '三档分别是 4×4 / 8×8 / 16×16（' + seen.join(' ') + '），不会出现无法整除 128 的 12');
  el('rangeSizeSlider').value = '1';
  el('rangeSizeSlider')._fire('input');

  // -------------------------------------------------------------------------
  console.log('\n=== Smoke 3: 选图 → 编码 → 解码 分步走完 ===');
  // 按用户真实操作顺序逐步点击：点预设图、点编码、点解码
  page.clickPreset('portrait');
  await page.drain();
  check(el('step2').style.display === 'block', '选图后第 2 步（编码）展开');
  check(el('statsRow').style.display !== 'flex', '还没编码，统计条不该出现');

  el('encodeBtn').click();
  await page.drain();
  check(el('statsRow').style.display === 'flex', '编码完成后统计条出现');
  check(el('statRealPSNR').textContent === '待解码',
    '编码阶段解码 PSNR 显示「待解码」，不用拼贴误差顶替');

  // 编码必须有看得见的产物，否则用户会以为按钮没反应
  check(el('decodeLabel').textContent === '拼贴图（编码结果）',
    '编码后右侧画布标注为拼贴图：「' + el('decodeLabel').textContent + '」');
  check(el('decodeCanvas').getContext('2d')._calls.putImageData === 1,
    '编码后右侧画布画出了一张真实图像（拼贴图），不再是占位文字');
  check(el('collagePreviewNote').style.display === 'block', '拼贴图的解释文案已显示');
  check(el('collageSection').style.display === 'block',
    '拼贴方框图在编码后就显示（只依赖分形码，不必等解码）');

  // drawCollage 编码后和解码后各画一次，这里清零计数器，让 Smoke 5 只量单次绘制
  var collageCtxCounters = el('collageCanvas').getContext('2d');
  collageCtxCounters._calls.strokeRect = 0;
  collageCtxCounters._calls.arc = 0;
  collageCtxCounters._strokeColors.length = 0;
  // 同理清零解码画布，Smoke 4 只统计解码过程的帧数（不含编码期的拼贴图那一帧）
  el('decodeCanvas').getContext('2d')._calls.putImageData = 0;

  el('decodeBtn').click();
  var steps = await page.drain();
  console.log('  异步任务数：' + steps);

  check(el('step3').style.display === 'block', '第 3 步（解码）已展开');
  check(el('collageSection').style.display === 'block', '解码后拼贴可视化仍然显示');
  check(el('psnrNote').style.display === 'block', '两种 PSNR 的说明已显示');

  console.log('  原图大小：' + el('statOrigSize').textContent);
  console.log('  压缩后：  ' + el('statCompSize').textContent);
  console.log('  压缩比：  ' + el('statRatio').textContent);
  console.log('  分形块数：' + el('statBlocks').textContent);
  console.log('  拼贴 PSNR：' + el('statPSNR').textContent);
  console.log('  解码 PSNR：' + el('statRealPSNR').textContent);

  check(el('statOrigSize').textContent === '16384 B', '原图大小 = 128×128 = 16384 B');
  check(el('statBlocks').textContent === '256 块', '128/8 网格切出 256 块');

  var collagePSNR = parseFloat(el('statPSNR').textContent);
  var realPSNR = parseFloat(el('statRealPSNR').textContent);
  check(isFinite(collagePSNR) && collagePSNR > 0, '拼贴 PSNR 是有效数值');
  check(isFinite(realPSNR) && realPSNR > 0, '解码 PSNR 是有效数值（不再是「待解码」）');
  check(realPSNR !== collagePSNR, '解码 PSNR 与拼贴 PSNR 是两个不同的量');
  check(collagePSNR >= realPSNR - 0.05, '拼贴 PSNR 不低于解码 PSNR（符合拼贴定理方向）');
  check(realPSNR > 25, '真实解码质量达标（' + realPSNR.toFixed(1) + ' dB）');

  var ratio = parseFloat(el('statRatio').textContent);
  check(ratio > 10 && ratio < 40, '压缩比在合理量级（' + ratio + ':1）');

  check(el('decodeIterLabel').textContent.indexOf('迭代完成') >= 0,
    '解码结束标签：「' + el('decodeIterLabel').textContent + '」');
  check(el('decodeBtn').disabled === false, '解码结束后按钮恢复可用');

  // -------------------------------------------------------------------------
  console.log('\n=== Smoke 4: 解码画布逐帧刷新 ===');
  var decodeCtx = el('decodeCanvas').getContext('2d');
  console.log('  decodeCanvas putImageData 次数：' + decodeCtx._calls.putImageData);
  check(decodeCtx._calls.putImageData >= 17, '至少 17 帧（噪音起点 + 16 次迭代）');

  // -------------------------------------------------------------------------
  console.log('\n=== Smoke 5: 拼贴图按块着色并画箭头 ===');
  var collageCtx = el('collageCanvas').getContext('2d');
  console.log('  strokeRect 次数：' + collageCtx._calls.strokeRect + '，箭头端点 arc 次数：' + collageCtx._calls.arc);
  check(collageCtx._calls.strokeRect === 256, '每个范围块画一个方框（256 个）');
  check(collageCtx._calls.arc === 40, '均匀抽样 40 条箭头，每条画一个端点圆');
  check(el('legendArrowCount').textContent === '40 / 256',
    '图例说明抽样比例：' + el('legendArrowCount').textContent);

  // 方框颜色必须随匹配质量变化，而不是一律金色
  var distinctColors = {};
  collageCtx._strokeColors.forEach(function (c) { distinctColors[c] = true; });
  var colorCount = Object.keys(distinctColors).length;
  console.log('  方框描边用到的不同颜色数：' + colorCount);
  check(colorCount > 5, '方框颜色随匹配质量变化（' + colorCount + ' 种），不是统一色');
  check(collageCtx._strokeColors.every(function (c) { return /^hsla\(/.test(c); }),
    '着色走 hsla 色相映射（绿→金→红）');

  // -------------------------------------------------------------------------
  console.log('\n=== Smoke 6: 2x 解码不编造 PSNR ===');
  el('decodeHighResBtn').click();
  await page.drain();
  console.log('  2x 解码后「解码 PSNR」显示：' + el('statRealPSNR').textContent);
  check(el('statRealPSNR').textContent === '2x 无参考',
    '2x 输出没有同分辨率原图，如实标注而不是复用 1x 的数字');
  check(el('statRealPSNR').getAttribute('title') !== null, '鼠标悬停给出解释');
  check(el('decodeLabel').textContent.indexOf('2x') >= 0,
    '画布标签标明是 2x 结果：「' + el('decodeLabel').textContent + '」');

  // -------------------------------------------------------------------------
  console.log('\n=== Smoke 7: 「换一张图」重置状态 ===');
  el('reencodeBtn').click();
  await page.drain();
  check(el('statsRow').style.display === 'none', '统计条已隐藏');
  check(el('psnrNote').style.display === 'none', 'PSNR 说明已隐藏');
  check(el('collageSection').style.display === 'none', '拼贴区已隐藏');
  check(el('decodeIterLabel').textContent === '迭代 0 / 16', '迭代标签已复位');
  check(el('decodeBtn').disabled === false, '解码按钮可用');
  check(el('uploadZone').style.display === 'block', '上传区重新出现');

  // -------------------------------------------------------------------------
  console.log('\n=== Smoke 8: GSAP CDN 拉不到时页面仍然可用（回归）===');
  // 步骤的 display 切换写在 gsapReady 回调里，动画库拿不到就会卡在第 1 步
  var offline = createPage({ withGsap: false });
  check(typeof offline.sandbox.gsap === 'undefined', '沙箱里没有 gsap，模拟 CDN 不可达');
  offline.fireLoad();
  offline.clickPreset('mountain');
  await offline.drain();
  offline.el('encodeBtn').click();
  await offline.drain();
  offline.el('decodeBtn').click();
  var offlineSteps = await offline.drain();
  console.log('  异步任务数：' + offlineSteps + '（含 GSAP 轮询超时）');

  check(offline.el('step2').style.display === 'block', '无 GSAP 时第 2 步仍然展开');
  check(offline.el('step3').style.display === 'block', '无 GSAP 时第 3 步仍然展开');
  check(offline.el('step2').style.opacity === '1', '回退 shim 把元素落到终态，不会停在透明');
  var offlinePSNR = parseFloat(offline.el('statRealPSNR').textContent);
  console.log('  无 GSAP 时解码 PSNR：' + offline.el('statRealPSNR').textContent);
  check(isFinite(offlinePSNR) && offlinePSNR > 25, '无 GSAP 时编解码全流程照常完成');

  console.log('\n===============================');
  console.log('Total: ' + (passed + failed) + ' (' + passed + ' passed, ' + failed + ' failed)');
  if (failed > 0) process.exit(1);
}

main().catch(function (err) {
  console.error('\n\u274C 冒烟测试异常终止：' + err.message);
  console.error(err.stack);
  process.exit(1);
});
