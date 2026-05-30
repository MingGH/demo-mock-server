/**
 * 基率忽视模拟器 - 单元测试
 * 测试贝叶斯计算和蒙特卡洛模拟的核心逻辑
 */

// ========== 核心函数 ==========

function calcBayes(prevalence, sensitivity, specificity) {
  const truePositive = prevalence * sensitivity;
  const falsePositive = (1 - prevalence) * (1 - specificity);
  const trueNegative = (1 - prevalence) * specificity;
  const falseNegative = prevalence * (1 - sensitivity);
  const ppv = truePositive / (truePositive + falsePositive);
  const npv = trueNegative / (trueNegative + falseNegative);
  return { truePositive, falsePositive, trueNegative, falseNegative, ppv, npv };
}

function simulatePopulation(n, prevalence, sensitivity, specificity) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < n; i++) {
    const isSick = Math.random() < prevalence;
    if (isSick) {
      if (Math.random() < sensitivity) tp++; else fn++;
    } else {
      if (Math.random() < specificity) tn++; else fp++;
    }
  }
  const ppv = tp + fp > 0 ? tp / (tp + fp) : 0;
  return { tp, fp, tn, fn, ppv, total: n };
}

// ========== 测试 ==========

console.log('🧪 开始测试基率忽视核心逻辑\n');

// 测试1: 经典场景 - 1%发病率 + 99%准确率
console.log('测试1: 经典场景 (1%发病率, 99%准确率)');
{
  const b = calcBayes(0.01, 0.99, 0.99);
  console.assert(Math.abs(b.ppv - 0.5) < 0.01, `PPV应约为50%, 实际: ${(b.ppv * 100).toFixed(1)}%`);
  console.log(`✓ PPV = ${(b.ppv * 100).toFixed(1)}% (预期 ~50%)`);

  // 验证四个分类之和为1
  const sum = b.truePositive + b.falsePositive + b.trueNegative + b.falseNegative;
  console.assert(Math.abs(sum - 1) < 0.0001, '四个分类之和应为1');
  console.log(`✓ 四分类之和 = ${sum.toFixed(6)} (预期 1.0)\n`);
}

// 测试2: 高发病率场景
console.log('测试2: 高发病率 (50%发病率, 99%准确率)');
{
  const b = calcBayes(0.50, 0.99, 0.99);
  console.assert(b.ppv > 0.98, `高发病率时PPV应很高, 实际: ${(b.ppv * 100).toFixed(1)}%`);
  console.log(`✓ PPV = ${(b.ppv * 100).toFixed(1)}% (预期 ~99%)`);
  console.log(`✓ 高发病率时，阳性结果非常可靠\n`);
}

// 测试3: 极低发病率
console.log('测试3: 极低发病率 (0.1%发病率, 99%准确率)');
{
  const b = calcBayes(0.001, 0.99, 0.99);
  console.assert(b.ppv < 0.10, `极低发病率时PPV应很低, 实际: ${(b.ppv * 100).toFixed(1)}%`);
  console.log(`✓ PPV = ${(b.ppv * 100).toFixed(2)}% (预期 <10%)`);
  console.log(`✓ 极低发病率时，99%准确率的检测阳性结果大部分是假的\n`);
}

// 测试4: 完美检测
console.log('测试4: 完美检测 (100%灵敏度, 100%特异度)');
{
  const b = calcBayes(0.01, 1.0, 1.0);
  console.assert(Math.abs(b.ppv - 1.0) < 0.0001, 'PPV应为100%');
  console.assert(Math.abs(b.npv - 1.0) < 0.0001, 'NPV应为100%');
  console.assert(b.falsePositive === 0, '不应有假阳性');
  console.assert(b.falseNegative === 0, '不应有假阴性');
  console.log(`✓ PPV = ${(b.ppv * 100).toFixed(0)}%, NPV = ${(b.npv * 100).toFixed(0)}%`);
  console.log(`✓ 完美检测无误报\n`);
}

// 测试5: NPV（阴性预测值）
console.log('测试5: 阴性预测值 (NPV)');
{
  const b = calcBayes(0.01, 0.99, 0.99);
  console.assert(b.npv > 0.999, `低发病率时NPV应非常高, 实际: ${(b.npv * 100).toFixed(3)}%`);
  console.log(`✓ NPV = ${(b.npv * 100).toFixed(4)}%`);
  console.log(`✓ 低发病率时，阴性结果非常可靠（几乎不会漏诊）\n`);
}

// 测试6: 对称性验证
console.log('测试6: 对称性验证');
{
  const b1 = calcBayes(0.5, 0.99, 0.99);
  console.assert(Math.abs(b1.ppv - b1.npv) < 0.001, '50%发病率时PPV应等于NPV');
  console.log(`✓ 50%发病率: PPV=${(b1.ppv * 100).toFixed(2)}%, NPV=${(b1.npv * 100).toFixed(2)}%`);

  // 灵敏度和特异度互换 + 发病率互补 => PPV和NPV互换
  const b2 = calcBayes(0.3, 0.95, 0.90);
  const b3 = calcBayes(0.7, 0.90, 0.95);
  console.assert(Math.abs(b2.ppv - b3.npv) < 0.001, 'PPV/NPV对称性');
  console.log(`✓ 对称性验证通过\n`);
}

// 测试7: 蒙特卡洛模拟收敛性
console.log('测试7: 蒙特卡洛模拟收敛性');
{
  const theoretical = calcBayes(0.05, 0.95, 0.95);
  let totalPPV = 0;
  const runs = 200;
  for (let i = 0; i < runs; i++) {
    const sim = simulatePopulation(10000, 0.05, 0.95, 0.95);
    totalPPV += sim.ppv;
  }
  const avgPPV = totalPPV / runs;
  const diff = Math.abs(avgPPV - theoretical.ppv);
  console.assert(diff < 0.02, `模拟PPV应接近理论值, 差异: ${(diff * 100).toFixed(2)}%`);
  console.log(`✓ 理论PPV: ${(theoretical.ppv * 100).toFixed(2)}%`);
  console.log(`✓ 模拟PPV: ${(avgPPV * 100).toFixed(2)}% (${runs}次平均)`);
  console.log(`✓ 差异: ${(diff * 100).toFixed(3)}%\n`);
}

// 测试8: 模拟人数守恒
console.log('测试8: 模拟人数守恒');
{
  for (let i = 0; i < 50; i++) {
    const n = 1000 + Math.floor(Math.random() * 9000);
    const sim = simulatePopulation(n, Math.random() * 0.5, 0.8 + Math.random() * 0.2, 0.8 + Math.random() * 0.2);
    const total = sim.tp + sim.fp + sim.tn + sim.fn;
    console.assert(total === n, `人数守恒: ${total} !== ${n}`);
  }
  console.log('✓ 50次随机参数模拟，人数守恒全部通过\n');
}

// 测试9: PPV随发病率单调递增
console.log('测试9: PPV随发病率单调递增');
{
  let prevPPV = 0;
  let monotonic = true;
  for (let p = 1; p <= 100; p++) {
    const b = calcBayes(p / 100, 0.95, 0.95);
    if (b.ppv < prevPPV - 0.0001) { monotonic = false; break; }
    prevPPV = b.ppv;
  }
  console.assert(monotonic, 'PPV应随发病率单调递增');
  console.log('✓ PPV随发病率单调递增验证通过\n');
}

// 测试10: 边界条件
console.log('测试10: 边界条件');
{
  // 发病率为0
  const b0 = calcBayes(0, 0.99, 0.99);
  console.assert(b0.truePositive === 0, '发病率0时无真阳性');
  console.assert(isNaN(b0.ppv) || b0.ppv === 0, '发病率0时PPV为0或NaN');
  console.log(`✓ 发病率0%: TP=${b0.truePositive}, PPV=${b0.ppv}`);

  // 发病率为1
  const b1 = calcBayes(1, 0.99, 0.99);
  console.assert(b1.falsePositive === 0, '发病率100%时无假阳性');
  console.assert(Math.abs(b1.ppv - 1) < 0.0001, '发病率100%时PPV=100%');
  console.log(`✓ 发病率100%: FP=${b1.falsePositive}, PPV=${(b1.ppv * 100).toFixed(0)}%`);

  // 灵敏度为0
  const b2 = calcBayes(0.5, 0, 0.99);
  console.assert(b2.truePositive === 0, '灵敏度0时无真阳性');
  console.log(`✓ 灵敏度0%: TP=${b2.truePositive}`);

  // 特异度为0（全部误报）
  const b3 = calcBayes(0.01, 0.99, 0);
  console.assert(b3.falsePositive > 0.9, '特异度0时几乎全是假阳性');
  console.assert(b3.ppv < 0.02, '特异度0时PPV极低');
  console.log(`✓ 特异度0%: FP=${b3.falsePositive.toFixed(4)}, PPV=${(b3.ppv * 100).toFixed(2)}%\n`);
}

// 测试11: 生活场景验证
console.log('测试11: 生活场景验证');
{
  // 机场安检
  const airport = calcBayes(0.00001, 0.999, 0.999);
  console.assert(airport.ppv < 0.01, '机场安检PPV应极低');
  console.log(`✓ 机场安检: PPV=${(airport.ppv * 100).toFixed(4)}% (绝大多数报警是误报)`);

  // 垃圾邮件
  const spam = calcBayes(0.10, 0.98, 0.98);
  console.assert(spam.ppv > 0.8, '垃圾邮件过滤PPV应较高');
  console.log(`✓ 垃圾邮件: PPV=${(spam.ppv * 100).toFixed(1)}%`);

  // 毒品检测
  const drug = calcBayes(0.05, 0.99, 0.99);
  console.assert(drug.ppv > 0.8, '毒品检测PPV应较高');
  console.log(`✓ 毒品检测: PPV=${(drug.ppv * 100).toFixed(1)}%\n`);
}

console.log('✅ 所有测试通过！核心逻辑验证正确。\n');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcBayes, simulatePopulation };
}
