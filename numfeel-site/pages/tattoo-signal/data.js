/**
 * data.js - 纹身与犯罪数据模块
 *
 * 所有数值均来自公开论文/官方机构，每条数据标注 sourceId，对应 SOURCES 中的条目。
 * 立场：纹身是底层风险因素（边缘化、冲动性、亚文化归属）的可观测信号，
 *       印象有统计学基础，但纹身是信号而非因果，不能据此给个体贴标签。
 */
(function (global) {
  'use strict';

  // ── 数据来源 ──────────────────────────────────────────────
  var SOURCES = [
    {
      id: 'ye2024',
      title: '浅谈文身与犯罪',
      author: '叶勇豪（司法部预防犯罪研究所）',
      publisher: '《预防青少年犯罪研究》2024年第5期',
      year: 2024,
      link: 'https://www.faxin.cn/lib/flwx/FlqkContent.aspx?gid=F817074',
      type: '国内期刊'
    },
    {
      id: 'chengdu2022',
      title: '文身=变坏？青春期的切肤之痛',
      author: '成都未成年犯管教所',
      publisher: '澎湃号·政务',
      year: 2022,
      link: 'https://m.thepaper.cn/newsDetail_forward_21356150',
      type: '官方机构'
    },
    {
      id: 'jennings2014',
      title: 'Inked into Crime? An Examination of the Causal Relationship between Tattoos and Life-Course Offending',
      author: 'Jennings, Fox & Farrington',
      publisher: 'Journal of Criminal Justice 42(1):77-84',
      year: 2014,
      link: 'https://www.researchgate.net/publication/260014515',
      type: '同行评审论文'
    },
    {
      id: 'bales2013',
      title: 'Inmate Tattoos and In-Prison and Post-Prison Violent Behavior',
      author: 'Bales, Bloomberg & Waters',
      publisher: 'International Journal of Criminology and Sociology 2:20-31',
      year: 2013,
      link: 'https://www.ojp.gov/ncjrs/virtual-library/abstracts/inmate-tattoos-and-prison-and-post-prison-violent-behavior',
      type: '同行评审论文'
    },
    {
      id: 'dzhansarayeva2023',
      title: 'People with permanent tattoos are more likely to be arrested, convicted, and incarcerated',
      author: 'Dzhansarayeva et al.',
      publisher: 'Deviant Behavior（Add Health 数据 N=20745）',
      year: 2023,
      link: 'https://www.psypost.org/2023/11/people-with-permanent-tattoos-are-more-likely-to-be-arrested-convicted-and-incarcerated-study-finds-214368',
      type: '同行评审论文'
    },
    {
      id: 'kubik2022',
      title: 'Tattoos and Gangs as Risk Factors for Juvenile Recidivism',
      author: 'Kubik & Boxer',
      publisher: 'Journal of Gang Research 29(2):26-39',
      year: 2022,
      link: 'https://www.researchwithrutgers.com/en/publications/tattoos-and-gangs-as-risk-factors-for-juvenile-recidivism/',
      type: '同行评审论文'
    },
    {
      id: 'jafari2020',
      title: 'Tattooing among Iranian prisoners: results of the two national biobehavioral surveillance surveys',
      author: 'Jafari et al.',
      publisher: 'An Bras Dermatol 95(3):289-297（N=11988）',
      year: 2020,
      link: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7253895/',
      type: '同行评审论文'
    },
    {
      id: 'kaithwas2022',
      title: 'Tattoo and Crime: A Cross Sectional Study of Convicted Prison Inmates from Central India',
      author: 'Kaithwas et al.',
      publisher: 'Int J Toxicol Pharmacol Res 12(11):92-98',
      year: 2022,
      link: 'http://impactfactor.org/PDF/IJTPR/12/IJTPR,Vol12,Issue11,Article12.pdf',
      type: '同行评审论文'
    },
    {
      id: 'tran2018',
      title: 'Safer tattooing interventions in prisons: a systematic review',
      author: 'Tran et al.',
      publisher: 'BMC Public Health 18:1015',
      year: 2018,
      link: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6094923/',
      type: '系统综述'
    },
    {
      id: 'pew2023',
      title: '32% of Americans have a tattoo, including 22% who have more than one',
      author: 'Pew Research Center',
      publisher: 'Pew Research Center（N=8480）',
      year: 2023,
      link: 'https://www.pewresearch.org/short-reads/2023/08/15/32-of-americans-have-a-tattoo-including-22-who-have-more-than-one/',
      type: '权威民调'
    },
    {
      id: 'du2009',
      title: '对955例强制隔离戒毒学员纹身情况的调查',
      author: '杜新忠禁毒网',
      publisher: '强制隔离戒毒学员调查（标题 995 例，含完整性别分组 955 例）',
      year: 2009,
      link: 'https://wx.jhak.com/index.php?m=wap&a=show&catid=60&typeid=53&id=3390',
      type: '实地调查'
    },
    {
      id: 'taiwan2015',
      title: 'Is tattooing a risk factor for adolescents\' criminal behavior? Empirical evidence from an administrative data set of juvenile detainees in Taiwan',
      author: 'Liao PA, Chang HH, Su YJ',
      publisher: 'Risk Analysis 34(12):2080-2088（N=973）',
      year: 2014,
      link: 'https://www.medscape.com/medline/abstract/25598482',
      type: '同行评审论文'
    }
  ];

  var META = {
    title: '纹身是风险因素的可观测信号',
    subtitle: '都21世纪了，为什么还有人认为纹身泡吧就是坏女孩？',
    stance: '印象有统计学基础，但纹身是信号而非因果，不能据此给个体贴标签',
    keywords: ['纹身', '犯罪', '女性', '青少年', '毒品', '酒吧']
  };

  // ── 普通人群纹身流行率（Pew 2023）──────────────────────────
  var GENERAL_PREVALENCE = {
    usAdults: { value: 0.32, sourceId: 'pew2023', label: '美国成人有至少一个纹身' },
    byGender: [
      { group: '女性', value: 0.38, sourceId: 'pew2023' },
      { group: '男性', value: 0.27, sourceId: 'pew2023' }
    ],
    byAgeFemale: [
      { group: '18-29岁女性', value: 0.56, sourceId: 'pew2023' },
      { group: '30-49岁女性', value: 0.53, sourceId: 'pew2023' }
    ],
    byIncome: [
      { group: '低收入', value: 0.43, sourceId: 'pew2023' },
      { group: '中等收入', value: 0.31, sourceId: 'pew2023' },
      { group: '高收入', value: 0.21, sourceId: 'pew2023' }
    ],
    note: '纹身与收入、教育反相关——这正是「共同前因」的入口'
  };

  // ── 监狱/涉案群体纹身率 [P(纹身|犯罪) 方向] ────────────────
  // 全部数据均经过 web fetch 原文核对
  var PRISON_PREVALENCE = [
    { region: '伊朗男性囚犯（终身纹身）', value: 0.447, sourceId: 'jafari2020', note: '2015-2016 N=11617, 原文 Table 1 "5327 (44.7%)"' },
    { region: '伊朗女性囚犯（终身纹身）', value: 0.436, sourceId: 'jafari2020', note: '2015-2016 N=369, 原文 Table 1 "164 (43.6%)"' },
    { region: '印度 Khandwa 囚犯', value: 0.839, sourceId: 'kaithwas2022', note: 'N=106' },
    { region: '中国 F 省未管所 283 名男犯', value: 0.64, sourceId: 'chengdu2022', note: '2017 年 283 名男犯，澎湃号转引' },
    { region: '中国 S 市涉罪未成年人', value: 0.5051, sourceId: 'chengdu2022', note: '2020-01 至 2021-06，N=363 检察机关受理' },
    { region: '中国成都未管所未成年犯', value: 0.83, sourceId: 'chengdu2022', note: '2022-11 抽样，N=200；14 岁以下 20.53%' }
  ];

  // ── 女性分层：有纹身者被司法处理的优势比 (Dzhansarayeva 2023) ──
  var FEMALE_STRATIFIED = {
    sourceId: 'dzhansarayeva2023',
    note: 'Add Health 纵向数据 N=20745；控制自控力、越轨同伴、人口学后仍显著',
    male: { arrest: 2.5, convict: 1.8, incarcerate: 2.0 },
    female: { arrest: 1.75, convict: 1.68, incarcerate: 1.9 },
    caveat: '作者把部分原因归结为「污名化」：纹身者更易被司法系统盯上，而非必然犯更多罪'
  };

  // ── 再犯与狱内违规 ─────────────────────────────────────────
  var RECIDIVISM = [
    { metric: '狱内违规', uplift: 0.245, sourceId: 'bales2013', note: 'Florida 79749 名囚犯，有纹身者高 24.5%' },
    { metric: '3 年内再犯', uplift: 0.42, sourceId: 'bales2013', note: '出狱 3 年再犯风险高 42%' },
    { metric: '青少年 12 月再被捕', uplift: 1.62, sourceId: 'kubik2022', note: '控制帮派参与后仍高 162%' }
  ];

  // ── 青少年专项 ─────────────────────────────────────────────
  var JUVENILE = {
    samples: [
      { region: 'F 省未管所', value: 0.64, sourceId: 'chengdu2022' },
      { region: 'S 市涉罪未成年人', value: 0.5051, sourceId: 'chengdu2022' },
      { region: '成都未管所', value: 0.83, sourceId: 'chengdu2022' }
    ],
    chengduAge: { under16: 0.86, under14: 0.2053, sourceId: 'chengdu2022' },
    taiwan: {
      sourceId: 'taiwan2015',
      note: '973 名台湾少年羁押者，有纹身者各类犯罪增量',
      fraud: 0.03, assault: 0.13, drug: 0.09, homicide: 0.09
    }
  };

  // ── 戒毒所 ─────────────────────────────────────────────────
  var DRUG_TREATMENT = {
    sourceId: 'du2009',
    male: 0.331,
    female: 0.256,
    note: '原始报告标题 995 例，文中给出性别分组 955 例（男 873 / 女 82）'
  };

  // ── 因果结论（纹身是信号，不是因）─────────────────────────
  var CAUSAL = {
    jennings2014: {
      sourceId: 'jennings2014',
      finding: 'spurious（伪相关）',
      detail: 'Cambridge 纵向 411 名男性 + 倾向评分匹配：纹身与犯罪的相关来自共同的人格特质与发展风险因素，纹身本身不是因'
    },
    ye2024: {
      sourceId: 'ye2024',
      finding: '人格特质中介',
      detail: '13 省 4069 名罪犯访谈：高冲动性、高外倾性、高神经质、低宜人性者更可能纹身；这些特质同样预测犯罪'
    }
  };

  // ── 贝叶斯计算器默认参数：算 P(罪犯|纹身) ─────────────────
  // 先验 P(罪犯)：普通人群犯罪基数，保守取 1%
  // 命中率 P(纹身|罪犯)：取伊朗男性囚犯纹身率 0.447（Jafari 2020 原文 Table 1）
  // 误报率 P(纹身|¬罪犯)：取普通人群纹身率 0.32（Pew 2023）
  // 代入后 P(罪犯|纹身) ≈ 1.4% —— 印象有据，个体判断无据
  var BAYES_DEFAULTS = {
    prior: 0.01,
    likelihood: 0.447,
    falseRate: 0.32,
    note: '默认代入：先验犯罪率 1% × 罪犯纹身率 44.7%（伊朗男性囚犯 Jafari 2020）× 普通人纹身率 32%（Pew 2023）'
  };

  var api = {
    SOURCES: SOURCES,
    META: META,
    GENERAL_PREVALENCE: GENERAL_PREVALENCE,
    PRISON_PREVALENCE: PRISON_PREVALENCE,
    FEMALE_STRATIFIED: FEMALE_STRATIFIED,
    RECIDIVISM: RECIDIVISM,
    JUVENILE: JUVENILE,
    DRUG_TREATMENT: DRUG_TREATMENT,
    CAUSAL: CAUSAL,
    BAYES_DEFAULTS: BAYES_DEFAULTS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.TattooCrimeData = api;
  }
})(typeof window !== 'undefined' ? window : this);
