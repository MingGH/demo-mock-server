/**
 * presets.js - .DS_Store 解剖器的预设场景数据（纯逻辑，无 DOM 依赖）
 *
 * 每个预设描述一个「真实可能泄露」的目录：被泄露的公司官网根目录、
 * 交接 U 盘、设计师交付的压缩包、误提交的开源仓库、网盘公开的桌面备份。
 *
 * 这些场景演示了一个事实：哪怕你只把 .DS_Store 上传到了公网，
 * 它内部记录的文件名清单就足够让攻击者按图索骥地访问你的敏感文件。
 *
 * 给个别文件附一条 cmmt(ustr) 备注，进一步演示「连 Spotlight 注释都会泄露」。
 */
(function (root) {
  'use strict';

  /**
   * 预设场景列表
   * @type {Array<{id:string,name:string,note:string,names:string[],danger:string[],extra?:Object}>}
   *   - id     场景唯一标识
   *   - name   场景中文名
   *   - note   一句灰色说明，给卡片用
   *   - names  目录里出现的文件名清单（会被写进 .DS_Store）
   *   - danger names 的子集，标记危险文件（前端高亮红色）
   *   - extra  可选，{ 文件名: [{structId,type,value}] } 给某些文件附加属性
   */
  var PRESETS = [
    {
      id: 'company-site',
      name: '公司官网根目录',
      note: '开发者用 Mac 编辑过线上文件后忘了清理，.DS_Store 跟着部署到了生产服务器',
      names: [
        'index.html',
        'robots.txt',
        'favicon.ico',
        'backup.zip',
        'database.sql',
        '.env',
        'admin',
        'config.php',
        '.DS_Store'
      ],
      danger: ['backup.zip', 'database.sql', '.env', 'admin', 'config.php'],
      extra: {
        'config.php': [{ structId: 'cmmt', type: 'ustr', value: '数据库连接配置，别提交' }]
      }
    },
    {
      id: 'usb-handover',
      name: '同事交接的 U 盘',
      note: '离职同事把个人文件和工作文件混在一起，整个 U 盘都在 macOS 上用过',
      names: [
        '简历.docx',
        '身份证正面.jpg',
        '身份证背面.jpg',
        '银行卡照片.png',
        '工资条.xlsx',
        '通讯录.csv',
        '密码本.txt'
      ],
      danger: ['身份证正面.jpg', '身份证背面.jpg', '银行卡照片.png', '工资条.xlsx', '密码本.txt'],
      extra: {
        '密码本.txt': [{ structId: 'cmmt', type: 'ustr', value: '重要！包含所有账号密码' }]
      }
    },
    {
      id: 'designer-zip',
      name: '设计师交付的压缩包',
      note: '解压后留下的 .DS_Store，记录了设计师本地的完整工作目录',
      names: [
        '设计稿_v3.fig',
        '设计稿_v3导出.png',
        '字体包.zip',
        '源文件.psd',
        '客户清单.xlsx',
        '报价单.docx',
        '内部沟通记录.txt'
      ],
      danger: ['客户清单.xlsx', '报价单.docx', '内部沟通记录.txt'],
      extra: {
        '报价单.docx': [{ structId: 'cmmt', type: 'ustr', value: '底价 8 折，别低于这个' }]
      }
    },
    {
      id: 'opensource-repo',
      name: '开源项目仓库',
      note: '开发者没加 .gitignore，.DS_Store 被误提交到了 GitHub 公开仓库',
      names: [
        'README.md',
        'LICENSE',
        'package.json',
        '.gitignore',
        'src',
        'public',
        'node_modules',
        '.env.local',
        'secrets.json',
        'deploy.sh'
      ],
      danger: ['.env.local', 'secrets.json', 'deploy.sh'],
      extra: {
        'deploy.sh': [{ structId: 'cmmt', type: 'ustr', value: '生产服务器密码在 1Password' }]
      }
    },
    {
      id: 'desktop-backup',
      name: '网盘公开的桌面备份',
      note: '顺手把整个 Mac 桌面打包传到网盘，分享链接忘了设密码',
      names: [
        '截图1.png',
        '截图2.png',
        '微信图片.jpg',
        '工作汇报.pptx',
        '报销单.pdf',
        '临时.txt',
        '未命名文件夹'
      ],
      danger: ['报销单.pdf', '工作汇报.pptx'],
      extra: {
        '工作汇报.pptx': [{ structId: 'cmmt', type: 'ustr', value: '周一董事会用，别外传' }]
      }
    }
  ];

  /**
   * 判断一个文件名是否「危险」。
   * 既看 preset.danger 的显式标记，也按扩展名/关键词兜底，
   * 这样上传真实 .DS_Store 时也能自动给 .sql/.zip/.env/admin 标红。
   * @param {string} name 文件名
   * @param {string[]} [dangerList] 预设里显式标记的危险清单
   * @returns {boolean}
   */
  function isDangerous(name, dangerList) {
    if (dangerList && dangerList.indexOf(name) !== -1) return true;
    var lower = (name || '').toLowerCase();
    var dangerExts = ['.sql', '.zip', '.bak', '.env', '.pem', '.key', '.dump'];
    for (var i = 0; i < dangerExts.length; i++) {
      if (lower.indexOf(dangerExts[i]) !== -1) return true;
    }
    var dangerKeywords = ['admin', 'password', 'secret', 'backup', 'config', '身份证', '银行卡', '密码'];
    for (var j = 0; j < dangerKeywords.length; j++) {
      if (lower.indexOf(dangerKeywords[j]) !== -1) return true;
    }
    return false;
  }

  /**
   * 根据预设生成一份合法的 .DS_Store 字节。
   * 内部调用 DSStore.buildFromNames，把预设的 names + extra（cmmt 备注）写进去。
   * @param {{names:string[], extra?:Object}} preset 预设对象
   * @param {Object} dsstore DSStore 模块（避免硬耦合全局，便于 node 测试注入）
   * @returns {Uint8Array}
   */
  function buildPreset(preset, dsstore) {
    var DS = dsstore || (typeof DSStore !== 'undefined' ? DSStore : null);
    if (!DS) throw new Error('buildPreset 需要 DSStore 模块');
    return DS.buildFromNames(preset.names, { extra: preset.extra || {} });
  }

  /**
   * 按 id 取预设。找不到返回 null。
   * @param {string} id
   * @returns {Object|null}
   */
  function getPreset(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  var api = {
    PRESETS: PRESETS,
    buildPreset: buildPreset,
    isDangerous: isDangerous,
    getPreset: getPreset
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DSStorePresets = api;
  }
})(typeof window !== 'undefined' ? window : this);
