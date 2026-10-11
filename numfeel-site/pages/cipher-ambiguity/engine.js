/**
 * cipher-ambiguity 演示引擎 — 同一段密文，不同钥匙解出不同明文
 *
 * 核心命题：密文本身不携带唯一真相，真相只属于拿对钥匙的人。
 * 转盘部分使用演示用映射表（16 把钥匙 → 8 种明文），帮助建立直觉；
 * 密钥空间部分使用真实数学 2^n。
 *
 * 纯函数、不碰 DOM，供 app.js 与 Node 单元测试共用。
 * 测试：node engine.test.js
 */

/** 演示密文（十六进制展示，8 字节） */
const CIPHERTEXT = '9F 3A C1 7E 55 D2 08 B4';

/** 转盘档位数：4 位密钥（2^4 = 16 把） */
const OTP_KEY_COUNT = 16;

/** 8 种真相明文（演示用话术） */
const OTP_PLAINTEXTS = [
  '明晚八点，老地方见。',
  '股票清仓，全部买金。',
  '生日快乐，蛋糕在冰箱。',
  '计划有变，取消行动。',
  '天冷加衣，别再熬夜。',
  '会议改到周四下午三点。',
  '论文过了，请客吃饭！',
  '今晚火锅还是烧烤？'
];

/**
 * 把密钥转盘旋到第 keyIndex 档
 * @param {number} keyIndex - 任意数，四舍五入后自动折回 0..15
 * @returns {{keyIndex: number, truthIndex: number, text: string}}
 */
function decryptOtp(keyIndex) {
  let r = Math.round(keyIndex);
  if (!Number.isFinite(r)) r = 0;
  const i = ((r % OTP_KEY_COUNT) + OTP_KEY_COUNT) % OTP_KEY_COUNT;
  return { keyIndex: i, truthIndex: i % OTP_PLAINTEXTS.length, text: OTP_PLAINTEXTS[i % OTP_PLAINTEXTS.length] };
}

/**
 * 统计一批解密结果中不同明文的数量
 * @param {{text: string}[]} results
 * @returns {number}
 */
function countDistinctTexts(results) {
  return new Set(results.map((r) => r.text)).size;
}

/**
 * n 位密钥的密钥空间大小
 * @param {number} bits - 密钥位数，1..64，越界自动收敛
 * @returns {{bits: number, keys: number, display: string}}
 *   keys 为精确值（≤2^53 内精确，之后为双精度近似），
 *   display 为人话格式：小空间给精确数字，大空间给科学计数法。
 */
function keySpace(bits) {
  let n = Math.round(bits);
  if (!Number.isFinite(n)) n = 4;
  n = Math.max(1, Math.min(64, n));
  const keys = Math.pow(2, n);
  let display;
  if (keys < 1e7) {
    display = keys.toLocaleString('zh-CN');
  } else {
    const exp = Math.floor(Math.log10(keys));
    const mant = keys / Math.pow(10, exp);
    display = `≈ ${mant.toFixed(1)} × 10^${exp}`;
  }
  return { bits: n, keys, display };
}

/**
 * 生成可分享的体验小结（复制功能用）
 * @param {{triedCount: number, foundCount: number, totalTexts: number, bits: number}} s
 * @returns {string}
 */
function buildSummary(s) {
  const space = keySpace(s.bits);
  const bytes = CIPHERTEXT.split(' ').length;
  return [
    `我在「密文的多重真相」用 16 把钥匙转了 ${s.triedCount} 次，`,
    `从同一段 ${bytes} 字节密文里解出了 ${s.foundCount}/${s.totalTexts} 种不同的明文。`,
    `把转盘放大到 ${space.bits} 位密钥，同一段密文就可能对应 ${space.display} 种"真相"。`,
    '密文本身不携带唯一真相——真相只属于拿对钥匙的人。'
  ].join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CIPHERTEXT, OTP_KEY_COUNT, OTP_PLAINTEXTS, decryptOtp, countDistinctTexts, keySpace, buildSummary };
}
