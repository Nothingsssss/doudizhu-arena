# Live2D 模型放这里

每个角色一个目录，放 Cubism Editor 导出的整套文件（**必须是 Cubism Editor 导出的真实 `.moc3`**）：

```
static/live2d/models/deepseek/
  deepseek.model3.json      入口文件
  deepseek.moc3             模型数据
  deepseek.physics3.json    物理（头发、衣服、饰品摆动）
  deepseek.pose3.json       姿势（可选）
  deepseek.4096/texture_00.png
  expressions/*.exp3.json   表情（可选）
  motions/*.motion3.json    动作（可选）
```

然后在 `config.json` 里给这个选手加上：

```json
"live2d": {
  "model": "live2d/models/deepseek/deepseek.model3.json",
  "scale": 1.6, "y": -0.5,
  "expressions": { "happy": "smile", "sad": "cry", "angry": "angry", "surprised": "surprise",
                   "thinking": "think", "shy": "blush", "confident": "smug", "neutral": "normal" },
  "motions": { "idle": "Idle", "wave": "Wave" }
}
```

没写 `live2d`、文件不存在、Cubism Core 没装或浏览器不支持 WebGL 时，牌桌继续显示原来的立绘图片。

## 建模时请使用标准参数 ID

程序按 Cubism 标准参数 ID 驱动模型，没有的参数会自动跳过（调试页「能力」里能看到）：

| 用途 | 参数 ID |
|---|---|
| 头部转动 / 倾斜 | `ParamAngleX` `ParamAngleY` `ParamAngleZ` |
| 身体摆动 | `ParamBodyAngleX` `ParamBodyAngleY` `ParamBodyAngleZ` |
| 呼吸 | `ParamBreath` |
| 眨眼（在 model3.json 的 EyeBlink 组里登记） | `ParamEyeLOpen` `ParamEyeROpen` |
| 眼球 | `ParamEyeBallX` `ParamEyeBallY` |
| 口型（在 LipSync 组里登记） | `ParamMouthOpenY` |
| 嘴形 / 笑眼 / 眉毛 / 脸红（没有表情文件时用于情绪） | `ParamMouthForm` `ParamEyeLSmile` `ParamEyeRSmile` `ParamBrowLY` `ParamBrowRY` `ParamBrowLForm` `ParamBrowRForm` `ParamBrowLAngle` `ParamBrowRAngle` `ParamCheek` |
| 挥手 | 做一个 Wave 动作（`"motions": {"wave": "Wave"}`），或用参数驱动，见下方 |

头发、衣服、饰品的摆动由 `physics3.json` 完成，输入接上 `ParamAngleX/Z`、`ParamBodyAngleX/Z` 即可跟着头和身体动。

## 参数驱动的挥手

```json
"wave": {
  "param": "ParamArmRB", "to": 3, "armSwing": 1.5,
  "swing": { "param": "ParamHandRB", "center": 1, "amp": 8 },
  "showParts": ["PartArmB"], "hideParts": ["PartArmA"],
  "hold": { "ParamArmLB": -10 },
  "hz": 1.5, "duration": 2.6
}
```

- `param` / `to`：抬手臂的参数和目标值（不写 `to` 用参数最大值），从当前动作的姿势平滑过渡过去
- `swing`：手腕或前臂来回摆，`center ± amp`
- `showParts` / `hideParts`：手臂有两套、由 pose3.json 切换时用（改的是部件的切换参数，淡入淡出由官方姿势更新器完成）
- `hold`：挥手时固定其他参数，例如另一只手臂放下

数值在调试页「挥手调参」里改了直接试，「参数」「部件」两栏可以拖动滑块找姿势。

## 官方示例模型

`sh tools/fetch_live2d_samples.sh` 会把 Live2D 官方示例模型（Hiyori、Mao）下载到 `_samples/`，用来验证运行环境。
这些模型受 [无偿提供素材使用授权协议](https://www.live2d.com/eula/live2d-free-material-license-agreement_cn.html) 约束，`_samples/` 不会提交到仓库。
