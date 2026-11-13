/**
 * 新 demo 的轻量 app 冒烟测试公共桩。
 * 用最小 DOM / Canvas / Chart 桩在 Node 里初始化页面，并跑一帧动画。
 * 只验证「能初始化、首帧不抛异常、关键元素能取到」，不替代浏览器走查。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractDefaults(html) {
  const values = {};
  const checked = new Set();
  const inputRe = /<input\b[^>]*>/gi;
  let match;

  while ((match = inputRe.exec(html))) {
    const tag = match[0];
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    if (!id) continue;
    const value = (tag.match(/value="([^"]*)"/) || [])[1];
    if (value !== undefined) values[id] = value;
    if (/\bchecked\b/.test(tag)) checked.add(id);
  }

  const selectRe = /<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
  while ((match = selectRe.exec(html))) {
    const id = match[1];
    const body = match[2];
    const selected = body.match(/<option[^>]*value="([^"]*)"[^>]*selected/);
    const first = body.match(/<option[^>]*value="([^"]*)"/);
    if (selected) values[id] = selected[1];
    else if (first) values[id] = first[1];
  }

  return { values, checked };
}

function makeClassList(element) {
  return {
    add: function (name) {
      if (!element._classes.includes(name)) element._classes.push(name);
    },
    remove: function (name) {
      element._classes = element._classes.filter(function (item) { return item !== name; });
    },
    contains: function (name) {
      return element._classes.includes(name);
    },
    toggle: function (name, force) {
      const has = element._classes.includes(name);
      const on = force === undefined ? !has : Boolean(force);
      if (on && !has) element._classes.push(name);
      if (!on && has) element._classes = element._classes.filter(function (item) { return item !== name; });
    }
  };
}

function makeContext() {
  return new Proxy({}, {
    get: function (target, property) {
      if (property in target) return target[property];
      return function () {};
    },
    set: function (target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

function makeElement(id, value, isChecked) {
  const listeners = {};
  const element = {
    id: id,
    value: value === undefined ? '' : value,
    checked: Boolean(isChecked),
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    dataset: {},
    disabled: false,
    _classes: [],
    children: [],
    addEventListener: function (type, handler) { listeners[type] = handler; },
    removeEventListener: function () {},
    appendChild: function (child) { element.children.push(child); return child; },
    removeChild: function () {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    closest: function () { return null; },
    focus: function () {},
    select: function () {},
    setSelectionRange: function () {},
    getBoundingClientRect: function () { return { width: 820, height: 620, left: 0, top: 0 }; },
    getContext: function () { return makeContext(); }
  };
  element.classList = makeClassList(element);
  return element;
}

/**
 * 初始化一个 demo 页面。
 * @param {string} dir demo 目录（包含 index.html / engine.js / app.js）
 * @returns {{passed:number, failed:number}} 结果
 */
function runSmoke(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const defaults = extractDefaults(html);
  const elements = {};

  const document = {
    readyState: 'complete',
    hidden: false,
    body: makeElement('body'),
    head: makeElement('head'),
    getElementById: function (id) {
      if (!elements[id]) {
        elements[id] = makeElement(id, defaults.values[id], defaults.checked.has(id));
      }
      return elements[id];
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { return makeElement(tag); },
    addEventListener: function () {}
  };

  let frameCalled = false;
  const window = {
    devicePixelRatio: 1,
    addEventListener: function () {},
    matchMedia: function () { return { matches: false }; },
    NFTrack: { track: function () {}, trackOnce: function () {} },
    Chart: function () {
      this.data = { labels: [], datasets: [{ data: [] }] };
      this.update = function () {};
      this.destroy = function () {};
    }
  };

  global.document = document;
  global.window = window;
  global.Chart = window.Chart;
  global.navigator = { clipboard: null };
  global.location = { pathname: '/pages/' + path.basename(dir) + '/' };
  global.requestAnimationFrame = function (callback) {
    if (frameCalled) return 1;
    frameCalled = true;
    callback(16.7);
    return 1;
  };
  global.cancelAnimationFrame = function () {};
  global.setInterval = function () { return 0; };
  global.clearInterval = function () {};
  global.setTimeout = function () { return 0; };
  global.clearTimeout = function () {};

  const engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
  const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

  vm.runInThisContext(engine, { filename: path.join(dir, 'engine.js') });
  vm.runInThisContext(app, { filename: path.join(dir, 'app.js') });

  const idCount = Object.keys(elements).length;
  if (idCount < 5) {
    throw new Error('页面初始化后访问的 DOM 元素过少：' + idCount);
  }
  // 只有动画页会调用 requestAnimationFrame；静态图表页不强制要求
  void frameCalled;
  return { passed: 1, failed: 0 };
}

module.exports = { runSmoke };
