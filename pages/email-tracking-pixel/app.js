const labApi = window.EmailTrackingPixelLab;

const state = {
  form: labApi.applyMailboxPreset(labApi.DEFAULT_FORM, labApi.DEFAULT_FORM.mailbox),
  stats: labApi.defaultStats(),
  busy: false,
  refreshTimer: null
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyText(value, inputEl) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value);
  }

  if (inputEl) {
    inputEl.focus();
    inputEl.select();
    inputEl.setSelectionRange(0, value.length);
    document.execCommand('copy');
    return Promise.resolve();
  }

  return Promise.reject(new Error('copy unsupported'));
}

function setStatus(message, type) {
  const el = $('statusBar');
  el.className = 'status-bar ' + (type || 'info');
  el.textContent = message;
}

function setBusy(isBusy) {
  state.busy = isBusy;
  ['simulateBtn', 'batchBtn', 'resetBtn', 'refreshBtn'].forEach(function(id) {
    const btn = $(id);
    if (btn) btn.disabled = isBusy;
  });
}

function syncForm() {
  $('campaignId').value = state.form.campaignId;
  $('uid').value = state.form.uid;
  $('recipient').value = state.form.recipient;
  $('mailbox').value = state.form.mailbox;
  $('mode').value = state.form.mode;
  $('sender').value = state.form.sender;
  $('subject').value = state.form.subject;
  $('pixelLabel').value = state.form.pixelLabel;
}

function readForm() {
  state.form.campaignId = $('campaignId').value.trim();
  state.form.uid = $('uid').value.trim();
  state.form.recipient = $('recipient').value.trim();
  state.form.mailbox = $('mailbox').value;
  state.form.mode = $('mode').value;
  state.form.sender = $('sender').value.trim();
  state.form.subject = $('subject').value.trim();
  state.form.pixelLabel = $('pixelLabel').value.trim();
}

function renderMailboxCards() {
  $('mailboxCards').innerHTML = labApi.MAILBOX_PRESETS.map(function(item) {
    const active = item.key === state.form.mailbox ? 'active' : '';
    return (
      '<button class="mailbox-card ' + active + '" data-mailbox="' + escapeHtml(item.key) + '" type="button">' +
        '<strong>' + escapeHtml(item.label) + '</strong>' +
        '<span>' + escapeHtml(item.description) + '</span>' +
      '</button>'
    );
  }).join('');
}

function renderModeInfo() {
  const mode = labApi.getModeOption(state.form.mode);
  $('modeTitle').textContent = mode.label;
  $('modeSummary').textContent = mode.summary;
  $('modeRisk').textContent = mode.risk;
  $('modeServerView').textContent = mode.serverView;
}

function renderOutputs() {
  const pixelUrl = labApi.buildPixelUrl(window.location.origin, state.form);
  const emailHtml = labApi.buildEmailHtml(state.form, pixelUrl);
  $('pixelUrl').value = pixelUrl;
  $('emailHtml').value = emailHtml;
}

function renderPreview() {
  const pixelUrl = labApi.buildPixelUrl(window.location.origin, state.form);
  $('previewFrom').textContent = state.form.sender || 'growth@demo.local';
  $('previewTo').textContent = state.form.recipient || 'reader@example.com';
  $('previewSubject').textContent = state.form.subject || '邮件主题';
  $('previewUid').textContent = state.form.uid || 'anonymous';
  $('previewCampaign').textContent = state.form.campaignId || 'demo-campaign';
  $('previewPixel').textContent = labApi.buildPixelId(state.form);
  $('previewUrl').textContent = pixelUrl;

  $('previewBody').innerHTML = labApi.EMAIL_PARAGRAPHS.map(function(line) {
    return '<p>' + escapeHtml(line) + '</p>';
  }).join('');
}

function renderBatchScript() {
  $('batchScript').innerHTML = labApi.BATCH_SCENARIO.map(function(step, index) {
    const mailbox = labApi.getMailboxPreset(step.mailbox);
    const mode = labApi.getModeOption(step.mode);
    return (
      '<div class="script-row">' +
        '<span class="script-index">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<div class="script-main">' +
          '<strong>' + escapeHtml(step.recipient) + '</strong>' +
          '<span>' + escapeHtml(mailbox.label + ' / ' + mode.label + ' / ' + step.note) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  const batch = labApi.getBatchScenarioSummary();
  $('batchSummary').innerHTML =
    '<strong>' + batch.events + '</strong> 次请求，' +
    '<strong>' + batch.recipients + '</strong> 个唯一收件人，' +
    '<strong>' + batch.directEvents + '</strong> 次直连，' +
    '<strong>' + batch.proxyEvents + '</strong> 次代理或预取，' +
    '<strong>' + batch.prefetchLikeEvents + '</strong> 次需要谨慎解读。';
}

function renderStats() {
  const summary = labApi.summarizeStats(state.stats);

  $('statOpenEvents').textContent = summary.openEvents;
  $('statRecipients').textContent = summary.uniqueRecipients;
  $('statDirectEvents').textContent = summary.directEvents;
  $('statProxyEvents').textContent = summary.proxyEvents;
  $('statPrefetch').textContent = summary.prefetchLikeEvents;
  $('statLatest').textContent = summary.latestOpenedAtText;

  $('resultHeadline').textContent = summary.openEvents
    ? '最近一次请求发生在 ' + summary.latestOpenedAtText
    : '还没有触发像素请求';

  $('resultNarrative').innerHTML = summary.openEvents
    ? [
        '服务端共记录到 <strong>' + summary.openEvents + '</strong> 次图片请求，涉及 <strong>' + summary.uniqueRecipients + '</strong> 个收件人。',
        '其中 <strong>' + summary.directRecipientCount + '</strong> 个收件人出现过更接近真人的直连打开，<strong>' + summary.proxyOnlyRecipientCount + '</strong> 个收件人只有代理或预取类请求。',
        '还有 <strong>' + summary.cautiousRecipientCount + '</strong> 个收件人出现了更像预取或安全扫描的记录。'
      ].join('')
    : '点一次“模拟打开”，或者运行内置批量脚本，右侧就会开始出现真实事件。';

  renderModeBreakdown(summary.modeBreakdown);
  renderRecipientRows(summary.recipients);
  renderEventRows(summary.events);
}

function renderModeBreakdown(rows) {
  if (!rows.length) {
    $('modeBreakdown').innerHTML = '<div class="empty-state">还没有请求，暂时没有模式分布。</div>';
    return;
  }

  $('modeBreakdown').innerHTML = rows.map(function(item) {
    return (
      '<div class="breakdown-row">' +
        '<span>' + escapeHtml(item.label) + '</span>' +
        '<strong>' + escapeHtml(String(item.count)) + '</strong>' +
      '</div>'
    );
  }).join('');
}

function renderRecipientRows(rows) {
  if (!rows.length) {
    $('recipientTableBody').innerHTML = '<tr><td colspan="6" class="empty-cell">还没有收件人数据</td></tr>';
    return;
  }

  $('recipientTableBody').innerHTML = rows.map(function(row) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(row.recipient) + '</td>' +
        '<td>' + escapeHtml(row.uid) + '</td>' +
        '<td>' + escapeHtml(String(row.openCount)) + '</td>' +
        '<td>' + escapeHtml(row.lastPathLabel || '-') + '</td>' +
        '<td>' + escapeHtml((row.uniqueLocations || []).join(' / ')) + '</td>' +
        '<td>' + escapeHtml(labApi.interpretRecipient(row)) + '</td>' +
      '</tr>'
    );
  }).join('');
}

function renderEventRows(rows) {
  if (!rows.length) {
    $('eventTableBody').innerHTML = '<tr><td colspan="7" class="empty-cell">还没有事件数据</td></tr>';
    return;
  }

  $('eventTableBody').innerHTML = rows.map(function(row) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(String(row.id)) + '</td>' +
        '<td>' + escapeHtml(row.openedAtText) + '</td>' +
        '<td>' + escapeHtml(row.recipient) + '</td>' +
        '<td>' + escapeHtml(row.pathLabel) + '</td>' +
        '<td>' + escapeHtml(row.ip) + '</td>' +
        '<td>' + escapeHtml(row.location) + '</td>' +
        '<td>' + escapeHtml(labApi.interpretEvent(row)) + '</td>' +
      '</tr>'
    );
  }).join('');
}

function render() {
  renderMailboxCards();
  syncForm();
  renderModeInfo();
  renderOutputs();
  renderPreview();
  renderBatchScript();
  renderStats();
}

async function fetchStats() {
  const res = await fetch('/email-tracking/stats', {
    headers: { Accept: 'application/json' }
  });
  const json = await res.json();
  if (json.status !== 200) {
    throw new Error(json.message || '加载统计失败');
  }
  state.stats = json.data || labApi.defaultStats();
  renderStats();
}

async function firePixel(form) {
  const pixelUrl = labApi.buildPixelUrl(window.location.origin, form);
  const url = new URL(pixelUrl);
  url.searchParams.set('_ts', Date.now() + '-' + Math.random().toString(16).slice(2));

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    let message = '像素请求失败';
    try {
      const json = await res.json();
      message = json.message || message;
    } catch (err) {
      // ignore parse error
    }
    throw new Error(message);
  }
  await res.arrayBuffer();
  return res.headers.get('X-Tracking-Event-Id') || '';
}

async function simulateCurrentOpen() {
  readForm();
  render();
  setBusy(true);
  setStatus('正在触发像素请求...', 'info');
  try {
    const eventId = await firePixel(state.form);
    await fetchStats();
    setStatus('像素请求已触发，事件 ID：' + (eventId || '未知'), 'ok');
  } catch (err) {
    setStatus(err.message || '触发失败', 'err');
  } finally {
    setBusy(false);
  }
}

async function resetData() {
  setBusy(true);
  setStatus('正在清空服务端事件...', 'info');
  try {
    const res = await fetch('/email-tracking/reset', {
      method: 'POST',
      headers: { Accept: 'application/json' }
    });
    const json = await res.json();
    if (json.status !== 200) throw new Error(json.message || '重置失败');
    state.stats = labApi.defaultStats();
    renderStats();
    setStatus('已清空当前 demo 的打开记录。', 'ok');
  } catch (err) {
    setStatus(err.message || '重置失败', 'err');
  } finally {
    setBusy(false);
  }
}

function wait(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

async function runBatchScenario() {
  setBusy(true);
  setStatus('正在运行内置批量脚本...', 'info');
  try {
    await fetch('/email-tracking/reset', { method: 'POST', headers: { Accept: 'application/json' } });
    for (let i = 0; i < labApi.BATCH_SCENARIO.length; i++) {
      const step = labApi.BATCH_SCENARIO[i];
      const form = {
        campaignId: 'batch-lab-2026',
        uid: step.uid,
        recipient: step.recipient,
        mailbox: step.mailbox,
        mode: step.mode,
        sender: state.form.sender,
        subject: '批量脚本演示',
        pixelLabel: 'batch-pixel'
      };
      await firePixel(form);
      setStatus('脚本进度 ' + (i + 1) + ' / ' + labApi.BATCH_SCENARIO.length + '：' + step.note, 'info');
      await wait(60);
    }
    await fetchStats();
    setStatus('批量脚本已跑完，右侧数据可直接拿来观察代理与预取差异。', 'ok');
  } catch (err) {
    setStatus(err.message || '批量脚本执行失败', 'err');
  } finally {
    setBusy(false);
  }
}

function bindCopyButtons() {
  $('copyPixelBtn').addEventListener('click', function() {
    copyText($('pixelUrl').value, $('pixelUrl'))
      .then(function() { setStatus('像素 URL 已复制。', 'ok'); })
      .catch(function() { setStatus('复制失败，请手动复制。', 'err'); });
  });

  $('copyHtmlBtn').addEventListener('click', function() {
    copyText($('emailHtml').value, $('emailHtml'))
      .then(function() { setStatus('邮件 HTML 已复制。', 'ok'); })
      .catch(function() { setStatus('复制失败，请手动复制。', 'err'); });
  });
}

function bindEvents() {
  $('mailboxCards').addEventListener('click', function(event) {
    const button = event.target.closest('[data-mailbox]');
    if (!button) return;
    state.form = labApi.applyMailboxPreset(state.form, button.getAttribute('data-mailbox'));
    render();
  });

  $('composeForm').addEventListener('input', function(event) {
    readForm();
    if (event.target.id === 'mailbox') {
      state.form = labApi.applyMailboxPreset(state.form, event.target.value);
    }
    render();
  });

  $('composeForm').addEventListener('change', function(event) {
    readForm();
    if (event.target.id === 'mailbox') {
      state.form = labApi.applyMailboxPreset(state.form, event.target.value);
    }
    render();
  });

  $('simulateBtn').addEventListener('click', simulateCurrentOpen);
  $('batchBtn').addEventListener('click', runBatchScenario);
  $('resetBtn').addEventListener('click', resetData);
  $('refreshBtn').addEventListener('click', function() {
    setBusy(true);
    fetchStats()
      .then(function() { setStatus('统计已刷新。', 'ok'); })
      .catch(function(err) { setStatus(err.message || '刷新失败', 'err'); })
      .finally(function() { setBusy(false); });
  });

  bindCopyButtons();
}

function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(function() {
    fetchStats().catch(function() {});
  }, 6000);
}

document.addEventListener('DOMContentLoaded', function() {
  render();
  bindEvents();
  fetchStats()
    .then(function() {
      setStatus('页面已就绪，可以直接触发像素请求。', 'ok');
    })
    .catch(function(err) {
      setStatus(err.message || '暂时无法读取统计数据', 'err');
    });
  startAutoRefresh();
});
