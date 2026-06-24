/**
 * bayes-update.test.js — 贝叶斯改主意计算器 · 核心逻辑测试
 * 运行：node numfeel-site/pages/bayes-update/bayes-update.test.js
 */

var L = require('./logic.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
}

function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { console.log('✅ ' + msg + ' (actual=' + actual.toFixed(6) + ')'); passed++; }
  else { console.error('❌ ' + msg + ' expected=' + expected + ' actual=' + actual); failed++; }
}

// ─────────────────────────────────────────────────────────
// 1. posterior 基础正确性
// ─────────────────────────────────────────────────────────
console.log('\n── 1. 贝叶斯后验公式 ──');

// 经典体检阳性：P(A)=0.001, P(B|A)=0.99, P(B|¬A)=0.01
// 后验 ≈ 0.99*0.001 / (0.99*0.001 + 0.01*0.999) ≈ 0.0902
assertClose(L.posterior(0.001, 0.99, 0.01), 0.0902, 0.001,
  '罕见病阳性 0.1% × 99%/1% → 后验 ~9%');

// 出轨场景：P(A)=0.05, P(B|A)=0.80, P(B|¬A)=0.20
// 后验 = 0.04 / (0.04 + 0.19) ≈ 0.1739
assertClose(L.posterior(0.05, 0.80, 0.20), 0.1739, 0.001,
  '出轨 5% × 80%/20% → 后验 ~17%');

// 完全确定真：P(A)=1
assertClose(L.posterior(1, 0.5, 0.9), 1, 1e-9,
  '先验 100% 不会被任何证据动摇');

// 完全确定假：P(A)=0
assertClose(L.posterior(0, 0.99, 0.5), 0, 1e-9,
  '先验 0% 不会被任何证据动摇');

// 证据中性（命中率 == 误报率），后验 == 先验
assertClose(L.posterior(0.3, 0.5, 0.5), 0.3, 1e-9,
  '命中率 == 误报率时，证据不带信息，后验 = 先验');

// ─────────────────────────────────────────────────────────
// 2. posterior 边界
// ─────────────────────────────────────────────────────────
console.log('\n── 2. 边界条件 ──');

assert(L.posterior(0.5, 0, 0) === 0, '命中率与误报率都为 0 时返回 0 而非 NaN');
assert(L.posterior(0.5, 1, 1) > 0 && L.posterior(0.5, 1, 1) < 1,
  '命中率与误报率都为 1 时仍能返回有效概率');

var p1 = L.posterior(0.5, 1, 0);
assertClose(p1, 1, 1e-9, '完美证据（100%命中、0%误报）能把 50% 推到 100%');

var p2 = L.posterior(0.5, 0, 1);
assertClose(p2, 0, 1e-9, '反向完美证据能把 50% 推到 0%');

// ─────────────────────────────────────────────────────────
// 3. 反向证据：找钥匙场景
// ─────────────────────────────────────────────────────────
console.log('\n── 3. 反向证据 ──');

// 钥匙：先验 80%、命中率 5%（在客厅时翻三遍没找到的概率很低）、
// 误报率 95%（不在客厅时翻三遍没找到几乎必然）。
// 后验应当显著低于 80%。
var pKey = L.posterior(0.80, 0.05, 0.95);
assert(pKey < 0.30,
  '钥匙：翻 3 遍没找到，后验从 80% 降到 ' + (pKey * 100).toFixed(1) + '%（应 < 30%）');

// ─────────────────────────────────────────────────────────
// 4. buildSandbox 100 万人沙盘
// ─────────────────────────────────────────────────────────
console.log('\n── 4. 100 万人沙盘 ──');

var box = L.buildSandbox(0.001, 0.99, 0.01);
assert(box.total === 1000000, '默认样本总数 100 万');
assert(box.trueCount + box.falseCount === box.total, '真假人数之和守恒');
assertClose(box.trueCount, 1000, 0, '0.1% × 100 万 = 1000');
assertClose(box.falseCount, 999000, 0, '剩余 99.9 万');
assertClose(box.truePositive, 990, 0, '真患病 1000 × 99% = 990');
assertClose(box.falsePositive, 9990, 0, '假阳 999000 × 1% = 9990');
assert(box.evidencePositive === box.truePositive + box.falsePositive,
  '阳性总数 = 真阳 + 假阳');
assertClose(box.posterior, 990 / 10980, 1e-9,
  '沙盘后验与公式一致：990 / 10980 ≈ 9.02%');

var box2 = L.buildSandbox(0.5, 0.5, 0.5, 100);
assert(box2.total === 100, '自定义总数生效');

// ─────────────────────────────────────────────────────────
// 5. rateGuess 直觉评级
// ─────────────────────────────────────────────────────────
console.log('\n── 5. 直觉评级 ──');

assert(L.rateGuess(9, 10).level === 'spot-on', '差 1 个点 → spot-on');
assert(L.rateGuess(9, 9).level === 'spot-on', '相等 → spot-on');
assert(L.rateGuess(9, 20).level === 'close', '差 11 个点 → close');
assert(L.rateGuess(9, 35).level === 'off', '差 26 个点 → off');
assert(L.rateGuess(9, 90).level === 'way-off', '差 81 个点 → way-off');

var r = L.rateGuess(9, 90);
assertClose(r.gap, 81, 1e-9, '差距计算正确');

// ─────────────────────────────────────────────────────────
// 6. 格式化
// ─────────────────────────────────────────────────────────
console.log('\n── 6. 格式化 ──');

assert(L.formatPct(0.0902, 1) === '9.0%', 'formatPct(0.0902, 1) 输出 9.0%');
assert(L.formatPct(0.5) === '50.0%', 'formatPct 默认 1 位小数');
assert(L.formatCount(1000) === '1,000', '千位千分号');
assert(L.formatCount(10000) === '1.0万', '万位');
assert(L.formatCount(999000).indexOf('万') > -1, '99.9 万带"万"');
assert(L.formatCount(120000000).indexOf('亿') > -1, '过亿带"亿"');

// ─────────────────────────────────────────────────────────
// 7. 预设场景完整性
// ─────────────────────────────────────────────────────────
console.log('\n── 7. 预设场景 ──');

assert(L.PRESETS.length >= 4, '至少 4 个预设场景');

L.PRESETS.forEach(function (p) {
  assert(p.id && p.title && p.subject && p.evidence && p.twist,
    '场景 ' + p.id + ' 字段齐全');
  assert(p.prior >= 0 && p.prior <= 1, '场景 ' + p.id + ' 先验在 [0,1]');
  assert(p.likelihood >= 0 && p.likelihood <= 1, '场景 ' + p.id + ' 命中率在 [0,1]');
  assert(p.falseRate >= 0 && p.falseRate <= 1, '场景 ' + p.id + ' 误报率在 [0,1]');
});

// 每个预设都能算出合理的后验
L.PRESETS.forEach(function (p) {
  var post = L.posterior(p.prior, p.likelihood, p.falseRate);
  assert(post >= 0 && post <= 1, '场景 ' + p.id + ' 后验在 [0,1]：' + (post * 100).toFixed(1) + '%');
});

// 体检场景反直觉性：后验远小于命中率
var cancer = L.PRESETS.filter(function (p) { return p.id === 'cancer-screening'; })[0];
var cancerPost = L.posterior(cancer.prior, cancer.likelihood, cancer.falseRate);
assert(cancerPost < 0.15,
  '体检阳性的后验 < 15%（实际 ' + (cancerPost * 100).toFixed(1) + '%），远小于 99% 命中率，体现反直觉');

// ─────────────────────────────────────────────────────────
// 结尾
// ─────────────────────────────────────────────────────────
console.log('\n────────────────────────────');
console.log('通过 ' + passed + ' 个，失败 ' + failed + ' 个');
console.log('────────────────────────────');

if (failed > 0) process.exit(1);
