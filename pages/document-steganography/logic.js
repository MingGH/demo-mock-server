(function(global) {
  'use strict';

  const WEIGHTS = {
    metadata: 26,
    whiteText: 24,
    trackChanges: 22,
    comments: 14,
    pdfLayer: 24
  };

  const BASE_PARAGRAPHS = [
    '这是准备发给客户的交付稿，正文只保留对外可见的报价、范围和交期。',
    '团队内部曾在文档里讨论过毛利、删减项和审批意见，导出前如果没清理，残留信息会跟着文件一起走。',
    '你眼睛看到的是一层，取证工具和解析器看到的往往是另一层。'
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function createPreset(config) {
    return Object.freeze(config);
  }

  const PRESETS = Object.freeze([
    createPreset({
      id: 'sales-quote',
      name: '销售报价单',
      summary: '最常见的翻车方式：修订、批注和文档属性一起带走。',
      config: {
        exportFormat: 'word',
        fileName: '2026-Q2-客户报价单.docx',
        title: '华北区渠道报价单',
        clientName: '星河科技',
        author: 'Chen Wei',
        lastEditor: 'Liu Yan',
        machineName: 'WEI-LAPTOP-07',
        createdAt: '2026-04-02 09:10',
        modifiedAt: '2026-04-15 22:43',
        visibleParagraphs: [
          '对外版本只保留渠道报价、交付周期和售后条款。',
          '正文里看不到内部审批意见，客户通常只会注意总价和交期。'
        ],
        whiteTextLayer: {
          enabled: false,
          content: ''
        },
        metadata: {
          enabled: true
        },
        trackChanges: {
          enabled: true,
          count: 7,
          sample: '原价 68 万，审批后改成 61 万；备注里保留了“低于 60 万就别接”的讨论。'
        },
        comments: {
          enabled: true,
          count: 3,
          sample: '批注：客户预算紧，再压 2 个点也许能签。'
        },
        pdfLayer: {
          enabled: false,
          name: '',
          content: ''
        }
      }
    }),
    createPreset({
      id: 'redacted-notice',
      name: '删减后的人事通知 PDF',
      summary: '肉眼看着干净，复制文本却能捞出白字层里的原始备注。',
      config: {
        exportFormat: 'pdf',
        fileName: '人事通知-对外版.pdf',
        title: '合作方驻场安排',
        clientName: '东湖数据',
        author: 'Zhang Min',
        lastEditor: 'Zhang Min',
        machineName: 'HR-SHARE-03',
        createdAt: '2026-03-28 10:15',
        modifiedAt: '2026-04-14 18:06',
        visibleParagraphs: [
          '对外可见版本只说明驻场时间、联系人和办公位置。',
          '看起来删掉的部分，其实还躺在同一页文本层里。'
        ],
        whiteTextLayer: {
          enabled: true,
          content: '内部备注：该顾问为试用期，薪资 23K，暂不对客户披露。'
        },
        metadata: {
          enabled: true
        },
        trackChanges: {
          enabled: false,
          count: 0,
          sample: ''
        },
        comments: {
          enabled: false,
          count: 0,
          sample: ''
        },
        pdfLayer: {
          enabled: false,
          name: '',
          content: ''
        }
      }
    }),
    createPreset({
      id: 'tender-plan',
      name: '投标方案 PDF',
      summary: '客户看到的是对外层，PDF 图层里还挂着内部成本测算。',
      config: {
        exportFormat: 'pdf',
        fileName: '政企项目解决方案.pdf',
        title: '政企项目交付方案',
        clientName: '华辰城投',
        author: 'Lin Hao',
        lastEditor: 'Lin Hao',
        machineName: 'BID-WS-19',
        createdAt: '2026-04-01 14:25',
        modifiedAt: '2026-04-12 23:18',
        visibleParagraphs: [
          '主文档只给客户看实施路线、里程碑和验收标准。',
          'PDF 里额外挂着一个默认关闭的图层，里面是内部口径和成本拆解。'
        ],
        whiteTextLayer: {
          enabled: false,
          content: ''
        },
        metadata: {
          enabled: true
        },
        trackChanges: {
          enabled: false,
          count: 0,
          sample: ''
        },
        comments: {
          enabled: false,
          count: 0,
          sample: ''
        },
        pdfLayer: {
          enabled: true,
          name: '内部成本测算',
          content: '服务器成本 48 万，第三方采购 17 万，毛利红线 22%。'
        }
      }
    }),
    createPreset({
      id: 'ocr-contract',
      name: 'OCR 合同归档件',
      summary: '扫描件外观看着像图片，底下还压着一层可检索文本和完整属性。',
      config: {
        exportFormat: 'pdf',
        fileName: '合同归档-客户副本.pdf',
        title: '框架采购合同',
        clientName: '云岚制造',
        author: 'Wang Jie',
        lastEditor: 'Wang Jie',
        machineName: 'SCAN-ROOM-02',
        createdAt: '2026-04-05 08:30',
        modifiedAt: '2026-04-15 11:52',
        visibleParagraphs: [
          '页面看起来像扫描件，很多人以为“图片化”以后就很安全。',
          '如果 OCR 文本层和文件属性没处理，搜索、复制和取证工具仍然能读到内部信息。'
        ],
        whiteTextLayer: {
          enabled: true,
          content: '识别文本层保留了经办人手机号、合同草案编号和归档标签。'
        },
        metadata: {
          enabled: true
        },
        trackChanges: {
          enabled: true,
          count: 2,
          sample: '修订记录里还留着“违约金比例 10% 改 5%”的痕迹。'
        },
        comments: {
          enabled: false,
          count: 0,
          sample: ''
        },
        pdfLayer: {
          enabled: true,
          name: 'OCR 校对层',
          content: '可检索文本层包含经办人、编号、扫描设备标签。'
        }
      }
    })
  ]);

  function createInitialConfig() {
    return clone(PRESETS[0].config);
  }

  function buildMetadataDetail(config) {
    const parts = [];
    if (normalizeText(config.author)) parts.push('作者：' + normalizeText(config.author));
    if (normalizeText(config.lastEditor)) parts.push('最后保存者：' + normalizeText(config.lastEditor));
    if (normalizeText(config.machineName)) parts.push('机器名：' + normalizeText(config.machineName));
    if (normalizeText(config.createdAt)) parts.push('创建时间：' + normalizeText(config.createdAt));
    if (normalizeText(config.modifiedAt)) parts.push('修改时间：' + normalizeText(config.modifiedAt));
    return parts.join('；');
  }

  function buildFindings(config) {
    const findings = [];
    const safeConfig = config || createInitialConfig();

    if (safeConfig.metadata && safeConfig.metadata.enabled) {
      findings.push({
        kind: 'metadata',
        title: '文档元数据仍然可读',
        severity: 'high',
        weight: WEIGHTS.metadata,
        detail: buildMetadataDetail(safeConfig) || '文档属性中仍保留作者、修改时间等信息。',
        exposure: '很多查看器都能直接打开文件属性，导出的 PDF 也常会把这些字段一起带走。'
      });
    }

    if (safeConfig.whiteTextLayer && safeConfig.whiteTextLayer.enabled && normalizeText(safeConfig.whiteTextLayer.content)) {
      findings.push({
        kind: 'whiteText',
        title: '不可见白色文字层仍在文件里',
        severity: 'high',
        weight: WEIGHTS.whiteText,
        detail: safeConfig.whiteTextLayer.content,
        exposure: '页面看着像删干净了，复制文本、OCR 或解析工具仍然能读到。'
      });
    }

    if (safeConfig.trackChanges && safeConfig.trackChanges.enabled) {
      findings.push({
        kind: 'trackChanges',
        title: '修订历史没有清掉',
        severity: 'high',
        weight: WEIGHTS.trackChanges,
        detail: safeConfig.trackChanges.sample || '仍保留 tracked changes 记录。',
        exposure: '接收方可以看到你改过什么、删过什么，很多时候还能带出协作者姓名。'
      });
    }

    if (safeConfig.comments && safeConfig.comments.enabled) {
      findings.push({
        kind: 'comments',
        title: '批注和审阅意见可见',
        severity: 'medium',
        weight: WEIGHTS.comments,
        detail: safeConfig.comments.sample || '文件中仍有批注。',
        exposure: '批注常常比正文更敏感，因为它记录的是内部讨论口径。'
      });
    }

    if (safeConfig.exportFormat === 'pdf' && safeConfig.pdfLayer && safeConfig.pdfLayer.enabled) {
      findings.push({
        kind: 'pdfLayer',
        title: 'PDF 隐藏图层仍可切出',
        severity: 'high',
        weight: WEIGHTS.pdfLayer,
        detail: (normalizeText(safeConfig.pdfLayer.name) || '未命名图层') + '：' + (normalizeText(safeConfig.pdfLayer.content) || '图层中仍有内容'),
        exposure: 'Acrobat 一类工具可以直接查看图层状态，默认隐藏不等于已经删除。'
      });
    }

    return findings;
  }

  function calculateRiskScore(config) {
    return Math.min(100, buildFindings(config).reduce(function(sum, item) {
      return sum + item.weight;
    }, 0));
  }

  function getRiskLevel(score) {
    if (score >= 60) return '高风险';
    if (score >= 30) return '中风险';
    return '低风险';
  }

  function buildChecklist(config) {
    const checks = [];
    if (config.trackChanges && config.trackChanges.enabled) {
      checks.push('在 Word 里先接受或拒绝全部修订，再清空审阅记录。');
    }
    if (config.comments && config.comments.enabled) {
      checks.push('删除批注、注释和内部讨论气泡。');
    }
    if (config.metadata && config.metadata.enabled) {
      checks.push('检查文档属性，清掉作者、最近保存者、机器相关字段和多余时间戳。');
    }
    if (config.whiteTextLayer && config.whiteTextLayer.enabled) {
      checks.push('不要把敏感内容改成白字或挪到不可见层，直接彻底删除后再复查可复制文本。');
    }
    if (config.exportFormat === 'pdf' && config.pdfLayer && config.pdfLayer.enabled) {
      checks.push('导出 PDF 前检查图层面板，必要时扁平化后再重新导出。');
    }
    if (checks.length === 0) {
      checks.push('当前模拟件已经较干净，发送前仍建议做一次人工复查。');
    }
    return checks;
  }

  function sanitizeConfig(config) {
    const next = clone(config);

    next.author = '';
    next.lastEditor = '';
    next.machineName = '';
    next.createdAt = '';
    next.modifiedAt = '';

    if (next.metadata) next.metadata.enabled = false;
    if (next.whiteTextLayer) {
      next.whiteTextLayer.enabled = false;
      next.whiteTextLayer.content = '';
    }
    if (next.trackChanges) {
      next.trackChanges.enabled = false;
      next.trackChanges.count = 0;
      next.trackChanges.sample = '';
    }
    if (next.comments) {
      next.comments.enabled = false;
      next.comments.count = 0;
      next.comments.sample = '';
    }
    if (next.pdfLayer) {
      next.pdfLayer.enabled = false;
      next.pdfLayer.name = '';
      next.pdfLayer.content = '';
    }

    return next;
  }

  function getPresetById(id) {
    const match = PRESETS.find(function(item) {
      return item.id === id;
    });
    return match ? clone(match) : null;
  }

  function getPresetStats() {
    return PRESETS.reduce(function(acc, preset) {
      acc.total += 1;
      if (preset.config.metadata && preset.config.metadata.enabled) acc.metadata += 1;
      if (preset.config.whiteTextLayer && preset.config.whiteTextLayer.enabled) acc.whiteText += 1;
      if ((preset.config.trackChanges && preset.config.trackChanges.enabled) || (preset.config.comments && preset.config.comments.enabled)) {
        acc.reviewTrail += 1;
      }
      if (preset.config.exportFormat === 'pdf' && preset.config.pdfLayer && preset.config.pdfLayer.enabled) acc.pdfLayer += 1;
      return acc;
    }, {
      total: 0,
      metadata: 0,
      whiteText: 0,
      reviewTrail: 0,
      pdfLayer: 0
    });
  }

  function buildSummary(config) {
    const findings = buildFindings(config);
    const score = calculateRiskScore(config);
    return {
      score: score,
      level: getRiskLevel(score),
      findings: findings,
      checklist: buildChecklist(config)
    };
  }

  const api = {
    BASE_PARAGRAPHS: BASE_PARAGRAPHS,
    PRESETS: PRESETS.map(function(item) { return clone(item); }),
    buildFindings: buildFindings,
    buildSummary: buildSummary,
    calculateRiskScore: calculateRiskScore,
    createInitialConfig: createInitialConfig,
    getPresetById: getPresetById,
    getPresetStats: getPresetStats,
    getRiskLevel: getRiskLevel,
    sanitizeConfig: sanitizeConfig
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.DocumentSteganographyLab = api;
})(typeof window !== 'undefined' ? window : globalThis);
