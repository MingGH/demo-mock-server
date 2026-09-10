/**
 * app.js — 四维空间解剖台：渲染与交互
 *
 * 结构：
 *   1. 投影间   —— three.js 实时渲染超立方体的 4D→3D 投影影子
 *   2. 切片台   —— 超平面 w=t 与超立方体求交，重建截面多面体
 *   3. 平面国   —— 立方体穿过平面 vs 超立方体穿过空间的同构对照（纯 2D canvas）
 *
 * 数学全部在 engine.js（纯函数）；本文件只做 DOM、事件与渲染。
 */
(function (global) {
  'use strict';

  var hasThree = typeof global.THREE !== 'undefined';
  // 浏览器：engine.js 的顶层函数直接挂在全局；Node 冒烟测试走 require
  var E = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js')
    : global;
  if (!E || typeof E.buildHypercubeVertices !== 'function') {
    return;
  }

  // ── 埋点（NFTrack，见 components/track.js）─────────────────────────
  // 事件清单：
  //   session_start        → 会话开始（sessionStarted 标志位保证只记一次）
  //   apply_preset         → 应用某个预设场景
  //   toggle_slice         → 打开/关闭截面实体
  //   toggle_auto_slice    → 自动往返切割开关
  //   slice_first_drag     → 第一次手动拖动切片（里程碑）
  //   session_end          → 离页（pagehide, force）
  function nfTrack(name, props, opts) {
    try {
      if (global.NFTrack && typeof global.NFTrack.track === 'function') {
        global.NFTrack.track(name, props, opts);
      }
    } catch (e) {}
  }
  var sessionStarted = false;
  function trackSessionStart() {
    if (sessionStarted) { return; }
    sessionStarted = true;
    nfTrack('session_start', { page: 'tesseract' });
  }
  global.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });

  // ── 状态 ───────────────────────────────────────────────────────────
  var prefersReducedMotion = false;
  try {
    prefersReducedMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  var state = {
    angles: { xw: 0.15, yw: 0, zw: 0 },
    speeds: prefersReducedMotion ? { xw: 0, yw: 0, zw: 0 } : { xw: 0.35, yw: 0.22, zw: 0 },
    camDistance: 3,
    wSlice: 0.35,
    sliceVisible: true,
    sliceAuto: false,
    crossValue: 0.4,
    time: 0
  };

  var baseVerts = E.buildHypercubeVertices();
  var baseEdges = E.buildHypercubeEdges();
  var rotatedVerts = new Array(baseVerts.length);

  function $(id) {
    return document.getElementById(id);
  }

  // ── 高分屏 canvas 尺寸 ─────────────────────────────────────────────
  /** 设置画布物理像素尺寸（WebGL / 2D 通用，不取 context） */
  function sizeCanvasElement(canvas) {
    var ratio = (global.devicePixelRatio || 1);
    var rect = (typeof canvas.getBoundingClientRect === 'function') ? canvas.getBoundingClientRect() : null;
    var w = Math.max(50, Math.floor((rect && rect.width) || canvas.clientWidth || 300));
    var h = Math.max(50, Math.floor((rect && rect.height) || canvas.clientHeight || 260));
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    return { w: w, h: h };
  }

  /** 仅用于 2D 画布：设置尺寸并返回已应用缩放的 context（WebGL 画布上 getContext('2d') 会返回 null） */
  function fitCanvas(canvas) {
    var s = sizeCanvasElement(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(global.devicePixelRatio || 1, 0, 0, global.devicePixelRatio || 1, 0, 0);
    return { ctx: ctx, w: s.w, h: s.h };
  }

  // ══ 第 1 节：投影间 ═════════════════════════════════════════════════
  var renderer = null;
  var scene = null;
  var camera = null;
  var controls = null;
  var edgeGeom = null;
  var edgeLines = null;
  var pointGeom = null;
  var pointCloud = null;

  // 切片台独立的迷你场景：只渲染截面多面体
  var sRenderer = null;
  var sScene = null;
  var sCamera = null;
  var sliceControls = null;
  var sliceMesh = null;
  var sliceEdges = null;

  var COLOR_FAR = hasThree ? new THREE.Color(0x5c6bc0) : null;
  var COLOR_NEAR = hasThree ? new THREE.Color(0xffd700) : null;
  var tmpColor = hasThree ? new THREE.Color() : null;

  function initScene() {
    if (!hasThree) {
      var frame = $('tessCanvas');
      if (frame && frame.parentNode) {
        frame.parentNode.innerHTML = '<div class="webgl-missing">三维库加载失败，请检查网络后刷新。页面其余部分不受影响。</div>';
      }
      return;
    }
    var canvas = $('tessCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
    camera.position.set(0, 0.8, 4.6);
    camera.lookAt(0, 0, 0);

    if (typeof THREE.OrbitControls === 'function') {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 2.5;
      controls.maxDistance = 12;
    }

    edgeGeom = new THREE.BufferGeometry();
    var posArr = new Float32Array(baseEdges.length * 2 * 3);
    var colArr = new Float32Array(baseEdges.length * 2 * 3);
    edgeGeom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    edgeGeom.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    edgeLines = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    scene.add(edgeLines);

    pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(baseVerts.length * 3), 3));
    pointGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(baseVerts.length * 3), 3));
    pointCloud = new THREE.Points(pointGeom, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, sizeAttenuation: true }));
    scene.add(pointCloud);

    initSliceScene();
    resizeScene();
    global.addEventListener('resize', resizeScene);
  }

  function initSliceScene() {
    var canvas = $('sliceCanvas');
    if (!canvas) { return; }
    sRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    sRenderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    sScene = new THREE.Scene();
    sCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 50);
    sCamera.position.set(2.6, 2.1, 3.4);
    sCamera.lookAt(0, 0, 0);
    if (typeof THREE.OrbitControls === 'function') {
      sliceControls = new THREE.OrbitControls(sCamera, sRenderer.domElement);
      sliceControls.enableDamping = true;
      sliceControls.dampingFactor = 0.08;
      sliceControls.enablePan = false;
    }
  }

  function resizeScene() {
    var mainCanvas = $('tessCanvas');
    if (renderer && mainCanvas) {
      var size = sizeCanvasElement(mainCanvas);
      renderer.setSize(size.w, size.h, false);
      camera.aspect = size.w / Math.max(1, size.h);
      camera.updateProjectionMatrix();
    }
    var sliceCanvas = $('sliceCanvas');
    if (sRenderer && sliceCanvas) {
      var sSize = sizeCanvasElement(sliceCanvas);
      sRenderer.setSize(sSize.w, sSize.h, false);
      sCamera.aspect = sSize.w / Math.max(1, sSize.h);
      sCamera.updateProjectionMatrix();
    }
  }

  /** 把当前旋转状态写进顶点缓存 */
  function updateProjectionBuffers() {
    var m = E.composeRotations([
      { i: 0, j: 3, a: state.angles.xw },
      { i: 1, j: 3, a: state.angles.yw },
      { i: 2, j: 3, a: state.angles.zw }
    ]);
    var i, vi, p;
    for (i = 0; i < baseVerts.length; i++) {
      rotatedVerts[i] = E.matVec4(m, baseVerts[i]);
    }
    if (!hasThree || !edgeLines) {
      return;
    }
    var posAttr = edgeGeom.attributes.position;
    var colAttr = edgeGeom.attributes.color;
    var projected = [];
    for (vi = 0; vi < rotatedVerts.length; vi++) {
      projected.push(E.projectTo3D(rotatedVerts[vi], state.camDistance));
    }
    for (i = 0; i < baseEdges.length; i++) {
      var a = projected[baseEdges[i][0]];
      var b = projected[baseEdges[i][1]];
      posAttr.array[i * 6 + 0] = a.x;
      posAttr.array[i * 6 + 1] = a.y;
      posAttr.array[i * 6 + 2] = a.z;
      posAttr.array[i * 6 + 3] = b.x;
      posAttr.array[i * 6 + 4] = b.y;
      posAttr.array[i * 6 + 5] = b.z;
      tmpColor.copy(COLOR_FAR).lerp(COLOR_NEAR, clamp01((a.w + 2) / 4));
      colAttr.array[i * 6 + 0] = tmpColor.r;
      colAttr.array[i * 6 + 1] = tmpColor.g;
      colAttr.array[i * 6 + 2] = tmpColor.b;
      tmpColor.copy(COLOR_FAR).lerp(COLOR_NEAR, clamp01((b.w + 2) / 4));
      colAttr.array[i * 6 + 3] = tmpColor.r;
      colAttr.array[i * 6 + 4] = tmpColor.g;
      colAttr.array[i * 6 + 5] = tmpColor.b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    var ppAttr = pointGeom.attributes.position;
    var pcAttr = pointGeom.attributes.color;
    for (vi = 0; vi < projected.length; vi++) {
      p = projected[vi];
      ppAttr.array[vi * 3 + 0] = p.x;
      ppAttr.array[vi * 3 + 1] = p.y;
      ppAttr.array[vi * 3 + 2] = p.z;
      tmpColor.copy(COLOR_FAR).lerp(COLOR_NEAR, clamp01((p.w + 2) / 4));
      pcAttr.array[vi * 3 + 0] = tmpColor.r;
      pcAttr.array[vi * 3 + 1] = tmpColor.g;
      pcAttr.array[vi * 3 + 2] = tmpColor.b;
    }
    ppAttr.needsUpdate = true;
    pcAttr.needsUpdate = true;
  }

  function clamp01(x) {
    return x < 0 ? 0 : (x > 1 ? 1 : x);
  }

  // ── 截面重建（凸包交给 three 的 ConvexGeometry；缺失则降级为点云）────
  var lastSliceKey = '';
  var canBuildConvex = hasThree && typeof THREE.ConvexGeometry === 'function' && typeof THREE.ConvexHull === 'function';

  function rebuildSlice() {
    var pts3 = E.sliceTesseract(rotatedVerts, state.wSlice);
    var n = pts3.length;
    $('sliceVerts').textContent = String(n);
    $('sliceDesc').textContent = E.describeSlice(n);
    $('sliceTag').textContent = '截面 w=' + state.wSlice.toFixed(2) + ' · ' + n + ' 个顶点';

    if (!hasThree || !sScene) {
      return;
    }
    var key = state.wSlice.toFixed(3) + '|' + n + '|' + snapshotAngles();
    if (key === lastSliceKey) {
      return;
    }
    lastSliceKey = key;

    disposeSliceMeshes();
    if (!hasThree || !sScene || !state.sliceVisible || n < 4) {
      return;
    }
    if (canBuildConvex) {
      try {
        var vectors = [];
        for (var i = 0; i < n; i++) {
          vectors.push(new THREE.Vector3(pts3[i][0], pts3[i][1], pts3[i][2]));
        }
        var geo = new THREE.ConvexGeometry(vectors);
        geo.computeVertexNormals && geo.computeVertexNormals();
        sliceMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xffd700, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false
        }));
        sliceEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 1),
          new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95 })
        );
        sScene.add(sliceMesh);
        sScene.add(sliceEdges);
      } catch (eConvex) {
        // 截面退化（如所有交点共面）时凸包可能失败：降级为点云，不影响页面
        disposeSliceMeshes();
        canBuildConvex = false;
        lastSliceKey = ''; // 清掉缓存键，否则递归会提前返回，降级路径不会执行
        rebuildSlice();
        return;
      }
    } else {
      // CDN 缺 convex 模块时退化为顶点小球点云，不阻塞功能
      var pg = new THREE.BufferGeometry();
      var arr = new Float32Array(n * 3);
      for (var p = 0; p < n; p++) {
        arr[p * 3] = pts3[p][0];
        arr[p * 3 + 1] = pts3[p][1];
        arr[p * 3 + 2] = pts3[p][2];
      }
      pg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      sliceEdges = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffd700, size: 0.12 }));
      sScene.add(sliceEdges);
    }
  }

  function disposeSliceMeshes() {
    if (sliceMesh) {
      sScene.remove(sliceMesh);
      sliceMesh.geometry.dispose();
      sliceMesh.material.dispose();
      sliceMesh = null;
    }
    if (sliceEdges) {
      sScene.remove(sliceEdges);
      sliceEdges.geometry.dispose();
      sliceEdges.material.dispose();
      sliceEdges = null;
    }
  }

  function snapshotAngles() {
    return [
      Math.round(state.angles.xw * 180 / Math.PI),
      Math.round(state.angles.yw * 180 / Math.PI),
      Math.round(state.angles.zw * 180 / Math.PI)
    ].join(',');
  }

  // ══ 第 3 节：平面国对照（两个 2D canvas）════════════════════════════
  var CUBE_TILT_A = Math.PI / 6;
  var CUBE_TILT_B = Math.PI / 6;

  function buildTiltedCube() {
    var out = [];
    var ca = Math.cos(CUBE_TILT_A);
    var sa = Math.sin(CUBE_TILT_A);
    var cb = Math.cos(CUBE_TILT_B);
    var sb = Math.sin(CUBE_TILT_B);
    for (var i = 0; i < 8; i++) {
      var x = (i & 1) ? 1 : -1;
      var y = (i & 2) ? 1 : -1;
      var z = (i & 4) ? 1 : -1;
      var y1 = ca * y - sa * z;
      var z1 = sa * y + ca * z;
      out.push([cb * x + sb * z1, y1, -sb * x + cb * z1]);
    }
    return out;
  }
  var tiltedCube = buildTiltedCube();
  var cubeEdgeIdx = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];

  function drawFlatland() {
    var h = state.crossValue;
    var left = fitCanvas($('cube2dCanvas'));
    var right = fitCanvas($('tess2dCanvas'));
    drawCubePanel(left.ctx, left.w, left.h, h);
    drawTessPanel(right.ctx, right.w, right.h, h);
  }

  /** 左面板：立方体穿过平面国的俯视图 */
  function drawCubePanel(ctx, w, h, planeZ) {
    ctx.clearRect(0, 0, w, h);
    var scale = Math.min(w, h) / 4.1;
    var cx = w / 2;
    var cy = h / 2;

    // 平面国"大地"（画得比方块投影大一圈，容纳倾斜后的截面）
    ctx.strokeStyle = 'rgba(144,202,249,0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - scale * 1.5, cy - scale * 1.5, scale * 3, scale * 3);

    // 方块线框投影（俯视）
    var i, e, pair;
    for (e = 0; e < cubeEdgeIdx.length; e++) {
      pair = cubeEdgeIdx[e];
      var a = tiltedCube[pair[0]];
      var b = tiltedCube[pair[1]];
      var cuts = (a[2] - planeZ) * (b[2] - planeZ) <= 0;
      ctx.strokeStyle = cuts ? 'rgba(255,107,107,0.9)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = cuts ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + a[0] * scale, cy + a[1] * scale);
      ctx.lineTo(cx + b[0] * scale, cy + b[1] * scale);
      ctx.stroke();
    }

    // 截面多边形
    var poly = E.sliceCubeZ(tiltedCube, planeZ);
    if (poly.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(cx + poly[0][0] * scale, cy + poly[0][1] * scale);
      for (i = 1; i < poly.length; i++) {
        ctx.lineTo(cx + poly[i][0] * scale, cy + poly[i][1] * scale);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,215,0,0.75)';
      ctx.fill();
    }
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(poly.length >= 3 ? ('平面国看到 ' + poly.length + ' 边形') : '平面国什么都没看到', 10, h - 10);
  }

  /** 右面板：超立方体穿过我们空间，沿 z 俯视 */
  function drawTessPanel(ctx, w, h, planeW) {
    ctx.clearRect(0, 0, w, h);
    var scale = Math.min(w, h) / 4.6;
    var cx = w / 2;
    var cy = h / 2;

    // 全部边的俯视投影（淡）
    var projected = [];
    for (var vi = 0; vi < rotatedVerts.length; vi++) {
      projected.push(E.projectTo3D(rotatedVerts[vi], state.camDistance));
    }
    ctx.lineWidth = 1;
    for (var e2 = 0; e2 < baseEdges.length; e2++) {
      var pa = projected[baseEdges[e2][0]];
      var pb = projected[baseEdges[e2][1]];
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(cx + pa.x * scale, cy + pa.y * scale);
      ctx.lineTo(cx + pb.x * scale, cy + pb.y * scale);
      ctx.stroke();
    }

    // 截面点的俯视凸包
    var pts3 = E.sliceTesseract(rotatedVerts, planeW);
    if (pts3.length >= 3) {
      var poly = E.convexHull2D(pts3.map(function (p) { return [p[0], p[1]]; }));
      if (poly.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(cx + poly[0][0] * scale, cy + poly[0][1] * scale);
        for (var k = 1; k < poly.length; k++) {
          ctx.lineTo(cx + poly[k][0] * scale, cy + poly[k][1] * scale);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,215,0,0.75)';
        ctx.fill();
      }
      // 顶点点位
      ctx.fillStyle = '#ff6b6b';
      for (var pi = 0; pi < pts3.length; pi++) {
        ctx.beginPath();
        ctx.arc(cx + pts3[pi][0] * scale, cy + pts3[pi][1] * scale, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      var shapeText = (poly.length >= 3)
        ? ('我们俯视到 ' + poly.length + ' 边形截面（' + pts3.length + ' 顶点）')
        : ('截面有 ' + pts3.length + ' 个顶点，但俯视方向看是扁的');
      ctx.fillText(shapeText, 10, h - 10);
    } else {
      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('还没穿进来', 10, h - 10);
    }
  }

  // ══ 控件绑定 ════════════════════════════════════════════════════════
  function bindSlider(id, labelId, format, onChange) {
    var el = $(id);
    if (!el) { return; }
    el.addEventListener('input', function () {
      var val = parseFloat(el.value);
      if (labelId) {
        $(labelId).textContent = format(val);
      }
      onChange(val);
    });
  }

  function syncControlValues() {
    $('xwSlider').value = state.speeds.xw;
    $('ywSlider').value = state.speeds.yw;
    $('zwSlider').value = state.speeds.zw;
    $('camSlider').value = state.camDistance;
    $('wSlider').value = state.wSlice;
    $('crossSlider').value = state.crossValue;
    $('xwValue').textContent = state.speeds.xw.toFixed(2);
    $('ywValue').textContent = state.speeds.yw.toFixed(2);
    $('zwValue').textContent = state.speeds.zw.toFixed(2);
    $('camValue').textContent = state.camDistance.toFixed(1);
    $('wValue').textContent = state.wSlice.toFixed(2);
    $('crossValue').textContent = state.crossValue.toFixed(2);
  }

  function applyPreset(presetId, silentTrack) {
    var preset = null;
    var presetIdx = -1;
    for (var i = 0; i < E.TESS_PRESETS.length; i++) {
      if (E.TESS_PRESETS[i].id === presetId) {
        preset = E.TESS_PRESETS[i];
        presetIdx = i;
      }
    }
    if (!preset) { return; }
    state.angles = { xw: preset.angles.xw, yw: preset.angles.yw, zw: preset.angles.zw };
    state.speeds = {
      xw: prefersReducedMotion ? 0 : preset.speeds.xw,
      yw: prefersReducedMotion ? 0 : preset.speeds.yw,
      zw: prefersReducedMotion ? 0 : preset.speeds.zw
    };
    state.camDistance = preset.camDistance;
    state.sliceAuto = prefersReducedMotion ? false : preset.sliceAuto;
    lastSliceKey = '';
    markActivePreset(presetId);
    syncControlValues();
    updateAutoBtnLabel();
    if (!silentTrack) {
      nfTrack('apply_preset', { idx: presetIdx, name: String(preset.name).slice(0, 32) });
    }
  }

  function markActivePreset(presetId) {
    var btns = $('presetGrid').children;
    for (var b = 0; b < btns.length; b++) {
      if (btns[b].getAttribute('data-preset') === presetId) {
        btns[b].classList.add('active');
      } else {
        btns[b].classList.remove('active');
      }
    }
  }

  function buildPresetGrid() {
    var grid = $('presetGrid');
    for (var i = 0; i < E.TESS_PRESETS.length; i++) {
      var preset = E.TESS_PRESETS[i];
      var btn = document.createElement('button');
      btn.className = 'preset-card';
      btn.setAttribute('data-preset', preset.id);
      btn.innerHTML =
        '<i class="ti ' + preset.icon + '"></i>' +
        '<span class="pc-name">' + preset.name + '</span>' +
        '<small>' + preset.desc + '</small>';
      (function bind(id) {
        btn.addEventListener('click', function () {
          applyPreset(id, false);
        });
      })(preset.id);
      grid.appendChild(btn);
    }
    markActivePreset(prefersReducedMotion ? 'still' : 'classic');
  }

  function updateSliceToggleLabel() {
    var btn = $('sliceToggleBtn');
    btn.innerHTML = state.sliceVisible
      ? '<i class="ti ti-eye-off"></i> 隐藏截面实体'
      : '<i class="ti ti-eye"></i> 显示截面实体';
    btn.classList.toggle('active', state.sliceVisible);
  }

  function updateAutoBtnLabel() {
    var btn = $('autoSliceBtn');
    btn.innerHTML = state.sliceAuto
      ? '<i class="ti ti-player-pause"></i> 暂停自动切割'
      : '<i class="ti ti-player-play"></i> 自动往返切割';
    btn.classList.toggle('active', state.sliceAuto);
  }

  function bindControls() {
    bindSlider('xwSlider', 'xwValue', function (v) { return v.toFixed(2); }, function (v) {
      state.speeds.xw = v;
      markActivePreset('');
    });
    bindSlider('ywSlider', 'ywValue', function (v) { return v.toFixed(2); }, function (v) {
      state.speeds.yw = v;
      markActivePreset('');
    });
    bindSlider('zwSlider', 'zwValue', function (v) { return v.toFixed(2); }, function (v) {
      state.speeds.zw = v;
      markActivePreset('');
    });
    bindSlider('camSlider', 'camValue', function (v) { return v.toFixed(1); }, function (v) {
      state.camDistance = v;
    });
    bindSlider('wSlider', 'wValue', function (v) { return v.toFixed(2); }, function (v) {
      state.wSlice = v;
      state.sliceAuto = false;
      updateAutoBtnLabel();
      if (!state.firstWDrag) {
        state.firstWDrag = true;
        nfTrack('slice_first_drag', {});
      }
    });
    bindSlider('crossSlider', 'crossValue', function (v) { return v.toFixed(2); }, function (v) {
      state.crossValue = v;
      drawFlatland();
    });

    $('sliceToggleBtn').addEventListener('click', function () {
      state.sliceVisible = !state.sliceVisible;
      lastSliceKey = '';
      updateSliceToggleLabel();
      rebuildSlice();
      nfTrack('toggle_slice', { on: state.sliceVisible });
    });

    $('autoSliceBtn').addEventListener('click', function () {
      state.sliceAuto = !state.sliceAuto;
      updateAutoBtnLabel();
      nfTrack('toggle_auto_slice', { on: state.sliceAuto });
    });

    $('copyShareBtn').addEventListener('click', function () {
      var text = buildShareText();
      copyToClipboard(text);
      $('copyHint').textContent = '已复制，去粘贴给朋友吧';
      var self = this;
      setTimeout(function () { $('copyHint').textContent = ''; self.blur(); }, 2400);
    });
  }

  function buildShareText() {
    var deg = snapshotAngles().split(',');
    return '[数字直觉] 我在「四维空间解剖台」把超立方体转到了 XW=' + deg[0] +
      '° YW=' + deg[1] + '° ZW=' + deg[2] + '°，在 w=' + state.wSlice.toFixed(2) +
      ' 处切出了 ' + $('sliceVerts').textContent + ' 顶点的截面。来试试：' +
      'https://numfeel.996.ninja/pages/tesseract/';
  }

  function copyToClipboard(text) {
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text);
        return;
      }
    } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e2) {}
  }

  // ══ 主循环 ══════════════════════════════════════════════════════════
  var lastTickAt = 0;
  var frameNo = 0;

  function tick(now) {
    var dt = Math.min(0.05, (now - lastTickAt) / 1000 || 0.016);
    lastTickAt = now;
    state.time += dt;

    state.angles.xw += state.speeds.xw * dt;
    state.angles.yw += state.speeds.yw * dt;
    state.angles.zw += state.speeds.zw * dt;

    if (state.sliceAuto) {
      state.wSlice = 1.25 * Math.sin(state.time * 0.7);
      $('wSlider').value = state.wSlice;
      $('wValue').textContent = state.wSlice.toFixed(2);
    }

    updateProjectionBuffers();
    if ((frameNo & 1) === 0) {
      rebuildSlice();
    }
    frameNo++;

    if (controls) {
      controls.update();
    }
    if (sliceControls) {
      sliceControls.update();
    }
    if (sScene && !prefersReducedMotion) {
      sScene.rotation.y += dt * 0.25;
    }
    if (renderer) {
      renderer.render(scene, camera);
    }
    if (sRenderer && sScene) {
      sRenderer.render(sScene, sCamera);
    }
  }

  var rafId = null;
  function loop(now) {
    tick(now || 0);
    rafId = global.requestAnimationFrame(loop);
  }

  // ── 对外暴露（供冒烟测试与调试） ────────────────────────────────────
  global.__tess = {
    state: state,
    applyPreset: applyPreset,
    drawFlatland: drawFlatland,
    buildShareText: buildShareText,
    tick: tick,
    stop: function () { if (rafId !== null) { global.cancelAnimationFrame(rafId); rafId = null; } },
    hasThree: hasThree
  };

  // ── 启动 ───────────────────────────────────────────────────────────
  buildPresetGrid();
  bindControls();
  initScene();
  updateProjectionBuffers();
  rebuildSlice();
  drawFlatland();
  syncControlValues();
  updateSliceToggleLabel();
  updateAutoBtnLabel();
  if (prefersReducedMotion) {
    $('rotationNote').innerHTML = '已检测到你偏好减少动态效果：所有旋转默认关闭，可手动拖滑杆观察每一步的变化。';
  }
  trackSessionStart();
  if (!prefersReducedMotion) {
    loop(0);
  }
})(typeof window !== 'undefined' ? window : this);
