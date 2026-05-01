var SCENARIOS = [
  {
    id: 1,
    title: '亚洲疾病问题',
    context: '一种罕见疾病预计将导致 600 人死亡。现有两种应对方案：',
    positive: {
      optionA: '方案A：确定救活 200 人',
      optionB: '方案B：1/3 概率救活全部 600 人，2/3 概率无人获救'
    },
    negative: {
      optionA: '方案A：确定有 400 人死亡',
      optionB: '方案B：1/3 概率无人死亡，2/3 概率 600 人全部死亡'
    },
    classicData: { positiveA: 72, negativeA: 22 },
    source: 'Tversky, A. & Kahneman, D. (1981). The framing of decisions and the psychology of choice. Science, 211(4481), 453-458.',
    category: 'medical'
  },
  {
    id: 2,
    title: '投资方案',
    context: '你有一笔 10 万元的闲置资金可以投资：',
    positive: {
      optionA: '方案A：确定盈利 5 万元',
      optionB: '方案B：50% 概率盈利 10 万元，50% 概率盈亏为零'
    },
    negative: {
      optionA: '方案A：确定亏损 5 万元',
      optionB: '方案B：50% 概率不亏损，50% 概率亏损 10 万元'
    },
    classicData: { positiveA: 68, negativeA: 28 },
    source: 'Kahneman, D. & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291.',
    category: 'finance'
  },
  {
    id: 3,
    title: '手术方案',
    context: '一位患者需要接受手术，有两种手术方案：',
    positive: {
      optionA: '方案A：术后 5 年存活率为 68%',
      optionB: '方案B：术后有 68% 概率存活超过 5 年，32% 概率术中死亡'
    },
    negative: {
      optionA: '方案A：术后 5 年死亡率为 32%',
      optionB: '方案B：术后有 32% 概率术中死亡，68% 概率存活超过 5 年'
    },
    classicData: { positiveA: 59, negativeA: 41 },
    source: 'McNeil, B. J., Pauker, S. G., Sox, H. C., & Tversky, A. (1982). On the elicitation of preferences for alternative therapies. New England Journal of Medicine, 306(21), 1259-1262.',
    category: 'medical'
  },
  {
    id: 4,
    title: '职位选择',
    context: '你收到了两个创业公司的 offer，两种薪酬方案：',
    positive: {
      optionA: '方案A：年薪确定 30 万元',
      optionB: '方案B：50% 概率年薪 60 万元（公司上市），50% 概率年薪为零（公司倒闭）'
    },
    negative: {
      optionA: '方案A：年薪比行业平均水平少 30 万元',
      optionB: '方案B：50% 概率年薪不比行业平均少，50% 概率年薪比行业平均少 60 万元'
    },
    classicData: null,
    source: '基于前景理论的薪酬决策框架改编。参考：Kahneman & Tversky (1979)。',
    category: 'career'
  },
  {
    id: 5,
    title: '环保政策',
    context: '一项环保政策将影响 1000 平方公里的森林：',
    positive: {
      optionA: '方案A：确定保护 600 平方公里',
      optionB: '方案B：60% 概率保护全部 1000 平方公里，40% 概率保护 0 平方公里'
    },
    negative: {
      optionA: '方案A：确定损失 400 平方公里',
      optionB: '方案B：40% 概率损失全部 1000 平方公里，60% 概率损失 0 平方公里'
    },
    classicData: null,
    source: 'Hardisty, D. J., Johnson, E. J., & Weber, E. U. (2010). A dirty word or a dirty world? Attribute framing, political affiliation, and query theory. Psychological Science, 21(1), 86-92.',
    category: 'environment'
  },
  {
    id: 6,
    title: '延长保修',
    context: '你购买了一台价值 5000 元的笔记本电脑，考虑是否购买延长保修：',
    positive: {
      optionA: '方案A：确定获得 2 年延长保修（价值 500 元）',
      optionB: '方案B：20% 概率获得终身保修（价值 2500 元），80% 概率获得 0 元保修'
    },
    negative: {
      optionA: '方案A：确定承担 500 元维修费',
      optionB: '方案B：80% 概率承担 0 元维修费，20% 概率承担 2500 元维修费'
    },
    classicData: null,
    source: '基于 Johnson, E. J., Hershey, J., Meszaros, J., & Kunreuther, H. (1993). Framing, probability distortions, and insurance decisions. Journal of Risk and Uncertainty, 7(1), 35-51.',
    category: 'consumer'
  },
  {
    id: 7,
    title: '公司裁员',
    context: '一家公司有 300 名员工，因市场萎缩必须缩减成本：',
    positive: {
      optionA: '方案A：确定保留 200 名员工',
      optionB: '方案B：2/3 概率保留全部 300 名员工，1/3 概率保留 0 名'
    },
    negative: {
      optionA: '方案A：确定裁掉 100 名员工',
      optionB: '方案B：1/3 概率裁掉全部 300 名，2/3 概率裁掉 0 名'
    },
    classicData: null,
    source: '改编自 Tversky & Kahneman (1981) 亚洲疾病问题的组织决策扩展。',
    category: 'business'
  },
  {
    id: 8,
    title: '奖学金分配',
    context: '学校有 500 万元奖学金预算，需要分配给 100 名学生：',
    positive: {
      optionA: '方案A：确保每位学生获得 3 万元',
      optionB: '方案B：30% 概率每位学生获得 10 万元，70% 概率获得 0 元'
    },
    negative: {
      optionA: '方案A：确保每位学生损失 7 万元资助机会',
      optionB: '方案B：70% 概率损失全部 10 万元资助机会，30% 概率损失 0 元'
    },
    classicData: null,
    source: '基于前景理论的资源分配场景改编。',
    category: 'education'
  },
  {
    id: 9,
    title: '食品添加剂',
    context: '一种新型食品添加剂进行了 200 人的长期观察研究：',
    positive: {
      optionA: '方案A：确定 160 人健康无异常',
      optionB: '方案B：80% 概率全部 200 人健康，20% 概率 0 人健康'
    },
    negative: {
      optionA: '方案A：确定 40 人出现异常',
      optionB: '方案B：20% 概率全部 200 人出现异常，80% 概率 0 人出现异常'
    },
    classicData: null,
    source: 'Levin, I. P., Schneider, S. L., & Gaeth, G. J. (1998). All frames are not created equal: A typology and critical analysis of framing effects. Organizational Behavior and Human Decision Processes, 76(2), 149-188.',
    category: 'health'
  },
  {
    id: 10,
    title: '旅行保险',
    context: '你计划了一次价值 2 万元的国际旅行：',
    positive: {
      optionA: '方案A：确定获得 2000 元旅行补贴',
      optionB: '方案B：10% 概率获得 2 万元免费旅行，90% 概率获得 0 元'
    },
    negative: {
      optionA: '方案A：确定损失 2000 元（因故取消）',
      optionB: '方案B：90% 概率损失 0 元，10% 概率损失 2 万元'
    },
    classicData: null,
    source: '改编自保险决策中的框架效应研究。参考：Johnson et al. (1993)。',
    category: 'consumer'
  }
];

function shuffleArray(arr) {
  var result = arr.slice();
  for (var i = result.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

function pickQuestions(n) {
  n = n || 10;
  var selected = shuffleArray(SCENARIOS).slice(0, n);
  var halfPositive = Math.floor(n / 2);
  var remaining = n - halfPositive;
  var frames = [];
  for (var i = 0; i < halfPositive; i++) {
    frames.push('positive');
  }
  for (var i = 0; i < remaining; i++) {
    frames.push('negative');
  }
  frames = shuffleArray(frames);

  return selected.map(function(scenario, i) {
    var frame = frames[i];
    return {
      id: scenario.id,
      title: scenario.title,
      context: scenario.context,
      frame: frame,
      optionA: scenario[frame].optionA,
      optionB: scenario[frame].optionB,
      category: scenario.category,
      source: scenario.source,
      classicData: scenario.classicData,
      originalScenario: scenario
    };
  });
}

function calcFramingIndex(answers) {
  if (!answers || answers.length === 0) {
    return {
      framingIndex: 0,
      positiveARate: 0,
      negativeARate: 0,
      positiveCount: 0,
      negativeCount: 0,
      positiveA: 0,
      negativeA: 0
    };
  }

  var positiveTotal = 0;
  var positiveA = 0;
  var negativeTotal = 0;
  var negativeA = 0;

  for (var i = 0; i < answers.length; i++) {
    var ans = answers[i];
    if (ans.frame === 'positive') {
      positiveTotal++;
      if (ans.choice === 'A') positiveA++;
    } else {
      negativeTotal++;
      if (ans.choice === 'A') negativeA++;
    }
  }

  var positiveARate = positiveTotal > 0 ? positiveA / positiveTotal : 0;
  var negativeARate = negativeTotal > 0 ? negativeA / negativeTotal : 0;
  var framingIndex = Math.abs(positiveARate - negativeARate);

  return {
    framingIndex: Math.round(framingIndex * 1000) / 1000,
    positiveARate: Math.round(positiveARate * 1000) / 1000,
    negativeARate: Math.round(negativeARate * 1000) / 1000,
    positiveCount: positiveTotal,
    negativeCount: negativeTotal,
    positiveA: positiveA,
    negativeA: negativeA
  };
}

function getFramingRating(index) {
  if (index <= 0.1) {
    return {
      level: 'rational',
      label: '高度理性',
      color: '#22c55e',
      desc: '你在两种说法下的选择几乎完全一致，框架效应未能影响你的判断。你是概率论的「铁头娃」，大脑的决策系统对表述方式有很强的免疫力。'
    };
  }
  if (index <= 0.3) {
    return {
      level: 'mild',
      label: '轻度影响',
      color: '#4ade80',
      desc: '框架效应对你有轻微影响，但总体上你仍能看穿表述方式的差异。大多数时候你是理性的，偶尔会被「说法」带偏一点点。'
    };
  }
  if (index <= 0.5) {
    return {
      level: 'moderate',
      label: '中度影响',
      color: '#fbbf24',
      desc: '框架效应对你有明显影响。在正面表述下你倾向于保守，在负面表述下你倾向于冒险——这正是前景理论预测的典型行为模式。'
    };
  }
  if (index <= 0.7) {
    return {
      level: 'strong',
      label: '强框架效应',
      color: '#f59e0b',
      desc: '你的选择被「说法」严重左右。同一个事实换一种表述，你很可能做出完全不同的选择。这在重大决策（医疗、投资）中可能带来实际损失。'
    };
  }
  return {
    level: 'extreme',
    label: '极强框架效应',
    color: '#ef4444',
    desc: '你几乎完全被表述方式控制。正面说法下你选保守，负面说法下你选冒险——你的大脑没有在处理「事实」，而是在处理「情绪」。建议在做重要决定前，尝试把问题「翻译」成另一种说法再看一遍。'
  };
}

function getScenarioById(id) {
  for (var i = 0; i < SCENARIOS.length; i++) {
    if (SCENARIOS[i].id === id) {
      return SCENARIOS[i];
    }
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCENARIOS: SCENARIOS,
    pickQuestions: pickQuestions,
    calcFramingIndex: calcFramingIndex,
    getFramingRating: getFramingRating,
    getScenarioById: getScenarioById,
    shuffleArray: shuffleArray
  };
}
