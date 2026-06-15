/**
 * π 包含一切 — 核心算法模块
 * 纯函数，可独立测试（Node.js 环境 + 浏览器通用）
 */

/**
 * 在 π 的十六进制表示中搜索字节序列的位置（模拟 πfs 的原理）
 * πfs 将文件按字节拆分，每个字节在 π 的十六进制表示中查找
 * @param {string} piHex - π 的十六进制小数位字符串
 * @param {string} byteHex - 要查找的两位十六进制字节（如 "48"）
 * @returns {number} 位置（从1开始），-1 表示未找到
 */
function searchByteInPiHex(piHex, byteHex) {
  const target = byteHex.toLowerCase();
  for (let i = 0; i <= piHex.length - 2; i++) {
    if (piHex[i] === target[0] && piHex[i + 1] === target[1]) {
      return i + 1; // 1-indexed
    }
  }
  return -1;
}

/**
 * 将字符串转换为 UTF-8 字节数组
 * @param {string} str
 * @returns {number[]} 字节值数组（0-255）
 */
function stringToBytes(str) {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(str));
}

/**
 * 将纯数字字符串在 π 的十进制小数位中搜索
 * @param {string} piDigits - π 的十进制小数位
 * @param {string} sequence - 要搜索的数字序列
 * @returns {number} 位置（从1开始），-1 表示未找到
 */
function searchInPiDecimal(piDigits, sequence) {
  const idx = piDigits.indexOf(sequence);
  return idx >= 0 ? idx + 1 : -1;
}

/**
 * 计算在 π 的前 N 位中找到 k 位序列的理论概率
 * 基于独立随机假设（正规数猜想）：P ≈ 1 - (1 - 10^-k)^(N-k+1)
 * @param {number} n - π 的位数
 * @param {number} k - 序列长度
 * @returns {number} 概率（0~1）
 */
function probabilityOfFinding(n, k) {
  if (k > n || k <= 0) return 0;
  const p = Math.pow(10, -k); // 单次匹配概率
  const trials = n - k + 1;
  // 使用对数避免精度问题
  const logNotFind = trials * Math.log(1 - p);
  return 1 - Math.exp(logNotFind);
}

/**
 * 计算找到 k 位序列所需的期望位数
 * E[N] ≈ 10^k
 * @param {number} k - 序列长度
 * @returns {number}
 */
function expectedPosition(k) {
  return Math.pow(10, k);
}

/**
 * 模拟 πfs 的「存储」过程
 * 将文件内容拆分为字节，每个字节在 π 的十六进制中查找偏移量
 * @param {string} content - 要存储的内容
 * @param {string} piHex - π 的十六进制字符串
 * @returns {{byte: string, hex: string, position: number}[]}
 */
function simulatePifsStorage(content, piHex) {
  const bytes = stringToBytes(content);
  return bytes.map(b => {
    const hex = b.toString(16).padStart(2, '0');
    const pos = searchByteInPiHex(piHex, hex);
    return { byte: b, hex, position: pos };
  });
}

/**
 * 计算 πfs 的「元数据膨胀系数」
 * 存储 1 字节数据需要存储其在 π 中的偏移量（一个整数）
 * @param {{position: number}[]} entries
 * @returns {{metadataBytes: number, dataBytes: number, ratio: number}}
 */
function pifsMetadataOverhead(entries) {
  const dataBytes = entries.length;
  // 每个位置信息需要 4 字节（假设 32-bit int 偏移）
  const metadataBytes = entries.length * 4;
  return {
    metadataBytes,
    dataBytes,
    ratio: dataBytes > 0 ? Math.round(metadataBytes / dataBytes * 100) / 100 : 0
  };
}

/**
 * 评估搜索结果的「运气值」
 * @param {number} position - 实际找到的位置
 * @param {number} seqLength - 序列长度
 * @returns {{expected: number, ratio: number, luck: string, percentile: number}}
 */
function evaluateLuck(position, seqLength) {
  const expected = expectedPosition(seqLength);
  const ratio = Math.round(position / expected * 100) / 100;
  // 概率分布近似：在随机序列中，首次出现位置近似几何分布
  // P(X <= position) ≈ 1 - (1 - 10^-k)^position
  const cdf = 1 - Math.pow(1 - Math.pow(10, -seqLength), position);
  const percentile = Math.round(cdf * 100);

  let luck;
  if (ratio < 0.1) luck = '极其幸运';
  else if (ratio < 0.3) luck = '非常幸运';
  else if (ratio < 0.7) luck = '比较幸运';
  else if (ratio < 1.5) luck = '正常水平';
  else if (ratio < 3) luck = '略为靠后';
  else luck = '位置较深';

  return { expected, ratio, luck, percentile };
}

/**
 * 格式化大数字
 * @param {number} n
 * @returns {string}
 */
function formatLargeNumber(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + '万亿';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n.toLocaleString();
}

/**
 * 估算银行卡密码（6位）在 π 中出现的统计数据
 * @param {number} piLength - π 的已知位数
 * @returns {{totalPasswords: number, avgOccurrences: number, probabilityFound: number}}
 */
function bankPasswordStats(piLength) {
  const totalPasswords = 1000000; // 6位数字 000000-999999
  const avgOccurrences = Math.round(piLength / totalPasswords);
  const probabilityFound = probabilityOfFinding(piLength, 6);
  return { totalPasswords, avgOccurrences, probabilityFound };
}

/**
 * 计算不同长度数字序列在 π 前 N 位中的期望出现次数
 * @param {number} n - π 的位数
 * @param {number} k - 序列长度
 * @returns {number}
 */
function expectedOccurrences(n, k) {
  return (n - k + 1) * Math.pow(10, -k);
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    searchByteInPiHex,
    stringToBytes,
    searchInPiDecimal,
    probabilityOfFinding,
    expectedPosition,
    simulatePifsStorage,
    pifsMetadataOverhead,
    evaluateLuck,
    formatLargeNumber,
    bankPasswordStats,
    expectedOccurrences
  };
}
