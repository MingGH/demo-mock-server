/**
 * app.js 端到端冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / Canvas 桩驱动真实的 app.js，走完
 * 「投资 → AI返还 → 角色反转返还 → 结果画像 → 提交 → 重开」全流程。
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
    max: '30',
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

var elements = {};
function getEl(id) {
  if (!elements[id]) {
    elements[id] = makeElement(id);
    if (id === 'investSlider') elements[id].value = '5000';
    if (id === 'returnSlider') elements[id].value = '0';
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
  fetch: function () {
    return Promise.resolve({
      json: function () { return Promise.resolve({ status: 200, data: { totalSessions: 10, avgInvest: 5.2, avgReturn: 4.7, investDistribution: [1,0,0,1,1,2,1,1,1,1,1] } }); }
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
  location: { pathname: '/pages/trust-game/' },
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

setTimeout(function () {
  var tg = sandbox.__tg;

  // 1. 初始投资 = 5000
  check(tg.getInvest() === 5000, '默认投资额 5000');

  // 2. 确认投资 → AI 返还 → 进入 Stage 2
  tg.confirmInvest();
  check(tg.isInvestConfirmed(), '投资已确认');
  check(getEl('investResultSection').style.display === 'block', '投资结果显示');
  check(getEl('trusteeSection').style.display === 'block', '被委托人阶段显示');

  // 3. 确认返还 → 结果
  tg.confirmReturn();
  check(tg.isReturnConfirmed(), '返还已确认');
  check(getEl('resultSection').style.display === 'block', '结果区显示');
  check(getEl('profileLabel').textContent !== '-', '画像标签已填充');
  check(getEl('resInvestRate').textContent.indexOf('%') > -1, '信任指数已填充');

  // 4. 重开
  sandbox.restartDemo();
  check(!tg.isInvestConfirmed(), '重开后投资状态复位');
  check(!tg.isReturnConfirmed(), '重开后返还状态复位');
  check(getEl('resultSection').style.display === 'none', '重开后结果区隐藏');
  check(tg.getInvest() === 5000, '重开后投资额复位 5000');

  console.log('\n==============================');
  console.log('smoke passed: ' + passed + '  failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}, 200);
