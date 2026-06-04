// ========== 直觉测试 ==========
const QUIZ_DATA = [
  {
    scenario: '刚到30级的铁甲战士，10000 血，30% 免伤。打副本前最后一个词条位：',
    hpLabel: '生命+5%', drLabel: '免伤+5%',
    hp: 10000, dr: 0.30, hpPct: 0.05, drFlat: 0.05,
    answer: 'dr',
    explain: '免伤+5% → EHP +7.69%，生命+5% → EHP +5.00%。免伤赢，多出 2.69 个百分点。',
    image: 'images/early-tank.jpg',
    role: '铁甲战士 · Lv.30'
  },
  {
    scenario: '治疗牧师，5000 血，10% 免伤。PVP 被刺客盯上，想多活一秒等队友支援：',
    hpLabel: '生命+5%', drLabel: '免伤+5%',
    hp: 5000, dr: 0.10, hpPct: 0.05, drFlat: 0.05,
    answer: 'dr',
    explain: '免伤+5% → EHP +5.88%，生命+5% → EHP +5.00%。虽然差距不大，但免伤依然略优——即使只有10%免伤，加法5%的边际收益也比乘法5%高。',
    image: 'images/priest.jpg',
    role: '神恩牧师 · 奶妈'
  },
  {
    scenario: '暗影盗贼，6000 血，45% 闪避（算作免伤）。要摸到 BOSS 背后：',
    hpLabel: '生命+5%', drLabel: '免伤+5%',
    hp: 6000, dr: 0.45, hpPct: 0.05, drFlat: 0.05,
    answer: 'dr',
    explain: '免伤+5% → EHP +10.0%，生命+5% → EHP +5.0%。45%免伤时差距已经翻倍，继续堆闪避/免伤的收益远超加血。',
    image: 'images/rogue.jpg',
    role: '暗影盗贼 · 刺客'
  },
  {
    scenario: '满配神圣骑士，40000 血，80% 免伤。毕业装最后一个词条怎么洗：',
    hpLabel: '生命+5%', drLabel: '免伤+5%',
    hp: 40000, dr: 0.80, hpPct: 0.05, drFlat: 0.05,
    answer: 'dr',
    explain: '免伤+5% → EHP +33.3%，生命+5% → EHP +5.0%。高免伤下免伤词条的优势是碾压级的——差了6.7倍。',
    image: 'images/endgame-paladin.jpg',
    role: '神圣骑士 · 满配'
  },
  {
    scenario: '蛮荒狂战士，8000 血，20% 免伤。装备只给两个选项（注意幅度不同）：',
    hpLabel: '生命+10%', drLabel: '免伤+3%',
    hp: 8000, dr: 0.20, hpPct: 0.10, drFlat: 0.03,
    answer: 'hp',
    explain: '生命+10% → EHP +10.0%，免伤+3% → EHP +3.9%。当生命词条幅度远大于免伤时，低免伤阶段加血反而更划算。这就是游戏设计两个词条的原因。',
    image: 'images/berserker.jpg',
    role: '狂战士 · 血牛流'
  }
];

let quizIdx = 0;
let quizAnswers = [];

function initQuiz() {
  quizIdx = 0;
  quizAnswers = [];
  showQuizQuestion();
}

function showQuizQuestion() {
  const q = QUIZ_DATA[quizIdx];
  document.getElementById('quizStep').textContent = `第 ${quizIdx + 1} 题 / 共 ${QUIZ_DATA.length} 题`;
  document.getElementById('quizBarFill').style.width = (quizIdx / QUIZ_DATA.length * 100) + '%';
  document.getElementById('quizScenario').innerHTML = `
    <div class="quiz-scene-layout">
      <div class="quiz-char-img">
        <img src="${q.image}" alt="${q.role}">
        <span class="quiz-char-role">${q.role}</span>
      </div>
      <div class="quiz-scene-text">
        <p>${q.scenario}</p>
        <div class="quiz-stats">
          <span class="stat-hp"><i class="ti ti-heart-filled"></i> ${q.hp.toLocaleString()}</span>
          <span class="stat-dr"><i class="ti ti-shield-filled"></i> ${(q.dr * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>`;
  document.getElementById('btnHPText').textContent = q.hpLabel;
  document.getElementById('btnDRText').textContent = q.drLabel;
  // reset button states
  document.querySelectorAll('.quiz-btn').forEach(b => {
    b.classList.remove('correct', 'wrong', 'disabled');
    b.disabled = false;
  });
}

function quizChoose(choice) {
  const q = QUIZ_DATA[quizIdx];
  const correct = choice === q.answer;
  quizAnswers.push({ choice, correct, q });

  // highlight buttons
  document.querySelectorAll('.quiz-btn').forEach(b => {
    b.disabled = true;
    b.classList.add('disabled');
  });
  const btnMap = { hp: document.getElementById('btnChoiceHP'), dr: document.getElementById('btnChoiceDR'), same: document.querySelector('.quiz-btn.same') };
  if (correct) {
    btnMap[choice].classList.add('correct');
    btnMap[choice].classList.remove('disabled');
  } else {
    btnMap[choice].classList.add('wrong');
    btnMap[choice].classList.remove('disabled');
    btnMap[q.answer].classList.add('correct');
    btnMap[q.answer].classList.remove('disabled');
  }

  setTimeout(() => {
    quizIdx++;
    if (quizIdx >= QUIZ_DATA.length) {
      showQuizResult();
    } else {
      showQuizQuestion();
    }
  }, 1200);
}

function showQuizResult() {
  document.getElementById('quizContainer').style.display = 'none';
  const resultEl = document.getElementById('quizResult');
  resultEl.style.display = '';

  const score = quizAnswers.filter(a => a.correct).length;
  const iconEl = document.getElementById('quizScoreIcon');
  const textEl = document.getElementById('quizScoreText');

  if (score === QUIZ_DATA.length) {
    iconEl.innerHTML = '<i class="ti ti-crown" style="color:#ffd700;font-size:3rem;"></i>';
    textEl.innerHTML = `<strong>全对！</strong>你已经有很好的数值直觉。下面用模拟器验证你的判断。`;
  } else if (score >= 3) {
    iconEl.innerHTML = '<i class="ti ti-bulb" style="color:#ffa726;font-size:3rem;"></i>';
    textEl.innerHTML = `对了 ${score}/${QUIZ_DATA.length}。有些场景的答案可能和直觉相反——下面模拟器会告诉你为什么。`;
  } else {
    iconEl.innerHTML = '<i class="ti ti-mood-puzzled" style="color:#ef5350;font-size:3rem;"></i>';
    textEl.innerHTML = `对了 ${score}/${QUIZ_DATA.length}。直觉在这种数学问题上经常翻车——看完模拟器你就懂了。`;
  }

  // 答案解析
  const answersEl = document.getElementById('quizAnswers');
  answersEl.innerHTML = quizAnswers.map((a, i) => {
    const icon = a.correct ? '<i class="ti ti-check" style="color:#66bb6a;"></i>' : '<i class="ti ti-x" style="color:#ef5350;"></i>';
    return `<div class="quiz-answer-row">${icon} <span class="quiz-answer-text">${a.q.explain}</span></div>`;
  }).join('');

  // 提交统计 + 加载全局数据
  submitQuizStats(score);
}


// ========== 后端统计 ==========
const API_BASE = 'https://numfeel-api.996.ninja/ehp-quiz';

function submitQuizStats(score) {
  const payload = {
    totalQuestions: QUIZ_DATA.length,
    correctCount: score,
    q1Correct: quizAnswers[0] ? quizAnswers[0].correct : false,
    q2Correct: quizAnswers[1] ? quizAnswers[1].correct : false,
    q3Correct: quizAnswers[2] ? quizAnswers[2].correct : false,
    q4Correct: quizAnswers[3] ? quizAnswers[3].correct : false,
    q5Correct: quizAnswers[4] ? quizAnswers[4].correct : false
  };

  fetch(API_BASE + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res.status === 200 && res.data) {
        renderCommunityStats(res.data);
      }
    })
    .catch(() => {
      // 静默失败，不影响用户体验
      loadStats();
    });
}

function loadStats() {
  fetch(API_BASE + '/stats')
    .then(r => r.json())
    .then(res => {
      if (res.status === 200 && res.data) {
        renderCommunityStats(res.data);
      }
    })
    .catch(() => {});
}

function renderCommunityStats(data) {
  const el = document.getElementById('communityStats');
  if (!el || data.totalSessions < 1) return;
  el.style.display = '';

  const qNames = ['铁甲战士', '神恩牧师', '暗影盗贼', '神圣骑士', '狂战士'];
  const rates = [data.q1CorrectRate, data.q2CorrectRate, data.q3CorrectRate, data.q4CorrectRate, data.q5CorrectRate];

  el.innerHTML = `
    <div class="community-header">
      <i class="ti ti-users-group"></i>
      <span>社区统计（共 ${data.totalSessions} 人参与）</span>
    </div>
    <div class="community-grid">
      <div class="community-stat">
        <div class="community-val">${data.avgCorrect}</div>
        <div class="community-lbl">平均答对</div>
      </div>
      <div class="community-stat">
        <div class="community-val">${data.allCorrectRate}%</div>
        <div class="community-lbl">全对率</div>
      </div>
    </div>
    <div class="community-bars">
      ${rates.map((r, i) => `
        <div class="community-bar-row">
          <span class="community-bar-label">${qNames[i]}</span>
          <div class="community-bar-outer">
            <div class="community-bar-fill" style="width:${r}%"></div>
          </div>
          <span class="community-bar-pct">${r}%</span>
        </div>
      `).join('')}
    </div>
    <div class="community-note">第5题（幅度不对称）正确率最低——大多数人以为免伤永远更优</div>
  `;
}

// ========== 进入模拟器 ==========
function startExplorer() {
  document.getElementById('explorerSection').style.display = '';
  document.getElementById('chartSection').style.display = '';
  document.getElementById('allocSection').style.display = '';
  document.getElementById('theorySection').style.display = '';
  document.getElementById('explorerSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  update();
}

// ========== DOM 引用 ==========
let gainChart = null;

// ========== 预设 ==========
function applyPreset(hp, dr, hpPct, drFlat) {
  document.getElementById('sliderHP').value = hp;
  document.getElementById('sliderDR').value = dr;
  document.getElementById('sliderHPPct').value = hpPct;
  document.getElementById('sliderDRFlat').value = drFlat;
  update();
  resetBars();
}

// ========== 主更新 ==========
function update() {
  const hp = parseInt(document.getElementById('sliderHP').value);
  const drPct = parseInt(document.getElementById('sliderDR').value);
  const dr = drPct / 100;
  const hpPct = parseInt(document.getElementById('sliderHPPct').value);
  const drFlat = parseInt(document.getElementById('sliderDRFlat').value);
  const hpAffixPct = hpPct / 100;
  const drAffixFlat = drFlat / 100;
  const slots = parseInt(document.getElementById('sliderSlots').value);

  // 显示控件值
  document.getElementById('valHP').textContent = hp.toLocaleString();
  document.getElementById('valDR').textContent = drPct + '%';
  document.getElementById('valHPPct').textContent = hpPct + '%';
  document.getElementById('valDRFlat').textContent = drFlat + '%';
  document.getElementById('valSlots').textContent = slots;

  // 计算 EHP
  const baseEHP = calcEHP(hp, dr);
  const hpEHP = calcEHP(hp * (1 + hpAffixPct), dr);
  const drEHP = calcEHP(hp, Math.min(dr + drAffixFlat, 0.99));

  const hpGain = hpEHP - baseEHP;
  const drGain = drEHP - baseEHP;
  const hpGainPctVal = ehpGainPct(baseEHP, hpEHP) * 100;
  const drGainPctVal = ehpGainPct(baseEHP, drEHP) * 100;

  // 填充结果卡片
  document.getElementById('resBase').textContent = fmt(baseEHP);
  document.getElementById('resHP').textContent = fmt(hpEHP);
  document.getElementById('resHPSub').textContent = '+' + fmt(hpGain) + '（+' + hpGainPctVal.toFixed(1) + '%）';
  document.getElementById('resDR').textContent = fmt(drEHP);
  document.getElementById('resDRSub').textContent = '+' + fmt(drGain) + '（+' + drGainPctVal.toFixed(1) + '%）';

  // 更新卡片 tag 文字
  document.querySelector('#cardHP .tag').textContent = '生命+' + hpPct + '%';
  document.querySelector('#cardDR .tag').textContent = '免伤+' + drFlat + '%';

  // 高亮胜出者
  document.getElementById('cardHP').classList.toggle('winner', hpGain > drGain);
  document.getElementById('cardDR').classList.toggle('winner', drGain > hpGain);

  // 临界点
  const crossDR = crossoverDR(hpAffixPct, drAffixFlat);
  const crossPctVal = (crossDR * 100).toFixed(1);
  const badgeEl = document.getElementById('crossoverBadge');
  if (crossDR <= 0) {
    document.getElementById('crossoverText').textContent = '临界免伤：不存在（当前幅度下免伤词条始终更优）';
    badgeEl.style.borderColor = 'rgba(66,165,245,0.5)';
  } else if (crossDR >= 0.99) {
    document.getElementById('crossoverText').textContent = '临界免伤：不存在（当前幅度下生命词条始终更优）';
    badgeEl.style.borderColor = 'rgba(102,187,106,0.5)';
  } else {
    document.getElementById('crossoverText').textContent = '临界免伤：' + crossPctVal + '%（低于选生命，高于选免伤）';
    badgeEl.style.borderColor = 'rgba(255,215,0,0.3)';
  }

  // 实时洞察
  const insightEl = document.getElementById('insightLiveText');
  if (Math.abs(hpGain - drGain) / baseEHP < 0.001) {
    insightEl.innerHTML = '当前免伤恰好在临界点附近，两个词条收益几乎相同。实际选择时看其他属性即可。';
  } else if (hpGain > drGain) {
    insightEl.innerHTML = `当前免伤 ${drPct}%，<strong>生命+${hpPct}%</strong> 带来更多 EHP（多 ${fmt(hpGain - drGain)}）。` +
      (crossDR > 0 && crossDR < 0.99 ? `免伤超过 ${crossPctVal}% 后免伤词条将反超。` : '');
  } else {
    insightEl.innerHTML = `当前免伤 ${drPct}%，<strong>免伤+${drFlat}%</strong> 带来更多 EHP（多 ${fmt(drGain - hpGain)}）。` +
      `免伤越高，这个优势越明显——从 ${drPct}% 加到 ${Math.min(drPct + drFlat, 99)}% 的边际收益是 +${drGainPctVal.toFixed(1)}%。`;
  }

  // 更新图表
  updateGainChart(hp, hpAffixPct, drAffixFlat);
  // 更新分配表
  updateAllocation(hp, dr, slots, hpAffixPct, drAffixFlat);
  // 更新伤害模拟的血条基数
  updateDamageSim(hp, dr, hpAffixPct, drAffixFlat);
}


// ========== 伤害模拟 ==========
let simHPMax = 10500, simDRMax = 10000;
let simHPCur = 10500, simDRCur = 10000;
let simDRReduction = 0.35; // 选免伤后的实际免伤
let simHPReduction = 0.30; // 选HP后的实际免伤（不变）
let totalDmgDealt = 0;

function updateDamageSim(hp, dr, hpAffixPct, drAffixFlat) {
  simHPMax = Math.round(hp * (1 + hpAffixPct));
  simDRMax = hp; // 选免伤时 HP 不变
  simHPReduction = dr;
  simDRReduction = Math.min(dr + drAffixFlat, 0.99);
  resetBars();
}

function resetBars() {
  simHPCur = simHPMax;
  simDRCur = simDRMax;
  totalDmgDealt = 0;
  renderBars();
  document.getElementById('damageInsight').textContent = '点击上面的攻击按钮，看看谁先倒下';
  document.getElementById('damageInsight').className = 'damage-insight';
}

function dealDamage(rawDmg) {
  if (simHPCur <= 0 && simDRCur <= 0) { resetBars(); return; }

  totalDmgDealt += rawDmg;

  // 选HP的角色：更多血，原始免伤
  const actualDmgHP = rawDmg * (1 - simHPReduction);
  simHPCur = Math.max(0, simHPCur - actualDmgHP);

  // 选DR的角色：原始血，更多免伤
  const actualDmgDR = rawDmg * (1 - simDRReduction);
  simDRCur = Math.max(0, simDRCur - actualDmgDR);

  renderBars();

  // 判定
  const insightEl = document.getElementById('damageInsight');
  if (simHPCur <= 0 && simDRCur <= 0) {
    insightEl.textContent = `同时阵亡！累计承受 ${totalDmgDealt.toLocaleString()} 原始伤害。`;
    insightEl.className = 'damage-insight draw';
  } else if (simHPCur <= 0) {
    insightEl.textContent = `生命+X% 先阵亡！免伤角色还剩 ${Math.round(simDRCur).toLocaleString()} 血。累计原始伤害 ${totalDmgDealt.toLocaleString()}。`;
    insightEl.className = 'damage-insight dr-wins';
  } else if (simDRCur <= 0) {
    insightEl.textContent = `免伤+X% 先阵亡！生命角色还剩 ${Math.round(simHPCur).toLocaleString()} 血。累计原始伤害 ${totalDmgDealt.toLocaleString()}。`;
    insightEl.className = 'damage-insight hp-wins';
  } else {
    const hpPctLeft = (simHPCur / simHPMax * 100).toFixed(0);
    const drPctLeft = (simDRCur / simDRMax * 100).toFixed(0);
    insightEl.textContent = `生命角色剩 ${hpPctLeft}%，免伤角色剩 ${drPctLeft}%。累计原始伤害 ${totalDmgDealt.toLocaleString()}。`;
    insightEl.className = 'damage-insight';
  }
}

function renderBars() {
  const hpPct = Math.max(0, simHPCur / simHPMax * 100);
  const drPct = Math.max(0, simDRCur / simDRMax * 100);
  document.getElementById('barHP').style.width = hpPct + '%';
  document.getElementById('barDR').style.width = drPct + '%';
  document.getElementById('barHPText').textContent = Math.round(simHPCur).toLocaleString() + ' / ' + simHPMax.toLocaleString();
  document.getElementById('barDRText').textContent = Math.round(simDRCur).toLocaleString() + ' / ' + simDRMax.toLocaleString();

  // color shift at low hp
  document.getElementById('barHP').style.background = hpPct < 25 ? 'linear-gradient(90deg,#ef5350,#e53935)' : '';
  document.getElementById('barDR').style.background = drPct < 25 ? 'linear-gradient(90deg,#ef5350,#e53935)' : '';
}


// ========== 增益曲线图 ==========
function updateGainChart(hp, hpAffixPct, drAffixFlat) {
  const data = generateComparisonData(hp, 0.90, 0.01, hpAffixPct, drAffixFlat);

  if (gainChart) { gainChart.destroy(); gainChart = null; }
  const ctx = document.getElementById('gainChart').getContext('2d');

  gainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: '生命+' + (hpAffixPct * 100).toFixed(0) + '%',
          data: data.hpGains.map(v => v * 100),
          borderColor: '#66bb6a',
          backgroundColor: 'rgba(102,187,106,0.08)',
          fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2.5
        },
        {
          label: '免伤+' + (drAffixFlat * 100).toFixed(0) + '%',
          data: data.drGains.map(v => v * 100),
          borderColor: '#42a5f5',
          backgroundColor: 'rgba(66,165,245,0.08)',
          fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#c0c0c0', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.dataset.label + '：EHP +' + ctx.raw.toFixed(2) + '%'
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '当前免伤', color: '#888' },
          ticks: { color: '#888', maxTicksLimit: 10, font: { size: 10 } },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: 'EHP 增益 (%)', color: '#888' },
          ticks: { color: '#888', font: { size: 10 }, callback: v => v.toFixed(0) + '%' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ========== 预算分配 ==========
function updateAllocation(hp, dr, slots, hpAffixPct, drAffixFlat) {
  const best = optimalAllocation(hp, dr, slots, hpAffixPct, drAffixFlat);
  const baseEHP = calcEHP(hp, dr);

  const hpWidth = (best.hpPoints / slots * 100).toFixed(1);
  const drWidth = (best.drPoints / slots * 100).toFixed(1);
  document.querySelector('#allocBar .hp-part').style.width = hpWidth + '%';
  document.querySelector('#allocBar .dr-part').style.width = drWidth + '%';

  const totalGainPct = ((best.ehp - baseEHP) / baseEHP * 100).toFixed(1);
  document.getElementById('allocText').innerHTML =
    `最优：<strong>${best.hpPoints}</strong> 个生命 + <strong>${best.drPoints}</strong> 个免伤 → EHP +${totalGainPct}%`;

  const tbody = document.getElementById('allocBody');
  tbody.innerHTML = '';
  for (let hpPts = 0; hpPts <= slots; hpPts++) {
    const drPts = slots - hpPts;
    const newHP = hp * (1 + hpAffixPct * hpPts);
    const newDR = Math.min(dr + drAffixFlat * drPts, 0.99);
    const ehp = calcEHP(newHP, newDR);
    const gain = ((ehp - baseEHP) / baseEHP * 100).toFixed(1);
    const isBest = hpPts === best.hpPoints;
    tbody.innerHTML += `<tr>
      <td>${isBest ? '⭐' : ''} ${hpPts}HP + ${drPts}DR</td>
      <td>${hpPts}</td>
      <td>${drPts}</td>
      <td class="${isBest ? 'highlight' : ''}">${fmt(ehp)}</td>
      <td class="${isBest ? 'highlight' : ''}">+${gain}%</td>
    </tr>`;
  }
}

// ========== 工具函数 ==========
function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return Math.round(n).toLocaleString();
}

// ========== 初始化 ==========
function initApp() {
  // 绑定滑块事件
  ['sliderHP', 'sliderDR', 'sliderHPPct', 'sliderDRFlat', 'sliderSlots'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', update);
  });
  // 启动直觉测试
  initQuiz();
}

initApp();
