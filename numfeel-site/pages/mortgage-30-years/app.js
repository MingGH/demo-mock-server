// ========== 30年房贷 — 前端交互逻辑 ==========

var currentResult = null;
var charts = {};

function calculate() {
  var principal = parseFloat(document.getElementById('inputPrincipal').value) || 100;
  var years = parseInt(document.getElementById('inputYears').value) || 30;
  var rate = parseFloat(document.getElementById('inputRate').value) || 3.5;
  var income = parseFloat(document.getElementById('inputIncome').value) || 15000;

  // 参数校验
  if (principal < 1 || principal > 2000) { alert('贷款金额请输入1-2000万'); return; }
  if (rate < 0.1 || rate > 10) { alert('利率请输入0.1%-10%'); return; }

  var result = calcEqualPayment(principal, rate, years);
  var pressure = pressureIndex(result.monthly, income);
  currentResult = { principal: principal, years: years, rate: rate, income: income, result: result, pressure: pressure };

  renderResult(result, pressure);
  renderCompare(principal, rate, years);
  renderTimelineChart(principal, rate, years);
  renderLifeTimeline();
  renderInflation();

  // 显示所有区块
  ['resultSection', 'compareSection', 'timelineSection', 'inflationSection', 'progressSection', 'prepaySection'].forEach(function(id) {
    document.getElementById(id).style.display = '';
  });

  renderProgressSection();
}

function renderResult(result, pressure) {
  var html = '';
  html += '<div class="result-item"><div class="num">' + (result.monthly / 10000).toFixed(2) + '</div><div class="desc">月供（万元）</div></div>';
  html += '<div class="result-item"><div class="num red">' + (result.totalInterest / 10000).toFixed(1) + '</div><div class="desc">总利息（万元）</div></div>';
  html += '<div class="result-item"><div class="num">' + (result.totalPayment / 10000).toFixed(1) + '</div><div class="desc">还款总额（万元）</div></div>';
  html += '<div class="result-item"><div class="num red">' + result.interestRatio + '%</div><div class="desc">利息占本金比例</div></div>';
  document.getElementById('resultSummary').innerHTML = html;

  // 压力指数
  var fillEl = document.getElementById('pressureFill');
  var ratio = Math.min(pressure.ratio, 100);
  fillEl.style.width = ratio + '%';
  fillEl.className = 'pressure-fill';
  if (pressure.level === '舒适') fillEl.classList.add('comfort');
  else if (pressure.level === '紧张') fillEl.classList.add('tight');
  else if (pressure.level === '高压') fillEl.classList.add('high');
  else fillEl.classList.add('danger');

  document.getElementById('pressureText').textContent = pressure.ratio + '%（' + pressure.level + '）';
  document.getElementById('pressureText').style.color =
    pressure.level === '舒适' ? '#2ecc71' :
    pressure.level === '紧张' ? '#f39c12' :
    pressure.level === '高压' ? '#e74c3c' : '#8e44ad';

  document.getElementById('pressureInsight').innerHTML =
    '<h3><i class="ti ti-alert-triangle"></i> ' + pressure.level + '</h3><p>' + pressure.desc + '</p>';
}

function renderCompare(principal, rate, selectedYears) {
  var data = compareYears(principal, rate);
  var tbody = document.getElementById('compareBody');
  tbody.innerHTML = data.map(function(d) {
    var cls = d.years === selectedYears ? ' class="highlight"' : '';
    return '<tr' + cls + '>' +
      '<td>' + d.years + '年</td>' +
      '<td>' + (d.monthly / 10000).toFixed(2) + '万</td>' +
      '<td>' + (d.totalInterest / 10000).toFixed(1) + '万</td>' +
      '<td>' + d.interestRatio + '%</td>' +
      '</tr>';
  }).join('');

  // 图表
  if (charts.compare) charts.compare.destroy();
  var ctx = document.getElementById('compareChart').getContext('2d');
  charts.compare = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(function(d) { return d.years + '年'; }),
      datasets: [
        {
          label: '本金（万）',
          data: data.map(function() { return principal; }),
          backgroundColor: 'rgba(46,204,113,0.6)',
          borderRadius: 4
        },
        {
          label: '总利息（万）',
          data: data.map(function(d) { return parseFloat((d.totalInterest / 10000).toFixed(1)); }),
          backgroundColor: 'rgba(231,76,60,0.6)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a0a0a0' } } },
      scales: {
        x: { stacked: true, ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { stacked: true, ticks: { color: '#a0a0a0', callback: function(v) { return v + '万'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderTimelineChart(principal, rate, years) {
  var timeline = generateTimeline(principal, rate, years);

  if (charts.stacked) charts.stacked.destroy();
  var ctx = document.getElementById('stackedChart').getContext('2d');

  // 找到本金超过利息的转折点
  var crossYear = -1;
  for (var i = 0; i < timeline.length; i++) {
    if (timeline[i].principalPaid > timeline[i].interestPaid && crossYear === -1) {
      crossYear = timeline[i].year;
    }
  }

  charts.stacked = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: timeline.map(function(t) { return '第' + t.year + '年'; }),
      datasets: [
        {
          label: '还本金',
          data: timeline.map(function(t) { return Math.round(t.principalPaid / 10000 * 10) / 10; }),
          backgroundColor: 'rgba(46,204,113,0.7)',
          borderRadius: 2
        },
        {
          label: '还利息',
          data: timeline.map(function(t) { return Math.round(t.interestPaid / 10000 * 10) / 10; }),
          backgroundColor: 'rgba(231,76,60,0.7)',
          borderRadius: 2
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a0a0a0' } } },
      scales: {
        x: { stacked: true, ticks: { color: '#a0a0a0', maxRotation: 45 }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#a0a0a0', callback: function(v) { return v + '万'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // 洞察
  var insightEl = document.getElementById('timelineInsight');
  if (crossYear > 0) {
    insightEl.style.display = '';
    insightEl.innerHTML = '<h3><i class="ti ti-alert-circle"></i> 前期大部分在还利息</h3>' +
      '<p>前 ' + crossYear + ' 年，你每月还款中利息占比超过本金。也就是说，前几年你辛辛苦苦还的钱，大部分进了银行口袋。直到第 ' + crossYear + ' 年，本金偿还才开始超过利息。</p>';
  } else {
    insightEl.style.display = 'none';
  }
}

function switchTimelineTab(tab) {
  document.querySelectorAll('.tabs .tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('.tab[data-tab="' + tab + '"]').classList.add('active');
  document.getElementById('timelineChart').style.display = tab === 'chart' ? '' : 'none';
  document.getElementById('timelineLife').style.display = tab === 'life' ? '' : 'none';
}

function renderLifeTimeline() {
  var age = parseInt(document.getElementById('inputAge').value) || 28;
  var events = lifeEvents(age);
  var html = events.map(function(e) {
    return '<div class="timeline-item">' +
      '<span class="year-badge">第' + e.year + '年</span>' +
      '<div class="event-text">' + e.event + '</div>' +
      '<div class="age-text">你 ' + e.age + ' 岁</div>' +
      '</div>';
  }).join('');
  document.getElementById('lifeTimeline').innerHTML = html;
}

function renderInflation() {
  if (!currentResult) return;
  var inflationRate = parseFloat(document.getElementById('inputInflation').value) || 3;
  var monthly = currentResult.result.monthly;
  var years = currentResult.years;
  var data = inflationImpact(monthly, inflationRate, years);

  var maxVal = monthly;
  var html = data.map(function(d) {
    var nominalWidth = 100;
    var realWidth = Math.round(d.realMonthly / maxVal * 100);
    return '<div class="inflation-row">' +
      '<div class="year-col">第' + d.year + '年</div>' +
      '<div class="bar-col">' +
        '<div class="bar nominal" style="width:' + nominalWidth + '%"></div>' +
        '<div class="bar real" style="width:' + realWidth + '%"></div>' +
      '</div>' +
      '<div class="val-col">' + Math.round(d.realMonthly) + '元</div>' +
      '</div>';
  }).join('');
  document.getElementById('inflationBars').innerHTML = html;

  var lastReal = data[data.length - 1].realMonthly;
  var shrinkPercent = Math.round((1 - lastReal / monthly) * 100);
  document.getElementById('inflationInsight').innerHTML =
    '<h3><i class="ti ti-bulb"></i> 通胀是房贷的隐形盟友</h3>' +
    '<p>假设年通胀率 ' + inflationRate + '%，你现在月供 ' + monthly + ' 元，' + years + ' 年后同样的金额实际购买力只相当于今天的 ' + Math.round(lastReal) + ' 元（缩水 ' + shrinkPercent + '%）。' +
    '这就是为什么很多人说「贷款越长越好」——你用未来贬值的钱还今天的债。当然，前提是你的收入能跑赢通胀。</p>';
}

function calcPrepay() {
  if (!currentResult) { alert('请先计算房贷'); return; }
  var prepayYear = parseInt(document.getElementById('prepayYear').value) || 5;
  var prepayAmount = parseFloat(document.getElementById('prepayAmount').value) || 20;
  var mode = document.getElementById('prepayMode').value;

  if (prepayYear >= currentResult.years) { alert('提前还款年份不能超过贷款年限'); return; }

  var result = calcPrepayment(currentResult.principal, currentResult.rate, currentResult.years, prepayYear, prepayAmount, mode);

  var html = '';
  html += '<div class="result-item"><div class="num green">' + (result.savedInterest / 10000).toFixed(1) + '</div><div class="desc">节省利息（万元）</div></div>';
  if (mode === 'shorten') {
    html += '<div class="result-item"><div class="num green">' + result.newTotalYears + '</div><div class="desc">新还款年限（年）</div></div>';
  } else {
    html += '<div class="result-item"><div class="num green">' + Math.round(result.newMonthly) + '</div><div class="desc">新月供（元）</div></div>';
  }
  html += '<div class="result-item"><div class="num">' + (result.newTotalPayment / 10000).toFixed(1) + '</div><div class="desc">新还款总额（万元）</div></div>';

  document.getElementById('prepayResultGrid').innerHTML = html;
  document.getElementById('prepayResult').style.display = '';
}

// ── 时间进度条 ──
var timelineData = null;
var progressMilestones = [
  { year: 0, text: '签下合同' },
  { year: 3, text: '可能结婚生子' },
  { year: 6, text: '孩子上小学' },
  { year: 10, text: '贷款1/3' },
  { year: 15, text: '贷款过半' },
  { year: 18, text: '孩子高考' },
  { year: 22, text: '孩子工作' },
  { year: 25, text: '考虑退休' },
  { year: 30, text: '还完了' }
];

function renderProgressSection() {
  if (!currentResult) return;
  var years = currentResult.years;
  timelineData = generateTimeline(currentResult.principal, currentResult.rate, years);

  // 设置滑块范围
  document.getElementById('progressSlider').max = years;
  document.getElementById('progressSlider').value = 0;

  // 渲染里程碑
  renderMilestones(years);
  updateProgress();
}

function renderMilestones(totalYears) {
  var container = document.getElementById('milestones');
  var trackHtml = '<div class="milestone-track">';
  progressMilestones.forEach(function(m) {
    if (m.year > totalYears) return;
    var leftPercent = (m.year / totalYears * 100).toFixed(1);
    trackHtml += '<div class="milestone-dot" data-year="' + m.year + '" style="left:' + leftPercent + '%">' +
      '<span class="milestone-tooltip">' + m.text + '</span></div>';
  });
  trackHtml += '</div>';
  trackHtml += '<div class="milestone-labels"><span>第0年</span><span>第' + totalYears + '年</span></div>';
  container.innerHTML = trackHtml;
}

function updateProgress() {
  if (!currentResult || !timelineData) return;

  var year = parseInt(document.getElementById('progressSlider').value);
  var age = parseInt(document.getElementById('inputAge').value) || 28;
  var principal = currentResult.principal * 10000;
  var years = currentResult.years;

  document.getElementById('progressYearNum').textContent = year;
  document.getElementById('progressAgeNum').textContent = age + year;

  // 计算当前年份数据
  var remaining, cumulativeInterest, paidPercent;
  if (year === 0) {
    remaining = principal;
    cumulativeInterest = 0;
    paidPercent = 0;
  } else {
    var yearData = timelineData[year - 1];
    remaining = yearData.remaining;
    cumulativeInterest = yearData.cumulativeInterest;
    paidPercent = parseFloat(((principal - remaining) / principal * 100).toFixed(1));
  }

  // 更新进度条
  var barPercent = (year / years * 100).toFixed(1);
  document.getElementById('lifePaidBar').style.width = barPercent + '%';
  document.getElementById('lifePaidLabel').textContent = '已还 ' + barPercent + '%（时间）';
  document.getElementById('lifeRemainingLabel').textContent = '剩余 ' + (100 - parseFloat(barPercent)).toFixed(1) + '%';

  // 更新信息卡片
  var event = getEventForYear(year);
  document.getElementById('progressEvent').textContent = event;
  document.getElementById('progressRemaining').textContent = (remaining / 10000).toFixed(1) + '万';
  document.getElementById('progressInterestPaid').textContent = (cumulativeInterest / 10000).toFixed(1) + '万';
  document.getElementById('progressPercent').textContent = paidPercent + '%';

  // 更新里程碑高亮
  document.querySelectorAll('.milestone-dot').forEach(function(dot) {
    var dotYear = parseInt(dot.dataset.year);
    dot.classList.toggle('active', dotYear === year);
  });
}

function getEventForYear(year) {
  var events = {
    0: '签下贷款合同，人生最大一笔负债开始',
    1: '第一年：适应月供节奏，开始精打细算',
    2: '第二年：习惯了，但偶尔还是会心疼',
    3: '第三年：可能结婚/生孩子，开支骤增',
    4: '第四年：奶粉钱+月供，钱包在哭泣',
    5: '第五年：孩子上幼儿园，又一笔开支',
    6: '第六年：刚还完总利息的10%',
    7: '第七年：开始考虑要不要换工作涨薪',
    8: '第八年：同龄人有的已经还完短期贷款了',
    9: '第九年：孩子上小学，学区房的意义显现',
    10: '第十年：贷款三分之一，感觉遥遥无期',
    11: '第十一年：可能面临第一次职业瓶颈',
    12: '第十二年：本金才还了约1/3',
    13: '第十三年：孩子进入青春期',
    14: '第十四年：开始有白头发了',
    15: '第十五年：贷款过半，孩子中考',
    16: '第十六年：高中三年，补课费不便宜',
    17: '第十七年：孩子高二，压力山大',
    18: '第十八年：孩子高考，人生大事',
    19: '第十九年：大学学费+生活费',
    20: '第二十年：身体开始发出信号',
    21: '第二十一年：孩子大学快毕业了',
    22: '第二十二年：孩子工作了，可能也要买房',
    23: '第二十三年：开始帮孩子攒首付？',
    24: '第二十四年：距离还完还有6年',
    25: '第二十五年：开始考虑退休规划',
    26: '第二十六年：同事陆续退休',
    27: '第二十七年：最后冲刺阶段',
    28: '第二十八年：快了快了',
    29: '第二十九年：倒计时一年',
    30: '第三十年：终于还完了。你自由了。'
  };
  return events[year] || '第' + year + '年';
}

// 页面加载后自动计算一次默认值
document.addEventListener('DOMContentLoaded', function() {
  calculate();
});
