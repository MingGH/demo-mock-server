/**
 * tech-hype-cycle-logic.js
 * 科技热词生命周期评估逻辑
 */

const TechHypeCycleLogic = (() => {

  // 历史热词数据（相对热度，峰值=100）
  function getTopics() {
    return [
      {
        id: 'openclaw',
        name: 'OpenClaw (2026)',
        color: 'rgb(251,191,36)',
        labels: ['2025-11', '2025-12', '2026-01', '2026-01末', '2026-02', '2026-02末', '2026-03', '2026-03现在'],
        data: [1, 1, 2, 100, 88, 92, 95, 97],
        annotations: {
          3: 'Jan 29: 2天破100K stars',
          4: 'Feb 14: 创始人加入OpenAI',
          6: 'Mar 3: 超越React(250K stars)',
        },
        desc: 'OpenClaw 由奥地利开发者 Peter Steinberger 创建，2026年1月底爆红，2天内达到10万 GitHub stars，创下历史记录。与元宇宙不同，它的热度来自真实用户自发传播——有人用它自动投了278份简历，有人用它管理邮件、订机票。热度至今未见明显衰减。'
      },
      {
        id: 'metaverse',
        name: '元宇宙 (2021-2024)',
        color: 'rgb(248,113,113)',
        labels: ['2020', '2021-Q1', '2021-Q3', '2021-Q4', '2022-Q1', '2022-Q3', '2023-Q1', '2023-Q3', '2024-Q1', '2024-Q3'],
        data: [8, 15, 35, 100, 82, 60, 38, 22, 14, 10],
        annotations: {
          3: 'Meta 改名，扎克伯格押注',
          4: 'Meta 宣布投入$100亿/年',
          6: '用户流失，Horizon Worlds月活不足20万',
          8: 'Meta 裁员，元宇宙预算削减',
        },
        desc: '元宇宙热度由 Meta（Facebook）改名驱动，2021年Q4达到峰值。但核心问题是：热度来自企业 PR，而非真实用户需求。Meta 的 Horizon Worlds 月活用户峰值不足20万，远低于预期。2022年起热度持续下滑，2023年 Meta 大幅削减元宇宙预算，转向 AI。'
      },
      {
        id: 'nft',
        name: 'NFT (2021-2023)',
        color: 'rgb(167,139,250)',
        labels: ['2020', '2021-Q1', '2021-Q2', '2021-Q3', '2021-Q4', '2022-Q1', '2022-Q2', '2022-Q3', '2023-Q1', '2023-Q3'],
        data: [3, 45, 100, 78, 85, 70, 25, 12, 8, 5],
        annotations: {
          2: 'Beeple 作品拍出$6900万',
          4: 'OpenSea 月交易额破$30亿',
          6: 'NFT 市场崩塌，交易量跌97%',
        },
        desc: 'NFT 在2021年随加密货币牛市爆发，Beeple 的数字艺术品拍出6900万美元引爆全球关注。但本质上是投机泡沫：大多数 NFT 没有实际使用价值，价格完全由市场情绪驱动。2022年加密熊市来临，NFT 交易量暴跌97%，大量项目归零。'
      },
      {
        id: 'blockchain',
        name: '区块链 (2017-2020)',
        color: 'rgb(96,165,250)',
        labels: ['2016', '2017-Q1', '2017-Q3', '2017-Q4', '2018-Q1', '2018-Q3', '2019-Q1', '2019-Q3', '2020-Q1', '2020-Q4'],
        data: [5, 20, 55, 100, 65, 30, 20, 18, 22, 35],
        annotations: {
          3: 'BTC 破$2万，ICO 狂潮',
          4: '监管打压，BTC 暴跌80%',
          9: 'DeFi 兴起，区块链找到真实场景',
        },
        desc: '区块链2017年随比特币牛市达到峰值，大量 ICO 项目圈钱跑路。但与 NFT 不同，区块链最终找到了真实应用场景：DeFi（去中心化金融）、跨境支付、供应链溯源。热度从峰值回落后，在真实应用驱动下维持了一定基础热度，属于「泡沫中有真实价值」的混合型。'
      },
      {
        id: 'ai_agent',
        name: 'AI Agent (2024-2026)',
        color: 'rgb(74,222,128)',
        labels: ['2023-Q3', '2023-Q4', '2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1', '2025-Q3', '2026-Q1', '2026-Q1末'],
        data: [5, 12, 25, 38, 52, 68, 78, 88, 95, 100],
        annotations: {
          0: 'AutoGPT 早期探索',
          4: 'Claude 3.5 Sonnet 工具调用能力突破',
          8: 'OpenClaw 爆红，Agent 进入大众视野',
          9: 'GPT-5.4 在44个职业测试中匹配专业人士83%',
        },
        desc: 'AI Agent 是当前最具代表性的「基础设施型」热词。与元宇宙不同，它的热度增长是持续的、由真实能力提升驱动的。OpenClaw 的爆红是一个信号：AI Agent 已经从「演示」进入「真实使用」阶段。GPT-5.4 在专业能力测试中的表现，意味着这不是炒作，而是能力的真实跃升。'
      },
      {
        id: 'deepseek',
        name: 'DeepSeek (2025)',
        color: 'rgb(251,146,60)',
        labels: ['2024-Q3', '2024-Q4', '2025-01', '2025-01末', '2025-02', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1'],
        data: [2, 5, 8, 100, 75, 55, 48, 45, 42],
        annotations: {
          3: 'DeepSeek R1 发布，震惊硅谷',
          4: '英伟达单日市值蒸发$6000亿',
          5: '热度回归理性，但技术影响持续',
        },
        desc: 'DeepSeek 是一个有趣的案例：热度曲线像泡沫（快速拉升后回落），但技术影响是真实的。它证明了用更少算力可以训练出接近顶级的模型，永久改变了 AI 行业的成本预期。热度回落后，DeepSeek 的技术路线被广泛采用，属于「热度泡沫，价值真实」。'
      }
    ];
  }

  // 评估参数定义
  function getParams() {
    return [
      { id: 'userDriven', label: '真实用户自发传播比例', min: 0, max: 100, default: 70, step: 5, unit: '%' },
      { id: 'prDriven', label: '企业 PR / 资本炒作比例', min: 0, max: 100, default: 30, step: 5, unit: '%' },
      { id: 'realUseCase', label: '有明确真实使用场景', min: 0, max: 100, default: 75, step: 5, unit: '%' },
      { id: 'growthSpeed', label: '热度增长速度（越快越危险）', min: 1, max: 10, default: 7, step: 1, unit: '/10' },
      { id: 'techMaturity', label: '底层技术成熟度', min: 0, max: 100, default: 65, step: 5, unit: '%' },
      { id: 'networkEffect', label: '网络效应强度', min: 0, max: 100, default: 60, step: 5, unit: '%' },
    ];
  }

  // 评估逻辑
  function evaluate(vals) {
    const { userDriven, prDriven, realUseCase, growthSpeed, techMaturity, networkEffect } = vals;

    // 各维度评分（0-100）
    const s_user = userDriven;
    const s_pr = Math.max(0, 100 - prDriven);  // PR 越高，分越低
    const s_usecase = realUseCase;
    const s_speed = Math.max(0, 100 - (growthSpeed - 1) * 10); // 速度越快，分越低
    const s_tech = techMaturity;
    const s_network = networkEffect;

    // 加权总分
    const total = (
      s_user * 0.25 +
      s_pr * 0.20 +
      s_usecase * 0.25 +
      s_speed * 0.10 +
      s_tech * 0.10 +
      s_network * 0.10
    );

    const scores = [
      { label: '用户自发驱动', value: Math.round(s_user), color: s_user > 60 ? '#4ade80' : '#f87171' },
      { label: '去除 PR 噪音', value: Math.round(s_pr), color: s_pr > 60 ? '#4ade80' : '#f87171' },
      { label: '真实使用场景', value: Math.round(s_usecase), color: s_usecase > 60 ? '#4ade80' : '#f87171' },
      { label: '热度增长理性', value: Math.round(s_speed), color: s_speed > 60 ? '#4ade80' : '#f87171' },
      { label: '技术成熟度', value: Math.round(s_tech), color: s_tech > 60 ? '#4ade80' : '#f87171' },
      { label: '网络效应', value: Math.round(s_network), color: s_network > 60 ? '#4ade80' : '#f87171' },
    ];

    let type, title, body;

    if (total >= 65) {
      type = 'infra';
      title = `基础设施型（综合评分 ${Math.round(total)} 分）`;
      body = `这个技术热词具备成为基础设施的特征：<strong style="color:#4ade80">真实用户驱动、有明确使用场景、技术相对成熟</strong>。
        历史上类似的案例包括：互联网（1995）、智能手机（2007）、云计算（2010）、AI Agent（2024-2026）。
        热度不会永远维持，但底层价值会沉淀下来，成为下一代技术的基础。
        <br><br><span style="color:rgba(255,255,255,0.4)">参考案例：AI Agent、云计算、移动互联网</span>`;
    } else if (total >= 40) {
      type = 'unclear';
      title = `混合型，需要观察（综合评分 ${Math.round(total)} 分）`;
      body = `这个技术热词介于泡沫和基础设施之间。<strong style="color:#fbbf24">有真实价值，但也有明显的炒作成分</strong>。
        历史上类似的案例：区块链（有真实应用，但也有大量泡沫）、DeepSeek（热度泡沫，技术价值真实）。
        关键观察点：6-12个月后热度是否维持，真实用户数量是否持续增长。
        <br><br><span style="color:rgba(255,255,255,0.4)">参考案例：区块链、DeepSeek、早期移动支付</span>`;
    } else {
      type = 'bubble';
      title = `泡沫型风险较高（综合评分 ${Math.round(total)} 分）`;
      body = `这个技术热词具备泡沫的典型特征：<strong style="color:#f87171">企业 PR 驱动、缺乏真实使用场景、热度增长过快</strong>。
        历史上类似的案例：元宇宙（2021）、NFT（2021）、3D电视（2010）。
        这不代表技术本身没有价值，但当前的热度很可能超前于实际能力，存在较大回调风险。
        <br><br><span style="color:rgba(255,255,255,0.4)">参考案例：元宇宙、NFT、Google Glass</span>`;
    }

    return { type, title, body, scores, total: Math.round(total) };
  }

  // 历史案例表数据
  function getHistory() {
    return [
      { name: '互联网（Web 1.0）', peak: '1999', userDriven: 72, prDriven: 45, outcome: '泡沫破裂后成为基础设施', verdict: 'infra', verdictLabel: '基础设施' },
      { name: '元宇宙', peak: '2021', userDriven: 18, prDriven: 85, outcome: 'Meta 亏损$130亿，热度崩塌', verdict: 'bubble', verdictLabel: '泡沫' },
      { name: 'NFT', peak: '2021', userDriven: 35, prDriven: 70, outcome: '交易量跌97%，大量项目归零', verdict: 'bubble', verdictLabel: '泡沫' },
      { name: '区块链', peak: '2017', userDriven: 50, prDriven: 60, outcome: '泡沫后找到 DeFi 等真实场景', verdict: 'mixed', verdictLabel: '混合型' },
      { name: 'DeepSeek', peak: '2025', userDriven: 65, prDriven: 30, outcome: '热度回落，技术路线被广泛采用', verdict: 'mixed', verdictLabel: '混合型' },
      { name: 'AI Agent / OpenClaw', peak: '2026', userDriven: 88, prDriven: 20, outcome: '持续增长，真实用户驱动', verdict: 'infra', verdictLabel: '基础设施' },
      { name: '云计算', peak: '2012', userDriven: 78, prDriven: 35, outcome: '成为现代互联网基础设施', verdict: 'infra', verdictLabel: '基础设施' },
      { name: '3D 电视', peak: '2010', userDriven: 15, prDriven: 90, outcome: '消费者不买账，厂商全面退出', verdict: 'bubble', verdictLabel: '泡沫' },
    ];
  }

  return { getTopics, getParams, evaluate, getHistory };
})();

// Node.js 环境导出（用于测试）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TechHypeCycleLogic;
}
