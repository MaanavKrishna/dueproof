"""A stand-in for signed-URL storage (R2, Vercel Blob, the app's local disk):
GET serves files from a folder, PUT keeps what it receives in memory. Runs on
127.0.0.1 in a thread, for the engine's end-to-end tests and for recording
fixtures. Paths ending in "/fail" answer 500 to exercise error handling."""
from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class StorageServer:
    def __init__(self, folder: Path):
        self.folder = Path(folder)
        self.stored: dict[str, tuple[str, bytes]] = {}
        self.extra: dict[str, bytes] = {}
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):          # quiet
                pass

            def do_GET(self):
                name = self.path.lstrip("/").split("?")[0]
                body = outer.extra.get(name)
                if body is None:
                    path = (outer.folder / name).resolve()
                    if outer.folder.resolve() not in path.parents or not path.is_file():
                        self.send_response(404)
                        self.end_headers()
                        return
                    body = path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_PUT(self):
                if self.path.endswith("/fail"):
                    self.send_response(500)
                    self.end_headers()
                    return
                length = int(self.headers.get("Content-Length") or 0)
                outer.stored[self.path.lstrip("/")] = (self.headers.get("Content-Type", ""),
                                                       self.rfile.read(length))
                self.send_response(200)
                self.end_headers()

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def url(self, name: str) -> str:
        return f"{self.base}/{name}"

    def __enter__(self) -> "StorageServer":
        self.thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
