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

  // ══════════════════════════════════════════
  // 真·协作模式：URL 分享
  // ══════════════════════════════════════════
  var COOP_STORAGE_KEY = 'millionaire_coop_sessions_v1';

  function coopLoadStore() {
    try {
      var raw = localStorage.getItem(COOP_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function coopSaveStore(store) {
    try {
      localStorage.setItem(COOP_STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // localStorage 满或被禁用，忽略
    }
  }

  function coopSaveSession(sid, entry) {
    var store = coopLoadStore();
    store[sid] = entry;
    coopSaveStore(store);
  }

  function coopGetSession(sid) {
    var store = coopLoadStore();
    return store[sid] || null;
  }

  function coopBuildUrl(paramsStr) {
    var base = location.origin + location.pathname;
    return base + '?' + paramsStr;
  }

  function coopShowMode(id) {
    var modes = ['coopAliceStart', 'coopBob', 'coopAliceFinish', 'coopError'];
    modes.forEach(function(m) {
      var el = document.getElementById(m);
      if (el) el.style.display = (m === id) ? '' : 'none';
    });
  }

  function coopSetupCopy() {
    var btns = document.querySelectorAll('.coop-copy-btn');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(btn.dataset.target);
        if (!target) return;
        target.select();
        try {
          document.execCommand('copy');
        } catch (e) {}
        if (navigator.clipboard) {
          navigator.clipboard.writeText(target.value).catch(function() {});
        }
        var orig = btn.innerHTML;
        btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
        btn.classList.add('copied');
        setTimeout(function() {
          btn.innerHTML = orig;
          btn.classList.remove('copied');
        }, 1600);
      });
    });
  }

  // ── Alice 发起 ──
  function coopStartAsAlice() {
    var raw = document.getElementById('coopSalaryA').value.trim();
    if (!/^\d+$/.test(raw)) {
      alert('工资要填非负整数');
      return;
    }
    var salaryA = BigInt(raw);
    var btn = document.getElementById('coopStartBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 生成密钥中...';

    setTimeout(function() {
      try {
        var keys = mpGenerateKeys(128);
        var cA = mpEncrypt(salaryA, keys.publicKey);
        var sid = mpGenerateSessionId();

        // 私钥 + 我的工资 存 localStorage
        coopSaveSession(sid, {
          role: 'alice',
          salaryA: salaryA.toString(),
          privateKey: {
            lambda: keys.privateKey.lambda.toString(16),
            mu: keys.privateKey.mu.toString(16),
            n: keys.privateKey.n.toString(16),
            nSquared: keys.privateKey.nSquared.toString(16)
          },
          createdAt: Date.now()
        });

        var qs = mpEncodeAliceInvite({
          sid: sid,
          n: keys.publicKey.n,
          cA: cA
        });
        var url = coopBuildUrl(qs);

        document.getElementById('coopInviteLink').value = url;
        document.getElementById('coopInviteOutput').style.display = '';
      } catch (e) {
        alert('生成失败：' + e.message);
      } finally {
        btn.innerHTML = '<i class="ti ti-refresh"></i> 换一把密钥重新生成';
        btn.disabled = false;
      }
    }, 60);
  }

  // ── Bob 回应邀请 ──
  function coopReplyAsBob(inviteParams) {
    var btn = document.getElementById('coopBobBtn');
    var raw = document.getElementById('coopSalaryB').value.trim();
    if (!/^\d+$/.test(raw)) {
      alert('工资要填非负整数');
      return;
    }
    var salaryB = BigInt(raw);

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 本地加密并盲化中...';

    setTimeout(function() {
      try {
        var invite = mpDecodeAliceInvite(inviteParams);
        var bobResult = mpBobCompute(salaryB, invite.publicKey, invite.cA);

        var qs = mpEncodeBobReply({
          sid: invite.sid,
          cBlinded: bobResult.cipherBlinded
        });
        var url = coopBuildUrl(qs);

        document.getElementById('coopReplyLink').value = url;
        document.getElementById('coopSalaryBRecap').textContent = salaryB.toString();
        document.getElementById('coopBlindRRecap').textContent = bobResult.blindR.toString();
        document.getElementById('coopReplyOutput').style.display = '';
      } catch (e) {
        alert('生成回执失败：' + e.message);
      } finally {
        btn.innerHTML = '<i class="ti ti-refresh"></i> 换个 r 重新生成';
        btn.disabled = false;
      }
    }, 60);
  }

  // ── Alice 收到回执，解密 ──
  function coopFinalizeAsAlice(replyParams) {
    var reply = mpDecodeBobReply(replyParams);
    var session = coopGetSession(reply.sid);
    if (!session || !session.privateKey) {
      showCoopError('这条会话不在你的浏览器里——很可能你不是发起人，或者清过浏览器缓存。私钥只留在发起人自己的浏览器里，别处解不了。');
      return;
    }
    try {
      var sk = {
        lambda: mpHexToBigInt(session.privateKey.lambda),
        mu: mpHexToBigInt(session.privateKey.mu),
        n: mpHexToBigInt(session.privateKey.n),
        nSquared: mpHexToBigInt(session.privateKey.nSquared)
      };
      var finalized = mpAliceFinalize(reply.cBlinded, sk, sk.n);
      var salaryA = BigInt(session.salaryA);

      document.getElementById('coopSalaryARecap').textContent = salaryA.toString();
      document.getElementById('coopDecryptedRecap').textContent = truncate(finalized.decryptedBlinded.toString(), 20);

      var glyph = document.getElementById('coopResultGlyph');
      var text = document.getElementById('coopResultText');
      var flavor = document.getElementById('coopResultFlavor');
      if (finalized.sign > 0) {
        glyph.textContent = 'A > B';
        text.innerHTML = '<b style="color:#90caf9">你（Alice）的工资更高</b>';
      } else if (finalized.sign < 0) {
        glyph.textContent = 'A < B';
        text.innerHTML = '<b style="color:#ce93d8">对方（Bob）的工资更高</b>';
      } else {
        glyph.textContent = 'A = B';
        text.innerHTML = '<b style="color:#ffd700">两人工资一样</b>（这种情形协议会顺带泄露"相等"）';
      }
      flavor.textContent = mpFlavorText(finalized.result);
      coopShowMode('coopAliceFinish');
    } catch (e) {
      showCoopError('解密失败：' + e.message);
    }
  }

  function showCoopError(msg) {
    document.getElementById('coopErrorMsg').textContent = msg;
    coopShowMode('coopError');
  }

  function clearCoopUrlAndReload() {
    // 回到干净页面
    location.href = location.origin + location.pathname;
  }

  // ── 路由：读 URL 参数决定进入哪种模式 ──
  function coopRoute() {
    var params = new URLSearchParams(location.search);
    var stage = params.get('stage');

    if (stage === 'await-bob') {
      // Bob 打开了 Alice 的邀请链接
      coopShowMode('coopBob');
      var bobBtn = document.getElementById('coopBobBtn');
      bobBtn.addEventListener('click', function() {
        coopReplyAsBob(params);
      });
    } else if (stage === 'await-alice') {
      // Alice 打开了 Bob 的回执链接
      coopFinalizeAsAlice(params);
    } else {
      // 默认：Alice 发起
      coopShowMode('coopAliceStart');
    }
  }

  // 事件绑定
  document.getElementById('coopStartBtn').addEventListener('click', coopStartAsAlice);
  document.getElementById('coopRestartBtn').addEventListener('click', clearCoopUrlAndReload);
  document.getElementById('coopErrorRestartBtn').addEventListener('click', clearCoopUrlAndReload);
  coopSetupCopy();
  coopRoute();

})();
