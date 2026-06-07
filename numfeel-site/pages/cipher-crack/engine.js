// ========== 密码破解核心算法（可独立测试） ==========

// 英文字母标准频率（来源：Lewand, Cryptological Mathematics, 2000）
const ENGLISH_FREQ = {
  E: 12.70, T: 9.06, A: 8.17, O: 7.51, I: 6.97,
  N: 6.75, S: 6.33, H: 6.09, R: 5.99, D: 4.25,
  L: 4.03, C: 2.78, U: 2.76, M: 2.41, W: 2.36,
  F: 2.23, G: 2.02, Y: 1.97, P: 1.93, B: 1.49,
  V: 0.98, K: 0.77, J: 0.15, X: 0.15, Q: 0.10, Z: 0.07
};

// 中文常用字频率（取自国家语委现代汉语语料库频率前 20 字的相对占比，归一化到百分比）
const CHINESE_TOP = [
  { char: '的', freq: 7.18 }, { char: '一', freq: 3.14 },
  { char: '是', freq: 2.65 }, { char: '不', freq: 2.36 },
  { char: '了', freq: 2.31 }, { char: '在', freq: 2.14 },
  { char: '人', freq: 1.91 }, { char: '有', freq: 1.76 },
  { char: '我', freq: 1.69 }, { char: '他', freq: 1.62 },
  { char: '这', freq: 1.48 }, { char: '中', freq: 1.43 },
  { char: '大', freq: 1.34 }, { char: '来', freq: 1.28 },
  { char: '上', freq: 1.22 }, { char: '国', freq: 1.17 },
  { char: '个', freq: 1.12 }, { char: '到', freq: 1.08 },
  { char: '说', freq: 1.04 }, { char: '们', freq: 0.98 }
];

/**
 * 凯撒加密
 * @param {string} text - 明文
 * @param {number} shift - 偏移量 (0-25)
 * @returns {string} 密文
 */
function caesarEncrypt(text, shift) {
  shift = ((shift % 26) + 26) % 26;
  return text.split('').map(ch => {
    if (ch >= 'A' && ch <= 'Z') {
      return String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65);
    }
    if (ch >= 'a' && ch <= 'z') {
      return String.fromCharCode(((ch.charCodeAt(0) - 97 + shift) % 26) + 97);
    }
    return ch;
  }).join('');
}

/**
 * 凯撒解密
 */
function caesarDecrypt(text, shift) {
  return caesarEncrypt(text, 26 - shift);
}

/**
 * 简单替换加密（给定映射表）
 * @param {string} text - 明文
 * @param {Object} mapping - { A: 'Q', B: 'W', ... }
 * @returns {string} 密文
 */
function substitutionEncrypt(text, mapping) {
  return text.split('').map(ch => {
    const upper = ch.toUpperCase();
    if (mapping[upper]) {
      return ch === upper ? mapping[upper] : mapping[upper].toLowerCase();
    }
    return ch;
  }).join('');
}

/**
 * 简单替换解密（反转映射）
 */
function substitutionDecrypt(text, mapping) {
  const reverse = {};
  for (const [k, v] of Object.entries(mapping)) {
    reverse[v] = k;
  }
  return substitutionEncrypt(text, reverse);
}

/**
 * 生成随机替换映射
 * @returns {Object} 映射表 { A: 'X', B: 'M', ... }
 */
function generateRandomMapping() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const shuffled = shuffleArray(letters);
  const mapping = {};
  for (let i = 0; i < 26; i++) {
    mapping[letters[i]] = shuffled[i];
  }
  return mapping;
}

/**
 * Vigenère 加密
 * @param {string} text - 明文
 * @param {string} key - 密钥词
 * @returns {string} 密文
 */
function vigenereEncrypt(text, key) {
  key = key.toUpperCase().replace(/[^A-Z]/g, '');
  if (!key) return text;
  let ki = 0;
  return text.split('').map(ch => {
    if (ch >= 'A' && ch <= 'Z') {
      const shift = key.charCodeAt(ki % key.length) - 65;
      ki++;
      return String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65);
    }
    if (ch >= 'a' && ch <= 'z') {
      const shift = key.charCodeAt(ki % key.length) - 65;
      ki++;
      return String.fromCharCode(((ch.charCodeAt(0) - 97 + shift) % 26) + 97);
    }
    return ch;
  }).join('');
}

/**
 * Vigenère 解密
 */
function vigenereDecrypt(text, key) {
  key = key.toUpperCase().replace(/[^A-Z]/g, '');
  if (!key) return text;
  let ki = 0;
  return text.split('').map(ch => {
    if (ch >= 'A' && ch <= 'Z') {
      const shift = key.charCodeAt(ki % key.length) - 65;
      ki++;
      return String.fromCharCode(((ch.charCodeAt(0) - 65 - shift + 26) % 26) + 65);
    }
    if (ch >= 'a' && ch <= 'z') {
      const shift = key.charCodeAt(ki % key.length) - 65;
      ki++;
      return String.fromCharCode(((ch.charCodeAt(0) - 97 - shift + 26) % 26) + 97);
    }
    return ch;
  }).join('');
}

/**
 * 计算文本中字母频率
 * @param {string} text
 * @returns {Object} { A: 12.5, B: 3.2, ... } 百分比
 */
function letterFrequency(text) {
  const counts = {};
  let total = 0;
  for (const ch of text.toUpperCase()) {
    if (ch >= 'A' && ch <= 'Z') {
      counts[ch] = (counts[ch] || 0) + 1;
      total++;
    }
  }
  const freq = {};
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    freq[letter] = total > 0 ? ((counts[letter] || 0) / total) * 100 : 0;
  }
  return freq;
}

/**
 * 计算两个频率分布的卡方统计量（越小越匹配）
 */
function chiSquared(observed, expected) {
  let chi = 0;
  for (const letter of Object.keys(expected)) {
    const o = observed[letter] || 0;
    const e = expected[letter];
    if (e > 0) {
      chi += ((o - e) ** 2) / e;
    }
  }
  return chi;
}

/**
 * 暴力破解凯撒密码：尝试所有 26 种偏移，用卡方统计排序
 * @param {string} ciphertext
 * @returns {Array} [{ shift, score, preview }, ...] 按 score 升序
 */
function bruteForceCaesar(ciphertext) {
  const results = [];
  for (let shift = 0; shift < 26; shift++) {
    const decrypted = caesarDecrypt(ciphertext, shift);
    const freq = letterFrequency(decrypted);
    const score = chiSquared(freq, ENGLISH_FREQ);
    results.push({
      shift,
      score: Math.round(score * 100) / 100,
      preview: decrypted.substring(0, 80)
    });
  }
  results.sort((a, b) => a.score - b.score);
  return results;
}

/**
 * Kasiski 检验：找重复片段，计算间距的公因子，推断 Vigenère 密钥长度
 * @param {string} ciphertext
 * @param {number} minLen - 最小片段长度（默认 3）
 * @returns {Array} [{ length, score }, ...] 按可能性排序
 */
function kasiskiExamination(ciphertext) {
  const clean = ciphertext.toUpperCase().replace(/[^A-Z]/g, '');
  const distances = [];

  // 找所有长度 >= 3 的重复片段
  for (let len = 3; len <= 5; len++) {
    const seen = {};
    for (let i = 0; i <= clean.length - len; i++) {
      const gram = clean.substring(i, i + len);
      if (seen[gram] !== undefined) {
        distances.push(i - seen[gram]);
      }
      if (seen[gram] === undefined) {
        seen[gram] = i;
      }
    }
  }

  if (distances.length === 0) return [];

  // 计算所有间距的因子
  const factorCounts = {};
  for (const d of distances) {
    for (let f = 2; f <= Math.min(d, 20); f++) {
      if (d % f === 0) {
        factorCounts[f] = (factorCounts[f] || 0) + 1;
      }
    }
  }

  return Object.entries(factorCounts)
    .map(([length, count]) => ({ length: parseInt(length), score: count }))
    .sort((a, b) => b.score - a.score);
}

/**
 * 重合指数 (Index of Coincidence)
 * 英文期望值约 0.0667，随机文本约 0.0385
 */
function indexOfCoincidence(text) {
  const clean = text.toUpperCase().replace(/[^A-Z]/g, '');
  const n = clean.length;
  if (n <= 1) return 0;
  const counts = {};
  for (const ch of clean) {
    counts[ch] = (counts[ch] || 0) + 1;
  }
  let sum = 0;
  for (const c of Object.values(counts)) {
    sum += c * (c - 1);
  }
  return sum / (n * (n - 1));
}

/**
 * 用重合指数估计 Vigenère 密钥长度
 * @param {string} ciphertext
 * @param {number} maxLen - 最大尝试长度
 * @returns {Array} [{ length, ic }, ...] 按 IC 接近 0.0667 排序
 */
function icKeyLengthEstimate(ciphertext, maxLen) {
  maxLen = maxLen || 20;
  const clean = ciphertext.toUpperCase().replace(/[^A-Z]/g, '');
  const results = [];
  const TARGET_IC = 0.0667;

  for (let keyLen = 1; keyLen <= maxLen; keyLen++) {
    // 按密钥位置分组
    let totalIC = 0;
    for (let i = 0; i < keyLen; i++) {
      let group = '';
      for (let j = i; j < clean.length; j += keyLen) {
        group += clean[j];
      }
      totalIC += indexOfCoincidence(group);
    }
    const avgIC = totalIC / keyLen;
    results.push({
      length: keyLen,
      ic: Math.round(avgIC * 10000) / 10000,
      closeness: Math.abs(avgIC - TARGET_IC)
    });
  }

  // Sort by IC descending — higher IC means more English-like when grouped by this length
  results.sort((a, b) => b.ic - a.ic);

  // 启发式：top1 可能是真实密钥长度的倍数（如真密钥4，长度8/12的IC也会高）
  // 如果 top5 中有更短的能整除 top1 且IC也不错（差距在 0.01 以内），选更短的
  if (results.length >= 2) {
    const top1 = results[0];
    for (let i = 1; i < Math.min(5, results.length); i++) {
      const c = results[i];
      if (c.length >= 3 && c.length < top1.length
          && top1.length % c.length === 0
          && (top1.ic - c.ic) < 0.01) {
        results.splice(i, 1);
        results.unshift(c);
        break;
      }
    }
  }

  return results;
}

/**
 * 已知密钥长度，逐位破解 Vigenère 密钥
 */
function crackVigenereWithLength(ciphertext, keyLength) {
  const clean = ciphertext.toUpperCase().replace(/[^A-Z]/g, '');
  let key = '';

  for (let i = 0; i < keyLength; i++) {
    let group = '';
    for (let j = i; j < clean.length; j += keyLength) {
      group += clean[j];
    }
    // 对这一组尝试所有 26 种偏移
    let bestShift = 0, bestScore = Infinity;
    for (let shift = 0; shift < 26; shift++) {
      const decrypted = caesarDecrypt(group, shift);
      const freq = letterFrequency(decrypted);
      const score = chiSquared(freq, ENGLISH_FREQ);
      if (score < bestScore) {
        bestScore = score;
        bestShift = shift;
      }
    }
    key += String.fromCharCode(bestShift + 65);
  }

  return key;
}

/**
 * Fisher-Yates 洗牌
 */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── 导出供测试 ───
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ENGLISH_FREQ, CHINESE_TOP,
    caesarEncrypt, caesarDecrypt,
    substitutionEncrypt, substitutionDecrypt, generateRandomMapping,
    vigenereEncrypt, vigenereDecrypt,
    letterFrequency, chiSquared,
    bruteForceCaesar, kasiskiExamination,
    indexOfCoincidence, icKeyLengthEstimate, crackVigenereWithLength,
    shuffleArray
  };
}
