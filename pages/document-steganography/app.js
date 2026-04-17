/**
 * app.js — 文档隐写实验室 UI 层
 */
(function () {
  'use strict';

  var lab = window.DocStegoLab;

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Tab 切换 ────────────────────────────────────────────────────────────────

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById('tab-' + tab);
      if (panel) panel.classList.add('active');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Tab 1：PDF 追踪像素
  // ════════════════════════════════════════════════════════════════════════════

  var currentToken = lab.randomToken();
  var pollTimer = null;
  var knownEventCount = 0;
  var localEvents = []; // 本地缓存，用于清空功能

  function renderToken() {
    $('trackingToken').textContent = currentToken;
  }

  function generateNewToken() {
    currentToken = lab.randomToken();
    knownEventCount = 0;
    localEvents = [];
    renderToken();
    renderEventList([]);
    $('eventStats').style.display = 'none';
  }

  $('refreshToken').addEventListener('click', generateNewToken);

  // 生成 PDF
  $('generatePdfBtn').addEventListener('click', function () {
    var btn = $('generatePdfBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i>生成中…';

    var title = $('pdfTitle').value.trim() || '合作方案';
    var recipient = $('pdfRecipient').value.trim() || '收件方';

    try {
      var pdfContent = lab.generateTrackingPdf({
        title: title,
        recipient: recipient,
        token: currentToken
      });

      var blob = new Blob([pdfContent], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = title + '-' + recipient + '.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

      btn.innerHTML = '<i class="ti ti-check"></i>已下载，等待打开记录…';
      startPolling();
    } catch (e) {
      btn.innerHTML = '<i class="ti ti-download"></i>生成并下载 PDF';
      alert('生成失败：' + e.message);
    }

    btn.disabled = false;
  });

  // 轮询
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    $('liveDot').classList.add('pulsing');
    pollTimer = setInterval(pollEvents, 3000);
    pollEvents(); // 立即执行一次
  }

  function pollEvents() {
    lab.fetchEvents(currentToken).then(function (data) {
      if (data && Array.isArray(data.events)) {
        localEvents = data.events;
        renderEventList(data.events);
        if (data.events.length > 0) {
          $('eventStats').style.display = 'flex';
          $('eventCount').textContent = data.events.length;
        }
        // 新增事件时震动提示
        if (data.events.length > knownEventCount && knownEventCount > 0) {
          flashNewEvent();
        }
        knownEventCount = data.events.length;
      }
    }).catch(function () {
      // 静默失败，继续轮询
    });
  }

  function flashNewEvent() {
    var list = $('eventList');
    list.classList.add('flash');
    setTimeout(function () { list.classList.remove('flash'); }, 600);
  }

  function renderEventList(events) {
    var list = $('eventList');
    if (!events || events.length === 0) {
      list.innerHTML =
        '<div class="event-empty">' +
          '<i class="ti ti-clock-pause"></i>' +
          '<span>等待文件被打开…</span>' +
        '</div>';
      return;
    }

    // 最新的在最上面
    var reversed = events.slice().reverse();
    list.innerHTML = reversed.map(function (ev, i) {
      var isNew = i === 0 && events.length > knownEventCount - 1;
      return '<div class="event-item' + (i === 0 && events.length > 1 ? ' event-new' : '') + '">' +
        '<div class="event-row">' +
          '<span class="event-time"><i class="ti ti-clock"></i>' + escHtml(ev.time) + '</span>' +
          '<span class="event-device"><i class="ti ti-device-laptop"></i>' + escHtml(ev.device || '未知设备') + '</span>' +
        '</div>' +
        '<div class="event-row">' +
          '<span class="event-ip"><i class="ti ti-map-pin"></i>IP: <code>' + escHtml(ev.ip) + '</code></span>' +
          '<span class="event-os"><i class="ti ti-brand-windows"></i>' + escHtml(ev.os || '未知系统') + '</span>' +
        '</div>' +
        '<div class="event-ua">' + escHtml((ev.ua || '').substring(0, 80)) + (ev.ua && ev.ua.length > 80 ? '…' : '') + '</div>' +
      '</div>';
    }).join('');
  }

  $('clearEvents').addEventListener('click', function () {
    localEvents = [];
    knownEventCount = 0;
    renderEventList([]);
    $('eventStats').style.display = 'none';
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Tab 2：文字指纹水印
  // ════════════════════════════════════════════════════════════════════════════

  var recipients = [
    { name: '张总（竞争对手A）', id: 0 },
    { name: '李总（合作方B）', id: 1 },
    { name: '王总（投资人C）', id: 2 }
  ];

  function renderRecipientList() {
    var container = $('recipientList');
    container.innerHTML = recipients.map(function (r, i) {
      return '<div class="recipient-row" data-idx="' + i + '">' +
        '<span class="recipient-num">' + (i + 1) + '</span>' +
        '<input class="recipient-input" type="text" value="' + escHtml(r.name) + '" data-idx="' + i + '">' +
        '<button class="btn-icon btn-danger" data-remove="' + i + '" title="删除"><i class="ti ti-x"></i></button>' +
      '</div>';
    }).join('');

    // 绑定输入
    container.querySelectorAll('.recipient-input').forEach(function (input) {
      input.addEventListener('input', function () {
        var idx = parseInt(input.getAttribute('data-idx'));
        recipients[idx].name = input.value;
      });
    });

    // 绑定删除
    container.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-remove'));
        recipients.splice(idx, 1);
        // 重新分配 id
        recipients.forEach(function (r, i) { r.id = i; });
        renderRecipientList();
      });
    });
  }

  $('addRecipient').addEventListener('click', function () {
    recipients.push({ name: '新收件方 ' + (recipients.length + 1), id: recipients.length });
    renderRecipientList();
  });

  // 生成各方版本
  $('generateWmBtn').addEventListener('click', function () {
    var text = $('wmInput').value.trim();
    if (!text) { alert('请输入原始文本'); return; }
    if (recipients.length === 0) { alert('请至少添加一个收件方'); return; }

    var result = $('wmResult');
    result.style.display = 'block';

    var html = '<div class="wm-versions">';
    recipients.forEach(function (r) {
      var watermarked = lab.injectWatermark(text, r.id);
      var extracted = lab.extractWatermark(watermarked);
      html += '<div class="wm-version">' +
        '<div class="wm-version-header">' +
          '<span class="wm-recipient">' + escHtml(r.name) + '</span>' +
          '<span class="wm-id">指纹 ID: <code>' + extracted.id + '</code></span>' +
          '<button class="btn-copy btn-sm" data-text="' + escHtml(watermarked) + '">复制</button>' +
        '</div>' +
        '<div class="wm-preview">' + escHtml(watermarked.substring(0, 120)) + (watermarked.length > 120 ? '…' : '') + '</div>' +
        '<div class="wm-diff">' + renderDiff(text, watermarked) + '</div>' +
      '</div>';
    });
    html += '</div>';

    result.innerHTML = '<div class="wm-result-title"><i class="ti ti-check"></i>已生成 ' + recipients.length + ' 份专属版本</div>' + html;

    // 绑定复制按钮
    result.querySelectorAll('.btn-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-text');
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = '已复制';
          setTimeout(function () { btn.textContent = '复制'; }, 1500);
        });
      });
    });
  });

  // 渲染差异高亮（找出替换的词）
  function renderDiff(original, watermarked) {
    if (original === watermarked) return '<span class="diff-same">与原文相同（ID=0）</span>';

    // 找出不同的字符位置
    var result = '';
    var i = 0, j = 0;
    var oLen = original.length, wLen = watermarked.length;

    // 简单的逐字符对比，找出替换区域
    // 实际上因为同义词长度可能不同，用简单的方式：标注零宽字符
    var hasZW = /[\u200b\u200c]/.test(watermarked);
    var diffWords = [];

    // 检查同义词替换
    var SYNONYM_RULES = [
      ['总金额', '总价款'], ['交付', '完成'], ['保证', '确保'],
      ['合同', '协议'], ['支付', '缴纳'], ['验收', '检收'],
      ['违约金', '赔偿金'], ['管辖', '适用'], ['首期', '第一期']
    ];

    SYNONYM_RULES.forEach(function (rule) {
      if (watermarked.indexOf(rule[1]) !== -1 && original.indexOf(rule[0]) !== -1) {
        diffWords.push(rule[0] + ' → ' + rule[1]);
      }
    });

    if (hasZW) diffWords.push('零宽字符（不可见）');

    if (diffWords.length === 0) return '<span class="diff-same">差异仅在不可见字符</span>';

    return '<span class="diff-label">替换点：</span>' +
      diffWords.map(function (d) {
        return '<span class="diff-word">' + escHtml(d) + '</span>';
      }).join('');
  }

  // 溯源检测
  $('detectWmBtn').addEventListener('click', function () {
    var text = $('wmDetectInput').value.trim();
    if (!text) { alert('请粘贴疑似泄露文本'); return; }

    var result = lab.extractWatermark(text);
    var detectResult = $('detectResult');
    detectResult.style.display = 'block';

    // 找匹配的收件方
    var matched = recipients.find(function (r) { return r.id === result.id; });
    var confidence = Math.round(result.confidence * 100);

    var html = '';
    if (matched && confidence > 30) {
      html = '<div class="detect-match">' +
        '<div class="detect-icon"><i class="ti ti-user-search"></i></div>' +
        '<div class="detect-info">' +
          '<div class="detect-name">疑似来源：<strong>' + escHtml(matched.name) + '</strong></div>' +
          '<div class="detect-id">指纹 ID: <code>' + result.id + '</code>（二进制: ' + result.bitStr + '）</div>' +
          '<div class="detect-conf">置信度：' + confidence + '%</div>' +
        '</div>' +
      '</div>';
    } else if (confidence > 0) {
      html = '<div class="detect-unknown">' +
        '<i class="ti ti-question-mark"></i>' +
        '<div>' +
          '<strong>未找到匹配收件方</strong>' +
          '<p>提取到指纹 ID: ' + result.id + '，但不在当前收件方列表中。' +
          '可能是文本被大幅改写，或来自其他批次。</p>' +
        '</div>' +
      '</div>';
    } else {
      html = '<div class="detect-unknown">' +
        '<i class="ti ti-alert-triangle"></i>' +
        '<div>' +
          '<strong>未检测到水印</strong>' +
          '<p>文本中没有找到水印特征。可能是原始文本（未注入水印），或水印已被破坏。</p>' +
        '</div>' +
      '</div>';
    }

    detectResult.innerHTML = html;
  });

  // ─── 初始化 ──────────────────────────────────────────────────────────────────

  renderToken();
  renderRecipientList();

})();
