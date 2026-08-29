/**
 * Arnold 猫变换（Arnold's Cat Map）核心逻辑
 *
 * 变换矩阵 A = [[1, 1], [1, 2]]，作用在 N×N 图像的像素坐标上：
 *   前向: (x', y') = ((x + y) mod N, (x + 2y) mod N)
 *   逆向: (x, y)  = ((2x' - y') mod N, (-x' + y') mod N)
 *
 * 由于 det(A) = 1，变换是模 N 环上的双射：像素只换位置、不增不减。
 * 且有限置换必循环：存在周期 T，迭代 T 次后图像原样复原。
 */

/**
 * 构建前向置乱映射表
 * map[i] = 像素 i 在变换后要去的新位置（一维索引）
 * @param {number} size 方形图像边长 N
 * @returns {Uint32Array} 长度为 size*size 的映射表
 */
function buildForwardMap(size) {
  var map = new Uint32Array(size * size);
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var nx = (x + y) % size;
      var ny = (x + 2 * y) % size;
      map[y * size + x] = ny * size + nx;
    }
  }
  return map;
}

/**
 * 构建逆向映射表（一次变换即可从任意置乱状态还原）
 * @param {number} size 方形图像边长 N
 * @returns {Uint32Array} 长度为 size*size 的映射表
 */
function buildInverseMap(size) {
  var map = new Uint32Array(size * size);
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var ox = (2 * x - y) % size;
      if (ox < 0) ox += size;
      var oy = (-x + y) % size;
      if (oy < 0) oy += size;
      map[y * size + x] = oy * size + ox;
    }
  }
  return map;
}

/**
 * 按映射表重排 RGBA 像素（map[i] 是像素 i 的新位置）
 * @param {Uint8ClampedArray} rgba 长度为 size*size*4 的 RGBA 像素
 * @param {Uint32Array} map 映射表
 * @param {number} size 方形图像边长 N
 * @returns {Uint8ClampedArray} 重排后的新像素数组
 */
function applyMap(rgba, map, size) {
  var n = size * size;
  var out = new Uint8ClampedArray(rgba.length);
  for (var i = 0; i < n; i++) {
    var j = map[i] * 4;
    var k = i * 4;
    out[j] = rgba[k];
    out[j + 1] = rgba[k + 1];
    out[j + 2] = rgba[k + 2];
    out[j + 3] = rgba[k + 3];
  }
  return out;
}

/**
 * 连续应用同一映射表 times 次
 * @param {Uint8ClampedArray} rgba 原始 RGBA 像素
 * @param {Uint32Array} map 映射表
 * @param {number} times 迭代次数
 * @param {number} size 方形图像边长 N
 * @returns {Uint8ClampedArray} 置乱后的像素数组
 */
function applyMapTimes(rgba, map, times, size) {
  var cur = rgba;
  for (var t = 0; t < times; t++) {
    cur = applyMap(cur, map, size);
  }
  return cur;
}

/**
 * 构建映射的倍增幂表：powers[k] = map^(2^k)，k 从 0 开始。
 * 把"连续应用 times 次"压缩成 log2(times) 次置换（动画/滑条的核心加速）。
 * @param {Uint32Array} map 映射表（powers[0] 即其副本）
 * @param {number} size 方形图像边长 N
 * @param {number} maxTimes 需要支持的最大迭代次数，幂表覆盖到 ≥ maxTimes
 * @returns {Uint32Array[]} powers[k] = map^(2^k)
 */
function buildMapPowers(map, size, maxTimes) {
  var bits = 1;
  while ((1 << bits) <= maxTimes) bits++;
  var powers = [new Uint32Array(map)];
  for (var k = 1; k < bits; k++) {
    var prev = powers[k - 1];
    var cur = new Uint32Array(prev);
    composeMap(cur, prev, size); // cur = prev ∘ prev
    powers.push(cur);
  }
  return powers;
}

/**
 * 用倍增幂表快速应用 times 次映射，结果与 applyMapTimes 完全一致。
 * @param {Uint32Array[]} powers buildMapPowers 的返回值
 * @param {Uint8ClampedArray} rgba 原始 RGBA 像素
 * @param {number} times 迭代次数（≥0）
 * @param {number} size 方形图像边长 N
 * @returns {Uint8ClampedArray} 置乱后的像素数组
 */
function applyMapTimesPow(powers, rgba, times, size) {
  var cur = rgba;
  var k = 0;
  while (times > 0) {
    if (times % 2 === 1) cur = applyMap(cur, powers[k], size);
    times = Math.floor(times / 2);
    k++;
  }
  return cur;
}

/**
 * 复合映射：a = a ∘ b（先按 b 再按 a），用于周期检测
 * @param {Uint32Array} a 将被原地更新的映射
 * @param {Uint32Array} b 复合在后者的映射
 * @param {number} size 方形图像边长 N
 */
function composeMap(a, b, size) {
  var n = size * size;
  for (var i = 0; i < n; i++) {
    a[i] = b[a[i]];
  }
}

/**
 * 判断映射是否为恒等映射（每个像素都回到原位）
 * @param {Uint32Array} map 映射表
 * @param {number} size 方形图像边长 N
 * @returns {boolean} 是否恒等
 */
function isIdentityMap(map, size) {
  var n = size * size;
  for (var i = 0; i < n; i++) {
    if (map[i] !== i) return false;
  }
  return true;
}

/**
 * 检测 Arnold 变换的周期 T（迭代 T 次后回到原图）
 * 对 2 的幂 N=2^k（k≥3），周期 T = 3·2^(k-2)，例如 N=512 → T=384。
 * @param {number} size 方形图像边长 N
 * @returns {number} 周期 T（≥1）
 */
function findPeriod(size) {
  var map = buildForwardMap(size);
  var cur = new Uint32Array(map);
  var period = 1;
  var maxIter = size * size * 4 + 1024;
  while (!isIdentityMap(cur, size)) {
    composeMap(cur, map, size);
    period++;
    if (period > maxIter) return -1;
  }
  return period;
}

/**
 * 将任意尺寸图像填充为方形（超出部分裁掉，不足部分补黑）
 * 注意：差值不是偶数时（如 3 行补到 4 行），偏移向下取整，黑边会偏向底部。
 * @param {Uint8ClampedArray} rgba 原始 RGBA 像素（宽×高×4）
 * @param {number} width 原图宽度
 * @param {number} height 原图高度
 * @returns {{data: Uint8ClampedArray, size: number, offsetX: number, offsetY: number}}
 *          data 为 size×size 方形像素，offsetX/offsetY 为原图在方形中的偏移
 */
function padToSquare(rgba, width, height) {
  var size = Math.max(width, height);
  var data = new Uint8ClampedArray(size * size * 4);
  var offsetX = Math.floor((size - width) / 2);
  var offsetY = Math.floor((size - height) / 2);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var src = (y * width + x) * 4;
      var dst = ((y + offsetY) * size + (x + offsetX)) * 4;
      data[dst] = rgba[src];
      data[dst + 1] = rgba[src + 1];
      data[dst + 2] = rgba[src + 2];
      data[dst + 3] = rgba[src + 3];
    }
  }
  return { data: data, size: size, offsetX: offsetX, offsetY: offsetY };
}

var Arnold = {
  buildForwardMap: buildForwardMap,
  buildInverseMap: buildInverseMap,
  applyMap: applyMap,
  applyMapTimes: applyMapTimes,
  buildMapPowers: buildMapPowers,
  applyMapTimesPow: applyMapTimesPow,
  composeMap: composeMap,
  isIdentityMap: isIdentityMap,
  findPeriod: findPeriod,
  padToSquare: padToSquare
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Arnold;
}
if (typeof window !== 'undefined') {
  window.Arnold = Arnold;
}