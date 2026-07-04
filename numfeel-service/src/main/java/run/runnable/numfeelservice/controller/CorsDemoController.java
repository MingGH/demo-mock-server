package run.runnable.numfeelservice.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.CorsDemoService;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

import java.util.Map;

/**
 * 「跨域请求限制实验室」HTTP 处理器。
 * <p>
 * 路径前缀 {@code /cors-lab}，所有会话相关接口都用 query 参数 {@code t} 传 token——
 * 故意走 query 而非自定义 header，避免给 GET /me 平添预检，保住「简单请求」的演示前提。
 * <ul>
 *   <li>{@code POST /cors-lab/session}            — 建会话，返回 token（无需 t）</li>
 *   <li>{@code GET  /cors-lab/me?t=}               — 受害者账户余额（受会话 CORS 策略保护）</li>
 *   <li>{@code POST /cors-lab/transfer?t=}         — 转账（form-urlencoded，简单请求，即便跨域被拦也会真正扣款）</li>
 *   <li>{@code GET  /cors-lab/policy?t=}           — 当前 CORS 策略</li>
 *   <li>{@code POST /cors-lab/policy?t=}           — 切换 CORS 策略</li>
 *   <li>{@code GET  /cors-lab/transfers?t=}        — 转账流水</li>
 *   <li>{@code POST /cors-lab/reset?t=}            — 重置账户</li>
 * </ul>
 * 控制类接口（session / policy / transfers / reset）的跨域放行由全局 WebConfig 负责，前端随时可读写；
 * 受害者接口（me / transfer）的跨域行为由 {@code CorsLabFilter} 按会话策略动态决定。
 * <p>
 * 本控制器只做入参校验与委托，CORS 头部一律不在此处理。
 */
@RestController
@RequestMapping("/cors-lab")
public class CorsDemoController {

    private final CorsDemoService service;

    public CorsDemoController(CorsDemoService service) {
        this.service = service;
    }

    /** 建立新会话，返回 token 与初始余额。 */
    @PostMapping("/session")
    public Mono<ResponseEntity<JsonNode>> session() {
        return service.createSession().map(ApiResponse::ok);
    }

    /** 受害者账户余额。 */
    @GetMapping("/me")
    public Mono<ResponseEntity<JsonNode>> me(@RequestParam(value = "t", required = false) String token) {
        return service.getMe(token).map(ApiResponse::ok);
    }

    /**
     * 转账。故意只接受 {@code application/x-www-form-urlencoded}——
     * 这是一个「简单请求」，浏览器不会先发预检，请求会直接送达服务端并真正扣款，
     * 用来演示「CORS 拦的是响应读取，拦不住请求发出」。
     */
    @PostMapping("/transfer")
    public Mono<ResponseEntity<JsonNode>> transfer(
            @RequestParam(value = "t", required = false) String token,
            @RequestParam(value = "amount", defaultValue = "10000") int amount) {
        return service.transfer(token, amount).map(ApiResponse::ok);
    }

    /** 当前 CORS 策略。 */
    @GetMapping("/policy")
    public Mono<ResponseEntity<JsonNode>> policy(@RequestParam(value = "t", required = false) String token) {
        return service.getPolicy(token).map(ApiResponse::ok);
    }

    /** 切换 CORS 策略。 */
    @PostMapping("/policy")
    public Mono<ResponseEntity<JsonNode>> setPolicy(
            @RequestParam(value = "t", required = false) String token,
            @RequestBody Map<String, Object> body) {
        Object raw = body.get("mode");
        String mode = raw == null ? null : raw.toString();
        return service.setPolicy(token, mode).map(ApiResponse::ok);
    }

    /** 转账流水。 */
    @GetMapping("/transfers")
    public Mono<ResponseEntity<JsonNode>> transfers(@RequestParam(value = "t", required = false) String token) {
        return service.listTransfers(token).map(ApiResponse::ok);
    }

    /** 重置账户。 */
    @PostMapping("/reset")
    public Mono<ResponseEntity<JsonNode>> reset(@RequestParam(value = "t", required = false) String token) {
        return service.reset(token).map(ApiResponse::ok);
    }
}
