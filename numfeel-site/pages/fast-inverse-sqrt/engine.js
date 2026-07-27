// ========== 平方根倒数速算法 - 核心算法（可独立测试） ==========
//
// 利用 IEEE 754 浮点数的二进制结构特性，通过位运算快速近似 1/√x。
// 1999 年 Quake III 源码中的黑魔法算法。
//
// 运行测试：node pages/fast-inverse-sqrt/fast-inverse-sqrt.test.js

// ── 共享缓冲区，用于浮点数 ↔ 整数的位级重解释 ──
var _buf = new ArrayBuffer(4);
var _f32 = new Float32Array(_buf);
var _i32 = new Int32Array(_buf);

// 魔法常数（Quake III 源码中的最优近似值）
var MAGIC_CONSTANT = 0x5f3759df;

/**
 * 将浮点数的二进制位模式重新解释为 32 位有符号整数
 * @param {number} x 输入浮点数
 * @returns {number} 整数表示
 */
function floatToInt(x) {
  _f32[0] = x;
  return _i32[0];
}

/**
 * 将 32 位整数的二进制位模式重新解释为浮点数
 * @param {number} n 输入整数
 * @returns {number} 浮点数表示
 */
function intToFloat(n) {
  _i32[0] = n;
  return _f32[0];
}

/**
 * 将 32 位整数补零为 32 位二进制字符串
 * @param {number} n 整数
 * @returns {string} 32 位二进制字符串
 */
function padBinary(n) {
  var bits = (n >>> 0).toString(2);
  while (bits.length < 32) bits = '0' + bits;
  return bits;
}

/**
 * 获取浮点数的 IEEE 754 结构分解
 * @param {number} x 输入浮点数
 * @returns {{sign:number, exponent:number, mantissa:number, binary:string, intVal:number, hex:string, floatVal:number}}
 */
function floatToIEEE754(x) {
  var i = floatToInt(x);
  var sign = (i >>> 31) & 1;
  var exponent = (i >>> 23) & 0xFF;
  var mantissa = i & 0x7FFFFF;
  return {
    sign: sign,
    exponent: exponent,
    mantissa: mantissa,
    binary: padBinary(i),
    intVal: i,
    hex: '0x' + (i >>> 0).toString(16),
    floatVal: x
  };
}

/**
 * 平方根倒数速算法 - 仅位运算步骤（无牛顿迭代）
 * 这是 Quake III 算法的核心：i = 0x5f3759df - (i >> 1)
 * @param {number} x 输入值（正浮点数）
 * @returns {number} 1/√x 的粗略近似值
 */
function fastInverseSqrtBitOnly(x) {
  _f32[0] = x;
  _i32[0] = MAGIC_CONSTANT - (_i32[0] >> 1);
  return _f32[0];
}

/**
 * 牛顿迭代步骤
 * 公式：y_new = y * (1.5 - 0.5 * x * y²)
 * @param {number} x 原始输入值
 * @param {number} y 当前近似值
 * @returns {number} 修正后的近似值
 */
function newtonStep(x, y) {
  var x2 = x * 0.5;
  return y * (1.5 - x2 * y * y);
}

/**
 * 完整的平方根倒数速算法
 * @param {number} x 输入值（正浮点数）
 * @param {number} [iterations=1] 牛顿迭代次数（0=仅位运算，1=默认，2=更精确）
 * @returns {number} 1/√x 的近似值
 */
function fastInverseSqrt(x, iterations) {
  iterations = iterations === undefined ? 1 : iterations;
  var y = fastInverseSqrtBitOnly(x);
  for (var i = 0; i < iterations; i++) {
    y = newtonStep(x, y);
  }
  return y;
}

/**
 * 精确的平方根倒数（用 Math.sqrt 作为基准）
 * @param {number} x 输入值
 * @returns {number} 精确的 1/√x
 */
function exactInverseSqrt(x) {
  return 1 / Math.sqrt(x);
}

/**
 * 计算相对误差（百分比）
 * @param {number} approx 近似值
 * @param {number} exact 精确值
 * @returns {number} 相对误差百分比
 */
function relativeError(approx, exact) {
  if (exact === 0) return 0;
  return Math.abs((approx - exact) / exact) * 100;
}

/**
 * 误差等级判定
 * @param {number} errPct 误差百分比
 * @returns {string} 等级标签
 */
function errorLevel(errPct) {
  if (errPct < 0.01) return 'perfect';
  if (errPct < 0.1) return 'excellent';
  if (errPct < 1) return 'good';
  return 'poor';
}

/**
 * 分解算法每一步的详细数据，用于可视化
 * @param {number} x 输入值
 * @returns {Array} 步骤数组，每步含 title/value/intVal/binary/hex/description
 */
function decomposeSteps(x) {
  var steps = [];

  // Step 0: 原始浮点数
  var ieee = floatToIEEE754(x);
  steps.push({
    step: 0,
    title: '输入浮点数 x',
    floatVal: x,
    intVal: ieee.intVal,
    binary: ieee.binary,
    hex: ieee.hex,
    description: '将 x 存入 32 位浮点寄存器，其二进制遵循 IEEE 754 标准'
  });

  // Step 1: 将浮点位模式重解释为整数
  var intVal = floatToInt(x);
  steps.push({
    step: 1,
    title: '将浮点数按位解释为整数 i',
    floatVal: x,
    intVal: intVal,
    binary: padBinary(intVal),
    hex: '0x' + (intVal >>> 0).toString(16),
    description: 'i = *(long*)&x  // 将同一段内存按整数读取，位模式不变'
  });

  // Step 2: 右移一位
  var shifted = intVal >> 1;
  steps.push({
    step: 2,
    title: 'i 右移一位 (i >> 1)',
    floatVal: intToFloat(shifted),
    intVal: shifted,
    binary: padBinary(shifted),
    hex: '0x' + (shifted >>> 0).toString(16),
    description: '右移近似于将指数除以 2（对应 √x），但需要修正偏差'
  });

  // Step 3: 魔法常数减去移位结果
  var result = MAGIC_CONSTANT - shifted;
  steps.push({
    step: 3,
    title: '魔法常数减去移位结果',
    floatVal: intToFloat(result),
    intVal: result,
    binary: padBinary(result),
    hex: '0x' + (result >>> 0).toString(16),
    description: 'i = 0x5f3759df - (i >> 1)  // 这一步完成了对数域的近似'
  });

  // Step 4: 将整数重新解释为浮点数
  var approx = intToFloat(result);
  var errBit = relativeError(approx, exactInverseSqrt(x));
  steps.push({
    step: 4,
    title: '将结果按位解释回浮点数 y',
    floatVal: approx,
    intVal: result,
    binary: padBinary(result),
    hex: '0x' + (result >>> 0).toString(16),
    description: 'y = *(float*)&i  // 得到 1/√x 的初始近似值，误差约 ' + errBit.toFixed(3) + '%'
  });

  // Step 5: 牛顿迭代
  var x2 = x * 0.5;
  var yNew = approx * (1.5 - x2 * approx * approx);
  var errNew = relativeError(yNew, exactInverseSqrt(x));
  steps.push({
    step: 5,
    title: '牛顿迭代修正',
    floatVal: yNew,
    intVal: floatToInt(yNew),
    binary: padBinary(floatToInt(yNew)),
    hex: '0x' + (floatToInt(yNew) >>> 0).toString(16),
    description: 'y = y * (1.5 - 0.5 * x * y²)  // 一次迭代后误差降至 ' + errNew.toFixed(4) + '%'
  });

  return steps;
}

/**
 * 批量计算指定范围内各 x 值的误差
 * @param {number} minX 范围下界
 * @param {number} maxX 范围上界
 * @param {number} count 采样点数
 * @param {number} iterations 牛顿迭代次数
 * @returns {Array} {{x:number, error:number, approx:number, exact:number}}
 */
function batchAccuracy(minX, maxX, count, iterations) {
  var results = [];
  var step = (maxX - minX) / count;
  for (var i = 0; i < count; i++) {
    var x = minX + step * (i + 0.5);
    var approx = fastInverseSqrt(x, iterations);
    var exact = exactInverseSqrt(x);
    results.push({
      x: x,
      error: relativeError(approx, exact),
      approx: approx,
      exact: exact
    });
  }
  return results;
}

/**
 * 探索不同魔法常数下的最大误差
 * @param {number} constantHex 待测魔法常数
 * @param {number} count 采样点数
 * @returns {{maxError:number, avgError:number, samples:Array}}
 */
function evaluateConstant(constantHex, count) {
  count = count || 200;
  var maxError = 0;
  var sumError = 0;
  var samples = [];
  // 在对数均匀分布的范围内采样
  for (var i = 0; i < count; i++) {
    var x = Math.pow(10, -3 + 6 * i / (count - 1)); // 0.001 ~ 1000
    _f32[0] = x;
    _i32[0] = constantHex - (_i32[0] >> 1);
    var y = _f32[0];
    y = newtonStep(x, y);
    var err = relativeError(y, exactInverseSqrt(x));
    if (err > maxError) maxError = err;
    sumError += err;
    samples.push({ x: x, error: err });
  }
  return {
    maxError: maxError,
    avgError: sumError / count,
    samples: samples
  };
}

/**
 * 在魔法常数附近扫描，返回各常数的最大误差
 * @param {number} center 中心常数
 * @param {number} range 扫描范围（±）
 * @returns {Array} {{offset:number, constant:number, maxError:number}}
 */
function scanConstants(center, range) {
  range = range || 256;
  var results = [];
  for (var off = -range; off <= range; off += 4) {
    var c = center + off;
    var evalResult = evaluateConstant(c, 100);
    results.push({
      offset: off,
      constant: c,
      maxError: evalResult.maxError
    });
  }
  return results;
}

/**
 * 格式化十六进制
 * @param {number} n 整数
 * @returns {string} 十六进制字符串
 */
function formatHex(n) {
  return '0x' + (n >>> 0).toString(16);
}

/**
 * 格式化为带空格分组的 32 位二进制
 * 格式: S EEEEEEEE MMMMMMMMMMMMMMMMMMMMMMM
 * @param {number} n 整数
 * @returns {string} 分组二进制字符串
 */
function formatBinaryGrouped(n) {
  var bits = padBinary(n);
  return bits.slice(0, 1) + ' ' + bits.slice(1, 9) + ' ' + bits.slice(9);
}

/**
 * 格式化数值为简洁字符串
 * @param {number} v 数值
 * @param {number} [digits=6] 小数位数
 * @returns {string}
 */
function formatValue(v, digits) {
  digits = digits === undefined ? 6 : digits;
  if (Math.abs(v) < 0.0001 && v !== 0) {
    return v.toExponential(digits);
  }
  if (Math.abs(v) >= 1000000) {
    return v.toExponential(digits);
  }
  return parseFloat(v.toFixed(digits)).toString();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAGIC_CONSTANT: MAGIC_CONSTANT,
    floatToInt: floatToInt,
    intToFloat: intToFloat,
    padBinary: padBinary,
    floatToIEEE754: floatToIEEE754,
    fastInverseSqrtBitOnly: fastInverseSqrtBitOnly,
    newtonStep: newtonStep,
    fastInverseSqrt: fastInverseSqrt,
    exactInverseSqrt: exactInverseSqrt,
    relativeError: relativeError,
    errorLevel: errorLevel,
    decomposeSteps: decomposeSteps,
    batchAccuracy: batchAccuracy,
    evaluateConstant: evaluateConstant,
    scanConstants: scanConstants,
    formatHex: formatHex,
    formatBinaryGrouped: formatBinaryGrouped,
    formatValue: formatValue
  };
}
