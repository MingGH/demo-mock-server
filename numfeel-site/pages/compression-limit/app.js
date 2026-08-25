// ── 压缩极限 Demo：交互逻辑 ──
// 依赖：engine.js（CE）、data.js（SAMPLE_TEXT 等）、cat-data.js（CAT_PNG_B64）、
//       pako（CDN，gzip 实现）、Chart.js（CDN，曲线图）。
(function () {
  'use strict';

  // ========== 行为埋点（NFTrack）==========
  // 事件：session_start / select_sample / compress_round / stall_milestone / universal_egg / session_end
  function nfTrack(name, props, opts) {
    try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
  }
  nfTrack('session_start', {});
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', {
      reason: 'leave',
      rounds: state ? state.round : 0,
      file: state ? state.name : ''
    }, { force: true });
  });

  // ========== 样本定义 ==========

  var SAMPLES = [
    {
      id: 'novel', file: 'novel.txt', icon: 'ti-book', kind: 'text',
      title: '英文小说',
      desc: '原创英文科普文：六个章节，讲的就是鸽笼原理。',
      predict: '预测：能压掉一半以上'
    },
    {
      id: 'cat', file: 'cat.png', icon: 'ti-photo', kind: 'image',
      title: '真实照片',
      desc: '一张猫片。PNG 内部在编码时已经用 deflate 压过一遍。',
      predict: '预测：第一轮就压不动，甚至变大'
    },
    {
      id: 'random', file: 'random.bin', icon: 'ti-dice-5', kind: 'binary',
      title: '纯随机数据',
      desc: '64KB 密码学随机字节，每个比特都不可预测。',
      predict: '预测：一个比特都压不掉'
    },
    {
      id: 'spam', file: 'spam.txt', icon: 'ti-repeat', kind: 'text',
      title: '重复文本',
      desc: '同一句英文重复 1000 遍，重复就是压缩的燃料。',
      predict: '预测：压掉九成以上'
    }
  ];

  // 各样本的「压不动了」判词
  var VERDICTS = {
    novel: '语言的冗余已经被吃光，剩下的每个字节都在满负荷运载信息。从现在起，每压一层只会多交约 20~40 字节的格式税。',
    cat: '这张照片在 PNG 编码时就交过一遍冗余了。你看到的 +x% 不是 bug：gzip 对已经塞满的数据无能为力，只能收税。',
    random: '随机数据没有任何规律可榨，第一轮就没得压。这就是「信息的墙」本墙。',
    spam: '重复是压缩的燃料，但燃料烧完就没了。文件已经小到只剩 gzip 格式税本身。'
  };

  // ========== 状态 ==========

  var state = null;   // { id, name, kind, original, current, round, history[], stallShown }
  var bytesCache = {}; // 样本 -> Uint8Array
  var chart = null;

  function $(id) { return document.getElementById(id); }

  // ========== 字节构造 ==========

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function buildBytes(id) {
    if (bytesCache[id]) return bytesCache[id];
    var bytes = null;
    if (id === 'novel') {
      bytes = new TextEncoder().encode(SAMPLE_TEXT);
    } else if (id === 'cat') {
      bytes = base64ToBytes(CAT_PNG_B64);
    } else if (id === 'random') {
      bytes = new Uint8Array(65536);
      crypto.getRandomValues(bytes);
    } else if (id === 'spam') {
      var s = '';
      for (var i = 0; i < SPAM_REPEAT; i++) s += SPAM_UNIT;
      bytes = new TextEncoder().encode(s);
    }
    bytesCache[id] = bytes;
    return bytes;
  }

  // ========== 样本卡片 ==========

  function renderSampleCards() {
    var grid = $('sampleGrid');
    var html = '';
    for (var i = 0; i < SAMPLES.length; i++) {
      var s = SAMPLES[i];
      var size = CE.formatBytes(buildBytes(s.id).length);
      html += '<button class="sample-card" data-id="' + s.id + '">'
        + '<span class="sc-icon"><i class="ti ' + s.icon + '"></i></span>'
        + '<span class="sc-file">' + s.file + '</span>'
        + '<span class="sc-size">' + size + '</span>'
        + '<span class="sc-desc">' + s.desc + '</span>'
        + '<span class="sc-predict">' + s.predict + '</span>'
        + '</button>';
    }
    grid.innerHTML = html;
    var cards = grid.getElementsByTagName('button');
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener('click', function () {
        loadSample(this.getAttribute('data-id'));
      });
    }
  }

  // ========== 加载 / 压缩 ==========

  function loadSample(id, silent) {
    var meta = null;
    var i;
    for (i = 0; i < SAMPLES.length; i++) {
      if (SAMPLES[i].id === id) { meta = SAMPLES[i]; break; }
    }
    if (!meta) return;
    var bytes = buildBytes(id);
    state = {
      id: id,
      name: meta.file,
      kind: meta.kind,
      original: bytes,
      current: bytes,
      round: 0,
      history: [{ round: 0, size: bytes.length, entropy: CE.entropyBitsPerByte(bytes) }],
      stallShown: false
    };
    renderAll();
    if (!silent) nfTrack('select_sample', { file: meta.file });
  }

  function compressOnce() {
    if (!state) return;
    if (typeof pako === 'undefined') {
      showError('pako（gzip 实现）未能从 CDN 加载，当前环境无法压缩。联网后刷新即可。');
      return;
    }
    hideError();
    var before = state.current;
    var beforeSize = before.length;
    var out;
    try {
      out = pako.gzip(before);
    } catch (e) {
      showError('压缩出错：' + e.message);
      return;
    }
    state.round++;
    var ent = CE.entropyBitsPerByte(out);
    state.history.push({ round: state.round, size: out.length, entropy: ent });
    state.current = out;
    renderAll();
    nfTrack('compress_round', {
      round: state.round,
      size: out.length,
      delta_pct: CE.pctChange(beforeSize, out.length),
      entropy: Math.round(ent * 100) / 100
    });
    maybeShowStall();
  }

  function compressTimes(n) {
    var i = 0;
    function step() {
      if (i >= n) return;
      compressOnce();
      i++;
      if (i < n) setTimeout(step, 170);
    }
    step();
  }

  function maybeShowStall() {
    if (!state || state.stallShown) return;
    var grow = CE.consecutiveGrowthRounds(state.history);
    if (state.round >= 2 && grow >= 2) {
      state.stallShown = true;
      var box = $('verdictBox');
      box.innerHTML = '<div class="vd-title"><i class="ti ti-alert-triangle"></i> 压不动了（连续 ' + grow + ' 轮不降反升）</div>'
        + '<div class="vd-body">' + (VERDICTS[state.id] || VERDICTS.novel) + '</div>';
      box.style.display = 'block';
      nfTrack('stall_milestone', { file: state.name, round: state.round });
    }
  }

  // ========== 渲染 ==========

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderAll() {
    if (!state) return;

    // 样本卡片激活态
    var cards = $('sampleGrid').getElementsByTagName('button');
    for (var c = 0; c < cards.length; c++) {
      cards[c].className = cards[c].getAttribute('data-id') === state.id ? 'sample-card active' : 'sample-card';
    }

    // 文件行
    $('termFileRow').innerHTML = 'user@compress-lab:~$ <span class="tfr-name">' + state.name + '</span>'
      + ' <span class="lg-dim">(' + CE.formatBytes(state.original.length) + ' 原始大小)</span>';

    // 统计卡
    var cur = state.current;
    $('statSize').textContent = CE.formatBytes(cur.length);
    $('statRounds').textContent = state.round;

    var totalEl = $('statTotal');
    var totalPct = CE.pctChange(state.original.length, cur.length);
    totalEl.textContent = CE.formatPct(totalPct);
    totalEl.className = 'ts-value ' + (totalPct < 0 ? 'good' : (totalPct > 0 ? 'bad' : ''));

    var lastEl = $('statLast');
    if (state.round > 0) {
      var lastPct = CE.pctChange(state.history[state.round - 1].size, cur.length);
      lastEl.textContent = CE.formatPct(lastPct);
      lastEl.className = 'ts-value ' + (lastPct < 0 ? 'good' : (lastPct > 0 ? 'bad' : ''));
    } else {
      lastEl.textContent = '-';
      lastEl.className = 'ts-value';
    }

    // 熵仪表盘
    var ent = state.history[state.round].entropy;
    var entVal = $('entropyVal');
    entVal.textContent = ent.toFixed(2) + ' / 8.00 bits/byte';
    entVal.className = 'eg-val' + (ent >= 7.9 ? ' full' : '');
    var fill = $('entropyFill');
    fill.style.width = Math.min(100, ent / 8 * 100) + '%';
    fill.className = 'eg-fill' + (ent >= 7.9 ? ' full' : '');

    // 判定框重置
    $('verdictBox').style.display = 'none';

    renderLog();
    renderPreview();
    renderHex();
    renderChart();
    renderDownloadHint();
  }

  function renderLog() {
    var html = '';
    var h = state.history;
    var i;
    html += '<span class="lg-cmd">$ cat ' + state.name + '</span>\n'
      + '  <span class="lg-size">' + CE.formatInt(h[0].size) + ' B</span>'
      + '  <span class="lg-dim">熵 ' + h[0].entropy.toFixed(2) + ' bits/byte</span>\n';
    for (i = 1; i < h.length; i++) {
      var prev = h[i - 1];
      var cur = h[i];
      var pct = CE.pctChange(prev.size, cur.size);
      var gzName = state.name + '.gz';
      var k;
      for (k = 1; k < i; k++) gzName += '.gz';
      html += '<span class="lg-cmd">$ gzip ' + gzName + '</span>\n'
        + '  <span class="lg-size">' + CE.formatInt(prev.size) + '</span> -> <span class="lg-size">' + CE.formatInt(cur.size) + ' B</span>'
        + '  <span class="' + (pct < 0 ? 'lg-good' : 'lg-bad') + '">' + CE.formatPct(pct) + '</span>'
        + '  <span class="lg-dim">熵 ' + prev.entropy.toFixed(2) + ' -> ' + cur.entropy.toFixed(2) + '</span>\n';
    }
    var log = $('termLog');
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
  }

  function renderPreview() {
    var el = $('filePreview');
    if (state.round === 0) {
      if (state.kind === 'image') {
        el.innerHTML = '<img class="prev-img" alt="样本照片" src="data:image/png;base64,' + CAT_PNG_B64 + '">';
      } else if (state.kind === 'text') {
        var text = '';
        if (state.id === 'novel') {
          text = SAMPLE_TEXT.substring(0, 260);
        } else {
          text = SPAM_UNIT + SPAM_UNIT + SPAM_UNIT + '\n(……重复 1000 遍)';
        }
        el.innerHTML = '<div class="prev-text">' + escapeHtml(text) + '</div>';
      } else {
        el.innerHTML = '<div class="prev-binary">二进制数据，没有可读预览。看右边的 hexdump：和随机数据没有区别。</div>';
      }
    } else {
      el.innerHTML = '<div class="prev-binary">已压缩 ' + state.round + ' 轮：内容是不可读的二进制。'
        + '看右边的 hexdump--和随机数据已经毫无区别，这就是「塞满了」的样子。</div>';
    }
  }

  function renderHex() {
    $('hexDump').textContent = CE.hexdumpLines(state.current, 4).join('\n');
  }

  function renderChart() {
    if (typeof Chart === 'undefined') return;
    var labels = [];
    var sizes = [];
    var i;
    for (i = 0; i < state.history.length; i++) {
      labels.push(String(state.history[i].round));
      sizes.push(state.history[i].size);
    }
    if (!chart) {
      var ctx = $('sizeChart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: '文件大小',
            data: sizes,
            borderColor: '#ffd700',
            backgroundColor: 'rgba(255, 215, 0, 0.10)',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            pointBackgroundColor: '#ffd700'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (c) {
                  var idx = c.dataIndex;
                  var line = CE.formatInt(c.parsed.y) + ' B';
                  if (idx > 0) {
                    line += '（' + CE.formatPct(CE.pctChange(state.history[idx - 1].size, c.parsed.y)) + '）';
                  }
                  return line;
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: '压缩轮数', color: '#888' },
              ticks: { color: '#888' },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: {
              title: { display: true, text: '文件大小', color: '#888' },
              ticks: { color: '#888', callback: function (v) { return CE.formatBytes(v); } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              suggestedMax: state.original.length * 1.1
            }
          }
        }
      });
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = sizes;
      chart.update();
    }
  }

  function showError(msg) {
    var el = $('termError');
    el.textContent = msg;
    el.style.display = 'block';
  }

  // ========== 下载当前文件 ==========

  /**
   * 构造当前文件的下载名：每压一轮追加一层 .gz 后缀。
   * @returns {string} 如 "novel.txt.gz.gz"
   */
  function currentFileName() {
    var name = state.name;
    for (var i = 0; i < state.round; i++) name += '.gz';
    return name;
  }

  function renderDownloadHint() {
    var hint = $('downloadHint');
    if (state.round === 0) {
      hint.textContent = '# 下载得到的是未经压缩的原始文件：' + currentFileName();
    } else {
      hint.textContent = '# 下载得到的是真实文件 ' + currentFileName()
        + '（已被 gzip 套了 ' + state.round + ' 层）。想亲手还原？终端里连解 '
        + state.round + ' 次：' + currentFileName().replace(/\.gz$/, '') + ' -> 原文件';
    }
  }

  function downloadCurrent() {
    if (!state) return;
    var name = currentFileName();
    var blob = new Blob([state.current], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    nfTrack('download_click', { file: state.name, round: state.round, size: state.current.length });
  }

  function hideError() {
    $('termError').style.display = 'none';
  }

  // ========== 万能压缩器彩蛋 ==========

  function runUniversal() {
    if (!state) return;
    var box = $('universalResult');
    var origBits = 8 * state.original.length;
    var perCellBits = origBits - 8; // 每个字节格子要挤下的文件数 = 2^(bits-8)

    // 鸽笼格子：256 个 1 字节取值，以 2 字节文件为例每格挤 256 个
    var cells = '';
    var i;
    for (i = 0; i < 256; i++) {
      cells += '<div class="pg-cell' + (i % 37 === 5 ? ' hot' : '') + '">256</div>';
    }

    box.innerHTML =
      '<div class="uni-report">'
      + '<div class="uni-card uni-good">'
      + '<div class="uni-title">压缩报告</div>'
      + '<div class="uni-big">' + CE.formatBytes(state.original.length) + ' → 1 B</div>'
      + '<div class="uni-line">压缩率 ' + CE.formatPct(CE.pctChange(state.original.length, 1)) + '</div>'
      + '<div class="uni-line success">压缩成功率 100%（变小的部分）</div>'
      + '</div>'
      + '<div class="uni-card uni-bad">'
      + '<div class="uni-title">还原报告</div>'
      + '<div class="uni-big">1 / 2^' + CE.formatInt(origBits) + '</div>'
      + '<div class="uni-line">你的文件有 ' + CE.pow2Label(origBits) + ' 种可能形态</div>'
      + '<div class="uni-line danger">还原成功率 ≈ 0%（1 字节只能区分 256 种）</div>'
      + '</div>'
      + '</div>'
      + '<div class="pigeon-wrap">'
      + '<div class="pg-caption">以 2 字节文件为例：全部 <strong>65,536</strong> 种文件要塞进 1 字节的 <strong>256</strong> 个格子里，'
      + '平均每格挤 <strong>256</strong> 个文件，解压器无法区分它们。'
      + '而你手上这个 ' + CE.formatBytes(state.original.length) + ' 的文件，需要每个格子挤下 <strong>2^' + CE.formatInt(perCellBits) + '</strong> 个。</div>'
      + '<div class="pigeon-grid">' + cells + '</div>'
      + '<div class="pg-legend">每个格子 = 1 字节的一种取值（共 256 种）；格中数字 = 挤在该格的 2 字节文件数</div>'
      + '</div>'
      + '<div class="insight-box blue">'
      + '<h3><i class="ti ti-zoom-question"></i> 骗局在哪</h3>'
      + '<p>它没有违反物理，只是把「记住原来是哪个文件」这一步偷偷丢掉了。鸽笼原理：'
      + '<strong>' + CE.formatInt(65536) + ' 个球塞进 256 个盒子，至少 65,280 个球必须与别人同格</strong>。'
      + '所谓 100% 的压缩成功率，和 0% 的还原成功率，是同一枚硬币的两面。</p>'
      + '</div>';
    box.style.display = 'block';
    nfTrack('universal_egg', { file: state.name, size: state.original.length });
  }

  // ========== 初始化 ==========

  renderSampleCards();
  loadSample('novel', true);

  $('compressBtn').addEventListener('click', compressOnce);
  $('compress5Btn').addEventListener('click', function () { compressTimes(5); });
  $('resetBtn').addEventListener('click', function () {
    loadSample(state.id, true);
    nfTrack('reset', { file: state.name });
  });
  $('downloadBtn').addEventListener('click', downloadCurrent);
  $('universalBtn').addEventListener('click', runUniversal);

})();
