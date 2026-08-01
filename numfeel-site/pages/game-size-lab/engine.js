/**
 * 游戏包体实验室 — 纯计算引擎
 *
 * 两块内容：
 *  1. SDK_FACTS / SDK_TREE：Valve Source SDK 2013 仓库的实测数据（逐字节统计）
 *  2. buildPackage()：一个透明的游戏包体估算模型，每一项都是可验算的乘法
 *
 * 本文件不碰 DOM，可被 Node 直接 require 做单元测试。
 */

// ════════════════════════════════════════════════════════
// 一、单位常量
// ════════════════════════════════════════════════════════

var KIB = 1024;
var MIB = 1024 * 1024;
var GIB = 1024 * 1024 * 1024;

// ════════════════════════════════════════════════════════
// 二、Source SDK 2013 仓库实测数据
//    采集方式：下载 master 分支 tarball 后按扩展名逐字节统计
//    采集时间：2026-08
// ════════════════════════════════════════════════════════

/**
 * 仓库整体分类统计（单位：字节，实测值）
 * src   = .cpp/.h/.c/.cc/.hpp/.inl 源码文本
 * bin   = .lib/.a/.so/.dll/.exe/.pdb 等预编译产物
 * other = 资源、文档、脚本等其余文件
 */
var SDK_FACTS = {
  repoTotalBytes: 487115673,   // 仓库全部文件 = 464.6 MiB
  sourceTextBytes: 72650541,   // 源码文本     = 69.3 MiB
  binaryBytes: 356056626,      // 预编译二进制 = 339.6 MiB
  otherBytes: 58408506,        // 其他         = 55.7 MiB

  // TF2 游戏专属代码（src/game/{client,server,shared}/tf 三个目录的源码文本）
  tf2CodeBytes: 16312863,      // = 15.56 MiB
  tf2CodeGzipBytes: 3447002,   // gzip -9 压缩后 = 3.29 MiB

  // 代码行数（wc -l，含空行与注释）
  totalCodeLines: 2233657,     // 全仓库 .cpp/.h/.c
  tf2CodeLines: 533158,        // TF2 三目录

  // 「引擎」目录的真相：整个 src/engine 只有一个头文件
  engineDirBytes: 3134,
  engineDirFileCount: 1,
  engineDirOnlyFile: 'src/engine/audio/public/sound.h'
};

/**
 * 仓库目录体积树，用于 treemap 钻取。
 * kind: 'src' 源码为主 / 'bin' 二进制为主 / 'other' 其他
 */
var SDK_TREE = [
  {
    name: '第三方库 thirdparty', bytes: 225905835, kind: 'bin',
    note: '几乎全是 protobuf 2.6.1，其中 bin/ 目录一个人就占 211 MB',
    children: [
      { name: 'protobuf 预编译产物 bin/', bytes: 211645480, kind: 'bin', note: '各平台各配置的 libprotobuf.lib / libprotoc.a / protoc.exe' },
      { name: 'protobuf 源码 src/', bytes: 5518000, kind: 'src', note: 'Google 的代码，不是 Valve 写的' },
      { name: 'gtest 等其余', bytes: 8742355, kind: 'other', note: '测试框架与构建脚本' }
    ]
  },
  {
    name: '预编译静态库 src/lib', bytes: 144160189, kind: 'bin',
    note: '21 个 .lib + 16 个 .a + 3 个 .so，一行源码都没有',
    children: []
  },
  {
    name: '游戏代码 src/game', bytes: 47608302, kind: 'src',
    note: '真正的游戏逻辑都在这里，TF2 只占其中三个子目录',
    children: [
      { name: 'TF2 客户端 client/tf', bytes: 6033520, kind: 'src', note: 'HUD、观战、饰品渲染等客户端逻辑' },
      { name: 'TF2 服务端 server/tf', bytes: 4705694, kind: 'src', note: '兵种、建筑、回合规则等服务端逻辑' },
      { name: 'TF2 共享 shared/tf', bytes: 5781467, kind: 'src', note: '武器定义与客户端服务端共用的预测代码' },
      { name: '其他游戏与共享层', bytes: 31087621, kind: 'src', note: '半条命2、传送门、反恐精英源等示例游戏代码' }
    ]
  },
  {
    name: '工具链 src/utils', bytes: 20982631, kind: 'other',
    note: '地图编译器 vbsp / vvis / vrad 等命令行工具', children: []
  },
  {
    name: '构建工具 src/devtools', bytes: 17621194, kind: 'other',
    note: 'VPC 工程生成器与配套二进制，零行 C++ 源码', children: []
  },
  {
    name: '示例 MOD game/', bytes: 13839605, kind: 'other',
    note: '可直接运行的示例模块，含 10.9 MB 的 .bsp 地图文件', children: []
  },
  {
    name: '公共头文件 src/public', bytes: 8989315, kind: 'src',
    note: '跨模块共享的接口定义', children: []
  },
  {
    name: '材质系统 src/materialsystem', bytes: 3581768, kind: 'src',
    note: '着色器与材质管线，5 万行代码', children: []
  },
  {
    name: 'UI 框架 src/vgui2', bytes: 2209008, kind: 'src',
    note: 'Valve 自研界面框架', children: []
  },
  {
    name: '引擎 src/engine', bytes: 3134, kind: 'src',
    note: '整个目录只有 sound.h 一个文件。引擎本体从未开源。', children: []
  }
];

// ════════════════════════════════════════════════════════
// 三、包体估算模型的可选参数
// ════════════════════════════════════════════════════════

/** 贴图边长档位（正方形贴图，像素） */
var RESOLUTIONS = [128, 256, 512, 1024, 2048, 4096, 8192];

/**
 * 每档分辨率对应的「单个模型平均体积」（KiB）。
 * 贴图分辨率在这里同时充当制作年代的代理变量：
 * 贴图越精细的年代，模型面数与骨骼动画也越重。
 */
var MODEL_KIB_BY_RES = [2, 8, 30, 80, 200, 400, 800];

/** 贴图压缩格式与每像素字节数 */
var TEXTURE_FORMATS = [
  { id: 'raw', name: '未压缩 RGBA8', bytesPerPixel: 4, desc: '每像素 4 字节，画质无损，体积最狠' },
  { id: 'bc7', name: 'BC7 / DXT5', bytesPerPixel: 1, desc: '每像素 1 字节，现代游戏主力格式' },
  { id: 'bc1', name: 'BC1 / DXT1', bytesPerPixel: 0.5, desc: '每像素 0.5 字节，无透明通道，省一半' }
];

/** mipmap 开启后的体积系数：1 + 1/4 + 1/16 + ... = 4/3 */
var MIPMAP_FACTOR = 4 / 3;

/** 音频码率档位 */
var AUDIO_BITRATES = [
  { id: 'lossy', name: '有损 128 kbps', kbps: 128, desc: '够用，早期游戏的常规选择' },
  { id: 'high', name: '高码率 320 kbps', kbps: 320, desc: '现代 3A 语音与音乐的常见档' },
  { id: 'lossless', name: '无损 1411 kbps', kbps: 1411, desc: 'CD 品质 PCM，拨到这里硬盘会哭' }
];

/** 每语言语音时长档位（分钟） */
var VOICE_MINUTES = [2, 10, 30, 60, 120, 240, 480, 1200, 2400];

/** 单张地图的几何与光照数据体积档位（MiB） */
var PER_MAP_MIB = [0.05, 0.5, 2, 10, 30, 80, 150, 300, 500];

// ════════════════════════════════════════════════════════
// 四、体积计算：每个函数都是一条可验算的乘法
// ════════════════════════════════════════════════════════

/**
 * 按 id 取贴图格式定义
 * @param {string} id - 格式 id
 * @returns {object} 格式对象，找不到时回退到 bc7
 */
function getTextureFormat(id) {
  for (var i = 0; i < TEXTURE_FORMATS.length; i++) {
    if (TEXTURE_FORMATS[i].id === id) return TEXTURE_FORMATS[i];
  }
  return TEXTURE_FORMATS[1];
}

/**
 * 按 id 取音频码率定义
 * @param {string} id - 码率 id
 * @returns {object} 码率对象，找不到时回退到 lossy
 */
function getAudioBitrate(id) {
  for (var i = 0; i < AUDIO_BITRATES.length; i++) {
    if (AUDIO_BITRATES[i].id === id) return AUDIO_BITRATES[i];
  }
  return AUDIO_BITRATES[0];
}

/**
 * 把索引限制在数组范围内
 * @param {number} index - 原始索引
 * @param {Array} list - 目标数组
 * @returns {number} 合法索引
 */
function clampIndex(index, list) {
  if (typeof index !== 'number' || isNaN(index)) return 0;
  var i = Math.round(index);
  if (i < 0) return 0;
  if (i > list.length - 1) return list.length - 1;
  return i;
}

/**
 * 单张贴图的体积
 * 公式：边长 × 边长 × 每像素字节 × mipmap 系数
 * @param {number} resolution - 贴图边长（像素）
 * @param {string} formatId - 压缩格式 id
 * @param {boolean} mipmap - 是否生成 mipmap
 * @returns {number} 字节数
 */
function singleTextureBytes(resolution, formatId, mipmap) {
  var fmt = getTextureFormat(formatId);
  var raw = resolution * resolution * fmt.bytesPerPixel;
  return mipmap ? raw * MIPMAP_FACTOR : raw;
}

/**
 * 一套 PBR 材质的贴图体积（基础色 + 法线 + 粗糙度 + ...）
 * @param {number} resolution - 贴图边长
 * @param {number} channels - 通道数（贴图张数）
 * @param {string} formatId - 压缩格式 id
 * @param {boolean} mipmap - 是否生成 mipmap
 * @returns {number} 字节数
 */
function materialBytes(resolution, channels, formatId, mipmap) {
  return singleTextureBytes(resolution, formatId, mipmap) * channels;
}

/**
 * 全部贴图总体积
 * @param {number} materialCount - 唯一材质数量
 * @param {number} resolution - 贴图边长
 * @param {number} channels - 每材质通道数
 * @param {string} formatId - 压缩格式 id
 * @param {boolean} mipmap - 是否生成 mipmap
 * @returns {number} 字节数
 */
function textureTotalBytes(materialCount, resolution, channels, formatId, mipmap) {
  return materialBytes(resolution, channels, formatId, mipmap) * materialCount;
}

/**
 * 语音总体积
 * 公式：语言数 × 时长秒数 × 码率 ÷ 8
 * @param {number} langs - 配音语言数
 * @param {number} minutesPerLang - 每语言语音时长（分钟）
 * @param {string} bitrateId - 码率 id
 * @returns {number} 字节数
 */
function audioTotalBytes(langs, minutesPerLang, bitrateId) {
  var br = getAudioBitrate(bitrateId);
  var seconds = minutesPerLang * 60;
  return langs * seconds * (br.kbps * 1000 / 8);
}

/**
 * 地图总体积（几何、光照烘焙、碰撞体）
 * @param {number} mapCount - 地图数量
 * @param {number} perMapMiB - 单图体积（MiB）
 * @returns {number} 字节数
 */
function mapTotalBytes(mapCount, perMapMiB) {
  return mapCount * perMapMiB * MIB;
}

/**
 * 模型与动画总体积
 * 假设每个材质对应一个模型，单模型体积随贴图精度档位提升
 * @param {number} materialCount - 材质数量
 * @param {number} resIndex - 分辨率档位索引
 * @returns {number} 字节数
 */
function modelTotalBytes(materialCount, resIndex) {
  var idx = clampIndex(resIndex, MODEL_KIB_BY_RES);
  return materialCount * MODEL_KIB_BY_RES[idx] * KIB;
}

/**
 * 组装一个完整的游戏包体
 *
 * 总体积 = (贴图 + 语音 + 地图 + 模型) × 重复打包系数 + 代码
 * 代码不参与重复打包，因为可执行文件只有一份。
 *
 * @param {object} cfg - 配置对象
 * @param {number} cfg.resIndex - 分辨率档位索引
 * @param {number} cfg.materialCount - 材质数量
 * @param {number} cfg.pbrChannels - 每材质贴图张数
 * @param {string} cfg.formatId - 贴图格式 id
 * @param {boolean} cfg.mipmap - 是否生成 mipmap
 * @param {number} cfg.mapCount - 地图数量
 * @param {number} cfg.perMapIndex - 单图体积档位索引
 * @param {number} cfg.voiceLangs - 配音语言数
 * @param {number} cfg.voiceIndex - 语音时长档位索引
 * @param {string} cfg.bitrateId - 音频码率 id
 * @param {number} cfg.dupFactor - 关卡重复打包系数
 * @param {number} cfg.codeMiB - 代码体积（MiB）
 * @returns {object} 各分项字节数、总量、代码占比与派生指标
 */
function buildPackage(cfg) {
  var resIdx = clampIndex(cfg.resIndex, RESOLUTIONS);
  var resolution = RESOLUTIONS[resIdx];
  var perMapIdx = clampIndex(cfg.perMapIndex, PER_MAP_MIB);
  var voiceIdx = clampIndex(cfg.voiceIndex, VOICE_MINUTES);

  var texture = textureTotalBytes(cfg.materialCount, resolution, cfg.pbrChannels, cfg.formatId, cfg.mipmap);
  var audio = audioTotalBytes(cfg.voiceLangs, VOICE_MINUTES[voiceIdx], cfg.bitrateId);
  var maps = mapTotalBytes(cfg.mapCount, PER_MAP_MIB[perMapIdx]);
  var models = modelTotalBytes(cfg.materialCount, resIdx);
  var code = cfg.codeMiB * MIB;

  var dup = cfg.dupFactor > 0 ? cfg.dupFactor : 1;
  var assets = (texture + audio + maps + models) * dup;
  var total = assets + code;

  var breakdown = [
    { id: 'texture', label: '贴图纹理', bytes: texture * dup, color: '#ff6b6b' },
    { id: 'map', label: '地图数据', bytes: maps * dup, color: '#ffb74d' },
    { id: 'audio', label: '语音音频', bytes: audio * dup, color: '#81c784' },
    { id: 'model', label: '模型动画', bytes: models * dup, color: '#90caf9' },
    { id: 'code', label: '程序代码', bytes: code, color: '#ffd700' }
  ];
  for (var i = 0; i < breakdown.length; i++) {
    breakdown[i].percent = total > 0 ? (breakdown[i].bytes / total) * 100 : 0;
  }

  return {
    resolution: resolution,
    texture: texture * dup,
    audio: audio * dup,
    maps: maps * dup,
    models: models * dup,
    code: code,
    assets: assets,
    total: total,
    breakdown: breakdown,
    codePercent: total > 0 ? (code / total) * 100 : 0,
    singleMaterialBytes: materialBytes(resolution, cfg.pbrChannels, cfg.formatId, cfg.mipmap)
  };
}

// ════════════════════════════════════════════════════════
// 五、换算与格式化
// ════════════════════════════════════════════════════════

/**
 * 一段体积相当于多少份 TF2 全部游戏代码
 * @param {number} bytes - 待换算字节数
 * @param {boolean} gzipped - 是否按 gzip 压缩后的代码体积换算
 * @returns {number} 份数
 */
function codeEquivalents(bytes, gzipped) {
  var unit = gzipped ? SDK_FACTS.tf2CodeGzipBytes : SDK_FACTS.tf2CodeBytes;
  return bytes / unit;
}

/**
 * 大小之比（放大倍率）
 * @param {number} bigBytes - 大的一方
 * @param {number} smallBytes - 小的一方
 * @returns {number} 倍率，小的一方为 0 时返回 0
 */
function magnification(bigBytes, smallBytes) {
  if (!smallBytes) return 0;
  return bigBytes / smallBytes;
}

/**
 * 把字节数格式化成人类可读字符串（二进制单位）
 * @param {number} bytes - 字节数
 * @returns {string} 形如 "1.5 GB" / "512 MB" / "3.29 MB"
 */
function formatBytes(bytes) {
  if (bytes < 0 || typeof bytes !== 'number' || isNaN(bytes)) return '0 B';
  if (bytes < KIB) return Math.round(bytes) + ' B';
  if (bytes < MIB) return (bytes / KIB).toFixed(1) + ' KB';
  if (bytes < GIB) {
    var mb = bytes / MIB;
    return (mb < 100 ? mb.toFixed(2) : mb.toFixed(1)) + ' MB';
  }
  var gb = bytes / GIB;
  return (gb < 10 ? gb.toFixed(2) : gb.toFixed(1)) + ' GB';
}

/**
 * 格式化倍率（自动选择精度并加千分位）
 * @param {number} times - 倍率
 * @returns {string} 形如 "11,516" / "4.1"
 */
function formatMultiple(times) {
  if (typeof times !== 'number' || isNaN(times) || times < 0) return '0';
  // 整数不拖小数尾巴，免得静止时显示成「1.0 倍」
  if (times < 10) return times === Math.round(times) ? String(times) : times.toFixed(1);
  return Math.round(times).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化百分比，极小值不塌缩成 0
 * @param {number} percent - 百分数值
 * @returns {string} 形如 "0.0087%" / "12.3%"
 */
function formatPercent(percent) {
  if (typeof percent !== 'number' || isNaN(percent) || percent <= 0) return '0%';
  if (percent >= 10) return percent.toFixed(1) + '%';
  if (percent >= 1) return percent.toFixed(2) + '%';
  if (percent >= 0.01) return percent.toFixed(3) + '%';
  return percent.toFixed(5) + '%';
}

/**
 * 千分位整数
 * @param {number} num - 数字
 * @returns {string} 带千分位的字符串
 */
function formatNumber(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ════════════════════════════════════════════════════════
// 六、预设场景（参数经过校准，输出贴近各游戏公开标注体积）
// ════════════════════════════════════════════════════════

var PRESETS = [
  {
    id: 'doom',
    name: 'DOOM 1993',
    tag: '上古',
    blurb: '一张软盘装得下的年代：128 像素贴图、单通道、无 mipmap。',
    realWorld: '实际约 12 MB',
    config: {
      resIndex: 0, materialCount: 600, pbrChannels: 1, formatId: 'bc7', mipmap: false,
      mapCount: 27, perMapIndex: 0, voiceLangs: 1, voiceIndex: 0, bitrateId: 'lossy',
      dupFactor: 1.0, codeMiB: 1
    }
  },
  {
    id: 'tf2',
    name: 'Team Fortress 2',
    tag: '2007',
    blurb: '1024 贴图、双通道、百张地图、八国配音。本页所有源码数据都来自它。',
    realWorld: 'Steam 标注 15 GB',
    config: {
      resIndex: 3, materialCount: 3800, pbrChannels: 2, formatId: 'bc7', mipmap: true,
      mapCount: 100, perMapIndex: 4, voiceLangs: 8, voiceIndex: 3, bitrateId: 'lossy',
      dupFactor: 1.0, codeMiB: 16
    }
  },
  {
    id: 'aaa',
    name: '现代 3A',
    tag: '2024',
    blurb: '2K 贴图配六张 PBR 通道，一套材质就 32 MB。这是体积失控的真正开关。',
    realWorld: '对标《黑神话：悟空》约 130 GB',
    config: {
      resIndex: 4, materialCount: 3400, pbrChannels: 6, formatId: 'bc7', mipmap: true,
      mapCount: 40, perMapIndex: 7, voiceLangs: 4, voiceIndex: 7, bitrateId: 'high',
      dupFactor: 1.0, codeMiB: 100
    }
  },
  {
    id: 'bloat',
    name: '全家桶缝合怪',
    tag: '硬盘杀手',
    blurb: '十国配音、六十张地图，再叠一层关卡重复打包。硬盘绝望的样子。',
    realWorld: '对标《使命召唤：现代战争》约 175 GB',
    config: {
      resIndex: 4, materialCount: 3250, pbrChannels: 6, formatId: 'bc7', mipmap: true,
      mapCount: 60, perMapIndex: 7, voiceLangs: 10, voiceIndex: 7, bitrateId: 'high',
      dupFactor: 1.2, codeMiB: 150
    }
  }
];

/**
 * 按 id 取预设
 * @param {string} id - 预设 id
 * @returns {object|null} 预设对象
 */
function getPreset(id) {
  for (var i = 0; i < PRESETS.length; i++) {
    if (PRESETS[i].id === id) return PRESETS[i];
  }
  return null;
}

// ════════════════════════════════════════════════════════
// 七、真实游戏体积对照（公开标注值，单位 GiB）
// ════════════════════════════════════════════════════════

var REAL_GAMES = [
  { name: 'DOOM', year: 1993, gib: 0.012, source: '注册版 DOOM.WAD 约 11.2 MB' },
  { name: 'Quake III Arena', year: 1999, gib: 0.47, source: '安装体积约 480 MB' },
  { name: 'DOOM 3', year: 2004, gib: 2.2, source: '光盘安装体积' },
  { name: 'Team Fortress 2', year: 2007, gib: 15, source: 'Steam 商店系统需求标注' },
  { name: 'GTA V', year: 2013, gib: 72, source: 'Steam 商店系统需求标注' },
  { name: '巫师 3（含 DLC）', year: 2015, gib: 50, source: 'Steam 商店系统需求标注' },
  { name: '赛博朋克 2077', year: 2020, gib: 70, source: 'Steam 商店系统需求标注' },
  { name: '博德之门 3', year: 2023, gib: 150, source: 'Steam 商店系统需求标注' },
  { name: '黑神话：悟空', year: 2024, gib: 130, source: 'Steam 商店系统需求标注' },
  { name: '使命召唤：现代战争', year: 2019, gib: 175, source: '含全部内容包的峰值报道值' }
];

/**
 * 在真实游戏列表里找体积最接近的一款
 * @param {number} bytes - 待比较的字节数
 * @returns {object} 最接近的游戏对象，附 ratio 字段（用户包体 ÷ 该游戏）
 */
function findClosestGame(bytes) {
  var gib = bytes / GIB;
  var best = REAL_GAMES[0];
  var bestDiff = Infinity;
  for (var i = 0; i < REAL_GAMES.length; i++) {
    // 用对数距离，避免大体积游戏永远胜出
    var diff = Math.abs(Math.log(Math.max(gib, 1e-6)) - Math.log(REAL_GAMES[i].gib));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = REAL_GAMES[i];
    }
  }
  return {
    name: best.name,
    year: best.year,
    gib: best.gib,
    source: best.source,
    ratio: best.gib > 0 ? gib / best.gib : 0
  };
}

// ════════════════════════════════════════════════════════
// 八、缩放关卡：从包体一路放大到看见代码
// ════════════════════════════════════════════════════════

/**
 * 计算放大倍率 M 下条带的可见布局。
 *
 * 条带整体代表安装包总量，代码是最右端那一小节。
 * 放大 M 倍等价于「只显示右端 总量/M 那么多字节」，
 * 于是代码这一节的宽度占比会随 M 线性增长，直到铺满整条。
 * 用宽度百分比而不是 CSS transform，可以避免上万倍缩放时的渲染失真。
 *
 * @param {Array} segments - [{id,label,bytes,color}]，按左到右排列，代码放最后
 * @param {number} multiple - 放大倍率，小于 1 时按 1 处理
 * @returns {Array} 可见分段 [{id,label,color,bytes,widthPercent}]，从左到右
 */
function zoomSegments(segments, multiple) {
  if (!segments || !segments.length) return [];

  var total = 0;
  var i;
  for (i = 0; i < segments.length; i++) total += segments[i].bytes;
  if (total <= 0) return [];

  var m = (typeof multiple === 'number' && multiple >= 1) ? multiple : 1;
  var visible = total / m;

  // 浮点误差容限：total 是多个浮点相加得来的，放大到底时
  // visible 可能比代码段大出几个 ulp，若不容忍就会多出一个宽度近乎 0 的幽灵段
  var eps = total * 1e-12;

  var out = [];
  var remaining = visible;
  for (i = segments.length - 1; i >= 0 && remaining > eps; i--) {
    var take = Math.min(segments[i].bytes, remaining);
    if (take > 0) {
      out.unshift({
        id: segments[i].id,
        label: segments[i].label,
        color: segments[i].color,
        bytes: take,
        widthPercent: (take / visible) * 100
      });
    }
    remaining -= take;
  }
  return out;
}

/**
 * 生成缩放过程中的解说文案节点
 * 倍率从 1 走到 targetMultiple，途中给出参照物
 * @param {number} multiple - 当前放大倍率
 * @returns {string} 当前倍率下该显示的解说
 */
function zoomCaption(multiple) {
  if (multiple < 10) return '整块屏幕就是一个 175 GB 的安装包。代码在里面，你看不见。';
  if (multiple < 100) return '放大 10 倍了。还是一片贴图和语音。';
  if (multiple < 1000) return '过百倍。开始能分出地图和音频的边界。';
  if (multiple < 5000) return '过千倍。右端那条金色的，就是全部游戏代码。';
  if (multiple < 11519) return '快到了。代码正在从一条缝变成一整块。';
  return '11,519 倍。这就是 15.56 MB 的游戏代码，和它所在的 175 GB 安装包之间的差距。';
}

/**
 * 计算「在 X 里找到 Y」需要的放大倍率
 * @returns {number} 倍率
 */
function heroMagnification() {
  return magnification(175 * GIB, SDK_FACTS.tf2CodeBytes);
}

// ════════════════════════════════════════════════════════
// 九、导出
// ════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KIB: KIB, MIB: MIB, GIB: GIB,
    SDK_FACTS: SDK_FACTS,
    SDK_TREE: SDK_TREE,
    RESOLUTIONS: RESOLUTIONS,
    MODEL_KIB_BY_RES: MODEL_KIB_BY_RES,
    TEXTURE_FORMATS: TEXTURE_FORMATS,
    MIPMAP_FACTOR: MIPMAP_FACTOR,
    AUDIO_BITRATES: AUDIO_BITRATES,
    VOICE_MINUTES: VOICE_MINUTES,
    PER_MAP_MIB: PER_MAP_MIB,
    PRESETS: PRESETS,
    REAL_GAMES: REAL_GAMES,
    getTextureFormat: getTextureFormat,
    getAudioBitrate: getAudioBitrate,
    clampIndex: clampIndex,
    singleTextureBytes: singleTextureBytes,
    materialBytes: materialBytes,
    textureTotalBytes: textureTotalBytes,
    audioTotalBytes: audioTotalBytes,
    mapTotalBytes: mapTotalBytes,
    modelTotalBytes: modelTotalBytes,
    buildPackage: buildPackage,
    codeEquivalents: codeEquivalents,
    magnification: magnification,
    formatBytes: formatBytes,
    formatMultiple: formatMultiple,
    formatPercent: formatPercent,
    formatNumber: formatNumber,
    getPreset: getPreset,
    findClosestGame: findClosestGame,
    zoomSegments: zoomSegments,
    zoomCaption: zoomCaption,
    heroMagnification: heroMagnification
  };
}
