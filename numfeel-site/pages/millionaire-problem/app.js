/**
 * 百万富翁问题实验室 - 交互脚本
 * DOM 绑定 + 状态管理，纯逻辑委托给 engine.js
 */
(function() {
  'use strict';

  // ── 状态 ──
  var state = {
    lastResult: null,
    skipBlinding: false
  };

  // ── DOM ──
  var salaryAInput = document.getElementById('salaryA');
  var salaryBInput = document.getElementById('salaryB');
  var runBtn = document.getElementById('runBtn');
  var actionHint = document.getElementById('actionHint');
  var stepsArea = document.getElementById('stepsArea');
  var stepCards = document.querySelectorAll('.step-card');
  var resultCard = document.getElementById('resultCard');
  var resultGlyph = document.getElementById('resultGlyph');
  var resultText = document.getElementById('resultText');
  var resultFlavor = document.getElementById('resultFlavor');

  var valPubKey = document.getElementById('valPubKey');
  var valCipherA = document.getElementById('valCipherA');
  var valCipherDiff = document.getElementById('valCipherDiff');
  var valBlindR = document.getElementById('valBlindR');
  var valCipherBlinded = document.getElementById('valCipherBlinded');
  var valDecrypted = document.getElementById('valDecrypted');
  var decryptedHint = document.getElementById('decryptedHint');

  var skipBlindingToggle = document.getElementById('skipBlindingToggle');
  var compareWith = document.getElementById('compareWith');
  var compareWithout = document.getElementById('compareWithout');

  // ── 工具 ──

  function pulseBtn(btn) {
    btn.classList.add('pulse');
    setTimeout(function() { btn.classList.remove('pulse'); }, 600);
  }

  /**
   * 截断长密文用于显示
   */
  function truncate(bigStr, keep) {
    if (!keep) keep = 24;
    var s = String(bigStr);
    if (s.length <= keep * 2 + 3) return s;
    return s.substring(0, keep) + '\u2026' + s.substring(s.length - keep);
  }

  function parseSalary(inputEl) {
    var raw = inputEl.value.trim();
    if (!/^\d+$/.test(raw)) return null;
    return BigInt(raw);
  }

  /**
   * 逐步渲染每一步（依次淡入），营造节奏感
   */
  function revealStepsSequentially() {
    stepCards.forEach(function(card, idx) {
      card.classList.remove('reveal', 'active');
      setTimeout(function() {
        card.classList.add('reveal', 'active');
        // 上一步失活
        if (idx > 0) {
          stepCards[idx - 1].classList.remove('active');
        }
      }, 220 * (idx + 1));
    });
    // 最后一步之后显示结果卡片
    setTimeout(function() {
      resultCard.classList.add('reveal');
      // 也把最后一步的高亮清掉
      if (stepCards.length > 0) {
        stepCards[stepCards.length - 1].classList.remove('active');
      }
    }, 220 * (stepCards.length + 1));
  }

  // ── 运行协议 ──

  function runProtocol() {
    var a = parseSalary(salaryAInput);
    var b = parseSalary(salaryBInput);
    if (a === null || b === null) {
      actionHint.textContent = '两位的工资都要填非负整数哦';
      actionHint.style.color = '#ff6b6b';
      return;
    }
    actionHint.style.color = '';

    pulseBtn(runBtn);
    runBtn.classList.remove('breathing');
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> 正在生成密钥并交换密文...';

    // setTimeout 让浏览器先渲染 loading
    setTimeout(function() {
      try {
        var res = mpRunProtocol(a, b);
        state.lastResult = res;
        renderResult(res);

        // 同时更新对比区（如果处于展开状态）
        updateCompare();
      } catch (e) {
        actionHint.textContent = '协议运行出错：' + e.message;
        actionHint.style.color = '#ff6b6b';
      } finally {
        runBtn.innerHTML = '<i class="ti ti-refresh"></i> 再跑一遍';
        runBtn.disabled = false;
      }
    }, 60);
  }

  /**
   * 把协议结果填到各步骤的通道格子里
   */
  function renderResult(res) {
    stepsArea.style.display = 'block';

    valPubKey.textContent = truncate(res.keys.publicKey.n.toString(), 22);
    valCipherA.textContent = truncate(res.cipherA.toString(), 24);
    valCipherDiff.textContent = truncate(res.cipherDiff.toString(), 24);
    valBlindR.textContent = res.blindR.toString();
    valCipherBlinded.textContent = truncate(res.cipherBlinded.toString(), 24);
    valDecrypted.textContent = res.decryptedBlinded.toString();

    // Alice 视角的说明：告知她实际看到什么
    var decInfo = '';
    if (res.sign === 0) {
      decInfo = 'Alice 看到 0，同时也知道 a = b（这是唯一泄露原值的情形）';
    } else {
      var absDec = res.decryptedBlinded > 0n ? res.decryptedBlinded : -res.decryptedBlinded;
      decInfo = 'Alice 只看到符号 = ' + (res.sign > 0 ? '正' : '负') +
                '。数字绝对值 ≈ ' + absDec.toString().length + ' 位，因为 r × (a-b) 已被放大';
    }
    decryptedHint.textContent = decInfo;

    // 结果卡
    resultCard.classList.remove('reveal');
    if (res.sign > 0) {
      resultGlyph.textContent = 'A > B';
      resultText.innerHTML = 'Alice 的工资 <b style="color:#90caf9">更高</b>。协议只输出这一句话。';
    } else if (res.sign < 0) {
      resultGlyph.textContent = 'A < B';
      resultText.innerHTML = 'Bob 的工资 <b style="color:#ce93d8">更高</b>。协议只输出这一句话。';
    } else {
      resultGlyph.textContent = 'A = B';
      resultText.innerHTML = '两个人工资 <b style="color:#ffd700">正好一样</b>。协议在这种情况下会顺带泄露这个事实。';
    }
    resultFlavor.textContent = mpFlavorText(res.result);

    revealStepsSequentially();
  }

  // ── 复盘：有/无盲化对比 ──

  function updateCompare() {
    var res = state.lastResult;
    if (!res) {
      compareWith.textContent = '先跑一遍协议';
      compareWithout.textContent = '先跑一遍协议';
      return;
    }
    // 有盲化：Alice 看到的（当前解密结果）
    compareWith.textContent = res.decryptedBlinded.toString();

    // 无盲化：直接解密 cDiff = Enc(a-b)
    var plainDiff = mpDecrypt(res.cipherDiff, res.keys.privateKey);
    var signedDiff = mpToSigned(plainDiff, res.keys.publicKey.n);
    var trueDiff = res.salaryA - res.salaryB;
    compareWithout.textContent = signedDiff.toString() +
      '（= ' + res.salaryA.toString() + ' - ' + res.salaryB.toString() + '）';
    // 一致性 sanity check
    if (signedDiff !== trueDiff) {
      compareWithout.textContent += ' [!]';
    }
  }

  // ── 折叠面板 ──
  function setupCollapse(toggleId, bodyId, onOpen) {
    var toggle = document.getElementById(toggleId);
    var body = document.getElementById(bodyId);
    if (!toggle || !body) return;
    toggle.addEventListener('click', function() {
      var isOpen = body.style.display !== 'none';
      if (isOpen) {
        body.style.maxHeight = body.scrollHeight + 'px';
        requestAnimationFrame(function() {
          body.style.maxHeight = '0';
          body.style.opacity = '0';
        });
        setTimeout(function() {
          body.style.display = 'none';
          toggle.querySelector('.toggle-icon').textContent = '\u25be';
        }, 300);
      } else {
        body.style.display = 'block';
        body.style.maxHeight = '0';
        body.style.opacity = '0';
        requestAnimationFrame(function() {
          body.style.maxHeight = body.scrollHeight + 'px';
          body.style.opacity = '1';
        });
        toggle.querySelector('.toggle-icon').textContent = '\u25b4';
        setTimeout(function() {
          body.style.maxHeight = 'none';
        }, 300);
        if (typeof onOpen === 'function') onOpen();
      }
    });
  }

  setupCollapse('moreToggle', 'moreBody');
  setupCollapse('whyRToggle', 'whyRBody', updateCompare);

  // ── 事件绑定 ──

  runBtn.addEventListener('click', runProtocol);

  // 预设
  var presets = document.querySelectorAll('.preset-btn');
  presets.forEach(function(btn) {
    btn.addEventListener('click', function() {
      pulseBtn(btn);
      salaryAInput.value = btn.dataset.a;
      salaryBInput.value = btn.dataset.b;
    });
  });

  // 输入 Enter 直接跑
  [salaryAInput, salaryBInput].forEach(function(el) {
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runBtn.click();
      }
    });
  });

  // 复盘开关
  skipBlindingToggle.addEventListener('change', function() {
    state.skipBlinding = skipBlindingToggle.checked;
    // 开关只影响解释视图，不影响主协议
    updateCompare();
    if (state.skipBlinding) {
      compareWithout.parentElement.style.transform = 'scale(1.03)';
      setTimeout(function() {
        compareWithout.parentElement.style.transform = '';
      }, 400);
    }
  });

})();
