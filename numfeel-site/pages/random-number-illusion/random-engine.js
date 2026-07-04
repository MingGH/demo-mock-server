/**
 * random-engine.js — 随机数错觉核心算法
 * 纯函数，不依赖 DOM，可在 Node.js 中直接 require 测试
 */

/**
 * 生成指定数量的 5 位随机数字符串（00000-99999，零填充）
 *
 * @param {number} count - 生成数量
 * @param {function} [rng] - 随机数生成器，返回 [0,1)，默认 Math.random
 * @returns {string[]} 5 位数字字符串数组
 */
function generate5DigitNumbers(count, rng) {
  var rand = rng || Math.random;
  var result = [];
  for (var i = 0; i < count; i++) {
    var n = Math.floor(rand() * 100000);
    var s = n.toString();
    while (s.length < 5) s = '0' + s;
    result.push(s);
  }
  return result;
}

/**
 * 判断一个 5 位数属于什么「规律模式」
 * 优先级：all-same > sequential > repeating-pattern > palindrome > none
 *
 * - all-same: 全部相同（11111, 22222）
 * - sequential: 连续递增/递减（12345, 54321, 23456）
 * - repeating-pattern: 重复模式 ABABA（10101, 12121）
 * - palindrome: 回文（12321, 45654）
 * - none: 无明显规律
 *
 * @param {string} numStr - 5 位数字字符串
 * @returns {string} 模式名称
 */
function classifyPattern(numStr) {
  var d = numStr.split('');

  // 全部相同
  if (d[0] === d[1] && d[1] === d[2] && d[2] === d[3] && d[3] === d[4]) {
    return 'all-same';
  }

  // 连续递增/递减（逐位差 +1 或 -1）
  var inc = true;
  var dec = true;
  for (var i = 1; i < 5; i++) {
    var diff = d[i].charCodeAt(0) - d[i - 1].charCodeAt(0);
    if (diff !== 1) inc = false;
    if (diff !== -1) dec = false;
  }
  if (inc || dec) return 'sequential';

  // 重复模式 ABABA：0/2/4 位相同且 1/3 位相同
  if (d[0] === d[2] && d[2] === d[4] && d[1] === d[3]) {
    return 'repeating-pattern';
  }

  // 回文：正读反读相同
  if (d[0] === d[4] && d[1] === d[3]) {
    return 'palindrome';
  }

  return 'none';
}

/**
 * 统计一组数字中各种规律模式的数量
 *
 * @param {string[]} numbers - 5 位数字字符串数组
 * @returns {{all-same:number, sequential:number, repeating-pattern:number, palindrome:number, none:number}} 各模式计数
 */
function countPatterns(numbers) {
  var counts = {
    'all-same': 0,
    'sequential': 0,
    'repeating-pattern': 0,
    'palindrome': 0,
    'none': 0
  };
  for (var i = 0; i < numbers.length; i++) {
    var p = classifyPattern(numbers[i]);
    counts[p] = (counts[p] || 0) + 1;
  }
  return counts;
}

/**
 * 计算指定 5 位数出现的概率
 * 任意一个 5 位数的出现概率都是 1/100000
 *
 * @param {string} numStr - 5 位数字字符串
 * @returns {number} 概率值 1/100000
 */
function calculateProbability(numStr) {
  return 1 / 100000;
}

// 浏览器环境：挂载到全局 randomEngine 对象
// Node 环境：导出为 CommonJS 模块
var _exports = {
  generate5DigitNumbers: generate5DigitNumbers,
  classifyPattern: classifyPattern,
  countPatterns: countPatterns,
  calculateProbability: calculateProbability
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _exports;
} else {
  window.randomEngine = _exports;
}
