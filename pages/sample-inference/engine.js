// ========== 核心算法（可独立测试） ==========

function gaussianRandom(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateSamples(mean, std, n, minVal) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let v = gaussianRandom(mean, std);
    if (minVal !== undefined) v = Math.max(minVal, v);
    out.push(v);
  }
  return out;
}

function sampleMean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sampleStd(arr) {
  const m = sampleMean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(arr.length - 1, 1);
  return Math.sqrt(v);
}

function gaussianPDF(x, mean, std) {
  const c = 1 / (std * Math.sqrt(2 * Math.PI));
  return c * Math.exp(-0.5 * ((x - mean) / std) ** 2);
}

function scoreGuess(guessAvg, guessStd, trueAvg, trueStd) {
  const avgErr = Math.abs(guessAvg - trueAvg) / trueStd;
  const stdErr = Math.abs(guessStd - trueStd) / trueStd;
  const avgScore = Math.max(0, 100 - avgErr * 30);
  const stdScore = Math.max(0, 100 - stdErr * 40);
  return Math.round(avgScore * 0.7 + stdScore * 0.3);
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatVal(v, s) {
  const num = s.sliderStep >= 1 ? Math.round(v).toLocaleString() : v.toFixed(1);
  return s.unit ? num + ' ' + s.unit : num;
}

function formatNum(v, s) {
  return s.sliderStep >= 1 ? Math.round(v).toLocaleString() : v.toFixed(1);
}

function getGrade(avg) {
  if (avg >= 85) return '统计大师';
  if (avg >= 70) return '数据侦探';
  if (avg >= 55) return '概率学徒';
  if (avg >= 40) return '直觉新手';
  return '随机猜测';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { gaussianRandom, generateSamples, sampleMean, sampleStd, gaussianPDF, scoreGuess, shuffleArray, formatVal, formatNum, getGrade };
}
