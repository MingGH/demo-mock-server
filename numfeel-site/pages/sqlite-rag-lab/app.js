/**
 * 一个文件的 AI 大脑 · SQLite RAG 实验室 - 页面交互层
 * 只做 DOM 绑定与请求编排，纯逻辑全部在 logic.js（window.SqliteRagLogic）。
 */

(function() {
  'use strict';

  const L = window.SqliteRagLogic;
  const API_BASE = 'https://numfeel-api.996.ninja';

  const $ = id => document.getElementById(id);
  const els = {
    askInput: $('ask-input'),
    askBtn: $('ask-btn'),
    askSuggest: $('ask-suggest'),
    askStatus: $('ask-status'),
    askTimer: $('ask-timer'),
    askError: $('ask-error'),
    askResults: $('ask-results'),
    timingWrap: $('timing-chart-wrap'),
    timingCanvas: $('timing-chart'),
    battleInput: $('battle-input'),
    battleStart: $('battle-start'),
    battleSuggest: $('battle-suggest'),
    battleCards: $('battle-cards'),
    battleActions: $('battle-actions'),
    battleSubmit: $('battle-submit'),
    battleAgain: $('battle-again'),
    battleProgress: $('battle-progress'),
    battleVerdict: $('battle-verdict'),
    battleScorebar: $('battle-scorebar'),
    scoreTotal: $('score-total'),
    scoreStreak: $('score-streak'),
    scoreBest: $('score-best'),
    feedTitle: $('feed-title'),
    feedText: $('feed-text'),
    feedSubmit: $('feed-submit'),
    feedMsg: $('feed-msg'),
    infoRow: $('info-row'),
  };

  const SCORE_KEY = 'sqrug_score_v1';
  let timingChart = null;
  let battleRound = null;
  let battlePicks = [];
  let battleVerdictShown = false;
  let askTicker = null;
  let score = loadScore();

  // ============= 本地积分 =============

  function loadScore() {
    try {
      return JSON.parse(localStorage.getItem(SCORE_KEY)) || { score: 0, streak: 0, best: 0 };
    } catch (e) {
      return { score: 0, streak: 0, best: 0 };
    }
  }

  function saveScore(state) {
    try {
      localStorage.setItem(SCORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* 隐身模式等场景静默失败 */
    }
  }

  function renderScorebar() {
    els.battleScorebar.classList.remove('hidden');
    els.scoreTotal.textContent = score.score;
    els.scoreStreak.textContent = score.streak;
    els.scoreBest.textContent = score.best;
  }

  // ============= API（统一信封解析） =============

  function parseEnvelope(json) {
    if (json && json.status === 200) return json.data;
    throw new Error((json && json.message) || '请求失败');
  }

  function apiGet(path) {
    return fetch(API_BASE + path).then(r => r.json()).then(parseEnvelope);
  }

  function apiPost(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()).then(parseEnvelope);
  }

  // ============= 检索实验台 =============

  async function ask(question) {
    const q = (question || els.askInput.value || '').trim();
    if (!q) {
      showAskError('先写点什么，比如：微信聊天记录藏在哪');
      return;
    }
    els.askError.classList.add('hidden');
    els.askResults.innerHTML = '';
    els.timingWrap.classList.add('hidden');
    els.askStatus.classList.remove('hidden');
    els.askBtn.disabled = true;

    const started = performance.now();
    clearInterval(askTicker);
    askTicker = setInterval(() => {
      els.askTimer.textContent = L.formatMs(performance.now() - started);
    }, 40);

    try {
      const data = await apiPost('/sqlite-rag/ask', { query: q });
      const elapsed = performance.now() - started;
      clearInterval(askTicker);
      els.askTimer.textContent = L.formatMs(elapsed);
      renderAsk(data, elapsed);
      try {
        window.NFTrack.track('rag_ask', { ms: Math.round(elapsed), hits: data.results.length });
      } catch (e) {
        /* 埋点失败静默 */
      }
      refreshInfo();
    } catch (e) {
      clearInterval(askTicker);
      showAskError(e.message);
    } finally {
      els.askBtn.disabled = false;
      els.askStatus.classList.add('hidden');
    }
  }

  function showAskError(msg) {
    els.askError.textContent = msg;
    els.askError.classList.remove('hidden');
  }

  function renderAsk(data, elapsed) {
    const rows = data.results.map(r => {
      const both = r.engines.includes('fts') && r.engines.includes('vec');
      const chip = both
        ? '<span class="chip both">两边都看上它 + RRF 融合</span>'
        : `<span class="chip ${r.engine}">${r.engine === 'fts' ? '关键词抓到' : '语义联想'}</span>`;
      const parts = L.buildHighlight(r.content, data.query)
        .map(p => (p.hit ? `<mark>${escapeHtml(p.text)}</mark>` : escapeHtml(p.text)))
        .join('');
      return `
        <div class="result-card">
          <div class="rc-head">
            <span class="rc-title"><i class="ti ti-file-text"></i> ${escapeHtml(r.title)}</span>
            ${chip}
          </div>
          <div class="rc-content">${parts}</div>
        </div>`;
    }).join('');
    els.askResults.innerHTML = rows;
    renderTimingChart(data.timings);
    els.timingWrap.classList.remove('hidden');
    const cards = els.askResults.querySelectorAll('.result-card');
    if (window.gsap) {
      gsap.from(cards, { opacity: 0, y: 14, duration: 0.4, stagger: 0.07, ease: 'power2.out' });
    }
  }

  function renderTimingChart(timings) {
    const entries = [
      { label: '关键词', value: timings.fts, color: '#ff8a93' },
      { label: '向量', value: timings.vec, color: '#90caf9' },
      { label: '融合', value: timings.fuse, color: '#ffd700' },
    ];
    if (timingChart) {
      timingChart.destroy();
    }
    timingChart = new Chart(els.timingCanvas, {
      type: 'bar',
      data: {
        labels: entries.map(e => e.label),
        datasets: [{
          data: entries.map(e => e.value),
          backgroundColor: entries.map(e => e.color),
          borderRadius: 6,
          barThickness: 22,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(2)} ms` } },
        },
        scales: {
          x: { display: false },
          y: { ticks: { color: '#9aa0c3' }, grid: { display: false }, border: { display: false } },
        },
      },
    });
  }

  // ============= 盲测对战 =============

  async function startBattle(question) {
    const q = (question || els.battleInput.value || '').trim();
    if (!q) {
      els.battleInput.focus();
      return;
    }
    els.battleVerdict.classList.add('hidden');
    els.battleCards.innerHTML = '';
    els.battleActions.classList.add('hidden');
    try {
      const data = await apiPost('/sqlite-rag/battle', { query: q });
      const seed = Math.floor(Math.random() * 1e9);
      battleRound = { query: q, ...data, shuffled: L.shuffleWithSeed(data.cards, seed) };
      battlePicks = [];
      battleVerdictShown = false;
      els.battleActions.classList.remove('hidden');
      renderBattleCards();
      updateProgress();
    } catch (e) {
      showBattleVerdict(e.message, false);
    }
  }

  function renderBattleCards() {
    els.battleScorebar.classList.remove('hidden');
    els.battleCards.innerHTML = battleRound.shuffled.map((c, i) => `
      <button type="button" class="bcard" data-id="${c.chunkId}">
        <span class="no">${i + 1}</span>${escapeHtml(c.content)}
      </button>
    `).join('');
    els.battleCards.querySelectorAll('.bcard').forEach(btn => {
      btn.addEventListener('click', () => togglePick(Number(btn.dataset.id), btn));
    });
    if (window.gsap) {
      gsap.from(els.battleCards.querySelectorAll('.bcard'), { opacity: 0, scale: 0.92, duration: 0.3, stagger: 0.05 });
    }
  }

  function togglePick(id, btn) {
    if (battleVerdictShown) return;
    const idx = battlePicks.indexOf(id);
    if (idx >= 0) {
      battlePicks.splice(idx, 1);
      btn.classList.remove('picked');
    } else if (battlePicks.length < 3) {
      battlePicks.push(id);
      btn.classList.add('picked');
    }
    btn.setAttribute('aria-pressed', String(idx === -1));
    updateProgress();
  }

  function updateProgress() {
    els.battleProgress.textContent = `已选 ${battlePicks.length} / 3`;
    els.battleSubmit.disabled = battlePicks.length === 0;
  }

  function submitBattle() {
    if (!battleRound || battleVerdictShown || battlePicks.length === 0) return;
    battleVerdictShown = true;

    const grade = L.gradePicks(battlePicks, battleRound.target);
    els.battleCards.querySelectorAll('.bcard').forEach(btn => {
      const id = Number(btn.dataset.id);
      if (battleRound.target.includes(id)) {
        btn.classList.add('correct');
      } else if (battlePicks.includes(id)) {
        btn.classList.add('wrong');
      } else {
        btn.classList.add('dim');
      }
    });

    score = L.nextScore(score, grade);
    saveScore(score);
    renderScorebar();

    showBattleVerdict(
      `${grade.message} 命中 ${grade.hit} 张，本局 +${grade.score} 分。`,
      grade.hit >= 2 || grade.perfect
    );
    try {
      window.NFTrack.track('rag_battle', { hit: grade.hit, perfect: grade.perfect, total: score.score });
    } catch (e) {
      /* 埋点失败静默 */
    }
    els.battleSubmit.disabled = true;
  }

  function showBattleVerdict(msg, good) {
    els.battleVerdict.classList.remove('hidden', 'good', 'bad');
    els.battleVerdict.classList.add(good ? 'good' : 'bad');
    els.battleVerdict.textContent = msg;
  }

  // ============= 投喂 =============

  async function feed() {
    const title = els.feedTitle.value.trim();
    const text = els.feedText.value.trim();
    els.feedMsg.classList.remove('err');
    els.feedMsg.textContent = '';
    els.feedSubmit.disabled = true;
    try {
      const data = await apiPost('/sqlite-rag/ingest', { title: title || '未命名记忆', text });
      els.feedMsg.textContent = `吃进去了，只花 ${L.formatMs(data.ingestMs)}，现在去上面问它一定能查到。`;
      els.feedTitle.value = '';
      els.feedText.value = '';
      try {
        window.NFTrack.track('rag_feed', { chunks: data.chunks, ms: Math.round(data.ingestMs) });
      } catch (e) {
        /* 埋点失败静默 */
      }
      refreshInfo();
    } catch (e) {
      els.feedMsg.textContent = e.message;
      els.feedMsg.classList.add('err');
    } finally {
      els.feedSubmit.disabled = false;
    }
  }

  // ============= 档案卡 =============

  async function refreshInfo() {
    try {
      const info = await apiGet('/sqlite-rag/info');
      const counts = info.counts || {};
      els.infoRow.innerHTML = `
        <span>SQLite 版本 <b>${escapeHtml(String(info.sqliteVersion))}</b></span>
        <span>知识 <b>${counts.docs}</b> 篇 / <b>${counts.chunks}</b> 块</span>
        <span>关键词检索 <b>${escapeHtml(info.ftsBackend)}</b></span>
        <span>语义检索 <b>${escapeHtml(info.vectorBackend)}</b></span>
        <span>整个知识库 = <b>${L.formatBytes(info.dbBytes)}</b> 的一个文件</span>`;
    } catch (e) {
      els.infoRow.textContent = '后端暂不可达，稍后再试。';
    }
  }

  // ============= 工具 =============

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[ch]));
  }

  // ============= 建议问题 & 事件绑定 =============

  function addSuggestionButtons(container, onClick) {
    L.QUESTION_SUGGESTIONS.forEach(q => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-chip';
      btn.textContent = q;
      btn.addEventListener('click', () => onClick(q));
      container.appendChild(btn);
    });
  }

  els.askBtn.addEventListener('click', () => ask());
  els.askInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') ask();
  });
  els.battleStart.addEventListener('click', () => startBattle());
  els.battleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') startBattle();
  });
  els.battleSubmit.addEventListener('click', submitBattle);
  els.battleAgain.addEventListener('click', () => {
    els.battleInput.value = '';
    startBattle();
  });
  els.feedSubmit.addEventListener('click', feed);

  addSuggestionButtons(els.askSuggest, q => {
    els.askInput.value = q;
    ask(q);
  });
  (function addBattleSuggestions() {
    L.QUESTION_SUGGESTIONS.slice(0, 4).forEach(q => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-chip';
      btn.textContent = q;
      btn.addEventListener('click', () => {
        els.battleInput.value = q;
        startBattle(q);
      });
      els.battleSuggest.appendChild(btn);
    });
  })();

  try {
    window.NFTrack.trackOnce('rag_session_start', {});
  } catch (e) {
    /* 埋点失败静默 */
  }

  refreshInfo();
})();
