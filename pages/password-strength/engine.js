// ========== 密码强度可视化 — 核心算法（可独立测试） ==========

var ATTACK_SPEEDS = {
  online:         1e3,    // 在线攻击：1,000 次/秒
  offline_gpu:    1e10,   // GPU 集群：10,000,000,000 次/秒
  offline_nation: 1e12    // 国家级：1,000,000,000,000 次/秒
};

var ATTACK_SPEED_LABELS = {
  online:         '在线攻击（1000次/秒）',
  offline_gpu:    'GPU集群（10^10次/秒）',
  offline_nation: '国家级（10^12次/秒）'
};

var TOP_100_COMMON_PASSWORDS = [
  '123456', 'password', '12345678', 'qwerty', '123456789',
  '12345', '1234', '111111', '1234567', 'sunshine',
  'qwerty123', 'iloveyou', 'princess', 'admin', 'welcome',
  '666666', 'abc123', 'football', '123123', 'monkey',
  '654321', '!@#$%^&*', 'charlie', 'aa123456', 'donald',
  'password1', 'qwerty12345', '1234567890', 'letmein', '123456789a',
  'login', 'starwars', 'dragon', 'passw0rd', 'master',
  'hello', 'freedom', 'whatever', 'nicole', 'daniel',
  'access', '654321a', 'trustno1', 'flower', 'shadow',
  '123321', 'michael', 'superman', 'batman', 'hottie',
  'lovely', 'andrew', 'pepper', '11111111', 'qazwsx',
  '000000', 'love', 'jordan23', 'harley', 'summer',
  'george', 'jessica', '1111', 'ashley', 'zxcvbnm',
  '696969', 'football1', 'baseball', 'hunter', 'buster',
  'thomas', 'jennifer', '1111111', '121212', 'merlin',
  'soccer', 'fuckyou', 'secret', 'dragonball', 'iloveyou1',
  'naruto', 'maggie', 'chelsea', '123456a', 'ginger',
  'princess1', 'amanda', 'joshua', 'matthew', 'robert',
  'william', 'forever', 'computer', 'hannah', 'banana',
  'michelle', 'midnight', 'tigger', '1111111111', 'qwertyuiop'
];

var KEYBOARD_PATTERNS = [
  'qwerty', 'qwertz', 'azerty',
  'asdfgh', 'zxcvbn',
  'qazwsx', 'wsxedc', 'edcrfv', 'rfvtgb', 'tgbyhn', 'yhnujm', 'ujmik', 'ikol',
  '1qaz', '2wsx', '3edc', '4rfv', '5tgb', '6yhn', '7ujm', '8ik',
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz'
];

/**
 * 检测密码使用的字符集及其大小
 * @param {string} password
 * @returns {{lowercase: boolean, uppercase: boolean, digits: boolean, special: boolean, size: number}}
 */
function detectCharsets(password) {
  var hasLower = /[a-z]/.test(password);
  var hasUpper = /[A-Z]/.test(password);
  var hasDigit = /\d/.test(password);
  var hasSpecial = /[^a-zA-Z0-9]/.test(password);
  var size = 0;
  if (hasLower) size += 26;
  if (hasUpper) size += 26;
  if (hasDigit) size += 10;
  if (hasSpecial) size += 33; // ASCII printable special chars: 33 (95 - 26 - 26 - 10)

  return {
    lowercase: hasLower,
    uppercase: hasUpper,
    digits: hasDigit,
    special: hasSpecial,
    size: size
  };
}

/**
 * 计算信息熵 H = L × log₂(N)
 * @param {string} password
 * @returns {{entropy: number, charsetSize: number, length: number}}
 */
function calcEntropy(password) {
  if (!password || password.length === 0) {
    return { entropy: 0, charsetSize: 0, length: 0 };
  }
  var cs = detectCharsets(password);
  var length = password.length;
  var entropy = length * Math.log2(cs.size === 0 ? 1 : cs.size);
  return {
    entropy: entropy,
    charsetSize: cs.size,
    length: length
  };
}

/**
 * 计算暴力破解所需时间（秒）
 * 平均情况：keyspace / attackSpeed / 2
 * @param {number} entropy
 * @param {number} attackSpeed
 * @returns {number} 秒
 */
function calcCrackTime(entropy, attackSpeed) {
  if (entropy <= 0) return 0;
  if (!attackSpeed || attackSpeed <= 0) return Infinity;
  var keyspace = Math.pow(2, entropy);
  return keyspace / attackSpeed / 2;
}

/**
 * 检测密码中的弱模式
 * @param {string} password
 * @returns {Array<{type: string, description: string}>}
 */
function detectPatterns(password) {
  if (!password || password.length === 0) return [];
  var patterns = [];

  // 常见密码检测（忽略大小写）
  if (isCommonPassword(password)) {
    patterns.push({ type: 'common', description: '已知常见弱密码，已出现在泄露数据中' });
  }

  // 键盘模式检测
  var lowerPwd = password.toLowerCase();
  for (var i = 0; i < KEYBOARD_PATTERNS.length; i++) {
    if (lowerPwd.indexOf(KEYBOARD_PATTERNS[i]) !== -1) {
      patterns.push({ type: 'keyboard', description: '检测到键盘连续排列模式：' + KEYBOARD_PATTERNS[i] });
      break;
    }
  }

  // 重复模式检测
  if (/(.)\1{2,}/.test(password)) {
    patterns.push({ type: 'repeat', description: '检测到重复字符模式（如 aaa, 111）' });
  }

  // 重复子串检测（如 abcabc）
  if (/(.+)\1{1,}/.test(password)) {
    // 进一步过滤单字符重复（已被上面处理）
    var repeatMatch = password.match(/(.+)\1{1,}/);
    if (repeatMatch && repeatMatch[1].length >= 2) {
      patterns.push({ type: 'substring-repeat', description: '检测到重复子串模式：' + repeatMatch[1] + repeatMatch[1] });
    }
  }

  // 日期模式检测
  // YYYYMMDD, YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  if (/\d{4}[-/.]\d{2}[-/.]\d{2}/.test(password) || /\d{8}/.test(password)) {
    patterns.push({ type: 'date', description: '检测到日期格式（生日、纪念日等）' });
  }

  // 连续字符检测
  // 检查是否有 3 个或以上连续字符
  var consecFound = false;
  var alphabet = 'abcdefghijklmnopqrstuvwxyz';
  var digits = '0123456789';
  // 正向检测
  for (var j = 0; j < lowerPwd.length - 2; j++) {
    var chunk = lowerPwd.substring(j, j + 3);
    if (alphabet.indexOf(chunk) !== -1) {
      patterns.push({ type: 'sequential', description: '检测到连续字母：' + chunk });
      consecFound = true;
      break;
    }
    if (digits.indexOf(chunk) !== -1) {
      patterns.push({ type: 'sequential', description: '检测到连续数字：' + chunk });
      consecFound = true;
      break;
    }
    // 反向检测
    var reversed = chunk.split('').reverse().join('');
    if (alphabet.indexOf(reversed) !== -1 || digits.indexOf(reversed) !== -1) {
      // 反向数字较长的情况（如987）
      if (digits.indexOf(reversed) !== -1) {
        patterns.push({ type: 'sequential', description: '检测到反向连续数字：' + chunk });
        consecFound = true;
        break;
      }
    }
  }

  // 去重：移除 substring-repeat 和 repeat 的重复
  if (patterns.length > 1) {
    var hasRepeat = false;
    var filtered = [];
    for (var k = 0; k < patterns.length; k++) {
      if (patterns[k].type === 'repeat') {
        hasRepeat = patterns[k];
      } else if (patterns[k].type === 'substring-repeat') {
        // 如果已经有重复模式，不添加子串重复
        if (!hasRepeat) {
          filtered.push(patterns[k]);
        } else {
          // 合并信息：更新已有 repeat 的描述
        }
      } else {
        filtered.push(patterns[k]);
      }
    }
    if (hasRepeat) {
      filtered.push(hasRepeat);
    }
    patterns = filtered;
  }

  return patterns;
}

/**
 * 判断是否为常见密码
 * @param {string} password
 * @returns {boolean}
 */
function isCommonPassword(password) {
  if (!password) return false;
  var lower = password.toLowerCase();
  for (var i = 0; i < TOP_100_COMMON_PASSWORDS.length; i++) {
    if (TOP_100_COMMON_PASSWORDS[i].toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

/**
 * 格式化时间为人类可读字符串
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '计算中...';
  if (!isFinite(seconds)) return '超过计算范围';

  if (seconds < 0.001) return '不到 1 毫秒';
  if (seconds < 1) return (seconds * 1000).toFixed(1) + ' 毫秒';
  if (seconds < 60) return seconds.toFixed(1) + ' 秒';
  if (seconds < 3600) return (seconds / 60).toFixed(1) + ' 分钟';
  if (seconds < 86400) return (seconds / 3600).toFixed(1) + ' 小时';
  if (seconds < 31557600) return (seconds / 86400).toFixed(1) + ' 天';

  var years = seconds / 31557600;
  if (years < 1000000) {
    if (years < 100) return years.toFixed(1) + ' 年';
    return years.toExponential(1) + ' 年';
  }

  // 宇宙年龄约 137.98 亿年 = 1.3798e10 年
  var universeAgeYears = 1.3798e10;
  var ratio = years / universeAgeYears;
  if (ratio < 1e6) {
    return '宇宙年龄的 ' + ratio.toFixed(1) + ' 倍';
  }
  return '宇宙年龄的 ' + ratio.toExponential(1) + ' 倍';
}

/**
 * 获取密码强度等级
 * @param {number} entropy
 * @returns {{level: string, label: string, color: string, percent: number}}
 */
function getStrengthLevel(entropy) {
  if (entropy <= 0) return { level: 'none', label: '无', color: '#64748b', percent: 0 };
  if (entropy < 28) return { level: 'very-weak', label: '极弱', color: '#ef4444', percent: Math.min(100, entropy / 28 * 12.5) };
  if (entropy < 36) return { level: 'weak', label: '弱', color: '#f59e0b', percent: 12.5 + (entropy - 28) / 8 * 12.5 };
  if (entropy < 60) return { level: 'fair', label: '中等', color: '#eab308', percent: 25 + (entropy - 36) / 24 * 25 };
  if (entropy < 128) return { level: 'strong', label: '强', color: '#22c55e', percent: 50 + (entropy - 60) / 68 * 40 };
  return { level: 'very-strong', label: '极强', color: '#3b82f6', percent: 90 + Math.min(10, (entropy - 128) / 128 * 10) };
}

/**
 * 计算所有攻击场景的破解时间
 * @param {number} entropy
 * @returns {Array<{key: string, label: string, seconds: number, formatted: string}>}
 */
function calcAllCrackTimes(entropy) {
  var results = [];
  var keys = Object.keys(ATTACK_SPEEDS);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var seconds = calcCrackTime(entropy, ATTACK_SPEEDS[key]);
    results.push({
      key: key,
      label: ATTACK_SPEED_LABELS[key],
      seconds: seconds,
      formatted: formatTime(seconds)
    });
  }
  return results;
}

// ── 导出（Node.js 测试用） ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcEntropy: calcEntropy,
    calcCrackTime: calcCrackTime,
    detectCharsets: detectCharsets,
    detectPatterns: detectPatterns,
    formatTime: formatTime,
    getStrengthLevel: getStrengthLevel,
    isCommonPassword: isCommonPassword,
    calcAllCrackTimes: calcAllCrackTimes,
    ATTACK_SPEEDS: ATTACK_SPEEDS,
    ATTACK_SPEED_LABELS: ATTACK_SPEED_LABELS,
    TOP_100_COMMON_PASSWORDS: TOP_100_COMMON_PASSWORDS
  };
}
