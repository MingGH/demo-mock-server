// ========== 必胜策略游戏 App 逻辑 ==========
(function() {
  'use strict';

  var currentGame = 'bash';
  var gameActive = false;

  // 巴什博弈状态
  var bash = { total: 21, maxTake: 3, remaining: 21, difficulty: 'normal', selecting: [], history: [], stats: { wins: 0, losses: 0 } };
  // 威佐夫博弈状态
  var wyth = { initA: 5, initB: 8, a: 5, b: 8, difficulty: 'normal', history: [], stats: { wins: 0, losses: 0 } };
  // 硬币翻转状态
  var coin = { count: 12, coins: [], difficulty: 'normal', selectedFlip: -1, history: [], stats: { wins: 0, losses: 0 } };

  window.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initBash();
    initWythoff();
    initCoin();
  });

  // ── Tab 切换 ──
  function initTabs() {
    document.querySelectorAll('.game-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        currentGame = this.dataset.game;
        document.querySelectorAll('.game-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.game === currentGame); });
        document.querySelectorAll('.game-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-' + currentGame); });
      });
    });
  }

  // ═══════════════════════════════════════════════
  //  巴什博弈 — 直接点击石子来取
  // ═══════════════════════════════════════════════

  function initBash() {
    document.getElementById('bashStart').addEventListener('click', startBash);
    document.getElementById('bashDifficulty').addEventListener('change', function() { bash.difficulty = this.value; });
    document.getElementById('bashTotal').addEventListener('change', function() { bash.total = parseInt(this.value) || 21; });
    document.getElementById('bashMaxTake').addEventListener('change', function() {
      bash.maxTake = parseInt(this.value) || 3;
      document.getElementById('bashRuleMax').textContent = bash.maxTake;
    });
    renderBashHint();
  }

  function startBash() {
    bash.total = parseInt(document.getElementById('bashTotal').value) || 21;
    bash.maxTake = parseInt(document.getElementById('bashMaxTake').value) || 3;
    bash.remaining = bash.total;
    bash.selecting = [];
    bash.history = [];
    gameActive = true;
    document.getElementById('bashHistory').innerHTML = '';
    renderBashStones();
    renderBashHint();
    setBashStatus('your-turn', '点击石子来取走（可取 1~' + bash.maxTake + ' 个），点完后按「确认取走」');
    document.getElementById('bashConfirm').style.display = 'inline-flex';
    document.getElementById('bashConfirm').disabled = true;
  }

  function onBashStoneClick(idx) {
    if (!gameActive || currentGame !== 'bash') return;
    // idx 是从右到左的编号（最右边的石子最先被取）
    var stoneIdx = bash.remaining - 1 - idx;
    if (stoneIdx < 0) return;

    var pos = bash.selecting.indexOf(idx);
    if (pos !== -1) {
      // 取消选择
      bash.selecting.splice(pos, 1);
    } else {
      if (bash.selecting.length >= bash.maxTake) {
        setBashStatus('your-turn', '最多只能选 ' + bash.maxTake + ' 个！');
        return;
      }
      bash.selecting.push(idx);
    }
    renderBashStones();
    document.getElementById('bashConfirm').disabled = bash.selecting.length === 0;
    if (bash.selecting.length > 0) {
      setBashStatus('your-turn', '已选 ' + bash.selecting.length + ' 个，点击「确认取走」或继续选');
    }
  }
  window.onBashStoneClick = onBashStoneClick;

  function bashConfirmTake() {
    if (!gameActive || bash.selecting.length === 0) return;
    var take = bash.selecting.length;
    bash.remaining -= take;
    bash.selecting = [];
    bash.history.push({ who: 'player', take: take, remaining: bash.remaining });
    renderBashStones();
    addHistoryItem('bashHistory', '你', '取走 ' + take + ' 个', '剩余 ' + bash.remaining);

    if (bash.remaining <= 0) { endBash(true); return; }

    // AI 回合
    setBashStatus('ai-turn', 'AI 思考中...');
    document.getElementById('bashConfirm').style.display = 'none';
    gameActive = false;

    setTimeout(function() {
      var aiTake = bashAiMove(bash.remaining, bash.maxTake, bash.difficulty);
      bash.remaining -= aiTake;
      bash.history.push({ who: 'ai', take: aiTake, remaining: bash.remaining });
      addHistoryItem('bashHistory', 'AI', '取走 ' + aiTake + ' 个', '剩余 ' + bash.remaining);

      if (bash.remaining <= 0) {
        renderBashStones();
        endBash(false);
        return;
      }

      gameActive = true;
      renderBashStones();
      setBashStatus('your-turn', '你的回合 — 点击石子（可取 1~' + Math.min(bash.maxTake, bash.remaining) + ' 个）');
      document.getElementById('bashConfirm').style.display = 'inline-flex';
      document.getElementById('bashConfirm').disabled = true;
      renderBashHint();
    }, 500 + Math.random() * 400);
  }
  window.bashConfirmTake = bashConfirmTake;

  function endBash(playerWin) {
    gameActive = false;
    document.getElementById('bashConfirm').style.display = 'none';
    if (playerWin) { bash.stats.wins++; setBashStatus('win', '你赢了！'); }
    else { bash.stats.losses++; setBashStatus('lose', 'AI 赢了！'); }
    renderBashStats();
    renderBashHint();
    showGameOverModal(playerWin, '巴什博弈', bash.stats);
  }

  function renderBashStones() {
    var container = document.getElementById('bashStones');
    var html = '';
    for (var i = 0; i < bash.total; i++) {
      var taken = i >= bash.remaining;
      var selected = bash.selecting.indexOf(i) !== -1;
      var cls = 'stone';
      if (taken) cls += ' taken';
      else if (selected) cls += ' selected';
      var clickable = !taken && gameActive ? ' onclick="onBashStoneClick(' + i + ')"' : '';
      html += '<div class="' + cls + '"' + clickable + '></div>';
    }
    container.innerHTML = html;
    document.getElementById('bashRemaining').textContent = bash.remaining;
  }

  function setBashStatus(cls, text) {
    var el = document.getElementById('bashStatus');
    el.className = 'game-status ' + cls;
    el.innerHTML = text;
  }

  function renderBashStats() {
    document.getElementById('bashWins').textContent = bash.stats.wins;
    document.getElementById('bashLosses').textContent = bash.stats.losses;
    var total = bash.stats.wins + bash.stats.losses;
    document.getElementById('bashWinRate').textContent = total > 0 ? Math.round(bash.stats.wins / total * 100) + '%' : '—';
  }

  function renderBashHint() {
    var n = bash.remaining || bash.total;
    var m = bash.maxTake;
    var el = document.getElementById('bashStrategyHint');
    var firstWin = bashIsFirstWin(n, m);
    var remainder = n % (m + 1);
    var html = '<strong>局面：</strong>' + n + ' 个石子，每次取 1~' + m + '，模 ' + (m + 1) + ' = ' + remainder + '<br>';
    if (firstWin) {
      html += '→ <strong style="color:#81c784">先手必胜</strong>：第一步取 ' + remainder + ' 个，之后对手取 k 你取 ' + (m + 1) + '-k';
    } else {
      html += '→ <strong style="color:#ef9a9a">先手必败</strong>：无论怎么取，对手都能用「凑 ' + (m + 1) + '」策略赢';
    }
    el.innerHTML = html;
  }

  // ═══════════════════════════════════════════════
  //  威佐夫博弈 — 点击棋子来取
  // ═══════════════════════════════════════════════

  function initWythoff() {
    document.getElementById('wythoffStart').addEventListener('click', startWythoff);
    document.getElementById('wythoffDifficulty').addEventListener('change', function() { wyth.difficulty = this.value; });
    renderWythoffColdTable();
  }

  function startWythoff() {
    wyth.initA = parseInt(document.getElementById('wythoffInitA').value) || 5;
    wyth.initB = parseInt(document.getElementById('wythoffInitB').value) || 8;
    wyth.a = wyth.initA;
    wyth.b = wyth.initB;
    wyth.history = [];
    gameActive = true;
    document.getElementById('wythoffHistory').innerHTML = '';
    renderWythoffPiles();
    renderWythoffColdTable();
    setWythoffStatus('your-turn', '点击棋子来取走。可从 A 堆取、B 堆取、或两堆同时取相同数量');
    document.getElementById('wythoffActions').style.display = 'flex';
    document.getElementById('wythoffConfirm').disabled = true;
    wyth._selectedA = 0;
    wyth._selectedB = 0;
    wyth._selASet = [];
    wyth._selBSet = [];
    updateWythoffSelection();
  }

  function onWythoffStoneClick(pile, idx) {
    if (!gameActive || currentGame !== 'wythoff') return;
    var max = pile === 'A' ? wyth.a : wyth.b;
    if (idx >= max) return;

    // 切换选中状态（跟巴什博弈一样，逐个点选）
    if (pile === 'A') {
      var posA = (wyth._selASet || []).indexOf(idx);
      if (!wyth._selASet) wyth._selASet = [];
      if (posA !== -1) {
        wyth._selASet.splice(posA, 1);
      } else {
        wyth._selASet.push(idx);
      }
      wyth._selectedA = wyth._selASet.length;
    } else {
      var posB = (wyth._selBSet || []).indexOf(idx);
      if (!wyth._selBSet) wyth._selBSet = [];
      if (posB !== -1) {
        wyth._selBSet.splice(posB, 1);
      } else {
        wyth._selBSet.push(idx);
      }
      wyth._selectedB = wyth._selBSet.length;
    }
    updateWythoffSelection();
  }
  window.onWythoffStoneClick = onWythoffStoneClick;

  function updateWythoffSelection() {
    var sa = wyth._selectedA || 0;
    var sb = wyth._selectedB || 0;
    // 合法操作检验：只从A取、只从B取、或两堆取相同
    var valid = false;
    if (sa > 0 && sb === 0) valid = true;
    if (sb > 0 && sa === 0) valid = true;
    if (sa > 0 && sb > 0 && sa === sb) valid = true;

    document.getElementById('wythoffConfirm').disabled = !valid;

    var hint = '';
    if (sa > 0 && sb === 0) hint = '从 A 取 ' + sa + ' 个';
    else if (sb > 0 && sa === 0) hint = '从 B 取 ' + sb + ' 个';
    else if (sa > 0 && sb > 0 && sa === sb) hint = '两堆各取 ' + sa + ' 个';
    else if (sa > 0 && sb > 0) hint = '⚠️ 两堆取的数量必须相同（当前 A:' + sa + ' B:' + sb + '）';
    document.getElementById('wythoffSelHint').textContent = hint;

    renderWythoffPiles();
  }

  function wythoffReset() {
    wyth._selectedA = 0;
    wyth._selectedB = 0;
    wyth._selASet = [];
    wyth._selBSet = [];
    updateWythoffSelection();
  }
  window.wythoffReset = wythoffReset;

  function wythoffConfirmTake() {
    if (!gameActive) return;
    var sa = wyth._selectedA || 0;
    var sb = wyth._selectedB || 0;
    if (sa === 0 && sb === 0) return;

    var desc = '';
    if (sa > 0 && sb === 0) { wyth.a -= sa; desc = 'A堆取 ' + sa; }
    else if (sb > 0 && sa === 0) { wyth.b -= sb; desc = 'B堆取 ' + sb; }
    else if (sa === sb) { wyth.a -= sa; wyth.b -= sb; desc = '两堆各取 ' + sa; }
    else return;

    wyth._selectedA = 0; wyth._selectedB = 0;
    wyth._selASet = []; wyth._selBSet = [];
    wyth.history.push({ who: 'player', desc: desc });
    renderWythoffPiles();
    addHistoryItem('wythoffHistory', '你', desc, '(' + wyth.a + ', ' + wyth.b + ')');

    if (wyth.a === 0 && wyth.b === 0) { endWythoff(true); return; }

    // AI
    setWythoffStatus('ai-turn', 'AI 思考中...');
    document.getElementById('wythoffActions').style.display = 'none';
    gameActive = false;

    setTimeout(function() {
      var move = wythoffAiMove(wyth.a, wyth.b, wyth.difficulty);
      var aiDesc = '';
      if (move.type === 'takeA') aiDesc = 'A堆取 ' + (wyth.a - move.toA);
      else if (move.type === 'takeB') aiDesc = 'B堆取 ' + (wyth.b - move.toB);
      else aiDesc = '两堆各取 ' + (wyth.a - move.toA);
      wyth.a = move.toA; wyth.b = move.toB;
      wyth.history.push({ who: 'ai', desc: aiDesc });
      addHistoryItem('wythoffHistory', 'AI', aiDesc, '(' + wyth.a + ', ' + wyth.b + ')');

      if (wyth.a === 0 && wyth.b === 0) {
        renderWythoffPiles();
        endWythoff(false);
        return;
      }

      gameActive = true;
      renderWythoffPiles();
      setWythoffStatus('your-turn', '你的回合 — 点击棋子选择要取的数量');
      document.getElementById('wythoffActions').style.display = 'flex';
      document.getElementById('wythoffConfirm').disabled = true;
      document.getElementById('wythoffSelHint').textContent = '';
      renderWythoffColdTable();
    }, 600 + Math.random() * 400);
  }
  window.wythoffConfirmTake = wythoffConfirmTake;

  function endWythoff(playerWin) {
    gameActive = false;
    document.getElementById('wythoffActions').style.display = 'none';
    if (playerWin) { wyth.stats.wins++; setWythoffStatus('win', '你赢了！'); }
    else { wyth.stats.losses++; setWythoffStatus('lose', 'AI 赢了！'); }
    renderWythoffStats();
    renderWythoffColdTable();
    showGameOverModal(playerWin, '威佐夫博弈', wyth.stats);
  }

  function renderWythoffPiles() {
    var htmlA = '', htmlB = '';
    var selASet = wyth._selASet || [];
    var selBSet = wyth._selBSet || [];
    for (var i = 0; i < wyth.initA; i++) {
      var takenA = i >= wyth.a;
      var selA = !takenA && selASet.indexOf(i) !== -1;
      var clsA = 'stone' + (takenA ? ' taken' : '') + (selA ? ' selected' : '');
      var clickA = !takenA && gameActive ? ' onclick="onWythoffStoneClick(\'A\',' + i + ')"' : '';
      htmlA += '<div class="' + clsA + '"' + clickA + '></div>';
    }
    for (var j = 0; j < wyth.initB; j++) {
      var takenB = j >= wyth.b;
      var selB = !takenB && selBSet.indexOf(j) !== -1;
      var clsB = 'stone' + (takenB ? ' taken' : '') + (selB ? ' selected' : '');
      var clickB = !takenB && gameActive ? ' onclick="onWythoffStoneClick(\'B\',' + j + ')"' : '';
      htmlB += '<div class="' + clsB + '"' + clickB + '></div>';
    }
    document.getElementById('wythoffStonesA').innerHTML = htmlA;
    document.getElementById('wythoffStonesB').innerHTML = htmlB;
    document.getElementById('wythoffCountA').textContent = wyth.a;
    document.getElementById('wythoffCountB').textContent = wyth.b;
  }

  function setWythoffStatus(cls, text) {
    var el = document.getElementById('wythoffStatus');
    el.className = 'game-status ' + cls;
    el.textContent = text;
  }

  function renderWythoffStats() {
    document.getElementById('wythoffWins').textContent = wyth.stats.wins;
    document.getElementById('wythoffLosses').textContent = wyth.stats.losses;
    var total = wyth.stats.wins + wyth.stats.losses;
    document.getElementById('wythoffWinRate').textContent = total > 0 ? Math.round(wyth.stats.wins / total * 100) + '%' : '—';
  }

  function renderWythoffColdTable() {
    var positions = wythoffColdPositions(8);
    var tbody = document.getElementById('wythoffColdBody');
    var html = '';
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      var isCurr = (wyth.a === pos[0] && wyth.b === pos[1]) || (wyth.a === pos[1] && wyth.b === pos[0]);
      html += '<tr' + (isCurr ? ' class="current"' : '') + '><td>' + i + '</td><td class="cold-pos">(' + pos[0] + ', ' + pos[1] + ')</td><td>' + (pos[1] - pos[0]) + '</td></tr>';
    }
    tbody.innerHTML = html;

    var hint = document.getElementById('wythoffStrategyHint');
    var cold = wythoffIsCold(wyth.a, wyth.b);
    if (cold) {
      hint.innerHTML = '<strong>当前 (' + wyth.a + ', ' + wyth.b + ') 是冷局面</strong> — 行动方必败，对手可以稳赢';
    } else {
      var opt = wythoffFindOptimal(wyth.a, wyth.b);
      hint.innerHTML = '<strong>当前 (' + wyth.a + ', ' + wyth.b + ') 是热局面</strong> — 存在必胜走法' + (opt ? '：走到 (' + opt.toA + ', ' + opt.toB + ')' : '');
    }
  }

  // ═══════════════════════════════════════════════
  //  硬币翻转游戏 — 点击硬币操作
  // ═══════════════════════════════════════════════

  function initCoin() {
    document.getElementById('coinStart').addEventListener('click', startCoin);
    document.getElementById('coinDifficulty').addEventListener('change', function() { coin.difficulty = this.value; });
    document.getElementById('coinCount').addEventListener('change', function() { coin.count = parseInt(this.value) || 8; });
  }

  function startCoin() {
    coin.count = parseInt(document.getElementById('coinCount').value) || 8;
    coin.coins = coinGenerateInitial(coin.count);
    coin.selectedFlip = -1;
    coin.history = [];
    gameActive = true;
    document.getElementById('coinHistory').innerHTML = '';
    renderCoins();
    setCoinStatus('your-turn', '<strong>第一步：</strong>点击一枚<span class="head-text">正面（金色）</span>硬币翻为反面');
    document.getElementById('coinConfirm').style.display = 'inline-flex';
    document.getElementById('coinConfirm').disabled = true;
    document.getElementById('coinStep').textContent = '步骤 1/2：选择要翻转的正面硬币';
    renderCoinHint();
  }

  function onCoinClick(idx) {
    if (!gameActive || currentGame !== 'coin') return;

    if (coin.selectedFlip === -1) {
      // 第一步：必须选一枚正面硬币
      if (!coin.coins[idx]) {
        setCoinStatus('your-turn', '必须选一枚<span class="head-text">正面（金色）</span>的硬币！');
        return;
      }
      coin.selectedFlip = idx;
      renderCoins();
      setCoinStatus('your-turn', '<strong>第二步：</strong>可选择翻转左边任意一枚硬币（可选），或直接「确认」');
      document.getElementById('coinStep').textContent = '步骤 2/2：选左边一枚额外翻转（可跳过）';
      document.getElementById('coinConfirm').disabled = false;
    } else if (idx < coin.selectedFlip) {
      // 第二步：选左边一枚额外翻转
      coin._alsoFlip = (coin._alsoFlip === idx) ? undefined : idx;
      renderCoins();
    } else if (idx === coin.selectedFlip) {
      // 点击已选的取消
      coin.selectedFlip = -1;
      coin._alsoFlip = undefined;
      renderCoins();
      setCoinStatus('your-turn', '<strong>第一步：</strong>点击一枚<span class="head-text">正面（金色）</span>硬币翻为反面');
      document.getElementById('coinConfirm').disabled = true;
      document.getElementById('coinStep').textContent = '步骤 1/2：选择要翻转的正面硬币';
    }
  }
  window.onCoinClick = onCoinClick;

  function coinConfirmFlip() {
    if (!gameActive || coin.selectedFlip === -1) return;
    var flip = coin.selectedFlip;
    var also = coin._alsoFlip;

    // 执行翻转
    coin.coins[flip] = !coin.coins[flip]; // 正→反
    var desc = '翻转 #' + (flip + 1) + '→反';
    if (also !== undefined && also >= 0) {
      coin.coins[also] = !coin.coins[also];
      desc += '，翻转 #' + (also + 1) + (coin.coins[also] ? '→正' : '→反');
    }

    coin.selectedFlip = -1;
    coin._alsoFlip = undefined;
    coin.history.push({ who: 'player', desc: desc });
    renderCoins();
    addHistoryItem('coinHistory', '你', desc, headsCount() + ' 正面');

    if (headsCount() === 0) { endCoin(true); return; }

    // AI 回合
    setCoinStatus('ai-turn', 'AI 思考中...');
    document.getElementById('coinConfirm').style.display = 'none';
    gameActive = false;

    setTimeout(function() {
      var move = coinAiMove(coin.coins, coin.difficulty);
      if (!move) { endCoin(true); return; }

      coin.coins[move.flip] = false;
      var aiDesc = '翻转 #' + (move.flip + 1) + '→反';
      if (move.alsoFlip !== null && move.alsoFlip !== undefined) {
        coin.coins[move.alsoFlip] = !coin.coins[move.alsoFlip];
        aiDesc += '，翻转 #' + (move.alsoFlip + 1) + (coin.coins[move.alsoFlip] ? '→正' : '→反');
      }
      coin.history.push({ who: 'ai', desc: aiDesc });
      addHistoryItem('coinHistory', 'AI', aiDesc, headsCount() + ' 正面');

      if (headsCount() === 0) {
        renderCoins();
        endCoin(false);
        return;
      }

      gameActive = true;
      renderCoins();
      setCoinStatus('your-turn', '<strong>第一步：</strong>点击一枚<span class="head-text">正面（金色）</span>硬币翻为反面');
      document.getElementById('coinConfirm').style.display = 'inline-flex';
      document.getElementById('coinConfirm').disabled = true;
      document.getElementById('coinStep').textContent = '步骤 1/2：选择要翻转的正面硬币';
      renderCoinHint();
    }, 500 + Math.random() * 400);
  }
  window.coinConfirmFlip = coinConfirmFlip;

  function endCoin(playerWin) {
    gameActive = false;
    document.getElementById('coinConfirm').style.display = 'none';
    if (playerWin) { coin.stats.wins++; setCoinStatus('win', '你赢了！'); }
    else { coin.stats.losses++; setCoinStatus('lose', 'AI 赢了！'); }
    renderCoinStats();
    renderCoinHint();
    showGameOverModal(playerWin, '硬币翻转', coin.stats);
  }

  function headsCount() {
    return coin.coins.filter(function(c) { return c; }).length;
  }

  function renderCoins() {
    var container = document.getElementById('coinDisplay');
    var html = '';
    for (var i = 0; i < coin.coins.length; i++) {
      var isHead = coin.coins[i];
      var isSelected = (i === coin.selectedFlip);
      var isAlso = (coin._alsoFlip === i);
      var cls = 'coin-item' + (isHead ? ' heads' : ' tails');
      if (isSelected) cls += ' selected-main';
      if (isAlso) cls += ' selected-also';
      var clickable = gameActive ? ' onclick="onCoinClick(' + i + ')"' : '';
      html += '<div class="' + cls + '"' + clickable + '>';
      html += '<div class="coin-face">' + (isHead ? 'H' : 'T') + '</div>';
      html += '<div class="coin-idx">#' + (i + 1) + '</div>';
      html += '</div>';
    }
    container.innerHTML = html;
  }

  function setCoinStatus(cls, text) {
    var el = document.getElementById('coinStatus');
    el.className = 'game-status ' + cls;
    el.innerHTML = text;
  }

  function renderCoinStats() {
    document.getElementById('coinWins').textContent = coin.stats.wins;
    document.getElementById('coinLosses').textContent = coin.stats.losses;
    var total = coin.stats.wins + coin.stats.losses;
    document.getElementById('coinWinRate').textContent = total > 0 ? Math.round(coin.stats.wins / total * 100) + '%' : '—';
  }

  function renderCoinHint() {
    var el = document.getElementById('coinStrategyHint');
    var xor = coinNimValue(coin.coins);
    var heads = [];
    for (var i = 0; i < coin.coins.length; i++) { if (coin.coins[i]) heads.push(i); }
    var html = '<strong>局面分析：</strong>正面硬币位置 = [' + heads.map(function(h) { return h; }).join(', ') + ']<br>';
    html += 'XOR = ' + heads.map(function(h) { return h; }).join(' ⊕ ') + ' = ' + xor + '<br>';
    if (xor !== 0) {
      html += '→ <strong style="color:#81c784">先手必胜</strong>：存在走法使 XOR 归零';
    } else {
      html += '→ <strong style="color:#ef9a9a">先手必败</strong>：无论怎么操作，对手都能保持 XOR=0';
    }
    el.innerHTML = html;
  }

  // ── 通用历史记录 ──
  function addHistoryItem(containerId, who, action, remaining) {
    var container = document.getElementById(containerId);
    var cls = who === '你' ? 'player' : 'ai';
    container.innerHTML += '<div class="move-item"><span class="who ' + cls + '">' + who + '</span><span class="action">' + action + '</span><span class="remaining">' + remaining + '</span></div>';
    container.scrollTop = container.scrollHeight;
  }

  // ── 游戏结束弹窗 ──
  var API_BASE = 'https://numfeel-api.996.ninja';

  function showGameOverModal(playerWin, gameName, stats) {
    var modal = document.getElementById('gameOverModal');
    var box = modal.querySelector('.modal-box');
    var icon = document.getElementById('modalIcon');
    var title = document.getElementById('modalTitle');
    var desc = document.getElementById('modalDesc');
    var statsEl = document.getElementById('modalStats');

    box.className = 'modal-box ' + (playerWin ? 'win' : 'lose');

    if (playerWin) {
      icon.textContent = '🏆';
      title.textContent = '恭喜，你赢了！';
      desc.textContent = '在' + gameName + '中击败了 AI。掌握数学的人果然赢了。';
      setTimeout(function() {
        if (window.confetti) {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
          setTimeout(function() {
            confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0 } });
            confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1 } });
          }, 250);
        }
      }, 200);
    } else {
      icon.textContent = '💀';
      title.textContent = 'AI 赢了';
      desc.textContent = gameName + '中 AI 占了上风。提示：看看策略分析，找到必胜的数学规律。';
    }

    var total = stats.wins + stats.losses;
    var rate = total > 0 ? Math.round(stats.wins / total * 100) + '%' : '—';
    statsEl.innerHTML =
      '<div class="ms-item"><div class="ms-val">' + stats.wins + '</div><div class="ms-lbl">胜</div></div>' +
      '<div class="ms-item"><div class="ms-val">' + stats.losses + '</div><div class="ms-lbl">负</div></div>' +
      '<div class="ms-item"><div class="ms-val">' + rate + '</div><div class="ms-lbl">胜率</div></div>';

    setTimeout(function() { modal.classList.add('show'); }, 300);

    // 上报统计
    submitStats(currentGame, playerWin ? 'win' : 'lose');
  }

  function replayGame() {
    document.getElementById('gameOverModal').classList.remove('show');
    setTimeout(function() {
      if (currentGame === 'bash') document.getElementById('bashStart').click();
      else if (currentGame === 'wythoff') document.getElementById('wythoffStart').click();
      else if (currentGame === 'coin') document.getElementById('coinStart').click();
    }, 200);
  }
  window.replayGame = replayGame;

  // ── 后端统计 ──
  function submitStats(game, result) {
    var difficulty = 'normal';
    var rounds = 1;
    if (game === 'bash') { difficulty = bash.difficulty; rounds = bash.history.length; }
    else if (game === 'wythoff') { difficulty = wyth.difficulty; rounds = wyth.history.length; }
    else if (game === 'coin') { difficulty = coin.difficulty; rounds = coin.history.length; }

    fetch(API_BASE + '/winning-strategy/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: game, result: result, difficulty: difficulty, rounds: rounds })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data && data.data) renderGlobalStats(data.data);
    }).catch(function() {});
  }

  function loadGlobalStats() {
    fetch(API_BASE + '/winning-strategy/stats')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (data && data.data) renderGlobalStats(data.data); })
      .catch(function() {});
  }

  function renderGlobalStats(d) {
    var el = document.getElementById('globalStats');
    if (!el) return;
    var aiRate = d.aiWinRate || 0;
    el.innerHTML =
      '<div class="stat-box"><div class="val">' + (d.total || 0) + '</div><div class="lbl">总对局</div></div>' +
      '<div class="stat-box"><div class="val">' + (d.aiWins || 0) + '</div><div class="lbl">AI 获胜</div></div>' +
      '<div class="stat-box"><div class="val">' + aiRate + '%</div><div class="lbl">AI 胜率</div></div>' +
      '<div class="stat-box"><div class="val">' + (d.playerWins || 0) + '</div><div class="lbl">玩家获胜</div></div>';
  }

  // 页面加载时拉取全局统计，每 60 秒刷新
  loadGlobalStats();
  setInterval(loadGlobalStats, 60000);

})();
