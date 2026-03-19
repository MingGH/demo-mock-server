/**
 * π 里藏着你的生日 — 核心算法
 * Find Your Birthday in Pi — Core Logic
 */

// === π 的前1000位（硬编码，用于离线快速搜索）===
const PI_FIRST_1000 = '14159265358979323846264338327950288419716939937510' +
  '58209749445923078164062862089986280348253421170679' +
  '82148086513282306647093844609550582231725359408128' +
  '48111745028410270193852110555964462294895493038196' +
  '44288109756659334461284756482337867831652712019091' +
  '45648566923460348610454326648213393607260249141273' +
  '72458700660631558817488152092096282925409171536436' +
  '78925903600113305305488204665213841469519415116094' +
  '33057270365759591953092186117381932611793105118548' +
  '07446237996274956735188575272489122793818301194912' +
  '98336733624406566430860213949463952247371907021798' +
  '60943702770539217176293176752384674818467669405132' +
  '00056812714526356082778577134275778960917363717872' +
  '14684409012249534301465495853710507922796892589235' +
  '42019956112129021960864034418159813629774771309960' +
  '51870721134999999837297804995105973173281609631859' +
  '50244594553469083026425223082533446850352619311881' +
  '71010003137838752886587533208381420617177669147303' +
  '59825349042875546873115956286388235378759375195778' +
  '18577805321712268066130019278766111959092164201989';

// === 核心搜索函数 ===

/**
 * 在 π 的小数位中搜索指定数字序列
 * @param {string} piDigits - π 的小数位字符串（不含 "3."）
 * @param {string} sequence - 要搜索的数字序列
 * @returns {number} 首次出现的位置（从第1位开始计数），-1 表示未找到
 */
function searchInPi(piDigits, sequence) {
  if (!sequence || !piDigits) return -1;
  if (!/^\d+$/.test(sequence)) return -1;
  const index = piDigits.indexOf(sequence);
  if (index === -1) return -1;
  return index + 1; // 从第1位开始计数
}

/**
 * 将生日转换为多种数字格式
 * @param {number} month - 月 (1-12)
 * @param {number} day - 日 (1-31)
 * @param {number} year - 年 (如 1990)
 * @returns {Array<{format: string, sequence: string, label: string}>}
 */
function birthdayToSequences(month, day, year) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const yy = String(year).slice(-2);
  const yyyy = String(year);
  const m = String(month);
  const d = String(day);

  return [
    { format: 'MMDD', sequence: mm + dd, label: `${mm}${dd}（月日）` },
    { format: 'DDMM', sequence: dd + mm, label: `${dd}${mm}（日月）` },
    { format: 'YYYYMMDD', sequence: yyyy + mm + dd, label: `${yyyy}${mm}${dd}（年月日）` },
    { format: 'MMDDYYYY', sequence: mm + dd + yyyy, label: `${mm}${dd}${yyyy}（月日年）` },
    { format: 'DDMMYYYY', sequence: dd + mm + yyyy, label: `${dd}${mm}${yyyy}（日月年）` },
    { format: 'YYMMDD', sequence: yy + mm + dd, label: `${yy}${mm}${dd}（短年月日）` },
    { format: 'MDD', sequence: m + dd, label: `${m}${dd}（无前导零月日）` },
    { format: 'MD', sequence: m + d, label: `${m}${d}（无前导零）` },
  ];
}

/**
 * 计算在 n 位随机数字中找到 k 位序列的期望概率
 * 基于近似公式：P ≈ 1 - (1 - 10^(-k))^(n-k+1)
 * @param {number} n - 总位数
 * @param {number} k - 序列长度
 * @returns {number} 概率 (0~1)
 */
function probabilityOfFinding(n, k) {
  if (k <= 0 || n < k) return 0;
  const p = Math.pow(10, -k);
  const trials = n - k + 1;
  // 1 - (1-p)^trials，用对数避免精度问题
  if (p * trials < 0.01) {
    return p * trials; // 小概率近似
  }
  return 1 - Math.pow(1 - p, trials);
}

/**
 * 计算找到 k 位序列需要的期望位数
 * E[位数] ≈ 10^k
 * @param {number} k - 序列长度
 * @returns {number} 期望需要的位数
 */
function expectedDigitsNeeded(k) {
  return Math.pow(10, k);
}

/**
 * 生成搜索统计信息
 * @param {number} position - 找到的位置
 * @param {number} seqLength - 序列长度
 * @returns {object} 统计信息
 */
function generateSearchStats(position, seqLength) {
  const expected = expectedDigitsNeeded(seqLength);
  const ratio = position / expected;
  let luck;
  if (ratio < 0.1) luck = '极其幸运';
  else if (ratio < 0.5) luck = '比较幸运';
  else if (ratio < 1.0) luck = '运气不错';
  else if (ratio < 2.0) luck = '正常水平';
  else if (ratio < 5.0) luck = '稍微靠后';
  else luck = '相当靠后';

  return {
    position,
    expected,
    ratio: Math.round(ratio * 100) / 100,
    luck,
    percentile: Math.round((1 - Math.exp(-ratio)) * 100),
  };
}

/**
 * 无限猴子定理：计算猴子打出特定序列的期望时间
 * @param {number} seqLength - 序列长度
 * @param {number} typingSpeed - 每秒打字数
 * @returns {object} 时间估算
 */
function monkeyTypingTime(seqLength, typingSpeed = 5) {
  const combinations = Math.pow(10, seqLength);
  const seconds = combinations / typingSpeed;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  const years = days / 365.25;

  return {
    combinations,
    seconds,
    minutes,
    hours,
    days,
    years,
    formatted: formatTime(seconds),
  };
}

/**
 * 格式化时间
 */
function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时`;
  if (seconds < 31557600) return `${(seconds / 86400).toFixed(1)} 天`;
  const years = seconds / 31557600;
  if (years < 1000) return `${years.toFixed(1)} 年`;
  if (years < 1e6) return `${(years / 1000).toFixed(1)} 千年`;
  if (years < 1e9) return `${(years / 1e6).toFixed(1)} 百万年`;
  return `${years.toExponential(2)} 年`;
}

/**
 * 格式化大数字
 */
function formatNumber(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + '万亿';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n.toLocaleString();
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PI_FIRST_1000,
    searchInPi,
    birthdayToSequences,
    probabilityOfFinding,
    expectedDigitsNeeded,
    generateSearchStats,
    monkeyTypingTime,
    formatTime,
    formatNumber,
  };
}
