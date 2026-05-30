const AIToolsValueLogic = (function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeParams(input) {
    const p = input || {};
    return {
      tasksPerMonth: Math.max(0, toNumber(p.tasksPerMonth, 20)),
      hourlyValue: Math.max(0, toNumber(p.hourlyValue, 80)),
      toolCost: Math.max(0, toNumber(p.toolCost, 140)),
      draftMinutes: clamp(toNumber(p.draftMinutes, 35), 0, 180),
      researchMinutes: clamp(toNumber(p.researchMinutes, 25), 0, 180),
      polishMinutes: clamp(toNumber(p.polishMinutes, 20), 0, 180),
      draftSavePct: clamp(toNumber(p.draftSavePct, 45), 0, 95),
      researchSavePct: clamp(toNumber(p.researchSavePct, 35), 0, 95),
      polishSavePct: clamp(toNumber(p.polishSavePct, 25), 0, 95),
      verifyMinutes: Math.max(0, toNumber(p.verifyMinutes, 10))
    };
  }

  function calcPerTaskMinutes(params) {
    const p = normalizeParams(params);
    const manualPerTask = p.draftMinutes + p.researchMinutes + p.polishMinutes;
    const aiPerTask = (
      p.draftMinutes * (1 - p.draftSavePct / 100) +
      p.researchMinutes * (1 - p.researchSavePct / 100) +
      p.polishMinutes * (1 - p.polishSavePct / 100) +
      p.verifyMinutes
    );
    const savedPerTask = manualPerTask - aiPerTask;
    return {
      manualPerTask,
      aiPerTask,
      savedPerTask
    };
  }

  function calculateROI(params) {
    const p = normalizeParams(params);
    const t = calcPerTaskMinutes(p);
    const manualHours = p.tasksPerMonth * t.manualPerTask / 60;
    const aiHours = p.tasksPerMonth * t.aiPerTask / 60;
    const savedHours = manualHours - aiHours;
    const monthlyTimeValue = savedHours * p.hourlyValue;
    const netGain = monthlyTimeValue - p.toolCost;
    const roi = p.toolCost > 0 ? netGain / p.toolCost : (netGain > 0 ? Infinity : 0);
    const positive = netGain >= 0;
    return {
      params: p,
      perTask: t,
      manualHours,
      aiHours,
      savedHours,
      monthlyTimeValue,
      netGain,
      roi,
      positive
    };
  }

  function breakEvenTasks(params) {
    const p = normalizeParams(params);
    const t = calcPerTaskMinutes(p);
    const valuePerTask = (t.savedPerTask / 60) * p.hourlyValue;
    if (valuePerTask <= 0) return Infinity;
    return p.toolCost / valuePerTask;
  }

  function classifyResult(result) {
    const r = result || {};
    if (!Number.isFinite(r.roi)) return { level: 'excellent', text: '你的时间价值远高于工具成本' };
    if (r.roi >= 1) return { level: 'excellent', text: '净收益明显，付费合理' };
    if (r.roi >= 0.2) return { level: 'good', text: '有收益，适合继续用并优化流程' };
    if (r.roi >= 0) return { level: 'neutral', text: '接近盈亏平衡，重点优化任务结构' };
    return { level: 'bad', text: '当前用法不划算，先优化再付费' };
  }

  function simulateROIInterval(params, trials, rng) {
    const p = normalizeParams(params);
    const n = Math.max(100, Math.floor(toNumber(trials, 2000)));
    const random = typeof rng === 'function' ? rng : Math.random;
    const rois = [];
    const netGains = [];
    for (let i = 0; i < n; i++) {
      const sample = {
        tasksPerMonth: p.tasksPerMonth,
        hourlyValue: p.hourlyValue,
        toolCost: p.toolCost,
        draftMinutes: p.draftMinutes,
        researchMinutes: p.researchMinutes,
        polishMinutes: p.polishMinutes,
        draftSavePct: clamp(p.draftSavePct + (random() - 0.5) * 20, 0, 95),
        researchSavePct: clamp(p.researchSavePct + (random() - 0.5) * 20, 0, 95),
        polishSavePct: clamp(p.polishSavePct + (random() - 0.5) * 20, 0, 95),
        verifyMinutes: Math.max(0, p.verifyMinutes * (0.6 + random() * 0.9))
      };
      const res = calculateROI(sample);
      rois.push(res.roi);
      netGains.push(res.netGain);
    }
    rois.sort((a, b) => a - b);
    netGains.sort((a, b) => a - b);
    const at = function (arr, q) {
      const idx = Math.max(0, Math.min(arr.length - 1, Math.floor((arr.length - 1) * q)));
      return arr[idx];
    };
    const positiveCount = netGains.filter(v => v >= 0).length;
    return {
      p10ROI: at(rois, 0.1),
      p50ROI: at(rois, 0.5),
      p90ROI: at(rois, 0.9),
      p10NetGain: at(netGains, 0.1),
      p50NetGain: at(netGains, 0.5),
      p90NetGain: at(netGains, 0.9),
      positiveRate: positiveCount / n
    };
  }

  function generateTaskCurve(params, maxTasks) {
    const p = normalizeParams(params);
    const upper = Math.max(10, Math.floor(toNumber(maxTasks, 120)));
    const points = [];
    for (let t = 0; t <= upper; t += 2) {
      const res = calculateROI({ ...p, tasksPerMonth: t });
      points.push({
        tasks: t,
        netGain: res.netGain,
        timeValue: res.monthlyTimeValue
      });
    }
    return points;
  }

  const api = {
    normalizeParams,
    calcPerTaskMinutes,
    calculateROI,
    breakEvenTasks,
    classifyResult,
    simulateROIInterval,
    generateTaskCurve
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  return api;
})();
