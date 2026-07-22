/**
 * 米勒-拉宾演示页 UI 逻辑。
 * 只负责 DOM 交互、GSAP 动画与 Chart.js 图表，全部数学计算委托给 engine.js。
 */
(function() {
  'use strict';

  var E = window.engine;
  var hasGSAP = typeof window.gsap !== 'undefined';

  // ---------- 工具 ----------
  var SUP = { '-': '\u207b', '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3',
    '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };

  function toSuper(n) {
    return String(n).split('').map(function(c) { return SUP[c] || c; }).join('');
  }

  /** 科学计数法字符串，如 2.34×10⁻¹³。 */
  function toSci(p) {
    if (p <= 0) return '0';
    if (p >= 0.01) return (p * 100).toPrecision(3) + '%';
    var e = Math.floor(Math.log10(p));
    var m = p / Math.pow(10, e);
    return m.toFixed(2) + '\u00d710' + toSuper(e);
  }

  /** 截断超长大数用于展示，保留首尾并标注位数。 */
  function formatBig(x, head) {
    var s = x.toString();
    var h = head || 14;
    if (s.length <= h * 2 + 3) return s;
    return s.slice(0, h) + '\u2026' + s.slice(-h);
  }

  function byId(id) { return document.getElementById(id); }

  function animateIn(el) {
    if (hasGSAP && el) {
      window.gsap.from(el, { opacity: 0, y: 12, duration: 0.4, ease: 'power2.out' });
    }
  }

  // ---------- 状态 ----------
  var state = {
    n: null,          // 当前受审数字 BigInt
    kind: null,
    witnesses: [],    // [{base, pass}]
    passCount: 0,
    decided: false,   // 是否已被定罪为合数
    groundComposite: false
  };

  // ============================================================
  // 模块 1：证人投票台
  // ============================================================
  var presetGrid = byId('presetGrid');
  var customN = byId('customN');
  var useCustomBtn = byId('useCustomBtn');
  var targetPanel = byId('targetPanel');
  var targetN = byId('targetN');
  var targetDigits = byId('targetDigits');
  var summonBtn = byId('summonBtn');
  var resetWitnessBtn = byId('resetWitnessBtn');
  var verdictBanner = byId('verdictBanner');
  var verdictIcon = byId('verdictIcon');
  var verdictText = byId('verdictText');
  var witnessCount = byId('witnessCount');
  var errorProb = byId('errorProb');
  var emFill = byId('emFill');
  var emSub = byId('emSub');
  var witnessTrack = byId('witnessTrack');

  function selectNumber(nStr, kind, cardEl) {
    var n;
    try {
      n = BigInt(nStr);
    } catch (e) {
      flashCustomError();
      return;
    }
    if (n < 5n) {
      verdictBannerSet('info', 'ti-info-circle', '这个数太小了，肉眼就能判断，换个大点的更有意思。');
      targetPanel.style.display = 'block';
      state.n = n;
      renderTarget();
      summonBtn.disabled = true;
      witnessTrack.innerHTML = '';
      return;
    }
    state.n = n;
    state.kind = kind;
    state.witnesses = [];
    state.passCount = 0;
    state.decided = false;
    // 记录真实身份（用于文案，不影响每轮独立随机）
    state.groundComposite = !E.millerRabinTest(n, { rounds: 24 }).probablePrime;

    Array.prototype.forEach.call(presetGrid.querySelectorAll('.preset-card'), function(c) {
      c.classList.toggle('active', c === cardEl);
    });

    targetPanel.style.display = 'block';
    summonBtn.disabled = false;
    witnessTrack.innerHTML = '';
    renderTarget();
    verdictBannerSet('info', 'ti-scale', '还没有证人。召唤第一位来投票吧。');
    updateErrorMeter();
    animateIn(targetPanel);
    targetPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateResultPreview();
  }

  function renderTarget() {
    targetN.textContent = formatBig(state.n, 24);
    var digits = state.n.toString().length;
    targetDigits.textContent = digits > 1 ? '（' + digits + ' 位数）' : '';
  }

  function flashCustomError() {
    customN.style.borderColor = '#ff6b6b';
    setTimeout(function() { customN.style.borderColor = ''; }, 1200);
  }

  function verdictBannerSet(type, icon, text) {
    verdictBanner.className = 'verdict-banner' + (type === 'composite' ? ' composite' : type === 'prime' ? ' prime' : '');
    verdictIcon.className = 'ti ' + icon;
    verdictText.textContent = text;
  }

  function updateErrorMeter() {
    var k = state.passCount;
    witnessCount.textContent = k;
    if (state.decided) {
      errorProb.textContent = '0（已定罪）';
      errorProb.classList.remove('hl-gold');
      errorProb.classList.add('hl-red');
      emFill.style.width = '100%';
      emFill.style.background = 'linear-gradient(90deg,#ff6b6b,#ff9d9d)';
      emSub.textContent = '已被证人揭穿，它铁定是合数——这个结论没有误差。';
      return;
    }
    errorProb.classList.add('hl-gold');
    errorProb.classList.remove('hl-red');
    emFill.style.background = 'linear-gradient(90deg,#81c784,#ffd700)';
    if (k === 0) {
      errorProb.textContent = '\u2014';
      emFill.style.width = '0%';
      emSub.textContent = '每多一位证人通过，误判上界就再除以 4。';
    } else {
      var bound = E.errorBound(k);
      errorProb.textContent = toSci(bound);
      emFill.style.width = ((1 - bound) * 100).toFixed(3) + '%';
      emSub.textContent = '相当于连抛 ' + (2 * k) + ' 次硬币，次次都是正面才会误判。';
    }
  }

  function summonWitness() {
    if (!state.n || state.decided) return;
    var a = E.randomBigIntInRange(2n, state.n - 2n, Math.random);
    var round = E.millerRabinRound(state.n, a);
    state.witnesses.push({ base: a, pass: round.probablePrime });

    var card = document.createElement('div');
    card.className = 'witness-card ' + (round.probablePrime ? 'pass' : 'catch');

    var seqHtml = buildSequenceHtml(round);
    card.innerHTML =
      '<div class="wc-head">' +
        '<span class="wc-title">证人 #' + state.witnesses.length + '　底数 a = <span class="wc-base">' + formatBig(a, 8) + '</span></span>' +
        '<span class="wc-verdict ' + (round.probablePrime ? 'pass' : 'catch') + '">' +
          (round.probablePrime ? '<i class="ti ti-thumb-up"></i> 看着像质数' : '<i class="ti ti-alert-triangle"></i> 抓到了！') +
        '</span>' +
      '</div>' +
      '<div class="wc-seq">' + seqHtml + '</div>';
    witnessTrack.appendChild(card);
    animateIn(card);

    if (!round.probablePrime) {
      state.decided = true;
      summonBtn.disabled = true;
      verdictBannerSet('composite', 'ti-gavel', '定罪：这是合数。底数 ' + formatBig(a, 8) + ' 揭穿了它——一票就够，结论 100% 可靠。');
      pulse(verdictBanner);
    } else {
      state.passCount++;
      var msg;
      if (state.passCount < 3) {
        msg = '第 ' + state.passCount + ' 位证人放行。再多问几位，把握会更大。';
      } else {
        msg = '已有 ' + state.passCount + ' 位证人放行，极可能是质数。误判上界 ' + toSci(E.errorBound(state.passCount)) + '。';
        verdictBanner.className = 'verdict-banner prime';
        verdictIcon.className = 'ti ti-shield-check';
        verdictText.textContent = msg;
        updateErrorMeter();
        updateResultPreview();
        return;
      }
      verdictBannerSet('info', 'ti-scale', msg);
    }
    updateErrorMeter();
    updateResultPreview();
  }

  /** 构造中间平方序列的展示 HTML。 */
  function buildSequenceHtml(round) {
    var seq = round.sequence;
    var nMinus1 = state.n - 1n;
    var parts = [];
    parts.push('a<sup>d</sup> mod n = <b>' + formatBig(seq[0], 6) + '</b>');
    for (var i = 1; i < seq.length; i++) {
      var v = seq[i];
      var isTarget = v === nMinus1;
      parts.push('&rarr; ' + (isTarget ? '<b>' + formatBig(v, 6) + ' (=n\u22121)</b>' : formatBig(v, 6)));
    }
    var tail = round.probablePrime
      ? '<br>结果：' + round.reason + '，通过。'
      : '<br>结果：' + round.reason + '。';
    return parts.join(' ') + tail;
  }

  function pulse(el) {
    if (hasGSAP && el) {
      window.gsap.fromTo(el, { scale: 0.98 }, { scale: 1, duration: 0.35, ease: 'back.out(2)' });
    }
  }

  function resetWitness() {
    targetPanel.style.display = 'none';
    state.n = null;
    state.witnesses = [];
    state.passCount = 0;
    state.decided = false;
    Array.prototype.forEach.call(presetGrid.querySelectorAll('.preset-card'), function(c) {
      c.classList.remove('active');
    });
    customN.value = '';
  }

  Array.prototype.forEach.call(presetGrid.querySelectorAll('.preset-card'), function(card) {
    card.addEventListener('click', function() {
      selectNumber(card.dataset.n, card.dataset.kind, card);
    });
  });

  useCustomBtn.addEventListener('click', function() {
    var raw = (customN.value || '').replace(/[\s,]/g, '');
    if (!/^\d+$/.test(raw)) { flashCustomError(); return; }
    selectNumber(raw, 'custom', null);
  });
  customN.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') useCustomBtn.click();
  });

  summonBtn.addEventListener('click', summonWitness);
  resetWitnessBtn.addEventListener('click', resetWitness);

  // Hero CTA
  byId('heroStartBtn').addEventListener('click', function() {
    byId('witnessSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var carmichael = presetGrid.querySelector('[data-n="561"]');
    setTimeout(function() { selectNumber('561', 'carmichael', carmichael); }, 350);
  });

  // ============================================================
  // 模块 2：费马 vs 米勒-拉宾
  // ============================================================
  var duelRunBtn = byId('duelRunBtn');
  var DUEL_N = 561;
  var DUEL_BASES = [2, 4, 5, 7, 8, 13, 14, 16]; // 均与 561 互质

  duelRunBtn.addEventListener('click', function() {
    // 对每个共享底数分别跑「费马一轮」和「米勒-拉宾一轮」，直接对比同一批证人。
    // 这里刻意用 millerRabinRound（而非会因小因子提前短路的 millerRabinTest），
    // 保证两种测试用的是同一批与 561 互质的底数。
    var fermatAllPass = true;
    var mrWitness = null;
    DUEL_BASES.forEach(function(a) {
      if (!E.fermatRound(DUEL_N, a).probablePrime) fermatAllPass = false;
      var r = E.millerRabinRound(DUEL_N, a);
      if (!r.probablePrime && mrWitness === null) mrWitness = a;
    });

    var fermatCard = byId('fermatCard');
    var mrCard = byId('mrCard');
    var basesText = DUEL_BASES.slice(0, 6).join(', ') + ' \u2026';

    fermatCard.className = 'duel-card fermat fooled';
    byId('fermatVerdict').textContent = fermatAllPass ? '误判为「质数」' : '识破为合数';
    byId('fermatDetail').textContent = '底数 ' + basesText + ' 都满足 a^560 \u2261 1 (mod 561)，费马测试全部放行，被骗。';

    mrCard.className = 'duel-card mr caught';
    byId('mrVerdict').textContent = mrWitness !== null ? '识破为合数' : '误判为「质数」';
    var w = mrWitness !== null ? mrWitness.toString() : '某底数';
    byId('mrDetail').textContent = '同样的底数 ' + w + '：费马放行，但米勒-拉宾多看了几步平方，当场揭穿 561 = 3 \u00d7 11 \u00d7 17。';

    animateIn(fermatCard);
    animateIn(mrCard);
    pulse(mrCard);
  });

  // ============================================================
  // 模块 3：RSA 造质数
  // ============================================================
  var bitsPicker = byId('bitsPicker');
  var rsaRunBtn = byId('rsaRunBtn');
  var rsaExpect = byId('rsaExpect');
  var rsaAttempts = byId('rsaAttempts');
  var rsaRejected = byId('rsaRejected');
  var rsaStatus = byId('rsaStatus');
  var rsaTicker = byId('rsaTicker');
  var rsaResult = byId('rsaResult');
  var rsaPrime = byId('rsaPrime');
  var rsaResultSub = byId('rsaResultSub');
  var currentBits = 32;
  var rsaRunning = false;

  function updateExpect() {
    var est = E.primeDensityEstimate(currentBits);
    rsaExpect.textContent = '预计平均要摇 ~' + Math.round(est.expectedTriesAmongOdds) + ' 个奇数';
  }

  Array.prototype.forEach.call(bitsPicker.querySelectorAll('.bit-card'), function(card) {
    card.addEventListener('click', function() {
      if (rsaRunning) return;
      currentBits = parseInt(card.dataset.bits, 10);
      Array.prototype.forEach.call(bitsPicker.querySelectorAll('.bit-card'), function(c) {
        c.classList.toggle('active', c === card);
      });
      updateExpect();
    });
  });
  updateExpect();

  /** 边收集轨迹边生成大概率质数，返回真实的尝试次数与被丢弃的候选。 */
  function generateWithTrace(bits, maxTrace) {
    var attempts = 0;
    var rejected = 0;
    var trace = [];
    var cap = 20000;
    while (attempts < cap) {
      attempts++;
      var c = E.randomBigIntWithBits(bits, Math.random);
      c |= 1n;
      var res = E.millerRabinTest(c, { rounds: 16, rng: Math.random });
      if (res.probablePrime) {
        return { prime: c, attempts: attempts, rejected: rejected, trace: trace };
      }
      rejected++;
      if (trace.length < maxTrace) trace.push(c);
    }
    return { prime: null, attempts: attempts, rejected: rejected, trace: trace };
  }

  rsaRunBtn.addEventListener('click', function() {
    if (rsaRunning) return;
    rsaRunning = true;
    rsaRunBtn.disabled = true;
    rsaResult.style.display = 'none';
    rsaTicker.innerHTML = '';
    rsaAttempts.textContent = '0';
    rsaRejected.textContent = '0';
    rsaStatus.className = 'rs-value';
    rsaStatus.textContent = '摇号中\u2026';

    var result = generateWithTrace(currentBits, 12);
    var shown = result.trace.slice(0, 12);
    var steps = Math.max(shown.length, 1);
    var i = 0;

    function step() {
      if (i < shown.length) {
        var chip = document.createElement('span');
        chip.className = 'tick-chip';
        chip.textContent = formatBig(shown[i], 8) + ' \u2717';
        rsaTicker.appendChild(chip);
        // 只保留最近 12 个
        while (rsaTicker.children.length > 12) rsaTicker.removeChild(rsaTicker.firstChild);
      }
      i++;
      var frac = i / (steps + 1);
      rsaAttempts.textContent = Math.max(i, Math.round(frac * result.attempts));
      rsaRejected.textContent = Math.round(frac * result.rejected);
      if (i <= shown.length) {
        setTimeout(step, 150);
      } else {
        finishRSA(result);
      }
    }
    step();
  });

  function finishRSA(result) {
    rsaAttempts.textContent = result.attempts;
    rsaRejected.textContent = result.rejected;
    rsaStatus.textContent = '找到了';
    rsaStatus.className = 'rs-value hl-green';

    var chip = document.createElement('span');
    chip.className = 'tick-chip hit';
    chip.textContent = formatBig(result.prime, 8) + ' \u2713';
    rsaTicker.appendChild(chip);

    rsaResult.style.display = 'block';
    rsaPrime.textContent = result.prime.toString();
    var digits = result.prime.toString().length;
    rsaResultSub.textContent = '这是一个 ' + currentBits + ' 位（十进制 ' + digits + ' 位）的大概率质数，用 16 轮米勒-拉宾验证，误判上界约 ' + toSci(E.errorBound(16)) + '。RSA 需要两个这样的质数相乘当公钥。';
    animateIn(rsaResult);
    pulse(rsaResult);

    rsaRunning = false;
    rsaRunBtn.disabled = false;
  }

  // ============================================================
  // 模块 4：错误概率可视化
  // ============================================================
  var roundSlider = byId('roundSlider');
  var roundValue = byId('roundValue');
  var errFormula = byId('errFormula');
  var errPlain = byId('errPlain');
  var compareList = byId('compareList');
  var errorChart = null;

  var COMPARISONS = [
    { label: '连抛 10 次硬币，全是正面', prob: Math.pow(0.5, 10) },
    { label: '某一年被闪电击中（美国 NWS）', prob: 1 / 1222000 },
    { label: '双色球中一等奖', prob: 1 / 17721088 },
    { label: '连抛 40 次硬币，全是正面', prob: Math.pow(0.5, 40) },
    { label: '在可观测宇宙里随机指中某一个特定原子', prob: 1e-80 }
  ];

  function buildCompareRows() {
    var head = compareList.querySelector('.cmp-head');
    compareList.innerHTML = '';
    compareList.appendChild(head);
    COMPARISONS.forEach(function(c, idx) {
      var row = document.createElement('div');
      row.className = 'cmp-row';
      row.dataset.idx = idx;
      row.innerHTML =
        '<span class="cmp-icon"><i class="ti ti-circle"></i></span>' +
        '<span class="cmp-label">' + c.label + '</span>' +
        '<span class="cmp-prob">\u2248 ' + toSci(c.prob) + '</span>';
      compareList.appendChild(row);
    });
  }

  function updateErrorViz() {
    var k = parseInt(roundSlider.value, 10);
    roundValue.textContent = k;
    var bound = E.errorBound(k);
    errFormula.textContent = '\u2248 ' + toSci(bound);
    errPlain.textContent = '相当于连抛 ' + (2 * k) + ' 次硬币，次次都是正面';

    // 对照行：误判概率比某事件更罕见时打勾
    Array.prototype.forEach.call(compareList.querySelectorAll('.cmp-row'), function(row) {
      var c = COMPARISONS[parseInt(row.dataset.idx, 10)];
      var beaten = bound < c.prob;
      row.classList.toggle('beaten', beaten);
      var icon = row.querySelector('.cmp-icon i');
      icon.className = beaten ? 'ti ti-circle-check-filled' : 'ti ti-circle';
    });

    updateChartMarker(k, bound);
  }

  function initChart() {
    if (typeof window.Chart === 'undefined') return;
    var maxK = parseInt(roundSlider.max, 10);
    var labels = [];
    var data = [];
    for (var k = 1; k <= maxK; k++) {
      labels.push(k);
      data.push(E.errorBound(k));
    }
    var ctx = byId('errorChart').getContext('2d');
    errorChart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '误判概率上界 (1/4)^k',
            data: data,
            borderColor: '#ffd700',
            backgroundColor: 'rgba(255,215,0,0.08)',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0
          },
          {
            label: '当前 k',
            data: [],
            borderColor: '#90caf9',
            backgroundColor: '#90caf9',
            pointRadius: 6,
            pointHoverRadius: 7,
            showLine: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#ccc', boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function(item) {
                return 'k=' + item.label + '：\u2248 ' + toSci(item.parsed.y);
              }
            }
          }
        },
        scales: {
          y: {
            type: 'logarithmic',
            title: { display: true, text: '误判概率上界（对数轴）', color: '#888' },
            ticks: {
              color: '#888',
              callback: function(v) {
                var lg = Math.log10(v);
                if (Math.abs(lg - Math.round(lg)) < 1e-9) return '10' + toSuper(Math.round(lg));
                return '';
              }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          x: {
            title: { display: true, text: '通过的证人轮数 k', color: '#888' },
            ticks: {
              color: '#888',
              maxTicksLimit: 16,
              callback: function(val, idx) {
                var lbl = this.getLabelForValue(val);
                return (lbl % 10 === 0 || lbl === 1) ? lbl : '';
              }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
  }

  function updateChartMarker(k, bound) {
    if (!errorChart) return;
    var arr = new Array(errorChart.data.labels.length).fill(null);
    if (k >= 1 && k <= arr.length) arr[k - 1] = bound;
    errorChart.data.datasets[1].data = arr;
    errorChart.update('none');
  }

  roundSlider.addEventListener('input', updateErrorViz);

  // ============================================================
  // 模块 5：复制结论
  // ============================================================
  var copyBtn = byId('copyBtn');
  var copyFeedback = byId('copyFeedback');
  var resultPreview = byId('resultPreview');

  function updateResultPreview() {
    if (!state.n) {
      resultPreview.textContent = '先在上方给一个数字定罪，这里会显示可复制的结论。';
      return;
    }
    var lines = [];
    lines.push('受审数字：' + formatBig(state.n, 30));
    lines.push('召唤证人：' + state.witnesses.length + ' 位');
    if (state.decided) {
      lines.push('结论：合数（被证人揭穿，100% 确定）');
    } else if (state.passCount > 0) {
      lines.push('结论：大概率是质数');
      lines.push('通过证人：' + state.passCount + ' 位');
      lines.push('误判概率上界：' + toSci(E.errorBound(state.passCount)) + '（相当于连抛 ' + (2 * state.passCount) + ' 次硬币全正面）');
    } else {
      lines.push('结论：尚未召唤证人');
    }
    lines.push('—— 米勒-拉宾素性测试演示 https://numfeel.996.ninja/pages/miller-rabin/');
    resultPreview.textContent = lines.join('\n');
  }

  copyBtn.addEventListener('click', function() {
    var text = resultPreview.textContent;
    function done() {
      copyFeedback.textContent = '\u5df2\u590d\u5236';
      setTimeout(function() { copyFeedback.textContent = ''; }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { copyFeedback.textContent = '请手动复制'; }
      document.body.removeChild(ta);
    }
  });

  // ---------- 初始化 ----------
  buildCompareRows();
  if (typeof window.Chart !== 'undefined') {
    initChart();
    updateErrorViz();
  } else if (typeof window.loadChartJS === 'function') {
    window.loadChartJS().then(function() { initChart(); updateErrorViz(); });
  }

})();
