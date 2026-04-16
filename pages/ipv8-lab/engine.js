(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.IPv8LabEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseIpv4(input) {
    const text = String(input || '').trim();
    const parts = text.split('.');
    if (parts.length !== 4) {
      throw new Error('IPv4 地址应包含 4 段');
    }

    const nums = parts.map(function(part) {
      if (!/^\d+$/.test(part)) {
        throw new Error('IPv4 每一段都必须是 0-255 的整数');
      }
      const value = Number(part);
      if (value < 0 || value > 255) {
        throw new Error('IPv4 每一段都必须在 0-255 之间');
      }
      return value;
    });

    return nums.join('.');
  }

  function parseAsn(input) {
    const text = String(input == null ? '' : input).trim();
    if (!/^\d+$/.test(text)) {
      throw new Error('ASN 必须是非负整数');
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > 4294967295) {
      throw new Error('ASN 必须落在 0 到 4294967295 之间');
    }
    return Math.floor(value);
  }

  function asnToPrefix(asn) {
    const value = parseAsn(asn);
    const a = Math.floor(value / 16777216) % 256;
    const b = Math.floor(value / 65536) % 256;
    const c = Math.floor(value / 256) % 256;
    const d = value % 256;
    return [a, b, c, d].join('.');
  }

  function buildIpv8Address(asn, ipv4) {
    return asnToPrefix(asn) + '.' + parseIpv4(ipv4);
  }

  function buildIpv4SubsetAddress(ipv4) {
    return '0.0.0.0.' + parseIpv4(ipv4);
  }

  function buildAsnDotNotation(asn, ipv4) {
    return parseAsn(asn) + '.' + parseIpv4(ipv4);
  }

  function compareAddressSpaces() {
    return {
      ipv4: {
        bits: 32,
        total: Math.pow(2, 32)
      },
      ipv6: {
        bits: 128,
        total: Math.pow(2, 64) * Math.pow(2, 64)
      },
      ipv8Draft: {
        bits: 64,
        total: Math.pow(2, 64),
        perAsnHosts: Math.pow(2, 32)
      }
    };
  }

  function evaluateConnectionFlow(options) {
    const settings = Object.assign({
      hasDhcpLease: true,
      hasToken: true,
      hasDnsLookup: true,
      hasWhoisRoute: true,
      usesLiteralIp: false,
      clientStack: 'ipv4-app'
    }, options || {});

    const steps = [];

    function pushStep(id, title, passed, detail) {
      steps.push({
        id: id,
        title: title,
        passed: passed,
        detail: detail
      });
      return passed;
    }

    if (!pushStep(
      'dhcp8',
      'DHCP8 下发网络服务',
      settings.hasDhcpLease,
      settings.hasDhcpLease
        ? '设备拿到地址、网关和配套服务入口。'
        : '没有 DHCP8 租约，设备连基础服务入口都拿不到。'
    )) {
      return summarizeFlow(steps, 'blocked', '卡在 DHCP8：设备还没进入草案设想的受管网络。');
    }

    if (!pushStep(
      'oauth8',
      'OAuth8 / JWT 本地授权缓存',
      settings.hasToken,
      settings.hasToken
        ? '设备带着可验证的令牌进入网络。'
        : '没有本地可验证令牌，草案里的“受管元素”授权链断了。'
    )) {
      return summarizeFlow(steps, 'blocked', '卡在授权：草案强调每个可管理元素都要过本地令牌校验。');
    }

    const dnsPass = !settings.usesLiteralIp && settings.hasDnsLookup;
    if (!pushStep(
      'dns8',
      'DNS8 查询',
      dnsPass,
      dnsPass
        ? '域名已经做过 DNS8 查询，出站连接有了前置记录。'
        : settings.usesLiteralIp
          ? '你直接连硬编码 IP，没有 DNS8 查询，草案会把它视为可疑连接。'
          : '没有 DNS8 查询记录，后续无法创建 XLATE8 状态。'
    )) {
      return summarizeFlow(steps, 'blocked', '卡在 DNS8：这就是草案里最抓眼球的设定之一。');
    }

    if (!pushStep(
      'whois8',
      'WHOIS8 活跃路由验证',
      settings.hasWhoisRoute,
      settings.hasWhoisRoute
        ? '目标前缀在草案设想里能通过活跃路由验证。'
        : '目标路由没通过 WHOIS8 验证，出口会直接丢包。'
    )) {
      return summarizeFlow(steps, 'blocked', '卡在 WHOIS8：出口验证失败，连接直接拦下。');
    }

    pushStep(
      'xlate8',
      'XLATE8 建立状态',
      true,
      settings.clientStack === 'ipv4-app'
        ? '老应用继续用 IPv4 习惯，底层由 XLATE8 帮它过渡。'
        : '原生 IPv8 应用直接进入新地址和新路由语义。'
    );

    return summarizeFlow(steps, 'allowed', '当前参数下，这条连接会被草案设想的出口策略放行。');
  }

  function summarizeFlow(steps, status, summary) {
    return {
      steps: steps,
      status: status,
      summary: summary
    };
  }

  function calculateMigrationScore(inputs) {
    const values = Object.assign({}, inputs || {});
    const legacyDependence = clamp(Number(values.legacyDependence || 0), 0, 100);
    const compatibilityDesire = clamp(Number(values.compatibilityDesire || 0), 0, 100);
    const fragmentationPain = clamp(Number(values.fragmentationPain || 0), 0, 100);
    const securityTolerance = clamp(Number(values.securityTolerance || 0), 0, 100);
    const ipv6Satisfaction = clamp(Number(values.ipv6Satisfaction || 0), 0, 100);
    const changeAversion = clamp(Number(values.changeAversion || 0), 0, 100);

    const attraction = Math.round(
      legacyDependence * 0.24 +
      compatibilityDesire * 0.23 +
      fragmentationPain * 0.21 +
      securityTolerance * 0.14 +
      (100 - ipv6Satisfaction) * 0.18
    );

    const friction = Math.round(
      changeAversion * 0.36 +
      ipv6Satisfaction * 0.24 +
      (100 - securityTolerance) * 0.2 +
      (100 - fragmentationPain) * 0.08 +
      (100 - legacyDependence) * 0.12
    );

    const delta = attraction - friction;
    let verdict = 'mixed';
    let title = '这套设想会让人争起来';
    let description = '兼容诱惑很强，现实阻力也不小。看起来顺手，真正落地会牵动很多现网规则。';

    if (delta >= 12) {
      verdict = 'attractive';
      title = '这套设想很容易让运维心动';
      description = '你手上老系统多、兼容压力大、还嫌现网碎片化，这种“延续 IPv4 手感”的方案会很有吸引力。';
    } else if (delta <= -12) {
      verdict = 'resistant';
      title = '这更像纸面方案，落地阻力很大';
      description = '组织改网意愿低，现有 IPv6 也没到非换不可，草案里的一整套新服务会让人先皱眉。';
    }

    return {
      attraction: attraction,
      friction: friction,
      delta: delta,
      verdict: verdict,
      title: title,
      description: description
    };
  }

  function formatNumber(value) {
    if (value >= 1e15) {
      return value.toExponential(2);
    }
    return Math.round(value).toLocaleString();
  }

  return {
    parseIpv4: parseIpv4,
    parseAsn: parseAsn,
    asnToPrefix: asnToPrefix,
    buildIpv8Address: buildIpv8Address,
    buildIpv4SubsetAddress: buildIpv4SubsetAddress,
    buildAsnDotNotation: buildAsnDotNotation,
    compareAddressSpaces: compareAddressSpaces,
    evaluateConnectionFlow: evaluateConnectionFlow,
    calculateMigrationScore: calculateMigrationScore,
    formatNumber: formatNumber
  };
});
