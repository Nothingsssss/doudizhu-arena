# 选手立绘

把每个形象的**全身立绘**按下面的文件名放进这个文件夹，重启服务就会显示。支持 png / webp / jpg / gif，用编号命名也行（`C01.png`、`c01-claude.png`）。

**表情图**（2 行 5 列的头像表）命名为 `<文件名>-faces.png`，如 `deepseek-faces.png`；第一格（平常表情）会用作排行榜、排队、战况里的小头像。没有表情图就从全身立绘里自动裁脸。

| 编号 | 文件名 | 选手 | 形象 |
|---|---|---|---|
| C01 | `claude.png` | Claude | 棕发抱书少女 |
| C02 | `deepseek.png` | DeepSeek | 鲸鱼女仆 |
| C03 | `kimi.png` | Kimi | 银发藏青礼服 |
| C04 | `qwen.png` | 通义千问 | 蓝紫长裙 |
| C05 | `glm.png` | GLM | 黑发尖帽 |
| C06 | `gemini.png` | Gemini | 紫发双马尾 |
| C07 | `perplexity.png` | Perplexity | 墨绿法师 |
| C08 | `mistral.png` | Mistral | 法棍红帽 |
| C09 | `grok.png` | Grok | 金发持斧 |
| C10 | `meta.png` | Meta | 白发狐耳 |
| C11 | `seed.png` | 豆包 | 抱娃双马尾 |
| C12 | `wenxin.png` | 文心一言 | 书堆轮椅 |
| C13 | `github.png` | GitHub | 黑猫触手 |
| C14 | `gitlab.png` | GitLab | 橙狐长裙 |
| C15 | `gitee.png` | Gitee | 红衣小恶魔 |
| C16 | `hunyuan.png` | 腾讯混元 | 黑发红围巾 |
| C17 | `rwkv.png` | RWKV | 乌鸦羽翼 |
| C18 | `hailuo.png` | 海螺 | 橙发信使 |
| C19 | `opencode.png` | OpenCode | 黑角少女 |
| C20 | `gpt.png` | GPT | 白发龙娘 |
| C21 | `mimo.png` | 小米 MiMo | 白发橙领带少女 |
| C22 | `stepfun.png` | 阶跃星辰 | 橙色机器人 |

网页会自动处理立绘，不用自己抠图：

- **白底 / 纯色底自动去掉**（从图片四边往里去，人物描边以内的白衣服不受影响）。图本身就是透明底也可以。
- 牌桌上显示人物上半身（头到腰），下半身渐隐进牌桌。
- 排行榜、排队、战况、结算里的圆形小头像会自动裁出脸部。

需要微调时，在 `config.json` 对应选手里加：

- `"face": [50, 12, 16]`：小头像裁剪位置，脸中心横向 50%、纵向 12%、框大小为图高的 16%（都按整张图算）
- `"cutout": false`：不去背景，大立绘边缘渐隐；`"cutout": true`：已经是透明图，不处理
- `"art": "bust"`：不是全身图而是半身图，整张显示
- `"avatar": "https://..."`：用网络图片（网络图片读不了像素，不会自动去背景，最好用透明底）

没放图的选手显示自动生成的六边形徽章。
