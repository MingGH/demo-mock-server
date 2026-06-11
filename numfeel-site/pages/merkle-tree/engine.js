// ========== 默克尔树核心算法 ==========
// 可在 Node.js 中独立运行和测试

(function(exports) {
  'use strict';

  /**
   * SHA-256 哈希（浏览器环境用 Web Crypto API，Node 用 crypto 模块）
   * 返回十六进制字符串
   */
  async function sha256(message) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } else {
      // Node.js 环境
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(message).digest('hex');
    }
  }

  /**
   * 同步版 SHA-256（仅 Node.js 环境，用于测试）
   */
  function sha256Sync(message) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(message).digest('hex');
  }

  /**
   * 构建默克尔树
   * @param {string[]} leaves - 叶子节点的原始内容数组
   * @returns {object} - { levels: [[node, ...], ...], root: string }
   *   levels[0] = 叶子层哈希, levels[last] = [root]
   *   每个 node = { hash, content?, left?, right?, index }
   */
  async function buildMerkleTree(leaves) {
    if (!leaves || leaves.length === 0) return null;

    // 计算叶子哈希
    const leafHashes = await Promise.all(
      leaves.map(async (content, i) => ({
        hash: await sha256(content),
        content: content,
        index: i,
        level: 0
      }))
    );

    const levels = [leafHashes];
    let currentLevel = leafHashes;

    // 逐层向上构建
    while (currentLevel.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i]; // 奇数个时复制最后一个

        const combinedHash = await sha256(left.hash + right.hash);
        nextLevel.push({
          hash: combinedHash,
          left: left,
          right: right,
          index: Math.floor(i / 2),
          level: levels.length
        });
      }
      levels.push(nextLevel);
      currentLevel = nextLevel;
    }

    return {
      levels: levels,
      root: currentLevel[0].hash
    };
  }

  /**
   * 同步版构建默克尔树（Node.js 测试用）
   */
  function buildMerkleTreeSync(leaves) {
    if (!leaves || leaves.length === 0) return null;

    const leafHashes = leaves.map((content, i) => ({
      hash: sha256Sync(content),
      content: content,
      index: i,
      level: 0
    }));

    const levels = [leafHashes];
    let currentLevel = leafHashes;

    while (currentLevel.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i];

        const combinedHash = sha256Sync(left.hash + right.hash);
        nextLevel.push({
          hash: combinedHash,
          left: left,
          right: right,
          index: Math.floor(i / 2),
          level: levels.length
        });
      }
      levels.push(nextLevel);
      currentLevel = nextLevel;
    }

    return {
      levels: levels,
      root: currentLevel[0].hash
    };
  }

  /**
   * 生成 Merkle Proof
   * @param {object} tree - buildMerkleTree 返回的树
   * @param {number} leafIndex - 要验证的叶子索引
   * @returns {object[]} - [{ hash, side: 'left'|'right' }, ...]
   */
  function getMerkleProof(tree, leafIndex) {
    if (!tree || leafIndex < 0 || leafIndex >= tree.levels[0].length) return [];

    const proof = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < tree.levels.length - 1; level++) {
      const currentLevel = tree.levels[level];
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      if (siblingIndex < currentLevel.length) {
        proof.push({
          hash: currentLevel[siblingIndex].hash,
          side: isLeft ? 'right' : 'left'
        });
      } else {
        // 奇数个节点，最后一个和自己配对
        proof.push({
          hash: currentLevel[currentIndex].hash,
          side: 'right'
        });
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * 验证 Merkle Proof
   * @param {string} leafHash - 叶子哈希
   * @param {object[]} proof - getMerkleProof 返回的证明
   * @param {string} expectedRoot - 期望的根哈希
   * @returns {boolean}
   */
  async function verifyMerkleProof(leafHash, proof, expectedRoot) {
    let currentHash = leafHash;

    for (const step of proof) {
      if (step.side === 'right') {
        currentHash = await sha256(currentHash + step.hash);
      } else {
        currentHash = await sha256(step.hash + currentHash);
      }
    }

    return currentHash === expectedRoot;
  }

  /**
   * 同步版验证
   */
  function verifyMerkleProofSync(leafHash, proof, expectedRoot) {
    let currentHash = leafHash;

    for (const step of proof) {
      if (step.side === 'right') {
        currentHash = sha256Sync(currentHash + step.hash);
      } else {
        currentHash = sha256Sync(step.hash + currentHash);
      }
    }

    return currentHash === expectedRoot;
  }

  /**
   * 计算篡改影响：返回受影响的节点路径
   * @param {object} originalTree - 原始树
   * @param {object} tamperedTree - 篡改后的树
   * @returns {object[]} - 变化的节点信息
   */
  function getAffectedPath(originalTree, tamperedTree) {
    const affected = [];

    for (let level = 0; level < originalTree.levels.length; level++) {
      const origLevel = originalTree.levels[level];
      const tampLevel = tamperedTree.levels[level];

      for (let i = 0; i < origLevel.length; i++) {
        if (origLevel[i].hash !== tampLevel[i].hash) {
          affected.push({
            level: level,
            index: i,
            oldHash: origLevel[i].hash,
            newHash: tampLevel[i].hash,
            content: origLevel[i].content || null
          });
        }
      }
    }

    return affected;
  }

  /**
   * 格式化哈希（截断显示）
   */
  function shortHash(hash, len) {
    len = len || 8;
    if (!hash) return '—';
    return hash.slice(0, len) + '...' + hash.slice(-4);
  }

  // 导出
  exports.sha256 = sha256;
  exports.sha256Sync = sha256Sync;
  exports.buildMerkleTree = buildMerkleTree;
  exports.buildMerkleTreeSync = buildMerkleTreeSync;
  exports.getMerkleProof = getMerkleProof;
  exports.verifyMerkleProof = verifyMerkleProof;
  exports.verifyMerkleProofSync = verifyMerkleProofSync;
  exports.getAffectedPath = getAffectedPath;
  exports.shortHash = shortHash;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.MerkleEngine = {}));
