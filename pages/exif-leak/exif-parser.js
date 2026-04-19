/**
 * EXIF 解析器 — 多格式支持（JPEG, PNG, HEIC, TIFF, WebP, AVIF）
 *
 * 浏览器端使用 exifr 库（通过 CDN 加载）解析元数据
 * Node.js 测试环境使用内置的简化解析器
 *
 * 支持提取：GPS坐标、设备信息、拍摄参数、时间戳
 */

const ExifParser = (function () {
  'use strict';

  // ── 支持的格式 ──
  const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.tif', '.webp', '.avif'];
  const SUPPORTED_MIMES = [
    'image/jpeg', 'image/png', 'image/heic', 'image/heif',
    'image/tiff', 'image/webp', 'image/avif'
  ];

  /**
   * 检查文件是否支持
   * @param {File} file
   * @returns {boolean}
   */
  function isSupported(file) {
    if (!file) return false;
    // 检查 MIME
    if (file.type && SUPPORTED_MIMES.some(m => file.type.toLowerCase().startsWith(m.split('/')[0]) && file.type.toLowerCase().includes(m.split('/')[1]))) {
      return true;
    }
    // 检查扩展名（HEIC 在某些系统上 MIME 为空）
    const ext = '.' + (file.name || '').split('.').pop().toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * 从 ArrayBuffer 或 File 解析 EXIF 数据
   * 浏览器端使用 exifr，Node.js 端使用内置解析器
   * @param {ArrayBuffer|File|Buffer} input
   * @returns {Promise<Object>} 解析结果
   */
  async function parse(input) {
    const result = {
      hasExif: false,
      tags: {},
      gps: null,
      device: null,
      datetime: null,
      camera: null,
      dimensions: null,
      warnings: [],
      rawTagCount: 0
    };

    try {
      // 浏览器端：使用 exifr
      if (typeof window !== 'undefined' && window.exifr) {
        return await parseWithExifr(input, result);
      }

      // Node.js 端或 exifr 未加载：使用内置 JPEG 解析器
      const buffer = input instanceof ArrayBuffer ? input :
                     (input.buffer ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) : input);
      return parseJpegFallback(buffer, result);
    } catch (e) {
      result.warnings.push('解析失败: ' + e.message);
      return result;
    }
  }

  /**
   * 使用 exifr 库解析（浏览器端）
   */
  async function parseWithExifr(input, result) {
    const exifr = window.exifr;

    // 完整解析
    const allTags = await exifr.parse(input, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true,
      interop: false,
      iptc: false,
      xmp: false,
      translateKeys: true,
      translateValues: false,
      reviveValues: true
    }).catch(() => null);

    if (!allTags || Object.keys(allTags).length === 0) {
      result.warnings.push('未找到 EXIF 数据');
      return result;
    }

    result.hasExif = true;
    result.tags = allTags;
    result.rawTagCount = Object.keys(allTags).length;

    // GPS
    const gpsData = await exifr.gps(input).catch(() => null);
    if (gpsData && gpsData.latitude !== undefined && gpsData.longitude !== undefined) {
      result.gps = {
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        altitude: allTags.GPSAltitude || null
      };
    }

    // 设备
    if (allTags.Make || allTags.Model) {
      result.device = {
        make: allTags.Make || '',
        model: allTags.Model || '',
        software: allTags.Software || ''
      };
    }

    // 时间
    const dt = allTags.DateTimeOriginal || allTags.DateTimeDigitized || allTags.DateTime || allTags.CreateDate;
    if (dt) {
      const formatted = dt instanceof Date ? formatDate(dt) : formatExifDate(String(dt));
      result.datetime = { raw: String(dt), formatted };
    }

    // 相机参数
    result.camera = extractCameraFromTags(allTags);

    // 尺寸
    if (allTags.ImageWidth || allTags.ExifImageWidth || allTags.PixelXDimension) {
      result.dimensions = {
        width: allTags.ExifImageWidth || allTags.ImageWidth || allTags.PixelXDimension || 0,
        height: allTags.ExifImageHeight || allTags.ImageHeight || allTags.PixelYDimension || 0
      };
    }

    return result;
  }

  /**
   * 内置 JPEG 解析器（Node.js 测试 + 浏览器 fallback）
   */
  function parseJpegFallback(buffer, result) {
    const view = new DataView(buffer);

    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) {
      result.warnings.push('不是有效的 JPEG 文件');
      return result;
    }

    const exifOffset = findExifOffset(view);
    if (exifOffset === -1) {
      result.warnings.push('未找到 EXIF 数据');
      return result;
    }

    result.hasExif = true;

    const exifHeader = getStringFromBuffer(view, exifOffset + 4, 4);
    if (exifHeader !== 'Exif') {
      result.warnings.push('EXIF 头部无效');
      return result;
    }

    const tiffOffset = exifOffset + 10;
    const byteOrder = view.getUint16(tiffOffset);
    const littleEndian = byteOrder === 0x4949;

    if (view.getUint16(tiffOffset + 2, littleEndian) !== 0x002A) {
      result.warnings.push('TIFF 头部无效');
      return result;
    }

    const ifd0Offset = view.getUint32(tiffOffset + 4, littleEndian);
    const ifd0Tags = readIFD(view, tiffOffset, tiffOffset + ifd0Offset, littleEndian);
    Object.assign(result.tags, ifd0Tags);
    result.rawTagCount += Object.keys(ifd0Tags).length;

    if (ifd0Tags.ExifIFDPointer) {
      const exifTags = readIFD(view, tiffOffset, tiffOffset + ifd0Tags.ExifIFDPointer, littleEndian);
      Object.assign(result.tags, exifTags);
      result.rawTagCount += Object.keys(exifTags).length;
      delete result.tags.ExifIFDPointer;
    }

    if (ifd0Tags.GPSInfoIFDPointer) {
      const gpsTags = readIFD(view, tiffOffset, tiffOffset + ifd0Tags.GPSInfoIFDPointer, littleEndian, true);
      Object.assign(result.tags, gpsTags);
      result.rawTagCount += Object.keys(gpsTags).length;
      delete result.tags.GPSInfoIFDPointer;
      result.gps = extractGPS(result.tags);
    }

    result.device = extractDevice(result.tags);
    result.datetime = extractDatetime(result.tags);
    result.camera = extractCameraFromTags(result.tags);
    result.dimensions = extractDimensions(result.tags);

    return result;
  }

  // ── JPEG 二进制解析辅助 ──

  const TAG_NAMES = {
    0x010F: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
    0x0131: 'Software', 0x0132: 'DateTime', 0x8769: 'ExifIFDPointer',
    0x8825: 'GPSInfoIFDPointer',
    0x829A: 'ExposureTime', 0x829D: 'FNumber', 0x8827: 'ISOSpeedRatings',
    0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
    0x9209: 'Flash', 0x920A: 'FocalLength',
    0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension',
    0xA405: 'FocalLengthIn35mmFilm', 0xA434: 'LensModel',
    0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude',
    0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude'
  };

  const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  function findExifOffset(view) {
    let offset = 2;
    const max = Math.min(view.byteLength - 2, 65536);
    while (offset < max) {
      if (view.getUint8(offset) !== 0xFF) { offset++; continue; }
      const marker = view.getUint8(offset + 1);
      if (marker === 0xE1) return offset;
      if (marker === 0xDA) return -1;
      const segLen = view.getUint16(offset + 2);
      offset += 2 + segLen;
    }
    return -1;
  }

  function readIFD(view, tiffOffset, ifdOffset, le) {
    const tags = {};
    if (ifdOffset + 2 > view.byteLength) return tags;
    const count = view.getUint16(ifdOffset, le);
    for (let i = 0; i < count; i++) {
      const eo = ifdOffset + 2 + i * 12;
      if (eo + 12 > view.byteLength) break;
      const tagId = view.getUint16(eo, le);
      const type = view.getUint16(eo + 2, le);
      const cnt = view.getUint32(eo + 4, le);
      const name = TAG_NAMES[tagId];
      if (!name) continue;
      const valSize = (TYPE_SIZES[type] || 1) * cnt;
      const valOff = valSize > 4 ? tiffOffset + view.getUint32(eo + 8, le) : eo + 8;
      if (valOff + valSize > view.byteLength) continue;
      const val = readTagValue(view, type, cnt, valOff, le);
      if (val !== null) tags[name] = val;
    }
    return tags;
  }

  function readTagValue(view, type, count, offset, le) {
    try {
      switch (type) {
        case 1: return count === 1 ? view.getUint8(offset) : readArr(view, offset, count, 1, (v, o) => v.getUint8(o));
        case 2: return getStringFromBuffer(view, offset, count).replace(/\0+$/, '');
        case 3: return count === 1 ? view.getUint16(offset, le) : readArr(view, offset, count, 2, (v, o) => v.getUint16(o, le));
        case 4: return count === 1 ? view.getUint32(offset, le) : readArr(view, offset, count, 4, (v, o) => v.getUint32(o, le));
        case 5: return readRationals(view, offset, count, le);
        case 7: return count <= 4 ? readArr(view, offset, count, 1, (v, o) => v.getUint8(o)) : `[${count} bytes]`;
        default: return null;
      }
    } catch (e) { return null; }
  }

  function readArr(view, offset, count, size, getter) {
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(getter(view, offset + i * size));
    return arr;
  }

  function readRationals(view, offset, count, le) {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const num = view.getUint32(offset + i * 8, le);
      const den = view.getUint32(offset + i * 8 + 4, le);
      arr.push(den === 0 ? 0 : num / den);
    }
    return count === 1 ? arr[0] : arr;
  }

  function getStringFromBuffer(view, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
      const c = view.getUint8(offset + i);
      if (c === 0) break;
      str += String.fromCharCode(c);
    }
    return str;
  }

  // ── 数据提取 ──

  function extractGPS(tags) {
    if (!tags.GPSLatitude || !tags.GPSLongitude) return null;
    const lat = dmsToDecimal(tags.GPSLatitude);
    const lng = dmsToDecimal(tags.GPSLongitude);
    if (lat === null || lng === null) return null;
    return {
      latitude: lat * (tags.GPSLatitudeRef === 'S' ? -1 : 1),
      longitude: lng * (tags.GPSLongitudeRef === 'W' ? -1 : 1),
      altitude: tags.GPSAltitude || null
    };
  }

  function dmsToDecimal(dms) {
    if (!Array.isArray(dms) || dms.length < 3) return null;
    return dms[0] + dms[1] / 60 + dms[2] / 3600;
  }

  function extractDevice(tags) {
    if (!tags.Make && !tags.Model) return null;
    return { make: tags.Make || '', model: tags.Model || '', software: tags.Software || '' };
  }

  function extractDatetime(tags) {
    const dt = tags.DateTimeOriginal || tags.DateTimeDigitized || tags.DateTime;
    if (!dt) return null;
    return { raw: dt, formatted: formatExifDate(dt) };
  }

  function extractCameraFromTags(tags) {
    const cam = {};
    if (tags.FocalLength) cam.focalLength = Math.round((typeof tags.FocalLength === 'number' ? tags.FocalLength : 0) * 10) / 10 + 'mm';
    if (tags.FocalLengthIn35mmFilm || tags.FocalLengthIn35mmFormat) cam.focalLength35 = (tags.FocalLengthIn35mmFilm || tags.FocalLengthIn35mmFormat) + 'mm';
    if (tags.FNumber) cam.aperture = 'f/' + (Math.round((typeof tags.FNumber === 'number' ? tags.FNumber : 0) * 10) / 10);
    if (tags.ExposureTime) {
      const et = typeof tags.ExposureTime === 'number' ? tags.ExposureTime : 0;
      cam.exposureTime = et < 1 ? '1/' + Math.round(1 / et) + 's' : et + 's';
    }
    if (tags.ISO || tags.ISOSpeedRatings) cam.iso = 'ISO ' + (tags.ISO || tags.ISOSpeedRatings);
    if (tags.Flash !== undefined) {
      const flashVal = typeof tags.Flash === 'number' ? tags.Flash : (tags.Flash ? 1 : 0);
      cam.flash = (flashVal & 1) ? '已闪光' : '未闪光';
    }
    if (tags.LensModel) cam.lens = tags.LensModel;
    return Object.keys(cam).length > 0 ? cam : null;
  }

  function extractDimensions(tags) {
    const w = tags.PixelXDimension || tags.ExifImageWidth || tags.ImageWidth;
    const h = tags.PixelYDimension || tags.ExifImageHeight || tags.ImageHeight;
    if (!w && !h) return null;
    return { width: w || 0, height: h || 0 };
  }

  function formatExifDate(str) {
    if (!str) return '';
    if (str instanceof Date) return formatDate(str);
    return String(str).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  }

  function formatDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // ── 清除 EXIF（仅 JPEG）──

  function stripExif(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return buffer;

    const parts = [];
    parts.push(new Uint8Array(buffer, 0, 2));
    let offset = 2;
    while (offset < buffer.byteLength - 1) {
      if (view.getUint8(offset) !== 0xFF) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xDA) { parts.push(new Uint8Array(buffer, offset)); break; }
      const segLen = view.getUint16(offset + 2);
      const segSize = 2 + segLen;
      if (marker !== 0xE1) parts.push(new Uint8Array(buffer, offset, segSize));
      offset += segSize;
    }
    const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of parts) { out.set(new Uint8Array(p.buffer || p, p.byteOffset || 0, p.byteLength), pos); pos += p.byteLength; }
    return out.buffer;
  }

  // ── 平台 EXIF 处理对比 ──

  const PLATFORM_EXIF_POLICY = [
    { name: '微信聊天（普通发送）', strip: true, note: '压缩图片，剥离 EXIF', risk: 'safe' },
    { name: '微信聊天（发原图）', strip: false, note: '完整保留所有 EXIF 数据，包括 GPS', risk: 'danger' },
    { name: '微信朋友圈', strip: true, note: '压缩图片，剥离 EXIF', risk: 'safe' },
    { name: '微博', strip: true, note: '上传时剥离 EXIF', risk: 'safe' },
    { name: '抖音', strip: true, note: '上传时剥离 EXIF', risk: 'safe' },
    { name: '小红书', strip: true, note: '上传时剥离 EXIF', risk: 'safe' },
    { name: 'Twitter / X', strip: true, note: '上传时剥离 EXIF', risk: 'safe' },
    { name: 'Facebook', strip: true, note: '上传时剥离 EXIF（但 Meta 自己保留）', risk: 'warn' },
    { name: 'Instagram', strip: true, note: '上传时剥离 EXIF（但 Meta 自己保留）', risk: 'warn' },
    { name: 'Telegram', strip: false, note: '发送文件时完整保留 EXIF', risk: 'danger' },
    { name: '邮件附件', strip: false, note: '完整保留所有 EXIF', risk: 'danger' },
    { name: '网盘分享（百度/阿里）', strip: false, note: '完整保留所有 EXIF', risk: 'danger' },
    { name: '论坛/博客上传', strip: false, note: '大部分论坛不处理 EXIF', risk: 'danger' },
    { name: 'iMessage', strip: false, note: '完整保留 EXIF', risk: 'danger' }
  ];

  return {
    parse,
    stripExif,
    dmsToDecimal,
    extractGPS,
    formatExifDate,
    isSupported,
    PLATFORM_EXIF_POLICY,
    SUPPORTED_EXTENSIONS,
    SUPPORTED_MIMES,
    TAG_NAMES
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExifParser;
}
