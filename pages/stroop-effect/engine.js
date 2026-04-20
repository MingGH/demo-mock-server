// ========== 斯特鲁普效应 — 核心算法（可独立测试） ==========

const COLORS = [
  { name: '红', css: '#ff4444' },
  { name: '橙', css: '#ff8c00' },
  { name: '黄', css: '#ffd700' },
  { name: '绿', css: '#4CAF50' },
  { name: '蓝', css: '#2196F3' },
  { name: '紫', css: '#9C27B0' },
];

/**
 * 生成一道题目
 * @param {'congruent'|'incongruent'} type
 * @returns {{ text: string, textColor: string, textColorName: string, correctAnswer: string }}
 */
function generateTrial(type) {
  const textIdx = Math.floor(Math.random() * COLORS.length);
  let colorIdx;
  if (type === 'congruent') {
    colorIdx = textIdx;
  } else {
    do { colorIdx = Math.floor(Math.random() * COLORS.length); } while (colorIdx === textIdx);
  }
  return {
    text: COLORS[textIdx].name,
    textColor: COLORS[colorIdx].css,
    textColorName: COLORS[colorIdx].name,
    correctAnswer: COLORS[colorIdx].name,
  };
}

/**
 * 生成一轮题目序列
 * @param {number} congruentCount 一致题数
 * @param {number} incongruentCount 不一致题数
 * @returns {Array}
 */
function generateTrialSequence(congruentCount, incongruentCount) {
  const trials = [];
  for (let i = 0; i < congruentCount; i++) trials.push(generateTrial('congruent'));
  for (let i = 0; i < incongruentCount; i++) trials.push(generateTrial('incongruent'));
  return shuffleArray(trials);
}

/**
 * 判断回答是否正确
 */
function isCorrect(trial, answer) {
  return trial.correctAnswer === answer;
}

/**
 * 计算统计数据
 * @param {Array<{correct: boolean, rt: number, type: string}>} results
 * @returns {{ total, correctCount, accuracy, avgRT, congruent: {accuracy, avgRT}, incongruent: {accuracy, avgRT}, stroopEffect }}
 */
function computeStats(results) {
  const total = results.length;
  const correctCount = results.filter(r => r.correct).length;
  const accuracy = total > 0 ? correctCount / total : 0;
  const correctResults = results.filter(r => r.correct);
  const avgRT = correctResults.length > 0
    ? correctResults.reduce((s, r) => s + r.rt, 0) / correctResults.length
    : 0;

  const congruent = results.filter(r => r.type === 'congruent');
  const incongruent = results.filter(r => r.type === 'incongruent');

  const conCorrect = congruent.filter(r => r.correct);
  const incCorrect = incongruent.filter(r => r.correct);

  const conAccuracy = congruent.length > 0 ? conCorrect.length / congruent.length : 0;
  const incAccuracy = incongruent.length > 0 ? incCorrect.length / incongruent.length : 0;

  const conAvgRT = conCorrect.length > 0
    ? conCorrect.reduce((s, r) => s + r.rt, 0) / conCorrect.length : 0;
  const incAvgRT = incCorrect.length > 0
    ? incCorrect.reduce((s, r) => s + r.rt, 0) / incCorrect.length : 0;

  const stroopEffect = incAvgRT - conAvgRT;

  return {
    total, correctCount, accuracy, avgRT,
    congruent: { accuracy: conAccuracy, avgRT: conAvgRT, count: congruent.length },
    incongruent: { accuracy: incAccuracy, avgRT: incAvgRT, count: incongruent.length },
    stroopEffect,
  };
}

/**
 * 根据斯特鲁普效应量给出评级
 * @param {number} stroopEffect 毫秒
 * @returns {{ grade: string, desc: string, color: string }}
 */
function getStroopGrade(stroopEffect) {
  if (stroopEffect < 50) return { grade: '认知忍者', desc: '你的前额叶皮层抑制能力极强，几乎不受干扰', color: '#4CAF50' };
  if (stroopEffect < 100) return { grade: '冷静选手', desc: '干扰对你影响很小，高于大多数人', color: '#8BC34A' };
  if (stroopEffect < 200) return { grade: '正常水平', desc: '典型的斯特鲁普效应范围，大多数人在这里', color: '#ffd700' };
  if (stroopEffect < 350) return { grade: '容易被带偏', desc: '自动化阅读对你的干扰较大', color: '#FF9800' };
  return { grade: '文字奴隶', desc: '你的大脑几乎无法忽略文字含义', color: '#ff4444' };
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 计算中位数
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COLORS, generateTrial, generateTrialSequence, isCorrect,
    computeStats, getStroopGrade, shuffleArray, median,
  };
}
