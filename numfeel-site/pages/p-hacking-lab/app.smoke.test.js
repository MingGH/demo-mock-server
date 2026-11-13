/**
 * p-hacking-lab app 冒烟测试。
 * 运行：node app.smoke.test.js
 */
const { runSmoke } = require('../smoke-helper.js');

let passed = 0;
let failed = 0;

try {
  const result = runSmoke(__dirname);
  passed += result.passed;
  console.log('  ✅ 页面初始化与首帧渲染通过');
} catch (error) {
  failed++;
  console.error('  ❌ ' + error.stack);
}

console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
process.exit(failed ? 1 : 0);
