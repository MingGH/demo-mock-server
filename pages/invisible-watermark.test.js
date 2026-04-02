/**
 * 隐形水印实验室 - 单元测试
 * 运行命令: node pages/invisible-watermark.test.js
 */

// ===== 工具函数 =====
function textToBits(text) {
  const bytes = Buffer.from(text, 'utf-8');
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}

function bitsToText(bits) {
  const bytes = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
  }
  return Buffer.from(bytes).toString('utf-8');
}

// LSB 嵌入
function lsbEmbed(pixels, width, height, text, channel, numBits) {
  const data = new Uint8Array(pixels);
  const contentBits = textToBits(text);
  const lenBits = [];
  for (let i = 15; i >= 0; i--) lenBits.push((contentBits.length >> i) & 1);
  const allBits = lenBits.concat(contentBits);
  const mask = (0xFF >> numBits) << numBits;
  let modified = 0;

  for (let i = 0; i < allBits.length; i += numBits) {
    const pixIdx = Math.floor(i / numBits);
    if (pixIdx >= width * height) break;
    const dataIdx = pixIdx * 4 + channel;
    let val = data[dataIdx] & mask;
    for (let b = 0; b < numBits && (i + b) < allBits.length; b++) {
      val |= (allBits[i + b] << (numBits - 1 - b));
    }
    if (data[dataIdx] !== val) modified++;
    data[dataIdx] = val;
  }
  return { data, modified };
}

// LSB 提取
function lsbExtract(pixels, width, height, channel, numBits) {
  const lenBits = [];
  for (let i = 0; i < 16; i += numBits) {
    const pixIdx = Math.floor(i / numBits);
    const dataIdx = pixIdx * 4 + channel;
    const val = pixels[dataIdx];
    for (let b = 0; b < numBits && (i + b) < 16; b++) {
      lenBits.push((val >> (numBits - 1 - b)) & 1);
    }
  }
  let bitLen = 0;
  for (const b of lenBits) bitLen = (bitLen << 1) | b;
  if (bitLen <= 0 || bitLen > 10000) return null;

  const totalBits = 16 + bitLen;
  const allBits = [];
  for (let i = 0; i < totalBits; i += numBits) {
    const pixIdx = Math.floor(i / numBits);
    if (pixIdx >= width * height) break;
    const dataIdx = pixIdx * 4 + channel;
    const val = pixels[dataIdx];
    for (let b = 0; b < numBits && (i + b) < totalBits; b++) {
      allBits.push((val >> (numBits - 1 - b)) & 1);
    }
  }
  return bitsToText(allBits.slice(16));
}

// DCT 8x8
function dct8x8(block) {
  const N = 8, out = new Float64Array(64);
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++)
        for (let y = 0; y < N; y++)
          sum += block[x * N + y] *
            Math.cos((2 * x + 1) * u * Math.PI / 16) *
            Math.cos((2 * y + 1) * v * Math.PI / 16);
      const cu = u === 0 ? 1 / Math.SQRT2 : 1;
      const cv = v === 0 ? 1 / Math.SQRT2 : 1;
      out[u * N + v] = 0.25 * cu * cv * sum;
    }
  }
  return out;
}

function idct8x8(block) {
  const N = 8, out = new Float64Array(64);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      for (let u = 0; u < N; u++)
        for (let v = 0; v < N; v++) {
          const cu = u === 0 ? 1 / Math.SQRT2 : 1;
          const cv = v === 0 ? 1 / Math.SQRT2 : 1;
          sum += cu * cv * block[u * N + v] *
            Math.cos((2 * x + 1) * u * Math.PI / 16) *
            Math.cos((2 * y + 1) * v * Math.PI / 16);
        }
      out[x * N + y] = 0.25 * sum;
    }
  }
  return out;
}

function calcPSNR(data1, data2, len) {
  let mse = 0;
  for (let i = 0; i < len; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = data1[i + c] - data2[i + c];
      mse += d * d;
    }
  }
  mse /= (len / 4) * 3;
  if (mse === 0) return Infinity;
  return 10 * Math.log10(255 * 255 / mse);
}

// 生成测试图像数据（RGBA）
function generateTestImage(w, h) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = Math.floor((x / w) * 200 + 30);     // R: 渐变
      data[i+1] = Math.floor((y / h) * 200 + 30);   // G: 渐变
      data[i+2] = Math.floor(128 + 50 * Math.sin(x * 0.1)); // B: 波纹
      data[i+3] = 255;
    }
  }
  return data;
}
// ===== 测试用例 =====

function test1_textBitsRoundtrip() {
  console.log('测试1: 文本 ↔ 二进制 往返转换');
  const cases = ['Hello', 'UserID:10086', '中文测试', 'a', '!@#$%'];
  let passed = true;
  for (const text of cases) {
    const bits = textToBits(text);
    const recovered = bitsToText(bits);
    const ok = recovered === text;
    if (!ok) passed = false;
    console.log(`  "${text}" → ${bits.length} bits → "${recovered}" ${ok ? '✓' : '✗'}`);
  }
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test2_lsbEmbedExtract() {
  console.log('测试2: LSB 嵌入与提取');
  const w = 100, h = 100;
  const original = generateTestImage(w, h);
  const text = 'UserID:10086';
  const channel = 2; // Blue
  const numBits = 1;

  const { data: watermarked } = lsbEmbed(original, w, h, text, channel, numBits);
  const extracted = lsbExtract(watermarked, w, h, channel, numBits);

  console.log(`  嵌入: "${text}"`);
  console.log(`  提取: "${extracted}"`);
  const passed = extracted === text;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test3_lsbMinimalChange() {
  console.log('测试3: LSB 嵌入最小化像素变化');
  const w = 100, h = 100;
  const original = generateTestImage(w, h);
  const origCopy = new Uint8Array(original);
  const text = 'Test';
  const channel = 2;

  const { data: watermarked, modified } = lsbEmbed(new Uint8Array(original), w, h, text, channel, 1);

  // 检查非嵌入通道未被修改
  let otherChannelChanged = 0;
  for (let i = 0; i < original.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      if (c === channel) continue;
      if (origCopy[i + c] !== watermarked[i + c]) otherChannelChanged++;
    }
  }

  // 检查嵌入通道变化不超过 1
  let maxDiff = 0;
  for (let i = 0; i < original.length; i += 4) {
    const diff = Math.abs(origCopy[i + channel] - watermarked[i + channel]);
    if (diff > maxDiff) maxDiff = diff;
  }

  console.log(`  修改像素数: ${modified}`);
  console.log(`  其他通道变化: ${otherChannelChanged}`);
  console.log(`  嵌入通道最大变化: ${maxDiff}`);

  const passed = otherChannelChanged === 0 && maxDiff <= 1;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test4_lsbPSNR() {
  console.log('测试4: LSB 嵌入 PSNR 质量');
  const w = 200, h = 200;
  const original = generateTestImage(w, h);
  const text = 'SecretMessage123';

  const { data: watermarked } = lsbEmbed(new Uint8Array(original), w, h, text, 2, 1);
  const psnr = calcPSNR(original, watermarked, original.length);

  console.log(`  PSNR: ${psnr.toFixed(1)} dB`);
  console.log(`  (>40 dB 表示人眼不可见)`);

  const passed = psnr > 40;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test5_lsbMultiBits() {
  console.log('测试5: LSB 多位嵌入');
  const w = 100, h = 100;
  const original = generateTestImage(w, h);
  const text = 'Multi';
  let allPassed = true;

  for (let bits = 1; bits <= 4; bits++) {
    const { data: wm } = lsbEmbed(new Uint8Array(original), w, h, text, 2, bits);
    const extracted = lsbExtract(wm, w, h, 2, bits);
    const psnr = calcPSNR(original, wm, original.length);
    const ok = extracted === text;
    if (!ok) allPassed = false;
    console.log(`  ${bits}-bit: 提取="${extracted}" PSNR=${psnr.toFixed(1)}dB ${ok ? '✓' : '✗'}`);
  }

  console.log(`  结果: ${allPassed ? '✓ 通过' : '✗ 失败'}\n`);
  return allPassed;
}

function test6_dctRoundtrip() {
  console.log('测试6: DCT/IDCT 往返精度');
  const block = new Float64Array(64);
  for (let i = 0; i < 64; i++) block[i] = Math.random() * 255;

  const dctResult = dct8x8(block);
  const recovered = idct8x8(dctResult);

  let maxError = 0;
  for (let i = 0; i < 64; i++) {
    const err = Math.abs(block[i] - recovered[i]);
    if (err > maxError) maxError = err;
  }

  console.log(`  最大往返误差: ${maxError.toExponential(3)}`);
  const passed = maxError < 1e-8;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test7_dctEnergyCompaction() {
  console.log('测试7: DCT 能量集中特性');
  // 平滑块：能量应集中在低频
  const smooth = new Float64Array(64);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      smooth[r * 8 + c] = 128 + r * 2 + c * 3;

  const dctSmooth = dct8x8(smooth);
  let lowEnergy = 0, totalEnergy = 0;
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      const e = dctSmooth[u * 8 + v] ** 2;
      totalEnergy += e;
      if (u + v <= 2) lowEnergy += e;
    }
  }
  const ratio = lowEnergy / totalEnergy;

  console.log(`  低频能量占比: ${(ratio * 100).toFixed(1)}%`);
  const passed = ratio > 0.9;
  console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}\n`);
  return passed;
}

function test8_lsbDifferentChannels() {
  console.log('测试8: LSB 不同通道嵌入');
  const w = 100, h = 100;
  const original = generateTestImage(w, h);
  const text = 'Channel';
  let allPassed = true;

  for (let ch = 0; ch < 3; ch++) {
    const name = ['R', 'G', 'B'][ch];
    const { data: wm } = lsbEmbed(new Uint8Array(original), w, h, text, ch, 1);
    const extracted = lsbExtract(wm, w, h, ch, 1);
    const ok = extracted === text;
    if (!ok) allPassed = false;
    console.log(`  通道 ${name}: 提取="${extracted}" ${ok ? '✓' : '✗'}`);
  }

  console.log(`  结果: ${allPassed ? '✓ 通过' : '✗ 失败'}\n`);
  return allPassed;
}

// ===== 运行所有测试 =====
function runTests() {
  console.log('='.repeat(60));
  console.log('隐形水印实验室 - 单元测试');
  console.log('='.repeat(60) + '\n');

  const results = [
    test1_textBitsRoundtrip(),
    test2_lsbEmbedExtract(),
    test3_lsbMinimalChange(),
    test4_lsbPSNR(),
    test5_lsbMultiBits(),
    test6_dctRoundtrip(),
    test7_dctEnergyCompaction(),
    test8_lsbDifferentChannels(),
  ];

  console.log('='.repeat(60));
  const passed = results.filter(r => r).length;
  console.log(`测试结果: ${passed}/${results.length} 通过`);
  console.log('='.repeat(60));

  if (passed === results.length) {
    console.log('✓ 所有测试通过！');
    process.exit(0);
  } else {
    console.log('✗ 部分测试失败');
    process.exit(1);
  }
}

runTests();
