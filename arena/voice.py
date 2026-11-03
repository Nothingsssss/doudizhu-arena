"""HeyGen 语音合成：把选手的发言转成音频，缓存到 static/audio/，网页按地址播放。

接口：POST https://api.heygen.com/v3/models/audio/tts
     {"model": "heygen-voice-1-turbo-free", "voice_id": "...", "text": "..."}
     返回 {"data": {"audio_url": "...", ...}}
密钥从环境变量读取（默认 HEYGEN_API_KEY），不要写进配置文件。
"""
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
    ct = (content_type or "").lower()
    for k, v in (("wav", ".wav"), ("mpeg", ".mp3"), ("mp3", ".mp3"), ("ogg", ".ogg"), ("aac", ".aac")):
        if k in ct:
            return v
    m = re.search(r"\.(wav|mp3|ogg|aac|m4a)(\?|$)", url or "", re.I)
    return "." + m.group(1).lower() if m else ".wav"


class HeyGenTTS:
    def __init__(self, out_dir, api_key="", api_key_env="HEYGEN_API_KEY",
                 model="heygen-voice-1-turbo-free", base_url="https://api.heygen.com",
                 timeout=30, url_prefix="audio/", default_voice_id="", **_):
        self.api_key = api_key or os.environ.get(api_key_env, "")
        self.api_key_env = api_key_env
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.url_prefix = url_prefix
        self.default_voice_id = default_voice_id
        self.out = Path(out_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.disabled_reason = None if self.api_key else f"没有设置环境变量 {api_key_env}"

    def _request(self, voice_id, text):
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
        dl = urllib.request.Request(data["audio_url"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(dl, timeout=self.timeout) as r:
            audio, ctype = r.read(), r.headers.get("Content-Type", "")
        dur = data.get("duration") or data.get("audio_duration")
        try:
            dur = float(dur) if dur else None
        except (TypeError, ValueError):
            dur = None
        return audio, _ext(ctype, data["audio_url"], audio), dur or wav_duration(audio)

    def speak(self, text, voice_id=""):
        """返回 {"url": 网页可用地址, "duration": 秒}；没有可念的内容或失败时返回 None，不抛异常。"""
        text = clean_text(text)
        voice_id = voice_id or self.default_voice_id
        if not text or not voice_id or not self.api_key:
            return None
        key = hashlib.sha1(f"{self.model}|{voice_id}|{text}".encode()).hexdigest()[:24]
        meta = self.out / f"{key}.json"
        with self.lock:
            if meta.exists():
                try:
                    m = json.loads(meta.read_text(encoding="utf-8"))
                    if (self.out / m["file"]).exists():
                        return {"url": self.url_prefix + m["file"], "duration": m.get("duration")}
                except (ValueError, KeyError):
                    pass
        try:
            audio, ext, dur = self._request(voice_id, text)
        except Exception as e:  # 语音失败不影响打牌
            print(f"[tts] 合成失败 ({voice_id}): {e}", flush=True)
            return None
        name = key + ext
        with self.lock:
            (self.out / name).write_bytes(audio)
            meta.write_text(json.dumps({"file": name, "duration": dur, "text": text, "voice_id": voice_id},
                                       ensure_ascii=False), encoding="utf-8")
        return {"url": self.url_prefix + name, "duration": dur}


def make_tts(cfg, out_dir):
    """根据配置创建 TTS；没配置或没密钥时返回 None 并打印原因。"""
    if not cfg or not cfg.get("enabled", True):
        return None
    provider = cfg.get("provider", "heygen")
    if provider != "heygen":
        raise ValueError(f"不支持的语音服务: {provider}")
    tts = HeyGenTTS(out_dir, **cfg)
    if tts.disabled_reason:
        print(f"[tts] 语音已关闭：{tts.disabled_reason}", flush=True)
        return None
    print(f"[tts] HeyGen 语音已开启，模型 {tts.model}", flush=True)
    return tts
