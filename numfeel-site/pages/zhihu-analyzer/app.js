/**
 * 知乎创作分析 — 应用主逻辑
 * DOM 绑定、Chart.js 渲染、GSAP 动画。
 */

(function () {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';
  var E = ZhihuEngine;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;

  var rawData = null;
  var chartInstances = [];

  // ====== DOM 引用 ======
  var $ = function (id) { return document.getElementById(id); };

  var heroSection = $('heroSection');
  var loadingSection = $('loadingSection');
  var errorSection = $('errorSection');
  var resultArea = $('resultArea');
  var secretInput = $('secretInput');
  var analyzeBtn = $('analyzeBtn');
  var loadingText = $('loadingText');
  var loadingProgress = $('loadingProgress');
  var errorText = $('errorText');
  var retryBtn = $('retryBtn');

  // ====== 初始化 ======
  gsap.registerPlugin(ScrollTrigger);

  analyzeBtn.addEventListener('click', startAnalysis);
  retryBtn.addEventListener('click', resetToInput);
  secretInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startAnalysis();
  });

  function showSection(section) {
    heroSection.style.display = 'none';
    loadingSection.style.display = 'none';
    errorSection.style.display = 'none';
    resultArea.style.display = 'none';
    section.style.display = '';
  }

  function resetToInput() {
    showSection(heroSection);
    secretInput.value = '';
    destroyCharts();
  }

  function destroyCharts() {
    for (var i = 0; i < chartInstances.length; i++) {
      if (chartInstances[i]) chartInstances[i].destroy();
    }
    chartInstances = [];
  }

  // ====== 开始分析 ======
  function startAnalysis() {
    var secret = secretInput.value.trim();
    if (!secret) {
      alert('请先粘贴你的知乎 Access Secret');
      return;
    }
    showSection(loadingSection);
    loadingText.textContent = '正在拉取你的知乎内容...';
    loadingProgress.textContent = '';
    analyzeBtn.disabled = true;

    fetch(API_BASE + '/zhihu/analyze', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secret,
        'Content-Type': 'application/json'
      }
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || body.status !== 200) {
            throw new Error(body.message || '请求失败');
          }
          return body.data;
        });
      })
      .then(function (data) {
        loadingText.textContent = '正在生成分析报告...';
        loadingProgress.textContent = '共 ' + data.total + ' 篇内容';
        rawData = data;
        setTimeout(function () {
          showSection(resultArea);
          resultArea.style.display = '';
          renderAll();
          initScrollAnimations();
        }, 500);
      })
      .catch(function (err) {
        showSection(errorSection);
        errorText.textContent = err.message || '网络错误，请检查后重试';
        analyzeBtn.disabled = false;
      });
  }

  // ====== 渲染全部 ======
  function renderAll() {
    if (!rawData || !rawData.items || rawData.items.length === 0) {
      errorText.textContent = '未找到任何内容，请确认你的知乎账号有公开创作。';
      showSection(errorSection);
      return;
    }
    var items = rawData.items;
    var stats = E.computeStats(items);

    renderOverview(items, stats);
    renderTimeline(items);
    renderHeatmap(items);
    renderTypeDistribution(rawData);
    renderEfficiencyBars(rawData);
    renderHistograms(items);
    renderWordCloud(rawData.wordCloud);
    renderYearlyStats(rawData.yearlyStats);
    renderTopList(rawData.topLiked);
    renderPublishClock(items);
    renderTrendChart(items);
    renderCopyButton(items, stats);
  }

  // ====== 总览看板 ======
  function renderOverview(items, stats) {
    $('bnTotal').textContent = stats.total;
    $('bnSpan').textContent = stats.span;
    $('bnLikes').textContent = E.formatNumber(stats.totalLikes);
    $('bnComments').textContent = E.formatNumber(stats.totalComments);
    $('bnFavorites').textContent = E.formatNumber(stats.totalFavorites);
    $('bnAvgLikes').textContent = stats.avgLikes;
    $('insightText').textContent = E.generateInsight(stats);

    gsap.from('.big-number-card', {
      y: 40, opacity: 0, duration: 0.8,
      stagger: 0.1, ease: 'power2.out'
    });
  }

  // ====== 时间轴 ======
  function renderTimeline(items) {
    var dots = $('timelineDots');
    var axis = $('timelineAxis');
    dots.innerHTML = '';
    axis.innerHTML = '';

    if (items.length === 0) return;

    var sorted = items.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
    var minTs = sorted[0].createdAt;
    var maxTs = sorted[sorted.length - 1].createdAt;
    var range = (maxTs - minTs) || 1;
    var containerWidth = Math.max(1200, sorted.length * 3);
    dots.style.width = containerWidth + 'px';
    axis.style.width = containerWidth + 'px';

    var dotSize = Math.max(6, Math.min(16, 800 / Math.sqrt(sorted.length)));

    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i];
      var x = ((item.createdAt - minTs) / range) * (containerWidth - 40) + 20;
      var yBase = 100;
      var engagement = item.likeCount + item.commentCount * 2 + item.favoriteCount * 3;
      var yOffset = (Math.sin(i * 0.7) * 60 + (i % 3 - 1) * 30);
      var y = yBase + yOffset;
      var size = dotSize + Math.min(dotSize * 2, engagement / 100);

      var dot = document.createElement('div');
      dot.className = 'timeline-dot';
      dot.style.left = x + 'px';
      dot.style.bottom = (y - 100) + 100 + 'px';
      dot.style.width = size + 'px';
      dot.style.height = size + 'px';
      dot.style.background = E.getTypeColor(item.contentType);
      dot.style.opacity = '0';
      dot.style.transform = 'scale(0)';
      dot.dataset.index = i;

      dot.addEventListener('mouseenter', function (e) {
        var idx = parseInt(this.dataset.index);
        showTooltip(e, sorted[idx]);
      });
      dot.addEventListener('mouseleave', hideTooltip);
      dot.addEventListener('click', function () {
        var idx = parseInt(this.dataset.index);
        if (sorted[idx].url) {
          window.open(sorted[idx].url, '_blank');
        }
      });

      dots.appendChild(dot);

      // 轴标签（每年）
      var d = new Date(item.createdAt * 1000);
      var yearKey = d.getFullYear();
      if (i === 0 || new Date(sorted[i - 1].createdAt * 1000).getFullYear() !== yearKey) {
        var label = document.createElement('span');
        label.className = 'timeline-axis-label';
        label.style.left = x + 'px';
        label.textContent = yearKey;
        axis.appendChild(label);
      }
    }

    // 用 GSAP 动画化时间轴点
    setTimeout(function () {
      gsap.to('.timeline-dot', {
        opacity: 1, scale: 1, duration: 0.4,
        stagger: { each: 0.005, from: 'start' },
        ease: 'back.out(1.2)'
      });
    }, 300);
  }

  function showTooltip(e, item) {
    var tt = $('timelineTooltip');
    $('ttType').textContent = E.getTypeLabel(item.contentType);
    $('ttTitle').textContent = item.title;
    $('ttStats').textContent = '赞 ' + E.formatNumber(item.likeCount) + ' | 评 ' + E.formatNumber(item.commentCount) + ' | 藏 ' + E.formatNumber(item.favoriteCount);
    $('ttDate').textContent = E.formatDateTime(item.createdAt);
    tt.style.display = 'block';
    var x = e.clientX + 16;
    var y = e.clientY - 80;
    if (x + 340 > window.innerWidth) x = e.clientX - 340;
    if (y < 0) y = e.clientY + 20;
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }

  function hideTooltip() {
    $('timelineTooltip').style.display = 'none';
  }

  // ====== 热力图 ======
  function renderHeatmap(items) {
    var monthly = E.aggregateByMonth(items);
    var ctx = $('heatmapChart').getContext('2d');
    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthly.labels,
        datasets: [{
          label: '发布数',
          data: monthly.data,
          backgroundColor: monthly.data.map(function (v) {
            var alpha = Math.min(1, v / Math.max.apply(null, monthly.data));
            return 'rgba(255,215,0,' + (0.2 + alpha * 0.8) + ')';
          }),
          borderColor: 'rgba(255,215,0,0.5)',
          borderWidth: 1,
          borderRadius: 2
        }]
      },
      options: getChartOptions('每月发布数量')
    });
    chartInstances.push(chart);

    // 年度趋势
    var yearly = E.computeStats(items).byYear;
    var yearKeys = Object.keys(yearly).sort();
    var ctx2 = $('yearlyTrendChart').getContext('2d');
    var chart2 = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: yearKeys,
        datasets: [{
          label: '年度发布数',
          data: yearKeys.map(function (k) { return yearly[k]; }),
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.1)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#ffd700',
          pointRadius: 5
        }]
      },
      options: getChartOptions('年度趋势')
    });
    chartInstances.push(chart2);
  }

  // ====== 内容类型分布 ======
  function renderTypeDistribution(data) {
    var byType = data.byType;
    var keys = Object.keys(byType);
    var ctx = $('typeDonutChart').getContext('2d');
    var chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: keys.map(function (k) { return E.getTypeLabel(k); }),
        datasets: [{
          data: keys.map(function (k) { return byType[k]; }),
          backgroundColor: keys.map(function (k) { return E.getTypeColor(k); }),
          borderColor: '#1a1a2e',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#aaa', padding: 16, font: { size: 12 } }
          }
        }
      }
    });
    chartInstances.push(chart);
  }

  function renderEfficiencyBars(data) {
    var byType = data.byType;
    var items = data.items;
    var container = $('efficiencyBars');
    container.innerHTML = '';

    var keys = Object.keys(byType);
    var typeTotals = {};
    var typeLikes = {};
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      typeTotals[item.contentType] = (typeTotals[item.contentType] || 0) + 1;
      typeLikes[item.contentType] = (typeLikes[item.contentType] || 0) + item.likeCount;
    }

    var maxAvg = 0;
    for (var j = 0; j < keys.length; j++) {
      var avg = typeTotals[keys[j]] > 0 ? Math.round(typeLikes[keys[j]] / typeTotals[keys[j]]) : 0;
      if (avg > maxAvg) maxAvg = avg;
    }

    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var avgLike = typeTotals[key] > 0 ? Math.round(typeLikes[key] / typeTotals[key]) : 0;
      var pct = maxAvg > 0 ? (avgLike / maxAvg * 100) : 0;

      var row = document.createElement('div');
      row.className = 'efficiency-bar-row';
      row.innerHTML =
        '<span class="efficiency-bar-label">' + E.getTypeLabel(key) + '</span>' +
        '<div class="efficiency-bar-track">' +
          '<div class="efficiency-bar-fill" style="width:' + pct + '%;background:' + E.getTypeColor(key) + ';">' +
            (pct > 30 ? E.formatNumber(avgLike) : '') +
          '</div>' +
        '</div>' +
        '<span class="efficiency-bar-val">' + E.formatNumber(avgLike) + '</span>';
      container.appendChild(row);
    }
  }

  // ====== 互动分布直方图 ======
  function renderHistograms(items) {
    var likes = items.map(function (i) { return i.likeCount; }).filter(function (v) { return v > 0; });
    var comments = items.map(function (i) { return i.commentCount; }).filter(function (v) { return v > 0; });
    var favorites = items.map(function (i) { return i.favoriteCount; }).filter(function (v) { return v > 0; });

    renderHistogram('likesHistogram', likes, '点赞分布', '#ffd700');
    renderHistogram('commentsHistogram', comments, '评论分布', '#90caf9');
    renderHistogram('favoritesHistogram', favorites, '收藏分布', '#81c784');
  }

  function renderHistogram(canvasId, values, title, color) {
    var hist = E.histogram(values, 12);
    var ctx = document.getElementById(canvasId).getContext('2d');
    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hist.labels,
        datasets: [{
          label: '数量',
          data: hist.data,
          backgroundColor: color.replace(')', ',0.6)').replace('rgb', 'rgba'),
          borderColor: color,
          borderWidth: 1,
          borderRadius: 3
        }]
      },
      options: getChartOptions(title)
    });
    chartInstances.push(chart);
  }

  // ====== 词云 ======
  function renderWordCloud(wordCloudData) {
    if (!wordCloudData || wordCloudData.length === 0) return;
    var canvas = $('wordCloudCanvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    var maxCount = wordCloudData[0].count;
    var minCount = wordCloudData[wordCloudData.length - 1].count;
    var range = maxCount - minCount || 1;

    var placed = [];
    var cx = W / 2;
    var cy = H / 2;

    var colors = ['#ffd700', '#90caf9', '#81c784', '#ce93d8', '#ff8a65', '#e0e0e0'];

    for (var i = 0; i < wordCloudData.length; i++) {
      var entry = wordCloudData[i];
      var ratio = (entry.count - minCount) / range;
      var fontSize = 12 + ratio * 48;
      var color = colors[i % colors.length];

      ctx.font = 'bold ' + fontSize + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = color;
      var metrics = ctx.measureText(entry.word);
      var tw = metrics.width;
      var th = fontSize;

      var angle = (i * 0.618033988749895) * Math.PI * 2;
      var radius = 0;
      var x, y;
      var found = false;

      for (var r = 0; r < Math.max(W, H); r += 3) {
        for (var a = 0; a < 8; a++) {
          var testAngle = angle + (a * Math.PI / 4);
          x = cx + Math.cos(testAngle) * r - tw / 2;
          y = cy + Math.sin(testAngle) * r + th / 3;
          if (x > 10 && x + tw < W - 10 && y > th && y < H - 10) {
            if (!overlaps(x, y, tw, th, placed)) {
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }

      if (found) {
        ctx.fillText(entry.word, x, y + th);
        placed.push({ x: x, y: y, w: tw, h: th });
      }
    }
  }

  function overlaps(x, y, w, h, placed) {
    var padding = 4;
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (x + w + padding > p.x && x - padding < p.x + p.w &&
          y + h + padding > p.y && y - padding < p.y + p.h) {
        return true;
      }
    }
    return false;
  }

  // ====== 年度对比 ======
  function renderYearlyStats(yearlyStats) {
    if (!yearlyStats || yearlyStats.length === 0) return;

    var tbody = $('yearlyTableBody');
    tbody.innerHTML = '';

    var maxCount = 0;
    for (var i = 0; i < yearlyStats.length; i++) {
      if (yearlyStats[i].count > maxCount) maxCount = yearlyStats[i].count;
    }

    for (var j = 0; j < yearlyStats.length; j++) {
      var s = yearlyStats[j];
      var isHighlight = s.count === maxCount;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="' + (isHighlight ? 'yt-highlight' : '') + '">' + s.year + '</td>' +
        '<td class="' + (isHighlight ? 'yt-highlight' : '') + '">' + s.count + '</td>' +
        '<td>' + E.formatNumber(s.likes) + '</td>' +
        '<td>' + E.formatNumber(s.comments) + '</td>' +
        '<td>' + E.formatNumber(s.favorites) + '</td>' +
        '<td>' + (s.count > 0 ? Math.round(s.likes / s.count) : 0) + '</td>';
      tbody.appendChild(tr);
    }

    var ctx = $('yearlyBarChart').getContext('2d');
    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: yearlyStats.map(function (s) { return String(s.year); }),
        datasets: [
          {
            label: '内容数',
            data: yearlyStats.map(function (s) { return s.count; }),
            backgroundColor: 'rgba(255,215,0,0.6)',
            borderColor: '#ffd700',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            label: '点赞数',
            data: yearlyStats.map(function (s) { return s.likes; }),
            backgroundColor: 'rgba(144,202,249,0.4)',
            borderColor: '#90caf9',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#aaa' } }
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: '内容数', color: '#ffd700' },
            ticks: { color: '#888' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: '点赞数', color: '#90caf9' },
            ticks: { color: '#888' },
            grid: { display: false }
          },
          x: {
            ticks: { color: '#888' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
    chartInstances.push(chart);
  }

  // ====== Top 榜单 ======
  function renderTopList(items) {
    if (!items || items.length === 0) return;
    var topList = $('topList');
    renderTopItems(items, 'likes');

    var tabs = document.querySelectorAll('.top-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var tab = this;
        var type = tab.dataset.tab;
        document.querySelectorAll('.top-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        if (type === 'likes') renderTopItems(rawData.topLiked, 'likes');
        if (type === 'comments') renderTopItems(rawData.topCommented, 'comments');
        if (type === 'favorites') renderTopItems(rawData.topFavorited, 'favorites');
      });
    }
  }

  function renderTopItems(topItems, sortBy) {
    var topList = $('topList');
    topList.innerHTML = '';
    for (var i = 0; i < topItems.length; i++) {
      var item = topItems[i];
      var rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
      var statValue = sortBy === 'likes' ? item.likeCount : sortBy === 'comments' ? item.commentCount : item.favoriteCount;
      var div = document.createElement('div');
      div.className = 'top-item';
      div.innerHTML =
        '<div class="top-rank ' + rankClass + '">' + (i + 1) + '</div>' +
        '<div class="top-item-body">' +
          '<div class="top-item-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="top-item-meta">' + E.getTypeLabel(item.contentType) + ' | ' + E.formatDate(item.createdAt) + '</div>' +
        '</div>' +
        '<div class="top-item-stats">' +
          '<span>赞 ' + E.formatNumber(item.likeCount) + '</span>' +
          '<span>评 ' + E.formatNumber(item.commentCount) + '</span>' +
          '<span>藏 ' + E.formatNumber(item.favoriteCount) + '</span>' +
        '</div>' +
        '<a class="top-item-link" href="' + item.url + '" target="_blank" rel="noopener"><i class="ti ti-external-link"></i></a>';
      topList.appendChild(div);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ====== 发布时钟 ======
  function renderPublishClock(items) {
    var hours = E.aggregateByHour(items);
    var weekdays = E.aggregateByWeekday(items);
    var dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    var ctx1 = $('hourRadarChart').getContext('2d');
    var chart1 = new Chart(ctx1, {
      type: 'radar',
      data: {
        labels: ['0时', '2时', '4时', '6时', '8时', '10时', '12时', '14时', '16时', '18时', '20时', '22时'],
        datasets: [{
          label: '发布数',
          data: [hours[0], hours[2], hours[4], hours[6], hours[8], hours[10], hours[12], hours[14], hours[16], hours[18], hours[20], hours[22]],
          backgroundColor: 'rgba(255,215,0,0.2)',
          borderColor: '#ffd700',
          pointBackgroundColor: '#ffd700',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: '发布时段分布', color: '#ccc', font: { size: 14 } },
          legend: { labels: { color: '#aaa' } }
        },
        scales: {
          r: {
            ticks: { color: '#888', backdropColor: 'transparent' },
            grid: { color: 'rgba(255,255,255,0.1)' },
            pointLabels: { color: '#aaa' }
          }
        }
      }
    });
    chartInstances.push(chart1);

    var ctx2 = $('weekdayChart').getContext('2d');
    var chart2 = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{
          label: '发布数',
          data: weekdays,
          backgroundColor: ['rgba(255,107,107,0.6)'].concat(
            new Array(5).fill('rgba(144,202,249,0.6)')
          ).concat(['rgba(255,107,107,0.6)']),
          borderColor: '#90caf9',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: getChartOptions('星期分布')
    });
    chartInstances.push(chart2);
  }

  // ====== 互动趋势 ======
  function renderTrendChart(items) {
    var sorted = items.slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
    var labels = sorted.map(function (item) { return E.formatDate(item.createdAt); });
    var engagement = sorted.map(function (item) {
      return item.likeCount + item.commentCount * 2 + item.favoriteCount * 3;
    });

    // 缩减标签（每 N 个显示一个）
    var step = Math.max(1, Math.floor(labels.length / 20));
    var displayLabels = labels.map(function (l, i) { return i % step === 0 ? l : ''; });

    var ma = E.movingAverage(engagement, Math.max(3, Math.floor(sorted.length / 30)));

    var ctx = $('trendChart').getContext('2d');
    var chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '单篇互动',
            data: engagement.map(function (v, i) { return { x: i, y: v }; }),
            backgroundColor: 'rgba(255,215,0,0.3)',
            borderColor: 'rgba(255,215,0,0.5)',
            pointRadius: 3,
            pointHoverRadius: 6
          },
          {
            label: '移动平均',
            data: ma.map(function (v, i) { return { x: i, y: v }; }),
            borderColor: '#ff6b6b',
            backgroundColor: 'transparent',
            pointRadius: 0,
            borderWidth: 2,
            showLine: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#aaa' } }
        },
        scales: {
          y: {
            title: { display: true, text: '互动评分', color: '#888' },
            ticks: { color: '#888' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          x: {
            title: { display: true, text: '发布时间', color: '#888' },
            ticks: {
              color: '#888',
              callback: function (val, idx) { return displayLabels[idx] || ''; }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });
    chartInstances.push(chart);
  }

  // ====== 复制 ======
  function renderCopyButton(items, stats) {
    $('copySummaryBtn').addEventListener('click', function () {
      var text = E.generateSummary(items, stats);
      navigator.clipboard.writeText(text).then(function () {
        $('copyFeedback').textContent = '已复制到剪贴板';
        setTimeout(function () { $('copyFeedback').textContent = ''; }, 2000);
      }).catch(function () {
        $('copyFeedback').textContent = '复制失败，请手动复制';
      });
    });
  }

  // ====== ScrollTrigger 动画 ======
  function initScrollAnimations() {
    var sections = document.querySelectorAll('#resultArea .section');
    for (var i = 0; i < sections.length; i++) {
      gsap.fromTo(sections[i],
        { opacity: 0, y: 60 },
        {
          opacity: 1, y: 0, duration: 0.8,
          scrollTrigger: {
            trigger: sections[i],
            start: 'top 85%',
            toggleActions: 'play none none none'
          }
        }
      );
    }
    ScrollTrigger.refresh();
  }

  // ====== Chart.js 通用配置 ======
  function getChartOptions(title) {
    return {
      responsive: true,
      plugins: {
        title: { display: true, text: title, color: '#ccc', font: { size: 13 } },
        legend: { labels: { color: '#aaa' } }
      },
      scales: {
        y: {
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: { color: '#888', maxRotation: 45 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    };
  }
})();