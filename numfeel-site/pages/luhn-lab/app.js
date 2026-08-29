// ========== Luhn 交互控制 ==========

const $ = (id) => document.getElementById(id);

const cardInput = $('cardInput');
const stepsWrap = $('stepsWrap');
const digitsRow = $('digitsRow');
const resultBanner = $('resultBanner');
const resultIcon = $('resultIcon');
const resultText = $('resultText');

const BRAND_STYLE = {
  visa: { name: 'Visa', color: '#1a1f71' },
  mastercard: { name: 'Mastercard', color: '#eb001b' },
  amex: { name: 'American Express', color: '#2e77bc' },
  unionpay: { name: '银联 UnionPay', color: '#e21836' },
  discover: { name: 'Discover', color: '#f76b1c' },
  jcb: { name: 'JCB', color: '#0a4ca2' },
  diners: { name: 'Diners Club', color: '#0a0a0a' }
};

function init() {
  bindInputs();
  loadCard('4242424242424242');
}

// ── 输入与校验 ──
function bindInputs() {
  cardInput.addEventListener('input', () => {
    renderAll(cardInput.value);
  });
  $('checkBtn').addEventListener('click', () => {
    nfTrack('check', {});
    renderAll(cardInput.value);
  });
  $('mutateBtn').addEventListener('click', mutateOneDigit);
  document.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => loadCard(chip.dataset.card));
  });

  $('genBtn').addEventListener('click', () => generateFrom($('genInput').value));
  $('genRandomBtn').addEventListener('click', randomGenerate);
  $('copyBtn').addEventListener('click', copyGenerated);

  cardInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      nfTrack('check', {});
      renderAll(cardInput.value);
    }
  });
}

function loadCard(number) {
  cardInput.value = number;
  renderAll(number);
  // 只记卡组织类型，绝不把卡号放进 props（隐私红线）
  const type = detectCardType(number);
  nfTrack('preset', { type: type ? type.code : 'unknown' });
}

// ── 渲染：结果 + 分步 ──
function renderAll(value) {
  const r = luhnSteps(value);
  renderResult(r);
  renderSteps(r);
  renderBrand(value);
}

function renderResult(r) {
  if (!r) {
    resultBanner.className = 'result-banner';
    resultIcon.innerHTML = '<i class="ti ti-alert-circle"></i>';
    resultText.textContent = '请输入纯数字（可带空格或横线）';
    return;
  }
  if (r.valid) {
    resultBanner.className = 'result-banner ok';
    resultIcon.innerHTML = '<i class="ti ti-circle-check"></i>';
    resultText.textContent = '校验通过：校验和 ' + r.sum + ' 能被 10 整除，格式合法';
  } else {
    resultBanner.className = 'result-banner fail';
    resultIcon.innerHTML = '<i class="ti ti-circle-x"></i>';
    resultText.textContent = '校验失败：校验和 ' + r.sum + ' 不能被 10 整除——最后一位或某位数字有误';
  }
}

function renderSteps(r) {
  if (!r) { stepsWrap.style.display = 'none'; return; }
  stepsWrap.style.display = 'block';
  digitsRow.innerHTML = '';

  // steps 是从右往左的；展示时保持原始从左到右顺序，方便对照卡号
  const ordered = r.steps.slice().reverse();
  const frag = document.createDocumentFragment();
  ordered.forEach((s) => {
    const cell = document.createElement('div');
    cell.className = 'digit-cell';
    if (!s.doubled) cell.className += ' plain';
    if (s.doubled && s.raw > 9) cell.className += ' reduced';
    else if (s.doubled) cell.className += ' doubled';
    cell.title = '从右数第 ' + s.fromRight + ' 位';

    const pos = document.createElement('div');
    pos.className = 'cell-pos';
    pos.textContent = '第' + s.fromRight + '位';

    const digit = document.createElement('div');
    digit.className = 'cell-digit';
    digit.textContent = s.digit;

    const calc = document.createElement('div');
    calc.className = 'cell-calc';
    if (!s.doubled) {
      calc.textContent = '+ ' + s.transformed;
    } else if (s.raw > 9) {
      calc.textContent = '×2=' + s.raw + '→' + s.transformed;
    } else {
      calc.textContent = '×2=' + s.transformed;
    }

    cell.appendChild(pos);
    cell.appendChild(digit);
    cell.appendChild(calc);
    frag.appendChild(cell);
  });
  digitsRow.appendChild(frag);

  $('sumVal').textContent = r.sum;
  const verdict = $('sumVerdict');
  verdict.textContent = r.sum % 10 === 0 ? '＝ ' + r.sum + '，能被 10 整除 ✓' : '＝ ' + r.sum + '，不能被 10 整除 ✕';
  verdict.className = 'sum-verdict ' + (r.sum % 10 === 0 ? 'ok' : 'fail');
}

// ── 随机改一位：演示手误导致校验失败 ──
// 任意位置改成"必然让 Luhn 校验失败"的数字：每个位置只有 1 个候选数字
// 能保持校验和不变，其余 9 个都必败，随机选一个必败的即可（不会出现改了还通过的情况）。
function mutateOneDigit() {
  const digits = normalizeDigits(cardInput.value);
  if (!digits || digits.length < 3) return;
  const arr = Array.from(digits);
  const idx = Math.floor(Math.random() * arr.length);
  const orig = arr[idx];
  const failing = [];
  for (let d = 0; d <= 9; d++) {
    const nd = String(d);
    if (nd === orig) continue;
    const trial = arr.slice();
    trial[idx] = nd;
    if (luhnSum(trial.join('')) % 10 !== 0) failing.push(nd);
  }
  arr[idx] = failing[Math.floor(Math.random() * failing.length)];
  cardInput.value = arr.join('');
  nfTrack('mutate', { at: idx });
  renderAll(cardInput.value);
}

// ── 生成校验位 ──
function generateFrom(prefix) {
  const digits = normalizeDigits(prefix);
  const out = $('generateResult');
  if (!digits) {
    out.style.display = 'block';
    $('genFormula').textContent = '请输入纯数字前缀';
    $('genCard').style.display = 'none';
    return;
  }

  const full = completeNumber(digits);
  const sumWithZero = luhnSum(digits + '0');
  const check = luhnCheckDigit(digits);

  $('genFormula').innerHTML =
    '先把校验位当作 <b>0</b> 算校验和：' + digits + '+0 → 校验和 = <b>' + sumWithZero + '</b>' +
    '<br>要凑成 10 的倍数，校验位 = (10 − ' + (sumWithZero % 10) + ') % 10 = <b>' + check + '</b>';

  $('genCard').style.display = 'flex';
  $('genNumber').textContent = formatCardNumber(full);
  const brand = detectCardType(full);
  const b = brand ? BRAND_STYLE[brand.code] : null;
  $('genBrand').textContent = brand ? brand.name : '未知卡组织';
  $('genBrand').style.background = b ? b.color : '#333';

  $('genCheckHint').textContent = '补上校验位后：' + formatCardNumber(full) + ' 的 Luhn 校验 ' + (luhnCheck(full) ? '通过 ✓' : '失败 ✕');
  $('generateResult').style.display = 'block';

  nfTrack('generate', { len: full.length });
}

function randomGenerate() {
  const brands = ['4', '55', '34', '62', '6011'];
  const prefix = brands[Math.floor(Math.random() * brands.length)];
  // 拼一个合理长度的前缀（不含校验位）：Visa/银联 15 位，Amex 14 位
  const len = (prefix === '34') ? 14 : 15;
  let seed = prefix;
  while (seed.length < len) seed += Math.floor(Math.random() * 10);
  $('genInput').value = seed;
  generateFrom(seed);
}

function copyGenerated() {
  const num = $('genNumber').textContent.replace(/\s/g, '');
  if (!num) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(num).then(() => flashCopied());
  } else {
    const ta = document.createElement('textarea');
    ta.value = num;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    flashCopied();
  }
  nfTrack('copy', {});
}

let flashTimer = null;
function flashCopied() {
  const btn = $('copyBtn');
  btn.textContent = '已复制 ✓';
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i> 复制'; }, 1500);
}

// ── 卡组织识别 ──
function renderBrand(value) {
  const brand = detectCardType(value);
  const chip = $('brandChip');
  const meta = $('brandMeta');
  if (!brand) {
    chip.className = 'brand-chip';
    $('brandName').textContent = value ? '未知 / 无法识别' : '等待输入…';
    chip.style.background = '#333';
    meta.textContent = '可能不是常见的卡组织号段，或输入还不是有效长度';
    return;
  }
  const b = BRAND_STYLE[brand.code];
  chip.className = 'brand-chip';
  $('brandName').textContent = b.name;
  chip.style.background = b.color;
  meta.textContent = 'BIN 号段：' + brand.prefix + ' · 常见长度：' + brand.lengths.join(' / ') + ' 位';
}

// ── 埋点 ──
function nfTrack(name, props, opts) {
  try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
}
(function () {
  try { if (window.NFTrack) window.NFTrack.trackOnce('session_start', {}); } catch (e) {}
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });
})();

init();
