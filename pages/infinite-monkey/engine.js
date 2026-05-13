// ===== 无限猴子引擎 =====
// 纯计算逻辑，无 DOM 操作

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz ';
const ALPHABET_SIZE = ALPHABET.length; // 27

const Engine = {

  alphabet: ALPHABET,
  alphabetSize: ALPHABET_SIZE,

  /**
   * 生成一个随机字符
   */
  randomChar() {
    return this.alphabet[Math.floor(Math.random() * this.alphabetSize)];
  },

  /**
   * 计算期望尝试次数 K^L
   * @param {number} targetLen - 目标文本长度
   * @param {number} alphabetSize - 字母表大小
   */
  expectedAttempts(targetLen, alphabetSize) {
    return Math.pow(alphabetSize, targetLen);
  },

  /**
   * 格式化大数
   */
  formatBigNum(n) {
    if (n < 1000) return n.toLocaleString();
    if (n < 1e6) return (n / 1e3).toFixed(1) + ' 千';
    if (n < 1e9) return (n / 1e6).toFixed(1) + ' 百万';
    if (n < 1e12) return (n / 1e9).toFixed(2) + ' 亿';
    if (n < 1e15) return (n / 1e12).toFixed(2) + ' 万亿';
    const exp = Math.floor(Math.log10(n));
    const mantissa = n / Math.pow(10, exp);
    return mantissa.toFixed(2) + ' × 10^' + exp;
  },

  /**
   * 期望耗时（基于生成速度）
   * @param {number} expectedChars - 期望字符数 = L * K^L
   * @param {number} speed - 每秒生成字符数
   * @returns {string} 人类可读的等待时间
   */
  formatExpectedTime(expectedChars, speed) {
    const seconds = expectedChars / speed;
    if (seconds < 1) return '不到 1 秒';
    if (seconds < 60) return Math.round(seconds) + ' 秒';
    if (seconds < 3600) return Math.round(seconds / 60) + ' 分 ' + Math.round(seconds % 60) + ' 秒';
    if (seconds < 86400) return Math.round(seconds / 3600) + ' 小时 ' + Math.round((seconds % 3600) / 60) + ' 分';
    const days = seconds / 86400;
    if (days < 365) return Math.round(days) + ' 天';
    const years = days / 365;
    if (years < 1e6) return (years).toFixed(1) + ' 年';
    if (years < 1e9) return (years / 1e6).toFixed(1) + ' 百万年';
    return '约 ' + this.formatBigNum(years) + ' 年（远超宇宙年龄）';
  },

  /**
   * 校验并清洗目标文本
   */
  sanitizeTarget(text) {
    return text.toLowerCase().replace(/[^a-z ]/g, '').substring(0, 12);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
}
