"""启动 token争霸赛 + 直播网页。

用法：
    python server.py                     # 读取 config.json
    python server.py --config my.json --port 8000
然后用浏览器 / OBS 浏览器源打开 http://localhost:8000
"""
import argparse
import json
import queue
import threading
from urllib.parse import unquote, urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from arena.cards import NAMES
from arena.game import Arena, Tournament
from arena.players import make_player
from arena.voice import make_tts
from arena.demo import Showcase, demo_players, wrap_emit

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
            if kind in ("game_start", "game_end", "round_start", "round_end", "champion"):
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
            # 在锁内放入回放，保证新事件排在回放之后
            for m in backlog:
                q.put(m)
            q.put('{"type": "synced", "data": {}}')   # 回放结束，页面开始播放特效和音效
            self.clients.append(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)


AVATAR_EXT = (".png", ".webp", ".jpg", ".jpeg", ".gif")


def resolve_avatar(p, field="avatar", suffix=""):
    """头像：配置里写了网址就直接用；写了本地路径或没写，就到 static/avatars/ 找 <id>.png/.webp/.jpg。
    找不到返回空字符串，网页显示自动生成的徽章，不会出现裂图。"""
    av = (getattr(p, field, "") or "").strip()
    if av.startswith(("http://", "https://", "data:")):
        return av
    cands = [av] if av else []
    for stem in dict.fromkeys(filter(None, [p.id, p.code, p.code.lower(), f"{p.code}-{p.id}".lower() if p.code else ""])):
        cands += [f"avatars/{stem}{suffix}{e}" for e in AVATAR_EXT + tuple(x.upper() for x in AVATAR_EXT)]
    for c in cands:
        f = (STATIC / c.lstrip("/")).resolve()
        if STATIC.resolve() in f.parents and f.is_file():
            return c.lstrip("/")
    if suffix:
        return ""
    print(f"[avatar] {p.name}：没找到立绘，放一张图到 static/avatars/{p.id}.png（或 {p.code or p.id}.png）即可", flush=True)
    return ""


CUTIN_SCENES = ("bomb", "rocket", "alarm", "beat")


def resolve_cutins(p):
    """大招特写的场景图：配置里写了就用配置的，否则找 static/avatars/<id>-bomb.png 这类文件；都没有就不写（网页用立绘+表情）。"""
    out = {}
    given = getattr(p, "cutins", None) or {}
    for scene in CUTIN_SCENES:
        v = str(given.get(scene) or "").strip()
        if v.startswith(("http://", "https://", "data:")):
            out[scene] = v
            continue
        if v:
            f = (STATIC / v.lstrip("/")).resolve()
            if STATIC.resolve() in f.parents and f.is_file():
                out[scene] = v.lstrip("/")
            else:
                print(f"[cutin] {p.name}：找不到 static/{v}，{scene} 特写改用立绘", flush=True)
            continue
        found = resolve_avatar(type("P", (), {"id": p.id, "code": p.code, "img": ""})(), "img", f"-{scene}")
        if found:
            out[scene] = found
    return out


def resolve_live2d(p):
    """Live2D 模型：检查 model3.json 是否在 static/ 里真实存在，不存在就不启用（网页继续显示立绘）。"""
    cfg = getattr(p, "live2d", None)
    if not cfg:
        return None
    model = str(cfg.get("model") or "").strip().lstrip("/")
    if not model.endswith(".model3.json"):
        print(f"[live2d] {p.name}：model 必须是 .model3.json 路径，已忽略", flush=True)
        return None
    f = (STATIC / model).resolve()
    if STATIC.resolve() not in f.parents or not f.is_file():
        print(f"[live2d] {p.name}：找不到 static/{model}，继续使用立绘图片", flush=True)
        return None
    return {**cfg, "model": model}


def _default(o):
    if hasattr(o, "_asdict"):
        return o._asdict()
    raise TypeError(type(o))


def make_handler(bus):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if path == "/events":
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
            if path == "/names":
                return self._send(json.dumps(NAMES, ensure_ascii=False).encode(), "application/json")
            path = "index.html" if path in ("/", "") else path.lstrip("/")
            f = (STATIC / path).resolve()
            if STATIC.resolve() not in f.parents or not f.is_file():
                self.send_error(404)
                return
            text = {".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
                    ".frag": "text/plain", ".vert": "text/plain", ".md": "text/plain"}
            binary = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".aac": "audio/aac",
                      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
                      ".gif": "image/gif", ".svg": "image/svg+xml"}
            if f.suffix in text:
                ctype = text[f.suffix] + "; charset=utf-8"
            else:
                ctype = binary.get(f.suffix.lower(), "application/octet-stream")
            self._send(f.read_bytes(), ctype)

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
    ap.add_argument("--demo", action="store_true", help="演示模式：机器人打牌，保证所有牌型都出现")
    args = ap.parse_args()
    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))

    bus = Bus()
    a = cfg.get("arena", {})
    emit, dealer = bus.emit, None
    if args.demo or a.get("demo"):
        showcase = Showcase()
        players = demo_players(cfg["players"], showcase)
        emit, dealer = wrap_emit(bus.emit, showcase), showcase.deal
        print("演示模式：不调用大模型接口，所有牌型都会依次打出", flush=True)
    else:
        players = [make_player(p) for p in cfg["players"]]
    for p in players:
        p.avatar = resolve_avatar(p)
        p.faces = resolve_avatar(p, "faces", "-faces")
        p.live2d = resolve_live2d(p)
        p.cutins = resolve_cutins(p)
    # 没有立绘的角色不上场（arena.only_with_art 设成 false 可以关掉）
    if a.get("only_with_art", True):
        drawn = [p for p in players if p.avatar]
        skipped = [p.name for p in players if not p.avatar]
        if len(drawn) >= 3:
            players = drawn
            if skipped:
                print(f"[avatar] 没有立绘、这次不上场：{'、'.join(skipped)}", flush=True)
        else:
            print("[avatar] 有立绘的角色不足 3 个，全部角色照常上场", flush=True)
    tts = make_tts(cfg.get("tts"), STATIC / "audio")
    if a.get("format", "tournament") == "tournament":
        # 默认赛制：9 人积分淘汰（9进6 → 6进3 → 决赛）
        arena = Tournament(players, emit,
                           move_delay=a.get("move_delay", 1.5),
                           game_pause=a.get("game_pause", 8),
                           round_pause=a.get("round_pause", 12),
                           champion_pause=a.get("champion_pause", 30),
                           games_per_table=a.get("games_per_table", 3),
                           entrants=a.get("entrants", 9),
                           seed=a.get("seed"), tts=tts, dealer=dealer)
        run = {"max_games": a.get("max_games"), "max_editions": a.get("max_editions")}
    else:
        # 旧赛制：擂台轮换，每局淘汰一人
        arena = Arena(players, emit,
                      move_delay=a.get("move_delay", 1.5),
                      game_pause=a.get("game_pause", 8),
                      eliminate_forever=a.get("eliminate_forever", False),
                      seed=a.get("seed"), tts=tts, dealer=dealer,
                      start_score=a.get("start_score", 1000),
                      score_unit=a.get("score_unit", 100))
        run = {"max_games": a.get("max_games")}
    threading.Thread(target=arena.run_forever, kwargs=run, daemon=True).start()

    port = args.port or cfg.get("port", 8000)
    print(f"直播页面: http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), make_handler(bus)).serve_forever()


if __name__ == "__main__":
    main()
