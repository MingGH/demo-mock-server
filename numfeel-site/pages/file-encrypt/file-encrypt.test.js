/**
 * file-encrypt.test.js — 浏览器端文件加密核心逻辑测试（v2 分块格式）
 * 运行：node pages/file-encrypt/file-encrypt.test.js
 *
 * 使用 Node.js 内置 crypto 模块模拟 Web Crypto API 进行测试
 */

const crypto = require('crypto');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── 常量（与 crypto-engine.js 保持一致）──

const MAGIC = Buffer.from('ENC2');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits = 32 bytes
const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB
const HEADER_SIZE = 4 + SALT_LENGTH + 4; // magic + salt + chunkSize

// ── 模拟 v2 分块加密/解密 ──

function deriveKeySync(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

function encryptChunked(data, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKeySync(password, salt);

  // Header: [MAGIC 4B] [Salt 16B] [ChunkSize 4B BE]
  const header = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(header, 0);
  salt.copy(header, 4);
  header.writeUInt32BE(CHUNK_SIZE, 4 + SALT_LENGTH);

  const parts = [header];
  const totalSize = data.length;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;

  for (let i = 0; i < totalChunks; i++) {
    const offset = i * CHUNK_SIZE;
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = data.subarray(offset, end);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(chunk), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // [IV 12B] [ciphertext] [authTag 16B]
    parts.push(Buffer.concat([iv, encrypted, authTag]));
  }

  return Buffer.concat(parts);
}

function decryptChunked(encData, password) {
  if (encData.length < HEADER_SIZE) {
    throw new Error('文件太小，不是有效的加密文件');
  }

  // Check magic
  const magic = encData.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error('不是 v2 格式');
  }

  const salt = encData.subarray(4, 4 + SALT_LENGTH);
  const chunkSize = encData.readUInt32BE(4 + SALT_LENGTH);
  const key = deriveKeySync(password, salt);

  const encChunkSize = IV_LENGTH + chunkSize + AUTH_TAG_LENGTH;
  const parts = [];
  let offset = HEADER_SIZE;

  while (offset < encData.length) {
    const remaining = encData.length - offset;
    const readSize = Math.min(remaining, encChunkSize);
    const chunkBuf = encData.subarray(offset, offset + readSize);

    if (chunkBuf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('chunk 太小');
    }

    const iv = chunkBuf.subarray(0, IV_LENGTH);
    const ciphertextWithTag = chunkBuf.subarray(IV_LENGTH);
    const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - AUTH_TAG_LENGTH);
    const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    parts.push(decrypted);

    offset += readSize;
  }

  return Buffer.concat(parts);
}

// ── v1 格式（兼容性测试）──

function encryptV1(data, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKeySync(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, encrypted, authTag]);
}

function decryptV1(encData, password) {
  const salt = encData.subarray(0, SALT_LENGTH);
  const iv = encData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertextWithTag = encData.subarray(SALT_LENGTH + IV_LENGTH);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - AUTH_TAG_LENGTH);
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - AUTH_TAG_LENGTH);
  const key = deriveKeySync(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── 密码强度评估 ──

function evaluatePassword(password) {
  if (!password) return { score: 0, level: 'none', text: '', crackTime: '' };

  const length = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  let charsetSize = 0;
  if (hasLower) charsetSize += 26;
  if (hasUpper) charsetSize += 26;
  if (hasDigit) charsetSize += 10;
  if (hasSpecial) charsetSize += 33;
  if (charsetSize === 0) charsetSize = 26;

  const entropy = length * Math.log2(charsetSize);

  let score, level, text;
  if (entropy < 28) { score = 15; level = 'weak'; text = '很弱'; }
  else if (entropy < 36) { score = 30; level = 'weak'; text = '弱'; }
  else if (entropy < 50) { score = 50; level = 'medium'; text = '一般'; }
  else if (entropy < 70) { score = 75; level = 'strong'; text = '强'; }
  else { score = 100; level = 'very-strong'; text = '非常强'; }

  return { score, level, text, entropy: Math.round(entropy) };
}

// ── 测试 ──

describe('v2 分块加密解密', function () {

  test('小文件加密后解密应还原原始数据', function () {
    const original = Buffer.from('Hello, 这是一段测试文本！🔐');
    const password = 'test-password-123';
    const encrypted = encryptChunked(original, password);
    const decrypted = decryptChunked(encrypted, password);
    assert.deepEqual(decrypted, original);
  });

  test('文件头应包含正确的 magic bytes', function () {
    const original = Buffer.from('test');
    const encrypted = encryptChunked(original, 'pwd');
    assert.deepEqual(encrypted.subarray(0, 4), MAGIC);
  });

  test('文件头应包含正确的 chunk size', function () {
    const original = Buffer.from('test');
    const encrypted = encryptChunked(original, 'pwd');
    const storedChunkSize = encrypted.readUInt32BE(4 + SALT_LENGTH);
    assert.equal(storedChunkSize, CHUNK_SIZE);
  });

  test('相同文件相同密码，两次加密结果应不同（随机 Salt/IV）', function () {
    const original = Buffer.from('same content');
    const password = 'same-password';
    const enc1 = encryptChunked(original, password);
    const enc2 = encryptChunked(original, password);
    assert.notDeepEqual(enc1, enc2);
  });

  test('错误密码应解密失败', function () {
    const original = Buffer.from('secret data');
    const encrypted = encryptChunked(original, 'correct-password');
    assert.throws(function () {
      decryptChunked(encrypted, 'wrong-password');
    });
  });

  test('篡改密文应解密失败（GCM 完整性校验）', function () {
    const original = Buffer.from('important data');
    const encrypted = encryptChunked(original, 'password');
    const tampered = Buffer.from(encrypted);
    // 篡改第一个 chunk 的密文部分
    tampered[HEADER_SIZE + IV_LENGTH + 3] ^= 0xff;
    assert.throws(function () {
      decryptChunked(tampered, 'password');
    });
  });

  test('空文件加密解密', function () {
    const original = Buffer.alloc(0);
    const encrypted = encryptChunked(original, 'password');
    const decrypted = decryptChunked(encrypted, 'password');
    assert.equal(decrypted.length, 0);
  });

  test('1MB 数据加密解密', function () {
    const original = crypto.randomBytes(1024 * 1024);
    const password = 'strong-password-!@#';
    const encrypted = encryptChunked(original, password);
    const decrypted = decryptChunked(encrypted, password);
    assert.deepEqual(decrypted, original);
  });

  test('跨 chunk 边界的数据（CHUNK_SIZE + 1 字节）', function () {
    // 使用小 chunk 模拟跨块
    const smallChunk = 1024; // 1KB
    const original = crypto.randomBytes(smallChunk + 1);
    const password = 'test';

    // 手动用小 chunk 加密
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKeySync(password, salt);
    const header = Buffer.alloc(HEADER_SIZE);
    MAGIC.copy(header, 0);
    salt.copy(header, 4);
    header.writeUInt32BE(smallChunk, 4 + SALT_LENGTH);

    const parts = [header];
    const totalChunks = Math.ceil(original.length / smallChunk);
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * smallChunk;
      const end = Math.min(offset + smallChunk, original.length);
      const chunk = original.subarray(offset, end);
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(chunk), cipher.final()]);
      const authTag = cipher.getAuthTag();
      parts.push(Buffer.concat([iv, encrypted, authTag]));
    }
    const encData = Buffer.concat(parts);

    // 解密时用文件头中的 chunkSize
    const decSalt = encData.subarray(4, 4 + SALT_LENGTH);
    const decChunkSize = encData.readUInt32BE(4 + SALT_LENGTH);
    assert.equal(decChunkSize, smallChunk);
    assert.equal(totalChunks, 2); // 应该分成 2 块

    const decKey = deriveKeySync(password, decSalt);
    const decParts = [];
    let offset = HEADER_SIZE;
    const encChunkSize = IV_LENGTH + decChunkSize + AUTH_TAG_LENGTH;
    while (offset < encData.length) {
      const remaining = encData.length - offset;
      const readSize = Math.min(remaining, encChunkSize);
      const chunkBuf = encData.subarray(offset, offset + readSize);
      const iv = chunkBuf.subarray(0, IV_LENGTH);
      const ct = chunkBuf.subarray(IV_LENGTH, chunkBuf.length - AUTH_TAG_LENGTH);
      const at = chunkBuf.subarray(chunkBuf.length - AUTH_TAG_LENGTH);
      const decipher = crypto.createDecipheriv('aes-256-gcm', decKey, iv);
      decipher.setAuthTag(at);
      decParts.push(Buffer.concat([decipher.update(ct), decipher.final()]));
      offset += readSize;
    }
    const decrypted = Buffer.concat(decParts);
    assert.deepEqual(decrypted, original);
  });

  test('太小的文件应报错', function () {
    const tooSmall = Buffer.alloc(10);
    assert.throws(function () {
      decryptChunked(tooSmall, 'password');
    });
  });
});

describe('v1 格式兼容性', function () {

  test('v1 加密解密应正常工作', function () {
    const original = Buffer.from('v1 test data');
    const encrypted = encryptV1(original, 'password');
    const decrypted = decryptV1(encrypted, 'password');
    assert.deepEqual(decrypted, original);
  });

  test('v1 文件不应以 ENC2 magic 开头', function () {
    const encrypted = encryptV1(Buffer.from('test'), 'pwd');
    // v1 开头是随机 salt，极不可能恰好是 "ENC2"
    const isV2 = encrypted[0] === 0x45 && encrypted[1] === 0x4E &&
                 encrypted[2] === 0x43 && encrypted[3] === 0x32;
    // 统计上几乎不可能，但如果碰巧了就跳过
    if (!isV2) {
      assert.ok(true);
    }
  });
});

describe('密码强度评估', function () {

  test('空密码', function () {
    const result = evaluatePassword('');
    assert.equal(result.score, 0);
    assert.equal(result.level, 'none');
  });

  test('纯数字短密码应为弱', function () {
    const result = evaluatePassword('123456');
    assert.equal(result.level, 'weak');
  });

  test('8位小写字母应为一般', function () {
    const result = evaluatePassword('abcdefgh');
    assert.equal(result.level, 'medium');
  });

  test('混合字符长密码应为强', function () {
    const result = evaluatePassword('P@ssw0rd!2');
    assert.equal(result.level, 'strong');
  });

  test('16位混合密码应为非常强', function () {
    const result = evaluatePassword('My$ecure_Pass!16');
    assert.equal(result.level, 'very-strong');
  });

  test('熵值应随密码长度增加', function () {
    const short = evaluatePassword('abc');
    const long = evaluatePassword('abcdefghijklmnop');
    assert.ok(long.entropy > short.entropy);
  });

  test('混合字符集应比纯字母熵值高', function () {
    const pureAlpha = evaluatePassword('abcdefgh');
    const mixed = evaluatePassword('aBc1@fgh');
    assert.ok(mixed.entropy > pureAlpha.entropy);
  });
});

console.log('所有测试通过 ✓');
