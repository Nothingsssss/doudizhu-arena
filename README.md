# token争霸赛（斗地主直播）

让多个大模型（任何 OpenAI 兼容接口）打斗地主，**9 人积分淘汰制**决出冠军：

- **9进6**：抽签分 A/B/C 三桌，每桌打 3 局，每桌积分最低的 1 人淘汰
- **6进3**：分两桌，每桌打 3 局。两桌第一直接晋级；两桌第二比积分，高的晋级，其余淘汰
- **决赛**：剩下 3 人打 3 局，积分最高的夺冠
- 每轮积分清零重算；同分依次比胜局多、三局剩牌少、抽签
- 下一轮按上一轮的位置顺序分桌，右侧流程图的连线不交叉
- 冠军产生后歇一会儿，重新抽签开下一届，一直循环

人数不是 9 也能跑（每轮保留 2/3，到 3 人打决赛）。想用以前的擂台轮换赛制，把 `arena.format` 改成 `"arena"`。

纯 Python 标准库实现，不需要安装任何依赖（Python 3.9+）。

## 运行

```bash
python server.py                            # config.json：23 个角色，有立绘的 9 个参赛；没设密钥的先用规则机器人出牌
python server.py --config config.demo.json  # 演示模式：保证 14 种牌型都打出来
```

浏览器或 OBS「浏览器源」打开 `http://localhost:8000`，宽高设为 1920×1080。画面按 16:9 自动缩放。
普通浏览器要先点一下页面才会出声音（浏览器的自动播放限制），OBS 浏览器源不用；OBS 里记得勾选「通过 OBS 控制音频」。

## 直播画面

赛博朋克主题（青 / 品红 / 电黄霓虹）：

- 顶部霓虹标题「TOKEN争霸赛」，下面是第几届、当前轮次和桌号、本桌第几局、底牌、倍数
- 三家都有大立绘：左上、右上两家，左下一家；名牌上有农民/地主徽章、本轮积分、剩余张数
- 背景是赛博城市夜景、霓虹招牌、合成波落日和滚动的透视网格地面，整屏有淡淡的扫描线
- 牌桌是全息圆桌，六边形网格、电路纹、HUD 刻度环，边缘跑马灯
- 轮到谁，谁的出牌位置出现计时器（超过 15 秒变红），立绘发光、手牌发光
- 剩 1~2 张时报警灯亮起，进入危险模式（屏幕边缘红光、音乐提速）
- 右侧上方是**赛程流程图**：最上面冠军，往下决赛、6进3、9进6（三桌）。正在打的桌子亮黄框，每人头像下显示本轮积分；打完的桌子晋级亮青、待定亮黄、淘汰变灰打叉，晋级的人用自己的颜色连线到上一层
- 右侧下方是实时战况（出牌用小牌面显示，正在思考的人实时计时）和自动解说
- 每局结算显示本局得分和本轮累计；一桌打完盖「晋级 / 待定 / 淘汰」章；一轮打完显示晋级名单；决赛后显示冠军全身立绘和决赛排名
- 三家手牌全部明牌（上帝视角）
- 鼠标移到左上角会出现语音 / 音乐 / 音效开关（地址加 `?controls=1` 一直显示）

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

`config.json` 里每个选手有 `code`（形象编号 C01~C23）、`id`、`name`（显示名）、`title`（形象名）、`color`（主题色）。
全身立绘放到 `static/avatars/<id>.png`，白底会自动去掉，详见 [static/avatars/README.md](static/avatars/README.md)。没放图的显示自动生成的徽章。

## Live2D 虚拟人（可选）

接了官方 Live2D Cubism SDK for Web（5-r.5）。给选手配好 Cubism Editor 导出的模型后，牌桌上的立绘换成会动的 Live2D：
待机呼吸、眨眼、头和身体摆动、头发衣服物理、跟着语音动嘴、按牌局切换情绪（开心 / 生气 / 难过 / 惊讶 / 思考 / 害羞 / 自信），
叫到地主点头、要不起摇头、出炸弹侧身、被淘汰低头。

需要两样东西，仓库里都没有：
1. 官方 Cubism Core：从 Live2D 官网下载并同意授权协议，放到 `static/live2d/core/`，见 [static/live2d/core/README.md](static/live2d/core/README.md)
2. 每个角色的 Live2D 模型（`.moc3` 等）：用 Cubism Editor 制作，放到 `static/live2d/models/<id>/`，然后在 `config.json` 里加 `live2d` 字段，见 [static/live2d/models/README.md](static/live2d/models/README.md)

缺任何一样，或者浏览器不支持 WebGL，都会继续显示原来的立绘。`?l2d=0` 可以强制关闭。

- 调试页：`http://localhost:8000/live2d.html`（选模型、调位置缩放、拖动控制头部、眼睛嘴巴、表情、动作、测试音频口型、物理开关、参数表、性能、错误日志）
- 验证运行环境：`sh tools/fetch_live2d_samples.sh` 下载官方示例模型 Hiyori / Mao，在调试页加载
- 给美术准备建模素材：`python3 tools/live2d_prep.py`，输出到 `live2d/prep/<id>/`（清理后的立绘、表情切图、分层 PSD 模板）
- 开发说明见 [live2d/README.md](live2d/README.md)

## 接入真实接口

### 大模型

`config.json` 已经按形象对应图放好 22 个角色（前 3 个先上桌，其余排队），并预留了接口：

| 选手 | 接口地址 | 模型 | 密钥环境变量 |
|---|---|---|---|
| C01 Claude | `https://api.anthropic.com/v1` | `claude-sonnet-4-5` | `ANTHROPIC_API_KEY` |
| C02 DeepSeek | `https://api.deepseek.com/v1` | `deepseek-flash` | `DEEPSEEK_API_KEY` |
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
| C21 小米 MiMo | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-flash` | `MIMO_API_KEY` |
| C22 阶跃星辰 | `https://api.stepfun.com/v1` | `step-3.7-flash` | `STEPFUN_API_KEY` |
| C23 DeepSeek V4 Pro | `https://api.deepseek.com/v1` | `deepseek-v4-pro` | `DEEPSEEK_API_KEY` |

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
| `format` | `"tournament"` | `"tournament"`：9 人积分淘汰；`"arena"`：旧的擂台轮换（每局淘汰一人） |
| `entrants` | 9 | 参赛人数（取 3 的倍数），有立绘的角色多于这个数时每届随机抽 |
| `games_per_table` | 3 | 每桌打几局 |
| `move_delay` | 1.5 | 每手牌之间的停顿（秒），方便观众看 |
| `game_pause` | 8 | 每局结束后的停顿（秒），显示结算 |
| `round_pause` | 12 | 每轮结束后的停顿（秒），显示晋级名单 |
| `champion_pause` | 30 | 冠军画面停留多久（秒）再开下一届 |
| `only_with_art` | true | 没有立绘的角色不上场（有立绘的不足 3 个时自动全部上场） |
| `max_games` | null | 最多打几局，null 为一直打 |
| `seed` | null | 随机种子，用于复现 |
| `demo` | false | true 等于加 `--demo` |

旧赛制（`format: "arena"`）另外支持 `eliminate_forever`、`start_score`、`score_unit`。

## 计分

倍数 = 叫分（1~3），每个炸弹/王炸 ×2，春天/反春 ×2。地主赢得或输掉 倍数×2 分，农民各 倍数×1 分（三家合计为 0）。
每桌三局累加成本轮积分，用来排名次。

## 文件

- `arena/cards.py`：牌型识别、大小比较、合法出法生成
- `arena/players.py`：规则机器人、大模型玩家、提示词
- `arena/game.py`：一局流程（叫分、出牌、春天）、争霸赛赛程（`Tournament`）和旧的擂台轮换（`Arena`）
- `arena/callout.py`：出牌播报词
- `arena/voice.py`：语音（本地模拟 / HeyGen / 自定义接口）
- `arena/demo.py`：演示模式
- `server.py`：网页服务 + 实时推送（SSE）
- `live2d/`：Live2D 模块源码（TypeScript）和官方 CubismWebFramework（submodule），`node live2d/build.mjs` 生成 `static/live2d/live2d.js`
- `tools/live2d_prep.py`、`tools/fetch_live2d_samples.sh`：建模素材准备、下载官方示例模型
- `static/`：直播画面（`index.html`、`style.css`、赛博主题 `cyber.css`、`app.js`、粒子引擎 `fx.js`、牌型动画 `combo.js`），`static/avatars/` 放立绘
