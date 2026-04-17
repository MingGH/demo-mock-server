const assert = require('node:assert/strict');
const lab = require('./logic.js');

function testPresetStats() {
  const stats = lab.getPresetStats();
  assert.equal(stats.total, 4);
  assert.equal(stats.metadata, 4);
  assert.equal(stats.whiteText, 2);
  assert.equal(stats.reviewTrail, 2);
  assert.equal(stats.pdfLayer, 2);
}

function testHighRiskPreset() {
  const preset = lab.getPresetById('sales-quote');
  const summary = lab.buildSummary(preset.config);
  assert.equal(summary.level, '高风险');
  assert.equal(summary.findings.length, 3);
  assert.ok(summary.score >= 60);
}

function testSanitizeConfig() {
  const preset = lab.getPresetById('ocr-contract');
  const cleaned = lab.sanitizeConfig(preset.config);
  const summary = lab.buildSummary(cleaned);

  assert.equal(cleaned.metadata.enabled, false);
  assert.equal(cleaned.whiteTextLayer.enabled, false);
  assert.equal(cleaned.trackChanges.enabled, false);
  assert.equal(cleaned.pdfLayer.enabled, false);
  assert.equal(summary.score, 0);
  assert.equal(summary.level, '低风险');
  assert.equal(summary.findings.length, 0);
}

function testPdfLayerRequiresPdf() {
  const config = lab.createInitialConfig();
  config.exportFormat = 'word';
  config.pdfLayer.enabled = true;
  config.pdfLayer.name = '内部层';
  config.pdfLayer.content = '不该出现';

  const findings = lab.buildFindings(config);
  assert.equal(findings.some(item => item.kind === 'pdfLayer'), false);
}

function run() {
  testPresetStats();
  testHighRiskPreset();
  testSanitizeConfig();
  testPdfLayerRequiresPdf();
  console.log('document-steganography.test.js: all tests passed');
}

run();
