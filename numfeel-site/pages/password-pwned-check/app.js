/* ============================================================
   密码泄露自查 —— DOM 绑定与交互（依赖 engine.js / Chart.js）
   ES5 风格。逻辑计算全在 engine.js，本文件只做绑定、请求、渲染。
   ============================================================ */
(function () {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja/pwned';

  var pwdInput = document.getElementById('pwdInput');
  var togglePwd = document.getElementById('togglePwd');
  var resultBox = document.getElementById('resultBox');
  var resultVerdict = document.getElementById('resultVerdict');
  var resultDetail = document.getElementById('resultDetail');
  var presetRow = document.getElementById('presetRow');

  var flowHash = document.getElementById('flowHash');
  var flowPrefix = document.getElementById('flowPrefix');
  var flowSent = document.getElementById('flowSent');
  var flowReturned = document.getElementById('flowReturned');
  var flowMatch = document.getElementById('flowMatch');
  var flowSteps = document.querySelectorAll('.flow-step');

  /* ---------- 显示/隐藏密码 ---------- */
  togglePwd.addEventListener('click', function () {
    var show = pwdInput.type === 'password';
    pwdInput.type = show ? 'text' : 'password';
    togglePwd.innerHTML = show ? '<i class="ti ti-eye-off"></i>' : '<i class="ti ti-eye"></i>';
  });

  /* ---------- 预设卡片 ---------- */
  PRESET_PASSWORDS.forEach(function (p) {
    var card = document.createElement('div');
    card.className = 'preset-card';
    card.innerHTML = '<div class="pv">' + escapeHtml(p.value) + '</div>' +
                     '<div class="pl">' + p.label + '</div>' +
                     '<div class="pn">' + p.note + '</div>';
    card.addEventListener('click', function () {
      pwdInput.value = p.value;
      runCheck(p.value);
    });
    presetRow.appendChild(card);
  });

  /* ---------- 输入防抖 ---------- */
  var debounceTimer = null;
  pwdInput.addEventListener('input', function () {
    var val = pwdInput.value;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!val) { resultBox.style.display = 'none'; resetFlow(); return; }
    debounceTimer = setTimeout(function () { runCheck(val); }, 450);
  });

  /* ---------- 核心：查询一个密码 ---------- */
  var requestSeq = 0;
  function runCheck(password) {
    if (!password) return;
    var seq = ++requestSeq;

    // 本地先算哈希、切前缀（步骤 ①②）
    var hash = sha1Hex(password);
    var parts = splitHash(hash);

    setFlow(1, true); flowHash.textContent = maskHash(hash);
    setFlow(2, true); flowPrefix.textContent = parts.prefix + ' + ' + parts.suffix.length + ' 位后缀(本地)';
    setFlow(3, true); flowSent.textContent = parts.prefix + '  （只有这 5 位发出去）';

    showLoading();

    fetchRange(parts.prefix).then(function (rangeText) {
      if (seq !== requestSeq) return; // 已被更晚的查询取代

      var lineCount = rangeText ? rangeText.split(/\r?\n/).filter(Boolean).length : 0;
      var count = countInRange(rangeText, parts.suffix);

      setFlow(4, true); flowReturned.textContent = '返回 ' + lineCount + ' 条同前缀后缀（本地比对，不暴露你是哪一条）';
      setFlow(5, true); flowMatch.textContent = count > 0 ? ('命中！出现 ' + count.toLocaleString() + ' 次') : '未命中';

      renderResult(count);
    }).catch(function (err) {
      if (seq !== requestSeq) return;
      showError(err);
    });
  }

  /* ---------- 请求后端代理（k-匿名 range） ---------- */
  function fetchRange(prefix) {
    return fetch(API_BASE + '/range/' + encodeURIComponent(prefix), {
      headers: { 'Accept': 'application/json' }
    }).then(function (resp) {
      if (resp.status === 429) throw new Error('请求过于频繁，请稍后再试');
      if (!resp.ok) throw new Error('查询服务暂不可用（' + resp.status + '）');
      return resp.json();
    }).then(function (json) {
      if (json && json.status === 200) {
        return (json.data && json.data.range) || '';
      }
      throw new Error((json && json.message) || '查询失败');
    });
  }

  /* ---------- 渲染结果 ---------- */
  function showLoading() {
    resultBox.style.display = 'block';
    resultBox.className = 'result-box loading';
    resultVerdict.innerHTML = '<i class="ti ti-loader-2"></i> 比对中...';
    resultDetail.textContent = '只发送了哈希前 5 位';
  }

  function renderResult(count) {
    resultBox.style.display = 'block';
    if (count > 0) {
      resultBox.className = 'result-box pwned';
      resultVerdict.innerHTML = '<i class="ti ti-alert-octagon"></i> 已泄露';
      resultDetail.innerHTML = '这个密码在已知泄露库中出现了 <span class="big-num">' +
        count.toLocaleString() + '</span> 次。它早已躺在黑客字典里，字典攻击几乎瞬间命中——别再用了。';
    } else {
      resultBox.className = 'result-box safe';
      resultVerdict.innerHTML = '<i class="ti ti-shield-check"></i> 暂未出现在已知泄露库';
      resultDetail.innerHTML = '没在 HIBP 的泄露哈希集中查到。这是好事，但不代表绝对安全——只要别复用、够长够随机即可。';
    }
  }

  function showError(err) {
    resultBox.style.display = 'block';
    resultBox.className = 'result-box loading';
    resultVerdict.innerHTML = '<i class="ti ti-cloud-off"></i> 查询失败';
    resultDetail.textContent = err && err.message ? err.message : '网络错误，请稍后再试';
  }

  /* ---------- 流程步骤高亮 ---------- */
  function setFlow(step, active) {
    var el = flowSteps[step - 1];
    if (el) el.classList.toggle('active', !!active);
  }
  function resetFlow() {
    for (var i = 0; i < flowSteps.length; i++) flowSteps[i].classList.remove('active');
    flowHash.textContent = '——';
    flowPrefix.textContent = '—————';
    flowSent.textContent = '—————';
    flowReturned.textContent = '——';
    flowMatch.textContent = '——';
  }

  /* ---------- 工具 ---------- */
  function maskHash(hash) {
    // 完整哈希也只在本地展示前后片段，强调"它没出去"
    return hash.substring(0, 10) + '…' + hash.substring(30) + '（完整哈希留在本地）';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 体量图表与里程碑 ---------- */
  function renderMilestones() {
    var list = document.getElementById('milestoneList');
    WORDLIST_MILESTONES.forEach(function (m) {
      var mult = timesWorldPopulation(m.count);
      var div = document.createElement('div');
      div.className = 'milestone-item';
      div.innerHTML = '<div class="my">' + m.year + ' · ' + m.name + '</div>' +
                      '<div class="mc">' + formatCount(m.count) + ' 条</div>' +
                      '<div class="mn">≈ 全球人口的 ' + mult.toFixed(mult < 1 ? 2 : 1) + ' 倍</div>';
      list.appendChild(div);
    });

    var ctx = document.getElementById('milestoneChart');
    if (!ctx || typeof Chart === 'undefined') return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: WORDLIST_MILESTONES.map(function (m) { return m.year + ' ' + m.name; }),
        datasets: [{
          label: '密码条目数（对数刻度）',
          data: WORDLIST_MILESTONES.map(function (m) { return m.count; }),
          backgroundColor: ['#90caf9', '#81c784', '#fbbf24', '#ff6b6b'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) { return formatCount(c.parsed.y) + ' 条'; }
            }
          }
        },
        scales: {
          y: {
            type: 'logarithmic',
            ticks: {
              color: '#94a3b8',
              callback: function (v) { return formatCount(v); }
            },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          x: {
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  resetFlow();
  renderMilestones();
})();
