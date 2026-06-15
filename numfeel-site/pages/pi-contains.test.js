// 测试文件：π 包含一切 — 核心算法测试
const {
  searchInPiDecimal,
  probabilityOfFinding,
  expectedPosition,
  evaluateLuck,
  formatLargeNumber,
  bankPasswordStats,
  expectedOccurrences,
  stringToBytes,
  searchByteInPiHex,
  pifsMetadataOverhead
} = require('./pi-contains/engine.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n🧪 π 包含一切 - 核心算法测试\n');

// --- searchInPiDecimal ---
console.log('--- searchInPiDecimal ---');
// π = 3.14159265358979323846...
const piSample = '14159265358979323846264338327950288419716939937510';

assert(searchInPiDecimal(piSample, '14159') === 1, '找到 14159 在位置 1');
// piSample = '14159265358979323846264338327950288419716939937510'
// indexOf('2653') = 4, +1 = 5 → 实际 '1415[9265]...' indexOf('2653')=?
// 实际: 1-4-1-5-9-2-6-5-3... 位置5是'9', '2653'在哪？让我们验证
const pos2653 = piSample.indexOf('2653');
assert(searchInPiDecimal(piSample, '2653') === pos2653 + 1, `找到 2653 在位置 ${pos2653 + 1}`);
assert(searchInPiDecimal(piSample, '9999999') === -1, '找不到 9999999 返回 -1');
assert(searchInPiDecimal(piSample, '1') === 1, '单个数字 1 在位置 1');
// π小数位: 1415926535897932384626433832795028841971...
// 第一个0出现在哪？ piSample[29]='5', [30]='0'... 让我们用indexOf确认
const pos0 = piSample.indexOf('0');
assert(searchInPiDecimal(piSample, '0') === pos0 + 1, `数字 0 首次出现在位置 ${pos0 + 1}`);
assert(searchInPiDecimal('', '123') === -1, '空字符串搜索返回 -1');
assert(searchInPiDecimal(piSample, '') === 1, '空序列搜索返回 1（indexOf 行为）');

// --- probabilityOfFinding ---
console.log('--- probabilityOfFinding ---');
const p4 = probabilityOfFinding(1000000, 4);
assert(p4 > 0.99, `4位在100万位中概率>99%: ${(p4 * 100).toFixed(2)}%`);

const p6 = probabilityOfFinding(1000000, 6);
assert(p6 > 0.5 && p6 < 0.8, `6位在100万位中概率在50%-80%: ${(p6 * 100).toFixed(2)}%`);

const p8 = probabilityOfFinding(1000000, 8);
assert(p8 < 0.05, `8位在100万位中概率<5%: ${(p8 * 100).toFixed(4)}%`);

assert(probabilityOfFinding(100, 200) === 0, '序列比总长度还长时概率为0');
assert(probabilityOfFinding(1000000, 0) === 0, '长度0时概率为0');
assert(probabilityOfFinding(10, 1) > 0.6, '1位在10位中概率较高');

// 随位数增加概率单调递增
const p6_1k = probabilityOfFinding(1000, 6);
const p6_10k = probabilityOfFinding(10000, 6);
const p6_100k = probabilityOfFinding(100000, 6);
assert(p6_1k < p6_10k && p6_10k < p6_100k, '概率随位数增加单调递增');

// --- expectedPosition ---
console.log('--- expectedPosition ---');
assert(expectedPosition(1) === 10, '1位期望位置=10');
assert(expectedPosition(4) === 10000, '4位期望位置=10000');
assert(expectedPosition(6) === 1000000, '6位期望位置=1000000');
assert(expectedPosition(10) === 10000000000, '10位期望位置=10^10');

// --- evaluateLuck ---
console.log('--- evaluateLuck ---');
const luck1 = evaluateLuck(500, 6); // 期望 10^6，实际 500
assert(luck1.ratio < 0.01, `位置500找到6位序列非常幸运: ratio=${luck1.ratio}`);
assert(luck1.luck === '极其幸运', `luck评价为极其幸运: ${luck1.luck}`);
assert(luck1.percentile < 5, `百分位很低: ${luck1.percentile}%`);

const luck2 = evaluateLuck(1000000, 6); // 恰好等于期望
assert(luck2.ratio >= 0.9 && luck2.ratio <= 1.1, `期望位置ratio≈1: ${luck2.ratio}`);
assert(luck2.luck === '正常水平', `luck评价为正常水平: ${luck2.luck}`);

const luck3 = evaluateLuck(5000000, 6); // 远超期望
assert(luck3.ratio > 3, `位置500万ratio>3: ${luck3.ratio}`);
assert(luck3.luck === '位置较深', `luck评价为位置较深: ${luck3.luck}`);

// --- formatLargeNumber ---
console.log('--- formatLargeNumber ---');
assert(formatLargeNumber(1000) === '1,000', '1000格式化');
assert(formatLargeNumber(15000) === '1.5万', '15000→1.5万');
assert(formatLargeNumber(100000000) === '1.0亿', '1亿→1.0亿');
assert(formatLargeNumber(2500000000000) === '2.5万亿', '2.5万亿');

// --- bankPasswordStats ---
console.log('--- bankPasswordStats ---');
const stats = bankPasswordStats(1000000);
assert(stats.totalPasswords === 1000000, '6位密码共100万种');
assert(stats.avgOccurrences === 1, '100万位中每个6位序列平均出现1次');
assert(stats.probabilityFound > 0.5, '找到概率>50%');

const stats2 = bankPasswordStats(105e12);
assert(stats2.avgOccurrences === 105000000, '105万亿位中每个6位密码出现约1.05亿次');

// --- expectedOccurrences ---
console.log('--- expectedOccurrences ---');
const occ4 = expectedOccurrences(1000000, 4);
assert(Math.abs(occ4 - 100) < 1, `4位在100万位中约出现100次: ${occ4.toFixed(1)}`);

const occ6 = expectedOccurrences(1000000, 6);
assert(Math.abs(occ6 - 1) < 0.01, `6位在100万位中约出现1次: ${occ6.toFixed(3)}`);

const occ11 = expectedOccurrences(1000000, 11);
assert(occ11 < 0.001, `11位在100万位中几乎不出现: ${occ11.toExponential(2)}`);

// --- stringToBytes ---
console.log('--- stringToBytes ---');
const bytes1 = stringToBytes('A');
assert(bytes1.length === 1 && bytes1[0] === 65, 'A → [65]');

const bytes2 = stringToBytes('Hello');
assert(bytes2.length === 5, 'Hello → 5字节');
assert(bytes2[0] === 72 && bytes2[4] === 111, 'H=72, o=111');

const bytes3 = stringToBytes('你');
assert(bytes3.length === 3, '中文"你"→ 3字节 (UTF-8)');

// --- searchByteInPiHex ---
console.log('--- searchByteInPiHex ---');
const hexSample = '243f6a8885a308d31319';
assert(searchByteInPiHex(hexSample, '24') === 1, '找到 24 在位置 1');
assert(searchByteInPiHex(hexSample, '3f') === 3, '找到 3f 在位置 3');
assert(searchByteInPiHex(hexSample, 'ff') === -1, '找不到 ff 返回 -1');
assert(searchByteInPiHex(hexSample, '6a') === 5, '找到 6a 在位置 5');

// --- pifsMetadataOverhead ---
console.log('--- pifsMetadataOverhead ---');
const entries = [{ position: 100 }, { position: 200 }, { position: 50 }];
const overhead = pifsMetadataOverhead(entries);
assert(overhead.dataBytes === 3, '3个字节的原始数据');
assert(overhead.metadataBytes === 12, '3×4=12字节元数据');
assert(overhead.ratio === 4, '元数据是数据的4倍');

const emptyOverhead = pifsMetadataOverhead([]);
assert(emptyOverhead.ratio === 0, '空数据ratio=0');

// --- 综合验证：6位密码确实大概率可找到 ---
console.log('--- 综合验证 ---');
// 在正规数假设下，π 的前100万位约有63.2%的概率包含任意给定的6位数
const theoretical = 1 - Math.exp(-(1000000 - 5) * 1e-6);
const computed = probabilityOfFinding(1000000, 6);
assert(Math.abs(theoretical - computed) < 0.001, `理论值与计算值一致: ${theoretical.toFixed(4)} vs ${computed.toFixed(4)}`);

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
