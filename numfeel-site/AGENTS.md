# AI 编码规范 — numfeel-site

交互式技术/数学演示页面合集。**纯原生 HTML/CSS/JavaScript + Chart.js，无构建工具、无打包、纯静态部署。**

## 技术栈与约束

- **不引入构建工具、框架或打包器**（无 React/Vue/Webpack/Vite/TS）。页面用浏览器直接打开即可运行。
- 第三方库通过 CDN `<script>` / `<link>` 引入（如 Chart.js、Tabler Icons `ti`）。**允许并鼓励使用成熟的第三方库**，只要满足两个条件：
  1. 提供官方 CDN 分发（jsDelivr / unpkg / cdnjs 皆可），能通过 `<script src="https://...">` 直接引入，不需要 npm/构建；
  2. 是 UMD/IIFE/全局变量形态，不依赖 ES Module 打包器解析。
- **推荐库清单**（按需使用，不必为了用而用）：
  - 图表：Chart.js / ECharts / D3
  - 动画过渡：GSAP、anime.js、Motion One（UMD 版本）、Web Animations API
  - 交互手势：Hammer.js、interact.js
  - UI 微交互：Popper.js（tooltip）、Sortable.js（拖拽排序）
  - 工具：Lodash（按需模块）、dayjs、mathjs
  - 3D/物理：three.js、matter.js
- **禁止**：任何需要 `import` / JSX / TS 语法、需要预编译的库（如 framer-motion、React 相关生态）。如果只有 ESM 版本，需从 esm.sh 之类的转换 CDN 取，且必须放在 `<script type="module">` 中并做 fallback 说明。
- **优先第三方库而非手写**：以下场景不要自己撸底层实现，直接用现成库：
  - 复杂缓动 / 时间轴动画 → GSAP 或 anime.js（比 `@keyframes` 灵活得多）
  - 图表 → Chart.js / ECharts
  - 手势识别 → Hammer.js
  - 拖拽 → Sortable.js / interact.js
- 图标统一使用 **Tabler Icons**（`<i class="ti ti-xxx"></i>`），通过 `components/header.js` 全局引入 CDN。**不要用 emoji 作为图标**。
- JS 语法使用**现代 ES6+（ES2017 级别）**：`const`/`let`、箭头函数、模板字符串、解构、可选链 `?.`、`Set`/`Map` 等均可直接使用——现代浏览器与 Node 原生支持，无需转译。避免使用需要构建/转译的语法（JSX / TS / 装饰器等）。第三方库内部语法不受此约束。

## 目录组织

两种组织方式，**新页面优先使用「独立目录」方式**：

- **独立目录**（推荐，复杂演示）：`pages/<demo-name>/`，内含 `index.html`、`app.js`、`style.css`，逻辑较重时拆出 `engine.js` / `logic.js`，测试为 `<demo-name>.test.js` 或 `engine.test.js`。
- **单文件页面**（简单演示）：`pages/<demo-name>.html`，配套逻辑放 `pages/<demo-name>-logic.js`，测试放 `pages/<demo-name>.test.js`。

公共组件放 `components/`（如 `header.js` / `header.css`），静态数据放 `data/`，图片放 `images/` 或页面目录下的 `images/`。

## 逻辑与 DOM 分离

- **核心计算逻辑必须与 DOM 解耦**，放在 `engine.js` / `logic.js` 中，做到纯函数、不直接操作 `document`，以便独立单元测试。
- `app.js` 负责 DOM 绑定、事件处理、渲染，调用 engine/logic 中的纯函数。
- 每个导出函数写 JSDoc（`/** ... */`），标注 `@param` 和 `@returns`。

## 模块导出（兼容浏览器与 Node 测试）

逻辑文件结尾用条件导出，使其既能被浏览器 `<script>` 直接使用，也能被 Node 测试 `require`：

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcScore: calcScore, /* ... */ };
}
```

## 视觉规范

统一的深色科技风，让所有演示页面观感一致：

- 背景：深色渐变（`linear-gradient` `#1a1a2e` → `#16213e` → `#0f3460`）。
- 标题：金色 + shimmer 动画。
- 布局：卡片式、圆角、响应式，必须移动端可用（触摸手势合理、布局自适应）。
- 每个页面自带 `style.css`；公共头部样式复用 `components/header.css`，不要在各页面重复造轮子。

### 颜色语义（必须遵守，用颜色引导读者）

- 金色 `#ffd700`：重点结果、关键数值、标题、当前激活状态
- 蓝色 `#90caf9`：提示框、参考值、辅助说明
- 绿色 `#81c784`：成功/完成、正确答案、入门难度标签（`tag-easy`）
- 红色 `#ff6b6b`：警告、危险操作、失败、丢失事件
- 紫色 `#ce93d8`：趣味性、动手实验标签（`tag-fun`）
- 橙色：中等难度标签（`tag-medium`）
- 灰色 `#888`：说明文字、次要信息

## 交互设计原则

页面要做到"一打开就知道看什么、做什么"：

1. **零门槛启动**：打开即有默认数据/示例在跑，不要求用户先做任何操作。
2. **首屏可见核心交互**：最重要的操作（Hero 区 + 大按钮）放首屏，不让用户猜。
3. **预设场景卡片**：提供 3-5 个精选参数组合，点击即可体验，不要求用户自己想输入。
4. **渐进式深入**：基础体验 → 参数调节 → 过程/动画可视化 → 进阶对比；分步交互让用户每步看到中间结果，不要一键自动跑完。
5. **每个模块开头**用一句灰色小字说明目的和操作方式。
6. 提供"复制"功能方便分享结果。

## 测试

- 用 **Node.js 直接运行**，无测试框架依赖：`node pages/<demo>/<name>.test.js`。
- 测试文件顶部用 `require` 加载逻辑模块；需要的全局变量（如 `DIMENSIONS`、`QUESTIONS`）先挂到 `global` 上再加载。
- 自行实现 `assert(condition, msg)` / `assertClose(actual, expected, tol, msg)`，用 `console.log('✅ ...')` / `console.error('❌ ...')` 输出，结尾统计 `passed` / `failed`。
- 只测纯逻辑，不测 DOM。覆盖：核心算法正确性、边界条件、固定随机数下的可复现结果。
- **修改测试文件后必须运行该测试确认通过。**

## 首页与数据管理

- 卡片数据源：`data/demos.json`，按分类组织（`probability` / `gambling` / `finance` / `game-theory` / `math` / `psychology` / `fun` / `tech`）。
- `index.html` 通过**内联 JSON** 渲染卡片（不用 `fetch`，避免 `file://` CORS 问题）；不要用外部 `<script src="data/demos.js">` 加载数据，服务器 MIME 配置会导致失败。
- `data/demos.json` 中的中文引号必须用「」而非 `""`，避免与 JSON 双引号冲突。
- **新增 demo 后必须运行同步脚本**：
  ```bash
  python3 scripts/sync.py
  ```
  该脚本会自动更新 `index.html` 卡片、`sitemap.xml`、`README.md` 演示列表，并为 `pages/*.html` 注入 `meta description`（已有则跳过）。

## 数据资源下载（仅含真实数据集的页面）

- 若页面使用**可独立下载的真实数据集**（CSV/JSON 数据集、IP 地理库、直播实录等，非纯算法模拟），考虑添加"下载数据集"按钮跳转下载站。
- 纯算法/概率模拟页面**不需要**下载功能。
- 运行时自动下载的数据目录（如 `data/HuChenFeng/`、`data/GeoLite2/`）已在 `.gitignore` 中，不入库。

## 后端 API 调用

- 后端基址：生产环境 `https://numfeel-api.996.ninja`。需要引用线上链接时直接使用，不要用 localhost 或占位符。
- **统一响应格式**：成功 `{"status":200,"data":...}`，失败 `{"status":xxx,"message":"..."}`。前端取数据前先判断 `status === 200` 再读 `data`。
- 写接口（各种 `/submit`）有 IP 限流，需处理 **429** 响应（提示用户稍后再试，不要无限重试）。

## 如何给新 demo 加埋点

**以后新 demo 优先用通用埋点（`components/track.js`，`window.NFTrack`），不要再为每个 demo
新建 submit/stats 表和接口**，除非需要排行榜这类必须服务端权威校验的功能（如需要防作弊重算、
需要展示"前 10 名"这种强一致排名）。通用埋点是给"写数据分析文章"用的过程数据，
不是给每个 demo 单独造一套计数器。

用法：

```js
NFTrack.track('press', { idx: 1, win: true, wealth: 899995 });     // 记一个事件
NFTrack.trackOnce('session_start', { mode: 'standard' });          // 整个会话只记一次
```

- **slug 自动推导**：`window.NFTrack` 从 `location.pathname` 自动解析 demo slug
  （`/pages/<slug>/` 或 `/pages/<slug>.html`），页面不需要手动声明，也不需要引入额外脚本，
  `components/header.js` 已经全局注入了 `track.js`。
- **props 只能放 number / boolean / 短字符串**（≤64 字符），最多 20 个 key。
  嵌套对象、数组会被静默丢弃，不会报错也不会中断上报。
- **绝对不能把用户输入的任何文本放进 props**（昵称、输入框内容等），这属于埋点隐私红线，
  不是格式限制。
- 高频事件（比如每次点击都触发的 `press`）**不要**加进 `window.NF_TRACK_UMAMI_MIRROR` 白名单，
  只有低频里程碑事件（`session_end`、`bankrupt` 这类）才适合镜像到 umami。
- **先想清楚要回答什么问题，再定事件和字段**。不要先把能拿到的字段都塞进去，
  而是反过来想："如果我要写一篇分析这个 demo 的文章，需要区分哪些人群、算哪些分布？"
  然后倒推需要哪些事件、哪些字段（可参考 `docs/analytics/wealth-button.sql` 里每条 SQL
  开头的注释，那些就是从"要回答的问题"倒推出的事件设计）。
- 埋点调用必须是安全的：`NFTrack` 未加载、上报失败都不能抛异常或阻塞页面，
  SDK 内部已经做了 try/catch 兜底，业务代码调用时不需要再包一层。
- **`visibilitychange → hidden` 不等于用户离开**：切到别的标签页 / App / 锁屏都会触发，
  切后台**不要**当作会话结束（否则回来再按会重开一局、清掉峰值/里程碑）。真正离页用
  `pagehide` 兜底。这是所有 demo 的通用坑，新 demo 的收尾事件一律用 `pagehide` 发。

## 如何给 demo 挂知乎配套文章反链

从 SEO / 知乎流量进 demo 页的访客，需要能一键跳回对应的知乎深度文。机制是**配置驱动 + 全局注入**，
**不需要改动任何 demo 页面**：

- `components/header.js` 已全局注入 `components/zhihu-link.js`，所有页面自动具备该能力。
- 只需编辑 `data/zhihu-links.json`，以 **demo slug** 为 key，值为单篇对象或对象数组（一对多）：

  ```json
  {
    "benfords-law": { "url": "https://zhuanlan.zhihu.com/p/xxx", "title": "本福特定律：数字也会说谎" },
    "monty-hall-simulator": [
      { "url": "https://zhuanlan.zhihu.com/p/yyy", "title": "三门问题解开篇" },
      { "url": "https://zhuanlan.zhihu.com/p/zzz" }
    ]
  }
  ```

  数组会按顺序渲染多张反链卡片（都能点开不同的知乎文章）。

- slug 推导规则与 NFTrack 一致：`/pages/benfords-law.html` → `benfords-law`，
  `/pages/sample-inference/` → `sample-inference`。
- **有配置就展示**页面顶部反链卡片；**无配置 / 加载失败就静默不渲染**，绝不影响页面。
- key 以 `_` 开头（如 `_sample`）视为说明条目，不会渲染。
- 反链卡片渲染失败会被 try/catch 兜底，不影响 demo 主体功能。

## Git 提交规范

- 使用 **Conventional Commits**：`feat: 新增xxx演示页面` / `fix: 修复xxx` / `chore: 更新首页卡片数据`。`docs:` 前缀仅用于项目文档（README 等）。
- 新增演示页面的一次提交应包含：`pages/xxx.html`（或页面目录）、对应 `*.test.js`、`data/demos.json`，以及 sync 脚本更新的 `index.html` / `sitemap.xml` / `README.md`。
- **严禁 `git add -f` / `--force` 绕过 `.gitignore`**；提交前确认 staged 文件不含被忽略的私有内容。

## 新增演示页面交付清单

1. `pages/xxx.html`（或 `pages/<demo>/` 目录）——交互式演示页面，遵循上述视觉与交互规范，无任何调试/内部痕迹。
2. 对应 `*.test.js`——`node` 可直接运行的单元测试。
3. `data/demos.json`——在对应分类中添加卡片数据。
4. 运行 `python3 scripts/sync.py` 同步 `index.html` / `sitemap.xml` / `README.md`。
5. 运行前端测试确认全部通过。
