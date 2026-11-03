"""一局斗地主 + 擂台轮换。"""
import random
import time
from collections import deque

from .callout import BEAT_LINE, alarm_call, bid_call, play_call

# 立绘特写（大招式切入）在网页上的时长；后端多等这么久，免得下一手牌盖住特写
CUTIN_PAUSE = {"rocket": 1.4, "bomb": 1.3, "alarm": 0.9, "beat": 0.6}
BEAT_CHANCE = 0.3   # 压过对手的牌时，报"大你"的概率（游戏里也不是每次都喊）
from .cards import TYPE_NAMES, fmt, new_deck, validate


class Game:
    def __init__(self, players, emit, move_delay=1.0, rng=None, tts=None, dealer=None):
        self.players = players          # 3 个 Player，按座位顺序（逆时针出牌）
        self.emit = emit
        self.move_delay = move_delay
        self.rng = rng or random.Random()
        self.tts = tts
        self.dealer = dealer        # 演示模式用：自定义发牌

    def _sleep(self, clips=None, extra=0.0):
        # 有语音时等它念完再继续，避免几个人的话叠在一起；extra 留给立绘特写
        t = self.move_delay
        talk = sum(c.get("duration") or 0 for c in clips or [])
        if talk:
            t = max(t, talk + 0.3)
        if t and extra:
            t += extra
        if t:
            time.sleep(t)

    def _voice(self, seat, *texts):
        """按顺序合成几段话（播报词、报警、发言），返回网页要播放的片段列表。"""
        if not self.tts:
            return []
        p = self.players[seat]
        clips = []
        for t in texts:
            c = self.tts.speak(t, getattr(p, "voice_id", ""), getattr(p, "voice_sim", None)) if t else None
            if c:
                clips.append(c)
        return clips

    def _deal(self):
        if self.dealer:
            return self.dealer(self.rng)
        deck = new_deck()
        self.rng.shuffle(deck)
        return [sorted(deck[0:17]), sorted(deck[17:34]), sorted(deck[34:51])], sorted(deck[51:])

    def _bidding(self, hands, bottom):
        names = [p.name for p in self.players]
        for attempt in range(3):
            start = self.rng.randrange(3)
            best, landlord = 0, None
            for k in range(3):
                seat = (start + k) % 3
                view = {"hand": hands[seat], "current_bid": best, "seat": seat, "names": names}
                self.emit("turn", {"seat": seat, "phase": "bid"})
                t0 = time.time()
                b, say = self.players[seat].bid(view)
                b = b if (b == 0 or best < b <= 3) else 0
                think_ms = int((time.time() - t0) * 1000)
                call = bid_call(b)
                clips = self._voice(seat, call, say)
                self.emit("bid", {"seat": seat, "bid": b, "say": say, "call": call, "clips": clips,
                                  "think_ms": think_ms})
                self._sleep(clips)
                if b > best:
                    best, landlord = b, seat
                if best == 3:
                    break
            if landlord is not None:
                return landlord, best, hands, bottom
            self.emit("redeal", {"reason": "没人叫地主，重新发牌"})
            hands, bottom = self._deal()
            self.emit("deal", {"hands": [list(h) for h in hands], "bottom": None})
        return start, 1, hands, bottom   # 三次都没人叫：强制首叫者当地主

    def run(self):
        names = [p.name for p in self.players]
        hands, bottom = self._deal()
        self.emit("deal", {"hands": [list(h) for h in hands], "bottom": None})
        landlord, base, hands, bottom = self._bidding(hands, bottom)
        hands[landlord] = sorted(hands[landlord] + bottom)
        roles = ["农民"] * 3
        roles[landlord] = "地主"
        self.emit("landlord", {"seat": landlord, "bid": base, "bottom": bottom,
                               "hands": [list(h) for h in hands], "roles": roles})

        history, bombs = [], 0
        turn, prev, prev_seat, passes = landlord, None, None, 0
        played = [0, 0, 0]
        alarmed = [False, False, False]
        while True:
            view = {
                "seat": turn, "hand": hands[turn], "roles": roles, "names": names,
                "cards_left": [len(h) for h in hands], "bottom": bottom,
                "history": history, "prev_move": prev,
                "prev_player": names[prev_seat] if prev_seat is not None else None,
                "prev_is_teammate": prev_seat is not None and roles[prev_seat] == roles[turn] == "农民",
                "prev_player_cards_left": len(hands[prev_seat]) if prev_seat is not None else 99,
            }
            self.emit("turn", {"seat": turn, "phase": "play", "lead": prev is None})
            t0 = time.time()
            cards, say = self.players[turn].play(view)
            beaten = prev_seat if prev is not None else None   # 这手要压的是谁的牌
            think_ms = int((time.time() - t0) * 1000)
            try:
                move = validate(cards, hands[turn], prev)
            except ValueError as e:   # 理论上 Player 已校验，这里再兜一次
                say = f"[非法出牌 {fmt(cards)}: {e}，判为不要]"
                move = None
                if prev is None:      # 首家不能不要：出最小单张
                    move = validate([hands[turn][0]], hands[turn], None)
            if move:
                for c in move.cards:
                    hands[turn].remove(c)
                played[turn] += 1
                if move.type in ("bomb", "rocket"):
                    bombs += 1
                prev, prev_seat, passes = move, turn, 0
                history.append((names[turn], roles[turn], list(move.cards)))
            else:
                passes += 1
                history.append((names[turn], roles[turn], []))
            call = play_call(move, self.rng)
            left = len(hands[turn])
            alarm = alarm_call(left) if move and left in (1, 2) and not alarmed[turn] else ""
            if alarm:
                alarmed[turn] = True
            # 压过对手（不是队友）的牌：有时喊"大你"
            beat = move is not None and beaten is not None and beaten != turn and roles[beaten] != roles[turn]
            cutin = ""
            if move and move.type in ("rocket", "bomb"):
                cutin = move.type
            elif alarm:
                cutin = "alarm"
            elif beat and self.rng.random() < BEAT_CHANCE:
                call, cutin = BEAT_LINE, "beat"
            clips = self._voice(turn, call, alarm, say)
            self.emit("play", {"seat": turn, "call": call, "alarm": alarm, "clips": clips,
                               "cards": list(move.cards) if move else [],
                               "type": TYPE_NAMES[move.type] if move else "不要",
                               "kind": move.type if move else "pass",
                               "say": say, "cards_left": [len(h) for h in hands],
                               "hands": [list(h) for h in hands], "think_ms": think_ms,
                               "multiplier": base * (2 ** bombs),
                               "beat": beaten if beat else None, "cutin": cutin})
            self._sleep(clips, CUTIN_PAUSE.get(cutin, 0.0))
            if not hands[turn]:
                winner_side = roles[turn]
                break
            if passes == 2:
                prev, prev_seat, passes = None, None, 0
                self.emit("new_round", {"seat": (turn + 1) % 3})
            turn = (turn + 1) % 3

        # 春天：农民一张没出 / 反春：地主只出了第一手
        farmers = [i for i in range(3) if i != landlord]
        spring = (winner_side == "地主" and all(played[i] == 0 for i in farmers)) or \
                 (winner_side == "农民" and played[landlord] == 1)
        multiplier = base * (2 ** bombs) * (2 if spring else 1)
        return {"landlord": landlord, "roles": roles, "winner_side": winner_side,
                "hands_left": [list(h) for h in hands], "bombs": bombs,
                "spring": spring, "multiplier": multiplier}


class Arena:
    """擂台：桌上 3 人，其余排队；每局淘汰一人，排队的第一个人补位。

    淘汰规则：
      - 地主输：地主下场
      - 农民输：剩牌多的农民下场；剩牌一样多，比剩余牌点数总和，大的下场；还一样就随机
    下场的人排到队尾（eliminate_forever=True 时直接出局）。
    """

    def __init__(self, players, emit, move_delay=1.0, game_pause=5.0,
                 eliminate_forever=False, seed=None, tts=None, dealer=None,
                 start_score=1000, score_unit=100):
        if len(players) < 3:
            raise ValueError("至少需要 3 名玩家")
        self.rng = random.Random(seed)
        self.tts = tts
        self.dealer = dealer
        self.table = list(players[:3])
        self.queue = deque(players[3:])
        self.out = []
        self.emit = emit
        self.move_delay = move_delay
        self.game_pause = game_pause
        self.eliminate_forever = eliminate_forever
        self.game_no = 0
        self.score_unit = score_unit    # 每 1 倍对应多少积分
        self.stats = {p.name: {"games": 0, "wins": 0, "losses": 0, "score": start_score,
                               "streak": 0, "best_streak": 0, "eliminated": 0}
                      for p in players}
        self.running = True
        self.profiles = {p.name: p.profile() for p in players}

    def snapshot(self):
        return {"game_no": self.game_no, "profiles": self.profiles,
                "table": [p.name for p in self.table],
                "queue": [p.name for p in self.queue],
                "out": [p.name for p in self.out],
                "stats": self.stats}

    def pick_loser(self, res):
        if res["winner_side"] == "农民":
            return res["landlord"], "地主输了"
        farmers = [i for i in range(3) if i != res["landlord"]]
        a, b = farmers
        la, lb = res["hands_left"][a], res["hands_left"][b]
        if len(la) != len(lb):
            loser = a if len(la) > len(lb) else b
            return loser, f"农民输了，剩牌多 ({len(res['hands_left'][loser])} 张)"
        if sum(la) != sum(lb):
            loser = a if sum(la) > sum(lb) else b
            return loser, f"农民输了，剩牌一样多 ({len(la)} 张)，点数总和更大"
        return self.rng.choice(farmers), "农民输了，剩牌和点数都一样，随机淘汰"

    def play_one(self):
        self.game_no += 1
        self.emit("game_start", {"game_no": self.game_no, **self.snapshot()})
        res = Game(self.table, self.emit, self.move_delay, self.rng, self.tts, self.dealer).run()

        win_side = res["winner_side"]
        deltas = []
        for i, p in enumerate(self.table):
            s = self.stats[p.name]
            s["games"] += 1
            won = res["roles"][i] == win_side
            pts = res["multiplier"] * (2 if res["roles"][i] == "地主" else 1) * self.score_unit
            deltas.append(pts if won else -pts)
            if won:
                s["wins"] += 1
                s["score"] += pts
                s["streak"] += 1
                s["best_streak"] = max(s["best_streak"], s["streak"])
            else:
                s["losses"] += 1
                s["score"] -= pts
                s["streak"] = 0

        loser_seat, reason = self.pick_loser(res)
        loser = self.table[loser_seat]
        self.stats[loser.name]["eliminated"] += 1
        newcomer = None
        if self.queue:
            newcomer = self.queue.popleft()
            self.table[loser_seat] = newcomer
            (self.out if self.eliminate_forever else self.queue).append(loser)
        self.emit("game_end", {
            **res, "loser": loser.name, "reason": reason, "deltas": deltas,
            "newcomer": newcomer.name if newcomer else None,
            **self.snapshot(),
        })
        return res

    def run_forever(self, max_games=None):
        while self.running and (max_games is None or self.game_no < max_games):
            if len(self.table) < 3:
                break
            self.play_one()
            if self.eliminate_forever and not self.queue:
                self.emit("champion", {"names": [p.name for p in self.table], **self.snapshot()})
                break
            time.sleep(self.game_pause)


ROUND_NAMES = {9: "9进6", 6: "6进3", 3: "决赛"}


class Tournament:
    """token争霸赛：9 人积分淘汰制。

      第一轮 9进6：抽签分 3 桌，每桌打 3 局，每桌积分最低的 1 人淘汰
      第二轮 6进3：分 2 桌，每桌打 3 局，两桌第一直接晋级；两桌第二比积分，高的晋级
      决赛 3进1：剩下 3 人打 3 局，积分最高的夺冠
    每轮积分清零重算。同分依次比：胜局多、剩牌少、抽签。
    下一轮按上一轮的位置顺序分桌（流程图上的连线不交叉）。冠军产生后歇一会儿，重新抽签开下一届。

    人数不是 9 也能跑：每轮保留 2/3（取 3 的倍数），到 3 人打决赛。
    """

    def __init__(self, players, emit, move_delay=1.0, game_pause=5.0, seed=None, tts=None, dealer=None,
                 games_per_table=3, round_pause=None, champion_pause=30.0, entrants=9):
        if len(players) < 3:
            raise ValueError("至少需要 3 名玩家")
        self.rng = random.Random(seed)
        self.all_players = list(players)
        self.entrants = max(3, entrants - entrants % 3)
        self.emit = emit
        self.move_delay = move_delay
        self.game_pause = game_pause
        self.round_pause = game_pause if round_pause is None else round_pause
        self.champion_pause = champion_pause
        self.tts = tts
        self.dealer = dealer
        self.games_per_table = games_per_table
        self.profiles = {p.name: p.profile() for p in players}
        self.running = True
        self.game_no = 0
        self.edition = 0
        self.rounds = []
        self.stats = {}
        self.match = None
        self.champion = None

    # ---------- 赛程 ----------
    @staticmethod
    def next_size(n):
        if n <= 3:
            return 1
        return max(3, (n * 2 // 3) // 3 * 3)

    def _new_round(self, names):
        n = len(names)
        tables = [{"players": names[k:k + 3], "games": 0, "done": False, "ranking": [],
                   "scores": {n: 0 for n in names[k:k + 3]},
                   "advance": [], "out": [], "pending": []} for k in range(0, n, 3)]
        return {"name": ROUND_NAMES.get(n, f"{n}进{self.next_size(n)}"), "size": n,
                "target": self.next_size(n), "tables": tables, "done": False, "advance": []}

    def bracket(self):
        return {"edition": self.edition, "rounds": self.rounds, "match": self.match,
                "champion": self.champion, "games_per_table": self.games_per_table,
                "plan": self._plan()}

    def _plan(self):
        n, out = self.entrants, []
        while True:
            out.append(n)
            if n <= 1:
                return out
            n = self.next_size(n)

    def snapshot(self, table=None):
        return {"game_no": self.game_no, "profiles": self.profiles, "table": table or [],
                "stats": self.stats, "bracket": self.bracket()}

    def _rank(self, names):
        def key(n):
            s = self.stats[n]
            return (-s["score"], -s["wins"], s["left"], s["draw"])
        return sorted(names, key=key)

    # ---------- 一局 ----------
    def _play_game(self, table, rnd, ti):
        tb = rnd["tables"][ti]
        self.game_no += 1
        self.match = {"round": len(self.rounds) - 1, "round_name": rnd["name"], "table": ti,
                      "game": tb["games"] + 1, "of": self.games_per_table}
        seats = list(table)
        k = tb["games"] % 3            # 每局换一下座位顺序
        seats = seats[k:] + seats[:k]
        names = [p.name for p in seats]
        self.emit("game_start", {**self.snapshot(names), "match": self.match})
        res = Game(seats, self.emit, self.move_delay, self.rng, self.tts, self.dealer).run()
        deltas = []
        for i, p in enumerate(seats):
            s = self.stats[p.name]
            won = res["roles"][i] == res["winner_side"]
            pts = res["multiplier"] * (2 if res["roles"][i] == "地主" else 1)
            d = pts if won else -pts
            deltas.append(d)
            s["games"] += 1
            s["score"] += d
            s["left"] += len(res["hands_left"][i])
            if won:
                s["wins"] += 1
                s["streak"] += 1
            else:
                s["losses"] += 1
                s["streak"] = 0
        tb["games"] += 1
        tb["scores"] = {n: self.stats[n]["score"] for n in tb["players"]}
        tb["ranking"] = self._rank(tb["players"])
        info = {}
        if tb["games"] >= self.games_per_table:
            tb["done"] = True
            info = self._settle_table(rnd, tb)
        self.emit("game_end", {**res, **self.snapshot(names), "deltas": deltas, "match": self.match,
                               "table_done": tb["done"], **info})
        return res

    def _settle_table(self, rnd, tb):
        """一桌打完：定下直接晋级、直接淘汰、待定（要和别桌同名次比）的人。"""
        ntab = len(rnd["tables"])
        sure, extra = divmod(rnd["target"], ntab)
        rk = tb["ranking"]
        tb["advance"] = rk[:sure]
        tb["pending"] = rk[sure:sure + 1] if extra else []
        tb["out"] = rk[sure + (1 if extra else 0):]
        res = {"advanced": list(tb["advance"]), "eliminated": list(tb["out"]), "pending": list(tb["pending"]),
               "reason": ""}
        if all(t["done"] for t in rnd["tables"]) and extra:
            # 所有桌打完：各桌待定的人比积分，取前 extra 名
            cands = [n for t in rnd["tables"] for n in t["pending"]]
            win = self._rank(cands)[:extra]
            for t in rnd["tables"]:
                for n in t["pending"]:
                    (t["advance"] if n in win else t["out"]).append(n)
                t["pending"] = []
            res["playoff"] = {"advanced": win, "eliminated": [n for n in cands if n not in win]}
        return res

    # ---------- 一届 ----------
    def run_edition(self):
        self.edition += 1
        self.champion = None
        names = [p.name for p in self.all_players]
        self.rng.shuffle(names)
        names = names[:self.entrants] if len(names) >= self.entrants else names[:len(names) - len(names) % 3]
        by_name = {p.name: p for p in self.all_players}
        self.rounds = [self._new_round(names)]
        while self.running:
            rnd = self.rounds[-1]
            self.stats = {n: {"games": 0, "wins": 0, "losses": 0, "score": 0, "left": 0, "streak": 0,
                              "draw": self.rng.random()}
                          for t in rnd["tables"] for n in t["players"]}
            self.emit("round_start", self.snapshot())
            for ti, tb in enumerate(rnd["tables"]):
                table = [by_name[n] for n in tb["players"]]
                while self.running and tb["games"] < self.games_per_table:
                    self._play_game(table, rnd, ti)
                    time.sleep(self.game_pause)
            if not self.running:
                return
            rnd["done"] = True
            # 按位置顺序晋级，保证流程图连线不交叉
            rnd["advance"] = [n for t in rnd["tables"] for n in t["players"] if n in t["advance"]]
            self.match = None
            if rnd["target"] <= 1:
                self.champion = rnd["advance"][0]
                self.emit("champion", {**self.snapshot(), "names": [self.champion],
                                       "final": rnd["tables"][0]["ranking"]})
                return
            self.emit("round_end", self.snapshot())
            time.sleep(self.round_pause)
            self.rounds.append(self._new_round(rnd["advance"]))

    def run_forever(self, max_games=None, max_editions=None):
        while self.running and (max_editions is None or self.edition < max_editions):
            if max_games is not None and self.game_no >= max_games:
                break
            self.run_edition()
            time.sleep(self.champion_pause)
