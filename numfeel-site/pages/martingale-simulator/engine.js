/**
 * 马丁格尔策略核心算法
 * 纯函数，不操作 DOM，可独立测试
 */

/**
 * 计算马丁格尔当前应下注额
 * @param {number} baseBet - 初始下注
 * @param {number} consecutiveLosses - 连输次数
 * @param {number} tableLimit - 赌桌限红
 * @returns {number} 当前应下注额
 */
function calcMartingaleBet(baseBet, consecutiveLosses, tableLimit) {
  var bet = baseBet * Math.pow(2, consecutiveLosses);
  if (bet > tableLimit) return tableLimit;
  return bet;
}

/**
 * 计算凯利下注比例
 * @param {number} winRate - 胜率 (0~1)
 * @param {number} netOdds - 净赔率（赢时净赚倍数）
 * @returns {number} 凯利比例 (0~1)
 */
function calcKellyFraction(winRate, netOdds) {
  if (netOdds <= 0) return 0;
  var loseRate = 1 - winRate;
  var f = (winRate * netOdds - loseRate) / netOdds;
  if (f < 0) return 0;
  if (f > 1) return 1;
  return f;
}

/**
 * 检查玩家是否还能继续
 * @param {Object} state
 * @returns {string} 'ok' | 'player_bankrupt' | 'table_limit' | 'dealer_bankrupt'
 */
function checkGameStatus(state) {
  if (state.dealerMoney <= 0) return 'dealer_bankrupt';
  if (state.playerMoney < state.baseBet) return 'player_bankrupt';
  if (state.currentBet > state.tableLimit) return 'table_limit';
  if (state.playerMoney < state.currentBet) return 'player_bankrupt';
  return 'ok';
}

/**
 * 计算玩家赢钱后庄家应付金额
 * 轮盘赌红黑：下注1元，赢拿回2元（净赚1元）
 * @param {number} bet - 下注额
 * @returns {number} 庄家应付
 */
function calcDealerPayout(bet) {
  return bet * 2;
}

/**
 * 单局游戏
 * @param {Object} state - 当前状态
 * @param {string} state.strategy - 'martingale' | 'fixed' | 'kelly'
 * @param {number} state.playerMoney
 * @param {number} state.dealerMoney
 * @param {number} state.baseBet
 * @param {number} state.currentBet
 * @param {number} state.winRate
 * @param {number} state.tableLimit
 * @param {number} state.consecutiveLosses
 * @param {number} state.totalRounds
 * @param {number} state.wins
 * @param {number} state.losses
 * @param {Array} state.history
 * @returns {Object} 新的状态
 */
function playRound(state) {
  var s = {
    playerMoney: state.playerMoney,
    dealerMoney: state.dealerMoney,
    baseBet: state.baseBet,
    currentBet: state.currentBet,
    winRate: state.winRate,
    tableLimit: state.tableLimit,
    consecutiveLosses: state.consecutiveLosses,
    totalRounds: state.totalRounds,
    wins: state.wins,
    losses: state.losses,
    history: state.history ? state.history.slice() : [],
    strategy: state.strategy || 'martingale'
  };

  var status = checkGameStatus(s);
  if (status !== 'ok') {
    return { state: s, status: status, won: false, payout: 0 };
  }

  var rand = Math.random();
  var won = rand < s.winRate;
  var payout = 0;

  if (won) {
    payout = s.currentBet * 2;
    s.playerMoney += payout;
    s.dealerMoney -= payout;
    s.wins++;
    s.consecutiveLosses = 0;
    s.currentBet = s.baseBet;
  } else {
    s.playerMoney -= s.currentBet;
    s.dealerMoney += s.currentBet;
    s.losses++;
    s.consecutiveLosses++;
    if (s.strategy === 'martingale') {
      s.currentBet = calcMartingaleBet(s.baseBet, s.consecutiveLosses, s.tableLimit);
    }
  }

  if (s.dealerMoney < 0) s.dealerMoney = 0;
  if (s.playerMoney < 0) s.playerMoney = 0;

  s.totalRounds++;

  s.history.push({
    round: s.totalRounds,
    bet: state.currentBet,
    won: won,
    playerAfter: s.playerMoney,
    dealerAfter: s.dealerMoney
  });

  status = checkGameStatus(s);
  return { state: s, status: status, won: won, payout: payout };
}

/**
 * 重置状态
 * @param {Object} params
 * @returns {Object} 初始状态
 */
function createInitialState(params) {
  return {
    playerMoney: Math.max(0, params.playerMoney != null ? params.playerMoney : 0),
    dealerMoney: Math.max(0, params.dealerMoney != null ? params.dealerMoney : 0),
    baseBet: Math.max(1, params.baseBet != null ? params.baseBet : 1),
    currentBet: Math.max(1, params.currentBet != null ? params.currentBet : (params.baseBet != null ? params.baseBet : 1)),
    winRate: clamp(params.winRate != null ? params.winRate : 0.486, 0, 1),
    tableLimit: Math.max(1, params.tableLimit != null ? params.tableLimit : 1),
    consecutiveLosses: 0,
    totalRounds: 0,
    wins: 0,
    losses: 0,
    history: [],
    strategy: params.strategy || 'martingale'
  };
}

function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * 固定下注策略的单局
 */
function playFixedRound(state) {
  var s = JSON.parse(JSON.stringify(state));
  s.currentBet = s.baseBet;
  s.strategy = 'fixed';
  return playRound(s);
}

/**
 * 凯利策略的单局
 */
function playKellyRound(state) {
  var s = JSON.parse(JSON.stringify(state));
  var kellyFrac = calcKellyFraction(s.winRate, 1);
  s.currentBet = Math.max(1, Math.floor(s.playerMoney * kellyFrac));
  if (s.currentBet > s.tableLimit) s.currentBet = s.tableLimit;
  s.strategy = 'kelly';
  return playRound(s);
}

/**
 * 自动运行多局
 * @param {Object} initialState
 * @param {number} maxRounds
 * @param {string} strategy
 * @param {Function} onRound - 每局回调
 * @returns {Object} 最终状态
 */
function autoPlay(initialState, maxRounds, strategy, onRound) {
  var state = JSON.parse(JSON.stringify(initialState));
  state.strategy = strategy || 'martingale';

  for (var i = 0; i < maxRounds; i++) {
    var result = strategy === 'fixed'
      ? playFixedRound(state)
      : strategy === 'kelly'
        ? playKellyRound(state)
        : playRound(state);

    state = result.state;

    if (onRound) onRound(result);

    if (result.status !== 'ok') break;
  }

  return state;
}

/**
 * 蒙特卡洛模拟
 * @param {Object} params
 * @param {number} params.playerMoney
 * @param {number} params.dealerMoney
 * @param {number} params.baseBet
 * @param {number} params.tableLimit
 * @param {number} params.winRate
 * @param {number} params.numPlayers - 模拟人数
 * @param {number} params.maxRounds - 每人最多局数
 * @param {string} params.strategy
 * @returns {Object} 统计结果
 */
function runSimulation(params) {
  var numPlayers = params.numPlayers || 1000;
  var maxRounds = params.maxRounds || 500;

  var results = [];
  var bankruptCount = 0;
  var beatDealerCount = 0;
  var hitLimitCount = 0;

  for (var i = 0; i < numPlayers; i++) {
    var initState = createInitialState({
      playerMoney: params.playerMoney,
      dealerMoney: params.dealerMoney,
      baseBet: params.baseBet,
      tableLimit: params.tableLimit,
      winRate: params.winRate,
      strategy: params.strategy || 'martingale'
    });

    var finalState = autoPlay(initState, maxRounds, params.strategy || 'martingale');

    results.push({
      finalPlayer: finalState.playerMoney,
      finalDealer: finalState.dealerMoney,
      totalRounds: finalState.totalRounds,
      wins: finalState.wins,
      losses: finalState.losses,
      maxConsecutiveLosses: calcMaxConsecutiveLosses(finalState.history)
    });

    if (finalState.playerMoney <= 0 || finalState.playerMoney < finalState.baseBet) {
      bankruptCount++;
    }
    if (finalState.dealerMoney <= 0) {
      beatDealerCount++;
    }
    if (finalState.totalRounds < maxRounds && finalState.playerMoney > 0 && finalState.playerMoney >= finalState.baseBet) {
      var lastBet = finalState.history.length > 0
        ? finalState.history[finalState.history.length - 1].bet
        : finalState.baseBet;
      if (lastBet > finalState.tableLimit) hitLimitCount++;
    }
  }

  results.sort(function(a, b) { return a.finalPlayer - b.finalPlayer; });

  var totalFinalMoney = results.reduce(function(sum, r) { return sum + r.finalPlayer; }, 0);
  var median = results[Math.floor(numPlayers / 2)].finalPlayer;
  var avg = totalFinalMoney / numPlayers;

  return {
    bankruptRate: bankruptCount / numPlayers,
    beatDealerRate: beatDealerCount / numPlayers,
    hitLimitRate: hitLimitCount / numPlayers,
    avgFinalMoney: avg,
    medianFinalMoney: median,
    totalPlayers: numPlayers,
    results: results
  };
}

function calcMaxConsecutiveLosses(history) {
  var maxLoss = 0;
  var currentLoss = 0;
  for (var i = 0; i < history.length; i++) {
    if (!history[i].won) {
      currentLoss++;
      if (currentLoss > maxLoss) maxLoss = currentLoss;
    } else {
      currentLoss = 0;
    }
  }
  return maxLoss;
}

/**
 * 敏感度分析：扫描不同初始下注的破产率
 * @param {Object} params
 * @param {number} params.playerMoney
 * @param {number} params.dealerMoney
 * @param {number} params.tableLimit
 * @param {number} params.winRate
 * @param {number} params.numPlayers
 * @param {number} params.maxRounds
 * @param {Array<number>} params.betValues - 要扫描的下注额数组
 * @returns {Array<{bet: number, bankruptRate: number, beatDealerRate: number}>}
 */
function runSensitivityAnalysis(params) {
  var betValues = params.betValues || [1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

  return betValues.map(function(bet) {
    var sim = runSimulation({
      playerMoney: params.playerMoney,
      dealerMoney: params.dealerMoney,
      baseBet: bet,
      tableLimit: params.tableLimit,
      winRate: params.winRate,
      numPlayers: params.numPlayers || 500,
      maxRounds: params.maxRounds || 500,
      strategy: 'martingale'
    });
    return {
      bet: bet,
      bankruptRate: sim.bankruptRate,
      beatDealerRate: sim.beatDealerRate,
      avgFinal: sim.avgFinalMoney
    };
  });
}

/**
 * 三种策略对比模拟
 */
function runStrategyComparison(params) {
  var strategies = ['martingale', 'fixed', 'kelly'];
  return strategies.map(function(strategy) {
    var sim = runSimulation({
      playerMoney: params.playerMoney,
      dealerMoney: params.dealerMoney,
      baseBet: params.baseBet,
      tableLimit: params.tableLimit,
      winRate: params.winRate,
      numPlayers: params.numPlayers || 500,
      maxRounds: params.maxRounds || 500,
      strategy: strategy
    });
    return {
      strategy: strategy,
      bankruptRate: sim.bankruptRate,
      beatDealerRate: sim.beatDealerRate,
      avgFinalMoney: sim.avgFinalMoney,
      medianFinalMoney: sim.medianFinalMoney
    };
  });
}

/**
 * 格式化金额
 */
function formatMoney(num) {
  if (!Number.isFinite(num)) return '¥0';
  if (num < 0) return '-¥' + formatMoney(-num).replace(/^¥/, '');
  if (num >= 1e8) return '¥' + (num / 1e8).toFixed(2) + '亿';
  if (num >= 1e4) return '¥' + (num / 1e4).toFixed(2) + '万';
  return '¥' + num.toFixed(2);
}

/**
 * 格式化百分比
 */
function formatPercent(num) {
  return (num * 100).toFixed(1) + '%';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcMartingaleBet: calcMartingaleBet,
    calcKellyFraction: calcKellyFraction,
    checkGameStatus: checkGameStatus,
    calcDealerPayout: calcDealerPayout,
    playRound: playRound,
    createInitialState: createInitialState,
    playFixedRound: playFixedRound,
    playKellyRound: playKellyRound,
    autoPlay: autoPlay,
    runSimulation: runSimulation,
    runSensitivityAnalysis: runSensitivityAnalysis,
    runStrategyComparison: runStrategyComparison,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    calcMaxConsecutiveLosses: calcMaxConsecutiveLosses
  };
}