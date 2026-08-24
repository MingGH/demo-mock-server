/**
 * 合取谬误（Conjunction Fallacy）— 核心逻辑
 *
 * 10 道"琳达式"题目。每题的选项结构固定：
 *   A = 单项（如"Linda 是银行出纳员"）——正确答案
 *   B = 合取项（如"Linda 是银行出纳员并且积极参与女权运动"）——陷阱项
 *
 * 逻辑：B 是 A 的子集（B ⊂ A），P(B) 不可能大于 P(A)。
 * 选择 B 即踩中合取谬误（Tversky & Kahneman, 1983，经典命中率约 85%）。
 */

/** 题目常量：id 从 1 到 10 */
var QUESTIONS = [
  {
    id: 1,
    scenario: 'Linda 31 岁，单身，直率，非常聪明。大学主修哲学，学生时代深切关注歧视与社会公正，还参加过反核示威。',
    options: [
      { key: 'A', text: 'Linda 是银行出纳员', isSingle: true },
      { key: 'B', text: 'Linda 是银行出纳员，并且积极参与女权运动', isSingle: false }
    ],
    explanation: '「银行出纳员 ∧ 女权运动者」是「银行出纳员」的子集，概率不可能比 A 更大。但代表性与叙事感让大多数人选 B。'
  },
  {
    id: 2,
    scenario: 'Bill 34 岁，聪明但缺乏想象力，大学主修会计，单身，喜欢数学和电脑。他业余时间热爱爵士乐。',
    options: [
      { key: 'A', text: 'Bill 是会计师', isSingle: true },
      { key: 'B', text: 'Bill 是会计师，并且会吹萨克斯管', isSingle: false }
    ],
    explanation: 'B 是 A 与「会吹萨克斯管」的交集，永远不可能比 A 更可能。'
  },
  {
    id: 3,
    scenario: 'Kate 27 岁，严格控制饮食，每周晨跑 5 次，刚完成人生第一个半程马拉松。',
    options: [
      { key: 'A', text: 'Kate 是营养师', isSingle: true },
      { key: 'B', text: 'Kate 是营养师，并且参加过马拉松', isSingle: false }
    ],
    explanation: '营养师 + 马拉松跑者，听起来更"合理"，但它是营养师的子集。'
  },
  {
    id: 4,
    scenario: '张伟 29 岁，互联网公司程序员，业余喜欢写歌、弹吉他，周末经常逛乐器店。',
    options: [
      { key: 'A', text: '张伟是程序员', isSingle: true },
      { key: 'B', text: '张伟是程序员，并且会弹吉他', isSingle: false }
    ],
    explanation: '「程序员 ∧ 会弹吉他」是「程序员」的子集，叠加细节让它显得更可信。'
  },
  {
    id: 5,
    scenario: '王芳 41 岁，三甲医院外科医生，收养了 3 只流浪猫，每个周末去动物收容所做义工。',
    options: [
      { key: 'A', text: '王芳是医生', isSingle: true },
      { key: 'B', text: '王芳是医生，并且喜欢动物', isSingle: false }
    ],
    explanation: '附加的属性越多，集合越小。B 描述再贴切，也只是 A 的一部分。'
  },
  {
    id: 6,
    scenario: '李雷 52 岁，大学教授，教政治学，长期参与国际和平运动，多次被提名和平奖。',
    options: [
      { key: 'A', text: '李雷是大学教授', isSingle: true },
      { key: 'B', text: '李雷是大学教授，并且参与和平运动', isSingle: false }
    ],
    explanation: '和平运动家 + 教授的形象更饱满，但「教授 ∧ 和平运动」⊂「教授」。'
  },
  {
    id: 7,
    scenario: '陈晨 23 岁，大学时是话剧社台柱子，毕业后来到北京，白天在餐厅打工。',
    options: [
      { key: 'A', text: '陈晨是餐厅服务员', isSingle: true },
      { key: 'B', text: '陈晨是餐厅服务员，并且业余时间做演员', isSingle: false }
    ],
    explanation: 'B 里每多一个条件，可能性就缩小一圈。'
  },
  {
    id: 8,
    scenario: '赵敏 20 岁，长得漂亮，走在街上经常被搭讪，平时最喜欢泡图书馆看书。',
    options: [
      { key: 'A', text: '赵敏是杂志模特', isSingle: true },
      { key: 'B', text: '赵敏是杂志模特，并且喜欢阅读', isSingle: false }
    ],
    explanation: '「爱阅读的模特」更有记忆点，但 A 永远包含 B。'
  },
  {
    id: 9,
    scenario: '马强 35 岁，销售总监，常年出差，每周去健身房 4 次，朋友圈全是健身打卡照。',
    options: [
      { key: 'A', text: '马强是销售经理', isSingle: true },
      { key: 'B', text: '马强是销售经理，并且坚持健身', isSingle: false }
    ],
    explanation: '细节越具体越像真的，概率却相反：合取项 ≤ 单项。'
  },
  {
    id: 10,
    scenario: '孙丽 26 岁，性格温柔，特别喜欢小孩，从小在少年宫合唱团长大的。',
    options: [
      { key: 'A', text: '孙丽是幼儿园老师', isSingle: true },
      { key: 'B', text: '孙丽是幼儿园老师，并且在合唱团唱歌', isSingle: false }
    ],
    explanation: '「会唱歌的幼师」听起来天衣无缝，但它只是「幼师」的一个子集。'
  }
];

/** 论文经典常模：约 85% 的人选中合取项（Tversky & Kahneman, 1983）。 */
var PAPER_CONJUNCTION_RATE = 85;

/**
 * 判断某一题的某个选择是否答对（答对 = 选单项 A）。
 *
 * @param {number} questionId 题目 id（1~10）
 * @param {string} choice 选项 key（'A' 或 'B'）
 * @returns {boolean} 是否答对
 */
function isCorrect(questionId, choice) {
  var q = QUESTIONS[questionId - 1];
  if (!q) return false;
  for (var i = 0; i < q.options.length; i++) {
    if (q.options[i].key === choice) {
      return q.options[i].isSingle;
    }
  }
  return false;
}

/**
 * 根据完整作答计算得分。
 *
 * @param {Array<string>} choices 10 个选项 key 的数组，choices[i] 对应第 i+1 题
 * @returns {{total: number, correct: number, choices: Array<boolean>}} 总分、答对数与逐题对错
 */
function computeResult(choices) {
  var correct = 0;
  var flags = [];
  for (var i = 0; i < QUESTIONS.length; i++) {
    var c = choices[i] || '';
    var ok = isCorrect(i + 1, c);
    flags.push(ok);
    if (ok) correct++;
  }
  return { total: QUESTIONS.length, correct: correct, choices: flags };
}

/**
 * 生成用户画像文案。
 *
 * @param {number} correct 答对题数（0~10）
 * @returns {{title: string, text: string}} 画像标题与描述
 */
function getVerdict(correct) {
  if (correct <= 1) {
    return {
      title: '直觉陷阱深度体验者',
      text: '你几乎每道题都凭"更像真的"做判断——这正是合取谬误的典型表现，也意味着你和论文里那 85% 的人完全一致。放心，这是人脑的出厂设置，不是你的错。'
    };
  }
  if (correct <= 4) {
    return {
      title: '部分免疫者',
      text: '你在几道题上嗅到了"不对劲"——但大部分时候，叙事感仍然赢了概率。你已经比很多人强了：很多人 10 道全中招。'
    };
  }
  if (correct <= 7) {
    return {
      title: '概率直觉清醒者',
      text: '大多数题你都识破了"子集陷阱"，知道合取项不可能比单项更可能。剩下的失手，多半是被细节丰富度带偏了——人人都这样。'
    };
  }
  return {
    title: '统计直觉超常者',
    text: '10 道题中你能识破绝大部分陷阱。你可能学过概率论，或天然对集合关系敏感。论文里 85% 的人做不到这一点。'
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QUESTIONS: QUESTIONS,
    PAPER_CONJUNCTION_RATE: PAPER_CONJUNCTION_RATE,
    isCorrect: isCorrect,
    computeResult: computeResult,
    getVerdict: getVerdict
  };
}
