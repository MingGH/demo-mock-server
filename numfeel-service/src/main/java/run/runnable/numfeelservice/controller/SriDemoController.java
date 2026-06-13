package run.runnable.numfeelservice.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * SRI 演示用动态脚本接口。
 * <p>
 * GET /sri/demo.js          — 正常脚本（显示安全状态）
 * GET /sri/demo.js?tampered=true — "篡改"版本（模拟恶意注入）
 * <p>
 * 前端 safe.html 用 integrity 属性引用此脚本（哈希基于正常版本计算），
 * unsafe.html 不加 integrity。当 tampered=true 时：
 * - safe.html：浏览器校验失败，拒绝执行 → 页面安全
 * - unsafe.html：恶意代码执行 → 页面被"攻击"
 */
@RestController
@RequestMapping("/sri")
public class SriDemoController {

    private static final MediaType JS_MEDIA_TYPE = MediaType.parseMediaType("application/javascript; charset=utf-8");

    /**
     * 正常版本：在页面上显示安全状态。
     */
    private static final String NORMAL_SCRIPT = """
            (function() {
              var container = document.getElementById('sri-demo-status');
              if (!container) return;
              container.innerHTML = '<div class="status-safe">' +
                '<div class="status-icon">\\u2705</div>' +
                '<div class="status-title">脚本正常加载</div>' +
                '<div class="status-desc">文件内容未被篡改，一切正常运行。</div>' +
                '</div>';
              container.className = 'status-container safe';
            })();
            """;

    /**
     * "恶意"版本：模拟攻击行为（键盘记录、Cookie窃取等视觉效果）。
     */
    private static final String TAMPERED_SCRIPT = """
            (function() {
              var container = document.getElementById('sri-demo-status');
              if (!container) return;
              container.innerHTML = '<div class="status-hacked">' +
                '<div class="status-icon">\\u26A0\\uFE0F</div>' +
                '<div class="status-title">CDN 已被篡改 — 恶意代码执行中</div>' +
                '<div class="status-desc">以下是攻击者正在做的事情：</div>' +
                '<ul class="attack-list">' +
                '<li class="attack-item" id="attack-1">\\u23F3 注入键盘记录器...</li>' +
                '<li class="attack-item" id="attack-2">\\u23F3 准备窃取 Cookie...</li>' +
                '<li class="attack-item" id="attack-3">\\u23F3 准备重定向到钓鱼页面...</li>' +
                '</ul>' +
                '</div>';
              container.className = 'status-container hacked';

              // 模拟逐步攻击动画
              var steps = [
                { id: 'attack-1', text: '\\u2705 键盘记录器已注入 — 所有按键被实时上报', delay: 800 },
                { id: 'attack-2', text: '\\u2705 Cookie 已窃取: session_id=a]3x...f2k', delay: 1600 },
                { id: 'attack-3', text: '\\u2705 3秒后将重定向到伪造登录页...', delay: 2400 }
              ];
              steps.forEach(function(step) {
                setTimeout(function() {
                  var el = document.getElementById(step.id);
                  if (el) { el.textContent = step.text; el.classList.add('done'); }
                }, step.delay);
              });

              // 模拟键盘记录：监听输入并显示
              var logBox = document.createElement('div');
              logBox.className = 'keylog-box';
              logBox.innerHTML = '<div class="keylog-title">\\uD83D\\uDC41 键盘记录器输出</div>' +
                '<div class="keylog-output" id="keylog-output">等待用户输入...</div>';
              container.appendChild(logBox);

              document.addEventListener('keydown', function(e) {
                var output = document.getElementById('keylog-output');
                if (output) {
                  var current = output.textContent;
                  if (current === '等待用户输入...') current = '';
                  output.textContent = current + e.key;
                }
              });
            })();
            """;

    @GetMapping(value = "/demo.js")
    public Mono<ResponseEntity<String>> demoScript(
            @RequestParam(value = "tampered", defaultValue = "false") boolean tampered) {
        String script = tampered ? TAMPERED_SCRIPT : NORMAL_SCRIPT;
        return Mono.just(
                ResponseEntity.ok()
                        .contentType(JS_MEDIA_TYPE)
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Cache-Control", "no-cache, no-store")
                        .body(script)
        );
    }

    /**
     * 返回正常版本脚本的 SHA-384 哈希值（供前端 integrity 属性使用）。
     */
    @GetMapping(value = "/demo-hash")
    public Mono<ResponseEntity<String>> demoHash() {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-384");
            byte[] hash = digest.digest(NORMAL_SCRIPT.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            String base64Hash = java.util.Base64.getEncoder().encodeToString(hash);
            String integrity = "sha384-" + base64Hash;
            return Mono.just(ResponseEntity.ok()
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(integrity));
        } catch (Exception e) {
            return Mono.just(ResponseEntity.internalServerError().body("Error computing hash"));
        }
    }
}
