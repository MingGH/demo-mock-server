// ========== 抽卡概率核心算法（可独立测试） ==========

/**
 * 模拟单次抽卡（含保底机制）
 * @param {number} baseRate - 基础概率 (0~1)
 * @param {number} pity - 当前已垫抽数
 * @param {number} softPity - 软保底起始抽数
 * @param {number} hardPity - 硬保底抽数
 * @param {number} softPityRate - 软保底后每抽增加的概率
 * @returns {{hit: boolean, newPity: number}}
 */
function simulatePull(baseRate, pity, softPity, hardPity, softPityRate) {
  const currentPity = pity + 1;
  if (currentPity >= hardPity) {
    return { hit: true, newPity: 0 };
  }
  let rate = baseRate;
  if (currentPity > softPity) {
    rate = baseRate + (currentPity - softPity) * softPityRate;
  }
  rate = Math.min(rate, 1);
  const roll = Math.random();
  if (roll < rate) {
    return { hit: true, newPity: 0 };
  }
  return { hit: false, newPity: currentPity };
}

/**
 * 模拟抽到目标角色需要的抽数
 * @param {object} config - 卡池配置
 * @returns {number} 花费的抽数
 */
function simulateUntilHit(config) {
  let pity = 0;
  let pulls = 0;
  while (true) {
    pulls++;
    const result = simulatePull(
      config.baseRate, pity, config.softPity, config.hardPity, config.softPityRate
    );
    pity = result.newPity;
    if (result.hit) {
      // 如果有50/50机制（大保底）
      if (config.fiftyFifty) {
        if (Math.random() < 0.5) {
          return pulls; // 小保底直接出
        }
        // 歪了，继续抽到大保底
        while (true) {
          pulls++;
          const r2 = simulatePull(
            config.baseRate, pity, config.softPity, config.hardPity, config.softPityRate
          );
          pity = r2.newPity;
          if (r2.hit) return pulls;
        }
      }
      return pulls;
    }
  }
}

/**
 * 批量模拟，返回抽数分布
 * @param {object} config - 卡池配置
 * @param {number} times - 模拟次数
 * @returns {number[]} 每次模拟的抽数
 */
function batchSimulate(config, times) {
  const results = [];
  for (let i = 0; i < times; i++) {
    results.push(simulateUntilHit(config));
  }
  return results;
}

/**
 * 计算分布统计量
 * @param {number[]} data
 * @returns {{mean: number, median: number, p25: number, p75: number, p90: number, min: number, max: number}}
 */
function calcStats(data) {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    mean: sum / n,
    median: sorted[Math.floor(n * 0.5)],
    p25: sorted[Math.floor(n * 0.25)],
    p75: sorted[Math.floor(n * 0.75)],
    p90: sorted[Math.floor(n * 0.9)],
    p99: sorted[Math.floor(n * 0.99)],
    min: sorted[0],
    max: sorted[n - 1]
  };
}

/**
 * 生成频率分布（直方图数据）
 * @param {number[]} data
 * @param {number} binSize - 每个区间的宽度
 * @returns {{labels: string[], counts: number[], freqs: number[]}}
 */
function histogram(data, binSize) {
  const max = Math.max(...data);
  const bins = Math.ceil(max / binSize);
  const counts = new Array(bins).fill(0);
  data.forEach(v => {
    const idx = Math.min(Math.floor(v / binSize), bins - 1);
    counts[idx]++;
  });
  const labels = counts.map((_, i) => `${i * binSize + 1}-${(i + 1) * binSize}`);
  const freqs = counts.map(c => c / data.length);
  return { labels, counts, freqs };
}

/**
 * 计算累积概率（CDF）
 * @param {number[]} data
 * @param {number} maxVal
 * @returns {{x: number[], y: number[]}}
 */
function cumulativeProb(data, maxVal) {
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  const x = [];
  const y = [];
  for (let i = 1; i <= maxVal; i++) {
    x.push(i);
    // 有多少比例的模拟在i抽以内出货
    const count = sorted.filter(v => v <= i).length;
    y.push(count / n);
  }
  return { x, y };
}

/**
 * 策略模拟：给定预算，不同策略的收益
 * @param {object} config - 卡池配置
 * @param {number} budget - 总预算（抽数）
 * @param {string} strategy - 'yolo' | 'save' | 'discount'
 * @returns {{characters: number, pulls: number, leftover: number}}
 */
function strategySimulate(config, budget, strategy) {
  let pulls = 0;
  let characters = 0;
  let pity = 0;

  if (strategy === 'yolo') {
    // 无脑抽：有石头就抽
    while (pulls < budget) {
      pulls++;
      const result = simulatePull(
        config.baseRate, pity, config.softPity, config.hardPity, config.softPityRate
      );
      pity = result.newPity;
      if (result.hit) {
        if (config.fiftyFifty) {
          if (Math.random() < 0.5) {
            characters++;
          } else {
            // 歪了，继续
            while (pulls < budget) {
              pulls++;
              const r2 = simulatePull(
                config.baseRate, pity, config.softPity, config.hardPity, config.softPityRate
              );
              pity = r2.newPity;
              if (r2.hit) { characters++; break; }
            }
          }
        } else {
          characters++;
        }
      }
    }
  } else if (strategy === 'save') {
    // 攒保底：攒够硬保底数量才抽
    const target = config.fiftyFifty ? config.hardPity * 2 : config.hardPity;
    while (pulls + target <= budget) {
      // 一轮抽到出
      let roundPulls = 0;
      let got = false;
      let localPity = 0;
      while (!got && pulls < budget) {
        pulls++;
        roundPulls++;
        const result = simulatePull(
          config.baseRate, localPity, config.softPity, config.hardPity, config.softPityRate
        );
        localPity = result.newPity;
        if (result.hit) {
          if (config.fiftyFifty) {
            if (Math.random() < 0.5) {
              characters++;
              got = true;
            } else {
              while (pulls < budget) {
                pulls++;
                const r2 = simulatePull(
                  config.baseRate, localPity, config.softPity, config.hardPity, config.softPityRate
                );
                localPity = r2.newPity;
                if (r2.hit) { characters++; got = true; break; }
              }
            }
          } else {
            characters++;
            got = true;
          }
        }
      }
      if (!got) break;
    }
  } else if (strategy === 'discount') {
    // 只在半价/优惠时抽（模拟为每抽成本0.5，即预算翻倍）
    const effectiveBudget = budget * 2;
    let effectivePulls = 0;
    while (effectivePulls < effectiveBudget) {
      effectivePulls++;
      pulls++;
      const result = simulatePull(
        config.baseRate, pity, config.softPity, config.hardPity, config.softPityRate
      );
      pity = result.newPity;
      if (result.hit) {
        if (config.fiftyFifty) {
          if (Math.random() < 0.5) {
            characters++;
          } else {
            while (effectivePulls < effectiveBudget) {
              effectivePulls++;
              pulls++;
              const r2 = simulatePull(
                config.baseRate, pity, config.softPity, config.hardPity, config.softPityRate
              );
              pity = r2.newPity;
              if (r2.hit) { characters++; break; }
            }
          }
        } else {
          characters++;
        }
      }
    }
  }

  return { characters, pulls, leftover: Math.max(0, budget - pulls) };
}

/**
 * 计算理论期望抽数（不含保底的简单情况）
 * @param {number} rate - 概率
 * @returns {number} 期望抽数 = 1/rate
 */
function theoreticalExpected(rate) {
  return 1 / rate;
}

/**
 * 计算n抽内出货的理论概率（不含保底）
 * @param {number} rate - 单抽概率
 * @param {number} n - 抽数
 * @returns {number} 概率
 */
function probWithinN(rate, n) {
  return 1 - Math.pow(1 - rate, n);
}

/**
 * 赌徒谬误检测：连续不出的概率
 * @param {number} rate - 单抽概率
 * @param {number} streak - 连续不出的次数
 * @returns {number} 概率
 */
function streakProbability(rate, streak) {
  return Math.pow(1 - rate, streak);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulatePull, simulateUntilHit, batchSimulate, calcStats,
    histogram, cumulativeProb, strategySimulate,
    theoreticalExpected, probWithinN, streakProbability
  };
}
