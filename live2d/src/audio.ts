/**
 * Live2DAudioSync：实时口型同步。
 *
 * 用 Web Audio 的 AnalyserNode 读取正在播放的 <audio> 的波形，算 RMS 音量，
 * 经过噪声门、对数映射和起落平滑后作为口型值，交给官方 CubismLipSyncUpdater 写入模型的 LipSync 参数。
 *
 * - 整个页面只用一个 AudioContext（可以通过 setAudioContextProvider 复用项目已有的）。
 * - 同一个 <audio> 只能 createMediaElementSource 一次，这里按元素缓存。
 * - AudioContext 还没被用户手势解锁时不接管音频（否则会静音），改用按文字估算的口型。
 * - 跨域且没有 CORS 的音频分析结果全是 0，同样改用估算。
 */
import { IParameterProvider } from '../framework/src/motion/iparameterprovider';

/** 纯计算部分：音量 → 口型，带平滑，方便单独测试 */
export class MouthEnvelope {
  value = 0;
  target = 0;
  attack = 0.045; // 张嘴时间常数（秒）
  release = 0.11; // 闭嘴时间常数（秒）
  floorDb = -52;
  ceilDb = -14;
  gate = 0.07;

  /** RMS（0~1）转成 0~1 的开口目标 */
  levelFromRms(rms: number): number {
    if (!(rms > 0)) return 0;
    const db = 20 * Math.log10(rms);
    let l = (db - this.floorDb) / (this.ceilDb - this.floorDb);
    l = Math.min(1, Math.max(0, l));
    if (l < this.gate) return 0;
    return Math.pow((l - this.gate) / (1 - this.gate), 0.85);
  }

  step(dt: number): number {
    const tau = this.target > this.value ? this.attack : this.release;
    const k = 1 - Math.exp(-Math.max(0, dt) / tau);
    this.value += (this.target - this.value) * k;
    if (this.value < 0.004 && this.target === 0) this.value = 0;
    return this.value;
  }
}

/** 按文字估算口型（浏览器自带语音合成拿不到音频数据时用）。纯函数，t 秒时的开口目标 */
export function estimateMouth(text: string, duration: number, t: number): number {
  if (t < 0 || t > duration || !text) return 0;
  const chars = [...text.replace(/\s+/g, '')];
  if (!chars.length) return 0;
  const per = duration / chars.length;
  const i = Math.min(chars.length - 1, Math.floor(t / per));
  const c = chars[i];
  if (/[，。！？、,.!?…~～：；:;]/.test(c)) return 0;
  const phase = (t - i * per) / per; // 0~1，一个字一张一合
  const seed = (c.codePointAt(0) || 0) % 7;
  const peak = 0.55 + seed * 0.06;
  return peak * Math.sin(Math.PI * Math.min(1, phase * 1.15));
}

type CtxProvider = () => AudioContext | null;
let ctxProvider: CtxProvider | null = null;
let ownCtx: AudioContext | null = null;

/** 让口型同步复用项目已有的 AudioContext，避免重复创建 */
export function setAudioContextProvider(fn: CtxProvider): void {
  ctxProvider = fn;
}

export function audioContext(): AudioContext | null {
  if (ctxProvider) {
    const c = ctxProvider();
    if (c) return c;
  }
  if (!ownCtx) {
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    try {
      ownCtx = new AC();
    } catch (e) {
      return null;
    }
  }
  return ownCtx;
}

/** 在用户手势里调用，解除浏览器自动播放限制 */
export function unlockAudio(): Promise<boolean> {
  const c = audioContext();
  if (!c) return Promise.resolve(false);
  if (c.state === 'running') return Promise.resolve(true);
  return c.resume().then(
    () => (c.state as string) === 'running',
    () => false
  );
}

const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

function sameOrigin(url: string): boolean {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin || u.protocol === 'blob:' || u.protocol === 'data:';
  } catch (e) {
    return false;
  }
}

export type MouthSource = 'none' | 'audio' | 'estimate' | 'manual';

export class Live2DAudioSync extends IParameterProvider {
  readonly env = new MouthEnvelope();
  source: MouthSource = 'none';
  /** 最近一次的原始音量（0~1），调试用 */
  rms = 0;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private el: HTMLMediaElement | null = null;
  private elHandlers: Array<[string, EventListener]> = [];
  private estText = '';
  private estDur = 0;
  private estT = 0;
  private manualValue = 0;
  private listeners: Array<(speaking: boolean) => void> = [];

  onSpeaking(fn: (speaking: boolean) => void): void {
    this.listeners.push(fn);
  }
  private emit(on: boolean): void {
    for (const f of this.listeners) f(on);
  }

  /**
   * 跟随一个正在（或即将）播放的音频元素。
   * 返回 'audio' 表示在做真实音频分析；'estimate' 表示条件不满足，按 text 估算；'none' 表示什么都没做。
   */
  attach(el: HTMLMediaElement, fallbackText = '', fallbackDuration = 0): MouthSource {
    this.stop();
    const ctx = audioContext();
    const url = el.currentSrc || el.src;
    const canAnalyze =
      !!ctx && ctx.state === 'running' && (sameOrigin(url) || !!el.crossOrigin);
    if (canAnalyze && ctx) {
      let src = elementSources.get(el);
      if (!src) {
        src = ctx.createMediaElementSource(el);
        elementSources.set(el, src);
      }
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.2;
      src.connect(an);
      an.connect(ctx.destination);
      this.analyser = an;
      this.buf = new Float32Array(an.fftSize);
      this.el = el;
      const onStop = () => {
        this.env.target = 0;
      };
      const onEnd = () => this.stop();
      for (const [n, h] of [
        ['pause', onStop],
        ['ended', onEnd],
        ['error', onEnd],
        ['emptied', onEnd]
      ] as Array<[string, EventListener]>) {
        el.addEventListener(n, h);
        this.elHandlers.push([n, h]);
      }
      this.source = 'audio';
      this.emit(true);
      return 'audio';
    }
    if (fallbackText && fallbackDuration > 0) {
      this.estimate(fallbackText, fallbackDuration);
      // 音频真正结束时也要闭嘴
      const onEnd: EventListener = () => this.stop();
      for (const n of ['ended', 'pause', 'error']) {
        el.addEventListener(n, onEnd);
        this.elHandlers.push([n, onEnd]);
      }
      this.el = el;
      return 'estimate';
    }
    return 'none';
  }

  /** 没有音频数据时（例如浏览器语音合成）按文字和时长估算口型 */
  estimate(text: string, duration: number): void {
    if (this.source === 'audio') this.detachElement();
    this.estText = text;
    this.estDur = Math.max(0.2, duration);
    this.estT = 0;
    this.source = 'estimate';
    this.emit(true);
  }

  /** 手动口型（调试用）：传 null 取消 */
  manual(v: number | null): void {
    if (v === null) {
      if (this.source === 'manual') this.stop();
      return;
    }
    if (this.source === 'audio') this.detachElement();
    this.manualValue = Math.min(1, Math.max(0, v));
    this.source = 'manual';
  }

  private detachElement(): void {
    if (this.el) for (const [n, h] of this.elHandlers) this.el.removeEventListener(n, h);
    this.elHandlers = [];
    if (this.analyser) {
      try {
        const src = this.el ? elementSources.get(this.el) : null;
        if (src) src.disconnect(this.analyser);
        this.analyser.disconnect();
        // 断开分析器后音频仍需要输出：重新直连到扬声器
        if (src && this.el && !this.el.ended) src.connect(audioContext()!.destination);
      } catch (e) {
        /* 已断开 */
      }
    }
    this.analyser = null;
    this.buf = null;
    this.el = null;
  }

  stop(): void {
    const was = this.source !== 'none';
    this.detachElement();
    this.source = 'none';
    this.env.target = 0;
    this.rms = 0;
    if (was) this.emit(false);
  }

  get speaking(): boolean {
    return this.source === 'audio' || this.source === 'estimate';
  }

  update(dt = 1 / 60): boolean {
    switch (this.source) {
      case 'audio': {
        if (this.analyser && this.buf && this.el && !this.el.paused) {
          this.analyser.getFloatTimeDomainData(this.buf);
          let s = 0;
          for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
          this.rms = Math.sqrt(s / this.buf.length);
          this.env.target = this.env.levelFromRms(this.rms);
        } else this.env.target = 0;
        break;
      }
      case 'estimate':
        this.estT += dt;
        this.env.target = estimateMouth(this.estText, this.estDur, this.estT);
        if (this.estT > this.estDur + 0.2) this.stop();
        break;
      case 'manual':
        this.env.target = this.manualValue;
        break;
      default:
        this.env.target = 0;
    }
    this.env.step(dt);
    return true;
  }

  getParameter(): number {
    return this.env.value;
  }

  /** 播放一段测试音频并做口型（调试界面用） */
  async playTest(url: string): Promise<HTMLAudioElement> {
    await unlockAudio();
    const a = new Audio();
    a.src = url;
    a.preload = 'auto';
    const mode = this.attach(a, '测试音频', 3);
    await a.play();
    if (mode === 'none') this.estimate('测试音频', a.duration || 3);
    return a;
  }

  destroy(): void {
    this.stop();
    this.listeners = [];
  }
}
