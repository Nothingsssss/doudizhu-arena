/**
 * 完整 API（依赖 Cubism Framework）。由 entry.ts 在 Cubism Core 加载成功后才执行。
 */
import { sharedAssets, Live2DAssetManager } from './assets';
import { Live2DCanvas } from './canvas';
import { Live2DController } from './controller';
import { coreLoaded, loadCore } from './core';
import { Live2DModel, Priority } from './model';
import { registry, Live2DRegistry } from './registry';

export default {
  loadCore,
  coreLoaded,
  Live2DCanvas,
  Live2DController,
  Live2DModel,
  Live2DAssetManager,
  Live2DRegistry,
  registry,
  assets: sharedAssets,
  Priority
};
