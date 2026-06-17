// ========== QRLjacking 演示 — 交互逻辑 ==========

const API = 'https://numfeel-api.996.ninja/qr-hijack';
let currentToken = null;
let pollTimer = null;
let countdownTimer = null;
let remainSeconds = 120;

// ── 火眼金睛挑战状态 ──
let challengeRound = 0;
let challengeScore = 0;
let challengeQuestions = [];

// ========== 实战体验 ==========

function generateSession() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 生成中…';

  fetch(API + '/session', { method: 'POST' })
    .then(r => r.json())
    .then(res => {
      if (res.status !== 200) {
        alert('创建失败：' + (res.message || '服务暂时不可用'));
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-qrcode"></i> 生成登录码';
        return;
      }
      currentToken = res.data.token;
      remainSeconds = res.data.ttlSeconds || 120;

      // 显示二维码
      renderQR(currentToken);
      document.getElementById('qrArea').style.display = 'flex';
      document.getElementById('tokenDisplay').textContent = currentToken;
      document.getElementById('qrStatus').textContent = '等待扫码…';
      document.getElementById('qrStatus').className = 'qr-status';
      document.getElementById('qrOverlay').className = 'qr-overlay';

      // 解锁 step2
      activateStep('step1', 'done');
      activateStep('step2', 'active');
      document.getElementById('mockScanBtn').disabled = false;

      // 开始轮询
      startPolling();
      startCountdown();

      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-refresh"></i> 重新生成';
    })
    .catch((err) => {
      alert('网络错误，请稍后重试：' + (err.message || err));
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-qrcode"></i> 生成登录码';
    });
}

function renderQR(token) {
  const canvas = document.getElementById('qrCanvas');
  const scanUrl = 'https://numfeel.996.ninja/pages/qr-hijack/confirm.html?token=' + token;
  new QRious({ element: canvas, value: scanUrl, size: 160, backgroundAlpha: 1, foreground: '#1a1a2e', background: '#ffffff' });
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!currentToken) return;
    fetch(API + '/session/' + currentToken)
      .then(r => r.json())
      .then(res => {
        if (res.status !== 200) return;
        const data = res.data;
        if (data.status === 'scanned') {
          onHijacked(data.scannedBy);
        } else if (data.status === 'expired') {
          onExpired();
        }
      })
      .catch(() => {});
  }, 1500);
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  const timerEl = document.getElementById('qrTimer');
  countdownTimer = setInterval(() => {
    remainSeconds--;
    if (remainSeconds <= 0) {
      onExpired();
      return;
    }
    timerEl.textContent = '有效期：' + remainSeconds + ' 秒';
  }, 1000);
}

function stopTimers() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

function onHijacked(device) {
  stopTimers();
  // 更新 QR 区域
  document.getElementById('qrStatus').textContent = '已被劫持！';
  document.getElementById('qrStatus').className = 'qr-status scanned';
  document.getElementById('qrOverlay').className = 'qr-overlay scanned';
  document.getElementById('qrOverlay').innerHTML = '<i class="ti ti-check"></i>';

  // 解锁 step3
  activateStep('step2', 'done');
  activateStep('step3', 'active');

  // 渲染劫持结果
  document.getElementById('resultBody').innerHTML = `
    <div class="hijack-alert">
      <div class="alert-icon"><i class="ti ti-alert-octagon"></i></div>
      <div class="alert-title">你的「账号」已被劫持</div>
      <div class="alert-body">
        刚才你扫码确认的那一瞬间，攻击者的浏览器就完成了登录。<br>
        整个过程你没输密码、没收验证码，双因素认证完全失效。<br><br>
        <strong>在真实场景中：</strong>攻击者会把这个码伪装成「连接 WiFi」「领优惠券」「扫码签到」，
        而你毫无防备地扫了。
      </div>
      <div class="alert-device"><i class="ti ti-device-mobile"></i> 扫码设备：${escHtml(device || 'Unknown')}</div>
    </div>
  `;

  // 刷新统计
  loadStats();
}

function onExpired() {
  stopTimers();
  document.getElementById('qrStatus').textContent = '已过期';
  document.getElementById('qrTimer').textContent = '请重新生成';
  document.getElementById('mockScanBtn').disabled = true;
}

function mockScan() {
  if (!currentToken) return;
  const btn = document.getElementById('mockScanBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 扫码中…';

  fetch(API + '/scan/' + currentToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(r => r.json())
    .then(res => {
      if (res.status === 200 && res.data.success) {
        onHijacked(res.data.device || '本机模拟');
      } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-device-mobile"></i> 模拟扫码';
        alert(res.data ? res.data.message : '扫码失败');
      }
    })
    .catch(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-mobile"></i> 模拟扫码';
      alert('网络错误');
    });
}

// ========== 火眼金睛挑战 ==========

function initChallenge() {
  challengeRound = 0;
  challengeScore = 0;
  challengeQuestions = shuffleArray(CHALLENGE_QUESTIONS).slice(0, 5);
  renderChallenge();
}

function renderChallenge() {
  if (challengeRound >= challengeQuestions.length) {
    showChallengeFinal();
    return;
  }
  const q = challengeQuestions[challengeRound];
  document.getElementById('challengeNum').textContent = challengeRound + 1;
  document.getElementById('challengeResult').style.display = 'none';
  document.getElementById('challengeFinal').style.display = 'none';

  // 随机排列左右位置
  const leftIsSafe = Math.random() > 0.5;
  const leftUrl = leftIsSafe ? q.safe : q.danger;
  const rightUrl = leftIsSafe ? q.danger : q.safe;

  const grid = document.getElementById('challengeGrid');
  grid.innerHTML = `
    <div class="challenge-card" id="cardA" onclick="pickChallenge('A')">
      <div class="card-qr"><canvas id="cqrA"></canvas></div>
      <div class="card-label">二维码 A</div>
    </div>
    <div class="challenge-card" id="cardB" onclick="pickChallenge('B')">
      <div class="card-qr"><canvas id="cqrB"></canvas></div>
      <div class="card-label">二维码 B</div>
    </div>
  `;

  // 生成二维码
  new QRious({ element: document.getElementById('cqrA'), value: leftUrl, size: 124, foreground: '#1a1a2e', background: '#ffffff' });
  new QRious({ element: document.getElementById('cqrB'), value: rightUrl, size: 124, foreground: '#1a1a2e', background: '#ffffff' });

  // 存储答案
  grid.dataset.safeIs = leftIsSafe ? 'A' : 'B';
  grid.dataset.leftUrl = leftUrl;
  grid.dataset.rightUrl = rightUrl;
}

function pickChallenge(choice) {
  const grid = document.getElementById('challengeGrid');
  const safeIs = grid.dataset.safeIs;
  const correct = choice === safeIs;
  const q = challengeQuestions[challengeRound];

  if (correct) challengeScore++;

  // 高亮卡片
  const safeCard = document.getElementById('card' + safeIs);
  const dangerCard = document.getElementById('card' + (safeIs === 'A' ? 'B' : 'A'));
  safeCard.classList.add('selected-safe');
  dangerCard.classList.add('selected-danger');

  // 禁用点击
  document.querySelectorAll('.challenge-card').forEach(c => c.style.pointerEvents = 'none');

  // 显示结果
  const resultEl = document.getElementById('challengeResult');
  resultEl.style.display = 'block';
  resultEl.className = 'challenge-result ' + (correct ? 'correct' : 'wrong');
  resultEl.innerHTML = `
    <strong>${correct ? '✓ 答对了！' : '✗ 选错了…'}</strong><br>
    <strong>攻击手法：</strong>${q.tactic}<br>
    <strong>安全 URL：</strong><code style="color:#81c784;font-size:0.82rem;">${escHtml(q.safe)}</code><br>
    <strong>钓鱼 URL：</strong><code style="color:#ff6b6b;font-size:0.82rem;">${escHtml(q.danger)}</code><br>
    <span style="color:#a0a0a0;font-size:0.85rem;">${q.explain}</span>
    <div style="text-align:center;margin-top:12px;">
      <button class="btn btn-primary btn-sm" onclick="nextChallenge()">
        <i class="ti ti-arrow-right"></i> ${challengeRound < challengeQuestions.length - 1 ? '下一题' : '查看结果'}
      </button>
    </div>
  `;

  challengeRound++;
}

function nextChallenge() {
  renderChallenge();
}

function showChallengeFinal() {
  const total = challengeQuestions.length;
  const pct = Math.round(challengeScore / total * 100);
  let grade, comment;
  if (pct === 100) { grade = '火眼金睛'; comment = '全部答对！你对钓鱼域名的敏感度很高。'; }
  else if (pct >= 60) { grade = '初具慧眼'; comment = '大部分能识别，但仍有漏洞。记住：二维码扫完后一定要检查完整域名。'; }
  else { grade = '需要警惕'; comment = '二维码的外观无法反映内容的安全性。这就是为什么「扫码前不看 URL」非常危险。'; }

  document.getElementById('challengeGrid').innerHTML = '';
  document.getElementById('challengeResult').style.display = 'none';
  document.getElementById('challengeRound').style.display = 'none';
  document.getElementById('challengeFinal').style.display = 'block';
  document.getElementById('challengeFinal').innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      <div class="stat-card"><div class="val">${challengeScore}/${total}</div><div class="lbl">答对</div></div>
      <div class="stat-card"><div class="val">${pct}%</div><div class="lbl">正确率</div></div>
      <div class="stat-card"><div class="val">${grade}</div><div class="lbl">评级</div></div>
    </div>
    <div class="insight-box ${pct >= 60 ? 'green' : 'red'}">
      <h3><i class="ti ti-bulb"></i> 结论</h3>
      <p>${comment}<br><br><strong>关键教训：</strong>两个二维码的黑白点阵看起来完全随机，人眼不可能从外观判断内容是否安全。唯一的防线是扫码后仔细检查 URL。</p>
    </div>
    <div style="text-align:center;margin-top:14px;">
      <button class="btn btn-secondary" onclick="resetChallenge()"><i class="ti ti-refresh"></i> 再来一轮</button>
    </div>
  `;
}

function resetChallenge() {
  document.getElementById('challengeRound').style.display = '';
  document.getElementById('challengeFinal').style.display = 'none';
  initChallenge();
}

// ========== Payload 展览馆 ==========

function initPayloads() {
  const grid = document.getElementById('payloadGrid');
  grid.innerHTML = PAYLOAD_TYPES.map(p => `
    <div class="payload-card" id="payload-${p.id}" onclick="showPayload('${p.id}')">
      <div class="p-icon"><i class="ti ${p.icon}"></i></div>
      <div class="p-title">${p.title}</div>
      <span class="p-risk ${p.risk}">${p.risk === 'high' ? '高危' : p.risk === 'medium' ? '中危' : '低危'}</span>
    </div>
  `).join('');
}

function showPayload(id) {
  const p = PAYLOAD_TYPES.find(x => x.id === id);
  if (!p) return;

  // 高亮选中卡片
  document.querySelectorAll('.payload-card').forEach(c => c.classList.remove('active'));
  document.getElementById('payload-' + id).classList.add('active');

  const detail = document.getElementById('payloadDetail');
  detail.style.display = 'block';
  detail.innerHTML = `
    <h4><i class="ti ${p.icon}"></i> ${p.title}</h4>
    <p>${p.desc}</p>
    <div class="payload-code">${escHtml(p.example)}</div>
    <p><strong>攻击流程：</strong>${p.howItWorks}</p>
    <div class="payload-qr-demo">
      <div class="pqr"><canvas id="payloadQrCanvas"></canvas></div>
      <div style="font-size:0.82rem;color:#666;">
        <i class="ti ti-arrow-left"></i> 这就是编码了上述内容的真实二维码。<br>
        从外观上，你能看出它包含什么内容吗？
      </div>
    </div>
  `;

  // 生成 payload 对应的二维码
  new QRious({ element: document.getElementById('payloadQrCanvas'), value: p.example, size: 108, foreground: '#1a1a2e', background: '#ffffff' });

  // 滚动到详情
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========== 全站统计 ==========

function loadStats() {
  fetch(API + '/stats')
    .then(r => r.json())
    .then(res => {
      if (res.status !== 200) return;
      const d = res.data;
      document.getElementById('statTotal').textContent = d.totalSessions || 0;
      document.getElementById('statScanned').textContent = d.scannedCount || 0;
      document.getElementById('statRate').textContent = (d.hijackRate || 0) + '%';
    })
    .catch(() => {});
}

// ========== 工具函数 ==========

function activateStep(stepId, state) {
  const el = document.getElementById(stepId);
  el.classList.remove('locked', 'active', 'done');
  el.classList.add(state);
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ========== 初始化 ==========

(function init() {
  // step1 默认可用
  activateStep('step1', 'active');

  // 初始化挑战
  initChallenge();

  // 初始化 Payload 展览
  initPayloads();

  // 加载全站统计
  loadStats();
})();
