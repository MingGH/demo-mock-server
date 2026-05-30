// ========== 信息过载决策崩溃 — 核心算法（可独立测试） ==========

/**
 * Hick 定律：RT = a + b * log2(n + 1)
 * @param {number} n 选项数量
 * @param {number} a 基础反应时间（ms），默认 200
 * @param {number} b 每 bit 增加的时间（ms），默认 150
 * @returns {number} 预测反应时间（ms）
 */
function hickPredict(n, a, b) {
  if (typeof a === 'undefined') a = 200;
  if (typeof b === 'undefined') b = 150;
  return a + b * Math.log2(n + 1);
}

/**
 * 计算 Hick 定律拟合度（R²）
 * @param {Array<{n: number, rt: number}>} data 实测数据
 * @returns {{r2: number, a: number, b: number}}
 */
function hickFit(data) {
  if (!data || data.length < 2) return { r2: 0, a: 0, b: 0 };
  var xs = data.map(function(d) { return Math.log2(d.n + 1); });
  var ys = data.map(function(d) { return d.rt; });
  var n = xs.length;
  var sumX = xs.reduce(function(a, b) { return a + b; }, 0);
  var sumY = ys.reduce(function(a, b) { return a + b; }, 0);
  var sumXY = 0, sumX2 = 0;
  for (var i = 0; i < n; i++) {
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  var b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  var a = (sumY - b * sumX) / n;
  // R²
  var meanY = sumY / n;
  var ssTot = 0, ssRes = 0;
  for (var j = 0; j < n; j++) {
    ssTot += (ys[j] - meanY) * (ys[j] - meanY);
    var pred = a + b * xs[j];
    ssRes += (ys[j] - pred) * (ys[j] - pred);
  }
  var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { r2: Math.max(0, r2), a: a, b: b };
}

/**
 * 决策疲劳衰减模型
 * 质量 = 1 - decay * (round / total)^power
 * @param {number} round 当前轮次（从 1 开始）
 * @param {number} total 总轮次
 * @param {number} decay 最大衰减比例，默认 0.6
 * @param {number} power 衰减指数，默认 1.5
 * @returns {number} 0~1 之间的决策质量
 */
function fatigueQuality(round, total, decay, power) {
  if (typeof decay === 'undefined') decay = 0.6;
  if (typeof power === 'undefined') power = 1.5;
  var ratio = round / total;
  return Math.max(0, 1 - decay * Math.pow(ratio, power));
}

/**
 * 判断一次选择是否为「随机选择」（反应时间过短）
 * @param {number} rt 反应时间（ms）
 * @param {number} threshold 阈值，默认 400ms
 * @returns {boolean}
 */
function isImpulsive(rt, threshold) {
  if (typeof threshold === 'undefined') threshold = 400;
  return rt < threshold;
}

/**
 * 判断一次选择是否为「放弃」（超时）
 * @param {number} rt 反应时间（ms）
 * @param {number} limit 时限（ms）
 * @returns {boolean}
 */
function isTimeout(rt, limit) {
  return rt >= limit;
}

/**
 * 计算选择困难指数（0~100）
 * 综合三个维度：Hick 斜率偏离、疲劳衰减速度、果酱实验犹豫度
 * @param {object} params
 * @returns {number}
 */
function choiceOverloadIndex(params) {
  var hickScore = params.hickScore || 0;   // 0~100，Hick 斜率越陡越高
  var fatigueScore = params.fatigueScore || 0; // 0~100，衰减越快越高
  var jamScore = params.jamScore || 0;     // 0~100，犹豫度越高越高
  return Math.round(hickScore * 0.35 + fatigueScore * 0.35 + jamScore * 0.3);
}

/**
 * 根据选择困难指数给出等级
 * @param {number} index 0~100
 * @returns {{grade: string, label: string, color: string, desc: string}}
 */
function overloadGrade(index) {
  if (index >= 80) return { grade: 'S', label: '重度过载', color: '#ef4444', desc: '选项超过 5 个你就开始崩溃，建议日常决策用「两步筛选法」：先排除，再比较。' };
  if (index >= 60) return { grade: 'A', label: '中度过载', color: '#f59e0b', desc: '你在 10 个选项左右开始明显变慢，属于大多数人的水平。好消息是，意识到这一点本身就能帮你做更好的决策。' };
  if (index >= 40) return { grade: 'B', label: '轻度过载', color: '#22c55e', desc: '你的决策系统比较抗压，选项多了也能保持一定质量。但注意，连续决策仍然会消耗你。' };
  return { grade: 'C', label: '决策铁人', color: '#3b82f6', desc: '你几乎不受选项数量影响，反应时间稳定。你可能天生适合做产品经理或交易员。' };
}

/**
 * 生成 Hick 定律关卡的目标颜色
 * @param {number} n 选项数量
 * @returns {{options: Array<{color: string, label: string}>, targetIndex: number}}
 */
function generateHickRound(n) {
  var palette = [
    { color: '#ef4444', label: '红' },
    { color: '#f59e0b', label: '橙' },
    { color: '#eab308', label: '黄' },
    { color: '#22c55e', label: '绿' },
    { color: '#06b6d4', label: '青' },
    { color: '#3b82f6', label: '蓝' },
    { color: '#8b5cf6', label: '紫' },
    { color: '#ec4899', label: '粉' },
    { color: '#14b8a6', label: '碧' },
    { color: '#f97316', label: '橘' },
    { color: '#a855f7', label: '堇' },
    { color: '#06b6d4', label: '湖蓝' },
    { color: '#84cc16', label: '草绿' },
    { color: '#e11d48', label: '玫红' },
    { color: '#7c3aed', label: '靛' },
    { color: '#0ea5e9', label: '天蓝' },
    { color: '#d946ef', label: '洋红' },
    { color: '#f43f5e', label: '珊瑚' },
    { color: '#10b981', label: '翠' },
    { color: '#6366f1', label: '蓝紫' },
    { color: '#fbbf24', label: '金' },
    { color: '#a3e635', label: '黄绿' },
    { color: '#2dd4bf', label: '薄荷' },
    { color: '#fb923c', label: '杏' },
    { color: '#c084fc', label: '淡紫' },
    { color: '#38bdf8', label: '浅蓝' },
    { color: '#4ade80', label: '嫩绿' },
    { color: '#fb7185', label: '桃' },
    { color: '#818cf8', label: '丁香' },
    { color: '#facc15', label: '柠檬' },
    { color: '#34d399', label: '松石' },
    { color: '#f472b6', label: '樱花' }
  ];
  var options = shuffleArray(palette).slice(0, n);
  var targetIndex = Math.floor(Math.random() * n);
  return { options: options, targetIndex: targetIndex };
}

/**
 * Fisher-Yates 洗牌
 */
function shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/**
 * 果酱实验：生成商品列表
 * @param {number} count 商品数量
 * @returns {Array<{id: number, name: string, color: string, desc: string}>}
 */
function generateJamShelf(count) {
  var allJams = [
    { name: '经典草莓', color: '#ef4444', desc: '甜度适中，果粒感强' },
    { name: '蓝莓芝士', color: '#3b82f6', desc: '微酸回甘，奶香浓郁' },
    { name: '橘子薄荷', color: '#f97316', desc: '清爽解腻，夏日限定' },
    { name: '黑加仑', color: '#7c3aed', desc: '浓郁深沉，适合搭配吐司' },
    { name: '蜜桃乌龙', color: '#ec4899', desc: '茶香果甜，层次丰富' },
    { name: '柠檬凝乳', color: '#eab308', desc: '酸甜平衡，英式经典' },
    { name: '无花果核桃', color: '#92400e', desc: '坚果碎粒，口感丰富' },
    { name: '树莓玫瑰', color: '#e11d48', desc: '花香果味，浪漫之选' },
    { name: '芒果百香果', color: '#fbbf24', desc: '热带风情，酸甜爽口' },
    { name: '抹茶红豆', color: '#22c55e', desc: '日式风味，微苦回甘' },
    { name: '焦糖苹果', color: '#d97706', desc: '秋日温暖，肉桂点缀' },
    { name: '黑樱桃', color: '#991b1b', desc: '浓烈果味，微带酒香' },
    { name: '椰子菠萝', color: '#fef3c7', desc: '热带组合，清甜不腻' },
    { name: '薰衣草蜂蜜', color: '#a78bfa', desc: '花田芬芳，天然甜蜜' },
    { name: '肉桂苹果', color: '#b45309', desc: '温暖辛香，冬日首选' },
    { name: '西柚迷迭香', color: '#fb923c', desc: '草本清新，微苦回甘' },
    { name: '覆盆子巧克力', color: '#be123c', desc: '酸甜遇上醇厚，经典搭配' },
    { name: '百里香柠檬', color: '#84cc16', desc: '草本清香，地中海风味' },
    { name: '杏仁橙花', color: '#fdba74', desc: '坚果花香，优雅细腻' },
    { name: '接骨木花', color: '#d8b4fe', desc: '英伦花园，清雅怡人' },
    { name: '番石榴辣椒', color: '#dc2626', desc: '甜辣交织，大胆创新' },
    { name: '枫糖核桃', color: '#a16207', desc: '加拿大风味，浓郁醇厚' },
    { name: '酸樱桃杏仁', color: '#f43f5e', desc: '酸甜坚果，层次分明' },
    { name: '伯爵茶梨', color: '#78716c', desc: '茶香果韵，英式下午茶' }
  ];
  return shuffleArray(allJams).slice(0, count).map(function(j, i) {
    return { id: i, name: j.name, color: j.color, desc: j.desc };
  });
}

// ── 导出（Node.js 测试用） ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hickPredict: hickPredict,
    hickFit: hickFit,
    fatigueQuality: fatigueQuality,
    isImpulsive: isImpulsive,
    isTimeout: isTimeout,
    choiceOverloadIndex: choiceOverloadIndex,
    overloadGrade: overloadGrade,
    generateHickRound: generateHickRound,
    shuffleArray: shuffleArray,
    generateJamShelf: generateJamShelf
  };
}
