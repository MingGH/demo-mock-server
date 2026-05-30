// rating-inflation.test.js
// node pages/rating-inflation.test.js

function calcAvg(dist) {
  const total = dist.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return dist.reduce((s, v, i) => s + v * (i + 1), 0) / total;
}

function calcEntropy(dist) {
  const total = dist.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return -dist.reduce((s, v) => {
    const p = v / total;
    return p > 0 ? s + p * Math.log2(p) : s;
  }, 0);
}

function trueDistribution(badRate, midRate) {
  const bad = badRate / 100, mid = midRate / 100;
  const good = 1 - bad - mid;
  return [bad * 0.4, bad * 0.6, mid, good * 0.45, good * 0.55].map(v => Math.max(0, v));
}

function observedDistribution(trueDist, silentRate) {
  const s = silentRate / 100;
  const silentMult = [0.2, 0.3, s, s * 0.9, 0.25];
  return trueDist.map((v, i) => v * (1 - silentMult[i]));
}

let passed = 0, failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    failed++;
  }
}

// ─── 测试 calcAvg ────────────────────────────────────────
console.log('\n[calcAvg]');
assert('全5星平均分=5', Math.abs(calcAvg([0, 0, 0, 0, 100]) - 5) < 0.001);
assert('全1星平均分=1', Math.abs(calcAvg([100, 0, 0, 0, 0]) - 1) < 0.001);
assert('均匀分布平均分=3', Math.abs(calcAvg([20, 20, 20, 20, 20]) - 3) < 0.001);
assert('空数组返回0', calcAvg([0, 0, 0, 0, 0]) === 0);

// ─── 测试 calcEntropy ────────────────────────────────────
console.log('\n[calcEntropy]');
const maxEntropy = Math.log2(5);
assert('均匀分布熵最大≈2.32', Math.abs(calcEntropy([20, 20, 20, 20, 20]) - maxEntropy) < 0.01);
assert('全5星熵=0（无信息）', calcEntropy([0, 0, 0, 0, 100]) === 0);
assert('熵值非负', calcEntropy([80, 10, 5, 3, 2]) >= 0);
assert('熵值不超过理论最大值', calcEntropy([80, 10, 5, 3, 2]) <= maxEntropy + 0.001);

// ─── 测试 trueDistribution ───────────────────────────────
console.log('\n[trueDistribution]');
const td = trueDistribution(10, 15);
const tdSum = td.reduce((a, b) => a + b, 0);
assert('真实分布概率之和≈1', Math.abs(tdSum - 1) < 0.001);
assert('所有值非负', td.every(v => v >= 0));
assert('差评率0时无1/2星', trueDistribution(0, 10)[0] === 0 && trueDistribution(0, 10)[1] === 0);

// ─── 测试 observedDistribution ───────────────────────────
console.log('\n[observedDistribution]');
const od = observedDistribution(td, 70);
assert('观测分布所有值非负', od.every(v => v >= 0));
assert('沉默率越高，3星被压制越多', (() => {
  const od1 = observedDistribution(td, 30);
  const od2 = observedDistribution(td, 90);
  return od2[2] < od1[2]; // 3星（index 2）在高沉默率下更少
})());

// ─── 测试通胀效应 ────────────────────────────────────────
console.log('\n[通胀效应]');
assert('沉默多数导致观测均分高于真实均分', (() => {
  const trueDist = trueDistribution(8, 12);
  const trueAvg = calcAvg(trueDist.map(v => Math.round(v * 100)));
  const obsDist = observedDistribution(trueDist, 70);
  const obsTotal = obsDist.reduce((a, b) => a + b, 0);
  const obsNorm = obsDist.map(v => Math.round(v / obsTotal * 100));
  const obsAvg = calcAvg(obsNorm);
  return obsAvg > trueAvg;
})());

assert('高沉默率下信息熵损失超过30%', (() => {
  const trueDist = trueDistribution(5, 10);
  const obsDist = observedDistribution(trueDist, 80);
  const obsTotal = obsDist.reduce((a, b) => a + b, 0);
  const obsNorm = obsDist.map(v => Math.round(v / obsTotal * 100));
  const entropy = calcEntropy(obsNorm);
  const loss = (maxEntropy - entropy) / maxEntropy;
  return loss > 0.3;
})());

// ─── 结果 ────────────────────────────────────────────────
console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);
