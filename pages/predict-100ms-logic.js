const Predict100msLogic = (function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeConfig(input) {
    const cfg = input || {};
    return {
      predictionMs: clamp(toNumber(cfg.predictionMs, 100), 20, 1000),
      reactionMs: clamp(toNumber(cfg.reactionMs, 220), 50, 1000),
      motorMs: clamp(toNumber(cfg.motorMs, 35), 0, 500),
      jitterMs: clamp(toNumber(cfg.jitterMs, 20), 0, 200),
      rounds: Math.floor(clamp(toNumber(cfg.rounds, 40), 1, 500))
    };
  }

  function minReactionNeeded(predictionMs, motorMs, safetyMs) {
    const predict = toNumber(predictionMs, 100);
    const motor = Math.max(0, toNumber(motorMs, 0));
    const safety = Math.max(0, toNumber(safetyMs, 0));
    return predict - motor - safety;
  }

  function sampleDelay(config, rng) {
    const cfg = normalizeConfig(config);
    const random = typeof rng === 'function' ? rng : Math.random;
    const jitter = (random() * 2 - 1) * cfg.jitterMs;
    return Math.max(0, cfg.reactionMs + cfg.motorMs + jitter);
  }

  function runTrial(config, rng) {
    const cfg = normalizeConfig(config);
    const totalDelay = sampleDelay(cfg, rng);
    const margin = cfg.predictionMs - totalDelay;
    return {
      totalDelay,
      margin,
      success: margin >= 0
    };
  }

  function runBatch(config, rng) {
    const cfg = normalizeConfig(config);
    const trials = [];
    let successCount = 0;
    let delaySum = 0;
    for (let i = 0; i < cfg.rounds; i++) {
      const trial = runTrial(cfg, rng);
      trials.push(trial);
      delaySum += trial.totalDelay;
      if (trial.success) successCount++;
    }
    const successRate = cfg.rounds > 0 ? successCount / cfg.rounds : 0;
    const avgDelay = cfg.rounds > 0 ? delaySum / cfg.rounds : 0;
    return {
      config: cfg,
      trials,
      successCount,
      successRate,
      avgDelay,
      requiredReactionMs: minReactionNeeded(cfg.predictionMs, cfg.motorMs, 0),
      strictRequiredReactionMs: minReactionNeeded(cfg.predictionMs, cfg.motorMs, 15)
    };
  }

  function estimateSuccessRate(config) {
    const cfg = normalizeConfig(config);
    const threshold = cfg.predictionMs;
    const low = cfg.reactionMs + cfg.motorMs - cfg.jitterMs;
    const high = cfg.reactionMs + cfg.motorMs + cfg.jitterMs;
    if (cfg.jitterMs === 0) return low <= threshold ? 1 : 0;
    if (threshold <= low) return 0;
    if (threshold >= high) return 1;
    return (threshold - low) / (high - low);
  }

  function classify(result) {
    const rate = (result && Number.isFinite(result.successRate)) ? result.successRate : 0;
    if (rate <= 0.01) return { level: 'impossible', text: '几乎不可改变' };
    if (rate <= 0.1) return { level: 'rare', text: '偶尔踩中窗口' };
    if (rate <= 0.4) return { level: 'hard', text: '可以改变，但很不稳定' };
    return { level: 'possible', text: '有明显干预空间' };
  }

  function summarizeReactionTest(times, targetMs) {
    const arr = Array.isArray(times) ? times
      .map(v => toNumber(v, NaN))
      .filter(v => Number.isFinite(v) && v >= 0) : [];
    const target = Math.max(1, toNumber(targetMs, 100));
    if (arr.length === 0) {
      return {
        count: 0,
        averageMs: 0,
        bestMs: 0,
        worstMs: 0,
        slowerByMs: 0,
        ratioToTarget: 0,
        hit100msRate: 0
      };
    }
    const sum = arr.reduce((s, v) => s + v, 0);
    const averageMs = sum / arr.length;
    const bestMs = Math.min.apply(null, arr);
    const worstMs = Math.max.apply(null, arr);
    const hitCount = arr.filter(v => v <= target).length;
    const slowerByMs = Math.max(0, averageMs - target);
    const ratioToTarget = averageMs / target;
    return {
      count: arr.length,
      averageMs,
      bestMs,
      worstMs,
      slowerByMs,
      ratioToTarget,
      hit100msRate: hitCount / arr.length
    };
  }

  const api = {
    normalizeConfig,
    minReactionNeeded,
    sampleDelay,
    runTrial,
    runBatch,
    estimateSuccessRate,
    classify,
    summarizeReactionTest
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  return api;
})();
