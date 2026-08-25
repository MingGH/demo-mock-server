// ── 压缩极限 Demo：纯逻辑引擎 ──
// 无 DOM、无第三方依赖，可被浏览器 <script> 与 Node 测试共同使用。

/**
 * gzip 每层叠加的固定开销：10 字节文件头 + 8 字节校验尾。
 * 对压不动的数据，每过一层至少胖这么多（实际含存储块记账约 20~40 字节）。
 * @type {number}
 */
var GZIP_OVERHEAD_BYTES = 18;

/**
 * 计算字节流的香农熵，单位 bits/byte（0 ~ 8）。
 * 熵逼近 8 意味着字节分布接近均匀随机，几乎没有可榨取的冗余。
 * @param {Array<number>|Uint8Array} bytes 输入字节流
 * @returns {number} 熵值
 */
function entropyBitsPerByte(bytes) {
  var freq = new Array(256);
  var i;
  for (i = 0; i < 256; i++) freq[i] = 0;
  var n = bytes.length;
  if (n === 0) return 0;
  for (i = 0; i < n; i++) freq[bytes[i]]++;
  var h = 0;
  for (i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      var p = freq[i] / n;
      h -= p * Math.log(p) / Math.LN2;
    }
  }
  return h;
}

/**
 * 千分位格式化整数。
 * @param {number} n 整数
 * @returns {string} 如 "9,216"
 */
function formatInt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 人类可读的字节数（B / KB / MB）。
 * @param {number} n 字节数
 * @returns {string} 如 "64.0 KB"
 */
function formatBytes(n) {
  if (n < 1024) return formatInt(n) + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 相对变化百分比，保留 2 位小数。to 比 from 小为负数。
 * @param {number} from 原大小
 * @param {number} to 新大小
 * @returns {number} 如 -56.77
 */
function pctChange(from, to) {
  if (from === 0) return 0;
  return Math.round((to - from) / from * 10000) / 100;
}

/**
 * 带符号百分比文本：绝对值 >= 1 用 1 位小数，否则用 2 位小数。
 * @param {number} v pctChange 的返回值
 * @returns {string} 如 "-56.8%"、"+0.05%"
 */
function formatPct(v) {
  var sign = v > 0 ? '+' : '';
  if (v !== 0 && Math.abs(v) < 1) return sign + v.toFixed(2) + '%';
  return sign + v.toFixed(1) + '%';
}

/**
 * 十六进制转储：返回 rows 行、每行 16 字节的 hexdump 文本数组。
 * 每行格式：`00000000  89 50 4e 47 ...  |..PNG....|`
 * @param {Array<number>|Uint8Array} bytes 字节流
 * @param {number} rows 行数
 * @returns {Array<string>} hexdump 行
 */
function hexdumpLines(bytes, rows) {
  var lines = [];
  var count = Math.min(rows * 16, bytes.length);
  var off;
  for (off = 0; off < count; off += 16) {
    var hexParts = [];
    var asciiParts = [];
    var i;
    for (i = 0; i < 16; i++) {
      var idx = off + i;
      if (idx < count) {
        var b = bytes[idx];
        hexParts.push((b < 16 ? '0' : '') + b.toString(16));
        asciiParts.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
      } else {
        hexParts.push('  ');
        asciiParts.push(' ');
      }
    }
    var offset = ('00000000' + off.toString(16)).slice(-8);
    lines.push(offset + '  ' + hexParts.join(' ') + '  |' + asciiParts.join('') + '|');
  }
  return lines;
}

/**
 * 统计从后往前连续「变大」的轮数（用于判定「压不动了」）。
 * @param {Array<Object>} history 每轮记录，含 size 字段（history[0] 为原始文件）
 * @returns {number} 连续膨胀的轮数
 */
function consecutiveGrowthRounds(history) {
  var count = 0;
  var i;
  for (i = history.length - 1; i > 0; i--) {
    if (history[i].size > history[i - 1].size) count++;
    else break;
  }
  return count;
}

/**
 * 鸽笼原理计数：把 inBytes 字节空间的全部可能文件，映射进 outBytes 字节的空间。
 * inputCount / slotCount / minCollisions 超出浮点安全范围时为 null，用 pow2Label 展示。
 * @param {number} inBytes 输入文件字节数
 * @param {number} outBytes 输出文件字节数
 * @returns {Object} { inputBits, slotBits, inputCount, slotCount, minCollisions }
 */
function pigeonholeStats(inBytes, outBytes) {
  var inputBits = 8 * inBytes;
  var slotBits = 8 * outBytes;
  var safe = inputBits <= 53 && slotBits <= 53;
  return {
    inputBits: inputBits,
    slotBits: slotBits,
    inputCount: safe ? Math.pow(2, inputBits) : null,
    slotCount: safe ? Math.pow(2, slotBits) : null,
    minCollisions: safe ? Math.pow(2, inputBits) - Math.pow(2, slotBits) : null
  };
}

/**
 * 2^bits 的可读文本：bits <= 53 直接给数字，否则给 "2^N" 形式。
 * @param {number} bits 指数
 * @returns {string} 如 "65,536" 或 "2^73,728"
 */
function pow2Label(bits) {
  if (bits <= 53) return formatInt(Math.pow(2, bits));
  return '2^' + formatInt(bits);
}

/**
 * 确定性伪随机字节（xorshift32），用于可复现测试。
 * seed 必须非零。
 * @param {number} n 字节数
 * @param {number} seed 非零种子
 * @returns {Array<number>} n 个随机字节
 */
function mulberry32Bytes(n, seed) {
  var s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  var out = [];
  var i;
  for (i = 0; i < n; i++) {
    s ^= (s << 13) >>> 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0;
    out.push((s ^ (s >>> 16)) & 0xff);
  }
  return out;
}

// 浏览器全局命名空间（Node 端走 module.exports，此变量不外泄）
var CE = {
  entropyBitsPerByte: entropyBitsPerByte,
  formatInt: formatInt,
  formatBytes: formatBytes,
  pctChange: pctChange,
  formatPct: formatPct,
  hexdumpLines: hexdumpLines,
  consecutiveGrowthRounds: consecutiveGrowthRounds,
  pigeonholeStats: pigeonholeStats,
  pow2Label: pow2Label,
  mulberry32Bytes: mulberry32Bytes,
  GZIP_OVERHEAD_BYTES: GZIP_OVERHEAD_BYTES
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    entropyBitsPerByte: entropyBitsPerByte,
    formatInt: formatInt,
    formatBytes: formatBytes,
    pctChange: pctChange,
    formatPct: formatPct,
    hexdumpLines: hexdumpLines,
    consecutiveGrowthRounds: consecutiveGrowthRounds,
    pigeonholeStats: pigeonholeStats,
    pow2Label: pow2Label,
    mulberry32Bytes: mulberry32Bytes,
    GZIP_OVERHEAD_BYTES: GZIP_OVERHEAD_BYTES
  };
}
