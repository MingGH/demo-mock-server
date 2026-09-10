/**
 * app.js 端到端冒烟测试（无浏览器、无网络）
 * 运行：node pages/tesseract/app.smoke.test.js
 *
 * 用最小 DOM / Canvas2D / three.js 桩驱动真实的 app.js，走完
 * 「初始化 → 动画推进 → 预设切换 → 截面开闭 → 平面国绘制 → 分享复制」全流程。
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

// ── Canvas2D 桩（记录调用）──────────────────────────────────────────────
function makeCtx2D() {
  return {
    _ops: 0,
    _texts: [],
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
    setTransform: function () {},
    clearRect: function () { this._ops++; },
    strokeRect: function () { this._ops++; },
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, arc: function () {},
    stroke: function () { this._ops++; },
    fill: function () { this._ops++; },
    fillText: function (t) { this._texts.push(String(t)); }
  };
}

// ── 元素桩 ─────────────────────────────────────────────────────────────
function makeElement(id) {
  var el = {
    id: id,
    _text: '',
    _html: '',
    _attrs: {},
    _children: [],
    _listeners: {},
    style: {},
    disabled: false,
    clientWidth: 340,
    clientHeight: 260,
    value: '0',
    classList: {
      _set: {},
      add: function (c) { this._set[c] = true; },
      remove: function (c) { delete this._set[c]; },
      toggle: function (c, force) {
        if (force === false) { delete this._set[c]; return; }
        if (force === true || !this._set[c]) { this._set[c] = true; } else { delete this._set[c]; }
      }
    },
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    getAttribute: function (k) { return (k in this._attrs) ? this._attrs[k] : null; },
    addEventListener: function (name, fn) { this._listeners[name] = fn; },
    fire: function (name) {
      if (this._listeners[name]) { this._listeners[name].call(this, { target: this }); }
    },
    appendChild: function (c) { this._children.push(c); return c; },
    removeChild: function () {},
    select: function () {}, focus: function () {}, blur: function () {},
    getContext: function () {
      if (!this._ctx) { this._ctx = makeCtx2D(); }
      return this._ctx;
    }
  };
  Object.defineProperty(el, 'textContent', {
    get: function () { return this._text; },
    set: function (v) { this._text = String(v); }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._html; },
    set: function (v) { this._html = String(v); }
  });
  Object.defineProperty(el, 'children', {
    get: function () { return this._children; }
  });
  return el;
}

// ── THREE 桩（仅覆盖 app.js 用到的 API）────────────────────────────────
function makeObject3DStub() {
  return {
    children: [],
    rotation: { x: 0, y: 0, z: 0 },
    position: { set: function () {}, x: 0, y: 0, z: 0 },
    scale: { set: function () {} },
    add: function () {},
    remove: function () {}
  };
}

var THREE = {
  Scene: function () { var s = makeObject3DStub(); return s; },
  Group: function () { return makeObject3DStub(); },
  PerspectiveCamera: function () {
    this.position = { set: function () {} };
    this.aspect = 1;
    this.lookAt = function () {};
    this.updateProjectionMatrix = function () {};
  },
  WebGLRenderer: function (opts) {
    this.domElement = opts && opts.canvas;
    this.setPixelRatio = function () {};
    this.setSize = function () {};
    this.render = function () {};
    this.setClearColor = function () {};
  },
  OrbitControls: function () {
    this.target = {};
    this.enableDamping = false;
    this.dampingFactor = 0;
    this.enablePan = false;
    this.minDistance = 0;
    this.maxDistance = 0;
    this.update = function () {};
  },
  BufferGeometry: function () {
    this.attributes = {};
    this.setAttribute = function (name, attr) { this.attributes[name] = attr; };
    this.dispose = function () {};
  },
  BufferAttribute: function (arr, size) { this.array = arr; this.itemSize = size; this.needsUpdate = false; },
  LineBasicMaterial: function (o) { this.opts = o; this.dispose = function () {}; },
  PointsMaterial: function (o) { this.opts = o; this.dispose = function () {}; },
  MeshBasicMaterial: function (o) { this.opts = o; this.dispose = function () {}; },
  LineSegments: function (g, m) { this.geometry = g; this.material = m; },
  Points: function (g, m) { this.geometry = g; this.material = m; },
  Mesh: function (g, m) { this.geometry = g; this.material = m; },
  EdgesGeometry: function () { this.dispose = function () {}; },
  ConvexHull: function () { this.build = function () {}; },
  ConvexGeometry: function (pts) { this.points = pts; this.dispose = function () {}; },
  Vector3: function (x, y, z) { this.x = x; this.y = y; this.z = z; },
  Color: function (hex) {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    this.copy = function (c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; };
    this.lerp = function (c, t) {
      this.r += (c.r - this.r) * t;
      this.g += (c.g - this.g) * t;
      this.b += (c.b - this.b) * t;
      return this;
    };
  }
};

// ── DOM 桩 ─────────────────────────────────────────────────────────────
var elements = {};
var docEvents = {};
function getEl(id) {
  if (!elements[id]) { elements[id] = makeElement(id); }
  return elements[id];
}

var sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Date: Date,
  Math: Math,
  JSON: JSON,
  isFinite: isFinite,
  parseFloat: parseFloat,
  requestAnimationFrame: function (cb) { sandbox.__rafCb = cb; return 1; },
  cancelAnimationFrame: function () {},
  matchMedia: function () { return { matches: false }; },
  addEventListener: function (name, fn) { docEvents[name] = fn; },
  document: {
    readyState: 'complete',
    getElementById: getEl,
    createElement: function () { return makeElement('created-' + Math.random()); },
    body: makeElement('body'),
    addEventListener: function () {},
    execCommand: function () { return true; }
  }
};
sandbox.window = sandbox;
sandbox.THREE = THREE;
vm.createContext(sandbox);

// ── 加载真实 engine.js + app.js ────────────────────────────────────────
var engineModule = { exports: {} };
var engineCtx = vm.createContext({
  module: engineModule, exports: engineModule.exports,
  console: console, Math: Math
});
vm.runInContext(fs.readFileSync(path.join(DIR, 'engine.js'), 'utf-8'), engineCtx);
Object.keys(engineModule.exports).forEach(function (k) {
  sandbox[k] = engineModule.exports[k];
});

vm.runInContext(fs.readFileSync(path.join(DIR, 'app.js'), 'utf-8'), sandbox);

var tess = sandbox.__tess;

// ── 冒烟流程 ───────────────────────────────────────────────────────────
check(!!tess, '__tess 已暴露');
check(tess.hasThree === true, 'THREE 桩被识别为可用');

// 1. 默认动画推进角度
var ax0 = tess.state.angles.xw;
var ay0 = tess.state.angles.yw;
tess.tick(16);
tess.tick(64);
check(tess.state.angles.xw > ax0 && tess.state.angles.yw > ay0, '动画帧推进后 XW/YW 角度增长');

// 2. 预设：静止正视
tess.applyPreset('still', true);
var stillBtn = null;
var grid = getEl('presetGrid').children;
for (var i = 0; i < grid.length; i++) {
  if (grid[i]._attrs['data-preset'] === 'still') { stillBtn = grid[i]; }
}
check(stillBtn !== null && stillBtn.classList._set.active === true, '应用预设后对应卡片高亮');
check(tess.state.speeds.xw === 0 && tess.state.speeds.yw === 0 && tess.state.speeds.zw === 0, '「静止正视」关闭全部转速');
tess.tick(128);
check(tess.state.angles.xw === 0, '零转速下角度不再变化');

// 3. 预设：龙卷风（通过按钮点击路径）
for (var j = 0; j < grid.length; j++) {
  if (grid[j]._attrs['data-preset'] === 'tornado') { grid[j].fire('click'); }
}
check(tess.state.speeds.zw > 0, '点击「龙卷风」卡片后三平面同时转动');

// 4. 截面实体开关（默认开启）
check(tess.state.sliceVisible === true, '截面实体默认打开（打开即玩）');
getEl('sliceToggleBtn').fire('click');
check(tess.state.sliceVisible === false && getEl('sliceToggleBtn').innerHTML.indexOf('显示截面实体') !== -1, '第一次点击关闭截面并切换按钮文案');
getEl('sliceToggleBtn').fire('click');
check(tess.state.sliceVisible === true, '第二次点击重新打开截面');
check(/^\d+$/.test(getEl('sliceVerts').textContent), '截面顶点数已渲染为数字（实际 ' + getEl('sliceVerts').textContent + '）');
check(getEl('sliceDesc').textContent.length > 0, '截面形态文案已填充');
check(getEl('sliceTag').textContent.indexOf('w=') !== -1, '画布角标显示切片位置');

// 5. 手动拖动切片滑杆：里程碑埋点 + 自动切割被关掉
var wEl = getEl('wSlider');
wEl.value = '-0.6';
wEl.fire('input');
check(Math.abs(tess.state.wSlice - (-0.6)) < 1e-9, '切片位置同步到状态');
check(tess.state.firstWDrag === true, '首次拖动切片记录里程碑');
check(getEl('sliceVerts').textContent !== '0', '新位置的截面仍有内容');

// 6. 自动往返开关
var beforeAuto = tess.state.sliceAuto;
getEl('autoSliceBtn').fire('click');
check(tess.state.sliceAuto === !beforeAuto, '自动切割开关翻转');
check(getEl('autoSliceBtn').innerHTML.indexOf(tess.state.sliceAuto ? '暂停自动切割' : '自动往返切割') !== -1, '按钮文案随状态刷新');
tess.tick(500);
check(Math.abs(tess.state.wSlice) <= 1.26, '自动模式下 w 被约束在范围内');

// 7. 平面国两个面板完成绘制
var cubeOpsBefore = getEl('cube2dCanvas').getContext()._ops;
tess.drawFlatland();
check(getEl('cube2dCanvas').getContext()._ops > cubeOpsBefore, '左侧平面国面板执行了绘制指令');
var tessTexts = getEl('tess2dCanvas').getContext()._texts.join('|');
check(tessTexts.length > 0, '右侧超立方体面板输出了说明文字（' + tessTexts.slice(0, 30) + '…）');

// 8. 穿越进度滑杆联动
var crossEl = getEl('crossSlider');
crossEl.value = '1.2';
crossEl.fire('input');
check(Math.abs(tess.state.crossValue - 1.2) < 1e-9, '穿越进度同步到状态');
check(getEl('crossValue').textContent === '1.20', '进度数值标签格式化正确');

// 9. 分享文本
var shareText = tess.buildShareText();
check(shareText.indexOf('XW=') !== -1 && shareText.indexOf('w=') !== -1, '分享文本包含旋转与切片参数');
check(shareText.indexOf('https://numfeel.996.ninja/pages/tesseract/') !== -1, '分享文本包含页面链接');

// 10. 复制按钮（无 navigator.clipboard 时走 execCommand 兜底）
getEl('copyShareBtn').fire('click');
check(getEl('copyHint').textContent.indexOf('复制') !== -1, '复制后出现提示语');

// 11. 离页事件已注册且可安全触发
check(typeof docEvents['pagehide'] === 'function', 'pagehide 监听已注册');
docEvents['pagehide'].call(sandbox, {});
check(true, 'pagehide 触发无异常');

console.log('\n==============================');
console.log('smoke passed: ' + passed + '  failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);
