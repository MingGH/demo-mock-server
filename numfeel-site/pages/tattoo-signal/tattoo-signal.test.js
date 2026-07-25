/**
 * tattoo-signal.test.js - 纹身与犯罪数据故事 · 核心逻辑测试
 * 运行：node numfeel-site/pages/tattoo-signal/tattoo-signal.test.js
 */

var L = require('./logic.js');
var D = require('./data.js');

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
// 1. posterior 贝叶斯后验：P(罪犯|纹身)
// ─────────────────────────────────────────────────────────
console.log('\n── 1. 贝叶斯后验 P(罪犯|纹身) ──');

// 默认参数：先验 1% × 罪犯纹身率 52% × 普通人纹身率 32%
// = 0.52*0.01 / (0.52*0.01 + 0.32*0.99) = 0.0052/0.322 ≈ 0.01615
assertClose(L.posterior(0.01, 0.52, 0.32), 0.01615, 0.0005,
  '默认参数：纹身者真正犯罪概率约 1.6%');

// 完美证据：50% 先验 + 100% 命中 + 0% 误报 -> 100%
assertClose(L.posterior(0.5, 1, 0), 1, 1e-9,
  '完美证据能把 50% 推到 100%');

// 反向完美证据：50% + 0% 命中 + 100% 误报 -> 0%
assertClose(L.posterior(0.5, 0, 1), 0, 1e-9,
  '反向完美证据能把 50% 推到 0%');

// 中性证据（命中率 == 误报率）-> 后验 == 先验
assertClose(L.posterior(0.3, 0.5, 0.5), 0.3, 1e-9,
  '命中率 == 误报率时，证据不带信息，后验 = 先验');

// 先验边界
assertClose(L.posterior(0, 0.99, 0.5), 0, 1e-9, '先验 0% 不被任何证据动摇');
assertClose(L.posterior(1, 0.5, 0.9), 1, 1e-9, '先验 100% 不被任何证据动摇');

// 分母为 0 时不返回 NaN
assert(L.posterior(0.5, 0, 0) === 0, '命中率与误报率都为 0 时返回 0 而非 NaN');

// 反直觉核心：即便罪犯纹身率高达 83%（成都未管所），普通人纹身率 32%，
// 先验犯罪率 1%，纹身者犯罪概率仍很低
var harsh = L.posterior(0.01, 0.83, 0.32);
assert(harsh < 0.03,
  '即便罪犯纹身率 83%：纹身者犯罪概率仍 < 3%（实际 ' + (harsh * 100).toFixed(2) + '%）');

// ─────────────────────────────────────────────────────────
// 2. buildSandbox 10 万人沙盘
// ─────────────────────────────────────────────────────────
console.log('\n── 2. 10 万人沙盘 ──');

var box = L.buildSandbox(0.01, 0.52, 0.32);
assert(box.total === 100000, '默认样本总数 10 万');
assert(box.criminal + box.innocent === box.total, '罪犯+良民 守恒');
assert(box.criminal === 1000, '1% × 10万 = 1000 名罪犯');
assert(box.innocent === 99000, '剩余 9.9 万良民');
assert(box.tattooedCriminal === 520, '罪犯中纹身 1000×52% = 520');
assert(box.tattooedInnocent === 31680, '良民中纹身 99000×32% = 31680');
assert(box.tattooedTotal === 32200, '纹身者总数 = 520 + 31680');
assertClose(box.posterior, 520 / 32200, 1e-9,
  '沙盘后验 = 520/32200 ≈ 1.61%');
assertClose(box.posterior, L.posterior(0.01, 0.52, 0.32), 1e-9,
  '沙盘后验与公式一致');

var box2 = L.buildSandbox(0.5, 0.5, 0.5, 100);
assert(box2.total === 100, '自定义总数生效');

// ─────────────────────────────────────────────────────────
// 3. 数据完整性：所有 sourceId 可查
// ─────────────────────────────────────────────────────────
console.log('\n── 3. 数据来源完整性 ──');

var srcErrors = L.validateSources();
assert(srcErrors.length === 0, '所有数据点的 sourceId 都能在 SOURCES 找到' +
  (srcErrors.length ? '：' + srcErrors.join('; ') : ''));

assert(D.SOURCES.length >= 10, '至少 10 条来源（实际 ' + D.SOURCES.length + ' 条）');

// 每条来源有必备字段
D.SOURCES.forEach(function (s) {
  assert(s.id && s.title && s.link && s.year && s.type,
    '来源 ' + s.id + ' 字段齐全');
});

// ─────────────────────────────────────────────────────────
// 4. 数值范围校验
// ─────────────────────────────────────────────────────────
console.log('\n── 4. 数值范围 ──');

var rangeErrors = L.validateRanges();
assert(rangeErrors.length === 0, '所有概率在 [0,1]，优势比 >= 1' +
  (rangeErrors.length ? '：' + rangeErrors.join('; ') : ''));

// 关键数据点合理性
assert(D.PRISON_PREVALENCE.length >= 5, '至少 5 条监狱纹身率样本');
assert(D.FEMALE_STRATIFIED.female.arrest >= 1, '女性被捕优势比 >= 1');
assert(D.FEMALE_STRATIFIED.female.arrest < D.FEMALE_STRATIFIED.male.arrest,
  '女性优势比低于男性（符合犯罪性别差异）');

// ─────────────────────────────────────────────────────────
// 5. 数据查询与聚合
// ─────────────────────────────────────────────────────────
console.log('\n── 5. 查询与聚合 ──');

var ye = L.getSource('ye2024');
assert(ye !== null && ye.title === '浅谈文身与犯罪', 'getSource 查到叶勇豪论文');
assert(L.getSource('nonexistent') === null, '查不到的来源返回 null');

// 印度 Khandwa 0.839 是监狱数据最大值
assertClose(L.maxPrisonRate(), 0.839, 1e-9, '监狱纹身率最大值 = 0.839（印度 Khandwa）');

// 监狱均值 ÷ 普通人群 ≈ 1.97 倍
var ratio = L.prisonVsGeneralRatio();
assert(ratio > 1.5 && ratio < 2.5,
  '监狱纹身率均值约为普通人 ' + ratio.toFixed(2) + ' 倍（应在 1.5~2.5）');

// ─────────────────────────────────────────────────────────
// 6. 格式化
// ─────────────────────────────────────────────────────────
console.log('\n── 6. 格式化 ──');

assert(L.formatPct(0.01615, 1) === '1.6%', 'formatPct(0.01615) -> 1.6%');
assert(L.formatPct(0.5) === '50.0%', 'formatPct 默认 1 位小数');
assert(L.formatOdds(2.5) === '×2.50', 'formatOdds(2.5) -> ×2.50');
assert(L.formatUplift(0.245) === '+24.5%', 'formatUplift(0.245) -> +24.5%');
assert(L.formatUplift(1.62) === '+162.0%', 'formatUplift(1.62) -> +162.0%');
assert(L.formatUplift(-0.1) === '-10.0%', 'formatUplift 负值带负号');

// ─────────────────────────────────────────────────────────
// 7. 风险分级
// ─────────────────────────────────────────────────────────
console.log('\n── 7. 风险分级 ──');

assert(L.rateRisk(1.6).level === 'low', '1.6% -> low（极低）');
assert(L.rateRisk(10).level === 'mid', '10% -> mid（不高）');
assert(L.rateRisk(30).level === 'high', '30% -> high（偏高）');
assert(L.rateRisk(60).level === 'vhigh', '60% -> vhigh（很高）');

// 默认贝叶斯结果应落在 low 区间（核心论点：印象有据，个体无据）
var defaultPost = L.posterior(D.BAYES_DEFAULTS.prior, D.BAYES_DEFAULTS.likelihood, D.BAYES_DEFAULTS.falseRate);
assert(L.rateRisk(defaultPost * 100).level === 'low',
  '默认参数算出的纹身者犯罪概率落在「极低」区间：' + (defaultPost * 100).toFixed(2) + '%');

// ─────────────────────────────────────────────────────────
// 8. 立场一致性：数据支持「信号论」而非「因果论」
// ─────────────────────────────────────────────────────────
console.log('\n── 8. 立场一致性 ──');

assert(D.CAUSAL.jennings2014.finding.indexOf('spurious') > -1,
  'Jennings 2014 结论为伪相关，支持「纹身是信号非因果」');
assert(D.META.stance.indexOf('信号而非因果') > -1,
  'META 立场声明包含「信号而非因果」');

// ─────────────────────────────────────────────────────────
// 结尾
// ─────────────────────────────────────────────────────────
console.log('\n────────────────────────────');
console.log('通过 ' + passed + ' 个，失败 ' + failed + ' 个');
console.log('────────────────────────────');

if (failed > 0) process.exit(1);
