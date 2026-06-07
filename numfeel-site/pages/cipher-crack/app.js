// ========== 预设密文 ==========
const PRESETS = [
  {
    id: 'caesar-1',
    title: '凯撒 · 入门',
    desc: '偏移量 3，短文本',
    mode: 'caesar',
    cipher: 'WKH TXLFN EURZQ IRA MXPSV RYHU WKH ODCB GRJ'
  },
  {
    id: 'caesar-2',
    title: '凯撒 · 进阶',
    desc: '偏移量 17，一段名言',
    mode: 'caesar',
    cipher: 'KV ZJ R KILKY LEZMBIJRCCP RTBEFNCVUXVU KYRK KYFJV GVFGCV NKF RIV TIRQP VEFLEX KF KYEZB KYVP TRE TYREXV KYV NFICU RIV KYV FEVJ NYF RTKLRCCP UF'
  },
  {
    id: 'caesar-3',
    title: '凯撒 · 历史文本',
    desc: 'ROT13，一段密码学历史',
    mode: 'caesar',
    cipher: 'GURFR PELCGBTENCUVP GRPUAVDHRF JRER SVEFG QRIRYBCRQ OL NY XVAQV VA GUR AVAGU PRAGHEL OHG JRER YBFG GB RHEBCR SBE FVKUHAQERQ LRNEF HAGVY ERARFFNAPR FPUBYNEF ERQVFPBIRERQ GURZ VAQRCRAQRAGYL'
  },
  {
    id: 'vigenere-1',
    title: '维吉尼亚 · 4位密钥',
    desc: '密钥较短，相对容易',
    mode: 'vigenere',
    cipher: vigenereEncrypt('IT WAS THE BEST OF TIMES IT WAS THE WORST OF TIMES IT WAS THE AGE OF WISDOM IT WAS THE AGE OF FOOLISHNESS IT WAS THE EPOCH OF BELIEF IT WAS THE EPOCH OF INCREDULITY IT WAS THE SEASON OF LIGHT IT WAS THE SEASON OF DARKNESS', 'HACK')
  },
  {
    id: 'vigenere-2',
    title: '维吉尼亚 · 6位密钥',
    desc: '需要 IC 分析',
    mode: 'vigenere',
    cipher: vigenereEncrypt('THE HISTORY OF CRYPTOGRAPHY IS AS OLD AS CIVILIZATION ITSELF FROM THE ANCIENT EGYPTIANS TO THE ROMAN EMPIRE PEOPLE HAVE ALWAYS SOUGHT WAYS TO COMMUNICATE SECRETLY THE MOST REMARKABLE THING ABOUT FREQUENCY ANALYSIS IS THAT IT WAS DISCOVERED IN THE NINTH CENTURY BY ARAB SCHOLARS BUT THEN LOST TO EUROPE FOR SIX HUNDRED YEARS', 'SECRET')
  },
  {
    id: 'vigenere-3',
    title: '维吉尼亚 · 6位密钥',
    desc: '关于技术遗失的文本',
    mode: 'vigenere',
    cipher: vigenereEncrypt('KNOWLEDGE CAN BE LOST IN MANY WAYS THROUGH WAR AND DESTRUCTION THROUGH SECRECY AND CLASSIFICATION THROUGH SIMPLE NEGLECT AND FORGETTING THE HISTORY OF CRYPTOGRAPHY SHOWS ALL THREE PATTERNS AL KINDI DISCOVERED FREQUENCY ANALYSIS BUT HIS WORK NEVER REACHED EUROPE BABBAGE CRACKED THE VIGENERE CIPHER BUT KEPT IT SECRET AND GCHQ INVENTED PUBLIC KEY CRYPTOGRAPHY BUT CLASSIFIED IT FOR DECADES', 'CIPHER')
  }
];

// ========== 全局状态 ==========
let currentMode = 'caesar';
let currentEncryptType = 'caesar';
let vState = { keyLength: 0, key: '' }; // 维吉尼亚破解中间状态

// ========== 初始化 ==========
function init() {
  renderPresets();
}

function renderPresets() {
  const grid = document.getElementById('presetGrid');
  const filtered = PRESETS.filter(p => {
    if (currentMode === 'encrypt') return true;
    return p.mode === currentMode;
  });
  grid.innerHTML = filtered.map(p => `
    <div class="preset-card" onclick="loadPreset('${p.id}')">
      <h4>${p.title}</h4>
      <p>${p.desc}</p>
    </div>
  `).join('');
}

function loadPreset(id) {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) return;

  if (preset.mode === 'caesar') {
    switchMode('caesar');
    document.getElementById('caesarInput').value = preset.cipher;
    // 不自动破解，等用户点按钮
    scrollToEl('caesarSection');
  } else if (preset.mode === 'vigenere') {
    switchMode('vigenere');
    document.getElementById('vigenereInput').value = preset.cipher;
    resetVigenereSteps();
    scrollToEl('vigenereSection');
  }
}

// ========== Hero 引导 ==========
function startCrackHero() {
  switchMode('caesar');
  document.getElementById('caesarInput').value = PRESETS[0].cipher;
  scrollToEl('caesarSection');
}

// ========== 模式切换 ==========
function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('#modeTabs .mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
  document.getElementById('caesarSection').style.display = mode === 'caesar' ? '' : 'none';
  document.getElementById('vigenereSection').style.display = mode === 'vigenere' ? '' : 'none';
  document.getElementById('encryptSection').style.display = mode === 'encrypt' ? '' : 'none';
  renderPresets();
}

function switchEncryptType(type) {
  currentEncryptType = type;
  document.querySelectorAll('#encryptTypeTabs .mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.type === type);
  });
  document.getElementById('caesarEncryptControls').style.display = type === 'caesar' ? '' : 'none';
  document.getElementById('vigenereEncryptControls').style.display = type === 'vigenere' ? '' : 'none';
}

function scrollToEl(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ========== 凯撒破解 ==========
function crackCaesar() {
  const input = document.getElementById('caesarInput').value.trim();
  if (!input) return;

  // 统计字母数量，太短时提示
  const letterCount = input.replace(/[^a-zA-Z]/g, '').length;
  const warnEl = document.getElementById('caesarShortWarn');
  if (warnEl) {
    if (letterCount < 30) {
      warnEl.style.display = '';
      warnEl.innerHTML = `<i class="ti ti-alert-triangle"></i> 只有 ${letterCount} 个字母，样本太少，频率分析可能不准确。建议使用 50+ 字母的密文以获得可靠结果。`;
    } else {
      warnEl.style.display = 'none';
    }
  }

  const results = bruteForceCaesar(input);

  // 最佳结果
  document.getElementById('caesarOutput').value = caesarDecrypt(input, results[0].shift);

  // 频率图
  showFreqBars('caesarFreqBars', letterFrequency(input));
  document.getElementById('caesarFreqContainer').style.display = '';

  // 所有结果
  const container = document.getElementById('caesarResults');
  container.innerHTML = results.map((r, i) => `
    <div class="crack-result-item${i === 0 ? ' best' : ''}" onclick="selectCaesarResult(${r.shift})">
      <span class="crack-rank">${i === 0 ? '✓' : '#' + (i+1)}</span>
      <span class="crack-score">偏移 ${r.shift} · χ²=${r.score}</span>
      <span class="crack-preview">${escHtml(r.preview)}</span>
    </div>
  `).join('');
  document.getElementById('caesarResultsContainer').style.display = '';
}

function selectCaesarResult(shift) {
  const input = document.getElementById('caesarInput').value;
  document.getElementById('caesarOutput').value = caesarDecrypt(input, shift);
}

function clearCaesar() {
  document.getElementById('caesarInput').value = '';
  document.getElementById('caesarOutput').value = '';
  document.getElementById('caesarFreqContainer').style.display = 'none';
  document.getElementById('caesarResultsContainer').style.display = 'none';
}

// ========== 维吉尼亚破解（分步交互） ==========
function resetVigenereSteps() {
  vState = { keyLength: 0, key: '' };
  document.getElementById('vStep1Btn').disabled = false;
  document.getElementById('vStep2Btn').disabled = true;
  document.getElementById('vStep3Btn').disabled = true;
  document.getElementById('vigenereICSection').style.display = 'none';
  document.getElementById('vigenereKeySection').style.display = 'none';
  document.getElementById('vigenereFreqContainer').style.display = 'none';
  document.getElementById('vigenereOutput').value = '';
  // 重置步骤进度
  document.querySelectorAll('.step-item').forEach(el => {
    el.classList.remove('active', 'done');
  });
}

function vigenereStep1() {
  const input = document.getElementById('vigenereInput').value.trim();
  if (!input) return;

  // 标记步骤 1 为激活
  document.getElementById('vStepItem1').classList.add('active');

  const icResults = icKeyLengthEstimate(input, 15);
  renderICTable(icResults);
  document.getElementById('vigenereICSection').style.display = '';

  // 显示结论
  const bestLen = icResults[0].length;
  vState.keyLength = bestLen;
  document.getElementById('icVerdict').innerHTML =
    `<i class="ti ti-check"></i> 推荐密钥长度：<strong>${bestLen}</strong>（IC = ${icResults[0].ic.toFixed(4)}）。不确定的话，<strong>点击表格的行</strong>可以换一个长度试试。`;

  // 启用第二步
  document.getElementById('vStep1Btn').disabled = true;
  document.getElementById('vStep2Btn').disabled = false;

  // 标记步骤 1 完成
  document.getElementById('vStepItem1').classList.remove('active');
  document.getElementById('vStepItem1').classList.add('done');
  document.getElementById('vStepItem2').classList.add('active');
}

function vigenereStep2() {
  const input = document.getElementById('vigenereInput').value.trim();
  if (!input || !vState.keyLength) return;

  const key = crackVigenereWithLength(input, vState.keyLength);
  vState.key = key;

  document.getElementById('vKeyLength').textContent = vState.keyLength;
  document.getElementById('vKeyResult').textContent = key;
  document.getElementById('vigenereKeySection').style.display = '';

  // 启用第三步
  document.getElementById('vStep2Btn').disabled = true;
  document.getElementById('vStep3Btn').disabled = false;

  // 步骤进度
  document.getElementById('vStepItem2').classList.remove('active');
  document.getElementById('vStepItem2').classList.add('done');
  document.getElementById('vStepItem3').classList.add('active');
}

function vigenereStep3() {
  const input = document.getElementById('vigenereInput').value.trim();
  if (!input || !vState.key) return;

  const decrypted = vigenereDecrypt(input, vState.key);
  document.getElementById('vigenereOutput').value = decrypted;

  // 频率图
  showFreqBars('vigenereFreqBars', letterFrequency(decrypted));
  document.getElementById('vigenereFreqContainer').style.display = '';

  // 步骤完成
  document.getElementById('vStep3Btn').disabled = true;
  document.getElementById('vStepItem3').classList.remove('active');
  document.getElementById('vStepItem3').classList.add('done');
}

function renderICTable(results) {
  const tbody = document.getElementById('icTableBody');
  const maxIC = Math.max(...results.map(r => r.ic));
  tbody.innerHTML = results.slice(0, 10).map((r, i) => {
    const pct = (r.ic / maxIC * 100).toFixed(0);
    const isHighlight = i === 0;
    return `<tr class="${isHighlight ? 'highlight' : ''}" onclick="selectKeyLength(${r.length})" style="cursor:pointer;" title="点击选择此长度">
      <td style="color:${isHighlight ? '#ffd700' : '#c0c0c0'};font-weight:${isHighlight?'700':'400'}">${r.length}</td>
      <td style="font-family:monospace;color:${isHighlight ? '#ffd700' : '#c0c0c0'}">${r.ic.toFixed(4)}</td>
      <td><div class="ic-bar" style="width:${pct}%;${isHighlight ? 'background:rgba(255,215,0,0.8);' : ''}"></div></td>
    </tr>`;
  }).join('');
}

function selectKeyLength(len) {
  vState.keyLength = len;
  document.getElementById('icVerdict').innerHTML =
    `<i class="ti ti-check"></i> 已选择密钥长度：<strong>${len}</strong>`;
  // 高亮选中行
  document.querySelectorAll('#icTableBody tr').forEach(tr => {
    tr.classList.remove('highlight');
    const td = tr.querySelector('td');
    if (td && parseInt(td.textContent) === len) tr.classList.add('highlight');
  });
  // 确保第二步按钮可用
  document.getElementById('vStep2Btn').disabled = false;
  document.getElementById('vStepItem2').classList.add('active');
}

function clearVigenere() {
  document.getElementById('vigenereInput').value = '';
  document.getElementById('vigenereOutput').value = '';
  resetVigenereSteps();
}

// ========== 加密工坊 ==========
function doEncrypt() {
  const input = document.getElementById('encryptInput').value;
  if (!input) return;

  let result;
  if (currentEncryptType === 'caesar') {
    const shift = parseInt(document.getElementById('encryptShift').value) || 3;
    result = caesarEncrypt(input, shift);
  } else {
    const key = document.getElementById('encryptKey').value || 'SECRET';
    result = vigenereEncrypt(input, key);
  }
  document.getElementById('encryptOutput').value = result;
}

function sendToCrack() {
  const cipher = document.getElementById('encryptOutput').value;
  if (!cipher) return;

  if (currentEncryptType === 'caesar') {
    switchMode('caesar');
    document.getElementById('caesarInput').value = cipher;
    scrollToEl('caesarSection');
  } else {
    switchMode('vigenere');
    document.getElementById('vigenereInput').value = cipher;
    resetVigenereSteps();
    scrollToEl('vigenereSection');
  }
}

// ========== 频率条形图 ==========
function showFreqBars(containerId, freq) {
  const container = document.getElementById(containerId);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const maxFreq = Math.max(...letters.map(l => Math.max(freq[l] || 0, ENGLISH_FREQ[l])));

  container.innerHTML = letters.map(l => {
    const cipherH = ((freq[l] || 0) / maxFreq * 100).toFixed(1);
    const engH = (ENGLISH_FREQ[l] / maxFreq * 100).toFixed(1);
    return `<div class="freq-bar-group">
      <div class="freq-bar cipher" style="height:${cipherH}%;" title="${l}: ${(freq[l]||0).toFixed(1)}%"></div>
      <div class="freq-bar english" style="height:${engH}%;" title="${l} 标准: ${ENGLISH_FREQ[l]}%"></div>
      <span class="freq-bar-label">${l}</span>
    </div>`;
  }).join('');
}

// ========== 工具 ==========
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ========== 启动 ==========
init();
