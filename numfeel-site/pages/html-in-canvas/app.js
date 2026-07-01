// ========== HTML-in-Canvas 演示 · DOM 与渲染层 ==========
// 依赖：engine.js（同目录）、html2canvas（CDN 按需加载）

(function () {
  'use strict';

  // ── 全局状态 ──
  var support = detectHtmlInCanvas();
  var html2canvasReady = null;
  var currentPosterId = POSTER_TEMPLATES[0].id;
  var particleAnim = null;
  // 各 Tab 首次变为可见时要执行的回调（懒加载用）
  var tabActivators = {};

  // ── 启动 ──
  document.addEventListener('DOMContentLoaded', function () {
    renderBanner();
    bindTabs();
    initPoster();
    // matrix 在隐藏 Tab 里，drawElementImage 要求元素已生成盒子（非 display:none），
    // 因此推迟到该 Tab 首次可见时再初始化渲染。
    tabActivators['matrix'] = initMatrix;
    initShatter();

    // 支持 URL hash 直达某个 Tab（#poster / #matrix / #shatter），也便于分享深链
    var hash = (location.hash || '').replace('#', '');
    if (hash === 'matrix' || hash === 'shatter') {
      switchToTab(hash);
    }
  });

  /**
   * 以编程方式切到指定 Tab（与点击等效），并触发其懒加载回调。
   * @param {string} target
   */
  function switchToTab(target) {
    var tabs = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.tab-panel');
    for (var k = 0; k < tabs.length; k++) {
      tabs[k].classList.toggle('active', tabs[k].dataset.tab === target);
    }
    for (var m = 0; m < panels.length; m++) {
      panels[m].classList.toggle('active', panels[m].dataset.panel === target);
    }
    activateTab(target);
  }

  // ─────────────────────────────────────────────────────────
  // Banner：显示当前浏览器是否支持 drawElementImage
  // ─────────────────────────────────────────────────────────
  function renderBanner() {
    var banner = document.getElementById('apiBanner');
    if (!banner) return;
    if (support.supported) {
      banner.classList.add('banner-good');
      banner.innerHTML =
        '<i class="ti ti-check"></i>' +
        '<div><strong>已检测到 drawElementImage</strong>' +
        '<span>本页右侧"新 API"列是真正的浏览器原生渲染。</span></div>';
    } else {
      banner.classList.add('banner-warn');
      banner.innerHTML =
        '<i class="ti ti-alert-triangle"></i>' +
        '<div><strong>未启用 HTML-in-Canvas（Chrome 138+ 需开 flag）</strong>' +
        '<span>地址栏访问 <code>chrome://flags/#canvas-draw-element</code> 选 Enabled 重启即可。' +
        '当前页面会用 html2canvas 兜底渲染右侧列，差异可能不明显。</span></div>';
    }
  }

  // ─────────────────────────────────────────────────────────
  // Tab 切换
  // ─────────────────────────────────────────────────────────
  function bindTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.tab-panel');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (e) {
        var target = e.currentTarget.dataset.tab;
        for (var k = 0; k < tabs.length; k++) {
          tabs[k].classList.toggle('active', tabs[k].dataset.tab === target);
        }
        for (var m = 0; m < panels.length; m++) {
          panels[m].classList.toggle('active', panels[m].dataset.panel === target);
        }
        activateTab(target);
      });
    }
  }

  /**
   * 触发某 Tab 的懒加载回调（仅首次执行一次）。
   * drawElementImage 要求元素已生成盒子（非 display:none），
   * 所以隐藏 Tab 里的原生渲染必须推迟到它变可见时才做。
   */
  function activateTab(name) {
    var fn = tabActivators[name];
    if (typeof fn === 'function') {
      tabActivators[name] = null; // 只跑一次
      // 等一帧，确保 display 从 none 切到 block 后布局已生效
      requestAnimationFrame(function () {
        requestAnimationFrame(fn);
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // html2canvas CDN 按需加载
  // ─────────────────────────────────────────────────────────
  function loadHtml2Canvas() {
    if (html2canvasReady) return html2canvasReady;
    var sources = [
      // 国内可直连的公共 CDN 优先
      'https://cdn.bootcdn.net/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      'https://cdn.staticfile.org/html2canvas/1.4.1/html2canvas.min.js',
      'https://lib.baomitu.com/html2canvas/1.4.1/html2canvas.min.js',
      // 海外兜底
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
    ];
    html2canvasReady = new Promise(function (resolve, reject) {
      if (window.html2canvas) { resolve(window.html2canvas); return; }
      var i = 0;
      function tryNext() {
        if (i >= sources.length) {
          reject(new Error('html2canvas 所有 CDN 均加载失败'));
          return;
        }
        var url = sources[i++];
        var s = document.createElement('script');
        s.src = url;
        s.onload = function () {
          if (window.html2canvas) {
            resolve(window.html2canvas);
          } else {
            tryNext();
          }
        };
        s.onerror = function () {
          console.warn('[HTML-in-Canvas] html2canvas CDN 加载失败，尝试下一个：', url);
          tryNext();
        };
        document.head.appendChild(s);
      }
      tryNext();
    });
    return html2canvasReady;
  }

  /**
   * 把一段 HTML 字符串渲染成 canvas（用 html2canvas）。
   * @param {string} html
   * @returns {Promise<HTMLCanvasElement>}
   */
  function renderWithHtml2Canvas(html) {
    return loadHtml2Canvas().then(function (h2c) {
      // host 留在视口内、opacity:0 隐藏，避免离屏 fixed 算出 0 尺寸
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;z-index:-1;background:transparent;';
      host.innerHTML = html;
      document.body.appendChild(host);
      var target = host.firstElementChild || host;
      return h2c(target, {
        backgroundColor: null,
        logging: false,
        scale: window.devicePixelRatio || 1,
        useCORS: false,
        // 卡片均为内联 style，不依赖外部样式表；
        // 移除克隆文档里的 <link>，避免 html2canvas 重新拉取页面 CSS（慢且服务器抖动时报错）
        onclone: function (clonedDoc) {
          var links = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
          for (var li = 0; li < links.length; li++) {
            if (links[li].parentNode) links[li].parentNode.removeChild(links[li]);
          }
        }
      }).then(function (canvas) {
        if (host.parentNode) host.parentNode.removeChild(host);
        return canvas;
      }).catch(function (err) {
        if (host.parentNode) host.parentNode.removeChild(host);
        console.error('[HTML-in-Canvas] html2canvas 渲染抛错：', err);
        throw err;
      });
    });
  }

  /**
   * 就地可视渲染：drawElementImage 要求渲染源在真实可视区域且作为
   * <canvas layoutsubtree> 的子节点，离屏（left:-99999px）会导致不绘制。
   * 这里直接在目标容器内创建可见的 canvas，源 HTML 作为其子节点
   * （layoutsubtree 下子节点只参与布局、不单独上屏），再用 drawElementImage 画进去。
   *
   * @param {HTMLElement} container 目标容器（第三行/第三列的框）
   * @param {string} html 源 HTML
   * @param {number} fallbackWidth 测不到尺寸时的兜底宽度
   * @returns {Promise<boolean>} true=原生渲染成功；false=已自动回退 html2canvas
   */
  function renderNativeInPlace(container, html, fallbackWidth) {
    return new Promise(function (resolve) {
      function doFallback(reason) {
        console.warn('[HTML-in-Canvas] 原生渲染回退 html2canvas：', reason);
        renderWithHtml2Canvas(html).then(function (cv) {
          container.innerHTML = '';
          cv.classList.add('result-canvas');
          var tip = document.createElement('div');
          tip.className = 'fallback-tip';
          tip.textContent = '兜底渲染';
          container.appendChild(tip);
          container.appendChild(cv);
          resolve(false);
        }).catch(function () {
          container.innerHTML = '<div class="err">渲染失败</div>';
          resolve(false);
        });
      }

      if (!support.supported) {
        doFallback('当前浏览器无 drawElementImage');
        return;
      }

      /**
       * 轻量透明检测：把目标 canvas 整体缩放到 <=32px 画进一张
       * willReadFrequently 的小 canvas，只做【一次】getImageData。
       * 避免在大图上高频逐点 readback 导致页面卡死。
       */
      function isBlank(cv) {
        try {
          if (!cv.width || !cv.height) return true;
          var tw = Math.max(1, Math.min(32, cv.width));
          var th = Math.max(1, Math.min(32, cv.height));
          var probe = document.createElement('canvas');
          probe.width = tw;
          probe.height = th;
          var pctx = probe.getContext('2d', { willReadFrequently: true });
          pctx.drawImage(cv, 0, 0, tw, th);
          var data = pctx.getImageData(0, 0, tw, th).data;
          for (var i = 3; i < data.length; i += 4) {
            if (data[i] > 8) return false;
          }
          return true;
        } catch (e) {
          return false; // 读不了就不当 blank，交给后续流程
        }
      }

      try {
        container.innerHTML = '';
        // 可见的 canvas，留在文档流里
        var canvas = document.createElement('canvas');
        canvas.setAttribute('layoutsubtree', '');
        canvas.className = 'result-canvas';

        var src = document.createElement('div');
        src.innerHTML = html;
        var srcNode = src.firstElementChild;
        canvas.appendChild(srcNode);

        // 先量出元素 CSS 尺寸（drawElementImage 不传 w/h 时按元素屏上尺寸绘制，
        // canvas 显示尺寸需与之一致），位图尺寸 = CSS 尺寸 × dpr 防模糊。
        var probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:-99999px;top:0;';
        probe.innerHTML = html;
        document.body.appendChild(probe);
        var pr = probe.firstElementChild.getBoundingClientRect();
        var cssW = Math.max(1, Math.round(pr.width || fallbackWidth || 340));
        var cssH = Math.max(1, Math.round(pr.height || 200));
        document.body.removeChild(probe);

        var dpr = window.devicePixelRatio || 1;
        // 关键：只声明 width，不写死 height。移动端容器窄于 cssW 时，
        // .result-canvas 的 max-width:100% + canvas 内在 aspect-ratio 会自动
        // 等比缩小，避免 overflow:hidden 把内容裁掉右半边。
        // 位图尺寸仍按 CSS × DPR 生成，缩显示不损位图分辨率。
        canvas.style.width = cssW + 'px';
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);

        container.appendChild(canvas);

        var painted = false;
        var settled = false;
        var paintTries = 0;
        var ctx = canvas.getContext('2d');

        canvas.onpaint = function () {
          if (settled) return;
          paintTries++;
          try {
            ctx.reset();
            var transform = ctx.drawElementImage(srcNode, 0, 0);
            if (transform && srcNode && srcNode.style) {
              srcNode.style.transform = transform.toString();
            }
          } catch (e) {
            settled = true;
            doFallback(e);
            return;
          }
          // drawElementImage 未抛错即视为成功。仅在首次 paint 且明显空白时，
          // 主动再触发一次 requestPaint 补一帧（避免等 ResizeObserver 永不触发导致
          // 反复报 "onpaint 未在预期时间内提供有效 paint record"）。
          // 第二次仍空也不再纠缠，直接判成功——空白很可能是内容本身透明。
          if (paintTries < 2 && isBlank(canvas)) {
            requestAnimationFrame(function () {
              if (settled) return;
              if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
            });
            return;
          }
          painted = true;
          settled = true;
          resolve(true);
        };

        // 经 headless 实测：手动单次 requestPaint 在多 canvas 并发时会错过 paint 调度。
        // 用 ResizeObserver 触发 requestPaint（官方推荐做法），稳定可靠。
        var ro = new ResizeObserver(function () {
          if (settled) { try { ro.disconnect(); } catch (e) {} return; }
          if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
        });
        try {
          ro.observe(canvas, { box: 'device-pixel-content-box' });
        } catch (e) {
          ro.observe(canvas);
        }
        if (typeof canvas.requestPaint === 'function') {
          canvas.requestPaint();
        }
        // 500ms / 1200ms 两次补偿 requestPaint，覆盖布局延后到位、字体加载完成等场景
        var retryT1 = setTimeout(function () {
          if (settled) return;
          if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
        }, 500);
        var retryT2 = setTimeout(function () {
          if (settled) return;
          if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
        }, 1200);

        // 兜底：~5 秒仍未成功则回退 html2canvas（只触发一次）
        setTimeout(function () {
          clearTimeout(retryT1);
          clearTimeout(retryT2);
          if (painted || settled) return;
          settled = true;
          try { ro.disconnect(); } catch (e) {}
          doFallback('onpaint 未在预期时间内提供有效 paint record');
        }, 5000);
      } catch (err) {
        doFallback(err);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // Tab1：海报对比
  // ─────────────────────────────────────────────────────────
  function initPoster() {
    var picker = document.getElementById('posterPicker');
    if (!picker) return;
    var html = '';
    for (var i = 0; i < POSTER_TEMPLATES.length; i++) {
      var t = POSTER_TEMPLATES[i];
      var cls = (i === 0) ? 'preset-btn active' : 'preset-btn';
      html += '<button class="' + cls + '" data-id="' + t.id + '">' +
        '<span class="preset-name">' + t.name + '</span>' +
        '<span class="preset-note">' + t.note + '</span>' +
        '</button>';
    }
    picker.innerHTML = html;
    var btns = picker.querySelectorAll('.preset-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function (e) {
        var id = e.currentTarget.dataset.id;
        currentPosterId = id;
        for (var k = 0; k < btns.length; k++) {
          btns[k].classList.toggle('active', btns[k].dataset.id === id);
        }
        renderPoster(id);
      });
    }
    renderPoster(currentPosterId);
  }

  function renderPoster(id) {
    var template = null;
    for (var i = 0; i < POSTER_TEMPLATES.length; i++) {
      if (POSTER_TEMPLATES[i].id === id) { template = POSTER_TEMPLATES[i]; break; }
    }
    if (!template) return;

    var liveHost = document.getElementById('posterLive');
    var legacyHost = document.getElementById('posterLegacy');
    var nativeHost = document.getElementById('posterNative');
    var noteEl = document.getElementById('posterNote');

    if (liveHost) liveHost.innerHTML = template.html;
    if (noteEl) noteEl.textContent = template.note;

    if (legacyHost) {
      legacyHost.innerHTML = '<div class="loading-dot">渲染中…</div>';
      renderWithHtml2Canvas(template.html).then(function (canvas) {
        legacyHost.innerHTML = '';
        canvas.classList.add('result-canvas');
        legacyHost.appendChild(canvas);
      }).catch(function () {
        legacyHost.innerHTML = '<div class="err">html2canvas 渲染失败</div>';
      });
    }

    if (nativeHost) {
      nativeHost.innerHTML = '<div class="loading-dot">渲染中…</div>';
      renderNativeInPlace(nativeHost, template.html, 340);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Tab2：差异矩阵
  // ─────────────────────────────────────────────────────────
  function initMatrix() {
    var list = document.getElementById('matrixList');
    if (!list) return;
    var html = '';
    for (var i = 0; i < DIFF_CASES.length; i++) {
      var c = DIFF_CASES[i];
      var judge = judgeCase(c.id, support.supported);
      var legacy = statusToLabel(judge.legacy);
      var native = statusToLabel(judge.native);
      html += '<div class="matrix-row" data-case="' + c.id + '">' +
        '<div class="matrix-cell matrix-title">' +
          '<div class="matrix-name">' + c.title + '</div>' +
          '<div class="matrix-tags">' +
            '<span class="status-pill tone-' + legacy.tone + '">html2canvas · ' + legacy.label + '</span>' +
            '<span class="status-pill tone-' + native.tone + '">drawElement · ' + native.label + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="matrix-cell matrix-source"></div>' +
        '<div class="matrix-cell matrix-legacy"><div class="loading-dot">…</div></div>' +
        '<div class="matrix-cell matrix-native"><div class="loading-dot">…</div></div>' +
        '<div class="matrix-cell matrix-explain">' +
          '<div class="exp-line exp-bad"><i class="ti ti-x"></i>' + c.legacyIssue + '</div>' +
          '<div class="exp-line exp-good"><i class="ti ti-check"></i>' + c.nativeWin + '</div>' +
        '</div>' +
      '</div>';
    }
    list.innerHTML = html;
    // 并行渲染所有行：headless 实测证明，串行 + 间隔会让 requestPaint 错过 paint 调度，
    // 一次性并行创建所有 canvas 才能稳定触发各自的 onpaint。
    var rows = list.querySelectorAll('.matrix-row');
    for (var r = 0; r < rows.length; r++) {
      (function (row) {
        var caseId = row.dataset.case;
        var caseObj = null;
        for (var i = 0; i < DIFF_CASES.length; i++) {
          if (DIFF_CASES[i].id === caseId) { caseObj = DIFF_CASES[i]; break; }
        }
        if (!caseObj) return;

        // 源 HTML 预览
        var srcCell = row.querySelector('.matrix-source');
        if (srcCell) {
          var srcWrap = document.createElement('div');
          srcWrap.className = 'matrix-source-inner';
          srcWrap.innerHTML = caseObj.html;
          srcCell.appendChild(srcWrap);
        }

        var legacyCell = row.querySelector('.matrix-legacy');
        var nativeCell = row.querySelector('.matrix-native');
        renderWithHtml2Canvas(caseObj.html).then(function (canvas) {
          legacyCell.innerHTML = '';
          canvas.classList.add('result-canvas');
          legacyCell.appendChild(canvas);
        }).catch(function () { legacyCell.innerHTML = '<div class="err">渲染失败</div>'; });

        renderNativeInPlace(nativeCell, caseObj.html, 280);
      })(rows[r]);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Tab3：粒子破碎
  // ─────────────────────────────────────────────────────────
  function initShatter() {
    var btnFire = document.getElementById('shatterFire');
    var btnReset = document.getElementById('shatterReset');
    var card = document.getElementById('shatterCard');
    if (!btnFire || !card) return;
    btnFire.addEventListener('click', function () { fireShatter(); });
    btnReset.addEventListener('click', function () { resetShatter(); });
  }

  /**
   * 把卡片元素采样成一张位图 canvas。
   * - 支持 drawElementImage：走原生采样，画质最好。
   * - 不支持（Safari / 大部分移动端）：不再调用 html2canvas（在手机上会
   *   触发 DOM 全量克隆 + 4MB 位图重绘，直接导致 Tab 崩溃）。改用一张
   *   手绘的"卡片替身位图"，颜色/文字排布跟真卡片一致，供粒子采样。
   * @returns {Promise<HTMLCanvasElement>}
   */
  function captureCardCanvas() {
    var card = document.getElementById('shatterCard');
    if (support.supported) {
      // 用 drawElementImage 采样（切题、原生）；失败内部自动回退合成位图
      return captureViaDrawElement(card);
    }
    return Promise.resolve(paintCardStandIn(card));
  }

  /**
   * 用 Canvas 2D 直接手绘一张跟真卡片视觉一致的替身位图。
   * 不动 DOM、不 clone、不算样式，内存 <100KB，是移动端唯一稳的路径。
   * @param {HTMLElement} card
   * @returns {HTMLCanvasElement}
   */
  function paintCardStandIn(card) {
    var rect = card.getBoundingClientRect();
    // 采样画布最长边硬卡 300px；DPR=1，避免手机上生成大位图
    var maxSide = 300;
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.max(1, Math.round(rect.height));
    var ratio = Math.min(1, maxSide / Math.max(cssW, cssH));
    var w = Math.max(1, Math.round(cssW * ratio));
    var h = Math.max(1, Math.round(cssH * ratio));

    var cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext('2d');

    // ── 卡片底：径向 + 线性渐变（跟 CSS 一致的 #1f2a4a → #0f3460 + 金色光斑）
    var bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1f2a4a');
    bg.addColorStop(1, '#0f3460');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    var glow = ctx.createRadialGradient(w * 0.8, h * 0.2, 0, w * 0.8, h * 0.2, w * 0.7);
    glow.addColorStop(0, 'rgba(255, 215, 0, 0.32)');
    glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // ── 顶部 SPECIAL 徽章（黄色椭圆胶囊）
    var padX = w * 0.06;
    var padY = h * 0.08;
    var tagH = h * 0.09;
    var tagW = w * 0.22;
    ctx.fillStyle = '#ffd700';
    roundRect(ctx, padX, padY, tagW, tagH, tagH / 2);
    ctx.fill();

    // ── 右上价格块（金色矩形示意）
    ctx.fillStyle = '#ffd700';
    var priceW = w * 0.28;
    var priceH = h * 0.12;
    ctx.fillRect(w - padX - priceW, padY - h * 0.01, priceW, priceH);

    // ── 标题条（白色）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    var titleY = padY + tagH + h * 0.08;
    ctx.fillRect(padX, titleY, w * 0.75, h * 0.09);

    // ── 描述条 × 2（浅白色）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    var descY = titleY + h * 0.14;
    ctx.fillRect(padX, descY, w * 0.85, h * 0.05);
    ctx.fillRect(padX, descY + h * 0.08, w * 0.7, h * 0.05);

    // ── 底部按钮（金色圆角矩形）
    var btnW = w * 0.32;
    var btnH = h * 0.14;
    var btnX = w - padX - btnW;
    var btnY = h - padY - btnH;
    ctx.fillStyle = '#ffd700';
    roundRect(ctx, btnX, btnY, btnW, btnH, h * 0.04);
    ctx.fill();

    // ── 底部左侧说明条
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(padX, btnY + btnH * 0.35, w * 0.35, btnH * 0.3);

    // ── 卡片边框（金色描边）
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.24)';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, w - 2, h - 2, Math.min(w, h) * 0.08);
    ctx.stroke();

    return cv;
  }

  /** 简易圆角矩形路径（不闭合，调用方自行 fill/stroke） */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * 用 drawElementImage 把一个 DOM 元素快照成位图 canvas（就地、可见）。
   * 失败降级为手绘替身位图（不再调 html2canvas，避免移动端 OOM）。
   * @param {HTMLElement} el
   * @returns {Promise<HTMLCanvasElement>}
   */
  function captureViaDrawElement(el) {
    return new Promise(function (resolve) {
      function fallback() {
        resolve(paintCardStandIn(el));
      }
      if (!support.supported) { fallback(); return; }

      try {
        var rect = el.getBoundingClientRect();
        var cssW = Math.max(1, Math.round(rect.width));
        var cssH = Math.max(1, Math.round(rect.height));
        // 粒子破碎不需要高 DPR——把采样画布限制在 CSS 像素分辨率，
        // 避免在 Retina 上每边 ×2 → 像素数 ×4，让 getImageData/采样循环过重。
        var dpr = 1;

        // 离屏容器（可见但放在卡片正下方覆盖，避免布局跳动）—— 用克隆，避免动到原卡片
        var holder = document.createElement('div');
        holder.style.cssText = 'position:absolute;left:0;top:0;opacity:0.001;pointer-events:none;z-index:-1;';
        var canvas = document.createElement('canvas');
        canvas.setAttribute('layoutsubtree', '');
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);

        var clone = el.cloneNode(true);
        clone.removeAttribute('id');
        clone.removeAttribute('contenteditable');
        canvas.appendChild(clone);
        holder.appendChild(canvas);
        document.getElementById('shatterStage').appendChild(holder);

        var ctx = canvas.getContext('2d');
        var done = false;
        var ro = null;
        function cleanup() {
          if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
          if (holder.parentNode) holder.parentNode.removeChild(holder);
        }
        function finish(out) {
          if (done) return; done = true;
          cleanup();
          resolve(out);
        }

        canvas.onpaint = function () {
          if (done) return;
          try {
            ctx.reset();
            ctx.drawElementImage(clone, 0, 0);
          } catch (e) {
            // 关键：这里不能调 finish(null)，否则 Promise 会先 resolve(null)，
            // 让后续的 fallback() 静默失效 →  外层看到 src=null →  "采样失败"
            if (done) return;
            done = true;
            cleanup();
            resolve(paintCardStandIn(el));
            return;
          }
          // 复制成独立 canvas 返回
          var out = document.createElement('canvas');
          out.width = canvas.width;
          out.height = canvas.height;
          out.getContext('2d').drawImage(canvas, 0, 0);
          finish(out);
        };

        ro = new ResizeObserver(function () {
          if (done) return;
          if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
        });
        try { ro.observe(canvas, { box: 'device-pixel-content-box' }); } catch (e) { ro.observe(canvas); }
        if (typeof canvas.requestPaint === 'function') canvas.requestPaint();

        setTimeout(function () {
          if (done) return;
          done = true;
          cleanup();
          resolve(paintCardStandIn(el));
        }, 1000);
      } catch (err) {
        fallback();
      }
    });
  }

  function fireShatter() {
    var card = document.getElementById('shatterCard');
    var stage = document.getElementById('shatterStage');
    var canvas = document.getElementById('shatterCanvas');
    var status = document.getElementById('shatterStatus');
    if (!card || !stage || !canvas) return;

    if (particleAnim) {
      cancelAnimationFrame(particleAnim);
      particleAnim = null;
    }

    status.textContent = '采样像素中…';
    captureCardCanvas().then(function (src) {
      if (!src) { status.textContent = '采样失败，请重试'; return; }
      var rect = card.getBoundingClientRect();
      var stageRect = stage.getBoundingClientRect();

      // 移动端：更小的工作画布 + 更少粒子 + 单像素点 + 去掉 twinkle。
      // 桌面：保留原有画质。判定用 pointer + 视口宽度双条件，避免误伤 iPad 大屏。
      var isMobile = (window.matchMedia &&
        (window.matchMedia('(pointer: coarse)').matches ||
         window.matchMedia('(max-width: 720px)').matches)) || false;

      // 关键：把工作画布尺寸卡在一个安全上限。移动端每帧 putImageData 的
      // ImageData 太大 → 手机浏览器 OOM 崩溃。桌面 480px、移动 300px。
      var sizeCap = isMobile ? 300 : 480;
      var maxSide = Math.min(sizeCap, Math.max(rect.width, rect.height, 200));
      var srcW = src.width || 1;
      var srcH = src.height || 1;
      var ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
      var w = Math.max(1, Math.round(srcW * ratio));
      var h = Math.max(1, Math.round(srcH * ratio));

      canvas.width = w;
      canvas.height = h;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.style.left = (rect.left - stageRect.left) + 'px';
      canvas.style.top = (rect.top - stageRect.top) + 'px';
      canvas.style.display = 'block';

      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, w, h);
      // drawImage 会自动完成从 src 到 w×h 的缩放，采样密度可控
      ctx.drawImage(src, 0, 0, w, h);
      var data = ctx.getImageData(0, 0, w, h).data;

      // 粒子步长按图宽 + 总量上限保护：移动端粒子上限收紧到 1500，桌面维持 6000。
      var particleBudget = isMobile ? 1500 : 6000;
      var step = Math.max(isMobile ? 6 : 4, Math.round(w / (isMobile ? 60 : 90)));
      var estimated = Math.ceil(w / step) * Math.ceil(h / step);
      while (estimated > particleBudget && step < 48) {
        step++;
        estimated = Math.ceil(w / step) * Math.ceil(h / step);
      }
      var particles = sampleParticles(data, w, h, step);
      // 爆点：从卡片中心略偏上，制造冲击波 + 旋涡
      var cx = w / 2;
      var cy = h * 0.42;
      var power = Math.max(4, w / 70);
      igniteParticles(particles, cx, cy, power, Math.random, {
        swirl: power * 0.18,
        turbulence: isMobile ? 1.2 : 2.2,
        lift: isMobile ? 1.5 : 2.5,
        radius: Math.max(w, h) * 0.32
      });

      card.classList.add('shattered');
      status.textContent = '共 ' + particles.count + ' 个像素飞散';

      // 关键性能优化：每帧用 putImageData 一次性写入整张图，
      // 避免 fillRect × N 次 + rgba 字符串解析 × N 次（之前崩溃的元凶）
      var imageData = ctx.createImageData(w, h);
      var buf = imageData.data;
      var frame = 0;
      // 移动端画单像素点，桌面画 2×2 小方块（更亮）
      var bigDot = !isMobile;

      function loop() {
        frame++;
        var alive = stepParticles(particles, 1, { gravity: 0.16, damping: 0.99, decay: 0.009 });
        // 清空像素 buffer（一次性 fill 0）
        buf.fill(0);

        var n = particles.count;
        for (var i = 0; i < n; i++) {
          var life = particles.life[i];
          if (life <= 0) continue;
          var px = particles.x[i] | 0; // 取整
          var py = particles.y[i] | 0;
          if (px < 0 || px >= w || py < 0 || py >= h) continue;

          // 移动端省掉 twinkle 抖动（每粒子省一次乘法 + 位运算）
          var aRaw = bigDot
            ? particles.a[i] * Math.min(1, life) * (0.85 + 0.15 * (((i + frame) & 7) * 0.143))
            : particles.a[i] * Math.min(1, life);
          if (aRaw < 8) continue;
          var aOut = aRaw | 0;
          var rOut = particles.r[i];
          var gOut = particles.g[i];
          var bOut = particles.b[i];

          var idx = (py * w + px) * 4;
          buf[idx] = rOut; buf[idx + 1] = gOut; buf[idx + 2] = bOut; buf[idx + 3] = aOut;
          if (bigDot) {
            // 写 2×2 小方块（让粒子在桌面上更醒目）
            if (px + 1 < w) {
              buf[idx + 4] = rOut; buf[idx + 5] = gOut; buf[idx + 6] = bOut; buf[idx + 7] = aOut;
            }
            if (py + 1 < h) {
              var idx2 = ((py + 1) * w + px) * 4;
              buf[idx2] = rOut; buf[idx2 + 1] = gOut; buf[idx2 + 2] = bOut; buf[idx2 + 3] = aOut;
              if (px + 1 < w) {
                buf[idx2 + 4] = rOut; buf[idx2 + 5] = gOut; buf[idx2 + 6] = bOut; buf[idx2 + 7] = aOut;
              }
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);

        if (alive > 0) {
          particleAnim = requestAnimationFrame(loop);
        } else {
          status.textContent = '全部熄灭。点"重置"恢复卡片。';
          particleAnim = null;
        }
      }
      loop();
    }).catch(function (err) {
      status.textContent = '采样失败：' + (err && err.message ? err.message : '未知错误');
    });
  }

  function resetShatter() {
    var card = document.getElementById('shatterCard');
    var canvas = document.getElementById('shatterCanvas');
    var status = document.getElementById('shatterStatus');
    if (particleAnim) {
      cancelAnimationFrame(particleAnim);
      particleAnim = null;
    }
    if (canvas) {
      canvas.style.display = 'none';
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (card) {
      card.classList.remove('shattered');
    }
    if (status) status.textContent = '点上方按钮，把整张卡炸成像素流。';
  }

})();
