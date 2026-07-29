/**
 * 游戏体积膨胀分析 - 纯数据与逻辑模块
 * 与 DOM 解耦，可被 Node 直接 require 测试
 */

// ════════════════════════════════════════
// TF2 源码分析数据（基于真实 clone 分析）
// ════════════════════════════════════════

var TF2_CODE_STATS = {
  totalSourceMB: 481,        // Source SDK 全部源码（不含 .git）
  tf2GameCodeMB: 53,          // TF2 游戏专属代码
  gitSizeMB: 113,             // .git 目录
  totalLines: 2233657,        // 全部 C/C++ 代码行数
  tf2Lines: 533158,           // TF2 专属代码行数
  materialSystemLines: 50014, // 材质系统代码行数
  gameInstallMB: 29000        // TF2 游戏安装包大小（29GB）
};

/**
 * 计算 TF2 游戏代码占安装包的百分比
 * @returns {number} 百分比（0-100）
 */
function getCodePercentage() {
  return (TF2_CODE_STATS.tf2GameCodeMB / TF2_CODE_STATS.gameInstallMB) * 100;
}

/**
 * 计算全部源码占安装包的百分比
 * @returns {number} 百分比（0-100）
 */
function getTotalCodePercentage() {
  return (TF2_CODE_STATS.totalSourceMB / TF2_CODE_STATS.gameInstallMB) * 100;
}

// ════════════════════════════════════════
// TF2 体积膨胀时间线
// ════════════════════════════════════════

var TF2_TIMELINE = [
  { year: 2007, sizeGB: 5,  event: '首发上线，橙色盒子' },
  { year: 2009, sizeGB: 8,  event: '兵种更新 + 帽子系统' },
  { year: 2012, sizeGB: 12, event: 'Mann vs Machine PvE' },
  { year: 2015, sizeGB: 15, event: 'Gun Mettle 匹配系统' },
  { year: 2018, sizeGB: 20, event: 'Jungle Inferno 大更新' },
  { year: 2020, sizeGB: 23, event: 'Summer 2020 更新' },
  { year: 2023, sizeGB: 27, event: '社区更新持续积累' },
  { year: 2025, sizeGB: 29, event: '当前版本' }
];

/**
 * 计算 TF2 从首发到现在的体积膨胀倍数
 * @returns {number} 膨胀倍数
 */
function getGrowthMultiplier() {
  var first = TF2_TIMELINE[0].sizeGB;
  var last = TF2_TIMELINE[TF2_TIMELINE.length - 1].sizeGB;
  return last / first;
}

// ════════════════════════════════════════
// 29GB 内容拆解（基于 VPK 文件结构估算）
// ════════════════════════════════════════

var CONTENT_BREAKDOWN = [
  { category: '贴图纹理',  sizeGB: 10.2, percentage: 35, color: '#c8392c', description: '地图、角色、武器、帽子的 VTF 纹理文件' },
  { category: '地图文件',  sizeGB: 6.1,  percentage: 21, color: '#e8a838', description: 'BSP 地图文件，100+ 张地图' },
  { category: '3D 模型',   sizeGB: 4.1,  percentage: 14, color: '#5b9bd5', description: 'MDL 模型文件，角色、武器、道具' },
  { category: '音频文件',  sizeGB: 3.5,  percentage: 12, color: '#70ad47', description: '语音、音效、音乐，多语言包' },
  { category: '材质系统',  sizeGB: 2.6,  percentage: 9,  color: '#9b59b6', description: 'VMT 材质定义、Shader 参数' },
  { category: '粒子特效',  sizeGB: 1.5,  percentage: 5,  color: '#e67e22', description: 'PCF 粒子系统、爆炸效果' },
  { category: '其他',      sizeGB: 1.0,  percentage: 4,  color: '#888888', description: 'CEF 浏览器(178MB)、Shader 缓存、UI 资源' }
];

/**
 * 验证内容拆解数据总和是否合理
 * @returns {boolean} 总和是否在合理范围内
 */
function validateBreakdown() {
  var total = 0;
  for (var i = 0; i < CONTENT_BREAKDOWN.length; i++) {
    total += CONTENT_BREAKDOWN[i].sizeGB;
  }
  return total >= 28 && total <= 30;
}

// ════════════════════════════════════════
// 历史游戏体积对比
// ════════════════════════════════════════

var GAME_COMPARISON = [
  { name: 'DOOM',                year: 1993, sizeGB: 0.012, color: '#666' },
  { name: 'Quake III Arena',     year: 1999, sizeGB: 0.5,   color: '#888' },
  { name: 'C&C 将军',             year: 2003, sizeGB: 2,     color: '#aaa' },
  { name: 'DOOM 3',              year: 2004, sizeGB: 2.5,   color: '#bbb' },
  { name: 'TF2（首发）',          year: 2007, sizeGB: 5,     color: '#e8a838' },
  { name: 'GTA V',               year: 2013, sizeGB: 65,    color: '#e67e22' },
  { name: '巫师 3',               year: 2015, sizeGB: 35,    color: '#c8392c' },
  { name: '荒野大镖客 2',          year: 2018, sizeGB: 150,   color: '#ff6b6b' },
  { name: '赛博朋克 2077',        year: 2020, sizeGB: 70,    color: '#ce93d8' },
  { name: '使命召唤 MW',          year: 2019, sizeGB: 175,   color: '#ff6b6b' },
  { name: '博德之门 3',           year: 2023, sizeGB: 150,   color: '#9b59b6' },
  { name: '黑神话：悟空',          year: 2024, sizeGB: 130,   color: '#ffd700' },
  { name: 'TF2（当前）',          year: 2025, sizeGB: 29,    color: '#c8392c' }
];

/**
 * 获取指定年份范围内体积最大的游戏
 * @param {number} startYear - 起始年份
 * @param {number} endYear - 结束年份
 * @returns {object} 体积最大的游戏对象
 */
function getLargestGame(startYear, endYear) {
  var largest = null;
  for (var i = 0; i < GAME_COMPARISON.length; i++) {
    var g = GAME_COMPARISON[i];
    if (g.year >= startYear && g.year <= endYear) {
      if (!largest || g.sizeGB > largest.sizeGB) {
        largest = g;
      }
    }
  }
  return largest;
}

// ════════════════════════════════════════
// 体积膨胀因素
// ════════════════════════════════════════

var GROWTH_FACTORS = [
  {
    id: 'textures',
    title: 'PBR 多通道贴图',
    icon: 'ti-photo',
    description: '一个材质需要基础色、法线、粗糙度、金属度、AO、高度图等 6+ 张贴图。4K 贴图单张可达 64MB，不可过度压缩。',
    stat: '6x',
    statLabel: '贴图数量倍增'
  },
  {
    id: 'audio',
    title: '多语言无损音频',
    icon: 'ti-music',
    description: '8 国语言配音 + DTS/杜比/空间音频。3A 游戏光音频就能占 30GB。TF2 的英语语音包就超过 168MB。',
    stat: '30GB',
    statLabel: '纯音频体积'
  },
  {
    id: 'content',
    title: '内容无限堆积',
    icon: 'ti-stack-2',
    description: 'TF2 18 年间新增 100+ 张地图、数百种武器、海量帽子饰品。旧资源从不清理，新内容持续叠加。',
    stat: '6x',
    statLabel: '18 年膨胀倍数'
  },
  {
    id: 'space-time',
    title: '空间换时间',
    icon: 'ti-clock-share',
    description: '为适配机械硬盘的烂随机读取性能，同一资源按关卡重复存储多份。用容量换加载速度。',
    stat: '3-5x',
    statLabel: '资源重复倍数'
  },
  {
    id: 'waste',
    title: '废案与冗余',
    icon: 'ti-trash',
    description: '长期运营的游戏包体里残留大量未使用资源、废弃内容、旧版本文件。开发者没时间清理。',
    stat: '15%',
    statLabel: '估算冗余比例'
  }
];

// ════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════

/**
 * 格式化文件大小（自动转换单位）
 * @param {number} sizeGB - 大小（GB）
 * @returns {string} 格式化后的字符串
 */
function formatSize(sizeGB) {
  if (sizeGB < 0.001) {
    return Math.round(sizeGB * 1024 * 1024) + ' KB';
  }
  if (sizeGB < 1) {
    return Math.round(sizeGB * 1024) + ' MB';
  }
  if (sizeGB < 10) {
    return sizeGB.toFixed(1) + ' GB';
  }
  return Math.round(sizeGB) + ' GB';
}

/**
 * 格式化百分比（保留指定小数位）
 * @param {number} value - 值
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的百分比字符串
 */
function formatPercentage(value, decimals) {
  if (decimals === undefined) decimals = 2;
  return value.toFixed(decimals) + '%';
}

/**
 * 格式化大数字（添加千分位）
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 计算两个体积之间的倍数关系
 * @param {number} a - 值 A
 * @param {number} b - 值 B
 * @returns {number} a 是 b 的多少倍
 */
function calculateMultiplier(a, b) {
  if (b === 0) return 0;
  return a / b;
}

// ════════════════════════════════════════
// 模块导出（兼容浏览器与 Node 测试）
// ════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TF2_CODE_STATS: TF2_CODE_STATS,
    TF2_TIMELINE: TF2_TIMELINE,
    CONTENT_BREAKDOWN: CONTENT_BREAKDOWN,
    GAME_COMPARISON: GAME_COMPARISON,
    GROWTH_FACTORS: GROWTH_FACTORS,
    getCodePercentage: getCodePercentage,
    getTotalCodePercentage: getTotalCodePercentage,
    getGrowthMultiplier: getGrowthMultiplier,
    validateBreakdown: validateBreakdown,
    getLargestGame: getLargestGame,
    formatSize: formatSize,
    formatPercentage: formatPercentage,
    formatNumber: formatNumber,
    calculateMultiplier: calculateMultiplier
  };
}
