(function () {
  'use strict';

  // GSAP 只负责入场动画。但各步骤的 display 切换也写在 gsapReady 回调里，
  // 所以一旦 CDN 拉不到（被墙/被拦/离线），Promise 永远不 resolve，
  // 页面就会卡在第 1 步再也走不下去。这里做两件事：
  // 1) 轮询设上限，不再无限期占用定时器
  // 2) 超时后回退到一个空动画 shim，动画没了但功能照常
  var GSAP_WAIT_MS = 2000;
  var GSAP_POLL_MS = 50;
  var gsapShim = {
    fromTo: function (target, from, to) {
      // 无动画时直接落到终态，避免元素停在 opacity:0
      if (target && target.style) {
        target.style.opacity = '1';
        target.style.transform = 'none';
      }
      return null;
    },
    to: function (target) {
      if (target && target.style) target.style.opacity = '1';
      return null;
    },
    set: function (target, props) {
      if (target && target.style && props && typeof props.opacity !== 'undefined') {
        target.style.opacity = String(props.opacity);
      }
      return null;
    }
  };

  var gsapReady = typeof gsap !== 'undefined' ? Promise.resolve(gsap) : new Promise(function (resolve) {
    var waited = 0;
    var check = function () {
      if (typeof gsap !== 'undefined') return resolve(gsap);
      waited += GSAP_POLL_MS;
      if (waited >= GSAP_WAIT_MS) return resolve(gsapShim);
      setTimeout(check, GSAP_POLL_MS);
    };
    check();
  });

  var ENCODE_SIZE = 128;
  // 只开放能整除 ENCODE_SIZE 的块大小，否则边缘会出现没有分形码负责的区域
  var RANGE_SIZE_OPTIONS = [4, 8, 16];
  var STRIDE_OPTIONS = [2, 4, 8];
  var STRIDE_LABELS = ['高', '中', '低'];
  // 迭代次数只在这里定义，按钮文字和进度标签都从它生成，避免文案和实际跑的轮数脱节
  var DECODE_ITERATIONS = 16;
  var ITERATION_DELAY = 300;
  var COLLAGE_ARROW_COUNT = 40;

  var DOM = {};
  var state = {
    originalImage: null,
    grayData: null,
    imgWidth: 0,
    imgHeight: 0,
    fractalCode: null,
    encodeResult: null,
    decodedData: null,
    decodedWidth: 0,
    decodedHeight: 0,
    decodedScale: 1,
    isEncoding: false,
    isDecoding: false,
    imageSource: '',
    imagePreset: '',
    paramTuned: false,
    encodeStartedAt: 0,
    decodeStartedAt: 0
  };

  // ── 埋点 ────────────────────────────────────────────────────────────────
  // 事件设计（从「要回答什么问题」倒推，而非把能拿到的字段都塞进去）：
  // - session_start:  打开页面，漏斗起点
  // - image_select:   选好图 {source, preset}，回答「用户拿什么图来试」
  //                   「四张预设图哪张最受欢迎」「多少人愿意上传自己的图」
  // - param_tuned:    首次动参数滑块 {rangeSize, stride}（整个会话只记一次），
  //                   回答「多少人肯动参数」「第一次动是往更好调还是往更快调」
  // - encode:         编码完成 {rangeSize, stride, pool, blocks, ms, ratio, collagePsnr}，
  //                   回答「真机编码耗时分布」（文章里的耗时只是我单机实测）
  //                   「用户实际落在哪个参数组合上」
  // - decode_start:   点下解码 {scale}，与 decode 配对可算「解码完成率」——
  //                   解码要跑 16 帧约 5 秒，中途离开的人值得单独看
  // - decode:         解码收敛 {scale, iterations, ms, collagePsnr, realPsnr}，
  //                   回答「真实图片上拼贴 PSNR 与解码 PSNR 的落差分布」
  //                   （这是文章核心论点，但我只在内置示例图上验过）
  // - reset:          点「换一张图」，回答「重复实验率」，衡量粘性
  // - session_hidden: 切后台（不等于离开，见 AGENTS.md 的通用坑）
  // - session_end:    pagehide 真实离页 {reason, stage}，回答「在哪一步流失」
  // 漏斗：session_start → image_select → encode → decode_start → decode
  // 只镜像低频收尾事件到 umami；encode / decode 这类过程事件一律不镜像。
  window.NF_TRACK_UMAMI_MIRROR = ['session_end'];

  var trackSessionActive = false;
  // 记录用户走到了哪一步，离页时随 session_end 一起上报，用来定位流失点
  var trackStage = 'landing';

  /** 安全调用 NFTrack；SDK 未加载、被拦截或抛错都不应影响页面。 */
  function nfTrack(name, props, opts) {
    try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
  }

  function nfTrackOnce(name, props) {
    try { if (window.NFTrack) window.NFTrack.trackOnce(name, props); } catch (e) {}
  }

  /** PSNR / 压缩比保留一位小数，避免上报一长串浮点尾数 */
  function round1(value) {
    return isFinite(value) ? Math.round(value * 10) / 10 : -1;
  }

  function trackSessionStart() {
    if (trackSessionActive) return;
    trackSessionActive = true;
    nfTrack('session_start', {});
  }

  function trackSessionEnd(reason) {
    if (!trackSessionActive) return;
    trackSessionActive = false;
    nfTrack('session_end', { reason: reason, stage: trackStage }, { force: true });
  }

  function trackSessionHidden() {
    if (!trackSessionActive) return;
    nfTrack('session_hidden', { reason: 'hidden', stage: trackStage }, { force: true });
  }

  function registerTrackLeaveHandler() {
    // 切后台 / 锁屏都会触发 hidden，不能当作会话结束；真实离页用 pagehide 兜底
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') trackSessionHidden();
    });
    window.addEventListener('pagehide', function () { trackSessionEnd('leave'); });
  }

  function currentRangeSize() {
    return RANGE_SIZE_OPTIONS[parseInt(DOM.rangeSizeSlider.value, 10)];
  }

  function currentStride() {
    return STRIDE_OPTIONS[parseInt(DOM.strideSlider.value, 10)];
  }

  /**
   * 两张同尺寸灰度图之间的 PSNR
   */
  function computePSNR(a, b) {
    var mse = 0;
    for (var i = 0; i < a.length; i++) {
      var d = a[i] - b[i];
      mse += d * d;
    }
    mse /= a.length;
    return mse > 0 ? 10 * Math.log10(255 * 255 / mse) : Infinity;
  }

  function formatPSNR(value) {
    return isFinite(value) ? value.toFixed(1) + ' dB' : '∞';
  }

  function cacheDOM() {
    DOM.step1 = document.getElementById('step1');
    DOM.step2 = document.getElementById('step2');
    DOM.step3 = document.getElementById('step3');
    DOM.uploadZone = document.getElementById('uploadZone');
    DOM.fileInput = document.getElementById('fileInput');
    DOM.useSampleBtn = document.getElementById('useSampleBtn');
    DOM.usePortraitBtn = document.getElementById('usePortraitBtn');
    DOM.presetGrid = document.querySelector('.preset-grid');
    DOM.aiPresets = document.querySelector('.ai-presets');
    DOM.sampleRow = document.getElementById('sampleRow');
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
    DOM.statRealPSNR = document.getElementById('statRealPSNR');
    DOM.psnrNote = document.getElementById('psnrNote');
    DOM.collagePreviewNote = document.getElementById('collagePreviewNote');
    DOM.decodeBtnLabel = document.getElementById('decodeBtnLabel');
    DOM.bitIndex = document.getElementById('bitIndex');
    DOM.legendArrowCount = document.getElementById('legendArrowCount');
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
    syncIterationLabels();
    syncParamLabels();
    bindEvents();
    revealStep1();
    // 放在 init 里而非脚本解析时：track.js 由 header.js 动态注入，
    // 到 window load 才能保证 NFTrack 已就绪
    trackSessionStart();
    registerTrackLeaveHandler();
  }

  // 所有出现迭代次数的文案统一从 DECODE_ITERATIONS 生成
  function syncIterationLabels() {
    DOM.decodeBtnLabel.textContent = '解码（' + DECODE_ITERATIONS + ' 次迭代）';
    DOM.decodeIterLabel.textContent = '迭代 0 / ' + DECODE_ITERATIONS;
  }

  function syncParamLabels() {
    var rangeSize = currentRangeSize();
    DOM.rangeSizeVal.textContent = rangeSize + '\u00D7' + rangeSize;
    DOM.strideVal.textContent = STRIDE_LABELS[parseInt(DOM.strideSlider.value, 10)];
    updateBitBudget(rangeSize, currentStride());
  }

  /** 首次动参数滑块时记一次，带上当时的取值 */
  function trackParamTuned() {
    if (state.paramTuned) return;
    state.paramTuned = true;
    nfTrackOnce('param_tuned', {
      rangeSize: currentRangeSize(),
      stride: currentStride()
    });
  }

  // 预告本组参数下每块要花多少 bit，让「压缩比」这个数字有据可查
  function updateBitBudget(rangeSize, stride) {
    var domainSize = rangeSize * 2;
    var span = Math.floor((ENCODE_SIZE - domainSize) / stride) + 1;
    var poolSize = span > 0 ? span * span : 0;
    var budget = FractalCompression.estimateCompressedBytes(1, poolSize);
    DOM.bitIndex.textContent = budget.indexBits;
  }

  function renderToCanvas(gray, w, h, canvas) {
    var imageData = FractalCompression.grayscaleToImageData(gray, w, h);
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
  }

  function revealStep1() {
    gsapReady.then(function (gsap) {
      gsap.fromTo(DOM.step1, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
    });
  }

  function bindEvents() {
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

    if (DOM.presetGrid) {
      DOM.presetGrid.addEventListener('click', function (e) {
        var card = e.target.closest ? e.target.closest('.preset-card') : null;
        if (card) loadPresetImage('images/' + card.getAttribute('data-preset') + '.jpg');
      });
    }

    DOM.rangeSizeSlider.addEventListener('input', function () {
      syncParamLabels();
      trackParamTuned();
    });
    DOM.strideSlider.addEventListener('input', function () {
      syncParamLabels();
      trackParamTuned();
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
    // 只记「来源是上传」这个事实；文件名、尺寸等任何用户数据一律不上报
    state.imageSource = 'upload';
    state.imagePreset = '';
    var reader = new FileReader();
    reader.onload = function (e) {
      loadImageToCanvas(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function loadSampleImage() {
    state.imageSource = 'sample';
    state.imagePreset = '';
    var imageData = FractalCompression.generateSampleImage(ENCODE_SIZE, ENCODE_SIZE);
    processImageData(imageData);
  }

  function loadPortraitImage() {
    state.imageSource = 'portrait';
    state.imagePreset = '';
    var imageData = FractalCompression.generatePortraitImage(ENCODE_SIZE, ENCODE_SIZE);
    processImageData(imageData);
  }

  function loadPresetImage(src) {
    state.imageSource = 'preset';
    // 预设图名取自固定的四张内置图（portrait/mountain/city/fractal），非用户输入
    var match = /([a-z0-9-]+)\.jpg$/i.exec(src || '');
    state.imagePreset = match ? match[1].toLowerCase() : '';
    loadImageToCanvas(src);
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
    state.decodedWidth = 0;
    state.decodedHeight = 0;
    state.decodedScale = 1;

    // 图片与它的变换固定在同一处展示，选图后这里先显示原图
    renderToCanvas(state.grayData, state.imgWidth, state.imgHeight, DOM.originalCanvas);
    prepareDecodeArea();

    DOM.uploadZone.style.display = 'none';
    DOM.aiPresets.style.display = 'none';
    DOM.sampleRow.style.display = 'none';
    DOM.statsRow.style.display = 'none';
    DOM.psnrNote.style.display = 'none';
    DOM.collageSection.style.display = 'none';

    transitionToStep2();
    transitionToStep3();

    trackStage = 'image_selected';
    nfTrack('image_select', {
      source: state.imageSource || 'unknown',
      preset: state.imagePreset || 'none'
    });
  }

  // 在解码区显示原图，并把解码画布置于等待状态（编码完成后才启用解码控制）
  function prepareDecodeArea() {
    DOM.decodeControls.style.display = 'none';
    DOM.decodeProgress.style.display = 'none';
    DOM.collagePreviewNote.style.display = 'none';
    DOM.decodeLabel.textContent = '待编码';
    var canvas = DOM.decodeCanvas;
    canvas.width = state.imgWidth;
    canvas.height = state.imgHeight;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#555';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('先点上一步的「开始编码」', canvas.width / 2, canvas.height / 2);
  }

  function startEncoding() {
    if (state.isEncoding || !state.grayData) return;
    state.isEncoding = true;
    state.encodeStartedAt = Date.now();
    DOM.encodeBtn.disabled = true;

    DOM.encodeProgress.style.display = 'block';
    DOM.encodeProgressFill.style.width = '0%';
    DOM.encodeProgressText.textContent = '正在构建域块池...';

    var rangeSize = currentRangeSize();
    var stride = currentStride();
    var domainSize = rangeSize * 2;

    var gray = state.grayData;
    var w = state.imgWidth;
    var h = state.imgHeight;

    // 与 engine 用同一套网格推算，ceil 保证边缘也被覆盖
    var grid = FractalCompression.gridSize(w, h, rangeSize);
    var cols = grid.cols;
    var rows = grid.rows;
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
          finishEncoding(code, rangeSize, w, h, domainPool.length);
        }
      }

      processChunk();
    }, 50);
  }

  function finishEncoding(code, rangeSize, w, h, domainPoolSize) {
    var originalBytes = w * h;
    // 按位记账：域块索引 ceil(log2(池大小)) bit + 变换 3 bit + 缩放 5 bit + 偏移 7 bit
    var budget = FractalCompression.estimateCompressedBytes(code.length, domainPoolSize);
    var compressedBytes = budget.totalBytes;
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
        bitsPerBlock: budget.bitsPerBlock,
        indexBits: budget.indexBits,
        domainPoolSize: domainPoolSize,
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
      // 拼贴方框图只依赖分形码，编码完就能画，不用等解码
      DOM.collageSection.style.display = 'block';
      drawCollage();

      trackStage = 'encoded';
      var stats = state.encodeResult.stats;
      nfTrack('encode', {
        rangeSize: rangeSize,
        stride: currentStride(),
        pool: domainPoolSize,
        blocks: stats.numBlocks,
        ms: Date.now() - state.encodeStartedAt,
        ratio: round1(parseFloat(stats.compressionRatio)),
        collagePsnr: round1(stats.psnr)
      });
    }, 300);
  }

  function showStats() {
    var stats = state.encodeResult.stats;
    DOM.statOrigSize.textContent = stats.originalSize + ' B';
    DOM.statCompSize.textContent = stats.compressedSize + ' B';
    DOM.statRatio.textContent = stats.compressionRatio + ':1';
    DOM.statBlocks.textContent = stats.numBlocks + ' 块';
    DOM.statPSNR.textContent = formatPSNR(stats.psnr);
    // 解码 PSNR 要等真的迭代出结果才有值，编码阶段先留空，不用拼贴误差冒充
    DOM.statRealPSNR.textContent = '待解码';
    DOM.statRealPSNR.removeAttribute('title');
    DOM.statsRow.style.display = 'flex';
    DOM.psnrNote.style.display = 'block';
    DOM.bitIndex.textContent = stats.indexBits;
  }

  function showDecodeReady() {
    DOM.decodeControls.style.display = 'block';
    DOM.decodeProgress.style.display = 'block';
    DOM.decodeBarFill.style.width = '0%';
    DOM.decodeIterLabel.textContent = '迭代 0 / ' + DECODE_ITERATIONS;
    renderCollagePreview();
  }

  /**
   * 编码的可见产物：拼贴图。
   *
   * 编码本身只产出一串数字，屏幕上什么都不会变，很容易让人以为按钮没反应。
   * 但这串数字定义了一个变换 F，把它作用在原图上一次，得到的就是
   * 「编码器认为这张图可以怎么拼出来」——即拼贴定理里的 F(x)。
   * 它和原图的差距正好等于统计条里那个「拼贴 PSNR」，
   * 所以这张图既是编码有结果的证据，也让两个 PSNR 指标变得可看可比。
   */
  function renderCollagePreview() {
    var collage = FractalCompression.decodeOneIteration(
      state.grayData, state.fractalCode,
      state.imgWidth, state.imgHeight,
      state.encodeResult.rangeSize
    );
    renderToCanvas(collage, state.imgWidth, state.imgHeight, DOM.decodeCanvas);
    DOM.decodeLabel.textContent = '拼贴图（编码结果）';
    DOM.collagePreviewNote.style.display = 'block';
  }

  function startDecoding(scaleFactor) {
    if (state.isDecoding || !state.fractalCode) return;
    state.isDecoding = true;
    state.decodeStartedAt = Date.now();
    DOM.decodeBtn.disabled = true;
    DOM.decodeHighResBtn.disabled = true;

    // 解码要跑 16 帧约 5 秒，与 decode 事件配对可算完成率
    trackStage = 'decoding';
    nfTrack('decode_start', { scale: scaleFactor });

    var code = state.fractalCode;
    var rangeSize = state.encodeResult.rangeSize;
    var outW = state.imgWidth * scaleFactor;
    var outH = state.imgHeight * scaleFactor;

    var scaledCode;
    if (scaleFactor > 1) {
      // rx/ry 是块索引（0~cols-1），2x 时图像与 rangeSize 同时翻倍、网格数量不变，
      // 因此 rx/ry 保持不变；只有域块像素坐标 dx/dy 需要按比例放大。
      scaledCode = code.map(function (entry) {
        return {
          rx: entry.rx,
          ry: entry.ry,
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
    var totalIterations = DECODE_ITERATIONS;
    var currentIter = 0;

    // 从纯随机噪音起步：PIFS 的不动点与初值无关，这是本页最想让人亲眼看到的一点
    var current = FractalCompression.createNoiseImage(outW, outH);
    DOM.collagePreviewNote.style.display = 'none';

    renderToCanvas(current, outW, outH, DOM.decodeCanvas);
    DOM.decodeLabel.textContent = scaleFactor > 1 ? '2x 分辨率解码中（第 0 步：随机噪音）' : '解码中（第 0 步：随机噪音）';
    DOM.decodeBarFill.style.width = '0%';
    DOM.decodeIterLabel.textContent = '迭代 0 / ' + totalIterations;

    function runIteration() {
      if (currentIter >= totalIterations) {
        state.decodedData = current;
        state.decodedWidth = outW;
        state.decodedHeight = outH;
        state.decodedScale = scaleFactor;
        state.isDecoding = false;
        DOM.decodeBtn.disabled = false;
        DOM.decodeHighResBtn.disabled = false;
        DOM.decodeLabel.textContent = scaleFactor > 1 ? '2x 分辨率解码结果' : '解码结果';
        DOM.decodeIterLabel.textContent = '迭代完成，已收敛到不动点';
        showRealPSNR(scaleFactor, current);
        drawCollage();
        trackDecodeDone(scaleFactor, current, totalIterations);
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

      setTimeout(runIteration, ITERATION_DELAY);
    }

    setTimeout(runIteration, 100);
  }

  /**
   * 解码收敛后上报。同时带上拼贴 PSNR 与解码 PSNR，
   * 让「两者落差」这个核心指标能在单条记录里直接算出来，
   * 不用在 SQL 里跨事件 join。2x 没有同分辨率原图可比，realPsnr 留空。
   */
  function trackDecodeDone(scaleFactor, decoded, iterations) {
    trackStage = 'decoded';
    var props = {
      scale: scaleFactor,
      iterations: iterations,
      ms: Date.now() - state.decodeStartedAt,
      collagePsnr: round1(state.encodeResult.stats.psnr)
    };
    if (scaleFactor === 1) {
      props.realPsnr = round1(computePSNR(state.grayData, decoded));
    }
    nfTrack('decode', props);
  }

  /**
   * 真实解码 PSNR：拿收敛结果和原图直接比，而不是复用编码时的拼贴误差。
   * 2x 输出没有同分辨率的原图可比，这种情况不编造数字。
   */
  function showRealPSNR(scaleFactor, decoded) {
    if (scaleFactor !== 1) {
      DOM.statRealPSNR.textContent = '2x 无参考';
      DOM.statRealPSNR.setAttribute('title', '2x 解码输出没有对应分辨率的原图，无法计算 PSNR。切回 1x 解码可以看到真实值。');
      return;
    }
    DOM.statRealPSNR.removeAttribute('title');
    DOM.statRealPSNR.textContent = formatPSNR(computePSNR(state.grayData, decoded));
  }

  function drawCollage() {
    if (!state.fractalCode || !state.encodeResult) return;
    var canvas = DOM.collageCanvas;
    // 用实际解码输出尺寸（2x 时为原图两倍），保证拼贴图不会截取左上 1/4
    var w = state.decodedWidth || state.imgWidth;
    var h = state.decodedHeight || state.imgHeight;
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
    // 网格/箭头坐标基于原图（128）绘制，画布可能已是 2x，按比例放大
    var scale = state.imgWidth > 0 ? w / state.imgWidth : 1;

    // 用块 RMSE 的分位数做归一化，避免个别极差的块把整张图压成一个颜色
    var rmseList = code.map(function (e) { return Math.sqrt(e.mse || 0); }).sort(function (a, b) { return a - b; });
    var lo = rmseList[Math.floor(rmseList.length * 0.1)] || 0;
    var hi = rmseList[Math.floor(rmseList.length * 0.9)] || (lo + 1);
    var span = hi > lo ? hi - lo : 1;

    // 绿(120°)=匹配好 → 金(50°) → 红(0°)=匹配差
    function qualityColor(mse, alpha) {
      var t = Math.max(0, Math.min(1, (Math.sqrt(mse || 0) - lo) / span));
      var hue = 120 - t * 120;
      return 'hsla(' + hue.toFixed(0) + ', 70%, 55%, ' + alpha + ')';
    }

    ctx.lineWidth = 1;
    for (var j = 0; j < code.length; j++) {
      var entry = code[j];
      var px = entry.rx * rangeSize * scale;
      var py = entry.ry * rangeSize * scale;
      ctx.strokeStyle = qualityColor(entry.mse, 0.85);
      ctx.strokeRect(px, py, rangeSize * scale, rangeSize * scale);
    }

    // 均匀抽样而不是取前 N 个，否则箭头全挤在图像顶部几行
    var arrowCount = Math.min(code.length, COLLAGE_ARROW_COUNT);
    var step = code.length / arrowCount;
    ctx.lineWidth = 1.5;
    for (var k = 0; k < arrowCount; k++) {
      var e = code[Math.floor(k * step)];
      var sx = (e.rx * rangeSize + rangeSize / 2) * scale;
      var sy = (e.ry * rangeSize + rangeSize / 2) * scale;
      var ex = (e.dx + rangeSize) * scale;
      var ey = (e.dy + rangeSize) * scale;
      ctx.strokeStyle = qualityColor(e.mse, 0.55);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // 箭头末端画个小圆点标出域块中心，方向一目了然
      ctx.fillStyle = qualityColor(e.mse, 0.9);
      ctx.beginPath();
      ctx.arc(ex, ey, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (DOM.legendArrowCount) {
      DOM.legendArrowCount.textContent = arrowCount + ' / ' + code.length;
    }
  }

  function resetToStep1() {
    // 回到第 1 步说明用户想再试一轮，用来衡量粘性
    nfTrack('reset', { from: trackStage });
    trackStage = 'landing';

    state.fractalCode = null;
    state.encodeResult = null;
    state.decodedData = null;
    state.decodedWidth = 0;
    state.decodedHeight = 0;
    state.decodedScale = 1;
    state.isEncoding = false;
    state.isDecoding = false;

    DOM.step2.style.display = 'none';
    DOM.step3.style.display = 'none';
    DOM.collageSection.style.display = 'none';
    DOM.encodeProgress.style.display = 'none';
    DOM.encodeBtn.disabled = false;
    DOM.decodeBtn.disabled = false;
    DOM.decodeHighResBtn.disabled = false;
    DOM.decodeControls.style.display = 'none';
    DOM.statsRow.style.display = 'none';
    DOM.psnrNote.style.display = 'none';
    DOM.collagePreviewNote.style.display = 'none';
    syncIterationLabels();
    DOM.step1.style.display = 'block';
    DOM.uploadZone.style.display = 'block';
    DOM.aiPresets.style.display = 'block';
    DOM.sampleRow.style.display = 'flex';
    DOM.encodeProgressFill.style.width = '0%';
    DOM.decodeBarFill.style.width = '0%';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('load', function () {
    init();
  });
})();