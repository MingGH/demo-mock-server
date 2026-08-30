/**
 * app.js — YAML 地雷阵 UI 层
 * 依赖：engine.js（YamlMinefieldEngine）、js-yaml、Chart.js、GSAP（CDN）
 * 三个模块：
 *   1) 排雷挑战：8 题计分制，每类别保底一题，答完出战绩与图表
 *   2) 解析器对照台：同一段 YAML，浏览器 js-yaml vs 服务器 SnakeYAML 逐键对照
 *   3) 防身清单：静态速查卡片
 */
(function () {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';
  var PARSE_URL = API_BASE + '/yaml-court/parse';

  var eng = window.YamlMinefieldEngine;

  // ── 游戏状态 ──
  var state = {
    phase: 'intro',        // intro | playing | feedback | result
    questions: [],
    idx: 0,
    score: 0,
    streak: 0,
    correct: 0,
    answers: [],           // {category, correct}
    timer: null,
    timeLeft: 0,
    lockInput: false
  };

  var els = {};

  // ── DOM 缓存 ──
  function cacheDom() {
    ['view-intro', 'view-quiz', 'view-result', 'view-court'].forEach(function (id) {
      els[id] = document.getElementById(id);
    });
    els.startBtn = document.getElementById('btn-start');
    els.restartBtn = document.getElementById('btn-restart');
    els.againBtn = document.getElementById('btn-again');

    // 答题区
    els.qProgress = document.getElementById('q-progress');
    els.qIndex = document.getElementById('q-index');
    els.qScore = document.getElementById('q-score');
    els.qCategory = document.getElementById('q-category');
    els.qSeverity = document.getElementById('q-severity');
    els.qYaml = document.getElementById('q-yaml');
    els.qQuestion = document.getElementById('q-question');
    els.qOptions = document.getElementById('q-options');
    els.qTimer = document.getElementById('q-timer');
    els.timerBar = document.getElementById('timer-bar');
    els.qExplain = document.getElementById('q-explain');
    els.explainText = document.getElementById('explain-text');
    els.nextBtn = document.getElementById('btn-next');

    // 结果区
    els.resTitle = document.getElementById('res-title');
    els.resComment = document.getElementById('res-comment');
    els.resScore = document.getElementById('res-score');
    els.resScoreLabel = document.getElementById('res-score-label');
    els.resCorrect = document.getElementById('res-correct');
    els.resChart = document.getElementById('res-chart');
    els.resList = document.getElementById('res-list');
    els.btnShare = document.getElementById('btn-share');

    // 对照台
    els.courtInput = document.getElementById('court-input');
    els.courtRun = document.getElementById('btn-court-run');
    els.courtStatus = document.getElementById('court-status');
    els.courtVerdict = document.getElementById('court-verdict');
    els.courtTable = document.getElementById('court-table');
    els.courtFrontTag = document.getElementById('court-front-tag');
    els.courtBackTag = document.getElementById('court-back-tag');
    els.presetButtons = document.querySelectorAll('.preset-btn');
  }

  // ── 视图切换 ──
  // 只切换游戏三态（intro / quiz / result）；解析器对照台常驻页面底部，
  // 不参与切换，保证用户任何时候都能往下滚到对照台玩。
  function showView(name) {
    ['view-intro', 'view-quiz', 'view-result'].forEach(function (id) {
      els[id].style.display = (id === 'view-' + name) ? 'block' : 'none';
    });
    if (window.gsap) {
      var v = els['view-' + name];
      if (v) {
        gsap.fromTo(v, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 排雷挑战 ──
  function startGame() {
    state.phase = 'playing';
    state.questions = eng.pickQuestions(eng.QUESTION_POOL, eng.QUESTIONS_PER_RUN);
    state.idx = 0;
    state.score = 0;
    state.streak = 0;
    state.correct = 0;
    state.answers = [];
    showView('quiz');
    renderQuestion();
  }

  function severityLabel(sev) {
    return sev >= 5 ? '致命' : sev >= 4 ? '高危' : sev >= 3 ? '中危' : '轻伤';
  }

  function renderQuestion() {
    var q = state.questions[state.idx];
    els.qIndex.textContent = (state.idx + 1) + ' / ' + state.questions.length;
    els.qScore.textContent = '得分 ' + state.score;
    els.qCategory.textContent = eng.CATEGORY_LABELS[q.category] || q.category;
    els.qSeverity.textContent = '';
    els.qSeverity.className = 'severity sev-' + q.severity;
    var bombIcon = document.createElement('i');
    bombIcon.className = 'ti ti-bomb';
    bombIcon.style.marginRight = '5px';
    els.qSeverity.appendChild(bombIcon);
    els.qSeverity.appendChild(document.createTextNode(severityLabel(q.severity)));
    els.qYaml.textContent = q.yaml;
    els.qQuestion.textContent = q.question;

    // 选项
    els.qOptions.innerHTML = '';
    q.options.forEach(function (opt, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.dataset.idx = String(i);
      btn.addEventListener('click', function () { chooseAnswer(i, btn); });
      els.qOptions.appendChild(btn);
    });

    // 进度条
    els.qProgress.style.width = '0%';
    els.qExplain.style.display = 'none';
    els.nextBtn.style.display = 'none';
    state.lockInput = false;

    // 计时
    clearInterval(state.timer);
    state.timeLeft = eng.TIME_LIMIT;
    els.qTimer.textContent = state.timeLeft + 's';
    els.timerBar.style.width = '100%';
    state.timer = setInterval(tick, 1000);
    updateTimerBar();
  }

  function tick() {
    state.timeLeft -= 1;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      clearInterval(state.timer);
      chooseAnswer(-1, null); // 超时视为答错
      return;
    }
    els.qTimer.textContent = state.timeLeft + 's';
    updateTimerBar();
  }

  function updateTimerBar() {
    var pct = (state.timeLeft / eng.TIME_LIMIT) * 100;
    els.timerBar.style.width = pct + '%';
    els.timerBar.style.background = pct > 50 ? '#81c784' : pct > 25 ? '#ffd700' : '#ff6b6b';
  }

  function chooseAnswer(idx, btn) {
    if (state.lockInput) {
      return;
    }
    state.lockInput = true;
    clearInterval(state.timer);

    var q = state.questions[state.idx];
    var isCorrect = idx === q.answer;
    var buttons = els.qOptions.querySelectorAll('.option-btn');

    buttons.forEach(function (b) {
      var i = parseInt(b.dataset.idx, 10);
      if (i === q.answer) {
        b.classList.add('correct');
      }
      if (idx !== -1 && i === idx && !isCorrect) {
        b.classList.add('wrong');
      }
      b.disabled = true;
    });

    if (isCorrect) {
      state.streak += 1;
      state.correct += 1;
    } else {
      state.streak = 0;
    }
    var sc = eng.scoreAnswer(isCorrect, state.timeLeft, state.streak);
    state.score += sc.gained;
    state.answers.push({ category: q.category, correct: isCorrect });

    // 得分反馈
    els.qScore.textContent = '得分 ' + state.score;
    if (window.gsap && isCorrect) {
      gsap.fromTo('#q-score', { scale: 1.4 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
    }

    // 解释
    els.explainText.textContent = q.explain;
    els.qExplain.style.display = 'block';
    var last = state.idx === state.questions.length - 1;
    els.nextBtn.style.display = 'inline-flex';
    els.nextBtn.textContent = last ? '看战绩' : '下一颗雷';
  }

  function nextQuestion() {
    state.idx += 1;
    if (state.idx >= state.questions.length) {
      showResult();
      return;
    }
    renderQuestion();
  }

  // ── 结果 ──
  function showResult() {
    state.phase = 'result';
    var rank = eng.rankTitle(state.correct, state.questions.length);
    els.resTitle.textContent = rank.title;
    els.resComment.textContent = rank.comment;
    els.resScore.textContent = state.score;
    els.resScoreLabel.textContent = '8 题总分（满分 140×8 + 连对加成）';
    els.resCorrect.textContent = state.correct + ' / ' + state.questions.length;
    renderResultChart();
    renderResultList();
    showView('result');
  }

  function renderResultChart() {
    if (!window.Chart || !els.resChart) {
      return;
    }
    var stats = eng.categoryStats(state.answers);
    if (window.chartInstance) {
      window.chartInstance.destroy();
    }
    window.chartInstance = new Chart(els.resChart, {
      type: 'bar',
      data: {
        labels: stats.map(function (s) { return s.label; }),
        datasets: [{
          label: '答对',
          data: stats.map(function (s) { return s.correct; }),
          backgroundColor: '#81c784'
        }, {
          label: '答错',
          data: stats.map(function (s) { return s.total - s.correct; }),
          backgroundColor: '#ff6b6b'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#ccc' } }
        },
        scales: {
          x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: '#aaa', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  function renderResultList() {
    els.resList.innerHTML = '';
    state.questions.forEach(function (q, i) {
      var ok = state.answers[i] && state.answers[i].correct;
      var row = document.createElement('div');
      row.className = 'res-row ' + (ok ? 'ok' : 'bad');
      row.innerHTML =
        '<span class="res-row-mark">' + (ok ? '✓' : '✗') + '</span>' +
        '<span class="res-row-q">' + q.yaml.replace(/\n/g, ' ↩ ') + '</span>' +
        '<span class="res-row-cat">' + (eng.CATEGORY_LABELS[q.category] || '') + '</span>';
      row.title = q.explain;
      els.resList.appendChild(row);
    });
  }

  // ── 解析器对照台 ──
  var courtTimer = null;

  function runCourt() {
    if (courtTimer) {
      clearTimeout(courtTimer);
    }
    courtTimer = setTimeout(function () { doRunCourt(); }, 350);
  }

  function doRunCourt() {
    var text = els.courtInput.value;
    els.courtStatus.textContent = '解析中…';
    els.courtStatus.className = 'court-status';

    // 浏览器端 js-yaml
    var front = { ok: true, error: null, rootKind: null, entries: [] };
    if (window.jsyaml) {
      try {
        var parsed = window.jsyaml.load(text);
        var norm = eng.toEntries(parsed);
        front = { ok: true, error: null, rootKind: norm.rootKind, entries: norm.entries };
      } catch (e) {
        front = { ok: false, error: e.message || 'parse error', rootKind: null, entries: [] };
      }
    } else {
      front = { ok: false, error: 'js-yaml 未加载（CDN 失败）', rootKind: null, entries: [] };
    }

    // 服务器 SnakeYAML
    fetch(PARSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: text })
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.json().then(function (j) { throw new Error(j.message || ('HTTP ' + resp.status)); });
      }
      return resp.json();
    }).then(function (envelope) {
      if (envelope.status !== 200 || !envelope.data) {
        throw new Error('响应异常');
      }
      renderCourt(front, envelope.data);
    }).catch(function (err) {
      // 端点未部署 / 网络失败：不是 YAML 解析错误，走「服务未就绪」灰色降级
      renderCourt(front, { ok: false, unavailable: true, error: err.message || '服务器解析暂不可用' });
    });
  }

  function renderCourt(front, back) {
    // 服务器侧未就绪（端点未部署 / 断网）：灰色降级，仅展示浏览器侧结果
    if (back && back.unavailable) {
      els.courtVerdict.textContent = '服务器 SnakeYAML 暂不可用（后端未部署或网络异常），当前仅展示浏览器侧解析。';
      els.courtVerdict.className = 'court-verdict neutral';
      els.courtStatus.textContent = '';
      els.courtFrontTag.textContent = '浏览器 js-yaml 4（YAML 1.2）';
      els.courtBackTag.textContent = '服务器 SnakeYAML 2.x（YAML 1.1）';
      if (front.ok) {
        var onlyHtml = front.entries.map(function (e) {
          return '<tr>' +
            '<td class="court-key">' + escapeHtml(e.key) + '</td>' +
            '<td class="court-front">' + e.type + ' · ' + escapeHtml(e.display) + '</td>' +
            '<td class="court-back court-dim">—</td>' +
            '</tr>';
        }).join('');
        els.courtTable.innerHTML = onlyHtml;
      } else {
        els.courtTable.innerHTML = '<tr><td colspan="3" class="court-empty">浏览器解析失败：' + escapeHtml(front.error || '') + '</td></tr>';
      }
      return;
    }

    var diff = eng.diffEntries(front, back);

    // 顶部结论条
    var verdictText = '';
    var verdictClass = 'agree';
    if (diff.verdict === 'clash') {
      verdictText = '两台解析器打起来了：' + diff.clashCount + ' 个键不一致';
      verdictClass = 'clash';
    } else if (diff.verdict === 'agree') {
      verdictText = '两台解析器达成一致，本次没有踩雷';
      verdictClass = 'agree';
    } else if (diff.verdict === 'front-error') {
      verdictText = '浏览器 js-yaml 报错：' + (front.error || '');
      verdictClass = 'error';
    } else if (diff.verdict === 'back-error') {
      verdictText = '服务器 SnakeYAML 报错：' + (back.error || '');
      verdictClass = 'error';
    } else {
      verdictText = '两边都炸了：浏览器和服务器都对这段 YAML 说 no';
      verdictClass = 'error';
    }
    els.courtVerdict.textContent = verdictText;
    els.courtVerdict.className = 'court-verdict ' + verdictClass;
    els.courtStatus.textContent = '';
    els.courtFrontTag.textContent = '浏览器 js-yaml 4（YAML 1.2）';
    els.courtBackTag.textContent = '服务器 SnakeYAML 2.x（YAML 1.1）';

    // 表格
    if (diff.rows.length === 0) {
      els.courtTable.innerHTML = '<tr><td colspan="3" class="court-empty">没有可对照的键值。</td></tr>';
      return;
    }
    var html = diff.rows.map(function (r) {
      var frontCell = r.front ? (r.front.type + ' · ' + escapeHtml(r.front.display)) : '—';
      var backCell = r.back ? (r.back.type + ' · ' + escapeHtml(r.back.display)) : '—';
      var cls = r.same ? '' : 'cell-clash';
      return '<tr>' +
        '<td class="court-key">' + escapeHtml(r.key) + '</td>' +
        '<td class="court-front ' + cls + '">' + frontCell + '</td>' +
        '<td class="court-back ' + cls + '">' + backCell + '</td>' +
        '</tr>';
    }).join('');
    els.courtTable.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 埋点 ──
  function track(name, props) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(name, props || {});
      }
    } catch (e) { /* 埋点失败不影响主流程 */ }
  }

  // ── 事件绑定 ──
  function bindEvents() {
    els.startBtn.addEventListener('click', function () {
      track('quiz_start');
      startGame();
    });
    els.restartBtn.addEventListener('click', startGame);
    els.againBtn.addEventListener('click', function () {
      showView('intro');
    });
    els.nextBtn.addEventListener('click', nextQuestion);
    els.btnShare.addEventListener('click', function () {
      var stat = { correct: state.correct, total: state.questions.length, score: state.score, title: els.resTitle.textContent };
      var text = eng.buildShareText(stat);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          els.btnShare.textContent = '已复制，去发朋友圈';
          setTimeout(function () { els.btnShare.textContent = '复制战绩分享'; }, 1800);
        });
      } else {
        prompt('复制以下战绩：', text);
      }
      track('share_click', { score: state.score, correct: state.correct });
    });

    els.courtRun.addEventListener('click', doRunCourt);
    els.courtInput.addEventListener('input', runCourt);
    els.presetButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        els.courtInput.value = btn.dataset.yaml;
        doRunCourt();
      });
    });

    // pagehide 兜底：记录离开
    window.addEventListener('pagehide', function () {
      if (state.phase === 'playing' || state.phase === 'feedback') {
        track('quiz_exit', { progress: state.idx, score: state.score });
      }
    });
  }

  // ── 初始化 ──
  function init() {
    cacheDom();
    bindEvents();
    // 对照台默认示例：先跑一次给用户看
    els.courtInput.value = document.querySelector('.preset-btn').dataset.yaml;
    doRunCourt();
    track('session_start', {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
