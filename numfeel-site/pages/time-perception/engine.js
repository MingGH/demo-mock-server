// ============================================================
// 时间感知扭曲实验室 — 核心引擎
// 实验设计基于：
//   Gibbon (1977) 起搏器-累加器模型
//   Zakay & Block (1995) 注意闸门模型
//   Wearden & Lejeune (2008) 时间知觉综述
//   Droit-Volet et al. (2004) 情绪对时间知觉的影响
//
// 韦伯分数参考：
//   Getty (1975) - 人类时间分辨的 Weber fraction 约 0.05-0.15
//   Grondin (2010) - 短间隔(<1s)约 0.25, 长间隔(>1s)约 0.08-0.12
// ============================================================

// ── 实验阶段定义 ──
// actualSec: 真实倒计时秒数
// phase: 实验阶段 (blank / load / emotion)
// label: 显示标签
// condition: 子条件描述
// desc: 给用户的简要说明（秒数不透露）
// expectSign: 根据心理学文献，该条件下预期的偏差方向 (+1 高估, -1 低估, 0 不确定)

var TRIALS = [
  // ══════════ 阶段一：空白等待 (Blank Waiting) ══════════
  // 参考：Eisler (1976) 空白间隔下的时间估计呈现幂函数关系
  // 短间隔倾向于被相对高估，长间隔倾向被相对低估（Vierordt's Law, 1868）
  {
    phase: 'blank',
    actualSec: 14,
    label: '空白等待 - 短间隔',
    condition: 'short',
    desc: '点击「开始」后屏幕会显示一段空白。凭感觉在 14 秒时点击「停止」。',
    expectSign: 1
  },
  {
    phase: 'blank',
    actualSec: 38,
    label: '空白等待 - 中间隔',
    condition: 'mid',
    desc: '点击「开始」后屏幕会显示一段空白。凭感觉在 38 秒时点击「停止」。',
    expectSign: 0
  },
  {
    phase: 'blank',
    actualSec: 65,
    label: '空白等待 - 长间隔',
    condition: 'long',
    desc: '点击「开始」后屏幕会显示一段空白。凭感觉在 65 秒时点击「停止」。',
    expectSign: -1
  },

  // ══════════ 阶段二：认知负荷 (Cognitive Load) ══════════
  // 参考：Block et al. (2010) 元分析 — 注意资源竞争使累加器漏数，高估间隔
  // Brown (1997) 注意闸门模型 — 越忙时间过得越快
  {
    phase: 'load',
    actualSec: 22,
    label: '轻负荷 - 观察颜色',
    condition: 'low',
    desc: '屏幕会随机变色，你只需观察。在 22 秒时点击「停止」。',
    expectSign: 0
  },
  {
    phase: 'load',
    actualSec: 22,
    label: '中负荷 - 颜色计数',
    condition: 'mid',
    desc: '屏幕会随机变色，你需要数一共变了几次色。在 22 秒时点击「停止」。',
    expectSign: -1
  },
  {
    phase: 'load',
    actualSec: 28,
    label: '高负荷 - 心算挑战',
    condition: 'high',
    desc: '屏幕会持续出现简单算式，你需要判断对错。在 28 秒时点击「停止」。',
    expectSign: -1
  },

  // ══════════ 阶段三：情绪唤醒 (Emotional Arousal) ══════════
  // 参考：Droit-Volet et al. (2004) — 高唤醒刺激使节拍器加速, 感知时间变长
  // Angrilli et al. (1997) — 负性高唤醒图片使间隔被高估
  {
    phase: 'emotion',
    actualSec: 20,
    label: '舒缓环境',
    condition: 'calm',
    desc: '屏幕会显示舒缓的蓝色渐变。在 20 秒时点击「停止」。',
    expectSign: 0
  },
  {
    phase: 'emotion',
    actualSec: 20,
    label: '紧张环境',
    condition: 'urgent',
    desc: '屏幕会显示红色闪烁+倒计时压力。在 20 秒时点击「停止」。',
    expectSign: 1
  }
];

var TOTAL_ROUNDS = TRIALS.length;

// ── 评分函数 ──

/**
 * 计算单轮偏差系数
 * @param {number} estimatedMs - 用户估计的毫秒数
 * @param {number} actualMs - 真实毫秒数
 * @returns {number} 偏差系数, 正数=高估(觉得时间变慢), 负数=低估(觉得时间变快)
 */
function computeDistortion(estimatedMs, actualMs) {
  return (estimatedMs - actualMs) / actualMs;
}

/**
 * 计算绝对偏差系数（用于评分，忽略方向）
 */
function computeAbsDistortion(estimatedMs, actualMs) {
  return Math.abs(computeDistortion(estimatedMs, actualMs));
}

/**
 * 韦伯分数：标准差 / 均值，衡量时间分辨能力
 * 参考：Grondin (2010) 正常成人约 0.08-0.25
 */
function computeWeberScore(trials) {
  var distortions = trials.map(function (t) { return computeDistortion(t.estimatedMs, t.actualMs); });
  var n = distortions.length;
  var mean = distortions.reduce(function (a, b) { return a + b; }, 0) / n;
  var variance = distortions.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * 计算总分 (0-100)
 * 基于 8 轮的平均绝对偏差系数
 * absDistortion < 0.08 → 满分区, 0.08-0.30 → 线性衰减, >0.30 → 保底分
 */
function computeTotalScore(trials) {
  var total = 0;
  var weights = { blank: 1.0, load: 1.2, emotion: 1.0 };
  var weightSum = 0;
  for (var i = 0; i < trials.length; i++) {
    var t = trials[i];
    var absDist = computeAbsDistortion(t.estimatedMs, t.actualMs);
    var w = weights[t.phase] || 1.0;
    weightSum += w;
    var roundScore;
    if (absDist < 0.08) {
      roundScore = 100;
    } else if (absDist > 0.50) {
      roundScore = Math.max(0, 100 - (absDist - 0.08) * 130);
    } else {
      roundScore = Math.max(15, 100 - (absDist - 0.08) * 180);
    }
    total += Math.round(roundScore * w);
  }
  return Math.round(total / weightSum);
}

/**
 * 判断你是高估者还是低估者
 */
function getBiasDirection(trials) {
  var sum = 0;
  for (var i = 0; i < trials.length; i++) {
    sum += computeDistortion(trials[i].estimatedMs, trials[i].actualMs);
  }
  return sum > 0.05 ? 'overestimator' : sum < -0.05 ? 'underestimator' : 'balanced';
}

/**
 * 评级
 */
function getGrade(totalScore) {
  if (totalScore >= 85) return '时间大师';
  if (totalScore >= 70) return '良好时感';
  if (totalScore >= 50) return '略有偏差';
  if (totalScore >= 30) return '时感模糊';
  return '时感崩坏';
}

/**
 * 根据已有的实验数据，预估各条件下的理论偏差范围
 * 数据来源：
 *   - Block et al. (2010) 元分析: 认知负荷使间隔被低估 8-15%
 *   - Droit-Volet et al. (2004): 高唤醒使短间隔高估 10-25%
 *   - Vierordt (1868): 短间隔高估、长间隔低估 (Vierordt's Law)
 */
function getExpectedDistortionRange(phase, condition) {
  var ranges = {
    blank: { short: { min: -0.05, max: 0.25 }, mid: { min: -0.15, max: 0.10 }, long: { min: -0.25, max: 0.05 } },
    load: { low: { min: -0.10, max: 0.10 }, mid: { min: -0.25, max: 0.05 }, high: { min: -0.40, max: 0.00 } },
    emotion: { calm: { min: -0.10, max: 0.10 }, urgent: { min: 0.00, max: 0.35 } }
  };
  return ranges[phase] && ranges[phase][condition] || { min: -0.20, max: 0.20 };
}

/**
 * 生成指定范围内的伪随机小数
 */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRIALS: TRIALS,
    TOTAL_ROUNDS: TOTAL_ROUNDS,
    computeDistortion: computeDistortion,
    computeAbsDistortion: computeAbsDistortion,
    computeWeberScore: computeWeberScore,
    computeTotalScore: computeTotalScore,
    getBiasDirection: getBiasDirection,
    getGrade: getGrade,
    getExpectedDistortionRange: getExpectedDistortionRange
  };
}
