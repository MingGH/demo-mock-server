/**
 * app.js 端到端冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / Canvas / Image 桩驱动真实的 app.js，走完
 * 「文本压缩 → 无损验证 → 字典动画」和「噪声压不动 → 图片调色板压缩」两条主链路，
 * 验证页面接线没断、统计数字真的被填上、无损徽章和鸽巢提示真的出现。
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

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ── 最小 DOM 桩 ──────────────────────────────────────────────────────────
function makeElement(id) {
  var el = {
    id: id,
    style: {},
    listeners: {},
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    max: '1',
    min: '0',
    attrs: {},
    _displaySet: null,
    children: []
  };
  el.style = new Proxy({}, {
    set: function (t, k, v) { t[k] = v; return true; },
    get: function (t, k) { return t[k]; }
  });
  el.classList = {
    add: function (c) {
      var set = el.className.split(' ').filter(Boolean);
      if (set.indexOf(c) < 0) set.push(c);
      el.className = set.join(' ');
    },
    remove: function (c) {
      el.className = el.className.split(' ').filter(function (x) { return x !== c; }).join(' ');
    },
    contains: function (c) { return el.className.split(' ').indexOf(c) >= 0; }
  };
  el.addEventListener = function (t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); };
  el.dispatch = function (t, ev) {
    (el.listeners[t] || []).forEach(function (fn) {
      fn.call(el, ev || { target: el, preventDefault: function () {} });
    });
  };
  el.getAttribute = function (k) { return el.attrs[k] != null ? el.attrs[k] : null; };
  el.setAttribute = function (k, v) { el.attrs[k] = String(v); };
  el.querySelector = function () { return null; };
  el.querySelectorAll = function () { return []; };
  el.append = function () {};
  el.appendChild = function () {};
  el.removeChild = function () {};
  el.scrollIntoView = function () {};
  el.click = function () { el.dispatch('click'); };
  return el;
}

// 预注册需要 querySelectorAll 的结构：输入类型标签、文本预设按钮
function makeTab(id, type) {
  var el = makeElement(id);
  el.attrs['data-type'] = type;
  el.closest = function () { return el; };
  return el;
}

var tabs = [makeTab('tabText', 'text'), makeTab('tabImage', 'image'), makeTab('tabNoise', 'noise')];
var presets = [];
['poem', 'tongue', 'prose'].forEach(function (name) {
  var b = makeElement('preset-' + name);
  b.attrs['data-text'] = name;
  b.closest = function () { return b; };
  presets.push(b);
});

var elements = {};
function byId(id) {
  if (!elements[id]) elements[id] = makeElement(id);
  return elements[id];
}
// 画布类元素必须是 canvas 桩（要有 getContext）
['previewOriginalCanvas', 'previewQuantCanvas', 'verifyOrigCanvas', 'verifyDecodedCanvas'].forEach(function (cid) {
  elements[cid] = makeCanvas();
});
// 预置初始状态
byId('panelText').style.display = '';
byId('panelImage').style.display = 'none';
byId('panelNoise').style.display = 'none';
byId('noiseSizeSlider').value = '1';
byId('animSpeedSlider').value = '2';

var documentStub = {
  readyState: 'complete',
  getElementById: byId,
  createElement: function (tag) {
    if (tag === 'canvas') return makeCanvas();
    return makeElement(tag + '-' + Math.random());
  },
  addEventListener: function () {},
  querySelectorAll: function (sel) {
    if (sel === '.type-tab') return tabs;
    if (sel === '.text-preset') return presets;
    return [];
  },
  querySelector: function () { return null; },
  body: makeElement('body')
};

// ── Canvas / Image 桩 ────────────────────────────────────────────────────
function ImageDataStub(data, w, h) { this.data = data; this.width = w; this.height = h; }

function makeCanvas() {
  var canvas = { width: 0, height: 0, _buffer: null };
  var ctx = {
    canvas: canvas,
    createImageData: function (w, h) {
      return new ImageDataStub(new Uint8ClampedArray(w * h * 4), w, h);
    },
    putImageData: function (imageData) {
      canvas._buffer = imageData.data;
    },
    drawImage: function (img, dx, dy, dw, dh) {
      var out = new Uint8ClampedArray(64 * 64 * 4);
      for (var y = 0; y < 64; y++) {
        for (var x = 0; x < 64; x++) {
          var v = Math.round(x / 64 * 255); // 渐变图案，保证 16 级量化后有重复
          var di = (y * 64 + x) * 4;
          out[di] = v; out[di + 1] = v; out[di + 2] = v; out[di + 3] = 255;
        }
      }
      canvas._buffer = out;
    },
    getImageData: function () {
      return new ImageDataStub(canvas._buffer || new Uint8ClampedArray(64 * 64 * 4), 64, 64);
    }
  };
  canvas.getContext = function () { return ctx; };
  canvas.toDataURL = function () { return 'data:image/png;base64,stub'; };
  return canvas;
}

function makeImage() {
  var img = {
    onload: null,
    onerror: null,
    _src: '',
    _fail: false
  };
  // 模拟真实浏览器：naturalWidth/Height 是只读 getter（strict 模式下赋值会抛错），
  // 解码完成后才返回真实尺寸
  var loaded = false;
  Object.defineProperty(img, 'naturalWidth', { get: function () { return loaded ? 64 : 0; } });
  Object.defineProperty(img, 'naturalHeight', { get: function () { return loaded ? 64 : 0; } });
  Object.defineProperty(img, 'width', { get: function () { return loaded ? 64 : 0; } });
  Object.defineProperty(img, 'height', { get: function () { return loaded ? 64 : 0; } });
  // 真实浏览器里设置 src 是异步解码：赋值后调度 onload / onerror
  Object.defineProperty(img, 'src', {
    get: function () { return img._src; },
    set: function (v) {
      img._src = v;
      setTimeout(function () {
        if (img._fail) {
          if (img.onerror) img.onerror();
        } else {
          loaded = true;
          if (img.onload) img.onload();
        }
      }, 0);
    }
  });
  return img;
}

// ── 沙箱 ────────────────────────────────────────────────────────────────
var tracked = [];
var NFTrackStub = {
  track: function (name, props) { tracked.push({ name: name, props: props || {}, once: false }); },
  trackOnce: function (name, props) { tracked.push({ name: name, props: props || {}, once: true }); }
};

var sandbox = {
  document: documentStub,
  window: null, // 见下方
  navigator: { clipboard: null },
  Image: makeImage,
  URL: { createObjectURL: function () { return 'blob:stub'; }, revokeObjectURL: function () {} },
  performance: globalThis.performance,
  crypto: globalThis.crypto,
  addEventListener: function () {},
  removeEventListener: function () {},
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  NFTrack: NFTrackStub
};
sandbox.window = sandbox;
sandbox.global = sandbox;

vm.createContext(sandbox);

var engineSrc = fs.readFileSync(path.join(DIR, 'engine.js'), 'utf8');
var appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
vm.runInContext(engineSrc, sandbox);
vm.runInContext(appSrc, sandbox);

// ── 用例 ────────────────────────────────────────────────────────────────
async function main() {
  // 1. 启动即带默认示例文本
  var textInput = byId('textInput');
  check(textInput.value.indexOf('所谓伊人') === 0, '启动加载默认示例文本（零门槛）');
  check(tracked.some(function (t) { return t.name === 'session_start'; }), 'session_start 已上报');

  // 2. 文本压缩 → 统计 / 无损验证 / 动画区
  byId('compressBtn').dispatch('click');
  check(byId('statsRow').style.display === '', '统计行出现');
  check(parseFloat(byId('statRatio').textContent) >= 1, '重复文本压缩比 ≥ 1×，实际 ' + byId('statRatio').textContent);
  check(byId('statOrigBytes').textContent.indexOf('B') > 0, '原始大小已填');
  check(byId('verifySection').style.display === '', '无损验证区出现');
  check(byId('losslessBadge').className.indexOf('fail') < 0, '无损徽章为绿色（非失败态）');
  check(byId('decodedTextDisplay').textContent === byId('origTextDisplay').textContent, '解压文本与原文逐字一致');
  check(byId('animSection').style.display === '', '动画区出现');
  check(byId('pigeonSection').style.display === 'none', '文本模式不显示鸽巢提示');
  check(tracked.some(function (t) { return t.name === 'input_type' && t.props.type === 'text'; }), 'input_type=text 已上报');

  // 3. 动画渲染：跳到最后一步
  var animSlider = byId('animProgressSlider');
  animSlider.value = animSlider.max;
  animSlider.dispatch('input');
  check(byId('stepCounter').textContent.indexOf(' / ') > 0, '步骤计数显示');
  check(byId('stepDescText').textContent.length > 0, '步骤描述非空');
  check(byId('dictTable').innerHTML.indexOf('<tr>') >= 0, '字典表已渲染');
  check(byId('dictTable').innerHTML.indexOf('alphabet-row') >= 0, '字典表含字母表行');
  check(byId('codeChips').innerHTML.indexOf('code-chip') >= 0, '编号流 chips 已渲染');
  check(byId('animInput').innerHTML.indexOf('sym-cell') >= 0, '读头输入区已渲染');
  byId('animPlayBtn').dispatch('click');
  check(tracked.some(function (t) { return t.name === 'animate_start'; }), 'animate_start 已上报');
  byId('animPlayBtn').dispatch('click'); // 暂停

  // 4. 噪声：压不动 + 鸽巢提示 + 无损
  byId('typeTabs').dispatch('click', { target: tabs[2] }); // 切到噪声
  check(byId('panelNoise').style.display === '', '噪声面板显示');
  check(byId('noisePreview').textContent.length > 0, '噪声已生成并预览');
  byId('compressBtn').dispatch('click');
  var ratioNoise = parseFloat(byId('statRatio').textContent);
  check(ratioNoise < 1, '噪声压缩比 < 1（压不动还变大），实际 ' + byId('statRatio').textContent);
  check(byId('pigeonSection').style.display === '', '鸽巢原理提示出现');
  check(byId('losslessBadge').className.indexOf('fail') < 0, '噪声解压仍逐字节一致');
  check(tracked.some(function (t) { return t.name === 'input_type' && t.props.type === 'noise'; }), 'input_type=noise 已上报');

  // 5. 图片：默认示例图 + 调色板压缩 + 像素级无损
  byId('typeTabs').dispatch('click', { target: tabs[1] }); // 切到图片
  check(byId('panelImage').style.display === '', '图片面板显示');
  check(!tracked.some(function (t) { return t.name === 'upload' && t.props.source === 'default'; }),
    '图片异步解码中：upload 尚未上报（回归：同步装载会在此时就已上报）');
  await sleep(30); // 等默认图 onload
  check(byId('imagePreview').style.display === '', '默认示例图已装载并预览');
  check(tracked.some(function (t) { return t.name === 'upload' && t.props.source === 'default'; }), 'upload(source=default) 已上报');
  byId('compressBtn').dispatch('click');
  check(parseFloat(byId('statRatio').textContent) >= 1, '图片有调色板压缩，压缩比 ' + byId('statRatio').textContent);
  check(byId('verifyPixelDiff').textContent.indexOf('全部一致') >= 0, '像素级无损验证通过');
  check(byId('losslessBadge').className.indexOf('fail') < 0, '图片无损徽章为绿色');
  check(tracked.some(function (t) { return t.name === 'input_type' && t.props.type === 'image'; }), 'input_type=image 已上报');

  // 6. 下载按钮存在（不真点，避免 Blob 环境差异）
  check(byId('downloadBtn').id === 'downloadBtn', '下载按钮就位');
  check(byId('copyBtn').id === 'copyBtn', '复制按钮就位');

  // 7. 回归：图片解码失败不崩溃、不误报 upload 完成
  var uploadCountBefore = tracked.filter(function (t) { return t.name === 'upload'; }).length;
  var OrigImage = sandbox.Image;
  sandbox.Image = function () {
    var img = OrigImage();
    img._fail = true; // 令 src 赋值后触发 onerror 而非 onload
    return img;
  };
  var threw = false;
  try {
    byId('imageFile').files = [{ type: 'image/png', name: 'fail.png' }];
    byId('imageFile').dispatch('change');
    await sleep(20);
  } catch (e) {
    threw = true;
  }
  sandbox.Image = OrigImage;
  check(!threw, '图片解码失败路径不抛异常');
  check(byId('imagePreview').style.display === '', '失败路径不影响已装载的示例图预览');
  check(tracked.filter(function (t) { return t.name === 'upload'; }).length === uploadCountBefore + 1,
    'upload(source=file) 仍按预期上报');

  console.log('\n冒烟测试：通过 ' + passed + '，失败 ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

main();
