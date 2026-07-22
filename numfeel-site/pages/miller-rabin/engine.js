/**
 * 米勒-拉宾素性测试（Miller-Rabin primality test）核心引擎。
 *
 * 全部使用 BigInt 以支持任意大整数，纯函数实现、不操作 DOM，
 * 同时兼容浏览器 <script> 与 Node require。
 *
 * 核心思想：
 *   要判断一个大奇数 n 是否为质数，直接分解不可行。米勒-拉宾改为随机挑选
 *   若干「证人」a，用费马小定理的加强版做一次快速检验：
 *     - 若某个 a 揭穿了 n，则 n 必定是合数（结论 100% 可靠）；
 *     - 若 a 没能揭穿，n 只是「大概率是质数」。
 *   对单个合数 n，随机 a 揭穿失败（即 a 是「强伪证人」）的比例不超过 1/4。
 *   因此独立测 k 轮后，把合数误判成质数的概率不超过 (1/4)^k。
 */

'use strict';

/**
 * 用于快速过滤的小质数表。
 */
var SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

/**
 * 已知的卡迈克尔数（Carmichael number）。
 * 这些合数能骗过费马测试的所有互质底数，是纯费马测试的经典反例，
 * 但会被米勒-拉宾测试以高概率识破。
 */
var CARMICHAEL_NUMBERS = [561n, 1105n, 1729n, 2465n, 2821n, 6601n, 8911n, 10585n, 15841n, 29341n];

/**
 * 模幂运算 base^exp mod mod，使用平方-乘算法，复杂度 O(log exp)。
 * @param {bigint|number|string} base 底数。
 * @param {bigint|number|string} exp 指数（非负）。
 * @param {bigint|number|string} mod 模数（正）。
 * @returns {bigint} base^exp mod mod。
 */
function modPow(base, exp, mod) {
  var b = BigInt(base);
  var e = BigInt(exp);
  var m = BigInt(mod);
  if (m === 1n) return 0n;
  var result = 1n;
  b = b % m;
  if (b < 0n) b += m;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return result;
}

/**
 * 将 m 写成 2^s × d（d 为奇数）的形式。米勒-拉宾对 m = n − 1 做此分解。
 * @param {bigint|number|string} m 待分解的正整数。
 * @returns {{s: number, d: bigint}} 指数 s 与奇数部分 d。
 */
function decompose(m) {
  var value = BigInt(m);
  var s = 0;
  var d = value;
  while (d % 2n === 0n && d !== 0n) {
    d >>= 1n;
    s++;
  }
  return { s: s, d: d };
}

/**
 * 对单个底数 a 执行一轮米勒-拉宾检验，并保留全部中间平方序列，便于逐步演示。
 *
 * 判定规则：设 n − 1 = 2^s × d。计算 x0 = a^d mod n：
 *   - 若 x0 == 1 或 x0 == n − 1，a 通过（n 对此底数「像质数」）；
 *   - 否则连续平方最多 s − 1 次，若某次得到 n − 1，则通过；
 *   - 若始终没出现 n − 1，则 a 揭穿了 n（n 是合数，a 是证人）。
 *
 * @param {bigint|number|string} n 待检验的奇数（应 > 3）。
 * @param {bigint|number|string} a 底数（2 ≤ a ≤ n − 2）。
 * @returns {{base: bigint, probablePrime: boolean, isWitness: boolean, s: number, d: bigint, sequence: bigint[], reason: string}}
 *          probablePrime=false 表示 a 是证人、n 必为合数。
 */
function millerRabinRound(n, a) {
  var N = BigInt(n);
  var A = BigInt(a);
  var parts = decompose(N - 1n);
  var s = parts.s;
  var d = parts.d;
  var x = modPow(A, d, N);
  var sequence = [x];

  if (x === 1n || x === N - 1n) {
    return {
      base: A,
      probablePrime: true,
      isWitness: false,
      s: s,
      d: d,
      sequence: sequence,
      reason: x === 1n ? 'x0 ≡ 1' : 'x0 ≡ n−1'
    };
  }

  for (var i = 1; i < s; i++) {
    x = (x * x) % N;
    sequence.push(x);
    if (x === N - 1n) {
      return {
        base: A,
        probablePrime: true,
        isWitness: false,
        s: s,
        d: d,
        sequence: sequence,
        reason: '平方后出现 n−1'
      };
    }
  }

  return {
    base: A,
    probablePrime: false,
    isWitness: true,
    s: s,
    d: d,
    sequence: sequence,
    reason: '始终未出现 n−1，a 揭穿了合数'
  };
}

/**
 * 在闭区间 [min, max] 内生成一个均匀随机 BigInt（拒绝采样）。
 * @param {bigint} min 下界（含）。
 * @param {bigint} max 上界（含）。
 * @param {function(): number} [rng] 返回 [0,1) 的随机数函数，默认 Math.random。
 * @returns {bigint} [min, max] 内的随机整数。
 */
function randomBigIntInRange(min, max, rng) {
  var lo = BigInt(min);
  var hi = BigInt(max);
  if (hi <= lo) return lo;
  var r = rng || Math.random;
  var span = hi - lo + 1n;
  var bits = span.toString(2).length;
  var words = Math.ceil(bits / 30);
  var mask = (1n << BigInt(bits)) - 1n;
  // 拒绝采样，保证均匀且不超界。
  for (var guard = 0; guard < 10000; guard++) {
    var value = 0n;
    for (var i = 0; i < words; i++) {
      var chunk = BigInt(Math.floor(r() * 0x40000000)); // 30 位随机块
      value = (value << 30n) | chunk;
    }
    value &= mask;
    if (value < span) return lo + value;
  }
  return lo + (0n); // 理论上不可达
}

/**
 * 生成一个恰好 bits 位（最高位为 1）的随机 BigInt。
 * @param {number} bits 位数（≥ 2）。
 * @param {function(): number} [rng] 随机数函数。
 * @returns {bigint} 随机 BigInt。
 */
function randomBigIntWithBits(bits, rng) {
  var r = rng || Math.random;
  var b = bits < 2 ? 2 : bits;
  var words = Math.ceil(b / 30);
  var value = 0n;
  for (var i = 0; i < words; i++) {
    var chunk = BigInt(Math.floor(r() * 0x40000000));
    value = (value << 30n) | chunk;
  }
  var mask = (1n << BigInt(b)) - 1n;
  value &= mask;
  value |= 1n << BigInt(b - 1); // 置最高位
  return value;
}

/**
 * 完整的米勒-拉宾素性测试。先用小质数快速过滤，再随机（或按给定底数）测多轮。
 *
 * @param {bigint|number|string} n 待测正整数。
 * @param {{rounds?: number, bases?: Array<bigint|number|string>, rng?: function(): number}} [options]
 *        rounds 为随机测试轮数（默认 12）；bases 指定固定底数列表（优先于随机）；rng 随机源。
 * @returns {{n: bigint, probablePrime: boolean, definitelyPrime: boolean, witness: bigint|null,
 *           roundsRun: number, rounds: Array, errorBound: number, method: string}}
 *          probablePrime=true 表示「大概率为质数」；definitelyPrime=true 表示小质数精确判定。
 */
function millerRabinTest(n, options) {
  var N = BigInt(n);
  var opts = options || {};
  var rng = opts.rng || Math.random;

  if (N < 2n) {
    return baseResult(N, false, false, null, 0, [], 0, 'trivial');
  }

  // 小质数精确判定。
  for (var p = 0; p < SMALL_PRIMES.length; p++) {
    var prime = SMALL_PRIMES[p];
    if (N === prime) {
      return baseResult(N, true, true, null, 0, [], 0, 'small-prime');
    }
    if (N % prime === 0n) {
      return baseResult(N, false, false, prime, 0, [], 0, 'small-factor');
    }
  }

  var bases = opts.bases || null;
  var rounds = bases ? bases.length : (opts.rounds || 12);
  var roundResults = [];

  for (var i = 0; i < rounds; i++) {
    var a;
    if (bases && bases[i] !== undefined && bases[i] !== null) {
      a = BigInt(bases[i]);
      if (a < 2n) a = 2n;
      if (a > N - 2n) a = N - 2n;
    } else {
      a = randomBigIntInRange(2n, N - 2n, rng);
    }
    var round = millerRabinRound(N, a);
    roundResults.push(round);
    if (!round.probablePrime) {
      return baseResult(N, false, false, a, i + 1, roundResults, 0, 'miller-rabin');
    }
  }

  return baseResult(N, true, false, null, rounds, roundResults, errorBound(rounds), 'miller-rabin');
}

/**
 * 构造测试结果对象。
 * @private
 */
function baseResult(N, probablePrime, definitelyPrime, witness, roundsRun, rounds, eBound, method) {
  return {
    n: N,
    probablePrime: probablePrime,
    definitelyPrime: definitelyPrime,
    witness: witness,
    roundsRun: roundsRun,
    rounds: rounds,
    errorBound: eBound,
    method: method
  };
}

/**
 * k 轮米勒-拉宾把合数误判为质数的概率上界 (1/4)^k。
 * @param {number} rounds 测试轮数。
 * @returns {number} 误判概率上界。
 */
function errorBound(rounds) {
  if (rounds <= 0) return 1;
  return Math.pow(0.25, rounds);
}

/**
 * 对单个底数 a 执行一轮费马测试：检验 a^(n−1) ≡ 1 (mod n)。
 * @param {bigint|number|string} n 待检验数。
 * @param {bigint|number|string} a 底数。
 * @returns {{base: bigint, probablePrime: boolean, residue: bigint}} residue 为 a^(n−1) mod n。
 */
function fermatRound(n, a) {
  var N = BigInt(n);
  var A = BigInt(a);
  var residue = modPow(A, N - 1n, N);
  return { base: A, probablePrime: residue === 1n, residue: residue };
}

/**
 * 费马素性测试（多底数）。用于和米勒-拉宾对比，展示卡迈克尔数如何骗过它。
 * @param {bigint|number|string} n 待测数。
 * @param {{bases?: Array, rounds?: number, rng?: function(): number}} [options] 配置。
 * @returns {{n: bigint, probablePrime: boolean, witness: bigint|null, rounds: Array, roundsRun: number}}
 */
function fermatTest(n, options) {
  var N = BigInt(n);
  var opts = options || {};
  var rng = opts.rng || Math.random;
  if (N < 2n) return { n: N, probablePrime: false, witness: null, rounds: [], roundsRun: 0 };
  if (N === 2n || N === 3n) return { n: N, probablePrime: true, witness: null, rounds: [], roundsRun: 0 };
  if (N % 2n === 0n) return { n: N, probablePrime: false, witness: 2n, rounds: [], roundsRun: 0 };

  var bases = opts.bases || null;
  var rounds = bases ? bases.length : (opts.rounds || 12);
  var roundResults = [];
  for (var i = 0; i < rounds; i++) {
    var a;
    if (bases && bases[i] !== undefined && bases[i] !== null) {
      a = BigInt(bases[i]);
    } else {
      a = randomBigIntInRange(2n, N - 2n, rng);
    }
    var round = fermatRound(N, a);
    roundResults.push(round);
    if (!round.probablePrime) {
      return { n: N, probablePrime: false, witness: a, rounds: roundResults, roundsRun: i + 1 };
    }
  }
  return { n: N, probablePrime: true, witness: null, rounds: roundResults, roundsRun: rounds };
}

/**
 * 确定性素性判定（试除法），仅用于中小整数的正确性对照与测试。
 * 对很大的数会很慢，不应在生产路径使用。
 * @param {bigint|number|string} n 待判定数。
 * @returns {boolean} 是否为质数。
 */
function isPrimeDeterministic(n) {
  var N = BigInt(n);
  if (N < 2n) return false;
  if (N < 4n) return true;
  if (N % 2n === 0n) return false;
  var i = 3n;
  while (i * i <= N) {
    if (N % i === 0n) return false;
    i += 2n;
  }
  return true;
}

/**
 * 反复抽取随机奇数并用米勒-拉宾检验，直到找到一个「大概率质数」。
 * 模拟 RSA 等场景下「造一个大质数」的真实做法。
 *
 * @param {number} bits 目标位数（≥ 2）。
 * @param {{rng?: function(): number, rounds?: number, maxAttempts?: number}} [options] 配置。
 * @returns {{prime: bigint|null, attempts: number, bits: number, rounds: number, errorBound: number}}
 *          attempts 为尝试过的候选个数。
 */
function generateProbablePrime(bits, options) {
  var opts = options || {};
  var rng = opts.rng || Math.random;
  var rounds = opts.rounds || 12;
  var maxAttempts = opts.maxAttempts || 100000;
  var attempts = 0;
  while (attempts < maxAttempts) {
    attempts++;
    var candidate = randomBigIntWithBits(bits, rng);
    candidate |= 1n; // 保证为奇数
    var res = millerRabinTest(candidate, { rounds: rounds, rng: rng });
    if (res.probablePrime) {
      return {
        prime: candidate,
        attempts: attempts,
        bits: bits,
        rounds: rounds,
        errorBound: errorBound(rounds)
      };
    }
  }
  return { prime: null, attempts: attempts, bits: bits, rounds: rounds, errorBound: errorBound(rounds) };
}

/**
 * 素数定理近似：在 bits 位附近，随机奇数是质数的概率约为 2 / (bits × ln2)。
 * 用于估计「造一个大质数平均要试多少个候选」。
 * @param {number} bits 位数。
 * @returns {{primeDensity: number, expectedTriesAmongOdds: number}} 质数密度与期望尝试次数（仅数奇数）。
 */
function primeDensityEstimate(bits) {
  if (bits < 2) return { primeDensity: 0.5, expectedTriesAmongOdds: 1 };
  var lnN = bits * Math.log(2);
  var density = 1 / lnN;            // 全体整数中的质数密度 ~ 1/ln(n)
  var densityOdd = 2 / lnN;         // 只在奇数中挑，密度翻倍
  return {
    primeDensity: density,
    expectedTriesAmongOdds: 1 / densityOdd
  };
}

/**
 * 创建可复现的线性同余随机数生成器，便于测试与文章引用固定结果。
 * @param {number} seed 非负整数种子。
 * @returns {function(): number} 返回 [0,1) 的随机数函数。
 */
function createSeededRandom(seed) {
  var state = (seed >>> 0) || 1;
  return function() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

var ENGINE_EXPORTS = {
  SMALL_PRIMES: SMALL_PRIMES,
  CARMICHAEL_NUMBERS: CARMICHAEL_NUMBERS,
  modPow: modPow,
  decompose: decompose,
  millerRabinRound: millerRabinRound,
  millerRabinTest: millerRabinTest,
  errorBound: errorBound,
  fermatRound: fermatRound,
  fermatTest: fermatTest,
  isPrimeDeterministic: isPrimeDeterministic,
  generateProbablePrime: generateProbablePrime,
  primeDensityEstimate: primeDensityEstimate,
  randomBigIntInRange: randomBigIntInRange,
  randomBigIntWithBits: randomBigIntWithBits,
  createSeededRandom: createSeededRandom
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ENGINE_EXPORTS;
} else if (typeof window !== 'undefined') {
  window.engine = ENGINE_EXPORTS;
}
