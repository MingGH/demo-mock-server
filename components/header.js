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
    body {
      padding-top: 80px !important;
    }
    @media (max-width: 600px) {
      .site-header { padding: 0 15px; }
      .site-header nav { gap: 15px; }
      .site-header .external-links { display: none; }
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
      <a href="${prefix}pages/mock-data.html" class="${currentPage === 'mock-data.html' ? 'active' : ''}">数据分页</a>
      <a href="${prefix}pages/chinese-names.html" class="${currentPage === 'chinese-names.html' ? 'active' : ''}">中文名生成</a>
      <a href="${prefix}pages/word-cloud.html" class="${currentPage === 'word-cloud.html' ? 'active' : ''}">词云分析</a>
    </nav>
    <div class="external-links">
      <a href="https://github.com/MingGH/demo-mock-server" target="_blank">GitHub</a>
      <a href="https://www.runnable.run/" target="_blank">博客</a>
    </div>
  `;

  // 插入到 body 最前面
  document.body.insertBefore(header, document.body.firstChild);
})();
