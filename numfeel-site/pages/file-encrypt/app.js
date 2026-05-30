/**
 * app.js — 浏览器端文件加密 UI 层
 */
(function () {
  'use strict';

  var engine;
  var encryptFile = null;
  var decryptFile = null;

  function $(id) { return document.getElementById(id); }

  document.addEventListener('DOMContentLoaded', function () {
    engine = window.CryptoEngine;
    if (!engine) { console.error('CryptoEngine not loaded'); return; }
    init();
  });

  function init() {

    // ── Tab 切换 ──
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById('tab-' + tab);
        if (panel) panel.classList.add('active');
      });
    });

    // ══════════════════════════════════════════════════════════════
    // 加密面板
    // ══════════════════════════════════════════════════════════════

    var encUploadZone = $('encryptUploadZone');
    var encFileInput = $('encryptFileInput');
    var encPassword = $('encryptPassword');
    var encPasswordConfirm = $('encryptPasswordConfirm');
    var encBtn = $('encryptBtn');

    // 文件选择
    encUploadZone.addEventListener('click', function () { encFileInput.click(); });
    encUploadZone.addEventListener('dragover', function (e) {
      e.preventDefault(); encUploadZone.classList.add('drag-over');
    });
    encUploadZone.addEventListener('dragleave', function () {
      encUploadZone.classList.remove('drag-over');
    });
    encUploadZone.addEventListener('drop', function (e) {
      e.preventDefault(); encUploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) setEncryptFile(e.dataTransfer.files[0]);
    });
    encFileInput.addEventListener('change', function () {
      if (encFileInput.files[0]) setEncryptFile(encFileInput.files[0]);
    });

    function setEncryptFile(file) {
      encryptFile = file;
      var info = $('encryptFileInfo');
      info.style.display = 'flex';
      info.innerHTML =
        '<i class="ti ti-file"></i>' +
        '<div class="file-detail">' +
          '<span class="file-name">' + escHtml(file.name) + '</span>' +
          '<span class="file-size">' + engine.formatSize(file.size) + '</span>' +
        '</div>' +
        '<button class="btn-icon btn-danger" id="clearEncFile" title="移除"><i class="ti ti-x"></i></button>';
      $('clearEncFile').addEventListener('click', function () {
        encryptFile = null;
        info.style.display = 'none';
        encFileInput.value = '';
        updateEncryptBtn();
      });
      encUploadZone.querySelector('.upload-text').textContent = '已选择文件（点击更换）';
      updateEncryptBtn();
    }

    // 密码强度
    encPassword.addEventListener('input', function () {
      var result = engine.evaluatePassword(encPassword.value);
      var bar = $('strengthBar');
      var fill = $('strengthFill');
      var text = $('strengthText');
      if (!encPassword.value) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'flex';
      fill.style.width = result.score + '%';
      fill.className = 'strength-fill strength-' + result.level;
      text.textContent = result.text + '（暴力破解约 ' + result.crackTime + '）';
      updateEncryptBtn();
    });

    encPasswordConfirm.addEventListener('input', updateEncryptBtn);

    function updateEncryptBtn() {
      var hasFile = !!encryptFile;
      var hasPassword = encPassword.value.length > 0;
      var passwordMatch = encPassword.value === encPasswordConfirm.value;
      encBtn.disabled = !(hasFile && hasPassword && passwordMatch);
    }

    // 显示/隐藏密码
    $('toggleEncPwd').addEventListener('click', function () {
      var input = encPassword;
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      this.querySelector('i').className = isPassword ? 'ti ti-eye-off' : 'ti ti-eye';
    });

    // 加密
    encBtn.addEventListener('click', async function () {
      if (!encryptFile || !encPassword.value) return;
      if (encPassword.value !== encPasswordConfirm.value) {
        alert('两次密码不一致');
        return;
      }

      encBtn.disabled = true;
      var progress = $('encryptProgress');
      progress.style.display = 'block';
      $('encryptProgressFill').classList.remove('error');

      try {
        // encryptFile 现在接受 File 对象，返回 Blob（流式分块加密）
        var originalSize = encryptFile.size;
        var encBlob = await engine.encryptFile(encryptFile, encPassword.value, function (pct, msg, speed) {
          $('encryptProgressPct').textContent = Math.round(pct * 100) + '%';
          $('encryptProgressFill').style.width = (pct * 100) + '%';
          $('encryptProgressLabel').textContent = msg;
          $('encryptProgressDetail').textContent = speed || '';
        });

        $('encryptProgressLabel').textContent = '加密完成';

        // 下载
        var url = URL.createObjectURL(encBlob);
        var a = document.createElement('a');
        a.href = url;
        a.download = encryptFile.name + '.enc';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);

        $('encryptProgressDetail').textContent =
          '原始大小：' + engine.formatSize(originalSize) +
          ' → 加密后：' + engine.formatSize(encBlob.size);

      } catch (e) {
        $('encryptProgressLabel').textContent = '加密失败';
        $('encryptProgressFill').style.width = '100%';
        $('encryptProgressFill').classList.add('error');
        $('encryptProgressDetail').textContent = e.message;
      }

      encBtn.disabled = false;
    });

    // ══════════════════════════════════════════════════════════════
    // 解密面板
    // ══════════════════════════════════════════════════════════════

    var decUploadZone = $('decryptUploadZone');
    var decFileInput = $('decryptFileInput');
    var decPassword = $('decryptPassword');
    var decBtn = $('decryptBtn');

    decUploadZone.addEventListener('click', function () { decFileInput.click(); });
    decUploadZone.addEventListener('dragover', function (e) {
      e.preventDefault(); decUploadZone.classList.add('drag-over');
    });
    decUploadZone.addEventListener('dragleave', function () {
      decUploadZone.classList.remove('drag-over');
    });
    decUploadZone.addEventListener('drop', function (e) {
      e.preventDefault(); decUploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) setDecryptFile(e.dataTransfer.files[0]);
    });
    decFileInput.addEventListener('change', function () {
      if (decFileInput.files[0]) setDecryptFile(decFileInput.files[0]);
    });

    function setDecryptFile(file) {
      decryptFile = file;
      var info = $('decryptFileInfo');
      info.style.display = 'flex';
      info.innerHTML =
        '<i class="ti ti-file-lock"></i>' +
        '<div class="file-detail">' +
          '<span class="file-name">' + escHtml(file.name) + '</span>' +
          '<span class="file-size">' + engine.formatSize(file.size) + '</span>' +
        '</div>' +
        '<button class="btn-icon btn-danger" id="clearDecFile" title="移除"><i class="ti ti-x"></i></button>';
      $('clearDecFile').addEventListener('click', function () {
        decryptFile = null;
        info.style.display = 'none';
        decFileInput.value = '';
        updateDecryptBtn();
      });
      decUploadZone.querySelector('.upload-text').textContent = '已选择文件（点击更换）';
      updateDecryptBtn();
    }

    decPassword.addEventListener('input', updateDecryptBtn);

    function updateDecryptBtn() {
      decBtn.disabled = !(decryptFile && decPassword.value.length > 0);
    }

    $('toggleDecPwd').addEventListener('click', function () {
      var input = decPassword;
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      this.querySelector('i').className = isPassword ? 'ti ti-eye-off' : 'ti ti-eye';
    });

    // 解密
    decBtn.addEventListener('click', async function () {
      if (!decryptFile || !decPassword.value) return;

      decBtn.disabled = true;
      var progress = $('decryptProgress');
      progress.style.display = 'block';
      $('decryptProgressFill').classList.remove('error');

      try {
        // decryptFile 现在接受 File 对象，返回 Blob（流式分块解密）
        var encSize = decryptFile.size;
        var decBlob = await engine.decryptFile(decryptFile, decPassword.value, function (pct, msg, speed) {
          $('decryptProgressPct').textContent = Math.round(pct * 100) + '%';
          $('decryptProgressFill').style.width = (pct * 100) + '%';
          $('decryptProgressLabel').textContent = msg;
          $('decryptProgressDetail').textContent = speed || '';
        });

        $('decryptProgressLabel').textContent = '解密完成';

        // 还原文件名（去掉 .enc 后缀）
        var originalName = decryptFile.name.replace(/\.enc$/, '');
        if (originalName === decryptFile.name) {
          originalName = 'decrypted-' + originalName;
        }

        var url = URL.createObjectURL(decBlob);
        var a = document.createElement('a');
        a.href = url;
        a.download = originalName;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);

        $('decryptProgressDetail').textContent =
          '加密文件：' + engine.formatSize(encSize) +
          ' → 解密后：' + engine.formatSize(decBlob.size);

      } catch (e) {
        $('decryptProgressLabel').textContent = '解密失败';
        $('decryptProgressFill').style.width = '100%';
        $('decryptProgressFill').classList.add('error');
        $('decryptProgressDetail').textContent = e.message;
      }

      decBtn.disabled = false;
    });

  } // end init

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
