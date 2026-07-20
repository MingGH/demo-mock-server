/**
 * 积木塔模型 —— 核心逻辑（与 DOM 解耦的纯函数）
 * 模拟软件分层依赖中 bug 如何被上层依赖，修复后导致连锁崩塌。
 * 运行测试：node pages/bug-dependency/bug-dependency.test.js
 */

var BugDependencyLogic = (function () {

  // ── 场景定义 ──────────────────────────────────────────
  // 每个场景描述一个软件栈，层从底（index 0）到顶（index n-1）
  // bugLayerIdx: 含bug的层索引
  // 每层的 compensation 描述该层如何适配下层的bug行为

  var SCENARIOS = [
    {
      id: 'discount',
      name: '电商折扣系统',
      description: '底层函数 getDiscount() 本该返回 0.1（10%折扣），bug 导致返回 10（被当成「满10减」使用）',
      layers: [
        { name: '数据库层', role: '存储折扣配置', hasBug: false, compensation: null, status: 'normal' },
        { name: '折扣计算服务', role: 'getDiscount() 返回折扣值', hasBug: true, bugDesc: '返回 10 而非 0.1', compensation: null, status: 'bugged' },
        { name: '订单服务', role: '调用折扣服务计算价格', hasBug: false, compensation: '把返回值当「满减金额」处理：price - discount', status: 'adapted' },
        { name: '前端展示层', role: '显示「已优惠¥10」', hasBug: false, compensation: '文案写死「满减」而非「折扣」', status: 'adapted' },
        { name: '财务对账系统', role: '每日汇总优惠金额', hasBug: false, compensation: '按整数元统计，与订单服务对齐', status: 'adapted' }
      ],
      bugLayerIdx: 1,
      fixDescription: '将 getDiscount() 返回值修正为 0.1',
      cascadeExplanation: '订单服务把 0.1 当金额做减法，价格只减了 1 毛；前端显示「已优惠¥0.1」不合逻辑；财务对账与实际不符，三层同时报错。'
    },
    {
      id: 'sort-order',
      name: 'Linux 内核排序方向',
      description: '底层排序函数返回值符号写反了（升序变降序），但上层已适配反向结果',
      layers: [
        { name: '硬件驱动层', role: '提供原始设备列表', hasBug: false, compensation: null, status: 'normal' },
        { name: '内核排序函数', role: '对设备优先级排序', hasBug: true, bugDesc: '比较函数符号写反，升序变降序', compensation: null, status: 'bugged' },
        { name: '设备管理器', role: '取排序结果的第一个设备', hasBug: false, compensation: '取 last 而非 first（适配反向）', status: 'adapted' },
        { name: '用户空间工具', role: '调用设备管理器获取首选设备', hasBug: false, compensation: '期望收到「最后一个」就是最优', status: 'adapted' },
        { name: '桌面环境', role: '显示默认设备给用户', hasBug: false, compensation: '反向显示列表让用户看着正常', status: 'adapted' }
      ],
      bugLayerIdx: 1,
      fixDescription: '修正比较函数符号，排序恢复升序',
      cascadeExplanation: '设备管理器取 last 拿到的变成真正的最后一个（最低优先级）；用户空间工具展示错误设备；桌面环境显示混乱。'
    },
    {
      id: 'date-parse',
      name: '日期解析 Y2K 遗产',
      description: '日期库把两位年份「00」解析为 1900 而非 2000，上层基于 1900 做了年龄计算补偿',
      layers: [
        { name: '日期解析库', role: '解析 "00/01/01" 格式日期', hasBug: true, bugDesc: '两位年份 00 解析为 1900-01-01', compensation: null, status: 'bugged' },
        { name: '用户服务', role: '计算用户年龄', hasBug: false, compensation: '检测到年份<1950时自动+100', status: 'adapted' },
        { name: '保险计算模块', role: '根据年龄算保费', hasBug: false, compensation: '年龄>100时使用补偿后的值', status: 'adapted' },
        { name: '风控系统', role: '年龄异常检测', hasBug: false, compensation: '白名单放行1900年用户', status: 'adapted' },
        { name: '报表导出', role: '生成客户年龄分布报表', hasBug: false, compensation: '过滤掉birth_year=1900的记录后统计', status: 'adapted' }
      ],
      bugLayerIdx: 0,
      fixDescription: '修正解析逻辑：两位年份 00-49 映射到 2000-2049',
      cascadeExplanation: '用户服务的 +100 补偿让2000年出生的人变成 200 岁；保险计算爆表；风控误报大量异常；报表过滤条件失效。'
    }
  ];

  // ── 塔模型核心函数 ──────────────────────────────────────

  /**
   * 获取所有预设场景
   * @returns {Array} 场景列表（深拷贝）
   */
  function getScenarios() {
    return JSON.parse(JSON.stringify(SCENARIOS));
  }

  /**
   * 获取指定场景
   * @param {string} scenarioId
   * @returns {object|null}
   */
  function getScenario(scenarioId) {
    var s = SCENARIOS.find(function (sc) { return sc.id === scenarioId; });
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  /**
   * 模拟修复 bug 后的连锁崩塌。
   * 返回每一层的新状态和崩塌原因。
   * @param {object} scenario 场景对象
   * @returns {object} { layers: [{name, status, reason}], collapseCount, totalLayers }
   */
  function simulateFix(scenario) {
    var layers = scenario.layers;
    var bugIdx = scenario.bugLayerIdx;
    var result = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (i === bugIdx) {
        // bug层被修复
        result.push({
          name: layer.name,
          previousStatus: 'bugged',
          newStatus: 'fixed',
          reason: '已修复：' + scenario.fixDescription
        });
      } else if (layer.compensation) {
        // 有补偿逻辑的层 → 崩塌
        result.push({
          name: layer.name,
          previousStatus: 'adapted',
          newStatus: 'collapsed',
          reason: '补偿逻辑失效：' + layer.compensation
        });
      } else {
        // 无补偿、无bug → 不受影响
        result.push({
          name: layer.name,
          previousStatus: 'normal',
          newStatus: 'normal',
          reason: '无依赖关系，不受影响'
        });
      }
    }

    var collapseCount = result.filter(function (r) { return r.newStatus === 'collapsed'; }).length;

    return {
      layers: result,
      collapseCount: collapseCount,
      totalLayers: layers.length,
      cascadeExplanation: scenario.cascadeExplanation
    };
  }

  /**
   * 计算依赖深度：从bug层往上有多少层依赖了它的错误行为
   * @param {object} scenario
   * @returns {number}
   */
  function getDependencyDepth(scenario) {
    return scenario.layers.filter(function (l) { return l.compensation !== null; }).length;
  }

  /**
   * 计算修复风险评分（0~100）
   * 基于：依赖层数 / 总层数 * 100
   * @param {object} scenario
   * @returns {number}
   */
  function getFixRiskScore(scenario) {
    var depth = getDependencyDepth(scenario);
    var total = scenario.layers.length;
    return Math.round((depth / (total - 1)) * 100); // 排除bug层本身
  }

  /**
   * 生成 Hyrum's Law 时间线数据
   * 模拟一个 bug 随时间被越来越多模块依赖的过程
   * @param {number} days 模拟天数
   * @param {number} seed 随机种子
   * @returns {Array} [{day, dependents, event}]
   */
  function generateHyrumTimeline(days, seed) {
    days = days || 1000;
    seed = seed || 42;

    // 简单 LCG 随机
    var state = seed;
    function rand() {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >>> 0) / 4294967296;
    }

    var timeline = [];
    var dependents = 0;
    var events = [
      { day: 1, text: '开发者提交了含 bug 的函数' },
      { day: 15, text: '代码审查通过，无人发现 bug' },
      { day: 30, text: '第一个外部模块调用了该函数' },
      { day: 90, text: '有人发现行为异常，但「能跑就行」' },
      { day: 180, text: '文档更新：描述了 bug 行为（当作 feature）' },
      { day: 365, text: '20+ 模块依赖此行为，有人提 PR 修复被拒绝' },
      { day: 730, text: '注释标注 "// DO NOT FIX - breaks downstream"' },
      { day: 1000, text: '正式归档为 "won\'t fix"' }
    ];

    var eventIdx = 0;

    for (var d = 1; d <= days; d++) {
      // 依赖增长模型：对数增长 + 随机波动
      var growth = Math.log(d + 1) * 0.5 * (0.8 + rand() * 0.4);
      dependents = Math.max(dependents, Math.floor(growth * 8));

      var event = null;
      if (eventIdx < events.length && d >= events[eventIdx].day) {
        event = events[eventIdx].text;
        eventIdx++;
      }

      // 每隔一段时间记录一个数据点
      if (d === 1 || d % 30 === 0 || event) {
        timeline.push({
          day: d,
          dependents: dependents,
          event: event
        });
      }
    }

    return timeline;
  }

  /**
   * 将时间线数据转为关键里程碑（用于 UI 展示）
   * @param {Array} timeline
   * @returns {Array} 仅含有事件的数据点
   */
  function getTimelineMilestones(timeline) {
    return timeline.filter(function (p) { return p.event !== null; });
  }

  // ── 公共 API ──────────────────────────────────────────

  var api = {
    getScenarios: getScenarios,
    getScenario: getScenario,
    simulateFix: simulateFix,
    getDependencyDepth: getDependencyDepth,
    getFixRiskScore: getFixRiskScore,
    generateHyrumTimeline: generateHyrumTimeline,
    getTimelineMilestones: getTimelineMilestones,
    SCENARIOS: SCENARIOS
  };

  // CommonJS / Browser 双模式导出
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  return api;
})();
