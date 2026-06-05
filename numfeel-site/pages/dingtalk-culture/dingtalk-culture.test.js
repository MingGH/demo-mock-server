/**
 * 置身钉内：钉钉文化解剖图 - 基础测试
 * 用 node 直接运行
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

// ── 1. 文件存在性检查 ──
console.log('\n[文件检查]');
const htmlPath = path.join(__dirname, 'index.html');
const cssPath = path.join(__dirname, 'style.css');

assert(fs.existsSync(htmlPath), 'index.html 存在');
assert(fs.existsSync(cssPath), 'style.css 存在');

// ── 2. HTML 内容检查 ──
console.log('\n[HTML 内容]');
const html = fs.readFileSync(htmlPath, 'utf-8');

assert(html.includes('<!DOCTYPE html>'), '包含 DOCTYPE 声明');
assert(html.includes('lang="zh-CN"'), '设置了中文语言');
assert(html.includes('viewport'), '包含 viewport meta');
assert(html.includes('meta name="description"'), '包含 meta description');
assert(html.includes('components/header.js'), '引用了通用 header.js');
assert(html.includes('components/header.css'), '引用了通用 header.css');
assert(html.includes('style.css'), '引用了本地 style.css');

// 内容规范：不能有 AI 痕迹
assert(!html.includes('复制知乎'), '不包含「复制知乎」');
assert(!html.includes('复制回答'), '不包含「复制回答」');
assert(!html.includes('AI 生成'), '不包含「AI 生成」字样');
assert(!html.includes('由 AI 撰写'), '不包含「由 AI 撰写」字样');

// 核心内容检查
assert(html.includes('置身钉内'), '包含标题「置身钉内」');
assert(html.includes('ONE'), '包含 ONE 项目名称');
assert(html.includes('无招'), '包含「无招」');
assert(html.includes('卡片'), '包含「卡片」设计讨论');
assert(html.includes('敏捷'), '包含「敏捷」章节');
assert(html.includes('悖论'), '包含文化悖论讨论');
assert(html.includes('飞书'), '包含竞品飞书');

// 章节完整性
assert(html.includes('id="origin"'), '包含楔子章节');
assert(html.includes('id="one"'), '包含 ONE 项目章节');
assert(html.includes('id="design"'), '包含设计章节');
assert(html.includes('id="paradox"'), '包含悖论章节');
assert(html.includes('id="agile"'), '包含敏捷章节');
assert(html.includes('id="order"'), '包含秩序章节');
assert(html.includes('id="compete"'), '包含竞品章节');
assert(html.includes('id="takeaway"'), '包含启示章节');

// ── 3. CSS 检查 ──
console.log('\n[CSS 内容]');
const css = fs.readFileSync(cssPath, 'utf-8');

assert(css.includes('linear-gradient(135deg, #1a1a2e'), '包含深色渐变背景');
assert(css.includes('@keyframes shimmer'), '包含 shimmer 动画');
assert(css.includes('@media (max-width: 680px)'), '包含移动端响应式适配');
assert(css.includes('.paradox-card'), '包含悖论卡片样式');
assert(css.includes('.timeline'), '包含时间线样式');
assert(css.includes('.funnel'), '包含漏斗样式');
assert(css.includes('.quote-block'), '包含引用块样式');

// ── 4. 移动端适配检查 ──
console.log('\n[移动端适配]');
assert(css.includes('grid-template-columns: 1fr'), '移动端使用单列布局');
assert(css.includes('.header h1 { font-size: 1.4rem'), '移动端标题缩小');
assert(html.includes('width=device-width, initial-scale=1.0'), 'viewport 设置正确');

// ── 结果 ──
console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
