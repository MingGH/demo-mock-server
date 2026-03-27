(function() {
  const umamiScript = document.createElement('script');
  umamiScript.defer = true;
  umamiScript.src = 'https://umami.runnable.run/script.js';
  umamiScript.dataset.websiteId = '60f1c767-3f2a-4be2-ad53-f9e4e1372785';
  document.head.appendChild(umamiScript);

  const adsScript = document.createElement('script');
  adsScript.async = true;
  adsScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3694254708490002';
  adsScript.crossOrigin = 'anonymous';
  document.head.appendChild(adsScript);

  const style = document.createElement('style');
  style.textContent = `
    .site-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: rgba(10, 12, 18, 0.72);
      backdrop-filter: blur(24px) saturate(140%);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      box-shadow: 0 10px 30px rgba(0,0,0,0.16);
    }
    .site-header-inner {
      max-width: 1180px;
      height: 68px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .site-header .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: #f8fafc;
      font-weight: 700;
      font-size: 1.02rem;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }
    .site-header .logo-mark {
      width: 34px;
      height: 34px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(168,85,247,0.18));
      border: 1px solid rgba(255,255,255,0.08);
      color: #c4b5fd;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .site-header .logo-text {
      display: flex;
      flex-direction: column;
      line-height: 1.05;
    }
    .site-header .logo-title {
      color: #f8fafc;
    }
    .site-header .logo-subtitle {
      color: rgba(255,255,255,0.38);
      font-size: 11px;
      font-weight: 500;
      margin-top: 3px;
    }
    .site-header nav {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px;
      border-radius: 999px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .site-header nav a {
      color: rgba(255,255,255,0.58);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: color 0.22s ease, background 0.22s ease, transform 0.22s ease;
      padding: 8px 14px;
      border-radius: 999px;
      position: relative;
      white-space: nowrap;
    }
    .site-header nav a:hover {
      color: #f8fafc;
      background: rgba(255,255,255,0.05);
    }
    .site-header nav a.active {
      color: #f8fafc;
      background: rgba(255,255,255,0.08);
    }
    .site-header nav a.active::after {
      content: '';
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 4px;
      height: 1.5px;
      background: linear-gradient(90deg, rgba(96,165,250,0.95), rgba(167,139,250,0.95));
      border-radius: 999px;
    }
    .site-header .external-links {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .share-btn {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 999px;
      padding: 9px 14px;
      color: rgba(255,255,255,0.86);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.22s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .share-btn:hover {
      transform: translateY(-1px);
      background: rgba(255,255,255,0.09);
      border-color: rgba(255,255,255,0.14);
    }
    .share-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 24px;
      background: rgba(3,6,12,0.58);
      backdrop-filter: blur(10px);
      z-index: 2000;
      align-items: center;
      justify-content: center;
    }
    .share-modal.show {
      display: flex;
    }
    .share-modal-content {
      width: min(460px, 100%);
      background: linear-gradient(180deg, rgba(20,24,36,0.98), rgba(12,16,26,0.98));
      border-radius: 22px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 28px 80px rgba(0,0,0,0.38);
    }
    .share-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }
    .share-modal-header h3 {
      color: #f8fafc;
      font-size: 1.02rem;
      font-weight: 700;
      margin: 0;
    }
    .share-modal-close {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.62);
      font-size: 20px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .share-modal-close:hover {
      color: #fff;
      background: rgba(255,255,255,0.08);
    }
    .share-options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .share-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: rgba(255,255,255,0.04);
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid rgba(255,255,255,0.06);
      color: #f8fafc;
      text-align: left;
    }
    .share-option:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.12);
      transform: translateY(-1px);
    }
    .share-option .icon {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .share-option .icon svg {
      width: 20px;
      height: 20px;
    }
    .share-option .label {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
      color: #f8fafc;
      font-weight: 600;
    }
    .share-option .label small {
      font-size: 11px;
      color: rgba(255,255,255,0.46);
      font-weight: 500;
    }
    .share-url-box {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .share-url-input {
      flex: 1;
      height: 42px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 0 14px;
      color: #f8fafc;
      font-size: 13px;
    }
    .share-copy-btn {
      height: 42px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      border: none;
      border-radius: 12px;
      padding: 0 16px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .share-copy-btn:hover {
      opacity: 0.94;
      transform: translateY(-1px);
    }
    .share-toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15,23,42,0.92);
      color: #f8fafc;
      padding: 10px 16px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
      z-index: 3000;
      display: none;
      box-shadow: 0 14px 30px rgba(0,0,0,0.24);
    }
    .share-toast.show {
      display: block;
      animation: fadeInOut 2.2s ease;
    }
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
      15% { opacity: 1; transform: translateX(-50%) translateY(0); }
      85% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
    }
    body {
      padding-top: 92px !important;
    }
    @media (max-width: 900px) {
      .site-header-inner {
        height: auto;
        min-height: 68px;
        padding: 12px 16px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .site-header nav {
        order: 3;
        width: 100%;
        justify-content: center;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .site-header nav::-webkit-scrollbar {
        display: none;
      }
      .site-header .external-links {
        margin-left: auto;
      }
      body {
        padding-top: 126px !important;
      }
    }
    @media (max-width: 600px) {
      .site-header-inner {
        padding: 12px;
        gap: 12px;
      }
      .site-header .logo-subtitle {
        display: none;
      }
      .site-header nav a {
        padding: 8px 12px;
      }
      .share-modal {
        padding: 14px;
      }
      .share-modal-content {
        padding: 18px;
        border-radius: 18px;
      }
      .share-options {
        grid-template-columns: 1fr;
      }
      .share-url-box {
        flex-direction: column;
      }
      .share-url-input, .share-copy-btn {
        width: 100%;
      }
      body {
        padding-top: 128px !important;
      }
    }
  `;
  document.head.appendChild(style);

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const isInPages = window.location.pathname.includes('/pages/');
  const prefix = isInPages ? '../' : '';

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="site-header-inner">
      <a href="${prefix}index.html" class="logo">
        <span class="logo-mark"><i class="ti ti-brain"></i></span>
        <span class="logo-text">
          <span class="logo-title">数字直觉</span>
          <span class="logo-subtitle">用交互把复杂问题讲清楚</span>
        </span>
      </a>
      <nav>
        <a href="${prefix}index.html" class="${currentPage === 'index.html' ? 'active' : ''}">首页</a>
        <a href="https://www.runnable.run/about" target="_blank" rel="noopener noreferrer">博客</a>
        <a href="https://github.com/MingGH/demo-mock-server" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="https://996.ninja/" target="_blank" rel="noopener noreferrer">996 忍者</a>
      </nav>
      <div class="external-links">
        <button class="share-btn" type="button" onclick="window.openShareModal()">
          <i class="ti ti-share"></i>
          <span>分享</span>
        </button>
      </div>
    </div>
  `;

  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.id = 'shareModal';
  modal.innerHTML = `
    <div class="share-modal-content">
      <div class="share-modal-header">
        <h3>分享这个页面</h3>
        <button class="share-modal-close" type="button" onclick="window.closeShareModal()">×</button>
      </div>
      <div class="share-options">
        <button class="share-option" type="button" onclick="window.shareTo('weibo')">
          <span class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 20 20"><path fill="currentColor" d="M14.812 9.801c-.778-.141-.4-.534-.4-.534s.761-1.178-.15-2.034c-1.13-1.061-3.877.135-3.877.135c-1.05.306-.77-.14-.622-.897c0-.892-.326-2.402-3.12-1.51C3.853 5.858 1.455 9 1.455 9C-.212 11.087.01 12.7.01 12.7c.416 3.562 4.448 4.54 7.584 4.771c3.299.243 7.752-1.067 9.102-3.76c1.35-2.696-1.104-3.763-1.884-3.91Zm-1.044 2.549c0 2.051-2.653 3.977-5.93 4.117c-3.276.144-5.923-1.398-5.923-3.45c0-2.054 2.647-3.7 5.923-3.842c3.277-.142 5.93 1.126 5.93 3.175Zm-6.584-1.823c-3.293.362-2.913 3.259-2.913 3.259s-.034.917.883 1.384c1.927.98 3.912.387 4.915-.829c1.003-1.216.415-4.173-2.885-3.814Zm.281 3.075c0 .48-.498.925-1.112.99c-.614.068-1.11-.265-1.11-.747s.44-.985 1.055-1.045c.707-.064 1.167.318 1.167.802Zm1.003-1.15c.11.174.031.437-.173.588c-.208.146-.464.126-.574-.05c-.115-.17-.072-.445.139-.588c.244-.171.498-.122.608.05Zm4.86-9.806c.335-.06 1.532-.281 2.696-.025c2.083.456 4.941 2.346 3.655 6.368c-.094.575-.398.62-.76.62c-.432 0-.781-.255-.781-.662c0-.352.155-.71.155-.71c.046-.148.411-1.07-.241-2.448c-1.198-1.887-3.609-1.915-3.893-1.807a3.48 3.48 0 0 1-.591.141l-.106.016l-.014.002c-.437 0-.786-.333-.786-.737a.75.75 0 0 1 .573-.715s.007-.011.018-.014c.024-.004.049-.027.075-.029Zm.66 2.611s3.367-.584 2.964 2.811a.21.21 0 0 1-.007.054c-.037.241-.264.426-.529.426c-.3 0-.543-.225-.543-.507c0 0 .534-2.269-1.885-1.768c-.299 0-.538-.227-.538-.505c0-.283.24-.51.538-.51Z"/></svg></span>
          <span class="label">微博<small>发到公开动态</small></span>
        </button>
        <button class="share-option" type="button" onclick="window.shareTo('twitter')">
          <span class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg></span>
          <span class="label">Twitter<small>分享给国际读者</small></span>
        </button>
        <button class="share-option" type="button" onclick="window.shareTo('linkedin')">
          <span class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg></span>
          <span class="label">LinkedIn<small>偏职业场景</small></span>
        </button>
        <button class="share-option" type="button" onclick="window.shareTo('qrcode')">
          <span class="icon"><i class="ti ti-qrcode" style="font-size:28px"></i></span>
          <span class="label">二维码<small>适合手机扫码</small></span>
        </button>
      </div>
      <div class="share-url-box">
        <input type="text" class="share-url-input" id="shareUrlInput" readonly>
        <button class="share-copy-btn" type="button" onclick="window.copyShareUrl()">复制链接</button>
      </div>
    </div>
  `;

  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.id = 'shareToast';
  toast.textContent = '链接已复制！';

  document.body.insertBefore(header, document.body.firstChild);
  document.body.appendChild(modal);
  document.body.appendChild(toast);

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

  document.getElementById('shareModal').addEventListener('click', function(e) {
    if (e.target === this) {
      window.closeShareModal();
    }
  });
})();
