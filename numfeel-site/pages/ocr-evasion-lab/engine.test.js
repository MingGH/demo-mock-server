/**
 * OCR 规避实验室 —— engine.js 单元测试
 * 运行：node pages/ocr-evasion-lab/engine.test.js
 */

const E = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + '（实际 ' + actual + '，期望 ' + expected + '±' + tol + '）');
}

/** 取某像素的灰度值 */
function px(img, x, y) {
  return img.data[(y * img.width + x) * 4];
}

/** 把某像素设成指定灰度（RGB 三通道一起改） */
function setPx(img, x, y, v) {
  const p = (y * img.width + x) * 4;
  img.data[p] = v;
  img.data[p + 1] = v;
  img.data[p + 2] = v;
}

// ── createImage / cloneImage ──
{
  const img = E.createImage(4, 3, 200);
  assert(img.width === 4 && img.height === 3, 'createImage 尺寸正确');
  assert(img.data.length === 4 * 3 * 4, 'createImage 数据长度为 w*h*4');
  assert(px(img, 0, 0) === 200, 'createImage 填充指定灰度');
  assert(img.data[3] === 255, 'createImage alpha 不透明');

  const copy = E.cloneImage(img);
  copy.data[0] = 10;
  assert(px(img, 0, 0) === 200, 'cloneImage 是深拷贝，改副本不影响原图');
}

// ── mulberry32 ──
{
  const a = E.mulberry32(42);
  const b = E.mulberry32(42);
  const c = E.mulberry32(43);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  const seqC = [c(), c(), c(), c()];
  assert(seqA.every((v, i) => v === seqB[i]), '同种子产出同一串随机数');
  assert(seqA.some((v, i) => v !== seqC[i]), '不同种子产出不同随机数');
  assert(
    seqA.every((v) => v >= 0 && v < 1),
    '随机数落在 [0,1) 区间'
  );
}

// ── toGrayscale ──
{
  const img = E.createImage(2, 1, 0);
  img.data[0] = 255;
  img.data[1] = 0;
  img.data[2] = 0;
  const gray = E.toGrayscale(img);
  const expect = 0.299 * 255;
  assertClose(px(gray, 0, 0), expect, 0.6, 'toGrayscale 按 BT.601 权重计算');
  assert(px(gray, 1, 0) === 0, 'toGrayscale 黑色保持为 0');
}

// ── reduceContrast ──
{
  const img = E.createImage(1, 1, 0);
  const none = E.reduceContrast(img, 0);
  assert(px(none, 0, 0) === 0, 'reduceContrast amount=0 时不做改动');

  const full = E.reduceContrast(img, 1);
  assert(px(full, 0, 0) === 255, 'reduceContrast amount=1 时全部变成背景色');

  const half = E.reduceContrast(img, 0.5);
  assertClose(px(half, 0, 0), 127.5, 0.6, 'reduceContrast amount=0.5 时向背景靠拢一半');
}

// ── blur ──
{
  const img = E.createImage(5, 1, 255);
  img.data[2 * 4] = 0;
  const out = E.blur(img, 1);
  assert(px(img, 2, 0) === 0, 'blur 不修改原图');
  assert(px(out, 2, 0) > 0 && px(out, 2, 0) < 255, 'blur 把孤立黑点向周围平均');
  assert(px(out, 1, 0) < 255, 'blur 把黑色扩散到相邻像素');
  assert(px(out, 0, 0) === 255, 'blur 远处像素不受影响');

  const same = E.blur(img, 0);
  assert(px(same, 2, 0) === 0, 'blur radius=0 时不做改动');
}

// ── addNoise ──
{
  const img = E.createImage(10, 1, 128);
  const out = E.addNoise(img, 50, E.mulberry32(7));
  assert(px(img, 0, 0) === 128, 'addNoise 不修改原图');
  const changed = out.data[0] !== 128 || out.data[4] !== 128;
  assert(changed, 'addNoise 改变了像素值');

  const noNoise = E.addNoise(img, 0, E.mulberry32(7));
  assert(px(noNoise, 0, 0) === 128, 'addNoise amount=0 时不做改动');

  const big = E.addNoise(E.createImage(50, 1, 0), 300, E.mulberry32(1));
  let inRange = true;
  let clamped = false;
  for (let x = 0; x < 50; x++) {
    const v = px(big, x, 0);
    if (v < 0 || v > 255) inRange = false;
    if (v === 0 || v === 255) clamped = true;
  }
  assert(inRange, 'addNoise 输出始终落在 0-255');
  assert(clamped, 'addNoise 超幅噪点被钳制到边界值');
}

// ── waveWarp ──
{
  const img = E.createImage(20, 20, 255);
  for (let y = 0; y < 20; y++) img.data[(y * 20 + 10) * 4] = 0;
  const out = E.waveWarp(img, 4, 20);
  assert(px(img, 10, 5) === 0, 'waveWarp 不修改原图');
  const firstRowSame = px(out, 10, 0) === 0;
  assert(firstRowSame, 'waveWarp 在正弦过零点处位移为 0');

  const amp0 = E.waveWarp(img, 0, 20);
  assert(px(amp0, 10, 5) === 0, 'waveWarp 振幅为 0 时不做改动');

  let hasWhite = false;
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i] === 255) hasWhite = true;
  }
  assert(hasWhite, 'waveWarp 输出保留白色背景');
}

// ── sliceShift ──
{
  const img = E.createImage(40, 30, 255);
  for (let y = 0; y < 30; y++) img.data[(y * 40 + 20) * 4] = 0;
  const out = E.sliceShift(img, 8, E.mulberry32(3), 10);
  assert(px(img, 20, 5) === 0, 'sliceShift 不修改原图');

  const again = E.sliceShift(img, 8, E.mulberry32(3), 10);
  let identical = true;
  for (let i = 0; i < out.data.length; i++) {
    if (out.data[i] !== again.data[i]) identical = false;
  }
  assert(identical, 'sliceShift 同种子结果可复现');

  const amp0 = E.sliceShift(img, 0, E.mulberry32(3), 10);
  assert(px(amp0, 20, 5) === 0, 'sliceShift 位移为 0 时不做改动');

  let shifted = false;
  for (let y = 0; y < 30; y++) {
    if (px(out, 20, y) === 255 && y > 0) shifted = true;
  }
  assert(shifted, 'sliceShift 确实把部分行移开了原位');
}

// ── strokeBreak ──
{
  const img = E.createImage(20, 20, 0);
  const out = E.strokeBreak(img, 3, E.mulberry32(9));
  assert(px(img, 0, 0) === 0, 'strokeBreak 不修改原图');
  let whiteRows = 0;
  for (let y = 0; y < 20; y++) {
    if (px(out, 10, y) === 255) whiteRows++;
  }
  assert(whiteRows >= 3, 'strokeBreak 至少擦出 count 条白线');

  const none = E.strokeBreak(img, 0, E.mulberry32(9));
  assert(px(none, 10, 10) === 0, 'strokeBreak count=0 时不做改动');

  // 切断线必须落在有墨迹的行上，不能撒到空白处
  const band = E.createImage(20, 20, 255);
  for (let y = 10; y <= 11; y++) {
    for (let x = 0; x < 20; x++) setPx(band, x, y, 0);
  }
  const cut = E.strokeBreak(band, 8, E.mulberry32(11));
  let rowA = true;
  let rowB = true;
  let outside = false;
  for (let x = 0; x < 20; x++) {
    if (px(cut, x, 10) !== 255) rowA = false;
    if (px(cut, x, 11) !== 255) rowB = false;
  }
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 20; x++) if (px(cut, x, y) !== 255) outside = true;
  }
  assert(rowA && rowB, 'strokeBreak 的切断线命中墨迹所在的行');
  assert(!outside, 'strokeBreak 不会把线撒到墨迹以外的区域');

  const blank = E.strokeBreak(E.createImage(20, 20, 255), 3, E.mulberry32(2));
  assert(px(blank, 0, 0) === 255, 'strokeBreak 遇到纯白图不报错');
}

// ── applyPipeline ──
{
  const img = E.createImage(20, 20, 255);
  setPx(img, 10, 10, 0);
  const plain = E.applyPipeline(img, {}, 1);
  assert(plain.width === 20 && plain.height === 20, 'applyPipeline 保持图像尺寸');
  assertClose(px(plain, 10, 10), 0, 0.01, 'applyPipeline 全 0 参数时保留原始黑点');
  assert(px(plain, 0, 0) === 255, 'applyPipeline 全 0 参数时保留原始白底');
  assert(px(img, 10, 10) === 0, 'applyPipeline 不修改原图');

  const same1 = E.applyPipeline(img, { slice: 5, noise: 20, breakCount: 3 }, 5);
  const same2 = E.applyPipeline(img, { slice: 5, noise: 20, breakCount: 3 }, 5);
  let identical = true;
  for (let i = 0; i < same1.data.length; i++) {
    if (same1.data[i] !== same2.data[i]) identical = false;
  }
  assert(identical, 'applyPipeline 同种子结果可复现');

  const diff = E.applyPipeline(img, { slice: 5, noise: 20, breakCount: 3 }, 6);
  let differs = false;
  for (let i = 0; i < same1.data.length; i++) {
    if (same1.data[i] !== diff.data[i]) differs = true;
  }
  assert(differs, 'applyPipeline 换种子后结果不同');
}

// ── normalizeText ──
{
  assert(E.normalizeText(' 你 好 ') === '你好', 'normalizeText 去掉半角空格');
  assert(E.normalizeText('你\u3000好') === '你好', 'normalizeText 去掉全角空格');
  assert(E.normalizeText('你好，世界！') === '你好世界', 'normalizeText 去掉中文标点');
  assert(E.normalizeText('AbC-12') === 'abc12', 'normalizeText 转小写并去标点');
  assert(E.normalizeText(null) === '', 'normalizeText 处理 null 不报错');
}

// ── similarity ──
{
  assert(E.similarity('验证码', '验证码') === 1, 'similarity 完全一致为 1');
  assert(E.similarity('验证码', '验 证 码') === 1, 'similarity 忽略空格差异');
  assert(E.similarity('abc', 'xyz') === 0, 'similarity 完全不同为 0');
  assertClose(E.similarity('验证码', '验证吗'), 2 / 3, 0.001, 'similarity 单字错位为 2/3');
  assert(E.similarity('', '') === 1, 'similarity 两个空串视为一致');
  assert(E.similarity('abc', '') === 0, 'similarity 一方为空时为 0');
}

// ── judgeOcr ──
{
  const exact = E.judgeOcr('今天中午吃什么', '今天中午吃什么');
  assert(exact.pass === true && exact.similarity === 1, 'judgeOcr 完全一致判定通过');

  const near = E.judgeOcr('今天中午吃什么', '今天中午吃什幺');
  assert(near.pass === true, 'judgeOcr 接近阈值以上判定通过');

  const wrong = E.judgeOcr('今天中午吃什么', '令天牛午吃什么');
  assert(wrong.pass === false, 'judgeOcr 错得较多时判定不通过');
  assert(wrong.similarity < 0.8, 'judgeOcr 不通过时相似度低于阈值');

  const custom = E.judgeOcr('验证码', '验证吗', 0.9);
  assert(custom.pass === false, 'judgeOcr 支持自定义阈值');
}

// ── classify ──
{
  assert(E.classify(true, false) === 'separation', 'classify 人读得出、机器读不出 → 人机分离');
  assert(E.classify(true, true) === 'both-ok', 'classify 都能读出');
  assert(E.classify(false, false) === 'both-fail', 'classify 都读不出');
  assert(E.classify(false, true) === 'machine-only', 'classify 只有机器读得出');
}

// ── summarize ──
{
  const empty = E.summarize([]);
  assert(empty.total === 0 && empty.separationRate === 0, 'summarize 空列表不除零');

  const records = [
    { humanRead: true, ocrPass: false },
    { humanRead: true, ocrPass: false },
    { humanRead: true, ocrPass: true },
    { humanRead: false, ocrPass: false },
    { humanRead: false, ocrPass: true },
  ];
  const s = E.summarize(records);
  assert(s.total === 5, 'summarize 统计总数');
  assert(s.separation === 2, 'summarize 统计人机分离次数');
  assert(s.bothOk === 1, 'summarize 统计都读得出次数');
  assert(s.bothFail === 1, 'summarize 统计都读不出次数');
  assert(s.machineOnly === 1, 'summarize 统计只有机器读得出次数');
  assertClose(s.separationRate, 0.4, 0.001, 'summarize 计算人机分离率');

  const bad = E.summarize(null);
  assert(bad.total === 0, 'summarize 处理非法输入不报错');
}

// ── breakdownLevel ──
{
  assert(E.breakdownLevel({}) === 0, 'breakdownLevel 全默认时为 0');
  assert(E.breakdownLevel() === 0, 'breakdownLevel 无参时为 0');

  assert(E.breakdownLevel({ wave: 16 }) === 100, 'breakdownLevel 单项到见效点即为 100');
  assert(E.breakdownLevel({ blur: 4 }) === 100, 'breakdownLevel 模糊到 4 即为 100');
  assert(E.breakdownLevel({ wave: 8 }) === 50, 'breakdownLevel 半量取一半');

  const fontSizeOnly = E.breakdownLevel({ fontSize: 110 });
  assert(fontSizeOnly === 0, 'breakdownLevel 不计入字号');

  const over = E.breakdownLevel({ wave: 999, noise: 999 });
  assert(over === 100, 'breakdownLevel 超出见效点时封顶 100');

  const negative = E.breakdownLevel({ wave: -50 });
  assert(negative === 0, 'breakdownLevel 负值按 0 处理');

  // 取最强项：多动几项不会把结果拉低，也不该被稀释
  const one = E.breakdownLevel({ slice: 16 });
  const both = E.breakdownLevel({ slice: 16, noise: 10 });
  assert(both === one, 'breakdownLevel 叠加更弱的手法不改变结果');
  assert(E.breakdownLevel({ slice: 16, blur: 4 }) === 100, 'breakdownLevel 叠加更强的手法取最强者');

  // 六个预设必须落在互不相同的强度上，否则散点图会重叠
  const presets = [
    {},
    { wave: 4, noise: 20, contrast: 22 },
    { fontSize: 36, noise: 26, contrast: 34 },
    { slice: 16, breakCount: 7 },
    { wave: 10, breakCount: 3, noise: 34, lines: 3 },
    { blur: 4, contrast: 62 },
  ];
  const levels = presets.map(function (p) {
    return E.breakdownLevel(p);
  });
  const unique = new Set(levels);
  assert(unique.size === presets.length, 'breakdownLevel 六个预设的强度互不相同（' + levels.join(',') + '）');
  assert(
    levels[0] === 0 && levels[levels.length - 1] === 100,
    'breakdownLevel 预设覆盖 0 到 100 两端'
  );
}

console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) process.exit(1);
