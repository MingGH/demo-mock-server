// 测试文件：前端能防截图吗？核心逻辑
// 运行：node screenshot-guard.test.js

var mod = require('./engine.js');
var TECHNIQUES = mod.TECHNIQUES;
var assessProtectionLevel = mod.assessProtectionLevel;
var simulateBattle = mod.simulateBattle;
var generateWatermarkToken = mod.generateWatermarkToken;
var REAL_WORLD_CASES = mod.REAL_WORLD_CASES;
var RANDOM_TIPS = mod.RANDOM_TIPS;
var pickRandomTip = mod.pickRandomTip;

var passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.error('  ❌ ' + msg); }
}
function findTech(id) {
  for (var i = 0; i < TECHNIQUES.length; i++) if (TECHNIQUES[i].id === id) return TECHNIQUES[i];
  return null;
}

console.log('\n🧪 前端能防截图吗？- 核心逻辑测试\n');

// ── TECHNIQUES 数据完整性 ──
console.log('--- TECHNIQUES 数据完整性 ---');
assert(Array.isArray(TECHNIQUES) && TECHNIQUES.length >= 8, '至少 8 种技术: ' + TECHNIQUES.length);
for (var i = 0; i < TECHNIQUES.length; i++) {
  var t = TECHNIQUES[i];
  assert(!!t.id && !!t.name && !!t.desc, t.name + ' 有 id/name/desc');
  assert(t.difficulty >= 1 && t.difficulty <= 5, t.name + ' 难度 1~5: ' + t.difficulty);
  assert(t.effectiveness >= 0 && t.effectiveness <= 100, t.name + ' 有效性 0~100: ' + t.effectiveness);
  assert(!!t.category, t.name + ' 有 category');
}

// ── ID 唯一 ──
console.log('--- ID 唯一性 ---');
var ids = TECHNIQUES.map(function (t) { return t.id; });
var idSet = {};
var dup = false;
for (var i2 = 0; i2 < ids.length; i2++) {
  if (idSet[ids[i2]]) dup = true;
  idSet[ids[i2]] = true;
}
assert(!dup, '所有技术 id 唯一');

// ── assessProtectionLevel 边界 ──
console.log('--- assessProtectionLevel 边界 ---');
var empty = assessProtectionLevel([]);
assert(empty.level === 0 && empty.label === '无防护', '空数组 → 0/无防护');
var nullRes = assessProtectionLevel(null);
assert(nullRes.level === 0, 'null 也返回 0');

var single = assessProtectionLevel([findTech('block-f12-menu')]);
assert(single.level >= 0 && single.level < 20, '仅 F12 拦截评分很低: ' + single.level);
assert(typeof single.color === 'string' && single.color.charAt(0) === '#', '返回色值');

var all = assessProtectionLevel(TECHNIQUES);
assert(all.level > 0 && all.level <= 100, '全部启用评分合法: ' + all.level);

// ── 单调性 ──
console.log('--- 评分单调性 ---');
var lvOne = assessProtectionLevel([findTech('hdcp-drm')]).level;
var lvTwo = assessProtectionLevel([findTech('hdcp-drm'), findTech('dynamic-watermark')]).level;
assert(lvTwo >= lvOne, '加一项防护不降低评分: ' + lvTwo + ' >= ' + lvOne);
var lvWeak = assessProtectionLevel([findTech('block-f12-menu')]).level;
var lvStrong = assessProtectionLevel([findTech('hdcp-drm')]).level;
assert(lvStrong > lvWeak, 'HDCP 评分高于 F12 拦截');

// ── simulateBattle 结构 ──
console.log('--- simulateBattle 结构 ---');
var attacks = ['os-screenshot', 'phone-camera', 'os-recording', 'devtools-save', 'headless-crawler'];
for (var a = 0; a < attacks.length; a++) {
  var res = simulateBattle(TECHNIQUES, attacks[a]);
  assert(res && Array.isArray(res.results), attacks[a] + ' 返回 results 数组');
  assert(res.results.length === TECHNIQUES.length, attacks[a] + ' results 长度匹配');
  assert(typeof res.verdict === 'string' && res.verdict.length > 0, attacks[a] + ' 有 verdict');
  assert(typeof res.score === 'number' && res.score >= 0, attacks[a] + ' score 为非负数字');
  for (var k = 0; k < res.results.length; k++) {
    var r = res.results[k];
    assert(r.outcome === 'blocked' || r.outcome === 'traceable' || r.outcome === 'useless',
      attacks[a] + ' · ' + r.name + ' outcome 合法: ' + r.outcome);
  }
}

// ── 手机对屏拍照：必然绕过所有非水印防护 ──
console.log('--- 手机对屏拍照 vs 全部防护 ---');
var phoneRes = simulateBattle(TECHNIQUES, 'phone-camera');
for (var p = 0; p < phoneRes.results.length; p++) {
  var pr = phoneRes.results[p];
  var tech = findTech(pr.id);
  if (tech.category === 'watermark') {
    assert(pr.outcome === 'traceable', '水印类对手机拍照: 可溯源 (' + pr.name + ')');
  } else {
    assert(pr.outcome === 'useless', '非水印类对手机拍照: 无效 (' + pr.name + ')');
  }
}

// ── HDCP 对 OS 录屏（视频层）能拦 ──
console.log('--- HDCP DRM vs OS 录屏 ---');
var hdcpRes = simulateBattle([findTech('hdcp-drm')], 'os-recording');
assert(hdcpRes.results[0].outcome === 'blocked', 'HDCP 能拦住 OS 级录屏（视频层）');
var hdcpVsShot = simulateBattle([findTech('hdcp-drm')], 'os-screenshot');
assert(hdcpVsShot.results[0].outcome === 'blocked', 'HDCP 对 OS 截图也拦（视频区变黑屏）');

// ── DevTools 检测 vs DevTools 保存 ──
console.log('--- DevTools 检测 vs DevTools 保存 ---');
var dtRes = simulateBattle([findTech('devtools-detect')], 'devtools-save');
assert(dtRes.results[0].outcome === 'blocked', 'DevTools 检测能拦 DevTools 保存');

// ── generateWatermarkToken ──
console.log('--- generateWatermarkToken ---');
var t1 = generateWatermarkToken('Mozilla/5.0 Chrome', 1234567890);
assert(typeof t1 === 'string' && t1.length === 8, 'token 长度为 8: ' + t1);
assert(/^[0-9a-f]{8}$/.test(t1), 'token 为 8 位十六进制: ' + t1);

var t2 = generateWatermarkToken('Mozilla/5.0 Chrome', 1234567890);
assert(t1 === t2, '相同输入相同输出');

var t3 = generateWatermarkToken('Mozilla/5.0 Chrome', 9876543210);
assert(t1 !== t3, '不同 seed 得不同 token: ' + t1 + ' vs ' + t3);

var t4 = generateWatermarkToken('Firefox/120', 1234567890);
assert(t1 !== t4, '不同 UA 得不同 token');

// ── REAL_WORLD_CASES ──
console.log('--- REAL_WORLD_CASES 数据完整性 ---');
assert(Array.isArray(REAL_WORLD_CASES) && REAL_WORLD_CASES.length >= 6, '至少 6 个案例: ' + REAL_WORLD_CASES.length);
for (var c = 0; c < REAL_WORLD_CASES.length; c++) {
  var caseObj = REAL_WORLD_CASES[c];
  assert(!!caseObj.name && Array.isArray(caseObj.tags) && !!caseObj.note,
    caseObj.name + ' 有 name/tags/note');
  assert(caseObj.tags.length > 0, caseObj.name + ' 至少 1 个 tag');
}

// ── pickRandomTip 可预测性 ──
console.log('--- pickRandomTip ---');
assert(Array.isArray(RANDOM_TIPS) && RANDOM_TIPS.length >= 8, 'RANDOM_TIPS 至少 8 条: ' + RANDOM_TIPS.length);
var tip0 = pickRandomTip(0);
assert(tip0 === RANDOM_TIPS[0], 'random=0 返回第 1 条');
var tipEnd = pickRandomTip(0.9999);
assert(tipEnd === RANDOM_TIPS[RANDOM_TIPS.length - 1], 'random≈1 返回最后 1 条');
var midIdx = Math.floor(0.5 * RANDOM_TIPS.length);
var tipMid = pickRandomTip(0.5);
assert(tipMid === RANDOM_TIPS[midIdx], 'random=0.5 返回预期中段项');
var tipDefault = pickRandomTip();
assert(typeof tipDefault === 'string' && tipDefault.length > 0, '不传参也能返回一条 tip');

console.log('\n📊 结果: ' + passed + ' 通过, ' + failed + ' 失败\n');
process.exit(failed > 0 ? 1 : 0);
