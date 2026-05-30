// ===== 无知之幕 v2 =====
// 核心改动：先揭示身份让你自私设计，再遮住身份让你重新设计，最后对比差异
const API_BASE = 'https://numfeel-api.996.ninja';

let myAttrs = null;          // 你被分配的身份
let selfishPolicies = null;  // 知道身份时设计的规则
let veilPolicies = null;     // 无知之幕后设计的规则
let stage = 1;
let compareChart = null;

function $(id) { return document.getElementById(id); }

// ===== 身份描述 =====
const attrDescriptions = {
  talent: v => v < 25 ? '天赋很低' : v < 40 ? '天赋偏低' : v < 60 ? '天赋中等' : v < 80 ? '天赋较高' : '天赋极高',
  family: v => v < 15 ? '赤贫家庭' : v < 35 ? '低收入家庭' : v < 60 ? '普通家庭' : v < 80 ? '富裕家庭' : '顶级富豪',
  health: v => v < 25 ? '重度疾病' : v < 40 ? '健康较差' : v < 60 ? '健康一般' : v < 80 ? '健康良好' : '身体极好',
  luck:   v => v < 25 ? '非常倒霉' : v < 40 ? '运气偏差' : v < 60 ? '运气一般' : v < 80 ? '运气不错' : '极其幸运'
};

const attrIcons = { talent: 'ti-brain', family: 'ti-building-bank', health: 'ti-heart', luck: 'ti-clover' };
const attrLabels = { talent: '天赋', family: '家庭', health: '健康', luck: '运气' };

function identitySummaryText(attrs) {
  const avg = (attrs.talent + attrs.family + attrs.health + attrs.luck) / 4;
  // 生成一个有温度的人设故事
  const stories = [];
  if (attrs.family >= 70) {
    stories.push('你出生在一个富裕家庭，从小不愁吃穿，上的是最好的学校。');
  } else if (attrs.family >= 40) {
    stories.push('你的家庭条件普通，父母是工薪阶层，日子过得去但没什么余裕。');
  } else {
    stories.push('你家里很穷，父母打零工维生，你从小就知道钱来之不易。');
  }

  if (attrs.talent >= 70) {
    stories.push('你天资聪颖，学什么都快，老师们都说你是块好料。');
  } else if (attrs.talent >= 40) {
    stories.push('你的智力中等，不算笨但也不是天才，需要努力才能跟上。');
  } else {
    stories.push('坦白说，你在学业上一直很吃力，很多东西别人一学就会，你要花三倍时间。');
  }

  if (attrs.health < 35) {
    stories.push('更糟的是，你身体不好，经常跑医院，医药费是一笔沉重的负担。');
  } else if (attrs.health >= 75) {
    stories.push('好在你身体很棒，几乎不生病。');
  }

  return stories.join('');
}

// 根据身份生成"自私提示"
function selfishHint(attrs) {
  const avg = (attrs.talent + attrs.family + attrs.health + attrs.luck) / 4;
  if (avg >= 65) {
    const tips = [];
    if (attrs.family >= 60) tips.push('降低遗产税能保住你的家族财富');
    if (attrs.talent >= 60) tips.push('降低税率能让你的高收入留更多在手里');
    tips.push('你条件好，低福利对你影响不大');
    return '💡 提示：你是这个社会的优势群体。' + tips.join('；') + '。';
  } else if (avg <= 35) {
    return '💡 提示：你是这个社会的弱势群体。高税率、高教育投入、高医保、高基本收入对你最有利——但别忘了经济效率。';
  } else {
    return '💡 提示：你的条件中等。想想什么规则对你这个位置最有利？';
  }
}

// ===== 初始化 =====
function init() {
  // 生成身份
  myAttrs = Engine.generateAttributes();
  renderIdentity();
  bindAllSliders();
  bindButtons();
  goStage(1);
}

function renderIdentity() {
  const container = $('identityAttrs');
  container.innerHTML = '';
  for (const key of ['talent', 'family', 'health', 'luck']) {
    const val = myAttrs[key];
    const barColor = val >= 60 ? '#4caf50' : val >= 35 ? '#ff9800' : '#f44336';
    container.innerHTML += `
      <div class="identity-attr-row">
        <span class="ia-icon"><i class="ti ${attrIcons[key]}"></i></span>
        <span class="ia-label">${attrLabels[key]}</span>
        <span class="ia-bar"><span class="ia-bar-fill" style="width:${val}%;background:${barColor}"></span></span>
        <span class="ia-desc">${attrDescriptions[key](val)}</span>
        <span class="ia-val">${val}</span>
      </div>
    `;
  }
  $('identitySummary').textContent = identitySummaryText(myAttrs);

  // 阶段2的身份提醒条 + 自私提示
  const avg = (myAttrs.talent + myAttrs.family + myAttrs.health + myAttrs.luck) / 4;
  const reminderColor = avg >= 50 ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)';
  $('identityReminder').innerHTML = `
    <div style="background:${reminderColor};border-radius:10px;padding:10px 16px;margin-bottom:12px;font-size:13px;line-height:1.6;">
      <i class="ti ti-user-check" style="color:#ffd700;"></i>
      <strong>你的身份：</strong>${attrDescriptions.talent(myAttrs.talent)}、${attrDescriptions.family(myAttrs.family)}、${attrDescriptions.health(myAttrs.health)}、${attrDescriptions.luck(myAttrs.luck)}。
      综合条件 ${Math.round(avg)} 分。
    </div>
    <div style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:10px 16px;margin-bottom:12px;font-size:12px;color:rgba(255,215,0,0.8);">
      ${selfishHint(myAttrs)}
    </div>
  `;
}

// ===== 滑块绑定 =====
function bindAllSliders() {
  // 阶段2滑块（自私）
  bindSliderGroup('s_', () => updateSelfishPreview());
  // 阶段3滑块（无知之幕）
  bindSliderGroup('v_', () => updateVeilPreview());
}

function bindSliderGroup(prefix, onChange) {
  const ids = ['taxRate', 'eduSpend', 'healthLevel', 'inheritanceTax', 'basicIncome'];
  ids.forEach(id => {
    const el = $(prefix + id);
    if (!el) return;
    el.addEventListener('input', () => {
      updateSliderDisplay(prefix, id, parseInt(el.value));
      onChange();
    });
    // 初始化显示
    updateSliderDisplay(prefix, id, parseInt(el.value));
  });
}

function updateSliderDisplay(prefix, id, val) {
  const dispEl = $(prefix + id + 'Val');
  if (!dispEl) return;
  switch (id) {
    case 'taxRate': dispEl.textContent = val + '%'; break;
    case 'eduSpend': dispEl.textContent = '¥' + val.toLocaleString(); break;
    case 'healthLevel':
      dispEl.textContent = ['','仅保大病','基础医保','全面医保','全民免费'][val];
      break;
    case 'inheritanceTax': dispEl.textContent = val + '%'; break;
    case 'basicIncome': dispEl.textContent = '¥' + val.toLocaleString(); break;
  }
}

function readPolicies(prefix) {
  return {
    taxRate: parseInt($(prefix + 'taxRate').value),
    eduSpend: parseInt($(prefix + 'eduSpend').value),
    healthLevel: parseInt($(prefix + 'healthLevel').value),
    inheritanceTax: parseInt($(prefix + 'inheritanceTax').value),
    basicIncome: parseInt($(prefix + 'basicIncome').value)
  };
}

function updateSelfishPreview() {
  const p = readPolicies('s_');
  const r = Engine.calculate(p, myAttrs);
  const color = r.qol >= 60 ? '#4caf50' : r.qol >= 30 ? '#ff9800' : '#f44336';
  $('selfishQol').textContent = r.qol;
  $('selfishQol').style.color = color;
  // 展示收支明细 + 经济效率
  $('selfishBreakdown').innerHTML = `
    经济效率 ${r.efficiency}% |
    市场收入 ¥${r.marketIncome.toLocaleString()} →
    税后 ¥${r.afterTax.toLocaleString()} +
    教育 ¥${r.eduBoost.toLocaleString()} +
    基本收入 ¥${r.basicIncome.toLocaleString()} +
    遗产 ¥${r.inheritanceAfterTax.toLocaleString()} -
    医疗 ¥${r.healthBurden.toLocaleString()} =
    可支配 ¥${r.disposable.toLocaleString()}
  `.trim().replace(/\n\s+/g, ' ');
}

function updateVeilPreview() {
  const p = readPolicies('v_');
  // 模拟 200 个随机身份
  const qols = [];
  for (let i = 0; i < 200; i++) {
    const a = Engine.generateAttributes();
    qols.push(Engine.calculate(p, a).qol);
  }
  qols.sort((a, b) => a - b);
  const avg = Math.round(qols.reduce((s, v) => s + v, 0) / qols.length);
  const worst10 = qols.slice(0, 20);
  const worstAvg = Math.round(worst10.reduce((s, v) => s + v, 0) / worst10.length);

  $('veilAvgQol').textContent = avg;
  $('veilAvgQol').style.color = avg >= 50 ? '#4caf50' : avg >= 30 ? '#ff9800' : '#f44336';
  $('veilWorstQol').textContent = worstAvg;
  $('veilWorstQol').style.color = worstAvg >= 30 ? '#ff9800' : '#f44336';
}

// ===== 按钮绑定 =====
function bindButtons() {
  $('btnGoSelfish').addEventListener('click', () => goStage(2));
  $('btnLockSelfish').addEventListener('click', lockSelfish);
  $('btnLockVeil').addEventListener('click', lockVeil);
  $('btnRestart').addEventListener('click', restart);
}

function lockSelfish() {
  selfishPolicies = readPolicies('s_');
  // 关键设计：第二轮滑块初始值 = 第一轮的值
  // 让玩家从自己的"自私规则"出发，主动去改
  ['taxRate','eduSpend','healthLevel','inheritanceTax','basicIncome'].forEach(id => {
    const el = $('v_' + id);
    if (el) el.value = selfishPolicies[id];
    updateSliderDisplay('v_', id, selfishPolicies[id]);
  });
  goStage(3);
  updateVeilPreview();
}

function lockVeil() {
  veilPolicies = readPolicies('v_');
  goStage(4);
  renderComparison();
}

function restart() {
  myAttrs = Engine.generateAttributes();
  selfishPolicies = null;
  veilPolicies = null;
  renderIdentity();
  // 重置阶段2滑块
  $('s_taxRate').value = 35;
  $('s_eduSpend').value = 15000;
  $('s_healthLevel').value = 2;
  $('s_inheritanceTax').value = 20;
  $('s_basicIncome').value = 1000;
  ['taxRate','eduSpend','healthLevel','inheritanceTax','basicIncome'].forEach(id => {
    updateSliderDisplay('s_', id, parseInt($('s_' + id).value));
  });
  goStage(1);
}

// ===== 阶段切换 =====
function goStage(s) {
  stage = s;
  for (let i = 1; i <= 4; i++) {
    $('stage' + i).style.display = i === s ? 'block' : 'none';
  }
  document.querySelectorAll('.step-dot').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === s);
    el.classList.toggle('done', i + 1 < s);
  });
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (s === 2) updateSelfishPreview();
  if (s === 3) {
    // 播放幕布动画
    const anim = $('veilAnimation');
    anim.classList.remove('played');
    void anim.offsetWidth; // force reflow
    anim.classList.add('played');
  }
}

// ===== 对比渲染 =====
function renderComparison() {
  renderCompareTable();
  renderInsight();
  renderCompareChart();
  renderFairnessCompare();
}

function renderCompareTable() {
  const labels = {
    taxRate: ['最高税率', v => v + '%'],
    eduSpend: ['教育投入', v => '¥' + v.toLocaleString()],
    healthLevel: ['医保等级', v => ['','仅保大病','基础医保','全面医保','全民免费'][v]],
    inheritanceTax: ['遗产税率', v => v + '%'],
    basicIncome: ['基本收入', v => '¥' + v.toLocaleString() + '/月']
  };

  let html = `
    <div class="ct-header">
      <span class="ct-col"></span>
      <span class="ct-col ct-selfish">知道身份时</span>
      <span class="ct-col ct-veil">无知之幕后</span>
      <span class="ct-col ct-diff">变化</span>
    </div>
  `;

  for (const [key, [label, fmt]] of Object.entries(labels)) {
    const sv = selfishPolicies[key];
    const vv = veilPolicies[key];
    const diff = vv - sv;
    const diffStr = diff === 0 ? '—' : (diff > 0 ? '↑' + Math.abs(diff) : '↓' + Math.abs(diff));
    const diffClass = diff === 0 ? '' : diff > 0 ? 'up' : 'down';
    html += `
      <div class="ct-row">
        <span class="ct-col ct-label">${label}</span>
        <span class="ct-col ct-selfish">${fmt(sv)}</span>
        <span class="ct-col ct-veil">${fmt(vv)}</span>
        <span class="ct-col ct-diff ${diffClass}">${diffStr}</span>
      </div>
    `;
  }
  $('compareTable').innerHTML = html;
}

function renderInsight() {
  const diffs = {
    taxRate: veilPolicies.taxRate - selfishPolicies.taxRate,
    eduSpend: veilPolicies.eduSpend - selfishPolicies.eduSpend,
    healthLevel: veilPolicies.healthLevel - selfishPolicies.healthLevel,
    inheritanceTax: veilPolicies.inheritanceTax - selfishPolicies.inheritanceTax,
    basicIncome: veilPolicies.basicIncome - selfishPolicies.basicIncome
  };

  const insights = [];
  const avg = (myAttrs.talent + myAttrs.family + myAttrs.health + myAttrs.luck) / 4;
  const isPrivileged = avg >= 55;

  // 判断是否有显著变化
  const totalChange = Math.abs(diffs.taxRate) + Math.abs(diffs.eduSpend / 1000) +
    Math.abs(diffs.healthLevel * 10) + Math.abs(diffs.inheritanceTax) + Math.abs(diffs.basicIncome / 100);

  if (totalChange < 5) {
    insights.push('你的两套规则几乎一样！你可能天生就是一个公平主义者，或者你在第一轮就已经考虑到了其他人的处境。');
  } else {
    if (isPrivileged) {
      if (diffs.taxRate > 5) insights.push(`你把税率提高了 ${diffs.taxRate} 个百分点。知道自己是优势群体时，你倾向于低税率保护自己的收入；不知道自己是谁时，你愿意多交税来换取安全网。`);
      if (diffs.inheritanceTax > 5) insights.push(`遗产税提高了 ${diffs.inheritanceTax} 个百分点。当你不确定自己能否继承财富时，你更愿意限制继承特权。`);
      if (diffs.basicIncome > 200) insights.push(`基本收入提高了 ¥${diffs.basicIncome}。当你可能是最穷的那个人时，安全网突然变得重要了。`);
    } else {
      if (diffs.taxRate < -5) insights.push(`你把税率降低了 ${Math.abs(diffs.taxRate)} 个百分点。有趣——知道自己处于弱势时你想要高税率再分配，但不知道身份后你变得更温和了。`);
      if (diffs.taxRate > 5) insights.push(`即使不知道身份，你仍然选择了高税率。这说明你认为再分配对所有人都有利。`);
      if (diffs.eduSpend > 5000) insights.push(`教育投入增加了 ¥${diffs.eduSpend.toLocaleString()}。你意识到教育是最重要的社会流动性引擎。`);
    }

    if (diffs.healthLevel > 0) insights.push(`医保等级提高了。当健康变成随机变量时，没人愿意赌自己不会生病。`);
  }

  if (insights.length === 0) {
    insights.push('无知之幕改变了你的决策方向。Rawls 的核心观点是：公平的规则，是那些你在不知道自己位置时也愿意接受的规则。');
  }

  $('insightBox').innerHTML = `
    <div class="insight-title"><i class="ti ti-bulb"></i> 洞察</div>
    ${insights.map(t => `<p class="insight-text">${t}</p>`).join('')}
    <p class="insight-rawls">"正义的原则是在无知之幕后面被选择的原则。" —— John Rawls《正义论》</p>
  `;
}

function renderCompareChart() {
  // 模拟 1000 个随机身份，分别用两套规则计算 QoL
  const N = 1000;
  const selfishQols = [];
  const veilQols = [];

  for (let i = 0; i < N; i++) {
    const a = Engine.generateAttributes();
    selfishQols.push(Engine.calculate(selfishPolicies, a).qol);
    veilQols.push(Engine.calculate(veilPolicies, a).qol);
  }

  // 分桶统计
  const bins = 10;
  const selfishBins = new Array(bins).fill(0);
  const veilBins = new Array(bins).fill(0);

  selfishQols.forEach(q => { selfishBins[Math.min(Math.floor(q / bins), bins - 1)]++; });
  veilQols.forEach(q => { veilBins[Math.min(Math.floor(q / bins), bins - 1)]++; });

  const labels = [];
  for (let i = 0; i < bins; i++) labels.push(`${i * 10}-${(i + 1) * 10}`);

  const canvas = $('compareChart');
  if (compareChart) compareChart.destroy();

  compareChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '知道身份时的规则',
          data: selfishBins,
          backgroundColor: 'rgba(244,67,54,0.5)',
          borderColor: 'rgba(244,67,54,0.8)',
          borderWidth: 1
        },
        {
          label: '无知之幕后的规则',
          data: veilBins,
          backgroundColor: 'rgba(76,175,80,0.5)',
          borderColor: 'rgba(76,175,80,0.8)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          title: { display: true, text: 'QoL 得分区间', color: 'rgba(255,255,255,0.5)' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: 'rgba(255,255,255,0.4)' }
        },
        y: {
          title: { display: true, text: '人数', color: 'rgba(255,255,255,0.5)' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: 'rgba(255,255,255,0.4)' }
        }
      }
    }
  });
}

function renderFairnessCompare() {
  const N = 500;
  const samples = [];
  for (let i = 0; i < N; i++) samples.push(Engine.generateAttributes());

  const selfishFairness = Engine.fairnessCoefficient(samples, selfishPolicies);
  const veilFairness = Engine.fairnessCoefficient(samples, veilPolicies);

  // 最差 10% 的平均 QoL
  const selfishQols = samples.map(s => Engine.calculate(selfishPolicies, s).qol).sort((a, b) => a - b);
  const veilQols = samples.map(s => Engine.calculate(veilPolicies, s).qol).sort((a, b) => a - b);
  const bottom10 = Math.floor(N * 0.1);
  const selfishBottom = Math.round(selfishQols.slice(0, bottom10).reduce((s, v) => s + v, 0) / bottom10);
  const veilBottom = Math.round(veilQols.slice(0, bottom10).reduce((s, v) => s + v, 0) / bottom10);

  const fairDiff = veilFairness - selfishFairness;
  const bottomDiff = veilBottom - selfishBottom;

  $('fairnessCompare').innerHTML = `
    <div class="fc-grid">
      <div class="fc-card">
        <div class="fc-label">公平系数</div>
        <div class="fc-row">
          <span class="fc-tag selfish">知道身份</span>
          <span class="fc-val">${selfishFairness}</span>
        </div>
        <div class="fc-row">
          <span class="fc-tag veil">无知之幕</span>
          <span class="fc-val">${veilFairness}</span>
        </div>
        <div class="fc-diff ${fairDiff >= 0 ? 'positive' : 'negative'}">
          ${fairDiff >= 0 ? '↑' : '↓'} ${Math.abs(fairDiff)} 分
        </div>
      </div>
      <div class="fc-card">
        <div class="fc-label">最差 10% 的平均 QoL</div>
        <div class="fc-row">
          <span class="fc-tag selfish">知道身份</span>
          <span class="fc-val">${selfishBottom}</span>
        </div>
        <div class="fc-row">
          <span class="fc-tag veil">无知之幕</span>
          <span class="fc-val">${veilBottom}</span>
        </div>
        <div class="fc-diff ${bottomDiff >= 0 ? 'positive' : 'negative'}">
          ${bottomDiff >= 0 ? '↑' : '↓'} ${Math.abs(bottomDiff)} 分
        </div>
      </div>
    </div>
    <p class="fc-explain">
      公平系数 = (1 - 基尼系数) × 100。越高越公平。<br>
      Rawls 的「差异原则」：好的规则应该让最差位置的人尽可能好。
    </p>
  `;
}

document.addEventListener('DOMContentLoaded', init);
