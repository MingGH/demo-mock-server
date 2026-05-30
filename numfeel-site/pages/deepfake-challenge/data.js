/**
 * Deepfake 识别挑战 — 数据与信号检测论计算
 *
 * 图片来源：
 * - 真人照片：Unsplash（免费无版权）
 * - AI 照片：豆包 Seedream 4.0 生成
 *
 * 信号检测论（SDT）参考：
 * Green, D. M. & Swets, J. A. (1966). Signal Detection Theory and Psychophysics.
 */

var IMAGES = [
  // ── 真人照片（Unsplash） ──
  { id: 'real_01', src: 'images/real_01.jpg', isReal: true,  desc: '男性，浅色上衣，自然光' },
  { id: 'real_02', src: 'images/real_02.jpg', isReal: true,  desc: '女性，暖色调，自然光' },
  { id: 'real_03', src: 'images/real_03.jpg', isReal: true,  desc: '男性，白色V领，户外' },
  { id: 'real_04', src: 'images/real_04.jpg', isReal: true,  desc: '女性，浅色背景' },
  { id: 'real_05', src: 'images/real_05.jpg', isReal: true,  desc: '男性，灰色上衣，户外' },
  { id: 'real_06', src: 'images/real_06.jpg', isReal: true,  desc: '女性，黑色上衣，室内' },

  // ── AI 生成照片（豆包 Seedream 4.0） ──
  { id: 'ai_01', src: 'images/ai_01.jpg', isReal: false, desc: 'AI 生成，年轻亚洲女性' },
  { id: 'ai_02', src: 'images/ai_02.jpg', isReal: false, desc: 'AI 生成，中年白人男性' },
  { id: 'ai_03', src: 'images/ai_03.jpg', isReal: false, desc: 'AI 生成，老年亚洲男性' },
  { id: 'ai_04', src: 'images/ai_04.jpg', isReal: false, desc: 'AI 生成，年轻黑人女性' },
  { id: 'ai_05', src: 'images/ai_05.jpg', isReal: false, desc: 'AI 生成，南亚女性' },
  { id: 'ai_06', src: 'images/ai_06.jpg', isReal: false, desc: 'AI 生成，年轻欧洲男性' }
];

/**
 * 从图片库中随机抽取 n 张，真假各半
 */
function pickTrials(n) {
  n = n || 12;
  var realPool = [];
  var fakePool = [];
  for (var i = 0; i < IMAGES.length; i++) {
    if (IMAGES[i].isReal) realPool.push(IMAGES[i]);
    else fakePool.push(IMAGES[i]);
  }
  realPool = shuffleArr(realPool);
  fakePool = shuffleArr(fakePool);

  var halfReal = Math.floor(n / 2);
  var halfFake = n - halfReal;
  var picked = realPool.slice(0, halfReal).concat(fakePool.slice(0, halfFake));
  return shuffleArr(picked);
}

/**
 * 计算信号检测论指标
 *
 * 四格表：
 *              实际真人    实际AI
 * 判断真人      Hit        FA (False Alarm)
 * 判断AI        Miss       CR (Correct Rejection)
 *
 * hitRate  = Hit / (Hit + Miss)
 * faRate   = FA  / (FA + CR)
 * d'       = Z(hitRate) - Z(faRate)
 * criterion(c) = -0.5 * (Z(hitRate) + Z(faRate))
 *
 * @param {Array} answers - [{imageId, isReal, userSaidReal}]
 * @returns {Object} SDT metrics
 */
function calcSDT(answers) {
  if (!answers || answers.length === 0) {
    return { hit: 0, miss: 0, fa: 0, cr: 0, total: 0, accuracy: 0, hitRate: 0, faRate: 0, dPrime: 0, criterion: 0 };
  }

  var hit = 0, miss = 0, fa = 0, cr = 0;

  for (var i = 0; i < answers.length; i++) {
    var a = answers[i];
    if (a.isReal && a.userSaidReal)   hit++;
    else if (a.isReal && !a.userSaidReal)  miss++;
    else if (!a.isReal && a.userSaidReal)  fa++;
    else                                    cr++;
  }

  var total = answers.length;
  var accuracy = (hit + cr) / total;

  // 应用 log-linear 校正避免 0 或 1 的极端值
  // Hautus, M. J. (1995). Corrections for extreme proportions.
  var realTotal = hit + miss;
  var fakeTotal = fa + cr;

  var hitRate = realTotal > 0 ? (hit + 0.5) / (realTotal + 1) : 0.5;
  var faRate  = fakeTotal > 0 ? (fa + 0.5) / (fakeTotal + 1) : 0.5;

  var dPrime = zScore(hitRate) - zScore(faRate);
  var criterion = -0.5 * (zScore(hitRate) + zScore(faRate));

  return {
    hit: hit,
    miss: miss,
    fa: fa,
    cr: cr,
    total: total,
    accuracy: Math.round(accuracy * 1000) / 1000,
    hitRate: Math.round(hitRate * 1000) / 1000,
    faRate: Math.round(faRate * 1000) / 1000,
    dPrime: Math.round(dPrime * 100) / 100,
    criterion: Math.round(criterion * 100) / 100
  };
}

/**
 * 根据 d' 值给出评级
 */
function getSDTRating(dPrime) {
  if (dPrime >= 2.5) {
    return { level: 'expert', label: '火眼金睛', color: '#22c55e', desc: '你的辨别力远超普通人，接近专业 AI 检测工具的水平。' };
  }
  if (dPrime >= 1.5) {
    return { level: 'good', label: '眼光不错', color: '#4ade80', desc: '你能捕捉到一些 AI 生成图片的细微破绽，辨别力高于平均水平。' };
  }
  if (dPrime >= 0.5) {
    return { level: 'average', label: '和多数人差不多', color: '#fbbf24', desc: '你的表现接近人类平均水平。别灰心——2026 年的 AI 生成图片确实很难分辨。' };
  }
  if (dPrime >= 0) {
    return { level: 'poor', label: '基本靠猜', color: '#f59e0b', desc: '你的判断接近随机水平。这说明当前 AI 生成技术已经足以骗过大多数人的眼睛。' };
  }
  return { level: 'inverted', label: '反向指标', color: '#ef4444', desc: '你把真的看成假的、假的看成真的。如果反过来选，正确率反而更高。' };
}

/**
 * 标准正态分布的逆函数（Z-score）
 * 使用 Beasley-Springer-Moro 近似算法
 */
function zScore(p) {
  if (p <= 0) return -4;
  if (p >= 1) return 4;

  if (p < 0.5) return -rationalApprox(Math.sqrt(-2 * Math.log(p)));
  else return rationalApprox(Math.sqrt(-2 * Math.log(1 - p)));
}

function rationalApprox(t) {
  var c0 = 2.515517;
  var c1 = 0.802853;
  var c2 = 0.010328;
  var d1 = 1.432788;
  var d2 = 0.189269;
  var d3 = 0.001308;
  return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
}

function shuffleArr(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ── 参考数据（用于结果页对比） ──
var REFERENCE_DATA = {
  humanAccuracy: 0.245,
  humanAccuracySource: 'Deepstrike.io (2025): 人类对高质量 deepfake 视频的检测准确率为 24.5%',
  aiLabAccuracy: 0.95,
  aiLabSource: 'Sozee.ai (2026): AI 检测工具在实验室环境下准确率 93-98%',
  aiRealWorldAccuracy: 0.475,
  aiRealWorldSource: 'Sozee.ai (2026): AI 检测工具在真实场景下准确率降至 45-50%',
  fraudIncidents: 4200000,
  fraudSource: 'Signisys (2026): 2026 Q1 deepfake 欺诈事件 420 万起',
  financialLoss: 11800000000,
  financialLossSource: 'Signisys (2026): deepfake 相关经济损失达 118 亿美元'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IMAGES: IMAGES,
    pickTrials: pickTrials,
    calcSDT: calcSDT,
    getSDTRating: getSDTRating,
    zScore: zScore,
    shuffleArr: shuffleArr,
    REFERENCE_DATA: REFERENCE_DATA
  };
}
