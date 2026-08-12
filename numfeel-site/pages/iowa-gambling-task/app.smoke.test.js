/**
 * app.js 端到端冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / Canvas 桩驱动真实的 app.js，走完
 * 「开局 → 连续抽坏堆破产 → 结果区渲染 → 重开 → 全好堆 100 手正常结束」全流程，
 * 验证页面接线没断、结果数字由真实引擎填充、重开能复位。
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
    querySelector: function (sel) {
      if (!el._subs) el._subs = {};
      if (!el._subs[sel]) {
        el._subs[sel] = {
          textContent: '',
          className: '',
          _set: null
        };
      }
      return el._subs[sel];
    },
    getContext: function () {
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
      json: function () { return Promise.resolve({ status: 200, data: { totalSessions: 1, avgNetScore: 5 } }); }
    });
  },
  document: {
    readyState: 'complete',
    addEventListener: function () {},
    getElementById: getEl,
    createElement: function () { return makeElement('created'); }
  },
  window: {
    addEventListener: function () {},
    NF_TRACK_UMAMI_MIRROR: []
  },
  location: { pathname: '/pages/iowa-gambling-task/' },
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
    fromTo: function () {}
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
sandbox.createGame = engineModule.exports.createGame;

vm.runInContext(fs.readFileSync(path.join(DIR, 'app.js'), 'utf-8'), sandbox);

// --- 冒烟流程（用 __igt 同步钩子驱动，跳过动画定时器） ---------------------
setTimeout(function () {
  var igt = sandbox.__igt;

  // 1. 初始状态
  check(getEl('moneyDisplay').textContent === '$2,000', '开局资金 $2,000');
  check(getEl('progressDisplay').textContent === '0 / 100', '开局进度 0/100');
  check(getEl('netScoreDisplay').textContent === '0', '开局净分数 0');
  check(getEl('resultSection').style.display === 'none', '开局结果区隐藏');

  // 2. 连续抽坏堆 A → 破产
  var r;
  for (var i = 0; i < 100; i++) {
    r = igt.drawCardAndTick('A');
    if (r.over) break;
  }
  check(r.bankrupt === true, '抽 A 堆最终破产');
  check(getEl('resultSection').style.display === 'block', '破产后结果区显示');
  check(getEl('resultGrade').textContent === '破产了', '破产判定文案正确');
  check(getEl('finalNetScore').textContent === String(-r.trial), '净分数由引擎填充（=-手数）');
  check(getEl('finalMoney').textContent.indexOf('$') === 0, '最终资金已填充');

  // 3. 重开
  igt.restartGame();
  check(getEl('moneyDisplay').textContent === '$2,000', '重开后资金复位');
  check(getEl('progressDisplay').textContent === '0 / 100', '重开后进度复位');
  check(getEl('resultSection').style.display === 'none', '重开后结果区隐藏');

  // 4. 全好堆 100 手 → 正常结束
  for (var j = 0; j < 100; j++) {
    igt.drawCardAndTick(j % 2 === 0 ? 'C' : 'D');
  }
  var s = igt.getGame().getState();
  check(s.over === true && s.bankrupt === false, '100 手后正常结束（未破产）');
  check(getEl('resultSection').style.display === 'block', '结束结果区显示');
  check(getEl('finalNetScore').textContent === '100', '全好堆净分数 = 100');
  check(getEl('goodDeckRate').textContent === '100%', '好堆占比 100%');
  check(getEl('resultGrade').textContent === '优秀：直觉识破了陷阱', '优秀判定文案正确');

  // 5. 学习曲线数据
  check(JSON.stringify(s.blockScores) === '[20,20,20,20,20]', '学习曲线 5 块各 +20');

  console.log('\n==============================');
  console.log('smoke passed: ' + passed + '  failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}, 200);
