// ===== 无知之幕引擎 v1 =====
// 纯 QoL 计算公式 + 随机属性生成

const Engine = {

  /**
   * 高斯分布随机数 (Box-Muller)
   */
  gaussianRandom(mean, std) {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z * std + mean;
  },

  clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },

  /**
   * 生成 4 个随机属性
   */
  generateAttributes() {
    const talent  = Math.round(this.clamp(this.gaussianRandom(50, 20), 5, 95));
    const wealth  = Math.round(this.clamp(Math.pow(Math.random(), 2.5) * 100, 0, 98));
    const health  = Math.round(this.clamp(this.gaussianRandom(65, 25), 5, 95));
    const luck    = Math.round(Math.random() * 100);
    return { talent, family: wealth, health, luck };
  },

  /**
   * 计算 QoL 及各子项 (全部按月计)
   * @param {object} policies - { taxRate, eduSpend, healthLevel, inheritanceTax, basicIncome }
   * @param {object} attr     - { talent, family, health, luck }
   */
  calculate(policies, attr) {
    const { taxRate, eduSpend, healthLevel, inheritanceTax, basicIncome } = policies;
    const { talent, family, health, luck } = attr;

    // 市场月收入：天赋/家庭/运气加权
    const marketIncome = 2000 + talent * 80 + family * 40 + luck * 25;

    // 累进税率：收入越高越接近设定税率
    const progressiveRate = 2 + (taxRate - 2) * Math.pow(marketIncome / 14500, 1.5);
    const taxRateApplied = this.clamp(progressiveRate, 0, taxRate);
    const afterTax = marketIncome * (1 - taxRateApplied / 100);

    // 教育助力：天赋越高+投入越高+家庭越穷→收益越大（社会流动性）
    const eduRatio = eduSpend / 60000;
    const eduBoost = talent * eduRatio * (1 - family / 100) * 80;
    const eduScore = Math.round(this.clamp((eduRatio * 100 + talent / 100) / 2 * 100, 0, 100));

    // 医疗负担：健康越差+医保越差→越贵
    const healthNeed = 1 - health / 100;
    const healthCoef = (4 - healthLevel) / 3;
    const healthBurden = healthNeed * healthCoef * 6000;

    // 遗产收入：家庭财富产生遗产，扣除遗产税
    const inheritanceBase = family * 60;
    const inheritanceAfterTax = inheritanceBase * (1 - inheritanceTax / 100);

    // 可支配收入
    const disposable = afterTax + eduBoost + basicIncome + inheritanceAfterTax - healthBurden;

    // QoL 得分
    const qol = Math.round(this.clamp(disposable / 100, 0, 100));

    return {
      marketIncome: Math.round(marketIncome),
      taxRateApplied: Math.round(taxRateApplied * 10) / 10,
      afterTax: Math.round(afterTax),
      eduBoost: Math.round(eduBoost),
      eduScore,
      healthBurden: Math.round(healthBurden),
      inheritanceAfterTax: Math.round(inheritanceAfterTax),
      basicIncome,
      disposable: Math.round(disposable),
      qol
    };
  },

  /**
   * 公平系数：Gini 近似（基于随机抽样的各身份 QoL 分布）
   */
  fairnessCoefficient(samples, policies) {
    const qols = samples.map(s => this.calculate(policies, s).qol).sort((a,b)=>a-b);
    const n = qols.length;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (2 * (i + 1) - n - 1) * qols[i];
    }
    const gini = sum / (n * n * (qols.reduce((a,b)=>a+b,0)/n || 1));
    return Math.round((1 - gini) * 100);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
}
