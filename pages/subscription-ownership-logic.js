const SubscriptionOwnershipLogic = (function () {
  const PRESET_SERVICES = [
    {
      id: 'bilibili',
      name: 'B站大会员',
      category: 'entertainment',
      icon: 'ti-brand-bilibili',
      monthlyPrice: 25,
      buyoutPrice: null,
      alternativeName: '无稳定买断替代',
      dependency: 2,
      portability: 3,
      lockIn: 3,
      shutdownRisk: 2,
      priceRisk: 2,
      capability: '会员番剧、电影和大会员特权',
      cancelLoss: '停订后，片库和会员权益立刻收回。'
    },
    {
      id: 'qq-music',
      name: 'QQ音乐',
      category: 'entertainment',
      icon: 'ti-music',
      monthlyPrice: 15,
      buyoutPrice: 360,
      alternativeName: '买下常听歌单与数字专辑',
      dependency: 3,
      portability: 2,
      lockIn: 4,
      shutdownRisk: 3,
      priceRisk: 2,
      capability: '版权曲库、歌单和离线下载',
      cancelLoss: '停订后，高音质、下载与部分版权曲目会受限。'
    },
    {
      id: 'wechat-read',
      name: '微信读书',
      category: 'knowledge',
      icon: 'ti-book',
      monthlyPrice: 19,
      buyoutPrice: 399,
      alternativeName: '买下长期反复阅读的纸书或电子书',
      dependency: 2,
      portability: 2,
      lockIn: 3,
      shutdownRisk: 2,
      priceRisk: 2,
      capability: '书架、划线、笔记与会员书库',
      cancelLoss: '停订后，很多书能看见但不能继续读完。'
    },
    {
      id: 'icloud-200',
      name: 'iCloud 200GB',
      category: 'storage',
      icon: 'ti-cloud',
      monthlyPrice: 21,
      buyoutPrice: 499,
      alternativeName: '1TB 移动硬盘或 NAS 入门方案',
      dependency: 4,
      portability: 2,
      lockIn: 5,
      shutdownRisk: 2,
      priceRisk: 2,
      capability: '照片备份、设备同步与共享相册',
      cancelLoss: '停订后，空间收缩与迁移成本会同时出现。'
    },
    {
      id: 'baidu-pan',
      name: '百度网盘',
      category: 'storage',
      icon: 'ti-database-share',
      monthlyPrice: 26,
      buyoutPrice: 699,
      alternativeName: '2TB 本地存储与自建分享',
      dependency: 3,
      portability: 2,
      lockIn: 4,
      shutdownRisk: 2,
      priceRisk: 3,
      capability: '大文件存储、分享和高速下载',
      cancelLoss: '停订后，存储空间、下载速度和分享链路都会受影响。'
    },
    {
      id: 'chatgpt-plus',
      name: 'ChatGPT Plus',
      category: 'productivity',
      icon: 'ti-message-chatbot',
      monthlyPrice: 140,
      buyoutPrice: null,
      alternativeName: '无真正买断替代',
      dependency: 4,
      portability: 3,
      lockIn: 3,
      shutdownRisk: 3,
      priceRisk: 4,
      capability: '写作、分析、搜索与日常工作提效',
      cancelLoss: '停订后，很多工作还做得完，但节奏会明显变慢。'
    },
    {
      id: 'claude-pro',
      name: 'Claude Pro',
      category: 'productivity',
      icon: 'ti-sparkles',
      monthlyPrice: 140,
      buyoutPrice: null,
      alternativeName: '无真正买断替代',
      dependency: 4,
      portability: 3,
      lockIn: 3,
      shutdownRisk: 3,
      priceRisk: 4,
      capability: '长文本写作、代码辅助与资料整理',
      cancelLoss: '停订后，原本依赖长上下文的工作流会被打断。'
    },
    {
      id: 'github-copilot',
      name: 'GitHub Copilot',
      category: 'productivity',
      icon: 'ti-code',
      monthlyPrice: 70,
      buyoutPrice: null,
      alternativeName: '无真正买断替代',
      dependency: 4,
      portability: 4,
      lockIn: 3,
      shutdownRisk: 2,
      priceRisk: 3,
      capability: '代码补全、重构建议与模板生成',
      cancelLoss: '停订后，代码仍能写，但熟悉的反馈速度会下降。'
    },
    {
      id: 'wps-vip',
      name: 'WPS 会员',
      category: 'productivity',
      icon: 'ti-file-text',
      monthlyPrice: 15,
      buyoutPrice: 499,
      alternativeName: '一次性 Office 或本地文档方案',
      dependency: 3,
      portability: 4,
      lockIn: 2,
      shutdownRisk: 1,
      priceRisk: 2,
      capability: 'PDF、模板、云文档与协同功能',
      cancelLoss: '停订后，高级导出和部分模板能力会消失。'
    },
    {
      id: 'adobe-cc',
      name: 'Adobe Creative Cloud',
      category: 'creative',
      icon: 'ti-palette',
      monthlyPrice: 238,
      buyoutPrice: 1200,
      alternativeName: 'Affinity 全家桶等一次性替代',
      dependency: 5,
      portability: 3,
      lockIn: 5,
      shutdownRisk: 2,
      priceRisk: 4,
      capability: '设计文件、插件生态与团队协作',
      cancelLoss: '停订后，不只是不能新建，很多老文件流程也会受阻。'
    },
    {
      id: 'figma-pro',
      name: 'Figma Professional',
      category: 'creative',
      icon: 'ti-vector',
      monthlyPrice: 90,
      buyoutPrice: null,
      alternativeName: '无真正买断替代',
      dependency: 4,
      portability: 3,
      lockIn: 4,
      shutdownRisk: 2,
      priceRisk: 3,
      capability: '设计协作、版本历史与团队组件库',
      cancelLoss: '停订后，协作链条会比单个文件更先出问题。'
    },
    {
      id: 'keep',
      name: 'Keep 会员',
      category: 'lifestyle',
      icon: 'ti-activity-heartbeat',
      monthlyPrice: 19,
      buyoutPrice: 299,
      alternativeName: '买断课程与自建训练计划',
      dependency: 2,
      portability: 4,
      lockIn: 2,
      shutdownRisk: 1,
      priceRisk: 2,
      capability: '课程计划、训练记录与打卡动力',
      cancelLoss: '停订后，损失的不只是课程，还有持续被提醒的节奏。'
    },
    {
      id: 'jd-plus',
      name: '京东 PLUS',
      category: 'lifestyle',
      icon: 'ti-shopping-bag',
      monthlyPrice: 15,
      buyoutPrice: null,
      alternativeName: '无稳定买断替代',
      dependency: 2,
      portability: 5,
      lockIn: 2,
      shutdownRisk: 1,
      priceRisk: 2,
      capability: '包邮、优惠券和售后权益',
      cancelLoss: '停订后，损失的是价格优势而不是数据所有权。'
    },
    {
      id: 'xbox-game-pass',
      name: 'Xbox Game Pass',
      category: 'entertainment',
      icon: 'ti-device-gamepad-2',
      monthlyPrice: 65,
      buyoutPrice: 600,
      alternativeName: '买下 3 个长期常玩的游戏',
      dependency: 2,
      portability: 3,
      lockIn: 3,
      shutdownRisk: 2,
      priceRisk: 2,
      capability: '游戏库访问权与跨设备游玩',
      cancelLoss: '停订后，不是游戏变少，而是整个库瞬间消失。'
    }
  ];

  const CATEGORIES = {
    entertainment: '娱乐',
    knowledge: '阅读',
    storage: '存储',
    productivity: '效率',
    creative: '创作',
    lifestyle: '生活'
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits) {
    const base = Math.pow(10, digits || 0);
    return Math.round(value * base) / base;
  }

  function cloneService(serviceId) {
    const service = PRESET_SERVICES.find(function (item) {
      return item.id === serviceId;
    });
    return service ? JSON.parse(JSON.stringify(service)) : null;
  }

  function annualCost(service) {
    return service.monthlyPrice * 12;
  }

  function breakEvenMonths(service) {
    if (!service.buyoutPrice || service.monthlyPrice <= 0) {
      return null;
    }
    return Math.ceil(service.buyoutPrice / service.monthlyPrice);
  }

  function ownershipComponents(service) {
    const control = service.buyoutPrice ? 38 : 18;
    const portability = clamp(service.portability * 20, 0, 100);
    const continuity = clamp(100 - service.shutdownRisk * 12 - service.lockIn * 8, 0, 100);
    const pricing = clamp(100 - service.priceRisk * 15, 0, 100);
    const dependencyPenalty = (service.dependency - 1) * 7;
    const total = clamp(
      Math.round(control * 0.35 + portability * 0.2 + continuity * 0.25 + pricing * 0.2 - dependencyPenalty),
      0,
      100
    );

    return {
      control: round(control, 1),
      portability: round(portability, 1),
      continuity: round(continuity, 1),
      pricing: round(pricing, 1),
      total: total
    };
  }

  function serviceWeight(service) {
    return service.monthlyPrice * (0.8 + service.dependency * 0.4);
  }

  function evaluateService(service, horizonYears) {
    const components = ownershipComponents(service);
    const monthly = service.monthlyPrice;
    const annual = annualCost(service);
    const horizonCost = annual * horizonYears;
    const months = breakEvenMonths(service);

    return {
      id: service.id,
      name: service.name,
      category: service.category,
      icon: service.icon,
      monthlyPrice: monthly,
      annualCost: annual,
      horizonCost: horizonCost,
      buyoutPrice: service.buyoutPrice,
      alternativeName: service.alternativeName,
      breakEvenMonths: months,
      dependency: service.dependency,
      capability: service.capability,
      cancelLoss: service.cancelLoss,
      portability: service.portability,
      lockIn: service.lockIn,
      shutdownRisk: service.shutdownRisk,
      priceRisk: service.priceRisk,
      ownershipScore: components.total,
      ownershipComponents: components
    };
  }

  function aggregateOwnership(detailedServices) {
    if (!detailedServices.length) {
      return {
        control: 100,
        portability: 100,
        continuity: 100,
        pricing: 100
      };
    }

    let totalWeight = 0;
    let control = 0;
    let portability = 0;
    let continuity = 0;
    let pricing = 0;

    detailedServices.forEach(function (service) {
      const weight = serviceWeight(service);
      totalWeight += weight;
      control += service.ownershipComponents.control * weight;
      portability += service.ownershipComponents.portability * weight;
      continuity += service.ownershipComponents.continuity * weight;
      pricing += service.ownershipComponents.pricing * weight;
    });

    return {
      control: round(control / totalWeight, 1),
      portability: round(portability / totalWeight, 1),
      continuity: round(continuity / totalWeight, 1),
      pricing: round(pricing / totalWeight, 1)
    };
  }

  function analyzePortfolio(services, horizonYears) {
    const years = horizonYears || 5;
    const detailedServices = services.map(function (service) {
      return evaluateService(service, years);
    });

    const totals = detailedServices.reduce(function (sum, service) {
      sum.totalMonthly += service.monthlyPrice;
      sum.totalAnnual += service.annualCost;
      sum.totalHorizon += service.horizonCost;
      if (service.buyoutPrice) {
        sum.comparableSubscriptionCost += service.horizonCost;
        sum.totalBuyout += service.buyoutPrice;
        sum.comparableCount += 1;
      }
      return sum;
    }, {
      totalMonthly: 0,
      totalAnnual: 0,
      totalHorizon: 0,
      totalBuyout: 0,
      comparableSubscriptionCost: 0,
      comparableCount: 0
    });

    const ownership = aggregateOwnership(detailedServices);
    let weightedScore = 100;

    if (detailedServices.length) {
      let totalWeight = 0;
      let weightedSum = 0;
      detailedServices.forEach(function (service) {
        const weight = serviceWeight(service);
        totalWeight += weight;
        weightedSum += service.ownershipScore * weight;
      });
      weightedScore = Math.round(weightedSum / totalWeight);
    }

    const vulnerabilityList = detailedServices
      .filter(function (service) {
        return service.ownershipScore < 55;
      })
      .sort(function (a, b) {
        return a.ownershipScore - b.ownershipScore;
      });

    const longestCommitment = detailedServices
      .filter(function (service) {
        return service.breakEvenMonths !== null;
      })
      .sort(function (a, b) {
        return a.breakEvenMonths - b.breakEvenMonths;
      });

    return {
      horizonYears: years,
      selectedCount: detailedServices.length,
      totalMonthly: round(totals.totalMonthly, 1),
      totalAnnual: round(totals.totalAnnual, 1),
      totalHorizon: round(totals.totalHorizon, 1),
      totalBuyout: round(totals.totalBuyout, 1),
      comparableSubscriptionCost: round(totals.comparableSubscriptionCost, 1),
      comparableCount: totals.comparableCount,
      ownershipScore: weightedScore,
      ownership,
      vulnerableCount: vulnerabilityList.length,
      vulnerabilityList: vulnerabilityList,
      breakEvenList: longestCommitment,
      detailedServices: detailedServices
    };
  }

  function costCurve(services, maxYears) {
    const years = maxYears || 5;
    const labels = [];
    const subscription = [];
    const comparableSubscription = [];
    const comparableBuyout = [];

    for (let year = 1; year <= years; year++) {
      labels.push(year + '年');
      subscription.push(round(services.reduce(function (sum, service) {
        return sum + annualCost(service) * year;
      }, 0), 1));
      comparableSubscription.push(round(services.reduce(function (sum, service) {
        return sum + (service.buyoutPrice ? annualCost(service) * year : 0);
      }, 0), 1));
      comparableBuyout.push(round(services.reduce(function (sum, service) {
        return sum + (service.buyoutPrice || 0);
      }, 0), 1));
    }

    return {
      labels: labels,
      subscription: subscription,
      comparableSubscription: comparableSubscription,
      comparableBuyout: comparableBuyout
    };
  }

  function cancelAllScenario(services) {
    const sorted = services.slice().sort(function (a, b) {
      return b.dependency - a.dependency || b.monthlyPrice - a.monthlyPrice;
    });

    const impacts = sorted.map(function (service) {
      return {
        name: service.name,
        severity: service.dependency >= 4 ? '高' : service.dependency === 3 ? '中' : '低',
        dependency: service.dependency,
        message: service.cancelLoss
      };
    });

    const lossScore = sorted.reduce(function (sum, service) {
      return sum + service.dependency * (0.6 + service.monthlyPrice / 100);
    }, 0);

    return {
      serviceCount: services.length,
      severeCount: impacts.filter(function (item) {
        return item.severity === '高';
      }).length,
      lossScore: Math.round(lossScore),
      impacts: impacts
    };
  }

  function priceShockScenario(services, rate) {
    const shockRate = typeof rate === 'number' ? rate : 0.2;
    const details = services.map(function (service) {
      const multiplier = 1 + (service.priceRisk - 3) * 0.08;
      const monthlyIncrease = service.monthlyPrice * shockRate * multiplier;
      return {
        name: service.name,
        monthlyIncrease: round(monthlyIncrease, 1),
        fiveYearIncrease: round(monthlyIncrease * 12 * 5, 1)
      };
    }).sort(function (a, b) {
      return b.monthlyIncrease - a.monthlyIncrease;
    });

    return {
      extraMonthly: round(details.reduce(function (sum, item) {
        return sum + item.monthlyIncrease;
      }, 0), 1),
      extraAnnual: round(details.reduce(function (sum, item) {
        return sum + item.monthlyIncrease * 12;
      }, 0), 1),
      extraFiveYear: round(details.reduce(function (sum, item) {
        return sum + item.fiveYearIncrease;
      }, 0), 1),
      hardestHit: details[0] || null,
      details: details
    };
  }

  function contentShockScenario(services, removalRate) {
    const rate = typeof removalRate === 'number' ? removalRate : 0.3;
    const affectedCategories = { entertainment: true, knowledge: true, lifestyle: true };
    const affected = services.filter(function (service) {
      return affectedCategories[service.category];
    }).map(function (service) {
      const valueLoss = service.monthlyPrice * rate * (0.7 + service.lockIn * 0.06);
      return {
        name: service.name,
        valueLoss: round(valueLoss, 1),
        message: service.name + ' 的一部分内容库消失后，你丢掉的不是文件，而是访问权。'
      };
    }).sort(function (a, b) {
      return b.valueLoss - a.valueLoss;
    });

    return {
      affectedCount: affected.length,
      monthlyValueLoss: round(affected.reduce(function (sum, item) {
        return sum + item.valueLoss;
      }, 0), 1),
      details: affected
    };
  }

  function scoreLabel(score) {
    if (score >= 80) return '很强';
    if (score >= 60) return '还行';
    if (score >= 40) return '偏弱';
    return '很低';
  }

  const exports = {
    PRESET_SERVICES: PRESET_SERVICES,
    CATEGORIES: CATEGORIES,
    cloneService: cloneService,
    annualCost: annualCost,
    breakEvenMonths: breakEvenMonths,
    ownershipComponents: ownershipComponents,
    analyzePortfolio: analyzePortfolio,
    costCurve: costCurve,
    cancelAllScenario: cancelAllScenario,
    priceShockScenario: priceShockScenario,
    contentShockScenario: contentShockScenario,
    scoreLabel: scoreLabel
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  return exports;
})();
