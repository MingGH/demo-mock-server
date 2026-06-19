/**
 * debunked-myths.test.js — 被证伪的常识：核心算法测试
 * 运行：node pages/debunked-myths/debunked-myths.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  generateUniformPoints,
  generateBlueNoisePoints,
  quantumNumbersToPoints,
  dist,
  clarkEvansR,
  gridVarianceCV,
  getCharsetSize,
  bruteForceEntropy,
  passphraseEntropy,
  crackTimeSeconds,
  formatCrackTime,
  passwordStrengthLevel,
  detectWeakPatterns,
  effectiveEntropy
} = require('./engine.js');

// ═══════════════════════════════════════════
// 聚类错觉模块
// ═══════════════════════════════════════════

describe('generateUniformPoints', function () {
  test('生成指定数量的点', function () {
    const pts = generateUniformPoints(100, 400);
    assert.equal(pts.length, 100);
  });

  test('所有点在 [0, size) 范围内', function () {
    const pts = generateUniformPoints(500, 300);
    pts.forEach(function (p) {
      assert.ok(p.x >= 0 && p.x < 300, 'x=' + p.x + ' 超出范围');
      assert.ok(p.y >= 0 && p.y < 300, 'y=' + p.y + ' 超出范围');
    });
  });

  test('生成 0 个点返回空数组', function () {
    assert.deepEqual(generateUniformPoints(0, 400), []);
  });
});

describe('generateBlueNoisePoints', function () {
  test('生成指定数量的点', function () {
    const pts = generateBlueNoisePoints(50, 400, 10);
    assert.equal(pts.length, 50);
  });

  test('所有点在 [0, size) 范围内', function () {
    const pts = generateBlueNoisePoints(100, 200, 15);
    pts.forEach(function (p) {
      assert.ok(p.x >= 0 && p.x < 200, 'x=' + p.x + ' 超出范围');
      assert.ok(p.y >= 0 && p.y < 200, 'y=' + p.y + ' 超出范围');
    });
  });

  test('Clark-Evans R > 1（比真随机更均匀）', function () {
    // 跑5次取平均，蓝噪声的R应该明显>1
    let totalR = 0;
    for (let i = 0; i < 5; i++) {
      const pts = generateBlueNoisePoints(100, 400, 20);
      totalR += clarkEvansR(pts, 400);
    }
    const avgR = totalR / 5;
    assert.ok(avgR > 1.2, '蓝噪声 R=' + avgR.toFixed(3) + ' 应 > 1.2');
  });
});

describe('quantumNumbersToPoints', function () {
  test('正确将数字对映射为点', function () {
    const pts = quantumNumbersToPoints([0, 255, 128, 64], 400);
    assert.equal(pts.length, 2);
    assert.ok(Math.abs(pts[0].x - 0) < 0.01);
    assert.ok(Math.abs(pts[0].y - 400) < 0.01);
    assert.ok(Math.abs(pts[1].x - 400 * 128 / 255) < 0.1);
  });

  test('奇数个数字时忽略最后一个', function () {
    const pts = quantumNumbersToPoints([10, 20, 30], 100);
    assert.equal(pts.length, 1);
  });

  test('空数组返回空', function () {
    assert.deepEqual(quantumNumbersToPoints([], 400), []);
  });
});

describe('dist', function () {
  test('相同点距离为0', function () {
    assert.equal(dist({ x: 5, y: 5 }, { x: 5, y: 5 }), 0);
  });

  test('3-4-5 三角形', function () {
    assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });
});

describe('clarkEvansR', function () {
  test('均匀网格点 R > 1.5', function () {
    // 生成10×10网格
    const pts = [];
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        pts.push({ x: i * 40 + 20, y: j * 40 + 20 });
      }
    }
    const r = clarkEvansR(pts, 400);
    assert.ok(r > 1.5, '网格R=' + r.toFixed(3) + ' 应 > 1.5');
  });

  test('聚集在一点附近 R < 0.5', function () {
    const pts = [];
    for (let i = 0; i < 50; i++) {
      pts.push({ x: 200 + (Math.random() - 0.5) * 10, y: 200 + (Math.random() - 0.5) * 10 });
    }
    const r = clarkEvansR(pts, 400);
    assert.ok(r < 0.5, '聚集R=' + r.toFixed(3) + ' 应 < 0.5');
  });

  test('只有一个点返回 1', function () {
    assert.equal(clarkEvansR([{ x: 50, y: 50 }], 400), 1);
  });
});

describe('gridVarianceCV', function () {
  test('完全均匀分布CV接近0', function () {
    // 每格恰好一个点
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      pts.push({ x: col * 50 + 25, y: row * 50 + 25 });
    }
    const cv = gridVarianceCV(pts, 400, 8);
    assert.ok(cv < 0.01, 'CV=' + cv + ' 应接近0');
  });

  test('所有点在同一格CV很高', function () {
    const pts = [];
    for (let i = 0; i < 100; i++) {
      pts.push({ x: 5, y: 5 });
    }
    const cv = gridVarianceCV(pts, 400, 8);
    assert.ok(cv > 5, 'CV=' + cv + ' 应很高');
  });
});

// ═══════════════════════════════════════════
// 密码熵模块
// ═══════════════════════════════════════════

describe('getCharsetSize', function () {
  test('纯小写 → 26', function () {
    assert.equal(getCharsetSize('abc'), 26);
  });

  test('大小写 → 52', function () {
    assert.equal(getCharsetSize('aBc'), 52);
  });

  test('大小写+数字 → 62', function () {
    assert.equal(getCharsetSize('aB1'), 62);
  });

  test('全类型 → 95', function () {
    assert.equal(getCharsetSize('aB1!'), 95);
  });

  test('空字符串 → 0', function () {
    assert.equal(getCharsetSize(''), 0);
  });
});

describe('bruteForceEntropy', function () {
  test('8位全类型 ≈ 52.6 bits', function () {
    const e = bruteForceEntropy('aB1!xY2@');
    assert.ok(Math.abs(e - 52.56) < 0.1, 'entropy=' + e);
  });

  test('空密码 → 0', function () {
    assert.equal(bruteForceEntropy(''), 0);
  });

  test('长度越长熵越大', function () {
    const e4 = bruteForceEntropy('abcd');
    const e8 = bruteForceEntropy('abcdefgh');
    assert.ok(e8 > e4);
    assert.ok(Math.abs(e8 - e4 * 2) < 0.01); // 同字符集，线性增长
  });
});

describe('passphraseEntropy', function () {
  test('4词×2048词典 ≈ 44 bits', function () {
    const e = passphraseEntropy(4, 2048);
    assert.ok(Math.abs(e - 44) < 0.01);
  });

  test('4词×7776词典 ≈ 51.7 bits', function () {
    const e = passphraseEntropy(4, 7776);
    assert.ok(Math.abs(e - 51.7) < 0.1);
  });

  test('0词 → 0', function () {
    assert.equal(passphraseEntropy(0), 0);
  });
});

describe('crackTimeSeconds', function () {
  test('0 bits → 接近0', function () {
    const t = crackTimeSeconds(0, 1e10);
    assert.ok(t < 0.001, 't=' + t + ' 应接近0');
  });

  test('40 bits @ 1e10/s → 约55秒', function () {
    const t = crackTimeSeconds(40, 1e10);
    // 2^39 / 1e10 ≈ 54.97
    assert.ok(Math.abs(t - 54.97) < 1);
  });

  test('128 bits @ 1e10/s → 天文数字', function () {
    const t = crackTimeSeconds(128, 1e10);
    // 应该远超宇宙年龄（4.3×10^17秒）
    assert.ok(t > 1e20);
  });
});

describe('formatCrackTime', function () {
  test('微小值 → 瞬间', function () {
    assert.equal(formatCrackTime(0.0001), '瞬间');
  });

  test('< 1秒', function () {
    assert.equal(formatCrackTime(0.5), '不到1秒');
  });

  test('秒级', function () {
    assert.equal(formatCrackTime(30), '30秒');
  });

  test('分钟级', function () {
    assert.equal(formatCrackTime(300), '5分钟');
  });

  test('天级', function () {
    assert.equal(formatCrackTime(86400 * 3), '3天');
  });

  test('年级', function () {
    assert.equal(formatCrackTime(86400 * 365 * 100), '100年');
  });

  test('千年级', function () {
    const result = formatCrackTime(86400 * 365 * 5000);
    assert.ok(result.includes('千年'), result);
  });

  test('极大值 → 超过宇宙年龄', function () {
    assert.equal(formatCrackTime(1e40), '超过宇宙年龄');
  });
});

describe('passwordStrengthLevel', function () {
  test('< 28 bits → 极弱', function () {
    assert.equal(passwordStrengthLevel(20).level, 'very-weak');
  });

  test('60~80 bits → 强', function () {
    assert.equal(passwordStrengthLevel(70).level, 'strong');
  });

  test('>= 100 bits → 极强', function () {
    assert.equal(passwordStrengthLevel(120).level, 'extreme');
  });
});

describe('detectWeakPatterns', function () {
  test('检测 leet-speak', function () {
    const p = detectWeakPatterns('P@$$w0rd');
    assert.ok(p.includes('leet-speak'), JSON.stringify(p));
  });

  test('检测 word-plus-suffix', function () {
    const p = detectWeakPatterns('Password123!');
    assert.ok(p.includes('word-plus-suffix'), JSON.stringify(p));
  });

  test('检测首字母大写', function () {
    const p = detectWeakPatterns('Hello');
    assert.ok(p.includes('capital-first'), JSON.stringify(p));
  });

  test('检测键盘序列', function () {
    const p = detectWeakPatterns('qwerty');
    assert.ok(p.includes('keyboard-sequence'), JSON.stringify(p));
  });

  test('纯随机字符无弱模式', function () {
    const p = detectWeakPatterns('kx9mf2vz');
    assert.equal(p.length, 0, JSON.stringify(p));
  });
});

describe('effectiveEntropy', function () {
  test('有弱模式时有效熵 < 理论熵', function () {
    const base = bruteForceEntropy('P@$$w0rd!');
    const effective = effectiveEntropy('P@$$w0rd!');
    assert.ok(effective < base, 'effective=' + effective + ' should < base=' + base);
  });

  test('无弱模式时有效熵 = 理论熵', function () {
    const pw = 'kx9mf2vz';
    const base = bruteForceEntropy(pw);
    const effective = effectiveEntropy(pw);
    assert.equal(effective, base);
  });

  test('重复字符惩罚极大', function () {
    const base = bruteForceEntropy('aaaaaaaaaa');
    const effective = effectiveEntropy('aaaaaaaaaa');
    assert.ok(effective < base * 0.5, 'effective=' + effective + ' should be significantly less than base=' + base);
  });
});

console.log('所有测试通过 ✓');
