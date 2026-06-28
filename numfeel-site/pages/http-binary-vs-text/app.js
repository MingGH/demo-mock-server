/**
 * app.js — HTTP 文本 vs 二进制传输对比 UI 层
 * 依赖：engine.js、MessagePack（CDN）、Chart.js（通过 loadChartJS 加载）
 */
(function () {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';

  var TEXT_URL = API_BASE + '/api/http-demo/text';
  var BINARY_URL = API_BASE + '/api/http-demo/binary';

  var eng = window.HttpBinaryEngine;
  var currentMode = 'both'; // 'both' | 'text' | 'binary'
  var chartInstance = null;
  var textTiming = null;
  var binaryTiming = null;
  var textData = null;
  var binaryData = null;
  var textByteLen = 0;

  // ── DOM 引用 ──
  var els = {};

  function cacheDom() {
    els.modeBoth = document.getElementById('mode-both');
    els.modeText = document.getElementById('mode-text');
    els.modeBinary = document.getElementById('mode-binary');
    els.btnRefresh = document.getElementById('btn-refresh');
    els.btnBench = document.getElementById('btn-bench');
    els.panels = document.getElementById('panels');

    // 文本面板
    els.textPanel = document.getElementById('text-panel');
    els.textStatus = document.getElementById('text-status');
    els.textSize = document.getElementById('text-size');
    els.textTime = document.getElementById('text-time');
    els.textContentType = document.getElementById('text-content-type');
    els.textRaw = document.getElementById('text-raw');
    els.textRender = document.getElementById('text-render');

    // 二进制面板
    els.binaryPanel = document.getElementById('binary-panel');
    els.binaryStatus = document.getElementById('binary-status');
    els.binarySize = document.getElementById('binary-size');
    els.binaryTime = document.getElementById('binary-time');
    els.binaryContentType = document.getElementById('binary-content-type');
    els.binaryRaw = document.getElementById('binary-raw');
    els.binaryRender = document.getElementById('binary-render');

    // 图表 & 洞察
    els.chartCanvas = document.getElementById('size-chart');
    els.insightBar = document.getElementById('insight-bar');

    // 基准测试
    els.benchSection = document.getElementById('bench-section');
    els.benchStatus = document.getElementById('bench-status');
    els.bAvgText = document.getElementById('b-avg-text');
    els.bAvgBin = document.getElementById('b-avg-bin');
    els.bMinText = document.getElementById('b-min-text');
    els.bMinBin = document.getElementById('b-min-bin');
    els.bMaxText = document.getElementById('b-max-text');
    els.bMaxBin = document.getElementById('b-max-bin');
    els.bSizeText = document.getElementById('b-size-text');
    els.bSizeBin = document.getElementById('b-size-bin');
    els.bOkText = document.getElementById('b-ok-text');
    els.bOkBin = document.getElementById('b-ok-bin');
  }

  // ── 初始化 ──
  function init() {
    cacheDom();
    bindEvents();
    loadBoth();
  }

  function bindEvents() {
    els.modeBoth.addEventListener('click', function () { switchMode('both'); });
    els.modeText.addEventListener('click', function () { switchMode('text'); });
    els.modeBinary.addEventListener('click', function () { switchMode('binary'); });
    els.btnRefresh.addEventListener('click', function () { reload(); });
    els.btnBench.addEventListener('click', function () { runBenchmark(); });
  }

  function switchMode(mode) {
    currentMode = mode;
    els.modeBoth.classList.toggle('active', mode === 'both');
    els.modeText.classList.toggle('active', mode === 'text');
    els.modeBinary.classList.toggle('active', mode === 'binary');

    els.panels.classList.toggle('single', mode !== 'both');
    els.textPanel.classList.toggle('hidden', mode === 'binary');
    els.binaryPanel.classList.toggle('hidden', mode === 'text');
    els.textPanel.classList.toggle('hidden-on-mobile', false);
    els.binaryPanel.classList.toggle('hidden-on-mobile', false);
  }

  // ── 加载数据 ──
  function loadBoth() {
    // 重置状态
    textData = null;
    binaryData = null;
    textTiming = null;
    binaryTiming = null;
    textByteLen = 0;

    els.textRender.innerHTML = '<div class="render-placeholder">加载中...</div>';
    els.binaryRender.innerHTML = '<div class="render-placeholder">加载中...</div>';
    els.textRaw.textContent = '加载中...';
    els.binaryRaw.textContent = '加载中...';

    setStatus(els.textStatus, 'loading', '请求中...');
    setStatus(els.binaryStatus, 'loading', '请求中...');

    var t0 = performance.now();
    fetch(TEXT_URL)
      .then(function (resp) {
        var t1 = performance.now();
        textTiming = t1 - t0;
        if (!resp.ok) {
          throw new Error('HTTP ' + resp.status);
        }
        return resp.json();
      })
      .then(function (data) {
        textData = JSON.stringify(data);
        displayTextResult(data);
      })
      .catch(function (err) {
        setStatus(els.textStatus, 'error', '请求失败');
        els.textRaw.textContent = '请求失败: ' + err.message;
        els.textRender.innerHTML = '<div class="render-error">请求失败，请确认后端服务已启动</div>';
      });

    var b0 = performance.now();
    fetch(BINARY_URL)
      .then(function (resp) {
        var b1 = performance.now();
        if (!resp.ok) {
          throw new Error('HTTP ' + resp.status);
        }
        binaryTiming = b1 - b0;
        return resp.arrayBuffer();
      })
      .then(function (buf) {
        var bytes = new Uint8Array(buf);
        binaryData = bytes;
        displayBinaryResult(bytes);
      })
      .catch(function (err) {
        setStatus(els.binaryStatus, 'error', '请求失败');
        els.binaryRaw.textContent = '请求失败: ' + err.message;
        els.binaryRender.innerHTML = '<div class="render-error">加载失败: ' + err.message + '<br>点击「重新加载」再试一次</div>';
      });
  }

  function reload() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    els.insightBar.innerHTML = '重新加载中...';
    els.benchSection.style.display = 'none';
    loadBoth();
  }

  function runBenchmark() {
    var RUNS = 20;
    var TOTAL = RUNS * 2; // text + binary 各20次 = 40次请求
    els.benchSection.style.display = 'block';
    els.benchStatus.textContent = '请求中 0/' + TOTAL + '...';
    // 清空旧数据
    els.bAvgText.textContent = els.bAvgBin.textContent = '...';
    els.bMinText.textContent = els.bMinBin.textContent = '...';
    els.bMaxText.textContent = els.bMaxBin.textContent = '...';
    els.bSizeText.textContent = els.bSizeBin.textContent = '...';
    els.bOkText.textContent = els.bOkBin.textContent = '...';

    var textTimes = [];
    var textSizes = [];
    var binTimes = [];
    var binSizes = [];
    var done = 0;

    function finishOne() {
      done++;
      els.benchStatus.textContent = '请求中 ' + done + '/' + TOTAL + '...';
      if (done >= TOTAL) {
        showBenchResults(textTimes, textSizes, binTimes, binSizes);
      }
    }

    function doTextRun() {
      var t0 = performance.now();
      fetch(TEXT_URL)
        .then(function (resp) {
          if (!resp.ok) throw new Error('status ' + resp.status);
          return resp.text();
        })
        .then(function (text) {
          var t1 = performance.now();
          textTimes.push(t1 - t0);
          textSizes.push(eng.getByteLength(text));
          finishOne();
        })
        .catch(function () {
          finishOne();
        });
    }

    function doBinRun() {
      var t0 = performance.now();
      fetch(BINARY_URL)
        .then(function (resp) {
          if (!resp.ok) throw new Error('status ' + resp.status);
          return resp.arrayBuffer();
        })
        .then(function (buf) {
          var t1 = performance.now();
          binTimes.push(t1 - t0);
          binSizes.push(buf.byteLength);
          finishOne();
        })
        .catch(function () {
          finishOne();
        });
    }

    // 每100ms发起一组，组内 text 与 binary 再错开 50ms，避免突发拥塞
    for (var i = 0; i < RUNS; i++) {
      (function (idx) {
        setTimeout(function () {
          doTextRun();
          setTimeout(doBinRun, 50);
        }, idx * 100);
      })(i);
    }
  }

  function showBenchResults(textTimes, textSizes, binTimes, binSizes) {
    function avg(arr) {
      if (arr.length === 0) return 0;
      var s = 0;
      for (var i = 0; i < arr.length; i++) s += arr[i];
      return s / arr.length;
    }
    function min(arr) { return arr.length > 0 ? Math.min.apply(null, arr) : 0; }
    function max(arr) { return arr.length > 0 ? Math.max.apply(null, arr) : 0; }
    function pct(arr, total) { return Math.round(arr.length / total * 100) + '%'; }

    els.bAvgText.textContent = avg(textTimes).toFixed(0) + ' ms';
    els.bAvgBin.textContent = avg(binTimes).toFixed(0) + ' ms';
    els.bMinText.textContent = min(textTimes).toFixed(0) + ' ms';
    els.bMinBin.textContent = min(binTimes).toFixed(0) + ' ms';
    els.bMaxText.textContent = max(textTimes).toFixed(0) + ' ms';
    els.bMaxBin.textContent = max(binTimes).toFixed(0) + ' ms';
    els.bSizeText.textContent = eng.formatBytes(Math.round(avg(textSizes)));
    els.bSizeBin.textContent = eng.formatBytes(Math.round(avg(binSizes)));
    els.bOkText.textContent = pct(textTimes, 20);
    els.bOkBin.textContent = pct(binTimes, 20);
    els.benchStatus.textContent = '完成（共40次请求）';

    // 高亮更快的一方
    var textAvg = avg(textTimes);
    var binAvg = avg(binTimes);
    if (textAvg > 0 && binAvg > 0) {
      if (textAvg < binAvg) {
        els.bAvgText.style.color = '#81c784';
        els.bAvgBin.style.color = '#ff6b6b';
      } else {
        els.bAvgText.style.color = '#ff6b6b';
        els.bAvgBin.style.color = '#81c784';
      }
    }
  }

  // ── 文本结果展示 ──
  function displayTextResult(data) {
    textByteLen = eng.getByteLength(textData);
    setStatus(els.textStatus, 'done', '完成');
    els.textSize.textContent = eng.formatBytes(textByteLen);
    els.textTime.textContent = textTiming.toFixed(1) + ' ms';
    els.textContentType.textContent = 'application/json';

    // 截取前3000字符显示
    var text = JSON.stringify(data, null, 2);
    var preview = text.length > 3000 ? text.substring(0, 3000) + '\n\n... (省略 ' + (text.length - 3000) + ' 字符)' : text;
    els.textRaw.textContent = preview;

    renderFeed(data, els.textRender);
    updateChart();
  }

  // ── 二进制结果展示 ──
  function displayBinaryResult(bytes) {
    setStatus(els.binaryStatus, 'done', '完成');
    els.binarySize.textContent = eng.formatBytes(bytes.length);
    els.binaryTime.textContent = binaryTiming.toFixed(1) + ' ms';
    els.binaryContentType.textContent = 'application/octet-stream';

    // HEX 预览（前80行）
    var hexText = eng.formatHex(bytes, 16);
    var lines = hexText.split('\n');
    if (lines.length > 80) {
      hexText = lines.slice(0, 80).join('\n') + '\n... (省略 ' + (lines.length - 80) + ' 行)';
    }
    els.binaryRaw.textContent = hexText;

    // 检查解码库是否可用
    if (typeof MessagePack === 'undefined') {
      els.binaryRender.innerHTML = '<div class="render-error">解码库未加载（CDN 可能暂时不可用）。<br>点击「重新加载」再试一次。</div>';
      setStatus(els.binaryStatus, 'error', '解码库缺失');
      return;
    }

    // 数据完整性检查：空数据视为异常
    if (bytes.length === 0) {
      els.binaryRender.innerHTML = '<div class="render-error">收到的二进制数据异常（0 字节），可能传输不完整。</div>';
      setStatus(els.binaryStatus, 'error', '数据异常');
      return;
    }

    // 用 MessagePack 解码并渲染
    try {
      var decodeStart = performance.now();
      var data = MessagePack.decode(bytes);
      var decodeTime = performance.now() - decodeStart;
      els.binaryTime.textContent = binaryTiming.toFixed(1) + ' ms (解码: ' + decodeTime.toFixed(1) + ' ms)';
      renderFeed(data, els.binaryRender);
    } catch (e) {
      els.binaryRender.innerHTML = '<div class="render-error">MessagePack 解码失败: ' + e.message
        + '<br>收到 ' + bytes.length + ' 字节，前4字节: ['
        + bytes[0].toString(16) + ' ' + (bytes.length > 1 ? bytes[1].toString(16) : '--') + ' '
        + (bytes.length > 2 ? bytes[2].toString(16) : '--') + ' '
        + (bytes.length > 3 ? bytes[3].toString(16) : '--') + ']'
        + '<br><br>二进制格式必须有对应的解码器才能还原——两端协议不匹配，数据就是废字节。</div>';
      setStatus(els.binaryStatus, 'error', '解码失败');
    }

    updateChart();
  }

  // ── 渲染动态流 ──
  function renderFeed(data, container) {
    if (!data || !data.users || !data.posts) {
      container.innerHTML = '<div class="render-error">数据格式异常</div>';
      return;
    }

    var users = data.users;
    var userMap = {};
    for (var i = 0; i < users.length; i++) {
      userMap[users[i].id] = users[i];
    }

    var html = '';
    var posts = data.posts;
    for (var j = 0; j < posts.length; j++) {
      var p = posts[j];
      var author = userMap[p.author_id] || { nickname: '未知用户', role: '' };

      html += '<div class="feed-card">';
      html += '<div class="feed-card-header">';
      html += '<span class="feed-author">' + esc(author.nickname) + '</span>';
      html += '<span class="feed-role">' + esc(author.role) + '</span>';
      html += '<span class="feed-type-tag ' + esc(p.type) + '">' + typeLabel(p.type) + '</span>';
      html += '</div>';

      html += '<div class="feed-content">' + esc(p.content).replace(/\n/g, '<br>') + '</div>';

      // 图片列表
      if (p.images && p.images.length > 0) {
        html += '<div class="feed-images">';
        for (var k = 0; k < p.images.length; k++) {
          var img = p.images[k];
          html += '<span class="feed-image-thumb">🖼 ' + img.width + '×' + img.height + ' ' + eng.formatBytes(img.size_bytes) + '</span>';
        }
        html += '</div>';
      }

      // 投票
      if (p.poll_options && p.poll_options.length > 0) {
        var maxVotes = 0;
        for (var vi = 0; vi < p.poll_options.length; vi++) {
          if (p.poll_options[vi].votes > maxVotes) maxVotes = p.poll_options[vi].votes;
        }
        for (var vj = 0; vj < p.poll_options.length; vj++) {
          var opt = p.poll_options[vj];
          var pct = maxVotes > 0 ? Math.round(opt.votes / maxVotes * 100) : 0;
          html += '<div class="poll-option">';
          html += '<span>' + esc(opt.text) + '</span>';
          html += '<div class="poll-bar-bg"><div class="poll-bar-fill" style="width:' + pct + '%"></div></div>';
          html += '<span class="poll-votes">' + opt.votes + '票</span>';
          html += '</div>';
        }
      }

      // 引用转发
      if (p.reposted_post) {
        var rp = p.reposted_post;
        html += '<div class="feed-card" style="margin:8px 0;border-color:rgba(206,147,216,0.2)">';
        html += '<div class="feed-card-header">';
        html += '<span class="feed-author" style="font-size:0.8rem">' + esc(rp.author_nickname) + '</span>';
        html += '</div>';
        html += '<div class="feed-content" style="font-size:0.8rem">' + esc(rp.content).replace(/\n/g, '<br>') + '</div>';
        html += '</div>';
      }

      // 统计
      var s = p.stats || {};
      html += '<div class="feed-meta">';
      html += '<span>❤ ' + (s.likes || 0) + '</span>';
      html += '<span>💬 ' + (s.comments_count || 0) + '</span>';
      html += '<span>↗ ' + (s.shares || 0) + '</span>';
      html += '<span>👁 ' + (s.views || 0) + '</span>';
      html += '</div>';

      // 评论
      if (p.comments && p.comments.length > 0) {
        html += '<div class="feed-comments">';
        for (var ci = 0; ci < Math.min(p.comments.length, 3); ci++) {
          var cmt = p.comments[ci];
          var cmtAuthor = userMap[cmt.author_id] || { nickname: '用户#' + cmt.author_id };
          html += '<div class="feed-comment">';
          html += '<span class="feed-comment-author">' + esc(cmtAuthor.nickname) + '</span>: ';
          html += esc(cmt.content) + ' <span style="color:#888;font-size:0.7rem">❤' + cmt.likes + '</span>';
          html += '</div>';
        }
        html += '</div>';
      }

      html += '</div>';
    }

    container.innerHTML = '<div class="render-scroll">' + html + '</div>';
  }

  function typeLabel(type) {
    var map = { text: '文字', image: '图文', poll: '投票', repost: '转发' };
    return map[type] || type;
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 图表 ──
  function updateChart() {
    var binByteLen = binaryData ? binaryData.length : 0;
    // 真实 gzip 压缩（非模拟）
    var textGzip = eng.gzipSize(textData) || 0;
    var binGzip = binaryData ? eng.gzipSize(binaryData) : 0;

    var insightText = '';
    if (binByteLen > 0 && textGzip > 0) {
      var ratio = ((1 - binByteLen / textByteLen) * 100).toFixed(0);
      insightText = '原始二进制比原始JSON小约 ' + ratio + '%，但gzip压缩后差距缩小到约 '
        + ((1 - binGzip / textGzip) * 100).toFixed(0) + '%。'
        + '<br>关键区别不在体积——在<strong>可读性、可调试性和跨平台通用性</strong>。';
    }

    if (els.insightBar && insightText) {
      els.insightBar.innerHTML = insightText;
    }

    if (!els.chartCanvas) return;
    loadChartJS(function () {
      var ctx = els.chartCanvas.getContext('2d');
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['原始 JSON', '原始 MessagePack', 'JSON + gzip', 'MsgPack + gzip'],
          datasets: [{
            label: '字节数',
            data: [textByteLen, binByteLen, textGzip, binGzip],
            backgroundColor: [
              'rgba(129,199,132,0.7)',
              'rgba(206,147,216,0.7)',
              'rgba(129,199,132,0.3)',
              'rgba(206,147,216,0.3)'
            ],
            borderColor: [
              'rgba(129,199,132,1)',
              'rgba(206,147,216,1)',
              'rgba(129,199,132,0.6)',
              'rgba(206,147,216,0.6)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return eng.formatBytes(ctx.raw);
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(242,228,207,0.05)' },
              ticks: {
                color: '#888',
                callback: function (v) { return eng.formatBytes(v); }
              }
            },
            y: {
              grid: { display: false },
              ticks: { color: '#ccc', font: { size: 11 } }
            }
          }
        }
      });
    });
  }

  // ── Chart.js 动态加载 ──
  function loadChartJS(cb) {
    if (typeof Chart !== 'undefined') { cb(); return; }
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = cb;
    document.head.appendChild(script);
  }

  // ── 辅助 ──
  function setStatus(el, state, text) {
    el.textContent = text;
    el.className = 'panel-status ' + state;
  }

  // ── 启动 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
