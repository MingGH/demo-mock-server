// ========== HTML-in-Canvas 演示 · engine.js 单元测试 ==========
// 运行：node pages/html-in-canvas/engine.test.js

var engine = require('./engine.js');
var detectHtmlInCanvas = engine.detectHtmlInCanvas;
var DIFF_CASES = engine.DIFF_CASES;
var judgeCase = engine.judgeCase;
var sampleParticles = engine.sampleParticles;
var igniteParticles = engine.igniteParticles;
var stepParticles = engine.stepParticles;
var POSTER_TEMPLATES = engine.POSTER_TEMPLATES;
var statusToLabel = engine.statusToLabel;

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✅ ' + msg);
  } else {
    failed++;
    console.error('  ❌ ' + msg);
  }
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + ' (actual=' + actual + ', expected≈' + expected + ', tol=' + tol + ')');
}

// 简单的随机种子，保证 ignite/step 可复现
function makeSeededRand(seed) {
  var s = seed >>> 0;
  return function() {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s & 0xffffffff) / 0x100000000;
  };
}

// ─── 1. 特性检测 ───────────────────────────────────────────
console.log('\n[特性检测]');
{
  // Node 环境：无 document，传入 undefined → supported=false
  var r1 = detectHtmlInCanvas();
  assert(r1.supported === false, 'Node 环境下 supported 应为 false');
  assert(r1.drawElement === false, 'Node 环境下 drawElement 应为 false');

  // 用 mock canvas 模拟"支持"环境
  function mockSupportedFactory() {
    return {
      getContext: function() {
        return { drawElementImage: function() {} };
      },
      hasAttribute: function() { return false; },
      // 模拟 layoutSubtree property + onpaint
      layoutSubtree: false,
      onpaint: null
    };
  }
  var r2 = detectHtmlInCanvas(mockSupportedFactory);
  assert(r2.supported === true, 'mock 支持环境下 supported=true');
  assert(r2.drawElement === true, 'mock 环境检测到 drawElement');
  assert(r2.layoutSubtree === true, 'mock 环境检测到 layoutSubtree property');
  assert(r2.onpaint === true, 'mock 环境检测到 onpaint property');

  // mock 不支持
  function mockMissingFactory() {
    return {
      getContext: function() { return {}; },
      hasAttribute: function() { return false; }
    };
  }
  var r3 = detectHtmlInCanvas(mockMissingFactory);
  assert(r3.supported === false, 'mock 不支持环境下 supported=false');

  // 抛错也不应崩
  function mockThrowFactory() { throw new Error('boom'); }
  var r4 = detectHtmlInCanvas(mockThrowFactory);
  assert(r4.supported === false, 'factory 抛错时仍返回 supported=false');
}

// ─── 2. 差异 case 数据完整性 ───────────────────────────────
console.log('\n[差异矩阵数据]');
{
  assert(DIFF_CASES.length === 8, 'DIFF_CASES 共 8 项');
  var ids = {};
  for (var i = 0; i < DIFF_CASES.length; i++) {
    var c = DIFF_CASES[i];
    assert(typeof c.id === 'string' && c.id.length > 0, 'case[' + i + '] 有合法 id');
    assert(!ids[c.id], 'case[' + i + '] id "' + c.id + '" 唯一');
    ids[c.id] = true;
    assert(typeof c.title === 'string' && c.title.length > 0, 'case "' + c.id + '" 有 title');
    assert(typeof c.html === 'string' && c.html.length > 0, 'case "' + c.id + '" 有 html');
    assert(typeof c.legacyIssue === 'string', 'case "' + c.id + '" 有 legacyIssue');
    assert(typeof c.nativeWin === 'string', 'case "' + c.id + '" 有 nativeWin');
  }
}

// ─── 3. judgeCase 判定 ────────────────────────────────────
console.log('\n[case 判定]');
{
  var j1 = judgeCase('backdrop-filter', true);
  assert(j1.legacy === 'fail', 'backdrop-filter legacy 必失败');
  assert(j1.native === 'pass', 'hasNativeApi=true 时 native pass');

  var j2 = judgeCase('emoji', false);
  assert(j2.legacy === 'partial', 'emoji 在 html2canvas 上为 partial');
  assert(j2.native === 'unknown', 'hasNativeApi=false 时 native unknown');

  var j3 = judgeCase('not-existing', true);
  assert(j3.legacy === 'partial', '未知 case 默认 partial');
}

// ─── 4. statusToLabel ─────────────────────────────────────
console.log('\n[statusToLabel]');
{
  assert(statusToLabel('pass').tone === 'good', 'pass → good');
  assert(statusToLabel('fail').tone === 'bad', 'fail → bad');
  assert(statusToLabel('partial').tone === 'warn', 'partial → warn');
  assert(statusToLabel('unknown').tone === 'mute', 'unknown → mute');
  assert(statusToLabel('???').tone === 'mute', '未知值兜底为 mute');
}

// ─── 5. 粒子采样 ─────────────────────────────────────────
console.log('\n[粒子采样]');
{
  // 构造 10x10 像素，全部可见
  var w = 10, h = 10;
  var pixels = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    pixels[i * 4 + 0] = 200;
    pixels[i * 4 + 1] = 100;
    pixels[i * 4 + 2] = 50;
    pixels[i * 4 + 3] = 255; // alpha
  }
  // 一半像素 alpha=0
  for (var k = 0; k < 50; k++) {
    pixels[k * 4 + 3] = 0;
  }

  var p = sampleParticles(pixels, w, h, 1);
  // step=1 → 共 100 个候选，但前 50 个 alpha=0 被跳过 → 应该 50 个
  assert(p.count === 50, '采样跳过透明像素，count=50 (实际 ' + p.count + ')');
  assert(p.r[0] === 200, '采样保留 R 通道');
  assert(p.g[0] === 100, '采样保留 G 通道');
  assert(p.life[0] === 1, '初始 life=1');

  var p2 = sampleParticles(pixels, w, h, 3);
  assert(p2.count > 0 && p2.count < p.count, 'step=3 时粒子数减少');
}

// ─── 6. 粒子点燃 ─────────────────────────────────────────
console.log('\n[粒子点燃]');
{
  var w = 4, h = 4;
  var pixels = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    pixels[i * 4 + 3] = 255;
  }
  var p = sampleParticles(pixels, w, h, 1);
  var rand = makeSeededRand(42);
  igniteParticles(p, 0, 0, 5, rand);
  // 远离中心的粒子应该有更大的速度分量
  var lastIdx = p.count - 1;
  assert(p.vx[lastIdx] !== 0 || p.vy[lastIdx] !== 0, '点燃后粒子有速度');
  // 点燃完所有粒子都应该有非零速度
  var allMoving = true;
  for (var i = 0; i < p.count; i++) {
    if (p.vx[i] === 0 && p.vy[i] === 0) { allMoving = false; break; }
  }
  assert(allMoving, '所有粒子被点燃');
}

// ─── 7. 粒子步进 ─────────────────────────────────────────
console.log('\n[粒子步进]');
{
  var w = 3, h = 3;
  var pixels = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    pixels[i * 4 + 3] = 255;
  }
  var p = sampleParticles(pixels, w, h, 1);
  // 手动赋初速度
  for (var i = 0; i < p.count; i++) {
    p.vx[i] = 1;
    p.vy[i] = -2;
  }
  var x0 = p.x[0];
  var y0 = p.y[0];
  var alive = stepParticles(p, 1, { gravity: 0.2, damping: 1, decay: 0 });
  assert(alive === p.count, 'decay=0 时所有粒子存活');
  // 位置变化 ≈ 速度
  assertClose(p.x[0] - x0, 1, 0.01, '位置按 vx 推进');
  // y 应该减去 2 但 gravity 加 0.2 → 步进后 vy=-1.8，y 在步进里：先 vy+=gravity, 再 y+=vy
  // 所以 y = y0 + (-2+0.2) = y0 - 1.8
  assertClose(p.y[0] - y0, -1.8, 0.01, 'y 同时受 vy 与 gravity 影响');

  // 寿命衰减
  var p2 = sampleParticles(pixels, w, h, 1);
  for (var j = 0; j < 100; j++) {
    stepParticles(p2, 1, { gravity: 0, damping: 1, decay: 0.02 });
  }
  // 100 帧 × 0.02 = 2，life=1 早就归零
  var anyAlive = false;
  for (var k = 0; k < p2.count; k++) {
    if (p2.life[k] > 0) { anyAlive = true; break; }
  }
  assert(!anyAlive, '100 帧后所有粒子已死亡');
}

// ─── 8. 海报模板数据 ─────────────────────────────────────
console.log('\n[海报模板]');
{
  assert(POSTER_TEMPLATES.length === 5, '海报模板共 5 个');
  for (var i = 0; i < POSTER_TEMPLATES.length; i++) {
    var t = POSTER_TEMPLATES[i];
    assert(typeof t.id === 'string' && t.id, 'template[' + i + '] 有 id');
    assert(typeof t.name === 'string' && t.name, 'template[' + i + '] 有 name');
    assert(typeof t.html === 'string' && t.html.indexOf('<div') === 0, 'template[' + i + '] html 以 <div 开始');
  }
}

// ─── 收尾 ────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
