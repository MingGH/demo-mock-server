/**
 * 合取谬误 — app.js 冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / fetch / Chart 桩驱动真实的 app.js：
 * 触发 DOMContentLoaded → 第一题渲染 → 选 B 揭示踩坑 → 循环答完 10 题
 * → 结果页渲染（分数/画像/统计图）→ 重新测试复位。
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
      remove: function (c) { delete this._set[c]; },
      contains: function (c) { return !!this._set[c]; }
    },
    addEventListener: function () {},
    querySelectorAll: function () { return []; },
    getContext: function () { return null; }
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

var elements = {};
function getEl(id) {
  if (!elements[id]) elements[id] = makeElement(id);
  return elements[id];
}

var domReadyCb = null;
var fetched = [];
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
  fetch: function (url, opts) {
    fetched.push({ url: url, opts: opts });
    var perQuestion = [];
    for (var i = 0; i < 10; i++) {
      perQuestion.push({
        questionId: i + 1, total: 100, singleCount: 15, conjunctionCount: 85,
        conjunctionRate: 85.0, correctRate: 15.0
      });
    }
    var body = { status: 200, data: { totalSessions: 100, avgCorrect: 1.5, perQuestion: perQuestion } };
    return Promise.resolve({ json: function () { return Promise.resolve(body); } });
  },
  document: {
    readyState: 'complete',
    addEventListener: function (evt, cb) {
      if (evt === 'DOMContentLoaded') domReadyCb = cb;
    },
    getElementById: getEl,
    querySelectorAll: function () {
      return [makeElement('opt'), makeElement('opt')];
    },
    createElement: function () { return makeElement('created'); }
  },
  location: { pathname: '/pages/conjunction-fallacy/' },
  sessionStorage: {
    _m: {},
    getItem: function (k) { return this._m[k] || null; },
    setItem: function (k, v) { this._m[k] = v; }
  },
  Chart: function (ctx, cfg) {
    this.data = cfg.data;
    this.options = cfg.options;
    this.destroy = function () {};
  },
  NFTrack: {
    track: function (name, props, opts) {
      sandbox._tracked = sandbox._tracked || [];
      sandbox._tracked.push({ name: name, props: props, opts: opts });
    },
    trackOnce: function (name, props) {
      sandbox._tracked = sandbox._tracked || [];
      sandbox._tracked.push({ name: name, props: props });
    },
    sessionId: function () { return 'smoke-session-1'; }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

var engineModule = { exports: {} };
var engineCtx = vm.createContext({
  module: engineModule, exports: engineModule.exports,
  console: console, setTimeout: setTimeout, JSON: JSON, Math: Math, Date: Date
});
vm.runInContext(fs.readFileSync(path.join(DIR, 'engine.js'), 'utf-8'), engineCtx);
sandbox.QUESTIONS = engineModule.exports.QUESTIONS;
sandbox.isCorrect = engineModule.exports.isCorrect;
sandbox.computeResult = engineModule.exports.computeResult;
sandbox.getVerdict = engineModule.exports.getVerdict;

vm.runInContext(fs.readFileSync(path.join(DIR, 'app.js'), 'utf-8'), sandbox);

setTimeout(function () {
  // 1. 页面加载 → 无首屏，直接第一题
  domReadyCb();
  check(getEl('quizSection').classList.contains('hidden') === false, '打开即进入答题区（无首屏引导页）');
  check(getEl('scenarioText').textContent.length > 10, '第一题场景已渲染');
  check(getEl('optionAText').textContent.indexOf('银行出纳员') >= 0, '第一题选项 A 文本正确');
  check(getEl('optionBText').textContent.indexOf('女权运动') >= 0, '第一题选项 B 文本正确');
  check(getEl('currentNum').textContent === '1', '题号显示 1');
  check(sandbox._tracked.some(function (t) { return t.name === 'session_start'; }), 'session_start 已埋点');

  // 2. 选 B（合取项）→ 揭示踩坑
  sandbox.choose('B');
  check(getEl('revealBox').classList.contains('hidden') === false, '选择后揭示区显示');
  check(getEl('revealTitle').innerHTML.indexOf('踩中') >= 0, '选 B 揭示"踩中合取谬误"');
  check(getEl('revealText').textContent.length > 10, '解释文案已填充');
  check(getEl('optionB').classList.contains('wrong'), '选中的 B 标记 wrong');
  check(getEl('optionA').classList.contains('dimmed'), '未选中的 A 变暗');
  check(getEl('nextRow').classList.contains('hidden') === false, '出现"下一题"按钮');
  check(sandbox._tracked.some(function (t) {
    return t.name === 'cf_choice' && t.props.q === 1 && t.props.choice === 1 && t.props.correct === false;
  }), 'cf_choice 埋点含题号/选项/对错');

  // 2b. 揭示后再点另一选项 → 被拦截，不重复埋点、不覆盖答案
  var choiceCountBefore = sandbox._tracked.filter(function (t) { return t.name === 'cf_choice'; }).length;
  sandbox.choose('A');
  var choiceCountAfter = sandbox._tracked.filter(function (t) { return t.name === 'cf_choice'; }).length;
  check(choiceCountAfter === choiceCountBefore, '揭示后重复点选被拦截（cf_choice 不重复记录）');

  // 3. 循环答完 10 题
  for (var i = 1; i < 10; i++) {
    sandbox.nextQuestion();
    check(getEl('currentNum').textContent === String(i + 1), '第 ' + (i + 1) + ' 题已渲染');
    sandbox.choose(i % 2 === 0 ? 'A' : 'B');
  }
  var cfCount = sandbox._tracked.filter(function (t) { return t.name === 'cf_choice'; }).length;
  check(cfCount === 10, '10 题全部产生 cf_choice 埋点');

  // 4. 最后一题 → 查看结果
  sandbox.nextQuestion();
  check(getEl('quizSection').classList.contains('hidden'), '答题区隐藏');
  check(getEl('resultSection').classList.contains('hidden') === false, '结果区显示');
  check(getEl('scoreNumber').textContent === '4/10', '分数 = 4/10（第 1 题与第 10 题为 B）');
  check(getEl('verdictTitle').textContent.length > 0, '画像标题已渲染');
  check(getEl('verdictText').textContent.length > 10, '画像描述已渲染');
  check(sandbox._tracked.some(function (t) {
    return t.name === 'cf_finish' && t.props.correct === 4;
  }), 'cf_finish 埋点含得分 4');
  check(fetched.some(function (f) { return f.url.indexOf('/submit') >= 0; }), '已完成提交 /submit');
  check(getEl('distChart') !== null, '统计图表容器存在');

  // 5. 重新测试 → 复位到第一题
  sandbox.resetTest();
  check(getEl('resultSection').classList.contains('hidden'), '重开后结果区隐藏');
  check(getEl('quizSection').classList.contains('hidden') === false, '重开后答题区显示');
  check(getEl('currentNum').textContent === '1', '重开后回到第 1 题');
  check(getEl('revealBox').classList.contains('hidden'), '重开后揭示区隐藏');

  console.log('\n==============================');
  console.log('smoke passed: ' + passed + '  failed: ' + failed);
  process.exit(failed > 0 ? 1 : 0);
}, 200);
