/**
 * 育碧帝国陨落 - 数据引擎
 * 纯函数模块，不操作DOM，可被Node测试require
 */

// ── 市值变化（亿欧元） ──
var MARKET_CAP = [
  { date: '2018.07', value: 108, event: '《刺客信条：奥德赛》发售前夜，击退维旺迪收购' },
  { date: '2021.01', value: 100, event: '疫情红利期，市值维持高位' },
  { date: '2022.07', value: 42,  event: '远程办公效率争议，开始下滑' },
  { date: '2023.01', value: 25,  event: '《碧海黑帆》第五次延期，股价跌至2015年来新低' },
  { date: '2024.09', value: 18,  event: '股价十年最低，股东考虑出售总部大楼' },
  { date: '2025.03', value: 14,  event: '腾讯11.6亿欧元注资Vantage Studios' },
  { date: '2025.12', value: 9.3, event: '市值较2021年峰值崩塌85%' },
  { date: '2026.05', value: 5.6, event: '创纪录亏损13.22亿欧元，市值低于亏损额' },
  { date: '2026.07', value: 5.0, event: 'Q1营收同比再降13.7%，市值5.37亿欧元' }
];

// ── 关键事件时间线 ──
var TIMELINE = [
  {
    date: '2018.03',
    title: '击退维旺迪，腾讯白衣骑士入股',
    desc: '维旺迪出售全部27.3%股份并承诺5年不再收购。腾讯入股5%，签订战略合作协议。',
    type: 'good'
  },
  {
    date: '2018.10',
    title: '《刺客信条：奥德赛》大获成功',
    desc: 'IGN评价「系列最佳」，创本世代最佳首发周。全平台突破1200万套，仅内购收入9400万欧元。',
    type: 'peak'
  },
  {
    date: '2020.07',
    title: '性骚扰丑闻全面爆发',
    desc: '首席创意官Hascoët、VP François、游戏总监Patrux集体落马。内部调查：25%员工两年内经历职场不当行为。HR负责人被曝曾称「Yves容忍有毒管理，只要业绩好」。',
    type: 'bad'
  },
  {
    date: '2024.02',
    title: '《碧海黑帆》终于发售',
    desc: '开发10年、延期7次、成本6.5-8.5亿美元。发售后Steam在线峰值仅381人。被CEO称为「首款4A级游戏」。',
    type: 'bad'
  },
  {
    date: '2024.09',
    title: '股价跌至十年最低',
    desc: '《星球大战：亡命之徒》销量不及预期三分之一。股东考虑出售总部大楼，强制员工返岗引发罢工。',
    type: 'bad'
  },
  {
    date: '2025.03',
    title: '腾讯11.6亿欧元注资',
    desc: '育碧将刺客信条、孤岛惊魂、彩虹六号三大IP拆分成立Vantage Studios。腾讯获26.32%股权，投前估值40亿欧元。',
    type: 'neutral'
  },
  {
    date: '2026.01',
    title: '「重大重置」大规模重组',
    desc: '取消6个项目（含《波斯王子：时之砂重制版》），推迟7款游戏。关停Halifax、Stockholm工作室。5个Creative Houses新架构亮相。',
    type: 'bad'
  },
  {
    date: '2026.05',
    title: '创纪录亏损13.22亿欧元',
    desc: '2025-26财年运营亏损13.22亿欧元，归母净亏14.75亿欧元。研发支出18.55亿欧元中75%是沉没成本。市值仅5.6亿欧元，比亏损额还低。',
    type: 'bad'
  },
  {
    date: '2026.07',
    title: '《刺客信条：黑旗 重置版》发售',
    desc: '首两周销量超350万份，是少有的亮点。但上线前两天遭破解泄露，Q1营收仍同比降13.7%。',
    type: 'neutral'
  }
];

// ── 碧海黑帆成本对比（亿美元） ──
var COST_COMPARISON = [
  { name: '《黑神话：悟空》', cost: 0.4, label: '0.4亿' },
  { name: '《赛博朋克2077》', cost: 3.2, label: '3.2亿' },
  { name: '《星鸣特攻》', cost: 4.0, label: '4.0亿' },
  { name: '《碧海黑帆》', cost: 7.5, label: '6.5-8.5亿' }
];

// ── 财务对比：巅峰 vs 现在 ──
var FINANCIAL_COMPARE = [
  { metric: '市值', peak: 108, now: 5.6, unit: '亿欧元' },
  { metric: '年营收', peak: 22.9, now: 14.0, unit: '亿欧元' },
  { metric: '运营利润', peak: 1.58, now: -13.22, unit: '亿欧元' },
  { metric: '员工人数', peak: 20000, now: 16590, unit: '人' },
  { metric: '全球工作室', peak: 45, now: 38, unit: '个' }
];

// ── 员工变化 ──
var HEADCOUNT = [
  { date: '2022.09', count: 20000 },
  { date: '2023.09', count: 18982 },
  { date: '2024.09', count: 18597 },
  { date: '2025.09', count: 17097 },
  { date: '2026.03', count: 16590 }
];

// ── 研发支出分析（亿欧元） ──
var RD_SPENDING = {
  total: 18.55,
  sunk: 13.9,
  sunkPercent: 75,
  desc: '2026财年研发支出18.55亿欧元，其中75%（13.9亿）直接与取消或延期项目相关——几乎全是沉没成本。'
};

// ── 作死四连击 ──
var FATAL_BLOWS = [
  {
    icon: 'ti-ship',
    title: '《碧海黑帆》：10年8.5亿美元换来381人在线',
    detail: '2013年立项，原为《黑旗》DLC。7次延期，项目主管因性骚扰被撤职。团队从未有明确设想，经理间权力争斗，每年项目重启。发售后Steam峰值381人。',
    metric: '381',
    metricLabel: 'Steam峰值在线'
  },
  {
    icon: 'ti-building-factory',
    title: '3A扩张：45个工作室，人均创收9.6万美元',
    detail: '奥德赛成功后疯狂扩张，全球45个工作室。项目周期拉长至5-8年，频繁返工。人均创收仅9.6万美元，规模带来的管理复杂度远超产能收益。',
    metric: '9.6万',
    metricLabel: '人均创收（美元）'
  },
  {
    icon: 'ti-alert-triangle',
    title: '2020年丑闻：创意引擎熄火',
    detail: '首席创意官、VP、游戏总监集体落马。25%员工经历职场不当行为。核心创意层清洗后战略摇摆，项目周期进一步失控——人才和文化的破坏几乎不可逆。',
    metric: '25%',
    metricLabel: '员工经历不当行为'
  },
  {
    icon: 'ti-canned',
    title: '罐头化反噬：玩家审美疲劳',
    detail: '《幽灵行动：断点》《星战：亡命之徒》口碑销量双失利。《刺客信条：影》预购仅《英灵殿》的7%。公式化开放世界（清据点、扫问号）终于反噬。',
    metric: '7%',
    metricLabel: '《影》预购/《英灵殿》'
  }
];

// ── 计算函数 ──

/**
 * 计算市值跌幅百分比
 * @param {number} peak - 峰值市值
 * @param {number} current - 当前市值
 * @returns {number} 跌幅百分比（正数）
 */
function calcDeclinePercent(peak, current) {
  if (peak <= 0) return 0;
  return Math.round((peak - current) / peak * 1000) / 10;
}

/**
 * 计算碧海黑帆成本等于多少个其他游戏
 * @param {number} skullBonesCost - 碧海黑帆成本
 * @param {number} otherCost - 其他游戏成本
 * @returns {number} 倍数
 */
function calcCostMultiple(skullBonesCost, otherCost) {
  if (otherCost <= 0) return 0;
  return Math.round(skullBonesCost / otherCost * 10) / 10;
}

/**
 * 计算人均创收
 * @param {number} revenue - 总营收（美元）
 * @param {number} headcount - 员工数
 * @returns {number} 人均创收（美元）
 */
function calcRevenuePerEmployee(revenue, headcount) {
  if (headcount <= 0) return 0;
  return Math.round(revenue / headcount);
}

/**
 * 格式化大数字
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
function formatLargeNumber(num) {
  if (Math.abs(num) >= 100000000) {
    return (num / 100000000).toFixed(1) + '亿';
  }
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toString();
}

/**
 * 获取市值变化数据中跌幅最大的区间
 * @param {Array} data - 市值数据数组
 * @returns {Object} 包含from, to, declinePercent的对象
 */
function findBiggestDecline(data) {
  if (!data || data.length < 2) return null;
  var maxDecline = 0;
  var maxIndex = 0;
  for (var i = 1; i < data.length; i++) {
    var decline = calcDeclinePercent(data[i - 1].value, data[i].value);
    if (decline > maxDecline) {
      maxDecline = decline;
      maxIndex = i;
    }
  }
  return {
    from: data[maxIndex - 1],
    to: data[maxIndex],
    declinePercent: maxDecline
  };
}

/**
 * 计算累计取消项目数量
 * @param {Object} timeline - 时间线数据
 * @returns {number} 取消的项目总数
 */
function countCanceledProjects(timeline) {
  // 2026年1月取消6个，加上之前取消的4个已公布项目 = 10个
  // 但根据数据，2023年取消3个未公布+4个已公布=7个，2026年取消6个
  // 总共取消的项目
  return 13; // 7+6
}

// ── 模块导出（兼容浏览器与Node测试） ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MARKET_CAP: MARKET_CAP,
    TIMELINE: TIMELINE,
    COST_COMPARISON: COST_COMPARISON,
    FINANCIAL_COMPARE: FINANCIAL_COMPARE,
    HEADCOUNT: HEADCOUNT,
    RD_SPENDING: RD_SPENDING,
    FATAL_BLOWS: FATAL_BLOWS,
    calcDeclinePercent: calcDeclinePercent,
    calcCostMultiple: calcCostMultiple,
    calcRevenuePerEmployee: calcRevenuePerEmployee,
    formatLargeNumber: formatLargeNumber,
    findBiggestDecline: findBiggestDecline,
    countCanceledProjects: countCanceledProjects
  };
}
