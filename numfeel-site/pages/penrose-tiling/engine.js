/**
 * Penrose Tiling Engine (P3 菱形版)
 *
 * 基于 apaleyes/penrose-tiling 的经验证算法移植。
 * 使用 4 种 Robinson 半三角形（区分左右镜像），每种有独立的 split 规则。
 * 绘制时只画外边（不画配对三角形的共享底边），自然形成完整菱形。
 *
 * 三角形类型:
 *   'TL' = Thick Left (胖菱形左半)
 *   'TR' = Thick Right (胖菱形右半)
 *   'tL' = Thin Left (瘦菱形左半)
 *   'tR' = Thin Right (瘦菱形右半)
 *
 * 每个三角形: { type, v1:[x,y], v2:[x,y], v3:[x,y] }
 *   绘制时画 v1→v2 和 v1→v3 两条边（外边），不画 v2→v3（共享底边）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PenroseEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PHI = (1 + Math.sqrt(5)) / 2;
  var GOLDEN_RATIO = 1 / PHI; // ≈ 0.618

  // ─── 向量工具 ───
  function vec(x, y) { return [x, y]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s]; }
  function lerp(a, b, t) { return add(a, mul(sub(b, a), t)); }

  // ─── 细分规则 ───

  function splitThickLeft(v1, v2, v3) {
    // ThickLeft(v1, v2, v3):
    //   split_32 = v3 + (v2-v3)*φ⁻¹
    //   split_31 = v3 + (v1-v3)*φ⁻¹
    //   → ThickRight(split_31, split_32, v3)
    //   → ThinRight(split_32, split_31, v1)
    //   → ThickLeft(split_32, v1, v2)
    var split_32 = lerp(v3, v2, GOLDEN_RATIO);
    var split_31 = lerp(v3, v1, GOLDEN_RATIO);
    return [
      { type: 'TR', v1: split_31, v2: split_32, v3: v3 },
      { type: 'tR', v1: split_32, v2: split_31, v3: v1 },
      { type: 'TL', v1: split_32, v2: v1, v3: v2 }
    ];
  }

  function splitThickRight(v1, v2, v3) {
    // ThickRight(v1, v2, v3):
    //   split_21 = v2 + (v1-v2)*φ⁻¹
    //   split_23 = v2 + (v3-v2)*φ⁻¹
    //   → ThickRight(split_23, v3, v1)
    //   → ThinLeft(split_23, v1, split_21)
    //   → ThickLeft(split_21, v2, split_23)
    var split_21 = lerp(v2, v1, GOLDEN_RATIO);
    var split_23 = lerp(v2, v3, GOLDEN_RATIO);
    return [
      { type: 'TR', v1: split_23, v2: v3, v3: v1 },
      { type: 'tL', v1: split_23, v2: v1, v3: split_21 },
      { type: 'TL', v1: split_21, v2: v2, v3: split_23 }
    ];
  }

  function splitThinLeft(v1, v2, v3) {
    // ThinLeft(v1, v2, v3):
    //   split_13 = v1 + (v3-v1)*φ⁻¹
    //   → ThinLeft(v2, v3, split_13)
    //   → ThickLeft(split_13, v1, v2)
    var split_13 = lerp(v1, v3, GOLDEN_RATIO);
    return [
      { type: 'tL', v1: v2, v2: v3, v3: split_13 },
      { type: 'TL', v1: split_13, v2: v1, v3: v2 }
    ];
  }

  function splitThinRight(v1, v2, v3) {
    // ThinRight(v1, v2, v3):
    //   split_12 = v1 + (v2-v1)*φ⁻¹
    //   → ThinRight(v3, split_12, v2)
    //   → ThickRight(split_12, v3, v1)
    var split_12 = lerp(v1, v2, GOLDEN_RATIO);
    return [
      { type: 'tR', v1: v3, v2: split_12, v3: v2 },
      { type: 'TR', v1: split_12, v2: v3, v3: v1 }
    ];
  }

  // ─── 膨胀 ───
  function inflateOnce(triangles) {
    var result = [];
    for (var i = 0; i < triangles.length; i++) {
      var t = triangles[i];
      var children;
      switch (t.type) {
        case 'TL': children = splitThickLeft(t.v1, t.v2, t.v3); break;
        case 'TR': children = splitThickRight(t.v1, t.v2, t.v3); break;
        case 'tL': children = splitThinLeft(t.v1, t.v2, t.v3); break;
        case 'tR': children = splitThinRight(t.v1, t.v2, t.v3); break;
      }
      for (var j = 0; j < children.length; j++) {
        result.push(children[j]);
      }
    }
    return result;
  }

  function subdivide(triangles, depth) {
    var current = triangles;
    for (var i = 0; i < depth; i++) {
      current = inflateOnce(current);
    }
    return current;
  }

  // ─── 初始图案 ───

  /**
   * 太阳轮（Sun）: 10 个 Thin 三角形组成圆形（和维基百科图一样）
   */
  function createSun(cx, cy, radius) {
    var triangles = [];
    var step = 36 * Math.PI / 180; // 36°
    var center = [cx, cy];
    for (var i = 0; i < 10; i++) {
      var v1 = add(center, mul([Math.cos(step * i), Math.sin(step * i)], radius));
      var v2 = add(center, mul([Math.cos(step * (i + 1)), Math.sin(step * (i + 1))], radius));
      if (i % 2 === 0) {
        triangles.push({ type: 'tR', v1: center, v2: v2, v3: v1 });
      } else {
        triangles.push({ type: 'tL', v1: center, v2: v2, v3: v1 });
      }
    }
    return triangles;
  }

  /**
   * 五角星（Star）: 从单个胖菱形开始
   */
  function createRhombus(cx, cy, side) {
    var ratio = Math.sin(36 * Math.PI / 180) / Math.sin(54 * Math.PI / 180);
    var t1 = { type: 'TR', v1: [cx, cy - side / 2], v2: [cx + side / 2, cy - side / 2 + side / 2 * ratio], v3: [cx - side / 2, cy - side / 2 + side / 2 * ratio] };
    var t2 = { type: 'TL', v1: [cx, cy - side / 2 + side * ratio], v2: [cx - side / 2, cy - side / 2 + side / 2 * ratio], v3: [cx + side / 2, cy - side / 2 + side / 2 * ratio] };
    return [t1, t2];
  }

  // ─── 辅助 ───
  function isThick(t) { return t.type === 'TL' || t.type === 'TR'; }
  function isThin(t) { return t.type === 'tL' || t.type === 'tR'; }

  return {
    goldenRatio: PHI,
    psi: GOLDEN_RATIO,
    createSun: createSun,
    createRhombus: createRhombus,
    createSunWheel: createSun,
    createStarWheel: createSun,
    inflateOnce: inflateOnce,
    subdivideOnce: inflateOnce,
    subdivide: subdivide,
    isThick: isThick,
    isThin: isThin
  };
});
