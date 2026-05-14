// ===== 无知之幕 v1 =====
const API_BASE = 'https://numfeel-api.996.ninja';

// 默认政策
const defaults = {
  taxRate: 35, eduSpend: 15000, healthLevel: 2, inheritanceTax: 20, basicIncome: 1000
};

let policies = { ...defaults };
let attrs = null;
let result = null;
let stage = 1;        // 1=设计 2=抽签 3=结果 4=全站
let cardRevealed = [false, false, false, false];
let globalScatter = null;  // Chart.js 散点图引用

function $(id) { return document.getElementById(id); }

// ===== 初始化 =====
function init() {
  bindSliders();
  bindButtons();
  goStage(1);
  loadGlobalStats();
}

function bindSliders() {
  const sliders = [
    { id: 'taxRate', disp: 'taxRateVal', side: 'taxSide' },
    { id: 'eduSpend', disp: 'eduSpendVal', side: 'eduSide' },
    { id: 'healthLevel', disp: 'healthLevelVal', side: 'healthSide', isLevel: true },
    { id: 'inheritanceTax', disp: 'inheritanceTaxVal', side: 'inheritanceSide' },
    { id: 'basicIncome', disp: 'basicIncomeVal', side: 'basicIncomeSide' }
  ];
  sliders.forEach(s => {
    const el = $(s.id);
    el.addEventListener('input', () => {
      policies[s.id] = s.isLevel ? parseInt(el.value) : parseInt(el.value);
      if (s.isLevel) {
        const labels = ['','仅保大病','基础医保','全面医保','全民免费'];
        $(s.disp).textContent = labels[policies[s.id]];
      } else {
        $(s.disp).textContent = policies[s.id].toLocaleString();
      }
      updateSidebar(s.side, s.id, policies[s.id]);
      if (stage === 1) recalcPreview();
    });
    // 初始化显示
    if (s.isLevel) {
      const labels = ['','仅保大病','基础医保','全面医保','全民免费'];
      $(s.disp).textContent = labels[policies[s.id]];
    } else {
      $(s.disp).textContent = policies[s.id].toLocaleString();
    }
    updateSidebar(s.side, s.id, policies[s.id]);
  });
}

function bindButtons() {
  $('btnDesign').addEventListener('click', () => goStage(1));
  $('btnDraw').addEventListener('click', drawAttributes);
  $('btnRedraw').addEventListener('click', drawAttributes);
  $('btnResult').addEventListener('click', () => goStage(3));
  $('btnGlobal').addEventListener('click', () => { goStage(4); loadGlobalStats(); });
  $('btnReset').addEventListener('click', resetAll);
  // 卡片点击
  ['cardTalent','cardFamily','cardHealth','cardLuck'].forEach((id, i) => {
    $(id).addEventListener('click', () => revealCard(i));
  });
}

// ===== 侧栏实时说明 =====
function updateSidebar(sideId, policyId, val) {
  const el = $(sideId);
  switch (policyId) {
  case 'taxRate':
    const income = 1500000;
    el.textContent = `年入 ${(income/10000).toFixed(0)} 万的人：约到手 ${Math.round(income*(1-val/100)/10000)} 万`;
    break;
  case 'eduSpend':
    if (val <= 5000) el.textContent = '≈ 贫困县村小水平（生均经费）';
    else if (val <= 15000) el.textContent = '≈ 普通县城/乡镇学校水平';
    else if (val <= 35000) el.textContent = '≈ 二三线城市重点校水平';
    else el.textContent = '≈ 一线城市国际学校水平';
    break;
  case 'healthLevel':
    el.textContent = ['', '仅保大病，日常看病自负', '基础医保，住院报 60%', '全面医保，门诊+住院报 85%', '全民免费，0 自费'][val];
    break;
  case 'inheritanceTax':
    el.textContent = `富二代继承 1000 万：到手 ${Math.round(1000*(1-val/100))} 万`;
    break;
  case 'basicIncome':
    if (val === 0) el.textContent = '无基本收入，不工作=0 收入';
    else el.textContent = `不工作每月也领 ¥${val}，年领 ¥${val*12}`;
    break;
  }
}

function recalcPreview() {
  const a = Engine.generateAttributes();
  const r = Engine.calculate(policies, a);
  $('previewQol').textContent = r.qol;
  const color = r.qol >= 60 ? '#4caf50' : r.qol >= 30 ? '#ff9800' : '#f44336';
  $('previewQol').style.color = color;
}

// ===== 阶段切换 =====
function goStage(s) {
  stage = s;
  ['stage1','stage2','stage3','stage4'].forEach((id, i) => {
    $(id).style.display = i+1 === s ? '' : 'none';
  });
  // 步骤指示器
  document.querySelectorAll('.step-dot').forEach((el, i) => {
    el.classList.toggle('active', i+1 === s);
    el.classList.toggle('done', i+1 < s);
  });
  // 按钮状态
  $('btnDesign').classList.toggle('active-step', s === 1);
  $('btnDraw').style.display = s === 1 ? '' : 'none';
  $('btnResult').style.display = (s === 2 && attrs) ? '' : 'none';
  $('btnGlobal').style.display = (s >= 3) ? '' : 'none';
  $('btnRedraw').style.display = (s === 2) ? '' : 'none';

  if (s === 2) renderCards();
  if (s === 3 && result) renderResult();
  if (s === 4) loadGlobalStats();
}

// ===== 抽签 =====
function drawAttributes() {
  attrs = Engine.generateAttributes();
  result = Engine.calculate(policies, attrs);
  cardRevealed = [false, false, false, false];
  goStage(2);
  renderCards();
  $('revealAllHint').style.display = '';
}

function renderCards() {
  if (!attrs) return;
  const keys = ['talent','family','health','luck'];
  const labels = ['天赋','家庭财富','健康状况','运气'];
  const icons = ['ti-brain','ti-building-bank','ti-heart','ti-clover'];
  keys.forEach((k, i) => {
    const card = $('card' + k.charAt(0).toUpperCase() + k.slice(1));
    card.className = 'attr-card' + (cardRevealed[i] ? ' revealed' : '');
    const iconEl = card.querySelector('.card-icon i');
    iconEl.className = 'ti ' + icons[i];
    const labelEl = card.querySelector('.card-label');
    labelEl.textContent = labels[i];
    const valEl = card.querySelector('.card-value');
    if (cardRevealed[i]) {
      const descs = {
        talent: ['偏低','平均','偏高'][attrs.talent < 35 ? 0 : attrs.talent < 65 ? 1 : 2],
        family: ['低保','普通','富裕'][attrs.family < 30 ? 0 : attrs.family < 70 ? 1 : 2],
        health: ['较差','一般','良好'][attrs.health < 35 ? 0 : attrs.health < 65 ? 1 : 2],
        luck: attrs.luck < 33 ? '倒霉' : attrs.luck < 66 ? '一般' : '走运'
      };
      valEl.textContent = descs[k] + ' (' + attrs[k] + ')';
      valEl.style.opacity = '1';
    } else {
      valEl.textContent = '?';
      valEl.style.opacity = '0.4';
    }
  });
}

function revealCard(i) {
  if (!attrs || cardRevealed[i]) return;
  cardRevealed[i] = true;
  renderCards();
  if (cardRevealed.every(v => v)) {
    $('revealAllHint').style.display = 'none';
    $('btnResult').style.display = '';
    $('btnGlobal').style.display = '';
  }
}

// ===== 结果面板 =====
function renderResult() {
  if (!result) return;
  const r = result;
  $('qolScore').textContent = r.qol;
  const color = r.qol >= 70 ? '#4caf50' : r.qol >= 40 ? '#ff9800' : '#f44336';
  $('qolScore').style.color = color;
  $('qolBar').style.width = r.qol + '%';
  $('qolBar').style.background = color;

  // 子项条形图
  const items = [
    { label: '市场收入', val: r.marketIncome, max: 20000, icon: 'ti-briefcase' },
    { label: '税后收入', val: r.afterTax, max: 20000, icon: 'ti-receipt-tax' },
    { label: '教育助力', val: r.eduBoost, max: 8000, icon: 'ti-school' },
    { label: '基本收入', val: r.basicIncome, max: 4000, icon: 'ti-cash' },
    { label: '遗产加成', val: r.inheritanceAfterTax, max: 6000, icon: 'ti-building-bank' },
    { label: '医疗负担', val: -r.healthBurden, max: 6000, icon: 'ti-heart', neg: true },
  ];
  const breakdownEl = $('breakdown');
  breakdownEl.innerHTML = '';
  items.forEach(item => {
    const abs = Math.abs(item.val);
    const pct = Math.min(100, abs / item.max * 100);
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <span class="br-label"><i class="ti ${item.icon}"></i> ${item.label}</span>
      <span class="br-bar-wrap"><span class="br-bar ${item.neg ? 'neg' : ''}" style="width:${pct}%"></span></span>
      <span class="br-val ${item.neg ? 'neg' : ''}">${item.neg ? '-' : '+'}¥${abs.toLocaleString()}</span>
    `;
    breakdownEl.appendChild(row);
  });

  // 可支配收入
  $('disposableVal').textContent = '¥' + r.disposable.toLocaleString();
  $('formulaDetails').style.display = 'none';
}

function toggleFormula() {
  $('formulaDetails').style.display =
    $('formulaDetails').style.display === 'none' ? '' : 'none';
}

// ===== 全站统计 =====
function loadGlobalStats() {
  fetch(API_BASE + '/veil/stats')
    .then(r => r.json())
    .then(data => {
      if (data.status === 200) renderGlobalStats(data.data);
    }).catch(() => {});
}

function renderGlobalStats(data) {
  if (!data || data.totalRuns === 0) {
    $('globalInfo').textContent = '还没有人参与过无知之幕。你是第一个！';
    return;
  }
  $('globalInfo').textContent =
    `已有 ${data.totalRuns} 人参与。平均 QoL：${data.avgQol} 分。公平系数：${data.avgFairness} 分（满分 100）。`;

  // 散点图
  if (data.scatter && data.scatter.length > 0) {
    renderScatter(data.scatter);
  }
}

function renderScatter(points) {
  const canvas = $('scatterCanvas');
  if (globalScatter) globalScatter.destroy();

  const ctx = canvas.getContext('2d');
  globalScatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: '其他玩家',
        data: points.filter(p => !p.isYou).map(p => ({ x: p.attrAvg, y: p.qol })),
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderColor: 'rgba(255,255,255,0.06)',
        pointRadius: 4,
        pointHoverRadius: 6
      }, {
        label: '你的位置',
        data: points.filter(p => p.isYou).map(p => ({ x: p.attrAvg, y: p.qol })),
        backgroundColor: '#ffd700',
        borderColor: '#ffb300',
        pointRadius: 8,
        pointHoverRadius: 10,
        pointStyle: 'star'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.6)' } }
      },
      scales: {
        x: {
          title: { display: true, text: '属性综合分（越高条件越好）', color: 'rgba(255,255,255,0.5)' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: 'rgba(255,255,255,0.4)' },
          min: 0, max: 100
        },
        y: {
          title: { display: true, text: 'QoL 得分', color: 'rgba(255,255,255,0.5)' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: 'rgba(255,255,255,0.4)' },
          min: 0, max: 100
        }
      }
    }
  });

  // 提交你的数据
  if (attrs && result) {
    submitStats(points);
  }
}

function submitStats(existingPoints) {
  const body = {
    policies,
    attrs,
    result
  };
  fetch(API_BASE + '/veil/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json()).then(data => {
    if (data.status === 200 && data.data.scatter) {
      renderScatter(data.data.scatter);
    }
  }).catch(() => {});
}

// ===== 重置 =====
function resetAll() {
  policies = { ...defaults };
  attrs = null;
  result = null;
  cardRevealed = [false, false, false, false];
  // 重置滑块
  Object.entries(defaults).forEach(([k, v]) => {
    const el = $(k);
    if (el) el.value = v;
  });
  $('taxRateVal').textContent = defaults.taxRate;
  $('eduSpendVal').textContent = defaults.eduSpend.toLocaleString();
  $('healthLevelVal').textContent = '基础医保';
  $('inheritanceTaxVal').textContent = defaults.inheritanceTax;
  $('basicIncomeVal').textContent = defaults.basicIncome.toLocaleString();
  updateSidebar('taxSide', 'taxRate', defaults.taxRate);
  updateSidebar('eduSide', 'eduSpend', defaults.eduSpend);
  updateSidebar('healthSide', 'healthLevel', defaults.healthLevel);
  updateSidebar('inheritanceSide', 'inheritanceTax', defaults.inheritanceTax);
  updateSidebar('basicIncomeSide', 'basicIncome', defaults.basicIncome);
  goStage(1);
}

document.addEventListener('DOMContentLoaded', init);
