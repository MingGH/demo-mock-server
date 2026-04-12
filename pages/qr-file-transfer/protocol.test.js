/**
 * 二维码文件传输协议测试
 * 运行: node pages/qr-file-transfer/protocol.test.js
 */

const {
  QFT_VERSION,
  QFT_PREFIX,
  calcChecksum,
  encodeFile,
  decodePacket,
  mergeChunks,
  uint8ArrayToBase64,
  base64ToUint8Array,
  formatFileSize
} = require('./protocol.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg = '') {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

// ========== 测试用例 ==========

test('calcChecksum 返回一致的校验码', () => {
  const data = 'Hello World';
  const checksum1 = calcChecksum(data);
  const checksum2 = calcChecksum(data);
  assertEqual(checksum1, checksum2, '相同数据应返回相同校验码');
  assertTrue(checksum1.length <= 6, '校验码长度应 <= 6');
});

test('calcChecksum 不同数据返回不同校验码', () => {
  const checksum1 = calcChecksum('Hello');
  const checksum2 = calcChecksum('World');
  assertTrue(checksum1 !== checksum2, '不同数据应返回不同校验码');
});

test('uint8ArrayToBase64 和 base64ToUint8Array 互逆', () => {
  const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const base64 = uint8ArrayToBase64(original);
  const decoded = base64ToUint8Array(base64);
  
  assertEqual(decoded.length, original.length, '长度应相等');
  for (let i = 0; i < original.length; i++) {
    assertEqual(decoded[i], original[i], `字节 ${i} 应相等`);
  }
});

test('encodeFile 生成正确数量的分片', () => {
  const data = new Uint8Array(100).fill(65); // 100 个 'A'
  const buffer = data.buffer;
  const chunks = encodeFile(buffer, 'test.txt', 50);
  
  // Base64 膨胀约 4/3，100 字节 -> ~134 字符，分片大小 50 -> 3 个分片
  assertTrue(chunks.length >= 2, '应至少有 2 个分片');
  assertTrue(chunks.length <= 5, '不应超过 5 个分片');
});

test('encodeFile 分片格式正确', () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const buffer = data.buffer;
  const chunks = encodeFile(buffer, 'test.bin', 100);
  
  assertTrue(chunks.length >= 1, '应至少有 1 个分片');
  assertTrue(chunks[0].startsWith('QFT|'), '应以 QFT| 开头');
  
  const parts = chunks[0].split('|');
  assertEqual(parts[0], 'QFT', '前缀应为 QFT');
  assertEqual(parts[1], '1', '版本应为 1');
  assertEqual(parts[2], 'test.bin', '文件名应正确');
});

test('decodePacket 解析正确的数据包', () => {
  const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const buffer = data.buffer;
  const chunks = encodeFile(buffer, 'hello.txt', 100);
  
  const packet = decodePacket(chunks[0]);
  assertTrue(packet !== null, '应能解析');
  assertEqual(packet.fileName, 'hello.txt', '文件名应正确');
  assertEqual(packet.index, 0, '索引应为 0');
  assertEqual(packet.version, 1, '版本应为 1');
});

test('decodePacket 拒绝无效数据', () => {
  assertEqual(decodePacket(null), null, '应拒绝 null');
  assertEqual(decodePacket(''), null, '应拒绝空字符串');
  assertEqual(decodePacket('invalid'), null, '应拒绝无效格式');
  assertEqual(decodePacket('QFT|1'), null, '应拒绝不完整数据');
});

test('decodePacket 检测校验码错误', () => {
  // 构造一个校验码错误的数据包
  const packet = 'QFT|1|test.txt|1|0|wrongchecksum|SGVsbG8=';
  const result = decodePacket(packet);
  assertTrue(result !== null, '应返回结果');
  assertEqual(result.error, 'checksum_mismatch', '应检测到校验码错误');
});

test('mergeChunks 正确合并分片', () => {
  const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const buffer = original.buffer;
  const chunks = encodeFile(buffer, 'test.bin', 5);
  
  // 解析所有分片
  const chunkMap = new Map();
  let totalChunks = 0;
  
  for (const chunk of chunks) {
    const packet = decodePacket(chunk);
    assertTrue(packet !== null && !packet.error, '分片应能正确解析');
    chunkMap.set(packet.index, packet.data);
    totalChunks = packet.totalChunks;
  }
  
  // 合并
  const merged = mergeChunks(chunkMap, totalChunks);
  assertTrue(merged !== null, '应能合并');
  assertEqual(merged.length, original.length, '长度应相等');
  
  for (let i = 0; i < original.length; i++) {
    assertEqual(merged[i], original[i], `字节 ${i} 应相等`);
  }
});

test('mergeChunks 缺少分片时返回 null', () => {
  const chunkMap = new Map();
  chunkMap.set(0, 'data0');
  chunkMap.set(2, 'data2'); // 缺少 1
  
  const result = mergeChunks(chunkMap, 3);
  assertEqual(result, null, '缺少分片时应返回 null');
});

test('formatFileSize 格式化正确', () => {
  assertEqual(formatFileSize(500), '500 B', '字节');
  assertEqual(formatFileSize(1024), '1.0 KB', '1KB');
  assertEqual(formatFileSize(1536), '1.5 KB', '1.5KB');
  assertEqual(formatFileSize(1048576), '1.00 MB', '1MB');
  assertEqual(formatFileSize(1572864), '1.50 MB', '1.5MB');
});

test('完整流程：编码 -> 解码 -> 合并', () => {
  // 模拟一个小文件
  const content = 'Hello, this is a test file for QR code transfer!';
  const encoder = new TextEncoder();
  const original = encoder.encode(content);
  
  // 编码
  const chunks = encodeFile(original.buffer, 'message.txt', 20);
  assertTrue(chunks.length > 0, '应生成分片');
  
  // 模拟接收端：解码所有分片
  const received = new Map();
  let fileName = null;
  let totalChunks = 0;
  
  for (const chunk of chunks) {
    const packet = decodePacket(chunk);
    assertTrue(packet !== null && !packet.error, '分片应能解析');
    
    if (!fileName) {
      fileName = packet.fileName;
      totalChunks = packet.totalChunks;
    }
    
    received.set(packet.index, packet.data);
  }
  
  assertEqual(fileName, 'message.txt', '文件名应正确');
  assertEqual(received.size, totalChunks, '应收到所有分片');
  
  // 合并
  const merged = mergeChunks(received, totalChunks);
  assertTrue(merged !== null, '应能合并');
  
  // 验证内容
  const decoder = new TextDecoder();
  const decoded = decoder.decode(merged);
  assertEqual(decoded, content, '内容应完全一致');
});

test('乱序接收分片也能正确合并', () => {
  const content = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const encoder = new TextEncoder();
  const original = encoder.encode(content);
  
  const chunks = encodeFile(original.buffer, 'alphabet.txt', 10);
  
  // 打乱顺序
  const shuffled = [...chunks].sort(() => Math.random() - 0.5);
  
  // 接收
  const received = new Map();
  let totalChunks = 0;
  
  for (const chunk of shuffled) {
    const packet = decodePacket(chunk);
    received.set(packet.index, packet.data);
    totalChunks = packet.totalChunks;
  }
  
  // 合并
  const merged = mergeChunks(received, totalChunks);
  const decoder = new TextDecoder();
  const decoded = decoder.decode(merged);
  
  assertEqual(decoded, content, '乱序接收后内容应正确');
});

// ========== 结果 ==========
console.log('\n' + '='.repeat(40));
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
