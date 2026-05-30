# AI 编码规范 — numfeel-service

## 语言与 JDK

- **Java 17**。使用现代语言特性：`var`、`switch` 表达式、文本块。
- **DTO 必须使用 Java record**，不得使用普通类。请求/响应 record 放在 `controller.dto` 包下，每个字段必须写 Javadoc。

## 反应式规范

- 所有 I/O 必须非阻塞。返回值统一使用 **Reactor `Mono<T>` 和 `Flux<T>`**。
- **绝对禁止在 Controller 或 Service 代码中调用 `.block()`**。`.block()` 只允许出现在 `@Test` 方法或一次性启动 Runner 中。
- 阻塞 I/O（如 GeoIP2 文件读取、Jieba 词典加载、阻塞式 HTTP 客户端）**必须脱离事件循环**，使用 `Mono.fromCallable(() -> ...).subscribeOn(Schedulers.boundedElastic())` 或 `Mono.fromRunnable(() -> ...).subscribeOn(Schedulers.boundedElastic())`。
- 当响应式链的构建逻辑必须在订阅时执行时（例如从缓存构建新桶），使用 `Mono.defer()`。

## 分层规范

- **Controller 必须是薄层**：仅做入参校验、委托 Service、用 `ApiResponse` 包裹结果。不得包含业务逻辑。
- **业务逻辑集中在 `@Service` 类中**。Service 统一使用构造器注入，禁止 `@Autowired` 字段注入。
- **数据库查询**：聚合、计数、统计类查询优先使用 `DatabaseClient` 原生 SQL，禁止 `selectAll()` 全量加载后 Java stream 内存过滤。简单 CRUD 使用 `R2dbcEntityTemplate`。

## API 响应格式

- `ApiResponse.ok(data)` → `{"status":200,"data":<data>}`，HTTP 200。
- `ApiResponse.error(status, message)` → `{"status":<status>,"message":"<msg>"}`，HTTP 状态码与 status 一致。
- 不得自行构造 `ResponseEntity` + 自定义 JSON；统一使用 `ApiResponse`。

## 限流与缓存

- **Bucket4j** 实现 IP 级别限流。规则统一在 `RateLimitWebFilter` 中定义，不得在 Controller 中内联限流逻辑。
- **Caffeine** 作为本地缓存。必须设置 TTL，根据场景选择 `.expireAfterAccess()` 或 `.expireAfterWrite()`。

## 线程

- **禁止 `new Thread()`**。使用 `Executors.newSingleThreadExecutor()` 或 `Executors.newFixedThreadPool()`，并将 Executor 赋给 `static final` 字段。
- 自定义 Executor 必须通过 `@PreDestroy` 或 shutdown hook 关闭。

## 日志

- 使用 **SLF4J**（`org.slf4j.Logger` / `org.slf4j.LoggerFactory`）。允许使用 Lombok `@Slf4j`。
- **catch 块必须记录日志**，禁止空 catch。至少 warn 级别记录异常信息，使用 `log.warn("描述: {}", e.getMessage())` 模式，除非 debug/trace 级别否则不打印完整堆栈。

## 测试

- **JUnit 5**（`org.junit.jupiter.api`）+ **Mockito**（`org.mockito`）。
- 测试类命名：`*Test.java`，位于 `src/test/java/`（不得命名为 `*Tests` 或 `Test*`）。
- 测试反应式流使用 `StepVerifier`（`reactor-test`）。
- 保持测试聚焦：mock 外部依赖，每个测试方法只验证一个行为。

## Jackson

- Jackson 注解统一使用 **`tools.jackson`** 包（非 `com.fasterxml`）。
- 导入示例：`import tools.jackson.databind.JsonNode;`、`import tools.jackson.annotation.JsonProperty;`。

## Javadoc

- **所有 public 方法**必须写 Javadoc，包含方法说明、参数和返回值描述。
- 使用 `/** ... */` 风格。保持简洁但信息充分。
