/**
 * matthew-effect.test.js
 * node pages/matthew-effect.test.js
 */
const { simulateMatthewEffect, simulateTwoContents, simulateTwoContentsAvg, calcGini, calcTop20, powerLawTheory } = require('./matthew-effect.js');

let passed = 0, failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log('  ✓', desc);
    passed++;
  } else {
    console.error('  ✗', desc);
    failed++;
  }
}

// --- calcGini ---
console.log('\n[calcGini]');
assert('完全平等时基尼系数为0', calcGini([10, 10, 10, 10]) === 0);
assert('极度不平等时基尼系数接近1', calcGini([1000, 0, 0, 0]) > 0.7);
assert('基尼系数在0~1之间', calcGini([5, 10, 20, 50, 100]) >= 0 && calcGini([5, 10, 20, 50, 100]) <= 1);

// --- calcTop20 ---
console.log('\n[calcTop20]');
assert('完全平等时前20%占比约20%', Math.abs(calcTop20([10,10,10,10,10]) - 20) < 1);
assert('极度不平等时前20%占比远超20%', calcTop20([100, 1, 1, 1, 1]) > 80);

// --- simulateTwoContents ---
console.log('\n[simulateTwoContents]');
const two = simulateTwoContents({ boostA: 20, boostB: 0, alpha: 0.9, rounds: 200 });
assert('historyA长度正确', two.historyA.length === 201);
assert('historyB长度正确', two.historyB.length === 201);
assert('初始A点赞 = 1+20', two.historyA[0] === 21);
assert('初始B点赞 = 1', two.historyB[0] === 1);
assert('最终A点赞 > 最终B点赞（强马太）', two.finalA > two.finalB);
assert('总点赞数守恒（A+B = 初始 + 每轮10*200）', two.finalA + two.finalB === 21 + 1 + 10 * 200);

// --- simulateTwoContentsAvg ---
console.log('\n[simulateTwoContentsAvg]');
const avg = simulateTwoContentsAvg({ boostA: 10, boostB: 0, alpha: 0.8, rounds: 100, trials: 100 });
assert('avgA长度正确', avg.avgA.length === 101);
assert('avgB长度正确', avg.avgB.length === 101);
assert('强马太下A的均值 > B的均值', avg.avgA[100] > avg.avgB[100]);
assert('finalRatio > 1', avg.finalRatio > 1);

// --- simulateMatthewEffect ---
console.log('\n[simulateMatthewEffect]');
const dist = simulateMatthewEffect({ contentCount: 50, totalLikes: 5000, alpha: 0.8, rounds: 50 });
assert('likes数组长度正确', dist.likes.length === 50);
assert('likes已降序排列', dist.likes[0] >= dist.likes[dist.likes.length - 1]);
assert('基尼系数在合理范围', dist.gini >= 0 && dist.gini <= 1);
assert('top20pct在合理范围', dist.top20pct >= 0 && dist.top20pct <= 100);
assert('强马太下前20%占比超过40%', dist.top20pct > 40);

// α=0 时应接近均匀分布
const distFlat = simulateMatthewEffect({ contentCount: 50, totalLikes: 5000, alpha: 0, rounds: 50 });
assert('α=0时基尼系数较小（接近均匀）', distFlat.gini < 0.3);

// --- powerLawTheory ---
console.log('\n[powerLawTheory]');
const pl = powerLawTheory(100, 2.0, 20);
assert('返回正确数量的点', pl.length === 20);
assert('概率之和约为1', Math.abs(pl.reduce((a, b) => a + b.p, 0) - 1) < 0.01);
assert('k=1时概率最大', pl[0].p > pl[pl.length - 1].p);

// --- 汇总 ---
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) process.exit(1);
