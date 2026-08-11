/**
 * 一KB传书（One-KB Letter）核心逻辑
 *
 * 场景：你只有一次机会，向三年前的自己传送 1KB 的数据。
 * 本模块只做纯计算，不操作 DOM，便于 Node 单元测试。
 *
 * 核心能力：
 * 1. 字节打包：UTF-8 字节计数 + 1KB 格点可视化
 * 2. 命运结算：根据信的类型与内容，算出「可信度」与「命运改变值」
 * 3. 数字解析：识别信里的彩票号码 / 价格 / 私钥等数字特征
 * 4. 众生相聚合：把本地记录叠加到内置基准分布上
 * 5. 1KB 容量科普示例
 */

var KB = 1024;

/** 信的四种类型 */
var TYPE_TEXT = 'text';
var TYPE_CODE = 'code';
var TYPE_NUMBERS = 'numbers';

var TYPE_META = {
  text: {
    label: '一封短信',
    hint: '一句话，说给三年前的自己',
    example: '嘿，2023 年 5 月别辞职，留那支涨了 30 倍的票。'
  },
  code: {
    label: '一串代码',
    hint: '一小段能自己跑的程序',
    example: '// 每天自动转 10 块去理财\nwhile (true) {\n  save(10);\n  wait(86400000);\n}'
  },
  numbers: {
    label: '一串数字',
    hint: '彩票、股价、私钥——未来长这样',
    example: '20230501 600519 181.9 7 14 21 28 35 6 比特币 19600 卖出'
  }
};

/** 1KB 容量科普示例（第六幕） */
var CAPACITY_EXAMPLES = [
  { label: '约 500 个汉字', detail: '一封信写完一生的废话，或者三个字。', icon: 'letter' },
  { label: '一张 32×32 的位图', detail: '比一张邮票还糊，但足够画个笑脸。', icon: 'image' },
  { label: '一段 30 行的程序', detail: '如果它会自己跑，三年前的你会当场跪下。', icon: 'code' },
  { label: '一个钱包地址 + 私钥', detail: '三年前那点币，今天够你还完房贷。', icon: 'key' },
  { label: '一句「对不起」', detail: '占 27 字节。你犹豫的那 3 秒，它已经在路上了。', icon: 'heart' }
];

/** 示例信（一键填入，降低门槛） */
var SAMPLE_PACKETS = [
  { type: TYPE_TEXT, text: '嘿，两年后把房贷还清，别借给老刘，他跑路了。' },
  { type: TYPE_NUMBERS, text: '20230501 比特币 26800 全仓 半年后 69000 卖出' },
  { type: TYPE_CODE, text: 'while(true){ if(存款<1000000){ 每月存3000 } }' }
];

/** 评级区间（命运改变值） */
var GRADE_RULES = [
  { max: 20, name: '石沉大海', desc: '信到了，但三年前的你当它是垃圾短信。' },
  { max: 45, name: '半个信号', desc: '三年前的你读完愣了 10 秒，然后忘了。' },
  { max: 70, name: '有点东西', desc: '你被吓到了，真的开始查你说的事。' },
  { max: 100, name: '逆天改命', desc: '三年前的你连夜打电话给全家人。' }
];

/** 彩票中头奖概率（双色球口径，约 1/17,721,088） */
var LOTTERY_ODDS = 17721088;

/** 数字特征类型 */
var NUMBER_KIND_LOTTERY = 'lottery';
var NUMBER_KIND_PRICE = 'price';
var NUMBER_KIND_WALLET = 'wallet';
var NUMBER_KIND_OTHER = 'other';

/**
 * UTF-8 字节数统计（中文字符 3 字节，emoji 4 字节）
 * @param {string} str
 * @returns {number}
 */
function countBytes(str) {
  if (str == null) return 0;
  var bytes = 0;
  var i;
  for (i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      bytes += 4; // 代理对（emoji）
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * 1KB 占用百分比（0 为 0%，1000 表示 10 倍于 1KB）
 * @param {number} bytes
 * @returns {number}
 */
function percentOfKB(bytes) {
  return Math.round((bytes / KB) * 100);
}

/**
 * 1KB 格点可视化：64 格，每格代表 16 字节。
 * 返回 64 个布尔值，前 n 格为已占用。
 * @param {number} bytes
 * @returns {boolean[]}
 */
function packCells(bytes) {
  var total = 64;
  var filled = Math.min(total, Math.ceil(bytes / 16));
  var cells = [];
  var i;
  for (i = 0; i < total; i++) cells.push(i < filled);
  return cells;
}

/**
 * 打包一封信。
 * @param {string} type 信纸类型（text / code / numbers）
 * @param {string} text 信的内容
 * @returns {{type:string, text:string, bytes:number, ok:boolean, percent:number}}
 */
function buildPacket(type, text) {
  var safeText = text == null ? '' : String(text);
  var bytes = countBytes(safeText);
  return {
    type: type || TYPE_TEXT,
    text: safeText,
    bytes: bytes,
    ok: bytes > 0 && bytes <= KB,
    percent: percentOfKB(bytes)
  };
}

/**
 * 从文本里抽数字特征：彩票号码 / 价格 / 疑似私钥。
 * @param {string} text
 * @returns {{kind:string, value:string, matched:boolean}}
 */
function parseNumbers(text) {
  if (!text || !text.trim()) {
    return { kind: NUMBER_KIND_OTHER, value: '', matched: false };
  }
  var lower = text.toLowerCase();
  // 疑似私钥：base58check 开头为 5 / K / L 的长串（在原文上匹配，避免 toLowerCase 破坏字符集）
  var w = text.match(/(?:^|\s)([5KL][1-9A-HJ-NP-Za-km-z]{47,54})(?:\s|$)/i);
  if (w) return { kind: NUMBER_KIND_WALLET, value: w[1].slice(0, 12) + '…', matched: true };
  // 彩票号码：6 个 1-33 或 1-35 的数字 + 可选蓝球
  var l = text.match(/(?:彩票|双色球|大乐透)?\s*([1-9]|1\d|2\d|3[0-5])\s+([1-9]|1\d|2\d|3[0-5])\s+([1-9]|1\d|2\d|3[0-5])\s+([1-9]|1\d|2\d|3[0-5])\s+([1-9]|1\d|2\d|3[0-5])\s+([1-9]|1\d|2\d|3[0-5])(?:\s+([1-9]|1\d|2\d|3[0-5]))?/);
  if (l) return { kind: NUMBER_KIND_LOTTERY, value: l[0].trim(), matched: true };
  // 疑似价格：带货币符号或"比特币/股票/股价/买入/卖出"的数字
  var p = text.match(/(?:比特币|btc|股价|买入|卖出|涨|跌)[^\d]{0,6}([0-9]+(?:\.[0-9]+)?)/i);
  if (p) return { kind: NUMBER_KIND_PRICE, value: p[1], matched: true };
  return { kind: NUMBER_KIND_OTHER, value: '', matched: false };
}

/**
 * 可信度评分：三年前的你会信几分（0-100）。
 * 反直觉核心：信越像「未来的自己」、说得越多，越容易被当成恶作剧。
 * @param {string} text
 * @returns {number}
 */
function creditScore(text) {
  var t = text == null ? '' : String(text).trim();
  if (!t) return 0;
  var score = 50;

  // 具体年份、精确日期：穿越者气息太重，降信度
  if (/20\d{2}\s*年|\d{1,2}月\d{1,2}日|202[0-9]/.test(t)) score -= 6;
  // 指令明确（行动导向）：涨信度
  if (/(去买|去卖|别买|别卖|别辞职|快卖|全仓|清仓|别借|去做|千万别|记住|照做)/.test(t)) score += 16;
  // 像朋友的口吻：涨信度
  if (/(嘿|喂|兄弟|姐妹|相信我|真的|你听我说|别怕)/.test(t)) score += 8;
  // 情绪/口语：涨信度（真实的人不会用公文腔）
  if (/[!！？?]/.test(t)) score += 5;
  // 说太多反而像骗子
  if (t.length > 60) score -= 12;
  if (t.length > 120) score -= 10;
  // 咒骂/感慨：更真实
  if (/(操|靠|妈的|卧槽|后悔|醒醒|tm|傻)/.test(t)) score += 6;
  // 数字太多像诈骗短信
  var digitRatio = (t.match(/\d/g) || []).length / Math.max(1, t.length);
  if (digitRatio > 0.25) score -= 10;

  return clamp(score, 0, 100);
}

/**
 * 命运改变值（0-100）：衡量这封信对三年前人生的撬动程度。
 * 维度 = 可信度 × 类型基础值 × 额外加成。
 * @param {string} type
 * @param {string} text
 * @returns {number}
 */
function changeScore(type, text) {
  var t = text == null ? '' : String(text).trim();
  var credit = creditScore(t);
  var base;
  if (type === TYPE_NUMBERS) {
    var num = parseNumbers(t);
    if (num.kind === NUMBER_KIND_WALLET) base = 78;
    else if (num.kind === NUMBER_KIND_PRICE) base = 72;
    else if (num.kind === NUMBER_KIND_LOTTERY) base = 66;
    else base = 40;
  } else if (type === TYPE_CODE) {
    // 代码行数越多越接近可用的程序
    var lines = t.split('\n').length;
    base = 55 + Math.min(15, lines * 1.5);
  } else {
    base = 38;
  }
  // 可信度只有一半权重——就算不信，具体指令也可能被照做
  var change = Math.round(credit * 0.45 + base * 0.55);
  return clamp(change, 0, 100);
}

/**
 * 命运结算：返回评级与逐条分析。
 * @param {{type:string, text:string, bytes:number}} packet
 * @returns {{credit:number, change:number, grade:object, analyses:string[], verdict:string, num:object}}
 */
function settleFate(packet) {
  var type = packet.type;
  var text = packet.text;
  var credit = creditScore(text);
  var change = changeScore(type, text);
  var num = parseNumbers(text);
  var analyses = [];
  var verdict = '';

  if (type === TYPE_NUMBERS) {
    if (num.kind === NUMBER_KIND_LOTTERY) {
      analyses.push('这串号码的中奖概率约 1/' + LOTTERY_ODDS.toLocaleString() + '。');
      analyses.push('就算真中了，75% 的头奖得主 5 年内破产——你缺的可能不是号码。');
      verdict = '三年前的你会先查开奖，然后嘲笑自己 3 秒。';
    } else if (num.kind === NUMBER_KIND_PRICE) {
      analyses.push('你给的价格，假设按「买入持有三年」算，复利远比你想的凶。');
      analyses.push('真正的难点不是知道价格，是拿得住。');
      verdict = '三年前的你盯着这个数字，心跳比当时快三倍。';
    } else if (num.kind === NUMBER_KIND_WALLET) {
      analyses.push('这是私钥格式。三年前的你如果认识它，今天已经财务自由。');
      verdict = '这封信会改变一切——前提是它没被当成乱码删掉。';
    } else {
      analyses.push('一串数字，没有上下文。三年前的你只会觉得是短信验证码。');
      verdict = '数字没有故事，就是噪音。';
    }
  } else if (type === TYPE_CODE) {
    var lines = text.split('\n').length;
    analyses.push('这段代码有 ' + lines + ' 行，三年后它可能还在替你赚钱。');
    analyses.push('代码不会怀疑你——它只会执行。这是它比「人」可靠的地方。');
    verdict = credit >= 50
      ? '三年前的你把它抄在纸上，然后真的运行了。'
      : '三年前的你看到代码，以为是病毒，关了电脑。';
  } else {
    analyses.push('一句话，说给三年前的自己。');
    analyses.push('人会对「具体」低头，对「正确」摇头。');
    verdict = credit >= 60
      ? '三年前的你愣了一下，然后红了眼眶，照做了。'
      : '三年前的你说「神经病」，然后继续过原来的日子。';
  }

  if (credit < 40) {
    analyses.push('可信度太低——你写的太像「未来的自己」，当年的你只当是恶作剧。');
  }

  return {
    credit: credit,
    change: change,
    grade: gradeOf(change),
    analyses: analyses,
    verdict: verdict,
    num: num
  };
}

/**
 * 按命运改变值取评级
 * @param {number} change
 * @returns {{name:string, desc:string}}
 */
function gradeOf(change) {
  var i;
  for (i = 0; i < GRADE_RULES.length; i++) {
    if (change <= GRADE_RULES[i].max) return GRADE_RULES[i];
  }
  return GRADE_RULES[GRADE_RULES.length - 1];
}

/**
 * 数值截断到 [min, max]
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

var OneKbLetterNS = {
  KB: KB,
  TYPE_TEXT: TYPE_TEXT,
  TYPE_CODE: TYPE_CODE,
  TYPE_NUMBERS: TYPE_NUMBERS,
  TYPE_META: TYPE_META,
  CAPACITY_EXAMPLES: CAPACITY_EXAMPLES,
  SAMPLE_PACKETS: SAMPLE_PACKETS,
  GRADE_RULES: GRADE_RULES,
  LOTTERY_ODDS: LOTTERY_ODDS,
  NUMBER_KIND_LOTTERY: NUMBER_KIND_LOTTERY,
  NUMBER_KIND_PRICE: NUMBER_KIND_PRICE,
  NUMBER_KIND_WALLET: NUMBER_KIND_WALLET,
  NUMBER_KIND_OTHER: NUMBER_KIND_OTHER,
  countBytes: countBytes,
  percentOfKB: percentOfKB,
  packCells: packCells,
  buildPacket: buildPacket,
  parseNumbers: parseNumbers,
  creditScore: creditScore,
  changeScore: changeScore,
  settleFate: settleFate,
  gradeOf: gradeOf,
  clamp: clamp
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OneKbLetterNS;
}
if (typeof window !== 'undefined') {
  window.OneKbLetter = OneKbLetterNS;
}
