/**
 * Live2DRegistry：多角色注册与管理。
 *
 * 每个角色一个控制器、一个画布（各自独立的 WebGL 上下文），可以同时显示多个。
 * 同时存在的控制器数量有上限（默认 6），超过时先销毁最久没用、且当前没挂在页面上的。
 */
import { CanvasOptions } from './canvas';
import { CharacterConfig, Live2DController } from './controller';
import { log } from './core';
import { sharedAssets } from './assets';

interface Entry {
  cfg: CharacterConfig;
  ctrl: Live2DController | null;
  loading: Promise<Live2DController> | null;
  lastUsed: number;
}

export class Live2DRegistry {
  private entries = new Map<string, Entry>();
  maxActive = 6;
  canvasOpts: CanvasOptions = {};

  register(cfg: CharacterConfig): void {
    if (!cfg || typeof cfg.id !== 'string' || !cfg.id) throw new TypeError('角色配置缺少 id');
    if (typeof cfg.model !== 'string' || !/\.model3\.json(\?.*)?$/i.test(cfg.model)) {
      throw new TypeError(`角色 ${cfg.id} 的 model 必须是 .model3.json 路径`);
    }
    const old = this.entries.get(cfg.id);
    if (old && old.cfg.model !== cfg.model) this.unmount(cfg.id);
    this.entries.set(cfg.id, { cfg, ctrl: old && old.cfg.model === cfg.model ? old.ctrl : null, loading: null, lastUsed: 0 });
  }

  unregister(id: string): void {
    this.unmount(id);
    this.entries.delete(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): CharacterConfig[] {
    return [...this.entries.values()].map((e) => e.cfg);
  }

  get(id: string): Live2DController | null {
    return this.entries.get(id)?.ctrl || null;
  }

  /** 把角色显示到 container 里（已加载过就直接把画布挪过去，不重新加载） */
  async mount(id: string, container: HTMLElement): Promise<Live2DController> {
    const e = this.entries.get(id);
    if (!e) throw new Error(`没有注册角色 ${id}`);
    e.lastUsed = performance.now();
    if (e.ctrl) {
      if (e.ctrl.canvas.canvas.parentElement !== container) container.appendChild(e.ctrl.canvas.canvas);
      e.ctrl.show();
      e.ctrl.canvas.start();
      return e.ctrl;
    }
    if (e.loading) {
      const c = await e.loading;
      if (c.canvas.canvas.parentElement !== container) container.appendChild(c.canvas.canvas);
      return c;
    }
    this.evict(id);
    e.loading = (async () => {
      const ctrl = new Live2DController(container, this.canvasOpts);
      try {
        await ctrl.loadModel(e.cfg.model, e.cfg);
      } catch (err) {
        ctrl.destroy();
        throw err;
      }
      e.ctrl = ctrl;
      return ctrl;
    })();
    try {
      return await e.loading;
    } finally {
      e.loading = null;
    }
  }

  show(id: string): void {
    this.get(id)?.show();
  }
  hide(id: string): void {
    this.get(id)?.hide();
  }

  /** 销毁角色的控制器和画布（配置保留，之后还能再 mount） */
  unmount(id: string): void {
    const e = this.entries.get(id);
    if (!e || !e.ctrl) return;
    e.ctrl.destroy();
    e.ctrl = null;
    sharedAssets.evict(e.cfg.model.slice(0, e.cfg.model.lastIndexOf('/') + 1));
    log('info', `已释放角色 ${id}`);
  }

  /** 只保留 keep 里的角色，其余全部释放 */
  retain(keep: string[]): void {
    for (const id of this.entries.keys()) if (!keep.includes(id)) this.unmount(id);
  }

  private evict(except: string): void {
    const live = [...this.entries.entries()].filter(([, e]) => e.ctrl);
    if (live.length < this.maxActive) return;
    const cands = live
      .filter(([id, e]) => id !== except && !(e.ctrl!.canvas.canvas.isConnected))
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const victim = cands[0] || live.filter(([id]) => id !== except).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (victim) this.unmount(victim[0]);
  }

  activeCount(): number {
    return [...this.entries.values()].filter((e) => e.ctrl).length;
  }

  destroyAll(): void {
    for (const id of this.entries.keys()) this.unmount(id);
  }
}

export const registry = new Live2DRegistry();
