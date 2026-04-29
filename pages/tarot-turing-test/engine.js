const ROLE_TYPES = {
  TEMPLATE: 'template',
  HUMAN: 'human',
  AI: 'ai',
};

const ROLE_LABELS = {
  template: '模板拼接',
  human: '真人塔罗师风格',
  ai: 'AI 生成',
};

const SLOT_LABELS = ['A', 'B', 'C'];

const SPREADS = [
  {
    id: 'career-crossroad',
    title: '三张牌：工作十字路口',
    question: '这份工作还要不要继续耗下去？',
    theme: '先停下来校准，再决定要不要动',
    cards: [
      {
        position: '过去',
        name: '隐者',
        orientation: '正位',
        keywords: ['收缩', '复盘', '独处'],
        meaning: '你前一阵子一直在往里收，很多想法都憋着自己消化。',
        concrete: '像是工作没少做，真正想争取的待遇、边界和方向却一直往后放。',
        shadow: '谨慎拉得太久，会把自己困在观察位。',
        action: '先把你真正不满的三件事写清楚。'
      },
      {
        position: '现在',
        name: '权杖八',
        orientation: '逆位',
        keywords: ['拖延', '堵塞', '卡顿'],
        meaning: '眼下的节奏并不顺，事情堆着，推进感很差。',
        concrete: '你会频繁感到消息很多、动作很多，结果真正落地的没几件。',
        shadow: '外部杂音会让你误以为自己很忙，其实关键问题还在原地。',
        action: '先砍掉一半无效沟通，再看去留。'
      },
      {
        position: '建议',
        name: '宝剑二',
        orientation: '正位',
        keywords: ['停判', '对齐', '两难'],
        meaning: '这组牌没有催你立刻跳，它更像在催你先把标准对齐。',
        concrete: '你真正怕的不是离开，而是换了地方还重复同一套消耗。',
        shadow: '模糊地熬着，会比做决定更伤元气。',
        action: '给下一份工作设三条硬条件，不满足就不动。'
      }
    ]
  },
  {
    id: 'relationship-cooling',
    title: '三张牌：关系降温',
    question: '这段关系还能不能继续投入？',
    theme: '热度下降不等于结束，重点是沟通是否还活着',
    cards: [
      {
        position: '过去',
        name: '恋人',
        orientation: '正位',
        keywords: ['吸引', '投入', '靠近'],
        meaning: '一开始你们之间是真有火花的，投入也很真。',
        concrete: '那种会主动分享、会期待回应、会把对方放进日程里的热乎劲，之前存在过。',
        shadow: '正因为开头很亮，后来的落差会更明显。',
        action: '先承认你在意过，别用嘴硬盖过去。'
      },
      {
        position: '现在',
        name: '圣杯四',
        orientation: '逆位',
        keywords: ['倦怠', '迟钝', '重新感受'],
        meaning: '现在的问题更像情绪钝化，而不是彻底没感情。',
        concrete: '你们可能不是天天吵，反而是越来越省话，很多小失望没有被处理。',
        shadow: '冷下来最怕的不是矛盾，而是默认“算了”。',
        action: '把那件你最介意却一直没说的事摊开。'
      },
      {
        position: '建议',
        name: '审判',
        orientation: '正位',
        keywords: ['回看', '摊牌', '更新'],
        meaning: '牌面要求一次清楚的复盘，关系要么升级，要么定性。',
        concrete: '拖着不谈会消耗彼此想象力，谈清楚反而能把雾散掉。',
        shadow: '含糊维持，会让你在一段关系里越来越像旁观者。',
        action: '约一次不被打断的对话，把“以后怎么办”说到具体。'
      }
    ]
  },
  {
    id: 'money-anxiety',
    title: '三张牌：钱和安全感',
    question: '我最近为什么总被钱这件事压着？',
    theme: '焦虑不全来自余额，也来自失控感',
    cards: [
      {
        position: '过去',
        name: '星币六',
        orientation: '逆位',
        keywords: ['失衡', '比较', '给出过多'],
        meaning: '你之前在资源分配上有点失衡，容易对外太大方，对自己太模糊。',
        concrete: '可能是花钱补情绪，也可能是习惯性替别人兜一点。',
        shadow: '当“应该花”太多，心里的余量会越来越窄。',
        action: '把固定支出和情绪支出分开记一次。'
      },
      {
        position: '现在',
        name: '恶魔',
        orientation: '正位',
        keywords: ['绑定', '上瘾', '放大恐惧'],
        meaning: '现在真正困住你的，是对失去掌控的放大想象。',
        concrete: '你会反复算、反复看，越看越紧，明明没到崩盘却像快出事。',
        shadow: '焦虑会伪装成认真，时间一长很消耗。',
        action: '给自己设一个看账本的固定时段，别全天候盯着。'
      },
      {
        position: '建议',
        name: '节制',
        orientation: '正位',
        keywords: ['回流', '调配', '稳住'],
        meaning: '这组牌最后落在“调配”，说明局面可修，不是死结。',
        concrete: '你需要的不是一次性狠省，而是让现金流重新有秩序。',
        shadow: '靠意志力硬扛，通常撑不了太久。',
        action: '先做一个能持续四周的小预算表。'
      }
    ]
  },
  {
    id: 'creative-block',
    title: '三张牌：创作停滞',
    question: '为什么最近总觉得自己写不出来？',
    theme: '灵感不是消失了，它被压力和比较压住了',
    cards: [
      {
        position: '过去',
        name: '魔术师',
        orientation: '逆位',
        keywords: ['分散', '过度输出', '手感下滑'],
        meaning: '前期你有过一段高频输出，但手感被拉薄了。',
        concrete: '点子不是没有，只是每个点子都被你过早拿去和结果比较。',
        shadow: '当创作一开始就背着KPI，身体会先抗拒。',
        action: '先允许一个只写给自己看的版本出现。'
      },
      {
        position: '现在',
        name: '月亮',
        orientation: '正位',
        keywords: ['混沌', '敏感', '没把握'],
        meaning: '现在的核心感受是雾。你知道有东西在里面，但抓不稳。',
        concrete: '你可能会删改很多次，甚至还没写完就先否定。',
        shadow: '越想一次写对，越容易卡在开头。',
        action: '把“写得完整”换成“先写出十句”。'
      },
      {
        position: '建议',
        name: '权杖侍从',
        orientation: '正位',
        keywords: ['试探', '玩心', '重新点火'],
        meaning: '建议牌很轻，它要你用小火重新点，不要一上来烧整片林子。',
        concrete: '你更适合先做一个短的、快的、允许不成熟的作品。',
        shadow: '把起步门槛设太高，会继续让自己站在门外。',
        action: '给自己一个30分钟限时草稿。'
      }
    ]
  },
  {
    id: 'friendship-distance',
    title: '三张牌：友情疏远',
    question: '这段友情变淡了，还有没有必要追回来？',
    theme: '关系的重量要看双方是否还愿意靠近',
    cards: [
      {
        position: '过去',
        name: '圣杯三',
        orientation: '正位',
        keywords: ['轻松', '同行', '共享'],
        meaning: '你们曾经是真的聊得来，节奏也对得上。',
        concrete: '那种不需要铺垫就能接上话的默契，之前是有的。',
        shadow: '正因为曾经自然，现在的生疏才更刺眼。',
        action: '先分清你怀念的是人，还是那段状态。'
      },
      {
        position: '现在',
        name: '星币四',
        orientation: '逆位',
        keywords: ['保留', '松动', '舍不得'],
        meaning: '现在双方至少有一边在收着，不太愿意先伸手。',
        concrete: '你可能会反复点开聊天框，最后还是关掉。',
        shadow: '关系会被想太多拖死。',
        action: '发一个轻量的问候，别一上来就谈沉重问题。'
      },
      {
        position: '建议',
        name: '力量',
        orientation: '正位',
        keywords: ['温柔', '分寸', '长期'],
        meaning: '这张牌提醒你，追回关系靠的不是用力，而是分寸感。',
        concrete: '有些友情回不去原样，但可以长成新的形态。',
        shadow: '太急着恢复旧亲密，会让双方都别扭。',
        action: '只做一次真诚但不逼迫的靠近。'
      }
    ]
  },
  {
    id: 'future-fog',
    title: '三张牌：未来发虚',
    question: '我为什么总觉得下一步很虚？',
    theme: '未来感发虚，常常是标准太多、行动太少',
    cards: [
      {
        position: '过去',
        name: '命运之轮',
        orientation: '逆位',
        keywords: ['反复', '失速', '节奏被打断'],
        meaning: '过去一段时间你经历过几次节奏被打断，所以信心被磨掉了些。',
        concrete: '计划不是没做，只是总被现实插队，久了会怀疑自己判断。',
        shadow: '反复起步的人，最容易对未来失去踏实感。',
        action: '先接受“之前断过档”这件事。'
      },
      {
        position: '现在',
        name: '星星',
        orientation: '逆位',
        keywords: ['光弱了', '期望不稳', '需要修复'],
        meaning: '你现在不是没有愿望，而是很难相信愿望能落地。',
        concrete: '会想很多年后的样子，却很难把今天排出一个小步骤。',
        shadow: '理想一旦离身体太远，就只剩空心感。',
        action: '把一年目标缩成未来七天的一件事。'
      },
      {
        position: '建议',
        name: '战车',
        orientation: '正位',
        keywords: ['定向', '推进', '收束'],
        meaning: '最后这张牌很明确，你需要的是一个收束后的方向感。',
        concrete: '先跑一条线，远比同时顾三条线更能恢复信心。',
        shadow: '一直保持开放，会让你一直处在起跑姿势。',
        action: '选一件你下周就能完成的推进动作。'
      }
    ]
  }
];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function shuffleWithRng(items, rng) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function sampleOne(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function joinKeywords(card) {
  return card.keywords.join(' / ');
}

function renderTemplateReading(spread) {
  const lines = [
    `本次牌阵主题：${spread.theme}。`,
    `你的问题是「${spread.question}」。`
  ];

  spread.cards.forEach(function (card) {
    lines.push(
      card.position + '位：' + card.name + card.orientation +
      '，关键词为 ' + joinKeywords(card) + '。' +
      card.meaning + card.action
    );
  });

  lines.push('综合结论：当前重点在于先整理标准，再决定往哪个方向投入。');
  return lines;
}

function renderHumanReading(spread, rng) {
  const openers = [
    '我先看整体，这组三张牌的气口其实很一致。',
    '先说结论，这组牌没有你想得那么玄，重点挺落地的。',
    '这组三张牌放在一起看，像是在讲一段很具体的生活状态。'
  ];

  const closers = [
    '你现在最需要的不是更大的答案，是一个能马上执行的小动作。',
    '这组牌给我的感觉是，先把脚下站稳，后面的路自然会清楚一点。',
    '你不用急着把整个人生想明白，先把眼前这一小步走扎实。'
  ];

  const lines = [sampleOne(openers, rng), '你问的是「' + spread.question + '」。'];

  spread.cards.forEach(function (card) {
    lines.push(
      card.position + '这张 ' + card.name + card.orientation + '，我会读成：' +
      card.concrete + card.shadow
    );
  });

  lines.push('如果顺着这组三张牌往下做，最合适的一步是：' + spread.cards[2].action);
  lines.push(sampleOne(closers, rng));
  return lines;
}

function renderAiReading(spread, rng) {
  const openers = [
    '这组三张牌像一条从内缩、停滞，再走向重新定向的路径。',
    '如果把这副牌当成一段情绪地图，它呈现的是先压住自己，再慢慢找回主导权的过程。',
    '牌阵的能量很完整，像是在提醒你：眼下的迷雾有结构，不是无缘无故地乱。'
  ];

  const connectors = [
    '它们串起来以后，会形成一种很清楚的叙事弧线。',
    '放在同一条时间线上看，前后呼应很强。',
    '三张牌之间的关系，比单张牌义更值得看。'
  ];

  const lines = [
    sampleOne(openers, rng),
    '你问的是「' + spread.question + '」，而这副牌回应的核心词是「' + spread.theme + '」。',
    sampleOne(connectors, rng)
  ];

  spread.cards.forEach(function (card) {
    lines.push(
      card.position + '位的 ' + card.name + card.orientation +
      ' 指向 ' + joinKeywords(card) + '。' +
      card.meaning + card.shadow
    );
  });

  lines.push(
    '所以这副牌真正想把你带到的地方，是让你从情绪裹挟里退出一点，重新建立可执行的秩序。'
  );
  lines.push('如果只留一个动作，就留这句：' + spread.cards[2].action);
  return lines;
}

function renderReading(role, spread, rng) {
  if (role === ROLE_TYPES.TEMPLATE) return renderTemplateReading(spread);
  if (role === ROLE_TYPES.HUMAN) return renderHumanReading(spread, rng);
  return renderAiReading(spread, rng);
}

function mapSlotsToRoles(roleOrder) {
  return {
    A: roleOrder[0],
    B: roleOrder[1],
    C: roleOrder[2],
  };
}

function createSession(seed) {
  const sessionSeed = seed || (String(Date.now()) + '_' + String(Math.random()).slice(2, 10));
  const rng = mulberry32(seedFromString(sessionSeed));
  const spread = sampleOne(SPREADS, rng);
  const roles = shuffleWithRng([ROLE_TYPES.TEMPLATE, ROLE_TYPES.HUMAN, ROLE_TYPES.AI], rng);
  const slotRoleMap = mapSlotsToRoles(roles);

  const slots = SLOT_LABELS.map(function (slot) {
    const role = slotRoleMap[slot];
    return {
      slot: slot,
      role: role,
      title: '塔罗师 ' + slot,
      reading: renderReading(role, spread, rng)
    };
  });

  return {
    seed: sessionSeed,
    spread: spread,
    slots: slots,
    slotRoleMap: slotRoleMap
  };
}

function getOrCreateSessionSeed() {
  let seed = null;
  try {
    seed = localStorage.getItem('tarot_turing_session_seed');
  } catch (e) {}
  if (seed) return seed;

  seed = String(Date.now()) + '_' + String(Math.random()).slice(2, 10);
  try {
    localStorage.setItem('tarot_turing_session_seed', seed);
  } catch (e) {}
  return seed;
}

function resetSessionSeed() {
  try {
    localStorage.removeItem('tarot_turing_session_seed');
  } catch (e) {}
}

function findRoleBySlot(session, slot) {
  return session && session.slotRoleMap ? session.slotRoleMap[slot] : null;
}

function evaluateSelections(session, bestSlot, guessedAiSlot) {
  const bestRole = findRoleBySlot(session, bestSlot);
  const guessedAiRole = findRoleBySlot(session, guessedAiSlot);

  return {
    bestSlot: bestSlot,
    guessedAiSlot: guessedAiSlot,
    bestRole: bestRole,
    guessedAiRole: guessedAiRole,
    actualAiSlot: getSlotByRole(session, ROLE_TYPES.AI),
    guessedAiCorrect: guessedAiRole === ROLE_TYPES.AI,
    bestWasAi: bestRole === ROLE_TYPES.AI,
    bestWasHuman: bestRole === ROLE_TYPES.HUMAN,
    bestWasTemplate: bestRole === ROLE_TYPES.TEMPLATE
  };
}

function getSlotByRole(session, role) {
  for (let i = 0; i < SLOT_LABELS.length; i++) {
    const slot = SLOT_LABELS[i];
    if (session.slotRoleMap[slot] === role) return slot;
  }
  return null;
}

function toRateMap(countMap, total) {
  return {
    template: total ? Math.round((countMap.template || 0) * 1000 / total) / 10 : 0,
    human: total ? Math.round((countMap.human || 0) * 1000 / total) / 10 : 0,
    ai: total ? Math.round((countMap.ai || 0) * 1000 / total) / 10 : 0,
  };
}

function getWinningRole(countMap) {
  let winner = ROLE_TYPES.TEMPLATE;
  let best = -1;
  ['template', 'human', 'ai'].forEach(function (role) {
    const value = countMap[role] || 0;
    if (value > best) {
      best = value;
      winner = role;
    }
  });
  return winner;
}

function normalizeStats(data) {
  const total = data && data.totalSessions ? data.totalSessions : 0;
  const bestCounts = Object.assign({ template: 0, human: 0, ai: 0 }, data && data.bestRoleCounts);
  const guessCounts = Object.assign({ template: 0, human: 0, ai: 0 }, data && data.guessedAiRoleCounts);

  return {
    totalSessions: total,
    guessAiAccuracyPct: data && typeof data.guessAiAccuracyPct === 'number' ? data.guessAiAccuracyPct : 0,
    bestRoleCounts: bestCounts,
    guessedAiRoleCounts: guessCounts,
    bestRoleRates: toRateMap(bestCounts, total),
    guessedAiRoleRates: toRateMap(guessCounts, total),
    mostTrustedRole: getWinningRole(bestCounts),
    mostSuspectedAsAiRole: getWinningRole(guessCounts)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ROLE_TYPES,
    ROLE_LABELS,
    SLOT_LABELS,
    SPREADS,
    mulberry32,
    seedFromString,
    shuffleWithRng,
    createSession,
    renderReading,
    evaluateSelections,
    findRoleBySlot,
    getSlotByRole,
    normalizeStats,
    toRateMap,
    getWinningRole
  };
}
