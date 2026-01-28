/**
 * 复利计算逻辑核心
 */

const CompoundLogic = {
  /**
   * 计算单利 vs 复利
   * @param {number} principal 初始本金
   * @param {number} rate 年化收益率 (小数，如 0.1)
   * @param {number} years 投资年限
   * @returns {object} { simpleData, compoundData, yearsLabel }
   */
  calculateSimpleVsCompound: function(principal, rate, years) {
    const simpleData = [];
    const compoundData = [];
    const yearsLabel = [];

    for (let i = 0; i <= years; i++) {
      yearsLabel.push('第' + i + '年');
      // 单利：本金 * (1 + r * t)
      simpleData.push(Math.floor(principal * (1 + rate * i)));
      // 复利：本金 * (1 + r)^t
      compoundData.push(Math.floor(principal * Math.pow(1 + rate, i)));
    }

    return {
      simpleData,
      compoundData,
      yearsLabel
    };
  },

  /**
   * 计算早投 vs 晚投
   * @param {number} annualAmount 每年定投金额
   * @param {number} rate 年化收益率 (小数)
   * @param {number} gapYears 早投者提前几年
   * @param {number} totalYears 总对比年限 (默认40)
   * @returns {object} { earlyData, lateData, yearsLabel, investedA, investedB }
   */
  calculateEarlyVsLate: function(annualAmount, rate, gapYears, totalYears = 40) {
    const earlyData = []; // A: 早投，但只投 gapYears 年，之后不投了，让它滚
    const lateData = [];  // B: 晚投，晚 gapYears 年开始，一直投到结束
    const yearsLabel = [];

    // 计算 A (早鸟): 前 gapYears 年每年投，之后不投
    let balanceA = 0;
    // 计算 B (晚鸟): 前 gapYears 年为0，之后每年投
    let balanceB = 0;

    let investedA = 0;
    let investedB = 0;

    for (let i = 0; i <= totalYears; i++) {
      yearsLabel.push(i + '年');
      
      // A 的逻辑
      if (i > 0) {
        if (i <= gapYears) {
          balanceA = (balanceA + annualAmount) * (1 + rate);
          investedA += annualAmount;
        } else {
          balanceA = balanceA * (1 + rate); // 停止投入，只滚雪球
        }
      }

      // B 的逻辑
      if (i > gapYears) {
        balanceB = (balanceB + annualAmount) * (1 + rate);
        investedB += annualAmount;
      }

      earlyData.push(Math.floor(balanceA));
      lateData.push(Math.floor(balanceB));
    }

    return {
      earlyData,
      lateData,
      yearsLabel,
      investedA,
      investedB
    };
  }
};

// 兼容浏览器和 Node 环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CompoundLogic;
} else if (typeof window !== 'undefined') {
  window.CompoundLogic = CompoundLogic;
}
