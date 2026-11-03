/**
 * Live2DAnimationManager：统一的动画状态管理。
 *
 * 每帧在官方更新顺序里的「视线(400)之后、呼吸(500)/物理(600)之前」写入参数，
 * 所以头和身体的转动会带动官方物理（头发、衣服、饰品）一起摆动。
 *
 * 分层（后面的层覆盖或叠加在前面之上）：
 *   1. 待机：平滑随机游走 + 低频正弦叠加，头/身体/眼球自然小幅移动，不会机械重复
 *   2. 说话：根据口型值的起伏轻微点头、晃头
 *   3. 情绪：头部姿态偏移；模型没有对应表情文件时，再用面部参数（嘴形、眉毛、脸红、眯眼）补
 *   4. 互动动作：点头 / 摇头 / 低头 / 侧倾 / 挥手，有优先级，可以打断低优先级动作
 *   5. 手动覆盖：setHeadAngle / setEyeOpen 等，带淡入淡出
 *
 * 所有参数写入前都会检查模型是否有这个参数；没有的通道直接跳过并在能力列表里体现。
 */

export interface ParamTarget {
  has(id: string): boolean;
  /** 参数范围（模型里实际的最小/最大/默认值）；没有这个参数返回 null */
  range(id: string): { min: number; max: number; def: number } | null;
  hasPart(id: string): boolean;
  setPart(id: string, opacity: number): void;
  getPart(id: string): number;
  add(id: string, v: number, w?: number): void;
  set(id: string, v: number, w?: number): void;
  mul(id: string, v: number, w?: number): void;
  get(id: string): number;
}

export const P = {
  angleX: 'ParamAngleX',
  angleY: 'ParamAngleY',
  angleZ: 'ParamAngleZ',
  bodyX: 'ParamBodyAngleX',
  bodyY: 'ParamBodyAngleY',
  bodyZ: 'ParamBodyAngleZ',
  eyeX: 'ParamEyeBallX',
  eyeY: 'ParamEyeBallY',
  eyeLOpen: 'ParamEyeLOpen',
  eyeROpen: 'ParamEyeROpen',
  eyeLSmile: 'ParamEyeLSmile',
  eyeRSmile: 'ParamEyeRSmile',
  mouthForm: 'ParamMouthForm',
  mouthOpen: 'ParamMouthOpenY',
  browLY: 'ParamBrowLY',
  browRY: 'ParamBrowRY',
  browLForm: 'ParamBrowLForm',
  browRForm: 'ParamBrowRForm',
  browLAngle: 'ParamBrowLAngle',
  browRAngle: 'ParamBrowRAngle',
  cheek: 'ParamCheek'
} as const;

export const EMOTIONS = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'surprised',
  'thinking',
  'shy',
  'confident'
] as const;
export type Emotion = (typeof EMOTIONS)[number];

type Pose = Partial<Record<keyof typeof P, number>>;

/** 头部/身体姿态偏移（对所有模型都用） */
const EMOTION_POSE: Record<Emotion, Pose> = {
  neutral: {},
  happy: { angleY: 3, angleZ: 4, bodyZ: 1.5 },
  angry: { angleY: -5, angleX: -3, bodyY: -2 },
  sad: { angleY: -11, angleZ: -3, bodyY: -3, eyeY: -0.4 },
  surprised: { angleY: 6, bodyY: 2 },
  thinking: { angleX: -9, angleY: 4, angleZ: 8, eyeX: -0.55, eyeY: 0.6 },
  shy: { angleX: 7, angleY: -6, angleZ: 5, eyeX: -0.5, eyeY: -0.35 },
  confident: { angleY: 6, angleZ: -4, bodyZ: 2.5 }
};
/** 面部参数（模型没有对应表情文件时才用） */
const EMOTION_FACE: Record<Emotion, Pose> = {
  neutral: {},
  happy: { mouthForm: 1, eyeLSmile: 0.8, eyeRSmile: 0.8, browLY: 0.3, browRY: 0.3 },
  angry: { mouthForm: -0.7, browLForm: -1, browRForm: -1, browLAngle: -0.8, browRAngle: -0.8, browLY: -0.4, browRY: -0.4 },
  sad: { mouthForm: -1, browLForm: -0.6, browRForm: -0.6, browLAngle: 0.7, browRAngle: 0.7 },
  surprised: { browLY: 1, browRY: 1, mouthForm: 0 },
  thinking: { mouthForm: -0.3, browLY: 0.4, browRY: -0.2 },
  shy: { cheek: 1, mouthForm: 0.4, eyeLSmile: 0.4, eyeRSmile: 0.4 },
  confident: { mouthForm: 0.7, browLY: 0.2, browRY: 0.2, eyeLSmile: 0.3, eyeRSmile: 0.3 }
};
/** 眼睛开合倍率 */
const EMOTION_EYE: Partial<Record<Emotion, number>> = { surprised: 1.25, sad: 0.82, angry: 0.88, confident: 0.92, shy: 0.85 };

export type Interaction = 'nod' | 'shake' | 'lowerHead' | 'tilt' | 'wave';
export const INTERACTIONS: Interaction[] = ['nod', 'shake', 'lowerHead', 'tilt', 'wave'];

interface ActiveInteraction {
  name: Interaction;
  t: number;
  dur: number;
  priority: number;
  curve: (t: number) => Pose;
  resolve: (r: 'done' | 'interrupted') => void;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const envelope = (t: number, dur: number, fin = 0.15, fout = 0.22) =>
  Math.min(ease(t / fin), ease((dur - t) / fout));

const CURVES: Record<Exclude<Interaction, 'wave'>, { dur: number; f: (t: number) => Pose }> = {
  nod: {
    dur: 1.0,
    f: (t) => {
      // 两下点头，第二下轻一些
      const y = -13 * Math.sin(Math.PI * Math.min(1, t / 0.42)) * (t < 0.42 ? 1 : 0) -
        7 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.45) / 0.4))) * (t >= 0.45 && t < 0.85 ? 1 : 0);
      return { angleY: y, bodyY: y * 0.15 };
    }
  },
  shake: {
    dur: 1.2,
    f: (t) => {
      const d = Math.exp(-t * 1.2);
      return { angleX: 20 * Math.sin(t * Math.PI * 2 * 1.7) * d, angleZ: 2 * Math.sin(t * Math.PI * 3.4) * d };
    }
  },
  lowerHead: {
    dur: 1.8,
    f: (t) => {
      const k = envelope(t, 1.8, 0.35, 0.5);
      return { angleY: -20 * k, bodyY: -4 * k, eyeY: -0.6 * k };
    }
  },
  tilt: {
    dur: 1.6,
    f: (t) => {
      const k = envelope(t, 1.6, 0.3, 0.45);
      return { angleZ: 13 * k, bodyZ: 5 * k, bodyX: 3 * k, angleX: 4 * k };
    }
  }
};

/** 平滑随机游走：每隔一段随机时间换一个目标，用临界阻尼弹簧追过去，再叠一点低频正弦 */
class Wander {
  private x = 0;
  private v = 0;
  private target = 0;
  private next = 0;
  private t = Math.random() * 100;
  private f1 = 0.11 + Math.random() * 0.06;
  private f2 = 0.23 + Math.random() * 0.09;
  constructor(
    private amp: number,
    private hold: [number, number],
    private stiffness = 6,
    private sineAmp = 0.25
  ) {}
  step(dt: number, rnd: () => number): number {
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0) {
      this.target = (rnd() * 2 - 1) * this.amp;
      this.next = this.hold[0] + rnd() * (this.hold[1] - this.hold[0]);
    }
    const k = this.stiffness;
    const a = k * k * (this.target - this.x) - 2 * k * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    const s = this.amp * this.sineAmp * (Math.sin(this.t * Math.PI * 2 * this.f1) * 0.6 + Math.sin(this.t * Math.PI * 2 * this.f2 + 1.3) * 0.4);
    return this.x + s;
  }
  reset(): void {
    this.x = this.v = 0;
  }
}

/** 二阶平滑，去掉高频抖动 */
class Smooth {
  x = 0;
  v = 0;
  constructor(private k = 14) {}
  step(target: number, dt: number): number {
    const k = this.k;
    const a = k * k * (target - this.x) - 2 * k * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export interface WaveConfig {
  /** 用模型自带动作实现，例如 "TapBody" 或 "TapBody_0"（写了就优先用动作） */
  motion?: string;
  /** 抬手臂的参数，例如 "ParamArmRB" */
  param?: string;
  /** 旧配置兼容字段，已不使用：手臂从当前动作的值平滑过渡过去，不会从 from 跳变 */
  from?: number;
  /** 手臂抬到的值；不写用参数最大值 */
  to?: number;
  /** 挥手时手臂自身的来回摆动幅度（参数值），默认 0 */
  armSwing?: number;
  /** 摆手（手腕/前臂）参数：在 center ± amp 之间来回，默认整个参数范围 */
  swing?: { param: string; amp?: number; center?: number };
  /** 摆动频率（次/秒），默认 1.6 */
  hz?: number;
  /** 总时长（秒），默认 2.4 */
  duration?: number;
  /** 挥手时要显示 / 隐藏的部件（模型的手臂有 A/B 两套、由 pose3.json 切换时用），例如 Hiyori：show PartArmB、hide PartArmA */
  showParts?: string[];
  hideParts?: string[];
  /** 挥手期间固定的其他参数，例如另一只手臂放下：{ "ParamArmLB": -10 } */
  hold?: Record<string, number>;
}

/** 检查挥手配置在这个模型上能不能用，返回缺失项 */
export function checkWave(t: ParamTarget, w: WaveConfig | undefined): { ok: boolean; missing: string[] } {
  if (!w) return { ok: false, missing: ['wave 配置'] };
  const missing: string[] = [];
  if (w.param && !t.has(w.param)) missing.push(w.param);
  if (w.swing && !t.has(w.swing.param)) missing.push(w.swing.param);
  for (const id of [...(w.showParts || []), ...(w.hideParts || [])]) if (!t.hasPart(id)) missing.push(id);
  for (const id of Object.keys(w.hold || {})) if (!t.has(id)) missing.push(id);
  const drives = (!!w.param && t.has(w.param)) || (!!w.swing && t.has(w.swing.param));
  return { ok: drives && !missing.length, missing };
}

export interface AnimationOptions {
  /** 模型有对应表情文件时的映射：情绪 → 表情名 */
  expressions?: Partial<Record<Emotion, string>>;
  /** 互动动作也可以映射到模型自带 motion：动作名 → motion 组名或 group_index */
  motions?: Partial<Record<Interaction | 'idle' | 'speak', string>>;
  wave?: WaveConfig;
  /** 待机动作幅度倍率 */
  idleScale?: number;
  random?: () => number;
}

export interface ActionResult {
  ok: boolean;
  via?: 'motion' | 'parameters' | 'expression';
  reason?: string;
  result?: 'done' | 'interrupted';
}

export class AnimationCore {
  idle = true;
  speaking = false;
  emotion: Emotion = 'neutral';
  /** 由外部提供的口型值（0~1），用于说话时的头部动作 */
  mouth = 0;
  private emoW = new Map<Emotion, number>();
  private emotionUsesExpression = false;
  private wander: Record<string, Wander>;
  private smooth: Record<string, Smooth> = {};
  private active: ActiveInteraction | null = null;
  private headOverride: { x: number; y: number; z: number } | null = null;
  private headW = 0;
  private eyeOverride: number | null = null;
  private eyeW = 0;
  private lastEye = 1;
  private speakW = 0;
  private speakPhase = 0;
  private mouthPrev = 0;
  private nodKick = 0;
  private wave: { cfg: WaveConfig; t: number; dur: number; restore: number } | null = null;
  private overrides = new Map<string, number>();
  private partOverrides = new Map<string, number>();
  private rnd: () => number;
  idleScale: number;

  constructor(private target: ParamTarget, readonly opts: AnimationOptions = {}) {
    this.rnd = opts.random || Math.random;
    this.idleScale = opts.idleScale ?? 1;
    this.wander = {
      angleX: new Wander(9, [2.2, 5.5], 2.6),
      angleY: new Wander(4.5, [2.5, 6], 2.4),
      angleZ: new Wander(4, [3, 7], 2.0),
      bodyX: new Wander(3, [3, 7], 1.6),
      bodyZ: new Wander(2, [3.5, 8], 1.4),
      eyeX: new Wander(0.38, [0.6, 2.8], 18, 0.05),
      eyeY: new Wander(0.2, [0.8, 3], 18, 0.05)
    };
    for (const e of EMOTIONS) this.emoW.set(e, e === 'neutral' ? 1 : 0);
  }

  capabilities(): Record<string, boolean | string[]> {
    const t = this.target;
    const head = t.has(P.angleX) || t.has(P.angleY) || t.has(P.angleZ);
    const w = this.opts.wave;
    return {
      head,
      body: t.has(P.bodyX) || t.has(P.bodyZ),
      eyeBall: t.has(P.eyeX),
      eyeOpen: t.has(P.eyeLOpen) || t.has(P.eyeROpen),
      mouthOpen: t.has(P.mouthOpen),
      mouthForm: t.has(P.mouthForm),
      nod: head || !!this.opts.motions?.nod,
      shake: head || !!this.opts.motions?.shake,
      lowerHead: head || !!this.opts.motions?.lowerHead,
      tilt: head || !!this.opts.motions?.tilt,
      wave: !!(this.opts.motions?.wave || (w && (w.motion || checkWave(t, w).ok))),
      emotionParams: EMOTIONS.filter((e) =>
        Object.keys({ ...EMOTION_POSE[e], ...EMOTION_FACE[e] }).some((k) => t.has(P[k as keyof typeof P]))
      ) as unknown as string[]
    };
  }

  setEmotion(e: Emotion, usesExpression: boolean): void {
    this.emotion = e;
    this.emotionUsesExpression = usesExpression;
  }

  setHead(x: number, y: number, z: number): void {
    this.headOverride = { x, y, z };
  }
  clearHead(): void {
    this.headOverride = null;
  }
  setEye(v: number | null): void {
    this.eyeOverride = v;
    if (v !== null) this.lastEye = v;
  }

  /** 开始一个参数驱动的互动动作。优先级不够时拒绝。 */
  startInteraction(name: Exclude<Interaction, 'wave'>, priority: number): Promise<'done' | 'interrupted'> | null {
    if (this.active && this.active.priority > priority) return null;
    if (this.active) this.active.resolve('interrupted');
    const c = CURVES[name];
    return new Promise((resolve) => {
      this.active = { name, t: 0, dur: c.dur, priority, curve: c.f, resolve };
    });
  }

  /**
   * 参数挥手：手臂平滑抬起（从当前动作的姿势过渡，不跳变）→ 手腕来回摆 → 放下。
   * 需要的参数或部件模型里没有时返回 null（调用方用 checkWave 拿缺失项）。
   */
  startWaveParam(cfg: WaveConfig, priority: number): Promise<'done' | 'interrupted'> | null {
    if (!checkWave(this.target, cfg).ok) return null;
    if (this.active && this.active.priority > priority) return null;
    if (this.active) this.active.resolve('interrupted');
    const dur = cfg.duration && cfg.duration > 0.8 ? cfg.duration : 2.4;
    const hz = cfg.hz && cfg.hz > 0 ? cfg.hz : 1.6;
    this.wave = { cfg, t: 0, dur, restore: 0 };
    return new Promise((resolve) => {
      this.active = {
        name: 'wave',
        t: 0,
        dur,
        priority,
        resolve,
        curve: (t) => {
          const k = envelope(t, dur, 0.4, 0.5);
          // 头跟着手轻轻歪，身体略微侧过来
          return { angleZ: 4 * k * Math.sin(t * Math.PI * 2 * hz), angleY: 2 * k, bodyZ: 2 * k };
        }
      };
    });
  }

  /** 每帧写入挥手的手臂/手腕参数和部件透明度（在动作之后、姿势和物理之前） */
  private applyWave(dt: number): void {
    const w = this.wave;
    if (!w) return;
    const t = this.target;
    const c = w.cfg;
    const showP = c.showParts || [];
    const hideP = c.hideParts || [];
    if (this.active && this.active.name === 'wave') {
      w.t += dt;
      const k = envelope(w.t, w.dur, 0.4, 0.5);
      const hz = c.hz && c.hz > 0 ? c.hz : 1.6;
      const ph = Math.sin(w.t * Math.PI * 2 * hz);
      if (c.param && t.has(c.param)) {
        const r = t.range(c.param)!;
        const to = c.to ?? r.max;
        const v = Math.min(r.max, Math.max(r.min, to + (c.armSwing || 0) * ph));
        t.set(c.param, v, k); // 按权重和动作的值混合：抬起和放下都是平滑的
      }
      if (c.swing && t.has(c.swing.param)) {
        const r = t.range(c.swing.param)!;
        const center = c.swing.center ?? (r.min + r.max) / 2;
        const amp = c.swing.amp ?? (r.max - r.min) / 2;
        t.set(c.swing.param, Math.min(r.max, Math.max(r.min, center + amp * ph)), k);
      }
      for (const [id, v] of Object.entries(c.hold || {})) {
        const r = t.range(id);
        if (r) t.set(id, Math.min(r.max, Math.max(r.min, v)), k);
      }
      // 部件切换要比手臂动作早一点完成，不然会看到两套手臂叠在一起
      const pk = Math.min(1, k * 2.5);
      for (const id of showP) t.setPart(id, Math.max(t.getPart(id), pk));
      for (const id of hideP) t.setPart(id, Math.min(t.getPart(id), 1 - pk));
    } else {
      // 结束或被打断：如果动作本身不控制这些部件，在 0.4 秒内换回去
      w.restore += dt;
      const k = Math.min(1, w.restore / 0.4);
      for (const id of showP) t.setPart(id, Math.min(t.getPart(id), 1 - k));
      for (const id of hideP) t.setPart(id, Math.max(t.getPart(id), k));
      if (k >= 1) this.wave = null;
    }
  }

  checkWave(w: WaveConfig | undefined): { ok: boolean; missing: string[] } {
    return checkWave(this.target, w);
  }

  /** 调试：固定某个参数的值（null 取消） */
  overrideParam(id: string, v: number | null): void {
    if (v === null) this.overrides.delete(id);
    else this.overrides.set(id, v);
  }
  overridePart(id: string, v: number | null): void {
    if (v === null) this.partOverrides.delete(id);
    else this.partOverrides.set(id, v);
  }
  overriddenParams(): Map<string, number> {
    return this.overrides;
  }

  cancelInteraction(): void {
    if (this.active) this.active.resolve('interrupted');
    this.active = null;
  }

  get interaction(): Interaction | null {
    return this.active ? this.active.name : null;
  }

  /** 每帧调用：计算并写入参数 */
  apply(dt: number): void {
    dt = Math.min(0.1, Math.max(0, dt));
    const t = this.target;
    const out: Record<string, number> = {};
    const add = (k: string, v: number) => (out[k] = (out[k] || 0) + v);

    // 1. 待机
    const idleK = this.idle ? this.idleScale : 0;
    for (const k of Object.keys(this.wander)) {
      const v = this.wander[k].step(dt, this.rnd);
      if (idleK) add(k, v * idleK);
    }

    // 2. 说话：口型上升沿给一点点头，说话时头部轻微摆动
    this.speakW += ((this.speaking ? 1 : 0) - this.speakW) * (1 - Math.exp(-dt / 0.25));
    if (this.speakW > 0.001) {
      this.speakPhase += dt;
      const rise = Math.max(0, this.mouth - this.mouthPrev);
      this.nodKick = Math.max(this.nodKick * Math.exp(-dt / 0.18), rise * 9);
      add('angleY', (-this.nodKick + 1.5 * Math.sin(this.speakPhase * 2.3)) * this.speakW);
      add('angleX', 3 * Math.sin(this.speakPhase * 0.9 + 0.7) * this.speakW);
      add('angleZ', 2 * Math.sin(this.speakPhase * 1.3) * this.speakW);
    }
    this.mouthPrev = this.mouth;

    // 3. 情绪：每种情绪一个权重，平滑过渡
    const ek = 1 - Math.exp(-dt / 0.35);
    let eyeMul = 1;
    for (const e of EMOTIONS) {
      const w0 = this.emoW.get(e) || 0;
      const w = w0 + ((e === this.emotion ? 1 : 0) - w0) * ek;
      this.emoW.set(e, w);
      if (w < 0.001) continue;
      for (const [k, v] of Object.entries(EMOTION_POSE[e])) add(k, (v as number) * w);
      if (!this.emotionUsesExpression || e !== this.emotion) {
        for (const [k, v] of Object.entries(EMOTION_FACE[e])) add('face:' + k, (v as number) * w);
      }
      if (EMOTION_EYE[e]) eyeMul *= 1 + ((EMOTION_EYE[e] as number) - 1) * w;
    }

    // 4. 互动动作
    this.applyWave(dt);
    if (this.active) {
      const a = this.active;
      a.t += dt;
      const pose = a.curve(a.t);
      const env = a.name === 'nod' || a.name === 'shake' ? envelope(a.t, a.dur, 0.08, 0.2) : 1;
      for (const [k, v] of Object.entries(pose)) add(k, (v as number) * env);
      if (a.t >= a.dur) {
        this.active = null;
        a.resolve('done');
      }
    }

    // 5. 手动覆盖头部：和自动结果按权重混合
    this.headW += ((this.headOverride ? 1 : 0) - this.headW) * (1 - Math.exp(-dt / 0.18));
    const ho = this.headOverride || { x: 0, y: 0, z: 0 };

    // 平滑后写入
    for (const k of ['angleX', 'angleY', 'angleZ', 'bodyX', 'bodyY', 'bodyZ', 'eyeX', 'eyeY'] as const) {
      let v = out[k] || 0;
      if (this.headW > 0.001 && (k === 'angleX' || k === 'angleY' || k === 'angleZ')) {
        const m = k === 'angleX' ? ho.x : k === 'angleY' ? ho.y : ho.z;
        v = v * (1 - this.headW) + m * this.headW;
      }
      const s = (this.smooth[k] ||= new Smooth(k.startsWith('eye') ? 22 : 15));
      const y = s.step(v, dt);
      if (t.has(P[k])) t.add(P[k], y);
    }
    for (const [k, v] of Object.entries(out)) {
      if (!k.startsWith('face:')) continue;
      const pk = k.slice(5) as keyof typeof P;
      if (t.has(P[pk])) t.add(P[pk], v);
    }

    // 眼睛：情绪倍率 + 手动覆盖（在官方眨眼之后执行，所以眨眼仍然有效）
    this.eyeW += ((this.eyeOverride !== null ? 1 : 0) - this.eyeW) * (1 - Math.exp(-dt / 0.12));
    for (const id of [P.eyeLOpen, P.eyeROpen]) {
      if (!t.has(id)) continue;
      if (Math.abs(eyeMul - 1) > 0.001) t.mul(id, eyeMul);
      if (this.eyeW > 0.001) t.set(id, this.lastEye, this.eyeW);
    }

    // 调试覆盖最后写入
    for (const [id, v] of this.overrides) if (t.has(id)) t.set(id, v, 1);
    for (const [id, v] of this.partOverrides) if (t.hasPart(id)) t.setPart(id, v);
  }

  destroy(): void {
    this.cancelInteraction();
  }
}
