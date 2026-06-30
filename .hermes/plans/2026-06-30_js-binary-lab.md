# JS 二进制编译实验室 — 实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 在 NumFeel 中新增「JS → 二进制 实验室」演示页面，包含编译对比、二进制内窥、在线编译三个板块。

**Architecture:**
- 板块 1/2：一次性 Docker 容器编译 + 数据采集，导出 JSON 放入 resources，容器用完即删。
- 板块 3：qjsc + gcc 直接装进**后端 Docker 镜像**，ProcessBuilder 在本进程内执行，**不额外起容器**。前端只展示 2-3 个预设场景，用户选择后点编译。
- 进度通过 WebSocket 实时推送。

**Tech Stack:** Java 17 + Spring Boot WebFlux + WebSocket, QuickJS qjsc + gcc（装入后端镜像）, Bun/Node/pkg（仅板块 1/2 数据采集用）, HTML/CSS/JS + Chart.js

---

## 概览

```
numfeel-service/
├── scripts/
│   └── compile-lab/
│       ├── Dockerfile              # 编译环境镜像（QuickJS + Bun + Node + pkg）
│       ├── test-sample.js          # 标准测试脚本
│       ├── compile-compare.sh      # 板块1: 编译对比数据采集
│       └── binary-anatomy.sh       # 板块2: 二进制解剖数据采集
├── Dockerfile                       # ★ 修改：安装 qjsc + gcc
├── src/main/resources/data/
│   ├── js-binary-comparison.json   # 预计算结果（git跟踪）
│   └── js-binary-anatomy.json      # 预计算结果（git跟踪）
├── src/main/java/.../controller/JsBinaryLabController.java
├── src/main/java/.../service/JsBinaryLabService.java
├── src/main/java/.../web/JsBinaryLabWebSocketHandler.java
└── src/main/java/.../config/WebSocketConfig.java   （修改）

numfeel-site/
└── pages/js-binary-lab/
    ├── index.html
    ├── app.js
    ├── engine.js
    ├── engine.test.js
    └── style.css
```

---

## Task 1: 创建数据采集用 Docker 镜像（仅板块 1/2 用）

**Objective:** 构建包含 QuickJS、Bun、Node、pkg 的镜像，**仅用于一次性数据采集**，不用于板块 3。

**Files:**
- Create: `numfeel-service/scripts/compile-lab/Dockerfile`
- Create: `numfeel-service/scripts/compile-lab/test-sample.js`

**Dockerfile:**

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl xz-utils gcc make libc6-dev binutils python3 \
    && rm -rf /var/lib/apt/lists/*

# QuickJS
RUN curl -fsSL https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz | tar xJ \
    && cd quickjs-2024-01-13 \
    && make -j$(nproc) \
    && cp qjsc /usr/local/bin/ && cp qjs /usr/local/bin/ \
    && cd .. && rm -rf quickjs-2024-01-13

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Node + pkg
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pkg@5.8.1

WORKDIR /workspace
COPY test-sample.js /workspace/
```

**test-sample.js:**

```javascript
function fib(n) { if (n <= 1) return n; return fib(n-1) + fib(n-2); }
function bench() {
    var start = Date.now();
    var f = fib(35);
    var j = JSON.stringify({a:1,b:[2,3],c:"hello".repeat(100)});
    var p = JSON.parse(j);
    return { fib35: f, timeMs: Date.now() - start };
}
console.log(JSON.stringify(bench()));
```

**验证:**
```bash
cd numfeel-service/scripts/compile-lab
docker build -t js-compile-lab .
docker run --rm js-compile-lab qjs /workspace/test-sample.js
```

---

## Task 2: 板块1 — 编译对比数据采集

**Objective:** Docker 编译同一段 JS，采集体积/启动时间/内存，输出 JSON。

**Files:**
- Create: `numfeel-service/scripts/compile-lab/compile-compare.sh`

**脚本逻辑**（伪代码，实际用 bash）:
- qjsc 编译 → gcc → 产物 `out-qjs`
- bun build --compile → `out-bun`
- pkg → `out-pkg`
- 每个产物各跑 50 次，取中位数启动时间
- `/usr/bin/time -v` 取峰值内存
- 输出 JSON 数组，每项：`{tool, size, coldStartMs, peakMemKb, desc}`

**验证:**
```bash
bash numfeel-service/scripts/compile-lab/compile-compare.sh /tmp/js-binary-comparison.json
python3 -m json.tool /tmp/js-binary-comparison.json
```

---

## Task 3: 板块2 — 二进制解剖数据采集

**Objective:** strings + readelf + Python 按熵值分段，生成热力图数据。

**Files:**
- Create: `numfeel-service/scripts/compile-lab/binary-anatomy.sh`

**输出 JSON 每项:**
```json
{
  "tool": "QuickJS qjsc",
  "size": 245360,
  "strings": ["node_modules", "test-sample", "fib", ...],
  "sections": [{"name":".text","offset":"0x...","size":"0x..."}, ...],
  "segments": [{"offset":0,"size":1024,"type":"text"}, {"offset":1024,"size":512,"type":"zero"}, ...]
}
```

`segments` 按 256 字节窗口扫描：全部 0 → `zero`，70%+ 可打印 → `text`，其他 → `data`。

**验证:**
```bash
bash numfeel-service/scripts/compile-lab/binary-anatomy.sh /tmp/js-binary-anatomy.json
python3 -c "import json; d=json.load(open('/tmp/js-binary-anatomy.json')); print(f'{len(d)} tools, ok')"
```

---

## Task 4: 拷贝数据 + 后端 REST 端点

**Objective:** JSON 放入 resources，创建 Controller 提供 `GET /api/js-binary/comparison` 和 `/anatomy`。

**Files:**
- Create: `numfeel-service/src/main/resources/data/js-binary-comparison.json`
- Create: `numfeel-service/src/main/resources/data/js-binary-anatomy.json`
- Create: `numfeel-service/src/main/java/run/runnable/numfeelservice/controller/JsBinaryLabController.java`
- Modify: `numfeel-service/src/main/java/run/runnable/numfeelservice/controller/dto/UtilityResponses.java`

**Controller 两个端点:**
```java
@RestController
@RequestMapping("/api/js-binary")
public class JsBinaryLabController {
    @GetMapping("/comparison")
    public Mono<JsonNode> comparison() { /* 读取 classpath:data/js-binary-comparison.json */ }

    @GetMapping("/anatomy")
    public Mono<JsonNode> anatomy() { /* 读取 classpath:data/js-binary-anatomy.json */ }
}
```

使用 `Mono.fromCallable + Schedulers.boundedElastic()`（文件 I/O 阻塞）。

**验证:**
```bash
curl http://localhost:8080/api/js-binary/comparison | python3 -m json.tool
curl http://localhost:8080/api/js-binary/anatomy | python3 -m json.tool
```

---

## Task 5: 板块3 — 后端 Service + WebSocket（ProcessBuilder 直接编译，不额外起容器）

**Objective:** 
- 把 qjsc + gcc 装进后端 Docker 镜像
- Service 用 ProcessBuilder 直接调用 qjsc + gcc
- WebSocket 实时推送编译进度和产物

**Files:**
- Modify: `numfeel-service/Dockerfile`
- Create: `numfeel-service/src/main/java/run/runnable/numfeelservice/service/JsBinaryLabService.java`
- Create: `numfeel-service/src/main/java/run/runnable/numfeelservice/web/JsBinaryLabWebSocketHandler.java`
- Modify: `numfeel-service/src/main/java/run/runnable/numfeelservice/config/WebSocketConfig.java`
- Modify: `numfeel-service/src/main/java/run/runnable/numfeelservice/controller/dto/UtilityRequests.java`

### Step 1: 修改后端 Dockerfile

在现有 Dockerfile 中添加 qjsc + gcc：

```dockerfile
FROM ibm-semeru-runtimes:open-17-jre

# 安装编译工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

# QuickJS（编译安装）
RUN curl -fsSL https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz | tar xJ \
    && cd quickjs-2024-01-13 \
    && make -j$(nproc) \
    && cp qjsc /usr/local/bin/ \
    && cp qjs /usr/local/bin/ \
    && cd .. && rm -rf quickjs-2024-01-13

# ... 保留原有的 JAR 复制和 ENTRYPOINT
```

### Step 2: Service 核心逻辑

```java
@Service
@Slf4j
public class JsBinaryLabService {

    // 3 个预设场景的 JS 源码
    static final Map<String, String> SCENARIOS = Map.of(
        "fib", "function fib(n) { if (n<=1) return n; return fib(n-1)+fib(n-2); }\nconsole.log('fib(35)=', fib(35));\n",
        "sort", "var arr=[]; for(var i=0;i<10000;i++) arr.push(Math.random());\nvar t=Date.now(); arr.sort(function(a,b){return a-b;});\nconsole.log('sorted 10000 in', Date.now()-t, 'ms');\n",
        "strings", "var s='Hello JS Binary Lab! '.repeat(1000);\nconsole.log('length:', s.split(' ').join('-').length);\n"
    );

    public Mono<Path> compile(String scenario, ProgressCallback cb) {
        return Mono.fromCallable(() -> {
            var js = SCENARIOS.get(scenario);
            var tmp = Files.createTempDirectory("js-compile-");
            var jsFile = tmp.resolve("input.js");
            Files.writeString(jsFile, js);

            // 阶段1: qjsc → C
            cb.onProgress("qjsc 编译", 20, "JS → C 代码...");
            runCmd(tmp, new String[]{"qjsc", "-o", "out.c", "input.js"}, cb, 20, 50);

            // 阶段2: gcc → 二进制
            cb.onProgress("GCC 编译", 60, "C → 原生二进制...");
            runCmd(tmp, new String[]{"gcc", "-O2", "out.c", "-o", "output", "-lm"}, cb, 60, 95);

            var output = tmp.resolve("output");
            cb.onProgress("完成", 100, "产物大小: " + Files.size(output) + " bytes");
            return output;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private void runCmd(Path workDir, String[] cmd, ProgressCallback cb,
                        int pFrom, int pTo) throws Exception {
        var pb = new ProcessBuilder(cmd).directory(workDir.toFile()).redirectErrorStream(true);
        var proc = pb.start();
        try (var reader = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                cb.onProgress("编译中", pFrom + (pTo-pFrom)/2, 
                              line.length()>200 ? line.substring(0,200)+"..." : line);
            }
        }
        if (proc.waitFor() != 0) throw new RuntimeException("编译失败");
    }
}
```

### Step 3: WebSocket Handler

收到 JSON `{"scenario":"fib"}` 后：
1. 调用 `service.compile(scenario, progress → session.sendMessage(json(progress)))`
2. 成功 → 读取产物 base64 → `{"type":"download","data":"<base64>","filename":"output-fib","size":12345}`
3. 失败 → `{"type":"error","message":"..."}`

**安全措施:**
- 只接受 3 个 preset scenario，其他返回 error
- 编译超时 30s（Process.waitFor(30, TimeUnit.SECONDS)）
- 临时文件编译完删除
- 写入接口受现有 Bucket4j 限流保护

### Step 4: 注册 WebSocket 路由

`WebSocketConfig.java` 添加:
```java
mapping.setUrlMap(Map.of(
    "/transport-lab/ws", transportLabHandler,
    "/js-binary-lab/ws", jsBinaryLabHandler  // 新增
));
```

**验证:**
```bash
# 用 websocat 测试
echo '{"scenario":"fib"}' | websocat ws://localhost:8080/js-binary-lab/ws
# 预期产出多条 progress JSON → 最后 download（含 base64）
```

---

## Task 6: 前端 — 页面框架 + 板块1（编译对比图）

**Files:**
- Create: `numfeel-site/pages/js-binary-lab/index.html`
- Create: `numfeel-site/pages/js-binary-lab/app.js`
- Create: `numfeel-site/pages/js-binary-lab/engine.js`
- Create: `numfeel-site/pages/js-binary-lab/style.css`

**index.html 布局:**

```
.hdr → 标题「JS → 二进制 实验室」 + 简介
.tabs → [📊 编译对比] [🔬 二进制内窥] [⚡ 在线编译]

.section-tab1 (默认显示):
  .controls → [体积] [启动时间] [内存] 三按钮切换
  canvas#chart → Chart.js 柱状图
  .tool-cards → 每个工具的说明卡片（原理简述）

.section-tab2 (隐藏):
  select#toolSelect → 工具选择
  canvas#heatmap → 热力图 Canvas
  .detail → 选中 segment 详情 + strings 折叠列表

.section-tab3 (隐藏):
  .scenario-cards → 3 个预设场景卡片（fib / sort / strings），点击选中
  .source-view → 只读 textarea 显示选中场景源码
  .compile-btn → [编译] 按钮
  .progress-bar → 进度条 + 百分比
  .compile-log → 滚动日志区（等宽字体深色背景）
  .download-btn → [下载产物] 按钮（编译完成后显示）
```

遵循现有规范：深色渐变 `#1a1a2e→#16213e→#0f3460`，金色标题 shimmer，卡片式，Tabler Icons。

---

## Task 7: 前端 — 板块1 渲染逻辑

**app.js:**
- 加载 `/api/js-binary/comparison` → 渲染 Chart.js 柱状图
- 三个模式按钮切换指标（size / coldStartMs / peakMemKb）
- 表格底部展示所有工具的完整数据

**engine.js:**
```javascript
var JsBinaryEngine = {
    formatSize: function(bytes) { /* return "234 KB" */ },
    sortByMetric: function(data, metric) { /* return sorted copy */ },
    segmentColors: function(segments) { /* text→蓝 data→紫 zero→深灰 */ }
};
```

---

## Task 8: 前端 — 板块2 二进制内窥

**实现方案:**
- Canvas 画热力图，宽 100%，按 segment 偏移比例绘制色块
- 鼠标悬停 tooltip：偏移量、大小、类型
- 下方 ELF section 表格 + strings 可折叠列表
- 工具选择下拉切换不同产物的解剖数据

---

## Task 9: 前端 — 板块3 在线编译

**交互流程:**
1. 三个预设场景卡片（fib / sort / strings），点击高亮选中 → 显示场景源码
2. 点「编译」→ WebSocket 连接 `wss://numfeel-api.996.ninja/js-binary-lab/ws`
3. 发送 `{"scenario":"fib"}`
4. 接收进度 → 进度条更新 + 日志追加
5. 收到 `download` → 进度条 100% + 显示下载按钮 → 点击触发浏览器下载

**WebSocket 重连 + 超时:** 30s 无响应提示超时，编译中禁止重复点击。

---

## Task 10: 测试 + 首页集成

**Files:**
- Create: `numfeel-site/pages/js-binary-lab/engine.test.js`
- Modify: `numfeel-site/data/demos.json`
- Create: `numfeel-service/src/test/java/.../controller/JsBinaryLabControllerTest.java`
- Create: `numfeel-service/src/test/java/.../service/JsBinaryLabServiceTest.java`

**demos.json 新增:**
```json
{
  "href": "pages/js-binary-lab/",
  "icon": "ti-binary-tree-2",
  "title": "JS → 二进制 实验室",
  "desc": "JavaScript 能编译成二进制吗？Bun / QuickJS / pkg 真实对比，亲手编译一段代码看看。"
}
```
分类: `tech`

**运行同步:**
```bash
cd numfeel-site && python3 scripts/sync.py
node pages/js-binary-lab/engine.test.js
```

---

## Task 11: 构建 + 部署验证

```bash
# 1. 跑数据采集
bash numfeel-service/scripts/compile-lab/compile-compare.sh
bash numfeel-service/scripts/compile-lab/binary-anatomy.sh
# 拷贝 JSON 到 resources/data/

# 2. 构建新后端镜像（含 qjsc + gcc）
cd numfeel-service
docker build -t registry.cn-hongkong.aliyuncs.com/runnable-run/numfeel-service:latest .

# 3. 验证容器内可直接编译
docker run --rm numfeel-service:latest qjsc --help
docker run --rm numfeel-service:latest gcc --version
```

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `numfeel-service/Dockerfile` | **修改** | 安装 gcc + qjsc |
| `numfeel-service/scripts/compile-lab/Dockerfile` | 新建 | 数据采集镜像 |
| `numfeel-service/scripts/compile-lab/test-sample.js` | 新建 | 标准测试脚本 |
| `numfeel-service/scripts/compile-lab/compile-compare.sh` | 新建 | 板块1数据采集 |
| `numfeel-service/scripts/compile-lab/binary-anatomy.sh` | 新建 | 板块2数据采集 |
| `numfeel-service/src/main/resources/data/js-binary-comparison.json` | 新建 | 预计算对比数据 |
| `numfeel-service/src/main/resources/data/js-binary-anatomy.json` | 新建 | 预计算解剖数据 |
| `numfeel-service/.../controller/JsBinaryLabController.java` | 新建 | REST 端点 |
| `numfeel-service/.../service/JsBinaryLabService.java` | 新建 | ProcessBuilder 编译 |
| `numfeel-service/.../web/JsBinaryLabWebSocketHandler.java` | 新建 | WebSocket 进度 |
| `numfeel-service/.../config/WebSocketConfig.java` | 修改 | 注册新路由 |
| `numfeel-service/.../controller/dto/UtilityRequests.java` | 修改 | 编译请求 DTO |
| `numfeel-service/.../controller/dto/UtilityResponses.java` | 修改 | 编译响应 DTO |
| `numfeel-site/pages/js-binary-lab/index.html` | 新建 | |
| `numfeel-site/pages/js-binary-lab/app.js` | 新建 | |
| `numfeel-site/pages/js-binary-lab/engine.js` | 新建 | |
| `numfeel-site/pages/js-binary-lab/engine.test.js` | 新建 | |
| `numfeel-site/pages/js-binary-lab/style.css` | 新建 | |
| `numfeel-site/data/demos.json` | 修改 | 新增卡片 |
