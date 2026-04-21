/**
 * CAPTCHA 攻防实验室 — 单元测试
 * 运行: node pages/captcha-lab/captcha-lab.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

// ── 模拟 app.js 中的纯逻辑函数 ──

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function computeHumanScore(points, speeds, angles) {
  var score = 50;
  if (speeds.length > 5) {
    var avgSpeed = speeds.reduce(function(a,b){return a+b;},0) / speeds.length;
    var speedVar = speeds.reduce(function(a,b){return a + (b-avgSpeed)*(b-avgSpeed);},0) / speeds.length;
    var speedCV = Math.sqrt(speedVar) / (avgSpeed + 0.01);
    if (speedCV > 0.3) score += 15;
    else if (speedCV > 0.15) score += 8;
    else score -= 10;
  }
  if (angles.length > 5) {
    var avgAngle = angles.reduce(function(a,b){return a+b;},0) / angles.length;
    if (avgAngle > 0.15 && avgAngle < 1.5) score += 15;
    else if (avgAngle > 0.05) score += 8;
    else score -= 5;
    var angleVar = angles.reduce(function(a,b){return a + (b-avgAngle)*(b-avgAngle);},0) / angles.length;
    if (angleVar > 0.05) score += 10;
  }
  if (points.length > 50) score += 5;
  if (points.length > 100) score += 5;
  return Math.max(0, Math.min(100, score));
}

function lighten(hex, pct) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, r + pct); g = Math.min(255, g + pct); b = Math.min(255, b + pct);
  return '#' + [r,g,b].map(function(v) { return v.toString(16).padStart(2,'0'); }).join('');
}

// ── 测试 rand ──
console.log('\n[rand]');
for (var i = 0; i < 100; i++) {
  var v = rand(5, 10);
  if (v < 5 || v > 10) { assert(false, 'rand(5,10) out of range: ' + v); break; }
}
assert(true, 'rand(5,10) always in [5,10] over 100 runs');

assert(rand(7, 7) === 7, 'rand(7,7) === 7');

// ── 测试 computeHumanScore ──
console.log('\n[computeHumanScore]');

// human-like: variable speed, curved path, many points
var humanPoints = [];
var humanSpeeds = [];
var humanAngles = [];
for (var i = 0; i < 80; i++) {
  humanPoints.push({ x: i * 5 + Math.random() * 20, y: Math.sin(i * 0.3) * 50 + 150, t: i * 30 });
  humanSpeeds.push(200 + Math.random() * 300); // variable 200-500
  if (i > 0) humanAngles.push(Math.random() * 0.8 + 0.1); // 0.1-0.9
}
var humanScore = computeHumanScore(humanPoints, humanSpeeds, humanAngles);
assert(humanScore >= 60, 'human-like behavior scores >= 60 (got ' + humanScore + ')');

// bot-like: constant speed, straight path, few points
var botPoints = [];
var botSpeeds = [];
var botAngles = [];
for (var i = 0; i < 20; i++) {
  botPoints.push({ x: i * 20, y: 150, t: i * 50 });
  botSpeeds.push(400); // constant
  botAngles.push(0.01); // nearly straight
}
var botScore = computeHumanScore(botPoints, botSpeeds, botAngles);
assert(botScore < 60, 'bot-like behavior scores < 60 (got ' + botScore + ')');

// edge: empty data
var emptyScore = computeHumanScore([], [], []);
assert(emptyScore === 50, 'empty data returns base score 50 (got ' + emptyScore + ')');

// score clamped to [0, 100]
assert(computeHumanScore(humanPoints, humanSpeeds, humanAngles) <= 100, 'score <= 100');
assert(computeHumanScore(botPoints, botSpeeds, botAngles) >= 0, 'score >= 0');

// ── 测试 lighten ──
console.log('\n[lighten]');
assert(lighten('#000000', 50) === '#323232', 'lighten #000000 by 50 → #323232 (got ' + lighten('#000000', 50) + ')');
assert(lighten('#ff0000', 50) === '#ff3232', 'lighten #ff0000 by 50 → #ff3232 (got ' + lighten('#ff0000', 50) + ')');
assert(lighten('#ffffff', 50) === '#ffffff', 'lighten #ffffff by 50 → #ffffff (clamped)');

// ── 测试 grade 逻辑 ──
console.log('\n[grade logic]');
function getGrade(passedCount) {
  if (passedCount === 8) return 'S';
  if (passedCount >= 6) return 'A';
  if (passedCount >= 4) return 'B';
  if (passedCount >= 2) return 'C';
  return 'D';
}
assert(getGrade(8) === 'S', '8/8 → S');
assert(getGrade(7) === 'A', '7/8 → A');
assert(getGrade(6) === 'A', '6/8 → A');
assert(getGrade(5) === 'B', '5/8 → B');
assert(getGrade(4) === 'B', '4/8 → B');
assert(getGrade(3) === 'C', '3/8 → C');
assert(getGrade(2) === 'C', '2/8 → C');
assert(getGrade(1) === 'D', '1/8 → D');
assert(getGrade(0) === 'D', '0/8 → D');

// ── 测试空间推理 y 坐标逻辑（修复后） ──
console.log('\n[spatial yBase logic]');
function getYBase(z) { return 130 + (4 - z) * 18; }
function getScale(z) { return 0.4 + (1 - z / 5) * 0.6; }

// z=1 (closest) should be lower on screen (larger yBase) and bigger (larger scale)
// z=4 (farthest) should be higher on screen (smaller yBase) and smaller (smaller scale)
assert(getYBase(1) > getYBase(4), 'closest (z=1) has larger yBase than farthest (z=4): ' + getYBase(1) + ' > ' + getYBase(4));
assert(getScale(1) > getScale(4), 'closest (z=1) has larger scale than farthest (z=4): ' + getScale(1).toFixed(2) + ' > ' + getScale(4).toFixed(2));
assert(getYBase(1) === 184, 'z=1 → yBase=184 (got ' + getYBase(1) + ')');
assert(getYBase(4) === 130, 'z=4 → yBase=130 (got ' + getYBase(4) + ')');

// ── 测试 payload 构建逻辑 ──
console.log('\n[payload construction]');
var mockResults = [
  { levelId: 'text', passed: true, timeMs: 5200 },
  { levelId: 'math', passed: true, timeMs: 3100 },
  { levelId: 'slider', passed: false, timeMs: 4500 },
  { levelId: 'grid', passed: true, timeMs: 8200 },
  { levelId: 'click', passed: false, timeMs: 6300 },
  { levelId: 'rotate', passed: true, timeMs: 7100 },
  { levelId: 'spatial', passed: true, timeMs: 5800 },
  { levelId: 'behavior', passed: true, timeMs: 9400 },
];
var passedCount = mockResults.filter(function(r) { return r.passed; }).length;
var totalTimeMs = mockResults.reduce(function(a, r) { return a + r.timeMs; }, 0);
assert(passedCount === 6, 'passedCount = 6 (got ' + passedCount + ')');
assert(totalTimeMs === 49600, 'totalTimeMs = 49600 (got ' + totalTimeMs + ')');
assert(getGrade(passedCount) === 'A', 'grade = A');

var levels = {};
mockResults.forEach(function(r) {
  levels[r.levelId] = r.passed ? 1 : 0;
  levels['time' + r.levelId.charAt(0).toUpperCase() + r.levelId.slice(1)] = r.timeMs;
});
assert(levels.text === 1, 'levels.text = 1');
assert(levels.slider === 0, 'levels.slider = 0');
assert(levels.timeText === 5200, 'levels.timeText = 5200');
assert(levels.timeBehavior === 9400, 'levels.timeBehavior = 9400');

// ── 结果 ──
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) process.exit(1);
