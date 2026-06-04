// ========== EHP 词条对比核心算法（可独立测试） ==========

/**
 * 计算有效生命值 (Effective HP)
 * EHP = HP / (1 - DR)
 * @param {number} hp - 当前生命值
 * @param {number} dr - 当前免伤比例 (0~0.99)
 * @returns {number}
 */
function calcEHP(hp, dr) {
  if (dr >= 1) return Infinity;
  if (dr < 0) dr = 0;
  return hp / (1 - dr);
}

/**
 * 生命值+5%后的 EHP 增量
 */
function ehpGainFromHP(hp, dr, pct) {
  const base = calcEHP(hp, dr);
  const after = calcEHP(hp * (1 + pct), dr);
  return after - base;
}

/**
 * 免伤+5%后的 EHP 增量（绝对值加成，如 30%→35%）
 */
function ehpGainFromDR(hp, dr, flat) {
  const base = calcEHP(hp, dr);
  const after = calcEHP(hp, Math.min(dr + flat, 0.99));
  return after - base;
}

/**
 * EHP 增益百分比
 */
function ehpGainPct(before, after) {
  if (before <= 0) return 0;
  return (after - before) / before;
}

/**
 * 给定预算 N 个 5% 点数，枚举最优分配
 * 返回 { hpPoints, drPoints, ehp } 表示把多少点给HP、多少给DR能最大化EHP
 */
function optimalAllocation(hp, dr, totalPoints, hpPct, drFlat) {
  let best = { hpPoints: 0, drPoints: 0, ehp: 0 };
  for (let hpPts = 0; hpPts <= totalPoints; hpPts++) {
    const drPts = totalPoints - hpPts;
    const newHP = hp * (1 + hpPct * hpPts);
    const newDR = Math.min(dr + drFlat * drPts, 0.99);
    const ehp = calcEHP(newHP, newDR);
    if (ehp > best.ehp) {
      best = { hpPoints: hpPts, drPoints: drPts, ehp };
    }
  }
  return best;
}

/**
 * 生成免伤从 0% 到 maxDR 的 EHP 增益对比数据
 * 返回 { labels, hpGains, drGains }
 */
function generateComparisonData(hp, maxDR, step, hpPct, drFlat) {
  const labels = [];
  const hpGains = [];
  const drGains = [];
  for (let d = 0; d <= maxDR; d += step) {
    const dr = Math.round(d * 100) / 100;
    labels.push((dr * 100).toFixed(0) + '%');
    hpGains.push(ehpGainPct(calcEHP(hp, dr), calcEHP(hp * (1 + hpPct), dr)));
    drGains.push(ehpGainPct(calcEHP(hp, dr), calcEHP(hp, Math.min(dr + drFlat, 0.99))));
  }
  return { labels, hpGains, drGains };
}

/**
 * 计算两条增益曲线的交叉点（免伤值）
 * 即 HP+5% 和 免伤+5% 带来相同 EHP 增益的临界免伤
 * 解析解: 1 - DR_new = (1 - DR) / (1 + hpPct)
 *          DR + drFlat = 1 - (1 - DR)/(1 + hpPct)
 *          设 x = 1 - DR:  x - drFlat = x/(1+hpPct)
 *          x(1 - 1/(1+hpPct)) = drFlat
 *          x = drFlat * (1+hpPct) / hpPct
 *          DR = 1 - drFlat*(1+hpPct)/hpPct
 */
function crossoverDR(hpPct, drFlat) {
  const x = drFlat * (1 + hpPct) / hpPct;
  const dr = 1 - x;
  return Math.max(0, Math.min(dr, 0.99));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcEHP, ehpGainFromHP, ehpGainFromDR, ehpGainPct,
    optimalAllocation, generateComparisonData, crossoverDR
  };
}
