// ========== 全局状态 ==========
let piDigits = ''; // 从外部加载的 π 小数位
let piLoaded = false;
let searchChart = null;
let occurrenceChart = null;
let searchHistory = [];

// ========== 初始化 ==========
function initApp() {
  // 检查 pi-1m.js 是否加载
  if (typeof PI_1M !== 'undefined') {
    piDigits = PI_1M;
    piLoaded = true;
    document.getElementById('piStatus').textContent = '已加载 100 万位';
    document.getElementById('piStatus').style.color = '#81c784';
  } else {
    document.getElementById('piStatus').textContent = '加载失败，功能受限';
    document.getElementById('piStatus').style.color = '#ff6b6b';
  }
}

// ========== 快速场景预设 ==========
function fillScenario(type) {
  const input = document.getElementById('searchInput');
  switch (type) {
    case 'password':
      input.value = String(Math.floor(Math.random() * 900000) + 100000);
      break;
    case 'birthday':
      input.value = '19900314';
      break;
    case 'phone':
      input.value = '13800';
      break;
    case 'lottery':
      input.value = String(Math.floor(Math.random() * 90000) + 10000);
      break;
    case 'pi-self':
      input.value = '31415926';
      break;
    case 'id-last4':
      input.value = String(Math.floor(Math.random() * 9000) + 1000);
      break;
  }
  input.focus();
}

// ========== 主搜索功能 ==========
function doSearch() {
  const input = document.getElementById('searchInput');
  const raw = input.value.trim();

  if (!raw) { alert('请输入要搜索的数字序列'); return; }
  if (!/^\d+$/.test(raw)) { alert('请只输入数字（0-9）'); return; }
  if (raw.length > 12) { alert('序列长度不能超过12位'); return; }
  if (!piLoaded) { alert('π 数据未加载，请刷新页面'); return; }

  // 显示进度
  const progress = document.getElementById('searchProgress');
  progress.classList.add('active');
  const bar = progress.querySelector('.bar');
  bar.style.width = '30%';

  setTimeout(() => {
    bar.style.width = '80%';
    const position = searchInPiDecimal(piDigits, raw);
    bar.style.width = '100%';

    setTimeout(() => {
      progress.classList.remove('active');
      bar.style.width = '0%';
      displayResult(raw, position);
    }, 300);
  }, 200);
}

// ========== 显示搜索结果 ==========
function displayResult(sequence, position) {
  const box = document.getElementById('resultBox');
  box.classList.add('show');

  const found = position > 0;

  // 状态图标
  document.getElementById('resultIcon').className = 'result-status ' + (found ? 'found' : 'notfound');
  document.getElementById('resultIcon').innerHTML = found
    ? '<i class="ti ti-check"></i>'
    : '<i class="ti ti-x"></i>';

  // 标题
  document.getElementById('resultTitle').textContent = found
    ? `找到了！出现在第 ${position.toLocaleString()} 位`
    : `在前100万位中未找到`;
  document.getElementById('resultSubtitle').textContent = found
    ? `序列 "${sequence}" 首次出现的位置`
    : `需要更多位数的 π（已计算105万亿位中几乎必然存在）`;

  // 上下文高亮
  const highlightEl = document.getElementById('resultHighlight');
  if (found && position <= piDigits.length) {
    const start = Math.max(0, position - 21);
    const end = Math.min(piDigits.length, position + sequence.length + 19);
    const before = piDigits.slice(start, position - 1);
    const match = piDigits.slice(position - 1, position - 1 + sequence.length);
    const after = piDigits.slice(position - 1 + sequence.length, end);
    highlightEl.innerHTML =
      `<span class="prefix">π = 3.</span>...` +
      `${before}<span class="match">${match}</span>${after}...`;
    highlightEl.style.display = 'block';
  } else {
    highlightEl.style.display = 'none';
  }

  // 统计卡片
  const luck = found ? evaluateLuck(position, sequence.length) : null;
  const prob = probabilityOfFinding(1000000, sequence.length);
  const expectedPos = expectedPosition(sequence.length);
  const occInMillion = expectedOccurrences(1000000, sequence.length);

  const statsEl = document.getElementById('resultStats');
  statsEl.innerHTML = `
    <div class="stat-item">
      <div class="val">${sequence.length}</div>
      <div class="lbl">序列长度</div>
    </div>
    <div class="stat-item">
      <div class="val blue">${formatLargeNumber(expectedPos)}</div>
      <div class="lbl">期望位置</div>
    </div>
    <div class="stat-item">
      <div class="val green">${(prob * 100).toFixed(1)}%</div>
      <div class="lbl">100万位找到概率</div>
    </div>
    <div class="stat-item">
      <div class="val">${occInMillion >= 1 ? '~' + Math.round(occInMillion) + '次' : '<1次'}</div>
      <div class="lbl">100万位期望出现</div>
    </div>
    ${found ? `<div class="stat-item">
      <div class="val" style="color: ${luck.ratio < 1 ? '#81c784' : '#ffb74d'};">${luck.luck}</div>
      <div class="lbl">运气评价（${luck.percentile}% 分位）</div>
    </div>` : ''}
  `;

  // 记录历史
  searchHistory.push({ sequence, position, length: sequence.length, found, timestamp: Date.now() });

  // 滚动到结果
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ========== πfs 模拟：存储 + 读取完整流程 ==========
let pifsStoredMeta = null; // 存储后的元数据，供读取使用

function runPifsStore() {
  const text = document.getElementById('pifsInput').value.trim() || 'Hello';
  if (text.length > 30) { alert('演示文本不要超过30个字符'); return; }

  const bytes = stringToBytes(text);
  const container = document.getElementById('pifsStoreOutput');

  // 存储过程
  let html = `<div class="pifs-line"><span class="cmd">$ echo "${text}" | pifs --store</span></div>`;
  html += `<div class="pifs-line"><span class="comment"># 步骤1: 将文本转为 UTF-8 字节流（${bytes.length} 字节）</span></div>`;
  html += `<div class="pifs-line"><span class="comment"># 步骤2: 逐字节在 π 的十进制表示中查找位置...</span></div>`;
  html += `<div class="pifs-line"></div>`;

  // 逐字节查找
  const metadata = [];
  bytes.forEach((b, i) => {
    const hex = b.toString(16).padStart(2, '0').toUpperCase();
    const char = b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
    const decStr = b.toString().padStart(3, '0');
    const pos = searchInPiDecimal(piDigits, decStr);
    metadata.push({ byte: b, hex, char, decStr, position: pos, length: 3 });
    html += `<div class="pifs-line"><span class="output">  字节[${i}] = 0x${hex} ('${char}') → 搜索 "${decStr}" → π 的第 ${pos > 0 ? pos.toLocaleString() : '?'} 位</span></div>`;
  });

  html += `<div class="pifs-line"></div>`;
  html += `<div class="pifs-line"><span class="comment"># 步骤3: 删除原始数据，只保留偏移量元数据</span></div>`;
  html += `<div class="pifs-line" style="color: #81c784;">✓ 存储完成！原始文件已从硬盘「删除」</span></div>`;
  html += `<div class="pifs-line"><span class="cmd">$</span> <span class="pifs-typing">_</span></div>`;

  container.innerHTML = html;
  container.style.display = 'block';

  // 保存元数据
  pifsStoredMeta = { text, bytes, metadata };

  // 显示元数据文件
  const metaSection = document.getElementById('pifsMetaSection');
  metaSection.style.display = 'block';
  const metaJson = JSON.stringify(metadata.map(m => ({ offset: m.position, len: m.length })));
  document.getElementById('pifsMetaContent').textContent = metaJson;

  // 启用读取按钮
  document.getElementById('pifsReadBtn').disabled = false;

  // 隐藏读取输出（重新存储时清空）
  document.getElementById('pifsReadOutput').style.display = 'none';

  // 统计
  const totalMetadata = metaJson.length; // 元数据实际 JSON 大小
  const origSize = bytes.length;
  document.getElementById('pifsStats').style.display = '';
  document.getElementById('pifsOrigSize').textContent = origSize + ' 字节';
  document.getElementById('pifsMetaSize').textContent = totalMetadata + ' 字节';
  document.getElementById('pifsRatio').textContent = Math.round(totalMetadata / origSize * 100) + '%';
  document.getElementById('pifsVerify').textContent = '-';
}

function runPifsRead() {
  if (!pifsStoredMeta) { alert('请先存储内容'); return; }

  const { metadata } = pifsStoredMeta;
  const container = document.getElementById('pifsReadOutput');

  let html = `<div class="pifs-line"><span class="cmd">$ pifs --read myfile.txt</span></div>`;
  html += `<div class="pifs-line"><span class="comment"># 步骤1: 读取元数据文件（偏移量列表）</span></div>`;
  html += `<div class="pifs-line"><span class="comment"># 步骤2: 从 π 中按偏移量逐字节还原...</span></div>`;
  html += `<div class="pifs-line"></div>`;

  // 逐字节还原
  const recovered = [];
  metadata.forEach((m, i) => {
    // 从 π 的指定位置读取 3 位数字
    const extracted = piDigits.slice(m.position - 1, m.position - 1 + m.length);
    const byteVal = parseInt(extracted, 10);
    const char = byteVal >= 32 && byteVal < 127 ? String.fromCharCode(byteVal) : '.';
    recovered.push(byteVal);
    html += `<div class="pifs-line"><span class="output">  π[${m.position.toLocaleString()}..${(m.position + m.length - 1).toLocaleString()}] = "${extracted}" → 字节 ${byteVal} ('${char}')</span></div>`;
  });

  // 还原文本
  const decoder = new TextDecoder();
  const recoveredText = decoder.decode(new Uint8Array(recovered));
  const match = recoveredText === pifsStoredMeta.text;

  html += `<div class="pifs-line"></div>`;
  html += `<div class="pifs-line"><span class="comment"># 步骤3: 拼接字节流，解码为文本</span></div>`;
  html += `<div class="pifs-line" style="color: ${match ? '#81c784' : '#ff6b6b'};">`;
  html += match
    ? `✓ 还原成功: "${recoveredText}"`
    : `✗ 还原失败: "${recoveredText}" (期望: "${pifsStoredMeta.text}")`;
  html += `</div>`;
  html += `<div class="pifs-line"><span class="cmd">$</span> <span class="pifs-typing">_</span></div>`;

  container.innerHTML = html;
  container.style.display = 'block';

  // 更新验证状态
  document.getElementById('pifsVerify').textContent = match ? '完美还原 ✓' : '还原失败 ✗';
  document.getElementById('pifsVerify').style.color = match ? '#81c784' : '#ff6b6b';

  // 滚动到读取结果
  container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ========== 期望位置图表 ==========
function drawExpectedChart() {
  if (searchChart) { searchChart.destroy(); searchChart = null; }
  const ctx = document.getElementById('expectedChart').getContext('2d');

  const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const probs = lengths.map(k => probabilityOfFinding(1000000, k) * 100);
  const expected = lengths.map(k => expectedPosition(k));

  searchChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: lengths.map(k => k + '位'),
      datasets: [{
        label: '100万位内找到的概率(%)',
        data: probs,
        backgroundColor: probs.map(p => p > 90 ? 'rgba(129,199,132,0.7)' : p > 50 ? 'rgba(255,215,0,0.7)' : 'rgba(255,107,107,0.7)'),
        borderColor: probs.map(p => p > 90 ? '#81c784' : p > 50 ? '#ffd700' : '#ff6b6b'),
        borderWidth: 1, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => `期望位置: 第 ${formatLargeNumber(expected[ctx.dataIndex])} 位`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#888' }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: '#888', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ========== 不同类型数据的出现次数 ==========
function drawOccurrenceChart() {
  if (occurrenceChart) { occurrenceChart.destroy(); occurrenceChart = null; }
  const ctx = document.getElementById('occurrenceChart').getContext('2d');

  // 105万亿位数据（来自2024年的计算记录）
  const piKnown = 105e12;
  const types = [
    { label: '4位密码', k: 4 },
    { label: '6位密码', k: 6 },
    { label: '8位日期', k: 8 },
    { label: '11位手机号', k: 11 },
    { label: '18位身份证', k: 18 },
  ];

  const occurrences = types.map(t => expectedOccurrences(piKnown, t.k));

  occurrenceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: types.map(t => t.label),
      datasets: [{
        label: '在已知π中的期望出现次数',
        data: occurrences.map(o => Math.log10(Math.max(o, 1e-10))),
        backgroundColor: [
          'rgba(129,199,132,0.7)',
          'rgba(255,215,0,0.7)',
          'rgba(144,202,249,0.7)',
          'rgba(206,147,216,0.7)',
          'rgba(255,107,107,0.7)',
        ],
        borderWidth: 1, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const real = occurrences[ctx.dataIndex];
              return real >= 1 ? `约 ${formatLargeNumber(Math.round(real))} 次` : `约 ${real.toExponential(1)} 次（极难找到）`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#888', callback: v => '10^' + v },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: '出现次数（对数尺度）', color: '#888' }
        },
        y: { ticks: { color: '#888' }, grid: { display: false } }
      }
    }
  });
}

// ========== 复制分享 ==========
function copyShareText() {
  const last = searchHistory[searchHistory.length - 1];
  let text = '圆周率π包含一切？\n';
  if (last && last.found) {
    text += `我在 π 的第 ${last.position.toLocaleString()} 位找到了「${last.sequence}」！\n`;
  }
  text += '来试试你的银行卡密码藏在哪：\nhttps://numfeel.996.ninja/pages/pi-contains/';

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyBtn');
      btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
      setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i> 复制分享文案'; }, 2000);
    });
  }
}

// ========== 键盘事件 ==========
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
  initApp();
  drawExpectedChart();
  drawOccurrenceChart();
});
