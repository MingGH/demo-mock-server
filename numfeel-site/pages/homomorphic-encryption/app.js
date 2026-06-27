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
    plainB: null,
    currentMode: 'basic',
    // 多人投票状态
    mvKeys: null,
    mvRole: 'creator',
    mvVoterPubN: null,
    mvVoterChoice: 1
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

  // 多人投票 DOM
  var stageMode = document.getElementById('stageMode');
  var modeTabs = document.getElementById('modeTabs');
  var stageVote = document.getElementById('stageVote');

  // 发起人 DOM
  var roleTabs = document.getElementById('roleTabs');
  var creatorView = document.getElementById('creatorView');
  var voterView = document.getElementById('voterView');
  var mvGenKeyBtn = document.getElementById('mvGenKeyBtn');
  var mvStep2 = document.getElementById('mvStep2');
  var mvStep3 = document.getElementById('mvStep3');
  var mvPublicKeyN = document.getElementById('mvPublicKeyN');
  var mvCopyPubBtn = document.getElementById('mvCopyPubBtn');
  var mvPubCopyFeedback = document.getElementById('mvPubCopyFeedback');
  var mvCipherInput = document.getElementById('mvCipherInput');
  var mvDecryptBtn = document.getElementById('mvDecryptBtn');
  var mvCreatorResult = document.getElementById('mvCreatorResult');
  var mvCreatorResultVal = document.getElementById('mvCreatorResultVal');
  var mvCreatorResultInfo = document.getElementById('mvCreatorResultInfo');
  var mvCreatorResetBtn = document.getElementById('mvCreatorResetBtn');

  // 投票人 DOM
  var mvVoterPastePub = document.getElementById('mvVoterPastePub');
  var mvVoterPubError = document.getElementById('mvVoterPubError');
  var mvVoterStep2 = document.getElementById('mvVoterStep2');
  var mvVoterStep3 = document.getElementById('mvVoterStep3');
  var mvVoterToggle = document.getElementById('mvVoterToggle');
  var mvVoterEncryptBtn = document.getElementById('mvVoterEncryptBtn');
  var mvVoterCipher = document.getElementById('mvVoterCipher');
  var mvCopyCipherBtn = document.getElementById('mvCopyCipherBtn');
  var mvVoterCopyFeedback = document.getElementById('mvVoterCopyFeedback');
  var mvVoterResetBtn = document.getElementById('mvVoterResetBtn');

  // ── 工具函数 ──

  function showStage(stage) {
    var allStages = [stageInit, stageMode, stageReady, stageResult, stageVote];
    allStages.forEach(function(s) {
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

      // 默认进入基础模式
      switchMode('basic');
      showStage(stageMode);
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
    showStage(stageMode);
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

  // ══════════════════════════════════════════
  // 模式切换
  // ══════════════════════════════════════════

  function switchMode(mode) {
    state.currentMode = mode;
    var tabs = modeTabs.querySelectorAll('.mode-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].dataset.mode === mode) {
        tabs[i].classList.add('active');
      } else {
        tabs[i].classList.remove('active');
      }
    }
    if (mode === 'basic') {
      showStage(stageReady);
      inputA.focus();
    } else if (mode === 'vote') {
      resetMultiVoteUI();
      showStage(stageVote);
    }
  }

  modeTabs.addEventListener('click', function(e) {
    var tab = e.target.closest('.mode-tab');
    if (!tab) return;
    switchMode(tab.dataset.mode);
  });

  // ══════════════════════════════════════════
  // 多人投票（复制粘贴流）
  // ══════════════════════════════════════════

  function showStep(step, show) {
    step.style.display = show ? '' : 'none';
    if (show) {
      step.style.opacity = '0';
      step.style.transform = 'translateY(8px)';
      requestAnimationFrame(function() {
        step.style.opacity = '1';
        step.style.transform = 'translateY(0)';
      });
    }
  }

  function resetMultiVoteUI() {
    state.mvKeys = null;
    state.mvVoterPubN = null;
    state.mvVoterChoice = 1;
    state.mvRole = 'creator';

    // 重置发起人
    mvGenKeyBtn.style.display = '';
    showStep(mvStep2, false);
    showStep(mvStep3, false);
    mvCreatorResult.style.display = 'none';
    mvCipherInput.value = '';
    mvPubCopyFeedback.textContent = '';

    // 重置投票人
    mvVoterPastePub.value = '';
    mvVoterPubError.textContent = '';
    showStep(mvVoterStep2, false);
    showStep(mvVoterStep3, false);
    mvVoterCopyFeedback.textContent = '';

    // 默认发起人角色
    switchRole('creator');
  }

  // ── 角色切换 ──
  function switchRole(role) {
    state.mvRole = role;
    var tabs = roleTabs.querySelectorAll('.role-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].dataset.role === role) {
        tabs[i].classList.add('active');
      } else {
        tabs[i].classList.remove('active');
      }
    }
    creatorView.style.display = role === 'creator' ? '' : 'none';
    voterView.style.display = role === 'voter' ? '' : 'none';
  }

  roleTabs.addEventListener('click', function(e) {
    var tab = e.target.closest('.role-tab');
    if (!tab) return;
    switchRole(tab.dataset.role);
  });

  // ── 发起人：生成投票密钥 ──
  mvGenKeyBtn.addEventListener('click', function() {
    pulseBtn(mvGenKeyBtn);
    state.mvKeys = generatePaillierKeys(128);
    mvPublicKeyN.textContent = state.mvKeys.publicKey.n.toString();
    mvGenKeyBtn.style.display = 'none';
    showStep(mvStep2, true);
    showStep(mvStep3, true);
  });

  // ── 发起人：复制公钥 ──
  mvCopyPubBtn.addEventListener('click', function() {
    var text = state.mvKeys.publicKey.n.toString();
    copyToClipboard(text, mvPubCopyFeedback);
  });

  // ── 发起人：计票并解密 ──
  mvDecryptBtn.addEventListener('click', function() {
    pulseBtn(mvDecryptBtn);
    var raw = mvCipherInput.value.trim();
    if (!raw) {
      mvCreatorResultInfo.textContent = '请先粘贴密文';
      mvCreatorResultInfo.className = 'result-check fail';
      mvCreatorResult.style.display = '';
      return;
    }
    var lines = raw.split(/[\n\r]+/).filter(function(l) { return l.trim() !== ''; });
    if (lines.length === 0) {
      mvCreatorResultInfo.textContent = '未检测到有效密文';
      mvCreatorResultInfo.className = 'result-check fail';
      mvCreatorResult.style.display = '';
      return;
    }

    // 同态加法：所有密文相乘
    var product = 1n;
    var errors = [];
    var nSq = state.mvKeys.publicKey.nSquared;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      try {
        var c = BigInt(line);
        product = paillierAdd(product, c, nSq);
      } catch (e) {
        errors.push('第' + (i + 1) + '行密文格式错误');
      }
    }
    if (errors.length > 0) {
      mvCreatorResultInfo.textContent = errors.join('；');
      mvCreatorResultInfo.className = 'result-check fail';
      mvCreatorResult.style.display = '';
      return;
    }

    var decrypted = paillierDecrypt(product, state.mvKeys.privateKey);
    mvCreatorResultVal.textContent = decrypted.toString();
    mvCreatorResultVal.classList.add('correct');
    mvCreatorResultInfo.textContent = '共收到 ' + lines.length + ' 张加密选票，其中支持 ' + decrypted.toString() + ' 票，反对 ' + (BigInt(lines.length) - decrypted).toString() + ' 票';
    mvCreatorResultInfo.className = 'result-check success';
    mvCreatorResult.style.display = '';
    mvCreatorResult.style.opacity = '0';
    mvCreatorResult.style.transform = 'translateY(10px)';
    requestAnimationFrame(function() {
      mvCreatorResult.style.opacity = '1';
      mvCreatorResult.style.transform = 'translateY(0)';
    });
  });

  mvCreatorResetBtn.addEventListener('click', function() {
    resetMultiVoteUI();
  });

  // ── 投票人：粘贴公钥 ──
  mvVoterPastePub.addEventListener('input', function() {
    var raw = mvVoterPastePub.value.trim();
    mvVoterPubError.textContent = '';
    showStep(mvVoterStep2, false);
    showStep(mvVoterStep3, false);
    if (!raw) return;

    try {
      var n = BigInt(raw);
      if (n <= 0n) throw new Error();
      state.mvVoterPubN = n;
      showStep(mvVoterStep2, true);
    } catch (e) {
      mvVoterPubError.textContent = '公钥格式无效，请输入纯数字';
    }
  });

  // ── 投票人：投票切换 ──
  mvVoterToggle.addEventListener('click', function(e) {
    var btn = e.target.closest('.vote-opt');
    if (!btn) return;
    state.mvVoterChoice = parseInt(btn.dataset.val);
    var opts = mvVoterToggle.querySelectorAll('.vote-opt');
    for (var i = 0; i < opts.length; i++) {
      if (parseInt(opts[i].dataset.val) === state.mvVoterChoice) {
        opts[i].classList.add('active');
      } else {
        opts[i].classList.remove('active');
      }
    }
  });

  // ── 投票人：加密投票 ──
  mvVoterEncryptBtn.addEventListener('click', function() {
    if (!state.mvVoterPubN) return;
    pulseBtn(mvVoterEncryptBtn);

    var pk = {
      n: state.mvVoterPubN,
      g: state.mvVoterPubN + 1n,
      nSquared: state.mvVoterPubN * state.mvVoterPubN
    };
    var cipher = paillierEncrypt(BigInt(state.mvVoterChoice), pk);
    mvVoterCipher.textContent = cipher.toString();
    showStep(mvVoterStep3, true);
  });

  // ── 投票人：复制密文 ──
  mvCopyCipherBtn.addEventListener('click', function() {
    var text = mvVoterCipher.textContent;
    copyToClipboard(text, mvVoterCopyFeedback);
  });

  mvVoterResetBtn.addEventListener('click', function() {
    state.mvVoterPubN = null;
    state.mvVoterChoice = 1;
    mvVoterPastePub.value = '';
    mvVoterPubError.textContent = '';
    showStep(mvVoterStep2, false);
    showStep(mvVoterStep3, false);
    mvVoterCopyFeedback.textContent = '';
    // 重置投票切换为支持
    var opts = mvVoterToggle.querySelectorAll('.vote-opt');
    for (var i = 0; i < opts.length; i++) {
      var val = parseInt(opts[i].dataset.val);
      opts[i].classList.toggle('active', val === 1);
    }
  });

  // ── 通用复制函数 ──
  function copyToClipboard(text, feedbackEl) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        feedbackEl.textContent = '已复制到剪贴板';
        feedbackEl.style.color = '#81c784';
        setTimeout(function() { feedbackEl.textContent = ''; }, 2000);
      }).catch(function() {
        fallbackCopy(text, feedbackEl);
      });
    } else {
      fallbackCopy(text, feedbackEl);
    }
  }

  function fallbackCopy(text, feedbackEl) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      feedbackEl.textContent = '已复制到剪贴板';
      feedbackEl.style.color = '#81c784';
    } catch (e) {
      feedbackEl.textContent = '复制失败，请手动选中复制';
      feedbackEl.style.color = '#ff6b6b';
    }
    document.body.removeChild(ta);
    setTimeout(function() { feedbackEl.textContent = ''; }, 2000);
  }

})();
