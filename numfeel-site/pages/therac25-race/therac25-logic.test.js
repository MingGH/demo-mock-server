/**
 * Therac-25 逻辑层单元测试（node 直跑）
 * 覆盖：竞态边界、窗口=0 修复态、剂量结算、时序数据。
 */
'use strict';
var L = require('./therac25-logic.js');

var passed = 0;
var failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; console.log('✅ ' + msg + ' (' + actual + ')'); }
  else { failed++; console.error('❌ ' + msg + ' 期望 ' + expected + ' 实际 ' + actual); }
}

// ── 预设齐全 ─────────────────────────────
assert(L.PRESETS.length === 3, 'PRESETS 包含三档固件');
var legacy = L.PRESETS[0];
var fixed = L.PRESETS[2];
assert(legacy.windowMs === 260, '祖传固件窗口 = 260ms');
assert(fixed.windowMs === 0, '互斥锁固件窗口 = 0ms（已修复）');

// ── 竞态边界判定 ────────────────────────
var resFast = L.evalShot(0, 30, 58);                 // dt=30 < 58 → 触发
assert(resFast.raced === true, 'dt=30 < 58 触发竞态');
assert(resFast.safe === false, '触发竞态时 safe=false');

var resBoundary = L.evalShot(0, 58, 58);             // dt=58 恰等于窗口 → 不触发（严格小于）
assert(resBoundary.raced === false, 'dt 恰等于窗口不触发竞态（严格小于）');

// 小数时间戳：显示值必须与判定一致（floor 而非 round）
var resFrac = L.evalShot(0, 57.6, 58);               // raw 57.6 < 58 → 触发，显示 57
assert(resFrac.raced === true && resFrac.dt === 57, 'raw 57.6 触发且显示 57（与严格小于一致）');
var resFrac2 = L.evalShot(0, 58.4, 58);              // raw 58.4 ≥ 58 → 安全，显示 58
assert(resFrac2.raced === false && resFrac2.dt === 58, 'raw 58.4 安全且显示 58');

var resSlow = L.evalShot(0, 300, 58);                // dt=300 > 58 → 安全
assert(resSlow.safe === true, 'dt=300 安全');
assertClose(resSlow.dt, 300, 0, 'dt 计算正确');

// ── 修复态（windowMs=0）：任何间隔都不触发 ──
var resFixed = L.evalShot(0, 0, 0);                  // 极端：两键同刻
assert(resFixed.raced === false, '互斥锁下两键同刻也不触发');
var resFixed2 = L.evalShot(0, 9999, 0);
assert(resFixed2.safe === true, '互斥锁下任何手速都安全');

// ── 剂量结算 ────────────────────────────
var doseRaced = L.settleDose(true, L.DOSE_SETTING, L.DOSE_LETHAL, L.DOSE_SAFE);
assert(doseRaced.overdosed === true, '竞态触发 → 判定过剂量');
assert(doseRaced.received === L.DOSE_SETTING, '竞态触发 → 收到原封剂量 ' + L.DOSE_SETTING);
assert(doseRaced.received > L.DOSE_LETHAL, '收到剂量超过致死阈值 ' + L.DOSE_LETHAL);

var doseSafe = L.settleDose(false, L.DOSE_SETTING, L.DOSE_LETHAL, L.DOSE_SAFE);
assert(doseSafe.overdosed === false, '安全 → 未过剂量');
assert(doseSafe.received === L.DOSE_SAFE, '安全 → 剂量被钳制在单次治疗量 ' + L.DOSE_SAFE + ' Gy');
assert(doseSafe.received < L.DOSE_LETHAL, '安全剂量低于致死阈值');

// 阈值语义：恰好等于致死阈值不算过量，超过才算
var doseAtThreshold = L.settleDose(true, L.DOSE_LETHAL, L.DOSE_LETHAL, L.DOSE_SAFE);
assert(doseAtThreshold.overdosed === false, '剂量恰等于致死阈值 → 未判过量（严格大于）');

// ── 跳过第一道命令 ──────────────────────
var fbSkip = L.skipFeedback();
assert(fbSkip.tone === 'invalid', '跳过检查 → invalid 文案');
assert(fbSkip.head.indexOf('检查') >= 0, '跳过检查文案点名「检查」');

// ── 回调文案 ────────────────────────────
var fb = L.shotFeedback(resFast);
assert(fb.tone === 'boom' && fb.head.indexOf('54') >= 0, '竞态 → MALFUNCTION 54 文案');
var fbSafe = L.shotFeedback(resSlow);
assert(fbSafe.tone === 'safe', '安全 → safe 文案');

// ── 时序数据采样 ────────────────────────
var prof = L.generateTimingProfile(58, 5, 200, 20);
assert(prof.length === 21, '时序采样 21 点');
assert(prof[0].dt === 5 && prof[0].hit === true, '极快间隔命中窗口');
assert(prof[20].dt === 200 && prof[20].hit === false, '较慢间隔不命中');

// ── 史实时间轴 ──────────────────────────
var tl = L.getTimeline();
assert(tl.length >= 6, '时间轴至少 6 条');
assert(tl[0].event.indexOf('Therac-20') >= 0, '时间轴包含旧机型硬件互锁的潜伏期背景');

// ── 汇总 ────────────────────────────────
console.log('\n共 ' + (passed + failed) + ' 项，通过 ' + passed + '，失败 ' + failed);
process.exit(failed ? 1 : 0);
