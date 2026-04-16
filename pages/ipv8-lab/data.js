const IPv8LabData = {
  facts: [
    {
      label: '草案状态',
      value: 'Active Internet-Draft',
      sub: 'draft-thain-ipv8-01 · 2026-04-15',
      sourceLabel: 'IETF Datatracker',
      sourceUrl: 'https://datatracker.ietf.org/doc/draft-thain-ipv8-01/'
    },
    {
      label: '地址空间',
      value: '2^64',
      sub: '按 draft-thain-ipv8-01 的文案展示',
      sourceLabel: 'IPv8 draft 3.2',
      sourceUrl: 'https://datatracker.ietf.org/doc/draft-thain-ipv8-01/'
    },
    {
      label: '每个 ASN 主机地址',
      value: '4,294,967,296',
      sub: '也就是 2^32 个 host 地址',
      sourceLabel: 'IPv8 draft 1.6',
      sourceUrl: 'https://datatracker.ietf.org/doc/draft-thain-ipv8-01/'
    },
    {
      label: '2024 年 IPv4 BGP 表',
      value: '961,178',
      sub: 'APNIC 周报中的 2024-09-28 样本',
      sourceLabel: 'APNIC Routing Table Report',
      sourceUrl: 'https://mail-archive.com/nanog@nanog.org/msg125884.html'
    }
  ],

  protocolCards: [
    {
      name: 'IPv4',
      bits: '32 bit',
      notation: 'n.n.n.n',
      example: '192.168.5.1',
      focus: '地址短，历史包袱少，空间早就不够。'
    },
    {
      name: 'IPv6',
      bits: '128 bit',
      notation: 'hhhh:hhhh:hhhh:hhhh:hhhh:hhhh:hhhh:hhhh',
      example: '2001:0db8:0000:0000:0000:8a2e:0370:7334',
      focus: '空间巨大，部署多年，现实世界还在慢慢推进。'
    },
    {
      name: 'IPv8 草案',
      bits: '64 bit',
      notation: 'r.r.r.r.n.n.n.n',
      example: '0.0.251.240.192.168.5.1',
      focus: '前 32 bit 放 ASN 前缀，后 32 bit 保留 IPv4 风格主机地址。'
    }
  ],

  migrationSliders: [
    {
      id: 'legacyDependence',
      label: '旧设备和老应用依赖 IPv4 的程度',
      min: 0,
      max: 100,
      value: 78
    },
    {
      id: 'compatibilityDesire',
      label: '你有多想保留 IPv4 运维习惯',
      min: 0,
      max: 100,
      value: 84
    },
    {
      id: 'fragmentationPain',
      label: '你对 DHCP、DNS、认证、日志各管一摊有多烦',
      min: 0,
      max: 100,
      value: 62
    },
    {
      id: 'securityTolerance',
      label: '你能接受每次出站都先验 DNS / 路由',
      min: 0,
      max: 100,
      value: 48
    },
    {
      id: 'ipv6Satisfaction',
      label: '你对当前 IPv6 方案的满意度',
      min: 0,
      max: 100,
      value: 52
    },
    {
      id: 'changeAversion',
      label: '你所在组织对“重写网络规则”的抗拒度',
      min: 0,
      max: 100,
      value: 75
    }
  ],

  sourceList: [
    {
      title: 'IETF Datatracker: draft-thain-ipv8-01',
      url: 'https://datatracker.ietf.org/doc/draft-thain-ipv8-01/'
    },
    {
      title: 'APNIC Labs: IPv6 Capable Rate by country',
      url: 'https://stats.labs.apnic.net/ipv6/'
    },
    {
      title: 'APNIC Weekly Global IPv4 Routing Table Report (2024-09-28 sample)',
      url: 'https://mail-archive.com/nanog@nanog.org/msg125884.html'
    },
    {
      title: 'CIDR Report snapshot (2024-12-20)',
      url: 'https://www.cidr-report.org/as6447/index.html'
    }
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = IPv8LabData;
}
