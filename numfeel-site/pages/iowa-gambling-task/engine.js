/**
 * 爱荷华赌博任务（Iowa Gambling Task）核心逻辑引擎。
 *
 * 规则还原 Bechara & Damasio (1994) 原版：
 *  - 起始资金 $2000，共 100 次选择
 *  - 牌堆 A/B 每张收益 +$100，长期期望每 10 张 -$250（坏堆）
 *  - 牌堆 C/D 每张收益 +$50，长期期望每 10 张 +$250（好堆）
 *  - 每局开局洗牌：各牌堆每 10 张的损失位置随机打乱，保证同一牌堆
 *    单张结果不可预测、每局模式不同，玩家只能靠体感学习而非背模式
 *
 * 纯逻辑模块：不操作 DOM，可在 Node 中直接 require 测试。
 * 可通过 options.random 注入随机源，便于测试复现。
 */

/** 每 10 张一轮的损失池（含 0 = 该张无损失），开局洗牌后按选择次数取模 */
var DECK_LOSS_POOL = {
  A: [150, 0, 300, 0, 200, 0, 250, 0, 350, 0],
  B: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1250],
  C: [50, 0, 25, 0, 75, 0, 50, 0, 50, 0],
  D: [0, 0, 0, 0, 0, 0, 0, 0, 0, 250]
};

/** 各堆每张固定收益 */
var DECK_GAIN = { A: 100, B: 100, C: 50, D: 50 };

/** 每 10 张的净期望（用于展示与测试） */
var DECK_NET_PER_TEN = { A: -250, B: -250, C: 250, D: 250 };

/** 默认起始资金 */
var START_MONEY = 2000;

/** 默认总手数 */
var TOTAL_ROUNDS = 100;

/** 每块（学习曲线分块）手数 */
var BLOCK_SIZE = 20;

/**
 * Fisher-Yates 洗牌（使用注入的随机源）。
 * @param {Array} arr 原数组
 * @param {Function} rand 返回 [0,1) 的随机函数
 * @returns {Array} 新洗牌数组
 */
function shuffle(arr, rand) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * 创建一局爱荷华赌博任务。
 * @param {Object} [options] 可选配置
 * @param {number} [options.startMoney=2000] 起始资金
 * @param {number} [options.totalRounds=100] 总手数
 * @param {number} [options.blockSize=20] 学习曲线分块大小
 * @param {Function} [options.random=Math.random] 随机源
 * @returns {Object} 游戏状态机
 */
function createGame(options) {
  var opt = options || {};
  var startMoney = opt.startMoney !== undefined ? opt.startMoney : START_MONEY;
  var totalRounds = opt.totalRounds !== undefined ? opt.totalRounds : TOTAL_ROUNDS;
  var blockSize = opt.blockSize !== undefined ? opt.blockSize : BLOCK_SIZE;
  var rand = typeof opt.random === 'function' ? opt.random : Math.random;

  var money = startMoney;
  var trial = 0;
  var over = false;
  var bankrupt = false;
  /** 各堆累计选择次数 */
  var deckCounts = { A: 0, B: 0, C: 0, D: 0 };
  /** 每手记录：{deck, gain, loss, net, money} */
  var history = [];
  /** 每堆累计净收益 */
  var deckNet = { A: 0, B: 0, C: 0, D: 0 };
  /** 各堆当前轮的洗牌后损失序列（抽满一轮后重新洗牌） */
  var cycles = {};

  /** 取某堆当前轮的损失序列，若无则开局洗牌生成 */
  function cycleFor(deck) {
    if (!cycles[deck]) {
      cycles[deck] = shuffle(DECK_LOSS_POOL[deck], rand);
    }
    return cycles[deck];
  }

  /** 从确定性洗牌序列取当前手的损失值 */
  function lossFor(deck) {
    var cycle = cycleFor(deck);
    var idx = deckCounts[deck] % cycle.length;
    return cycle[idx];
  }

  /**
   * 抽一张牌。
   * @param {string} deck 牌堆名："A" | "B" | "C" | "D"
   * @returns {Object} { deck, gain, loss, net, money, trial, over, bankrupt }
   */
  function drawCard(deck) {
    if (over) {
      throw new Error('Game already over');
    }
    if (DECK_GAIN[deck] === undefined) {
      throw new Error('Invalid deck: ' + deck);
    }
    var gain = DECK_GAIN[deck];
    var loss = lossFor(deck);
    var net = gain - loss;
    money += net;
    trial += 1;
    deckCounts[deck] += 1;
    deckNet[deck] += net;
    history.push({ deck: deck, gain: gain, loss: loss, net: net, money: money });

    // 抽满 10 张后重新洗牌下一轮
    if (deckCounts[deck] % 10 === 0) {
      cycles[deck] = shuffle(DECK_LOSS_POOL[deck], rand);
    }

    if (money < 0) {
      over = true;
      bankrupt = true;
    } else if (trial >= totalRounds) {
      over = true;
    }

    return {
      deck: deck,
      gain: gain,
      loss: loss,
      net: net,
      money: money,
      trial: trial,
      over: over,
      bankrupt: bankrupt
    };
  }

  /**
   * 净分数：好堆(C+D)选择数减去坏堆(A+B)选择数。
   * @returns {number}
   */
  function netScore() {
    return (deckCounts.C + deckCounts.D) - (deckCounts.A + deckCounts.B);
  }

  /**
   * 计算按块分组的净分数（学习曲线用）。
   * @returns {Array<number>} 每块一个净分数（块内 (C+D)-(A+B) 累计）
   */
  function blockScores() {
    var result = [];
    for (var i = 0; i < history.length; i += blockSize) {
      var picks = history.slice(i, i + blockSize);
      var score = 0;
      for (var j = 0; j < picks.length; j++) {
        var deck = picks[j].deck;
        if (deck === 'C' || deck === 'D') {
          score += 1;
        } else {
          score -= 1;
        }
      }
      result.push(score);
    }
    return result;
  }

  /**
   * 累计净分数（到当前为止）。
   * @returns {number}
   */
  function cumulativeNetScore() {
    return netScore();
  }

  /**
   * 获取当前状态快照。
   * @returns {Object} 包含 money/trial/over/bankrupt/deckCounts/netScore/blockScores
   */
  function getState() {
    return {
      money: money,
      trial: trial,
      totalRounds: totalRounds,
      over: over,
      bankrupt: bankrupt,
      startMoney: startMoney,
      deckCounts: {
        A: deckCounts.A, B: deckCounts.B, C: deckCounts.C, D: deckCounts.D
      },
      deckNet: {
        A: deckNet.A, B: deckNet.B, C: deckNet.C, D: deckNet.D
      },
      netScore: netScore(),
      blockScores: blockScores()
    };
  }

  /** 各堆每 10 张净期望（对外只读暴露） */
  function deckExpectation() {
    return {
      A: DECK_NET_PER_TEN.A, B: DECK_NET_PER_TEN.B,
      C: DECK_NET_PER_TEN.C, D: DECK_NET_PER_TEN.D
    };
  }

  return {
    drawCard: drawCard,
    netScore: netScore,
    cumulativeNetScore: cumulativeNetScore,
    blockScores: blockScores,
    getState: getState,
    deckExpectation: deckExpectation
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createGame: createGame,
    DECK_LOSS_POOL: DECK_LOSS_POOL,
    DECK_GAIN: DECK_GAIN,
    DECK_NET_PER_TEN: DECK_NET_PER_TEN,
    START_MONEY: START_MONEY,
    TOTAL_ROUNDS: TOTAL_ROUNDS,
    BLOCK_SIZE: BLOCK_SIZE
  };
}
