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
     * "恶意"版本：模拟攻击行为 — 读取真实浏览器信息，让用户感知到代码真正在执行。
     */
    private static final String TAMPERED_SCRIPT = """
            (function() {
              var container = document.getElementById('sri-demo-status');
              if (!container) return;

              // ── 真实读取用户环境信息 ──
              var ua = navigator.userAgent;
              var lang = navigator.language;
              var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              var screen = window.screen.width + 'x' + window.screen.height;
              var cores = navigator.hardwareConcurrency || '?';
              var mem = navigator.deviceMemory ? navigator.deviceMemory + 'GB' : '未知';
              var platform = navigator.platform || '未知';
              var cookies = document.cookie || '(HttpOnly 不可读，但 JS 可读的已窃取)';
              var lsKeys = [];
              try { for(var i=0;i<localStorage.length&&i<5;i++) lsKeys.push(localStorage.key(i)); } catch(e){}

              container.innerHTML = '<div class="status-hacked">' +
                '<div class="status-icon">\\u26A0\\uFE0F</div>' +
                '<div class="status-title">恶意脚本正在执行</div>' +
                '<div class="status-desc">这不是模拟文本，以下是脚本此刻从你的浏览器中读取到的真实数据：</div>' +
                '<div class="stolen-data">' +
                  '<div class="data-row"><span class="data-label">\\uD83D\\uDCBB 系统</span><span class="data-value">' + platform + '</span></div>' +
                  '<div class="data-row"><span class="data-label">\\uD83C\\uDF10 语言/时区</span><span class="data-value">' + lang + ' / ' + tz + '</span></div>' +
                  '<div class="data-row"><span class="data-label">\\uD83D\\uDDA5 分辨率</span><span class="data-value">' + screen + '</span></div>' +
                  '<div class="data-row"><span class="data-label">\\u2699\\uFE0F CPU核心</span><span class="data-value">' + cores + ' 核 / 内存 ' + mem + '</span></div>' +
                  '<div class="data-row"><span class="data-label">\\uD83C\\uDF6A Cookie</span><span class="data-value cookie-val">' + (cookies.substring(0,60) || '空') + '</span></div>' +
                  '<div class="data-row"><span class="data-label">\\uD83D\\uDCC2 LocalStorage</span><span class="data-value">' + (lsKeys.length ? lsKeys.join(', ') : '空') + '</span></div>' +
                '</div>' +
                '<div class="upload-progress">' +
                  '<div class="progress-text" id="progress-text">\\u2B06\\uFE0F 正在上传到 evil-server.com...</div>' +
                  '<div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>' +
                '</div>' +
                '<div class="keylog-section">' +
                  '<div class="keylog-title">\\u2328\\uFE0F 键盘记录器 (已激活)</div>' +
                  '<div class="keylog-hint">试试在下面的输入框打字 \\u2193</div>' +
                  '<input type="text" class="keylog-input" id="keylog-input" placeholder="输入密码试试..." autocomplete="off" />' +
                  '<div class="keylog-output" id="keylog-output"></div>' +
                '</div>' +
                '</div>';
              container.className = 'status-container hacked';

              // 页面抖动效果
              document.body.style.animation = 'shake 0.3s ease-in-out 3';
              var style = document.createElement('style');
              style.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}';
              document.head.appendChild(style);

              // 上传进度条动画
              var fill = document.getElementById('progress-fill');
              var pText = document.getElementById('progress-text');
              var progress = 0;
              var timer = setInterval(function() {
                progress += Math.random() * 15 + 5;
                if (progress >= 100) {
                  progress = 100;
                  clearInterval(timer);
                  if (pText) pText.textContent = '\\u2705 数据已上传完毕 — 攻击者已获得你的所有信息';
                  if (fill) fill.style.background = '#ff6b6b';
                }
                if (fill) fill.style.width = progress + '%';
              }, 400);

              // 真实键盘记录
              var input = document.getElementById('keylog-input');
              var output = document.getElementById('keylog-output');
              if (input && output) {
                input.addEventListener('input', function() {
                  output.textContent = '\\u{1F4E1} 已截获: ' + input.value;
                });
                input.focus();
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
