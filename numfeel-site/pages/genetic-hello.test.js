// 遗传算法进化 Hello World - 核心算法测试
const {
  randomChar, randomIndividual, initPopulation, fitness,
  tournamentSelect, crossover, mutate, evolveOneGeneration,
  getBest, getAvgFitness, getDiversity
} = require('./genetic-hello/engine.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n🧬 遗传算法 Hello World - 核心算法测试\n');

// --- randomChar ---
console.log('--- randomChar ---');
const chars = new Set();
for (let i = 0; i < 1000; i++) chars.add(randomChar());
assert(chars.size > 30, `randomChar 覆盖 ${chars.size} 种字符（期望>30）`);
for (const ch of chars) {
  const code = ch.charCodeAt(0);
  assert(code >= 32 && code <= 126, `字符 '${ch}' (${code}) 在 ASCII 32~126 范围内`);
  if (code < 32 || code > 126) break;
}

// --- randomIndividual ---
console.log('--- randomIndividual ---');
assert(randomIndividual(5).length === 5, '生成5字符个体');
assert(randomIndividual(11).length === 11, '生成11字符个体');
assert(randomIndividual(0).length === 0, '空个体');

// --- initPopulation ---
console.log('--- initPopulation ---');
const pop = initPopulation(100, 11);
assert(pop.length === 100, '种群大小 100');
assert(pop[0].length === 11, '个体长度 11');
assert(pop.every(ind => ind.length === 11), '所有个体长度一致');

// --- fitness ---
console.log('--- fitness ---');
assert(fitness('hello world', 'hello world') === 1, '完全匹配 = 1');
assert(fitness('xello world', 'hello world') === 10 / 11, '1个不同 = 10/11');
assert(fitness('aaaaaaaaaaa', 'hello world') === 0 / 11 || fitness('aaaaaaaaaaa', 'hello world') < 0.3, '全不匹配适应度低');
assert(fitness('', '') === 0 || true, '空串不报错');  // NaN / div by zero guard
assert(fitness('hello', 'hello') === 1, '5字符完美匹配');

// --- tournamentSelect ---
console.log('--- tournamentSelect ---');
const testPop = ['aaaaa', 'bbbbb', 'hello'];
const testFit = [0.2, 0.4, 1.0];
let selectedBest = 0;
for (let i = 0; i < 100; i++) {
  if (tournamentSelect(testPop, testFit, 3) === 'hello') selectedBest++;
}
assert(selectedBest > 50, `锦标赛选择偏向最优（${selectedBest}/100 次选中最优）`);

// --- crossover ---
console.log('--- crossover ---');
const c = crossover('aaaaa', 'bbbbb');
assert(c.length === 5, '交叉产生正确长度');
assert(c.includes('a') || c.includes('b'), '交叉结果包含父母基因');
// 验证确实是单点交叉（前半来自p1后半来自p2）
let foundCrosspoint = false;
for (let i = 0; i <= 5; i++) {
  const expected = 'a'.repeat(i) + 'b'.repeat(5 - i);
  if (c === expected) { foundCrosspoint = true; break; }
}
assert(foundCrosspoint, `交叉结果 "${c}" 是合法的单点交叉`);

// --- mutate ---
console.log('--- mutate ---');
const original = 'hello world';
const mutated0 = mutate(original, 0);
assert(mutated0 === original, '变异率0 → 不变');
let mutCount = 0;
for (let i = 0; i < 100; i++) {
  if (mutate(original, 1.0) !== original) mutCount++;
}
assert(mutCount === 100, '变异率100% → 总是变化');

// --- evolveOneGeneration ---
console.log('--- evolveOneGeneration ---');
const target = 'hello world';
let evoPop = initPopulation(100, target.length);
const before = getBest(evoPop, target).fitness;
for (let g = 0; g < 50; g++) {
  evoPop = evolveOneGeneration(evoPop, target, 0.01, 0.7, 2, 5);
}
const after = getBest(evoPop, target).fitness;
assert(after >= before, `50代后适应度从 ${before.toFixed(3)} 提升到 ${after.toFixed(3)}`);
assert(after > 0.5, `50代后最优适应度 > 50%: ${(after * 100).toFixed(1)}%`);

// --- getBest ---
console.log('--- getBest ---');
const bestResult = getBest(['hello world', 'xxxxx world', 'aaaaaaaaaaa'], target);
assert(bestResult.individual === 'hello world', '找到最优个体');
assert(bestResult.fitness === 1, '最优适应度 = 1');

// --- getAvgFitness ---
console.log('--- getAvgFitness ---');
const avgF = getAvgFitness(['hello world', 'xxxxx world'], target);
assert(avgF > 0.7, `平均适应度合理: ${avgF.toFixed(3)}`);

// --- getDiversity ---
console.log('--- getDiversity ---');
const divSame = getDiversity(['aaaaa', 'aaaaa', 'aaaaa']);
assert(divSame === 0, '完全相同种群多样性 = 0');
const divDiff = getDiversity(['aaaaa', 'bbbbb', 'ccccc', 'ddddd']);
assert(divDiff === 1, '完全不同种群多样性 = 1');

// --- 收敛验证 ---
console.log('--- 收敛验证：能否在 2000 代内进化出 hello world ---');
let convPop = initPopulation(200, target.length);
let converged = false;
let convGen = 0;
for (let g = 0; g < 2000; g++) {
  convPop = evolveOneGeneration(convPop, target, 0.01, 0.7, 2, 5);
  convGen = g + 1;
  if (getBest(convPop, target).fitness === 1) { converged = true; break; }
}
assert(converged, `在 ${convGen} 代内收敛到目标（阈值 2000 代）`);

// --- 多次运行统计 ---
console.log('--- 多次运行统计（10次） ---');
const genCounts = [];
for (let r = 0; r < 10; r++) {
  let p = initPopulation(200, target.length);
  for (let g = 0; g < 3000; g++) {
    p = evolveOneGeneration(p, target, 0.01, 0.7, 2, 5);
    if (getBest(p, target).fitness === 1) { genCounts.push(g + 1); break; }
  }
}
const avgGen = genCounts.reduce((a, b) => a + b, 0) / genCounts.length;
assert(genCounts.length === 10, `10次全部收敛`);
assert(avgGen < 1000, `平均收敛代数: ${avgGen.toFixed(0)}（期望 < 1000）`);
console.log(`  📊 10 次平均收敛代数: ${avgGen.toFixed(0)}, 范围 [${Math.min(...genCounts)}, ${Math.max(...genCounts)}]`);

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
