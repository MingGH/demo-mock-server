/**
 * SQLite vs Grep 对决 — 交互逻辑
 */
(function () {
  'use strict';

  var E = window.GrepVsSqliteEngine;
  var chartInstance = null;
  var historyData = []; // { label, fileMs, sqliteMs }

  // ── 初始化 ──
  document.addEventListener('DOMContentLoaded', function () {
    renderPresets();
    loadStatus();
    bindEnterKeys();
  });

  // ── Enter 键绑定 ──
  function bindEnterKeys() {
    document.getElementById('searchInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runSearch();
    });
    document.getElementById('insertContent').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runInsert();
    });
    document.getElementById('insertSender').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runInsert();
    });
    document.getElementById('deleteInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runDelete();
    });
    document.getElementById('complexDays').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runComplexQuery();
    });
  }

  // ── 数据集状态 ──
  function loadStatus() {
    setStatusLoading(true);
    E.fetchStatus()
      .then(function (data) {
        updateStatusBar(data);
        setStatusLoading(false);
      })
      .catch(function () {
        setStatusLoading(false);
        document.getElementById('statusDot').className = 'status-dot loading';
      });
  }

  function updateStatusBar(data) {
    document.getElementById('statusMsgCount').textContent = data.messageCount.toLocaleString();
    document.getElementById('statusFileSize').textContent = E.formatBytes(data.fileSizeBytes);
    document.getElementById('statusDbSize').textContent = E.formatBytes(data.dbSizeBytes);
    document.getElementById('statusDot').className = 'status-dot' + (data.ready ? '' : ' loading');
  }

  function setStatusLoading(loading) {
    document.getElementById('statusDot').className = 'status-dot' + (loading ? ' loading' : '');
  }

  // ── 预设渲染 ──
  function renderPresets() {
    // 搜索预设
    var searchRow = document.getElementById('searchPresets');
    E.SEARCH_PRESETS.forEach(function (word) {
      var chip = createChip(word, function () {
        document.getElementById('searchInput').value = word;
        runSearch();
      });
      searchRow.appendChild(chip);
    });

    // 插入预设
    var insertRow = document.getElementById('insertPresets');
    E.INSERT_PRESETS.forEach(function (preset) {
      var chip = createChip(preset.sender + '：' + preset.content.slice(0, 10) + '…', function () {
        document.getElementById('insertContent').value = preset.content;
        document.getElementById('insertSender').value = preset.sender;
        runInsert();
      });
      insertRow.appendChild(chip);
    });

    // 复杂查询预设
    var complexRow = document.getElementById('complexPresets');
    E.COMPLEX_PRESETS.forEach(function (preset) {
      var chip = createChip(preset.label, function () {
        runComplexQuery(preset.type, preset.days);
      });
      complexRow.appendChild(chip);
    });

    // 删除预设
    var deleteRow = document.getElementById('deletePresets');
    E.DELETE_PRESETS.forEach(function (word) {
      var chip = createChip('删除含「' + word + '」的消息', function () {
        document.getElementById('deleteInput').value = word;
        runDelete();
      });
      deleteRow.appendChild(chip);
    });
  }

  function createChip(text, handler) {
    var chip = document.createElement('span');
    chip.className = 'preset-chip';
    chip.textContent = text;
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.onclick = handler;
    chip.onkeydown = function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    };
    return chip;
  }

  // ── 场景：搜索对比 ──
  window.runSearch = function () {
    var input = document.getElementById('searchInput');
    var keyword = input.value.trim();
    if (!keyword) { shakeInput(input); return; }

    var section = document.getElementById('searchSection');
    setLoading(section, true);
    disableBtn('searchBtn', true);

    E.fetchSearch(keyword)
      .then(function (data) {
        showArenaResult('search', {
          fileMs: data.grepTimeMs,
          sqliteMs: data.sqliteTimeMs,
          fileDetail: data.grepMatchCount + ' 条匹配',
          sqliteDetail: data.sqliteMatchCount + ' 条匹配'
        });
        addHistory('搜索「' + keyword + '」', data.grepTimeMs, data.sqliteTimeMs);
        showSearchSamples(data.grepSample);
      })
      .catch(showError)
      .finally(function () {
        setLoading(section, false);
        disableBtn('searchBtn', false);
      });
  };

  function showSearchSamples(samples) {
    var wrap = document.getElementById('searchSamples');
    if (!samples || !samples.length) {
      wrap.innerHTML = '<p class="note">没有找到匹配的消息</p>';
      return;
    }
    var html = '<p class="note">匹配消息示例（前 ' + samples.length + ' 条）：</p>';
    html += '<div style="max-height: 160px; overflow-y: auto; margin-top: 8px;">';
    samples.forEach(function (msg) {
      html += '<div style="padding: 6px 12px; margin: 4px 0; background: rgba(255,255,255,0.03); border-radius: 8px; font-size: 0.85rem; color: #c0c0c0;">' + escapeHtml(msg) + '</div>';
    });
    html += '</div>';
    wrap.innerHTML = html;
  }

  // ── 场景：写入对比 ──
  window.runInsert = function () {
    var contentInput = document.getElementById('insertContent');
    var content = contentInput.value.trim();
    var sender = document.getElementById('insertSender').value.trim() || '匿名用户';
    if (!content) { shakeInput(contentInput); return; }

    var section = document.getElementById('insertSection');
    setLoading(section, true);
    disableBtn('insertBtn', true);

    E.fetchInsert(content, sender)
      .then(function (data) {
        showArenaResult('insert', {
          fileMs: data.fileAppendTimeMs,
          sqliteMs: data.sqliteInsertTimeMs,
          fileDetail: '文件追加一行',
          sqliteDetail: 'INSERT 一条记录'
        });
        addHistory('写入消息', data.fileAppendTimeMs, data.sqliteInsertTimeMs);
        document.getElementById('statusMsgCount').textContent = data.totalMessages.toLocaleString();
      })
      .catch(showError)
      .finally(function () {
        setLoading(section, false);
        disableBtn('insertBtn', false);
      });
  };

  // ── 场景：复杂查询 ──
  window.runComplexQuery = function (type, days) {
    type = type || document.getElementById('complexType').value;
    days = days || parseInt(document.getElementById('complexDays').value) || 7;

    var section = document.getElementById('complexSection');
    setLoading(section, true);
    disableBtn('complexBtn', true);

    E.fetchComplexQuery(type, days)
      .then(function (data) {
        showArenaResult('complex', {
          fileMs: data.grepTimeMs,
          sqliteMs: data.sqliteTimeMs,
          fileDetail: data.grepMatchCount + ' 条匹配（逐行解析）',
          sqliteDetail: data.sqliteMatchCount + ' 条匹配（WHERE+INDEX）'
        });
        addHistory(type + ' / ' + days + '天', data.grepTimeMs, data.sqliteTimeMs);
      })
      .catch(showError)
      .finally(function () {
        setLoading(section, false);
        disableBtn('complexBtn', false);
      });
  };

  // ── 场景：删除对比 ──
  window.runDelete = function () {
    var input = document.getElementById('deleteInput');
    var keyword = input.value.trim();
    if (!keyword) { shakeInput(input); return; }

    var section = document.getElementById('deleteSection');
    setLoading(section, true);
    disableBtn('deleteBtn', true);

    E.fetchDelete(keyword)
      .then(function (data) {
        showArenaResult('delete', {
          fileMs: data.fileRewriteTimeMs,
          sqliteMs: data.sqliteDeleteTimeMs,
          fileDetail: '重写文件，删除 ' + data.fileDeletedCount + ' 条',
          sqliteDetail: 'DELETE，删除 ' + data.sqliteDeletedCount + ' 条'
        });
        addHistory('删除「' + keyword + '」', data.fileRewriteTimeMs, data.sqliteDeleteTimeMs);
        loadStatus(); // refresh counts
      })
      .catch(showError)
      .finally(function () {
        setLoading(section, false);
        disableBtn('deleteBtn', false);
      });
  };

  // ── 重置数据 ──
  window.runReinit = function () {
    var countInput = document.getElementById('reinitCount');
    var count = parseInt(countInput.value) || 100000;
    disableBtn('reinitBtn', true);

    E.fetchReinit(count)
      .then(function (data) {
        updateStatusBar(data);
        historyData = [];
        updateHistoryChart();
      })
      .catch(showError)
      .finally(function () {
        disableBtn('reinitBtn', false);
      });
  };

  // ── 擂台结果展示 ──
  function showArenaResult(prefix, data) {
    var filePanel = document.getElementById(prefix + 'FilePanel');
    var sqlitePanel = document.getElementById(prefix + 'SqlitePanel');
    var fileTime = filePanel.querySelector('.panel-time');
    var sqliteTime = sqlitePanel.querySelector('.panel-time');
    var fileDetail = filePanel.querySelector('.panel-detail');
    var sqliteDetail = sqlitePanel.querySelector('.panel-detail');

    // 显示结果区域
    var resultArea = document.getElementById(prefix + 'Result');
    if (resultArea) resultArea.style.display = 'block';

    // 设置数值（先清零再动画填入）
    fileTime.textContent = '—';
    sqliteTime.textContent = '—';

    var winner = E.getWinner(data.fileMs, data.sqliteMs);
    filePanel.className = 'arena-panel' + (winner === 'file' ? ' winner' : winner === 'sqlite' ? ' loser' : '');
    sqlitePanel.className = 'arena-panel' + (winner === 'sqlite' ? ' winner' : winner === 'file' ? ' loser' : '');

    // 动画数字展示
    setTimeout(function () {
      animateNumber(fileTime, data.fileMs);
      animateNumber(sqliteTime, data.sqliteMs);
      fileDetail.textContent = data.fileDetail;
      sqliteDetail.textContent = data.sqliteDetail;
    }, 100);

    // 竞速条
    var raceArea = document.getElementById(prefix + 'Race');
    if (raceArea) {
      var widths = E.calcRaceWidths(data.fileMs, data.sqliteMs);
      var fileFill = raceArea.querySelector('.race-bar-fill.file-bg');
      var sqliteFill = raceArea.querySelector('.race-bar-fill.sqlite-bg');
      fileFill.style.width = '0';
      sqliteFill.style.width = '0';
      setTimeout(function () {
        fileFill.style.width = widths.fileWidth + '%';
        fileFill.textContent = E.formatTime(data.fileMs);
        sqliteFill.style.width = widths.sqliteWidth + '%';
        sqliteFill.textContent = E.formatTime(data.sqliteMs);
      }, 200);
    }

    // 倍率徽章
    var badge = document.getElementById(prefix + 'Badge');
    if (badge) {
      var ratio = E.calcSpeedRatio(data.fileMs, data.sqliteMs);
      if (winner === 'sqlite') {
        badge.innerHTML = '<i class="ti ti-bolt"></i> SQLite 快 ' + ratio + ' 倍';
        badge.style.color = '#81c784';
        badge.style.background = 'rgba(129,199,132,0.12)';
      } else if (winner === 'file') {
        badge.innerHTML = '<i class="ti ti-bolt"></i> 文件方案快 ' + ratio + ' 倍';
        badge.style.color = '#ff6b6b';
        badge.style.background = 'rgba(255,107,107,0.12)';
      } else {
        badge.innerHTML = '<i class="ti ti-equal"></i> 旗鼓相当';
        badge.style.color = '#ffd700';
        badge.style.background = 'rgba(255,215,0,0.12)';
      }
      badge.style.display = 'inline-flex';
    }
  }

  // ── 数字动画 ──
  function animateNumber(el, targetMs) {
    var duration = 600;
    var start = performance.now();
    var formatted = E.formatTime(targetMs);

    function tick(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      var current = targetMs * eased;
      el.textContent = E.formatTime(current);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = formatted;
    }
    requestAnimationFrame(tick);
  }

  // ── 历史图表 ──
  function addHistory(label, fileMs, sqliteMs) {
    historyData.push({ label: label, fileMs: fileMs, sqliteMs: sqliteMs });
    if (historyData.length > 20) historyData.shift();
    updateHistoryChart();
  }

  function updateHistoryChart() {
    var canvas = document.getElementById('historyCanvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    if (historyData.length === 0) return;

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: historyData.map(function (d) { return d.label; }),
        datasets: [
          {
            label: '文件/Grep (ms)',
            data: historyData.map(function (d) { return d.fileMs; }),
            backgroundColor: 'rgba(255,107,107,0.7)',
            borderColor: '#ff6b6b',
            borderWidth: 1
          },
          {
            label: 'SQLite (ms)',
            data: historyData.map(function (d) { return d.sqliteMs; }),
            backgroundColor: 'rgba(129,199,132,0.7)',
            borderColor: '#81c784',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { size: 11 } }
          }
        },
        scales: {
          x: {
            ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 30 },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            ticks: { color: '#64748b', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: '耗时 (ms)', color: '#64748b' }
          }
        }
      }
    });
  }

  // ── 辅助函数 ──
  function setLoading(section, show) {
    var overlay = section.querySelector('.loading-overlay');
    if (overlay) overlay.classList.toggle('show', show);
  }

  function disableBtn(id, disabled) {
    var btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  }

  function showError(err) {
    console.error('API Error:', err);
    // 简单 toast
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#ff4444;color:#fff;padding:12px 20px;border-radius:10px;font-size:0.9rem;z-index:9999;';
    toast.textContent = '请求失败：' + (err.message || '网络错误');
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function shakeInput(el) {
    el.style.borderColor = '#ff6b6b';
    el.classList.add('shake');
    setTimeout(function () {
      el.style.borderColor = '';
      el.classList.remove('shake');
    }, 500);
    el.focus();
  }

})();
