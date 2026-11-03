/**
 * 仅供编译期类型检查用的 Live2D Cubism Core 声明（宽松版）。
 *
 * Cubism Core（live2dcubismcore.js）是 Live2D 的专有组件，必须从官方 SDK 包里获取，
 * 这个仓库不包含它的实现。运行时请把官方的 live2dcubismcore.min.js 放到
 * static/live2d/core/（见 static/live2d/core/README.md）。
 *
 * 如果 static/live2d/core/live2dcubismcore.d.ts 存在，build.mjs 会改用官方声明，不再使用本文件。
 */
declare namespace Live2DCubismCore {
  type csmLogFunction = (message: string) => void;
  type csmParameterType = number;

  class Moc {
    static fromArrayBuffer(buffer: ArrayBuffer): Moc;
    [key: string]: any;
  }
  class Model {
    static fromMoc(moc: Moc): Model;
    [key: string]: any;
  }
  const Version: any;
  const Logging: any;
  const Memory: any;
  const Utils: any;

  const ColorBlendType_Normal: number;
  const ColorBlendType_AddCompatible: number;
  const ColorBlendType_MultiplyCompatible: number;
  const ColorBlendType_Add: number;
  const ColorBlendType_AddGlow: number;
  const ColorBlendType_Darken: number;
  const ColorBlendType_Multiply: number;
  const ColorBlendType_ColorBurn: number;
  const ColorBlendType_LinearBurn: number;
  const ColorBlendType_Lighten: number;
  const ColorBlendType_Screen: number;
  const ColorBlendType_ColorDodge: number;
  const ColorBlendType_Overlay: number;
  const ColorBlendType_SoftLight: number;
  const ColorBlendType_HardLight: number;
  const ColorBlendType_LinearLight: number;
  const ColorBlendType_Hue: number;
  const ColorBlendType_Color: number;
}
