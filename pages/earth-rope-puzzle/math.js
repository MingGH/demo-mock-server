/**
 * 地球绑绳子问题 — 核心数学计算
 *
 * 公式：
 *   原始周长 C = 2πR
 *   新周长 C + ΔL = 2π(R + h)
 *   → h = ΔL / (2π)
 *
 *   注意：h 与 R 完全无关！
 */

/**
 * 计算绳子增加 deltaLength 后的间隙高度
 * @param {number} deltaLength - 增加的绳子长度（米）
 * @returns {number} 间隙高度（米）
 */
function calculateGap(deltaLength) {
  return deltaLength / (2 * Math.PI);
}

/**
 * 计算达到目标高度需要增加的绳长
 * @param {number} targetHeight - 目标高度（米）
 * @returns {number} 需要增加的绳长（米）
 */
function calculateRequiredLength(targetHeight) {
  return targetHeight * 2 * Math.PI;
}

/**
 * 验证间隙高度与球体半径无关
 * @param {number} radius - 球体半径（米）
 * @param {number} deltaLength - 增加的绳子长度（米）
 * @returns {object} { originalCircumference, newCircumference, newRadius, gap }
 */
function verifyIndependence(radius, deltaLength) {
  const originalCircumference = 2 * Math.PI * radius;
  const newCircumference = originalCircumference + deltaLength;
  const newRadius = radius + deltaLength / (2 * Math.PI);
  // 直接用公式计算 gap，避免超大半径时浮点精度丢失（newRadius - radius === 0）
  const gap = deltaLength / (2 * Math.PI);
  return { originalCircumference, newCircumference, newRadius, gap };
}

/**
 * 格式化数字为中文可读的字符串
 * @param {number} value - 数值（米）
 * @returns {string} 格式化后的字符串
 */
function formatLength(value) {
  var abs = Math.abs(value);
  if (abs < 0.01) return (value * 1000).toFixed(2) + ' 毫米';
  if (abs < 1) return (value * 100).toFixed(2) + ' 厘米';
  if (abs < 1000) return value.toFixed(2) + ' 米';
  if (abs < 1e6) return (value / 1000).toFixed(2) + ' 公里';
  if (abs < 1e11) return (value / 1e7).toFixed(2) + ' 万公里';
  if (abs < 1e16) return (value / 1e11).toFixed(2) + ' 亿公里';
  return (value / 1e11).toPrecision(4) + ' 亿公里';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateGap, calculateRequiredLength, verifyIndependence, formatLength };
}
