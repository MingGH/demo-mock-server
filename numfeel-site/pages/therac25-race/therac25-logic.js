/**
 * Therac-25 竞态事故 · 纯逻辑层
 *
 * 模型说明：Therac-25 之所以误杀，不是某个按钮按错了，而是机器内部
 * 「检查挡板位置」与「开启 X 射线」两个环节之间有一个非原子的竞态窗口。
 * 操作员的第二道命令若恰好落进这个窗口，就会覆盖掉刚验证过的设置——
 * 挡板尚未就位，射线已经开火。
 *
 * 本页面把这个窗口抽象为一个可调参数 windowMs（竞态窗口宽度）。
 * 玩家要做的，就是在这台机器上「连打两条命令」，让两条命令的间隔
 * dt 小于窗口，从而亲手复现出 MALFUNCTION 54。
 */
'use strict';

/**
 * 三档固件预设：窗口宽度不同，复现难度天差地别。
 * 各字段含义：
 *  - windowMs  竞态窗口宽度（毫秒）。dt < windowMs 即触发竞态；0 表示互斥锁已修复，永不触发。
 *  - seqKeys  界面/键盘上连打的两枚键，模拟「挡板设置」→「加大剂量」。
 * @type {Array<{id:string,name:string,windowMs:number,desc:string,code:string}>}
 */
var PRESETS = [
  {
    id: 'legacy',
    name: '祖传固件（单线程任务）',
    windowMs: 260,
    code: 'fw v1.4',
    desc: '检查和开火之间留了一条极宽的空当。说是竞赛，不如说是敞开的洞。'
  },
  {
    id: 'normal',
    name: '标准固件（多任务抢占）',
    windowMs: 58,
    code: 'fw v2.0',
    desc: '窗口被压到几十毫秒。人靠肉手几乎按不进，但命令缓冲再挤一下就能滑进去。'
  },
  {
    id: 'fixed',
    name: '加了互斥锁',
    windowMs: 0,
    code: 'fw v2.1 · LOCK',
    desc: '验证与开火被原子化。窗口被缝死，任何手速都不再可能打穿。'
  }
];

/**
 * 一段病史/剂量常量（模型内的剂量单位）。
 * 真实史实：1985–1987 年共 6 起超剂量事故，多人去世；辐射剂量远超致死阈值。
 */
var DOSE_SETTING = 200;      // 玩家连打第二键时「想给」的剂量
var DOSE_SAFE = 2;           // 正规单次放疗剂量（Gy，模型值）
var DOSE_LETHAL = 25;        // 致死剂量阈值（Gy，模型值）

/**
 * 竞态判定：给定两键按下时刻，判断是否落进竞态窗口。
 * @param {number} tA 第一键时刻（ms）
 * @param {number} tB 第二键时刻（ms）
 * @param {number} windowMs 竞态窗口宽度（ms），0 表示已修复
 * @returns {{dt:number, raced:boolean, safe:boolean}}
 *   dt 两键间隔；raced 是否触发竞态；safe 是否安全。
 */
function evalShot(tA, tB, windowMs) {
  var dt = Math.max(0, (tB || 0) - (tA || 0));
  var raced = windowMs > 0 && dt < windowMs;
  // 向下取整：保证显示值与严格小于 windowMs 的判定一致（raw 57.6 → 显示 57，58 不触发）
  return { dt: Math.floor(dt), raced: raced, safe: !raced };
}

/**
 * 按竞态结果结算患者实际受到的剂量。
 * 未触发竞态：挡板先就位，剂量被限制在安全线内。
 * 触发竞态：挡板未来的及就位，第二键的剂量原封不动打进去。
 * @param {boolean} raced
 * @param {number} doseSetting 想给的剂量
 * @param {number} lethal 致死阈值（received 超过即判过剂量）
 * @param {number} safeDose 安全剂量（未触发竞态时被钳制到该值）
 * @returns {{received:number, overdosed:boolean}}
 */
function settleDose(raced, doseSetting, lethal, safeDose) {
  var received = raced ? doseSetting : Math.min(doseSetting, safeDose);
  return { received: received, overdosed: received > lethal };
}

/**
 * 跳过第一道命令（挡板检查）直接开火的回调文案。
 * 这不是竞态，是未授权操作：真实机器上这类操作必须被直接拒绝。
 * @returns {{head:string, body:string, tone:'invalid'}}
 */
function skipFeedback() {
  return {
    head: '未执行挡板检查 · 操作无效',
    body: '跳过第一道命令直接开火，安全检查根本没有运行。真实机器上这属于未授权操作，应当被拒绝并报警。',
    tone: 'invalid'
  };
}

/**
 * 给一次「复现打靶」判定配一句回调文案。
 * 触发竞态时不报喜，直接报事故现场。
 * @param {{dt:number,raced:boolean,safe:boolean}} res
 * @returns {{head:string, body:string, tone:'safe'|'boom'}}
 */
function shotFeedback(res) {
  if (res.raced) {
    return {
      head: 'MALFUNCTION 54',
      body: 'check 命令被第二道命令覆盖。挡板尚未就位，X 射线已经全功率开火。',
      tone: 'boom'
    };
  }
  return {
    head: '挡板就位 · 剂量正常',
    body: '中和，这台机器的检查和开火之间没被插入第二道命令。',
    tone: 'safe'
  };
}

/**
 * 生成一段「竞态窗口 vs 连打间隔」的对照数据（用于图表）。
 * 横轴是人类真实连打间隔（从极快到正常），竖轴是能否命中窗口。
 * @param {number} windowMs 当前窗口宽度
 * @param {number} fromMs 起点间隔
 * @param {number} toMs 终点间隔
 * @param {number} steps 采样点数
 * @returns {Array<{dt:number, hit:boolean}>}
 */
function generateTimingProfile(windowMs, fromMs, toMs, steps) {
  var points = [];
  for (var i = 0; i <= steps; i++) {
    var dt = fromMs + (toMs - fromMs) * (i / steps);
    var hit = windowMs > 0 && dt < windowMs;
    points.push({ dt: Math.round(dt), hit: hit });
  }
  return points;
}

/**
 * Therac-25 史实时间轴（年份 → 事件）。用于页面「复盘」区。
 * @returns {Array<{year:string,event:string}>}
 */
function getTimeline() {
  return [
    { year: '1983', event: 'Therac-25 推向市场。同款竞态代码在旧机型 Therac-20/11 上已潜伏多年，靠硬件互锁兜底未酿祸；这一代砍掉硬件互锁，安全全押在软件上。' },
    { year: '1985-06', event: '马里兰首例：患者在加速器 X 光治疗时感到灼烧。' },
    { year: '1986', event: '事故开始指向机器自身，但厂商将原因归于设备故障与「用户操作不当」。' },
    { year: '1987-01', event: '血液专家致信 FDA：一系列严重事故被关联到同一台机器。' },
    { year: '1987', event: '厂商被迫召回，追认软件竟态为根源。累计 6 起超剂量事故，多人去世。' },
    { year: '教训', event: '安全检查必须硬件冗余 + 原子化，不能只信软件里的一行判断。' }
  ];
}

var EXPORTS = {
  PRESETS: PRESETS,
  DOSE_SETTING: DOSE_SETTING,
  DOSE_SAFE: DOSE_SAFE,
  DOSE_LETHAL: DOSE_LETHAL,
  evalShot: evalShot,
  settleDose: settleDose,
  skipFeedback: skipFeedback,
  shotFeedback: shotFeedback,
  generateTimingProfile: generateTimingProfile,
  getTimeline: getTimeline
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EXPORTS;
}
if (typeof window !== 'undefined') {
  window.Therac25Logic = EXPORTS;
}
