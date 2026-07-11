/**
 * logic.js — "人脑算力" demo 的核心纯逻辑
 *
 * 全部为无副作用的纯函数，方便用 node 直接单元测试，也在浏览器里挂到 window.BrainCompute。
 * 数据来源见文件底部 DATA_SOURCES。
 */

// ────────────────────────────────────────────────────────────
// 一、心算竞速：先 2 道简单题找回自信，第 3 道甩出大乘法制造落差
// ────────────────────────────────────────────────────────────

/**
 * 固定题序：前两题人能秒答，第三题人脑基本没戏。
 * hard 标记用于前端切换"落差"文案与配色。
 */
const MATH_ROUNDS = [
  { id: 1, a: 7,    b: 8,    op: '×', hard: false },
  { id: 2, a: 38,   b: 47,   op: '+', hard: false },
  { id: 3, a: 4832, b: 7691, op: '×', hard: true  },
];

/** 计算一道题的标准答案。 */
function computeAnswer(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    default: throw new Error('不支持的运算符: ' + op);
  }
}

/** 判定用户输入是否正确（容忍前后空格、逗号分隔）。 */
function checkMathAnswer(userInput, answer) {
  if (userInput === null || userInput === undefined) return false;
  const cleaned = String(userInput).replace(/[,\s]/g, '');
  if (cleaned === '') return false;
  return Number(cleaned) === answer;
}

/** 把毫秒数格式化为「x.xx 秒」。 */
function formatSeconds(ms) {
  return (ms / 1000).toFixed(2) + ' 秒';
}

// ────────────────────────────────────────────────────────────
// 二、反应时间：屏幕变色就点，测人脑"响应延迟"
// ────────────────────────────────────────────────────────────

/** 低于该阈值视为抢跳（还没看清就点了），不计入平均。 */
const ANTICIPATORY_MS = 100;

/**
 * 汇总多次反应测试。
 * @returns {{valid:number[], anticipatory:number, avg:number, best:number, hz:number}}
 */
function summarizeReaction(times) {
  const valid = times.filter((t) => typeof t === 'number' && t >= ANTICIPATORY_MS);
  const anticipatory = times.length - valid.length;
  if (valid.length === 0) {
    return { valid: [], anticipatory, avg: 0, best: 0, hz: 0 };
  }
  const avg = valid.reduce((s, t) => s + t, 0) / valid.length;
  const best = Math.min.apply(null, valid);
  return { valid, anticipatory, avg, best, hz: reactionToHz(avg) };
}

/**
 * 把一次反应时间粗略换算成"等效刷新频率"。
 * 仅用于类比人脑响应节奏，非严格神经学指标。
 */
function reactionToHz(ms) {
  if (!ms || ms <= 0) return 0;
  return 1000 / ms;
}

// ────────────────────────────────────────────────────────────
// 三、找猫：一堆干扰物里找唯一目标（视觉搜索 / pop-out）
// ────────────────────────────────────────────────────────────

/**
 * 构建 rows×cols 的网格，除目标格外全是干扰物。
 * @param {number} rows
 * @param {number} cols
 * @param {function} rng 返回 [0,1) 的随机函数，默认 Math.random（注入以便测试）
 * @returns {{cells:string[], targetIndex:number, rows:number, cols:number}}
 */
function buildGrid(rows, cols, rng) {
  if (rows <= 0 || cols <= 0) throw new Error('rows/cols 必须为正');
  const random = typeof rng === 'function' ? rng : Math.random;
  const total = rows * cols;
  const targetIndex = Math.floor(random() * total) % total;
  const cells = [];
  for (let i = 0; i < total; i++) {
    cells.push(i === targetIndex ? 'cat' : 'dog');
  }
  return { cells, targetIndex, rows, cols };
}

/** 判断点击的格子是不是目标。 */
function isHit(clickedIndex, targetIndex) {
  return clickedIndex === targetIndex;
}

// ────────────────────────────────────────────────────────────
// 四、接球预测：抛物线落点，展示大脑下意识的轨迹预测
// ────────────────────────────────────────────────────────────

/**
 * 给定初始位置/速度与重力，求物体回到地面高度 groundY 时的水平坐标。
 * 采用屏幕坐标系（y 向下为正），抛出时 vy 为负表示向上。
 * @returns {number} 落地时的 x 坐标
 */
function landingX(x0, y0, vx, vy, g, groundY) {
  if (g <= 0) throw new Error('重力 g 必须为正');
  // 解 y0 + vy*t + 0.5*g*t^2 = groundY，取正根
  const a = 0.5 * g;
  const b = vy;
  const c = y0 - groundY;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return x0; // 理论上不会发生（初始在地面上方）
  const t = (-b + Math.sqrt(disc)) / (2 * a);
  return x0 + vx * t;
}

/** 预测落点与真实落点的绝对误差（像素）。 */
function predictionError(guessX, actualX) {
  return Math.abs(guessX - actualX);
}

/**
 * 依据误差与容差给出评分（0-100）与评级。
 * 误差为 0 得 100 分；误差达到 tolerance 得 0 分。
 */
function scoreLanding(errorPx, tolerancePx) {
  if (tolerancePx <= 0) throw new Error('tolerance 必须为正');
  const score = Math.max(0, Math.round(100 * (1 - errorPx / tolerancePx)));
  let rating;
  if (score >= 90) rating = 'perfect';
  else if (score >= 70) rating = 'great';
  else if (score >= 40) rating = 'ok';
  else rating = 'miss';
  return { score, rating };
}

// ────────────────────────────────────────────────────────────
// 五、能效比：人脑 vs 超算，落点在"每瓦算力"
// ────────────────────────────────────────────────────────────

const BRAIN = {
  neurons: 8.6e10,     // 约 860 亿神经元（数量级估算）
  synapses: 1e14,      // 约 100 万亿突触（数量级估算）
  powerW: 20,          // 约 20 瓦
  flops: 1e18,         // 等效算力，约 1 EFLOP（学界有争议，数量级估算）
};

const FRONTIER = {
  name: 'Frontier 超级计算机',
  flops: 1.102e18,     // 约 1.1 EFLOP/s（TOP500）
  powerW: 21e6,        // 约 21 兆瓦（Green500）
};

/** 每瓦算力（FLOPS/W）。 */
function efficiency(flops, watts) {
  if (watts <= 0) throw new Error('功率必须为正');
  return flops / watts;
}

/** a 相对 b 的能效倍数。 */
function efficiencyRatio(a, b) {
  const ea = efficiency(a.flops, a.powerW);
  const eb = efficiency(b.flops, b.powerW);
  if (eb === 0) return 0;
  return ea / eb;
}

/** 把大数格式化为带中文单位的可读字符串（用于展示，非精确）。 */
function formatBig(n) {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const units = [
    { v: 1e12, s: '万亿' },
    { v: 1e8,  s: '亿' },
    { v: 1e4,  s: '万' },
  ];
  for (const u of units) {
    if (abs >= u.v) {
      return (n / u.v).toFixed(n / u.v >= 100 ? 0 : 1) + ' ' + u.s;
    }
  }
  return String(Math.round(n));
}

/** 科学计数法下的量级（10 的几次方），用于文案里说"约 10^x 倍"。 */
function orderOfMagnitude(n) {
  if (n <= 0) return 0;
  return Math.round(Math.log10(n));
}

// 数据来源（供文章与页面标注）
const DATA_SOURCES = {
  neurons: 'Azevedo et al. 2009 / Herculano-Houzel：人脑约 860 亿神经元',
  brainPower: '人脑功耗约占静息代谢 20%，常被引用为约 20 瓦',
  brainFlops: '人脑等效算力换算存在争议，本文取约 1 EFLOP 作数量级估算',
  frontier: 'TOP500 / Green500：Frontier 约 1.1 EFLOP/s，整机功耗约 21 MW',
};

// ────────────────────────────────────────────────────────────
// 六、排行榜综合评分（前端预览 + 后端权威计算必须保持同口径）
// ────────────────────────────────────────────────────────────

// 各项的映射区间：越接近 best 越接近满分，达到 worst 记 0 分。
const SCORE_BOUNDS = {
  reaction: { best: 150, worst: 450 }, // 反应延迟（ms），越小越好
  cat: { best: 400, worst: 3000 },     // 找猫耗时（ms），越小越好
  // 接球分本身就是 0-100
};

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** 把「越小越好」的耗时映射到 0-100 分。 */
function timeComponent(ms, best, worst) {
  return clamp01((worst - ms) / (worst - best)) * 100;
}

/**
 * 综合评分：反应 + 找猫 + 接球，每项 0-100，合计 0-300 的整数。
 * @param {number} reactionMs 平均反应延迟（毫秒）
 * @param {number} catMs 找猫耗时（毫秒）
 * @param {number} ballScore 接球得分（0-100）
 */
function computeScore(reactionMs, catMs, ballScore) {
  var r = timeComponent(reactionMs, SCORE_BOUNDS.reaction.best, SCORE_BOUNDS.reaction.worst);
  var c = timeComponent(catMs, SCORE_BOUNDS.cat.best, SCORE_BOUNDS.cat.worst);
  var b = clamp01((ballScore || 0) / 100) * 100;
  return Math.round(r + c + b);
}

/** 分项明细，供前端展示每一项拿了多少分。 */
function scoreBreakdown(reactionMs, catMs, ballScore) {
  return {
    reaction: Math.round(timeComponent(reactionMs, SCORE_BOUNDS.reaction.best, SCORE_BOUNDS.reaction.worst)),
    cat: Math.round(timeComponent(catMs, SCORE_BOUNDS.cat.best, SCORE_BOUNDS.cat.worst)),
    ball: Math.round(clamp01((ballScore || 0) / 100) * 100),
  };
}

/** 依据综合分（0-300）给出评级。 */
function gradeOf(score) {
  if (score >= 260) return { level: 'reflex', label: '神经反射级' };
  if (score >= 200) return { level: 'sharp', label: '身手不凡' };
  if (score >= 140) return { level: 'trained', label: '训练有素' };
  if (score >= 80) return { level: 'human', label: '普通人类' };
  return { level: 'rookie', label: '还需练习' };
}

const api = {
  MATH_ROUNDS,
  computeAnswer,
  checkMathAnswer,
  formatSeconds,
  ANTICIPATORY_MS,
  summarizeReaction,
  reactionToHz,
  buildGrid,
  isHit,
  landingX,
  predictionError,
  scoreLanding,
  BRAIN,
  FRONTIER,
  efficiency,
  efficiencyRatio,
  formatBig,
  orderOfMagnitude,
  DATA_SOURCES,
  SCORE_BOUNDS,
  computeScore,
  scoreBreakdown,
  gradeOf,
};

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
// 浏览器环境挂到 window
if (typeof window !== 'undefined') {
  window.BrainCompute = api;
}
