/**
 * 十连注 逻辑层（纯函数，无 DOM，node 可直跑）
 *
 * 规则：
 * - 本金 100，最多 10 次下注机会；每次下注后剩余资金 ≥ 0
 * - 10 个机会位中随机 1 个中 10 倍（押 b 收 10b），其余必打水漂
 * - 中签位是开局预定的；因此已下注且未中的位置被排除，
 *   条件概率向后集中：第 k 注中签概率 = 1/(11-k)，第 10 注若前 9 注全空则必中
 * - 中签后剩余机会必输，本 demo 按"中签即停"结算（与理性策略一致）
 */
'use strict';

var ROUND_COUNT = 10;
var PAYOUT = 10;
var START_CAPITAL = 100;

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * 开新局。rng 可注入以便测试（返回 [0,1)），缺省 Math.random
 */
function createGame(rng) {
  var r = typeof rng === 'function' ? rng : Math.random;
  return {
    round: 1,
    capital: START_CAPITAL,
    winner: 1 + Math.floor(r() * ROUND_COUNT),
    over: false,
    won: false,
    bets: [],
    history: [] // {round, bet, capitalAfter, won}
  };
}

/** 当前这一注的中签概率（前序位置已全部排除） */
function nextWinProbability(round) {
  if (round < 1 || round > ROUND_COUNT) return 0;
  return 1 / (ROUND_COUNT - round + 1);
}

/**
 * 下注。返回新状态（不修改入参），非法操作抛异常
 */
function placeBet(state, amount) {
  if (state.over) throw new Error('本局已结束');
  if (!(typeof amount === 'number' && isFinite(amount) && amount > 0)) {
    throw new Error('押注金额必须是正数');
  }
  if (amount > state.capital + 1e-9) throw new Error('押注不能超过当前资金');
  var bet = Math.min(amount, state.capital);
  var isWin = state.round === state.winner;
  var next = {
    round: state.round,
    capital: state.capital - bet,
    winner: state.winner,
    over: false,
    won: isWin,
    bets: state.bets.concat([bet]),
    history: state.history.slice()
  };
  if (isWin) {
    next.capital += bet * PAYOUT;
    next.over = true;
  } else if (next.capital <= 1e-9) {
    next.capital = 0;
    next.over = true;
  } else if (state.round === ROUND_COUNT) {
    next.over = true;
  } else {
    next.round = state.round + 1;
  }
  next.history.push({ round: state.round, bet: bet, capitalAfter: next.capital, won: isWin });
  return next;
}

// ── 流派计划：给定起始资金，返回每注押多少（按计划打，中签即停） ──

/** 梭哈派：第 1 注全押 */
function allInPlan(capital, n) {
  n = n || ROUND_COUNT;
  var plan = [];
  for (var i = 0; i < n; i++) plan.push(capital);
  return plan;
}

/** 固定注：每注 capital/n */
function uniformPlan(capital, n) {
  n = n || ROUND_COUNT;
  var per = capital / n;
  var plan = [];
  for (var i = 0; i < n; i++) plan.push(per);
  return plan;
}

/** 探针流：前 n-1 注各押最小单位 1 元，最后一注全押余款（要求 capital ≥ n） */
function probePlan(capital, n) {
  n = n || ROUND_COUNT;
  if (capital < n) throw new Error('探针流要求资金至少 ' + n + ' 元');
  var plan = [];
  for (var i = 0; i < n - 1; i++) plan.push(1);
  plan.push(capital - (n - 1));
  return plan;
}

/**
 * 均注流：注额每注 ×n/(n-1)（即 ×10/9），把"中在第 k 注"的所有结局拉平。
 * 推导：中在第 k 注的结算 = B - S(k-1) + (n-1)·b(k)，令其恒等于 C 得
 * b(k) = (C-B+S(k-1))/(n-1)，解出 b(k) = b1·r^(k-1)，
 * b1 = B/((n-1)·(r^n - 1))，保底 C = B/(1-(1-1/n)^n)·…… 本例 n=10 时 C ≈ 153.53
 */
function equalizePlan(capital, n) {
  n = n || ROUND_COUNT;
  var r = n / (n - 1);
  var b1 = capital / ((n - 1) * (Math.pow(r, n) - 1));
  var plan = [];
  var used = 0;
  for (var i = 0; i < n; i++) {
    var b = b1 * Math.pow(r, i);
    if (i === n - 1) b = capital - used; // 清尾差，保证 Σ = capital
    plan.push(b);
    used += b;
  }
  return plan;
}

/** 按计划自动打完一局。plan 为数组（按轮取值）或 function(round, state) */
function autoPlay(state0, plan) {
  var state = state0;
  var guard = 0;
  while (!state.over && guard < ROUND_COUNT * 2) {
    guard++;
    var round = state.round;
    var stake = typeof plan === 'function' ? plan(round, state) : plan[round - 1];
    stake = clamp(stake, 0, state.capital);
    if (!(stake > 0)) throw new Error('计划在第 ' + round + ' 注给出了非正金额');
    state = placeBet(state, stake);
  }
  return state;
}

/**
 * 批量模拟：固定每注金额，连跑 count 局。
 * 规则与单局一致：每注押 min(固定额, 当前资金)，中签即停，资金归零即止。
 * 由于中签位 10 局内必有一次，只要不爆仓就必然以中签收尾——爆仓是唯一亏损方式。
 *
 * @returns {games, wins, busts, avg, min, max, avgRounds, hist}
 *          hist 为固定分桶的结算分布
 */
function simulateBatch(bet, count, rng) {
  var r = typeof rng === 'function' ? rng : Math.random;
  if (!(typeof bet === 'number' && isFinite(bet) && bet > 0)) throw new Error('每注金额必须是正数');
  if (!(count === Math.floor(count) && count > 0)) throw new Error('次数必须是正整数');
  var wins = 0, busts = 0, sum = 0, sumRounds = 0;
  var min = Infinity, max = -Infinity;
  var buckets = [
    { label: '归零', lo: 0, hi: 0 },
    { label: '1~99', lo: 0.01, hi: 99.99 },
    { label: '100~149', lo: 100, hi: 149.99 },
    { label: '150~199', lo: 150, hi: 199.99 },
    { label: '200~399', lo: 200, hi: 399.99 },
    { label: '400~999', lo: 400, hi: 999.99 },
    { label: '1000', lo: 1000, hi: Infinity }
  ];
  var hist = buckets.map(function () { return 0; });
  for (var n = 0; n < count; n++) {
    var capital = START_CAPITAL;
    var winner = 1 + Math.floor(r() * ROUND_COUNT);
    var won = false, rounds = 0;
    for (var round = 1; round <= ROUND_COUNT; round++) {
      var b = Math.min(bet, capital);
      if (!(b > 0)) break; // 资金已尽（理论上被 bust 分支覆盖，防御）
      rounds = round;
      capital = capital - b;
      if (round === winner) {
        capital += b * PAYOUT;
        won = true;
        break;
      }
      if (capital <= 1e-9) { capital = 0; break; }
    }
    if (won) wins++; else busts++;
    sum += capital;
    sumRounds += rounds;
    if (capital < min) min = capital;
    if (capital > max) max = capital;
    for (var k = 0; k < buckets.length; k++) {
      if (capital >= buckets[k].lo && capital <= buckets[k].hi) { hist[k]++; break; }
    }
  }
  return {
    games: count,
    wins: wins,
    busts: busts,
    avg: sum / count,
    min: min,
    max: max,
    avgRounds: sumRounds / count,
    hist: buckets.map(function (b2, i2) { return { label: b2.label, count: hist[i2] }; })
  };
}

/** 各流派基准（本金 100、n=10、赌注 10 倍下的解析值） */
var BENCHMARKS = {
  principal: START_CAPITAL,                 // 不玩：锁定 100
  allInEV: START_CAPITAL,                   // 梭哈派期望：0.1×1000
  uniformFloor: START_CAPITAL,              // 固定注保底：中在第 10 注
  uniformEV: 145,                           // 固定注期望：100 + 4.5×10
  probeFloor: START_CAPITAL + 1,            // 探针流保底（1 元探针）
  probeEV: 185.5,                           // 探针流期望：190 - 4.5×1
  equalize: START_CAPITAL / (1 - Math.pow((ROUND_COUNT - 1) / ROUND_COUNT, ROUND_COUNT)) // ≈153.53
};

var TenBets = {
  ROUND_COUNT: ROUND_COUNT,
  PAYOUT: PAYOUT,
  START_CAPITAL: START_CAPITAL,
  createGame: createGame,
  placeBet: placeBet,
  nextWinProbability: nextWinProbability,
  allInPlan: allInPlan,
  uniformPlan: uniformPlan,
  probePlan: probePlan,
  equalizePlan: equalizePlan,
  autoPlay: autoPlay,
  simulateBatch: simulateBatch,
  BENCHMARKS: BENCHMARKS
};

if (typeof module !== 'undefined' && module.exports) module.exports = TenBets;
if (typeof window !== 'undefined') window.TenBets = TenBets;
