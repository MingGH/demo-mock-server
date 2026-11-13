/**
 * p-hacking 实验室核心逻辑。
 * 所有函数均为纯函数，不依赖 DOM，可在 Node 中直接测试。
 */

/**
 * 32 位可复现随机数生成器。
 * @param {number} seed 随机种子
 * @returns {() => number} 返回 [0, 1) 的随机数函数
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 标准正态分布累积分布函数（Abramowitz-Stegun 近似）。
 * @param {number} z 标准分
 * @returns {number} 概率
 */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

/**
 * 双样本比例检验（双侧 z 检验）。
 * @param {number} convA A 组转化数
 * @param {number} nA A 组样本量
 * @param {number} convB B 组转化数
 * @param {number} nB B 组样本量
 * @returns {number} p 值
 */
function twoProportionPValue(convA, nA, convB, nB) {
  if (!nA || !nB) return 1;
  const rateA = convA / nA;
  const rateB = convB / nB;
  const pooled = (convA + convB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (se === 0) return 1;
  const z = (rateA - rateB) / se;
  if (z === 0) return 1;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return Math.min(1, Math.max(0, p));
}

/**
 * 从二项分布中采样。
 * @param {number} n 试验次数
 * @param {number} p 成功概率
 * @param {() => number} rng 随机数函数
 * @returns {number} 成功次数
 */
function binomial(n, p, rng) {
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (rng() < p) count++;
  }
  return count;
}

/**
 * 跑一次 A/B 测试（两组真实转化率完全相同）。
 * @param {{n:number, p:number, rng:() => number}} options 参数
 * @returns {{nA:number, nB:number, convA:number, convB:number, p:number}} 测试结果
 */
function simulateTest(options) {
  const { n, p, rng } = options;
  const convA = binomial(n, p, rng);
  const convB = binomial(n, p, rng);
  return { nA: n, nB: n, convA, convB, p: twoProportionPValue(convA, n, convB, n) };
}

/**
 * 边测边看：分块累积样本，一旦 p < alpha 就提前停止。
 * @param {{maxN:number, chunks:number, p:number, alpha:number, rng:() => number}} options 参数
 * @returns {{p:number, usedN:number, convA:number, convB:number, stopped:boolean}} 结果
 */
function simulatePeeking(options) {
  const { maxN, chunks, p, alpha, rng } = options;
  const chunkSize = Math.max(1, Math.floor(maxN / chunks));
  let convA = 0;
  let convB = 0;
  let usedN = 0;
  for (let i = 0; i < chunks; i++) {
    convA += binomial(chunkSize, p, rng);
    convB += binomial(chunkSize, p, rng);
    usedN += chunkSize;
    const pValue = twoProportionPValue(convA, usedN, convB, usedN);
    if (pValue < alpha) {
      return { p: pValue, usedN, convA, convB, stopped: true };
    }
  }
  return {
    p: twoProportionPValue(convA, usedN, convB, usedN),
    usedN,
    convA,
    convB,
    stopped: false
  };
}

/**
 * 跑一整组实验。
 * @param {Object} options 配置
 * @param {number} [options.tests=20] 实验次数
 * @param {number} [options.n=1000] 每组样本量
 * @param {number} [options.p=0.1] 真实转化率
 * @param {number} [options.alpha=0.05] 显著性水平
 * @param {boolean} [options.correction=false] 是否做 Bonferroni 校正
 * @param {boolean} [options.peeking=false] 是否边测边看
 * @param {number} [options.chunks=10] 边测边看的分块数
 * @param {number} [options.seed=1] 随机种子
 * @returns {{results:Array, threshold:number, falsePositives:number, minP:number, total:number}} 汇总结果
 */
function runExperiment(options) {
  const {
    tests = 20,
    n = 1000,
    p = 0.1,
    alpha = 0.05,
    correction = false,
    peeking = false,
    chunks = 10,
    seed = 1
  } = options || {};
  const rng = mulberry32(seed);
  const threshold = correction ? alpha / tests : alpha;
  const results = [];

  for (let i = 0; i < tests; i++) {
    const raw = peeking
      ? simulatePeeking({ maxN: n, chunks, p, alpha: correction ? threshold : alpha, rng })
      : simulateTest({ n, p, rng });
    const usedN = raw.usedN || n;
    const rateA = raw.convA / usedN;
    const rateB = raw.convB / usedN;
    results.push({
      index: i + 1,
      p: raw.p,
      convA: raw.convA,
      convB: raw.convB,
      n: usedN,
      rateA,
      rateB,
      diff: rateA - rateB,
      stoppedEarly: Boolean(raw.stopped),
      significant: raw.p < threshold
    });
  }

  const significant = results.filter(function (item) { return item.significant; });
  return {
    results,
    threshold,
    falsePositives: significant.length,
    minP: Math.min.apply(null, results.map(function (item) { return item.p; })),
    total: tests
  };
}

/**
 * 未做校正时，至少出现一次假阳性的理论概率。
 * @param {number} tests 独立检验次数
 * @param {number} alpha 单次显著性水平
 * @returns {number} 概率
 */
function expectedAtLeastOne(tests, alpha) {
  return 1 - Math.pow(1 - alpha, tests);
}

/**
 * Bonferroni 校正后的单次显著性阈值。
 * @param {number} alpha 总体显著性水平
 * @param {number} tests 检验次数
 * @returns {number} 校正后的阈值
 */
function bonferroniAlpha(alpha, tests) {
  return alpha / Math.max(1, tests);
}

/**
 * 把 p 值转成星星标记。
 * @param {number} p p 值
 * @returns {string} 标记
 */
function pStars(p) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

/**
 * 把 p 值格式化为易读字符串。
 * @param {number} p p 值
 * @returns {string} 格式化结果
 */
function formatP(p) {
  if (p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mulberry32,
    normalCdf,
    twoProportionPValue,
    binomial,
    simulateTest,
    simulatePeeking,
    runExperiment,
    expectedAtLeastOne,
    bonferroniAlpha,
    pStars,
    formatP
  };
}
