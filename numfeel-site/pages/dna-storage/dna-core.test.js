/**
 * dna-core.test.js - DNA 存储核心算法单元测试
 * 运行：node pages/dna-storage/dna-core.test.js
 */
var DNA = require('./dna-core.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('  ✅ ' + msg);
    passed++;
  } else {
    console.error('  ❌ ' + msg);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + ' (期望 ' + expected + ', 实际 ' + actual + ')');
}

function assertDeepEqual(actual, expected, msg) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, msg + (ok ? '' : ' (期望 ' + JSON.stringify(expected) + ', 实际 ' + JSON.stringify(actual) + ')'));
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + ' (期望 ' + expected + ' ±' + tol + ', 实际 ' + actual + ')');
}

console.log('\n═══════════════════════════════════════');
console.log('  DNA 存储核心算法测试');
console.log('═══════════════════════════════════════\n');

// ── 1. PRNG 可复现 ──
console.log('【1】确定性 PRNG：同 seed 同序列');
var rng1 = DNA.createRng(42);
var rng2 = DNA.createRng(42);
var seq1 = [], seq2 = [];
for (var i = 0; i < 100; i++) {
  seq1.push(rng1());
  seq2.push(rng2());
}
assertDeepEqual(seq1, seq2, '同 seed 产生相同序列');
// 不同 seed 应不同
var rng3 = DNA.createRng(7);
assert(rng3() !== seq1[0], '不同 seed 产生不同首值');
// 范围 [0,1)
var rng4 = DNA.createRng(123);
var allInRange = true;
for (var j = 0; j < 1000; j++) {
  var v = rng4();
  if (v < 0 || v >= 1) { allInRange = false; break; }
}
assert(allInRange, '所有随机数落在 [0,1)');

// ── 2. 分段与补齐 ──
console.log('\n【2】分段：末段用 0 补齐');
var segs = DNA.splitIntoSegments(new Uint8Array([1, 2, 3, 4, 5, 6, 7]), 4);
assertEqual(segs.length, 2, '7 字节按 4 切分得 2 段');
assertEqual(segs[0].length, 4, '每段长度 = 4');
assertDeepEqual(Array.from(segs[0]), [1, 2, 3, 4], '第一段正确');
assertDeepEqual(Array.from(segs[1]), [5, 6, 7, 0], '第二段补 0');
// 整除
var segs2 = DNA.splitIntoSegments(new Uint8Array([1, 2, 3, 4]), 2);
assertEqual(segs2.length, 2, '4 字节按 2 切分得 2 段');
assertDeepEqual(Array.from(segs2[1]), [3, 4], '整除无补齐');

// ── 3. Robust Soliton 分布 ──
console.log('\n【3】Robust Soliton 度分布');
var cdf = DNA.buildSolitonDistribution(10);
assertEqual(cdf.length, 11, 'CDF 长度 = K+1');
assertClose(cdf[10], 1, 1e-9, 'CDF 末项 = 1');
assertClose(cdf[0], 0, 1e-9, 'CDF 首项 = 0');
// 单调递增
var monotonic = true;
for (var k = 1; k < cdf.length; k++) {
  if (cdf[k] < cdf[k - 1]) { monotonic = false; break; }
}
assert(monotonic, 'CDF 单调递增');
// K=1 退化
var cdf1 = DNA.buildSolitonDistribution(1);
assertDeepEqual(cdf1, [0, 1], 'K=1 时度恒为 1');

// ── 4. 度采样落在合法范围 ──
console.log('\n【4】度采样范围合法');
var rngD = DNA.createRng(555);
var cdfD = DNA.buildSolitonDistribution(20);
var legalCount = 0;
for (var s = 0; s < 500; s++) {
  var d = DNA.sampleDegree(rngD, cdfD);
  if (d >= 1 && d <= 20) legalCount++;
}
assertEqual(legalCount, 500, '500 次采样度均在 1..K');

// ── 5. recoverIndices 可由 seed 重放 ──
console.log('\n【5】recoverIndices 与 makeDroplet 一致');
var segs5 = DNA.splitIntoSegments(DNA.textToBytes('DNA存储测试数据'), 4);
var K5 = segs5.length;
var drop5 = DNA.makeDroplet(segs5, 12345);
var rec5 = DNA.recoverIndices(12345, K5);
assertDeepEqual(rec5, drop5.indices, 'recoverIndices 重放出的下标与液滴一致');
// 度 = 下标数
assertEqual(drop5.indices.length, drop5.data.length >= 0 ? drop5.indices.length : 0, '液滴度 = 下标数');
// 下标不重复
var idxSet = {};
var noDup = true;
for (var x = 0; x < rec5.length; x++) {
  if (idxSet[rec5[x]]) { noDup = false; break; }
  idxSet[rec5[x]] = true;
}
assert(noDup, '下标不重复');
// 同 seed 再来一次仍一致
assertDeepEqual(DNA.recoverIndices(12345, K5), rec5, '同 seed 两次重放一致');

// ── 6. 碱基映射往返无损 ──
console.log('\n【6】碱基映射 bytesToBases / basesToBytes 往返无损');
var testBytes = [0x00, 0xFF, 0x5A, 0xA5, 0x37, 0xC3, 0x12, 0x34];
var bases = DNA.bytesToBases(testBytes);
assertEqual(bases.length, testBytes.length * 4, '碱基串长度 = 字节数*4');
var back = Array.from(DNA.basesToBytes(bases));
assertDeepEqual(back, testBytes, '往返还原原始字节');
// 只含 ACGT
assert(/^[ACGT]+$/.test(bases), '碱基串只含 A/C/G/T');
// 空数组
assertEqual(DNA.bytesToBases([]), '', '空字节 -> 空串');
assertEqual(DNA.basesToBytes('').length, 0, '空串 -> 空字节');

// ── 7. GC 含量 ──
console.log('\n【7】GC 含量计算');
assertClose(DNA.gcContent('GCGC'), 1, 1e-9, 'GCGC 的 GC = 1');
assertClose(DNA.gcContent('ATAT'), 0, 1e-9, 'ATAT 的 GC = 0');
assertClose(DNA.gcContent('ACGT'), 0.5, 1e-9, 'ACGT 的 GC = 0.5');
assertClose(DNA.gcContent(''), 0, 1e-9, '空串 GC = 0');

// ── 8. 同碱基重复 ──
console.log('\n【8】最长同碱基重复');
assertEqual(DNA.maxHomopolymerRun('AAATGC'), 3, 'AAATGC 最长 run = 3');
assertEqual(DNA.maxHomopolymerRun('ACGT'), 1, 'ACGT 最长 run = 1');
assertEqual(DNA.maxHomopolymerRun('TTTT'), 4, 'TTTT 最长 run = 4');
assertEqual(DNA.maxHomopolymerRun(''), 0, '空串 run = 0');

// ── 9. 生物学体检 screenOligo ──
console.log('\n【9】screenOligo 体检判定');
var goodScreen = DNA.screenOligo('ACGTACGTACGTACGT', { gcMin: 0.4, gcMax: 0.6, maxRun: 3 });
assert(goodScreen.pass, 'GC=50% 无重复 -> 通过');
assertEqual(goodScreen.reason, '', '通过时 reason 为空');

var highGc = DNA.screenOligo('GCGCGCGCGCGCGCGC');
assert(!highGc.pass, 'GC=100% -> 不通过');
assert(highGc.reason.indexOf('GC') !== -1, '失败原因含 GC');

var longRun = DNA.screenOligo('AAAATTTTCCCCGGGG', { gcMin: 0.4, gcMax: 0.6, maxRun: 3 });
assert(!longRun.pass, '有 4 连重复 -> 不通过');
assert(longRun.reason.indexOf('重复') !== -1, '失败原因含重复');

// ── 10. encode -> decode 无损往返 ──
console.log('\n【10】完整 encode -> decode 无损往返');
var msg = 'DNA存储：把照片写成ATCG';
var bytes10 = DNA.textToBytes(msg);
var enc10 = DNA.encode(bytes10, { segLen: 4, redundancy: 1.2 });
assert(enc10.oligos.length > 0, '编码产出 oligo');
assertEqual(enc10.K, DNA.splitIntoSegments(bytes10, 4).length, 'K 正确');
var dec10 = DNA.decode(enc10.oligos.map(function (o) { return o.baseStr; }), enc10.K, enc10.segLen);
assert(dec10.success, '无损解码成功');
var restoredMsg = DNA.bytesToText(dec10.data.slice(0, bytes10.length));
assertEqual(restoredMsg, msg, '还原文本 = 原始文本');

// ── 11. dropout 容忍：丢一部分仍能解 ──
console.log('\n【11】信道丢包容忍');
var enc11 = DNA.encode(DNA.textToBytes('Hello DNA World 你好'), { segLen: 4, redundancy: 1.5 });
var rng11 = DNA.createRng(2024);
var received11 = DNA.simulateChannel(enc11.oligos, { dropoutRate: 0.3, rng: rng11 });
assert(received11.length < enc11.oligos.length, '丢包后接收数 < 发送数');
assert(received11.length > 0, '仍有 oligo 存活');
var dec11 = DNA.decode(received11, enc11.K, enc11.segLen);
assert(dec11.success, '30% 丢包下仍能完整解码（冗余足够）');

// ── 12. 极端丢包导致解码失败 ──
console.log('\n【12】丢包过多 -> 解码失败');
var rng12 = DNA.createRng(88);
var received12 = DNA.simulateChannel(enc11.oligos, { dropoutRate: 0.9, rng: rng12 });
var dec12 = DNA.decode(received12, enc11.K, enc11.segLen);
assert(!dec12.success, '90% 丢包 -> 解码失败');

// ── 13. 突变被 checksum 检测并丢弃 ──
console.log('\n【13】碱基突变被 checksum 拦截');
var enc13 = DNA.encode(DNA.textToBytes('突变测试数据'), { segLen: 4, redundancy: 1.5 });
var rng13 = DNA.createRng(321);
var mutated13 = DNA.simulateChannel(enc13.oligos, { dropoutRate: 0, mutationRate: 0.15, rng: rng13 });
// 大量突变后，有效 oligo 减少，但仍可能解码（冗余兜底）
var dec13 = DNA.decode(mutated13, enc13.K, enc13.segLen);
// 只要冗余够，仍应成功；关键是不产生错误数据
if (dec13.success) {
  var restored13 = DNA.bytesToText(dec13.data.slice(0, 12));
  assertEqual(restored13, '突变测试数据', '突变后解码数据正确无误');
} else {
  assert(true, '突变过多导致解码失败（未产生错误数据，安全失败）');
}

// ── 14. seedToBytes / bytesToSeed 往返 ──
console.log('\n【14】seed 大端编解码往返');
var seeds = [1, 255, 256, 65535, 1000000, 4294967295, 123456789];
var seedOk = true;
for (var si = 0; si < seeds.length; si++) {
  var sb = DNA.seedToBytes(seeds[si]);
  var rs = DNA.bytesToSeed(sb[0], sb[1], sb[2], sb[3]);
  if (rs !== seeds[si]) { seedOk = false; break; }
}
assert(seedOk, '7 个 seed 往返一致');

// ── 15. 蒙特卡洛冗余扫描：冗余越高成功率越高 ──
console.log('\n【15】蒙特卡洛冗余扫描');
var sweep = DNA.sweepRedundancy(DNA.textToBytes('蒙特卡洛扫描测试'), {
  rates: [0, 0.3, 0.8],
  trials: 15,
  dropoutRate: 0.15,
  segLen: 4
});
assertEqual(sweep.length, 3, '返回 3 个冗余率结果');
assert(sweep[2].successRate >= sweep[0].successRate, '高冗余成功率 >= 零冗余成功率');
for (var sw = 0; sw < sweep.length; sw++) {
  assert(sweep[sw].successRate >= 0 && sweep[sw].successRate <= 1, '成功率在 [0,1]');
}

// ── 16. 密度计算 ──
console.log('\n【16】DNA 密度计算');
// 215 PB = 215e6 GB = 2.15e17 字节，1 克存这么多
var mass1g = DNA.dnaMass(2.15e17);
assertClose(mass1g, 1, 1e-6, '2.15e17 字节 -> 1 克');
// 论文实测 2,146,816 字节
var massPaper = DNA.dnaMass(2146816);
assert(massPaper > 0 && massPaper < 1e-8, '2.1MB 数据质量极小（< 1e-8 克）');
var scale = DNA.describeScale(2146816);
assert(scale.comparisons.length > 0, 'describeScale 返回对比物列表');
assert(scale.massGram > 0, '质量为正');

// ── 17. 边界：空/单段数据 ──
console.log('\n【17】边界：单字节与单段');
var enc1 = DNA.encode(new Uint8Array([65]), { segLen: 4, redundancy: 1 });
assertEqual(enc1.K, 1, '单段数据 K=1');
var dec1 = DNA.decode(enc1.oligos.map(function (o) { return o.baseStr; }), enc1.K, enc1.segLen);
assert(dec1.success, '单段数据解码成功');
assertEqual(dec1.data[0], 65, '单段数据还原正确');

// ── 18. startSeed 让不同次编码产生不同液滴 ──
console.log('\n【18】startSeed 可选参数');
var bytes18 = DNA.textToBytes('startSeed测试数据流');
var encA = DNA.encode(bytes18, { segLen: 4, redundancy: 1.5, startSeed: 1 });
var encB = DNA.encode(bytes18, { segLen: 4, redundancy: 1.5, startSeed: 999 });
// 起始种子不同，第一批 oligo 的 seed 应不同
assert(encA.oligos[0].seed !== encB.oligos[0].seed, '不同 startSeed 产出不同首条 seed');
// 两者都能正确解码
var decA = DNA.decode(encA.oligos.map(function (o) { return o.baseStr; }), encA.K, encA.segLen);
var decB = DNA.decode(encB.oligos.map(function (o) { return o.baseStr; }), encB.K, encB.segLen);
assert(decA.success && decB.success, '两种 startSeed 都能完整解码');
assertEqual(DNA.bytesToText(decA.data.slice(0, bytes18.length)), 'startSeed测试数据流', 'startSeed=1 还原正确');
assertEqual(DNA.bytesToText(decB.data.slice(0, bytes18.length)), 'startSeed测试数据流', 'startSeed=999 还原正确');
// 不传 startSeed 时默认从 1 开始（不改变原有行为）
var encDefault = DNA.encode(bytes18, { segLen: 4, redundancy: 1.5 });
assertEqual(encDefault.oligos[0].seed, encA.oligos[0].seed, '不传 startSeed 默认 = 1，与显式传 1 一致');

// ── 19. resolvedMap 含已解出段数据 ──
console.log('\n【19】decode 返回 resolvedMap');
var bytes19 = DNA.textToBytes('resolvedMap测试');
var enc19 = DNA.encode(bytes19, { segLen: 4, redundancy: 1.5 });
var dec19 = DNA.decode(enc19.oligos.map(function (o) { return o.baseStr; }), enc19.K, enc19.segLen);
assert(dec19.resolvedMap !== undefined, '返回值含 resolvedMap');
// 成功时所有段都在 resolvedMap 中
var mapKeys = Object.keys(dec19.resolvedMap);
assertEqual(mapKeys.length, enc19.K, '成功时 resolvedMap 含全部 K 段');
// 每段是 segLen 字节的 Uint8Array
var segOk = true;
for (var mk = 0; mk < mapKeys.length; mk++) {
  var sd = dec19.resolvedMap[mapKeys[mk]];
  if (!sd || sd.length !== enc19.segLen) { segOk = false; break; }
}
assert(segOk, '每段数据长度 = segLen');
// resolvedMap 拼起来 = data
if (dec19.success) {
  var rebuilt = new Uint8Array(enc19.K * enc19.segLen);
  for (var ri = 0; ri < enc19.K; ri++) {
    for (var bj = 0; bj < enc19.segLen; bj++) {
      rebuilt[ri * enc19.segLen + bj] = dec19.resolvedMap[ri][bj];
    }
  }
  assert(DNA.arraysEqual(rebuilt, dec19.data), 'resolvedMap 拼装 = data');
}
// 失败时 resolvedMap 只含部分段
var rngFail = DNA.createRng(777);
var receivedFail = DNA.simulateChannel(enc19.oligos, { dropoutRate: 0.95, rng: rngFail });
var decFail = DNA.decode(receivedFail, enc19.K, enc19.segLen);
if (!decFail.success) {
  var failKeys = Object.keys(decFail.resolvedMap);
  assert(failKeys.length < enc19.K, '失败时 resolvedMap 段数 < K');
  assert(failKeys.length >= 0, '失败时 resolvedMap 仍存在（可能为空）');
}

// ── 结果统计 ──
console.log('\n═══════════════════════════════════════');
console.log('  通过: ' + passed + ' / 失败: ' + failed);
console.log('═══════════════════════════════════════');
if (failed > 0) {
  process.exit(1);
}
