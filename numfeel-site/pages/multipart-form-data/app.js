/**
 * app.js — multipart/form-data 演示 UI 层
 * 依赖：engine.js（纯逻辑）、components/header.js（全局头部/埋点）
 * 职责：选内置示例 → 本地打包预览（裸 body vs multipart）→ 本地解码往返 → 真上传后端看解析。
 * 说明：不再让用户挑本地文件，示例内容固定且很小，彻底避开「读大文件拖垮页面」的问题。
 */
(function () {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';
  var UPLOAD_URL = API_BASE + '/api/multipart/upload';

  var eng = window.MultipartEngine;

  // 内置示例场景：key 对应预设按钮的 data-kind
  var SAMPLES = {
    one: {
      fields: [{ name: 'note', value: '今晚发我' }],
      files: [
        { name: 'file', filename: '报告.pdf', contentType: 'application/pdf', content: '报告正文：这是刚写好的方案，请查收。' }
      ]
    },
    two: {
      fields: [{ name: 'note', value: '两张都给我' }],
      files: [
        { name: 'file', filename: '报告.pdf', contentType: 'application/pdf', content: '报告正文：这是刚写好的方案，请查收。' },
        { name: 'file', filename: '照片.jpg', contentType: 'image/jpeg', content: 'JPG_BINARY_CONTENT' }
      ]
    },
    none: {
      fields: [{ name: 'note', value: '纯字段，没有文件' }],
      files: []
    }
  };

  var currentKind = 'one';

  // ── DOM ──
  var els = {};

  function cacheDom() {
    els.btnUpload = document.getElementById('btn-upload');
    els.presets = document.querySelectorAll('.preset-btn');

    els.rawBody = document.getElementById('raw-body');
    els.rawBytes = document.getElementById('raw-bytes');
    els.rawNote = document.getElementById('raw-note');

    els.mpBody = document.getElementById('mp-body');
    els.mpBytes = document.getElementById('mp-bytes');
    els.mpNote = document.getElementById('mp-note');

    els.decodeResult = document.getElementById('decode-result');
    els.serverResult = document.getElementById('server-result');
    els.insightBar = document.getElementById('insight-bar');
  }

  function init() {
    cacheDom();
    bindEvents();
    // 零门槛：默认跑第一组示例，打开即有结果
    runLocalPreview(currentKind);
  }

  function bindEvents() {
    els.btnUpload.addEventListener('click', realUpload);
    for (var i = 0; i < els.presets.length; i++) {
      els.presets[i].addEventListener('click', function () {
        switchPreset(this.getAttribute('data-kind'));
      });
    }
  }

  /** 切换示例场景：更新按钮高亮 + 立即本地预览。 */
  function switchPreset(kind) {
    currentKind = kind;
    for (var i = 0; i < els.presets.length; i++) {
      var on = els.presets[i].getAttribute('data-kind') === kind;
      els.presets[i].classList.toggle('active', on);
    }
    runLocalPreview(kind);
  }

  /** 本地打包预览。kind = 'one' | 'two' | 'none' */
  function runLocalPreview(kind) {
    var sample = SAMPLES[kind] || SAMPLES.one;
    var fields = sample.fields;
    var fileObjs = sample.files;

    // 编码 multipart：文件负载用示例的 content 字符串
    var files = [];
    for (var i = 0; i < fileObjs.length; i++) {
      files.push({
        name: fileObjs[i].name,
        filename: fileObjs[i].filename,
        contentType: fileObjs[i].contentType,
        value: fileObjs[i].content
      });
    }
    var mp = eng.encodeMultipart(fields, files);

    // 裸 body：同样的文件内容，但没有结构
    var rawText = '';
    if (fileObjs.length) {
      for (var j = 0; j < fileObjs.length; j++) {
        rawText += fileObjs[j].content + '\n';
      }
    } else {
      rawText = fields.length ? fields[0].value : '';
    }
    var raw = eng.encodeRawBody(rawText);

    renderLocalPreview(mp, raw, fileObjs.length);
  }

  /** 把编码好的裸 body 与 multipart 一起渲染到页面。 */
  function renderLocalPreview(mp, raw, fileCount) {
    els.rawBody.textContent = raw.text.length ? raw.text : '（空）';
    els.rawBytes.textContent = eng.formatBytes(raw.bytes);
    els.rawNote.innerHTML = '只有一整坨字节，没有文件名、没有 Content-Type、也没有任何分隔——服务器拿到也分不清哪是哪。';

    renderTokenized(mp);
    els.mpBytes.textContent = eng.formatBytes(mp.bytes) + ' · ' + mp.partCount + ' 个 part';
    els.mpNote.innerHTML =
      '多了一个 boundary，每个 part 都有自己的「头」。服务器按 boundary 切开，就能一个个解。';

    renderDecode(mp);
    updateInsight(mp, raw, fileCount);
  }

  /** 把 multipart body 按 token 高亮渲染进 mp-body。 */
  function renderTokenized(mp) {
    var tokens = eng.tokenize(mp.text, mp.boundary);
    var html = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.kind === 'blank') {
        html += '\n';
      } else if (t.kind === 'boundary') {
        html += '<span class="tok-boundary">' + esc(t.text) + '</span>\n';
      } else if (t.kind === 'header') {
        html += '<span class="tok-header">' + esc(t.text) + '</span>\n';
      } else {
        html += '<span class="tok-payload">' + esc(t.text) + '</span>\n';
      }
    }
    els.mpBody.innerHTML = html;
  }

  /** 用 decodeMultipart 把刚编码的 body 解回，展示无损往返。 */
  function renderDecode(mp) {
    var decoded = eng.decodeMultipart(mp.text, mp.boundary);
    var html = '<div class="decode-title">解回 ' + decoded.fields.length + ' 个字段 + ' + decoded.files.length + ' 个文件</div>';
    for (var i = 0; i < decoded.fields.length; i++) {
      var f = decoded.fields[i];
      html += '<div class="decode-row"><span class="decode-key">' + esc(f.name) + '</span> = <span class="decode-val">' + esc(f.value) + '</span> <span class="decode-ok">✓</span></div>';
    }
    for (var j = 0; j < decoded.files.length; j++) {
      var fl = decoded.files[j];
      html += '<div class="decode-row"><span class="decode-key">' + esc(fl.name) + '</span> · <span class="decode-fname">' + esc(fl.filename) + '</span> (<span class="decode-val">' + esc(fl.contentType || 'octet-stream') + '</span>) ✓ 无损</div>';
    }
    html += '<div class="decode-hint">同一个 body 原样解回——multipart 是个「打包协议」。</div>';
    els.decodeResult.innerHTML = html;
  }

  /** 真上传：把当前示例文件构造成 Blob，用 FormData 发给后端看解析。 */
  var uploading = false;
  function realUpload() {
    if (uploading) return;
    var sample = SAMPLES[currentKind] || SAMPLES.one;

    uploading = true;
    els.btnUpload.disabled = true;
    setServerMessage('info', '上传中…');

    var fd = new FormData();
    var fields = sample.fields;
    for (var k = 0; k < fields.length; k++) {
      fd.append(fields[k].name, fields[k].value);
    }
    var files = sample.files;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var blob = new Blob([f.content], { type: f.contentType || 'application/octet-stream' });
      fd.append(f.name, blob, f.filename);
    }

    fetch(UPLOAD_URL, { method: 'POST', body: fd })
      .then(function (resp) {
        return resp.json().then(function (data) { return { status: resp.status, data: data }; });
      })
      .then(function (res) {
        var body = res.data;
        if (body && body.status === 200 && body.data) {
          renderServerResult(body.data);
        } else {
          var msg = (body && body.message) || ('HTTP ' + res.status);
          setServerMessage('err', (res.status === 429 ? '429 · ' : '') + msg);
        }
      })
      .catch(function () {
        setServerMessage('err', '请求失败，请确认后端服务可访问');
      })
      .then(function () {
        uploading = false;
        els.btnUpload.disabled = false;
      });
  }

  /** 渲染后端返回的解析结果。 */
  function renderServerResult(data) {
    var html = '<div class="decode-title">后端解出：' + data.fileCount + ' 个文件 · 共 ' + eng.formatBytes(data.totalBytes)
      + ' · <span class="decode-key">5 分钟后自动删除</span></div>';

    var fieldNames = Object.keys(data.fields || {});
    for (var i = 0; i < fieldNames.length; i++) {
      var k = fieldNames[i];
      html += '<div class="decode-row"><span class="decode-key">' + esc(k) + '</span> = <span class="decode-val">' + esc(data.fields[k]) + '</span></div>';
    }

    var files = data.files || [];
    for (var j = 0; j < files.length; j++) {
      var f = files[j];
      html += '<div class="decode-row">'
        + '<span class="decode-key">' + esc(f.fieldName) + '</span> · '
        + '<span class="decode-fname">' + esc(f.filename) + '</span> · '
        + '<span class="decode-val">' + eng.formatBytes(f.size) + '</span> · '
        + '<span class="decode-meta">' + esc(f.contentType || '-') + '</span>'
        + '</div>';
    }

    html += '<div class="decode-hint">服务器看到的不是「一坨字节」，而是「1 个备注 + N 个文件」——这就是 boundary 给的</div>';
    html += '<div class="upload-id">uploadId: ' + esc(data.uploadId) + '（临时目录，到期删除）</div>';
    els.serverResult.innerHTML = html;
  }

  function setServerMessage(cls, text) {
    els.serverResult.innerHTML = '<div class="decode-msg ' + cls + '">' + esc(text) + '</div>';
  }

  /** 顶部洞察条。 */
  function updateInsight(mp, raw, fileCount) {
    var html = '同一个请求，「裸 body」是 <strong>' + eng.formatBytes(raw.bytes) + '</strong> 的一坨字节，啥信息都不带；'
      + '「multipart」多花 <strong>' + eng.formatBytes(mp.bytes - raw.bytes) + '</strong> 的「包装纸」（boundary+头），'
      + '却换来了 <strong>' + mp.partCount + ' 个 part</strong> 一起装、每个还带名字和类型。';
    if (fileCount === 0) {
      html += '<br>更妙的是：连字段都不带文件，multipart 也能装——裸 body 只能装一个「东西」。';
    }
    els.insightBar.innerHTML = html;
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();