/**
 * Paillier 同态加密引擎单元测试
 * 运行：node pages/homomorphic-encryption/engine.test.js
 */

var engine = require('./engine.js');
var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message);
  }
}

// ── 基础工具测试 ──

console.log('\n=== 基础数论工具 ===');

(function testModPow() {
  var r = engine.modPow(2n, 10n, 1000n);
  assert(r === 24n, '2^10 mod 1000 = 24');
})();

(function testGCD() {
  assert(engine.gcd(48n, 18n) === 6n, 'gcd(48, 18) = 6');
  assert(engine.gcd(17n, 31n) === 1n, 'gcd(17, 31) = 1');
})();

(function testLCM() {
  assert(engine.lcm(12n, 18n) === 36n, 'lcm(12, 18) = 36');
})();

(function testModInverse() {
  var inv = engine.modInverse(3n, 11n);
  assert((3n * inv) % 11n === 1n, 'modular inverse of 3 mod 11 exists');
})();

(function testExtendedGCD() {
  var r = engine.extendedGCD(240n, 46n);
  assert(r.gcd === 2n, 'extended gcd(240, 46) = 2');
  assert((240n * r.x + 46n * r.y) === r.gcd, 'bezout identity holds');
})();

// ── 素性测试 ──

console.log('\n=== Miller-Rabin 素性测试 ===');

(function testSmallPrimes() {
  assert(engine.millerRabin(2n, 5) === true, '2 is prime');
  assert(engine.millerRabin(3n, 5) === true, '3 is prime');
  assert(engine.millerRabin(5n, 5) === true, '5 is prime');
  assert(engine.millerRabin(4n, 5) === false, '4 is composite');
  assert(engine.millerRabin(9n, 5) === false, '9 is composite');
  assert(engine.millerRabin(15n, 5) === false, '15 is composite');
})();

(function testLargePrimes() {
  assert(engine.millerRabin(999999999989n, 10) === true, '999999999989 is prime');
  assert(engine.millerRabin(1000000000001n, 10) === false, '1000000000001 is composite');
})();

(function testGeneratePrime() {
  var p = engine.generatePrime(32);
  var bitLen = p.toString(2).length;
  assert(bitLen >= 31 && bitLen <= 32, '32-bit prime has around 32 bits (actual: ' + bitLen + ')');
  assert(engine.millerRabin(p, 20) === true, 'generated number passes Miller-Rabin');
})();

// ── Paillier 密钥生成 ──

console.log('\n=== Paillier 密钥生成 ===');

var keys;
(function testKeyGeneration() {
  keys = engine.generatePaillierKeys(128);
  assert(keys.publicKey.n > 1n, 'public key n is non-trivial');
  assert(keys.publicKey.g === keys.publicKey.n + 1n, 'g = n + 1 (optimization)');
  assert(keys.publicKey.nSquared === keys.publicKey.n * keys.publicKey.n, 'nSquared = n * n');
  assert(keys.privateKey.lambda > 0n, 'lambda is positive');
  assert(keys.privateKey.mu > 0n, 'mu is positive');
  var bitLen = keys.publicKey.n.toString(2).length;
  assert(bitLen >= 128, 'n has at least 128 bits (actual: ' + bitLen + ')');
})();

// ── 加密/解密正确性 ──

console.log('\n=== Paillier 加密/解密 ===');

(function testEncryptDecryptZero() {
  var c = engine.paillierEncrypt(0n, keys.publicKey);
  var m = engine.paillierDecrypt(c, keys.privateKey);
  assert(m === 0n, 'Enc(0) decrypts to 0');
})();

(function testEncryptDecryptPositive() {
  var original = 42n;
  var c = engine.paillierEncrypt(original, keys.publicKey);
  var m = engine.paillierDecrypt(c, keys.privateKey);
  assert(m === original, 'Enc(42) decrypts to 42');
})();

(function testEncryptDecryptLarge() {
  var original = 99999n;
  var c = engine.paillierEncrypt(original, keys.publicKey);
  var m = engine.paillierDecrypt(c, keys.privateKey);
  assert(m === original, 'Enc(99999) decrypts to 99999');
})();

(function testEncryptDecryptMultipleValues() {
  var values = [0n, 1n, 7n, 100n, 65535n, 1000000n];
  var allPass = true;
  for (var i = 0; i < values.length; i++) {
    var c = engine.paillierEncrypt(values[i], keys.publicKey);
    var m = engine.paillierDecrypt(c, keys.privateKey);
    if (m !== values[i]) allPass = false;
  }
  assert(allPass, 'multiple values encrypt/decrypt correctly');
})();

// ── 同态加法 ──

console.log('\n=== 同态加法 ===');

(function testHomomorphicAdd3plus5() {
  var c1 = engine.paillierEncrypt(3n, keys.publicKey);
  var c2 = engine.paillierEncrypt(5n, keys.publicKey);
  var cSum = engine.paillierAdd(c1, c2, keys.publicKey.nSquared);
  var sum = engine.paillierDecrypt(cSum, keys.privateKey);
  assert(sum === 8n, 'Enc(3) + Enc(5) => Dec = 8');
})();

(function testHomomorphicAddLarge() {
  var c1 = engine.paillierEncrypt(12345n, keys.publicKey);
  var c2 = engine.paillierEncrypt(67890n, keys.publicKey);
  var cSum = engine.paillierAdd(c1, c2, keys.publicKey.nSquared);
  var sum = engine.paillierDecrypt(cSum, keys.privateKey);
  assert(sum === 80235n, 'Enc(12345) + Enc(67890) => Dec = 80235');
})();

(function testHomomorphicAddZero() {
  var c1 = engine.paillierEncrypt(0n, keys.publicKey);
  var c2 = engine.paillierEncrypt(100n, keys.publicKey);
  var cSum = engine.paillierAdd(c1, c2, keys.publicKey.nSquared);
  var sum = engine.paillierDecrypt(cSum, keys.privateKey);
  assert(sum === 100n, 'Enc(0) + Enc(100) => Dec = 100');
})();

// ── 同态标量乘法 ──

console.log('\n=== 同态标量乘法 ===');

(function testScalarMultiply() {
  var c = engine.paillierEncrypt(7n, keys.publicKey);
  var cMul = engine.paillierScalarMultiply(c, 3n, keys.publicKey.nSquared);
  var result = engine.paillierDecrypt(cMul, keys.privateKey);
  assert(result === 21n, 'Enc(7) * 3 => Dec = 21');
})();

(function testScalarMultiplyZero() {
  var c = engine.paillierEncrypt(50n, keys.publicKey);
  var cMul = engine.paillierScalarMultiply(c, 0n, keys.publicKey.nSquared);
  var result = engine.paillierDecrypt(cMul, keys.privateKey);
  assert(result === 0n, 'Enc(50) * 0 => Dec = 0');
})();

// ── 密文随机性 ──

console.log('\n=== 密文随机性（概率加密） ===');

(function testProbabilisticEncryption() {
  var c1 = engine.paillierEncrypt(100n, keys.publicKey);
  var c2 = engine.paillierEncrypt(100n, keys.publicKey);
  assert(c1 !== c2, '同一明文两次加密产生不同密文');
})();

// ── 随机提示 ──

console.log('\n=== 随机提示语 ===');

(function testRandomTip() {
  var tip = engine.randomTip();
  assert(typeof tip === 'string' && tip.length > 0, 'randomTip returns non-empty string');
})();

// ── 总结 ──

console.log('\n========================================');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
