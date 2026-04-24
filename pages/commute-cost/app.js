// ========== 通勤人生计算器 UI ==========

var compChart = null;
var cityChart = null;

// ── 初始化城市卡片 ──
function initCityGrid() {
  var grid = document.getElementById('cityGrid');
  grid.innerHTML = '';
  CITY_DATA.forEach(function(c) {
    var card = document.createElement('div');
    card.className = 'city-card';
    card.dataset.time = c.oneWay;
    card.innerHTML =
      '<div class="name">' + c.city + '</div>' +
      '<div class="time">' + c.oneWay + '</div>' +
      '<div class="unit">分钟/单程</div>';
    card.onclick = function() {
      document.getElementById('commuteSlider').value = c.oneWay;
      document.querySelectorAll('.city-card').forEach(function(el) { el.classList.remove('active'); });
      card.classList.add('active');
      update();
    };
    grid.appendChild(card);
  });
}

// ── 主更新函数 ──
function update() {
  var oneWay = parseInt(document.getElementById('commuteSlider').value);
  var daysPerWeek = parseInt(document.getElementById('daysPerWeek').value);
  var weeksPerYear = parseInt(document.getElementById('weeksPerYear').value) || 48;
  var careerYears = parseInt(document.getElementById('careerYears').value) || 35;
  var savedMin = parseInt(document.getElementById('savedSlider').value);

  // 更新滑块显示
  document.getElementById('commuteVal').textContent = oneWay + ' 分钟';
  document.getElementById('savedVal').textContent = savedMin + ' 分钟';

  // 高亮匹配的城市
  document.querySelectorAll('.city-card').forEach(function(el) {
    el.classList.toggle('active', parseInt(el.dataset.time) === oneWay);
  });

  // 核心计算
  var result = calcCommuteTime(oneWay, daysPerWeek, weeksPerYear, careerYears);
  var equiv = timeEquivalents(result.lifetimeHours);
  var saved = calcTimeSaved(oneWay, Math.min(savedMin, oneWay - 5), daysPerWeek, weeksPerYear, careerYears);

  // ── 主统计卡片 ──
  document.getElementById('mainStats').innerHTML =
    '<div class="stat-card"><div class="val">' + fmt(result.dailyHours) + 'h</div><div class="lbl">每天往返</div></div>' +
    '<div class="stat-card"><div class="val">' + fmt(result.yearlyHours) + 'h</div><div class="lbl">每年通勤</div></div>' +
    '<div class="stat-card highlight"><div class="val">' + fmtInt(result.lifetimeHours) + 'h</div><div class="lbl">一辈子通勤</div></div>' +
    '<div class="stat-card highlight"><div class="val">' + fmt(result.lifetimeYears) + '年</div><div class="lbl">折合年数</div></div>';

  // ── 洞察文案 ──
  var yearlyDays = Math.round(result.yearlyHours / 24);
  var pctOfWaking = ((result.dailyHours / 16) * 100).toFixed(0); // 假设清醒16小时
  document.getElementById('mainInsightText').innerHTML =
    '每天 ' + fmt(result.dailyHours) + ' 小时通勤，占你清醒时间的 <strong>' + pctOfWaking + '%</strong>。' +
    '一年下来是 <strong>' + fmtInt(result.yearlyHours) + ' 小时</strong>（约 ' + yearlyDays + ' 个整天）。' +
    '工作 ' + careerYears + ' 年，累计 <strong>' + fmtInt(result.lifetimeHours) + ' 小时</strong>，' +
    '相当于不吃不喝不睡地走了 <strong>' + fmt(result.lifetimeYears) + ' 年</strong>。';

  // ── 等价物 ──
  document.getElementById('lifetimeHoursLabel').textContent = fmtInt(result.lifetimeHours);
  document.getElementById('equivGrid').innerHTML =
    eqCard('ti-movie', equiv.movies, '部电影', '每部 2 小时') +
    eqCard('ti-book', equiv.books, '本书', '每本 6 小时') +
    eqCard('ti-run', equiv.marathons, '次全马', '每次 4.5 小时') +
    eqCard('ti-language', equiv.languages, '门外语', '到 B1 约 600h') +
    eqCard('ti-bed', equiv.sleepDays, '天好觉', '每天 8 小时') +
    eqCard('ti-plane', equiv.flights, '趟北京飞纽约', '单程 12 小时');

  // ── 节省时间 ──
  var actualSaved = Math.min(savedMin, oneWay - 5);
  if (actualSaved <= 0) {
    document.getElementById('savedBanner').innerHTML =
      '<div class="big">—</div><div class="sub">通勤时间已经很短了</div>';
    document.getElementById('savedEquivGrid').innerHTML = '';
  } else {
    document.getElementById('savedBanner').innerHTML =
      '<div class="big">+ ' + fmtInt(saved.savedLifetimeHours) + ' 小时</div>' +
      '<div class="sub">一辈子多出 ' + fmt(saved.savedLifetimeDays) + ' 天（' +
      fmt(saved.savedLifetimeDays / 365) + ' 年），每天省 ' + (actualSaved * 2) + ' 分钟</div>';

    var se = saved.equivalents;
    document.getElementById('savedEquivGrid').innerHTML =
      eqCard('ti-movie', se.movies, '部电影', '') +
      eqCard('ti-book', se.books, '本书', '') +
      eqCard('ti-run', se.marathons, '次全马', '') +
      eqCard('ti-language', se.languages, '门外语', '');
  }

  // ── 城市参数标签 ──
  document.getElementById('cityDays').textContent = daysPerWeek;
  document.getElementById('cityYears').textContent = careerYears;

  // ── 图表 ──
  drawCompChart(daysPerWeek, weeksPerYear, careerYears, oneWay);
  drawCityChart(daysPerWeek, weeksPerYear, careerYears);
}

// ── 对比图 ──
function drawCompChart(dpw, wpy, cy, currentMin) {
  var data = generateComparisonData(dpw, wpy, cy);
  var labels = data.map(function(d) { return d.minutes + '分钟'; });
  var values = data.map(function(d) { return d.lifetimeYears; });

  // 高亮当前值
  var colors = data.map(function(d) {
    return d.minutes === currentMin ? 'rgba(255,68,68,0.8)' : 'rgba(255,215,0,0.55)';
  });
  var borders = data.map(function(d) {
    return d.minutes === currentMin ? '#ff4444' : '#ffd700';
  });

  if (compChart) { compChart.destroy(); compChart = null; }
  var ctx = document.getElementById('compChart').getContext('2d');
  compChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '一辈子通勤（年）',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 2,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ctx.raw.toFixed(1) + ' 年'; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#888', maxRotation: 45 }, grid: { display: false } },
        y: {
          ticks: { color: '#888', callback: function(v) { return v + '年'; } },
          grid: { color: 'rgba(255,255,255,0.05)' }, min: 0
        }
      }
    }
  });
}

// ── 城市排行图 ──
function drawCityChart(dpw, wpy, cy) {
  var cityResults = CITY_DATA.map(function(c) {
    var r = calcCommuteTime(c.oneWay, dpw, wpy, cy);
    return { city: c.city, years: r.lifetimeYears, hours: r.lifetimeHours };
  }).sort(function(a, b) { return b.years - a.years; });

  if (cityChart) { cityChart.destroy(); cityChart = null; }
  var ctx = document.getElementById('cityChart').getContext('2d');
  cityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: cityResults.map(function(c) { return c.city; }),
      datasets: [{
        label: '一辈子通勤（年）',
        data: cityResults.map(function(c) { return c.years; }),
        backgroundColor: cityResults.map(function(_, i) {
          return i < 3 ? 'rgba(255,68,68,0.6)' : 'rgba(255,215,0,0.5)';
        }),
        borderColor: cityResults.map(function(_, i) {
          return i < 3 ? '#ff4444' : '#ffd700';
        }),
        borderWidth: 2,
        borderRadius: 6,
        barPercentage: 0.65
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ctx.raw.toFixed(1) + ' 年（' + Math.round(ctx.raw * 365 * 24) + ' 小时）';
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#888', callback: function(v) { return v + '年'; } },
          grid: { color: 'rgba(255,255,255,0.05)' }, min: 0
        },
        y: { ticks: { color: '#c0c0c0', font: { size: 13 } }, grid: { display: false } }
      }
    }
  });
}

// ── 工具函数 ──
function eqCard(icon, num, label, sub) {
  var display = typeof num === 'number' && num % 1 !== 0 ? num.toFixed(1) : num;
  return '<div class="equiv-card">' +
    '<div class="icon"><i class="ti ' + icon + '"></i></div>' +
    '<div class="num">' + display + '</div>' +
    '<div class="desc">' + label + (sub ? '<br>' + sub : '') + '</div>' +
    '</div>';
}

function fmt(n) {
  return n % 1 === 0 ? n.toString() : n.toFixed(1);
}

function fmtInt(n) {
  return Math.round(n).toLocaleString();
}

// ── 启动 ──
initCityGrid();
update();
