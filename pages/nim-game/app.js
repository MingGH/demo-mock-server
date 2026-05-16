// ========== 游戏状态 ==========
let piles = [];
let isPlayerTurn = true;
let gameActive = false;
let selectedPile = -1;
let selectedStones = [];
let moveHistory = [];
let stats = { total: 0, wins: 0, losses: 0 };
let hintVisible = false;

// ========== 初始化 ==========
function startNewGame() {
  const preset = document.getElementById('presetSelect').value;
  piles = generatePiles(preset);
  isPlayerTurn = true;
  gameActive = true;
  selectedPile = -1;
  selectedStones = [];
  moveHistory = [];
  hintVisible = false;

  document.getElementById('gameResult').style.display = 'none';
  document.getElementById('takeControls').style.display = 'none';
  document.getElementById('takeInfo').style.display = 'none';
  document.getElementById('strategyHint').classList.remove('show');

  renderPiles();
  updateBinaryPanel();
  updateStatus();
  renderHistory();
}

// ========== 渲染石子 ==========
function renderPiles() {
  const area = document.getElementById('pilesArea');
  area.innerHTML = '';

  const bits = maxBits(piles);

  piles.forEach((count, pileIdx) => {
    const col = document.createElement('div');
    col.className = 'pile-column';

    const label = document.createElement('div');
    label.className = 'pile-label';
    label.textContent = '第 ' + (pileIdx + 1) + ' 堆';
    col.appendChild(label);

    const stonesDiv = document.createElement('div');
    stonesDiv.className = 'pile-stones';

    for (let i = 0; i < count; i++) {
      const stone = document.createElement('div');
      stone.className = 'stone';
      stone.dataset.pile = pileIdx;
      stone.dataset.index = i;
      if (selectedPile === pileIdx && selectedStones.includes(i)) {
        stone.classList.add('selected');
      }
      stone.addEventListener('click', () => onStoneClick(pileIdx, i));
      stonesDiv.appendChild(stone);
    }
    col.appendChild(stonesDiv);

    const countDiv = document.createElement('div');
    countDiv.className = 'pile-count';
    countDiv.textContent = count;
    col.appendChild(countDiv);

    const binaryDiv = document.createElement('div');
    binaryDiv.className = 'pile-binary';
    binaryDiv.textContent = toBinary(count, bits);
    col.appendChild(binaryDiv);

    area.appendChild(col);
  });
}

// ========== 石子点击 ==========
function onStoneClick(pileIdx, stoneIdx) {
  if (!gameActive || !isPlayerTurn) return;

  // 只能从一堆取
  if (selectedPile !== -1 && selectedPile !== pileIdx) {
    // 切换到新堆
    selectedPile = pileIdx;
    selectedStones = [stoneIdx];
  } else {
    selectedPile = pileIdx;
    if (selectedStones.includes(stoneIdx)) {
      selectedStones = selectedStones.filter(i => i !== stoneIdx);
    } else {
      selectedStones.push(stoneIdx);
    }
  }

  // 如果取消了所有选择
  if (selectedStones.length === 0) {
    selectedPile = -1;
  }

  renderPiles();
  updateTakeInfo();
}

function updateTakeInfo() {
  const info = document.getElementById('takeInfo');
  const controls = document.getElementById('takeControls');

  if (selectedStones.length > 0) {
    info.style.display = '';
    controls.style.display = '';
    document.getElementById('selectedPileName').textContent = '第 ' + (selectedPile + 1) + ' 堆';
    document.getElementById('selectedCount').textContent = selectedStones.length;
  } else {
    info.style.display = 'none';
    controls.style.display = 'none';
  }
}

// ========== 确认取走 ==========
function confirmTake() {
  if (!gameActive || !isPlayerTurn || selectedStones.length === 0) return;

  const take = selectedStones.length;
  const pile = selectedPile;

  // 动画
  animateRemoval(pile, selectedStones, () => {
    piles[pile] -= take;
    moveHistory.push({ who: 'player', pile: pile, take: take, piles: piles.slice() });

    selectedPile = -1;
    selectedStones = [];

    if (isGameOver(piles)) {
      endGame(true);
      return;
    }

    isPlayerTurn = false;
    updateStatus();
    renderPiles();
    updateBinaryPanel();
    renderHistory();

    // AI 延迟走棋
    setTimeout(doAiMove, 800);
  });
}

function cancelSelection() {
  selectedPile = -1;
  selectedStones = [];
  renderPiles();
  updateTakeInfo();
}

// ========== 动画移除 ==========
function animateRemoval(pileIdx, stoneIndices, callback) {
  const area = document.getElementById('pilesArea');
  const columns = area.querySelectorAll('.pile-column');
  const col = columns[pileIdx];
  if (!col) { callback(); return; }

  const stones = col.querySelectorAll('.stone');
  stoneIndices.forEach(idx => {
    if (stones[idx]) stones[idx].classList.add('removing');
  });

  setTimeout(callback, 400);
}

// ========== AI 走棋 ==========
function doAiMove() {
  if (!gameActive) return;

  const difficulty = document.getElementById('difficultySelect').value;
  const move = aiMove(piles, difficulty);

  if (!move) return;

  // 标记 AI 要取的石子
  selectedPile = move.pile;
  selectedStones = [];
  for (let i = piles[move.pile] - 1; i >= piles[move.pile] - move.take; i--) {
    selectedStones.push(i);
  }
  renderPiles();

  setTimeout(() => {
    animateRemoval(move.pile, selectedStones, () => {
      piles[move.pile] -= move.take;
      moveHistory.push({ who: 'ai', pile: move.pile, take: move.take, piles: piles.slice() });

      selectedPile = -1;
      selectedStones = [];

      if (isGameOver(piles)) {
        endGame(false);
        return;
      }

      isPlayerTurn = true;
      updateStatus();
      renderPiles();
      updateBinaryPanel();
      renderHistory();
    });
  }, 500);
}

// ========== 游戏结束 ==========
function endGame(playerWins) {
  gameActive = false;
  stats.total++;
  if (playerWins) stats.wins++;
  else stats.losses++;

  // 提交到后端统计
  submitGameResult(playerWins);

  document.getElementById('takeControls').style.display = 'none';
  document.getElementById('takeInfo').style.display = 'none';

  const result = document.getElementById('gameResult');
  result.style.display = '';

  if (playerWins) {
    document.getElementById('resultIcon').textContent = '🎉';
    document.getElementById('resultText').textContent = '你赢了！';
    document.getElementById('resultText').className = 'result-text win';
    document.getElementById('resultSub').textContent = '你成功取走了最后一颗石子。';
  } else {
    document.getElementById('resultIcon').textContent = '🤖';
    document.getElementById('resultText').textContent = 'AI 赢了';
    document.getElementById('resultText').className = 'result-text lose';
    const difficulty = document.getElementById('difficultySelect').value;
    const sub = difficulty === 'hard'
      ? '困难模式下 AI 使用完美策略，试试看二进制面板找规律。'
      : 'AI 走了最优策略。观察二进制面板，找到必胜的秘密。';
    document.getElementById('resultSub').textContent = sub;
  }

  updateStats();
  renderPiles();
  updateBinaryPanel();
  renderHistory();
}

// ========== 状态更新 ==========
function updateStatus() {
  const turnEl = document.getElementById('statusTurn');
  const nimEl = document.getElementById('statusNimSum');

  if (!gameActive) {
    turnEl.innerHTML = '游戏结束';
  } else if (isPlayerTurn) {
    turnEl.innerHTML = '轮到：<span class="highlight">你</span>（点击石子选择要取走的）';
  } else {
    turnEl.innerHTML = '轮到：<span class="highlight" style="color:#64b5f6;">AI 思考中…</span>';
  }

  const ns = nimSum(piles);
  const xorStr = ns === 0
    ? '<span class="xor-val" style="color:#81c784;">0（当前行动方必败）</span>'
    : '<span class="xor-val">' + ns + '（当前行动方有必胜策略）</span>';
  nimEl.innerHTML = '尼姆和：' + xorStr;
}

// ========== 二进制面板 ==========
function updateBinaryPanel() {
  const bits = maxBits(piles);
  const headerRow = document.getElementById('binaryHeader');
  const body = document.getElementById('binaryBody');

  // 表头
  let headerHtml = '<th></th>';
  for (let b = bits - 1; b >= 0; b--) {
    headerHtml += '<th>2<sup>' + b + '</sup></th>';
  }
  headerHtml += '<th>十进制</th>';
  headerRow.innerHTML = headerHtml;

  // 各堆
  let bodyHtml = '';
  const xorBits = new Array(bits).fill(0);

  piles.forEach((count, i) => {
    const bin = toBinary(count, bits);
    bodyHtml += '<tr><td class="pile-name-cell">第 ' + (i + 1) + ' 堆</td>';
    for (let b = 0; b < bits; b++) {
      const bitVal = parseInt(bin[b]);
      xorBits[b] ^= bitVal;
      const hotClass = bitVal === 1 ? ' hot' : '';
      bodyHtml += '<td class="bit' + hotClass + '">' + bin[b] + '</td>';
    }
    bodyHtml += '<td class="decimal">' + count + '</td></tr>';
  });

  // XOR 行
  const ns = nimSum(piles);
  bodyHtml += '<tr class="xor-row"><td class="xor-label">XOR</td>';
  for (let b = 0; b < bits; b++) {
    const cls = xorBits[b] === 0 ? 'zero' : 'nonzero';
    bodyHtml += '<td class="xor-bit ' + cls + '">' + xorBits[b] + '</td>';
  }
  bodyHtml += '<td class="decimal" style="color:' + (ns === 0 ? '#81c784' : '#ff6b6b') + ';">' + ns + '</td></tr>';

  body.innerHTML = bodyHtml;
}

// ========== 提示 ==========
function toggleHint() {
  hintVisible = !hintVisible;
  const el = document.getElementById('strategyHint');

  if (!hintVisible || !gameActive) {
    el.classList.remove('show');
    return;
  }

  el.classList.add('show');
  const ns = nimSum(piles);

  if (!isPlayerTurn) {
    el.innerHTML = '<strong>等待 AI 走棋…</strong>';
    return;
  }

  if (ns === 0) {
    el.innerHTML = '<strong>当前尼姆和 = 0，你处于必败态。</strong> 无论怎么取，都会让尼姆和变为非零，把必胜权交给 AI。只能期待 AI 犯错（简单/普通模式）。';
  } else {
    const move = findOptimalMove(piles);
    if (move) {
      el.innerHTML = '<strong>必胜走法：</strong>从第 ' + (move.pile + 1) + ' 堆取走 ' + move.take + ' 颗，使尼姆和变为 0。';
    }
  }
}

// ========== 统计 ==========
function updateStats() {
  document.getElementById('statTotal').textContent = stats.total;
  document.getElementById('statWin').textContent = stats.wins;
  document.getElementById('statLose').textContent = stats.losses;
  const rate = stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : 0;
  document.getElementById('statRate').textContent = rate + '%';
}

// ========== 历史记录 ==========
function renderHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '';

  moveHistory.forEach((m, i) => {
    const item = document.createElement('div');
    item.className = 'history-item ' + (m.who === 'player' ? 'player' : 'ai');
    const whoText = m.who === 'player' ? '你' : 'AI';
    item.innerHTML = '<span class="who">' + whoText + '</span>' +
      '<span class="action">从第 ' + (m.pile + 1) + ' 堆取走 ' + m.take + ' 颗 → 剩余 [' + m.piles.join(', ') + ']</span>';
    list.appendChild(item);
  });

  list.scrollTop = list.scrollHeight;
}

// ========== 全站统计 API ==========
const NIM_API = 'https://numfeel-api.996.ninja/nim-game';

function submitGameResult(playerWins) {
  const difficulty = document.getElementById('difficultySelect').value;
  const preset = document.getElementById('presetSelect').value;
  const rounds = moveHistory.length;

  fetch(NIM_API + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      result: playerWins ? 'win' : 'lose',
      difficulty: difficulty,
      rounds: rounds,
      preset: preset
    })
  })
    .then(r => r.json())
    .then(res => {
      if (res.status === 200) renderGlobalStats(res.data);
    })
    .catch(() => {}); // 静默失败
}

function loadGlobalStats() {
  fetch(NIM_API + '/stats')
    .then(r => r.json())
    .then(res => {
      if (res.status === 200) renderGlobalStats(res.data);
    })
    .catch(() => {});
}

function renderGlobalStats(data) {
  document.getElementById('gTotal').textContent = data.total.toLocaleString();
  document.getElementById('gAiWinRate').textContent = data.aiWinRate + '%';
  document.getElementById('gAiWinRateHard').textContent = data.aiWinRateHard + '%';
  document.getElementById('gPlayerWins').textContent = data.playerWins.toLocaleString();

  const insight = document.getElementById('globalInsight');
  if (data.total >= 5) {
    insight.style.display = '';
    let text = '共 ' + data.total + ' 局对弈中，AI 赢了 ' + data.aiWins + ' 局（胜率 ' + data.aiWinRate + '%）。';
    if (data.gamesHard > 0) {
      text += '困难模式下 AI 胜率高达 ' + data.aiWinRateHard + '%，';
      if (data.aiWinRateHard >= 90) {
        text += '几乎无人能敌——这就是数学必胜策略的威力。';
      } else if (data.aiWinRateHard >= 70) {
        text += '大部分玩家都败给了 XOR 运算。';
      } else {
        text += '看来有不少高手掌握了尼姆和的秘密。';
      }
    }
    document.getElementById('globalInsightText').textContent = text;
  }
}

// ========== 启动 ==========
startNewGame();
loadGlobalStats();
