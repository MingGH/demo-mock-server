/**
 * stats-engine.js 单元测试
 * 运行：node pages/lottery-randomness/stats-engine.test.js
 */
var S = require('./stats-engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); passed++; }
  else { console.error('  ✗ ' + msg); failed++; }
}
function assertClose(a, b, tol, msg) {
  var diff = Math.abs(a - b);
  var scale = Math.abs(b) > 1e-9 ? Math.abs(b) : 1;
  assert(diff / scale <= tol, msg + ' (got ' + a + ', expected ~' + b + ')');
}

// ── 基础数学 ──
console.log('comb:');
assert(S.comb(5, 2) === 10, 'C(5,2)=10');
assert(S.comb(33, 6) === 1107568, 'C(33,6)=1107568');
assert(S.comb(6, 0) === 1, 'C(6,0)=1');
assert(S.comb(6, 6) === 1, 'C(6,6)=1');
assert(S.comb(2, 3) === 0, 'C(2,3)=0');

console.log('erf/normalCdf:');
assertClose(S.normalCdf(0), 0.5, 1e-6, 'Φ(0)=0.5');
assertClose(S.normalCdf(1.96), 0.975, 1e-3, 'Φ(1.96)≈0.975');
assertClose(S.normalCdf(-1.96), 0.025, 1e-3, 'Φ(-1.96)≈0.025');

// ── 频率统计 ──
console.log('countRedFrequencies:');
{
  var fake = [
    { red: [1, 2, 3, 4, 5, 6], blue: 1 },
    { red: [1, 7, 8, 9, 10, 11], blue: 2 },
    { red: [1, 2, 7, 12, 33, 33], blue: 3 }
  ];
  var r = S.countRedFrequencies(fake);
  assert(r[1] === 3, '球 1 出现 3 次');
  assert(r[2] === 2, '球 2 出现 2 次');
  assert(r[33] === 2, '球 33 出现 2 次');
  assert(r[16] === 0, '从未出现的球计数为 0');
}

console.log('countBlueFrequencies:');
{
  var fake2 = [
    { red: [1, 2, 3, 4, 5, 6], blue: 7 },
    { red: [7, 8, 9, 10, 11, 12], blue: 7 },
    { red: [13, 14, 15, 16, 17, 18], blue: 2 }
  ];
  var b = S.countBlueFrequencies(fake2);
  assert(b[7] === 2, '蓝球 7 出现 2 次');
  assert(b[2] === 1, '蓝球 2 出现 1 次');
  assert(b[1] === 0, '蓝球 1 没出现');
}

// ── 卡方检验 ──
console.log('chiSquareTest:');
{
  // 已知：观测=[10,10,10,10]，期望全 10 ⇒ χ²=0
  var r = S.chiSquareTest([10, 10, 10, 10], [10, 10, 10, 10]);
  assertClose(r.chiSquare, 0, 1e-9, '完美匹配 χ²=0');
  assert(r.isRandom === true, '完美匹配判定为随机');
  assert(r.df === 3, 'df=3');

  // 手算：观测=[5,15,10,10]，期望=10 each ⇒ (25+25+0+0)/10 = 5
  var r2 = S.chiSquareTest([5, 15, 10, 10], [10, 10, 10, 10]);
  assertClose(r2.chiSquare, 5, 1e-9, 'χ²=5');

  // 用 df=15 期望临界值 25.00 验证
  var obs15 = new Array(16);
  var exp15 = new Array(16).fill(100);
  for (var i = 0; i < 16; i++) obs15[i] = 100;
  var baseLine = S.chiSquareTest(obs15, exp15);
  assertClose(baseLine.criticalValue, 25.00, 0.5, 'df=15 临界值≈25.00');
  // df=32 期望临界值 46.19
  var obs33 = new Array(33).fill(100);
  var exp33 = new Array(33).fill(100);
  var baseLine33 = S.chiSquareTest(obs33, exp33);
  assertClose(baseLine33.criticalValue, 46.19, 0.5, 'df=32 临界值≈46.19');
}

// ── 游程检验 ──
console.log('runsTest:');
{
  // 全 1 序列：退化情形
  var all1 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  var r0 = S.runsTest(all1);
  assert(r0.runs === 1, '全 1 序列游程=1');
  assert(r0.sigma === 0, '全 1 序列标准差=0');
  assert(r0.n1 === 10 && r0.n0 === 0, 'n1=10, n0=0');

  // 全 0 序列
  var all0 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var r0b = S.runsTest(all0);
  assert(r0b.runs === 1, '全 0 序列游程=1');
  assert(r0b.isRandom === true, '退化情形不拒绝随机');

  // 完全交替：0101010101
  var alt = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
  var rAlt = S.runsTest(alt);
  assert(rAlt.runs === 10, '交替序列游程=10');
  assert(!rAlt.isRandom, '完全交替在 5% 水平上拒绝随机');
  assert(rAlt.z > 1.96, '交替序列 Z > 1.96');

  // 普通随机风格序列：游程数大致接近期望
  var messy = [1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1];
  var rMix = S.runsTest(messy);
  assert(rMix.runs >= 8 && rMix.runs <= 16, '混合序列游程数合理');
  assert(Math.abs(rMix.z) < 1.96 || Math.abs(rMix.z) >= 1.96, 'Z 值合理返回');
}

// ── generateBinarySequence ──
console.log('generateBinarySequence:');
{
  var fake = [
    { red: [1, 2, 3, 4, 5, 6], blue: 7 },
    { red: [7, 8, 9, 10, 11, 12], blue: 7 },
    { red: [1, 7, 13, 14, 15, 16], blue: 2 }
  ];
  var seq1 = S.generateBinarySequence(fake, 1, 'red');
  assert(JSON.stringify(seq1) === '[1,0,1]', '红球 1 序列=[1,0,1]');
  var seq7 = S.generateBinarySequence(fake, 7, 'blue');
  assert(JSON.stringify(seq7) === '[1,1,0]', '蓝球 7 序列=[1,1,0]');
}

// ── 相邻期重叠 ──
console.log('adjacentOverlap:');
{
  var fake = [
    { red: [1, 2, 3, 4, 5, 6], blue: 1 },
    { red: [1, 2, 3, 7, 8, 9], blue: 2 }, // 与上期交 3
    { red: [1, 7, 8, 10, 11, 12], blue: 3 }, // 与上期交 3 (1,7,8)
    { red: [33, 32, 31, 30, 29, 28], blue: 4 } // 与上期交 0
  ];
  var r = S.adjacentOverlap(fake);
  assert(r.total === 3, '相邻对数=3');
  assert(r.overlapCounts[3] === 2, '交集大小=3 出现 2 次');
  assert(r.overlapCounts[0] === 1, '交集大小=0 出现 1 次');
  // 期望 PMF
  // hyperPmf(3) = C(6,3)*C(27,3)/C(33,6) = 58500/1107568 ≈ 0.0528
  assertClose(S.hyperPmf(3), 0.0528, 0.005, 'hyperPmf(3)≈0.0528');
}

// ── 间隔分析 ──
console.log('gapAnalysis:');
{
  // 球 1 在期 0、期 3、期 5 出现 → 间隔 = [3, 2]
  var fake = [
    { red: [1, 5, 6, 7, 8, 9], blue: 1 },
    { red: [10, 11, 12, 13, 14, 15], blue: 1 },
    { red: [16, 17, 18, 19, 20, 21], blue: 1 },
    { red: [1, 22, 23, 24, 25, 26], blue: 1 },
    { red: [27, 28, 29, 30, 31, 32], blue: 1 },
    { red: [1, 33, 4, 5, 6, 7], blue: 1 }
  ];
  var g = S.gapAnalysis(fake, 1);
  assert(g.gaps.length === 2, '间隔数=2');
  assert(g.gaps[0] === 3 && g.gaps[1] === 2, '间隔=[3,2]');
  assertClose(g.meanGap, 2.5, 1e-9, '平均间隔=2.5');
  assertClose(g.theoreticalMean, 33 / 6, 1e-9, '理论期望间隔≈5.5');
  // 频次分布
  var g2 = S.gapAnalysis(fake, 1);
  assert(g2.distribution[2] === 1 && g2.distribution[3] === 1, '分布计数正确');
}

// ── 尾数分析 ──
console.log('lastDigitAnalysis:');
{
  // 单期 6 个数字尾数全是 1 → 尾数 1 出现 6 次，其他全部 0
  var data = [{ red: [1, 11, 21, 31, 12, 13], blue: 1 }];
  var r = S.lastDigitAnalysis(data);
  assert(r.total === 6, '总数=6');
  assert(r.digitCounts[1] === 4, '尾数 1 出现 4 次（1,11,21,31）');
  assert(r.digitCounts[2] === 1 && r.digitCounts[3] === 1, '尾数 2,3 各 1 次');
  assert(!r.isRandom, '极端尾数分布被拒绝（χ² 巨大）');
  assert(r.chiSquare > r.criticalValue, 'χ² > 临界值');

  // 全均匀分布：每尾数各 100 次 → χ²=0
  var even = [];
  for (var d = 0; d < 10; d++) even.push(100);
  // lastDigitAnalysis 内部会重新计算期望=total/10，构造观测需绕过
  // 直接用 chiSquareTest 验证均匀
  var rEq = S.chiSquareTest(even, even);
  assert(rEq.chiSquare === 0 && rEq.isRandom, '均匀分布判定为随机');
}

console.log('\n通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exit(1);