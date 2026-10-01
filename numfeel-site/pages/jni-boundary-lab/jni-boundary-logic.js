/**
 * 跨界收费站 - 核心逻辑
 * 输入全部来自后端 /jni-boundary 接口的真实测量值：
 *   tollPerCallNs  纯过路费（noop 车道均摊）
 *   javaPerOpNs    Java JIT 循环每次操作耗时
 *   percallPerOpNs C++ 单次过境模式每次操作耗时
 *   batchPerOpNs   C++ 攒批过境模式每次操作耗时
 * 公式推导仍然摊开：曲线的形状由 b + N·v 与 N·j 决定，但 j、v、b 全是实测值。
 */

const JniBoundaryLogic = (function () {

  function assertPositive(v, name) {
    if (typeof v !== 'number' || Number.isNaN(v) || v <= 0) {
      throw new Error(name + ' 必须是 > 0 的数字');
    }
  }

  /**
   * 实测加速比：Java 每次操作耗时 / 对方每次操作耗时（>1 表示对方赢）
   */
  function speedup(javaPerOpNs, otherPerOpNs) {
    assertPositive(javaPerOpNs, 'Java 每次操作耗时');
    assertPositive(otherPerOpNs, '对方每次操作耗时');
    return javaPerOpNs / otherPerOpNs;
  }

  /**
   * 实测交叉点：N* = b / (j - v)
   * b = 每次过境的固定开销（noop 均摊），j = Java 每次，v = C++ 攒批每次。
   * j <= v 时（JIT 后的 Java 不输 C++）没有交叉点，返回 null。
   */
  function crossoverBatch(javaPerOpNs, batchPerOpNs, tollPerCallNs) {
    assertPositive(javaPerOpNs, 'Java 每次操作耗时');
    assertPositive(batchPerOpNs, 'C++ 攒批每次操作耗时');
    if (typeof tollPerCallNs !== 'number' || Number.isNaN(tollPerCallNs) || tollPerCallNs < 0) {
      throw new Error('过路费必须 >= 0');
    }
    if (batchPerOpNs >= javaPerOpNs) return null;
    return tollPerCallNs / (javaPerOpNs - batchPerOpNs);
  }

  /**
   * 由实测值推导的均摊曲线：
   *   C++ 攒批每次操作 = toll / N + batchPerOp
   *   Java 每次操作 = javaPerOp（JIT 内没有收费站，恒定）
   * 返回对数取样的 { batches, javaPerOp, nativePerOp }。
   */
  function measuredCurve(javaPerOpNs, batchPerOpNs, tollPerCallNs, maxBatch) {
    assertPositive(javaPerOpNs, 'Java 每次操作耗时');
    assertPositive(batchPerOpNs, 'C++ 攒批每次操作耗时');
    if (typeof tollPerCallNs !== 'number' || Number.isNaN(tollPerCallNs) || tollPerCallNs < 0) {
      throw new Error('过路费必须 >= 0');
    }
    if (!Number.isInteger(maxBatch) || maxBatch < 1) {
      throw new Error('最大批量必须是 >= 1 的整数');
    }
    const steps = 41;
    const logMax = Math.log10(maxBatch);
    const batches = [];
    const nativePerOp = [];
    for (let i = 0; i < steps; i++) {
      const n = Math.max(1, Math.round(Math.pow(10, (logMax * i) / (steps - 1))));
      if (batches.length > 0 && n === batches[batches.length - 1]) continue;
      batches.push(n);
      nativePerOp.push(tollPerCallNs / n + batchPerOpNs);
    }
    return { batches, javaPerOp: batches.map(() => javaPerOpNs), nativePerOp };
  }

  /**
   * 逐档实测曲线上的交叉点：第一批 perOp < Java 的批量档位。
   * points 由后端 /curve 逐档真测返回。找不到赢家返回 null。
   */
  function measuredCrossover(javaPerOpNs, points) {
    assertPositive(javaPerOpNs, 'Java 每次操作耗时');
    if (!Array.isArray(points) || points.length === 0) {
      throw new Error('points 必须是非空数组');
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (typeof p.batch !== 'number' || p.batch < 1 || typeof p.perOpNs !== 'number' || p.perOpNs <= 0) {
        throw new Error('point[' + i + '] 结构非法');
      }
      if (p.perOpNs < javaPerOpNs) {
        return p.batch;
      }
    }
    return null;
  }

  /**
   * 判词状态机：输入实测结果（可为 null = 该车道还没跑），
   * 输出 { cls, text }。撞墙诚实点名，包括「JIT 赢了」这种最反直觉的结局。
   */
  function verdict(results) {
    const r = results || {};
    const hasAll = r.java && r.percall && r.batch && typeof r.toll === 'number';

    if (!hasAll) {
      return { cls: '', text: '按「开始实测」，四条车道会在你访问的这台后端上依次跑真基准。' };
    }

    const j = r.java.perOpNs;
    const pc = r.percall.perOpNs;
    const v = r.batch.perOpNs;
    const b = r.toll;

    const parts = [];
    let cls = '';

    const pcRatio = pc / j;
    if (pcRatio > 1) {
      parts.push('单次过境慢 ' + pcRatio.toFixed(1) + ' 倍——每次调用交 ' + fmtNs(b) +
        ' 过路费，把活本身（' + fmtNs(j) + '/次）彻底淹没');
      cls = 'warn';
    } else {
      parts.push('单次过境也快 ' + (1 / pcRatio).toFixed(1) + ' 倍——这次活够粗，过路费一次就挣回来了');
      cls = 'success';
    }

    const cross = Array.isArray(r.curve) && r.curve.length > 0
      ? measuredCrossover(j, r.curve)
      : crossoverBatch(j, v, b);
    const crossLabel = Array.isArray(r.curve) && r.curve.length > 0 ? '交叉点实测在 ' : '交叉点推演约 ';
    const batchRatio = v / j;
    if (batchRatio < 1) {
      parts.push('攒批过境快 ' + (1 / batchRatio).toFixed(1) + ' 倍' +
        (cross ? '，' + crossLabel + Math.ceil(cross).toLocaleString('zh-CN') + ' 次——批量过了这条线，C++ 才开始挣钱' : ''));
      if (cls !== 'success') cls = 'success';
    } else {
      parts.push('攒批也赢不了（JIT 把 Java 循环编到了 ' + fmtNs(j) + '/次，C++ 没有纯计算优势）');
      cls = 'warn';
    }

    return { cls, text: parts.join('。') + '。' };
  }

  /**
   * 纳秒自适应格式化
   */
  function fmtNs(ns) {
    if (ns < 10) return (Math.round(ns * 100) / 100) + ' ns';
    if (ns < 1000) return (Math.round(ns * 10) / 10) + ' ns';
    if (ns < 1e6) return (Math.round(ns / 100) / 10) + ' µs';
    return (Math.round(ns / 1e4) / 100) + ' ms';
  }

  /**
   * 大数字分隔格式化：1234567 → 1,234,567
   */
  function fmtCount(n) {
    return Number(n).toLocaleString('zh-CN');
  }

  return {
    speedup,
    crossoverBatch,
    measuredCrossover,
    measuredCurve,
    verdict,
    fmtNs,
    fmtCount
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JniBoundaryLogic;
}

if (typeof window !== 'undefined') {
  window.JniBoundaryLogic = JniBoundaryLogic;
}
