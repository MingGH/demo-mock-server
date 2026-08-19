// ========== JVM 内存解剖：DOM 绑定与渲染 ==========
(function () {
  var API_BASE = 'https://numfeel-api.996.ninja';
  var REFRESH_MS = 8000;
  var BARE_JDK_MB = 45;            // 文章附录裸 JDK MiniServer 的基准 RSS
  var chart = null;                 // Chart.js 实例

  // logic.js 在没有 module 的浏览器里以全局函数暴露（window.fmtMb / window.breakdown 等）。
  // 这里显式引用 window.*，并且不再定义同名局部函数——否则函数提升会遮蔽全局引用造成递归。
  var fmtMb = window.fmtMb;
  var num = window.num;
  var headline = window.headline;
  var jvmIdentity = window.jvmIdentity;
  var containerInfo = window.containerInfo;
  var breakdown = window.breakdown;
  var breakdownTotal = window.breakdownTotal;
  var contrastBare = window.contrastBare;

  // ── 工具 ──
  function byId(id) { return document.getElementById(id); }

  function setText(id, text) {
    var el = byId(id);
    if (el) { el.textContent = text; }
  }

  function showError(msg, el) {
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }

  function fmtMbText(v) { return fmtMb(v, 1) + ' MB'; }

  // ── 渲染 ──
  function renderEnv(snapshot) {
    var id = jvmIdentity(snapshot);
    setText('jvmVersion', id.javaVersion != null ? id.javaVersion : '不可读');
    setText('gcNames', id.gcNames.length > 0 ? id.gcNames.join(' / ') : '不可读');
  }

  function renderMetrics(snapshot) {
    var hl = headline(snapshot);

    setText('mRss', num(hl.rssMb) != null ? fmtMbText(hl.rssMb) : '不可读');
    var heapMax = hl.heapMaxMb;
    setText('mHeap', num(hl.heapUsedMb) != null
      ? (fmtMbText(hl.heapUsedMb) + ' / ' + (num(heapMax) != null ? fmtMbText(heapMax) : '—'))
      : '—');
    setText('mThreads', num(hl.liveThreads) != null ? hl.liveThreads : '—');
    setText('mClasses', num(hl.loadedClasses) != null ? hl.loadedClasses : '—');

    var threadBadge = byId('mThreads');
    if (threadBadge) {
      threadBadge.parentNode.classList.toggle('hot', num(hl.liveThreads) > 300);
    }

    // 容器占用条
    var ci = containerInfo(snapshot);
    var gaugeWrap = byId('gaugeWrap');
    if (ci.available) {
      gaugeWrap.style.display = '';
      setText('gaugeLabel', '容器内存占用（cgroup limit）');
      setText('gaugeText', fmtMbText(ci.usedMb) + ' / ' + fmtMbText(ci.limitMb)
        + ' · ' + Math.round(ci.percent * 100) + '%');
      byId('gaugeFill').style.width = (ci.percent * 100) + '%';
      var warn = byId('gaugeWarn');
      if (ci.percent >= 0.9) {
        warn.style.display = '';
        warn.textContent = '⚠ 已逼近容器上限——下一个到达的峰值流量可能触发 OOMKilled（exit 137）。';
      } else {
        warn.style.display = 'none';
      }
    } else {
      gaugeWrap.style.display = 'none';
    }

    setText('srvRss', num(hl.rssMb) != null ? fmtMbText(hl.rssMb) : '不可读');
  }

  function renderDonut(segments) {
    var legend = byId('legendList');
    legend.innerHTML = '';
    var total = breakdownTotal(segments) || 1;

    segments.forEach(function (seg) {
      var item = document.createElement('div');
      item.className = 'legend-item';
      var sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = seg.color;
      var lb = document.createElement('span');
      lb.className = 'legend-label';
      lb.textContent = seg.label;
      var mb = document.createElement('span');
      mb.className = 'legend-mb';
      mb.textContent = seg.mb.toFixed(1) + ' MB';
      var pct = document.createElement('span');
      pct.className = 'legend-pct';
      pct.textContent = (seg.mb / total * 100).toFixed(1) + '%';
      item.appendChild(sw); item.appendChild(lb); item.appendChild(mb); item.appendChild(pct);
      legend.appendChild(item);
    });

    if (!window.Chart) { return; }
    var ctx = byId('donutChart').getContext('2d');
    if (chart) { chart.destroy(); }
    chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: segments.map(function (s) { return s.label; }),
        datasets: [{
          data: segments.map(function (s) { return s.mb; }),
          backgroundColor: segments.map(function (s) { return s.color; }),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': ' + ctx.parsed.toFixed(1) + ' MB ('
                  + (ctx.parsed / total * 100).toFixed(1) + '%)';
              }
            }
          }
        }
      }
    });
  }

  function renderNotes(snapshot) {
    var hl = headline(snapshot);
    var segs = breakdown(snapshot);
    var total = breakdownTotal(segs) || 1;
    // 粗略算「业务 vs 环境」：堆归业务，其余归环境
    var heapSeg = null;
    for (var i = 0; i < segs.length; i++) { if (segs[i].key === 'heap') { heapSeg = segs[i]; break; } }
    var heapMb = heapSeg ? heapSeg.mb : 0;
    var envMb = Math.max(0, total - heapMb);
    var envPct = total > 0 ? (envMb / total * 100) : 0;

    var note = byId('taxNote');
    if (note) {
      note.innerHTML =
          '这份服务的稳态内存里，真正承载业务对象的<strong>堆只占约 '
          + (heapSeg ? heapSeg.mb.toFixed(1) : '0') + ' MB</strong>，剩下的约 '
          + envMb.toFixed(1) + ' MB（' + envPct.toFixed(0) + '%）是框架与运行时——'
          + '稳定下来后还注册了 <b>' + hl.liveThreads + '</b> 条线程、加载了 <b>' + hl.loadedClasses
          + '</b> 个类。这就是「环境税」：不是你的逻辑写的，但账单记在你头上。';
    }
  }

  function renderContrast(snapshot) {
    var cb = contrastBare(snapshot, BARE_JDK_MB);
    var note = byId('contrastNote');
    if (cb.available) {
      note.innerHTML = '同样的「查个数据返回个 JSON」的活，裸 JDK 用 '
        + BARE_JDK_MB + ' MB 就能干——而这个 Spring Boot 服务是它的约 '
        + '<b>' + cb.ratio.toFixed(1) + ' 倍</b>。差距不在 Java 语言，在全家桶。';
    } else {
      note.textContent = '（当前环境读不到 RSS，无法做实时倍数对比；裸 JDK 基准 45MB 来自实测。）';
    }
  }

  // ── 数据拉取 ──
  function loadSnapshot() {
    fetch(API_BASE + '/jvm-memory')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var errBox = byId('errorBox');
        if (errBox) { errBox.classList.remove('show'); }
        if (!json || json.status !== 200 || !json.data) { throw new Error('接口异常'); }
        var snapshot = json.data;
        renderEnv(snapshot);
        renderMetrics(snapshot);
        renderDonut(breakdown(snapshot));
        renderNotes(snapshot);
        renderContrast(snapshot);
        setText('lastUpdated', '上次更新于 ' + new Date().toLocaleTimeString());
        if (window.NFTrack) {
          NFTrack.track('jvm_memory_view', { usedMb: Math.round(snapshot.heapUsedMb) });
        }
      })
      .catch(function (err) {
        showError('无法拉取内存快照：' + err.message, byId('errorBox'));
      });
  }

  function refreshNow() { loadSnapshot(); }

  // 暴露全局，供按钮 onclick 调用
  window.refreshNow = refreshNow;

  // ── 启动 ──
  if (window.NFTrack) {
    NFTrack.trackOnce('session_start', { view: 'java-memory' });
  }
  loadSnapshot();
  setInterval(loadSnapshot, REFRESH_MS);
})();