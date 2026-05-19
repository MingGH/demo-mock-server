'use strict';

const REGION_PRESETS = {
  'left-half':    { xMin: 0, xMax: 0.5, yMin: 0, yMax: 1,   label: '左半边', fraction: 0.5 },
  'top-left':     { xMin: 0, xMax: 0.5, yMin: 0, yMax: 0.5, label: '左上角 1/4', fraction: 0.25 },
  'center-small': { xMin: 0.35, xMax: 0.65, yMin: 0.35, yMax: 0.65, label: '中央 9%', fraction: 0.09 }
};

function regionBounds(regionKey, boxW, boxH) {
  var r = REGION_PRESETS[regionKey];
  return {
    xMin: r.xMin * boxW, xMax: r.xMax * boxW,
    yMin: r.yMin * boxH, yMax: r.yMax * boxH,
    fraction: r.fraction
  };
}

function ParticleSimulation(numParticles, regionKey, boxW, boxH) {
  this.numParticles = numParticles;
  this.regionKey = regionKey;
  this.boxW = boxW;
  this.boxH = boxH;
  this.epsilon = 20;           // 精确回归判定半径（逻辑坐标）
  this.strictMode = false;     // false=区域回归, true=精确位置回归
  this.particles = [];
  this.step = 0;
  this.regionRecurrenceSteps = [];
  this.strictRecurrenceSteps = [];
  this.history = [];           // { step, regionConc, strictConc }
  this.historyMax = 600;
  this._init();
}

ParticleSimulation.prototype._init = function () {
  var b = regionBounds(this.regionKey, this.boxW, this.boxH);
  var pads = [];
  for (var i = 0; i < this.numParticles; i++) {
    var x = b.xMin + Math.random() * (b.xMax - b.xMin);
    var y = b.yMin + Math.random() * (b.yMax - b.yMin);
    var angle = Math.random() * 2 * Math.PI;
    var spd = 0.4 + Math.random() * 1.6;
    pads.push({
      x: x, y: y,
      vx: spd * Math.cos(angle),
      vy: spd * Math.sin(angle),
      x0: x, y0: y   // 记录初始精确位置
    });
  }
  this.particles = pads;
  this.step = 0;
  this.regionRecurrenceSteps = [];
  this.strictRecurrenceSteps = [];
  this._hasScattered = false;
  this._hasScatteredStrict = false;
  this.history = [];
  this._record();
};

ParticleSimulation.prototype.reset = function () { this._init(); };

ParticleSimulation.prototype.stepMany = function (n) {
  n = n || 1;
  for (var i = 0; i < n; i++) this._tick();
};

ParticleSimulation.prototype._tick = function () {
  this.step++;
  var ps = this.particles;
  var w = this.boxW, h = this.boxH;
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i];
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0)      { p.x = -p.x;            p.vx = Math.abs(p.vx); }
    if (p.x > w)      { p.x = 2 * w - p.x;     p.vx = -Math.abs(p.vx); }
    if (p.y < 0)      { p.y = -p.y;            p.vy = Math.abs(p.vy); }
    if (p.y > h)      { p.y = 2 * h - p.y;     p.vy = -Math.abs(p.vy); }
  }
  this._record();
};

ParticleSimulation.prototype._record = function () {
  var rConc = this.getRegionConcentration();
  var sConc = this.getStrictConcentration();
  this.history.push({ step: this.step, regionConc: rConc, strictConc: sConc });
  if (this.history.length > this.historyMax) this.history.shift();

  // 只有粒子曾经散开过之后的回归才算有效回归
  if (!this._hasScattered) {
    if (rConc < 1) this._hasScattered = true;
  } else {
    if (rConc >= 0.999) this.regionRecurrenceSteps.push(this.step);
  }
  if (!this._hasScatteredStrict) {
    if (sConc < 1) this._hasScatteredStrict = true;
  } else {
    if (sConc >= 0.999) this.strictRecurrenceSteps.push(this.step);
  }
};

// ── 区域回归（简化版，用于直观感受指数规律）
ParticleSimulation.prototype.getRegionConcentration = function () {
  var b = regionBounds(this.regionKey, this.boxW, this.boxH);
  var count = 0;
  for (var i = 0; i < this.particles.length; i++) {
    var p = this.particles[i];
    if (p.x >= b.xMin && p.x <= b.xMax && p.y >= b.yMin && p.y <= b.yMax) count++;
  }
  return count / this.numParticles;
};

// ── 精确回归（严格庞加莱回归：每个粒子回到初始位置附近）
ParticleSimulation.prototype.getStrictConcentration = function () {
  var eps2 = this.epsilon * this.epsilon;
  var count = 0;
  for (var i = 0; i < this.particles.length; i++) {
    var p = this.particles[i];
    var dx = p.x - p.x0;
    var dy = p.y - p.y0;
    if (dx * dx + dy * dy <= eps2) count++;
  }
  return count / this.numParticles;
};

// ── 当前模式下的浓度
ParticleSimulation.prototype.getConcentration = function () {
  return this.strictMode ? this.getStrictConcentration() : this.getRegionConcentration();
};

// ── 当前模式下的回归步骤数组
ParticleSimulation.prototype.currentRecurrenceSteps = function () {
  return this.strictMode ? this.strictRecurrenceSteps : this.regionRecurrenceSteps;
};

// ── 理论回归周期
ParticleSimulation.prototype.regionTheoreticalPeriod = function () {
  var b = regionBounds(this.regionKey, this.boxW, this.boxH);
  return Math.pow(1 / b.fraction, this.numParticles);
};

ParticleSimulation.prototype.strictTheoreticalPeriod = function () {
  var epsArea = Math.PI * this.epsilon * this.epsilon;
  var boxArea = this.boxW * this.boxH;
  return Math.pow(boxArea / epsArea, this.numParticles);
};

ParticleSimulation.prototype.theoreticalPeriod = function () {
  return this.strictMode ? this.strictTheoreticalPeriod() : this.regionTheoreticalPeriod();
};

// ── 观察到的平均回归间隔
ParticleSimulation.prototype.observedAvgPeriod = function () {
  var rs = this.currentRecurrenceSteps();
  if (rs.length < 2) return null;
  var sum = 0;
  for (var i = 1; i < rs.length; i++) sum += rs[i] - rs[i - 1];
  return sum / (rs.length - 1);
};

function formatLarge(n) {
  if (n === Infinity || n > 1e300) return '> 10³⁰⁰';
  if (n >= 1e15) return n.toExponential(1);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' 百万';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(1);
}

function formatPercent(v) {
  return (v * 100).toFixed(1) + '%';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParticleSimulation, REGION_PRESETS, regionBounds, formatLarge, formatPercent };
}
