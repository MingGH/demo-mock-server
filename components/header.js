(function() {
  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const pathname = window.location.pathname;
  const currentPage = pathname.split('/').pop() || 'index.html';
  const isHome = currentPage === 'index.html' && !pathname.includes('/pages/');

  // 计算到根目录的相对路径深度
  // 根目录页面: prefix = ''
  // pages/xxx.html: prefix = '../'
  // pages/xxx/index.html: prefix = '../../'
  const pagesIdx = pathname.indexOf('/pages/');
  let prefix = '';
  if (pagesIdx !== -1) {
    const afterPages = pathname.slice(pagesIdx + '/pages/'.length);
    // afterPages 形如 'foo.html' 或 'foo/index.html'
    const depth = afterPages.split('/').length; // 1 = 直接在pages下, 2 = 子目录
    prefix = depth >= 2 ? '../../' : '../';
  }
  const accentMap = {
    probability: '别赌直觉',
    finance: '别被数字哄',
    psychology: '脑子会骗人',
    technology: '技术也会飘',
    philosophy: '想法别装深',
    default: '先点再信'
  };
  const homeNotes = {
    probability: '最爱打脸直觉',
    finance: '钱的错觉很多',
    psychology: '你比算法倔',
    technology: '热词总会凉',
    philosophy: '想法别摆谱',
    default: '先上手再说'
  };
  const navLinks = [
    { href: `${prefix}index.html`, icon: 'ph:house-line', text: '首页', active: isHome },
    { href: 'https://www.runnable.run/about', icon: 'ph:pen-nib', text: '博客', external: true },
    { href: 'https://github.com/MingGH/demo-mock-server', icon: 'ph:github-logo', text: '源码', external: true },
    { href: 'https://996.ninja/', icon: 'ph:sword', text: '996 忍者', external: true }
  ];

  loadAssets();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  function loadAssets() {
    // 预加载 Chart.js，让后续页面命中缓存
    ensureLink('data-chartjs-preload', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', 'preload', 'script');

    // 按需加载 Chart.js，供页面调用: loadChartJS().then(() => { new Chart(...) })
    let _chartPromise;
    window.loadChartJS = function() {
      if (window.Chart) return Promise.resolve();
      if (_chartPromise) return _chartPromise;
      _chartPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return _chartPromise;
    };
    ensureScript('data-umami-script', {
      defer: true,
      src: 'https://umami.runnable.run/script.js',
      dataset: { websiteId: '60f1c767-3f2a-4be2-ad53-f9e4e1372785' }
    });
    ensureScript('data-ads-script', {
      async: true,
      src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3694254708490002',
      crossOrigin: 'anonymous'
    });
    ensureScript('data-iconify-script', {
      defer: true,
      src: 'https://code.iconify.design/iconify-icon/1.0.8/iconify-icon.min.js'
    });
    ensureLink('data-tabler-css', 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css');
    ensureLink('data-header-theme', `${prefix}components/header.css`);
  }

  function boot() {
    if (!document.body || document.body.dataset.headerMounted === 'yes') {
      return;
    }

    document.body.dataset.headerMounted = 'yes';
    document.body.classList.add('numfeel-shell', isHome ? 'home-page' : 'detail-page');

    buildBackdrop();
    buildHeader();
    buildShareModal();

    if (isHome) {
      createHomeShell();
      enhanceHomePage();
    } else {
      createDetailShell();
      enhanceDetailPage();
      buildRelatedFooter();
    }

    window.addEventListener('keydown', handleEscape);
  }

  function ensureScript(flagName, options) {
    if (document.querySelector(`script[${flagName}]`)) {
      return;
    }

    const script = document.createElement('script');
    script.setAttribute(flagName, 'true');
    Object.entries(options).forEach(([key, value]) => {
      if (key === 'dataset') {
        Object.entries(value).forEach(([dataKey, dataValue]) => {
          script.dataset[dataKey] = dataValue;
        });
        return;
      }

      if (value === true) {
        script[key] = true;
      } else if (value !== false && value != null) {
        script[key] = value;
      }
    });
    document.head.appendChild(script);
  }

  function ensureLink(flagName, href, rel, as) {
    if (document.querySelector(`link[${flagName}]`)) {
      return;
    }

    const link = document.createElement('link');
    link.setAttribute(flagName, 'true');
    link.rel = rel || 'stylesheet';
    link.href = href;
    if (as) link.setAttribute('as', as);
    document.head.appendChild(link);
  }

  function buildBackdrop() {
    const backdrop = document.createElement('div');
    backdrop.className = 'site-backdrop';
    backdrop.innerHTML = `
      <div class="site-noise"></div>
      <div class="site-orb site-orb-one"></div>
      <div class="site-orb site-orb-two"></div>
    `;
    document.body.prepend(backdrop);
  }

  function createHomeShell() {
    if (document.querySelector('.site-stage')) {
      return;
    }

    const targets = [
      document.querySelector('h1'),
      document.querySelector('.search-section'),
      document.getElementById('filterTags'),
      document.getElementById('noResults'),
      document.getElementById('categoriesContainer'),
      document.querySelector('.footer')
    ].filter(Boolean);

    if (targets.length === 0) {
      return;
    }

    const hostParent = targets[0].parentNode;
    const sameParent = targets.every((node) => node.parentNode === hostParent);
    if (!sameParent) {
      return;
    }

    const stage = buildStageShell();
    hostParent.insertBefore(stage, targets[0]);
    const content = stage.querySelector('.site-content');

    targets.forEach((node) => {
      content.appendChild(node);
    });
  }

  function createDetailShell() {
    if (document.querySelector('.site-stage')) {
      return;
    }

    const container = document.querySelector('body > .container');
    if (!container) {
      return;
    }

    const stage = buildStageShell();
    container.parentNode.insertBefore(stage, container);
    stage.querySelector('.site-content').appendChild(container);
  }

  function buildStageShell() {
    const stage = document.createElement('div');
    stage.className = 'site-stage';

    const content = document.createElement('main');
    content.className = 'site-content';

    const rail = document.createElement('aside');
    rail.className = 'site-rail';

    stage.appendChild(content);
    stage.appendChild(rail);
    return stage;
  }

  function buildHeader() {
    const header = document.createElement('header');
    header.className = 'site-header';
    const navHtml = navLinks.map((link) => {
      const attrs = link.external ? 'target="_blank" rel="noopener noreferrer"' : '';
      const activeClass = link.active ? ' class="active"' : '';
      return `
          <a href="${link.href}"${activeClass} ${attrs}>
            <iconify-icon icon="${link.icon}"></iconify-icon>
            <span>${link.text}</span>
          </a>
      `;
    }).join('');
    header.innerHTML = `
      <div class="site-header-inner">
        <a href="${prefix}index.html" class="logo">
          <span class="logo-mark">
            <iconify-icon icon="ph:sparkle-fill"></iconify-icon>
          </span>
          <span class="logo-text">
            <span class="logo-title">数字直觉</span>
            <span class="logo-subtitle">别信模板，先上手</span>
          </span>
        </a>
        <nav>
          ${navHtml}
        </nav>
        <div class="external-links">
          <button class="share-btn" type="button" onclick="window.openShareModal()">
            <iconify-icon icon="ph:paper-plane-tilt"></iconify-icon>
            <span>发给朋友</span>
          </button>
        </div>
      </div>
    `;
    document.body.prepend(header);
  }

  function buildShareModal() {
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.id = 'shareModal';
    modal.innerHTML = `
      <div class="share-modal-content">
        <div class="share-modal-header">
          <h3>这页挺上头</h3>
          <button class="share-modal-close" type="button" onclick="window.closeShareModal()">×</button>
        </div>
        <div class="share-options">
          <button class="share-option" type="button" onclick="window.shareTo('weibo')">
            <span class="icon"><iconify-icon icon="ri:weibo-fill"></iconify-icon></span>
            <span class="label">微博<small>丢到公屏</small></span>
          </button>
          <button class="share-option" type="button" onclick="window.shareTo('twitter')">
            <span class="icon"><iconify-icon icon="ri:twitter-x-fill"></iconify-icon></span>
            <span class="label">X<small>丢给海外</small></span>
          </button>
          <button class="share-option" type="button" onclick="window.shareTo('linkedin')">
            <span class="icon"><iconify-icon icon="ri:linkedin-fill"></iconify-icon></span>
            <span class="label">LinkedIn<small>发给同事</small></span>
          </button>
          <button class="share-option" type="button" onclick="window.shareTo('qrcode')">
            <span class="icon"><iconify-icon icon="ph:qr-code"></iconify-icon></span>
            <span class="label">二维码<small>手机扫一下</small></span>
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
    toast.textContent = '链接已复制';

    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeShareModal();
      }
    });

    document.body.appendChild(modal);
    document.body.appendChild(toast);

    window.openShareModal = function() {
      const input = document.getElementById('shareUrlInput');
      if (input) {
        input.value = window.location.href;
      }
      modal.classList.add('show');
    };

    window.closeShareModal = closeShareModal;
    window.shareTo = shareTo;
    window.copyShareUrl = copyShareUrl;
  }

  function enhanceHomePage() {
    const content = document.querySelector('.site-content');
    const rail = document.querySelector('.site-rail');
    const title = document.querySelector('h1');
    const search = document.querySelector('.search-section');
    const filters = document.getElementById('filterTags');
    const categories = document.getElementById('categoriesContainer');
    const noResults = document.getElementById('noResults');
    const footer = document.querySelector('.footer');
    const total = document.getElementById('totalCount');
    const sectionCount = document.querySelectorAll('.category-section').length;

    if (!content || !title || !search || !filters || !categories) {
      return;
    }
    if (content.querySelector('.home-editorial')) {
      enrichHomeSections();
      return;
    }

    const totalValue = total ? total.textContent : '73';
    title.classList.add('site-home-title');
    title.textContent = '数字直觉';

    rail.innerHTML = `
      <div class="rail-card">
        <span class="rail-kicker"><iconify-icon icon="ph:hand-pointing"></iconify-icon>别只收藏</span>
        <h3>先随便点一页</h3>
        <p>手一动，理解就快。</p>
      </div>
      <div class="rail-card">
        <span class="rail-kicker"><iconify-icon icon="ph:stack"></iconify-icon>今天能刷</span>
        <h3>${totalValue} 个实验</h3>
        <p>${sectionCount} 组主题。</p>
        <div class="rail-links">
          <button class="rail-button" type="button" onclick="window.openShareModal()">
            <iconify-icon icon="ph:paper-plane-tilt"></iconify-icon>
            <span>发给朋友</span>
          </button>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.className = 'home-editorial';
    content.appendChild(wrapper);

    const lead = document.createElement('section');
    lead.className = 'home-lead';
    lead.innerHTML = `
      <span class="home-eyebrow">
        <iconify-icon icon="ph:fire-simple"></iconify-icon>
        <span>反模板实验场</span>
      </span>
      <div class="home-copy">
        <p>这站不卖课。</p>
        <p>只拿交互讲明白。</p>
        <p>你先点，再信。</p>
      </div>
      <div class="home-metrics">
        <div class="home-metric">
          <strong>${totalValue}</strong>
          <span>可上手页面</span>
        </div>
        <div class="home-metric">
          <strong>${sectionCount}</strong>
          <span>不同脑洞区</span>
        </div>
      </div>
    `;
    lead.insertBefore(title, lead.querySelector('.home-copy'));

    const side = document.createElement('section');
    side.className = 'home-side';
    side.innerHTML = `
      <div class="home-note-stack">
        <div class="home-note">别问有没有捷径。<br>先拖一下滑块。</div>
        <div class="home-note">最好的页面，<br>通常最先打脸。</div>
      </div>
    `;
    side.appendChild(search);
    side.appendChild(filters);

    const gallery = document.createElement('section');
    gallery.className = 'home-gallery';
    if (noResults) {
      gallery.appendChild(noResults);
    }
    gallery.appendChild(categories);
    if (footer) {
      gallery.appendChild(footer);
    }

    wrapper.appendChild(lead);
    wrapper.appendChild(side);
    wrapper.appendChild(gallery);
    enrichHomeSections();
  }

  function enhanceDetailPage() {
    const rail = document.querySelector('.site-rail');
    const container = document.querySelector('.site-content > .container');
    const header = document.querySelector('.header');
    const titleText = getTitleText();

    if (container) {
      container.classList.add('page-shell');
    }

    if (!rail) {
      return;
    }

    rail.innerHTML = `
      <div class="rail-card">
        <span class="rail-kicker"><iconify-icon icon="ph:cursor-click"></iconify-icon>这页玩法</span>
        <h3>先猜结果</h3>
        <p>再点按钮。<br>再挨一次打脸。</p>
      </div>
      <div class="rail-card">
        <span class="rail-kicker"><iconify-icon icon="ph:tag"></iconify-icon>${getAccentLabel()}</span>
        <h3>${trimTitle(titleText, 16)}</h3>
        <p>${pickDetailLine(window.location.pathname)}</p>
        <div class="rail-links">
          <a class="rail-link" href="${prefix}index.html">
            <iconify-icon icon="ph:arrow-left"></iconify-icon>
            <span>回总览</span>
          </a>
          <button class="rail-button" type="button" onclick="window.openShareModal()">
            <iconify-icon icon="ph:paper-plane-tilt"></iconify-icon>
            <span>发给朋友</span>
          </button>
        </div>
      </div>
    `;

    if (header && !header.querySelector('.header-sidekick')) {
      const sidekick = document.createElement('div');
      sidekick.className = 'header-sidekick';
      sidekick.innerHTML = `
        <div class="story-chips">
          ${getStoryChips(titleText).map((chip) => `<span class="story-chip">${chip}</span>`).join('')}
        </div>
        <div class="story-note">${pickHeaderNote(window.location.pathname)}</div>
      `;
      header.appendChild(sidekick);
    }
  }

  function enrichHomeSections() {
    document.querySelectorAll('.category-section').forEach((section) => {
      const title = section.querySelector('.category-title');
      if (!title || title.querySelector('.category-note')) {
        return;
      }

      const note = document.createElement('span');
      note.className = 'category-note';
      note.textContent = homeNotes[section.dataset.category] || homeNotes.default;
      title.appendChild(note);
    });
  }

  function getTitleText() {
    const pageTitle = document.querySelector('.header h1');
    if (pageTitle && pageTitle.textContent.trim()) {
      return pageTitle.textContent.trim();
    }
    return document.title.replace(/\s*-\s*数字直觉$/, '').trim();
  }

  function getAccentLabel() {
    return accentMap[inferPageGroup()] || accentMap.default;
  }

  function inferPageGroup() {
    const value = window.location.pathname;
    if (/prob|bayes|coin|lottery|poisson|quantum|monty|survivor|coupon|kelly|parrondo|braess|base-rate|winners|crowds|large-numbers|dice/i.test(value)) {
      return 'probability';
    }
    if (/finance|salary|retirement|fund|subscription|stock|wealth|million|compound|trading|freedom|save/i.test(value)) {
      return 'finance';
    }
    if (/attention|loss|placebo|education|takeout|gambling|gamblers|face|names/i.test(value)) {
      return 'psychology';
    }
    if (/ssh|jquery|sync|async|mock|data|word-cloud|scaling|tech/i.test(value)) {
      return 'technology';
    }
    return 'philosophy';
  }

  function getStoryChips(titleText) {
    const base = ['别猜太满', '动手更准'];
    if (/随机|概率|量子|彩票|骰子|泊松|蒙提|贝叶斯/i.test(titleText)) {
      return [...base, '直觉常翻车'];
    }
    if (/订阅|股票|退休|财富|基金|交易|复利|工资/i.test(titleText)) {
      return [...base, '钱会装样子'];
    }
    if (/热词|同步|异步|SSH|jQuery|云图|缩放/i.test(titleText)) {
      return [...base, '热闹未必真'];
    }
    return [...base, '结论别端着'];
  }

  function pickHeaderNote(seedText) {
    const notes = [
      '别把第一页当答案。<br>把控件拖满再说。',
      '如果这页不反直觉，<br>那多半还没点透。',
      '看数字前，<br>先想想自己会错哪。',
      '这页不劝你服气。<br>只劝你再试一次。'
    ];
    return notes[hash(seedText) % notes.length];
  }

  function pickDetailLine(seedText) {
    const lines = [
      '图会说真话。',
      '脑子容易偷懒。',
      '先别急着站队。',
      '这一页很会抬杠。'
    ];
    return lines[hash(`${seedText}-rail`) % lines.length];
  }

  function trimTitle(text, length) {
    return text.length > length ? `${text.slice(0, length)}…` : text;
  }

  function hash(value) {
    return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0);
  }

  function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  function shareTo(platform) {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(document.title);
    let shareUrl = '';
    let features = 'width=640,height=560';

    switch (platform) {
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
        shareUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${url}`;
        features = 'width=320,height=360';
        break;
      default:
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', features);
    }
    closeShareModal();
  }

  function copyShareUrl() {
    const input = document.getElementById('shareUrlInput');
    const value = input && input.value ? input.value : window.location.href;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value)
        .then(() => showToast('链接已复制'))
        .catch(() => fallbackCopy(input, value));
      return;
    }

    fallbackCopy(input, value);
  }

  function fallbackCopy(input, value) {
    if (input) {
      input.value = value;
      input.focus();
      input.select();
      input.setSelectionRange(0, value.length);
      document.execCommand('copy');
      showToast('链接已复制');
      return;
    }

    showToast('请手动复制链接');
  }

  function handleEscape(event) {
    if (event.key === 'Escape') {
      closeShareModal();
    }
  }

  function showToast(message) {
    const toast = document.getElementById('shareToast');
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ── 相关推荐 footer ──────────────────────────────────────
  function buildRelatedFooter() {
    const jsonUrl = `${prefix}data/demos.json`;
    fetch(jsonUrl)
      .then(r => r.json())
      .then(data => {
        const currentFile = currentPage; // e.g. benfords-law.html
        // 子目录页面的路径片段，如 'pages/sample-inference/'
        const currentHrefSuffix = pathname.includes('/pages/')
          ? pathname.slice(pathname.indexOf('/pages/') + 1)
          : '';
        let currentCat = null;
        let allDemos = [];

        data.categories.forEach(cat => {
          cat.demos.forEach(demo => {
            const file = demo.href.split('/').pop();
            allDemos.push({ ...demo, catId: cat.id, catName: cat.name, file });
            // 优先完整路径匹配（子目录），fallback 文件名匹配
            const matched = currentHrefSuffix
              ? demo.href.replace(/\/?$/, '/') === currentHrefSuffix.replace(/\/?$/, '/') || file === currentFile
              : file === currentFile;
            if (matched) currentCat = cat.id;
          });
        });

        // 排除当前页
        const others = allDemos.filter(d => {
          const hrefSuffix = pathname.includes('/pages/')
            ? pathname.slice(pathname.indexOf('/pages/') + 1)
            : '';
          if (hrefSuffix) {
            return d.href.replace(/\/?$/, '/') !== hrefSuffix.replace(/\/?$/, '/') && d.file !== currentFile;
          }
          return d.file !== currentFile;
        });

        // 同分类优先：取同分类随机2个 + 其他分类随机1个
        const sameCat  = shuffle(others.filter(d => d.catId === currentCat));
        const diffCat  = shuffle(others.filter(d => d.catId !== currentCat));
        const picks    = [...sameCat.slice(0, 2), ...diffCat.slice(0, 1)];

        if (picks.length === 0) return;

        const container = document.querySelector('.site-content > .container') ||
                          document.querySelector('.site-content');
        if (!container) return;

        const footer = document.createElement('div');
        footer.className = 'related-footer';
        footer.innerHTML = `
          <div class="related-footer-inner">
            <div class="related-label">
              <iconify-icon icon="ph:compass"></iconify-icon>
              继续探索
            </div>
            <div class="related-cards">
              ${picks.map(d => `
                <a class="related-card" href="${prefix}${d.href}">
                  <span class="related-card-icon">
                    <i class="ti ${d.icon}"></i>
                  </span>
                  <span class="related-card-body">
                    <span class="related-card-title">${d.title}</span>
                    <span class="related-card-desc">${d.desc.slice(0, 36)}…</span>
                  </span>
                  <iconify-icon icon="ph:arrow-right" class="related-card-arrow"></iconify-icon>
                </a>
              `).join('')}
            </div>
          </div>
        `;
        container.appendChild(footer);
      })
      .catch(() => {}); // 静默失败，不影响主页面
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

})();
