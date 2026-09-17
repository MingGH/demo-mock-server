/**
 * brutalism-lab engine 单元测试。Node 直接运行，无测试框架。
 * 运行：node pages/brutalism-lab/engine.test.js
 */
var E = require('./engine.js');

var passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  ok(Math.abs(actual - expected) <= tol, msg + '（实际 ' + actual + '，期望 ' + expected + '±' + tol + '）');
}

// ── hexToRgb ──
ok(E.hexToRgb('#ffd700').r === 255 && E.hexToRgb('#ffd700').g === 215 && E.hexToRgb('#ffd700').b === 0, 'hexToRgb 解析 6 位色');
ok(E.hexToRgb('#fff').r === 255 && E.hexToRgb('#fff').b === 255, 'hexToRgb 解析 3 位色');
ok(E.hexToRgb('ffd700').r === 255, 'hexToRgb 忽略 # 前缀');
ok(E.hexToRgb('nope!') === null && E.hexToRgb(123) === null && E.hexToRgb('') === null, 'hexToRgb 非法输入返回 null');

// ── luminance / contrastRatio / aaLarge ──
assertClose(E.luminance('#ffffff'), 1, 1e-6, '白色亮度为 1');
assertClose(E.luminance('#000000'), 0, 1e-6, '黑色亮度为 0');
assertClose(E.contrastRatio('#000000', '#ffffff'), 21, 0.01, '黑白对比度 21:1');
assertClose(E.contrastRatio('#777777', '#ffffff'), 4.47, 0.05, '中灰对白对比度约 4.47:1');
assertClose(E.contrastRatio('#ffffff', '#000000'), 21, 0.01, '对比度与参数顺序无关');
ok(E.aaLarge(3.0) === true && E.aaLarge(2.9) === false, 'AA 大字阈值 3:1');
ok(E.aaLarge('x') === false, 'aaLarge 非数值返回 false');

// ── contrastText ──
ok(E.contrastText('#ffffff') === '#000000', '白底配黑字');
ok(E.contrastText('#000000') === '#ffffff', '黑底配白字');
ok(E.contrastText('#ffd700') === '#000000', '高亮黄底配黑字');
ok(E.contrastText('xyz!') === '#ffffff', '非法色回退白字');

// ── themeVars（精确键集，替代原恒真断言） ──
var tv = E.themeVars(E.CASES[1]);
var tvKeys = Object.keys(tv).sort();
ok(JSON.stringify(tvKeys) === JSON.stringify(['--case-accent', '--case-bg', '--case-ink', '--case-on-ink']),
  'themeVars 恰好输出 4 个变量：' + tvKeys.join(','));
ok(tv['--case-bg'] === E.CASES[1].bg && tv['--case-ink'] === E.CASES[1].ink && tv['--case-accent'] === E.CASES[1].accent, 'themeVars 值来自配置');
ok(tv['--case-on-ink'] === '#000000' || tv['--case-on-ink'] === '#ffffff', 'on-ink 一定是黑或白');

// ── clamp ──
ok(E.clamp(5, 0, 10) === 5 && E.clamp(-1, 0, 10) === 0 && E.clamp(99, 0, 10) === 10, 'clamp 边界夹取');
ok(E.clamp('abc', 0, 10) === 0, 'clamp 非数值回退下限');

// ── megaLayout ──
var m0 = E.megaLayout(0), m100 = E.megaLayout(100), m70 = E.megaLayout(70);
assertClose(m0.fontSizeVw, 10, 0.01, '字号 0 档 = 10vw');
assertClose(m100.fontSizeVw, 36, 0.01, '字号 100 档 = 36vw');
ok(m0.othersOpacity === 1 && m70.othersOpacity === 1, '≤70 档其他元素不透明');
ok(m100.othersOpacity === 0.12, '100 档其他元素退到最低不透明度');
var m85 = E.megaLayout(85);
ok(m85.othersOpacity > 0.12 && m85.othersOpacity < 1, '85 档其他元素介于中间');
ok(E.megaLayout(120).fontSizeVw === 36 && E.megaLayout(-5).fontSizeVw === 10, 'megaLayout 越界自动夹取');
ok(m70.fontSizeVw < m85.fontSizeVw && m85.fontSizeVw < m100.fontSizeVw, '字号随滑杆单调递增');

// ── marqueeDuration ──
assertClose(E.marqueeDuration(1), 18, 0.001, '1 倍速半程 18s');
assertClose(E.marqueeDuration(2), 9, 0.001, '2 倍速半程 9s');
assertClose(E.marqueeDuration(0.1), 72, 0.001, '低于下限夹取到 0.25 倍速（72s）');
assertClose(E.marqueeDuration(99), 6, 0.001, '高于上限夹取到 3 倍速（6s）');

// ── makeMarquee（无缝循环的关键：前后两半完全相同） ──
ok(E.makeMarquee([], 5).length === 0, '空片段返回空');
var mm1 = E.makeMarquee(['A'], 3, 'X');
ok(mm1.length === 4 && mm1.join('') === 'AXAXAXAX', '奇数轮数强制 +1 取偶（4 轮 × 1 片段）');
var mm2 = E.makeMarquee(['戴上', '世界'], 6, ' · ');
var half = mm2.length / 2;
ok(mm2.slice(0, half).join('') === mm2.slice(half).join(''), '内容前后两半完全相同（无缝前提）');
var mm3 = E.makeMarquee(['A', 'B'], 0, '-');
ok(mm3.length === 4 && mm3.join('') === 'A-B-A-B-', 'repeats<=0 至少跑 2 轮（2 轮 × 2 片段）');
var mm4 = E.makeMarquee(['A'], 500, '');
ok(mm4.length === 64 && mm4.slice(0, 32).join('') === mm4.slice(32).join(''), '重复轮数封顶 64 且两半相同');

// ── defaultState ──
var ds = E.defaultState('mega');
ok(ds.scale === 35, 'mega 默认字号 35');
ok(E.defaultState('mono').grid === true && E.defaultState('mono').hard === true, 'mono 默认网格+硬边全开');
ok(E.defaultState('clash').pair === 0, 'clash 默认第一组配色');
ok(E.defaultState('glitch').noise === 1, 'glitch 默认全噪声');
ok(E.defaultState('marquee').speed === 1 && E.defaultState('marquee').paused === false, 'marquee 默认 1 倍速播放');
ok(E.defaultState('chaos').scattered === false, 'chaos 默认未打散');
ok(E.defaultState('nope') === null, '未知案例返回 null');

// ── resetCaseState（不修改入参，其余案例状态保留） ──
var states = {
  mega: { scale: 90 }, mono: { grid: false, hard: false },
  chaos: { scattered: true }, clash: { pair: 2 },
  glitch: { noise: 0 }, marquee: { speed: 3, paused: true }
};
var snapshot = JSON.stringify(states);
var next = E.resetCaseState(states, 'mega');
ok(JSON.stringify(states) === snapshot, 'resetCaseState 不修改入参');
ok(next.mega.scale === 35, '被重置案例回到默认');
ok(next.mono.grid === false && next.clash.pair === 2 && next.marquee.speed === 3, '其余案例状态原样保留');

// ── purchaseFeedback ──
var fb1 = E.purchaseFeedback('cart', 0);
ok(fb1.count === 1 && /已加入购物车/.test(fb1.message) && /模拟/.test(fb1.message), '加购计数+1 且注明模拟');
var fb2 = E.purchaseFeedback('cart', 2);
ok(fb2.count === 3 && /共 3 件/.test(fb2.message), '加购消息带最新件数');
var fb3 = E.purchaseFeedback('buy', 5);
ok(fb3.count === 5 && /不会产生真实订单/.test(fb3.message), '购买不改变计数且注明模拟');
ok(E.purchaseFeedback('other', 1) === null, '未知 kind 返回 null');
ok(E.purchaseFeedback('cart', -3).count === 1, '负数计数从 0 起算');

// ── seededRandom（单一生成器多样本，替代原同种子重复断言） ──
var r1 = E.seededRandom(42), r2 = E.seededRandom(42);
ok(r1() === r2(), '同种子首值可复现');
ok(r1() === r2(), '同种子序列可复现');
var rnd = E.seededRandom(7);
var sum = 0, n = 1000, allIn = true;
for (var i = 0; i < n; i++) {
  var v = rnd();
  if (v < 0 || v >= 1) allIn = false;
  sum += v;
}
ok(allIn, '1000 个样本均在 [0,1)');
var mean = sum / n;
ok(mean > 0.3 && mean < 0.7, '样本均值合理（' + mean.toFixed(3) + '）');

// ── buildJitterOffsets ──
var j1 = E.buildJitterOffsets(10, 12, 99);
var j2 = E.buildJitterOffsets(10, 12, 99);
ok(j1.length === 10, '生成指定数量偏移');
ok(j1.every(function (o, idx) { return o.x === j2[idx].x && o.y === j2[idx].y; }), '同种子打散偏移可复现');
var j3 = E.buildJitterOffsets(200, 12, 5);
ok(j3.every(function (o) { return Math.abs(o.x) <= 12 && Math.abs(o.y) <= 6 && Math.abs(o.rot) <= 10; }),
  'x/y/rot 均不超振幅（200 样本）');
ok(E.buildJitterOffsets(0, 12, 1).length === 0, '数量 0 返回空');

// ── navIndexes ──
ok(E.navIndexes(0, 6).next === 1 && E.navIndexes(0, 6).prev === 5, '导航循环 next/prev');
ok(E.navIndexes(5, 6).next === 0, '末尾 next 回到 0');
ok(E.navIndexes(-1, 6).prev === 4, '越界索引归一化');

// ── formatPrice ──
ok(E.formatPrice(1299, '¥') === '¥1,299', '千位分隔');
ok(E.formatPrice(1000000, '$') === '$1,000,000', '百万级格式');
ok(E.formatPrice('abc', '¥') === '¥0', '非法数字兜底为 0');

// ── COLOR_PAIRS ──
ok(E.COLOR_PAIRS.length === 4, '撞色案例共 4 组配色');
var names = E.COLOR_PAIRS.map(function (p) { return p.name; });
ok(new Set(names).size === 4, '配色名称不重复');
var ratios = E.COLOR_PAIRS.map(function (p) { return E.contrastRatio(p.bg, p.fg); });
ok(ratios.every(function (r) { return r >= 1 && r <= 21; }), '每组对比度都在 [1,21]');
ok(ratios.some(function (r) { return E.aaLarge(r); }), '至少一组达到 AA 大字标准');
ok(E.COLOR_PAIRS.every(function (p) { return E.hexToRgb(p.bg) && E.hexToRgb(p.fg); }), '每组颜色均为合法十六进制');

// ── CASES 配置完整性 + 文案卫生 ──
ok(E.CASES.length === 6, '正好 6 种手法');
var ids = E.CASES.map(function (c) { return c.id; });
ok(new Set(ids).size === 6, '案例 id 不重复');
E.CASES.forEach(function (c) {
  ok(c.id && c.name && c.accent && c.bg && c.ink && c.keyPhrase && c.tagline, '案例 ' + c.id + ' 基础字段齐全');
  ok(c.blurb && c.principle && c.principle.history && c.principle.psyche, '案例 ' + c.id + ' 含简介与设计说明');
  ok(E.defaultState(c.id) !== null, '案例 ' + c.id + ' 有默认交互状态');
});
var banned = ['爆头', '砸脸', '晃到眼睛疼', '更狠', '怼脸', '打脸'];
var allCopy = E.CASES.map(function (c) {
  return c.name + c.tagline + c.blurb + c.principle.history + c.principle.psyche;
}).join('') + E.PRODUCT.brand + E.PRODUCT.name + E.PRODUCT.tagline;
var hit = banned.filter(function (w) { return allCopy.indexOf(w) !== -1; });
ok(hit.length === 0, '文案不含夸张修辞词（命中：' + (hit.join(',') || '无') + '）');

// ── PRODUCT ──
ok(E.PRODUCT.price === 1299 && E.PRODUCT.desc.length === 4 && E.PRODUCT.cta.length === 2, '产品载体数据完整');

console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);