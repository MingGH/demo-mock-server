/**
 * app.js - 视觉密码学演示交互逻辑
 *
 * 流程：选图 -> 二值化+拆分 -> 拖拽叠加解密
 * 使用 interact.js 拖拽，GSAP 动画
 */
(function () {
  'use strict';

  var WORK_SIZE = 256;
  var SNAP_PX = 28; // 磁吸对齐半径（画布像素）

  var currentImage = null;
  var binaryData = null;
  var shares = null;
  var dragX = 0;
  var dragY = 0;
  var isAligned = false;
  var gsapAnimating = false;
  var gsapAnimState = null;

  var el = {};

  function init() {
    cacheElements();
    bindEvents();
    loadDefaultImage();
  }

  function nfTrack(name, props, opts) {
    try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
  }
  (function () {
    try { if (window.NFTrack) window.NFTrack.trackOnce('session_start', {}); } catch (e) {}
    window.addEventListener('pagehide', function () {
      nfTrack('session_end', { reason: 'leave' }, { force: true });
    });
  })();

  function cacheElements() {
    var ids = [
      'heroBtn', 'uploadArea', 'fileInput', 'thresholdSlider', 'thresholdVal',
      'splitBtn', 'canvasArea', 'originalCanvas', 'share1Canvas', 'share2Canvas',
      'step2', 'step3', 'overlayStage', 'resultCanvas', 'dragCanvas',
      'autoAlignBtn', 'resetAlignBtn', 'alignIndicator', 'targetGuide', 'distHint',
      'downloadBtn'
    ];
    for (var i = 0; i < ids.length; i++) {
      el[ids[i]] = document.getElementById(ids[i]);
    }
    el.presetCards = document.querySelectorAll('.preset-card');
  }

  function bindEvents() {
    el.heroBtn.addEventListener('click', function () {
      document.getElementById('step1').scrollIntoView({ behavior: 'smooth' });
    });

    for (var i = 0; i < el.presetCards.length; i++) {
      (function (card) {
        card.addEventListener('click', function () {
          selectPreset(card.dataset.preset, card);
        });
      })(el.presetCards[i]);
    }

    el.uploadArea.addEventListener('click', function () {
      el.fileInput.click();
    });
    el.fileInput.addEventListener('change', function (e) {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });
    el.uploadArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      el.uploadArea.classList.add('dragover');
    });
    el.uploadArea.addEventListener('dragleave', function () {
      el.uploadArea.classList.remove('dragover');
    });
    el.uploadArea.addEventListener('drop', function (e) {
      e.preventDefault();
      el.uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    el.thresholdSlider.addEventListener('input', function () {
      el.thresholdVal.textContent = el.thresholdSlider.value;
    });

    el.splitBtn.addEventListener('click', doSplit);
    el.autoAlignBtn.addEventListener('click', autoAlign);
    el.resetAlignBtn.addEventListener('click', resetAlign);
    el.downloadBtn.addEventListener('click', downloadShares);
  }

  function loadDefaultImage() {
    loadImage('images/beauty.png');
  }

  function selectPreset(preset, card) {
    for (var i = 0; i < el.presetCards.length; i++) {
      el.presetCards[i].classList.remove('active');
    }
    card.classList.add('active');
    var presetId = parseInt(card.dataset.id, 10) || 0;
    nfTrack('image_select', { source: 'preset', preset_id: presetId });
    loadImage('images/' + preset + '.png');
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    nfTrack('image_select', { source: 'upload' });
    var reader = new FileReader();
    reader.onload = function (e) {
      loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function loadImage(src) {
    var img = new Image();
    img.onload = function () {
      currentImage = img;
      doSplit();
    };
    img.src = src;
  }

  function doSplit() {
    if (!currentImage) return;

    var threshold = parseInt(el.thresholdSlider.value, 10);
    nfTrack('split', { threshold: threshold });

    var offCanvas = document.createElement('canvas');
    offCanvas.width = WORK_SIZE;
    offCanvas.height = WORK_SIZE;
    var offCtx = offCanvas.getContext('2d');
    var imgW = currentImage.naturalWidth;
    var imgH = currentImage.naturalHeight;
    var size = Math.min(imgW, imgH);
    var sx = (imgW - size) / 2;
    var sy = (imgH - size) / 2;
    offCtx.drawImage(currentImage, sx, sy, size, size, 0, 0, WORK_SIZE, WORK_SIZE);

    var imageData = offCtx.getImageData(0, 0, WORK_SIZE, WORK_SIZE);
    var gray = toGrayscale(imageData);
    var binary = floydSteinberg(gray, WORK_SIZE, WORK_SIZE, threshold);
    binaryData = binary;

    shares = splitShares(binary, WORK_SIZE, WORK_SIZE);

    el.canvasArea.style.display = 'block';
    renderBinaryToCanvas(binary, WORK_SIZE, WORK_SIZE, el.originalCanvas);
    renderShareToCanvas(shares.share1, shares.width, shares.height, el.share1Canvas);
    renderShareToCanvas(shares.share2, shares.width, shares.height, el.share2Canvas);

    el.step3.style.display = 'block';
    setupOverlayStage();

    el.step2.scrollIntoView({ behavior: 'smooth' });
  }

  function renderBinaryToCanvas(data, width, height, canvas) {
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(width, height);
    for (var i = 0; i < data.length; i++) {
      var v = data[i];
      imageData.data[i * 4] = v;
      imageData.data[i * 4 + 1] = v;
      imageData.data[i * 4 + 2] = v;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function renderShareToCanvas(share, width, height, canvas) {
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(width, height);
    for (var i = 0; i < share.length; i++) {
      var v = share[i];
      imageData.data[i * 4] = v;
      imageData.data[i * 4 + 1] = v;
      imageData.data[i * 4 + 2] = v;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * 渲染可拖动的胶片层：黑像素不透明，白像素完全透明。
   * 模拟真实透明胶片叠放，白像素不挡光，叠加区域直接显示解密结果。
   */
  function renderDragLayerToCanvas(share, width, height, canvas) {
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(width, height);
    for (var i = 0; i < share.length; i++) {
      var v = share[i];
      imageData.data[i * 4] = 0;
      imageData.data[i * 4 + 1] = 0;
      imageData.data[i * 4 + 2] = 0;
      imageData.data[i * 4 + 3] = (v === 0) ? 255 : 0;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function downloadShares() {
    if (!shares) return;
    nfTrack('download_shares', {});
    saveCanvasAsPng(el.share1Canvas, 'noise-A.png');
    // 错开触发，避免浏览器拦截第二个下载
    setTimeout(function () {
      saveCanvasAsPng(el.share2Canvas, 'noise-B.png');
    }, 350);
  }

  function saveCanvasAsPng(canvas, filename) {
    var link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function setupOverlayStage() {
    var w = shares.width;
    var h = shares.height;

    el.resultCanvas.width = w;
    el.resultCanvas.height = h;
    el.dragCanvas.width = w;
    el.dragCanvas.height = h;

    renderDragLayerToCanvas(shares.share2, w, h, el.dragCanvas);

    dragX = Math.round(w * 0.5);
    dragY = 0;
    isAligned = false;
    el.alignIndicator.style.display = 'none';
    el.targetGuide.style.display = 'block';
    el.distHint.style.display = 'none';

    updateOverlay();
    setupDrag();
  }

  function setupDrag() {
    if (!window.interact) return;
    window.interact(el.dragCanvas).unset();
    window.interact(el.dragCanvas).draggable({
      listeners: {
        start: function () {
          el.dragCanvas.classList.add('dragging');
          el.distHint.style.display = 'block';
          if (gsapAnimating) {
            if (gsapAnimState) gsap.killTweensOf(gsapAnimState);
            gsapAnimState = null;
            gsapAnimating = false;
          }
          nfTrack('drag_start', {});
        },
        move: function (event) {
          var rect = el.resultCanvas.getBoundingClientRect();
          var scaleX = el.resultCanvas.width / rect.width;
          var scaleY = el.resultCanvas.height / rect.height;
          dragX += event.dx * scaleX;
          dragY += event.dy * scaleY;
          updateOverlay();

          var dist = Math.sqrt(dragX * dragX + dragY * dragY);
          el.distHint.textContent = '还差 ' + Math.round(dist) + 'px';
          if (dist < SNAP_PX) {
            el.distHint.textContent = '松手即可对齐';
          }
          // 拖离对齐位置时取消对齐状态
          if (isAligned && dist > SNAP_PX) {
            isAligned = false;
            el.alignIndicator.style.display = 'none';
            el.targetGuide.style.display = 'block';
          }
        },
        end: function () {
          el.dragCanvas.classList.remove('dragging');
          el.distHint.style.display = 'none';
          checkAlignment();
        }
      }
    });
  }

  function updateOverlay() {
    if (!shares) return;
    var w = shares.width;
    var h = shares.height;
    var px = Math.round(dragX);
    var py = Math.round(dragY);
    var result = overlayPartial(shares.share1, shares.share2, w, h, px, py);

    var ctx = el.resultCanvas.getContext('2d');
    var imageData = ctx.createImageData(w, h);
    for (var i = 0; i < result.length; i++) {
      var v = result[i];
      imageData.data[i * 4] = v;
      imageData.data[i * 4 + 1] = v;
      imageData.data[i * 4 + 2] = v;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    var rect = el.resultCanvas.getBoundingClientRect();
    var cssScale = rect.width / w;
    el.dragCanvas.style.transform =
      'translate(' + (dragX * cssScale) + 'px, ' + (dragY * cssScale) + 'px)';
  }

  function checkAlignment() {
    var dist = Math.sqrt(dragX * dragX + dragY * dragY);
    if (dist < SNAP_PX) {
      if (!isAligned) {
        // 磁吸：吸附到精确对齐位置
        dragX = 0;
        dragY = 0;
        updateOverlay();
        isAligned = true;
        el.alignIndicator.style.display = 'inline-flex';
        el.targetGuide.style.display = 'none';
        nfTrack('align_complete', { auto: false });
      }
    } else {
      isAligned = false;
      el.alignIndicator.style.display = 'none';
      el.targetGuide.style.display = 'block';
    }
  }

  function autoAlign() {
    if (!shares) return;
    if (gsapAnimating) return;
    if (!window.gsap) return;
    gsapAnimating = true;
    nfTrack('align_complete', { auto: true });
    el.targetGuide.style.display = 'none';

    gsapAnimState = { x: dragX, y: dragY };
    window.gsap.to(gsapAnimState, {
      x: 0, y: 0, duration: 1.5, ease: 'power3.inOut',
      onUpdate: function () {
        dragX = gsapAnimState.x;
        dragY = gsapAnimState.y;
        updateOverlay();
      },
      onComplete: function () {
        gsapAnimState = null;
        gsapAnimating = false;
        isAligned = true;
        el.alignIndicator.style.display = 'inline-flex';
      }
    });
  }

  function resetAlign() {
    if (!shares) return;
    if (gsapAnimating) return;
    dragX = Math.round(shares.width * 0.5);
    dragY = 0;
    isAligned = false;
    el.alignIndicator.style.display = 'none';
    el.targetGuide.style.display = 'block';
    el.distHint.style.display = 'none';
    updateOverlay();
  }

  init();
})();
