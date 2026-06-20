/*
 * app.js — UI 编排：加载样例 / 上传自有文档 -> 渲染预览 -> 计算三方案 -> 下载真实文件
 */
(function () {
  'use strict';

  var sizeChart = null;
  var currentSample = null;
  var currentReport = null;

  // ── 工具 ──────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function download(filename, content, mime) {
    var blob = (content instanceof Uint8Array)
      ? new Blob([content], { type: mime })
      : new Blob([content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ── 渲染预览 ──────────────────────────────────────────
  function renderPreview(sample) {
    var byName = {};
    sample.images.forEach(function (im) { byName[im.name] = im; });
    var html = Packer.renderMarkdown(sample.markdown, function (name) {
      return byName[name] ? Packer.dataUri(byName[name]) : name;
    });
    $('mdRendered').innerHTML = html;
    $('mdSource').textContent = sample.markdown;

    var rawImg = sample.images.reduce(function (s, im) { return s + Packer.imageBytes(im); }, 0);
    $('docMeta').innerHTML =
      '<span>正文：<strong>' + fmtBytes(Packer.utf8Len(sample.markdown)) + '</strong></span>' +
      '<span>图片：<strong>' + sample.images.length + ' 张 / ' + fmtBytes(rawImg) + '</strong></span>' +
      '<span>单发 .md：<strong style="color:#ff6b6b">对方看到 ' + sample.images.length + ' 张裂图</strong></span>';
    $('previewSection').style.display = 'block';
  }

  // ── 渲染三方案卡片 ─────────────────────────────────────
  function traitItem(ok, label) {
    var icon = ok ? 'ti-check tr-yes' : 'ti-x tr-no';
    return '<li><i class="ti ' + icon + '"></i>' + label + '</li>';
  }

  function renderStrategies(report) {
    var s = report.strategies;
    var order = [s.zip, s.base64md, s.selfHtml];
    var subs = {
      zip: '需解压才能看',
      base64md: '体积膨胀约 33%',
      selfHtml: '双击浏览器即看'
    };
    var dl = {
      zip: '下载 .zip',
      base64md: '下载 .md',
      selfHtml: '下载 .html'
    };
    $('strategyGrid').innerHTML = order.map(function (st) {
      return '<div class="strategy-card ' + st.key + '">' +
        '<div class="sc-name"><i class="ti ti-file-zip"></i>' + st.label + '</div>' +
        '<div class="sc-size">' + fmtBytes(st.bytes) + '</div>' +
        '<div class="sc-sub">' + subs[st.key] + ' · ' + st.bytes.toLocaleString() + ' 字节</div>' +
        '<ul class="sc-traits">' +
          traitItem(st.singleFile, '单文件') +
          traitItem(st.openOnDblClick, '双击即看') +
          traitItem(st.textDiff, '可 git diff') +
          traitItem(st.editableText, '可当文本改') +
          traitItem(st.offline, '离线可用') +
        '</ul>' +
        '<button class="btn btn-primary btn-sm" data-dl="' + st.key + '"><i class="ti ti-download"></i> ' + dl[st.key] + '</button>' +
      '</div>';
    }).join('');

    $('strategyGrid').querySelectorAll('[data-dl]').forEach(function (btn) {
      btn.addEventListener('click', function () { doDownload(btn.getAttribute('data-dl')); });
    });

    renderChart(report);
    renderSizeInsight(report);
    $('resultSection').style.display = 'block';
  }

  function renderChart(report) {
    var s = report.strategies;
    var ctx = $('sizeChart').getContext('2d');
    if (sizeChart) sizeChart.destroy();
    sizeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['.md + assets 打 ZIP', 'base64 内嵌 .md', '自包含 HTML'],
        datasets: [{
          label: '文件体积 (KB)',
          data: [s.zip.bytes / 1024, s.base64md.bytes / 1024, s.selfHtml.bytes / 1024],
          backgroundColor: ['rgba(76,175,80,0.7)', 'rgba(255,107,107,0.7)', 'rgba(255,215,0,0.7)'],
          borderColor: ['#4CAF50', '#ff6b6b', '#ffd700'],
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.parsed.x.toFixed(1) + ' KB'; } } }
        },
        scales: {
          x: { ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.07)' }, title: { display: true, text: '体积 (KB)', color: '#888' } },
          y: { ticks: { color: '#e8e8e8' }, grid: { display: false } }
        }
      }
    });
  }

  function renderSizeInsight(report) {
    var s = report.strategies;
    var ratioMd = (s.base64md.bytes / s.zip.bytes);
    var rawImg = report.rawImageBytes;
    $('sizeInsightText').innerHTML =
      'ZIP 最小（' + fmtBytes(s.zip.bytes) + '），因为图片按原样存放，几乎只等于原始图片体积（' + fmtBytes(rawImg) + '）。' +
      'base64 内嵌（' + fmtBytes(s.base64md.bytes) + '）和自包含 HTML（' + fmtBytes(s.selfHtml.bytes) + '）都被 base64 撑大到约 <strong>' + ratioMd.toFixed(2) + ' 倍</strong>。' +
      '体积差距其实不大，真正的区别在下面那张属性表。';
  }

  // ── 下载 ──────────────────────────────────────────────
  function doDownload(key) {
    if (!currentSample) return;
    if (key === 'zip') {
      var files = [{ name: (currentSample.mdName || 'document.md'), data: Packer.utf8Bytes(currentSample.markdown) }];
      currentSample.images.forEach(function (im) {
        files.push({ name: 'assets/' + im.name, data: Packer.b64ToBytes(im.b64) });
      });
      download('document.zip', Packer.buildStoreZip(files), 'application/zip');
    } else if (key === 'base64md') {
      download('document.embedded.md', Packer.buildBase64Markdown(currentSample), 'text/markdown');
    } else if (key === 'selfHtml') {
      download('document.selfcontained.html', Packer.buildSelfContainedHtml(currentSample), 'text/html');
    }
  }

  // ── 跑一份文档 ─────────────────────────────────────────
  function run(sample) {
    currentSample = sample;
    currentReport = Packer.computeReport(sample);
    renderPreview(sample);
    renderStrategies(currentReport);
    renderMatrix();
    $('whySection').style.display = 'block';
    $('previewSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── 格式对比矩阵（定性事实）────────────────────────────
  var MATRIX = {
    cols: ['格式', '单文件', '离线自包含', '可 git diff', '可 grep 搜索', '可当文本改', '双击即看', '通用工具'],
    rows: [
      { name: '.md + assets 文件夹', cls: 'row-md', cells: ['no', 'ok', 'ok', 'ok', 'ok', 'no', 'ok'] },
      { name: 'base64 内嵌 .md', cells: ['ok', 'ok', 'no', 'no', 'no', 'no', 'partial'] },
      { name: 'TextBundle / TextPack', cells: ['ok', 'ok', 'no', 'no', 'partial', 'no', 'no'] },
      { name: 'Jupyter .ipynb', cells: ['ok', 'ok', 'partial', 'partial', 'partial', 'no', 'partial'] },
      { name: '自包含 HTML', cls: 'row-self', cells: ['ok', 'ok', 'no', 'no', 'no', 'ok', 'ok'] },
      { name: 'MHTML (.mht)', cells: ['ok', 'ok', 'no', 'no', 'no', 'partial', 'partial'] },
      { name: 'PDF', cells: ['ok', 'ok', 'no', 'partial', 'no', 'ok', 'ok'] },
      { name: 'DOCX', cells: ['ok', 'ok', 'no', 'no', 'ok', 'ok', 'partial'] }
    ]
  };

  function cellMark(v) {
    if (v === 'ok') return '<td class="cell-ok">\u2713</td>';
    if (v === 'no') return '<td class="cell-no">\u2717</td>';
    return '<td class="cell-partial">\u25b3</td>';
  }

  function renderMatrix() {
    var head = '<thead><tr>' + MATRIX.cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead>';
    var body = '<tbody>' + MATRIX.rows.map(function (r) {
      return '<tr class="' + (r.cls || '') + '"><td>' + r.name + '</td>' + r.cells.map(cellMark).join('') + '</tr>';
    }).join('') + '</tbody>';
    $('matrixTable').innerHTML = head + body;
    $('matrixSection').style.display = 'block';
  }

  // ── 上传自有文档 ───────────────────────────────────────
  var pendingMd = null;     // { name, text }
  var pendingImgs = [];      // [{ name, mime, b64, bytes }]

  function readImage(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        resolve({ name: file.name, mime: file.type || 'image/png', b64: b64, bytes: file.size });
      };
      reader.readAsDataURL(file);
    });
  }

  function updateUploadStatus() {
    var parts = [];
    if (pendingMd) parts.push('已选 ' + pendingMd.name);
    if (pendingImgs.length) parts.push(pendingImgs.length + ' 张图');
    $('uploadStatus').textContent = parts.join(' · ');
  }

  // ── 事件绑定 ───────────────────────────────────────────
  function init() {
    $('runSampleBtn').addEventListener('click', function () {
      run(JSON.parse(JSON.stringify(window.SAMPLE)));
    });

    $('useOwnBtn').addEventListener('click', function () {
      var show = $('uploadRow').style.display === 'none';
      $('uploadRow').style.display = show ? 'flex' : 'none';
      $('ownHint').style.display = show ? 'block' : 'none';
    });

    $('mdFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { pendingMd = { name: f.name, text: reader.result }; updateUploadStatus(); };
      reader.readAsText(f);
    });

    $('imgFiles').addEventListener('change', function (e) {
      Promise.all(Array.prototype.map.call(e.target.files, readImage)).then(function (imgs) {
        pendingImgs = imgs; updateUploadStatus();
      });
    });

    $('runOwnBtn').addEventListener('click', function () {
      if (!pendingMd) { $('uploadStatus').textContent = '请先选一个 .md 文件'; return; }
      run({
        title: pendingMd.name.replace(/\.(md|markdown)$/i, ''),
        mdName: pendingMd.name,
        markdown: pendingMd.text,
        images: pendingImgs
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
