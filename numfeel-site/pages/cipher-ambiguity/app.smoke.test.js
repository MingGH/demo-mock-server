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
    sandbox.ChartInstances.push(this);
  },
  ChartInstances: [],
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// 预置密钥空间滑块初值（与 index.html 一致）
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

console.log('\n📍 转盘交互');
{
  var dialEl = byId('dial');
  check(dialEl.children.length === 32, '转盘渲染 16 刻度线 + 16 数字');
  check(dialEl.children[17].className === 'tick-num on', '初始高亮刻度 8');
  check(byId('dialKey').textContent === 'K=08', '初始读数 K=08');

  dialEl.listeners.keydown({ key: 'ArrowRight', preventDefault: function () {} });
  check(byId('dialKey').textContent === 'K=09', '方向键右 → 9 号');
  dialEl.listeners.keydown({ key: 'End', preventDefault: function () {} });
  check(byId('dialKey').textContent === 'K=15', 'End 键 → 15 号');
  dialEl.listeners.keydown({ key: 'ArrowRight', preventDefault: function () {} });
  check(byId('dialKey').textContent === 'K=00', '越过 15 折回 0 号');

  dialEl.getBoundingClientRect = function () { return { left: 0, top: 0, width: 240, height: 240 }; };
  dialEl.listeners.pointerdown({ clientX: 120, clientY: 0, pointerId: 1, preventDefault: function () {} });
  dialEl.listeners.pointerup({});
  check(byId('dialKey').textContent === 'K=00', '点击转盘顶部 → 0 号');
  dialEl.listeners.pointerdown({ clientX: 240, clientY: 120, pointerId: 1, preventDefault: function () {} });
  check(byId('dialKey').textContent === 'K=04', '按下转盘右侧 → 4 号（顺时针 90°）');
  dialEl.listeners.pointermove({ clientX: 120, clientY: 240, pointerId: 1 });
  check(byId('dialKey').textContent === 'K=08', '拖到底部 → 8 号（顺时针 180°）');
  dialEl.listeners.pointerup({});

  check(byId('triedCount').textContent === '已转动 6 次', '键盘 3 次 + 指针 3 次全部计数');
  check(byId('chip-0').classList.contains('lit'), '真相 1 芯片点亮');
  for (var k = 0; k < 16; k++) win.onDialInput(String(k));
  check(byId('toast').className.indexOf('hidden') === -1, '集齐 8 种真相后彩蛋出现');
  check(byId('triedCount').textContent === '已转动 22 次', '尝试次数 6+16=22');
  var data = sandbox.ChartInstances[0].data.datasets[0].data;
  check(data.length === 8 && data.every(function (v) { return v === 2; }), '每柱恰好 2（16 把不同钥匙 ÷ 8 种真相）');

  win.onDialInput('0'); // 重复转已转过的档位
  data = sandbox.ChartInstances[0].data.datasets[0].data;
  check(data.every(function (v) { return v === 2; }), '重复转同一档不再累加图表');
  check(byId('triedCount').textContent === '已转动 23 次', '尝试次数仍如实累计为 23');
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
