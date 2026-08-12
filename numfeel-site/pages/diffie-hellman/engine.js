/**
 * Diffie-Hellman 密钥交换 — 核心逻辑引擎。
 *
 * 包含三部分：
 *  1. 颜色混合直观版：如何用"混合色"隐喻模幂运算
 *  2. 数学版：modPow 快速幂、DH 密钥交换计算
 *  3. 原理判断题：5 题题库与判分
 *
 * 纯逻辑模块：不操作 DOM，可在 Node 中直接 require 测试。
 */

/** 基准色（公开约定，Eve 也知道） */
var BASE_COLOR = { r: 255, g: 215, b: 0 }; // 金色 #ffd700

/** 秘密色候选（Alice/Bob 从这些里选，值不同才能体现交换） */
var SECRET_COLORS = {
  red:    { name: '红', r: 220, g: 40, b: 40 },
  green:  { name: '绿', r: 40, g: 180, b: 70 },
  blue:   { name: '蓝', r: 40, g: 90, b: 220 },
  purple: { name: '紫', r: 150, g: 60, b: 200 },
  orange: { name: '橙', r: 240, g: 130, b: 30 },
  cyan:   { name: '青', r: 40, g: 190, b: 200 }
};

/**
 * 混合两种颜色（通道取平均）。
 * 隐喻：混合色 = g^秘密数 mod p，公开可看但难以还原成分。
 * 注意：二元平均不可结合，仅用于展示"公开混合色"；
 * 最终共享色用 mixColor3 三色一次平均，保证双方天然一致。
 * @param {Object} c1 颜色 {r,g,b}
 * @param {Object} c2 颜色 {r,g,b}
 * @returns {Object} 混合后颜色
 */
function mixColor(c1, c2) {
  return {
    r: Math.round((c1.r + c2.r) / 2),
    g: Math.round((c1.g + c2.g) / 2),
    b: Math.round((c1.b + c2.b) / 2)
  };
}

/**
 * 三色混合（基准色 + 两个秘密色），用于最终共享色。
 * 一次平均，与顺序无关：mix3(B,R,G) === mix3(B,G,R)。
 * @param {Object} c1 颜色 {r,g,b}
 * @param {Object} c2 颜色 {r,g,b}
 * @param {Object} c3 颜色 {r,g,b}
 * @returns {Object} 三色平均
 */
function mixColor3(c1, c2, c3) {
  return {
    r: Math.round((c1.r + c2.r + c3.r) / 3),
    g: Math.round((c1.g + c2.g + c3.g) / 3),
    b: Math.round((c1.b + c2.b + c3.b) / 3)
  };
}

/**
 * 快速幂取模：base^exp mod mod。
 * 使用平方取幂，避免大数溢出；JS 数字精度在 2^53 内，本 demo 参数规模安全。
 * @param {number} base 底数
 * @param {number} exp 指数（非负整数）
 * @param {number} mod 模数（正整数）
 * @returns {number} base^exp mod mod
 */
function modPow(base, exp, mod) {
  if (mod <= 0) {
    throw new Error('mod must be positive');
  }
  if (exp < 0) {
    throw new Error('exp must be non-negative');
  }
  var result = 1 % mod;
  var b = base % mod;
  var e = exp;
  while (e > 0) {
    if (e % 2 === 1) {
      result = (result * b) % mod;
    }
    b = (b * b) % mod;
    e = Math.floor(e / 2);
  }
  return result;
}

/**
 * 计算 Diffie-Hellman 交换的公开量与共享密钥。
 * @param {number} p 公开素数
 * @param {number} g 公开底数
 * @param {number} a Alice 的秘密数
 * @param {number} b Bob 的秘密数
 * @returns {Object} { A, B, sharedAlice, sharedBob, shared, eveSees }
 */
function dhExchange(p, g, a, b) {
  var A = modPow(g, a, p);
  var B = modPow(g, b, p);
  var sharedAlice = modPow(B, a, p);
  var sharedBob = modPow(A, b, p);
  return {
    A: A,
    B: B,
    sharedAlice: sharedAlice,
    sharedBob: sharedBob,
    shared: sharedAlice,
    eveSees: {
      p: p, g: g, A: A, B: B
    }
  };
}

/**
 * 质数判断（供 UI 校验 p 是否为素数，提示用户）。
 * @param {number} n 正整数
 * @returns {boolean}
 */
function isPrime(n) {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (var i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

/**
 * 判断题题库（5 题）。
 * 每题：question 题干、options 选项、answer 正确选项下标、explain 解析。
 */
var QUIZ = [
  {
    question: '颜色演示结束后，Eve（旁观者）能看到 Alice 和 Bob 共享的最终颜色吗？',
    options: ['能看到，因为混合色都是公开的', '看不到，她缺少 Alice/Bob 的秘密色'],
    answer: 1,
    explain: 'Eve 只看到"黄+红"和"黄+绿"两个混合色，但混合是不可逆的——她无法从中分离出红色或绿色，因此算不出"黄+红+绿"。'
  },
  {
    question: '数学版里，哪些量是公开的、Eve 也能看到？',
    options: ['g 和 p', 'a 和 b', '共享密钥'],
    answer: 0,
    explain: 'g、p、A、B 全部公开传输；只有 a、b 和最终共享密钥是私密的。Eve 知道 A=g^a mod p 也无法反推 a（离散对数难题）。'
  },
  {
    question: '为什么 Eve 无法从 A=g^a mod p 反推出 a？',
    options: ['因为取模运算抹掉了信息，反推需要暴力尝试所有可能', '因为 p 很大时 g^a 会溢出', '因为 a 是负数'],
    answer: 0,
    explain: '取模把结果"折叠"进 0..p-1，正向计算很容易，反向求解（离散对数）没有高效算法，只能暴力尝试——当 p 是几百位大素数时，这在计算上不可行。'
  },
  {
    question: 'Alice 最终算出的共享密钥，和 Bob 算出的共享密钥关系是？',
    options: ['完全相同', '不同，各有各的', '只差一点，需要校准'],
    answer: 0,
    explain: 'Alice 算 B^a = g^(b·a)，Bob 算 A^b = g^(a·b)，两者相等。虽然 A 和 B 是公开的，但只有他们各自的秘密数能把它变成同一个数。'
  },
  {
    question: 'Diffie-Hellman 能直接用于加密消息吗？',
    options: ['能，它本身就是加密算法', '不能，它只交换共享密钥，加密要用这个密钥配合对称加密'],
    answer: 1,
    explain: 'DH 解决的只是"如何在不安全信道上共享一个只有双方知道的密钥"。拿到共享密钥后，通常再用 AES 等对称加密算法加密实际消息。'
  }
];

/**
 * 判分：比对用户答案与题库。
 * @param {Array<number>} answers 每题所选选项下标（长度与 QUIZ 相同）
 * @returns {Object} { correctCount, total, perQuestion: Array<0|1> }
 */
function gradeQuiz(answers) {
  if (!answers || answers.length !== QUIZ.length) {
    throw new Error('answers length must equal QUIZ length');
  }
  var correctCount = 0;
  var perQuestion = [];
  for (var i = 0; i < QUIZ.length; i++) {
    var ok = answers[i] === QUIZ[i].answer ? 1 : 0;
    perQuestion.push(ok);
    correctCount += ok;
  }
  return {
    correctCount: correctCount,
    total: QUIZ.length,
    perQuestion: perQuestion
  };
}

/**
 * 随机猜测期望正确数（对比用）。
 * @param {number} [total] 题数，默认题库长度
 * @returns {number} 期望得分
 */
function randomGuessExpectation(total) {
  var t = total || QUIZ.length;
  var sum = 0;
  for (var i = 0; i < QUIZ.length && i < t; i++) {
    sum += 1 / QUIZ[i].options.length;
  }
  return Math.round(sum * 10) / 10;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mixColor: mixColor,
    mixColor3: mixColor3,
    modPow: modPow,
    dhExchange: dhExchange,
    isPrime: isPrime,
    QUIZ: QUIZ,
    gradeQuiz: gradeQuiz,
    randomGuessExpectation: randomGuessExpectation,
    BASE_COLOR: BASE_COLOR,
    SECRET_COLORS: SECRET_COLORS
  };
}
