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
python server.py                            # config.json：20 个角色，没设密钥的先本地模拟
python server.py --config config.demo.json  # 演示模式：保证 14 种牌型都打出来
```

浏览器或 OBS「浏览器源」打开 `http://localhost:8000`，宽高设为 1920×1080。画面按 16:9 自动缩放。
普通浏览器要先点一下页面才会出声音（浏览器的自动播放限制），OBS 浏览器源不用；OBS 里记得勾选「通过 OBS 控制音频」。

## 直播画面

国风金红主题，参考主流斗地主的布局：

- 顶部金色牌匾「AI斗地主擂台」，下面是局数、底牌、倍数
- 三家都有大立绘：左上、右上两家，左下一家放大显示；名牌上有农民/地主徽章、积分、剩余张数
- 背景是夜景古建筑、看台、灯笼、条幅，会不停放小烟花、飘火星
- 牌桌是金边墨绿圆桌，带回纹、祥云、龙纹，边缘跑马灯跟着背景音乐闪
- 轮到谁，谁的出牌位置出现金色闹钟计时（超过 15 秒变红抖动），立绘发光、手牌浮动
- 剩 1~2 张时立绘旁亮起报警灯，进入危险模式（屏幕边缘红光、音乐提速）
- 右侧：排行榜（金银铜奖牌）、排队上场（显示第几局上场）、实时战况（出牌用小牌面显示，王炸、炸弹高亮，正在思考的人实时计时），最下面一行是自动解说
- 三家手牌全部明牌（上帝视角）
- 左上角是演示进度；鼠标移到左上角会出现语音 / 音乐 / 音效开关（地址加 `?controls=1` 一直显示）

### 特效

每种牌型都有对应的动画。画面平时不晃，**只有炸弹爆炸时震一下**。

| 牌型 | 动画 |
|---|---|
| 王炸 | 火箭在牌上点火冒烟，越飞越快冲上天，炸成烟花，两张大王牌落到屏幕中间 |
| 炸弹 | 黑色炸弹从天上掉到牌上弹一下，引线冒火星越烧越短、炸弹发红鼓起，然后爆炸（火光、碎片、浓烟，画面震一下） |
| 飞机（带单/带对） | 一架卡通客机从左下飞到右上，拉着白色尾迹，飞过时出的牌跟着一扬 |
| 顺子 | 牌一张接一张亮起跳起（音阶往上走），牌下画出一道金色箭头 |
| 连对 | 两张一组翻转跳起，牌下画出两道粉紫箭头 |
| 三张 / 三带一 / 三带二 | 三个金环依次落到三张同点数的牌上（叮叮叮） |
| 四带二 / 四带两对 | 红色印章「四带二」盖在牌旁边 |
| 单张 / 对子 | 牌面扫过一道光；2 和王有金色光芒 |
| 抢地主 | 金光、光芒、皇冠落到立绘头上 |
| 春天 / 反春 | 花瓣飘落 |
| 结算 | 礼炮彩带、烟花，输家盖「淘汰」章，挑战者光柱登场 |

机器配置差时加参数降低强度：`?fx=2`（中）、`?fx=1`（低）、`?fx=0`（关）。`?bgm=0` 关闭背景音乐。

### 音效和语音

- 音效（出牌拍桌、发牌、不要、叫分、炸弹、王炸、飞机、报警、结算…）都用浏览器实时合成，不需要素材文件
- 每出一手，选手会用自己的声音报牌型，像游戏里一样：「对三」「三带一」「飞机」「炸弹」「王炸」「要不起」；叫分报「一分/两分/三分/不叫」；剩 1~2 张时喊「我只剩两张牌啦！」；然后再念模型自己说的话
- 选手说话时背景音乐自动压低；后端会等这段话念完再走下一手

## 头像和名字

`config.json` 里每个选手有 `code`（形象编号 C01~C20）、`id`、`name`（显示名）、`title`（形象名）、`color`（主题色）。
全身立绘放到 `static/avatars/<id>.png`，白底会自动去掉，详见 [static/avatars/README.md](static/avatars/README.md)。没放图的显示自动生成的徽章。

## 接入真实接口

### 大模型

`config.json` 已经按形象对应图放好 20 个角色（前 3 个先上桌，其余排队），并预留了接口：

| 选手 | 接口地址 | 模型 | 密钥环境变量 |
|---|---|---|---|
| C01 Claude | `https://api.anthropic.com/v1` | `claude-sonnet-4-5` | `ANTHROPIC_API_KEY` |
| C02 DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| C03 Kimi | `https://api.moonshot.cn/v1` | `kimi-latest` | `MOONSHOT_API_KEY` |
| C04 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `DASHSCOPE_API_KEY` |
| C05 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | `ZHIPU_API_KEY` |
| C06 Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` | `GEMINI_API_KEY` |
| C07 Perplexity | `https://api.perplexity.ai` | `sonar` | `PERPLEXITY_API_KEY` |
| C08 Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest` | `MISTRAL_API_KEY` |
| C09 Grok | `https://api.x.ai/v1` | `grok-3-mini` | `XAI_API_KEY` |
| C10 Meta | `https://api.llama.com/compat/v1` | `Llama-4-Maverick-17B-128E-Instruct-FP8` | `LLAMA_API_KEY` |
| C11 豆包 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-1-6-250615` | `ARK_API_KEY` |
| C12 文心一言 | `https://qianfan.baidubce.com/v2` | `ernie-4.5-turbo-32k` | `QIANFAN_API_KEY` |
| C13 GitHub | `https://models.github.ai/inference` | `openai/gpt-4.1-mini` | `GITHUB_TOKEN` |
| C14 GitLab | （待填） | （待填） | `GITLAB_LLM_API_KEY` |
| C15 Gitee | `https://ai.gitee.com/v1` | `Qwen2.5-72B-Instruct` | `GITEE_AI_API_KEY` |
| C16 腾讯混元 | `https://api.hunyuan.cloud.tencent.com/v1` | `hunyuan-turbos-latest` | `HUNYUAN_API_KEY` |
| C17 RWKV | （待填） | （待填） | `RWKV_API_KEY` |
| C18 海螺 | `https://api.minimaxi.com/v1` | `MiniMax-M2` | `MINIMAX_API_KEY` |
| C19 OpenCode | （待填） | （待填） | `OPENCODE_API_KEY` |
| C20 GPT | `https://api.openai.com/v1` | `gpt-4o-mini` | `OPENAI_API_KEY` |

GitLab、RWKV、OpenCode 没有统一的公开接口，`base_url`、`model` 留空，填上你自己的网关或本地部署地址就能接入（留空时一直本地模拟）。
模型名按你实际开通的改。**设了哪个密钥，哪个选手就接真实模型；没设的继续本地模拟**（名牌上显示「模拟」），所以可以一个一个接：

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
python server.py
```

密钥只放环境变量，不要写进配置文件。其他可选字段：`temperature`、`timeout`（秒）、`max_retries`（出错重试次数，默认 2）、`extra_body`（附加到请求体的参数）。
本地接口（`http://localhost...`，比如 Ollama）不需要密钥，直接接入。`"type": "bot"` 是内置规则机器人。
列表前 3 个先上桌，后面的按顺序排队。

### 语音

`config.json` 的 `tts` 段选语音服务，`provider` 可选：

| provider | 说明 |
|---|---|
| `browser` | 本地模拟：浏览器自带的中文语音念，每个选手按 `voice_sim` 的 `pitch`（音高）、`rate`（语速）、`voice`（优先用的系统音色名，正则）区分 |
| `heygen` | HeyGen `heygen-voice-1-turbo-free`，密钥放 `HEYGEN_API_KEY`，每个选手填 `voice_id` |
| `custom` | 任意 HTTP 语音接口，见下面 |
| `none` | 静音 |

默认配置是 `heygen` + `"fallback": "browser"`：没设密钥、选手没填 `voice_id`、或者某句合成失败时，自动用本地模拟顶上，不会没声音。合成结果缓存在 `static/audio/`，同一句话只请求一次。

`custom` 的写法（以 OpenAI 语音接口为例，返回的就是音频）：

```json
"tts": {
  "provider": "custom",
  "url": "https://api.openai.com/v1/audio/speech",
  "headers": {"Authorization": "Bearer ${OPENAI_API_KEY}"},
  "required_env": ["OPENAI_API_KEY"],
  "body": {"model": "gpt-4o-mini-tts", "voice": "{voice_id}", "input": "{text}", "response_format": "mp3"},
  "fallback": "browser"
}
```

- `{text}`、`{voice_id}` 会换成要念的话和选手的 `voice_id`；`${环境变量}` 会换成环境变量的值
- 接口直接返回音频：不用再填别的
- 返回 JSON 里带音频地址：填 `"audio_url_path": "data.url"`
- 返回 JSON 里带 base64 音频：填 `"audio_base64_path": "result.audio"`
- 可选 `"duration_path"`：返回里时长（秒）的位置；不填就从 WAV 头读，读不到按字数估

HeyGen 查音色、按形象推荐：

```bash
python tools/voices.py list        # 拉取公开音色，保存 voices.json
python tools/voices.py suggest     # 按 tools/characters.json 给每个形象推荐 3 个
python tools/voices.py audition    # 生成试听，保存在 audition/
python tools/voices.py apply       # 把第一推荐写进 config.json；也可以 --pick deepseek=<voice_id>
```

## 演示模式（看特效用）

```bash
python server.py --config config.demo.json     # 或者对任意配置加 --demo
```

不调用任何大模型接口，保证 14 种牌型（单张、对子、三张、三带一、三带二、顺子、连对、飞机、飞机带单、飞机带对、四带二、四带两对、炸弹、王炸）都会打出来：发牌时把还没出过的牌型组好塞进手里，机器人优先整组打出。一般 2~3 局展示完一轮（测试 300 轮，最多 4 局），然后从头再来。左上角显示「牌型 x/14」，鼠标悬停能看到还差哪些。

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
| `start_score` | 1000 | 初始积分 |
| `score_unit` | 100 | 每 1 倍对应多少积分 |
| `demo` | false | true 等于加 `--demo` |

## 计分

倍数 = 叫分（1~3），每个炸弹/王炸 ×2，春天/反春 ×2。地主赢得或输掉 倍数×2×`score_unit` 积分，农民各 倍数×`score_unit`。
排行榜显示积分、胜负、当前连胜和最高连胜。

## 文件

- `arena/cards.py`：牌型识别、大小比较、合法出法生成
- `arena/players.py`：规则机器人、大模型玩家、提示词
- `arena/game.py`：一局流程（叫分、出牌、春天）和擂台轮换
- `arena/callout.py`：出牌播报词
- `arena/voice.py`：语音（本地模拟 / HeyGen / 自定义接口）
- `arena/demo.py`：演示模式
- `server.py`：网页服务 + 实时推送（SSE）
- `static/`：直播画面（`index.html`、`style.css`、`app.js`、粒子引擎 `fx.js`、牌型动画 `combo.js`），`static/avatars/` 放立绘
