// ========== SRI 安全实验室 ==========
const API_BASE = 'https://numfeel-api.996.ninja/sri';
let integrityHash = null;

// ── 初始化：获取正常脚本的哈希值 ──
async function init() {
  try {
    if (typeof fetch === 'undefined' || location.protocol === 'file:') return;
    const resp = await fetch(`${API_BASE}/demo-hash`);
    integrityHash = await resp.text();
  } catch (e) {
    console.warn('Failed to fetch integrity hash, using fallback');
    integrityHash = null;
  }
}

init();

// ── 正常加载 ──
function loadNormal() {
  const safeSrc = buildPageHtml(false, true);
  const unsafeSrc = buildPageHtml(false, false);

  setIframe('frameSafe', safeSrc);
  setIframe('frameUnsafe', unsafeSrc);

  hideOverlays();
  setState('normal', '正常状态：两个页面都加载了未篡改的脚本');
  document.getElementById('btnTamper').disabled = false;

  showExplanation('normal');
}

// ── 模拟篡改 ──
function loadTampered() {
  const safeSrc = buildPageHtml(true, true);
  const unsafeSrc = buildPageHtml(true, false);

  setIframe('frameSafe', safeSrc);
  setIframe('frameUnsafe', unsafeSrc);

  hideOverlays();
  setState('tampered', 'CDN 被篡改：脚本内容已被替换为恶意代码');

  showExplanation('tampered');
}

// ── 重置 ──
function resetAll() {
  document.getElementById('frameSafe').srcdoc = '';
  document.getElementById('frameUnsafe').srcdoc = '';
  document.getElementById('overlaySafe').classList.remove('hidden');
  document.getElementById('overlayUnsafe').classList.remove('hidden');
  document.getElementById('btnTamper').disabled = true;
  setState('idle', '等待操作…');
  document.getElementById('explanationSection').classList.add('hidden');
}

// ── 构建 iframe 内嵌 HTML ──
function buildPageHtml(tampered, withSri) {
  const scriptUrl = `${API_BASE}/demo.js${tampered ? '?tampered=true' : ''}`;
  const integrityAttr = (withSri && integrityHash)
    ? ` integrity="${integrityHash}" crossorigin="anonymous"`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.status-container {
  text-align: center;
  padding: 24px;
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
}
.status-container.safe {
  background: rgba(129,199,132,0.1);
  border: 2px solid rgba(129,199,132,0.4);
}
.status-container.hacked {
  background: rgba(255,107,107,0.1);
  border: 2px solid rgba(255,107,107,0.4);
  animation: pulse-red 1s ease-in-out 3;
}
@keyframes pulse-red {
  0%, 100% { border-color: rgba(255,107,107,0.4); }
  50% { border-color: rgba(255,107,107,1); box-shadow: 0 0 20px rgba(255,107,107,0.3); }
}
.status-icon { font-size: 2.5rem; margin-bottom: 12px; }
.status-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; }
.status-container.safe .status-title { color: #81c784; }
.status-container.hacked .status-title { color: #ff6b6b; }
.status-desc { font-size: 0.85rem; color: #999; margin-bottom: 12px; }
.stolen-data { text-align: left; margin: 12px 0; }
.data-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; margin-bottom: 4px;
  background: rgba(0,0,0,0.3); border-radius: 6px; font-size: 0.78rem;
}
.data-label { color: #ff6b6b; font-weight: 600; white-space: nowrap; margin-right: 8px; }
.data-value { color: #ffd700; font-family: monospace; text-align: right; word-break: break-all; }
.cookie-val { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.upload-progress { margin: 14px 0; text-align: left; }
.progress-text { font-size: 0.78rem; color: #ff6b6b; margin-bottom: 6px; }
.progress-bar { height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; width: 0; background: linear-gradient(90deg, #ffd700, #ff6b6b); border-radius: 3px; transition: width 0.3s; }
.keylog-section { margin-top: 14px; text-align: left; background: rgba(0,0,0,0.4); border-radius: 8px; padding: 12px; }
.keylog-title { font-size: 0.82rem; color: #ff6b6b; font-weight: 700; margin-bottom: 4px; }
.keylog-hint { font-size: 0.75rem; color: #888; margin-bottom: 8px; }
.keylog-input {
  width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,107,107,0.4);
  background: rgba(0,0,0,0.3); color: #fff; font-size: 0.85rem; outline: none; margin-bottom: 6px;
}
.keylog-input:focus { border-color: #ff6b6b; box-shadow: 0 0 8px rgba(255,107,107,0.3); }
.keylog-output { font-family: monospace; font-size: 0.82rem; color: #ffd700; min-height: 18px; word-break: break-all; }
.sri-blocked {
  text-align: center;
  padding: 24px;
  background: rgba(129,199,132,0.08);
  border: 2px solid rgba(129,199,132,0.3);
  border-radius: 12px;
}
.sri-blocked .icon { font-size: 2.5rem; margin-bottom: 12px; }
.sri-blocked .title { color: #81c784; font-weight: 700; font-size: 1.1rem; margin-bottom: 8px; }
.sri-blocked .desc { color: #999; font-size: 0.85rem; }
.loading { text-align: center; color: #666; padding: 40px; }
</style>
</head>
<body>
<div id="sri-demo-status">
  <div class="loading">加载中…</div>
</div>
<script src="${scriptUrl}"${integrityAttr}
  onerror="document.getElementById('sri-demo-status').innerHTML='<div class=sri-blocked><div class=icon>\\u{1F6E1}\\uFE0F</div><div class=title>SRI 保护生效 — 脚本被拦截</div><div class=desc>浏览器检测到文件哈希不匹配，拒绝执行被篡改的脚本。<br>页面安全。攻击者无法得逞。</div></div>';document.getElementById('sri-demo-status').className='status-container safe';">
</script>
</body>
</html>`;
}

// ── 工具函数 ──
function setIframe(id, srcdoc) {
  document.getElementById(id).srcdoc = srcdoc;
}

function hideOverlays() {
  document.getElementById('overlaySafe').classList.add('hidden');
  document.getElementById('overlayUnsafe').classList.add('hidden');
}

function setState(type, text) {
  const el = document.getElementById('currentState');
  const dotClass = type === 'normal' ? 'safe' : type === 'tampered' ? 'danger' : 'idle';
  el.innerHTML = `<span class="state-dot ${dotClass}"></span> ${text}`;
}

function showExplanation(mode) {
  const section = document.getElementById('explanationSection');
  const content = document.getElementById('explanationContent');
  section.classList.remove('hidden');

  if (mode === 'normal') {
    content.innerHTML = `
      <div class="explain-card">
        <h3><i class="ti ti-check"></i> 两边都正常</h3>
        <p>此时 CDN 上的脚本没有被篡改，文件内容是原始的。两个页面都正常加载，没有安全问题。</p>
        <p class="explain-hint">点击「模拟 CDN 被篡改」看看攻击发生时的差异。</p>
      </div>`;
  } else {
    content.innerHTML = `
      <div class="explain-grid">
        <div class="explain-card safe-explain">
          <h3><i class="ti ti-shield-check"></i> 左侧：有 SRI 保护</h3>
          <p>浏览器下载了被篡改的脚本，计算哈希后发现与 integrity 属性不匹配。</p>
          <p><strong>结果：拒绝执行</strong>。脚本触发 onerror 事件，页面显示「已拦截」。攻击者的代码从未运行。</p>
        </div>
        <div class="explain-card danger-explain">
          <h3><i class="ti ti-shield-off"></i> 右侧：无 SRI 保护</h3>
          <p>浏览器下载了被篡改的脚本，没有 integrity 属性 → 不做任何校验 → 直接执行。</p>
          <p><strong>结果：恶意代码全部运行</strong>。键盘记录器注入、Cookie 被窃取、页面即将被重定向。</p>
        </div>
      </div>
      <div class="explain-conclusion">
        <strong>区别只在一个 HTML 属性。</strong>加了 integrity 属性的页面能抵御 CDN 被黑，没加的页面直接沦陷。
      </div>`;
  }
}

// 导出供测试使用（Node.js 环境）
try {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildPageHtml, setState, showExplanation, setIntegrityHash: (h) => { integrityHash = h; } };
  }
} catch (e) { /* browser environment, ignore */ }
