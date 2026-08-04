(function() {
  const data = typeof IPv8LabData !== 'undefined' ? IPv8LabData : null;
  const engine = typeof IPv8LabEngine !== 'undefined' ? IPv8LabEngine : null;

  if (!data || !engine) {
    return;
  }

  let currentStack = 'ipv4-app';

  // ── 行为埋点（通用埋点 SDK，见 components/track.js） ──
  // 事件清单：
  //   session_start (trackOnce) 记录一次会话及初始协议栈，回答「多少人体验、默认栈分布」
  //   stack_change  用户切换协议栈，回答「用户倾向探索哪个栈的实现」
  //   toggle_change 用户切换连接流程中的开关，回答「哪些配置最常被打开」
  //   session_hidden (force) 切后台快照，回答「会话时长分布」
  //   session_end    (force) 真正离页 pagehide，回答「单次会话时长」
  // 仅低频收尾事件镜像到 umami。
  if (typeof window !== 'undefined') {
    window.NF_TRACK_UMAMI_MIRROR = ['session_end'];
  }

  /** 安全调用 NFTrack；SDK 未加载、被拦截或抛错都不应影响页面。 */
  function nfTrack(name, props, opts) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(name, props, opts);
      }
    } catch (e) {
      // 埋点绝不能影响主流程
    }
  }

  /** 同名事件整个会话只记一次（对应 SDK 的 trackOnce）。 */
  function nfTrackOnce(name, props) {
    try {
      if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
        window.NFTrack.trackOnce(name, props);
      }
    } catch (e) {
      // 埋点绝不能影响主流程
    }
  }

  function registerTrackLeaveHandler() {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        nfTrack('session_hidden', { reason: 'hidden', stack: currentStack }, { force: true });
      }
    });
    window.addEventListener('pagehide', function () {
      nfTrack('session_end', { reason: 'leave', stack: currentStack }, { force: true });
    });
  }

  function init() {
    renderFacts();
    renderProtocols();
    renderSources();
    renderMigrationSliders();
    bindEvents();
    updateAddressLab();
    updateFlow();
    updateMigration();
  }

  function bindEvents() {
    document.getElementById('ipv4Input').addEventListener('input', updateAddressLab);
    document.getElementById('asnInput').addEventListener('input', updateAddressLab);

    ['dhcpToggle', 'tokenToggle', 'dnsToggle', 'whoisToggle', 'literalIpToggle']
      .forEach(function(id) {
        document.getElementById(id).addEventListener('change', function() {
          nfTrack('toggle_change', { id: id, on: document.getElementById(id).checked });
          updateFlow();
        });
      });

    document.querySelectorAll('.stack-btn').forEach(function(button) {
      button.addEventListener('click', function() {
        currentStack = button.dataset.stack;
        document.querySelectorAll('.stack-btn').forEach(function(item) {
          item.classList.toggle('active', item === button);
        });
        nfTrack('stack_change', { stack: currentStack });
        updateFlow();
      });
    });
  }

  function renderFacts() {
    const html = data.facts.map(function(item) {
      return `
        <article class="fact-item">
          <div class="label">${item.label}</div>
          <div class="value">${item.value}</div>
          <div class="sub">${item.sub}</div>
          <a href="${item.sourceUrl}" target="_blank" rel="noopener noreferrer">${item.sourceLabel}</a>
        </article>
      `;
    }).join('');
    document.getElementById('factGrid').innerHTML = html;
  }

  function renderProtocols() {
    const html = data.protocolCards.map(function(item) {
      return `
        <article class="proto-item">
          <h3>${item.name}</h3>
          <div class="proto-meta">${item.bits} · ${item.notation}</div>
          <code>${item.example}</code>
          <p>${item.focus}</p>
        </article>
      `;
    }).join('');
    document.getElementById('protocolGrid').innerHTML = html;
  }

  function renderSources() {
    const html = data.sourceList.map(function(item) {
      return `
        <li>
          <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
        </li>
      `;
    }).join('');
    document.getElementById('sourceList').innerHTML = html;
  }

  function renderMigrationSliders() {
    const html = data.migrationSliders.map(function(item) {
      return `
        <label class="slider-item">
          <div class="slider-label">
            <span>${item.label}</span>
            <span class="slider-value" id="${item.id}Value">${item.value}</span>
          </div>
          <input
            type="range"
            id="${item.id}"
            min="${item.min}"
            max="${item.max}"
            value="${item.value}"
          >
        </label>
      `;
    }).join('');

    const panel = document.getElementById('migrationSliderPanel');
    panel.innerHTML = html;

    data.migrationSliders.forEach(function(item) {
      document.getElementById(item.id).addEventListener('input', updateMigration);
    });
  }

  function updateAddressLab() {
    const ipv4Input = document.getElementById('ipv4Input').value;
    const asnInput = document.getElementById('asnInput').value;
    const insight = document.getElementById('addressInsight');

    try {
      const prefix = engine.asnToPrefix(asnInput);
      const subset = engine.buildIpv4SubsetAddress(ipv4Input);
      const ipv8 = engine.buildIpv8Address(asnInput, ipv4Input);
      const asnDot = engine.buildAsnDotNotation(asnInput, ipv4Input);

      document.getElementById('asnPrefixOutput').textContent = prefix;
      document.getElementById('ipv4SubsetOutput').textContent = subset;
      document.getElementById('ipv8Output').textContent = ipv8;
      document.getElementById('asnDotOutput').textContent = asnDot;

      insight.innerHTML =
        '这组输入会被草案写成 <code>' + ipv8 + '</code>。' +
        ' 你可以把它理解成“先找 ASN，再找主机”。' +
        ' 当 ASN 前缀是 <code>0.0.0.0</code> 时，草案把它当作 IPv4 子集处理。';
    } catch (error) {
      document.getElementById('asnPrefixOutput').textContent = '输入有误';
      document.getElementById('ipv4SubsetOutput').textContent = '输入有误';
      document.getElementById('ipv8Output').textContent = '输入有误';
      document.getElementById('asnDotOutput').textContent = '输入有误';
      insight.textContent = error.message;
    }
  }

  function updateFlow() {
    const result = engine.evaluateConnectionFlow({
      hasDhcpLease: document.getElementById('dhcpToggle').checked,
      hasToken: document.getElementById('tokenToggle').checked,
      hasDnsLookup: document.getElementById('dnsToggle').checked,
      hasWhoisRoute: document.getElementById('whoisToggle').checked,
      usesLiteralIp: document.getElementById('literalIpToggle').checked,
      clientStack: currentStack
    });

    const html = result.steps.map(function(step, index) {
      return `
        <div class="flow-item ${step.passed ? 'ok' : 'fail'}">
          <div class="flow-icon">${step.passed ? 'OK' : 'X'}</div>
          <div>
            <div class="flow-title">${index + 1}. ${step.title}</div>
            <div class="flow-detail">${step.detail}</div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('flowList').innerHTML = html;
    document.getElementById('flowSummary').textContent = result.summary;
  }

  function getMigrationValues() {
    const values = {};
    data.migrationSliders.forEach(function(item) {
      const value = Number(document.getElementById(item.id).value);
      values[item.id] = value;
      document.getElementById(item.id + 'Value').textContent = value;
    });
    return values;
  }

  function updateMigration() {
    const result = engine.calculateMigrationScore(getMigrationValues());
    document.getElementById('attractionBar').style.width = result.attraction + '%';
    document.getElementById('frictionBar').style.width = result.friction + '%';
    document.getElementById('attractionValue').textContent = result.attraction + ' / 100';
    document.getElementById('frictionValue').textContent = result.friction + ' / 100';
    document.getElementById('migrationTitle').textContent = result.title;
    document.getElementById('migrationDesc').textContent =
      result.description + ' 当前差值：' + result.delta + '。';

    const verdict = document.getElementById('migrationVerdict');
    verdict.classList.remove('attractive', 'resistant', 'mixed');
    verdict.classList.add(result.verdict);
  }

  init();
  nfTrackOnce('session_start', { stack: currentStack });
  registerTrackLeaveHandler();
})();
