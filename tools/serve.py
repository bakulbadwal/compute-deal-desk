#!/usr/bin/env python3
"""Serve the lab locally with caching off (ES modules + WebAssembly need http://, not file://).

    python3 tools/serve.py          # http://localhost:8817
"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm"}
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8817
    print(f"Compute Deal Desk on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
