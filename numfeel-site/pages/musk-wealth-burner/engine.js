/**
 * engine.js — 马斯克财富烧钱模拟器 · 纯逻辑层
 * 与 DOM 完全解耦，所有函数均为纯函数，可被 Node 测试 require。
 *
 * 核心数学：把「带负漂移的随机游走」近似为布朗运动，
 *   每手期望亏损 μ = bet × edge，每手方差 σ² ≈ bet²（近似公平抛硬币）。
 *   从财富 W 出发，永不破产的概率 > 0，首次触及 0 的概率为：
 *     P(破产) = exp(-2·μ·W / σ²) = exp(-2·edge·W / bet)
 *   期望破产手数 E[T] ≈ W / (bet·edge)
 */
(function (global) {
  'use strict';

  // ── 基础常量 ──────────────────────────────────────────────
  /** 马斯克身家（美元）≈ 1.3 万亿美元 */
  var START_WEALTH = 1.3e12;
  /** 百家乐（买闲）庄家优势 ≈ 1.2% */
  var BACCARAT_EDGE = 0.012;
  /** 玩家单手赢的概率，对应 1.2% 优势： (1 - edge)/2 略调整 */
  var PLAYER_WIN_PROB = 0.4932;
  /** 澳门贵宾厅单注上限 ≈ 1000 万港币 ≈ 130 万美元 */
  var TABLE_MAX_BET = 1.3e6;
  /** 贵宾厅发牌速度（手/分钟） */
  var HANDS_PER_MINUTE = 1;
  /** 特斯拉极端日单小时身家波动参考（美元） */
  var TESLA_HOURLY_SWING = 1.6e11;
  /** 一年分钟数 */
  var MINUTES_PER_YEAR = 365 * 24 * 60;

  // ── 烧钱商品目录 ─────────────────────────────────────────
  /** @type {Array<{id:string,name:string,price:number,img:string,desc:string}>} */
  var CATALOG = [
    { id: 'yacht',    name: '超级游艇',     price: 5.0e8,  img: 'yacht',    desc: '120 米定制 mega yacht' },
    { id: 'island',   name: '私人岛屿',     price: 3.0e8,  img: 'island',   desc: '加勒比海私人天堂' },
    { id: 'rocket',   name: '火星任务',     price: 1.0e10, img: 'rocket',   desc: '一次星舰发射' },
    { id: 'twitter',  name: '收购推特',     price: 4.4e10, img: 'skyline',  desc: '买下全球社交平台' },
    { id: 'manu',     name: '收购曼联',     price: 6.0e9,  img: 'skyline',  desc: '英超百年豪门' },
    { id: 'donate',   name: '慈善捐赠',     price: 1.0e9,  img: 'island',   desc: '捐给联合国基金会' }
  ];

  /** 一键小额烧钱（无图） */
  var QUICK_BURNS = [
    { id: 'coffee',  name: '买杯咖啡',   price: 5 },
    { id: 'models',  name: '买辆 Model S', price: 1.0e5 },
    { id: 'everyone', name: '给全球每人 $1', price: 8.0e9 },
    { id: 'marscity', name: '建火星基地', price: 5.0e11 }
  ];

  // ── 工具：默认随机数发生器 ───────────────────────────────
  /**
   * 默认 rng，返回 [0,1)。可被测试替换为确定性伪随机。
   * @returns {number}
   */
  function defaultRng() {
    return Math.random();
  }

  // ── 格式化 ──────────────────────────────────────────────
  /**
   * 把美元数字格式成中文量级字符串。
   * @param {number} n 金额（美元）
   * @returns {string} 形如「$1.30万亿」「$4.40亿」「$12.50万」
   */
  function formatMoney(n) {
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + '万亿';
    if (abs >= 1e8)  return sign + '$' + (abs / 1e8).toFixed(2) + '亿';
    if (abs >= 1e4)  return sign + '$' + (abs / 1e4).toFixed(2) + '万';
    return sign + '$' + Math.round(abs).toLocaleString('en-US');
  }

  /**
   * 把大数字格式成带中文量级的纯数字串（无货币符号）。
   * @param {number} n
   * @returns {string}
   */
  function formatCount(n) {
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + '万亿';
    if (abs >= 1e8)  return sign + (abs / 1e8).toFixed(2) + '亿';
    if (abs >= 1e4)  return sign + (abs / 1e4).toFixed(2) + '万';
    return sign + Math.round(abs).toLocaleString('en-US');
  }

  /**
   * 把分钟数格式成人类可读时长。
   * @param {number} minutes
   * @returns {string}
   */
  function formatDuration(minutes) {
    if (!isFinite(minutes) || minutes <= 0) return '0 分钟';
    if (minutes < 60) return Math.round(minutes) + ' 分钟';
    if (minutes < 60 * 24) return (minutes / 60).toFixed(1) + ' 小时';
    if (minutes < MINUTES_PER_YEAR) return (minutes / (60 * 24)).toFixed(1) + ' 天';
    var years = minutes / MINUTES_PER_YEAR;
    if (years < 1000) return years.toFixed(1) + ' 年';
    if (years < 1e6)  return (years / 1000).toFixed(2) + ' 千年';
    return (years / 1e6).toFixed(2) + ' 百万年';
  }

  // ── 破产数学 ────────────────────────────────────────────
  /**
   * 破产概率（永不归零的补）。P = exp(-2·edge·W / bet)，夹紧到 [0,1]。
   * @param {number} wealth 当前财富 W
   * @param {number} bet    每手下注 B
   * @param {number} [edge] 庄家优势，默认 1.2%
   * @returns {number} 区间 [0,1]
   */
  function ruinProbability(wealth, bet, edge) {
    if (wealth <= 0) return 1;
    if (bet <= 0) return 0;
    var e = (edge === undefined || edge === null) ? BACCARAT_EDGE : edge;
    var exponent = -2 * e * wealth / bet;
    if (exponent < -700) return 0; // exp 下溢
    var p = Math.exp(exponent);
    if (p > 1) p = 1;
    if (p < 0) p = 0;
    return p;
  }

  /**
   * 期望破产手数 E[T] ≈ W / (bet·edge)。
   * @param {number} wealth
   * @param {number} bet
   * @param {number} [edge]
   * @returns {number}
   */
  function expectedHandsToRuin(wealth, bet, edge) {
    if (wealth <= 0 || bet <= 0) return 0;
    var e = (edge === undefined || edge === null) ? BACCARAT_EDGE : edge;
    return wealth / (bet * e);
  }

  /**
   * 期望破产时长（分钟），按给定发牌速度。
   * @param {number} wealth
   * @param {number} bet
   * @param {number} [edge]
   * @param {number} [handsPerMin]
   * @returns {number}
   */
  function expectedDurationMinutes(wealth, bet, edge, handsPerMin) {
    var hpm = handsPerMin || HANDS_PER_MINUTE;
    if (hpm <= 0) return Infinity;
    return expectedHandsToRuin(wealth, bet, edge) / hpm;
  }

  /**
   * 给定目标破产概率，反解所需下注额 B*。
   *   由 exp(-2·edge·W / B) = prob  =>  B = 2·edge·W / (-ln prob)
   * @param {number} wealth
   * @param {number} prob   目标破产概率，区间 (0,1)
   * @param {number} [edge]
   * @returns {number}
   */
  function crossoverBet(wealth, prob, edge) {
    if (wealth <= 0 || prob <= 0 || prob >= 1) return Infinity;
    var e = (edge === undefined || edge === null) ? BACCARAT_EDGE : edge;
    return 2 * e * wealth / (-Math.log(prob));
  }

  /**
   * 按当前下注强度，一年期望亏损（美元）。
   * @param {number} bet
   * @param {number} [edge]
   * @param {number} [handsPerMin]
   * @returns {number}
   */
  function annualLoss(bet, edge, handsPerMin) {
    var e = (edge === undefined || edge === null) ? BACCARAT_EDGE : edge;
    var hpm = handsPerMin || HANDS_PER_MINUTE;
    return bet * e * hpm * MINUTES_PER_YEAR;
  }

  /**
   * 每手期望亏损。
   * @param {number} bet
   * @param {number} [edge]
   * @returns {number}
   */
  function lossPerHand(bet, edge) {
    var e = (edge === undefined || edge === null) ? BACCARAT_EDGE : edge;
    return bet * e;
  }

  // ── 博弈模拟 ────────────────────────────────────────────
  /**
   * 模拟一注百家乐（买闲）。
   * @param {number} bet   下注额
   * @param {function} [rng] 返回 [0,1) 的随机函数
   * @returns {{win:boolean, delta:number}} delta = +bet 或 -bet
   */
  function playHand(bet, rng) {
    var r = (rng || defaultRng)();
    var win = r < PLAYER_WIN_PROB;
    return { win: win, delta: win ? bet : -bet };
  }

  /**
   * 连续模拟若干手，返回财富轨迹与统计。wealth 归零即停。
   * @param {number} wealth 起始财富
   * @param {number} bet    每手下注（不超过剩余财富）
   * @param {number} maxHands 最多模拟手数（防死循环）
   * @param {function} [rng]
   * @returns {{trajectory:number[], handsPlayed:number, finalWealth:number, busted:boolean, wins:number}}
   */
  function simulateHands(wealth, bet, maxHands, rng) {
    var r = rng || defaultRng;
    var w = wealth;
    var traj = [w];
    var hands = 0;
    var wins = 0;
    var cap = maxHands || 100000;
    while (w > 0 && hands < cap) {
      var b = Math.min(bet, w);
      var win = r() < PLAYER_WIN_PROB;
      if (win) { w += b; wins++; } else { w -= b; }
      hands++;
      // 轨迹采样：超过 2000 手后每 100 手记一次，避免数组过大
      if (hands <= 2000 || hands % 100 === 0) traj.push(w);
      if (w <= 0) break;
    }
    return {
      trajectory: traj,
      handsPlayed: hands,
      finalWealth: Math.max(0, w),
      busted: w <= 0,
      wins: wins
    };
  }

  // ── 烧钱（消费） ────────────────────────────────────────
  /**
   * 花一笔钱，返回新财富（不低于 0）。
   * @param {number} wealth
   * @param {number} cost
   * @returns {number}
   */
  function spend(wealth, cost) {
    if (wealth <= 0) return 0;
    var next = wealth - cost;
    return next < 0 ? 0 : next;
  }

  /**
   * 买 N 件商品的总价。
   * @param {object} item CATALOG 条目
   * @param {number} qty
   * @returns {number}
   */
  function totalPrice(item, qty) {
    return item.price * qty;
  }

  /**
   * 按「当前烧钱速率」推算破产倒计时（秒）。
   * @param {number} wealth      当前财富
   * @param {number} spentSoFar  本局已花费
   * @param {number} elapsedSec  本局已耗时（秒）
   * @returns {number} 距归零的秒数；速率≤0 返回 Infinity
   */
  function timeToBrokeSeconds(wealth, spentSoFar, elapsedSec) {
    if (spentSoFar <= 0 || elapsedSec <= 0) return Infinity;
    var rate = spentSoFar / elapsedSec; // 美元/秒
    if (rate <= 0) return Infinity;
    return wealth / rate;
  }

  // ── 对比参考 ────────────────────────────────────────────
  /**
   * 把给定金额换算成「相当于特斯拉多少小时的身家波动」。
   * @param {number} amount
   * @returns {number}
   */
  function asTeslaHours(amount) {
    if (amount <= 0) return 0;
    return amount / TESLA_HOURLY_SWING;
  }

  // ── 导出 ────────────────────────────────────────────────
  var api = {
    START_WEALTH: START_WEALTH,
    BACCARAT_EDGE: BACCARAT_EDGE,
    PLAYER_WIN_PROB: PLAYER_WIN_PROB,
    TABLE_MAX_BET: TABLE_MAX_BET,
    HANDS_PER_MINUTE: HANDS_PER_MINUTE,
    TESLA_HOURLY_SWING: TESLA_HOURLY_SWING,
    CATALOG: CATALOG,
    QUICK_BURNS: QUICK_BURNS,
    formatMoney: formatMoney,
    formatCount: formatCount,
    formatDuration: formatDuration,
    ruinProbability: ruinProbability,
    expectedHandsToRuin: expectedHandsToRuin,
    expectedDurationMinutes: expectedDurationMinutes,
    crossoverBet: crossoverBet,
    annualLoss: annualLoss,
    lossPerHand: lossPerHand,
    playHand: playHand,
    simulateHands: simulateHands,
    spend: spend,
    totalPrice: totalPrice,
    timeToBrokeSeconds: timeToBrokeSeconds,
    asTeslaHours: asTeslaHours
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.MuskBurner = api;
})(typeof window !== 'undefined' ? window : globalThis);
