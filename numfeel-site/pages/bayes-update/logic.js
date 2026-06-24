/**
 * 贝叶斯改主意计算器 — 纯计算逻辑
 *
 * 公式：P(A|B) = P(B|A) * P(A) / P(B)
 *      其中 P(B) = P(B|A)*P(A) + P(B|¬A)*(1 - P(A))
 *
 * 所有概率以 0~1 的小数表示（不是百分比）。
 */
(function (global) {
  'use strict';

  /**
   * 计算后验概率
   * @param {number} prior      P(A) 先验，事情本来为真的概率，0~1
   * @param {number} likelihood P(B|A) 真为真时观察到证据的概率，0~1
   * @param {number} falseRate  P(B|¬A) 真为假时也观察到证据的概率，0~1
   * @returns {number} P(A|B) 后验概率，0~1；若分母为 0 返回 0
   */
  function posterior(prior, likelihood, falseRate) {
    var pB = likelihood * prior + falseRate * (1 - prior);
    if (pB <= 0) return 0;
    return (likelihood * prior) / pB;
  }

  /**
   * 100 万人沙盘：把抽象概率换算成具体人数，便于讲解
   * @param {number} prior
   * @param {number} likelihood
   * @param {number} falseRate
   * @param {number} [total=1000000] 总样本数
   * @returns {{total:number, trueCount:number, falseCount:number,
   *            truePositive:number, falsePositive:number,
   *            evidencePositive:number, posterior:number}}
   */
  function buildSandbox(prior, likelihood, falseRate, total) {
    total = total || 1000000;
    var trueCount = Math.round(prior * total);
    var falseCount = total - trueCount;
    var truePositive = Math.round(trueCount * likelihood);
    var falsePositive = Math.round(falseCount * falseRate);
    var evidencePositive = truePositive + falsePositive;
    var post = evidencePositive === 0 ? 0 : truePositive / evidencePositive;
    return {
      total: total,
      trueCount: trueCount,
      falseCount: falseCount,
      truePositive: truePositive,
      falsePositive: falsePositive,
      evidencePositive: evidencePositive,
      posterior: post
    };
  }

  /**
   * 把后验与直觉的差距分级，用于给读者一句"你猜偏了多少"的结论
   * @param {number} posteriorPct   后验百分比，0~100
   * @param {number} guessPct       用户直觉猜测，0~100
   * @returns {{ gap:number, level:'spot-on'|'close'|'off'|'way-off', label:string }}
   */
  function rateGuess(posteriorPct, guessPct) {
    var gap = Math.abs(guessPct - posteriorPct);
    var level, label;
    if (gap <= 5) { level = 'spot-on'; label = '直觉很准'; }
    else if (gap <= 15) { level = 'close'; label = '差得不多'; }
    else if (gap <= 30) { level = 'off'; label = '猜偏了'; }
    else { level = 'way-off'; label = '严重偏离'; }
    return { gap: gap, level: level, label: label };
  }

  /**
   * 把 0~1 的概率格式化为人话百分比字符串
   * @param {number} p
   * @param {number} [digits=1]
   * @returns {string}
   */
  function formatPct(p, digits) {
    if (digits === undefined) digits = 1;
    return (p * 100).toFixed(digits) + '%';
  }

  /**
   * 把大数字按中文习惯断成"万 / 亿"，便于讲故事
   * @param {number} n
   * @returns {string}
   */
  function formatCount(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万';
    return n.toLocaleString('zh-CN');
  }

  /**
   * 预设场景：让用户一键填入，再点"算一下"。
   * 概率均用 0~1 表示。
   */
  var PRESETS = [
    {
      id: 'cancer-screening',
      icon: 'ti-stethoscope',
      title: '体检阳性',
      subject: '我是不是真的得了这种病',
      prior: 0.001,
      evidence: '体检报告显示阳性，仪器准确率 99%',
      likelihood: 0.99,
      falseRate: 0.01,
      twist: '直觉觉得 99% 准确率 = 99% 患病，实际只有 ~9%'
    },
    {
      id: 'cheating',
      icon: 'ti-heart-broken',
      title: '怀疑出轨',
      subject: '我对象是不是出轨了',
      prior: 0.05,
      evidence: '他/她最近开始给手机加锁',
      likelihood: 0.80,
      falseRate: 0.20,
      twist: '加锁看着像铁证，但很多人本就给手机加密'
    },
    {
      id: 'phishing',
      icon: 'ti-mail-exclamation',
      title: '诈骗邮件',
      subject: '这封邮件是不是诈骗',
      prior: 0.02,
      evidence: '邮件里出现"紧急"和"转账"两个词',
      likelihood: 0.90,
      falseRate: 0.05,
      twist: '关键词命中很可疑，但正常邮件偶尔也这么写'
    },
    {
      id: 'lost-keys',
      icon: 'ti-key-off',
      title: '钥匙在客厅',
      subject: '钥匙是不是落在客厅',
      prior: 0.80,
      evidence: '我已经翻了三遍客厅都没找到',
      likelihood: 0.05,
      falseRate: 0.95,
      twist: '反向证据：找不到本身就是一种证据，该换地方了'
    }
  ];

  var api = {
    posterior: posterior,
    buildSandbox: buildSandbox,
    rateGuess: rateGuess,
    formatPct: formatPct,
    formatCount: formatCount,
    PRESETS: PRESETS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BayesUpdate = api;
  }
})(typeof window !== 'undefined' ? window : this);
