/**
 * 博弈论日常生活指南 - 单元测试
 * 测试纳什谈判解、最后通牒接受概率、懦夫博弈混合策略、重复博弈策略逻辑
 */

// ===== 核心算法（与页面一致）=====

function nashBargainPrice(sellerMin, buyerMax) {
  if (buyerMax < sellerMin) return null;
  return (sellerMin + buyerMax) / 2;
}

function ultimatumAcceptProb(offer) {
  if (offer <= 0) return 0;
  if (offer >= 50) return 0.98;
  if (offer >= 40) return 0.90 + (offer - 40) * 0.008;
  if (offer >= 30) return 0.70 + (offer - 30) * 0.02;
  if (offer >= 20) return 0.40 + (offer - 20) * 0.03;
  if (offer >= 10) return 0.15 + (offer - 10) * 0.025;
  return offer * 0.015;
}

function ultimatumExpectedGain(offer) {
  var keep = 100 - offer;
  return keep * ultimatumAcceptProb(offer);
}

function chickenMixedNE(crash, win, lose) {
  return (Math.abs(crash) - win) / (Math.abs(crash) - win + Math.abs(lose));
}

var repeatPayoffs = { 'C-C': [3,3], 'C-D': [0,5], 'D-C': [5,0], 'D-D': [1,1] };

function getChoice(strategy, myHist, oppHist) {
  var n = myHist.length;
  if (strategy === 'always-c') return 'C';
  if (strategy === 'always-d') return 'D';
  if (strategy === 'random') return Math.random() < 0.5 ? 'C' : 'D';
  if (strategy === 'tft') return n === 0 ? 'C' : oppHist[n-1];
  if (strategy === 'grudger') return oppHist.indexOf('D') >= 0 ? 'D' : 'C';
  return 'C';
}

function runMatch(sA, sB, rounds) {
  var aH = [], bH = [], aTotal = 0, bTotal = 0;
  for (var i = 0; i < rounds; i++) {
    var ac = getChoice(sA, aH, bH);
    var bc = getChoice(sB, bH, aH);
    var pay = repeatPayoffs[ac + '-' + bc];
    aTotal += pay[0]; bTotal += pay[1];
    aH.push(ac); bH.push(bc);
  }
  return { aTotal: aTotal, bTotal: bTotal, aHist: aH, bHist: bH };
}

// ===== 测试 =====

console.log('🧪 开始测试：博弈论日常生活指南核心逻辑\n');

// 测试1: 纳什谈判解
console.log('测试1: 纳什谈判解');
{
  var r1 = nashBargainPrice(400, 800);
  console.assert(r1 === 600, '(400,800)应为600，实际=' + r1);
  console.log('  ✓ 卖家底价400, 买家最高800 → 纳什解 = ' + r1);

  var r2 = nashBargainPrice(300, 900);
  console.assert(r2 === 600, '(300,900)应为600');
  console.log('  ✓ 卖家底价300, 买家最高900 → 纳什解 = ' + r2);

  var r3 = nashBargainPrice(500, 500);
  console.assert(r3 === 500, '(500,500)应为500');
  console.log('  ✓ 底价相同500 → 纳什解 = ' + r3);

  var r4 = nashBargainPrice(800, 400);
  console.assert(r4 === null, '买家低于卖家应返回null');
  console.log('  ✓ 买家最高价 < 卖家底价 → 无解 (null)');

  var r5 = nashBargainPrice(0, 1000);
  console.assert(r5 === 500, '(0,1000)应为500');
  console.log('  ✓ 卖家底价0, 买家最高1000 → 纳什解 = ' + r5 + '\n');
}

// 测试2: 最后通牒接受概率
console.log('测试2: 最后通牒接受概率');
{
  var p0 = ultimatumAcceptProb(0);
  console.assert(p0 === 0, '给0元接受率应为0');
  console.log('  ✓ 给0元: 接受率 = ' + (p0*100).toFixed(1) + '%');

  var p5 = ultimatumAcceptProb(5);
  console.assert(p5 > 0 && p5 < 0.15, '给5元接受率应很低');
  console.log('  ✓ 给5元: 接受率 = ' + (p5*100).toFixed(1) + '%');

  var p20 = ultimatumAcceptProb(20);
  console.assert(p20 >= 0.35 && p20 <= 0.45, '给20元接受率应约40%');
  console.log('  ✓ 给20元: 接受率 = ' + (p20*100).toFixed(1) + '%');

  var p30 = ultimatumAcceptProb(30);
  console.assert(p30 >= 0.65 && p30 <= 0.75, '给30元接受率应约70%');
  console.log('  ✓ 给30元: 接受率 = ' + (p30*100).toFixed(1) + '%');

  var p50 = ultimatumAcceptProb(50);
  console.assert(p50 === 0.98, '给50元接受率应为98%');
  console.log('  ✓ 给50元: 接受率 = ' + (p50*100).toFixed(1) + '%');

  // 单调递增验证
  var prev = 0;
  var monotone = true;
  for (var i = 0; i <= 50; i++) {
    var cur = ultimatumAcceptProb(i);
    if (cur < prev) { monotone = false; break; }
    prev = cur;
  }
  console.assert(monotone, '接受概率应单调递增');
  console.log('  ✓ 接受概率单调递增验证通过\n');
}

// 测试3: 最后通牒期望收益
console.log('测试3: 最后通牒期望收益');
{
  var eg0 = ultimatumExpectedGain(0);
  console.assert(eg0 === 0, '给0元期望收益应为0');
  console.log('  ✓ 给0元: 期望收益 = ' + eg0.toFixed(1));

  var eg50 = ultimatumExpectedGain(50);
  console.assert(Math.abs(eg50 - 50 * 0.98) < 0.01, '给50元期望收益应为49');
  console.log('  ✓ 给50元: 期望收益 = ' + eg50.toFixed(1));

  // 找最优提议
  var bestOffer = 0, bestEG = 0;
  for (var i = 0; i <= 50; i++) {
    var eg = ultimatumExpectedGain(i);
    if (eg > bestEG) { bestEG = eg; bestOffer = i; }
  }
  console.assert(bestOffer >= 25 && bestOffer <= 45, '最优提议应在25-45之间');
  console.log('  ✓ 最优提议 = ' + bestOffer + ' 元, 期望收益 = ' + bestEG.toFixed(1) + ' 元\n');
}

// 测试4: 懦夫博弈混合策略
console.log('测试4: 懦夫博弈混合策略纳什均衡');
{
  var p = chickenMixedNE(-100, 10, -10);
  // p = (100-10)/(100-10+10) = 90/100 = 0.9
  console.assert(Math.abs(p - 0.9) < 0.01, '让步概率应为90%，实际=' + p);
  console.log('  ✓ crash=-100, win=10, lose=-10 → 让步概率 = ' + (p*100).toFixed(0) + '%');

  var p2 = chickenMixedNE(-50, 5, -5);
  // (50-5)/(50-5+5) = 45/50 = 0.9
  console.assert(Math.abs(p2 - 0.9) < 0.01, '等比例缩放应相同');
  console.log('  ✓ crash=-50, win=5, lose=-5 → 让步概率 = ' + (p2*100).toFixed(0) + '%');

  var p3 = chickenMixedNE(-10, 10, -10);
  // (10-10)/(10-10+10) = 0/10 = 0
  console.assert(Math.abs(p3 - 0) < 0.01, '碰撞代价等于赢的收益时不让步');
  console.log('  ✓ crash=-10, win=10, lose=-10 → 让步概率 = ' + (p3*100).toFixed(0) + '%\n');
}

// 测试5: 重复博弈策略逻辑
console.log('测试5: 重复博弈策略逻辑');
{
  // 永远合作
  console.assert(getChoice('always-c', [], []) === 'C', '永远合作首轮应C');
  console.assert(getChoice('always-c', ['C'], ['D']) === 'C', '永远合作被背叛后仍C');
  console.log('  ✓ 永远合作: 始终返回C');

  // 永远背叛
  console.assert(getChoice('always-d', [], []) === 'D', '永远背叛首轮应D');
  console.assert(getChoice('always-d', ['D'], ['C']) === 'D', '永远背叛始终D');
  console.log('  ✓ 永远背叛: 始终返回D');

  // 以牙还牙
  console.assert(getChoice('tft', [], []) === 'C', 'TFT首轮应C');
  console.assert(getChoice('tft', ['C'], ['C']) === 'C', 'TFT对方合作后应C');
  console.assert(getChoice('tft', ['C'], ['D']) === 'D', 'TFT对方背叛后应D');
  console.assert(getChoice('tft', ['C','D'], ['D','C']) === 'C', 'TFT对方改过后应C');
  console.log('  ✓ 以牙还牙: 首轮C，之后模仿对方上轮');

  // 记仇者
  console.assert(getChoice('grudger', [], []) === 'C', '记仇者首轮应C');
  console.assert(getChoice('grudger', ['C','C'], ['C','C']) === 'C', '记仇者未被背叛应C');
  console.assert(getChoice('grudger', ['C','C'], ['C','D']) === 'D', '记仇者被背叛后永远D');
  console.assert(getChoice('grudger', ['C','C','D'], ['C','D','C']) === 'D', '记仇者不原谅');
  console.log('  ✓ 记仇者: 被背叛一次后永远D\n');
}

// 测试6: 重复博弈对局结果验证
console.log('测试6: 重复博弈对局结果');
{
  // TFT vs TFT → 全部合作
  var r1 = runMatch('tft', 'tft', 50);
  console.assert(r1.aTotal === 150, 'TFT vs TFT 应全合作得150');
  console.assert(r1.bTotal === 150, 'TFT vs TFT 对方也150');
  console.assert(r1.aHist.every(function(c){return c==='C';}), 'TFT vs TFT 全部C');
  console.log('  ✓ TFT vs TFT: 50轮全合作, 各得' + r1.aTotal);

  // always-c vs always-d → 合作者被剥削
  var r2 = runMatch('always-c', 'always-d', 50);
  console.assert(r2.aTotal === 0, '永远合作 vs 永远背叛: 合作者得0');
  console.assert(r2.bTotal === 250, '永远合作 vs 永远背叛: 背叛者得250');
  console.log('  ✓ 永远合作 vs 永远背叛: 合作者=' + r2.aTotal + ', 背叛者=' + r2.bTotal);

  // always-d vs always-d → 双方都低分
  var r3 = runMatch('always-d', 'always-d', 50);
  console.assert(r3.aTotal === 50, '双方永远背叛各得50');
  console.assert(r3.bTotal === 50, '双方永远背叛各得50');
  console.log('  ✓ 永远背叛 vs 永远背叛: 各得' + r3.aTotal);

  // TFT vs always-d → TFT首轮被坑，之后互相背叛
  var r4 = runMatch('tft', 'always-d', 50);
  // 第1轮: C-D → 0,5; 第2-50轮: D-D → 1,1 × 49 = 49,49
  console.assert(r4.aTotal === 49, 'TFT vs always-d: TFT得49');
  console.assert(r4.bTotal === 54, 'TFT vs always-d: 背叛者得54');
  console.log('  ✓ TFT vs 永远背叛: TFT=' + r4.aTotal + ', 背叛者=' + r4.bTotal + '\n');
}

// 测试7: 锦标赛 - TFT应排名靠前
console.log('测试7: 策略锦标赛验证');
{
  var strategies = ['tft', 'always-c', 'always-d', 'grudger'];
  var scores = {};
  strategies.forEach(function(s) { scores[s] = 0; });
  for (var i = 0; i < strategies.length; i++) {
    for (var j = 0; j < strategies.length; j++) {
      var r = runMatch(strategies[i], strategies[j], 200);
      scores[strategies[i]] += r.aTotal;
      scores[strategies[j]] += r.bTotal;
    }
  }
  var sorted = strategies.slice().sort(function(a,b){ return scores[b] - scores[a]; });
  sorted.forEach(function(s, idx) {
    console.log('  ' + (idx+1) + '. ' + s + ': ' + scores[s]);
  });
  // TFT或grudger应在前两名（不含random的确定性锦标赛）
  console.assert(sorted[0] === 'tft' || sorted[0] === 'grudger', '冠军应是TFT或记仇者');
  console.assert(sorted[sorted.length-1] === 'always-d', '永远背叛应排最后');
  console.log('  ✓ TFT/记仇者排名靠前，永远背叛排最后\n');
}

// 测试8: 边界条件
console.log('测试8: 边界条件');
{
  // 纳什谈判解边界
  console.assert(nashBargainPrice(0, 0) === 0, '(0,0)应为0');
  console.assert(nashBargainPrice(1000, 1000) === 1000, '(1000,1000)应为1000');
  console.log('  ✓ 纳什谈判解边界: (0,0)=0, (1000,1000)=1000');

  // 最后通牒边界
  console.assert(ultimatumAcceptProb(100) === 0.98, '给100元接受率=98%');
  console.assert(ultimatumExpectedGain(100) === 0, '给100元期望收益=0');
  console.log('  ✓ 最后通牒边界: 给100元接受率98%但期望收益0');

  // 0轮对局
  var r0 = runMatch('tft', 'tft', 0);
  console.assert(r0.aTotal === 0, '0轮对局得分应为0');
  console.log('  ✓ 0轮对局: 得分=0');

  // 1轮对局
  var r1 = runMatch('tft', 'always-d', 1);
  console.assert(r1.aTotal === 0, 'TFT vs always-d 1轮: TFT得0');
  console.assert(r1.bTotal === 5, 'TFT vs always-d 1轮: 背叛者得5');
  console.log('  ✓ 1轮TFT vs 背叛: TFT=0, 背叛者=5\n');
}

console.log('✅ 所有测试通过！博弈论核心逻辑验证正确。\n');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nashBargainPrice, ultimatumAcceptProb, ultimatumExpectedGain, chickenMixedNE, getChoice, runMatch };
}
