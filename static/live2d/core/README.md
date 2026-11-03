# Cubism Core 放这里

Live2D 运行时需要官方的 **Live2D Cubism Core**（`live2dcubismcore.min.js`）。它是 Live2D 公司的专有组件，
本仓库不包含、也不能替你下载或同意授权协议，需要你自己按官方流程获取：

1. 打开 <https://www.live2d.com/sdk/download/web/>，阅读并同意
   [Live2D Proprietary Software 使用授权协议](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_cn.html)，
   下载 **Cubism SDK for Web**（本项目按 **5-r.5** 开发，对应 CubismWebFramework 5-r.5）。
2. 解压后把 `Core/live2dcubismcore.min.js` 复制到本目录：

   ```
   static/live2d/core/live2dcubismcore.min.js
   ```

3. （可选）把 `Core/live2dcubismcore.d.ts` 也放进来，`node live2d/build.mjs` 会改用官方类型声明做类型检查。

授权说明：个人和最近一个会计年度营收低于 1000 万日元的企业可以免费使用；超过的需要签
[Cubism SDK 发行许可](https://www.live2d.com/zh-CHS/download/cubism-sdk/release-license/)。
直播属于对外发布，请自行确认是否符合条件。

放好后打开 `/live2d.html`，顶部显示 `Cubism Core 5.x.x` 即为成功。
