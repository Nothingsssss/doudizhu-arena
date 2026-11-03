"""斗地主牌型、比较、合法出法生成。

点数编码：3..10 = 3..10, J=11, Q=12, K=13, A=14, 2=15, 小王=16, 大王=17
"""
from collections import Counter, namedtuple
from itertools import combinations

NAMES = {3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
         11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "小王", 17: "大王"}
_CHAR = {"3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "T": 10,
         "J": 11, "Q": 12, "K": 13, "A": 14, "1": 14, "2": 15, "B": 16, "R": 17}

TYPE_NAMES = {
    "single": "单张", "pair": "对子", "trio": "三张", "trio_single": "三带一",
    "trio_pair": "三带二", "straight": "顺子", "pair_straight": "连对",
    "plane": "飞机", "plane_single": "飞机带单", "plane_pair": "飞机带对",
    "four_two_single": "四带二", "four_two_pair": "四带两对",
    "bomb": "炸弹", "rocket": "王炸",
}

Move = namedtuple("Move", "cards type key length")


def new_deck():
    return [r for r in range(3, 16) for _ in range(4)] + [16, 17]


def fmt(cards):
    return " ".join(NAMES[c] for c in sorted(cards)) if cards else "不要"


def parse(text):
    """把 "3 3 3 4" / "10JQKA" / "小王 大王" / "PASS" 解析成点数列表。"""
    t = str(text).strip().upper()
    if t in ("", "PASS", "P", "不要", "过", "要不起", "不出"):
        return []
    for a, b in (("小王", " B "), ("大王", " R "), ("小鬼", " B "), ("大鬼", " R "),
                 ("BJ", " B "), ("SJ", " B "), ("RJ", " R "), ("10", " T ")):
        t = t.replace(a, b)
    out = []
    for ch in t:
        if ch in " ,，、[]'\"-":
            continue
        if ch not in _CHAR:
            raise ValueError(f"无法识别的牌: {ch!r}")
        out.append(_CHAR[ch])
    return out


def classify(cards):
    """返回 Move；不是合法牌型返回 None。"""
    cards = tuple(sorted(cards))
    n = len(cards)
    if n == 0:
        return None
    cnt = Counter(cards)
    if n == 2 and cnt[16] == 1 and cnt[17] == 1:
        return Move(cards, "rocket", 17, 1)
    if n == 1:
        return Move(cards, "single", cards[0], 1)
    vals = sorted(cnt.values(), reverse=True)
    ranks = sorted(cnt)
    if len(cnt) == 1:
        return Move(cards, {2: "pair", 3: "trio", 4: "bomb"}[n], cards[0], 1)
    if n == 4 and vals == [3, 1]:
        return Move(cards, "trio_single", _rank_with(cnt, 3), 1)
    if n == 5 and vals == [3, 2]:
        return Move(cards, "trio_pair", _rank_with(cnt, 3), 1)

    def consecutive(rs):
        return rs[-1] <= 14 and rs[-1] - rs[0] == len(rs) - 1

    if n >= 5 and vals[0] == 1 and consecutive(ranks):
        return Move(cards, "straight", ranks[-1], n)
    if n >= 6 and vals[0] == 2 and vals[-1] == 2 and consecutive(ranks):
        return Move(cards, "pair_straight", ranks[-1], n // 2)
    if n == 6 and vals[0] == 4:
        return Move(cards, "four_two_single", _rank_with(cnt, 4), 1)
    if n == 8 and vals == [4, 2, 2]:
        return Move(cards, "four_two_pair", _rank_with(cnt, 4), 1)

    trips = sorted(r for r in cnt if cnt[r] >= 3 and r <= 14)
    for L in range(len(trips), 1, -1):
        for i in range(len(trips) - L + 1):
            run = trips[i:i + L]
            if run[-1] - run[0] != L - 1:
                continue
            rem = cnt.copy()
            for r in run:
                rem[r] -= 3
            rem = +rem
            k = sum(rem.values())
            if k == 0:
                return Move(cards, "plane", run[-1], L)
            if k == L:
                return Move(cards, "plane_single", run[-1], L)
            if (k == 2 * L and all(v % 2 == 0 for v in rem.values())
                    and 16 not in rem and 17 not in rem):
                return Move(cards, "plane_pair", run[-1], L)
    return None


def _rank_with(cnt, c):
    return next(r for r, v in cnt.items() if v == c)


def beats(m, prev):
    if prev is None:
        return True
    if m.type == "rocket":
        return True
    if prev.type == "rocket":
        return False
    if m.type == "bomb":
        return prev.type != "bomb" or m.key > prev.key
    if prev.type == "bomb":
        return False
    return m.type == prev.type and m.length == prev.length and m.key > prev.key


def all_moves(hand):
    cnt = Counter(hand)
    ranks = sorted(cnt)
    out = {}

    def add(cards):
        m = classify(cards)
        if m:
            out[m.cards] = m

    for r in ranks:
        for k in range(1, cnt[r] + 1):
            add([r] * k)
    if cnt[16] and cnt[17]:
        add([16, 17])
    for t in ranks:
        if cnt[t] < 3:
            continue
        for s in ranks:
            if s == t:
                continue
            add([t] * 3 + [s])
            if cnt[s] >= 2:
                add([t] * 3 + [s, s])
    for q in ranks:
        if cnt[q] != 4:
            continue
        others = sorted(c for c in hand if c != q)
        for combo in set(combinations(others, 2)):
            add([q] * 4 + list(combo))
        pairs = [r for r in ranks if r != q and cnt[r] >= 2]
        for a, b in combinations(pairs, 2):
            add([q] * 4 + [a, a, b, b])
    for need, minlen in ((1, 5), (2, 3), (3, 2)):
        elig = [r for r in ranks if r <= 14 and cnt[r] >= need]
        for i, start in enumerate(elig):
            run = [start]
            for r in elig[i + 1:]:
                if r != run[-1] + 1:
                    break
                run.append(r)
                if len(run) < minlen:
                    continue
                body = [x for x in run for _ in range(need)]
                add(body)
                if need == 3:
                    L = len(run)
                    rest = list((cnt - Counter(body)).elements())
                    for combo in set(combinations(sorted(rest), L)):
                        add(body + list(combo))
                    rc = Counter(rest)
                    pr = [x for x in rc if rc[x] >= 2 and x <= 15]
                    for combo in combinations(pr, L):
                        add(body + [x for x in combo for _ in range(2)])
    return list(out.values())


def legal_moves(hand, prev):
    return [m for m in all_moves(hand) if beats(m, prev)]


def validate(cards, hand, prev):
    """校验一手出牌。返回 Move 或 None(不要)；不合法抛 ValueError。"""
    if not cards:
        if prev is None:
            raise ValueError("你是首家出牌，不能不要")
        return None
    if Counter(cards) - Counter(hand):
        raise ValueError(f"手里没有这些牌: {fmt(list((Counter(cards) - Counter(hand)).elements()))}")
    m = classify(cards)
    if m is None:
        raise ValueError(f"{fmt(cards)} 不是合法牌型")
    if not beats(m, prev):
        raise ValueError(f"{fmt(cards)} 压不过上家的 {fmt(prev.cards)}")
    return m
