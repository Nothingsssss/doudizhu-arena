"""启动擂台 + 直播网页。

用法：
    python server.py                     # 读取 config.json
    python server.py --config my.json --port 8000
然后用浏览器 / OBS 浏览器源打开 http://localhost:8000
"""
import argparse
import json
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from arena.cards import NAMES
from arena.game import Arena
from arena.players import make_player

ROOT = Path(__file__).parent
STATIC = ROOT / "static"


class Bus:
    """把擂台事件广播给所有浏览器；新连接会补发当前这一局的事件。"""

    def __init__(self):
        self.lock = threading.Lock()
        self.clients = []
        self.current_game = []
        self.last_snapshot = None

    def emit(self, kind, data):
        msg = json.dumps({"type": kind, "data": data}, ensure_ascii=False, default=_default)
        with self.lock:
            if kind == "game_start":
                self.current_game = []
            self.current_game.append(msg)
            if kind in ("game_start", "game_end"):
                self.last_snapshot = msg
            for q in list(self.clients):
                q.put(msg)
        print(f"[{kind}] {msg[:160]}", flush=True)

    def subscribe(self):
        q = queue.Queue()
        with self.lock:
            backlog = list(self.current_game)
            if self.last_snapshot and self.last_snapshot not in backlog:
                backlog.insert(0, self.last_snapshot)
            self.clients.append(q)
        for m in backlog:
            q.put(m)
        return q

    def unsubscribe(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)


def _default(o):
    if hasattr(o, "_asdict"):
        return o._asdict()
    raise TypeError(type(o))


def make_handler(bus):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path == "/events":
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                q = bus.subscribe()
                try:
                    while True:
                        try:
                            msg = q.get(timeout=15)
                            self.wfile.write(f"data: {msg}\n\n".encode())
                        except queue.Empty:
                            self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                finally:
                    bus.unsubscribe(q)
                return
            if self.path == "/names":
                return self._send(json.dumps(NAMES, ensure_ascii=False).encode(), "application/json")
            path = "index.html" if self.path in ("/", "") else self.path.lstrip("/")
            f = (STATIC / path).resolve()
            if STATIC.resolve() not in f.parents or not f.is_file():
                self.send_error(404)
                return
            ctype = {".html": "text/html", ".js": "application/javascript",
                     ".css": "text/css"}.get(f.suffix, "application/octet-stream")
            self._send(f.read_bytes(), ctype + "; charset=utf-8")

        def _send(self, body, ctype):
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(ROOT / "config.json"))
    ap.add_argument("--port", type=int, default=None)
    args = ap.parse_args()
    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))

    bus = Bus()
    players = [make_player(p) for p in cfg["players"]]
    a = cfg.get("arena", {})
    arena = Arena(players, bus.emit,
                  move_delay=a.get("move_delay", 1.5),
                  game_pause=a.get("game_pause", 8),
                  eliminate_forever=a.get("eliminate_forever", False),
                  seed=a.get("seed"))
    threading.Thread(target=arena.run_forever, kwargs={"max_games": a.get("max_games")},
                     daemon=True).start()

    port = args.port or cfg.get("port", 8000)
    print(f"直播页面: http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(bus)).serve_forever()


if __name__ == "__main__":
    main()
