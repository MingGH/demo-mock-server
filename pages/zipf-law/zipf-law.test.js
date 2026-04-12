/**
 * Zipf 定律页面测试
 * 运行: node pages/zipf-law.test.js
 */

// ========== 测试工具 ==========
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual, expected, tolerance = 0.01, msg = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg} Expected ~${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg = '') {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

// ========== 核心逻辑（从页面提取） ==========

/**
 * 分词函数
 */
function tokenize(text) {
  const chineseRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / text.length;
  
  if (chineseRatio > 0.3) {
    const words = [];
    const cleaned = text.replace(/[^\u4e00-\u9fa5]/g, '');
    for (let i = 0; i < cleaned.length - 1; i++) {
      words.push(cleaned.slice(i, i + 2));
    }
    return words.filter(w => w.length === 2);
  } else {
    return text.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
  }
}

/**
 * 计算 Zipf 拟合度
 */
function calculateZipfFit(data) {
  const n = data.length;
  const logRanks = data.map(d => Math.log(d.rank));
  const logValues = data.map(d => Math.log(d.value));
  
  const meanLogRank = logRanks.reduce((a, b) => a + b, 0) / n;
  const meanLogValue = logValues.reduce((a, b) => a + b, 0) / n;
  
  let ssTotal = 0, ssResidual = 0;
  let sumXY = 0, sumXX = 0;
  
  for (let i = 0; i < n; i++) {
    sumXY += (logRanks[i] - meanLogRank) * (logValues[i] - meanLogValue);
    sumXX += (logRanks[i] - meanLogRank) ** 2;
    ssTotal += (logValues[i] - meanLogValue) ** 2;
  }
  
  const slope = sumXY / sumXX;
  const intercept = meanLogValue - slope * meanLogRank;
  
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * logRanks[i];
    ssResidual += (logValues[i] - predicted) ** 2;
  }
  
  const r2 = 1 - ssResidual / ssTotal;
  
  return { r2, alpha: -slope };
}

/**
 * 生成理想 Zipf 分布数据
 */
function generateIdealZipf(n, c = 1000, alpha = 1) {
  const data = [];
  for (let i = 1; i <= n; i++) {
    data.push({
      rank: i,
      value: c / Math.pow(i, alpha)
    });
  }
  return data;
}

/**
 * 生成均匀分布数据（不符合 Zipf）
 */
function generateUniform(n, base = 100) {
  const data = [];
  for (let i = 1; i <= n; i++) {
    data.push({
      rank: i,
      value: base + Math.random() * 10
    });
  }
  return data;
}

// ========== 测试用例 ==========

console.log('\n🧪 Zipf 定律页面测试\n');

// 分词测试
test('中文分词：正确切分双字词', () => {
  const result = tokenize('人工智能改变世界');
  assertTrue(result.length > 0, '应该返回词语');
  assertTrue(result.every(w => w.length === 2), '每个词应该是2个字');
});

test('英文分词：按空格切分', () => {
  const result = tokenize('hello world test');
  assertEqual(result.length, 3, '应该有3个词');
  assertTrue(result.includes('hello'), '应该包含 hello');
});

test('英文分词：过滤单字符', () => {
  const result = tokenize('I am a test');
  assertTrue(!result.includes('i'), '应该过滤单字符 i');
  assertTrue(!result.includes('a'), '应该过滤单字符 a');
});

test('英文分词：转小写', () => {
  const result = tokenize('Hello WORLD Test');
  assertTrue(result.includes('hello'), '应该转为小写');
  assertTrue(result.includes('world'), '应该转为小写');
});

// Zipf 拟合度测试
test('理想 Zipf 分布：R² 应接近 1', () => {
  const data = generateIdealZipf(20);
  const fit = calculateZipfFit(data);
  assertClose(fit.r2, 1, 0.001, 'R² 应该非常接近 1');
});

test('理想 Zipf 分布：alpha 应接近 1', () => {
  const data = generateIdealZipf(20, 1000, 1);
  const fit = calculateZipfFit(data);
  assertClose(fit.alpha, 1, 0.01, 'alpha 应该接近 1');
});

test('alpha=0.8 的 Zipf 分布：正确识别 alpha', () => {
  const data = generateIdealZipf(20, 1000, 0.8);
  const fit = calculateZipfFit(data);
  assertClose(fit.alpha, 0.8, 0.01, 'alpha 应该接近 0.8');
});

test('均匀分布：R² 应该很低', () => {
  const data = generateUniform(20);
  const fit = calculateZipfFit(data);
  assertTrue(fit.r2 < 0.5, `均匀分布的 R² 应该很低，实际: ${fit.r2}`);
});

// 边界情况测试
test('最小数据量：2个数据点', () => {
  const data = [
    { rank: 1, value: 100 },
    { rank: 2, value: 50 }
  ];
  const fit = calculateZipfFit(data);
  assertTrue(!isNaN(fit.r2), 'R² 不应该是 NaN');
});

test('大数据量：100个数据点', () => {
  const data = generateIdealZipf(100);
  const fit = calculateZipfFit(data);
  assertClose(fit.r2, 1, 0.001, '大数据量也应该正确计算');
});

// Zipf 定律验证
test('Zipf 定律：第2名约为第1名的一半', () => {
  const data = generateIdealZipf(10);
  const ratio = data[0].value / data[1].value;
  assertClose(ratio, 2, 0.01, '第1名/第2名 应该约等于 2');
});

test('Zipf 定律：第10名约为第1名的1/10', () => {
  const data = generateIdealZipf(10);
  const ratio = data[0].value / data[9].value;
  assertClose(ratio, 10, 0.01, '第1名/第10名 应该约等于 10');
});

// 真实数据测试
test('中文词频数据：应符合 Zipf 定律', () => {
  const chineseWords = [
    { rank: 1, value: 7922 },
    { rank: 2, value: 3328 },
    { rank: 3, value: 2778 },
    { rank: 4, value: 2666 },
    { rank: 5, value: 2145 },
    { rank: 6, value: 1971 },
    { rank: 7, value: 1914 },
    { rank: 8, value: 1823 },
    { rank: 9, value: 1519 },
    { rank: 10, value: 1285 }
  ];
  const fit = calculateZipfFit(chineseWords);
  assertTrue(fit.r2 > 0.9, `中文词频 R² 应该 > 0.9，实际: ${fit.r2}`);
});

test('英文词频数据：应符合 Zipf 定律', () => {
  const englishWords = [
    { rank: 1, value: 69971 },
    { rank: 2, value: 36411 },
    { rank: 3, value: 28852 },
    { rank: 4, value: 28765 },
    { rank: 5, value: 23199 },
    { rank: 6, value: 21341 },
    { rank: 7, value: 10594 },
    { rank: 8, value: 10102 },
    { rank: 9, value: 9815 },
    { rank: 10, value: 9543 }
  ];
  const fit = calculateZipfFit(englishWords);
  assertTrue(fit.r2 > 0.85, `英文词频 R² 应该 > 0.85，实际: ${fit.r2}`);
});

// ========== 测试结果 ==========
console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
