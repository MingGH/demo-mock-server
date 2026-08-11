/**
 * 一KB传书 — 页面交互层
 * 职责：DOM 绑定、事件处理、GSAP 动画、埋点。
 * 纯逻辑见 engine.js。
 */
(function () {
  'use strict';

  var E = window.OneKbLetter || {};
  var gsap = window.gsap;

  var TYPE_META = E.TYPE_META;

  var state = {
    type: E.TYPE_TEXT,
    text: ''
  };

  // ─────────────────────── 工具 ───────────────────────
  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function nfTrack(name, props) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(name, props);
      }
    } catch (e) {}
  }

  // 简易电报音效（WebAudio 合成，无需音频文件）
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var actx = null;
  function beep(freq, dur, vol) {
    try {
      if (!AudioCtx) return;
      actx = actx || new AudioCtx();
      if (actx.state === 'suspended') actx.resume();
      var t0 = actx.currentTime;
      var osc = actx.createOscillator();
      var gain = actx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.04, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.06));
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(t0);
      osc.stop(t0 + (dur || 0.06));
    } catch (e) {}
  }

  // ─────────────────────── 写信台 ───────────────────────
  function buildPaperCards() {
    var grid = $('paperGrid');
    var cards = grid.querySelectorAll('.paper-card');
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('click', function () {
        selectPaper(card.getAttribute('data-type'));
        nfTrack('paper_pick', { type: card.getAttribute('data-type') });
      });
    });
  }

  function selectPaper(type) {
    state.type = type;
    var cards = $('paperGrid').querySelectorAll('.paper-card');
    Array.prototype.forEach.call(cards, function (c) {
      c.classList.toggle('active', c.getAttribute('data-type') === type);
    });
    $('writeHint').textContent = TYPE_META[type].hint;
    $('letterInput').placeholder = '例如：' + TYPE_META[type].example;
    gsap.fromTo($('writeHint'), { opacity: 0 }, { opacity: 1, duration: 0.4 });
  }

  function buildSampleBtn() {
    var idx = 0;
    $('sampleBtn').addEventListener('click', function () {
      var p = E.SAMPLE_PACKETS[idx % E.SAMPLE_PACKETS.length];
      idx++;
      selectPaper(p.type);
      $('letterInput').value = p.text;
      onInput();
      beep(520, 0.05, 0.03);
    });
  }

  // 仪表更新
  function onInput() {
    var input = $('letterInput');
    state.text = input.value;
    var packet = E.buildPacket(state.type, state.text);
    var cells = E.packCells(packet.bytes);

    $('meterBytes').textContent = packet.bytes + ' / 1024 字节';
    $('meterBytes').classList.toggle('warn', packet.bytes > E.KB);

    var cellBox = $('byteCells');
    cellBox.innerHTML = '';
    for (var i = 0; i < cells.length; i++) {
      var d = document.createElement('span');
      d.className = 'cell' + (cells[i] ? ' on' : '');
      if (cells[i] && packet.bytes > E.KB) d.className = 'cell warn';
      cellBox.appendChild(d);
    }

    var fill = $('meterFill');
    fill.style.width = Math.min(100, packet.percent) + '%';
    fill.classList.toggle('warn', packet.bytes > E.KB);

    var status = $('meterStatus');
    if (packet.bytes === 0) {
      status.textContent = '还有 1024 字节可以写';
      status.classList.remove('over');
    } else if (packet.bytes <= E.KB) {
      status.textContent = '还剩 ' + (E.KB - packet.bytes) + ' 字节 · 可以发射';
      status.classList.remove('over');
    } else {
      status.textContent = '装不下了，删掉 ' + (packet.bytes - E.KB) + ' 字节';
      status.classList.add('over');
    }
    input.classList.toggle('over', packet.bytes > E.KB);

    $('sendBtn').disabled = !packet.ok;
    return packet;
  }

  // ─────────────────────── 第三幕：传输 ───────────────────────
  function runTransit(packet, onDone) {
    $('actDesk').classList.add('hidden');
    $('actVerdict').classList.add('hidden');
    $('actTransit').classList.remove('hidden');
    gsap.fromTo($('actTransit'), { opacity: 0 }, { opacity: 1, duration: 0.5 });
    $('actTransit').scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 电报逐行打字回显
    var lines = packet.text.split('\n');
    var replay = $('telegramReplay');
    replay.innerHTML = '';
    var log = $('transitLog');
    var fill = $('transitFill');
    fill.style.width = '0%';
    $('transitGlitch').style.opacity = '0';

    var lineIdx = 0;
    var charIdx = 0;
    var lineEl = null;

    function typeNextChar() {
      if (lineIdx >= lines.length) { finishTyping(); return; }
      if (!lineEl) {
        lineEl = document.createElement('span');
        lineEl.className = 't-line';
        lineEl.textContent = '';
        replay.appendChild(lineEl);
      }
      lineEl.textContent = lines[lineIdx].slice(0, charIdx + 1);
      charIdx++;
      if (charIdx % 5 === 0) beep(700, 0.02, 0.015);
      if (charIdx >= lines[lineIdx].length) {
        lineIdx++;
        charIdx = 0;
        lineEl = null;
      }
      setTimeout(typeNextChar, 18);
    }
    function finishTyping() {
      log.innerHTML = '<span class="ok">▼ 编码完成 · 开始传输</span>';
      transfer();
    }

    function transfer() {
      var proxy = { p: 0 };
      var tl = gsap.timeline({
        onComplete: function () {
          log.innerHTML = '<span class="ok">✓ 已送达三年前</span>';
          beep(1040, 0.08, 0.04);
          setTimeout(function () { onDone(); }, 700);
        }
      });
      tl.to(proxy, {
        p: 62,
        duration: 2.2,
        ease: 'power1.inOut',
        onUpdate: function () { fill.style.width = proxy.p + '%'; }
      });
      tl.add(function () {
        log.innerHTML = '<span class="err">✖ 信号中断 · 正在重连……</span>';
        $('transitGlitch').style.opacity = '1';
        beep(180, 0.15, 0.05);
      });
      tl.to({}, { duration: 1.1 });
      tl.add(function () {
        log.innerHTML = '<span class="ok">▼ 链路恢复 · 继续传输</span>';
        $('transitGlitch').style.opacity = '0';
      });
      tl.to(proxy, {
        p: 100,
        duration: 2.0,
        ease: 'power1.out',
        onUpdate: function () { fill.style.width = proxy.p + '%'; }
      });
    }

    typeNextChar();
  }

  // ─────────────────────── 第四幕：结算 ───────────────────────
  function renderVerdict(packet, result) {
    $('actTransit').classList.add('hidden');
    $('actVerdict').classList.remove('hidden');
    gsap.fromTo($('actVerdict'), { opacity: 0 }, { opacity: 1, duration: 0.6 });
    $('actVerdict').scrollIntoView({ behavior: 'smooth', block: 'start' });

    $('letterReceived').textContent = packet.text;

    // 双仪表动画
    animateGauge('ringCredit', 'creditNum', result.credit);
    animateGauge('ringChange', 'changeNum', result.change);

    var badge = $('gradeBadge');
    badge.innerHTML =
      '<span class="grade-name">' + escapeHtml(result.grade.name) + '</span>' +
      '<div class="grade-desc">' + escapeHtml(result.grade.desc) + '</div>';

    var list = $('analysisList');
    list.innerHTML = '';
    result.analyses.forEach(function (a, i) {
      var li = document.createElement('li');
      li.textContent = a;
      li.style.opacity = 0;
      list.appendChild(li);
      gsap.to(li, { opacity: 1, duration: 0.4, delay: 0.5 + i * 0.35 });
    });

    var vLine = $('verdictLine');
    vLine.textContent = result.verdict;
    gsap.fromTo(vLine, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.5 + result.analyses.length * 0.35 });

    nfTrack('letter_send', {
      type: packet.type,
      bytes: packet.bytes,
      credit: result.credit,
      change: result.change,
      kind: result.num && result.num.kind ? result.num.kind : 'none'
    });
  }

  function animateGauge(ringId, numId, target) {
    var ring = $(ringId);
    var numEl = $(numId);
    var C = 326.7; // 2πr, r=52
    gsap.fromTo(ring, { strokeDashoffset: C }, {
      strokeDashoffset: C * (1 - target / 100),
      duration: 1.4,
      ease: 'power2.out'
    });
    var proxy = { v: 0 };
    gsap.to(proxy, {
      v: target,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: function () { numEl.innerHTML = Math.round(proxy.v) + '<small> / 100</small>'; }
    });
  }

  // 发射主流程
  function buildSend() {
    $('sendBtn').addEventListener('click', function () {
      var packet = onInput();
      if (!packet.ok) return;
      beep(440, 0.06, 0.04);

      runTransit(packet, function () {
        var result = E.settleFate(packet);
        renderVerdict(packet, result);
      });
    });
  }

  // ─────────────────────── 容量科普 ───────────────────────
  function renderCapacity() {
    var grid = $('capacityGrid');
    grid.innerHTML = '';
    E.CAPACITY_EXAMPLES.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'cap-card';
      d.innerHTML =
        '<i class="ti ti-' + c.icon + '"></i>' +
        '<span class="cap-label">' + escapeHtml(c.label) + '</span>' +
        '<span class="cap-detail">' + escapeHtml(c.detail) + '</span>';
      grid.appendChild(d);
    });
  }

  // ─────────────────────── 滚动入场 ───────────────────────
  function watchSections() {
    var secs = document.querySelectorAll('.section');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var s = en.target;
          gsap.to(s, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
          io.unobserve(s);
        }
      });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(secs, function (s) { io.observe(s); });
  }

  // ─────────────────────── 启动 ───────────────────────
  function boot() {
    if (!window.gsap) {
      console.error('GSAP 未加载');
    }
    if (!E || !E.buildPacket) {
      console.error('engine.js 未加载');
      return;
    }

    buildPaperCards();
    buildSampleBtn();
    selectPaper(E.TYPE_TEXT);

    var input = $('letterInput');
    input.addEventListener('input', onInput);
    onInput(); // 初始化 1KB 仪表

    buildSend();
    renderCapacity();
    watchSections();

    $('backTopBtn').addEventListener('click', function () {
      // 重新开一封信：恢复写信台，隐藏过程幕
      $('actDesk').classList.remove('hidden');
      $('actTransit').classList.add('hidden');
      $('actVerdict').classList.add('hidden');
      input.value = '';
      onInput();
      $('writeHint').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
