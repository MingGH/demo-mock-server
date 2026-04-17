/**
 * logic.js — 文档隐写泄露体检
 * 职责：
 *   1. SCENARIOS：预设场景数据
 *   2. generateDocx(scenarioId)：在浏览器里生成真实 .docx（OOXML + JSZip）
 *   3. scanDocx(arrayBuffer)：解析上传的 .docx，提取敏感字段
 */
(function (global) {
  'use strict';

  // ─── 场景数据 ────────────────────────────────────────────────────────────────

  var SCENARIOS = [
    {
      id: 'sales-quote',
      name: '销售报价单',
      badge: '高风险',
      badgeLevel: 'high',
      summary: '修订记录里藏着底价，批注里有内部口径，文档属性暴露了作者和机器名。',
      risks: ['元数据', '修订记录', '批注'],
      meta: {
        creator: 'Chen Wei',
        lastModifiedBy: 'Liu Yan',
        created: '2026-04-02T09:10:00Z',
        modified: '2026-04-15T22:43:00Z',
        company: 'Xinghuo Tech',
        machineName: 'WEI-LAPTOP-07'
      },
      content: {
        title: '华北区渠道报价单',
        recipient: '星河科技',
        fileName: '2026-Q2-客户报价单.docx',
        visibleText: [
          '感谢贵司对本次合作的关注。根据项目需求，我司提供以下报价方案：',
          '项目总价：人民币 61 万元整（含税）',
          '交付周期：合同签署后 90 个工作日内完成',
          '售后支持：提供 12 个月免费运维服务',
          '如有疑问，请联系我司销售代表。'
        ],
        whiteText: null,
        revisions: [
          { author: 'Chen Wei', date: '2026-04-10T14:22:00Z', deleted: '人民币 68 万元整', inserted: '人民币 61 万元整' },
          { author: 'Liu Yan', date: '2026-04-14T09:05:00Z', deleted: '120 个工作日', inserted: '90 个工作日' }
        ],
        comments: [
          { author: 'Liu Yan', date: '2026-04-14T09:10:00Z', text: '客户预算紧，再压 2 个点也许能签。低于 60 万就别接了。' },
          { author: 'Chen Wei', date: '2026-04-15T11:30:00Z', text: '已和老板确认，61 万是底线，不能再动。' }
        ]
      }
    },
    {
      id: 'hr-notice',
      name: '人事通知（白色文字）',
      badge: '高风险',
      badgeLevel: 'high',
      summary: '页面看着干净，全选复制却能捞出白色文字层里的薪资和试用期信息。',
      risks: ['元数据', '白色文字'],
      meta: {
        creator: 'Zhang Min',
        lastModifiedBy: 'Zhang Min',
        created: '2026-03-28T10:15:00Z',
        modified: '2026-04-14T18:06:00Z',
        company: 'HR Dept',
        machineName: 'HR-SHARE-03'
      },
      content: {
        title: '合作方驻场安排',
        recipient: '东湖数据',
        fileName: '人事通知-对外版.docx',
        visibleText: [
          '根据双方合作协议，现安排以下驻场人员：',
          '驻场时间：2026 年 5 月 1 日起，为期 6 个月',
          '驻场地点：东湖数据园区 B 栋 3 楼',
          '联系人：王经理，电话请通过内部系统查询',
          '如有问题请联系 HR 部门。'
        ],
        whiteText: '【内部备注，请勿对外披露】该顾问为试用期，月薪 23,000 元，试用期 3 个月，转正需部门主管审批。',
        revisions: [],
        comments: []
      }
    },
    {
      id: 'tender-plan',
      name: '投标方案（修订+批注）',
      badge: '中风险',
      badgeLevel: 'medium',
      summary: '修订记录里有删掉的内部成本数字，批注里有团队讨论的应对策略。',
      risks: ['元数据', '修订记录', '批注'],
      meta: {
        creator: 'Lin Hao',
        lastModifiedBy: 'Lin Hao',
        created: '2026-04-01T14:25:00Z',
        modified: '2026-04-12T23:18:00Z',
        company: 'BidTeam',
        machineName: 'BID-WS-19'
      },
      content: {
        title: '政企项目交付方案',
        recipient: '华辰城投',
        fileName: '政企项目解决方案.docx',
        visibleText: [
          '本方案针对华辰城投智慧园区项目，提供完整的系统集成与运维服务。',
          '实施周期：12 个月，分三个阶段交付',
          '验收标准：按照甲方提供的验收规范执行',
          '项目总报价：人民币 320 万元（含税）'
        ],
        whiteText: null,
        revisions: [
          { author: 'Lin Hao', date: '2026-04-08T16:40:00Z', deleted: '人民币 280 万元', inserted: '人民币 320 万元' },
          { author: 'Lin Hao', date: '2026-04-10T10:15:00Z', deleted: '服务器成本 48 万，第三方采购 17 万，毛利红线 22%。', inserted: '' }
        ],
        comments: [
          { author: 'Lin Hao', date: '2026-04-10T10:20:00Z', text: '成本那段删掉，不能让客户看到我们的毛利空间。' },
          { author: 'Lin Hao', date: '2026-04-12T22:00:00Z', text: '如果客户砍价超过 10%，就说硬件成本涨价，不要松口。' }
        ]
      }
    }
  ];

  // ─── OOXML 生成工具 ──────────────────────────────────────────────────────────

  function xmlEscape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function buildCoreXml(meta) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<cp:coreProperties\n' +
      '  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"\n' +
      '  xmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
      '  xmlns:dcterms="http://purl.org/dc/terms/"\n' +
      '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '  <dc:creator>' + xmlEscape(meta.creator) + '</dc:creator>\n' +
      '  <cp:lastModifiedBy>' + xmlEscape(meta.lastModifiedBy) + '</cp:lastModifiedBy>\n' +
      '  <cp:revision>3</cp:revision>\n' +
      '  <dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(meta.created) + '</dcterms:created>\n' +
      '  <dcterms:modified xsi:type="dcterms:W3CDTF">' + xmlEscape(meta.modified) + '</dcterms:modified>\n' +
      '</cp:coreProperties>';
  }

  function buildAppXml(meta) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">\n' +
      '  <Application>Microsoft Office Word</Application>\n' +
      '  <Company>' + xmlEscape(meta.company) + '</Company>\n' +
      '  <Manager>' + xmlEscape(meta.machineName) + '</Manager>\n' +
      '  <DocSecurity>0</DocSecurity>\n' +
      '</Properties>';
  }

  function buildCommentsXml(comments) {
    if (!comments || !comments.length) {
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>';
    }
    var items = comments.map(function (c, i) {
      return '  <w:comment w:id="' + i + '" w:author="' + xmlEscape(c.author) + '" w:date="' + xmlEscape(c.date) + '" w:initials="' + xmlEscape(c.author.charAt(0)) + '">\n' +
        '    <w:p><w:r><w:t>' + xmlEscape(c.text) + '</w:t></w:r></w:p>\n' +
        '  </w:comment>';
    }).join('\n');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
      items + '\n' +
      '</w:comments>';
  }

  function buildParagraph(text, opts) {
    opts = opts || {};
    var rPr = '';
    if (opts.white) {
      rPr = '<w:rPr><w:color w:val="FFFFFF"/></w:rPr>';
    }
    if (opts.bold) {
      rPr = '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>';
    }
    var pPr = '';
    if (opts.heading) {
      pPr = '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>';
    }
    return '<w:p>' + pPr + '<w:r>' + rPr + '<w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r></w:p>';
  }

  function buildRevisionParagraph(rev, idx) {
    // 段落包含删除内容（w:del）和插入内容（w:ins）
    var parts = [];
    if (rev.deleted) {
      parts.push(
        '<w:del w:id="' + (idx * 2) + '" w:author="' + xmlEscape(rev.author) + '" w:date="' + xmlEscape(rev.date) + '">' +
        '<w:r><w:rPr><w:strike/></w:rPr><w:delText xml:space="preserve">' + xmlEscape(rev.deleted) + '</w:delText></w:r>' +
        '</w:del>'
      );
    }
    if (rev.inserted) {
      parts.push(
        '<w:ins w:id="' + (idx * 2 + 1) + '" w:author="' + xmlEscape(rev.author) + '" w:date="' + xmlEscape(rev.date) + '">' +
        '<w:r><w:t xml:space="preserve">' + xmlEscape(rev.inserted) + '</w:t></w:r>' +
        '</w:ins>'
      );
    }
    return '<w:p>' + parts.join('') + '</w:p>';
  }

  function buildCommentRefParagraph(commentIdx, anchorText) {
    return '<w:p>' +
      '<w:r><w:t xml:space="preserve">' + xmlEscape(anchorText) + ' </w:t></w:r>' +
      '<w:commentRangeStart w:id="' + commentIdx + '"/>' +
      '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>' +
      '<w:commentReference w:id="' + commentIdx + '"/>' +
      '</w:r>' +
      '<w:commentRangeEnd w:id="' + commentIdx + '"/>' +
      '</w:p>';
  }

  function buildDocumentXml(content) {
    var W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    var paragraphs = [];

    // 标题
    paragraphs.push(buildParagraph(content.title, { heading: true }));
    // 收件方
    paragraphs.push(buildParagraph('收件方：' + content.recipient, { bold: false }));
    paragraphs.push(buildParagraph(''));

    // 正文
    content.visibleText.forEach(function (t) {
      paragraphs.push(buildParagraph(t));
    });

    // 白色文字（如果有）
    if (content.whiteText) {
      paragraphs.push(buildParagraph(''));
      paragraphs.push(buildParagraph(content.whiteText, { white: true }));
    }

    // 修订记录段落
    if (content.revisions && content.revisions.length) {
      paragraphs.push(buildParagraph(''));
      paragraphs.push(buildParagraph('— 以下为修订历史（审阅模式可见）—', { bold: false }));
      content.revisions.forEach(function (rev, i) {
        paragraphs.push(buildRevisionParagraph(rev, i));
      });
    }

    // 批注锚点段落
    if (content.comments && content.comments.length) {
      paragraphs.push(buildParagraph(''));
      content.comments.forEach(function (c, i) {
        paragraphs.push(buildCommentRefParagraph(i, '[批注 ' + (i + 1) + ']'));
      });
    }

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document ' + W + '>\n' +
      '<w:body>\n' +
      paragraphs.join('\n') + '\n' +
      '<w:sectPr/>\n' +
      '</w:body>\n' +
      '</w:document>';
  }

  function buildRelsXml(hasComments) {
    var commentRel = hasComments
      ? '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>\n'
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n' +
      commentRel +
      '</Relationships>';
  }

  function buildStylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
      '  <w:style w:type="paragraph" w:styleId="Heading1">\n' +
      '    <w:name w:val="heading 1"/>\n' +
      '    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>\n' +
      '  </w:style>\n' +
      '  <w:style w:type="character" w:styleId="CommentReference">\n' +
      '    <w:name w:val="Comment Reference"/>\n' +
      '  </w:style>\n' +
      '</w:styles>';
  }

  function buildContentTypesXml(hasComments) {
    var commentOverride = hasComments
      ? '  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>\n'
      : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\n' +
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n' +
      '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>\n' +
      '  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>\n' +
      '  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>\n' +
      commentOverride +
      '</Types>';
  }

  function buildPackageRels() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n' +
      '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>\n' +
      '  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>\n' +
      '</Relationships>';
  }

  /**
   * 生成 .docx 的 ArrayBuffer
   * @param {string} scenarioId
   * @returns {Promise<{buffer: ArrayBuffer, fileName: string}>}
   */
  function generateDocx(scenarioId) {
    var scenario = SCENARIOS.find(function (s) { return s.id === scenarioId; });
    if (!scenario) return Promise.reject(new Error('未知场景：' + scenarioId));

    var meta = scenario.meta;
    var content = scenario.content;
    var hasComments = content.comments && content.comments.length > 0;

    var zip = new JSZip();

    zip.file('[Content_Types].xml', buildContentTypesXml(hasComments));
    zip.file('_rels/.rels', buildPackageRels());
    zip.file('docProps/core.xml', buildCoreXml(meta));
    zip.file('docProps/app.xml', buildAppXml(meta));
    zip.file('word/document.xml', buildDocumentXml(content));
    zip.file('word/styles.xml', buildStylesXml());
    zip.file('word/_rels/document.xml.rels', buildRelsXml(hasComments));

    if (hasComments) {
      zip.file('word/comments.xml', buildCommentsXml(content.comments));
    }

    return zip.generateAsync({ type: 'arraybuffer', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      .then(function (buffer) {
        return { buffer: buffer, fileName: content.fileName };
      });
  }

  // ─── 解析上传的 .docx ────────────────────────────────────────────────────────

  function getXmlText(zip, path) {
    var file = zip.file(path);
    if (!file) return Promise.resolve(null);
    return file.async('string');
  }

  function parseXml(xmlStr) {
    if (!xmlStr) return null;
    try {
      return new DOMParser().parseFromString(xmlStr, 'application/xml');
    } catch (e) {
      return null;
    }
  }

  function getText(doc, selector) {
    if (!doc) return '';
    var el = doc.querySelector(selector);
    return el ? (el.textContent || '').trim() : '';
  }

  function getAll(doc, selector) {
    if (!doc) return [];
    return Array.from(doc.querySelectorAll(selector));
  }

  /**
   * 扫描 .docx 文件
   * @param {ArrayBuffer} arrayBuffer
   * @returns {Promise<ScanResult>}
   */
  function scanDocx(arrayBuffer) {
    return JSZip.loadAsync(arrayBuffer).then(function (zip) {
      return Promise.all([
        getXmlText(zip, 'docProps/core.xml'),
        getXmlText(zip, 'docProps/app.xml'),
        getXmlText(zip, 'word/document.xml'),
        getXmlText(zip, 'word/comments.xml')
      ]);
    }).then(function (results) {
      var coreXml = results[0];
      var appXml = results[1];
      var docXml = results[2];
      var commentsXml = results[3];

      var coreDoc = parseXml(coreXml);
      var appDoc = parseXml(appXml);
      var docDoc = parseXml(docXml);
      var commentsDoc = parseXml(commentsXml);

      var findings = [];

      // ── 元数据 ──
      var creator = getText(coreDoc, 'creator');
      var lastModifiedBy = getText(coreDoc, 'lastModifiedBy');
      var created = getText(coreDoc, 'created');
      var modified = getText(coreDoc, 'modified');
      var revision = getText(coreDoc, 'revision');
      var company = getText(appDoc, 'Company');
      var manager = getText(appDoc, 'Manager');
      var application = getText(appDoc, 'Application');

      var metaFields = [];
      if (creator) metaFields.push({ label: '作者', value: creator });
      if (lastModifiedBy) metaFields.push({ label: '最后保存者', value: lastModifiedBy });
      if (created) metaFields.push({ label: '创建时间', value: created.replace('T', ' ').replace('Z', '') });
      if (modified) metaFields.push({ label: '修改时间', value: modified.replace('T', ' ').replace('Z', '') });
      if (revision) metaFields.push({ label: '修订版本号', value: revision });
      if (company) metaFields.push({ label: '公司', value: company });
      if (manager) metaFields.push({ label: '机器名/管理者', value: manager });
      if (application) metaFields.push({ label: '创建软件', value: application });

      if (metaFields.length > 0) {
        findings.push({
          type: 'metadata',
          severity: 'high',
          title: '文档元数据可读',
          fields: metaFields,
          tip: '在 Word 里：文件 → 信息 → 检查问题 → 检查文档，可以一键清除。'
        });
      }

      // ── 修订记录 ──
      var insNodes = getAll(docDoc, 'ins');
      var delNodes = getAll(docDoc, 'del');
      var revCount = insNodes.length + delNodes.length;

      if (revCount > 0) {
        var revSamples = [];
        delNodes.slice(0, 3).forEach(function (node) {
          var author = node.getAttribute('w:author') || node.getAttribute('author') || '';
          var text = node.textContent.trim();
          if (text) revSamples.push({ type: '删除', author: author, text: text });
        });
        insNodes.slice(0, 3).forEach(function (node) {
          var author = node.getAttribute('w:author') || node.getAttribute('author') || '';
          var text = node.textContent.trim();
          if (text) revSamples.push({ type: '插入', author: author, text: text });
        });

        findings.push({
          type: 'revisions',
          severity: 'high',
          title: '修订记录未清除（共 ' + revCount + ' 处）',
          samples: revSamples,
          tip: '在 Word 里：审阅 → 接受所有修订，然后再次检查。'
        });
      }

      // ── 批注 ──
      var commentNodes = getAll(commentsDoc, 'comment');
      if (commentNodes.length > 0) {
        var commentSamples = commentNodes.slice(0, 5).map(function (node) {
          var author = node.getAttribute('w:author') || node.getAttribute('author') || '';
          var text = node.textContent.trim();
          return { author: author, text: text };
        });

        findings.push({
          type: 'comments',
          severity: 'medium',
          title: '批注未删除（共 ' + commentNodes.length + ' 条）',
          samples: commentSamples,
          tip: '在 Word 里：审阅 → 删除 → 删除文档中的所有批注。'
        });
      }

      // ── 白色文字 ──
      // 用正则直接在原始 XML 里检测，兼容自闭合标签和各种命名空间前缀
      var whiteColorRe = /<w:color\s[^>]*w:val="(?:FFFFFF|ffffff|white)"[^>]*\/?>/gi;
      var whiteMatches = docXml ? (docXml.match(whiteColorRe) || []) : [];

      if (whiteMatches.length > 0) {
        // 提取白色文字的文本内容：找 <w:color w:val="FFFFFF"/> 所在的 <w:rPr> 的父 <w:r>，再取 <w:t>
        var whiteTexts = [];
        var runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/gi;
        var runMatch;
        while ((runMatch = runRe.exec(docXml || '')) !== null) {
          var runContent = runMatch[1];
          if (/<w:color\s[^>]*w:val="(?:FFFFFF|ffffff|white)"/i.test(runContent)) {
            var tMatch = runContent.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/i);
            if (tMatch && tMatch[1].trim()) {
              whiteTexts.push(tMatch[1].trim());
            }
          }
        }

        findings.push({
          type: 'whiteText',
          severity: 'high',
          title: '发现白色文字（共 ' + whiteMatches.length + ' 处）',
          samples: whiteTexts.slice(0, 3),
          tip: '全选文字（Ctrl+A），将字体颜色改为黑色，就能看到隐藏内容。发送前请彻底删除。'
        });
      }

      return {
        findings: findings,
        clean: findings.length === 0
      };
    });
  }

  // ─── 导出 ────────────────────────────────────────────────────────────────────

  var api = {
    SCENARIOS: SCENARIOS,
    generateDocx: generateDocx,
    scanDocx: scanDocx
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.DocStegoLab = api;

})(typeof window !== 'undefined' ? window : globalThis);
