/**
 * 宇宙收割者假说 — 核心模拟引擎 v2
 * 
 * v2 改动：
 * - 新增随机事件系统（每回合有概率触发抉择事件）
 * - 扫描倒计时机制（实时制辅助）
 * - 事件有正面/负面/抉择三种类型
 */

'use strict';

// ── 策略常量 ──
const STRATEGIES = {
  aggressive: { id: 'aggressive', name: '激进扩张', techGain: 12, signalGain: 18, stealthGain: 2 },
  balanced:   { id: 'balanced',   name: '均衡发展', techGain: 8,  signalGain: 8,  stealthGain: 8 },
  stealth:    { id: 'stealth',    name: '隐蔽优先', techGain: 4,  signalGain: 3,  stealthGain: 15 },
  dormant:    { id: 'dormant',    name: '休眠蛰伏', techGain: 2,  signalGain: 1,  stealthGain: 5 },
};

// ── 随机事件库 ──
const EVENTS = [
  {
    id: 'asteroid_mine',
    title: '发现富矿小行星',
    desc: '探测器发现一颗含稀有金属的小行星，开采将大幅推进科技，但采矿活动会产生强烈电磁信号。',
    choices: [
      { label: '全力开采', effects: { tech: 25, signal: 30, stealth: 0 } },
      { label: '隐蔽开采', effects: { tech: 10, signal: 8, stealth: -5 } },
      { label: '放弃', effects: { tech: 0, signal: 0, stealth: 0 } },
    ],
  },
  {
    id: 'alien_signal',
    title: '截获不明信号',
    desc: '深空天线捕获到一段结构化信号。回复可能获得科技跳跃，也可能暴露你的坐标。',
    choices: [
      { label: '回复信号', effects: { tech: 35, signal: 40, stealth: -10 } },
      { label: '被动监听', effects: { tech: 8, signal: 2, stealth: 5 } },
      { label: '切断天线', effects: { tech: -5, signal: -15, stealth: 10 } },
    ],
  },
  {
    id: 'civil_unrest',
    title: '内部动荡',
    desc: '民众对「隐蔽发展」政策不满，要求开放通信和星际广播。镇压需要消耗资源，妥协会增加信号。',
    choices: [
      { label: '铁腕镇压', effects: { tech: -8, signal: -5, stealth: 8 } },
      { label: '有限开放', effects: { tech: 5, signal: 15, stealth: -5 } },
      { label: '全面开放', effects: { tech: 10, signal: 35, stealth: -15 } },
    ],
  },
  {
    id: 'tech_breakthrough',
    title: '意外的技术突破',
    desc: '实验室偶然发现了一种新型能源转换方式，但实验过程产生了短暂的高能脉冲。',
    choices: [
      { label: '立即量产', effects: { tech: 20, signal: 22, stealth: 0 } },
      { label: '秘密研发', effects: { tech: 12, signal: 5, stealth: 3 } },
    ],
  },
  {
    id: 'debris_field',
    title: '太空垃圾危机',
    desc: '一片高速碎片云正在逼近。清除它需要高能激光（产生信号），或者花时间绕行（损失回合）。',
    choices: [
      { label: '激光清除', effects: { tech: 3, signal: 20, stealth: -5 } },
      { label: '绕行规避', effects: { tech: -3, signal: -2, stealth: 5 } },
    ],
  },
  {
    id: 'stealth_tech',
    title: '隐身材料发现',
    desc: '地质勘探发现了一种能吸收电磁波的天然矿物，可以大幅提升隐蔽能力。',
    choices: [
      { label: '大规模开采', effects: { tech: 5, signal: 12, stealth: 30 } },
      { label: '小规模利用', effects: { tech: 2, signal: 3, stealth: 15 } },
    ],
  },
  {
    id: 'solar_flare',
    title: '恒星耀斑',
    desc: '母星恒星爆发强烈耀斑，短时间内掩盖了你的信号，但也损坏了部分设施。',
    choices: [
      { label: '趁机全力发展', effects: { tech: 15, signal: -20, stealth: 0 } },
      { label: '修复设施', effects: { tech: -5, signal: -10, stealth: 5 } },
    ],
  },
  {
    id: 'rogue_broadcast',
    title: '叛逃者广播',
    desc: '一名科学家劫持了通信卫星，向宇宙发送了一段广播。信号已经发出，你只能选择如何善后。',
    choices: [
      { label: '紧急信号干扰', effects: { tech: -3, signal: 8, stealth: 10 } },
      { label: '无法挽回', effects: { tech: 0, signal: 25, stealth: 0 } },
    ],
  },
  {
    id: 'dyson_project',
    title: '戴森球计划',
    desc: '工程师提出建造戴森球的方案。这将彻底解决能源问题，但建造过程的红外辐射极其显眼。',
    choices: [
      { label: '启动建造', effects: { tech: 40, signal: 50, stealth: -20 } },
      { label: '搁置计划', effects: { tech: 0, signal: 0, stealth: 0 } },
    ],
  },
  {
    id: 'quantum_comm',
    title: '量子通信突破',
    desc: '研究团队实现了量子纠缠通信，这种通信方式理论上不产生可截获的电磁信号。',
    choices: [
      { label: '全面替换通信系统', effects: { tech: 15, signal: -25, stealth: 20 } },
      { label: '部分替换', effects: { tech: 8, signal: -10, stealth: 10 } },
    ],
  },
  {
    id: 'reaper_fragment',
    title: '发现收割者残骸',
    desc: '深空探测器发现了一具疑似收割者探测器的残骸。研究它可能揭示检测机制，但靠近它有风险。',
    choices: [
      { label: '派遣研究队', effects: { tech: 30, signal: 15, stealth: 15 } },
      { label: '远程观测', effects: { tech: 10, signal: 3, stealth: 5 } },
      { label: '远离它', effects: { tech: 0, signal: 0, stealth: 0 } },
    ],
  },
  {
    id: 'wormhole',
    title: '虫洞异常',
    desc: '天文台探测到一个不稳定的微型虫洞。穿越它可能直接获得逃逸级科技，但失败概率很高。',
    choices: [
      { label: '派探测器穿越', effects: { tech: 50, signal: 35, stealth: -10 }, successRate: 0.3 },
      { label: '远程研究', effects: { tech: 12, signal: 5, stealth: 0 } },
      { label: '不冒险', effects: { tech: 0, signal: 0, stealth: 0 } },
    ],
  },
];

const DEFAULT_CONFIG = {
  threshold: 100,        // 收割者检测阈值
  escapeTech: 200,       // 逃逸所需科技等级
  maxTurns: 30,          // 最大回合数（缩短，节奏更快）
  noiseRange: 3,         // 随机噪声范围（降低，让策略更可控）
  decayRate: 0.02,       // 信号自然衰减率
  reaperScanInterval: 4, // 收割者扫描间隔（回合）
  eventChance: 0.4,      // 每回合触发事件的概率
  scanDuration: 5,       // 扫描倒计时秒数（UI用）
};

/**
 * 创建一个新文明
 */
function createCivilization(config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return {
    tech: 10,
    signal: 5,
    stealth: 5,
    turn: 0,
    alive: true,
    escaped: false,
    history: [{
      turn: 0,
      tech: 10,
      signal: 5,
      stealth: 5,
      exposure: 0,
      strategy: null,
      scanned: false,
      event: null,
    }],
    config: cfg,
    usedEvents: [],
  };
}

/**
 * 计算暴露度
 */
function getExposure(civ) {
  return Math.max(0, civ.signal - civ.stealth);
}

/**
 * 随机选取一个未使用过的事件
 */
function pickEvent(civ, rng) {
  const available = EVENTS.filter(e => !civ.usedEvents.includes(e.id));
  if (available.length === 0) return null;
  const idx = Math.floor(rng() * available.length);
  return available[idx];
}

/**
 * 应用事件选择的效果
 */
function applyEventChoice(civ, choice, rng) {
  let effects = choice.effects;

  // 如果有成功率，判定是否成功
  if (choice.successRate !== undefined) {
    const roll = rng();
    if (roll > choice.successRate) {
      // 失败：效果减半且可能有负面后果
      effects = {
        tech: Math.round(effects.tech * -0.2),
        signal: Math.round(effects.signal * 0.8),
        stealth: Math.round(effects.stealth * 0.5),
      };
      return { effects, success: false };
    }
    return { effects, success: true };
  }

  return { effects, success: true };
}

/**
 * 执行一个回合
 */
function advanceTurn(civ, strategyId, rng, eventChoiceIdx) {
  if (!civ.alive || civ.escaped) return civ;

  const strategy = STRATEGIES[strategyId];
  if (!strategy) throw new Error('Invalid strategy: ' + strategyId);

  const cfg = civ.config;
  const noise = () => (rng() - 0.5) * 2 * cfg.noiseRange;

  const newTurn = civ.turn + 1;

  // 基础增长
  let techDelta = strategy.techGain + noise();
  let signalDelta = strategy.signalGain + noise();
  let stealthDelta = strategy.stealthGain + noise();

  // 处理事件效果
  let eventRecord = null;
  if (eventChoiceIdx !== undefined && eventChoiceIdx !== null) {
    const event = pickEvent(civ, rng);
    if (event && event.choices[eventChoiceIdx]) {
      const result = applyEventChoice(civ, event.choices[eventChoiceIdx], rng);
      techDelta += result.effects.tech;
      signalDelta += result.effects.signal;
      stealthDelta += result.effects.stealth;
      eventRecord = { id: event.id, choice: eventChoiceIdx, success: result.success };
    }
  }

  let newTech = civ.tech + techDelta;
  let newSignal = (civ.signal + signalDelta) * (1 - cfg.decayRate);
  let newStealth = civ.stealth + stealthDelta;

  newTech = Math.max(0, newTech);
  newSignal = Math.max(0, newSignal);
  newStealth = Math.max(0, newStealth);

  const exposure = Math.max(0, newSignal - newStealth);

  const scanned = (newTurn % cfg.reaperScanInterval === 0);
  let alive = true;
  let escaped = false;

  let deathCause = null;

  if (scanned && exposure > cfg.threshold) {
    alive = false;
    deathCause = 'reaped';
  }

  if (alive && newTech >= cfg.escapeTech) {
    escaped = true;
  }

  if (newTurn >= cfg.maxTurns && !escaped) {
    alive = false;
    deathCause = deathCause || 'timeout';
  }

  const record = {
    turn: newTurn,
    tech: Math.round(newTech * 10) / 10,
    signal: Math.round(newSignal * 10) / 10,
    stealth: Math.round(newStealth * 10) / 10,
    exposure: Math.round(exposure * 10) / 10,
    strategy: strategyId,
    scanned,
    event: eventRecord,
  };

  return {
    tech: record.tech,
    signal: record.signal,
    stealth: record.stealth,
    turn: newTurn,
    alive,
    escaped,
    deathCause,
    history: [...civ.history, record],
    config: cfg,
    usedEvents: eventRecord ? [...civ.usedEvents, eventRecord.id] : [...civ.usedEvents],
  };
}

/**
 * 自动模拟（蒙特卡洛用，不触发事件）
 */
function simulate(strategySequence, config, seedVal) {
  const rng = mulberry32(seedVal || 42);
  let civ = createCivilization(config);

  for (let i = 0; i < (config?.maxTurns || DEFAULT_CONFIG.maxTurns); i++) {
    if (!civ.alive || civ.escaped) break;
    const strategy = strategySequence[i % strategySequence.length];
    civ = advanceTurn(civ, strategy, rng);
  }

  return civ;
}

/**
 * 批量蒙特卡洛模拟
 */
function monteCarloSimulate(strategySequence, config, runs) {
  const results = { escaped: 0, reaped: 0, timeout: 0, avgTurns: 0 };
  let totalTurns = 0;

  for (let i = 0; i < runs; i++) {
    const civ = simulate(strategySequence, config, i * 7919 + 1);
    if (civ.escaped) results.escaped++;
    else if (civ.deathCause === 'reaped') results.reaped++;
    else results.timeout++;
    totalTurns += civ.turn;
  }

  results.avgTurns = Math.round(totalTurns / runs * 10) / 10;
  results.escapeRate = Math.round(results.escaped / runs * 1000) / 10;
  results.reapRate = Math.round(results.reaped / runs * 1000) / 10;
  return results;
}

/**
 * 计算得分（0-100）
 */
function computeScore(civ) {
  if (civ.escaped) {
    const speedBonus = Math.max(0, 20 - civ.turn * 0.6);
    return Math.min(100, Math.round(80 + speedBonus));
  }
  if (!civ.alive) {
    return Math.round(civ.turn / civ.config.maxTurns * 40);
  }
  return 50;
}

/**
 * Mulberry32 PRNG
 */
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 导出 ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STRATEGIES,
    EVENTS,
    DEFAULT_CONFIG,
    createCivilization,
    getExposure,
    pickEvent,
    applyEventChoice,
    advanceTurn,
    simulate,
    monteCarloSimulate,
    computeScore,
    mulberry32,
  };
}
