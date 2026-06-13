// ========== SRI 安全实验室 ==========
const API_BASE = 'https://numfeel-api.996.ninja/sri';
let integrityHash = null;

// ── 初始化 ──
async function init() {
  try {
    if (typeof fetch === 'undefined' || location.protocol === 'file:') return;
    const resp = await fetch(`${API_BASE}/demo-hash`);
    integrityHash = await resp.text();
  } catch (e) {
    console.warn('Failed to fetch integrity hash, using fallback');
    integrityHash = null;
  }
  // 页面加载后自动显示正常状态
  loadNormal();
}

init();

// ── Step 1: 自动加载正常版本 ──
function loadNormal() {
  document.getElementById('frameSafe').srcdoc = buildPageHtml(false, true);
  document.getElementById('frameUnsafe').srcdoc = buildPageHtml(false, false);
}

// ── Step 2: 模拟篡改 ──
function simulateTamper() {
  // 重新加载两个 iframe，这次后端返回"恶意"版本
  document.getElementById('frameSafe').srcdoc = buildPageHtml(true, true);
  document.getElementById('frameUnsafe').srcdoc = buildPageHtml(true, false);

  // 视觉反馈：右侧 iframe wrapper 加红色边框
  document.getElementById('wrapperUnsafe').classList.add('hacked');
  document.getElementById('wrapperSafe').classList.add('blocked');

  // 隐藏 step1/step2，显示 step3
  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.add('hidden');
  document.getElementById('step3').classList.remove('hidden');
}

// ── 重置 ──
function resetDemo() {
  document.getElementById('wrapperUnsafe').classList.remove('hacked');
  document.getElementById('wrapperSafe').classList.remove('blocked');
  document.getElementById('step1').classList.remove('hidden');
  document.getElementById('step2').classList.remove('hidden');
  document.getElementById('step3').classList.add('hidden');
  loadNormal();
}

// ── 构建 iframe 内嵌 HTML：模拟银行登录页 ──
function buildPageHtml(tampered, withSri) {
  const scriptUrl = `${API_BASE}/demo.js${tampered ? '?tampered=true' : ''}`;
  const integrityAttr = (withSri && integrityHash)
    ? ` integrity="${integrityHash}" crossorigin="anonymous"`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f1923;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.bank-card{width:100%;max-width:340px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:28px 24px}
.bank-logo{text-align:center;margin-bottom:18px;font-size:1.1rem;font-weight:700;color:#90caf9}
.bank-logo span{opacity:0.6;font-size:0.75rem;font-weight:400;display:block;margin-top:2px}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:0.78rem;color:#888;margin-bottom:5px}
.form-group input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:0.9rem;outline:none;transition:border-color 0.2s,box-shadow 0.2s}
.form-group input:focus{border-color:#90caf9}
.login-btn{width:100%;padding:11px;border:none;border-radius:8px;background:linear-gradient(135deg,#42a5f5,#1e88e5);color:#fff;font-size:0.9rem;font-weight:600;cursor:pointer;margin-top:6px}
.script-status{text-align:center;font-size:0.68rem;margin-top:14px;padding:5px 8px;border-radius:4px;background:rgba(255,255,255,0.03)}
.script-status.normal{color:#666}
.script-status.hacked{color:#ff6b6b;background:rgba(255,50,50,0.08)}
#keylog-panel{display:none;margin-top:14px;background:rgba(255,50,50,0.06);border:1px solid rgba(255,50,50,0.3);border-radius:8px;padding:10px}
#keylog-panel .panel-title{font-size:0.75rem;color:#ff6b6b;font-weight:600;margin-bottom:6px}
#keylog-content{font-family:monospace;font-size:0.72rem;color:#ffd700;max-height:80px;overflow-y:auto}
.log-line{padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.log-field{color:#ff6b6b}
#stolen-cookie{font-family:monospace;font-size:0.7rem;color:#ffd700;margin-top:4px;word-break:break-all}
#phishing-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);align-items:center;justify-content:center;z-index:999}
.phishing-box{background:#1a1a2e;border:2px solid #ff6b6b;border-radius:12px;padding:24px;max-width:300px;text-align:center}
.phishing-box .title{color:#ff6b6b;font-size:0.95rem;font-weight:700;margin-bottom:8px}
.phishing-box .desc{color:#ccc;font-size:0.8rem;margin-bottom:12px}
.phishing-box input{width:100%;padding:8px 10px;border-radius:6px;margin-bottom:8px;border:1px solid rgba(255,50,50,0.4);background:rgba(0,0,0,0.4);color:#fff;font-size:0.82rem}
.phishing-box button{width:100%;padding:9px;border:none;border-radius:6px;background:#ff6b6b;color:#fff;font-weight:600;cursor:pointer}
.phishing-box .warning{margin-top:8px;font-size:0.65rem;color:#ff6b6b}
.sri-blocked-banner{margin-top:14px;padding:12px;border-radius:8px;background:rgba(129,199,132,0.08);border:1px solid rgba(129,199,132,0.3);text-align:center}
.sri-blocked-banner .title{color:#81c784;font-weight:700;font-size:0.85rem;margin-bottom:4px}
.sri-blocked-banner .desc{color:#999;font-size:0.75rem}
</style></head>
<body>
<div class="bank-card">
  <div class="bank-logo">SecureBank Online<span>模拟银行登录页</span></div>
  <div class="form-group"><label>账号</label><input type="text" placeholder="手机号/邮箱" autocomplete="off" /></div>
  <div class="form-group"><label>密码</label><input type="password" placeholder="输入密码" autocomplete="off" /></div>
  <button class="login-btn">登 录</button>
  <div class="script-status" id="script-status">加载第三方脚本中...</div>
  <div id="keylog-panel"><div class="panel-title">攻击者后台 — 实时截获</div><div id="keylog-content"></div><div id="stolen-cookie"></div></div>
  <div class="sri-blocked-banner" id="sri-blocked" style="display:none"><div class="title">SRI 保护生效 — 篡改脚本已拦截</div><div class="desc">浏览器检测到文件被篡改，拒绝执行。登录页正常使用。</div></div>
</div>
<div id="phishing-overlay"><div class="phishing-box"><div class="title">安全验证</div><div class="desc">检测到异常登录，请重新验证身份</div><input type="text" placeholder="重新输入手机号" /><input type="password" placeholder="重新输入密码" /><button>确认验证</button><div class="warning">* 这是攻击者注入的虚假弹窗</div></div></div>
<script src="${scriptUrl}"${integrityAttr} onerror="document.getElementById('script-status').style.display='none';document.getElementById('sri-blocked').style.display='block';"></script>
</body></html>`;
}

// ── 下载 HTML 文件（和 iframe 内容一致，只差 SRI 属性） ──
function downloadSafe() {
  const html = buildPageHtml(true, true);
  downloadFile('safe.html', html);
}

function downloadUnsafe() {
  const html = buildPageHtml(true, false);
  downloadFile('unsafe.html', html);
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 导出供测试使用（Node.js 环境）
try {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildPageHtml, setIntegrityHash: (h) => { integrityHash = h; } };
  }
} catch (e) { /* browser environment, ignore */ }
