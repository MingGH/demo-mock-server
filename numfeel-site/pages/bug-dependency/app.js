/**
 * 积木塔 Demo 交互逻辑
 * 依赖: GSAP, BugDependencyLogic
 */

(function () {
  'use strict';

  var currentScenario = null;
  var isCollapsed = false;
  var timelineData = null;
  var milestonesData = null;

  // ── 初始化 ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    renderScenarioGrid();
    setupTimeline();
  }

  // ── 场景卡片渲染 ──────────────────────────────────────
  function renderScenarioGrid() {
    var grid = document.getElementById('scenarioGrid');
    var scenarios = BugDependencyLogic.getScenarios();
    var icons = { discount: 'ti-shopping-cart', 'sort-order': 'ti-arrows-sort', 'date-parse': 'ti-calendar-event' };

    grid.innerHTML = scenarios.map(function (sc) {
      return '<div class="scenario-card" data-id="' + sc.id + '" onclick="selectScenario(\'' + sc.id + '\')">' +
        '<div class="card-icon"><i class="ti ' + (icons[sc.id] || 'ti-cube') + '"></i></div>' +
        '<div class="card-title">' + sc.name + '</div>' +
        '<div class="card-desc">' + sc.description + '</div>' +
        '<div class="card-tag"><i class="ti ti-hand-click"></i> 点击体验</div>' +
      '</div>';
    }).join('');
  }

  // ── 选择场景 ──────────────────────────────────────────
  window.selectScenario = function (id) {
    currentScenario = BugDependencyLogic.getScenario(id);
    if (!currentScenario) return;

    isCollapsed = false;

    // 高亮卡片
    var cards = document.querySelectorAll('.scenario-card');
    cards.forEach(function (card) {
      card.classList.toggle('active', card.dataset.id === id);
    });

    // 显示积木塔区域
    var towerSection = document.getElementById('towerSection');
    towerSection.style.display = '';
    document.getElementById('scenarioTitle').textContent = currentScenario.name;
    document.getElementById('scenarioDesc').textContent = currentScenario.description;

    // 风险分数
    var riskScore = BugDependencyLogic.getFixRiskScore(currentScenario);
    document.getElementById('riskFill').style.width = riskScore + '%';
    document.getElementById('riskValue').textContent = riskScore + '%';

    // 渲染积木塔
    renderTower(currentScenario.layers);

    // 重置按钮状态
    document.getElementById('fixBugBtn').style.display = '';
    document.getElementById('keepBugBtn').style.display = '';
    document.getElementById('resetBtn').style.display = 'none';
    document.getElementById('collapseResult').classList.remove('show');
    document.getElementById('keepResult').classList.remove('show');

    // 显示时间线区域
    document.getElementById('timelineSection').style.display = '';

    // 滚动到积木塔
    towerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── 渲染积木塔 ──────────────────────────────────────────
  function renderTower(layers) {
    var stack = document.getElementById('towerStack');
    var badgeMap = {
      bugged: '<span class="block-badge badge-bug"><i class="ti ti-bug"></i> Bug</span>',
      adapted: '<span class="block-badge badge-adapted">已适配</span>',
      normal: '<span class="block-badge badge-ok">正常</span>'
    };

    stack.innerHTML = layers.map(function (layer, idx) {
      var width = 280 + (layers.length - idx) * 20; // 底宽上窄
      return '<div class="tower-block status-' + layer.status + '" id="block-' + idx + '" style="width:' + width + 'px;">' +
        '<span class="layer-idx">L' + idx + '</span>' +
        badgeMap[layer.status] +
        '<div class="block-name">' + layer.name + '</div>' +
        '<div class="block-role">' + layer.role + '</div>' +
      '</div>';
    }).join('');

    // GSAP 入场动画：从底到顶依次弹入
    var blocks = stack.querySelectorAll('.tower-block');
    gsap.fromTo(blocks,
      { opacity: 0, y: 30, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.1, ease: 'back.out(1.7)' }
    );
  }

  // ── 修复 Bug ──────────────────────────────────────────
  window.handleFixBug = function () {
    if (!currentScenario || isCollapsed) return;
    isCollapsed = true;

    var result = BugDependencyLogic.simulateFix(currentScenario);

    // 隐藏操作按钮，显示重置
    document.getElementById('fixBugBtn').style.display = 'none';
    document.getElementById('keepBugBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = '';

    // 逐层动画
    animateCollapse(result);
  };

  function animateCollapse(result) {
    var layers = result.layers;
    var delay = 0;

    layers.forEach(function (layerResult, idx) {
      var block = document.getElementById('block-' + idx);
      if (!block) return;

      delay += 0.3;

      if (layerResult.newStatus === 'fixed') {
        // bug层 → 修复动画（变绿）
        gsap.to(block, {
          delay: delay,
          duration: 0.5,
          onStart: function () {
            block.className = 'tower-block status-fixed';
            block.querySelector('.block-badge').outerHTML =
              '<span class="block-badge badge-fix"><i class="ti ti-check"></i> 已修复</span>';
          }
        });
      } else if (layerResult.newStatus === 'collapsed') {
        // 适配层 → 崩塌动画
        gsap.to(block, {
          delay: delay,
          duration: 0.6,
          x: function () { return (Math.random() - 0.5) * 120; },
          y: function () { return 60 + Math.random() * 40; },
          rotation: function () { return (Math.random() - 0.5) * 30; },
          opacity: 0.3,
          ease: 'power2.in',
          onStart: function () {
            block.className = 'tower-block status-collapsed';
            var badge = block.querySelector('.block-badge');
            if (badge) {
              badge.outerHTML = '<span class="block-badge badge-collapse"><i class="ti ti-alert-triangle"></i> 崩塌</span>';
            }
          }
        });
      }
      // normal 层不动
    });

    // 显示结果面板
    var totalDelay = delay + 0.8;
    setTimeout(function () {
      showCollapseResult(result);
    }, totalDelay * 1000);
  }

  function showCollapseResult(result) {
    var box = document.getElementById('collapseResult');
    document.getElementById('collapseTitle').innerHTML =
      '<i class="ti ti-alert-triangle"></i> 崩塌！' + result.collapseCount + '/' + result.totalLayers + ' 层受影响';
    document.getElementById('collapseText').textContent = result.cascadeExplanation;

    var detailHtml = result.layers.map(function (lr) {
      var cls = 'item-' + lr.newStatus;
      var icon = lr.newStatus === 'collapsed' ? 'ti-x' : (lr.newStatus === 'fixed' ? 'ti-check' : 'ti-minus');
      return '<div class="collapse-item ' + cls + '">' +
        '<i class="ti ' + icon + ' ci-icon"></i>' +
        '<span class="ci-name">' + lr.name + '</span>' +
        '<span class="ci-reason">' + lr.reason + '</span>' +
      '</div>';
    }).join('');
    document.getElementById('collapseDetail').innerHTML = detailHtml;

    box.classList.add('show');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── 保留 Bug ──────────────────────────────────────────
  window.handleKeepBug = function () {
    if (!currentScenario || isCollapsed) return;

    // 所有块轻微上下浮动表示"稳定运行"
    var blocks = document.querySelectorAll('.tower-block');
    gsap.to(blocks, {
      y: -4,
      duration: 0.5,
      ease: 'power1.inOut',
      yoyo: true,
      repeat: 1,
      stagger: 0.05
    });

    document.getElementById('fixBugBtn').style.display = 'none';
    document.getElementById('keepBugBtn').style.display = 'none';
    document.getElementById('resetBtn').style.display = '';

    var box = document.getElementById('keepResult');
    box.classList.add('show');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // ── 重置 ──────────────────────────────────────────────
  window.handleReset = function () {
    if (!currentScenario) return;
    isCollapsed = false;
    document.getElementById('collapseResult').classList.remove('show');
    document.getElementById('keepResult').classList.remove('show');
    selectScenario(currentScenario.id);
  };

  // ── 时间线 ──────────────────────────────────────────────
  function setupTimeline() {
    timelineData = BugDependencyLogic.generateHyrumTimeline(1000, 42);
    milestonesData = BugDependencyLogic.getTimelineMilestones(timelineData);

    renderMilestones();

    var slider = document.getElementById('timelineSlider');
    slider.addEventListener('input', function () {
      updateTimeline(parseInt(slider.value, 10));
    });

    updateTimeline(0);
  }

  function renderMilestones() {
    var container = document.getElementById('milestones');
    container.innerHTML = milestonesData.map(function (ms, idx) {
      return '<div class="milestone" id="ms-' + idx + '">' +
        '<span class="ms-day">Day ' + ms.day + '</span>' +
        '<span class="ms-text">' + ms.event + '</span>' +
        '<span class="ms-deps">' + ms.dependents + ' 个依赖</span>' +
      '</div>';
    }).join('');
  }

  function updateTimeline(pct) {
    // 将百分比映射到时间线数据点
    var idx = Math.round(pct / 100 * (timelineData.length - 1));
    var point = timelineData[idx];

    document.getElementById('timelineDay').textContent = '第 ' + point.day + ' 天';
    document.getElementById('tlDays').textContent = point.day;
    document.getElementById('tlDependents').textContent = point.dependents;

    // 修复成本分级
    var cost = '极低';
    if (point.dependents > 40) cost = '极高（不建议修复）';
    else if (point.dependents > 20) cost = '高';
    else if (point.dependents > 10) cost = '中等';
    else if (point.dependents > 3) cost = '较低';
    document.getElementById('tlCost').textContent = cost;

    // 事件气泡
    var eventBox = document.getElementById('tlEvent');
    if (point.event) {
      eventBox.style.display = '';
      document.getElementById('tlEventText').textContent = point.event;
    } else {
      eventBox.style.display = 'none';
    }

    // 里程碑高亮
    milestonesData.forEach(function (ms, mIdx) {
      var el = document.getElementById('ms-' + mIdx);
      if (el) {
        el.classList.toggle('active', point.day >= ms.day);
      }
    });
  }

})();
