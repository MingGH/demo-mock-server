/**
 * 百万富翁问题实验室 - 引擎单元测试
 * 运行：node pages/millionaire-problem/engine.test.js
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

// ══════════════════════════════════════════
// 基础工具
// ══════════════════════════════════════════

console.log('\n=== 基础数论工具 ===');

(function testModPow() {
  assert(engine.mpModPow(2n, 10n, 1000n) === 24n, '2^10 mod 1000 = 24');
})();

(function testGCD() {
  assert(engine.mpGcd(48n, 18n) === 6n, 'gcd(48,18)=6');
  assert(engine.mpGcd(17n, 31n) === 1n, 'gcd(17,31)=1');
})();

(function testLCM() {
  assert(engine.mpLcm(12n, 18n) === 36n, 'lcm(12,18)=36');
})();

(function testModInverse() {
  var inv = engine.mpModInverse(3n, 11n);
  assert((3n * inv) % 11n === 1n, '3 * inv(3, 11) ≡ 1 mod 11');
})();

// ══════════════════════════════════════════
// 密钥生成
// ══════════════════════════════════════════

console.log('\n=== Paillier 密钥生成 ===');

var keys;
(function testKeyGeneration() {
  keys = engine.mpGenerateKeys(128);
  assert(keys.publicKey.n > 1n, '公钥 n 非平凡');
  assert(keys.publicKey.g === keys.publicKey.n + 1n, 'g = n+1');
  assert(keys.publicKey.nSquared === keys.publicKey.n * keys.publicKey.n, 'n² 正确');
  var bitLen = keys.publicKey.n.toString(2).length;
  assert(bitLen >= 128, 'n 至少 128 位（实际 ' + bitLen + '）');
})();

// ══════════════════════════════════════════
// 加/解密与同态运算正确性
// ══════════════════════════════════════════

console.log('\n=== 加密/解密 ===');

(function testEncryptDecrypt() {
  var vals = [0n, 1n, 42n, 12345n, 99999n];
  var ok = true;
  for (var i = 0; i < vals.length; i++) {
    var c = engine.mpEncrypt(vals[i], keys.publicKey);
    var m = engine.mpDecrypt(c, keys.privateKey);
    if (m !== vals[i]) ok = false;
  }
  assert(ok, '多个值加密解密正确');
})();

(function testEncryptNegative() {
  // 加密负数：应该映射到 [n/2, n)，还原后是负数
  var c = engine.mpEncrypt(-100n, keys.publicKey);
  var m = engine.mpDecrypt(c, keys.privateKey);
  var signed = engine.mpToSigned(m, keys.publicKey.n);
  assert(signed === -100n, 'Enc(-100) 解密并转有符号 = -100');
})();

console.log('\n=== 同态运算 ===');

(function testHomAdd() {
  var c1 = engine.mpEncrypt(300n, keys.publicKey);
  var c2 = engine.mpEncrypt(700n, keys.publicKey);
  var cSum = engine.mpHomAdd(c1, c2, keys.publicKey.nSquared);
  var sum = engine.mpDecrypt(cSum, keys.privateKey);
  assert(sum === 1000n, 'Enc(300)+Enc(700) 解密=1000');
})();

(function testHomSubtract() {
  // 用同态加法 + 加密负数实现减法
  var cA = engine.mpEncrypt(500n, keys.publicKey);
  var cNegB = engine.mpEncrypt(-200n, keys.publicKey);
  var cDiff = engine.mpHomAdd(cA, cNegB, keys.publicKey.nSquared);
  var diff = engine.mpDecrypt(cDiff, keys.privateKey);
  var signed = engine.mpToSigned(diff, keys.publicKey.n);
  assert(signed === 300n, 'Enc(500)+Enc(-200) 解密=300');
})();

(function testHomScalarMul() {
  var c = engine.mpEncrypt(7n, keys.publicKey);
  var cMul = engine.mpHomScalarMul(c, 3n, keys.publicKey.nSquared);
  var result = engine.mpDecrypt(cMul, keys.privateKey);
  assert(result === 21n, 'Enc(7)*3 解密=21');
})();

// ══════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════

console.log('\n=== 符号处理 ===');

(function testToSigned() {
  var n = 100n;
  assert(engine.mpToSigned(10n, n) === 10n, '小于 n/2 保持正');
  assert(engine.mpToSigned(90n, n) === -10n, '大于 n/2 变负');
  assert(engine.mpToSigned(0n, n) === 0n, '零保持零');
})();

(function testSign() {
  assert(engine.mpSign(5n) === 1, 'sign(5)=1');
  assert(engine.mpSign(-3n) === -1, 'sign(-3)=-1');
  assert(engine.mpSign(0n) === 0, 'sign(0)=0');
})();

(function testRandomPositive() {
  var r = engine.mpRandomPositive(24);
  assert(r >= 2n, 'r 大于等于 2');
  assert(r < (1n << 24n), 'r 小于 2^24');
})();

// ══════════════════════════════════════════
// 完整协议（多场景）
// ══════════════════════════════════════════

console.log('\n=== 百万富翁协议：a > b ===');

(function testProtocolGreater() {
  var res = engine.mpRunProtocol(80000n, 50000n, keys);
  assert(res.result === '>', '80000 > 50000 → ">"');
  assert(res.sign === 1, 'sign = 1');
  assert(res.cipherA !== res.cipherBlinded, '密文与盲化密文不同');
  assert(res.blindR >= 2n, '盲化因子 r 有效');
  // 关键属性：解密结果不等于真实差值（因为被 r 放大了）
  assert(res.decryptedBlinded !== 30000n, '解密结果不是原始差值 30000');
})();

console.log('\n=== 百万富翁协议：a < b ===');

(function testProtocolLess() {
  var res = engine.mpRunProtocol(20000n, 60000n, keys);
  assert(res.result === '<', '20000 < 60000 → "<"');
  assert(res.sign === -1, 'sign = -1');
  assert(res.decryptedBlinded < 0n, '解密结果为负数');
})();

console.log('\n=== 百万富翁协议：a = b ===');

(function testProtocolEqual() {
  var res = engine.mpRunProtocol(50000n, 50000n, keys);
  assert(res.result === '=', '50000 = 50000 → "="');
  assert(res.sign === 0, 'sign = 0');
  assert(res.decryptedBlinded === 0n, '解密结果为 0');
})();

console.log('\n=== 边界情况 ===');

(function testProtocolTinyDiff() {
  var res = engine.mpRunProtocol(1000001n, 1000000n, keys);
  assert(res.result === '>', '相差 1 也能正确判断');
})();

(function testProtocolZeroSalary() {
  var res = engine.mpRunProtocol(0n, 100n, keys);
  assert(res.result === '<', '0 < 100');
})();

console.log('\n=== 盲化的安全性（信息熵） ===');

(function testBlindingHidesMagnitude() {
  // 相同的真实差 30000，多次运行盲化后的解密值应大不相同
  var results = [];
  for (var i = 0; i < 5; i++) {
    var res = engine.mpRunProtocol(80000n, 50000n, keys);
    results.push(res.decryptedBlinded);
  }
  var allSame = results.every(function(r) { return r === results[0]; });
  assert(!allSame, '同一对工资多次比较，盲化后的结果各不相同');
  // 所有结果符号一致
  var allPositive = results.every(function(r) { return r > 0n; });
  assert(allPositive, '尽管数值不同，符号始终一致');
})();

(function testDecryptedNotEqualDiff() {
  // 检验：解密出来的值 |m| 应远大于真实差值（被 r 放大）
  var res = engine.mpRunProtocol(10n, 5n, keys);
  var absDec = res.decryptedBlinded > 0n ? res.decryptedBlinded : -res.decryptedBlinded;
  assert(absDec > 5n, '解密值绝对值远大于真实差 5（说明 Alice 无法反推差值）');
})();

// ══════════════════════════════════════════
// 彩蛋
// ══════════════════════════════════════════

console.log('\n=== 提示语 ===');

(function testFlavor() {
  var t1 = engine.mpFlavorText('>');
  var t2 = engine.mpFlavorText('<');
  var t3 = engine.mpFlavorText('=');
  assert(typeof t1 === 'string' && t1.length > 0, '"a>b" 有提示');
  assert(typeof t2 === 'string' && t2.length > 0, '"a<b" 有提示');
  assert(typeof t3 === 'string' && t3.length > 0, '"a=b" 有提示');
})();

(function testTrivia() {
  var t = engine.mpTrivia();
  assert(typeof t === 'string' && t.length > 10, 'trivia 有内容');
})();

// ══════════════════════════════════════════
// 真·协作模式：URL 分享编解码
// ══════════════════════════════════════════

console.log('\n=== 分享编解码 ===');

(function testHexRoundTrip() {
  var vals = [0n, 1n, 255n, 65536n, 12345678901234567890n];
  var ok = true;
  for (var i = 0; i < vals.length; i++) {
    var hex = engine.mpBigIntToHex(vals[i]);
    var back = engine.mpHexToBigInt(hex);
    if (back !== vals[i]) ok = false;
  }
  assert(ok, 'BigInt <-> hex 往返一致');
})();

(function testSessionId() {
  var s1 = engine.mpGenerateSessionId();
  var s2 = engine.mpGenerateSessionId();
  assert(s1.length === 8, 'sid 长度为 8');
  assert(s1 !== s2, '两次生成的 sid 不同');
})();

console.log('\n=== 三段式协作流程（端到端） ===');

(function testCollaborativeFlow() {
  // 1. Alice 发起
  var salaryA = 25000n;
  var salaryB = 32000n;
  var freshKeys = engine.mpGenerateKeys(128);
  var cA = engine.mpEncrypt(salaryA, freshKeys.publicKey);
  var sid = engine.mpGenerateSessionId();
  var inviteQs = engine.mpEncodeAliceInvite({
    sid: sid,
    n: freshKeys.publicKey.n,
    cA: cA
  });
  assert(inviteQs.indexOf('stage=await-bob') === 0, '邀请 URL 以 stage=await-bob 开头');
  assert(inviteQs.indexOf('sid=' + sid) > -1, '邀请 URL 含 sid');

  // 2. Bob 解析并回执
  var params = new (require('url').URLSearchParams)(inviteQs);
  var invite = engine.mpDecodeAliceInvite(params);
  assert(invite.publicKey.n === freshKeys.publicKey.n, 'Bob 恢复的公钥 n 一致');
  assert(invite.cA === cA, 'Bob 恢复的 cA 一致');
  assert(invite.sid === sid, 'sid 一致');

  var bobRes = engine.mpBobCompute(salaryB, invite.publicKey, invite.cA);
  assert(bobRes.blindR >= 2n, 'Bob 盲化因子有效');

  var replyQs = engine.mpEncodeBobReply({
    sid: invite.sid,
    cBlinded: bobRes.cipherBlinded
  });
  assert(replyQs.indexOf('stage=await-alice') === 0, '回执 URL 以 stage=await-alice 开头');

  // 3. Alice 解析并解密
  var replyParams = new (require('url').URLSearchParams)(replyQs);
  var reply = engine.mpDecodeBobReply(replyParams);
  assert(reply.sid === sid, 'Alice 收到的 sid 一致');
  assert(reply.cBlinded === bobRes.cipherBlinded, 'Alice 收到的 cBlinded 一致');

  var final = engine.mpAliceFinalize(reply.cBlinded, freshKeys.privateKey, freshKeys.publicKey.n);
  assert(final.result === '<', '25000 < 32000 → "<"');
  assert(final.sign === -1, 'sign = -1');
})();

(function testCollaborativeFlowGreater() {
  // Alice 更高
  var freshKeys = engine.mpGenerateKeys(128);
  var cA = engine.mpEncrypt(88888n, freshKeys.publicKey);
  var bobRes = engine.mpBobCompute(50000n, freshKeys.publicKey, cA);
  var final = engine.mpAliceFinalize(bobRes.cipherBlinded, freshKeys.privateKey, freshKeys.publicKey.n);
  assert(final.result === '>', '88888 > 50000 (协作模式)');
})();

(function testCollaborativeFlowEqual() {
  var freshKeys = engine.mpGenerateKeys(128);
  var cA = engine.mpEncrypt(60000n, freshKeys.publicKey);
  var bobRes = engine.mpBobCompute(60000n, freshKeys.publicKey, cA);
  var final = engine.mpAliceFinalize(bobRes.cipherBlinded, freshKeys.privateKey, freshKeys.publicKey.n);
  assert(final.result === '=', '60000 = 60000 (协作模式)');
})();

// ══════════════════════════════════════════
// 总结
// ══════════════════════════════════════════

console.log('\n========================================');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
