/**
 * Cubism Core 加载完成后启动 CubismFramework（只在 Core 存在后才会执行到这个模块）。
 */
import { CubismFramework, Option, LogLevel } from '../framework/src/live2dcubismframework';
import { CoreInfo, DEFAULT_CORE_URLS, loadCoreScript, log } from './boot';

export { log, onLog, webglSupport, DEFAULT_CORE_URLS } from './boot';
export type { CoreInfo } from './boot';

let frameworkReady = false;

export async function loadCore(urls: string[] = DEFAULT_CORE_URLS): Promise<CoreInfo> {
  const info = await loadCoreScript(urls);
  if (!frameworkReady) {
    const opt = new Option();
    opt.logFunction = (m: string) => log('info', m.trim());
    opt.loggingLevel = LogLevel.LogLevel_Warning;
    CubismFramework.startUp(opt);
    CubismFramework.initialize();
    frameworkReady = true;
  }
  return info;
}

export function coreLoaded(): boolean {
  return frameworkReady;
}
