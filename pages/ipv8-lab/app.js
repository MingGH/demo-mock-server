(function() {
  const data = typeof IPv8LabData !== 'undefined' ? IPv8LabData : null;
  const engine = typeof IPv8LabEngine !== 'undefined' ? IPv8LabEngine : null;

  if (!data || !engine) {
    return;
  }

  let currentStack = 'ipv4-app';

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
        document.getElementById(id).addEventListener('change', updateFlow);
      });

    document.querySelectorAll('.stack-btn').forEach(function(button) {
      button.addEventListener('click', function() {
        currentStack = button.dataset.stack;
        document.querySelectorAll('.stack-btn').forEach(function(item) {
          item.classList.toggle('active', item === button);
        });
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
})();
