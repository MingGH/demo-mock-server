/**
 * PWA 能力检测实验室 —— DOM 层
 */
(function() {
  var capabilities = [];
  var browserInfo = {};

  // ── 对比表数据 ──
  var COMPARE_ROWS = [
    { dim: '安装', web: '无需安装', pwa: '添加到主屏幕（无商店审核）', native: 'App Store / 应用市场下载' },
    { dim: '离线使用', web: '不支持', pwa: 'Service Worker 缓存', native: '完全离线' },
    { dim: '推送通知', web: '不支持', pwa: 'Web Push（iOS 不支持）', native: '完整推送系统' },
    { dim: '后台运行', web: '不支持', pwa: '有限（Background Sync）', native: '完整后台任务' },
    { dim: '硬件访问', web: '有限（摄像头/定位）', pwa: '较完整（蓝牙/NFC 有限）', native: '全部硬件' },
    { dim: '存储上限', web: '~10MB (LocalStorage)', pwa: '浏览器配额（通常>1GB）', native: '仅设备容量' },
    { dim: '更新方式', web: '刷新即更新', pwa: 'SW 控制更新', native: '商店审核更新' },
    { dim: '用户获取', web: '搜索引擎/链接', pwa: '搜索引擎/链接/安装', native: '商店搜索/推荐' },
    { dim: '分发抽成', web: '0%', pwa: '0%', native: '15-30%（苹果/谷歌抽成）' },
    { dim: '跨平台', web: '所有浏览器', pwa: '支持的浏览器可见', native: '每平台单独开发' }
  ];

  // ── 分组信息 ──
  var GROUP_INFO = {
    foundation: { name: '基础能力', icon: 'ti ti-layers-linked', color: '#88954a' },
    experience: { name: '体验增强', icon: 'ti ti-sparkles', color: '#c96b33' },
    advanced: { name: '高级能力', icon: 'ti ti-rocket', color: '#6ea8c9' }
  };

  // ── 初始化 ──
  function init() {
    document.getElementById('pwa-cta-btn').addEventListener('click', runDetection);

    // 折叠了解更多
    var moreToggle = document.getElementById('pwa-more-toggle');
    var moreContent = document.getElementById('pwa-more-content');
    if (moreToggle && moreContent) {
      moreToggle.addEventListener('click', function() {
        var open = moreContent.classList.toggle('open');
        var icon = moreToggle.querySelector('i');
        if (open) {
          icon.className = 'ti ti-chevron-down';
        } else {
          icon.className = 'ti ti-chevron-right';
        }
      });
    }
  }

  // ── 执行检测 ──
  function runDetection() {
    // 隐藏 Hero
    var hero = document.getElementById('pwa-hero');
    if (hero) hero.classList.add('faded');

    // 显示结果
    var results = document.getElementById('pwa-results');
    if (results) results.classList.add('visible');

    // 执行检测
    capabilities = detectAllCapabilities();
    browserInfo = getBrowserInfo();

    // 渲染各部分
    renderOverview();
    renderChecklist();
    renderCompareTable();
  }

  // ── 渲染总览 ──
  function renderOverview() {
    var total = capabilities.length;
    var passed = capabilities.filter(function(c) { return c.supported; }).length;
    var percent = Math.round((passed / total) * 100);

    document.getElementById('pwa-score-badge').textContent = passed + ' / ' + total;
    document.getElementById('pwa-meter-fill').style.width = percent + '%';

    // 进度条颜色
    var fill = document.getElementById('pwa-meter-fill');
    if (percent >= 80) {
      fill.style.background = 'linear-gradient(90deg, #88954a, #6ea8c9)';
    } else if (percent >= 40) {
      fill.style.background = 'linear-gradient(90deg, #c96b33, #88954a)';
    } else {
      fill.style.background = 'linear-gradient(90deg, #e05555, #c96b33)';
    }

    // 标签
    var label = '';
    var insight = '';
    if (percent >= 80) {
      label = browserInfo.name + ' on ' + browserInfo.os + ' — PWA 支持良好';
      insight = browserInfo.isPwa
        ? '当前以 PWA 独立窗口模式运行。你的浏览器对 PWA 各项能力支持很全面，可以放心使用 PWA 应用。'
        : '你的浏览器对 PWA 支持很全面。试试点击浏览器菜单中的"添加到主屏幕"，体验类原生 App 的使用感受。';
    } else if (percent >= 50) {
      label = browserInfo.name + ' on ' + browserInfo.os + ' — 基础可用，高级受限';
      insight = '你的浏览器支持 PWA 的基础能力（离线缓存、安装等），但推送通知、后台同步等高级功能受限。这是大多数浏览器的常态——各家实现进度不同。';
    } else {
      label = browserInfo.name + ' on ' + browserInfo.os + ' — PWA 支持严重不足';
      insight = '你的浏览器对 PWA 的支持较少。可能是 iOS Safari（苹果限制）、微信内置浏览器、或较旧的浏览器版本。PWA 的「跨浏览器」理想，在现实中还很遥远。';
    }

    document.getElementById('pwa-meter-label').textContent = label;
    document.getElementById('pwa-insight-bar').textContent = insight;
  }

  // ── 渲染检查清单 ──
  function renderChecklist() {
    var container = document.getElementById('pwa-checklist');
    if (!container) return;
    container.innerHTML = '';

    // 按分组渲染
    var groups = ['foundation', 'experience', 'advanced'];
    groups.forEach(function(groupId) {
      var groupCaps = capabilities.filter(function(c) { return c.group === groupId; });
      if (groupCaps.length === 0) return;

      var info = GROUP_INFO[groupId];
      var groupSummary = summarizeByGroup(groupCaps);
      var groupTotal = groupSummary[groupId].total;
      var groupPassed = groupSummary[groupId].passed;

      // 分组标题
      var groupHeader = document.createElement('div');
      groupHeader.className = 'pwa-group-header';
      groupHeader.innerHTML =
        '<i class="' + info.icon + '" style="color:' + info.color + '"></i>' +
        '<span>' + info.name + '</span>' +
        '<span class="pwa-group-count" style="color:' + info.color + '">' + groupPassed + '/' + groupTotal + '</span>';
      container.appendChild(groupHeader);

      // 每一项
      groupCaps.forEach(function(cap, idx) {
        var row = document.createElement('div');
        row.className = 'pwa-check-item ' + (cap.supported ? 'supported' : 'unsupported');

        row.innerHTML =
          '<i class="ti ' + (cap.supported ? 'ti-circle-check' : 'ti-circle-x') + ' pwa-check-icon"></i>' +
          '<div class="pwa-check-body">' +
            '<span class="pwa-check-name">' + cap.name + '</span>' +
            '<span class="pwa-check-detail">' + cap.detail + '</span>' +
          '</div>';

        // 逐个入场动画
        row.style.animationDelay = (idx * 0.05) + 's';
        container.appendChild(row);
      });
    });
  }

  // ── 渲染对比表 ──
  function renderCompareTable() {
    var body = document.getElementById('pwa-compare-body');
    if (!body) return;
    body.innerHTML = '';

    COMPARE_ROWS.forEach(function(row) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="compare-dim">' + row.dim + '</td>' +
        '<td class="compare-web"><span class="compare-badge web-badge">' + row.web + '</span></td>' +
        '<td class="compare-pwa"><span class="compare-badge pwa-badge">' + row.pwa + '</span></td>' +
        '<td class="compare-native"><span class="compare-badge native-badge">' + row.native + '</span></td>';
      body.appendChild(tr);
    });
  }

  // ── 页面加载完成后初始化 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
