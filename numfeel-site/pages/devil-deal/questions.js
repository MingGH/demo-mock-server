/**
 * 恶魔交易诊断 — 题库
 *
 * 6 个维度：power(权力) / love(爱情) / money(金钱) / revenge(复仇) / recognition(被认可) / knowledge(知识)
 * 每题 4 个选项，每个选项对不同维度加分（0-3 分）
 * 10 道情境题，覆盖日常决策、压力场景、幻想场景
 */

var DIMENSIONS = [
  { id: 'power',       name: '权力',   icon: 'ti-crown',        color: '#ff4444', emoji: '👑' },
  { id: 'love',        name: '爱情',   icon: 'ti-heart-filled', color: '#ff69b4', emoji: '💘' },
  { id: 'money',       name: '金钱',   icon: 'ti-coin',         color: '#fbbf24', emoji: '💰' },
  { id: 'revenge',     name: '复仇',   icon: 'ti-flame',        color: '#ff6600', emoji: '🔥' },
  { id: 'recognition', name: '被认可', icon: 'ti-star',         color: '#a78bfa', emoji: '⭐' },
  { id: 'knowledge',   name: '知识',   icon: 'ti-book',         color: '#60a5fa', emoji: '📖' }
];

var QUESTIONS = [
  {
    text: '深夜加班，你一个人在办公室。电脑弹出一条消息：「你可以看到任何一个人此刻在做什么。」你第一反应想看谁？',
    tag: '窥探欲',
    opts: [
      { text: '老板——我想知道他背后怎么评价我', scores: { power: 2, recognition: 3, money: 1 } },
      { text: '暗恋的人——想知道 ta 有没有在想我', scores: { love: 3, recognition: 1 } },
      { text: '竞争对手——看看他到底比我强在哪', scores: { revenge: 2, power: 2, recognition: 1 } },
      { text: '某个领域的顶尖大佬——想偷师他的工作方式', scores: { knowledge: 3, power: 1 } }
    ]
  },
  {
    text: '你在路上捡到一个旧油灯，擦了一下，精灵说只能许一个愿望。你选：',
    tag: '核心欲望',
    opts: [
      { text: '让我成为所在行业最有影响力的人', scores: { power: 3, recognition: 2 } },
      { text: '让那个人爱上我，而且是真心的', scores: { love: 3, money: 0 } },
      { text: '给我一笔永远花不完的钱', scores: { money: 3, power: 1 } },
      { text: '让我知道宇宙所有问题的答案', scores: { knowledge: 3, recognition: 1 } }
    ]
  },
  {
    text: '你被困在一个时间循环里，每天重复同一天。你会用这无限的时间做什么？',
    tag: '时间分配',
    opts: [
      { text: '研究每个人的弱点，等循环结束后掌控局面', scores: { power: 3, revenge: 1 } },
      { text: '尝试所有方式让那个人对我说「我也喜欢你」', scores: { love: 3 } },
      { text: '研究股市规律，记住每天的涨跌，出去后一夜暴富', scores: { money: 3, knowledge: 1 } },
      { text: '学完人类所有的知识——语言、乐器、科学、哲学', scores: { knowledge: 3 } }
    ]
  },
  {
    text: '你最不能忍受的一种处境是：',
    tag: '底线测试',
    opts: [
      { text: '明明我能力最强，升职的却是关系户', scores: { recognition: 2, revenge: 2, power: 1 } },
      { text: '我全心付出，对方却轻描淡写地说「我们不合适」', scores: { love: 3, revenge: 1 } },
      { text: '同龄人都买房买车了，我还在租房挤地铁', scores: { money: 3, recognition: 1 } },
      { text: '我说的话没人听，我的建议没人采纳', scores: { power: 2, recognition: 3 } }
    ]
  },
  {
    text: '如果你能回到过去改变一件事，你最想改变的是：',
    tag: '遗憾类型',
    opts: [
      { text: '当初不该忍气吞声，应该狠狠反击那个欺负我的人', scores: { revenge: 3, power: 1 } },
      { text: '不该错过那个人，应该勇敢表白', scores: { love: 3 } },
      { text: '应该早点开始理财/创业，现在已经财务自由了', scores: { money: 3 } },
      { text: '应该选一个自己真正热爱的专业，而不是听父母的', scores: { knowledge: 2, recognition: 1, power: 1 } }
    ]
  },
  {
    text: '恶魔给你一本黑色笔记本，写上名字就能让那个人倒霉一周（不会死，就是各种不顺）。你会：',
    tag: '攻击性',
    opts: [
      { text: '写上那个曾经伤害过我的人的名字', scores: { revenge: 3 } },
      { text: '写上挡在我升职路上的人', scores: { power: 3, revenge: 1 } },
      { text: '不写，但会留着以防万一', scores: { money: 1, power: 1, knowledge: 1 } },
      { text: '不写，这种力量本身就让我不安', scores: { love: 1, knowledge: 2 } }
    ]
  },
  {
    text: '你在社交媒体上发了一条内容，获得了 10 万点赞。你最在意的是：',
    tag: '认可来源',
    opts: [
      { text: '终于有人认可我了，这种被看见的感觉太好了', scores: { recognition: 3 } },
      { text: '可以接广告变现了，算算能赚多少', scores: { money: 3 } },
      { text: '那个人会不会刷到？会不会对我刮目相看？', scores: { love: 2, recognition: 2 } },
      { text: '说明我的观点是对的，我的判断力没问题', scores: { knowledge: 2, power: 1, recognition: 1 } }
    ]
  },
  {
    text: '你获得了一项超能力：读心术。但只能对一类人使用。你选：',
    tag: '信息需求',
    opts: [
      { text: '上司和客户——谈判时永远占上风', scores: { power: 3, money: 2 } },
      { text: '伴侣/暗恋对象——想知道 ta 心里到底怎么想的', scores: { love: 3 } },
      { text: '所有评价过我的人——想知道他们真实的看法', scores: { recognition: 3, revenge: 1 } },
      { text: '各领域专家——直接获取他们的知识和经验', scores: { knowledge: 3 } }
    ]
  },
  {
    text: '你被邀请参加一个神秘晚宴，每位客人要用一句话介绍自己。你最想说的是：',
    tag: '自我定义',
    opts: [
      { text: '「我是 XX 公司的创始人 / 我管着 300 人的团队」', scores: { power: 3, recognition: 1 } },
      { text: '「我是某某最爱的人」', scores: { love: 3 } },
      { text: '「我 30 岁就实现了财务自由」', scores: { money: 3, recognition: 1 } },
      { text: '「我可能是这个房间里读书最多的人」', scores: { knowledge: 3, recognition: 1 } }
    ]
  },
  {
    text: '最后一题。恶魔说：「签下契约，你将得到你最想要的东西。代价是——你会忘记自己为什么想要它。」你会签吗？',
    tag: '终极抉择',
    opts: [
      { text: '签。得到就行，理由不重要', scores: { power: 2, money: 2 } },
      { text: '签。如果忘了痛苦的理由，也许反而是解脱', scores: { revenge: 2, love: 2 } },
      { text: '不签。忘了初衷，得到的东西就没有意义了', scores: { knowledge: 2, recognition: 2 } },
      { text: '不签。我宁愿带着渴望活着，也不要空洞的满足', scores: { love: 2, knowledge: 2 } }
    ]
  }
];

// 每个维度的结果描述
var DEAL_RESULTS = {
  power: {
    title: '权力契约',
    subtitle: '你最可能为了「掌控感」与恶魔交易',
    icon: '👑',
    desc: '你内心深处渴望的不是统治别人，而是「不再被别人左右」。你受够了无力感——被规则限制、被上级压制、被命运摆布。恶魔不需要诱惑你，只需要在你最无力的时刻递上一份合同。',
    psychology: '心理学家 David McClelland 的「三需求理论」中，权力需求（Need for Power）分为两种：个人化权力（控制他人）和社会化权力（影响局面）。大多数人追求的其实是后者——不是当暴君，而是「说话有人听」。',
    source: 'McClelland, D.C. (1975). Power: The Inner Experience. Irvington.'
  },
  love: {
    title: '爱情契约',
    subtitle: '你最可能为了「被爱」与恶魔交易',
    icon: '💘',
    desc: '你可以忍受贫穷、忍受平庸、忍受被忽视，但你忍不了「没有人真正爱我」。恶魔最容易在你孤独的深夜出现，用一个完美的承诺换走你的灵魂。',
    psychology: '依恋理论（Attachment Theory）认为，对爱的渴望根植于婴儿期的依恋模式。Hazan & Shaver（1987）发现，约 20% 的成年人属于焦虑型依恋——他们对被抛弃的恐惧远超常人，愿意为确定性付出极高代价。',
    source: 'Hazan, C. & Shaver, P. (1987). Romantic love conceptualized as an attachment process. JPSP.'
  },
  money: {
    title: '金钱契约',
    subtitle: '你最可能为了「安全感」与恶魔交易',
    icon: '💰',
    desc: '你要的不是奢侈品，而是「不再为钱焦虑」。账单、房贷、父母的医疗费、孩子的学费——这些数字像倒计时一样压着你。恶魔只需要在你看到银行余额的那一刻出现。',
    psychology: 'Maslow 需求层次中，安全需求仅次于生理需求。Kahneman & Deaton（2010）的研究发现，年收入超过 75,000 美元后，幸福感不再随收入增长——但低于这个数字时，每一分钱都直接影响情绪。你追求的不是富有，是「够用」的安全感。',
    source: 'Kahneman, D. & Deaton, A. (2010). High income improves evaluation of life but not emotional well-being. PNAS.'
  },
  revenge: {
    title: '复仇契约',
    subtitle: '你最可能为了「讨回公道」与恶魔交易',
    icon: '🔥',
    desc: '你心里有一根刺，拔不掉。某个人、某件事，让你觉得这个世界欠你一个公道。恶魔不需要给你力量，只需要指着那个人说：「要不要让 ta 也尝尝这种滋味？」',
    psychology: 'Carlsmith 等人（2008）的实验发现，人们预期报复会带来满足感，但实际报复后反而更痛苦——因为报复会让你持续反刍那段经历。进化心理学认为，复仇冲动是一种「威慑信号」：让潜在的伤害者知道你不好惹。但在现代社会，这个机制经常空转。',
    source: 'Carlsmith, K.M. et al. (2008). The paradoxical consequences of revenge. JPSP.'
  },
  recognition: {
    title: '认可契约',
    subtitle: '你最可能为了「被看见」与恶魔交易',
    icon: '⭐',
    desc: '你做了很多事，但好像没人注意到。你不是要名利，你只是想有人说一句：「你做得真好。」恶魔最懂你——它不给你金山银山，只给你一个永远不会忽视你的观众。',
    psychology: 'William James 说过：「人类最深层的需求是被欣赏。」自我决定理论（SDT）将「关系需求」列为三大基本心理需求之一。Leary 的社会计量理论（Sociometer Theory）更进一步：自尊本质上是一个「被接纳程度」的内部监测器。自尊低的时刻，就是你觉得自己不被需要的时刻。',
    source: 'Leary, M.R. & Baumeister, R.F. (2000). The nature and function of self-esteem: Sociometer theory. Advances in Experimental Social Psychology.'
  },
  knowledge: {
    title: '知识契约',
    subtitle: '你最可能为了「理解一切」与恶魔交易',
    icon: '📖',
    desc: '你受不了「不知道」。不知道为什么被拒绝、不知道宇宙的边界在哪、不知道自己这辈子到底在追求什么。恶魔给你的不是答案，而是「再也不会困惑」的承诺。',
    psychology: 'Cacioppo 等人提出的「认知需求」（Need for Cognition）量表发现，高认知需求者在面对不确定性时体验到更强的焦虑，但同时也从解决问题中获得更大的快感。你的恶魔交易本质上是用灵魂换「确定性」——而确定性，是人类最昂贵的奢侈品。',
    source: 'Cacioppo, J.T. & Petty, R.E. (1982). The need for cognition. JPSP.'
  }
};

// 导出（兼容浏览器直接引用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DIMENSIONS: DIMENSIONS, QUESTIONS: QUESTIONS, DEAL_RESULTS: DEAL_RESULTS };
}
