// ========== 核心算法（可独立测试） ==========

/**
 * 生成真随机二维点（均匀分布）
 * 每个点的 x, y 独立均匀分布在 [0, size) 区间
 */
function generateUniformPoints(count, size) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: Math.random() * size,
      y: Math.random() * size
    });
  }
  return points;
}

/**
 * 生成"看起来随机"的均匀打散点（蓝噪声近似）
 * 使用 Mitchell's Best-Candidate 算法
 * 生成的点会看起来"更均匀"，人类直觉认为这才是"随机"
 */
function generateBlueNoisePoints(count, size, candidatesPerPoint) {
  candidatesPerPoint = candidatesPerPoint || 30;
  const points = [];
  // 第一个点随机放置
  points.push({ x: Math.random() * size, y: Math.random() * size });

  for (let i = 1; i < count; i++) {
    let bestCandidate = null;
    let bestDistance = -1;

    for (let c = 0; c < candidatesPerPoint; c++) {
      const candidate = { x: Math.random() * size, y: Math.random() * size };
      // 找到离已有点的最小距离
      let minDist = Infinity;
      for (let j = 0; j < points.length; j++) {
        const d = dist(candidate, points[j]);
        if (d < minDist) minDist = d;
      }
      // 保留最小距离最大的候选点
      if (minDist > bestDistance) {
        bestDistance = minDist;
        bestCandidate = candidate;
      }
    }
    points.push(bestCandidate);
  }
  return points;
}

/**
 * 从量子随机数组生成二维点
 * numbers: [0-255] 的整数数组，每两个数生成一个点
 */
function quantumNumbersToPoints(numbers, size) {
  const points = [];
  for (let i = 0; i < numbers.length - 1; i += 2) {
    points.push({
      x: (numbers[i] / 255) * size,
      y: (numbers[i + 1] / 255) * size
    });
  }
  return points;
}

/**
 * 两点之间的欧氏距离
 */
function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * 计算最近邻距离统计（Clark-Evans 指标）
 * R = 观察到的平均最近邻距离 / 完全随机分布的期望最近邻距离
 * R ≈ 1: 随机分布
 * R < 1: 聚集分布
 * R > 1: 均匀/规则分布
 */
function clarkEvansR(points, areaSize) {
  const n = points.length;
  if (n < 2) return 1;

  // 观察到的平均最近邻距离
  let totalNNDist = 0;
  for (let i = 0; i < n; i++) {
    let minD = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = dist(points[i], points[j]);
      if (d < minD) minD = d;
    }
    totalNNDist += minD;
  }
  const observedMean = totalNNDist / n;

  // 完全随机分布的期望最近邻距离 = 1 / (2 * sqrt(密度))
  const area = areaSize * areaSize;
  const density = n / area;
  const expectedMean = 1 / (2 * Math.sqrt(density));

  return observedMean / expectedMean;
}

/**
 * 将点集划分为网格，统计每格点数的方差系数（CV）
 * CV 高 = 分布不均匀（有聚集和空洞）
 * CV 低 = 分布均匀
 */
function gridVarianceCV(points, size, gridCols) {
  gridCols = gridCols || 8;
  const cellSize = size / gridCols;
  const grid = new Array(gridCols * gridCols).fill(0);

  for (let i = 0; i < points.length; i++) {
    const col = Math.min(Math.floor(points[i].x / cellSize), gridCols - 1);
    const row = Math.min(Math.floor(points[i].y / cellSize), gridCols - 1);
    grid[row * gridCols + col]++;
  }

  const mean = points.length / (gridCols * gridCols);
  let variance = 0;
  for (let i = 0; i < grid.length; i++) {
    variance += (grid[i] - mean) ** 2;
  }
  variance /= grid.length;

  return mean > 0 ? Math.sqrt(variance) / mean : 0;
}

// ========== 密码熵计算 ==========

/**
 * 计算密码的字符集空间大小
 */
function getCharsetSize(password) {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 33; // 常见特殊字符
  return size;
}

/**
 * 计算暴力破解熵（位）
 * 假设攻击者知道字符集但不知道长度
 */
function bruteForceEntropy(password) {
  const charsetSize = getCharsetSize(password);
  if (charsetSize === 0 || password.length === 0) return 0;
  return password.length * Math.log2(charsetSize);
}

/**
 * 计算基于词典的熵（passphrase 模式）
 * 假设使用常见词典（约2048个常用词，类似 EFF dice list）
 */
function passphraseEntropy(wordCount, dictionarySize) {
  dictionarySize = dictionarySize || 2048;
  if (wordCount <= 0) return 0;
  return wordCount * Math.log2(dictionarySize);
}

/**
 * 估算暴力破解所需时间（秒）
 * guessesPerSecond: 攻击者每秒尝试次数
 */
function crackTimeSeconds(entropyBits, guessesPerSecond) {
  guessesPerSecond = guessesPerSecond || 1e10; // 10 billion/s (高端GPU集群)
  // 平均需要尝试一半的搜索空间
  return Math.pow(2, entropyBits - 1) / guessesPerSecond;
}

/**
 * 将秒数格式化为人类可读时间
 */
function formatCrackTime(seconds) {
  if (seconds < 0.001) return '瞬间';
  if (seconds < 1) return '不到1秒';
  if (seconds < 60) return Math.round(seconds) + '秒';
  if (seconds < 3600) return Math.round(seconds / 60) + '分钟';
  if (seconds < 86400) return Math.round(seconds / 3600) + '小时';
  if (seconds < 86400 * 365) return Math.round(seconds / 86400) + '天';
  if (seconds < 86400 * 365 * 1e3) return Math.round(seconds / (86400 * 365)) + '年';
  if (seconds < 86400 * 365 * 1e6) return (seconds / (86400 * 365 * 1e3)).toFixed(1) + '千年';
  if (seconds < 86400 * 365 * 1e9) return (seconds / (86400 * 365 * 1e6)).toFixed(1) + '百万年';
  if (seconds < 86400 * 365 * 1e12) return (seconds / (86400 * 365 * 1e9)).toFixed(1) + '十亿年';
  return '超过宇宙年龄';
}

/**
 * 评估密码强度等级
 */
function passwordStrengthLevel(entropyBits) {
  if (entropyBits < 28) return { level: 'very-weak', label: '极弱', color: '#ff4444' };
  if (entropyBits < 36) return { level: 'weak', label: '弱', color: '#ff6b6b' };
  if (entropyBits < 60) return { level: 'fair', label: '一般', color: '#ffa726' };
  if (entropyBits < 80) return { level: 'strong', label: '强', color: '#81c784' };
  if (entropyBits < 100) return { level: 'very-strong', label: '很强', color: '#4caf50' };
  return { level: 'extreme', label: '极强', color: '#00e676' };
}

/**
 * 检测常见密码模式（字典攻击会利用的弱点）
 */
function detectWeakPatterns(password) {
  const patterns = [];
  // 常见替换: a->@, e->3, o->0, s->$, i->!, l->1
  if (/[@3\$!10]/.test(password)) {
    const normalized = password
      .replace(/@/g, 'a').replace(/3/g, 'e').replace(/\$/g, 's')
      .replace(/!/g, 'i').replace(/1/g, 'l').replace(/0/g, 'o');
    if (normalized !== password) {
      patterns.push('leet-speak');
    }
  }
  // 末尾数字或符号
  if (/^[a-zA-Z]+[0-9!@#$%^&*]+$/.test(password)) {
    patterns.push('word-plus-suffix');
  }
  // 首字母大写
  if (/^[A-Z][a-z]/.test(password)) {
    patterns.push('capital-first');
  }
  // 纯重复
  if (/^(.)\1+$/.test(password)) {
    patterns.push('repeat');
  }
  // 键盘序列
  const sequences = ['qwerty', 'asdf', '1234', 'zxcv', 'password', 'admin'];
  const lower = password.toLowerCase();
  for (const seq of sequences) {
    if (lower.includes(seq)) {
      patterns.push('keyboard-sequence');
      break;
    }
  }
  return patterns;
}

/**
 * 计算密码的实际有效熵（考虑弱模式后降低）
 */
function effectiveEntropy(password) {
  const base = bruteForceEntropy(password);
  const patterns = detectWeakPatterns(password);

  let penalty = 0;
  if (patterns.includes('leet-speak')) penalty += 10;
  if (patterns.includes('word-plus-suffix')) penalty += 8;
  if (patterns.includes('capital-first')) penalty += 3;
  if (patterns.includes('repeat')) penalty += base * 0.7;
  if (patterns.includes('keyboard-sequence')) penalty += 15;

  return Math.max(0, base - penalty);
}

// ========== 导出 ==========
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateUniformPoints,
    generateBlueNoisePoints,
    quantumNumbersToPoints,
    dist,
    clarkEvansR,
    gridVarianceCV,
    getCharsetSize,
    bruteForceEntropy,
    passphraseEntropy,
    crackTimeSeconds,
    formatCrackTime,
    passwordStrengthLevel,
    detectWeakPatterns,
    effectiveEntropy
  };
}
