/**
 * engine.js — 四维空间解剖台：超立方体的纯数学核心
 *
 * 本文件不接触任何 DOM / three.js，全部是纯函数，
 * 便于在 Node 中独立单元测试（见 engine.test.js）。
 *
 * 约定：
 *   - 四维向量用长度为 4 的数组 [x, y, z, w] 表示；
 *   - 4×4 矩阵用长度为 16 的行主序数组表示，v' = M · v（列向量约定）；
 *   - 超立方体 = {±1}^4 的 16 个顶点，边连接恰有一个坐标不同的顶点对。
 */

/** @returns {Array<Array<number>>} 超立方体 16 个顶点 */
function buildHypercubeVertices() {
  var verts = [];
  for (var i = 0; i < 16; i++) {
    verts.push([
      (i & 1) ? 1 : -1,
      (i & 2) ? 1 : -1,
      (i & 4) ? 1 : -1,
      (i & 8) ? 1 : -1
    ]);
  }
  return verts;
}

/**
 * 超立方体的 32 条边：连接恰好在一个坐标上不同的顶点对。
 * @returns {Array<Array<number>>} 形如 [i, j] 的顶点下标对
 */
function buildHypercubeEdges() {
  var edges = [];
  for (var i = 0; i < 16; i++) {
    for (var bit = 0; bit < 4; bit++) {
      var j = i ^ (1 << bit);
      if (j > i) {
        edges.push([i, j]);
      }
    }
  }
  return edges;
}

/** @returns {Array<number>} 4×4 单位矩阵（行主序） */
function identity4() {
  return [1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1];
}

/**
 * 构造坐标平面 (axisI, axisJ) 上的旋转矩阵。
 * 四维空间里旋转绕的是"平面"而不是轴——这正是三维直觉失效的第一个地方。
 *
 * @param {number} axisI 平面第一个坐标轴下标（0..3）
 * @param {number} axisJ 平面第二个坐标轴下标（0..3）
 * @param {number} angle 旋转弧度
 * @returns {Array<number>} 4×4 行主序旋转矩阵
 */
function rotPlane4(axisI, axisJ, angle) {
  var m = identity4();
  var c = Math.cos(angle);
  var s = Math.sin(angle);
  m[axisI * 4 + axisI] = c;
  m[axisI * 4 + axisJ] = -s;
  m[axisJ * 4 + axisI] = s;
  m[axisJ * 4 + axisJ] = c;
  return m;
}

/**
 * 4×4 矩阵相乘 a·b。
 * @param {Array<number>} a 左矩阵
 * @param {Array<number>} b 右矩阵
 * @returns {Array<number>} 结果矩阵
 */
function matMul4(a, b) {
  var out = new Array(16);
  for (var r = 0; r < 4; r++) {
    for (var cIdx = 0; cIdx < 4; cIdx++) {
      var sum = 0;
      for (var k = 0; k < 4; k++) {
        sum += a[r * 4 + k] * b[k * 4 + cIdx];
      }
      out[r * 4 + cIdx] = sum;
    }
  }
  return out;
}

/**
 * 矩阵作用于向量 v' = M · v。
 * @param {Array<number>} m 4×4 矩阵
 * @param {Array<number>} v 四维向量
 * @returns {Array<number>} 变换后的四维向量
 */
function matVec4(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3] * v[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7] * v[3],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11] * v[3],
    m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15] * v[3]
  ];
}

/**
 * 把若干平面旋转按顺序复合成一个矩阵。
 * @param {Array<{i:number, j:number, a:number}>} planes 依次应用的平面旋转
 * @returns {Array<number>} 复合后的 4×4 矩阵
 */
function composeRotations(planes) {
  var m = identity4();
  for (var p = 0; p < planes.length; p++) {
    if (!planes[p] || planes[p].a === 0) {
      continue;
    }
    m = matMul4(rotPlane4(planes[p].i, planes[p].j, planes[p].a), m);
  }
  return m;
}

/**
 * 4D → 3D 透视投影：从 (0,0,0,d) 处的"相机"看向 w=0 超平面。
 * scale = d / (d − w)：w 越大离相机越近，投出来越大。
 *
 * @param {Array<number>} v4 四维向量
 * @param {number} camDistance 相机到 w=0 超平面的距离（> 2 才安全）
 * @returns {{x:number, y:number, z:number, w:number, scale:number}}
 */
function projectTo3D(v4, camDistance) {
  var scale = camDistance / (camDistance - v4[3]);
  return {
    x: v4[0] * scale,
    y: v4[1] * scale,
    z: v4[2] * scale,
    w: v4[3],
    scale: scale
  };
}

/**
 * 用超平面 w = wPlane 切超立方体，返回截面顶点（三维坐标）。
 * 做法：逐条边求与平面的交点，去重。凸包/多面体重建交给渲染层。
 *
 * @param {Array<Array<number>>} rotatedVerts 已旋转的 16 个四维顶点
 * @param {number} wPlane 切片位置 t
 * @returns {Array<Array<number>>} 截面顶点 [x, y, z]（已去重）
 */
function sliceTesseract(rotatedVerts, wPlane) {
  var edges = buildHypercubeEdges();
  var eps = 1e-9;
  var seen = {};
  var pts = [];

  function pushPoint(x, y, z) {
    var key = Math.round(x * 1e6) + ',' + Math.round(y * 1e6) + ',' + Math.round(z * 1e6);
    if (!seen[key]) {
      seen[key] = true;
      pts.push([x, y, z]);
    }
  }

  for (var e = 0; e < edges.length; e++) {
    var va = rotatedVerts[edges[e][0]];
    var vb = rotatedVerts[edges[e][1]];
    var da = va[3] - wPlane;
    var db = vb[3] - wPlane;
    if (Math.abs(da) < eps) {
      pushPoint(va[0], va[1], va[2]);
    }
    if (Math.abs(db) < eps) {
      pushPoint(vb[0], vb[1], vb[2]);
    }
    if (da * db < 0) {
      var s = da / (da - db);
      pushPoint(
        va[0] + s * (vb[0] - va[0]),
        va[1] + s * (vb[1] - va[1]),
        va[2] + s * (vb[2] - va[2])
      );
    }
  }
  return pts;
}

/**
 * 二维凸包（Andrew 单调链）。用于把切片投影画成实心多边形。
 * 输入点会被先做字典序去重；共线点不会出现在结果中。
 *
 * @param {Array<Array<number>>} points 二维点 [[x,y], ...]
 * @returns {Array<Array<number>>} 逆时针顺序的凸包顶点
 */
function convexHull2D(points) {
  if (!points || points.length < 3) {
    return (points || []).slice();
  }
  var pts = points.slice().sort(function (p, q) {
    return p[0] === q[0] ? p[1] - q[1] : p[0] - q[0];
  });
  var deduped = [pts[0]];
  for (var i = 1; i < pts.length; i++) {
    if (pts[i][0] !== pts[i - 1][0] || pts[i][1] !== pts[i - 1][1]) {
      deduped.push(pts[i]);
    }
  }
  if (deduped.length < 3) {
    return deduped.slice();
  }

  function cross(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  var lower = [];
  for (var l = 0; l < deduped.length; l++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], deduped[l]) <= 0) {
      lower.pop();
    }
    lower.push(deduped[l]);
  }
  var upper = [];
  for (var u = deduped.length - 1; u >= 0; u--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], deduped[u]) <= 0) {
      upper.pop();
    }
    upper.push(deduped[u]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * 用 z = zPlane 的平面切一个三维立方体（用于「平面国」对照的左侧面板）。
 * 返回截面多边形顶点（二维 [x, y]，已按凸包排序）。
 *
 * @param {Array<Array<number>>} cubeVerts3 8 个已旋转的三维顶点 [x, y, z]
 * @param {number} zPlane 切片高度
 * @returns {Array<Array<number>>} 截面多边形顶点（逆时针）
 */
function sliceCubeZ(cubeVerts3, zPlane) {
  var edges = [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
    [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
  ];
  var eps = 1e-9;
  var pts = [];
  for (var e = 0; e < edges.length; e++) {
    var a = cubeVerts3[edges[e][0]];
    var b = cubeVerts3[edges[e][1]];
    var da = a[2] - zPlane;
    var db = b[2] - zPlane;
    if (Math.abs(da) < eps) {
      pts.push([a[0], a[1]]);
    } else if (Math.abs(db) < eps) {
      pts.push([b[0], b[1]]);
    } else if (da * db < 0) {
      var s = da / (da - db);
      pts.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
    }
  }
  return convexHull2D(pts);
}

/**
 * 给截面顶点数配一句说明文案。
 * @param {number} n 截面顶点数
 * @returns {string} 说明文字
 */
function describeSlice(n) {
  if (n === 0) {
    return '切片在物体外面——什么都没切到';
  }
  if (n === 4) {
    return '四边形截面';
  }
  if (n === 6) {
    return '六边形截面';
  }
  if (n === 8) {
    return '八个顶点的截面——静止时它就是一个立方体';
  }
  if (n > 8) {
    return n + ' 个顶点的怪异截面——旋转后才见得到的形状';
  }
  return n + ' 个顶点的截面';
}

/** 预设场景：给「打开即玩」准备的一键体验组合 */
var TESS_PRESETS = [
  {
    id: 'classic',
    name: '经典双旋',
    icon: 'ti-refresh-dot',
    desc: 'XW + YW 缓慢旋转，最像"活过来"的样子',
    angles: { xw: 0.15, yw: 0, zw: 0 },
    speeds: { xw: 0.35, yw: 0.22, zw: 0 },
    camDistance: 3,
    sliceAuto: false
  },
  {
    id: 'still',
    name: '静止正视',
    icon: 'ti-cube',
    desc: '关掉全部旋转，看它的标准证件照',
    angles: { xw: 0, yw: 0, zw: 0 },
    speeds: { xw: 0, yw: 0, zw: 0 },
    camDistance: 3,
    sliceAuto: false
  },
  {
    id: 'tornado',
    name: '龙卷风',
    icon: 'ti-tornado',
    desc: '三个旋转平面同时开动',
    angles: { xw: 0.3, yw: 0.3, zw: 0.3 },
    speeds: { xw: 0.5, yw: 0.37, zw: 0.21 },
    camDistance: 3.6,
    sliceAuto: false
  },
  {
    id: 'ghost',
    name: '穿越切片',
    icon: 'ti-arrows-vertical',
    desc: '让超立方体慢慢穿过我们的空间',
    angles: { xw: 0.35, yw: 0.25, zw: 0 },
    speeds: { xw: 0.18, yw: 0.13, zw: 0 },
    camDistance: 3,
    sliceAuto: true
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildHypercubeVertices: buildHypercubeVertices,
    buildHypercubeEdges: buildHypercubeEdges,
    identity4: identity4,
    rotPlane4: rotPlane4,
    matMul4: matMul4,
    matVec4: matVec4,
    composeRotations: composeRotations,
    projectTo3D: projectTo3D,
    sliceTesseract: sliceTesseract,
    convexHull2D: convexHull2D,
    sliceCubeZ: sliceCubeZ,
    describeSlice: describeSlice,
    TESS_PRESETS: TESS_PRESETS
  };
}
