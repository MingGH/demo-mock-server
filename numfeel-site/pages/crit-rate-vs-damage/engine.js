// ========== 暴击率 vs 暴击伤害 核心算法（可独立测试） ==========
// 约定：
//   critRate    ∈ [0, 1]   暴击发生概率
//   critDamage  ≥ 0        暴击额外加成（0.5 表示暴击时打 1.5 倍伤害）
//   一次攻击的期望伤害： base * (1 + critRate * critDamage)
//   一次攻击的实际伤害： 非暴击 → base；暴击 → base * (1 + critDamage)

/**
 * 单次攻击的期望伤害
 * @param {number} base 基础伤害
 * @param {number} cr 暴击率 [0,1]
 * @param {number} cd 暴击伤害（额外倍率，0.5 表示打 1.5 倍）
 * @returns {number}
 */
function expectedDamage(base, cr, cd) {
  return base * (1 + cr * cd);
}

/**
 * 单次伤害分布的标准差（理论值）
 * Var = base² * cd² * cr * (1-cr)
 * @returns {number}
 */
function damageStd(base, cr, cd) {
  return base * cd * Math.sqrt(cr * (1 - cr));
}

/**
 * 加上 +Δcr 暴击率后的期望增量
 * @param {number} base
 * @param {number} cr
 * @param {number} cd
 * @param {number} dCr 例如 0.05
 * @returns {number}
 */
function marginalGainRate(base, cr, cd, dCr) {
  // 暴击率上限 100%，溢出归零
  var newCr = Math.min(cr + dCr, 1);
  var gained = newCr - cr;
  return base * gained * cd;
}

/**
 * 加上 +Δcd 暴击伤害后的期望增量
 * @returns {number}
 */
function marginalGainDamage(base, cr, cd, dCd) {
  return base * cr * dCd;
}

/**
 * 给定当前 (cr, cd)，比较两个候选词条哪个收益更高
 * @returns {{choice:'rate'|'damage'|'equal', gainRate:number, gainDamage:number, ratio:number}}
 *   ratio = 暴伤词条收益 / 暴击率词条收益
 */
function recommend(base, cr, cd, dCr, dCd) {
  var gainRate = marginalGainRate(base, cr, cd, dCr);
  var gainDamage = marginalGainDamage(base, cr, cd, dCd);
  var diff = gainRate - gainDamage;
  var choice;
  if (Math.abs(diff) < 1e-9) choice = 'equal';
  else choice = diff > 0 ? 'rate' : 'damage';
  var ratio = gainRate > 0 ? gainDamage / gainRate : Infinity;
  return { choice: choice, gainRate: gainRate, gainDamage: gainDamage, ratio: ratio };
}

/**
 * 等值临界点：给定 dCr 和 dCd，求出"两个词条收益相等"时的暴伤/暴击率比例 k
 * 满足 cr*dCd = dCr*cd  →  cd = (dCd/dCr) * cr
 * @returns {number} k 使得当 cd = k * cr 时两词条等价
 */
function equalRatio(dCr, dCd) {
  return dCd / dCr;
}

/**
 * 给定 cr，求出使两词条等价的暴伤值
 * @returns {number}
 */
function crossoverCd(cr, dCr, dCd) {
  return cr * equalRatio(dCr, dCd);
}

/**
 * 蒙特卡洛：模拟 n 次单次伤害，返回伤害数组
 * @param {number} base
 * @param {number} cr
 * @param {number} cd
 * @param {number} n
 * @param {()=>number} rng 可注入的随机源，默认 Math.random
 * @returns {number[]}
 */
function simulateHits(base, cr, cd, n, rng) {
  rng = rng || Math.random;
  var out = new Array(n);
  for (var i = 0; i < n; i++) {
    out[i] = rng() < cr ? base * (1 + cd) : base;
  }
  return out;
}

/**
 * 模拟一次 Boss 战：每秒打 hitsPerSec 次，直到 boss 血量归零
 * @param {number} base
 * @param {number} cr
 * @param {number} cd
 * @param {number} bossHP
 * @param {()=>number} rng
 * @returns {number} 击杀所需的攻击次数
 */
function hitsToKill(base, cr, cd, bossHP, rng) {
  rng = rng || Math.random;
  var hp = bossHP;
  var hits = 0;
  while (hp > 0 && hits < 1e7) {
    var dmg = rng() < cr ? base * (1 + cd) : base;
    hp -= dmg;
    hits++;
  }
  return hits;
}

/**
 * 数组统计量
 */
function arrayMean(arr) {
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}
function arrayStd(arr) {
  if (arr.length < 2) return 0;
  var m = arrayMean(arr);
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(s / (arr.length - 1));
}

/**
 * 把伤害样本分成 binCount 个桶，用于画直方图
 * @param {number[]} samples
 * @param {number} binCount
 * @returns {{bins:number[], counts:number[], min:number, max:number, binWidth:number}}
 */
function histogram(samples, binCount) {
  binCount = binCount || 20;
  var min = Infinity, max = -Infinity;
  for (var i = 0; i < samples.length; i++) {
    if (samples[i] < min) min = samples[i];
    if (samples[i] > max) max = samples[i];
  }
  if (min === max) { max = min + 1; }
  var binWidth = (max - min) / binCount;
  var counts = new Array(binCount);
  var bins = new Array(binCount);
  for (var j = 0; j < binCount; j++) { counts[j] = 0; bins[j] = min + binWidth * (j + 0.5); }
  for (var k = 0; k < samples.length; k++) {
    var idx = Math.floor((samples[k] - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return { bins: bins, counts: counts, min: min, max: max, binWidth: binWidth };
}

/**
 * 生成等值线网格：返回一个 grid，标记每个 (cr, cd) 点该选哪个
 * @param {number} crStep 例如 0.05
 * @param {number} cdMax 例如 3
 * @param {number} cdStep 例如 0.1
 * @param {number} dCr
 * @param {number} dCd
 * @returns {{crs:number[], cds:number[], choices:string[][]}}
 *   choices[i][j] = 'rate' | 'damage' | 'equal'
 */
function decisionGrid(crStep, cdMax, cdStep, dCr, dCd) {
  var crs = [];
  var cds = [];
  for (var c = 0; c <= 1.0001; c += crStep) crs.push(Math.round(c * 1000) / 1000);
  for (var d = 0; d <= cdMax + 0.0001; d += cdStep) cds.push(Math.round(d * 1000) / 1000);
  var choices = [];
  for (var i = 0; i < crs.length; i++) {
    var row = [];
    for (var j = 0; j < cds.length; j++) {
      var r = recommend(100, crs[i], cds[j], dCr, dCd);
      row.push(r.choice);
    }
    choices.push(row);
  }
  return { crs: crs, cds: cds, choices: choices };
}

/**
 * 应用一次词条升级，处理暴击率溢出
 * @param {number} cr
 * @param {number} cd
 * @param {'rate'|'damage'} choice
 * @param {number} dCr
 * @param {number} dCd
 * @returns {{cr:number, cd:number, capped:boolean}}
 */
function applyUpgrade(cr, cd, choice, dCr, dCd) {
  if (choice === 'rate') {
    var newCr = Math.min(cr + dCr, 1);
    return { cr: newCr, cd: cd, capped: newCr < cr + dCr };
  } else {
    return { cr: cr, cd: cd + dCd, capped: false };
  }
}

/**
 * 掷一次伤害（暴击判定 + 计算伤害）
 * @returns {{crit:boolean, damage:number}}
 */
function rollHit(base, cr, cd) {
  var crit = Math.random() < cr;
  return { crit: crit, damage: crit ? base * (1 + cd) : base };
}

/**
 * 把 (cr, cd) 的真实最优推荐一次性算清楚（包括溢出修正）
 */
function bestUpgrade(base, cr, cd, dCr, dCd) {
  var curExp = expectedDamage(base, cr, cd);
  var rRate = recommend(base, cr, cd, dCr, dCd);
  var rDmg = marginalGainDamage(base, cr, cd, dCd);
  // 如果暴击率 +dCr 会溢出，那实际增益是新的 - 旧的，要单独算
  var realRateGain;
  if (cr + dCr > 1) {
    realRateGain = (expectedDamage(base, 1, cd) - curExp);
  } else {
    realRateGain = rRate.gainRate;
  }
  var realDmgGain = rDmg;
  var choice = realRateGain >= realDmgGain ? 'rate' : 'damage';
  var capped = cr + dCr > 1;
  return {
    choice: choice,
    rateGain: realRateGain,
    dmgGain: realDmgGain,
    capped: capped
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    expectedDamage: expectedDamage,
    damageStd: damageStd,
    marginalGainRate: marginalGainRate,
    marginalGainDamage: marginalGainDamage,
    recommend: recommend,
    equalRatio: equalRatio,
    crossoverCd: crossoverCd,
    simulateHits: simulateHits,
    hitsToKill: hitsToKill,
    arrayMean: arrayMean,
    arrayStd: arrayStd,
    histogram: histogram,
    decisionGrid: decisionGrid,
    applyUpgrade: applyUpgrade,
    rollHit: rollHit,
    bestUpgrade: bestUpgrade
  };
}
