/**
 * engine.js — "π 能当随机源吗？" demo 的核心纯逻辑
 *
 * 全部为无副作用的纯函数，方便用 node 直接单元测试，也在浏览器里挂到 window.PiRandomEngine。
 *
 * 核心论点：π 的小数位是"确定而公开"的无穷序列——它不是真随机源，连"统计随机"
 * （正规数）都未被证明，且取远位数字成本极高。本模块只负责可复现的纯计算：
 * 切片取数、频次统计、卡方检验、成本估算，全部交给上层渲染。
 *
 * PI_1M 由 data/pi-1m.js 提供（字符串，含小数点后第 1~1e6 位）。
 */

// ────────────────────────────────────────────────────────────
// 一、π 切片取数
// ────────────────────────────────────────────────────────────

/**
 * 从 π 字符串里取一小段数字（1 起始的位号）。
 *
 * 注意：这里只做"取数"，不涉及任何随机性——同一 (start, length) 永远返回同一段，
 * 这正是 π "可复现 / 可预测" 的根源，也是本 demo 要展示的核心。
 *
 * @param {string} pis π 小数位字符串（可来自 window.PI_1M）
 * @param {number} start 起始位号（1 起始，小数点后第 start 位）
 * @param {number} length 取几位
 * @returns {number[]} length 个数字（0~9 整数）
 * @throws 当 start<1 或 length<1 时
 */
function takePiSlice(pis, start, length) {
  if (typeof pis !== 'string' || pis.length === 0) {
    throw new Error('pis 必须是非空字符串');
  }
  if (start < 1) throw new Error('start 必须 >= 1');
  if (length < 1) throw new Error('length 必须 >= 1');
  var from = start - 1;
  var to = Math.min(from + length, pis.length);
  if (from >= pis.length) {
    throw new Error('start 超出 π 可用位数');
  }
  var out = [];
  for (var i = from; i < to; i++) {
    out.push(Number(pis.charAt(i)));
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// 二、频次统计与卡方检验
// ────────────────────────────────────────────────────────────

/**
 * 统计一段数字的 0~9 出现频次。
 * @param {number[]} digits
 * @returns {number[]} 长度 10 的频次数组
 */
function digitHistogram(digits) {
  var buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (var i = 0; i < digits.length; i++) {
    var d = digits[i];
    if (d >= 0 && d <= 9) buckets[d]++;
  }
  return buckets;
}

/**
 * 卡方统计量：observed 与"均匀分布"期望的偏离程度，值越大越不均匀。
 * 仅用于对比展示，不是严格假设检验（自由度、p 值另算）。
 * @param {number[]} observed 频次数组
 * @returns {number}
 */
function chiSquare(observed) {
  var total = 0;
  for (var i = 0; i < observed.length; i++) total += observed[i];
  if (total === 0) return 0;
  var expected = total / observed.length;
  var chi = 0;
  for (var j = 0; j < observed.length; j++) {
    var d = observed[j] - expected;
    chi += d * d / expected;
  }
  return chi;
}

// ────────────────────────────────────────────────────────────
// 三、成本估算
// ────────────────────────────────────────────────────────────

/**
 * 要取到第 start 位之后的 length 个数字，π 必须至少计算到第 start+length 位。
 * 这是"十进制下取远位"没有捷径的最小工作量（BBP 只对十六进制第 n 位有效）。
 *
 * @param {number} start 起始位号（1 起始）
 * @param {number} length 取几位
 * @returns {number} 需要计算到的最大位号
 */
function neededDigits(start, length) {
  if (start < 1) throw new Error('start 必须 >= 1');
  if (length < 1) throw new Error('length 必须 >= 1');
  return start + length;
}

/**
 * 把成本映射到 0~1 的"严重度"，用于仪表条配色（0 绿 → 0.5 黄 → 1 红）。
 * 用 log10 压缩位数跨度：[1e2, 1e8] 之间线性映射。
 * @param {number} needed 需要计算到的位号
 * @returns {number} [0,1] 严重度
 */
function costSeverity(needed) {
  if (needed <= 100) return 0;
  var lo = Math.log10(100);
  var hi = Math.log10(1e8);
  var s = (Math.log10(needed) - lo) / (hi - lo);
  return Math.max(0, Math.min(1, s));
}

// ────────────────────────────────────────────────────────────
// 四、格式化
// ────────────────────────────────────────────────────────────

/**
 * 把数字切片拼成字符串。
 * @param {number[]} digits
 * @returns {string}
 */
function joinDigits(digits) {
  return digits.join('');
}

/**
 * 大数格式化：1200000 -> "120 万"，2e9 -> "20 亿"。
 * @param {number} n
 * @returns {string}
 */
function formatBig(n) {
  if (n < 10000) return String(n);
  if (n < 1e8) {
    var w = n / 10000;
    return (w % 1 === 0 ? w : w.toFixed(1)) + ' 万';
  }
  var y = n / 1e8;
  return (y % 1 === 0 ? y : y.toFixed(1)) + ' 亿';
}

/**
 * 卡方值的可读描述（根据自由度 df=9 的经验阈值给出直觉，非精确检验）。
 * @param {number} chi 卡方统计量
 * @returns {{label:string, cls:string}} 标签与语义色 class
 */
function chiSummary(chi) {
  if (chi < 9) return { label: '非常均匀', cls: 'green' };
  if (chi < 16.9) return { label: '基本均匀', cls: 'blue' };
  if (chi < 27.9) return { label: '略有偏差', cls: 'orange' };
  return { label: '明显偏差', cls: 'red' };
}

var api = {
  takePiSlice: takePiSlice,
  digitHistogram: digitHistogram,
  chiSquare: chiSquare,
  neededDigits: neededDigits,
  costSeverity: costSeverity,
  joinDigits: joinDigits,
  formatBig: formatBig,
  chiSummary: chiSummary,
};

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
// 浏览器环境挂到 window
if (typeof window !== 'undefined') {
  window.PiRandomEngine = api;
}