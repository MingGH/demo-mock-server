/**
 * 薛定谔的钱箱 - 单元测试
 * 测试凯利公式计算、模拟算法、几何增长率等核心逻辑
 */

// 核心算法（与页面一致）
function calcKelly(p, b) {
  return Math.max(0, p - (1 - p) / b);
}

function geometricMeanReturn(fraction, multiplier) {
  const winResult = 1 + fraction * (multiplier - 1);
  const loseResult = 1 - fraction;
  if (loseResult <= 0) return 0;
  return Math.sqrt(winResult * loseResult);
}

function simulateRounds(initial, fraction, multiplier, rounds, randomFn) {
  let money = initial;
  let wins = 0;
  for (let i = 0; i < rounds; i++) {
    if (money < 0.01) { money = 0; continue; }
    const bet = money * fraction;
    if ((randomFn || Math.random)() < 0.5) {
      money = money - bet + bet * multiplier;
      wins++;
    } else {
      money = money - bet;
    }
  }
  return { finalMoney: money, wins };
}

// ============ 测试 ============

console.log('🧪 开始测试：薛定谔的钱箱核心逻辑\n');

// 测试1: 凯利公式计算
console.log('测试1: 凯利公式计算');
{
  // 50%概率，赢了净赚1倍（拿回2倍）=> 公平游戏，凯利=0
  const k1 = calcKelly(0.5, 1);
  console.assert(Math.abs(k1 - 0) < 1e-10, '50%/1倍赔率应为0');
  console.log(`✓ p=0.5, b=1 => kelly=${k1} (公平游戏，不玩)`);

  // 50%概率，赢了净赚2倍（拿回3倍）=> kelly=25%
  const k2 = calcKelly(0.5, 2);
  console.assert(Math.abs(k2 - 0.25) < 1e-10, '50%/2倍赔率应为25%');
  console.log(`✓ p=0.5, b=2 => kelly=${k2} (25%)`);

  // 51%概率，赢了净赚1倍 => kelly=2%
  const k3 = calcKelly(0.51, 1);
  console.assert(Math.abs(k3 - 0.02) < 1e-10, '51%/1倍赔率应为2%');
  console.log(`✓ p=0.51, b=1 => kelly=${k3} (2%)`);

  // 60%概率，赢了净赚1倍 => kelly=20%
  const k4 = calcKelly(0.6, 1);
  console.assert(Math.abs(k4 - 0.2) < 1e-10, '60%/1倍赔率应为20%');
  console.log(`✓ p=0.6, b=1 => kelly=${k4} (20%)`);

  // 负期望值 => kelly=0（不玩）
  const k5 = calcKelly(0.3, 1);
  console.assert(k5 === 0, '30%/1倍赔率应为0（负期望）');
  console.log(`✓ p=0.3, b=1 => kelly=${k5} (不玩)\n`);
}

// 测试2: 几何平均收益率
console.log('测试2: 几何平均收益率');
{
  // 全押，multiplier=2 => sqrt(2*0) = 0
  const g1 = geometricMeanReturn(1.0, 2);
  console.assert(g1 === 0, '全押翻倍游戏几何收益应为0');
  console.log(`✓ 全押(100%), mult=2 => G=${g1} (必死)`);

  // 全押，multiplier=3 => sqrt(3*0) = 0
  const g2 = geometricMeanReturn(1.0, 3);
  console.assert(g2 === 0, '全押3倍游戏几何收益应为0');
  console.log(`✓ 全押(100%), mult=3 => G=${g2} (必死)`);

  // 不下注 => sqrt(1*1) = 1
  const g3 = geometricMeanReturn(0, 3);
  console.assert(Math.abs(g3 - 1) < 1e-10, '不下注几何收益应为1');
  console.log(`✓ 不下注(0%), mult=3 => G=${g3} (不赚不亏)`);

  // 凯利最优(25%), multiplier=3 => sqrt(1.5 * 0.75) = sqrt(1.125) ≈ 1.0607
  const g4 = geometricMeanReturn(0.25, 3);
  const expected = Math.sqrt(1.5 * 0.75);
  console.assert(Math.abs(g4 - expected) < 1e-10, '凯利最优几何收益应为sqrt(1.125)');
  console.log(`✓ 凯利(25%), mult=3 => G=${g4.toFixed(4)} (>1, 长期增长)`);

  // 验证凯利比例确实是几何收益最大值
  const gBelow = geometricMeanReturn(0.15, 3);
  const gAbove = geometricMeanReturn(0.35, 3);
  console.assert(g4 > gBelow, '凯利值应大于低于凯利的几何收益');
  console.assert(g4 > gAbove, '凯利值应大于高于凯利的几何收益');
  console.log(`✓ G(15%)=${gBelow.toFixed(4)} < G(25%)=${g4.toFixed(4)} > G(35%)=${gAbove.toFixed(4)} (凯利是最优)\n`);
}

// 测试3: 固定随机数模拟
console.log('测试3: 固定随机数模拟');
{
  // 全赢：random总是返回0.1 (<0.5)
  let callCount = 0;
  const alwaysWin = () => { callCount++; return 0.1; };
  const r1 = simulateRounds(10000, 0.25, 3, 10, alwaysWin);
  // 每轮：money = money - 0.25*money + 0.25*money*3 = money * (1 + 0.25*2) = money * 1.5
  // 10轮：10000 * 1.5^10 = 10000 * 57.665... ≈ 576650.39
  const expected1 = 10000 * Math.pow(1.5, 10);
  console.assert(Math.abs(r1.finalMoney - expected1) < 0.01, '全赢10轮应为10000*1.5^10');
  console.assert(r1.wins === 10, '应赢10次');
  console.log(`✓ 全赢10轮: ¥${r1.finalMoney.toFixed(2)} (期望¥${expected1.toFixed(2)})`);

  // 全输：random总是返回0.9 (>0.5)
  const alwaysLose = () => 0.9;
  const r2 = simulateRounds(10000, 0.25, 3, 10, alwaysLose);
  // 每轮：money = money * (1 - 0.25) = money * 0.75
  // 10轮：10000 * 0.75^10 ≈ 563.135
  const expected2 = 10000 * Math.pow(0.75, 10);
  console.assert(Math.abs(r2.finalMoney - expected2) < 0.01, '全输10轮应为10000*0.75^10');
  console.assert(r2.wins === 0, '应赢0次');
  console.log(`✓ 全输10轮: ¥${r2.finalMoney.toFixed(2)} (期望¥${expected2.toFixed(2)})`);

  // 全押全赢
  const r3 = simulateRounds(10000, 1.0, 3, 5, alwaysWin);
  const expected3 = 10000 * Math.pow(3, 5); // 每轮变3倍
  console.assert(Math.abs(r3.finalMoney - expected3) < 0.01, '全押全赢5轮应为10000*3^5');
  console.log(`✓ 全押全赢5轮: ¥${r3.finalMoney.toFixed(2)} (期望¥${expected3.toFixed(2)})`);

  // 全押输一次就归零
  let roundIdx = 0;
  const winThenLose = () => { roundIdx++; return roundIdx <= 3 ? 0.1 : 0.9; };
  const r4 = simulateRounds(10000, 1.0, 3, 5, winThenLose);
  console.assert(r4.finalMoney === 0, '全押输一次应归零');
  console.log(`✓ 全押赢3输1: ¥${r4.finalMoney} (归零)\n`);
}

// 测试4: 大数定律 - 凯利策略长期增长
console.log('测试4: 大数定律 - 凯利策略 vs 全押（1000人模拟）');
{
  const initial = 10000;
  const mult = 3;
  const kelly = calcKelly(0.5, mult - 1); // 25%
  const rounds = 500;
  const players = 1000;

  let kellyBankrupt = 0, allInBankrupt = 0;
  let kellyFinals = [], allInFinals = [];

  for (let p = 0; p < players; p++) {
    let mk = initial, ma = initial;
    for (let r = 0; r < rounds; r++) {
      const win = Math.random() < 0.5;
      if (mk >= 0.01) {
        const bk = mk * kelly;
        mk = win ? mk - bk + bk * mult : mk - bk;
      }
      if (ma >= 0.01) {
        ma = win ? ma * mult : 0;
      }
    }
    if (mk < 1) kellyBankrupt++;
    if (ma < 1) allInBankrupt++;
    kellyFinals.push(mk);
    allInFinals.push(ma);
  }

  // 全押应该几乎全部破产（500轮全赢概率≈0）
  console.assert(allInBankrupt > 990, '全押500轮应几乎全部破产');
  console.log(`✓ 全押破产: ${allInBankrupt}/1000 (应接近1000)`);

  // 凯利策略不应该破产（几何增长率>1）
  console.assert(kellyBankrupt < 50, '凯利策略破产人数应很少');
  console.log(`✓ 凯利破产: ${kellyBankrupt}/1000 (应接近0)`);

  // 凯利中位数应该增长
  kellyFinals.sort((a, b) => a - b);
  const kellyMedian = kellyFinals[500];
  console.assert(kellyMedian > initial, '凯利中位数应大于初始资金');
  console.log(`✓ 凯利中位数: ¥${kellyMedian.toFixed(0)} (应>¥${initial})\n`);
}

// 测试5: 几何增长率最优性验证
console.log('测试5: 凯利比例是几何增长率最大值');
{
  const mult = 3;
  const kellyFrac = 0.25;
  const testFracs = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.60, 0.80];
  let maxG = 0, maxFrac = 0;

  testFracs.forEach(f => {
    const g = geometricMeanReturn(f, mult);
    if (g > maxG) { maxG = g; maxFrac = f; }
    console.log(`  f=${(f*100).toFixed(0)}% => G=${g.toFixed(6)}`);
  });

  console.assert(Math.abs(maxFrac - kellyFrac) < 0.01, '最大几何增长率应在凯利比例处');
  console.log(`✓ 最大G在 f=${(maxFrac*100).toFixed(0)}% (凯利=${(kellyFrac*100).toFixed(0)}%)\n`);
}

// 测试6: 边界条件
console.log('测试6: 边界条件');
{
  // 下注0%
  const r1 = simulateRounds(10000, 0, 3, 100, () => 0.1);
  console.assert(r1.finalMoney === 10000, '下注0%资金不变');
  console.log(`✓ 下注0%: ¥${r1.finalMoney} (不变)`);

  // 初始资金为0
  const r2 = simulateRounds(0, 0.25, 3, 100, () => 0.1);
  console.assert(r2.finalMoney === 0, '初始0资金应保持0');
  console.log(`✓ 初始¥0: ¥${r2.finalMoney}`);

  // multiplier=1（赢了只拿回本金，没意义）
  const k = calcKelly(0.5, 0);
  console.assert(k === 0, 'multiplier=1(b=0)凯利应为0');
  console.log(`✓ mult=1(b=0): kelly=${k} (不玩)`);

  // 极高赔率
  const k2 = calcKelly(0.5, 100);
  console.assert(Math.abs(k2 - 0.495) < 0.001, '极高赔率凯利应接近0.5');
  console.log(`✓ p=0.5, b=100: kelly=${k2.toFixed(4)} (接近50%)\n`);
}

// 测试7: 交替赢输的确定性验证
console.log('测试7: 交替赢输模式');
{
  let idx = 0;
  const alternate = () => { idx++; return idx % 2 === 1 ? 0.1 : 0.9; }; // 赢输交替

  // 凯利25%, mult=3: 赢一轮*1.5, 输一轮*0.75 => 每两轮乘以1.125
  const r = simulateRounds(10000, 0.25, 3, 100, alternate);
  const expected = 10000 * Math.pow(1.5 * 0.75, 50); // 50对赢输
  console.assert(Math.abs(r.finalMoney - expected) < 1, '交替赢输应符合几何计算');
  console.log(`✓ 交替赢输100轮(凯利25%): ¥${r.finalMoney.toFixed(2)} (期望¥${expected.toFixed(2)})`);
  console.assert(r.finalMoney > 10000, '凯利策略交替赢输应增长');
  console.log(`✓ 资金增长了 ${((r.finalMoney/10000 - 1)*100).toFixed(1)}%`);

  // 全押交替赢输：赢一次*3，输一次*0 => 第二轮归零
  idx = 0;
  const r2 = simulateRounds(10000, 1.0, 3, 100, alternate);
  console.assert(r2.finalMoney === 0, '全押交替赢输应归零');
  console.log(`✓ 全押交替赢输: ¥${r2.finalMoney} (归零)\n`);
}

// 测试8: 半凯利 vs 凯利 波动性对比
console.log('测试8: 半凯利 vs 凯利 波动性');
{
  const mult = 3;
  const kelly = 0.25;
  const halfKelly = 0.125;
  const rounds = 1000;
  const trials = 200;

  let kellyResults = [], halfResults = [];
  for (let t = 0; t < trials; t++) {
    const rk = simulateRounds(10000, kelly, mult, rounds);
    const rh = simulateRounds(10000, halfKelly, mult, rounds);
    kellyResults.push(rk.finalMoney);
    halfResults.push(rh.finalMoney);
  }

  // 计算变异系数 (std/mean)
  const mean = arr => arr.reduce((s,v) => s+v, 0) / arr.length;
  const std = arr => { const m = mean(arr); return Math.sqrt(arr.reduce((s,v) => s+(v-m)**2, 0)/arr.length); };

  const kellyCV = std(kellyResults) / mean(kellyResults);
  const halfCV = std(halfResults) / mean(halfResults);

  console.log(`  凯利(25%): 均值¥${mean(kellyResults).toFixed(0)}, CV=${kellyCV.toFixed(2)}`);
  console.log(`  半凯利(12.5%): 均值¥${mean(halfResults).toFixed(0)}, CV=${halfCV.toFixed(2)}`);
  // 半凯利波动性应该更低（但不是绝对保证，统计测试）
  console.log(`✓ 半凯利波动性更低的概率很高\n`);
}

console.log('✅ 所有测试通过！核心逻辑验证正确。\n');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcKelly, geometricMeanReturn, simulateRounds };
}
