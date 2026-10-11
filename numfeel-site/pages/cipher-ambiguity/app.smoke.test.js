/**
 * app.js 端到端冒烟测试（无浏览器）
 * 运行：node app.smoke.test.js
 *
 * 用最小 DOM / Chart / gsap 桩在 vm 里驱动真实 app.js + engine.js，
 * 走完「初始渲染 → 转盘解密 → 集齐 8 种真相 → 重置 → 密钥空间 → 复制小结」全流程，
 * 验证页面接线没断、结果由真实引擎填充、重置能复位且不误计次数。
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var DIR = __dirname;
var passed = 0;
var failed = 0;

function check(cond, msg) {
  if (cond) { passed++; console.log('  ✅ PASS: ' + msg); }
  else { failed++; console.error('  ❌ FAIL: ' + msg); }
}

// --- 最小元素桩 ---
var registry = {};

function makeElement(id) {
  var el = {
    id: id,
    _text: '',
    _html: '',
    children: [],
    style: {},
    value: '',
    className: '',
    listeners: {},
    classList: {
      add: function (c) { if (!el.classList.contains(c)) el.className += (el.className ? ' ' : '') + c; },
      remove: function (c) { el.className = el.className.replace(new RegExp('(^| )' + c + '( |$)'), ' ').trim(); },
      contains: function (c) { return new RegExp('(^| )' + c + '( |$)').test(el.className); }
    },
    addEventListener: function (type, fn) { el.listeners[type] = fn; },
    appendChild: function (child) {
      el.children.push(child);
      if (child.id) registry[child.id] = child; // 让 byId 能拿到真实渲染出的节点
      return child;
    },
    removeChild: function () {},
    setAttribute: function () {},
    select: function () {}
  };
  Object.defineProperty(el, 'textContent', {
    get: function () { return el._text; },
    set: function (v) { el._text = String(v); }
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return el._html; },
    set: function (v) { el._html = String(v); el.children = []; }
  });
  return el;
}

function byId(id) {
  if (!registry[id]) registry[id] = makeElement(id);
  return registry[id];
}

// --- 全局桩 ---
var copiedText = null;
var sandbox = {
  document: {
    readyState: 'complete',
    addEventListener: function () {},
    getElementById: byId,
    createElement: function (tag) { return makeElement('el-' + tag); },
    body: makeElement('body')
  },
  navigator: {
    clipboard: {
      writeText: function (t) { copiedText = t; return Promise.resolve(); }
    }
  },
  Chart: function (ctx, cfg) {
    this.data = cfg.data;
    this.updates = 0;
    this.update = function () { this.updates++; };
  },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// 预置滑块初值（与 index.html 一致）
byId('dial').value = '8';
byId('bits').value = '4';

// 引擎 + 页面脚本拼进同一份脚本，共享顶层作用域（与浏览器 classic script 行为一致）
var engineSrc = fs.readFileSync(path.join(DIR, 'engine.js'), 'utf8');
var appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
vm.runInContext(engineSrc + '\n' + appSrc, sandbox, { filename: 'engine+app.js' });

var win = sandbox.window;

console.log('\n📍 初始渲染');
{
  var cells = (byId('hexStrip')._html.match(/cipher-cell/g) || []).length;
  check(cells === 8, '密文条渲染 8 个字节');
  check(byId('chips').children.length === 8, '收集区渲染 8 个槽位');
  check(byId('plainLine').textContent === '明晚八点，老地方见。', '初始档位 8 解出真相 1');
  check(byId('dialKey').textContent === 'K=08', '档位读数 K=08');
  check(byId('summaryText').textContent.indexOf('0/8') !== -1, '初始小结进度 0/8（初始化不计次数）');
  check(byId('triedCount').textContent === '已转动 0 次', '初始尝试次数为 0');
}

console.log('\n📍 转盘解密');
{
  win.onDialInput('1');
  check(byId('plainLine').textContent === '股票清仓，全部买金。', '档位 1 解出真相 2');
  check(byId('dialKey').textContent === 'K=01', '档位读数跟随更新');
  check(byId('chip-1').classList.contains('lit'), '真相 2 芯片点亮');
  check(byId('triedCount').textContent === '已转动 1 次', '尝试次数计 1');

  for (var k = 0; k < 16; k++) win.onDialInput(String(k));
  check(Object.keys(win).indexOf('onDialInput') !== -1, '处理器暴露在 window 上');
  check(byId('toast').className.indexOf('hidden') === -1, '集齐 8 种真相后彩蛋出现');
  check(byId('triedCount').textContent === '已转动 17 次', '尝试次数 1+16=17');
}

console.log('\n📍 重置');
{
  win.onReset();
  check(byId('chips').children.length === 8, '重置后槽位重建');
  check(!byId('chip-0').classList.contains('lit'), '芯片全部熄灭');
  check(byId('toast').className.indexOf('hidden') !== -1, '彩蛋隐藏');
  check(byId('triedCount').textContent === '已转动 0 次', '尝试次数归零（重置不计次数）');
  check(byId('plainLine').textContent.length > 0, '重置后按当前档位重新渲染');
}

console.log('\n📍 密钥空间');
{
  win.onBitsInput('64');
  check(byId('ksKeys').textContent.indexOf('10^19') !== -1, '64 位走科学计数法 ≈1.8×10^19');
  check(byId('ksBits').textContent === '64 位密钥', '位数读数更新');
  check(byId('ksMeterFill').style.width === '100%', '进度条满格');
  win.onBitsInput('999');
  check(byId('ksBits').textContent === '64 位密钥', '越界位数收敛到 64');
  win.onBitsInput('4');
  check(byId('ksKeys').textContent === '16', '回到 4 位 = 16 把');
}

console.log('\n📍 复制小结');
{
  win.onDialInput('3');
  win.onCopy();
  // clipboard Promise 的 then 在微任务里落地，等一拍再断言
  setTimeout(function () {
    check(copiedText !== null && copiedText.indexOf('16 把钥匙') !== -1, '小结已写入剪贴板');
    check(copiedText.indexOf('1/8') !== -1, '小结包含收集进度 1/8');
    check(byId('copyToast').style.visibility === 'visible', '复制成功提示可见');

    console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
    process.exit(failed ? 1 : 0);
  }, 20);
}
