(function () {
  'use strict';

  var L = window.IQMatrixLogic;
  var QUESTION_TIME_SECONDS = 30;
  var NB_FLASH_MS = 800;
  var NB_GAP_MS = 500;
  var NB_TRIALS = 20;
  var API_BASE = 'https://numfeel-api.996.ninja';
  var TURNSTILE_SITE_KEY = '0x4AAAAAADsMioJW-WyC3Fwm';

  if (!L) {
    throw new Error('IQMatrixLogic failed to load');
  }

  var state = {
    mode: 'idle',
    fullChallenge: false,
    testSet: null,
    qIdx: 0,
    qStartTime: 0,
    questionAnswered: false,
    matrixRaf: null,
    transitionTimer: null,
    results: [],
    nbSeq: null,
    nbStep: 0,
    nbResponses: [],
    nbTimers: [],
    nbAccepting: false,
    nbAcc2: 0,
    nbAcc3: 0,
    locked: false,
    scoreData: null,
    chart: null,
    turnstileId: null,
    turnstileTimer: null,
    turnstileAttempts: 0,
    lastSubmittedName: null,
    leaderboardRequest: 0
  };

  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function setStatus(kind, message) {
    var el = $('lbStatus');
    el.className = 'lb-status' + (kind ? ' ' + kind : '');
    el.textContent = message || '';
  }

  function clearActivityTimers() {
    if (state.matrixRaf !== null) {
      cancelAnimationFrame(state.matrixRaf);
      state.matrixRaf = null;
    }
    if (state.transitionTimer !== null) {
      clearTimeout(state.transitionTimer);
      state.transitionTimer = null;
    }
    state.nbTimers.forEach(function (timer) { clearTimeout(timer); });
    state.nbTimers = [];
    state.nbAccepting = false;
  }

  function scheduleTransition(fn, delay) {
    if (state.transitionTimer !== null) clearTimeout(state.transitionTimer);
    state.transitionTimer = setTimeout(function () {
      state.transitionTimer = null;
      fn();
    }, delay);
  }

  function scheduleNBack(fn, delay) {
    var timer = setTimeout(fn, delay);
    state.nbTimers.push(timer);
    return timer;
  }

  function resetForMenu() {
    clearActivityTimers();
    state.mode = 'idle';
    state.fullChallenge = false;
    state.locked = false;
    state.scoreData = null;
    state.results = [];
    state.nbAcc2 = 0;
    state.nbAcc3 = 0;
    hide($('matrixSection'));
    hide($('nbackSection'));
    hide($('resultSection'));
    hide($('lbSubmitPanel'));
    show($('lbLocked'));
    show($('heroSection'));
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startMatrix() {
    clearActivityTimers();
    var rng = L.mulberry32((Date.now() ^ Math.floor(Math.random() * 1000000000)) >>> 0);
    state.testSet = L.generateTestSet(rng);
    state.qIdx = 0;
    state.results = [];
    state.fullChallenge = true;
    state.mode = 'matrix';
    state.locked = true;
    hide($('heroSection'));
    hide($('nbackSection'));
    hide($('resultSection'));
    show($('matrixSection'));
    renderQuestion();
  }

  function renderQuestion() {
    var q = state.testSet[state.qIdx];
    var grid = $('matrixGrid');
    var options = $('optionsGrid');
    grid.innerHTML = '';
    options.innerHTML = '';
    state.questionAnswered = false;

    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        var cell = document.createElement('div');
        cell.className = 'matrix-cell';
        if (r === 2 && c === 2) {
          cell.className += ' empty';
          cell.innerHTML = '<i class="ti ti-help"></i>';
        } else {
          cell.innerHTML = L.renderCellSVG(q.grid[r][c]);
        }
        grid.appendChild(cell);
      }
    }

    q.options.forEach(function (option, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'option';
      button.setAttribute('aria-label', '选项 ' + (index + 1));
      button.innerHTML = L.renderCellSVG(option);
      button.addEventListener('click', function () { answerMatrix(index, button); });
      options.appendChild(button);
    });

    $('qIndex').textContent = String(state.qIdx + 1);
    var tag = $('qLevelTag');
    tag.textContent = L.LEVEL_NAMES[q.level];
    tag.className = 'tag ' + (q.level === 1 ? 'tag-easy' : q.level === 2 ? 'tag-medium' : 'tag-hard');
    $('feedback').innerHTML = '';
    startMatrixTimer();
  }

  function startMatrixTimer() {
    state.qStartTime = Date.now();
    function tick() {
      if (state.questionAnswered || state.mode !== 'matrix') return;
      var elapsed = (Date.now() - state.qStartTime) / 1000;
      var remaining = QUESTION_TIME_SECONDS - elapsed;
      $('qTimer').textContent = Math.min(elapsed, QUESTION_TIME_SECONDS).toFixed(1);
      $('timerFill').style.width = Math.max(0, remaining / QUESTION_TIME_SECONDS * 100) + '%';
      $('timerLabel').textContent = '剩余 ' + Math.max(0, Math.ceil(remaining)) + 's';
      if (remaining <= 0) {
        timeoutMatrix();
        return;
      }
      state.matrixRaf = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopMatrixTimer() {
    if (state.matrixRaf !== null) {
      cancelAnimationFrame(state.matrixRaf);
      state.matrixRaf = null;
    }
  }

  function timeoutMatrix() {
    if (state.questionAnswered) return;
    state.questionAnswered = true;
    stopMatrixTimer();
    state.results.push({ correct: false, reactionTime: QUESTION_TIME_SECONDS * 1000 });
    revealCorrect();
    disableOptions();
    showMatrixFeedback(false, true);
    scheduleTransition(nextQuestion, 1200);
  }

  function answerMatrix(index, selectedElement) {
    if (state.mode !== 'matrix' || state.questionAnswered) return;
    state.questionAnswered = true;
    stopMatrixTimer();
    var q = state.testSet[state.qIdx];
    var correct = cellsEqual(q.options[index], q.answer);
    state.results.push({ correct: correct, reactionTime: Math.min(Date.now() - state.qStartTime, QUESTION_TIME_SECONDS * 1000) });
    disableOptions();
    selectedElement.classList.add(correct ? 'selected-correct' : 'selected-wrong');
    if (!correct) revealCorrect();
    $('matrixGrid').children[8].classList.add(correct ? 'flash-correct' : 'flash-wrong');
    showMatrixFeedback(correct, false);
    scheduleTransition(nextQuestion, 1100);
  }

  function cellsEqual(a, b) {
    return L.ATTR_KEYS.every(function (key) { return a[key] === b[key]; });
  }

  function disableOptions() {
    Array.prototype.forEach.call($('optionsGrid').children, function (element) {
      element.classList.add('disabled');
      element.disabled = true;
    });
  }

  function revealCorrect() {
    var q = state.testSet[state.qIdx];
    Array.prototype.forEach.call($('optionsGrid').children, function (element, index) {
      if (cellsEqual(q.options[index], q.answer)) element.classList.add('reveal-answer');
    });
  }

  function showMatrixFeedback(correct, timedOut) {
    var explanation = state.testSet[state.qIdx].explanation;
    $('feedback').innerHTML = correct
      ? '<div class="fb-correct"><i class="ti ti-circle-check"></i> 正确</div><div class="fb-explain">规则：' + explanation + '</div>'
      : '<div class="fb-wrong"><i class="ti ti-circle-x"></i> ' + (timedOut ? '超时，计错' : '答错') + '</div><div class="fb-explain">规则：' + explanation + '</div>';
  }

  function nextQuestion() {
    state.qIdx++;
    if (state.qIdx >= state.testSet.length) {
      state.mode = 'nback';
      hide($('matrixSection'));
      show($('nbackSection'));
      startNBack(2);
    } else {
      renderQuestion();
    }
  }

  function startNbackOnly() {
    clearActivityTimers();
    state.mode = 'nback';
    state.fullChallenge = false;
    state.locked = true;
    state.results = [];
    hide($('heroSection'));
    hide($('matrixSection'));
    hide($('resultSection'));
    show($('nbackSection'));
    startNBack(2);
  }

  function startNBack(n) {
    clearActivityTimers();
    var rng = L.mulberry32((Date.now() ^ (n * 7919)) >>> 0);
    state.nbSeq = L.generateNBackSequence(n, n + NB_TRIALS, rng);
    state.nbStep = 0;
    state.nbResponses = [];
    $('nbLevelTag').textContent = n + '-back 阶段';
    $('nbTotal').textContent = String(NB_TRIALS);
    $('nbProgress').textContent = '0';
    $('nbAcc').textContent = '--';
    $('nbSameBtn').disabled = true;
    $('nbDiffBtn').disabled = true;
    $('nbFeedback').innerHTML = '<div class="fb-explain"><p class="nb-ready-title">' + n + '-back 测试</p>' +
      '<p class="nb-ready-copy">判断方块是否与 <strong>' + n + ' 步前</strong>处于同一位置</p>' +
      '<button class="btn btn-primary" id="nbReadyBtn">准备好了，开始</button></div>';
    $('nbReadyBtn').addEventListener('click', function () {
      $('nbFeedback').innerHTML = '';
      runNBackStep();
    }, { once: true });
  }

  function runNBackStep() {
    if (state.mode !== 'nback') return;
    if (state.nbStep >= state.nbSeq.positions.length) {
      finishNBackStage();
      return;
    }

    state.nbTimers = [];
    state.nbAccepting = false;
    var step = state.nbStep;
    var position = state.nbSeq.positions[step];
    var cells = $('nbackGrid').children;
    Array.prototype.forEach.call(cells, function (cell) { cell.classList.remove('active'); });
    cells[position - 1].classList.add('active');
    $('nbSameBtn').disabled = true;
    $('nbDiffBtn').disabled = true;

    if (step < state.nbSeq.n) {
      $('nbFeedback').innerHTML = '<div class="fb-explain">记住位置（热身 ' + (step + 1) + '/' + state.nbSeq.n + '）</div>';
      scheduleNBack(function () { cells[position - 1].classList.remove('active'); }, NB_FLASH_MS);
      scheduleNBack(function () {
        state.nbStep++;
        $('nbFeedback').innerHTML = '';
        runNBackStep();
      }, NB_FLASH_MS + NB_GAP_MS);
      return;
    }

    $('nbFeedback').innerHTML = '<div class="fb-explain">记住当前位置…</div>';
    scheduleNBack(function () {
      if (state.mode !== 'nback' || step !== state.nbStep) return;
      cells[position - 1].classList.remove('active');
      state.nbAccepting = true;
      $('nbSameBtn').disabled = false;
      $('nbDiffBtn').disabled = false;
      $('nbFeedback').innerHTML = '<div class="fb-explain">是否与 ' + state.nbSeq.n + ' 步前相同？作答后进入下一题</div>';
    }, NB_FLASH_MS);
  }

  function handleNBackResponse(saidSame) {
    if (!state.nbAccepting || state.mode !== 'nback') return;
    state.nbAccepting = false;
    var step = state.nbStep;
    state.nbResponses[step] = saidSame;
    $('nbSameBtn').disabled = true;
    $('nbDiffBtn').disabled = true;
    var correct = saidSame === state.nbSeq.matches[step];
    $('nbFeedback').innerHTML = '<div class="fb-explain ' + (correct ? 'v-green' : 'fb-wrong') + '">' +
      (correct ? '正确' : '错误，正确答案是「' + (state.nbSeq.matches[step] ? '相同' : '不同') + '」') + '</div>';
    updateNBackProgress();
    state.nbStep++;
    scheduleNBack(function () {
      $('nbFeedback').innerHTML = '';
      runNBackStep();
    }, NB_GAP_MS);
  }

  function updateNBackProgress() {
    var answered = Math.max(0, state.nbStep - state.nbSeq.n + 1);
    $('nbProgress').textContent = String(Math.min(answered, NB_TRIALS));
    var score = L.scoreNBack(state.nbSeq, state.nbResponses);
    $('nbAcc').textContent = score.total ? Math.round(score.accuracy * 100) + '%' : '--';
  }

  function finishNBackStage() {
    var score = L.scoreNBack(state.nbSeq, state.nbResponses);
    if (state.nbSeq.n === 2) {
      state.nbAcc2 = score.accuracy;
      $('nbFeedback').innerHTML = '<div class="fb-correct">2-back 完成，正确率 ' + Math.round(score.accuracy * 100) + '%</div>';
      scheduleTransition(function () { startNBack(3); }, 1200);
    } else {
      state.nbAcc3 = score.accuracy;
      $('nbFeedback').innerHTML = '<div class="fb-correct">3-back 完成，正确率 ' + Math.round(score.accuracy * 100) + '%</div>';
      scheduleTransition(showResults, 900);
    }
  }

  function showResults() {
    clearActivityTimers();
    state.mode = 'results';
    state.locked = false;
    hide($('nbackSection'));
    show($('resultSection'));
    var wmAccuracy = (state.nbAcc2 + state.nbAcc3) / 2;
    $('rWM').textContent = Math.round(wmAccuracy * 100) + '%';
    $('iWM').textContent = '2-back ' + Math.round(state.nbAcc2 * 100) + '% · 3-back ' + Math.round(state.nbAcc3 * 100) + '%';

    if (state.fullChallenge && state.results.length === 9) {
      var matrixScore = L.computeMatrixScore(state.results);
      var overall = L.computeOverallScore(matrixScore, wmAccuracy);
      state.scoreData = { matrixScore: matrixScore, wmAccuracy: wmAccuracy, overall: overall };
      $('rMatrix').textContent = Math.round(matrixScore.accuracy * 100) + '%';
      $('rRT').textContent = matrixScore.correct ? (matrixScore.avgCorrectRT / 1000).toFixed(1) + 's' : '--';
      $('iMatrix').textContent = matrixScore.correct + ' / ' + matrixScore.total + ' 题正确';
      $('iOverall').textContent = '综合分 ' + overall.score + ' / 100';
      $('rOverall').textContent = String(overall.score);
      show($('overallBox'));
      show($('chartWrap'));
      show($('lbSubmitPanel'));
      hide($('lbLocked'));
      drawResultChart(overall.components);
      renderTurnstile();
    } else {
      state.scoreData = null;
      $('rMatrix').textContent = '--';
      $('rRT').textContent = '--';
      $('iMatrix').textContent = '本次未进行矩阵推理';
      $('iOverall').textContent = '仅完整挑战生成综合分';
      hide($('overallBox'));
      hide($('chartWrap'));
      hide($('lbSubmitPanel'));
      show($('lbLocked'));
    }
    $('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function loadChartJs() {
    if (window.Chart) return Promise.resolve(window.Chart);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timeout = setTimeout(function () { reject(new Error('Chart.js load timeout')); }, 10000);
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = function () { clearTimeout(timeout); resolve(window.Chart); };
      script.onerror = function () { clearTimeout(timeout); reject(new Error('Chart.js load failed')); };
      document.head.appendChild(script);
    });
  }

  function drawResultChart(components) {
    loadChartJs().then(function (Chart) {
      if (state.chart) state.chart.destroy();
      state.chart = new Chart($('resultChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['矩阵正确率', '工作记忆', '速度有效分'],
          datasets: [{
            label: '分项得分',
            data: [components.matrix, components.workingMemory, components.effectiveSpeed],
            backgroundColor: ['rgba(251,191,36,.65)', 'rgba(129,199,132,.65)', 'rgba(144,202,249,.65)'],
            borderColor: ['#fbbf24', '#81c784', '#90caf9'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: '综合分的三个组成部分', color: '#cfcfcf' } },
          scales: {
            x: { ticks: { color: '#aaa' }, grid: { display: false } },
            y: { min: 0, max: 100, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,.06)' } }
          }
        }
      });
    }).catch(function () {
      hide($('chartWrap'));
      $('iOverall').textContent += '（图表资源加载失败）';
    });
  }

  function shareResult() {
    var wm = Math.round(((state.nbAcc2 + state.nbAcc3) / 2) * 100);
    var text;
    if (state.scoreData) {
      text = '矩阵推理与工作记忆挑战：矩阵正确率 ' + Math.round(state.scoreData.matrixScore.accuracy * 100) +
        '%，工作记忆 ' + wm + '%，综合分 ' + state.scoreData.overall.score + '/100。';
    } else {
      text = '工作记忆挑战：2-back ' + Math.round(state.nbAcc2 * 100) + '%，3-back ' + Math.round(state.nbAcc3 * 100) + '%。';
    }
    text += ' 来试试：https://numfeel.996.ninja/pages/iq-matrix-test/';
    copyText(text);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { alert('结果已复制到剪贴板'); }, function () { fallbackCopy(text); });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      alert('结果已复制');
    } catch (error) {
      prompt('请手动复制', text);
    }
    document.body.removeChild(textarea);
  }

  function renderTurnstile() {
    if (!state.scoreData || state.turnstileId !== null) return;
    if (typeof window.turnstile === 'undefined') {
      state.turnstileAttempts++;
      if (state.turnstileAttempts >= 30) {
        setStatus('error', '人机验证加载失败，请检查网络后刷新页面');
        return;
      }
      state.turnstileTimer = setTimeout(renderTurnstile, 500);
      return;
    }
    state.turnstileId = window.turnstile.render($('turnstileWidget'), {
      sitekey: TURNSTILE_SITE_KEY,
      action: 'iq-matrix-submit',
      theme: 'dark',
      size: 'flexible',
      'error-callback': function () { setStatus('error', '人机验证暂时不可用，请稍后重试'); }
    });
  }

  function getTurnstileToken() {
    if (typeof window.turnstile === 'undefined' || state.turnstileId === null) return '';
    return window.turnstile.getResponse(state.turnstileId) || '';
  }

  function resetTurnstile() {
    if (state.turnstileId !== null && typeof window.turnstile !== 'undefined') {
      window.turnstile.reset(state.turnstileId);
    }
  }

  function requestJson(url, options, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var requestOptions = options || {};
    if (controller) requestOptions.signal = controller.signal;
    var timeout = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs || 10000);
    return fetch(url, requestOptions).then(function (response) {
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') === -1) {
        var typeError = new Error('服务器返回了非 JSON 响应');
        typeError.status = response.status;
        throw typeError;
      }
      return response.json().then(function (json) {
        if (!response.ok || json.status !== 200) {
          var apiError = new Error(json.message || '请求失败');
          apiError.status = response.status || json.status;
          throw apiError;
        }
        return json.data;
      });
    }).then(function (data) {
      clearTimeout(timeout);
      return data;
    }, function (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        var timeoutError = new Error('请求超时，请稍后重试');
        timeoutError.status = 0;
        throw timeoutError;
      }
      throw error;
    });
  }

  function submitScore() {
    if (!state.scoreData) {
      setStatus('error', '请先完成完整挑战');
      return;
    }
    var name = ($('lbName').value || '').trim();
    if (!name) { setStatus('error', '请先填写昵称'); return; }
    if (name.length > 24) { setStatus('error', '昵称最多 24 个字符'); return; }
    var token = getTurnstileToken();
    if (!token) { setStatus('error', '请先完成人机验证'); return; }

    var button = $('lbSubmitBtn');
    button.disabled = true;
    setStatus('loading', '正在提交成绩…');
    var score = state.scoreData;
    requestJson(API_BASE + '/iq-matrix/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        matrixAccuracy: Math.round(score.matrixScore.accuracy * 100),
        avgReactionMs: Math.round(score.matrixScore.avgCorrectRT),
        wmAccuracy: Math.round(score.wmAccuracy * 100),
        cfTurnstileToken: token
      })
    }, 12000).then(function (data) {
      state.lastSubmittedName = name;
      setStatus('success', '提交成功：综合分 ' + data.overallScore + '，当前第 ' + data.rank + ' 名（共 ' + data.total + ' 人）');
      loadLeaderboard(true);
    }, function (error) {
      if (error.status === 429) setStatus('error', '提交太频繁，请按提示稍后再试');
      else setStatus('error', error.message || '提交失败，请稍后重试');
    }).then(function () {
      button.disabled = false;
      resetTurnstile();
    });
  }

  function loadLeaderboard(preserveStatus) {
    var requestId = ++state.leaderboardRequest;
    if (!preserveStatus) setStatus('loading', '正在加载排行榜…');
    $('lbRefreshBtn').disabled = true;
    requestJson(API_BASE + '/iq-matrix/leaderboard?limit=20', { method: 'GET' }, 10000).then(function (data) {
      if (requestId !== state.leaderboardRequest) return;
      renderLeaderboard(data);
      if (!preserveStatus) setStatus('', '');
    }, function (error) {
      if (requestId !== state.leaderboardRequest) return;
      $('lbBody').innerHTML = '<tr><td colspan="6" class="lb-empty">排行榜加载失败</td></tr>';
      $('lbTotal').textContent = '';
      setStatus('error', error.message || '排行榜加载失败，请稍后重试');
    }).then(function () {
      if (requestId === state.leaderboardRequest) $('lbRefreshBtn').disabled = false;
    });
  }

  function renderLeaderboard(data) {
    var body = $('lbBody');
    var leaders = data && Array.isArray(data.leaders) ? data.leaders : [];
    body.innerHTML = '';
    if (!leaders.length) {
      body.innerHTML = '<tr><td colspan="6" class="lb-empty">还没有人上榜，完成挑战成为第一位</td></tr>';
      $('lbTotal').textContent = '';
      return;
    }
    leaders.forEach(function (leader) {
      var row = document.createElement('tr');
      if (state.lastSubmittedName && leader.name === state.lastSubmittedName) row.className = 'lb-me';
      appendCell(row, String(leader.rank), leader.rank <= 3 ? 'lb-rank-' + leader.rank : '');
      appendCell(row, leader.name);
      appendCell(row, leader.matrixAccuracy + '%');
      appendCell(row, (leader.avgReactionMs / 1000).toFixed(1) + 's');
      appendCell(row, leader.wmAccuracy + '%');
      appendCell(row, leader.overallScore, 'score-value');
      body.appendChild(row);
    });
    $('lbTotal').textContent = '共 ' + Number(data.total || 0) + ' 人参与';
  }

  function appendCell(row, text, className) {
    var cell = document.createElement('td');
    cell.textContent = text == null ? '' : String(text);
    if (className) cell.className = className;
    row.appendChild(cell);
  }

  function buildNBackGrid() {
    var grid = $('nbackGrid');
    for (var i = 0; i < 9; i++) {
      var cell = document.createElement('div');
      cell.className = 'nb-cell';
      grid.appendChild(cell);
    }
  }

  $('startMatrixBtn').addEventListener('click', startMatrix);
  $('startNbackBtn').addEventListener('click', startNbackOnly);
  $('retryBtn').addEventListener('click', resetForMenu);
  $('shareBtn').addEventListener('click', shareResult);
  $('nbSameBtn').addEventListener('click', function () { handleNBackResponse(true); });
  $('nbDiffBtn').addEventListener('click', function () { handleNBackResponse(false); });
  $('lbSubmitBtn').addEventListener('click', submitScore);
  $('lbRefreshBtn').addEventListener('click', function () { loadLeaderboard(false); });

  window.addEventListener('beforeunload', function (event) {
    if (!state.locked) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('pagehide', clearActivityTimers);

  buildNBackGrid();
  loadLeaderboard(false);
})();
