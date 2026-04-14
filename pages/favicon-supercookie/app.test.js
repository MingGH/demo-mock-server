/**
 * Favicon 超级 Cookie — 单元测试
 * 运行命令: node pages/favicon-supercookie/app.test.js
 */

const {
  numToBits,
  bitsToNum,
  generateSubdomains,
  encodeFaviconId,
  decodeFaviconId,
  maxUsers,
  formatNumber,
  simulateClearBrowsingData,
  simulateIncognitoMode,
} = require('./app.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}  (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)})`);
    failed++;
  }
}

// ===== 测试 numToBits =====
console.log('\n测试1: numToBits — 数字转二进制数组');
assertEq(numToBits(0, 8), [0,0,0,0,0,0,0,0], '0 → 8位全0');
assertEq(numToBits(255, 8), [1,1,1,1,1,1,1,1], '255 → 8位全1');
assertEq(numToBits(1, 4), [0,0,0,1], '1 → 4位');
assertEq(numToBits(10, 4), [1,0,1,0], '10 → 1010');
assertEq(numToBits(42, 8), [0,0,1,0,1,0,1,0], '42 → 00101010');
assertEq(numToBits(65535, 16), Array(16).fill(1), '65535 → 16位全1');

// ===== 测试 bitsToNum =====
console.log('\n测试2: bitsToNum — 二进制数组转数字');
assertEq(bitsToNum([0,0,0,0]), 0, '[0,0,0,0] → 0');
assertEq(bitsToNum([1,1,1,1]), 15, '[1,1,1,1] → 15');
assertEq(bitsToNum([1,0,1,0]), 10, '[1,0,1,0] → 10');
assertEq(bitsToNum([0,0,1,0,1,0,1,0]), 42, '[0,0,1,0,1,0,1,0] → 42');
assertEq(bitsToNum(Array(16).fill(1)), 65535, '16位全1 → 65535');
assertEq(bitsToNum(Array(32).fill(1)), 4294967295, '32位全1 → 4294967295');

// ===== 测试往返 =====
console.log('\n测试3: numToBits ↔ bitsToNum 往返');
const testValues = [0, 1, 127, 128, 255, 256, 1000, 42, 65535, 12345];
for (const v of testValues) {
  const bits = numToBits(v, 16);
  const recovered = bitsToNum(bits);
  assertEq(recovered, v, `${v} → bits → ${recovered}`);
}

// ===== 测试 generateSubdomains =====
console.log('\n测试4: generateSubdomains');
const subs = generateSubdomains('tracker.com', 4);
assertEq(subs.length, 4, '生成4个子域名');
assertEq(subs[0], 'bit0.tracker.com', '第0个子域名');
assertEq(subs[3], 'bit3.tracker.com', '第3个子域名');

// ===== 测试 encodeFaviconId =====
console.log('\n测试5: encodeFaviconId — 编码追踪 ID');
const encoded = encodeFaviconId(10, 4); // 10 = 1010
assertEq(encoded.length, 4, '4位 → 4个子域名');
assertEq(encoded[0].cached, true, 'bit0 = 1 (缓存)');
assertEq(encoded[1].cached, false, 'bit1 = 0 (无缓存)');
assertEq(encoded[2].cached, true, 'bit2 = 1 (缓存)');
assertEq(encoded[3].cached, false, 'bit3 = 0 (无缓存)');

// ===== 测试 decodeFaviconId =====
console.log('\n测试6: decodeFaviconId — 解码追踪 ID');
assertEq(decodeFaviconId([true, false, true, false]), 10, '[T,F,T,F] → 10');
assertEq(decodeFaviconId([false, false, false, false]), 0, '全false → 0');
assertEq(decodeFaviconId([true, true, true, true]), 15, '全true → 15');

// ===== 测试编码-解码往返 =====
console.log('\n测试7: encode → decode 往返');
for (const v of [0, 1, 7, 15, 42, 255, 1000, 65535]) {
  const bits = v <= 15 ? 4 : v <= 255 ? 8 : 16;
  const enc = encodeFaviconId(v, bits);
  const cacheHits = enc.map(e => e.cached);
  const decoded = decodeFaviconId(cacheHits);
  assertEq(decoded, v, `encode(${v}, ${bits}) → decode → ${decoded}`);
}

// ===== 测试 maxUsers =====
console.log('\n测试8: maxUsers');
assertEq(maxUsers(1), 2, '1位 → 2');
assertEq(maxUsers(8), 256, '8位 → 256');
assertEq(maxUsers(16), 65536, '16位 → 65536');
assertEq(maxUsers(32), 4294967296, '32位 → 4294967296');

// ===== 测试 simulateClearBrowsingData =====
console.log('\n测试9: simulateClearBrowsingData — F-Cache 存活');
const beforeClear = { cookie: true, localStorage: true, sessionStorage: true, fcache: true };
const afterClear = simulateClearBrowsingData(beforeClear);
assertEq(afterClear.cookie, false, 'Cookie 被清除');
assertEq(afterClear.localStorage, false, 'LocalStorage 被清除');
assertEq(afterClear.sessionStorage, false, 'SessionStorage 被清除');
assertEq(afterClear.fcache, true, 'F-Cache 存活！');

// ===== 测试 simulateIncognitoMode =====
console.log('\n测试10: simulateIncognitoMode — 无痕模式下 F-Cache 存活');
const incognitoResult = simulateIncognitoMode({ cookie: true, localStorage: true, sessionStorage: true, fcache: true });
assertEq(incognitoResult.cookie, false, '无痕模式 Cookie 清除');
assertEq(incognitoResult.fcache, true, '无痕模式 F-Cache 存活！');

// ===== 测试 formatNumber =====
console.log('\n测试11: formatNumber');
assert(formatNumber(1000).includes('1'), '1000 格式化包含1');
assert(formatNumber(4294967296).length > 4, '大数字格式化');

// ===== 测试边界情况 =====
console.log('\n测试12: 边界情况');
assertEq(numToBits(0, 1), [0], '0 → 1位');
assertEq(numToBits(1, 1), [1], '1 → 1位');
assertEq(bitsToNum([]), 0, '空数组 → 0');
assertEq(bitsToNum([0]), 0, '[0] → 0');
assertEq(bitsToNum([1]), 1, '[1] → 1');

// ===== 结果 =====
console.log('\n' + '='.repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('✗ 部分测试失败');
  process.exit(1);
} else {
  console.log('✓ 所有测试通过！');
  process.exit(0);
}
