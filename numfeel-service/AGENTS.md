# AI Coding Guidelines — numfeel-service

## Language & JDK

- **Java 17**. Use modern language features: `var`, `switch` expressions, text blocks.
- **DTOs must be Java records**, not plain classes. Request/response records go under `controller.dto` with Javadoc on every field.

## Reactive Stack

- All I/O is non-blocking. Use **Reactor `Mono<T>` and `Flux<T>`** for return types.
- **Never call `.block()`** in controller or service code. The only acceptable place for `.block()` is in `@Test` methods or a one-shot startup runner.
- Blocking I/O (e.g. GeoIP2 file reads, Jieba dictionary loading, blocking HTTP clients) **must be offloaded** via `Mono.fromCallable(() -> ...).subscribeOn(Schedulers.boundedElastic())` or `Mono.fromRunnable(() -> ...).subscribeOn(Schedulers.boundedElastic())`.
- Use `Mono.defer()` when constructing a reactive chain whose work must happen at subscription time (e.g. building a fresh bucket from cache).

## Layer Separation

- **Controllers are thin**: validate input, delegate to service, wrap result with `ApiResponse`. No business logic.
- **Business logic lives in `@Service` classes**. Services are constructor-injected, never use `@Autowired` on fields.
- **Database queries**: prefer raw SQL via `DatabaseClient` over `selectAll()` + Java stream filtering — especially for aggregations, counts, and statistical queries. Use `R2dbcEntityTemplate` for simple CRUD.

## API Responses

- `ApiResponse.ok(data)` → `{"status":200,"data":<data>}`, HTTP 200.
- `ApiResponse.error(status, message)` → `{"status":<status>,"message":"<msg>"}`, HTTP status matches.
- Do not construct raw `ResponseEntity` with custom JSON; always use `ApiResponse`.

## Rate Limiting & Cache

- **Bucket4j** for per-IP rate limiting. Rules are defined in `RateLimitWebFilter` — add new rules there, not inline in controllers.
- **Caffeine** for local cache. Always set a TTL. Use `.expireAfterAccess()` or `.expireAfterWrite()` appropriately.

## Threading

- **No `new Thread()`**. Use `Executors.newSingleThreadExecutor()` or `Executors.newFixedThreadPool()` and assign the executor to a `static final` field.
- Always shut down custom executors via `@PreDestroy` or a shutdown hook.

## Logging

- Use **SLF4J** (`org.slf4j.Logger` / `org.slf4j.LoggerFactory`). Lombok `@Slf4j` is acceptable.
- **Catch blocks must log**, never empty. Log the exception message and at minimum warn-level. Use `log.warn("description: {}", e.getMessage())` pattern — do not log full stack traces unless at debug/trace level.

## Tests

- **JUnit 5** (`org.junit.jupiter.api`) + **Mockito** (`org.mockito`).
- Test class naming: `*Test.java` under `src/test/java/` (not `*Tests` or `Test*`).
- Use `StepVerifier` (`reactor-test`) for testing reactive streams.
- Keep tests focused: mock external dependencies, test one behavior per method.

## Jackson

- Jackson annotations use the **`tools.jackson`** package (not `com.fasterxml`).
- Import example: `import tools.jackson.databind.JsonNode;`, `import tools.jackson.annotation.JsonProperty;`.

## Javadoc

- **All public methods** must have Javadoc describing what they do, parameters, and return value.
- Use `/** ... */` style. Keep it concise but informative.
