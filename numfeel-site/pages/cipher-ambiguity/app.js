/**
 * cipher-ambiguity 页面交互 — 调用 engine.js 的纯函数并渲染 DOM
 *
 * window.* 暴露的处理器供内联事件与无浏览器冒烟测试（app.smoke.test.js）驱动。
 */
(function () {
  'use strict';

  var state = {
    triedCount: 0,
    found: {},        // truthIndex -> true
    triedKeys: {},    // keyIndex -> true（图表按"不同钥匙"去重计数）
    counts: [],       // 每种真相被几把不同的钥匙解出
    bits: 4,
    dialIndex: 8      // 转盘当前档位（0..15）
  };

  var dialRefs = { ticks: [], marker: null, initialized: false };

  var els = {};
  var chart = null;

  function $(id) { return document.getElementById(id); }

  /** 收集 DOM 引用并完成首次渲染 */
  function init() {
    els.hexStrip = $('hexStrip');
    els.dial = $('dial');
    els.dialKey = $('dialKey');
    els.plainLine = $('plainLine');
    els.plainSub = $('plainSub');
    els.chips = $('chips');
    els.toast = $('toast');
    els.triedCount = $('triedCount');
    els.bits = $('bits');
    els.ksBits = $('ksBits');
    els.ksKeys = $('ksKeys');
    els.ksMeterFill = $('ksMeterFill');
    els.summaryText = $('summaryText');
    els.copyBtn = $('copyBtn');
    els.copyToast = $('copyToast');

    renderHex();
    renderChips();
    initChart();

    initDial();
    if (els.bits) els.bits.addEventListener('input', function () { window.onBitsInput(els.bits.value); });
    if (els.copyBtn) els.copyBtn.addEventListener('click', window.onCopy);

    var resetBtn = $('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', window.onReset);

    renderDial(state.dialIndex);
    if (els.triedCount) els.triedCount.textContent = '已转动 0 次';
    window.onBitsInput(state.bits);
  }

  /** 渲染固定密文条 */
  function renderHex() {
    if (!els.hexStrip) return;
    var html = '';
    CIPHERTEXT.split(' ').forEach(function (h) {
      html += '<span class="cipher-cell">' + h + '</span>';
    });
    els.hexStrip.innerHTML = html;
    if (window.gsap) window.gsap.from('#hexStrip .cipher-cell', { y: 10, opacity: 0, stagger: 0.08, duration: 0.4, ease: 'power2.out' });
  }

  /** 渲染 8 个收集槽位 */
  function renderChips() {
    if (!els.chips) return;
    els.chips.innerHTML = '';
    for (var i = 0; i < OTP_PLAINTEXTS.length; i++) {
      var chip = document.createElement('span');
      chip.id = 'chip-' + i;
      chip.className = 'chip';
      chip.textContent = '??? 真相 ' + (i + 1) + '/8';
      els.chips.appendChild(chip);
    }
  }

  /** 初始化 Chart.js 条形图（无 Chart 环境时静默跳过） */
  function initChart() {
    if (typeof Chart === 'undefined') return;
    var ctx = $('truthChart');
    if (!ctx) return;
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: OTP_PLAINTEXTS.map(function (_, i) { return '真相 ' + (i + 1); }),
        datasets: [{ data: state.counts.slice(), backgroundColor: 'rgba(127,255,158,.45)', borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { precision: 0, color: '#4a6a4a', font: { size: 10 } }, grid: { color: 'rgba(127,255,158,.07)' }, beginAtZero: true },
          y: { ticks: { color: '#6f8f6f', font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  /** 更新图表数据 */
  function updateChart() {
    if (!chart) return;
    chart.data.datasets[0].data = state.counts.slice();
    chart.update('none');
  }

  /**
   * 初始化圆形转盘：16 个刻度、指针标记、拖拽与键盘交互
   */
  function initDial() {
    if (!els.dial) return;
    var STEP = 360 / OTP_KEY_COUNT; // 22.5°
    for (var i = 0; i < OTP_KEY_COUNT; i++) {
      var line = document.createElement('div');
      line.className = 'tick-line';
      line.style.transform = 'translate(-50%,-50%) rotate(' + (i * STEP) + 'deg) translateY(-106px)';
      els.dial.appendChild(line);

      var num = document.createElement('div');
      num.className = 'tick-num';
      num.textContent = String(i);
      num.style.transform = 'translate(-50%,-50%) rotate(' + (i * STEP) + 'deg) translateY(-88px) rotate(' + (-i * STEP) + 'deg)';
      els.dial.appendChild(num);
      dialRefs.ticks.push(num);
    }
    dialRefs.marker = $('dialMarker');

    var dragging = false;
    function pick(clientX, clientY) {
      var rect = els.dial.getBoundingClientRect();
      var dx = clientX - (rect.left + rect.width / 2);
      var dy = clientY - (rect.top + rect.height / 2);
      var ang = Math.atan2(dx, -dy) * 180 / Math.PI;
      ang = (ang + 360) % 360;
      setDial(Math.round(ang / STEP) % OTP_KEY_COUNT);
    }
    els.dial.addEventListener('pointerdown', function (e) {
      dragging = true;
      if (els.dial.setPointerCapture) els.dial.setPointerCapture(e.pointerId);
      pick(e.clientX, e.clientY);
      e.preventDefault();
    });
    els.dial.addEventListener('pointermove', function (e) {
      if (dragging) pick(e.clientX, e.clientY);
    });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      els.dial.addEventListener(t, function () { dragging = false; });
    });
    els.dial.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = state.dialIndex + 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = state.dialIndex - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = OTP_KEY_COUNT - 1;
      if (next !== null) { setDial(next); e.preventDefault(); }
    });
    setDial(state.dialIndex, true);
  }

  /**
   * 把转盘拨到第 index 档：更新视觉并解密
   * @param {number} index - 任意整数，自动折回 0..15
   * @param {boolean} [silent] - true 时只渲染不计尝试（初始化、重置用）
   */
  function setDial(index, silent) {
    var STEP = 360 / OTP_KEY_COUNT;
    var i = ((Math.round(index) % OTP_KEY_COUNT) + OTP_KEY_COUNT) % OTP_KEY_COUNT;
    var first = !dialRefs.initialized;
    state.dialIndex = i;
    dialRefs.initialized = true;
    for (var j = 0; j < dialRefs.ticks.length; j++) {
      dialRefs.ticks[j].className = 'tick-num' + (j === i ? ' on' : '');
    }
    if (els.dial && els.dial.setAttribute) els.dial.setAttribute('aria-valuenow', String(i));
    var reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (dialRefs.marker) {
      if (window.gsap && !reduced) {
        window.gsap.to(dialRefs.marker, { rotation: i * STEP, duration: first ? 0 : 0.25, ease: 'power2.out' });
      } else {
        dialRefs.marker.style.transform = 'rotate(' + (i * STEP) + 'deg)';
      }
    }
    if (silent) {
      renderDial(i);
      updateSummary();
    } else {
      window.onDialInput(i);
    }
  }

  /**
   * 渲染转盘当前档位的解密结果（不计数，供初始化与重置复用）
   * @param {string|number} value - 滑块档位
   */
  function renderDial(value) {
    var r = decryptOtp(parseInt(value, 10));
    if (els.dialKey) els.dialKey.textContent = 'K=' + String(r.keyIndex).padStart(2, '0');
    if (els.plainSub) els.plainSub.textContent = '密钥 ' + String(r.keyIndex).padStart(2, '0') + ' 号 · 解密输出';
    if (els.plainLine) {
      els.plainLine.textContent = r.text;
      if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.gsap.fromTo(els.plainLine, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: 'power2.out' });
      }
    }
  }

  /**
   * 转盘输入：计一次尝试，解密、点亮芯片、更新图表与小结
   * @param {string|number} value - 滑块档位
   */
  function onDialInput(value) {
    renderDial(value);
    var r = decryptOtp(parseInt(value, 10));

    state.triedCount++;
    if (!state.triedKeys[r.keyIndex]) {
      state.triedKeys[r.keyIndex] = true;
      state.counts[r.truthIndex] = (state.counts[r.truthIndex] || 0) + 1;
      updateChart();
    }

    if (!state.found[r.truthIndex]) {
      state.found[r.truthIndex] = true;
      var chip = $('chip-' + r.truthIndex);
      if (chip) {
        chip.classList.add('lit');
        chip.textContent = r.text;
        if (window.gsap) window.gsap.from(chip, { scale: 0.6, duration: 0.3, ease: 'back.out(2)' });
      }
      if (Object.keys(state.found).length === OTP_PLAINTEXTS.length && els.toast) {
        els.toast.classList.remove('hidden');
        if (window.gsap) window.gsap.from(els.toast, { y: 12, opacity: 0, duration: 0.4, ease: 'power2.out' });
      }
    }
    if (els.triedCount) els.triedCount.textContent = '已转动 ' + state.triedCount + ' 次';
    updateSummary();
  }

  /** 把当前档位的解密结果画出来但不计入尝试（初始化、重置用） */
  function reapplyDial() {
    renderDial(state.dialIndex);
    updateSummary();
  }

  /**
   * 密钥空间滑块：展示 2^n 量级
   * @param {string|number} value - 位数
   */
  function onBitsInput(value) {
    var ks = keySpace(value);
    state.bits = ks.bits;
    if (els.bits) els.bits.value = String(ks.bits);
    if (els.ksBits) els.ksBits.textContent = ks.bits + ' 位密钥';
    if (els.ksKeys) {
      els.ksKeys.textContent = ks.display;
      if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.gsap.fromTo(els.ksKeys, { scale: 0.92 }, { scale: 1, duration: 0.25, ease: 'power2.out' });
      }
    }
    if (els.ksMeterFill) els.ksMeterFill.style.width = Math.max(4, Math.round((ks.bits / 64) * 100)) + '%';
    updateSummary();
  }

  /** 更新可复制小结 */
  function updateSummary() {
    if (!els.summaryText) return;
    els.summaryText.textContent = buildSummary({
      triedCount: state.triedCount,
      foundCount: Object.keys(state.found).length,
      totalTexts: OTP_PLAINTEXTS.length,
      bits: state.bits
    });
  }

  /** 复制小结（clipboard API 优先，textarea 兜底） */
  function onCopy() {
    var text = els.summaryText ? els.summaryText.textContent : '';
    function done() {
      if (!els.copyToast) return;
      els.copyToast.style.visibility = 'visible';
      if (window.gsap) window.gsap.from(els.copyToast, { y: 8, opacity: 0, duration: 0.3 });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  /** textarea + execCommand 复制兜底 */
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) done();
  }

  /** 重置体验（保留密钥空间滑块位置） */
  function onReset() {
    state.triedCount = 0;
    state.found = {};
    state.triedKeys = {};
    state.counts = [];
    renderChips();
    updateChart();
    if (els.toast) els.toast.classList.add('hidden');
    if (els.triedCount) els.triedCount.textContent = '已转动 0 次';
    reapplyDial();
  }

  window.onDialInput = onDialInput;
  window.setDial = setDial;
  window.onBitsInput = onBitsInput;
  window.onCopy = onCopy;
  window.onReset = onReset;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
