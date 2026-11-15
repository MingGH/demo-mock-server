/**
 * app.js — 页面装配：渲染、采样、解码、交互
 *
 * 所有「算什么」的逻辑在 qr-core.js 里，这里只负责画和听事件。
 */
(function () {
  'use strict';

  var C = window.QRCore;
  var $ = function (id) { return document.getElementById(id); };
  var logoImg = $('logoImg');

  var QUIET = 4;        // 静区模块数
  var SCAN_MP = 7;      // 「相机」渲染时每模块像素
  var BAR_MAX = 1.5;    // 预算条量程到 150%

  /* 默认内容就是彩蛋：扫出来不是链接，是一句话 —— 而且这句话讲的就是你刚刚做的事情 */
  var DEFAULT_TEXT = '恭喜，你刚用 1960 年的数学，读回了被吃掉的那块。';

  /* 4 个一键场景：每个都是一套完整参数，保证点下去可复现 */
  var PRESETS = {
    safe: { text: DEFAULT_TEXT, level: 'H', logoPct: 20, blur: 0, dist: 1, rot: 0, noise: 0, contrast: 1 },
    common: { text: DEFAULT_TEXT, level: 'H', logoPct: 26, blur: 0, dist: 1, rot: 0, noise: 0, contrast: 1 },
    aggressive: { text: DEFAULT_TEXT, level: 'H', logoPct: 38, blur: 0, dist: 1, rot: 0, noise: 0, contrast: 1 },
    edge: { text: DEFAULT_TEXT, level: 'H', logoPct: 49, blur: 0, dist: 1, rot: 0, noise: 0, contrast: 1 }
  };

  var state = Object.assign({}, PRESETS.common, { showFn: true, showDmg: true });

  var qr = null;                     // 当前矩阵缓存
  var workCv = document.createElement('canvas');  // 未降级的「印刷图」
  var last = null;                   // 最近一次结算，给「复制结论」用

  /* ─────────────── 构建矩阵 ─────────────── */

  function buildQR() {
    var key = state.level + '|' + state.text;
    if (qr && qr.key === key) return qr;

    var res = window.QRCode.create(state.text, { errorCorrectionLevel: state.level });
    var size = res.modules.size;
    var dark = new Uint8Array(size * size);
    var src = res.modules.data;
    for (var i = 0; i < size * size; i++) dark[i] = src[i] ? 1 : 0;

    var struct = C.structure(size);
    var walk = C.placement(size, struct.fn);
    qr = { key: key, size: size, version: C.versionOf(size), dark: dark, struct: struct, walk: walk };
    return qr;
  }

  /* ─────────────── 绘制小工具 ─────────────── */

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rr); return; }
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** 按 Logo 形状开一条路径，用于填充与裁剪 */
  function clipShape(ctx, cx, cy, s, shape) {
    ctx.beginPath();
    if (shape === 'circle') { ctx.arc(cx, cy, s / 2, 0, Math.PI * 2); return; }
    roundRect(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.2);
  }

  /** Logo = 白色底板 + 照片。现实里的 Logo 基本都垫一层白底，而这块白底也在吃预算。 */
  function drawLogo(ctx, cx, cy, sidePx, shape) {
    if (sidePx < 2) return;
    ctx.save();

    ctx.fillStyle = '#ffffff';
    clipShape(ctx, cx, cy, sidePx, shape);
    ctx.fill();

    var inner = sidePx * 0.84;
    var ready = logoImg && logoImg.complete && logoImg.naturalWidth > 0;

    if (ready) {
      ctx.save();
      clipShape(ctx, cx, cy, inner, shape);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(logoImg, cx - inner / 2, cy - inner / 2, inner, inner);
      ctx.restore();
    } else {
      var g = ctx.createLinearGradient(cx - inner / 2, cy - inner / 2, cx + inner / 2, cy + inner / 2);
      g.addColorStop(0, '#ffd700');
      g.addColorStop(1, '#ff9f43');
      ctx.fillStyle = g;
      clipShape(ctx, cx, cy, inner, shape);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 逐行合并连续黑块，减少 fillRect 次数 */
  function paintModules(ctx, q, ox, oy, m) {
    ctx.fillStyle = '#12161d';
    var n = q.size;
    for (var r = 0; r < n; r++) {
      var base = r * n;
      var c = 0;
      while (c < n) {
        if (!q.dark[base + c]) { c++; continue; }
        var run = 1;
        while (c + run < n && q.dark[base + c + run]) run++;
        ctx.fillRect(ox + c * m, oy + r * m, run * m + 0.35, m + 0.35);
        c += run;
      }
    }
  }

  function fitCanvas(cv) {
    var cssW = cv.clientWidth || 360;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var px = Math.round(cssW * dpr);
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    return px;
  }

  /* ─────────────── 分析视图 ─────────────── */

  function drawPreview(q, cov, ms) {
    var cv = $('preview');
    var W = fitCanvas(cv);
    var ctx = cv.getContext('2d');
    var m = Math.floor(W / (q.size + QUIET * 2));
    var ox = Math.round((W - q.size * m) / 2);
    var oy = ox;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, W);

    paintModules(ctx, q, ox, oy, m);

    // 功能图形：multiply 只染白模块，黑模块保持原样，不会糊成一团
    if (state.showFn) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#a8cdf5';
      for (var r = 0; r < q.size; r++) {
        for (var c = 0; c < q.size; c++) {
          if (q.struct.fn[r * q.size + c]) ctx.fillRect(ox + c * m, oy + r * m, m + 0.4, m + 0.4);
        }
      }
      ctx.restore();
    }

    // 真正被翻掉的模块（不是被盖住的模块）
    if (state.showDmg) {
      ctx.fillStyle = 'rgba(255, 84, 84, 0.85)';
      for (var r2 = 0; r2 < q.size; r2++) {
        for (var c2 = 0; c2 < q.size; c2++) {
          if (ms.flip[r2 * q.size + c2]) ctx.fillRect(ox + c2 * m, oy + r2 * m, m + 0.4, m + 0.4);
        }
      }
    }

    // Logo 半透明，好看清底下哪个模块被翻了
    ctx.globalAlpha = 0.55;
    drawLogo(ctx, ox + q.size * m / 2, oy + q.size * m / 2, cov.side * m, 'rect');
    ctx.globalAlpha = 1;

    // 被压住的校正图形
    if (cov.apHit.length) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = Math.max(1.4, m * 0.2);
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
      for (var k = 0; k < cov.apHit.length; k++) {
        var ap = q.struct.apList[cov.apHit[k]];
        ctx.strokeRect(ox + (ap.c - 2) * m, oy + (ap.r - 2) * m, m * 5, m * 5);
      }
      ctx.restore();
    }
  }

  /* ─────────────── 「相机」视图 ─────────────── */

  var seed = 20261112;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  function renderScan(q, cov) {
    var cv = $('scan');
    var bw = (q.size + QUIET * 2) * SCAN_MP;

    workCv.width = workCv.height = bw;
    var w = workCv.getContext('2d', { willReadFrequently: true });
    w.fillStyle = '#ffffff';
    w.fillRect(0, 0, bw, bw);
    paintModules(w, q, QUIET * SCAN_MP, QUIET * SCAN_MP, SCAN_MP);
    drawLogo(w, bw / 2, bw / 2, cov.side * SCAN_MP, 'rect');

    // 画布要够大，否则一旋转就把符号的角切掉了 —— 那测到的就不是「旋转」而是「裁切」
    var base = Math.round(bw * state.dist);
    var th = (state.rot * Math.PI) / 180;
    var cover = Math.abs(Math.cos(th)) + Math.abs(Math.sin(th));
    var S = Math.max(60, Math.round(base * (state.rot ? cover : 1)));
    if (cv.width !== S) { cv.width = S; cv.height = S; }
    var s = cv.getContext('2d', { willReadFrequently: true });

    s.save();
    s.fillStyle = '#ffffff';
    s.fillRect(0, 0, S, S);
    s.translate(S / 2, S / 2);
    if (state.rot) s.rotate(th);
    s.translate(-base / 2, -base / 2);
    var px = state.blur * SCAN_MP * (base / bw);
    if (px > 0.05) s.filter = 'blur(' + px.toFixed(2) + 'px)';
    s.imageSmoothingEnabled = true;
    s.imageSmoothingQuality = 'high';
    s.drawImage(workCv, 0, 0, base, base);
    s.restore();

    if (state.noise > 0 || state.contrast < 1) {
      var img = s.getImageData(0, 0, S, S);
      var d = img.data;
      seed = 20261112;
      var f = state.contrast;
      var amp = state.noise;
      for (var i = 0; i < d.length; i += 4) {
        for (var k = 0; k < 3; k++) {
          var v = d[i + k];
          if (f < 1) v = 128 + (v - 128) * f;
          if (amp > 0) v += (rnd() - 0.5) * 2 * amp;
          d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
      s.putImageData(img, 0, 0);
    }
  }

  /** 在未降级的印刷图上逐模块取亮度 —— 这才是「真的错了几位」 */
  function measure(q) {
    var bw = (q.size + QUIET * 2) * SCAN_MP;
    var data = workCv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, bw, bw).data;
    var sample = function (r, c) {
      var px = Math.floor((QUIET + c + 0.5) * SCAN_MP);
      var py = Math.floor((QUIET + r + 0.5) * SCAN_MP);
      var i = (py * bw + px) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    return C.measureFlips(q.size, q.dark, q.struct, q.walk.order, q.walk.totalCodewords, sample);
  }

  /* ─────────────── 解码 ─────────────── */

  function decodeNow() {
    var cv = $('scan');
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var img = ctx.getImageData(0, 0, cv.width, cv.height);
    try {
      return !!window.jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
    } catch (e) {
      return false;
    }
  }

  var decodeQueued = false;
  function scheduleDecode() {
    if (decodeQueued) return;
    decodeQueued = true;
    var done = function () {
      if (!decodeQueued) return;   // rAF 和兜底定时器只跑一次
      decodeQueued = false;
      paintVerdict(decodeNow());
    };
    requestAnimationFrame(done);
    setTimeout(done, 60);          // 后台标签页里 rAF 不触发
  }

  function paintVerdict(ok) {
    if (last) last.ok = ok;
    var badge = $('badge');
    badge.className = 'badge ' + (ok ? 'ok' : 'no');
    badge.textContent = ok ? '识别成功' : '识别失败';
    $('mVerdictCard').className = 'metric ' + (ok ? 'good' : 'bad');
    $('mVerdict').textContent = ok ? '通过' : '失败';
  }

  /* ─────────────── 主渲染 ─────────────── */

  function render() {
    var q;
    try {
      q = buildQR();
    } catch (e) {
      showError('这段内容在 ' + state.level + ' 级下放不下。换短一点的网址，或者把纠错等级降到 Q/M。');
      return;
    }
    hideError();

    var cov = C.coverage(q.size, state.logoPct, q.struct, 'rect');
    renderScan(q, cov);
    var ms = measure(q);
    drawPreview(q, cov, ms);
    paintStats(q, cov, ms);
    scheduleDecode();
  }

  function paintStats(q, cov, ms) {
    var b = C.budgetUsed(state.level, ms.cwDamaged, ms.totalCw);
    last = { q: q, cov: cov, ms: ms, ok: null, budget: b };

    $('verLabel').textContent = 'v' + q.version + ' · ' + q.size + '×' + q.size;
    $('mVer').innerHTML = 'v' + q.version + ' <small>' + q.size + '×' + q.size + '</small>';
    $('mCw').innerHTML = ms.totalCw + ' <small>个</small>';
    $('mDmg').innerHTML = ms.cwDamaged + ' <small>个 · ' + (b.damagedRatio * 100).toFixed(1) + '%</small>';

    $('budgetPct').textContent = Math.round(b.ratio * 100) + '%';
    $('budgetLv').textContent = state.level + ' 级上限';
    $('budgetAbs').textContent = '盖住 ' + cov.covered + ' 模块 · 翻掉 ' + ms.flips +
      ' · 受损 ' + ms.cwDamaged + '/' + ms.totalCw + ' 码字';

    var bar = $('barFill');
    bar.style.width = (Math.min(b.ratio, BAR_MAX) / BAR_MAX * 100).toFixed(2) + '%';
    bar.style.background = b.ratio > 1 ? 'var(--red)' : b.ratio > 0.6 ? 'var(--gold)' : 'var(--green)';

    var warns = [];
    if (cov.apHit.length) {
      var where = cov.apHit.map(function (i) {
        return '(' + q.struct.apList[i].r + ',' + q.struct.apList[i].c + ')';
      }).join(' ');
      warns.push('压住了 ' + cov.apHit.length + ' 个校正图形 ' + where + '，其中 ' + ms.apFlips +
        ' 个模块被翻成反色 —— 面积远没到上限，但它负责透视校正，斜拍和曲面上会吃亏。');
    }
    if (ms.fnFlips) {
      warns.push('还碰坏了 ' + ms.fnFlips + ' 个定位/时序/格式信息模块 —— 这个基本必挂。');
    }
    var wEl = $('warn');
    if (warns.length) {
      $('warnTxt').innerHTML = warns.join('<br>');
      wEl.classList.add('on');
    } else {
      wEl.classList.remove('on');
    }
  }

  function showError(msg) { var e = $('err'); e.textContent = msg; e.style.display = 'block'; }
  function hideError() { $('err').style.display = 'none'; }

  /* ─────────────── 状态同步 ─────────────── */

  var LOSS_KEYS = ['blur', 'dist', 'rot', 'noise', 'contrast'];

  var FORMAT = {
    logo: function (v) { return v.toFixed(0) + '%'; },
    blur: function (v) { return v.toFixed(1); },
    dist: function (v) { return v.toFixed(2) + '×'; },
    rot: function (v) { return v.toFixed(0) + '°'; },
    noise: function (v) { return v.toFixed(0); },
    contrast: function (v) { return Math.round(v * 100) + '%'; }
  };

  function syncInputs() {
    $('txt').value = state.text;
    document.querySelectorAll('#lvSeg button').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.lv === state.level);
    });
    $('logo').value = state.logoPct;
    $('logoOut').textContent = FORMAT.logo(state.logoPct);
    LOSS_KEYS.forEach(function (k) {
      $(k).value = state[k];
      $(k + 'Out').textContent = FORMAT[k](state[k]);
    });
    $('showFn').checked = state.showFn;
    $('showDmg').checked = state.showDmg;
  }

  function setPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    Object.assign(state, p);
    document.querySelectorAll('.preset').forEach(function (el) {
      el.classList.toggle('active', el.dataset.preset === name);
    });
    syncInputs();
    render();
    track('preset', { name: name, logo: p.logoPct, level: p.level });
  }

  /* ─────────────── 埋点（尽力而为，失败不影响页面） ─────────────── */

  function track(name, props) {
    try {
      if (window.NFTrack && window.NFTrack.track) window.NFTrack.track(name, props);
    } catch (e) { /* 忽略 */ }
  }

  /* ─────────────── 临界点扫描 ─────────────── */

  function sweep() {
    var btn = $('sweep');
    var out = $('sweepOut');
    btn.disabled = true;
    out.textContent = '正在逐格测试…';

    setTimeout(function () {
      var MAX = 55;
      var backup = state.logoPct;
      var q = buildQR();
      var t0 = performance.now();
      var firstFail = null;
      var lastPass = null;
      var failRatio = 0;

      for (var pct = 0; pct <= MAX; pct += 1) {
        state.logoPct = pct;
        var cov = C.coverage(q.size, pct, q.struct, 'rect');
        renderScan(q, cov);
        var ms = measure(q);
        if (!decodeNow()) {
          firstFail = pct;
          failRatio = C.budgetUsed(state.level, ms.cwDamaged, ms.totalCw).ratio;
          break;
        }
        lastPass = pct;
      }
      var cost = Math.round(performance.now() - t0);

      state.logoPct = firstFail === null ? backup : Math.max(0, lastPass - 1);
      syncInputs();
      render();
      btn.disabled = false;

      if (firstFail === null) {
        out.innerHTML = '在当前劣化下，<b>' + MAX + '%</b> 都还能读 —— 预算根本没用完。';
        track('sweep', { fail: -1, level: state.level, logo: state.logoPct });
        return;
      }

      var tail = failRatio > 1
        ? '已经越过名义上限 —— 标准公布的是保守值，真实块结构留的余量更大。'
        : failRatio > 0.9
          ? '几乎就是名义上限本身 —— 没有额外劣化时，' + state.level + ' 级确实能扛到这个程度。'
          : '剩下的余量被分块结构、功能图形和现实损耗吃掉了。';
      out.innerHTML = '实测临界：<b>' + firstFail + '%</b> 开始解不出（上一个能读的是 ' + lastPass + '%）。' +
        '<br>那一刻用掉了名义预算的 <b>' + Math.round(failRatio * 100) + '%</b>，' + tail +
        '<br><span class="dim">' + (MAX + 1) + ' 轮渲染+解码，用时 ' + cost + ' ms</span>';
      track('sweep', { fail: firstFail, level: state.level, logo: state.logoPct });
    }, 30);
  }

  /* ─────────────── 复制结论 ─────────────── */

  function conclusionText() {
    if (!last) return '';
    var b = last.budget;
    return '二维码 ' + last.q.size + '×' + last.q.size + '（v' + last.q.version + ' / ' + state.level +
      ' 级），Logo ' + state.logoPct + '%：盖住 ' + last.cov.covered + ' 个模块、翻掉 ' + last.ms.flips +
      ' 位、受损 ' + last.ms.cwDamaged + '/' + last.ms.totalCw + ' 个码字（名义预算 ' +
      Math.round(b.ratio * 100) + '%），扫码' + (last.ok === null ? '结果待定' : last.ok ? '通过' : '失败') + '。';
  }

  function copyConclusion() {
    var text = conclusionText();
    var btn = $('copyBtn');
    var done = function () {
      var old = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
      setTimeout(function () { btn.innerHTML = old; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
    }
    track('copy', { logo: state.logoPct, level: state.level });
  }

  /* ─────────────── 绑定 ─────────────── */

  function bindSlider(id, key) {
    $(id).addEventListener('input', function (e) {
      state[key] = parseFloat(e.target.value);
      $(id + 'Out').textContent = FORMAT[id](state[key]);
      document.querySelectorAll('.preset').forEach(function (el) { el.classList.remove('active'); });
      render();
    });
  }

  var CONTENT = {
    short: 'https://numfeel.996.ninja',
    long: 'https://numfeel.996.ninja/pages/reed-solomon/index.html?from=qr-logo',
    egg: DEFAULT_TEXT
  };

  function init() {
    if (!window.QRCode || !window.jsQR || !C) {
      showError('二维码库没加载起来：确认 qrcode.min.js / jsqr.min.js / qr-core.js 都在这个目录下。');
      return;
    }

    $('txt').addEventListener('input', function (e) {
      state.text = e.target.value.trim() || 'a';
      render();
    });

    document.querySelectorAll('.preset').forEach(function (el) {
      el.addEventListener('click', function () { setPreset(el.dataset.preset); });
    });

    document.querySelectorAll('#lvSeg button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.level = btn.dataset.lv;
        document.querySelectorAll('#lvSeg button').forEach(function (x) { x.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.preset').forEach(function (x) { x.classList.remove('active'); });
        render();
      });
    });

    document.querySelectorAll('.chips button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.text = CONTENT[btn.dataset.content];
        $('txt').value = state.text;
        render();
      });
    });

    bindSlider('logo', 'logoPct');
    LOSS_KEYS.forEach(function (k) { bindSlider(k, k); });

    $('showFn').addEventListener('change', function (e) { state.showFn = e.target.checked; render(); });
    $('showDmg').addEventListener('change', function (e) { state.showDmg = e.target.checked; render(); });

    $('sweep').addEventListener('click', sweep);
    $('copyBtn').addEventListener('click', copyConclusion);

    var onResize = function () { render(); };
    window.addEventListener('resize', onResize);

    if (logoImg && !logoImg.complete) logoImg.addEventListener('load', function () { render(); });

    syncInputs();
    render();
    track('session_start', { level: state.level, logo: state.logoPct });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
