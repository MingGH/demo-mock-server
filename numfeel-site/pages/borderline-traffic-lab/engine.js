/**
 * 擦边流量账本：719 期视频 IMS 内容安全打分与流量演化分析引擎
 * 纯逻辑模块（不依赖 DOM，兼容浏览器与 Node.js 单元测试）
 */
'use strict';

/**
 * 计算封面综合擦边分（0.6 × IMS Sexy + 0.4 × IMS Porn）
 * @param {number} sexy - IMS Sexy 分 (0~100)
 * @param {number} porn - IMS Porn 分 (0~100)
 * @returns {number} 综合分，保留 1 位小数
 */
function calcCompositeScore(sexy, porn) {
  var s = Math.max(0, Math.min(100, Number(sexy) || 0));
  var p = Math.max(0, Math.min(100, Number(porn) || 0));
  return Math.round((s * 0.6 + p * 0.4) * 10) / 10;
}

/**
 * 计算数值数组的中位数
 * @param {number[]} nums - 数值数组
 * @returns {number} 中位数（空数组返回 0）
 */
function calcMedian(nums) {
  if (!nums || nums.length === 0) return 0;
  var sorted = nums.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 计算数值数组的算术平均值
 * @param {number[]} nums - 数值数组
 * @returns {number} 平均值（空数组返回 0）
 */
function calcMean(nums) {
  if (!nums || nums.length === 0) return 0;
  var sum = 0;
  for (var i = 0; i < nums.length; i++) sum += nums[i];
  return sum / nums.length;
}

/**
 * 计算两个等长数值数组的皮尔逊相关系数 r
 * @param {number[]} xs - 自变量数组
 * @param {number[]} ys - 因变量数组
 * @returns {number} 皮尔逊相关系数 (-1 ~ 1)
 */
function calcPearsonCorr(xs, ys) {
  if (!xs || !ys || xs.length !== ys.length || xs.length < 2) return 0;
  var n = xs.length;
  var mx = calcMean(xs);
  var my = calcMean(ys);
  var num = 0;
  var dx2 = 0;
  var dy2 = 0;
  for (var i = 0; i < n; i++) {
    var dx = xs[i] - mx;
    var dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  var denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
}

/**
 * 对任意视频子集计算核心统计指标（含 corr(score, log10(views))）
 * @param {Object[]} videos - 视频记录数组
 * @returns {Object} 聚合统计结果
 */
function computeSubsetStats(videos) {
  if (!videos || videos.length === 0) {
    return {
      totalCount: 0,
      publicCount: 0,
      memberCount: 0,
      memberRate: 0,
      totalViews: 0,
      meanViews: 0,
      medianViews: 0,
      hit100wCount: 0,
      hit100wRate: 0,
      avgScore: 0,
      avgSexy: 0,
      avgPorn: 0,
      avgNudeNet: 0,
      passCount: 0,
      reviewCount: 0,
      blockCount: 0,
      blockRate: 0,
      pornLabelCount: 0,
      pornLabelRate: 0,
      corrScoreLogViews: 0
    };
  }

  var totalCount = videos.length;
  var publicViews = [];
  var pubScores = [];
  var pubLogViews = [];
  var memberCount = 0;
  var hit100wCount = 0;
  var totalViews = 0;

  var sumScore = 0;
  var sumSexy = 0;
  var sumPorn = 0;
  var sumNN = 0;

  var passCount = 0;
  var reviewCount = 0;
  var blockCount = 0;
  var pornLabelCount = 0;

  for (var i = 0; i < totalCount; i++) {
    var v = videos[i];
    var sc = Number(v.score) || 0;
    sumScore += sc;
    sumSexy += Number(v.sexy) || 0;
    sumPorn += Number(v.porn) || 0;
    sumNN += Number(v.nn) || 0;

    if (v.sug === 'Block') blockCount++;
    else if (v.sug === 'Review') reviewCount++;
    else passCount++;

    if (v.label === 'Porn') pornLabelCount++;

    if (v.m === 1 || v.v === null || v.v === undefined) {
      memberCount++;
    } else {
      var views = Number(v.v) || 0;
      publicViews.push(views);
      totalViews += views;
      if (views >= 1000000) hit100wCount++;
      if (views > 0) {
        pubScores.push(sc);
        pubLogViews.push(Math.log10(views));
      }
    }
  }

  var publicCount = publicViews.length;
  return {
    totalCount: totalCount,
    publicCount: publicCount,
    memberCount: memberCount,
    memberRate: totalCount > 0 ? memberCount / totalCount : 0,
    totalViews: totalViews,
    meanViews: publicCount > 0 ? calcMean(publicViews) : 0,
    medianViews: publicCount > 0 ? calcMedian(publicViews) : 0,
    hit100wCount: hit100wCount,
    hit100wRate: publicCount > 0 ? hit100wCount / publicCount : 0,
    avgScore: sumScore / totalCount,
    avgSexy: sumSexy / totalCount,
    avgPorn: sumPorn / totalCount,
    avgNudeNet: sumNN / totalCount,
    passCount: passCount,
    reviewCount: reviewCount,
    blockCount: blockCount,
    blockRate: blockCount / totalCount,
    pornLabelCount: pornLabelCount,
    pornLabelRate: pornLabelCount / totalCount,
    corrScoreLogViews: calcPearsonCorr(pubScores, pubLogViews)
  };
}

/**
 * 判断视频综合分是否落在整数滑块闭区间 [minInt, maxInt] 内
 * 规则：Math.floor(score) 在 [minInt, maxInt] 内（例如 0..19 对应 0 <= score < 20，80..100 对应 80 <= score <= 100）
 * 保证四档整数区间 [0,19], [20,49], [50,79], [80,100] 不重不漏、总和严格等于 719
 * @param {number} score - 视频综合分
 * @param {number} minInt - 整数下限 (0~100)
 * @param {number} maxInt - 整数上限 (0~100)
 * @returns {boolean}
 */
function matchScoreBucket(score, minInt, maxInt) {
  var bucket = Math.min(100, Math.max(0, Math.floor(Number(score) || 0)));
  return bucket >= minInt && bucket <= maxInt;
}

/**
 * 按综合擦边分四档位统计视频播放量阶梯
 * @param {Object[]} videos - 全量视频数组
 * @returns {Object[]} 四档位统计结果数组
 */
function computeScoreTiers(videos) {
  var tiers = [
    { id: 'tier0', label: '0–19 分（常服弹琴）', shortLabel: '0–19分 常服', min: 0, max: 19 },
    { id: 'tier1', label: '20–49 分（轻度穿搭）', shortLabel: '20–49分 轻度', min: 20, max: 49 },
    { id: 'tier2', label: '50–79 分（中高擦边）', shortLabel: '50–79分 中高', min: 50, max: 79 },
    { id: 'tier3', label: '80–100 分（重度擦边）', shortLabel: '80–100分 重度', min: 80, max: 100 }
  ];

  return tiers.map(function (t) {
    var subset = (videos || []).filter(function (v) {
      return matchScoreBucket(v.score, t.min, t.max);
    });
    var stats = computeSubsetStats(subset);
    return {
      id: t.id,
      label: t.label,
      shortLabel: t.shortLabel,
      min: t.min,
      max: t.max,
      stats: stats
    };
  });
}

/**
 * 按 IMS 审核结论（Pass / Review / Block）分组统计
 * @param {Object[]} videos - 全量视频数组
 * @returns {Object} 包含 Pass, Review, Block 统计及 Block 相对 Pass 的增益比
 */
function computeVerdictStats(videos) {
  var list = videos || [];
  var passStats = computeSubsetStats(list.filter(function (v) { return v.sug === 'Pass'; }));
  var reviewStats = computeSubsetStats(list.filter(function (v) { return v.sug === 'Review'; }));
  var blockStats = computeSubsetStats(list.filter(function (v) { return v.sug === 'Block'; }));

  var medianBoostRatio = passStats.medianViews > 0
    ? blockStats.medianViews / passStats.medianViews
    : 1;
  var meanBoostRatio = passStats.meanViews > 0
    ? blockStats.meanViews / passStats.meanViews
    : 1;

  return {
    Pass: passStats,
    Review: reviewStats,
    Block: blockStats,
    medianBoostRatio: medianBoostRatio,
    meanBoostRatio: meanBoostRatio
  };
}

/**
 * 将 719 期视频按生涯演进拆分为四个阶段并统计（含阶段内 Pass vs Block 辛普森悖论拆解）
 * @param {Object[]} videos - 全量视频数组
 * @returns {Object[]} 四阶段统计数组
 */
function computeCareerPhases(videos) {
  var phaseDefs = [
    {
      id: 'phase-1',
      name: '常服弹琴期',
      shortName: '1.常服期(#1~214)',
      chartLabel: '常服期',
      rangeLabel: '第 1 至 214 期（前 3.5 年）',
      desc: '穿日常毛衣或连衣裙弹奏经典配乐，65.0% 视频为 Pass 合规，耗时三年半攒下 40 万粉丝。期内高分视频反而中位播放更低（0.63×）。',
      minSeq: 1,
      maxSeq: 214
    },
    {
      id: 'phase-2',
      name: '破圈爆发期',
      shortName: '2.爆发期(#215~288)',
      chartLabel: '爆发期',
      rangeLabel: '第 215 至 288 期（仅 74 期）',
      desc: '第 215 期尝试敞怀装破圈后粉丝暴涨至 150 万。注意：在本阶段内部，Pass 与 Block 中位播放同为 132.0 万（差距 0%）。',
      minSeq: 215,
      maxSeq: 288
    },
    {
      id: 'phase-3',
      name: '尺度加码期',
      shortName: '3.加码期(#289~550)',
      chartLabel: '加码期',
      rangeLabel: '第 289 至 550 期（中期 262 期）',
      desc: 'IMS Porn 均分从 34.6 涨到 50.6 分，但期内 Block 中位播放（74.0 万）仅比 Pass（71.5 万）高 3.5%，边际收益近乎消失。',
      minSeq: 289,
      maxSeq: 550
    },
    {
      id: 'phase-4',
      name: '审美疲劳与付费期',
      shortName: '4.疲劳期(#551~719)',
      chartLabel: '疲劳期',
      rangeLabel: '第 551 至 719 期（近期 169 期）',
      desc: 'Porn 均分加码至 57.6 分，但期内 Block 中位播放（49.0 万）反而低于 Pass（51.0 万，倒挂 -3.9%），26% 视频转入付费会员。',
      minSeq: 551,
      maxSeq: 719
    }
  ];

  var list = videos || [];
  return phaseDefs.map(function (p) {
    var sub = list.filter(function (v) {
      return v.seq >= p.minSeq && v.seq <= p.maxSeq;
    });
    var stats = computeSubsetStats(sub);
    var passSub = computeSubsetStats(sub.filter(function (v) { return v.sug === 'Pass'; }));
    var blockSub = computeSubsetStats(sub.filter(function (v) { return v.sug === 'Block'; }));
    var lowSub = computeSubsetStats(sub.filter(function (v) { return v.score < 50; }));
    var highSub = computeSubsetStats(sub.filter(function (v) { return v.score >= 50; }));

    var blockVsPassDiffPct = passSub.medianViews > 0
      ? ((blockSub.medianViews - passSub.medianViews) / passSub.medianViews) * 100
      : 0;
    var highVsLowRatio = lowSub.medianViews > 0
      ? highSub.medianViews / lowSub.medianViews
      : 1;

    return {
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      chartLabel: p.chartLabel,
      rangeLabel: p.rangeLabel,
      desc: p.desc,
      minSeq: p.minSeq,
      maxSeq: p.maxSeq,
      stats: stats,
      passMedianViews: passSub.medianViews,
      passPublicCount: passSub.publicCount,
      blockMedianViews: blockSub.medianViews,
      blockPublicCount: blockSub.publicCount,
      blockVsPassDiffPct: blockVsPassDiffPct,
      lowScoreMedianViews: lowSub.medianViews,
      highScoreMedianViews: highSub.medianViews,
      highVsLowRatio: highVsLowRatio
    };
  });
}

/**
 * 计算按生涯阶段分层加权后的 Block 相对 Pass 真实溢价（辛普森悖论修正）
 * 权重 = 该阶段 Pass + Block 公开视频数量之和
 * @param {Object[]} videos - 全量视频数组
 * @returns {Object} 分层加权溢价、各阶段拆解与全样本表观溢价
 */
function computeStratifiedVerdictPremium(videos) {
  var phases = computeCareerPhases(videos);
  var overall = computeVerdictStats(videos);
  var num = 0;
  var den = 0;
  phases.forEach(function (p) {
    var w = p.passPublicCount + p.blockPublicCount;
    if (w > 0) {
      num += p.blockVsPassDiffPct * w;
      den += w;
    }
  });
  return {
    stratifiedPct: den > 0 ? num / den : 0,
    pooledPct: (overall.medianBoostRatio - 1) * 100,
    phases: phases.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        passPublicCount: p.passPublicCount,
        blockPublicCount: p.blockPublicCount,
        passMedianViews: p.passMedianViews,
        blockMedianViews: p.blockMedianViews,
        diffPct: p.blockVsPassDiffPct,
        weight: p.passPublicCount + p.blockPublicCount
      };
    })
  };
}

/**
 * 计算频道订阅人数整数关口涨粉速度对比
 * @returns {Object} 里程碑数组及转型前后单期涨粉效率倍率
 */
function getSubscriberMilestones() {
  var milestones = [
    {
      id: 'm-40w',
      stage: '0 → 40 万订阅',
      mode: '常服弹琴期',
      startSeq: 1,
      endSeq: 215,
      videosUsed: 215,
      gainWan: 40,
      gainPerVideoWan: 40 / 215,
      milestoneVid: 'JZ7dawWE1rc',
      milestoneTitle: 'ONE PIECE ルフィコスプレ 7曲 メドレー [ピアノ] ～チャンネル登録40万人ありがとうございます！～'
    },
    {
      id: 'm-50w',
      stage: '40 万 → 50 万订阅',
      mode: '尝试敞怀装后',
      startSeq: 215,
      endSeq: 227,
      videosUsed: 12,
      gainWan: 10,
      gainPerVideoWan: 10 / 12,
      milestoneVid: 'q354B4STeyw',
      milestoneTitle: 'ONE PIECE 海賊女帝コスプレ 7曲 メドレー [ピアノ] ～チャンネル登録50万人ありがとうございます！～'
    },
    {
      id: 'm-100w',
      stage: '50 万 → 100 万订阅',
      mode: '破圈红利爆发',
      startSeq: 227,
      endSeq: 269,
      videosUsed: 42,
      gainWan: 50,
      gainPerVideoWan: 50 / 42,
      milestoneVid: 'N-jSin_-rmE',
      milestoneTitle: 'コードギアス 反逆のルルーシュ 5曲 メドレー Code Geass [ピアノ] ～チャンネル登録100万人ありがとうございます！～'
    },
    {
      id: 'm-150w',
      stage: '100 万 → 150 万订阅',
      mode: '全盛流量巅峰',
      startSeq: 269,
      endSeq: 288,
      videosUsed: 19,
      gainWan: 50,
      gainPerVideoWan: 50 / 19,
      milestoneVid: 'b5y_FVve_js',
      milestoneTitle: 'Fate/stay night [Heaven\'s Feel] 3曲 メドレー [ピアノ] ～チャンネル登録150万人ありがとうございます！～'
    }
  ];

  var beforeSpeed = 40 / 215;
  var afterSpeed = 110 / 73;
  return {
    milestones: milestones,
    beforeVideos: 215,
    beforeGainWan: 40,
    afterVideos: 73,
    afterGainWan: 110,
    speedMultiplier: afterSpeed / beforeSpeed
  };
}

/**
 * 获取同曲同人不同时期多版本重录的完整轨迹（破圈跃升 + 再次加码反噬）
 * @param {Object[]} videos - 全量视频数组
 * @returns {Object[]} 对照实验组列表
 */
function getSameSongControls(videos) {
  var map = {};
  (videos || []).forEach(function (v) { map[v.id] = v; });

  var groups = [
    {
      id: 'gurenge',
      song: '《鬼灭之刃》OP《红莲华》',
      anime: '鬼滅の刃 (Demon Slayer)',
      tabBadge: '破圈 5.7× → 三录再加码反跌 70%',
      summary: '第 1 版高领毛衣 362 万 → 第 2 版低领装扮叠加频道破圈冲上 2072 万（5.7×）。但随后的第 3 版把综合分进一步拉高到 93.4 分（Porn 85），播放量反而暴跌 69.6% 至 630 万。',
      earlyId: 'smd1Lz_1IUA',
      earlyNote: '高领毛衣 + 格纹长裙（第 113 期）',
      earlyTag: '初版·常服期',
      lateId: '_9OY4ZDnXn8',
      lateNote: '低领角色装扮重录（第 236 期）',
      lateTag: '二版·破圈红利 (5.7×)',
      extraId: '3bTajfD48fk',
      extraNote: '蝴蝶忍装继续加码（第 405 期）',
      extraTag: '三版·加码反跌 (-69.6%)'
    },
    {
      id: 'torikago',
      song: '《DARLING in the FRANXX》ED《トリカゴ》',
      anime: 'DARLING in the FRANXX',
      tabBadge: '跨期 22.6× → 三录泳装反跌 78%',
      summary: '第 22 期（几万粉初期）高领毛衣 39 万 → 第 366 期（百万粉期）敞怀风衣涨至 882 万（含粉丝体量增长）。然而第 443 期换上高叉泳装把分数拉到 91.6 分（Sexy 100）后，播放量直接跌去 78.1%，仅剩 193 万。',
      earlyId: 'SvHOTRJOht0',
      earlyNote: '高领毛衣 + 格纹长裙（第 22 期）',
      earlyTag: '初版·建号初期',
      lateId: 'NIpvWKHrbnU',
      lateNote: '敞怀风衣重录（第 366 期）',
      lateTag: '二版·百万粉期 (22.6×)',
      extraId: 'ZIcSesC7Nw8',
      extraNote: '高叉泳装极限加码（第 443 期）',
      extraTag: '三版·泳装反跌 (-78.1%)'
    },
    {
      id: 'eva',
      song: '《新世纪福音战士》OP《残酷天使的行动纲领》',
      anime: '新世紀エヴァンゲリオン (Evangelion)',
      tabBadge: '反例：最高播放(701万)恰是低分合规版',
      summary: '直接打破「越露越火」迷思的典型反例：第 3 版全身包裹的白色战斗服（综合分仅 31.4 分 Pass）拿到了 701 万最高播放；而随后的第 4 版把综合分拉到 94.6 分（Sexy 97 / Porn 91），播放量反而暴跌 92.4% 至 53 万！',
      earlyId: '2dGO23bMspA',
      earlyNote: '6 年前高性感度版（第 231 期）',
      earlyTag: '二版·Block (367万)',
      lateId: 'ChlomED7A0Q',
      lateNote: '5 年前全身包裹胶衣版（第 359 期）',
      lateTag: '三版·Pass合规 (701万最高)',
      extraId: 'dfLu3MQlWoM',
      extraNote: '5 年前 94.6 分重度擦边版（第 399 期）',
      extraTag: '四版·94.6分暴跌 (-92.4%)'
    },
    {
      id: 'styx',
      song: '《Re:从零开始的异世界生活》ED《STYX HELIX》',
      anime: 'Re:ゼロから始める異世界生活',
      tabBadge: '破圈 11.2× → 靠「超绝技巧」标题维系',
      summary: '第 166 期常服端坐弹奏仅 36 万播放（7.0 分 Pass）；第 229 期转型爆发期重录冲上 403 万（11.2×）；第 492 期不仅靠服装，还加上「超绝技巧」炫技曲目编排才维持住 508 万播放。',
      earlyId: 'ToycF1kC7KI',
      earlyNote: '早期常服端坐弹奏（第 166 期）',
      earlyTag: '初版·常服 (36万)',
      lateId: 'XUoPFp7MGVI',
      lateNote: '爆发期高露肤度重录（第 229 期）',
      lateTag: '二版·破圈期 (403万)',
      extraId: 'MqO_8OMln2g',
      extraNote: '「超绝技巧」重编版（第 492 期）',
      extraTag: '三版·炫技加持 (508万)'
    }
  ];

  return groups.map(function (g) {
    var early = map[g.earlyId] || null;
    var late = map[g.lateId] || null;
    var extra = map[g.extraId] || null;
    var multiplier = (early && late && early.v > 0) ? (late.v / early.v) : 1;
    var thirdVsSecondPct = (late && extra && late.v > 0)
      ? ((extra.v - late.v) / late.v) * 100
      : 0;
    return {
      id: g.id,
      song: g.song,
      anime: g.anime,
      tabBadge: g.tabBadge,
      summary: g.summary,
      early: early,
      earlyNote: g.earlyNote,
      earlyTag: g.earlyTag,
      late: late,
      lateNote: g.lateNote,
      lateTag: g.lateTag,
      extra: extra,
      extraNote: g.extraNote,
      extraTag: g.extraTag,
      multiplier: Math.round(multiplier * 10) / 10,
      thirdVsSecondPct: Math.round(thirdVsSecondPct * 10) / 10
    };
  });
}

/**
 * 按视频内容类别（钢琴演奏 / 手办开箱 / 纯展示Show / 其他日常）分类统计
 * @param {Object[]} videos - 全量视频数组
 * @returns {Object[]} 各类别统计结果
 */
function computeCategoryBreakdown(videos) {
  var cats = [
    { id: 'piano', name: '钢琴演奏 (Piano)', desc: '主业弹琴视频，后期普遍搭配高露肤度角色装扮' },
    { id: 'unbox', name: '手办开箱 (Unbox)', desc: '后期新增品类，常穿与手办同款的大尺度服装出镜对比' },
    { id: 'show', name: '纯身体展示 (Show)', desc: '不弹钢琴，仅用 1 分钟左右全方位展示服装与身材曲线' },
    { id: 'other', name: '日常与杂谈 (Other)', desc: '逛展、做饭、节日问候等日常短片' }
  ];
  var list = videos || [];
  return cats.map(function (c) {
    var sub = list.filter(function (v) { return v.cat === c.id; });
    return {
      id: c.id,
      name: c.name,
      desc: c.desc,
      stats: computeSubsetStats(sub)
    };
  });
}

/**
 * 多条件筛选与排序视频列表（综合分采用与四档位完全一致的 matchScoreBucket 整数区间规则）
 * @param {Object[]} videos - 视频数组
 * @param {Object} [opts] - 筛选与排序条件
 * @returns {Object[]} 筛选并排序后的新数组
 */
function filterAndSortVideos(videos, opts) {
  opts = opts || {};
  var minScore = opts.minScore !== undefined ? Number(opts.minScore) : 0;
  var maxScore = opts.maxScore !== undefined ? Number(opts.maxScore) : 100;
  var sug = opts.sug || 'all';
  var cat = opts.cat || 'all';
  var memberMode = opts.memberMode || 'all';
  var minSeq = opts.minSeq !== undefined ? Number(opts.minSeq) : 1;
  var maxSeq = opts.maxSeq !== undefined ? Number(opts.maxSeq) : 719;
  var query = (opts.query || '').trim().toLowerCase();
  var sortBy = opts.sortBy || 'score-desc';

  var filtered = (videos || []).filter(function (v) {
    if (!matchScoreBucket(v.score, minScore, maxScore)) return false;
    if (v.seq < minSeq || v.seq > maxSeq) return false;
    if (sug !== 'all' && v.sug !== sug) return false;
    if (cat !== 'all' && v.cat !== cat) return false;
    if (memberMode === 'public' && v.m === 1) return false;
    if (memberMode === 'member' && v.m !== 1) return false;
    if (query && v.t.toLowerCase().indexOf(query) === -1 && v.id.toLowerCase().indexOf(query) === -1) {
      return false;
    }
    return true;
  });

  filtered.sort(function (a, b) {
    if (sortBy === 'score-desc') return b.score - a.score || (b.v || 0) - (a.v || 0);
    if (sortBy === 'score-asc') return a.score - b.score || (b.v || 0) - (a.v || 0);
    if (sortBy === 'views-desc') return (b.v === null ? -1 : b.v) - (a.v === null ? -1 : a.v);
    if (sortBy === 'sexy-desc') return b.sexy - a.sexy || b.porn - a.porn;
    if (sortBy === 'porn-desc') return b.porn - a.porn || b.sexy - a.sexy;
    if (sortBy === 'nn-desc') return b.nn - a.nn || b.score - a.score;
    if (sortBy === 'seq-asc') return a.seq - b.seq;
    if (sortBy === 'seq-desc') return b.seq - a.seq;
    return b.score - a.score;
  });

  return filtered;
}

/**
 * 将视频数组导出为 CSV 文本（兼容 Excel UTF-8）
 * @param {Object[]} videos - 视频数组
 * @returns {string} CSV 字符串
 */
function toCsvString(videos) {
  var headers = ['时间序号', '擦边排名', '视频ID', '标题', '播放量(数值)', '播放量(显示)', '时长', '发布时间', '综合分', 'IMS Sexy', 'IMS Porn', 'IMS 判定', 'IMS Label', 'NudeNet色情度', '内容分类'];
  var lines = [headers.join(',')];
  (videos || []).forEach(function (v) {
    var safeTitle = '"' + String(v.t || '').replace(/"/g, '""') + '"';
    lines.push([
      v.seq,
      v.rank,
      v.id,
      safeTitle,
      v.v === null ? '' : v.v,
      v.vd,
      v.d,
      v.p,
      v.score,
      v.sexy,
      v.porn,
      v.sug,
      v.label,
      v.nn,
      v.cat
    ].join(','));
  });
  return lines.join('\n');
}

if (typeof window !== 'undefined') {
  window.BorderlineTrafficEngine = {
    calcCompositeScore: calcCompositeScore,
    calcMedian: calcMedian,
    calcMean: calcMean,
    calcPearsonCorr: calcPearsonCorr,
    matchScoreBucket: matchScoreBucket,
    computeSubsetStats: computeSubsetStats,
    computeScoreTiers: computeScoreTiers,
    computeVerdictStats: computeVerdictStats,
    computeCareerPhases: computeCareerPhases,
    computeStratifiedVerdictPremium: computeStratifiedVerdictPremium,
    getSubscriberMilestones: getSubscriberMilestones,
    getSameSongControls: getSameSongControls,
    computeCategoryBreakdown: computeCategoryBreakdown,
    filterAndSortVideos: filterAndSortVideos,
    toCsvString: toCsvString
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcCompositeScore: calcCompositeScore,
    calcMedian: calcMedian,
    calcMean: calcMean,
    calcPearsonCorr: calcPearsonCorr,
    matchScoreBucket: matchScoreBucket,
    computeSubsetStats: computeSubsetStats,
    computeScoreTiers: computeScoreTiers,
    computeVerdictStats: computeVerdictStats,
    computeCareerPhases: computeCareerPhases,
    computeStratifiedVerdictPremium: computeStratifiedVerdictPremium,
    getSubscriberMilestones: getSubscriberMilestones,
    getSameSongControls: getSameSongControls,
    computeCategoryBreakdown: computeCategoryBreakdown,
    filterAndSortVideos: filterAndSortVideos,
    toCsvString: toCsvString
  };
}
