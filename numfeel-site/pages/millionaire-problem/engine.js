/**
 * 百万富翁问题实验室 - 协议引擎
 *
 * 基于 Paillier 加法同态加密的简化版比较协议：
 *   Alice 有工资 a，Bob 有工资 b。目标：双方只得到 sign(a-b)，不泄露原值。
 *
 * 协议流程（一次交互）：
 *   1. Alice 生成 Paillier 密钥对 (pk, sk)，把 pk 发给 Bob；
 *   2. Alice 加密 a：cA = Enc(a, pk)，发给 Bob；
 *   3. Bob 计算 cDiff = cA * Enc(-b) mod n²  →  等价于加密 (a-b)
 *      再选一个只有他自己知道的随机正整数 r，做同态标量乘：
 *      cBlinded = cDiff^r mod n²  →  等价于加密 r*(a-b)
 *      把 cBlinded 发回 Alice；
 *   4. Alice 解密得到 r*(a-b) mod n。由于 r 是未知正数，
 *      Alice 只能读出符号：正 → a>b，负 → a<b，零 → a=b。
 *
 * 双方视角：
 *   Alice 只看到 cBlinded（一坨密文）和最后的符号；
 *   Bob   只看到 cA（一坨密文）和自己知道的 b、r；
 *   任何一方都拿不到对方的原始工资。
 *
 * 注意：Demo 用 128 位密钥，仅用于教学演示，不具备真实安全性。
 */

// ══════════════════════════════════════════
// 大整数与数论工具（从 Paillier 实现精简）
// ══════════════════════════════════════════

/**
 * 生成 [min, max] 范围内的随机 BigInt
 * @param {BigInt} min
 * @param {BigInt} max
 * @returns {BigInt}
 */
function mpRandomBigInt(min, max) {
  var range = max - min + 1n;
  var bitLen = range.toString(2).length;
  var r;
  do {
    r = 0n;
    var remaining = bitLen;
    while (remaining > 0) {
      var chunkBits = remaining > 30 ? 30 : remaining;
      var maxChunkVal = 1 << chunkBits;
      var chunk = BigInt(Math.floor(Math.random() * maxChunkVal));
      r = (r << BigInt(chunkBits)) | chunk;
      remaining -= chunkBits;
    }
  } while (r >= range);
  return min + r;
}

/**
 * 模幂：base^exp mod mod
 */
function mpModPow(base, exp, mod) {
  if (mod === 1n) return 0n;
  var result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * 扩展欧几里得
 */
function mpExtendedGCD(a, b) {
  if (b === 0n) return { gcd: a, x: 1n, y: 0n };
  var r = mpExtendedGCD(b, a % b);
  return { gcd: r.gcd, x: r.y, y: r.x - (a / b) * r.y };
}

/**
 * 模逆元
 */
function mpModInverse(a, m) {
  var egcd = mpExtendedGCD(a, m);
  if (egcd.gcd !== 1n) throw new Error('模逆不存在');
  return ((egcd.x % m) + m) % m;
}

/**
 * GCD
 */
function mpGcd(a, b) {
  while (b !== 0n) { var t = b; b = a % b; a = t; }
  return a;
}

/**
 * LCM
 */
function mpLcm(a, b) {
  return a * b / mpGcd(a, b);
}

// ── Miller-Rabin 素性 ──
function mpMillerRabin(n, k) {
  if (n < 4n) return n === 2n || n === 3n;
  if (n % 2n === 0n) return false;
  var d = n - 1n;
  var s = 0n;
  while (d % 2n === 0n) { d /= 2n; s++; }
  for (var round = 0; round < k; round++) {
    var a = mpRandomBigInt(2n, n - 2n);
    var x = mpModPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    var composite = true;
    for (var r = 1n; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) { composite = false; break; }
    }
    if (composite) return false;
  }
  return true;
}

var MP_SMALL_PRIMES = 3n * 5n * 7n * 11n * 13n * 17n * 19n * 23n * 29n * 31n * 37n * 41n * 43n * 47n * 53n;

function mpQuickFilter(n) {
  return mpGcd(n, MP_SMALL_PRIMES) === 1n;
}

function mpRandomOdd(bits) {
  var min = 1n << BigInt(bits - 1);
  var max = (1n << BigInt(bits)) - 1n;
  var n;
  do { n = mpRandomBigInt(min, max); } while (n % 2n === 0n);
  return n;
}

function mpGeneratePrime(bits) {
  var n;
  do {
    n = mpRandomOdd(bits);
  } while (!mpQuickFilter(n) || !mpMillerRabin(n, 8));
  return n;
}

// ══════════════════════════════════════════
// Paillier 密钥与加解密
// ══════════════════════════════════════════

/**
 * 生成 Paillier 密钥对
 * @param {number} keyBits - 密钥位数，demo 默认 128
 */
function mpGenerateKeys(keyBits) {
  if (!keyBits) keyBits = 128;
  var primeBits = Math.floor(keyBits / 2) + 1;

  var p = mpGeneratePrime(primeBits);
  var q;
  do { q = mpGeneratePrime(primeBits); } while (q === p);
  var n = p * q;
  var nSquared = n * n;
  var g = n + 1n;
  var lambda = mpLcm(p - 1n, q - 1n);
  var gLambda = mpModPow(g, lambda, nSquared);
  var L = (gLambda - 1n) / n;
  var mu = mpModInverse(L, n);

  return {
    publicKey: { n: n, g: g, nSquared: nSquared },
    privateKey: { lambda: lambda, mu: mu, n: n, nSquared: nSquared }
  };
}

/**
 * Paillier 加密
 * @param {BigInt|number} m
 * @param {object} publicKey
 * @returns {BigInt}
 */
function mpEncrypt(m, publicKey) {
  var n = publicKey.n;
  var g = publicKey.g;
  var nSquared = publicKey.nSquared;
  var mBig = typeof m === 'bigint' ? m : BigInt(m);
  // 允许负数明文：映射到 [0, n)
  mBig = ((mBig % n) + n) % n;

  var r;
  do { r = mpRandomBigInt(2n, n - 1n); } while (mpGcd(r, n) !== 1n);

  var gm = mpModPow(g, mBig, nSquared);
  var rn = mpModPow(r, n, nSquared);
  return (gm * rn) % nSquared;
}

/**
 * Paillier 解密
 * @param {BigInt} c
 * @param {object} privateKey
 * @returns {BigInt} 明文（∈ [0, n)）
 */
function mpDecrypt(c, privateKey) {
  var lambda = privateKey.lambda;
  var mu = privateKey.mu;
  var n = privateKey.n;
  var nSquared = privateKey.nSquared;
  var cLambda = mpModPow(c, lambda, nSquared);
  var L = (cLambda - 1n) / n;
  return (L * mu) % n;
}

/**
 * 同态加法：c1 * c2 mod n² → 解密结果为 m1 + m2
 */
function mpHomAdd(c1, c2, nSquared) {
  return (c1 * c2) % nSquared;
}

/**
 * 同态标量乘：c^k mod n² → 解密结果为 m * k
 */
function mpHomScalarMul(c, k, nSquared) {
  var kBig = typeof k === 'bigint' ? k : BigInt(k);
  return mpModPow(c, kBig, nSquared);
}

// ══════════════════════════════════════════
// 百万富翁协议核心
// ══════════════════════════════════════════

/**
 * 把 Paillier 解密出来的明文还原为有符号整数。
 * Paillier 明文域是 [0, n)，我们把 [n/2, n) 视为负数。
 * @param {BigInt} m - 解密结果
 * @param {BigInt} n - 模数
 * @returns {BigInt} 有符号整数
 */
function mpToSigned(m, n) {
  var half = n / 2n;
  return m > half ? m - n : m;
}

/**
 * 生成一个 bits 位的随机正整数（用作盲化因子 r）
 * @param {number} bits
 * @returns {BigInt}
 */
function mpRandomPositive(bits) {
  var min = 2n;
  var max = (1n << BigInt(bits)) - 1n;
  return mpRandomBigInt(min, max);
}

/**
 * 判断三态符号
 * @param {BigInt} x
 * @returns {number} 1, -1, 或 0
 */
function mpSign(x) {
  if (x > 0n) return 1;
  if (x < 0n) return -1;
  return 0;
}

/**
 * 运行完整的百万富翁比较协议
 *
 * 返回结构包含每一步的中间产物，方便前端可视化：
 *   {
 *     salaryA, salaryB, keys, cipherA, cipherNegB, cipherDiff, blindR,
 *     cipherBlinded, decryptedBlinded, comparison, result: '>' | '<' | '='
 *   }
 *
 * @param {BigInt|number} salaryA - Alice 的工资
 * @param {BigInt|number} salaryB - Bob 的工资
 * @param {object} [existingKeys] - 可选：复用已有密钥
 * @param {number} [keyBits=128]
 * @param {number} [blindBits=24] - 盲化因子 r 的位数
 * @returns {object}
 */
function mpRunProtocol(salaryA, salaryB, existingKeys, keyBits, blindBits) {
  if (!keyBits) keyBits = 128;
  if (!blindBits) blindBits = 24;

  var a = typeof salaryA === 'bigint' ? salaryA : BigInt(salaryA);
  var b = typeof salaryB === 'bigint' ? salaryB : BigInt(salaryB);

  // Step 1: 密钥
  var keys = existingKeys || mpGenerateKeys(keyBits);
  var pk = keys.publicKey;
  var sk = keys.privateKey;

  // Step 2: Alice 加密工资
  var cipherA = mpEncrypt(a, pk);

  // Step 3: Bob 加密 -b 并做同态减法
  var cipherNegB = mpEncrypt(-b, pk);
  var cipherDiff = mpHomAdd(cipherA, cipherNegB, pk.nSquared);

  // Step 3.5: Bob 挑选盲化因子 r，做同态标量乘
  var r = mpRandomPositive(blindBits);
  var cipherBlinded = mpHomScalarMul(cipherDiff, r, pk.nSquared);

  // Step 4: Alice 解密，只读符号
  var rawDecrypted = mpDecrypt(cipherBlinded, sk);
  var signedDecrypted = mpToSigned(rawDecrypted, pk.n);
  var sign = mpSign(signedDecrypted);

  var result = sign > 0 ? '>' : (sign < 0 ? '<' : '=');

  return {
    salaryA: a,
    salaryB: b,
    keys: keys,
    cipherA: cipherA,
    cipherNegB: cipherNegB,
    cipherDiff: cipherDiff,
    blindR: r,
    cipherBlinded: cipherBlinded,
    decryptedBlinded: signedDecrypted,
    sign: sign,
    result: result
  };
}

// ══════════════════════════════════════════
// 彩蛋提示语
// ══════════════════════════════════════════

/**
 * 根据本次比较的结果生成随机吐槽
 * @param {string} result - '>', '<', '='
 * @returns {string}
 */
function mpFlavorText(result) {
  var winner = [
    '密文告诉我你赢了，但它不肯告诉我赢了多少',
    '恭喜，你的工资在密文界赢得胜利，只是没人知道数字长啥样',
    'r 只有 Bob 知道——所以就算你比对方多 1 块，看起来也像多了几百万',
    '密码学证明你更高，但拒绝出具收入证明'
  ];
  var loser = [
    '密文说你输了。别问差多少，Bob 也不知道',
    '别灰心，至少 Bob 知道你输了，但不知道你多惨',
    '在盲化因子面前，工资 10 万和工资 1 万看起来一样黑',
    '密文投票结果：Bob 领先。具体多少？下辈子吧'
  ];
  var tie = [
    '零就是零，密文加密再解密还是零。你俩打平了',
    '这是唯一一种会泄露原值的情况——因为 0 * r 还是 0',
    '碰巧一样。或者你俩偷偷串通了',
    '协议冷冷地说：sign(0) = 0。没有戏剧性'
  ];
  var pool = result === '>' ? winner : (result === '<' ? loser : tie);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 通用冷知识（不基于结果）
 */
function mpTrivia() {
  var pool = [
    '姚期智 1982 年提出百万富翁问题，是安全多方计算（MPC）领域的开山之作',
    '真实的 MPC 系统会用 128 位以上密钥，本 demo 只用 128 位，几秒就能算出来',
    '把 r 换成负数会怎样？符号翻转，协议直接错——所以 Bob 必须保证 r 是正数',
    '这个协议只做一次交互就出结果，是 MPC 里非常温和的一类',
    '如果 Bob 想作弊：他能选 r=0 让 Alice 只看到 0，但那样他自己也拿不到结果',
    '同态加密和 MPC 是隐私计算的两大流派，前者一方算，后者多方算'
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ══════════════════════════════════════════
// 导出
// ══════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mpGenerateKeys: mpGenerateKeys,
    mpEncrypt: mpEncrypt,
    mpDecrypt: mpDecrypt,
    mpHomAdd: mpHomAdd,
    mpHomScalarMul: mpHomScalarMul,
    mpRunProtocol: mpRunProtocol,
    mpToSigned: mpToSigned,
    mpSign: mpSign,
    mpRandomPositive: mpRandomPositive,
    mpModPow: mpModPow,
    mpGcd: mpGcd,
    mpLcm: mpLcm,
    mpModInverse: mpModInverse,
    mpFlavorText: mpFlavorText,
    mpTrivia: mpTrivia
  };
}
