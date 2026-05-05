/**
 * 宇宙收割者假说 — 交互逻辑
 */
(function () {
  'use strict';

  const API_BASE = 'https://numfeel-api.996.ninja';

  // ── DOM ──
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

  function showPhase(name) {
    Object.values(phases).forEach(el => el.classList.remove('active'));
    phases[name].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 开始 ──
  $('#startBtn').addEventListener('click', startGame);
  $('#retryBtn').addEventListener('click', startGame);
  $('#shareBtn').addEventListener('click', () => {
    if (window.openShareModal) window.openShareModal();
  });

  function startGame() {
    civ = createCivilization();
    selectedStrategy = null;
    strategyHistory = [];
    clearLog();
    addLog('文明初始化完成。信号微弱，暂时安全。');
    updateUI();
    initChart();
    showPhase('game');
    deselectAll();
    $('#advanceBtn').disabled = true;
  }

  // ── 策略选择 ──
  const strategyBtns = document.querySelectorAll('.strategy-btn');
  strategyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      deselectAll();
      btn.classList.add('selected');
      selectedStrategy = btn.dataset.strategy;
      $('#advanceBtn').disabled = false;
    });
  });

  function deselectAll() {
    strategyBtns.forEach(b => b.classList.remove('selected'));
  }

  // ── 执行回合 ──
  $('#advanceBtn').addEventListener('click', () => {
    if (!selectedStrategy || !civ || !civ.alive || civ.escaped) return;

    strategyHistory.push(selectedStrategy);
    const rng = mulberry32(Date.now() ^ (civ.turn * 9973));
    civ = advanceTurn(civ, selectedStrategy, rng);

    const last = civ.history[civ.history.length - 1];

    // 日志
    const stratName = STRATEGIES[selectedStrategy].name;
    addLog(`回合 ${civ.turn}：执行「${stratName}」`);

    if (last.scanned) {
      if (civ.alive) {
        addLog(`⚡ 收割者扫描——暴露度 ${last.exposure}，阈值 ${civ.config.threshold}，未触发`, 'scan');
      } else {
        addLog(`☠️ 收割者扫描——暴露度 ${last.exposure} 超过阈值 ${civ.config.threshold}！`, 'danger');
        addLog('文明已被清除。', 'danger');
      }
    }

    if (civ.escaped) {
      addLog('🚀 科技达到逃逸等级！文明成功突破收割者封锁！', 'success');
    }

    if (!civ.alive && !last.scanned) {
      addLog('⏰ 资源耗尽，文明自然消亡。', 'warning');
    }

    updateUI();
    updateChart();

    if (!civ.alive || civ.escaped) {
      setTimeout(showResult, 800);
    }
  });

  // ── UI 更新 ──
  function updateUI() {
    const cfg = civ.config;
    $('#turnDisplay').textContent = `${civ.turn} / ${cfg.maxTurns}`;
    $('#techDisplay').textContent = Math.round(civ.tech);
    $('#signalDisplay').textContent = Math.round(civ.signal);
    $('#stealthDisplay').textContent = Math.round(civ.stealth);

    // 科技颜色
    const techEl = $('#techDisplay');
    techEl.className = 'value';
    if (civ.tech >= cfg.escapeTech * 0.8) techEl.classList.add('safe');
    else if (civ.tech >= cfg.escapeTech * 0.5) techEl.classList.add('warning');

    // 暴露度
    const exposure = getExposure(civ);
    const maxDisplay = cfg.threshold * 1.5;
    const pct = Math.min(100, (exposure / maxDisplay) * 100);
    const fill = $('#exposureFill');
    fill.style.width = pct + '%';

    if (exposure > cfg.threshold * 0.8) fill.style.background = '#ef4444';
    else if (exposure > cfg.threshold * 0.5) fill.style.background = '#f59e0b';
    else fill.style.background = '#22c55e';

    $('#exposureText').textContent = `${Math.round(exposure)} / ${cfg.threshold}`;
    $('#exposureThreshold').style.left = (cfg.threshold / maxDisplay * 100) + '%';

    // 扫描提示
    const nextScan = cfg.reaperScanInterval - (civ.turn % cfg.reaperScanInterval);
    if (nextScan === cfg.reaperScanInterval) {
      $('#scanHint').textContent = '⚡ 本回合收割者正在扫描！';
      $('#scanHint').style.color = '#60a5fa';
    } else {
      $('#scanHint').textContent = `下次扫描：${nextScan} 回合后`;
      $('#scanHint').style.color = '#64748b';
    }
  }

  // ── 日志 ──
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

  // ── 图表 ──
  function initChart() {
    if (chartInstance) chartInstance.destroy();
    const ctx = $('#gameChart').getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [0],
        datasets: [
          { label: '科技', data: [civ.tech], borderColor: '#60a5fa', borderWidth: 2, pointRadius: 0, tension: 0.3 },
          { label: '信号', data: [civ.signal], borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, tension: 0.3 },
          { label: '隐蔽', data: [civ.stealth], borderColor: '#22c55e', borderWidth: 2, pointRadius: 0, tension: 0.3 },
          { label: '暴露度', data: [0], borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0.3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
          annotation: {},
        },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
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
    chartInstance.data.datasets[1].data.push(last.signal);
    chartInstance.data.datasets[2].data.push(last.stealth);
    chartInstance.data.datasets[3].data.push(last.exposure);
    chartInstance.update('none');
  }

  // ── 结果 ──
  function showResult() {
    showPhase('result');

    const score = computeScore(civ);
    $('#scoreDisplay').textContent = score + ' 分';
    $('#surviveTurns').textContent = civ.turn;

    if (civ.escaped) {
      $('#resultIcon').innerHTML = '<i class="ti ti-rocket" style="color:#22c55e"></i>';
      $('#resultTitle').textContent = '逃逸成功';
      $('#resultTitle').className = 'result-title escaped';
      $('#resultDesc').textContent = '你的文明在收割者检测到之前达到了逃逸科技等级，突破了宇宙封锁。这在统计上是小概率事件。';
    } else if (!civ.alive && civ.turn < civ.config.maxTurns) {
      $('#resultIcon').innerHTML = '<i class="ti ti-skull" style="color:#ef4444"></i>';
      $('#resultTitle').textContent = '已被收割';
      $('#resultTitle').className = 'result-title reaped';
      $('#resultDesc').textContent = '你的文明电磁辐射超过了收割者的检测阈值。清扫程序启动，文明在毫秒内被抹除。没有警告，没有谈判。';
    } else {
      $('#resultIcon').innerHTML = '<i class="ti ti-hourglass" style="color:#f59e0b"></i>';
      $('#resultTitle').textContent = '资源耗尽';
      $('#resultTitle').className = 'result-title timeout';
      $('#resultDesc').textContent = '你的文明过于保守，在有限的时间窗口内未能达到逃逸科技。恒星进入红巨星阶段，文明随之消亡。';
    }

    // 蒙特卡洛
    runMonteCarlo();

    // 提交到后端
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

  // ── 后端交互 ──
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
        if (data.status === 200 && data.data) {
          showGlobalStats(data.data);
        }
      })
      .catch(() => { /* 静默失败 */ });
  }

  function showGlobalStats(data) {
    const card = $('#globalStatsCard');
    card.style.display = 'block';
    const container = $('#globalStats');
    container.innerHTML = `
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
        <div class="gs-value">${data.topStrategy || '-'}</div>
        <div class="gs-label">最常用策略</div>
      </div>
    `;
  }

  function getMostUsedStrategy() {
    const counts = {};
    strategyHistory.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    let max = 0, best = 'balanced';
    Object.entries(counts).forEach(([k, v]) => { if (v > max) { max = v; best = k; } });
    return best;
  }

})();
