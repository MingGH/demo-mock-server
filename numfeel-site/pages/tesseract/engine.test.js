/**
 * engine.js 单元测试（Node 直接运行，无测试框架）
 * 运行：node pages/tesseract/engine.test.js
 */

var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log('\u2705 ' + msg);
    passed++;
  } else {
    console.error('\u274C ' + msg);
    failed++;
  }
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + '（实际 ' + actual + '，期望 ' + expected + '±' + tol + '）');
}

function approxEq(a, b, tol) {
  return Math.abs(a - b) <= (tol || 1e-9);
}

// ── 1. 超立方体组合结构 ──────────────────────────────────────────────
var verts = engine.buildHypercubeVertices();
var edges = engine.buildHypercubeEdges();

assert(verts.length === 16, '顶点数为 16');
assert(edges.length === 32, '边数为 32');

var seen = {};
var allBinary = true;
for (var v = 0; v < verts.length; v++) {
  var key = verts[v].join(',');
  if (seen[key]) { allBinary = false; break; }
  seen[key] = true;
  for (var c = 0; c < 4; c++) {
    if (verts[v][c] !== 1 && verts[v][c] !== -1) { allBinary = false; }
  }
}
assert(allBinary, '所有顶点是互不相同的 ±1 组合');

var degree = {};
var validPairs = true;
for (var e = 0; e < edges.length; e++) {
  var a = edges[e][0];
  var b = edges[e][1];
  var diff = 0;
  for (var k = 0; k < 4; k++) {
    if (verts[a][k] !== verts[b][k]) { diff++; }
  }
  if (diff !== 1) { validPairs = false; }
  degree[a] = (degree[a] || 0) + 1;
  degree[b] = (degree[b] || 0) + 1;
}
assert(validPairs, '每条边连接恰好差一个坐标的顶点对');
var allDegree4 = true;
for (var dKey in degree) {
  if (degree[dKey] !== 4) { allDegree4 = false; }
}
assert(allDegree4 && Object.keys(degree).length === 16, '每个顶点度数都是 4');

// ── 2. 旋转矩阵性质 ────────────────────────────────────────────────
var R = engine.rotPlane4(0, 3, Math.PI / 5);
var RtR = engine.matMul4(R, transpose(R));
var isOrthogonal = true;
for (var r = 0; r < 16; r++) {
  var expect = (Math.floor(r / 4) === r % 4) ? 1 : 0;
  if (!approxEq(RtR[r], expect, 1e-9)) { isOrthogonal = false; }
}
assert(isOrthogonal, 'XW 平面旋转矩阵正交：R·Rᵀ = I');

var detR = R[0] * (R[5] * (R[10] * R[15] - R[11] * R[14]) - R[6] * (R[9] * R[15] - R[11] * R[13]) + R[7] * (R[9] * R[14] - R[10] * R[13]))
         - R[1] * (R[4] * (R[10] * R[15] - R[11] * R[14]) - R[6] * (R[8] * R[15] - R[11] * R[12]) + R[7] * (R[8] * R[14] - R[10] * R[12]))
         + R[2] * (R[4] * (R[9] * R[15] - R[11] * R[13]) - R[5] * (R[8] * R[15] - R[11] * R[12]) + R[7] * (R[8] * R[13] - R[9] * R[12]))
         - R[3] * (R[4] * (R[9] * R[14] - R[10] * R[13]) - R[5] * (R[8] * R[14] - R[10] * R[12]) + R[6] * (R[8] * R[13] - R[9] * R[12]));
assertClose(detR, 1, 1e-9, '旋转矩阵行列式为 +1');

var I = engine.identity4();
var v0 = [0.3, -0.7, 1.2, 0.5];
var Iv = engine.matVec4(I, v0);
assert(approxEq(Iv[0], v0[0]) && approxEq(Iv[3], v0[3]), '单位矩阵不改变向量');

var rot90 = engine.rotPlane4(0, 3, Math.PI / 2);
var rotatedVec = engine.matVec4(rot90, [1, 0, 0, 0]);
assert(approxEq(rotatedVec[0], 0, 1e-9) && approxEq(rotatedVec[3], 1, 1e-9), 'XW 平面旋转 90° 把 x 方向转到 w 方向');

var combo = engine.composeRotations([
  { i: 0, j: 3, a: 0.3 },
  { i: 1, j: 3, a: -0.4 },
  { i: 2, j: 3, a: 0 }
]);
var comboCheck = engine.matMul4(engine.rotPlane4(1, 3, -0.4), engine.rotPlane4(0, 3, 0.3));
var comboSame = true;
for (var mIdx = 0; mIdx < 16; mIdx++) {
  if (!approxEq(combo[mIdx], comboCheck[mIdx], 1e-9)) { comboSame = false; }
}
assert(comboSame, 'composeRotations 跳过零角度并按顺序左乘');

// ── 3. 透视投影 ───────────────────────────────────────────────────
var pCenter = engine.projectTo3D([1, 2, 3, 0], 3);
assertClose(pCenter.scale, 1, 1e-9, 'w=0 的点投影缩放为 1');
var pNear = engine.projectTo3D([1, 0, 0, 1], 3);
assertClose(pNear.scale, 1.5, 1e-9, 'w=1、d=3 时缩放 1.5');
assertClose(pNear.x, 1.5, 1e-9, '投影后坐标按缩放放大');
var pFar = engine.projectTo3D([1, 0, 0, -1], 3);
assert(pFar.scale < 1, 'w 为负（远处）时投出更小');

// ── 4. 超立方体切片 ───────────────────────────────────────────────
var stillVerts = verts;

var sliceAt0 = engine.sliceTesseract(stillVerts, 0);
assert(sliceAt0.length === 8, '静止超立方体在 w=0 处切出 8 个点');
var allCubeCorners = true;
for (var s = 0; s < sliceAt0.length; s++) {
  for (var sc = 0; sc < 3; sc++) {
    if (!approxEq(Math.abs(sliceAt0[s][sc]), 1)) { allCubeCorners = false; }
  }
}
assert(allCubeCorners, '静止 w=0 截面的 8 个点恰好是单位立方体顶角');

var sliceHalf = engine.sliceTesseract(stillVerts, 0.5);
assert(sliceHalf.length === 8, '静止超立方体在 w=0.5 处仍是 8 个点');
assert(engine.sliceTesseract(stillVerts, 1.2).length === 0, '超出范围（|w|>1）切不到任何东西');

var spunVerts = new Array(16);
for (var sv = 0; sv < 16; sv++) {
  spunVerts[sv] = engine.matVec4(rot90, verts[sv]);
}
var sliceSpun = engine.sliceTesseract(spunVerts, 0);
assert(sliceSpun.length === 8, 'XW 转 90° 后 w=0 截面顶点数不变（对称自映射）');
var finiteAll = true;
for (var fs = 0; fs < sliceSpun.length; fs++) {
  for (var fc = 0; fc < 3; fc++) {
    if (!isFinite(sliceSpun[fs][fc])) { finiteAll = false; }
  }
}
assert(finiteAll, '旋转后截面坐标全部有限');

var tilted = engine.composeRotations([
  { i: 0, j: 3, a: Math.PI / 4 },
  { i: 1, j: 3, a: Math.PI / 6 }
]);
var tiltedVerts = new Array(16);
for (var tv = 0; tv < 16; tv++) {
  tiltedVerts[tv] = engine.matVec4(tilted, verts[tv]);
}
var sliceTilted = engine.sliceTesseract(tiltedVerts, 0);
assert(sliceTilted.length >= 8 && sliceTilted.length <= 24, '倾斜双旋后截面顶点数在合理范围内（实际 ' + sliceTilted.length + '）');
assert(sliceTilted.length > 8, '倾斜旋转让截面变出超过 8 个顶点的怪形状（实际 ' + sliceTilted.length + '）');

// ── 5. 二维凸包 ───────────────────────────────────────────────────
var square = [[1, -1], [-1, -1], [-1, 1], [1, 1]];
var hullSquare = engine.convexHull2D(square);
assert(hullSquare.length === 4, '正方形凸包有 4 个顶点');

var withInner = [[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [0.5, 0.5]];
assert(engine.convexHull2D(withInner).length === 4, '内部点和共线点被排除');

var dup = [[0, 0], [0, 0], [1, 0], [0, 1]];
var hullDup = engine.convexHull2D(dup);
assert(hullDup.length === 3, '重复点被去重');

// 凸包方向：逆时针 → 相邻边叉积全为正
var hexagonPts = [];
for (var h = 0; h < 6; h++) {
  hexagonPts.push([Math.cos(h), Math.sin(h)]);
}
var hullHex = engine.convexHull2D(hexagonPts);
var ccw = true;
for (var hh = 0; hh < hullHex.length; hh++) {
  var o = hullHex[hh];
  var p1 = hullHex[(hh + 1) % hullHex.length];
  var p2 = hullHex[(hh + 2) % hullHex.length];
  if ((p1[0] - o[0]) * (p2[1] - o[1]) - (p1[1] - o[1]) * (p2[0] - o[0]) <= 0) { ccw = false; }
}
assert(ccw && hullHex.length === 6, '不规则六边形凸包为逆时针且完整');

// ── 6. 立方体二维截面（平面国左侧） ─────────────────────────────────
function cubeCorners() {
  var out = [];
  for (var ci = 0; ci < 8; ci++) {
    out.push([(ci & 1) ? 1 : -1, (ci & 2) ? 1 : -1, (ci & 4) ? 1 : -1]);
  }
  return out;
}

var polyFlat = engine.sliceCubeZ(cubeCorners(), 0);
assert(polyFlat.length === 4, '水平切的立方体截面是四边形');

var ca = Math.cos(Math.PI / 6);
var sa = Math.sin(Math.PI / 6);
var cb = Math.cos(Math.PI / 6);
var sb = Math.sin(Math.PI / 6);
var tiltedCube = cubeCorners().map(function (p) {
  var y1 = ca * p[1] - sa * p[2];
  var z1 = sa * p[1] + ca * p[2];
  return [cb * p[0] + sb * z1, y1, -sb * p[0] + cb * z1];
});
var polyHex = engine.sliceCubeZ(tiltedCube, 0);
assert(polyHex.length === 6, '绕两轴各倾 30° 的立方体中切出六边形（经典结论）');
assert(engine.sliceCubeZ(cubeCorners(), 0.999).length === 4, '贴边切仍是小四边形');

assert(engine.sliceCubeZ(cubeCorners(), 5).length === 0, '切在物体外面返回空');

// ── 7. 文案与预设 ─────────────────────────────────────────────────
assert(engine.describeSlice(0).indexOf('外面') !== -1, 'describeSlice 空截面文案');
assert(engine.describeSlice(10).indexOf('怪异') !== -1, 'describeSlice 高顶点数文案');
assert(engine.TESS_PRESETS.length === 4, '提供 4 个预设场景');
var presetOk = true;
for (var pp = 0; pp < engine.TESS_PRESETS.length; pp++) {
  var preset = engine.TESS_PRESETS[pp];
  if (!preset.id || typeof preset.speeds.xw !== 'number') { presetOk = false; }
}
assert(presetOk, '预设都带 id 和转速参数');

console.log('\n==============================');
console.log('passed: ' + passed + '  failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);

/** 矩阵转置（测试辅助） */
function transpose(m) {
  var t = new Array(16);
  for (var tr = 0; tr < 4; tr++) {
    for (var tc = 0; tc < 4; tc++) {
      t[tr * 4 + tc] = m[tc * 4 + tr];
    }
  }
  return t;
}
