var assert = require('assert');

global.window = {};
var fc = require('./engine.js');

var passed = 0;
var failed = 0;

function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) <= tol) {
    console.log('  \u2705 PASS: ' + msg);
    passed++;
  } else {
    console.error('  \u274C FAIL: ' + msg + ' (expected ' + expected + ', got ' + actual + ')');
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    console.log('  \u2705 PASS: ' + msg);
    passed++;
  } else {
    console.error('  \u274C FAIL: ' + msg + ' (expected ' + expected + ', got ' + actual + ')');
    failed++;
  }
}

// ===== Test 1: 成本计算 =====
console.log('\n=== Test 1: 成本计算 ===');
(function () {
  assertEqual(fc.computeFrameCount(10, 24), 240, '10s @ 24fps = 240 帧');
  assertEqual(fc.computeFrameCount(5, 12), 60, '5s @ 12fps = 60 帧');

  // 赛璐珞：2 移动层 + 2 静态层，240 帧
  assertEqual(fc.computeCelSheets(240, 2, 2), 2 * 240 + 2, '赛璐珞片数 = 移动层*帧 + 静态层');
  // 整帧重画：4 层全重画
  assertEqual(fc.computeFullRedrawSheets(240, 4), 4 * 240, '整帧重画片数 = 总层*帧');

  var info = fc.computeSavingsInfo(240, 2, 2);
  assertEqual(info.totalLayers, 4, '总层数 = 4');
  assertEqual(info.celSheets, 482, '赛璐珞 482 张');
  assertEqual(info.fullRedrawSheets, 960, '整帧重画 960 张');
  assertEqual(info.savedSheets, 960 - 482, '节省张数');
  assert(info.savingsRatio > 1, '赛璐珞节省倍数 > 1');

  // 只有 1 移动层 + 1 静态层时
  var info2 = fc.computeSavingsInfo(100, 1, 1);
  assertEqual(info2.celSheets, 101, '赛璐珞 101 张');
  assertEqual(info2.fullRedrawSheets, 200, '整帧重画 200 张');
  assertClose(info2.savingsRatio, 200 / 101, 0.001, '节省倍数 ~1.98');
})();

// ===== Test 2: 场景生成 =====
console.log('\n=== Test 2: 场景生成 ===');
(function () {
  var w = 240, h = 160;
  var bg = fc.buildBackground(w, h);
  assertEqual(bg.length, w * h * 4, '背景缓冲长度');
  assertEqual(bg[3], 255, '背景左上角不透明（天空）');
  // 背景应该有非全零内容（天空不是黑的）
  var sum = 0;
  for (var i = 0; i < bg.length; i++) sum += bg[i];
  assert(sum > 0, '背景有内容');

  var fg = fc.buildForeground(w, h);
  assertEqual(fg.length, w * h * 4, '前景缓冲长度');
  var fgHas = false;
  for (var j = 0; j < fg.length; j += 4) {
    if (fg[j + 3] > 0) { fgHas = true; break; }
  }
  assert(fgHas, '前景有树（部分像素不透明）');
})();

// ===== Test 3: 角色精灵 =====
console.log('\n=== Test 3: 角色精灵 ===');
(function () {
  var sprite = fc.buildCharacterSprite();
  assert(sprite.width > 0 && sprite.height > 0, '精灵有尺寸');
  assertEqual(sprite.data.length, sprite.width * sprite.height * 4, '精灵数据长度');
  var hasOpaque = false;
  for (var i = 0; i < sprite.data.length; i += 4) {
    if (sprite.data[i + 3] > 0) { hasOpaque = true; break; }
  }
  assert(hasOpaque, '精灵有可见像素');
})();

// ===== Test 4: 角色动画位置 =====
console.log('\n=== Test 4: 角色动画位置 ===');
(function () {
  var w = 240, h = 160, sw = 26, sh = 34;
  var p0 = fc.characterPositionAt(0, 120, w, h, sw, sh);
  var pMid = fc.characterPositionAt(119, 120, w, h, sw, sh);
  assert(pMid.x > p0.x, '角色向右移动');
  assert(pMid.x <= w - sw, '角色不超出右边界');
  assert(p0.y >= 0 && p0.y <= h - sh, '角色 y 在范围内');
  assert(p0.x >= 0, '角色 x 非负');
})();

// ===== Test 5: 合成 =====
console.log('\n=== Test 5: 合成 ===');
(function () {
  var w = 240, h = 160;
  var bg = fc.buildBackground(w, h);
  var sprite = fc.buildCharacterSprite();
  var fg = fc.buildForeground(w, h);
  var pos = fc.characterPositionAt(60, 120, w, h, sprite.width, sprite.height);

  var out = fc.composite(w, h, bg, sprite, fg, pos.x, pos.y);
  assertEqual(out.length, w * h * 4, '合成结果长度正确');

  // 角色中心附近应有非背景色（角色像素）
  var cx = pos.x + Math.round(sprite.width / 2);
  var cy = pos.y + Math.round(sprite.height / 2);
  var idx = (cy * w + cx) * 4;
  assert(out[idx + 3] === 255, '角色中心像素不透明');
  assert(out[idx] > 200, '角色中心是暖色（肤色）');

  // 无背景也能合成（透明场景）
  var out2 = fc.composite(w, h, null, null, null, 0, 0);
  assertEqual(out2.length, w * h * 4, '空场景合成正常');
})();

// ===== Test 6: 亮度闪烁 =====
console.log('\n=== Test 6: 亮度闪烁 ===');
(function () {
  var w = 240, h = 160;
  var bg = fc.buildBackground(w, h);
  var flickered = fc.applyFlicker(bg, 20);
  assertEqual(flickered.length, bg.length, '闪烁后长度不变');
  assert(flickered[0] > bg[0], '加亮后像素值变大');
  var clamped = fc.applyFlicker(bg, 300);
  assert(clamped[0] <= 255, '加亮被钳制到 255');
})();

console.log('\n===============================');
console.log('Total: ' + (passed + failed) + ' (' + passed + ' passed, ' + failed + ' failed)');
if (failed > 0) process.exit(1);