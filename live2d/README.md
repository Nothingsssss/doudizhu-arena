# Live2D 模块

基于官方 **Cubism 5 SDK for Web R5**（`framework/` 是官方 [CubismWebFramework](https://github.com/Live2D/CubismWebFramework) 的 git submodule，固定在 `5-r.5`）。
模型由官方 Cubism Core 解析 `.moc3`、做网格变形，官方 Framework 负责动作、表情、物理、姿势、眨眼、呼吸、口型和 WebGL 渲染；
本目录只是在官方 API 上加了控制器、动画管理和多角色管理。

## 构建

```sh
git submodule update --init live2d/framework   # 第一次
node live2d/build.mjs                           # 生成 static/live2d/live2d.js 和 static/live2d/shaders/
node live2d/build.mjs --check                   # 只做类型检查
```

只需要 TypeScript 编译器（`tsc`），不用 npm 装别的包。生成的 `static/live2d/live2d.js` 已提交，直接运行 `python3 server.py` 即可。

## 运行前

- 官方 Cubism Core：见 `static/live2d/core/README.md`（需要你同意官方授权协议后下载）。
- 模型：见 `static/live2d/models/README.md`。
- 调试页：`http://localhost:8000/live2d.html`。

## 文件

| 文件 | 内容 |
|---|---|
| `src/boot.ts` | 日志、WebGL 检测、加载 Cubism Core 脚本（不依赖 Framework） |
| `src/core.ts` | Core 就绪后启动 `CubismFramework` |
| `src/entry.ts` | 打包入口，挂到 `window.Live2D`；`loadCore()` 成功后才执行 Framework 并补齐完整 API |
| `src/assets.ts` | `Live2DAssetManager`：文件缓存、贴图创建（预乘 alpha）、错误记录 |
| `src/model.ts` | `Live2DModel extends CubismUserModel`：加载 model3.json 全部资源，官方 `CubismUpdateScheduler` 组织更新，能力检测 |
| `src/animation.ts` | `AnimationCore`：待机、说话、8 种情绪、5 种互动动作、手动覆盖，优先级 / 打断 / 平滑 |
| `src/audio.ts` | `Live2DAudioSync`：Web Audio 实时音量 → 口型（官方 `CubismLipSyncUpdater` 写入） |
| `src/canvas.ts` | `Live2DCanvas`：透明 WebGL 画布、自适应尺寸、暂停、上下文丢失恢复、释放 |
| `src/controller.ts` | `Live2DController`：对外接口 |
| `src/registry.ts` | `Live2DRegistry`：多角色注册、挂载、显示隐藏、释放 |

## 更新顺序（每帧）

```
动作(motion3) → 保存参数 → 眨眼 200 → 表情 300 → 视线 400 → 本模块动画 450 → 呼吸 500 → 物理 600 → 口型 700 → 姿势 800 → model.update → 绘制
```

头和身体的动作在物理之前写入，所以头发、衣服、饰品会跟着自然摆动。

## 接口

```js
await Live2D.loadCore();                          // 加载官方 Core（只需一次）
const c = new Live2D.Live2DController(容器元素);
await c.loadModel('live2d/models/x/x.model3.json', { scale: 1.2, expressions: { happy: 'smile' } });
c.setEmotion('happy');           // neutral happy angry sad surprised thinking shy confident
c.setExpression('smile');        // 模型里的表情名，或情绪名
await c.playMotion('TapBody');   // 动作组名或 组名_序号
await c.interact('nod');         // nod shake lowerHead tilt wave
c.setHeadAngle(10, -5, 3); c.clearHeadAngle();
c.setEyeOpen(0.3); c.setEyeOpen(null);
c.setMouthOpen(0.8); c.setMouthOpen(null);
c.startSpeaking({ audio: audioElement });  // 实时音频口型
c.startSpeaking({ text: '你好', duration: 1.2 });  // 没有音频数据时按文字估算
c.stopSpeaking();
c.startIdle(); c.stopIdle(); c.setPhysics(false);
c.setTransform({ x: 0, y: -0.3, scale: 1.5 }); c.show(); c.hide();
c.getParameters(); c.capabilities();
c.destroy();
```

模型没有对应能力（缺参数、表情或动作）时返回 `{ ok: false, reason }`，不会假装成功；参数类型错误抛 `TypeError`。

## 测试

```sh
node --test tests/*.test.mjs                # 打包结果 + 动画/口型逻辑
python3 -m unittest tests/test_live2d_prep.py  # 素材准备工具
```

## 素材准备

`python3 tools/live2d_prep.py` 把 `static/avatars/` 里的立绘整理到 `live2d/prep/<id>/`（不改原图）：
清理后的 PNG、10 张表情切图、带参考层和空白部件层的 PSD 模板。部件拆分、遮挡补画和 Cubism Editor 建模需要人工完成。
