/**
 * 启动部分：不依赖 Cubism Framework（官方 Framework 的模块在加载时就会读取 Live2DCubismCore 的常量，
 * 所以必须先加载 Core，再执行 Framework 代码）。这里负责日志、WebGL 检测和 Core 脚本加载。
 */
export interface CoreInfo {
  version: string;
  versionNumber: number;
  latestMocVersion: number;
  url: string;
}

export const DEFAULT_CORE_URLS = ['live2d/core/live2dcubismcore.min.js'];

export type LogSink = (level: 'info' | 'warn' | 'error', msg: string) => void;
const sinks: LogSink[] = [];
export function onLog(fn: LogSink): () => void {
  sinks.push(fn);
  return () => {
    const i = sinks.indexOf(fn);
    if (i >= 0) sinks.splice(i, 1);
  };
}
export function log(level: 'info' | 'warn' | 'error', msg: string): void {
  const line = `[Live2D] ${msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
  for (const s of sinks) {
    try {
      s(level, msg);
    } catch (e) {
      /* 日志回调出错不影响主流程 */
    }
  }
}

function coreGlobal(): any {
  return (window as any).Live2DCubismCore;
}

function injectScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      reject(new Error(`无法加载 ${url}`));
    };
    document.head.appendChild(s);
  });
}

function describeVersion(n: number): string {
  // csmGetVersion 返回 0xMMmmpppp
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${n & 0xffff}`;
}

let corePromise: Promise<CoreInfo> | null = null;

/** 加载 Cubism Core 脚本（只加载一次）。全部地址都失败时抛出带说明的错误。 */
export function loadCoreScript(urls: string[] = DEFAULT_CORE_URLS): Promise<CoreInfo> {
  if (corePromise) return corePromise;
  corePromise = (async () => {
    const tried: string[] = [];
    let url = '(页面已预先加载)';
    if (!coreGlobal()) {
      for (const u of urls) {
        try {
          await injectScript(u);
          if (coreGlobal()) {
            url = u;
            break;
          }
          tried.push(`${u}（加载了但没有 Live2DCubismCore）`);
        } catch (e) {
          tried.push(u);
        }
      }
    }
    const core = coreGlobal();
    if (!core || !core.Version || typeof core.Version.csmGetVersion !== 'function') {
      throw new Error(
        '没有找到 Live2D Cubism Core。请从 Live2D 官网下载 Cubism SDK for Web，同意授权协议后，' +
          '把 Core/live2dcubismcore.min.js 放到 static/live2d/core/。已尝试：' +
          (tried.join('、') || '无')
      );
    }
    const n: number = core.Version.csmGetVersion();
    const latest: number = core.Version.csmGetLatestMocVersion ? core.Version.csmGetLatestMocVersion() : -1;
    const info: CoreInfo = { version: describeVersion(n), versionNumber: n, latestMocVersion: latest, url };
    log('info', `Cubism Core ${info.version} 已加载（${url}），支持 moc3 版本 ≤ ${latest}`);
    return info;
  })();
  corePromise.catch(() => {
    corePromise = null;
  });
  return corePromise;
}

/** 浏览器 WebGL 能力检测（不依赖 Core）。 */
export function webglSupport(): { webgl2: boolean; webgl: boolean } {
  const out = { webgl2: false, webgl: false };
  try {
    const c = document.createElement('canvas');
    const g2 = c.getContext('webgl2');
    out.webgl2 = !!g2;
    if (g2) (g2.getExtension('WEBGL_lose_context') as any)?.loseContext();
    if (!g2) {
      const g1 = document.createElement('canvas').getContext('webgl');
      out.webgl = !!g1;
      if (g1) (g1.getExtension('WEBGL_lose_context') as any)?.loseContext();
    } else out.webgl = true;
  } catch (e) {
    /* 不支持 */
  }
  return out;
}
