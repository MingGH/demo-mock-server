/* ============================================================
   密码泄露自查 —— 核心逻辑（纯函数，可被 Node 直接 require 测试）
   全部 ES5 风格（var / function），浏览器直接打开即可运行。

   核心机制：k-匿名（k-anonymity）
   - 本地把密码算成 SHA-1（40位十六进制，大写）
   - 只把前 5 位发给服务端，拿回该前缀下所有「后缀:出现次数」
   - 本地比对完整哈希的后 35 位 → 得到是否命中 + 出现次数
   - 完整密码、完整哈希永远不离开本机
   ============================================================ */

/* ---------- 1. 纯 JS SHA-1 实现（同步，Node 与浏览器通用） ---------- */

/**
 * 计算字符串的 SHA-1 哈希，返回 40 位大写十六进制。
 * 内部按 UTF-8 编码处理输入。
 * @param {string} str 原始字符串（如密码明文）
 * @returns {string} 40 位大写十六进制哈希
 */
function sha1Hex(str) {
  var bytes = utf8Bytes(str);
  return sha1Bytes(bytes).toUpperCase();
}

/**
 * 将字符串编码为 UTF-8 字节数组。
 * @param {string} str 输入字符串
 * @returns {number[]} 字节数组（0-255）
 */
function utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      // 代理对
      var hi = c, lo = str.charCodeAt(++i);
      var cp = 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
               0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

/**
 * 对字节数组计算 SHA-1，返回小写十六进制字符串。
 * @param {number[]} bytes 输入字节数组
 * @returns {string} 40 位小写十六进制哈希
 */
function sha1Bytes(bytes) {
  var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE,
      h3 = 0x10325476, h4 = 0xC3D2E1F0;

  var msg = bytes.slice();
  var origLenBits = msg.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) { msg.push(0); }
  // 64 位长度，高 32 位（这里消息不会超过 2^32 位，置 0）
  for (var s = 0; s < 4; s++) { msg.push(0); }
  msg.push((origLenBits >>> 24) & 0xff, (origLenBits >>> 16) & 0xff,
           (origLenBits >>> 8) & 0xff, origLenBits & 0xff);

  var w = new Array(80);
  for (var i = 0; i < msg.length; i += 64) {
    for (var t = 0; t < 16; t++) {
      w[t] = (msg[i + t * 4] << 24) | (msg[i + t * 4 + 1] << 16) |
             (msg[i + t * 4 + 2] << 8) | (msg[i + t * 4 + 3]);
    }
    for (var t2 = 16; t2 < 80; t2++) {
      var v = w[t2 - 3] ^ w[t2 - 8] ^ w[t2 - 14] ^ w[t2 - 16];
      w[t2] = (v << 1) | (v >>> 31);
    }

    var a = h0, b = h1, c = h2, d = h3, e = h4;
    for (var j = 0; j < 80; j++) {
      var f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }

      var tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) & 0xffffffff;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp;
    }

    h0 = (h0 + a) & 0xffffffff;
    h1 = (h1 + b) & 0xffffffff;
    h2 = (h2 + c) & 0xffffffff;
    h3 = (h3 + d) & 0xffffffff;
    h4 = (h4 + e) & 0xffffffff;
  }

  return toHex32(h0) + toHex32(h1) + toHex32(h2) + toHex32(h3) + toHex32(h4);
}

/**
 * 把 32 位整数转成 8 位小写十六进制。
 * @param {number} n 32 位整数
 * @returns {string} 8 字符十六进制
 */
function toHex32(n) {
  var s = (n >>> 0).toString(16);
  while (s.length < 8) { s = '0' + s; }
  return s;
}

/* ---------- 2. k-匿名查询：前缀切分与后缀比对 ---------- */

/**
 * 把完整 SHA-1（40位大写）切成 k-匿名查询所需的前缀与后缀。
 * @param {string} fullHash 40 位大写十六进制 SHA-1
 * @returns {{prefix: string, suffix: string}} 前 5 位前缀 + 后 35 位后缀
 */
function splitHash(fullHash) {
  var up = fullHash.toUpperCase();
  return { prefix: up.substring(0, 5), suffix: up.substring(5) };
}

/**
 * 在 HIBP range 接口返回的文本中查找指定后缀的出现次数。
 * 接口返回格式：每行 "SUFFIX:COUNT"，SUFFIX 为后 35 位十六进制。
 * @param {string} rangeText range 接口返回的纯文本
 * @param {string} suffix 待查的后 35 位后缀（大写）
 * @returns {number} 出现次数；未命中返回 0
 */
function countInRange(rangeText, suffix) {
  if (!rangeText) return 0;
  var target = suffix.toUpperCase();
  var lines = rangeText.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;
    var idx = line.indexOf(':');
    if (idx === -1) continue;
    if (line.substring(0, idx).toUpperCase() === target) {
      return parseInt(line.substring(idx + 1), 10) || 0;
    }
  }
  return 0;
}

/**
 * 一站式：给定密码与对应前缀的 range 文本，得出泄露结论。
 * @param {string} password 密码明文
 * @param {string} rangeText 该密码 SHA-1 前缀对应的 range 文本
 * @returns {{hash: string, prefix: string, suffix: string, count: number, pwned: boolean}}
 */
function checkPassword(password, rangeText) {
  var hash = sha1Hex(password);
  var parts = splitHash(hash);
  var count = countInRange(rangeText, parts.suffix);
  return {
    hash: hash,
    prefix: parts.prefix,
    suffix: parts.suffix,
    count: count,
    pwned: count > 0
  };
}

/* ---------- 3. 体量类比：把超大数字变得可感 ---------- */

/** 已知泄露密码合集的体量里程碑（来自公开报道，仅作科普类比）。 */
var WORDLIST_MILESTONES = [
  { year: 2009, name: 'RockYou 原始泄露', count: 3.2e7,  note: '社交应用 RockYou 明文库，约 3200 万条' },
  { year: 2019, name: 'Collection #1',    count: 7.73e8, note: '聚合泄露，约 7.73 亿条' },
  { year: 2021, name: 'RockYou2021',      count: 8.4e9,  note: '论坛流出，约 84 亿条' },
  { year: 2024, name: 'RockYou2024',      count: 9.9e9,  note: '号称 99 亿条 / 解压约 142GB' }
];

/**
 * 把一个超大密码条目数，类比成"相当于全球人口的多少倍"。
 * @param {number} count 密码条目数
 * @param {number} [worldPopulation] 全球人口（默认 82 亿）
 * @returns {number} 倍数（保留语义，前端自行格式化）
 */
function timesWorldPopulation(count, worldPopulation) {
  var pop = worldPopulation || 8.2e9;
  return count / pop;
}

/**
 * 把大数字格式化为中文可读（亿 / 万）。
 * @param {number} n 数字
 * @returns {string} 可读字符串
 */
function formatCount(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(0) + ' 万';
  return String(n);
}

/* ---------- 4. 预设密码（供"点一下看命中"对比卡片） ---------- */

/** 预设示例密码：从"经典弱口令"到"真随机长口令"，用于对比命中差异。 */
var PRESET_PASSWORDS = [
  { value: '123456',                     label: '纯数字序列',   note: '泄露库头号常客' },
  { value: 'password',                   label: '英文单词',     note: '字典第一页' },
  { value: 'P@ssw0rd',                   label: '"伪复杂"',     note: '加了符号也没用' },
  { value: 'Aa123456',                   label: '大写+数字',    note: '凑规则的产物' },
  { value: 'iloveyou',                   label: '情话',         note: '高频流行词' },
  { value: 'correcthorsebatterystaple',  label: '四词长口令',   note: '看看它在不在册' }
];

/* ---------- 导出（Node.js 测试用） ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sha1Hex: sha1Hex,
    utf8Bytes: utf8Bytes,
    splitHash: splitHash,
    countInRange: countInRange,
    checkPassword: checkPassword,
    timesWorldPopulation: timesWorldPopulation,
    formatCount: formatCount,
    WORDLIST_MILESTONES: WORDLIST_MILESTONES,
    PRESET_PASSWORDS: PRESET_PASSWORDS
  };
}
