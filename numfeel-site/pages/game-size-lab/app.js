// ══════════════════════════════════════════════
// 游戏包体实验室 — DOM 绑定层
// 计算全部委托给 engine.js，这里只管取值、渲染、绑事件
// ══════════════════════════════════════════════

(function () {
  'use strict';

  // ── 运行时状态 ──
  var config = null;          // 当前装机配置
  var zoomMult = 1;           // 第一幕当前放大倍率
  var zoomTarget = 1;         // 第一幕目标倍率
  var holding = false;        // 是否正在按住放大
  var rafId = null;
  var lastFrame = 0;
  var zoomDone = false;
  var compareChart = null;
  var treeChart = null;

  var ZOOM_SECONDS = 5.5;     // 持续按住走完全程所需秒数

  // 第一幕条带：总量 175 GiB，代码段用实测的 15.56 MB，
  // 其余按「现代 3A」预设的资产比例切分，保证 总量/代码 = 11,519 精确成立
  var heroSegments = [];

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (typeof buildPackage !== 'function') return;

    config = cloneConfig(getPreset('aaa').config);
    zoomTarget = heroMagnification();
    heroSegments = makeHeroSegments();

    bindHeroCta();
    bindZoom();
    renderPresets();
    bindControls();
    bindActions();
    render();
    renderZoom();
    initCharts();
    initReveal();
  }

  // ── 小工具 ──

  function $(id) { return document.getElementById(id); }

  function cloneConfig(c) {
    var out = {};
    for (var k in c) { if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k]; }
    return out;
  }

  function sameConfig(a, b) {
    for (var k in a) {
      if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
      if (a[k] !== b[k]) return false;
    }
    return true;
  }

  function scrollToId(id) {
    var el = $(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ════════════════════════════════════════════
  // Hero 行动按钮
  // ════════════════════════════════════════════

  function bindHeroCta() {
    var start = $('ctaStart');
    var build = $('ctaBuild');
    if (start) start.addEventListener('click', function () { scrollToId('act-zoom'); });
    if (build) build.addEventListener('click', function () { scrollToId('act-build'); });
  }

  // ════════════════════════════════════════════
  // 第一幕：放大到看见代码
  // ════════════════════════════════════════════

  /**
   * 构造第一幕条带的分段数据。
   * 代码段取实测值，其余四项按「现代 3A」的相对比例撑满 175 GiB 的剩余空间。
   */
  function makeHeroSegments() {
    var total = 175 * GIB;
    var codeBytes = SDK_FACTS.tf2CodeBytes;
    var rest = total - codeBytes;

    var ref = buildPackage(getPreset('aaa').config);
    var refAssets = ref.texture + ref.maps + ref.audio + ref.models;

    var shape = [
      { id: 'texture', label: '贴图纹理', color: '#ff6b6b', share: ref.texture / refAssets },
      { id: 'map', label: '地图数据', color: '#ffb74d', share: ref.maps / refAssets },
      { id: 'audio', label: '语音音频', color: '#81c784', share: ref.audio / refAssets },
      { id: 'model', label: '模型动画', color: '#90caf9', share: ref.models / refAssets }
    ];

    var segs = [];
    for (var i = 0; i < shape.length; i++) {
      segs.push({
        id: shape[i].id,
        label: shape[i].label,
        color: shape[i].color,
        bytes: rest * shape[i].share
      });
    }
    segs.push({ id: 'code', label: '程序代码', color: '#ffd700', bytes: codeBytes });
    return segs;
  }

  function bindZoom() {
    var hold = $('zoomHold');
    var step = $('zoomStep');
    var reset = $('zoomReset');

    if (hold) {
      hold.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        startHold();
      });
      // 键盘可达：空格/回车按住同样生效
      hold.addEventListener('keydown', function (ev) {
        if (ev.key === ' ' || ev.key === 'Enter') {
          ev.preventDefault();
          startHold();
        }
      });
      hold.addEventListener('keyup', stopHold);
      hold.addEventListener('blur', stopHold);
    }

    // 松手可能发生在按钮外，监听在 window 上更稳
    window.addEventListener('pointerup', stopHold);
    window.addEventListener('pointercancel', stopHold);

    if (step) {
      step.addEventListener('click', function () {
        setZoom(zoomMult * 10);
      });
    }
    if (reset) {
      reset.addEventListener('click', function () {
        stopHold();
        zoomDone = false;
        var reveal = $('zoomReveal');
        if (reveal) reveal.hidden = true;
        var btn = $('zoomHold');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="ti ti-zoom-in"></i> 按住放大';
        }
        if (step) step.disabled = false;
        setZoom(1);
      });
    }
  }

  function startHold() {
    if (holding || zoomDone) return;
    holding = true;
    lastFrame = 0;
    rafId = requestAnimationFrame(tickZoom);
  }

  function stopHold() {
    if (!holding) return;
    holding = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tickZoom(now) {
    if (!holding) return;
    if (!lastFrame) lastFrame = now;
    var dt = Math.min((now - lastFrame) / 1000, 0.1); // 卡帧时限幅，避免一帧冲到底
    lastFrame = now;

    // 指数增长：持续按住 ZOOM_SECONDS 秒正好从 1 走到目标
    var growth = Math.exp(dt * Math.log(zoomTarget) / ZOOM_SECONDS);
    setZoom(zoomMult * growth);

    if (zoomMult >= zoomTarget) {
      stopHold();
      return;
    }
    rafId = requestAnimationFrame(tickZoom);
  }

  function setZoom(next) {
    zoomMult = Math.max(1, Math.min(next, zoomTarget));
    renderZoom();
    if (zoomMult >= zoomTarget && !zoomDone) onZoomReached();
  }

  function onZoomReached() {
    zoomDone = true;
    var reveal = $('zoomReveal');
    var btn = $('zoomHold');
    var stepBtn = $('zoomStep');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-check"></i> 已放大到底';
    }
    if (stepBtn) stepBtn.disabled = true;
    if (!reveal) return;
    reveal.hidden = false;
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(reveal, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
    }
  }

  function renderZoom() {
    var strip = $('zoomStrip');
    var valueEl = $('zoomValue');
    var captionEl = $('zoomCaption');
    var progressEl = $('zoomProgress');

    if (valueEl) valueEl.textContent = formatMultiple(zoomMult);
    if (captionEl) captionEl.textContent = zoomCaption(zoomMult);

    if (progressEl) {
      // 用对数刻度衡量进度，否则前 90% 的时间进度条几乎不动
      var pct = Math.log(zoomMult) / Math.log(zoomTarget) * 100;
      progressEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }

    if (!strip) return;
    var segs = zoomSegments(heroSegments, zoomMult);
    var html = '';
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      // 只有够宽的分段才写文字，避免挤成一团
      var label = s.widthPercent > 12
        ? '<span>' + s.label + ' · ' + formatBytes(s.bytes) + '</span>'
        : '';
      html += '<div class="zoom-seg' + (s.id === 'code' ? ' is-code' : '') + '"' +
        ' style="width:' + s.widthPercent.toFixed(4) + '%;background:' + s.color + '"' +
        ' title="' + s.label + ' ' + formatBytes(s.bytes) + '">' + label + '</div>';
    }
    strip.innerHTML = html;
  }

  // ════════════════════════════════════════════
  // 第二幕：预设卡
  // ════════════════════════════════════════════

  function renderPresets() {
    var grid = $('presetGrid');
    if (!grid) return;

    var html = '';
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      var built = buildPackage(p.config);
      html += '<button type="button" class="preset" data-preset="' + p.id + '">' +
        '<span class="preset-tag">' + p.tag + '</span>' +
        '<div class="preset-name">' + p.name + '</div>' +
        '<div class="preset-blurb">' + p.blurb + '</div>' +
        '<div class="preset-real">这台装机台算出 ' + formatBytes(built.total) + ' · ' + p.realWorld + '</div>' +
        '</button>';
    }
    grid.innerHTML = html;

    grid.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.preset') : null;
      if (!btn) return;
      var preset = getPreset(btn.getAttribute('data-preset'));
      if (!preset) return;
      config = cloneConfig(preset.config);
      syncControlsFromConfig();
      render();
    });
  }

  function highlightActivePreset() {
    var nodes = document.querySelectorAll('.preset');
    for (var i = 0; i < nodes.length; i++) {
      var preset = getPreset(nodes[i].getAttribute('data-preset'));
      var on = preset && sameConfig(config, preset.config);
      nodes[i].classList.toggle('is-active', !!on);
    }
  }

  // ════════════════════════════════════════════
  // 第二幕：控件
  // ════════════════════════════════════════════

  // 滑块 → config 字段映射（dup 与 code 需要换算）
  var SLIDERS = [
    { el: 'cRes', key: 'resIndex' },
    { el: 'cMaterials', key: 'materialCount' },
    { el: 'cMaps', key: 'mapCount' },
    { el: 'cPerMap', key: 'perMapIndex' },
    { el: 'cLangs', key: 'voiceLangs' },
    { el: 'cVoice', key: 'voiceIndex' },
    { el: 'cDup', key: 'dupFactor', scale: 0.1 },  // 滑块 10~30 → 1.0~3.0
    { el: 'cCode', key: 'codeMiB' }
  ];

  function bindControls() {
    // 动态填充需要读 engine 数据的分段控件
    fillSegment('cFormat', TEXTURE_FORMATS, 'id', 'name');
    fillSegment('cBitrate', AUDIO_BITRATES, 'id', 'name');

    for (var i = 0; i < SLIDERS.length; i++) {
      bindSlider(SLIDERS[i]);
    }

    bindSegment('cChannels', function (val) { config.pbrChannels = parseInt(val, 10); });
    bindSegment('cFormat', function (val) { config.formatId = val; });
    bindSegment('cMipmap', function (val) { config.mipmap = (val === 'on'); });
    bindSegment('cBitrate', function (val) { config.bitrateId = val; });

    syncControlsFromConfig();
  }

  function fillSegment(id, list, valueKey, labelKey) {
    var box = $(id);
    if (!box) return;
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<button type="button" data-val="' + list[i][valueKey] + '">' + list[i][labelKey] + '</button>';
    }
    box.innerHTML = html;
  }

  function bindSlider(def) {
    var el = $(def.el);
    if (!el) return;
    el.addEventListener('input', function () {
      var raw = parseFloat(el.value);
      config[def.key] = def.scale ? +(raw * def.scale).toFixed(2) : raw;
      render();
    });
  }

  function bindSegment(id, apply) {
    var box = $(id);
    if (!box) return;
    box.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('button[data-val]') : null;
      if (!btn) return;
      apply(btn.getAttribute('data-val'));
      render();
    });
  }

  /** 把 config 回灌到所有控件上（点预设卡后需要） */
  function syncControlsFromConfig() {
    for (var i = 0; i < SLIDERS.length; i++) {
      var def = SLIDERS[i];
      var el = $(def.el);
      if (!el) continue;
      el.value = def.scale ? Math.round(config[def.key] / def.scale) : config[def.key];
    }
    setSegmentActive('cChannels', String(config.pbrChannels));
    setSegmentActive('cFormat', config.formatId);
    setSegmentActive('cMipmap', config.mipmap ? 'on' : 'off');
    setSegmentActive('cBitrate', config.bitrateId);
  }

  function setSegmentActive(id, val) {
    var box = $(id);
    if (!box) return;
    var btns = box.querySelectorAll('button[data-val]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].getAttribute('data-val') === val);
    }
  }

  // ════════════════════════════════════════════
  // 第二幕：渲染
  // ════════════════════════════════════════════

  function render() {
    var pkg = buildPackage(config);
    renderControlLabels();
    renderReadout(pkg);
    renderStack(pkg);
    renderFormula(pkg);
    highlightActivePreset();
    updateCompareChart(pkg);
  }

  /** 每个控件右侧的当前值 */
  function renderControlLabels() {
    var fmt = getTextureFormat(config.formatId);
    var br = getAudioBitrate(config.bitrateId);
    var res = RESOLUTIONS[clampIndex(config.resIndex, RESOLUTIONS)];
    var perMap = PER_MAP_MIB[clampIndex(config.perMapIndex, PER_MAP_MIB)];
    var voiceMin = VOICE_MINUTES[clampIndex(config.voiceIndex, VOICE_MINUTES)];

    setText('vRes', res + ' × ' + res);
    setText('vChannels', config.pbrChannels + ' 张');
    setText('vFormat', fmt.name);
    setText('nFormat', fmt.desc);
    setText('vMipmap', config.mipmap ? '开启（×4/3）' : '关闭');
    setText('vMaterials', formatNumber(config.materialCount) + ' 种');
    setText('vMaps', config.mapCount + ' 张');
    setText('vPerMap', perMap < 1 ? (perMap * 1024) + ' KB' : perMap + ' MB');
    setText('vLangs', config.voiceLangs + ' 种');
    setText('vVoice', voiceMin < 60 ? voiceMin + ' 分钟' : (voiceMin / 60) + ' 小时');
    setText('vBitrate', br.name);
    setText('nBitrate', br.desc);
    setText('vDup', config.dupFactor.toFixed(1) + ' 份');
    setText('vCode', config.codeMiB + ' MB');
  }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function renderReadout(pkg) {
    setText('totalSize', formatBytes(pkg.total));
    setText('codePercent', formatPercent(pkg.codePercent));
    setText('materialSize', formatBytes(pkg.singleMaterialBytes));

    var copies = codeEquivalents(pkg.singleMaterialBytes, false);
    setText('materialVsCode', formatMultiple(copies) + ' 份');

    var closest = findClosestGame(pkg.total);
    var el = $('closestGame');
    if (!el) return;
    var ratio = closest.ratio;
    var rel;
    if (ratio > 1.08) rel = '比它大 ' + formatMultiple(ratio) + ' 倍';
    else if (ratio < 0.92) rel = '是它的 ' + (ratio * 100).toFixed(0) + '%';
    else rel = '几乎一模一样';
    el.innerHTML = '最接近《' + closest.name + '》（' + closest.year + '，' +
      closest.gib + ' GB）——' + rel;
  }

  function renderStack(pkg) {
    var bar = $('stackBar');
    var legend = $('stackLegend');
    if (!bar || !legend) return;

    var barHtml = '';
    var legendHtml = '';
    for (var i = 0; i < pkg.breakdown.length; i++) {
      var b = pkg.breakdown[i];
      barHtml += '<div class="stack-seg' + (b.id === 'code' ? ' is-code' : '') + '"' +
        ' style="width:' + b.percent.toFixed(4) + '%;background:' + b.color + '"' +
        ' title="' + b.label + ' ' + formatBytes(b.bytes) + '"></div>';
      legendHtml += '<span class="legend-item">' +
        '<i class="legend-dot" style="background:' + b.color + '"></i>' +
        b.label + ' <b>' + formatBytes(b.bytes) + '</b> · ' + formatPercent(b.percent) +
        '</span>';
    }
    bar.innerHTML = barHtml;
    legend.innerHTML = legendHtml;
  }

  function renderFormula(pkg) {
    var box = $('formulaBody');
    if (!box) return;

    var fmt = getTextureFormat(config.formatId);
    var res = RESOLUTIONS[clampIndex(config.resIndex, RESOLUTIONS)];
    var perMap = PER_MAP_MIB[clampIndex(config.perMapIndex, PER_MAP_MIB)];
    var voiceMin = VOICE_MINUTES[clampIndex(config.voiceIndex, VOICE_MINUTES)];
    var br = getAudioBitrate(config.bitrateId);
    var modelKiB = MODEL_KIB_BY_RES[clampIndex(config.resIndex, MODEL_KIB_BY_RES)];
    var mip = config.mipmap ? ' × 4/3' : '';
    var dup = config.dupFactor !== 1 ? ' × ' + config.dupFactor.toFixed(1) : '';

    var rows = [
      {
        fx: res + ' × ' + res + ' × ' + fmt.bytesPerPixel + ' 字节 × ' +
          config.pbrChannels + ' 张' + mip + ' × ' + formatNumber(config.materialCount) + ' 种材质' + dup,
        fv: formatBytes(pkg.texture), label: '贴图纹理'
      },
      {
        fx: config.mapCount + ' 张 × ' + perMap + ' MB' + dup,
        fv: formatBytes(pkg.maps), label: '地图数据'
      },
      {
        fx: config.voiceLangs + ' 种语言 × ' + voiceMin + ' 分钟 × ' + br.kbps + ' kbps ÷ 8' + dup,
        fv: formatBytes(pkg.audio), label: '语音音频'
      },
      {
        fx: formatNumber(config.materialCount) + ' 个模型 × ' + modelKiB + ' KB' + dup,
        fv: formatBytes(pkg.models), label: '模型动画'
      },
      {
        fx: '固定 ' + config.codeMiB + ' MB（可执行文件只有一份，不参与重复打包）',
        fv: formatBytes(pkg.code), label: '程序代码'
      }
    ];

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      html += '<div class="formula-row"><span class="fx"><strong>' + rows[i].label + '</strong>　' +
        rows[i].fx + '</span><span class="fv">' + rows[i].fv + '</span></div>';
    }
    html += '<div class="formula-row"><span class="fx"><strong>合计</strong></span>' +
      '<span class="fv">' + formatBytes(pkg.total) + '</span></div>';
    box.innerHTML = html;
  }

  // ════════════════════════════════════════════
  // 操作按钮
  // ════════════════════════════════════════════

  function bindActions() {
    var copy = $('copyConfig');
    var reset = $('resetConfig');

    if (copy) {
      copy.addEventListener('click', function () {
        copyText(buildConfigText(), copy);
      });
    }
    if (reset) {
      reset.addEventListener('click', function () {
        config = cloneConfig(getPreset('aaa').config);
        syncControlsFromConfig();
        render();
      });
    }
  }

  function buildConfigText() {
    var pkg = buildPackage(config);
    var fmt = getTextureFormat(config.formatId);
    var br = getAudioBitrate(config.bitrateId);
    var res = RESOLUTIONS[clampIndex(config.resIndex, RESOLUTIONS)];
    var voiceMin = VOICE_MINUTES[clampIndex(config.voiceIndex, VOICE_MINUTES)];
    var closest = findClosestGame(pkg.total);

    var lines = [
      '我在装机台上拨出了一个 ' + formatBytes(pkg.total) + ' 的游戏',
      '',
      '贴图：' + res + '×' + res + '，' + config.pbrChannels + ' 张通道，' + fmt.name +
        (config.mipmap ? '，开 mipmap' : '') + '，' + formatNumber(config.materialCount) + ' 种材质',
      '地图：' + config.mapCount + ' 张',
      '配音：' + config.voiceLangs + ' 种语言，每种 ' + voiceMin + ' 分钟，' + br.name,
      '重复打包：' + config.dupFactor.toFixed(1) + ' 份',
      '代码：' + config.codeMiB + ' MB',
      '',
      '结果：' + formatBytes(pkg.total) + '，其中代码占 ' + formatPercent(pkg.codePercent),
      '体积最接近《' + closest.name + '》（' + closest.gib + ' GB）',
      '',
      '装机台在这里：https://numfeel.996.ninja/pages/game-size-lab/'
    ];
    return lines.join('\n');
  }

  function copyText(text, btn) {
    var original = btn ? btn.innerHTML : '';
    function done(ok) {
      if (!btn) return;
      btn.innerHTML = ok
        ? '<i class="ti ti-check"></i> 已复制'
        : '<i class="ti ti-alert-triangle"></i> 复制失败';
      setTimeout(function () { btn.innerHTML = original; }, 1800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      return;
    }
    done(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

  // ════════════════════════════════════════════
  // 图表：真实游戏对照 + 源码 treemap
  // ════════════════════════════════════════════

  var AXIS_TEXT = '#8b93a7';
  var GRID_LINE = 'rgba(255,255,255,0.06)';

  /** 生成一个 tooltip 配置（不依赖 Object.assign，保持 ES5 可运行） */
  function tooltipOpt(extra) {
    var base = {
      backgroundColor: 'rgba(15,20,34,0.95)',
      borderColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      textStyle: { color: '#e4e4e4', fontSize: 12 },
      extraCssText: 'border-radius:10px;'
    };
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
    }
    return base;
  }

  function initCharts() {
    if (typeof echarts === 'undefined') return;

    var compareBox = $('compareChart');
    if (compareBox) {
      compareChart = echarts.init(compareBox, null, { renderer: 'canvas' });
      updateCompareChart(buildPackage(config));
    }

    var treeBox = $('treeChart');
    if (treeBox) {
      treeChart = echarts.init(treeBox, null, { renderer: 'canvas' });
      renderTreeChart();
    }

    window.addEventListener('resize', function () {
      if (compareChart) compareChart.resize();
      if (treeChart) treeChart.resize();
    });
  }

  function updateCompareChart(pkg) {
    if (!compareChart) return;

    var rows = [];
    for (var i = 0; i < REAL_GAMES.length; i++) {
      rows.push({
        name: REAL_GAMES[i].name + '（' + REAL_GAMES[i].year + '）',
        gib: REAL_GAMES[i].gib,
        mine: false
      });
    }
    rows.push({ name: '你拨出来的这台', gib: pkg.total / GIB, mine: true });

    rows.sort(function (a, b) { return a.gib - b.gib; });

    var names = [];
    var values = [];
    for (var j = 0; j < rows.length; j++) {
      names.push(rows[j].name);
      values.push({
        value: rows[j].gib,
        itemStyle: {
          color: rows[j].mine ? '#ffd700' : 'rgba(144,202,249,0.55)',
          borderRadius: [0, 4, 4, 0]
        }
      });
    }

    compareChart.setOption({
      grid: { left: 6, right: 62, top: 8, bottom: 24, containLabel: true },
      tooltip: tooltipOpt({
        trigger: 'item',
        formatter: function (p) {
          return p.name + '<br/><b style="color:#ffd700">' + p.value.toFixed(2) + ' GB</b>';
        }
      }),
      xAxis: {
        type: 'log',
        min: 0.01,
        max: 300,
        axisLabel: { color: AXIS_TEXT, fontSize: 10, formatter: function (v) { return v + 'G'; } },
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: AXIS_TEXT, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        data: values,
        barMaxWidth: 18,
        label: {
          show: true,
          position: 'right',
          color: '#c3cad9',
          fontSize: 10,
          formatter: function (p) {
            return p.value < 1 ? (p.value * 1024).toFixed(0) + ' MB' : p.value.toFixed(0) + ' GB';
          }
        }
      }]
    }, { notMerge: false });
  }

  /** 把 SDK_TREE 转成 ECharts treemap 需要的结构 */
  function toTreemapData(nodes) {
    var kindColor = { src: '#ffd700', bin: '#ff6b6b', other: '#90caf9' };
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var item = {
        name: n.name,
        value: n.bytes,
        note: n.note || '',
        itemStyle: { color: kindColor[n.kind] || '#90caf9' }
      };
      if (n.children && n.children.length) {
        item.children = toTreemapData(n.children);
      }
      out.push(item);
    }
    return out;
  }

  function renderTreeChart() {
    if (!treeChart) return;

    renderTreeLegend();

    treeChart.setOption({
      tooltip: tooltipOpt({
        formatter: function (info) {
          var note = info.data && info.data.note ? '<br/><span style="color:#8b93a7">' + info.data.note + '</span>' : '';
          return '<b>' + info.name + '</b><br/>' +
            '<span style="color:#ffd700">' + formatBytes(info.value) + '</span>' +
            '（占仓库 ' + formatPercent(info.value / SDK_FACTS.repoTotalBytes * 100) + '）' + note;
        }
      }),
      series: [{
        type: 'treemap',
        name: 'Source SDK 2013',
        data: toTreemapData(SDK_TREE),
        leafDepth: 1,
        roam: false,
        nodeClick: 'zoomToNode',
        width: '100%',
        height: '100%',
        top: 34,
        breadcrumb: {
          show: true,
          top: 2,
          height: 24,
          itemStyle: {
            color: 'rgba(255,255,255,0.08)',
            borderColor: 'rgba(255,255,255,0.14)',
            textStyle: { color: '#90caf9', fontSize: 11 }
          },
          emphasis: { itemStyle: { color: 'rgba(255,215,0,0.18)' } }
        },
        itemStyle: { borderColor: 'rgba(15,20,34,0.9)', borderWidth: 2, gapWidth: 2 },
        upperLabel: { show: false },
        label: {
          show: true,
          color: '#0d1220',
          fontSize: 12,
          fontWeight: 600,
          overflow: 'breakAll',
          formatter: function (p) {
            return p.name + '\n' + formatBytes(p.value);
          }
        },
        levels: [
          { itemStyle: { borderWidth: 0, gapWidth: 3 } },
          { itemStyle: { gapWidth: 2 } }
        ]
      }]
    });

    treeChart.on('click', function (params) {
      var note = $('treeNote');
      if (!note) return;
      if (params.data && params.data.note) {
        note.innerHTML = '<strong style="color:#ffd700">' + params.name + '</strong> · ' +
          formatBytes(params.value) + '　' + params.data.note;
      } else {
        note.textContent = '点任意方块往下钻一层，点上方面包屑回来。';
      }
    });
  }

  function renderTreeLegend() {
    var box = $('treeCrumb');
    if (!box) return;
    var keys = [
      { color: '#ffd700', label: '源码文本' },
      { color: '#ff6b6b', label: '预编译二进制' },
      { color: '#90caf9', label: '资源与脚本' }
    ];
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      html += '<span class="legend-item"><i class="legend-dot" style="background:' + keys[i].color + '"></i>' +
        keys[i].label + '</span>';
      if (i < keys.length - 1) html += '<span class="crumb-sep">·</span>';
    }
    box.innerHTML = html;
  }

  // ════════════════════════════════════════════
  // 滚动淡入（GSAP 在时才启用，避免脚本失败导致内容不可见）
  // ════════════════════════════════════════════

  function initReveal() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    var targets = document.querySelectorAll('.gsl .panel, .gsl .inline-fig, .gsl .fact, .gsl .conclusion');
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      el.setAttribute('data-reveal', '');
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: (function (node) {
          return function () {
            node.classList.add('is-visible');
            // 图表在容器可见后再量一次尺寸，避免初始化时宽高为 0
            if (compareChart) compareChart.resize();
            if (treeChart) treeChart.resize();
          };
        })(el)
      });
    }
  }
})();
