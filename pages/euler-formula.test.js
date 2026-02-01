/**
 * 欧拉公式核心算法测试
 * 运行: 在浏览器控制台中执行，或使用 Node.js
 */

// ========== 核心算法 ==========

/**
 * 计算 e^(ix) = cos(x) + i*sin(x)
 * @param {number} theta - 角度（弧度）
 * @returns {{real: number, imag: number}} 复数结果
 */
function eulerFormula(theta) {
  return {
    real: Math.cos(theta),
    imag: Math.sin(theta)
  };
}

/**
 * 计算 e^((a+i)*theta) 用于螺旋绘制
 * @param {number} a - 实部系数
 * @param {number} theta - 角度
 * @returns {{x: number, y: number}} 坐标点
 */
function spiralPoint(a, theta) {
  const r = Math.exp(a * theta);
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta)
  };
}

/**
 * 生成螺旋轨迹点
 * @param {number} a - 实部系数
 * @param {number} maxTheta - 最大角度
 * @param {number} step - 步长
 * @returns {Array<{x: number, y: number}>} 轨迹点数组
 */
function generateSpiralPath(a, maxTheta = Math.PI * 6, step = 0.02) {
  const points = [];
  for (let t = 0; t <= maxTheta; t += step) {
    points.push(spiralPoint(a, t));
  }
  return points;
}

// ========== 测试用例 ==========

function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      results.push({ name, status: 'PASS' });
      passed++;
    } catch (e) {
      results.push({ name, status: 'FAIL', error: e.message });
      failed++;
    }
  }

  function assertEqual(actual, expected, tolerance = 1e-10) {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  }

  // 测试1: e^(i*0) = 1
  test('e^(i*0) = 1', () => {
    const result = eulerFormula(0);
    assertEqual(result.real, 1);
    assertEqual(result.imag, 0);
  });

  // 测试2: e^(i*π) = -1 (欧拉恒等式核心)
  test('e^(i*π) = -1 (Euler Identity)', () => {
    const result = eulerFormula(Math.PI);
    assertEqual(result.real, -1, 1e-10);
    assertEqual(result.imag, 0, 1e-10);
  });

  // 测试3: e^(i*π/2) = i
  test('e^(i*π/2) = i', () => {
    const result = eulerFormula(Math.PI / 2);
    assertEqual(result.real, 0, 1e-10);
    assertEqual(result.imag, 1, 1e-10);
  });

  // 测试4: e^(i*2π) = 1 (完整旋转回到起点)
  test('e^(i*2π) = 1 (full rotation)', () => {
    const result = eulerFormula(Math.PI * 2);
    assertEqual(result.real, 1, 1e-10);
    assertEqual(result.imag, 0, 1e-10);
  });

  // 测试5: |e^(ix)| = 1 (模长恒为1)
  test('|e^(ix)| = 1 for any x', () => {
    const testAngles = [0, Math.PI/4, Math.PI/2, Math.PI, 3*Math.PI/2, 2*Math.PI, 5.5];
    testAngles.forEach(theta => {
      const result = eulerFormula(theta);
      const magnitude = Math.sqrt(result.real**2 + result.imag**2);
      assertEqual(magnitude, 1, 1e-10);
    });
  });

  // 测试6: 螺旋点计算 - a=0 时为单位圆
  test('spiral with a=0 is unit circle', () => {
    const point = spiralPoint(0, Math.PI);
    assertEqual(point.x, -1, 1e-10);
    assertEqual(point.y, 0, 1e-10);
  });

  // 测试7: 螺旋点计算 - a>0 时向外扩张
  test('spiral with a>0 expands outward', () => {
    const point1 = spiralPoint(0.1, Math.PI);
    const point2 = spiralPoint(0.1, 2 * Math.PI);
    const r1 = Math.sqrt(point1.x**2 + point1.y**2);
    const r2 = Math.sqrt(point2.x**2 + point2.y**2);
    if (r2 <= r1) throw new Error('Spiral should expand when a > 0');
  });

  // 测试8: 螺旋点计算 - a<0 时向内收缩
  test('spiral with a<0 contracts inward', () => {
    const point1 = spiralPoint(-0.1, Math.PI);
    const point2 = spiralPoint(-0.1, 2 * Math.PI);
    const r1 = Math.sqrt(point1.x**2 + point1.y**2);
    const r2 = Math.sqrt(point2.x**2 + point2.y**2);
    if (r2 >= r1) throw new Error('Spiral should contract when a < 0');
  });

  // 测试9: 生成螺旋路径
  test('generateSpiralPath returns valid points', () => {
    const path = generateSpiralPath(0, Math.PI * 2, 0.1);
    if (path.length < 60) throw new Error('Path should have enough points');
    // 检查第一个点
    assertEqual(path[0].x, 1, 1e-10);
    assertEqual(path[0].y, 0, 1e-10);
  });

  // 测试10: e^(i*(-π)) = -1
  test('e^(i*(-π)) = -1', () => {
    const result = eulerFormula(-Math.PI);
    assertEqual(result.real, -1, 1e-10);
    assertEqual(result.imag, 0, 1e-10);
  });

  // 输出结果
  console.log('\n========== 欧拉公式测试结果 ==========\n');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  });
  console.log(`\n总计: ${passed} 通过, ${failed} 失败\n`);
  
  return { passed, failed, results };
}

// 如果在浏览器环境中，自动运行测试
if (typeof window !== 'undefined') {
  window.eulerFormula = eulerFormula;
  window.spiralPoint = spiralPoint;
  window.generateSpiralPath = generateSpiralPath;
  window.runEulerTests = runTests;
  console.log('欧拉公式测试已加载。运行 runEulerTests() 执行测试。');
}

// 如果在 Node.js 环境中
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { eulerFormula, spiralPoint, generateSpiralPath, runTests };
  
  // 自动运行测试
  const { passed, failed } = runTests();
  process.exit(failed > 0 ? 1 : 0);
}
