// ========== 离线生存实验室：交互逻辑 ==========
// 负责 SW 注册、四幕交互、GSAP 动画、Chart.js 评分图。
// 核心算法在 offline-engine.js（window 上已挂载）。

(function () {
  'use strict';

  // ── 全局状态 ──
  var state = {
    act1Offline: false,    // 第一幕模拟断网开关
    noteOffline: false,    // 第三幕笔记本断网开关
    noteStore: null,
    syncQueue: null,
    scoreChart: null,
    lastScore: null
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    registerSW();
    bindRealNetworkStatus();
    bindAct1();
    bindAct2();
    bindAct3();
    bindAct4();
  }

  // ── 真实网络状态监听 ──
  function bindRealNetworkStatus() {
    updateNetIndicator();
    window.addEventListener('online', updateNetIndicator);
    window.addEventListener('offline', updateNetIndicator);
  }

  // 综合判断：真实离线 OR 任何一个模拟开关打开 = 显示离线
  function isEffectivelyOffline() {
    return !navigator.onLine || state.act1Offline || state.noteOffline;
  }

  function updateNetIndicator() {
    var offline = isEffectivelyOffline();
    var ind = $('#netIndicator');
    ind.classList.toggle('offline', offline);
    var label = '';
    if (!navigator.onLine) {
      label = '真实离线';
    } else if (state.act1Offline || state.noteOffline) {
      label = '模拟离线';
    } else {
      label = '在线';
    }
    ind.querySelector('.net-text').textContent = label;
  }

  // ── Service Worker 注册 + toast ──
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // 站点根 /sw.js 由 header.js 注册；这里再注册本目录专属 SW，更具体作用域优先
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      if (reg.active) {
        showSwToast('Service Worker 已激活，本页可离线');
      } else {
        var state2 = reg.installing || reg.waiting;
        if (state2) {
          state2.addEventListener('statechange', function () {
            if (state2.state === 'activated') showSwToast('Service Worker 已激活，本页可离线');
          });
        }
      }
    }).catch(function () { /* 静默 */ });
  }

  function showSwToast(msg) {
    var t = $('#swToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  // ════════ 第一幕：断网恐惧 ════════
  function bindAct1() {
    var toggle = $('#offlineToggle');
    var body = $('#browserBody');
    var overlay = $('#deathOverlay');
    var verdict = $('#act1Verdict');
    var next = $('#act1Next');
    var todoSubmit = $('#todoSubmit');
    var todoError = $('#todoError');

    toggle.addEventListener('click', function () {
      state.act1Offline = !state.act1Offline;
      var offline = state.act1Offline;
      toggle.classList.toggle('offline', offline);
      toggle.querySelector('span').textContent = offline ? '恢复联网' : '模拟断网';
      updateNetIndicator();

      if (offline) {
        // 元素依次消失
        if (window.gsap) {
          gsap.to(body.children, { opacity: 0.15, y: 10, stagger: 0.08, duration: 0.35, ease: 'power2.in' });
        }
        body.classList.add('dead');
        overlay.classList.add('show');
        verdict.hidden = false;
        next.hidden = false;
      } else {
        if (window.gsap) {
          gsap.to(body.children, { opacity: 1, y: 0, stagger: 0.08, duration: 0.35, ease: 'power2.out' });
        }
        body.classList.remove('dead');
        overlay.classList.remove('show');
        todoError.classList.remove('show');
        todoError.textContent = '';
      }
    });

    todoSubmit.addEventListener('click', function () {
      var input = $('#todoInput');
      if (!input.value.trim()) return;
      if (state.act1Offline) {
        todoError.textContent = '网络请求失败：ERR_INTERNET_DISCONNECTED';
        todoError.classList.add('show');
      } else {
        todoError.textContent = '提交成功（在线）';
        todoError.style.color = '#81c784';
        input.value = '';
        setTimeout(function () { todoError.textContent = ''; todoError.style.color = ''; }, 1500);
      }
    });

    $('#goAct2').addEventListener('click', function () {
      reveal('#act2');
    });
  }

  // ════════ 第二幕：缓存策略对比 ════════
  function bindAct2() {
    var tabs = $$('.strat-tab');
    var cards = $$('.strat-card');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var s = tab.dataset.strat;
        cards.forEach(function (c) { c.classList.toggle('active', c.dataset.strat === s); });
      });
    });
    // 默认激活第一个（移动端）
    cards[0].classList.add('active');

    $('#loadResBtn').addEventListener('click', function () { runStrategies(false); });
    $('#loadOfflineBtn').addEventListener('click', function () { runStrategies(true); });
    $('#goAct3').addEventListener('click', function () { reveal('#act3'); initNotes(); });
  }

  function runStrategies(offline) {
    var cards = $$('.strat-card');
    $('#loadResBtn').disabled = true;
    $('#loadOfflineBtn').disabled = true;

    cards.forEach(function (card) {
      resetCard(card);
      var strat = card.dataset.strat;
      var bar = card.querySelector('[data-fill]');
      var latencyEl = card.querySelector('.mb-latency');
      var sourceEl = card.querySelector('.mb-source');

      var opts = {
        hasCache: offline, online: !offline,
        networkLatency: 600, cacheLatency: 30, timeout: 3000
      };
      var promise;
      if (strat === 'cacheFirst') promise = window.simulateCacheFirst(opts);
      else if (strat === 'networkFirst') promise = window.simulateNetworkFirst(opts);
      else promise = window.simulateSWR(opts);

      // 进度条动画
      if (window.gsap) gsap.to(bar, { width: '100%', duration: offline && strat === 'networkFirst' ? 3 : 0.6, ease: 'power1.out' });

      promise.then(function (r) {
        latencyEl.textContent = r.latency + 'ms';
        if (r.source === 'cache') { sourceEl.textContent = '✓ 缓存命中'; sourceEl.style.color = '#81c784'; }
        else if (r.source === 'network') { sourceEl.textContent = '✓ 网络获取'; sourceEl.style.color = '#81c784'; }
        else if (r.source === 'timeout') { sourceEl.textContent = '✗ 超时'; sourceEl.style.color = '#ff6b6b'; }
        if (strat === 'swr' && r.bgUpdate) {
          sourceEl.textContent += r.bgUpdateOk ? ' (后台已更新)' : ' (后台更新失败)';
          if (!r.bgUpdateOk) sourceEl.style.color = '#ffb700';
        }
        // Network First 断网有缓存：等很久才回退，用橙色警告
        if (strat === 'networkFirst' && offline && r.source === 'cache') {
          sourceEl.textContent = '⚠ 超时后回退缓存';
          sourceEl.style.color = '#ffb700';
        }
      });
    });

    setTimeout(function () {
      $('#loadResBtn').disabled = false;
      $('#loadOfflineBtn').disabled = false;
    }, 3400);
  }

  function resetCard(card) {
    card.querySelector('[data-fill]').style.width = '0%';
    var latencyEl = card.querySelector('.mb-latency');
    var sourceEl = card.querySelector('.mb-source');
    latencyEl.textContent = '-'; sourceEl.textContent = ''; sourceEl.style.color = '';
  }

  // ════════ 第三幕：IndexedDB 笔记本 ════════
  function initNotes() {
    if (state.noteStore) { renderNotes(); return; }
    var store = new window.OfflineNoteStore('offline-lab-notes');
    state.noteStore = store;
    state.syncQueue = new window.SyncQueue(store, {
      isOnline: function () { return !state.noteOffline; },
      syncDelay: 500,
      onSync: function (note) {
        // 单条同步成功 -> 更新该卡片状态
        updateNoteCard(note.id, 'synced');
      }
    });
    renderNotes();
  }

  function bindAct3() {
    $('#noteSubmit').addEventListener('click', submitNote);
    $('#noteInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote();
    });

    $('#noteOfflineToggle').addEventListener('click', function () {
      state.noteOffline = !state.noteOffline;
      var off = state.noteOffline;
      var btn = $('#noteOfflineToggle');
      btn.classList.toggle('offline', off);
      btn.querySelector('span').textContent = off ? '恢复联网' : '模拟断网';
      var bar = $('#noteStatusBar');
      bar.classList.toggle('offline', off);
      $('#nsText').textContent = off ? '离线' : '在线';
      updateNetIndicator();

      if (!off) {
        // 恢复联网 -> 自动同步
        $('#noteGuide').textContent = '恢复联网，正在同步待处理笔记……';
        state.syncQueue.processQueue().then(function (res) {
          updateQueueCount();
          renderNotes();
          if (res.synced > 0) {
            $('#noteGuide').textContent = '已同步 ' + res.synced + ' 条，用户全程无感知。';
            $('#act3Verdict').hidden = false;
            $('#act3Next').hidden = false;
          } else {
            $('#noteGuide').textContent = '没有待同步的笔记。';
          }
        });
      } else {
        $('#noteGuide').textContent = '已断网。现在写笔记仍会保存，只是标记为「待同步」。';
      }
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
    var synced = !state.noteOffline;
    state.noteStore.addNote(text, synced).then(function (note) {
      input.value = '';
      // 若离线，入队（实际就是 synced=false 留在 store）
      if (!synced) {
        state.syncQueue.enqueue(note.id).then(function () {
          updateQueueCount();
          $('#noteGuide').textContent = '笔记已离线保存（待同步）。恢复联网后会自动同步。';
        });
      } else {
        $('#noteGuide').textContent = '笔记已保存并同步。';
      }
      renderNotes(note.id);
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
      updateQueueCount();
    });
  }

  function updateNoteCard(id, status) {
    var card = document.querySelector('.note-card[data-id="' + id + '"]');
    if (!card) return;
    var stEl = card.querySelector('.note-status');
    stEl.classList.remove('pending', 'failed');
    stEl.classList.add(status);
    if (status === 'synced') {
      stEl.innerHTML = '<i class="ti ti-check"></i>';
      if (window.gsap) gsap.fromTo(card, { scale: 1 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1 });
      var meta = card.querySelector('.note-meta');
      if (meta) meta.textContent = meta.textContent.replace(/待同步|同步失败/, '已同步');
    }
  }

  function updateQueueCount() {
    if (!state.syncQueue) { $('#queueCount').textContent = '0'; return; }
    state.syncQueue.getQueueLength().then(function (n) { $('#queueCount').textContent = n; });
  }

  // ════════ 第四幕：评分 ════════
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
      var v = it.querySelector('.sc-val');
      v.className = 'sc-val wait'; v.textContent = '检测中…';
    });

    window.getFullScore().then(function (score) {
      state.lastScore = score;
      var keys = ['sw', 'cache', 'fallback', 'idb', 'sync'];
      items.forEach(function (it, i) {
        var res = score.items[i].result;
        setTimeout(function () {
          it.classList.remove('spin');
          var v = it.querySelector('.sc-val');
          v.textContent = res.score + ' / 20';
          v.className = 'sc-val ' + (res.score > 0 ? 'ok' : 'bad');
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
        options: {
          cutout: '72%', responsive: false, animation: { duration: 900 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
      });
      // 中心文字
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
      hint.textContent = '缺失项：' + missing + '。补齐这些即可获得满分。';
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
    if (!state.lastScore) { showSwToast('请先点击「开始检测」'); return; }
    var s = state.lastScore;
    var lines = ['离线能力评估报告', '总分：' + s.total + ' / 100', ''];
    s.items.forEach(function (it) {
      lines.push(it.name + '：' + it.result.score + '/20 - ' + it.result.detail);
    });
    lines.push('', '来源：离线生存实验室 ' + location.href);
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showSwToast('报告已复制'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showSwToast('报告已复制'); } catch (e) { showSwToast('复制失败'); }
      ta.remove();
    }
  }

  // ── 工具 ──
  function reveal(sel) {
    var el = $(sel);
    el.hidden = false;
    if (window.gsap) {
      gsap.from(el, { opacity: 0, y: 30, duration: 0.6, ease: 'power2.out' });
    }
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
