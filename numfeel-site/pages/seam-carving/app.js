(function () {
  'use strict';

  var gsapReady = typeof gsap !== 'undefined' ? Promise.resolve(gsap) : new Promise(function (resolve) {
    var check = function () {
      if (typeof gsap !== 'undefined') resolve(gsap);
      else setTimeout(check, 50);
    };
    check();
  });

  var state = {
    originalData: null,
    carvedData: null,
    currentData: null,
    imgWidth: 0,
    imgHeight: 0,
    seams: [],
    direction: 'vertical',
    mode: 'normal',
    isCarving: false,
    hasCarved: false
  };

  var DOM = {};
  var ORIGINAL_WIDTH = 0;
  var MAX_SEAMS = 0;

  function cacheDOM() {
    DOM.heroSection = document.getElementById('heroSection');
    DOM.heroBtn = document.getElementById('heroBtn');
    DOM.step1 = document.getElementById('step1');
    DOM.step2 = document.getElementById('step2');
    DOM.step3 = document.getElementById('step3');
    DOM.uploadZone = document.getElementById('uploadZone');
    DOM.fileInput = document.getElementById('fileInput');
    DOM.useDefaultBtn = document.getElementById('useDefaultBtn');
    DOM.originalCanvas = document.getElementById('originalCanvas');
    DOM.resultCanvas = document.getElementById('resultCanvas');
    DOM.resultLabel = document.getElementById('resultLabel');
    DOM.seamCountSlider = document.getElementById('seamCountSlider');
    DOM.seamCountVal = document.getElementById('seamCountVal');
    DOM.targetWidthVal = document.getElementById('targetWidthVal');
    DOM.carveBtn = document.getElementById('carveBtn');
    DOM.resetBtn = document.getElementById('resetBtn');
    DOM.downloadBtn = document.getElementById('downloadBtn');
    DOM.surpriseBtn = document.getElementById('surpriseBtn');
    DOM.progressWrap = document.getElementById('progressWrap');
    DOM.progressFill = document.getElementById('progressFill');
    DOM.progressText = document.getElementById('progressText');
    DOM.statOrigSize = document.getElementById('statOrigSize');
    DOM.statNewSize = document.getElementById('statNewSize');
    DOM.statRemoved = document.getElementById('statRemoved');
    DOM.statTime = document.getElementById('statTime');
    DOM.factBox = document.getElementById('factBox');
    DOM.factText = document.getElementById('factText');
    DOM.toggleGroup = document.getElementById('toggleGroup');
    DOM.canvasArea = document.getElementById('canvasArea');
  }

  function init() {
    cacheDOM();
    bindEvents();
    animateHero();
  }

  function animateHero() {
    gsapReady.then(function () {
      gsap.fromTo(DOM.heroBtn, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' });
    });
  }

  function bindEvents() {
    DOM.heroBtn.addEventListener('click', function () {
      transitionToStep1();
    });

    DOM.uploadZone.addEventListener('click', function () {
      DOM.fileInput.click();
    });
    DOM.fileInput.addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
    });
    DOM.uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      DOM.uploadZone.classList.add('dragover');
    });
    DOM.uploadZone.addEventListener('dragleave', function () {
      DOM.uploadZone.classList.remove('dragover');
    });
    DOM.uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      DOM.uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    DOM.useDefaultBtn.addEventListener('click', function () {
      loadDefaultImage();
    });

    DOM.seamCountSlider.addEventListener('input', function () {
      var val = parseInt(DOM.seamCountSlider.value);
      DOM.seamCountVal.textContent = val;
      updateTargetWidth();
    });

    DOM.toggleGroup.addEventListener('click', function (e) {
      var btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        state.mode = 'normal';
        renderResult();
        return;
      }
      DOM.toggleGroup.querySelectorAll('.toggle-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      renderResult();
    });

    DOM.carveBtn.addEventListener('click', function () {
      startCarving();
    });

    DOM.resetBtn.addEventListener('click', function () {
      resetToOriginal();
    });

    DOM.downloadBtn.addEventListener('click', function () {
      downloadResult();
    });

    DOM.surpriseBtn.addEventListener('click', function () {
      surpriseMe();
    });
  }

  function transitionToStep1() {
    gsapReady.then(function (gsap) {
      gsap.to(DOM.heroSection, { opacity: 0, y: -30, duration: 0.4, ease: 'power2.out', onComplete: function () {
        DOM.heroSection.style.display = 'none';
        DOM.step1.style.display = 'block';
        gsap.fromTo(DOM.step1, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
      }});
    });
  }

  function transitionToStep2() {
    gsapReady.then(function (gsap) {
      DOM.step2.style.display = 'block';
      gsap.fromTo(DOM.step2, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
      gsap.fromTo('.control-group', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: 'power2.out' });
    });
  }

  function transitionToStep3() {
    gsapReady.then(function (gsap) {
      DOM.step3.style.display = 'block';
      gsap.fromTo(DOM.step3, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
    });
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      loadImageToCanvas(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function loadDefaultImage() {
    var src = 'images/sample.jpg';
    loadImageToCanvas(src);
  }

  function loadImageToCanvas(src) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var maxDim = 400;
      var w = img.width;
      var h = img.height;
      if (w > maxDim || h > maxDim) {
        var scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      w = Math.max(w, 32);
      h = Math.max(h, 32);

      state.imgWidth = w;
      state.imgHeight = h;
      ORIGINAL_WIDTH = w;

      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      var ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var imageData = ctx.getImageData(0, 0, w, h);
      state.originalData = new Uint8ClampedArray(imageData.data);
      state.currentData = new Uint8ClampedArray(state.originalData);
      state.carvedData = null;
      state.seams = [];
      state.hasCarved = false;
      state.mode = 'normal';

      MAX_SEAMS = Math.min(200, w - 2);
      DOM.seamCountSlider.max = MAX_SEAMS;
      DOM.seamCountSlider.value = Math.min(50, MAX_SEAMS);
      DOM.seamCountVal.textContent = DOM.seamCountSlider.value;

      DOM.step1.style.display = 'none';
      transitionToStep2();

      displayOriginal();
      updateTargetWidth();
      DOM.resultLabel.textContent = '等待雕刻...';
      renderEmptyResult();
      resetToggleStates();
      DOM.step3.style.display = 'none';
      DOM.factBox.style.display = 'none';
    };
    img.src = src;
  }

  function resetToggleStates() {
    DOM.toggleGroup.querySelectorAll('.toggle-btn').forEach(function (b) {
      b.classList.remove('active');
    });
  }

  function dataToImageData(data, w, h) {
    return new ImageData(new Uint8ClampedArray(data), w, h);
  }

  function displayOriginal() {
    var canvas = DOM.originalCanvas;
    canvas.width = state.imgWidth;
    canvas.height = state.imgHeight;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(dataToImageData(state.originalData, state.imgWidth, state.imgHeight), 0, 0);
  }

  function renderEmptyResult() {
    var canvas = DOM.resultCanvas;
    canvas.width = state.imgWidth;
    canvas.height = state.imgHeight;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('点击「开始雕刻」查看效果', canvas.width / 2, canvas.height / 2);
  }

  function updateTargetWidth() {
    var count = parseInt(DOM.seamCountSlider.value);
    var target = Math.max(ORIGINAL_WIDTH - count, 1);
    DOM.targetWidthVal.textContent = target + ' px';
  }

  function startCarving() {
    if (state.isCarving) return;
    if (!state.originalData) return;
    state.isCarving = true;
    DOM.carveBtn.disabled = true;
    DOM.surpriseBtn.disabled = true;

    var count = parseInt(DOM.seamCountSlider.value);
    var direction = state.direction;

    var currentData = new Uint8ClampedArray(state.originalData);
    var currentW = state.imgWidth;
    var currentH = state.imgHeight;
    state.seams = [];
    var startTime = Date.now();

    DOM.progressWrap.style.display = 'block';
    DOM.progressFill.style.width = '0%';
    DOM.progressText.textContent = '正在计算接缝路径...';

    function carveStep(i, total) {
      if (i >= total) {
        state.carvedData = currentData;
        state.currentData = new Uint8ClampedArray(currentData);
        state.carvedW = currentW;
        state.carvedH = currentH;
        state.hasCarved = true;
        state.isCarving = false;
        DOM.carveBtn.disabled = false;
        DOM.surpriseBtn.disabled = false;
        DOM.progressWrap.style.display = 'none';

        var elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        renderResult();
        updateStats(elapsed, count);
        showFact();
        transitionToStep3();
        return;
      }

      var result = seamCarving.carveOneSeam(currentData, currentW, currentH, direction);
      state.seams.push(result.seam);
      currentData = result.data;
      currentW = result.width;
      currentH = result.height;

      DOM.progressFill.style.width = ((i + 1) / total * 100) + '%';
      DOM.progressText.textContent = '已移除 ' + (i + 1) + ' / ' + total + ' 条接缝';

      DOM.resultCanvas.width = currentW;
      DOM.resultCanvas.height = currentH;
      var ctx = DOM.resultCanvas.getContext('2d');
      ctx.putImageData(dataToImageData(currentData, currentW, currentH), 0, 0);

      var removedPct = Math.round((1 - currentW / state.imgWidth) * 100);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, currentH - 22, currentW, 22);
      ctx.fillStyle = '#ffd700';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('缩窄中 ' + removedPct + '%', currentW - 6, currentH - 6);

      DOM.resultLabel.textContent = '雕刻中... (' + (i + 1) + '/' + total + ', ' + currentW + '×' + currentH + ')';

      setTimeout(function () {
        carveStep(i + 1, total);
      }, 5);
    }

    carveStep(0, count);
  }

  function renderResult() {
    if (!state.carvedData && !state.currentData) return;
    var canvas = DOM.resultCanvas;
    var ctx = canvas.getContext('2d');

    if (state.mode === 'energy' && state.originalData) {
      var energy = seamCarving.computeEnergy(state.originalData, state.imgWidth, state.imgHeight);
      var eCanvas = document.createElement('canvas');
      eCanvas.width = state.imgWidth;
      eCanvas.height = state.imgHeight;
      var eCtx = eCanvas.getContext('2d');

      var maxEnergy = 0;
      for (var j = 0; j < energy.length; j++) {
        if (energy[j] > maxEnergy) maxEnergy = energy[j];
      }

      var eImgData = eCtx.createImageData(state.imgWidth, state.imgHeight);
      for (var i = 0; i < energy.length; i++) {
        var val = maxEnergy > 0 ? Math.min(energy[i] / maxEnergy, 1) : 0;
        eImgData.data[i * 4] = Math.round(val * 255);
        eImgData.data[i * 4 + 1] = Math.round((1 - val) * 255);
        eImgData.data[i * 4 + 2] = 0;
        eImgData.data[i * 4 + 3] = 200;
      }
      eCtx.putImageData(eImgData, 0, 0);

      canvas.width = state.imgWidth;
      canvas.height = state.imgHeight;
      ctx.drawImage(eCanvas, 0, 0);
      DOM.resultLabel.textContent = '能量图（红色=高能量，绿色=低能量）';
      return;
    }

    if (state.mode === 'seams' && state.originalData && state.seams.length > 0) {
      var sCanvas = document.createElement('canvas');
      sCanvas.width = state.imgWidth;
      sCanvas.height = state.imgHeight;
      var sCtx = sCanvas.getContext('2d');
      sCtx.putImageData(dataToImageData(state.originalData, state.imgWidth, state.imgHeight), 0, 0);

      sCtx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
      sCtx.lineWidth = 1;

      for (var s = 0; s < state.seams.length; s++) {
        var seam = state.seams[s];
        sCtx.beginPath();
        for (var y = 0; y < seam.length; y++) {
          if (y === 0) sCtx.moveTo(seam[y], y);
          else sCtx.lineTo(seam[y], y);
        }
        sCtx.stroke();
      }

      canvas.width = state.imgWidth;
      canvas.height = state.imgHeight;
      ctx.drawImage(sCanvas, 0, 0);
      DOM.resultLabel.textContent = '接缝可视化（红色路径 = 被移除的接缝）';
      return;
    }

    if (state.mode === 'overlay' && state.originalData && state.carvedData) {
      var oCanvas = document.createElement('canvas');
      oCanvas.width = state.imgWidth;
      oCanvas.height = state.imgHeight;
      var oCtx = oCanvas.getContext('2d');
      oCtx.putImageData(dataToImageData(state.originalData, state.imgWidth, state.imgHeight), 0, 0);

      var carvedWidth = state.carvedW;
      var diff = state.imgWidth - carvedWidth;

      oCtx.fillStyle = 'rgba(255, 0, 0, 0.15)';
      oCtx.fillRect(carvedWidth, 0, diff, state.imgHeight);

      oCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      oCtx.lineWidth = 2;
      oCtx.setLineDash([4, 4]);
      oCtx.beginPath();
      oCtx.moveTo(carvedWidth, 0);
      oCtx.lineTo(carvedWidth, state.imgHeight);
      oCtx.stroke();
      oCtx.setLineDash([]);

      oCtx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      oCtx.font = '12px sans-serif';
      oCtx.textAlign = 'left';
      oCtx.fillText('被移除区域 (' + diff + 'px)', carvedWidth + 4, 20);

      canvas.width = state.imgWidth;
      canvas.height = state.imgHeight;
      ctx.drawImage(oCanvas, 0, 0);
      DOM.resultLabel.textContent = '叠加对比（红色区域 = 被移除的像素）';
      return;
    }

    if (state.carvedData) {
      canvas.width = state.carvedW;
      canvas.height = state.carvedH;
      ctx.putImageData(dataToImageData(state.carvedData, state.carvedW, state.carvedH), 0, 0);

      var removedPct = Math.round((1 - state.carvedW / state.imgWidth) * 100);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, canvas.height - 22, canvas.width, 22);
      ctx.fillStyle = '#ffd700';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('缩窄 ' + removedPct + '%', canvas.width - 6, canvas.height - 6);

      DOM.resultLabel.textContent = '雕刻结果 (' + state.carvedW + ' × ' + state.carvedH + ')';
    } else {
      canvas.width = state.imgWidth;
      canvas.height = state.imgHeight;
      ctx.putImageData(dataToImageData(state.currentData, state.imgWidth, state.imgHeight), 0, 0);
    }
  }

  function updateStats(elapsed, count) {
    var origW = state.imgWidth;
    var origH = state.imgHeight;
    var newW = state.carvedW || origW;
    var newH = state.carvedH || origH;

    DOM.statOrigSize.textContent = origW + ' × ' + origH;
    DOM.statNewSize.textContent = newW + ' × ' + newH;

    var removedPixels = origW * origH - newW * newH;
    DOM.statRemoved.textContent = removedPixels.toLocaleString();
    DOM.statTime.textContent = elapsed + ' 秒';
  }

  function showFact() {
    var fact = seamCarving.getRandomFact();
    DOM.factText.textContent = fact;
    DOM.factBox.style.display = 'block';
    gsapReady.then(function (gsap) {
      gsap.fromTo(DOM.factBox, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' });
    });
  }

  function resetToOriginal() {
    if (!state.originalData) return;
    state.carvedData = null;
    state.currentData = new Uint8ClampedArray(state.originalData);
    state.seams = [];
    state.hasCarved = false;
    state.mode = 'normal';
    resetToggleStates();

    DOM.resultLabel.textContent = '等待雕刻...';
    DOM.step3.style.display = 'none';
    DOM.factBox.style.display = 'none';
    renderEmptyResult();
    displayOriginal();
    DOM.seamCountSlider.value = Math.min(50, MAX_SEAMS);
    DOM.seamCountVal.textContent = DOM.seamCountSlider.value;
    updateTargetWidth();
  }

  function downloadResult() {
    if (!state.carvedData) return;
    var canvas = document.createElement('canvas');
    canvas.width = state.carvedW;
    canvas.height = state.carvedH;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(dataToImageData(state.carvedData, state.carvedW, state.carvedH), 0, 0);

    var link = document.createElement('a');
    link.download = 'seam-carved.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function surpriseMe() {
    if (state.isCarving || !state.originalData) return;
    var count = Math.floor(Math.random() * MAX_SEAMS * 0.8) + 5;
    DOM.seamCountSlider.value = count;
    DOM.seamCountVal.textContent = count;
    updateTargetWidth();
    startCarving();
  }

  window.addEventListener('load', function () {
    init();
  });
})();