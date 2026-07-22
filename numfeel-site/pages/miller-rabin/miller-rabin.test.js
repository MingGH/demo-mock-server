var engine = require('./engine.js');

var modPow = engine.modPow;
var decompose = engine.decompose;
var millerRabinRound = engine.millerRabinRound;
var millerRabinTest = engine.millerRabinTest;
var errorBound = engine.errorBound;
var fermatRound = engine.fermatRound;
var fermatTest = engine.fermatTest;
var isPrimeDeterministic = engine.isPrimeDeterministic;
var generateProbablePrime = engine.generateProbablePrime;
var primeDensityEstimate = engine.primeDensityEstimate;
var randomBigIntInRange = engine.randomBigIntInRange;
var randomBigIntWithBits = engine.randomBigIntWithBits;
var createSeededRandom = engine.createSeededRandom;
var CARMICHAEL_NUMBERS = engine.CARMICHAEL_NUMBERS;

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.error('  \u2717 ' + message);
  }
}

function assertClose(actual, expected, tolerance, message) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    message + ' (actual=' + actual + ', expected=' + expected + ', tol=' + tolerance + ')'
  );
}

console.log('\n=== 1. modPow 模幂运算正确 ===');

(function testModPow() {
  assert(modPow(2, 10, 1000) === 24n, '2^10 mod 1000 = 24');
  assert(modPow(3, 0, 7) === 1n, 'a^0 mod m = 1');
  assert(modPow(7, 4, 1) === 0n, 'mod 1 恒为 0');
  assert(modPow(2, 5, 5) === 2n, '2^5 mod 5 = 2（费马小定理示例）');
  // 大数：2^90 mod 91（91=7×13 为合数），用 BigInt 校验
  var expected = (2n ** 90n) % 91n;
  assert(modPow(2, 90, 91) === expected, '大指数 2^90 mod 91 与 BigInt 直算一致');
})();

console.log('\n=== 2. decompose 把 n-1 写成 2^s × d ===');

(function testDecompose() {
  var r561 = decompose(560n); // 561 - 1 = 560 = 2^4 × 35
  assert(r561.s === 4 && r561.d === 35n, '560 = 2^4 × 35');
  var r13 = decompose(12n); // 13 - 1 = 12 = 2^2 × 3
  assert(r13.s === 2 && r13.d === 3n, '12 = 2^2 × 3');
  var rOdd = decompose(7n); // 已是奇数
  assert(rOdd.s === 0 && rOdd.d === 7n, '奇数 d 部分不变，s=0');
  // 还原校验
  assert((2n ** BigInt(r561.s)) * r561.d === 560n, '2^s × d 能还原 560');
})();

console.log('\n=== 3. 已知小质数判定为质数 ===');

(function testKnownPrimes() {
  var primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 97, 101, 7919];
  var allPrime = true;
  primes.forEach(function(p) {
    var res = millerRabinTest(p, { rounds: 20, rng: createSeededRandom(p) });
    if (!res.probablePrime) allPrime = false;
  });
  assert(allPrime, '常见小质数全部判为（大概率）质数');

  var big = 1000000007; // 常用大质数
  var resBig = millerRabinTest(big, { rounds: 20, rng: createSeededRandom(7) });
  assert(resBig.probablePrime, '1000000007 判为质数');
})();

console.log('\n=== 4. 已知合数判定为合数（结论必然可靠）===');

(function testKnownComposites() {
  var composites = [4, 9, 15, 21, 25, 100, 561, 1000, 9991]; // 9991 = 97 × 103
  var allComposite = true;
  composites.forEach(function(c) {
    var res = millerRabinTest(c, { rounds: 20, rng: createSeededRandom(c) });
    if (res.probablePrime) allComposite = false;
    // 合数一旦被判定，必须给出证人或小因子
    if (!res.probablePrime) {
      assert(res.witness !== null, c + ' 被判合数时给出了证人/因子 ' + res.witness);
    }
  });
  assert(allComposite, '已知合数全部判为合数');
})();

console.log('\n=== 5. 米勒-拉宾能识破卡迈克尔数（费马测试的死角）===');

(function testCarmichael() {
  var allCaught = true;
  CARMICHAEL_NUMBERS.forEach(function(c) {
    var res = millerRabinTest(c, { rounds: 20, rng: createSeededRandom(Number(c)) });
    if (res.probablePrime) allCaught = false;
  });
  assert(allCaught, '所有卡迈克尔数都被米勒-拉宾识破为合数');
})();

console.log('\n=== 6. 费马测试会被卡迈克尔数 561 骗过 ===');

(function testFermatFooledBy561() {
  // 561 = 3 × 11 × 17，对所有与之互质的底数满足 a^560 ≡ 1
  // 选取都与 561 互质的底数
  var coprimeBases = [2, 4, 5, 7, 8, 13, 14, 16];
  var fermat = fermatTest(561, { bases: coprimeBases });
  assert(fermat.probablePrime, '费马测试用互质底数把 561 误判为质数');

  // 同样的底数下，米勒-拉宾能识破
  var mr = millerRabinTest(561, { bases: coprimeBases });
  assert(!mr.probablePrime, '米勒-拉宾用相同底数识破 561 是合数');
  assert(mr.witness !== null, '米勒-拉宾给出了 561 的证人');
})();

console.log('\n=== 7. millerRabinRound 中间平方序列结构正确 ===');

(function testRoundSequence() {
  // 对质数 13，底数 a 应通过：序列首项为 1 或末项为 12(n-1)
  var round = millerRabinRound(13, 2);
  assert(round.probablePrime === true, '13 对底数 2 通过');
  var last = round.sequence[round.sequence.length - 1];
  var first = round.sequence[0];
  assert(first === 1n || last === 12n, '通过时首项≡1 或 序列出现 n−1=12');

  // 对合数 15，底数 2 应揭穿
  var roundComposite = millerRabinRound(15, 2);
  assert(roundComposite.probablePrime === false, '15 对底数 2 被揭穿');
  assert(roundComposite.isWitness === true, '底数 2 是 15 的证人');
  assert(roundComposite.sequence.length >= 1, '序列至少含 x0');
})();

console.log('\n=== 8. errorBound = (1/4)^k 且随轮数指数下降 ===');

(function testErrorBound() {
  assertClose(errorBound(1), 0.25, 1e-12, '1 轮误判上界 = 1/4');
  assertClose(errorBound(2), 0.0625, 1e-12, '2 轮 = 1/16');
  assertClose(errorBound(10), Math.pow(0.25, 10), 1e-18, '10 轮 = (1/4)^10');
  assert(errorBound(20) < errorBound(10), '轮数增加误判上界下降');
  assert(errorBound(0) === 1, '0 轮上界为 1');
  // 40 轮应远小于 1e-20
  assert(errorBound(40) < 1e-20, '40 轮误判上界 < 1e-20');
})();

console.log('\n=== 9. 确定性试除法与米勒-拉宾在中小范围内完全一致 ===');

(function testCrossCheck() {
  var mismatches = 0;
  for (var n = 2; n <= 2000; n++) {
    var truth = isPrimeDeterministic(n);
    var mr = millerRabinTest(n, { rounds: 15, rng: createSeededRandom(n) }).probablePrime;
    if (truth !== mr) mismatches++;
  }
  assert(mismatches === 0, '2..2000 全范围内米勒-拉宾与试除法结论一致（0 处不符）');
})();

console.log('\n=== 10. 生成大概率质数：结果确为质数且可复现 ===');

(function testGeneratePrime() {
  var rng = createSeededRandom(20260722);
  var result = generateProbablePrime(20, { rng: rng, rounds: 15 });
  assert(result.prime !== null, '成功生成 20 位大概率质数');
  assert(result.attempts >= 1, '记录了尝试次数 attempts=' + result.attempts);
  // 用独立的确定性方法交叉验证（20 位数试除法可承受）
  assert(isPrimeDeterministic(result.prime), '生成结果经试除法确认确为质数');
  assert(result.prime % 2n === 1n, '生成的质数为奇数');
  assert(result.errorBound === errorBound(15), '返回的误判上界与轮数匹配');

  // 相同种子结果可复现
  var rng2 = createSeededRandom(20260722);
  var result2 = generateProbablePrime(20, { rng: rng2, rounds: 15 });
  assert(result.prime === result2.prime, '相同种子生成相同质数');
})();

console.log('\n=== 11. 随机 BigInt 落在指定范围内 ===');

(function testRandomBigInt() {
  var rng = createSeededRandom(99);
  var allInRange = true;
  for (var i = 0; i < 500; i++) {
    var v = randomBigIntInRange(2n, 100n, rng);
    if (v < 2n || v > 100n) allInRange = false;
  }
  assert(allInRange, 'randomBigIntInRange 500 次采样全部落在 [2,100]');

  var bitsVal = randomBigIntWithBits(16, createSeededRandom(3));
  assert(bitsVal >= (1n << 15n) && bitsVal < (1n << 16n), '16 位随机数最高位为 1，落在 [2^15, 2^16)');
})();

console.log('\n=== 12. 素数密度估计随位数增大而下降 ===');

(function testPrimeDensity() {
  var d64 = primeDensityEstimate(64);
  var d512 = primeDensityEstimate(512);
  var d1024 = primeDensityEstimate(1024);
  assert(d64.primeDensity > d512.primeDensity, '位数越大质数密度越低');
  assert(d512.primeDensity > d1024.primeDensity, '1024 位密度低于 512 位');
  assert(d1024.expectedTriesAmongOdds > d64.expectedTriesAmongOdds, '位数越大期望尝试次数越多');
  // 1024 位约每 355 个奇数有一个质数（1024×ln2/2 ≈ 354.9）
  assertClose(d1024.expectedTriesAmongOdds, 1024 * Math.log(2) / 2, 1, '1024 位期望奇数尝试 ≈ 355');
})();

console.log('\n=== 13. 边界与非法输入处理 ===');

(function testEdgeCases() {
  assert(!millerRabinTest(0).probablePrime, '0 非质数');
  assert(!millerRabinTest(1).probablePrime, '1 非质数');
  assert(millerRabinTest(2).probablePrime && millerRabinTest(2).definitelyPrime, '2 为质数（精确）');
  assert(millerRabinTest(3).definitelyPrime, '3 为质数（精确）');
  assert(!millerRabinTest(-7).probablePrime, '负数非质数');
  assert(isPrimeDeterministic(2) && !isPrimeDeterministic(1), '试除法边界：2 质数、1 非质数');

  var small = millerRabinTest(37);
  assert(small.definitelyPrime === true && small.method === 'small-prime', '37 命中小质数精确判定');
  var big = millerRabinTest(97);
  assert(big.probablePrime === true && big.method === 'miller-rabin', '97 超出小质数表，走米勒-拉宾路径');
})();

console.log('\n=== 14. 大整数（超出 Number 安全范围）也能正确判定 ===');

(function testBigIntegers() {
  // 2^61 - 1 是梅森质数
  var mersenne = (2n ** 61n) - 1n;
  var res = millerRabinTest(mersenne, { rounds: 20, rng: createSeededRandom(61) });
  assert(res.probablePrime, '梅森质数 2^61−1 判为质数');

  // 两个大质数之积必为合数
  var composite = (2n ** 61n - 1n) * (2n ** 31n - 1n);
  var resC = millerRabinTest(composite, { rounds: 20, rng: createSeededRandom(31) });
  assert(!resC.probablePrime, '(2^61−1)×(2^31−1) 判为合数');
})();

console.log('\n=== \u7ed3\u679c ===');
console.log('\u901a\u8fc7: ' + passed + ', \u5931\u8d25: ' + failed);
process.exit(failed > 0 ? 1 : 0);
