/**
 * copy-protection/app.js
 * 页面交互逻辑
 */

(function () {
  const { TECHNIQUES, assessProtectionLevel, bypassDifficulty, simulateBattle, REAL_WORLD_CASES, buildObfuscationMap, obfuscateText } = window.CopyProtectionEngine;

  /* ── Tab 切换 ── */
  window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector(`[onclick="switchTab('${tabId}')"]`).classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
  };

  /* ══════════ 实验一：防护技术展示 ══════════ */
  const demoArea = document.getElementById('demoArea');
  const demoText = '这段文字用来测试防复制效果。尝试选中、右键、Ctrl+C，看看哪些操作被拦截了。如果你能把这段话完整粘贴到别处，说明防护已被你绕过。';
  let activeDefenses = [];

  function renderTechCards() {
    const grid = document.getElementById('techGrid');
    grid.innerHTML = TECHNIQUES.map(t => `
      <div class="tech-card" id="card-${t.id}">
        <div class="tech-header">
          <span class="tech-name">${t.name}</span>
          <span class="diff-badge diff-${t.difficulty}">难度 ${t.difficulty}</span>
        </div>
        <p class="tech-desc">${t.desc}</p>
        <div class="tech-eff">
          <span>有效性</span>
          <div class="eff-bar"><div class="eff-fill" style="width:${t.effectiveness}%;background:${t.effectiveness > 50 ? '#66bb6a' : t.effectiveness > 30 ? '#ffd700' : '#ef5350'}"></div></div>
          <span>${t.effectiveness}%</span>
        </div>
        <button class="btn btn-sm btn-secondary toggle-btn" onclick="toggleDefense('${t.id}')">
          <i class="ti ti-shield-plus"></i> 启用
        </button>
      </div>
    `).join('');
  }

  window.toggleDefense = function (id) {
    const idx = activeDefenses.indexOf(id);
    if (idx > -1) {
      activeDefenses.splice(idx, 1);
    } else {
      activeDefenses.push(id);
    }
    applyDefenses();
    updateProtectionMeter();
  };

  function applyDefenses() {
    // 重置
    demoArea.style.userSelect = '';
    demoArea.style.webkitUserSelect = '';
    demoArea.classList.remove('has-overlay');
    const overlay = demoArea.querySelector('.demo-overlay');
    if (overlay) overlay.remove();

    // 更新卡片样式
    TECHNIQUES.forEach(t => {
      const card = document.getElementById('card-' + t.id);
      const btn = card.querySelector('.toggle-btn');
      if (activeDefenses.includes(t.id)) {
        card.classList.add('active');
        btn.innerHTML = '<i class="ti ti-shield-check"></i> 已启用';
        btn.classList.add('btn-active');
      } else {
        card.classList.remove('active');
        btn.innerHTML = '<i class="ti ti-shield-plus"></i> 启用';
        btn.classList.remove('btn-active');
      }
    });

    // 应用防护
    if (activeDefenses.includes('css-user-select')) {
      demoArea.style.userSelect = 'none';
      demoArea.style.webkitUserSelect = 'none';
    }
    if (activeDefenses.includes('css-overlay')) {
      demoArea.classList.add('has-overlay');
      const div = document.createElement('div');
      div.className = 'demo-overlay';
      demoArea.appendChild(div);
    }
    if (activeDefenses.includes('canvas-render')) {
      renderCanvas();
    } else {
      const c = demoArea.querySelector('canvas');
      if (c) c.remove();
      demoArea.querySelector('.demo-text').style.display = '';
    }
    if (activeDefenses.includes('svg-text')) {
      renderSvg();
    } else {
      const s = demoArea.querySelector('svg');
      if (s) s.remove();
    }

    // Reset font obfuscation
    var ftEl = demoArea.querySelector('.demo-text');
    if (ftEl && ftEl.classList.contains('font-obfuscated')) {
      ftEl.textContent = ftEl.getAttribute('data-display') || demoText;
      ftEl.removeAttribute('data-display');
      ftEl.classList.remove('font-obfuscated');
    }

    // Apply font obfuscation (skip if canvas-render is active — text is hidden anyway)
    if (activeDefenses.includes('font-obfuscation') && !activeDefenses.includes('canvas-render')) {
      renderFontObfuscated();
    }
  }

  function renderCanvas() {
    let canvas = demoArea.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = demoArea.offsetWidth - 40;
      canvas.height = 80;
      canvas.style.display = 'block';
      canvas.style.margin = '10px 0';
      demoArea.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '14px -apple-system, sans-serif';
    wrapText(ctx, demoText, 10, 20, canvas.width - 20, 20);
    demoArea.querySelector('.demo-text').style.display = 'none';
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    let line = '';
    for (let i = 0; i < text.length; i++) {
      const testLine = line + text[i];
      if (ctx.measureText(testLine).width > maxWidth) {
        ctx.fillText(line, x, y);
        line = text[i];
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }

  function renderSvg() {
    let svg = demoArea.querySelector('svg');
    if (svg) svg.remove();
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '60');
    svg.style.display = 'block';
    svg.style.margin = '10px 0';
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', '10');
    textEl.setAttribute('y', '25');
    textEl.setAttribute('fill', '#e8e8e8');
    textEl.setAttribute('font-size', '14');
    textEl.textContent = demoText.slice(0, 40) + '...';
    svg.appendChild(textEl);
    demoArea.appendChild(svg);
  }

  function renderFontObfuscated() {
    var textEl = demoArea.querySelector('.demo-text');
    if (!textEl) return;
    var map = buildObfuscationMap(demoText);
    var garbled = obfuscateText(demoText, map);
    textEl.setAttribute('data-display', demoText);
    textEl.textContent = garbled;
    textEl.classList.add('font-obfuscated');
    logAction('字体混淆已启用：显示正常，复制得到乱码');
  }

  function updateProtectionMeter() {
    const enabled = TECHNIQUES.filter(t => activeDefenses.includes(t.id));
    const assessment = assessProtectionLevel(enabled);
    document.getElementById('meterFill').style.width = assessment.level + '%';
    document.getElementById('meterFill').style.background = assessment.color;
    document.getElementById('meterLabel').textContent = assessment.label;
    document.getElementById('meterLabel').style.color = assessment.color;
    document.getElementById('meterScore').textContent = assessment.level;
  }

  /* ── 事件监听（动态添加/移除） ── */
  function copyHandler(e) {
    if (activeDefenses.includes('js-copy-event') || activeDefenses.includes('js-clipboard-replace')) {
      e.preventDefault();
      if (activeDefenses.includes('js-clipboard-replace')) {
        const text = window.getSelection().toString();
        e.clipboardData.setData('text/plain', text + '\n\n——来源：防复制演示页 禁止转载');
      }
      logAction('copy 事件被拦截');
    } else if (activeDefenses.includes('font-obfuscation')) {
      logAction('字体混淆：复制内容为编码后的字符，粘贴后将显示乱码');
    }
  }
  function contextmenuHandler(e) {
    if (activeDefenses.includes('js-contextmenu')) {
      e.preventDefault();
      logAction('右键菜单被拦截');
    }
  }

  demoArea.addEventListener('copy', copyHandler);
  demoArea.addEventListener('contextmenu', contextmenuHandler);

  /* ── 操作日志 ── */
  const logArea = document.getElementById('actionLog');
  let logEntries = [];

  function logAction(msg) {
    const time = new Date().toLocaleTimeString();
    logEntries.unshift({ time, msg });
    if (logEntries.length > 20) logEntries.pop();
    renderLog();
  }

  function renderLog() {
    if (logEntries.length === 0) {
      logArea.innerHTML = '<div style="color:#546e7a;text-align:center;padding:16px;">启用防护后尝试复制，这里会记录拦截事件</div>';
      return;
    }
    logArea.innerHTML = logEntries.map(e =>
      `<div class="log-entry"><span class="log-time">${e.time}</span><span class="log-msg">${e.msg}</span></div>`
    ).join('');
  }

  /* ══════════ 实验二：攻防模拟 ══════════ */
  window.runBattle = function () {
    const level = parseInt(document.getElementById('attackerLevel').value);
    const defenses = activeDefenses.length > 0
      ? TECHNIQUES.filter(t => activeDefenses.includes(t.id))
      : TECHNIQUES.slice(0, 3); // 默认用前三个
    const result = simulateBattle(defenses, level);

    const resultArea = document.getElementById('battleResult');
    resultArea.style.display = 'block';

    const levelNames = ['', '普通用户', '前端初学者', '前端开发者', '安全研究员', '专业爬虫'];
    let html = `<div class="battle-header">
      <span class="attacker-badge"><i class="ti ti-user"></i> ${levelNames[level]}</span>
      <span>vs</span>
      <span class="defender-badge"><i class="ti ti-shield"></i> ${defenses.length} 项防护</span>
    </div>`;

    html += '<div class="battle-timeline">';
    for (const r of result.results) {
      html += `<div class="battle-step ${r.bypassed ? 'bypassed' : 'blocked'}">
        <span class="step-icon">${r.bypassed ? '<i class="ti ti-lock-open"></i>' : '<i class="ti ti-lock"></i>'}</span>
        <span class="step-name">${r.technique}</span>
        <span class="step-result">${r.bypassed ? `${r.timeSeconds}秒内绕过` : '无法绕过'}</span>
      </div>`;
    }
    html += '</div>';

    if (result.allBypassed) {
      html += `<div class="battle-conclusion fail">
        <i class="ti ti-alert-triangle"></i> 全部防护被突破，总耗时约 ${result.totalTime} 秒
      </div>`;
    } else {
      html += `<div class="battle-conclusion success">
        <i class="ti ti-shield-check"></i> 攻击者未能突破所有防护
      </div>`;
    }

    resultArea.innerHTML = html;
  };

  /* ══════════ 实验三：真实网站案例 ══════════ */
  function renderRealCases() {
    const container = document.getElementById('realCases');
    container.innerHTML = REAL_WORLD_CASES.map(c => {
      const techs = c.techniques.map(tid => {
        const t = TECHNIQUES.find(x => x.id === tid);
        return t ? `<span class="case-tech">${t.name}</span>` : '';
      }).join('');
      return `<div class="case-card">
        <div class="case-site">${c.site}</div>
        <div class="case-techs">${techs}</div>
        <div class="case-note">${c.note}</div>
      </div>`;
    }).join('');
  }

  /* ══════════ 初始化 ══════════ */
  renderTechCards();
  updateProtectionMeter();
  renderLog();
  renderRealCases();
})();
