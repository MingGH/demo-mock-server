/**
 * 布隆过滤器 Demo - 交互逻辑
 */
(function() {
  'use strict';

  // ── 常见弱密码库（用于本地布隆过滤器演示）──
  // 来源：SecLists Top 10000 常见密码（精简版）
  const COMMON_PASSWORDS = [
    '123456','password','12345678','qwerty','123456789','12345','1234','111111',
    'abc123','1234567','dragon','123123','baseball','iloveyou','master','sunshine',
    'ashley','michael','shadow','123456a','654321','football','charlie','18atcskd2w',
    'daniel','computer','jessica','letmein','access','trustno1','monkey','starwars',
    'batman','welcome','hello','ninja','mustang','love','soccer','superman',
    'princess','qwerty123','admin','passw0rd','login','000000','solo','flower',
    'hotdog','loveme','zaq1zaq1','password1','baseball1','password123','test',
    'killer','hockey','george','charlie1','andrew','michelle','love123','jordan',
    'robert','buster','thomas','tigger','soccer1','hunter','samantha','amanda',
    'andrea','joshua','nicole','chelsea','biteme','matthew','access14','yankees',
    'dallas','austin','thunder','taylor','matrix','william','corvette','hello1',
    'maggie','martin','ginger','golfer','cheese','creative','sparky','cowgirl',
    'camaro','secret','falcon','iloveu','andrea1','summer','phoenix','kelly',
    'knight','rocket','rosebud','jackson','hammer','christian','hannah','junior'
  ];

  // 扩展到约 10 万条（通过变体生成）
  const extendedPasswords = [];

  function generateExtendedPasswords() {
    // 基础密码直接加入
    COMMON_PASSWORDS.forEach(p => extendedPasswords.push(p));

    // 常见变体：加数字后缀
    for (let i = 0; i <= 99; i++) {
      COMMON_PASSWORDS.slice(0, 200).forEach(p => {
        extendedPasswords.push(p + i);
      });
    }

    // 常见变体：首字母大写
    COMMON_PASSWORDS.forEach(p => {
      extendedPasswords.push(p.charAt(0).toUpperCase() + p.slice(1));
    });

    // 常见变体：加特殊字符
    const suffixes = ['!', '@', '#', '123', '1234', '12345', '!@#', '666', '888', '000'];
    COMMON_PASSWORDS.slice(0, 500).forEach(p => {
      suffixes.forEach(s => extendedPasswords.push(p + s));
    });

    // 纯数字序列
    for (let i = 0; i <= 999999; i += 7) {
      extendedPasswords.push(String(i).padStart(6, '0'));
    }
  }

  generateExtendedPasswords();

  // ── 初始化本地布隆过滤器 ──
  const LOCAL_M = 1200000; // ~150KB，误判率约 1%
  const LOCAL_K = 7;
  const localFilter = new BloomFilter(LOCAL_M, LOCAL_K);

  // 插入所有扩展密码
  const insertStart = performance.now();
  extendedPasswords.forEach(pwd => localFilter.add(pwd));
  const insertTime = performance.now() - insertStart;
  console.log(`布隆过滤器已加载 ${extendedPasswords.length} 条密码，耗时 ${insertTime.toFixed(1)}ms`);


  // ── 模块一：密码查询 ──
  const passwordInput = document.getElementById('passwordInput');
  const checkBtn = document.getElementById('checkBtn');
  const resultCompare = document.getElementById('resultCompare');
  const hashViz = document.getElementById('hashViz');
  const hashSteps = document.getElementById('hashSteps');
  const bitArrayViz = document.getElementById('bitArrayViz');

  checkBtn.addEventListener('click', () => checkPassword());
  passwordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') checkPassword();
  });

  // 预设按钮
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      passwordInput.value = btn.dataset.pwd;
      checkPassword();
    });
  });

  async function checkPassword() {
    const pwd = passwordInput.value.trim();
    if (!pwd) return;

    resultCompare.style.display = 'grid';
    hashViz.style.display = 'block';

    // 1. 布隆过滤器本地查询
    const bloomStart = performance.now();
    const bloomResult = localFilter.mightContain(pwd);
    const bloomElapsed = performance.now() - bloomStart;

    const bloomStatusEl = document.getElementById('bloomStatus');
    const bloomTimeEl = document.getElementById('bloomTime');
    bloomStatusEl.textContent = bloomResult ? '⚠️ 可能已泄露' : '✓ 未收录';
    bloomStatusEl.className = 'result-status ' + (bloomResult ? 'status-danger' : 'status-safe');
    bloomTimeEl.textContent = `耗时：${bloomElapsed.toFixed(3)} ms`;

    // 2. 可视化哈希过程
    visualizeHash(pwd);

    // 3. HIBP API 查询
    const hibpStatusEl = document.getElementById('hibpStatus');
    const hibpTimeEl = document.getElementById('hibpTime');
    hibpStatusEl.textContent = '查询中...';
    hibpStatusEl.className = 'result-status status-loading';
    hibpTimeEl.textContent = '';

    const hibpStart = performance.now();
    try {
      const result = await queryHIBP(pwd);
      const hibpElapsed = performance.now() - hibpStart;
      if (result.count > 0) {
        hibpStatusEl.textContent = `⚠️ 已泄露（出现 ${result.count.toLocaleString()} 次）`;
        hibpStatusEl.className = 'result-status status-danger';
      } else {
        hibpStatusEl.textContent = '✓ 未发现泄露记录';
        hibpStatusEl.className = 'result-status status-safe';
      }
      hibpTimeEl.textContent = `耗时：${hibpElapsed.toFixed(0)} ms（含网络）`;
    } catch (err) {
      hibpStatusEl.textContent = '查询失败（网络错误）';
      hibpStatusEl.className = 'result-status status-error';
      hibpTimeEl.textContent = '';
    }
  }


  /**
   * 调用 HIBP Pwned Passwords API（k-Anonymity）
   * 前端算 SHA-1，只传前 5 位，本地匹配后缀
   */
  async function queryHIBP(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!resp.ok) throw new Error('HIBP API error');

    const text = await resp.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const [lineSuffix, count] = line.split(':');
      if (lineSuffix.trim() === suffix) {
        return { found: true, count: parseInt(count.trim(), 10), hash: hashHex };
      }
    }
    return { found: false, count: 0, hash: hashHex };
  }

  /**
   * 可视化哈希过程
   */
  function visualizeHash(pwd) {
    const positions = localFilter.getPositions(pwd);

    // 显示哈希步骤
    hashSteps.innerHTML = `
      <div class="hash-step">
        <span class="step-label">输入</span>
        <span class="step-value">"${pwd}"</span>
      </div>
      <div class="hash-step">
        <span class="step-label">${LOCAL_K} 个哈希位置</span>
        <span class="step-value">[${positions.map(p => p.toLocaleString()).join(', ')}]</span>
      </div>
      <div class="hash-step">
        <span class="step-label">判定</span>
        <span class="step-value">${positions.every(p => localFilter.getBit(p)) ? '所有位均为 1 → 可能存在' : '存在 0 位 → 一定不存在'}</span>
      </div>
    `;

    // 可视化位数组片段（围绕命中位置）
    const vizSize = 64;
    const centerPos = positions[0];
    const startPos = Math.max(0, centerPos - vizSize / 2);

    let bitsHtml = '';
    for (let i = startPos; i < startPos + vizSize && i < LOCAL_M; i++) {
      const isHit = positions.includes(i);
      const bitVal = localFilter.getBit(i);
      const cls = isHit ? 'bit-hit' : (bitVal ? 'bit-one' : 'bit-zero');
      bitsHtml += `<span class="bit ${cls}" title="位置 ${i}">${bitVal}</span>`;
    }
    bitArrayViz.innerHTML = `<div class="bit-row">${bitsHtml}</div>
      <div class="bit-legend">
        <span><span class="bit bit-hit">1</span> 当前查询命中</span>
        <span><span class="bit bit-one">1</span> 已被其他元素设置</span>
        <span><span class="bit bit-zero">0</span> 空位</span>
      </div>`;
  }


  // ── 模块二：参数调优实验室 ──
  const sliderN = document.getElementById('sliderN');
  const sliderM = document.getElementById('sliderM');
  const sliderK = document.getElementById('sliderK');
  const valueN = document.getElementById('valueN');
  const valueM = document.getElementById('valueM');
  const valueK = document.getElementById('valueK');
  const theoreticalFPREl = document.getElementById('theoreticalFPR');
  const fillRateEl = document.getElementById('fillRate');
  const optimalKEl = document.getElementById('optimalK');
  const memoryUsageEl = document.getElementById('memoryUsage');
  const bitArrayGrid = document.getElementById('bitArrayGrid');
  const runExperimentBtn = document.getElementById('runExperimentBtn');
  const experimentResult = document.getElementById('experimentResult');

  function updateLabMetrics() {
    const n = parseInt(sliderN.value);
    const m = parseInt(sliderM.value);
    const k = parseInt(sliderK.value);

    valueN.textContent = n.toLocaleString();
    valueM.textContent = m.toLocaleString() + ' bits';
    valueK.textContent = k;

    // 理论误判率
    const fpr = theoreticalFPR(n, m, k);
    theoreticalFPREl.textContent = fpr < 0.0001
      ? fpr.toExponential(2)
      : (fpr * 100).toFixed(2) + '%';

    // 填充率
    const fill = 1 - Math.exp(-k * n / m);
    fillRateEl.textContent = (fill * 100).toFixed(1) + '%';

    // 最优 k
    const kOpt = optimalK(m, n);
    optimalKEl.textContent = kOpt;
    optimalKEl.style.color = Math.abs(k - kOpt) <= 1 ? '#81c784' : '#ff6b6b';

    // 内存占用
    const bytes = Math.ceil(m / 8);
    memoryUsageEl.textContent = formatBytes(bytes);
  }

  function initBitGrid() {
    const gridSize = 512;
    let html = '';
    for (let i = 0; i < gridSize; i++) {
      html += `<span class="grid-bit bit-zero" data-pos="${i}"></span>`;
    }
    bitArrayGrid.innerHTML = html;
  }

  sliderN.addEventListener('input', updateLabMetrics);
  sliderM.addEventListener('input', updateLabMetrics);
  sliderK.addEventListener('input', updateLabMetrics);

  runExperimentBtn.addEventListener('click', runExperiment);

  function runExperiment() {
    const n = parseInt(sliderN.value);
    const m = parseInt(sliderM.value);
    const k = parseInt(sliderK.value);

    // 创建实验用布隆过滤器
    const filter = new BloomFilter(m, k);

    // 插入 n 个随机元素
    const inserted = new Set();
    for (let i = 0; i < n; i++) {
      const str = 'elem_' + i + '_' + randomString(8);
      filter.add(str);
      inserted.add(str);
    }

    // 更新位数组可视化
    const bits = bitArrayGrid.querySelectorAll('.grid-bit');
    bits.forEach((el, i) => {
      const pos = Math.floor(i * m / 512); // 采样
      if (filter.getBit(pos)) {
        el.className = 'grid-bit bit-one';
      } else {
        el.className = 'grid-bit bit-zero';
      }
    });

    // 测试 1000 个不存在的随机串
    let falsePositives = 0;
    const testCount = 1000;
    for (let i = 0; i < testCount; i++) {
      const testStr = 'test_not_exist_' + randomString(12) + '_' + i;
      if (filter.mightContain(testStr)) {
        falsePositives++;
      }
    }

    const actualRate = falsePositives / testCount;
    const predictedRate = theoreticalFPR(n, m, k);

    experimentResult.style.display = 'block';
    document.getElementById('fpCount').textContent = falsePositives;
    document.getElementById('actualFPR').textContent = (actualRate * 100).toFixed(2) + '%';
    document.getElementById('predictedFPR').textContent = (predictedRate * 100).toFixed(2) + '%';
  }


  // ── 模块三：内存对决 ──
  const memorySliderN = document.getElementById('memorySliderN');
  const memorySliderValue = document.getElementById('memorySliderValue');
  let memoryChart = null;

  function updateMemoryCompare() {
    const exp = parseFloat(memorySliderN.value);
    const n = Math.round(Math.pow(10, exp));
    memorySliderValue.textContent = n.toLocaleString();

    // HashSet: ~40 bytes per entry
    const hashsetBytes = n * 40;
    // 布隆过滤器: ~14.4 bits per entry (0.1% FPR)
    const bloomBits = requiredBits(n, 0.001);
    const bloomBytes = Math.ceil(bloomBits / 8);

    document.getElementById('hashsetMemory').textContent = formatBytes(hashsetBytes);
    document.getElementById('bloomMemory').textContent = formatBytes(bloomBytes);

    const savings = ((1 - bloomBytes / hashsetBytes) * 100).toFixed(1);
    document.getElementById('memoryInsight').textContent =
      `存 ${n.toLocaleString()} 个元素：HashSet 需要 ${formatBytes(hashsetBytes)}，` +
      `布隆过滤器只需要 ${formatBytes(bloomBytes)}。` +
      `节省 ${savings}% 内存，代价仅 0.1% 误判率。`;
  }

  function initMemoryChart() {
    const renderChart = () => {
      const ctx = document.getElementById('memoryChart').getContext('2d');
      const dataPoints = [];
      for (let exp = 4; exp <= 10; exp += 0.5) {
        const n = Math.round(Math.pow(10, exp));
        dataPoints.push({
          n: n,
          label: formatShortNumber(n),
          hashset: n * 40,
          bloom: Math.ceil(requiredBits(n, 0.001) / 8)
        });
      }

      memoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: dataPoints.map(d => d.label),
          datasets: [
            {
              label: 'HashSet',
              data: dataPoints.map(d => d.hashset),
              backgroundColor: 'rgba(255, 107, 107, 0.7)',
              borderColor: '#ff6b6b',
              borderWidth: 1
            },
            {
              label: '布隆过滤器 (0.1%)',
              data: dataPoints.map(d => d.bloom),
              backgroundColor: 'rgba(129, 199, 132, 0.7)',
              borderColor: '#81c784',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#ccc' }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return context.dataset.label + ': ' + formatBytes(context.raw);
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#aaa' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: {
              type: 'logarithmic',
              ticks: {
                color: '#aaa',
                callback: function(value) { return formatBytes(value); }
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        }
      });
    };

    if (typeof Chart !== 'undefined') {
      renderChart();
    } else if (typeof loadChartJS === 'function') {
      loadChartJS().then(renderChart).catch(() => {
        document.querySelector('.memory-chart-container').style.display = 'none';
      });
    } else {
      document.querySelector('.memory-chart-container').style.display = 'none';
    }
  }

  memorySliderN.addEventListener('input', updateMemoryCompare);


  // ── 工具函数 ──
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function formatShortNumber(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(0) + '亿';
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(0) + '万';
    return n.toLocaleString();
  }

  // ── 初始化 ──
  updateLabMetrics();
  initBitGrid();
  updateMemoryCompare();
  initMemoryChart();

})();
