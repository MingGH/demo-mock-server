/**
 * 主逻辑：揭露面板、热力图渲染、用户画像推断、回放
 */

let tracker;
let report;

// 页面加载时启动追踪
document.addEventListener('DOMContentLoaded', () => {
  const fakePage = document.getElementById('fakePage');
  tracker = new BehaviorTracker(fakePage);
});

// ─── 揭露 ───
function revealTracking() {
  report = tracker.getReport();
  tracker.destroy();

  // 隐藏揭露按钮
  document.querySelector('.reveal-section').style.display = 'none';
  // 隐藏通知条
  document.getElementById('noticeBar').style.display = 'none';

  // 显示结果面板
  const panel = document.getElementById('resultPanel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderStats();
  renderHeatmap();
  renderTimeline();
  renderProfile();
  prepareReplay();
}

// ─── 统计概览 ───
function renderStats() {
  document.getElementById('statDuration').textContent = report.duration + 's';
  document.getElementById('statMouseDist').textContent = formatDist(report.totalMouseDist);
  document.getElementById('statClicks').textContent = report.clickCount;
  document.getElementById('statScrollDepth').textContent = report.scrollDepth + '%';
  document.getElementById('statHovers').textContent = report.hoverZoneCount;
  document.getElementById('statSpeed').textContent = report.avgSpeed + ' px/s';
}

function formatDist(px) {
  if (px > 10000) return (px / 1000).toFixed(1) + 'k px';
  return Math.round(px) + ' px';
}

// ─── 热力图 ───
function renderHeatmap() {
  const canvas = document.getElementById('heatmapCanvas');
  const container = document.getElementById('heatmapContainer');
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const w = rect.width;
  const h = rect.height;

  // 将鼠标位置映射到 canvas 坐标
  const fakePage = document.getElementById('fakePage');
  const fpRect = fakePage.getBoundingClientRect();
  const scaleX = w / fpRect.width;
  const fpHeight = fakePage.scrollHeight;
  const scaleY = h / fpHeight;

  // 画每个点的热力
  const points = report.mousePositions;
  if (points.length === 0) {
    ctx.fillStyle = '#a0aec0';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('未检测到鼠标移动数据', w / 2, h / 2);
    return;
  }

  // 创建热力图
  const radius = 20;
  points.forEach(p => {
    const cx = p.x * scaleX;
    const cy = p.y * scaleY;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(255, 100, 50, 0.08)');
    gradient.addColorStop(1, 'rgba(255, 100, 50, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  });

  // 点击点用亮色标记
  report.clicks.forEach(c => {
    const cx = c.x * scaleX;
    const cy = c.y * scaleY;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// ─── 时间线 ───
function renderTimeline() {
  const container = document.getElementById('timeline');
  const events = report.events.slice(0, 50); // 最多显示50条

  container.innerHTML = events.map(ev => {
    const time = formatTime(ev.t);
    const iconClass = ev.type;
    const icons = {
      click: 'ti-pointer',
      scroll: 'ti-arrows-vertical',
      hover: 'ti-eye',
      idle: 'ti-clock-pause'
    };
    const icon = icons[ev.type] || 'ti-point';
    return `
      <div class="timeline-item">
        <span class="timeline-time">${time}</span>
        <span class="timeline-icon ${iconClass}"><i class="ti ${icon}"></i></span>
        <span class="timeline-text">${ev.desc}</span>
      </div>
    `;
  }).join('');
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ─── 用户画像推断 ───
function renderProfile() {
  const tags = inferTags();
  const tagsContainer = document.getElementById('profileTags');
  const detailContainer = document.getElementById('profileDetail');

  tagsContainer.innerHTML = tags.map(tag =>
    `<span class="profile-tag ${tag.level}">${tag.label}</span>`
  ).join('');

  detailContainer.innerHTML = generateProfileDetail(tags);
}

function inferTags() {
  const tags = [];
  const zones = report.hoverZones;
  const priceTime = zones['价格区域'] || 0;
  const reviewTime = zones['评价区域'] || 0;
  const specTime = zones['规格区域'] || 0;
  const btnTime = zones['按钮区域'] || 0;
  const titleTime = zones['标题区域'] || 0;

  // 价格敏感度
  if (priceTime > 2000) {
    tags.push({ label: '价格敏感型', level: 'high', reason: `在价格区域停留了 ${(priceTime/1000).toFixed(1)}s` });
  } else if (priceTime > 500) {
    tags.push({ label: '价格关注', level: 'medium', reason: `在价格区域停留了 ${(priceTime/1000).toFixed(1)}s` });
  }

  // 评价依赖
  if (reviewTime > 3000) {
    tags.push({ label: '评价驱动型决策', level: 'high', reason: `在评价区域停留了 ${(reviewTime/1000).toFixed(1)}s` });
  } else if (reviewTime > 1000) {
    tags.push({ label: '参考评价', level: 'medium', reason: `在评价区域停留了 ${(reviewTime/1000).toFixed(1)}s` });
  }

  // 参数党
  if (specTime > 2000) {
    tags.push({ label: '参数研究型', level: 'high', reason: `在规格区域停留了 ${(specTime/1000).toFixed(1)}s` });
  }

  // 犹豫/果断
  const hasClickBuy = report.clicks.some(c => c.target === '立即购买');
  const hasClickCart = report.clicks.some(c => c.target === '加入购物车');
  if (hasClickBuy) {
    tags.push({ label: '冲动购买倾向', level: 'high', reason: '点击了「立即购买」按钮' });
  } else if (hasClickCart) {
    tags.push({ label: '购物车囤货型', level: 'medium', reason: '点击了「加入购物车」但没有直接购买' });
  } else if (report.duration > 30 && !hasClickBuy && !hasClickCart) {
    tags.push({ label: '犹豫型/仅浏览', level: 'low', reason: `浏览了 ${report.duration}s 但没有任何购买动作` });
  }

  // 浏览深度
  if (report.scrollDepth > 80) {
    tags.push({ label: '深度浏览者', level: 'medium', reason: `滚动到了页面 ${report.scrollDepth}% 的深度` });
  } else if (report.scrollDepth < 30) {
    tags.push({ label: '浅层浏览', level: 'low', reason: `仅滚动到 ${report.scrollDepth}%，可能对商品兴趣不大` });
  }

  // 交互活跃度
  if (report.clickCount > 5) {
    tags.push({ label: '高活跃用户', level: 'medium', reason: `产生了 ${report.clickCount} 次点击` });
  }

  // 鼠标速度 -> 浏览模式
  if (report.avgSpeed > 800) {
    tags.push({ label: '快速扫描型', level: 'low', reason: `平均鼠标速度 ${report.avgSpeed} px/s，倾向快速浏览` });
  } else if (report.avgSpeed > 0 && report.avgSpeed < 300) {
    tags.push({ label: '仔细阅读型', level: 'medium', reason: `平均鼠标速度 ${report.avgSpeed} px/s，倾向细读` });
  }

  // 收藏行为
  const hasFav = report.clicks.some(c => c.target === '收藏');
  if (hasFav) {
    tags.push({ label: '收藏待购', level: 'medium', reason: '点击了收藏按钮，可能在等降价' });
  }

  // 默认至少给一个标签
  if (tags.length === 0) {
    tags.push({ label: '新访客', level: 'low', reason: '行为数据较少，暂无法准确画像' });
  }

  return tags;
}

function generateProfileDetail(tags) {
  let html = '<p><strong>广告系统会这样解读你的行为：</strong></p><ul>';
  tags.forEach(tag => {
    html += `<li><strong>${tag.label}</strong> — ${tag.reason}</li>`;
  });
  html += '</ul>';

  // 广告策略推荐
  html += '<p style="margin-top:12px;"><strong>推荐的广告投放策略：</strong></p>';

  const hasPrice = tags.some(t => t.label.includes('价格'));
  const hasHesitate = tags.some(t => t.label.includes('犹豫'));
  const hasImpulse = tags.some(t => t.label.includes('冲动'));
  const hasCart = tags.some(t => t.label.includes('购物车'));

  if (hasPrice && hasHesitate) {
    html += '<p>→ 48小时后推送「限时降价」通知，触发紧迫感 + 价格敏感双重心理</p>';
  } else if (hasImpulse) {
    html += '<p>→ 立刻推送同类商品的「买一送一」活动，趁热度做关联销售</p>';
  } else if (hasCart) {
    html += '<p>→ 24小时后推送「购物车商品即将涨价」提醒，制造损失厌恶</p>';
  } else {
    html += '<p>→ 三天后用「浏览过的商品降价了」再营销广告把你拉回来</p>';
  }

  return html;
}

// ─── 操作路径回放 ───
let replayTimer = null;

function prepareReplay() {
  const canvas = document.getElementById('replayCanvas');
  const container = document.getElementById('replayContainer');
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
}

function startReplay() {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }

  const canvas = document.getElementById('replayCanvas');
  const container = document.getElementById('replayContainer');
  const rect = container.getBoundingClientRect();
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const w = rect.width;
  const h = rect.height;

  const fakePage = document.getElementById('fakePage');
  const fpRect = fakePage.getBoundingClientRect();
  const scaleX = w / fpRect.width;
  const fpHeight = fakePage.scrollHeight;
  const scaleY = h / fpHeight;

  const positions = report.mousePositions;
  if (positions.length === 0) return;

  const totalTime = positions[positions.length - 1].t;
  let idx = 0;
  const trail = [];
  const maxTrail = 30;

  const timeEl = document.getElementById('replayTime');
  const btn = document.getElementById('replayBtn');
  btn.innerHTML = '<i class="ti ti-player-stop"></i> 停止';

  replayTimer = setInterval(() => {
    if (idx >= positions.length) {
      clearInterval(replayTimer);
      replayTimer = null;
      btn.innerHTML = '<i class="ti ti-player-play"></i> 回放';
      return;
    }

    const p = positions[idx];
    const cx = p.x * scaleX;
    const cy = p.y * scaleY;
    trail.push({ x: cx, y: cy });
    if (trail.length > maxTrail) trail.shift();

    // 清除
    ctx.clearRect(0, 0, w, h);

    // 画轨迹
    if (trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 画当前光标
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 检查是否有点击发生在这个时间附近
    report.clicks.forEach(c => {
      if (Math.abs(c.t - p.t) < 200) {
        const clx = c.x * scaleX;
        const cly = c.y * scaleY;
        ctx.beginPath();
        ctx.arc(clx, cly, 14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(229, 62, 62, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#fc8181';
        ctx.fillText('CLICK', clx + 16, cly + 4);
      }
    });

    timeEl.textContent = formatTime(p.t);
    idx++;
  }, 30);
}

// 暴露到全局
window.revealTracking = revealTracking;
window.startReplay = startReplay;
