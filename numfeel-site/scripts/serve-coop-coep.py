#!/usr/bin/env python3
"""带跨域隔离头（COOP/COEP）的静态文件服务器。

用途：部分 demo（如知乎动态头像注入器）用到 ffmpeg.wasm 多线程版，
依赖 SharedArrayBuffer，浏览器要求页面满足跨域隔离：
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
普通 `python -m http.server` 不发这些头，此脚本补齐。

用法：
  python3 scripts/serve-coop-coep.py [端口]   # 默认 8900
然后访问 http://127.0.0.1:8900/pages/zhihu-dynamic-avatar/
"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8900
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        # 允许 CDN 资源被跨域嵌入（jsdelivr 已带 CORP: cross-origin，这里不再限制）
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        super().end_headers()

    def log_message(self, fmt, *args):  # 简化日志
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print(f'Serving {ROOT}')
        print(f'COOP/COEP enabled at http://127.0.0.1:{PORT}/')
        print(f'Demo: http://127.0.0.1:{PORT}/pages/zhihu-dynamic-avatar/')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
