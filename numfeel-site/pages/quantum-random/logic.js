/**
 * logic.js — "怎样做到绝对随机" demo 的核心纯逻辑
 *
 * 全部为无副作用的纯函数，方便用 node 直接单元测试，也在浏览器里挂到 window.QuantumRandom。
 *
 * 核心问题：纯软件算法（PRNG）给定种子输出完全可复现；要拿真随机必须向物理世界取熵。
 * 本模块把"字节流 → 号码"的纯逻辑抽出来：拒绝采样消除取模偏差、Fisher–Yates 无偏抽取不重复号码。
 *
 * 数据来源见文件底部 DATA_SOURCES。
 */

// ────────────────────────────────────────────────────────────
// 一、熵源常量
// ────────────────────────────────────────────────────────────

/** 熵源标识。 */
const SOURCE_QUANTUM = 'quantum';           // ANU QRNG 真空量子涨落
const SOURCE_ATMOSPHERIC = 'atmospheric';   // random.org 大气噪声
const SOURCE_SECURE = 'secure';             // 本地 SecureRandom / crypto.getRandomValues（CSPRNG，非真随机）

/** 熵源展示名。 */
const SOURCE_LABELS = {
  quantum: '量子真空涨落 (ANU)',
  atmospheric: '大气噪声 (random.org)',
  secure: '密码学安全 (本地兜底)',
};

/** 熵源额外说明（教学用，标注"严格讲 τoυ 不算真随机"等）。 */
const SOURCE_NOTES = {
  quantum: '测量真空量子涨落，原理上不可预测。',
  atmospheric: '大气噪声是确定性混沌，实践中不可预测但原理上可推。',
  secure: 'CSPRNG：密码学安全，但仍属伪随机，给定内部状态理论可复现。',
};

// ────────────────────────────────────────────────────────────
// 二、无偏映射：字节 → 区间内整数（拒绝采样消除取模偏差）
// ────────────────────────────────────────────────────────────

/**
 * 从一段随机字节里，用拒绝采样（rejection sampling）无偏地取一个 [0, range) 内的整数。
 *
 * 直接 `byte % range` 会让前 (256 % range) 个号码概率偏高，这就是 modulo bias。
 * 拒绝采样做法：取字节的有效范围是 0..255，令 limit = 256 - (256 % range)，
 * 落在 [0, limit) 的字节取模到目标区间，越界的字节丢弃、继续消费下一段字节。
 *
 * 这样每个号码概率完全相等。耗字节数不确定（最坏需要多取几次），但平均约 1.x 个字节。
 *
 * @param {number[]|Uint8Array} bytes 随机字节序列
 * @param {number} range 目标区间大小（>0）
 * @param {object} state 可选的游标对象 { idx }，跨多次调用延续；不传则从 0 开始
 * @returns {number|null} [0,range) 内的整数；字节耗尽返回 null
 */
function sampleUniform(bytes, range, state) {
  if (range <= 0) throw new Error('range 必须为正');
  if (range === 1) return 0;
  var idx = (state && typeof state.idx === 'number') ? state.idx : 0;
  var limit = 256 - (256 % range);
  var guard = 0;
  while (idx < bytes.length) {
    var b = bytes[idx++] & 0xff;
    if (b < limit) {
      if (state) state.idx = idx;
      return b % range;
    }
    // 越界字节丢弃，继续消费下一段
    if (++guard > 4096) {
      if (state) state.idx = idx;
      return null; // 防止极端输入死循环
    }
  }
  if (state) state.idx = idx;
  return null; // 字节耗尽
}

/**
 * 一次取多字节作"大数"再做拒绝采样，能显著降低拒绝率（range 较大时尤其明显）。
 * 用字节窗口 windowBytes 拼成一个大整数 n ∈ [0, 2^(8*window))，
 * 令 limit = 2^(8*window) - (2^(8*window) % range)，落在 [0, limit) 的取模到目标区间。
 *
 * @param {number[]|Uint8Array} bytes 随机字节序列
 * @param {number} range 目标区间大小
 * @param {number} windowBytes 一次消费的字节数（默认 2）
 * @param {object} state 游标 { idx }
 * @returns {number|null}
 */
function sampleUniformWide(bytes, range, windowBytes, state) {
  if (range <= 0) throw new Error('range 必须为正');
  if (range === 1) return 0;
  var w = windowBytes || 2;
  var span = Math.pow(256, w);            // 窗口能表示的取值总数
  var limit = span - (span % range);
  if (limit === 0) limit = span;           // range > span 时退化为全窗口接收，外层应保证 range <= span
  var idx = (state && typeof state.idx === 'number') ? state.idx : 0;
  var guard = 0;
  while (idx + w <= bytes.length) {
    var n = 0;
    for (var k = 0; k < w; k++) {
      n = n * 256 + (bytes[idx + k] & 0xff);
    }
    idx += w;
    if (n < limit) {
      if (state) state.idx = idx;
      return n % range;
    }
    if (++guard > 4096) {
      if (state) state.idx = idx;
      return null;
    }
  }
  if (state) state.idx = idx;
  return null;
}

/**
 * 自适应窗口：根据 range 选合适的字节数，避免 range > 256 时单字节永远装不下。
 * 规则：窗口能表示的范围 >= range 才有意义。
 */
function windowForRange(range) {
  var w = 1;
  var cap = 256;
  while (cap < range && w < 8) {
    w++;
    cap *= 256;
  }
  return w;
}

/**
 * 取 [0, range) 的无偏整数（自动选窗口）。
 * 这是给上层抽取号码用的统一入口。
 */
function drawInt(bytes, range, state) {
  var w = windowForRange(range);
  if (w === 1) return sampleUniform(bytes, range, state);
  return sampleUniformWide(bytes, range, w, state);
}

// ────────────────────────────────────────────────────────────
// 三、不重复号码抽取：Fisher–Yates 部分 shuffle + 无偏索引
// ────────────────────────────────────────────────────────────

/**
 * 从 [min, max] 共 (max-min+1) 个号码里无偏地抽 count 个不重复号码，升序返回。
 * 内部对"候选池"做 Fisher–Yates：每轮用无偏随机索引从剩余池里挑一个，避免重复。
 *
 * 用纯字节驱动：所有随机索引都走 drawInt（拒绝采样），保证每个号码等概率且不重复。
 *
 * @param {number[]|Uint8Array} bytes 熵源字节
 * @param {number} count 要抽几个
 * @param {number} min 最小号码（含）
 * @param {number} max 最大号码（含）
 * @returns {number[]|null} 升序号码数组；字节不足返回 null
 */
function pickUnique(bytes, count, min, max) {
  var pool = max - min + 1;
  if (count <= 0) return [];
  if (count > pool) throw new Error('count 超过可选范围');
  if (count === pool) {
    var all = [];
    for (var i = min; i <= max; i++) all.push(i);
    return all;
  }
  var candidates = [];
  for (var j = min; j <= max; j++) candidates.push(j);
  var state = { idx: 0 };
  var picked = [];
  for (var k = 0; k < count; k++) {
    var remaining = candidates.length;
    // Fisher–Yates：从 [0, remaining) 无偏取一个位置
    var r = drawInt(bytes, remaining, state);
    if (r == null) return null; // 字节不够了
    picked.push(candidates[r]);
    // 把用掉的位置换成末尾元素并弹出，O(1) 维护候选池
    candidates[r] = candidates[remaining - 1];
    candidates.pop();
  }
  picked.sort(function (a, b) { return a - b; });
  return picked;
}

// ────────────────────────────────────────────────────────────
// 四、彩票规则
// ────────────────────────────────────────────────────────────

/** 双色球规则：红球 6 个 (01–33 不重复) + 蓝球 1 个 (01–16)。 */
const SSQ = { name: '双色球', red: { count: 6, min: 1, max: 33 }, blue: { count: 1, min: 1, max: 16 } };

/** 大乐透规则：前区 5 个 (01–35 不重复) + 后区 2 个 (01–12 不重复)。 */
const DLT = { name: '大乐透', front: { count: 5, min: 1, max: 35 }, back: { count: 2, min: 1, max: 12 } };

/**
 * 估算一注双色球大约需要多少随机字节（用于向后端请求合适长度）。
 * 留出冗余以应对拒绝采样的丢弃。每位号码最坏可能消耗多个字节。
 */
function estimateBytes(rule) {
  // 经验上每抽一个无偏号码平均 < 2 字节，留 4 倍冗余保证一次成功率高
  var nums = rule.red.count + rule.blue.count;
  return Math.max(128, nums * 16);
}
function estimateBytesDlt() {
  var nums = DLT.front.count + DLT.back.count;
  return Math.max(128, nums * 16);
}

/**
 * 用给定字节摇一注双色球。
 * @returns {{red:number[], blue:number, source?:string, provider?:string}}
 */
function drawSsq(bytes) {
  var state = { idx: 0 };
  var red = pickUniqueFromState(bytes, state, SSQ.red.count, SSQ.red.min, SSQ.red.max);
  if (!red) return null;
  var blue = drawInt(bytes, SSQ.blue.max - SSQ.blue.min + 1, state);
  if (blue == null) return null;
  return { red: red, blue: blue + SSQ.blue.min };
}

/**
 * 用给定字节摇一注大乐透。
 * @returns {{front:number[], back:number[]}|null}
 */
function drawDlt(bytes) {
  var state = { idx: 0 };
  var front = pickUniqueFromState(bytes, state, DLT.front.count, DLT.front.min, DLT.front.max);
  if (!front) return null;
  var back = pickUniqueFromState(bytes, state, DLT.back.count, DLT.back.min, DLT.back.max);
  if (!back) return null;
  return { front: front, back: back };
}

// pickUnique 复用同一个 state（跨多次调用延续游标）的版本
function pickUniqueFromState(bytes, state, count, min, max) {
  var pool = max - min + 1;
  if (count > pool) throw new Error('count 超过可选范围');
  if (count === pool) {
    var all = [];
    for (var i = min; i <= max; i++) all.push(i);
    state.idx = (state.idx || 0); // 不消耗字节
    return all;
  }
  var candidates = [];
  for (var j = min; j <= max; j++) candidates.push(j);
  var picked = [];
  for (var k = 0; k < count; k++) {
    var remaining = candidates.length;
    var r = drawInt(bytes, remaining, state);
    if (r == null) return null;
    picked.push(candidates[r]);
    candidates[r] = candidates[remaining - 1];
    candidates.pop();
  }
  picked.sort(function (a, b) { return a - b; });
  return picked;
}

// ────────────────────────────────────────────────────────────
// 五、固定位数 / 区间随机数
// ────────────────────────────────────────────────────────────

/**
 * 生成 count 个 [min, max] 内无偏随机整数（允许重复）。
 */
function drawDigits(bytes, count, min, max) {
  var range = max - min + 1;
  if (range <= 0) throw new Error('min 必须小于等于 max');
  var state = { idx: 0 };
  var out = [];
  for (var i = 0; i < count; i++) {
    var v = drawInt(bytes, range, state);
    if (v == null) return null;
    out.push(v + min);
  }
  return out;
}

/** 生成固定位数的数字字符串（首位不为 0，避免短一位）。 */
function drawFixedDigitString(bytes, length) {
  if (length <= 0) throw new Error('位数必须为正');
  var state = { idx: 0 };
  // 首位 1–9
  var first = drawInt(bytes, 9, state);
  if (first == null) return null;
  var chars = [String(first + 1)];
  for (var i = 1; i < length; i++) {
    var d = drawInt(bytes, 10, state);
    if (d == null) return null;
    chars.push(String(d));
  }
  return chars.join('');
}

// ────────────────────────────────────────────────────────────
// 六、本地熵源（SecureRandom / crypto.getRandomValues）
// ────────────────────────────────────────────────────────────

/**
 * 用浏览器/Node 的密码学安全随机源生成 N 个随机字节。
 * 这是兜底熵源，不是真随机，但密码学安全。
 */
function secureBytes(count) {
  var arr = new Uint8Array(count);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else if (typeof require === 'function') {
    // Node 环境
    var nodeCrypto = require('crypto');
    var buf = nodeCrypto.randomBytes(count);
    for (var i = 0; i < count; i++) arr[i] = buf[i];
  } else {
    // 兜底（极端环境），用 Math.random，标注一下
    for (var j = 0; j < count; j++) arr[j] = Math.floor(Math.random() * 256);
  }
  return Array.prototype.slice.call(arr);
}

/** 用 Math.random 生成 N 个随机字节——仅用于"伪随机对照组"展示。 */
function pseudoBytes(count) {
  var arr = [];
  for (var i = 0; i < count; i++) arr.push(Math.floor(Math.random() * 256));
  return arr;
}

// ────────────────────────────────────────────────────────────
// 七、统计辅助：用于"随机性体检"
// ────────────────────────────────────────────────────────────

/**
 * 把字节序列统计成 16 个桶（高 4 bit）的频次，用于直方图对比。
 * 直观看出"伪随机"和"真随机"在分布上有没有肉眼可见的偏向。
 * （注意：大样本下两者分布都接近均匀；差异主要体现在可预测性，不是直方图。
 *   这个面板的目的是让人亲眼看"长得一样"的东西，本质却完全不同。）
 */
function byteHistogram(bytes, bins) {
  var n = bins || 16;
  var buckets = new Array(n).fill(0);
  for (var i = 0; i < bytes.length; i++) {
    var v = bytes[i] & 0xff;
    buckets[Math.floor(v * n / 256)]++;
  }
  return buckets;
}

/**
 * 卡方统计量：observed 频次数组与期望均匀分布的偏离程度。
 * 值越大越偏离均匀。仅供"体检面板"展示，非严格假设检验。
 */
function chiSquare(observed) {
  var total = 0;
  for (var i = 0; i < observed.length; i++) total += observed[i];
  if (total === 0) return 0;
  var expected = total / observed.length;
  var chi = 0;
  for (var j = 0; j < observed.length; j++) {
    var d = observed[j] - expected;
    chi += d * d / expected;
  }
  return chi;
}

/**
 * 把号码补零到两位字符串展示（01–33）。
 */
function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * 把摇好的双色球号码格式化为可分享的字符串。
 */
function formatSsq(r) {
  return '红球 ' + r.red.map(pad2).join(' ') + ' ｜ 蓝球 ' + pad2(r.blue);
}

/** 把摇好的大乐透号码格式化为可分享的字符串。 */
function formatDlt(r) {
  return '前区 ' + r.front.map(pad2).join(' ') + ' ｜ 后区 ' + r.back.map(pad2).join(' ');
}

/** 熵源徽章：根据 source + 是否降级，给出展示文案和颜色 class。 */
function sourceBadge(actualSource, degraded) {
  var label = SOURCE_LABELS[actualSource] || actualSource;
  if (degraded) {
    return { text: '已降级为 ' + label, cls: 'badge-degraded', icon: 'ti-alert-triangle' };
  }
  var clsMap = {
    quantum: 'badge-quantum',
    atmospheric: 'badge-atmospheric',
    secure: 'badge-secure',
  };
  var iconMap = {
    quantum: 'ti-atom',
    atmospheric: 'ti-wind',
    secure: 'ti-lock',
  };
  return { text: label, cls: clsMap[actualSource] || 'badge-secure', icon: iconMap[actualSource] || 'ti-lock' };
}

// ────────────────────────────────────────────────────────────
// 八、API 调用封装（异步，给 app.js 用；测试里不依赖网络）
// ────────────────────────────────────────────────────────────

var API_BASE = 'https://numfeel-api.996.ninja';

/**
 * 向后端请求一段随机字节（指定熵源）。
 * 后端是熵源链：quantum 优先 → 失败降级 atmospheric → 再降级 secure。
 * 返回 { bytes:number[], source:string, provider:string, degraded:boolean }。
 *
 * @param {number} count 需要的字节数
 * @param {string} requestedSource 想用的熵源：quantum|atmospheric|secure
 */
function fetchBytes(count, requestedSource) {
  var url = API_BASE + '/random/bytes?count=' + count;
  if (requestedSource) url += '&source=' + encodeURIComponent(requestedSource);
  return fetch(url)
    .then(function (r) { return r.json().then(function (j) { return { http: r.status, json: j }; }); })
    .then(function (res) {
      var j = res.json;
      if (j && j.status === 200 && j.data) {
        return {
          bytes: (j.data.bytes || j.data || []).slice(),
          source: j.data.source || j.source || 'secure',
          provider: j.data.provider || j.provider || '',
          degraded: !!(j.data.degraded || j.degraded),
        };
      }
      // 后端不可达：前端本地兜底用 crypto.getRandomValues，诚实标注
      return {
        bytes: secureBytes(count),
        source: 'secure',
        provider: '前端 crypto.getRandomValues（后端不可达）',
        degraded: true,
      };
    })
    .catch(function () {
      return {
        bytes: secureBytes(count),
        source: 'secure',
        provider: '前端 crypto.getRandomValues（后端不可达）',
        degraded: true,
      };
    });
}

// 数据来源（供文章与页面标注）
var DATA_SOURCES = {
  anu: '澳大利亚国立大学 ANU QRNG：用激光零差探测测量真空量子涨落产生真随机（quantumnumbers.anu.edu.au / qrng.anu.edu.au）',
  randomOrg: 'random.org：用大气噪声作为熵源（random.org）',
  cloudflare: 'Cloudflare LavaRand：熔岩灯阵列作为熵源（blog.cloudflare.com）',
  moduloBias: '取模偏差（modulo bias）：直接 byte % range 会让部分号码概率偏高，须用拒绝采样修正',
};

var api = {
  SOURCE_QUANTUM: SOURCE_QUANTUM,
  SOURCE_ATMOSPHERIC: SOURCE_ATMOSPHERIC,
  SOURCE_SECURE: SOURCE_SECURE,
  SOURCE_LABELS: SOURCE_LABELS,
  SOURCE_NOTES: SOURCE_NOTES,
  SSQ: SSQ,
  DLT: DLT,
  sampleUniform: sampleUniform,
  sampleUniformWide: sampleUniformWide,
  windowForRange: windowForRange,
  drawInt: drawInt,
  pickUnique: pickUnique,
  pickUniqueFromState: pickUniqueFromState,
  estimateBytes: estimateBytes,
  estimateBytesDlt: estimateBytesDlt,
  drawSsq: drawSsq,
  drawDlt: drawDlt,
  drawDigits: drawDigits,
  drawFixedDigitString: drawFixedDigitString,
  secureBytes: secureBytes,
  pseudoBytes: pseudoBytes,
  byteHistogram: byteHistogram,
  chiSquare: chiSquare,
  pad2: pad2,
  formatSsq: formatSsq,
  formatDlt: formatDlt,
  sourceBadge: sourceBadge,
  fetchBytes: fetchBytes,
  API_BASE: API_BASE,
  DATA_SOURCES: DATA_SOURCES,
};

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
// 浏览器环境挂到 window
if (typeof window !== 'undefined') {
  window.QuantumRandom = api;
}