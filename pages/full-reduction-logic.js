/**
 * 满减凑单计算器 — 核心算法
 * Full Reduction Calculator — Core Logic
 */

// === 满减规则计算 ===

/**
 * 计算单次满减的真实折扣信息
 * @param {number} originalPrice - 你真正想买的商品总价
 * @param {number} threshold - 满减门槛（如 300）
 * @param {number} discount - 减免金额（如 50）
 * @returns {object} 分析结果
 */
function analyzeFullReduction(originalPrice, threshold, discount) {
  if (originalPrice <= 0 || threshold <= 0 || discount <= 0) {
    return { error: '参数必须大于0' };
  }
  if (discount >= threshold) {
    return { error: '减免金额不能大于等于门槛' };
  }

  // 已经达到门槛，不需要凑单
  if (originalPrice >= threshold) {
    const actualPay = originalPrice - discount;
    const realDiscount = (discount / originalPrice) * 100;
    return {
      needPadding: false,
      paddingAmount: 0,
      originalPrice,
      actualPay,
      saved: discount,
      wasted: 0,
      realDiscount: round2(realDiscount),
      nominalDiscount: round2((discount / threshold) * 100),
      worthIt: true
    };
  }

  // 需要凑单
  const paddingAmount = threshold - originalPrice;
  const actualPay = threshold - discount; // 凑到刚好满减
  const saved = discount;
  const wasted = paddingAmount; // 凑单多花的钱
  const netSaving = saved - wasted; // 净省/净亏
  const realDiscount = (netSaving / originalPrice) * 100;
  const nominalDiscount = (discount / threshold) * 100;

  return {
    needPadding: true,
    paddingAmount: round2(paddingAmount),
    originalPrice,
    actualPay: round2(actualPay),
    saved: round2(saved),
    wasted: round2(wasted),
    netSaving: round2(netSaving),
    realDiscount: round2(realDiscount),
    nominalDiscount: round2(nominalDiscount),
    worthIt: netSaving > 0
  };
}

/**
 * 多档满减最优策略分析
 * @param {number} originalPrice - 原始价格
 * @param {Array} tiers - 满减档位 [{threshold, discount}, ...]
 * @returns {object} 各档分析 + 最优推荐
 */
function analyzeTiers(originalPrice, tiers) {
  if (!tiers || !tiers.length) return { error: '至少需要一个档位' };

  const results = tiers.map(t => ({
    tier: t,
    analysis: analyzeFullReduction(originalPrice, t.threshold, t.discount)
  }));

  // 按净省钱排序，找最优
  const valid = results.filter(r => !r.analysis.error);
  valid.sort((a, b) => {
    const netA = a.analysis.netSaving !== undefined ? a.analysis.netSaving : a.analysis.saved;
    const netB = b.analysis.netSaving !== undefined ? b.analysis.netSaving : b.analysis.saved;
    return netB - netA;
  });

  return {
    results,
    best: valid.length > 0 ? valid[0] : null
  };
}

/**
 * 冲动消费后悔概率模拟（蒙特卡洛）
 * 模拟凑单买的东西，有多大概率在30天内后悔
 * @param {number} paddingAmount - 凑单金额
 * @param {number} runs - 模拟次数
 * @param {object} opts - 参数
 * @returns {object} 模拟结果
 */
function simulateRegret(paddingAmount, runs, opts = {}) {
  const {
    baseRegretRate = 0.41,    // 基础后悔率 41%（消费心理学研究数据）
    priceEffect = 0.3,        // 金额对后悔率的影响系数
    priceRef = 100,            // 参考金额（超过此金额后悔率上升）
    useProbDecay = true        // 使用概率随时间衰减
  } = opts;

  let regretCount = 0;
  const regretDays = [];

  for (let i = 0; i < runs; i++) {
    // 后悔概率 = 基础后悔率 + 金额效应
    const priceBoost = Math.min(0.3, (paddingAmount / priceRef - 1) * priceEffect * 0.1);
    const regretProb = Math.min(0.95, baseRegretRate + Math.max(0, priceBoost));

    if (Math.random() < regretProb) {
      regretCount++;
      // 后悔发生在第几天（指数分布，大部分在前几天）
      const day = useProbDecay
        ? Math.min(30, Math.ceil(-Math.log(1 - Math.random()) * 5))
        : Math.ceil(Math.random() * 30);
      regretDays.push(day);
    }
  }

  // 按天统计后悔分布
  const dayDistribution = new Array(31).fill(0);
  regretDays.forEach(d => { if (d <= 30) dayDistribution[d]++; });

  return {
    runs,
    regretCount,
    regretRate: round2((regretCount / runs) * 100),
    avgRegretDay: regretDays.length > 0 ? round2(regretDays.reduce((a, b) => a + b, 0) / regretDays.length) : 0,
    dayDistribution,
    paddingAmount
  };
}

/**
 * 批量模拟不同原价下的真实折扣率
 * @param {number} threshold - 满减门槛
 * @param {number} discount - 减免金额
 * @param {number} step - 价格步长
 * @returns {Array} [{price, realDiscount, nominalDiscount, netSaving}, ...]
 */
function batchAnalyze(threshold, discount, step) {
  if (step <= 0) step = 10;
  const results = [];
  for (let price = step; price <= threshold * 1.5; price += step) {
    const a = analyzeFullReduction(price, threshold, discount);
    if (!a.error) {
      results.push({
        price,
        realDiscount: a.realDiscount,
        nominalDiscount: a.nominalDiscount,
        netSaving: a.netSaving !== undefined ? a.netSaving : a.saved,
        needPadding: a.needPadding,
        paddingAmount: a.paddingAmount
      });
    }
  }
  return results;
}

// === 工具函数 ===
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzeFullReduction, analyzeTiers, simulateRegret,
    batchAnalyze, round2
  };
}
