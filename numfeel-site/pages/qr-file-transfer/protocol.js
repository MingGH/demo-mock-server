/**
 * 二维码文件传输协议
 * 
 * 数据包格式：
 * QFT|版本|文件名|总分片数|当前分片索引|校验码|数据
 * 
 * 示例：
 * QFT|1|test.txt|5|0|a1b2c3|SGVsbG8gV29ybGQ=
 */

const QFT_VERSION = 1;
const QFT_PREFIX = 'QFT';
const QFT_DELIMITER = '|';

/**
 * 计算简单校验码（CRC16 简化版）
 */
function calcChecksum(data) {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 6);
}

/**
 * 将文件切分为分片
 * @param {ArrayBuffer} buffer - 文件内容
 * @param {string} fileName - 文件名
 * @param {number} chunkSize - 每个分片的字节数
 * @returns {Array<string>} 编码后的分片数组
 */
function encodeFile(buffer, fileName, chunkSize = 500) {
  const bytes = new Uint8Array(buffer);
  const base64 = uint8ArrayToBase64(bytes);
  
  // 截断过长的文件名，保留扩展名
  let shortName = fileName;
  if (fileName.length > 30) {
    const ext = fileName.lastIndexOf('.') > 0 ? fileName.slice(fileName.lastIndexOf('.')) : '';
    shortName = fileName.slice(0, 26 - ext.length) + '...' + ext;
  }
  
  // 计算分片数
  const totalChunks = Math.ceil(base64.length / chunkSize);
  const chunks = [];
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, base64.length);
    const data = base64.slice(start, end);
    const checksum = calcChecksum(data);
    
    // 组装数据包
    const packet = [
      QFT_PREFIX,
      QFT_VERSION,
      shortName,
      totalChunks,
      i,
      checksum,
      data
    ].join(QFT_DELIMITER);
    
    chunks.push(packet);
  }
  
  return chunks;
}

/**
 * 解析数据包
 * @param {string} packet - 原始数据包
 * @returns {Object|null} 解析结果
 */
function decodePacket(packet) {
  if (!packet || !packet.startsWith(QFT_PREFIX + QFT_DELIMITER)) {
    return null;
  }
  
  const parts = packet.split(QFT_DELIMITER);
  if (parts.length < 7) {
    return null;
  }
  
  const [prefix, version, fileName, totalChunks, index, checksum, ...dataParts] = parts;
  const data = dataParts.join(QFT_DELIMITER); // 数据中可能包含分隔符
  
  // 校验
  if (calcChecksum(data) !== checksum) {
    return { error: 'checksum_mismatch' };
  }
  
  return {
    version: parseInt(version),
    fileName,
    totalChunks: parseInt(totalChunks),
    index: parseInt(index),
    checksum,
    data
  };
}

/**
 * 合并分片还原文件
 * @param {Map<number, string>} chunks - 分片映射 (index -> data)
 * @param {number} totalChunks - 总分片数
 * @returns {Uint8Array|null} 文件内容
 */
function mergeChunks(chunks, totalChunks) {
  if (chunks.size !== totalChunks) {
    return null;
  }
  
  // 按顺序拼接
  let base64 = '';
  for (let i = 0; i < totalChunks; i++) {
    if (!chunks.has(i)) {
      return null;
    }
    base64 += chunks.get(i);
  }
  
  return base64ToUint8Array(base64);
}

/**
 * Uint8Array 转 Base64
 */
function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 转 Uint8Array
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// 导出（兼容浏览器和 Node.js）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QFT_VERSION,
    QFT_PREFIX,
    QFT_DELIMITER,
    calcChecksum,
    encodeFile,
    decodePacket,
    mergeChunks,
    uint8ArrayToBase64,
    base64ToUint8Array,
    formatFileSize
  };
}
