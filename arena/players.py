"""玩家：规则机器人 + 任意 OpenAI 兼容接口的大模型。"""
import json
import os
import re
import urllib.request
from collections import Counter

from .cards import NAMES, TYPE_NAMES, fmt, legal_moves, parse, validate


class Player:
    sim = False   # True：没接真实接口，由本地机器人模拟出牌

    def __init__(self, name, avatar="", color="", voice_id="", id="", title="", voice_sim=None,
                 cutout="auto", code="", art="full", face=None, **kw):
        self.name = name
        self.id = id or re.sub(r"\W+", "", name.lower()) or "player"
        self.title = title          # 形象名，如"鲸鱼女仆"，显示在名字下面
        self.voice_id = voice_id    # 真实语音接口的音色 ID（HeyGen / 自定义接口）
        self.voice_sim = voice_sim or {}   # 本地模拟语音：{"pitch": 1.4, "rate": 1.1, "voice": "Xiaoxiao"}
        self.avatar = avatar        # 立绘/头像图片，默认 static/avatars/<id>.png
        self.code = code            # 形象编号，如 "C01"；头像文件也可以按编号命名
        # 立绘背景处理："auto" 自动去掉纯色背景（白底立绘用）；true 已经是透明抠图；false 不处理，边缘渐隐
        self.cutout = cutout
        self.art = art              # "full" 全身立绘（牌桌上显示上半身）；"bust" 半身图（整张显示）
        self.face = face            # 小头像裁剪位置 [脸中心x%, 脸中心y%, 框大小%]，按整张图算；不填自动找
        self.color = color          # 主题色，如 "#4f8cff"
        self.model = kw.get("model", "规则机器人" if kw.get("type") == "bot" else "")

    def profile(self):
        return {"id": self.id, "code": self.code, "title": self.title, "avatar": self.avatar,
                "cutout": self.cutout, "art": self.art, "face": self.face,
                "color": self.color, "model": self.model, "sim": self.sim, "voice_sim": self.voice_sim}

    def bid(self, view):
        """返回 0~3 的叫分，必须大于 view['current_bid'] 或为 0。"""
        raise NotImplementedError

    def play(self, view):
        """返回 (cards:list[int], 发言:str)。cards 为空列表表示不要。"""
        raise NotImplementedError


class BotPlayer(Player):
    """简单规则机器人：用来凑人数，也是大模型出错时的兜底。"""
    sim = True

    def bid(self, view):
        hand = Counter(view["hand"])
        score = hand[17] * 3 + hand[16] * 2 + hand[15] * 1.5 + hand[14] * 0.5
        score += sum(2 for r, v in hand.items() if v == 4)
        want = 3 if score >= 8 else 2 if score >= 6 else 1 if score >= 4 else 0
        return (want if want > view["current_bid"] else 0), ""

    def play(self, view):
        hand, prev = view["hand"], view["prev_move"]
        moves = legal_moves(hand, prev)
        if prev is None:
            # 首家：优先出牌数多、点数小的组合
            moves.sort(key=lambda m: (m.type in ("bomb", "rocket"), -len(m.cards), m.key))
            return list(moves[0].cards), ""
        if view["prev_is_teammate"]:
            return [], ""
        if not moves:
            return [], ""
        normal = [m for m in moves if m.type not in ("bomb", "rocket")]
        if normal:
            return list(min(normal, key=lambda m: m.key).cards), ""
        # 只剩炸弹能压：对手快走完了才炸
        if view["prev_player_cards_left"] <= 5:
            return list(min(moves, key=lambda m: m.key).cards), "炸！"
        return [], ""


SYSTEM_PROMPT = """你正在参加一场斗地主擂台直播，观众能看到你的发言。
规则：一副54张牌，地主20张，两个农民各17张。地主一方，两个农民一方，先出完牌的一方获胜。
牌型：单张、对子、三张、三带一、三带二(带对子)、顺子(5张及以上连续单牌,不含2和王)、
连对(3对及以上)、飞机(连续三张,可带同数量单牌或对子)、四带二(两张单牌或两对)、炸弹(四张)、王炸(大小王)。
牌点从小到大：3 4 5 6 7 8 9 10 J Q K A 2 小王 大王。
擂台规则：每局淘汰一人。地主输了地主下场；农民输了，剩牌多的那个农民下场。所以农民也要尽量少剩牌。

只输出一个 JSON 对象，不要输出其他内容。"""


class LLMPlayer(Player):
    def __init__(self, name, base_url, model, api_key="", api_key_env="",
                 temperature=0.7, timeout=60, max_retries=2, extra_body=None, **kw):
        super().__init__(name, model=model, **kw)
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key or os.environ.get(api_key_env, "")
        self.temperature = temperature
        self.timeout = timeout
        self.max_retries = max_retries
        self.extra_body = extra_body or {}
        self.fallback = BotPlayer(name, type="bot")

    # ---- HTTP ----
    def _chat(self, messages):
        body = {"model": self.model, "messages": messages, "temperature": self.temperature}
        body.update(self.extra_body)
        req = urllib.request.Request(
            self.base_url + "/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self.api_key}"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            data = json.loads(r.read())
        return data["choices"][0]["message"]["content"] or ""

    @staticmethod
    def _json(text):
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise ValueError("没有找到 JSON")
        return json.loads(m.group(0))

    def _ask(self, prompt, check):
        msgs = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}]
        last_err = None
        for _ in range(self.max_retries + 1):
            try:
                reply = self._chat(msgs)
            except Exception as e:  # 网络/接口错误直接兜底
                return None, f"[接口错误: {e}]"
            try:
                return check(self._json(reply)), None
            except Exception as e:
                last_err = str(e)
                msgs += [{"role": "assistant", "content": reply},
                         {"role": "user", "content": f"不合法：{e}。请重新只输出 JSON。"}]
        return None, f"[多次出错: {last_err}]"

    # ---- 叫分 ----
    def bid(self, view):
        cur = view["current_bid"]
        prompt = (f"你的手牌({len(view['hand'])}张)：{fmt(view['hand'])}\n"
                  f"当前最高叫分：{cur}。你可以叫比 {cur} 大的分(最多3)，或者叫 0 表示不叫。\n"
                  '输出格式：{"bid": 0到3的整数, "say": "一句给观众的话"}')

        def check(d):
            b = int(d["bid"])
            if b != 0 and not (cur < b <= 3):
                raise ValueError(f"叫分必须是 0 或 {cur + 1}~3")
            return b, str(d.get("say", ""))[:80]

        res, err = self._ask(prompt, check)
        if res is None:
            return self.fallback.bid(view)[0], err
        return res

    # ---- 出牌 ----
    def play(self, view):
        hand, prev = view["hand"], view["prev_move"]
        moves = legal_moves(hand, prev)
        roles = view["roles"]
        lines = [
            f"你是{roles[view['seat']]}。",
            f"你的手牌({len(hand)}张)：{fmt(hand)}",
            "其他玩家剩余牌数：" + "，".join(
                f"{view['names'][i]}({roles[i]}) {view['cards_left'][i]}张"
                for i in range(3) if i != view["seat"]),
            f"底牌：{fmt(view['bottom'])}",
            "本局出牌记录(最近20手)：",
        ]
        for name, role, cards in view["history"][-20:]:
            lines.append(f"  {name}({role})：{fmt(cards)}")
        if prev is None:
            lines.append("现在轮到你首家出牌，必须出牌，任意合法牌型都可以。")
        else:
            who = "你的队友" if view["prev_is_teammate"] else "对手"
            lines.append(f"需要压过{who} {view['prev_player']} 出的：{fmt(prev.cards)}"
                         f"（{TYPE_NAMES[prev.type]}），也可以不要。")
        if len(moves) <= 40:
            lines.append("你能出的合法牌：" + " | ".join(fmt(m.cards) for m in moves) if moves else "你没有能压过的牌，只能不要。")
        lines.append('输出格式：{"play": "要出的牌，用空格分隔如 \\"3 3 3 4\\"，不要就写 \\"PASS\\"", '
                     '"say": "一句给观众的话(可以嘲讽或者分析)"}')

        def check(d):
            cards = parse(d["play"])
            validate(cards, hand, prev)
            return cards, str(d.get("say", ""))[:80]

        res, err = self._ask("\n".join(lines), check)
        if res is None:
            cards, _ = self.fallback.play(view)
            return cards, err + " 由机器人代打"
        return res


def _is_local(url):
    return bool(re.match(r"https?://(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|\[::1\])", url or ""))


def make_player(cfg, simulate=None):
    """按配置创建玩家。

    type=llm 但没有密钥（api_key / api_key_env 对应的环境变量为空）且不是本地接口时，
    先用本地机器人模拟，名字、头像、音色不变；设置好密钥重启就会接入真实模型。
    simulate(cfg) 可以自定义模拟用的玩家（演示模式传入）。
    """
    kind = cfg.get("type", "llm")
    if kind == "bot":
        return BotPlayer(**cfg)
    if kind != "llm":
        raise ValueError(f"未知玩家类型: {kind}")
    has_key = cfg.get("api_key") or (cfg.get("api_key_env") and os.environ.get(cfg["api_key_env"]))
    if cfg.get("base_url") and (has_key or _is_local(cfg.get("base_url"))):
        return LLMPlayer(**cfg)
    env = cfg.get("api_key_env") or "api_key"
    why = f"没有设置 {env}" if cfg.get("base_url") else "还没填接口地址 base_url"
    print(f"[players] {cfg.get('name')}：{why}，先用本地模拟出牌", flush=True)
    keep = {k: v for k, v in cfg.items() if k in SIM_KEEP}
    return simulate(keep) if simulate else BotPlayer(**keep)


# 模拟玩家沿用的展示字段
SIM_KEEP = ("name", "id", "code", "title", "avatar", "cutout", "art", "face", "color", "voice_id", "voice_sim", "model")


__all__ = ["Player", "BotPlayer", "LLMPlayer", "make_player", "NAMES"]
