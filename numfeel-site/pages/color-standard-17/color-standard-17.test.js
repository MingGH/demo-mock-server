/**
 * color-standard-17.test.js - 17 人色觉标准 · 核心逻辑测试
 * 运行：node numfeel-site/pages/color-standard-17/color-standard-17.test.js
 */

var L = require('./color-standard-17-logic.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
}

function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { console.log('✅ ' + msg + ' (actual=' + actual + ')'); passed++; }
  else { console.error('❌ ' + msg + ' expected=' + expected + ' actual=' + actual); failed++; }
}

// ─────────────────────────────────────────────────────────
// 1. COLOR_PAIRS 数据完整性
// ─────────────────────────────────────────────────────────
console.log('\n── 1. COLOR_PAIRS 数据完整性 ──');

assert(L.COLOR_PAIRS.length === 8, 'COLOR_PAIRS 共 8 组');
L.COLOR_PAIRS.forEach(function (p) {
  assert(p.id && p.color1 && p.color2 && typeof p.deltaE === 'number' && (p.answer === 'same' || p.answer === 'diff'),
    '色对 #' + p.id + ' 字段齐全');
  assert(p.deltaE >= 0, '色对 #' + p.id + ' deltaE >= 0 (实际 ' + p.deltaE + ')');
  assert(/^#[0-9A-Fa-f]{6}$/.test(p.color1) && /^#[0-9A-Fa-f]{6}$/.test(p.color2),
    '色对 #' + p.id + ' 颜色为合法 hex');
});

// 答案与 deltaE 一致性：deltaE=0 必须 'same'，deltaE>=阈值 必须 'diff'
L.COLOR_PAIRS.forEach(function (p) {
  if (p.deltaE === 0) {
    assert(p.answer === 'same', '色对 #' + p.id + ' deltaE=0 -> 答案 same');
  } else if (p.deltaE >= L.DELTA_E_THRESHOLD) {
    assert(p.answer === 'diff', '色对 #' + p.id + ' deltaE=' + p.deltaE + ' -> 答案 diff');
  }
});

// ─────────────────────────────────────────────────────────
// 2. 色差判断函数
// ─────────────────────────────────────────────────────────
console.log('\n── 2. 色差判断 ──');

assert(L.judgeColorDifference(0) === 'same', 'deltaE=0 -> same');
assert(L.judgeColorDifference(0.5) === 'same', 'deltaE=0.5 -> same');
assert(L.judgeColorDifference(1.0) === 'diff', 'deltaE=1.0 (阈值) -> diff');
assert(L.judgeColorDifference(1.5) === 'diff', 'deltaE=1.5 -> diff');
assert(L.judgeColorDifference(5) === 'diff', 'deltaE=5 -> diff');

// ─────────────────────────────────────────────────────────
// 3. calculateGrayBias：纯灰输入偏差为 0
// ─────────────────────────────────────────────────────────
console.log('\n── 3. calculateGrayBias 纯灰 ──');

var pure = L.calculateGrayBias(0, 0);
assertClose(pure.hueBias, 0, 1e-9, '纯灰 hueBias=0');
assertClose(pure.satBias, 0, 1e-9, '纯灰 satBias=0');
assertClose(pure.magnitude, 0, 1e-9, '纯灰 magnitude=0');
assert(pure.direction === 'pure', '纯灰 direction=pure');
assert(typeof pure.explanation === 'string' && pure.explanation.length > 0,
  '纯灰有非空 explanation');

// ─────────────────────────────────────────────────────────
// 4. calculateGrayBias：已知偏移返回正确方向
// ─────────────────────────────────────────────────────────
console.log('\n── 4. calculateGrayBias 偏移方向 ──');

var warm = L.calculateGrayBias(10, 5);
assert(warm.direction === 'warm-red', '+10° 偏移 -> warm-red 方向');
assert(warm.magnitude > 0, '暖偏移 magnitude > 0');
assert(/暖/.test(warm.explanation), '暖偏移 explanation 含「暖」');

var cool = L.calculateGrayBias(-10, 5);
assert(cool.direction === 'cool-blue', '-10° 偏移 -> cool-blue 方向');
assert(/冷/.test(cool.explanation), '冷偏移 explanation 含「冷」');

var slightWarm = L.calculateGrayBias(4, 1.5);
assert(slightWarm.direction === 'warm', '+4° 小偏移 -> warm');

var slightCool = L.calculateGrayBias(-4, 1.5);
assert(slightCool.direction === 'cool', '-4° 小偏移 -> cool');

// magnitude 符合勾股
assertClose(L.calculateGrayBias(3, 4).magnitude, 5, 1e-9, '(3,4) 偏移 magnitude=5');

// ─────────────────────────────────────────────────────────
// 5. estimateLensYellowing 年龄差异
// ─────────────────────────────────────────────────────────
console.log('\n── 5. estimateLensYellowing ──');

var y20 = L.estimateLensYellowing(20);
var y40 = L.estimateLensYellowing(40);
var y70 = L.estimateLensYellowing(70);
assertClose(y20, 0, 1e-9, '20 岁黄化 ~0%');
assert(y40 > y20, '40 岁黄化高于 20 岁');
assert(y70 > y40, '70 岁黄化高于 40 岁');
assert(y70 >= 15, '70 岁黄化显著 (>=15%，实际 ' + y70 + '%)');

// 边界：超出范围被钳制
assertClose(L.estimateLensYellowing(10), 0, 1e-9, '低于 20 岁钳到 20 -> 黄化 0%');
assertClose(L.estimateLensYellowing(100), L.estimateLensYellowing(80), 1e-9,
  '高于 80 岁钳到 80');

// ─────────────────────────────────────────────────────────
// 6. 得分计算：全对 100% / 全错 0%
// ─────────────────────────────────────────────────────────
console.log('\n── 6. 得分计算 ──');

var allCorrect = L.COLOR_PAIRS.map(function (p) { return p.answer; });
var allWrong = L.COLOR_PAIRS.map(function (p) { return p.answer === 'same' ? 'diff' : 'same'; });
var halfCorrect = L.COLOR_PAIRS.map(function (p, i) { return i < 4 ? p.answer : (p.answer === 'same' ? 'diff' : 'same'); });

var s1 = L.calculateScore(allCorrect);
assert(s1.correct === 8 && s1.percent === 100, '全对 -> 8/8 = 100%');
assert(s1.wrongIds.length === 0, '全对 wrongIds 为空');

var s2 = L.calculateScore(allWrong);
assert(s2.correct === 0 && s2.percent === 0, '全错 -> 0/8 = 0%');
assert(s2.wrongIds.length === 8, '全错 wrongIds 长度 8');

var s3 = L.calculateScore(halfCorrect);
assert(s3.correct === 4 && s3.percent === 50, '对一半 -> 4/8 = 50%');
assert(s3.wrongIds.length === 4, '对一半 wrongIds 长度 4');

// 评语函数
assert(typeof L.scoreComment(s1) === 'string', 'scoreComment 返回字符串');
assert(L.scoreComment(s1).length > 0, '满分评语非空');
assert(L.scoreComment(s2).length > 0, '零分评语非空');

// ─────────────────────────────────────────────────────────
// 7. CIE1931_CMF 数据点数 >= 15
// ─────────────────────────────────────────────────────────
console.log('\n── 7. CIE1931_CMF ──');

assert(L.CIE1931_CMF.length >= 15, 'CMF 数据点 >= 15 (实际 ' + L.CIE1931_CMF.length + ')');
L.CIE1931_CMF.forEach(function (d) {
  assert(d.wavelength >= 380 && d.wavelength <= 780, '波长 ' + d.wavelength + ' 在 380-780nm');
  assert(typeof d.r === 'number' && d.r >= 0, '波长 ' + d.wavelength + ' r >= 0');
  assert(typeof d.g === 'number' && d.g >= 0, '波长 ' + d.wavelength + ' g >= 0');
  assert(typeof d.b === 'number' && d.b >= 0, '波长 ' + d.wavelength + ' b >= 0');
});

// 短波长（蓝紫光）b 通道值高，长波长（红光）r 通道值高
var shortWave = L.CIE1931_CMF.filter(function (d) { return d.wavelength <= 460; });
var longWave = L.CIE1931_CMF.filter(function (d) { return d.wavelength >= 620; });
var avgBlueShort = avg(shortWave.map(function (d) { return d.b; }));
var avgRedLong = avg(longWave.map(function (d) { return d.r; }));
assert(avgBlueShort > 0.5, '短波长平均 b 值 > 0.5（实际 ' + avgBlueShort.toFixed(3) + '）');
assert(avgRedLong > 0.05, '长波长平均 r 值 > 0.05（实际 ' + avgRedLong.toFixed(3) + '）');

function avg(arr) { return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; }

// ─────────────────────────────────────────────────────────
// 8. OBSERVER_VARIABILITY 短波段 CV 高于长波段平均
// ─────────────────────────────────────────────────────────
console.log('\n── 8. OBSERVER_VARIABILITY ──');

assert(L.OBSERVER_VARIABILITY.length >= 5, '变异数据 >= 5 个点');
L.OBSERVER_VARIABILITY.forEach(function (d) {
  assert(typeof d.cv_percent === 'number' && d.cv_percent >= 0,
    '波长 ' + d.wavelength + 'nm CV >= 0 (实际 ' + d.cv_percent + '%)');
});

var shortCV = L.OBSERVER_VARIABILITY.filter(function (d) { return d.wavelength <= 460; });
var longCV = L.OBSERVER_VARIABILITY.filter(function (d) { return d.wavelength >= 600; });
var avgShortCV = avg(shortCV.map(function (d) { return d.cv_percent; }));
var avgLongCV = avg(longCV.map(function (d) { return d.cv_percent; }));
assert(avgShortCV > avgLongCV,
  '短波段平均 CV (' + avgShortCV.toFixed(1) + '%) 高于长波段 (' + avgLongCV.toFixed(1) + '%)');
assert(avgShortCV >= 20, '短波段平均 CV >= 20%（实际 ' + avgShortCV.toFixed(1) + '%）');

// 560nm 附近（黄绿）变异最小
var minCVEntry = L.OBSERVER_VARIABILITY.reduce(function (a, b) {
  return a.cv_percent < b.cv_percent ? a : b;
}, L.OBSERVER_VARIABILITY[0]);
assert(minCVEntry.wavelength >= 540 && minCVEntry.wavelength <= 580,
  'CV 最小值出现在 540-580nm（黄绿区），实际 ' + minCVEntry.wavelength + 'nm');

// ─────────────────────────────────────────────────────────
// 9. TIMELINE 至少 5 个事件且按年份排序
// ─────────────────────────────────────────────────────────
console.log('\n── 9. TIMELINE ──');

assert(L.TIMELINE.length >= 5, 'TIMELINE >= 5 个事件 (实际 ' + L.TIMELINE.length + ')');
L.TIMELINE.forEach(function (t) {
  assert(typeof t.year === 'number' && t.year >= 1900 && t.year <= 2030,
    'TIMELINE 事件年份 ' + t.year + ' 合理');
  assert(typeof t.event === 'string' && t.event.length > 0, 'TIMELINE 事件文本非空');
});

// 非递减排序
var sorted = true;
for (var i = 1; i < L.TIMELINE.length; i++) {
  if (L.TIMELINE[i].year < L.TIMELINE[i - 1].year) { sorted = false; break; }
}
assert(sorted, 'TIMELINE 按年份非递减排序');

// 关键事件存在
var has1931 = L.TIMELINE.some(function (t) { return t.year === 1931 && /CIE/.test(t.event); });
var has1996 = L.TIMELINE.some(function (t) { return t.year === 1996 && /sRGB/.test(t.event); });
assert(has1931, 'TIMELINE 包含 1931 CIE 标准发布事件');
assert(has1996, 'TIMELINE 包含 1996 sRGB 事件');

// ─────────────────────────────────────────────────────────
// 10. 分享文案生成函数返回包含得分的字符串
// ─────────────────────────────────────────────────────────
console.log('\n── 10. 分享文案 ──');

var shareText = L.generateShareText(6, 8, 2.5);
assert(typeof shareText === 'string', '分享文案是字符串');
assert(shareText.indexOf('6/8') > -1, '分享文案包含得分 6/8');
assert(shareText.indexOf('2.5') > -1, '分享文案包含灰色偏差 2.5');
assert(shareText.indexOf(L.SHARE_URL) > -1, '分享文案包含链接');

var shareText2 = L.generateShareText(8, 8, 0);
assert(shareText2.indexOf('8/8') > -1, '满分文案包含 8/8');
assert(shareText2.indexOf('0.0') > -1, '无偏差文案包含 0.0');

// ─────────────────────────────────────────────────────────
// 附加：GRAY_SCENES / buildGrayReport / mapScoreToCV
// ─────────────────────────────────────────────────────────
console.log('\n── 附加：场景与综合报告 ──');

assert(L.GRAY_SCENES.length === 3, '提供 3 个背景场景');
L.GRAY_SCENES.forEach(function (s) {
  assert(s.id && s.name && s.background && s.hint, '场景 ' + s.id + ' 字段齐全');
});

var bias = L.calculateGrayBias(3, 1.5);
var report = L.buildGrayReport(bias, 30);
assert(typeof report.yellowing === 'number', 'buildGrayReport 返回 yellowing 数值');
assert(typeof report.ageEffect === 'string', 'buildGrayReport 返回 ageEffect 文本');
assert(typeof report.summary === 'string', 'buildGrayReport 返回 summary 文本');
assert(report.yellowing >= 0, '30 岁黄化 >= 0');

assert(L.mapScoreToCV(100) < L.mapScoreToCV(50), '高分对应低 CV（在 17 人中更稳定）');
assert(L.mapScoreToCV(100) >= 3, '满分对应 CV 仍 >= 3（仍受限于生理离散度）');

// ─────────────────────────────────────────────────────────
// 结尾
// ─────────────────────────────────────────────────────────
console.log('\n────────────────────────────');
console.log('通过 ' + passed + ' 个，失败 ' + failed + ' 个');
console.log('────────────────────────────');

if (failed > 0) process.exit(1);
