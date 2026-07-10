/**
 * 文件系统本来就是数据库 - 纯计算逻辑
 *
 * 核心论点：文件系统本身就是带索引的专用数据库。
 * 这里把"文件系统"的关键机制抽象成可测的纯函数：
 *   - B 树（目录路径索引）：insert / search，并统计比较次数、记录查找轨迹用于动画
 *   - 路径解析 resolvePath：模拟 open("/a/b/c") 逐层定位目录项
 *   - inode 表生成：把文件树拍平成行记录
 *   - 线性扫描代价：无索引时 O(n) 的比较次数
 *   - 成本模型 estimateCosts：OPFS 不支持时降级估算"文件方式 vs 数据库方式"的耗时
 *
 * 不依赖 DOM，可被 app.js 和 node 测试同时使用。
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // B 树（多路搜索树）- 目录路径索引
  // order = 最大子节点数 m；每个节点最多 m-1 个 key，最少 ceil(m/2)-1
  // ─────────────────────────────────────────────────────────

  /**
   * 创建一棵 B 树
   * @param {number} [order=4] 最大子节点数
   * @returns {{insert:Function, search:Function, size:Function, height:Function}}
   */
  function createBTree(order) {
    order = order || 4;
    var maxKeys = order - 1;
    var root = null;
    var count = 0;

    function makeNode() {
      return { keys: [], children: [], leaf: true };
    }

    /**
     * 插入一个 key（重复 key 忽略）
     * @param {string} key
     */
    function insert(key) {
      if (!root) {
        root = makeNode();
        root.keys.push(key);
        count++;
        return;
      }
      if (root.keys.length === maxKeys) {
        var newRoot = makeNode();
        newRoot.leaf = false;
        newRoot.children.push(root);
        splitChild(newRoot, 0);
        root = newRoot;
      }
      insertNonFull(root, key);
    }

    function splitChild(parent, i) {
      var full = parent.children[i];
      var mid = Math.floor(maxKeys / 2);
      var midKey = full.keys[mid];
      var right = makeNode();
      right.leaf = full.leaf;
      right.keys = full.keys.slice(mid + 1);
      var leftKeys = full.keys.slice(0, mid);
      if (!full.leaf) {
        right.children = full.children.slice(mid + 1);
        full.children = full.children.slice(0, mid + 1);
      }
      full.keys = leftKeys;
      parent.keys.splice(i, 0, midKey);
      parent.children.splice(i + 1, 0, right);
    }

    function insertNonFull(node, key) {
      var i = node.keys.length - 1;
      if (node.leaf) {
        while (i >= 0 && key < node.keys[i]) i--;
        if (i >= 0 && key === node.keys[i]) return; // 重复
        node.keys.splice(i + 1, 0, key);
        count++;
      } else {
        while (i >= 0 && key < node.keys[i]) i--;
        if (i >= 0 && key === node.keys[i]) return; // 重复
        i++;
        if (node.children[i].keys.length === maxKeys) {
          splitChild(node, i);
          if (key > node.keys[i]) i++;
        }
        insertNonFull(node.children[i], key);
      }
    }

    /**
     * 查找 key，统计比较次数并记录逐层轨迹（供动画用）
     * @param {string} key
     * @returns {{found:boolean, comparisons:number, trace:Array}}
     *   trace[i] = { keys:number[], hitIndex:number, matched:boolean }
     */
    function search(key) {
      var comparisons = 0;
      var trace = [];
      if (!root) return { found: false, comparisons: 0, trace: trace };
      var node = root;
      while (node) {
        var i = 0;
        while (i < node.keys.length && key > node.keys[i]) {
          comparisons++;
          i++;
        }
        if (i < node.keys.length) {
          comparisons++; // 与 keys[i] 的 <= 比较
          if (key === node.keys[i]) {
            trace.push({ keys: node.keys.slice(), hitIndex: i, matched: true });
            return { found: true, comparisons: comparisons, trace: trace };
          }
        }
        trace.push({ keys: node.keys.slice(), hitIndex: i, matched: false });
        if (node.leaf) return { found: false, comparisons: comparisons, trace: trace };
        node = node.children[i];
      }
      return { found: false, comparisons: comparisons, trace: trace };
    }

    function size() { return count; }

    function height() {
      if (!root) return 0;
      var h = 1;
      var node = root;
      while (!node.leaf) { node = node.children[0]; h++; }
      return h;
    }

    return {
      insert: insert,
      search: search,
      size: size,
      height: height,
      _root: function () { return root; }
    };
  }

  // ─────────────────────────────────────────────────────────
  // 文件树 + 路径解析（模拟 open() 的逐层目录定位）
  // ─────────────────────────────────────────────────────────

  /**
   * 解析绝对路径，逐层在文件树中定位
   * @param {object} root 文件树根 {name,type,children}
   * @param {string} path 形如 "/home/user/photos/2024/a.jpg"
   * @returns {{found:boolean, node:object|null, parts:string[], visited:object[]}}
   */
  function resolvePath(root, path) {
    var parts = path.split('/').filter(function (p) { return p.length > 0; });
    var visited = [];
    var node = root;
    for (var i = 0; i < parts.length; i++) {
      visited.push(node);
      if (!node || node.type !== 'dir') {
        return { found: false, node: null, parts: parts, visited: visited };
      }
      var child = null;
      for (var j = 0; j < node.children.length; j++) {
        if (node.children[j].name === parts[i]) { child = node.children[j]; break; }
      }
      if (!child) return { found: false, node: null, parts: parts, visited: visited };
      node = child;
    }
    visited.push(node);
    return { found: true, node: node, parts: parts, visited: visited };
  }

  /**
   * 把文件树拍平成 inode 表（行记录）
   * @param {object} root
   * @param {string} [prefix=""]
   * @param {number} [startInode=1]
   * @returns {Array<{inode:number,path:string,name:string,type:string,size:number}>}
   */
  function buildInodeTable(root, prefix, startInode) {
    prefix = prefix || '';
    var inode = startInode || 1;
    var rows = [];
    function walk(node, path) {
      var full;
      if (node.name === '' || node.name == null) {
        full = ''; // 虚拟根，不落表
      } else if (path === '' || path === '/') {
        full = '/' + node.name;
      } else {
        full = path + '/' + node.name;
      }
      if (node.name !== '' && node.name != null) {
        rows.push({
          inode: inode++,
          path: full,
          name: node.name,
          type: node.type,
          size: node.size != null ? node.size : (node.type === 'dir' ? 4096 : 1024)
        });
      }
      if (node.type === 'dir' && node.children) {
        for (var i = 0; i < node.children.length; i++) {
          walk(node.children[i], full);
        }
      }
    }
    walk(root, prefix);
    return rows;
  }

  /**
   * 线性扫描查找（无索引），统计比较次数
   * @param {string[]} keys 已存的全部 key（无序或有序皆可）
   * @param {string} key
   * @returns {{found:boolean, comparisons:number}}
   */
  function linearScanCost(keys, key) {
    var comparisons = 0;
    for (var i = 0; i < keys.length; i++) {
      comparisons++;
      if (keys[i] === key) return { found: true, comparisons: comparisons };
    }
    return { found: false, comparisons: comparisons };
  }

  // ─────────────────────────────────────────────────────────
  // 成本模型 - OPFS 不支持时的降级估算
  // ─────────────────────────────────────────────────────────

  /**
   * 估算"文件方式 vs 数据库方式"写/读 N 条小数据的总耗时
   * 文件方式：每条数据一个文件，每次 open/write/close / open/read/close 都有固定系统调用开销
   * 数据库方式：库只 open 一次，之后 N 条都在进程内处理，单条开销很小
   * @param {number} N 条目数
   * @param {number} perFileOverhead 单个文件 open/close 的固定开销(ms)
   * @param {number} perRowDbCost 数据库单条读/写开销(ms)
   * @param {number} [dbOpenCost=5] 数据库一次性 open 开销(ms)
   * @returns {{fsWrite:number, fsRead:number, dbWrite:number, dbRead:number, ratio:number}}
   */
  function estimateCosts(N, perFileOverhead, perRowDbCost, dbOpenCost) {
    dbOpenCost = dbOpenCost == null ? 5 : dbOpenCost;
    var fsWrite = N * perFileOverhead;
    var fsRead = N * perFileOverhead;
    var dbWrite = dbOpenCost + N * perRowDbCost;
    var dbRead = N * perRowDbCost;
    var ratio = dbWrite > 0 ? fsWrite / dbWrite : 0;
    return { fsWrite: fsWrite, fsRead: fsRead, dbWrite: dbWrite, dbRead: dbRead, ratio: ratio };
  }

  // ─────────────────────────────────────────────────────────
  // 格式化
  // ─────────────────────────────────────────────────────────

  /**
   * 把毫秒格式化成人话
   * @param {number} ms
   * @returns {string}
   */
  function formatMs(ms) {
    if (ms < 1) return ms.toFixed(3) + ' ms';
    if (ms < 10) return ms.toFixed(2) + ' ms';
    if (ms < 1000) return ms.toFixed(1) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  /**
   * 取整后的倍率文字
   * @param {number} r
   * @returns {string}
   */
  function formatRatio(r) {
    if (r < 1) return r.toFixed(2) + 'x';
    return Math.round(r) + 'x';
  }

  // ─────────────────────────────────────────────────────────
  // 预设数据
  // ─────────────────────────────────────────────────────────

  /**
   * 模块 1 的示例文件树
   * @type {object}
   */
  var PRESET_TREE = {
    name: '', type: 'dir',
    children: [
      {
        name: 'home', type: 'dir',
        children: [
          {
            name: 'user', type: 'dir',
            children: [
              {
                name: 'photos', type: 'dir',
                children: [
                  {
                    name: '2024', type: 'dir',
                    children: [
                      { name: 'a.jpg', type: 'file', size: 2048000 },
                      { name: 'b.jpg', type: 'file', size: 1536000 },
                      { name: 'c.png', type: 'file', size: 4096000 }
                    ]
                  },
                  {
                    name: '2023', type: 'dir',
                    children: [
                      { name: 'old.jpg', type: 'file', size: 1024000 }
                    ]
                  }
                ]
              },
              {
                name: 'docs', type: 'dir',
                children: [
                  { name: 'resume.pdf', type: 'file', size: 512000 },
                  { name: 'notes.txt', type: 'file', size: 8192 }
                ]
              },
              { name: 'todo.md', type: 'file', size: 2048 }
            ]
          }
        ]
      },
      {
        name: 'etc', type: 'dir',
        children: [
          { name: 'hosts', type: 'file', size: 1024 },
          { name: 'fstab', type: 'file', size: 2048 }
        ]
      }
    ]
  };

  /**
   * 模块 2 的 N 值预设
   * @type {number[]}
   */
  var SAMPLE_N_PRESETS = [100, 500, 1000, 5000];

  /**
   * 模块 3 光谱上的真实系统定位（0=极端文件系统，100=极端数据库）
   * @type {Array<{name:string, pos:number, desc:string}>}
   */
  var SPECTRUM_SYSTEMS = [
    { name: '普通文件系统', pos: 5, desc: '每条数据一个文件，靠目录树 + inode 表组织，NTFS 的 MFT、ext4 的 HTree 本身就是 B 树索引' },
    { name: 'S3 对象存储', pos: 32, desc: 'key -> blob，本质是一个超大的 KV 数据库，扁平命名空间，没有目录层级' },
    { name: 'JuiceFS', pos: 55, desc: '元数据入 Redis/MySQL/TiKV，数据块进对象存储，把"目录树"和"文件内容"分别交给两种存储' },
    { name: 'MongoDB GridFS', pos: 70, desc: '把大文件切块存进文档库的两个集合，用数据库接管文件存储' },
    { name: 'Oracle DBFS', pos: 86, desc: '在 Oracle 数据库里直接挂载出一个文件系统接口，文件就是表里的行' },
    { name: 'WinFS（已夭折）', pos: 96, desc: '微软想在 SQL Server 上重建文件系统，因阻抗失配、POSIX 语义代价最终难产' }
  ];

  var api = {
    createBTree: createBTree,
    resolvePath: resolvePath,
    buildInodeTable: buildInodeTable,
    linearScanCost: linearScanCost,
    estimateCosts: estimateCosts,
    formatMs: formatMs,
    formatRatio: formatRatio,
    PRESET_TREE: PRESET_TREE,
    SAMPLE_N_PRESETS: SAMPLE_N_PRESETS,
    SPECTRUM_SYSTEMS: SPECTRUM_SYSTEMS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.FSDB = api;
  }
})(typeof window !== 'undefined' ? window : this);
