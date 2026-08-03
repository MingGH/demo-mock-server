(function () {
  'use strict';

  var gsapReady = typeof gsap !== 'undefined' ? Promise.resolve(gsap) : new Promise(function (resolve) {
    var check = function () {
      if (typeof gsap !== 'undefined') resolve(gsap);
      else setTimeout(check, 50);
    };
    check();
  });

  var SCENE_W = 240;
  var SCENE_H = 160;
  var LOOP_FRAMES = 100;

  var DOM = {};
  var state = {
    scene: null,
    frame: 0,
    playing: true,
    speed: 1,
    mode: 'cel',
    layers: { background: true, character: true, foreground: true },
    cost: { duration: 30, fps: 24, movingLayers: 2, staticLayers: 2 }
  };

  function cacheDOM() {
    DOM.heroSection = document.getElementById('heroSection');
    DOM.heroBtn = document.getElementById('heroBtn');
    DOM.step1 = document.getElementById('step1');
    DOM.step2 = document.getElementById('step2');
    DOM.step3 = document.getElementById('step3');
    DOM.sceneCanvas = document.getElementById('sceneCanvas');
    DOM.redrawBadge = document.getElementById('redrawBadge');
    DOM.playBtn = document.getElementById('playBtn');
    DOM.resetBtn = document.getElementById('resetBtn');
    DOM.speedSlider = document.getElementById('speedSlider');
    DOM.speedVal = document.getElementById('speedVal');
    DOM.modeHint = document.getElementById('modeHint');
    DOM.layerBtns = document.querySelectorAll('.toggle-btn');
    DOM.modeBtns = document.querySelectorAll('.mode-btn');
    DOM.durSlider = document.getElementById('durSlider');
    DOM.durVal = document.getElementById('durVal');
    DOM.fpsSlider = document.getElementById('fpsSlider');
    DOM.fpsVal = document.getElementById('fpsVal');
    DOM.movSlider = document.getElementById('movSlider');
    DOM.movVal = document.getElementById('movVal');
    DOM.staticSlider = document.getElementById('staticSlider');
    DOM.staticVal = document.getElementById('staticVal');
    DOM.presetBtns = document.querySelectorAll('[data-preset]');
    DOM.statFrames = document.getElementById('statFrames');
    DOM.statCel = document.getElementById('statCel');
    DOM.statFull = document.getElementById('statFull');
    DOM.statRatio = document.getElementById('statRatio');
    DOM.barCel = document.getElementById('barCel');
    DOM.barFull = document.getElementById('barFull');
    DOM.nextBtn1 = document.getElementById('nextBtn1');
    DOM.nextBtn2 = document.getElementById('nextBtn2');
  }

  function init() {
    cacheDOM();
    buildScene();
    bindEvents();
    updateCost();
    initCostUI();
    animateHero();
    requestAnimationFrame(loop);
  }

  function buildScene() {
    state.scene = {
      background: FractalCel.buildBackground(SCENE_W, SCENE_H),
      character: FractalCel.buildCharacterSprite(),
      foreground: FractalCel.buildForeground(SCENE_W, SCENE_H)
    };
  }

  function loop() {
    if (state.playing) {
      state.frame = (state.frame + state.speed) % LOOP_FRAMES;
    }
    renderFrame();
    requestAnimationFrame(loop);
  }

  function renderFrame() {
    var scene = state.scene;
    var pos = FractalCel.characterPositionAt(
      state.frame, LOOP_FRAMES, SCENE_W, SCENE_H,
      scene.character.width, scene.character.height
    );

    var bg = state.layers.background ? scene.background : null;
    if (state.layers.background && state.mode === 'full') {
      var flicker = Math.round((Math.random() * 14) - 7);
      bg = FractalCel.applyFlicker(scene.background, flicker);
    }
    var ch = state.layers.character ? scene.character : null;
    var fg = state.layers.foreground ? scene.foreground : null;

    var out = FractalCel.composite(SCENE_W, SCENE_H, bg, ch, fg, pos.x, pos.y);
    putPixels(out);
    updateRedrawBadge();
  }

  function putPixels(buf) {
    var canvas = DOM.sceneCanvas;
    canvas.width = SCENE_W;
    canvas.height = SCENE_H;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(SCENE_W, SCENE_H);
    imageData.data.set(buf);
    ctx.putImageData(imageData, 0, 0);
  }

  function updateRedrawBadge() {
    var total = 0;
    if (state.layers.background) total++;
    if (state.layers.character) total++;
    if (state.layers.foreground) total++;

    var redrawn;
    if (state.mode === 'full') {
      redrawn = total; // 整帧重画：所有显示的图层都要重画
    } else {
      redrawn = state.layers.character ? 1 : 0; // 赛璐珞：只有角色在动
    }

    DOM.redrawBadge.textContent = state.mode === 'full'
      ? '整帧重画：本帧重画 ' + redrawn + ' 层'
      : '赛璐珞：本帧只重画 ' + redrawn + ' 层（其余复用）';
  }

  function bindEvents() {
    DOM.heroBtn.addEventListener('click', function () {
      transitionToStep1();
    });

    DOM.nextBtn1.addEventListener('click', function () {
      transitionToStep(2);
    });
    DOM.nextBtn2.addEventListener('click', function () {
      transitionToStep(3);
    });

    DOM.playBtn.addEventListener('click', function () {
      state.playing = !state.playing;
      DOM.playBtn.innerHTML = state.playing
        ? '<i class="ti ti-player-pause"></i> 暂停'
        : '<i class="ti ti-player-play"></i> 播放';
    });

    DOM.resetBtn.addEventListener('click', function () {
      state.frame = 0;
      state.playing = true;
      DOM.playBtn.innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
    });

    DOM.speedSlider.addEventListener('input', function () {
      state.speed = parseFloat(DOM.speedSlider.value);
      DOM.speedVal.textContent = state.speed.toFixed(1) + '\u00D7';
    });

    DOM.layerBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var layer = btn.getAttribute('data-layer');
        state.layers[layer] = !state.layers[layer];
        btn.classList.toggle('active', state.layers[layer]);
      });
    });

    DOM.modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.mode = btn.getAttribute('data-mode');
        DOM.modeBtns.forEach(function (b) { b.classList.toggle('active', b === btn); });
        DOM.modeHint.textContent = state.mode === 'cel'
          ? '赛璐珞：背景/前景只画一次，本帧只重画角色。'
          : '整帧重画：每一帧连背景都要重新画，背景会闪烁。';
      });
    });

    DOM.durSlider.addEventListener('input', function () {
      state.cost.duration = parseInt(DOM.durSlider.value);
      DOM.durVal.textContent = formatDuration(state.cost.duration);
      updateCost();
    });
    DOM.fpsSlider.addEventListener('input', function () {
      state.cost.fps = parseInt(DOM.fpsSlider.value);
      DOM.fpsVal.textContent = state.cost.fps + ' fps';
      updateCost();
    });
    DOM.movSlider.addEventListener('input', function () {
      state.cost.movingLayers = parseInt(DOM.movSlider.value);
      DOM.movVal.textContent = state.cost.movingLayers + ' 层';
      updateCost();
    });
    DOM.staticSlider.addEventListener('input', function () {
      state.cost.staticLayers = parseInt(DOM.staticSlider.value);
      DOM.staticVal.textContent = state.cost.staticLayers + ' 层';
      updateCost();
    });

    DOM.presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var preset = btn.getAttribute('data-preset');
        if (preset === 'short') { setCost(10, 24, 2, 2); }
        else if (preset === 'minute') { setCost(60, 24, 2, 2); }
        else if (preset === 'feature') { setCost(5400, 24, 2, 2); }
        updateCost();
      });
    });
  }

  function setCost(duration, fps, mov, stat) {
    state.cost.duration = duration;
    state.cost.fps = fps;
    state.cost.movingLayers = mov;
    state.cost.staticLayers = stat;
    syncCostUI();
  }

  function syncCostUI() {
    DOM.durSlider.value = Math.min(state.cost.duration, parseInt(DOM.durSlider.max));
    DOM.durVal.textContent = formatDuration(state.cost.duration);
    DOM.fpsSlider.value = state.cost.fps;
    DOM.fpsVal.textContent = state.cost.fps + ' fps';
    DOM.movSlider.value = state.cost.movingLayers;
    DOM.movVal.textContent = state.cost.movingLayers + ' 层';
    DOM.staticSlider.value = state.cost.staticLayers;
    DOM.staticVal.textContent = state.cost.staticLayers + ' 层';
  }

  function formatDuration(sec) {
    if (sec >= 3600) return Math.round(sec / 60) + ' 分钟';
    if (sec >= 60) return (sec / 60).toFixed(1) + ' 分钟';
    return sec + ' 秒';
  }

  function initCostUI() {
    syncCostUI();
  }

  function updateCost() {
    var frames = FractalCel.computeFrameCount(state.cost.duration, state.cost.fps);
    var info = FractalCel.computeSavingsInfo(
      frames, state.cost.movingLayers, state.cost.staticLayers
    );

    DOM.statFrames.textContent = formatNumber(info.frames) + ' 帧';
    DOM.statCel.textContent = formatNumber(info.celSheets) + ' 张';
    DOM.statFull.textContent = formatNumber(info.fullRedrawSheets) + ' 张';
    DOM.statRatio.textContent = info.savingsRatio.toFixed(1) + '\u00D7';

    var max = Math.max(info.fullRedrawSheets, 1);
    DOM.barCel.style.width = (info.celSheets / max * 100) + '%';
    DOM.barFull.style.width = (info.fullRedrawSheets / max * 100) + '%';
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
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

  function transitionToStep(n) {
    var target = n === 2 ? DOM.step2 : DOM.step3;
    target.style.display = 'block';
    gsapReady.then(function (gsap) {
      gsap.fromTo(target, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function animateHero() {
    gsapReady.then(function (gsap) {
      gsap.fromTo(DOM.heroBtn, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' });
    });
  }

  window.addEventListener('load', function () {
    init();
  });
})();