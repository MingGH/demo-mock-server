package run.runnable.numfeelservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.AvatarRiskService;
import run.runnable.numfeelservice.service.AvatarRiskService.ScenarioState;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.ApiResponse;
import run.runnable.numfeelservice.web.ClientIp;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 「外链头像安全实验室」HTTP 处理器。
 * <p>
 * POST /avatar-risk/session                — 创建 session，返回 token 和头像 URL
 * GET  /avatar-risk/avatar/{token}         — 头像图片（行为受场景开关控制）
 * POST /avatar-risk/toggle                 — 切换某个场景开关
 * GET  /avatar-risk/state/{token}          — 查询当前场景开关
 * GET  /avatar-risk/logs/{token}           — 查询访问日志（展示泄露的 IP/UA/Referer）
 * GET  /avatar-risk/stats                  — 全局统计
 */
@RestController
@RequestMapping("/avatar-risk")
public class AvatarRiskController {

    private static final Logger log = LoggerFactory.getLogger(AvatarRiskController.class);

    private static final Pattern TOKEN_PATTERN = Pattern.compile("^[a-f0-9]{32}$");
    private static final Pattern SCENARIO_PATTERN = Pattern.compile("^(horror|redirect|authPrompt|slow|oversized|broken)$");

    private final AvatarRiskService service;

    /** 缓存正常 / 恐怖头像图片字节，启动后加载一次。 */
    private volatile byte[] normalAvatar;
    private volatile byte[] horrorAvatar;

    public AvatarRiskController(AvatarRiskService service) {
        this.service = service;
    }

    /** 创建新 session。 */
    @PostMapping("/session")
    public Mono<ResponseEntity<JsonNode>> createSession() {
        return service.createSession()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("createSession failed: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /** 切换场景开关。 */
    @PostMapping("/toggle")
    public Mono<ResponseEntity<JsonNode>> toggle(@RequestBody Map<String, Object> body) {
        String token = stringOf(body.get("token"));
        String scenario = stringOf(body.get("scenario"));
        Object rawEnabled = body.get("enabled");
        if (token == null || !TOKEN_PATTERN.matcher(token).matches()) {
            throw ApiException.badRequest("Invalid token");
        }
        if (scenario == null || !SCENARIO_PATTERN.matcher(scenario).matches()) {
            throw ApiException.badRequest("Invalid scenario");
        }
        boolean enabled = rawEnabled instanceof Boolean b ? b : Boolean.parseBoolean(stringOf(rawEnabled));
        return service.toggleScenario(token, scenario, enabled)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("toggle failed: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /** 查询当前场景开关。 */
    @GetMapping("/state/{token}")
    public Mono<ResponseEntity<JsonNode>> state(@PathVariable String token) {
        if (!TOKEN_PATTERN.matcher(token).matches()) {
            throw ApiException.badRequest("Invalid token");
        }
        return service.getState(token)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("state failed: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /** 查询访问日志。 */
    @GetMapping("/logs/{token}")
    public Mono<ResponseEntity<JsonNode>> logs(@PathVariable String token) {
        if (!TOKEN_PATTERN.matcher(token).matches()) {
            throw ApiException.badRequest("Invalid token");
        }
        return service.getLogs(token)
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("logs failed: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /** 全局统计。 */
    @GetMapping("/stats")
    public Mono<ResponseEntity<JsonNode>> stats() {
        return service.stats()
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    log.warn("stats failed: {}", err.getMessage());
                    return Mono.just(ApiResponse.error(500, "Internal error"));
                });
    }

    /**
     * 头像图片接口 —— 演示核心。
     * <p>
     * 不同的场景开关组合决定服务端如何响应：可能正常返图、可能弹出 401 鉴权框、
     * 可能 302 跳到内网地址、可能延迟、可能 404……
     */
    @GetMapping("/avatar/{token}")
    public Mono<ResponseEntity<?>> avatar(@PathVariable String token, ServerWebExchange exchange) {
        if (!TOKEN_PATTERN.matcher(token).matches()) {
            return Mono.just(ResponseEntity.status(HttpStatus.BAD_REQUEST).body((Object) "Invalid token"));
        }
        String ip = ClientIp.resolve(exchange.getRequest());
        String ua = headerOrUnknown(exchange, HttpHeaders.USER_AGENT);
        String referer = headerOrUnknown(exchange, HttpHeaders.REFERER);

        ScenarioState state = service.resolveForFetch(token, ip, ua, referer);
        if (state == null) {
            return Mono.just(ResponseEntity.status(HttpStatus.NOT_FOUND).body((Object) "Session expired"));
        }

        // 场景：404 失效
        if (state.broken()) {
            return Mono.just(ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body((Object) "Image not found"));
        }

        // 场景：401 + WWW-Authenticate，浏览器弹账号密码框（钓鱼）
        if (state.authPrompt()) {
            return Mono.just(ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .header(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"请登录以查看头像\"")
                    .contentType(MediaType.TEXT_PLAIN)
                    .body((Object) "Authentication required"));
        }

        // 场景：302 重定向到 localhost:8080（伪图片URL其实是攻击载荷）
        if (state.redirect()) {
            return Mono.just(ResponseEntity.status(HttpStatus.FOUND)
                    .location(URI.create("http://localhost:8080/admin?stolen_avatar_token=" + token))
                    .body((Object) "Redirecting..."));
        }

        // 场景：延迟 8 秒
        Mono<ResponseEntity<?>> body = Mono.fromCallable(() -> buildImageResponse(state))
                .map(r -> (ResponseEntity<?>) r);

        if (state.slow()) {
            body = body.delayElement(Duration.ofSeconds(8));
        }
        return body;
    }

    /** 根据场景状态构造图片响应。 */
    private ResponseEntity<Object> buildImageResponse(ScenarioState state) throws IOException {
        byte[] payload;
        if (state.oversized()) {
            // 演示"流量炸弹"：返回 10MB 的填充数据（仍然是合法 JPEG 头 + 大量 padding）
            byte[] base = loadNormalAvatar();
            payload = new byte[10 * 1024 * 1024];
            System.arraycopy(base, 0, payload, 0, base.length);
            // 剩余部分用 0xFF 填充（不会改变浏览器对前面有效 JPEG 段的解析）
            for (int i = base.length; i < payload.length; i++) {
                payload[i] = (byte) 0xFF;
            }
        } else if (state.horror()) {
            payload = loadHorrorAvatar();
        } else {
            payload = loadNormalAvatar();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Avatar-Mode",
                        state.horror() ? "horror" : (state.oversized() ? "oversized" : "normal"))
                .body((Object) payload);
    }

    private byte[] loadNormalAvatar() throws IOException {
        if (normalAvatar == null) {
            normalAvatar = readClasspath("static/avatar-risk/avatar-normal.jpeg");
        }
        return normalAvatar;
    }

    private byte[] loadHorrorAvatar() throws IOException {
        if (horrorAvatar == null) {
            horrorAvatar = readClasspath("static/avatar-risk/avatar-horror.jpeg");
        }
        return horrorAvatar;
    }

    private static byte[] readClasspath(String path) throws IOException {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return in.readAllBytes();
        }
    }

    private static String headerOrUnknown(ServerWebExchange exchange, String name) {
        String v = exchange.getRequest().getHeaders().getFirst(name);
        return v == null || v.isBlank() ? "(空)" : v;
    }

    private static String stringOf(Object o) {
        return o == null ? null : o.toString();
    }
}
