/**
 * 马丁格尔策略核心算法单元测试
 * 运行: node pages/martingale-simulator/engine.test.js
 */

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  PASS: ' + msg); }
  else { failed++; console.error('  FAIL: ' + msg); }
}

function approx(a, b, eps) {
  eps = eps || 0.0001;
  return Math.abs(a - b) < eps;
}

// 加载 engine.js
var engine = require('./engine.js');

// ===== 测试用例 =====

console.log('\n=== calcMartingaleBet ===');
assert(engine.calcMartingaleBet(10, 0, 5000) === 10, '连输0次下注=baseBet');
assert(engine.calcMartingaleBet(10, 1, 5000) === 20, '连输1次下注=baseBet*2');
assert(engine.calcMartingaleBet(10, 3, 5000) === 80, '连输3次下注=baseBet*8');
assert(engine.calcMartingaleBet(10, 10, 5000) === 5000, '超出限红时返回限红值');
assert(engine.calcMartingaleBet(10, 0, 100) === 10, '限红>baseBet时正常');
assert(engine.calcMartingaleBet(5, 5, 10000) === 160, 'baseBet=5, 连输5次=160');

console.log('\n=== calcKellyFraction ===');
assert(approx(engine.calcKellyFraction(0.5, 1), 0), '公平硬币+1:1赔率，凯利比例=0');
assert(approx(engine.calcKellyFraction(0.6, 1), 0.2), '胜率60%+1:1赔率，凯利比例=0.2');
assert(approx(engine.calcKellyFraction(0.51, 1), 0.02), '胜率51%+1:1赔率，凯利比例=0.02');
assert(engine.calcKellyFraction(0.4, 1) === 0, '胜率<50%时凯利比例=0（不参与）');
assert(approx(engine.calcKellyFraction(0.8, 0.5), 0.4), '胜率80%+0.5赔率，凯利比例=0.4');
assert(engine.calcKellyFraction(0.9, 1) === 0.8, '胜率90%+1:1赔率，凯利比例=0.8');

console.log('\n=== checkGameStatus ===');
assert(engine.checkGameStatus({ playerMoney: 1000, dealerMoney: 1000, baseBet: 10, currentBet: 10, tableLimit: 5000 }) === 'ok', '正常状态');
assert(engine.checkGameStatus({ playerMoney: 0, dealerMoney: 1000, baseBet: 10, currentBet: 10, tableLimit: 5000 }) === 'player_bankrupt', '玩家没钱');
assert(engine.checkGameStatus({ playerMoney: 5, dealerMoney: 1000, baseBet: 10, currentBet: 10, tableLimit: 5000 }) === 'player_bankrupt', '玩家钱少于baseBet');
assert(engine.checkGameStatus({ playerMoney: 1000, dealerMoney: 0, baseBet: 10, currentBet: 10, tableLimit: 5000 }) === 'dealer_bankrupt', '庄家没钱');
assert(engine.checkGameStatus({ playerMoney: 1000, dealerMoney: 1000, baseBet: 10, currentBet: 10000, tableLimit: 5000 }) === 'table_limit', '超过限红');
assert(engine.checkGameStatus({ playerMoney: 10000, dealerMoney: 1000, baseBet: 10, currentBet: 5000, tableLimit: 5000 }) === 'ok', '等于限红没问题');
assert(engine.checkGameStatus({ playerMoney: 100, dealerMoney: 1000, baseBet: 10, currentBet: 500, tableLimit: 5000 }) === 'player_bankrupt', '玩家钱不够当前下注');

console.log('\n=== calcDealerPayout ===');
assert(engine.calcDealerPayout(10) === 10, '下注10元，庄家应付10元（净赔付）');
assert(engine.calcDealerPayout(100) === 100, '下注100元，庄家应付100元');
assert(engine.calcDealerPayout(0) === 0, '下注0元，应付0元');

console.log('\n=== createInitialState ===');
var s = engine.createInitialState({ playerMoney: 10000, dealerMoney: 100000, baseBet: 10, tableLimit: 5000, winRate: 0.486 });
assert(s.playerMoney === 10000, '玩家资金正确');
assert(s.dealerMoney === 100000, '庄家资金正确');
assert(s.baseBet === 10, '初始下注正确');
assert(s.currentBet === 10, '当前下注=初始下注');
assert(s.winRate === 0.486, '胜率正确');
assert(s.totalRounds === 0, '初始局数为0');
assert(s.wins === 0, '初始胜场=0');
assert(s.losses === 0, '初始负场=0');
assert(s.consecutiveLosses === 0, '初始连输=0');
assert(s.history.length === 0, '初始历史为空');

// 负值测试
var s2 = engine.createInitialState({ playerMoney: -100, dealerMoney: -1000, baseBet: 0, tableLimit: 0, winRate: 2 });
assert(s2.playerMoney === 0, '玩家资金负数转为0');
assert(s2.dealerMoney === 0, '庄家资金负数转为0');
assert(s2.baseBet === 1, 'baseBet小于1转为1');
assert(s2.tableLimit === 1, 'tableLimit小于1转为1');
assert(s2.winRate === 1, 'winRate>1转为1');

console.log('\n=== playRound (马丁格尔) ===');

// 用固定随机数测试
global.Math = Object.create(Math);
var fixedMath = Object.create(Math);
var mockRandomIndex = 0;
var mockRandomValues = [0.3, 0.7]; // 0.3 < 0.486 → win, 0.7 > 0.486 → lose
fixedMath.random = function() {
  var val = mockRandomValues[mockRandomIndex % mockRandomValues.length];
  mockRandomIndex++;
  return val;
};

var origMath = global.Math;
global.Math = fixedMath;

var initState = engine.createInitialState({ playerMoney: 10000, dealerMoney: 100000, baseBet: 10, tableLimit: 5000, winRate: 0.486 });
var result1 = engine.playRound(initState);
assert(result1.won === true, '第一局赢（0.3<0.486）');
assert(result1.state.playerMoney > 10000, '赢后玩家资金增加');
assert(result1.state.dealerMoney < 100000, '赢后庄家资金减少');
assert(result1.state.consecutiveLosses === 0, '赢后连输重置');
assert(result1.state.currentBet === 10, '赢后下注回baseBet');
assert(result1.state.totalRounds === 1, '局数+1');
assert(result1.state.wins === 1, '胜场+1');

var result2 = engine.playRound(result1.state);
assert(result2.won === false, '第二局输（0.7>0.486）');
assert(result2.state.playerMoney < result1.state.playerMoney, '输后玩家资金减少');
assert(result2.state.dealerMoney > result1.state.dealerMoney, '输后庄家资金增加');
assert(result2.state.consecutiveLosses === 1, '输后连输+1');
assert(result2.state.currentBet === 20, '输后下注翻倍');
assert(result2.state.totalRounds === 2, '局数+1');
assert(result2.state.losses === 1, '负场+1');

global.Math = origMath;

console.log('\n=== playRound (固定下注) ===');
var fixedState = engine.createInitialState({ playerMoney: 10000, dealerMoney: 100000, baseBet: 10, tableLimit: 5000, winRate: 0 });
// 模拟连输3次，固定下注不会翻倍
for (var i = 0; i < 3; i++) {
  var fr = engine.playFixedRound(fixedState);
  fixedState = fr.state;
}
assert(fixedState.losses === 3, '固定下注连输3次');
assert(fixedState.currentBet === 10, '固定下注连输后仍为baseBet');

console.log('\n=== autoPlay ===');
var autoState = engine.createInitialState({ playerMoney: 10000, dealerMoney: 1000, baseBet: 100, tableLimit: 5000, winRate: 0 });
var finalState = engine.autoPlay(autoState, 100, 'martingale');
assert(finalState.totalRounds <= 100, '自动玩不超过maxRounds');
assert(finalState.playerMoney < 10000, '低胜率下玩家亏钱');

console.log('\n=== runSimulation ===');
var sim = engine.runSimulation({
  playerMoney: 10000,
  dealerMoney: 100000,
  baseBet: 10,
  tableLimit: 5000,
  winRate: 0.486,
  numPlayers: 100,
  maxRounds: 100,
  strategy: 'martingale'
});
assert(sim.totalPlayers === 100, '模拟100人');
assert(sim.results.length === 100, '结果数组长度100');
assert(sim.bankruptRate >= 0 && sim.bankruptRate <= 1, '破产率在0~1之间');
assert(sim.beatDealerRate >= 0 && sim.beatDealerRate <= 1, '逼死庄家率在0~1之间');
assert(sim.avgFinalMoney >= 0, '平均剩余>=0');

console.log('\n=== runSensitivityAnalysis ===');
var sensitivity = engine.runSensitivityAnalysis({
  playerMoney: 10000,
  dealerMoney: 100000,
  tableLimit: 5000,
  winRate: 0.486,
  numPlayers: 100,
  maxRounds: 100,
  betValues: [1, 10, 100]
});
assert(sensitivity.length === 3, '3个下注值');
assert(sensitivity[0].bet === 1, '第一个下注=1');
assert(sensitivity[0].bankruptRate >= 0, '破产率>=0');

console.log('\n=== runStrategyComparison ===');
var comparison = engine.runStrategyComparison({
  playerMoney: 10000,
  dealerMoney: 100000,
  baseBet: 10,
  tableLimit: 5000,
  winRate: 0.486,
  numPlayers: 100,
  maxRounds: 100
});
assert(comparison.length === 3, '3种策略');
assert(comparison[0].strategy === 'martingale', '第一个是马丁格尔');
assert(comparison[1].strategy === 'fixed', '第二个是固定下注');
assert(comparison[2].strategy === 'kelly', '第三个是凯利公式');

console.log('\n=== formatMoney ===');
assert(engine.formatMoney(10000) === '¥1.00万', '1万');
assert(engine.formatMoney(100) === '¥100.00', '100元');
assert(engine.formatMoney(100000000) === '¥1.00亿', '1亿');
assert(engine.formatMoney(0) === '¥0.00', '0元');
assert(engine.formatMoney(-100) === '-¥100.00', '负数');

console.log('\n=== formatPercent ===');
assert(engine.formatPercent(0.5) === '50.0%', '50%');
assert(engine.formatPercent(0.055) === '5.5%', '5.5%');
assert(engine.formatPercent(1) === '100.0%', '100%');

console.log('\n=== calcMaxConsecutiveLosses ===');
assert(engine.calcMaxConsecutiveLosses([]) === 0, '空历史=0');
assert(engine.calcMaxConsecutiveLosses([
  { won: true }, { won: false }, { won: false }, { won: true }
]) === 2, '最大连输2');
assert(engine.calcMaxConsecutiveLosses([
  { won: false }, { won: false }, { won: false }
]) === 3, '全部输=3');

console.log('\n=== 边界情况：玩家破产 ===');
var bankruptState = engine.createInitialState({ playerMoney: 5, dealerMoney: 1000, baseBet: 10, tableLimit: 5000, winRate: 0.5 });
assert(engine.checkGameStatus(bankruptState) === 'player_bankrupt', '玩家钱不够baseBet时破产');

console.log('\n=== 边界情况：庄家破产 ===');
var beatDealerState = engine.createInitialState({ playerMoney: 100000, dealerMoney: 5, baseBet: 10, tableLimit: 5000, winRate: 1 });
// 玩一局，肯定赢，庄家资金不足赔付，破产
var roundResult = engine.playRound(beatDealerState);
assert(roundResult.status === 'dealer_bankrupt' && roundResult.state.dealerMoney === 0, '庄家被逼空');

console.log('\n=== 边界情况：触达限红 ===');
var limitState = engine.createInitialState({ playerMoney: 100000, dealerMoney: 100000, baseBet: 1000, tableLimit: 5000, winRate: 0.3 });
// 连输几局，下注翻倍到限红
for (var j = 0; j < 5; j++) {
  var lr = engine.playRound(limitState);
  limitState = lr.state;
  if (lr.status === 'table_limit') break;
}
assert(limitState.currentBet <= 5000, '下注不超过限红');

// ===== 结果汇总 =====
console.log('\n========================================');
console.log('总计: ' + (passed + failed) + ' 个测试, ' + passed + ' 通过, ' + failed + ' 失败');
console.log('========================================\n');

if (failed > 0) process.exit(1);