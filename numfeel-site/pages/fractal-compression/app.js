(function () {
  'use strict';

  var gsapReady = typeof gsap !== 'undefined' ? Promise.resolve(gsap) : new Promise(function (resolve) {
    var check = function () {
      if (typeof gsap !== 'undefined') resolve(gsap);
      else setTimeout(check, 50);
    };
    check();
  });

  var ENCODE_SIZE = 64;
  var DOM = {};
  var state = {
    originalImage: null,
    grayData: null,
    imgWidth: 0,
    imgHeight: 0,
    fractalCode: null,
    encodeResult: null,
    decodedData: null,
    isEncoding: false,
    isDecoding: false
  };

  function cacheDOM() {
    DOM.heroSection = document.getElementById('heroSection');
    DOM.heroBtn = document.getElementById('heroBtn');
    DOM.step1 = document.getElementById('step1');
    DOM.step2 = document.getElementById('step2');
    DOM.step3 = document.getElementById('step3');
    DOM.uploadZone = document.getElementById('uploadZone');
    DOM.fileInput = document.getElementById('fileInput');
    DOM.useSampleBtn = document.getElementById('useSampleBtn');
    DOM.usePortraitBtn = document.getElementById('usePortraitBtn');
    DOM.encodeBtn = document.getElementById('encodeBtn');
    DOM.encodeProgress = document.getElementById('encodeProgress');
    DOM.encodeProgressFill = document.getElementById('encodeProgressFill');
    DOM.encodeProgressText = document.getElementById('encodeProgressText');
    DOM.originalCanvas = document.getElementById('originalCanvas');
    DOM.decodeCanvas = document.getElementById('decodeCanvas');
    DOM.decodeLabel = document.getElementById('decodeLabel');
    DOM.decodeProgress = document.getElementById('decodeProgress');
    DOM.decodeBarFill = document.getElementById('decodeBarFill');
    DOM.decodeIterLabel = document.getElementById('decodeIterLabel');
    DOM.decodeControls = document.getElementById('decodeControls');
    DOM.decodeBtn = document.getElementById('decodeBtn');
    DOM.decodeHighResBtn = document.getElementById('decodeHighResBtn');
    DOM.reencodeBtn = document.getElementById('reencodeBtn');
    DOM.statsRow = document.getElementById('statsRow');
    DOM.statOrigSize = document.getElementById('statOrigSize');
    DOM.statCompSize = document.getElementById('statCompSize');
    DOM.statRatio = document.getElementById('statRatio');
    DOM.statBlocks = document.getElementById('statBlocks');
    DOM.statPSNR = document.getElementById('statPSNR');
    DOM.rangeSizeSlider = document.getElementById('rangeSizeSlider');
    DOM.rangeSizeVal = document.getElementById('rangeSizeVal');
    DOM.strideSlider = document.getElementById('strideSlider');
    DOM.strideVal = document.getElementById('strideVal');
    DOM.collageSection = document.getElementById('collageSection');
    DOM.collageCanvas = document.getElementById('collageCanvas');
    DOM.explainSection = document.getElementById('explainSection');
  }

  function init() {
    cacheDOM();
    bindEvents();
    animateHero();
  }

  function renderToCanvas(gray, w, h, canvas) {
    var imageData = FractalCompression.grayscaleToImageData(gray, w, h);
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
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

    DOM.useSampleBtn.addEventListener('click', function () {
      loadSampleImage();
    });
    DOM.usePortraitBtn.addEventListener('click', function () {
      loadPortraitImage();
    });

    DOM.rangeSizeSlider.addEventListener('input', function () {
      var val = parseInt(DOM.rangeSizeSlider.value);
      DOM.rangeSizeVal.textContent = val + '\u00D7' + val;
    });
    DOM.strideSlider.addEventListener('input', function () {
      var val = ['高', '中', '低'][parseInt(DOM.strideSlider.value)];
      DOM.strideVal.textContent = val;
    });

    DOM.encodeBtn.addEventListener('click', function () {
      startEncoding();
    });

    DOM.decodeBtn.addEventListener('click', function () {
      startDecoding(1);
    });
    DOM.decodeHighResBtn.addEventListener('click', function () {
      startDecoding(2);
    });
    DOM.reencodeBtn.addEventListener('click', function () {
      resetToStep1();
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

  function loadSampleImage() {
    var imageData = FractalCompression.generateSampleImage(ENCODE_SIZE, ENCODE_SIZE);
    processImageData(imageData);
  }

  function loadPortraitImage() {
    var imageData = FractalCompression.generatePortraitImage(ENCODE_SIZE, ENCODE_SIZE);
    processImageData(imageData);
  }

  function loadImageToCanvas(src) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = ENCODE_SIZE;
      tempCanvas.height = ENCODE_SIZE;
      var ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, ENCODE_SIZE, ENCODE_SIZE);
      var imageData = ctx.getImageData(0, 0, ENCODE_SIZE, ENCODE_SIZE);
      processImageData(imageData);
    };
    img.src = src;
  }

  function processImageData(imageData) {
    state.imgWidth = imageData.width;
    state.imgHeight = imageData.height;
    state.originalImage = imageData;
    state.grayData = FractalCompression.toGrayscale(imageData);
    state.fractalCode = null;
    state.encodeResult = null;
    state.decodedData = null;

    renderToCanvas(state.grayData, state.imgWidth, state.imgHeight, DOM.originalCanvas);

    DOM.step1.style.display = 'none';
    transitionToStep2();
  }

  function startEncoding() {
    if (state.isEncoding || !state.grayData) return;
    state.isEncoding = true;
    DOM.encodeBtn.disabled = true;

    DOM.encodeProgress.style.display = 'block';
    DOM.encodeProgressFill.style.width = '0%';
    DOM.encodeProgressText.textContent = '正在构建域块池...';

    var rangeSize = parseInt(DOM.rangeSizeSlider.value);
    var strideOptions = [2, 4, 8];
    var stride = strideOptions[parseInt(DOM.strideSlider.value)];
    var domainSize = rangeSize * 2;

    var gray = state.grayData;
    var w = state.imgWidth;
    var h = state.imgHeight;

    var cols = Math.floor(w / rangeSize);
    var rows = Math.floor(h / rangeSize);
    var totalBlocks = cols * rows;

    setTimeout(function () {
      var domainPool = FractalCompression.buildDomainPool(gray, w, h, rangeSize, domainSize, stride);
      DOM.encodeProgressText.textContent = '域块池大小: ' + domainPool.length + '，正在搜索最佳匹配...';

      var code = [];
      var currentBlock = 0;
      var CHUNK_SIZE = 2;

      function processChunk() {
        var end = Math.min(currentBlock + CHUNK_SIZE, totalBlocks);
        for (var idx = currentBlock; idx < end; idx++) {
          var ry = Math.floor(idx / cols);
          var rx = idx % cols;
          var blockResult = FractalCompression.encodeBlock(gray, w, h, rx, ry, rangeSize, domainPool);
          code.push(blockResult);
        }
        currentBlock = end;

        var progress = currentBlock / totalBlocks;
        DOM.encodeProgressFill.style.width = (progress * 100) + '%';
        DOM.encodeProgressText.textContent = '已处理 ' + currentBlock + ' / ' + totalBlocks + ' 个块';

        if (currentBlock < totalBlocks) {
          setTimeout(processChunk, 0);
        } else {
          finishEncoding(code, rangeSize, w, h);
        }
      }

      processChunk();
    }, 50);
  }

  function finishEncoding(code, rangeSize, w, h) {
    var originalBytes = w * h;
    var compressedBytes = code.length * 12;
    var ratio = compressedBytes > 0 ? (originalBytes / compressedBytes) : 0;
    var totalMSE = 0;
    for (var i = 0; i < code.length; i++) {
      totalMSE += code[i].mse;
    }
    var avgMSE = totalMSE / code.length;
    var psnr = avgMSE > 0 ? 10 * Math.log10(255 * 255 / avgMSE) : Infinity;

    state.fractalCode = code;
    state.encodeResult = {
      code: code,
      rangeSize: rangeSize,
      stats: {
        numBlocks: code.length,
        originalSize: originalBytes,
        compressedSize: compressedBytes,
        compressionRatio: ratio.toFixed(1),
        psnr: psnr,
        imageWidth: w,
        imageHeight: h
      }
    };

    DOM.encodeProgressFill.style.width = '100%';
    DOM.encodeProgressText.textContent = '编码完成！';

    setTimeout(function () {
      DOM.encodeProgress.style.display = 'none';
      DOM.encodeBtn.disabled = false;
      state.isEncoding = false;

      transitionToStep3();
      showStats();
      showDecodeReady();
    }, 300);
  }

  function showStats() {
    var stats = state.encodeResult.stats;
    DOM.statOrigSize.textContent = stats.originalSize + ' B';
    DOM.statCompSize.textContent = stats.compressedSize + ' B';
    DOM.statRatio.textContent = stats.compressionRatio + ':1';
    DOM.statBlocks.textContent = stats.numBlocks + ' 块';
    DOM.statPSNR.textContent = stats.psnr.toFixed(1) + ' dB';
    DOM.statsRow.style.display = 'flex';
  }

  function showDecodeReady() {
    DOM.decodeControls.style.display = 'block';
    DOM.decodeLabel.textContent = '等待解码';
    DOM.decodeBarFill.style.width = '0%';
    DOM.decodeIterLabel.textContent = '迭代 0 / 12';

    var canvas = DOM.decodeCanvas;
    canvas.width = state.imgWidth;
    canvas.height = state.imgHeight;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('点击「解码」看噪音变图片', canvas.width / 2, canvas.height / 2);
  }

  function startDecoding(scaleFactor) {
    if (state.isDecoding || !state.fractalCode) return;
    state.isDecoding = true;
    DOM.decodeBtn.disabled = true;
    DOM.decodeHighResBtn.disabled = true;

    var code = state.fractalCode;
    var rangeSize = state.encodeResult.rangeSize;
    var outW = state.imgWidth * scaleFactor;
    var outH = state.imgHeight * scaleFactor;

    var scaledCode;
    if (scaleFactor > 1) {
      scaledCode = code.map(function (entry) {
        return {
          rx: entry.rx * scaleFactor,
          ry: entry.ry * scaleFactor,
          dx: entry.dx * scaleFactor,
          dy: entry.dy * scaleFactor,
          transform: entry.transform,
          scale: entry.scale,
          offset: entry.offset
        };
      });
    } else {
      scaledCode = code;
    }

    var scaledRangeSize = rangeSize * scaleFactor;
    var totalIterations = 12;
    var currentIter = 0;

    var current = new Float32Array(outW * outH);
    for (var i = 0; i < current.length; i++) {
      current[i] = Math.random() * 255;
    }

    renderToCanvas(current, outW, outH, DOM.decodeCanvas);
    DOM.decodeLabel.textContent = scaleFactor > 1 ? '2x 分辨率解码中...' : '解码中...';

    function runIteration() {
      if (currentIter >= totalIterations) {
        state.decodedData = current;
        state.isDecoding = false;
        DOM.decodeBtn.disabled = false;
        DOM.decodeHighResBtn.disabled = false;
        DOM.decodeLabel.textContent = scaleFactor > 1 ? '2x 分辨率解码结果' : '解码结果';
        DOM.decodeIterLabel.textContent = '迭代完成!';
        DOM.collageSection.style.display = 'block';
        drawCollage();
        return;
      }

      current = FractalCompression.decodeOneIteration(current, scaledCode, outW, outH, scaledRangeSize);
      currentIter++;

      renderToCanvas(current, outW, outH, DOM.decodeCanvas);

      DOM.decodeBarFill.style.width = (currentIter / totalIterations * 100) + '%';
      DOM.decodeIterLabel.textContent = '迭代 ' + currentIter + ' / ' + totalIterations;

      gsapReady.then(function (gsap) {
        gsap.fromTo(DOM.decodeCanvas, { scale: 1.005 }, { scale: 1, duration: 0.15, ease: 'power1.out' });
      });

      setTimeout(runIteration, 350);
    }

    setTimeout(runIteration, 100);
  }

  function drawCollage() {
    if (!state.fractalCode || !state.encodeResult) return;
    var canvas = DOM.collageCanvas;
    var w = state.imgWidth;
    var h = state.imgHeight;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    if (state.decodedData) {
      renderToCanvas(state.decodedData, w, h, canvas);
    } else {
      renderToCanvas(state.grayData, w, h, canvas);
    }

    var rangeSize = state.encodeResult.rangeSize;
    var code = state.fractalCode;
    var hues = [];
    for (var i = 0; i < code.length; i++) {
      hues.push((i / code.length) * 360);
    }

    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 1;
    for (var j = 0; j < code.length; j++) {
      var entry = code[j];
      var px = entry.rx * rangeSize;
      var py = entry.ry * rangeSize;
      ctx.strokeRect(px, py, rangeSize, rangeSize);
    }

    var arrowColors = ['#ff6b6b', '#81c784', '#90caf9', '#ce93d8', '#ffd700', '#ff8a65', '#4dd0e1', '#aed581'];
    ctx.lineWidth = 1.5;
    for (var k = 0; k < Math.min(code.length, 40); k++) {
      var e = code[k];
      var sx = e.rx * rangeSize + rangeSize / 2;
      var sy = e.ry * rangeSize + rangeSize / 2;
      var ex = e.dx + rangeSize / 2;
      var ey = e.dy + rangeSize / 2;
      var color = arrowColors[k % arrowColors.length];
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(255,215,0,0.8)';
    ctx.font = '11px sans-serif';
    ctx.fillText('每个区块 -> 借用的域块位置（箭头）', 6, 14);
  }

  function resetToStep1() {
    state.fractalCode = null;
    state.encodeResult = null;
    state.decodedData = null;
    state.isEncoding = false;
    state.isDecoding = false;

    DOM.step2.style.display = 'none';
    DOM.step3.style.display = 'none';
    DOM.collageSection.style.display = 'none';
    DOM.encodeProgress.style.display = 'none';
    DOM.encodeBtn.disabled = false;
    DOM.decodeControls.style.display = 'none';
    DOM.statsRow.style.display = 'none';
    DOM.step1.style.display = 'block';
    DOM.encodeProgressFill.style.width = '0%';
    DOM.decodeBarFill.style.width = '0%';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('load', function () {
    init();
  });
})();