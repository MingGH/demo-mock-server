// ========== 密码哈希破解竞速 — 核心算法（可独立测试） ==========

/**
 * 哈希算法破解速度（单块 RTX 4090，来源：Hashcat v6.2.6 benchmark）
 * 单位：hashes/sec
 *
 * 数据来源：
 * - Hashcat 官方 benchmark: https://hashcat.net/forum/thread-11549.html
 * - 实际测试可能因参数不同有浮动，这里取数量级正确的代表值
 */
var HASH_ALGORITHMS = {
  md5: {
    name: 'MD5',
    speed: 1.64e11,          // 164 GH/s (单卡 RTX 4090)
    speedLabel: '1640 亿次/秒',
    loginTime: 0.000001,     // 登录时计算耗时（秒）：~1μs
    color: '#ef4444',
    description: '无盐快速哈希，已被淘汰'
  },
  sha256: {
    name: 'SHA-256',
    speed: 2.2e10,           // 22 GH/s
    speedLabel: '220 亿次/秒',
    loginTime: 0.000002,     // ~2μs
    color: '#f59e0b',
    description: '无盐快速哈希，不适合存密码'
  },
  bcrypt_10: {
    name: 'bcrypt (cost=10)',
    speed: 5.7e3,            // 5,700 /s
    speedLabel: '5700 次/秒',
    loginTime: 0.080,        // ~80ms
    color: '#22c55e',
    description: '慢哈希+自动加盐，业界推荐'
  },
  argon2id: {
    name: 'Argon2id',
    speed: 1.2e2,            // ~120 /s (m=64MB, t=3, p=1)
    speedLabel: '120 次/秒',
    loginTime: 0.300,        // ~300ms
    color: '#3b82f6',
    description: '内存硬函数，OWASP 首选推荐'
  }
};

/**
 * 常用密码字符集大小
 */
var CHARSETS = {
  digits: { size: 10, label: '纯数字' },
  lower: { size: 26, label: '纯小写' },
  lower_digits: { size: 36, label: '小写+数字' },
  mixed: { size: 52, label: '大小写' },
  mixed_digits: { size: 62, label: '大小写+数字' },
  full: { size: 95, label: '全部可打印字符' }
};

/**
 * 预设场景
 */
var PRESETS = [
  { id: 'pin6', label: '6位数字PIN', length: 6, charset: 'digits', example: '520131' },
  { id: 'phone', label: '手机号后8位', length: 8, charset: 'digits', example: '13912345' },
  { id: 'word8', label: '8位小写密码', length: 8, charset: 'lower', example: 'iloveyou' },
  { id: 'mixed8', label: '8位混合密码', length: 8, charset: 'mixed_digits', example: 'Pa55w0rd' },
  { id: 'random12', label: '12位随机强密码', length: 12, charset: 'full', example: 'kX9!mQ2#vL7$' },
  { id: 'passphrase', label: '4词短语密码', length: 20, charset: 'lower', example: 'correct horse staple' }
];

/**
 * 计算密码的搜索空间大小
 * @param {number} length - 密码长度
 * @param {number} charsetSize - 字符集大小
 * @returns {number} 搜索空间大小（可能为 Infinity）
 */
function calcKeyspace(length, charsetSize) {
  if (length <= 0 || charsetSize <= 0) return 0;
  return Math.pow(charsetSize, length);
}

/**
 * 计算暴力破解平均时间（秒）
 * @param {number} keyspace - 搜索空间
 * @param {number} speed - 每秒尝试次数
 * @returns {number} 平均破解时间（秒）
 */
function calcCrackSeconds(keyspace, speed) {
  if (keyspace <= 0 || speed <= 0) return 0;
  // 平均情况：遍历一半空间
  return keyspace / speed / 2;
}

/**
 * 批量计算所有算法的破解时间
 * @param {number} length - 密码长度
 * @param {string} charsetKey - 字符集key
 * @returns {Array<{algo: string, name: string, speed: number, crackSeconds: number, loginMs: number, color: string}>}
 */
function calcAllCrackTimes(length, charsetKey) {
  var charset = CHARSETS[charsetKey];
  if (!charset) return [];
  var keyspace = calcKeyspace(length, charset.size);
  var results = [];
  var keys = Object.keys(HASH_ALGORITHMS);
  for (var i = 0; i < keys.length; i++) {
    var algo = HASH_ALGORITHMS[keys[i]];
    results.push({
      algo: keys[i],
      name: algo.name,
      speed: algo.speed,
      speedLabel: algo.speedLabel,
      crackSeconds: calcCrackSeconds(keyspace, algo.speed),
      loginMs: algo.loginTime * 1000,
      color: algo.color,
      description: algo.description
    });
  }
  return results;
}

/**
 * 格式化时间为人类可读
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  if (seconds === 0) return '瞬间';
  if (isNaN(seconds)) return '--';
  if (!isFinite(seconds)) return '超出计算范围';

  if (seconds < 0.001) return '不到 1 毫秒';
  if (seconds < 1) return Math.round(seconds * 1000) + ' 毫秒';
  if (seconds < 60) return seconds.toFixed(1) + ' 秒';
  if (seconds < 3600) return (seconds / 60).toFixed(1) + ' 分钟';
  if (seconds < 86400) return (seconds / 3600).toFixed(1) + ' 小时';
  if (seconds < 31557600) return (seconds / 86400).toFixed(0) + ' 天';

  var years = seconds / 31557600;
  if (years < 1000) return years.toFixed(1) + ' 年';
  if (years < 1e6) return (years / 1000).toFixed(1) + ' 千年';
  if (years < 1e9) return (years / 1e6).toFixed(1) + ' 百万年';
  if (years < 1e12) return (years / 1e9).toFixed(1) + ' 十亿年';

  // 宇宙年龄 ≈ 138 亿年
  var universeAge = 1.38e10;
  var ratio = years / universeAge;
  if (ratio < 1) return (years / 1e9).toFixed(1) + ' 十亿年';
  if (ratio < 1e6) return ratio.toFixed(0) + ' 倍宇宙年龄';
  return ratio.toExponential(1) + ' 倍宇宙年龄';
}

/**
 * 格式化大数字
 * @param {number} n
 * @returns {string}
 */
function formatBigNumber(n) {
  if (n === 0) return '0';
  if (!isFinite(n)) return '∞';
  if (n < 1e6) return n.toLocaleString();
  if (n < 1e9) return (n / 1e6).toFixed(1) + ' 百万';
  if (n < 1e12) return (n / 1e9).toFixed(1) + ' 十亿';
  return n.toExponential(2);
}

/**
 * 计算防护倍数：慢哈希相对于快哈希的时间比
 * @param {number} fastSeconds - 快哈希破解时间
 * @param {number} slowSeconds - 慢哈希破解时间
 * @returns {number} 倍数
 */
function calcProtectionMultiplier(fastSeconds, slowSeconds) {
  if (fastSeconds <= 0) return Infinity;
  return slowSeconds / fastSeconds;
}

/**
 * 生成"加速因子"描述：慢哈希比快哈希多出的防护
 * @param {Array} results - calcAllCrackTimes 的返回值
 * @returns {{md5VsBcrypt: number, md5VsArgon2: number}}
 */
function calcSpeedupFactors(results) {
  var md5 = results.find(function(r) { return r.algo === 'md5'; });
  var bcrypt = results.find(function(r) { return r.algo === 'bcrypt_10'; });
  var argon2 = results.find(function(r) { return r.algo === 'argon2id'; });

  return {
    md5VsBcrypt: md5 && bcrypt ? bcrypt.speed > 0 ? md5.speed / bcrypt.speed : Infinity : 0,
    md5VsArgon2: md5 && argon2 ? argon2.speed > 0 ? md5.speed / argon2.speed : Infinity : 0
  };
}

/**
 * 自动检测密码字符集
 * @param {string} password
 * @returns {string} charset key
 */
function detectCharsetKey(password) {
  if (!password) return 'digits';
  var hasLower = /[a-z]/.test(password);
  var hasUpper = /[A-Z]/.test(password);
  var hasDigit = /\d/.test(password);
  var hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (hasSpecial) return 'full';
  if (hasUpper && hasLower && hasDigit) return 'mixed_digits';
  if (hasUpper && hasLower) return 'mixed';
  if (hasLower && hasDigit) return 'lower_digits';
  if (hasLower) return 'lower';
  return 'digits';
}

// ── 导出（Node.js 测试用）──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HASH_ALGORITHMS: HASH_ALGORITHMS,
    CHARSETS: CHARSETS,
    PRESETS: PRESETS,
    calcKeyspace: calcKeyspace,
    calcCrackSeconds: calcCrackSeconds,
    calcAllCrackTimes: calcAllCrackTimes,
    formatTime: formatTime,
    formatBigNumber: formatBigNumber,
    calcProtectionMultiplier: calcProtectionMultiplier,
    calcSpeedupFactors: calcSpeedupFactors,
    detectCharsetKey: detectCharsetKey
  };
}
