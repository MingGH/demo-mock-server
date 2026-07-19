/**
 * 17 人定义了你的屏幕颜色 - 纯计算逻辑（无 DOM）
 *
 * 包含：
 *  - COLOR_PAIRS         8 组测试色对（含 deltaE2000 与正确答案）
 *  - CIE1931_CMF         CIE 1931 2° 标准观察者 r̄/ḡ/b̄ 关键波长采样
 *  - OBSERVER_VARIABILITY 观察者间变异系数（重建自 Wright 1928-29 标准差）
 *  - TIMELINE            1928-2020 色彩标准时间线
 *  - judgeColorDifference / calculateScore / calculateGrayBias
 *  - estimateLensYellowing（基于 Pokorny 1987 晶状体黄化模型）
 *  - generateShareText   分享文案生成
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // 1. 8 组测试色对（含正确答案）
  //    deltaE 基于 CIEDE2000 近似；0 表示完全相同
  // ─────────────────────────────────────────────────────────
  var COLOR_PAIRS = [
    { id: 1, color1: '#4A6B8A', color2: '#4A6D8C', deltaE: 1.2, answer: 'diff', region: '蓝灰' },
    { id: 2, color1: '#8B4513', color2: '#8B4513', deltaE: 0,   answer: 'same', region: '褐色' },
    { id: 3, color1: '#2E8B57', color2: '#2F8E59', deltaE: 1.8, answer: 'diff', region: '绿色' },
    { id: 4, color1: '#9B59B6', color2: '#9B59B6', deltaE: 0,   answer: 'same', region: '紫色' },
    { id: 5, color1: '#E74C3C', color2: '#E94E3E', deltaE: 1.5, answer: 'diff', region: '红色' },
    { id: 6, color1: '#F39C12', color2: '#F39C12', deltaE: 0,   answer: 'same', region: '橙色' },
    { id: 7, color1: '#1ABC9C', color2: '#19B897', deltaE: 2.3, answer: 'diff', region: '青色' },
    { id: 8, color1: '#6C5B7B', color2: '#6E5D7E', deltaE: 1.9, answer: 'diff', region: '暗紫' }
  ];

  // 可分辨阈值：deltaE >= 1.0 视为「不同」（CIEDE2000 的 JND 单位）
  var DELTA_E_THRESHOLD = 1.0;

  // ─────────────────────────────────────────────────────────
  // 2. CIE 1931 2° 标准观察者的 x̄, ȳ, z̄ 色彩匹配函数（关键波长采样）
  //    来源：CIE 15:2004, Table 1
  //    注意：字段名用 r/g/b 仅为简写，实际对应 x̄(红敏感)/ȳ(绿敏感·亮度)/z̄(蓝敏感)
  // ─────────────────────────────────────────────────────────
  var CIE1931_CMF = [
    { wavelength: 380, r: 0.0014, g: 0.0000, b: 0.0065 },
    { wavelength: 400, r: 0.0143, g: 0.0004, b: 0.0679 },
    { wavelength: 420, r: 0.1344, g: 0.0040, b: 0.6456 },
    { wavelength: 440, r: 0.3483, g: 0.0230, b: 1.7471 },
    { wavelength: 460, r: 0.2908, g: 0.0600, b: 1.6692 },
    { wavelength: 480, r: 0.0956, g: 0.1390, b: 0.8130 },
    { wavelength: 500, r: 0.0049, g: 0.3230, b: 0.2720 },
    { wavelength: 520, r: 0.0633, g: 0.7100, b: 0.0782 },
    { wavelength: 540, r: 0.2904, g: 0.9540, b: 0.0203 },
    { wavelength: 560, r: 0.5945, g: 0.9950, b: 0.0039 },
    { wavelength: 580, r: 0.9163, g: 0.8700, b: 0.0017 },
    { wavelength: 600, r: 1.0622, g: 0.6310, b: 0.0008 },
    { wavelength: 620, r: 0.8544, g: 0.3810, b: 0.0002 },
    { wavelength: 640, r: 0.4479, g: 0.1750, b: 0.0000 },
    { wavelength: 660, r: 0.1649, g: 0.0610, b: 0.0000 },
    { wavelength: 680, r: 0.0468, g: 0.0170, b: 0.0000 },
    { wavelength: 700, r: 0.0114, g: 0.0041, b: 0.0000 },
    { wavelength: 720, r: 0.0029, g: 0.0010, b: 0.0000 }
  ];

  // ─────────────────────────────────────────────────────────
  // 3. 观察者间变异系数（%CV）—— 反映 17 人的离散度
  //    短波长（蓝紫色）变异最大；黄绿光（560nm 附近）变异最小
  //    来源：基于 Wright 1928-29 论文中报告的标准差重建
  // ─────────────────────────────────────────────────────────
  var OBSERVER_VARIABILITY = [
    { wavelength: 420, cv_percent: 38 },
    { wavelength: 460, cv_percent: 22 },
    { wavelength: 500, cv_percent: 12 },
    { wavelength: 540, cv_percent: 8  },
    { wavelength: 560, cv_percent: 5  },
    { wavelength: 580, cv_percent: 7  },
    { wavelength: 600, cv_percent: 10 },
    { wavelength: 640, cv_percent: 15 },
    { wavelength: 680, cv_percent: 25 }
  ];

  // ─────────────────────────────────────────────────────────
  // 4. 历史时间线
  // ─────────────────────────────────────────────────────────
  var TIMELINE = [
    { year: 1928, event: 'Wright 在伦敦帝国理工完成 10 人色彩匹配实验' },
    { year: 1931, event: 'Guild 在英国国家物理实验室完成 7 人实验' },
    { year: 1931, event: 'CIE 发布 2° 标准观察者——基于这 17 人的数据' },
    { year: 1953, event: 'NTSC 彩色电视标准采用 CIE 1931 色度图' },
    { year: 1964, event: 'CIE 补充 10° 标准观察者（Stiles & Burch，49 人）' },
    { year: 1996, event: 'sRGB 色彩空间发布，基于 CIE 1931 xy 色度坐标' },
    { year: 2020, event: 'Display P3 广色域普及，仍以 CIE 1931 为坐标框架' }
  ];

  // ─────────────────────────────────────────────────────────
  // 5. 灰色测试背景预设场景
  // ─────────────────────────────────────────────────────────
  var GRAY_SCENES = [
    {
      id: 'warm',
      name: '暖色背景',
      background: 'linear-gradient(135deg, #c0392b 0%, #e67e22 50%, #f39c12 100%)',
      hint: '红色/橙色背景：你的大脑会往相反方向补偿，可能把灰色偏蓝'
    },
    {
      id: 'cool',
      name: '冷色背景',
      background: 'linear-gradient(135deg, #1e3799 0%, #4a69bd 50%, #38ada9 100%)',
      hint: '蓝色/青色背景：大脑反向补偿，可能把灰色偏红/黄'
    },
    {
      id: 'multi',
      name: '多色渐变',
      background: 'conic-gradient(from 0deg, #e74c3c, #f39c12, #2ecc71, #3498db, #9b59b6, #e74c3c)',
      hint: '多色背景：色彩恒常性在不同区域拉扯，最考验你的视觉系统'
    }
  ];

  // ─────────────────────────────────────────────────────────
  // 6. 色差判断
  // ─────────────────────────────────────────────────────────
  /**
   * 根据 deltaE 判断两组色块是否「可分辨」
   * @param {number} deltaE
   * @returns {'same'|'diff'}
   */
  function judgeColorDifference(deltaE) {
    return deltaE >= DELTA_E_THRESHOLD ? 'diff' : 'same';
  }

  /**
   * 计算用户答题得分
   * @param {string[]} answers  用户答案数组，元素为 'same'|'diff'
   * @param {object[]} [pairs]  题目数组，默认 COLOR_PAIRS
   * @returns {{correct:number,total:number,percent:number,wrongIds:number[]}}
   */
  function calculateScore(answers, pairs) {
    pairs = pairs || COLOR_PAIRS;
    var correct = 0;
    var wrongIds = [];
    for (var i = 0; i < pairs.length; i++) {
      if (answers[i] === pairs[i].answer) {
        correct++;
      } else {
        wrongIds.push(pairs[i].id);
      }
    }
    return {
      correct: correct,
      total: pairs.length,
      percent: Math.round((correct / pairs.length) * 100),
      wrongIds: wrongIds
    };
  }

  /**
   * 根据得分给出一句评语，对标「标准观察者」理论分数
   * 标准观察者在 deltaE>=1.5 的题上理论上能全对，deltaE 1.0~1.5 的题答对率约 50%
   * @param {object} scoreResult  calculateScore 的返回值
   * @returns {string}
   */
  function scoreComment(scoreResult) {
    var p = scoreResult.percent;
    if (p === 100) return '满分！你的色彩敏锐度超过 1931 年那 17 位「标准人眼」';
    if (p >= 75)  return '不错，你的色觉与「标准观察者」基本相当';
    if (p >= 50)  return '一般水平——「标准观察者」同样会在 ΔE 1.0~1.5 的题上犯错';
    if (p >= 25)  return '答对较少，可能你的屏幕显示偏色，或你更擅长其他色相区域';
    return '答对很少——别忘了，17 人的「标准」本就不该代表你';
  }

  // ─────────────────────────────────────────────────────────
  // 7. 灰色偏差计算
  // ─────────────────────────────────────────────────────────
  /**
   * 计算用户选择的灰色与纯灰（hsl(0,0%,50%)）的偏差
   * @param {number} userHue        用户色相偏移，-30 ~ +30（度）
   * @param {number} userSaturation 用户饱和度，0 ~ 15（%）
   * @returns {{hueBias:number, satBias:number, direction:string,
   *            magnitude:number, explanation:string}}
   */
  function calculateGrayBias(userHue, userSaturation) {
    var hueBias = userHue;
    var satBias = userSaturation;
    var magnitude = Math.sqrt(hueBias * hueBias + satBias * satBias);

    var direction;
    if (Math.abs(hueBias) < 1.5 && satBias < 1.0) {
      direction = 'pure';
    } else if (hueBias > 1.5) {
      direction = hueBias >= 8 ? 'warm-red' : 'warm';
    } else if (hueBias < -1.5) {
      direction = hueBias <= -8 ? 'cool-blue' : 'cool';
    } else {
      direction = 'saturated';
    }

    var explanation = explainGrayBias(direction, magnitude);

    return {
      hueBias: hueBias,
      satBias: satBias,
      direction: direction,
      magnitude: magnitude,
      explanation: explanation
    };
  }

  function explainGrayBias(direction, magnitude) {
    var mag = magnitude.toFixed(2);
    if (direction === 'pure') {
      return '你选到了真正的纯灰 hsl(0, 0%, 50%)——色彩恒常性没骗过你。';
    }
    if (direction === 'warm' || direction === 'warm-red') {
      return '你把灰色偏移向暖色方向（+' + mag + '°）。' +
             '背景是冷色时，大脑会反向补偿，让你以为「偏暖的灰」才是纯灰——这就是色彩恒常性。';
    }
    if (direction === 'cool' || direction === 'cool-blue') {
      return '你把灰色偏移向冷色方向（' + mag + '°）。' +
             '背景是暖色时，大脑会反向补偿，让你以为「偏冷的灰」才是纯灰——这就是色彩恒常性。';
    }
    return '你选的灰色带 ' + mag + '° 的偏移，色彩恒常性把你拉离了纯灰。';
  }

  // ─────────────────────────────────────────────────────────
  // 8. 晶状体黄化估算（基于 Pokorny 1987）
  // ─────────────────────────────────────────────────────────
  /**
   * 估算给定年龄晶状体黄化导致的蓝光吸收增量百分比
   * 数据来源：Pokorny, J., Smith, V. C., & Lutze, M. (1987).
   *           "Aging and human cone photopigments." Vision Research, 27, 1619-1631.
   * 简化模型：20 岁基准 ~0%，每增加 1 岁约 +0.4% 蓝光吸收（80 岁约 +24%）
   * @param {number} age
   * @returns {number} 蓝光吸收增量百分比（0~30）
   */
  function estimateLensYellowing(age) {
    if (age < 20) age = 20;
    if (age > 80) age = 80;
    return (age - 20) * 0.4;
  }

  // ─────────────────────────────────────────────────────────
  // 9. 灰色偏差对色觉影响的综合解释
  // ─────────────────────────────────────────────────────────
  /**
   * 结合灰色偏差和年龄，给出综合色觉报告
   * @param {object} grayBias   calculateGrayBias 的返回值
   * @param {number} age        用户年龄
   * @returns {{yellowing:number, ageEffect:string, summary:string}}
   */
  function buildGrayReport(grayBias, age) {
    var yellowing = estimateLensYellowing(age);
    var ageEffect;
    if (age < 35) {
      ageEffect = '晶状体仍接近透明，对蓝光感知影响不大。';
    } else if (age < 55) {
      ageEffect = '晶状体已开始黄化，蓝光透过率比 20 岁下降约 ' + yellowing.toFixed(0) + '%。';
    } else {
      ageEffect = '晶状体黄化明显，蓝光透过率比 20 岁下降约 ' + yellowing.toFixed(0) +
                  '%——你看到的「标准蓝」比年轻人更暗。';
    }

    var summary;
    if (grayBias.direction === 'pure') {
      summary = '你的色觉系统对抗色彩恒常性干扰的表现很好';
    } else {
      summary = '色彩恒常性让你的灰色偏移了 ' + grayBias.magnitude.toFixed(2) + '°';
    }

    return {
      yellowing: yellowing,
      ageEffect: ageEffect,
      summary: summary
    };
  }

  // ─────────────────────────────────────────────────────────
  // 10. 分享文案生成
  // ─────────────────────────────────────────────────────────
  var SHARE_URL = 'https://numfeel.996.ninja/pages/color-standard-17/';

  /**
   * 生成分享文案
   * @param {number} score         答对数
   * @param {number} total         总题数
   * @param {number} grayMagnitude 灰色偏差幅度（度）
   * @returns {string}
   */
  function generateShareText(score, total, grayMagnitude) {
    return '我在「17 人色觉标准」测试中，辨色得分 ' + score + '/' + total +
           '，灰色偏差 ' + grayMagnitude.toFixed(1) + '°。来测测你的 -> ' + SHARE_URL;
  }

  // ─────────────────────────────────────────────────────────
  // 11. 把用户在第一段的得分映射到「17 人离散度」中的位置
  //     —— 用于在散点图上标「你在这里」
  // ─────────────────────────────────────────────────────────
  /**
   * 根据用户得分百分比估算等价 CV（变异系数）
   * 得分越高，对应等价离散度越低
   * @param {number} percent 0~100
   * @returns {number} 等价 CV%
   */
  function mapScoreToCV(percent) {
    // 满分 ~3% CV（比 17 人平均值还稳定），0 分 ~45% CV
    return Math.max(3, 45 - percent * 0.42);
  }

  // ─────────────────────────────────────────────────────────
  // 导出
  // ─────────────────────────────────────────────────────────
  var api = {
    COLOR_PAIRS: COLOR_PAIRS,
    CIE1931_CMF: CIE1931_CMF,
    OBSERVER_VARIABILITY: OBSERVER_VARIABILITY,
    TIMELINE: TIMELINE,
    GRAY_SCENES: GRAY_SCENES,
    DELTA_E_THRESHOLD: DELTA_E_THRESHOLD,
    SHARE_URL: SHARE_URL,
    judgeColorDifference: judgeColorDifference,
    calculateScore: calculateScore,
    scoreComment: scoreComment,
    calculateGrayBias: calculateGrayBias,
    estimateLensYellowing: estimateLensYellowing,
    buildGrayReport: buildGrayReport,
    generateShareText: generateShareText,
    mapScoreToCV: mapScoreToCV
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ColorStandard17 = api;
  }
})(typeof window !== 'undefined' ? window : this);
