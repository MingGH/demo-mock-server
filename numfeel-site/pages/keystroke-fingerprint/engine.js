/**
 * 键盘输入节奏识别（keystroke dynamics）核心逻辑引擎。
 *
 * 包含三部分：
 *  1. 打字事件 → 特征提取（每键按压时长 hold time、键间间隔 inter-key interval）
 *  2. 特征归一化与距离计算（加权欧氏距离）
 *  3. 节奏稳定性判定（同一人两遍样本的距离 vs 阈值）
 *
 * 纯逻辑模块：不操作 DOM，可在 Node 中直接 require 测试。
 */

/** 打字目标文本（26 个字母全键位） */
var TARGET_TEXT = 'the quick brown fox jumps over the lazy dog';

/** hold time 权重（每键按压时长） */
var HOLD_WEIGHT = 0.6;

/** interval 权重（键间间隔） */
var INTERVAL_WEIGHT = 0.4;

/** 稳定性阈值：两遍样本距离低于此值视为"节奏稳定/复现良好"（归一化尺度） */
var STABLE_THRESHOLD = 0.5;

/**
 * 从按键事件序列提取节奏特征。
 * @param {Array<Object>} events 按键事件数组，每项 { key, down, up }：
 *   key 为字符（小写字母），down/up 为毫秒时间戳
 * @returns {Object} { holdTimes, intervals, totalMs, errorCount, validKeys }
 *   holdTimes 为每键按压时长数组（ms），intervals 为相邻键间间隔数组（ms）
 */
function extractFeatures(events) {
  var holdTimes = [];
  var intervals = [];
  var lastUp = null;
  var validKeys = 0;

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (!ev || ev.down === undefined || ev.up === undefined || ev.down > ev.up) {
      continue;
    }
    holdTimes.push(ev.up - ev.down);
    if (lastUp !== null) {
      intervals.push(ev.down - lastUp);
    }
    lastUp = ev.up;
    validKeys++;
  }
  return {
    holdTimes: holdTimes,
    intervals: intervals,
    totalMs: lastUp !== null ? lastUp - events[0].down : 0,
    validKeys: validKeys
  };
}

/**
 * 计算两段特征序列的加权欧氏距离。
 * 特征对齐：截断到较短长度；归一化：hold 用 200ms 尺度、interval 用 500ms 尺度缩放。
 * @param {Object} f1 特征对象 { holdTimes, intervals }
 * @param {Object} f2 特征对象 { holdTimes, intervals }
 * @returns {number} 距离（0 = 完全一致；越大差异越大）
 */
function computeDistance(f1, f2) {
  if (!f1 || !f2 || !f1.holdTimes || !f2.holdTimes) {
    return Infinity;
  }
  var n = Math.min(f1.holdTimes.length, f2.holdTimes.length);
  if (n === 0) {
    return Infinity;
  }

  var holdSum = 0;
  for (var i = 0; i < n; i++) {
    var dh = (f1.holdTimes[i] - f2.holdTimes[i]) / 200;
    holdSum += dh * dh;
  }

  var i1 = f1.intervals || [];
  var i2 = f2.intervals || [];
  var m = Math.min(i1.length, i2.length);
  var intSum = 0;
  for (var j = 0; j < m; j++) {
    var di = (i1[j] - i2[j]) / 500;
    intSum += di * di;
  }

  var holdPart = Math.sqrt(holdSum / n);
  var intPart = m > 0 ? Math.sqrt(intSum / m) : 0;
  return Math.round((HOLD_WEIGHT * holdPart + INTERVAL_WEIGHT * intPart) * 10) / 10;
}

/**
 * 判定节奏稳定性：两遍样本的距离是否低于稳定阈值。
 * @param {Object} f1 第 1 遍特征
 * @param {Object} f2 第 2 遍特征
 * @returns {Object} { distance, stable, grade }
 *   grade: '优秀' | '良好' | '一般' | '不稳定'
 */
function judgeStability(f1, f2) {
  var d = computeDistance(f1, f2);
  var grade;
  if (d === Infinity) {
    grade = '无法评估';
  } else if (d < 0.2) {
    grade = '优秀';
  } else if (d < 0.35) {
    grade = '良好';
  } else if (d < STABLE_THRESHOLD) {
    grade = '一般';
  } else {
    grade = '不稳定';
  }
  return {
    distance: d,
    stable: d < STABLE_THRESHOLD,
    grade: grade
  };
}

/**
 * 生成样本的文本哈希（MD5 简化版，仅用于后端去重标识）。
 * 说明：此处使用简单 FNV-1a 哈希并截断，够用于样本标识。
 * @param {string} text 文本
 * @returns {string} 16 位十六进制哈希
 */
function hashText(text) {
  var str = text || '';
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8) + '00000000';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractFeatures: extractFeatures,
    computeDistance: computeDistance,
    judgeStability: judgeStability,
    hashText: hashText,
    TARGET_TEXT: TARGET_TEXT,
    STABLE_THRESHOLD: STABLE_THRESHOLD
  };
}
