/**
 * musk-wealth-burner.test.js - engine.js 纯逻辑单元测试
 * 运行：node pages/musk-wealth-burner/musk-wealth-burner.test.js
 */
var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg + ' (actual=' + actual + ', expected=' + expected + ', tol=' + tol + ')'); }
}

// ── 格式化 ─────────────────────────────────────────────
assert(engine.formatMoney(1.3e12) === '$1.30万亿', '1.3e12 -> $1.30万亿');
assert(engine.formatMoney(4.4e10) === '$440.00亿', '4.4e10 -> $440.00亿（$440亿=推特收购价）');
assert(engine.formatMoney(5e8) === '$5.00亿', '5e8 -> $5.00亿');
assert(engine.formatMoney(1.2e4) === '$1.20万', '1.2e4 -> $1.20万');
assert(engine.formatMoney(-3e8) === '-$3.00亿', '负数带负号');
assert(engine.formatCount(1.3e12) === '1.30万亿', 'formatCount 1.3e12');
assert(engine.formatDuration(30) === '30 分钟', '30 分钟');
assert(engine.formatDuration(120) === '2.0 小时', '120 分钟 -> 2.0 小时');
assert(engine.formatDuration(60 * 24 * 3) === '3.0 天', '3 天');

// ── 破产概率 ───────────────────────────────────────────
// P = exp(-2·edge·W/bet)，edge=1.2%, W=1.3e12, bet=1.3e6 => exp(-24000) ≈ 0
assert(engine.ruinProbability(1.3e12, 1.3e6) < 1e-300, '台面上限下破产概率≈0');
assertClose(engine.ruinProbability(1e6, 1e6, 0.012), Math.exp(-2 * 0.012 * 1e6 / 1e6), 1e-12, 'W=bet 时的破产概率');
assert(engine.ruinProbability(0, 100) === 1, '财富为0时必然破产');
assert(engine.ruinProbability(1e6, 0) === 0, '下注为0时破产概率0');
assert(engine.ruinProbability(1e6, 1e6) > 0 && engine.ruinProbability(1e6, 1e6) < 1, '概率落在(0,1)');

// ── 期望手数 ───────────────────────────────────────────
// E[T] = W/(bet·edge)
assertClose(engine.expectedHandsToRuin(1.3e12, 1.3e6), 1.3e12 / (1.3e6 * 0.012), 1, '期望手数公式');
assertClose(engine.expectedHandsToRuin(1.3e12, 1.3e6), 8.333e7, 1e4, '约8.3千万手');

// ── 交叉下注额 ─────────────────────────────────────────
// B* = 2·edge·W/(-ln prob)，prob=0.5 => 2·0.012·1.3e12/ln2
assertClose(engine.crossoverBet(1.3e12, 0.5), 2 * 0.012 * 1.3e12 / Math.LN2, 1, '50%破产概率的下注额');
// 该下注额应使破产概率≈0.5
assertClose(engine.ruinProbability(1.3e12, engine.crossoverBet(1.3e12, 0.5)), 0.5, 1e-9, '反解自洽：P(ruin)=0.5');
assert(engine.crossoverBet(1.3e12, 0.5) > 4e10 && engine.crossoverBet(1.3e12, 0.5) < 5e10, '50%阈值约 450 亿美元');

// ── 年度期望亏损 ───────────────────────────────────────
// bet=1.3e6, 1手/分钟 => 1.3e6*0.012*525600
assertClose(engine.annualLoss(1.3e6), 1.3e6 * 0.012 * 525600, 1, '年度期望亏损');
assertClose(engine.lossPerHand(1.3e6), 15600, 1e-6, '每手期望亏损 $15600');

// ── 博弈模拟（确定性 rng）──────────────────────────────
// rng 始终返回 0 => 必赢（0 < 0.4932）
var winHand = engine.playHand(1000, function () { return 0; });
assert(winHand.win === true && winHand.delta === 1000, 'rng=0 时玩家赢 +1000');
var loseHand = engine.playHand(1000, function () { return 0.9; });
assert(loseHand.win === false && loseHand.delta === -1000, 'rng=0.9 时玩家输 -1000');

// 模拟：rng 交替 0(赢)/1(输)，bet=1000，wealth=1000
// 顺序：赢->2000, 输->1000, 赢->2000, 输->1000 ... 永不破产，到 cap 停止
var seq = [0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9];
var i = 0;
var sim = engine.simulateHands(1000, 1000, 8, function () { return seq[i++]; });
assert(sim.handsPlayed === 8, '8 手后因 cap 停止');
assert(sim.busted === false, '交替输赢不会破产');
assert(sim.finalWealth === 1000, '回到初始 1000');
assert(sim.wins === 4, '4 胜 4 负');

// 模拟：必输 rng，wealth=3000, bet=1000 => 3 手后破产
var j = 0;
var sim2 = engine.simulateHands(3000, 1000, 100, function () { return 0.9; });
assert(sim2.busted === true, '必输 rng 下破产');
assert(sim2.handsPlayed === 3, '3 手破产');
assert(sim2.finalWealth === 0, '最终归零');

// ── 烧钱 ───────────────────────────────────────────────
assert(engine.spend(1.3e12, 4.4e10) === 1.3e12 - 4.4e10, '花钱扣减');
assert(engine.spend(100, 200) === 0, '不够花则归零');
assert(engine.spend(0, 100) === 0, '已归零不再扣');

var item = engine.CATALOG[0];
assert(item.id === 'yacht' && item.price === 5e8, '目录首项为游艇 $5亿');
assert(engine.totalPrice(item, 3) === 1.5e9, '3 艘游艇 $15亿');
assert(engine.QUICK_BURNS.length === 4, '4 个一键烧钱项');

// ── 烧钱速率 / 倒计时 ─────────────────────────────────
assert(engine.timeToBrokeSeconds(1e6, 1e6, 1) === 1, '速率 1e6/s 时 1e6 财富剩 1 秒');
assert(engine.timeToBrokeSeconds(1e6, 0, 10) === Infinity, '未花费则倒计时无穷');
assert(engine.asTeslaHours(1.6e11) === 1, '1.6e11 = 1 特斯拉小时');
assert(engine.asTeslaHours(0) === 0, '0 特斯拉小时');

// ── 汇总 ───────────────────────────────────────────────
console.log('\n——————————');
console.log('通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) {
  process.exit(1);
}
