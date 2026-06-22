/**
 * 原始资本积累模拟器 — UI 层
 * 依赖：./engine.js 暴露的全局 simulatePerson / compareTwoLives / toYearly / fmtWan
 */

var STATE = {
  seed: 42,
  params: {
    salary: 8000,
    years: 20,
    startCapital: 1000000,
    rentRatio: 0.4,
    livingRatio: 0.45,
    savingsRate: 0.02,
    assetRate: 0.06,
    inflation: 0.03,
    shockProb: 0.3,
    shockSize: 6,
    loanRate: 0.36,
    salaryGrowth: 0.03
  }
};

var PRESETS = [
  {
    id: 'small-city',
    title: '小城打工人',
    desc: '月薪 5000，租房，遇病靠借',
    icon: 'ti-home',
    params: { salary: 5000, years: 20, startCapital: 800000, rentRatio: 0.35, livingRatio: 0.5, shockProb: 0.35, shockSize: 8, loanRate: 0.36, salaryGrowth: 0.025, assetRate: 0.05 }
  },
  {
    id: 'big-city',
    title: '一线城市青年',
    desc: '月薪 15000，但一半交房租',
    icon: 'ti-building-skyscraper',
    params: { salary: 15000, years: 20, startCapital: 2500000, rentRatio: 0.5, livingRatio: 0.35, shockProb: 0.25, shockSize: 6, loanRate: 0.24, salaryGrowth: 0.04, assetRate: 0.06 }
  },
  {
    id: 'hard-mode',
    title: '地狱难度',
    desc: '冲击频发，全靠网贷',
    icon: 'ti-alert-octagon',
    params: { salary: 6000, years: 20, startCapital: 1000000, rentRatio: 0.4, livingRatio: 0.5, shockProb: 0.6, shockSize: 10, loanRate: 0.36, salaryGrowth: 0.02, assetRate: 0.07 }
  },
  {
    id: 'easy-mode',
    title: '运气满分',
    desc: '基本无冲击的理想剧本',
    icon: 'ti-mood-happy',
    params: { salary: 10000, years: 20, startCapital: 1500000, rentRatio: 0.35, livingRatio: 0.4, shockProb: 0.05, shockSize: 4, loanRate: 0.18, salaryGrowth: 0.05, assetRate: 0.06 }
  }
];

var SLIDER_KEYS = ['salary','years','startCapital','rentRatio','livingRatio','shockProb','shockSize','loanRate','assetRate','salaryGrowth'];

function $(id) { return document.getElementById(id); }

function fmtCN(v) {
  if (v >= 10000) return (v / 10000).toFixed(0) + ' 万';
  return v + ' 元';
}

function renderPresets() {
  var box = $('presets');
  box.innerHTML = '';
  PRESETS.forEach(function (p) {
    var el = document.createElement('div');
    el.className = 'preset';
    el.dataset.id = p.id;
    el.innerHTML = '<i class="p-icon ti ' + p.icon + '"></i><div class="p-title">' + p.title + '</div><div class="p-desc">' + p.desc + '</div>';
    el.addEventListener('click', function () { applyPreset(p); });
    box.appendChild(el);
  });
}

function applyPreset(p) {
  for (var k in p.params) STATE.params[k] = p.params[k];
  syncSliders();
  var els = document.querySelectorAll('.preset');
  for (var i = 0; i < els.length; i++) {
    els[i].classList.toggle('active', els[i].dataset.id === p.id);
  }
  run();
}

function syncSliders() {
  SLIDER_KEYS.forEach(function (k) {
    var input = $(k);
    if (input) input.value = STATE.params[k];
  });
  updateLabels();
}

function updateLabels() {
  $('v-salary').textContent = STATE.params.salary + ' 元';
  $('v-years').textContent = STATE.params.years + ' 年';
  $('v-startCapital').textContent = fmtCN(STATE.params.startCapital);
  $('v-rentRatio').textContent = Math.round(STATE.params.rentRatio * 100) + '%';
  $('v-livingRatio').textContent = Math.round(STATE.params.livingRatio * 100) + '%';
  $('v-shockProb').textContent = Math.round(STATE.params.shockProb * 100) + '%';
  $('v-shockSize').textContent = STATE.params.shockSize + ' 倍';
  $('v-loanRate').textContent = Math.round(STATE.params.loanRate * 100) + '%';
  $('v-assetRate').textContent = Math.round(STATE.params.assetRate * 100) + '%';
  $('v-salaryGrowth').textContent = (STATE.params.salaryGrowth * 100).toFixed(1) + '%';
}

function bindSliders() {
  SLIDER_KEYS.forEach(function (k) {
    var el = $(k);
    el.addEventListener('input', function () {
      STATE.params[k] = parseFloat(el.value);
      updateLabels();
      var els = document.querySelectorAll('.preset');
      for (var i = 0; i < els.length; i++) els[i].classList.remove('active');
    });
    el.addEventListener('change', run);
  });
}

// ─── 模拟 + 渲染 ───
var chartNW = null;
var chartFlow = null;

function run() {
  var opts = {};
  for (var k in STATE.params) opts[k] = STATE.params[k];
  opts.seed = STATE.seed;
  var res = compareTwoLives(opts);

  $('gap-value').textContent = fmtWan(res.gap);
  var ratio = res.poor.finalNetWorth > 0
    ? (res.rich.finalNetWorth / res.poor.finalNetWorth).toFixed(1) + ' 倍'
    : '∞（底层最终为负）';
  $('gap-ratio').textContent = '富人最终净资产 ≈ 底层的 ' + ratio;

  $('r-poor-rent').textContent = fmtWan(res.poor.totalRent);
  $('r-poor-interest').textContent = fmtWan(res.poor.totalInterest);
  $('r-poor-final').textContent = fmtWan(res.poor.finalNetWorth);
  $('r-rich-final').textContent = fmtWan(res.rich.finalNetWorth);

  $('t-ratio').textContent = ratio;
  $('t-rent-pct').textContent = Math.round(STATE.params.rentRatio * 100) + '%';
  $('t-loan').textContent = Math.round(STATE.params.loanRate * 100) + '%';
  $('t-asset').textContent = Math.round(STATE.params.assetRate * 100) + '%';

  drawNetWorth(res);
  drawFlow(res);
}

function drawNetWorth(res) {
  var poorY = toYearly(res.poor.netWorth);
  var richY = toYearly(res.rich.netWorth);
  var labels = poorY.map(function (_, i) { return '第 ' + (i + 1) + ' 年'; });

  var data = {
    labels: labels,
    datasets: [
      {
        label: '底层（无启动资本）',
        data: poorY.map(function (v) { return +(v / 10000).toFixed(1); }),
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255,107,107,0.1)',
        fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2.5
      },
      {
        label: '有启动资本者',
        data: richY.map(function (v) { return +(v / 10000).toFixed(1); }),
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.1)',
        fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2.5
      }
    ]
  };

  if (chartNW) chartNW.destroy();
  chartNW = new Chart($('chart-networth'), {
    type: 'line',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + '：' + ctx.parsed.y + ' 万元'; }
          }
        }
      },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: {
            color: 'rgba(255,255,255,0.5)',
            callback: function (v) { return v + ' 万'; }
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

function drawFlow(res) {
  var totalSalary = 0;
  var months = STATE.params.years * 12;
  var s = STATE.params.salary;
  var g = Math.pow(1 + STATE.params.salaryGrowth, 1/12) - 1;
  for (var m = 0; m < months; m++) {
    s = s * (1 + g);
    totalSalary += s;
  }
  var rent = res.poor.totalRent;
  var interest = res.poor.totalInterest;
  var living = totalSalary * STATE.params.livingRatio; // 近似估算
  var leftover = Math.max(0, res.poor.finalNetWorth);

  var labels = ['留下的（净资产）', '房租', '高息利息', '必要生活支出'];
  var dataArr = [leftover, rent, interest, living];
  var colors = ['#81c784', '#ff6b6b', '#ff8a65', '#90caf9'];

  if (chartFlow) chartFlow.destroy();
  chartFlow = new Chart($('chart-flow'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataArr.map(function (v) { return +(v / 10000).toFixed(1); }),
        backgroundColor: colors,
        borderColor: 'rgba(0,0,0,0.3)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: 'rgba(255,255,255,0.7)', font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.label + '：' + ctx.parsed + ' 万元'; }
          }
        }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', function () {
  renderPresets();
  syncSliders();
  bindSliders();
  $('run-btn').addEventListener('click', run);
  $('reshuffle-btn').addEventListener('click', function () {
    STATE.seed = Math.floor(Math.random() * 1e9);
    run();
  });
  var defaultPreset = null;
  for (var i = 0; i < PRESETS.length; i++) {
    if (PRESETS[i].id === 'big-city') { defaultPreset = PRESETS[i]; break; }
  }
  if (defaultPreset) applyPreset(defaultPreset);
  else run();
});
