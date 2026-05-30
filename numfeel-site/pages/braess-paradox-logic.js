/**
 * 布雷斯悖论核心算法
 * Braess's Paradox — Core Logic
 *
 * 经典四节点交通网络:
 *   S → A (延迟 = T/100, T为该路段车辆数)
 *   S → B (延迟 = 45 分钟, 固定)
 *   A → E (延迟 = 45 分钟, 固定)
 *   B → E (延迟 = T/100, T为该路段车辆数)
 *   A → B (捷径, 延迟 = 0 或 10 分钟)
 *
 * 4000 辆车从 S 到 E，每个司机自私选择最短路径（纳什均衡）
 */

const DEFAULT_NETWORK = {
  totalCars: 4000,
  // 边的定义: [from, to, type, param]
  // type: 'linear' => delay = cars * param, 'fixed' => delay = param
  edges: {
    'S-A': { type: 'linear', param: 1/100 },
    'S-B': { type: 'fixed', param: 45 },
    'A-E': { type: 'fixed', param: 45 },
    'B-E': { type: 'linear', param: 1/100 },
    'A-B': { type: 'fixed', param: 0, enabled: false }
  }
};

/**
 * 计算某条边的延迟
 */
function edgeDelay(edge, cars) {
  if (edge.type === 'linear') return cars * edge.param;
  return edge.param;
}

/**
 * 枚举所有可能的路径
 */
function getAllPaths(hasShortcut) {
  const paths = [
    { id: 'S-A-E', edges: ['S-A', 'A-E'], label: 'S → A → E' },
    { id: 'S-B-E', edges: ['S-B', 'B-E'], label: 'S → B → E' }
  ];
  if (hasShortcut) {
    paths.push({ id: 'S-A-B-E', edges: ['S-A', 'A-B', 'B-E'], label: 'S → A → B → E' });
  }
  return paths;
}

/**
 * 计算路径延迟（给定每条边的车辆数）
 */
function pathDelay(path, edgeCars, edges) {
  let total = 0;
  for (const eid of path.edges) {
    total += edgeDelay(edges[eid], edgeCars[eid] || 0);
  }
  return total;
}

/**
 * 求纳什均衡（迭代最优响应法）
 * 每个司机自私地选择当前最短路径
 * 返回 { edgeCars, pathFlows, pathDelays, avgDelay }
 */
function solveNashEquilibrium(network) {
  const { totalCars, edges } = network;
  const hasShortcut = edges['A-B'] && edges['A-B'].enabled;
  const paths = getAllPaths(hasShortcut);

  // 初始化：均匀分配
  const pathFlows = {};
  for (const p of paths) pathFlows[p.id] = 0;

  // 逐车分配（贪心近似纳什均衡）
  for (let car = 0; car < totalCars; car++) {
    // 计算当前每条边的车辆数
    const edgeCars = computeEdgeCars(paths, pathFlows);

    // 找延迟最小的路径
    let bestPath = null;
    let bestDelay = Infinity;
    for (const p of paths) {
      // 模拟这辆车加入该路径后的延迟
      const tempEdgeCars = { ...edgeCars };
      for (const eid of p.edges) {
        tempEdgeCars[eid] = (tempEdgeCars[eid] || 0) + 1;
      }
      const d = pathDelay(p, tempEdgeCars, edges);
      if (d < bestDelay) {
        bestDelay = d;
        bestPath = p;
      }
    }
    pathFlows[bestPath.id]++;
  }

  // 最终结果
  const edgeCars = computeEdgeCars(paths, pathFlows);
  const pathDelays = {};
  for (const p of paths) {
    pathDelays[p.id] = pathDelay(p, edgeCars, edges);
  }

  // 加权平均延迟
  let totalDelay = 0;
  for (const p of paths) {
    totalDelay += pathFlows[p.id] * pathDelays[p.id];
  }
  const avgDelay = totalDelay / totalCars;

  return { edgeCars, pathFlows, pathDelays, avgDelay, paths };
}

/**
 * 从路径流量计算每条边的车辆数
 */
function computeEdgeCars(paths, pathFlows) {
  const edgeCars = {};
  for (const p of paths) {
    for (const eid of p.edges) {
      edgeCars[eid] = (edgeCars[eid] || 0) + (pathFlows[p.id] || 0);
    }
  }
  return edgeCars;
}


/**
 * 社会最优解（最小化总延迟）
 * 用解析法求解
 */
function solveSocialOptimum(network) {
  const { totalCars, edges } = network;
  const hasShortcut = edges['A-B'] && edges['A-B'].enabled;
  const paths = getAllPaths(hasShortcut);

  if (!hasShortcut) {
    // 无捷径时，对称分配就是最优
    const half = totalCars / 2;
    const pathFlows = { 'S-A-E': half, 'S-B-E': half };
    const edgeCars = computeEdgeCars(paths, pathFlows);
    const pathDelays = {};
    for (const p of paths) {
      pathDelays[p.id] = pathDelay(p, edgeCars, edges);
    }
    const avgDelay = pathDelays['S-A-E']; // 对称，两条路一样
    return { edgeCars, pathFlows, pathDelays, avgDelay, paths };
  }

  // 有捷径时，暴力搜索最优分配
  let bestAvg = Infinity;
  let bestFlows = null;
  const step = Math.max(1, Math.floor(totalCars / 200));

  for (let f1 = 0; f1 <= totalCars; f1 += step) {
    for (let f2 = 0; f2 <= totalCars - f1; f2 += step) {
      const f3 = totalCars - f1 - f2;
      const pf = { 'S-A-E': f1, 'S-B-E': f2, 'S-A-B-E': f3 };
      const ec = computeEdgeCars(paths, pf);
      let total = 0;
      for (const p of paths) {
        total += pf[p.id] * pathDelay(p, ec, edges);
      }
      const avg = total / totalCars;
      if (avg < bestAvg) {
        bestAvg = avg;
        bestFlows = { ...pf };
      }
    }
  }

  const edgeCars = computeEdgeCars(paths, bestFlows);
  const pathDelays = {};
  for (const p of paths) {
    pathDelays[p.id] = pathDelay(p, edgeCars, edges);
  }

  return { edgeCars, pathFlows: bestFlows, pathDelays, avgDelay: bestAvg, paths };
}

/**
 * 对比有无捷径的纳什均衡
 */
function compareBraess(totalCars) {
  totalCars = totalCars || 4000;

  // 无捷径
  const networkWithout = {
    totalCars,
    edges: {
      'S-A': { type: 'linear', param: 1/100 },
      'S-B': { type: 'fixed', param: 45 },
      'A-E': { type: 'fixed', param: 45 },
      'B-E': { type: 'linear', param: 1/100 },
      'A-B': { type: 'fixed', param: 0, enabled: false }
    }
  };

  // 有捷径
  const networkWith = {
    totalCars,
    edges: {
      'S-A': { type: 'linear', param: 1/100 },
      'S-B': { type: 'fixed', param: 45 },
      'A-E': { type: 'fixed', param: 45 },
      'B-E': { type: 'linear', param: 1/100 },
      'A-B': { type: 'fixed', param: 0, enabled: true }
    }
  };

  const withoutResult = solveNashEquilibrium(networkWithout);
  const withResult = solveNashEquilibrium(networkWith);
  const optWithout = solveSocialOptimum(networkWithout);
  const optWith = solveSocialOptimum(networkWith);

  return {
    without: withoutResult,
    with: withResult,
    optWithout,
    optWith,
    paradoxDelta: withResult.avgDelay - withoutResult.avgDelay
  };
}

/**
 * 模拟不同车辆数下的悖论效应
 * 返回 { carCounts, withoutDelays, withDelays, deltas }
 */
function simulateCarRange(minCars, maxCars, step) {
  minCars = minCars || 1000;
  maxCars = maxCars || 8000;
  step = step || 500;

  const carCounts = [];
  const withoutDelays = [];
  const withDelays = [];
  const deltas = [];

  for (let n = minCars; n <= maxCars; n += step) {
    const result = compareBraess(n);
    carCounts.push(n);
    withoutDelays.push(Math.round(result.without.avgDelay * 100) / 100);
    withDelays.push(Math.round(result.with.avgDelay * 100) / 100);
    deltas.push(Math.round(result.paradoxDelta * 100) / 100);
  }

  return { carCounts, withoutDelays, withDelays, deltas };
}

/**
 * 内卷模型：N个人选择加班或不加班
 * 加班的人获得相对优势，但所有人都付出额外成本
 * 当所有人都加班时，相对优势消失，但成本仍在
 */
function simulateInvolution(nPeople, rounds) {
  nPeople = nPeople || 100;
  rounds = rounds || 50;

  const baseSalary = 100;
  const overtimeCost = 20;    // 加班的个人成本
  const overtimeBonus = 50;   // 加班的相对奖金池（按加班人数比例分配）

  const history = [];
  let overtimeRate = 0.1; // 初始10%的人加班

  for (let r = 0; r < rounds; r++) {
    const nOvertime = Math.round(nPeople * overtimeRate);
    const nNormal = nPeople - nOvertime;

    // 加班者的收益：基础工资 - 加班成本 + 奖金/加班人数
    const overtimePayoff = nOvertime > 0
      ? baseSalary - overtimeCost + overtimeBonus * (nNormal / nPeople)
      : 0;

    // 不加班者的收益：基础工资 - 被加班者抢走的份额
    const normalPayoff = baseSalary - overtimeBonus * (nOvertime / nPeople);

    history.push({
      round: r,
      overtimeRate: Math.round(overtimeRate * 1000) / 10,
      overtimePayoff: Math.round(overtimePayoff * 100) / 100,
      normalPayoff: Math.round(normalPayoff * 100) / 100,
      avgPayoff: Math.round(
        (nOvertime * overtimePayoff + nNormal * normalPayoff) / nPeople * 100
      ) / 100
    });

    // 下一轮：不加班的人看到加班者收益更高，就会跟风
    if (overtimePayoff > normalPayoff && overtimeRate < 1) {
      overtimeRate = Math.min(1, overtimeRate + 0.05);
    } else if (overtimePayoff < normalPayoff && overtimeRate > 0) {
      overtimeRate = Math.max(0, overtimeRate - 0.05);
    }
  }

  return {
    history,
    finalState: history[history.length - 1],
    equilibrium: '所有人加班，但平均收益低于所有人不加班'
  };
}

/**
 * 自定义网络求解器
 * edges: { 'X-Y': { type, param, enabled } }
 */
function solveCustomNetwork(totalCars, edges) {
  const network = { totalCars, edges };
  return solveNashEquilibrium(network);
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    edgeDelay, getAllPaths, pathDelay, computeEdgeCars,
    solveNashEquilibrium, solveSocialOptimum,
    compareBraess, simulateCarRange, simulateInvolution,
    solveCustomNetwork, DEFAULT_NETWORK
  };
}
