// ========== 游戏多货币经济系统核心算法（可独立测试） ==========
// 模型：每 tick 玩家「肝」产出软货币（可无限增发 → 通胀），
//      一部分玩家「氪」产出硬货币（有上限、保值）。
// 关键指标：通胀指数、留存率、氪金占比，合成一个 0~100 的经济健康分。

/**
 * 内置预设经济方案（全部由 buildConfig 派生，保证与滑块路径比特一致）
 * - single: 单一货币（金币），全肝 → 必然通胀崩盘
 * - two:    金币 + 钻石（硬货币），隔离通胀
 * - three:  金币 + 钻石 + 竞技场代币（绑定特定玩法），进一步提升留存
 * @param {string} name - 'single' | 'two' | 'three'
 * @returns {object} 完整经济配置
 */
function presetConfig(name) {
  if (name === 'single') {
    return buildConfig({ currencyCount: 1, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 });
  }
  if (name === 'two') {
    return buildConfig({ currencyCount: 2, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 });
  }
  if (name === 'three') {
    return buildConfig({ currencyCount: 3, grindRate: 5, payRate: 4, payShare: 0.3, premiumPrice: 800 });
  }
  return presetConfig('two');
}

/** 数值钳制 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(v, hi));
}

/**
 * 由用户自定义控件构造配置（滑块实时调整）
 * @param {object} opts - { currencyCount, grindRate, payRate, payShare, premiumPrice }
 * @returns {object} 可传入 simulate 的配置
 */
function buildConfig(opts) {
  var base = { players: 1000, ticks: 200, baseConsumable: 10, growth: 0.02 };
  var currencies = [{ type: 'grind', earn: opts.grindRate }];
  if (opts.currencyCount >= 2) {
    currencies.push({ type: 'pay', earn: opts.payRate, payShare: opts.payShare });
  }
  if (opts.currencyCount >= 3) {
    currencies.push({ type: 'pay', earn: opts.payRate * 0.5, payShare: opts.payShare * 0.5 });
  }
  return Object.assign({}, base, { currencies: currencies, premiumPrice: opts.premiumPrice });
}

/**
 * 运行一次确定性经济模拟（闭式累加，无随机，可复现）
 * @param {object} config - presetConfig / buildConfig 的输出
 * @returns {object} series + metrics + verdict + reasons
 */
function simulate(config) {
  var players = config.players;
  var ticks = config.ticks;
  var premium = config.premiumPrice;
  var baseConsumable = config.baseConsumable;
  var growth = config.growth;

  var grindEarn = 0, hardPerTick = 0, nHard = 0;
  config.currencies.forEach(function(c) {
    if (c.type === 'grind') {
      grindEarn += c.earn;
    } else {
      hardPerTick += c.earn * c.payShare; // 每种硬货币按产值×付费占比累加，避免重复计算
      nHard++;
    }
  });
  var hasHard = nHard > 0;

  var softPerPlayer = 0, hardPerPlayer = 0, realReserve = 0;
  var softSeries = [], priceSeries = [], inflationSeries = [];
  var retentionSeries = [], monetizationSeries = [];

  for (var t = 0; t < ticks; t++) {
    var softThis = grindEarn * Math.pow(1 + growth, t);
    softPerPlayer += softThis;
    var priceLevel = 1 + softPerPlayer / baseConsumable;
    var realValue = 1 / priceLevel;
    realReserve += softThis * realValue;
    if (hasHard) {
      hardPerPlayer += hardPerTick;
    }

    var reserve = hasHard ? hardPerPlayer : realReserve;
    var completion = clamp(reserve / premium, 0, 1);

    softSeries.push(softPerPlayer);
    priceSeries.push(priceLevel);
    inflationSeries.push(1 - realValue);
    retentionSeries.push(clamp(1 - Math.abs(completion - 0.5) * 2, 0, 1));
    monetizationSeries.push(hasHard ? clamp(hardPerPlayer / premium, 0, 1) : 0);
  }

  var softInflationFinal = 1 - 1 / (1 + softPerPlayer / baseConsumable);
  var effectiveInflation = hasHard ? softInflationFinal * Math.pow(0.35, nHard) : softInflationFinal;
  var retentionFinal = retentionSeries[retentionSeries.length - 1];
  var monetizationFinal = monetizationSeries[monetizationSeries.length - 1];
  var completionFinal = clamp((hasHard ? hardPerPlayer : realReserve) / premium, 0, 1);

  var monoScore = hasHard ? clamp(1 - Math.abs(monetizationFinal - 0.3) / 0.3, 0, 1) : 0;
  var health = Math.round(100 * (0.34 * retentionFinal + 0.33 * (1 - effectiveInflation) + 0.33 * monoScore));

  var verdict = health >= 70 ? '健康' : (health >= 30 ? '能跑但危险' : '经济崩了');
  var reasons = buildReasons(hasHard, nHard, monetizationFinal, effectiveInflation, retentionFinal);

  return {
    series: {
      soft: softSeries, price: priceSeries, inflation: inflationSeries,
      retention: retentionSeries, monetization: monetizationSeries
    },
    metrics: {
      health: health, verdict: verdict,
      inflation: effectiveInflation, retention: retentionFinal,
      monetization: monetizationFinal, completion: completionFinal,
      softPerPlayer: softPerPlayer, hardPerPlayer: hasHard ? hardPerPlayer : 0,
      nHard: nHard, hasHard: hasHard
    },
    reasons: reasons
  };
}

/**
 * 根据经济形态生成「体检报告」中的逐条原因（对应真实的多货币设计理由）
 */
function buildReasons(hasHard, nHard, monetization, inflation, retention) {
  var reasons = [];
  if (!hasHard) {
    reasons.push('单一货币：氪金与肝混在同一本账，货币无限增发，人均持有量飙升，通胀失控。');
    reasons.push('没有相隔的「硬货币」做保值媒介，玩家的长期积蓄被通胀稀释，留存与付费意愿同步崩塌。');
  } else {
    reasons.push('硬货币把「氪金」和「肝」分成两本互不干扰的账，软货币通胀被吸收在消耗品里，保值标的保持稳定。');
    reasons.push('硬货币稀缺、软货币无限，汇率与兑换损耗让氪金不会买空一切，免费玩家的「肝」仍有意义。');
  }
  if (nHard >= 2) {
    reasons.push('第三种货币绑定特定玩法（如竞技场代币），用货币「锁住」玩法参与度，进一步抬高留存。');
  }
  var m = monetization;
  if (m >= 0.25 && m <= 0.35) {
    reasons.push('氪金占比约 ' + (m * 100).toFixed(0) + '%，处于健康区间：能赚钱，又不至于劝退免费玩家。');
  } else if (m > 0.35) {
    reasons.push('氪金占比偏高（' + (m * 100).toFixed(0) + '%），免费玩家缺乏成长路径，长期留存有隐患。');
  } else {
    reasons.push('氪金占比偏低，付费点不足，商业化动力弱。');
  }
  return reasons;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { presetConfig: presetConfig, buildConfig: buildConfig, simulate: simulate, clamp: clamp };
}