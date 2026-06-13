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

// ── 构建 iframe 内嵌 HTML：模拟银行登录页 ──
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
  background: #0f1923;
  color: #e0e0e0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.bank-card {
  width: 100%; max-width: 340px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 28px 24px;
}
.bank-logo {
  text-align: center; margin-bottom: 18px;
  font-size: 1.1rem; font-weight: 700; color: #90caf9;
}
.bank-logo span { opacity: 0.6; font-size: 0.75rem; font-weight: 400; display: block; margin-top: 2px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 0.78rem; color: #888; margin-bottom: 5px; }
.form-group input {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.3);
  color: #fff; font-size: 0.9rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
}
.form-group input:focus { border-color: #90caf9; }
.login-btn {
  width: 100%; padding: 11px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #42a5f5, #1e88e5); color: #fff;
  font-size: 0.9rem; font-weight: 600; cursor: pointer; margin-top: 6px;
}
.login-btn:hover { opacity: 0.9; }
.script-status {
  text-align: center; font-size: 0.68rem; margin-top: 14px; padding: 5px 8px;
  border-radius: 4px; background: rgba(255,255,255,0.03);
}
.script-status.normal { color: #666; }
.script-status.hacked { color: #ff6b6b; background: rgba(255,50,50,0.08); }
/* 键盘记录面板 */
#keylog-panel {
  display: none; margin-top: 14px; background: rgba(255,50,50,0.06);
  border: 1px solid rgba(255,50,50,0.3); border-radius: 8px; padding: 10px;
}
#keylog-panel .panel-title { font-size: 0.75rem; color: #ff6b6b; font-weight: 600; margin-bottom: 6px; }
#keylog-content { font-family: monospace; font-size: 0.72rem; color: #ffd700; max-height: 80px; overflow-y: auto; }
.log-line { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.log-field { color: #ff6b6b; }
#stolen-cookie { font-family: monospace; font-size: 0.7rem; color: #ffd700; margin-top: 4px; word-break: break-all; }
/* 钓鱼覆盖层 */
#phishing-overlay {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  align-items: center; justify-content: center; z-index: 999;
}
.phishing-box {
  background: #1a1a2e; border: 2px solid #ff6b6b; border-radius: 12px;
  padding: 24px; max-width: 300px; text-align: center;
}
.phishing-box .title { color: #ff6b6b; font-size: 0.95rem; font-weight: 700; margin-bottom: 8px; }
.phishing-box .desc { color: #ccc; font-size: 0.8rem; margin-bottom: 12px; }
.phishing-box input {
  width: 100%; padding: 8px 10px; border-radius: 6px; margin-bottom: 8px;
  border: 1px solid rgba(255,50,50,0.4); background: rgba(0,0,0,0.4); color: #fff; font-size: 0.82rem;
}
.phishing-box button {
  width: 100%; padding: 9px; border: none; border-radius: 6px;
  background: #ff6b6b; color: #fff; font-weight: 600; cursor: pointer;
}
/* SRI 拦截状态 */
.sri-blocked-banner {
  margin-top: 14px; padding: 12px; border-radius: 8px;
  background: rgba(129,199,132,0.08); border: 1px solid rgba(129,199,132,0.3);
  text-align: center;
}
.sri-blocked-banner .title { color: #81c784; font-weight: 700; font-size: 0.85rem; margin-bottom: 4px; }
.sri-blocked-banner .desc { color: #999; font-size: 0.75rem; }
</style>
</head>
<body>

<div class="bank-card">
  <div class="bank-logo">SecureBank Online<span>模拟银行登录页</span></div>
  <div class="form-group">
    <label>账号</label>
    <input type="text" placeholder="手机号/邮箱" autocomplete="off" />
  </div>
  <div class="form-group">
    <label>密码</label>
    <input type="password" placeholder="输入密码" autocomplete="off" />
  </div>
  <button class="login-btn">登 录</button>
  <div class="script-status" id="script-status">加载第三方脚本中...</div>

  <!-- 键盘记录面板（恶意脚本激活后显示） -->
  <div id="keylog-panel">
    <div class="panel-title">攻击者后台 — 实时截获</div>
    <div id="keylog-content"></div>
    <div id="stolen-cookie"></div>
  </div>

  <!-- SRI 拦截提示（onerror 时显示） -->
  <div class="sri-blocked-banner" id="sri-blocked" style="display:none;">
    <div class="title">SRI 保护生效 — 脚本被拦截</div>
    <div class="desc">浏览器检测到文件被篡改，拒绝执行。页面正常使用不受影响。</div>
  </div>
</div>

<!-- 钓鱼覆盖层（恶意脚本 3 秒后弹出） -->
<div id="phishing-overlay">
  <div class="phishing-box">
    <div class="title">安全验证</div>
    <div class="desc">检测到异常登录，请重新验证身份</div>
    <input type="text" placeholder="重新输入手机号" />
    <input type="password" placeholder="重新输入密码" />
    <button>确认验证</button>
    <div style="margin-top:8px;font-size:0.65rem;color:#ff6b6b;">这是攻击者注入的虚假弹窗</div>
  </div>
</div>

<script src="${scriptUrl}"${integrityAttr}
  onerror="document.getElementById('script-status').style.display='none';document.getElementById('sri-blocked').style.display='block';">
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
