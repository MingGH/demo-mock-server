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
 * GET /sri/demo-hash         — 返回正常版本的 SHA-384 哈希（供前端 integrity 属性使用）
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
     * 正常版本：在模拟银行页面上不做任何事（脚本只是一个空操作）。
     */
    private static final String NORMAL_SCRIPT = """
            (function() {
              // 正常的第三方脚本 — 例如一个无害的 analytics 库
              // 不修改页面，不窃取数据
              var el = document.getElementById('script-status');
              if (el) {
                el.textContent = '第三方脚本已加载 (analytics.js v3.2.1)';
                el.className = 'script-status normal';
              }
            })();
            """;

    /**
     * "恶意"版本：在模拟银行页面上注入键盘记录、伪造弹窗。
     */
    private static final String TAMPERED_SCRIPT = """
            (function() {
              var el = document.getElementById('script-status');
              if (el) {
                el.textContent = '第三方脚本已加载 (analytics.js v3.2.1 — 已被篡改)';
                el.className = 'script-status hacked';
              }

              // 1. 键盘记录 — 截获所有输入框内容
              var logPanel = document.getElementById('keylog-panel');
              if (logPanel) logPanel.style.display = 'block';

              var inputs = document.querySelectorAll('input');
              inputs.forEach(function(input) {
                input.addEventListener('input', function() {
                  var log = document.getElementById('keylog-content');
                  if (!log) return;
                  var label = input.getAttribute('placeholder') || input.type;
                  log.innerHTML += '<div class="log-line"><span class="log-field">' + label + ':</span> ' + input.value + '</div>';
                  log.scrollTop = log.scrollHeight;
                });
                // 红色边框提示被监听
                input.style.boxShadow = '0 0 0 2px rgba(255,50,50,0.6)';
              });

              // 2. 3秒后弹出伪造的"安全验证"覆盖层
              setTimeout(function() {
                var overlay = document.getElementById('phishing-overlay');
                if (overlay) overlay.style.display = 'flex';
              }, 3000);

              // 3. 读取 cookie 并显示
              var cookieEl = document.getElementById('stolen-cookie');
              if (cookieEl) {
                cookieEl.textContent = document.cookie || 'session_token=a8f3...x2k; uid=10492';
              }
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
