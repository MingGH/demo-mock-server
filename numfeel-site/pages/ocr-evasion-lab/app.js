/**
 * OCR 规避实验室 —— 页面交互
 *
 * 依赖同目录 engine.js 暴露的全局函数（applyPipeline / mulberry32 / judgeOcr / classify / summarize），
 * 以及 CDN 引入的 Tesseract（全局变量）。
 */
(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // 常量
  // ══════════════════════════════════════════════════════════
  const CANVAS_W = 1000;
  const CANVAS_H = 260;
  const OCR_LANG = 'chi_sim';
  const OCR_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0_fast';
  const OCR_OEM = 1;
  const OCR_DEBOUNCE = 450;
  const FONT_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Heiti SC", sans-serif';

  const DEFAULT_PARAMS = {
    fontSize: 66,
    wave: 0,
    slice: 0,
    blur: 0,
    breakCount: 0,
    noise: 0,
    contrast: 0,
    lines: 0,
  };

  const SLIDER_DEFS = [
    { key: 'fontSize', name: '字号', min: 28, max: 110, step: 2, unit: 'px' },
    { key: 'wave', name: '波浪扭曲', min: 0, max: 26, step: 1 },
    { key: 'slice', name: '切片错位', min: 0, max: 34, step: 1 },
    { key: 'blur', name: '模糊', min: 0, max: 6, step: 1 },
    { key: 'breakCount', name: '笔画切断', min: 0, max: 36, step: 1 },
    { key: 'noise', name: '噪点', min: 0, max: 96, step: 2 },
    { key: 'contrast', name: '对比度压缩', min: 0, max: 90, step: 2, unit: '%' },
    { key: 'lines', name: '干扰线', min: 0, max: 14, step: 1 },
  ];

  const PRESETS = [
    { name: '原图', icon: 'ti-photo', params: {} },
    { name: '经典验证码', icon: 'ti-shield-lock', params: { wave: 10, breakCount: 3, noise: 34, lines: 3 } },
    { name: '糊到认不出', icon: 'ti-blur', params: { blur: 4, contrast: 62 } },
    { name: '切碎重排', icon: 'ti-layout-rows', params: { slice: 16, breakCount: 7 } },
    { name: '轻微抖动', icon: 'ti-wave-sine', params: { wave: 4, noise: 20, contrast: 22 } },
    { name: '小字加噪', icon: 'ti-text-size', params: { fontSize: 36, noise: 26, contrast: 34 } },
  ];

  const SAMPLE_TEXTS = [
    '会议纪要：项目延期两周',
    '报价单总计 86400 元',
    '内部资料 禁止外传',
    '今天中午吃什么好呢',
    '验证码 8F3K9QX2',
    '下周一上午十点见面',
    '这个方案预算加到 45 万',
  ];

  const KIND_META = {
    separation: {
      icon: 'ti-target-arrow',
      title: '人机分离，命中',
      sub: '你读得出，机器读不出。这就是你要找的那一格。',
    },
    'both-ok': {
      icon: 'ti-check',
      title: '都能读出来，参数白调了',
      sub: '机器照样读出来了，这些参数等于没加。',
    },
    'both-fail': {
      icon: 'ti-photo-off',
      title: '两边都读不出，这张图废了',
      sub: '机器读不出，你也读不出。这张图对谁都没用了。',
    },
    'machine-only': {
      icon: 'ti-alert-triangle',
      title: '只有机器读得出来',
      sub: '比不处理还糟。图已经看不清了，机器却照样认出来。',
    },
  };

  /** 四象限配色，散点图和文字标签共用 */
  const KIND_COLOR = {
    separation: '#ffd700',
    'both-ok': '#81c784',
    'machine-only': '#ff6b6b',
    'both-fail': '#8d99ae',
  };

  const KIND_LABEL = {
    separation: '人机分离',
    'both-ok': '都能读',
    'machine-only': '只有机器能读',
    'both-fail': '都读不出',
  };

  // ══════════════════════════════════════════════════════════
  // 状态
  // ══════════════════════════════════════════════════════════
  const state = {
    text: SAMPLE_TEXTS[0],
    params: Object.assign({}, DEFAULT_PARAMS),
    seed: 1,
    gen: 0, // 每次重绘自增，用来作废过期的 OCR 结果
    ocrStatus: 'idle', // idle | loading | ready | error
    badgeKind: null, // 上一次的徽章状态，用来决定要不要弹一下
    ocrText: '',
    ocrConfidence: 0,
    ocrGen: -1, // 当前 ocrText 对应的是第几代图
    ocrRunning: false,
    activePreset: 0,
    records: [],
    quadCounts: {}, // 四象限上次显示的数字，作为滚动动画的起点
    found: [],
    judged: false, // 本轮是否已提交判定
    shown: false, // 判定结果是否已渲染
    queuedHuman: null, // 排队中的判定：true / false / null（偷看）
    lastImageData: null,
  };

  // ══════════════════════════════════════════════════════════
  // DOM
  // ══════════════════════════════════════════════════════════
  const el = {
    sourceText: document.getElementById('sourceText'),
    rerollText: document.getElementById('rerollText'),
    presetRow: document.getElementById('presetRow'),
    sliderBox: document.getElementById('sliderBox'),
    btnResetSliders: document.getElementById('btnResetSliders'),
    canvas: document.getElementById('previewCanvas'),
    engineBadge: document.getElementById('engineBadge'),
    progressLine: document.getElementById('progressLine'),
    progressBar: document.getElementById('progressBar'),
    verdictAsk: document.getElementById('verdictAsk'),
    verdictResult: document.getElementById('verdictResult'),
    btnHumanYes: document.getElementById('btnHumanYes'),
    btnHumanNo: document.getElementById('btnHumanNo'),
    btnPeek: document.getElementById('btnPeek'),
    quad: document.getElementById('quad'),
    separationList: document.getElementById('separationList'),
    btnCopy: document.getElementById('btnCopy'),
    heroCta: document.getElementById('heroCta'),
  };

  const ctx = el.canvas.getContext('2d', { willReadFrequently: true });
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = CANVAS_W;
  baseCanvas.height = CANVAS_H;
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });

  let ocrWorker = null;
  let ocrTimer = null;

  // ══════════════════════════════════════════════════════════
  // 渲染
  // ══════════════════════════════════════════════════════════

  /**
   * 把文字画到离屏画布上（白底黑字 + 可选干扰线）
   * @param {string} text 文本
   * @param {Object} p 参数
   * @returns {{data: Uint8ClampedArray, width: number, height: number}}
   */
  function renderBase(text, p) {
    baseCtx.fillStyle = '#ffffff';
    baseCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 字号超出画布宽度时自动缩小
    let size = p.fontSize;
    const maxWidth = CANVAS_W - 90;
    const fontOf = (s) => '700 ' + s + 'px ' + FONT_FAMILY;
    baseCtx.font = fontOf(size);
    while (baseCtx.measureText(text).width > maxWidth && size > 20) {
      size -= 3;
      baseCtx.font = fontOf(size);
    }

    baseCtx.fillStyle = '#111111';
    baseCtx.textAlign = 'center';
    baseCtx.textBaseline = 'middle';
    baseCtx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);

    // 干扰线
    if (p.lines > 0) {
      const rng = mulberry32(state.seed * 31 + 7);
      baseCtx.lineCap = 'round';
      for (let i = 0; i < p.lines; i++) {
        const g = Math.floor(70 + rng() * 110);
        baseCtx.strokeStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
        baseCtx.lineWidth = rng() < 0.4 ? 2 : 1;
        baseCtx.beginPath();
        const y0 = rng() * CANVAS_H;
        baseCtx.moveTo(rng() * CANVAS_W * 0.5, y0);
        baseCtx.quadraticCurveTo(rng() * CANVAS_W, rng() * CANVAS_H, CANVAS_W * 0.5 + rng() * CANVAS_W * 0.5, y0 + (rng() - 0.5) * 80);
        baseCtx.stroke();
      }
    }

    const data = baseCtx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    return { data: data.data, width: CANVAS_W, height: CANVAS_H };
  }

  /** 重绘预览图，并作废上一轮的 OCR 结果 */
  function render() {
    const base = renderBase(state.text, state.params);
    const processed = applyPipeline(base, state.params, state.seed);
    const imageData = new ImageData(processed.data, processed.width, processed.height);
    el.canvas.width = CANVAS_W;
    el.canvas.height = CANVAS_H;
    ctx.putImageData(imageData, 0, 0);
    state.lastImageData = imageData;
  }

  /** 参数变化后：重绘 + 重置本轮判定 + 重新排一次 OCR */
  function applyChange() {
    state.gen++;
    state.judged = false;
    state.shown = false;
    state.queuedHuman = null;
    state.ocrGen = -1;
    el.verdictAsk.hidden = false;
    el.verdictResult.hidden = true;
    el.verdictResult.innerHTML = '';
    setJudgeEnabled(true);
    render();
    scheduleOcr(OCR_DEBOUNCE);
  }

  // ══════════════════════════════════════════════════════════
  // OCR
  // ══════════════════════════════════════════════════════════

  /**
   * 更新引擎状态徽章
   * @param {'idle'|'loading'|'ready'|'busy'|'error'} kind 状态
   * @param {string} text 文案
   */
  function setBadge(kind, text) {
    const changed = state.badgeKind !== kind;
    state.badgeKind = kind;
    el.engineBadge.className = 'engine-badge ' + kind;
    const iconMap = {
      idle: 'ti-clock',
      loading: 'ti-loader',
      ready: 'ti-circle-check',
      busy: 'ti-scan',
      error: 'ti-alert-triangle',
    };
    el.engineBadge.innerHTML = '<i class="ti ' + (iconMap[kind] || 'ti-clock') + '"></i> ' + text;
    if (changed) pulse(el.engineBadge);
  }

  /** 初始化 Tesseract worker（幂等） */
  function initOcr() {
    if (state.ocrStatus === 'loading' || state.ocrStatus === 'ready') return;
    if (typeof Tesseract === 'undefined') {
      state.ocrStatus = 'error';
      setBadge('error', 'OCR 库加载失败');
      return;
    }
    state.ocrStatus = 'loading';
    setBadge('loading', '正在加载 OCR 引擎');
    el.progressLine.hidden = false;

    Tesseract.createWorker(OCR_LANG, OCR_OEM, {
      langPath: OCR_LANG_PATH,
      logger: function (m) {
        if (m.status === 'recognizing text') return;
        const pct = Math.round((m.progress || 0) * 100);
        el.progressBar.style.width = pct + '%';
        if (m.status === 'loading language traineddata') {
          setBadge('loading', '下载中文语言包 ' + pct + '%');
        } else if (m.status === 'initializing api') {
          setBadge('loading', '正在初始化引擎');
        }
      },
    })
      .then(function (worker) {
        ocrWorker = worker;
        return worker.setParameters({ tessedit_pageseg_mode: '7' }).catch(function () {
          return null; // 单行模式设置失败不影响主流程
        });
      })
      .then(function () {
        state.ocrStatus = 'ready';
        el.progressLine.hidden = true;
        setBadge('ready', 'OCR 引擎就绪');
        startOcrJob(state.gen);
        flushVerdict();
      })
      .catch(function () {
        state.ocrStatus = 'error';
        el.progressLine.hidden = true;
        setBadge('error', 'OCR 引擎加载失败');
        toast('OCR 引擎没加载起来，刷新页面再试试');
      });
  }

  /**
   * 延迟排队一次识别
   * @param {number} delay 延迟毫秒
   */
  function scheduleOcr(delay) {
    clearTimeout(ocrTimer);
    const gen = state.gen;
    ocrTimer = setTimeout(function () {
      startOcrJob(gen);
    }, delay);
  }

  /**
   * 把当前处理结果拷进一张独立画布
   * recognize 只认 canvas / Blob / dataURL，不认 ImageData；
   * 用独立快照还能避免识别途中被重绘打断。
   * @returns {HTMLCanvasElement} 快照画布
   */
  function snapshotCanvas() {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    c.getContext('2d').putImageData(state.lastImageData, 0, 0);
    return c;
  }

  /**
   * 对当前这张图跑一次识别
   * @param {number} gen 发起时的代号，回来时若变了就作废
   */
  function startOcrJob(gen) {
    if (state.ocrStatus !== 'ready' || !ocrWorker) return;
    if (gen !== state.gen || !state.lastImageData) return;
    if (ocrRunningGuard()) return;

    state.ocrRunning = true;
    setBadge('busy', '正在识别');
    el.progressLine.hidden = false;
    el.progressBar.style.width = '100%';

    ocrWorker
      .recognize(snapshotCanvas())
      .then(function (res) {
        state.ocrRunning = false;
        el.progressLine.hidden = true;
        if (gen !== state.gen) {
          startOcrJob(state.gen); // 图已经换了，重跑
          return;
        }
        state.ocrText = (res.data && res.data.text ? res.data.text : '').trim();
        state.ocrConfidence = (res.data && res.data.confidence) || 0;
        state.ocrGen = gen;
        setBadge('ready', 'OCR 识别完成');
        flushVerdict();
      })
      .catch(function () {
        state.ocrRunning = false;
        state.ocrStatus = 'error';
        el.progressLine.hidden = true;
        setBadge('error', '识别出错');
        failVerdict();
      });
  }

  /** 防重入：正在识别时直接跳过，跑完那次会自己发现代号变了并补跑 */
  function ocrRunningGuard() {
    return state.ocrRunning;
  }

  // ══════════════════════════════════════════════════════════
  // 判定
  // ══════════════════════════════════════════════════════════

  /** 启用/禁用判定按钮 */
  function setJudgeEnabled(on) {
    el.btnHumanYes.disabled = !on;
    el.btnHumanNo.disabled = !on;
    el.btnPeek.disabled = !on;
  }

  /**
   * 提交本轮判定
   * @param {boolean|null} humanRead true 读得出 / false 读不出 / null 偷看
   */
  function requestVerdict(humanRead) {
    if (state.judged) return;
    if (state.ocrStatus === 'error') {
      toast('OCR 引擎没加载起来，暂时给不出机器答案');
      return;
    }
    state.judged = true;
    state.queuedHuman = humanRead;
    setJudgeEnabled(false);
    showWaiting(humanRead);
    flushVerdict();
  }

  /** 等待引擎/识别就绪的占位 */
  function showWaiting(humanRead) {
    const waiting = state.ocrStatus !== 'ready' || state.ocrGen !== state.gen;
    el.verdictAsk.hidden = true;
    el.verdictResult.hidden = false;
    el.verdictResult.innerHTML =
      '<div class="result-verdict both-fail">' +
      '<i class="ti ti-loader"></i>' +
      '<div>正在等机器给出答案…<span class="sub">' +
      (waiting ? '第一次要下载中文语言包，稍等几秒。' : '这张图还在识别中。') +
      '</span></div></div>' +
      '<div class="result-meta"><span>你这一轮的选择：<b>' +
      (humanRead === true ? '读得出' : humanRead === false ? '读不出' : '没判定') +
      '</b></span></div>';
  }

  /** 条件满足时把判定结果真正渲染出来 */
  function flushVerdict() {
    if (!state.judged || state.shown) return;
    if (state.ocrStatus !== 'ready') return;
    if (state.ocrGen !== state.gen) return;
    state.shown = true;
    renderVerdict(state.queuedHuman);
  }

  /** 识别失败时给个明确交代，别让判定区一直转圈 */
  function failVerdict() {
    if (!state.judged || state.shown) return;
    state.shown = true;
    el.verdictAsk.hidden = true;
    el.verdictResult.hidden = false;
    el.verdictResult.innerHTML =
      '<div class="result-verdict machine-only">' +
      '<i class="ti ti-alert-triangle"></i>' +
      '<div>OCR 引擎报错了，这一轮没有机器答案<span class="sub">刷新页面再试一次。这一轮不计入战绩。</span></div>' +
      '</div>';
  }

  /**
   * 渲染判定结果
   * @param {boolean|null} humanRead 用户自评
   */
  function renderVerdict(humanRead) {
    const judged = judgeOcr(state.text, state.ocrText);
    const kind = humanRead === null ? null : classify(humanRead, judged.pass);
    const meta = KIND_META[kind] || {
      icon: 'ti-eye',
      title: '偷看模式：本轮不计入战绩',
      sub: '你没做判定，所以只展示机器答案给你参考。',
    };

    const humanCell =
      humanRead === null
        ? '<div class="what empty">本轮没判定</div>'
        : '<div class="what">' + escapeHtml(state.text) + '</div>';
    const machineCell = state.ocrText
      ? '<div class="what">' + escapeHtml(state.ocrText.replace(/\n+/g, ' ')) + '</div>'
      : '<div class="what empty">什么都没读出来</div>';

    el.verdictAsk.hidden = true;
    el.verdictResult.hidden = false;
    el.verdictResult.innerHTML =
      '<div class="result-compare">' +
      '<div class="result-cell"><div class="who">你看到的是</div>' + humanCell + '</div>' +
      '<div class="result-cell"><div class="who">OCR 读出来的是</div>' + machineCell + '</div>' +
      '</div>' +
      '<div class="result-verdict ' +
      (kind || 'peek') +
      '"><i class="ti ' +
      meta.icon +
      '"></i><div><strong>' +
      meta.title +
      '</strong><span class="sub">' +
      meta.sub +
      '</span></div></div>' +
      '<div class="result-meta">' +
      '<span>文本相似度 <b>' +
      Math.round(judged.similarity * 100) +
      '%</b></span>' +
      '<span>引擎置信度 <b>' +
      Math.round(state.ocrConfidence) +
      '</b></span>' +
      '<span>判定阈值 <b>80%</b></span>' +
      '</div>' +
      '<div class="result-next">' +
      '<button class="btn btn-secondary btn-sm" id="btnNextRound"><i class="ti ti-refresh"></i> 换一组参数再来</button>' +
      '</div>';

    document.getElementById('btnNextRound').addEventListener('click', function () {
      el.canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    revealIn(el.verdictResult.querySelectorAll('.result-cell, .result-verdict, .result-meta, .result-next'));

    if (kind !== null) {
      state.records.push({
        humanRead: humanRead,
        ocrPass: judged.pass,
        kind: kind,
        level: breakdownLevel(state.params),
        sim: Math.round(judged.similarity * 100),
      });
      if (kind === 'separation') {
        const dup = state.found.some(function (f) {
          return f.text === state.text && f.params === paramsSummary(state.params);
        });
        if (!dup) {
          state.found.push({
            text: state.text,
            params: paramsSummary(state.params),
            raw: Object.assign({}, state.params),
            similarity: judged.similarity,
          });
        }
      }
      renderBoard();
      track('verdict', {
        kind: kind,
        sim: Math.round(judged.similarity * 100),
        human: humanRead,
        machine: judged.pass,
        rounds: state.records.length,
      });
    }
  }

  /**
   * 把参数压成一行可读摘要
   * @param {Object} p 参数
   * @returns {string} 摘要
   */
  function paramsSummary(p) {
    const parts = [];
    SLIDER_DEFS.forEach(function (def) {
      const base = DEFAULT_PARAMS[def.key];
      if (p[def.key] !== base) {
        parts.push(def.name + ' ' + p[def.key] + (def.unit || ''));
      }
    });
    return parts.length ? parts.join(' / ') : '全部默认';
  }

  // ══════════════════════════════════════════════════════════
  // 战绩面板
  // ══════════════════════════════════════════════════════════

  /** 渲染四象限与配方清单 */
  function renderBoard() {
    const s = summarize(state.records);
    const cells = [
      {
        key: 'separation',
        label: '人读得出 / 机器读不出',
        count: s.separation,
        desc: '你要找的就是这一格。2005 年的验证码做的也是这件事。',
      },
      {
        key: 'both-ok',
        label: '人读得出 / 机器读得出',
        count: s.bothOk,
        desc: '参数太轻，等于什么都没加。',
      },
      {
        key: 'machine-only',
        label: '人读不出 / 机器读得出',
        count: s.machineOnly,
        desc: '最亏的一格：图看不清了，机器照样认出来。',
      },
      {
        key: 'both-fail',
        label: '人读不出 / 机器读不出',
        count: s.bothFail,
        desc: '两边都读不出，这张图白做了。',
      },
    ];

    el.quad.innerHTML = cells
      .map(function (c) {
        const prev = state.quadCounts[c.key] || 0;
        const shown = hasGsap() ? prev : c.count;
        return (
          '<div class="quad-cell ' +
          c.key +
          (c.count === 0 ? ' zero' : '') +
          '"><div class="quad-label">' +
          c.label +
          '</div><div class="quad-count">' +
          shown +
          '</div><div class="quad-desc">' +
          c.desc +
          '</div></div>'
        );
      })
      .join('');

    if (!state.found.length) {
      el.separationList.innerHTML =
        '<div class="separation-empty">还没有找到。调参调到「你读得出、机器读不出」，然后如实按下判定，它就会出现在这里。</div>';
    } else {
      el.separationList.innerHTML = state.found
        .map(function (f, i) {
          return (
            '<div class="separation-item">' +
            '<span class="si-text">' + escapeHtml(f.text) + '</span>' +
            '<span class="si-params">' + escapeHtml(f.params) + '</span>' +
            '<span class="si-sim">相似度 ' + Math.round(f.similarity * 100) + '%</span>' +
            '<button class="si-load" data-idx="' + i + '">载入</button>' +
            '</div>'
          );
        })
        .join('');
      Array.prototype.forEach.call(el.separationList.querySelectorAll('.si-load'), function (btn) {
        btn.addEventListener('click', function () {
          loadFound(parseInt(btn.getAttribute('data-idx'), 10));
        });
      });
    }

    Array.prototype.forEach.call(el.quad.querySelectorAll('.quad-count'), function (node, i) {
      countTo(node, cells[i].count);
    });
    cells.forEach(function (c) {
      state.quadCounts[c.key] = c.count;
    });
    revealIn(el.separationList.querySelectorAll('.separation-item'));
    updateChart();
  }

  /**
   * 载入一条历史配方
   * @param {number} idx 索引
   */
  function loadFound(idx) {
    const f = state.found[idx];
    if (!f) return;
    el.sourceText.value = f.text;
    state.text = f.text;
    state.params = Object.assign({}, DEFAULT_PARAMS, f.raw);
    syncSliders();
    clearActivePreset();
    applyChange();
    el.canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('配方已载入');
  }

  // ══════════════════════════════════════════════════════════
  // 控件
  // ══════════════════════════════════════════════════════════

  /** 生成滑块 DOM */
  function buildSliders() {
    el.sliderBox.innerHTML = SLIDER_DEFS.map(function (def) {
      return (
        '<div class="slider-item">' +
        '<div class="slider-top"><span class="slider-name">' +
        def.name +
        '</span><span class="slider-val" id="val-' +
        def.key +
        '"></span></div>' +
        '<input type="range" id="sl-' +
        def.key +
        '" min="' +
        def.min +
        '" max="' +
        def.max +
        '" step="' +
        def.step +
        '" value="' +
        state.params[def.key] +
        '" aria-label="' +
        def.name +
        '">' +
        '</div>'
      );
    }).join('');

    SLIDER_DEFS.forEach(function (def) {
      const input = document.getElementById('sl-' + def.key);
      input.addEventListener('input', function () {
        state.params[def.key] = Number(input.value);
        updateSliderLabel(def);
        clearActivePreset();
        applyChange();
      });
    });
    syncSliders();
  }

  /** 把 state.params 同步到滑块位置 */
  function syncSliders() {
    SLIDER_DEFS.forEach(function (def) {
      const input = document.getElementById('sl-' + def.key);
      if (input) input.value = state.params[def.key];
      updateSliderLabel(def);
    });
  }

  /**
   * 刷新单个滑块的数值标签
   * @param {Object} def 滑块定义
   */
  function updateSliderLabel(def) {
    const label = document.getElementById('val-' + def.key);
    if (label) label.textContent = state.params[def.key] + (def.unit || '');
  }

  /** 生成预设按钮 */
  function buildPresets() {
    el.presetRow.innerHTML = PRESETS.map(function (p, i) {
      return (
        '<button class="preset-chip' +
        (i === state.activePreset ? ' active' : '') +
        '" data-idx="' +
        i +
        '"><i class="ti ' +
        p.icon +
        '"></i>' +
        p.name +
        '</button>'
      );
    }).join('');

    Array.prototype.forEach.call(el.presetRow.querySelectorAll('.preset-chip'), function (btn) {
      btn.addEventListener('click', function () {
        applyPreset(parseInt(btn.getAttribute('data-idx'), 10));
      });
    });
  }

  /**
   * 套用预设
   * @param {number} idx 预设索引
   */
  function applyPreset(idx) {
    const preset = PRESETS[idx];
    if (!preset) return;
    state.params = Object.assign({}, DEFAULT_PARAMS, preset.params);
    state.activePreset = idx;
    Array.prototype.forEach.call(el.presetRow.querySelectorAll('.preset-chip'), function (btn) {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-idx'), 10) === idx);
    });
    syncSliders();
    applyChange();
  }

  /** 手动调参后取消预设高亮 */
  function clearActivePreset() {
    state.activePreset = -1;
    Array.prototype.forEach.call(el.presetRow.querySelectorAll('.preset-chip'), function (btn) {
      btn.classList.remove('active');
    });
  }

  // ══════════════════════════════════════════════════════════
  // 动画（GSAP 没加载上就退化成直接显示，不影响功能）
  // ══════════════════════════════════════════════════════════

  /** GSAP 是否可用 */
  function hasGsap() {
    return typeof gsap !== 'undefined';
  }

  /**
   * 元素淡入上移
   * @param {NodeList|Array} nodes 目标元素
   * @param {Object} [opts] 选项
   * @param {number} [opts.y] 起始纵向偏移
   * @param {number} [opts.duration] 时长秒
   * @param {number} [opts.stagger] 逐个延迟
   */
  function revealIn(nodes, opts) {
    if (!hasGsap() || !nodes || !nodes.length) return;
    const list = Array.prototype.slice.call(nodes);
    if (!list.length) return;
    const o = opts || {};
    gsap.fromTo(
      list,
      { opacity: 0, y: o.y === undefined ? 12 : o.y },
      {
        opacity: 1,
        y: 0,
        duration: o.duration === undefined ? 0.42 : o.duration,
        stagger: o.stagger === undefined ? 0.06 : o.stagger,
        ease: 'power2.out',
        overwrite: 'auto',
        // 动画结束后清掉 transform，否则残留的 translate 会让子元素的 position:fixed 失效
        clearProps: 'transform',
      }
    );
  }

  /**
   * 数字滚动到目标值
   * @param {HTMLElement} node 显示数字的节点
   * @param {number} value 目标值
   */
  function countTo(node, value) {
    if (!node) return;
    if (!hasGsap() || value === 0) {
      node.textContent = String(value);
      return;
    }
    const obj = { v: Number(node.textContent) || 0 };
    gsap.to(obj, {
      v: value,
      duration: 0.5,
      ease: 'power2.out',
      overwrite: 'auto',
      onUpdate: function () {
        node.textContent = String(Math.round(obj.v));
      },
    });
  }

  /**
   * 状态徽章轻微弹一下
   * @param {HTMLElement} node 徽章节点
   */
  function pulse(node) {
    if (!hasGsap() || !node) return;
    gsap.fromTo(
      node,
      { scale: 0.93 },
      { scale: 1, duration: 0.32, ease: 'back.out(2.2)', overwrite: 'auto' }
    );
  }

  /** 区块滚进视口时淡入 */
  function bindSectionReveal() {
    if (!hasGsap() || typeof IntersectionObserver === 'undefined') return;
    const targets = document.querySelectorAll('.section-head, .twist-item, .conclusion, .board-grid, .lab-grid .panel');
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          gsap.fromTo(
            entry.target,
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', overwrite: 'auto', clearProps: 'transform' }
          );
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    Array.prototype.forEach.call(targets, function (t) {
      io.observe(t);
    });
  }

  // ══════════════════════════════════════════════════════════
  // 散点图（Chart.js 没加载上就整块不显示图表，文字战绩照常工作）
  // ══════════════════════════════════════════════════════════

  let chart = null;

  /** 初始化散点图 */
  function initChart() {
    if (typeof Chart === 'undefined') return;
    const box = document.getElementById('roundChart');
    if (!box) return;

    const tick = { color: '#888', font: { size: 10 } };
    chart = new Chart(box.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '每轮结果',
            data: [],
            pointRadius: 6,
            pointHoverRadius: 9,
            backgroundColor: [],
            borderColor: 'rgba(0,0,0,0.4)',
            borderWidth: 1,
          },
          {
            label: '判定阈值',
            data: [
              { x: 0, y: 80 },
              { x: 100, y: 80 },
            ],
            pointRadius: 0,
            borderColor: 'rgba(144,202,249,0.8)',
            borderWidth: 1.5,
            borderDash: [6, 4],
            showLine: true,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 480, easing: 'easeOutQuart' },
        scales: {
          x: {
            min: 0,
            max: 100,
            title: { display: true, text: '参数强度', color: '#888', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.07)' },
            ticks: tick,
          },
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: '机器读出的相似度', color: '#888', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.07)' },
            ticks: tick,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                if (ctx.datasetIndex !== 0) return '判定阈值 80%';
                const raw = ctx.raw;
                return raw.tip + '：强度 ' + raw.x + '，相似度 ' + raw.y + '%';
              },
            },
          },
        },
      },
    });
  }

  /** 把战绩同步到散点图 */
  function updateChart() {
    if (!chart) return;
    const rounds = state.records.filter(function (r) {
      return r.kind;
    });

    // 同一组参数重复判定会落在同一个坐标上，后面那个点会被完全盖住，
    // 所以重复出现的点沿着一个小螺旋错开，第一个点保持原位不动。
    const seen = {};
    const points = rounds.map(function (r, i) {
      const key = r.level + ':' + r.sim;
      const times = (seen[key] = (seen[key] || 0) + 1);
      let x = r.level;
      let y = r.sim;
      if (times > 1) {
        const angle = (times - 1) * 2.4;
        const radius = 2.5 + (times - 1) * 1.8;
        x += Math.cos(angle) * radius;
        y += Math.sin(angle) * radius;
      }
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        tip: '第 ' + (i + 1) + ' 轮 · ' + (KIND_LABEL[r.kind] || ''),
      };
    });

    chart.data.datasets[0].data = points;
    chart.data.datasets[0].backgroundColor = rounds.map(function (r) {
      return KIND_COLOR[r.kind] || '#8d99ae';
    });
    chart.update();
  }

  /** 点预览图放大 / 收起 */
  function bindZoom() {
    const wrap = document.getElementById('canvasWrap');
    if (!wrap) return;
    const close = function () {
      wrap.classList.remove('zoomed');
      document.body.classList.remove('zoom-open');
    };
    wrap.addEventListener('click', function () {
      const on = wrap.classList.toggle('zoomed');
      document.body.classList.toggle('zoom-open', on);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  // ══════════════════════════════════════════════════════════
  // 工具
  // ══════════════════════════════════════════════════════════

  /**
   * 转义 HTML
   * @param {string} s 原文
   * @returns {string} 转义结果
   */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let toastTimer = null;
  /**
   * 底部轻提示
   * @param {string} msg 文案
   */
  function toast(msg) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = msg;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('show');
    }, 2200);
  }

  /**
   * 埋点（NFTrack 未加载时静默跳过）
   * @param {string} event 事件名
   * @param {Object} props 属性
   */
  function track(event, props) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(event, props);
      }
    } catch (e) {
      /* 埋点失败不影响页面 */
    }
  }

  // ══════════════════════════════════════════════════════════
  // 初始化
  // ══════════════════════════════════════════════════════════

  function bindEvents() {
    el.sourceText.addEventListener('input', function () {
      const v = el.sourceText.value.trim();
      state.text = v || '（空）';
      applyChange();
    });

    el.rerollText.addEventListener('click', function () {
      let next = state.text;
      while (next === state.text) {
        next = SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)];
      }
      state.text = next;
      state.seed = Math.floor(Math.random() * 100000) + 1;
      el.sourceText.value = next;
      applyChange();
    });

    el.btnResetSliders.addEventListener('click', function () {
      state.params = Object.assign({}, DEFAULT_PARAMS);
      syncSliders();
      clearActivePreset();
      applyChange();
      toast('参数已归零');
    });

    el.btnHumanYes.addEventListener('click', function () {
      requestVerdict(true);
    });
    el.btnHumanNo.addEventListener('click', function () {
      requestVerdict(false);
    });
    el.btnPeek.addEventListener('click', function () {
      requestVerdict(null);
    });

    el.btnCopy.addEventListener('click', function () {
      const s = summarize(state.records);
      if (!s.total) {
        toast('先做一轮判定再复制');
        return;
      }
      const lines = [
        'OCR 规避实验室 · 我的战绩',
        '总计 ' + s.total + ' 轮',
        '人机分离（人读得出、机器读不出）：' + s.separation + ' 轮',
        '都能读出来：' + s.bothOk + ' 轮',
        '只有机器读得出：' + s.machineOnly + ' 轮',
        '两边都读不出：' + s.bothFail + ' 轮',
      ];
      if (state.found.length) {
        lines.push('');
        lines.push('找到的配方：');
        state.found.forEach(function (f, i) {
          lines.push(i + 1 + '. 「' + f.text + '」 ' + f.params);
        });
      }
      copyText(lines.join('\n'));
    });

    el.heroCta.addEventListener('click', function () {
      document.getElementById('lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    window.addEventListener('pagehide', function () {
      const s = summarize(state.records);
      track('session_end', {
        rounds: s.total,
        found: state.found.length,
        sepRate: Math.round(s.separationRate * 100),
      });
    });
  }

  /**
   * 复制文本到剪贴板（带降级）
   * @param {string} text 待复制文本
   */
  function copyText(text) {
    const fallback = function () {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast('已复制');
      } catch (e) {
        toast('复制失败，手动选一下吧');
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('已复制');
      }, fallback);
    } else {
      fallback();
    }
  }

  function init() {
    bindEvents();
    bindZoom();
    buildSliders();
    buildPresets();
    initChart();
    renderBoard();
    render();
    bindSectionReveal();
    track('session_start', {});
    // 首屏先画出来，OCR 引擎延迟一点后台加载
    setTimeout(initOcr, 900);
  }

  init();
})();
