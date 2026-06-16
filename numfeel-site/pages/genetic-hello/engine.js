// ========== 遗传算法核心（可独立测试） ==========

/**
 * 生成随机字符（可打印 ASCII 32~126）
 */
function randomChar() {
  return String.fromCharCode(32 + Math.floor(Math.random() * 95));
}

/**
 * 生成随机个体（长度与目标一致）
 */
function randomIndividual(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += randomChar();
  return s;
}

/**
 * 初始化种群
 */
function initPopulation(size, targetLen) {
  const pop = [];
  for (let i = 0; i < size; i++) pop.push(randomIndividual(targetLen));
  return pop;
}

/**
 * 适应度函数：正确字符数 / 总长度（0~1）
 */
function fitness(individual, target) {
  let match = 0;
  for (let i = 0; i < target.length; i++) {
    if (individual[i] === target[i]) match++;
  }
  return match / target.length;
}

/**
 * 锦标赛选择（tournamentSize 个随机个体中选最优）
 */
function tournamentSelect(population, fitnesses, tournamentSize) {
  let bestIdx = Math.floor(Math.random() * population.length);
  for (let i = 1; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    if (fitnesses[idx] > fitnesses[bestIdx]) bestIdx = idx;
  }
  return population[bestIdx];
}

/**
 * 单点交叉
 */
function crossover(parent1, parent2) {
  const point = Math.floor(Math.random() * parent1.length);
  return parent1.slice(0, point) + parent2.slice(point);
}

/**
 * 逐字符变异
 */
function mutate(individual, mutationRate) {
  let result = '';
  for (let i = 0; i < individual.length; i++) {
    if (Math.random() < mutationRate) {
      result += randomChar();
    } else {
      result += individual[i];
    }
  }
  return result;
}

/**
 * 执行一代进化，返回新种群
 */
function evolveOneGeneration(population, target, mutationRate, crossoverRate, eliteCount, tournamentSize) {
  const fitnesses = population.map(ind => fitness(ind, target));

  // 精英保留
  const indexed = fitnesses.map((f, i) => ({ f, i }));
  indexed.sort((a, b) => b.f - a.f);
  const newPop = [];
  for (let i = 0; i < eliteCount; i++) {
    newPop.push(population[indexed[i].i]);
  }

  // 生成后代填满种群
  while (newPop.length < population.length) {
    const p1 = tournamentSelect(population, fitnesses, tournamentSize);
    const p2 = tournamentSelect(population, fitnesses, tournamentSize);
    let child = Math.random() < crossoverRate ? crossover(p1, p2) : p1;
    child = mutate(child, mutationRate);
    newPop.push(child);
  }
  return newPop;
}

/**
 * 获取种群中最优个体及其适应度
 */
function getBest(population, target) {
  let bestFit = -1, bestInd = '';
  for (const ind of population) {
    const f = fitness(ind, target);
    if (f > bestFit) { bestFit = f; bestInd = ind; }
  }
  return { individual: bestInd, fitness: bestFit };
}

/**
 * 获取种群平均适应度
 */
function getAvgFitness(population, target) {
  let sum = 0;
  for (const ind of population) sum += fitness(ind, target);
  return sum / population.length;
}

/**
 * 计算种群多样性（平均汉明距离占比）
 */
function getDiversity(population) {
  if (population.length < 2) return 0;
  const sampleSize = Math.min(50, population.length);
  let totalDiff = 0, comparisons = 0;
  for (let i = 0; i < sampleSize; i++) {
    for (let j = i + 1; j < sampleSize; j++) {
      let diff = 0;
      for (let k = 0; k < population[i].length; k++) {
        if (population[i][k] !== population[j][k]) diff++;
      }
      totalDiff += diff / population[i].length;
      comparisons++;
    }
  }
  return totalDiff / comparisons;
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    randomChar, randomIndividual, initPopulation, fitness,
    tournamentSelect, crossover, mutate, evolveOneGeneration,
    getBest, getAvgFitness, getDiversity
  };
}
