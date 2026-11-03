/**
 * Live2DCanvas：一个透明背景的 WebGL 画布，可以放一个或多个模型。
 *
 * - 自动适配容器尺寸和设备像素比（ResizeObserver），尺寸变化时同步渲染目标大小
 * - 页面隐藏或画布不在视口里时暂停渲染，可设置帧率上限
 * - 处理 WebGL 上下文丢失 / 恢复（恢复后自动重新加载模型）
 * - destroy() 释放模型、贴图、着色器和 GL 上下文
 */
import { CubismMatrix44 } from '../framework/src/math/cubismmatrix44';
import { CubismShaderManager_WebGL } from '../framework/src/rendering/cubismshader_webgl';
import { Live2DAssetManager, sharedAssets } from './assets';
import { loadCore, log } from './core';
import { LoadOptions, Live2DModel } from './model';

export interface ModelTransform {
  /** 水平位置，0 为中心，1 = 半个画布高度 */
  x: number;
  /** 垂直位置，0 为中心，正数向上 */
  y: number;
  /** 缩放倍率，1 = 模型按 model3.json 的布局刚好占满画布高度 */
  scale: number;
}

export interface CanvasOptions {
  maxFps?: number;
  maxDpr?: number;
  /** 不在视口内时暂停（默认 true） */
  pauseOffscreen?: boolean;
  shaderPath?: string;
  coreUrls?: string[];
  assets?: Live2DAssetManager;
  /** 抗锯齿（默认 true） */
  antialias?: boolean;
}

export interface Slot {
  model: Live2DModel;
  url: string;
  transform: ModelTransform;
  visible: boolean;
  /** 每帧在 model.update 之前调用（控制器在这里推进口型等） */
  beforeUpdate?: (dt: number) => void;
  loadOpts: LoadOptions;
}

export interface CanvasStats {
  fps: number;
  frameMs: number;
  models: number;
  width: number;
  height: number;
  webgl: 1 | 2 | 0;
  paused: boolean;
  contextLost: boolean;
}

export class Live2DCanvas {
  readonly canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  readonly slots: Slot[] = [];
  readonly assets: Live2DAssetManager;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private frames = 0;
  private fpsT = 0;
  private stats: CanvasStats;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private visibleInViewport = true;
  private running = false;
  private destroyed = false;
  private onVis = () => this.kick();
  private onLost = (e: Event) => this.handleLost(e);
  private onRestored = (): void => void this.handleRestored();
  private opts: Required<Omit<CanvasOptions, 'assets' | 'coreUrls'>> & { coreUrls?: string[] };

  constructor(target: HTMLElement | HTMLCanvasElement, opts: CanvasOptions = {}) {
    this.opts = {
      maxFps: opts.maxFps ?? 60,
      maxDpr: opts.maxDpr ?? 2,
      pauseOffscreen: opts.pauseOffscreen ?? true,
      shaderPath: opts.shaderPath ?? 'live2d/shaders/WebGL/',
      antialias: opts.antialias ?? true,
      coreUrls: opts.coreUrls
    };
    this.assets = opts.assets || sharedAssets;
    if (target instanceof HTMLCanvasElement) this.canvas = target;
    else {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'l2d-canvas';
      this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      target.appendChild(this.canvas);
    }
    this.stats = { fps: 0, frameMs: 0, models: 0, width: 0, height: 0, webgl: 0, paused: false, contextLost: false };
    this.initGl();
    this.canvas.addEventListener('webglcontextlost', this.onLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onRestored, false);
    document.addEventListener('visibilitychange', this.onVis);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    if (this.opts.pauseOffscreen && 'IntersectionObserver' in window) {
      this.io = new IntersectionObserver((es) => {
        this.visibleInViewport = es.some((e) => e.isIntersecting);
        this.kick();
      });
      this.io.observe(this.canvas);
    }
    this.resize();
  }

  private initGl(): void {
    const attrs: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: this.opts.antialias,
      preserveDrawingBuffer: false,
      powerPreference: 'default'
    };
    const g2 = this.canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
    if (g2) {
      this.gl = g2;
      this.stats.webgl = 2;
    } else {
      const g1 = (this.canvas.getContext('webgl', attrs) ||
        this.canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null;
      this.gl = g1;
      this.stats.webgl = g1 ? 1 : 0;
    }
    if (!this.gl) throw new Error('当前浏览器不支持 WebGL，无法显示 Live2D');
  }

  /** 加载模型到这个画布。会先确保 Cubism Core 已加载。 */
  async addModel(url: string, transform: Partial<ModelTransform> = {}, loadOpts: LoadOptions = {}): Promise<Slot> {
    if (this.destroyed) throw new Error('画布已销毁');
    await loadCore(this.opts.coreUrls);
    const gl = this.gl;
    if (!gl || gl.isContextLost()) throw new Error('WebGL 上下文不可用');
    const model = new Live2DModel(url, this.assets);
    const opts = { shaderPath: this.opts.shaderPath, ...loadOpts };
    await model.load(gl, this.canvas.width || 1, this.canvas.height || 1, opts);
    if (this.destroyed) {
      model.release();
      throw new Error('画布已销毁');
    }
    const slot: Slot = {
      model,
      url,
      transform: { x: 0, y: 0, scale: 1, ...transform },
      visible: true,
      loadOpts: opts
    };
    this.slots.push(slot);
    this.stats.models = this.slots.length;
    log('info', `模型已加载：${url}`);
    this.start();
    return slot;
  }

  removeModel(slot: Slot): void {
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    this.slots.splice(i, 1);
    slot.model.release();
    this.stats.models = this.slots.length;
    if (!this.slots.length) this.clear();
  }

  setTransform(slot: Slot, t: Partial<ModelTransform>): void {
    for (const k of ['x', 'y', 'scale'] as const) {
      const v = t[k];
      if (v === undefined) continue;
      if (!Number.isFinite(v)) throw new Error(`${k} 必须是有限数字`);
      if (k === 'scale' && (v <= 0 || v > 20)) throw new Error('scale 必须在 (0, 20] 之间');
      slot.transform[k] = v;
    }
  }

  /** 把画布上的像素坐标转成视线目标（-1~1） */
  toLook(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    const y = -(((clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  resize(): void {
    if (this.destroyed) return;
    const dpr = Math.min(this.opts.maxDpr, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.stats.width = w;
    this.stats.height = h;
    for (const s of this.slots) s.model.setRenderTargetSize(w, h);
    this.kick();
  }

  private shouldRun(): boolean {
    return (
      this.running &&
      !this.destroyed &&
      !document.hidden &&
      (!this.opts.pauseOffscreen || this.visibleInViewport) &&
      !!this.gl &&
      !this.gl.isContextLost()
    );
  }

  start(): void {
    this.running = true;
    this.kick();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stats.paused = true;
  }

  private kick(): void {
    if (!this.shouldRun()) {
      this.stats.paused = true;
      return;
    }
    if (this.raf) return;
    this.stats.paused = false;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    this.raf = 0;
    if (!this.shouldRun()) {
      this.stats.paused = true;
      return;
    }
    const minStep = 1000 / this.opts.maxFps;
    this.acc += now - this.last;
    const dtMs = now - this.last;
    this.last = now;
    if (this.acc + 0.5 >= minStep) {
      const dt = Math.min(0.1, this.acc / 1000);
      this.acc = this.opts.maxFps >= 60 ? 0 : this.acc % minStep;
      const t0 = performance.now();
      this.render(dt);
      this.stats.frameMs = this.stats.frameMs * 0.9 + (performance.now() - t0) * 0.1;
      this.frames++;
    }
    this.fpsT += dtMs;
    if (this.fpsT >= 500) {
      this.stats.fps = Math.round((this.frames * 1000) / this.fpsT);
      this.frames = 0;
      this.fpsT = 0;
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private clear(): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /** 推进一帧（也可以手动调用，例如截图测试） */
  render(dt: number): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    this.clear();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (const s of this.slots) {
      if (!s.model.ready) continue;
      try {
        s.beforeUpdate?.(dt);
        s.model.update(dt);
        if (!s.visible) continue;
        const proj = new CubismMatrix44();
        if (w > h) proj.scale(h / w, 1);
        else proj.scale(1, w / h);
        const tr = new CubismMatrix44();
        tr.translateRelative(s.transform.x, s.transform.y);
        const sc = new CubismMatrix44();
        sc.scaleRelative(s.transform.scale, s.transform.scale);
        proj.multiplyByMatrix(tr);
        proj.multiplyByMatrix(sc);
        s.model.draw(proj, null, [0, 0, w, h]);
      } catch (e) {
        log('error', `渲染 ${s.url} 出错：${(e as Error).message}`);
        s.visible = false;
      }
    }
  }

  getStats(): CanvasStats {
    return { ...this.stats, contextLost: !!this.gl && this.gl.isContextLost() };
  }

  private handleLost(e: Event): void {
    e.preventDefault();
    log('warn', 'WebGL 上下文丢失，等待恢复');
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const s of this.slots) s.model.release();
  }

  private async handleRestored(): Promise<void> {
    log('info', 'WebGL 上下文已恢复，重新加载模型');
    const old = this.slots.splice(0);
    for (const s of old) {
      try {
        const n = await this.addModel(s.url, s.transform, s.loadOpts);
        n.beforeUpdate = s.beforeUpdate;
        n.visible = s.visible;
        this.onRestore?.(s, n);
      } catch (err) {
        log('error', `恢复 ${s.url} 失败：${(err as Error).message}`);
      }
    }
  }

  /** 上下文恢复、模型被重新创建后回调（控制器用来重新挂接） */
  onRestore: ((oldSlot: Slot, newSlot: Slot) => void) | null = null;

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    for (const s of this.slots.splice(0)) s.model.release();
    this.ro?.disconnect();
    this.io?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    const gl = this.gl;
    if (gl) {
      // 释放这个上下文对应的官方着色器缓存
      try {
        const mgr: any = CubismShaderManager_WebGL.getInstance();
        const map: Map<any, any> | undefined = mgr._shaderMap;
        const sh = map?.get(gl);
        if (sh) {
          sh.release();
          map!.delete(gl);
        }
      } catch (e) {
        /* 忽略 */
      }
      (gl.getExtension('WEBGL_lose_context') as any)?.loseContext();
    }
    this.gl = null;
    if (this.canvas.classList.contains('l2d-canvas')) this.canvas.remove();
  }
}
