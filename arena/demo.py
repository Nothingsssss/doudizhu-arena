"""演示模式：不接真实大模型，用规则机器人打牌，并保证所有牌型都会打出来，方便检查特效。

做法：
  1. 发牌时，把「还没展示过的牌型」直接组好塞进各家手里（例如飞机带对、四带两对、王炸）。
  2. 演示机器人出牌时优先打还没展示过的牌型；跟牌时能用新牌型压就压（炸弹、王炸也算）。
  3. 14 种牌型全部出现后，从头再来一轮。一局放不下的牌型会留到下一局，一般 2~3 局展示完。
"""
import random
from collections import Counter

from .cards import TYPE_NAMES, classify, legal_moves, new_deck
from .players import SIM_KEEP, BotPlayer

ALL_TYPES = list(TYPE_NAMES)            # 14 种
# 发牌时先放占牌多的；出牌时也按这个顺序优先（炸弹、王炸放最后，免得拆掉四带二）
ORDER = ["four_two_pair", "four_two_single", "plane_pair", "plane_single", "plane", "pair_straight",
         "straight", "trio_pair", "trio_single", "trio", "pair", "single", "bomb", "rocket"]
NO_PLANT = {"single", "pair"}          # 单张、对子随便就能打出来，不用专门塞

LINES = {
    "single": ["先走一张试试水", "小牌开路"], "pair": ["来对子", "对子走起"],
    "trio": ["三张，接得住吗"], "trio_single": ["三带一，标准开局"], "trio_pair": ["三带二，稳稳的"],
    "straight": ["顺子一条龙！", "顺起来了"], "pair_straight": ["连对来了，接好"],
    "plane": ["飞机起飞！"], "plane_single": ["飞机带翅膀，起飞！"], "plane_pair": ["满载飞机，全员登机！"],
    "four_two_single": ["四带二，舍不得炸"], "four_two_pair": ["四带两对，豪华配置"],
    "bomb": ["炸你没商量！", "炸弹伺候"], "rocket": ["王炸！谁敢不服", "大小王一起上！"],
}


class Showcase:
    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.shown = set()
        self.rounds = 0
        self.planted = []        # [(座位, 牌, 牌型)]，本局专门塞进去的组合
        self.hands = [[], [], []]  # 各家当前手牌（由事件同步）

    def remaining(self):
        return [t for t in ORDER if t not in self.shown]

    def record(self, kind):
        """记录打出的牌型；是新牌型返回 True。"""
        if kind in TYPE_NAMES and kind not in self.shown:
            self.shown.add(kind)
            return True
        return False

    def complete(self):
        return len(self.shown) == len(ALL_TYPES)

    def new_game(self):
        if self.complete():
            self.shown.clear()
            self.rounds += 1

    def progress(self, kind=None):
        return {"type": TYPE_NAMES.get(kind, ""), "shown": len(self.shown), "total": len(ALL_TYPES),
                "missing": [TYPE_NAMES[t] for t in self.remaining()], "complete": self.complete(),
                "round": self.rounds + 1}

    # ---------- 发牌 ----------
    BUDGET = 33   # 每局最多预置多少张牌；太多的话有人出完牌时别家还没轮到展示

    def deal(self, rng):
        pool = Counter(new_deck())
        seats = [[], [], []]
        planted = []
        used = 0
        for t in [t for t in ORDER if t not in self.shown and t not in NO_PLANT]:
            combo = None
            for _ in range(40):
                c = _build(t, pool, rng)
                if c and classify(c) and classify(c).type == t:
                    combo = c
                    break
            if not combo or used + len(combo) > self.BUDGET:
                continue
            # 放到预置牌最少、还放得下的座位
            order = sorted(range(3), key=lambda s: (len(seats[s]), rng.random()))
            for s in order:
                if len(seats[s]) + len(combo) <= 14:
                    seats[s] += combo
                    pool -= Counter(combo)
                    planted.append((s, sorted(combo), t))
                    used += len(combo)
                    break
        rest = list(pool.elements())
        rng.shuffle(rest)
        for s in seats:
            while len(s) < 17:
                s.append(rest.pop())
        self.planted = planted
        return [sorted(s) for s in seats], sorted(rest)

    def others_pending(self, seat):
        return any(self.intact(s, h) for s, h in enumerate(self.hands) if s != seat)

    def intact(self, seat, hand):
        """这个座位手里还完整、牌型还没展示过的预置组合。"""
        h = Counter(hand)
        out = []
        for s, cards, t in self.planted:
            if s == seat and t not in self.shown and not (Counter(cards) - h):
                out.append((cards, t))
        return out


def _build(t, pool, rng):
    normal = list(range(3, 16))

    def ranks(n, exclude=(), upto=15):
        return [r for r in normal if r <= upto and pool[r] >= n and r not in exclude]

    def run(n, length):
        starts = [s for s in range(3, 15 - length + 1) if all(pool[s + i] >= n for i in range(length))]
        if not starts:
            return None
        s = rng.choice(starts)
        return list(range(s, s + length))

    def kickers(n, k, exclude):
        opts = ranks(n, exclude)
        if len(opts) < k:
            return None
        return [r for r in rng.sample(opts, k) for _ in range(n)]

    if t == "rocket":
        return [16, 17] if pool[16] and pool[17] else None
    if t in ("bomb", "four_two_single", "four_two_pair"):
        q = ranks(4)
        if not q:
            return None
        r = rng.choice(q)
        if t == "bomb":
            return [r] * 4
        kick = kickers(1 if t == "four_two_single" else 2, 2, {r})
        return [r] * 4 + kick if kick else None
    if t.startswith("plane"):
        body = run(3, 2)
        if not body:
            return None
        cards = [r for r in body for _ in range(3)]
        if t == "plane":
            return cards
        # 翅膀不能和机身相邻，否则可能组成更长的飞机
        ex = set(body) | {body[0] - 1, body[-1] + 1}
        kick = kickers(1 if t == "plane_single" else 2, 2, ex)
        return cards + kick if kick else None
    if t == "pair_straight":
        r = run(2, 3)
        return [x for x in r for _ in range(2)] if r else None
    if t == "straight":
        return run(1, 5)
    if t.startswith("trio"):
        tr = ranks(3, upto=14)
        if not tr:
            return None
        r = rng.choice(tr)
        if t == "trio":
            return [r] * 3
        kick = kickers(1 if t == "trio_single" else 2, 1, {r})
        return [r] * 3 + kick if kick else None
    if t == "pair":
        p = ranks(2)
        return [rng.choice(p)] * 2 if p else None
    if t == "single":
        p = ranks(1)
        return [rng.choice(p)] if p else None
    return None


class DemoPlayer(BotPlayer):
    """优先打还没展示过的牌型的机器人。"""

    def __init__(self, name, showcase=None, **kw):
        kw.setdefault("model", kw.get("model") or "演示机器人")
        super().__init__(name, **kw)
        self.sc = showcase
        self.rng = random.Random()
        self.just_showed = False

    def _say(self, m):
        return self.rng.choice(LINES.get(m.type, [""]))

    def bid(self, view):
        cur = view["current_bid"]
        b = self.rng.choice([0, 1, 2, 3, 3])
        return (b if b > cur else 0), ("这把我来当地主！" if b == 3 and b > cur else "")

    def play(self, view):
        hand, prev, seat = view["hand"], view["prev_move"], view["seat"]
        moves = legal_moves(hand, prev)
        sc = self.sc
        rem = set(sc.remaining()) if sc else set()
        pri = lambda m: (ORDER.index(m.type), m.key)
        planted = sc.intact(seat, hand) if sc else []
        others = sc.others_pending(seat) if sc else False
        free = Counter(hand)
        for cards, _ in planted:
            free -= Counter(cards)
        # 不拆预置组合的出法优先
        whole = {tuple(c) for c, _ in planted}
        # 允许的出法：不动预置组合，或者正好整组打出
        safe = [m for m in moves if not (Counter(m.cards) - free) or tuple(m.cards) in whole]
        prefer = lambda ms: [m for m in ms if m in safe] or ([] if planted else ms)
        out = lambda m, talk=True: (list(m.cards), self._say(m) if talk else "")
        normal = lambda ms: [m for m in ms if m.type not in ("bomb", "rocket")]

        if prev is None:
            # 刚展示过一个、别家还有没展示的：出小牌把出牌权让出去
            if self.just_showed and others:
                self.just_showed = False
                small = [m for m in normal(prefer(moves)) if tuple(m.cards) not in whole]
                if small:
                    return out(min(small, key=lambda m: (len(m.cards), m.key)), False)
            if planted:
                cards, t = min(planted, key=lambda x: ORDER.index(x[1]))
                self.just_showed = True
                return list(cards), self.rng.choice(LINES[t])
            cand = [m for m in prefer(moves) if m.type in rem and m.type not in ("bomb", "rocket")]
            if cand:
                self.just_showed = True
                return out(min(cand, key=pri))
            if others:   # 自己没东西可展示：出小牌，让别人拿出牌权
                small = normal(prefer(moves)) or moves
                return out(min(small, key=lambda m: (len(m.cards), m.key)), False)
            ms = normal(prefer(moves)) or moves
            return out(min(ms, key=lambda m: (-len(m.cards), m.key)), False)

        # 跟牌
        bombs = [m for m in prefer(moves) if m.type in rem and m.type in ("bomb", "rocket")]
        if planted:
            # 手里有要展示的组合：想办法抢到出牌权（不拆组合）
            ms = [m for m in normal(prefer(moves)) if tuple(m.cards) not in whole]
            if ms:
                return out(min(ms, key=lambda m: m.key), False)
            if bombs and not view["prev_is_teammate"]:
                return out(min(bombs, key=pri))
            return [], ""
        if view["prev_is_teammate"]:
            return [], ""
        cand = [m for m in prefer(moves) if m.type in rem]
        if cand:
            return out(min(cand, key=pri))
        if others:
            # 别人还有组合要展示，不抢出牌权；除非对手快出完了
            if view["prev_player_cards_left"] <= 2:
                ms = normal(prefer(moves)) or moves
                if ms:
                    return out(min(ms, key=lambda m: m.key), False)
            return [], ""
        ms = normal(prefer(moves))
        if ms:
            return out(min(ms, key=lambda m: m.key), False)
        if moves and view["prev_player_cards_left"] <= 3:
            return out(min(moves, key=lambda m: m.key))
        return [], ""


def demo_players(player_cfgs, showcase):
    """沿用配置里的名字、颜色、头像、音色，出牌换成演示机器人。"""
    return [DemoPlayer(showcase=showcase, **{k: p[k] for k in SIM_KEEP if k in p}) for p in player_cfgs]


def wrap_emit(emit, showcase):
    """包一层事件：开局时检查是否开始新一轮，出牌时记录牌型并推送展示进度。"""
    def _emit(kind, data):
        if kind == "game_start":
            showcase.new_game()
        if kind in ("deal", "landlord", "play"):
            showcase.hands = [list(h) for h in data["hands"]]
        emit(kind, data)
        if kind == "game_start":
            emit("demo_progress", showcase.progress())
        elif kind == "play" and showcase.record(data.get("kind")):
            emit("demo_progress", showcase.progress(data.get("kind")))
    return _emit
