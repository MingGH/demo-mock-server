/**
 * engine.js — 拼多多"砍一刀"模拟器核心算法
 * 纯函数、无 DOM 依赖，可在 Node.js 中直接 require 测试。
 *
 * 核心思想：
 *   1) 砍价 = 剩余金额 × 随机因子 × 帮砍人权重
 *   2) 三段式衰减：前段爽（0~50%），中段慢（50%~90%），芝诺段几乎不动（>=90%）
 *   3) 权重决定每类账号的贡献上限，黑产号权重被压到 0.01
 */

/** 好友类型的默认权重表 */
var WEIGHTS = {
  'new': 5.0,   // 从未使用过拼多多的新用户
  'old': 0.3,   // 已注册的老用户
  'bot': 0.0001 // 黑产/羊毛党账号（权重被压到接近 0）
};

/** 可复现的 mulberry32 伪随机 */
function makeRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 单次砍价：三段式衰减
 * @param {number} remain  剩余金额（可以理解为"距离免单还差多少元"）
 * @param {number} weight  帮砍人权重（0.01 ~ 5）
 * @param {number} progress 当前完成度 0~1
 * @param {number} rand    注入的 0~1 随机数
 * @returns {number} 本次砍掉的金额（>=0）
 */
function cutOnce(remain, weight, progress, rand) {
  if (remain <= 0) return 0;
  if (progress < 0) progress = 0;
  if (progress > 1) progress = 1;
  var r = rand;
  if (r < 0) r = 0;
  if (r > 1) r = 1;

  var factor;
  if (progress < 0.5) {
    // 前段爽：15% ~ 50%
    factor = 0.15 + 0.35 * r;
  } else if (progress < 0.9) {
    // 减速带：2% ~ 7%
    factor = 0.02 + 0.05 * r;
  } else {
    // 芝诺段：0.01% ~ 0.11%
    factor = 0.0001 + 0.001 * r;
  }
  var cut = remain * factor * (weight / 5);
  if (cut > remain) cut = remain;
  if (cut < 0) cut = 0;
  return cut;
}

/**
 * 一次完整的砍价局
 * @param {Object} config
 *   - target   目标金额（默认 100，代表 100% 进度条）
 *   - friends  好友数组，如 [{type:'new'}, {type:'old'}, ...]，按顺序被抽用
 *   - seed     随机种子（可选，用于测试可复现）
 *   - rng      直接注入随机函数（优先于 seed）
 *   - shuffle  是否打乱好友顺序（默认 false，方便测试）
 * @returns {Object}
 *   - cuts        每次砍价的详情 [{index, type, weight, amount, remainAfter, progress}]
 *   - remain      最终剩余
 *   - target
 *   - success     是否砍到 <= 0.01（也就是拼多多眼里的"完成"）
 *   - progress    最终进度 0~1
 *   - percentLeft 剩余百分比（数值形式，可保留 8 位小数）
 */
function simulateRun(config) {
  var target = config.target != null ? config.target : 100;
  var friends = config.friends || [];
  var rng = config.rng || makeRng(config.seed != null ? config.seed : 1);
  var order = friends.slice();
  if (config.shuffle) {
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
  }

  var remain = target;
  var cuts = [];
  for (var k = 0; k < order.length; k++) {
    if (remain <= 0.01) break; // 拼多多完成阈值
    var f = order[k];
    var w = f.weight != null ? f.weight : WEIGHTS[f.type];
    if (w == null) w = 0.3;
    var progress = 1 - remain / target;
    var amount = cutOnce(remain, w, progress, rng());
    remain -= amount;
    if (remain < 0) remain = 0;
    cuts.push({
      index: k,
      type: f.type,
      weight: w,
      amount: amount,
      remainAfter: remain,
      progress: 1 - remain / target
    });
  }

  var percentLeft = (remain / target) * 100;
  return {
    cuts: cuts,
    remain: remain,
    target: target,
    success: remain <= 0.01,
    progress: 1 - remain / target,
    percentLeft: percentLeft
  };
}

/**
 * 黑产刷单成本测算：无论多少个黑产账号，理论砍价上限就是被"权重"锁死的
 * @param {number} target  免单目标金额
 * @param {number} botCount 黑产账号数量
 * @param {number} cac     平台可接受的获客成本（元）
 * @param {number} seed
 * @returns {{totalCut:number, ratio:number, safe:boolean, remain:number}}
 */
function simulateBotAttack(target, botCount, cac, seed) {
  var friends = [];
  for (var i = 0; i < botCount; i++) friends.push({ type: 'bot' });
  var run = simulateRun({ target: target, friends: friends, seed: seed || 20240101 });
  var totalCut = target - run.remain;
  return {
    totalCut: totalCut,
    ratio: totalCut / cac,
    safe: totalCut < cac,
    remain: run.remain
  };
}

/**
 * 生成"剩余金额随刀数变化"的对数曲线数据
 * @param {number} target
 * @param {Array<{type:string,count:number}>} composition  好友组合
 * @param {number} seed
 * @returns {number[]} 每一刀之后的剩余金额（含起点 target）
 */
function buildDecayCurve(target, composition, seed) {
  var friends = [];
  for (var i = 0; i < composition.length; i++) {
    var c = composition[i];
    for (var j = 0; j < c.count; j++) friends.push({ type: c.type });
  }
  var run = simulateRun({ target: target, friends: friends, seed: seed || 42 });
  var series = [target];
  for (var k = 0; k < run.cuts.length; k++) series.push(run.cuts[k].remainAfter);
  return series;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WEIGHTS: WEIGHTS,
    makeRng: makeRng,
    cutOnce: cutOnce,
    simulateRun: simulateRun,
    simulateBotAttack: simulateBotAttack,
    buildDecayCurve: buildDecayCurve
  };
}
if (typeof window !== 'undefined') {
  window.PddEngine = {
    WEIGHTS: WEIGHTS,
    makeRng: makeRng,
    cutOnce: cutOnce,
    simulateRun: simulateRun,
    simulateBotAttack: simulateBotAttack,
    buildDecayCurve: buildDecayCurve
  };
}
