/**
 * Live2DController：对外的统一控制接口（一个控制器 = 一个角色）。
 *
 * 参数非法（非数字、超范围的类型错误）抛 TypeError；
 * 模型没有对应能力（缺参数、缺表情、缺动作）不会假装成功，返回 { ok:false, reason }。
 */
import { CubismModel } from '../framework/src/model/cubismmodel';
import { ICubismUpdater } from '../framework/src/motion/icubismupdater';
import {
  ActionResult,
  AnimationCore,
  AnimationOptions,
  EMOTIONS,
  Emotion,
  INTERACTIONS,
  Interaction,
  P,
  ParamTarget,
  WaveConfig
} from './animation';
import { Live2DAudioSync } from './audio';
import { CanvasOptions, Live2DCanvas, ModelTransform, Slot } from './canvas';
import { log } from './core';
import { Live2DModel, Priority, idOf } from './model';

export interface CharacterConfig {
  id: string;
  name?: string;
  /** model3.json 路径 */
  model: string;
  scale?: number;
  x?: number;
  y?: number;
  /** 情绪 → 模型里的表情名（exp3.json 在 model3.json 里的 Name） */
  expressions?: Partial<Record<Emotion, string>>;
  /** 互动/待机/说话 → 模型里的动作组名或 组名_序号 */
  motions?: Partial<Record<Interaction | 'idle' | 'speak', string>>;
  wave?: WaveConfig;
  audio?: { attack?: number; release?: number; floorDb?: number; ceilDb?: number; gate?: number };
  /** 期望模型具备的参数，加载后会报告缺失项 */
  params?: string[];
  idleScale?: number;
  /** 不用模型自带的 Idle 动作组（只用程序待机动画） */
  disableIdleMotion?: boolean;
}

const CONTROLLER_ORDER = 450; // 视线(400)之后，呼吸(500)、物理(600)之前

class ModelTarget implements ParamTarget {
  constructor(private m: Live2DModel) {}
  has(id: string): boolean {
    return this.m.hasParam(id);
  }
  range(id: string): { min: number; max: number; def: number } | null {
    const p = this.m.caps?.params.get(id);
    return p ? { min: p.min, max: p.max, def: p.def } : null;
  }
  hasPart(id: string): boolean {
    return this.m.hasPart(id);
  }
  setPart(id: string, v: number): void {
    this.m.setPartOpacity(id, v);
  }
  getPart(id: string): number {
    return this.m.getPartOpacity(id);
  }
  private model(): CubismModel {
    return this.m.getModel();
  }
  add(id: string, v: number, w = 1): void {
    this.model().addParameterValueById(idOf(id), v, w);
  }
  set(id: string, v: number, w = 1): void {
    this.model().setParameterValueById(idOf(id), v, w);
  }
  mul(id: string, v: number, w = 1): void {
    this.model().multiplyParameterValueById(idOf(id), v, w);
  }
  get(id: string): number {
    return this.model().getParameterValueById(idOf(id));
  }
}

class AnimationUpdater extends ICubismUpdater {
  constructor(private core: AnimationCore, private audio: Live2DAudioSync) {
    super(CONTROLLER_ORDER);
  }
  onLateUpdate(_model: CubismModel, dt: number): void {
    this.core.mouth = this.audio.getParameter();
    this.core.apply(dt);
  }
}

const num = (name: string, v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} 必须是有限数字`);
  return v;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class Live2DController {
  readonly canvas: Live2DCanvas;
  readonly audio = new Live2DAudioSync();
  config: CharacterConfig | null = null;
  slot: Slot | null = null;
  anim: AnimationCore | null = null;
  private ownsCanvas: boolean;
  private destroyed = false;
  private manualSpeaking = false;
  private loading: Promise<void> | null = null;

  constructor(target: HTMLElement | Live2DCanvas, canvasOpts: CanvasOptions = {}) {
    if (target instanceof Live2DCanvas) {
      this.canvas = target;
      this.ownsCanvas = false;
    } else {
      this.canvas = new Live2DCanvas(target, canvasOpts);
      this.ownsCanvas = true;
    }
    this.audio.onSpeaking(() => this.syncSpeaking());
    this.canvas.onRestore = (old, n) => {
      if (this.slot === old) {
        this.slot = n;
        this.attach();
      }
    };
  }

  get model(): Live2DModel | null {
    return this.slot ? this.slot.model : null;
  }

  get ready(): boolean {
    return !!this.slot && this.slot.model.ready;
  }

  private need(): Live2DModel {
    if (this.destroyed) throw new Error('控制器已销毁');
    const m = this.model;
    if (!m || !m.ready) throw new Error('模型还没加载完成');
    return m;
  }

  /** 加载模型。可以传 model3.json 路径，或完整的角色配置 */
  async loadModel(modelPath: string, cfg: Partial<CharacterConfig> = {}): Promise<void> {
    if (typeof modelPath !== 'string' || !/\.model3\.json(\?.*)?$/i.test(modelPath)) {
      throw new TypeError('modelPath 必须是 .model3.json 文件路径');
    }
    if (this.destroyed) throw new Error('控制器已销毁');
    const run = async () => {
      this.unload();
      const config: CharacterConfig = { id: cfg.id || modelPath, ...cfg, model: modelPath };
      const slot = await this.canvas.addModel(modelPath, {
        x: config.x ?? 0,
        y: config.y ?? 0,
        scale: config.scale ?? 1
      });
      if (this.destroyed) {
        this.canvas.removeModel(slot);
        return;
      }
      this.config = config;
      this.slot = slot;
      this.attach();
      const missing = (config.params || []).filter((p) => !slot.model.hasParam(p));
      if (missing.length) log('warn', `${config.id} 缺少参数：${missing.join(', ')}`);
    };
    this.loading = run();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private attach(): void {
    const slot = this.slot;
    const cfg = this.config;
    if (!slot || !cfg) return;
    const m = slot.model;
    const a = cfg.audio || {};
    for (const k of ['attack', 'release', 'floorDb', 'ceilDb', 'gate'] as const) {
      if (typeof a[k] === 'number') (this.audio.env as any)[k] = a[k];
    }
    m.setAudioProvider(this.audio);
    m.autoIdleMotion = !cfg.disableIdleMotion;
    if (cfg.motions?.idle) {
      const g = cfg.motions.idle.replace(/_\d+$/, '');
      if (m.findGroup([g])) m.idleGroup = m.findGroup([g])!;
    }
    const opts: AnimationOptions = {
      expressions: cfg.expressions,
      motions: cfg.motions,
      wave: cfg.wave,
      idleScale: cfg.idleScale
    };
    const prev = this.anim;
    this.anim = new AnimationCore(new ModelTarget(m), opts);
    if (prev) {
      this.anim.idle = prev.idle;
      this.anim.setEmotion(prev.emotion, this.emotionExpression(prev.emotion) !== null);
      prev.destroy();
    }
    m.addUpdater(new AnimationUpdater(this.anim, this.audio));
  }

  private unload(): void {
    this.audio.stop();
    this.anim?.destroy();
    this.anim = null;
    if (this.slot) this.canvas.removeModel(this.slot);
    this.slot = null;
    this.config = null;
  }

  private syncSpeaking(): void {
    if (this.anim) this.anim.speaking = this.manualSpeaking || this.audio.speaking;
  }

  private emotionExpression(e: Emotion): string | null {
    const m = this.model;
    if (!m) return null;
    const mapped = this.config?.expressions?.[e];
    if (mapped && m.expressionNames().includes(mapped)) return mapped;
    // 表情名刚好和情绪同名（不区分大小写）也算
    const same = m.expressionNames().find((n) => n.toLowerCase() === e);
    return same || null;
  }

  /**
   * 切换表情。name 可以是模型里的表情名，也可以是情绪名（neutral/happy/angry/sad/surprised/thinking/shy/confident）。
   * 情绪名会同时调整头部姿态；模型没有对应表情文件时，用面部参数（嘴形/眉毛/脸红）实现。
   */
  setExpression(name: string): ActionResult {
    if (typeof name !== 'string' || !name) throw new TypeError('表情名必须是非空字符串');
    const m = this.need();
    if ((EMOTIONS as readonly string[]).includes(name)) return this.setEmotion(name as Emotion);
    if (!m.setExpressionByName(name)) {
      return { ok: false, reason: `模型没有表情「${name}」，可用：${m.expressionNames().join('、') || '无'}` };
    }
    return { ok: true, via: 'expression' };
  }

  setEmotion(e: Emotion): ActionResult {
    if (!(EMOTIONS as readonly string[]).includes(e)) throw new TypeError(`未知情绪 ${e}，可用：${EMOTIONS.join(', ')}`);
    const m = this.need();
    const exp = this.emotionExpression(e);
    if (exp) m.setExpressionByName(exp);
    else m.clearExpression();
    this.anim!.setEmotion(e, !!exp);
    const caps = this.anim!.capabilities();
    const viaParams = (caps.emotionParams as string[]).includes(e) || e === 'neutral';
    if (!exp && !viaParams) return { ok: false, reason: `模型既没有「${e}」表情，也没有可用的面部/头部参数` };
    return { ok: true, via: exp ? 'expression' : 'parameters' };
  }

  get emotion(): Emotion {
    return this.anim ? this.anim.emotion : 'neutral';
  }

  /** 播放模型自带动作：组名（随机一个）或 组名_序号 */
  async playMotion(name: string, priority: number = Priority.Normal): Promise<ActionResult> {
    if (typeof name !== 'string' || !name) throw new TypeError('动作名必须是非空字符串');
    const m = this.need();
    const groups = m.caps ? Object.keys(m.caps.motionGroups) : [];
    const exists = m.motionNames().includes(name) || groups.includes(name);
    if (!exists) return { ok: false, reason: `模型没有动作「${name}」，可用组：${groups.join('、') || '无'}` };
    const started = m.startMotionByName(name, priority);
    const ok = await started;
    return ok ? { ok: true, via: 'motion', result: 'done' } : { ok: false, reason: '优先级更高的动作正在播放' };
  }

  /** 互动动作：nod 点头 / shake 摇头 / lowerHead 低头 / tilt 身体倾斜 / wave 挥手 */
  async interact(name: Interaction, priority: number = Priority.Normal): Promise<ActionResult> {
    if (!INTERACTIONS.includes(name)) throw new TypeError(`未知动作 ${name}，可用：${INTERACTIONS.join(', ')}`);
    const m = this.need();
    const anim = this.anim!;
    const mapped = this.config?.motions?.[name];
    if (mapped) {
      const r = await this.playMotion(mapped, priority);
      if (r.ok || name === 'wave') return r;
    }
    if (name === 'wave') {
      const w = this.config?.wave;
      if (w?.motion) return this.playMotion(w.motion, priority);
      if (w?.param || w?.swing) {
        const chk = anim.checkWave(w);
        if (!chk.ok) return { ok: false, reason: `挥手配置里这些参数/部件模型没有：${chk.missing.join('、')}` };
        const p = anim.startWaveParam(w, priority);
        if (!p) return { ok: false, reason: '优先级更高的动作正在执行' };
        return { ok: true, via: 'parameters', result: await p };
      }
      return { ok: false, reason: '这个模型没有配置挥手（需要在角色配置里给 wave.motion 或 wave.param）' };
    }
    const caps = anim.capabilities();
    if (!caps.head) return { ok: false, reason: '模型没有头部角度参数（ParamAngleX/Y/Z）' };
    const p = anim.startInteraction(name, priority);
    if (!p) return { ok: false, reason: '优先级更高的动作正在执行' };
    return { ok: true, via: 'parameters', result: await p };
  }

  setHeadAngle(x: number, y: number, z: number): ActionResult {
    num('x', x);
    num('y', y);
    num('z', z);
    const m = this.need();
    if (!m.hasParam(P.angleX) && !m.hasParam(P.angleY) && !m.hasParam(P.angleZ)) {
      return { ok: false, reason: '模型没有头部角度参数' };
    }
    const lim = (id: string, v: number) => {
      const i = m.caps?.params.get(id);
      return i ? clamp(v, i.min, i.max) : v;
    };
    this.anim!.setHead(lim(P.angleX, x), lim(P.angleY, y), lim(P.angleZ, z));
    return { ok: true, via: 'parameters' };
  }

  /** 修改挥手配置（调试时调参用），返回检查结果 */
  setWaveConfig(w: WaveConfig): ActionResult {
    if (!w || typeof w !== 'object') throw new TypeError('wave 配置必须是对象');
    this.need();
    if (!this.config) throw new Error('模型还没加载完成');
    const chk = this.anim!.checkWave(w);
    this.config.wave = w;
    (this.anim!.opts as AnimationOptions).wave = w;
    return chk.ok || w.motion ? { ok: true } : { ok: false, reason: `模型没有：${chk.missing.join('、')}` };
  }

  /** 调试：把某个参数固定为 value（null 取消），会覆盖动作和动画 */
  setParameter(id: string, value: number | null): ActionResult {
    const m = this.need();
    if (!m.hasParam(id)) return { ok: false, reason: `模型没有参数 ${id}` };
    if (value !== null) {
      num('value', value);
      const r = m.caps!.params.get(id)!;
      value = clamp(value, r.min, r.max);
    }
    this.anim!.overrideParam(id, value);
    return { ok: true, via: 'parameters' };
  }

  /** 调试：固定部件透明度（null 取消） */
  setPartOpacity(id: string, value: number | null): ActionResult {
    const m = this.need();
    if (!m.hasPart(id)) return { ok: false, reason: `模型没有部件 ${id}` };
    if (value !== null) value = clamp(num('value', value), 0, 1);
    this.anim!.overridePart(id, value);
    return { ok: true };
  }

  getParts(): Array<{ id: string; opacity: number; pose: boolean }> {
    const m = this.model;
    if (!m || !m.ready || !m.caps) return [];
    return m.caps.parts.map((id) => ({ id, opacity: m.getPartRenderOpacity(id), pose: m.posePartIds().has(id) }));
  }

  clearHeadAngle(): void {
    this.anim?.clearHead();
  }

  /** 眼睛开合 0~1，传 null 恢复自动眨眼 */
  setEyeOpen(value: number | null): ActionResult {
    const m = this.need();
    if (value === null) {
      this.anim!.setEye(null);
      return { ok: true };
    }
    num('value', value);
    if (!m.hasParam(P.eyeLOpen) && !m.hasParam(P.eyeROpen)) return { ok: false, reason: '模型没有眼睛开合参数' };
    this.anim!.setEye(clamp(value, 0, 1));
    return { ok: true, via: 'parameters' };
  }

  /** 嘴巴开合 0~1，传 null 交还给口型同步 */
  setMouthOpen(value: number | null): ActionResult {
    const m = this.need();
    if (!m.hasLipSync()) return { ok: false, reason: '模型没有口型参数（LipSync 组或 ParamMouthOpenY）' };
    if (value === null) {
      this.audio.manual(null);
      return { ok: true };
    }
    num('value', value);
    this.audio.manual(clamp(value, 0, 1));
    return { ok: true, via: 'parameters' };
  }

  /**
   * 开始说话。传入正在播放的 <audio> 时做真实音频口型；
   * 只有文字（例如浏览器语音合成）时按文字和时长估算口型。
   */
  startSpeaking(opts: { audio?: HTMLMediaElement; text?: string; duration?: number } = {}): ActionResult {
    const m = this.need();
    this.manualSpeaking = true;
    let via: string = 'none';
    if (opts.audio) via = this.audio.attach(opts.audio, opts.text || '', opts.duration || 0);
    else if (opts.text) {
      this.audio.estimate(opts.text, opts.duration && opts.duration > 0 ? opts.duration : opts.text.length * 0.22);
      via = 'estimate';
    }
    this.syncSpeaking();
    const sp = this.config?.motions?.speak;
    if (sp) void m.startMotionByName(sp, Priority.Normal);
    if (!m.hasLipSync()) return { ok: false, reason: '模型没有口型参数，只能做说话时的头部动作' };
    return { ok: true, via: 'parameters', reason: via === 'audio' ? '实时音频分析' : via === 'estimate' ? '按文字估算' : undefined };
  }

  stopSpeaking(): void {
    this.manualSpeaking = false;
    this.audio.stop();
    this.syncSpeaking();
  }

  startIdle(): void {
    if (this.anim) this.anim.idle = true;
    if (this.model) this.model.autoIdleMotion = !this.config?.disableIdleMotion;
  }

  stopIdle(): void {
    if (this.anim) this.anim.idle = false;
    if (this.model) this.model.autoIdleMotion = false;
  }

  setPhysics(on: boolean): ActionResult {
    const m = this.need();
    if (!m.setPhysicsEnabled(!!on)) return { ok: false, reason: '模型没有物理文件（physics3.json）' };
    return { ok: true };
  }

  /** 视线/头部跟随目标，x、y 在 -1~1 */
  setLookTarget(x: number, y: number): void {
    num('x', x);
    num('y', y);
    this.need().setLookTarget(clamp(x, -1, 1), clamp(y, -1, 1));
  }

  setTransform(t: Partial<ModelTransform>): void {
    if (!this.slot) throw new Error('模型还没加载完成');
    this.canvas.setTransform(this.slot, t);
  }

  show(): void {
    if (this.slot) this.slot.visible = true;
  }
  hide(): void {
    if (this.slot) this.slot.visible = false;
  }

  /** 当前所有参数值（调试用） */
  getParameters(): Array<{ id: string; value: number; min: number; max: number; def: number }> {
    const m = this.model;
    if (!m || !m.ready || !m.caps) return [];
    return [...m.caps.params.values()].map((p) => ({ ...p, value: m.getParam(p.id) }));
  }

  capabilities(): Record<string, unknown> {
    const m = this.model;
    if (!m || !m.caps) return {};
    return {
      ...this.anim!.capabilities(),
      expressions: m.expressionNames(),
      motionGroups: m.caps.motionGroups,
      physics: m.caps.hasPhysics,
      pose: m.caps.hasPose,
      eyeBlink: m.caps.eyeBlinkIds,
      lipSync: m.caps.lipSyncIds,
      parameterCount: m.caps.params.size,
      partCount: m.caps.parts.length,
      mocVersion: m.caps.mocVersion
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.audio.destroy();
    this.anim?.destroy();
    this.anim = null;
    if (this.slot && !this.ownsCanvas) this.canvas.removeModel(this.slot);
    this.slot = null;
    if (this.ownsCanvas) this.canvas.destroy();
  }
}
