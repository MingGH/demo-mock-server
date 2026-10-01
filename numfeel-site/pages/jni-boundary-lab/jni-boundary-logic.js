/**
 * JNI 边界收费站 - 核心逻辑
 * 模型：跨语言调用边界是一次"过路费"，C++ 的计算速度优势要先把过路费挣回来。
 */

const JniBoundaryLogic = (function () {

  function assertNs(v, name) {
    if (typeof v !== 'number' || Number.isNaN(v) || v <= 0) {
      throw new Error(name + ' 必须是 > 0 的数字');
    }
  }

  function assertSpeedup(v) {
    if (typeof v !== 'number' || Number.isNaN(v) || v < 1) {
      throw new Error('C++ 相对速度必须 >= 1');
    }
  }

  function assertBatchN(n) {
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('批量大小必须是 >= 1 的整数');
    }
  }

  /**
   * C++ 单次操作耗时 = Java 耗时 / 相对速度
   */
  function nativeOpNs(javaOpNs, cppSpeedup) {
    assertNs(javaOpNs, 'Java 单次操作耗时');
    assertSpeedup(cppSpeedup);
    return javaOpNs / cppSpeedup;
  }

  /**
   * Java 方案总耗时：循环在 JIT 里，没有边界概念，批量大小不影响它
   */
  function javaTotal(batchN, javaOpNs) {
    assertBatchN(batchN);
    assertNs(javaOpNs, 'Java 单次操作耗时');
    return batchN * javaOpNs;
  }

  /**
   * C++ 单次过境模式：每次操作都要交一次过路费
   */
  function nativePerCallTotal(batchN, nativeOpNs, boundaryNs) {
    assertBatchN(batchN);
    assertNs(nativeOpNs, 'C++ 单次操作耗时');
    assertNs(boundaryNs, '边界过路费');
    return batchN * (nativeOpNs + boundaryNs);
  }

  /**
   * C++ 批量过境模式：攒 batchN 次操作，只交一次过路费
   */
  function nativeBatchTotal(batchN, nativeOpNs, boundaryNs) {
    assertBatchN(batchN);
    assertNs(nativeOpNs, 'C++ 单次操作耗时');
    assertNs(boundaryNs, '边界过路费');
    return boundaryNs + batchN * nativeOpNs;
  }

  /**
   * 批量过境模式反超 Java 所需的最小批量：
   *   b + N*v < N*j  =>  N > b / (j - v)
   * j <= v（C++ 不比 JIT 后的 Java 快）时永远反超不了，返回 null
   */
  function crossoverBatch(javaOpNs, nativeOpNs, boundaryNs) {
    assertNs(javaOpNs, 'Java 单次操作耗时');
    assertNs(nativeOpNs, 'C++ 单次操作耗时');
    assertNs(boundaryNs, '边界过路费');
    if (nativeOpNs >= javaOpNs) return null;
    return boundaryNs / (javaOpNs - nativeOpNs);
  }

  /**
   * 实际加速比 = Java 总耗时 / C++ 总耗时
   */
  function speedup(javaTotalNs, otherTotalNs) {
    if (typeof javaTotalNs !== 'number' || javaTotalNs <= 0 ||
        typeof otherTotalNs !== 'number' || otherTotalNs <= 0) {
      throw new Error('总耗时必须是 > 0 的数字');
    }
    return javaTotalNs / otherTotalNs;
  }

  /**
   * 过路费占总耗时的比例
   * mode: 'perCall' 每次操作都过境；'batch' 攒批过境
   */
  function boundaryShare(batchN, nativeOpNs, boundaryNs, mode) {
    assertBatchN(batchN);
    assertNs(nativeOpNs, 'C++ 单次操作耗时');
    assertNs(boundaryNs, '边界过路费');
    if (mode !== 'perCall' && mode !== 'batch') {
      throw new Error("mode 必须是 'perCall' 或 'batch'");
    }
    const total = mode === 'perCall'
      ? nativePerCallTotal(batchN, nativeOpNs, boundaryNs)
      : nativeBatchTotal(batchN, nativeOpNs, boundaryNs);
    const toll = mode === 'perCall' ? batchN * boundaryNs : boundaryNs;
    return toll / total;
  }

  /**
   * 均摊到每次操作的耗时
   */
  function amortizedPerOp(totalNs, batchN) {
    if (typeof totalNs !== 'number' || totalNs <= 0) {
      throw new Error('总耗时必须是 > 0 的数字');
    }
    assertBatchN(batchN);
    return totalNs / batchN;
  }

  /**
   * 把批量从 prev 提到 curr，均摊耗时降了多少
   */
  function marginalGain(javaOpNs, nativeOpNs, boundaryNs, prev, curr) {
    assertBatchN(prev);
    assertBatchN(curr);
    const a = amortizedPerOp(nativeBatchTotal(prev, nativeOpNs, boundaryNs), prev);
    const b = amortizedPerOp(nativeBatchTotal(curr, nativeOpNs, boundaryNs), curr);
    return a - b;
  }

  /**
   * 画曲线用：对数取样的批量点，Java 与 C++ 批量模式的均摊耗时
   */
  function amortizedCurve(javaOpNs, nativeOpNs, boundaryNs, maxBatch) {
    assertNs(javaOpNs, 'Java 单次操作耗时');
    assertNs(nativeOpNs, 'C++ 单次操作耗时');
    assertNs(boundaryNs, '边界过路费');
    if (!Number.isInteger(maxBatch) || maxBatch < 1) {
      throw new Error('最大批量必须是 >= 1 的整数');
    }
    const steps = 41;
    const logMax = Math.log10(maxBatch);
    const batchSizes = [];
    const javaPerOp = [];
    const nativePerOp = [];
    for (let i = 0; i < steps; i++) {
      const n = Math.max(1, Math.round(Math.pow(10, (logMax * i) / (steps - 1))));
      if (batchSizes.length > 0 && n === batchSizes[batchSizes.length - 1]) continue;
      batchSizes.push(n);
      javaPerOp.push(javaOpNs);
      nativePerOp.push(amortizedPerOp(nativeBatchTotal(n, nativeOpNs, boundaryNs), n));
    }
    return { batchSizes, javaPerOp, nativePerOp };
  }

  return {
    nativeOpNs,
    javaTotal,
    nativePerCallTotal,
    nativeBatchTotal,
    crossoverBatch,
    speedup,
    boundaryShare,
    amortizedPerOp,
    marginalGain,
    amortizedCurve
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JniBoundaryLogic;
}

if (typeof window !== 'undefined') {
  window.JniBoundaryLogic = JniBoundaryLogic;
}
