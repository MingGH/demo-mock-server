/**
 * dsstore.js — .DS_Store 文件的解析器 + 构造器（纯逻辑，无 DOM 依赖）
 *
 * .DS_Store 是 macOS Finder 用来记住「文件夹怎么显示」的隐藏文件。
 * 它的内部是 Apple 的 buddy allocator（伙伴分配器）+ 一棵 B-tree。
 * 关键点：树里每条记录都带着一个文件名 —— 也就是说，这个文件偷偷记下了
 * 所在目录里每一个文件/文件夹的名字。这正是它泄密的地方。
 *
 * 本模块做两件事：
 *   1. parse(buffer)      —— 解析真实 .DS_Store 二进制，还原出文件名清单与属性
 *   2. build(entries)     —— 反过来，根据文件名清单生成一份格式合法的 .DS_Store
 *                            （供演示预设使用，能被 parse 原样读回来）
 *
 * 所有多字节整数均为大端序（big-endian）；文件名为 UTF-16 大端。
 *
 * 参考：.DS_Store 格式公开分析（0day.work / al45tair 的 ds_store 实现）。
 */
(function (root) {
  'use strict';

  var MAGIC1 = 0x00000001;
  var MAGIC2 = 0x42756431; // 'Bud1'

  // ── 常见记录结构 ID → 中文含义。用于可视化「这个文件被记住了什么」──
  var STRUCT_INFO = {
    'Iloc': { label: '图标位置', desc: '图标在窗口里被拖到的 x/y 坐标', icon: 'ti-drag-drop' },
    'bwsp': { label: '窗口布局', desc: '窗口大小、位置、工具栏状态（内嵌 plist）', icon: 'ti-layout' },
    'lsvp': { label: '列表视图', desc: '列表视图的排序与列宽设置', icon: 'ti-list' },
    'lsvP': { label: '列表视图', desc: '列表视图的排序与列宽设置', icon: 'ti-list' },
    'lsvC': { label: '列表视图列', desc: '列表视图各列的可见性与顺序', icon: 'ti-columns' },
    'icvp': { label: '图标视图', desc: '图标大小、网格间距、排列方式', icon: 'ti-layout-grid' },
    'icvo': { label: '图标视图选项', desc: '图标视图的旧版选项', icon: 'ti-layout-grid' },
    'vSrn': { label: '视图序号', desc: '窗口使用的视图编号', icon: 'ti-number' },
    'vstl': { label: '视图样式', desc: '图标 / 列表 / 分栏 / 封面流', icon: 'ti-eye' },
    'cmmt': { label: 'Spotlight 注释', desc: '你给文件写的备注文字（明文泄露）', icon: 'ti-message' },
    'dilc': { label: '桌面图标位置', desc: '文件在桌面上的坐标', icon: 'ti-device-desktop' },
    'fwi0': { label: 'Finder 窗口信息', desc: '窗口矩形与视图模式', icon: 'ti-app-window' },
    'fwsw': { label: '侧边栏宽度', desc: '窗口侧边栏宽度', icon: 'ti-layout-sidebar' },
    'GRP0': { label: '分组', desc: '分组排列信息', icon: 'ti-folders' },
    'icgo': { label: '图标网格', desc: '图标网格选项', icon: 'ti-grid-dots' },
    'icsp': { label: '图标间距', desc: '图标视图缩放/间距', icon: 'ti-grid-dots' },
    'info': { label: '通用信息', desc: '通用附加信息', icon: 'ti-info-circle' },
    'logS': { label: '逻辑大小', desc: '文件夹逻辑大小缓存', icon: 'ti-database' },
    'lg1S': { label: '逻辑大小', desc: '文件夹逻辑大小缓存', icon: 'ti-database' },
    'modD': { label: '修改时间', desc: '缓存的修改时间戳', icon: 'ti-clock' },
    'moDD': { label: '修改时间', desc: '缓存的修改时间戳', icon: 'ti-clock' },
    'phyS': { label: '物理大小', desc: '文件夹物理大小缓存', icon: 'ti-database' },
    'ph1S': { label: '物理大小', desc: '文件夹物理大小缓存', icon: 'ti-database' },
    'pict': { label: '背景图片', desc: '窗口自定义背景图（可能是 alias）', icon: 'ti-photo' },
    'bRsV': { label: '浏览状态', desc: '浏览可见性状态', icon: 'ti-eye' },
    'BKGD': { label: '窗口背景', desc: '窗口背景色或图片设置', icon: 'ti-color-swatch' },
    'ICVO': { label: '图标视图选项', desc: '图标视图布尔选项', icon: 'ti-layout-grid' },
    'dscl': { label: '目录展开', desc: '列表视图中该目录是否展开', icon: 'ti-chevrons-down' },
    'extn': { label: '扩展名', desc: '缓存的文件扩展名', icon: 'ti-file' },
    'ludt': { label: '上次使用日期', desc: '上次使用日期', icon: 'ti-calendar' },
    'lupt': { label: '上次打开时间', desc: '上次打开时间戳', icon: 'ti-calendar' }
  };

  /**
   * 获取结构 ID 的可读信息
   * @param {string} id 4 字符结构码
   * @returns {{label:string, desc:string, icon:string}}
   */
  function describeStruct(id) {
    return STRUCT_INFO[id] || { label: id, desc: '未知的 Finder 元数据字段', icon: 'ti-help' };
  }

  // ─────────────────────────────────────────────────────────
  // 解析
  // ─────────────────────────────────────────────────────────

  /**
   * 解析一份 .DS_Store 二进制数据
   * @param {ArrayBuffer|Uint8Array} input
   * @returns {{ok:boolean, error?:string, warnings:string[], files:string[],
   *            records:Array, byName:Object, recordCount:number, fileSize:number}}
   */
  function parse(input) {
    var result = {
      ok: false,
      warnings: [],
      files: [],
      records: [],
      byName: {},
      recordCount: 0,
      fileSize: 0
    };

    var buffer;
    if (input instanceof ArrayBuffer) {
      buffer = input;
    } else if (input && input.buffer instanceof ArrayBuffer) {
      buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    } else {
      result.error = '输入不是有效的二进制数据';
      return result;
    }

    result.fileSize = buffer.byteLength;
    var view = new DataView(buffer);

    try {
      if (buffer.byteLength < 36) {
        result.error = '文件太小，不是有效的 .DS_Store';
        return result;
      }
      if (view.getUint32(0) !== MAGIC1 || view.getUint32(4) !== MAGIC2) {
        result.error = '魔数不匹配：这不是一份 .DS_Store 文件';
        return result;
      }

      var rootOffset = view.getUint32(8);
      // rootOffset(12..16) 是 size，rootOffset2(16..20) 是副本；此处不强校验

      var alloc = readAllocator(view, rootOffset);
      var dsdbBlock = alloc.toc['DSDB'];
      if (dsdbBlock === undefined) {
        result.error = '未找到 DSDB 主节点（文件可能已损坏）';
        return result;
      }

      var master = blockView(view, alloc, dsdbBlock);
      var rootNode = master.getUint32(0);
      // master.getUint32(4) = levels, 8 = records, 12 = nodes, 16 = page_size

      var records = [];
      var visited = {};
      traverse(view, alloc, rootNode, records, visited, result.warnings);

      result.records = records;
      result.recordCount = records.length;

      // 归并同名记录，得出唯一文件名清单
      var byName = {};
      var order = [];
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        if (!byName[rec.name]) {
          byName[rec.name] = { name: rec.name, props: [] };
          order.push(rec.name);
        }
        byName[rec.name].props.push({
          structId: rec.structId,
          type: rec.type,
          value: rec.value
        });
      }
      result.byName = byName;
      result.files = order;
      result.ok = true;
      return result;
    } catch (e) {
      result.error = '解析出错：' + (e && e.message ? e.message : String(e));
      return result;
    }
  }

  /**
   * 读取 buddy allocator 的簿记信息块（偏移表 + 目录 + 空闲表）
   */
  function readAllocator(view, rootOffset) {
    var pos = rootOffset + 4; // 地址相对 +4
    var count = view.getUint32(pos); pos += 4;
    pos += 4; // unused
    var offsets = [];
    var padded = (count + 255) & ~255; // 偏移表按 256 条为一块补齐
    for (var i = 0; i < padded; i++) {
      var addr = view.getUint32(pos); pos += 4;
      if (i < count) offsets.push(addr);
    }
    var toc = {};
    var tocCount = view.getUint32(pos); pos += 4;
    for (var t = 0; t < tocCount; t++) {
      var nlen = view.getUint8(pos); pos += 1;
      var name = '';
      for (var c = 0; c < nlen; c++) {
        name += String.fromCharCode(view.getUint8(pos)); pos += 1;
      }
      toc[name] = view.getUint32(pos); pos += 4;
    }
    // 空闲表：32 个桶，每桶 count + count 个偏移（读掉即可，不使用）
    for (var f = 0; f < 32; f++) {
      var fc = view.getUint32(pos); pos += 4;
      pos += fc * 4;
    }
    return { offsets: offsets, toc: toc };
  }

  /**
   * 取出编号为 block 的数据块，返回一个针对该块的 DataView
   */
  function blockView(view, alloc, block) {
    if (block < 0 || block >= alloc.offsets.length) {
      throw new Error('非法块编号 ' + block);
    }
    var addr = alloc.offsets[block];
    var offset = (addr & ~0x1f) + 4;
    var size = 1 << (addr & 0x1f);
    if (offset + size > view.byteLength) {
      size = view.byteLength - offset;
    }
    return new DataView(view.buffer, view.byteOffset + offset, size);
  }

  /**
   * 递归遍历 B-tree 节点，收集所有记录
   */
  function traverse(view, alloc, block, out, visited, warnings) {
    if (visited[block]) {
      warnings.push('检测到重复引用的块，已跳过以避免死循环');
      return;
    }
    visited[block] = true;
    if (out.length > 100000) return; // 安全上限

    var node = blockView(view, alloc, block);
    var pos = 0;
    var next = node.getUint32(pos); pos += 4;
    var count = node.getUint32(pos); pos += 4;

    if (next !== 0) {
      // 内部节点：每条记录前有一个子块指针，最后还有一个最右子块 next
      for (var i = 0; i < count; i++) {
        var child = node.getUint32(pos); pos += 4;
        traverse(view, alloc, child, out, visited, warnings);
        pos = readRecord(node, pos, out);
      }
      traverse(view, alloc, next, out, visited, warnings);
    } else {
      // 叶子节点
      for (var j = 0; j < count; j++) {
        pos = readRecord(node, pos, out);
      }
    }
  }

  /**
   * 从节点的 pos 处读取一条记录，追加到 out，返回新的 pos
   */
  function readRecord(node, pos, out) {
    var flen = node.getUint32(pos); pos += 4;
    var name = '';
    for (var i = 0; i < flen; i++) {
      name += String.fromCharCode(node.getUint16(pos)); pos += 2;
    }
    var structId = fourcc(node, pos); pos += 4;
    var type = fourcc(node, pos); pos += 4;

    var parsed = readValue(node, pos, type);
    out.push({ name: name, structId: structId, type: type, value: parsed.value });
    return parsed.pos;
  }

  /**
   * 按数据类型解析记录的值
   */
  function readValue(node, pos, type) {
    switch (type) {
      case 'bool':
        return { value: node.getUint8(pos) !== 0, pos: pos + 1 };
      case 'long':
      case 'shor':
        return { value: node.getInt32(pos), pos: pos + 4 };
      case 'type':
        return { value: fourcc(node, pos), pos: pos + 4 };
      case 'comp':
      case 'dutc': {
        var hi = node.getUint32(pos);
        var lo = node.getUint32(pos + 4);
        return { value: { hi: hi, lo: lo }, pos: pos + 8 };
      }
      case 'blob': {
        var len = node.getUint32(pos); pos += 4;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = node.getUint8(pos + i);
        return { value: bytes, pos: pos + len };
      }
      case 'ustr': {
        var ulen = node.getUint32(pos); pos += 4;
        var s = '';
        for (var j = 0; j < ulen; j++) { s += String.fromCharCode(node.getUint16(pos)); pos += 2; }
        return { value: s, pos: pos };
      }
      default:
        // 未知类型：无法确定长度，抛错终止本节点解析
        throw new Error('未知数据类型 "' + type + '"');
    }
  }

  function fourcc(view, pos) {
    return String.fromCharCode(
      view.getUint8(pos), view.getUint8(pos + 1),
      view.getUint8(pos + 2), view.getUint8(pos + 3)
    );
  }

  // ─────────────────────────────────────────────────────────
  // 构造（用于生成演示预设的真实 .DS_Store 字节）
  // ─────────────────────────────────────────────────────────

  /**
   * 根据一批记录生成一份格式合法的 .DS_Store（单叶节点 B-tree）
   * @param {Array<{name:string, structId:string, type:string, value:*}>} entries
   * @returns {Uint8Array}
   */
  function build(entries) {
    // 记录按文件名（不区分大小写）排序，贴近真实 Finder 行为
    var recs = entries.slice().sort(function (a, b) {
      var an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });

    // 1) 叶子节点：next(0) + count + records
    var recBufs = recs.map(encodeRecord);
    var recTotal = recBufs.reduce(function (s, b) { return s + b.length; }, 0);
    var leaf = new Uint8Array(8 + recTotal);
    var lv = new DataView(leaf.buffer);
    lv.setUint32(0, 0);            // next = 0 → 叶子
    lv.setUint32(4, recs.length);  // 记录数
    var p = 8;
    recBufs.forEach(function (b) { leaf.set(b, p); p += b.length; });

    // 2) DSDB 主块：rootnode, levels, records, nodes, page_size
    var master = new Uint8Array(20);
    var mv = new DataView(master.buffer);
    mv.setUint32(0, 1);        // rootnode = 块 1（叶子）
    mv.setUint32(4, 1);        // levels
    mv.setUint32(8, recs.length);
    mv.setUint32(12, 1);       // nodes
    mv.setUint32(16, 0x1000);  // page_size

    // 3) 块布局：块0=master，块1=leaf。相对偏移从 32 起，按 32 对齐。
    var relMaster = 32;
    var sizeMaster = 32;                 // >= 20
    var relLeaf = align32(relMaster + sizeMaster);
    var sizeLeaf = nextPow2(Math.max(leaf.length, 32));
    var addrMaster = relMaster | log2(sizeMaster);
    var addrLeaf = relLeaf | log2(sizeLeaf);

    // 4) 簿记信息块
    var relInfo = align32(relLeaf + sizeLeaf);
    var offsetsCount = 2;
    var infoBuf = encodeAllocator([addrMaster, addrLeaf], { 'DSDB': 0 });
    var sizeInfo = infoBuf.length;

    // 5) 总文件长度
    var fileEnd = 4 + relInfo + sizeInfo; // 地址相对 +4
    var out = new Uint8Array(fileEnd);
    var ov = new DataView(out.buffer);

    // 头部
    ov.setUint32(0, MAGIC1);
    ov.setUint32(4, MAGIC2);
    ov.setUint32(8, relInfo);   // info 块偏移
    ov.setUint32(12, sizeInfo);
    ov.setUint32(16, relInfo);  // 副本
    // 20..36 保持 0

    // 写入块（文件偏移 = 相对 + 4）
    out.set(master, relMaster + 4);
    out.set(leaf, relLeaf + 4);
    out.set(infoBuf, relInfo + 4);

    return out;
    // 说明：offsetsCount 仅用于文档；真正的条目数在 encodeAllocator 内写入
  }

  /**
   * 便捷方法：根据文件名清单生成 .DS_Store。
   * 默认给每个名字附一条 Iloc（图标位置）记录，看起来更真实。
   * @param {string[]} names
   * @param {object} [opts] { extra: {name: [{structId,type,value}]} } 额外属性
   * @returns {Uint8Array}
   */
  function buildFromNames(names, opts) {
    opts = opts || {};
    var entries = [];
    names.forEach(function (name, idx) {
      // 每个文件一条图标位置记录（16 字节 blob：x, y, 8 字节保留）
      var iloc = new Uint8Array(16);
      var dv = new DataView(iloc.buffer);
      dv.setUint32(0, 40 + (idx % 6) * 80);   // x
      dv.setUint32(4, 40 + Math.floor(idx / 6) * 80); // y
      dv.setUint32(8, 0xffffffff);
      dv.setUint32(12, 0xffff0000);
      entries.push({ name: name, structId: 'Iloc', type: 'blob', value: iloc });

      if (opts.extra && opts.extra[name]) {
        opts.extra[name].forEach(function (e) {
          entries.push({ name: name, structId: e.structId, type: e.type, value: e.value });
        });
      }
    });
    return build(entries);
  }

  function encodeRecord(rec) {
    var nameBytes = utf16beBytes(rec.name);
    var valBuf = encodeValue(rec.type, rec.value);
    var total = 4 + nameBytes.length + 4 + 4 + valBuf.length;
    var buf = new Uint8Array(total);
    var dv = new DataView(buf.buffer);
    var pos = 0;
    dv.setUint32(pos, rec.name.length); pos += 4;
    buf.set(nameBytes, pos); pos += nameBytes.length;
    writeFourcc(buf, pos, rec.structId); pos += 4;
    writeFourcc(buf, pos, rec.type); pos += 4;
    buf.set(valBuf, pos);
    return buf;
  }

  function encodeValue(type, value) {
    switch (type) {
      case 'bool': {
        var b = new Uint8Array(1); b[0] = value ? 1 : 0; return b;
      }
      case 'long':
      case 'shor': {
        var l = new Uint8Array(4); new DataView(l.buffer).setInt32(0, value | 0); return l;
      }
      case 'type': {
        var t = new Uint8Array(4); writeFourcc(t, 0, value); return t;
      }
      case 'blob': {
        var data = value instanceof Uint8Array ? value : new Uint8Array(value);
        var out = new Uint8Array(4 + data.length);
        new DataView(out.buffer).setUint32(0, data.length);
        out.set(data, 4);
        return out;
      }
      case 'ustr': {
        var sb = utf16beBytes(value);
        var uo = new Uint8Array(4 + sb.length);
        new DataView(uo.buffer).setUint32(0, value.length);
        uo.set(sb, 4);
        return uo;
      }
      case 'comp':
      case 'dutc': {
        var c = new Uint8Array(8);
        var cv = new DataView(c.buffer);
        cv.setUint32(0, (value && value.hi) || 0);
        cv.setUint32(4, (value && value.lo) || 0);
        return c;
      }
      default:
        throw new Error('不支持的编码类型 "' + type + '"');
    }
  }

  function encodeAllocator(offsets, toc) {
    // count + unused + 256 偏移 + tocCount + toc + 32 个空闲桶
    var padded = (offsets.length + 255) & ~255;
    var tocNames = Object.keys(toc);
    var tocSize = 4;
    tocNames.forEach(function (n) { tocSize += 1 + n.length + 4; });
    var size = 8 + padded * 4 + tocSize + 32 * 4;
    var buf = new Uint8Array(size);
    var dv = new DataView(buf.buffer);
    var pos = 0;
    dv.setUint32(pos, offsets.length); pos += 4;
    dv.setUint32(pos, 0); pos += 4;
    for (var i = 0; i < padded; i++) {
      dv.setUint32(pos, i < offsets.length ? offsets[i] : 0); pos += 4;
    }
    dv.setUint32(pos, tocNames.length); pos += 4;
    tocNames.forEach(function (n) {
      buf[pos] = n.length; pos += 1;
      for (var k = 0; k < n.length; k++) { buf[pos] = n.charCodeAt(k) & 0xff; pos += 1; }
      dv.setUint32(pos, toc[n]); pos += 4;
    });
    // 32 个空闲桶，全部为空
    for (var f = 0; f < 32; f++) { dv.setUint32(pos, 0); pos += 4; }
    return buf;
  }

  // ── 小工具 ──
  function utf16beBytes(str) {
    var out = new Uint8Array(str.length * 2);
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      out[i * 2] = (code >> 8) & 0xff;
      out[i * 2 + 1] = code & 0xff;
    }
    return out;
  }
  function writeFourcc(buf, pos, str) {
    for (var i = 0; i < 4; i++) buf[pos + i] = str.charCodeAt(i) & 0xff;
  }
  function nextPow2(n) {
    var p = 1;
    while (p < n) p <<= 1;
    return p;
  }
  function log2(n) {
    var i = 0;
    while ((1 << i) < n) i++;
    return i;
  }
  function align32(n) {
    return (n + 31) & ~31;
  }

  var api = {
    parse: parse,
    build: build,
    buildFromNames: buildFromNames,
    describeStruct: describeStruct,
    STRUCT_INFO: STRUCT_INFO,
    _internal: {
      nextPow2: nextPow2, log2: log2, align32: align32, utf16beBytes: utf16beBytes
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DSStore = api;
  }
})(typeof window !== 'undefined' ? window : this);
