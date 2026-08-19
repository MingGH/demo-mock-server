/*
 * java-memory 演示页的纯计算逻辑。
 * 不操作 DOM，可在浏览器与 Node 测试中直接使用。
 * 输入是 /jvm-memory 接口返回的快照对象（camelCase 字段）。
 */

/** 把数字格式化为去掉多余尾随零的字符串；null/非法值返回占位符。 */
function fmtMb(mb, digits) {
  if (mb == null || typeof mb !== 'number' || !isFinite(mb)) {
    return '\u2014'; // 长破折号
  }
  var d = digits == null ? 2 : digits;
  return mb.toFixed(d).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

/** 仅对合法有限数字返回其值，否则返回 null。 */
function num(v) {
  return (typeof v === 'number' && isFinite(v)) ? v : null;
}

/** 把负数归零、>1 截断到 1。 */
function clamp01(n) {
  if (n == null || isNaN(n)) { return 0; }
  if (n < 0) { return 0; }
  if (n > 1) { return 1; }
  return n;
}

/*
 * 把快照拆成「环境税账本」的各段，供环形图/图例使用。
 * 返回数组：{ key, label, mb, color }。
 * 非堆里扣掉 Metaspace 与 Code Cache 后剩余的部分记为「其它非堆」。
 */
function breakdown(snapshot) {
  var s = snapshot || {};
  var heap = num(s.heapUsedMb);
  var metaspace = num(s.metaspaceUsedMb);
  var code = num(s.codeCacheUsedMb);
  var nonHeap = num(s.nonHeapUsedMb);
  var stacks = num(s.threadStackMbEstimate);

  var segments = [];
  if (heap != null) {
    segments.push({ key: 'heap', label: '堆 Heap（业务对象住这儿）', mb: heap, color: '#ffd700' });
  }
  if (metaspace != null) {
    segments.push({ key: 'metaspace', label: '元空间 Metaspace', mb: metaspace, color: '#90caf9' });
  }
  if (code != null) {
    segments.push({ key: 'code', label: '即时编译 Code Cache', mb: code, color: '#ce93d8' });
  }
  if (stacks != null) {
    segments.push({ key: 'stacks', label: '线程栈Stack（≈线程数×1MB）', mb: stacks, color: '#ff6b6b' });
  }
  if (nonHeap != null) {
    var known = (metaspace != null ? metaspace : 0) + (code != null ? code : 0);
    var other = Math.max(0, nonHeap - known);
    if (other > 0) {
      segments.push({ key: 'other', label: '其它非堆其它区域', mb: other, color: '#81c784' });
    }
  }
  return segments;
}

/** 账本各段内存之和（MB），用于环形图分母。 */
function breakdownTotal(segments) {
  var total = 0;
  for (var i = 0; i < segments.length; i++) {
    total += segments[i].mb;
  }
  return total;
}

/** 首屏核心指标精简对象。 */
function headline(snapshot) {
  var s = snapshot || {};
  return {
    javaVersion: s.javaVersion != null ? s.javaVersion : '\u2014',
    pid: num(s.pid),
    rssMb: num(s.rssMb),
    heapUsedMb: num(s.heapUsedMb),
    heapMaxMb: num(s.heapMaxMb),
    liveThreads: num(s.liveThreads),
    loadedClasses: num(s.loadedClasses),
    gcCount: (Array.isArray(s.gc) ? s.gc.length : 0)
  };
}

/** 运行环境身份：JVM 版本与 GC 名称列表（用于页面自证「我是谁」）。 */
function jvmIdentity(snapshot) {
  var s = snapshot || {};
  var gcNames = Array.isArray(s.gc) && s.gc.length > 0
    ? s.gc.map(function (g) { return g.name; })
    : [];
  return {
    javaVersion: s.javaVersion != null ? s.javaVersion : null,
    gcNames: gcNames
  };
}

/** 容器内存占用信息：limit 不可读时 available=false。 */
function containerInfo(snapshot) {
  var s = snapshot || {};
  var limit = num(s.containerMemoryLimitMb);
  var rss = num(s.rssMb);
  if (limit == null || limit <= 0) {
    return { available: false, usedMb: rss, limitMb: null, percent: null };
  }
  var used = rss != null ? rss : (num(s.heapCommittedMb) || 0);
  return { available: true, usedMb: used, limitMb: limit, percent: clamp01(used / limit) };
}

/** 与裸 JDK 的 MiniServer（-Xmx64m，约 45MB）做内存倍数对比。 */
function contrastBare(snapshot, bareMb) {
  var rss = num((snapshot || {}).rssMb);
  var bare = num(bareMb) || 45;
  if (rss == null || rss <= 0) {
    return { available: false, ratio: null };
  }
  return { available: true, ratio: rss / bare };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtMb: fmtMb,
    num: num,
    clamp01: clamp01,
    breakdown: breakdown,
    breakdownTotal: breakdownTotal,
    headline: headline,
    jvmIdentity: jvmIdentity,
    containerInfo: containerInfo,
    contrastBare: contrastBare
  };
}