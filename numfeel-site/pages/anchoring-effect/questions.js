/**
 * 锚定效应题库
 * 每道题包含：问题文本、单位、真实答案、锚点范围（高/低）
 * 锚点生成规则：低锚 = 真实值 × [0.2, 0.5]，高锚 = 真实值 × [1.8, 3.0]
 *
 * 数据来源标注在每道题的 source 字段
 */

const QUESTIONS = [
  {
    id: 1,
    text: '非洲国家在联合国成员国中占多少百分比？',
    unit: '%',
    answer: 28,
    min: 1,
    max: 100,
    source: '联合国官网：193个成员国中54个非洲国家，54/193≈28%',
    sourceUrl: 'https://www.un.org/en/about-us/member-states',
    category: 'geography'
  },
  {
    id: 2,
    text: '珠穆朗玛峰的海拔高度是多少米？',
    unit: '米',
    answer: 8849,
    min: 1000,
    max: 20000,
    source: '中国国家测绘局2020年测量结果：8848.86米',
    sourceUrl: 'https://en.wikipedia.org/wiki/Mount_Everest',
    category: 'geography'
  },
  {
    id: 3,
    text: '一架波音747客机的最大起飞重量大约是多少吨？',
    unit: '吨',
    answer: 412,
    min: 50,
    max: 1000,
    source: 'Boeing 747-8 MTOW: 412,775 kg',
    sourceUrl: 'https://www.boeing.com/commercial/747',
    category: 'engineering'
  },
  {
    id: 4,
    text: '地球到月球的平均距离大约是多少公里？',
    unit: '公里',
    answer: 384400,
    min: 50000,
    max: 1000000,
    source: 'NASA: 平均距离384,400公里',
    sourceUrl: 'https://moon.nasa.gov/about/in-depth/',
    category: 'science'
  },
  {
    id: 5,
    text: '人体内大约有多少块骨头？',
    unit: '块',
    answer: 206,
    min: 50,
    max: 500,
    source: '成人骨骼数量：206块（Gray\'s Anatomy）',
    sourceUrl: 'https://en.wikipedia.org/wiki/Human_skeleton',
    category: 'biology'
  },
  {
    id: 6,
    text: '光速大约是每秒多少公里？',
    unit: '公里/秒',
    answer: 300000,
    min: 10000,
    max: 800000,
    source: '真空光速：299,792.458 km/s',
    sourceUrl: 'https://en.wikipedia.org/wiki/Speed_of_light',
    category: 'science'
  },
  {
    id: 7,
    text: '亚马逊河的长度大约是多少公里？',
    unit: '公里',
    answer: 6400,
    min: 1000,
    max: 15000,
    source: '亚马逊河长度约6,400公里',
    sourceUrl: 'https://en.wikipedia.org/wiki/Amazon_river',
    category: 'geography'
  },
  {
    id: 8,
    text: '一个标准足球场的面积大约是多少平方米？',
    unit: '平方米',
    answer: 7140,
    min: 1000,
    max: 20000,
    source: 'FIFA标准：105m×68m=7,140㎡',
    sourceUrl: 'https://www.fifa.com/technical/football-technology/standards/football-turf/football-turf-one-star',
    category: 'sports'
  },
  {
    id: 9,
    text: '世界上现存大约有多少种鸟类？',
    unit: '种',
    answer: 10000,
    min: 1000,
    max: 30000,
    source: 'BirdLife International: 约10,000种已知鸟类',
    sourceUrl: 'https://www.birdlife.org/',
    category: 'biology'
  },
  {
    id: 10,
    text: '马里亚纳海沟最深处大约是多少米？',
    unit: '米',
    answer: 10935,
    min: 2000,
    max: 25000,
    source: '挑战者深渊：约10,935米',
    sourceUrl: 'https://en.wikipedia.org/wiki/Challenger_Deep',
    category: 'geography'
  },
  {
    id: 11,
    text: '人类大脑大约有多少个神经元？',
    unit: '亿个',
    answer: 860,
    min: 100,
    max: 2000,
    source: 'Azevedo et al. 2009: 约860亿个神经元',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/19226510/',
    category: 'biology'
  },
  {
    id: 12,
    text: '埃菲尔铁塔的高度（含天线）大约是多少米？',
    unit: '米',
    answer: 330,
    min: 100,
    max: 800,
    source: '埃菲尔铁塔官网：330米（含天线）',
    sourceUrl: 'https://www.toureiffel.paris/',
    category: 'engineering'
  }
];

/**
 * 生成锚点值
 * @param {number} answer 真实答案
 * @param {'high'|'low'} type 高锚/低锚
 * @returns {number} 锚点值（取整）
 */
function generateAnchor(answer, type) {
  if (type === 'low') {
    const factor = 0.2 + Math.random() * 0.3; // [0.2, 0.5]
    return Math.round(answer * factor);
  }
  const factor = 1.8 + Math.random() * 1.2; // [1.8, 3.0]
  return Math.round(answer * factor);
}

/**
 * 从题库中随机抽取 n 道题，并为每道题随机分配高锚或低锚
 * @param {number} n 题目数量
 * @returns {Array} 带锚点的题目数组
 */
function pickQuestions(n) {
  const shuffled = QUESTIONS.slice().sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(n, shuffled.length));
  return picked.map(q => {
    const anchorType = Math.random() < 0.5 ? 'high' : 'low';
    const anchor = generateAnchor(q.answer, anchorType);
    return { ...q, anchorType, anchor };
  });
}

/**
 * 计算锚定系数（Anchoring Index）
 * AI = (用户估值 - 真实值) / (锚点 - 真实值)
 * AI = 0 表示完全不受锚点影响
 * AI = 1 表示完全被锚点拉走
 * AI > 1 表示过度锚定
 * AI < 0 表示反向调整（过度补偿）
 */
function calcAnchoringIndex(userAnswer, trueAnswer, anchor) {
  const denominator = anchor - trueAnswer;
  if (denominator === 0) return 0;
  return (userAnswer - trueAnswer) / denominator;
}

/**
 * 计算一组回答的平均锚定系数
 */
function calcAverageAI(results) {
  if (results.length === 0) return 0;
  const indices = results.map(r => calcAnchoringIndex(r.userAnswer, r.trueAnswer, r.anchor));
  return indices.reduce((a, b) => a + b, 0) / indices.length;
}

/**
 * 计算误差百分比
 */
function calcErrorPercent(userAnswer, trueAnswer) {
  if (trueAnswer === 0) return 0;
  return ((userAnswer - trueAnswer) / trueAnswer) * 100;
}

/**
 * 根据锚定系数给出评级
 */
function getAIRating(ai) {
  const abs = Math.abs(ai);
  if (abs <= 0.1) return { level: 'immune', label: '几乎免疫', color: '#22c55e', desc: '你的判断几乎不受锚点影响，属于极少数人。' };
  if (abs <= 0.3) return { level: 'resistant', label: '轻度影响', color: '#84cc16', desc: '你有一定的抗锚定能力，但锚点仍然在微妙地拉偏你。' };
  if (abs <= 0.5) return { level: 'moderate', label: '中度锚定', color: '#f59e0b', desc: '你和大多数人一样，会被锚点显著影响。这是正常的。' };
  if (abs <= 0.8) return { level: 'strong', label: '强锚定', color: '#f97316', desc: '锚点对你的影响很大。你的估值被明显拉向了锚点方向。' };
  return { level: 'extreme', label: '极强锚定', color: '#ef4444', desc: '你几乎被锚点完全控制了。别担心，知道这个偏差就是改变的开始。' };
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QUESTIONS,
    generateAnchor,
    pickQuestions,
    calcAnchoringIndex,
    calcAverageAI,
    calcErrorPercent,
    getAIRating
  };
}
