/**
 * app.js — 排除选项后改答案 · 交互控制、动画、图表
 * 依赖：simulation-engine.js (global.SwitchAnswerSim)、Chart.js
 */
(function () {
  'use strict';

  var Sim = window.SwitchAnswerSim;
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  // ─────────────────────────────────────────────────────────
  // 模块一：亲自答题 状态机
  // ─────────────────────────────────────────────────────────
  var TOTAL_ROUNDS = 10;
  var N_FIXED = 4;       // 模块一固定 4 选 1
  var K_FIXED = 2;       // 排除 2 个

  var quiz = {
    round: 0,
    correctAnswer: 0,
    initialChoice: -1,
    eliminated: [],
    remainingOption: -1,
    phase: 'choose',     // choose -> decide -> reveal
    stayWins: 0,
    stayTotal: 0,
    switchWins: 0,
    switchTotal: 0
  };

  var el = {};
  function cacheEls() {
    [
      'roundNum', 'quizStep', 'quizPrompt', 'optionsRow', 'decisionRow',
      'stayBtn', 'switchBtn', 'revealRow', 'revealResult', 'nextRoundBtn',
      'quizSummary',
      'sumStayRate', 'sumSwitchRate', 'sumStayDetail', 'sumSwitchDetail',
      'summaryNote', 'replayBtn', 'goSimBtn'
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function startQuiz() {
    quiz.round = 0;
    quiz.stayWins = 0; quiz.stayTotal = 0;
    quiz.switchWins = 0; quiz.switchTotal = 0;
    if (el.quizSummary) el.quizSummary.hidden = true;
    nextRound();
  }

  function nextRound() {
    if (quiz.round >= TOTAL_ROUNDS) { finishQuiz(); return; }
    quiz.round++;
    // 只预设正确答案，eliminated 等用户选了之后再生成
    quiz.correctAnswer = Math.floor(Math.random() * N_FIXED);
    quiz.initialChoice = -1;
    quiz.eliminated = [];
    quiz.remainingOption = -1;
    quiz.phase = 'choose';

    el.roundNum.textContent = quiz.round;
    el.quizStep.textContent = '第一遍做题——你完全不会，随机猜一个';
    el.quizPrompt.querySelector('span').textContent =
      '下面这道题，你毫无头绪。凭直觉点一个选项。';
    el.decisionRow.hidden = true;
    el.revealRow.hidden = true;

    // 重置选项按钮
    var btns = el.optionsRow.querySelectorAll('.option-btn');
    btns.forEach(function (b) {
      b.className = 'option-btn';
      b.disabled = false;
    });
  }

  var quizStarted = false;

  function onOptionClick(idx) {
    if (!quizStarted) {
      // 用户直接点了选项而非 Hero 按钮，先启动 quiz
      quizStarted = true;
      startQuiz();
    }
    if (quiz.phase !== 'choose') return;
    quiz.initialChoice = idx;

    // 基于用户实际选择生成 eliminated 和 remainingOption
    var options = [];
    for (var i = 0; i < N_FIXED; i++) options.push(i);
    // 可排除池：不是用户选的，也不是正确答案
    var eliminatable = options.filter(function (o) {
      return o !== idx && o !== quiz.correctAnswer;
    });
    // 从中随机取 K_FIXED 个排除
    var pool = eliminatable.slice();
    var eliminated = [];
    for (var j = 0; j < K_FIXED && pool.length > 0; j++) {
      var ri = Math.floor(Math.random() * pool.length);
      eliminated.push(pool.splice(ri, 1)[0]);
    }
    eliminated.sort(function (a, b) { return a - b; });
    quiz.eliminated = eliminated;

    // 剩余可换选项：不是用户选的，不在 eliminated 中
    var candidates = options.filter(function (o) {
      return o !== idx && eliminated.indexOf(o) === -1;
    });
    quiz.remainingOption = candidates.length === 1
      ? candidates[0]
      : candidates[Math.floor(Math.random() * candidates.length)];

    quiz.phase = 'decide';

    el.quizStep.textContent = '检查时你发现可以排除两个错误选项';
    el.quizPrompt.querySelector('span').textContent =
      '你排除了 ' + quiz.eliminated.map(function (i) { return LETTERS[i]; }).join('、') +
      '（确定它们是错的）。现在只剩你选的和另一个。';

    var btns = el.optionsRow.querySelectorAll('.option-btn');
    btns.forEach(function (b, i) {
      b.disabled = true;
      if (i === idx) b.classList.add('selected');
      if (quiz.eliminated.indexOf(i) !== -1) {
        // 划掉动画
        setTimeout(function () { b.classList.add('eliminated'); }, 250);
      }
    });

    setTimeout(function () {
      el.decisionRow.hidden = false;
      el.decisionRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 600);
  }

  function onDecision(switchChoice) {
    if (quiz.phase !== 'decide') return;
    quiz.phase = 'reveal';

    var finalChoice = switchChoice ? quiz.remainingOption : quiz.initialChoice;
    var won = finalChoice === quiz.correctAnswer;

    if (switchChoice) { quiz.switchTotal++; if (won) quiz.switchWins++; }
    else { quiz.stayTotal++; if (won) quiz.stayWins++; }

    // 渲染揭晓
    var btns = el.optionsRow.querySelectorAll('.option-btn');
    btns.forEach(function (b, i) {
      if (i === quiz.correctAnswer) b.classList.add('correct');
      else if (i === finalChoice && !won) b.classList.add('wrong-final');
    });

    el.quizStep.textContent = '揭晓正确答案';
    var correctLetter = LETTERS[quiz.correctAnswer];
    var finalLetter = LETTERS[finalChoice];
    el.revealResult.className = 'reveal-result ' + (won ? 'win' : 'lose');
    el.revealResult.innerHTML = won
      ? '<i class="ti ti-circle-check"></i> 答对了！你' + (switchChoice ? '换选' : '坚持') + '了 ' + finalLetter + '（正确答案 ' + correctLetter + '）'
      : '<i class="ti ti-circle-x"></i> 答错了。你' + (switchChoice ? '换选' : '坚持') + '了 ' + finalLetter + '，正确答案是 ' + correctLetter;

    // 屏幕反馈
    if (won) {
      document.body.classList.add('flash-green');
      setTimeout(function () { document.body.classList.remove('flash-green'); }, 500);
    } else {
      document.body.classList.add('shake');
      setTimeout(function () { document.body.classList.remove('shake'); }, 400);
    }

    el.decisionRow.hidden = true;
    el.revealRow.hidden = false;
    el.nextRoundBtn.textContent = quiz.round >= TOTAL_ROUNDS ? '看 10 轮总结' : '下一题';
  }

  function finishQuiz() {
    var stayRate = quiz.stayTotal > 0 ? quiz.stayWins / quiz.stayTotal : 0;
    var switchRate = quiz.switchTotal > 0 ? quiz.switchWins / quiz.switchTotal : 0;
    el.sumStayRate.textContent = quiz.stayTotal > 0 ? (stayRate * 100).toFixed(0) + '%' : '—';
    el.sumSwitchRate.textContent = quiz.switchTotal > 0 ? (switchRate * 100).toFixed(0) + '%' : '—';
    el.sumStayDetail.textContent = quiz.stayWins + ' 对 / ' + quiz.stayTotal + ' 次';
    el.sumSwitchDetail.textContent = quiz.switchWins + ' 对 / ' + quiz.switchTotal + ' 次';

    if (quiz.switchTotal === 0 || quiz.stayTotal === 0) {
      // 用户全选了同一策略，没有对比数据
      var onlyStrategy = quiz.switchTotal === 0 ? '坚持' : '换选';
      el.summaryNote.textContent = '你 10 轮全选了「' + onlyStrategy + '」，没有对比数据。建议再玩一轮混着选，或直接看下面的万次模拟。';
    } else {
      var diff = (switchRate - stayRate);
      el.summaryNote.textContent = diff > 0.15
        ? '换选明显占优——这只是 10 轮，下面的万次模拟更稳。'
        : '样本小波动大，别急下结论，看万次模拟消除运气。';
    }
    el.quizSummary.hidden = false;
    el.quizSummary.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ─────────────────────────────────────────────────────────
  // 模块二：蒙特卡洛模拟
  // ─────────────────────────────────────────────────────────
  var simState = { N: 4, K: 2, running: false, chart: null };
  var SIM_TOTAL = 10000;
  var simData = {
    stay: [], switch: [], random: [],
    stayWin: 0, switchWin: 0, randomWin: 0, done: 0
  };

  function rebuildKSeg() {
    var seg = document.getElementById('kSeg');
    var N = simState.N;
    seg.innerHTML = '';
    for (var k = 1; k <= N - 2; k++) {
      var b = document.createElement('button');
      b.setAttribute('data-k', k);
      b.textContent = k;
      if (k === simState.K) b.classList.add('active');
      seg.appendChild(b);
    }
  }

  function updateTheoryLine() {
    var N = simState.N, K = simState.K;
    var stay = Sim.theoreticalRate('stay', N, K);
    var sw = Sim.theoreticalRate('switch', N, K);
    var rnd = Sim.theoreticalRate('random', N, K);
    document.getElementById('theoryLine').innerHTML =
      'N=' + N + '，K=' + K + ' → 理论：坚持 <b style="color:#81c784">' + pct(stay) +
      '</b>　换选 <b style="color:#ce93d8">' + pct(sw) +
      '</b>　随机 <b style="color:#90caf9">' + pct(rnd) + '</b>';
    document.getElementById('theoryStay').textContent = '理论 ' + pct(stay);
    document.getElementById('theorySwitch').textContent = '理论 ' + pct(sw);
    document.getElementById('theoryRandom').textContent = '理论 ' + pct(rnd);
  }

  function pct(x) { return (x * 100).toFixed(1) + '%'; }

  function initChart() {
    var ctx = document.getElementById('convergeChart').getContext('2d');
    // 理论值虚线插件
    var theoryPlugin = {
      id: 'theoryLines',
      afterDraw: function (chart) {
        var N = simState.N, K = simState.K;
        var lines = [
          { y: Sim.theoreticalRate('stay', N, K), color: '#81c784' },
          { y: Sim.theoreticalRate('switch', N, K), color: '#ce93d8' },
          { y: Sim.theoreticalRate('random', N, K), color: '#90caf9' }
        ];
        var xScale = chart.scales.x;
        var yScale = chart.scales.y;
        var c = chart.ctx;
        lines.forEach(function (l) {
          var py = yScale.getPixelForValue(l.y * 100);
          c.save();
          c.setLineDash([6, 5]);
          c.strokeStyle = l.color;
          c.globalAlpha = 0.55;
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(xScale.left, py);
          c.lineTo(xScale.right, py);
          c.stroke();
          c.restore();
        });
      }
    };

    simState.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: '坚持', data: [],
            borderColor: '#81c784', backgroundColor: 'rgba(129,199,132,.08)',
            borderWidth: 2, pointRadius: 0, tension: 0.25
          },
          {
            label: '换选', data: [],
            borderColor: '#ce93d8', backgroundColor: 'rgba(206,147,216,.08)',
            borderWidth: 2, pointRadius: 0, tension: 0.25
          },
          {
            label: '随机', data: [],
            borderColor: '#90caf9', backgroundColor: 'rgba(144,202,249,.08)',
            borderWidth: 2, pointRadius: 0, tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#cfd6e4', usePointStyle: true, boxWidth: 8, font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              title: function (items) { return '已模拟 ' + items[0].label + ' 次'; },
              label: function (item) { return item.dataset.label + ': ' + item.formattedValue + '%'; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '模拟次数', color: '#888' },
            ticks: { color: '#888', maxTicksLimit: 8, font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,.05)' }
          },
          y: {
            min: 0, max: 100,
            title: { display: true, text: '累计正确率 %', color: '#888' },
            ticks: { color: '#888', callback: function (v) { return v + '%'; }, font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,.05)' }
          }
        }
      },
      plugins: [theoryPlugin]
    });
  }

  function resetSimData() {
    simData.stay = []; simData.switch = []; simData.random = [];
    simData.stayWin = 0; simData.switchWin = 0; simData.randomWin = 0; simData.done = 0;
    if (simState.chart) {
      simState.chart.data.labels = [];
      simState.chart.data.datasets.forEach(function (ds) { ds.data = []; });
      simState.chart.update('none');
    }
  }

  function runSimulation() {
    if (simState.running) return;
    // 前置校验，避免异常
    var check = Sim.validateParams(simState.N, simState.K);
    if (!check.valid) {
      document.getElementById('theoryLine').innerHTML =
        '<span style="color:#ff6b6b"><i class="ti ti-alert-triangle"></i> ' + check.error + '</span>';
      return;
    }
    simState.running = true;
    var btn = document.getElementById('runSimBtn');
    btn.disabled = true;
    resetSimData();

    var chunk = 80;            // 每帧增加的次数（10000/80 = 125 个采样点）
    var total = SIM_TOTAL;

    function frame() {
      var end = Math.min(simData.done + chunk, total);
      for (var i = simData.done; i < end; i++) {
        var r = Sim.simulateOneRound(simState.N, simState.K);
        if (r.stayWins) simData.stayWin++;
        if (r.switchWins) simData.switchWin++;
        // random：50/50 在 stay / switch 之间选
        if (Math.random() < 0.5 ? r.stayWins : r.switchWins) simData.randomWin++;
        simData.done = i + 1;
      }
      // 每帧写一个采样点
      var stayRate = simData.done ? simData.stayWin / simData.done * 100 : 0;
      var swRate = simData.done ? simData.switchWin / simData.done * 100 : 0;
      var rndRate = simData.done ? simData.randomWin / simData.done * 100 : 0;
      simState.chart.data.labels.push(simData.done);
      simState.chart.data.datasets[0].data.push(stayRate);
      simState.chart.data.datasets[1].data.push(swRate);
      simState.chart.data.datasets[2].data.push(rndRate);
      simState.chart.update('none');

      document.getElementById('statStay').textContent = stayRate.toFixed(1) + '%';
      document.getElementById('statSwitch').textContent = swRate.toFixed(1) + '%';
      document.getElementById('statRandom').textContent = rndRate.toFixed(1) + '%';
      document.getElementById('simCount').textContent = simData.done;

      if (simData.done < total) {
        requestAnimationFrame(frame);
      } else {
        // 定格高亮
        simState.running = false;
        btn.disabled = false;
        var cards = document.querySelectorAll('.stat-card');
        cards.forEach(function (c) { c.classList.add('highlight'); });
        setTimeout(function () {
          cards.forEach(function (c) { c.classList.remove('highlight'); });
        }, 1800);
      }
    }
    requestAnimationFrame(frame);
  }

  // ─────────────────────────────────────────────────────────
  // 模块三：概率流动
  // ─────────────────────────────────────────────────────────
  var flowState = { mode: 'reliable', playing: false, timers: [] };

  function clearFlowTimers() {
    flowState.timers.forEach(function (t) { clearTimeout(t); });
    flowState.timers = [];
  }

  function resetFlowBoxes() {
    var boxes = document.querySelectorAll('.flow-box');
    boxes.forEach(function (b, i) {
      b.className = 'flow-box';
      b.querySelector('.fb-pct').textContent = '25%';
      var tag = b.querySelector('.fb-tag');
      if (tag) tag.remove();
    });
    // 重置步骤
    document.querySelectorAll('.flow-step').forEach(function (s) { s.classList.remove('active'); });
  }

  function setFlowPct(letter, pctText) {
    var box = document.querySelector('.flow-box[data-opt="' + letter + '"]');
    if (box) box.querySelector('.fb-pct').textContent = pctText;
  }

  function addFlowTag(letter, text) {
    var box = document.querySelector('.flow-box[data-opt="' + letter + '"]');
    if (!box) return;
    var tag = box.querySelector('.fb-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'fb-tag';
      box.appendChild(tag);
    }
    tag.textContent = text;
  }
  function removeFlowTag(letter) {
    var box = document.querySelector('.flow-box[data-opt="' + letter + '"]');
    if (box) {
      var tag = box.querySelector('.fb-tag');
      if (tag) tag.remove();
    }
  }

  function emitParticles(fromLetter, toLetter) {
    var from = document.querySelector('.flow-box[data-opt="' + fromLetter + '"]');
    var to = document.querySelector('.flow-box[data-opt="' + toLetter + '"]');
    if (!from || !to) return;
    var stage = document.getElementById('flowStage');
    var fromRect = from.getBoundingClientRect();
    var toRect = to.getBoundingClientRect();
    var stageRect = stage.getBoundingClientRect();
    var sx = fromRect.left + fromRect.width / 2 - stageRect.left;
    var sy = fromRect.top + fromRect.height / 2 - stageRect.top;
    var ex = toRect.left + toRect.width / 2 - stageRect.left;
    var ey = toRect.top + toRect.height / 2 - stageRect.top;

    for (var i = 0; i < 8; i++) {
      (function (idx) {
        var p = document.createElement('span');
        p.className = 'particle';
        p.style.left = sx + 'px';
        p.style.top = sy + 'px';
        stage.appendChild(p);
        var delay = idx * 70;
        var dur = 700;
        setTimeout(function () {
          p.style.transition = 'left ' + dur + 'ms cubic-bezier(.4,0,.6,1), top ' + dur + 'ms cubic-bezier(.4,0,.6,1), opacity ' + dur + 'ms';
          p.style.left = ex + 'px';
          p.style.top = ey + 'px';
          p.style.opacity = '0';
        }, delay);
        setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, delay + dur + 50);
      })(i);
    }
  }

  function activateStep(n) {
    document.querySelectorAll('.flow-step').forEach(function (s, i) {
      if (i <= n) s.classList.add('active'); else s.classList.remove('active');
    });
  }

  function playFlow() {
    if (flowState.playing) return;
    flowState.playing = true;
    clearFlowTimers();
    resetFlowBoxes();

    var mode = flowState.mode;
    var caption = document.getElementById('flowCaption');

    // Step 1: 初始 25%
    activateStep(0);
    var t0 = 700;

    // Step 2: 选 A（概率不变）
    flowState.timers.push(setTimeout(function () {
      activateStep(1);
      var aBox = document.querySelector('.flow-box[data-opt="A"]');
      if (aBox) aBox.classList.add('is-selected');
      addFlowTag('A', '你选的');
    }, t0));

    // Step 3: 排除 B、C
    flowState.timers.push(setTimeout(function () {
      activateStep(2);
      ['B', 'C'].forEach(function (l) {
        var b = document.querySelector('.flow-box[data-opt="' + l + '"]');
        if (b) { b.classList.add('is-eliminated'); }
      });
      if (mode === 'reliable') {
        // 概率流向 D
        emitParticles('B', 'D');
        emitParticles('C', 'D');
        caption.innerHTML = '可靠排除：B、C 确实是错的，它们承载的 2/4 概率全部转移到 D。A 的随机选择没有创造信息，始终 1/4。';
      } else if (mode === 'random') {
        // 随机排除：概率均分给 A 和 D
        emitParticles('B', 'A');
        emitParticles('C', 'D');
        caption.innerHTML = '随机排除：排除可能误伤正确答案，没有信息增益。A 和 D 退回各 1/2，改不改无所谓。';
      } else {
        // informed：选 A 有依据
        caption.innerHTML = '你一开始就知道：如果第一步选 A 是有依据的（不是瞎猜），A 的概率 > 1/4，换选优势减弱甚至反转。此模型不适用。';
      }
    }, t0 + 700));

    // Step 4: 最终概率
    flowState.timers.push(setTimeout(function () {
      activateStep(3);
      if (mode === 'reliable') {
        setFlowPct('A', '25%');
        setFlowPct('B', '0%');
        setFlowPct('C', '0%');
        setFlowPct('D', '75%');
        var dBox = document.querySelector('.flow-box[data-opt="D"]');
        if (dBox) dBox.classList.add('is-winner');
        addFlowTag('D', '换选目标');
      } else if (mode === 'random') {
        setFlowPct('A', '50%');
        setFlowPct('B', '0%');
        setFlowPct('C', '0%');
        setFlowPct('D', '50%');
      } else {
        setFlowPct('A', '高');
        setFlowPct('B', '0%');
        setFlowPct('C', '0%');
        setFlowPct('D', '低');
      }
      flowState.playing = false;
    }, t0 + 1500));
  }

  function switchFlowMode(mode) {
    flowState.mode = mode;
    document.querySelectorAll('.flow-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-flow') === mode);
    });
    playFlow();
  }

  // ─────────────────────────────────────────────────────────
  // 模块四：计算器
  // ─────────────────────────────────────────────────────────
  function runCalc() {
    var N = parseInt(document.getElementById('calcN').value, 10);
    var K = parseInt(document.getElementById('calcK').value, 10);
    var res = document.getElementById('calcResult');
    var check = Sim.validateParams(N, K);
    if (!check.valid) {
      res.innerHTML = '<span class="err"><i class="ti ti-alert-triangle"></i> ' + check.error + '</span>';
      return;
    }
    var stay = Sim.theoreticalRate('stay', N, K);
    var sw = Sim.theoreticalRate('switch', N, K);
    var rnd = Sim.theoreticalRate('random', N, K);
    var isKMax = (K === N - 2);
    res.innerHTML =
      'N=' + N + '，K=' + K + (isKMax ? '（K=N−2，只剩一个可选）' : '（剩 ' + (N - 1 - K) + ' 个可换）') + '<br>' +
      '不换正确率 = <b>' + pct(stay) + '</b>　' +
      '换选正确率 = <b>' + pct(sw) + '</b>　' +
      '随机 = <b>' + pct(rnd) + '</b>' +
      (isKMax ? '<br>即 <b>(N−1)/N = ' + (N - 1) + '/' + N + '</b>' : '');
  }

  // ─────────────────────────────────────────────────────────
  // 事件绑定 & 初始化
  // ─────────────────────────────────────────────────────────
  function bindEvents() {
    // Hero
    document.getElementById('heroStartBtn').addEventListener('click', function () {
      if (!quizStarted) {
        quizStarted = true;
        startQuiz();
      }
      document.getElementById('module1').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('heroSkipBtn').addEventListener('click', function () {
      document.getElementById('module2').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 模块一选项
    el.optionsRow.querySelectorAll('.option-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        onOptionClick(parseInt(b.getAttribute('data-idx'), 10));
      });
    });
    el.stayBtn.addEventListener('click', function () { onDecision(false); });
    el.switchBtn.addEventListener('click', function () { onDecision(true); });
    el.nextRoundBtn.addEventListener('click', nextRound);
    el.replayBtn.addEventListener('click', startQuiz);
    el.goSimBtn.addEventListener('click', function () {
      document.getElementById('module2').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 模块二 N/K
    document.getElementById('nSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]');
      if (!b) return;
      document.querySelectorAll('#nSeg button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      simState.N = parseInt(b.getAttribute('data-n'), 10);
      // K 必须满足 1 <= K <= N-2
      if (simState.K > simState.N - 2) simState.K = Math.max(1, simState.N - 2);
      rebuildKSeg();
      updateTheoryLine();
    });
    document.getElementById('kSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-k]');
      if (!b) return;
      document.querySelectorAll('#kSeg button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      simState.K = parseInt(b.getAttribute('data-k'), 10);
      updateTheoryLine();
    });
    document.getElementById('runSimBtn').addEventListener('click', runSimulation);

    // 模块三 tabs
    document.querySelectorAll('.flow-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        switchFlowMode(t.getAttribute('data-flow'));
      });
    });
    document.getElementById('flowReplayBtn').addEventListener('click', playFlow);

    // 模块四 计算器
    document.getElementById('calcBtn').addEventListener('click', runCalc);
    document.getElementById('calcN').addEventListener('input', runCalc);
    document.getElementById('calcK').addEventListener('input', runCalc);
  }

  function init() {
    cacheEls();
    bindEvents();
    // 模块一不自动开始，等用户点 Hero 或首次点选项时触发
    // 模块二
    rebuildKSeg();
    updateTheoryLine();
    initChart();
    // 模块三
    playFlow();
    // 模块四
    runCalc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
