/**
 * 信任博弈（Trust Game）核心逻辑引擎。
 *
 * 规则（Berg, Dickhaut & McCabe 1995）：
 *  - 投资者拥有 10000 元，可投资 0-10000 元给被委托人
 *  - 被委托人收到 3 倍投资额，决定返还 0 到全部金额
 *  - 投资者最终收益 = 10000 - 投资 + 返还；被委托人 = 3*投资 - 返还
 *
 * 纯逻辑模块：不操作 DOM，可在 Node 中直接 require 测试。
 */

/** 初始资金（投资者拥有） */
var INITIAL_ENDOWMENT = 10000;

/** 投资放大倍数 */
var MULTIPLIER = 3;

/** 论文常模（Berg 1995）：平均投资额 5.16/10 → 5160/10000，平均返还额 4.66 → 4660/30000 */
var PAPER_AVG_INVEST = 5160;
var PAPER_AVG_RETURN = 4660;

/**
 * 计算投资者最终收益。
 * @param {number} invest 投资额（0-10000）
 * @param {number} returned 被委托人返还额（0 - 3*invest）
 * @returns {number} 投资者收益
 */
function investorOutcome(invest, returned) {
  return INITIAL_ENDOWMENT - invest + returned;
}

/**
 * 计算被委托人最终收益。
 * @param {number} invest 投资额
 * @param {number} returned 返还额
 * @returns {number} 被委托人收益
 */
function trusteeOutcome(invest, returned) {
  return MULTIPLIER * invest - returned;
}

/**
 * 校验投资额合法性。
 * @param {number} invest 投资额
 * @returns {boolean} 0-10000 内为合法
 */
function isValidInvest(invest) {
  return invest >= 0 && invest <= INITIAL_ENDOWMENT;
}

/**
 * 校验返还额合法性（不超过被委托人收到的总额）。
 * @param {number} invest 投资额
 * @param {number} returned 返还额
 * @returns {boolean} 0 - 3*invest 内为合法
 */
function isValidReturn(invest, returned) {
  return returned >= 0 && returned <= MULTIPLIER * invest;
}

/**
 * AI 伙伴的返还模型（模拟被委托人）。
 * 依据论文数据：被委托人平均返还约 30% 的收到金额。
 * 用投资额做确定性扰动（伪随机但可复现），返还比例约 20%-40% 波动。
 * @param {number} invest 投资额（0-10000）
 * @returns {number} AI 返还额（0 - 3*invest 的整数）
 */
function aiReturn(invest) {
  if (invest === 0) return 0;
  var received = MULTIPLIER * invest;
  // 返还比例在 20% ~ 40% 之间随投资额确定性波动（可复现）
  var pct = 0.2 + ((invest * 7919) % 21) / 100;
  var ret = Math.round(received * pct);
  if (ret < 0) ret = 0;
  if (ret > received) ret = received;
  return ret;
}

/**
 * 判定玩家画像（四象限）。
 * @param {number} investRate 投资比例 0-1
 * @param {number} returnRate 返还比例 0-1（返还额/收到额）
 * @returns {Object} { label, description, investRate, returnRate }
 */
function classifyProfile(investRate, returnRate) {
  var label;
  var description;
  if (investRate >= 0.5 && returnRate >= 0.5) {
    label = '高信任·高互惠';
    description = '你既敢信任别人，也愿意回报信任——合作型人格。';
  } else if (investRate >= 0.5 && returnRate < 0.5) {
    label = '高信任·低互惠';
    description = '你愿意冒险信任别人，但轮到自己回报时比较保守。';
  } else if (investRate < 0.5 && returnRate >= 0.5) {
    label = '低信任·高互惠';
    description = '你不轻易信任别人，但一旦被信任就会认真回报。';
  } else {
    label = '低信任·低互惠';
    description = '你谨慎且保守——理性的博弈论者会这么玩。';
  }
  return { label: label, description: description };
}

/**
 * 计算投资比例和返还比例。
 * @param {number} invest 投资额
 * @param {number} returned 返还额
 * @returns {Object} { investRate, returnRate }
 */
function computeRates(invest, returned) {
  var investRate = invest / INITIAL_ENDOWMENT;
  var received = MULTIPLIER * invest;
  var returnRate = received > 0 ? returned / received : 0;
  return { investRate: investRate, returnRate: returnRate };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    investorOutcome: investorOutcome,
    trusteeOutcome: trusteeOutcome,
    isValidInvest: isValidInvest,
    isValidReturn: isValidReturn,
    aiReturn: aiReturn,
    classifyProfile: classifyProfile,
    computeRates: computeRates,
    INITIAL_ENDOWMENT: INITIAL_ENDOWMENT,
    MULTIPLIER: MULTIPLIER,
    PAPER_AVG_INVEST: PAPER_AVG_INVEST,
    PAPER_AVG_RETURN: PAPER_AVG_RETURN
  };
}
