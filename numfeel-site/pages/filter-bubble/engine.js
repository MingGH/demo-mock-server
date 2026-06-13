/**
 * 推荐系统模拟引擎
 * 实现协同过滤 + 兴趣衰减 + ε-greedy 探索
 */

const CATEGORIES = [
  { id: 'tech',      name: '科技数码',   color: '#90caf9' },
  { id: 'entertain', name: '娱乐八卦',   color: '#ce93d8' },
  { id: 'finance',   name: '财经理财',   color: '#ffd700' },
  { id: 'food',      name: '美食生活',   color: '#ffb74d' },
  { id: 'sports',    name: '体育运动',   color: '#81c784' },
  { id: 'science',   name: '科学探索',   color: '#80deea' },
  { id: 'history',   name: '历史人文',   color: '#bcaaa4' },
  { id: 'game',      name: '游戏电竞',   color: '#ef9a9a' },
  { id: 'travel',    name: '旅行户外',   color: '#a5d6a7' },
  { id: 'emotion',   name: '情感心理',   color: '#f48fb1' }
];

// 内容池：每个类别的标题模板
const CONTENT_POOL = {
  tech: [
    '苹果发布 M5 芯片：单核性能再涨 40%',
    '华为新机预售 30 秒破万：供应链做了什么',
    'GPT-5 内测泄漏：上下文窗口突破百万 token',
    '折叠屏手机终于不再是智商税了吗',
    '国产光刻机最新进展：差距还有多大',
    '英伟达市值超越苹果背后的算力军备竞赛',
    '鸿蒙5.0 实测：生态短板补上了几成',
    '全球芯片产能过剩：价格战已经开始'
  ],
  entertain: [
    '顶流塌房后的经纪公司：三天换了五套说辞',
    '这部豆瓣9.2的剧为什么没人看',
    '选秀节目停了三年，练习生们去哪了',
    '短剧日充值过亿：谁在为狗血买单',
    '明星带货翻车合集：数据注水有多离谱',
    '综艺嘉宾「真性情」是剧本还是即兴',
    '电影票房注水：幽灵场到底怎么操作的',
    'AI 换脸已经能骗过人脸识别了'
  ],
  finance: [
    'A股又跌了：这次的利好为什么不管用',
    '年轻人存款焦虑：月薪8000该怎么分配',
    '基金经理跑不赢指数：主动管理还有意义吗',
    '房贷利率降到3%以下：要不要提前还贷',
    '数字人民币推广两年：谁在用？',
    '量化交易收割散户：技术碾压还是规则漏洞',
    '黄金暴涨的逻辑：避险还是炒作',
    '退休金缺口：90后该从现在开始焦虑吗'
  ],
  food: [
    '预制菜进校园争议：营养和便利怎么平衡',
    '一杯奶茶的真实成本只有3块钱',
    '米其林餐厅和苍蝇馆子的差距在哪',
    '代糖到底安不安全：最新研究怎么说',
    '外卖平台抽成30%：商家怎么活下来的',
    '年轻人开始自己带饭了：省钱还是养生',
    '网红餐厅为什么活不过18个月',
    '酱油里到底有多少添加剂'
  ],
  sports: [
    '中国足球又输了：这次该怪谁',
    '跑步膝盖疼：99%的人姿势都不对',
    'NBA 球星降薪加盟：联盟工资帽怎么玩的',
    '马拉松猝死事件：赛事方该承担什么责任',
    '电子竞技算不算体育：奥委会最新态度',
    '健身房跑路潮：预付费模式的数学必然',
    '世界杯扩军48队：含金量稀释了吗',
    '运动手环的心率数据有多准'
  ],
  science: [
    '韦伯望远镜新发现：130亿年前的星系长什么样',
    '可控核聚变又「突破」了：这次是真的吗',
    '人类大脑只用了10%是谣言：真实利用率是多少',
    '量子计算机能破解比特币吗：时间表估算',
    'mRNA 疫苗下一个目标：癌症',
    '地球磁极正在翻转：会发生什么',
    '暗物质搜索60年无果：物理学走进死胡同了吗',
    'AI 预测蛋白质结构：药物研发要变天'
  ],
  history: [
    '三星堆新出土文物：教科书可能要改写',
    '古罗马的下水道系统比很多现代城市还先进',
    '二战密码破译：图灵机的真实战绩',
    '中国古代就有「信用卡」：飞钱的运作方式',
    '长城到底有没有用：游牧民族视角',
    '敦煌壁画的颜料配方：千年不褪色的秘密',
    '清朝GDP占全球1/3的说法靠谱吗',
    '古埃及工人的工资单：啤酒和面包'
  ],
  game: [
    '黑神话首月销量破2000万：国产3A的拐点',
    '游戏氪金的心理学：为什么明知是坑还要充',
    '独立游戏开发者的真实收入：月均不到3000',
    'Steam 退款机制被薅羊毛：2小时够通关的游戏怎么办',
    '外挂产业链：一个月流水上千万',
    '游戏防沉迷系统的实际效果：数据说了什么',
    'UGC 游戏平台：让玩家做内容的商业模式',
    '云游戏延迟降到20ms以下：体验还差什么'
  ],
  travel: [
    '特种兵旅游的经济学：省钱还是费钱',
    '民宿照片和实际差距有多大：平台怎么管',
    '淡季机票便宜50%但请不了假：时间的价格',
    '自驾游充电焦虑：高速服务区够用吗',
    '签证难度排行：哪些国家最好去',
    '景区门票定价逻辑：为什么越来越贵',
    '旅行博主的真实收入和拍摄成本',
    '跟团游为什么总进购物店：回扣结构揭秘'
  ],
  emotion: [
    '为什么越亲近的人越容易互相伤害',
    'PUA 的识别清单：这8个信号要警惕',
    '社交焦虑不是内向：两者的本质区别',
    '原生家庭的影响能被克服吗：心理学怎么说',
    '分手后的「断联」为什么比想象中难',
    '讨好型人格的自我诊断和调整路径',
    '孤独感流行病：独居时代的心理代价',
    '情绪价值到底是什么：能被量化吗'
  ]
};

/**
 * 推荐引擎类
 */
class RecommendEngine {
  constructor(options = {}) {
    this.epsilon = options.epsilon || 0;  // 探索率：0 = 纯贪心
    this.decayRate = options.decayRate || 0.92;  // 未点击类别的衰减系数
    this.boostRate = options.boostRate || 1.8;  // 点击类别的增强系数
    this.feedSize = options.feedSize || 6;  // 每轮推荐数量

    // 初始权重：均匀分布
    this.weights = {};
    CATEGORIES.forEach(cat => {
      this.weights[cat.id] = 1.0;
    });

    this.history = [];       // 点击历史
    this.entropyLog = [];    // 每轮信息熵记录
    this.round = 0;

    // 记录初始熵
    this.entropyLog.push(this.calcEntropy());
  }

  /**
   * 计算当前权重分布的信息熵（Shannon Entropy）
   */
  calcEntropy() {
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    let entropy = 0;
    Object.values(this.weights).forEach(w => {
      const p = w / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    });
    return entropy;
  }

  /**
   * 获取归一化的权重分布（概率）
   */
  getDistribution() {
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    const dist = {};
    CATEGORIES.forEach(cat => {
      dist[cat.id] = this.weights[cat.id] / total;
    });
    return dist;
  }

  /**
   * 生成一轮推荐列表
   */
  generateFeed() {
    const feed = [];
    const dist = this.getDistribution();

    for (let i = 0; i < this.feedSize; i++) {
      let catId;

      // ε-greedy：epsilon 概率随机探索
      if (Math.random() < this.epsilon) {
        catId = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)].id;
      } else {
        // 按权重概率抽样
        catId = this._weightedSample(dist);
      }

      const pool = CONTENT_POOL[catId];
      const title = pool[Math.floor(Math.random() * pool.length)];
      const cat = CATEGORIES.find(c => c.id === catId);

      feed.push({
        id: `${this.round}-${i}`,
        catId,
        catName: cat.name,
        catColor: cat.color,
        title,
        score: (dist[catId] * 100).toFixed(1)
      });
    }

    return feed;
  }

  /**
   * 用户点击某条内容后更新权重
   */
  recordClick(catId) {
    this.round++;
    this.history.push(catId);

    // 更新权重：点击的类别增强，其他类别衰减
    CATEGORIES.forEach(cat => {
      if (cat.id === catId) {
        this.weights[cat.id] *= this.boostRate;
      } else {
        // 探索模式下衰减更温和（模拟真实系统中探索对多样性的保护）
        const effectiveDecay = this.epsilon > 0
          ? 1 - (1 - this.decayRate) * 0.4  // 探索模式只衰减 40% 的力度
          : this.decayRate;
        this.weights[cat.id] *= effectiveDecay;
      }
      // 设置下界，防止权重归零
      this.weights[cat.id] = Math.max(this.weights[cat.id], 0.01);
    });

    // 探索模式下：每隔几轮给所有类别注入一点基础权重（模拟多样性保护策略）
    if (this.epsilon > 0 && this.round % 2 === 0) {
      const avgWeight = Object.values(this.weights).reduce((a, b) => a + b, 0) / CATEGORIES.length;
      CATEGORIES.forEach(cat => {
        this.weights[cat.id] += avgWeight * this.epsilon;
      });
    }

    // 记录熵
    this.entropyLog.push(this.calcEntropy());
  }

  /**
   * 按权重概率抽样
   */
  _weightedSample(dist) {
    const r = Math.random();
    let cumulative = 0;
    for (const catId of Object.keys(dist)) {
      cumulative += dist[catId];
      if (r <= cumulative) return catId;
    }
    return CATEGORIES[CATEGORIES.length - 1].id;
  }

  /**
   * 获取统计摘要
   */
  getSummary() {
    const dist = this.getDistribution();
    const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0];
    const dominantCat = CATEGORIES.find(c => c.id === dominant[0]);

    const initialEntropy = this.entropyLog[0];
    const finalEntropy = this.entropyLog[this.entropyLog.length - 1];
    const entropyDrop = ((1 - finalEntropy / initialEntropy) * 100).toFixed(1);

    // 收敛轮次：熵低于初始值 50% 的第一轮
    let convergeRound = '未收敛';
    const threshold = initialEntropy * 0.5;
    for (let i = 1; i < this.entropyLog.length; i++) {
      if (this.entropyLog[i] < threshold) {
        convergeRound = `第 ${i} 轮`;
        break;
      }
    }

    return {
      dominantName: dominantCat.name,
      dominantPercent: (dominant[1] * 100).toFixed(1) + '%',
      entropyDrop: entropyDrop + '%',
      convergeRound,
      initialEntropy: initialEntropy.toFixed(2),
      finalEntropy: finalEntropy.toFixed(2)
    };
  }
}

/**
 * 自动模拟：模拟一个有偏好的用户
 * 
 * 用户行为模型：
 * - 70% 概率点击推荐列表中自己当前最感兴趣（权重最高）的那条
 * - 30% 概率从列表中随机选一条点击
 * 
 * 关键区别：
 * - epsilon=0 时，feed 全是高权重类别，用户无论选哪条都在强化已有偏好
 * - epsilon>0 时，feed 里混入了随机类别的内容，用户的随机点击有概率
 *   命中这些探索内容，从而给其他类别注入权重，延缓收敛
 */
function autoSimulate(rounds = 100, epsilon = 0) {
  const engine = new RecommendEngine({ epsilon });

  for (let i = 0; i < rounds; i++) {
    const feed = engine.generateFeed();

    // 模拟用户行为：根据 feed 中各条目的曝光，按 softmax 概率点击
    // 高权重内容更容易被点，但低权重内容也有机会（模拟好奇心）
    let choice;
    if (Math.random() < 0.6) {
      // 60% 概率选权重最高的（确认偏好）
      const dist = engine.getDistribution();
      const sorted = [...feed].sort((a, b) => dist[b.catId] - dist[a.catId]);
      choice = sorted[0].catId;
    } else {
      // 40% 概率从 feed 中随机选（可能命中探索内容）
      choice = feed[Math.floor(Math.random() * feed.length)].catId;
    }

    engine.recordClick(choice);
  }

  return engine;
}
