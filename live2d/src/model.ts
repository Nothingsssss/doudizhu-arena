/**
 * Live2DModel：基于官方 CubismUserModel 的模型实现。
 *
 * 负责：读取 model3.json 及其引用的 moc3 / 贴图 / 表情 / 动作 / 物理 / 姿势 / 用户数据，
 * 用官方 CubismUpdateScheduler 组织眨眼、表情、视线、呼吸、物理、口型、姿势的更新顺序，
 * 并通过 CubismRenderer_WebGL 绘制。参数能力在加载后探测，外部调用会先检查模型是否真的有这个参数。
 */
import { CubismDefaultParameterId } from '../framework/src/cubismdefaultparameterid';
import { CubismModelSettingJson } from '../framework/src/cubismmodelsettingjson';
import { ICubismModelSetting } from '../framework/src/icubismmodelsetting';
import { BreathParameterData, CubismBreath } from '../framework/src/effect/cubismbreath';
import { CubismEyeBlink } from '../framework/src/effect/cubismeyeblink';
import { CubismLook, LookParameterData } from '../framework/src/effect/cubismlook';
import { CubismIdHandle } from '../framework/src/id/cubismid';
import { CubismFramework } from '../framework/src/live2dcubismframework';
import { CubismMatrix44 } from '../framework/src/math/cubismmatrix44';
import { CubismMoc } from '../framework/src/model/cubismmoc';
import { CubismUserModel } from '../framework/src/model/cubismusermodel';
import { ACubismMotion } from '../framework/src/motion/acubismmotion';
import { CubismMotion } from '../framework/src/motion/cubismmotion';
import {
  CubismMotionQueueEntryHandle,
  InvalidMotionQueueEntryHandleValue
} from '../framework/src/motion/cubismmotionqueuemanager';
import { CubismUpdateScheduler } from '../framework/src/motion/cubismupdatescheduler';
import { CubismEyeBlinkUpdater } from '../framework/src/motion/cubismeyeblinkupdater';
import { CubismExpressionUpdater } from '../framework/src/motion/cubismexpressionupdater';
import { CubismLookUpdater } from '../framework/src/motion/cubismlookupdater';
import { CubismBreathUpdater } from '../framework/src/motion/cubismbreathupdater';
import { CubismPhysicsUpdater } from '../framework/src/motion/cubismphysicsupdater';
import { CubismPoseUpdater } from '../framework/src/motion/cubismposeupdater';
import { CubismLipSyncUpdater } from '../framework/src/motion/cubismlipsyncupdater';
import { ICubismUpdater } from '../framework/src/motion/icubismupdater';
import { IParameterProvider } from '../framework/src/motion/iparameterprovider';
import { CubismShaderManager_WebGL } from '../framework/src/rendering/cubismshader_webgl';
import { Live2DAssetManager } from './assets';
import { log } from './core';

/** 动作优先级，和官方示例一致：空闲 < 普通 < 强制 */
export const Priority = { None: 0, Idle: 1, Normal: 2, Force: 3 } as const;

export interface ParamInfo {
  id: string;
  min: number;
  max: number;
  def: number;
}

export interface ModelCapabilities {
  params: Map<string, ParamInfo>;
  parts: string[];
  expressions: string[];
  motionGroups: Record<string, number>;
  hasPhysics: boolean;
  hasPose: boolean;
  eyeBlinkIds: string[];
  lipSyncIds: string[];
  mocVersion: number;
  canvas: { width: number; height: number };
}

export interface LoadOptions {
  /** 加载前用官方 API 检查 moc3 一致性（损坏文件会被拒绝） */
  checkMocConsistency?: boolean;
  /** 着色器目录，默认 live2d/shaders/WebGL/ */
  shaderPath?: string;
}

export const idOf = (s: string): CubismIdHandle => CubismFramework.getIdManager().getId(s);
const idStr = (h: CubismIdHandle): string => {
  const v: any = h.getString();
  return typeof v === 'string' ? v : v && typeof v.s === 'string' ? v.s : String(v);
};

export class Live2DModel extends CubismUserModel {
  readonly url: string;
  readonly homeDir: string;
  setting: ICubismModelSetting | null = null;
  caps: ModelCapabilities | null = null;
  ready = false;

  private scheduler = new CubismUpdateScheduler();
  private physicsUpdater: CubismPhysicsUpdater | null = null;
  private lipSyncUpdater: CubismLipSyncUpdater | null = null;
  private motionsLoaded = new Map<string, ACubismMotion>();
  private expressionsLoaded = new Map<string, ACubismMotion>();
  private eyeBlinkIds: CubismIdHandle[] = [];
  private lipSyncIds: CubismIdHandle[] = [];
  private textures: WebGLTexture[] = [];
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private motionUpdated = false;
  private look: CubismLook | null = null;
  private physicsOn = true;
  private shaderPath = 'live2d/shaders/WebGL/';
  private released = false;
  private posePartCache: Set<string> | null = null;
  private pendingMotions: Array<{ h: CubismMotionQueueEntryHandle; key: string; resolve: (ok: boolean) => void }> = [];
  /** 当前播放的 motion 名（group_index），给调试和动画管理器用 */
  currentMotion = '';
  /** 待机组名，按模型实际有的组自动选择 */
  idleGroup = '';
  autoIdleMotion = true;

  constructor(url: string, private assets: Live2DAssetManager) {
    super();
    this.url = url;
    this.homeDir = url.slice(0, url.lastIndexOf('/') + 1);
  }

  private path(file: string): string {
    return this.homeDir + file;
  }

  /** 加载全部资源并创建渲染器。失败时抛错并释放已创建的资源。 */
  async load(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    width: number,
    height: number,
    opts: LoadOptions = {}
  ): Promise<void> {
    this.gl = gl;
    if (opts.shaderPath) this.shaderPath = opts.shaderPath;
    try {
      const settingBuf = await this.assets.fetchBuffer(this.url);
      let parsed: any;
      try {
        parsed = JSON.parse(new TextDecoder().decode(settingBuf));
      } catch (e) {
        throw new Error(`${this.url} 不是有效的 JSON`);
      }
      if (!parsed || !parsed.FileReferences || !parsed.FileReferences.Moc) {
        throw new Error(`${this.url} 不是 model3.json（缺少 FileReferences.Moc）`);
      }
      const setting = new CubismModelSettingJson(settingBuf, settingBuf.byteLength);
      this.setting = setting;

      // moc3
      const mocBuf = await this.assets.fetchBuffer(this.path(setting.getModelFileName()));
      if (opts.checkMocConsistency !== false && !CubismMoc.hasMocConsistency(mocBuf)) {
        throw new Error(`${setting.getModelFileName()} 未通过 moc3 一致性检查（文件损坏或不是 moc3）`);
      }
      const mocVersion = this.getMocVersionFromBuffer(mocBuf);
      const core: any = (window as any).Live2DCubismCore;
      const latest = core.Version.csmGetLatestMocVersion();
      if (mocVersion > latest) {
        throw new Error(`moc3 版本 ${mocVersion} 高于当前 Cubism Core 支持的 ${latest}，请更新 Core`);
      }
      this.loadModel(mocBuf, false);
      if (!this._model) throw new Error('CubismMoc 创建模型失败');

      // 表情
      for (let i = 0; i < setting.getExpressionCount(); i++) {
        const name = setting.getExpressionName(i);
        const file = setting.getExpressionFileName(i);
        const buf = await this.assets.fetchBuffer(this.path(file)).catch((e: Error): null => {
          log('warn', `表情 ${name} 加载失败：${e.message}`);
          return null;
        });
        if (!buf) continue;
        const m = this.loadExpression(buf, buf.byteLength, name);
        if (m) this.expressionsLoaded.set(name, m);
      }
      if (this.expressionsLoaded.size) {
        this.scheduler.addUpdatableList(new CubismExpressionUpdater(this._expressionManager));
      }

      // 物理
      if (setting.getPhysicsFileName()) {
        const buf = await this.assets
          .fetchBuffer(this.path(setting.getPhysicsFileName()))
          .catch((e: Error): null => {
            log('warn', `物理文件加载失败：${e.message}`);
            return null;
          });
        if (buf) {
          this.loadPhysics(buf, buf.byteLength);
          if (this._physics) {
            this.physicsUpdater = new CubismPhysicsUpdater(this._physics);
            this.scheduler.addUpdatableList(this.physicsUpdater);
          }
        }
      }

      // 姿势（手臂切换等）
      if (setting.getPoseFileName()) {
        const buf = await this.assets.fetchBuffer(this.path(setting.getPoseFileName())).catch((): null => null);
        if (buf) {
          this.loadPose(buf, buf.byteLength);
          if (this._pose) this.scheduler.addUpdatableList(new CubismPoseUpdater(this._pose));
        }
      }

      // 用户数据
      if (setting.getUserDataFile()) {
        const buf = await this.assets.fetchBuffer(this.path(setting.getUserDataFile())).catch((): null => null);
        if (buf) this.loadUserData(buf, buf.byteLength);
      }

      this.caps = this.detectCapabilities(mocVersion);

      // 眨眼：model3.json 里配置了 EyeBlink 组才启用
      for (let i = 0; i < setting.getEyeBlinkParameterCount(); i++) {
        this.eyeBlinkIds.push(setting.getEyeBlinkParameterId(i));
      }
      if (this.eyeBlinkIds.length) {
        this._eyeBlink = CubismEyeBlink.create(setting);
        this._eyeBlink.setBlinkingInterval(3.6);
        this._eyeBlink.setBlinkingSetting(0.09, 0.04, 0.12);
        this.scheduler.addUpdatableList(
          new CubismEyeBlinkUpdater(() => this.motionUpdated, this._eyeBlink)
        );
      }

      // 呼吸：只给模型实际存在的参数加
      this._breath = CubismBreath.create();
      const breath: BreathParameterData[] = [];
      const addBreath = (id: string, offset: number, peak: number, cycle: number, weight: number) => {
        if (this.hasParam(id)) breath.push(new BreathParameterData(idOf(id), offset, peak, cycle, weight));
      };
      addBreath(CubismDefaultParameterId.ParamBreath, 0.5, 0.5, 3.2345, 1);
      addBreath(CubismDefaultParameterId.ParamBodyAngleY, 0, 1.2, 3.2345, 0.5);
      this._breath.setParameters(breath);
      this.scheduler.addUpdatableList(new CubismBreathUpdater(this._breath));

      // 口型：model3.json 里 LipSync 组的参数（通常是 ParamMouthOpenY）
      for (let i = 0; i < setting.getLipSyncParameterCount(); i++) {
        this.lipSyncIds.push(setting.getLipSyncParameterId(i));
      }
      if (!this.lipSyncIds.length && this.hasParam(CubismDefaultParameterId.ParamMouthOpenY)) {
        this.lipSyncIds.push(idOf(CubismDefaultParameterId.ParamMouthOpenY));
        log('warn', `${this.url} 没有配置 LipSync 组，改用 ParamMouthOpenY`);
      }
      if (this.lipSyncIds.length) {
        this.lipSyncUpdater = new CubismLipSyncUpdater(this.lipSyncIds, null);
        this.scheduler.addUpdatableList(this.lipSyncUpdater);
      }

      // 视线跟随（拖动 / setLookTarget）
      this.look = CubismLook.create();
      const lp: LookParameterData[] = [];
      const addLook = (id: string, x: number, y: number, xy: number) => {
        if (this.hasParam(id)) lp.push(new LookParameterData(idOf(id), x, y, xy));
      };
      addLook(CubismDefaultParameterId.ParamAngleX, 30, 0, 0);
      addLook(CubismDefaultParameterId.ParamAngleY, 0, 30, 0);
      addLook(CubismDefaultParameterId.ParamAngleZ, 0, 0, -30);
      addLook(CubismDefaultParameterId.ParamBodyAngleX, 10, 0, 0);
      addLook(CubismDefaultParameterId.ParamEyeBallX, 1, 0, 0);
      addLook(CubismDefaultParameterId.ParamEyeBallY, 0, 1, 0);
      this.look.setParameters(lp);
      this.scheduler.addUpdatableList(new CubismLookUpdater(this.look, this._dragManager));

      // 布局
      const layout = new Map<string, number>();
      setting.getLayoutMap(layout);
      this._modelMatrix.setupFromLayout(layout);

      // 动作：全部预加载
      this._model.saveParameters();
      for (let g = 0; g < setting.getMotionGroupCount(); g++) {
        const group = setting.getMotionGroupName(g);
        for (let i = 0; i < setting.getMotionCount(group); i++) {
          const file = setting.getMotionFileName(group, i);
          const buf = await this.assets.fetchBuffer(this.path(file)).catch((e: Error): null => {
            log('warn', `动作 ${group}_${i} 加载失败：${e.message}`);
            return null;
          });
          if (!buf) continue;
          const m = this.loadMotion(buf, buf.byteLength, `${group}_${i}`, null, null, setting, group, i);
          if (m) {
            m.setEffectIds(this.eyeBlinkIds, this.lipSyncIds);
            this.motionsLoaded.set(`${group}_${i}`, m);
          }
        }
      }
      this.idleGroup = this.findGroup(['Idle', 'idle', 'IDLE']) || '';
      this._motionManager.stopAllMotions();

      // 渲染器与贴图
      this.createRenderer(width, height);
      const renderer = this.getRenderer();
      renderer.startUp(gl);
      renderer.setIsPremultipliedAlpha(true);
      for (let i = 0; i < setting.getTextureCount(); i++) {
        const file = setting.getTextureFileName(i);
        if (!file) continue;
        const tex = await this.assets.createTexture(gl, this.path(file));
        this.textures.push(tex);
        renderer.bindTexture(i, tex);
      }
      renderer.loadShaders(this.shaderPath);
      // 官方渲染器会异步 fetch 着色器文件；等它编译完再标记就绪，避免第一帧 "Shader program is not initialized"
      await this.waitShaders(gl);

      this.scheduler.sortUpdatableList();
      this.finalizeCaps();
      this.setInitialized(true);
      this.ready = true;
    } catch (e) {
      this.release();
      throw e;
    }
  }

  private waitShaders(gl: WebGLRenderingContext | WebGL2RenderingContext, timeoutMs = 15000): Promise<void> {
    const shader: any = CubismShaderManager_WebGL.getInstance().getShader(gl as WebGLRenderingContext);
    if (!shader) return Promise.reject(new Error('着色器管理器没有初始化'));
    const t0 = performance.now();
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (this.released) return reject(new Error('模型已释放'));
        if (shader._isShaderLoaded) return resolve();
        if (!shader._isShaderLoading) {
          return reject(new Error(`着色器加载失败，请检查 ${this.shaderPath} 下的 .vert/.frag 文件是否可访问`));
        }
        if (performance.now() - t0 > timeoutMs) return reject(new Error(`着色器加载超时（${this.shaderPath}）`));
        setTimeout(poll, 16);
      };
      poll();
    });
  }

  private detectCapabilities(mocVersion: number): ModelCapabilities {
    const m = this._model;
    const params = new Map<string, ParamInfo>();
    for (let i = 0; i < m.getParameterCount(); i++) {
      const id = idStr(m.getParameterId(i));
      params.set(id, {
        id,
        min: m.getParameterMinimumValue(i),
        max: m.getParameterMaximumValue(i),
        def: m.getParameterDefaultValue(i)
      });
    }
    const parts: string[] = [];
    for (let i = 0; i < m.getPartCount(); i++) parts.push(idStr(m.getPartId(i)));
    const s = this.setting;
    const motionGroups: Record<string, number> = {};
    for (let g = 0; g < s.getMotionGroupCount(); g++) {
      const n = s.getMotionGroupName(g);
      motionGroups[n] = s.getMotionCount(n);
    }
    return {
      params,
      parts,
      expressions: [...this.expressionsLoaded.keys()],
      motionGroups,
      hasPhysics: !!this._physics,
      hasPose: !!this._pose,
      eyeBlinkIds: [],
      lipSyncIds: [],
      mocVersion,
      canvas: { width: m.getCanvasWidth(), height: m.getCanvasHeight() }
    };
  }

  finalizeCaps(): void {
    if (!this.caps) return;
    this.caps.expressions = [...this.expressionsLoaded.keys()];
    this.caps.eyeBlinkIds = this.eyeBlinkIds.map(idStr);
    this.caps.lipSyncIds = this.lipSyncIds.map(idStr);
  }

  hasPart(id: string): boolean {
    return !!this.caps && this.caps.parts.includes(id);
  }
  /** 由 pose3.json 管理的部件（例如手臂 A/B）。这些部件的显示由同名虚拟参数决定，姿势更新器负责淡入淡出 */
  posePartIds(): Set<string> {
    if (this.posePartCache) return this.posePartCache;
    const out = new Set<string>();
    const groups: any[] = (this._pose as any)?._partGroups || [];
    for (const g of groups) if (g && g.partId) out.add(idStr(g.partId));
    this.posePartCache = out;
    return out;
  }
  /** 设置部件可见度：普通部件直接改透明度；姿势部件改它的切换参数（和 motion3 的 PartOpacity 曲线做法一致） */
  setPartOpacity(id: string, v: number): void {
    if (!this.hasPart(id)) return;
    if (this.posePartIds().has(id)) this._model.setParameterValueById(idOf(id), v);
    else this._model.setPartOpacityById(idOf(id), v);
  }
  getPartOpacity(id: string): number {
    if (!this.hasPart(id)) return 0;
    if (this.posePartIds().has(id)) return this._model.getParameterValueById(idOf(id));
    return this._model.getPartOpacityById(idOf(id));
  }
  /** 部件实际透明度（调试显示用） */
  getPartRenderOpacity(id: string): number {
    return this.hasPart(id) ? this._model.getPartOpacityById(idOf(id)) : 0;
  }

  hasParam(id: string): boolean {
    if (this.caps) return this.caps.params.has(id);
    // 加载过程中（caps 还没建好）直接查模型；不能用 getParameterIndex，它会给不存在的 ID 新建虚拟参数
    const m = this._model;
    if (!m) return false;
    for (let i = 0; i < m.getParameterCount(); i++) if (idStr(m.getParameterId(i)) === id) return true;
    return false;
  }

  findGroup(names: string[]): string | null {
    if (!this.setting) return null;
    const all: string[] = [];
    for (let g = 0; g < this.setting.getMotionGroupCount(); g++) all.push(this.setting.getMotionGroupName(g));
    for (const n of names) {
      const hit = all.find((a) => a.toLowerCase() === n.toLowerCase());
      if (hit) return hit;
    }
    return null;
  }

  /** 注册额外的更新器（动画管理器用），按 executionOrder 排序执行 */
  addUpdater(u: ICubismUpdater): void {
    this.scheduler.addUpdatableList(u);
    this.scheduler.sortUpdatableList();
  }

  setAudioProvider(p: IParameterProvider | null): void {
    this.lipSyncUpdater?.setAudioProvider(p);
  }

  hasLipSync(): boolean {
    return !!this.lipSyncUpdater;
  }

  setLookTarget(x: number, y: number): void {
    this._dragManager?.set(x, y);
  }

  setPhysicsEnabled(on: boolean): boolean {
    if (!this.physicsUpdater || !this._physics) return false;
    if (on === this.physicsOn) return true;
    if (on) {
      this._physics.stabilization(this._model);
      this.scheduler.addUpdatableList(this.physicsUpdater);
      this.scheduler.sortUpdatableList();
    } else {
      this.scheduler.removeUpdatableList(this.physicsUpdater);
    }
    this.physicsOn = on;
    return true;
  }

  isPhysicsEnabled(): boolean {
    return !!this.physicsUpdater && this.physicsOn;
  }

  expressionNames(): string[] {
    return [...this.expressionsLoaded.keys()];
  }

  setExpressionByName(name: string): boolean {
    const m = this.expressionsLoaded.get(name);
    if (!m) return false;
    this._expressionManager.startMotion(m, false);
    return true;
  }

  /** 清除表情：让当前表情淡出 */
  clearExpression(): void {
    const mgr: any = this._expressionManager;
    const entries = mgr.getCubismMotionQueueEntries ? mgr.getCubismMotionQueueEntries() : [];
    for (const e of entries) if (e && e.setFadeOut) e.setFadeOut(0.4);
  }

  motionNames(): string[] {
    return [...this.motionsLoaded.keys()];
  }

  /**
   * 播放动作，返回 Promise，动作播完（或被打断）时 resolve(true)，没能开始返回 false。
   * name 是 "组名" 或 "组名_序号"。
   */
  startMotionByName(name: string, priority: number): Promise<boolean> {
    let key = name;
    if (!this.motionsLoaded.has(key)) {
      const n = this.setting ? this.setting.getMotionCount(name) : 0;
      if (n > 0) key = `${name}_${Math.floor(Math.random() * n)}`;
    }
    const motion = this.motionsLoaded.get(key) as CubismMotion | undefined;
    if (!motion) return Promise.resolve(false);
    if (priority === Priority.Force) this._motionManager.setReservePriority(priority);
    else if (!this._motionManager.reserveMotion(priority)) return Promise.resolve(false);
    return new Promise((resolve) => {
      const h: CubismMotionQueueEntryHandle = this._motionManager.startMotionPriority(motion, false, priority);
      if (h === InvalidMotionQueueEntryHandleValue) {
        resolve(false);
        return;
      }
      this.currentMotion = key;
      // 每次播放单独跟踪自己的队列项，同一个动作被重复触发时也不会提前结束
      this.pendingMotions.push({ h, key, resolve });
    });
  }

  stopMotions(): void {
    this._motionManager?.stopAllMotions();
    for (const p of this.pendingMotions) p.resolve(true);
    this.pendingMotions = [];
    this.currentMotion = '';
  }

  getParam(id: string): number {
    return this._model.getParameterValueById(idOf(id));
  }
  setParam(id: string, v: number, weight = 1): void {
    this._model.setParameterValueById(idOf(id), v, weight);
  }
  addParam(id: string, v: number, weight = 1): void {
    this._model.addParameterValueById(idOf(id), v, weight);
  }

  /** 每帧更新：动作 → 保存 → 官方更新器（眨眼/表情/视线/动画管理器/呼吸/物理/口型/姿势）→ 模型 */
  update(dt: number): void {
    if (!this.ready || this.released) return;
    this._model.loadParameters();
    this.motionUpdated = false;
    if (this._motionManager.isFinished()) {
      this.currentMotion = '';
      if (this.autoIdleMotion && this.idleGroup) {
        const n = this.setting.getMotionCount(this.idleGroup);
        if (n > 0) void this.startMotionByName(`${this.idleGroup}_${Math.floor(Math.random() * n)}`, Priority.Idle);
      }
    } else {
      this.motionUpdated = this._motionManager.updateMotion(this._model, dt);
    }
    this._model.saveParameters();
    if (this.pendingMotions.length) {
      this.pendingMotions = this.pendingMotions.filter((p) => {
        if (!this._motionManager.isFinishedByHandle(p.h)) return true;
        if (this.currentMotion === p.key) this.currentMotion = '';
        p.resolve(true);
        return false;
      });
    }
    this.scheduler.onLateUpdate(this._model, dt);
    this._model.update();
  }

  draw(projection: CubismMatrix44, fbo: WebGLFramebuffer | null, viewport: number[]): void {
    if (!this.ready || this.released) return;
    projection.multiplyByMatrix(this._modelMatrix);
    const r = this.getRenderer();
    r.setMvpMatrix(projection);
    r.setRenderState(fbo, viewport);
    r.drawModel(this.shaderPath);
  }

  getModelMatrixRef() {
    return this._modelMatrix;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.ready = false;
    for (const p of this.pendingMotions) p.resolve(false);
    this.pendingMotions = [];
    try {
      this._motionManager?.stopAllMotions();
      this.motionsLoaded.forEach((m) => ACubismMotion.delete(m));
      this.motionsLoaded.clear();
      this.expressionsLoaded.forEach((m) => ACubismMotion.delete(m));
      this.expressionsLoaded.clear();
      if (this.look) CubismLook.delete(this.look);
      this.look = null;
      this.scheduler.release();
      if (this.gl) for (const t of this.textures) this.gl.deleteTexture(t);
      this.textures = [];
      super.release();
    } catch (e) {
      log('warn', `释放模型时出错：${(e as Error).message}`);
    }
    this.gl = null;
  }
}
