/**
 * 宇宙收割者假说 — 交互逻辑 v2
 * 
 * v2: 实时扫描倒计时 + 随机事件抉择
 */
(function () {
  'use strict';

  const API_BASE = 'https://numfeel-api.996.ninja';

  const $ = (sel) => document.querySelector(sel);
  const phases = {
    intro: $('#phase-intro'),
    game: $('#phase-game'),
    result: $('#phase-result'),
  };

  let civ = null;
  let selectedStrategy = null;
  let strategyHistory = [];
  let chartInstance = null;

  // 实时扫描倒计时
  let scanTimer = null;
  let scanCountdown = 0;
  let scanPaused = false;
  let turnsUntilScan = 0;

  // 事件状态
  let pendingEvent = null;

  function showPhase(name) {
    Object.values(phases).forEach(el => el.classList.remove('active'));
    phases[name].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ══════════ 开始 ══════════
  $('#startBtn').addEventListener('click', startGame);
  $('#retryBtn').addEventListener('click', startGame);
  $('#shareBtn').addEventListener('click', () => {
    if (window.openShareModal) window.openShareModal();
  });

  function startGame() {
    civ = createCivilization();
    selectedStrategy = 'balanced'; // 默认选中均衡
    strategyHistory = [];
    pendingEvent = null;
    clearLog();
    addLog('文明初始化完成。深空一片寂静。', 'info');
    addLog('收割者扫描器正在运转——你有有限的时间窗口。', 'warning');
    updateUI();
    initChart();
    showPhase('game');
    hideEventModal();
    deselectAll();
    // 默认选中balanced
    document.querySelector('[data-strategy="balanced"]').classList.add('selected');
    enableStrategyBtns(true);
    startScanTimer();
  }

  // ══════════ 扫描倒计时（实时制核心） ══════════
  function startScanTimer() {
    stopScanTimer();
    turnsUntilScan = civ.config.reaperScanInterval - (civ.turn % civ.config.reaperScanInterval);
    scanCountdown = civ.config.scanDuration;
    scanPaused = false;
    updateScanDisplay();
    scanTimer = setInterval(tickScan, 1000);
  }

  function stopScanTimer() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  }

  function pauseScanTimer() { scanPaused = true; }
  function resumeScanTimer() { scanPaused = false; }

  function tickScan() {
    if (scanPaused || !civ || !civ.alive || civ.escaped) return;

    scanCountdown--;
    updateScanDisplay();

    if (scanCountdown <= 0) {
      // 时间到！如果玩家没有行动，自动以当前策略（或dormant）执行
      if (!civ.alive || civ.escaped) return;
      const autoStrategy = selectedStrategy || 'dormant';
      executeRound(autoStrategy);
    }
  }

  function updateScanDisplay() {
    const bar = $('#scanTimerBar');
    const text = $('#scanTimerText');
    const cfg = civ.config;

    turnsUntilScan = cfg.reaperScanInterval - (civ.turn % cfg.reaperScanInterval);
    const isNextScan = turnsUntilScan === 1 || (civ.turn + 1) % cfg.reaperScanInterval === 0;

    const pct = (scanCountdown / cfg.scanDuration) * 100;
    bar.style.width = pct + '%';

    if (scanCountdown <= 2) {
      bar.style.background = '#ef4444';
      text.textContent = `⚠️ ${scanCountdown}s — 快做决定！`;
      text.style.color = '#ef4444';
      // 闪烁效果
      bar.parentElement.classList.add('urgent');
    } else if (isNextScan) {
      bar.style.background = '#f59e0b';
      text.textContent = `扫描临近 ${scanCountdown}s | 下回合收割者将扫描`;
      text.style.color = '#f59e0b';
      bar.parentElement.classList.remove('urgent');
    } else {
      bar.style.background = '#22c55e';
      text.textContent = `${scanCountdown}s | 距下次扫描还有 ${turnsUntilScan} 回合`;
      text.style.color = '#94a3b8';
      bar.parentElement.classList.remove('urgent');
    }
  }

  // ══════════ 策略选择 ══════════
  const strategyBtns = document.querySelectorAll('.strategy-btn');
  strategyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      deselectAll();
      btn.classList.add('selected');
      selectedStrategy = btn.dataset.strategy;
    });
  });

  function deselectAll() {
    strategyBtns.forEach(b => b.classList.remove('selected'));
  }

  function enableStrategyBtns(enabled) {
    strategyBtns.forEach(b => {
      if (enabled) b.classList.remove('disabled');
      else b.classList.add('disabled');
    });
  }

  // ══════════ 执行回合 ══════════
  $('#executeBtn').addEventListener('click', () => {
    if (!civ || !civ.alive || civ.escaped) return;
    const strategy = selectedStrategy || 'dormant';
    executeRound(strategy);
  });

  function executeRound(strategyId) {
    if (!civ || !civ.alive || civ.escaped) return;

    strategyHistory.push(strategyId);
    const rng = mulberry32(Date.now() ^ (civ.turn * 9973));

    // 先检查是否触发事件
    const shouldEvent = rng() < civ.config.eventChance && civ.turn > 0;
    if (shouldEvent) {
      const event = pickEvent(civ, rng);
      if (event) {
        pendingEvent = { event, strategyId, rng };
        showEventModal(event);
        pauseScanTimer();
        return; // 等待玩家选择
      }
    }

    // 无事件，直接执行
    finishRound(strategyId, rng, null);
  }

  function finishRound(strategyId, rng, eventChoiceIdx) {
    civ = advanceTurn(civ, strategyId, rng, eventChoiceIdx);
    const last = civ.history[civ.history.length - 1];

    // 日志
    const stratName = STRATEGIES[strategyId].name;
    addLog(`回合 ${civ.turn}：「${stratName}」`, 'info');

    if (last.event) {
      const evt = EVENTS.find(e => e.id === last.event.id);
      if (evt) {
        const choiceLabel = evt.choices[last.event.choice].label;
        if (last.event.success === false) {
          addLog(`  事件「${evt.title}」→ ${choiceLabel}（失败！）`, 'danger');
        } else {
          addLog(`  事件「${evt.title}」→ ${choiceLabel}`, 'event');
        }
      }
    }

    if (last.scanned) {
      if (civ.alive) {
        addLog(`  ⚡ 收割者扫描——暴露度 ${last.exposure}/${civ.config.threshold}，安全`, 'scan');
      } else {
        addLog(`  ☠️ 收割者扫描——暴露度 ${last.exposure} 超过阈值！`, 'danger');
        addLog('  ▓▓▓ 清扫程序启动。文明已被抹除。 ▓▓▓', 'danger');
      }
    }

    if (civ.escaped) {
      addLog('  🚀 科技突破逃逸等级！文明冲出收割者封锁线！', 'success');
    }

    if (!civ.alive && !last.scanned) {
      addLog('  ⏰ 恒星进入红巨星阶段，资源耗尽。', 'warning');
    }

    updateUI();
    updateChart();

    if (!civ.alive || civ.escaped) {
      stopScanTimer();
      setTimeout(showResult, 1000);
    } else {
      // 重置倒计时
      scanCountdown = civ.config.scanDuration;
      resumeScanTimer();
      updateScanDisplay();
    }
  }

  // ══════════ 事件弹窗 ══════════
  function showEventModal(event) {
    const modal = $('#eventModal');
    const title = $('#eventTitle');
    const desc = $('#eventDesc');
    const choices = $('#eventChoices');

    title.textContent = event.title;
    desc.textContent = event.desc;
    choices.innerHTML = '';

    event.choices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.className = 'event-choice-btn';
      const effectStr = formatEffects(choice.effects);
      const riskStr = choice.successRate ? ` (成功率${Math.round(choice.successRate * 100)}%)` : '';
      btn.innerHTML = `<span class="ec-label">${choice.label}${riskStr}</span><span class="ec-effects">${effectStr}</span>`;
      btn.addEventListener('click', () => {
        hideEventModal();
        finishRound(pendingEvent.strategyId, pendingEvent.rng, idx);
        pendingEvent = null;
      });
      choices.appendChild(btn);
    });

    modal.classList.add('visible');
  }

  function hideEventModal() {
    $('#eventModal').classList.remove('visible');
  }

  function formatEffects(effects) {
    const parts = [];
    if (effects.tech > 0) parts.push(`<span style="color:#60a5fa">科技+${effects.tech}</span>`);
    if (effects.tech < 0) parts.push(`<span style="color:#ef4444">科技${effects.tech}</span>`);
    if (effects.signal > 0) parts.push(`<span style="color:#f59e0b">信号+${effects.signal}</span>`);
    if (effects.signal < 0) parts.push(`<span style="color:#22c55e">信号${effects.signal}</span>`);
    if (effects.stealth > 0) parts.push(`<span style="color:#22c55e">隐蔽+${effects.stealth}</span>`);
    if (effects.stealth < 0) parts.push(`<span style="color:#ef4444">隐蔽${effects.stealth}</span>`);
    return parts.join(' ');
  }

  // ══════════ UI 更新 ══════════
  function updateUI() {
    const cfg = civ.config;
    $('#turnDisplay').textContent = `${civ.turn} / ${cfg.maxTurns}`;
    $('#techDisplay').textContent = Math.round(civ.tech);
    $('#signalDisplay').textContent = Math.round(civ.signal);
    $('#stealthDisplay').textContent = Math.round(civ.stealth);

    // 科技进度条
    const techPct = Math.min(100, (civ.tech / cfg.escapeTech) * 100);
    $('#techProgress').style.width = techPct + '%';
    $('#techProgressText').textContent = `${Math.round(civ.tech)} / ${cfg.escapeTech}`;

    // 科技颜色
    const techEl = $('#techDisplay');
    techEl.className = 'value';
    if (civ.tech >= cfg.escapeTech * 0.8) techEl.classList.add('safe');
    else if (civ.tech >= cfg.escapeTech * 0.5) techEl.classList.add('warning');

    // 暴露度
    const exposure = getExposure(civ);
    const currentThreshold = civ.currentThreshold;
    const maxDisplay = cfg.threshold * 1.5;
    const pct = Math.min(100, (exposure / maxDisplay) * 100);
    const fill = $('#exposureFill');
    fill.style.width = pct + '%';

    if (exposure > currentThreshold * 0.8) fill.style.background = '#ef4444';
    else if (exposure > currentThreshold * 0.5) fill.style.background = '#f59e0b';
    else fill.style.background = '#22c55e';

    $('#exposureText').textContent = `${Math.round(exposure)} / ${currentThreshold}`;
    $('#exposureThreshold').style.left = (currentThreshold / maxDisplay * 100) + '%';
  }

  // ══════════ 日志 ══════════
  function addLog(text, cls) {
    const panel = $('#logPanel');
    const entry = document.createElement('div');
    entry.className = 'log-entry' + (cls ? ' ' + cls : '');
    entry.textContent = text;
    panel.appendChild(entry);
    panel.scrollTop = panel.scrollHeight;
  }

  function clearLog() {
    $('#logPanel').innerHTML = '';
  }

  // ══════════ 图表 ══════════
  function initChart() {
    if (chartInstance) chartInstance.destroy();
    const ctx = $('#gameChart').getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [0],
        datasets: [
          { label: '科技', data: [civ.tech], borderColor: '#60a5fa', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
          { label: '暴露度', data: [0], borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0.3, fill: false },
          { label: '阈值', data: [civ.config.threshold], borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1, borderDash: [2, 4], pointRadius: 0, fill: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        },
        scales: {
          x: { title: { display: true, text: '回合', color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  }

  function updateChart() {
    if (!chartInstance) return;
    const last = civ.history[civ.history.length - 1];
    chartInstance.data.labels.push(last.turn);
    chartInstance.data.datasets[0].data.push(last.tech);
    chartInstance.data.datasets[1].data.push(last.exposure);
    chartInstance.data.datasets[2].data.push(civ.config.threshold);
    chartInstance.update('none');
  }

  // ══════════ 结果 ══════════
  function showResult() {
    showPhase('result');

    const score = computeScore(civ);
    $('#scoreDisplay').textContent = score + ' 分';
    $('#surviveTurns').textContent = civ.turn;

    if (civ.escaped) {
      $('#resultIcon').innerHTML = '<i class="ti ti-rocket" style="color:#22c55e"></i>';
      $('#resultTitle').textContent = '逃逸成功';
      $('#resultTitle').className = 'result-title escaped';
      $('#resultDesc').textContent = '你的文明在收割者检测到之前达到了逃逸科技等级，突破了宇宙封锁。';
    } else if (civ.deathCause === 'reaped') {
      $('#resultIcon').innerHTML = '<i class="ti ti-skull" style="color:#ef4444"></i>';
      $('#resultTitle').textContent = '已被收割';
      $('#resultTitle').className = 'result-title reaped';
      $('#resultDesc').textContent = '清扫程序启动，文明在毫秒内被抹除。没有警告，没有谈判，没有遗言。';
    } else {
      $('#resultIcon').innerHTML = '<i class="ti ti-hourglass" style="color:#f59e0b"></i>';
      $('#resultTitle').textContent = '资源耗尽';
      $('#resultTitle').className = 'result-title timeout';
      $('#resultDesc').textContent = '恒星进入红巨星阶段，宜居带消失。文明未能在时间窗口内达到逃逸科技。';
    }

    runMonteCarlo();
    submitResult(score);
  }

  function runMonteCarlo() {
    const results = monteCarloSimulate(strategyHistory, civ.config, 1000);
    const container = $('#mcResults');
    container.innerHTML = `
      <div class="mc-item">
        <div class="mc-value" style="color:#22c55e">${results.escapeRate}%</div>
        <div class="mc-label">逃逸成功率</div>
      </div>
      <div class="mc-item">
        <div class="mc-value" style="color:#ef4444">${results.reapRate}%</div>
        <div class="mc-label">被收割率</div>
      </div>
      <div class="mc-item">
        <div class="mc-value">${results.avgTurns}</div>
        <div class="mc-label">平均存活回合</div>
      </div>
    `;
  }

  // ══════════ 后端 ══════════
  function submitResult(score) {
    const payload = {
      strategy: getMostUsedStrategy(),
      escaped: civ.escaped,
      turns: civ.turn,
      score: score,
      finalTech: Math.round(civ.tech),
      finalSignal: Math.round(civ.signal),
      finalStealth: Math.round(civ.stealth),
    };

    fetch(API_BASE + '/cosmic-reaper/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.status === 200 && data.data) showGlobalStats(data.data);
      })
      .catch(() => {});
  }

  function showGlobalStats(data) {
    const card = $('#globalStatsCard');
    card.style.display = 'block';
    $('#globalStats').innerHTML = `
      <div class="global-stat">
        <div class="gs-value">${data.totalRuns || 0}</div>
        <div class="gs-label">总模拟次数</div>
      </div>
      <div class="global-stat">
        <div class="gs-value">${data.escapeRate || 0}%</div>
        <div class="gs-label">全局逃逸率</div>
      </div>
      <div class="global-stat">
        <div class="gs-value">${data.avgScore || 0}</div>
        <div class="gs-label">平均得分</div>
      </div>
      <div class="global-stat">
        <div class="gs-value">${translateStrategy(data.topStrategy)}</div>
        <div class="gs-label">最常用策略</div>
      </div>
    `;
  }

  function translateStrategy(s) {
    const map = { aggressive: '激进扩张', balanced: '均衡发展', stealth: '隐蔽优先', dormant: '休眠蛰伏' };
    return map[s] || s || '-';
  }

  function getMostUsedStrategy() {
    const counts = {};
    strategyHistory.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    let max = 0, best = 'balanced';
    Object.entries(counts).forEach(([k, v]) => { if (v > max) { max = v; best = k; } });
    return best;
  }

})();
