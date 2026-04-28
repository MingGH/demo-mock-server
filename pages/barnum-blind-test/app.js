var userGroup = null;
var statements = [];
var currentIndex = 0;
var ratings = [null, null, null, null, null];
var testStarted = false;

function showEl(id) { document.getElementById(id).classList.remove('hidden'); }
function hideEl(id) { document.getElementById(id).classList.add('hidden'); }

function startTest() {
  userGroup = assignGroup();
  statements = getStatements(5);
  currentIndex = 0;
  ratings = [null, null, null, null, null];
  testStarted = true;

  hideEl('introSection');
  showEl('testSection');
  hideEl('resultSection');

  var badge = document.getElementById('groupBadge');
  if (userGroup === 'tarot') {
    badge.innerHTML = '<i class="ti ti-crystal-ball"></i> 系统已将你分配至：<strong>AI 塔罗分析</strong> 组';
    badge.style.background = 'rgba(156,39,176,0.15)';
    badge.style.borderColor = 'rgba(156,39,176,0.3)';
    badge.style.color = '#ce93d8';
  } else {
    badge.innerHTML = '<i class="ti ti-dice-5"></i> 系统已将你分配至：<strong>随机生成文字</strong> 组';
    badge.style.background = 'rgba(100,180,255,0.15)';
    badge.style.borderColor = 'rgba(100,180,255,0.3)';
    badge.style.color = '#90caf9';
  }

  document.getElementById('totalNum').textContent = statements.length;
  showStatement();
}

function showStatement() {
  var s = statements[currentIndex];
  var label = document.getElementById('statementLabel');
  if (userGroup === 'tarot') {
    label.textContent = 'AI 塔罗 · 性格分析';
  } else {
    label.textContent = '随机生成 · 性格描述';
  }
  document.getElementById('statementText').textContent = s.text;

  document.getElementById('currentNum').textContent = currentIndex + 1;
  document.getElementById('progressFill').style.width = ((currentIndex) / statements.length * 100) + '%';

  var prevBtn = document.getElementById('prevBtn');
  if (currentIndex > 0) {
    prevBtn.classList.remove('hidden');
  } else {
    prevBtn.classList.add('hidden');
  }

  highlightRating(ratings[currentIndex]);
}

function highlightRating(val) {
  var buttons = document.querySelectorAll('#ratingButtons .rating-btn');
  buttons.forEach(function (btn) {
    if (parseInt(btn.getAttribute('data-rating')) === val) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

function selectRating(rating) {
  ratings[currentIndex] = rating;
  highlightRating(rating);
  setTimeout(function () { nextStatement(); }, 300);
}

function nextStatement() {
  if (currentIndex < statements.length - 1) {
    currentIndex++;
    showStatement();
  } else {
    finishTest();
  }
}

function prevStatement() {
  if (currentIndex > 0) {
    currentIndex--;
    showStatement();
  }
}

function finishTest() {
  var hasAll = ratings.every(function (r) { return r !== null; });
  if (!hasAll) return;

  document.getElementById('progressFill').style.width = '100%';
  hideEl('testSection');
  showEl('resultSection');

  var stats = computeStats(ratings.map(function (r, i) {
    return { statementIndex: statements[i].index, rating: r };
  }));

  document.getElementById('statsGrid').innerHTML = [
    { label: '平均评分', value: stats.avgRating.toFixed(2) + ' / 5' },
    { label: '满分(5分)次数', value: stats.distribution[4] },
    { label: '你所在的分组', value: userGroup === 'tarot' ? 'AI 塔罗分析' : '随机生成文字' },
    { label: '评估条目数', value: stats.total },
  ].map(function (s) {
    return '<div class="stat-card"><div class="stat-value">' + s.value + '</div><div class="stat-label">' + s.label + '</div></div>';
  }).join('');

  var barsHtml = '';
  var maxCount = Math.max.apply(null, stats.distribution.concat([1]));
  [1, 2, 3, 4, 5].forEach(function (star) {
    var count = stats.distribution[star - 1] || 0;
    var pct = maxCount > 0 ? (count / maxCount * 100) : 0;
    barsHtml += '<div class="distribution-bar">' +
      '<span class="bar-label">' + star + ' 分</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="bar-count">' + count + ' 次</span>' +
      '</div>';
  });
  document.getElementById('distributionBars').innerHTML = barsHtml;

  var revealText = userGroup === 'tarot'
    ? '你被分配到了 <strong style="color:#ce93d8">「AI 塔罗分析」</strong> 组。你看到的描述被标注为"AI塔罗性格分析"，这可能会让你下意识觉得它更像回事。'
    : '你被分配到了 <strong style="color:#90caf9">「随机生成文字」</strong> 组。你看到的描述被标注为"随机生成"，这可能会让你降低对它的期待。';
  document.getElementById('revealText').innerHTML = revealText;

  var feedbackHtml = '';
  if (stats.avgRating >= 4) {
    feedbackHtml = '<h3><i class="ti ti-bulb"></i> 巴纳姆指数：高</h3><p>你对这些模糊描述给出了较高评分。这可能说明你比较容易被笼统的、放谁身上都对的句子打中。这完全正常——1948年Forer实验里全班平均打了4.26分。人们天然倾向于在模糊描述中找到自己。</p>';
  } else if (stats.avgRating >= 3) {
    feedbackHtml = '<h3><i class="ti ti-bulb"></i> 巴纳姆指数：中</h3><p>你的评分在中位水平，对这些模糊描述保持了一定的距离。你比大多数人稍微清醒一点，但也不完全免疫。</p>';
  } else {
    feedbackHtml = '<h3><i class="ti ti-bulb"></i> 巴纳姆指数：低</h3><p>你对这些模糊描述给了低分，说明你比较难被笼统的语句打动。你可能是那种「说具体点」的人。不过也别太得意，换成你真的花了钱的塔罗师，说不定你也会打高分——因为还有「沉没成本」在起作用。</p>';
  }
  document.getElementById('feedbackBox').innerHTML = feedbackHtml;

  submitToBackend();
  fetchAggregateData(stats);
}

function submitToBackend() {
  var body = { userGroup: userGroup };
  for (var i = 0; i < 5; i++) {
    body['rating' + (i + 1)] = ratings[i];
  }
  var xhr = new XMLHttpRequest();
  xhr.open('POST', API_BASE + '/barnum-test/submit', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 5000;
  xhr.onerror = function () {};
  xhr.ontimeout = function () {};
  xhr.send(JSON.stringify(body));
}

function fetchAggregateData(personalStats) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/barnum-test/stats', true);
  xhr.timeout = 5000;
  xhr.onload = function () {
    if (xhr.status === 200) {
      try {
        var raw = JSON.parse(xhr.responseText);
        var data = raw && raw.data ? raw.data : raw;
        renderAggregate(data, personalStats);
      } catch (e) {
        showAggregateFallback(personalStats);
      }
    } else {
      showAggregateFallback(personalStats);
    }
  };
  xhr.onerror = function () {
    showAggregateFallback(personalStats);
  };
  xhr.ontimeout = function () {
    showAggregateFallback(personalStats);
  };
  xhr.send();
}

function renderAggregate(data, personalStats) {
  if (!data || data.tarotCount === undefined) {
    showAggregateFallback(personalStats);
    return;
  }

  document.getElementById('aggregateCompare').innerHTML =
    '<div class="compare-card tarot">' +
      '<div class="compare-label"><i class="ti ti-crystal-ball"></i> AI 塔罗分析 组</div>' +
      '<div class="compare-value">' + data.tarotAvg.toFixed(2) + ' / 5</div>' +
      '<div class="compare-sub">' + data.tarotCount + ' 人参与</div>' +
    '</div>' +
    '<div class="compare-card random">' +
      '<div class="compare-label"><i class="ti ti-dice-5"></i> 随机生成文字 组</div>' +
      '<div class="compare-value">' + data.randomAvg.toFixed(2) + ' / 5</div>' +
      '<div class="compare-sub">' + data.randomCount + ' 人参与</div>' +
    '</div>';

  if (data.diff > 0.05) {
    document.getElementById('diffBanner').innerHTML =
      '<div class="diff-value">「塔罗」组评分高出 ' + data.diff.toFixed(2) + ' 分（+' + data.diffPercent + '%）</div>' +
      '<div class="diff-label">同样的文字，挂上"塔罗"标签后，人们就觉得更准了——这就是巴纳姆效应在起作用。</div>';
  } else if (data.diff < -0.05) {
    document.getElementById('diffBanner').innerHTML =
      '<div class="diff-value">「随机」组评分反超 ' + Math.abs(data.diff).toFixed(2) + ' 分</div>' +
      '<div class="diff-label">目前数据还没有体现出明显的巴纳姆效应。可能参与者越来越聪明了，也可能是样本还不够。</div>';
  } else {
    document.getElementById('diffBanner').innerHTML =
      '<div class="diff-value">两组评分基本持平（差值 ' + data.diff.toFixed(2) + '）</div>' +
      '<div class="diff-label">目前数据显示标签影响不大。但这可能只是暂时的——等更多人参与后，差距通常会拉大。</div>';
  }

  var aggDistHtml = '<h3 style="color:#ffd700; margin-top: 24px; margin-bottom: 12px;">两组评分分布对比</h3>';
  var maxCount = 1;
  if (data.tarotDistribution && data.randomDistribution) {
    for (var i = 0; i < 5; i++) {
      maxCount = Math.max(maxCount, (data.tarotDistribution[i] || 0), (data.randomDistribution[i] || 0));
    }
    [1, 2, 3, 4, 5].forEach(function (star) {
      var tCount = data.tarotDistribution[star - 1] || 0;
      var rCount = data.randomDistribution[star - 1] || 0;
      var tPct = maxCount > 0 ? (tCount / maxCount * 100) : 0;
      var rPct = maxCount > 0 ? (rCount / maxCount * 100) : 0;
      aggDistHtml += '<div style="margin-bottom:8px;">' +
        '<span style="display:inline-block;width:50px;text-align:right;color:#a0a0a0;font-size:0.85rem;">' + star + ' 分</span>' +
        '<span style="display:inline-block;width:45%;margin-left:8px;height:18px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;vertical-align:middle;">' +
          '<span style="display:inline-block;height:100%;background:linear-gradient(90deg, rgba(156,39,176,0.7), rgba(156,39,176,0.3));border-radius:4px;width:' + tPct + '%;" title="塔罗组: ' + tCount + '"></span>' +
        '</span>' +
        '<span style="display:inline-block;width:45%;margin-left:4px;height:18px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;vertical-align:middle;">' +
          '<span style="display:inline-block;height:100%;background:linear-gradient(90deg, rgba(100,180,255,0.7), rgba(100,180,255,0.3));border-radius:4px;width:' + rPct + '%;" title="随机组: ' + rCount + '"></span>' +
        '</span>' +
        '<span style="display:inline-block;margin-left:8px;font-size:0.75rem;color:#888;"><span style="color:#ce93d8;">塔罗 ' + tCount + '</span> / <span style="color:#90caf9;">随机 ' + rCount + '</span></span>' +
        '</div>';
    });
  }
  document.getElementById('aggregateDistributions').innerHTML = aggDistHtml;

  document.getElementById('aggregateSection').classList.remove('hidden');
}

function showAggregateFallback(personalStats) {
  document.getElementById('aggregateCompare').innerHTML =
    '<div class="compare-card tarot">' +
      '<div class="compare-label"><i class="ti ti-crystal-ball"></i> AI 塔罗分析 组</div>' +
      '<div class="compare-value">--</div>' +
      '<div class="compare-sub">数据加载中</div>' +
    '</div>' +
    '<div class="compare-card random">' +
      '<div class="compare-label"><i class="ti ti-dice-5"></i> 随机生成文字 组</div>' +
      '<div class="compare-value">--</div>' +
      '<div class="compare-sub">请刷新页面重试</div>' +
    '</div>';
  document.getElementById('diffBanner').innerHTML =
    '<div class="diff-label">累计数据暂时无法获取（API 未就绪或网络问题）。请稍后重试。你个人的测试结果已保存到上方。</div>';
  document.getElementById('aggregateDistributions').innerHTML = '';
  document.getElementById('aggregateSection').classList.remove('hidden');
}

function resetTest() {
  testStarted = false;
  userGroup = null;
  statements = [];
  currentIndex = 0;
  ratings = [null, null, null, null, null];
  hideEl('testSection');
  hideEl('resultSection');
  showEl('introSection');
}

(function init() {
  var buttons = document.querySelectorAll('#ratingButtons .rating-btn');
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rating = parseInt(this.getAttribute('data-rating'));
      selectRating(rating);
    });
  });
})();
