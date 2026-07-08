/**
 * SQLite 并发压力实验室 — 单元测试
 * 测试前端核心逻辑函数（纯计算、格式化、状态判断）
 */

// ========== 核心函数（从 HTML 提取的可测试逻辑） ==========

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function calcQpsFromDailyPV(dailyPV) {
  return dailyPV / 86400;
}

function calcSuccessRate(successCount, total) {
  if (total === 0) return 0;
  return (successCount / total) * 100;
}

function classifyBurstResult(busyCount, concurrency) {
  if (busyCount === 0) return 'all-success';
  if (busyCount < concurrency * 0.3) return 'partial-busy';
  return 'severe-contention';
}

function calcPeakQps(avgQps, peakFactor) {
  return avgQps * peakFactor;
}

// 场景换算
var scenarios = [
  { name: '个人博客', dailyPV: 100000, qps: 1.2, concurrency: 3 },
  { name: '小型 SaaS', dailyPV: 500000, qps: 6, concurrency: 10 },
  { name: '中型站点', dailyPV: 2000000, qps: 23, concurrency: 50 },
  { name: '高流量应用', dailyPV: 10000000, qps: 116, concurrency: 150 }
];

// ========== 测试 ==========

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  ✗ ' + msg);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  var diff = Math.abs(actual - expected);
  assert(diff <= tolerance, msg + ' (actual=' + actual.toFixed(2) + ', expected=' + expected + ', tol=' + tolerance + ')');
}

console.log('=== SQLite 并发压力实验室 单元测试 ===\n');

// 测试1: formatBytes
console.log('测试1: formatBytes 字节格式化');
assert(formatBytes(0) === '0 B', '0 bytes');
assert(formatBytes(512) === '512 B', '512 bytes');
assert(formatBytes(1024) === '1.0 KB', '1 KB');
assert(formatBytes(1536) === '1.5 KB', '1.5 KB');
assert(formatBytes(1048576) === '1.00 MB', '1 MB');
assert(formatBytes(5242880) === '5.00 MB', '5 MB');
assert(formatBytes(40960) === '40.0 KB', '40 KB (典型空SQLite文件)');
console.log('');

// 测试2: 日PV到QPS的换算
console.log('测试2: 日PV → QPS 换算');
assertApprox(calcQpsFromDailyPV(100000), 1.157, 0.01, '10万日PV ≈ 1.16 req/s');
assertApprox(calcQpsFromDailyPV(500000), 5.787, 0.01, '50万日PV ≈ 5.79 req/s');
assertApprox(calcQpsFromDailyPV(2000000), 23.148, 0.01, '200万日PV ≈ 23.15 req/s');
assertApprox(calcQpsFromDailyPV(10000000), 115.74, 0.1, '1000万日PV ≈ 115.74 req/s');
assertApprox(calcQpsFromDailyPV(86400), 1.0, 0.001, '86400 PV = 精确 1 req/s');
console.log('');

// 测试3: 成功率计算
console.log('测试3: 成功率计算');
assertApprox(calcSuccessRate(10, 10), 100, 0.01, '10/10 = 100%');
assertApprox(calcSuccessRate(8, 10), 80, 0.01, '8/10 = 80%');
assertApprox(calcSuccessRate(0, 10), 0, 0.01, '0/10 = 0%');
assertApprox(calcSuccessRate(0, 0), 0, 0.01, '0/0 = 0% (边界)');
assertApprox(calcSuccessRate(50, 200), 25, 0.01, '50/200 = 25%');
console.log('');

// 测试4: 压测结果分类
console.log('测试4: 压测结果严重程度分类');
assert(classifyBurstResult(0, 10) === 'all-success', '0 busy = 全部成功');
assert(classifyBurstResult(0, 100) === 'all-success', '0 busy / 100并发 = 全部成功');
assert(classifyBurstResult(2, 10) === 'partial-busy', '2/10 busy = 部分竞争');
assert(classifyBurstResult(29, 100) === 'partial-busy', '29/100 busy = 部分竞争');
assert(classifyBurstResult(30, 100) === 'severe-contention', '30/100 busy = 严重竞争');
assert(classifyBurstResult(80, 100) === 'severe-contention', '80/100 busy = 严重竞争');
assert(classifyBurstResult(10, 10) === 'severe-contention', '10/10 busy = 严重竞争');
console.log('');

// 测试5: 峰值QPS估算
console.log('测试5: 峰值QPS估算（高峰系数）');
assertApprox(calcPeakQps(1.2, 3), 3.6, 0.01, '个人博客峰值 = 1.2 × 3 = 3.6');
assertApprox(calcPeakQps(6, 5), 30, 0.01, '小型SaaS峰值 = 6 × 5 = 30');
assertApprox(calcPeakQps(23, 4), 92, 0.01, '中型站点峰值 = 23 × 4 = 92');
assertApprox(calcPeakQps(116, 3), 348, 0.1, '高流量峰值 = 116 × 3 = 348');
console.log('');

// 测试6: 场景数据一致性
console.log('测试6: 场景卡片数据一致性');
scenarios.forEach(function(sc) {
  var calcQps = calcQpsFromDailyPV(sc.dailyPV);
  assertApprox(calcQps, sc.qps, 0.5, sc.name + ': 标注QPS ' + sc.qps + ' 与计算值 ' + calcQps.toFixed(2) + ' 相符');
});
console.log('');

// 测试7: 并发数合法性边界
console.log('测试7: 并发数校验逻辑');
function isValidConcurrency(n) {
  return Number.isInteger(n) && n >= 1 && n <= 200;
}
assert(isValidConcurrency(1), '1 合法');
assert(isValidConcurrency(100), '100 合法');
assert(isValidConcurrency(200), '200 合法');
assert(!isValidConcurrency(0), '0 不合法');
assert(!isValidConcurrency(201), '201 不合法');
assert(!isValidConcurrency(-1), '-1 不合法');
assert(!isValidConcurrency(1.5), '1.5 不合法（非整数）');
console.log('');

// 测试8: WAL模式期望
console.log('测试8: WAL vs DELETE 模式行为期望');
// WAL 模式下，读写可以并行（写不阻塞读），但多个写仍然互斥
// 预期：WAL 模式下 BUSY 错误应 <= DELETE 模式
function walShouldHelp(deleteResult, walResult) {
  // WAL mode should have >= success rate (in most cases)
  return walResult.successCount >= deleteResult.successCount * 0.8; // 允许20%波动
}
assert(walShouldHelp({ successCount: 7 }, { successCount: 9 }), 'WAL 成功数 9 >= DELETE 7 × 0.8');
assert(walShouldHelp({ successCount: 10 }, { successCount: 10 }), 'WAL 和 DELETE 都全成功');
assert(walShouldHelp({ successCount: 50 }, { successCount: 45 }), 'WAL 45 >= 50×0.8=40 (允许波动)');
assert(!walShouldHelp({ successCount: 50 }, { successCount: 30 }), 'WAL 30 < 50×0.8=40 (异常)');
console.log('');

// ========== 结果汇总 ==========
console.log('═══════════════════════════════════');
console.log('总计: ' + (passed + failed) + ' 个测试');
console.log('通过: ' + passed);
if (failed > 0) {
  console.log('失败: ' + failed);
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}
