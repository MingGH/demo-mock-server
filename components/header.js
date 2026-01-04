// 统一 Header 组件
(function() {
  // 加载 Umami 统计
  const umamiScript = document.createElement('script');
  umamiScript.defer = true;
  umamiScript.src = 'https://umami.runnable.run/script.js';
  umamiScript.dataset.websiteId = '60f1c767-3f2a-4be2-ad53-f9e4e1372785';
  document.head.appendChild(umamiScript);

  // 加载 Google AdSense
  const adsScript = document.createElement('script');
  adsScript.async = true;
  adsScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3694254708490002';
  adsScript.crossOrigin = 'anonymous';
  document.head.appendChild(adsScript);

  // 注入 Header 样式
  const style = document.createElement('style');
  style.textContent = `
    .site-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: rgba(10, 10, 15, 0.9);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 30px;
    }
    .site-header .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: white;
      font-weight: 700;
      font-size: 1.2rem;
    }
    .site-header .logo span {
      background: linear-gradient(90deg, #00d4ff, #a855f7);
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .site-header nav {
      display: flex;
      gap: 25px;
      align-items: center;
    }
    .site-header nav a {
      color: rgba(255,255,255,0.6);
      text-decoration: none;
      font-size: 14px;
      transition: all 0.3s;
      padding: 8px 0;
      position: relative;
    }
    .site-header nav a:hover {
      color: #00d4ff;
    }
    .site-header nav a.active {
      color: #00d4ff;
    }
    .site-header nav a.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, #00d4ff, #a855f7);
      border-radius: 2px;
    }
    .site-header .external-links {
      display: flex;
      gap: 15px;
      align-items: center;
    }
    .site-header .external-links a {
      color: rgba(255,255,255,0.5);
      text-decoration: none;
      font-size: 13px;
      transition: color 0.3s;
    }
    .site-header .external-links a:hover {
      color: #00d4ff;
    }
    
    /* 分享按钮 */
    .share-btn {
      background: linear-gradient(90deg, #00d4ff, #a855f7);
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .share-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
    }
    
    /* 分享弹窗 */
    .share-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 2000;
      align-items: center;
      justify-content: center;
    }
    .share-modal.show {
      display: flex;
    }
    .share-modal-content {
      background: #1a1a2e;
      border-radius: 16px;
      padding: 25px;
      width: 90%;
      max-width: 400px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .share-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .share-modal-header h3 {
      color: white;
      font-size: 1.1rem;
      margin: 0;
    }
    .share-modal-close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .share-modal-close:hover {
      color: white;
    }
    .share-options {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }
    .share-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 15px 10px;
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      color: white;
    }
    .share-option:hover {
      background: rgba(255,255,255,0.1);
      transform: translateY(-2px);
    }
    .share-option .icon {
      font-size: 28px;
    }
    .share-option .label {
      font-size: 12px;
      color: rgba(255,255,255,0.7);
    }
    .share-url-box {
      display: flex;
      gap: 10px;
    }
    .share-url-input {
      flex: 1;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 10px 12px;
      color: white;
      font-size: 13px;
    }
    .share-copy-btn {
      background: linear-gradient(90deg, #00d4ff, #a855f7);
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      color: white;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }
    .share-copy-btn:hover {
      opacity: 0.9;
    }
    .share-toast {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(74, 222, 128, 0.9);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 3000;
      display: none;
    }
    .share-toast.show {
      display: block;
      animation: fadeInOut 2s ease;
    }
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
      15% { opacity: 1; transform: translateX(-50%) translateY(0); }
      85% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
    
    body {
      padding-top: 80px !important;
    }
    @media (max-width: 600px) {
      .site-header { padding: 0 15px; }
      .site-header nav { gap: 15px; }
      .site-header .external-links { display: none; }
      .share-options { grid-template-columns: repeat(2, 1fr); }
    }
  `;
  document.head.appendChild(style);

  // 获取当前页面
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const isInPages = window.location.pathname.includes('/pages/');
  const prefix = isInPages ? '../' : '';

  // 创建 Header HTML
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <a href="${prefix}index.html" class="logo">
      🚀 <span>Mock Server</span>
    </a>
    <nav>
      <a href="${prefix}index.html" class="${currentPage === 'index.html' ? 'active' : ''}">首页</a>
      <a href="https://www.runnable.run/about" target="_blank">博客</a>
      <a href="https://github.com/MingGH/demo-mock-server" target="_blank">GitHub</a>
      <a href="https://996.ninja/" target="_blank">996忍者</a>
    </nav>
    <div class="external-links">
      <button class="share-btn" onclick="window.openShareModal()">
        <span>📤</span> 分享
      </button>
    </div>
  `;

  // 创建分享弹窗
  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.id = 'shareModal';
  modal.innerHTML = `
    <div class="share-modal-content">
      <div class="share-modal-header">
        <h3>分享到</h3>
        <button class="share-modal-close" onclick="window.closeShareModal()">×</button>
      </div>
      <div class="share-options">
        <button class="share-option" onclick="window.shareTo('weibo')">
          <span class="icon">🔴</span>
          <span class="label">微博</span>
        </button>
        <button class="share-option" onclick="window.shareTo('twitter')">
          <span class="icon">🐦</span>
          <span class="label">Twitter</span>
        </button>
        <button class="share-option" onclick="window.shareTo('linkedin')">
          <span class="icon">💼</span>
          <span class="label">LinkedIn</span>
        </button>
        <button class="share-option" onclick="window.shareTo('qrcode')">
          <span class="icon">📱</span>
          <span class="label">二维码</span>
        </button>
      </div>
      <div class="share-url-box">
        <input type="text" class="share-url-input" id="shareUrlInput" readonly>
        <button class="share-copy-btn" onclick="window.copyShareUrl()">复制链接</button>
      </div>
    </div>
  `;

  // 创建Toast提示
  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.id = 'shareToast';
  toast.textContent = '链接已复制！';

  // 插入到 body
  document.body.insertBefore(header, document.body.firstChild);
  document.body.appendChild(modal);
  document.body.appendChild(toast);

  // 分享功能
  window.openShareModal = function() {
    document.getElementById('shareModal').classList.add('show');
    document.getElementById('shareUrlInput').value = window.location.href;
  };

  window.closeShareModal = function() {
    document.getElementById('shareModal').classList.remove('show');
  };

  window.shareTo = function(platform) {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(document.title);
    let shareUrl = '';

    switch(platform) {
      case 'weibo':
        shareUrl = `https://service.weibo.com/share/share.php?url=${url}&title=${title}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${title}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
        break;
      case 'qrcode':
        // 使用QR码API生成二维码
        shareUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}`;
        window.open(shareUrl, '_blank', 'width=300,height=300');
        return;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=500');
    }
    window.closeShareModal();
  };

  window.copyShareUrl = function() {
    const input = document.getElementById('shareUrlInput');
    input.select();
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(() => {
        showToast('链接已复制！');
      });
    } else {
      document.execCommand('copy');
      showToast('链接已复制！');
    }
  };

  function showToast(message) {
    const toast = document.getElementById('shareToast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // 点击弹窗外部关闭
  document.getElementById('shareModal').addEventListener('click', function(e) {
    if (e.target === this) {
      window.closeShareModal();
    }
  });
})();
