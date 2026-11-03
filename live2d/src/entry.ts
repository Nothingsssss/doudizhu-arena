/**
 * 打包入口：挂到 window.Live2D。
 *
 * 官方 Cubism Framework 的模块在执行时就需要 Live2DCubismCore，所以入口只放不依赖 Framework 的部分；
 * 调用 Live2D.loadCore() 加载 Core 成功后，才执行 Framework 并把完整 API（Live2DController 等）合并进来。
 */
import { AnimationCore, EMOTIONS, INTERACTIONS } from './animation';
import {
  Live2DAudioSync,
  MouthEnvelope,
  audioContext,
  estimateMouth,
  setAudioContextProvider,
  unlockAudio
} from './audio';
import { CoreInfo, DEFAULT_CORE_URLS, loadCoreScript, onLog, webglSupport } from './boot';

declare const __l2dRequire: (name: string) => any;

let full: any = null;
let fullPromise: Promise<CoreInfo> | null = null;

const api: any = {
  version: '1.0.0',
  framework: 'CubismWebFramework 5-r.5（Cubism 5 SDK for Web R5）',
  DEFAULT_CORE_URLS,
  webglSupport,
  onLog,
  AnimationCore,
  EMOTIONS,
  INTERACTIONS,
  Live2DAudioSync,
  MouthEnvelope,
  estimateMouth,
  audioContext,
  setAudioContextProvider,
  unlockAudio,
  /** Core 和 Framework 都就绪 */
  coreLoaded: (): boolean => !!full && full.coreLoaded(),
  /** 加载 Cubism Core 并启用完整 API；之后 Live2D.Live2DController / registry 等才可用 */
  loadCore(urls?: string[]): Promise<CoreInfo> {
    if (fullPromise) return fullPromise;
    fullPromise = loadCoreScript(urls).then(async (info) => {
      if (!full) full = __l2dRequire('src/index').default;
      await full.loadCore(urls);
      const { loadCore: _ignored, coreLoaded: _c, ...rest } = full;
      Object.assign(api, rest);
      window.dispatchEvent(new CustomEvent('live2d:core', { detail: info }));
      return info;
    });
    fullPromise.catch(() => {
      fullPromise = null;
    });
    return fullPromise;
  }
};

(window as any).Live2D = api;
export default api;
