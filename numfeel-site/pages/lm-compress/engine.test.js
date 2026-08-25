/**
 * LMCompress 演示 — 核心逻辑单元测试（PPM 预测器）
 * 运行：node pages/lm-compress/engine.test.js
 */

const {
  TRAINING_CORPUS, PRESETS, PAPER_RATIO, MAX_ORDER,
  getAlphabet, buildModel, bestContext, distinctCount, smoothProb, predictDist,
  encodePPM, utf8Bytes, compressReport, sweepOrders, learningCurve,
  estimateDecodeMs, decodeComparison, tradeoffMatrix, formatBytes, formatDuration
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + message);
  } else {
    failed++;
    console.log('  ✗ ' + message);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (actual: ${typeof actual === 'number' ? actual.toFixed(4) : actual}, expected: ${typeof expected === 'number' ? expected.toFixed(4) : expected}, diff: ${diff.toFixed(4)})`);
}

console.log('\n=== 词表与模型构建 ===');

(function testGetAlphabet() {
  const alpha = getAlphabet('aabbbc中文');
  assert(alpha.indexOf('a') !== -1, '词表包含 a');
  assert(alpha.indexOf('中') !== -1, '词表包含 中');
  assert(alpha.indexOf('c') !== -1, '词表包含 c');
  assert(alpha.length === 5, 'aabbbc中文 去重后共 5 个字符');
})();

(function testBuildModelCounts() {
  const model = buildModel('abababc', 2);
  assert(model.vocabSize === 3, 'vocabSize 应为 3 (a,b,c)');
  // 长度 1 上下文：a 后跟 b 出现 3 次
  assert(model.counts['a']['b'] === 3, 'a 后跟 b 出现 3 次');
  // 长度 0 上下文（字符频率表）
  assert(model.counts['']['a'] === 3, '字符 a 共出现 3 次');
  assert(model.totals[''] === 7, '字符总数为 7');
  // order=1 时只建字符频率表
  const m1 = buildModel('abab', 1);
  assert(m1.counts['a'] === undefined, 'order=1 不建立上下文统计');
})();

console.log('\n=== 上下文与概率 ===');

(function testBestContext() {
  const model = buildModel('hello world hello world', 3);
  assert(bestContext(model, 'hel', 3) === 'el', '历史 hel 的最长已知前缀为 el');
  assert(bestContext(model, 'x', 3) === null, '未见过的历史返回 null');
  assert(bestContext(model, 'hello', 3) === 'lo', '历史 hello 的最长已知前缀为 lo');
})();

(function testSmoothProbSumToOne() {
  // 概率分布覆盖词表；剩余质量留给"词表外字符"的固定代价
  const model = buildModel('ababab', 2);
  const alpha = model.alphabet;
  let total = 0;
  for (const ch of alpha) {
    total += smoothProb(model, 'a', ch);
  }
  assert(total > 0 && total <= 1, `词表内概率和为 (0,1]（实际 ${total.toFixed(4)}）`);
  assert(smoothProb(model, 'a', 'b') > 0, '预测概率为正');
})();

(function testPredictDistSorted() {
  const model = buildModel('ababababab', 2); // a 后跟 b 出现 5 次，满足最少观测阈值
  const dist = predictDist(model, 'a', 2, 3);
  assert(dist.length >= 1, '至少返回 1 个预测');
  assert(dist[0].char === 'b', '前缀 a 的 top1 预测应为 b');
  for (let i = 1; i < dist.length; i++) {
    assert(dist[i - 1].prob >= dist[i].prob, '预测按概率降序排列');
  }
})();

console.log('\n=== PPM 编码 ===');

(function testEncodePPMDeterministic() {
  const m1 = buildModel(TRAINING_CORPUS, 3);
  const r1 = encodePPM('压缩的本质是预测', m1, 3);
  const m2 = buildModel(TRAINING_CORPUS, 3);
  const r2 = encodePPM('压缩的本质是预测', m2, 3);
  assertApprox(r1.bits, r2.bits, 1e-9, '相同输入与模型产生相同的比特数');
  assert(r1.perCharBits.length === 8, '逐字符比特数与文本长度一致');
  assert(r1.bits > 0, '编码比特数为正');
})();

(function testAdaptiveLearning() {
  // 同一模式重复出现时，第二次应压得更好（模型学会了）
  const model = buildModel(TRAINING_CORPUS, 3);
  const r = encodePPM('服务器日志 服务器日志 服务器日志 服务器日志', model, 3);
  const first = r.perCharBits.slice(0, 5);
  const last = r.perCharBits.slice(-5);
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgLast = last.reduce((a, b) => a + b, 0) / last.length;
  assert(avgLast < avgFirst, `重复文本后期每字符比特更少（${avgFirst.toFixed(2)} → ${avgLast.toFixed(2)}）`);
})();

console.log('\n=== UTF-8 字节数 ===');

(function testUtf8Bytes() {
  assert(utf8Bytes('abc') === 3, 'ascii 每字符 1 字节');
  assert(utf8Bytes('中') === 3, '中文每字符 3 字节');
  assert(utf8Bytes('中a') === 4, '中文+ascii 共 4 字节');
  assert(utf8Bytes('') === 0, '空串 0 字节');
  assert(utf8Bytes('\uD83D\uDE00') === 4, 'emoji 代理对 4 字节');
})();

console.log('\n=== 压缩报告 ===');

(function testCompressReport() {
  const report = compressReport(PRESETS.zh.text, TRAINING_CORPUS, 3);
  assert(report.order === 3, '报告记录阶数');
  assert(report.originalBytes === utf8Bytes(PRESETS.zh.text), '原始字节数正确');
  assert(report.compressedBytes > 0, '压缩后字节数大于 0');
  assert(report.compressedBytes < report.originalBytes, '中文语料下应能压缩');
  assert(report.savedPercent > 0 && report.savedPercent < 100, '压缩率在 0~100 之间');
  assert(report.perCharBits.length === PRESETS.zh.text.length, '学习曲线数据完整');
})();

(function testAllPresetsCompress() {
  // PPM 自适应特性：即使是模型"不懂"的日志/英文，也能靠边压边学压出空间
  for (const key of ['zh', 'log', 'en']) {
    const r = compressReport(PRESETS[key].text, TRAINING_CORPUS, 4);
    assert(r.compressedBytes < r.originalBytes, `预设 ${key} 应能压缩（PPM 自适应）`);
    assert(r.savedPercent > 5, `预设 ${key} 压缩率应大于 5%（实际 ${r.savedPercent.toFixed(1)}%）`);
  }
})();

(function testMorePretrainingBetterForZh() {
  // 预训练数据越多，模型越懂中文科普 → 中文预设压得越好
  const small = compressReport(PRESETS.zh.text, TRAINING_CORPUS, 4, 800);
  const full = compressReport(PRESETS.zh.text, TRAINING_CORPUS, 4);
  assert(full.savedPercent > small.savedPercent,
      `全量预训练优于 800 字预训练（${small.savedPercent.toFixed(1)}% → ${full.savedPercent.toFixed(1)}%）`);
})();

(function testSweepOrders() {
  const reports = sweepOrders(PRESETS.zh.text, TRAINING_CORPUS, MAX_ORDER);
  assert(reports.length === MAX_ORDER, '扫描覆盖 1..MAX_ORDER');
  assert(reports[0].order === 1 && reports[MAX_ORDER - 1].order === MAX_ORDER, '阶数递增');
  // 高阶模型在足量预训练下应显著优于 1 阶
  assert(reports[MAX_ORDER - 1].savedPercent > reports[0].savedPercent,
      `5-gram 压缩率高于 1-gram（${reports[0].savedPercent.toFixed(1)}% → ${reports[MAX_ORDER - 1].savedPercent.toFixed(1)}%）`);
})();

console.log('\n=== 学习曲线 ===');

(function testLearningCurve() {
  const report = compressReport(PRESETS.log.text, TRAINING_CORPUS, 4);
  const curve = learningCurve(report.perCharBits, 5);
  assert(curve.length === 5, '按 5 个窗口聚合');
  assert(curve[0].bucket === 1 && curve[4].bucket === 5, '窗口编号正确');
  assert(curve[0].bitsPerChar > 0, '每窗口比特数为正');
  // 日志重复模式：后面窗口平均比特应明显更低
  assert(curve[4].bitsPerChar < curve[0].bitsPerChar,
      `学习曲线下降（${curve[0].bitsPerChar.toFixed(2)} → ${curve[4].bitsPerChar.toFixed(2)} bits/char）`);
})();

console.log('\n=== 解压成本 ===');

(function testDecodeCost() {
  const gzip = estimateDecodeMs(1024 * 1024, 'gzip').ms;
  const llm = estimateDecodeMs(1024 * 1024, 'llm').ms;
  assert(gzip > 0 && gzip < 100, 'gzip 解压 1MB 应在毫秒级');
  assert(llm > 60000, 'LLM 解压 1MB 应达到分钟级');
  assert(llm > gzip * 1000, 'LLM 成本远高于 gzip');
})();

(function testDecodeComparison() {
  const list = decodeComparison(1024 * 1024);
  assert(list.length === 4, '对比列表包含 4 种方案');
  assert(list[0].key === 'gzip' && list[3].key === 'llm', '首尾分别为 gzip 与 LLM');
  assert(list[3].ms > list[0].ms, 'LLM 耗时最长');
  assert(list[3].human.length > 0, '有人类可读时长');
})();

console.log('\n=== 三角权衡 ===');

(function testTradeoffMatrix() {
  const matrix = tradeoffMatrix(1024 * 1024);
  assert(matrix.length === 4, '权衡矩阵包含 4 个方案');
  for (const m of matrix) {
    assert(m.params > 0, `方案 ${m.name} 有参数量`);
    assert(m.savedPercent >= 0 && m.savedPercent <= 100, `方案 ${m.name} 压缩率合法`);
    assert(m.decodeMs > 0, `方案 ${m.name} 有解压成本`);
  }
  for (let i = 1; i < matrix.length; i++) {
    assert(matrix[i].params > matrix[i - 1].params, '参数量递增');
  }
})();

console.log('\n=== 论文参考数据 ===');

(function testPaperRatio() {
  assert(PAPER_RATIO.textVsBz2 === 4, '文本压过 bz2 4 倍');
  assert(PAPER_RATIO.imageVsJpegXl === 2, '图片压过 JPEG-XL 2 倍');
  assert(PAPER_RATIO.audioVsFlac === 2, '音频压过 FLAC 2 倍');
  assert(PAPER_RATIO.videoVsH264 === 2, '视频压过 H.264 2 倍');
})();

console.log('\n=== 格式化工具 ===');

(function testFormatBytes() {
  assert(formatBytes(500) === '500 B', '500 B');
  assert(formatBytes(2048) === '2.0 KB', '2048 → 2.0 KB');
  assert(formatBytes(3 * 1024 * 1024) === '3.0 MB', '3MB');
})();

(function testFormatDuration() {
  assert(formatDuration(0.5) === '500 微秒', '0.5ms → 微秒');
  assert(formatDuration(5) === '5 毫秒', '5ms → 毫秒');
  assert(formatDuration(2500) === '2.5 秒', '2500ms → 2.5 秒');
  assert(formatDuration(60000) === '1 分钟', '60000ms → 1 分钟');
})();

console.log('\n=== 边界条件 ===');

(function testEmptyAndShortText() {
  const model = buildModel(TRAINING_CORPUS, 3);
  assert(encodePPM('', model, 3).bits === 0, '空文本编码 0 比特');
  const report = compressReport('', TRAINING_CORPUS, 3);
  assert(report.compressedBytes === 1, '空文本压缩后按 1 字节处理');
  const short = compressReport('AB', TRAINING_CORPUS, 5);
  assert(short.compressedBytes > 0, '短文本压缩不崩溃');
})();

console.log('\n=== 结果 ===');
console.log(`通过: ${passed}, 失败: ${failed}`);
process.exit(failed > 0 ? 1 : 0);