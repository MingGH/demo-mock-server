/**
 * brutalism-lab app.js：DOM 绑定、渲染、交互。
 * 纯逻辑来自 engine.js（window.BTLAB）；本文件只负责状态应用与事件。
 */
(function () {
  'use strict';

  var E = window.BTLAB;
  if (!E || !E.CASES) return;

  // ── 元素引用 ──
  var overlay = document.getElementById('brutalOverlay');
  var stage = document.getElementById('brutalStage');
  var labelEl = document.getElementById('btLabel');
  var prevBtn = document.getElementById('btPrev');
  var nextBtn = document.getElementById('btNext');
  var dotsEl = document.getElementById('btDots');
  var principleBtn = document.getElementById('btPrincipleBtn');
  var principlePanel = document.getElementById('btPrinciple');
  var modeBtn = document.getElementById('btModeBtn');
  var pauseBtn = document.getElementById('btPauseBtn');
  var cartBtn = document.getElementById('btCartBtn');
  var closeBtn = document.getElementById('btCloseBtn');
  var toastEl = document.getElementById('btToast');

  // ── 会话状态 ──
  var current = 0;
  var isOpen = false;
  var mode = 'design'; // 'design' | 'normal'
  var cartCount = 0;
  var motionPaused = false;
  var lastFocused = null;
  var toastTimer = null;
  var states = {};
  E.CASES.forEach(function (c) { states[c.id] = E.defaultState(c.id); });

  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 工具 ──
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function track(event, props) {
    if (window.NFTrack) {
      try { window.NFTrack.track(event, props); } catch (e) { /* 埋点失败不阻塞 */ }
    }
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  // ── 画廊卡片（含真实预览） ──
  function buildGallery() {
    var grid = document.getElementById('caseGrid');
    if (!grid) return;
    grid.innerHTML = E.CASES.map(function (cfg, idx) {
      var num = ('0' + (idx + 1)).slice(-2);
      var mini = buildMini(cfg);
      return '' +
        '<button class="case-card" type="button" data-case="' + cfg.id + '" data-idx="' + idx + '" style="--swatch:' + cfg.accent + ';--swatchbg:' + cfg.bg + '">' +
          '<span class="mini" data-mini="' + cfg.id + '" aria-hidden="true">' + mini + '</span>' +
          '<span class="case-meta">' +
            '<span class="case-top"><span class="case-num">' + num + '</span>' +
            '<span class="case-name">' + esc(cfg.name) + '</span></span>' +
            '<span class="case-blurb">' + esc(cfg.blurb) + '</span>' +
            '<span class="case-open"><i class="ti ti-arrows-maximize"></i> 点开体验</span>' +
          '</span>' +
        '</button>';
    }).join('');
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.case-card');
      if (!card) return;
      openCase(Number(card.getAttribute('data-idx')));
    });
  }

  /** 生成单张卡片内的迷你预览（与全屏构图同源、缩小版）。 */
  function buildMini(cfg) {
    var seg = esc(E.PRODUCT.brand.split(' ')[0]);
    switch (cfg.id) {
      case 'mega':
        return '<span class="mk mk-brand">' + seg + '</span><span class="mk mk-key">1299</span>';
      case 'mono':
        return '<span class="mk mk-grid"></span><span class="mk mk-bar">¥1299</span><span class="mk mk-block"></span>';
      case 'chaos':
        return '<span class="mk mk-t1">别吵</span><span class="mk mk-t2">' + seg + '</span><span class="mk mk-t3">¥1299</span>';
      case 'clash':
        return '<span class="mk mk-c1">安静</span><span class="mk mk-c2">¥1299</span>';
      case 'glitch':
        return '<span class="mk mk-g1">SIL</span><span class="mk mk-g2">ENT</span><span class="mk mk-scan"></span>';
      case 'marquee':
        return '<span class="mk mk-m">戴上 ·· 世界 ·· 安静 ·· 戴上 ·· 世界 ·· 安静</span>';
      default:
        return '';
    }
  }

  // ── 圆点导航 ──
  function renderDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = E.CASES.map(function (cfg, idx) {
      return '<button type="button" class="bt-dot' + (idx === current ? ' active' : '') +
        '" data-idx="' + idx + '" aria-label="' + esc(cfg.name) + '"' +
        (idx === current ? ' aria-current="true"' : '') + '></button>';
    }).join('');
  }

  // ── 全屏舞台渲染 ──
  function renderStage() {
    var cfg = E.CASES[current];
    stage.innerHTML = mode === 'design' ? designMarkup(cfg) : normalMarkup();
    overlay.setAttribute('data-case', cfg.id);
    overlay.classList.toggle('is-normal', mode === 'normal');

    // 主题变量注入弹层根节点：chrome/nav/controls 全部可继承
    var vars = E.themeVars(cfg);
    Object.keys(vars).forEach(function (k) { overlay.style.setProperty(k, vars[k]); });

    if (mode === 'design') {
      buildControls(cfg);
    }
    labelEl.innerHTML = '第 <b>' + (current + 1) + '</b> / ' + E.CASES.length + ' · ' +
      (mode === 'design' ? esc(cfg.name) : '普通版');
  }

  /** 设计版构图标记。 */
  function designMarkup(cfg) {
    var price = esc(E.formatPrice(E.PRODUCT.price, '¥'));
    var brand = esc(E.PRODUCT.brand);
    return '' +
      '<div class="bt-brand" data-drag>' + brand + '</div>' +
      '<div class="bt-meta" data-drag>' + esc(E.PRODUCT.name) + '</div>' +
      '<div class="bt-key" data-ghost="' + esc(cfg.keyPhrase) + '" data-g="' + esc(cfg.keyPhrase) + '">' + esc(cfg.keyPhrase) + '</div>' +
      '<div class="bt-tagline" data-drag>' + esc(cfg.tagline) + '</div>' +
      '<div class="bt-price" data-drag>' + price + '</div>' +
      '<button class="bt-cta" type="button" data-buy>立即购买</button>' +
      '<div class="bt-strip" aria-hidden="true"></div>' +
      '<div class="bt-scan" aria-hidden="true"></div>' +
      '<div class="bt-img" data-drag><img src="images/product.png" alt="头戴式耳机产品图" draggable="false"></div>';
  }

  /** 普通版（对照）标记：安静的标准商品页。 */
  function normalMarkup() {
    var chips = E.PRODUCT.desc.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('');
    return '' +
      '<div class="bt-normal">' +
        '<div class="bn-card">' +
          '<div class="bn-media"><img src="images/product.png" alt="头戴式耳机产品图"></div>' +
          '<div class="bn-info">' +
            '<div class="bn-brand">' + esc(E.PRODUCT.brand) + ' · 演示商店（虚构品牌）</div>' +
            '<div class="bn-name">' + esc(E.PRODUCT.name) + '</div>' +
            '<div class="bn-price">' + esc(E.formatPrice(E.PRODUCT.price, '¥')) + '</div>' +
            '<ul class="bn-desc">' + chips + '</ul>' +
            '<div class="bn-cta">' +
              '<button class="bn-btn bn-primary" type="button" data-buy>立即购买</button>' +
              '<button class="bn-btn bn-secondary" type="button" data-cart>加入购物车</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<p class="bn-note">普通版用来对照：同一套商品信息，切换到设计版看排版被推向哪里。</p>' +
      '</div>';
  }

  // ── 每案例控制台 ──
  function buildControls(cfg) {
    var old = document.getElementById('btControls');
    if (old) old.remove();
    var panel = document.createElement('div');
    panel.className = 'bt-controls';
    panel.id = 'btControls';
    panel.innerHTML = controlsMarkup(cfg);
    overlay.appendChild(panel);
    bindControls(cfg, panel);
    // 拖拽元素重新收集
    if (cfg.id === 'chaos') initDraggables(panel);
  }

  /** 各案例的控制台内容（含公共重置按钮）。 */
  function controlsMarkup(cfg) {
    var reset = '<button class="bt-ctl-btn" type="button" data-reset><i class="ti ti-rotate"></i> 重置</button>';
    switch (cfg.id) {
      case 'mega':
        return '<div class="bt-ctl-row"><label for="megaRange">字号 <b id="megaVal">' + states.mega.scale + '</b></label>' +
          '<input type="range" id="megaRange" min="' + E.MEGA_RANGE.min + '" max="' + E.MEGA_RANGE.max + '" step="' + E.MEGA_RANGE.step + '" value="' + states.mega.scale + '"></div>' + reset;
      case 'mono':
        return '<div class="bt-ctl-row">' +
          '<button class="bt-ctl-btn" type="button" data-toggle="grid" aria-pressed="' + states.mono.grid + '">结构线：' + (states.mono.grid ? '开' : '关') + '</button>' +
          '<button class="bt-ctl-btn" type="button" data-toggle="hard" aria-pressed="' + states.mono.hard + '">硬边：' + (states.mono.hard ? '开' : '关') + '</button></div>' + reset;
      case 'chaos':
        return '<div class="bt-ctl-row">' +
          '<button class="bt-ctl-btn" type="button" data-scatter><i class="ti ti-arrows-shuffle"></i> 打散</button>' +
          '<button class="bt-ctl-btn" type="button" data-restore><i class="ti ti-layout-grid"></i> 还原</button></div>' +
          '<p class="bt-ctl-hint" id="dragHint">元素可直接拖动</p>' + reset;
      case 'clash':
        return '<div class="bt-ctl-row bt-swatches">' +
          E.COLOR_PAIRS.map(function (p, i) {
            return '<button class="bt-swatch" type="button" data-pair="' + i + '" style="--sb:' + p.bg + ';--sf:' + p.fg + '" aria-pressed="' + (i === states.clash.pair) + '" aria-label="' + esc(p.name) + '"></button>';
          }).join('') + '</div>' +
          '<p class="bt-ctl-hint" id="pairInfo"></p>' + reset;
      case 'glitch':
        return '<div class="bt-ctl-row"><button class="bt-clean-btn" type="button" id="btClean">' +
          '<i class="ti ti-wave-sine"></i> 按住 开启降噪</button></div>' +
          '<div class="bt-meter" aria-hidden="true"><span id="noiseMeter"></span></div>' +
          '<p class="bt-ctl-hint" id="noiseHint">噪声 100%</p>' + reset;
      case 'marquee':
        return '<div class="bt-ctl-row"><label for="mqSpeed">速度 <b id="mqVal">' + states.marquee.speed + '×</b></label>' +
          '<input type="range" id="mqSpeed" min="' + E.MARQUEE_SPEED.min + '" max="' + E.MARQUEE_SPEED.max + '" step="' + E.MARQUEE_SPEED.step + '" value="' + states.marquee.speed + '">' +
          '<button class="bt-ctl-btn" type="button" id="mqPause" aria-pressed="' + states.marquee.paused + '">' + (states.marquee.paused ? '继续' : '暂停') + '</button></div>' + reset;
      default:
        return reset;
    }
  }

  /** 绑定各案例控件事件并应用状态。 */
  function bindControls(cfg, panel) {
    var resetBtn = panel.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      states = E.resetCaseState(states, cfg.id);
      renderStage();
      toast('已重置「' + cfg.name + '」');
      track('case_reset', { idx: current });
    });

    if (cfg.id === 'mega') {
      var range = panel.querySelector('#megaRange');
      range.addEventListener('input', function () {
        states.mega.scale = Number(range.value);
        applyMega();
      });
      applyMega();
    }

    if (cfg.id === 'mono') {
      panel.querySelectorAll('[data-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-toggle');
          states.mono[key] = !states.mono[key];
          btn.setAttribute('aria-pressed', String(states.mono[key]));
          btn.textContent = (key === 'grid' ? '结构线：' : '硬边：') + (states.mono[key] ? '开' : '关');
          applyMono();
        });
      });
      applyMono();
    }

    if (cfg.id === 'chaos') {
      panel.querySelector('[data-scatter]').addEventListener('click', function () { scatterChaos(true); });
      panel.querySelector('[data-restore]').addEventListener('click', function () { scatterChaos(false); });
      if (states.chaos.scattered) scatterChaos(true, true);
    }

    if (cfg.id === 'clash') {
      panel.querySelectorAll('[data-pair]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          states.clash.pair = Number(chip.getAttribute('data-pair'));
          panel.querySelectorAll('[data-pair]').forEach(function (c, i) {
            c.setAttribute('aria-pressed', String(i === states.clash.pair));
          });
          applyClash(panel);
          track('clash_pair', { pair: states.clash.pair });
        });
      });
      applyClash(panel);
    }

    if (cfg.id === 'glitch') bindClean(panel);

    if (cfg.id === 'marquee') {
      // 双拷贝内容 → track 位移 -50% 即一个内容宽度，实现无缝循环
      var strip = stage.querySelector('.bt-strip');
      var segs = ['戴上', '世界', '安静', E.formatPrice(E.PRODUCT.price, '¥')];
      var items = E.makeMarquee(segs, 8, ' ·· ');
      if (strip) {
        strip.innerHTML = '<div class="bt-track" aria-hidden="true">' +
          items.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
          '</div>';
      }
      var sp = panel.querySelector('#mqSpeed');
      sp.addEventListener('input', function () {
        states.marquee.speed = Number(sp.value);
        panel.querySelector('#mqVal').textContent = states.marquee.speed + '×';
        applyMarquee();
      });
      panel.querySelector('#mqPause').addEventListener('click', function () {
        states.marquee.paused = !states.marquee.paused;
        this.setAttribute('aria-pressed', String(states.marquee.paused));
        this.textContent = states.marquee.paused ? '继续' : '暂停';
        applyMarquee();
      });
      applyMarquee();
    }

    // 设计版内的购买按钮（mega/clash 等案例可见时）
    stage.querySelectorAll('[data-buy]').forEach(function (b) {
      b.addEventListener('click', function () { purchase('buy'); });
    });
    stage.querySelectorAll('[data-cart]').forEach(function (b) {
      b.addEventListener('click', function () { purchase('cart'); });
    });
  }

  // ── 各案例状态应用 ──
  function applyMega() {
    var layout = E.megaLayout(states.mega.scale);
    stage.style.setProperty('--mega-size', layout.fontSizeVw.toFixed(2) + 'vw');
    stage.style.setProperty('--mega-others', layout.othersOpacity.toFixed(2));
    var val = document.getElementById('megaVal');
    if (val) val.textContent = states.mega.scale;
  }

  function applyMono() {
    stage.classList.toggle('no-grid', !states.mono.grid);
    stage.classList.toggle('soft', !states.mono.hard);
  }

  function scatterChaos(scatter, instant) {
    states.chaos.scattered = scatter;
    var nodes = stage.querySelectorAll('[data-drag]');
    if (!window.gsap) return;
    var offsets = E.buildJitterOffsets(nodes.length, Math.min(window.innerWidth, window.innerHeight) * 0.12, 2026);
    nodes.forEach(function (n, i) {
      var o = offsets[i % offsets.length];
      if (instant) {
        window.gsap.set(n, scatter ? { x: o.x, y: o.y, rotation: o.rot } : { x: 0, y: 0, rotation: 0 });
      } else {
        window.gsap.to(n, { x: scatter ? o.x : 0, y: scatter ? o.y : 0, rotation: scatter ? o.rot : 0, duration: reducedMotion ? 0 : 0.55, ease: 'power3.out' });
      }
    });
  }

  function applyClash(panel) {
    var pair = E.COLOR_PAIRS[E.clamp(states.clash.pair, 0, E.COLOR_PAIRS.length - 1)];
    stage.style.setProperty('--pair-bg', pair.bg);
    stage.style.setProperty('--pair-fg', pair.fg);
    var ratio = E.contrastRatio(pair.bg, pair.fg);
    var pass = E.aaLarge(ratio);
    var info = document.getElementById('pairInfo');
    if (info) {
      info.textContent = pair.name + ' · 对比度 ' + ratio.toFixed(1) + ':1 · ' +
        (pass ? '达到 AA 大字标准' : '低于 AA 大字标准（3:1）');
      info.classList.toggle('warn', !pass);
    }
  }

  /** 按住降噪：pointer/keyboard 双通道。 */
  function bindClean(panel) {
    var btn = panel.querySelector('#btClean');
    if (!btn) return;
    var holding = false;

    function setNoise(v, animate) {
      states.glitch.noise = v;
      stage.style.setProperty('--noise-opacity', String(v));
      var meter = document.getElementById('noiseMeter');
      var hint = document.getElementById('noiseHint');
      if (meter) meter.style.width = Math.round(v * 100) + '%';
      if (hint) hint.textContent = '噪声 ' + Math.round(v * 100) + '%' + (v === 0 ? ' · 已安静' : '');
      if (window.gsap && animate && !reducedMotion) {
        window.gsap.to(stage, { duration: 0.2, '--noise-opacity': v, overwrite: 'auto' });
      }
    }

    function start(e) {
      if (holding) return;
      holding = true;
      btn.setAttribute('aria-pressed', 'true');
      setNoise(0, true);
      track('noise_hold', { idx: current });
    }
    function stop() {
      if (!holding) return;
      holding = false;
      btn.setAttribute('aria-pressed', 'false');
      setNoise(1, true);
    }

    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
    });
    btn.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') stop();
    });
    setNoise(states.glitch.noise, false);
  }

  function applyMarquee() {
    var track = stage.querySelector('.bt-strip .bt-track');
    if (!track) return;
    track.style.animationDuration = E.marqueeDuration(states.marquee.speed) + 's';
    track.style.animationPlayState = (states.marquee.paused || motionPaused) ? 'paused' : 'running';
  }

  // ── 错位拼贴拖拽（GSAP Draggable，CDN 缺失时降级提示） ──
  function initDraggables(panel) {
    if (!window.gsap || !window.Draggable) {
      var hint = panel.querySelector('#dragHint');
      if (hint) hint.textContent = '拖拽库加载失败，可用「打散 / 还原」按钮';
      panel.querySelectorAll('[data-scatter],[data-restore]').forEach(function (b) { b.disabled = false; });
      return;
    }
    window.gsap.registerPlugin(window.Draggable);
    stage.querySelectorAll('[data-drag]').forEach(function (n) {
      n.classList.add('draggable');
      window.Draggable.create(n, { type: 'x,y', edgeResistance: 0.75, bounds: stage, allowNativeTouchScrolling: false });
    });
    track('drag_ready', { idx: current });
  }

  // ── 购买（模拟） ──
  function purchase(kind) {
    var fb = E.purchaseFeedback(kind, cartCount);
    if (!fb) return;
    cartCount = fb.count;
    var badge = cartBtn && cartBtn.querySelector('.bt-cart-count');
    if (badge) {
      badge.textContent = String(cartCount);
      badge.classList.toggle('has', cartCount > 0);
    }
    toast(fb.message);
    track('purchase_sim', { kind: kind === 'buy' ? 1 : 0, count: cartCount });
  }

  // ── 打开 / 关闭 / 焦点管理 ──
  function openCase(idx) {
    current = ((idx % E.CASES.length) + E.CASES.length) % E.CASES.length;
    mode = 'design';
    renderDots();
    closePrinciple();
    renderStage();
    track('case_open', { idx: current, tag: E.CASES[current].id });
    show();
  }

  function show() {
    if (isOpen) return;
    isOpen = true;
    lastFocused = document.activeElement;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    (closeBtn || overlay).focus();
  }

  function hide() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    closePrinciple();
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function closePrinciple() {
    principlePanel.classList.remove('open');
    principlePanel.setAttribute('aria-hidden', 'true');
  }

  function togglePrinciple() {
    var on = principlePanel.classList.toggle('open');
    principlePanel.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) track('principle_open', { idx: current });
  }

  function switchMode(next) {
    if (mode === next) return;
    mode = next;
    renderStage();
    track('mode_switch', { idx: current, to: next === 'design' ? 1 : 0 });
  }

  function togglePause() {
    motionPaused = !motionPaused;
    overlay.classList.toggle('motion-paused', motionPaused);
    pauseBtn.setAttribute('aria-pressed', String(motionPaused));
    applyMarquee();
    toast(motionPaused ? '动态已暂停' : '动态已恢复');
  }

  function go(delta) {
    current = ((current + delta) % E.CASES.length + E.CASES.length) % E.CASES.length;
    renderDots();
    renderStage();
  }

  // ── 焦点圈：Tab 在弹层内循环 ──
  var FOCUS_SEL = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function trapFocus(e) {
    if (e.key !== 'Tab' || !isOpen) return;
    var items = Array.prototype.filter.call(overlay.querySelectorAll(FOCUS_SEL), function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  // ── 事件绑定 ──
  closeBtn.addEventListener('click', hide);
  prevBtn.addEventListener('click', function () { go(-1); });
  nextBtn.addEventListener('click', function () { go(1); });
  modeBtn.addEventListener('click', function () {
    switchMode(mode === 'design' ? 'normal' : 'design');
    this.setAttribute('aria-pressed', String(mode === 'normal'));
  });
  pauseBtn.addEventListener('click', togglePause);
  cartBtn.addEventListener('click', function () {
    toast(cartCount > 0 ? '购物车共 ' + cartCount + ' 件（模拟，不会结算）' : '购物车是空的。点「加入购物车」试试（模拟）。');
  });
  principleBtn.addEventListener('click', togglePrinciple);
  principlePanel.querySelector('.bt-principle-close').addEventListener('click', closePrinciple);

  dotsEl.addEventListener('click', function (e) {
    var dot = e.target.closest('.bt-dot');
    if (!dot) return;
    current = Number(dot.getAttribute('data-idx'));
    renderStage();
    renderDots();
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) hide();
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      if (principlePanel.classList.contains('open')) closePrinciple();
      else hide();
    } else if (e.key === 'ArrowLeft') { go(-1); }
    else if (e.key === 'ArrowRight') { go(1); }
    trapFocus(e);
  });

  // 减少动态偏好变化时即时生效
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onMq = function (ev) {
      reducedMotion = ev.matches;
      overlay.classList.toggle('reduced', reducedMotion);
      if (reducedMotion && states.marquee) { states.marquee.paused = true; applyMarquee(); }
    };
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  // ── 初始化 ──
  overlay.classList.toggle('reduced', !!reducedMotion);
  if (reducedMotion) pauseBtn.setAttribute('aria-pressed', 'true');

  // 基线区商品按钮（模拟）
  document.querySelectorAll('.product-cta [data-base-buy]').forEach(function (b) {
    b.addEventListener('click', function () { purchase('buy'); });
  });
  document.querySelectorAll('.product-cta [data-base-cart]').forEach(function (b) {
    b.addEventListener('click', function () { purchase('cart'); });
  });

  var baseDesc = document.getElementById('baseDesc');
  if (baseDesc) {
    baseDesc.innerHTML = E.PRODUCT.desc.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('');
  }

  buildGallery();
  renderDots();
})();