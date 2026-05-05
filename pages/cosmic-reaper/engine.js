/**
 * 宇宙收割者假说 — 核心模拟引擎
 * 
 * 模型说明：
 * - 文明有三个维度：科技等级(tech)、信号强度(signal)、隐蔽能力(stealth)
 * - 收割者系统有一个检测阈值(threshold)，当 signal - stealth > threshold 时触发清除
 * - 文明每回合可以选择发展策略：激进扩张 / 均衡发展 / 隐蔽优先
 * - 不同策略影响三个维度的增长速率
 * - 文明需要在 tech 达到逃逸等级(escapeTech) 前不被检测到
 */

'use strict';

// ── 常量 ──
const STRATEGIES = {
  aggressive: { id: 'aggressive', name: '激进扩张', techGain: 12, signalGain: 18, stealthGain: 2 },
  balanced:   { id: 'balanced',   name: '均衡发展', techGain: 8,  signalGain: 8,  stealthGain: 8 },
  stealth:    { id: 'stealth',    name: '隐蔽优先', techGain: 4,  signalGain: 3,  stealthGain: 15 },
  dormant:    { id: 'dormant',    name: '休眠蛰伏', techGain: 2,  signalGain: 1,  stealthGain: 5 },
};

const DEFAULT_CONFIG = {
  threshold: 100,       // 收割者检测阈值
  escapeTech: 200,      // 逃逸所需科技等级
  maxTurns: 50,         // 最大回合数
  noiseRange: 5,        // 随机噪声范围
  decayRate: 0.02,      // 信号自然衰减率
  reaperScanInterval: 3, // 收割者扫描间隔（回合）
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
    }],
    config: cfg,
  };
}

/**
 * 计算暴露度 = signal - stealth（可为负，负数表示完全隐蔽）
 */
function getExposure(civ) {
  return Math.max(0, civ.signal - civ.stealth);
}

/**
 * 执行一个回合
 * @param {object} civ - 文明状态
 * @param {string} strategyId - 策略ID
 * @param {function} rng - 随机数生成器 (返回 0~1)
 * @returns {object} 更新后的文明状态（新对象）
 */
function advanceTurn(civ, strategyId, rng) {
  if (!civ.alive || civ.escaped) return civ;

  const strategy = STRATEGIES[strategyId];
  if (!strategy) throw new Error('Invalid strategy: ' + strategyId);

  const cfg = civ.config;
  const noise = () => (rng() - 0.5) * 2 * cfg.noiseRange;

  const newTurn = civ.turn + 1;

  // 计算增长（带随机噪声）
  let newTech = civ.tech + strategy.techGain + noise();
  let newSignal = civ.signal + strategy.signalGain + noise();
  let newStealth = civ.stealth + strategy.stealthGain + noise();

  // 信号自然衰减（文明可以主动降低辐射）
  newSignal = newSignal * (1 - cfg.decayRate);

  // 确保不低于0
  newTech = Math.max(0, newTech);
  newSignal = Math.max(0, newSignal);
  newStealth = Math.max(0, newStealth);

  const exposure = Math.max(0, newSignal - newStealth);

  // 收割者扫描检测
  const scanned = (newTurn % cfg.reaperScanInterval === 0);
  let alive = true;
  let escaped = false;

  if (scanned && exposure > cfg.threshold) {
    alive = false; // 被收割
  }

  if (alive && newTech >= cfg.escapeTech) {
    escaped = true; // 科技达到逃逸等级
  }

  // 超过最大回合数，文明自然消亡（资源耗尽）
  if (newTurn >= cfg.maxTurns && !escaped) {
    alive = false;
  }

  const record = {
    turn: newTurn,
    tech: Math.round(newTech * 10) / 10,
    signal: Math.round(newSignal * 10) / 10,
    stealth: Math.round(newStealth * 10) / 10,
    exposure: Math.round(exposure * 10) / 10,
    strategy: strategyId,
    scanned,
  };

  return {
    tech: record.tech,
    signal: record.signal,
    stealth: record.stealth,
    turn: newTurn,
    alive,
    escaped,
    history: [...civ.history, record],
    config: cfg,
  };
}

/**
 * 自动模拟：给定策略序列，跑完整局
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
    else if (!civ.alive) results.reaped++;
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
    // 逃逸成功：基础80分 + 速度奖励（越快越高）
    const speedBonus = Math.max(0, 20 - civ.turn * 0.4);
    return Math.min(100, Math.round(80 + speedBonus));
  }
  if (!civ.alive) {
    // 被收割或超时：根据存活回合数给分
    return Math.round(civ.turn / civ.config.maxTurns * 40);
  }
  return 50; // 还在进行中
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
    DEFAULT_CONFIG,
    createCivilization,
    getExposure,
    advanceTurn,
    simulate,
    monteCarloSimulate,
    computeScore,
    mulberry32,
  };
}
