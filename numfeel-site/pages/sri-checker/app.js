// ========== SRI 安全检测器 ==========
const API = 'https://numfeel-api.996.ninja/sri/check';
let currentData = null;
let donutChart = null;

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', () => {
  // 预设按钮绑定
  document.querySelectorAll('#presetSites button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('urlInput').value = btn.dataset.url;
      startCheck();
    });
  });

  // 回车触发检测
  document.getElementById('urlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') startCheck();
  });
});

// ── 核心检测逻辑 ──
async function startCheck() {
  const input = document.getElementById('urlInput');
  let url = input.value.trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
    input.value = url;
  }

  // UI 状态
  toggleSection('loadingSection', true);
  toggleSection('summarySection', false);
  toggleSection('resourceSection', false);
  toggleSection('attackSection', false);
  toggleSection('fixSection', false);
  document.getElementById('checkBtn').disabled = true;

  try {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const json = await resp.json();

    if (json.status !== 200) {
      throw new Error(json.message || '检测失败');
    }

    currentData = json.data;
    renderResults(currentData);
  } catch (err) {
    alert('检测失败: ' + err.message);
  } finally {
    toggleSection('loadingSection', false);
    document.getElementById('checkBtn').disabled = false;
  }
}

// ── 渲染结果 ──
function renderResults(data) {
  const { summary, resources } = data;

  // 摘要卡片
  document.getElementById('totalCount').textContent = summary.total;
  document.getElementById('thirdPartyCount').textContent = summary.thirdParty;
  document.getElementById('protectedCount').textContent = summary.protected;
  document.getElementById('unprotectedCount').textContent = summary.unprotected;

  // 甜甜圈图
  renderDonut(summary);

  // 资源列表
  renderResourceTable(resources);

  // 显示面板
  toggleSection('summarySection', true);
  toggleSection('resourceSection', true);

  // 如果有未保护资源，显示修复建议
  const unprotected = resources.filter(r => r.thirdParty && !r.hasSri);
  if (unprotected.length > 0) {
    renderFixSuggestion(unprotected[0]);
    toggleSection('fixSection', true);
  }
}

// ── 甜甜圈图 ──
function renderDonut(summary) {
  const ctx = document.getElementById('donutChart').getContext('2d');
  if (donutChart) donutChart.destroy();

  const protectedCount = summary.protected;
  const unprotectedCount = summary.unprotected;
  const firstParty = summary.total - summary.thirdParty;

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['有 SRI 保护', '无保护（危险）', '同域资源'],
      datasets: [{
        data: [protectedCount, unprotectedCount, firstParty],
        backgroundColor: [
          'rgba(129, 199, 132, 0.8)',
          'rgba(255, 107, 107, 0.8)',
          'rgba(136, 136, 136, 0.4)'
        ],
        borderColor: [
          'rgba(129, 199, 132, 1)',
          'rgba(255, 107, 107, 1)',
          'rgba(136, 136, 136, 0.6)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#ccc', font: { size: 12 } }
        }
      }
    }
  });
}

// ── 资源列表 ──
function renderResourceTable(resources) {
  const tbody = document.getElementById('resourceTableBody');
  tbody.innerHTML = '';

  resources.forEach((res, idx) => {
    const tr = document.createElement('tr');
    if (!res.thirdParty) {
      tr.className = 'first-party';
    } else if (res.hasSri) {
      tr.className = 'protected';
    } else {
      tr.className = 'unprotected';
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => showAttackSimulation(res));
    }

    const tagIcon = res.tag === 'script' ? 'ti-file-code' : 'ti-palette';
    const sriStatus = !res.thirdParty ? 'na' : (res.hasSri ? 'yes' : 'no');
    const sriText = !res.thirdParty ? '同域' : (res.hasSri ? '有' : '无');

    tr.innerHTML = `
      <td><i class="ti ${tagIcon}"></i> ${res.tag}</td>
      <td class="src-cell" title="${escapeHtml(res.src)}">${escapeHtml(shortenUrl(res.src))}</td>
      <td>${res.thirdParty ? '是' : '否'}</td>
      <td><span class="sri-badge ${sriStatus}">${sriText}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ── 攻击模拟 ──
function showAttackSimulation(resource) {
  toggleSection('attackSection', true);

  document.getElementById('attackTarget').textContent =
    `目标文件: ${shortenUrl(resource.src)}`;

  const steps = getAttackSteps(resource);
  const list = document.getElementById('attackSteps');
  list.innerHTML = '';

  steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="step-num">Step ${i + 1}</span>${step}`;
    list.appendChild(li);
    // 逐步动画
    setTimeout(() => li.classList.add('visible'), (i + 1) * 400);
  });

  // 滚动到攻击面板
  document.getElementById('attackSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function getAttackSteps(resource) {
  if (resource.tag === 'script') {
    return [
      '攻击者入侵 CDN 服务器或利用供应链漏洞，篡改目标 JS 文件',
      '用户访问你的网站，浏览器从 CDN 加载被篡改的脚本——因为没有 SRI，浏览器无法识别篡改',
      '恶意脚本在用户浏览器中执行，拥有和你自己的代码完全相同的权限',
      '注入键盘记录器：监听所有 input 事件，实时上报用户输入（密码、信用卡号）',
      '窃取 Cookie / LocalStorage / SessionToken，发送到攻击者服务器',
      '修改页面 DOM：插入虚假登录框、支付页面，实施钓鱼',
      '所有经过你网站的用户都受影响，直到你发现问题为止'
    ];
  } else {
    return [
      '攻击者篡改 CDN 上的 CSS 文件',
      '浏览器加载恶意 CSS——没有 SRI 则无校验直接应用',
      '利用 CSS 覆盖关键元素：隐藏安全警告、移动按钮位置实施点击劫持',
      '通过 CSS content + 外部 url() 泄露页面内容',
      '注入虚假 UI 元素诱导用户操作（如"账号异常，请重新登录"）'
    ];
  }
}

// ── 修复建议 ──
function renderFixSuggestion(resource) {
  const tag = resource.tag === 'script' ? 'script' : 'link';
  let fixHtml;

  if (tag === 'script') {
    fixHtml = `&lt;script src="${escapeHtml(resource.src)}"
        integrity="sha384-{用 openssl 生成的哈希值}"
        crossorigin="anonymous"&gt;&lt;/script&gt;`;
  } else {
    fixHtml = `&lt;link rel="stylesheet"
      href="${escapeHtml(resource.src)}"
      integrity="sha384-{用 openssl 生成的哈希值}"
      crossorigin="anonymous"&gt;`;
  }

  document.getElementById('fixPre').innerHTML = fixHtml;
}

function copyFix() {
  const pre = document.getElementById('fixPre');
  const text = pre.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '已复制';
    setTimeout(() => btn.textContent = '复制', 2000);
  });
}

// ── 工具函数 ──
function toggleSection(id, show) {
  const el = document.getElementById(id);
  if (show) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30
      ? '...' + u.pathname.slice(-27)
      : u.pathname;
    return u.host + path;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + '...' : url;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shortenUrl, escapeHtml, getAttackSteps };
}
