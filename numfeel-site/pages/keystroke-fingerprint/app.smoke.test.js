/**
 * app.js 端到端冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / Canvas 桩驱动真实的 app.js，走完
 * 「开局 → 注入两遍打字事件 → 分析区显示 → 提交后端 → 结果渲染 → 重开」全流程。
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

// --- 最小元素桩 ------------------------------------------------------------
function makeElement(id) {
  var el = {
    id: id,
    _text: '',
    _html: '',
    style: { display: 'none' },
    classList: {
      _set: {},
      add: function (c) { this._set[c] = true; },
      remove: function (c) { delete this._set[c]; }
    },
    dataset: {},
    addEventListener: function () {},
    scrollIntoView: function () {},
    offsetWidth: 100,
    disabled: false,
    checked: false,
    value: '',
    _children: [],
    appendChild: function (c) { this._children.push(c); return c; },
    remove: function () {},
    onclick: null,
    focus: function () {},
    querySelector: function () { return makeElement(id + '-sub'); },
    querySelectorAll: function () { return []; }
  };
  Object.defineProperty(el, 'textContent', {
    get: function () { return this._text; },
    set: function (v) { this._text = String(v); }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._html; },
    set: function (v) { this._html = String(v); }
  });
  el.getContext = function () {
    return {
      canvas: el,
      fillStyle: '', strokeStyle: '', lineWidth: 1,
      fillRect: function () {}, beginPath: function () {},
      moveTo: function () {}, lineTo: function () {}, stroke: function () {},
      fill: function () {}, arc: function () {}, clearRect: function () {},
      save: function () {}, restore: function () {}, translate: function () {},
      rotate: function () {}, scale: function () {},
      measureText: function () { return { width: 10 }; }
    };
  };
  return el;
}

// --- DOM 桩 ----------------------------------------------------------------
var elements = {};
function getEl(id) {
  if (!elements[id]) elements[id] = makeElement(id);
  return elements[id];
}

var sandbox = {
  addEventListener: function () {},
  scrollTo: function () {},
  alert: function () {},
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  Date: Date,
  Math: Math,
  JSON: JSON,
  fetch: function () {
    return Promise.resolve({
      json: function () { return Promise.resolve({ status: 200, data: { totalSamples: 10, avgTotalMs: 8000, avgHoldMs: 100, avgIntervalMs: 200, nearestDistance: 0.8, sampleCount: 2, lastSeenAt: -1 } }); }
    });
  },
  document: {
    readyState: 'complete',
    addEventListener: function () {},
    getElementById: getEl,
    createElement: function () { return makeElement('created'); },
    querySelectorAll: function () { return []; }
  },
  window: {
    addEventListener: function () {},
    NF_TRACK_UMAMI_MIRROR: []
  },
  location: { pathname: '/pages/keystroke-fingerprint/' },
  sessionStorage: {
    _m: {},
    getItem: function (k) { return this._m[k] || null; },
    setItem: function (k, v) { this._m[k] = v; }
  },
  Chart: function (ctx, cfg) {
    this.data = cfg.data;
    this.options = cfg.options;
    this.update = function () {};
    this.destroy = function () {};
  },
  gsap: null
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// --- 加载真实 engine.js + app.js -------------------------------------------
var engineModule = { exports: {} };
var engineCtx = vm.createContext({
  module: engineModule, exports: engineModule.exports,
  console: console, setTimeout: setTimeout, JSON: JSON, Math: Math, Date: Date
});
vm.runInContext(fs.readFileSync(path.join(DIR, 'engine.js'), 'utf-8'), engineCtx);
Object.keys(engineModule.exports).forEach(function (k) {
  sandbox[k] = engineModule.exports[k];
});

vm.runInContext(fs.readFileSync(path.join(DIR, 'app.js'), 'utf-8'), sandbox);

// --- 工具：生成一遍打字事件序列 ---------------------------------------------
function makeTypingEvents(seedShift) {
  var target = engineModule.exports.TARGET_TEXT;
  var events = [];
  var now = 1000000;
  for (var i = 0; i < target.length; i++) {
    var down = now;
    var up = down + 80 + (i % 3) * 15 + seedShift;
    events.push({ key: target[i], down: down, up: up });
    now = up + 100 + (i % 4) * 20;
  }
  return events;
}

// --- 冒烟流程 ---------------------------------------------------------------
setTimeout(function () {
  var kt = sandbox.__kt;

  // 1. init 自动开始第 1 遍
  check(kt.isTyping(), '开局自动进入打字状态');

  // 1.5 移动端空特征：无键盘事件 → 提示用实体键盘，不记录样本
  kt.setTyping(false);
  kt.startTyping();
  kt.injectEvents([]);   // 软键盘无 keydown/keyup
  kt.finishTyping();
  check(kt.getSamples().length === 0, '空特征不记录样本');
  check(getEl('retryBtn') !== undefined, '空特征提示重试按钮');
  sandbox.restartDemo();

  // 注入第 1 遍事件并完成
  kt.injectEvents(makeTypingEvents(0));
  kt.finishTyping();
  check(kt.getSamples().length === 1, '第 1 遍样本已记录');

  // 2. 第 2 遍（直接复用 startTyping → 注入 → finish）
  kt.startTyping();
  check(kt.isTyping(), '第 2 遍开始');
  kt.injectEvents(makeTypingEvents(5));
  kt.finishTyping();
  check(kt.getSamples().length === 2, '第 2 遍样本已记录');
  check(getEl('analysisSection').style.display === 'block', '分析区已显示');
  check(getEl('stabilityGrade').textContent !== '-', '稳定度评级已填充');

  // 3. 提交 + 全站对比
  sandbox.submitAndCompare();
  setTimeout(function () {
    check(getEl('resultSection').style.display === 'block', '结果区已显示');
    check(getEl('resSamples').textContent === '10', '全站样本数已填充');
    check(getEl('resNearest').textContent === '0.8', '最近邻居距离已填充');
    check(getEl('uniqueContent')._html.indexOf('识别结果') === -1, '未匹配时不显示识别结果');

    // 4. 重开
    sandbox.restartDemo();
    check(kt.getSamples().length === 0, '重开后样本清空');
    check(getEl('analysisSection').style.display === 'none', '重开后分析区隐藏');
    check(getEl('resultSection').style.display === 'none', '重开后结果区隐藏');
    check(kt.isTyping(), '重开后自动开始打字');

    console.log('\n==============================');
    console.log('smoke passed: ' + passed + '  failed: ' + failed);
    process.exit(failed > 0 ? 1 : 0);
  }, 300);
}, 200);
