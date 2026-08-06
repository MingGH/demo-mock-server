// ========== 游戏多货币经济沙盘：DOM 绑定与可视化 ==========

// ---------- 第一关：调崩单一货币 ----------
function updateSingle() {
  var grind = parseInt(document.getElementById('sliderGrind').value);
  var price = parseInt(document.getElementById('sliderPrice').value);
  document.getElementById('valGrind').textContent = grind;
  document.getElementById('valPrice').textContent = price;

  var cfg = buildConfig({ currencyCount: 1, grindRate: grind, payRate: 4, payShare: 0.3, premiumPrice: price });
  var sim = simulate(cfg);
  var health = sim.metrics.health;

  setGauge('singleGaugeRing', health);
  document.getElementById('singleHealth').textContent = health;
  document.getElementById('singleVerdict').textContent = sim.metrics.verdict;

  var boom = document.getElementById('singleBoom');
  if (health < 30) {
    boom.style.display = '';
    document.getElementById('singleBoomText').innerHTML =
      '经济健康分只有 <strong>' + health + '</strong>。玩家越刷越没意思：货币无限增发、越存越不值钱，' +
      '氪金占比 ' + (sim.metrics.monetization * 100).toFixed(0) + '%——但没人觉得需要氪。' +
      '这就是「单一货币」的通病。';
    document.getElementById('singleHint').textContent = '越掉钱，越崩。现在该加一种货币了。';
  } else {
    boom.style.display = 'none';
    document.getElementById('singleHint').textContent = '掉钱太少赚得慢，再把单价调高点试试。';
  }
}

// ---------- 第二关：对比模拟器 ----------
var charts = { inflation: null, retention: null, supply: null };
var lastSim = null;
var prevHealth = null;

function updateCompare() {
  var count = parseInt(document.getElementById('sliderCount').value);
  var grind = parseInt(document.getElementById('sliderGrind2').value);
  var pay = parseFloat(document.getElementById('sliderPay').value);
  var payShare = parseInt(document.getElementById('sliderPayShare').value) / 100;
  var price = parseInt(document.getElementById('sliderPrice2').value);

  document.getElementById('valCount').textContent = count;
  document.getElementById('valGrind2').textContent = grind;
  document.getElementById('valPay').textContent = pay;
  document.getElementById('valPayShare').textContent = (payShare * 100).toFixed(0) + '%';
  document.getElementById('valPrice2').textContent = price;

  var cfg = buildConfig({ currencyCount: count, grindRate: grind, payRate: pay, payShare: payShare, premiumPrice: price });
  var sim = simulate(cfg);
  var m = sim.metrics;
  lastSim = sim;

  // 健康分跨越阈值时记里程碑（低频事件，适合埋点）
  if (window.NFTrack) {
    if (prevHealth !== null) {
      if (prevHealth >= 70 && m.health < 70) NFTrack.track('economy_milestone', { state: 'recovered_to_risky', health: m.health });
      else if (prevHealth < 70 && m.health >= 70) NFTrack.track('economy_milestone', { state: 'turned_healthy', health: m.health });
      else if (prevHealth > 30 && m.health <= 30) NFTrack.track('economy_milestone', { state: 'collapsed', health: m.health });
      else if (prevHealth <= 30 && m.health > 30) NFTrack.track('economy_milestone', { state: 'climbed_out_of_collapse', health: m.health });
    }
    prevHealth = m.health;
  }

  // 健康分仪表
  setGauge('healthRing', m.health);
  document.getElementById('healthNum').textContent = m.health;
  setGaugeColor('healthRing', m.health);
  document.getElementById('verdictLive').textContent = m.verdict;

  // 三分项
  var retainScore = m.retention * 100;
  var inflScore = (1 - m.inflation) * 100;
  var monoScore = m.hasHard ? clamp(1 - Math.abs(m.monetization - 0.3) / 0.3, 0, 1) * 100 : 0;
  document.getElementById('barRetain').style.width = retainScore + '%';
  document.getElementById('barInflation').style.width = inflScore + '%';
  document.getElementById('barMono').style.width = monoScore + '%';
  document.getElementById('valRetain').textContent = retainScore.toFixed(0);
  document.getElementById('valInflation').textContent = inflScore.toFixed(0);
  document.getElementById('valMono').textContent = monoScore.toFixed(0);

  // 图表
  drawCharts(sim);

  // 体检报告
  document.getElementById('reportList').innerHTML = sim.reasons.map(function(r) {
    return '<li>' + r + '</li>';
  }).join('');
}

function drawCharts(sim) {
  var s = sim.series;
  var labels = s.inflation.map(function(v, i) { return i; });

  charts.inflation = drawLine('inflationChart', charts.inflation, labels, [
    { label: '通胀指数（贬值）', data: s.inflation, color: '#ff6b6b' }
  ], '货币贬值程度', '0~1');

  charts.retention = drawLine('retentionChart', charts.retention, labels, [
    { label: '留存率（目标感）', data: s.retention, color: '#81c784' }
  ], '玩家留存', '0~1');

  charts.supply = drawLine('supplyChart', charts.supply, labels, [
    { label: '人均软货币持有量', data: s.soft, color: '#ffd700' }
  ], '币量（对数）', '');
}

function drawLine(canvasId, existing, labels, datasets, yTitle, yFormat) {
  var ctx = document.getElementById(canvasId).getContext('2d');
  if (existing) { existing.destroy(); }
  var ds = datasets.map(function(d) {
    return {
      label: d.label,
      data: d.data,
      borderColor: d.color,
      backgroundColor: d.color + '22',
      fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2.5
    };
  });
  return new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#c0c0c0', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: function(c) {
              var v = c.raw;
              var txt = v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(3);
              return c.dataset.label + '：' + txt;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '时间（tick）', color: '#888' },
          ticks: { color: '#888', maxTicksLimit: 8, font: { size: 10 } },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: yTitle, color: '#888' },
          type: yFormat === '对数' || yTitle === '币量（对数）' ? 'logarithmic' : 'linear',
          ticks: { color: '#888', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ---------- 仪表盘辅助 ----------
function setGauge(ringId, health) {
  var deg = clamp(health, 0, 100) / 100 * 360;
  var el = document.getElementById(ringId);
  el.style.setProperty('--pct', deg + 'deg');
  setGaugeColor(ringId, health);
}

function setGaugeColor(ringId, health) {
  var el = document.getElementById(ringId);
  var color = health >= 70 ? '#81c784' : (health >= 40 ? '#ffd700' : '#ff6b6b');
  el.style.background = 'conic-gradient(' + color + ' 0deg, ' + color + ' var(--pct), rgba(255,255,255,0.08) var(--pct))';
}

// ---------- 流程控制 ----------
function toSecond() {
  document.getElementById('compareSection').style.display = '';
  document.getElementById('theorySection').style.display = '';
  document.getElementById('btnTheory').style.display = '';
  document.getElementById('compareSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  applyPreset('single');
}

function toTheory() {
  document.getElementById('theorySection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 预设对应的「基础滑块参数」（与 buildConfig 输入一致，避免 sum 后重拆分导致漂移）
var PRESET_BASE = {
  single: { count: 1, grind: 5, pay: 4, share: 30 },
  two:    { count: 2, grind: 5, pay: 4, share: 30 },
  three:  { count: 3, grind: 5, pay: 4, share: 30 }
};

function applyPreset(name) {
  var b = PRESET_BASE[name];

  document.getElementById('sliderCount').value = b.count;
  document.getElementById('sliderGrind2').value = b.grind;
  document.getElementById('sliderPay').value = b.pay;
  document.getElementById('sliderPayShare').value = b.share;
  document.getElementById('sliderPrice2').value = 800;

  // 高亮预设按钮
  ['presetSingle', 'presetTwo', 'presetThree'].forEach(function(id) {
    document.getElementById(id).classList.remove('active');
  });
  document.getElementById('preset' + (b.count === 1 ? 'Single' : (b.count === 2 ? 'Two' : 'Three'))).classList.add('active');

  updateCompare();

  if (window.NFTrack && lastSim) {
    NFTrack.track('apply_preset', { preset: name, health: lastSim.metrics.health });
  }
}

// ---------- 初始化 ----------
function init() {
  ['sliderGrind', 'sliderPrice'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', updateSingle);
  });
  ['sliderCount', 'sliderGrind2', 'sliderPay', 'sliderPayShare', 'sliderPrice2'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', updateCompare);
  });
  updateSingle();
  updateCompare();
  if (window.NFTrack) {
    NFTrack.trackOnce('session_start', {});
  }
}

init();