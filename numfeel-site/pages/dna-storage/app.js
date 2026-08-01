/**
 * app.js - DNA 存储演示页交互逻辑
 *
 * 依赖：dna-core.js（window.DNACore）、GSAP（动画时间轴）、Chart.js（图表，通过 header.js 的 loadChartJS 加载）
 */

(function () {
  'use strict';

  var DNA = window.DNACore;

  // ── 状态 ──
  var state = {
    dataText: 'DNA存储',
    dataBytes: null,
    dataSource: 'text',       // 'text' | 'image'
    imageDims: null,          // {w, h} 图片像素尺寸
    segLen: 4,
    segments: [],
    K: 0,
    redundancy: 1.0,
    encodeResult: null,   // encode() 的完整返回
    oligos: [],           // 通过筛选的 oligo
    channelReceived: null,
    channelStatus: null,  // 每条 oligo 的状态 ok/mutated/dropped
    decodeRan: false,
    currentStep: 1,
    sweepChart: null,
    dropletDemoSeed: 100,    // 单条液滴演示的递增种子
    encodeStartSeed: 1       // 批量编码的起始种子（每次点击递增，让结果不同）
  };

  // ── DOM 引用 ──
  var $ = function (id) { return document.getElementById(id); };

  // ── 工具 ──
  function showToast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function hexByte(v) {
    return (v < 16 ? '0' : '') + v.toString(16).toUpperCase();
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    if (n < 1099511627776) return (n / 1073741824).toFixed(1) + ' GB';
    if (n < 1125899906842624) return (n / 1099511627776).toFixed(1) + ' TB';
    return (n / 1125899906842624).toFixed(1) + ' PB';
  }

  function formatMass(g) {
    if (g === 0) return '0 g';
    if (g < 1e-15) return (g * 1e18).toExponential(2) + ' ag (阿克)';
    if (g < 1e-12) return (g * 1e15).toExponential(2) + ' fg (飞克)';
    if (g < 1e-9) return (g * 1e12).toExponential(2) + ' pg (皮克)';
    if (g < 1e-6) return (g * 1e9).toFixed(2) + ' ng (纳克)';
    if (g < 1e-3) return (g * 1e6).toFixed(2) + ' μg (微克)';
    if (g < 1) return (g * 1e3).toFixed(2) + ' mg (毫克)';
    return g.toFixed(2) + ' g (克)';
  }

  // ── 图片工具 ──
  var IMG_SIZE = 24; // 像素画 / 上传图统一缩放到 24×24

  /**
   * 在 canvas 上画一个笑脸像素画
   */
  function drawPixelArt(canvas) {
    var ctx = canvas.getContext('2d');
    var s = IMG_SIZE;
    ctx.fillStyle = '#1e2a3a';
    ctx.fillRect(0, 0, s, s);
    // 脸圆
    var cx = s / 2, cy = s / 2, r = s * 0.38;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#1e2a3a';
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, cy - r * 0.3, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.4, cy - r * 0.3, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // 嘴
    ctx.strokeStyle = '#1e2a3a';
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.05, r * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  /**
   * 从 canvas 提取灰度字节数组（每像素 1 字节）
   */
  function canvasToGrayscale(canvas, w, h) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, w, h);
    var bytes = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) {
      var r = imgData.data[i * 4];
      var g = imgData.data[i * 4 + 1];
      var b = imgData.data[i * 4 + 2];
      bytes[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return bytes;
  }

  /**
   * 把灰度字节数组画到 canvas 上（用于预览和解码渲染）
   */
  function grayscaleToCanvas(canvas, bytes, w, h) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(w, h);
    for (var i = 0; i < w * h && i < bytes.length; i++) {
      var v = bytes[i];
      imgData.data[i * 4] = v;
      imgData.data[i * 4 + 1] = v;
      imgData.data[i * 4 + 2] = v;
      imgData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * 选择图片数据源（与 selectData 平行，处理图片分支）
   */
  function selectImageData(bytes, dims, label) {
    state.dataText = label;
    state.dataBytes = bytes;
    state.dataSource = 'image';
    state.imageDims = dims;
    state.segments = [];
    state.K = 0;
    state.encodeResult = null;
    state.oligos = [];
    state.channelReceived = null;
    state.channelStatus = null;
    state.decodeRan = false;
    state.currentStep = 1;

    updateDataInfo();
    resetStepper();
    resetEncodePanels();
    resetChannel();
    resetDecode();
    $('decodeCanvasWrap').style.display = 'none';

    var k = Math.max(1, Math.ceil(bytes.length / state.segLen));
    var target = Math.max(k + 1, Math.ceil(k * (1 + state.redundancy)));
    $('targetCount').textContent = target;

    doStep1();
  }

  // ── 数据选择 ──
  function initDataCards() {
    // 预设计算字节数
    var presets = ['DNA存储', 'Hello,DNA世界！', '把照片电影操作系统统统写进DNA分子里永久保存'];
    presets.forEach(function (text, i) {
      var bytes = DNA.textToBytes(text);
      var el = $('meta' + i);
      if (el) el.textContent = '约 ' + bytes.length + ' 字节';
    });

    // 画内置像素画预览
    var pixelCanvas = $('pixelArtPreview');
    if (pixelCanvas) drawPixelArt(pixelCanvas);

    var cards = document.querySelectorAll('#dataRow .scene-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        cards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        var val = card.dataset.data;
        if (val === 'custom') {
          $('customInputModule').style.display = 'block';
          $('imagePreviewModule').style.display = 'none';
          $('customData').focus();
        } else if (val === 'pixel-art') {
          $('customInputModule').style.display = 'none';
          // 用像素画 canvas 提取灰度字节
          var tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = IMG_SIZE;
          tmpCanvas.height = IMG_SIZE;
          drawPixelArt(tmpCanvas);
          var bytes = canvasToGrayscale(tmpCanvas, IMG_SIZE, IMG_SIZE);
          // 显示预览
          $('imagePreviewModule').style.display = 'block';
          grayscaleToCanvas($('imagePreviewCanvas'), bytes, IMG_SIZE, IMG_SIZE);
          selectImageData(bytes, { w: IMG_SIZE, h: IMG_SIZE }, '笑脸像素画');
        } else if (val === 'upload') {
          $('imageUpload').click();
        } else {
          $('customInputModule').style.display = 'none';
          $('imagePreviewModule').style.display = 'none';
          selectData(val);
        }
      });
    });

    // 文件上传处理
    $('imageUpload').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          // 缩放到 24×24 离屏 canvas
          var offCanvas = document.createElement('canvas');
          offCanvas.width = IMG_SIZE;
          offCanvas.height = IMG_SIZE;
          var offCtx = offCanvas.getContext('2d');
          offCtx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
          var bytes = canvasToGrayscale(offCanvas, IMG_SIZE, IMG_SIZE);
          // 显示预览
          $('imagePreviewModule').style.display = 'block';
          grayscaleToCanvas($('imagePreviewCanvas'), bytes, IMG_SIZE, IMG_SIZE);
          // 高亮上传卡片
          cards.forEach(function (c) { c.classList.remove('active'); });
          document.querySelector('[data-data="upload"]').classList.add('active');
          $('customInputModule').style.display = 'none';
          selectImageData(bytes, { w: IMG_SIZE, h: IMG_SIZE }, '上传图片');
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      // 重置 input 允许重复选同一文件
      e.target.value = '';
    });

    $('customConfirmBtn').addEventListener('click', function () {
      var v = $('customData').value.trim();
      if (!v) { showToast('请输入文本'); return; }
      selectData(v);
    });
    $('customData').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('customConfirmBtn').click();
    });
  }

  function selectData(text) {
    state.dataText = text;
    state.dataBytes = DNA.textToBytes(text);
    state.dataSource = 'text';
    state.imageDims = null;
    state.segments = [];
    state.K = 0;
    state.encodeResult = null;
    state.oligos = [];
    state.channelReceived = null;
    state.channelStatus = null;
    state.decodeRan = false;
    state.currentStep = 1;

    updateDataInfo();
    resetStepper();
    resetEncodePanels();
    resetChannel();
    resetDecode();
    $('decodeCanvasWrap').style.display = 'none';

    // 更新目标条数显示
    var k = Math.max(1, Math.ceil(state.dataBytes.length / state.segLen));
    var target = Math.max(k + 1, Math.ceil(k * (1 + state.redundancy)));
    $('targetCount').textContent = target;

    // 自动跑步骤 1
    doStep1();
  }

  function updateDataInfo() {
    var n = state.dataBytes.length;
    var sourceDesc = state.dataSource === 'image'
      ? '灰度图片 <span class="hl">' + (state.imageDims ? state.imageDims.w + '×' + state.imageDims.h : '') + '</span>'
      : '文本 <span class="hl">' + escapeHtml(state.dataText) + '</span>';
    var info = '当前数据：' + sourceDesc +
      ' = <span class="blue">' + n + '</span> 字节' +
      '。按段长 <span class="hl">' + state.segLen + '</span> 切分将得到 <span class="hl">' +
      Math.max(1, Math.ceil(n / state.segLen)) + '</span> 段。';
    $('dataInfo').innerHTML = info;
  }

  // ── 步骤导航 ──
  function resetStepper() {
    state.currentStep = 1;
    var items = document.querySelectorAll('.step-item');
    items.forEach(function (it, i) {
      it.classList.remove('active', 'done');
      if (i === 0) it.classList.add('active');
    });
  }

  function goToStep(step) {
    state.currentStep = step;
    var items = document.querySelectorAll('.step-item');
    items.forEach(function (it, i) {
      it.classList.remove('active', 'done');
      var n = i + 1;
      if (n < step) it.classList.add('done');
      if (n === step) it.classList.add('active');
    });
    // 显示对应面板
    for (var s = 1; s <= 4; s++) {
      $('step' + s + 'Panel').style.display = (s <= step) ? 'block' : 'none';
    }
  }

  function resetEncodePanels() {
    $('step1Panel').style.display = 'block';
    $('step2Panel').style.display = 'none';
    $('step3Panel').style.display = 'none';
    $('step4Panel').style.display = 'none';
    $('segVis').innerHTML = '<p class="placeholder-text">点击「切分段」查看分段结果</p>';
    $('dropletVis').innerHTML = '<p class="placeholder-text">点击「生成液滴」查看喷泉码液滴</p>';
    $('singleDropletVis').innerHTML = '<p class="placeholder-text">点击按钮，看一条液滴怎么从多个段 XOR 产生</p>';
    $('baseVis').innerHTML = '<p class="placeholder-text">点击「转换碱基」查看 ATCG 序列</p>';
    $('screenVis').innerHTML = '<p class="placeholder-text">点击「体检筛选」查看通过率</p>';
    $('screenSummary').innerHTML = '';
    $('retryVis').innerHTML = '';
  }

  // ── 步骤 1：切分段 ──
  function doStep1() {
    state.segments = DNA.splitIntoSegments(state.dataBytes, state.segLen);
    state.K = state.segments.length;
    renderSegments();
    goToStep(2);

    // 段长滑杆
    $('segLenSlider').oninput = function () {
      state.segLen = parseInt(this.value, 10);
      $('segLenVal').textContent = state.segLen;
      state.segments = DNA.splitIntoSegments(state.dataBytes, state.segLen);
      state.K = state.segments.length;
      updateDataInfo();
      renderSegments();
      // 段长变化后清除后续步骤
      state.encodeResult = null;
      state.oligos = [];
      resetDownstreamSteps();
    };
  }

  function renderSegments() {
    var container = $('segVis');
    container.innerHTML = '';
    var n = state.dataBytes.length;

    state.segments.forEach(function (seg, i) {
      var block = document.createElement('div');
      block.className = 'seg-block';
      var title = document.createElement('div');
      title.className = 'seg-title';
      title.textContent = '段 ' + i;
      var bytes = document.createElement('div');
      bytes.className = 'seg-bytes';
      for (var b = 0; b < seg.length; b++) {
        var cell = document.createElement('div');
        cell.className = 'byte-cell';
        var offset = i * state.segLen + b;
        if (offset >= n) {
          cell.classList.add('pad');
          cell.textContent = '00';
        } else {
          cell.textContent = hexByte(seg[b]);
        }
        bytes.appendChild(cell);
      }
      block.appendChild(title);
      block.appendChild(bytes);
      container.appendChild(block);
    });

    animateIn(container, '.seg-block');
  }

  function resetDownstreamSteps() {
    // 清除步骤 2-4 的结果，回到步骤 1
    $('dropletVis').innerHTML = '<p class="placeholder-text">点击「生成液滴」查看喷泉码液滴</p>';
    $('singleDropletVis').innerHTML = '<p class="placeholder-text">点击按钮，看一条液滴怎么从多个段 XOR 产生</p>';
    $('baseVis').innerHTML = '<p class="placeholder-text">点击「转换碱基」查看 ATCG 序列</p>';
    $('screenVis').innerHTML = '<p class="placeholder-text">点击「体检筛选」查看通过率</p>';
    $('screenSummary').innerHTML = '';
    $('retryVis').innerHTML = '';
    $('step2Panel').style.display = 'none';
    $('step3Panel').style.display = 'none';
    $('step4Panel').style.display = 'none';
    resetStepper();
    resetChannel();
    resetDecode();
  }

  // ── 步骤 2：生成液滴 ──
  function doStep2() {
    var redundancy = state.redundancy;
    // 每次点击用递增的起始种子，让液滴序列不同（问题 2）
    state.encodeResult = DNA.encode(state.dataBytes, {
      segLen: state.segLen,
      redundancy: redundancy,
      startSeed: state.encodeStartSeed
    });
    state.encodeStartSeed += 9999; // 下次点击从不同种子开始
    state.oligos = state.encodeResult.oligos;
    renderDroplets();
    goToStep(3);
    resetChannel();
    resetDecode();
  }

  function renderDroplets() {
    var container = $('dropletVis');
    container.innerHTML = '';
    var stats = state.encodeResult.stats;

    var showCount = Math.min(state.oligos.length, 14);
    for (var i = 0; i < showCount; i++) {
      var oligo = state.oligos[i];
      var row = document.createElement('div');
      row.className = 'droplet-row';

      var seedEl = document.createElement('div');
      seedEl.className = 'droplet-seed';
      seedEl.textContent = '#' + oligo.seed;

      var degEl = document.createElement('div');
      degEl.className = 'droplet-deg';
      degEl.textContent = '度 ' + oligo.degree;

      var idxEl = document.createElement('div');
      idxEl.className = 'droplet-indices';
      oligo.indices.forEach(function (idx) {
        var chip = document.createElement('span');
        chip.className = 'idx-chip';
        chip.textContent = idx;
        idxEl.appendChild(chip);
      });

      row.appendChild(seedEl);
      row.appendChild(degEl);
      row.appendChild(idxEl);
      container.appendChild(row);
    }

    if (state.oligos.length > showCount) {
      var more = document.createElement('p');
      more.className = 'placeholder-text';
      more.style.textAlign = 'left';
      more.textContent = '... 还有 ' + (state.oligos.length - showCount) + ' 条液滴';
      container.appendChild(more);
    }

    animateIn(container, '.droplet-row');
  }

  // ── 单条液滴演示（问题 2）──
  function doSingleDroplet() {
    if (!state.segments.length) {
      showToast('请先切分段');
      return;
    }
    var seed = state.dropletDemoSeed++;
    var droplet = DNA.makeDroplet(state.segments, seed);
    var container = $('singleDropletVis');
    container.innerHTML = '';

    // 详情行
    var detail = document.createElement('div');
    detail.className = 'droplet-detail';
    var seedEl = document.createElement('span');
    seedEl.className = 'seed-label';
    seedEl.textContent = 'seed #' + seed;
    var degEl = document.createElement('span');
    degEl.className = 'deg-label';
    degEl.textContent = '度 d = ' + droplet.indices.length;
    detail.appendChild(seedEl);
    detail.appendChild(degEl);
    container.appendChild(detail);

    // 段网格，高亮选中的段
    var grid = document.createElement('div');
    grid.className = 'seg-grid';
    var selectedSet = {};
    droplet.indices.forEach(function (idx) { selectedSet[idx] = true; });
    for (var i = 0; i < state.K; i++) {
      var cell = document.createElement('div');
      cell.className = 'seg-cell';
      cell.textContent = i;
      if (selectedSet[i]) cell.classList.add('selected');
      grid.appendChild(cell);
    }
    container.appendChild(grid);

    // 说明
    var note = document.createElement('p');
    note.className = 'module-hint';
    note.style.marginTop = '8px';
    note.textContent = '金色段被选中并 XOR 混合成这条液滴的数据。换种子会得到不同的度数和连线。';
    container.appendChild(note);

    // GSAP 动画：选中的段逐个高亮
    if (typeof gsap !== 'undefined') {
      var selectedCells = grid.querySelectorAll('.seg-cell.selected');
      gsap.fromTo(selectedCells,
        { scale: 0.5, opacity: 0 },
        { scale: 1.1, opacity: 1, duration: 0.25, stagger: 0.06, ease: 'back.out(2)', clearProps: 'transform,opacity' }
      );
    }
  }

  // ── 换种子重试（问题 3）──
  function doRetrySeed() {
    if (!state.segments.length) {
      showToast('请先切分段');
      return;
    }
    var seed = state.dropletDemoSeed++;
    var droplet = DNA.makeDroplet(state.segments, seed);
    var segLen = state.segLen;

    // 组装 oligo 字节并转碱基（复用 encode 的逻辑）
    var oligoBytes = new Uint8Array(4 + segLen + 1);
    var sb = DNA.seedToBytes(seed);
    for (var i = 0; i < 4; i++) oligoBytes[i] = sb[i];
    for (var b = 0; b < segLen; b++) oligoBytes[4 + b] = droplet.data[b];
    var checksum = 0;
    for (var c = 0; c < 4 + segLen; c++) checksum ^= oligoBytes[c];
    oligoBytes[4 + segLen] = checksum;
    var baseStr = DNA.bytesToBases(DNA.whiten(oligoBytes));
    var screen = DNA.screenOligo(baseStr);

    // 渲染结果
    var container = $('retryVis');
    var row = document.createElement('div');
    row.className = 'retry-row ' + (screen.pass ? 'pass' : 'fail');

    var badge = document.createElement('span');
    badge.className = 'screen-badge ' + (screen.pass ? 'pass' : 'fail');
    badge.textContent = screen.pass ? '通过' : '拒绝';

    var seedEl = document.createElement('span');
    seedEl.className = 'droplet-seed';
    seedEl.textContent = '#' + seed;

    var gcWrap = document.createElement('div');
    gcWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
    var gcBar = document.createElement('div');
    gcBar.className = 'gc-bar-wrap';
    var gcFill = document.createElement('div');
    gcFill.className = 'gc-bar-fill';
    gcFill.style.width = (screen.gc * 100) + '%';
    gcBar.appendChild(gcFill);
    var gcText = document.createElement('span');
    gcText.className = 'screen-metric';
    gcText.textContent = 'GC ' + (screen.gc * 100).toFixed(0) + '%';
    gcWrap.appendChild(gcBar);
    gcWrap.appendChild(gcText);

    var runText = document.createElement('span');
    runText.className = 'screen-metric';
    runText.textContent = '最长重复 ' + screen.run;

    row.appendChild(badge);
    row.appendChild(seedEl);
    row.appendChild(gcWrap);
    row.appendChild(runText);
    if (!screen.pass) {
      var reason = document.createElement('span');
      reason.className = 'screen-metric';
      reason.style.color = '#ff6b6b';
      reason.textContent = screen.reason;
      row.appendChild(reason);
    }

    // 插到最前面（最新在顶部），保留最近 5 条
    container.insertBefore(row, container.firstChild);
    while (container.children.length > 5) {
      container.removeChild(container.lastChild);
    }

    // GSAP 入场
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(row,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out', clearProps: 'opacity,transform' }
      );
    }
  }

  // ── 步骤 3：转碱基 ──
  function doStep3() {
    renderBases();
    goToStep(4);
  }

  function renderBases() {
    var container = $('baseVis');
    container.innerHTML = '';
    var showCount = Math.min(state.oligos.length, 12);
    var allCharSpans = [];

    for (var i = 0; i < showCount; i++) {
      var oligo = state.oligos[i];
      var row = document.createElement('div');
      row.className = 'base-row';

      var label = document.createElement('div');
      label.className = 'base-seed-label';
      label.textContent = '#' + oligo.seed;

      var seq = document.createElement('div');
      seq.className = 'base-seq';

      // 逐字符 span，超过 60 个只动画前 60 个
      var str = oligo.baseStr;
      var animateLimit = 60;
      for (var j = 0; j < str.length; j++) {
        var ch = str[j];
        var span = document.createElement('span');
        span.className = 'base-' + ch;
        span.textContent = ch;
        if (j < animateLimit) {
          allCharSpans.push(span);
        }
        seq.appendChild(span);
      }
      if (str.length > animateLimit) {
        var more = document.createElement('span');
        more.className = 'base-more';
        more.textContent = '... 共 ' + str.length + ' 个碱基';
        seq.appendChild(more);
      }

      row.appendChild(label);
      row.appendChild(seq);
      container.appendChild(row);
    }

    // 逐字符浮现动画（问题 4）
    if (allCharSpans.length > 0 && typeof gsap !== 'undefined') {
      // 动态 stagger：总动画时间控制在 ~3 秒以内
      var stagger = Math.min(0.04, 3.0 / allCharSpans.length);
      gsap.set(allCharSpans, { opacity: 0, y: 8 });
      gsap.to(allCharSpans, {
        opacity: 1, y: 0, duration: 0.2, stagger: stagger,
        ease: 'power1.out', overwrite: true, clearProps: 'opacity,transform'
      });
      // 兜底
      var safetyMs = 200 + allCharSpans.length * stagger * 1000 + 500;
      setTimeout(function () {
        allCharSpans.forEach(function (el) {
          el.style.opacity = '';
          el.style.transform = '';
        });
      }, safetyMs);
    }
  }

  function colorizeBases(baseStr) {
    var html = '';
    for (var i = 0; i < baseStr.length; i++) {
      var ch = baseStr[i];
      html += '<span class="base-' + ch + '">' + ch + '</span>';
    }
    return html;
  }

  // ── 步骤 4：体检筛选 ──
  function doStep4() {
    renderScreen();
    goToStep(4);
  }

  function renderScreen() {
    var container = $('screenVis');
    container.innerHTML = '';
    var stats = state.encodeResult.stats;
    var showCount = Math.min(state.oligos.length, 10);

    for (var i = 0; i < showCount; i++) {
      var oligo = state.oligos[i];
      var screen = DNA.screenOligo(oligo.baseStr);
      var row = document.createElement('div');
      row.className = 'screen-row pass';

      var badge = document.createElement('span');
      badge.className = 'screen-badge pass';
      badge.textContent = '通过';

      var seedEl = document.createElement('span');
      seedEl.className = 'droplet-seed';
      seedEl.textContent = '#' + oligo.seed;

      var gcWrap = document.createElement('div');
      gcWrap.style.display = 'flex';
      gcWrap.style.alignItems = 'center';
      gcWrap.style.gap = '6px';
      var gcBar = document.createElement('div');
      gcBar.className = 'gc-bar-wrap';
      var gcFill = document.createElement('div');
      gcFill.className = 'gc-bar-fill';
      gcFill.style.width = (screen.gc * 100) + '%';
      gcBar.appendChild(gcFill);
      var gcText = document.createElement('span');
      gcText.className = 'screen-metric';
      gcText.textContent = 'GC ' + (screen.gc * 100).toFixed(0) + '%';
      gcWrap.appendChild(gcBar);
      gcWrap.appendChild(gcText);

      var runText = document.createElement('span');
      runText.className = 'screen-metric';
      runText.textContent = '最长重复 ' + screen.run;

      row.appendChild(badge);
      row.appendChild(seedEl);
      row.appendChild(gcWrap);
      row.appendChild(runText);
      container.appendChild(row);
    }

    // 被拒绝样本
    var rejected = stats.rejectedSamples || [];
    if (rejected.length > 0) {
      var sep = document.createElement('p');
      sep.className = 'placeholder-text';
      sep.style.textAlign = 'left';
      sep.style.marginTop = '8px';
      sep.textContent = '被拒绝的样本（不满足生物学约束）：';
      container.appendChild(sep);

      rejected.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'screen-row fail';
        var badge = document.createElement('span');
        badge.className = 'screen-badge fail';
        badge.textContent = '拒绝';
        var seedEl = document.createElement('span');
        seedEl.className = 'droplet-seed';
        seedEl.textContent = '#' + r.seed;
        var reason = document.createElement('span');
        reason.className = 'screen-metric';
        reason.style.color = '#ff6b6b';
        reason.textContent = r.reason + '（GC ' + (r.gc * 100).toFixed(0) + '%, 重复 ' + r.run + '）';
        row.appendChild(badge);
        row.appendChild(seedEl);
        row.appendChild(reason);
        container.appendChild(row);
      });
    }

    animateIn(container, '.screen-row');

    // 汇总
    var acceptRate = stats.attempts > 0 ? (stats.accepted / stats.attempts * 100).toFixed(0) : 0;
    $('screenSummary').innerHTML =
      '共尝试 <span class="hl">' + stats.attempts + '</span> 个种子，' +
      '通过体检 <span class="green">' + stats.accepted + '</span> 条，' +
      '拒绝 <span class="red">' + stats.rejected + '</span> 条（通过率 ' + acceptRate + '%）。' +
      '通过率取决于 GC 窗口和重复上限的严格程度--越严格，DNA 合成越可靠，但浪费的种子也越多。';
  }

  // ── 信道模拟 ──
  function resetChannel() {
    state.channelReceived = null;
    state.channelStatus = null;
    $('channelVis').innerHTML = '<p class="placeholder-text">先完成编码（步骤 4），再模拟测序信道</p>';
    $('channelSummary').innerHTML = '';
    $('decodeBtn').disabled = true;
    state.decodeRan = false;
    resetDecode();
  }

  function doChannel() {
    if (!state.oligos.length) {
      showToast('请先完成编码');
      return;
    }
    var dropout = parseInt($('dropoutSlider').value, 10) / 100;
    var mutation = parseInt($('mutationSlider').value, 10) / 100;
    var rng = DNA.createRng(Date.now() % 1000000);

    // 逐条决定状态
    state.channelStatus = [];
    var received = [];
    for (var i = 0; i < state.oligos.length; i++) {
      var r1 = rng();
      if (r1 < dropout) {
        state.channelStatus.push('dropped');
        continue;
      }
      var baseStr = state.oligos[i].baseStr;
      var mutated = false;
      if (mutation > 0) {
        var chars = baseStr.split('');
        for (var j = 0; j < chars.length; j++) {
          if (rng() < mutation) {
            mutated = true;
            var cur = DNA.BASE_REV[chars[j]];
            var nb;
            do { nb = Math.floor(rng() * 4); } while (nb === cur);
            chars[j] = DNA.BASE_MAP[nb];
          }
        }
        baseStr = chars.join('');
      }
      state.channelStatus.push(mutated ? 'mutated' : 'ok');
      received.push(baseStr);
    }
    state.channelReceived = received;
    renderChannel();
  }

  function renderChannel() {
    var container = $('channelVis');
    container.innerHTML = '';
    var okCount = 0, mutCount = 0, dropCount = 0;

    state.channelStatus.forEach(function (st, i) {
      var chip = document.createElement('div');
      chip.className = 'oligo-chip ' + st;
      chip.textContent = (i + 1);
      if (st === 'ok') okCount++;
      else if (st === 'mutated') mutCount++;
      else dropCount++;
      container.appendChild(chip);
    });

    animateIn(container, '.oligo-chip');

    var total = state.channelStatus.length;
    var received = state.channelReceived.length;
    $('channelSummary').innerHTML =
      '发送 <span class="hl">' + total + '</span> 条 oligo：' +
      '完好 <span style="color:#81c784">' + okCount + '</span> 条，' +
      '突变 <span style="color:#ffb74d">' + mutCount + '</span> 条，' +
      '丢失 <span style="color:#ff6b6b">' + dropCount + '</span> 条。' +
      '接收端拿到 <span class="hl">' + received + '</span> 条，准备解码。';

    $('decodeBtn').disabled = received.length === 0;
    state.decodeRan = false;
    resetDecode();
  }

  // ── 解码动画 ──
  function resetDecode() {
    $('decodeSegments').innerHTML = '<p class="placeholder-text">模拟测序后，点下方按钮开始解码</p>';
    $('decodeLog').innerHTML = '';
    $('decodeResult').textContent = '';
    $('decodeResult').className = 'decode-result';
    $('decodeCanvasWrap').style.display = 'none';
  }

  function doDecode() {
    if (!state.channelReceived || state.channelReceived.length === 0) {
      showToast('没有可解码的数据');
      return;
    }

    var result = DNA.decode(state.channelReceived, state.K, state.segLen);
    state.decodeRan = true;
    renderDecodeAnimation(result);
  }

  function renderDecodeAnimation(result) {
    var segContainer = $('decodeSegments');
    var logEl = $('decodeLog');
    segContainer.innerHTML = '';
    logEl.innerHTML = '';

    // 图片模式：显示画布并初始化灰色
    var isImage = state.dataSource === 'image' && state.imageDims;
    var decodeCanvas = $('decodeCanvas');
    var decodeCtx = isImage ? decodeCanvas.getContext('2d') : null;
    var imgW = isImage ? state.imageDims.w : 0;
    var imgH = isImage ? state.imageDims.h : 0;
    var totalPixels = imgW * imgH;
    var decodeImgData = null;

    if (isImage) {
      $('decodeCanvasWrap').style.display = 'block';
      decodeCanvas.width = imgW;
      decodeCanvas.height = imgH;
      decodeImgData = decodeCtx.createImageData(imgW, imgH);
      // 初始化全部灰色
      for (var px = 0; px < totalPixels; px++) {
        decodeImgData.data[px * 4] = 50;
        decodeImgData.data[px * 4 + 1] = 50;
        decodeImgData.data[px * 4 + 2] = 55;
        decodeImgData.data[px * 4 + 3] = 255;
      }
      decodeCtx.putImageData(decodeImgData, 0, 0);
    } else {
      $('decodeCanvasWrap').style.display = 'none';
    }

    // 渲染段方块（初始全部未知）
    var segEls = [];
    for (var i = 0; i < state.K; i++) {
      var seg = document.createElement('div');
      seg.className = 'decode-seg unknown';
      seg.innerHTML = '<span class="seg-id">' + i + '</span><span>?</span>';
      segContainer.appendChild(seg);
      segEls.push(seg);
    }

    var resultEl = $('decodeResult');
    resultEl.textContent = '';
    resultEl.className = 'decode-result';

    // 用 GSAP 时间轴逐轮播放
    var tl = (typeof gsap !== 'undefined') ? gsap.timeline() : null;
    var steps = result.steps;
    var hasGsap = !!tl;

    if (steps.length === 0) {
      // 没有任何度 1 液滴
      logEl.innerHTML = '<span class="log-stuck">没有任何度 1 液滴，无法启动解码。</span>';
      showDecodeResult(result, resultEl);
      return;
    }

    steps.forEach(function (step, roundIdx) {
      var delay = hasGsap ? tl.duration() : (roundIdx * 0.8);

      (function (s, d) {
        if (hasGsap) {
          tl.call(function () {
            applyDecodeStep(s, segEls, logEl, result, decodeCtx, decodeImgData, imgW, totalPixels);
          }, null, '+=0.3');
        } else {
          setTimeout(function () {
            applyDecodeStep(s, segEls, logEl, result, decodeCtx, decodeImgData, imgW, totalPixels);
          }, d * 1000);
        }
      })(step, delay);
    });

    // 结束后显示结果
    var finalDelay = hasGsap ? tl.duration() + 0.3 : (steps.length * 0.8 + 0.3) * 1000;
    if (hasGsap) {
      tl.call(function () { showDecodeResult(result, resultEl); });
    } else {
      setTimeout(function () { showDecodeResult(result, resultEl); }, finalDelay);
    }
  }

  function applyDecodeStep(step, segEls, logEl, result, decodeCtx, decodeImgData, imgW, totalPixels) {
    // 高亮正在解出的段
    step.resolved.forEach(function (idx) {
      var el = segEls[idx];
      if (!el) return;
      el.classList.add('active');
      el.classList.remove('unknown');
    });

    // 图片模式：把解出段的像素画到 canvas（金色高亮）
    if (decodeCtx && decodeImgData) {
      var segLen = state.segLen;
      step.resolved.forEach(function (idx) {
        if (result.resolvedMap[idx] === undefined) return;
        var segData = result.resolvedMap[idx];
        var startByte = idx * segLen;
        var endByte = Math.min(startByte + segLen, totalPixels);
        for (var b = startByte; b < endByte; b++) {
          // 金色高亮
          decodeImgData.data[b * 4] = 255;
          decodeImgData.data[b * 4 + 1] = 215;
          decodeImgData.data[b * 4 + 2] = 0;
          decodeImgData.data[b * 4 + 3] = 255;
        }
      });
      decodeCtx.putImageData(decodeImgData, 0, 0);
    }

    // 短暂延迟后标记为已解出 + 像素恢复灰度
    setTimeout(function () {
      step.resolved.forEach(function (idx) {
        var el = segEls[idx];
        if (!el) return;
        el.classList.remove('active');
        el.classList.add('resolved');
        el.innerHTML = '<span class="seg-id">' + idx + '</span><span>OK</span>';
      });
      // 像素从金色渐变回正常灰度
      if (decodeCtx && decodeImgData) {
        var segLen2 = state.segLen;
        step.resolved.forEach(function (idx) {
          if (result.resolvedMap[idx] === undefined) return;
          var segData = result.resolvedMap[idx];
          var startByte = idx * segLen2;
          var endByte = Math.min(startByte + segLen2, totalPixels);
          for (var b2 = startByte; b2 < endByte; b2++) {
            var val = segData[b2 - startByte];
            decodeImgData.data[b2 * 4] = val;
            decodeImgData.data[b2 * 4 + 1] = val;
            decodeImgData.data[b2 * 4 + 2] = val;
            decodeImgData.data[b2 * 4 + 3] = 255;
          }
        });
        decodeCtx.putImageData(decodeImgData, 0, 0);
      }
    }, 300);

    // 日志
    var logLine = document.createElement('div');
    logLine.innerHTML = '<span class="log-round">第 ' + step.round + ' 轮</span>：解出段 ' +
      '<span class="log-resolved">[' + step.resolved.join(', ') + ']</span>' +
      '，累计 ' + step.totalResolved + '/' + state.K;
    logEl.appendChild(logLine);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showDecodeResult(result, resultEl) {
    if (result.success) {
      if (state.dataSource === 'image' && state.imageDims) {
        // 图片成功：画最终完整图
        var canvas = $('decodeCanvas');
        grayscaleToCanvas(canvas, result.data, state.imageDims.w, state.imageDims.h);
        resultEl.innerHTML = '解码成功！图片完整恢复：<span class="hl">' + state.dataBytes.length + '</span> 字节，一字不差。';
      } else {
        // 文本成功
        var rawLen = state.dataBytes.length;
        var text = DNA.bytesToText(result.data.slice(0, rawLen));
        resultEl.innerHTML = '解码成功！还原数据：<span class="hl">' + escapeHtml(text) + '</span>' +
          '（' + rawLen + ' 字节，一字不差）';
      }
      resultEl.className = 'decode-result success';
    } else {
      var remaining = state.K - (result.steps.length > 0 ? result.steps[result.steps.length - 1].totalResolved : 0);
      if (state.dataSource === 'image') {
        resultEl.innerHTML = '解码失败：剩余 <span class="hl">' + remaining + '</span> 段无法恢复。' +
          '画布上灰色区域就是还没救回来的像素。试试调高冗余率或降低丢失率。';
      } else {
        resultEl.innerHTML = '解码失败：剩余 <span class="hl">' + remaining + '</span> 段无法恢复。' +
          '丢失过多，冗余不够--试试调高冗余率或降低丢失率。';
      }
      resultEl.className = 'decode-result fail';
    }
  }

  // ── 冗余扫描图表 ──
  function initSweep() {
    $('sweepBtn').addEventListener('click', function () {
      runSweep();
    });

    $('sweepDropoutSlider').addEventListener('input', function () {
      $('sweepDropoutVal').textContent = this.value + '%';
    });

    // 初始绘制
    loadChartJS().then(function () {
      runSweep();
    });
  }

  function runSweep() {
    if (!state.dataBytes || state.dataBytes.length === 0) return;
    var dropout = parseInt($('sweepDropoutSlider').value, 10) / 100;
    var btn = $('sweepBtn');
    btn.disabled = true;
    btn.textContent = '模拟中...';

    // 大数据（如图片 576 字节）截断到 64 字节，避免蒙特卡洛卡顿
    var sweepBytes = state.dataBytes.length > 64 ? state.dataBytes.slice(0, 64) : state.dataBytes;

    // 用 setTimeout 让 UI 更新
    setTimeout(function () {
      var sweep = DNA.sweepRedundancy(sweepBytes, {
        rates: [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 1.6, 2.0],
        trials: 25,
        dropoutRate: dropout,
        segLen: state.segLen
      });
      drawSweepChart(sweep, dropout);
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-chart-line"></i> 跑蒙特卡洛模拟';
    }, 50);
  }

  function drawSweepChart(sweep, dropout) {
    var ctx = $('sweepChart').getContext('2d');
    if (state.sweepChart) state.sweepChart.destroy();

    var labels = sweep.map(function (r) { return (r.redundancy * 100) + '%'; });
    var data = sweep.map(function (r) { return r.successRate * 100; });

    state.sweepChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '解码成功率',
          data: data,
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#ffd700',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return '冗余率: ' + items[0].label; },
              label: function (item) { return '成功率: ' + item.parsed.y.toFixed(0) + '%'; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '冗余率', color: '#888', font: { size: 12 } },
            ticks: { color: '#888', maxTicksLimit: 9, font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: '解码成功率', color: '#888', font: { size: 12 } },
            min: 0, max: 105,
            ticks: {
              color: '#888', font: { size: 10 },
              callback: function (v) { return v + '%'; }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });

    // 找到第一个达到 100% 的冗余率
    var threshold = '—';
    for (var i = 0; i < sweep.length; i++) {
      if (sweep[i].successRate >= 0.99) {
        threshold = (sweep[i].redundancy * 100) + '%';
        break;
      }
    }
    $('sweepNote').innerHTML =
      '信道丢失率 <span class="hl">' + (dropout * 100) + '%</span> 时，' +
      '冗余率越高成功率越高。达到 100% 成功率所需的最小冗余约 <span class="hl">' + threshold + '</span>。' +
      '注意零冗余附近几乎必定失败--没有冗余的喷泉码扛不住任何丢包。';
  }

  // ── 密度计算器 ──
  function initDensity() {
    function update() {
      var bytes = parseInt($('densityInput').value, 10);
      if (!bytes || bytes < 1) {
        $('densityResult').innerHTML = '<p class="placeholder-text">请输入有效的字节数</p>';
        return;
      }
      var scale = DNA.describeScale(bytes);
      var mass = scale.massGram;

      var html = '';
      html += '<div class="density-card full">';
      html += '<div class="dc-label">所需 DNA 质量</div>';
      html += '<div class="dc-value">' + formatMass(mass) + '</div>';
      html += '<div class="dc-sub">按 215 PB/克 密度计算 · 约 ' + scale.oligosEst + ' 条 oligo</div>';
      html += '</div>';

      html += '<div class="density-card">';
      html += '<div class="dc-label">数据量</div>';
      html += '<div class="dc-value">' + formatBytes(bytes) + '</div>';
      html += '<div class="dc-sub">' + bytes.toLocaleString() + ' 字节</div>';
      html += '</div>';

      html += '<div class="density-card">';
      html += '<div class="dc-label">同等数据所需硬盘</div>';
      var hdMass = bytes / 5e8; // 假设硬盘 ~500 GB/kg
      html += '<div class="dc-value">' + formatMass(hdMass) + '</div>';
      html += '<div class="dc-sub">DNA 比硬盘致密约 ' + (hdMass / mass).toExponential(1) + ' 倍</div>';
      html += '</div>';

      html += '<div class="density-card full">';
      html += '<div class="dc-label">直观对比</div>';
      html += '<div class="density-compare">';
      scale.comparisons.forEach(function (c) {
        var ratio = mass / c.mass;
        var barW = Math.min(100, Math.max(2, ratio * 100));
        if (ratio > 1) barW = 100;
        html += '<div class="compare-row">';
        html += '<span style="min-width:80px">' + c.object + '</span>';
        html += '<div class="compare-bar-wrap"><div class="compare-bar-fill" style="width:' + barW + '%"></div></div>';
        if (ratio < 1) {
          html += '<span style="min-width:100px;text-align:right">DNA 是它的 ' + ratio.toExponential(1) + ' 倍重</span>';
        } else {
          html += '<span style="min-width:100px;text-align:right">它比 DNA 重 ' + (c.mass / mass).toExponential(1) + ' 倍</span>';
        }
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';

      $('densityResult').innerHTML = html;
    }

    $('densityInput').addEventListener('input', update);
    document.querySelectorAll('#densityPresets button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('densityInput').value = btn.dataset.bytes;
        update();
      });
    });
    update();
  }

  // ── 通用入场动画 ──
  function animateIn(container, selector) {
    var items = container.querySelectorAll(selector);
    if (items.length === 0) return;
    if (typeof gsap === 'undefined') return; // 无 GSAP 保持 CSS 默认
    gsap.killTweensOf(items);
    gsap.fromTo(items,
      { opacity: 0, y: 12 },
      {
        opacity: 1, y: 0, duration: 0.35, stagger: 0.04,
        ease: 'power2.out', overwrite: true, clearProps: 'opacity,transform'
      }
    );
    // 兜底
    var safetyMs = 350 + items.length * 40 + 400;
    setTimeout(function () {
      items.forEach(function (el) {
        el.style.opacity = '';
        el.style.transform = '';
      });
    }, safetyMs);
  }

  // ── 绑定步骤按钮 ──
  function bindStepButtons() {
    $('step1Btn').addEventListener('click', function () {
      doStep1();
      showToast('已按段长 ' + state.segLen + ' 切分');
    });
    $('step2Btn').addEventListener('click', doStep2);
    $('step3Btn').addEventListener('click', doStep3);
    $('step4Btn').addEventListener('click', doStep4);
    $('singleDropletBtn').addEventListener('click', doSingleDroplet);
    $('retrySeedBtn').addEventListener('click', doRetrySeed);

    $('redundancySlider2').addEventListener('input', function () {
      state.redundancy = parseInt(this.value, 10) / 100;
      $('redundancyVal2').textContent = this.value + '%';
      var target = Math.max(state.K + 1, Math.ceil(state.K * (1 + state.redundancy)));
      $('targetCount').textContent = target;
    });
    // 初始目标条数
    var initTarget = Math.max(1, Math.ceil(1 * (1 + state.redundancy)));
    $('targetCount').textContent = initTarget;

    $('channelBtn').addEventListener('click', doChannel);
    $('decodeBtn').addEventListener('click', doDecode);

    $('dropoutSlider').addEventListener('input', function () {
      $('dropoutVal').textContent = this.value + '%';
    });
    $('mutationSlider').addEventListener('input', function () {
      $('mutationVal').textContent = this.value + '%';
    });
  }

  // ── Hero 与回到顶部 ──
  function initMisc() {
    $('heroBtn').addEventListener('click', function () {
      $('dataSection').scrollIntoView({ behavior: 'smooth' });
    });
    $('topBtn').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── 初始化 ──
  function init() {
    initDataCards();
    bindStepButtons();
    initDensity();
    initMisc();

    // 打开即有默认数据在跑（先初始化数据，再启动需数据的图表）
    selectData('DNA存储');
    initSweep();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
