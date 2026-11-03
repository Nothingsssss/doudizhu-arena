"""HeyGen 音色工具：查询音色、按形象推荐、生成试听、写入配置。

密钥只从环境变量读取：
    PowerShell:  $env:HEYGEN_API_KEY = "你的密钥"
    bash:        export HEYGEN_API_KEY="你的密钥"

用法（在项目根目录运行）：
    python tools/voices.py list                    # 拉取全部公开音色，保存到 voices.json，打印中文音色
    python tools/voices.py list --all-lang         # 打印所有语言
    python tools/voices.py suggest                 # 按 tools/characters.json 给每个形象推荐 3 个音色
    python tools/voices.py audition                # 用推荐的音色念各自的台词，保存到 audition/ 目录
    python tools/voices.py audition --voice <id> --text "你好"   # 单独试听某个音色
    python tools/voices.py apply                   # 把推荐的第一个音色写进 config.json 对应选手的 voice_id
    python tools/voices.py apply --pick deepseek=<voice_id> --pick qwen=<voice_id>   # 手动指定
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from arena.voice import HeyGenTTS  # noqa: E402

BASE = "https://api.heygen.com"
VOICES_FILE = ROOT / "voices.json"
SUGGEST_FILE = ROOT / "voices.suggest.json"
CHARS_FILE = ROOT / "tools" / "characters.json"
MODEL = "heygen-voice-1-turbo-free"


def key():
    k = os.environ.get("HEYGEN_API_KEY", "")
    if not k:
        sys.exit("没有找到环境变量 HEYGEN_API_KEY，请先设置密钥。")
    return k


def get(path, params):
    url = BASE + path + "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
    req = urllib.request.Request(url, headers={"X-Api-Key": key(), "Accept": "application/json", "User-Agent": "doudizhu-arena/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"请求失败 HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")


# ---------- 字段兼容：不同版本接口字段名可能不一样 ----------
def pick_field(v, *names, default=""):
    for n in names:
        if v.get(n) not in (None, ""):
            return v[n]
    return default


def norm(v):
    langs = pick_field(v, "languages", "language", "locale", "language_code", default="")
    if isinstance(langs, list):
        langs = ",".join(str(x.get("name", x) if isinstance(x, dict) else x) for x in langs)
    tags = pick_field(v, "tags", "labels", "styles", "emotions", default=[])
    if isinstance(tags, dict):
        tags = [f"{a}:{b}" for a, b in tags.items()]
    if isinstance(tags, str):
        tags = [tags]
    return {
        "voice_id": pick_field(v, "voice_id", "id"),
        "name": str(pick_field(v, "name", "display_name", "voice_name")),
        "gender": str(pick_field(v, "gender", "sex")).lower(),
        "language": str(langs),
        "status": str(pick_field(v, "status", default="")),
        "type": str(pick_field(v, "type", default="")),
        "description": str(pick_field(v, "description", "desc", "prompt", default="")),
        "tags": [str(t) for t in tags],
        "preview_audio_url": pick_field(v, "preview_audio_url", "preview_audio", "preview_url", "sample_url"),
        "models": pick_field(v, "models", "supported_models", "engines", default=[]),
    }


def items_of(body):
    d = body.get("data", body)
    if isinstance(d, list):
        return d, body
    for k in ("voices", "items", "list", "data"):
        if isinstance(d.get(k), list):
            return d[k], d
    return [], d


def fetch_all(path, params):
    out, cursor, seen = [], None, set()
    for _ in range(200):
        p = dict(params)
        if cursor:
            p["cursor"] = cursor
            p["next_token"] = cursor
        body = get(path, p)
        items, meta = items_of(body)
        new = [x for x in items if pick_field(x, "voice_id", "id") not in seen]
        for x in new:
            seen.add(pick_field(x, "voice_id", "id"))
        out += new
        cursor = pick_field(meta, "next_cursor", "next_token", "cursor", "next", default=None) or \
            pick_field(body, "next_cursor", "next_token", default=None)
        if not cursor or not new:
            break
    return out


def is_zh(v):
    s = (v["language"] + " " + v["name"] + " " + v["description"]).lower()
    return any(k in s for k in ("zh", "chinese", "mandarin", "中文", "普通话", "cmn"))


def cmd_list(a):
    raw = fetch_all("/v3/models/audio/voices", {"type": "public", "limit": 100})
    source = "/v3/models/audio/voices"
    if not raw:
        raw = fetch_all("/v3/voices", {"limit": 100})
        source = "/v3/voices"
    voices = [norm(v) for v in raw]
    VOICES_FILE.write_text(json.dumps({"source": source, "voices": voices, "raw_sample": raw[:3]},
                                      ensure_ascii=False, indent=2), encoding="utf-8")
    show = voices if a.all_lang else [v for v in voices if is_zh(v)]
    if a.gender:
        show = [v for v in show if v["gender"].startswith(a.gender)]
    print(f"共拉到 {len(voices)} 个音色（来源 {source}），已保存 {VOICES_FILE.name}。下面列出 {len(show)} 个：\n")
    for v in show:
        print(f"{v['voice_id']}  {v['gender'] or '-':7} {v['language'][:18]:18} {v['name'][:28]:28} {' '.join(v['tags'])[:40]}")
        if v["preview_audio_url"]:
            print(f"    试听: {v['preview_audio_url']}")
    if not show and voices:
        print("没筛到中文音色。用 --all-lang 看全部，或检查 voices.json 里 language 字段的写法。")


def load_voices():
    if not VOICES_FILE.exists():
        sys.exit("还没有 voices.json，请先运行: python tools/voices.py list")
    return json.loads(VOICES_FILE.read_text(encoding="utf-8"))["voices"]


def score(v, c):
    text = " ".join([v["name"], v["description"], " ".join(v["tags"])]).lower()
    s = sum(2 for t in c["tags"] if t.lower() in text) - sum(3 for t in c.get("avoid", []) if t.lower() in text)
    if c.get("gender"):
        s += 4 if v["gender"].startswith(c["gender"]) else (-6 if v["gender"] else 0)
    s += 5 if is_zh(v) else -6        # 台词是中文，优先中文音色
    if v["status"] and v["status"].upper() not in ("ACTIVE", "READY", "COMPLETED"):
        s -= 20
    return s


def cmd_suggest(a):
    voices = load_voices()
    chars = json.loads(CHARS_FILE.read_text(encoding="utf-8"))["characters"]
    used, result = set(), {}
    for c in chars:
        ranked = sorted(voices, key=lambda v: (-score(v, c), v["voice_id"] in used))
        top = [v for v in ranked if v["voice_id"] not in used][:3] or ranked[:3]
        if top:
            used.add(top[0]["voice_id"])   # 第一推荐尽量不重复
        result[c["id"]] = {"player": c["player"], "image": c["image"], "want": c["voice"],
                           "candidates": [{"voice_id": v["voice_id"], "name": v["name"], "gender": v["gender"],
                                           "language": v["language"], "score": score(v, c),
                                           "preview_audio_url": v["preview_audio_url"]} for v in top]}
        print(f"■ {c['image']} → 选手 {c['player']}，想要：{c['voice']}")
        for i, v in enumerate(result[c["id"]]["candidates"]):
            print(f"   {i + 1}. {v['voice_id']}  {v['name']}  ({v['gender'] or '?'}, {v['language'][:16]}, 匹配分 {v['score']})")
            if v["preview_audio_url"]:
                print(f"      试听: {v['preview_audio_url']}")
    SUGGEST_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n已保存 {SUGGEST_FILE.name}。下一步：python tools/voices.py audition 生成试听，满意后 apply 写入配置。")


def cmd_audition(a):
    tts = HeyGenTTS(ROOT / "audition", api_key=key(), model=a.model, url_prefix="audition/")
    if a.voice:
        r = tts.speak(a.text or "你好，欢迎来到 AI 斗地主擂台。", a.voice)
        print("已生成:", r and (ROOT / r["url"]), "" if r else "（失败，见上面的报错）")
        return
    if not SUGGEST_FILE.exists():
        sys.exit("还没有推荐结果，请先运行: python tools/voices.py suggest")
    sug = json.loads(SUGGEST_FILE.read_text(encoding="utf-8"))
    chars = {c["id"]: c for c in json.loads(CHARS_FILE.read_text(encoding="utf-8"))["characters"]}
    for cid, s in sug.items():
        for i, v in enumerate(s["candidates"][: a.top]):
            r = tts.speak(chars[cid]["line"], v["voice_id"])
            if r:
                src = ROOT / r["url"]
                dst = src.with_name(f"{cid}-{i + 1}-{v['voice_id'][:8]}{src.suffix}")
                if not dst.exists():
                    dst.write_bytes(src.read_bytes())
                print(f"{cid} 候选{i + 1} {v['name']}: {dst.relative_to(ROOT)}")


def cmd_apply(a):
    cfg_path = Path(a.config)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    sug = json.loads(SUGGEST_FILE.read_text(encoding="utf-8")) if SUGGEST_FILE.exists() else {}
    chars = {c["id"]: c for c in json.loads(CHARS_FILE.read_text(encoding="utf-8"))["characters"]}
    picks = {cid: s["candidates"][0]["voice_id"] for cid, s in sug.items() if s["candidates"]}
    for p in a.pick or []:
        cid, _, vid = p.partition("=")
        picks[cid.strip()] = vid.strip()
    by_name = {pl["name"]: pl for pl in cfg["players"]}
    for cid, vid in picks.items():
        name = chars.get(cid, {}).get("player", "")
        if name in by_name:
            by_name[name]["voice_id"] = vid
            print(f"{name} ← {vid}")
        else:
            print(f"跳过 {cid}：config 里没有名为「{name}」的选手（改 tools/characters.json 的 player 字段）")
    cfg.setdefault("tts", {"provider": "heygen", "model": MODEL, "api_key_env": "HEYGEN_API_KEY"})
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已写入 {cfg_path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list"); p.add_argument("--all-lang", action="store_true"); p.add_argument("--gender", choices=["female", "male"])
    sub.add_parser("suggest")
    p = sub.add_parser("audition"); p.add_argument("--voice"); p.add_argument("--text"); p.add_argument("--top", type=int, default=3)
    p.add_argument("--model", default=MODEL)
    p = sub.add_parser("apply"); p.add_argument("--config", default=str(ROOT / "config.json")); p.add_argument("--pick", action="append")
    a = ap.parse_args()
    {"list": cmd_list, "suggest": cmd_suggest, "audition": cmd_audition, "apply": cmd_apply}[a.cmd](a)


if __name__ == "__main__":
    main()
