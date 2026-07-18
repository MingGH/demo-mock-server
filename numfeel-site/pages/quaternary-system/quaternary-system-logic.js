/**
 * 四进制去哪了 - 核心逻辑（与 DOM 解耦的纯函数）
 *
 * 设计原则：
 * - 所有函数纯函数，不依赖 DOM、不依赖全局状态
 * - 使用 BigInt 处理大数，避免 Number 精度丢失（支持到 2^64-1）
 * - 模块底部条件导出，浏览器与 Node 测试皆可
 *
 * 运行测试：node pages/quaternary-system/quaternary-system.test.js
 */

var QuaternaryLogic = (function () {

  var MAX_VALUE = BigInt('18446744073709551615'); // 2^64 - 1
  var BASE_INFO = {
    2:  { bitsPerDigit: 1, label: '二进制', sub: '₂' },
    4:  { bitsPerDigit: 2, label: '四进制', sub: '₄' },
    8:  { bitsPerDigit: 3, label: '八进制', sub: '₈' },
    16: { bitsPerDigit: 4, label: '十六进制', sub: '₁₆' }
  };
  var HEX_DIGITS = '0123456789ABCDEF';

  /**
   * 严格校验十进制输入字符串，返回结构化结果。
   * 接受 0 到 2^64-1 的非负整数。拒绝空串、空白、小数、负数、字母、科学计数法、超范围值。
   * @param {string} raw 用户原始输入
   * @returns {{ok:true,value:BigInt}|{ok:false,error:string}}
   */
  function parseDecimalInput(raw) {
    if (raw === null || raw === undefined) {
      return { ok: false, error: '请输入一个十进制整数' };
    }
    var str = String(raw).trim();
    if (str === '') {
      return { ok: false, error: '输入不能为空' };
    }
    // 只允许纯数字字符，覆盖负号、小数点、字母、科学计数法
    if (!/^[0-9]+$/.test(str)) {
      return { ok: false, error: '只接受非负十进制整数，不支持小数、负数或字母' };
    }
    var value;
    try {
      value = BigInt(str);
    } catch (e) {
      return { ok: false, error: '无法解析这个数字' };
    }
    if (value < 0) {
      return { ok: false, error: '不接受负数' };
    }
    if (value > MAX_VALUE) {
      return { ok: false, error: '超过上限 2^64-1（18446744073709551615）' };
    }
    return { ok: true, value: value };
  }

  /**
   * 将 BigInt 转换为指定进制的字符串。
   * @param {BigInt} value 非负整数
   * @param {number} base 2 | 4 | 8 | 16
   * @returns {string} 进制字符串，十六进制输出大写
   */
  function toBase(value, base) {
    var v = BigInt(value);
    if (v < 0) throw new Error('toBase 不支持负数');
    if (v === 0n) return '0';
    var b = BigInt(base);
    var digits = [];
    while (v > 0n) {
      var rem = Number(v % b);
      digits.push(HEX_DIGITS[rem]);
      v = v / b;
    }
    digits.reverse();
    return digits.join('');
  }

  /**
   * 返回某进制下每位数字的位权展开（供解释展示）。
   * @param {BigInt} value
   * @param {number} base
   * @returns {Array<{digit:string,position:number,weight:BigInt,contribution:BigInt}>}
   */
  function getPositionalExpansion(value, base) {
    var str = toBase(value, base);
    var result = [];
    var b = BigInt(base);
    for (var i = 0; i < str.length; i++) {
      var position = str.length - 1 - i; // 从右起第几位
      var weight = b ** BigInt(position);
      var digitVal = BigInt(HEX_DIGITS.indexOf(str[i]));
      result.push({
        digit: str[i],
        position: position,
        weight: weight,
        contribution: digitVal * weight
      });
    }
    return result;
  }

  /**
   * 为分组补前导零，返回补零后的二进制字符串。
   * @param {string} binary 二进制字符串
   * @param {number} groupSize 2 | 3 | 4
   * @returns {string} 补零后的二进制字符串
   */
  function padBinaryForGroup(binary, groupSize) {
    var remainder = binary.length % groupSize;
    if (remainder === 0) return binary;
    var paddingNeeded = groupSize - remainder;
    var padding = '';
    for (var i = 0; i < paddingNeeded; i++) padding += '0';
    return padding + binary;
  }

  /**
   * 从右向左将二进制字符串按 groupSize 分组。
   * 返回补零信息和组数组。补零不改变数值。
   * @param {string} binary 二进制字符串（如 "11111101010"）
   * @param {number} groupSize 2 | 3 | 4
   * @returns {{groups:string[], paddedBinary:string, paddingAdded:number, originalBinary:string}}
   */
  function groupBinary(binary, groupSize) {
    if (!binary || binary.length === 0) {
      // 0 的二进制是 "0"，保证不返回空数组
      binary = '0';
    }
    var paddedBinary = padBinaryForGroup(binary, groupSize);
    var paddingAdded = paddedBinary.length - binary.length;
    var groups = [];
    for (var i = 0; i < paddedBinary.length; i += groupSize) {
      groups.push(paddedBinary.slice(i, i + groupSize));
    }
    return {
      groups: groups,
      paddedBinary: paddedBinary,
      paddingAdded: paddingAdded,
      originalBinary: binary
    };
  }

  /**
   * 将二进制分组转换为对应进制的数字字符。
   * @param {string[]} groups 分组数组（如 ["01","11"]）
   * @param {number} groupSize 2->四进制, 3->八进制, 4->十六进制
   * @returns {Array<{group:string,digit:string}>}
   */
  function binaryGroupsToDigits(groups, groupSize) {
    return groups.map(function (g) {
      var val = parseInt(g, 2);
      return { group: g, digit: HEX_DIGITS[val] };
    });
  }

  /**
   * 统一生成 2/4/8/16 进制的结果与长度。
   * @param {BigInt} value
   * @returns {{binary:{value:string,length:number},quaternary:{value:string,length:number},octal:{value:string,length:number},hexadecimal:{value:string,length:number}}}
   */
  function buildRepresentations(value) {
    var v = BigInt(value);
    return {
      binary:      { value: toBase(v, 2),  length: toBase(v, 2).length },
      quaternary:  { value: toBase(v, 4),  length: toBase(v, 4).length },
      octal:       { value: toBase(v, 8),  length: toBase(v, 8).length },
      hexadecimal: { value: toBase(v, 16), length: toBase(v, 16).length }
    };
  }

  /**
   * 计算表示固定 bit 宽度最多需要多少个数字。
   * 公式：ceil(bitWidth / log2(base))
   * @param {number} bitWidth 8 | 16 | 32 | 64
   * @param {number} base 2 | 4 | 8 | 16
   * @returns {number}
   */
  function digitsForBitWidth(bitWidth, base) {
    var bitsPerDigit = BASE_INFO[base].bitsPerDigit;
    return Math.ceil(bitWidth / bitsPerDigit);
  }

  /**
   * 构建分享文案，包含当前输入、各进制结果、结论和链接。
   * @param {BigInt} value
   * @param {object} representations buildRepresentations 返回值
   * @param {string} url 线上链接
   * @returns {string}
   */
  function buildShareText(value, representations, url) {
    var v = BigInt(value);
    var r = representations;
    var lines = [];
    lines.push('四进制去哪了？同一串二进制，换种分组看清楚：');
    lines.push('');
    lines.push('十进制：' + v.toString());
    lines.push('二进制：' + r.binary.value + '（' + r.binary.length + ' 位）');
    lines.push('四进制：' + r.quaternary.value + '（' + r.quaternary.length + ' 位）');
    lines.push('八进制：' + r.octal.value + '（' + r.octal.length + ' 位）');
    lines.push('十六进制：' + r.hexadecimal.value + '（' + r.hexadecimal.length + ' 位）');
    lines.push('');
    lines.push('四进制没有消失，它只是没有赢得一个足够独特的使用位置。');
    lines.push('');
    lines.push('亲手点一次合并，比看公式更快明白：');
    lines.push(url || 'https://numfeel.996.ninja/pages/quaternary-system/');
    return lines.join('\n');
  }

  // ── 导出 ──────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseDecimalInput: parseDecimalInput,
      toBase: toBase,
      getPositionalExpansion: getPositionalExpansion,
      padBinaryForGroup: padBinaryForGroup,
      groupBinary: groupBinary,
      binaryGroupsToDigits: binaryGroupsToDigits,
      buildRepresentations: buildRepresentations,
      digitsForBitWidth: digitsForBitWidth,
      buildShareText: buildShareText,
      MAX_VALUE: MAX_VALUE,
      BASE_INFO: BASE_INFO
    };
  }

  return {
    parseDecimalInput: parseDecimalInput,
    toBase: toBase,
    getPositionalExpansion: getPositionalExpansion,
    padBinaryForGroup: padBinaryForGroup,
    groupBinary: groupBinary,
    binaryGroupsToDigits: binaryGroupsToDigits,
    buildRepresentations: buildRepresentations,
    digitsForBitWidth: digitsForBitWidth,
    buildShareText: buildShareText,
    MAX_VALUE: MAX_VALUE,
    BASE_INFO: BASE_INFO
  };
})();
