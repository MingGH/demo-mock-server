/**
 * brutalism-lab 纯逻辑层：与 DOM 完全解耦，便于 Node 单元测试。
 * 所有函数为纯函数，不操作 document / window。
 */

/**
 * 产品（虚构品牌，作为“普通商品页”载体）的固定内容。
 * @type {Object}
 */
var PRODUCT = {
  brand: '声止 SOUNDSTOP',
  name: '无线降噪头戴耳机 X1',
  price: 1299,
  tagline: '戴上那一刻，世界安静下来',
  desc: [
    '主动降噪 -45dB',
    '续航 60 小时',
    '蓝牙 5.4',
    '仅重 228g'
  ],
  cta: ['立即购买', '加入购物车']
};

/**
 * 六种设计手法案例配置。
 * 每项包含：id、名称、全屏关键词(keyPhrase)、配色、字体、简介、设计说明。
 * 文案为设计判断或可核查的事实，不使用夸张修辞。
 * @type {Array<Object>}
 */
var CASES = [
  {
    id: 'mega',
    name: '巨字排印',
    keyPhrase: '1299',
    tagline: '当价格成为版面本身',
    accent: '#ffd700',
    bg: '#0b0b0b',
    ink: '#f5f5f5',
    blurb: '拖动滑杆把字号推到极限，看其他信息如何让位。',
    principle: {
      history: '大字报头与街头海报的传统：字号本身承担信息层级。粗野主义网页常把它推到「一个元素就是一整版」的程度。',
      psyche: '设计判断：视野内只剩一个焦点时，浏览会退回到「看」本身，层级关系的变化因此变得可见。'
    }
  },
  {
    id: 'mono',
    name: '硬边网格',
    keyPhrase: '¥1299',
    tagline: '结构线与裸边框，去掉修饰',
    accent: '#ff6b6b',
    bg: '#f5f5f0',
    ink: '#111111',
    blurb: '切换结构线与硬边模式，看版面组织如何被强调。',
    principle: {
      history: 'Bloomberg Businessweek、Balenciaga 等站点把等宽字体与硬边框当作「结构本身」来展示。这一路数得名于建筑上的粗野主义（法文 béton brut，直译「粗混凝土」）。',
      psyche: '设计判断：暴露网格与接缝，会让读者注意到「页面是被组织出来的」，而不是被样式包住的。'
    }
  },
  {
    id: 'chaos',
    name: '错位拼贴',
    keyPhrase: '别吵',
    tagline: '网格被故意打破之后',
    accent: '#ce93d8',
    bg: '#0d1026',
    ink: '#e8e8ff',
    blurb: '拖动元素随意摆放，一键打散，再一键还原。',
    principle: {
      history: '打破网格是实验排版（如未来主义、达达招贴）与网页粗野主义共享的手法：用刻意的错位替代默认对齐。',
      psyche: '设计判断：预期被打破时，人会多看一眼去重新辨认秩序。错位是换取这一眼的代价。'
    }
  },
  {
    id: 'clash',
    name: '荧光对撞',
    keyPhrase: '安静',
    tagline: '醒目与可读之间的取舍',
    accent: '#ccff00',
    bg: '#7c3aed',
    ink: '#ccff00',
    blurb: '切换配色组合，看对比度数值与可读性结论一起变。',
    principle: {
      history: '高饱和撞色在粗野主义网页里常被用来对抗「安全」的配色习惯；WebAIM 等可读性标准为它划出了底线。',
      psyche: '设计判断：对比度决定可读性，醒目程度决定记忆点。把两者放在一起，取舍就看得见了。'
    }
  },
  {
    id: 'glitch',
    name: '信号故障',
    keyPhrase: 'SILENT',
    tagline: '按住降噪，画面安静下来',
    accent: '#00ffc8',
    bg: '#07070a',
    ink: '#d7fff2',
    blurb: '干扰来自可剥离的噪声层。按住降噪键，看它退潮。',
    principle: {
      history: '故障艺术（Glitch Art）把信号失真——色帧错位、扫描线、撕裂——当作创作材料。它与粗野主义共享「暴露机器」的态度，但属于另一条脉络。',
      psyche: '设计判断：让噪声与安静之间有一只可按住的开关，产品功能（降噪）就成了体验本身。'
    }
  },
  {
    id: 'marquee',
    name: '滚动字幕',
    keyPhrase: '戴上 世界 安静',
    tagline: '运动抓住注意力，速度你来定',
    accent: '#ffb74d',
    bg: '#24120b',
    ink: '#ffe9cc',
    blurb: '调节速度、随时暂停。字幕无缝循环。',
    principle: {
      history: '循环滚动文本来自影院招牌与电视跑马灯；网页粗野主义常用它制造「时间在走」的压迫感。',
      psyche: '设计判断：持续运动能接住快速划动的视线，但速度必须交给用户控制，否则只剩干扰。'
    }
  }
];

/** 巨字案例的字号滑杆范围（0-100）。@type {{min:number,max:number,step:number}} */
var MEGA_RANGE = { min: 0, max: 100, step: 1 };

/** 滚动字幕的速度范围（倍率）。@type {{min:number,max:number,step:number}} */
var MARQUEE_SPEED = { min: 0.25, max: 3, step: 0.25 };

/** 速度为 1 倍时滚完半程（即一个内容拷贝宽度）的秒数。@type {number} */
var MARQUEE_BASE_SECONDS = 18;

/**
 * 撞色案例的候选配色组合。
 * @type {Array<{name:string,bg:string,fg:string}>}
 */
var COLOR_PAIRS = [
  { name: '荧光绿 × 紫罗兰', bg: '#7c3aed', fg: '#ccff00' },
  { name: '电光蓝 × 纯黑', bg: '#0b0b0b', fg: '#00e5ff' },
  { name: '荧光黄 × 品红', bg: '#ff2d78', fg: '#ffd600' },
  { name: '暖橙 × 藏蓝', bg: '#1b2a6b', fg: '#ff7a45' }
];

/**
 * 将十六进制颜色转为 {r,g,b}。
 * @param {string} hex 形如 "#ffd700" 或 "#fff"
 * @returns {{r:number,g:number,b:number}|null} 非法输入返回 null
 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  var h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h.split('').map(function (c) { return c + c; }).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

/**
 * 计算相对亮度（WCAG 定义）。
 * @param {string} hex 颜色
 * @returns {number} 0-1，非法输入按黑色处理
 */
function luminance(hex) {
  var rgb = hexToRgb(hex);
  if (!rgb) return 0;
  var lin = function (v) {
    var c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/**
 * 计算两个颜色的对比度（WCAG 对比度比率）。
 * @param {string} a 颜色 A
 * @param {string} b 颜色 B
 * @returns {number} 对比度，最小 1，最大 21；非法输入按黑色处理
 */
function contrastRatio(a, b) {
  var la = luminance(a);
  var lb = luminance(b);
  var hi = Math.max(la, lb);
  var lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 判断对比度是否达到 WCAG AA 大字标准（3:1）。
 * @param {number} ratio 对比度
 * @returns {boolean}
 */
function aaLarge(ratio) {
  return typeof ratio === 'number' && ratio >= 3;
}

/**
 * 计算一个背景色上应使用的文字颜色（黑或白）。
 * @param {string} bgHex 背景色
 * @returns {string} "#000000" 或 "#ffffff"
 */
function contrastText(bgHex) {
  var l = luminance(bgHex);
  if (!hexToRgb(bgHex)) return '#ffffff';
  return l > 0.3 ? '#000000' : '#ffffff';
}

/**
 * 生成某案例要注入到弹层根节点的 CSS 变量。
 * @param {Object} cfg 案例配置
 * @returns {Object} 键为 "--xxx" 的 CSS 变量映射
 */
function themeVars(cfg) {
  return {
    '--case-bg': cfg.bg,
    '--case-ink': cfg.ink,
    '--case-accent': cfg.accent,
    '--case-on-ink': contrastText(cfg.bg)
  };
}

/**
 * 数值夹取。
 * @param {number} v 输入
 * @param {number} min 下限
 * @param {number} max 上限
 * @returns {number}
 */
function clamp(v, min, max) {
  var n = Number(v);
  if (isNaN(n)) n = min;
  return Math.min(max, Math.max(min, n));
}

/**
 * 巨字案例布局：滑杆值 → 字号（vw）与其他元素透明度。
 * 设计意图：字号超过 70 后，其余元素退场，观察信息层级的坍缩。
 * @param {number} t 滑杆值 0-100
 * @returns {{fontSizeVw:number, othersOpacity:number}}
 */
function megaLayout(t) {
  var v = clamp(t, MEGA_RANGE.min, MEGA_RANGE.max);
  var fontSizeVw = 10 + (v / 100) * 26; // 10vw → 36vw
  var othersOpacity = v <= 70 ? 1 : Math.max(0.12, 1 - ((v - 70) / 30) * 0.88);
  return { fontSizeVw: fontSizeVw, othersOpacity: othersOpacity };
}

/**
 * 滚动字幕：速度倍率 → 半程动画时长（秒）。
 * @param {number} speed 速度倍率
 * @returns {number} 时长秒数
 */
function marqueeDuration(speed) {
  var s = clamp(speed, MARQUEE_SPEED.min, MARQUEE_SPEED.max);
  return MARQUEE_BASE_SECONDS / s;
}

/**
 * 生成跑马灯内容。为做到无缝循环，重复轮数强制向上取偶，
 * 使内容由两个完全相同的半份组成。
 * @param {Array<string>} segments 台词片段
 * @param {number} repeats 期望重复轮数
 * @param {string} sep 片段间的分隔符
 * @returns {Array<string>} 展平的片段数组（总长度为偶数个周期）
 */
function makeMarquee(segments, repeats, sep) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  var r = clamp(Math.floor(Number(repeats) || 1), 1, 64);
  if (r % 2 !== 0) r += 1; // 强制偶数：保证前后两半完全相同
  var out = [];
  for (var i = 0; i < r; i++) {
    segments.forEach(function (s) {
      out.push(s + (sep || ''));
    });
  }
  return out;
}

/**
 * 各案例的默认交互状态。
 * @param {string} caseId 案例 id
 * @returns {Object|null} 未知 id 返回 null
 */
function defaultState(caseId) {
  switch (caseId) {
    case 'mega': return { scale: 35 };
    case 'mono': return { grid: true, hard: true };
    case 'chaos': return { scattered: false };
    case 'clash': return { pair: 0 };
    case 'glitch': return { noise: 1 };
    case 'marquee': return { speed: 1, paused: false };
    default: return null;
  }
}

/**
 * 重置某一个案例的状态，其余案例状态原样保留。
 * @param {Object} states 全部状态表
 * @param {string} caseId 要重置的案例 id
 * @returns {Object} 新的状态表（不修改入参）
 */
function resetCaseState(states, caseId) {
  var next = Object.assign({}, states);
  next[caseId] = defaultState(caseId);
  return next;
}

/**
 * 模拟商店的购买/加购反馈。
 * @param {string} kind 'buy' | 'cart'
 * @param {number} count 当前购物车件数
 * @returns {{count:number, message:string}|null} 未知 kind 返回 null
 */
function purchaseFeedback(kind, count) {
  var n = Math.max(0, Math.floor(Number(count) || 0));
  if (kind === 'buy') {
    return { count: n, message: '已下单（模拟）。这是演示商店，不会产生真实订单。' };
  }
  if (kind === 'cart') {
    var next = n + 1;
    return { count: next, message: '已加入购物车（模拟）· 共 ' + next + ' 件' };
  }
  return null;
}

/**
 * 确定性伪随机数生成器（mulberry32），便于测试复现。
 * @param {number} seed 种子
 * @returns {Function} 每次调用返回 [0,1)
 */
function seededRandom(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成一组确定性的打散偏移（供错位拼贴案例使用）。
 * @param {number} count 数量
 * @param {number} amplitude 最大偏移像素
 * @param {number} seed 种子
 * @returns {Array<{x:number,y:number,rot:number}>}
 */
function buildJitterOffsets(count, amplitude, seed) {
  var rnd = seededRandom(seed);
  var out = [];
  var n = Math.max(0, Math.floor(count));
  for (var i = 0; i < n; i++) {
    out.push({
      x: (rnd() * 2 - 1) * amplitude,
      y: (rnd() * 2 - 1) * (amplitude * 0.5),
      rot: (rnd() * 2 - 1) * 10
    });
  }
  return out;
}

/**
 * 将数字格式化为带千位分隔的价格字符串。
 * @param {number} price 价格
 * @param {string} currency 货币符号
 * @returns {string}
 */
function formatPrice(price, currency) {
  var n = Math.round(Number(price) || 0).toString();
  var out = '';
  var count = 0;
  for (var i = n.length - 1; i >= 0; i--) {
    out = n.charAt(i) + out;
    count++;
    if (count % 3 === 0 && i !== 0) out = ',' + out;
  }
  return (currency || '') + out;
}

/**
 * 案例列表中的下一个/上一个索引（循环）。
 * @param {number} current 当前索引
 * @param {number} total 总数
 * @returns {{next:number, prev:number}}
 */
function navIndexes(current, total) {
  var t = Math.max(1, Math.floor(total));
  var c = ((Math.floor(current) % t) + t) % t;
  return {
    next: (c + 1) % t,
    prev: (c - 1 + t) % t
  };
}

var BTLAB_EXPORTS = {
  PRODUCT: PRODUCT,
  CASES: CASES,
  MEGA_RANGE: MEGA_RANGE,
  MARQUEE_SPEED: MARQUEE_SPEED,
  MARQUEE_BASE_SECONDS: MARQUEE_BASE_SECONDS,
  COLOR_PAIRS: COLOR_PAIRS,
  hexToRgb: hexToRgb,
  luminance: luminance,
  contrastRatio: contrastRatio,
  aaLarge: aaLarge,
  contrastText: contrastText,
  themeVars: themeVars,
  clamp: clamp,
  megaLayout: megaLayout,
  marqueeDuration: marqueeDuration,
  makeMarquee: makeMarquee,
  defaultState: defaultState,
  resetCaseState: resetCaseState,
  purchaseFeedback: purchaseFeedback,
  seededRandom: seededRandom,
  buildJitterOffsets: buildJitterOffsets,
  formatPrice: formatPrice,
  navIndexes: navIndexes
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BTLAB_EXPORTS;
}
if (typeof window !== 'undefined') {
  window.BTLAB = BTLAB_EXPORTS;
}