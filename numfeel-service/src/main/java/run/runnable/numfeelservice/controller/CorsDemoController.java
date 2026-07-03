package run.runnable.numfeelservice.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.CorsDemoService;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

import java.util.Map;

/**
 * 「跨域请求限制实验室」HTTP 处理器。
 * <p>
 * 路径前缀 {@code /cors-lab}：
 * <ul>
 *   <li>{@code GET  /cors-lab/me}        — 受害者账户余额（受 CORS 策略保护）</li>
 *   <li>{@code POST /cors-lab/transfer}  — 转账（form-urlencoded，简单请求，即便跨域被拦也会真正扣款）</li>
 *   <li>{@code GET  /cors-lab/policy}    — 当前 CORS 策略</li>
 *   <li>{@code POST /cors-lab/policy}    — 切换 CORS 策略</li>
 *   <li>{@code GET  /cors-lab/transfers} — 转账流水</li>
 *   <li>{@code POST /cors-lab/reset}     — 重置账户</li>
 * </ul>
 * 控制类接口（policy / transfers / reset）的跨域放行由全局 WebConfig 负责，前端随时可读写；
 * 受害者接口（me / transfer）的跨域行为由 {@code CorsLabFilter} 按策略动态决定。
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

    /** 受害者账户余额。 */
    @GetMapping("/me")
    public Mono<ResponseEntity<JsonNode>> me() {
        return service.getMe().map(ApiResponse::ok);
    }

    /**
     * 转账。故意只接受 {@code application/x-www-form-urlencoded}——
     * 这是一个「简单请求」，浏览器不会先发预检，请求会直接送达服务端并真正扣款，
     * 用来演示「CORS 拦的是响应读取，拦不住请求发出」。
     */
    @PostMapping("/transfer")
    public Mono<ResponseEntity<JsonNode>> transfer(ServerWebExchange exchange) {
        return exchange.getFormData()
                .flatMap(form -> {
                    int amount = parseAmount(form.getFirst("amount"));
                    return service.transfer(amount);
                })
                .map(ApiResponse::ok)
                .onErrorResume(err -> {
                    return Mono.just(ApiResponse.error(400, "转账失败: " + err.getMessage()));
                });
    }

    /** 当前 CORS 策略。 */
    @GetMapping("/policy")
    public Mono<ResponseEntity<JsonNode>> policy() {
        return service.getPolicy().map(ApiResponse::ok);
    }

    /** 切换 CORS 策略。 */
    @PostMapping("/policy")
    public Mono<ResponseEntity<JsonNode>> setPolicy(@RequestBody Map<String, Object> body) {
        Object raw = body.get("mode");
        String mode = raw == null ? null : raw.toString();
        return service.setPolicy(mode).map(ApiResponse::ok);
    }

    /** 转账流水。 */
    @GetMapping("/transfers")
    public Mono<ResponseEntity<JsonNode>> transfers() {
        return service.listTransfers().map(ApiResponse::ok);
    }

    /** 重置账户。 */
    @PostMapping("/reset")
    public Mono<ResponseEntity<JsonNode>> reset() {
        return service.reset().map(ApiResponse::ok);
    }

    private static int parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            return CorsDemoService.DEFAULT_TRANSFER_CENTS;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return CorsDemoService.DEFAULT_TRANSFER_CENTS;
        }
    }
}
