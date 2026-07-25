/**
 * logic.js - 纹身与犯罪数据故事的纯计算逻辑
 *
 * 与 DOM 完全解耦，可被 Node 直接 require 测试，也可被浏览器 <script> 使用。
 * 核心是贝叶斯后验：把「罪犯中纹身率高」翻译成「纹身者是罪犯的概率」。
 */
(function (global) {
  'use strict';

  var DATA = (typeof require === 'function')
    ? require('./data.js')
    : (global.TattooCrimeData || {});

  /**
   * 贝叶斯后验：P(罪犯|纹身) = P(纹身|罪犯)*P(罪犯) / P(纹身)
   * @param {number} prior      P(罪犯) 先验，普通人群中真正犯罪的比例，0~1
   * @param {number} likelihood P(纹身|罪犯) 罪犯中有纹身的比例，0~1
   * @param {number} falseRate  P(纹身|¬罪犯) 非罪犯中有纹身的比例，0~1
   * @returns {number} P(罪犯|纹身)，0~1；分母为 0 返回 0
   */
  function posterior(prior, likelihood, falseRate) {
    var pB = likelihood * prior + falseRate * (1 - prior);
    if (pB <= 0) return 0;
    return (likelihood * prior) / pB;
  }

  /**
   * 10 万人沙盘：把抽象概率换算成具体人数，便于讲故事
   * @returns {{total,criminal,innocent,tattooedCriminal,tattooedInnocent,tattooedTotal,posterior}}
   */
  function buildSandbox(prior, likelihood, falseRate, total) {
    total = total || 100000;
    var criminal = Math.round(prior * total);
    var innocent = total - criminal;
    var tattooedCriminal = Math.round(criminal * likelihood);
    var tattooedInnocent = Math.round(innocent * falseRate);
    var tattooedTotal = tattooedCriminal + tattooedInnocent;
    var post = tattooedTotal === 0 ? 0 : tattooedCriminal / tattooedTotal;
    return {
      total: total,
      criminal: criminal,
      innocent: innocent,
      tattooedCriminal: tattooedCriminal,
      tattooedInnocent: tattooedInnocent,
      tattooedTotal: tattooedTotal,
      posterior: post
    };
  }

  /**
   * 按 sourceId 查来源元信息
   * @param {string} sourceId
   * @returns {object|null}
   */
  function getSource(sourceId) {
    var list = DATA.SOURCES || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === sourceId) return list[i];
    }
    return null;
  }

  /**
   * 把 0~1 的概率格式化为百分比字符串
   * @param {number} p
   * @param {number} [digits=1]
   * @returns {string}
   */
  function formatPct(p, digits) {
    if (digits === undefined) digits = 1;
    return (p * 100).toFixed(digits) + '%';
  }

  /**
   * 格式化优势比（odd ratio），如 2.5 -> "×2.50"
   * @param {number} orr
   * @returns {string}
   */
  function formatOdds(orr) {
    return '×' + Number(orr).toFixed(2);
  }

  /**
   * 格式化增量百分比，如 0.245 -> "+24.5%"
   * @param {number} u
   * @returns {string}
   */
  function formatUplift(u) {
    var sign = u >= 0 ? '+' : '';
    return sign + (u * 100).toFixed(1) + '%';
  }

  /**
   * 监狱/涉案群体纹身率的最大值
   * @returns {number}
   */
  function maxPrisonRate() {
    var arr = DATA.PRISON_PREVALENCE || [];
    var max = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].value > max) max = arr[i].value;
    }
    return max;
  }

  /**
   * 监狱纹身率均值 ÷ 普通人群纹身率，体现「印象放大」倍数
   * @returns {number}
   */
  function prisonVsGeneralRatio() {
    var arr = DATA.PRISON_PREVALENCE || [];
    if (arr.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i].value;
    var avg = sum / arr.length;
    var gen = DATA.GENERAL_PREVALENCE.usAdults.value;
    return gen > 0 ? avg / gen : 0;
  }

  /**
   * 把后验百分比映射成一句人话 + 颜色
   * @param {number} postPct 0~100
   * @returns {{level,label,color}}
   */
  function rateRisk(postPct) {
    if (postPct < 5) return { level: 'low', label: '极低', color: '#81c784' };
    if (postPct < 20) return { level: 'mid', label: '不高', color: '#90caf9' };
    if (postPct < 50) return { level: 'high', label: '偏高', color: '#ffa726' };
    return { level: 'vhigh', label: '很高', color: '#ff6b6b' };
  }

  /**
   * 数据完整性校验：每个数据点的 sourceId 都能在 SOURCES 找到
   * @returns {string[]} 错误列表，空数组表示通过
   */
  function validateSources() {
    var errors = [];
    var ids = {};
    (DATA.SOURCES || []).forEach(function (s) { ids[s.id] = true; });
    function check(sourceId, where) {
      if (!sourceId || !ids[sourceId]) errors.push(where + ' 引用了未知来源 ' + sourceId);
    }
    (DATA.PRISON_PREVALENCE || []).forEach(function (d) { check(d.sourceId, 'PRISON ' + d.region); });
    (DATA.RECIDIVISM || []).forEach(function (d) { check(d.sourceId, 'RECIDIVISM ' + d.metric); });
    check(DATA.FEMALE_STRATIFIED.sourceId, 'FEMALE_STRATIFIED');
    check(DATA.DRUG_TREATMENT.sourceId, 'DRUG_TREATMENT');
    check(DATA.JUVENILE.chengduAge.sourceId, 'JUVENILE.chengduAge');
    check(DATA.JUVENILE.taiwan.sourceId, 'JUVENILE.taiwan');
    (DATA.JUVENILE.samples || []).forEach(function (d) { check(d.sourceId, 'JUVENILE.samples ' + d.region); });
    (DATA.GENERAL_PREVALENCE.byGender || []).forEach(function (d) { check(d.sourceId, 'GENDER ' + d.group); });
    (DATA.GENERAL_PREVALENCE.byIncome || []).forEach(function (d) { check(d.sourceId, 'INCOME ' + d.group); });
    check(DATA.GENERAL_PREVALENCE.usAdults.sourceId, 'GENERAL.usAdults');
    return errors;
  }

  /**
   * 数值范围校验：概率在 [0,1]，优势比 >= 1
   * @returns {string[]} 错误列表
   */
  function validateRanges() {
    var errors = [];
    function inRange(v, lo, hi, label) {
      if (typeof v !== 'number' || v < lo || v > hi) errors.push(label + ' 越界: ' + v);
    }
    (DATA.PRISON_PREVALENCE || []).forEach(function (d) { inRange(d.value, 0, 1, 'PRISON ' + d.region); });
    (DATA.JUVENILE.samples || []).forEach(function (d) { inRange(d.value, 0, 1, 'JUVENILE ' + d.region); });
    inRange(DATA.JUVENILE.chengduAge.under16, 0, 1, 'JUVENILE.under16');
    inRange(DATA.JUVENILE.chengduAge.under14, 0, 1, 'JUVENILE.under14');
    inRange(DATA.DRUG_TREATMENT.male, 0, 1, 'DRUG male');
    inRange(DATA.DRUG_TREATMENT.female, 0, 1, 'DRUG female');
    inRange(DATA.BAYES_DEFAULTS.prior, 0, 1, 'BAYES prior');
    inRange(DATA.BAYES_DEFAULTS.likelihood, 0, 1, 'BAYES likelihood');
    inRange(DATA.BAYES_DEFAULTS.falseRate, 0, 1, 'BAYES falseRate');
    [DATA.FEMALE_STRATIFIED.male, DATA.FEMALE_STRATIFIED.female].forEach(function (g, i) {
      var name = i === 0 ? 'male' : 'female';
      ['arrest', 'convict', 'incarcerate'].forEach(function (k) {
        if (g[k] < 1) errors.push('FEMALE ' + name + '.' + k + ' 优势比应 >= 1: ' + g[k]);
      });
    });
    return errors;
  }

  var api = {
    DATA: DATA,
    posterior: posterior,
    buildSandbox: buildSandbox,
    getSource: getSource,
    formatPct: formatPct,
    formatOdds: formatOdds,
    formatUplift: formatUplift,
    maxPrisonRate: maxPrisonRate,
    prisonVsGeneralRatio: prisonVsGeneralRatio,
    rateRisk: rateRisk,
    validateSources: validateSources,
    validateRanges: validateRanges
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.TattooSignal = api;
  }
})(typeof window !== 'undefined' ? window : this);
