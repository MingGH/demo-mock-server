/**
 * 同态加密 Demo - 交互逻辑
 * Paillier 加法同态：加密两个数字，在密文上做乘法，解密后验证结果
 */
(function() {
  'use strict';

  // ── 状态 ──
  var state = {
    keys: null,
    cipherA: null,
    cipherB: null,
    cipherSum: null,
    plainA: null,
    plainB: null
  };

  // ── DOM 引用 ──
  var stageInit = document.getElementById('stageInit');
  var stageReady = document.getElementById('stageReady');
  var stageResult = document.getElementById('stageResult');

  var genKeyBtn = document.getElementById('genKeyBtn');
  var inputA = document.getElementById('inputA');
  var inputB = document.getElementById('inputB');
  var encryptBtn = document.getElementById('encryptBtn');
  var decryptBtn = document.getElementById('decryptBtn');
  var resetBtn = document.getElementById('resetBtn');

  var plainAEl = document.getElementById('plainA');
  var plainBEl = document.getElementById('plainB');
  var cipherAEl = document.getElementById('cipherA');
  var cipherBEl = document.getElementById('cipherB');
  var cipherSumEl = document.getElementById('cipherSum');
  var cipherASize = document.getElementById('cipherASize');
  var cipherBSize = document.getElementById('cipherBSize');
  var cipherSumSize = document.getElementById('cipherSumSize');

  var resultReveal = document.getElementById('resultReveal');
  var decryptedResult = document.getElementById('decryptedResult');
  var resultCheck = document.getElementById('resultCheck');
  var resultTip = document.getElementById('resultTip');
  var arrowDown = document.getElementById('arrowDown');

  // ── 工具函数 ──

  function showStage(stage) {
    [stageInit, stageReady, stageResult].forEach(function(s) {
      s.style.display = 'none';
      s.style.opacity = '0';
      s.style.transform = 'translateY(10px)';
    });
    stage.style.display = 'block';
    // 过渡动效
    requestAnimationFrame(function() {
      stage.style.opacity = '1';
      stage.style.transform = 'translateY(0)';
    });
  }

  function formatCiphertext(n) {
    var s = n.toString();
    if (s.length <= 80) return s;
    return s.substring(0, 40) + '\u2026' + s.substring(s.length - 40);
  }

  function formatBitLength(n) {
    var bits = n.toString(2).length;
    var digits = n.toString().length;
    return bits + ' bits / ' + digits + ' 位十进制';
  }

  function validateInputs() {
    var a = inputA.value.trim();
    var b = inputB.value.trim();
    // 正则校验：只接受非负整数字符串（兼容任意大的 BigInt）
    var valid = /^\d+$/.test(a) && /^\d+$/.test(b);
    // 额外校验：明文必须小于 n，否则解密得到 m mod n
    if (valid && state.keys) {
      try {
        valid = BigInt(a) < state.keys.publicKey.n &&
                BigInt(b) < state.keys.publicKey.n;
      } catch (e) { valid = false; }
    }
    encryptBtn.disabled = !valid;
  }

  // ── 按钮反馈 ──
  function pulseBtn(btn) {
    btn.classList.add('pulse');
    setTimeout(function() { btn.classList.remove('pulse'); }, 600);
  }

  // ── 事件绑定 ──

  // 1. 生成密钥
  genKeyBtn.addEventListener('click', function() {
    pulseBtn(genKeyBtn);
    genKeyBtn.disabled = true;
    genKeyBtn.innerHTML = '<span class="spinner"></span> 正在生成...';

    // 用 setTimeout 让 UI 有机会渲染 loading 状态
    setTimeout(function() {
      state.keys = generatePaillierKeys(128);
      document.getElementById('keyBitsDisplay').textContent =
        formatBitLength(state.keys.publicKey.n);

      genKeyBtn.classList.remove('breathing');
      genKeyBtn.innerHTML = '<i class="ti ti-key"></i> 生成密钥';
      genKeyBtn.disabled = false;
      showStage(stageReady);
      inputA.focus();
    }, 100);
  });

  // 2. 验证输入
  inputA.addEventListener('input', validateInputs);
  inputB.addEventListener('input', validateInputs);

  // 预设按钮
  var presets = document.querySelectorAll('.preset-btn');
  presets.forEach(function(btn) {
    btn.addEventListener('click', function() {
      pulseBtn(btn);
      inputA.value = btn.dataset.a;
      inputB.value = btn.dataset.b;
      validateInputs();
      // 自动触发加密
      setTimeout(function() { encryptBtn.click(); }, 300);
    });
  });

  // 3. 加密并相加
  encryptBtn.addEventListener('click', function() {
    if (encryptBtn.disabled) return;
    pulseBtn(encryptBtn);
    var a = BigInt(inputA.value.trim());
    var b = BigInt(inputB.value.trim());

    state.plainA = a;
    state.plainB = b;

    // 加密
    state.cipherA = paillierEncrypt(a, state.keys.publicKey);
    state.cipherB = paillierEncrypt(b, state.keys.publicKey);

    // 同态加法
    state.cipherSum = paillierAdd(state.cipherA, state.cipherB,
      state.keys.publicKey.nSquared);

    // 渲染
    plainAEl.textContent = a.toString();
    plainBEl.textContent = b.toString();
    cipherAEl.textContent = formatCiphertext(state.cipherA);
    cipherBEl.textContent = formatCiphertext(state.cipherB);
    cipherSumEl.textContent = formatCiphertext(state.cipherSum);
    cipherASize.textContent = '共 ' + formatBitLength(state.cipherA);
    cipherBSize.textContent = '共 ' + formatBitLength(state.cipherB);
    cipherSumSize.textContent = '共 ' + formatBitLength(state.cipherSum);
    resultReveal.style.display = 'none';

    showStage(stageResult);

    // 箭头弹跳动画
    arrowDown.classList.add('bounce');
    setTimeout(function() { arrowDown.classList.remove('bounce'); }, 1000);
  });

  // 4. 解密验证
  decryptBtn.addEventListener('click', function() {
    pulseBtn(decryptBtn);
    var decrypted = paillierDecrypt(state.cipherSum, state.keys.privateKey);
    var expected = state.plainA + state.plainB;
    var isCorrect = decrypted === expected;

    decryptedResult.textContent = decrypted.toString();

    if (isCorrect) {
      decryptedResult.classList.add('correct');
      decryptedResult.classList.remove('wrong');
      resultCheck.textContent = '✓ 验证通过：解密结果 = ' +
        state.plainA.toString() + ' + ' + state.plainB.toString() +
        ' = ' + expected.toString();
      resultCheck.className = 'result-check success';
    } else {
      decryptedResult.classList.add('wrong');
      decryptedResult.classList.remove('correct');
      resultCheck.textContent = '✗ 验证失败：期望 ' + expected.toString() +
        '，实际 ' + decrypted.toString();
      resultCheck.className = 'result-check fail';
    }

    resultTip.textContent = randomTip();
    resultReveal.style.display = 'block';
    resultReveal.style.opacity = '0';
    resultReveal.style.transform = 'translateY(10px)';
    requestAnimationFrame(function() {
      resultReveal.style.opacity = '1';
      resultReveal.style.transform = 'translateY(0)';
    });

    decryptBtn.style.display = 'none';
  });

  // 5. 重置
  resetBtn.addEventListener('click', function() {
    state.plainA = null;
    state.plainB = null;
    state.cipherA = null;
    state.cipherB = null;
    state.cipherSum = null;
    inputA.value = '';
    inputB.value = '';
    decryptBtn.style.display = '';
    decryptedResult.classList.remove('correct', 'wrong');
    showStage(stageReady);
    inputA.focus();
  });

  // ── 折叠面板 ──
  function setupCollapse(toggleId, bodyId) {
    var toggle = document.getElementById(toggleId);
    var body = document.getElementById(bodyId);
    if (!toggle || !body) return;
    toggle.addEventListener('click', function() {
      var isOpen = body.style.display !== 'none';
      if (isOpen) {
        // 收缩
        body.style.maxHeight = body.scrollHeight + 'px';
        requestAnimationFrame(function() {
          body.style.maxHeight = '0';
          body.style.opacity = '0';
        });
        setTimeout(function() {
          body.style.display = 'none';
          toggle.querySelector('.toggle-icon').textContent = '▾';
        }, 300);
      } else {
        // 展开
        body.style.display = 'block';
        body.style.maxHeight = '0';
        body.style.opacity = '0';
        requestAnimationFrame(function() {
          body.style.maxHeight = body.scrollHeight + 'px';
          body.style.opacity = '1';
        });
        toggle.querySelector('.toggle-icon').textContent = '▴';
        // 展开后解除高度限制
        setTimeout(function() {
          body.style.maxHeight = 'none';
        }, 300);
      }
    });
  }

  setupCollapse('moreToggle', 'moreBody');
  setupCollapse('compareToggle', 'compareBody');

  // ── 键盘快捷键 ──
  document.addEventListener('keydown', function(e) {
    // Enter 在输入框里触发加密
    if (e.key === 'Enter' && document.activeElement === inputB) {
      encryptBtn.click();
    }
  });

  // ── 初始化 ──
  showStage(stageInit);

})();
