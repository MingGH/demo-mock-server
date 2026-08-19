// java-memory 纯逻辑单元测试，用 Node 直接运行：node pages/java-memory/logic.test.js
const L = require('./logic.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ')');
}

// ── fmtMb ──
assert(L.fmtMb(45.5, 0) === '46', 'fmtMb 四舍五入到整数');
assert(L.fmtMb(45.1234, 2) === '45.12', 'fmtMb 保留两位且去掉尾零');
assert(L.fmtMb(null) === '\u2014', 'fmtMb null 返回占位符');
assert(L.fmtMb(NaN) === '\u2014', 'fmtMb NaN 返回占位符');

// ── breakdown：能正确把非堆拆成 Metaspace + Code Cache + 其它 ──
const SNAP = {
  heapUsedMb: 128,
  nonHeapUsedMb: 200,
  metaspaceUsedMb: 80,
  codeCacheUsedMb: 60,
  threadStackMbEstimate: 40
};
const segs = L.breakdown(SNAP);
const keys = segs.map(s => s.key);
assert(keys.indexOf('heap') !== -1, 'breakdown 包含 heap');
assert(keys.indexOf('metaspace') !== -1, 'breakdown 包含 metaspace');
assert(keys.indexOf('code') !== -1, 'breakdown 包含 code');
assert(keys.indexOf('stacks') !== -1, 'breakdown 包含 stacks');
assert(keys.indexOf('other') !== -1, 'breakdown 包含 其它非堆');
const other = segs.find(s => s.key === 'other');
assertClose(other.mb, 200 - 80 - 60, 1e-6, '其它非堆 = 非堆 - Metaspace - CodeCache');
assertClose(L.breakdownTotal(segs), 128 + 40 + 200, 1e-6, '账本总计 = 堆 + 栈 + 非堆');

// ── breakdown：缺字段时风险段被省略，不会抛错 ──
const segs2 = L.breakdown({ heapUsedMb: 10, nonHeapUsedMb: 5 });
const keys2 = segs2.map(s => s.key);
assert(keys2.indexOf('metaspace') === -1 && keys2.indexOf('code') === -1, '缺字段时省略缺席段');
assert(L.breakdownTotal(segs2) === 15, '部分账本合计正确');

// ── breakdown：负数非堆被归零且不产生负数段 ──
const segsNeg = L.breakdown({ heapUsedMb: 10, nonHeapUsedMb: 1, metaspaceUsedMb: 80 });
const otherNeg = segsNeg.find(s => s.key === 'other');
assert(otherNeg === undefined || otherNeg.mb >= 0, '其它非堆不会为负');

// ── headline ──
const hl = L.headline(SNAP);
assert(hl.heapUsedMb === 128, 'headline 提取堆已用');
assert(hl.gcCount === 0, 'headline gc 数量');

// ── jvmIdentity ──
const id1 = L.jvmIdentity({ javaVersion: '17.0.20 · Eclipse OpenJ9 VM', gc: [{ name: 'scavenge' }, { name: 'global' }] });
assert(id1.javaVersion === '17.0.20 · Eclipse OpenJ9 VM', 'jvmIdentity 提取 javaVersion');
assert(id1.gcNames.join(',') === 'scavenge,global', 'jvmIdentity 提取 GC 名列表');
const id2 = L.jvmIdentity({});
assert(id2.javaVersion === null && id2.gcNames.length === 0, 'jvmIdentity 空快照安全返回');

// ── containerInfo：有上限时算百分比并截断到 1 ──
const ci = L.containerInfo({ containerMemoryLimitMb: 100, rssMb: 120 });
assert(ci.available === true, 'containerInfo 可读');
assertClose(ci.percent, 1, 1e-6, '百分比超过 100 被截断到 1');
const ci2 = L.containerInfo({ containerMemoryLimitMb: 100, rssMb: 50 });
assertClose(ci2.percent, 0.5, 1e-6, '百分比正常计算');
const ci3 = L.containerInfo({ rssMb: 50 });
assert(ci3.available === false, '无 limit 时 mark 为不可用');

// ── contrastBare ──
const cb = L.contrastBare({ rssMb: 450 }, 45);
assert(cb.ratio === 10, '与裸 JDK 对比倍数正确');
const cb2 = L.contrastBare({ rssMb: 0 }, 45);
assert(cb2.available === false, 'RSS 为 0 时不可对比');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }