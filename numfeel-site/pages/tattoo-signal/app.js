/**
 * app.js - 纹身与犯罪数据故事 · DOM 交互层（纽约客特稿版）
 *
 * 依赖（CDN 全局）：Chart.js、gsap、ScrollTrigger
 * 依赖（本目录）：data.js -> window.TattooCrimeData
 *                 logic.js -> window.TattooSignal
 */
(function () {
  'use strict';

  var D = window.TattooCrimeData || {};
  var L = window.TattooSignal || {};
  var DEF = D.BAYES_DEFAULTS || { prior: 0.01, likelihood: 0.447, falseRate: 0.32 };

  // 极简编辑风：黑灰 + 浅青
  var C = {
    ink: '#f5f2ec', dim: 'rgba(245,242,236,0.48)', grid: 'rgba(245,242,236,0.10)',
    accent: '#c7e1ff', male: 'rgba(245,242,236,0.55)', female: '#c7e1ff', ref: '#ff7a6b'
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    fillPlainText();
    initKatex();
    initPrisonChart();
    initFemaleChart();
    initBayes();
    initTocActive();
    initReveal();
    initReadProgress();
    initCopy();
  }

  // ════════════ 图表 1：监狱纹身率 ════════════
  function initPrisonChart() {
    var el = document.getElementById('prisonChart');
    if (!el || typeof Chart === 'undefined') return;
    var data = D.PRISON_PREVALENCE || [];
    var labels = data.map(function (d) { return d.region; });
    var values = data.map(function (d) { return +(d.value * 100).toFixed(1); });
    var general = +(D.GENERAL_PREVALENCE.usAdults.value * 100).toFixed(0);
    var refLine = data.map(function () { return general; });

    new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '纹身率 (%)',
            data: values,
            backgroundColor: 'rgba(199,225,255,0.18)',
            borderColor: C.accent,
            borderWidth: 1, borderRadius: 0, barPercentage: 0.72, categoryPercentage: 0.85
          },
          {
            label: '普通人参考线',
            data: refLine,
            type: 'line',
            borderColor: C.dim,
            borderDash: [4, 4], borderWidth: 1,
            pointRadius: 0, fill: false, tension: 0
          }
        ]
      },
      options: chartOpts({ ySuffix: '%', legend: false })
    });
  }

  // ════════════ 图表 2：女性优势比 ════════════
  function initFemaleChart() {
    var el = document.getElementById('femaleChart');
    if (!el || typeof Chart === 'undefined') return;
    var f = D.FEMALE_STRATIFIED || {};
    var labels = ['被捕', '被定罪', '被监禁'];
    new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '男性',
            data: [f.male.arrest, f.male.convict, f.male.incarcerate],
            backgroundColor: C.male, borderColor: C.male,
            borderWidth: 1, borderRadius: 0
          },
          {
            label: '女性',
            data: [f.female.arrest, f.female.convict, f.female.incarcerate],
            backgroundColor: C.female, borderColor: C.female,
            borderWidth: 1, borderRadius: 0
          }
        ]
      },
      options: chartOpts({ ySuffix: '×', yMax: 3, legend: true })
    });
  }

  function chartOpts(opt) {
    opt = opt || {};
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: opt.legend ? {
          display: true, position: 'bottom', align: 'end',
          labels: {
            color: C.dim, font: { family: 'Noto Sans SC, sans-serif', size: 10 },
            boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true
          }
        } : { display: false },
        tooltip: {
          backgroundColor: 'rgba(14,14,16,0.96)',
          titleColor: C.ink, bodyColor: C.ink,
          borderColor: 'rgba(199,225,255,0.3)', borderWidth: 1, padding: 10,
          titleFont: { family: 'Noto Sans SC, sans-serif', size: 11 },
          bodyFont: { family: 'Cormorant Garamond, serif', size: 14 }
        }
      },
      scales: {
        x: {
          ticks: { color: C.dim, font: { family: 'Noto Sans SC, sans-serif', size: 10 }, maxRotation: 0, autoSkip: false },
          grid: { display: false, drawBorder: false }
        },
        y: {
          beginAtZero: true, max: opt.yMax || undefined,
          ticks: { color: C.dim, font: { family: 'Cormorant Garamond, serif', size: 11 }, callback: function (v) { return v + (opt.ySuffix || ''); } },
          grid: { color: C.grid, drawBorder: false, drawTicks: false }
        }
      },
      animation: { duration: 1100, easing: 'easeOutQuart' }
    };
  }

  // ════════════ 贝叶斯计算器 ════════════
  function initBayes() {
    var priorEl = document.getElementById('priorSlider');
    var likeliEl = document.getElementById('likelihoodSlider');
    var falseEl = document.getElementById('falseRateSlider');
    if (!priorEl || !likeliEl || !falseEl) return;

    var priorVal = document.getElementById('priorValue');
    var likeliVal = document.getElementById('likelihoodValue');
    var falseVal = document.getElementById('falseRateValue');
    var postPctEl = document.getElementById('bayesPostPct');

    function syncLabels() {
      priorVal.textContent = (+priorEl.value).toFixed(1) + '%';
      likeliVal.textContent = (+likeliEl.value).toFixed(1) + '%';
      falseVal.textContent = (+falseEl.value).toFixed(1) + '%';
    }

    function readParams() {
      return {
        prior: +priorEl.value / 100,
        likelihood: +likeliEl.value / 100,
        falseRate: +falseEl.value / 100
      };
    }

    function compute() {
      var p = readParams();
      var post = L.posterior(p.prior, p.likelihood, p.falseRate);
      var box = L.buildSandbox(p.prior, p.likelihood, p.falseRate);
      var postPct = post * 100;

      setBar('barLikeli', 'barLikeliValue', p.likelihood);
      setBar('barFalse', 'barFalseValue', p.falseRate);
      setBar('barPost', 'barPostValue', post);
      if (postPctEl) postPctEl.textContent = postPct.toFixed(2);

      var sb = document.getElementById('bayesSandbox');
      sb.innerHTML =
        '在 10 万人里，约 <b>' + box.criminal.toLocaleString() + '</b> 个真罪犯，' +
        box.innocent.toLocaleString() + ' 个良民。' +
        '罪犯中纹身 <b>' + box.tattooedCriminal.toLocaleString() + '</b> 人，' +
        '良民中纹身 ' + box.tattooedInnocent.toLocaleString() + ' 人。' +
        '所以纹身者共 <b>' + box.tattooedTotal.toLocaleString() + '</b> 人，其中真罪犯 ' +
        box.tattooedCriminal.toLocaleString() + ' 人。';

      var r = L.rateRisk(postPct);
      var verdict = document.getElementById('bayesVerdict');
      verdict.innerHTML = '印象有据，个体判断 <b>无据</b>：剩下 ' +
        (100 - postPct).toFixed(1) + '% 都是普通人。风险「' + r.label + '」。';
    }

    document.querySelectorAll('.slider-presets button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = document.getElementById(btn.getAttribute('data-target'));
        if (!t) return;
        t.value = btn.getAttribute('data-value');
        syncLabels();
        // 标记 active
        btn.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        compute();
      });
    });

    [priorEl, likeliEl, falseEl].forEach(function (el) {
      el.addEventListener('input', function () {
        syncLabels();
        // 滑块拖动时清掉 active
        var presets = el.parentElement.querySelectorAll('.slider-presets button');
        presets.forEach(function (b) { b.classList.remove('active'); });
        compute();
      });
    });

    document.getElementById('bayesCompute').addEventListener('click', compute);
    document.getElementById('bayesReset').addEventListener('click', function () {
      priorEl.value = DEF.prior * 100;
      likeliEl.value = DEF.likelihood * 100;
      falseEl.value = DEF.falseRate * 100;
      syncLabels();
      compute();
    });

    syncLabels();
    compute();
  }

  function setBar(barId, valId, p) {
    var bar = document.getElementById(barId);
    var val = document.getElementById(valId);
    if (bar) bar.style.width = Math.min(100, p * 100) + '%';
    if (val) val.textContent = (p * 100).toFixed(1) + '%';
  }

  // ════════════ 左导航 active 同步 ════════════
  function initTocActive() {
    var links = document.querySelectorAll('.rail-toc a');
    if (!links.length) return;
    var sections = [];
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var sec = document.getElementById(id);
      if (sec) sections.push({ el: sec, a: a });
    });
    if (!sections.length) return;

    function update() {
      var fromTop = window.scrollY + 120;
      var current = sections[0];
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].el.offsetTop <= fromTop) current = sections[i];
      }
      links.forEach(function (a) { a.classList.remove('active'); });
      if (current) current.a.classList.add('active');
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // ════════════ GSAP 滚动动效：极轻 ════════════
  function initReveal() {
    if (typeof gsap === 'undefined') return;
    if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

    var heroEls = document.querySelectorAll('.hero [data-reveal]');
    if (heroEls.length) {
      gsap.set(heroEls, { opacity: 0, y: 18 });
      gsap.to(heroEls, {
        opacity: 1, y: 0, duration: 1.0, stagger: 0.16, ease: 'power3.out', delay: 0.15
      });
    }

    var rest = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'))
      .filter(function (el) { return !el.closest('.hero'); });
    if (rest.length && typeof ScrollTrigger !== 'undefined') {
      gsap.set(rest, { opacity: 0, y: 22 });
      ScrollTrigger.batch(rest, {
        start: 'top 88%',
        onEnter: function (batch) {
          gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out', overwrite: true });
        },
        once: true
      });
    } else if (rest.length) {
      gsap.set(rest, { opacity: 1, y: 0 });
    }
  }

  // ════════════ 阅读进度条 ════════════
  function initReadProgress() {
    var bar = document.getElementById('readProgress');
    if (!bar) return;
    function update() {
      var h = document.documentElement;
      var scrolled = h.scrollTop || document.body.scrollTop;
      var total = h.scrollHeight - h.clientHeight;
      bar.style.width = (total > 0 ? (scrolled / total) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // ── KaTeX 渲染（先于 reveal）──
  function initKatex() {
    if (typeof katex === 'undefined') return;
    var nodes = document.querySelectorAll('[data-katex]');
    nodes.forEach(function (el) {
      try { katex.render(el.getAttribute('data-katex'), el, { throwOnError: false, displayMode: true }); }
      catch (e) { console.warn('katex render fail', e); }
    });
  }

  // ════════════ 数据来源（页面 references 区已硬编码脚注，仅供复制用）════════════
  function fillPlainText() {
    var ta = document.getElementById('plainText');
    if (!ta) return;
    ta.value = PLAIN_ARTICLE + '\n\n数据来源：\n' + (D.SOURCES || []).map(function (s, i) {
      return '[' + (i + 1) + '] ' + s.title + ' - ' + s.author + ' - ' + s.publisher + ' (' + s.year + '): ' + s.link;
    }).join('\n');
  }

  function initCopy() {
    var btn = document.getElementById('copyArticle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var ta = document.getElementById('plainText');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(ok, fail);
      } else { fail(); }
      function ok() { flash(btn, '已复制'); }
      function fail() {
        ta.hidden = false; ta.select();
        try { document.execCommand('copy'); flash(btn, '已复制'); } catch (e) { flash(btn, '复制失败，请手动选'); }
        ta.hidden = true;
      }
    });
  }

  function flash(btn, msg) {
    var old = btn.innerHTML;
    btn.innerHTML = msg;
    setTimeout(function () { btn.innerHTML = old; }, 1800);
  }

  // ── 纯文本回答稿（贴知乎用）──
  var PLAIN_ARTICLE = [
    '纹身是风险因素的可观测信号',
    '',
    '都 21 世纪了，为什么还有人认为纹身泡吧就是坏女孩？',
    '',
    '纹身和犯罪存在统计学相关。这个相关是相关，不是因果。本文用 12 项研究数据拆解这一点。',
    '',
    '监狱纹身率',
    '',
    '各地监狱的纹身率远高于普通人群：',
    '',
    '样本                    | 纹身率 | 来源',
    '伊朗男性囚犯（终身）   | 44.7%  | Jafari 2020',
    '伊朗女性囚犯（终身）   | 43.6%  | Jafari 2020',
    '印度 Khandwa 监狱       | 83.9%  | Kaithwas 2022',
    '中国 F 省未管所男犯     | 64%    | 成都未管所 2022',
    '中国 S 市涉罪未成年人   | 50.5%  | 成都未管所 2022',
    '中国成都未管所未成年犯 | 83%    | 成都未管所 2022',
    '',
    '美国普通成人纹身率为 32%（Pew 2023）。监狱数据的极差从 43.6% 到 83.9%，说明这一相关在不同法律体系、不同性别比例下都成立。',
    '',
    '国内数据更细：成都未管所 200 名未成年犯抽样中，86% 的首次纹身发生在 16 岁前。',
    '',
    '男性主导的数据不能外推到女性',
    '',
    '上述样本以男性为主。题目问的是"坏女孩"。把男性黑帮的纹身率直接套到女性，属于群体外推错误。',
    '',
    'Dzhansarayeva 2023 使用 Add Health 纵向数据（N=20,745），控制自我报告的犯罪/越轨行为、自控力、越轨同伴接触、人口学变量后，得到有纹身者的司法处理优势比（Odds Ratio）：',
    '',
    '            | 被捕   | 被定罪 | 被监禁',
    '男性        | ×2.50  | ×1.80  | ×2.00',
    '女性        | ×1.75  | ×1.68  | ×1.90',
    '',
    '女性的优势比低于男性，但仍然显著大于 1。这条线斜了。',
    '',
    '需要标注的是：作者将部分原因归于污名化机制——有纹身者更易被警察注意、被检方起诉、被法官从重处理。这意味着部分司法层面的差距反映的是系统偏差，而非犯罪率本身的差距。',
    '',
    '青少年与戒毒',
    '',
    '两组数据提供第二层证据：',
    '',
    '- 台湾 973 名少年羁押者：有纹身者的伤害罪比例 +13 个百分点、毒品罪 +9 个百分点、杀人罪 +9 个百分点。',
    '- 中国强制隔离戒毒所 955 例：男戒员纹身率 33.1%，女戒员 25.6%。',
    '',
    '两组数据共同指向一个特征：未成年、毒品、纹身三者高度共现。',
    '',
    '贝叶斯反演',
    '',
    '前三节给出的是 P(纹身|犯罪)——罪犯中有纹身的比例。题目要的是 P(犯罪|纹身)——纹身者中罪犯的比例。这是两个完全不同的条件概率。',
    '',
    '由贝叶斯公式：',
    '',
    'P(犯罪|纹身) = P(纹身|犯罪) × P(犯罪) / P(纹身)',
    '',
    '代入保守参数：',
    '- 先验 P(犯罪) = 1%（普通人中真正犯罪的基数）',
    '- 似然 P(纹身|犯罪) = 44.7%（伊朗男性囚犯终身纹身率，Jafari 2020 原文 Table 1）',
    '- 边际 P(纹身) ≈ 0.32 × 0.99 + 0.447 × 0.01 ≈ 0.3213',
    '',
    '得到：',
    'P(犯罪|纹身) = (0.447 × 0.01) / 0.3213 ≈ 1.39%',
    '',
    '即一个随机抽到的纹身者，真正犯罪的概率约为 1.4%。',
    '',
    '把罪犯纹身率拉到成都未管所水平（83%）：',
    'P(犯罪|纹身) = (0.83 × 0.01) / (0.83 × 0.01 + 0.32 × 0.99) ≈ 2.55%',
    '',
    '仍然在 3% 以内。',
    '',
    '原因：P(犯罪) 本身极低。无论 P(纹身|犯罪) 多高，被它放大的先验仍然是小数。这是基础概率的力量。',
    '',
    '相关性不来自因果',
    '',
    '如果纹身不导致犯罪，那这个相关由什么承载？',
    '',
    '共同人格特质：Jennings, Fox & Farrington 2014 使用 Cambridge Study in Delinquent Development 411 名男性的纵向数据，做倾向评分匹配后，纹身与犯罪的相关消失（spurious）。纹身与犯罪共享一组人格与发展风险因子（高冲动性、低宜人性、早期行为问题），纹身本身不增加也不减少犯罪概率。',
    '',
    '共同社会位置：Pew 2023 数据显示纹身与收入反相关（低收入 43% vs 高收入 21%）。贫困同时推高纹身与犯罪。帮派、街头文化用纹身标记归属，归属缺失的人两端都倾向。',
    '',
    '共同生命阶段：成都未管所数据中 86% 的首次纹身发生在 16 岁前。纹身在这里对应的是一段特定的发展窗口，而非终身的稳定特征。',
    '',
    '回到题目',
    '',
    '"纹身泡吧=坏女孩"这个印象，有数据基础——纹身在统计学上关联了更高的司法处理概率。这个关联值得作为风险信号保留。',
    '',
    '这个印象没有个体推断的资格——一个纹身的女孩，她真正犯罪的概率，在合理参数下不超过 3%。',
    '',
    '区分这两点，是数据给出的方法。'
  ].join('\n');

})();
