/**
 * Subscription Audit - Core Logic
 * 订阅审计器核心算法
 * 基于遗忘曲线、沉没成本模型和使用频率衰减分析
 */

const SubscriptionAuditLogic = (function () {

  // ========== 常见订阅服务预设 ==========
  const PRESET_SERVICES = [
    { name: '爱奇艺', price: 25, category: 'video', icon: 'ti-device-tv' },
    { name: '腾讯视频', price: 25, category: 'video', icon: 'ti-device-tv' },
    { name: '优酷', price: 25, category: 'video', icon: 'ti-device-tv' },
    { name: 'B站大会员', price: 25, category: 'video', icon: 'ti-device-tv' },
    { name: 'Netflix', price: 62, category: 'video', icon: 'ti-device-tv' },
    { name: '芒果TV', price: 22, category: 'video', icon: 'ti-device-tv' },
    { name: 'QQ音乐', price: 15, category: 'music', icon: 'ti-music' },
    { name: '网易云音乐', price: 15, category: 'music', icon: 'ti-music' },
    { name: 'Apple Music', price: 11, category: 'music', icon: 'ti-music' },
    { name: 'Spotify', price: 56, category: 'music', icon: 'ti-music' },
    { name: 'iCloud 50GB', price: 6, category: 'cloud', icon: 'ti-cloud' },
    { name: 'iCloud 200GB', price: 21, category: 'cloud', icon: 'ti-cloud' },
    { name: 'iCloud 2TB', price: 68, category: 'cloud', icon: 'ti-cloud' },
    { name: '百度网盘', price: 26, category: 'cloud', icon: 'ti-cloud' },
    { name: '阿里云盘', price: 8, category: 'cloud', icon: 'ti-cloud' },
    { name: 'WPS会员', price: 15, category: 'tool', icon: 'ti-file-text' },
    { name: 'ChatGPT Plus', price: 140, category: 'ai', icon: 'ti-robot' },
    { name: 'Claude Pro', price: 140, category: 'ai', icon: 'ti-robot' },
    { name: 'Copilot Pro', price: 70, category: 'ai', icon: 'ti-robot' },
    { name: '知乎盐选', price: 25, category: 'reading', icon: 'ti-book' },
    { name: '微信读书', price: 19, category: 'reading', icon: 'ti-book' },
    { name: '得到', price: 36, category: 'reading', icon: 'ti-book' },
    { name: '美团会员', price: 15, category: 'life', icon: 'ti-shopping-cart' },
    { name: '饿了么会员', price: 15, category: 'life', icon: 'ti-shopping-cart' },
    { name: '京东PLUS', price: 12.4, category: 'life', icon: 'ti-shopping-cart' },
    { name: '淘宝88VIP', price: 73, category: 'life', icon: 'ti-shopping-cart' },
    { name: 'Keep会员', price: 19, category: 'health', icon: 'ti-run' },
    { name: 'Tesla FSD', price: 700, category: 'auto', icon: 'ti-car' },
    { name: 'Xbox Game Pass', price: 65, category: 'game', icon: 'ti-device-gamepad-2' },
    { name: 'PS Plus', price: 37, category: 'game', icon: 'ti-device-gamepad-2' },
    { name: 'Nintendo Online', price: 13, category: 'game', icon: 'ti-device-gamepad-2' },
    { name: 'GitHub Copilot', price: 70, category: 'dev', icon: 'ti-code' },
  ];

  const CATEGORIES = {
    video: '视频', music: '音乐', cloud: '云存储', tool: '工具',
    ai: 'AI', reading: '阅读', life: '生活', health: '健康',
    auto: '出行', game: '游戏', dev: '开发', other: '其他'
  };

  /**
   * 艾宾浩斯遗忘曲线：计算订阅后第 t 天的使用概率
   * R(t) = e^(-t/S)，S 为稳定性参数
   * @param {number} t - 订阅后天数
   * @param {number} S - 稳定性（越大遗忘越慢），默认30天
   * @returns {number} 使用概率 [0, 1]
   */
  function forgettingCurve(t, S) {
    if (typeof S === 'undefined') S = 30;
    if (t < 0) return 1;
    return Math.exp(-t / S);
  }

  /**
   * 计算订阅在 N 个月内的预期使用天数
   * @param {number} months - 订阅月数
   * @param {number} S - 遗忘曲线稳定性参数
   * @param {number} initialFreq - 初始每月使用天数（如20天/月）
   * @returns {number} 预期总使用天数
   */
  function expectedUsageDays(months, S, initialFreq) {
    if (typeof S === 'undefined') S = 30;
    if (typeof initialFreq === 'undefined') initialFreq = 20;
    let totalDays = 0;
    for (let d = 0; d < months * 30; d++) {
      const prob = forgettingCurve(d, S);
      totalDays += prob * (initialFreq / 30);
    }
    return totalDays;
  }

  /**
   * 计算单次使用的实际成本
   * @param {number} monthlyPrice - 月费
   * @param {number} usageDaysPerMonth - 每月实际使用天数
   * @returns {number} 每次使用成本（元）
   */
  function costPerUse(monthlyPrice, usageDaysPerMonth) {
    if (usageDaysPerMonth <= 0) return Infinity;
    return monthlyPrice / usageDaysPerMonth;
  }

  /**
   * 计算一组订阅的年度浪费金额
   * @param {Array<{price: number, usageDays: number}>} subscriptions
   *   price: 月费, usageDays: 每月实际使用天数 (0-30)
   * @returns {{ totalAnnual: number, totalWaste: number, wastePercent: number, details: Array }}
   */
  function calculateAnnualWaste(subscriptions) {
    let totalAnnual = 0;
    let totalWaste = 0;
    const details = [];

    for (const sub of subscriptions) {
      const annual = sub.price * 12;
      totalAnnual += annual;

      // 使用率 = 实际使用天数 / 30
      const usageRate = Math.min(sub.usageDays / 30, 1);
      // 浪费 = 年费 × (1 - 使用率)
      const waste = annual * (1 - usageRate);
      totalWaste += waste;

      const perUse = costPerUse(sub.price, sub.usageDays);

      details.push({
        name: sub.name || '未命名',
        price: sub.price,
        annual,
        usageDays: sub.usageDays,
        usageRate,
        waste,
        costPerUse: perUse,
        verdict: usageRate >= 0.6 ? 'keep' : usageRate >= 0.3 ? 'review' : 'cancel'
      });
    }

    details.sort((a, b) => b.waste - a.waste);

    return {
      totalAnnual,
      totalWaste,
      wastePercent: totalAnnual > 0 ? (totalWaste / totalAnnual * 100) : 0,
      details
    };
  }

  /**
   * 蒙特卡洛模拟：模拟 N 个人的订阅浪费情况
   * 每个人随机拥有 3-10 个订阅，使用频率随时间衰减
   * @param {number} trials - 模拟人数
   * @param {number} months - 模拟月数
   * @returns {{ avgWaste: number, medianWaste: number, p90Waste: number, avgSubCount: number, avgActiveCount: number, wastes: number[] }}
   */
  function monteCarloSubscriptionWaste(trials, months) {
    if (typeof months === 'undefined') months = 12;
    const wastes = [];
    let totalSubCount = 0;
    let totalActiveCount = 0;

    for (let i = 0; i < trials; i++) {
      // 随机订阅数量 3-10
      const subCount = 3 + Math.floor(Math.random() * 8);
      totalSubCount += subCount;

      let annualWaste = 0;
      let activeCount = 0;

      for (let s = 0; s < subCount; s++) {
        // 随机选一个服务
        const service = PRESET_SERVICES[Math.floor(Math.random() * PRESET_SERVICES.length)];
        // 随机稳定性参数 S: 10-90 天（有些人坚持用，有些人很快忘）
        const S = 10 + Math.random() * 80;
        // 随机初始使用频率
        const initialFreq = 5 + Math.random() * 25;
        // 计算平均月使用天数
        const totalUseDays = expectedUsageDays(months, S, initialFreq);
        const avgMonthlyUse = totalUseDays / months;

        const usageRate = Math.min(avgMonthlyUse / 30, 1);
        const waste = service.price * 12 * (1 - usageRate);
        annualWaste += waste;

        if (avgMonthlyUse >= 5) activeCount++;
      }

      wastes.push(annualWaste);
      totalActiveCount += activeCount;
    }

    wastes.sort((a, b) => a - b);
    const sum = wastes.reduce((a, b) => a + b, 0);

    return {
      avgWaste: sum / trials,
      medianWaste: wastes[Math.floor(trials / 2)],
      p90Waste: wastes[Math.floor(trials * 0.9)],
      avgSubCount: totalSubCount / trials,
      avgActiveCount: totalActiveCount / trials,
      wastes
    };
  }

  /**
   * 沉没成本分析：已经付了 N 个月但不用了，继续订还是取消？
   * @param {number} monthlyPrice - 月费
   * @param {number} monthsPaid - 已付月数
   * @param {number} currentUsageDays - 当前每月使用天数
   * @param {number} remainMonths - 剩余考虑月数（默认12）
   * @returns {{ sunkCost: number, futureCostIfKeep: number, futureValueIfKeep: number, recommendation: string }}
   */
  function sunkCostAnalysis(monthlyPrice, monthsPaid, currentUsageDays, remainMonths) {
    if (typeof remainMonths === 'undefined') remainMonths = 12;
    const sunkCost = monthlyPrice * monthsPaid;
    const futureCostIfKeep = monthlyPrice * remainMonths;

    // 未来使用价值：假设使用频率继续衰减
    // 稳定性与当前使用率成正比：用得多的人衰减慢
    let futureValue = 0;
    const usageRate = currentUsageDays / 30;
    const stability = 30 + usageRate * 180; // 高使用率 → S 可达 210 天
    for (let m = 0; m < remainMonths; m++) {
      const decay = forgettingCurve(m * 30, stability);
      const useDays = currentUsageDays * decay;
      futureValue += useDays * (monthlyPrice / 30);
    }

    const roi = futureCostIfKeep > 0 ? (futureValue / futureCostIfKeep) : 0;
    let recommendation;
    if (roi >= 0.4) recommendation = 'keep';
    else if (roi >= 0.15) recommendation = 'review';
    else recommendation = 'cancel';

    return {
      sunkCost,
      futureCostIfKeep,
      futureValueIfKeep: futureValue,
      roi,
      recommendation
    };
  }

  /**
   * 生成遗忘曲线数据点（用于图表绘制）
   * @param {number} S - 稳定性参数
   * @param {number} days - 总天数
   * @param {number} step - 步长（天）
   * @returns {Array<{day: number, retention: number}>}
   */
  function generateForgettingCurveData(S, days, step) {
    if (typeof days === 'undefined') days = 365;
    if (typeof step === 'undefined') step = 1;
    const data = [];
    for (let d = 0; d <= days; d += step) {
      data.push({ day: d, retention: forgettingCurve(d, S) });
    }
    return data;
  }

  /**
   * 计算「订阅疲劳指数」：衡量一个人的订阅健康度
   * @param {Array<{price: number, usageDays: number}>} subscriptions
   * @returns {{ score: number, level: string, suggestion: string }}
   *   score: 0-100，越高越健康
   */
  function subscriptionFatigueIndex(subscriptions) {
    if (subscriptions.length === 0) {
      return { score: 100, level: 'healthy', suggestion: '你没有任何订阅，完美的极简主义者。' };
    }

    const result = calculateAnnualWaste(subscriptions);
    const avgUsageRate = result.details.reduce((s, d) => s + d.usageRate, 0) / result.details.length;
    const cancelCount = result.details.filter(d => d.verdict === 'cancel').length;
    const totalCount = subscriptions.length;

    // 评分公式：使用率权重60% + 订阅数量合理性20% + 浪费比例20%
    const usageScore = avgUsageRate * 100;
    const countScore = Math.max(0, 100 - (totalCount - 3) * 10); // 3个以内满分
    const wasteScore = Math.max(0, 100 - result.wastePercent);

    const score = Math.round(usageScore * 0.6 + countScore * 0.2 + wasteScore * 0.2);
    const clampedScore = Math.max(0, Math.min(100, score));

    let level, suggestion;
    if (clampedScore >= 80) {
      level = 'healthy';
      suggestion = '你的订阅管理很健康，每个服务都物尽其用。';
    } else if (clampedScore >= 60) {
      level = 'warning';
      suggestion = `有 ${cancelCount} 个订阅使用率偏低，建议审视是否还需要。`;
    } else if (clampedScore >= 40) {
      level = 'danger';
      suggestion = `你每年浪费约 ¥${result.totalWaste.toFixed(0)}，建议立即取消 ${cancelCount} 个低频订阅。`;
    } else {
      level = 'critical';
      suggestion = `订阅严重过载！${cancelCount}/${totalCount} 个订阅几乎不用，每年浪费 ¥${result.totalWaste.toFixed(0)}。`;
    }

    return { score: clampedScore, level, suggestion };
  }

  /**
   * 将浪费金额转换为等价物（让数字更直观）
   * @param {number} amount - 金额（元）
   * @returns {Array<{item: string, count: number, icon: string}>}
   */
  function wasteEquivalents(amount) {
    return [
      { item: '杯奶茶', count: Math.floor(amount / 15), icon: 'ti-cup' },
      { item: '顿火锅', count: Math.floor(amount / 120), icon: 'ti-flame' },
      { item: '张电影票', count: Math.floor(amount / 45), icon: 'ti-movie' },
      { item: '次打车', count: Math.floor(amount / 25), icon: 'ti-car' },
      { item: '本书', count: Math.floor(amount / 40), icon: 'ti-book' },
    ];
  }

  // ========== 导出 ==========
  const exports = {
    PRESET_SERVICES,
    CATEGORIES,
    forgettingCurve,
    expectedUsageDays,
    costPerUse,
    calculateAnnualWaste,
    monteCarloSubscriptionWaste,
    sunkCostAnalysis,
    generateForgettingCurveData,
    subscriptionFatigueIndex,
    wasteEquivalents
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  return exports;
})();
