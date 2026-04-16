const assert = require('node:assert/strict');
const lab = require('./logic.js');

function testBuildPixelUrl() {
  const url = lab.buildPixelUrl('https://demo.test', {
    campaignId: 'spring-demo',
    uid: 'user-88',
    recipient: 'alice@example.com',
    mailbox: 'gmail',
    mode: 'gmail-proxy',
    pixelLabel: 'pixel'
  });

  assert.ok(url.includes('/email-tracking/pixel.gif'));
  assert.ok(url.includes('uid=user-88'));
  assert.ok(url.includes('campaign=spring-demo'));
  assert.ok(url.includes('recipient=alice%40example.com'));
  assert.ok(url.includes('mode=gmail-proxy'));
}

function testBuildEmailHtml() {
  const html = lab.buildEmailHtml({
    sender: 'growth@example.com',
    recipient: 'bob@example.com',
    subject: '活动提醒'
  }, 'https://demo.test/email-tracking/pixel.gif?uid=1');

  assert.ok(html.includes('<img src="https://demo.test/email-tracking/pixel.gif?uid=1"'));
  assert.ok(html.includes('width="1"'));
  assert.ok(html.includes('height="1"'));
}

function testSummarizeStats() {
  const summary = lab.summarizeStats({
    summary: {
      openEvents: 4,
      uniqueRecipients: 3,
      directEvents: 1,
      proxyEvents: 3,
      prefetchLikeEvents: 2,
      latestOpenedAtText: '2026-04-16 12:00:00'
    },
    recipients: [
      { recipient: 'a@example.com', openCount: 2, hasDirectOpen: false, hasPrefetchLikeOpen: false },
      { recipient: 'b@example.com', openCount: 1, hasDirectOpen: true, hasPrefetchLikeOpen: false },
      { recipient: 'c@example.com', openCount: 1, hasDirectOpen: false, hasPrefetchLikeOpen: true }
    ],
    events: [
      { ip: '66.249.84.139', location: 'Google 图片代理出口' },
      { ip: '127.0.0.1', location: '开发机本地' },
      { ip: '17.58.102.14', location: 'Apple Mail 隐私代理' }
    ],
    modeBreakdown: []
  });

  assert.equal(summary.openEvents, 4);
  assert.equal(summary.directRecipientCount, 1);
  assert.equal(summary.proxyOnlyRecipientCount, 2);
  assert.equal(summary.cautiousRecipientCount, 1);
  assert.equal(summary.repeatedRecipientCount, 1);
  assert.equal(summary.uniqueIpCount, 3);
}

function testInterpretRecipient() {
  assert.equal(
    lab.interpretRecipient({ hasDirectOpen: true, hasPrefetchLikeOpen: true }),
    '先出现系统预取，后面又出现了更接近真人的直连打开。'
  );
  assert.equal(
    lab.interpretRecipient({ hasDirectOpen: false, hasPrefetchLikeOpen: true }),
    '更像是隐私保护或安全扫描触发，请别直接当成人已阅读。'
  );
}

function testBatchScenarioSummary() {
  const summary = lab.getBatchScenarioSummary();
  assert.equal(summary.events, 8);
  assert.equal(summary.recipients, 6);
  assert.equal(summary.directEvents, 2);
  assert.equal(summary.proxyEvents, 6);
  assert.equal(summary.prefetchLikeEvents, 3);
}

function run() {
  testBuildPixelUrl();
  testBuildEmailHtml();
  testSummarizeStats();
  testInterpretRecipient();
  testBatchScenarioSummary();
  console.log('email-tracking-pixel.test.js: all tests passed');
}

run();
