"""选手语音：把播报词和发言变成音频片段，网页按顺序播放。

支持的 provider（配置里的 tts.provider）：
  browser  本地模拟：后端不合成，网页用浏览器自带的中文语音念，按每个选手的 pitch/rate 区分音色
  heygen   HeyGen：POST /v3/models/audio/tts {"model","voice_id","text"}，返回 data.audio_url
  custom   任意 HTTP 语音接口：在配置里写地址、请求头、请求体模板和音频在返回里的位置（见 README）
真实接口没密钥或请求失败时，默认回退到 browser（tts.fallback 设为 "none" 则静音）。
合成结果缓存到 static/audio/，同一个音色同一句话只请求一次。密钥只从环境变量读取。
"""
import base64
import hashlib
import json
import os
import re
import struct
import threading
import urllib.request
from pathlib import Path

USER_AGENT = "doudizhu-arena/1.0"


def clean_text(text):
    """去掉系统提示（以 [ 开头的接口错误、机器人代打说明），只念选手自己说的话。"""
    t = str(text or "").strip()
    if not t or t.startswith("["):
        return ""
    t = re.sub(r"\[[^\]]*\]", "", t).strip()
    return t[:120]


def estimate_duration(text, rate=1.0):
    """估算念完一句话要多久（秒）：中文约 4 字/秒，英文字母和数字更快。"""
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    other = len(re.sub(r"[\u4e00-\u9fff\s，。！？、,.!?…~]", "", text))
    pauses = len(re.findall(r"[，。！？、,.!?…]", text))
    return round((cjk * 0.24 + other * 0.12 + pauses * 0.15 + 0.25) / max(0.5, rate or 1.0), 2)


def wav_duration(data):
    """从 WAV 文件头算时长（秒）；不是 WAV 返回 None。"""
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return None
    pos, byte_rate = 12, None
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        if cid == b"fmt " and size >= 12:
            byte_rate = struct.unpack("<I", data[pos + 16:pos + 20])[0]
        elif cid == b"data" and byte_rate:
            size = min(size, len(data) - pos - 8) if size == 0xFFFFFFFF else size
            return size / byte_rate
        pos += 8 + size + (size & 1)
    return None


def _ext(content_type, url, data):
    if data[:4] == b"RIFF":
        return ".wav"
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return ".mp3"
    if data[:4] == b"OggS":
        return ".ogg"
    ct = (content_type or "").lower()
    for k, v in (("wav", ".wav"), ("mpeg", ".mp3"), ("mp3", ".mp3"), ("ogg", ".ogg"), ("aac", ".aac")):
        if k in ct:
            return v
    m = re.search(r"\.(wav|mp3|ogg|aac|m4a)(\?|$)", url or "", re.I)
    return "." + m.group(1).lower() if m else ".mp3"


def _dig(obj, path):
    """按 "data.audio_url" 这样的路径取值，支持列表下标 "result.0.url"。"""
    for k in [p for p in str(path or "").split(".") if p]:
        if isinstance(obj, list) and k.isdigit() and int(k) < len(obj):
            obj = obj[int(k)]
        elif isinstance(obj, dict) and k in obj:
            obj = obj[k]
        else:
            return None
    return obj


def _env(s):
    """把字符串里的 ${VAR} 换成环境变量。"""
    return re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), ""), s)


def _fill(tpl, values):
    """请求体模板里的 "{text}" "{voice_id}" 换成实际值；整个字符串正好是占位符时保留原类型。"""
    if isinstance(tpl, dict):
        return {k: _fill(v, values) for k, v in tpl.items()}
    if isinstance(tpl, list):
        return [_fill(v, values) for v in tpl]
    if isinstance(tpl, str):
        m = re.fullmatch(r"\{(\w+)\}", tpl)
        if m and m.group(1) in values:
            return values[m.group(1)]
        return _env(re.sub(r"\{(\w+)\}", lambda m: str(values.get(m.group(1), m.group(0))), tpl))
    return tpl


class BrowserTTS:
    """本地模拟：只估算时长，让后端按时长等待；网页用 speechSynthesis 念。"""
    kind = "browser"

    def speak(self, text, voice_id="", sim=None):
        text = clean_text(text)
        if not text:
            return None
        rate = (sim or {}).get("rate", 1.0)
        return {"text": text, "sim": True, "duration": estimate_duration(text, rate)}


class _CachedTTS:
    """真实接口的公共部分：缓存、失败回退。子类实现 _fetch(voice_id, text) -> (音频字节, 扩展名, 时长或 None)。"""
    kind = "remote"

    def __init__(self, out_dir, url_prefix="audio/", default_voice_id="", fallback="browser", **_):
        self.out = Path(out_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self.url_prefix = url_prefix
        self.default_voice_id = default_voice_id
        self.fallback = BrowserTTS() if fallback == "browser" else None
        self.lock = threading.Lock()
        self.disabled_reason = None
        self.cache_tag = self.kind

    def _fallback(self, text, sim):
        return self.fallback.speak(text, sim=sim) if self.fallback else None

    def speak(self, text, voice_id="", sim=None):
        """返回 {"text","url","duration"}；没有可念的内容返回 None；失败时回退，不抛异常。"""
        text = clean_text(text)
        voice_id = voice_id or self.default_voice_id
        if not text:
            return None
        if not voice_id or self.disabled_reason:
            return self._fallback(text, sim)
        key = hashlib.sha1(f"{self.cache_tag}|{voice_id}|{text}".encode()).hexdigest()[:24]
        meta = self.out / f"{key}.json"
        with self.lock:
            if meta.exists():
                try:
                    m = json.loads(meta.read_text(encoding="utf-8"))
                    if (self.out / m["file"]).exists():
                        return {"text": text, "url": self.url_prefix + m["file"], "duration": m.get("duration")}
                except (ValueError, KeyError):
                    pass
        try:
            audio, ext, dur = self._fetch(voice_id, text)
        except Exception as e:  # 语音失败不影响打牌
            print(f"[tts] {self.kind} 合成失败 ({voice_id}): {e}", flush=True)
            return self._fallback(text, sim)
        dur = dur or wav_duration(audio) or estimate_duration(text)
        name = key + ext
        with self.lock:
            (self.out / name).write_bytes(audio)
            meta.write_text(json.dumps({"file": name, "duration": dur, "text": text, "voice_id": voice_id},
                                       ensure_ascii=False), encoding="utf-8")
        return {"text": text, "url": self.url_prefix + name, "duration": dur}

    @staticmethod
    def _download(url, timeout):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(), r.headers.get("Content-Type", "")


class HeyGenTTS(_CachedTTS):
    kind = "heygen"

    def __init__(self, out_dir, api_key="", api_key_env="HEYGEN_API_KEY",
                 model="heygen-voice-1-turbo-free", base_url="https://api.heygen.com", timeout=30, **kw):
        super().__init__(out_dir, **kw)
        self.api_key = api_key or os.environ.get(api_key_env, "")
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.cache_tag = f"heygen|{model}"
        if not self.api_key:
            self.disabled_reason = f"没有设置环境变量 {api_key_env}"

    def _fetch(self, voice_id, text):
        req = urllib.request.Request(
            self.base_url + "/v3/models/audio/tts",
            data=json.dumps({"model": self.model, "voice_id": voice_id, "text": text}).encode(),
            headers={"X-Api-Key": self.api_key, "Content-Type": "application/json", "User-Agent": USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            body = json.loads(r.read())
        data = body.get("data") or {}
        if not data.get("audio_url"):
            raise ValueError(f"返回里没有 audio_url: {str(body)[:200]}")
        audio, ctype = self._download(data["audio_url"], self.timeout)
        dur = data.get("duration") or data.get("audio_duration")
        try:
            dur = float(dur) if dur else None
        except (TypeError, ValueError):
            dur = None
        return audio, _ext(ctype, data["audio_url"], audio), dur


class CustomTTS(_CachedTTS):
    """通用 HTTP 语音接口。返回可以是：音频本身 / JSON 里的音频地址 / JSON 里的 base64 音频。"""
    kind = "custom"

    def __init__(self, out_dir, url="", method="POST", headers=None, body=None, timeout=30,
                 audio_url_path="", audio_base64_path="", duration_path="", required_env=(), **kw):
        super().__init__(out_dir, **kw)
        self.url, self.method, self.timeout = url, method.upper(), timeout
        self.headers = headers or {}
        self.body = body if body is not None else {"voice": "{voice_id}", "input": "{text}"}
        self.audio_url_path, self.audio_base64_path, self.duration_path = audio_url_path, audio_base64_path, duration_path
        self.cache_tag = f"custom|{url}|{json.dumps(self.body, sort_keys=True)}"
        missing = [e for e in required_env if not os.environ.get(e)]
        if not url:
            self.disabled_reason = "没有填写 tts.url"
        elif missing:
            self.disabled_reason = "没有设置环境变量 " + "、".join(missing)

    def _fetch(self, voice_id, text):
        values = {"text": text, "voice_id": voice_id}
        headers = {"User-Agent": USER_AGENT, "Content-Type": "application/json"}
        headers.update({k: _env(str(v)) for k, v in self.headers.items()})
        data = json.dumps(_fill(self.body, values), ensure_ascii=False).encode() if self.method != "GET" else None
        req = urllib.request.Request(_fill(self.url, values), data=data, headers=headers, method=self.method)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            raw, ctype = r.read(), r.headers.get("Content-Type", "")
        if not ctype.startswith("application/json") and not raw[:1] in (b"{", b"["):
            return raw, _ext(ctype, self.url, raw), None          # 直接返回音频
        body = json.loads(raw)
        dur = _dig(body, self.duration_path) if self.duration_path else None
        try:
            dur = float(dur) if dur else None
        except (TypeError, ValueError):
            dur = None
        if self.audio_base64_path:
            b64 = _dig(body, self.audio_base64_path)
            if not b64:
                raise ValueError(f"返回里没有 {self.audio_base64_path}: {str(body)[:200]}")
            audio = base64.b64decode(str(b64).split(",")[-1])
            return audio, _ext("", "", audio), dur
        url = _dig(body, self.audio_url_path or "audio_url")
        if not url:
            raise ValueError(f"返回里没有 {self.audio_url_path or 'audio_url'}: {str(body)[:200]}")
        audio, ctype = self._download(url, self.timeout)
        return audio, _ext(ctype, url, audio), dur


PROVIDERS = {"heygen": HeyGenTTS, "custom": CustomTTS}


def make_tts(cfg, out_dir):
    """根据配置创建语音；不配置时用浏览器模拟。返回 None 表示完全静音。"""
    cfg = dict(cfg or {"provider": "browser"})
    if not cfg.get("enabled", True):
        return None
    provider = cfg.pop("provider", "browser")
    if provider in ("browser", "sim", "local"):
        print("[tts] 语音：浏览器本地模拟（每个选手按 voice_sim 调音高/语速）", flush=True)
        return BrowserTTS()
    if provider == "none":
        return None
    if provider not in PROVIDERS:
        raise ValueError(f"不支持的语音服务: {provider}（可选 browser / heygen / custom / none）")
    tts = PROVIDERS[provider](out_dir, **cfg)
    if tts.disabled_reason:
        how = "改用浏览器本地模拟" if tts.fallback else "语音关闭"
        print(f"[tts] {provider} 未启用：{tts.disabled_reason}，{how}", flush=True)
        return tts.fallback
    print(f"[tts] {provider} 语音已开启", flush=True)
    return tts
