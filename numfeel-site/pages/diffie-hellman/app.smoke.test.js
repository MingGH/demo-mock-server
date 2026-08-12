/**
 * app.js 端到端冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / Canvas 桩驱动真实的 app.js，走完
 * 「选色 → 生成共享色 → 数学版联动 → 答题 → 提交 → 结果区渲染 → 重开」全流程，
 * 验证页面接线没断、结果由真实引擎填充、重开能复位。
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
  if (!elements[id]) {
    elements[id] = makeElement(id);
    // 模拟 index.html 的默认选中值
    if (id === 'aliceColor') elements[id].value = 'red';
    if (id === 'bobColor') elements[id].value = 'green';
    if (id === 'pSlider') elements[id].value = '23';
    if (id === 'gSlider') elements[id].value = '5';
    if (id === 'aSlider') elements[id].value = '6';
    if (id === 'bSlider') elements[id].value = '15';
  }
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
  location: { pathname: '/pages/diffie-hellman/' },
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
  gsap: {
    from: function () {}
  }
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
// 把 engine 全局暴露给 app.js（浏览器里 <script> 直接加载即为全局）
Object.keys(engineModule.exports).forEach(function (k) {
  sandbox[k] = engineModule.exports[k];
});

vm.runInContext(fs.readFileSync(path.join(DIR, 'app.js'), 'utf-8'), sandbox);

// --- 冒烟流程 ---------------------------------------------------------------
setTimeout(function () {
  var dh = sandbox.__dh;

  // 0. 初始化 select 默认值（对应 index.html 的默认选中）
  getEl('aliceColor').value = 'red';
  getEl('bobColor').value = 'green';
  getEl('pSlider').value = 23;
  getEl('gSlider').value = 5;
  getEl('aSlider').value = 6;
  getEl('bSlider').value = 15;

  // 1. Stage1：选不同色 → 生成共享色
  sandbox.onSecretChange();
  dh.colorStep();
  check(dh.isColorStepDone(), '颜色版完成（共享色已生成）');
  check(getEl('sharedBox').style.display === 'block', '共享色结果框显示');

  // 2. Stage2：数学版联动（改滑块触发重算）
  sandbox.onMathChange();
  var aliceFormula = getEl('aliceFormula').innerHTML;
  check(aliceFormula.indexOf('=') > -1 && aliceFormula.indexOf('A') === 0, '数学版公式渲染（A = g^a mod p = …）');

  // 3. Eve 破解
  dh.tryCrack();
  check(getEl('crackResult').style.display === 'block', '破解提示显示');

  // 3.5 漏题提交应被拦截（跳着选：先选第 5 题，长度够但有空位）
  sandbox.restartDemo();
  dh.setAnswer(4, 1); // 只选第 5 题，1~4 为空
  var alerted = false;
  var origAlert = sandbox.alert;
  sandbox.alert = function () { alerted = true; };
  dh.submitQuiz();
  sandbox.alert = origAlert;
  check(alerted && !dh.isQuizSubmitted(), '漏题提交被拦截');
  sandbox.restartDemo();

  // 4. Stage3：答题（5 题全对）
  var correctAnswers = engineModule.exports.QUIZ.map(function (q) { return q.answer; });
  correctAnswers.forEach(function (a, i) { dh.setAnswer(i, a); });
  check(dh.getAnswers().length === 5, '已填 5 题答案');
  dh.submitQuiz();
  check(dh.isQuizSubmitted(), '答卷已提交');
  check(getEl('resultSection').style.display === 'block', '结果区显示');
  check(getEl('scoreDisplay').textContent === '5 / 5', '得分显示 5/5');
  check(getEl('explainList').innerHTML.indexOf('答对') > -1, '解析列表渲染');

  // 5. 重开复位
  sandbox.restartDemo();
  check(!dh.isQuizSubmitted(), '重开后答卷状态复位');
  check(getEl('resultSection').style.display === 'none', '重开后结果区隐藏');
  check(getEl('sharedBox').style.display === 'none', '重开后共享框隐藏');
  check(!getEl('colorStepBtn').disabled, '重开后按钮恢复可用');

  console.log('\n==============================');
  console.log('smoke passed: ' + passed + '  failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}, 200);
