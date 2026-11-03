"""出牌播报：像斗地主游戏那样，每出一手由选手用自己的声音报牌型（"对三""飞机""王炸""要不起"）。"""
from collections import Counter

SPOKEN = {3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九", 10: "十",
          11: "J", 12: "Q", 13: "K", 14: "A", 15: "二", 16: "小王", 17: "大王"}
PASS_LINES = ["不要", "要不起", "过", "不出"]
BID_LINES = {0: "不叫", 1: "一分", 2: "两分", 3: "三分"}
FIXED = {
    "trio_single": "三带一", "trio_pair": "三带一对", "straight": "顺子", "pair_straight": "连对",
    "plane": "飞机", "plane_single": "飞机", "plane_pair": "飞机",
    "four_two_single": "四带二", "four_two_pair": "四带两对", "bomb": "炸弹", "rocket": "王炸",
}


def play_call(move, rng=None):
    """一手牌的播报词；move 为 None 表示不要。"""
    if move is None:
        return rng.choice(PASS_LINES) if rng else PASS_LINES[0]
    if move.type in FIXED:
        return FIXED[move.type]
    r = Counter(move.cards).most_common(1)[0][0]
    if move.type == "single":
        return SPOKEN[r]
    if move.type == "pair":
        return "对" + SPOKEN[r]
    if move.type == "trio":
        return "三个" + SPOKEN[r]
    return ""


def bid_call(bid):
    return BID_LINES.get(bid, "")


def alarm_call(left):
    """剩 1~2 张时报警。"""
    return {1: "我只剩一张牌啦！", 2: "我只剩两张牌啦！"}.get(left, "")
