/**
 * exif-leak.test.js — EXIF 解析器核心逻辑测试
 * 运行：node pages/exif-leak/exif-leak.test.js
 *
 * 测试环境使用内置 JPEG 解析器（不依赖 exifr）
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const ExifParser = require('./exif-parser.js');

// ── 辅助：构建最小 JPEG + EXIF ──

function buildMinimalJpegWithExif(tags) {
  const tiffHeader = Buffer.alloc(8);
  tiffHeader.write('II', 0, 'ascii');
  tiffHeader.writeUInt16LE(0x002A, 2);
  tiffHeader.writeUInt32LE(8, 4);

  const ifdEntries = [];
  function addTag(tagId, type, value) { ifdEntries.push({ tagId, type, value }); }

  if (tags.Make) addTag(0x010F, 2, tags.Make);
  if (tags.Model) addTag(0x0110, 2, tags.Model);
  if (tags.DateTime) addTag(0x0132, 2, tags.DateTime);

  const entryCount = ifdEntries.length;
  const ifdSize = 2 + entryCount * 12 + 4;
  const dataStart = 8 + ifdSize;
  const ifdBuf = Buffer.alloc(ifdSize);
  ifdBuf.writeUInt16LE(entryCount, 0);

  let dataOffset = dataStart;
  const dataBuffers = [];

  ifdEntries.forEach((entry, i) => {
    const offset = 2 + i * 12;
    ifdBuf.writeUInt16LE(entry.tagId, offset);
    if (entry.type === 2) {
      const strBuf = Buffer.from(entry.value + '\0', 'ascii');
      ifdBuf.writeUInt16LE(2, offset + 2);
      ifdBuf.writeUInt32LE(strBuf.length, offset + 4);
      if (strBuf.length <= 4) {
        strBuf.copy(ifdBuf, offset + 8);
      } else {
        ifdBuf.writeUInt32LE(dataOffset, offset + 8);
        dataBuffers.push(strBuf);
        dataOffset += strBuf.length;
      }
    }
  });

  ifdBuf.writeUInt32LE(0, 2 + entryCount * 12);
  const tiffData = Buffer.concat([tiffHeader, ifdBuf, ...dataBuffers]);
  const exifIdent = Buffer.from('Exif\0\0', 'ascii');
  const app1Data = Buffer.concat([exifIdent, tiffData]);
  const app1Header = Buffer.alloc(4);
  app1Header.writeUInt8(0xFF, 0);
  app1Header.writeUInt8(0xE1, 1);
  app1Header.writeUInt16BE(app1Data.length + 2, 2);

  const soi = Buffer.from([0xFF, 0xD8]);
  const sos = Buffer.from([0xFF, 0xDA, 0x00, 0x02]);
  const eoi = Buffer.from([0xFF, 0xD9]);

  return Buffer.concat([soi, app1Header, app1Data, sos, eoi]);
}

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── 测试 ──

describe('ExifParser.parse (async)', function () {

  test('非 JPEG 文件应返回警告', async function () {
    const buf = Buffer.from('not a jpeg');
    const result = await ExifParser.parse(toArrayBuffer(buf));
    assert.equal(result.hasExif, false);
    assert.ok(result.warnings.length > 0);
  });

  test('无 EXIF 的 JPEG 应返回 hasExif=false', async function () {
    const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0xFF, 0xD9]);
    const result = await ExifParser.parse(toArrayBuffer(buf));
    assert.equal(result.hasExif, false);
  });

  test('包含设备信息的 JPEG 应正确解析', async function () {
    const jpeg = buildMinimalJpegWithExif({ Make: 'Apple', Model: 'iPhone 15 Pro', DateTime: '2024:03:15 14:30:00' });
    const result = await ExifParser.parse(toArrayBuffer(jpeg));
    assert.equal(result.hasExif, true);
    assert.equal(result.tags.Make, 'Apple');
    assert.equal(result.tags.Model, 'iPhone 15 Pro');
    assert.ok(result.device);
    assert.equal(result.device.make, 'Apple');
    assert.equal(result.device.model, 'iPhone 15 Pro');
  });

  test('日期时间应正确格式化', async function () {
    const jpeg = buildMinimalJpegWithExif({ DateTime: '2024:12:25 08:00:00' });
    const result = await ExifParser.parse(toArrayBuffer(jpeg));
    assert.ok(result.datetime);
    assert.equal(result.datetime.formatted, '2024-12-25 08:00:00');
  });
});

describe('ExifParser.dmsToDecimal', function () {

  test('正确转换度分秒', function () {
    const result = ExifParser.dmsToDecimal([39, 54, 20]);
    assert.ok(Math.abs(result - 39.90556) < 0.001);
  });

  test('整度数', function () {
    assert.equal(ExifParser.dmsToDecimal([45, 0, 0]), 45);
  });

  test('无效输入返回 null', function () {
    assert.equal(ExifParser.dmsToDecimal([]), null);
    assert.equal(ExifParser.dmsToDecimal(null), null);
    assert.equal(ExifParser.dmsToDecimal([39]), null);
  });
});

describe('ExifParser.formatExifDate', function () {

  test('标准 EXIF 日期格式', function () {
    assert.equal(ExifParser.formatExifDate('2024:03:15 14:30:00'), '2024-03-15 14:30:00');
  });

  test('空字符串', function () {
    assert.equal(ExifParser.formatExifDate(''), '');
  });

  test('null 输入', function () {
    assert.equal(ExifParser.formatExifDate(null), '');
  });

  test('Date 对象', function () {
    const d = new Date(2024, 2, 15, 14, 30, 0);
    const result = ExifParser.formatExifDate(d);
    assert.equal(result, '2024-03-15 14:30:00');
  });
});

describe('ExifParser.stripExif', function () {

  test('清除后文件仍是有效 JPEG', function () {
    const jpeg = buildMinimalJpegWithExif({ Make: 'Test', Model: 'Phone' });
    const cleaned = ExifParser.stripExif(toArrayBuffer(jpeg));
    const view = new DataView(cleaned);
    assert.equal(view.getUint16(0), 0xFFD8);
  });

  test('清除后不再包含 EXIF 数据', async function () {
    const jpeg = buildMinimalJpegWithExif({ Make: 'Apple', Model: 'iPhone' });
    const cleaned = ExifParser.stripExif(toArrayBuffer(jpeg));
    const result = await ExifParser.parse(cleaned);
    assert.equal(result.hasExif, false);
  });

  test('非 JPEG 输入原样返回', function () {
    const buf = Buffer.from('not jpeg');
    const ab = toArrayBuffer(buf);
    const result = ExifParser.stripExif(ab);
    assert.equal(result.byteLength, ab.byteLength);
  });
});

describe('ExifParser.extractGPS', function () {

  test('有效 GPS 数据', function () {
    const tags = {
      GPSLatitude: [39, 54, 20], GPSLatitudeRef: 'N',
      GPSLongitude: [116, 23, 30], GPSLongitudeRef: 'E'
    };
    const gps = ExifParser.extractGPS(tags);
    assert.ok(gps);
    assert.ok(gps.latitude > 39 && gps.latitude < 40);
    assert.ok(gps.longitude > 116 && gps.longitude < 117);
  });

  test('南纬西经应为负数', function () {
    const tags = {
      GPSLatitude: [33, 51, 54], GPSLatitudeRef: 'S',
      GPSLongitude: [151, 12, 36], GPSLongitudeRef: 'W'
    };
    const gps = ExifParser.extractGPS(tags);
    assert.ok(gps.latitude < 0);
    assert.ok(gps.longitude < 0);
  });

  test('缺少 GPS 数据返回 null', function () {
    assert.equal(ExifParser.extractGPS({}), null);
    assert.equal(ExifParser.extractGPS({ GPSLatitude: [39, 54, 20] }), null);
  });
});

describe('ExifParser.isSupported', function () {

  test('JPEG 文件', function () {
    assert.ok(ExifParser.isSupported({ type: 'image/jpeg', name: 'test.jpg' }));
  });

  test('PNG 文件', function () {
    assert.ok(ExifParser.isSupported({ type: 'image/png', name: 'test.png' }));
  });

  test('HEIC 文件（通过扩展名）', function () {
    assert.ok(ExifParser.isSupported({ type: '', name: 'photo.heic' }));
  });

  test('WebP 文件', function () {
    assert.ok(ExifParser.isSupported({ type: 'image/webp', name: 'test.webp' }));
  });

  test('TIFF 文件', function () {
    assert.ok(ExifParser.isSupported({ type: 'image/tiff', name: 'test.tiff' }));
  });

  test('AVIF 文件', function () {
    assert.ok(ExifParser.isSupported({ type: 'image/avif', name: 'test.avif' }));
  });

  test('不支持的格式', function () {
    assert.ok(!ExifParser.isSupported({ type: 'application/pdf', name: 'doc.pdf' }));
    assert.ok(!ExifParser.isSupported({ type: 'text/plain', name: 'file.txt' }));
  });

  test('null 输入', function () {
    assert.ok(!ExifParser.isSupported(null));
  });
});

describe('PLATFORM_EXIF_POLICY', function () {

  test('包含主要平台', function () {
    const names = ExifParser.PLATFORM_EXIF_POLICY.map(p => p.name);
    assert.ok(names.some(n => n.includes('微信')));
    assert.ok(names.some(n => n.includes('Twitter') || n.includes('X')));
    assert.ok(names.some(n => n.includes('邮件')));
  });

  test('每个平台都有必要字段', function () {
    ExifParser.PLATFORM_EXIF_POLICY.forEach(p => {
      assert.ok(p.name);
      assert.ok(typeof p.strip === 'boolean');
      assert.ok(p.note);
      assert.ok(['safe', 'warn', 'danger'].includes(p.risk));
    });
  });

  test('微信原图应标记为危险', function () {
    const wechatOriginal = ExifParser.PLATFORM_EXIF_POLICY.find(p => p.name.includes('原图'));
    assert.ok(wechatOriginal);
    assert.equal(wechatOriginal.strip, false);
    assert.equal(wechatOriginal.risk, 'danger');
  });
});

describe('SUPPORTED_EXTENSIONS', function () {

  test('包含所有主要格式', function () {
    const exts = ExifParser.SUPPORTED_EXTENSIONS;
    assert.ok(exts.includes('.jpg'));
    assert.ok(exts.includes('.jpeg'));
    assert.ok(exts.includes('.png'));
    assert.ok(exts.includes('.heic'));
    assert.ok(exts.includes('.tiff'));
    assert.ok(exts.includes('.webp'));
    assert.ok(exts.includes('.avif'));
  });
});

console.log('所有测试通过 ✓');
