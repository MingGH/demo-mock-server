/**
 * ZhihuLink — 在 demo 页面顶部注入「知乎配套文章」反向链接。
 *
 * 配置：编辑 `data/zhihu-links.json`，以 demo slug 为 key、知乎文章为 value：
 *   {
 *     "benfords-law": { "url": "https://zhuanlan.zhihu.com/p/xxx", "title": "本福特定律：数字也会说谎" }
 *   }
 * slug 推导规则与 NFTrack 一致（见 components/track.js）：
 *   - /pages/benfords-law.html   → benfords-law
 *   - /pages/sample-inference/   → sample-inference
 * 有配置就在页面顶部展示反链卡片；无配置 / 配置加载失败 → 静默不渲染，绝不影响页面。
 *
 * 由 header.js 全局注入本脚本，所有页面自动具备该能力，无需逐页改动。
 */
(function (global) {
  'use strict';

  var CONFIG_PATH = 'data/zhihu-links.json';

  /**
   * 从页面路径推导 demo slug，规则与 NFTrack.deriveSlug 保持一致。
   * 支持 `/pages/<slug>/`（含 index.html）与 `/pages/<slug>.html` 两种形式。
   *
   * @param {string} pathname location.pathname
   * @returns {string|null} demo slug，或 null
   */
  function deriveSlug(pathname) {
    if (typeof pathname !== 'string') {
      return null;
    }
    var idx = pathname.indexOf('/pages/');
    if (idx === -1) {
      return null;
    }
    var rest = pathname.slice(idx + '/pages/'.length);
    if (!rest) {
      return null;
    }
    var slug = null;
    var slashIdx = rest.indexOf('/');
    if (slashIdx !== -1) {
      // /pages/<slug>/ or /pages/<slug>/index.html
      slug = rest.slice(0, slashIdx);
    } else {
      var match = /^([^/]+)\.html$/.exec(rest);
      if (match) {
        // /pages/<slug>.html
        slug = match[1];
      } else {
        // /pages/<slug> (clean URL without .html or trailing slash)
        slug = rest;
      }
    }
    if (!slug) {
      return null;
    }
    slug = slug.toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
      return null;
    }
    return slug;
  }

  /**
   * 从配置中解析某个 slug 对应的知乎文章条目（支持一对多）。
   * 配置值既可以是单个对象，也可以是对象数组；两种写法都返回「条目数组」。
   * 纯函数：配置缺失、条目缺失、URL 缺失，或 key 以 `_` 开头（如 `_sample` 说明）都返回空数组。
   *
   * 配置示例：
   *   { "benfords-law": { "url": "...", "title": "..." } }                // 单篇
   *   { "sample-inference": [ { "url": "...", "title": "..." }, ... ] }   // 多篇
   *
   * @param {string} slug demo slug
   * @param {Object} config zhihu-links.json 解析出的对象
   * @returns {Array<{url:string, title:string}>} 知乎文章条目数组，可能为空
   */
  function resolveZhihuLink(slug, config) {
    if (!slug || !config || typeof config !== 'object') {
      return [];
    }
    // 下划线开头的 key 视为说明/注释条目，不渲染
    if (slug.charAt(0) === '_') {
      return [];
    }
    var raw = config[slug];
    // 单篇对象 → 归一化为数组
    var list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object') ? [raw] : [];
    var result = [];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      if (typeof entry.url !== 'string' || !entry.url) {
        continue;
      }
      result.push({
        url: entry.url,
        title: typeof entry.title === 'string' && entry.title ? entry.title : '知乎配套文章'
      });
    }
    return result;
  }

  /**
   * 计算到根目录的相对路径前缀，用于拼接 data/zhihu-links.json。
   * 与 header.js 的 prefix 推导一致。
   *
   * @param {string} pathname location.pathname
   * @returns {string} 相对前缀，如 '../' 或 '../../'
   */
  function computePrefix(pathname) {
    var pagesIdx = pathname.indexOf('/pages/');
    if (pagesIdx === -1) {
      return '';
    }
    var afterPages = pathname.slice(pagesIdx + '/pages/'.length);
    var depth = afterPages.split('/').length;
    return depth >= 2 ? '../../' : '../';
  }

  /**
   * 找到 demo 内容容器：优先 header.js 包装后的 `.site-content > .container`，
   * 其次页面自身的 `.container`，最后退回 body。
   *
   * @returns {Element|null} 插入反链卡片的目标容器
   */
  function findContainer() {
    var content = global.document.querySelector('.site-content > .container');
    if (content) {
      return content;
    }
    content = global.document.querySelector('.container');
    if (content) {
      return content;
    }
    return global.document.body;
  }

  /**
   * 注入知乎反链卡片样式（自包含，避免依赖具体页面 CSS）。
   */
  function injectStyle() {
    if (global.document.getElementById('zhihu-link-style')) {
      return;
    }
    var style = global.document.createElement('style');
    style.id = 'zhihu-link-style';
    style.textContent =
      '.zhihu-link-card{display:flex;align-items:center;gap:14px;margin:0 0 22px;padding:14px 16px;border-radius:20px;border:1px solid rgba(242,228,207,.12);background:linear-gradient(150deg,rgba(201,107,51,.14),rgba(20,15,12,.6));box-shadow:0 14px 34px rgba(0,0,0,.16);color:#f2e4cf;text-decoration:none;transition:transform .22s cubic-bezier(.22,1,.36,1),border-color .22s}'
      + '.zhihu-link-card:hover{transform:translate3d(0,-2px,0);border-color:rgba(201,107,51,.4)}'
      + '.zhihu-link-icon{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:#0e6ff2;color:#fff}'
      + '.zhihu-link-icon iconify-icon{font-size:22px}'
      + '.zhihu-link-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}'
      + '.zhihu-link-kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(242,228,207,.5)}'
      + '.zhihu-link-title{font-size:14px;font-weight:600;color:#f2e4cf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.zhihu-link-arrow{flex-shrink:0;font-size:15px;color:rgba(242,228,207,.35);transition:transform .2s,color .2s}'
      + '.zhihu-link-card:hover .zhihu-link-arrow{color:#c96b33;transform:translateX(3px)}'
      + '@media(max-width:640px){.zhihu-link-card{flex-wrap:wrap}.zhihu-link-title{white-space:normal}}';
    global.document.head.appendChild(style);
  }

  /**
   * 根据一个知乎文章条目渲染一张反链卡片。
   *
   * @param {{url:string, title:string}} entry 知乎文章条目
   */
  function renderOne(entry) {
    var container = findContainer();
    if (!container) {
      return;
    }
    var card = global.document.createElement('a');
    card.className = 'zhihu-link-card';
    card.href = entry.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.innerHTML = '\
        <span class="zhihu-link-icon"><iconify-icon icon="simple-icons:zhihu"></iconify-icon></span>\
        <span class="zhihu-link-body">\
          <span class="zhihu-link-kicker">知乎配套文章</span>\
          <span class="zhihu-link-title">' + entry.title + '</span>\
        </span>\
        <iconify-icon icon="ph:arrow-up-right" class="zhihu-link-arrow"></iconify-icon>';
    container.insertBefore(card, container.firstChild);
  }

  /**
   * 根据配置渲染反链卡片；无匹配则什么都不做。
   *
   * @param {Array<{url:string, title:string}>} entries 知乎文章条目数组
   */
  function render(entries) {
    try {
      injectStyle();
      // 卡片整体插入到容器顶部，多篇时逆序插入以保持配置顺序
      for (var i = entries.length - 1; i >= 0; i--) {
        renderOne(entries[i]);
      }
    } catch (e) {
      // 反链渲染失败不得影响页面
    }
  }

  // 仅浏览器环境初始化；Node 环境（单元测试）跳过副作用
  if (typeof global.document !== 'undefined' && typeof global.location !== 'undefined') {
    try {
      var slug = deriveSlug(global.location.pathname);
      if (slug) {
        var prefix = computePrefix(global.location.pathname);
        fetch(prefix + CONFIG_PATH)
          .then(function (r) { return r.json(); })
          .then(function (config) {
            var entries = resolveZhihuLink(slug, config);
            if (entries.length) {
              render(entries);
            }
          })
          .catch(function () {}); // 静默失败，不展示
      }
    } catch (e) {
      // 忽略
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      deriveSlug: deriveSlug,
      resolveZhihuLink: resolveZhihuLink,
      computePrefix: computePrefix
    };
  }
})(typeof window !== 'undefined' ? window : this);