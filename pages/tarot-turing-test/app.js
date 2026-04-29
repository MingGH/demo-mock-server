var currentSession = null;
var selectedBestSlot = null;
var selectedAiSlot = null;

function showEl(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideEl(id) {
  document.getElementById(id).classList.add('hidden');
}

function startExperiment() {
  currentSession = createSession(getOrCreateSessionSeed());
  selectedBestSlot = null;
  selectedAiSlot = null;

  hideEl('introSection');
  showEl('experimentSection');
  hideEl('resultSection');

  renderSpread(currentSession);
  renderReaders(currentSession);
  renderChoiceButtons('bestChoiceRow', 'best');
  renderChoiceButtons('aiChoiceRow', 'ai');
  updateSubmitState();
}

function renderSpread(session) {
  document.getElementById('spreadBadge').textContent = session.spread.title;
  document.getElementById('spreadQuestion').textContent = '问题：' + session.spread.question;
  document.getElementById('cardRow').innerHTML = session.spread.cards.map(function (card) {
    return (
      '<div class="card-chip">' +
      '<div class="card-pos">' + card.position + '</div>' +
      '<div class="card-name">' + card.name + card.orientation + '</div>' +
      '<div class="card-note">' + card.meaning + '</div>' +
      '</div>'
    );
  }).join('');
}

function renderReaders(session) {
  document.getElementById('readerGrid').innerHTML = session.slots.map(function (item) {
    return (
      '<div class="reader-card">' +
      '<div class="reader-title">' +
      '<span class="reader-slot">塔罗师 ' + item.slot + '</span>' +
      '<span class="reader-meta">身份未公开</span>' +
      '</div>' +
      '<div class="reader-reading">' +
      item.reading.map(function (line) {
        return '<p>' + escapeHtml(line) + '</p>';
      }).join('') +
      '</div>' +
      '</div>'
    );
  }).join('');
}

function renderChoiceButtons(containerId, type) {
  var html = SLOT_LABELS.map(function (slot) {
    return '<button class="choice-btn" data-type="' + type + '" data-slot="' + slot + '">' + slot + '</button>';
  }).join('');

  var container = document.getElementById(containerId);
  container.innerHTML = html;
  Array.prototype.forEach.call(container.querySelectorAll('.choice-btn'), function (btn) {
    btn.addEventListener('click', function () {
      chooseSlot(this.getAttribute('data-type'), this.getAttribute('data-slot'));
    });
  });
}

function chooseSlot(type, slot) {
  if (type === 'best') {
    selectedBestSlot = slot;
    highlightChoices('bestChoiceRow', slot);
  } else {
    selectedAiSlot = slot;
    highlightChoices('aiChoiceRow', slot);
  }
  updateSubmitState();
}

function highlightChoices(containerId, slot) {
  Array.prototype.forEach.call(document.querySelectorAll('#' + containerId + ' .choice-btn'), function (btn) {
    if (btn.getAttribute('data-slot') === slot) btn.classList.add('selected');
    else btn.classList.remove('selected');
  });
}

function updateSubmitState() {
  document.getElementById('submitBtn').disabled = !(selectedBestSlot && selectedAiSlot);
}

function submitAnswers() {
  if (!currentSession || !selectedBestSlot || !selectedAiSlot) return;

  var result = evaluateSelections(currentSession, selectedBestSlot, selectedAiSlot);

  hideEl('experimentSection');
  showEl('resultSection');

  renderPersonalResult(result);
  submitToBackend(result);
  fetchAggregateData(result);
}

function renderPersonalResult(result) {
  var guessAccuracy = result.guessedAiCorrect ? '猜对了' : '没猜对';
  var trustVerdict = result.bestWasAi ? '你最信任的是 AI 风格解读' :
    (result.bestWasHuman ? '你最信任的是真人塔罗师风格解读' : '你最信任的是模板拼接解读');

  document.getElementById('resultStats').innerHTML = [
    { label: '你选的最准', value: '塔罗师 ' + result.bestSlot },
    { label: '它的真实身份', value: ROLE_LABELS[result.bestRole] },
    { label: '你猜的 AI', value: '塔罗师 ' + result.guessedAiSlot },
    { label: 'AI 识别结果', value: guessAccuracy }
  ].map(function (item) {
    return '<div class="stat-card"><div class="stat-value">' + item.value + '</div><div class="stat-label">' + item.label + '</div></div>';
  }).join('');

  document.getElementById('revealBoard').innerHTML = currentSession.slots.map(function (slot) {
    var flags = [];
    if (slot.slot === result.bestSlot) flags.push('你选它最准');
    if (slot.slot === result.guessedAiSlot) flags.push('你猜它是 AI');
    return (
      '<div class="reveal-row">' +
      '<div><strong>塔罗师 ' + slot.slot + '</strong></div>' +
      '<div class="reveal-role">' + ROLE_LABELS[slot.role] + '</div>' +
      '<div>' + flags.map(function (text) {
        return '<span class="role-tag">' + text + '</span>';
      }).join(' ') + '</div>' +
      '</div>'
    );
  }).join('');

  var insight = '';
  if (result.bestWasAi && !result.guessedAiCorrect) {
    insight = '你把 AI 风格解读选成了最准，同时没有认出它。这个结果通常说明：文本的顺滑度、叙事张力和“被看见”的感觉，比身份标签更容易左右判断。';
  } else if (result.bestWasHuman && result.guessedAiCorrect) {
    insight = '这次你更信真人塔罗师风格，也顺手认出了 AI。你的判断更关注口吻差异，而不是谁写得更华丽。';
  } else if (result.bestWasTemplate) {
    insight = '你这次最信模板拼接型解读，说明简洁、直接、结构明确的文本，也会被读成“很准”。这正好提醒我们：很多被认为很灵的解读，靠的往往是低风险表达。';
  } else {
    insight = trustVerdict + '。你这次的选择，更多是在比较叙事风格，而不是比较谁真的掌握了你的个人信息。';
  }

  document.getElementById('personalInsight').innerHTML = insight;
}

function submitToBackend(result) {
  var body = {
    sessionSeed: currentSession.seed,
    spreadId: currentSession.spread.id,
    bestSlot: result.bestSlot,
    bestRole: result.bestRole,
    guessedAiSlot: result.guessedAiSlot,
    guessedAiRole: result.guessedAiRole,
    guessedAiCorrect: result.guessedAiCorrect
  };

  var xhr = new XMLHttpRequest();
  xhr.open('POST', API_BASE + '/tarot-turing-test/submit', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 5000;
  xhr.onerror = function () {};
  xhr.ontimeout = function () {};
  xhr.send(JSON.stringify(body));
}

function fetchAggregateData(personalResult) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/tarot-turing-test/stats', true);
  xhr.timeout = 5000;
  xhr.onload = function () {
    if (xhr.status === 200) {
      try {
        var raw = JSON.parse(xhr.responseText);
        var data = raw && raw.data ? raw.data : raw;
        renderAggregate(normalizeStats(data), personalResult);
      } catch (e) {
        renderAggregateFallback(personalResult);
      }
    } else {
      renderAggregateFallback(personalResult);
    }
  };
  xhr.onerror = function () {
    renderAggregateFallback(personalResult);
  };
  xhr.ontimeout = function () {
    renderAggregateFallback(personalResult);
  };
  xhr.send();
}

function renderAggregate(data, personalResult) {
  document.getElementById('aggregateGrid').innerHTML = [
    { label: '累计完成次数', value: data.totalSessions },
    { label: 'AI 被猜中的比例', value: data.guessAiAccuracyPct.toFixed(1) + '%' },
    { label: '最常被选为最准', value: ROLE_LABELS[data.mostTrustedRole] },
    { label: '最常被怀疑是 AI', value: ROLE_LABELS[data.mostSuspectedAsAiRole] }
  ].map(function (item) {
    return '<div class="aggregate-card"><div class="aggregate-value">' + item.value + '</div><div class="aggregate-label">' + item.label + '</div></div>';
  }).join('');

  var sections = [
    { title: '被选为最准的比例', rates: data.bestRoleRates },
    { title: '被猜成 AI 的比例', rates: data.guessedAiRoleRates }
  ];

  document.getElementById('aggregateBars').innerHTML = sections.map(function (section) {
    return '<div class="bar-group"><h4>' + section.title + '</h4>' +
      renderRateBar('模板拼接', section.rates.template) +
      renderRateBar('真人塔罗师风格', section.rates.human) +
      renderRateBar('AI 风格', section.rates.ai) +
      '</div>';
  }).join('');

  document.getElementById('aggregateSection').classList.remove('hidden');
}

function renderRateBar(label, pct) {
  return (
    '<div class="bar-row">' +
    '<div class="bar-label"><span>' + label + '</span><span>' + pct.toFixed(1) + '%</span></div>' +
    '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
    '</div>'
  );
}

function renderAggregateFallback(personalResult) {
  var fallback = normalizeStats({
    totalSessions: 1,
    guessAiAccuracyPct: personalResult.guessedAiCorrect ? 100 : 0,
    bestRoleCounts: {
      template: personalResult.bestWasTemplate ? 1 : 0,
      human: personalResult.bestWasHuman ? 1 : 0,
      ai: personalResult.bestWasAi ? 1 : 0
    },
    guessedAiRoleCounts: {
      template: personalResult.guessedAiRole === ROLE_TYPES.TEMPLATE ? 1 : 0,
      human: personalResult.guessedAiRole === ROLE_TYPES.HUMAN ? 1 : 0,
      ai: personalResult.guessedAiRole === ROLE_TYPES.AI ? 1 : 0
    }
  });
  renderAggregate(fallback, personalResult);
}

function restartExperiment() {
  resetSessionSeed();
  currentSession = null;
  selectedBestSlot = null;
  selectedAiSlot = null;

  hideEl('experimentSection');
  hideEl('resultSection');
  showEl('introSection');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
