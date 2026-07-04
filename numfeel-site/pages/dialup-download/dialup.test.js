/**
 * 拨号上网下载模拟器 - 单元测试
 * 运行: node pages/dialup-download/dialup.test.js
 */

// ── 模拟浏览器环境中导出的工具函数 ──
const MODEM_SPEED_BPS = 56000;
const ACTUAL_MAX_BPS = 48000;
const ACTUAL_MIN_BPS = 28000;
const DISCONNECT_RATE = 1 / 1800;
const CONNECT_FAIL_RATE = 0.15;
const PHONE_RATE_PER_MIN = 0.02;

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return bytesPerSec.toFixed(1) + ' B/s';
  return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ── 测试框架 ──
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + msg);
  } else {
    failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + msg);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, msg + ' (got ' + actual + ', expected ~' + expected + ')');
}

// ══════════ 测试用例 ══════════

console.log('\n\x1b[1m拨号上网下载模拟器 - 单元测试\x1b[0m\n');

// ── formatSize ──
console.log('\x1b[36mformatSize:\x1b[0m');
assert(formatSize(0) === '0 B', '0 bytes');
assert(formatSize(512) === '512 B', '512 bytes');
assert(formatSize(1024) === '1.0 KB', '1 KB');
assert(formatSize(1536) === '1.5 KB', '1.5 KB');
assert(formatSize(1048576) === '1.0 MB', '1 MB');
assert(formatSize(681574400) === '650.0 MB', '650 MB (红色警戒2)');
assert(formatSize(83886080) === '80.0 MB', '80 MB (星际争霸)');
assert(formatSize(2097152) === '2.0 MB', '2 MB (扫雷)');
assert(formatSize(1073741824) === '1.00 GB', '1 GB');

// ── formatSpeed ──
console.log('\n\x1b[36mformatSpeed:\x1b[0m');
assert(formatSpeed(512) === '512.0 B/s', '512 B/s');
assert(formatSpeed(1024) === '1.0 KB/s', '1 KB/s');
assert(formatSpeed(3500) === '3.4 KB/s', '3.4 KB/s (typical 28.8K)');
assert(formatSpeed(6000) === '5.9 KB/s', '5.9 KB/s (typical 48K)');

// ── formatTime ──
console.log('\n\x1b[36mformatTime:\x1b[0m');
assert(formatTime(0) === '00:00:00', '0 seconds');
assert(formatTime(1000) === '00:00:01', '1 second');
assert(formatTime(60000) === '00:01:00', '1 minute');
assert(formatTime(3600000) === '01:00:00', '1 hour');
assert(formatTime(3661000) === '01:01:01', '1h 1m 1s');
assert(formatTime(86400000) === '24:00:00', '24 hours');

// ── 下载时间估算 ──
console.log('\n\x1b[36m下载时间估算:\x1b[0m');

// 56Kbps = 7000 Bytes/s 理论最大
const theoreticalMaxBytesPerSec = MODEM_SPEED_BPS / 8;
assert(theoreticalMaxBytesPerSec === 7000, '56Kbps理论最大 = 7000 B/s');

// 实际最大 = 48Kbps = 6000 B/s
const actualMaxBytesPerSec = ACTUAL_MAX_BPS / 8;
assert(actualMaxBytesPerSec === 6000, '实际最大 = 6000 B/s');

// 红色警戒2 (650MB) 在实际最大速度下需要的时间
const ra2Size = 681574400;
const ra2BestTime = ra2Size / actualMaxBytesPerSec; // seconds
const ra2BestHours = ra2BestTime / 3600;
assertApprox(ra2BestHours, 31.5, 1, '红警2最快下载时间约31.5小时');

// 扫雷 (2MB) 在实际最大速度下
const mineSize = 2097152;
const mineBestTime = mineSize / actualMaxBytesPerSec;
assertApprox(mineBestTime, 349, 5, '扫雷最快下载时间约349秒(~6分钟)');

// ── 电话费计算 ──
console.log('\n\x1b[36m电话费计算:\x1b[0m');

const ra2BillBest = (ra2BestTime / 60) * PHONE_RATE_PER_MIN;
assertApprox(ra2BillBest, 37.8, 1, '红警2最低电话费约37.8元');

const mineBill = (mineBestTime / 60) * PHONE_RATE_PER_MIN;
assertApprox(mineBill, 0.12, 0.02, '扫雷电话费约0.12元');

// ── 掉线概率 ──
console.log('\n\x1b[36m掉线概率(泊松过程):\x1b[0m');

// 30分钟内至少掉线一次的概率
const lambda30 = DISCONNECT_RATE * 1800; // = 1
const probNoDisconnect30 = Math.exp(-lambda30);
const probDisconnect30 = 1 - probNoDisconnect30;
assertApprox(probDisconnect30, 0.632, 0.01, '30分钟内掉线概率约63.2%');

// 红警2下载期间（31.5小时）期望掉线次数
const ra2ExpectedDisconnects = DISCONNECT_RATE * ra2BestTime;
assertApprox(ra2ExpectedDisconnects, 63, 2, '红警2期望掉线约63次');

// 扫雷下载期间期望掉线次数
const mineExpectedDisconnects = DISCONNECT_RATE * mineBestTime;
assertApprox(mineExpectedDisconnects, 0.19, 0.05, '扫雷期望掉线约0.19次');

// ── 连接失败率 ──
console.log('\n\x1b[36m连接失败率:\x1b[0m');
assert(CONNECT_FAIL_RATE === 0.15, '单次连接失败率 = 15%');

// 连续拨号 n 次全部失败的概率
const prob3Fails = Math.pow(CONNECT_FAIL_RATE, 3);
assertApprox(prob3Fails, 0.0034, 0.001, '连续3次拨号失败概率约0.34%');

// 期望拨号成功所需次数 = 1/(1-p)
const expectedDials = 1 / (1 - CONNECT_FAIL_RATE);
assertApprox(expectedDials, 1.176, 0.01, '期望拨号次数约1.18次');

// ── gaussianRandom 统计检验 ──
console.log('\n\x1b[36mgaussianRandom 分布检验:\x1b[0m');

const N = 10000;
let sum = 0, sumSq = 0;
for (let i = 0; i < N; i++) {
  const x = gaussianRandom();
  sum += x;
  sumSq += x * x;
}
const mean = sum / N;
const variance = sumSq / N - mean * mean;

assertApprox(mean, 0, 0.05, '均值接近0 (N=10000)');
assertApprox(variance, 1, 0.1, '方差接近1 (N=10000)');

// ── 速度波动范围 ──
console.log('\n\x1b[36m速度波动模拟:\x1b[0m');

const baseSpeed = ACTUAL_MAX_BPS / 8;
let minSpeed = Infinity, maxSpeed = 0;
for (let i = 0; i < 1000; i++) {
  const fluctuation = (gaussianRandom() * 0.2 + 1) * baseSpeed;
  const speed = Math.max(500, Math.min(ACTUAL_MAX_BPS / 8, fluctuation));
  minSpeed = Math.min(minSpeed, speed);
  maxSpeed = Math.max(maxSpeed, speed);
}
assert(minSpeed >= 500, '最低速度不低于 500 B/s');
assert(maxSpeed <= ACTUAL_MAX_BPS / 8, '最高速度不超过 ' + (ACTUAL_MAX_BPS / 8) + ' B/s');
assert(maxSpeed > 4000, '1000次模拟中出现过 >4KB/s 的速度');

// ── 与现代网速对比 ──
console.log('\n\x1b[36m与现代网速对比:\x1b[0m');

const modernSpeedBps = 100 * 1024 * 1024; // 100Mbps
const modernBytesPerSec = modernSpeedBps / 8;
const speedRatio = modernBytesPerSec / actualMaxBytesPerSec;
assertApprox(speedRatio, 2184, 50, '100Mbps是56K实际速度的约2184倍');

const ra2ModernTime = ra2Size / modernBytesPerSec;
assertApprox(ra2ModernTime, 52, 3, '红警2用100Mbps下载约52秒');

// ══════════ 结果 ══════════
console.log('\n' + '═'.repeat(40));
console.log('\x1b[1m结果: ' + passed + ' 通过, ' + failed + ' 失败\x1b[0m');
if (failed > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32m全部通过!\x1b[0m\n');
}
