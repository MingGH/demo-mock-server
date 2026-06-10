/**
 * 布隆过滤器核心实现
 * 纯 JavaScript，可独立测试
 */

class BloomFilter {
  /**
   * @param {number} m - 位数组大小（bit 数）
   * @param {number} k - 哈希函数数量
   */
  constructor(m, k) {
    this.m = m;
    this.k = k;
    this.bitArray = new Uint8Array(Math.ceil(m / 8));
    this.count = 0;
  }

  /**
   * 计算元素的 k 个哈希位置
   * 使用 double hashing 技术：h_i(x) = (h1(x) + i * h2(x)) % m
   */
  getPositions(item) {
    const h1 = this._hash1(item);
    const h2 = this._hash2(item);
    const positions = [];
    for (let i = 0; i < this.k; i++) {
      positions.push(Math.abs((h1 + i * h2) % this.m));
    }
    return positions;
  }

  /**
   * 插入元素
   */
  add(item) {
    const positions = this.getPositions(item);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    }
    this.count++;
  }

  /**
   * 查询元素是否可能存在
   * @returns {boolean} true = 可能存在（有误判），false = 一定不存在
   */
  mightContain(item) {
    const positions = this.getPositions(item);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      if (!(this.bitArray[byteIndex] & (1 << bitIndex))) {
        return false;
      }
    }
    return true;
  }

  /**
   * 获取位数组填充率
   */
  getFillRate() {
    let ones = 0;
    for (let i = 0; i < this.bitArray.length; i++) {
      let byte = this.bitArray[i];
      while (byte) {
        ones += byte & 1;
        byte >>= 1;
      }
    }
    return ones / this.m;
  }

  /**
   * 获取指定位的状态（用于可视化）
   */
  getBit(pos) {
    const byteIndex = Math.floor(pos / 8);
    const bitIndex = pos % 8;
    return (this.bitArray[byteIndex] & (1 << bitIndex)) ? 1 : 0;
  }

  /**
   * FNV-1a 哈希函数
   */
  _hash1(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * DJB2 哈希函数
   */
  _hash2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(hash, 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  }

  /**
   * 重置过滤器
   */
  reset() {
    this.bitArray.fill(0);
    this.count = 0;
  }
}

/**
 * 计算理论误判率
 * P = (1 - e^(-kn/m))^k
 */
function theoreticalFPR(n, m, k) {
  return Math.pow(1 - Math.exp(-k * n / m), k);
}

/**
 * 计算最优哈希函数数量
 * k_opt = (m/n) * ln(2)
 */
function optimalK(m, n) {
  return Math.round((m / n) * Math.LN2);
}

/**
 * 计算达到指定误判率所需的位数组大小
 * m = -n * ln(p) / (ln2)^2
 */
function requiredBits(n, p) {
  return Math.ceil(-n * Math.log(p) / (Math.LN2 * Math.LN2));
}

/**
 * 生成随机字符串
 */
function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BloomFilter, theoreticalFPR, optimalK, requiredBits, randomString };
}
