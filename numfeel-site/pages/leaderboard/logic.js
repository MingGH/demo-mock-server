/**
 * 排行榜页面纯逻辑（与 DOM 解耦，可被 Node 测试）。
 *
 * 后端 /leaderboard 返回的 path 形如 "pages/xxx" 或 "pages/xxx/"（Umami 记录的真实路径），
 * 而 demos.json 的 href 形如 "pages/xxx.html" 或 "pages/xxx/"。两者需归一化后匹配。
 */

/**
 * 将路径归一化为统一的匹配 key：去掉前导斜杠、去掉 .html 后缀、去掉尾部斜杠、转小写。
 *
 * @param {string} path 原始路径（来自后端或 demos.json href）
 * @returns {string} 归一化 key，无效输入返回空字符串
 */
function normalizeKey(path) {
  if (!path || typeof path !== 'string') return '';
  var p = path.trim();
  // 去掉 hash / query
  var hashIdx = p.indexOf('#');
  if (hashIdx !== -1) p = p.slice(0, hashIdx);
  var qIdx = p.indexOf('?');
  if (qIdx !== -1) p = p.slice(0, qIdx);
  if (p.charAt(0) === '/') p = p.slice(1);
  if (p.slice(-5) === '.html') p = p.slice(0, -5);
  if (p.slice(-1) === '/') p = p.slice(0, -1);
  return p.toLowerCase();
}

/**
 * 把 demos.json 的分类结构扁平成 归一化key → demo 元信息 的映射。
 *
 * @param {{categories: Array}} demosJson demos.json 解析后的对象
 * @returns {Object<string, {title:string, icon:string, href:string, catName:string}>} 映射表
 */
function buildDemoIndex(demosJson) {
  var index = {};
  if (!demosJson || !Array.isArray(demosJson.categories)) return index;
  demosJson.categories.forEach(function(cat) {
    (cat.demos || []).forEach(function(demo) {
      var key = normalizeKey(demo.href);
      if (key) {
        index[key] = {
          title: demo.title,
          icon: demo.icon,
          href: demo.href,
          catName: cat.name
        };
      }
    });
  });
  return index;
}

/**
 * 将后端某一口径的榜单条目与 demos.json 元信息合并，生成可渲染列表。
 * 未在 demos.json 中找到对应 demo 的条目会被剔除（避免展示已下线/无标题的页面）。
 *
 * @param {Array<{path:string, views:number}>} entries 后端返回的榜单条目
 * @param {Object} demoIndex buildDemoIndex 生成的映射表
 * @returns {Array<{rank:number, title:string, icon:string, href:string, catName:string, views:number}>}
 */
function enrichLeaderboard(entries, demoIndex) {
  if (!Array.isArray(entries)) return [];
  var result = [];
  entries.forEach(function(entry) {
    var meta = demoIndex[normalizeKey(entry.path)];
    if (!meta) return; // demos.json 里没有 → 跳过
    result.push({
      rank: result.length + 1,
      title: meta.title,
      icon: meta.icon,
      href: meta.href,
      catName: meta.catName,
      views: entry.views
    });
  });
  return result;
}

/**
 * 把浏览量格式化为紧凑可读字符串（如 12345 → "1.2万"）。
 *
 * @param {number} views 浏览量
 * @returns {string} 格式化后的字符串
 */
function formatViews(views) {
  var n = Number(views) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(n);
}

var LeaderboardLogic = {
  normalizeKey: normalizeKey,
  buildDemoIndex: buildDemoIndex,
  enrichLeaderboard: enrichLeaderboard,
  formatViews: formatViews
};

if (typeof window !== 'undefined') {
  window.LeaderboardLogic = LeaderboardLogic;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LeaderboardLogic;
}
