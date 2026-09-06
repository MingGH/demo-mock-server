/**
 * java-agent-lab 纯逻辑引擎：时间轴布局、耗时格式化、泳道配色。
 * 不操作 DOM，可被 Node 直接 require 测试。
 */

/**
 * 把微秒耗时格式化为人类可读文本。
 *
 * @param {number} us 耗时（微秒）
 * @returns {string} 如「820 µs」「3.42 ms」「1.05 s」
 */
function formatDuration(us) {
  if (!isFinite(us) || us < 0) return '—';
  if (us < 1000) return Math.round(us) + ' µs';
  if (us < 1e6) return (us / 1000).toFixed(us < 10000 ? 2 : 1) + ' ms';
  return (us / 1e6).toFixed(2) + ' s';
}

/**
 * 按线程名选泳道颜色（对应站内颜色语义）。
 * nio 事件循环 → 蓝；boundedElastic 工作线程 → 橙；main → 金；其他 → 灰。
 *
 * @param {string} threadName 线程名
 * @returns {string} CSS 颜色值
 */
function pickLaneColor(threadName) {
  const t = String(threadName || '');
  if (t.indexOf('reactor-http-nio') >= 0) return '#90caf9';
  if (t.indexOf('boundedElastic') >= 0) return '#ffb74d';
  if (t === 'main') return '#ffd700';
  return '#888888';
}

/**
 * 事件的方法标签。
 *
 * @param {string} type 类简名
 * @param {string} method 方法名
 * @returns {string} 如「JvmMemoryController.snapshot()」
 */
function methodLabel(type, method) {
  return String(type || '?') + '.' + String(method || '?') + '()';
}

/**
 * 计算线程泳道时间轴布局。
 * 事件只有「完成时刻 epochMs」和「耗时 durationMicros」，span 区间近似取
 * [epochMs - duration, epochMs]。窗口内事件按线程分泳道，横向位置用百分比表达。
 *
 * @param {Array<{seq:number,epochMs:number,type:string,method:string,depth:number,durationMicros:number,threadName:string,error:boolean}>} events 事件列表（seq 升序）
 * @param {number} nowMs 参考当前时刻（测试可注入；缺省用最后一条事件时刻）
 * @param {number} windowMs 时间窗宽（毫秒，最小 1000）
 * @returns {{t0:number, t1:number, windowMs:number, lanes:Array<{thread:string, spans:Array<{left:number,width:number,event:Object}>}>, count:number}} DOM 无关的布局结构，left/width 为百分比 0-100
 */
function timelineLayout(events, nowMs, windowMs) {
  const list = Array.isArray(events) ? events : [];
  const win = Math.max(1000, windowMs || 30000);
  const newest = list.length ? list[list.length - 1].epochMs : 0;
  const ref = typeof nowMs === 'number' && nowMs > 0 ? nowMs : newest;
  const t1 = Math.max(ref, newest);
  const t0 = Math.max(t1 - win, 0);

  const lanes = [];
  const laneIndex = new Map();
  let count = 0;
  for (const e of list) {
    const end = e.epochMs;
    const start = end - (e.durationMicros || 0) / 1000;
    if (end < t0 || start > t1) continue;
    let idx = laneIndex.get(e.threadName);
    if (idx === undefined) {
      idx = lanes.length;
      laneIndex.set(e.threadName, idx);
      lanes.push({ thread: e.threadName, spans: [] });
    }
    const leftPct = Math.max(0, (start - t0) / win * 100);
    if (leftPct >= 100) continue;
    const widthPct = Math.min(Math.max((e.durationMicros || 0) / 1000 / win * 100, 0.4), 100 - leftPct);
    lanes[idx].spans.push({ left: leftPct, width: widthPct, event: e });
    count++;
  }
  return { t0: t0, t1: t1, windowMs: win, lanes: lanes, count: count };
}

if (typeof window !== 'undefined') {
  window.AgentLab = { formatDuration: formatDuration, pickLaneColor: pickLaneColor, methodLabel: methodLabel, timelineLayout: timelineLayout };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatDuration: formatDuration, pickLaneColor: pickLaneColor, methodLabel: methodLabel, timelineLayout: timelineLayout };
}
