/**
 * document-steganography.test.js
 * 运行方式：node pages/document-steganography/document-steganography.test.js
 *
 * 测试 logic.js 的核心逻辑（不依赖浏览器 API）
 */

'use strict';

// ── 最小化 mock ──────────────────────────────────────────────────────────────

// mock JSZip（仅测试 SCENARIOS 和 scanDocx 的 XML 解析路径）
function JSZipMock() {
  this._files = {};
}
JSZipMock.prototype.file = function (path, content) {
  this._files[path] = content;
  return this;
};
JSZipMock.prototype.generateAsync = function () {
  return Promise.resolve(new ArrayBuffer(8));
};
JSZipMock.loadAsync = function (buf) {
    // 返回一个模拟的 zip，包含 core.xml 和 comments.xml
    var files = {
      'docProps/core.xml': {
        async: function () {
          return Promise.resolve(
            '<?xml version="1.0"?>' +
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
            'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
            'xmlns:dcterms="http://purl.org/dc/terms/" ' +
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
            '<dc:creator>Test Author</dc:creator>' +
            '<cp:lastModifiedBy>Test Editor</cp:lastModifiedBy>' +
            '<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>' +
            '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-04-01T00:00:00Z</dcterms:modified>' +
            '</cp:coreProperties>'
          );
        }
      },
      'docProps/app.xml': {
        async: function () {
          return Promise.resolve(
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
            '<Company>TestCo</Company>' +
            '<Manager>TEST-PC-01</Manager>' +
            '</Properties>'
          );
        }
      },
      'word/document.xml': {
        async: function () {
          return Promise.resolve(
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            '<w:body>' +
            '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>' +
            '<w:p>' +
            '<w:del w:id="0" w:author="Alice" w:date="2026-01-01T00:00:00Z">' +
            '<w:r><w:delText>old text</w:delText></w:r>' +
            '</w:del>' +
            '<w:ins w:id="1" w:author="Alice" w:date="2026-01-01T00:00:00Z">' +
            '<w:r><w:t>new text</w:t></w:r>' +
            '</w:ins>' +
            '</w:p>' +
            '<w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>hidden</w:t></w:r></w:p>' +
            '</w:body>' +
            '</w:document>'
          );
        }
      },
      'word/comments.xml': {
        async: function () {
          return Promise.resolve(
            '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            '<w:comment w:id="0" w:author="Bob" w:date="2026-01-01T00:00:00Z">' +
            '<w:p><w:r><w:t>This is a comment</w:t></w:r></w:p>' +
            '</w:comment>' +
            '</w:comments>'
          );
        }
      }
    };
    return Promise.resolve({
      file: function (path) { return files[path] || null; }
    });
};
global.JSZip = JSZipMock;

// mock DOMParser（Node.js 没有，用简单的正则提取）
global.DOMParser = function () {};
global.DOMParser.prototype.parseFromString = function (xmlStr) {
  // 返回一个简单的 mock document，支持 querySelector 和 querySelectorAll
  function findAll(tag) {
    var results = [];
    var re = new RegExp('<(?:[a-z]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z]+:)?' + tag + '>', 'gi');
    var m;
    while ((m = re.exec(xmlStr)) !== null) {
      var content = m[1];
      var attrStr = m[0].match(/<[^>]+>/)[0];
      results.push({
        textContent: content.replace(/<[^>]+>/g, '').trim(),
        getAttribute: function (name) {
          var attrMatch = attrStr.match(new RegExp(name.replace(':', '\\:') + '="([^"]*)"'));
          return attrMatch ? attrMatch[1] : null;
        },
        querySelector: function (sel) {
          var inner = findAllIn(content, sel.replace(/^[a-z]+:/, ''));
          return inner[0] || null;
        },
        parentElement: {
          querySelector: function (sel) {
            var inner = findAllIn(content, sel.replace(/^[a-z]+:/, ''));
            return inner[0] || null;
          }
        }
      });
    }
    return results;
  }

  function findAllIn(str, tag) {
    var results = [];
    var re = new RegExp('<(?:[a-z]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z]+:)?' + tag + '>', 'gi');
    var m;
    while ((m = re.exec(str)) !== null) {
      results.push({ textContent: m[1].replace(/<[^>]+>/g, '').trim() });
    }
    return results;
  }

  return {
    querySelector: function (sel) {
      var tag = sel.replace(/^[a-z]+:/, '');
      var all = findAll(tag);
      return all[0] || null;
    },
    querySelectorAll: function (sel) {
      var tag = sel.replace(/^[a-z]+:/, '');
      return findAll(tag);
    }
  };
};

// ── 加载 logic.js ────────────────────────────────────────────────────────────

var path = require('path');
require(path.join(__dirname, 'logic.js'));
var lab = global.DocStegoLab;

// ── 测试工具 ─────────────────────────────────────────────────────────────────

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  ✓ ' + message);
    passed++;
  } else {
    console.error('  ✗ ' + message);
    failed++;
  }
}

function test(name, fn) {
  console.log('\n' + name);
  try {
    var result = fn();
    if (result && typeof result.then === 'function') {
      return result.catch(function (err) {
        console.error('  ✗ 异步测试失败：' + err.message);
        failed++;
      });
    }
  } catch (err) {
    console.error('  ✗ 测试抛出异常：' + err.message);
    failed++;
  }
}

// ── 测试用例 ─────────────────────────────────────────────────────────────────

test('SCENARIOS 数据完整性', function () {
  assert(Array.isArray(lab.SCENARIOS), 'SCENARIOS 是数组');
  assert(lab.SCENARIOS.length >= 3, '至少有 3 个场景');

  lab.SCENARIOS.forEach(function (s) {
    assert(typeof s.id === 'string' && s.id.length > 0, s.id + ': id 存在');
    assert(typeof s.name === 'string' && s.name.length > 0, s.id + ': name 存在');
    assert(Array.isArray(s.risks) && s.risks.length > 0, s.id + ': risks 非空');
    assert(s.meta && s.meta.creator, s.id + ': meta.creator 存在');
    assert(s.content && s.content.fileName, s.id + ': content.fileName 存在');
    assert(Array.isArray(s.content.visibleText), s.id + ': visibleText 是数组');
    assert(Array.isArray(s.content.revisions), s.id + ': revisions 是数组');
    assert(Array.isArray(s.content.comments), s.id + ': comments 是数组');
  });
});

test('sales-quote 场景包含修订和批注', function () {
  var s = lab.SCENARIOS.find(function (x) { return x.id === 'sales-quote'; });
  assert(s !== undefined, '找到 sales-quote 场景');
  assert(s.content.revisions.length >= 2, '至少 2 条修订记录');
  assert(s.content.comments.length >= 2, '至少 2 条批注');
  assert(s.content.whiteText === null, '无白色文字');
});

test('hr-notice 场景包含白色文字', function () {
  var s = lab.SCENARIOS.find(function (x) { return x.id === 'hr-notice'; });
  assert(s !== undefined, '找到 hr-notice 场景');
  assert(typeof s.content.whiteText === 'string' && s.content.whiteText.length > 0, '有白色文字内容');
  assert(s.content.revisions.length === 0, '无修订记录');
});

test('generateDocx 返回 ArrayBuffer', function () {
  return lab.generateDocx('sales-quote').then(function (result) {
    assert(result.buffer instanceof ArrayBuffer, '返回 ArrayBuffer');
    assert(result.buffer.byteLength > 0, 'buffer 非空');
    assert(typeof result.fileName === 'string' && result.fileName.endsWith('.docx'), '文件名以 .docx 结尾');
  });
});

test('generateDocx 未知场景返回 rejected Promise', function () {
  return lab.generateDocx('nonexistent').then(function () {
    assert(false, '应该 reject');
  }).catch(function (err) {
    assert(err instanceof Error, '返回 Error');
    assert(err.message.indexOf('nonexistent') !== -1, '错误信息包含场景 id');
  });
});

test('scanDocx 解析元数据', function () {
  return lab.scanDocx(new ArrayBuffer(0)).then(function (result) {
    assert(Array.isArray(result.findings), 'findings 是数组');
    assert(typeof result.clean === 'boolean', 'clean 是布尔值');

    var metaFinding = result.findings.find(function (f) { return f.type === 'metadata'; });
    assert(metaFinding !== undefined, '检测到元数据');
    assert(Array.isArray(metaFinding.fields), 'fields 是数组');

    var authorField = metaFinding.fields.find(function (f) { return f.label === '作者'; });
    assert(authorField !== undefined, '包含作者字段');
    assert(authorField.value === 'Test Author', '作者值正确');
  });
});

test('scanDocx 检测修订记录', function () {
  return lab.scanDocx(new ArrayBuffer(0)).then(function (result) {
    var revFinding = result.findings.find(function (f) { return f.type === 'revisions'; });
    assert(revFinding !== undefined, '检测到修订记录');
    assert(revFinding.severity === 'high', '修订记录为高风险');
    assert(Array.isArray(revFinding.samples), 'samples 是数组');
  });
});

test('scanDocx 检测批注', function () {
  return lab.scanDocx(new ArrayBuffer(0)).then(function (result) {
    var commentFinding = result.findings.find(function (f) { return f.type === 'comments'; });
    assert(commentFinding !== undefined, '检测到批注');
    assert(commentFinding.samples.length >= 1, '至少 1 条批注样本');
    assert(commentFinding.samples[0].author === 'Bob', '批注作者正确');
    assert(commentFinding.samples[0].text === 'This is a comment', '批注内容正确');
  });
});

test('scanDocx 检测白色文字', function () {
  return lab.scanDocx(new ArrayBuffer(0)).then(function (result) {
    var whiteFinding = result.findings.find(function (f) { return f.type === 'whiteText'; });
    assert(whiteFinding !== undefined, '检测到白色文字');
    assert(whiteFinding.severity === 'high', '白色文字为高风险');
  });
});

test('clean 文件返回 clean=true', function () {
  // 临时替换 JSZip mock 为干净文件
  var origLoadAsync = global.JSZip.loadAsync;
  global.JSZip.loadAsync = function () {
    return Promise.resolve({
      file: function (path) {
        if (path === 'docProps/core.xml') {
          return {
            async: function () {
              return Promise.resolve(
                '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">' +
                '</cp:coreProperties>'
              );
            }
          };
        }
        return null;
      }
    });
  };

  return lab.scanDocx(new ArrayBuffer(0)).then(function (result) {
    assert(result.clean === true, '干净文件 clean=true');
    assert(result.findings.length === 0, '无 findings');
    global.JSZip.loadAsync = origLoadAsync;
  });
});

// ── 汇总 ─────────────────────────────────────────────────────────────────────

setTimeout(function () {
  console.log('\n─────────────────────────────');
  console.log('通过：' + passed + '  失败：' + failed);
  if (failed > 0) process.exit(1);
}, 500);
