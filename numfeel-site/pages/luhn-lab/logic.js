// ========== Luhn 校验算法 · 纯逻辑层 ==========
// 所有函数与 DOM 无关，可在浏览器与 Node 中直接运行（Node 跑单测见 logic.test.js）。

/**
 * 去掉卡号里的空格、短横线等分隔符，只保留数字。
 * @param {string} input 原始输入
 * @returns {string|null} 纯数字字符串；若含非数字字符返回 null
 */
function normalizeDigits(input) {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s-]+/g, '');
  if (!/^\d+$/.test(digits)) return null;
  return digits;
}

/**
 * 计算一串数字的 Luhn 校验和（从右往左：第 1 位（含校验位）不加倍，
 * 第 2 位加倍，超过 9 减 9……）。
 * @param {string|number[]} digits 纯数字字符串或数字数组
 * @returns {number} 校验和
 */
function luhnSum(digits) {
  const arr = typeof digits === 'string' ? Array.from(digits).map(Number) : digits;
  let sum = 0;
  // 从右往左，索引从 0 开始，偶数位置（从右起第 1、3、5…位）不加倍
  for (let i = arr.length - 1; i >= 0; i--) {
    const fromRight = arr.length - i; // 从右数第几位，从 1 开始
    let d = arr[i];
    if (fromRight % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum;
}

/**
 * Luhn 校验：校验和必须能被 10 整除。
 * 只接受数字（空格/横线会自动忽略），非数字返回 false。
 * @param {string} input 卡号
 * @returns {boolean} 是否通过校验
 */
function luhnCheck(input) {
  const digits = normalizeDigits(input);
  if (!digits || digits.length < 2) return false;
  return luhnSum(digits) % 10 === 0;
}

/**
 * 计算给定前缀对应的校验位（0-9），使"前缀 + 校验位"通过 Luhn 校验。
 * @param {string|number[]} prefix 不含校验位的前缀数字
 * @returns {number} 校验位 0-9
 */
function luhnCheckDigit(prefix) {
  const arr = typeof prefix === 'string' ? Array.from(prefix).map(Number) : prefix.slice();
  // 把校验位暂看作 0，算校验和，再补成 10 的倍数
  const sum = luhnSum(arr.concat([0]));
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit;
}

/**
 * 由前缀补全成一张通过校验的完整卡号（字符串形式）。
 * @param {string} prefix 前缀（数字，可含空格/横线）
 * @returns {string|null} 完整卡号；前缀非法返回 null
 */
function completeNumber(prefix) {
  const digits = normalizeDigits(prefix);
  if (!digits) return null;
  const check = luhnCheckDigit(digits);
  return digits + check;
}

/**
 * 把一串数字按 4 位一组加空格（如 4242 4242 4242 4242）。
 * 非数字原样返回。
 * @param {string} input
 * @returns {string}
 */
function formatCardNumber(input) {
  const digits = normalizeDigits(input);
  if (!digits) return input;
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * Luhn 分步计算明细（供"亲手算一遍"动画使用）。
 * @param {string} input 卡号
 * @returns {null | {sum:number, valid:boolean, steps:Array<{digit:number, fromRight:number, doubled:boolean, raw:number, transformed:number}>}}
 *          非数字输入返回 null；steps 从右往左排列（fromRight=1 在最前）。
 */
function luhnSteps(input) {
  const digits = normalizeDigits(input);
  if (!digits || digits.length < 2) return null;
  const arr = Array.from(digits).map(Number);
  const steps = [];
  let sum = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    const fromRight = arr.length - i;
    const digit = arr[i];
    const doubled = fromRight % 2 === 0;
    let raw = digit;
    if (doubled) raw = digit * 2;
    const transformed = raw > 9 ? raw - 9 : raw;
    sum += transformed;
    steps.push({ digit, fromRight, doubled, raw, transformed });
  }
  return { sum, valid: sum % 10 === 0, steps };
}

/**
 * 卡组织识别（BIN 前缀表，简化但常见的几类）。
 * @param {string} input 卡号
 * @returns {null | {code:string, name:string, prefix:string, lengths:number[]}}
 */
function detectCardType(input) {
  const digits = normalizeDigits(input);
  if (!digits || digits.length < 2) return null;
  const n = digits;

  if (/^4/.test(n)) {
    return { code: 'visa', name: 'Visa', prefix: '4', lengths: [13, 16, 19] };
  }
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(n)) {
    return { code: 'mastercard', name: 'Mastercard', prefix: '51-55 / 2221-2720', lengths: [16] };
  }
  if (/^(34|37)/.test(n)) {
    return { code: 'amex', name: 'American Express', prefix: '34 / 37', lengths: [15] };
  }
  if (/^62/.test(n)) {
    return { code: 'unionpay', name: '银联 UnionPay', prefix: '62', lengths: [16, 17, 18, 19] };
  }
  if (/^(6011|65|64[4-9]|622(12[6-9]|1[3-9]\d|[2-8]\d{2}|9[01]\d|92[0-5]))/.test(n)) {
    return { code: 'discover', name: 'Discover', prefix: '6011 / 65 / 644-649', lengths: [16, 19] };
  }
  if (/^(352[89]|35[3-8]\d)/.test(n)) {
    return { code: 'jcb', name: 'JCB', prefix: '3528-3589', lengths: [16, 17, 18, 19] };
  }
  if (/^(30[0-5]|36|3[89])/.test(n)) {
    return { code: 'diners', name: 'Diners Club', prefix: '300-305 / 36 / 38-39', lengths: [14] };
  }
  return null;
}

// 导出供 Node 测试
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeDigits,
    luhnSum,
    luhnCheck,
    luhnCheckDigit,
    completeNumber,
    formatCardNumber,
    luhnSteps,
    detectCardType
  };
}
