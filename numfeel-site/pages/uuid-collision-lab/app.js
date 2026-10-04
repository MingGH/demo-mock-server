/**
 * uuid-collision-lab — DOM 交互层。
 * 依赖：engine.js（window.UuidLab）
 */
(function () {
  'use strict';

  var E = window.UuidLab;
  var $ = function (id) { return document.getElementById(id); };
  var refreshTimer = null;
  var appending = false;
  var lookupBusy = false;

  if (typeof window !== 'undefined') {
    window.NF_TRACK_UMAMI_MIRROR = ['append_run', 'pagehide'];
  }

  function track(name, props, opts) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(name, props, opts);
      }
    } catch (error) { /* 埋点失败不影响页面 */ }
  }

  function showApiError(message) {
    $('apiNotice').classList.remove('hidden');
    $('apiNoticeText').textContent = message;
  }

  function hideApiError() {
    $('apiNotice').classList.add('hidden');
  }

  function renderStatus(data) {
    $('dbRows').textContent = E.formatInteger(data.databaseRowCount);
    $('targetRows').textContent = E.formatInteger(data.targetRowCount);
    $('rawBytes').textContent = '原始 UUID 负载 ' + E.rawBytes(data.databaseRowCount);
    $('progress').textContent = E.formatPercent(data.progressPercent);
    $('backendState').textContent = data.backgroundBusy
      ? '后台任务正在检查或写入'
      : data.databaseRowCount >= data.targetRowCount ? '已达目标；等待下一次检查' : '后台补齐中';
    $('progressBar').style.width = Math.min(100, Math.max(0, data.progressPercent)) + '%';
    var conflicts = Number(data.conflictCount || 0);
    $('conflictCount').textContent = conflicts > 0 ? E.formatInteger(conflicts) + ' 条' : '0 条';
    $('conflictCount').className = 'metric-value ' + (conflicts > 0 ? 'red' : 'green');
    $('conflictNote').textContent = conflicts > 0
      ? '发现主键冲突；请检查日志'
      : data.databaseRowCount >= data.targetRowCount
        ? E.formatInteger(data.databaseRowCount) + ' 条实测，未发现冲突'
        : E.formatInteger(data.databaseRowCount) + ' 条实测，尚未发现冲突';
  }

  function refreshStatus() {
    return E.fetchStatus().then(function (data) {
      hideApiError();
      renderStatus(data);
    }).catch(function (error) {
      showApiError(error.message || '后端暂时连不上。');
    });
  }

  function startRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(refreshStatus, 5000);
  }

  function renderAppend(data) {
    $('appendResult').classList.remove('hidden');
    $('requestedCount').textContent = E.formatInteger(data.requestedCount);
    $('insertedCount').textContent = E.formatInteger(data.insertedCount);
    $('duplicateCount').textContent = E.formatInteger(data.duplicateCount);
    $('elapsed').textContent = E.formatDuration(data.elapsedMs);
    var delta = data.databaseRowCountAfter - data.databaseRowCountBefore;
    $('rowDelta').textContent = (delta >= 0 ? '+' : '') + E.formatInteger(delta);
    $('insertSpeed').textContent = data.elapsedMs > 0
      ? E.formatInteger(Math.round(E.insertSpeedPerSecond(data.insertedCount, data.elapsedMs))) + ' /s'
      : '—';
  }

  function renderLookup(data) {
    $('lookupResult').classList.remove('hidden');
    $('lookupExists').textContent = data.exists ? '撞上了' : '没有撞上';
    $('lookupExists').className = data.exists ? 'red' : 'green';
    $('lookupElapsed').textContent = E.formatDuration(data.elapsedMs);
    $('lookupMethod').textContent = data.queryMethod || '主键索引';
    $('lookupUuid').textContent = data.requestedUuid;
    $('lookupRows').textContent = data.databaseRowCount >= 0
      ? E.formatInteger(data.databaseRowCount)
      : '—';
  }

  function runLookup() {
    if (lookupBusy) return;
    var normalized = E.normalizeUuidInput($('lookupInput').value);
    if (!normalized) {
      $('lookupStatus').textContent = '请输入合法的 UUIDv4；支持带连字符或不带连字符。';
      return;
    }
    lookupBusy = true;
    $('lookupBtn').disabled = true;
    $('lookupStatus').textContent = '正在用主键索引查询…';
    E.lookupUuid(normalized).then(function (data) {
      renderLookup(data);
      $('lookupStatus').textContent = data.exists
        ? '结果：这个 UUID 已在当前表里。'
        : '结果：这个 UUID 不在当前表里。';
      track('lookup_run', {
        exists: data.exists,
        rows: Number(data.databaseRowCount),
        elapsed_ms: Number(data.elapsedMs)
      });
    }).catch(function (error) {
      $('lookupStatus').textContent = error.message || '查询失败，请稍后再试。';
    }).finally(function () {
      lookupBusy = false;
      $('lookupBtn').disabled = false;
    });
  }

  function setButtonsDisabled(disabled) {
    document.querySelectorAll('.append-btn').forEach(function (button) {
      button.disabled = disabled;
    });
  }

  function runAppend(count) {
    if (appending) return;
    appending = true;
    setButtonsDisabled(true);
    $('appendStatus').textContent = '正在生成 ' + E.formatInteger(count) + ' 条 UUIDv4 并写入 MySQL…';
    E.appendUuids(count).then(function (data) {
      renderAppend(data);
      $('appendStatus').textContent = '写入完成。下一次状态刷新会读取最新 COUNT(*)。';
      track('append_run', {
        count: count,
        inserted: Number(data.insertedCount),
        duplicates: Number(data.duplicateCount),
        elapsed_ms: Number(data.elapsedMs)
      });
      return refreshStatus();
    }).catch(function (error) {
      $('appendStatus').textContent = error.message || '写入失败，请稍后再试。';
    }).finally(function () {
      appending = false;
      setButtonsDisabled(false);
    });
  }

  function initStaticMath() {
    $('pairCount').textContent = E.formatInteger(E.expectedPairs(E.TARGET_ROW_COUNT));
    $('collisionOdds').textContent = E.formatProbability(E.collisionProbability(E.TARGET_ROW_COUNT));
  }

  function init() {
    initStaticMath();
    document.querySelectorAll('.append-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        runAppend(Number(button.dataset.count));
      });
    });
    $('lookupBtn').addEventListener('click', runLookup);
    $('lookupInput').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') runLookup();
    });
    refreshStatus();
    startRefresh();

    try {
      if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
        window.NFTrack.trackOnce('session_start', {});
      }
    } catch (error) { /* 埋点失败不影响页面 */ }
  }

  window.addEventListener('pagehide', function () {
    track('pagehide', { reason: 'leave' }, { force: true });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
