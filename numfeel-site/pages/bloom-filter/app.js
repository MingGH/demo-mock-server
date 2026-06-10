/**
 * 布隆过滤器 Demo - 交互逻辑（纯布隆过滤器，无外部 API 依赖）
 */
(function() {
  'use strict';

  // ── 模块一：手动布隆过滤器 Playground ──
  const PLAY_M = 64;
  const PLAY_K = 3;
  const playFilter = new BloomFilter(PLAY_M, PLAY_K);
  const playInserted = new Set();

  const playInput = document.getElementById('playInput');
  const playAddBtn = document.getElementById('playAddBtn');
  const playQueryBtn = document.getElementById('playQueryBtn');
  const playResetBtn = document.getElementById('playResetBtn');
  const playBitsEl = document.getElementById('playBits');
  const playBitIndexEl = document.getElementById('playBitIndex');
  const playCountEl = document.getElementById('playCount');
  const playFillEl = document.getElementById('playFill');
  const playLogEl = document.getElementById('playLog');

  function initPlayground() {
    let bitsHtml = '';
    let indexHtml = '';
    for (let i = 0; i < PLAY_M; i++) {
      bitsHtml += `<span class="pbit off" data-pos="${i}">0</span>`;
      indexHtml += `<span>${i}</span>`;
    }
    playBitsEl.innerHTML = bitsHtml;
    playBitIndexEl.innerHTML = indexHtml;
  }

  function updatePlayUI() {
    const bits = playBitsEl.querySelectorAll('.pbit');
    for (let i = 0; i < PLAY_M; i++) {
      const val = playFilter.getBit(i);
      bits[i].textContent = val;
      bits[i].className = 'pbit ' + (val ? 'on' : 'off');
    }
    playCountEl.textContent = playInserted.size;
    const fillBits = Array.from(playFilter.bitArray).reduce((sum, byte) => {
      let count = 0; let b = byte;
      while (b) { count += b & 1; b >>= 1; }
      return sum + count;
    }, 0);
    playFillEl.textContent = Math.round(fillBits / PLAY_M * 100) + '%';
  }

  function highlightBits(positions, className) {
    const bits = playBitsEl.querySelectorAll('.pbit');
    bits.forEach(b => b.classList.remove('hit', 'miss'));
    positions.forEach(pos => bits[pos].classList.add(className));
    setTimeout(() => bits.forEach(b => b.classList.remove('hit', 'miss')), 2000);
  }

  function addPlayLog(html) {
    playLogEl.innerHTML = html + '<br>' + playLogEl.innerHTML;
    const lines = playLogEl.innerHTML.split('<br>');
    if (lines.length > 20) playLogEl.innerHTML = lines.slice(0, 20).join('<br>');
  }

  playAddBtn.addEventListener('click', () => {
    const val = playInput.value.trim();
    if (!val) return;
    const positions = playFilter.getPositions(val);
    playFilter.add(val);
    playInserted.add(val);
    updatePlayUI();
    highlightBits(positions, 'hit');
    addPlayLog(`<span class="log-add">+ 插入 "${val}" → 位置 [${positions.join(', ')}]</span>`);
    playInput.value = '';
    playInput.focus();
  });

  playQueryBtn.addEventListener('click', () => {
    const val = playInput.value.trim();
    if (!val) return;
    const positions = playFilter.getPositions(val);
    const result = playFilter.mightContain(val);
    const reallyExists = playInserted.has(val);
    if (result && reallyExists) {
      highlightBits(positions, 'hit');
      addPlayLog(`<span class="log-found">? "${val}" → 存在 ✓（确实插入过）</span>`);
    } else if (result && !reallyExists) {
      highlightBits(positions, 'hit');
      addPlayLog(`<span class="log-fp">? "${val}" → 误判！位 [${positions.join(', ')}] 全是 1，但从未插入</span>`);
    } else {
      highlightBits(positions, 'miss');
      addPlayLog(`<span class="log-not-found">? "${val}" → 一定不存在（位 [${positions.join(', ')}] 有 0）</span>`);
    }
  });

  playResetBtn.addEventListener('click', () => {
    playFilter.reset(); playInserted.clear(); updatePlayUI(); playLogEl.innerHTML = '';
    addPlayLog('<span style="color:#666;">已重置</span>');
  });

  playInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.shiftKey ? playQueryBtn.click() : playAddBtn.click(); }
  });

  document.querySelectorAll('.play-preset').forEach(btn => {
    btn.addEventListener('click', () => { playInput.value = btn.dataset.val; playInput.focus(); });
  });

  initPlayground();


  // ── 模块二：误判挑战 ──
  const CHALLENGE_M = 1024;
  const CHALLENGE_K = 7;
  let challengeFilter = new BloomFilter(CHALLENGE_M, CHALLENGE_K);
  let challengeInserted = new Set();
  let challengeTotalFP = 0;
  let challengeFirstFPAt = null;

  const challengeInput = document.getElementById('challengeInput');
  const challengeAddBtn = document.getElementById('challengeAddBtn');
  const challengeBatch10 = document.getElementById('challengeBatch10');
  const challengeBatch50 = document.getElementById('challengeBatch50');
  const challengeReset = document.getElementById('challengeReset');
  const challengeCountEl = document.getElementById('challengeCount');
  const challengeFillEl = document.getElementById('challengeFill');
  const challengeFPEl = document.getElementById('challengeFP');
  const challengeFirstFPEl = document.getElementById('challengeFirstFP');
  const challengeLogEl = document.getElementById('challengeLog');

  function challengeInsertAndTest(word) {
    challengeFilter.add(word);
    challengeInserted.add(word);

    // 用 100 个随机串检测误判
    let fpThisRound = 0;
    for (let i = 0; i < 100; i++) {
      const testStr = '_fp_test_' + randomString(10) + '_' + Date.now() + '_' + i;
      if (challengeFilter.mightContain(testStr)) {
        fpThisRound++;
      }
    }

    challengeTotalFP += fpThisRound;
    if (fpThisRound > 0 && challengeFirstFPAt === null) {
      challengeFirstFPAt = challengeInserted.size;
      challengeFirstFPEl.textContent = challengeFirstFPAt;
      challengeFirstFPEl.style.color = '#ff6b6b';
      addChallengeLog(`<span class="log-fp">⚠️ 第 ${challengeFirstFPAt} 个元素后出现首次误判！（"${word}" 插入后，${fpThisRound}/100 个随机串被误判）</span>`);
    } else if (fpThisRound > 0) {
      addChallengeLog(`<span class="log-fp">+ "${word}" → ${fpThisRound}/100 误判</span>`);
    } else {
      addChallengeLog(`<span class="log-add">+ "${word}" → 0 误判</span>`);
    }

    updateChallengeUI();
  }

  function updateChallengeUI() {
    challengeCountEl.textContent = challengeInserted.size;
    const fill = challengeFilter.getFillRate();
    challengeFillEl.textContent = Math.round(fill * 100) + '%';
    challengeFPEl.textContent = challengeTotalFP;
    if (challengeFirstFPAt === null) challengeFirstFPEl.textContent = '—';
  }

  function addChallengeLog(html) {
    challengeLogEl.innerHTML = html + '<br>' + challengeLogEl.innerHTML;
    const lines = challengeLogEl.innerHTML.split('<br>');
    if (lines.length > 30) challengeLogEl.innerHTML = lines.slice(0, 30).join('<br>');
  }

  challengeAddBtn.addEventListener('click', () => {
    const val = challengeInput.value.trim();
    if (!val) return;
    challengeInsertAndTest(val);
    challengeInput.value = '';
    challengeInput.focus();
  });

  challengeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') challengeAddBtn.click();
  });

  challengeBatch10.addEventListener('click', () => {
    for (let i = 0; i < 10; i++) challengeInsertAndTest('word_' + randomString(6));
  });

  challengeBatch50.addEventListener('click', () => {
    for (let i = 0; i < 50; i++) challengeInsertAndTest('word_' + randomString(6));
  });

  challengeReset.addEventListener('click', () => {
    challengeFilter = new BloomFilter(CHALLENGE_M, CHALLENGE_K);
    challengeInserted = new Set();
    challengeTotalFP = 0;
    challengeFirstFPAt = null;
    challengeFirstFPEl.style.color = '';
    challengeLogEl.innerHTML = '';
    updateChallengeUI();
    addChallengeLog('<span style="color:#666;">已重置，重新开始挑战</span>');
  });


  // ── 模块三：参数调优实验室 ──
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

    const fpr = theoreticalFPR(n, m, k);
    theoreticalFPREl.textContent = fpr < 0.0001 ? fpr.toExponential(2) : (fpr * 100).toFixed(2) + '%';

    const fill = 1 - Math.exp(-k * n / m);
    fillRateEl.textContent = (fill * 100).toFixed(1) + '%';

    const kOpt = optimalK(m, n);
    optimalKEl.textContent = kOpt;
    optimalKEl.style.color = Math.abs(k - kOpt) <= 1 ? '#81c784' : '#ff6b6b';

    const bytes = Math.ceil(m / 8);
    memoryUsageEl.textContent = formatBytes(bytes);
  }

  function initBitGrid() {
    let html = '';
    for (let i = 0; i < 512; i++) {
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
    const filter = new BloomFilter(m, k);

    for (let i = 0; i < n; i++) {
      filter.add('elem_' + i + '_' + randomString(8));
    }

    const bits = bitArrayGrid.querySelectorAll('.grid-bit');
    bits.forEach((el, i) => {
      const pos = Math.floor(i * m / 512);
      el.className = 'grid-bit ' + (filter.getBit(pos) ? 'bit-one' : 'bit-zero');
    });

    let falsePositives = 0;
    const testCount = 1000;
    for (let i = 0; i < testCount; i++) {
      if (filter.mightContain('test_not_exist_' + randomString(12) + '_' + i)) falsePositives++;
    }

    experimentResult.style.display = 'block';
    document.getElementById('fpCount').textContent = falsePositives;
    document.getElementById('actualFPR').textContent = (falsePositives / testCount * 100).toFixed(2) + '%';
    document.getElementById('predictedFPR').textContent = (theoreticalFPR(n, m, k) * 100).toFixed(2) + '%';
  }


  // ── 模块四：内存对决 ──
  const memorySliderN = document.getElementById('memorySliderN');
  const memorySliderValue = document.getElementById('memorySliderValue');
  let memoryChart = null;

  function updateMemoryCompare() {
    const exp = parseFloat(memorySliderN.value);
    const n = Math.round(Math.pow(10, exp));
    memorySliderValue.textContent = n.toLocaleString();

    const hashsetBytes = n * 40;
    const bloomBytes = Math.ceil(requiredBits(n, 0.001) / 8);

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
      for (let exp = 6; exp <= 9; exp += 0.5) {
        const n = Math.round(Math.pow(10, exp));
        dataPoints.push({
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
            { label: 'HashSet', data: dataPoints.map(d => d.hashset), backgroundColor: 'rgba(255,107,107,0.7)', borderColor: '#ff6b6b', borderWidth: 1 },
            { label: '布隆过滤器 (0.1%)', data: dataPoints.map(d => d.bloom), backgroundColor: 'rgba(129,199,132,0.7)', borderColor: '#81c784', borderWidth: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#ccc' } }, tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ' + formatBytes(context.raw); } } } },
          scales: { x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#aaa', callback: function(v) { return formatBytes(v); } }, grid: { color: 'rgba(255,255,255,0.05)' } } }
        }
      });
    };

    if (typeof Chart !== 'undefined') { renderChart(); }
    else if (typeof loadChartJS === 'function') { loadChartJS().then(renderChart).catch(() => { document.querySelector('.memory-chart-container').style.display = 'none'; }); }
    else { document.querySelector('.memory-chart-container').style.display = 'none'; }
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
