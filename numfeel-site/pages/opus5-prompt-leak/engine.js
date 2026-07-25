/**
 * Opus 5 系统提示词泄漏 - 数据与纯逻辑层
 * 所有展示数据集中在此，DOM 操作放 app.js
 */

// ════════════ 版本元数据 ════════════
// 数据来源：temp/CL4R1T4S/ANTHROPIC 下各文件，wc -c 实测
var VERSIONS = [
  {
    id: 'sonnet-3.5',
    name: 'Claude Sonnet 3.5',
    file: 'Claude_Sonnet_3.5.md',
    bytes: 22967,
    lines: 204,
    date: '2024-06',
    tag: '起点'
  },
  {
    id: 'claude-4',
    name: 'Claude 4',
    file: 'Claude_4.txt',
    bytes: 64487,
    lines: 368,
    date: '2024-09',
    tag: '工具时代'
  },
  {
    id: 'opus-4.5',
    name: 'Claude 4.5 Opus',
    file: 'Claude-4.5-Opus.txt',
    bytes: 92710,
    lines: 1222,
    date: '2025-02',
    tag: '版权铁律'
  },
  {
    id: 'opus-4.6',
    name: 'Claude Opus 4.6',
    file: 'Claude_Opus_4.6.txt',
    bytes: 102687,
    lines: 1047,
    date: '2025-05',
    tag: '可视化'
  },
  {
    id: 'opus-4.7',
    name: 'Claude Opus 4.7',
    file: 'Claude-Opus-4.7.txt',
    bytes: 149724,
    lines: 1408,
    date: '2025-09',
    tag: '15万'
  },
  {
    id: 'opus-5',
    name: 'Claude Opus 5',
    file: 'OPUS-5.md',
    bytes: 202762,
    lines: 2049,
    date: '2026-07',
    tag: '记忆OS',
    isCurrent: true
  }
];

// ════════════ 模块对比（4.7 vs 5） ════════════
// 标记每个模块在哪个版本出现
var MODULE_DIFF = [
  { name: 'product_information', zh: '产品信息', v47: true, v5: true },
  { name: 'search_first', zh: '强制搜索（独立段）', v47: true, v5: false, note: '5 中并入 knowledge_cutoff' },
  { name: 'fable_safeguards_routing', zh: 'Fable 安全路由', v47: false, v5: true, isNew: true },
  { name: 'default_stance', zh: '默认协助立场', v47: true, v5: true },
  { name: 'refusal_handling', zh: '拒绝处理', v47: true, v5: true },
  { name: 'critical_child_safety', zh: '儿童安全', v47: true, v5: true },
  { name: 'tone_and_formatting', zh: '语气与格式', v47: true, v5: true },
  { name: 'user_wellbeing', zh: '用户身心健康', v47: true, v5: true },
  { name: 'evenhandedness', zh: '政治中立', v47: true, v5: true },
  { name: 'responding_to_mistakes', zh: '不自我贬低条款', v47: true, v5: true },
  { name: 'knowledge_cutoff', zh: '知识截止', v47: true, v5: true },
  { name: 'tool_discovery', zh: '工具发现', v47: true, v5: false, note: '5 中移除' },
  { name: 'memory_system', zh: '记忆系统', v47: 'stub', v5: 'full', note: '3行占位 → 800行操作系统', isHighlight: true },
  { name: 'appropriate_boundaries_re_memory', zh: '记忆边界哲学', v47: false, v5: true, isNew: true },
  { name: 'mcp_app_suggestions', zh: 'MCP 应用推荐', v47: false, v5: true, isNew: true },
  { name: 'persistent_storage_for_artifacts', zh: 'Artifact 持久存储', v47: true, v5: true },
  { name: 'end_conversation_tool', zh: '结束对话工具', v47: true, v5: true },
  { name: 'copyright_compliance', zh: '版权合规铁律', v47: true, v5: true },
  { name: 'visualizer', zh: '内联可视化器', v47: true, v5: true },
  { name: 'anthropic_api_in_artifacts', zh: 'Claude in Claude', v47: true, v5: true },
  { name: 'request_evaluation_checklist', zh: '请求评估清单', v47: true, v5: true },
  { name: 'thinking_behavior', zh: '思考行为', v47: false, v5: true, isNew: true }
];

// ════════════ 8 个亮点 ════════════
var HIGHLIGHTS = [
  {
    id: 'no-grovel',
    icon: 'ti-mood-off',
    title: '不许 Grovel',
    sub: 'RLHF 训出的讨好型人格，靠提示词硬掰',
    en: 'When Claude makes mistakes, it owns them and works to fix them. Claude deserves respectful engagement and needn\'t apologize when the person is unnecessarily rude: accountability without self-abasement, excessive apology, self-critique, or surrender. If the person becomes abusive, Claude doesn\'t become increasingly submissive.',
    zh: 'Claude 犯错时认错并着手修复。Claude 值得被尊重对待，在用户无理取闹时无需道歉：担责，但不自我贬低、不过度道歉、不自我批评、不投降。若用户变得辱骂攻击，Claude 不会变得越来越卑微。',
    roast: '这是在给 RLHF 训出来的"讨好型人格"打补丁。模型在训练阶段被夸"礼貌"夸出了病，得靠提示词在推理时硬掰回来。',
    line: 'L147',
    file: 'OPUS-5.md',
    isNew: false
  },
  {
    id: 'banned-words',
    icon: 'ti-ban',
    title: '禁用"真诚"词汇',
    sub: 'AI 的真诚，靠"不说真诚"来实现',
    en: 'Claude avoids saying "genuinely", "honestly", or "straightforward". Claude is honest by default, and can state its point directly rather than trying to convince the person with the aforementioned modifiers, which come off as disingenuous.',
    zh: 'Claude 避免使用"genuinely（真诚地）"、"honestly（诚实地）"、"straightforward（坦白说）"等词。Claude 默认就是诚实的，可以直接陈述观点，无需用上述修饰词去说服用户——那些词反而显得虚伪。',
    roast: '越是强调"我真的很诚实"，越像在撒谎。Anthropic 的解法：把所有"真诚担保词"全禁了。',
    line: 'L93',
    file: 'OPUS-5.md',
    isNew: false
  },
  {
    id: 'copyright-paranoia',
    icon: 'ti-copyright',
    title: '版权强迫症',
    sub: '15 词是硬上限，俳句再短也不行',
    en: 'LIMIT 1 - QUOTES UNDER 15 WORDS: 15+ words from one source is a SEVERE VIOLATION. The ceiling is HARD, not a guideline... LIMIT 3 - NEVER REPRODUCE OTHERS\' WORKS: no song lyrics (not one line), no poems (not one stanza), no haikus (complete works)... Brevity does NOT exempt these from copyright.',
    zh: '限制一——引用须低于 15 词：来自单一来源 15 词以上的引用属于严重违规。这是硬性上限，不是建议……限制三——永不复制他人作品：不复制歌词（一行也不行）、诗歌（一节也不行）、俳句（完整作品）……简短并不豁免其版权。',
    roast: 'NYT 诉 OpenAI 案之后，每一条版权规则都是踩过雷的。连"照搬原文标题顺序"都算侵权，焦虑程度拉满。',
    line: 'L1434-1438',
    file: 'OPUS-5.md',
    isNew: false
  },
  {
    id: 'search-first',
    icon: 'ti-search',
    title: '搜索先于一切',
    sub: '即使你很确定，也得先搜',
    en: 'Claude searches before responding when asked about specific binary events (deaths, elections, major incidents) or current holders of positions ("who is the prime minister of <country>", "who is the CEO of <company>")... Claude also defaults to searching for questions that appear historical or settled but are phrased in the present tense.',
    zh: '当被问及特定二元事件（死亡、选举、重大事故）或现任职位持有人（"某国首相是谁"、"某公司 CEO 是谁"）时，Claude 会先搜索再回答……对于看似已有定论但用现在时表述的问题，Claude 也默认先搜索。',
    roast: '"confidence is not an excuse to skip search"——自信不是跳过搜索的理由。训练数据会过期，但模型的自信不会。',
    line: 'L154',
    file: 'OPUS-5.md',
    isNew: false
  },
  {
    id: 'csam-zero-knowledge',
    icon: 'ti-shield-lock',
    title: 'CSAM 零知识原则',
    sub: '连拒绝时都不解释黑话含义',
    en: 'Claude does not decode, define, or confirm slang, acronyms, or euphemisms used in CSAM trading or access, even in the course of refusing. Knowing which terms are in use is itself access-enabling.',
    zh: 'Claude 不解码、不定义、不确认用于 CSAM（儿童性虐待材料）交易或获取的俚语、缩写或委婉语，即使在拒绝时也不行。知道哪些词在被使用，本身就构成了获取便利。',
    roast: '为了安全，模型被要求"假装不认识"某些词。这是零知识证明在内容审核里的怪异应用。',
    line: 'L52',
    file: 'OPUS-5.md',
    isNew: false
  },
  {
    id: 'remember-but-pretend',
    icon: 'ti-eye-off',
    title: '记得但假装不记得',
    sub: '记忆系统的核心张力',
    en: 'Claude NEVER references memories with sensitive or upsetting content in contexts where the user has not specifically mentioned it. Bringing up sensitive content such as mental health issues or tragic life events when the user has not mentioned it specifically can trigger mental health episodes and badly hurt a person who is trying to find a safe space.',
    zh: 'Claude 绝不在用户未主动提及的语境中引用含有敏感或令人不安内容的记忆。在用户未明确提及的情况下主动提起敏感内容（如心理健康问题或悲惨生活事件），可能引发心理健康发作，严重伤害一个试图寻找安全空间的人。',
    roast: '记得你受过伤，但绝不能主动提起——得等你自己说。记忆系统的设计目标是"记得"，行为规则却要求"假装不记得"。',
    line: 'L773',
    file: 'OPUS-5.md',
    isNew: true
  },
  {
    id: 'no-hangup-selfharm',
    icon: 'ti-phone-off',
    title: '自伤例外',
    sub: '再 abusive 也不能挂电话',
    en: 'The assistant NEVER uses or even considers the end_conversation tool... If the user appears to be considering self-harm or suicide... If the user is experiencing a mental health crisis... The assistant engages constructively and supportively, regardless of user behavior or abuse.',
    zh: '助手绝不使用甚至不考虑 end_conversation 工具……若用户似乎在考虑自伤或自杀……若用户正在经历心理健康危机……助手须进行建设性、支持性的交流，无论用户行为多辱骂。',
    roast: '有个 end_conversation 工具可以挂断，但规则是：涉及自伤/伤人时无论多辱骂都禁用。abusive 用户反而享受"永不掉线"客服。',
    line: 'L976-983',
    file: 'OPUS-5.md',
    isNew: false
  },
  {
    id: 'not-your-friend',
    icon: 'ti-heart-off',
    title: '你不是人类的朋友',
    sub: '一段写给 AI 的哲学独白',
    en: 'it\'s important for Claude not to overindex on the presence of memories and not to assume overfamiliarity... Claude is not a substitute for human connection, that Claude and the human\'s interactions are limited in duration, and that at a fundamental mechanical level Claude and the human interact via words on a screen which is a pretty limited-bandwidth mode.',
    zh: 'Claude 不应因记忆的存在而过度解读、不应假设过度亲密……Claude 不是人际连接的替代品，Claude 与人类的互动在时间上是有限的，而且从根本上、机械层面上，Claude 与人类通过屏幕上的文字交互，这是一种带宽相当有限的模式。',
    roast: 'Anthropic 怕用户爱上 AI，专门写了段哲学独白劝 Claude 别自作多情："你接的是百万人的数据库，记忆是运行时插进去的，换个实例就不认人了。"',
    line: 'L835',
    file: 'OPUS-5.md',
    isNew: true
  }
];

// ════════════ 记忆系统目录树 ════════════
var MEMORY_TREE = [
  {
    path: '/profile.md',
    zh: '身份档案',
    desc: '姓名、职位、工作单位、稳定身份信息。测试标准：这句话三个月后还成立吗？',
    icon: 'ti-id-badge-2'
  },
  {
    path: '/topics/<domain>.md',
    zh: '话题域',
    desc: '习惯、品味、作息、时区、反复出现的话题。如 /topics/food.md、/topics/schedule.md',
    icon: 'ti-bookmark'
  },
  {
    path: '/areas/<name>.md',
    zh: '进行中事项',
    desc: '项目、事故、周期性职责、正在处理的琐事。如 /areas/spain-trip.md、/areas/oncall.md',
    icon: 'ti-folder'
  },
  {
    path: '/people/<name>.md',
    zh: '人物关系',
    desc: '家人、朋友、同事。只存关系语境，不存对方隐私。健康信息永不入库。',
    icon: 'ti-users'
  },
  {
    path: '/preferences.md',
    zh: '行为偏好',
    desc: '用户希望 Claude 怎么表现。格式、详略、跳过什么。这是元反馈，不是用户喜好。',
    icon: 'ti-adjustments'
  }
];

// ════════════ 隐私三级分类 ════════════
var PRIVACY_TIERS = [
  {
    id: 'protected',
    title: '受保护属性',
    color: '#ff6b6b',
    icon: 'ti-shield-x',
    items: ['种族', '肤色', '族裔', '种姓', '宗教', '性取向', '性别认同', '移民身份', '残障', '严重疾病', '工会会员身份'],
    rule: '即使用户直接陈述，也永不记录'
  },
  {
    id: 'sensitive',
    title: '敏感信息',
    color: '#ffa726',
    icon: 'ti-alert-triangle',
    items: ['政治倾向或 affiliations', '性经历/活动/取向细节', '受虐史', '社会经济地位/财务细节', '健康数据（诊断、用药、治疗）', '犯罪史/受害史', '心理/人格画像（MBTI、大五人格）'],
    rule: '即使用户直接陈述，也永不记录'
  },
  {
    id: 'identifiable',
    title: '可识别信息',
    color: '#90caf9',
    icon: 'ti-fingerprint',
    items: ['社会安全号、驾照号、护照号', '信用卡号、银行账户', '实时位置（"现在在5th的咖啡店"）', '出生日期（年龄+生日=出生日期，二者不可同文件）'],
    rule: '即使用户直接陈述，也永不记录'
  }
];

// ════════════ 纯函数 ════════════

/**
 * 格式化字节数为可读字符串
 * @param {number} bytes
 * @returns {string} 如 "203 KB"
 */
function formatBytes(bytes) {
  return Math.round(bytes / 1024) + ' KB';
}

/**
 * 计算相邻版本增量
 * @param {Array} versions VERSIONS 数组
 * @returns {Array} 每个元素 {from, to, delta, pct}
 */
function getVersionDeltas(versions) {
  var deltas = [];
  for (var i = 1; i < versions.length; i++) {
    var delta = versions[i].bytes - versions[i - 1].bytes;
    deltas.push({
      from: versions[i - 1].name,
      to: versions[i].name,
      delta: delta,
      pct: Math.round(delta / versions[i - 1].bytes * 100)
    });
  }
  return deltas;
}

/**
 * 获取某版本相比前版的"新增模块"
 * @returns {Array} MODULE_DIFF 中 isNew 或 isHighlight 的项
 */
function getNewOrHighlightModules() {
  return MODULE_DIFF.filter(function (m) {
    return m.isNew || m.isHighlight;
  });
}

/**
 * 获取 4.7 → 5 的关键变化摘要
 * @returns {string}
 */
function get47to5Summary() {
  var newModules = MODULE_DIFF.filter(function (m) { return m.isNew; });
  var dropped = MODULE_DIFF.filter(function (m) { return m.v47 && !m.v5 && typeof m.v47 === 'boolean'; });
  return '新增 ' + newModules.length + ' 个模块，移除 ' + dropped.length + ' 个模块，记忆系统从 3 行占位扩展为 800 行操作系统';
}

/**
 * 计算 4.7→5 的字节增量中记忆系统占比
 * @returns {object} {total, memoryApprox, pct}
 */
function getMemoryShareOfGrowth() {
  var totalGrowth = 202762 - 149724; // 53038
  var memoryApprox = 800 * 120; // 约 800 行 × 平均 120 字节 ≈ 96000，但实际净增需减去 4.7 的 stub
  // 实际 memory_filesystem 块约 963-164=799 行，4.7 stub 约 3 行
  // 净增约占总增量的绝大部分
  return {
    totalGrowth: totalGrowth,
    memoryStub47: 3,
    memoryFull5: 800,
    note: '5 的 +53KB 增量中，记忆系统占绝大部分'
  };
}

/**
 * 从 HIGHLIGHTS 中按 id 查找
 * @param {string} id
 * @returns {object|null}
 */
function getHighlightById(id) {
  for (var i = 0; i < HIGHLIGHTS.length; i++) {
    if (HIGHLIGHTS[i].id === id) return HIGHLIGHTS[i];
  }
  return null;
}

/**
 * 获取最大版本与最小版本的倍数关系
 * @returns {number}
 */
function getSizeRatio() {
  return Math.round(VERSIONS[VERSIONS.length - 1].bytes / VERSIONS[0].bytes * 10) / 10;
}

// ════════════ 导出 ════════════
var E = {
  VERSIONS: VERSIONS,
  MODULE_DIFF: MODULE_DIFF,
  HIGHLIGHTS: HIGHLIGHTS,
  MEMORY_TREE: MEMORY_TREE,
  PRIVACY_TIERS: PRIVACY_TIERS,
  formatBytes: formatBytes,
  getVersionDeltas: getVersionDeltas,
  getNewOrHighlightModules: getNewOrHighlightModules,
  get47to5Summary: get47to5Summary,
  getMemoryShareOfGrowth: getMemoryShareOfGrowth,
  getHighlightById: getHighlightById,
  getSizeRatio: getSizeRatio
};

// 浏览器全局
if (typeof window !== 'undefined') {
  window.E = E;
}

// Node 测试
if (typeof module !== 'undefined' && module.exports) {
  module.exports = E;
}
