/**
 * app.js - ECB 企鹅图演示交互逻辑
 *
 * 流程：选图 -> 了解模式 -> 加密对比 -> 块重复可视化
 * 使用真实 AES-128 加密（CryptoJS），非视觉模拟
 */
(function () {
  'use strict';

  var PROCESSING_SIZE = 256; // 处理尺寸（4 的倍数，保证 RGBA 总字节是 16 的倍数）
  var rawImageData = null;   // 原始图像数据（未量化）
  var currentImageData = null; // 当前图像数据（已量化，用于加密）
  var aesKey = null;
  var iv = null;
  var hasEncrypted = false;

  var el = {};

  // ── 初始化 ──
  function init() {
    cacheElements();
    bindEvents();
    aesKey = ECBEngine.generateAesKey();
    iv = ECBEngine.generateIV();
    updateQuantizeLabel();
  }

  function cacheElements() {
    var ids = [
      'heroBtn', 'uploadZone', 'fileInput', 'originalPreview', 'originalCanvas',
      'step1', 'step2', 'step3', 'quantizeSlider', 'quantizeValue', 'nextBtn',
      'encryptBtn', 'progressSection', 'progressBar', 'progressText',
      'resultComparison', 'ecbCanvas', 'cbcCanvas', 'ecbStats', 'cbcStats',
      'retrySection', 'retryBtn', 'blockViz',
      'blockVizOriginalCanvas', 'blockVizEcbCanvas', 'blockVizCbcCanvas',
      'origBlockStats', 'ecbBlockStats', 'cbcBlockStats',
      'shareBtn', 'shareToast'
    ];
    for (var i = 0; i < ids.length; i++) {
      el[ids[i]] = document.getElementById(ids[i]);
    }
    el.presetCards = document.querySelectorAll('.preset-card');
  }

  function bindEvents() {
    el.heroBtn.addEventListener('click', function () {
      scrollToSection(el.step1);
    });

    el.presetCards.forEach(function (card) {
      card.addEventListener('click', function () {
        selectPreset(card.dataset.preset, card);
      });
    });

    el.uploadZone.addEventListener('click', function () {
      el.fileInput.click();
    });

    el.fileInput.addEventListener('change', handleFileUpload);

    el.quantizeSlider.addEventListener('input', function () {
      updateQuantizeLabel();
      if (rawImageData) {
        applyQuantization();
        renderImageData(el.originalCanvas, currentImageData);
        // 量化变化后重置加密结果
        if (hasEncrypted) {
          hasEncrypted = false;
          el.resultComparison.style.display = 'none';
          el.blockViz.style.display = 'none';
          el.retrySection.style.display = 'none';
          el.progressSection.style.display = 'none';
          el.encryptBtn.disabled = false;
        }
      }
    });

    el.nextBtn.addEventListener('click', function () {
      showStep(3);
      scrollToSection(el.step3);
    });

    el.encryptBtn.addEventListener('click', performEncryption);
    el.retryBtn.addEventListener('click', performEncryption);
    el.shareBtn.addEventListener('click', copyShareLink);
  }

  // ── 预设图片选择 ──
  function selectPreset(name, card) {
    el.presetCards.forEach(function (c) { c.classList.remove('active'); });
    if (card) card.classList.add('active');

    if (name === 'tux') {
      loadTuxImage(function (imageData) {
        if (imageData) setSelectedImage(imageData);
      });
    } else {
      var imageData = generatePresetImage(name);
      setSelectedImage(imageData);
    }
  }

  function loadTuxImage(callback) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = PROCESSING_SIZE;
      canvas.height = PROCESSING_SIZE;
      var ctx = canvas.getContext('2d');
      var minDim = Math.min(img.width, img.height);
      var sx = (img.width - minDim) / 2;
      var sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, PROCESSING_SIZE, PROCESSING_SIZE);
      callback(ctx.getImageData(0, 0, PROCESSING_SIZE, PROCESSING_SIZE));
    };
    img.onerror = function () { callback(null); };
    img.src = 'images/Tux.png';
  }

  function generatePresetImage(name) {
    var canvas = document.createElement('canvas');
    canvas.width = PROCESSING_SIZE;
    canvas.height = PROCESSING_SIZE;
    var ctx = canvas.getContext('2d');

    if (name === 'blocks') {
      var half = PROCESSING_SIZE / 2;
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(0, 0, half, half);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(half, 0, half, half);
      ctx.fillStyle = '#3498db'; ctx.fillRect(0, half, half, half);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(half, half, half, half);
    } else if (name === 'checker') {
      var cellSize = PROCESSING_SIZE / 8;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#ff6b6b' : '#1a1a2e';
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    } else if (name === 'gradient') {
      var grad = ctx.createLinearGradient(0, 0, PROCESSING_SIZE, 0);
      grad.addColorStop(0, '#e74c3c');
      grad.addColorStop(0.5, '#f1c40f');
      grad.addColorStop(1, '#3498db');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, PROCESSING_SIZE, PROCESSING_SIZE);
    }

    return ctx.getImageData(0, 0, PROCESSING_SIZE, PROCESSING_SIZE);
  }

  // ── 文件上传 ──
  function handleFileUpload(e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = PROCESSING_SIZE;
        canvas.height = PROCESSING_SIZE;
        var ctx = canvas.getContext('2d');
        var minDim = Math.min(img.width, img.height);
        var sx = (img.width - minDim) / 2;
        var sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, PROCESSING_SIZE, PROCESSING_SIZE);
        el.presetCards.forEach(function (c) { c.classList.remove('active'); });
        setSelectedImage(ctx.getImageData(0, 0, PROCESSING_SIZE, PROCESSING_SIZE));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── 设置选中的图像 ──
  function setSelectedImage(imageData) {
    rawImageData = {
      data: new Uint8ClampedArray(imageData.data),
      width: imageData.width,
      height: imageData.height
    };
    applyQuantization();
    renderImageData(el.originalCanvas, currentImageData);
    el.originalPreview.style.display = 'block';

    // 重置加密状态
    hasEncrypted = false;
    el.resultComparison.style.display = 'none';
    el.blockViz.style.display = 'none';
    el.retrySection.style.display = 'none';
    el.progressSection.style.display = 'none';
    el.encryptBtn.disabled = false;

    showStep(2);
    scrollToSection(el.step2);
  }

  // ── 色彩量化 ──
  function applyQuantization() {
    var levels = parseInt(el.quantizeSlider.value, 10);
    currentImageData = ECBEngine.quantizeColors(rawImageData, levels);
  }

  function updateQuantizeLabel() {
    var levels = parseInt(el.quantizeSlider.value, 10);
    var colors = levels * levels * levels;
    el.quantizeValue.textContent = levels + ' 级 / ' + colors + ' 色';
  }

  // ── 渲染 ImageData 到 Canvas ──
  function renderImageData(canvas, imageData) {
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    var ctx = canvas.getContext('2d');
    var imgData = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
    ctx.putImageData(imgData, 0, 0);
  }

  // ── 显示步骤 ──
  function showStep(n) {
    if (n >= 2) el.step2.style.display = 'block';
    if (n >= 3) el.step3.style.display = 'block';
  }

  // ── 滚动到指定区域 ──
  function scrollToSection(section) {
    setTimeout(function () {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  // ── 执行加密 ──
  function performEncryption() {
    var isRetry = hasEncrypted;

    el.encryptBtn.disabled = true;
    el.retryBtn.disabled = true;
    el.progressSection.style.display = 'block';
    el.resultComparison.style.display = 'none';
    el.blockViz.style.display = 'none';
    el.retrySection.style.display = 'none';
    el.progressBar.style.width = '0%';

    if (isRetry) {
      aesKey = ECBEngine.generateAesKey();
      iv = ECBEngine.generateIV();
    }

    el.progressText.textContent = '生成 AES-128 密钥...';
    animateProgress(0, 30, 400, function () {
      el.progressText.textContent = 'ECB 加密中（每块独立加密）...';
      animateProgress(30, 55, 400, function () {
        var bytes = ECBEngine.imageDataToBytes(currentImageData);
        var ecbResult = ECBEngine.encryptECB(aesKey, bytes);

        el.progressText.textContent = 'CBC 加密中（块间链接 + IV）...';
        animateProgress(55, 80, 400, function () {
          var cbcResult = ECBEngine.encryptCBC(aesKey, bytes, iv);

          el.progressText.textContent = '渲染结果 + 块重复分析...';
          animateProgress(80, 100, 300, function () {
            showResults(bytes, ecbResult, cbcResult);
          });
        });
      });
    });
  }

  function animateProgress(from, to, duration, callback) {
    var startTime = Date.now();
    var interval = setInterval(function () {
      var elapsed = Date.now() - startTime;
      var pct = Math.min(from + (to - from) * (elapsed / duration), to);
      el.progressBar.style.width = pct + '%';
      if (elapsed >= duration) {
        clearInterval(interval);
        setTimeout(callback, 50);
      }
    }, 30);
  }

  // ── 显示加密结果 ──
  function showResults(origBytes, ecbBytes, cbcBytes) {
    var ecbImageData = ECBEngine.bytesToImageData(ecbBytes, currentImageData.width, currentImageData.height);
    var cbcImageData = ECBEngine.bytesToImageData(cbcBytes, currentImageData.width, currentImageData.height);

    renderImageData(el.ecbCanvas, ecbImageData);
    renderImageData(el.cbcCanvas, cbcImageData);

    // 重复块分析
    var origDup = ECBEngine.detectDuplicateBlocks(origBytes);
    var ecbDup = ECBEngine.detectDuplicateBlocks(ecbBytes);
    var cbcDup = ECBEngine.detectDuplicateBlocks(cbcBytes);

    updateStats(origDup, ecbDup, cbcDup);

    // 块可视化
    visualizeBlocks(el.blockVizOriginalCanvas, currentImageData, origDup);
    visualizeBlocks(el.blockVizEcbCanvas, ecbImageData, ecbDup);
    visualizeBlocks(el.blockVizCbcCanvas, cbcImageData, cbcDup);

    // 显示结果
    el.progressSection.style.display = 'none';
    el.resultComparison.style.display = 'grid';
    el.blockViz.style.display = 'block';
    el.retrySection.style.display = 'flex';
    el.encryptBtn.disabled = false;
    el.retryBtn.disabled = false;
    hasEncrypted = true;

    scrollToSection(el.resultComparison);
  }

  // ── 更新统计信息 ──
  function updateStats(origDup, ecbDup, cbcDup) {
    var total = origDup.totalBlocks;
    var origPct = total > 0 ? Math.round(origDup.duplicateCount / total * 100) : 0;
    var ecbPct = total > 0 ? Math.round(ecbDup.duplicateCount / total * 100) : 0;
    var cbcPct = total > 0 ? Math.round(cbcDup.duplicateCount / total * 100) : 0;

    el.ecbStats.innerHTML =
      '<span class="stat-num">' + total + '</span> 块，其中 <span class="stat-num">' +
      ecbDup.duplicateCount + '</span> 块重复（' + ecbPct + '%）。唯一块 <span class="stat-num">' +
      ecbDup.uniqueBlocks + '</span> / ' + total + '。密文块重复模式与原图一致，轮廓泄漏。';

    el.cbcStats.innerHTML =
      '<span class="stat-num">' + total + '</span> 块，其中 <span class="stat-num">' +
      cbcDup.duplicateCount + '</span> 块重复（' + cbcPct + '%）。唯一块 <span class="stat-num">' +
      cbcDup.uniqueBlocks + '</span> / ' + total + '。重复块全部打散，输出为纯噪声。';

    el.origBlockStats.innerHTML =
      '总块数 <span class="stat-num">' + total + '</span>，重复 <span class="stat-num">' +
      origDup.duplicateCount + '</span> 块（' + origPct + '%），唯一 <span class="stat-num">' +
      origDup.uniqueBlocks + '</span> 块。';

    el.ecbBlockStats.innerHTML =
      '重复 <span class="stat-danger">' + ecbDup.duplicateCount + '</span> 块（' + ecbPct +
      '%）。与原图完全一致，轮廓原样泄漏。';

    el.cbcBlockStats.innerHTML =
      '重复 <span class="stat-safe">' + cbcDup.duplicateCount + '</span> 块（' + cbcPct +
      '%）。全部打散，无任何模式泄漏。';
  }

  // ── 块重复可视化 ──
  var OVERLAY_COLORS = [
    [255, 107, 107],   // red
    [129, 199, 132],   // green
    [144, 202, 249],   // blue
    [255, 215, 0],     // gold
    [206, 147, 216],   // purple
    [255, 167, 38],    // orange
    [79, 195, 247],    // light blue
    [255, 138, 101]    // deep orange
  ];

  function visualizeBlocks(canvas, imageData, dupResult) {
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    ), 0, 0);

    var colorIdx = 0;
    var groups = dupResult.groups;
    for (var key in groups) {
      if (groups.hasOwnProperty(key) && groups[key].count > 1) {
        var c = OVERLAY_COLORS[colorIdx % OVERLAY_COLORS.length];
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.55)';
        colorIdx++;
        var indices = groups[key].indices;
        for (var i = 0; i < indices.length; i++) {
          var rect = ECBEngine.blockToPixelRect(indices[i], imageData.width);
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
      }
    }
  }

  // ── 复制分享链接 ──
  function copyShareLink() {
    var url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(showShareToast)
        .catch(function () { fallbackCopy(url); });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    var input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(input);
    showShareToast();
  }

  function showShareToast() {
    el.shareToast.classList.add('show');
    setTimeout(function () {
      el.shareToast.classList.remove('show');
    }, 2000);
  }

  // ── 启动 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
