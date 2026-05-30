// ===== 秒杀抢票模拟器 v1 =====
const API_BASE = 'https://numfeel-api.996.ninja';

// 场景预设
const SCENARIOS = [
  { label: '热门演唱会', n: 2000, m: 100, mean: 150, std: 60, min: 20, max: 800,
    desc: '2000人抢100张票，像张惠妹/周杰伦的场次' },
  { label: '春运火车票', n: 5000, m: 300, mean: 180, std: 80, min: 20, max: 1000,
    desc: '5000人抢300张票，春运高峰某车次的真实比例' },
  { label: 'iPhone 首发', n: 10000, m: 500, mean: 160, std: 70, min: 20, max: 900,
    desc: '10000人抢500台首发，苹果官网的日常' },
  { label: '限量球鞋', n: 5000, m: 50, mean: 150, std: 60, min: 20, max: 800,
    desc: '5000人抢50双限量款，Bot 和真人的混战' },
  { label: '茅台预约', n: 10000, m: 200, mean: 170, std: 75, min: 20, max: 950,
    desc: '10000人抢200瓶，真正的万人抢茅' },
  { label: '自定义', n: 1000, m: 100, mean: 150, std: 60, min: 20, max: 800,
    desc: '自己调参数玩玩看' }
];

// Canvas
const CW = 1000, CH = 300;
let canvas, ctx;
let currentScenario = SCENARIOS[0];
let lastResult = null;
let animating = false;

// 全局统计
let globalStats = null;

function $(id) { return document.getElementById(id); }

// ===== 初始化 =====
function init() {
  canvas = $('raceCanvas');
  canvas.width = CW;
  canvas.height = CH;
  ctx = canvas.getContext('2d');

  bindEvents();
  selectScenario(0);
  drawEmptyTrack();
  loadGlobalStats();
}

function bindEvents() {
  $('runBtn').addEventListener('click', runSimulation);
  $('batchBtn').addEventListener('click', runBatch);
  $('scenario').addEventListener('change', function() {
    selectScenario(parseInt(this.value));
  });
  // 自定义参数联动
  ['custN', 'custM', 'custMean', 'custStd'].forEach(id => {
    $(id).addEventListener('input', onCustomChange);
  });
}

function selectScenario(idx) {
  currentScenario = SCENARIOS[idx];
  $('scenarioDesc').textContent = currentScenario.desc;
  if (idx === 5) {
    $('customParams').style.display = 'flex';
    $('custN').value = currentScenario.n;
    $('custM').value = currentScenario.m;
    $('custMean').value = currentScenario.mean;
    $('custStd').value = currentScenario.std;
    $('scenarioN').textContent = currentScenario.n;
    $('scenarioM').textContent = currentScenario.m;
  } else {
    $('customParams').style.display = 'none';
    $('scenarioN').textContent = currentScenario.n;
    $('scenarioM').textContent = currentScenario.m;
  }
}

function onCustomChange() {
  currentScenario.n = parseInt($('custN').value) || 1000;
  currentScenario.m = parseInt($('custM').value) || 100;
  currentScenario.mean = parseInt($('custMean').value) || 150;
  currentScenario.std = parseInt($('custStd').value) || 60;
  $('scenarioN').textContent = currentScenario.n;
  $('scenarioM').textContent = currentScenario.m;
  drawEmptyTrack();
  hideResult();
}

// ===== 运行模拟 =====
function runSimulation() {
  if (animating) return;
  const s = currentScenario;
  lastResult = Engine.simulate(s.n, s.m, s.mean, s.std, s.min, s.max);
  hideResult();
  animateRace(lastResult, () => {
    showResult(lastResult);
    submitStats(lastResult);
  });
}

function runBatch() {
  if (animating) return;
  const s = currentScenario;
  const runs = Math.min(parseInt($('batchRuns').value) || 100, 10000);
  
  // 显示运行中状态
  const btn = $('batchBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('running');
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation: spin 1s linear infinite;"></i> 模拟中...';
  
  // 添加 spin 动画（如果没有）
  if (!document.getElementById('spinStyle')) {
    const style = document.createElement('style');
    style.id = 'spinStyle';
    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  
  // 用 setTimeout 让 UI 先更新
  setTimeout(() => {
    const batchResult = Engine.batchSimulate(s.n, s.m, s.mean, s.std, s.min, s.max, runs);
    showBatchResult(batchResult);
    
    // 恢复按钮状态
    btn.disabled = false;
    btn.classList.remove('running');
    btn.innerHTML = originalText;
  }, 50);
}

// ===== 动画 =====
function animateRace(result, onDone) {
  animating = true;
  $('runBtn').disabled = true;
  $('batchBtn').disabled = true;

  const { participants, sortedIndices, allLatencies, winners } = result;
  const margin = 40;
  const trackLen = CW - margin * 2;
  const dotR = participants > 2000 ? 1.5 : participants > 1000 ? 2 : 3;
  const maxLatency = Math.max(...allLatencies);
  const minLatency = Math.min(...allLatencies);
  const userIdx = result.userIndex;

  const startTime = performance.now();
  const duration = 2500; // 动画持续 2.5 秒
  // 将延迟映射到到达时间：低延迟先到，映射到动画的 20%-100% 时间段
  const animMin = 0.15;
  const animMax = 0.92;

  function frame() {
    const elapsed = (performance.now() - startTime) / duration;
    if (elapsed >= 1) {
      // 最终帧
      renderRaceFrame(result, 1, animMin, animMax, dotR, margin, trackLen, maxLatency, minLatency);
      animating = false;
      $('runBtn').disabled = false;
      $('batchBtn').disabled = false;
      if (onDone) onDone();
      return;
    }
    renderRaceFrame(result, elapsed, animMin, animMax, dotR, margin, trackLen, maxLatency, minLatency);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function renderRaceFrame(result, progress, animMin, animMax, dotR, margin, trackLen, maxLat, minLat) {
  const { participants, sortedIndices, allLatencies, winners, userIndex, stock } = result;
  ctx.clearRect(0, 0, CW, CH);

  // 背景
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, CW, CH);

  // 轨道线
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let y = 30; y < CH - 30; y += 20) {
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(CW - margin, y);
    ctx.stroke();
  }

  // 起点线
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, 10);
  ctx.lineTo(margin, CH - 10);
  ctx.stroke();

  // 终点线
  ctx.strokeStyle = 'rgba(76, 175, 80, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(CW - margin, 10);
  ctx.lineTo(CW - margin, CH - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // 标签
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('你点击「抢」', margin, 22);
  ctx.textAlign = 'center';
  ctx.fillText('服务器收到请求', CW - margin, 22);

  // 限制标签
  ctx.fillStyle = 'rgba(76, 175, 80, 0.5)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`限额: ${stock}`, CW - margin - 4, 28);

  // 计算每个点的位置
  const latencyRange = maxLat - minLat || 1;
  const totalDots = participants;
  // 采样显示（太多点看不清楚）
  const maxDots = 600;
  const step = Math.max(1, Math.floor(totalDots / maxDots));
  const yStart = 40;
  const yEnd = CH - 20;
  const yRange = yEnd - yStart;

  for (let i = 0; i < totalDots; i += step) {
    const idx = sortedIndices[i];
    const lat = allLatencies[idx];
    const normalizedLat = latencyRange > 0 ? (lat - minLat) / latencyRange : 0.5;
    const arrivalProgress = animMin + normalizedLat * (animMax - animMin);
    const x = margin + arrivalProgress * trackLen;

    // 如果还未到达，显示当前位置
    let displayX;
    if (progress >= arrivalProgress) {
      displayX = margin + arrivalProgress * trackLen;
    } else {
      // 还在路途中
      const travelStart = Math.max(0, arrivalProgress - 0.3);
      const travelFrac = Math.max(0, Math.min(1, (progress - travelStart) / 0.3));
      displayX = margin + travelFrac * arrivalProgress * trackLen;
    }

    const y = yStart + ((i % maxDots) / maxDots) * yRange;

    const isUser = idx === userIndex;
    const isWinner = winners.has(idx);
    const arrived = progress >= arrivalProgress;

    // 绘制点
    if (isUser) {
      // 用户：金色，稍大
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(displayX, y, dotR + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (arrived) {
      // 已到达：根据是否获胜着色
      ctx.fillStyle = isWinner ? 'rgba(76, 175, 80, 0.7)' : 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(displayX, y, dotR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 还在路上
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(displayX, y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 进度指示
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`进度 ${Math.round(progress * 100)}%`, 10, CH - 8);
}

function drawEmptyTrack() {
  if (!ctx) return;
  ctx.clearRect(0, 0, CW, CH);
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, CW, CH);

  const margin = 40;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let y = 30; y < CH - 30; y += 20) {
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(CW - margin, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, 10);
  ctx.lineTo(margin, CH - 10);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(76, 175, 80, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(CW - margin, 10);
  ctx.lineTo(CW - margin, CH - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('你点击「抢」', margin, 22);
  ctx.fillText('服务器收到请求', CW - margin, 22);

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '14px sans-serif';
  ctx.fillText('点击「开始抢票」看发生了什么', CW / 2, CH / 2);
}

// ===== 结果显示 =====
function showResult(result) {
  const { participants, stock, userRank, userWon, userLatency, cutoffLatency, latencyGap } = result;
  $('resultSection').style.display = '';
  $('resultIcon').innerHTML = userWon ? '<i class="ti ti-check"></i>' : '<i class="ti ti-x"></i>';
  $('resultTitle').textContent = userWon ? '恭喜！你抢到了！' : '没抢到';
  $('resultTitle').style.color = userWon ? '#4caf50' : '#f44336';
  $('resultRank').textContent = `第 ${userRank} / ${participants} 名到达`;
  $('resultLatency').textContent = `你的延迟: ${userLatency}ms`;
  $('resultCutoff').textContent = `最后一名抢到的延迟: ${cutoffLatency}ms`;
  $('resultGap').textContent = latencyGap > 0 ? `你慢了 ${latencyGap}ms` : `你比最后一名快 ${Math.abs(latencyGap)}ms，但...`;

  const gapNote = $('gapNote');
  if (userWon) {
    gapNote.textContent = `在 ${participants} 人中排第 ${userRank}，你成功了——但下次呢？点「连抢 100 次」看看运气`;
  } else if (userRank <= stock) {
    gapNote.textContent = '你的延迟其实不错，但排序出了意外。等待时间悖论在起作用。';
  } else {
    const behind = userRank - stock;
    gapNote.textContent = `你前面有 ${behind} 个人的延迟比你低。在网络面前，0.1 秒的差距就是几千名。`;
  }
}

function showBatchResult(batch) {
  $('batchSection').style.display = '';
  $('batchResult').innerHTML = `
    <div class="batch-card">
      <div class="batch-stat">
        <span class="batch-label">模拟次数</span>
        <span class="batch-value">${batch.totalRuns}</span>
      </div>
      <div class="batch-stat">
        <span class="batch-label">抢到次数</span>
        <span class="batch-value" style="color:${batch.winRate > 50 ? '#4caf50' : '#ff9800'}">${batch.wins}</span>
      </div>
      <div class="batch-stat">
        <span class="batch-label">胜率</span>
        <span class="batch-value" style="color:${batch.winRate > 50 ? '#4caf50' : '#ff9800'}">${batch.winRate}%</span>
      </div>
      <div class="batch-stat">
        <span class="batch-label">平均排名</span>
        <span class="batch-value">第 ${batch.avgPosition} 名</span>
      </div>
    </div>
    <p class="batch-note">
      ${batch.winRate > 50 ? '运气不错。' : '这才是常态。'}理论期望胜率是 ${Math.round((currentScenario.m / currentScenario.n) * 1000) / 10}%，你的实际胜率是 ${batch.winRate}%。多跑几次会更接近理论值。
    </p>
  `;
}

function hideResult() {
  $('resultSection').style.display = 'none';
  $('batchSection').style.display = 'none';
}

// ===== 后端提交 =====
function submitStats(result) {
  const body = {
    participants: result.participants,
    stock: result.stock,
    userWon: result.userWon,
    userRank: result.userRank,
    userLatency: result.userLatency,
    latencyGap: result.latencyGap
  };
  fetch(API_BASE + '/seckill/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json()).then(data => {
    if (data.status === 200) {
      updateGlobalStats(data.data);
    }
  }).catch(() => {});
}

function loadGlobalStats() {
  fetch(API_BASE + '/seckill/stats')
    .then(r => r.json())
    .then(data => {
      if (data.status === 200) {
        updateGlobalStats(data.data);
      }
    }).catch(() => {});
}

function updateGlobalStats(data) {
  globalStats = data;
  if (!data || data.totalRuns === 0) {
    $('globalTotal').textContent = '--';
    $('globalWins').textContent = '--';
    $('globalRate').textContent = '--';
    return;
  }
  $('globalTotal').textContent = data.totalRuns.toLocaleString();
  $('globalWins').textContent = data.totalWins.toLocaleString();
  $('globalRate').textContent = (Math.round(data.winRate * 10) / 10) + '%';
}

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', init);
