/**
 * Paillier 同态加密引擎
 * 纯 JavaScript BigInt 实现，跑在浏览器里，仅用于演示概念。
 *
 * 核心性质：
 *   Enc(m1) * Enc(m2) mod n^2  →  Dec  →  m1 + m2 mod n    (加法同态)
 *   Enc(m)^k        mod n^2  →  Dec  →  m * k  mod n       (标量乘同态)
 *
 * 注意：Demo 级实现，密钥仅 128 位，不具备真实安全性。
 */

// ── 随机数工具 ──

/**
 * 生成 [min, max] 范围内的随机 BigInt
 * 按需生成恰好 bitLen 个随机位，不做多余的重试
 */
function randomBigInt(min, max) {
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

// ── Miller-Rabin 素性测试 ──

/**
 * 模幂运算：base^exp mod mod
 */
function modPow(base, exp, mod) {
  if (mod === 1n) return 0n;
  var result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Miller-Rabin 素性测试
 * @param {BigInt} n - 待测试的数
 * @param {number} k - 测试轮数（越多越准）
 * @returns {boolean}
 */
function millerRabin(n, k) {
  if (n < 4n) return n === 2n || n === 3n;
  if (n % 2n === 0n) return false;

  // n-1 = 2^s * d
  var d = n - 1n;
  var s = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    s++;
  }

  for (var round = 0; round < k; round++) {
    var a = randomBigInt(2n, n - 2n);
    var x = modPow(a, d, n);
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

// ── 大整数工具 ──

/**
 * 扩展欧几里得算法：gcd(a, b) 同时求 Bezout 系数
 * @returns {{gcd: BigInt, x: BigInt, y: BigInt}}
 */
function extendedGCD(a, b) {
  if (b === 0n) return { gcd: a, x: 1n, y: 0n };
  var r = extendedGCD(b, a % b);
  return { gcd: r.gcd, x: r.y, y: r.x - (a / b) * r.y };
}

/**
 * 模逆元：a^-1 mod m
 */
function modInverse(a, m) {
  var egcd = extendedGCD(a, m);
  if (egcd.gcd !== 1n) throw new Error('模逆不存在');
  return ((egcd.x % m) + m) % m;
}

/**
 * LCM（最小公倍数）
 */
function lcm(a, b) {
  return a * b / gcd(a, b);
}

/**
 * GCD（最大公约数）
 */
function gcd(a, b) {
  while (b !== 0n) { var t = b; b = a % b; a = t; }
  return a;
}

// ── 质数生成 ──

// 小质数乘积，用于快速试除预筛选。跳过那些能被小质数整除的候选数，
// 因为大部分合数会被这一步直接淘汰，避免进入昂贵的 Miller-Rabin。
var SMALL_PRIMES_PRODUCT = 3n * 5n * 7n * 11n * 13n * 17n * 19n * 23n * 29n * 31n * 37n * 41n * 43n * 47n * 53n;

/**
 * 快速预筛选：用一组小质数试除，淘汰明显的合数
 * @returns {boolean} true = 可能为素数，false = 肯定为合数
 */
function quickPrimalityFilter(n) {
  return gcd(n, SMALL_PRIMES_PRODUCT) === 1n;
}

/**
 * 生成指定位数的随机大奇数
 */
function randomOdd(bits) {
  var min = 1n << BigInt(bits - 1);
  var max = (1n << BigInt(bits)) - 1n;
  var n;
  do {
    n = randomBigInt(min, max);
  } while (n % 2n === 0n);
  return n;
}

/**
 * 生成指定位数的质数
 * @param {number} bits - 位数
 * @returns {BigInt}
 */
function generatePrime(bits) {
  var n;
  do {
    n = randomOdd(bits);
    // 预筛选：能快速淘汰约 70% 的合数
  } while (!quickPrimalityFilter(n) || !millerRabin(n, 8));
  return n;
}

// ── Paillier 密钥生成 ──

/**
 * 生成 Paillier 密钥对
 * @param {number} keyBits - 密钥位数（n 的位数），demo 默认 128
 * @returns {object} { publicKey: {n, g, nSquared}, privateKey: {lambda, mu, n, nSquared} }
 */
function generatePaillierKeys(keyBits) {
  if (!keyBits) keyBits = 128;
  // 用 +1 保证两个质数的乘积必定达到 keyBits，避免外层 do-while 重复循环
  var primeBits = Math.floor(keyBits / 2) + 1;

  var p, q, n, lambda;
  p = generatePrime(primeBits);
  do {
    q = generatePrime(primeBits);
  } while (q === p);
  n = p * q;

  var nSquared = n * n;
  var g = n + 1n; // 优化：使用 n+1，极大地简化解密
  lambda = lcm(p - 1n, q - 1n);

  // L 函数：L(x) = (x - 1) / n
  // mu = L(g^lambda mod n^2)^(-1) mod n
  var gLambda = modPow(g, lambda, nSquared);
  var L = (gLambda - 1n) / n;
  var mu = modInverse(L, n);

  return {
    publicKey: {
      n: n,
      g: g,
      nSquared: nSquared
    },
    privateKey: {
      lambda: lambda,
      mu: mu,
      n: n,
      nSquared: nSquared
    }
  };
}

// ── Paillier 加密/解密 ──

/**
 * 加密明文 m
 * @param {BigInt|number} m - 明文（需 m < n）
 * @param {object} publicKey - {n, g, nSquared}
 * @returns {BigInt} 密文 c = g^m * r^n mod n^2
 */
function paillierEncrypt(m, publicKey) {
  var n = publicKey.n;
  var g = publicKey.g;
  var nSquared = publicKey.nSquared;
  var mBig = typeof m === 'bigint' ? m : BigInt(m);

  // 随机数 r，确保 gcd(r, n) = 1
  var r;
  do {
    r = randomBigInt(2n, n - 1n);
  } while (gcd(r, n) !== 1n);

  // c = g^m * r^n mod n^2
  var gm = modPow(g, mBig, nSquared);
  var rn = modPow(r, n, nSquared);
  return (gm * rn) % nSquared;
}

/**
 * 解密密文 c
 * @param {BigInt} c - 密文
 * @param {object} privateKey - {lambda, mu, n, nSquared}
 * @returns {BigInt} 明文 m = L(c^lambda mod n^2) * mu mod n
 */
function paillierDecrypt(c, privateKey) {
  var lambda = privateKey.lambda;
  var mu = privateKey.mu;
  var n = privateKey.n;
  var nSquared = privateKey.nSquared;

  var cLambda = modPow(c, lambda, nSquared);
  var L = (cLambda - 1n) / n;
  return (L * mu) % n;
}

// ── 同态运算 ──

/**
 * 同态加法：c1 * c2 mod n^2 → 解密结果为 m1 + m2
 * @returns {BigInt}
 */
function paillierAdd(c1, c2, nSquared) {
  return (c1 * c2) % nSquared;
}

/**
 * 同态标量乘法：c^k mod n^2 → 解密结果为 m * k
 * @returns {BigInt}
 */
function paillierScalarMultiply(c, k, nSquared) {
  var kBig = typeof k === 'bigint' ? k : BigInt(k);
  return modPow(c, kBig, nSquared);
}

// ── 随机提示语 ──

/**
 * 生成随机提示语（彩蛋）
 * @returns {string}
 */
function randomTip() {
  var tips = [
    '提示：Paillier 方案于 1999 年提出，是第一个可证的加法同态加密方案',
    '冷知识：Paillier 密文的长度是明文的 2 倍——这里 n 是 128 位，c 就是 256 位',
    '试试这个：加密 100 和 200，然后同态相加，解密得到 300',
    '数学直觉：Paillier 的安全性基于「判定合数剩余问题」——和 RSA 是亲戚但性质完全不同',
    '你知道吗：全同态加密 (FHE) 在 2009 年才被 Gentry 首次构造出来，比 Paillier 晚了整整 10 年',
    '乘法同态为什么难？因为同态加密的「噪声」会在乘法时相乘增长，而加法时只是相加',
    'FHE 现状：2025 年已有硬件加速芯片，DARPA 投资数千万美元的 FHE 加速器项目正在进行',
    '实验中：可以试试在同态加法后用同态标量乘再解密，就能验证 m*3 而不是 m1+m2',
    '思考题：如果 Paillier 只有加法同态，怎么用它实现「私有投票」系统？提示——计票就是加分',
    '密码学梗：有人管同态加密叫"加密界的薛定谔的猫"，你是打开箱子才知道结果的'
  ];
  return tips[Math.floor(Math.random() * tips.length)];
}

// ── 导出 ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generatePaillierKeys: generatePaillierKeys,
    paillierEncrypt: paillierEncrypt,
    paillierDecrypt: paillierDecrypt,
    paillierAdd: paillierAdd,
    paillierScalarMultiply: paillierScalarMultiply,
    modPow: modPow,
    millerRabin: millerRabin,
    generatePrime: generatePrime,
    randomBigInt: randomBigInt,
    gcd: gcd,
    lcm: lcm,
    modInverse: modInverse,
    extendedGCD: extendedGCD,
    quickPrimalityFilter: quickPrimalityFilter,
    randomTip: randomTip
  };
}
