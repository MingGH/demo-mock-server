(function () {
  'use strict';

  var gsapReady = typeof gsap !== 'undefined' ? Promise.resolve(gsap) : new Promise(function (resolve) {
    var check = function () {
      if (typeof gsap !== 'undefined') resolve(gsap);
      else setTimeout(check, 50);
    };
    check();
  });

  var SCENE_W = 960;
  var SCENE_H = 540;
  var LOOP_FRAMES = 120;

  var DOM = {};
  var images = { background: null, character: null, foreground: null };
  var imagesLoaded = false;

  var state = {
    frame: 0,
    playing: true,
    speed: 1,
    mode: 'cel',
    layers: { background: true, character: true, foreground: true },
    cost: { duration: 30, fps: 24, movingLayers: 2, staticLayers: 2 }
  };

  function loadImages() {
    var srcs = {
      background: 'images/background.png',
      character: 'images/character.png',
      foreground: 'images/foreground.png'
    };
    var keys = Object.keys(srcs);
    var loaded = 0;
    return new Promise(function (resolve) {
      keys.forEach(function (key) {
        var img = new Image();
        img.onload = function () {
          images[key] = img;
          loaded++;
          if (loaded === keys.length) {
            imagesLoaded = true;
            resolve();
          }
        };
        img.onerror = function () {
          loaded++;
          if (loaded === keys.length) {
            imagesLoaded = true;
            resolve();
          }
        };
        img.src = srcs[key];
      });
    });
  }

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
    DOM.sceneCanvas.width = SCENE_W;
    DOM.sceneCanvas.height = SCENE_H;
    loadImages().then(function () {
      bindEvents();
      updateCost();
      initCostUI();
      animateHero();
      requestAnimationFrame(loop);
    });
  }

  function loop() {
    if (state.playing) {
      state.frame = (state.frame + state.speed) % LOOP_FRAMES;
    }
    renderFrame();
    requestAnimationFrame(loop);
  }

  function renderFrame() {
    if (!imagesLoaded) return;

    var canvas = DOM.sceneCanvas;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SCENE_W, SCENE_H);

    // Background layer
    if (state.layers.background && images.background) {
      if (state.mode === 'full') {
        // Full redraw mode: simulate flicker by slightly shifting brightness
        var flicker = (Math.random() * 0.06) - 0.03;
        ctx.save();
        ctx.filter = 'brightness(' + (1 + flicker) + ')';
        ctx.drawImage(images.background, 0, 0, SCENE_W, SCENE_H);
        ctx.restore();
      } else {
        ctx.drawImage(images.background, 0, 0, SCENE_W, SCENE_H);
      }
    }

    // Character layer (animated position)
    if (state.layers.character && images.character) {
      var charW = 160;
      var charH = 160;
      var pos = getCharacterPosition(state.frame);

      if (state.mode === 'full') {
        var cf = (Math.random() * 0.04) - 0.02;
        ctx.save();
        ctx.filter = 'brightness(' + (1 + cf) + ')';
        ctx.drawImage(images.character, pos.x, pos.y, charW, charH);
        ctx.restore();
      } else {
        ctx.drawImage(images.character, pos.x, pos.y, charW, charH);
      }
    }

    // Foreground layer
    if (state.layers.foreground && images.foreground) {
      if (state.mode === 'full') {
        var ff = (Math.random() * 0.06) - 0.03;
        ctx.save();
        ctx.filter = 'brightness(' + (1 + ff) + ')';
        ctx.drawImage(images.foreground, 0, 0, SCENE_W, SCENE_H);
        ctx.restore();
      } else {
        ctx.drawImage(images.foreground, 0, 0, SCENE_W, SCENE_H);
      }
    }

    updateRedrawBadge();
  }

  function getCharacterPosition(frame) {
    var t = LOOP_FRAMES > 1 ? frame / (LOOP_FRAMES - 1) : 0;
    // Move from left to right across the scene
    var x = Math.round(t * (SCENE_W - 180) + 10);
    // Gentle bounce
    var bounce = Math.abs(Math.sin(frame * 0.12)) * 30;
    var y = Math.round(SCENE_H * 0.55 - bounce);
    return { x: x, y: y };
  }

  function updateRedrawBadge() {
    var total = 0;
    if (state.layers.background) total++;
    if (state.layers.character) total++;
    if (state.layers.foreground) total++;

    var redrawn;
    if (state.mode === 'full') {
      redrawn = total;
    } else {
      redrawn = state.layers.character ? 1 : 0;
    }

    DOM.redrawBadge.textContent = state.mode === 'full'
      ? '\u6574\u5e27\u91cd\u753b\uff1a\u672c\u5e27\u91cd\u753b ' + redrawn + ' \u5c42'
      : '\u8d5b\u7490\u73de\uff1a\u672c\u5e27\u53ea\u91cd\u753b ' + redrawn + ' \u5c42\uff08\u5176\u4f59\u590d\u7528\uff09';
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
        ? '<i class="ti ti-player-pause"></i> \u6682\u505c'
        : '<i class="ti ti-player-play"></i> \u64ad\u653e';
    });

    DOM.resetBtn.addEventListener('click', function () {
      state.frame = 0;
      state.playing = true;
      DOM.playBtn.innerHTML = '<i class="ti ti-player-pause"></i> \u6682\u505c';
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
          ? '\u8d5b\u7490\u73de\uff1a\u80cc\u666f/\u524d\u666f\u53ea\u753b\u4e00\u6b21\uff0c\u672c\u5e27\u53ea\u91cd\u753b\u89d2\u8272\u3002'
          : '\u6574\u5e27\u91cd\u753b\uff1a\u6bcf\u4e00\u5e27\u8fde\u80cc\u666f\u90fd\u8981\u91cd\u65b0\u753b\uff0c\u80cc\u666f\u4f1a\u95ea\u70c1\u3002';
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
      DOM.movVal.textContent = state.cost.movingLayers + ' \u5c42';
      updateCost();
    });
    DOM.staticSlider.addEventListener('input', function () {
      state.cost.staticLayers = parseInt(DOM.staticSlider.value);
      DOM.staticVal.textContent = state.cost.staticLayers + ' \u5c42';
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
    DOM.movVal.textContent = state.cost.movingLayers + ' \u5c42';
    DOM.staticSlider.value = state.cost.staticLayers;
    DOM.staticVal.textContent = state.cost.staticLayers + ' \u5c42';
  }

  function formatDuration(sec) {
    if (sec >= 3600) return Math.round(sec / 60) + ' \u5206\u949f';
    if (sec >= 60) return (sec / 60).toFixed(1) + ' \u5206\u949f';
    return sec + ' \u79d2';
  }

  function initCostUI() {
    syncCostUI();
  }

  function updateCost() {
    var frames = FractalCel.computeFrameCount(state.cost.duration, state.cost.fps);
    var info = FractalCel.computeSavingsInfo(
      frames, state.cost.movingLayers, state.cost.staticLayers
    );

    DOM.statFrames.textContent = formatNumber(info.frames) + ' \u5e27';
    DOM.statCel.textContent = formatNumber(info.celSheets) + ' \u5f20';
    DOM.statFull.textContent = formatNumber(info.fullRedrawSheets) + ' \u5f20';
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
