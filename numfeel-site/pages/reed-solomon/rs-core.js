/**
 * rs-core.js - 里德-所罗门纠错码核心算法
 *
 * 纯数学模块，不依赖 DOM，可被 node 直接 require 测试。
 * 实现 GF(256) 伽罗瓦域运算 + RS 擦除恢复（erasure decoding）。
 *
 * RS 码核心思想：把数据符号看作多项式系数，在有限域上求值生成校验符号。
 * 只要丢失的符号数不超过校验数，就能通过解线性方程组完整恢复。
 */

// ────────────────────────────────────────────────────────────
// 一、GF(256) 伽罗瓦域运算
// ────────────────────────────────────────────────────────────

// 使用标准 AES 不可约多项式：x^8 + x^4 + x^3 + x + 1 = 0x11B
var PRIMITIVE_POLY = 0x11B;
var GENERATOR = 0x03; // 生成元 3

// 预计算对数表和指数表
var expTable = new Array(512); // 指数表（512 避免取模）
var logTable = new Array(256); // 对数表

(function initTables() {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    expTable[i] = x;
    logTable[x] = i;
    // 乘以生成元 3：3 = 2 + 1，所以 x*3 = x*2 ^ x
    // x*2：左移一位，若超出 8 位则约简
    var prev = x;
    var hi = x & 0x80;
    x = (x << 1) & 0xFF;
    if (hi) x ^= 0x1B; // 0x11B & 0xFF = 0x1B
    x ^= prev; // x*3 = x*2 ^ x
  }
  // 复制前 255 项到后半部分，避免取模运算
  for (var j = 255; j < 512; j++) {
    expTable[j] = expTable[j - 255];
  }
})();

/**
 * GF(256) 加法（异或）
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gfAdd(a, b) {
  return a ^ b;
}

/**
 * GF(256) 乘法
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return expTable[logTable[a] + logTable[b]];
}

/**
 * GF(256) 幂运算 a^n
 * @param {number} a 底数
 * @param {number} n 指数
 * @returns {number}
 */
function gfPow(a, n) {
  if (n === 0) return 1;
  if (a === 0) return 0;
  return expTable[(logTable[a] * n) % 255];
}

/**
 * GF(256) 逆元（乘法逆）
 * @param {number} a
 * @returns {number} a 的逆元，使 a * inv(a) = 1
 */
function gfInv(a) {
  if (a === 0) throw new Error('0 没有逆元');
  return expTable[255 - logTable[a]];
}

/**
 * GF(256) 除法 a / b
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gfDiv(a, b) {
  if (b === 0) throw new Error('除数为 0');
  if (a === 0) return 0;
  return expTable[(logTable[a] - logTable[b] + 255) % 255];
}

// ────────────────────────────────────────────────────────────
// 二、多项式运算（系数在 GF(256) 中）
// ────────────────────────────────────────────────────────────

/**
 * 多项式乘法（GF(256) 系数）
 * @param {number[]} p1
 * @param {number[]} p2
 * @returns {number[]} 乘积多项式
 */
function polyMul(p1, p2) {
  var result = new Array(p1.length + p2.length - 1).fill(0);
  for (var i = 0; i < p1.length; i++) {
    for (var j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

/**
 * 多项式求值：在点 x 处计算多项式 poly 的值（Horner 法）
 * @param {number[]} poly 系数数组（高位在前）
 * @param {number} x 求值点
 * @returns {number}
 */
function polyEval(poly, x) {
  var result = 0;
  for (var i = 0; i < poly.length; i++) {
    result = gfAdd(gfMul(result, x), poly[i]);
  }
  return result;
}

/**
 * 生成 RS 编码生成多项式 g(x) = (x - α^0)(x - α^1)...(x - α^(nParity-1))
 * @param {number} nParity 校验符号数
 * @returns {number[]} 生成多项式系数
 */
function genGeneratorPoly(nParity) {
  var g = [1];
  for (var i = 0; i < nParity; i++) {
    g = polyMul(g, [1, gfPow(GENERATOR, i)]);
  }
  return g;
}

// ────────────────────────────────────────────────────────────
// 三、RS 编码
// ────────────────────────────────────────────────────────────

/**
 * RS 编码：在数据符号后追加校验符号
 *
 * 原理：把 data 看作多项式 D(x)，计算 D(x) * x^nParity mod g(x)，
 * 余式即为校验符号。拼接 data + parity 后，整条码字是 g(x) 的倍式。
 *
 * @param {number[]} data 数据符号数组（每个值 0-255）
 * @param {number} nParity 校验符号数
 * @returns {number[]} 完整码字 = data + parity
 */
function rsEncode(data, nParity) {
  if (nParity <= 0) return data.slice();
  if (nParity > 255) throw new Error('校验数不能超过 255');

  var genPoly = genGeneratorPoly(nParity);
  // 在数据后补 nParity 个 0，做多项式除法取余
  var padded = data.slice();
  for (var i = 0; i < nParity; i++) padded.push(0);

  // 多项式除法（综合除法），取余式
  for (var j = 0; j < data.length; j++) {
    var coef = padded[j];
    if (coef === 0) continue;
    for (var k = 1; k < genPoly.length; k++) {
      padded[j + k] ^= gfMul(genPoly[k], coef);
    }
  }

  // 余式在最后 nParity 个位置
  var parity = padded.slice(data.length);
  return data.concat(parity);
}

// ────────────────────────────────────────────────────────────
// 四、RS 擦除恢复（erasure decoding）
// ────────────────────────────────────────────────────────────

/**
 * RS 擦除恢复：已知丢失位置，从剩余符号恢复原始数据
 *
 * 擦除恢复比一般纠错简单：位置已知，只需解线性方程组。
 *
 * 码字 c(x) = data(x) * x^nParity + parity(x) 是 g(x) 的倍式，
 * 即 c(α^i) = 0 (i=0..nParity-1)。
 * 把已知符号和未知符号分开，得到关于未知量的线性方程组，用高斯消元求解。
 *
 * @param {number[]} codeword 完整码字（含可能的擦除，被擦除位置用 null 表示）
 * @param {number[]} erasurePos 被擦除的位置索引数组
 * @param {number} nParity 校验符号数
 * @returns {{success:boolean, recovered:number[]|null}} 恢复结果
 */
function rsEraseDecode(codeword, erasurePos, nParity) {
  var n = codeword.length;
  var nErased = erasurePos.length;

  // 超过校验数，无法恢复
  if (nErased > nParity) {
    return { success: false, recovered: null };
  }
  // 没有擦除，直接返回
  if (nErased === 0) {
    return { success: true, recovered: codeword.slice() };
  }

  // 构建 nParity 个校验方程：c(α^i) = 0, i=0..nParity-1
  // 码字多项式高位在前：c(x) = c[0]*x^(n-1) + c[1]*x^(n-2) + ... + c[n-1]
  // 所以 c(α^row) = sum_{col=0}^{n-1} c[col] * (α^row)^(n-1-col)
  // 已知项移到右边，未知项留在左边

  var erasedSet = {};
  for (var e = 0; e < erasurePos.length; e++) {
    erasedSet[erasurePos[e]] = true;
  }

  // 取前 nParity 个方程（足够解 nErased 个未知数）
  var matrix = []; // 系数矩阵 [nParity][nErased]
  var rhs = [];    // 右边常数向量 [nParity]

  for (var row = 0; row < nParity; row++) {
    var alphaPow = gfPow(GENERATOR, row); // α^row
    var coefRow = new Array(nErased).fill(0);
    var sum = 0;

    for (var col = 0; col < n; col++) {
      var contribution = gfPow(alphaPow, n - 1 - col); // (α^row)^(n-1-col)
      if (erasedSet[col]) {
        // 未知项，放系数矩阵
        var eraseIdx = erasurePos.indexOf(col);
        coefRow[eraseIdx] = contribution;
      } else {
        // 已知项，移到右边
        sum ^= gfMul(codeword[col], contribution);
      }
    }

    matrix.push(coefRow);
    rhs.push(sum);
  }

  // 高斯消元解 nErased 个未知数
  var solution = gaussianElimination(matrix, rhs, nErased);
  if (!solution) {
    return { success: false, recovered: null };
  }

  // 填入恢复值
  var recovered = codeword.slice();
  for (var s = 0; s < erasurePos.length; s++) {
    recovered[erasurePos[s]] = solution[s];
  }

  // 验证：恢复后所有校验方程应为 0
  for (var v = 0; v < nParity; v++) {
    var checkPow = gfPow(GENERATOR, v);
    var val = 0;
    for (var c = 0; c < n; c++) {
      val ^= gfMul(recovered[c], gfPow(checkPow, n - 1 - c));
    }
    if (val !== 0) {
      return { success: false, recovered: null };
    }
  }

  return { success: true, recovered: recovered };
}

/**
 * GF(256) 上的高斯消元
 * @param {number[][]} matrix 系数矩阵
 * @param {number[]} rhs 右边向量
 * @param {number} n 未知数个数
 * @returns {number[]|null} 解向量，失败返回 null
 */
function gaussianElimination(matrix, rhs, n) {
  // 复制，避免修改原数组
  var m = matrix.map(function (row) { return row.slice(); });
  var b = rhs.slice();

  // 前向消元
  for (var col = 0; col < n; col++) {
    // 找主元
    var pivot = -1;
    for (var row = col; row < m.length; row++) {
      if (m[row][col] !== 0) {
        pivot = row;
        break;
      }
    }
    if (pivot === -1) return null; // 奇异矩阵

    // 交换行
    if (pivot !== col) {
      var tmpRow = m[col]; m[col] = m[pivot]; m[pivot] = tmpRow;
      var tmpRhs = b[col]; b[col] = b[pivot]; b[pivot] = tmpRhs;
    }

    // 消元
    var pivotInv = gfInv(m[col][col]);
    for (var row2 = 0; row2 < m.length; row2++) {
      if (row2 === col || m[row2][col] === 0) continue;
      var factor = gfMul(m[row2][col], pivotInv);
      for (var c2 = col; c2 < n; c2++) {
        m[row2][c2] ^= gfMul(factor, m[col][c2]);
      }
      b[row2] ^= gfMul(factor, b[col]);
    }
  }

  // 回代
  var solution = new Array(n).fill(0);
  for (var i = 0; i < n; i++) {
    if (m[i][i] === 0) return null;
    solution[i] = gfMul(b[i], gfInv(m[i][i]));
  }

  return solution;
}

// ────────────────────────────────────────────────────────────
// 五、文本 <-> 符号数组转换（给 app.js 用）
// ────────────────────────────────────────────────────────────

/**
 * 把文本字符串转换为 GF(256) 符号数组（UTF-8 字节）
 * @param {string} text
 * @returns {number[]}
 */
function textToSymbols(text) {
  var bytes = [];
  if (typeof TextEncoder !== 'undefined') {
    var encoder = new TextEncoder();
    var arr = encoder.encode(text);
    for (var i = 0; i < arr.length; i++) bytes.push(arr[i]);
  } else {
    // Node 环境兜底
    var buf = Buffer.from(text, 'utf-8');
    for (var j = 0; j < buf.length; j++) bytes.push(buf[j]);
  }
  return bytes;
}

/**
 * 把 GF(256) 符号数组还原为文本字符串
 * @param {number[]} symbols
 * @returns {string}
 */
function symbolsToText(symbols) {
  if (typeof TextDecoder !== 'undefined') {
    var u8 = new Uint8Array(symbols);
    return new TextDecoder('utf-8').decode(u8);
  }
  return Buffer.from(symbols).toString('utf-8');
}

/**
 * 把符号数组格式化为十六进制字符串（展示用）
 * @param {number[]} symbols
 * @returns {string}
 */
function symbolsToHex(symbols) {
  return symbols.map(function (s) {
    return (s < 16 ? '0' : '') + s.toString(16).toUpperCase();
  }).join(' ');
}

// ────────────────────────────────────────────────────────────
// 六、阈值实验数据计算
// ────────────────────────────────────────────────────────────

/**
 * 计算给定冗余比例和损坏比例下的恢复成功率
 *
 * 确定性模型：RS 擦除恢复的严格条件是 丢失数 <= 校验数。
 * 对应到比例：损坏比例 <= 冗余比例 -> 100% 成功（含边界相等）
 * 损坏比例 > 冗余比例 -> 0% 成功（阈值效应）
 * 与动手演示的擦除恢复口径一致：擦除数等于校验数时仍可恢复。
 *
 * @param {number} redundancyRatio 冗余比例 (0-1)
 * @param {number} damageRatio 损坏比例 (0-1)
 * @returns {number} 恢复成功率 0 或 1
 */
function recoveryRate(redundancyRatio, damageRatio) {
  // 加极小 epsilon 抵消浮点误差，保证「损坏率恰等于冗余率」时判定为成功
  return damageRatio <= redundancyRatio + 1e-9 ? 1.0 : 0.0;
}

/**
 * 生成阈值实验图表数据
 * @param {number} redundancyRatio 冗余比例 (0-1)
 * @param {number} points 采样点数
 * @returns {{labels:number[], data:number[]}}
 */
function thresholdCurve(redundancyRatio, points) {
  points = points || 50;
  var labels = [];
  var data = [];
  for (var i = 0; i <= points; i++) {
    var damage = i / points;
    labels.push(Math.round(damage * 100) + '%');
    data.push(recoveryRate(redundancyRatio, damage));
  }
  return { labels: labels, data: data };
}

// ────────────────────────────────────────────────────────────
// 七、导出
// ────────────────────────────────────────────────────────────

var api = {
  // GF(256) 运算
  gfAdd: gfAdd,
  gfMul: gfMul,
  gfPow: gfPow,
  gfInv: gfInv,
  gfDiv: gfDiv,
  // 多项式运算
  polyMul: polyMul,
  polyEval: polyEval,
  genGeneratorPoly: genGeneratorPoly,
  // 编解码
  rsEncode: rsEncode,
  rsEraseDecode: rsEraseDecode,
  // 文本转换
  textToSymbols: textToSymbols,
  symbolsToText: symbolsToText,
  symbolsToHex: symbolsToHex,
  // 阈值实验
  recoveryRate: recoveryRate,
  thresholdCurve: thresholdCurve,
  // 常量
  PRIMITIVE_POLY: PRIMITIVE_POLY,
  GENERATOR: GENERATOR,
};

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
// 浏览器环境挂到 window
if (typeof window !== 'undefined') {
  window.RSCore = api;
}
