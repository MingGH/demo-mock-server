// ========== 离线生存实验室：交互逻辑 ==========
// SW 注册、真实网络检测、四幕交互、笔记本真实持久化。
// 核心算法在 offline-engine.js（window 上挂载）。

(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  // ── 全局状态 ──
  var state = {
    online: navigator.onLine,
    act1SimOffline: false,
    noteStore: null,
    syncQueue: null,
    scoreChart: null,
    lastScore: null
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    registerSW();
    bindNetworkDetection();
    bindAct1();
    bindAct2();
    bindAct3();
    bindAct4();
  }

  // ══════════════════════════════════════════════
  // 真实网络状态检测
  // ══════════════════════════════════════════════

  function bindNetworkDetection() {
    updateOnlineState();
    window.addEventListener('online', function () { state.online = true; onNetworkChange(); });
    window.addEventListener('offline', function () { state.online = false; onNetworkChange(); });
    // 定时探测（navigator.onLine 不一定准）
    setInterval(probeNetwork, 4000);
    probeNetwork();
  }

  function probeNetwork() {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var signal = controller ? controller.signal : undefined;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 3000);
    fetch('https://www.gstatic.com/generate_204', { method: 'HEAD', mode: 'no-cors', signal: signal })
      .then(function () {
        clearTimeout(timer);
        if (!state.online) { state.online = true; onNetworkChange(); }
      })
      .catch(function () {
        clearTimeout(timer);
        if (state.online) { state.online = false; onNetworkChange(); }
      });
  }

  function onNetworkChange() {
    updateOnlineState();
    // 恢复网络时自动同步笔记
    if (state.online && state.syncQueue) {
      syncPendingNotes();
    }
  }

  function updateOnlineState() {
    var on = state.online;
    var ind = $('#netIndicator');
    ind.classList.toggle('offline', !on);
    ind.querySelector('.net-text').textContent = on ? '在线' : '离线';
    // 第二幕状态
    var act2Status = $('#act2NetStatus');
    if (act2Status) {
      act2Status.textContent = on ? '在线（断网后再试试加载）' : '已离线 — 现在点加载按钮';
      act2Status.className = 'rs-value ' + (on ? 'online' : 'offline');
    }
    // 第三幕状态
    var nsText = $('#nsText');
    if (nsText) nsText.textContent = on ? '在线' : '离线';
    var bar = $('#noteStatusBar');
    if (bar) bar.classList.toggle('offline', !on);
  }

  // ══════════════════════════════════════════════
  // Service Worker 注册
  // ══════════════════════════════════════════════

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      if (reg.active) {
        showToast('Service Worker 已激活，本页可离线访问');
      } else {
        var worker = reg.installing || reg.waiting;
        if (worker) {
          worker.addEventListener('statechange', function () {
            if (worker.state === 'activated') showToast('Service Worker 已激活，本页可离线访问');
          });
        }
      }
    }).catch(function () {});
  }

  function showToast(msg) {
    var t = $('#swToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  // ══════════════════════════════════════════════
  // 第一幕：模拟断网对照组
  // ══════════════════════════════════════════════

  function bindAct1() {
    var toggle = $('#offlineToggle');
    var body = $('#browserBody');
    var overlay = $('#deathOverlay');

    toggle.addEventListener('click', function () {
      state.act1SimOffline = !state.act1SimOffline;
      var off = state.act1SimOffline;
      toggle.classList.toggle('offline', off);
      toggle.querySelector('span').textContent = off ? '恢复' : '模拟断网';

      if (off) {
        if (window.gsap) gsap.to(body.children, { opacity: 0.15, y: 10, stagger: 0.08, duration: 0.35, ease: 'power2.in' });
        body.classList.add('dead');
        overlay.classList.add('show');
        $('#act1Verdict').hidden = false;
        $('#act1Next').hidden = false;
      } else {
        if (window.gsap) gsap.to(body.children, { opacity: 1, y: 0, stagger: 0.08, duration: 0.35, ease: 'power2.out' });
        body.classList.remove('dead');
        overlay.classList.remove('show');
      }
    });

    $('#todoSubmit').addEventListener('click', function () {
      var input = $('#todoInput');
      if (!input.value.trim()) return;
      var err = $('#todoError');
      if (state.act1SimOffline) {
        err.textContent = '网络请求失败：ERR_INTERNET_DISCONNECTED';
        err.classList.add('show');
      } else {
        err.textContent = ''; input.value = '';
      }
    });

    $('#goAct2').addEventListener('click', function () { reveal('#act2'); });
  }

  // ══════════════════════════════════════════════
  // 第二幕：真实离线加载验证
  // ══════════════════════════════════════════════

  function bindAct2() {
    $('#loadProofBtn').addEventListener('click', loadCachedResource);
    $('#goAct3').addEventListener('click', function () { reveal('#act3'); initNotes(); });
  }

  function loadCachedResource() {
    var placeholder = $('#proofPlaceholder');
    var img = $('#proofImage');
    var text = $('#proofText');
    var result = $('#proofResult');

    placeholder.hidden = true;
    result.hidden = false;

    var startTime = performance.now();

    // 尝试加载一个已被 SW 缓存的本地资源
    fetch('./style.css', { cache: 'no-store' }).then(function (res) {
      var elapsed = Math.round(performance.now() - startTime);
      if (res.ok) {
        return res.text().then(function (body) {
          text.hidden = false;
          text.innerHTML = '<i class="ti ti-circle-check"></i> 资源加载成功（' + elapsed + 'ms）' +
            '<br><span class="proof-detail">来源：' + (state.online ? '网络或缓存' : '<b>Service Worker 缓存</b>（你现在没网）') + '</span>' +
            '<br><span class="proof-detail">大小：' + body.length + ' 字节</span>';
          text.className = 'proof-text success';
          result.innerHTML = state.online
            ? '在线加载成功。现在试试断网（飞行模式）后再点一次——还是能加载。'
            : '<span class="gold">断网状态下加载成功。这就是 Service Worker + Cache API 的力量。</span>';
        });
      } else {
        throw new Error('status ' + res.status);
      }
    }).catch(function (err) {
      text.hidden = false;
      text.innerHTML = '<i class="ti ti-circle-x"></i> 加载失败：' + err.message;
      text.className = 'proof-text fail';
      result.innerHTML = 'Service Worker 可能还没安装完成。刷新页面后重试。';
    });
  }

  // ══════════════════════════════════════════════
  // 第三幕：真实 IndexedDB 笔记本
  // ══════════════════════════════════════════════

  function initNotes() {
    if (state.noteStore) { renderNotes(); updateQueueCount(); return; }
    state.noteStore = new window.OfflineNoteStore('offline-lab-notes');
    state.syncQueue = new window.SyncQueue(state.noteStore, {
      isOnline: function () { return state.online; },
      syncDelay: 500,
      onSync: function (note) { updateNoteCard(note.id, 'synced'); }
    });
    renderNotes();
    updateQueueCount();
    // 如果当前在线，同步之前断网时写的
    if (state.online) syncPendingNotes();
  }

  function bindAct3() {
    $('#noteSubmit').addEventListener('click', submitNote);
    $('#noteInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote();
    });
    $('#noteClear').addEventListener('click', function () {
      if (!state.noteStore) return;
      if (!confirm('清空全部笔记？')) return;
      state.noteStore.clearAll().then(function () { renderNotes(); updateQueueCount(); });
    });
    $('#goAct4').addEventListener('click', function () { reveal('#act4'); });
  }

  function submitNote() {
    var input = $('#noteInput');
    var text = input.value.trim();
    if (!text) return;
    if (!state.noteStore) initNotes();

    var synced = state.online; // 真实网络状态决定是否立即同步
    state.noteStore.addNote(text, synced).then(function (note) {
      input.value = '';
      renderNotes(note.id);
      updateQueueCount();
      if (!synced) {
        showToast('笔记已离线保存，联网后自动同步');
      }
    });
  }

  function syncPendingNotes() {
    if (!state.syncQueue) return;
    state.syncQueue.processQueue().then(function (res) {
      if (res.synced > 0) {
        showToast('已同步 ' + res.synced + ' 条笔记');
        renderNotes();
      }
      updateQueueCount();
    });
  }

  function renderNotes(newId) {
    var list = $('#noteList');
    if (!state.noteStore) { list.innerHTML = ''; return; }
    state.noteStore.getAllNotes().then(function (notes) {
      if (notes.length === 0) {
        list.innerHTML = '<div class="note-empty">还没有笔记。写一条试试。</div>';
        return;
      }
      list.innerHTML = notes.map(function (n) {
        var st = n.synced ? 'synced' : 'pending';
        var icon = n.synced ? '<i class="ti ti-check"></i>' : '<i class="ti ti-clock-hour-4"></i>';
        var label = n.synced ? '已同步' : '待同步';
        var bounce = n.id === newId ? ' bounce' : '';
        return '<div class="note-card' + bounce + '" data-id="' + n.id + '">' +
          '<div class="note-status ' + st + '">' + icon + '</div>' +
          '<div class="note-body"><div class="note-text">' + escapeHtml(n.text) + '</div>' +
          '<div class="note-meta">' + formatTime(n.timestamp) + ' · ' + label + '</div></div></div>';
      }).join('');
    });
  }

  function updateNoteCard(id, status) {
    var card = document.querySelector('.note-card[data-id="' + id + '"]');
    if (!card) return;
    var stEl = card.querySelector('.note-status');
    stEl.classList.remove('pending', 'failed');
    stEl.classList.add(status);
    stEl.innerHTML = '<i class="ti ti-check"></i>';
    if (window.gsap) gsap.fromTo(card, { scale: 1 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1 });
    var meta = card.querySelector('.note-meta');
    if (meta) meta.textContent = meta.textContent.replace(/待同步/, '已同步');
  }

  function updateQueueCount() {
    if (!state.noteStore) { $('#queueCount').textContent = '0'; return; }
    state.noteStore.getPendingSync().then(function (list) {
      $('#queueCount').textContent = list.length;
    });
  }

  // ══════════════════════════════════════════════
  // 第四幕：评分
  // ══════════════════════════════════════════════

  function bindAct4() {
    $('#runScoreBtn').addEventListener('click', runScore);
    $('#copyReportBtn').addEventListener('click', copyReport);
  }

  function runScore() {
    $('#runScoreBtn').disabled = true;
    var items = $$('.score-item');
    items.forEach(function (it) {
      it.classList.add('spin');
      it.querySelector('.ti').className = 'ti ti-loader';
      it.querySelector('.sc-val').className = 'sc-val wait';
      it.querySelector('.sc-val').textContent = '检测中…';
    });

    window.getFullScore().then(function (score) {
      state.lastScore = score;
      items.forEach(function (it, i) {
        var res = score.items[i].result;
        setTimeout(function () {
          it.classList.remove('spin');
          it.querySelector('.sc-val').textContent = res.score + ' / 20';
          it.querySelector('.sc-val').className = 'sc-val ' + (res.score > 0 ? 'ok' : 'bad');
          it.querySelector('.ti').className = 'ti ' + (res.score > 0 ? 'ti-circle-check' : 'ti-circle-x');
          it.title = res.detail;
        }, i * 350);
      });
      setTimeout(function () { drawChart(score.total); showVerdict(score); }, items.length * 350 + 200);
    });
  }

  function drawChart(total) {
    var canvas = $('#scoreChart');
    if (!canvas) return;
    window.loadChartJS().then(function () {
      if (state.scoreChart) state.scoreChart.destroy();
      state.scoreChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [total, 100 - total],
            backgroundColor: [total >= 80 ? '#ffd700' : total >= 60 ? '#ffb700' : '#ff6b6b', 'rgba(255,255,255,0.08)'],
            borderWidth: 0
          }]
        },
        options: { cutout: '72%', responsive: false, animation: { duration: 900 }, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
      var ctx = canvas.getContext('2d');
      setTimeout(function () {
        ctx.fillStyle = total >= 80 ? '#ffd700' : '#e8e8e8';
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(total, canvas.width / 2, canvas.height / 2 - 6);
        ctx.font = '13px sans-serif'; ctx.fillStyle = '#888';
        ctx.fillText('/ 100', canvas.width / 2, canvas.height / 2 + 24);
      }, 100);
    });
  }

  function showVerdict(score) {
    $('#runScoreBtn').disabled = false;
    var v = $('#scoreVerdict');
    var hint = $('#scoreHint');
    if (score.total === 100) {
      v.textContent = '这个页面已经具备完整的离线生存能力';
      v.hidden = false; hint.hidden = true;
      spawnGoldParticles();
    } else {
      v.hidden = true;
      var missing = score.items.filter(function (it) { return it.result.score === 0; })
        .map(function (it) { return it.name + '（' + it.result.detail + '）'; }).join('；');
      hint.textContent = '缺失项：' + missing;
      hint.hidden = false;
    }
  }

  function spawnGoldParticles() {
    var box = document.createElement('div');
    box.className = 'gold-particles';
    document.body.appendChild(box);
    for (var i = 0; i < 28; i++) {
      var s = document.createElement('span');
      s.style.left = (Math.random() * 100) + '%';
      s.style.animationDelay = (Math.random() * 1.2) + 's';
      s.style.animationDuration = (2 + Math.random() * 1.6) + 's';
      box.appendChild(s);
    }
    setTimeout(function () { box.remove(); }, 4200);
  }

  function copyReport() {
    if (!state.lastScore) { showToast('请先点击「开始检测」'); return; }
    var s = state.lastScore;
    var lines = ['离线能力评估报告', '总分：' + s.total + ' / 100', ''];
    s.items.forEach(function (it) {
      lines.push(it.name + '：' + it.result.score + '/20 - ' + it.result.detail);
    });
    lines.push('', '来源：离线生存实验室 ' + location.href);
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast('报告已复制'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast('报告已复制'); } catch (e) { showToast('复制失败'); }
      ta.remove();
    }
  }

  // ══════════════════════════════════════════════
  // 工具函数
  // ══════════════════════════════════════════════

  function reveal(sel) {
    var el = $(sel);
    el.hidden = false;
    if (window.gsap) gsap.from(el, { opacity: 0, y: 30, duration: 0.6, ease: 'power2.out' });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    return d.getMonth() + 1 + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
})();
