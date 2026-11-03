# AI 斗地主擂台（直播用）

让多个大模型（任何 OpenAI 兼容接口）轮流打斗地主。桌上 3 人，其余排队，**每局淘汰一人**：

- 地主输了：地主下场
- 农民输了：剩牌多的农民下场
  - 剩牌张数一样：剩余牌点数总和大的下场（2、王算大牌）
  - 还一样：随机
- 下场的人排到队尾，队首的人补位（`eliminate_forever: true` 则直接出局，打到只剩 3 人为止）

纯 Python 标准库实现，不需要安装任何依赖（Python 3.9+）。

## 运行

```bash
python server.py                            # 默认 config.json（5 个规则机器人，可直接试跑）
python server.py --config config.example.json --port 8000
```

浏览器或 OBS「浏览器源」打开 `http://localhost:8000`，建议分辨率 1920×1080。

## 接入大模型

复制 `config.example.json`，在 `players` 里加选手：

```json
{"name": "DeepSeek", "type": "llm",
 "base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat",
 "api_key_env": "DEEPSEEK_API_KEY"}
```

API Key 放环境变量（`export DEEPSEEK_API_KEY=...`），不要写进配置文件。
其他可选字段：`temperature`、`timeout`（秒）、`max_retries`（出错重试次数，默认 2）、`extra_body`（附加到请求体的参数）。
`"type": "bot"` 是内置规则机器人，可以凑人数。

列表前 3 个先上桌，后面的按顺序排队。

## 大模型怎么出牌

每回合程序把手牌、各家剩余张数、底牌、最近 20 手出牌和合法出法列表发给模型，要求它只回一个 JSON：

```json
{"play": "3 3 3 4", "say": "给观众的一句话"}
```

`say` 会显示在直播画面的对话气泡里。程序会校验出牌是否合法，不合法就把错误告诉模型让它重出。
超过重试次数或接口报错时，由规则机器人代打这一手，画面上会标注。

## 配置项（`arena`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `move_delay` | 1.5 | 每手牌之间的停顿（秒），方便观众看 |
| `game_pause` | 8 | 每局结束后的停顿（秒），显示谁下场 |
| `eliminate_forever` | false | true：输的人直接出局，不再排队 |
| `max_games` | null | 最多打几局，null 为一直打 |
| `seed` | null | 随机种子，用于复现 |

## 计分

底分为叫分（1~3），每个炸弹/王炸 ×2，春天/反春 ×2。地主赢得或输掉 2 倍，农民各 1 倍。
排行榜显示积分、胜负、当前连胜和最高连胜。

## 文件

- `arena/cards.py`：牌型识别、大小比较、合法出法生成
- `arena/players.py`：规则机器人、大模型玩家、提示词
- `arena/game.py`：一局流程（叫分、出牌、春天）和擂台轮换
- `server.py`：网页服务 + 实时推送（SSE）
- `static/index.html`：直播画面
